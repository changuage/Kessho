import {
  addEvidence,
  assert,
  loadCoreProductHostHarness,
  loadFallbackDiagnosticsHarness,
  methodBody,
  readProjectFile,
  runCheckWithReport,
} from './lib/kesshoProductBehaviorHarness.mjs';

const host = readProjectFile('src/audio/coreProductEngineHost.ts');
const hostDiagnostics = readProjectFile('src/audio/product/host/CoreProductHostDiagnostics.ts');
const fallbackDiagnostics = readProjectFile('src/audio/CoreProductFallbackDiagnostics.ts');
const referenceRuntime = readProjectFile('src/audio/referenceAudioRuntime.ts');
const app = readProjectFile('src/App.tsx');
const audioEngineMediaSession = readProjectFile('src/ui/audioEngineMediaSession.ts');
const selectedAudioEngineMediaSession = readProjectFile('src/ui/useSelectedAudioEngineMediaSession.ts');
const selectedAudioEnginePlaybackControls = readProjectFile('src/ui/useSelectedAudioEnginePlaybackControls.ts');
const selectedAudioEnginePlaybackRuntime = readProjectFile('src/ui/useSelectedAudioEnginePlaybackRuntime.ts');
const selectedAudioEngineRuntimeShell = readProjectFile('src/ui/useSelectedAudioEngineRuntimeShell.ts');
const productRuntimeSession = readProjectFile('src/ui/useProductRuntimeSession.ts');
const productRuntimePlaybackRuntime = readProjectFile('src/ui/useProductRuntimePlaybackRuntime.ts');
const productRuntimePlaybackAdapter = readProjectFile('src/ui/useProductRuntimePlaybackAdapter.ts');
const productRuntimeUi = readProjectFile('src/ui/useProductRuntimeUi.ts');
const selectedAudioEngineRecordingRuntime = readProjectFile('src/ui/useSelectedAudioEngineRecordingRuntime.ts');
const audioRecordingHook = readProjectFile('src/ui/useAudioRecording.ts');
const selectedRuntimeCapabilities = readProjectFile('src/ui/useSelectedAudioEngineRuntimeCapabilities.ts');
const selectedRuntimeTelemetry = readProjectFile('src/ui/useSelectedAudioEngineRuntimeTelemetry.ts');
const productRuntimeLifecycleSurface = readProjectFile('src/ui/useProductRuntimeLifecycleSurface.ts');
const productRuntimeRecordingRuntime = readProjectFile('src/ui/useProductRuntimeRecordingRuntime.ts');
const productRuntimeTelemetry = readProjectFile('src/ui/useProductRuntimeTelemetry.ts');
const doc = readProjectFile('docs/kessho-product-runtime-fallback-classification.md');
const getterPolicyDoc = readProjectFile('docs/kessho-product-getter-policies.md');
const uiCallsiteFiles = [
  'src/App.tsx',
  'src/ui/CpuOverlay.tsx',
  'src/ui/drums/DrumPage.tsx',
  'src/ui/synth/SynthPage.tsx',
  'src/ui/granular/GranularPage.tsx',
  'src/ui/routing/MidiRoutingPanel.tsx',
  'src/audio/sonicParityHarness.ts',
  'src/ui/presetUtils.ts',
];

function hostMethodNames() {
  const start = host.indexOf('class CoreProductEngineHost');
  const end = host.indexOf('const host = new CoreProductEngineHost');
  assert(start >= 0 && end > start, 'CoreProductEngineHost class body not found');
  const body = host.slice(start, end);
  const names = new Set();
  for (const match of body.matchAll(/^\s*(?:private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    names.add(match[1]);
  }
  return names;
}

function usedAudioEngineMethods() {
  const names = new Set();
  for (const path of uiCallsiteFiles) {
    const source = readProjectFile(path);
    for (const match of source.matchAll(/audioEngine\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      names.add(match[1]);
    }
    if (path === 'src/audio/sonicParityHarness.ts') {
      for (const match of source.matchAll(/\bengine\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

function assertThrowsMissingMethod(harness, method) {
  try {
    harness.coreProductEngineHost[method](0.5);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    assert(
      message === `Missing audio-critical core-product method: AudioEngine.${method}`,
      `${method} threw the wrong development fallback error`,
    );
    return message;
  }
  throw new Error(`${method} did not throw in development`);
}

function assertThrowsUnimplemented(harness, method) {
  try {
    harness.coreProductEngineHost[method](0.5);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    assert(
      message === `AudioEngine.${method} is not implemented by core-product`,
      `${method} threw the wrong strict proxy error`,
    );
    return message;
  }
  throw new Error(`${method} did not throw`);
}

function fallbackDiagnosticDetails(hostInstance) {
  return hostInstance.getProductRuntimeDiagnostics();
}

await runCheckWithReport({
  scriptUrl: import.meta.url,
  reportName: 'kessho-product-runtime-fallbacks-latest.json',
  run: async (report) => {
    for (const token of [
      'type RuntimeFallbackClassification',
      "'forbidden-production-fallback'",
      'reportedRuntimeFallbacks',
      'classifyCoreProductRuntimeFallback(property',
      'reportRuntimeFallback(method:',
    ]) {
      assert(`${host}\n${hostDiagnostics}\n${fallbackDiagnostics}`.includes(token), `runtime fallback classifier is missing ${token}`);
    }

    const classifyBody = methodBody(fallbackDiagnostics, 'classifyCoreProductRuntimeFallback');
    assert(classifyBody.includes("property.startsWith('get')"), 'getter fallbacks must be explicitly classified');
    assert(classifyBody.includes("'forbidden-production-fallback'"), 'all missing getter fallbacks must be forbidden');
    assert(
      !classifyBody.includes("property.includes('Analyser')") &&
        !classifyBody.includes("property.includes('Telemetry')") &&
        !classifyBody.includes("property.includes('Debug')"),
      'getter fallbacks must not be classified by broad substring matching',
    );
    assert(classifyBody.includes('/^(set|update|reset|dice|start|stop|resume|suspend|trigger|push|load|register|ensure|audition)/'), 'audio-critical method prefixes must be forbidden');

    const reportBody = methodBody(hostDiagnostics, 'reportRuntimeFallback');
    for (const token of [
      'this.reportedRuntimeFallbacks.has(method)',
      'this.reportedRuntimeFallbacks.add(method)',
      'dev || firstReport',
      'throw new Error(`Missing audio-critical core-product method: AudioEngine.${method}`)',
    ]) {
      assert(reportBody.includes(token), `reportRuntimeFallback() is missing ${token}`);
    }
    const recordBody = methodBody(hostDiagnostics, 'recordUnsupportedMethod');
    for (const token of [
      'this.unsupportedControlCount += 1',
      'this.unsupportedGetterCount += 1',
      'this.lastUnsupportedMethod = method',
      'this.lastUnsupportedMethodClass = classification',
      'this.runtimeFallbackDiagnosticCount += 1',
      'this.audioCriticalFallbackCount += 1',
    ]) {
      assert(recordBody.includes(token), `recordUnsupportedMethod() is missing ${token}`);
    }

    const proxyBody = host.slice(host.indexOf('export const coreProductEngineHost = new Proxy'));
    for (const token of [
      'const classification = classifyCoreProductRuntimeFallback(property);',
      'host.reportRuntimeFallback(property, classification);',
      "if (property.startsWith('get'))",
      'throw new Error(`AudioEngine.${property} is not implemented by core-product`)',
    ]) {
      assert(proxyBody.includes(token), `core-product proxy fallback is missing ${token}`);
    }

    const rangeBody = methodBody(hostDiagnostics, 'reportUnsupportedRangeKey');
    assert(rangeBody.includes('forbidden-production-fallback'), 'unmapped modulation range keys must be classified as forbidden production fallbacks');
    assert(rangeBody.includes('recordUnsupportedMethod'), 'unmapped modulation range keys must increment diagnostics through the host diagnostics adapter');

    const retiredGuardedAppMethods = new Set([
      'getDynamicsAnalyser',
      'getDrumVoiceAnalyser',
      'getGranularBufferWaveform',
      'getLeadMorphedParams',
      'getEarthTextureDebugState',
      'getMediaStream',
      'getLimiterNode',
      'getRecordableBusNodes',
      'getAllStemNodes',
    ]);
    const missingRequiredMethods = [...usedAudioEngineMethods()]
      .filter((name) => !retiredGuardedAppMethods.has(name))
      .filter((name) => !hostMethodNames().has(name))
      .sort();
    assert(
      missingRequiredMethods.length === 0,
      `core-product host is missing required app-facing AudioEngine methods: ${missingRequiredMethods.join(', ')}`,
    );
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
      audioEngineMediaSession.includes("if (audioEngineRuntimeMode === 'core-product') return;") &&
        selectedAudioEngineMediaSession.includes("from './audioEngineMediaSession'") &&
        selectedAudioEngineMediaSession.includes('connectMediaSessionToWebAudio(audioEngineRuntimeMode)') &&
    selectedAudioEnginePlaybackControls.includes('connectSelectedMediaSessionToAudio();') &&
    selectedAudioEnginePlaybackControls.includes('await startSelectedAudioEngine(state);') &&
    selectedAudioEnginePlaybackRuntime.includes("import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter'") &&
    selectedAudioEnginePlaybackRuntime.includes('const playbackAdapter = useProductRuntimePlaybackAdapter({') &&
    selectedAudioEnginePlaybackRuntime.includes('startSelectedPlayback: playbackAdapter.startProductPlayback') &&
    selectedAudioEnginePlaybackRuntime.includes('preloadSelectedAudioEngine: playbackAdapter.preloadProductRuntime') &&
    productRuntimePlaybackAdapter.includes("import { useSelectedAudioEngineMediaSession } from './useSelectedAudioEngineMediaSession'") &&
    productRuntimePlaybackAdapter.includes("import { useSelectedAudioEnginePlaybackControls } from './useSelectedAudioEnginePlaybackControls'") &&
    productRuntimePlaybackAdapter.includes('useSelectedAudioEngineMediaSession({') &&
    productRuntimePlaybackAdapter.includes('useSelectedAudioEnginePlaybackControls({') &&
    productRuntimePlaybackAdapter.includes('startProductPlayback') &&
    productRuntimePlaybackAdapter.includes('preloadProductRuntime') &&
        app.includes("from './ui/useProductRuntimeSession'") &&
        app.includes('useProductRuntimeShell({') &&
        !app.includes("from './ui/useSelectedAudioEngineRuntimeShell'") &&
        !app.includes('useSelectedAudioEngineRuntimeShell({') &&
        productRuntimeSession.includes("import { useProductRuntimePlaybackRuntime } from './useProductRuntimePlaybackRuntime'") &&
        productRuntimeSession.includes("import { useProductRuntimeUi } from './useProductRuntimeUi'") &&
        productRuntimeSession.includes('useProductRuntimePlaybackRuntime({') &&
        productRuntimeSession.includes('useProductRuntimeUi({') &&
        productRuntimeSession.includes('preloadProductRuntime: playbackRuntime.preloadProductRuntime') &&
        productRuntimeSession.includes('stopProductRuntime: playbackRuntime.stopProductRuntime') &&
        !productRuntimeSession.includes('useSelectedAudioEngineRuntimeShell') &&
        !app.includes("from './ui/useSelectedAudioEnginePlaybackRuntime'") &&
        !app.includes("from './ui/useSelectedAudioEngineRuntimeUi'") &&
        productRuntimePlaybackRuntime.includes('productRuntimeMode,') &&
        productRuntimeUi.includes("import { useProductRuntimeNavigation } from './useProductRuntimeNavigation'") &&
        productRuntimeUi.includes("import { useProductRuntimePerf } from './useProductRuntimePerf'") &&
        productRuntimeUi.includes('useProductRuntimeNavigation({') &&
        productRuntimeUi.includes('useProductRuntimePerf(productRuntimeMode, runtimeNavigation.showAudioEngineSwitcher)') &&
        !productRuntimeUi.includes('useSelectedAudioEngineRuntimeUi') &&
        selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEnginePlaybackRuntime } from './useSelectedAudioEnginePlaybackRuntime'") &&
        selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEngineRuntimeUi } from './useSelectedAudioEngineRuntimeUi'") &&
        selectedAudioEngineRuntimeShell.includes('useSelectedAudioEnginePlaybackRuntime({') &&
        selectedAudioEngineRuntimeShell.includes('useSelectedAudioEngineRuntimeUi({') &&
        selectedAudioEngineRuntimeShell.includes('preloadSelectedAudioEngine: playbackRuntime.preloadSelectedAudioEngine') &&
        selectedAudioEngineRuntimeShell.includes('stopSelectedAudioEngine: playbackRuntime.stopSelectedAudioEngine') &&
        !app.includes("from './ui/useSelectedAudioEngineMediaSession'") &&
        !app.includes("from './ui/useSelectedAudioEnginePlaybackControls'") &&
        !app.includes("from './ui/audioEngineMediaSession'") &&
        !app.includes('connectSelectedMediaSessionToAudio();') &&
        app.includes('useProductRuntimeLifecycleSurface({') &&
        !app.includes('useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode)') &&
        !app.includes("from './ui/useAudioRecording'") &&
        productRuntimeLifecycleSurface.includes('useProductRuntimeRecordingRuntime(options.productRuntimeMode)') &&
        productRuntimeRecordingRuntime.includes('useSelectedAudioEngineRecordingRuntime(productRuntimeMode)') &&
        selectedAudioEngineRecordingRuntime.includes('useAudioRecording(audioEngineRuntimeMode)') &&
        selectedAudioEngineRecordingRuntime.includes('startArmedRecordingAfterPlaybackStart') &&
        selectedAudioEngineRecordingRuntime.includes('globalRecordingProps') &&
        audioRecordingHook.includes("throw new Error('Recording is explicitly unavailable in core-product until a Product recording bridge exists')") &&
        audioRecordingHook.includes("if (audioEngineRuntimeMode === 'core-product') {") &&
        audioRecordingHook.includes('setRecordingDuration(0);'),
      'retired recording/platform node getters must remain guarded away from core-product App paths',
    );

    assert(
      app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
        app.includes('useProductRuntimeLifecycleSurface({') &&
        !app.includes("from './ui/useSelectedAudioEngineRuntimeTelemetry'") &&
        !app.includes('useSelectedAudioEngineRuntimeTelemetry({') &&
        app.includes('selectedRuntimeSupportsRangeKey') &&
        !app.includes("from './ui/useSelectedAudioEngineRuntimeCapabilities'") &&
        !app.includes("from './ui/useSelectedAudioEngineTelemetrySurface'") &&
        app.includes('const dualModeSupported = !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);') &&
        selectedRuntimeTelemetry.includes('useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode)') &&
        productRuntimeLifecycleSurface.includes('useProductRuntimeTelemetry({') &&
        productRuntimeTelemetry.includes('audioEngineRuntimeMode: productRuntimeMode') &&
        selectedRuntimeTelemetry.includes('useSelectedAudioEngineRuntimeCapabilities({') &&
        selectedRuntimeTelemetry.includes('setSelectedVisualTelemetryActive: telemetrySurface.setSelectedVisualTelemetryActive') &&
        selectedRuntimeCapabilities.includes('import { isCoreProductRangeKeySupported }') &&
        selectedRuntimeCapabilities.includes("audioEngineRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key)") &&
        selectedRuntimeCapabilities.includes("const active = audioEngineRuntimeMode === 'core-product' && uiMode === 'advanced'"),
      'selected runtime capabilities must own Product Core unsupported-control and visual telemetry gating',
    );
    assert(
      app.includes('const dualModeSupported = !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);'),
      'App sliderProps must keep dual-slider UI state available for every non-single-only key',
    );
    assert(
      !app.includes('const dualModeSupported = coreProductRuntimeRangeSupported && !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);'),
      'App sliderProps must not hide dual-slider UI state behind Product Core range support',
    );

    for (const section of [
      '## forbidden-production-fallback',
      'No runtime fallback is classified as safe only because it is visual',
      'All missing `core-product` proxy methods throw',
      'Diagnostics still increment and production logging remains once per missing method',
      '`unsupportedGetterCount`',
      '`lastUnsupportedMethod`',
      '`lastUnsupportedMethodClass`',
      '`runtimeFallbackDiagnosticCount`',
      '`audioCriticalFallbackCount`',
      'Required App callsites are statically audited against `CoreProductEngineHost`',
      'Unsupported native range keys keep the same dual-mode UI state machine in `core-product`',
    ]) {
      assert(doc.includes(section), `runtime fallback documentation is missing ${section}`);
    }

    assert(!referenceRuntime.includes('missingNoopMethods'), 'reference runtime must not keep missing-method no-op fallbacks');
    assert(!referenceRuntime.includes('methodCache'), 'reference runtime proxy must not cache generated method wrappers');
    assert(!referenceRuntime.includes('preInitGetterFallbacks'), 'reference runtime must not keep broad pre-init getter fallbacks');
    assert(referenceRuntime.includes('preInitNullableLifecycleGetters'), 'reference runtime must keep only explicit nullable lifecycle getters before engine init');
    for (const forbiddenPreInitGetter of [
      'getCurrentFilterFreq:',
      'getCurrentLfo2Value:',
      'getCurrentLfoValue:',
      'getCurrentPadFilterFreq:',
      'getCurrentPadLfoValue:',
      'getDrumVoiceAnalyser:',
      'getDynamicsAnalyser:',
      'getDynamicsVisualTelemetry:',
      'getEarthTextureDebugState:',
      'getGranularActiveGrainCount:',
      'getGranularBufferWaveform:',
      'getGranularVoicePositions:',
      'getGranularWriteHeadPosition:',
      'getLeadMorphedParams:',
      'getRecordableBusNodes:',
      'getTransportDebugState:',
    ]) {
      assert(!referenceRuntime.includes(forbiddenPreInitGetter), `reference runtime must not fake ${forbiddenPreInitGetter} before engine init`);
    }
    for (const lifecycleGetter of [
      'getAudioContext: () => null',
    ]) {
      assert(referenceRuntime.includes(lifecycleGetter), `reference runtime nullable lifecycle getter is missing ${lifecycleGetter}`);
    }
    for (const forbiddenLifecycleGetter of [
      'getLimiterNode: () => null',
      'getMediaStream: () => null',
    ]) {
      assert(!referenceRuntime.includes(forbiddenLifecycleGetter), `reference runtime must not fake ${forbiddenLifecycleGetter} before engine init`);
    }
    addEvidence(report, {
      id: 'static-runtime-fallback-contract',
      summary: 'Static fallback contract, App callsite coverage, and documentation checks passed.',
      details: {
        auditedUiFiles: uiCallsiteFiles,
        appFacingMethodCount: usedAudioEngineMethods().size,
        missingRequiredMethods,
      },
    });

    const startupRangeHarness = loadCoreProductHostHarness({ dev: true });
    startupRangeHarness.host.setDualRanges({ productStartupRange: { min: 0.2, max: 0.8 } });
    startupRangeHarness.host.setRuntimeWalkRanges({ productStartupWalk: { min: 0.1, max: 0.9 } });
    assert(startupRangeHarness.runtime.events.length === 0, 'startup range setters must not post before runtime initialization');
    await startupRangeHarness.host.start({ productStartupRange: 0.5, productStartupWalk: 0.4 });
    const startupRangeEvents = startupRangeHarness.runtime.events.filter((entry) => entry.type === 'modulation-range');
    assert(startupRangeEvents.length === 2, 'startup range setters must flush once the Product Core runtime is initialized');
    assert(
      startupRangeEvents.every((entry) => entry.range && entry.valueContext && entry.valueContext.bpm === 120),
      'startup range flush must include explicit range/value context after snapshot load',
    );
    addEvidence(report, {
      id: 'startup-ranges-flush-after-runtime-ready',
      summary: 'Dual and runtime-walk ranges update host state before startup and flush only after Product Core is initialized.',
      details: {
        eventTypes: startupRangeHarness.runtime.events.map((entry) => entry.type),
        startupRangeEvents,
      },
    });

    const representativeWalkTargets = {
      masterVolume: { controlId: 610, targetId: 0, paramId: 1 },
      delayAFeedback: { controlId: 611, targetId: 0, paramId: 2 },
      granularLevel: { controlId: 612, targetId: 0, paramId: 3 },
      reverbLevel: { controlId: 613, targetId: 0, paramId: 4 },
      spectralFreezeMix: { controlId: 614, targetId: 0, paramId: 5 },
      dynamicsSaturationDrive: { controlId: 615, targetId: 0, paramId: 6 },
      padExpression: { controlId: 616, targetId: 1, paramId: 7 },
      pad2Expression: { controlId: 617, targetId: 2, paramId: 7 },
      drumSubExpression: { controlId: 618, targetId: 1000, paramId: 7 },
    };
    const runtimeWalkHarness = loadCoreProductHostHarness({
      dev: true,
      globals: {
        resolveCoreProductRangeTargets: (key) => {
          const target = representativeWalkTargets[key];
          return target ? [target] : [];
        },
      },
    });
    const runtimeWalkPositions = [];
    runtimeWalkHarness.host.setRuntimeWalkPositionsCallback((positions) => {
      runtimeWalkPositions.push(positions);
    });
    await runtimeWalkHarness.host.start({
      randomWalkSpeed: 2.5,
      randomWalkMode: 'globalWalk',
      masterVolume: 0.5,
      delayAFeedback: 0.3,
      granularLevel: 0.4,
      reverbLevel: 0.45,
      spectralFreezeMix: 0.5,
      dynamicsSaturationDrive: 0.55,
      padExpression: 0.6,
      pad2Expression: 0.65,
      drumSubExpression: 0.7,
    });
    const representativeRanges = Object.fromEntries(
      Object.keys(representativeWalkTargets).map((key, index) => [key, { min: 0.1 + index * 0.01, max: 0.9 - index * 0.01 }]),
    );
    runtimeWalkHarness.host.setRuntimeWalkRanges(representativeRanges);
    const representativeWalkEvents = runtimeWalkHarness.runtime.events.filter((entry) => entry.type === 'modulation-range');
    assert(
      representativeWalkEvents.length === Object.keys(representativeWalkTargets).length,
      'representative runtime-walk ranges must post one event per source/FX key',
    );
    assert(
      representativeWalkEvents.every((entry) => entry.mode === 2 && entry.valueContext.speed === 2.5 && entry.valueContext.mode === 'globalWalk'),
      'representative runtime-walk events must preserve speed/mode context',
    );
    runtimeWalkHarness.runtime.telemetryCallback({
      runtimeWalkValues: Object.fromEntries(
        Object.entries(representativeWalkTargets).map(([key, target]) => {
          const range = representativeRanges[key];
          return [target.controlId, (range.min + range.max) * 0.5];
        }),
      ),
    });
    const latestRuntimeWalkPositions = runtimeWalkPositions.at(-1);
    assert(latestRuntimeWalkPositions, 'runtime-walk telemetry must invoke the host display callback');
    for (const key of Object.keys(representativeWalkTargets)) {
      assert(
        Math.abs(latestRuntimeWalkPositions[key] - 0.5) < 0.0001,
        `${key} runtime-walk telemetry did not normalize back to the UI position`,
      );
    }
    addEvidence(report, {
      id: 'representative-runtime-walk-ui-telemetry',
      summary: 'Representative source, drum, master, and FX runtime-walk ranges post events and map Product Core telemetry back to UI slider positions.',
      details: {
        representativeKeys: Object.keys(representativeWalkTargets),
        eventCount: representativeWalkEvents.length,
        latestRuntimeWalkPositions,
      },
    });

    const diagnostics = loadFallbackDiagnosticsHarness();
    const classificationCases = [
      ['setUnknownAudioCriticalParam', 'forbidden-production-fallback'],
      ['updateUnknownAudioCriticalState', 'forbidden-production-fallback'],
      ['resetUnknownAudioCriticalLane', 'forbidden-production-fallback'],
      ['diceUnknownAudioCriticalLane', 'forbidden-production-fallback'],
      ['legacyWebTsOnlyBehavior', 'forbidden-production-fallback'],
      ['getDynamicsAnalyser', 'forbidden-production-fallback'],
      ['getLeadMorphedParams', 'forbidden-production-fallback'],
      ['getDynamicsVisualTelemetry', 'forbidden-production-fallback'],
      ['getUnknownProductTelemetry', 'forbidden-production-fallback'],
      ['getUnknownProductDebugState', 'forbidden-production-fallback'],
    ];
    for (const [method, expected] of classificationCases) {
      const actual = diagnostics.classifyCoreProductRuntimeFallback(method);
      assert(actual === expected, `${method} classified as ${actual}, expected ${expected}`);
    }
    assert(
      diagnostics.classifyCoreProductRuntimeFallback('legacyWebTsOnlyBehavior') === 'forbidden-production-fallback',
      'development error behavior must treat legacy web-ts fallback attempts as forbidden',
    );
    addEvidence(report, {
      id: 'classifier-behavior',
      summary: 'Actual fallback classifier maps unknown control/getter names to the expected runtime classifications.',
      details: Object.fromEntries(classificationCases),
    });

    const devHarness = loadCoreProductHostHarness({ dev: true });
    const devThrowMethods = [
      'setUnknownAudioCriticalParam',
      'updateUnknownAudioCriticalState',
      'resetUnknownAudioCriticalLane',
      'diceUnknownAudioCriticalLane',
    ];
    const thrownMessages = devThrowMethods.map((method) => assertThrowsMissingMethod(devHarness, method));
    const devFallbackDiagnostics = fallbackDiagnosticDetails(devHarness.host);
    assert(devFallbackDiagnostics.unsupportedControlCount === devThrowMethods.length, 'development fallback throws must still increment unsupportedControlCount');
    assert(devFallbackDiagnostics.unsupportedGetterCount === 0, 'development audio-critical fallbacks must not increment getter count');
    assert(devFallbackDiagnostics.runtimeFallbackDiagnosticCount === devThrowMethods.length, 'development fallback throws must increment runtimeFallbackDiagnosticCount');
    assert(devFallbackDiagnostics.audioCriticalFallbackCount === devThrowMethods.length, 'development fallback throws must increment audioCriticalFallbackCount');
    assert(devFallbackDiagnostics.lastUnsupportedMethod === devThrowMethods.at(-1), 'development fallback throws must record lastUnsupportedMethod');
    assert(devFallbackDiagnostics.lastUnsupportedMethodClass === 'forbidden-production-fallback', 'development fallback throws must record lastUnsupportedMethodClass');
    assert(
      devHarness.consoleErrors.length === devThrowMethods.length &&
        devHarness.consoleErrors.every((line) => line.includes('forbidden-production-fallback')),
      'development fallback throws must emit diagnostics before throwing',
    );
    addEvidence(report, {
      id: 'dev-audio-critical-fallbacks-throw',
      summary: 'Unknown setter/update/reset/dice methods throw in development after incrementing diagnostics.',
      details: {
        methods: devThrowMethods,
        thrownMessages,
        ...devFallbackDiagnostics,
      },
    });

    const prodHarness = loadCoreProductHostHarness({ dev: false });
    const prodThrownMessages = [
      assertThrowsUnimplemented(prodHarness, 'setUnknownProductionParam'),
      assertThrowsUnimplemented(prodHarness, 'setUnknownProductionParam'),
      assertThrowsUnimplemented(prodHarness, 'updateUnknownProductionState'),
    ];
    const setLogs = prodHarness.consoleErrors.filter((line) => line.includes('AudioEngine.setUnknownProductionParam'));
    const updateLogs = prodHarness.consoleErrors.filter((line) => line.includes('AudioEngine.updateUnknownProductionState'));
    const prodFallbackDiagnostics = fallbackDiagnosticDetails(prodHarness.host);
    assert(setLogs.length === 1, 'production missing method diagnostics must log once per method');
    assert(updateLogs.length === 1, 'production missing method diagnostics must log first use of each method');
    assert(prodFallbackDiagnostics.unsupportedControlCount === 3, 'production fallback must increment unsupportedControlCount for every use');
    assert(prodFallbackDiagnostics.unsupportedGetterCount === 0, 'production setter/update fallbacks must not increment getter count');
    assert(prodFallbackDiagnostics.runtimeFallbackDiagnosticCount === 3, 'production fallback must increment runtimeFallbackDiagnosticCount for every use');
    assert(prodFallbackDiagnostics.audioCriticalFallbackCount === 3, 'production fallback must increment audioCriticalFallbackCount for every use');
    assert(prodFallbackDiagnostics.lastUnsupportedMethod === 'updateUnknownProductionState', 'production fallback must record lastUnsupportedMethod');
    assert(prodFallbackDiagnostics.lastUnsupportedMethodClass === 'forbidden-production-fallback', 'production fallback must record lastUnsupportedMethodClass');
    addEvidence(report, {
      id: 'production-diagnostics-throw-log-once',
      summary: 'Production unknown methods throw, increment every use, and log only once per missing method.',
      details: {
        thrownMessages: prodThrownMessages,
        ...prodFallbackDiagnostics,
        consoleErrors: prodHarness.consoleErrors,
      },
    });

    const retiredGetterNames = [
      'getDynamicsAnalyser',
      'getDrumVoiceAnalyser',
      'getGranularBufferWaveform',
      'getLeadMorphedParams',
      'getEarthTextureDebugState',
    ];
    for (const method of retiredGetterNames) {
      assert(!hostMethodNames().has(method), `${method} must stay retired from the Product Core host surface`);
    }
    const guardedGetterHarness = loadCoreProductHostHarness({ dev: true });
    const guardedGetterDiagnostics = fallbackDiagnosticDetails(guardedGetterHarness.host);
    assert(guardedGetterDiagnostics.unsupportedControlCount === 0, 'guarded retired getters must not be reported as runtime fallbacks');
    assert(guardedGetterDiagnostics.unsupportedGetterCount === 0, 'guarded retired getters must not increment unsupportedGetterCount');
    assert(guardedGetterDiagnostics.runtimeFallbackDiagnosticCount === 0, 'guarded retired getters must not increment runtimeFallbackDiagnosticCount');
    assert(guardedGetterDiagnostics.audioCriticalFallbackCount === 0, 'guarded retired getters must not increment audioCriticalFallbackCount');
    assert(guardedGetterDiagnostics.lastUnsupportedMethod === null, 'guarded retired getters must not record lastUnsupportedMethod');
    assert(guardedGetterDiagnostics.lastUnsupportedMethodClass === null, 'guarded retired getters must not record lastUnsupportedMethodClass');
    assert(guardedGetterHarness.consoleErrors.length === 0, 'guarded retired getters must not emit runtime fallback diagnostics');
    addEvidence(report, {
      id: 'guarded-retired-getters-not-fallbacks',
      summary: 'Retired visual/debug getters are absent from the Product Core host and guarded away from core-product UI paths.',
      details: {
        methods: retiredGetterNames,
        ...guardedGetterDiagnostics,
        consoleErrors: guardedGetterHarness.consoleErrors,
      },
    });

    const unknownGetterHarness = loadCoreProductHostHarness({ dev: true });
    const unknownGetterThrownMessage = assertThrowsMissingMethod(unknownGetterHarness, 'getUnknownProductTelemetry');
    const unknownGetterFallbackDiagnostics = fallbackDiagnosticDetails(unknownGetterHarness.host);
    assert(unknownGetterFallbackDiagnostics.unsupportedControlCount === 1, 'unknown getter fallbacks must be surfaced in unsupportedControlCount');
    assert(unknownGetterFallbackDiagnostics.unsupportedGetterCount === 1, 'unknown getter fallbacks must still increment unsupportedGetterCount');
    assert(unknownGetterFallbackDiagnostics.runtimeFallbackDiagnosticCount === 1, 'unknown getter fallbacks must increment runtimeFallbackDiagnosticCount');
    assert(unknownGetterFallbackDiagnostics.audioCriticalFallbackCount === 1, 'unknown getter fallbacks must increment audioCriticalFallbackCount');
    assert(unknownGetterFallbackDiagnostics.lastUnsupportedMethod === 'getUnknownProductTelemetry', 'unknown getter fallbacks must record lastUnsupportedMethod');
    assert(unknownGetterFallbackDiagnostics.lastUnsupportedMethodClass === 'forbidden-production-fallback', 'unknown getter fallbacks must record forbidden classification');
    assert(
      unknownGetterHarness.consoleErrors.length === 1 &&
        unknownGetterHarness.consoleErrors[0].includes('forbidden-production-fallback'),
      'unknown getter fallbacks must emit forbidden diagnostics',
    );
    addEvidence(report, {
      id: 'unknown-getters-forbidden',
      summary: 'Getter fallbacks are closed-list: unknown getters throw as forbidden production fallbacks in development.',
      details: {
        method: 'getUnknownProductTelemetry',
        thrownMessage: unknownGetterThrownMessage,
        ...unknownGetterFallbackDiagnostics,
        consoleErrors: unknownGetterHarness.consoleErrors,
      },
    });

    const getterPolicies = diagnostics.CORE_PRODUCT_GETTER_POLICIES;
    const surfacedTelemetryBlockers = Object.entries(getterPolicies)
      .filter(([, entry]) => /telemetry|debug|exposes/i.test(entry.blocker))
      .map(([getter, entry]) => ({ getter, classification: entry.classification, blocker: entry.blocker }));
    assert(surfacedTelemetryBlockers.length >= 7, 'Product Core telemetry-backed getters must be surfaced with tracked blockers');
    for (const { getter, classification } of surfacedTelemetryBlockers) {
      assert(getterPolicyDoc.includes(`\`${getter}\``), `${getter} is missing from Product Core getter policy docs`);
      assert(getterPolicyDoc.includes(`\`${classification}\``), `${getter} classification ${classification} is missing from Product Core getter policy docs`);
    }
    addEvidence(report, {
      id: 'documented-telemetry-getter-blockers',
      summary: 'Product Core getter policies surface telemetry-backed APIs with documented blockers.',
      details: {
        surfacedTelemetryBlockers,
      },
    });

    const referenceHarness = loadCoreProductHostHarness({ dev: true });
    const referenceThrownMessage = assertThrowsMissingMethod(referenceHarness, 'legacyWebTsOnlyBehavior');
    const referenceFallbackDiagnostics = fallbackDiagnosticDetails(referenceHarness.host);
    assert(referenceFallbackDiagnostics.unsupportedControlCount === 1, 'unknown legacy methods must not be treated as supported');
    assert(referenceFallbackDiagnostics.unsupportedGetterCount === 0, 'unknown legacy non-getter fallback must not increment unsupportedGetterCount');
    assert(referenceFallbackDiagnostics.runtimeFallbackDiagnosticCount === 1, 'unknown legacy fallback must increment runtimeFallbackDiagnosticCount');
    assert(referenceFallbackDiagnostics.audioCriticalFallbackCount === 1, 'unknown legacy fallback must increment audioCriticalFallbackCount');
    assert(referenceFallbackDiagnostics.lastUnsupportedMethod === 'legacyWebTsOnlyBehavior', 'unknown legacy fallback must record lastUnsupportedMethod');
    assert(referenceFallbackDiagnostics.lastUnsupportedMethodClass === 'forbidden-production-fallback', 'unknown legacy fallback must record forbidden classification');
    assert(
      referenceHarness.consoleErrors.length === 1 &&
        referenceHarness.consoleErrors[0].includes('forbidden-production-fallback'),
      'unknown legacy missing methods must emit forbidden diagnostics',
    );
    assert(!hostMethodNames().has('legacyWebTsOnlyBehavior'), 'unknown legacy fixture unexpectedly exists as a host method');
    addEvidence(report, {
      id: 'unknown-legacy-methods-forbidden',
      summary: 'Unknown legacy web-ts methods are no longer broad reference-only fallbacks; they are forbidden missing Product Core methods.',
      details: {
        method: 'legacyWebTsOnlyBehavior',
        thrownMessage: referenceThrownMessage,
        ...referenceFallbackDiagnostics,
        consoleErrors: referenceHarness.consoleErrors,
      },
    });

    console.log('Kessho Product runtime fallback checks passed');
  },
});
