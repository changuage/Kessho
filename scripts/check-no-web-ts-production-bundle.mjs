import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distAssets = resolve(root, 'dist/assets');
const reportPath = resolve(root, 'docs/reports/kessho-product-no-web-ts-production-bundle-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const failures = [];

assert(existsSync(distAssets), 'dist/assets is missing; run npm run build first', failures);
assert(!existsSync(resolve(root, 'src/audio/runtime.ts')), 'temporary src/audio/runtime.ts facade must be deleted', failures);
assert(!existsSync(resolve(root, 'src/audio/engine.ts')), 'legacy web-ts engine must live under src/audio/reference/webTs/engine.ts, not the production audio root', failures);

const app = read('src/App.tsx');
const globalPage = read('src/ui/global/GlobalPage.tsx');
const audioRecording = read('src/ui/useAudioRecording.ts');
const selectedAudioEngineMacRecovery = read('src/ui/useSelectedAudioEngineMacRecovery.ts');
const selectedAudioEngineLiveTriggerCallbacks = read('src/ui/useSelectedAudioEngineLiveTriggerCallbacks.ts');
const selectedAudioEngineEvolveOverrideCallbacks = read('src/ui/useSelectedAudioEngineEvolveOverrideCallbacks.ts');
const selectedAudioEngineRuntimeValueCleanup = read('src/ui/useSelectedAudioEngineRuntimeValueCleanup.ts');
const selectedAudioEngineRuntimeWalkSync = read('src/ui/useSelectedAudioEngineRuntimeWalkSync.ts');
const selectedAudioEngineRangeSync = read('src/ui/useSelectedAudioEngineRangeSync.ts');
const runtimeWalkPositionSync = read('src/ui/runtimeWalkPositionSync.ts');
const selectedAudioEngineRuntimeCapabilities = read('src/ui/useSelectedAudioEngineRuntimeCapabilities.ts');
const selectedAudioEngineRuntimeTelemetry = read('src/ui/useSelectedAudioEngineRuntimeTelemetry.ts');
const selectedAudioEngineStateReconciliation = read('src/ui/useSelectedAudioEngineStateReconciliation.ts');
const selectedAudioEngineTransportDebug = read('src/ui/useSelectedAudioEngineTransportDebug.ts');
const selectedAudioEngineStateRuntime = read('src/ui/useSelectedAudioEngineStateRuntime.ts');
const selectedAudioEngineMediaSession = read('src/ui/useSelectedAudioEngineMediaSession.ts');
const selectedAudioEnginePlaybackControls = read('src/ui/useSelectedAudioEnginePlaybackControls.ts');
const selectedAudioEnginePlaybackRuntime = read('src/ui/useSelectedAudioEnginePlaybackRuntime.ts');
const selectedAudioEnginePlaybackTimer = read('src/ui/useSelectedAudioEnginePlaybackTimer.ts');
const capacitorAudioSessionDiagnostics = read('src/ui/useCapacitorAudioSessionDiagnostics.ts');
const capacitorMacAudioStatus = read('src/ui/useCapacitorMacAudioStatus.ts');
const platformRuntimeCapabilities = read('src/ui/usePlatformRuntimeCapabilities.ts');
const cloudPresetStoreBootstrap = read('src/ui/useCloudPresetStoreBootstrap.ts');
const presetLibraryLoader = read('src/ui/usePresetLibraryLoader.ts');
const savedPresetResolver = read('src/ui/useSavedPresetResolver.ts');
const autoStartPresetResolver = read('src/ui/useAutoStartPresetResolver.ts');
const presetPlatformMaintenance = read('src/ui/usePresetPlatformMaintenance.ts');
const presetSequencerRestore = read('src/ui/usePresetSequencerRestore.ts');
const synthPageSequencerBridge = read('src/ui/useSynthPageSequencerBridge.ts');
const drumPageSequencerBridge = read('src/ui/useDrumPageSequencerBridge.ts');
const selectedPageRuntimeBridges = read('src/ui/useSelectedAudioEnginePageRuntimeBridges.ts');
const selectedAudioEngineVisualizerCallbacks = read('src/ui/useSelectedAudioEngineVisualizerCallbacks.ts');
const audioEngineRuntimeUi = read('src/ui/audioEngineRuntimeUi.ts');
const productRuntimeUi = read('src/ui/productRuntimeUi.ts');
const audioEngineRuntimeSwitch = read('src/ui/AudioEngineRuntimeSwitch.tsx');
const productRuntimeSwitch = read('src/ui/ProductRuntimeSwitch.tsx');
const runtimeModeSwitch = read('src/ui/RuntimeModeSwitch.tsx');
const audioEngineRuntimeNavigation = read('src/ui/useAudioEngineRuntimeNavigation.ts');
const productRuntimeNavigationCore = read('src/ui/useProductRuntimeNavigationCore.ts');
const productEngineProxy = read('src/audio/product/ProductEngineProxy.ts');
const productAudioEngineCompat = read('src/audio/product/ProductAudioEngineCompat.ts');
const selectedProductRuntime = read('src/audio/product/SelectedProductRuntime.ts');
const referenceSelectedRuntime = read('src/audio/reference/ReferenceSelectedRuntime.ts');
const productAudioRuntimeSelection = read('src/audio/product/ProductAudioRuntimeSelection.ts');
const viteConfig = read('vite.config.ts');
const unavailableRuntime = read('src/audio/referenceAudioRuntime.unavailable.ts');
const runtimeModeBody = productAudioRuntimeSelection.slice(
  productAudioRuntimeSelection.indexOf('export function getProductRuntimeMode()'),
  productAudioRuntimeSelection.indexOf('export function getProductRuntimeModes()'),
);
assert(!app.includes("from './audio/runtime'"), 'App production shell must not statically import src/audio/runtime.ts', failures);
assert(!app.includes("from './audio/coreProductEngineHost'"), 'App production shell must not import coreProductEngineHost directly', failures);
assert(!app.includes("from './audio/referenceAudioRuntime'"), 'App production shell must not import the reference runtime wrapper directly', failures);
assert(
  app.includes("from './ui/useSelectedAudioEngineMacRecovery'") &&
    app.includes('useSelectedAudioEngineMacRecovery({') &&
    !app.includes('getSelectedReferenceAudioContextState') &&
    !app.includes('disposeSelectedReferenceEngine') &&
    selectedAudioEngineMacRecovery.includes('getSelectedReferenceAudioContextState') &&
    selectedAudioEngineMacRecovery.includes('disposeSelectedReferenceEngine') &&
    selectedAudioEngineMacRecovery.includes('startSelectedAudioEngine(stateRef.current)'),
  'App must delegate macOS reference audio-context recovery to the selected runtime recovery hook',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineRuntimeTelemetry'") &&
    app.includes('useSelectedAudioEngineRuntimeTelemetry({') &&
    app.includes('selectedRuntimeSupportsRangeKey') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCapabilities'") &&
    !app.includes("from './ui/useSelectedAudioEngineTelemetrySurface'") &&
    !app.includes('isCoreProductRangeKeySupported') &&
    !app.includes('coreProductSupportsRuntimeRangeKey') &&
    selectedAudioEngineRuntimeTelemetry.includes('useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode)') &&
    selectedAudioEngineRuntimeTelemetry.includes('useSelectedAudioEngineRuntimeCapabilities({') &&
    selectedAudioEngineRuntimeTelemetry.includes('setSelectedVisualTelemetryActive: telemetrySurface.setSelectedVisualTelemetryActive') &&
    selectedAudioEngineRuntimeCapabilities.includes("import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents'") &&
    selectedAudioEngineRuntimeCapabilities.includes("audioEngineRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key)") &&
    selectedAudioEngineRuntimeCapabilities.includes("const active = audioEngineRuntimeMode === 'core-product' && uiMode === 'advanced'"),
  'App must delegate Product Core range and visual telemetry support decisions to selected runtime telemetry',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineVisualizerCallbacks'") &&
    app.includes('useSelectedAudioEngineVisualizerCallbacks({') &&
    !app.includes('setVisualizerSequencerState') &&
    selectedAudioEngineVisualizerCallbacks.includes('setVisualizerSequencerState') &&
    selectedAudioEngineVisualizerCallbacks.includes("if (uiMode !== 'advanced' || activeTab !== 'visualizer') return") &&
    selectedAudioEngineVisualizerCallbacks.includes('setSelectedDrumTriggerCallback((voice: string, velocity: number) =>'),
  'App must delegate visualizer selected-runtime callback registration to the visualizer callback hook',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineLiveTriggerCallbacks'") &&
    app.includes('useSelectedAudioEngineLiveTriggerCallbacks({') &&
    !app.includes('setSelectedLeadExpressionCallback((expression) =>') &&
    !app.includes('setSelectedGranularSHTriggerCallback((positions: Record<string, number>) =>') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('setSelectedLeadExpressionCallback((expression) =>') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('setSelectedGranularSHTriggerCallback((positions: Record<string, number>) =>') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('emitVisualizerPulses({') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('setRuntimeFlashKeys(Object.keys(positions))'),
  'App must delegate live source/FX selected-runtime callback registration to the live trigger callback hook',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineEvolveOverrideCallbacks'") &&
    app.includes('useSelectedAudioEngineEvolveOverrideCallbacks({') &&
    app.includes('drumEvolvedOverrides') &&
    app.includes('synthEvolvedOverrides') &&
    !app.includes('setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    !app.includes('setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    !app.includes('setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) =>') &&
    !app.includes('drumEvolvedVersionRef') &&
    !app.includes('synthEvolvedVersionRef') &&
    !app.includes('normalizeEvolvedSubLanePatch') &&
    !app.includes('mergeEvolvedSubLanePatch') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) =>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('normalizeEvolvedSubLanePatch(payload.subLaneStates)') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('mergeEvolvedSubLanePatch(') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('emitVisualizerPulse(') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('mergeRuntimeValues({'),
  'App must delegate evolved sequencer selected-runtime callback registration to useSelectedAudioEngineEvolveOverrideCallbacks',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineRuntimeValueCleanup'") &&
    app.includes('useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);') &&
    !app.includes('removeRuntimeValues([') &&
    selectedAudioEngineRuntimeValueCleanup.includes('const STOPPED_RUNTIME_VALUE_KEYS = [') &&
    selectedAudioEngineRuntimeValueCleanup.includes("'synthEuclid4NoteMax'") &&
    selectedAudioEngineRuntimeValueCleanup.includes('const STOPPED_TRIGGER_POSITION_KEYS = [') &&
    selectedAudioEngineRuntimeValueCleanup.includes("'pianoDistance'") &&
    selectedAudioEngineRuntimeValueCleanup.includes('removeRuntimeValues(STOPPED_RUNTIME_VALUE_KEYS)') &&
    selectedAudioEngineRuntimeValueCleanup.includes('removeRuntimeTriggerPositions(STOPPED_TRIGGER_POSITION_KEYS)'),
  'App must delegate stopped-playback runtime value cleanup to useSelectedAudioEngineRuntimeValueCleanup',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineRuntimeWalkSync'") &&
    app.includes('useSelectedAudioEngineRuntimeWalkSync({') &&
    !app.includes('setSelectedRuntimeWalkRanges(walkRanges)') &&
    !app.includes('setSelectedRuntimeWalkPositionsCallback((positions) =>') &&
    selectedAudioEngineRuntimeWalkSync.includes('setSelectedRuntimeWalkRanges(walkRanges)') &&
    selectedAudioEngineRuntimeWalkSync.includes('setSelectedRuntimeWalkPositionsCallback((positions) =>') &&
    selectedAudioEngineRuntimeWalkSync.includes('replaceRuntimeWalkPositions(positions)') &&
    selectedAudioEngineRuntimeWalkSync.includes("mode !== 'walk'") &&
    selectedAudioEngineRuntimeWalkSync.includes('selectedRuntimeSupportsRangeKey(key)'),
  'App must delegate selected-runtime random-walk range sync and position mirroring to useSelectedAudioEngineRuntimeWalkSync',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineRangeSync'") &&
    app.includes('useSelectedAudioEngineRangeSync({') &&
    !app.includes('setSelectedDrumMorphRange(voice, range)') &&
    !app.includes('setSelectedDrumParamSHRange(key, range)') &&
    !app.includes('setSelectedDualRanges(engineRanges)') &&
    selectedAudioEngineRangeSync.includes('setSelectedDrumMorphRange(voice, range)') &&
    selectedAudioEngineRangeSync.includes('setSelectedDrumParamSHRange(key, range)') &&
    selectedAudioEngineRangeSync.includes('setSelectedDualRanges(engineRanges)') &&
    selectedAudioEngineRangeSync.includes('DRUM_MORPH_KEYS.has(key as keyof SliderState)') &&
    selectedAudioEngineRangeSync.includes('selectedRuntimeSupportsRangeKey(key)'),
  'App must delegate selected-runtime sample-hold range sync to useSelectedAudioEngineRangeSync',
  failures,
);
assert(
  app.includes("from './ui/runtimeWalkPositionSync'") &&
    !app.includes('mergeRuntimeWalkPositions') &&
    !app.includes('removeRuntimeWalkPositions') &&
    !app.includes('replaceRuntimeWalkPositions') &&
    app.includes('replaceRuntimeWalkPositionSnapshot(newWalkPositions)') &&
    app.includes('clearRuntimeWalkPositions([keyStr])') &&
    app.includes('seedRuntimeWalkPosition(keyStr)') &&
    app.includes('resetRuntimeWalkPositionsForKeys(') &&
    app.includes('resetRuntimeWalkPositionsForModes(morphResult.dualModes)') &&
    !app.includes('removeRuntimeWalkPositions(morphWalkKeys)') &&
    !app.includes('mergeRuntimeWalkPositions(newWalkPositions)') &&
    runtimeWalkPositionSync.includes('replaceRuntimeWalkPositionSnapshot(nextPositions:') &&
    runtimeWalkPositionSync.includes('clearRuntimeWalkPositions(keys:') &&
    runtimeWalkPositionSync.includes('seedRuntimeWalkPosition(key: string') &&
    runtimeWalkPositionSync.includes('resetRuntimeWalkPositionsForKeys(Object.keys(modes), nextPositions)') &&
    runtimeWalkPositionSync.includes("if (mode === 'single') continue"),
  'App must delegate granular/morph runtime walk indicator resets to runtimeWalkPositionSync helpers',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineStateRuntime'") &&
    app.includes('useSelectedAudioEngineStateRuntime({') &&
    !app.includes("from './ui/useSelectedAudioEngineStateReconciliation'") &&
    !app.includes("from './ui/useSelectedAudioEngineStateReconciliationSurface'") &&
    !app.includes("from './ui/useSelectedAudioEngineTransportDebug'") &&
    !app.includes('setSelectedEngineStateChangeCallback((nextState) =>') &&
    !app.includes('const fxOwnersChanged') &&
    selectedAudioEngineStateRuntime.includes('useSelectedAudioEngineStateReconciliationSurface(audioEngineRuntimeMode)') &&
    selectedAudioEngineStateRuntime.includes('useSelectedAudioEngineStateReconciliation({') &&
    selectedAudioEngineStateRuntime.includes('useSelectedAudioEngineTransportDebug({') &&
    selectedAudioEngineStateRuntime.includes('setSelectedEngineStateChangeCallback,') &&
    selectedAudioEngineStateReconciliation.includes('setSelectedEngineStateChangeCallback((nextState) =>') &&
    selectedAudioEngineStateReconciliation.includes('const fxOwnersChanged') &&
    selectedAudioEngineStateReconciliation.includes('fxOwners: fxOwnersChanged ? nextState.fxOwners : prev.fxOwners'),
  'App must delegate selected engine-state callback reconciliation to the state runtime hook',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEngineStateRuntime'") &&
    app.includes('useSelectedAudioEngineStateRuntime({') &&
    !app.includes('useVisibleInterval(updateTransportDebug') &&
    !app.includes('const updateTransportDebug = useCallback(') &&
    selectedAudioEngineStateRuntime.includes('getSelectedTransportDebugState,') &&
    selectedAudioEngineTransportDebug.includes('getSelectedTransportDebugState()') &&
    selectedAudioEngineTransportDebug.includes('Math.abs(current.effectiveBpm - transportDebug.effectiveBpm) < 0.05') &&
    selectedAudioEngineTransportDebug.includes('useVisibleInterval(updateTransportDebug, 1000'),
  'App must delegate selected transport debug polling to the state runtime hook',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEnginePlaybackRuntime'") &&
    app.includes('useSelectedAudioEnginePlaybackRuntime({') &&
    !app.includes("from './ui/useSelectedAudioEngineMediaSession'") &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackControls'") &&
    !app.includes("from './ui/useSelectedAudioEngineLifecycle'") &&
    !app.includes("from './ui/audioEngineMediaSession'") &&
    !app.includes('connectMediaSessionToWebAudio(audioEngineRuntimeMode)') &&
    selectedAudioEnginePlaybackRuntime.includes("import { useSelectedAudioEngineLifecycle } from './useSelectedAudioEngineLifecycle'") &&
    selectedAudioEnginePlaybackRuntime.includes("import { useSelectedAudioEngineMediaSession } from './useSelectedAudioEngineMediaSession'") &&
    selectedAudioEnginePlaybackRuntime.includes("import { useSelectedAudioEnginePlaybackControls } from './useSelectedAudioEnginePlaybackControls'") &&
    selectedAudioEnginePlaybackRuntime.includes('useSelectedAudioEngineLifecycle(audioEngineRuntimeMode)') &&
    selectedAudioEnginePlaybackRuntime.includes('useSelectedAudioEngineMediaSession({') &&
    selectedAudioEnginePlaybackRuntime.includes('useSelectedAudioEnginePlaybackControls({') &&
    selectedAudioEngineMediaSession.includes("from './audioEngineMediaSession'") &&
    selectedAudioEngineMediaSession.includes('connectMediaSessionToWebAudio(audioEngineRuntimeMode)'),
  'App must delegate selected lifecycle/media/playback composition to the playback runtime hook',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEnginePlaybackRuntime'") &&
    app.includes('useSelectedAudioEnginePlaybackRuntime({') &&
    app.includes('startSelectedPlayback({') &&
    app.includes('stopSelectedPlayback();') &&
    !app.includes('startCapacitorAudioSessionPlayback(') &&
    !app.includes('stopCapacitorAudioSessionPlayback();') &&
    !app.includes('await startSelectedAudioEngine(') &&
    !app.includes('setupSelectedIOSMediaSession();') &&
    !app.includes('connectSelectedMediaSessionToAudio();') &&
    !app.includes('stopSelectedIOSMediaSession();') &&
    selectedAudioEnginePlaybackControls.includes('const audioSessionDiagnosticEnabled =') &&
    selectedAudioEnginePlaybackControls.includes('await startSelectedAudioEngine(state);') &&
    selectedAudioEnginePlaybackControls.includes('await startCapacitorAudioSessionPlayback(') &&
    selectedAudioEnginePlaybackControls.includes('void stopCapacitorAudioSessionPlayback();') &&
    selectedAudioEnginePlaybackControls.includes('stopSelectedAudioEngine();'),
  'App must delegate selected playback start/stop orchestration to the playback runtime hook',
  failures,
);
assert(
  app.includes("from './ui/useCapacitorAudioSessionDiagnostics'") &&
    app.includes('useCapacitorAudioSessionDiagnostics({') &&
    app.includes('handleCapacitorAudioSessionRemoteCommand') &&
    !app.includes('addCapacitorAudioSessionRemoteCommandListener') &&
    !app.includes('getCapacitorAudioSessionStatus') &&
    !app.includes('setCapacitorAudioSessionNowPlaying') &&
    !app.includes('syncCapacitorAudioSessionState') &&
    !app.includes('capacitorAudioSessionRemoteCommandCleanupRef') &&
    capacitorAudioSessionDiagnostics.includes('addCapacitorAudioSessionRemoteCommandListener') &&
    capacitorAudioSessionDiagnostics.includes('remoteCommandHandlerRef.current(command)') &&
    capacitorAudioSessionDiagnostics.includes('setCapacitorAudioSessionNowPlaying({') &&
    capacitorAudioSessionDiagnostics.includes('syncCapacitorAudioSessionState({'),
  'App must delegate Capacitor audio-session diagnostics/listener/state sync to the diagnostics hook',
  failures,
);
assert(
  app.includes("from './ui/useCapacitorMacAudioStatus'") &&
    app.includes('useCapacitorMacAudioStatus({') &&
    app.includes('openMacSoundSettings') &&
    app.includes('macAirPlayPerformanceActive') &&
    !app.includes('getCapacitorMacAudioOutputStatus') &&
    !app.includes('openCapacitorMacSoundSettings') &&
    !app.includes('setCapacitorMacPlaybackState') &&
    !app.includes('readMacAirPlayPerformancePinned') &&
    !app.includes('writeMacAirPlayPerformancePinned') &&
    capacitorMacAudioStatus.includes('getCapacitorMacAudioOutputStatus') &&
    capacitorMacAudioStatus.includes('openCapacitorMacSoundSettings') &&
    capacitorMacAudioStatus.includes('setCapacitorMacPlaybackState') &&
    capacitorMacAudioStatus.includes('useVisibleInterval(refreshMacAudioOutputStatus, playbackIsRunning ? 1500 : 5000'),
  'App must delegate macOS native output polling/playback sync to the mac audio status hook',
  failures,
);
assert(
  app.includes("from './ui/usePlatformRuntimeCapabilities'") &&
    app.includes('usePlatformRuntimeCapabilities({') &&
    app.includes('shouldInitializeCloudPresetStore') &&
    !app.includes("from './native/capacitorAudioSession'") &&
    !app.includes("from './native/capacitorMacShell'") &&
    !app.includes('isCapacitorNativeShell()') &&
    !app.includes('isCapacitorMacShell()') &&
    !app.includes('const usesSupabaseStatePresetLibrary =') &&
    !app.includes('const usesCapacitorLocalPresetLibrary =') &&
    !app.includes('const usesCloudBackedStatePresetLibrary =') &&
    platformRuntimeCapabilities.includes('const nativeShellAvailable = isCapacitorNativeShell();') &&
    platformRuntimeCapabilities.includes('const macShellAvailable = isCapacitorMacShell();') &&
    platformRuntimeCapabilities.includes('const usesCloudBackedStatePresetLibrary = cloudPresetAllowed && !usesCapacitorLocalPresetLibrary;') &&
    platformRuntimeCapabilities.includes('const shouldInitializeCloudPresetStore = cloudPresetAllowed && (!nativeShellAvailable || macShellAvailable);'),
  'App must delegate native/mac shell classification and preset-library routing to the platform capabilities hook',
  failures,
);
assert(
  app.includes("from './ui/useCloudPresetStoreBootstrap'") &&
    app.includes('useCloudPresetStoreBootstrap<SavedPreset>({') &&
    app.includes('cloudPresetStoreReadyPromiseRef') &&
    app.includes('loadCloudAutoStartPreset') &&
    !app.includes('const cloudPresetStoreRef = useRef(') &&
    !app.includes('const cloudAutoStartStoreInitPromiseRef = useRef(') &&
    !app.includes('const cloudPresetStoreReadyRef = useRef(') &&
    !app.includes('const markCloudPresetStoreReady =') &&
    !app.includes('const ensureCloudAutoStartPresetStore = useCallback(') &&
    !app.includes('new SupabasePresetStore(supabaseClient)') &&
    !app.includes('new HybridPresetStore(local, cloud)') &&
    cloudPresetStoreBootstrap.includes("const { getSupabase } = await import('../cloud/supabase')") &&
    cloudPresetStoreBootstrap.includes('new SupabasePresetStore(supabaseClient)') &&
    cloudPresetStoreBootstrap.includes('new HybridPresetStore(local, cloud)') &&
    cloudPresetStoreBootstrap.includes('setPresetStore(hybrid)') &&
    cloudPresetStoreBootstrap.includes('cloudAutoStartStoreInitPromiseRef.current = (async () =>'),
  'App must delegate cloud preset store bootstrap/readiness to useCloudPresetStoreBootstrap',
  failures,
);
assert(
  app.includes("from './ui/usePresetLibraryLoader'") &&
    app.includes('usePresetLibraryLoader<SavedPreset>({') &&
    app.includes('loadCloudBackedPresets: loadActiveStatePresetStorePresets') &&
    app.includes('onCloudSharedPresetLoaded: applyCloudSharedPreset') &&
    !app.includes('const loadPresets = async () =>') &&
    !app.includes('fetchPresetById(cloudPresetId)') &&
    !app.includes("urlParams.get('cloud')") &&
    presetLibraryLoader.includes('cloudPresetStoreReadyPromiseRef.current') &&
    presetLibraryLoader.includes('return loadCloudBackedPresets();') &&
    presetLibraryLoader.includes('return loadCapacitorLocalPresets();') &&
    presetLibraryLoader.includes('return loadBundledPresets();') &&
    presetLibraryLoader.includes("const cloudPresetId = urlParams.get('cloud');") &&
    presetLibraryLoader.includes("void import('../cloud/supabase')") &&
    presetLibraryLoader.includes('fetchPresetById(cloudPresetId)') &&
    presetLibraryLoader.includes('onCloudSharedPresetLoaded('),
  'App must delegate preset library source selection and cloud share fetches to usePresetLibraryLoader',
  failures,
);
assert(
  app.includes("from './ui/useSavedPresetResolver'") &&
    app.includes('useSavedPresetResolver<SavedPreset>({') &&
    app.includes('loadPresetByName: loadActiveStatePresetStorePresetByName') &&
    app.includes('sortPresets: sortSavedStatePresetsByFreshness') &&
    !app.includes('const resolveSavedPresetForLoad = useCallback(') &&
    !app.includes('const resolveSavedPresetByName = useCallback(') &&
    !app.includes('loadActiveStatePresetStorePresetByName(preset.name)') &&
    !app.includes('loadActiveStatePresetStorePresetByName(presetName)') &&
    savedPresetResolver.includes('if (!preset.deferred) return preset;') &&
    savedPresetResolver.includes('const loadedPreset = await loadPresetByName(preset.name);') &&
    savedPresetResolver.includes('setSavedPresets(prev => sortPresets(prev.map(item => (') &&
    savedPresetResolver.includes('const preset = savedPresets.find(item => item.name === presetName);') &&
    savedPresetResolver.includes('if (!usesCloudBackedStatePresetLibrary) return null;') &&
    savedPresetResolver.includes('const loadedPreset = await loadPresetByName(presetName);'),
  'App must delegate deferred/cloud saved-preset resolution to useSavedPresetResolver',
  failures,
);
assert(
  app.includes("from './ui/useAutoStartPresetResolver'") &&
    app.includes('useAutoStartPresetResolver<SavedPreset>({') &&
    app.includes('setCloudAutoStartPreset') &&
    app.includes('resolveDefaultAutoStartPreset') &&
    app.includes('loadBundledPresetByName') &&
    !app.includes('const autoStartPresetRef = useRef(') &&
    !app.includes('const autoStartPresetSourceRef = useRef(') &&
    !app.includes('const resolveDefaultAutoStartPreset = useCallback(') &&
    !app.includes('const timedCloudPreset = await Promise.race') &&
    !app.includes('const deviceLocalPreset = savedPresets.find((preset) => preset.name === DEFAULT_AUTO_START_PRESET_NAME)') &&
    !app.includes('const bundledPreset = await loadBundledPresetByName(DEFAULT_AUTO_START_PRESET_NAME)') &&
    autoStartPresetResolver.includes('const autoStartPresetRef = useRef') &&
    autoStartPresetResolver.includes('const autoStartPresetSourceRef = useRef') &&
    autoStartPresetResolver.includes('const timedCloudPreset = await Promise.race') &&
    autoStartPresetResolver.includes('window.setTimeout(() => resolve(null), timeoutMs);') &&
    autoStartPresetResolver.includes('const deviceLocalPreset = savedPresets.find((preset) => preset.name === defaultAutoStartPresetName)') &&
    autoStartPresetResolver.includes('const bundledPreset = await loadBundledPresetByName(defaultAutoStartPresetName);') &&
    autoStartPresetResolver.includes('void loadCloudAutoStartPreset();'),
  'App must delegate default auto-start preset resolution to useAutoStartPresetResolver',
  failures,
);
assert(
  app.includes("from './ui/usePresetPlatformMaintenance'") &&
    app.includes('usePresetPlatformMaintenance({') &&
    app.includes('cloudPresetStoreReadyPromiseRef') &&
    !app.includes('kesshoPresetV2Migration') &&
    !app.includes('runPresetV2Migration') &&
    !app.includes('optimizeStringWavesV2') &&
    !app.includes('repairPresetChildGraphsV2') &&
    !app.includes('repairStringWavesGraphV2') &&
    !app.includes('verifyPresetV2Migration') &&
    !app.includes('loadFactoryPresets') &&
    presetPlatformMaintenance.includes('target.kesshoPresetV2Migration = {') &&
    presetPlatformMaintenance.includes("const { runPresetV2Migration } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { optimizeStringWavesV2 } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { repairPresetChildGraphsV2 } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { repairStringWavesGraphV2 } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { verifyPresetV2Migration } = await import('../presets')") &&
    presetPlatformMaintenance.includes('await cloudPresetStoreReadyPromiseRef.current;') &&
    presetPlatformMaintenance.includes("const { loadFactoryPresets } = await import('../presets')"),
  'App must delegate preset migration dev tools and factory seeding to usePresetPlatformMaintenance',
  failures,
);
assert(
  app.includes("from './ui/usePresetSequencerRestore'") &&
    app.includes('usePresetSequencerRestore({') &&
    !app.includes('setSelectedSequencerPresetHomeSnapshots();') &&
    !app.includes('function drumStepOverridesForEngineRestore(') &&
    !app.includes('function synthStepOverridesForEngineRestore(') &&
    presetSequencerRestore.includes('setSelectedSequencerPresetHomeSnapshots();') &&
    presetSequencerRestore.includes('drumStepOverridesForEngineRestore(') &&
    presetSequencerRestore.includes('synthStepOverridesForEngineRestore(') &&
    presetSequencerRestore.includes('normalizeSequencerEvolveConfigs(') &&
    presetSequencerRestore.includes('restoreSequencerSubLaneStates(preset.synthSubLaneStates, preset.synthStepOverrides)'),
  'App must delegate preset sequencer selected-runtime restore sync to usePresetSequencerRestore',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") &&
    app.includes('useSelectedAudioEnginePageRuntimeBridges({') &&
    app.includes('onSubLaneStatesChange={synthPageSequencerBridge.onSubLaneStatesChange}') &&
    app.includes('captureEvolveHome={synthPageSequencerBridge.captureEvolveHome}') &&
    !app.includes("from './ui/useSynthPageSequencerBridge'") &&
    !app.includes('useSynthPageSequencerBridge({') &&
    !app.includes('setSelectedSynthStepOverrides({') &&
    !app.includes('captureEvolveHome={(laneIdx) => captureSelectedSynthEuclidLaneHome(') &&
    selectedPageRuntimeBridges.includes('useSynthPageSequencerBridge(options)') &&
    selectedPageRuntimeBridges.includes('useDrumPageSequencerBridge(options)') &&
    selectedPageRuntimeBridges.includes('useDrumPageRuntimeBridge(options)') &&
    synthPageSequencerBridge.includes('setSelectedSynthStepOverrides(synthEngineStepOverrides(overrides))') &&
    synthPageSequencerBridge.includes('setSelectedSynthEuclidEvolveConfigs(configs)') &&
    synthPageSequencerBridge.includes('captureSelectedSynthEuclidLaneHome(laneIdx, synthSubLaneStatesRef.current?.[laneIdx]?.pitch)'),
  'App must delegate Synth page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") &&
    app.includes('useSelectedAudioEnginePageRuntimeBridges({') &&
    app.includes('onSubLaneStatesChange={drumPageSequencerBridge.onSubLaneStatesChange}') &&
    app.includes('captureEvolveHome={drumPageSequencerBridge.captureEvolveHome}') &&
    !app.includes("from './ui/useDrumPageSequencerBridge'") &&
    !app.includes('useDrumPageSequencerBridge({') &&
    !app.includes("from './ui/useDrumPageRuntimeBridge'") &&
    !app.includes('useDrumPageRuntimeBridge({') &&
    !app.includes('setSelectedDrumStepOverrides(overrides);') &&
    !app.includes('captureEvolveHome={(laneIdx) => captureSelectedDrumEuclidLaneHome(') &&
    drumPageSequencerBridge.includes('setSelectedDrumStepOverrides(overrides)') &&
    drumPageSequencerBridge.includes('setSelectedDrumEuclidEvolveConfigs(configs)') &&
    drumPageSequencerBridge.includes('captureSelectedDrumEuclidLaneHome('),
  'App must delegate Drum page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges',
  failures,
);
assert(
  app.includes("from './ui/useSelectedAudioEnginePlaybackTimer'") &&
    app.includes('useSelectedAudioEnginePlaybackTimer({') &&
    app.includes('resetPlaybackTimer();') &&
    !app.includes('playbackTimerTargetTimeRef') &&
    !app.includes('const updatePlaybackTimerCountdown = useCallback(') &&
    !app.includes('useVisibleInterval(updatePlaybackTimerCountdown') &&
    selectedAudioEnginePlaybackTimer.includes('const playbackTimerTargetTimeRef = useRef<number | null>(null)') &&
    selectedAudioEnginePlaybackTimer.includes('const updatePlaybackTimerCountdown = useCallback(() =>') &&
    selectedAudioEnginePlaybackTimer.includes('stopSelectedPlayback();') &&
    selectedAudioEnginePlaybackTimer.includes('useVisibleInterval(updatePlaybackTimerCountdown, 1000'),
  'App must delegate playback timer countdown and expiry stop handling to the playback timer hook',
  failures,
);
assert(
  runtimeModeBody.includes('if (!isDevRuntime()) return getProductionProductRuntimeMode();') &&
    productAudioRuntimeSelection.includes('getProductEngineRuntimeMode()') &&
    !productAudioRuntimeSelection.includes('AudioEngineRuntimeMode'),
  'ProductAudioRuntimeSelection must force core-product outside dev builds through ProductEngineProxy',
  failures,
);
assert(
  productAudioRuntimeSelection.includes("const PRODUCT_RUNTIME_MODES = ['core-product']"),
  'ProductAudioRuntimeSelection must expose only core-product in the normal product UI mode list',
  failures,
);
assert(
  productAudioRuntimeSelection.includes('return isReferenceRuntimeEnabled(params) ? REFERENCE_RUNTIME_MODES : PRODUCT_RUNTIME_MODES;'),
  'ProductAudioRuntimeSelection must keep web-ts/core-smoke behind explicit dev/reference contexts',
  failures,
);
assert(
  productAudioRuntimeSelection.includes("export const AUDIO_ENGINE_SWITCHER_PARAM = 'engineAB';"),
  'ProductAudioRuntimeSelection must own the reference runtime switcher query key',
  failures,
);
assert(
  app.includes("from './ui/useProductRuntimeSession'") &&
    productRuntimeNavigationCore.includes("from '../audio/product/ProductAudioRuntimeSelection'") &&
    audioEngineRuntimeNavigation.includes('useProductRuntimeNavigationCore({'),
  'App runtime-mode selection must route through product runtime navigation and keep selected audio-engine navigation as compatibility',
  failures,
);
assert(
  app.includes("from './ui/ProductRuntimeSwitch'") &&
    app.includes('<ProductRuntimeSwitch') &&
    app.includes('modes={productRuntimeModes}') &&
    globalPage.includes('recordingAvailable: boolean') &&
    globalPage.includes('stemRecordingAvailable: boolean') &&
    !globalPage.includes("['core-product', 'web-ts'") &&
    !globalPage.includes('coreSmokeModeAvailable') &&
    !globalPage.includes("const recordingAvailable = audioEngineMode !== 'core-product'") &&
    audioRecording.includes("const recordingAvailable = audioEngineRuntimeMode !== 'core-product'") &&
    audioRecording.includes('stemRecordingAvailable,') &&
    productRuntimeUi.includes('PRODUCT_RUNTIME_PARAM') &&
    productRuntimeUi.includes('PRODUCT_RUNTIME_SWITCHER_PARAM') &&
    audioEngineRuntimeUi.includes('buildAudioEngineSwitchUrl') &&
    audioEngineRuntimeSwitch.includes("import { RuntimeModeSwitch } from './RuntimeModeSwitch'") &&
    productRuntimeSwitch.includes("import { RuntimeModeSwitch } from './RuntimeModeSwitch'") &&
    runtimeModeSwitch.includes('PRODUCT_RUNTIME_SWITCH_COLUMN_COUNT') &&
    runtimeModeSwitch.includes('productRuntimeModeLabel(mode)') &&
    runtimeModeSwitch.includes('productRuntimeModeTitle(mode)') &&
    audioEngineRuntimeSwitch.includes("testId = 'main-audio-engine-switch'") &&
    runtimeModeSwitch.includes('data-testid={testId}') &&
    productRuntimeNavigationCore.includes('buildProductRuntimeSwitchUrl(mode, stateRef.current)'),
  'App runtime switch UI must stay behind ProductRuntimeSwitch/navigation modules that consume product-owned query constants',
  failures,
);
assert(!productEngineProxy.includes('referenceAudioRuntime'), 'ProductEngineProxy must not load the web-ts reference runtime', failures);
assert(
    !selectedProductRuntime.includes("import('../referenceAudioRuntime')") &&
    !selectedProductRuntime.includes('loadReferenceAudioRuntime') &&
    selectedProductRuntime.includes("from '../reference/ReferenceSelectedRuntime'") &&
    selectedProductRuntime.includes('invokeReferenceSelectedRuntimeMethod(runtimeMode, method, args)') &&
    referenceSelectedRuntime.includes("import('../referenceAudioRuntime')") &&
    referenceSelectedRuntime.includes('loadReferenceAudioRuntime()'),
  'SelectedProductRuntime must delegate reference runtime loading to ReferenceSelectedRuntime',
  failures,
);
assert(
  !selectedProductRuntime.includes('coreProductEngineHost') && !productAudioEngineCompat.includes('coreProductEngineHost'),
  'SelectedProductRuntime/ProductAudioEngineCompat must route core-product through ProductEnginePort instead of importing coreProductEngineHost',
  failures,
);
assert(
  selectedProductRuntime.includes('return productEngine.preload().then(() => productEngine);'),
  'SelectedProductRuntime must preload core-product through ProductEngineProxy',
  failures,
);
assert(
  productAudioEngineCompat.includes('TODO(product-core-runtime-closure)') &&
    productAudioEngineCompat.includes("from './SelectedProductRuntime'") &&
    !productAudioEngineCompat.includes("import('../referenceAudioRuntime')"),
  'ProductAudioEngineCompat must remain a deprecated alias, not a runtime owner',
  failures,
);
assert(unavailableRuntime.includes('web-ts reference runtime is unavailable in production builds'), 'Production reference runtime wrapper must fail closed', failures);
assert(viteConfig.includes('referenceAudioRuntime.unavailable.ts'), 'Vite production config must alias the reference runtime wrapper to the fail-closed stub', failures);

const forbiddenBundleMarkers = ['coreEngineHost', '__coreEngineHost', 'MediaStreamAudioDestinationNode', 'sendGranulatorRandomSequence'];

const forbiddenAssetNameMarkers = ['audio-engine', 'reference-web-ts-engine', 'coreEngineHost', 'runtime-'];

const scannedFiles = [];
if (existsSync(distAssets)) {
  for (const entry of readdirSync(distAssets)) {
    if (!entry.endsWith('.js')) continue;
    for (const marker of forbiddenAssetNameMarkers) {
      if (entry.includes(marker)) {
        failures.push(`dist/assets/${entry} uses forbidden web-ts asset name marker ${marker}`);
      }
    }
    const path = resolve(distAssets, entry);
    const source = readFileSync(path, 'utf8');
    scannedFiles.push(`dist/assets/${entry}`);
    for (const marker of forbiddenBundleMarkers) {
      if (source.includes(marker)) {
        failures.push(`dist/assets/${entry} contains forbidden web-ts marker ${marker}`);
      }
    }
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  scannedFiles,
  forbiddenBundleMarkers,
  forbiddenAssetNameMarkers,
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`No web-ts production bundle markers found (${scannedFiles.length} JS assets scanned)`);
