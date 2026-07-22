import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import {
  collectImportSpecifiers,
  collectSourceFiles,
  parseTypeScriptSource,
  relativeSourcePath,
} from './lib/sourceArchitectureRules.mjs';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readSource(relativePath) {
  const filePath = resolve(root, relativePath);
  assert(existsSync(filePath), `${relativePath} is missing`);
  return {
    filePath,
    source: readFileSync(filePath, 'utf8'),
    ast: parseTypeScriptSource(filePath, readFileSync(filePath, 'utf8')),
  };
}

function declarationNames(ast) {
  const names = new Set();
  const visit = (node) => {
    if (
      (ts.isFunctionDeclaration(node)
        || ts.isClassDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isTypeAliasDeclaration(node)
        || ts.isEnumDeclaration(node))
      && node.name
    ) {
      names.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
    if (
      (ts.isMethodDeclaration(node)
        || ts.isMethodSignature(node)
        || ts.isPropertyDeclaration(node)
        || ts.isPropertySignature(node)
        || ts.isPropertyAssignment(node))
      && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return names;
}

function assertDeclarations(relativePath, names) {
  const { ast } = readSource(relativePath);
  const declarations = declarationNames(ast);
  for (const name of names) {
    assert(declarations.has(name), `${relativePath} must expose the ${name} declaration`);
  }
}

function findRuntimeBoundaryImports() {
  const violations = [];
  for (const filePath of collectSourceFiles(resolve(root, 'src'))) {
    const relativePath = relativeSourcePath(root, filePath);
    if (relativePath.startsWith('src/audio/reference/') || relativePath.startsWith('src/ui/referenceRuntime/')) continue;
    for (const entry of collectImportSpecifiers(filePath)) {
      if (entry.isTypeOnly) continue;
      if (/useSelectedAudioEngine|SelectedProductRuntime/.test(entry.specifier)) {
        violations.push(`${relativePath}: ${entry.kind} import ${entry.specifier}`);
      }
    }
  }
  return violations;
}

const requiredDeclarations = [
  ['src/audio/product/liveNoteEvents.ts', ['ProductLiveNoteEvent']],
  ['src/native/midi/midiLiveNoteAdapter.ts', [
    'midiChannelToProductLiveNoteInstrument',
    'midiLiveNoteInputId',
    'midiMessageToProductLiveNoteEvent',
  ]],
  ['src/audio/product/ports/ProductCommandPort.ts', ['ProductEngineCommandPort', 'enqueueLiveNoteEvent']],
  ['src/audio/product/WebProductEngine.ts', ['enqueueLiveNoteEvent']],
  ['src/audio/product/host/CoreProductRuntimeHostPort.ts', ['enqueueLiveNoteEvent']],
  ['src/audio/coreProductEngineHost.ts', ['enqueueLiveNoteEvent']],
  ['src/audio/CoreProductHostMidi.ts', ['createCoreProductLiveNoteEvent']],
  ['src/ui/keyboard/liveNoteInput.ts', ['LiveNoteInputController', 'noteOn', 'noteOff']],
];

for (const [relativePath, names] of requiredDeclarations) {
  assertDeclarations(relativePath, names);
}

assert(
  !existsSync(resolve(root, 'src/audio/product/SelectedProductRuntime.ts')),
  'retired SelectedProductRuntime must remain deleted',
);
const boundaryViolations = findRuntimeBoundaryImports();
assert(
  boundaryViolations.length === 0,
  `live-note production path imports a retired/reference runtime: ${boundaryViolations.join(', ')}`,
);

const behavior = spawnSync(process.execPath, ['scripts/run-live-note-input-regression.mjs'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
assert(behavior.status === 0, `live-note executable regression failed with exit code ${behavior.status ?? 'unknown'}`);

console.log('live note contract check passed: executable lifecycle behavior and AST Product boundary are green');
