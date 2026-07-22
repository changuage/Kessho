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
const runBehaviorTests = process.argv.includes('--run-tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function declarationNames(filePath) {
  const source = parseTypeScriptSource(filePath, readFileSync(filePath, 'utf8'));
  const names = new Set();
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function assertDeclarations(relativePath, names) {
  const filePath = resolve(root, relativePath);
  assert(existsSync(filePath), `${relativePath} is missing`);
  const declarations = declarationNames(filePath);
  for (const name of names) assert(declarations.has(name), `${relativePath} must declare ${name}`);
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
  assert(violations.length === 0, `sonic Product UI crossed the reference boundary: ${violations.join(', ')}`);
}

assertDeclarations('src/ui/useProductRuntimeBackgroundAudioSupport.ts', ['useProductRuntimeBackgroundAudioSupport']);
assertDeclarations('src/ui/useProductRuntimeLifecycle.ts', ['useProductRuntimeLifecycle']);
assertDeclarations('src/audio/product/host/CoreProductJourneyMorphClock.ts', ['CoreProductJourneyMorphClock']);
assertProductUiReferenceBoundary();

if (runBehaviorTests) {
  for (const testName of ['ProductJourneyScheduleTests', 'ProductSonicAutonomyTests']) {
    execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', testName], {
      cwd: root,
      stdio: 'inherit',
    });
  }
}

console.log(`Kessho Product sonic ownership checks passed (${runBehaviorTests ? 'behavior tests and AST boundary' : 'AST boundary'})`);
