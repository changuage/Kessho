import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = readJson('package.json');
const diagnostics = read('src/audio/product/ProductRuntimeDiagnostics.ts');
const hostDiagnostics = read('src/audio/product/host/CoreProductHostDiagnostics.ts');
const capabilityReport = read('src/audio/product/ProductRuntimeCapabilityReport.ts');
const unsupportedPolicy = read('src/audio/product/host/CoreProductUnsupportedPolicy.ts');
const unsupportedSurfaceDoc = read('docs/product-core/unsupported-surface.md');
const unsupportedAudit = read('scripts/audit-product-host-unsupported-surface.mjs');
const runtimeFallbackGate = read('scripts/check-kessho-product-runtime-fallbacks.mjs');
const browserRuntimeGate = read('scripts/check-kessho-product-browser-runtime.mjs');
const productionInteractionGate = read('scripts/check-kessho-product-production-interactions.mjs');
const granularArtifactGate = read('scripts/check-kessho-product-granular-artifacts.mjs');
const reverbTailQualityGate = read('scripts/check-kessho-product-reverb-tail-quality.mjs');
const cpuScenarioGate = read('scripts/check-kessho-product-cpu-scenarios.mjs');
const cpuGovernorPolicy = read('docs/product-core/product-cpu-governor-policy.md');
const commonControlRouting = read('docs/product-core/common-control-routing.md');
const reportPath = 'docs/reports/kessho-product-unsupported-surface-latest.json';

for (const field of [
  'unsupportedControlCount',
  'unsupportedGetterCount',
  'runtimeFallbackDiagnosticCount',
  'audioCriticalFallbackCount',
  'fullSnapshotReloadCount',
  'dirtyDiffCount',
  'lastUnsupportedMethod',
  'lastUnsupportedMethodClass',
  'lastSnapshotReloadReason',
  'snapshotReloadReasons',
  'snapshotReloadCpuMs',
]) {
  assert(diagnostics.includes(`${field}:`), `ProductRuntimeDiagnostics must expose ${field}`);
  assert(hostDiagnostics.includes(field), `CoreProductHostDiagnostics must track ${field}`);
}

for (const zeroToken of [
  'unsupportedControlCount: 0',
  'unsupportedGetterCount: 0',
  'runtimeFallbackDiagnosticCount: 0',
  'audioCriticalFallbackCount: 0',
  'fullSnapshotReloadCount: 0',
  'dirtyDiffCount: 0',
  'snapshotReloadReasons: []',
]) {
  assert(diagnostics.includes(zeroToken), `EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS must default ${zeroToken}`);
}

for (const token of [
  'this.unsupportedControlCount += 1',
  'this.unsupportedGetterCount += 1',
  'this.runtimeFallbackDiagnosticCount += 1',
  'this.audioCriticalFallbackCount += 1',
  'this.snapshotReloadReasons = [...this.snapshotReloadReasons.slice(-15), reason]',
]) {
  assert(hostDiagnostics.includes(token), `CoreProductHostDiagnostics missing enforcement token ${token}`);
}

for (const token of [
  'KESSHO_PRODUCT_SCHEMA_HASH',
  'KESSHO_PRODUCT_SCHEMA_HASH_HEX',
  'KESSHO_PRODUCT_SCHEMA_VERSION',
  'diagnostics: ProductRuntimeDiagnostics',
  'diagnostics,',
  'supportsNativeBridge: false',
  'legacyFallbackCount: 0',
  'unsupportedMethodCount: 0',
  "nativeBridge: 'deferred-for-web-default'",
]) {
  assert(capabilityReport.includes(token), `ProductRuntimeCapabilityReport missing ${token}`);
}

for (const token of [
  'CoreProductUnsupportedDecision',
  "'replace with product concept'",
  "'delete'",
  "'dev/reference-only'",
  'CORE_PRODUCT_UNSUPPORTED_SURFACE_POLICY',
  'CORE_PRODUCT_UNSUPPORTED_PRODUCTION_FINDING_TARGET = 0',
  'getAllStemNodes',
  'getDynamicsAnalyser',
  'getLimiterNode',
]) {
  assert(unsupportedPolicy.includes(token), `CoreProductUnsupportedPolicy missing ${token}`);
}

for (const legacyMethod of [
  'getAllStemNodes',
  'getRecordableBusNodes',
  'getMediaStream',
  'getDynamicsAnalyser',
  'getDrumVoiceAnalyser',
  'getLimiterNode',
  'getGranularBufferWaveform',
  'getLeadMorphedParams',
  'getEarthTextureDebugState',
]) {
  assert(unsupportedSurfaceDoc.includes(`\`${legacyMethod}\``), `unsupported-surface doc must ledger ${legacyMethod}`);
}

for (const decision of [
  'replace with product concept',
  'delete',
  'dev/reference-only',
]) {
  assert(unsupportedSurfaceDoc.includes(decision), `unsupported-surface doc must include decision category ${decision}`);
}

assert(
  packageJson.scripts?.['migration:unsupported-surface:gate'] === 'node scripts/audit-product-host-unsupported-surface.mjs --write-json --gate',
  'package.json must keep migration:unsupported-surface:gate',
);
assert(
  packageJson.scripts?.['migration:no-unsupported-product-surface'] === 'npm run migration:unsupported-surface:gate',
  'package.json must expose migration:no-unsupported-product-surface',
);
assert(
  packageJson.scripts?.['migration:runtime-production-gates'] === 'node scripts/check-product-runtime-production-gates.mjs',
  'package.json must expose migration:runtime-production-gates',
);
assert(
  packageJson.scripts?.['core:product:production-interactions'] === 'node scripts/check-kessho-product-production-interactions.mjs',
  'package.json must expose core:product:production-interactions',
);
assert(
  packageJson.scripts?.['core:product:granular-artifacts'] === 'node scripts/check-kessho-product-granular-artifacts.mjs',
  'package.json must expose core:product:granular-artifacts',
);
assert(
  packageJson.scripts?.['core:product:reverb-tail-quality'] === 'node scripts/check-kessho-product-reverb-tail-quality.mjs',
  'package.json must expose core:product:reverb-tail-quality',
);
assert(
  packageJson.scripts?.['core:product:cpu-scenarios'] === 'node scripts/check-kessho-product-cpu-scenarios.mjs',
  'package.json must expose core:product:cpu-scenarios',
);
assert(unsupportedAudit.includes('gateViolationCount'), 'unsupported-surface audit must report gateViolationCount');
assert(unsupportedAudit.includes('Product Core audited files must not expose Web Audio node/browser node types'), 'unsupported-surface audit must reject raw Web Audio node surfaces');
assert(unsupportedAudit.includes('Product Core audited files must not enter runtime fallback reporting paths'), 'unsupported-surface audit must reject runtime fallback reports');

for (const token of [
  'unsupportedControlCount === 0',
  'unsupportedGetterCount === 0',
  'runtimeFallbackDiagnosticCount === 0',
  'audioCriticalFallbackCount === 0',
  'assertCleanProbeDiagnostics',
  'captureEarthTextureProbe',
  'assertEarthTextureProbe',
  'runtime-walk-ui',
  'sample-hold-ui',
]) {
  assert(browserRuntimeGate.includes(token), `browser runtime gate must assert ${token}`);
}

for (const token of [
  'earth-texture-ui',
  "const requiredKeys = ['waves', 'birds', 'birds2', 'frogs']",
  'slice.offset > 0',
  'slice.detuneCents',
  'slice.speedMultiplier',
  'distinctPositions.length >= 3',
  'triggerFlashUpdateCount',
  'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_REVERB',
]) {
  assert(productionInteractionGate.includes(token), `production interaction gate must cover ${token}`);
}

for (const token of [
  'kGranularControlSmoothSeconds',
  'WASM granular active module should produce non-zero output',
  'manual-pad-granular-output-delayed-freeze-clean',
  'granularPatch()',
]) {
  assert(granularArtifactGate.includes(token), `granular artifact gate must cover ${token}`);
}

for (const token of [
  'reverbPreconditionerSoftLimit',
  'spectral_freeze_reverb_crossfade',
  'WASM reverb interleaved module should produce a non-zero tail',
  'reverbPatch()',
]) {
  assert(reverbTailQualityGate.includes(token), `reverb tail-quality gate must cover ${token}`);
}

for (const token of [
  '01-default-product-scene',
  '02-earth-texture-scene',
  '03-dense-granular-scene',
  '04-long-ambient-reverb-scene',
  '05-spectral-freeze-scene',
  '06-random-walk-sample-hold-modulation-scene',
  '07-mobile-browser-foreground',
  '09-native-ios-render',
  'Native Product Core render/device evidence is Batch 4 scope.',
]) {
  assert(cpuScenarioGate.includes(token), `CPU scenario gate must cover ${token}`);
}

for (const token of [
  'Desktop governor',
  'Mobile browser governor',
  'Native background governor',
  'Lite under pressure',
  'Browser/mobile background audio is best-effort',
]) {
  assert(cpuGovernorPolicy.includes(token), `CPU governor policy must include ${token}`);
}

assert(!commonControlRouting.includes('| partial |'), 'common-control-routing.md must not retain vague partial status rows');
for (const requiredStatus of ['| ok |', '| allowed |', '| allowed structural snapshot |', '| deferred-ticket |']) {
  assert(commonControlRouting.includes(requiredStatus), `common-control-routing.md must include status ${requiredStatus}`);
}
for (const requiredTicket of [
  'TODO(product-core-control-routing-slider)',
  'TODO(product-core-control-routing-fx)',
  'TODO(product-core-control-routing-morph)',
  'TODO(product-core-control-routing-transport)',
  'TODO(product-core-control-routing-sequencer)',
  'TODO(product-core-control-routing-asset)',
]) {
  assert(commonControlRouting.includes(requiredTicket), `common-control-routing.md must keep ticket ${requiredTicket}`);
}

for (const token of [
  'development fallback throws must increment runtimeFallbackDiagnosticCount',
  'production fallback must increment audioCriticalFallbackCount',
  'guarded retired getters must not increment runtimeFallbackDiagnosticCount',
]) {
  assert(runtimeFallbackGate.includes(token), `runtime fallback gate must cover ${token}`);
}

if (existsSync(resolve(root, reportPath))) {
  const report = readJson(reportPath);
  assert(report.gateMode === true, `${reportPath} must be generated by the gate mode`);
  assert(report.findingCount === 0, `${reportPath} must have zero findings`);
  assert(report.gateViolationCount === 0, `${reportPath} must have zero gate violations`);
}

console.log('Kessho Product runtime production gates passed');
