import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const sourceRoot = resolve(root, 'src');
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];

// Runtime entries are declared from the actual Vite/runtime wiring. Test files are
// discovered separately so test-only support is never treated as production code.
export const entryGroups = {
  production: ['src/main.tsx'],
  workers: ['src/audio/recording/exportRecorder.worker.ts'],
  platform: [],
  // Vite's production alias swaps this module into the runtime graph.
  alternate: ['src/audio/referenceAudioRuntime.unavailable.ts'],
  // Static smoke/benchmark entry points are test support, never production.
  testSupport: [
    'src/native/midi/nativeMidiAdapter.ios.ts',
    'src/presets/presetContentGraphBenchmark.ts',
  ],
};

export const allowedDisconnectedProductionModules = new Set([
  // Explicit reference-only compatibility boundaries; never reachable from the Product shell.
  'src/audio/reference/ReferenceAudioEngineDebugCompat.ts',
  'src/ui/audioEngineMediaSession.ts',
]);

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function isSourceFile(file) {
  return sourceExtensions.some((extension) => file.endsWith(extension)) && !file.endsWith('.d.ts');
}

export function isTestFile(file) {
  return /(^|[\\/])(__tests?|testSupport)([\\/]|$)|(?:^|[.])(test|spec)[.]|[\\/]test[s]?[\\/]/.test(file);
}

function parseModuleSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : fileName.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS,
  );
  const specifiers = [];

  function addSpecifier(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addSpecifier(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addSpecifier(node.arguments[0]);
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        addSpecifier(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function readPathAliases(projectRoot) {
  const configPath = resolve(projectRoot, 'tsconfig.json');
  if (!existsSync(configPath)) return [];
  const parsed = ts.readConfigFile(configPath, (file) => readFileSync(file, 'utf8'));
  if (parsed.error) return [];
  const compilerOptions = ts.parseJsonConfigFileContent(parsed.config, ts.sys, projectRoot).options;
  return Object.entries(compilerOptions.paths ?? {}).flatMap(([pattern, targets]) => {
    if (!Array.isArray(targets)) return [];
    return targets.map((target) => ({ pattern, target, baseUrl: compilerOptions.baseUrl ?? projectRoot }));
  });
}

function aliasTarget(specifier, aliases) {
  for (const alias of aliases) {
    const starIndex = alias.pattern.indexOf('*');
    if (starIndex < 0) {
      if (specifier === alias.pattern) return resolve(alias.baseUrl, alias.target);
      continue;
    }
    const prefix = alias.pattern.slice(0, starIndex);
    const suffix = alias.pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
    return resolve(alias.baseUrl, alias.target.replace('*', wildcard));
  }
  return null;
}

function candidatePaths(base) {
  const hasKnownExtension = sourceExtensions.some((extension) => base.endsWith(extension));
  const direct = hasKnownExtension ? [base] : [];
  const extensionless = hasKnownExtension ? [base.slice(0, -extname(base).length)] : [base];
  return [
    ...direct,
    ...extensionless.flatMap((path) => sourceExtensions.map((item) => `${path}${item}`)),
    ...extensionless.flatMap((path) => sourceExtensions.map((item) => join(path, `index${item}`))),
  ];
}

export function resolveLocalImport(importer, specifier, aliases = []) {
  const base = specifier.startsWith('.')
    ? resolve(dirname(importer), specifier)
    : aliasTarget(specifier, aliases);
  if (!base) return null;
  return candidatePaths(base).find((candidate) => existsSync(candidate) && !statSync(candidate).isDirectory()) ?? null;
}

function normalize(rootPath, file) {
  return relative(rootPath, file).split(sep).join('/');
}

export function analyzeReachability({
  projectRoot = root,
  sourceDirectory = resolve(projectRoot, 'src'),
  groups = entryGroups,
  allowedDisconnected = allowedDisconnectedProductionModules,
} = {}) {
  const files = walk(sourceDirectory).filter(isSourceFile);
  const fileSet = new Set(files);
  const aliases = readPathAliases(projectRoot);
  const graph = new Map(files.map((file) => [file, new Set()]));

  for (const importer of files) {
    const source = readFileSync(importer, 'utf8');
    for (const specifier of parseModuleSpecifiers(source, importer)) {
      const target = resolveLocalImport(importer, specifier, aliases);
      if (target && fileSet.has(target)) graph.get(importer).add(target);
    }
  }

  function visit(entry, reachable) {
    const absoluteEntry = resolve(projectRoot, entry);
    if (!fileSet.has(absoluteEntry)) throw new Error(`Declared entry does not exist: ${entry}`);
    if (reachable.has(absoluteEntry)) return;
    reachable.add(absoluteEntry);
    for (const target of graph.get(absoluteEntry) ?? []) visit(normalize(projectRoot, target), reachable);
  }

  function visitGroup(entries) {
    const reachable = new Set();
    for (const entry of entries) visit(entry, reachable);
    return reachable;
  }

  const runtimeReachable = new Set([
    ...visitGroup(groups.production ?? []),
    ...visitGroup(groups.workers ?? []),
    ...visitGroup(groups.platform ?? []),
    ...visitGroup(groups.alternate ?? []),
  ]);
  const testEntries = files.filter(isTestFile).map((file) => normalize(projectRoot, file));
  const testReachable = new Set([
    ...visitGroup(testEntries),
    ...visitGroup(groups.testSupport ?? []),
  ]);
  const disconnected = files
    .filter((file) => !runtimeReachable.has(file) && !isTestFile(file))
    .map((file) => normalize(projectRoot, file))
    .sort();
  const testOnly = files
    .filter((file) => !runtimeReachable.has(file) && testReachable.has(file) && !isTestFile(file))
    .map((file) => normalize(projectRoot, file))
    .sort();
  const staleAllowlist = [...allowedDisconnected].filter((file) => !disconnected.includes(file)).sort();
  const unexpectedDisconnected = disconnected
    .filter((file) => !testOnly.includes(file))
    .filter((file) => !allowedDisconnected.has(file));

  return {
    files,
    runtimeReachable,
    testReachable,
    disconnected,
    testOnly,
    staleAllowlist,
    unexpectedDisconnected,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = analyzeReachability();
  if (result.unexpectedDisconnected.length > 0 || result.staleAllowlist.length > 0) {
    if (result.unexpectedDisconnected.length > 0) {
      console.error(`Disconnected runtime source modules:\n${result.unexpectedDisconnected.map((file) => `- ${file}`).join('\n')}`);
    }
    if (result.staleAllowlist.length > 0) {
      console.error(`Stale disconnected-module allowlist entries:\n${result.staleAllowlist.map((file) => `- ${file}`).join('\n')}`);
    }
    process.exit(1);
  }
  const testSupportMessage = result.testOnly.length > 0
    ? `, ${result.testOnly.length} test-support-only`
    : '';
  console.log(`AST source reachability check passed (${result.files.length} source modules, ${result.runtimeReachable.size} runtime-reachable, ${result.testReachable.size} test-reachable${testSupportMessage})`);
}
