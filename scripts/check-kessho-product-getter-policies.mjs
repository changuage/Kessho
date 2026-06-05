import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const host = readFileSync(resolve(root, 'src/audio/coreProductEngineHost.ts'), 'utf8');
const hostDebugTelemetry = readFileSync(resolve(root, 'src/audio/CoreProductHostDebugTelemetry.ts'), 'utf8');
const hostDebugSurface = readFileSync(resolve(root, 'src/audio/product/host/CoreProductHostDebugSurface.ts'), 'utf8');
const hostEarthTextureDebug = readFileSync(resolve(root, 'src/audio/product/host/CoreProductEarthTextureDebug.ts'), 'utf8');
const behaviorHarness = readFileSync(resolve(root, 'scripts/lib/kesshoProductBehaviorHarness.mjs'), 'utf8');
const fallbackDiagnostics = readFileSync(resolve(root, 'src/audio/CoreProductFallbackDiagnostics.ts'), 'utf8');
const doc = readFileSync(resolve(root, 'docs/kessho-product-getter-policies.md'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const selectedAudioEngineDebugSurface = readFileSync(resolve(root, 'src/ui/useSelectedAudioEngineDebugSurface.ts'), 'utf8');
const selectedAudioEngineDebugAnalyserBridge = readFileSync(resolve(root, 'src/ui/useSelectedAudioEngineDebugAnalyserBridge.ts'), 'utf8');
const selectedAudioEngineDebugRuntime = readFileSync(resolve(root, 'src/ui/useSelectedAudioEngineDebugRuntime.ts'), 'utf8');
const productRuntimeSurfaces = readFileSync(resolve(root, 'src/ui/useProductRuntimeSurfaces.ts'), 'utf8');
const selectedAudioEngineRuntimeSurfaces = readFileSync(resolve(root, 'src/ui/useSelectedAudioEngineRuntimeSurfaces.ts'), 'utf8');
const productRuntimeLifecycleSurface = readFileSync(resolve(root, 'src/ui/useProductRuntimeLifecycleSurface.ts'), 'utf8');
const productRuntimeRecordingRuntime = readFileSync(resolve(root, 'src/ui/useProductRuntimeRecordingRuntime.ts'), 'utf8');
const selectedAudioEnginePageRuntimeBridges = readFileSync(resolve(root, 'src/ui/useSelectedAudioEnginePageRuntimeBridges.ts'), 'utf8');
const selectedAudioEngineRecordingRuntime = readFileSync(resolve(root, 'src/ui/useSelectedAudioEngineRecordingRuntime.ts'), 'utf8');
const selectedAudioEngineGlobalRuntimeProps = readFileSync(resolve(root, 'src/ui/useSelectedAudioEngineGlobalRuntimeProps.ts'), 'utf8');
const audioRecordingHook = readFileSync(resolve(root, 'src/ui/useAudioRecording.ts'), 'utf8');
const globalPage = readFileSync(resolve(root, 'src/ui/global/GlobalPage.tsx'), 'utf8');
const granularPage = readFileSync(resolve(root, 'src/ui/granular/GranularPage.tsx'), 'utf8');
const synthPage = readFileSync(resolve(root, 'src/ui/synth/SynthPage.tsx'), 'utf8');
const earthPage = readFileSync(resolve(root, 'src/ui/earth/EarthPage.tsx'), 'utf8');
const activeEarthMatrix = readFileSync(resolve(root, 'src/ui/earth/components/ActiveEarthMatrix.tsx'), 'utf8');

if (existsSync(resolve(root, 'src/ui/useSelectedAudioEngineSurface.ts'))) {
  throw new Error('Broad selected audio engine surface must remain removed; use focused selected runtime surfaces');
}

const getters = [
  'getDynamicsVisualTelemetry',
  'getGranularActiveGrainCount',
  'getGranularVoicePositions',
  'getGranularWriteHeadPosition',
  'getCurrentPadFilterFreq',
  'getCurrentPadLfoValue',
  'getTransportDebugState',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function methodBody(name, source = host, label = 'getter') {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*(?:private\\s+)?(?:async\\s+)?${escaped}(?:<[^>]+>)?\\s*\\(`).exec(source);
  assert(definition, `missing ${label} ${name}()`);
  return balancedBody(source, source.indexOf('{', definition.index), `${name}()`);
}

function debugSurfaceBody(name) {
  return methodBody(name, hostDebugSurface, 'debug surface getter');
}

function helperBody(name) {
  return helperBodyFromSource(hostDebugTelemetry, name, 'host debug telemetry');
}

function helperBodyFromSource(source, name, label) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?function\\s+${escaped}\\s*\\(`).exec(source);
  assert(definition, `missing ${label} helper ${name}()`);
  return balancedBody(source, source.indexOf('{', definition.index), `${name}()`);
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
]) {
  assert(fallbackDiagnostics.includes(token), `Product Core getter policy code is missing ${token}`);
}
assert(
  !fallbackDiagnostics.includes("'explicitly-unsupported-hidden'"),
  'Product Core getter policies must not keep explicit unsupported hidden getter classifications',
);

for (const forbidden of ['classifiedPlaceholderGetter', 'PlaceholderGetterClassification', 'CORE_PRODUCT_PLACEHOLDER_GETTER_CLASSIFICATIONS']) {
  assert(!fallbackDiagnostics.includes(forbidden), `Product Core getter policy must not keep ${forbidden}`);
  assert(!host.includes(forbidden), `coreProductEngineHost.ts must not keep ${forbidden}`);
}

for (const getter of getters) {
  assert(fallbackDiagnostics.includes(`${getter}: {`), `Product Core getter ${getter} is not classified in code`);
  assert(doc.includes(`\`${getter}\``), `Product Core getter ${getter} is not classified in docs`);
}

assert(
  debugSurfaceBody('getGranularActiveGrainCount').includes('this.options.latestTelemetry()?.activeGrains'),
  'granular active grain count must use Product Core telemetry instead of a fixed placeholder',
);
assert(
  debugSurfaceBody('getGranularVoicePositions').includes('this.options.latestTelemetry()?.granularVoicePositions') &&
    debugSurfaceBody('getGranularVoicePositions').includes('normalizedTelemetryPosition'),
  'granular voice positions must use Product Core granular telemetry instead of a hidden fallback',
);
assert(
  debugSurfaceBody('getGranularWriteHeadPosition').includes('this.options.latestTelemetry()?.granularWriteHeadPosition') &&
    debugSurfaceBody('getGranularWriteHeadPosition').includes('normalizedTelemetryPosition'),
  'granular write head must use Product Core granular telemetry instead of a hidden fallback',
);
assert(
  debugSurfaceBody('getDynamicsVisualTelemetry').includes('this.options.latestTelemetry()') &&
    debugSurfaceBody('getDynamicsVisualTelemetry').includes('createCoreProductDynamicsVisualTelemetry') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.masterInputPeak') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.masterOutputPeak') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.masterLimiterGainReductionDb') &&
    helperBody('createCoreProductDynamicsVisualTelemetry').includes('telemetry.dynamicsSaturationDrive'),
  'dynamics visual telemetry must use Product Core master/dynamics telemetry instead of fixed placeholders',
);
assert(
  debugSurfaceBody('getTransportDebugState').includes('this.options.latestTelemetry()') &&
    debugSurfaceBody('getTransportDebugState').includes('this.options.latestProductSnapshot()?.transport') &&
    debugSurfaceBody('getTransportDebugState').includes('createCoreProductTransportDebugState') &&
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
  !host.includes('unsupportedGetter<T>') &&
    !host.includes('unsupportedGetter(') &&
    !host.includes('explicitlyUnsupportedGetter') &&
    !host.includes('CoreProductUnsupportedPolicy') &&
    !host.includes('throwUnsupportedProductMethod'),
  'retired Product Core getters must not keep unsupported getter helpers or policy imports',
);
for (const retiredGetter of [
  'getDynamicsAnalyser',
  'getDrumVoiceAnalyser',
  'getGranularBufferWaveform',
  'getLeadMorphedParams',
  'getEarthTextureDebugState',
  'getCurrentFilterFreq',
  'getCurrentLfoValue',
  'getCurrentLfo2Value',
  'getMediaStream',
  'getLimiterNode',
  'getRecordableBusNodes',
  'getAllStemNodes',
]) {
  assert(!host.includes(`${retiredGetter}(`), `${retiredGetter}() must remain retired from the Product Core host surface`);
  assert(!fallbackDiagnostics.includes(`${retiredGetter}: {`), `${retiredGetter} must remain retired from Product Core getter policies`);
  assert(!doc.includes(`\`${retiredGetter}\``), `${retiredGetter} must remain retired from Product Core getter policy docs`);
}
assert(
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeLifecycleSurface'") &&
    !app.includes('useSelectedAudioEngineRuntimeLifecycleSurface({') &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeRecordingRuntime } from './useProductRuntimeRecordingRuntime'") &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeTelemetry } from './useProductRuntimeTelemetry'") &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeStateRuntime } from './useProductRuntimeStateRuntime'") &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeMacRecovery } from './useProductRuntimeMacRecovery'") &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeRecordingRuntime(options.productRuntimeMode)') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeTelemetry({') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeStateRuntime({') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeMacRecovery({') &&
    !productRuntimeLifecycleSurface.includes('useSelectedAudioEngineRuntimeLifecycleSurface') &&
    !productRuntimeLifecycleSurface.includes('productEngine') &&
    !productRuntimeLifecycleSurface.includes('selectedProductRuntime') &&
    !productRuntimeLifecycleSurface.includes('referenceAudioEngineDebug'),
  'App must consume runtime lifecycle through the product-named facade while the facade composes product lifecycle wrappers',
);

assert(
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes('useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode)') &&
    !app.includes("from './ui/useAudioRecording'") &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeRecordingRuntime(options.productRuntimeMode)') &&
    productRuntimeRecordingRuntime.includes('useSelectedAudioEngineRecordingRuntime(productRuntimeMode)') &&
    selectedAudioEngineRecordingRuntime.includes('useAudioRecording(audioEngineRuntimeMode)') &&
    selectedAudioEngineRecordingRuntime.includes('advancedRecordingButton') &&
    selectedAudioEngineRecordingRuntime.includes('globalRecordingProps') &&
    selectedAudioEngineRecordingRuntime.includes('snowflakeRecordingProps') &&
    selectedAudioEngineRecordingRuntime.includes('startArmedRecordingAfterPlaybackStart') &&
    audioRecordingHook.includes("throw new Error('Recording is explicitly unavailable in core-product until a Product recording bridge exists')") &&
    audioRecordingHook.includes("const recordingAvailable = audioEngineRuntimeMode !== 'core-product';") &&
    audioRecordingHook.includes('const stemRecordingAvailable = recordingAvailable;') &&
    app.includes('{advancedRecordingButton.visible && (') &&
    app.includes('{...globalRuntimeProps}') &&
    selectedAudioEngineGlobalRuntimeProps.includes('recordingProps: GlobalRecordingProps') &&
    selectedAudioEngineGlobalRuntimeProps.includes('...recordingProps') &&
    audioRecordingHook.includes('const enabledStemIds = STEM_RECORD_TRACK_IDS.filter((trackId) => recordStems[trackId]);') &&
    audioRecordingHook.includes("if (audioEngineRuntimeMode === 'core-product') return;") &&
    audioRecordingHook.includes("if (audioEngineRuntimeMode === 'core-product') {") &&
    audioRecordingHook.includes('setRecordingDuration(0);'),
  'core-product must hide recording controls and block recording calls that require Web Audio nodes',
);
assert(
  globalPage.includes('recordingAvailable: boolean;') &&
    globalPage.includes('stemRecordingAvailable: boolean;') &&
    globalPage.includes('{recordingAvailable && (') &&
    globalPage.includes('{stemRecordingAvailable && (') &&
    !globalPage.includes("const recordingAvailable = audioEngineMode !== 'core-product';") &&
    globalPage.includes('STEM_RECORD_TRACK_IDS.map'),
  'core-product UI must hide recording controls when Product recording bridge support is unavailable',
);
assert(
    selectedAudioEnginePageRuntimeBridges.includes('liveBufferTelemetryAvailable: true') &&
    !app.includes("liveBufferTelemetryAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    app.includes('{...productPageRuntimeSurface.granularPageRuntimeProps}') &&
    !app.includes('liveWaveformTelemetryAvailable={liveWaveformTelemetryAvailable}') &&
    selectedAudioEnginePageRuntimeBridges.includes('liveBufferTelemetryAvailable: true') &&
    selectedAudioEnginePageRuntimeBridges.includes('liveWaveformTelemetryAvailable: options.liveWaveformTelemetryAvailable') &&
    selectedAudioEngineDebugSurface.includes("return productEngine.getTelemetry()?.granularBufferWaveform ?? null;") &&
    selectedAudioEngineDebugSurface.includes("liveWaveformTelemetryAvailable: referenceRuntimeActive || audioEngineRuntimeMode === 'core-product'") &&
    !host.includes('getGranularBufferWaveform(') &&
    granularPage.includes('liveBufferTelemetryAvailable?: boolean;') &&
    granularPage.includes('liveWaveformTelemetryAvailable?: boolean;') &&
    granularPage.includes('if (!liveBufferTelemetryAvailable) return;') &&
    granularPage.includes('if (liveWaveformTelemetryAvailable) {') &&
    granularPage.includes('{liveBufferTelemetryAvailable && ('),
  'core-product UI must enable granular live head/voice/waveform telemetry through Product telemetry',
);
assert(
  app.includes('{...productPageRuntimeSurface.dynamicsPageRuntimeProps}') &&
    app.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') &&
    !app.includes('getDynamicsAnalyser={productRuntimeDebugAnalysers.dynamicsAnalyser}') &&
    !app.includes('getAnalyserNode={productRuntimeDebugAnalysers.drumVoiceAnalyser}') &&
    app.includes("from './ui/useProductRuntimeSurfaces'") &&
    app.includes('useProductRuntimeSurfaces(productRuntimeMode)') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") &&
    !app.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') &&
    productRuntimeSurfaces.includes("import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime'") &&
    productRuntimeSurfaces.includes('useProductRuntimeDebugRuntime(productRuntimeMode)') &&
    productRuntimeSurfaces.includes('...debugRuntime') &&
    !productRuntimeSurfaces.includes('useSelectedAudioEngineRuntimeSurfaces') &&
    !app.includes("from './ui/useSelectedAudioEngineDebugRuntime'") &&
    !app.includes("from './ui/useSelectedAudioEngineDebugSurface'") &&
    !app.includes("from './ui/useSelectedAudioEngineDebugAnalyserBridge'") &&
    selectedAudioEnginePageRuntimeBridges.includes('getDynamicsAnalyser: options.productRuntimeDebugAnalysers.dynamicsAnalyser') &&
    selectedAudioEnginePageRuntimeBridges.includes('getAnalyserNode: options.productRuntimeDebugAnalysers.drumVoiceAnalyser') &&
    selectedAudioEngineRuntimeSurfaces.includes('useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode)') &&
    selectedAudioEngineRuntimeSurfaces.includes('...debugRuntime') &&
    selectedAudioEngineDebugRuntime.includes('useSelectedAudioEngineDebugSurface(audioEngineRuntimeMode)') &&
    selectedAudioEngineDebugRuntime.includes('useSelectedAudioEngineDebugAnalyserBridge({') &&
    selectedAudioEngineDebugRuntime.includes('selectedAudioEngineDebugAnalysers,') &&
    selectedAudioEngineDebugAnalyserBridge.includes('drumVoiceAnalyser: referenceDrumVoiceAnalyser') &&
    selectedAudioEngineDebugAnalyserBridge.includes('dynamicsAnalyser: referenceDynamicsAnalyser') &&
    selectedAudioEngineDebugSurface.includes('referenceDynamicsAnalyser: referenceRuntimeActive ? getSelectedDynamicsAnalyser : undefined') &&
    selectedAudioEngineDebugSurface.includes('referenceDrumVoiceAnalyser: referenceRuntimeActive ? getSelectedDrumVoiceAnalyser : undefined') &&
    selectedAudioEngineDebugSurface.includes("audioEngineRuntimeMode === 'core-product' ? null : referenceAudioEngineDebug.getDynamicsAnalyser(key)") &&
    selectedAudioEngineDebugSurface.includes("audioEngineRuntimeMode === 'core-product' ? undefined : referenceAudioEngineDebug.getDrumVoiceAnalyser(voice)") &&
    !host.includes('getDynamicsAnalyser(') &&
    !host.includes('getDrumVoiceAnalyser('),
  'core-product UI must hide analyser-node getter paths and keep them retired from the Product Core host surface',
);
assert(
  app.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') &&
    selectedAudioEnginePageRuntimeBridges.includes('liveSourceTelemetryAvailable: true') &&
    selectedAudioEnginePageRuntimeBridges.includes('getPadFilterFreq: options.getSelectedPadFilterFreq') &&
    selectedAudioEnginePageRuntimeBridges.includes('getPadLfoValue: options.getSelectedPadLfoValue') &&
    !app.includes('getPadFilterFreq={getSelectedPadFilterFreq}') &&
    !app.includes('getPadLfoValue={getSelectedPadLfoValue}') &&
    !app.includes("liveSourceTelemetryAvailable={audioEngineRuntimeMode !== 'core-product'}") &&
    synthPage.includes('liveSourceTelemetryAvailable?: boolean;') &&
    synthPage.includes('if (!liveSourceTelemetryAvailable) return;') &&
    synthPage.includes('enabled: isRunning && liveSourceTelemetryAvailable') &&
    synthPage.includes('isRunning={isRunning && liveSourceTelemetryAvailable}'),
  'core-product Synth UI must enable Pad filter/LFO polling while preserving the telemetry availability guard',
);
assert(
  app.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') &&
    selectedAudioEnginePageRuntimeBridges.includes('getLeadMorphedParams: options.getSelectedLeadMorphedParams') &&
    selectedAudioEnginePageRuntimeBridges.includes('liveLeadMorphedParamsAvailable: options.liveLeadMorphedParamsAvailable') &&
    !app.includes('getLeadMorphedParams={getSelectedLeadMorphedParams}') &&
    !app.includes('liveLeadMorphedParamsAvailable={liveLeadMorphedParamsAvailable}') &&
    selectedAudioEngineDebugSurface.includes('liveLeadMorphedParamsAvailable: referenceRuntimeActive') &&
    selectedAudioEngineDebugSurface.includes("audioEngineRuntimeMode === 'core-product' ? null : referenceAudioEngineDebug.getLeadMorphedParams(lead)") &&
    !host.includes('getLeadMorphedParams('),
  'core-product Synth UI must keep Lead morphed preview polling disabled and retired from the Product Core host surface',
);
assert(
    selectedAudioEngineDebugSurface.includes('EMPTY_EARTH_TEXTURE_DEBUG_STATE') &&
    app.includes('{...productPageRuntimeSurface.earthPageRuntimeProps}') &&
    !app.includes('textureDebugAvailable={textureDebugAvailable}') &&
    selectedAudioEnginePageRuntimeBridges.includes('textureDebugAvailable: options.textureDebugAvailable') &&
    selectedAudioEnginePageRuntimeBridges.includes('getEarthTextureDebugState: options.getEarthTextureDebugState') &&
    selectedAudioEngineDebugSurface.includes("productEngine.getTelemetry()?.earthTextureDebugState ?? EMPTY_EARTH_TEXTURE_DEBUG_STATE") &&
    selectedAudioEngineDebugSurface.includes("textureDebugAvailable: referenceRuntimeActive || audioEngineRuntimeMode === 'core-product'") &&
    !host.includes('getEarthTextureDebugState(') &&
    earthPage.includes('textureDebugAvailable?: boolean;') &&
    activeEarthMatrix.includes('textureDebugAvailable?: boolean;') &&
    activeEarthMatrix.includes('enabled: textureDebugAvailable && activeTextureDebugKeys.length > 0') &&
    activeEarthMatrix.includes('row.textureDebugKey && textureDebugAvailable'),
  'core-product Earth UI must poll Product Core soundscape texture telemetry through the selected debug surface',
);
assert(
  methodBody('withHostDiagnostics').includes('telemetry.earthTextureDebugState') &&
    methodBody('withHostDiagnostics').includes('createCoreProductEarthTextureDebugState(') &&
    helperBodyFromSource(hostEarthTextureDebug, 'createCoreProductEarthTextureDebugState', 'Earth texture debug').includes('telemetryState?.[config.key]'),
  'core-product Earth texture diagnostics must enrich Product Core telemetry instead of replacing it with host-only preview state',
);
assert(
  !behaviorHarness.includes('createCoreProductEarthTextureDebugState: () => ({})') &&
    behaviorHarness.includes("src/audio/product/host/CoreProductEarthTextureDebug.ts") &&
    behaviorHarness.includes('createCoreProductEarthTextureDebugState,'),
  'Product host behavior harness must load the real Earth texture debug adapter instead of stubbing it empty',
);

for (const classification of ['`backed-by-product-core-api`']) {
  assert(doc.includes(classification), `Product Core getter policy docs are missing classification ${classification}`);
}
assert(
  !doc.includes('`explicitly-unsupported-hidden`'),
  'Product Core getter policy docs must not keep retired explicit unsupported hidden classifications',
);

console.log('Kessho Product getter policy checks passed');
