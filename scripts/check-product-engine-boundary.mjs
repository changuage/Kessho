import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const sourceRoots = ['src'];

const legacyEngineImportPatterns = [
  /from\s+['"](?:\.\/|\.\.\/)*audio\/engine['"]/,
  /from\s+['"](?:\.\/|\.\.\/)*engine['"]/,
  /from\s+['"][^'"]*reference\/webTs\/engine['"]/,
  /from\s+['"]@\/audio\/engine['"]/,
  /import\s*\(\s*['"](?:\.\/|\.\.\/)*engine['"]\s*\)/,
  /import\s*\(\s*['"][^'"]*reference\/webTs\/engine['"]\s*\)/,
  /src\/audio\/engine/,
];

const legacyRuntimeImportPatterns = [/from\s+['"](?:\.\/|\.\.\/)*audio\/runtime['"]/, /from\s+['"](?:\.\/|\.\.\/)*runtime['"]/, /from\s+['"]@\/audio\/runtime['"]/];

const directLegacyEngineAllowlist = new Map([
  ['src/audio/coreEngineHost.ts', 'legacy core-smoke host compatibility'],
  ['src/audio/referenceAudioRuntime.ts', 'dev/reference-only web-ts and core-smoke runtime loader'],
]);

const legacyRuntimeAllowlist = new Map([['src/audio/sonicParityHarness.ts', 'parity harness can use the legacy runtime facade until web-ts reference namespace exists']]);

const productPortContractFiles = [
  'src/audio/product/ProductEnginePort.ts',
  'src/audio/product/ports/ProductLifecyclePort.ts',
  'src/audio/product/ports/ProductCommandPort.ts',
  'src/audio/product/ports/ProductControlPort.ts',
  'src/audio/product/ports/ProductAssetPort.ts',
  'src/audio/product/ports/ProductTelemetryPort.ts',
  'src/audio/product/ports/ProductSequencerPort.ts',
  'src/audio/product/ports/ProductModulationPort.ts',
  'src/audio/product/ports/ProductDiagnosticsPort.ts',
  'src/audio/product/ports/ProductEnginePorts.ts',
];
const productPortFiles = new Set([
  ...productPortContractFiles,
  'src/audio/product/ProductEngineTypes.ts',
  'src/audio/product/ProductRuntimeDiagnostics.ts',
  'src/audio/product/ProductRuntimeMode.ts',
]);
const productPortContractSurface = productPortContractFiles
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

const webAudioBoundaryTypes = ['AudioNode', 'GainNode', 'AnalyserNode', 'AudioContext', 'AudioWorkletNode', 'MediaStream', 'MediaStreamAudioDestinationNode'];
const migratedSequencerCompatMethodSignatures = [
  'setDrumEuclidClockDivs(divs:',
  'setSynthEuclidClockDivs(divs:',
  'setDrumEuclidSwings(swings:',
  'setSynthEuclidSwings(swings:',
  'setDrumSubLaneEnabled(states:',
  'setSynthSubLaneEnabled(states:',
  'setDrumPitchSettings(settings:',
  'setSynthPitchSettings(settings:',
  'setSynthPitchBindingModes(modes:',
  'setSynthStepOverrides(overrides:',
  'resetSynthEuclidLaneHome(laneIndex:',
  'diceSynthEuclidLane(laneIndex:',
  'resetDrumEuclidLaneHome(laneIndex:',
  'diceDrumEuclidLane(laneIndex:',
];
const webProductLiveTriggerHostMethods = [
  'setLeadExpressionCallback',
  'setLeadMorphCallback',
  'setPadMorphTriggerCallback',
  'setPad2MorphTriggerCallback',
  'setLeadDistanceCallback',
  'setPadDistanceTriggerCallback',
  'setPad2DistanceTriggerCallback',
  'setPianoDistanceTriggerCallback',
  'setLeadDelayCallback',
  'setDrumMorphTriggerCallback',
  'setDrumParamSHTriggerCallback',
  'setGranularSHTriggerCallback',
];
const webProductModulationRangeHostMethods = [
  'setRuntimeWalkPositionsCallback',
  'setDrumMorphRange',
  'setDrumParamSHRange',
  'setDualRanges',
  'setRuntimeWalkRanges',
];
const webProductJourneyMorphHostMethods = [
  'resetCofDrift',
  'setJourneyMorphClockCallback',
  'startJourneyMorphClock',
  'stopJourneyMorphClock',
];
const webProductSequencerCallbackHostMethods = [
  'setDrumTriggerCallback',
  'setDrumStepPositionCallback',
  'setSynthStepPositionCallback',
  'setDrumEuclidEvolveTriggerCallback',
  'setSynthEuclidEvolveTriggerCallback',
];
const webProductEvolveOverrideCallbackHostMethods = [
  'setDrumEvolveOverridesChangedCallback',
  'setSynthEvolveOverridesChangedCallback',
  'setSynthNoteRangeEvolvedCallback',
];
const webProductRuntimeTelemetryHostMethods = [
  'setStateChangeCallback',
  'setProductTelemetryCallback',
  'setPerfMonitorEnabled',
  'setPerfUpdateCallback',
  'setVisualTelemetryActive',
];
const webProductRuntimeCommandHostMethods = [
  'setOutputGain',
  'updateSnapshotPatch',
  'postProductEvent',
  'pushMidiMessage',
  'registerAsset',
  'unregisterAsset',
  'auditionSynthNote',
  'triggerDrumVoice',
];
const webProductRuntimeLifecycleHostMethods = [
  'start',
  'stop',
  'suspend',
  'resume',
];
const webProductRuntimeReadHostMethods = [
  'getState',
  'getProductTelemetry',
  'getDynamicsVisualTelemetry',
  'getProductRuntimeDiagnostics',
  'getCapabilityReport',
];
const appSelectedRuntimeCallPattern = /\b(?:start|resume|suspend|preload|stop|audition|trigger|set|get|reset|capture|dice|push)Selected[A-Za-z0-9_]*\s*\(/g;
const appSelectedRuntimeCallAllowlist = new Set([
  'startSelectedPlayback',
  'stopSelectedPlayback',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function hasAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

function appearsBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function staticImportSources(source) {
  return [...source.matchAll(/\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function normalizedImportSource(source) {
  return source
    .replace(/\\/g, '/')
    .replace(/\/index$/, '')
    .replace(/\.(ts|tsx|js|jsx|mjs)$/, '');
}

function appRuntimeBoundaryViolation(source) {
  const normalized = normalizedImportSource(source);
  if (normalized === './audio/coreProductEngineHost') return 'coreProductEngineHost';
  if (normalized === './audio/runtime') return 'src/audio/runtime';
  if (normalized === './audio/engine') return 'src/audio/engine';
  if (normalized === './audio/referenceAudioRuntime') return 'web-ts reference runtime';
  if (normalized === './audio/reference/webTs/engine') return 'web-ts reference engine';
  return null;
}

function importsLegacyProductAudioCompat(source) {
  return staticImportSources(source).some(
    (importSource) =>
      normalizedImportSource(importSource).endsWith('/audio/product/ProductAudioEngineCompat') ||
      normalizedImportSource(importSource) === '../audio/product/ProductAudioEngineCompat' ||
      normalizedImportSource(importSource) === '../../audio/product/ProductAudioEngineCompat',
  );
}

const failures = [];
const warnings = [];

const productNativeRuntimeHookFiles = new Set([
  'src/ui/useProductRuntimeGlobalSurface.ts',
  'src/ui/useProductRuntimeMacRecovery.ts',
  'src/ui/useProductRuntimeManualTriggers.ts',
  'src/ui/useProductRuntimeModulationRanges.ts',
  'src/ui/useProductRuntimeMorphRuntimeSurface.ts',
  'src/ui/useProductRuntimeRecordingRuntime.ts',
  'src/ui/useProductRuntimeSequencerControls.ts',
  'src/ui/useProductRuntimeStateRuntime.ts',
  'src/ui/useProductRuntimeSynthPageEvents.ts',
  'src/ui/useProductRuntimeTelemetry.ts',
]);

function assertProductNativeRuntimeHook(relative, source) {
  for (const forbiddenToken of [
    'ProductAudioEngineCompat',
    'SelectedProductRuntime',
    'selectedProductRuntime',
    'referenceAudioEngineDebug',
    'useSelectedAudioEngine',
  ]) {
    if (source.includes(forbiddenToken)) {
      failures.push(`${relative}: product-native runtime hook must not delegate through selected/reference compatibility surface ${forbiddenToken}`);
    }
  }
}

function assertProductPageRuntimeBridgeBoundary(relative, source) {
  for (const requiredSnippet of [
    "import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges'",
    "import { useSelectedAudioEngineCallbackSurfaces } from './useSelectedAudioEngineCallbackSurfaces'",
    "import { useSelectedAudioEngineControlSurfaces } from './useSelectedAudioEngineControlSurfaces'",
    "import { useProductRuntimeSynthPageEvents } from './useProductRuntimeSynthPageEvents'",
    'const selectedRuntimeCallbacks = useSelectedAudioEngineCallbackSurfaces(productRuntimeMode)',
    'const selectedRuntimeControls = useSelectedAudioEngineControlSurfaces(productRuntimeMode)',
    'const productSynthPageEvents = useProductRuntimeSynthPageEvents(productRuntimeMode, stateRef)',
    "const useProductRuntimePageSurfaces = productRuntimeMode === 'core-product'",
    'useProductRuntimePageSurfaces',
    'useSelectedAudioEnginePageRuntimeBridges(selectedOptions)',
    'synthPageRuntimeProps: {',
    '...selectedPageRuntimeBridges.synthPageRuntimeProps',
    '...productSynthPageEvents',
  ]) {
    if (!source.includes(requiredSnippet)) {
      failures.push(`${relative}: product page runtime bridge must explicitly choose Product surfaces for core-product and selected surfaces for reference modes; missing ${requiredSnippet}`);
    }
  }
  for (const forbiddenToken of [
    'productEngine',
    'selectedProductRuntime',
    'referenceAudioEngineDebug',
    "from '../audio/product/ProductEngineProxy'",
    "from '../audio/product/SelectedProductRuntime'",
    "from '../audio/product/WebProductEngine'",
  ]) {
    if (source.includes(forbiddenToken)) {
      failures.push(`${relative}: product page runtime bridge must not touch runtime implementations directly (${forbiddenToken})`);
    }
  }
}

if (fs.existsSync(path.join(root, 'src/audio/engine.ts'))) {
  failures.push('src/audio/engine.ts must not exist at the production audio root; keep web-ts under src/audio/reference/webTs/engine.ts');
}

for (const rootDir of sourceRoots) {
  for (const file of walk(path.join(root, rootDir))) {
    const relative = rel(file);
    const source = fs.readFileSync(file, 'utf8');

    if (relative.startsWith('src/audio/product/') && hasAny(source, legacyEngineImportPatterns)) {
      failures.push(`${relative}: product runtime boundary must not import legacy src/audio/engine.ts`);
    }

    if (relative === 'src/App.tsx') {
      for (const importSource of staticImportSources(source)) {
        const violation = appRuntimeBoundaryViolation(importSource);
        if (violation) {
          failures.push(`${relative}: App must not directly import ${violation}; use ProductEngineProxy/ProductEnginePort or a reference-only harness boundary`);
        }
      }
      if (source.includes('type EngineState = ProductEngineState')) {
        failures.push(`${relative}: App must use ProductEngineState directly instead of aliasing it back to EngineState`);
      }
      for (const runtimeHelper of [
        'function shouldShowAudioEngineSwitcher(',
        'function shouldStartInAdvancedEditor(',
        'function buildAudioEngineSwitchUrl(',
        'getAudioEngineRuntimeMode()',
        'getAudioEngineRuntimeModes()',
        'buildAudioEngineSwitchUrl(',
        'readAudioEngineSwitchStateFromSession(',
        'shouldShowAudioEngineSwitcher()',
        'shouldStartInAdvancedEditor()',
        'function summarizeAudioEngineCpu(',
        'function readAudioEngineCpuSummaries(',
        'function collectChangedStatePatch(',
        'collectChangedStatePatch(',
        'const immediatelyAppliedAudioEngineStateRef = useRef(',
        'const skipNextPresetLoadEngineSyncRef = useRef(',
        'const presetEngineUpdateOptions = useMemo(',
        'const syncCoreProductAppliedPreset = useCallback(',
        'const setSelectedPerfMonitorEnabled = useCallback(',
        'const setSelectedPerfUpdateCallback = useCallback(',
        'writeAudioEngineCpuSummaries(next)',
        'audioEngineRuntimeModes.map(',
        'audioEngineRuntimeModeLabel(',
        'audioEngineRuntimeModeTitle(',
        'data-testid="main-product-runtime-switch"',
        'const startSelectedAudioEngine = useCallback(',
        'const resumeSelectedAudioEngine = useCallback(',
        'const preloadSelectedAudioEngine = useCallback(',
        'const stopSelectedAudioEngine = useCallback(',
        'const setSelectedOutputGain = useCallback(',
        'macAudioRecoveryInFlightRef',
        'getSelectedReferenceAudioContextState',
        'disposeSelectedReferenceEngine',
        'macOS audio context recovery failed',
        'isCoreProductRangeKeySupported',
        'function coreProductSupportsRuntimeRangeKey(',
        "audioEngineRuntimeMode === 'core-product' && !",
        "audioEngineRuntimeMode !== 'core-product' ||",
        "const active = audioEngineRuntimeMode === 'core-product' && uiMode === 'advanced'",
        'setSelectedVisualTelemetryActive(active)',
        'setVisualizerSequencerState',
        'setSelectedDrumTriggerCallback((voice: string, velocity: number) =>',
        'setSelectedDrumStepPositionCallback((steps: number[], hitCounts: number[]) =>',
        'setSelectedSynthStepPositionCallback((steps: number[], hitCounts: number[]) =>',
        'setSelectedLeadExpressionCallback((expression) =>',
        'setSelectedLeadMorphCallback((morph) =>',
        'setSelectedPadMorphTriggerCallback((morphPosition: number) =>',
        'setSelectedPad2MorphTriggerCallback((morphPosition: number) =>',
        'setSelectedLeadDistanceCallback((distance) =>',
        'setSelectedLeadDelayCallback((delay) =>',
        'setSelectedDrumMorphTriggerCallback((voice, morphPosition) =>',
        'setSelectedDrumParamSHTriggerCallback((_voice, key, position) =>',
        'setSelectedGranularSHTriggerCallback((positions: Record<string, number>) =>',
        'setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) =>',
        'setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) =>',
        'setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) =>',
        'drumEvolvedVersionRef',
        'synthEvolvedVersionRef',
        'normalizeEvolvedSubLanePatch',
        'mergeEvolvedSubLanePatch',
        'emitVisualizerPulses',
        'setRuntimeFlashKeys(Object.keys(positions))',
        'setSelectedEngineStateChangeCallback((nextState) =>',
        'const fxOwnersChanged',
        'const updateTransportDebug = useCallback(',
        'useVisibleInterval(updateTransportDebug',
        'const transportDebug = getSelectedTransportDebugState();',
        'Math.abs(current.effectiveBpm - transportDebug.effectiveBpm) < 0.05',
        "from './ui/audioEngineMediaSession'",
        'setupIOSMediaSession({',
        'connectMediaSessionToWebAudio(',
        'stopIOSMediaSession(',
        'const audioSessionDiagnosticEnabled =',
        'startCapacitorAudioSessionPlayback(',
        'stopCapacitorAudioSessionPlayback();',
        'addCapacitorAudioSessionRemoteCommandListener',
        'getCapacitorAudioSessionStatus',
        'setCapacitorAudioSessionNowPlaying',
        'syncCapacitorAudioSessionState',
        'capacitorAudioSessionRemoteCommandCleanupRef',
        'capacitorAudioSessionRemoteCommandHandlerRef',
        'getCapacitorMacAudioOutputStatus',
        'openCapacitorMacSoundSettings',
        'setCapacitorMacPlaybackState',
        'function readMacAirPlayPerformancePinned(',
        'function writeMacAirPlayPerformancePinned(',
        'const refreshMacAudioOutputStatus = useCallback(',
        "from './native/capacitorAudioSession'",
        "from './native/capacitorMacShell'",
        'isCapacitorNativeShell()',
        'isCapacitorMacShell()',
        'const usesSupabaseStatePresetLibrary =',
        'const usesCapacitorLocalPresetLibrary =',
        'const usesCloudBackedStatePresetLibrary =',
        'setupSelectedIOSMediaSession();',
        'connectSelectedMediaSessionToAudio();',
        'stopSelectedIOSMediaSession();',
        'await startSelectedAudioEngine(',
        'stopSelectedAudioEngine();',
        'const [playbackTimerEnabled, setPlaybackTimerEnabled] = useState(',
        'const [playbackTimerMinutes, setPlaybackTimerMinutes] = useState(',
        'const [playbackTimerRemaining, setPlaybackTimerRemaining] = useState',
        'playbackTimerTargetTimeRef',
        'const updatePlaybackTimerCountdown = useCallback(',
        'useVisibleInterval(updatePlaybackTimerCountdown',
        'const requestSequencerPlaybackStart =',
        'const toggleLazySequencerTransport = useCallback(',
        'handleLazySequencerTransportShortcut',
        'APP_SYNTH_LANE_ENABLED_KEYS',
        'APP_DRUM_LANE_ENABLED_KEYS',
        'const cloudPresetStoreRef = useRef(',
        'const cloudAutoStartStoreInitPromiseRef = useRef(',
        'const cloudPresetStoreReadyRef = useRef(',
        'const markCloudPresetStoreReady =',
        'const ensureCloudAutoStartPresetStore = useCallback(',
        'new SupabasePresetStore(supabaseClient)',
        'new HybridPresetStore(local, cloud)',
        'const loadPresets = async () =>',
        'fetchPresetById(cloudPresetId)',
        "urlParams.get('cloud')",
        'const resolveSavedPresetForLoad = useCallback(',
        'const resolveSavedPresetByName = useCallback(',
        'loadActiveStatePresetStorePresetByName(preset.name)',
        'loadActiveStatePresetStorePresetByName(presetName)',
        'const autoStartPresetRef = useRef(',
        'const autoStartPresetSourceRef = useRef(',
        'const resolveDefaultAutoStartPreset = useCallback(',
        'const timedCloudPreset = await Promise.race',
        'const deviceLocalPreset = savedPresets.find((preset) => preset.name === DEFAULT_AUTO_START_PRESET_NAME)',
        'const bundledPreset = await loadBundledPresetByName(DEFAULT_AUTO_START_PRESET_NAME)',
        'kesshoPresetV2Migration',
        'runPresetV2Migration',
        'optimizeStringWavesV2',
        'repairPresetChildGraphsV2',
        'repairStringWavesGraphV2',
        'verifyPresetV2Migration',
        'loadFactoryPresets',
        'Skipping bundled factory preset seeding; shared cloud presets are the source of truth.',
        'let mediaSessionAudio:',
        'const setupIOSMediaSession =',
        'const connectMediaSessionToWebAudio =',
        'const stopIOSMediaSession =',
        'const handleStartRecording =',
        'const handleStopRecording =',
        "audioEngineRuntimeMode !== 'core-product' && (",
        'const ensureRecorderTapWorklet =',
        'const finalizeRecordingWorkerFiles =',
        'const downloadRecordingArchive =',
        'const AUDIO_ENGINE_SWITCH_STATE_PARAM',
      ]) {
        if (source.includes(runtimeHelper)) {
          failures.push(`${relative}: runtime switch, lifecycle, and CPU summary helpers must stay extracted from App`);
        }
      }
      if (source.includes('productEngine.start({ initialState') || source.includes('productEngine.setOutputGain(target') || source.includes('audioEngine.setOutputGain(target')) {
        failures.push(`${relative}: selected audio lifecycle and output-gain routing must stay extracted from App`);
      }
      if (
        !source.includes("from './ui/useLazySequencerTransport'") ||
        !source.includes('useLazySequencerTransport({') ||
        !source.includes('requestSequencerPlaybackStart') ||
        !source.includes('startPlayback: handleStart') ||
        source.includes('startPlaybackWithState: (patchedState)')
      ) {
        failures.push(`${relative}: lazy sequencer transport start/toggle wiring must stay extracted through useLazySequencerTransport`);
      }
    }

    if (
      (relative === 'src/ui/global/GlobalPage.tsx' || relative === 'src/ui/visualizer/ReactiveVisualizerPage.tsx') &&
      /import\s+type\s+\{[^}]*\bEngineState\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/audio\/engineSharedTypes['"]/.test(source)
    ) {
      failures.push(`${relative}: Product-facing UI state props must use ProductEngineState instead of legacy EngineState`);
    }

    if (productPortFiles.has(relative)) {
      for (const typeName of webAudioBoundaryTypes) {
        const pattern = new RegExp(`\\b${typeName}\\b`);
        if (pattern.test(source)) {
          failures.push(`${relative}: ProductEnginePort type surface must not expose ${typeName}`);
        }
      }
    }

    if (relative === 'src/audio/product/ProductEngineTypes.ts' && /import\s+type\s+\{[^}]*\bEngineState\b[^}]*\}\s+from\s+['"]\.\.\/engineSharedTypes['"]/.test(source)) {
      failures.push(`${relative}: ProductEngineState must be an explicit product contract, not an EngineState alias`);
    }
    if (relative === 'src/audio/product/ProductEngineTypes.ts' && /from\s+['"]\.\.\/engineSharedTypes['"]/.test(source)) {
      failures.push(`${relative}: ProductEngineTypes must own product state/debug types instead of importing engineSharedTypes`);
    }
    if (
      (relative === 'src/audio/coreProductEngineHost.ts' || relative === 'src/audio/CoreProductHostRuntimeGuards.ts') &&
      /import\s+type\s+\{[^}]*\bEngineState\b[^}]*\}\s+from\s+['"]\.\/engineSharedTypes['"]/.test(source)
    ) {
      failures.push(`${relative}: Product Core host state must use ProductEngineState, not legacy EngineState`);
    }

    if (relative === 'src/App.tsx' && source.includes('legacy-adapter-update')) {
      failures.push(`${relative}: common production UI controls must not use legacy-adapter-update as a Product patch reason`);
    }

    if (productNativeRuntimeHookFiles.has(relative)) {
      assertProductNativeRuntimeHook(relative, source);
      if (relative === 'src/ui/useProductRuntimeStateRuntime.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'productRuntimeMode: ProductRuntimeSelectionMode',
          "if (productRuntimeMode !== 'core-product') {",
          'productEngine.setStateChangeCallback(null)',
          'productEngine.setStateChangeCallback((nextState) => {',
          '}, [productRuntimeMode, setEngineState]);',
          'useVisibleInterval(updateTransportDebug, 1000, {',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native state runtime must detach Product Core callbacks outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeMacRecovery.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'productRuntimeMode,',
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive || !macShellAvailable || !playbackIsRunning || recoveryInFlightRef.current) return;',
          'productEngine.getLifecycleState()',
          'await productEngine.resume();',
          'await productEngine.start({ initialState: stateRef.current as unknown as Readonly<Record<string, unknown>> });',
          'enabled: productRuntimeActive && macShellAvailable && playbackIsRunning,',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native macOS recovery must not poll or recover Product Core outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeTelemetry.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'const EMPTY_PRODUCT_DYNAMICS_VISUAL_TELEMETRY: ProductDynamicsVisualTelemetry = {',
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive) return 0;',
          'if (!productRuntimeActive) return [0, 0, 0, 0];',
          'if (!productRuntimeActive) return EMPTY_PRODUCT_DYNAMICS_VISUAL_TELEMETRY;',
          'if (!productRuntimeActive) return;',
          "return productRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key);",
          "if (productRuntimeMode !== 'core-product') {",
          'productEngine.setVisualTelemetryActive(false);',
          '}, [productRuntimeMode]);',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native telemetry must avoid Product Core reads/writes outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeModulationRanges.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive) return;',
          'productEngine.setRuntimeWalkPositionsCallback(callback)',
          'productEngine.setDrumMorphRange(voice, range)',
          'productEngine.setDrumParamSHRange(key, range)',
          'productEngine.setDualRanges(ranges)',
          'productEngine.setRuntimeWalkRanges(ranges)',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native modulation range setters must no-op outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeMorphRuntimeSurface.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive) return;',
          'productEngine.setJourneyMorphClockCallback(callback)',
          'productEngine.startJourneyMorphClock()',
          'productEngine.stopJourneyMorphClock()',
          'productEngine.resetCofDrift()',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native morph runtime setters must no-op outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeSequencerCallbacks.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive) return;',
          'productEngine.setDrumStepPositionCallback(callback)',
          'productEngine.setDrumEuclidEvolveTriggerCallback(callback)',
          'productEngine.setDrumTriggerCallback(callback ? (voice, velocity) => {',
          'productEngine.setSynthStepPositionCallback(callback)',
          'productEngine.setSynthOrbitVisualStateCallback(callback)',
          'productEngine.setSynthAnchorWalkerVisualStateCallback(callback)',
          'productEngine.setSynthEuclidEvolveTriggerCallback(callback)',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native sequencer callbacks must no-op outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeSequencerControls.ts') {
        for (const requiredSnippet of [
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive) return;',
          'createCoreProductSequencerEvolveConfigEvents',
          'createCoreProductSequencerPresetHomeCaptureEvents',
          'commitCoreProductSequencerEvents(',
          '}, [productRuntimeActive, stateRef]);',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native sequencer controls must no-op before event construction outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeManualTriggers.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'const productRuntimeActiveRef = useRef(productRuntimeActive);',
          'productRuntimeActiveRef.current = productRuntimeActive;',
          'if (!productRuntimeActiveRef.current) return;',
          'if (!productRuntimeActive) return;',
          'shouldWaitForManualTriggerSnapshot()',
          'commitProductControlActionThenTrigger(',
          'productEngine.auditionSynthNote(productNote, resolvedSliders)',
          'productEngine.triggerDrumVoice(voice, velocity, externalState)',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product-native manual triggers must no-op before lifecycle reads, Product Control commits, queued synth auditions, or direct triggers outside core-product mode; missing ${requiredSnippet}`);
          }
        }
      }
      if (relative === 'src/ui/useProductRuntimeSynthPageEvents.ts') {
        for (const requiredSnippet of [
          "import { productEngine } from '../audio/product/ProductEngineProxy'",
          'createCoreProductAnchorWalkerPerformanceEvent',
          'createCoreProductGeneratedSequencerCaptureEvent',
          'const productRuntimeActive = productRuntimeMode === \'core-product\';',
          'if (!productRuntimeActive) return;',
          'productEngine.enqueueEvent(createCoreProductAnchorWalkerPerformanceEvent(',
          'productEngine.enqueueEvent(createCoreProductGeneratedSequencerCaptureEvent(request))',
          'if (!productRuntimeActive) return EMPTY_GENERATED_CAPTURE_TELEMETRY;',
          'const telemetry = productEngine.getTelemetry();',
        ]) {
          if (!source.includes(requiredSnippet)) {
            failures.push(`${relative}: Product synth page events must own Product Core event construction and generated capture telemetry reads behind core-product mode gates; missing ${requiredSnippet}`);
          }
        }
      }
      continue;
    }

    if (relative === 'src/ui/synth/SynthPage.tsx') {
      for (const forbiddenToken of [
        "from '../../audio/product/ProductEngineProxy'",
        'productEngine.',
        'createCoreProductAnchorWalkerPerformanceEvent',
        'createCoreProductGeneratedSequencerCaptureEvent',
      ]) {
        if (source.includes(forbiddenToken)) {
          failures.push(`${relative}: SynthPage must receive Product runtime event/telemetry callbacks through page runtime props instead of touching Product Core directly (${forbiddenToken})`);
        }
      }
      for (const requiredSnippet of [
        "from '../useProductRuntimeSynthPageEvents'",
        'sendProductAnchorWalkerPerformanceEvent?: ProductRuntimeSynthPageEvents',
        'setProductGeneratedSequencerCaptureEnabled?: ProductRuntimeSynthPageEvents',
        'getProductGeneratedSequencerCaptureTelemetry?: ProductRuntimeSynthPageEvents',
        'sendProductAnchorWalkerPerformanceEvent?.(targetLane, event)',
        'setProductGeneratedSequencerCaptureEnabled?.(request)',
        'const telemetry = getProductGeneratedSequencerCaptureTelemetry?.();',
        'const events = telemetry?.events ?? [];',
        'const overflowCount = telemetry?.overflowCount ?? 0;',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: SynthPage must consume generated capture and Anchor Walker runtime callbacks through props; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/app/useProductDawOutputSync.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'productRuntimeMode: ProductRuntimeSelectionMode;',
        'const productRuntimeActive = productRuntimeMode === \'core-product\';',
        'productRuntimeActive ? getActiveDawOutputSourceIds(state) as DawOutputSourceId[] : []',
        'saveDawOutputRoutingConfig(config);',
        'if (!productRuntimeActive) return;',
        'productEngine.setDawOutputRouting(filterDawOutputRoutingConfigForSources(config, activeDawOutputSources))',
        'saveDawOutputDeviceSelection(selection);',
        'productEngine.setDawOutputDeviceId(selection.deviceId || null)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: Product DAW output sync must persist user routing settings but no-op Product Engine routing/device mutations outside core-product mode; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/app/useProductDrumMorphOverrides.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'createInitialProductControlState',
        'reduceProductControlState',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'const productRuntimeActive = productRuntimeMode === \'core-product\';',
        'const fallbackControlStateRef = useRef<ProductControlState | null>(null);',
        'if (productRuntimeActive) {',
        'fallbackControlStateRef.current = null;',
        'if (!productRuntimeActive) {',
        'return getFallbackControlState(sourceState).drumMorphOverrides;',
        'const next = reduceProductControlState(previous, action);',
        'dispatchProductControlActionForProductEngine(productEngine, sourceState, action)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: Product drum morph override access must use local pure Product Control state outside core-product mode and Product Engine state only in core-product mode; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useProductRuntimePageRuntimeBridges.ts') {
      assertProductPageRuntimeBridgeBoundary(relative, source);
      continue;
    }

    if (relative === 'src/App.tsx') {
      if (source.includes('audioEngine.') || source.includes('productEngine.')) {
        failures.push(`${relative}: App must consume selected runtime hooks instead of directly calling audioEngine/productEngine`);
      }
      if (!source.includes('useProductDrumMorphOverrides(productRuntimeMode)')) {
        failures.push(`${relative}: App must pass productRuntimeMode into useProductDrumMorphOverrides so drum morph Product Control access stays runtime-mode gated`);
      }
      const directSelectedRuntimeCalls = [...source.matchAll(appSelectedRuntimeCallPattern)]
        .map((match) => match[0].replace(/\s*\($/, ''))
        .filter((callName) => !appSelectedRuntimeCallAllowlist.has(callName));
      if (directSelectedRuntimeCalls.length > 0) {
        failures.push(`${relative}: App must inject selected runtime methods into hooks/bridges instead of directly calling ${[...new Set(directSelectedRuntimeCalls)].sort().join(', ')}`);
      }
      if (source.includes("from './ui/useSelectedAudioEngineSurface'") || source.includes('useSelectedAudioEngineSurface(')) {
        failures.push(`${relative}: App must not use the broad selected runtime surface; route selected runtime controls through focused surfaces`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEngineRuntimeLifecycleSurface'") ||
        source.includes('useSelectedAudioEngineRuntimeLifecycleSurface({')
      ) {
        failures.push(`${relative}: App must reach runtime lifecycle wiring through useProductRuntimeLifecycleSurface instead of selected AudioEngine lifecycle imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeLifecycleSurface'") ||
        !source.includes('useProductRuntimeLifecycleSurface({') ||
        source.includes("from './ui/useSelectedAudioEngineStateRuntime'") ||
        source.includes('useSelectedAudioEngineStateRuntime({') ||
        source.includes("from './ui/useSelectedAudioEngineStateReconciliationSurface'") ||
        source.includes("from './ui/useSelectedAudioEngineStateReconciliation'") ||
        source.includes("from './ui/useSelectedAudioEngineTransportDebug'") ||
        source.includes('useSelectedAudioEngineStateReconciliationSurface(audioEngineRuntimeMode)') ||
        source.includes('useSelectedAudioEngineStateReconciliation({') ||
        source.includes('useSelectedAudioEngineTransportDebug({')
      ) {
        failures.push(`${relative}: App must route selected engine-state and transport debug wiring through useProductRuntimeLifecycleSurface`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeLifecycleSurface'") ||
        !source.includes('useProductRuntimeLifecycleSurface({') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeTelemetry'") ||
        source.includes('useSelectedAudioEngineRuntimeTelemetry({') ||
        source.includes("from './ui/useSelectedAudioEngineTelemetrySurface'") ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeCapabilities'") ||
        source.includes('useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode)') ||
        source.includes('useSelectedAudioEngineRuntimeCapabilities({') ||
        source.includes('setSelectedVisualTelemetryActive,')
      ) {
        failures.push(`${relative}: App must route selected runtime telemetry, MIDI, and range support through useProductRuntimeLifecycleSurface`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineCallbackSurfaces'") ||
        source.includes('useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineSequencerCallbacks'") ||
        source.includes("from './ui/useSelectedAudioEngineLiveTriggerSurface'") ||
        source.includes("from './ui/useSelectedAudioEngineEvolveOverrideSurface'") ||
        source.includes('useSelectedAudioEngineSequencerCallbacks(audioEngineRuntimeMode)') ||
        source.includes('useSelectedAudioEngineLiveTriggerSurface(audioEngineRuntimeMode)') ||
        source.includes('useSelectedAudioEngineEvolveOverrideSurface(audioEngineRuntimeMode)')
      ) {
        failures.push(`${relative}: App must route selected runtime callback surfaces through useProductRuntimeSurfaces`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        !source.includes('productRuntimeDebugAnalysers,') ||
        !source.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') ||
        !source.includes('{...productPageRuntimeSurface.dynamicsPageRuntimeProps}') ||
        source.includes("from './ui/useSelectedAudioEngineDebugRuntime'") ||
        source.includes('useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineDebugSurface'") ||
        source.includes("from './ui/useSelectedAudioEngineDebugAnalyserBridge'") ||
        source.includes('useSelectedAudioEngineDebugSurface(') ||
        source.includes('useSelectedAudioEngineDebugAnalyserBridge({') ||
        source.includes('getAnalyserNode={selectedAudioEngineDebugAnalysers.drumVoiceAnalyser}') ||
        source.includes('getDynamicsAnalyser={selectedAudioEngineDebugAnalysers.dynamicsAnalyser}') ||
        source.includes('getAnalyserNode={referenceDrumVoiceAnalyser}') ||
        source.includes('getDynamicsAnalyser={referenceDynamicsAnalyser}')
      ) {
        failures.push(`${relative}: App must pass reference/debug getters through selected page runtime props`);
      }
      if (
        !source.includes('getEarthTextureDebugState') ||
        source.includes('getSelectedEarthTextureDebugState') ||
        source.includes('const getEarthTextureDebugState = useCallback(')
      ) {
        failures.push(`${relative}: App must consume the Earth texture debug getter through useSelectedAudioEngineDebugRuntime`);
      }
      if (
        !source.includes("from './ui/ProductRuntimeSwitch'") ||
        !source.includes('<ProductRuntimeSwitch') ||
        source.includes("from './ui/SelectedAudioEngineRuntimeSwitch'") ||
        source.includes('<SelectedAudioEngineRuntimeSwitch') ||
        source.includes("from './ui/AudioEngineRuntimeSwitch'") ||
        source.includes('<AudioEngineRuntimeSwitch')
      ) {
        failures.push(`${relative}: App must render runtime switching through ProductRuntimeSwitch instead of AudioEngine-named/raw switch markup`);
      }
      if (source.includes('coreSmokeModeAvailable') || !source.includes('{...globalRuntimeProps}')) {
        failures.push(`${relative}: App must pass the product-owned Global runtime props to child UI instead of deriving core-smoke availability`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEngineGlobalRuntimeSurface'") ||
        source.includes('useSelectedAudioEngineGlobalRuntimeSurface({')
      ) {
        failures.push(`${relative}: App must reach Global runtime props through useProductRuntimeGlobalSurface instead of selected AudioEngine Global imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeGlobalSurface'") ||
        !source.includes('useProductRuntimeGlobalSurface({') ||
        !source.includes('{...globalRuntimeProps}') ||
        !source.includes("from './ui/useProductRuntimeLifecycleSurface'") ||
        !source.includes('useProductRuntimeLifecycleSurface({') ||
        !source.includes('{...snowflakeRecordingProps}') ||
        source.includes("from './ui/useSelectedAudioEngineGlobalRuntimeProps'") ||
        source.includes('useSelectedAudioEngineGlobalRuntimeProps({') ||
        source.includes("from './ui/useSelectedAudioEngineRecordingRuntime'") ||
        source.includes('useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useAudioRecording'") ||
        source.includes('useAudioRecording(audioEngineRuntimeMode)')
      ) {
        failures.push(`${relative}: App must consume recording controls through useProductRuntimeLifecycleSurface instead of owning reference recording state`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeLifecycleSurface'") ||
        !source.includes('useProductRuntimeLifecycleSurface({') ||
        source.includes("from './ui/useSelectedAudioEngineMacRecovery'") ||
        source.includes('useSelectedAudioEngineMacRecovery({')
      ) {
        failures.push(`${relative}: App must delegate macOS reference audio-context recovery to useProductRuntimeLifecycleSurface`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeLifecycleSurface'") ||
        !source.includes('useProductRuntimeLifecycleSurface({') ||
        !source.includes('productRuntimeSupportsRangeKey')
      ) {
        failures.push(`${relative}: App must consume selected runtime telemetry capabilities instead of interpreting Product Core range/telemetry support directly`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEngineRuntimeCallbackRegistrations'") ||
        source.includes('useSelectedAudioEngineRuntimeCallbackRegistrations({')
      ) {
        failures.push(`${relative}: App must reach runtime callback registration through useProductRuntimeCallbackRegistrations instead of selected AudioEngine callback imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeCallbackRegistrations'") ||
        !source.includes('useProductRuntimeCallbackRegistrations({') ||
        source.includes("from './ui/useSelectedAudioEngineVisualizerCallbacks'") ||
        source.includes('useSelectedAudioEngineVisualizerCallbacks({')
      ) {
        failures.push(`${relative}: App must delegate visualizer runtime callback registration to useProductRuntimeCallbackRegistrations`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeCallbackRegistrations'") ||
        !source.includes('useProductRuntimeCallbackRegistrations({') ||
        source.includes("from './ui/useSelectedAudioEngineLiveTriggerCallbacks'") ||
        source.includes('useSelectedAudioEngineLiveTriggerCallbacks({')
      ) {
        failures.push(`${relative}: App must delegate live source/FX runtime callback registration to useProductRuntimeCallbackRegistrations`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineCallbackSurfaces'") ||
        source.includes('useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode)') ||
        source.includes('productEngine.setLeadExpressionCallback(') ||
        source.includes('productEngine.setLeadMorphCallback(') ||
        source.includes('productEngine.setPadMorphTriggerCallback(') ||
        source.includes('productEngine.setPad2MorphTriggerCallback(') ||
        source.includes('productEngine.setLeadDistanceCallback(') ||
        source.includes('productEngine.setPadDistanceTriggerCallback(') ||
        source.includes('productEngine.setPad2DistanceTriggerCallback(') ||
        source.includes('productEngine.setPianoDistanceTriggerCallback(') ||
        source.includes('productEngine.setLeadDelayCallback(') ||
        source.includes('productEngine.setDrumMorphTriggerCallback(') ||
        source.includes('productEngine.setDrumParamSHTriggerCallback(') ||
        source.includes('productEngine.setGranularSHTriggerCallback(')
      ) {
        failures.push(`${relative}: App must route live source/FX trigger callback surfaces through useProductRuntimeSurfaces`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineControlSurfaces'") ||
        source.includes('useSelectedAudioEngineControlSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineMorphRuntimeSurface'") ||
        source.includes('useSelectedAudioEngineMorphRuntimeSurface(audioEngineRuntimeMode)') ||
        source.includes('productEngine.setJourneyMorphClockCallback(') ||
        source.includes('productEngine.startJourneyMorphClock(') ||
        source.includes('productEngine.stopJourneyMorphClock(') ||
        source.includes('productEngine.resetCofDrift(')
      ) {
        failures.push(`${relative}: App must route journey morph clock and CoF drift through useProductRuntimeSurfaces`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEngineRuntimeCoordination'") ||
        source.includes('useSelectedAudioEngineRuntimeCoordination({')
      ) {
        failures.push(`${relative}: App must reach runtime coordination through useProductRuntimeCoordination instead of selected AudioEngine coordination imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeCoordination'") ||
        !source.includes('useProductRuntimeCoordination({') ||
        source.includes("from './ui/useSelectedAudioEngineEvolveOverrideCallbacks'") ||
        source.includes('useSelectedAudioEngineEvolveOverrideCallbacks({') ||
        !source.includes('drumEvolvedOverrides') ||
        !source.includes('synthEvolvedOverrides')
      ) {
        failures.push(`${relative}: App must delegate evolved sequencer selected-runtime callback registration to useProductRuntimeCoordination`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineCallbackSurfaces'") ||
        source.includes('useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode)') ||
        source.includes('productEngine.setDrumEvolveOverridesChangedCallback(') ||
        source.includes('productEngine.setSynthEvolveOverridesChangedCallback(') ||
        source.includes('productEngine.setSynthNoteRangeEvolvedCallback(')
      ) {
        failures.push(`${relative}: App must route evolved sequencer callback surfaces through useProductRuntimeSurfaces`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineControlSurfaces'") ||
        source.includes('useSelectedAudioEngineControlSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineSequencerControls'") ||
        source.includes('useSelectedAudioEngineSequencerControls(audioEngineRuntimeMode)') ||
        source.includes('productEngine.setDrumEuclidEvolveConfigs(') ||
        source.includes('productEngine.setSynthEuclidEvolveConfigs(') ||
        source.includes('productEngine.setDrumEuclidClockDivs(') ||
        source.includes('productEngine.setSynthEuclidClockDivs(') ||
        source.includes('productEngine.setDrumEuclidSwings(') ||
        source.includes('productEngine.setSynthEuclidSwings(') ||
        source.includes('productEngine.setDrumSubLaneEnabled(') ||
        source.includes('productEngine.setSynthSubLaneEnabled(') ||
        source.includes('productEngine.setDrumPitchSettings(') ||
        source.includes('productEngine.setSynthPitchSettings(') ||
        source.includes('productEngine.setSynthPitchBindingModes(') ||
        source.includes('productEngine.setDrumStepOverrides(') ||
        source.includes('productEngine.setSynthStepOverrides(') ||
        source.includes('productEngine.setSequencerPresetHomeSnapshots(') ||
        source.includes('productEngine.resetSynthEuclidLaneHome(') ||
        source.includes('productEngine.captureSynthEuclidLaneHome(') ||
        source.includes('productEngine.diceSynthEuclidLane(') ||
        source.includes('productEngine.resetDrumEuclidLaneHome(') ||
        source.includes('productEngine.captureDrumEuclidLaneHome(') ||
        source.includes('productEngine.diceDrumEuclidLane(')
      ) {
        failures.push(`${relative}: App must route sequencer setters and lane controls through useProductRuntimeSurfaces`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeCoordination'") ||
        !source.includes('useProductRuntimeCoordination({') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeValueCleanup'") ||
        source.includes('useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);') ||
        source.includes('removeRuntimeValues([')
      ) {
        failures.push(`${relative}: App must delegate stopped-playback runtime value cleanup to useProductRuntimeCoordination`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeCoordination'") ||
        !source.includes('useProductRuntimeCoordination({') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeWalkSync'") ||
        source.includes('useSelectedAudioEngineRuntimeWalkSync({') ||
        source.includes('setSelectedRuntimeWalkRanges(walkRanges)') ||
        source.includes('setSelectedRuntimeWalkPositionsCallback((positions) =>')
      ) {
        failures.push(`${relative}: App must delegate selected-runtime random-walk range sync and position mirroring to useProductRuntimeCoordination`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSurfaces'") ||
        !source.includes('useProductRuntimeSurfaces({ productRuntimeMode, stateRef })') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineControlSurfaces'") ||
        source.includes('useSelectedAudioEngineControlSurfaces(audioEngineRuntimeMode)') ||
        source.includes("from './ui/useSelectedAudioEngineModulationRanges'") ||
        source.includes('useSelectedAudioEngineModulationRanges(audioEngineRuntimeMode)') ||
        source.includes('productEngine.setRuntimeWalkPositionsCallback(') ||
        source.includes('productEngine.setDrumMorphRange(') ||
        source.includes('productEngine.setDrumParamSHRange(') ||
        source.includes('productEngine.setDualRanges(') ||
        source.includes('productEngine.setRuntimeWalkRanges(')
      ) {
        failures.push(`${relative}: App must route modulation and walk range callbacks through useProductRuntimeSurfaces`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeCoordination'") ||
        !source.includes('useProductRuntimeCoordination({') ||
        source.includes("from './ui/useSelectedAudioEngineRangeSync'") ||
        source.includes('useSelectedAudioEngineRangeSync({') ||
        source.includes('setSelectedDrumMorphRange(voice, range)') ||
        source.includes('setSelectedDrumParamSHRange(key, range)') ||
        source.includes('setSelectedDualRanges(engineRanges)')
      ) {
        failures.push(`${relative}: App must delegate selected-runtime sample-hold range sync to useProductRuntimeCoordination`);
      }
      const dualSliderRuntimeStatePath = path.join(root, 'src/app/useDualSliderRuntimeState.ts');
      const dualSliderRuntimeStateSource = fs.existsSync(dualSliderRuntimeStatePath)
        ? fs.readFileSync(dualSliderRuntimeStatePath, 'utf8')
        : '';
      if (
        !source.includes("from './ui/runtimeWalkPositionSync'") ||
        !source.includes("from './app/useDualSliderRuntimeState'") ||
        !dualSliderRuntimeStateSource.includes("from '../ui/runtimeWalkPositionSync'") ||
        source.includes('mergeRuntimeWalkPositions') ||
        source.includes('removeRuntimeWalkPositions') ||
        source.includes('replaceRuntimeWalkPositions') ||
        !source.includes('usePresetRestoreRuntimeSurface({') ||
        source.includes('replaceRuntimeWalkPositionSnapshot(newWalkPositions)') ||
        source.includes('replaceRuntimeWalkPositionSnapshot({})') ||
        !dualSliderRuntimeStateSource.includes('clearRuntimeWalkPositions([keyStr])') ||
        !dualSliderRuntimeStateSource.includes('seedRuntimeWalkPosition(keyStr)') ||
        !`${source}\n${dualSliderRuntimeStateSource}`.includes('resetRuntimeWalkPositionsForKeys(') ||
        !source.includes('resetRuntimeWalkPositionsForModes,') ||
        source.includes('removeRuntimeWalkPositions(morphWalkKeys)') ||
        source.includes('mergeRuntimeWalkPositions(newWalkPositions)')
      ) {
        failures.push(`${relative}: App must delegate granular/morph runtime walk indicator resets to runtimeWalkPositionSync helpers`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeLifecycleSurface'") ||
        !source.includes('useProductRuntimeLifecycleSurface({') ||
        !source.includes('getProductTransportDebugState,') ||
        source.includes("from './ui/useSelectedAudioEngineStateReconciliation'") ||
        source.includes("from './ui/useSelectedAudioEngineTransportDebug'") ||
        source.includes("from './ui/useSelectedAudioEngineStateRuntime'") ||
        source.includes('useSelectedAudioEngineStateRuntime({')
      ) {
        failures.push(`${relative}: App must delegate selected engine-state reconciliation and transport debug polling to useProductRuntimeLifecycleSurface`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEnginePlaybackSurface'") ||
        source.includes('useSelectedAudioEnginePlaybackSurface({')
      ) {
        failures.push(`${relative}: App must reach playback orchestration through useProductRuntimePlaybackSurface instead of selected AudioEngine playback imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSession'") ||
        !source.includes('useProductRuntimeShell({') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeShell'") ||
        source.includes('useSelectedAudioEngineRuntimeShell({') ||
        !source.includes("from './ui/useProductRuntimePlaybackSurface'") ||
        !source.includes('useProductRuntimePlaybackSurface({') ||
        source.includes("from './ui/useSelectedAudioEngineStartAction'") ||
        source.includes('useSelectedAudioEngineStartAction({') ||
        source.includes('prepareSelectedPlaybackStartState') ||
        source.includes("from './ui/useSelectedAudioEnginePlaybackStartState'") ||
        source.includes('useSelectedAudioEnginePlaybackStartState({') ||
        source.includes('const prepareSelectedPlaybackStartState = useCallback(async') ||
        source.includes("from './ui/useSelectedAudioEngineJourneyPlaybackAction'") ||
        source.includes('useSelectedAudioEngineJourneyPlaybackAction({') ||
        !source.includes('startJourneyPlayback,') ||
        source.includes("from './ui/useSelectedAudioEngineStopAction'") ||
        source.includes('useSelectedAudioEngineStopAction({') ||
        !source.includes('stopJourney: backgroundJourney.stop') ||
        source.includes("from './ui/useSelectedAudioEnginePlaybackUiProps'") ||
        source.includes('useSelectedAudioEnginePlaybackUiProps({') ||
        !source.includes('{...snowflakePrototypePlaybackProps}') ||
        !source.includes('{...journeyPlaybackProps}') ||
        !source.includes('{...snowflakePlaybackProps}') ||
        !source.includes('!advancedTransportButton.isPlaying') ||
        source.includes('onTogglePlay={playbackIsRunning || isJourneyPlaying ? handleStop : handleStart}') ||
        source.includes('onStopAudio={handleStop}') ||
        source.includes("from './ui/useSelectedAudioEnginePlaybackRuntime'") ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeUi'") ||
        source.includes('useSelectedAudioEnginePlaybackRuntime({') ||
        source.includes('useSelectedAudioEngineRuntimeUi({') ||
        source.includes("from './ui/useSelectedAudioEngineLifecycle'") ||
        source.includes("from './ui/useSelectedAudioEngineMediaSession'") ||
        source.includes("from './ui/useSelectedAudioEnginePlaybackControls'") ||
        source.includes('useSelectedAudioEngineLifecycle(') ||
        source.includes('useSelectedAudioEngineMediaSession({') ||
        source.includes('useSelectedAudioEnginePlaybackControls({')
      ) {
        failures.push(`${relative}: App must delegate selected lifecycle, media-session, and playback orchestration to useProductRuntimePlaybackSurface/useProductRuntimeSession`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePlaybackSurface'") ||
        !source.includes('useProductRuntimePlaybackSurface({') ||
        !source.includes('fadeProductRuntimeOutput,') ||
        source.includes("from './ui/useSelectedAudioEnginePresetLoadFade'") ||
        source.includes('useSelectedAudioEnginePresetLoadFade({') ||
        source.includes('const fadeEngineOutput = useCallback(') ||
        source.includes('await fadeSelectedAudioEngineOutput(target, durationMs)') ||
        source.includes('setSelectedOutputGain') ||
        source.includes('durationMs / 1000')
      ) {
        failures.push(`${relative}: App must delegate preset-load output fade orchestration to useSelectedAudioEnginePresetLoadFade and gain routing to useSelectedAudioEnginePlaybackRuntime`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeSurface'") ||
        source.includes('useSelectedAudioEnginePageRuntimeSurface({')
      ) {
        failures.push(`${relative}: App must reach page runtime props through useProductRuntimePageSurface instead of selected AudioEngine page imports`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEngineManualTriggers'") ||
        source.includes('useSelectedAudioEngineManualTriggers({')
      ) {
        failures.push(`${relative}: App must reach manual synth/drum triggers through useProductRuntimeManualTriggers instead of selected AudioEngine imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeManualTriggers'") ||
        !source.includes('useProductRuntimeManualTriggers({') ||
        !source.includes("from './ui/useProductRuntimePageSurface'") ||
        !source.includes('useProductRuntimePageSurface({') ||
        !source.includes('telemetry: {') ||
        !source.includes('sequencer: {') ||
        !source.includes('control: {') ||
        !source.includes('productPageRuntimeSurface') ||
        !source.includes('productRuntimeMode,') ||
        !source.includes('productRuntimeManualTriggers,') ||
        !source.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') ||
        !source.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') ||
        source.includes('onAuditionNote={selectedAudioEngineManualTriggers.auditionSynthNote}') ||
        source.includes('triggerVoice={selectedAudioEngineManualTriggers.triggerDrumVoice}') ||
        source.includes('selectedAudioEngineManualTriggers,') ||
        source.includes('auditionSelectedSynthNote') ||
        source.includes('triggerSelectedDrumVoice') ||
        source.includes('void auditionSelectedSynthNote(note, state') ||
        source.includes('void triggerSelectedDrumVoice(voice, 0.8, state')
      ) {
        failures.push(`${relative}: App must delegate manual synth/drum selected-runtime trigger props to useProductRuntimeManualTriggers`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEngineMorphRuntime'") ||
        source.includes('useSelectedAudioEngineMorphRuntime({') ||
        source.includes('setSelectedJourneyMorphClockCallback: setSelectedJourneyMorphClockCallbackRuntime') ||
        source.includes('startSelectedJourneyMorphClock: startSelectedJourneyMorphClockRuntime') ||
        source.includes('stopSelectedJourneyMorphClock: stopSelectedJourneyMorphClockRuntime') ||
        source.includes('resetSelectedCofDrift: resetSelectedCofDriftRuntime')
      ) {
        failures.push(`${relative}: App must reach CoF drift and journey morph clock runtime ownership through useProductRuntimeMorphSurface instead of selected AudioEngine imports`);
      }
      if (
        !source.includes('setProductJourneyMorphClockCallback: setProductJourneyMorphClockCallbackRuntime') ||
        !source.includes('startProductJourneyMorphClock: startProductJourneyMorphClockRuntime') ||
        !source.includes('stopProductJourneyMorphClock: stopProductJourneyMorphClockRuntime') ||
        !source.includes('resetProductCofDrift: resetProductCofDriftRuntime')
      ) {
        failures.push(`${relative}: App must pass product-named journey morph runtime controls into useProductRuntimeMorphSurface`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeMorphSurface'") ||
        !source.includes('useProductRuntimeMorphSurface({') ||
        !source.includes("from './ui/useMorphPositionRuntimeSurface'") ||
        !source.includes('useMorphPositionRuntimeSurface({') ||
        !source.includes("from './ui/useMorphSlotLoadRuntimeSurface'") ||
        !source.includes('useMorphSlotLoadRuntimeSurface<SavedPreset>({') ||
        !source.includes("from './ui/useJourneyMorphRuntimeSurface'") ||
        !source.includes('useJourneyMorphRuntimeSurface({') ||
        source.includes('const handleMorphPositionChange = useCallback') ||
        source.includes('const presetEntryToSavedPreset = useCallback') ||
        source.includes('function getLinkedVisualizerPresetName') ||
        source.includes('const handleLoadMorphA = useCallback') ||
        source.includes('const handleLoadMorphB = useCallback') ||
        source.includes('const prevMorphPresetARef = useRef') ||
        source.includes('const prevMorphPresetBRef = useRef') ||
        source.includes('const morphPlayTimeoutRef = useRef') ||
        source.includes('const currentPhaseRef = useRef') ||
        source.includes('const transitionToPhase = (phase: MorphPhase)') ||
        source.includes('const scheduleNextTick = () =>') ||
        source.includes('resetSelectedCofDrift();') ||
        source.includes('setSelectedJourneyMorphClockCallback(animateMorph)') ||
        source.includes('setSelectedJourneyMorphClockCallback(null)') ||
        source.includes('startSelectedJourneyMorphClock();') ||
        source.includes('stopSelectedJourneyMorphClock();')
      ) {
        failures.push(`${relative}: App must delegate CoF drift resets, manual/auto morph runtime sync, morph slot loading, and journey morph clock ownership to product morph runtime surfaces`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEnginePlatformRuntimeSurface'") ||
        source.includes('useSelectedAudioEnginePlatformRuntimeSurface({')
      ) {
        failures.push(`${relative}: App must reach platform runtime sync through useProductRuntimePlatformSurface instead of selected AudioEngine platform imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePlatformSurface'") ||
        !source.includes('useProductRuntimePlatformSurface({') ||
        source.includes("from './ui/useSelectedAudioEngineCapacitorAudioSession'") ||
        source.includes('useSelectedAudioEngineCapacitorAudioSession({') ||
        source.includes("from './ui/useCapacitorAudioSessionDiagnostics'") ||
        source.includes("from './ui/useSelectedAudioEngineRemoteCommandPlayback'") ||
        source.includes('handleCapacitorAudioSessionRemoteCommand') ||
        source.includes('onRemoteCommand: handleCapacitorAudioSessionRemoteCommand') ||
        source.includes('command === \'play\'') ||
        source.includes('command === \'pause\'')
      ) {
        failures.push(`${relative}: App must delegate Capacitor audio-session diagnostics/listener sync and remote-command playback routing to selected runtime hooks`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePlatformSurface'") ||
        !source.includes('useProductRuntimePlatformSurface({') ||
        source.includes("from './ui/useCapacitorMacAudioStatus'") ||
        source.includes('useCapacitorMacAudioStatus({') ||
        !source.includes('openMacSoundSettings') ||
        !source.includes('macAirPlayPerformanceActive')
      ) {
        failures.push(`${relative}: App must delegate macOS native output polling/playback sync to useProductRuntimePlatformSurface`);
      }
      if (
        !source.includes("from './ui/usePlatformRuntimeCapabilities'") ||
        !source.includes('usePlatformRuntimeCapabilities({') ||
        !source.includes('shouldInitializeCloudPresetStore')
      ) {
        failures.push(`${relative}: App must delegate native/mac shell classification and preset-library routing to usePlatformRuntimeCapabilities`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeGlobalSurface'") ||
        !source.includes('useProductRuntimeGlobalSurface({') ||
        source.includes("from './ui/useSelectedAudioEnginePlaybackTimer'") ||
        source.includes('useSelectedAudioEnginePlaybackTimer({') ||
        source.includes("from './ui/useSelectedAudioEngineGlobalRuntimeProps'") ||
        source.includes('useSelectedAudioEngineGlobalRuntimeProps({') ||
        !source.includes('resetPlaybackTimer,') ||
        !source.includes('useProductRuntimePlaybackSurface({') ||
        !source.includes('{...globalRuntimeProps}')
      ) {
        failures.push(`${relative}: App must delegate playback timer countdown and Global runtime prop assembly to useProductRuntimeGlobalSurface`);
      }
      if (
        !source.includes("from './ui/usePresetBootstrapRuntimeSurface'") ||
        !source.includes('usePresetBootstrapRuntimeSurface<SavedPreset>({') ||
        source.includes("from './ui/useCloudPresetStoreBootstrap'") ||
        source.includes('useCloudPresetStoreBootstrap<SavedPreset>({') ||
        source.includes('loadCloudAutoStartPresetRef') ||
        source.includes('loadCloudAutoStartPresetFromBootstrap') ||
        !source.includes('cloudPresetStoreReadyPromiseRef') ||
        !source.includes('resolveDefaultAutoStartPreset')
      ) {
        failures.push(`${relative}: App must delegate cloud preset bootstrap/readiness and auto-start handoff to usePresetBootstrapRuntimeSurface`);
      }
      if (
        !source.includes("from './ui/usePresetLibraryRuntimeSurface'") ||
        !source.includes('usePresetLibraryRuntimeSurface<SavedPreset>({') ||
        !source.includes("from './ui/useCloudSharedPresetRuntimeSurface'") ||
        !source.includes('useCloudSharedPresetRuntimeSurface({') ||
        source.includes("from './ui/usePresetLibraryLoader'") ||
        source.includes('usePresetLibraryLoader<SavedPreset>({') ||
        source.includes('const cloudSharedPresetToSavedPreset = useCallback') ||
        source.includes('const applyCloudSharedPreset = useCallback') ||
        !source.includes('loadCloudBackedPresets: loadActiveStatePresetStorePresets') ||
        !source.includes('onCloudSharedPresetLoaded: applyCloudSharedPreset')
      ) {
        failures.push(`${relative}: App must delegate preset library source selection, cloud share fetches, and cloud preset Product sync to preset runtime surfaces`);
      }
      if (
        !source.includes("from './ui/usePresetLibraryRuntimeSurface'") ||
        !source.includes('usePresetLibraryRuntimeSurface<SavedPreset>({') ||
        source.includes("from './ui/useSavedPresetResolver'") ||
        source.includes('useSavedPresetResolver<SavedPreset>({') ||
        !source.includes('loadPresetByName: loadActiveStatePresetStorePresetByName') ||
        !source.includes('sortPresets: sortSavedStatePresetsByFreshness')
      ) {
        failures.push(`${relative}: App must delegate deferred/cloud saved-preset resolution to usePresetLibraryRuntimeSurface`);
      }
      if (
        !source.includes("from './ui/useSavedPresetLoadRuntimeSurface'") ||
        !source.includes('useSavedPresetLoadRuntimeSurface<SavedPreset>({') ||
        source.includes('const handleLoadPresetFromList = useCallback') ||
        source.includes('skipNextPresetLoadEngineSync();') ||
        source.includes('const warnings = checkPresetCompatibility(resolvedPreset)') ||
        source.includes('const resolvedPreset = await resolveSavedPresetForLoad(preset);')
      ) {
        failures.push(`${relative}: App must delegate saved preset list loading, compatibility warnings, morph basis capture, and Product preset-load sync to useSavedPresetLoadRuntimeSurface`);
      }
      if (
        source.includes("from './ui/useSelectedAudioEnginePresetRuntimeSurface'") ||
        source.includes('useSelectedAudioEnginePresetRuntimeSurface({')
      ) {
        failures.push(`${relative}: App must reach preset runtime sync through useProductRuntimePresetSurface instead of selected AudioEngine preset imports`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePresetSurface'") ||
        !source.includes('useProductRuntimePresetSurface({') ||
        source.includes("from './ui/useAudioEngineParamSync'") ||
        source.includes('useAudioEngineParamSync(audioEngineRuntimeMode)') ||
        source.includes("from './ui/usePresetEngineSync'") ||
        source.includes('usePresetEngineSync({')
      ) {
        failures.push(`${relative}: App must delegate selected preset/param runtime sync composition to useProductRuntimePresetSurface`);
      }
      if (
        !source.includes("from './ui/usePresetBootstrapRuntimeSurface'") ||
        !source.includes('usePresetBootstrapRuntimeSurface<SavedPreset>({') ||
        source.includes("from './ui/useAutoStartPresetResolver'") ||
        source.includes('useAutoStartPresetResolver<SavedPreset>({') ||
        source.includes('setCloudAutoStartPreset') ||
        !source.includes('resolveDefaultAutoStartPreset') ||
        !source.includes('loadBundledPresetByName')
      ) {
        failures.push(`${relative}: App must delegate default auto-start preset resolution to usePresetBootstrapRuntimeSurface`);
      }
      if (
        !source.includes("from './ui/usePresetBootstrapRuntimeSurface'") ||
        !source.includes('usePresetBootstrapRuntimeSurface<SavedPreset>({') ||
        source.includes("from './ui/usePresetPlatformMaintenance'") ||
        source.includes('usePresetPlatformMaintenance({') ||
        !source.includes('cloudPresetStoreReadyPromiseRef')
      ) {
        failures.push(`${relative}: App must delegate preset migration dev tools and factory seeding to usePresetBootstrapRuntimeSurface`);
      }
      if (
        !source.includes("from './ui/usePresetRestoreRuntimeSurface'") ||
        !source.includes('usePresetRestoreRuntimeSurface({') ||
        source.includes("import { usePresetSequencerRestore") ||
        source.includes('usePresetSequencerRestore({') ||
        source.includes('replaceRuntimeWalkPositionSnapshot(newWalkPositions)') ||
        source.includes('replaceRuntimeWalkPositionSnapshot({})') ||
        source.includes('setSelectedSequencerPresetHomeSnapshots();') ||
        source.includes('function drumStepOverridesForEngineRestore(') ||
        source.includes('function synthStepOverridesForEngineRestore(')
      ) {
        failures.push(`${relative}: App must delegate preset dual-range and sequencer selected-runtime restore sync to usePresetRestoreRuntimeSurface`);
      }
      if (
        !source.includes("from './ui/useJourneyPresetRuntimeSurface'") ||
        !source.includes('useJourneyPresetRuntimeSurface({') ||
        !source.includes('useJourneyPresetActionSurface({') ||
        !source.includes("from './ui/useJourneyOverrideRuntimeSurface'") ||
        !source.includes('useJourneyOverrideRuntimeSurface({') ||
        !source.includes("from './ui/useJourneyMorphRuntimeSurface'") ||
        !source.includes('useJourneyMorphRuntimeSurface({') ||
        source.includes("from './presets/journeyPresetCodec'") ||
        source.includes('validateJourneyConfig(') ||
        source.includes('type JourneyOverridePromptState') ||
        source.includes('journeyOverridePromptResolveRef') ||
        source.includes('setJourneyOverridePrompt') ||
        source.includes('const requestJourneyOverrideConfirmation = useCallback') ||
        source.includes('const confirmOverrideArmedJourneyForStatePreset = useCallback') ||
        source.includes('const applyJourneyDualSnapshot = useCallback') ||
        source.includes('const commitJourneyRuntimeState = useCallback') ||
        source.includes('const stopJourneyMorphPlayback = useCallback') ||
        source.includes('const handleJourneyLoadPreset = useCallback') ||
        source.includes('const handleJourneyMorphTo = useCallback') ||
        source.includes('const handleLoadJourneyPreset = useCallback') ||
        source.includes('const handleSaveJourneyPreset = useCallback') ||
        source.includes('const handleDeleteJourneyPreset = useCallback') ||
        source.includes('const handleUndoJourneyPreset = useCallback') ||
        source.includes('journeyPresets.load(') ||
        source.includes('journeyPresets.save(') ||
        source.includes('journeyPresets.remove(') ||
        source.includes('journeyPresets.restoreBackup(') ||
        source.includes('journeyPresets.validate(')
      ) {
        failures.push(`${relative}: App must delegate active journey preset validation, backup tracking, override prompts, journey start/morph actions, and preset actions to journey runtime surfaces`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePageSurface'") ||
        !source.includes('useProductRuntimePageSurface({') ||
        !source.includes('sequencer: {') ||
        !source.includes('control: {') ||
        !source.includes('onSubLaneStatesChange={productPageRuntimeSurface.synthPageSequencerBridge.onSubLaneStatesChange}') ||
        !source.includes('captureEvolveHome={productPageRuntimeSurface.synthPageSequencerBridge.captureEvolveHome}') ||
        !source.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') ||
        source.includes('onRequestPlaybackStart={requestSequencerPlaybackStart}') ||
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") ||
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") ||
        source.includes("from './ui/useSelectedAudioEnginePageControlRuntimeProps'") ||
        source.includes("from './ui/useSelectedAudioEnginePageSequencerRuntimeProps'") ||
        source.includes("from './ui/useSelectedAudioEnginePageTelemetryRuntimeProps'") ||
        source.includes('...pageControlRuntimeProps') ||
        source.includes('...pageSequencerRuntimeProps') ||
        source.includes('...pageTelemetryRuntimeProps') ||
        source.includes("from './ui/useSynthPageSequencerBridge'") ||
        source.includes('useSynthPageSequencerBridge({') ||
        source.includes('setSelectedSynthStepOverrides({') ||
        source.includes('captureEvolveHome={(laneIdx) => captureSelectedSynthEuclidLaneHome(')
      ) {
        failures.push(`${relative}: App must delegate Synth page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePageSurface'") ||
        !source.includes('useProductRuntimePageSurface({') ||
        !source.includes('sequencer: {') ||
        !source.includes('control: {') ||
        !source.includes('onSubLaneStatesChange={productPageRuntimeSurface.drumPageSequencerBridge.onSubLaneStatesChange}') ||
        !source.includes('captureEvolveHome={productPageRuntimeSurface.drumPageSequencerBridge.captureEvolveHome}') ||
        !source.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') ||
        source.includes('onRequestPlaybackStart={requestSequencerPlaybackStart}') ||
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") ||
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") ||
        source.includes("from './ui/useSelectedAudioEnginePageControlRuntimeProps'") ||
        source.includes("from './ui/useSelectedAudioEnginePageSequencerRuntimeProps'") ||
        source.includes("from './ui/useSelectedAudioEnginePageTelemetryRuntimeProps'") ||
        source.includes('...pageControlRuntimeProps') ||
        source.includes('...pageSequencerRuntimeProps') ||
        source.includes('...pageTelemetryRuntimeProps') ||
        source.includes("from './ui/useDrumPageSequencerBridge'") ||
        source.includes('useDrumPageSequencerBridge({') ||
        source.includes('setSelectedDrumStepOverrides(overrides);') ||
        source.includes('captureEvolveHome={(laneIdx) => captureSelectedDrumEuclidLaneHome(')
      ) {
        failures.push(`${relative}: App must delegate Drum page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges`);
      }
      if (
        !source.includes("from './ui/useProductRuntimePageSurface'") ||
        !source.includes('useProductRuntimePageSurface({') ||
        !source.includes('telemetry: {') ||
        !source.includes('control: {') ||
        !source.includes('productRuntimeDebugAnalysers,') ||
        !source.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') ||
        !source.includes('{...productPageRuntimeSurface.dynamicsPageRuntimeProps}') ||
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") ||
        source.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") ||
        source.includes("from './ui/useDrumPageRuntimeBridge'") ||
        source.includes('useDrumPageRuntimeBridge({') ||
        source.includes('preloadAudioEngine={preloadSelectedAudioEngine}') ||
        source.includes('selectedAudioEngineDebugAnalysers,') ||
        source.includes('selectedAudioEngineManualTriggers,') ||
        source.includes('preloadAudioEngine={drumPageRuntimeBridge.preloadAudioEngine}') ||
        source.includes('getAnalyserNode={selectedAudioEngineDebugAnalysers.drumVoiceAnalyser}') ||
        source.includes('getDynamicsAnalyser={selectedAudioEngineDebugAnalysers.dynamicsAnalyser}')
      ) {
        failures.push(`${relative}: App must delegate page manual trigger, analyser, and preload props through product-named page runtime bridge options`);
      }
      if (
        !source.includes("from './ui/useProductRuntimeSession'") ||
        !source.includes('resolveProductRuntimeInitialState({ normalizeState: normalizePresetForWeb })') ||
        !source.includes('useProductRuntimeSession()') ||
        !source.includes('useProductRuntimeShell({') ||
        !source.includes('useProductRuntimeGlobalSurface({') ||
        !source.includes('{...globalRuntimeProps}') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeSession'") ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeShell'") ||
        source.includes('resolveSelectedAudioEngineInitialState({ normalizeState: normalizePresetForWeb })') ||
        source.includes('useSelectedAudioEngineRuntimeSession()') ||
        source.includes('useSelectedAudioEngineRuntimeShell({') ||
        source.includes('useSelectedAudioEngineGlobalRuntimeProps({') ||
        source.includes('runtimeComparison={{') ||
        source.includes("from './ui/useSelectedAudioEngineRuntimeUi'") ||
        source.includes("from './ui/useAudioEngineRuntimeNavigation'") ||
        source.includes("from './ui/useSelectedAudioEnginePerf'") ||
        source.includes('readAudioEngineRuntimeSwitchState()') ||
        source.includes('useSelectedAudioEngineRuntimeMode()') ||
        source.includes('useAudioEngineRuntimeNavigation({') ||
        source.includes('useSelectedAudioEngineRuntimeSessionNavigation({')
      ) {
        failures.push(`${relative}: App must route runtime mode, switch-state restore, navigation, and perf UI through selected runtime session/UI hooks`);
      }
      if (
        !source.includes('preloadAdvancedEditorRuntime') ||
        !source.includes('preloadProductRuntime,') ||
        source.includes('void preloadSelectedAudioEngine();')
      ) {
        failures.push(`${relative}: App must delegate advanced-editor product runtime preload to useProductRuntimeShell`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineTransportDebug.ts') {
      for (const requiredSnippet of [
        'getSelectedTransportDebugState()',
        'setEngineState(prev =>',
        'Math.abs(current.effectiveBpm - transportDebug.effectiveBpm) < 0.05',
        'return { ...prev, transportDebug };',
        'useVisibleInterval(updateTransportDebug, 1000',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected transport debug polling must preserve App-era reconciliation behavior`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineStateRuntime.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineStateReconciliationSurface } from './useSelectedAudioEngineStateReconciliationSurface'",
        "import { useSelectedAudioEngineStateReconciliation } from './useSelectedAudioEngineStateReconciliation'",
        "import { useSelectedAudioEngineTransportDebug } from './useSelectedAudioEngineTransportDebug'",
        'useSelectedAudioEngineStateReconciliationSurface(audioEngineRuntimeMode)',
        'useSelectedAudioEngineStateReconciliation({',
        'setSelectedEngineStateChangeCallback,',
        'useSelectedAudioEngineTransportDebug({',
        'getSelectedTransportDebugState,',
        'setEngineState,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected state runtime hook must compose callback surface, reconciliation, and transport debug polling; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected state runtime hook must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeLifecycleSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineMacRecovery } from './useSelectedAudioEngineMacRecovery'",
        "import { useSelectedAudioEngineRecordingRuntime } from './useSelectedAudioEngineRecordingRuntime'",
        "import { useSelectedAudioEngineRuntimeTelemetry } from './useSelectedAudioEngineRuntimeTelemetry'",
        "import { useSelectedAudioEngineStateRuntime } from './useSelectedAudioEngineStateRuntime'",
        'useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode)',
        'useSelectedAudioEngineRuntimeTelemetry({',
        'useSelectedAudioEngineStateRuntime({',
        'getSelectedTransportDebugState,',
        'setEngineState,',
        'useSelectedAudioEngineMacRecovery({',
        'macShellAvailable,',
        'playbackIsRunning,',
        '...recordingRuntime',
        '...runtimeTelemetry',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected runtime lifecycle surface must compose recording, telemetry, state runtime, and Mac recovery; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: selected runtime lifecycle surface must compose selected runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeLifecycleSurface.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import type { ProductEngineState } from '../audio/product/ProductEngineTypes'",
        "import type { SliderState } from './state'",
        "import { useProductRuntimeMacRecovery } from './useProductRuntimeMacRecovery'",
        "import { useProductRuntimeRecordingRuntime } from './useProductRuntimeRecordingRuntime'",
        "import { useProductRuntimeStateRuntime } from './useProductRuntimeStateRuntime'",
        "import { useProductRuntimeTelemetry } from './useProductRuntimeTelemetry'",
        'type ProductRuntimeLifecycleSurfaceOptions = {',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'getProductTransportDebugState: () => ProductEngineState',
        'stateRef: MutableRefObject<SliderState>',
        'export function useProductRuntimeLifecycleSurface(options: ProductRuntimeLifecycleSurfaceOptions)',
        'useProductRuntimeRecordingRuntime(options.productRuntimeMode)',
        'useProductRuntimeTelemetry({',
        'useProductRuntimeStateRuntime({',
        'useProductRuntimeMacRecovery({',
        '...recordingRuntime',
        '...runtimeTelemetry',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime lifecycle surface must compose product-named lifecycle wrappers; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('Parameters<typeof useProductRuntimeTelemetry>') ||
        source.includes('Parameters<typeof useProductRuntimeStateRuntime>') ||
        source.includes('Parameters<typeof useProductRuntimeMacRecovery>') ||
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEngineRuntimeLifecycleSurface')
      ) {
        failures.push(`${relative}: product runtime lifecycle surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeRecordingRuntime.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineRecordingRuntime } from './useSelectedAudioEngineRecordingRuntime'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'export function useProductRuntimeRecordingRuntime(productRuntimeMode: ProductRuntimeSelectionMode)',
        'return useSelectedAudioEngineRecordingRuntime(productRuntimeMode)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime recording runtime must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime recording runtime must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeTelemetry.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import type { ProductDynamicsVisualTelemetry } from '../audio/product/ProductEngineTypes'",
        "import type { KesshoMidiMessage } from '../native/capacitorMidiRouting'",
        "import { useSelectedAudioEngineRuntimeTelemetry } from './useSelectedAudioEngineRuntimeTelemetry'",
        'type ProductRuntimeTelemetryOptions = {',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'type ProductRuntimeTelemetry = {',
        'getProductDynamicsVisualTelemetry: () => ProductDynamicsVisualTelemetry',
        'pushProductMidiMessage: (message: KesshoMidiMessage) => void',
        'export function useProductRuntimeTelemetry({',
        'audioEngineRuntimeMode: productRuntimeMode',
        'productRuntimeSupportsRangeKey: selectedRuntimeSupportsRangeKey',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime telemetry must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('SelectedRuntimeTelemetryOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineRuntimeTelemetry>') ||
        source.includes('ReturnType<typeof useSelectedAudioEngineRuntimeTelemetry>') ||
        source.includes('SelectedRuntimeTelemetry') ||
        source.includes("Omit<SelectedRuntimeTelemetryOptions") ||
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        (source.includes("from '../audio/product/") &&
          !source.includes("from '../audio/product/ProductAudioRuntimeSelection'") &&
          !source.includes("from '../audio/product/ProductEngineTypes'"))
      ) {
        failures.push(`${relative}: product runtime telemetry must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeStateRuntime.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import { productEngine } from '../audio/product/ProductEngineProxy'",
        "import type { ProductEngineState } from '../audio/product/ProductEngineTypes'",
        'ProductFxOwnershipBus',
        "import { useVisibleInterval } from './hooks/useVisibleInterval'",
        'type ProductRuntimeStateRuntimeOptions = {',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        "getProductTransportDebugState: () => ProductEngineState['transportDebug']",
        'setEngineState: Dispatch<SetStateAction<ProductEngineState>>',
        'export function useProductRuntimeStateRuntime({',
        "if (productRuntimeMode !== 'core-product') {",
        'productEngine.setStateChangeCallback(null)',
        'productEngine.setStateChangeCallback((nextState) => {',
        '}, [productRuntimeMode, setEngineState]);',
        'useVisibleInterval(updateTransportDebug, 1000, {',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime state runtime must own the Product Core state callback and detach outside core-product mode; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes("from './useSelectedAudioEngineStateRuntime'") ||
        source.includes('SelectedRuntimeStateRuntimeOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineStateRuntime>') ||
        source.includes('Omit<') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        (source.includes("from '../audio/product/") &&
          !source.includes("from '../audio/product/ProductAudioRuntimeSelection'") &&
          !source.includes("from '../audio/product/ProductEngineProxy'") &&
          !source.includes("from '../audio/product/ProductEngineTypes'"))
      ) {
        failures.push(`${relative}: product runtime state runtime must not route Product Core state callbacks through selected/reference compatibility surfaces`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeMacRecovery.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import type { SliderState } from './state'",
        "import { useSelectedAudioEngineMacRecovery } from './useSelectedAudioEngineMacRecovery'",
        'type ProductRuntimeMacRecoveryOptions = {',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'stateRef: MutableRefObject<SliderState>',
        'export function useProductRuntimeMacRecovery({',
        'audioEngineRuntimeMode: productRuntimeMode',
        'TODO(product-runtime-compat-10C)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime Mac recovery must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('SelectedRuntimeMacRecoveryOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineMacRecovery>') ||
        source.includes("Omit<SelectedRuntimeMacRecoveryOptions")
      ) {
        failures.push(`${relative}: product runtime Mac recovery must define product-owned options instead of exposing selected runtime option types`);
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        (source.includes("from '../audio/product/") && !source.includes("from '../audio/product/ProductAudioRuntimeSelection'"))
      ) {
        failures.push(`${relative}: product runtime Mac recovery must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineMediaSession.ts') {
      for (const requiredSnippet of [
        "from './audioEngineMediaSession'",
        'setupIOSMediaSession({',
        'connectMediaSessionToWebAudio(audioEngineRuntimeMode)',
        'stopIOSMediaSession(audioEngineRuntimeMode)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected media-session hook must own iOS/reference media-session setup/connect/stop delegation`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlaybackControls.ts') {
      for (const requiredSnippet of [
        "from '../native/capacitorAudioSession'",
        'const audioSessionDiagnosticEnabled =',
        'setupSelectedIOSMediaSession();',
        'await startSelectedAudioEngine(state);',
        'connectSelectedMediaSessionToAudio();',
        'await startCapacitorAudioSessionPlayback(',
        'void stopCapacitorAudioSessionPlayback();',
        'stopSelectedIOSMediaSession();',
        'stopSelectedAudioEngine();',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected playback controls hook must own start/stop media-session and native audio-session orchestration`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlaybackRuntime.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter'",
        'type UseSelectedAudioEnginePlaybackRuntimeOptions = {',
        'type ProductRuntimePlaybackAdapter = ReturnType<typeof useProductRuntimePlaybackAdapter>',
        'startSelectedPlayback: ProductRuntimePlaybackAdapter',
        'const playbackAdapter = useProductRuntimePlaybackAdapter({',
        'startSelectedPlayback: playbackAdapter.startProductPlayback',
        'stopSelectedPlayback: playbackAdapter.stopProductPlayback',
        'preloadSelectedAudioEngine: playbackAdapter.preloadProductRuntime',
        'stopSelectedAudioEngine: playbackAdapter.stopProductRuntime',
        'fadeSelectedAudioEngineOutput: playbackAdapter.fadeProductRuntimeOutput',
        'productRuntimeMode: audioEngineRuntimeMode',
        'capacitorAudioSessionDiagnosticActive,',
        'setCapacitorAudioSessionDiagnosticActive,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected playback runtime hook must delegate through the product runtime playback adapter; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected playback runtime hook must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePlaybackAdapter.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimeLifecycle } from './useProductRuntimeLifecycle'",
        "import { useProductRuntimeMediaSession } from './useProductRuntimeMediaSession'",
        "import { useProductRuntimePlaybackControls } from './useProductRuntimePlaybackControls'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'useProductRuntimeLifecycle(productRuntimeMode)',
        'useProductRuntimeMediaSession({',
        'productRuntimeMode,',
        'resumeProductRuntime,',
        'suspendProductRuntime,',
        'useProductRuntimePlaybackControls({',
        'startProductRuntime,',
        'stopProductRuntime,',
        'setupProductIOSMediaSession,',
        'connectProductMediaSessionToAudio,',
        'stopProductIOSMediaSession,',
        'startProductPlayback',
        'stopProductPlayback',
        'preloadProductRuntime',
        'stopProductRuntime',
        'fadeProductRuntimeOutput',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product playback adapter must compose lifecycle, media-session, playback controls, preload, and fade delegation`);
        }
      }
      const playbackAdapterType = source.match(/type ProductRuntimePlaybackAdapter = \{[\s\S]*?\};/)?.[0] ?? '';
      for (const forbiddenSnippet of [
        'startSelectedPlayback',
        'stopSelectedPlayback',
        'preloadSelectedAudioEngine',
        'stopSelectedAudioEngine',
        'fadeSelectedAudioEngineOutput',
      ]) {
        if (playbackAdapterType.includes(forbiddenSnippet)) {
          failures.push(`${relative}: product playback adapter must expose product-named fields only; selected compatibility belongs in useSelectedAudioEnginePlaybackRuntime`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: product playback adapter must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeShell.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEnginePlaybackRuntime } from './useSelectedAudioEnginePlaybackRuntime'",
        "import { useSelectedAudioEngineRuntimeUi } from './useSelectedAudioEngineRuntimeUi'",
        'useSelectedAudioEnginePlaybackRuntime({',
        'capacitorAudioSessionDiagnosticActive,',
        'setCapacitorAudioSessionDiagnosticActive,',
        'useSelectedAudioEngineRuntimeUi({',
        'preloadSelectedAudioEngine: playbackRuntime.preloadSelectedAudioEngine',
        'stopSelectedAudioEngine: playbackRuntime.stopSelectedAudioEngine',
        '...playbackRuntime',
        '...runtimeUi',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected runtime shell must compose playback runtime and runtime UI handoff; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected runtime shell must compose selected runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineStartAction.ts') {
      for (const requiredSnippet of [
        'preparePlaybackStartState',
        'startSelectedPlayback',
        'startArmedRecordingAfterPlaybackStart',
        'dualRanges',
        'title',
        'Failed to start audio',
        'Audio failed to start',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected start action hook must own selected playback start, armed recording, and error handling; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected start action hook must use injected Product runtime actions instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlaybackStartState.ts') {
      for (const requiredSnippet of [
        'resolveDefaultAutoStartPreset',
        'let stateToStart = requestedState ?? stateRef.current;',
        'hasLoadedPresetRef.current = true;',
        'applyPreset(defaultPreset, {',
        'updateEngine: false',
        'resetCofDrift: false',
        'setState(result.state);',
        'setMorphPresetA(result.preset);',
        'applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);',
        'restoreEvolveConfigs(result.preset);',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected playback-start state hook must own default preset start preparation; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected playback-start state hook must prepare state through injected App callbacks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineJourneyPlaybackAction.ts') {
      for (const requiredSnippet of [
        'startSelectedPlayback',
        'dualRanges',
        'title',
        "console.log('[Journey] Starting audio engine')",
        "console.error('[Journey] Failed to start audio:', err)",
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected journey playback action hook must own journey playback start injection and logging; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected journey playback action hook must use injected Product runtime actions instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineStopAction.ts') {
      for (const requiredSnippet of [
        'stopSelectedPlayback();',
        'drumEuclidMasterEnabled: false',
        'synthEuclideanMasterEnabled: false',
        'if (isJourneyPlaying)',
        'stopJourney();',
        'stopJourneyMorphPlayback(true);',
        'setIsJourneyPlaying(false);',
        'resetPlaybackTimer();',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected stop action hook must own selected playback stop and App-era stop side effects; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected stop action hook must use injected Product runtime actions instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePresetLoadFade.ts') {
      for (const requiredSnippet of [
        'const PRESET_LOAD_FADE_MS = 2000',
        'const PRESET_LOAD_RESTORE_FADE_MS = 10',
        'const PRESET_LOAD_STOP_SETTLE_MS = 50',
        'fadeSelectedAudioEngineOutput(0, PRESET_LOAD_FADE_MS)',
        'stopPlayback();',
        'window.setTimeout(resolve, PRESET_LOAD_STOP_SETTLE_MS)',
        'fadeSelectedAudioEngineOutput(1, PRESET_LOAD_RESTORE_FADE_MS)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected preset-load fade hook must own App-era fade/stop/restore orchestration; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected preset-load fade hook must use injected Product runtime actions instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlaybackUiProps.ts') {
      for (const requiredSnippet of [
        'advancedTransportButton',
        'journeyPlaybackProps',
        'snowflakePlaybackProps',
        'snowflakePrototypePlaybackProps',
        'toggleSnowflakePlayback',
        'togglePrototypePlayback',
        'Journey cannot play yet',
        'void startPlayback();',
        'stopPlayback();',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected playback UI prop hook must own top-level playback button prop shaping; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected playback UI prop hook must remain a prop composer and not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlaybackSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineJourneyPlaybackAction } from './useSelectedAudioEngineJourneyPlaybackAction'",
        "import { useSelectedAudioEnginePlaybackStartState } from './useSelectedAudioEnginePlaybackStartState'",
        "import { useSelectedAudioEnginePlaybackUiProps } from './useSelectedAudioEnginePlaybackUiProps'",
        "import { useSelectedAudioEnginePresetLoadFade } from './useSelectedAudioEnginePresetLoadFade'",
        "import { useSelectedAudioEngineStartAction } from './useSelectedAudioEngineStartAction'",
        "import { useSelectedAudioEngineStopAction } from './useSelectedAudioEngineStopAction'",
        'useSelectedAudioEnginePlaybackStartState(options)',
        'useSelectedAudioEngineStartAction({',
        'preparePlaybackStartState: prepareSelectedPlaybackStartState',
        'useSelectedAudioEngineJourneyPlaybackAction({',
        'stopJourneyMorphPlaybackRef',
        'useSelectedAudioEngineStopAction({',
        'stopJourneyMorphPlayback: stopJourneyMorphPlaybackFromRef',
        'useSelectedAudioEnginePlaybackUiProps({',
        'useSelectedAudioEnginePresetLoadFade({',
        'fadeSelectedAudioEngineOutput: options.fadeSelectedAudioEngineOutput',
        'fadeOutAndStopForPresetLoad',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected playback surface must compose start preparation, start/stop actions, journey start, UI props, and preset-load fade; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected playback surface must compose selected runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePlaybackSurface.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimeJourneyPlaybackAction } from './useProductRuntimeJourneyPlaybackAction'",
        "import { useProductRuntimePlaybackStartState } from './useProductRuntimePlaybackStartState'",
        "import { useProductRuntimePlaybackUiProps } from './useProductRuntimePlaybackUiProps'",
        "import { useProductRuntimePresetLoadFade } from './useProductRuntimePresetLoadFade'",
        "import { useProductRuntimeStartAction } from './useProductRuntimeStartAction'",
        "import { useProductRuntimeStopAction } from './useProductRuntimeStopAction'",
        'type PlaybackStartStateOptions = Parameters<typeof useProductRuntimePlaybackStartState>[0]',
        'export function useProductRuntimePlaybackSurface(options: ProductRuntimePlaybackSurfaceOptions)',
        'useProductRuntimePlaybackStartState(options)',
        'useProductRuntimeStartAction({',
        'preparePlaybackStartState: prepareProductPlaybackStartState',
        'useProductRuntimeJourneyPlaybackAction({',
        'stopJourneyMorphPlaybackRef',
        'useProductRuntimeStopAction({',
        'stopJourneyMorphPlayback: stopJourneyMorphPlaybackFromRef',
        'useProductRuntimePlaybackUiProps({',
        'useProductRuntimePresetLoadFade({',
        'startProductPlayback',
        'stopProductPlayback',
        'fadeProductRuntimeOutput',
        'fadeProductRuntimeOutput: options.fadeProductRuntimeOutput',
        'fadeOutAndStopForPresetLoad',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime playback surface must compose product-named playback wrappers; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEnginePlaybackSurface')
      ) {
        failures.push(`${relative}: product runtime playback surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePlaybackStartState.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEnginePlaybackStartState } from './useSelectedAudioEnginePlaybackStartState'",
        'export type ProductRuntimePlaybackStartStateOptions = {',
        'resolveDefaultAutoStartPreset: () => Promise<{',
        'applyDualRangesFromPreset: (',
        'restoreEvolveConfigs: (preset: PlaybackStartPreset) => void',
        'export function useProductRuntimePlaybackStartState(options: ProductRuntimePlaybackStartStateOptions)',
        'return useSelectedAudioEnginePlaybackStartState(options)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime playback start state must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('Parameters<typeof useSelectedAudioEnginePlaybackStartState>')) {
        failures.push(`${relative}: product runtime playback start state options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime playback start state must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeStartAction.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineStartAction } from './useSelectedAudioEngineStartAction'",
        'export type ProductRuntimeStartActionOptions = {',
        'preparePlaybackStartState: (requestedState?: SliderState) => Promise<SliderState>',
        'startProductPlayback: StartProductPlayback',
        'startArmedRecordingAfterPlaybackStart: () => void',
        'export function useProductRuntimeStartAction({',
        'startSelectedPlayback: startProductPlayback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime start action must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('SelectedStartActionOptions') || source.includes('Parameters<typeof useSelectedAudioEngineStartAction>')) {
        failures.push(`${relative}: product runtime start action options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime start action must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeJourneyPlaybackAction.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineJourneyPlaybackAction } from './useSelectedAudioEngineJourneyPlaybackAction'",
        'export type ProductRuntimeJourneyPlaybackActionOptions = {',
        'startProductPlayback: StartProductPlayback',
        'dualRanges: ProductRuntimeDualRanges',
        'export function useProductRuntimeJourneyPlaybackAction({',
        'startSelectedPlayback: startProductPlayback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime journey playback action must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('SelectedJourneyPlaybackActionOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineJourneyPlaybackAction>')
      ) {
        failures.push(`${relative}: product runtime journey playback action options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime journey playback action must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeStopAction.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineStopAction } from './useSelectedAudioEngineStopAction'",
        'export type ProductRuntimeStopActionOptions = {',
        'stopProductPlayback: () => void',
        'setIsJourneyPlaying: Dispatch<SetStateAction<boolean>>',
        'setState: Dispatch<SetStateAction<SliderState>>',
        'export function useProductRuntimeStopAction({',
        'stopSelectedPlayback: stopProductPlayback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime stop action must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('SelectedStopActionOptions') || source.includes('Parameters<typeof useSelectedAudioEngineStopAction>')) {
        failures.push(`${relative}: product runtime stop action options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime stop action must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePlaybackUiProps.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEnginePlaybackUiProps } from './useSelectedAudioEnginePlaybackUiProps'",
        'export type ProductRuntimePlaybackUiPropsOptions = {',
        'startProductPlayback: ProductRuntimePlaybackAction',
        'stopProductPlayback: () => void',
        'journey: ProductRuntimeJourneyPlaybackOptions',
        'export function useProductRuntimePlaybackUiProps({',
        'startPlayback: startProductPlayback',
        'stopPlayback: stopProductPlayback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime playback UI props must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('SelectedPlaybackUiPropsOptions') || source.includes('Parameters<typeof useSelectedAudioEnginePlaybackUiProps>')) {
        failures.push(`${relative}: product runtime playback UI props options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime playback UI props must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePresetLoadFade.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEnginePresetLoadFade } from './useSelectedAudioEnginePresetLoadFade'",
        'export type ProductRuntimePresetLoadFadeOptions = {',
        'fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>',
        'stopProductPlayback: () => void',
        'export function useProductRuntimePresetLoadFade({',
        'fadeSelectedAudioEngineOutput: fadeProductRuntimeOutput',
        'stopPlayback: stopProductPlayback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime preset-load fade must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('SelectedPresetLoadFadeOptions') || source.includes('Parameters<typeof useSelectedAudioEnginePresetLoadFade>')) {
        failures.push(`${relative}: product runtime preset-load fade options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime preset-load fade must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineLifecycle.ts') {
      for (const requiredSnippet of [
        'fadeSelectedAudioEngineOutput',
        'setSelectedOutputGain(target, durationMs / 1000)',
        'window.setTimeout(resolve, durationMs)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected lifecycle hook must own output fade timing and Product/reference gain routing`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineManualTriggers.ts') {
      for (const requiredSnippet of [
        'stateRef.current',
        "import type { RuntimeManualTriggerSurface } from './useProductRuntimeManualTriggers'",
        'selectedProductRuntime.auditionSynthNote(note, stateRef.current)',
        'selectedProductRuntime.enqueueLiveNoteEvent(event)',
        'selectedProductRuntime.triggerDrumVoice(voice, 0.8, stateRef.current)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected manual trigger adapter must use the canonical contract and dispatch only to the reference runtime`);
        }
      }
      if (
        source.includes('commitProductControlActionThenTrigger(') ||
        source.includes('productEngine') ||
        source.includes('productRuntimeManualTriggers') ||
        source.includes('audioEngineRuntimeMode')
      ) {
        failures.push(`${relative}: selected manual trigger adapter must not contain unreachable Product Core dispatch branches`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeManualTriggers.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import { productEngine } from '../audio/product/ProductEngineProxy'",
        "import { commitProductControlActionThenTrigger } from '../product-control'",
        'type ProductRuntimeManualTriggersOptions = {',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'type ProductRuntimeManualTriggers = {',
        'export function useProductRuntimeManualTriggers(',
        "type: 'manual-trigger/request'",
        "kind: 'synth-note'",
        "kind: 'drum-voice'",
        '(_revision, resolvedSliders) => productEngine.auditionSynthNote(productNote, resolvedSliders)',
        '(_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, velocity, resolvedSliders)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product manual trigger surface must own Product Core commit-before-trigger dispatch; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes("useSelectedAudioEngineManualTriggers") ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug')
      ) {
        failures.push(`${relative}: product manual trigger surface must not delegate through selected/reference runtime implementations`);
      }
    }

    if (relative === 'src/ui/useDrumPageRuntimeBridge.ts') {
      for (const requiredSnippet of [
        'preloadSelectedAudioEngine()',
        'preloadAudioEngine',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: Drum page runtime bridge must own selected-runtime preload delegation`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePageRuntimeBridges.ts') {
      for (const requiredSnippet of [
        'export type SelectedAudioEnginePageRuntimeBridgeOptions',
        "import { useSynthPageSequencerBridge } from './useSynthPageSequencerBridge'",
        "import { useDrumPageSequencerBridge } from './useDrumPageSequencerBridge'",
        "import { useDrumPageRuntimeBridge } from './useDrumPageRuntimeBridge'",
        'Parameters<typeof useSynthPageSequencerBridge>[0]',
        'Parameters<typeof useDrumPageSequencerBridge>[0]',
        'Parameters<typeof useDrumPageRuntimeBridge>[0]',
        'useSynthPageSequencerBridge(options)',
        'useDrumPageSequencerBridge(options)',
        'useDrumPageRuntimeBridge(options)',
        'productRuntimeDebugAnalysers',
        'productRuntimeManualTriggers',
        'const synthPageRuntimeProps = useMemo(() => ({',
        'getLeadMorphedParams: options.getSelectedLeadMorphedParams',
        'liveLeadMorphedParamsAvailable: options.liveLeadMorphedParamsAvailable',
        'liveSourceTelemetryAvailable: true',
        'onRequestPlaybackStart: options.onRequestPlaybackStart',
        'onAuditionNote: options.productRuntimeManualTriggers.auditionSynthNote',
        'getPadFilterFreq: options.getSelectedPadFilterFreq',
        'getPadLfoValue: options.getSelectedPadLfoValue',
        'setStepPositionCallback: options.setSelectedSynthStepPositionCallback',
        'setEvolveTriggerCallback: options.setSelectedSynthEvolveTriggerCallback',
        'const drumPageRuntimeProps = useMemo(() => ({',
        'triggerVoice: options.productRuntimeManualTriggers.triggerDrumVoice',
        'getAnalyserNode: options.productRuntimeDebugAnalysers.drumVoiceAnalyser',
        'preloadAudioEngine: drumPageRuntimeBridge.preloadAudioEngine',
        'onRequestPlaybackStart: options.onRequestPlaybackStart',
        'setStepPositionCallback: options.setSelectedDrumStepPositionCallback',
        'setEvolveTriggerCallback: options.setSelectedDrumEvolveTriggerCallback',
        'setTriggerCallback: options.setSelectedDrumTriggerCallback',
        'const dynamicsPageRuntimeProps = useMemo(() => ({',
        'getDynamicsAnalyser: options.productRuntimeDebugAnalysers.dynamicsAnalyser',
        'getDynamicsTelemetry: options.getSelectedDynamicsVisualTelemetry',
        'const visualizerPageRuntimeProps = useMemo(() => ({',
        'getActiveGrains: options.getSelectedGranularActiveGrainCount',
        'const granularPageRuntimeProps = useMemo(() => ({',
        'getActiveGrainCount: options.getSelectedGranularActiveGrainCount',
        'getWriteHeadPosition: options.getSelectedGranularWriteHeadPosition',
        'getVoicePositions: options.getSelectedGranularVoicePositions',
        'getBufferWaveform: options.getSelectedGranularBufferWaveform',
        'setGranularUiActive: options.setSelectedGranularUiActive',
        'liveBufferTelemetryAvailable: true',
        'liveWaveformTelemetryAvailable: options.liveWaveformTelemetryAvailable',
        'const earthPageRuntimeProps = useMemo(() => ({',
        'getEarthTextureDebugState: options.getEarthTextureDebugState',
        'textureDebugAvailable: options.textureDebugAvailable',
        'synthPageRuntimeProps',
        'drumPageRuntimeProps',
        'dynamicsPageRuntimeProps',
        'visualizerPageRuntimeProps',
        'granularPageRuntimeProps',
        'earthPageRuntimeProps',
        'synthPageSequencerBridge',
        'drumPageSequencerBridge',
        'drumPageRuntimeBridge',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected page runtime bridge hook must compose Synth/Drum sequencer and Drum preload bridges; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected page runtime bridge hook must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePageTelemetryRuntimeProps.ts') {
      for (const requiredSnippet of [
        'SelectedAudioEnginePageRuntimeBridgeOptions',
        'productRuntimeDebugAnalysers',
        'getEarthTextureDebugState',
        'getSelectedLeadMorphedParams',
        'getSelectedDynamicsVisualTelemetry',
        'getSelectedGranularActiveGrainCount',
        'getSelectedGranularBufferWaveform',
        'getSelectedGranularVoicePositions',
        'getSelectedGranularWriteHeadPosition',
        'getSelectedPadFilterFreq',
        'getSelectedPadLfoValue',
        'liveLeadMorphedParamsAvailable',
        'liveWaveformTelemetryAvailable',
        'setSelectedGranularUiActive',
        'textureDebugAvailable',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected page telemetry runtime prop hook must own page debug/telemetry option grouping; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected page telemetry runtime prop hook must group injected props instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePageControlRuntimeProps.ts') {
      for (const requiredSnippet of [
        'SelectedAudioEnginePageRuntimeBridgeOptions',
        'onRequestPlaybackStart',
        'preloadSelectedAudioEngine',
        'productRuntimeManualTriggers',
        'setSelectedDrumEvolveTriggerCallback',
        'setSelectedDrumStepPositionCallback',
        'setSelectedDrumTriggerCallback',
        'setSelectedSynthEvolveTriggerCallback',
        'setSelectedSynthStepPositionCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected page control runtime prop hook must own playback, preload, manual trigger, and callback option grouping; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected page control runtime prop hook must group injected props instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePageRuntimeBridgeOptions.ts') {
      for (const requiredSnippet of [
        'SelectedAudioEnginePageRuntimeBridgeOptions',
        'SelectedAudioEnginePageRuntimeBridgeOptionGroups',
        'SelectedAudioEnginePageControlRuntimeProps',
        'SelectedAudioEnginePageSequencerRuntimeProps',
        'SelectedAudioEnginePageTelemetryRuntimeProps',
        'telemetry: SelectedAudioEnginePageTelemetryRuntimeProps',
        'sequencer: SelectedAudioEnginePageSequencerRuntimeProps',
        'control: SelectedAudioEnginePageControlRuntimeProps',
        'useSelectedAudioEnginePageTelemetryRuntimeProps(telemetry)',
        'useSelectedAudioEnginePageSequencerRuntimeProps(sequencer)',
        'useSelectedAudioEnginePageControlRuntimeProps(control)',
        '...pageTelemetryRuntimeProps',
        '...pageSequencerRuntimeProps',
        '...pageControlRuntimeProps',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected page runtime bridge options hook must compose focused option groups; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected page runtime bridge options hook must compose injected props instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePageRuntimeSurface.ts') {
      for (const requiredSnippet of [
        'SelectedAudioEnginePageRuntimeBridgeOptionGroups',
        'useSelectedAudioEnginePageRuntimeBridgeOptions,',
        "import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges'",
        'useSelectedAudioEnginePageRuntimeBridgeOptions(options)',
        'useSelectedAudioEnginePageRuntimeBridges(selectedPageRuntimeBridgeOptions)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected page runtime surface hook must compose page bridge options and page bridge outputs; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected page runtime surface hook must compose page runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePageSurface.ts') {
      for (const requiredSnippet of [
        'useProductRuntimePageBridgeOptions,',
        'type ProductRuntimePageBridgeOptionGroups,',
        "import { useProductRuntimePageRuntimeBridges } from './useProductRuntimePageRuntimeBridges'",
        'type ProductRuntimePageSurfaceOptions = ProductRuntimePageBridgeOptionGroups',
        'export function useProductRuntimePageSurface(options: ProductRuntimePageSurfaceOptions)',
        'const pageRuntimeBridgeOptions = useProductRuntimePageBridgeOptions(options)',
        'return useProductRuntimePageRuntimeBridges(pageRuntimeBridgeOptions)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime page surface must compose product page bridge options and selected page bridge outputs; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes("from '../audio/product/") ||
        source.includes("from './useSelectedAudioEnginePageRuntimeSurface'")
      ) {
        failures.push(`${relative}: product runtime page surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePageBridgeOptions.ts') {
      for (const requiredSnippet of [
        'useProductRuntimePageControlProps,',
        'type ProductRuntimePageControlProps,',
        'useProductRuntimePageSequencerProps,',
        'type ProductRuntimePageSequencerProps,',
        'useProductRuntimePageTelemetryProps,',
        'type ProductRuntimePageTelemetryProps,',
        'telemetry: ProductRuntimePageTelemetryProps',
        'sequencer: ProductRuntimePageSequencerProps',
        'control: ProductRuntimePageControlProps',
        'useProductRuntimePageTelemetryProps(telemetry)',
        'useProductRuntimePageSequencerProps(sequencer)',
        'useProductRuntimePageControlProps(control)',
        '...pageTelemetryRuntimeProps',
        '...pageSequencerRuntimeProps',
        '...pageControlRuntimeProps',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime page bridge options must compose product-named page option groups; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes("from '../audio/product/") ||
        source.includes('useSelectedAudioEnginePageRuntimeBridgeOptions')
      ) {
        failures.push(`${relative}: product runtime page bridge options must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePageRuntimeBridges.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges'",
        'type ProductRuntimePageRuntimeBridgeOptions =',
        'ProductRuntimePageTelemetryProps &',
        'ProductRuntimePageSequencerProps &',
        'ProductRuntimePageControlProps',
        'export function useProductRuntimePageRuntimeBridges({',
        'const selectedOptions = {',
        'getSelectedDynamicsVisualTelemetry: getProductDynamicsVisualTelemetry',
        'getSelectedGranularBufferWaveform: getProductGranularBufferWaveform',
        'setSelectedGranularUiActive: setProductGranularUiActive',
        'captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome',
        'setSelectedDrumStepOverrides: setProductDrumStepOverrides',
        'setSelectedSynthPitchBindingModes: setProductSynthPitchBindingModes',
        'preloadSelectedAudioEngine: preloadProductRuntime',
        'setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback',
        'setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback',
        'useSelectedAudioEnginePageRuntimeBridges(selectedOptions)',
        'TODO(product-runtime-compat-10E)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product page runtime bridges must be the explicit selected-runtime compatibility mapper; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('SelectedAudioEnginePageRuntimeBridgeOptions') ||
        source.includes("from '../audio/product/ProductEngineProxy'") ||
        source.includes("from '../audio/product/SelectedProductRuntime'") ||
        source.includes("from '../audio/product/WebProductEngine'")
      ) {
        failures.push(`${relative}: product page runtime bridges must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePageTelemetryProps.ts') {
      for (const requiredSnippet of [
        "import { useMemo } from 'react'",
        'export type ProductRuntimePageDebugAnalysers = {',
        'export type ProductRuntimePageTelemetryProps = {',
        'productRuntimeDebugAnalysers: ProductRuntimePageDebugAnalysers',
        'getEarthTextureDebugState: () => EarthTextureDebugState',
        'getProductDynamicsVisualTelemetry: () => DynamicsVisualTelemetrySnapshot',
        'export function useProductRuntimePageTelemetryProps({',
        'return useMemo(() => ({',
        'getProductDynamicsVisualTelemetry,',
        'getProductGranularBufferWaveform,',
        'setProductGranularUiActive,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product page telemetry props must preserve a product-shaped App contract; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('useSelectedAudioEnginePageTelemetryRuntimeProps') ||
        source.includes('type SelectedAudioEnginePageTelemetryRuntimeProps') ||
        source.includes('ProductRuntimePageTelemetryProps = SelectedAudioEnginePageTelemetryRuntimeProps') ||
        source.includes('getSelectedDynamicsVisualTelemetry: getProductDynamicsVisualTelemetry') ||
        source.includes('getSelectedGranularBufferWaveform: getProductGranularBufferWaveform') ||
        source.includes('setSelectedGranularUiActive: setProductGranularUiActive')
      ) {
        failures.push(`${relative}: product page telemetry props must define an App-facing product contract instead of aliasing or mapping to selected runtime prop types`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product page telemetry props must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePageSequencerProps.ts') {
      for (const requiredSnippet of [
        'useMemo, type MutableRefObject',
        'export type ProductRuntimePageSequencerProps = {',
        'captureProductSynthEuclidLaneHome: (laneIdx: number, pitchState?: ProductRuntimePitchHomeState | null) => void',
        'drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>',
        'setProductDrumStepOverrides: (overrides: DrumStepOverrides) => void',
        'setProductSynthPitchBindingModes: (modes: PitchBindingMode[]) => void',
        'synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>',
        'export function useProductRuntimePageSequencerProps({',
        'return useMemo(() => ({',
        'captureProductSynthEuclidLaneHome,',
        'setProductDrumStepOverrides,',
        'setProductSynthPitchBindingModes,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product page sequencer props must preserve a product-shaped App contract; missing ${requiredSnippet}`);
        }
      }
      const productPageSequencerType = source.match(/export type ProductRuntimePageSequencerProps = \{[\s\S]*?\};/)?.[0] ?? '';
      if (
        source.includes('useSelectedAudioEnginePageSequencerRuntimeProps') ||
        source.includes('type SelectedAudioEnginePageSequencerRuntimeProps') ||
        source.includes('ProductRuntimePageSequencerProps = SelectedAudioEnginePageSequencerRuntimeProps') ||
        source.includes('captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome') ||
        source.includes('setSelectedDrumStepOverrides: setProductDrumStepOverrides') ||
        source.includes('setSelectedSynthPitchBindingModes: setProductSynthPitchBindingModes') ||
        productPageSequencerType.includes('Selected')
      ) {
        failures.push(`${relative}: product page sequencer props must define an App-facing product contract instead of aliasing, mapping, or exposing selected runtime prop names`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product page sequencer props must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePageControlProps.ts') {
      for (const requiredSnippet of [
        "import { useMemo } from 'react'",
        "import type { RuntimeManualTriggerSurface } from './useProductRuntimeManualTriggers'",
        'export type ProductRuntimePageControlProps = {',
        'preloadProductRuntime: () => Promise<unknown>',
        'productRuntimeManualTriggers: RuntimeManualTriggerSurface',
        'setProductDrumStepPositionCallback',
        'setProductSynthEvolveTriggerCallback',
        'onRequestPlaybackStart: (statePatch?: Partial<SliderState>) => void',
        'export function useProductRuntimePageControlProps({',
        'return useMemo(() => ({',
        'preloadProductRuntime,',
        'setProductDrumStepPositionCallback,',
        'setProductSynthEvolveTriggerCallback,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product page control props must preserve a product-shaped App contract; missing ${requiredSnippet}`);
        }
      }
      const productPageControlType = source.match(/export type ProductRuntimePageControlProps = \{[\s\S]*?\};/)?.[0] ?? '';
      if (
        source.includes('useSelectedAudioEnginePageControlRuntimeProps') ||
        source.includes('type SelectedAudioEnginePageControlRuntimeProps') ||
        source.includes('ProductRuntimePageControlProps = Omit<') ||
        source.includes('preloadSelectedAudioEngine: preloadProductRuntime') ||
        source.includes('setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback') ||
        source.includes('setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback') ||
        /^\s*setSelected/m.test(productPageControlType)
      ) {
        failures.push(`${relative}: product page control props must define an App-facing product contract instead of deriving from, mapping, or exposing selected runtime prop types`);
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes("from '../audio/product/ProductEngineProxy'") ||
        source.includes("from '../audio/product/SelectedProductRuntime'") ||
        source.includes("from '../audio/product/WebProductEngine'")
      ) {
        failures.push(`${relative}: product page control props must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePageSequencerRuntimeProps.ts') {
      for (const requiredSnippet of [
        'SelectedAudioEnginePageRuntimeBridgeOptions',
        'captureSelectedSynthEuclidLaneHome',
        'captureSelectedDrumEuclidLaneHome',
        'diceSelectedSynthEuclidLane',
        'diceSelectedDrumEuclidLane',
        'drumClockDivsRef',
        'drumEvolveConfigsRef',
        'drumLinkedRef',
        'drumPitchSettingsRef',
        'drumStepOverridesRef',
        'drumSubLaneStatesRef',
        'drumSwingsRef',
        'resetSelectedDrumEuclidLaneHome',
        'resetSelectedSynthEuclidLaneHome',
        'setSelectedDrumEuclidClockDivs',
        'setSelectedDrumEuclidEvolveConfigs',
        'setSelectedDrumEuclidSwings',
        'setSelectedDrumStepOverrides',
        'setSelectedDrumSubLaneEnabled',
        'setSelectedDrumPitchSettings',
        'setSelectedSynthEuclidClockDivs',
        'setSelectedSynthEuclidEvolveConfigs',
        'setSelectedSynthEuclidSwings',
        'setSelectedSynthPitchBindingModes',
        'setSelectedSynthPitchSettings',
        'setSelectedSynthStepOverrides',
        'setSelectedSynthSubLaneEnabled',
        'synthClockDivsRef',
        'synthEvolveConfigsRef',
        'synthLinkedRef',
        'synthPitchBindingModesRef',
        'synthPitchSettingsRef',
        'synthStepOverridesRef',
        'synthSubLaneStatesRef',
        'synthSwingsRef',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected page sequencer runtime prop hook must own sequencer option grouping; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected page sequencer runtime prop hook must group injected props instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineMorphRuntime.ts') {
      for (const requiredSnippet of [
        'resetSelectedCofDrift()',
        'setSelectedJourneyMorphClockCallback(callback)',
        'startSelectedJourneyMorphClock()',
        'stopSelectedJourneyMorphClock()',
        'setSelectedJourneyMorphClockCallback(null)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: morph runtime bridge must own CoF reset and selected journey morph clock lifecycle calls`);
        }
      }
    }

    if (relative === 'src/ui/useProductRuntimeMorphSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineMorphRuntime } from './useSelectedAudioEngineMorphRuntime'",
        'type ProductJourneyMorphClockCallback = (now: number) => void',
        'export type ProductRuntimeMorphSurfaceOptions = {',
        'resetProductCofDrift: () => void',
        'setProductJourneyMorphClockCallback: (callback: ProductJourneyMorphClockCallback | null) => void',
        'export function useProductRuntimeMorphSurface({',
        'resetSelectedCofDrift: resetProductCofDrift',
        'setSelectedJourneyMorphClockCallback: setProductJourneyMorphClockCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product morph runtime surface must delegate through the selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      const productMorphSurfaceType = source.match(/type ProductRuntimeMorphSurfaceOptions = \{[\s\S]*?\};/)?.[0] ?? '';
      if (/^\s*(resetSelected|setSelected|startSelected|stopSelected)/m.test(productMorphSurfaceType)) {
        failures.push(`${relative}: product morph runtime surface must expose product-named options only`);
      }
      if (
        source.includes('SelectedRuntimeMorphOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineMorphRuntime>')
      ) {
        failures.push(`${relative}: product morph runtime surface options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product morph runtime surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useCapacitorAudioSessionDiagnostics.ts') {
      for (const requiredSnippet of [
        'addCapacitorAudioSessionRemoteCommandListener',
        'getCapacitorAudioSessionStatus',
        'isCapacitorAudioSessionAvailable',
        'setCapacitorAudioSessionNowPlaying',
        'shouldUseCapacitorAudioSessionDiagnostics',
        'syncCapacitorAudioSessionState',
        'remoteCommandHandlerRef.current(command)',
        'window.setTimeout(setupAudioSessionDiagnostics, 250)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: Capacitor audio-session diagnostics hook must own listener setup, retry, now-playing, and state sync`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineCapacitorAudioSession.ts') {
      for (const requiredSnippet of [
        'useSelectedAudioEngineRemoteCommandPlayback({',
        'useCapacitorAudioSessionDiagnostics({',
        'isPlaying: playbackIsRunning || isJourneyPlaying',
        'onRemoteCommand: handleCapacitorAudioSessionRemoteCommand',
        'startPlayback',
        'stopPlayback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected Capacitor audio-session hook must compose remote command playback and diagnostics sync; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected Capacitor audio-session hook must use injected Product runtime actions instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlatformRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { useCapacitorMacAudioStatus } from './useCapacitorMacAudioStatus'",
        "import { useSelectedAudioEngineCapacitorAudioSession } from './useSelectedAudioEngineCapacitorAudioSession'",
        'useCapacitorMacAudioStatus(options)',
        'useSelectedAudioEngineCapacitorAudioSession(options)',
        'return macAudioStatus',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected platform runtime surface must compose macOS status and Capacitor audio-session sync; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: selected platform runtime surface must compose platform hooks without touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePlatformSurface.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimeCapacitorAudioSession } from './useProductRuntimeCapacitorAudioSession'",
        "import { useProductRuntimeMacAudioStatus } from './useProductRuntimeMacAudioStatus'",
        'Parameters<typeof useProductRuntimeMacAudioStatus>[0]',
        'Parameters<typeof useProductRuntimeCapacitorAudioSession>[0]',
        "'startProductPlayback' | 'stopProductPlayback'",
        'startProductPlayback: Parameters<typeof useProductRuntimeCapacitorAudioSession>',
        'stopProductPlayback: Parameters<typeof useProductRuntimeCapacitorAudioSession>',
        'export function useProductRuntimePlatformSurface(options: ProductRuntimePlatformSurfaceOptions)',
        'useProductRuntimeMacAudioStatus(options)',
        'useProductRuntimeCapacitorAudioSession(options)',
        '...macAudioStatus',
        'nativeProductRendererDiagnosticStatus',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime platform surface must compose product-named platform wrappers; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes("from '../audio/product/") ||
        source.includes('useSelectedAudioEnginePlatformRuntimeSurface')
      ) {
        failures.push(`${relative}: product runtime platform surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeMacAudioStatus.ts') {
      for (const requiredSnippet of [
        "import { useCapacitorMacAudioStatus } from './useCapacitorMacAudioStatus'",
        'type CapacitorMacAudioStatusOptions = Parameters<typeof useCapacitorMacAudioStatus>[0]',
        'type ProductRuntimeMacAudioStatusOptions = Omit<CapacitorMacAudioStatusOptions,',
        'preloadProductRuntime: CapacitorMacAudioStatusOptions',
        'export function useProductRuntimeMacAudioStatus({',
        'preloadSelectedAudioEngine: preloadProductRuntime',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime Mac audio status must delegate through platform compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime Mac audio status must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeCapacitorAudioSession.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineCapacitorAudioSession } from './useSelectedAudioEngineCapacitorAudioSession'",
        "import type { SliderState } from './state'",
        'type ProductRuntimeCapacitorAudioSessionOptions = {',
        'startProductPlayback: () => void | Promise<void>',
        'stopProductPlayback: () => void',
        'export function useProductRuntimeCapacitorAudioSession({',
        'startPlayback: startProductPlayback',
        'stopPlayback: stopProductPlayback',
        'TODO(product-fallback-retire:runtime-capacitor-audio-session)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime Capacitor audio session must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('Parameters<typeof useSelectedAudioEngineCapacitorAudioSession>') ||
        source.includes('SelectedAudioEngineCapacitorAudioSessionOptions') ||
        source.includes('startPlayback: () =>') ||
        source.includes('stopPlayback: () =>')
      ) {
        failures.push(`${relative}: product runtime Capacitor audio session must define product playback option names instead of selected playback names`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime Capacitor audio session must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRemoteCommandPlayback.ts') {
      for (const requiredSnippet of [
        "command === 'play'",
        "command === 'pause'",
        'if (!playbackIsRunning) void startPlayback();',
        'if (playbackIsRunning) stopPlayback();',
        'void startPlayback();',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected remote command playback hook must own play/pause/toggle routing; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected remote command playback hook must use injected Product runtime actions instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useCapacitorMacAudioStatus.ts') {
      for (const requiredSnippet of [
        'getCapacitorMacAudioOutputStatus',
        'openCapacitorMacSoundSettings',
        'setCapacitorMacPlaybackState',
        'readMacAirPlayPerformancePinned',
        'writeMacAirPlayPerformancePinned',
        'useVisibleInterval(refreshMacAudioOutputStatus, playbackIsRunning ? 1500 : 5000',
        'void preloadSelectedAudioEngine();',
        'void setCapacitorMacPlaybackState({ isPlaying: false });',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: macOS native audio status hook must own output polling, AirPlay performance persistence, sound settings, preload, and playback sync`);
        }
      }
    }

    if (relative === 'src/ui/usePlatformRuntimeCapabilities.ts') {
      for (const requiredSnippet of [
        "import { isCapacitorNativeShell } from '../native/capacitorAudioSession'",
        "import { isCapacitorMacShell } from '../native/capacitorMacShell'",
        'const nativeShellAvailable = isCapacitorNativeShell();',
        'const macShellAvailable = isCapacitorMacShell();',
        'const usesSupabaseStatePresetLibrary = macShellAvailable && cloudPresetAllowed;',
        'const usesCapacitorLocalPresetLibrary = nativeShellAvailable && !usesSupabaseStatePresetLibrary;',
        'const usesCloudBackedStatePresetLibrary = cloudPresetAllowed && !usesCapacitorLocalPresetLibrary;',
        'const shouldInitializeCloudPresetStore = cloudPresetAllowed && (!nativeShellAvailable || macShellAvailable);',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: platform runtime capabilities hook must own native/mac shell classification and preset-library routing`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePlaybackTimer.ts') {
      for (const requiredSnippet of [
        'const playbackTimerTargetTimeRef = useRef<number | null>(null)',
        'const updatePlaybackTimerCountdown = useCallback(() =>',
        'window.setTimeout(() =>',
        'stopSelectedPlayback();',
        'const initialRemaining = playbackTimerRemaining ?? playbackTimerMinutes * 60;',
        'playbackTimerTargetTimeRef.current = null;',
        'useVisibleInterval(updatePlaybackTimerCountdown, 1000',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected playback timer hook must preserve App-era countdown and expiry stop behavior`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineGlobalRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineGlobalRuntimeProps } from './useSelectedAudioEngineGlobalRuntimeProps'",
        "import { useSelectedAudioEnginePlaybackTimer } from './useSelectedAudioEnginePlaybackTimer'",
        'useSelectedAudioEnginePlaybackTimer({',
        'stopSelectedPlayback: options.stopSelectedPlayback',
        'useSelectedAudioEngineGlobalRuntimeProps({',
        'runtimeComparison: options.runtimeComparison',
        'onResetCofDrift: options.onResetCofDrift',
        'recordingProps: options.recordingProps',
        'playbackTimerProps: {',
        'onTimerEnabledChange: setPlaybackTimerEnabled',
        'globalRuntimeProps',
        'resetPlaybackTimer',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected Global runtime surface must compose playback timer state into Global runtime props; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: selected Global runtime surface must compose UI-facing runtime props without touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeGlobalSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineGlobalRuntimeSurface } from './useSelectedAudioEngineGlobalRuntimeSurface'",
        "import type { GlobalPageProps } from './global/GlobalPage'",
        'type ProductRuntimeGlobalProps = Pick<',
        'type ProductRuntimeGlobalRecordingProps = Pick<',
        'playbackIsRunning: boolean',
        'stopProductPlayback: () => void',
        'runtimeComparison: ProductRuntimeGlobalProps',
        'recordingProps: ProductRuntimeGlobalRecordingProps',
        'export function useProductRuntimeGlobalSurface({',
        'stopSelectedPlayback: stopProductPlayback',
        'TODO(product-runtime-compat-10D)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime Global surface must remain a product-named facade over the selected Global composer; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('SelectedAudioEngineGlobalRuntimeSurfaceOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineGlobalRuntimeSurface>') ||
        source.includes("Omit<\n  SelectedAudioEngineGlobalRuntimeSurfaceOptions")
      ) {
        failures.push(`${relative}: product runtime Global surface must define product/global page option types instead of exposing selected Global runtime option types`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime Global surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useCloudPresetStoreBootstrap.ts') {
      for (const requiredSnippet of [
        "import type { IPresetStore } from '../presets/PresetStore'",
        "const { ensureCloudAnonymousSession, getSupabase } = await import('../cloud/supabase')",
        'new LocalStoragePresetStore()',
        'new SupabasePresetStore(supabaseClient)',
        'new HybridPresetStore(local, cloud)',
        'setPresetStore(hybrid)',
        "store.load('state', defaultAutoStartPresetName, 'global')",
        'cloudAutoStartStoreInitPromiseRef.current = (async () =>',
        'onCloudAutoStartPreset(preset, ',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: cloud preset bootstrap hook must own Supabase store readiness, hybrid store install, and auto-start fetches`);
        }
      }
    }

    if (relative === 'src/ui/usePresetBootstrapRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { useAutoStartPresetResolver } from './useAutoStartPresetResolver'",
        "import { useCloudPresetStoreBootstrap } from './useCloudPresetStoreBootstrap'",
        "import { usePresetPlatformMaintenance } from './usePresetPlatformMaintenance'",
        'const loadCloudAutoStartPresetRef = useRef<',
        'const loadCloudAutoStartPresetFromBootstrap = useCallback(() => loadCloudAutoStartPresetRef.current(), [])',
        'useAutoStartPresetResolver<TSavedPreset>({',
        'loadCloudAutoStartPreset: loadCloudAutoStartPresetFromBootstrap',
        'useCloudPresetStoreBootstrap<TSavedPreset>({',
        'onCloudAutoStartPreset: setCloudAutoStartPreset',
        'loadCloudAutoStartPresetRef.current = loadCloudAutoStartPreset',
        'usePresetPlatformMaintenance({',
        'cloudPresetStoreReadyPromiseRef',
        'resolveDefaultAutoStartPreset',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: preset bootstrap runtime surface must compose cloud bootstrap, auto-start resolution, and preset maintenance; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: preset bootstrap runtime surface must compose preset hooks without touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/usePresetLibraryLoader.ts') {
      for (const requiredSnippet of [
        'cloudPresetStoreReadyPromiseRef.current',
        'return loadCloudBackedPresets();',
        'return loadCapacitorLocalPresets();',
        'return loadBundledPresets();',
        "const cloudPresetId = urlParams.get('cloud');",
        "void import('../cloud/supabase')",
        'fetchPresetById(cloudPresetId)',
        'onCloudSharedPresetLoaded(',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: preset library loader hook must own preset source routing and cloud share fetch behavior`);
        }
      }
    }

    if (relative === 'src/ui/usePresetLibraryRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { usePresetLibraryLoader, type CloudSharedPresetPayload } from './usePresetLibraryLoader'",
        "import { useSavedPresetResolver } from './useSavedPresetResolver'",
        "export type { CloudSharedPresetPayload } from './usePresetLibraryLoader'",
        'usePresetLibraryLoader<TSavedPreset>({',
        'loadCloudBackedPresets',
        'onPresetsLoaded: setSavedPresets',
        'const handlePresetsLoadFailed = useCallback(() =>',
        'onPresetsLoadFailed: handlePresetsLoadFailed',
        'toCloudSharedPreset',
        'onCloudSharedPresetLoaded',
        'return useSavedPresetResolver<TSavedPreset>({',
        'loadPresetByName',
        'sortPresets',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: preset library runtime surface must compose library loading and saved-preset resolution; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: preset library runtime surface must compose preset hooks without touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/usePresetRestoreRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { replaceRuntimeWalkPositionSnapshot } from './runtimeWalkPositionSync'",
        "import { usePresetSequencerRestore } from './usePresetSequencerRestore'",
        'type ProductPresetSequencerRestoreOptions = Omit<PresetSequencerRestoreOptions, SelectedPresetSequencerSetterKey>',
        'setProductDrumEuclidClockDivs: PresetSequencerRestoreOptions',
        'const restoreEvolveConfigs = usePresetSequencerRestore({',
        'setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs',
        'setSelectedSequencerPresetHomeSnapshots: setProductSequencerPresetHomeSnapshots',
        'const applyDualRangesFromPreset = useCallback(',
        'normalizeDualSliderMode(key, presetSliderModes?.[key] ?? \'walk\')',
        'replaceRuntimeWalkPositionSnapshot(newWalkPositions)',
        'replaceRuntimeWalkPositionSnapshot({})',
        'setSliderModes(newSliderModes)',
        'setDualSliderRanges(newDualRanges)',
        'restoreEvolveConfigs',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: preset restore runtime surface must compose full-preset dual-range restore and sequencer restore; missing ${requiredSnippet}`);
        }
      }
      const productRestoreOptionsType = source.match(/type ProductPresetSequencerRestoreOptions = [\s\S]*?;\n/)?.[0] ?? '';
      if (/setSelected\w+\s*:/.test(productRestoreOptionsType)) {
        failures.push(`${relative}: preset restore runtime surface must expose product-named sequencer restore setters`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: preset restore runtime surface must compose preset hooks without touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useJourneyPresetRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import type { UseJourneyPresetsResult } from '../presets/useJourneyPresets'",
        "import { validateJourneyConfig, type JourneyValidationResult } from '../presets/journeyPresetCodec'",
        'export function useJourneyPresetRuntimeSurface({',
        'export function useJourneyPresetActionSurface({',
        'activeJourneyPresetName',
        'setActiveJourneyValidation(validateJourneyConfig(journeyConfig))',
        'hasJourneyPresetBackup(activeJourneyPresetName)',
        'journeyPresets.load(name)',
        'journeyPresets.save(name, { ...journey.config, name }',
        'journeyPresets.remove(name)',
        'journeyPresets.restoreBackup(activeJourneyPresetName)',
        'journeyPresets.validate({ ...journey.config, name: entry.name })',
        'stopJourneyMorphPlayback(true)',
        'setIsJourneyPlaying(false)',
        'setActiveJourneyHasBackup(false)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: journey preset runtime surface must own active preset validation and backup status tracking; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: journey preset runtime surface must compose journey preset state without touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useJourneyOverrideRuntimeSurface.ts') {
      for (const requiredSnippet of [
        'export type JourneyOverridePromptState = {',
        'journeyOverridePromptResolveRef',
        'resolveJourneyOverridePrompt',
        'requestJourneyOverrideConfirmation',
        'window.addEventListener(\'keydown\', handleKeyDown)',
        'confirmOverrideArmedJourneyForStatePreset',
        'journey.stop();',
        'setIsJourneyPlaying(false)',
        'setActiveJourneyPresetName(\'\')',
        'setActiveJourneyHasBackup(false)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: journey override runtime surface must own override prompt lifecycle and armed-journey clearing; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: journey override runtime surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useJourneyMorphRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import type { DualSliderRange } from './DualSlider'",
        "import type { SliderMode, SliderState } from './state'",
        'applyJourneyDualSnapshot',
        'setSliderModes((prev) =>',
        'setDualSliderRanges((prev) =>',
        'commitJourneyRuntimeState',
        'journeyLastAppliedStateRef.current',
        'journeyLastDualModesRef.current',
        'journeyLastDualRangesRef.current',
        'journeyLastMorphPositionRef.current',
        'journeyLastMorphCoFVizRef.current',
        'stopJourneyMorphClock();',
        'stopJourneyMorphPlayback',
        'handleJourneyLoadPreset',
        'resolveSavedPresetByName(presetName)',
        "console.warn('[Journey] Preset not found:', presetName)",
        "console.log('[Journey] Loading preset:', presetName)",
        'handleLoadPresetFromList(preset, {',
        'skipJourneyOverridePrompt: true',
        'const appliedPresetLoad = lastAppliedPresetLoadRef.current',
        'journeyPresetARef.current = startPreset',
        'journeyPresetBRef.current = null',
        'await startJourneyPlayback(startState, startPreset.name)',
        'handleJourneyMorphTo',
        'resolveSavedPresetByName(targetPresetName)',
        "console.warn('[Journey] Target preset not found:', targetPresetName)",
        "console.log('[Journey] Morphing to:', targetPresetName",
        'const msPerPhrase = (phraseLength ?? 16) * 1000',
        'const eased = progress < 0.5 ? 2 * progress * progress',
        'lerpPresets(',
        'for (const key of USER_PREFERENCE_KEYS)',
        "scheduleProductRuntimeParamUpdate(stateWithPrefs, { reason: 'journey-morph-change' })",
        "document.visibilityState === 'visible'",
        "journeyMorphDirectionRef.current = direction === 'toB' ? 'toA' : 'toB'",
        'startJourneyMorphClock(animateMorph)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: journey morph runtime surface must own committed morph state flushing, stop orchestration, and journey start/morph action routing; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: journey morph runtime surface must use injected callbacks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useMorphPositionRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { calculateDriftedRoot } from '../audio/harmony'",
        "import { clampMorphPosition, isAtEndpoint0, isAtEndpoint1, isInMidMorph } from '../audio/morphUtils'",
        'prevMorphPresetARef',
        'prevMorphPresetBRef',
        'buildFallbackPreset',
        'morphDirectionRef.current || \'toB\'',
        'lerpPresets(',
        'for (const key of USER_PREFERENCE_KEYS)',
        'scheduleProductRuntimeParamUpdate(stateWithPrefs, {',
        'scheduleProductRuntimeParamUpdate(finalState, {',
        'triggerCritical: true',
        'morphManualOverridesRef.current = {}',
        'currentPhaseRef',
        'morphPlayTimeoutRef',
        'morphMode !== \'auto\'',
        'document.visibilityState === \'visible\'',
        'const scheduleNextTick = () =>',
        'setMorphCountdown(null)',
        'phaseName = targetAfterHold === 0 ? \'Morph → A\' : \'Morph → B\'',
        'mergeMorphDualRuntime(morphResult)',
        'resetRuntimeWalkPositionsForModes(morphResult.dualModes)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: morph position runtime surface must own manual/auto morph dirty updates, preset-change reapply, and dual-range runtime walk reset; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: morph position runtime surface must use injected callbacks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useMorphSlotLoadRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { extractPresetVersionMetadata } from '../presets/presetUtils'",
        "import { isAtEndpoint0, isAtEndpoint1, isInMidMorph } from '../audio/morphUtils'",
        "import { applyPreset, type ApplyPresetOptions, USER_PREFERENCE_KEYS } from './presetUtils'",
        'function presetEntryToSavedPreset(',
        'normalizeState(data as unknown as SliderState)',
        'function getLinkedVisualizerPresetName(',
        'VISUALIZER_PRESET_SCOPE',
        'captureCurrentMorphBasis',
        'applyMidMorphSlotReplacement',
        'const handleLoadMorphA = useCallback',
        'const handleLoadMorphB = useCallback',
        'confirmOverrideArmedJourneyForStatePreset(entry.name)',
        'hasLoadedPresetRef.current = true',
        'syncCoreProductAppliedPreset(result.state)',
        'setStatePresetName(entry.name)',
        'applyLinkedVisualizerPreset(entry)',
        'applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes)',
        'restoreEvolveConfigs(result.preset)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: morph slot load runtime surface must own PresetEntry conversion, endpoint Product preset sync, linked visualizer handoff, and dual-range restore; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: morph slot load runtime surface must use injected callbacks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useCloudSharedPresetRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import type { CloudSharedPresetPayload } from './usePresetLibraryRuntimeSurface'",
        "import { applyPreset, type ApplyPresetOptions } from './presetUtils'",
        'cloudSharedPresetToSavedPreset',
        "Object.prototype.hasOwnProperty.call(rawData, 'state')",
        'drumEvolveConfigs: wrappedData?.drumEvolveConfigs',
        'synthPitchBindingModes: wrappedData?.synthPitchBindingModes',
        'applyCloudSharedPreset',
        'currentState: stateRef.current',
        'normalize: normalizeState',
        'syncCoreProductAppliedPreset(result.state)',
        'setState(result.state)',
        'applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes)',
        'restoreEvolveConfigs(result.preset)',
        "console.log(`Loaded cloud preset: ${metadata.name} by ${metadata.author}`)",
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: cloud shared preset runtime surface must own cloud payload conversion and Product preset-load sync; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: cloud shared preset runtime surface must use injected callbacks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSavedPresetLoadRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { isAtEndpoint0 } from '../audio/morphUtils'",
        "import { applyPreset, type ApplyPresetOptions } from './presetUtils'",
        'captureCurrentMorphBasis',
        'warnAboutPresetCompatibility',
        'confirmOverrideArmedJourneyForStatePreset(preset.name)',
        'await fadeOutAndStopForPresetLoad()',
        'lastAppliedPresetLoadRef.current = null',
        'const resolvedPreset = await resolveSavedPresetForLoad(preset)',
        'if (!snowflakeActivated) setSnowflakeActivated(true)',
        'hasLoadedPresetRef.current = true',
        'setMorphPresetA(resolvedPreset)',
        'setMorphSlotAName(resolvedPreset.name)',
        'const shouldApplyPresetA = options?.forceApply || atEndpoint0 || !morphPresetB',
        'skipNextPresetLoadEngineSync()',
        'lastAppliedPresetLoadRef.current = {',
        'setStatePresetName(resolvedPreset.name)',
        'applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes)',
        'restoreEvolveConfigs(result.preset as TPreset)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: saved preset load runtime surface must own list preset resolution, Product preset-load skip, morph basis capture, and restore handoff; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: saved preset load runtime surface must use injected callbacks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePresetRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { useAudioEngineParamSync } from './useAudioEngineParamSync'",
        "import { usePresetEngineSync } from './usePresetEngineSync'",
        'const scheduleAudioEngineParamUpdate = useAudioEngineParamSync(audioEngineRuntimeMode)',
        'const presetEngineSync = usePresetEngineSync({',
        'scheduleAudioEngineParamUpdate,',
        'resetSelectedCofDrift,',
        'updateSelectedReferenceParams,',
        'return {',
        '...presetEngineSync',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected preset runtime surface must compose param dirty-diff sync and preset sync; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected preset runtime surface must compose focused hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePresetSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEnginePresetRuntimeSurface } from './useSelectedAudioEnginePresetRuntimeSurface'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'export type ProductRuntimeParamUpdateOptions = {',
        'export type ProductRuntimePresetSurfaceOptions = {',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'resetProductCofDrift: () => void',
        'export function useProductRuntimePresetSurface({',
        'resetProductCofDrift,',
        'resetSelectedCofDrift: resetProductCofDrift',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime preset surface must remain a product-named facade over the selected preset runtime composer; missing ${requiredSnippet}`);
        }
      }
      const productPresetSurfaceType = source.match(/type ProductRuntimePresetSurfaceOptions = [\s\S]*?\};/)?.[0] ?? '';
      if (/^\s*resetSelected/m.test(productPresetSurfaceType)) {
        failures.push(`${relative}: product runtime preset surface must expose product-named options only`);
      }
      if (
        source.includes('SelectedPresetRuntimeSurfaceOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEnginePresetRuntimeSurface>') ||
        source.includes('ReturnType<typeof useSelectedAudioEnginePresetRuntimeSurface>') ||
        source.includes('SelectedPresetRuntimeSurface') ||
        source.includes("import type { AudioEngineParamUpdateOptions }")
      ) {
        failures.push(`${relative}: product runtime preset surface options must not derive from selected-runtime or audio-engine option types`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime preset surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSavedPresetResolver.ts') {
      for (const requiredSnippet of [
        'if (!preset.deferred) return preset;',
        'const loadedPreset = await loadPresetByName(preset.name);',
        'setSavedPresets(prev => sortPresets(prev.map(item => (',
        'const preset = savedPresets.find(item => item.name === presetName);',
        'if (!usesCloudBackedStatePresetLibrary) return null;',
        'const loadedPreset = await loadPresetByName(presetName);',
        '? prev.map(item => (item.name === loadedPreset.name ? loadedPreset : item))',
        ': [...prev, loadedPreset]',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: saved preset resolver hook must own deferred preset hydration and cloud-backed name lookup updates`);
        }
      }
    }

    if (relative === 'src/ui/useAutoStartPresetResolver.ts') {
      for (const requiredSnippet of [
        'const autoStartPresetRef = useRef',
        'const autoStartPresetSourceRef = useRef',
        "autoStartPresetSourceRef.current = 'cloud';",
        'const timedCloudPreset = await Promise.race',
        'window.setTimeout(() => resolve(null), timeoutMs);',
        'const deviceLocalPreset = savedPresets.find((preset) => preset.name === defaultAutoStartPresetName)',
        'usesCloudBackedStatePresetLibrary',
        'usesCapacitorLocalPresetLibrary',
        'const bundledPreset = await loadBundledPresetByName(defaultAutoStartPresetName);',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(
            `${relative}: auto-start preset resolver hook must own cloud timeout, cached source selection, saved preset fallback, bundled fallback, and preload behavior`,
          );
        }
      }
    }

    if (relative === 'src/ui/usePresetPlatformMaintenance.ts') {
      for (const requiredSnippet of [
        "import { SHARED_PRESET_TEST_MODE } from '../presets/sharedMode'",
        'target.kesshoPresetV2Migration = {',
        "const { runPresetV2Migration } = await import('../presets')",
        "const { optimizeStringWavesV2 } = await import('../presets')",
        "const { repairPresetChildGraphsV2 } = await import('../presets')",
        "const { repairStringWavesGraphV2 } = await import('../presets')",
        "const { verifyPresetV2Migration } = await import('../presets')",
        'delete target.kesshoPresetV2Migration;',
        'await cloudPresetStoreReadyPromiseRef.current;',
        "const { loadFactoryPresets } = await import('../presets')",
        'console.log(`Seeded ${n} factory presets`);',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: preset platform maintenance hook must own migration dev tools and factory seeding behavior`);
        }
      }
    }

    if (relative === 'src/ui/usePresetSequencerRestore.ts') {
      for (const requiredSnippet of [
        'setSelectedSequencerPresetHomeSnapshots(',
        'drumSubLaneStates?.map((state) => state.pitch)',
        'synthSubLaneStates?.map((state) => state.pitch)',
        'drumStepOverridesForEngineRestore(',
        'synthStepOverridesForEngineRestore(',
        'normalizeSequencerEvolveConfigs(',
        'restoreSequencerSubLaneStates(preset.synthSubLaneStates, preset.synthStepOverrides, SYNTH_EUCLIDEAN_LANE_COUNT)',
        'const drumEngineStepOverrides = drumStepOverridesForEngineRestore(',
        'const synthEngineStepOverrides = synthStepOverridesForEngineRestore(',
        'setSelectedDrumStepOverrides(',
        'drumEngineStepOverrides,',
        'setSelectedSynthStepOverrides(',
        'synthEngineStepOverrides,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: preset sequencer restore hook must own selected-runtime sequencer restore sync; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useSynthPageSequencerBridge.ts') {
      for (const requiredSnippet of [
        'const engineOverrides = synthEngineStepOverrides(overrides)',
        'setSelectedSynthStepOverrides(engineOverrides,',
        'setSelectedSynthEuclidEvolveConfigs(configs)',
        'setSelectedSynthSubLaneEnabled(subLaneEnabledFlags(sanitized',
        'setSelectedSynthPitchSettings(settings)',
        'setSelectedSynthPitchBindingModes(modes)',
        'captureSelectedSynthEuclidLaneHome(',
        'stepOverrides: engineStepOverridesRef.current',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: Synth page sequencer bridge hook must own selected-runtime Synth page sequencer wiring; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useDrumPageSequencerBridge.ts') {
      for (const requiredSnippet of [
        'setSelectedDrumStepOverrides(overrides,',
        'stepOverrides: engineStepOverridesRef.current',
        'setSelectedDrumEuclidEvolveConfigs(configs)',
        'setSelectedDrumSubLaneEnabled(subLaneEnabledFlags(sanitized))',
        'setSelectedDrumEuclidClockDivs(divs)',
        'setSelectedDrumEuclidSwings(swings)',
        'captureSelectedDrumEuclidLaneHome(',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: Drum page sequencer bridge hook must own selected-runtime Drum page sequencer wiring; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineSurface.ts') {
      failures.push(`${relative}: broad selected runtime surface must not exist; use focused selected runtime surfaces`);
    }

    if (relative === 'src/ui/useSelectedAudioEngineStateReconciliationSurface.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected state reconciliation surface must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['setStateChangeCallback', 'productEngine.setStateChangeCallback(callback)'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine state reconciliation APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineSequencerControls.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected sequencer control surface must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['setDrumEuclidEvolveConfigs', "sequencerPatch('drumEuclidEvolveConfigs', configs)"],
        ['setSynthEuclidEvolveConfigs', "sequencerPatch('synthEuclidEvolveConfigs', configs)"],
        ['setDrumEuclidClockDivs', "sequencerPatch('drumEuclidClockDivs', divs)"],
        ['setSynthEuclidClockDivs', "sequencerPatch('synthEuclidClockDivs', divs)"],
        ['setDrumEuclidSwings', "sequencerPatch('drumEuclidSwings', swings)"],
        ['setSynthEuclidSwings', "sequencerPatch('synthEuclidSwings', swings)"],
        ['setDrumSubLaneEnabled', "sequencerPatch('drumSubLaneEnabled', states)"],
        ['setSynthSubLaneEnabled', "sequencerPatch('synthSubLaneEnabled', states)"],
        ['setDrumPitchSettings', "sequencerPatch('drumPitchSettings', settings)"],
        ['setSynthPitchSettings', "sequencerPatch('synthPitchSettings', settings)"],
        ['setSynthPitchBindingModes', "sequencerPatch('synthPitchBindingModes', modes)"],
        ['setDrumStepOverrides', "sequencerPatch('drumStepOverrides', overrides)"],
        ['setSynthStepOverrides', "sequencerPatch('synthStepOverrides', overrides)"],
        ['setSequencerPresetHomeSnapshots', "sequencerPatch('sequencerPresetHomeSnapshots'"],
        ['resetSynthEuclidLaneHome', "sequencerPatch('synthEuclidLaneHomeAction', { type: 'reset', laneIndex })"],
        ['captureSynthEuclidLaneHome', "sequencerPatch('synthEuclidLaneHomeAction', { type: 'capture', laneIndex, pitchState })"],
        ['diceSynthEuclidLane', "sequencerPatch('synthEuclidLaneHomeAction', { type: 'dice', laneIndex, intensity })"],
        ['resetDrumEuclidLaneHome', "sequencerPatch('drumEuclidLaneHomeAction', { type: 'reset', laneIndex })"],
        ['captureDrumEuclidLaneHome', "sequencerPatch('drumEuclidLaneHomeAction', { type: 'capture', laneIndex, pitchSettings, pitchState })"],
        ['diceDrumEuclidLane', "sequencerPatch('drumEuclidLaneHomeAction', { type: 'dice', laneIndex, intensity })"],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must reduce sequencer intent into ProductControl state`);
        }
      }
      for (const directEnqueue of ['productEngine.enqueueEvent(', 'productEngine.enqueueEvents(']) {
        if (source.includes(directEnqueue)) {
          failures.push(`${relative}: Product Core sequencer controls must not directly enqueue ProductEvents from UI (${directEnqueue})`);
        }
      }
      for (const token of [
        'commitProductControlActionForProduct',
        'commitCoreProductSequencerEvents',
        "type: 'sequencer/edit'",
        'productEvents: events',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: Product Core sequencer controls must route generated ProductEvents through ProductControl resolved commits; missing ${token}`);
        }
      }
      for (const eventFactory of [
        'createCoreProductSequencerClockDivisionEvents',
        'createCoreProductSequencerDiceEvent',
        'createCoreProductDrumSequencerStepOverrideEvents',
        'createCoreProductSequencerEvolveConfigEvents',
        'createCoreProductSequencerLaneHomeCaptureEvent',
        'createCoreProductSequencerPitchBindingModeEvents',
        'createCoreProductSequencerPitchSettingEvents',
        'createCoreProductSequencerPresetHomeCaptureEvents',
        'createCoreProductSequencerResetHomeEvent',
        'createCoreProductSequencerSubLaneEnabledEvents',
        'createCoreProductSequencerSwingEvents',
      ]) {
        if (!source.includes(eventFactory)) {
          failures.push(`${relative}: Product Core sequencer live actions must use generated ProductEvents; missing ${eventFactory}`);
        }
      }
    }

    if (relative === 'src/ui/useLazySequencerTransport.ts') {
      for (const token of [
        'requestSequencerPlaybackStart',
        'toggleLazySequencerTransport',
        'startPlayback: (state?: SliderState) => void | Promise<void>;',
        'planSynthSequencerTransportToggle',
        'planDrumSequencerTransportToggle',
        'applySequencerTransportPlan(',
        'useKeyboardScope({',
        "event.code !== 'Space'",
        'isEditableShortcutTarget(event.target)',
        '!playbackIsRunning ? requestSequencerPlaybackStart : undefined',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: lazy sequencer transport hook must apply the shared transport plan through the scoped keyboard dispatcher; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineEvolveOverrideSurface.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected evolve override surface must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['setDrumEvolveOverridesChangedCallback', 'productEngine.setDrumEvolveOverridesChangedCallback(callback)'],
        ['setSynthEvolveOverridesChangedCallback', 'productEngine.setSynthEvolveOverridesChangedCallback(callback)'],
        ['setSynthNoteRangeEvolvedCallback', 'productEngine.setSynthNoteRangeEvolvedCallback(callback)'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine evolve override APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineMorphRuntimeSurface.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected morph runtime surface must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['setJourneyMorphClockCallback', 'productEngine.setJourneyMorphClockCallback(callback)'],
        ['startJourneyMorphClock', 'productEngine.startJourneyMorphClock()'],
        ['stopJourneyMorphClock', 'productEngine.stopJourneyMorphClock()'],
        ['resetCofDrift', 'productEngine.resetCofDrift()'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine morph runtime APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineLiveTriggerSurface.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected live trigger surface must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['setLeadExpressionCallback', 'productEngine.setLeadExpressionCallback(callback)'],
        ['setLeadMorphCallback', 'productEngine.setLeadMorphCallback(callback)'],
        ['setPadMorphTriggerCallback', 'productEngine.setPadMorphTriggerCallback(callback)'],
        ['setPad2MorphTriggerCallback', 'productEngine.setPad2MorphTriggerCallback(callback)'],
        ['setLeadDistanceCallback', 'productEngine.setLeadDistanceCallback(callback)'],
        ['setPadDistanceTriggerCallback', 'productEngine.setPadDistanceTriggerCallback(callback)'],
        ['setPad2DistanceTriggerCallback', 'productEngine.setPad2DistanceTriggerCallback(callback)'],
        ['setPianoDistanceTriggerCallback', 'productEngine.setPianoDistanceTriggerCallback(callback)'],
        ['setLeadDelayCallback', 'productEngine.setLeadDelayCallback(callback)'],
        ['setDrumMorphTriggerCallback', 'productEngine.setDrumMorphTriggerCallback(callback)'],
        ['setDrumParamSHTriggerCallback', 'productEngine.setDrumParamSHTriggerCallback(callback)'],
        ['setGranularSHTriggerCallback', 'productEngine.setGranularSHTriggerCallback(callback)'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine live trigger APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineModulationRanges.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected modulation range hook must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['setRuntimeWalkPositionsCallback', 'productEngine.setRuntimeWalkPositionsCallback(callback)'],
        ['setDrumMorphRange', 'productEngine.setDrumMorphRange(voice, range)'],
        ['setDrumParamSHRange', 'productEngine.setDrumParamSHRange(key, range)'],
        ['setDualRanges', 'productEngine.setDualRanges(ranges)'],
        ['setRuntimeWalkRanges', 'productEngine.setRuntimeWalkRanges(ranges)'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine modulation range APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineTelemetrySurface.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected telemetry surface must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['granular active grain telemetry', 'productEngine.getTelemetry()?.activeGrains'],
        ['granular write head telemetry', 'productEngine.getTelemetry()?.granularWriteHeadPosition'],
        ['granular voice telemetry', 'productEngine.getTelemetry()?.granularVoicePositions'],
        ['dynamics visual telemetry', 'productEngine.getDynamicsVisualTelemetry()'],
        ['MIDI push', 'productEngine.pushMidiMessage(message)'],
        ['visual telemetry activation', 'productEngine.setVisualTelemetryActive(active)'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine telemetry APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeTelemetry.ts') {
      for (const token of [
        "import { useSelectedAudioEngineTelemetrySurface } from './useSelectedAudioEngineTelemetrySurface'",
        "import { useSelectedAudioEngineRuntimeCapabilities } from './useSelectedAudioEngineRuntimeCapabilities'",
        'useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode)',
        'useSelectedAudioEngineRuntimeCapabilities({',
        'setSelectedVisualTelemetryActive: telemetrySurface.setSelectedVisualTelemetryActive',
        'selectedRuntimeSupportsRangeKey,',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime telemetry hook must compose telemetry surface and runtime capabilities; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected runtime telemetry hook must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineSequencerCallbacks.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: selected sequencer callback hook must not expose browser-only ${browserOnlyType}`);
        }
      }
      for (const [method, snippet] of [
        ['drum trigger callback', 'productEngine.setDrumTriggerCallback(callback ?'],
        ['drum step callback', 'productEngine.setDrumStepPositionCallback(callback)'],
        ['synth step callback', 'productEngine.setSynthStepPositionCallback(callback)'],
        ['drum evolve callback', 'productEngine.setDrumEuclidEvolveTriggerCallback(callback)'],
        ['synth evolve callback', 'productEngine.setSynthEuclidEvolveTriggerCallback(callback)'],
      ]) {
        if (!source.includes(snippet)) {
          failures.push(`${relative}: Product Core ${method} must route through ProductEnginePort/productEngine callback APIs`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeSurfaces.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineCallbackSurfaces } from './useSelectedAudioEngineCallbackSurfaces'",
        "import { useSelectedAudioEngineControlSurfaces } from './useSelectedAudioEngineControlSurfaces'",
        "import { useSelectedAudioEngineDebugRuntime } from './useSelectedAudioEngineDebugRuntime'",
        'useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode)',
        'useSelectedAudioEngineControlSurfaces(audioEngineRuntimeMode)',
        'useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode)',
        '...callbackSurfaces',
        '...controlSurfaces',
        '...debugRuntime',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected runtime surface composer must combine callback, control, and debug runtime surfaces; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: selected runtime surface composer must compose selected runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeSurfaces.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimeCallbackSurfaces } from './useProductRuntimeCallbackSurfaces'",
        "import { useProductRuntimeControlSurfaces } from './useProductRuntimeControlSurfaces'",
        "import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'export function useProductRuntimeSurfaces({',
        'useProductRuntimeCallbackSurfaces(productRuntimeMode)',
        'useProductRuntimeControlSurfaces({ productRuntimeMode, stateRef })',
        'useProductRuntimeDebugRuntime(productRuntimeMode)',
        '...callbackSurfaces',
        '...controlSurfaces',
        '...debugRuntime',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime surfaces facade must compose product-named callback, control, and debug surfaces; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEngineRuntimeSurfaces')
      ) {
        failures.push(`${relative}: product runtime surfaces facade must delegate to selected runtime compatibility hooks instead of touching implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeCallbackSurfaces.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimeEvolveOverrideSurface } from './useProductRuntimeEvolveOverrideSurface'",
        "import { useProductRuntimeLiveTriggerSurface } from './useProductRuntimeLiveTriggerSurface'",
        "import { useRuntimeSequencerProjectionCallbacks } from './useRuntimeSequencerProjectionCallbacks'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'export function useProductRuntimeCallbackSurfaces(productRuntimeMode: ProductRuntimeSelectionMode)',
        'useRuntimeSequencerProjectionCallbacks(productRuntimeMode)',
        'useProductRuntimeLiveTriggerSurface(productRuntimeMode)',
        'useProductRuntimeEvolveOverrideSurface(productRuntimeMode)',
        'setProductDrumStepPositionCallback: projectionCallbacks.setDrumStepPositionCallback',
        'setProductSynthEvolveTriggerCallback: projectionCallbacks.setSynthEvolveTriggerCallback',
        '...liveTriggerSurface',
        '...evolveOverrideSurface',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime callback surfaces must compose shared sequencer projections with product-named fields; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEngineCallbackSurfaces')
      ) {
        failures.push(`${relative}: product runtime callback surfaces must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeControlSurfaces.ts') {
      for (const requiredSnippet of [
        "import { useProductRuntimeModulationRanges } from './useProductRuntimeModulationRanges'",
        "import { useProductRuntimeMorphRuntimeSurface } from './useProductRuntimeMorphRuntimeSurface'",
        "import { useProductRuntimeSequencerControls } from './useProductRuntimeSequencerControls'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'export function useProductRuntimeControlSurfaces({',
        'useProductRuntimeModulationRanges(productRuntimeMode)',
        'useProductRuntimeMorphRuntimeSurface(productRuntimeMode)',
        'useProductRuntimeSequencerControls({ productRuntimeMode, stateRef })',
        '...modulationRanges',
        '...morphRuntimeSurface',
        '...sequencerControls',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime control surfaces must compose product-named control wrappers; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEngineControlSurfaces')
      ) {
        failures.push(`${relative}: product runtime control surfaces must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeSequencerCallbacks.ts') {
      for (const requiredSnippet of [
        "import { useRuntimeSequencerProjectionCallbacks } from './useRuntimeSequencerProjectionCallbacks'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'type ProductRuntimeSequencerCallbacks = {',
        'setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void',
        'setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void',
        'const sequencerCallbacks = useSelectedAudioEngineSequencerCallbacks(productRuntimeMode)',
        'setProductDrumStepPositionCallback: sequencerCallbacks.setSelectedDrumStepPositionCallback',
        'setProductSynthEvolveTriggerCallback: sequencerCallbacks.setSelectedSynthEvolveTriggerCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime sequencer callbacks must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      const productSequencerCallbacksType = source.match(/type ProductRuntimeSequencerCallbacks = \{[\s\S]*?\};/)?.[0] ?? '';
      if (/^\s*setSelected/m.test(productSequencerCallbacksType)) {
        failures.push(`${relative}: product runtime sequencer callbacks must expose product-named fields only`);
      }
      if (source.includes('ReturnType<typeof useSelectedAudioEngineSequencerCallbacks>') || source.includes('SelectedRuntimeSequencerCallbacks')) {
        failures.push(`${relative}: product runtime sequencer callbacks must not derive return types from selected-runtime hooks`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime sequencer callbacks must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeLiveTriggerSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'type ProductLeadMorph = { lead1: number; lead2: number }',
        'type ProductRuntimeLiveTriggerSurface = {',
        'setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void',
        'setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void',
        'const liveTriggerSurface = useSelectedAudioEngineLiveTriggerSurface(productRuntimeMode)',
        'setProductLeadExpressionCallback: liveTriggerSurface.setSelectedLeadExpressionCallback',
        'setProductGranularSHTriggerCallback: liveTriggerSurface.setSelectedGranularSHTriggerCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime live trigger surface must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      const productLiveTriggerSurfaceType = source.match(/type ProductRuntimeLiveTriggerSurface = \{[\s\S]*?\};/)?.[0] ?? '';
      if (/^\s*setSelected/m.test(productLiveTriggerSurfaceType)) {
        failures.push(`${relative}: product runtime live trigger surface must expose product-named fields only`);
      }
      if (source.includes('ReturnType<typeof useSelectedAudioEngineLiveTriggerSurface>') || source.includes('SelectedRuntimeLiveTriggerSurface')) {
        failures.push(`${relative}: product runtime live trigger surface must not derive return types from selected-runtime hooks`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime live trigger surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeEvolveOverrideSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'type ProductRuntimeEvolveOverrideSurface = {',
        'setProductDrumEvolveOverridesChangedCallback:',
        'setProductSynthEvolveOverridesChangedCallback:',
        'setProductSynthNoteRangeEvolvedCallback:',
        'useSelectedAudioEngineEvolveOverrideSurface(productRuntimeMode)',
        'setProductDrumEvolveOverridesChangedCallback: evolveOverrideSurface.setSelectedDrumEvolveOverridesChangedCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime evolve override surface must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime evolve override surface must not touch runtime implementations directly`);
      }
      if (
        source.includes('ReturnType<typeof useSelectedAudioEngineEvolveOverrideSurface>') ||
        source.includes('SelectedRuntimeEvolveOverrideSurface')
      ) {
        failures.push(`${relative}: product runtime evolve override surface must not derive return types from selected-runtime hooks`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeModulationRanges.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineModulationRanges } from './useSelectedAudioEngineModulationRanges'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes'",
        'export function useProductRuntimeModulationRanges(productRuntimeMode: ProductRuntimeSelectionMode)',
        'type ProductRuntimeModulationRanges = {',
        'setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void',
        'setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void',
        'setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void',
        'useSelectedAudioEngineModulationRanges(productRuntimeMode)',
        'setProductRuntimeWalkPositionsCallback: modulationRanges.setSelectedRuntimeWalkPositionsCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime modulation ranges must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('ReturnType<typeof useSelectedAudioEngineModulationRanges>') || source.includes('SelectedRuntimeModulationRanges')) {
        failures.push(`${relative}: product runtime modulation ranges must not derive return types from selected-runtime hooks`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime modulation ranges must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeMorphRuntimeSurface.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineMorphRuntimeSurface } from './useSelectedAudioEngineMorphRuntimeSurface'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'type ProductJourneyMorphClockCallback = (now: number) => void',
        'type ProductRuntimeMorphRuntimeSurface = {',
        'resetProductCofDrift: () => void',
        'setProductJourneyMorphClockCallback: (callback: ProductJourneyMorphClockCallback | null) => void',
        'const morphRuntimeSurface = useSelectedAudioEngineMorphRuntimeSurface(productRuntimeMode)',
        'resetProductCofDrift: morphRuntimeSurface.resetSelectedCofDrift',
        'setProductJourneyMorphClockCallback: morphRuntimeSurface.setSelectedJourneyMorphClockCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime morph runtime surface must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      const productMorphRuntimeSurfaceType = source.match(/type ProductRuntimeMorphRuntimeSurface = \{[\s\S]*?\};/)?.[0] ?? '';
      if (/^\s*(resetSelected|setSelected|startSelected|stopSelected)/m.test(productMorphRuntimeSurfaceType)) {
        failures.push(`${relative}: product runtime morph runtime surface must expose product-named fields only`);
      }
      if (source.includes('ReturnType<typeof useSelectedAudioEngineMorphRuntimeSurface>') || source.includes('SelectedRuntimeMorphSurface')) {
        failures.push(`${relative}: product runtime morph runtime surface must not derive return types from selected-runtime hooks`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime morph runtime surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeSequencerControls.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineSequencerControls } from './useSelectedAudioEngineSequencerControls'",
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        'type ProductRuntimeSequencerPitchState = { steps?: number; direction?: string; scaleQuantize?: boolean } | null',
        'type ProductRuntimeSequencerControls = {',
        'setProductDrumEuclidEvolveConfigs: (configs: readonly unknown[]) => void',
        'captureProductSynthEuclidLaneHome: (laneIndex: number, pitchState?: ProductRuntimeSequencerPitchState) => void',
        'const sequencerControls = useSelectedAudioEngineSequencerControls(productRuntimeMode, stateRef)',
        'setProductDrumEuclidEvolveConfigs: sequencerControls.setSelectedDrumEuclidEvolveConfigs',
        'captureProductSynthEuclidLaneHome: sequencerControls.captureSelectedSynthEuclidLaneHome',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime sequencer controls must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      const productSequencerControlsType = source.match(/type ProductRuntimeSequencerControls = \{[\s\S]*?\};/)?.[0] ?? '';
      if (
        /^\s*(setSelected|resetSelected|captureSelected|diceSelected)/m.test(productSequencerControlsType)
      ) {
        failures.push(`${relative}: product runtime sequencer controls must expose product-named fields only`);
      }
      if (source.includes('ReturnType<typeof useSelectedAudioEngineSequencerControls>') || source.includes('SelectedRuntimeSequencerControls')) {
        failures.push(`${relative}: product runtime sequencer controls must not derive return types from selected-runtime hooks`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime sequencer controls must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeDebugRuntime.ts') {
      for (const requiredSnippet of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import { useSelectedAudioEngineDebugRuntime } from './useSelectedAudioEngineDebugRuntime'",
        "import type { EarthTextureDebugState } from '../audio/engineSharedTypes'",
        'type ProductRuntimeDebugRuntime = {',
        'getProductGranularBufferWaveform: () => Float32Array | null',
        'getProductTransportDebugState: () => TransportDebugSnapshot | null',
        'getProductLeadMorphedParams: (lead: 1 | 2) => ProductLeadMorphedParams',
        'productRuntimeDebugAnalysers: ProductRuntimeDebugAnalysers',
        'export function useProductRuntimeDebugRuntime(',
        'productRuntimeMode: ProductRuntimeSelectionMode',
        'getSelectedGranularBufferWaveform: getProductGranularBufferWaveform',
        'getSelectedTransportDebugState: getProductTransportDebugState',
        'getSelectedLeadMorphedParams: getProductLeadMorphedParams',
        'selectedAudioEngineDebugAnalysers: productRuntimeDebugAnalysers',
        'updateSelectedReferenceParams: updateProductReferenceParams',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime debug runtime must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      const productDebugRuntimeType = source.match(/type ProductRuntimeDebugRuntime = [\s\S]*?\};/)?.[0] ?? '';
      if (/^\s*selectedAudioEngineDebugAnalysers/m.test(productDebugRuntimeType)) {
        failures.push(`${relative}: product runtime debug runtime must expose product-named debug analyser fields only`);
      }
      if (source.includes('ReturnType<typeof useSelectedAudioEngineDebugRuntime>') || source.includes('SelectedDebugRuntime')) {
        failures.push(`${relative}: product runtime debug runtime must not derive return types from selected-runtime hooks`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime debug runtime must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useRuntimeSequencerProjectionCallbacks.ts') {
      for (const requiredSnippet of [
        'export function useRuntimeSequencerProjectionCallbacks(runtimeMode: ProductRuntimeSelectionMode)',
        'productEngine.setDrumStepPositionCallback(callback)',
        'productEngine.setDrumEuclidEvolveTriggerCallback(callback)',
        'productEngine.setDrumTriggerCallback(',
        'productEngine.setSynthStepPositionCallback(callback)',
        'productEngine.setSynthOrbitVisualStateCallback(callback)',
        'productEngine.setSynthAnchorWalkerVisualStateCallback(callback)',
        'productEngine.setSynthEuclidEvolveTriggerCallback(callback)',
      ]) {
        if (!source.includes(requiredSnippet)) failures.push(`${relative}: canonical sequencer projection hook is missing ${requiredSnippet}`);
      }
      for (const forbidden of ['enqueueEvents', 'commitLiveSequencerTiming', 'setInterval', 'requestAnimationFrame', 'primeAudioContext', 'resumeQuant']) {
        if (source.includes(forbidden)) failures.push(`${relative}: projection hook must not own timing/lifecycle behavior (${forbidden})`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineCallbackSurfaces.ts') {
      for (const requiredSnippet of [
        "import { useRuntimeSequencerProjectionCallbacks } from './useRuntimeSequencerProjectionCallbacks'",
        "import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface'",
        "import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface'",
        'useRuntimeSequencerProjectionCallbacks(audioEngineRuntimeMode)',
        'useSelectedAudioEngineLiveTriggerSurface(audioEngineRuntimeMode)',
        'useSelectedAudioEngineEvolveOverrideSurface(audioEngineRuntimeMode)',
        'setSelectedDrumStepPositionCallback: projectionCallbacks.setDrumStepPositionCallback',
        'setSelectedSynthEvolveTriggerCallback: projectionCallbacks.setSynthEvolveTriggerCallback',
        '...liveTriggerSurface',
        '...evolveOverrideSurface',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected callback surface composer must combine sequencer, live trigger, and evolve override surfaces; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected callback surface composer must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineControlSurfaces.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineModulationRanges } from './useSelectedAudioEngineModulationRanges'",
        "import { useSelectedAudioEngineMorphRuntimeSurface } from './useSelectedAudioEngineMorphRuntimeSurface'",
        "import { useSelectedAudioEngineSequencerControls } from './useSelectedAudioEngineSequencerControls'",
        'useSelectedAudioEngineModulationRanges(audioEngineRuntimeMode)',
        'useSelectedAudioEngineMorphRuntimeSurface(audioEngineRuntimeMode)',
        'useSelectedAudioEngineSequencerControls(audioEngineRuntimeMode)',
        '...modulationRanges',
        '...morphRuntimeSurface',
        '...sequencerControls',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected control surface composer must combine modulation, morph runtime, and sequencer control surfaces; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected control surface composer must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/audio/product/WebProductEngine.ts') {
      if (source.includes('coreProductEngineHost')) {
        failures.push(`${relative}: WebProductEngine must route Product host calls through CoreProductHostInvoker instead of importing coreProductEngineHost directly`);
      }
      if (source.includes('callCoreProductHost') || source.includes("from './host/CoreProductHostInvoker'")) {
        failures.push(`${relative}: WebProductEngine must not bind the generic Product host invoker directly; use CoreProductRuntimeHostPort`);
      }
      for (const importSource of staticImportSources(source)) {
        if (importSource.startsWith('./host/') && importSource !== './host/CoreProductRuntimeHostPort') {
          failures.push(`${relative}: WebProductEngine must import only CoreProductRuntimeHostPort from product/host, not ${importSource}`);
        }
      }
      if (/\bfunction\s+host\s*\(/.test(source) || /\bfunction\s+callHost\s*</.test(source)) {
        failures.push(`${relative}: generic Product host lookup/invocation must stay in src/audio/product/host/CoreProductHostInvoker.ts`);
      }
      for (const token of [
        "import { coreProductRuntimeHostPort } from './host/CoreProductRuntimeHostPort'",
        'coreProductRuntimeHostPort.start(options?.initialState)',
        'coreProductRuntimeHostPort.stop()',
        'coreProductRuntimeHostPort.suspend()',
        'coreProductRuntimeHostPort.resume()',
        'coreProductRuntimeHostPort.setOutputGain(target, durationSeconds)',
        'coreProductRuntimeHostPort.resetCofDrift()',
        'coreProductRuntimeHostPort.updateSnapshotPatch(reason, patch)',
        'coreProductRuntimeHostPort.postEvent(event)',
        'coreProductRuntimeHostPort.pushMidiMessage(message)',
        'coreProductRuntimeHostPort.registerAsset(asset)',
        'coreProductRuntimeHostPort.unregisterAsset(assetId)',
        'coreProductRuntimeHostPort.auditionSynthNote(note, externalState)',
        'coreProductRuntimeHostPort.triggerDrumVoice(voice, velocity, externalState)',
        'coreProductRuntimeHostPort.readState()',
        'coreProductRuntimeHostPort.readTelemetry()',
        'coreProductRuntimeHostPort.readDynamicsVisualTelemetry()',
        'coreProductRuntimeHostPort.readDiagnostics()',
        'coreProductRuntimeHostPort.readCapabilityReport()',
        'coreProductRuntimeHostPort.setStateChangeCallback(callback)',
        'coreProductRuntimeHostPort.setTelemetryCallback(callback, () => this.scheduleDiagnosticsPublish())',
        'coreProductRuntimeHostPort.setDrumTriggerCallback(callback)',
        'coreProductRuntimeHostPort.setDrumStepPositionCallback(callback)',
        'coreProductRuntimeHostPort.setSynthStepPositionCallback(callback)',
        'coreProductRuntimeHostPort.setDrumEuclidEvolveTriggerCallback(callback)',
        'coreProductRuntimeHostPort.setSynthEuclidEvolveTriggerCallback(callback)',
        'coreProductRuntimeHostPort.setRuntimeWalkPositionsCallback(callback)',
        'coreProductRuntimeHostPort.setDrumMorphRange(voice, range)',
        'coreProductRuntimeHostPort.setDrumParamSHRange(key, range)',
        'coreProductRuntimeHostPort.setDualRanges(ranges)',
        'coreProductRuntimeHostPort.setRuntimeWalkRanges(ranges)',
        "this.setLiveTriggerCallback('leadExpression', callback)",
        "this.setLiveTriggerCallback('granularSH', callback)",
        'coreProductRuntimeHostPort.setLiveTriggerCallback(name, callback)',
        'coreProductRuntimeHostPort.setJourneyMorphClockCallback(callback)',
        'coreProductRuntimeHostPort.startJourneyMorphClock()',
        'coreProductRuntimeHostPort.stopJourneyMorphClock()',
        'coreProductRuntimeHostPort.setDrumEvolveOverridesChangedCallback(callback)',
        'coreProductRuntimeHostPort.setSynthEvolveOverridesChangedCallback(callback)',
        'coreProductRuntimeHostPort.setSynthNoteRangeEvolvedCallback(callback)',
        'coreProductRuntimeHostPort.setPerfMonitorEnabled(enabled)',
        'coreProductRuntimeHostPort.setPerfUpdateCallback(callback)',
        'coreProductRuntimeHostPort.setVisualTelemetryActive(active)',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: WebProductEngine must delegate Product host behavior through CoreProductRuntimeHostPort; missing ${token}`);
        }
      }
      for (const hostMethod of webProductRuntimeLifecycleHostMethods) {
        const pattern = new RegExp(`callCoreProductHost<[^>]+>\\('${hostMethod}'`);
        if (relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' && pattern.test(source)) {
          failures.push(`${relative}: runtime lifecycle host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductRuntimeReadHostMethods) {
        const pattern = new RegExp(`callCoreProductHost<[^>]+>\\('${hostMethod}'`);
        if (relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' && pattern.test(source)) {
          failures.push(`${relative}: runtime read host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductLiveTriggerHostMethods) {
        if (source.includes(`callCoreProductHost<void>('${hostMethod}'`)) {
          failures.push(`${relative}: live trigger callback host method ${hostMethod} must stay in CoreProductLiveTriggerCallbackBridge`);
        }
      }
      for (const hostMethod of webProductModulationRangeHostMethods) {
        if (
          relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' &&
          source.includes(`callCoreProductHost<void>('${hostMethod}'`)
        ) {
          failures.push(`${relative}: modulation/range host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductJourneyMorphHostMethods) {
        if (
          relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' &&
          source.includes(`callCoreProductHost<void>('${hostMethod}'`)
        ) {
          failures.push(`${relative}: journey morph host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductSequencerCallbackHostMethods) {
        if (
          relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' &&
          source.includes(`callCoreProductHost<void>('${hostMethod}'`)
        ) {
          failures.push(`${relative}: sequencer callback host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductEvolveOverrideCallbackHostMethods) {
        if (
          relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' &&
          source.includes(`callCoreProductHost<void>('${hostMethod}'`)
        ) {
          failures.push(`${relative}: evolved override callback host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductRuntimeTelemetryHostMethods) {
        if (
          relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' &&
          source.includes(`callCoreProductHost<void>('${hostMethod}'`)
        ) {
          failures.push(`${relative}: runtime telemetry host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const hostMethod of webProductRuntimeCommandHostMethods) {
        const pattern = new RegExp(`callCoreProductHost<[^>]+>\\('${hostMethod}'`);
        if (relative !== 'src/audio/product/host/CoreProductRuntimeHostPort.ts' && pattern.test(source)) {
          failures.push(`${relative}: routine runtime host method ${hostMethod} must stay in CoreProductRuntimeHostPort`);
        }
      }
      for (const signature of migratedSequencerCompatMethodSignatures) {
        if (source.includes(signature)) {
          failures.push(`${relative}: migrated sequencer control ${signature} must stay off WebProductEngine; production uses generated ProductEvents`);
        }
      }
      if (/updateSnapshotPatch\([^)]*_reason/.test(source)) {
        failures.push(`${relative}: updateSnapshotPatch must honor the Product patch reason`);
      }
      if (/updateSnapshotPatch[\s\S]*updateParams/.test(source)) {
        failures.push(`${relative}: updateSnapshotPatch must not forward ProductEnginePort patches through updateParams`);
      }
      if (source.includes('core-product host does not yet expose asset unregistration')) {
        failures.push(`${relative}: unregisterAsset must forward to the Product host instead of throwing`);
      }
      for (const token of [
        'common controls should move to generated ProductEvents or dirty-diff paths',
        'do not replace generated events with legacy parameter-update snapshots',
        'Asset lifecycle stays product-shaped here',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: WebProductEngine compatibility burn-down comment missing ${token}`);
        }
      }
    }
    if (relative === 'src/audio/product/host/CoreProductHostInvoker.ts') {
      for (const token of [
        "import { coreProductEngineHost } from '../../coreProductEngineHost'",
        'export type CoreProductHostMethodCall',
        'export const callCoreProductHost',
        'core-product host does not implement',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: Product host invoker missing ${token}`);
        }
      }
    }
    if (relative === 'src/audio/product/host/CoreProductRuntimeHostPort.ts') {
      for (const token of [
        'TODO(product-core-burn-down)',
        "import { callCoreProductHost } from './CoreProductHostInvoker'",
        'export const coreProductRuntimeHostPort',
        'start(initialState?: ProductEngineStartOptions',
        "return callCoreProductHost<Promise<void>>('start', initialState)",
        "callCoreProductHost<void>('stop')",
        "return callCoreProductHost<Promise<void>>('suspend')",
        "return callCoreProductHost<Promise<void>>('resume')",
        "callCoreProductHost<void>('setOutputGain', target, durationSeconds)",
        "callCoreProductHost<void>('updateSnapshotPatch', reason, patch)",
        "callCoreProductHost<void>('postProductEvent', event)",
        "callCoreProductHost<void>('pushMidiMessage', message)",
        "callCoreProductHost<void>('registerAsset', asset)",
        'return { assetId: asset.assetId }',
        "callCoreProductHost<void>('unregisterAsset', assetId)",
        "return callCoreProductHost<Promise<void>>('auditionSynthNote', note, externalState)",
        "return callCoreProductHost<Promise<void>>('triggerDrumVoice', voice, velocity, externalState)",
        "return callCoreProductHost<ProductEngineState>('getState')",
        "return callCoreProductHost<ProductTelemetrySnapshot | null>('getProductTelemetry')",
        "return callCoreProductHost<ProductDynamicsVisualTelemetry>('getDynamicsVisualTelemetry')",
        "return callCoreProductHost<ProductRuntimeDiagnostics>('getProductRuntimeDiagnostics')",
        "return callCoreProductHost<ProductRuntimeCapabilityReport>('getCapabilityReport')",
        'CORE_PRODUCT_RUNTIME_CALLBACK_METHODS',
        'setCoreProductRuntimeCallback',
        "stateChange: 'setStateChangeCallback'",
        "drumTrigger: 'setDrumTriggerCallback'",
        "drumStepPosition: 'setDrumStepPositionCallback'",
        "synthEuclidEvolve: 'setSynthEuclidEvolveTriggerCallback'",
        "setCoreProductRuntimeCallback('stateChange', callback)",
        "callCoreProductHost<void>('setProductTelemetryCallback', callback ?",
        "callCoreProductHost<void>('setPerfUpdateCallback', callback)",
        'publishDiagnostics();',
        "setCoreProductRuntimeCallback('drumTrigger', callback)",
        "setCoreProductRuntimeCallback('runtimeWalkPositions', callback)",
        "callCoreProductHost<void>('setRuntimeWalkRanges', ranges)",
        'setCoreProductLiveTriggerCallback(callCoreProductHost, name, callback)',
        "callCoreProductHost<void>('setVisualTelemetryActive', active)",
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: Product runtime host port missing ${token}`);
        }
      }
    }
    if (relative === 'src/audio/product/host/CoreProductLiveTriggerCallbackBridge.ts') {
      for (const token of [
        'TODO(product-core-burn-down)',
        "import type { CoreProductHostMethodCall } from './CoreProductHostInvoker'",
        'CORE_PRODUCT_LIVE_TRIGGER_CALLBACK_METHODS',
        'setCoreProductLiveTriggerCallback',
        "leadExpression: 'setLeadExpressionCallback'",
        "leadMorph: 'setLeadMorphCallback'",
        "padMorph: 'setPadMorphTriggerCallback'",
        "pad2Morph: 'setPad2MorphTriggerCallback'",
        "leadDistance: 'setLeadDistanceCallback'",
        "padDistance: 'setPadDistanceTriggerCallback'",
        "pad2Distance: 'setPad2DistanceTriggerCallback'",
        "pianoDistance: 'setPianoDistanceTriggerCallback'",
        "leadDelay: 'setLeadDelayCallback'",
        "drumMorph: 'setDrumMorphTriggerCallback'",
        "drumParamSH: 'setDrumParamSHTriggerCallback'",
        "granularSH: 'setGranularSHTriggerCallback'",
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: Product live trigger callback bridge missing ${token}`);
        }
      }
    }
    if (relative === 'src/audio/product/host/CoreProductSequencerUiPatchBridge.ts') failures.push(`${relative}: Product sequencer UI patch bridge must stay deleted; use generated Product events`);
    if (relative === 'docs/product-core/product-engine-port.md') {
      for (const token of [
        '## Sequencer Generated Event Burn-down',
        '`applySequencerUiPatch` is retired from the ProductEnginePort surface',
        '`product-core-sequencer-evolve-config-events`',
        '`product-core-sequencer-sub-lane-config-events`',
        '`product-core-sequencer-step-override-events`',
        '`product-core-sequencer-pitch-settings-events`',
        '`product-core-sequencer-home-capture-events`',
        'CoreProductSequencerUiPatchBridge must stay deleted',
        'must not reintroduce individual legacy setter methods on `ProductEnginePort`',
        'force full snapshot reloads for routine sequencer edits',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: ProductEnginePort sequencer patch burn-down docs missing ${token}`);
        }
      }
    }
    if (relative === 'src/audio/product/ProductEnginePort.ts') {
      for (const method of [
        'resetCofDrift(): void',
        'setOutputGain(target: number, durationSeconds?: number): void',
        'pushMidiMessage(message: ProductMidiMessage): void',
        'auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void>',
        'triggerDrumVoice(voice: ProductDrumVoice, velocity?: number, externalState?: ProductExternalState): Promise<void>',
        'getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry',
        'getCapabilityReport(): ProductRuntimeCapabilityReport',
        'setVisualTelemetryActive(active: boolean): void',
        'setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void',
        'setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void',
        'setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void',
        'setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void',
        'setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void',
        'setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void',
        'setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void',
        'setDrumParamSHRange(key: string, range: ProductRange | null): void',
        'setDualRanges(ranges: ProductRangeMap): void',
        'setRuntimeWalkRanges(ranges: ProductRangeMap): void',
        'setLeadExpressionCallback(callback: ProductLeadExpressionCallback | null): void',
        'setLeadMorphCallback(callback: ProductLeadPairCallback | null): void',
        'setPadMorphTriggerCallback(callback: ProductScalarCallback | null): void',
        'setPad2MorphTriggerCallback(callback: ProductScalarCallback | null): void',
        'setLeadDistanceCallback(callback: ProductLeadPairCallback | null): void',
        'setPadDistanceTriggerCallback(callback: ProductScalarCallback | null): void',
        'setPad2DistanceTriggerCallback(callback: ProductScalarCallback | null): void',
        'setPianoDistanceTriggerCallback(callback: ProductScalarCallback | null): void',
        'setLeadDelayCallback(callback: ProductLeadDelayCallback | null): void',
        'setDrumMorphTriggerCallback(callback: ProductDrumMorphCallback | null): void',
        'setDrumParamSHTriggerCallback(callback: ProductDrumParamSampleHoldCallback | null): void',
        'setGranularSHTriggerCallback(callback: ProductRuntimeWalkPositionsCallback | null): void',
        'setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void',
        'startJourneyMorphClock(): void',
        'stopJourneyMorphClock(): void',
        'setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void',
        'setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void',
        'setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void',
      ]) {
        if (!productPortContractSurface.includes(method)) {
          failures.push(`${relative}: ProductEnginePort must expose ${method} so App does not use legacy AudioEngine for Product Core`);
        }
      }
      for (const rawCompatibilityShape of [
        ': unknown',
        'Record<string, unknown>',
        'Record<string, number>',
        '{ min: number; max: number }',
      ]) {
        if (productPortContractSurface.includes(rawCompatibilityShape)) {
          failures.push(`${relative}: ProductEnginePort must use named product-owned types instead of inline ${rawCompatibilityShape}`);
        }
      }
      for (const signature of migratedSequencerCompatMethodSignatures) {
        if (productPortContractSurface.includes(signature)) {
          failures.push(`${relative}: migrated sequencer control ${signature} must stay off ProductEnginePort; production uses generated ProductEvents`);
        }
      }
    }

    if (relative === 'src/audio/product/ProductRuntimeCapabilityReport.ts') {
      for (const token of [
        'KESSHO_PRODUCT_SCHEMA_HASH',
        'KESSHO_PRODUCT_SCHEMA_HASH_HEX',
        'KESSHO_PRODUCT_SCHEMA_VERSION',
        'export const KESSHO_PRODUCT_ABI_VERSION = 5 as const',
        "runtimeKind: 'web-worklet'",
        'supportsNativeBridge: false',
        'legacyFallbackCount: 0',
        'unsupportedMethodCount: 0',
        "nativeBridge: 'deferred-for-web-default'",
        'nativeProductRuntimeGuarded: true',
        'testProductRuntimeGuarded: true',
        'diagnostics: ProductRuntimeDiagnostics',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: Product runtime capability report is missing ${token}`);
        }
      }
    }

    if (relative === 'src/audio/product/ProductEngineProxy.ts') {
      if (source.includes('coreProductEngineHost') || source.includes('referenceAudioRuntime')) {
        failures.push(`${relative}: ProductEngineProxy must only load ProductEnginePort runtimes, not legacy host/reference facades`);
      }
      for (const forbiddenToken of ['URLSearchParams', 'window.location', 'native-product', 'test-product', 'web-ts', 'web-audio', 'core-smoke', 'resolvedRuntimeMode']) {
        if (source.includes(forbiddenToken)) {
          failures.push(`${relative}: ProductEngineProxy must be core-product only and must not contain runtime selection token ${forbiddenToken}`);
        }
      }
      if (
        !source.includes("export function getProductEngineRuntimeMode(): 'core-product'") ||
        !source.includes("return 'core-product';") ||
        !source.includes('new WebProductEngine()')
      ) {
        failures.push(`${relative}: ProductEngineProxy must expose a direct core-product WebProductEngine runtime`);
      }
    }

    if (relative === 'src/audio/product/ProductAudioRuntimeSelection.ts') {
      for (const token of [
        "export type ProductRuntimeMode = 'core-product'",
        "export type ProductReferenceRuntimeMode = 'web-ts' | 'core-smoke'",
        'export type ProductRuntimeSelectionMode = ProductRuntimeMode | ProductReferenceRuntimeMode',
        "const PRODUCT_RUNTIME_MODES = ['core-product']",
        "const REFERENCE_RUNTIME_MODES = ['core-product', 'web-ts', 'core-smoke']",
        "if (!isDevRuntime()) return getProductionProductRuntimeMode()",
        "if (!isDevRuntime()) return PRODUCT_RUNTIME_MODES",
        "if (mode === 'native-product' || mode === 'test-product') return getProductionProductRuntimeMode()",
        'return isReferenceRuntimeEnabled(params) ? REFERENCE_RUNTIME_MODES : PRODUCT_RUNTIME_MODES',
        'export function getProductRuntimeMode(): ProductRuntimeSelectionMode',
        'export function getProductRuntimeModes(): readonly ProductRuntimeSelectionMode[]',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: runtime selection must keep web-ts/core-smoke reference-only and expose only core-product in production; missing ${token}`);
        }
      }
      for (const forbiddenToken of [
        'AudioEngineRuntimeMode',
        'getAudioEngineRuntimeMode',
        'getAudioEngineRuntimeModes',
        'web-audio',
      ]) {
        if (source.includes(forbiddenToken)) {
          failures.push(`${relative}: product runtime selection must not export selected-audio-engine compatibility token ${forbiddenToken}`);
        }
      }
    }

    if (relative === 'src/audio/product/SelectedProductRuntime.ts') {
      for (const browserOnlyType of webAudioBoundaryTypes) {
        if (new RegExp(`\\b${browserOnlyType}\\b`).test(source)) {
          failures.push(`${relative}: product-safe selected runtime facade must not expose browser-only ${browserOnlyType}; use the reference/debug facade`);
        }
      }
      if (source.includes('coreProductEngineHost')) {
        failures.push(`${relative}: core-product compatibility must route through ProductEnginePort instead of importing coreProductEngineHost`);
      }
      if (source.includes("import('../referenceAudioRuntime')") || source.includes('loadReferenceAudioRuntime')) {
        failures.push(`${relative}: product-side selected runtime must not own reference runtime loading; use ReferenceSelectedRuntime`);
      }
      for (const token of [
        "from '../reference/ReferenceSelectedRuntime'",
        "getProductRuntimeMode",
        'getLoadedReferenceSelectedRuntimeTarget()',
        'invokeReferenceSelectedRuntimeMethod(runtimeMode, method, args)',
        'return preloadReferenceSelectedRuntime();',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime must delegate reference loading/invocation to ReferenceSelectedRuntime; missing ${token}`);
        }
      }
      if (!source.includes('return productEngine.preload().then(() => productEngine);')) {
        failures.push(`${relative}: core-product preload must route through ProductEngineProxy`);
      }
      if (source.includes('updateParams')) {
        failures.push(`${relative}: product-safe selected runtime facade must not expose legacy updateParams; keep it reference-only`);
      }
    }

    if (relative === 'src/audio/reference/ReferenceSelectedRuntime.ts') {
      for (const token of [
        "import('../referenceAudioRuntime')",
        'loadReferenceAudioRuntime()',
        'getLoadedReferenceSelectedRuntimeTarget',
        'invokeReferenceSelectedRuntimeMethod',
        'preloadReferenceSelectedRuntime',
        'runtime.preloadAudioEngine()',
        'Selected reference runtime',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: reference selected runtime bridge missing ${token}`);
        }
      }
      if (source.includes('coreProductEngineHost') || source.includes('ProductEngineProxy')) {
        failures.push(`${relative}: reference selected runtime bridge must not import product host/proxy internals`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineStateReconciliationSurface.ts' && source.includes('updateSelectedReferenceParams')) {
      failures.push(`${relative}: product-facing selected runtime surface must not expose reference updateParams helpers`);
    }

    if (relative === 'src/ui/useSelectedAudioEngineDebugSurface.ts') {
      if (!source.includes('updateSelectedReferenceParams') || !source.includes('referenceAudioEngineDebug.updateParams(nextState, metadata)')) {
        failures.push(`${relative}: reference updateParams compatibility must stay in the reference/debug surface`);
      }
      if (!source.includes('getEarthTextureDebugState') || !source.includes('EMPTY_EARTH_TEXTURE_DEBUG_STATE')) {
        failures.push(`${relative}: Earth texture debug getter must stay guarded inside the selected debug surface`);
      }
      for (const token of [
        "audioEngineRuntimeMode === 'core-product' ? undefined : referenceAudioEngineDebug.getDrumVoiceAnalyser(voice)",
        "audioEngineRuntimeMode === 'core-product' ? null : referenceAudioEngineDebug.getDynamicsAnalyser(key)",
        'referenceDrumVoiceAnalyser: referenceRuntimeActive ? getSelectedDrumVoiceAnalyser : undefined',
        'referenceDynamicsAnalyser: referenceRuntimeActive ? getSelectedDynamicsAnalyser : undefined',
        'liveLeadMorphedParamsAvailable: referenceRuntimeActive',
        "liveWaveformTelemetryAvailable: referenceRuntimeActive || audioEngineRuntimeMode === 'core-product'",
        "textureDebugAvailable: referenceRuntimeActive || audioEngineRuntimeMode === 'core-product'",
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: reference/debug Web Audio getters must be hidden for core-product; missing ${token}`);
        }
      }
      if (!appearsBefore(source, "if (audioEngineRuntimeMode === 'core-product') return;", 'referenceAudioEngineDebug.updateParams(nextState, metadata)')) {
        failures.push(`${relative}: reference updateParams must no-op before touching reference runtime in core-product`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineDebugAnalyserBridge.ts') {
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: debug analyser bridge must remain a pass-through UI adapter, not a runtime selector`);
      }
      for (const requiredSnippet of [
        'drumVoiceAnalyser: referenceDrumVoiceAnalyser',
        'dynamicsAnalyser: referenceDynamicsAnalyser',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: debug analyser bridge must own page-facing analyser getter names`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineDebugRuntime.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineDebugSurface } from './useSelectedAudioEngineDebugSurface'",
        "import { useSelectedAudioEngineDebugAnalyserBridge } from './useSelectedAudioEngineDebugAnalyserBridge'",
        'useSelectedAudioEngineDebugSurface(audioEngineRuntimeMode)',
        'useSelectedAudioEngineDebugAnalyserBridge({',
        'referenceDrumVoiceAnalyser,',
        'referenceDynamicsAnalyser,',
        'selectedAudioEngineDebugAnalysers,',
        'getEarthTextureDebugState,',
        'updateSelectedReferenceParams,',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected debug runtime hook must compose debug surface and analyser bridge; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: selected debug runtime hook must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/audioEngineMediaSession.ts') {
      if (!appearsBefore(source, "if (audioEngineRuntimeMode === 'core-product') return;", 'referenceAudioEngineDebug.getMediaStream()')) {
        failures.push(`${relative}: MediaStream bridge must return before touching reference Web Audio in core-product`);
      }
    }

    if (relative === 'src/ui/usePresetEngineSync.ts') {
      for (const token of [
        'immediatelyAppliedAudioEngineStateRef',
        'skipNextPresetLoadEngineSyncRef',
        "updateEngine: audioEngineRuntimeMode !== 'core-product'",
        "resetCofDrift: audioEngineRuntimeMode !== 'core-product'",
        "if (audioEngineRuntimeMode === 'core-product') return;",
        'updateSelectedReferenceParams(nextState, metadata)',
        "reason: 'preset-load'",
        'triggerCritical: true',
        'resetSelectedCofDrift()',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: preset engine sync hook is missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useAudioEngineRuntimeNavigation.ts') {
      for (const token of [
        "from './useProductRuntimeNavigationCore'",
        'readProductRuntimeSwitchState()',
        'useProductRuntimeMode()',
        'useProductRuntimeNavigationCore({',
        'preloadProductRuntime: preloadSelectedAudioEngine',
        'stopProductRuntime: stopSelectedAudioEngine',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: legacy runtime navigation facade must delegate through product runtime navigation core; missing ${token}`);
        }
      }
      if (source.includes('coreSmokeModeAvailable') || source.includes("from '../audio/product/ProductAudioRuntimeSelection'")) {
        failures.push(`${relative}: legacy runtime navigation facade must not own runtime mode selection or core-smoke availability`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeNavigationCore.ts') {
      for (const token of [
        "from '../audio/product/ProductAudioRuntimeSelection'",
        'getProductRuntimeMode()',
        'getProductRuntimeModes()',
        'type ProductRuntimeSelectionMode',
        "from './productRuntimeUi'",
        'readProductRuntimeSwitchState',
        'useProductRuntimeMode',
        'shouldShowProductRuntimeSwitcher()',
        'shouldStartInAdvancedEditor()',
        'buildProductRuntimeSwitchUrl(mode, stateRef.current)',
        'preloadProductRuntime',
        'stopProductRuntime()',
        'window.location.assign',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime navigation core must own runtime selection/navigation behavior; missing ${token}`);
        }
      }
      if (source.includes('coreSmokeModeAvailable')) {
        failures.push(`${relative}: product runtime navigation core must return the product-owned runtime mode list, not a separate core-smoke availability flag`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeSession.ts') {
      for (const token of [
        "from './useAudioEngineRuntimeNavigation'",
        'readAudioEngineRuntimeSwitchState()',
        'decodeStateFromUrl(window.location.search)',
        'isMobileDevice() || window.innerWidth < 768',
        'useSelectedAudioEngineRuntimeMode()',
        'useAudioEngineRuntimeNavigation({',
        'audioEngineRuntimeMode,',
        'preloadSelectedAudioEngine,',
        'stateRef,',
        'stopSelectedAudioEngine,',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime session hook must own initial switch-state restore plus mode/navigation composition; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected runtime session hook must compose runtime selection/navigation helpers instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeSession.ts') {
      for (const token of [
        "import { useMemo } from 'react'",
        'resolveProductRuntimeModeInitialState',
        'useProductRuntimeModeSession',
        "from './useProductRuntimeModeSession'",
        "import { useProductRuntimePlaybackRuntime } from './useProductRuntimePlaybackRuntime'",
        "import { useProductRuntimeUi } from './useProductRuntimeUi'",
        'export function resolveProductRuntimeInitialState',
        'return resolveProductRuntimeModeInitialState(options)',
        'export function useProductRuntimeSession()',
        'return useProductRuntimeModeSession()',
        'export function useProductRuntimeShell(options: ProductRuntimeShellOptions)',
        'useProductRuntimePlaybackRuntime({',
        'useProductRuntimeUi({',
        'preloadProductRuntime: playbackRuntime.preloadProductRuntime',
        'stopProductRuntime: playbackRuntime.stopProductRuntime',
        '...playbackRuntime',
        '...runtimeUi',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime session facade must own App-facing runtime session/shell names and compose product runtime wrappers; missing ${token}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('useSelectedAudioEngineRuntimeSession') ||
        source.includes('useSelectedAudioEngineRuntimeShell')
      ) {
        failures.push(`${relative}: product runtime session facade must use product-named wrappers instead of touching implementations or selected shell/session directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeModeSession.ts') {
      for (const token of [
        "import { isMobileDevice } from '../platform'",
        'readProductRuntimeSwitchState',
        'useProductRuntimeMode',
        "from './useProductRuntimeNavigationCore'",
        'export function resolveProductRuntimeModeInitialState({',
        'decodeStateFromUrl(window.location.search)',
        'isMobileDevice() || window.innerWidth < 768',
        'export function useProductRuntimeModeSession()',
        'productRuntimeMode: useProductRuntimeMode()',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime mode session must own product-named initial state and mode selection; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('useSelectedAudioEngineRuntimeSession')) {
        failures.push(`${relative}: product runtime mode session must not touch runtime implementations or selected session compatibility hooks directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePlaybackRuntime.ts') {
      for (const token of [
        "import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter'",
        'type ProductRuntimePlaybackAdapterOptions = Parameters<typeof useProductRuntimePlaybackAdapter>[0]',
        'type ProductRuntimePlaybackRuntimeOptions = ProductRuntimePlaybackAdapterOptions',
        'export function useProductRuntimePlaybackRuntime({',
        'productRuntimeMode,',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime playback runtime must delegate through the product playback adapter; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime playback runtime must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeUi.ts') {
      for (const token of [
        "import { useMemo } from 'react'",
        "import type { GlobalRuntimeComparisonPanelProps } from './global/GlobalRuntimeComparisonPanel'",
        "import { useProductRuntimeNavigation } from './useProductRuntimeNavigation'",
        "import { useProductRuntimePerf } from './useProductRuntimePerf'",
        'type ProductRuntimeUiOptions = Parameters<typeof useProductRuntimeNavigation>[0]',
        'useProductRuntimeNavigation({',
        'productRuntimeMode,',
        'preloadProductRuntime,',
        'stateRef,',
        'stopProductRuntime,',
        'useProductRuntimePerf(productRuntimeMode, runtimeNavigation.showProductRuntimeSwitcher)',
        'const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({',
        'currentMode: productRuntimeMode',
        'modes: runtimeNavigation.productRuntimeModes',
        'cpuSummaries: perf.productRuntimeCpuSummaries',
        'visible: runtimeNavigation.showProductRuntimeSwitcher',
        'onModeChange: runtimeNavigation.handleProductRuntimeModeChange',
        '...runtimeNavigation',
        '...perf',
        'globalRuntimeComparison',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime UI must compose product-named navigation and perf wrappers; missing ${token}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes("from '../audio/product/") ||
        source.includes('useSelectedAudioEngineRuntimeUi')
      ) {
        failures.push(`${relative}: product runtime UI must use product wrappers instead of touching implementations or selected runtime UI directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeNavigation.ts') {
      for (const token of [
        "import { useProductRuntimeNavigationCore } from './useProductRuntimeNavigationCore'",
        'type ProductRuntimeNavigationCoreOptions = Parameters<typeof useProductRuntimeNavigationCore>[0]',
        'export function useProductRuntimeNavigation({',
        'useProductRuntimeNavigationCore({',
        'preloadProductRuntime,',
        'stopProductRuntime,',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime navigation must delegate through product runtime navigation core; missing ${token}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes("from '../audio/product/") ||
        source.includes('useSelectedAudioEngineRuntimeSessionNavigation')
      ) {
        failures.push(`${relative}: product runtime navigation must not touch runtime implementations or selected session compatibility directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePerf.ts') {
      for (const token of [
        "import { useProductRuntimePerfAdapter } from './useProductRuntimePerfAdapter'",
        'type ProductRuntimePerfMode = Parameters<typeof useProductRuntimePerfAdapter>[0]',
        'type ProductRuntimePerfVisible = Parameters<typeof useProductRuntimePerfAdapter>[1]',
        'export function useProductRuntimePerf(',
        'return useProductRuntimePerfAdapter(productRuntimeMode, showProductRuntimeSwitcher)',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime perf must delegate through the product perf adapter; missing ${token}`);
        }
      }
      if (source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime perf must not touch runtime implementation imports directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimePerfAdapter.ts') {
      for (const token of [
        "import { productEngine } from '../audio/product/ProductEngineProxy'",
        "import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime'",
        "from './productRuntimeUi'",
        'filterProductRuntimePerfMetrics',
        'readProductRuntimeCpuSummaries',
        'summarizeProductRuntimeCpu',
        'writeProductRuntimeCpuSummaries',
        'useDocumentVisibility',
        'const nextEnabled = enabled && documentVisible',
        'productEngine.setPerfMonitorEnabled(nextEnabled)',
        'productEngine.setPerfUpdateCallback(callback ? (data) => {',
        'callback(filterProductRuntimePerfMetrics(data));',
        'setPerfMonitorEnabled?.(nextEnabled)',
        'setPerfUpdateCallback?.(callback)',
        'setProductPerfMonitorEnabled',
        'setProductPerfUpdateCallback',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product perf adapter must own product/reference perf monitor routing; missing ${token}`);
        }
      }
      const perfAdapterType = source.match(/type ProductRuntimePerfAdapter = \{[\s\S]*?\};/)?.[0] ?? '';
      if (source.includes('productEngine.setTelemetryCallback')) {
        failures.push(`${relative}: product perf adapter must use Product perf callbacks, not full Product telemetry callbacks`);
      }
      for (const forbiddenSnippet of [
        'setSelectedPerfMonitorEnabled',
        'setSelectedPerfUpdateCallback',
      ]) {
        if (perfAdapterType.includes(forbiddenSnippet)) {
          failures.push(`${relative}: product perf adapter must expose product-named fields only; selected compatibility belongs in useSelectedAudioEnginePerf`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEnginePerf.ts') {
      for (const token of [
        "import { useProductRuntimePerfAdapter } from './useProductRuntimePerfAdapter'",
        'const perfAdapter = useProductRuntimePerfAdapter(audioEngineRuntimeMode, showAudioEngineSwitcher)',
        'setSelectedPerfMonitorEnabled: perfAdapter.setProductPerfMonitorEnabled',
        'setSelectedPerfUpdateCallback: perfAdapter.setProductPerfUpdateCallback',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected perf hook must delegate through product perf adapter; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected perf hook must not own product/reference perf monitor routing directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeUi.ts') {
      for (const token of [
        "import { useMemo, type MutableRefObject } from 'react'",
        "import type { GlobalRuntimeComparisonPanelProps } from './global/GlobalRuntimeComparisonPanel'",
        "import { useSelectedAudioEnginePerf } from './useSelectedAudioEnginePerf'",
        "import { useSelectedAudioEngineRuntimeSessionNavigation } from './useSelectedAudioEngineRuntimeSession'",
        'useSelectedAudioEngineRuntimeSessionNavigation({',
        'audioEngineRuntimeMode,',
        'preloadSelectedAudioEngine,',
        'stateRef,',
        'stopSelectedAudioEngine,',
        'useSelectedAudioEnginePerf(audioEngineRuntimeMode, runtimeNavigation.showAudioEngineSwitcher)',
        'const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({',
        'currentMode: audioEngineRuntimeMode',
        'modes: runtimeNavigation.audioEngineRuntimeModes',
        'cpuSummaries: perf.audioEngineCpuSummaries',
        'visible: runtimeNavigation.showAudioEngineSwitcher',
        'onModeChange: runtimeNavigation.handleAudioEngineRuntimeModeChange',
        '...runtimeNavigation',
        '...perf',
        'globalRuntimeComparison',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime UI hook must compose runtime navigation and perf monitoring; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime')) {
        failures.push(`${relative}: selected runtime UI hook must compose focused hooks instead of directly touching runtime implementations`);
      }
    }

    if (relative === 'src/ui/useAudioRecording.ts') {
      for (const token of [
        'recordingAvailable: boolean',
        'stemRecordingAvailable: boolean',
        "const recordingAvailable = audioEngineRuntimeMode !== 'core-product'",
        'const stemRecordingAvailable = recordingAvailable',
        'recordingAvailable,',
        'stemRecordingAvailable,',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: recording hook must own reference-only recording availability; missing ${token}`);
        }
      }
      for (const token of [
        "throw new Error('Recording is explicitly unavailable in core-product until a Product recording bridge exists')",
        "if (audioEngineRuntimeMode === 'core-product') return;",
        "if (audioEngineRuntimeMode === 'core-product') {",
        'setRecordingDuration(0);',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: recording hook must explicitly block Product Core recording paths; missing ${token}`);
        }
      }
      if (!appearsBefore(source, "if (audioEngineRuntimeMode === 'core-product') {", 'referenceAudioEngineDebug.getAudioContext()')) {
        failures.push(`${relative}: recording start must reject core-product before reading reference AudioContext`);
      }
      if (!appearsBefore(source, "if (audioEngineRuntimeMode === 'core-product') {", 'referenceAudioEngineDebug.getLimiterNode()')) {
        failures.push(`${relative}: recording start must reject core-product before reading reference limiter node`);
      }
      if (!source.includes('referenceAudioEngineDebug.getRecordableBusNodes()')) {
        failures.push(`${relative}: stem recording must remain an explicit reference runtime path until Product stem recording exists`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeCapabilities.ts') {
      for (const token of [
        "import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents'",
        'selectedRuntimeSupportsRangeKey: (key: string) => boolean',
        "audioEngineRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key)",
        "const active = audioEngineRuntimeMode === 'core-product' && uiMode === 'advanced'",
        'setSelectedVisualTelemetryActive(active)',
        'setSelectedVisualTelemetryActive(false)',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime capability hook must own Product Core range/visual-telemetry support decisions; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeCallbackRegistrations.ts') {
      for (const token of [
        "import { useSelectedAudioEngineLiveTriggerCallbacks } from './useSelectedAudioEngineLiveTriggerCallbacks'",
        "import { useSelectedAudioEngineVisualizerCallbacks } from './useSelectedAudioEngineVisualizerCallbacks'",
        'useSelectedAudioEngineVisualizerCallbacks({',
        'setSelectedDrumEvolveTriggerCallback,',
        'setSelectedDrumStepPositionCallback,',
        'setSelectedDrumTriggerCallback,',
        'setSelectedSynthEvolveTriggerCallback,',
        'setSelectedSynthStepPositionCallback,',
        'useSelectedAudioEngineLiveTriggerCallbacks({',
        'setSelectedLeadExpressionCallback,',
        'setSelectedGranularSHTriggerCallback,',
        'setSelectedPad2MorphTriggerCallback,',
        'stateRef,',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime callback registration composer must combine visualizer and live trigger callback hooks; missing ${token}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: selected runtime callback registration composer must compose selected runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeCallbackRegistrations.ts') {
      for (const token of [
        "from './useLiveTriggerUiCallbacks'",
        "from './useSelectedAudioEngineVisualizerCallbacks'",
        'export function useProductRuntimeCallbackRegistrations({',
        'setProductDrumStepPositionCallback,',
        'setProductSynthEvolveTriggerCallback,',
        'useSelectedAudioEngineVisualizerCallbacks({',
        'useLiveTriggerUiCallbacks({',
        'setLeadExpressionCallback: setProductLeadExpressionCallback',
        'setGranularSHTriggerCallback: setProductGranularSHTriggerCallback',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime callback registration surface must compose shared projection implementations; missing ${token}`);
        }
      }
      const productCallbackOptionsType = source.match(/type ProductRuntimeCallbackRegistrationsOptions =[\s\S]*?;\n/)?.[0] ?? '';
      if (/setSelected(Drum|Synth)\w+Callback\s*:/.test(productCallbackOptionsType)) {
        failures.push(`${relative}: product runtime callback registration options must expose product-named sequencer callbacks`);
      }
      if (
        source.includes('SelectedSequencerCallbackKey') ||
        source.includes('useProductRuntimeLiveTriggerCallbacks') ||
        source.includes('useProductRuntimeVisualizerCallbacks')
      ) {
        failures.push(`${relative}: product runtime callback registration surface must not restore retired projection wrappers`);
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEngineRuntimeCallbackRegistrations')
      ) {
        failures.push(`${relative}: product runtime callback registration surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeVisualizerCallbacks.ts') {
      for (const token of [
        "import { useSelectedAudioEngineVisualizerCallbacks } from './useSelectedAudioEngineVisualizerCallbacks'",
        'export type ProductRuntimeVisualizerCallbacksOptions = {',
        'setProductDrumEvolveTriggerCallback:',
        'setProductSynthStepPositionCallback:',
        'export function useProductRuntimeVisualizerCallbacks({',
        'setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback',
        'setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime visualizer callbacks must delegate through selected-runtime compatibility hook; missing ${token}`);
        }
      }
      if (
        source.includes('Parameters<typeof useSelectedAudioEngineVisualizerCallbacks>') ||
        source.includes('setSelectedDrumEvolveTriggerCallback: (callback') ||
        source.includes('setSelectedSynthStepPositionCallback: (callback')
      ) {
        failures.push(`${relative}: product runtime visualizer callback options must be product-owned and product-named`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime visualizer callbacks must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeLiveTriggerCallbacks.ts') {
      for (const token of [
        "useLiveTriggerUiCallbacks,",
        'import type { SliderState } from \'./state\'',
        'export type ProductRuntimeLiveTriggerCallbacksOptions = {',
        'setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void',
        'setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void',
        'export function useProductRuntimeLiveTriggerCallbacks({',
        'setLeadExpressionCallback: setProductLeadExpressionCallback',
        'setGranularSHTriggerCallback: setProductGranularSHTriggerCallback',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime live trigger callbacks must use the product-owned live trigger UI callback surface; missing ${token}`);
        }
      }
      const productLiveTriggerCallbackOptions = source.match(/type ProductRuntimeLiveTriggerCallbacksOptions =[\s\S]*?;\n/)?.[0] ?? '';
      if (/setSelected\w+Callback\s*:/.test(productLiveTriggerCallbackOptions)) {
        failures.push(`${relative}: product runtime live trigger callback options must expose product-named fields only`);
      }
      if (
        source.includes('SelectedRuntimeLiveTriggerCallbacksOptions') ||
        source.includes('useSelectedAudioEngineLiveTriggerCallbacks') ||
        source.includes('Parameters<typeof useSelectedAudioEngineLiveTriggerCallbacks>') ||
        source.includes('SelectedLiveTriggerCallbackKey')
      ) {
        failures.push(`${relative}: product runtime live trigger callback options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime live trigger callbacks must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineVisualizerCallbacks.ts') {
      for (const token of [
        'import {',
        'setVisualizerSequencerState',
        "if (uiMode !== 'advanced' || activeTab !== 'visualizer') return",
        'setSelectedDrumTriggerCallback((voice: string, velocity: number) =>',
        'setSelectedDrumStepPositionCallback((steps: number[], hitCounts: number[]) =>',
        'setSelectedSynthStepPositionCallback((steps: number[], hitCounts: number[]) =>',
        'setSelectedDrumEvolveTriggerCallback((laneIndex: number) =>',
        'setSelectedSynthEvolveTriggerCallback((laneIndex: number) =>',
        "setVisualizerSequencerState('drum', steps, hitCounts)",
        "setVisualizerSequencerState('synth', steps, hitCounts)",
        'setSelectedDrumTriggerCallback(null)',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: visualizer callback hook must own selected runtime visualizer callback registration; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineLiveTriggerCallbacks.ts') {
      for (const token of [
        "useLiveTriggerUiCallbacks,",
        'setLeadExpressionCallback: setSelectedLeadExpressionCallback',
        'setGranularSHTriggerCallback: setSelectedGranularSHTriggerCallback',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected live trigger callback hook must wrap the neutral live trigger UI callback surface; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useLiveTriggerUiCallbacks.ts') {
      for (const token of [
        'setLeadExpressionCallback((expression) =>',
        'setLeadMorphCallback((morph) =>',
        'setPadMorphTriggerCallback((morphPosition: number) =>',
        'setPad2MorphTriggerCallback((morphPosition: number) =>',
        'setLeadDistanceCallback((distance) =>',
        'setLeadDelayCallback((delay) =>',
        'setDrumMorphTriggerCallback((voice, morphPosition) =>',
        'setDrumParamSHTriggerCallback((_voice, key, position) =>',
        'setGranularSHTriggerCallback((positions: Record<string, number>) =>',
        'emitVisualizerPulses({',
        'setRuntimeFlashKeys(Object.keys(positions))',
        'removeRuntimeTriggerPositions(distanceKeys)',
        'stateRef.current.drumMorphSliderAnimate',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: neutral live trigger UI callback hook must own source/FX callback registration; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeCoordination.ts') {
      for (const requiredSnippet of [
        'useSelectedAudioEngineEvolveOverrideCallbacks,',
        "import { useSelectedAudioEngineRangeSync } from './useSelectedAudioEngineRangeSync'",
        "import { useSelectedAudioEngineRuntimeValueCleanup } from './useSelectedAudioEngineRuntimeValueCleanup'",
        "import { useSelectedAudioEngineRuntimeWalkSync } from './useSelectedAudioEngineRuntimeWalkSync'",
        'useSelectedAudioEngineRangeSync({',
        'drumMorphKeyToVoice,',
        'selectedRuntimeSupportsRangeKey,',
        'useSelectedAudioEngineRuntimeWalkSync({',
        'setSelectedRuntimeWalkPositionsCallback,',
        'shouldMirrorRuntimeWalkPositions,',
        'useSelectedAudioEngineEvolveOverrideCallbacks({',
        'setSelectedDrumEvolveOverridesChangedCallback,',
        'setSelectedSynthNoteRangeEvolvedCallback,',
        'useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);',
        'return evolvedOverrides;',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: selected runtime coordination hook must compose range sync, walk sync, evolve overrides, and stopped-value cleanup; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: selected runtime coordination hook must compose selected runtime hooks instead of touching runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeCoordination.ts') {
      for (const requiredSnippet of [
        'useProductRuntimeEvolveOverrideCallbacks,',
        "import { useProductRuntimeRangeSync } from './useProductRuntimeRangeSync'",
        "import { useProductRuntimeValueCleanup } from './useProductRuntimeValueCleanup'",
        "import { useProductRuntimeWalkSync } from './useProductRuntimeWalkSync'",
        'Parameters<typeof useProductRuntimeRangeSync>[0]',
        'Parameters<typeof useProductRuntimeWalkSync>[0]',
        'Parameters<typeof useProductRuntimeEvolveOverrideCallbacks>[0]',
        'playbackIsRunning: boolean',
        'export function useProductRuntimeCoordination(options: ProductRuntimeCoordinationOptions): ProductRuntimeCoordination',
        'useProductRuntimeRangeSync(options)',
        'useProductRuntimeWalkSync(options)',
        'useProductRuntimeEvolveOverrideCallbacks(options)',
        'useProductRuntimeValueCleanup(options.playbackIsRunning)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime coordination surface must compose product-named coordination wrappers; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('productEngine') ||
        source.includes('selectedProductRuntime') ||
        source.includes('referenceAudioEngineDebug') ||
        source.includes('useSelectedAudioEngineRuntimeCoordination')
      ) {
        failures.push(`${relative}: product runtime coordination surface must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeEvolveOverrideCallbacks.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineEvolveOverrideCallbacks } from './useSelectedAudioEngineEvolveOverrideCallbacks'",
        'export type ProductRuntimeEvolvedOverrideState = {',
        'export type ProductRuntimeEvolveOverrideCallbacksOptions = {',
        'setProductDrumEvolveOverridesChangedCallback:',
        'setProductSynthEvolveOverridesChangedCallback:',
        'setProductSynthNoteRangeEvolvedCallback:',
        'export function useProductRuntimeEvolveOverrideCallbacks({',
        'setSelectedDrumEvolveOverridesChangedCallback: setProductDrumEvolveOverridesChangedCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime evolve override callbacks must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime evolve override callbacks must not touch runtime implementations directly`);
      }
      if (
        source.includes('SelectedEvolveOverrideCallbacksOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineEvolveOverrideCallbacks>') ||
        source.includes('ReturnType<typeof useSelectedAudioEngineEvolveOverrideCallbacks>')
      ) {
        failures.push(`${relative}: product runtime evolve override callback options/state must not derive from selected-runtime types`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeRangeSync.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineRangeSync } from './useSelectedAudioEngineRangeSync'",
        "import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes'",
        'export type ProductRuntimeRangeSyncOptions = {',
        'productRuntimeSupportsRangeKey: (key: string) => boolean',
        'setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void',
        'setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void',
        'export function useProductRuntimeRangeSync({',
        'selectedRuntimeSupportsRangeKey: productRuntimeSupportsRangeKey',
        'setSelectedDrumMorphRange: setProductDrumMorphRange',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime range sync must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('SelectedRangeSyncOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineRangeSync>') ||
        source.includes('Omit<\n  SelectedRangeSyncOptions')
      ) {
        failures.push(`${relative}: product runtime range sync options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug')) {
        failures.push(`${relative}: product runtime range sync must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeWalkSync.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineRuntimeWalkSync } from './useSelectedAudioEngineRuntimeWalkSync'",
        "import type { SliderMode, SliderState } from './state'",
        'export type ProductRuntimeWalkSyncOptions = {',
        'productRuntimeSupportsRangeKey: (key: string) => boolean',
        'setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void',
        'setProductRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRuntimeWalkRange>>) => void',
        'export function useProductRuntimeWalkSync({',
        'selectedRuntimeSupportsRangeKey: productRuntimeSupportsRangeKey',
        'setSelectedRuntimeWalkPositionsCallback: setProductRuntimeWalkPositionsCallback',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime walk sync must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (
        source.includes('SelectedRuntimeWalkSyncOptions') ||
        source.includes('Parameters<typeof useSelectedAudioEngineRuntimeWalkSync>') ||
        source.includes('Omit<\n  SelectedRuntimeWalkSyncOptions')
      ) {
        failures.push(`${relative}: product runtime walk sync options must not derive from selected-runtime options`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime walk sync must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useProductRuntimeValueCleanup.ts') {
      for (const requiredSnippet of [
        "import { useSelectedAudioEngineRuntimeValueCleanup } from './useSelectedAudioEngineRuntimeValueCleanup'",
        'export function useProductRuntimeValueCleanup(playbackIsRunning: boolean): void',
        'useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: product runtime value cleanup must delegate through selected-runtime compatibility hook; missing ${requiredSnippet}`);
        }
      }
      if (source.includes('Parameters<typeof useSelectedAudioEngineRuntimeValueCleanup>')) {
        failures.push(`${relative}: product runtime value cleanup must use product-owned primitive playback state type`);
      }
      if (source.includes('productEngine') || source.includes('selectedProductRuntime') || source.includes('referenceAudioEngineDebug') || source.includes("from '../audio/product/")) {
        failures.push(`${relative}: product runtime value cleanup must not touch runtime implementations directly`);
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineEvolveOverrideCallbacks.ts') {
      for (const requiredSnippet of [
        'setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) =>',
        'setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) =>',
        'setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) =>',
        'normalizeEvolvedSubLanePatch(payload.subLaneStates)',
        'mergeEvolvedSubLanePatch(',
        'emitVisualizerPulse(',
        'mergeRuntimeValues({',
        'setDrumEvolvedOverrides({ laneIndex',
        'setSynthEvolvedOverrides({ laneIndex',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: evolved sequencer hook must own selected-runtime evolve callbacks, UI override state, visualizer pulses, and note-range runtime values`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeValueCleanup.ts') {
      for (const requiredSnippet of [
        'const STOPPED_RUNTIME_VALUE_KEYS = [',
        "'synthEuclid4NoteMax'",
        'const STOPPED_TRIGGER_POSITION_KEYS = [',
        "'pianoDistance'",
        'removeRuntimeValues(STOPPED_RUNTIME_VALUE_KEYS)',
        'removeRuntimeTriggerPositions(STOPPED_TRIGGER_POSITION_KEYS)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: runtime value cleanup hook must own stopped-playback runtime value and trigger cleanup; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRuntimeWalkSync.ts') {
      for (const requiredSnippet of [
        'setSelectedRuntimeWalkRanges(walkRanges)',
        'setSelectedRuntimeWalkPositionsCallback((positions) =>',
        'replaceRuntimeWalkPositions(positions)',
        "mode !== 'walk'",
        'selectedRuntimeSupportsRangeKey(key)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: runtime walk sync hook must own selected-runtime walk range sync and position mirroring; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineRangeSync.ts') {
      for (const requiredSnippet of [
        'setSelectedDrumMorphRange(voice, range)',
        'setSelectedDrumParamSHRange(key, range)',
        'setSelectedDualRanges(engineRanges)',
        'DRUM_MORPH_KEYS.has(key as keyof SliderState)',
        'selectedRuntimeSupportsRangeKey(key)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: range sync hook must own selected-runtime sample-hold range sync; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/runtimeWalkPositionSync.ts') {
      for (const requiredSnippet of [
        'replaceRuntimeWalkPositionSnapshot(nextPositions:',
        'clearRuntimeWalkPositions(keys:',
        'seedRuntimeWalkPosition(key: string',
        'resetRuntimeWalkPositionsForKeys(Object.keys(modes), nextPositions)',
        "if (mode === 'single') continue",
        'replaceRuntimeWalkPositions(nextPositions)',
        'removeRuntimeWalkPositions(keys)',
        'mergeRuntimeWalkPositions(positions)',
      ]) {
        if (!source.includes(requiredSnippet)) {
          failures.push(`${relative}: runtime walk position helper must own remove-plus-merge indicator resets; missing ${requiredSnippet}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineStateReconciliation.ts') {
      for (const token of [
        'FX_OWNERSHIP_BUSES',
        'setSelectedEngineStateChangeCallback((nextState) =>',
        'const fxOwnersChanged',
        'prev.isRunning === nextState.isRunning',
        'prev.harmonyState === nextState.harmonyState',
        'prev.cofCurrentStep === nextState.cofCurrentStep',
        'fxOwners: fxOwnersChanged ? nextState.fxOwners : prev.fxOwners',
        'setSelectedEngineStateChangeCallback(null)',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected engine-state reconciliation hook is missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineMacRecovery.ts') {
      for (const token of [
        'useSelectedAudioEngineDebugSurface(audioEngineRuntimeMode)',
        'useSelectedAudioEngineLifecycle(audioEngineRuntimeMode)',
        'getSelectedReferenceAudioContextState',
        'disposeSelectedReferenceEngine',
        'recoveryInFlightRef',
        'startSelectedAudioEngine(stateRef.current)',
        'resumeSelectedAudioEngine()',
        'macOS audio context recovery failed',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: macOS recovery hook must own reference audio-context recovery; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/useSelectedAudioEngineGlobalRuntimeProps.ts') {
      for (const token of [
        "import type { GlobalPageProps } from './global/GlobalPage'",
        'type GlobalRuntimeProps = Pick<',
        'runtimeComparison',
        'onResetCofDrift',
        'recordingProps: GlobalRecordingProps',
        'playbackTimerProps: GlobalPlaybackTimerProps',
        '...recordingProps',
        '...playbackTimerProps',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected Global runtime prop hook must compose runtime comparison, reset, recording, and timer props; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/global/GlobalPage.tsx') {
      for (const forbiddenToken of [
        "type AudioEngineMode = 'web-ts' | 'core-product' | 'core-smoke'",
        "['core-product', 'web-ts'",
        'coreSmokeModeAvailable',
        'audioEngineMode?:',
        'audioEngineModes?:',
        'audioEngineCpuSummaries?:',
        'showProductRuntimeSwitcher?:',
        'onAudioEngineModeChange?:',
        'onAudioEngineModeChange(mode)',
        'scene-runtime-switch-btn',
        "import { AudioEngineRuntimeSwitch } from '../AudioEngineRuntimeSwitch'",
        'audioEngineRuntimeModeLabel',
        'function formatCpuPercent(',
        '<AudioEngineRuntimeSwitch',
        "const recordingAvailable = audioEngineMode !== 'core-product'",
      ]) {
        if (source.includes(forbiddenToken)) {
          failures.push(`${relative}: GlobalPage must not own runtime mode selection/switch markup token ${forbiddenToken}`);
        }
      }
      for (const token of [
        "import { GlobalRuntimeComparisonPanel, type GlobalRuntimeComparisonPanelProps } from './GlobalRuntimeComparisonPanel'",
        'runtimeComparison?: GlobalRuntimeComparisonPanelProps',
        'runtimeComparison,',
        '<GlobalRuntimeComparisonPanel {...runtimeComparison} />',
        'recordingAvailable: boolean',
        'stemRecordingAvailable: boolean',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: GlobalPage runtime comparison must be delegated to GlobalRuntimeComparisonPanel; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/global/GlobalRuntimeComparisonPanel.tsx') {
      for (const token of [
        "import type { ProductRuntimeSelectionMode } from '../../audio/product/ProductAudioRuntimeSelection'",
        "import { ProductRuntimeSwitch } from '../ProductRuntimeSwitch'",
        "import { productRuntimeModeLabel } from '../productRuntimeUi'",
        'export type GlobalRuntimeComparisonPanelProps',
        'currentMode: ProductRuntimeSelectionMode',
        'modes: readonly ProductRuntimeSelectionMode[]',
        'visible: boolean',
        'onModeChange?: (mode: ProductRuntimeSelectionMode) => void',
        'if (!visible || !onModeChange) return null;',
        '<ProductRuntimeSwitch',
        'visible',
        'testId="global-product-runtime-switch"',
        'variant="scene"',
        'productRuntimeModeLabel(mode)',
        'formatCpuPercent(summary?.avgPercent)',
        'formatCpuPercent(summary?.peakPercent)',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: Global runtime comparison panel must own reference runtime switch and CPU comparison UI; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/AudioEngineRuntimeSwitch.tsx') {
      for (const token of [
        "import { RuntimeModeSwitch } from './RuntimeModeSwitch'",
        'type AudioEngineRuntimeSwitchProps = {',
        "testId = 'main-audio-engine-switch'",
        '<RuntimeModeSwitch',
        'currentMode={currentMode}',
        'onModeChange={onModeChange}',
        "variant?: 'main' | 'scene'",
        "labelVariant?: 'short' | 'reference'",
        'testId?: string',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: audio-engine runtime switch must stay a compatibility wrapper over RuntimeModeSwitch; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/RuntimeModeSwitch.tsx') {
      for (const token of [
        'ProductRuntimeSelectionMode',
        "from './productRuntimeUi'",
        'PRODUCT_RUNTIME_SWITCH_COLUMN_COUNT',
        'productRuntimeModeLabel(mode)',
        'productRuntimeModeTitle(mode)',
        "testId = 'main-product-runtime-switch'",
        'data-testid={testId}',
        'onModeChange(mode)',
        "variant?: 'main' | 'scene'",
        "labelVariant?: 'short' | 'reference'",
        'testId?: string',
        "className={sceneVariant ? 'scene-runtime-switch-buttons' : undefined}",
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: generic runtime switch component is missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/SelectedAudioEngineRuntimeSwitch.tsx') {
      for (const token of [
        "import { AudioEngineRuntimeSwitch } from './AudioEngineRuntimeSwitch'",
        'visible: boolean',
        'if (!visible) return null;',
        '<AudioEngineRuntimeSwitch',
        'currentMode={currentMode}',
        'modes={modes}',
        'onModeChange={onModeChange}',
        'floating={floating}',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: selected runtime switch wrapper must own App visibility and raw switch rendering; missing ${token}`);
        }
      }
    }

    if (relative === 'src/ui/ProductRuntimeSwitch.tsx') {
      for (const token of [
        "import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection'",
        "import { RuntimeModeSwitch } from './RuntimeModeSwitch'",
        'export type ProductRuntimeSwitchMode = ProductRuntimeSelectionMode',
        'visible: boolean',
        'if (!visible) return null;',
        '<RuntimeModeSwitch',
        'currentMode={currentMode}',
        'modes={modes}',
        'onModeChange={onModeChange}',
        'floating={floating}',
        'labelVariant="reference"',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${relative}: product runtime switch facade must own App-facing switch props and avoid selected-audio-engine compatibility delegation; missing ${token}`);
        }
      }
      if (source.includes('SelectedAudioEngineRuntimeSwitch') || source.includes('AudioEngineRuntimeMode')) {
        failures.push(`${relative}: product runtime switch must use product runtime types and RuntimeModeSwitch, not selected/audio-engine compatibility names`);
      }
    }

    if (relative === 'src/audio/product/ProductAudioEngineCompat.ts') {
      if (!source.includes('TODO(product-core-runtime-closure)')) {
        failures.push(`${relative}: deprecated legacy-named facade must carry a burn-down TODO`);
      }
      if (!source.includes("from './SelectedProductRuntime'")) {
        failures.push(`${relative}: deprecated legacy-named facade must only re-export SelectedProductRuntime`);
      }
      if (source.includes("import('../referenceAudioRuntime')") || source.includes('coreProductEngineHost')) {
        failures.push(`${relative}: deprecated legacy-named facade must not own runtime loading`);
      }
    }

    if (relative.startsWith('src/ui/') && !relative.includes('reference') && importsLegacyProductAudioCompat(source)) {
      failures.push(`${relative}: product UI hooks must import SelectedProductRuntime instead of ProductAudioEngineCompat`);
    }

    if (hasAny(source, legacyEngineImportPatterns) && !directLegacyEngineAllowlist.has(relative)) {
      failures.push(`${relative}: forbidden direct import of legacy src/audio/engine.ts`);
    } else if (hasAny(source, legacyEngineImportPatterns)) {
      warnings.push(`${relative}: legacy engine import allowed temporarily: ${directLegacyEngineAllowlist.get(relative)}`);
    }

    if (hasAny(source, legacyRuntimeImportPatterns) && !legacyRuntimeAllowlist.has(relative)) {
      failures.push(`${relative}: forbidden import of temporary src/audio/runtime.ts facade`);
    } else if (hasAny(source, legacyRuntimeImportPatterns)) {
      warnings.push(`${relative}: legacy runtime import allowed temporarily: ${legacyRuntimeAllowlist.get(relative)}`);
    }
  }
}

if (strict && warnings.length > 0) {
  failures.push(...warnings.map((warning) => `strict mode: ${warning}`));
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(warnings.join('\n'));
}
console.log('Product engine boundary checks passed');
