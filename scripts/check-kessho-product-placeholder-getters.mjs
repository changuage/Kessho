import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const host = readFileSync(resolve(root, 'src/audio/coreProductEngineHost.ts'), 'utf8');
const fallbackDiagnostics = readFileSync(resolve(root, 'src/audio/CoreProductFallbackDiagnostics.ts'), 'utf8');
const doc = readFileSync(resolve(root, 'docs/kessho-product-placeholder-getter-classification.md'), 'utf8');
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
  'getCurrentPadFilterFreq',
  'getCurrentPadLfoValue',
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
  const definition = new RegExp(`(?:^|\\n)\\s*(?:private\\s+)?(?:async\\s+)?${escaped}\\s*\\(`).exec(host);
  assert(definition, `missing getter ${name}()`);
  const open = host.indexOf('{', definition.index);
  let depth = 0;
  for (let index = open; index < host.length; index += 1) {
    const char = host[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return host.slice(open + 1, index);
    }
  }
  throw new Error(`${name}() body was not balanced`);
}

for (const token of [
  'type PlaceholderGetterClassification',
  'CORE_PRODUCT_PLACEHOLDER_GETTER_CLASSIFICATIONS',
  'classifiedPlaceholderGetter<T>',
  "'backed-by-product-core-api'",
  "'explicitly-unsupported-hidden'",
  "'reference-only-web-ts-behavior'",
  "'temporary-missing-product-telemetry'",
]) {
  assert(fallbackDiagnostics.includes(token), `placeholder getter classification code is missing ${token}`);
}

for (const getter of getters) {
  assert(fallbackDiagnostics.includes(`${getter}: {`), `placeholder getter ${getter} is not classified in code`);
  assert(doc.includes(`\`${getter}\``), `placeholder getter ${getter} is not classified in docs`);
  assert(
    host.includes(`classifiedPlaceholderGetter('${getter}'`) ||
      (getter === 'getGranularActiveGrainCount' && host.includes('this.latestTelemetry?.activeGrains')) ||
      (getter === 'getDynamicsVisualTelemetry' && host.includes('telemetry.masterLimiterGainReductionDb')) ||
      (getter === 'getTransportDebugState' && host.includes('telemetry.beatPosition')),
    `${getter}() must use the classified placeholder helper or Product Core telemetry`,
  );
}

assert(
  methodBody('getGranularActiveGrainCount').includes('this.latestTelemetry?.activeGrains'),
  'granular active grain count must use Product Core telemetry instead of a fixed placeholder',
);
assert(
  methodBody('getDynamicsVisualTelemetry').includes('telemetry.masterInputPeak') &&
    methodBody('getDynamicsVisualTelemetry').includes('telemetry.masterOutputPeak') &&
    methodBody('getDynamicsVisualTelemetry').includes('telemetry.masterLimiterGainReductionDb') &&
    methodBody('getDynamicsVisualTelemetry').includes('telemetry.dynamicsSaturationDrive'),
  'dynamics visual telemetry must use Product Core master/dynamics telemetry instead of fixed placeholders',
);
assert(
  methodBody('getTransportDebugState').includes('telemetry.beatPosition') &&
    methodBody('getTransportDebugState').includes('telemetry.transportRunning') &&
    methodBody('getTransportDebugState').includes('this.latestProductSnapshot?.transport'),
  'transport debug state must use Product Core telemetry and generated transport state instead of a fixed placeholder',
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
  app.includes("liveBufferTelemetryAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    granularPage.includes('liveBufferTelemetryAvailable?: boolean;') &&
    granularPage.includes('if (!liveBufferTelemetryAvailable) return;') &&
    granularPage.includes('{liveBufferTelemetryAvailable && ('),
  'core-product UI must hide granular live buffer waveform/write-head/voice-position surfaces when those telemetry getters are unsupported',
);
assert(
  app.includes("getDynamicsAnalyser={audioEngineRuntimeMode === 'core-product' ? undefined") &&
    app.includes("getAnalyserNode={audioEngineRuntimeMode === 'core-product' ? () => undefined"),
  'core-product UI must not request Web Audio analyser nodes for dynamics or drum visuals',
);
assert(
  app.includes("liveSourceTelemetryAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    synthPage.includes('liveSourceTelemetryAvailable?: boolean;') &&
    synthPage.includes('if (!liveSourceTelemetryAvailable) return;') &&
    synthPage.includes('enabled: isRunning && liveSourceTelemetryAvailable') &&
    synthPage.includes('isRunning={isRunning && liveSourceTelemetryAvailable}'),
  'core-product Synth UI must disable live source filter/LFO polling until Product Core source telemetry exists',
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
  assert(doc.includes(classification), `placeholder getter docs are missing classification ${classification}`);
}

console.log('Kessho Product placeholder getter checks passed');
