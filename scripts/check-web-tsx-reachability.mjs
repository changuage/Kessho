import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const sourceRoot = resolve(root, 'src');
const allowedZeroImportModules = new Set([
  // Deliberate non-component entry points can be added here with an explanation.
]);
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(importer), specifier);
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && !statSync(candidate).isDirectory()) ?? null;
}

const sourceFiles = walk(sourceRoot).filter((file) => sourceExtensions.includes(extname(file)));
const importers = new Map(sourceFiles.map((file) => [file, new Set()]));

for (const importer of sourceFiles) {
  const source = readFileSync(importer, 'utf8');
  const imports = ts.preProcessFile(source, true, true).importedFiles;
  for (const imported of imports) {
    const target = resolveLocalImport(importer, imported.fileName);
    if (target && importers.has(target)) importers.get(target).add(importer);
  }
}

const zeroImportTsx = sourceFiles
  .filter((file) => file.endsWith('.tsx'))
  .filter((file) => importers.get(file).size === 0)
  .map((file) => relative(root, file).split(sep).join('/'))
  .filter((file) => file !== 'src/main.tsx')
  .sort();

const unexpected = zeroImportTsx.filter((file) => !allowedZeroImportModules.has(file));
const staleAllowlist = [...allowedZeroImportModules].filter((file) => !zeroImportTsx.includes(file));

if (unexpected.length > 0 || staleAllowlist.length > 0) {
  if (unexpected.length > 0) {
    console.error(`Unexpected zero-import TSX modules:\n${unexpected.map((file) => `- ${file}`).join('\n')}`);
  }
  if (staleAllowlist.length > 0) {
    console.error(`Stale zero-import TSX allowlist entries:\n${staleAllowlist.map((file) => `- ${file}`).join('\n')}`);
  }
  process.exit(1);
}

console.log(`Web TSX reachability check passed (${sourceFiles.length} source modules, ${zeroImportTsx.length} allowlisted zero-import TSX modules)`);
