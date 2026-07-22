import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function declarationNames(filePath) {
  const source = parseTypeScriptSource(filePath, readFileSync(filePath, 'utf8'));
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
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) names.add(node.name.text);
    if (
      (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node))
      && ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function assertDeclarations(relativePath, names) {
  const filePath = resolve(root, relativePath);
  assert(existsSync(filePath), `${relativePath} is missing`);
  const declarations = declarationNames(filePath);
  for (const name of names) {
    assert(declarations.has(name), `${relativePath} must declare ${name}`);
  }
}

function assertProductUiReferenceBoundary() {
  const violations = [];
  const allowedBoundaryFiles = new Set([
    'src/ui/audioEngineMediaSession.ts',
    'src/ui/sliderSystem/sliderSystem.test.ts',
  ]);
  for (const filePath of collectSourceFiles(resolve(root, 'src/ui'))) {
    const relativePath = relativeSourcePath(root, filePath);
    if (
      relativePath.startsWith('src/ui/referenceRuntime/')
      || relativePath.includes('.test.')
      || allowedBoundaryFiles.has(relativePath)
    ) continue;
    for (const entry of collectImportSpecifiers(filePath)) {
      if (entry.isTypeOnly) continue;
      if (/audio\/reference|useSelectedAudioEngine|SelectedProductRuntime/.test(entry.specifier)) {
        violations.push(`${relativePath}: ${entry.kind} import ${entry.specifier}`);
      }
    }
  }
  assert(violations.length === 0, `background audio Product UI crossed the reference boundary: ${violations.join(', ')}`);
}

assertDeclarations('src/ui/useProductRuntimeBackgroundAudioSupport.ts', ['useProductRuntimeBackgroundAudioSupport']);
assertDeclarations('src/ui/audioEngineMediaSession.ts', ['setupIOSMediaSession', 'connectMediaSessionToWebAudio', 'stopIOSMediaSession']);
assertDeclarations('src/audio/product/browser/ProductBrowserAudioSession.ts', ['ProductBrowserAudioSession', 'setBrowserPlaybackSession']);
assertDeclarations('src/audio/product/scheduling/ProductFrameScheduler.ts', ['ProductFrameScheduler']);
assertDeclarations('src/audio/product/scheduling/ProductRuntimeScheduler.ts', ['ProductRuntimeScheduler']);
assertDeclarations('src/ui/hooks/useDocumentVisibility.ts', ['useDocumentVisibility', 'subscribeToDocumentVisibility']);
assertDeclarations('src/ui/productRuntimeConstruction.ts', ['createProductRuntimeConstruction']);
assertProductUiReferenceBoundary();

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const backgroundAudioScript = packageJson.scripts?.['core:product:background-audio'];
assert(typeof backgroundAudioScript === 'string', 'package.json must expose the executable browser background-audio regression');
for (const requiredToken of [
  'tsx',
  '--test',
  'src/audio/product/browser/ProductBrowserAudioSession.test.ts',
  'src/audio/product/host/CoreProductBackgroundJourneyCoordinator.test.ts',
  'src/ui/useBackgroundJourneyRuntimeSurface.test.ts',
  'scripts/check-kessho-product-background-audio-support.mjs',
]) {
  assert(backgroundAudioScript.includes(requiredToken), `core:product:background-audio must include ${requiredToken}`);
}
const sonicAutonomyTokens = packageJson.scripts?.['core:product:sonic-autonomy']?.split(/\s+/) ?? [];
assert(
  sonicAutonomyTokens.includes('scripts/check-kessho-product-sonic-ownership.mjs'),
  'package.json must expose the sonic ownership behavior/AST gate',
);

execFileSync(process.execPath, ['scripts/check-kessho-product-sonic-ownership.mjs', '--run-tests'], {
  cwd: root,
  stdio: 'inherit',
});

console.log('Kessho Product background audio support checks passed: executable browser/autonomy tests and AST boundaries are green');
