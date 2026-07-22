import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collectImportSpecifiers,
  collectSourceFiles,
  relativeSourcePath,
} from './lib/sourceArchitectureRules.mjs';
import {
  assert,
  loadCoreProductHostHarness,
  loadFallbackDiagnosticsHarness,
} from './lib/kesshoProductBehaviorHarness.mjs';

const root = process.cwd();

const getterNames = [
  'getDynamicsVisualTelemetry',
  'getGranularActiveGrainCount',
  'getGranularVoicePositions',
  'getGranularWriteHeadPosition',
  'getCurrentPadFilterFreq',
  'getCurrentPadLfoValue',
  'getTransportDebugState',
];

const allowedReferenceImportFiles = new Set([
  'src/ui/audioEngineMediaSession.ts',
  'src/ui/sliderSystem/sliderSystem.test.ts',
]);

function findProductionReferenceImports() {
  const violations = [];
  for (const filePath of collectSourceFiles(resolve(root, 'src/ui'))) {
    const relativePath = relativeSourcePath(root, filePath);
    if (relativePath.startsWith('src/ui/referenceRuntime/') || allowedReferenceImportFiles.has(relativePath)) continue;
    for (const entry of collectImportSpecifiers(filePath)) {
      if (entry.isTypeOnly) continue;
      if (/audio\/reference|useSelectedAudioEngine|SelectedProductRuntime/.test(entry.specifier)) {
        violations.push(`${relativePath}: ${entry.kind} import ${entry.specifier}`);
      }
    }
  }
  return violations;
}

function assertFinite(value, label) {
  assert(Number.isFinite(value), `${label} must be finite, received ${String(value)}`);
}

const deletedSelectedModules = [
  'src/ui/useSelectedAudioEngineDebugSurface.ts',
  'src/ui/useSelectedAudioEngineDebugRuntime.ts',
  'src/ui/useSelectedAudioEngineRuntimeSurfaces.ts',
  'src/ui/useSelectedAudioEnginePageRuntimeBridges.ts',
  'src/ui/useSelectedAudioEngineRecordingRuntime.ts',
];
for (const path of deletedSelectedModules) {
  assert(!existsSync(resolve(root, path)), `${path} must remain deleted`);
}

const importViolations = findProductionReferenceImports();
assert(importViolations.length === 0, `Product UI reference imports crossed the development boundary: ${importViolations.join(', ')}`);

const diagnostics = loadFallbackDiagnosticsHarness();
for (const getter of getterNames) {
  assert(Object.hasOwn(diagnostics.CORE_PRODUCT_GETTER_POLICIES, getter), `Product getter policy is missing ${getter}`);
  assert(
    diagnostics.classifyCoreProductRuntimeFallback(getter) === 'forbidden-production-fallback',
    `${getter} must fail visibly when unavailable`,
  );
}

const harness = loadCoreProductHostHarness({ dev: true });
const engine = harness.host;
engine.latestTelemetry = {
  activeGrains: 7,
  granularVoicePositions: [0.1, 0.2, 0.3, 0.4],
  granularWriteHeadPosition: 0.6,
  pad1FilterFreq: 1234,
  pad2FilterFreq: 2345,
  pad1Lfo1Value: 0.12,
  pad2Lfo1Value: 0.34,
  masterInputPeak: 0.2,
  masterOutputPeak: 0.3,
  masterLimiterGainReductionDb: 1,
  transportRunning: false,
};
engine.latestProductSnapshot = {
  transport: { bpm: 120 },
};
assert(engine.getGranularActiveGrainCount() === 7, 'granular active-grain getter did not return Product telemetry');
assert(JSON.stringify(engine.getGranularVoicePositions()) === JSON.stringify([0.1, 0.2, 0.3, 0.4]), 'granular voice getter did not return Product telemetry');
assert(engine.getGranularWriteHeadPosition() === 0.6, 'granular write-head getter did not return Product telemetry');
assert(engine.getCurrentPadFilterFreq('pad1') === 1234, 'Pad filter getter did not return Product telemetry');
assert(engine.getCurrentPadLfoValue('pad2') === 0.34, 'Pad LFO getter did not return Product telemetry');
assertFinite(engine.getDynamicsVisualTelemetry().worklet?.outputPeak, 'dynamics telemetry output peak');
assert(engine.getTransportDebugState() !== null, 'transport debug getter did not return Product transport telemetry');
assert(typeof engine.getDynamicsAnalyser === 'undefined', 'Product host must not expose reference analyser getters');
assert(typeof engine.getDrumVoiceAnalyser === 'undefined', 'Product host must not expose reference analyser getters');
assert(typeof engine.getMediaStream === 'undefined', 'Product host must not expose reference recording getters');
assert(typeof engine.getRecordableBusNodes === 'undefined', 'Product host must not expose reference recording getters');

console.log('Kessho Product getter policy checks passed: AST boundary and Product telemetry behavior are green');
