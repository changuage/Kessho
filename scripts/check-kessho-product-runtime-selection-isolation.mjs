import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  collectImportSpecifiers,
  collectSourceFiles,
  parseTypeScriptSource,
  relativeSourcePath,
} from './lib/sourceArchitectureRules.mjs';

const root = process.cwd();
const explicitBoundaryFiles = new Set([
  'src/audio/coreEngineHost.ts',
  'src/audio/referenceAudioRuntime.ts',
  'src/audio/referenceAudioRuntime.unavailable.ts',
  'src/audio/product/ProductAudioRuntimeSelection.ts',
  'src/audio/sonicParityHarness.ts',
  'src/ui/audioEngineMediaSession.ts',
  'src/ui/sliderSystem/sliderSystem.test.ts',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectNamedDeclarations(filePath) {
  const source = parseTypeScriptSource(filePath, readFileSync(filePath, 'utf8'));
  const names = new Set();
  const visit = (node) => {
    if (
      (ts.isFunctionDeclaration(node)
        || ts.isClassDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isTypeAliasDeclaration(node))
      && node.name
    ) {
      names.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function isExplicitBoundary(relativePath) {
  return explicitBoundaryFiles.has(relativePath)
    || relativePath.startsWith('src/audio/reference/')
    || relativePath.startsWith('src/ui/referenceRuntime/')
    || relativePath.startsWith('src/ui/useSelectedAudioEngine')
    || relativePath.includes('.test.');
}

const violations = [];
for (const filePath of collectSourceFiles(resolve(root, 'src'))) {
  const relativePath = relativeSourcePath(root, filePath);
  if (isExplicitBoundary(relativePath)) continue;
  for (const entry of collectImportSpecifiers(filePath)) {
    if (entry.isTypeOnly) continue;
    if (/useSelectedAudioEngine|SelectedProductRuntime|(?:^|\/)audio\/reference(?:\/|$)/.test(entry.specifier)) {
      violations.push(`${relativePath}: ${entry.kind} import ${entry.specifier}`);
    }
  }
}

const productProxyPath = resolve(root, 'src/audio/product/ProductEngineProxy.ts');
assert(existsSync(productProxyPath), 'ProductEngineProxy.ts is missing');
const productProxyImports = collectImportSpecifiers(productProxyPath);
assert(
  productProxyImports.every((entry) => !/reference|SelectedProductRuntime|useSelectedAudioEngine/.test(entry.specifier)),
  'ProductEngineProxy must not import a reference or selected runtime',
);
const productProxyDeclarations = collectNamedDeclarations(productProxyPath);
for (const name of ['getProductEngineRuntimeMode', 'loadProductEngine', 'productEngine']) {
  assert(productProxyDeclarations.has(name), `ProductEngineProxy must expose ${name}`);
}

assert(
  !existsSync(resolve(root, 'src/audio/product/SelectedProductRuntime.ts')),
  'retired SelectedProductRuntime must remain deleted',
);
assert(violations.length === 0, `runtime selection isolation violations: ${violations.join(', ')}`);

console.log(`runtime selection isolation guard passed (${collectSourceFiles(resolve(root, 'src')).length} source files inspected)`);
