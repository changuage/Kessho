import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const host = readFileSync(resolve(root, 'src/audio/coreProductEngineHost.ts'), 'utf8');
const hostDebugTelemetry = readFileSync(resolve(root, 'src/audio/CoreProductHostDebugTelemetry.ts'), 'utf8');
const fallbackDiagnostics = readFileSync(resolve(root, 'src/audio/CoreProductFallbackDiagnostics.ts'), 'utf8');
const doc = readFileSync(resolve(root, 'docs/kessho-product-getter-policies.md'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const globalPage = readFileSync(resolve(root, 'src/ui/global/GlobalPage.tsx'), 'utf8');
const granularPage = readFileSync(resolve(root, 'src/ui/granular/GranularPage.tsx'), 'utf8');
const synthPage = readFileSync(resolve(root, 'src/ui/synth/SynthPage.tsx'), 'utf8');
const earthPage = readFileSync(resolve(root, 'src/ui/earth/EarthPage.tsx'), 'utf8');
const activeEarthMatrix = readFileSync(resolve(root, 'src/ui/earth/components/ActiveEarthMatrix.tsx'), 'utf8');

const getters = [
  'getDynamicsAnalyser',
  'getDynamicsVisualTelemetry',
  'getDrumVoiceAnalyser',
  'getGranularActiveGrainCount',
  'getGranularBufferWaveform',
  'getGranularVoicePositions',
  'getGranularWriteHeadPosition',
  'getLeadMorphedParams',
  'getCurrentFilterFreq',
  'getCurrentLfoValue',
  'getCurrentLfo2Value',
  'getRecordableBusNodes',
  'getAllStemNodes',
  'getEarthTextureDebugState',
  'getTransportDebugState',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function methodBody(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*(?:private\\s+)?(?:async\\s+)?${escaped}(?:<[^>]+>)?\\s*\\(`).exec(host);
  assert(definition, `missing getter ${name}()`);
  return balancedBody(host, host.indexOf('{', definition.index), `${name}()`);
}

function helperBody(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*export\\s+function\\s+${escaped}\\s*\\(`).exec(hostDebugTelemetry);
  assert(definition, `missing helper ${name}()`);
  return balancedBody(hostDebugTelemetry, hostDebugTelemetry.indexOf('{', definition.index), `${name}()`);
}

function balancedBody(source, open, label) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`${label} body was not balanced`);
}

for (const token of [
  'type ProductCoreGetterPolicy',
  'CORE_PRODUCT_GETTER_POLICIES',
  "'backed-by-product-core-api'",
  "'explicitly-unsupported-hidden'",
  "'reference-only-web-ts-behavior'",
  "'temporary-missing-product-telemetry'",
]) {
  assert(fallbackDiagnostics.includes(token), `Product Core getter policy code is missing ${token}`);
}

for (const forbidden of ['classifiedPlaceholderGetter', 'PlaceholderGetterClassification', 'CORE_PRODUCT_PLACEHOLDER_GETTER_CLASSIFICATIONS']) {
  assert(!fallbackDiagnostics.includes(forbidden), `Product Core getter policy must not keep ${forbidden}`);
  assert(!host.includes(forbidden), `coreProductEngineHost.ts must not keep ${forbidden}`);
}

const unsupportedGetters = new Set([
  'getDynamicsAnalyser',
  'getDrumVoiceAnalyser',
  'getLeadMorphedParams',
  'getCurrentFilterFreq',
  'getCurrentLfoValue',
  'getCurrentLfo2Value',
  'getCurrentPadFilterFreq',
  'getCurrentPadLfoValue',
  'getRecordableBusNodes',
  'getAllStemNodes',
  'getEarthTextureDebugState',
]);

for (const getter of getters) {
  assert(fallbackDiagnostics.includes(`${getter}: {`), `Product Core getter ${getter} is not classified in code`);
  assert(doc.includes(`\`${getter}\``), `Product Core getter ${getter} is not classified in docs`);
  if (unsupportedGetters.has(getter)) {
    assert(
      methodBody(getter).includes(`return this.unsupportedGetter('${getter}')`),
      `${getter}() must throw through unsupportedGetter() instead of returning a fake value`,
    );
  }
}

assert(
  methodBody('getGranularActiveGrainCount').includes('this.latestTelemetry?.activeGrains'),
  'granular active grain count must use Product Core telemetry instead of a fixed placeholder',
);
assert(
  methodBody('getGranularVoicePositions').includes('this.latestTelemetry?.granularVoicePositions') &&
    methodBody('getGranularVoicePositions').includes('this.normalizedPosition'),
  'granular voice positions must use Product Core granular telemetry instead of a hidden fallback',
);
assert(
  methodBody('getGranularWriteHeadPosition').includes('this.latestTelemetry?.granularWriteHeadPosition') &&
    methodBody('getGranularWriteHeadPosition').includes('this.normalizedPosition'),
  'granular write head must use Product Core granular telemetry instead of a hidden fallback',
);
assert(
  methodBody('getGranularBufferWaveform').includes('return null;'),
  'granular waveform getter must stay a cheap null surface until Product Core exposes an explicit debug waveform API',
);
assert(
  methodBody('getDynamicsVisualTelemetry').includes('this.latestTelemetry') &&
    methodBody('getDynamicsVisualTelemetry').includes('createCoreProductDynamicsVisualTelemetry') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.masterInputPeak') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.masterOutputPeak') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.masterLimiterGainReductionDb') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.dynamicsSaturationDrive'),
  'dynamics visual telemetry must use Product Core master/dynamics telemetry instead of fixed placeholders',
);
assert(
  methodBody('getTransportDebugState').includes('this.latestTelemetry') &&
    methodBody('getTransportDebugState').includes('this.latestProductSnapshot?.transport') &&
    methodBody('getTransportDebugState').includes('createCoreProductTransportDebugState') &&
    helperBody('createCoreProductTransportDebugState').includes('telemetry.beatPosition') &&
    helperBody('createCoreProductTransportDebugState').includes('telemetry.transportRunning'),
  'transport debug state must use Product Core telemetry and generated transport state instead of a fixed placeholder',
);
assert(
  methodBody('getCurrentPadFilterFreq').includes('this.latestTelemetry?.pad1FilterFreq') &&
    methodBody('getCurrentPadFilterFreq').includes('this.latestTelemetry?.pad2FilterFreq'),
  'Pad filter frequency getter must use Product Core Pad telemetry instead of a hidden fallback',
);
assert(
  methodBody('getCurrentPadLfoValue').includes('this.latestTelemetry?.pad1Lfo1Value') &&
    methodBody('getCurrentPadLfoValue').includes('this.latestTelemetry?.pad2Lfo1Value'),
  'Pad LFO getter must use Product Core Pad telemetry instead of a hidden fallback',
);
assert(
  methodBody('unsupportedGetter').includes('this.reportRuntimeFallback(method, classification)') &&
    methodBody('unsupportedGetter').includes('throw new Error(`AudioEngine.${method} is not implemented by core-product`)'),
  'unsupportedGetter() must increment runtime diagnostics and throw instead of returning fake Product Core values',
);
assert(
  app.includes("const stemRecordingAvailable = audioEngineRuntimeMode !== 'core-product';") &&
    app.includes('const enabledStemIds = stemRecordingAvailable') &&
    app.includes("if (audioEngineRuntimeMode === 'core-product') return;"),
  'core-product must block stem recording calls that require Web Audio bus nodes',
);
assert(
  globalPage.includes("const stemRecordingAvailable = audioEngineMode !== 'core-product';") &&
    globalPage.includes('{stemRecordingAvailable && (') &&
    globalPage.includes('STEM_RECORD_TRACK_IDS.map'),
  'core-product UI must hide stem recording controls when stem nodes are unsupported',
);
assert(
  app.includes('liveBufferTelemetryAvailable') &&
    !app.includes("liveBufferTelemetryAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    granularPage.includes('liveBufferTelemetryAvailable?: boolean;') &&
    granularPage.includes('if (!liveBufferTelemetryAvailable) return;') &&
    granularPage.includes('{liveBufferTelemetryAvailable && ('),
  'core-product UI must enable granular live head/voice telemetry while preserving the telemetry availability guard',
);
assert(
  app.includes("getDynamicsAnalyser={audioEngineRuntimeMode === 'core-product' ? undefined") &&
    app.includes("getAnalyserNode={audioEngineRuntimeMode === 'core-product' ? () => undefined"),
  'core-product UI must not request Web Audio analyser nodes for dynamics or drum visuals',
);
assert(
  app.includes('liveSourceTelemetryAvailable') &&
    !app.includes("liveSourceTelemetryAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    synthPage.includes('liveSourceTelemetryAvailable?: boolean;') &&
    synthPage.includes('if (!liveSourceTelemetryAvailable) return;') &&
    synthPage.includes('enabled: isRunning && liveSourceTelemetryAvailable') &&
    synthPage.includes('isRunning={isRunning && liveSourceTelemetryAvailable}'),
  'core-product Synth UI must enable Pad filter/LFO polling while preserving the telemetry availability guard',
);
assert(
  app.includes("getLeadMorphedParams={audioEngineRuntimeMode === 'core-product' ? () => null"),
  'core-product Synth UI must not request host-owned Lead morphed preview params until Product Core exposes resolved Lead telemetry',
);
assert(
  app.includes("audioEngineRuntimeMode === 'core-product'") &&
    app.includes('EMPTY_EARTH_TEXTURE_DEBUG_STATE') &&
    app.includes("textureDebugAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    earthPage.includes('textureDebugAvailable?: boolean;') &&
    activeEarthMatrix.includes('textureDebugAvailable?: boolean;') &&
    activeEarthMatrix.includes('enabled: textureDebugAvailable && activeTextureDebugKeys.length > 0') &&
    activeEarthMatrix.includes('row.textureDebugKey && textureDebugAvailable'),
  'core-product Earth UI must disable soundscape texture debug polling until Product Core exposes soundscape layer telemetry',
);

for (const classification of [
  '`backed-by-product-core-api`',
  '`explicitly-unsupported-hidden`',
  '`reference-only-web-ts-behavior`',
  '`temporary-missing-product-telemetry`',
]) {
  assert(doc.includes(classification), `Product Core getter policy docs are missing classification ${classification}`);
}

console.log('Kessho Product getter policy checks passed');
