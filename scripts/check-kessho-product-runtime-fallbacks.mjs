import fs from 'node:fs';
import path from 'node:path';
import {
  collectImportSpecifiers,
  collectSourceFiles,
  relativeSourcePath,
} from './lib/sourceArchitectureRules.mjs';
import {
  addEvidence,
  assert,
  loadCoreProductHostHarness,
  loadFallbackDiagnosticsHarness,
  runCheckWithReport,
} from './lib/kesshoProductBehaviorHarness.mjs';

const root = process.cwd();

function isExplicitReferenceBoundary(relativePath) {
  return relativePath.startsWith('src/ui/referenceRuntime/') || relativePath.startsWith('src/audio/reference/');
}

function findForbiddenProductImports() {
  const allowedBoundaryFiles = new Set([
    'src/ui/audioEngineMediaSession.ts',
    'src/ui/useAudioEngineParamSync.ts',
    'src/ui/sliderSystem/sliderSystem.test.ts',
  ]);
  const sourceFiles = collectSourceFiles(path.join(root, 'src/ui'));
  const violations = [];
  for (const filePath of sourceFiles) {
    const relativePath = relativeSourcePath(root, filePath);
    if (isExplicitReferenceBoundary(relativePath) || allowedBoundaryFiles.has(relativePath)) continue;
    for (const entry of collectImportSpecifiers(filePath)) {
      if (entry.isTypeOnly) continue;
      if (/audio\/reference|useSelectedAudioEngine|SelectedProductRuntime/.test(entry.specifier)) {
        violations.push(`${relativePath}: ${entry.kind} import ${entry.specifier}`);
      }
    }
  }
  return violations;
}

function expectMissingProductCapability(host, capability) {
  let error = null;
  try {
    host[capability]();
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  assert(error, `missing Product capability ${capability} did not fail visibly`);
  assert(error.message.indexOf(capability) >= 0, `missing Product capability ${capability} reported the wrong error: ${error.message}`);
}

await runCheckWithReport({
  scriptUrl: import.meta.url,
  reportName: 'kessho-product-runtime-fallbacks-latest.json',
  run: async (report) => {
    const importViolations = findForbiddenProductImports();
    assert(importViolations.length === 0, `Product UI imports retired/reference runtime modules: ${importViolations.join(', ')}`);

    const diagnostics = loadFallbackDiagnosticsHarness();
    assert(
      diagnostics.classifyCoreProductRuntimeFallback('getCurrentFilterFreq') === 'forbidden-production-fallback',
      'missing Product getter classification must be forbidden at runtime',
    );
    assert(
      diagnostics.classifyCoreProductRuntimeFallback('setCurrentFilterFreq') === 'forbidden-production-fallback',
      'missing Product setter classification must be forbidden at runtime',
    );

    const developmentHarness = loadCoreProductHostHarness({ dev: true });
    expectMissingProductCapability(developmentHarness.coreProductEngineHost, 'getCurrentFilterFreq');
    const developmentDiagnostics = developmentHarness.host.getProductRuntimeDiagnostics();
    assert(
      developmentDiagnostics.audioCriticalFallbackCount === 1,
      `development missing getter did not increment audio-critical diagnostics: ${JSON.stringify(developmentDiagnostics)}`,
    );
    assert(
      developmentDiagnostics.lastUnsupportedMethod === 'getCurrentFilterFreq',
      'development diagnostics did not identify the missing getter',
    );

    const productionHarness = loadCoreProductHostHarness({ dev: false });
    expectMissingProductCapability(productionHarness.coreProductEngineHost, 'getCurrentFilterFreq');
    const productionDiagnostics = productionHarness.host.getProductRuntimeDiagnostics();
    assert(
      productionDiagnostics.audioCriticalFallbackCount === 1,
      `production missing getter did not increment audio-critical diagnostics: ${JSON.stringify(productionDiagnostics)}`,
    );

    addEvidence(report, {
      id: 'runtime-fallback-behavior',
      summary: 'Missing Product getter behavior throws and records an audio-critical diagnostic in development and production harnesses.',
      details: {
        development: developmentDiagnostics,
        production: productionDiagnostics,
      },
    });
    addEvidence(report, {
      id: 'runtime-boundary-ast',
      summary: 'Production UI reference/runtime imports are checked from the TypeScript import AST.',
      details: { inspectedProductUiFiles: collectSourceFiles(path.join(root, 'src/ui')).length },
    });
  },
});

console.log('Kessho Product runtime fallback checks passed');
