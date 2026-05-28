import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function methodBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex < 0) return '';
  const openIndex = source.indexOf('{', signatureIndex);
  if (openIndex < 0) return '';
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return '';
}

const host = read('src/audio/coreProductEngineHost.ts');
const packageJson = JSON.parse(read('package.json'));
const hostAssetRegistrar = read('src/audio/product/host/CoreProductAssetRegistrar.ts');
const fallbackDiagnostics = read('src/audio/CoreProductFallbackDiagnostics.ts');
const hostSequencerAdapter = read('src/audio/CoreProductHostSequencerAdapter.ts');
const hostSequencerEvolveConfig = read('src/audio/CoreProductHostSequencerEvolveConfig.ts');
const hostSequencerEvolve = read('src/audio/CoreProductHostSequencerEvolve.ts');
const hostSequencerSubLaneEvolve = read('src/audio/CoreProductHostSequencerSubLaneEvolve.ts');
const hostSequencerSwing = read('src/audio/CoreProductHostSequencerSwing.ts');
const hostSequencerHome = read('src/audio/CoreProductHostSequencerHome.ts');
const hostSequencerRangePayload = read('src/audio/CoreProductHostSequencerRangePayload.ts');
const hostSynthPitch = read('src/audio/CoreProductHostSynthPitch.ts');
const hostSynthNoteRangeEvolve = read('src/audio/CoreProductHostSynthNoteRangeEvolve.ts');
const hostSequencerUiState = read('src/audio/CoreProductHostSequencerUiState.ts');
const hostSequencerVisuals = read('src/audio/CoreProductHostSequencerVisuals.ts');
const hostRuntimeGuards = read('src/audio/CoreProductHostRuntimeGuards.ts');
const hostMidi = read('src/audio/CoreProductHostMidi.ts');
const hostDiagnostics = read('src/audio/product/host/CoreProductHostDiagnostics.ts');
const hostEvolveOverrideCallbackPortBridge = read('src/audio/product/host/CoreProductEvolveOverrideCallbackPortBridge.ts');
const hostJourneyMorphPortBridge = read('src/audio/product/host/CoreProductJourneyMorphPortBridge.ts');
const hostPatchClassifier = read('src/audio/product/host/CoreProductPatchClassifier.ts');
const hostLeadPresetDataLoader = read('src/audio/product/host/CoreProductLeadPresetDataLoader.ts');
const hostModulationRangeBridge = read('src/audio/product/host/CoreProductModulationRangeBridge.ts');
const hostModulationRangePortBridge = read('src/audio/product/host/CoreProductModulationRangePortBridge.ts');
const hostLiveTriggerCallbackBridge = read('src/audio/product/host/CoreProductLiveTriggerCallbackBridge.ts');
const hostSnapshotCoordinator = read('src/audio/product/host/CoreProductSnapshotCoordinator.ts');
const hostTelemetryAdapter = read('src/audio/product/host/CoreProductTelemetryAdapter.ts');
const hostRuntimeCommandPortBridge = read('src/audio/product/host/CoreProductRuntimeCommandPortBridge.ts');
const hostRuntimeHostPort = read('src/audio/product/host/CoreProductRuntimeHostPort.ts');
const hostRuntimeLifecyclePortBridge = read('src/audio/product/host/CoreProductRuntimeLifecyclePortBridge.ts');
const hostRuntimeReadPortBridge = read('src/audio/product/host/CoreProductRuntimeReadPortBridge.ts');
const hostRuntimeTelemetryPortBridge = read('src/audio/product/host/CoreProductRuntimeTelemetryPortBridge.ts');
const hostSequencerUiAdapter = read('src/audio/product/host/CoreProductSequencerUiAdapter.ts');
const hostSequencerCallbackPortBridge = read('src/audio/product/host/CoreProductSequencerCallbackPortBridge.ts');
const hostSequencerUiPatchBridge = read('src/audio/product/host/CoreProductSequencerUiPatchBridge.ts');
const hostInvoker = read('src/audio/product/host/CoreProductHostInvoker.ts');
const runtimeAdapter = read('src/audio/CoreProductRuntimeAdapter.ts');
const runtime = read('src/audio/coreProductRuntime.ts');
const referenceRuntime = read('src/audio/referenceAudioRuntime.ts');
const productAudioRuntimeSelection = read('src/audio/product/ProductAudioRuntimeSelection.ts');
const productEnginePort = read('src/audio/product/ProductEnginePort.ts');
const productRuntimeCapabilityReport = read('src/audio/product/ProductRuntimeCapabilityReport.ts');
const webProductEngine = read('src/audio/product/WebProductEngine.ts');
const app = read('src/App.tsx');
const lazySequencerTransport = read('src/ui/useLazySequencerTransport.ts');
const presetRestoreRuntimeSurface = read('src/ui/usePresetRestoreRuntimeSurface.ts');
const presetSequencerRestore = read('src/ui/usePresetSequencerRestore.ts');
const synthPageSequencerBridge = read('src/ui/useSynthPageSequencerBridge.ts');
const drumPageSequencerBridge = read('src/ui/useDrumPageSequencerBridge.ts');
const selectedPageRuntimeBridges = read('src/ui/useSelectedAudioEnginePageRuntimeBridges.ts');
const productRuntimePageSurface = read('src/ui/useProductRuntimePageSurface.ts');
const productRuntimePageBridgeOptions = read('src/ui/useProductRuntimePageBridgeOptions.ts');
const productRuntimePageTelemetryProps = read('src/ui/useProductRuntimePageTelemetryProps.ts');
const productRuntimePageSequencerProps = read('src/ui/useProductRuntimePageSequencerProps.ts');
const productRuntimePageControlProps = read('src/ui/useProductRuntimePageControlProps.ts');
const selectedPageRuntimeSurface = read('src/ui/useSelectedAudioEnginePageRuntimeSurface.ts');
const selectedPageRuntimeBridgeOptions = read('src/ui/useSelectedAudioEnginePageRuntimeBridgeOptions.ts');
const selectedPageTelemetryRuntimeProps = read('src/ui/useSelectedAudioEnginePageTelemetryRuntimeProps.ts');
const selectedPageSequencerRuntimeProps = read('src/ui/useSelectedAudioEnginePageSequencerRuntimeProps.ts');
const selectedPageControlRuntimeProps = read('src/ui/useSelectedAudioEnginePageControlRuntimeProps.ts');
const audioEngineMediaSession = read('src/ui/audioEngineMediaSession.ts');
const selectedAudioEngineMediaSession = read('src/ui/useSelectedAudioEngineMediaSession.ts');
const selectedAudioEnginePlaybackControls = read('src/ui/useSelectedAudioEnginePlaybackControls.ts');
const selectedAudioEnginePlaybackRuntime = read('src/ui/useSelectedAudioEnginePlaybackRuntime.ts');
const selectedAudioEngineRuntimeShell = read('src/ui/useSelectedAudioEngineRuntimeShell.ts');
const productRuntimeSession = read('src/ui/useProductRuntimeSession.ts');
const productRuntimePlaybackRuntime = read('src/ui/useProductRuntimePlaybackRuntime.ts');
const productRuntimePlaybackAdapter = read('src/ui/useProductRuntimePlaybackAdapter.ts');
const productRuntimeUi = read('src/ui/useProductRuntimeUi.ts');
const selectedAudioEnginePlaybackSurface = read('src/ui/useSelectedAudioEnginePlaybackSurface.ts');
const journeyMorphRuntimeSurface = read('src/ui/useJourneyMorphRuntimeSurface.ts');
const selectedAudioEngineStartAction = read('src/ui/useSelectedAudioEngineStartAction.ts');
const selectedAudioEnginePlaybackStartState = read('src/ui/useSelectedAudioEnginePlaybackStartState.ts');
const selectedAudioEngineJourneyPlaybackAction = read('src/ui/useSelectedAudioEngineJourneyPlaybackAction.ts');
const selectedAudioEngineStopAction = read('src/ui/useSelectedAudioEngineStopAction.ts');
const selectedAudioEnginePresetLoadFade = read('src/ui/useSelectedAudioEnginePresetLoadFade.ts');
const selectedAudioEnginePlatformRuntimeSurface = read('src/ui/useSelectedAudioEnginePlatformRuntimeSurface.ts');
const selectedAudioEngineCapacitorAudioSession = read('src/ui/useSelectedAudioEngineCapacitorAudioSession.ts');
const selectedAudioEngineRemoteCommandPlayback = read('src/ui/useSelectedAudioEngineRemoteCommandPlayback.ts');
const selectedAudioEngineDebugSurface = read('src/ui/useSelectedAudioEngineDebugSurface.ts');
const selectedAudioEngineDebugAnalyserBridge = read('src/ui/useSelectedAudioEngineDebugAnalyserBridge.ts');
const selectedAudioEngineDebugRuntime = read('src/ui/useSelectedAudioEngineDebugRuntime.ts');
const productRuntimeSurfaces = read('src/ui/useProductRuntimeSurfaces.ts');
const selectedAudioEngineRuntimeSurfaces = read('src/ui/useSelectedAudioEngineRuntimeSurfaces.ts');
const productRuntimeLifecycleSurface = read('src/ui/useProductRuntimeLifecycleSurface.ts');
const productRuntimeRecordingRuntime = read('src/ui/useProductRuntimeRecordingRuntime.ts');
const productRuntimeTelemetry = read('src/ui/useProductRuntimeTelemetry.ts');
const selectedRuntimeCapabilities = read('src/ui/useSelectedAudioEngineRuntimeCapabilities.ts');
const selectedRuntimeTelemetry = read('src/ui/useSelectedAudioEngineRuntimeTelemetry.ts');
const selectedEvolveOverrideCallbacks = read('src/ui/useSelectedAudioEngineEvolveOverrideCallbacks.ts');
const selectedAudioEngineRecordingRuntime = read('src/ui/useSelectedAudioEngineRecordingRuntime.ts');
const audioRecordingHook = read('src/ui/useAudioRecording.ts');
const events = read('src/audio/coreProductEvents.ts');
const snapshot = read('src/audio/coreProductSnapshot.ts');
const snapshotTypes = read('src/audio/coreProductSnapshotTypes.ts');
const generatedParams = read('src/audio/generated/kesshoProductParams.ts');
const sequencerHold = read('src/audio/coreProductSequencerHold.ts');
const arrangementScheduler = read('src/audio/coreProductArrangementScheduler.ts');
const snapshotEncoder = read('src/audio/coreProductSnapshotEncoder.ts');
const productLeadPatch = read('src/audio/CoreProductLeadPatch.ts');
const productPadPatch = read('src/audio/CoreProductPadPatch.ts');
const productDrumPatch = read('src/audio/CoreProductDrumPatch.ts');
const productPresetIds = read('src/audio/CoreProductPresetIds.ts');
const telemetryTypes = read('src/audio/coreProductTelemetry.ts');
const drumSynth = read('src/audio/drumSynth.ts');
const webEngine = read('src/audio/reference/webTs/engine.ts');
const coreEngineHost = read('src/audio/coreEngineHost.ts');
const euclideanPatterns = read('src/audio/euclideanPatterns.ts');
const sequencerClockDivisions = read('src/audio/sequencerClockDivisions.ts');
const sequencerLaneDirection = read('src/audio/sequencerLaneDirection.ts');
const sequencerPitchBinding = read('src/audio/sequencerPitchBinding.ts');
const sequencerPitchSettings = read('src/audio/sequencerPitchSettings.ts');
const sequencerSwing = read('src/audio/sequencerSwing.ts');
const drumPitchSequencer = read('src/ui/sequencer/drumPitchSequencer.ts');
const seqEvolveCore = read('src/audio/seqEvolveCore.ts');
const drumSeqEvolve = read('src/audio/drumSeqEvolve.ts');
const synthSeqEvolve = read('src/audio/synthSeqEvolve.ts');
const synthPage = read('src/ui/synth/SynthPage.tsx');
const drumPage = read('src/ui/drums/DrumPage.tsx');
const drumEnvelopeVisualizer = read('src/ui/drums/EnvelopeVisualizer.tsx');
const synthPresetManager = read('src/ui/synth/SynthPresetManager.tsx');
const sequencePresetLane = read('src/ui/sequencer/sequencePresetLane.ts');
const stepOverrideSerialization = read('src/ui/sequencer/stepOverrideSerialization.ts');
const engineStepOverrides = read('src/ui/sequencer/engineStepOverrides.ts');
const useEuclideanSequencer = read('src/ui/sequencer/useEuclideanSequencer.ts');
const euclideanPatternBank = read('src/presets/euclideanPatternBank.ts');
const presetSharedMode = read('src/presets/sharedMode.ts');
const sequencerUiParity = read('scripts/check-kessho-product-sequencer-ui-parity.mjs');
const sequencerEvolveRegression = read('src/audio/coreProductSequencerEvolveRegression.test.ts');
const graphSmokeCases = read('scripts/lib/kesshoProductWebGraphSmokeCases.mjs');
const graphCaptureSmoke = read('scripts/check-kessho-product-web-graph-capture-smoke.mjs');
const sonicParity = read('scripts/check-web-core-sonic-parity.mjs');
const padRandomize = read('src/audio/padRandomize.ts');
const filterLfoViz = read('src/ui/synth/FilterLfoViz.tsx');
const assets = `${read('src/audio/coreProductAssets.ts')}\n${read('src/audio/coreProductAssetManifest.json')}`;
const generatedSchema = read('src/audio/generated/kesshoProductSchema.ts');
const worklet = read('public/worklets/kessho-core-product.worklet.js');
const manifest = read('scripts/kessho-core-build-manifest.mjs');
const productRatchetEngine = read('cpp/KesshoCore/src/product/sequencer/RatchetEngine.cpp');
const productSequencerClock = read('cpp/KesshoCore/src/product/sequencer/SequencerClock.cpp');
const productSequencerEventBuffer = read('cpp/KesshoCore/src/product/sequencer/SequencerEventBuffer.cpp');
const productMath = read('cpp/KesshoCore/src/product/ProductMath.h');
const productSequencerVoiceRouting = read('cpp/KesshoCore/src/product/ProductSequencerVoiceRouting.h');
const productSequencerState = read('cpp/KesshoCore/src/product/ProductSequencerState.h');
const productEvents = read('cpp/KesshoCore/src/product/KesshoProductEvents.cpp');
const productSnapshotCpp = read('cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp');
const productSynthSequencer = read('cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp');
const productPresetBridge = `${read('cpp/KesshoCore/src/product/ProductPresetBridge.h')}\n${read('cpp/KesshoCore/src/product/ProductSourcePresetPatch.h')}`;
const productSourcePresetBridge = read('cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp');
const productSourceModuleTrigger = read('cpp/KesshoCore/src/product/sources/SourceModuleTrigger.cpp');
const productSourceVoiceAllocator = read('cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp');
const productApi = read('cpp/KesshoCore/src/product/KesshoProductApi.cpp');
const productTelemetryHeader = read('cpp/KesshoCore/include/KesshoCore/KesshoProductTelemetry.h');
const productTypesHeader = read('cpp/KesshoCore/include/KesshoCore/KesshoProductTypes.h');
const productSequencerTests = read('cpp/KesshoCore/tests/ProductSequencerTests.cpp');
const hostSurface = `${host}\n${hostSequencerAdapter}\n${hostSequencerEvolveConfig}\n${hostSequencerHome}\n${hostSequencerRangePayload}\n${hostSynthPitch}\n${hostSequencerUiState}\n${hostRuntimeGuards}\n${hostMidi}\n${hostAssetRegistrar}\n${hostDiagnostics}\n${hostEvolveOverrideCallbackPortBridge}\n${hostJourneyMorphPortBridge}\n${hostPatchClassifier}\n${hostLeadPresetDataLoader}\n${hostModulationRangeBridge}\n${hostModulationRangePortBridge}\n${hostLiveTriggerCallbackBridge}\n${hostSnapshotCoordinator}\n${hostTelemetryAdapter}\n${hostRuntimeCommandPortBridge}\n${hostRuntimeHostPort}\n${hostRuntimeLifecyclePortBridge}\n${hostRuntimeReadPortBridge}\n${hostRuntimeTelemetryPortBridge}\n${hostSequencerUiAdapter}\n${hostSequencerCallbackPortBridge}`;

assert(
  !existsSync(resolve(root, 'src/ui/useSelectedAudioEngineSurface.ts')),
  'Broad selected audio engine surface must remain removed; use focused selected runtime surfaces',
);
const snapshotSurface = `${snapshotTypes}\n${snapshot}\n${snapshotEncoder}\n${productLeadPatch}\n${productPadPatch}\n${productDrumPatch}`;

const lineCount = (source) => source.split('\n').length;
assert(lineCount(host) <= 1570, `coreProductEngineHost.ts exceeds cleanup size cap (${lineCount(host)} lines)`);
assert(lineCount(hostAssetRegistrar) <= 220, `CoreProductAssetRegistrar.ts exceeds cleanup size cap (${lineCount(hostAssetRegistrar)} lines)`);
assert(lineCount(hostSynthPitch) <= 80, `CoreProductHostSynthPitch.ts exceeds cleanup size cap (${lineCount(hostSynthPitch)} lines)`);
assert(lineCount(hostSequencerAdapter) <= 320, `CoreProductHostSequencerAdapter.ts exceeds cleanup size cap (${lineCount(hostSequencerAdapter)} lines)`);
assert(lineCount(hostSequencerEvolveConfig) <= 80, `CoreProductHostSequencerEvolveConfig.ts exceeds cleanup size cap (${lineCount(hostSequencerEvolveConfig)} lines)`);
assert(lineCount(hostSequencerEvolve) <= 100, `CoreProductHostSequencerEvolve.ts exceeds cleanup size cap (${lineCount(hostSequencerEvolve)} lines)`);
assert(lineCount(hostSequencerSubLaneEvolve) <= 120, `CoreProductHostSequencerSubLaneEvolve.ts exceeds cleanup size cap (${lineCount(hostSequencerSubLaneEvolve)} lines)`);
assert(lineCount(hostSequencerSwing) <= 80, `CoreProductHostSequencerSwing.ts exceeds cleanup size cap (${lineCount(hostSequencerSwing)} lines)`);
assert(lineCount(hostSequencerHome) <= 180, `CoreProductHostSequencerHome.ts exceeds cleanup size cap (${lineCount(hostSequencerHome)} lines)`);
assert(lineCount(hostSequencerRangePayload) <= 100, `CoreProductHostSequencerRangePayload.ts exceeds cleanup size cap (${lineCount(hostSequencerRangePayload)} lines)`);
assert(lineCount(hostSequencerUiState) <= 220, `CoreProductHostSequencerUiState.ts exceeds cleanup size cap (${lineCount(hostSequencerUiState)} lines)`);
assert(lineCount(hostSequencerVisuals) <= 180, `CoreProductHostSequencerVisuals.ts exceeds cleanup size cap (${lineCount(hostSequencerVisuals)} lines)`);
assert(lineCount(hostRuntimeGuards) <= 180, `CoreProductHostRuntimeGuards.ts exceeds cleanup size cap (${lineCount(hostRuntimeGuards)} lines)`);
assert(lineCount(hostDiagnostics) <= 120, `CoreProductHostDiagnostics.ts exceeds cleanup size cap (${lineCount(hostDiagnostics)} lines)`);
assert(lineCount(hostEvolveOverrideCallbackPortBridge) <= 60, `CoreProductEvolveOverrideCallbackPortBridge.ts exceeds cleanup size cap (${lineCount(hostEvolveOverrideCallbackPortBridge)} lines)`);
assert(lineCount(hostJourneyMorphPortBridge) <= 60, `CoreProductJourneyMorphPortBridge.ts exceeds cleanup size cap (${lineCount(hostJourneyMorphPortBridge)} lines)`);
assert(lineCount(hostPatchClassifier) <= 80, `CoreProductPatchClassifier.ts exceeds cleanup size cap (${lineCount(hostPatchClassifier)} lines)`);
assert(lineCount(hostLeadPresetDataLoader) <= 120, `CoreProductLeadPresetDataLoader.ts exceeds cleanup size cap (${lineCount(hostLeadPresetDataLoader)} lines)`);
assert(lineCount(hostModulationRangeBridge) <= 220, `CoreProductModulationRangeBridge.ts exceeds cleanup size cap (${lineCount(hostModulationRangeBridge)} lines)`);
assert(lineCount(hostModulationRangePortBridge) <= 80, `CoreProductModulationRangePortBridge.ts exceeds cleanup size cap (${lineCount(hostModulationRangePortBridge)} lines)`);
assert(lineCount(hostLiveTriggerCallbackBridge) <= 80, `CoreProductLiveTriggerCallbackBridge.ts exceeds cleanup size cap (${lineCount(hostLiveTriggerCallbackBridge)} lines)`);
assert(lineCount(hostSnapshotCoordinator) <= 120, `CoreProductSnapshotCoordinator.ts exceeds cleanup size cap (${lineCount(hostSnapshotCoordinator)} lines)`);
assert(lineCount(hostTelemetryAdapter) <= 120, `CoreProductTelemetryAdapter.ts exceeds cleanup size cap (${lineCount(hostTelemetryAdapter)} lines)`);
assert(lineCount(hostRuntimeCommandPortBridge) <= 120, `CoreProductRuntimeCommandPortBridge.ts exceeds cleanup size cap (${lineCount(hostRuntimeCommandPortBridge)} lines)`);
assert(lineCount(hostRuntimeHostPort) <= 260, `CoreProductRuntimeHostPort.ts exceeds cleanup size cap (${lineCount(hostRuntimeHostPort)} lines)`);
assert(lineCount(hostRuntimeLifecyclePortBridge) <= 60, `CoreProductRuntimeLifecyclePortBridge.ts exceeds cleanup size cap (${lineCount(hostRuntimeLifecyclePortBridge)} lines)`);
assert(lineCount(hostRuntimeReadPortBridge) <= 80, `CoreProductRuntimeReadPortBridge.ts exceeds cleanup size cap (${lineCount(hostRuntimeReadPortBridge)} lines)`);
assert(lineCount(hostRuntimeTelemetryPortBridge) <= 80, `CoreProductRuntimeTelemetryPortBridge.ts exceeds cleanup size cap (${lineCount(hostRuntimeTelemetryPortBridge)} lines)`);
assert(lineCount(hostSequencerUiAdapter) <= 160, `CoreProductSequencerUiAdapter.ts exceeds cleanup size cap (${lineCount(hostSequencerUiAdapter)} lines)`);
assert(lineCount(hostSequencerCallbackPortBridge) <= 80, `CoreProductSequencerCallbackPortBridge.ts exceeds cleanup size cap (${lineCount(hostSequencerCallbackPortBridge)} lines)`);
assert(lineCount(hostSequencerUiPatchBridge) <= 80, `CoreProductSequencerUiPatchBridge.ts exceeds cleanup size cap (${lineCount(hostSequencerUiPatchBridge)} lines)`);
assert(lineCount(hostInvoker) <= 60, `CoreProductHostInvoker.ts exceeds cleanup size cap (${lineCount(hostInvoker)} lines)`);
assert(lineCount(runtimeAdapter) <= 650, `CoreProductRuntimeAdapter.ts exceeds cleanup size cap (${lineCount(runtimeAdapter)} lines)`);

for (const [surfaceName, surface, tokens] of [
  ['ProductEnginePort', productEnginePort, [
    'getCapabilityReport(): ProductRuntimeCapabilityReport',
    "import type { ProductRuntimeCapabilityReport } from './ProductRuntimeCapabilityReport'",
  ]],
  ['WebProductEngine', webProductEngine, [
    'getCapabilityReport(): ProductRuntimeCapabilityReport',
    "import { coreProductRuntimeHostPort } from './host/CoreProductRuntimeHostPort'",
    'coreProductRuntimeHostPort.start(options?.initialState)',
    'coreProductRuntimeHostPort.stop()',
    'coreProductRuntimeHostPort.suspend()',
    'coreProductRuntimeHostPort.resume()',
    'coreProductRuntimeHostPort.setOutputGain(target, durationSeconds)',
    'coreProductRuntimeHostPort.updateSnapshotPatch(reason, patch)',
    'coreProductRuntimeHostPort.postEvent(event)',
    'coreProductRuntimeHostPort.registerAsset(asset)',
    'coreProductRuntimeHostPort.readState()',
    'coreProductRuntimeHostPort.readTelemetry()',
    'coreProductRuntimeHostPort.readDiagnostics()',
    'coreProductRuntimeHostPort.readCapabilityReport()',
    'coreProductRuntimeHostPort.setTelemetryCallback(callback, () => this.publishDiagnostics())',
    "coreProductRuntimeHostPort.setLiveTriggerCallback('leadExpression', callback)",
    "coreProductRuntimeHostPort.setLiveTriggerCallback('granularSH', callback)",
    'coreProductRuntimeHostPort.applySequencerUiPatch(patch)',
    'common controls should move to generated ProductEvents or dirty-diff paths',
    'do not replace generated events with legacy parameter-update snapshots',
    'asset lifecycle stays product-shaped here',
    'sequencer UI edits should continue through',
  ]],
  ['Core Product host invoker', hostInvoker, [
    "import { coreProductEngineHost } from '../../coreProductEngineHost'",
    'export type CoreProductHostMethodCall',
    'export const callCoreProductHost',
    'core-product host does not implement',
  ]],
  ['Product runtime host port', hostRuntimeHostPort, [
    'TODO(product-core-burn-down)',
    "import { callCoreProductHost } from './CoreProductHostInvoker'",
    'export const coreProductRuntimeHostPort',
    'start(initialState?: ProductEngineStartOptions',
    'return startCoreProductRuntime(callCoreProductHost, initialState)',
    'stopCoreProductRuntime(callCoreProductHost)',
    'return suspendCoreProductRuntime(callCoreProductHost)',
    'return resumeCoreProductRuntime(callCoreProductHost)',
    'setCoreProductOutputGain(callCoreProductHost, target, durationSeconds)',
    'updateCoreProductSnapshotPatch(callCoreProductHost, reason, patch)',
    'postCoreProductEvent(callCoreProductHost, event)',
    'pushCoreProductMidiMessage(callCoreProductHost, message)',
    'return registerCoreProductAsset(callCoreProductHost, asset)',
    'unregisterCoreProductAsset(callCoreProductHost, assetId)',
    'return auditionCoreProductSynthNote(callCoreProductHost, note, externalState)',
    'return triggerCoreProductDrumVoice(callCoreProductHost, voice, velocity, externalState)',
    'return readCoreProductState(callCoreProductHost)',
    'return readCoreProductTelemetry(callCoreProductHost)',
    'return readCoreProductDynamicsVisualTelemetry(callCoreProductHost)',
    'return readCoreProductRuntimeDiagnostics(callCoreProductHost)',
    'return readCoreProductCapabilityReport(callCoreProductHost)',
    'setCoreProductStateChangeCallback(callCoreProductHost, callback)',
    'setCoreProductTelemetryCallback(callCoreProductHost, callback, publishDiagnostics)',
    'setCoreProductDrumTriggerCallback(callCoreProductHost, callback)',
    'setCoreProductRuntimeWalkRanges(callCoreProductHost, ranges)',
    'setCoreProductLiveTriggerCallback(callCoreProductHost, name, callback)',
    'applyCoreProductSequencerUiPatch(callCoreProductHost, patch)',
    'setCoreProductVisualTelemetryActive(callCoreProductHost, active)',
  ]],
  ['Product evolved override callback port bridge', hostEvolveOverrideCallbackPortBridge, [
    'TODO(product-core-burn-down)',
    'setCoreProductDrumEvolveOverridesChangedCallback',
    'setCoreProductSynthEvolveOverridesChangedCallback',
    'setCoreProductSynthNoteRangeEvolvedCallback',
    "callHost<void>('setDrumEvolveOverridesChangedCallback', callback)",
    "callHost<void>('setSynthEvolveOverridesChangedCallback', callback)",
    "callHost<void>('setSynthNoteRangeEvolvedCallback', callback)",
  ]],
  ['Product journey morph port bridge', hostJourneyMorphPortBridge, [
    'TODO(product-core-burn-down)',
    'resetCoreProductCofDrift',
    'setCoreProductJourneyMorphClockCallback',
    'startCoreProductJourneyMorphClock',
    'stopCoreProductJourneyMorphClock',
    "callHost<void>('resetCofDrift')",
    "callHost<void>('setJourneyMorphClockCallback', callback)",
    "callHost<void>('startJourneyMorphClock')",
    "callHost<void>('stopJourneyMorphClock')",
  ]],
  ['Product live trigger callback bridge', hostLiveTriggerCallbackBridge, [
    'TODO(product-core-burn-down)',
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
  ]],
  ['Product modulation range port bridge', hostModulationRangePortBridge, [
    'TODO(product-core-burn-down)',
    'setCoreProductRuntimeWalkPositionsCallback',
    'setCoreProductDrumMorphRange',
    'setCoreProductDrumParamSampleHoldRange',
    'setCoreProductSampleHoldRanges',
    'setCoreProductRuntimeWalkRanges',
    "callHost<void>('setRuntimeWalkPositionsCallback', callback)",
    "callHost<void>('setDrumMorphRange', voice, range)",
    "callHost<void>('setDrumParamSHRange', key, range)",
    "callHost<void>('setDualRanges', ranges)",
    "callHost<void>('setRuntimeWalkRanges', ranges)",
  ]],
  ['Product runtime telemetry port bridge', hostRuntimeTelemetryPortBridge, [
    'TODO(product-core-burn-down)',
    'setCoreProductStateChangeCallback',
    'setCoreProductTelemetryCallback',
    'setCoreProductPerfMonitorEnabled',
    'setCoreProductVisualTelemetryActive',
    "callHost<void>('setStateChangeCallback', callback)",
    "callHost<void>('setProductTelemetryCallback', callback ?",
    'publishDiagnostics();',
    "callHost<void>('setPerfMonitorEnabled', enabled)",
    "callHost<void>('setVisualTelemetryActive', active)",
  ]],
  ['Product runtime command port bridge', hostRuntimeCommandPortBridge, [
    'TODO(product-core-burn-down)',
    'setCoreProductOutputGain',
    'updateCoreProductSnapshotPatch',
    'postCoreProductEvent',
    'pushCoreProductMidiMessage',
    'registerCoreProductAsset',
    'unregisterCoreProductAsset',
    'auditionCoreProductSynthNote',
    'triggerCoreProductDrumVoice',
    "callHost<void>('setOutputGain', target, durationSeconds)",
    "callHost<void>('updateSnapshotPatch', reason, patch)",
    "callHost<void>('postProductEvent', event)",
    "callHost<void>('pushMidiMessage', message)",
    "callHost<void>('registerAsset', asset)",
    "return { assetId: asset.assetId };",
    "callHost<void>('unregisterAsset', assetId)",
    "return callHost<Promise<void>>('auditionSynthNote', note, externalState)",
    "return callHost<Promise<void>>('triggerDrumVoice', voice, velocity, externalState)",
  ]],
  ['Product runtime lifecycle port bridge', hostRuntimeLifecyclePortBridge, [
    'TODO(product-core-burn-down)',
    'ProductEngineStartOptions',
    'startCoreProductRuntime',
    'stopCoreProductRuntime',
    'suspendCoreProductRuntime',
    'resumeCoreProductRuntime',
    "return callHost<Promise<void>>('start', initialState)",
    "callHost<void>('stop')",
    "return callHost<Promise<void>>('suspend')",
    "return callHost<Promise<void>>('resume')",
  ]],
  ['Product runtime read port bridge', hostRuntimeReadPortBridge, [
    'TODO(product-core-burn-down)',
    'ProductRuntimeCapabilityReport',
    'ProductRuntimeDiagnostics',
    'ProductEngineState',
    'ProductTelemetrySnapshot',
    'readCoreProductState',
    'readCoreProductTelemetry',
    'readCoreProductDynamicsVisualTelemetry',
    'readCoreProductRuntimeDiagnostics',
    'readCoreProductCapabilityReport',
    "return callHost<ProductEngineState>('getState')",
    "return callHost<ProductTelemetrySnapshot | null>('getProductTelemetry')",
    "return callHost<unknown>('getDynamicsVisualTelemetry')",
    "return callHost<ProductRuntimeDiagnostics>('getProductRuntimeDiagnostics')",
    "return callHost<ProductRuntimeCapabilityReport>('getCapabilityReport')",
  ]],
  ['Product sequencer callback port bridge', hostSequencerCallbackPortBridge, [
    'TODO(product-core-burn-down)',
    'setCoreProductDrumTriggerCallback',
    'setCoreProductDrumStepPositionCallback',
    'setCoreProductSynthStepPositionCallback',
    'setCoreProductDrumEuclidEvolveTriggerCallback',
    'setCoreProductSynthEuclidEvolveTriggerCallback',
    "callHost<void>('setDrumTriggerCallback', callback)",
    "callHost<void>('setDrumStepPositionCallback', callback)",
    "callHost<void>('setSynthStepPositionCallback', callback)",
    "callHost<void>('setDrumEuclidEvolveTriggerCallback', callback)",
    "callHost<void>('setSynthEuclidEvolveTriggerCallback', callback)",
  ]],
  ['Product sequencer UI patch bridge', hostSequencerUiPatchBridge, [
    'TODO(product-core-burn-down)',
    'TODO(product-core-sequencer-events)',
    'evolve config events for drum/synth lane evolution settings',
    'sub-lane enabled/config events that carry enabled, step count, direction',
    'synth/drum step override event batches that carry values, directions',
    'pitch-settings and home-capture events that update Product-owned home',
    'ProductSequencerUiPatch',
    "callHost<void>('setDrumEuclidEvolveConfigs', patch.configs)",
    "callHost<void>('setSynthEuclidEvolveConfigs', patch.configs)",
    "callHost<void>('setDrumSubLaneEnabled', patch.states)",
    "callHost<void>('setSynthSubLaneEnabled', patch.states)",
    "callHost<void>('setSynthPitchSettings', patch.settings)",
    "callHost<void>('setDrumStepOverrides', patch.overrides)",
    "callHost<void>('setSynthStepOverrides', patch.overrides)",
    "callHost<void>('setSequencerPresetHomeSnapshots')",
    "callHost<void>('captureSynthEuclidLaneHome', patch.laneIndex, patch.pitchState)",
    "callHost<void>('captureDrumEuclidLaneHome', patch.laneIndex, patch.pitchSettings, patch.pitchState)",
  ]],
  ['Product runtime capability report', productRuntimeCapabilityReport, [
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
  ]],
  ['Core Product host capability report', host, [
    'getCapabilityReport(): ProductRuntimeCapabilityReport',
    'createWebProductRuntimeCapabilityReport(this.diagnostics.snapshot())',
    "readonly engineMode = 'core-product';",
  ]],
  ['C++ Product capability report', productApi, [
    'KesshoProductCapabilityReport kessho_product_get_capability_report(void)',
    'report.abi_version = KESSHO_PRODUCT_ABI_VERSION;',
    'report.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;',
    'report.supports_full_product_graph = 1;',
    'report.supports_native_bridge = 0;',
    'report.legacy_fallback_count = 0;',
    'report.unsupported_method_count = 0;',
  ]],
  ['C++ Product telemetry header', productTelemetryHeader, [
    'typedef struct KesshoProductCapabilityReport',
    'uint32_t abi_version;',
    'uint32_t schema_hash;',
    'uint32_t supports_native_bridge;',
    'uint32_t legacy_fallback_count;',
    'uint32_t unsupported_method_count;',
  ]],
  ['C++ Product ABI header', productTypesHeader, [
    '#define KESSHO_PRODUCT_ABI_VERSION 5',
    '#define KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH KESSHO_PRODUCT_GENERATED_SCHEMA_HASH',
  ]],
]) {
  for (const token of tokens) {
    assert(surface.includes(token), `${surfaceName} is missing capability-report token ${token}`);
  }
}

assert(hostPatchClassifier.includes('snapshotReloadReasonForProductPatch'), 'Product patch reload reason classification must live in CoreProductPatchClassifier.ts');
assert(!host.includes('function snapshotReloadReasonForProductPatch'), 'coreProductEngineHost.ts must delegate Product patch reload reason classification to CoreProductPatchClassifier.ts');
assert(hostTelemetryAdapter.includes('createCoreProductPerfSnapshot'), 'Product telemetry perf snapshot shaping must live in CoreProductTelemetryAdapter.ts');
assert(hostTelemetryAdapter.includes('enrichCoreProductHostTelemetry'), 'Product host telemetry enrichment must live in CoreProductTelemetryAdapter.ts');
assert(!host.includes('private createPerfSnapshot'), 'coreProductEngineHost.ts must delegate Product perf snapshot shaping to CoreProductTelemetryAdapter.ts');
assert(lineCount(arrangementScheduler) <= 520, `coreProductArrangementScheduler.ts exceeds cleanup size cap (${lineCount(arrangementScheduler)} lines)`);
assert(lineCount(snapshot) <= 1240, `coreProductSnapshot.ts exceeds cleanup size cap (${lineCount(snapshot)} lines)`);
assert(lineCount(snapshotEncoder) <= 560, `coreProductSnapshotEncoder.ts exceeds cleanup size cap (${lineCount(snapshotEncoder)} lines)`);
assert(
  fallbackDiagnostics.includes('classifyCoreProductRuntimeFallback') &&
    fallbackDiagnostics.includes('CORE_PRODUCT_GETTER_POLICIES'),
  'CoreProductFallbackDiagnostics.ts must own fallback classification and Product Core getter policy data',
);

for (const token of [
  '{ steps: 16, hits: 4, rotation: 0 }',
  '{ steps: 8, hits: 3, rotation: 1 }',
  '{ steps: 16, hits: 2, rotation: 0 }',
  '{ steps: 16, hits: 6, rotation: 2 }',
  '{ steps: 8, hits: 5, rotation: 0 }',
  '{ steps: 16, hits: 3, rotation: 0 }',
  '{ steps: 12, hits: 5, rotation: 0 }',
  'defaultSynthEuclidPattern',
  'defaultDrumEuclidPattern',
]) {
  assert(euclideanPatterns.includes(token), `Shared Euclidean sequencer defaults are missing ${token}`);
}
for (const [label, source] of [
  ['Product snapshot', snapshot],
  ['Product sequencer visuals', hostSequencerVisuals],
  ['Core-Web host', coreEngineHost],
]) {
  assert(source.includes('defaultSynthEuclidPattern'), `${label} must use the shared synth Euclidean lane defaults`);
  assert(source.includes('defaultDrumEuclidPattern'), `${label} must use the shared drum Euclidean lane defaults`);
}
assert(drumSynth.includes('defaultDrumEuclidPattern'), 'Legacy Web drum sequencer must use shared drum Euclidean lane defaults');

for (const token of [
  "'1/4t': '1/4T'",
  "'1/8t': '1/8T'",
  "'1/16t': '1/16T'",
  "'1/32t': '1/32T'",
  'sequencerClockDivisionToNumericValue',
  'sequencerClockDivisionToSeconds',
  'normalizeSequencerClockDivisions',
]) {
  assert(sequencerClockDivisions.includes(token), `Shared sequencer clock division normalization is missing ${token}`);
}
for (const [label, source, token] of [
  ['Product host adapter', hostSequencerAdapter, 'sequencerClockDivisionToNumericValue'],
  ['Product snapshot', snapshot, 'sequencerClockDivisionToNumericValue'],
  ['Product sequencer visuals', hostSequencerVisuals, 'sequencerClockDivisionToNumericValue'],
  ['Legacy Web engine', webEngine, 'sequencerClockDivisionToSeconds'],
  ['Core-Web host', coreEngineHost, 'sequencerClockDivisionToSeconds'],
  ['Legacy Web drum synth', drumSynth, 'sequencerClockDivisionToSeconds'],
  ['Preset sequencer restore hook', presetSequencerRestore, 'normalizeSequencerClockDivisions'],
  ['Sequencer hook preset restore', useEuclideanSequencer, 'normalizeSequencerClockDivisions'],
  ['Lane preset restore', sequencePresetLane, 'normalizeSequencerClockDivision'],
]) {
  assert(source.includes(token), `${label} must use shared sequencer clock division normalization`);
}

for (const token of [
  'MAX_SEQUENCER_SWING = 0.75',
  'normalizeSequencerSwing',
  'normalizeSequencerSwings',
]) {
  assert(sequencerSwing.includes(token), `Shared sequencer swing normalization is missing ${token}`);
}
for (const [label, source, token] of [
  ['Preset sequencer restore hook', presetSequencerRestore, 'normalizeSequencerSwings'],
  ['Sequencer hook restore', useEuclideanSequencer, 'normalizeSequencerSwings'],
  ['Lane preset restore', sequencePresetLane, 'normalizeSequencerSwing'],
  ['Product snapshot', snapshot, 'normalizeSequencerSwing'],
  ['Product host', host, 'normalizeSequencerSwing'],
  ['Product swing evolve helper', hostSequencerSwing, 'normalizeSequencerSwing'],
  ['Legacy Web engine', webEngine, 'normalizeSequencerSwing'],
  ['Core-Web host', coreEngineHost, 'normalizeSequencerSwing'],
  ['Legacy Web drum synth', drumSynth, 'normalizeSequencerSwing'],
]) {
  assert(source.includes(token), `${label} must use shared sequencer swing normalization`);
}

for (const token of [
  'normalizeSequencerPitchBindingMode',
  'normalizeSequencerPitchBindingModes',
  'sequencerPitchBindingModeToProductId',
]) {
  assert(sequencerPitchBinding.includes(token), `Shared synth pitch-binding normalization is missing ${token}`);
}
for (const [label, source, token] of [
  ['Preset sequencer restore hook', presetSequencerRestore, 'normalizeSequencerPitchBindingModes'],
  ['Synth page restore', synthPage, 'normalizeSequencerPitchBindingModes'],
  ['Lane preset restore', sequencePresetLane, 'normalizeSequencerPitchBindingMode'],
  ['Legacy Web engine', webEngine, 'normalizeSequencerPitchBindingMode'],
  ['Core-Web host', coreEngineHost, 'normalizeSequencerPitchBindingMode'],
  ['Product host', host, 'sequencerPitchBindingModeToProductId'],
]) {
  assert(source.includes(token), `${label} must use shared synth pitch-binding normalization`);
}

for (const token of [
  'isSequencerLaneDirection',
  'normalizeSequencerLaneDirection',
  'normalizeOptionalSequencerLaneDirection',
]) {
  assert(sequencerLaneDirection.includes(token), `Shared sequencer lane direction normalization is missing ${token}`);
}
for (const [label, source, token] of [
  ['Preset sequencer restore hook', presetSequencerRestore, 'normalizeSequencerLaneDirection'],
  ['Sequencer hook restore', useEuclideanSequencer, 'normalizeSequencerLaneDirection'],
  ['Lane preset restore', sequencePresetLane, 'normalizeSequencerLaneDirection'],
  ['Step override serialization', stepOverrideSerialization, 'normalizeOptionalSequencerLaneDirection'],
]) {
  assert(source.includes(token), `${label} must use shared sequencer lane direction normalization`);
}

for (const token of [
  'normalizeSequencerPitchMode',
  'normalizeSequencerPitchRoot',
  'normalizeSequencerPitchScale',
  'normalizeSequencerPitchSettings',
  'normalizeSequencerPitchSettingsArray',
]) {
  assert(sequencerPitchSettings.includes(token), `Shared sequencer pitch-settings normalization is missing ${token}`);
}
for (const [label, source, token] of [
  ['App preset save', app, 'normalizeSequencerPitchSettingsArray'],
  ['Preset sequencer restore hook', presetSequencerRestore, 'normalizeSequencerPitchSettingsArray'],
  ['Sequencer hook restore', useEuclideanSequencer, 'normalizeSequencerPitchSettingsArray'],
  ['Lane preset restore', sequencePresetLane, 'normalizeSequencerPitchSettings'],
  ['Legacy Web engine', webEngine, 'normalizeSequencerPitchSettings(settings[i], this.synthPitchSettings[i])'],
  ['Core-Web host', coreEngineHost, 'normalizeSequencerPitchSettings(settings[index], this.synthPitchSettings[index])'],
  ['Product host', host, 'normalizeSequencerPitchSettingsArray('],
]) {
  assert(source.includes(token), `${label} must use shared sequencer pitch-settings normalization`);
}

for (const token of [
  'stepOverridesForEngineSubLaneState',
  'SUB_LANE_VALUE_FIELDS',
  'visibleSubLaneSteps',
  'values.slice(0, steps)',
]) {
  assert(engineStepOverrides.includes(token), `Shared engine sequencer sub-lane trimming is missing ${token}`);
}
for (const [label, source, token] of [
  ['Preset sequencer restore hook', presetSequencerRestore, 'drumStepOverridesForEngineRestore('],
  ['Drum page engine sync', drumPage, 'stepOverridesForEngineSubLaneState({'],
  ['Synth page engine sync', synthPage, 'stepOverridesForEngineSubLaneState({'],
]) {
  assert(source.includes(token), `${label} must trim hidden sub-lane values before syncing engine payloads`);
}
assert(
  presetSequencerRestore.includes('function synthStepOverridesForEngineRestore(') &&
    presetSequencerRestore.includes('stepOverridesForEngineSubLaneState(') &&
    presetSequencerRestore.includes('setSelectedSynthStepOverrides(synthStepOverridesForEngineRestore('),
  'Preset sequencer restore hook must trim hidden sub-lane values before syncing engine payloads',
);

for (const token of [
  'export function normalizeSequencerEvolveConfig',
  'const methods: Record<string, boolean> = { ...base.methods };',
  'value === true',
  'rawEnabledSubLanes.filter',
]) {
  assert(useEuclideanSequencer.includes(token), `Shared sequencer evolve config defaults are missing ${token}`);
}
assert(
  presetSequencerRestore.includes("normalizeSequencerEvolveConfigs('drum', preset.drumEvolveConfigs, 4)") &&
    presetSequencerRestore.includes("normalizeSequencerEvolveConfigs('synth', preset.synthEvolveConfigs, 4)"),
  'State preset restore must normalize drum and synth evolve configs before syncing Product/Web engines',
);
assert(
  sequencePresetLane.includes("applySequencePresetEvolveConfigs(") &&
    sequencePresetLane.includes("normalizeSequencerEvolveConfig(prefix, serialized.evolveConfig)"),
  'Sequence preset load must normalize evolve config defaults before restoring a lane',
);
assert(
  sequencePresetLane.includes('inferLegacySubLaneStatesFromOverrides(') &&
    sequencePresetLane.includes('inferLegacySequencerSubLaneStatesFromOverrides(') &&
    sequencePresetLane.includes('serializedOverrides?: SerializedStepOverrides') &&
    drumPage.includes('applySequencePresetSubLaneStates(current, sequenceState, laneIdx, stepOverrides)') &&
    synthPage.includes('applySequencePresetSubLaneStates(current, sequenceState, laneIdx, stepOverrides)'),
  'Sequence and state preset load must infer missing legacy sub-lane state from saved override arrays',
);
assert(
  webEngine.includes('private resetSynthEuclidEvolveBarCounters(): void') &&
    webEngine.includes('this.synthEuclidTotalStepCounts = [0, 0, 0, 0];') &&
    coreEngineHost.includes('private resetSynthEuclidEvolveBarCounters(): void') &&
    coreEngineHost.includes('this.resetSynthEuclidEvolveBarCounters();'),
  'Web/Core-Web synth evolve must reset bar counters with transport restart/live timer reset',
);
assert(
  euclideanPatternBank.includes('drumEuclidTempo: 1') &&
    euclideanPatternBank.includes('drumEuclidDivision: 16') &&
    !euclideanPatternBank.includes('drumEuclidTempo: 120') &&
    !euclideanPatternBank.includes("drumEuclidDivision: '1/16'"),
  'Generic drum Euclidean pattern presets must load timing as multiplier/numeric division state',
);
assert(
  euclideanPatternBank.includes('euclideanPatternNoteMin') &&
    euclideanPatternBank.includes('euclideanPatternNoteMax') &&
    euclideanPatternBank.includes('synthEuclid${lane}NoteMin') &&
    euclideanPatternBank.includes('synthEuclid${lane}NoteMax'),
  'Synth sequence presets must round-trip noteRange min/max bounds',
);
assert(
  synthSeqEvolve.includes('triggerToggle: false'),
  'Legacy Web synth evolve defaults must match the UI/Product default trigger-toggle policy',
);
assert(
  synthSeqEvolve.includes('evolution: 0.25') &&
    drumSynth.includes('evolution: 0.25') &&
    coreEngineHost.includes('evolution: 0.25'),
  'Legacy Web evolve defaults must match UI/Product evolve intensity defaults',
);
assert(
  hostSequencerEvolveConfig.includes("normalizeEvolveConfigs(configs: unknown, kind?: SequencerEvolveKind)") &&
    hostSequencerEvolveConfig.includes('defaultEvolveMethods(kind)') &&
    host.includes("normalizeEvolveConfigs(configs, 'synth')") &&
    host.includes("normalizeEvolveConfigs(configs, 'drum')"),
  'Product host evolve config normalization must restore default method maps for synth and drum',
);
assert(
  webEngine.includes('const incoming = configs[i] ?? {};') &&
    webEngine.includes('methods: mergeEvolveMethods(current.methods, incoming.methods)') &&
    webEngine.includes('value === true'),
  'Legacy Web synth evolve config updates must normalize partial method maps',
);
assert(
  webEngine.includes('mergeEvolveEnabledSubLanes(incoming.enabledSubLanes, current.enabledSubLanes)') &&
    drumSynth.includes('incoming.filter((lane): lane is string => typeof lane === \'string\')') &&
    drumSynth.includes('configEnabledSubs') &&
    drumSynth.includes('configEnabledSubs.includes(sl)'),
  'Legacy Web drum evolve config updates must preserve and apply enabled sub-lane filters',
);
assert(
  synthPage.includes('useRef<Record<SubLaneKind, SubLaneState>[] | null>(null)') &&
    synthPage.includes('const stepOverridesRef = useRef<StepOverrides | null>(null);') &&
    drumPage.includes('useRef<Record<SubLaneKind, SubLaneState>[] | null>(null)'),
  'Synth and drum pages must sync initial sub-lane and step override state to the engine',
);
assert(
  webEngine.includes("sl === 'probability' || sl === 'ratchet' || uiEnabled[sl] === true") &&
    webEngine.includes('const pitchOffsets = slEnabled.pitch === true ?') &&
    webEngine.includes('const exprArr = slEnabled.expression === true ?') &&
    webEngine.includes('const morphArr = slEnabled.morph === true ?') &&
    webEngine.includes('const distanceArr = slEnabled.distance === true ?'),
  'Legacy Web synth sequencer/evolve must treat UI sub-lanes as opt-in like Product',
);
assert(
  host.includes('return lanes[laneIndex]?.[key] === true;'),
  'Product sequencer step-value fields must be gated by explicit UI sub-lane enables',
);

for (const [label, source, token] of [
  [
    'Product sub-lane phase resolver',
    productSequencerTests,
    'manual masked sequencer should produce two hit-clocked sub-lane events',
  ],
  [
    'Product synth pitch binding regression',
    productSequencerTests,
    'sequence-bound pitch should read trigger step phase instead of emitted hit phase',
  ],
  [
    'Product emitted-hit regression',
    productSequencerTests,
    'synth emitted hit 1 should skip suppressed hit and use pitch index 1',
  ],
  [
    'Product synth ratchet emitted-hit regression',
    productSequencerTests,
    'synth ratchet sub-lane should skip suppressed trigger phases',
  ],
  [
    'Product morph pingpong regression',
    productSequencerTests,
    'synth morph pingpong step 3 should fold to index 1',
  ],
  [
    'Product distance reverse regression',
    productSequencerTests,
    'synth distance reverse step 0 should use index 2',
  ],
  [
    'Product drum emitted-hit regression',
    productSequencerTests,
    'drum emitted hit 1 should skip suppressed hit and use expression index 1',
  ],
  [
    'Product reverse sub-lane regression',
    productSequencerTests,
    'reverse sub-lane step 3 should wrap to expression index 2',
  ],
  [
    'Product native pitch phase selector',
    productSequencerEventBuffer,
    'field == KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE && lane.midi_note_binding_mode == kSequencerPitchBindingStep',
  ],
  [
    'Legacy Web synth pitch phase selector',
    webEngine,
    "const pitchIdx = pitchBindingMode === 'sequence'",
  ],
  [
    'Core-Web synth pitch phase selector',
    coreEngineHost,
    "const pitchIndex = pitchBindingMode === 'sequence'",
  ],
  [
    'Core-Web drum sub-lane phase selector',
    coreEngineHost,
    'directedStepIndex(expressionValues.length, expressionDirection, hitCount)',
  ],
]) {
  assert(source.includes(token), `${label} must preserve web-ts sub-lane/subsequence phase behavior`);
}

for (const token of [
  'SYNTH_LANE_ENABLED_KEYS',
  'DRUM_LANE_ENABLED_KEYS',
  'toggleLazySequencerTransport',
  'data-sequencer-transport="${activeTab}"',
  "window.addEventListener('keydown', handleLazySequencerTransportShortcut, true)",
]) {
  assert(lazySequencerTransport.includes(token), `Lazy sequencer keyboard fallback hook is missing ${token}`);
}
assert(
  app.includes('useLazySequencerTransport({') &&
    app.includes('startPlayback: handleStart') &&
    !app.includes('startPlaybackWithState: (patchedState)'),
  'App must delegate lazy sequencer keyboard fallback and start action directly to useLazySequencerTransport',
);
assert(synthPage.includes('event.defaultPrevented'), 'Synth page hotkeys must ignore already-handled keyboard events');
assert(drumPage.includes('e.defaultPrevented'), 'Drum page hotkeys must ignore already-handled keyboard events');
assert(synthPage.includes('data-sequencer-transport="synth"'), 'Synth transport button must identify its sequencer tab for keyboard fallback');
assert(drumPage.includes('data-sequencer-transport="drums"'), 'Drum transport button must identify its sequencer tab for keyboard fallback');
assert(
  synthPage.includes("seq.evolveFlashing[idx] ? ' seq-evolve-flash' : ''") &&
    synthPage.includes("seq.evolveFlashing[seq.activeTab] ? ' seq-evolve-flash' : ''") &&
    drumPage.includes("seq.evolveFlashing[idx] ? ' seq-evolve-flash' : ''") &&
    drumPage.includes("seq.evolveFlashing[seq.activeTab] ? ' seq-evolve-flash' : ''"),
  'Synth and drum evolve trigger callbacks must render visible evolve flash feedback',
);
assert(
  methodBody(webEngine, 'diceSynthEuclidLane(laneIndex: number, intensity: number = 1)').includes('this.onSynthEvolveTrigger?.(laneIndex);'),
  'Legacy Web synth dice must fire the evolve trigger callback for visible dice/evolve flash feedback',
);
assert(
  methodBody(drumSynth, 'diceEuclidLane(laneIndex: number, intensity: number = 1): boolean').includes('this.onEuclidEvolveTrigger?.(laneIndex);'),
  'Legacy Web DrumSynth dice must fire the evolve trigger callback for visible dice/evolve flash feedback after DrumSynth is created',
);
assert(
  synthPage.includes('const previousPresetVersionRef = useRef(presetVersion);') &&
    synthPage.includes('presetVersion === undefined || presetVersion === previousPresetVersionRef.current') &&
    synthPage.includes('previousPresetVersionRef.current = presetVersion;'),
  'Synth preset reset effect must only reset keyboard cursors when presetVersion actually changes',
);
assert(
  !synthPage.includes('setSparkFallbackStep') &&
    !synthPage.includes('synthSequencerVisualsRunning'),
  'Synth sparklines must not synthesize fallback phases outside native Product telemetry',
);
assert(
  packageJson.scripts?.['core:product:sequencer-ui'] === 'node scripts/check-kessho-product-sequencer-ui-parity.mjs',
  'package.json must expose the sequencer UI parity proof',
);
for (const token of [
  "const engineModes = args.engine ? [args.engine] : ['core-product', 'web-ts'];",
  "const tabs = args.tab ? [args.tab] : ['drums', 'synth'];",
  'const totalCases = engineModes.length * tabs.length;',
  'assertSequencerDeterministicControlParity',
  'assertParityValueEqual',
  'stripReportRunNames',
  'clock-division controls',
	  'SUB_LANE_SPARK_INDEX',
	  'proofKeyboardOnlyTransportStartStop',
	  'keyboardTransport',
	  'keyboard-only Space did not start transport',
	  'keyboard-only Space did not stop transport',
	  'ensureSequencerDetailMode',
	  'could not open sequencer Detail view for timing controls',
	  'proofDrumKeyboard',
	  'proofSynthKeyboard',
  'proofTriggerStepControls',
  'triggerProbabilityPercent',
  'triggerConditionText',
  'keyboardControls',
  'proofExpressionRatchetControl',
  'ratchetLineCount',
  'expressionRatchetControl',
  'proofEvolveDiceMutatesState',
  'editorStepValueSignature',
  'evolveDiceMutation',
  'evolve dice did not mutate expression lane state',
  'ensureDrumLinkedBadges',
  'ensureSynthLinkedPitchBadge',
  'setDrumLinkedState',
  'proofLinkedHitCountBadgeTracksHits',
  'proofLinkedHitCountBadgeTracksTriggerToggle',
  'proofLinkedSequencePresetRoundTrip',
  'proofSynthNoteRangeSequencePresetRoundTrip',
  'linkedHitCountBadge',
  'linkedTriggerToggleBadge',
  'linkedSequencePresetRoundTrip',
  'synthNoteRangeSequencePresetRoundTrip',
  'firstHits',
  'secondHits',
  'setSelectedTriggerStep',
  'setTriggerProbabilityPercent',
  'setTriggerConditionToText',
  'ensureEvolvePanelOpen',
  'ensureEvolveAdvancedOpen',
  'setEvolveEditorState',
  'readEvolveEditorState',
  'assertEvolveEditorState',
  'savedEvolveState',
  'changedEvolveState',
  'setLaneTimingEditorState',
  'readLaneTimingEditorState',
  'assertLaneTimingEditorState',
  'savedTimingState',
  'captureEvolveFlash',
  'exerciseEvolveReset',
  'proofSequencePresetRoundTrip',
  'proofSequencePresetStepValueRoundTrip',
  'saveActiveSequencePreset',
  'loadActiveSequencePreset',
  'sequencePresetStepValueRoundTrip',
  'savedTriggerStep',
  'restoredTriggerStep',
  'setExpressionRatchetLineCount',
  'restoredExpressionRatchet',
  'editorStepValueOnlySignature',
  'setSubLaneEnabled',
  'restoredDisabledSubLaneEnabled',
  'disabledSubLane',
  'ensurePitchSparklineEnabled',
  'setPitchSubLaneState',
  'readPitchSubLaneEditorState',
  'assertPitchSubLaneState',
  'setPitchRoot',
  'setPitchNoteRange',
  'noteRange',
  'expected pitch root',
  'savedPitchState',
  'changedPitchSteps',
  "bindingMode: 'linked'",
  'proofEuclideanTriggerPatternControls',
  'setTriggerStepsViaKeyboard',
  'setTriggerControlViaDrag',
  'ensureTriggerKeyboardLane',
  'triggerPatternState',
  'euclideanPatternControls',
  'initialHits',
  'trigger hits',
  'setRangeSubLaneState',
  'readRangeSubLaneEditorState',
  'setExpressionSequenceState',
  'restoredSubLanes',
  "pitch: await readPitchSubLaneEditorState(page)",
  "timing: await readLaneTimingEditorState(page)",
  "morph: {",
  "distance: {",
  '__sequencer_audit_',
  "url.searchParams.set('localPresets', '1')",
  '.seq-evolve-dice',
  '.seq-evolve-reset',
	  'sparkPlayheadX',
	  'sampleSubLanePlayheads',
	  'assertSubLanePlayheadMovement',
	  'sampleSequencerPlayheads',
	  'assertStoppedPlayheadsFrozen',
	  'stoppedPlayheadFreeze',
	  'stopped trigger playhead kept moving',
	  'proofSynthKeyboardHarmonyContext',
	  'assertSynthHarmonyContextParity',
	  'synth harmony root set mismatch',
	  '.synth-keyboard-key.harmony-root, .synth-keyboard-key.harmony-chord, .synth-keyboard-key.harmony-scale',
	  'subLaneSparkSamples',
	  "await page.keyboard.press('Space')",
  'kessho-product-sequencer-ui-parity-latest.json',
  'kessho-product-sequencer-ui-parity-selected-latest.json',
]) {
  assert(sequencerUiParity.includes(token), `Sequencer UI parity proof is missing ${token}`);
}
for (const token of [
  'sequenced-synth-euclid-pad1-dry-routing',
  'active-morph-slider-sequenced-synth-pad1-route-smoke',
  'sequenced-synth-euclid-pad2-dry-routing',
  'sequenced-synth-euclid-lead1-dry-routing',
  'active-morph-slider-sequenced-synth-lead1-route-smoke',
  'sequenced-synth-euclid-lead2-dry-routing',
  'sequenced-synth-euclid-piano-dry-routing',
  'sequenced-drum-euclid-kick-dry-routing',
  'active-morph-slider-sequenced-drum-kick-route-smoke',
  'sequenced-drum-euclid-sub-dry-routing',
	  'sequenced-drum-euclid-click-dry-routing',
	  'sequenced-drum-euclid-beep-hi-dry-routing',
	  'sequenced-drum-euclid-beep-lo-dry-routing',
	  'sequenced-drum-euclid-noise-dry-routing',
	  'sequenced-drum-euclid-membrane-dry-routing',
	  'sequencedPad1EuclidStatePatch',
	  'sequencedPad2EuclidStatePatch',
	  'sequencedLead1EuclidStatePatch',
	  'sequencedLead2EuclidStatePatch',
	  'sequencedPianoEuclidStatePatch',
  'sequencedDrumEuclidStatePatch',
  'sequencedDrumSubEuclidStatePatch',
	  'sequencedDrumClickEuclidStatePatch',
	  'sequencedDrumBeepHiEuclidStatePatch',
	  'sequencedDrumBeepLoEuclidStatePatch',
	  'sequencedDrumNoiseEuclidStatePatch',
	  'sequencedDrumMembraneEuclidStatePatch',
	  'stateEvents: [',
	  "{ delayMs: 100, patch: { synthEuclideanMasterEnabled: true } }",
	  "{ delayMs: 100, patch: { drumEuclidMasterEnabled: true } }",
	  "{ delayMs: 350, patch: { [morphKey]: 0.82 } }",
	  'alignmentGate: true',
	  'routeSmokeOnly: true',
	]) {
	  assert(graphSmokeCases.includes(token), `Graph capture smoke must cover sequencer-driven routing: missing ${token}`);
	}
	for (const [surfaceName, surface, token] of [
	  ['Product sequencer routing script', packageJson.scripts?.['core:product:sequencer-routing-smoke'] ?? '', 'sequenced-drum-euclid-noise-dry-routing'],
	  ['Product sequencer routing script', packageJson.scripts?.['core:product:sequencer-routing-smoke'] ?? '', 'sequenced-drum-euclid-membrane-dry-routing'],
	  ['Graph capture smoke runner', graphCaptureSmoke, "if (caseDef.routeSmokeOnly) command.push('--route-smoke');"],
	  ['Sonic parity runner', sonicParity, "else if (arg === '--route-smoke') args.routeSmoke = true;"],
	  ['Sonic parity runner', sonicParity, 'if (args.routeSmoke) {'],
	  ['Sonic parity runner', sonicParity, "'route-smoke'"],
	]) {
	  assert(surface.includes(token), `${surfaceName} must keep sequenced routing checks smoke-only and complete: missing ${token}`);
	}
assert(
  presetSharedMode.includes('isLocalPresetStoreOverride') &&
    presetSharedMode.includes("new URLSearchParams(window.location.search).get('localPresets') === '1'") &&
    presetSharedMode.includes('isSharedPresetCloudOnlyMode') &&
    app.includes('isLocalPresetStoreOverride()'),
  'Browser parity proofs must be able to exercise local preset save/load without cloud preset I/O',
);

for (const token of [
  'updateParams(sliderState: Record<string, unknown>): void',
  'options.runtime.loadSnapshot(encodeCoreProductSnapshot(options.snapshot));',
  'latestProductSnapshot: CoreProductSnapshot | null',
  'applyLatestSnapshotUpdate(reason: SnapshotReloadReason = \'adapter-update\', forceSequencerClockRejoin = false): void',
  'applyCoreProductSnapshotUpdate',
  'dirtyDiffCount',
  'fullSnapshotReloadCount',
  'unsupportedControlCount',
  'snapshotReloadCpuMs',
  'lastSnapshotReloadReason',
  'private readonly assetRegistrar = new CoreProductAssetRegistrar',
  'buildCoreProductSnapshotDiff(options.previousSnapshot, options.nextSnapshot',
  'shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry)',
  'registerAsset(asset: DecodedCoreProductAsset): void',
  'this.assetRegistrar.registerAsset(asset)',
  'unregisterAsset(assetId: number): void',
  'this.assetRegistrar.unregisterAsset(assetId)',
  'this.assetRegistrar.clear()',
  'this.assetRegistrar.hasMissingDefaultAssetsForState()',
  'this.assetRegistrar.ensureDefaultAssetsForState()',
  'this.assetRegistrar.ensurePianoAssetForNote(note.midi, note.velocity)',
  'this.assetRegistrar.registeredDecodedAssetByteLength()',
  'CORE_PRODUCT_MEMORY_BUDGETS.totalRegisteredDecodedBytes',
  "if (property === 'then') return undefined;",
  'setJourneyMorphClockCallback(callback:',
  'journeyMorphClockRunning',
  'createCoreProductJourneyStateEvent(',
  'setRuntimeWalkPositionsCallback(callback:',
  'setDrumMorphRange(voice:',
  'setDrumParamSHRange(key:',
  'setDualRanges(ranges:',
  'setRuntimeWalkRanges(ranges:',
  'pushMidiMessage(message:',
  'midiTimestampOriginSeconds',
  'timestampOriginSeconds: this.midiTimestampOriginSeconds ?? undefined',
  "this.runtime.audioContext?.state === 'running'",
  'getState(): ProductEngineState',
  'getSonicParityDebugState(): Record<string, unknown>',
  'stop(): void',
  'dispose(): void',
  'ensureDrumSynth(sliderState?: Record<string, unknown>): void',
  'resetCofDrift(): void',
  'resetSonicParityFx(): void',
  'setSeedLocked(locked: boolean): void',
  'triggerSynthVoice(',
  'midiFromFrequency(frequency: number)',
  'loadLeadPreset(slot: unknown, presetId: unknown): Promise<void>',
  'resetSynthEuclidLaneHome(laneIndex: number): void',
  'diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void',
  'resetDrumEuclidLaneHome(laneIndex: number): void',
  'diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void',
  'setSequencerPresetHomeSnapshots(): void',
  'createCoreProductSequencerHomeStore',
  'restoreSequencerLaneHome(sequencer: SequencerKind, laneIndex: number): boolean',
  'this.sequencerHome.armManualDice(sequencer, laneIndex)',
  "this.sequencerHome.consumeManualDice('synth', laneIndex)",
  "this.sequencerHome.consumeManualDice('drum', laneIndex)",
  'postCoreProductSequencerLaneStepState',
  'coreProductSequencerHomePayload',
  'postSequencerControlEvent(event: CoreProductEvent): void',
  'syncSequencerLaneParams(',
  'createCoreProductSequencerLaneParamEvent(',
  'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision',
  'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing',
  'normalizeClockDivisionValue(value, 16)',
  'sequencerClockDivisionToNumericValue(value, fallback)',
  'setSynthEuclidEvolveConfigs(configs: unknown[]): void',
  'setDrumEuclidEvolveConfigs(configs: unknown[]): void',
  'setSynthSubLaneEnabled(states: Record<string, boolean>[]): void',
  'setDrumSubLaneEnabled(states: Record<string, boolean>[]): void',
  'setSynthPitchSettings(settings: unknown[]): void',
  'setSynthPitchBindingModes(modes: unknown[]): void',
  'syncSynthPitchBindingModes()',
  'enabledSequencerSubLanes(sequencer: SequencerKind, laneIndex: number): string[]',
  'SequencerLanePitchBindingMode',
  'sequencerPitchBindingModeToProductId(modes[laneIndex])',
  'setSynthStepOverrides(overrides: unknown): void',
  'setDrumStepOverrides(overrides: unknown): void',
  'normalizeSubLaneEnabledStates(states: unknown)',
  'normalizeDrumSequencerStepValueOverrides(',
  'normalizeSequencerStepToggleOverrides(',
  'normalizeSequencerStepValueOverrides(',
  'normalizeSequencerStepValueConfigs(',
  'normalizeSubLaneDirection(',
  'stepValueFieldEnabled(',
  'collectNumericStepValues(',
  'collectTrigConditionStepValues(',
  "this.syncSequencerStepToggles('synth', true);",
  "this.syncSequencerStepToggles('drum', true);",
  'this.flushSequencerStepToggles();',
  "synthEuclidEvolveConfigs: normalizeEvolveConfigs(configs, 'synth')",
  "drumEuclidEvolveConfigs: normalizeEvolveConfigs(configs, 'drum')",
  'createCoreProductModulationRangeEvent(',
  'createCoreProductSequencerStepEvent(',
  'createCoreProductSequencerStepValueEvent(',
  'createCoreProductSequencerSubLaneConfigEvent(',
  'createCoreProductSequencerClearStepsEvent(',
  'createCoreProductSequencerResetHomeEvent(',
  'createCoreProductSequencerDiceEvent(',
  'createCoreProductMidiEvent({',
  'resolveCoreProductRangeTargets(key)',
  'setDrumTriggerCallback(callback:',
  'setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry));',
  'publishCoreProductSequencerVisuals({ telemetry',
  'this.publishSequencerVisuals(hostTelemetry)',
  'reconcileSequencerUiState(telemetry:',
  'reconcileCoreProductSequencerUiState({',
  'setSynthLaneState:',
  'setDrumLaneState:',
  'function reconcileSynthSequencerLane(',
  'function reconcileDrumSequencerLane(',
  'coreProductSynthEvolvePayloadFromLane(',
  'coreProductDrumEvolvePayloadFromLane(',
  'coreProductSynthMidiToUiPitch(',
  'coreProductSequencerHomePayload(sequencer, index, restored, baseMidi, this.adapterState.synthPitchSettings)',
  'options.synthBaseMidi(laneIndex)',
  'coreProductSynthMidiToUiPitch(values, this.adapterState.synthPitchSettings, laneIndex, baseMidi)',
  'createCoreProductPerfSnapshot(',
  'telemetryRngState',
  'rngSeed: this.latestTelemetry.rngSeed',
  'rngState: this.latestTelemetry.rngState',
  'coreProductRangeValueContext',
]) {
  assert(hostSurface.includes(token), `core-product host/sequencer adapter is missing ${token}`);
}
for (const retiredGetter of [
  'getDynamicsAnalyser():',
  'getDrumVoiceAnalyser():',
  'getGranularBufferWaveform():',
  'getLeadMorphedParams():',
  'getEarthTextureDebugState():',
  'getMediaStream():',
  'getLimiterNode():',
  'getRecordableBusNodes():',
  'getAllStemNodes():',
  'explicitlyUnsupportedGetter(',
  'CoreProductUnsupportedPolicy',
  'throwUnsupportedProductMethod',
  "explicitlyUnsupportedGetter('getDynamicsAnalyser')",
  "explicitlyUnsupportedGetter('getDrumVoiceAnalyser')",
  "explicitlyUnsupportedGetter('getGranularBufferWaveform')",
  "explicitlyUnsupportedGetter('getLeadMorphedParams')",
  "explicitlyUnsupportedGetter('getEarthTextureDebugState')",
  "explicitlyUnsupportedGetter('getMediaStream')",
  "explicitlyUnsupportedGetter('getLimiterNode')",
  "explicitlyUnsupportedGetter('getRecordableBusNodes')",
  "explicitlyUnsupportedGetter('getAllStemNodes')",
]) {
  assert(!hostSurface.includes(retiredGetter), `core-product host must keep retired recording/node getter surface removed: ${retiredGetter}`);
}
const midiPushBody = methodBody(host, 'pushMidiMessage(message:');
assert(
  /if \(this\.runtimeReady\) \{\s*if \(this\.runtime\.audioContext\?\.state === 'running'\) \{\s*post\(\);\s*return;\s*\}\s*void this\.runtime\.resume\(\)\.then\(post\);\s*return;\s*\}/.test(midiPushBody),
  'Product live MIDI path must post directly when AudioContext is already running',
);

for (const token of [
  'function subLanePatch(',
  'includeEmpty = false',
  "patch[entry.name] = { enabled: false, steps: 1, direction: 'forward' };",
  'subLanePatch(lane, true, valueOverrides, includeEmpty)',
]) {
  assert(hostSequencerUiState.includes(token), `Product runtime sequencer UI payload must clear empty sub-lane state: missing ${token}`);
}
assert(
  hostSequencerHome.includes("for (const key of ['pitch', 'expression', 'morph', 'distance'])") &&
    hostSequencerHome.includes("subLaneStates[key] ??= { enabled: false, steps: 1, direction: 'forward' };"),
  'Product reset-home payload must explicitly clear absent supported sub-lane state',
);

for (const token of [
  'createCoreProductSequencerEvolveClock',
  'tickConfigs(',
  'createCoreProductSequencerDiceEvent(',
  'evolveCoreProductSequencerSubLaneConfigs(',
  'getStepValueOverrides?: (sequencer: SequencerKind, laneIndex: number) => SequencerStepValueOverride[]',
  'getEnabledSubLanes?: (sequencer: SequencerKind, laneIndex: number) => string[] | undefined',
  'evolveSynthNoteRange?:',
  'pitchWalk: false',
  "configAllowsSubLane(effectiveConfig, 'pitch')",
  'diceFlagsForEvolveConfig(diceConfig)',
  'diceWriteOffset(config)',
  'createCoreProductSequencerDiceEvent(sequencer, laneIndex, config.evolution, seed, flags, diceWriteOffset(config), bar)',
  'if (hostMutated || flags !== 0 || canHostMutate) input.publish(name, laneIndex)',
  'input.telemetry.transportRunning',
]) {
  assert(hostSequencerEvolve.includes(token), `Product sequencer evolve clock is missing ${token}`);
}
assert(host.includes('this.sequencerEvolveClock.reset();'), 'Product sequencer evolve clock must reset on explicit transport lifecycle boundaries');
for (const token of [
  "type PitchMode = 'semitones' | 'notes' | 'noteRange';",
  'export function coreProductSynthNoteRangeHome(',
  "synthNoteRangePitchSetting(input.pitchSettings, input.laneIndex).mode !== 'noteRange'",
  "input.config.methods?.pitchWalk !== true",
  "input.config.enabledSubLanes.includes('pitch')",
  'home?: NoteRange | null;',
  'const home = input.home ?? coreProductSynthNoteRangeHome({',
  'noteRange?: { min: number; max: number } | null;',
  'state.noteRange != null',
  'existing.noteRange == null && state.noteRange != null',
  'function hasCapturedHomeContent(state: CoreProductSequencerHomeState): boolean',
  "typeof state.swing === 'number' && Number.isFinite(state.swing)",
  'existing && hasCapturedHomeContent(existing)',
  "this.captureSequencerHomeLane('synth', laneIndex);",
  "const home = this.sequencerHome.restore('synth', laneIndex)?.noteRange ?? null;",
  'coreProductSynthNoteRangeHome({ laneIndex, state: this.latestSliderState, pitchSettings: this.adapterState.synthPitchSettings, current: this.synthNoteRangeOverrides[laneIndex] })',
  "this.invokeDisplayCallback('synthNoteRangeEvolved', index, home.noteRange.min, home.noteRange.max)",
  "return { handled: true, range: { min, max }, midiNote: (min + max) * 0.5 }",
  "this.invokeDisplayCallback('synthNoteRangeEvolved', laneIndex, evolved.range.min, evolved.range.max)",
  "KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote",
]) {
  assert(`${hostSynthNoteRangeEvolve}\n${hostSequencerHome}\n${host}`.includes(token), `Product synth note-range evolve wiring is missing ${token}`);
}
assert(!hostSynthNoteRangeEvolve.includes('./drumSeqTypes'), 'Product synth note-range evolve helper must not import Web drum sequencer types');
assert((host.match(/this\.running = false; this\.synthNoteRangeOverrides = \[null, null, null, null\];/g) ?? []).length >= 3, 'Product stop/suspend/dispose must clear synth note-range evolve overrides like Web');
assert(coreEngineHost.includes('this.synthNoteRangeOverrides = [null, null, null, null];'), 'Core-Web stop must clear synth note-range evolve overrides');

for (const token of [
  "value3: requireIntegerInRange(writeOffset, 'writeOffset', -1, 64)",
  "value4: requireIntegerInRange(barIndex, 'barIndex', 0, 0xffffffff)",
  "normalized.value3 = this.optionalFloat(event, 'value3', 0);",
  "normalized.value4 = this.optionalFloat(event, 'value4', 0);",
  "normalized.flags = this.requireUint(event, 'flags', 0, 0xffffffff);",
  'diceWriteOffsetAllowsStep(',
  'sequencer_id == KESSHO_PRODUCT_SEQUENCER_DRUM',
  'event.value4',
]) {
  assert(`${events}\n${worklet}\n${productRatchetEngine}`.includes(token), `Product sequencer dice write-offset wiring is missing ${token}`);
}

for (const token of [
  "methods.ghostNotes && allowsSubLane(config, 'expression') && allowsSubLane(config, 'distance')",
  "methods.probDrift && allowsSubLane(config, 'probability')",
  "methods.ratchetSpray && allowsSubLane(config, 'ratchet')",
]) {
  assert(hostSequencerEvolveConfig.includes(token), `Product sequencer evolve filtering is missing ${token}`);
}

for (const token of [
  'subLaneLengthDrift',
  'subLaneDirectionFlip',
  'createCoreProductSequencerSubLaneConfigEvent',
  'valueOverrides?: SequencerStepValueOverride[]',
  'resizeFieldOverrides(',
  'return (x >>> 0) / 0x1_0000_0000;',
  'changedValueFields',
  'const maxSteps = 16;',
  'getStepValueOverrides: (sequencer, laneIndex) => this.getSequencerStepValueOverrides(sequencer, laneIndex)',
  'createCoreProductSequencerStepValueEvent(sequencer, laneIndex, stepValue.step',
]) {
  assert(`${hostSequencerSubLaneEvolve}\n${host}`.includes(token), `Product sequencer sub-lane evolve wiring is missing ${token}`);
}

for (const token of [
  "addConfig('ratchet', 'expressionDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet)",
  'ratchetSubLaneStepIndex(step, exprSteps)',
  "if (lane === 'expression' && old.ratchet[seqIdx])",
  'clampSequencerRatchet(drRatchetArr[ratchetIdx % drRatchetSteps])',
  'const ratchet = clampSequencerRatchet(ratchetRaw);',
  'const ratchet = clampSequencerRatchet(ratchetValues?.[ratchetIndex]);',
  'export const SEQUENCER_RATCHET_MAX = 8;',
  'const sampleOffset = Math.max(0, Math.round((t - this.ctx.currentTime) * this.ctx.sampleRate));',
  'event.send_delay_a = ratchet > 1u ? 1.0f / static_cast<float>(ratchet) : 1.0f;',
  'padRatchetHoldSeconds(',
  'scaleLeadRatchetPatch(ratchet_patch, normalizedSynthRatchetFactor(synth_ratchet_factor));',
  'Product lead synth ratchet should scale attack',
  'pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);',
  'lead_modules[lead_index]->setTriggerMacros(morph, distance, expression);',
  'ratchetFactor?: number;',
  'ratchetFactor: number = 1',
  'attack: (morphed.attack ?? 0.01) * factor',
]) {
  assert(
    `${hostSequencerAdapter}\n${useEuclideanSequencer}\n${drumSynth}\n${webEngine}\n${coreEngineHost}\n${seqEvolveCore}\n${productSynthSequencer}\n${productSourceModuleTrigger}\n${productSourceVoiceAllocator}\n${productSequencerTests}`.includes(token),
    `Web/Product ratchet sub-lane parity is missing ${token}`,
  );
}

for (const token of [
  'visualLaneFromState(',
  'resolveEuclidPatternParams(',
  'euclideanPatternMask(',
  'defaultClockDivision(laneNumber)',
  'synthEuclideanTempo',
  'drumEuclidTempo',
  "const tempoMultiplier = kind === 'synth' ? synthTempo : drumTempo",
  'hitCountThroughStep(',
  'const fallbackStep = samplesPerStep > 0',
  'if (normalizedNative === 0 && fallbackStep !== 0) return fallbackStep;',
  'const normalizedNative = Math.max(0, Math.floor(nativeHitCount));',
  'input.telemetry?.synthSequencerCurrentSteps?.[laneIndex]',
  'input.telemetry?.drumSequencerCurrentSteps?.[laneIndex]',
  'input.telemetry?.synthSequencerHitCounts?.[laneIndex]',
  'input.telemetry?.drumSequencerHitCounts?.[laneIndex]',
  "input.publish('synthStepPosition'",
  "input.publish('drumStepPosition'",
]) {
  assert(hostSequencerVisuals.includes(token), `Product sequencer visuals bridge is missing ${token}`);
}
assert(
  !hostSequencerVisuals.includes("if (kind === 'synth') return Math.max(normalizedNative, fallbackHitCount);"),
  'Product synth sequencer visuals must trust native emitted-hit telemetry instead of advancing from fallback pattern hits',
);
assert(
  !synthPage.includes('derivedHitCount') &&
    synthPage.includes("playheadMode={laneKind === 'pitch' && activePitchBindingMode === 'sequence' ? 'step' : 'hit'}"),
  'Product synth sub-lane UI must animate from native trigger telemetry, except sequence-bound pitch',
);
for (const token of [
  'assignSourcePresetEndpoints(source, \'pad\'',
  'source.sourcePresetAId = presetA',
  'source.sourcePresetBId = presetB',
  'compileSourcePresetRuntime(sources[i]);',
  'source_preset_patch_valid',
  'source_preset_endpoint_valid',
  'morphSourcePresetPatch(',
  'endpoint_morph_patch_valid',
  'Product pad preset morph endpoint B should reach exact module params',
  'source preset event should refresh compiled patch before trigger',
]) {
  assert(`${snapshot}\n${productSnapshotCpp}\n${productPresetBridge}\n${productSourcePresetBridge}\n${productSourceVoiceAllocator}\n${productSequencerTests}`.includes(token), `Product preset morph endpoint bridge is missing ${token}`);
}
assert(
  productSourceVoiceAllocator.includes('resolveSourcePresetEndpointPatch(') &&
    !productSourceVoiceAllocator.includes('findSourcePreset(') &&
    !productSourceVoiceAllocator.includes('sourcePresetPatch(') &&
    !productSourceVoiceAllocator.includes('drumVoiceMorphPatch('),
  'Product trigger path must use precompiled source preset and morph endpoint patches instead of generated preset lookup/materialization',
);
assert(
  snapshot.includes('swing: 0,') &&
    !snapshot.includes("numberFromState(state, 'swing'") &&
    productSequencerClock.includes('clampFloat(lane.swing, 0.0f, 1.0f)') &&
    !productSequencerClock.includes('transport.swing + lane.swing') &&
    productSequencerTests.includes('transport swing should not alter Product Euclidean lane event count'),
  'Product Euclidean sequencer timing must match Web by using per-lane swing only',
);

for (const token of [
  "const DRUM_AUDIO_SUB_LANES: SubLaneName[] = ['expression', 'morph', 'distance', 'pitch']",
  'filterAudioSubLanes(ctx.enabledSubLanes ?? DRUM_AUDIO_SUB_LANES)',
  "const DRUM_AUDIO_SUB_LANE_KEYS = ['expression', 'morph', 'distance', 'pitch'] as const",
  "methods.pitchWalk && activeLanes.includes('pitch')",
  'resizeSubLaneValuesForSteps(',
  'setSubLaneValues(s, lane, nextValues);',
  'sequencer.morph.enabled && sequencer.morph.values.length > 0',
  'sequencer.distance.enabled && sequencer.distance.values.length > 0',
  'sequencer.pitch.enabled && sequencer.pitch.offsets.length > 0',
  'steps: drRatchetSteps, direction: sequencer.expression.direction',
]) {
  assert(`${drumSeqEvolve}\n${drumSynth}`.includes(token), `Web drum sequencer sub-lane enable filtering is missing ${token}`);
}
assert(
  !drumSynth.includes("['expression', 'morph', 'distance', 'pitch', 'slice', 'reverse']"),
  'Web drum sequencer evolve must not advertise hidden slice/reverse lanes as audio-backed sub-lanes',
);
for (const token of [
  'function applyEuclidEvolveConfigToSequencer(',
  'writeOffset: config.writeOffset,',
  "mutationMode: config.mutationMode,",
  'applyEuclidEvolveConfigToSequencer(',
  'type EvolvedDrumSubLanePatch',
  'type DrumEvolveOverridesPayload = Partial<DrumStepOverrides> & {',
  'function drumEvolvedSubLaneStatePatch(s: SequencerState): DrumEvolvedSubLanePatch',
  'subLaneStates: drumEvolvedSubLaneStatePatch(s)',
]) {
  assert(`${drumSynth}\n${webEngine}`.includes(token), `Web drum evolve config sync is missing ${token}`);
}
for (const token of [
  'export function evolvedDrumPitchOffsetToUiValue(',
  "key === 'pitch' && Array.isArray(values)",
  'drumPitchBaseMidiFromState(state, laneIndex)',
]) {
  assert(`${drumPage}\n${drumPitchSequencer}`.includes(token), `Drum evolve pitch round-trip must preserve UI pitch mode: missing ${token}`);
}
for (const token of [
  'modeledVoiceShape',
  'modeledEnvelopeLevel',
  'modeledSpectrumColumn',
  'modeledWaveform',
  "labelRef.current.textContent = analyserNode ? 'live' : 'modeled'",
]) {
  assert(drumEnvelopeVisualizer.includes(token), `Product drum visualizer no-analyser animation path is missing ${token}`);
}

for (const token of [
  "const GENERIC_VALUE_SYNTH_SUB_LANES: SynthSubLane[] = ['expression', 'morph', 'distance']",
  "const LENGTH_DRIFT_SYNTH_SUB_LANES: SynthSubLane[] = ['pitch', 'expression', 'morph', 'distance']",
  'const newLen = clamp(vals.length + dir, 2, 16)',
  "methods.pitchWalk && enabledSubs.has('pitch') && ctx.pitchMode === 'noteRange'",
  "const activeDirLanes = DIRECTION_LANES.filter(l => enabledSubs.has(l) && getValues(next, l) !== null)",
  "const directionGravityLanes = DIRECTION_LANES.filter(l => enabledSubs.has(l) && getValues(next, l) !== null)",
]) {
  assert(synthSeqEvolve.includes(token), `Web synth sequencer evolve filtering is missing ${token}`);
}
assert(
  coreEngineHost.includes('const uiEnabledSubLanes = this.synthSubLaneEnabled[laneIndex] ?? {};') &&
    coreEngineHost.includes("subLane === 'probability' || subLane === 'ratchet' || uiEnabledSubLanes[subLane] === true"),
  'Core-Web synth evolve filtering must only enable audio sub-lanes that the UI enabled',
);
for (const token of [
  'type EvolvedSubLanePatch',
  'function synthEvolvedSubLaneStatePatch(overrides: SynthLaneOverrides): EvolvedSubLanePatch',
  'const subLaneStates = synthEvolvedSubLaneStatePatch(offsetOverrides)',
  'const subLaneStates = synthEvolvedSubLaneStatePatch(restored)',
  'const subLaneStates = synthEvolvedSubLaneStatePatch(newOv)',
]) {
  assert(webEngine.includes(token), `Web synth evolve visible sub-lane state sync is missing ${token}`);
}
for (const token of [
  'type CoreEvolvedSubLanePatch',
  'function synthEvolvedSubLaneStatePatch(overrides: SynthLaneOverrides): CoreEvolvedSubLanePatch',
  'const subLaneStates = synthEvolvedSubLaneStatePatch(offsetOverrides)',
  'const subLaneStates = synthEvolvedSubLaneStatePatch(restored)',
  'const subLaneStates = synthEvolvedSubLaneStatePatch(next)',
]) {
  assert(coreEngineHost.includes(token), `Core-Web synth evolve visible sub-lane state sync is missing ${token}`);
}
for (const lane of ['pitch', 'expression', 'morph', 'distance']) {
  assert(
    coreEngineHost.includes(`laneSubLanes.${lane} === true`) &&
      !coreEngineHost.includes(`laneSubLanes.${lane} !== false`),
    `Core-Web preview must treat ${lane} sub-lane state as opt-in like Product/Web live scheduling`,
  );
}

for (const token of [
  'MAX_SNAPSHOT_DIFF_EVENTS',
  'buildSnapshotDiff(',
  'assetRefsChanged(previous.assetRefs, next.assetRefs)',
  'appendSourceParamDiffs(events, previous.sources, next.sources)',
  "appendSequencerLaneDiffs(events, 'synth', previous.synthLanes, next.synthLanes, options.forceSequencerClockRejoin === true)",
  'SequencerLaneInitialStartDelaySeconds',
  'SequencerLaneTempoMultiplier',
  'SequencerLaneMorph',
  'SequencerLaneDistance',
  'SequencerLaneExpression',
  'SourceLeadEnvelopeOverrideEnabled',
  'SourceLeadAlgorithmPresetAEnabled',
  'createCoreProductParamEvent(',
  'createCoreProductSourcePresetEvent(',
  'shouldForwardCoreProductRngDiffs(',
  'dirty-diff-event-budget',
]) {
  assert(runtimeAdapter.includes(token), `CoreProductRuntimeAdapter is missing ${token}`);
}
for (const token of ['FxDynamicsModSlowWow', 'FxDynamicsModNoiseAlias']) {
  assert(
    generatedParams.includes(token) &&
      runtimeAdapter.includes('KESSHO_PRODUCT_PARAMS') &&
      runtimeAdapter.includes("param.path.startsWith('fx.')"),
    `CoreProductRuntimeAdapter generated FX diff coverage is missing ${token}`,
  );
}

for (const token of [
  'class CoreProductAssetRegistrar',
  'registeredAssetIds',
  'pianoAssetPromises',
  'defaultSoundscapeAssetPromises',
  'registeredAssetDecodedBytes',
  'registerAsset(asset: DecodedCoreProductAsset): void',
  'unregisterAsset(assetId: number): void',
  'this.runtime.unregisterAsset(assetId)',
  'getDecodedCoreProductAssetByteLength(asset)',
  'registeredDecodedAssetByteLength(): number',
  'hasMissingDefaultAssetsForState(): boolean',
  'ensureDefaultAssetsForState(): Promise<void>',
  'ensureDefaultPianoAsset(): Promise<void>',
  'ensurePianoAssetsForState(): Promise<void>',
  'ensurePianoAssetForMidi(midiNote: number, variant',
  'ensurePianoAssetForNote(midiNote: number, velocity: number): Promise<void>',
  'choosePianoSampleVariant',
  'getCoreProductPianoPreloadAssetDescriptors(this.readSliderState())',
  'getCoreProductPianoAssetIdForMidiVariant(midiNote, variant)',
  'ensureDefaultSoundscapeAsset(): Promise<void>',
  'ensureSoundscapeAssetsForState(): Promise<void>',
  'getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState())',
  'decodeCoreProductAsset(',
  'birds2Enabled',
  'insects2Enabled',
  'CORE_PRODUCT_ASSET_FLAGS.piano',
  'CORE_PRODUCT_ASSET_FLAGS.loop | CORE_PRODUCT_ASSET_FLAGS.soundscape',
]) {
  assert(hostAssetRegistrar.includes(token), `CoreProductAssetRegistrar is missing ${token}`);
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
    productRuntimeLifecycleSurface.includes('useProductRuntimeRecordingRuntime(options.audioEngineRuntimeMode)') &&
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
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeTelemetry'") &&
    !app.includes('useSelectedAudioEngineRuntimeTelemetry({') &&
    app.includes('selectedRuntimeSupportsRangeKey') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCapabilities'") &&
    !app.includes("from './ui/useSelectedAudioEngineTelemetrySurface'") &&
    app.includes('const dualModeSupported = !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeTelemetry({') &&
    productRuntimeTelemetry.includes('useSelectedAudioEngineRuntimeTelemetry(options)') &&
    selectedRuntimeTelemetry.includes('useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode)') &&
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
for (const token of [
  'drumStepOverridesForEngineRestore(',
  'drumPitchUiValuesToEngineOffsets(',
  'drumPitchBaseMidiFromState(state, laneIdx)',
  'drumPitchSettings,',
  'preset.state',
  'synthStepOverridesForEngineRestore(',
  'setSelectedSequencerPresetHomeSnapshots();',
  'synthPitchOverridesForEngine(',
  'rangeOverridesFromSubLaneStates(',
  'restoreSequencerSubLaneStates(preset.drumSubLaneStates, preset.drumStepOverrides)',
  'restoreSequencerSubLaneStates(preset.synthSubLaneStates, preset.synthStepOverrides)',
  'inferLegacySequencerSubLaneStatesFromOverrides(overrides)',
  '...(inferred[laneIndex] ?? {})',
  '...(states[laneIndex] ?? {})',
  'scaleDegreeToSemitone(degree, scaleIntervals)',
  "pitch: sanitizeSequencerSubLaneState('pitch', partial.pitch),",
  "slice: sanitizeSequencerSubLaneState('slice', partial.slice),",
  'slice: states[index]?.slice.enabled === true,',
]) {
  assert(presetSequencerRestore.includes(token), `Preset sequencer restore hook must send engine-ready sequencer overrides before mounted page effects: missing ${token}`);
}
assert(
  app.includes("from './ui/usePresetRestoreRuntimeSurface'") &&
    app.includes('usePresetRestoreRuntimeSurface({') &&
    !app.includes("import { usePresetSequencerRestore") &&
    !app.includes('usePresetSequencerRestore({') &&
    !app.includes('setSelectedSequencerPresetHomeSnapshots();') &&
    app.includes('setProductDrumEuclidClockDivs,') &&
    app.includes('setProductSequencerPresetHomeSnapshots,') &&
    !app.includes('setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs') &&
    presetRestoreRuntimeSurface.includes('type ProductPresetSequencerRestoreOptions = Omit<PresetSequencerRestoreOptions, SelectedPresetSequencerSetterKey>') &&
    presetRestoreRuntimeSurface.includes('const restoreEvolveConfigs = usePresetSequencerRestore({') &&
    presetRestoreRuntimeSurface.includes('setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs') &&
    presetRestoreRuntimeSurface.includes('setSelectedSequencerPresetHomeSnapshots: setProductSequencerPresetHomeSnapshots') &&
    !app.includes('function drumStepOverridesForEngineRestore(') &&
    !app.includes('function synthStepOverridesForEngineRestore('),
  'App must delegate preset sequencer selected-runtime restore sync to usePresetRestoreRuntimeSurface',
);
assert(
  selectedEvolveOverrideCallbacks.includes('defaultEvolvedSubLaneStates(Math.max(4, laneIndex + 1))') &&
    selectedEvolveOverrideCallbacks.includes('mergeEvolvedSubLanePatch('),
  'selected evolved override callbacks must preserve fallback evolved sub-lane state merging',
);
for (const token of [
  'export function drumPitchBaseMidiFromState(',
  'export function drumPitchUiValuesToEngineOffsets(',
  'if (settings.mode === \'noteRange\') return null;',
  'scaleQuantize = false',
  'scaleDegreeToSemitone(degree, scaleIntervals) - baseMidi',
]) {
  assert(drumPitchSequencer.includes(token), `Shared drum sequencer pitch conversion is missing ${token}`);
}

for (const [surfaceName, surface, token] of [
  ['Product host', host, "this.captureSequencerHomeLanes('synth', false, true)"],
  ['Product host', host, "this.captureSequencerHomeLanes('drum', false, true)"],
  ['Product host', host, "captureSynthEuclidLaneHome(laneIndex: number"],
  ['Product host', host, "captureDrumEuclidLaneHome(laneIndex: number"],
  ['Core-Web host', coreEngineHost, 'this.drumHomeStepOverrides = cloneCoreDrumStepOverrides(this.drumStepOverrides);'],
  ['Core-Web host', coreEngineHost, 'this.captureCurrentSynthLaneHome(index)'],
  ['Core-Web host', coreEngineHost, 'captureSynthEuclidLaneHome(laneIndex: number'],
  ['Core-Web host', coreEngineHost, 'captureDrumEuclidLaneHome(laneIndex: number'],
  ['Web engine', webEngine, 'this.drumSynth.captureEuclidPresetHome();'],
  ['Web engine', webEngine, 'this.captureSynthPresetHome(laneIndex)'],
  ['Web engine', webEngine, 'captureSynthEuclidLaneHome(laneIndex: number'],
  ['Web engine', webEngine, 'captureDrumEuclidLaneHome(laneIndex: number'],
  ['Web drum synth', drumSynth, 'captureEuclidPresetHome(): void'],
  ['Web drum synth', drumSynth, 'captureEuclidLaneHome(laneIndex: number'],
  ['Web drum synth', drumSynth, 'resetEuclidLaneToHome(laneIndex: number): boolean'],
  ['Web drum synth', drumSynth, 'pendingEuclidPresetHomeCapture'],
]) {
  assert(surface.includes(token), `${surfaceName} must force-capture preset home snapshots: missing ${token}`);
}
for (const [surfaceName, surface, token] of [
  ['Web engine', webEngine, 'if (this.drumSynth?.resetEuclidLaneToHome(laneIndex))'],
  ['Web drum synth', drumSynth, 'pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null'],
  ['Web drum synth', drumSynth, 'sequencer.pitch.steps = steps;'],
  ['Web drum synth', drumSynth, 'sequencer.pitch.direction = pitchState.direction;'],
]) {
  assert(surface.includes(token), `${surfaceName} must preserve stopped and running drum pitch home state: missing ${token}`);
}
for (const [surfaceName, surface] of [
  ['Drum page', drumPage],
  ['Synth page', synthPage],
]) {
  assert(
    surface.includes('pendingSequenceHomeCaptureRef.current = laneIdx;') &&
      surface.includes('captureEvolveHome?.(laneIndex);'),
    `${surfaceName} must recapture lane evolve home after loading a sequence preset`,
  );
}
assert(
  synthPageSequencerBridge.includes('captureSelectedSynthEuclidLaneHome(laneIdx, synthSubLaneStatesRef.current?.[laneIdx]?.pitch)') &&
    drumPageSequencerBridge.includes('captureSelectedDrumEuclidLaneHome(') &&
    drumPageSequencerBridge.includes('drumPitchSettingsRef.current?.[laneIdx]') &&
    drumPageSequencerBridge.includes('drumSubLaneStatesRef.current?.[laneIdx]?.pitch'),
  'App must wire sequence preset home capture through ProductEnginePort-aware synth and drum helpers',
);
assert(
  app.includes("from './ui/useProductRuntimePageSurface'") &&
    app.includes('useProductRuntimePageSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeSurface'") &&
    !app.includes('useSelectedAudioEnginePageRuntimeSurface({') &&
    productRuntimePageSurface.includes('useProductRuntimePageBridgeOptions,') &&
    productRuntimePageSurface.includes('return useSelectedAudioEnginePageRuntimeBridges(pageRuntimeBridgeOptions)') &&
    productRuntimePageBridgeOptions.includes('useProductRuntimePageTelemetryProps(telemetry)') &&
    productRuntimePageBridgeOptions.includes('useProductRuntimePageSequencerProps(sequencer)') &&
    productRuntimePageBridgeOptions.includes('useProductRuntimePageControlProps(control)') &&
    productRuntimePageBridgeOptions.includes('telemetry: ProductRuntimePageTelemetryProps') &&
    !productRuntimePageBridgeOptions.includes('useSelectedAudioEnginePageRuntimeBridgeOptions') &&
    productRuntimePageTelemetryProps.includes('export type ProductRuntimePageTelemetryProps = {') &&
    productRuntimePageTelemetryProps.includes('productRuntimeDebugAnalysers: ProductRuntimePageDebugAnalysers') &&
    !productRuntimePageTelemetryProps.includes('ProductRuntimePageTelemetryProps = SelectedAudioEnginePageTelemetryRuntimeProps') &&
    productRuntimePageTelemetryProps.includes('return useSelectedAudioEnginePageTelemetryRuntimeProps(options)') &&
    productRuntimePageSequencerProps.includes('export type ProductRuntimePageSequencerProps = {') &&
    productRuntimePageSequencerProps.includes('captureProductSynthEuclidLaneHome: (laneIdx: number, pitchState?: SubLaneState) => void') &&
    productRuntimePageSequencerProps.includes('drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>') &&
    productRuntimePageSequencerProps.includes('setProductSynthPitchBindingModes: (modes: PitchBindingMode[]) => void') &&
    productRuntimePageSequencerProps.includes('captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome') &&
    productRuntimePageSequencerProps.includes('setSelectedDrumStepOverrides: setProductDrumStepOverrides') &&
    !productRuntimePageSequencerProps.includes('ProductRuntimePageSequencerProps = SelectedAudioEnginePageSequencerRuntimeProps') &&
    app.includes('captureProductSynthEuclidLaneHome,') &&
    app.includes('setProductSynthPitchBindingModes,') &&
    !app.includes('captureProductSynthEuclidLaneHome: captureSelectedSynthEuclidLaneHome') &&
    !app.includes('setProductSynthPitchBindingModes: setSelectedSynthPitchBindingModes') &&
    productRuntimePageControlProps.includes('export type ProductRuntimePageControlProps = {') &&
    productRuntimePageControlProps.includes('preloadProductRuntime: () => Promise<unknown>') &&
    productRuntimePageControlProps.includes('productRuntimeManualTriggers: ProductRuntimeManualTriggers') &&
    !productRuntimePageControlProps.includes('ProductRuntimePageControlProps = Omit<') &&
    productRuntimePageControlProps.includes('preloadSelectedAudioEngine: preloadProductRuntime') &&
    !productRuntimePageSurface.includes('productEngine') &&
    !productRuntimePageSurface.includes('selectedProductRuntime') &&
    !productRuntimePageSurface.includes('referenceAudioEngineDebug') &&
    !productRuntimePageSurface.includes("from './useSelectedAudioEnginePageRuntimeSurface'") &&
    app.includes('sequencer: {') &&
    app.includes('control: {') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageSequencerRuntimeProps'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageControlRuntimeProps'") &&
    !app.includes('...pageSequencerRuntimeProps') &&
    !app.includes('...pageControlRuntimeProps') &&
    app.includes('onStepOverridesChange={productPageRuntimeSurface.synthPageSequencerBridge.onStepOverridesChange}') &&
    app.includes('captureEvolveHome={productPageRuntimeSurface.synthPageSequencerBridge.captureEvolveHome}') &&
    !app.includes("from './ui/useSynthPageSequencerBridge'") &&
    !app.includes('useSynthPageSequencerBridge({') &&
    selectedPageRuntimeBridges.includes('useSynthPageSequencerBridge(options)') &&
    selectedPageRuntimeBridges.includes('useDrumPageSequencerBridge(options)') &&
    selectedPageRuntimeBridges.includes('useDrumPageRuntimeBridge(options)') &&
    selectedPageSequencerRuntimeProps.includes('captureSelectedSynthEuclidLaneHome') &&
    selectedPageSequencerRuntimeProps.includes('setSelectedSynthPitchSettings') &&
    selectedPageSequencerRuntimeProps.includes('synthStepOverridesRef') &&
    selectedPageControlRuntimeProps.includes('onRequestPlaybackStart') &&
    selectedPageControlRuntimeProps.includes('productRuntimeManualTriggers') &&
    selectedPageControlRuntimeProps.includes('setSelectedSynthStepPositionCallback') &&
    selectedPageRuntimeBridgeOptions.includes('SelectedAudioEnginePageRuntimeBridgeOptionGroups') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageSequencerRuntimeProps(sequencer)') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageControlRuntimeProps(control)') &&
    selectedPageRuntimeBridgeOptions.includes('...pageSequencerRuntimeProps') &&
    selectedPageRuntimeBridgeOptions.includes('...pageControlRuntimeProps') &&
    selectedPageRuntimeSurface.includes('useSelectedAudioEnginePageRuntimeBridgeOptions(options)') &&
    selectedPageRuntimeSurface.includes('useSelectedAudioEnginePageRuntimeBridges(selectedPageRuntimeBridgeOptions)') &&
    !app.includes('setSelectedSynthStepOverrides({') &&
    !app.includes('captureEvolveHome={(laneIdx) => captureSelectedSynthEuclidLaneHome('),
  'App must delegate Synth page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges',
);
assert(
  app.includes("from './ui/useProductRuntimePageSurface'") &&
    app.includes('useProductRuntimePageSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeSurface'") &&
    !app.includes('useSelectedAudioEnginePageRuntimeSurface({') &&
    app.includes('sequencer: {') &&
    app.includes('control: {') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageSequencerRuntimeProps'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageControlRuntimeProps'") &&
    !app.includes('...pageSequencerRuntimeProps') &&
    !app.includes('...pageControlRuntimeProps') &&
    app.includes('onStepOverridesChange={productPageRuntimeSurface.drumPageSequencerBridge.onStepOverridesChange}') &&
    app.includes('captureEvolveHome={productPageRuntimeSurface.drumPageSequencerBridge.captureEvolveHome}') &&
    !app.includes("from './ui/useDrumPageSequencerBridge'") &&
    !app.includes('useDrumPageSequencerBridge({') &&
    !app.includes("from './ui/useDrumPageRuntimeBridge'") &&
    !app.includes('useDrumPageRuntimeBridge({') &&
    selectedPageSequencerRuntimeProps.includes('captureSelectedDrumEuclidLaneHome') &&
    selectedPageSequencerRuntimeProps.includes('setSelectedDrumStepOverrides') &&
    selectedPageSequencerRuntimeProps.includes('drumPitchSettingsRef') &&
    selectedPageControlRuntimeProps.includes('preloadSelectedAudioEngine') && productRuntimePageControlProps.includes('preloadProductRuntime') &&
    selectedPageControlRuntimeProps.includes('setSelectedDrumTriggerCallback') &&
    selectedPageControlRuntimeProps.includes('setSelectedDrumStepPositionCallback') &&
    selectedPageRuntimeBridgeOptions.includes('SelectedAudioEnginePageRuntimeBridgeOptionGroups') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageSequencerRuntimeProps(sequencer)') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageControlRuntimeProps(control)') &&
    !app.includes('setSelectedDrumStepOverrides(overrides);') &&
    !app.includes('captureEvolveHome={(laneIdx) => captureSelectedDrumEuclidLaneHome('),
  'App must delegate Drum page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges',
);
for (const [surfaceName, surface, token] of [
  ['Product home payload', hostSequencerHome, 'pitchSettings?: SequencerPitchSettings | null'],
  ['Product home payload', hostSequencerHome, 'payload.pitchSettings = homePitchSettings'],
  ['Product host', host, 'drumPitchSettings?: SequencerPitchSettings | null'],
  ['Core-Web host', coreEngineHost, 'private drumHomePitchSettings'],
  ['Web engine', webEngine, 'private drumHomePitchSettings'],
  ['Web drum synth', drumSynth, 'pitchSettings?: (SequencerPitchSettings | null)[]'],
  ['Drum page', drumPage, 'normalizeSequencerPitchSettings(data.pitchSettings[laneIndex]'],
  ['Synth page', synthPage, 'normalizeSequencerPitchSettings(data.pitchSettings[laneIndex]'],
]) {
  assert(surface.includes(token), `${surfaceName} must preserve pitch settings when reset restores a captured evolve home: missing ${token}`);
}

for (const token of [
  'function cloneDrumStepOverrides(',
  'function drumStepOverrideSubLaneStatePatch(',
  'private drumHomeStepOverrides: DrumStepOverrides = createEmptyDrumStepOverrides();',
  'this.drumHomeStepOverrides = cloneDrumStepOverrides(this.pendingStepOverrides);',
  'private publishPendingDrumEvolveOverrides(',
  'this.pendingDrumEvolveOverridesCallback?.(laneIndex, {',
  'const subLaneStates = drumStepOverrideSubLaneStatePatch(overrides, laneIndex, fallback);',
  'if (this.drumSynth?.diceEuclidLane(laneIndex, intensity))',
  'this.pendingStepOverrides = next;',
  'this.drumHomeStepOverrides = cloneDrumStepOverrides(next);',
]) {
  assert(webEngine.includes(token), `Web drum dice/reset must work before DrumSynth is created: missing ${token}`);
}
for (const token of [
  'type CoreDrumEvolvedSubLanePatch',
  'function drumStepOverrideSubLaneStatePatch(',
  'restored.expressionDirection[index] = home.expressionDirection?.[index] ?? null;',
  'restored.expressionRanges![index] = home.expressionRanges?.[index] ?? null;',
  'const subLaneStates = drumStepOverrideSubLaneStatePatch(restored, index, previous);',
  'subLaneStates: drumStepOverrideSubLaneStatePatch(next, index),',
]) {
  assert(coreEngineHost.includes(token), `Core-Web drum dice/reset visible sub-lane state sync is missing ${token}`);
}
for (const token of [
  'probability: Array.from({ length: steps }, () => Math.max(0, Math.min(1, 0.55 + rng() * 0.45)))',
  'ratchet: Array.from({ length: steps }, () => rng() < 0.2 * inten ? 2 + Math.floor(rng() * 3) : 1)',
]) {
  assert(drumSynth.includes(token), `Web DrumSynth dice must emit Product-style trigger probability/ratchet state: missing ${token}`);
}

for (const [surfaceName, surface, token] of [
  ['Synth evolve core', synthSeqEvolve, 'trigCondition: TrigCondition[] | null;'],
  ['Synth evolve core', synthSeqEvolve, 'trigCondition: ov.trigCondition ?'],
  ['Web synth engine', webEngine, 'this.synthStepOverrides.trigCondition[laneIndex] = ov.trigCondition'],
  ['Core-Web synth host', coreEngineHost, 'this.synthStepOverrides.trigCondition[laneIndex] = ov.trigCondition'],
  ['Web drum evolve core', drumSeqEvolve, 'trigCondition: s.trigger.trigCondition.map'],
  ['Web drum synth', drumSynth, 'partial.trigCondition![laneIndex]'],
  ['Web drum synth', drumSynth, 'partial.slice![laneIndex]'],
  ['Web drum synth', drumSynth, 'partial.reverse![laneIndex]'],
  ['Product synth UI payload', hostSequencerUiState, 'trigCondition: lane.trigCondition'],
  ['Selected evolved drum callback', selectedEvolveOverrideCallbacks, "const arrayKeys = ['probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'slice', 'reverse'] as const;"],
  ['Selected evolved synth callback', selectedEvolveOverrideCallbacks, "const mergeKeys = ['expression', 'morph', 'distance', 'probability', 'ratchet', 'trigCondition', 'pitch'] as const;"],
  ['DrumPage evolved merge', drumPage, "const keys = ['probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'slice', 'reverse'] as const;"],
  ['SynthPage evolved merge', synthPage, "const keys = ['expression', 'morph', 'distance', 'probability', 'ratchet', 'trigCondition', 'pitch'] as const;"],
]) {
  assert(surface.includes(token), `${surfaceName} must keep reset/evolve home payload fields aligned: missing ${token}`);
}

for (const [surfaceName, surface, token] of [
  ['Product range payload', hostSequencerRangePayload, 'payload[rangeField.payloadKey] = range;'],
  ['Product range payload', hostSequencerRangePayload, "valueMode: 'range'"],
  ['Product home payload', hostSequencerHome, 'applyCoreProductRangeSubLanePatch(subLaneStates, state.values);'],
  ['Product home payload', hostSequencerHome, 'addCoreProductRangePayload(payload, sequencer, laneIndex, state.values);'],
  ['Product UI payload', hostSequencerUiState, "addCoreProductRangePayload(payload, 'synth', laneIndex, valueOverrides);"],
  ['Product UI payload', hostSequencerUiState, "addCoreProductRangePayload(payload, 'drum', laneIndex, valueOverrides);"],
  ['Product sub-lane evolve', hostSequencerSubLaneEvolve, 'result.subLaneStates[lane] = { enabled: true, steps: config.steps, direction };'],
  ['Product host sub-lane evolve', host, 'addCoreProductRangePayload(payload, sequencer, laneIndex, values[laneIndex] ?? []);'],
  ['Selected evolved drum callback', selectedEvolveOverrideCallbacks, "const rangeKeys = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;"],
  ['DrumPage evolved merge', drumPage, "const rangeKeys = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;"],
  ['SynthPage evolved merge', synthPage, "const rangeKeys = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;"],
]) {
  assert(surface.includes(token), `${surfaceName} must preserve Product range-mode sequencer payloads: missing ${token}`);
}

for (const token of [
  'masked Product UI capture should honor probability override masks',
  'masked Product UI capture should honor ratchet override masks',
  'masked Product UI capture should honor trig-condition override masks',
  'manual dice home capture should preserve dense trigger probabilities',
  'manual dice home capture should preserve dense trigger ratchets',
  'synth reset-home payload should preserve trigger probability',
  'synth reset-home payload should preserve trigger ratchet',
  'synth reset-home payload should preserve trigger condition',
  'drum reset-home payload should preserve lane-scoped trigger probability',
  'drum reset-home payload should preserve lane-scoped trigger ratchet',
  'drum reset-home payload should preserve lane-scoped trigger condition',
]) {
  assert(sequencerEvolveRegression.includes(token), `Product evolve regression must pin trigger step-value reset-home capture: missing ${token}`);
}

for (const token of [
  "lane.barReset = String(state?.synthEuclidJoinPolicy ?? 'bar') === 'bar';",
  "lane.barReset = String(state?.drumEuclidJoinPolicy ?? 'bar') === 'bar';",
  'function padHoldSecondsFromState(',
  'return attack + decay + Math.max(0.1, (attack + decay) * 0.5);',
  'coreProductSynthSequencerHoldSecondsFromState(',
  'lane.holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, sourceId, lane.holdSeconds);',
]) {
  assert(`${snapshot}\n${sequencerHold}`.includes(token), `Product snapshot must preserve web sequencer timing/hold policy: missing ${token}`);
}

assert(
  /private patchAdapterState[\s\S]*if \(loadSnapshot\) \{\s*this\.applyLatestSnapshotUpdate\(\);/.test(host),
  'core-product host adapter patches must use the dirty snapshot diff path',
);

for (const token of [
  'class CoreProductArrangementScheduler',
  'createSchedulerHarmonyState',
  'scheduleHarmonyTicks',
  'scheduleNextHarmonyTick',
  'onHarmonyTick(isPhraseBoundary',
  'triggerPadChord',
  'startLeadMelody',
  'scheduleLeadPhrase',
  'getTimeUntilNextBoundaryWall',
  'getCurrentClockIndexWall',
  'updateHarmonyState',
  'getScaleNotesInRange',
  'createCoreProductManualNoteEvent',
  "boundedNumber(this.state, 'lead1Density', 0.5, 0.1, 12)",
  'const timingSeconds = (this.rng() * phraseMs) / 1000;',
  'pickChordWeightedNote(this.rng, availableNotes',
  'this.scheduleNote(delaySeconds',
]) {
  assert(arrangementScheduler.includes(token), `Product arrangement scheduler must preserve web timing/music intent: missing ${token}`);
}

assert(
  !snapshot.includes('appendCoreProductArrangementLanes') && !snapshot.includes('arrangementStepValues'),
  'Product chord/random arrangement must not be flattened into hidden snapshot lanes',
);

for (const token of [
  'CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES',
  'CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID',
  'getCoreProductPianoPreloadAssetDescriptors',
  'getCoreProductSoundscapeAssetDescriptorsForState',
  'Alps Birds_441_m_normalized.ogg',
  'Fujian Birds 2_441_m_normalized.ogg',
  'Alps Birds 2_noiseremoval_441_m.ogg',
  'Ghetary-Waves-Rocks_cl-normalized.ogg',
  "state?.birds2Enabled === true",
  "state?.insectsEnabled === true || state?.insects2Enabled === true",
]) {
  assert(assets.includes(token), `core-product assets are missing ${token}`);
}

for (const token of [
  'const SNAPSHOT_BYTES = 28352',
  'const SOURCE_BYTES = 3320',
  'const LANE_BYTES = 92',
  'KESSHO_PRODUCT_DRUM_PARAM_COUNT',
  'KESSHO_PRODUCT_DRUM_VOICE_COUNT',
  'drumDelayFilterHz',
  'assetRefs: number[]',
  'soundscape: ProductSoundscapeSnapshot',
  'sourcePresetAId: number',
  'sourcePresetBId: number',
  'leadEnvelopeOverrideEnabled: boolean',
  'leadAlgorithmPresetAEnabled: boolean',
  'padOverrideCount: number',
  'padOverrideIndices: number[]',
  'padOverrideValues: number[]',
  'leadOverrideCount: number',
  'leadOverrideIndices: number[]',
  'leadOverrideValues: number[]',
  'drumOverrideCount: number',
  'drumOverrideIndices: number[]',
  'drumOverrideValues: number[]',
  'drumVoicePresetAIds: number[]',
  'drumVoicePresetBIds: number[]',
  'drumVoiceMorphs: number[]',
  'const soundscapeAssets = soundscapeSource?.enabled',
  'getCoreProductSoundscapeAssetDescriptorsForState(sliderState)',
  'assetRefs: soundscapeAssets.map((asset) => asset.assetId)',
  'assetRefLevels',
  'u32(snapshot.assetRefs[i] ?? 0)',
  'u32(Math.min(soundscape.textureParamCount, SOUNDSCAPE_TEXTURE_PARAM_COUNT))',
  'f32(soundscape.moduleParams[paramIndex] ?? 0)',
  'rejectLegacyExactBridge',
  'exact patch fields are no longer accepted by web snapshot encoding',
  'validateSparseOverride',
  'u32(padOverrideCount)',
  'source.padOverrideIndices[paramIndex]',
  'source.padOverrideValues[paramIndex]',
  'u32(leadOverrideCount)',
  'source.leadOverrideIndices[paramIndex]',
  'source.leadOverrideValues[paramIndex]',
  'u32(drumOverrideCount)',
  'source.drumOverrideIndices[paramIndex]',
  'source.drumOverrideValues[paramIndex]',
  'tempoMultiplier: number',
  'initialStartDelaySeconds: number',
  'defaultSequencerClockDivision(laneNumber)',
  "lane.tempoMultiplier = clamp(numberFromState(state, 'synthEuclideanTempo', 1), 0.25, 12)",
  "lane.tempoMultiplier = clamp(numberFromState(state, 'drumEuclidTempo', 1), 0.25, 4)",
  'f32(lane.tempoMultiplier)',
  'f32(lane.initialStartDelaySeconds)',
  'CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY',
  'initialStartDelaySecondsFromState',
  'getTransportMetrics',
  'rngSeedFromState',
  'rngStateFromState',
  'hashSeedMaterial',
  'sourcePresetId',
  'soundscapePresetIdFromState',
  'endpointPresetId',
  'source.presetId =',
  'ProductGranularVoiceSnapshot',
  'granularVoiceFromState',
  'granularLegacyPitchModeId',
  'granularVoices: [1, 2, 3, 4].map',
  'u32(bool(snapshot.fx.granularEnabled))',
  'f32(snapshot.fx.granularFeedback)',
  'f32(snapshot.fx.granularTimingRandomness)',
  'spectralFreezeEnabled: boolean',
  'spectralFreezeActive: boolean',
  'spectralFreezePhaseJitter: number',
  'dynamicsEnabled: boolean',
  'dynamicsCharacterMix: number',
  'dynamicsModSlowWow: number',
  'dynamicsEndCompProgramRelease: number',
  'sidechainEnabled: boolean',
  'sidechainPad1Target: number',
  'u32(bool(snapshot.fx.spectralFreezeEnabled))',
  'f32(snapshot.fx.spectralFreezePhaseJitter)',
  'u32(bool(snapshot.fx.dynamicsEnabled))',
  'f32(snapshot.fx.dynamicsEndCompProgramRelease)',
  'f32(snapshot.fx.dynamicsModNoiseAlias)',
  'u32(bool(snapshot.fx.sidechainEnabled))',
  'f32(snapshot.fx.sidechainReverbTarget)',
]) {
  assert(snapshotSurface.includes(token), `core-product snapshot/encoder is missing ${token}`);
}

for (const token of [
  'SNAPSHOT_AUTHORITY: PRODUCT_CORE_LEAD_OVERRIDE_BRIDGE',
  'function exactLeadParamsFromState(state: Record<string, unknown> | undefined, leadIndex: 0 | 1): number[]',
  'function leadEnvelopeOverrideFromState(',
  'function applyLeadDistanceParams(',
  'function assignLeadEnvelopeOverrideFields(',
  'function leadAlgorithmPresetAEnabledFromState(',
  'function assignLeadAlgorithmOverrideFields(',
  'function reconstructedLeadParamsFromPresetIds(',
  'function exactLeadPatchFromState(',
  'leadOverrideCount',
  'leadOverrideIndices',
  'leadOverrideValues',
  'KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES',
  'KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES',
  'KESSHO_PRODUCT_SOURCE_PRESETS',
]) {
  assert(productLeadPatch.includes(token), `CoreProductLeadPatch is missing ${token}`);
}
for (const token of [
  'SNAPSHOT_AUTHORITY: PRODUCT_CORE_PAD_OVERRIDE_BRIDGE',
  'function exactPadParamsFromState(state: Record<string, unknown> | undefined, padIndex: 0 | 1): number[]',
  'function applyPadDistanceParams(',
  'function reconstructedPadParamsFromPresetIds(',
  'function exactPadPatchFromState(',
  'padOverrideCount',
  'padOverrideIndices',
  'padOverrideValues',
  'KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES',
  'KESSHO_PRODUCT_SOURCE_PRESETS',
]) {
  assert(productPadPatch.includes(token), `CoreProductPadPatch is missing ${token}`);
}
for (const token of [
  'SNAPSHOT_AUTHORITY: PRODUCT_CORE_DRUM_OVERRIDE_BRIDGE',
  'function exactDrumParamsFromState(',
  'function reconstructedDrumParamsFromPresetIds(',
  'function exactDrumPatchFromState(state:',
  'drumOverrideCount',
  'drumOverrideIndices',
  'drumOverrideValues',
  'DRUM_PARAM_MASTER_LEVEL',
  'DRUM_PARAM_REVERB_SEND',
  'KESSHO_PRODUCT_DRUM_VOICE_PRESETS',
  'KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES',
]) {
  assert(productDrumPatch.includes(token), `CoreProductDrumPatch is missing ${token}`);
}
for (const token of [
  'SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID',
  'KESSHO_PRODUCT_SOURCE_PRESETS',
  'KESSHO_PRODUCT_DRUM_VOICE_PRESETS',
  'function drumVoicePresetId(voiceIndex: number, presetName: unknown): number',
  'function drumVoicePresetIdsFromState(state: Record<string, unknown> | undefined, endpoint:',
]) {
  assert(productPresetIds.includes(token), `CoreProductPresetIds is missing ${token}`);
}

for (const token of [
  'macroMorph',
  'macroDistance',
  'macroExpression',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS',
  'KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES',
  '"params"',
]) {
  assert(generatedSchema.includes(token), `generated Product Core source preset schema is missing ${token}`);
}
assert(!generatedSchema.includes('"profile"'), 'generated Product Core source preset schema must not carry profile fallback metadata');

for (const token of [
  'createCoreProductStartEvent',
  'createCoreProductStopEvent',
  'createCoreProductManualNoteEvent',
  'createCoreProductDrumTriggerEvent',
  'createCoreProductSourcePresetEvent',
  'createCoreProductJourneyEvent',
  'createCoreProductJourneyStateEvent',
  'createCoreProductParamEvent',
  'createCoreProductModulationRangeEvent',
  'createCoreProductSequencerLaneParamEvent',
  'createCoreProductSequencerStepEvent',
  'createCoreProductSequencerStepValueEvent',
  'createCoreProductSequencerClearStepsEvent',
  'createCoreProductSequencerResetHomeEvent',
  'createCoreProductSequencerDiceEvent',
  'ResetSequencerLaneHome',
  'DiceSequencerLane',
  'CORE_PRODUCT_SEQUENCER_IDS',
  'CORE_PRODUCT_STEP_TOGGLE_FLAGS',
  'CORE_PRODUCT_STEP_VALUE_FIELDS',
  'CORE_PRODUCT_SUBLANE_DIRECTIONS',
  'createCoreProductSequencerSubLaneConfigEvent',
  'createCoreProductMidiEvent',
  'resolveCoreProductDrumMorphRangeTarget',
  'mapValue?: (value: number, context: CoreProductRangeValueContext) => number',
  'GRANULAR_VOICE_RANGE_PARAM_SUFFIXES',
  'granularVoiceRangeTargets',
  'drumDelayNoteL',
  'FxDelayATimeLeftMs',
  'drumDelayNoteR',
  'FxDelayATimeRightMs',
  'granularDelayTime',
  'FxDelayBBaseTimeMs',
  'indexedDelayDivisionMs',
  'pad1DelayASend',
  'SourceDelayASend',
  'lead2DelayBSend',
  'SourceDelayBSend',
  'granularPianoSend',
  'SourceGranularSend',
  'padPostLPF',
  'SourcePostLpfHz',
  'padStereoWidth',
  'SourceStereoWidth',
  'lead1PostLPFKeyTracking',
  'SourcePostLpfKeyTracking',
  'masterLimiterCeilingDb',
  'delayAFeedback',
  'FxDelayAFeedback',
  'granularFeedback',
  'FxGranularFeedback',
  'granularFeedbackLPF',
  'FxGranularFeedbackLpfHz',
  'granularDiffusion',
  'FxGranularBusDiffusion',
  'granularLegacyJitter',
  'FxGranularLegacyJitterMs',
  'granularMacroActivity',
  'granularMacroVoiceTargets',
  'computeGranularMacroModel',
  'delayAModRate',
  'normalizedToDelayAModRateHz',
  'delayAModDepth',
  'normalizedToDelayAModDepthMs',
  'delayACrossFeedFilter',
  'normalizedToDelayACrossFeedFilterHz',
  'granularDelayMix',
  'granularDelayActivity',
  'delayAToBSend',
  'reverbDecay',
  'FxReverbDecay',
  'spectralFreezePhaseJitter',
  'characterResonance',
  'degradeWobbleSpeed',
  'degradeCorrosion',
  'degradeModSlowWow',
  'FxDynamicsModSlowWow',
  'degradeModNoiseAlias',
  'dynamicsSaturationBias',
  'endCompProgramRelease',
  'sidechainPad1Target',
  'CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE',
  'CORE_PRODUCT_LEAD_RUNTIME_PARAM_ID_BASE',
  'CORE_PRODUCT_DRUM_MASTER_LEVEL_PARAM_INDEX',
  'CORE_PRODUCT_DRUM_REVERB_SEND_PARAM_INDEX',
  'coreProductDrumRuntimeParamId(paramIndex:',
  'coreProductLeadRuntimeParamId(leadIndex:',
  'resolveCoreProductDrumRuntimeRangeTargets',
  'KESSHO_PRODUCT_DRUM_PARAM_SPECS',
  'drumExactTarget(voiceIndex:',
  'drumDelayFeedback',
  'normalizedToDrumDelayFilterHz',
  'isCoreProductRangeKeySupported(key: string)',
]) {
  assert(events.includes(token), `core-product events are missing ${token}`);
}
assert(
  events.includes('drumLevel: (key) => [') &&
    events.includes('coreProductDrumRuntimeParamId(CORE_PRODUCT_DRUM_MASTER_LEVEL_PARAM_INDEX)'),
  'core-product drumLevel range target must update the drum module master level param',
);
assert(
  events.includes('drumReverbSend: (key) => [') &&
    events.includes('coreProductDrumRuntimeParamId(CORE_PRODUCT_DRUM_REVERB_SEND_PARAM_INDEX)'),
  'core-product drumReverbSend range target must update the drum module reverb send param',
);
assert(
  events.includes('context.randomWalkSpeed ?? context.speed ?? 1') &&
    events.includes('context.randomWalkMode ?? context.mode'),
  'core-product random-walk flags must accept the host runtime walk speed/mode context aliases',
);
assert(
  hostRuntimeGuards.includes('randomWalkSpeed: walk.speed') &&
    hostRuntimeGuards.includes('randomWalkMode: walk.mode'),
  'CoreProductHostRuntimeGuards must pass explicit random-walk speed/mode aliases into range events',
);

const granularVoiceRangeSuffixes = [
  ['Speed', 'Speed'],
  ['Pitch', 'Pitch'],
  ['WriteFollow', 'WriteFollow'],
  ['Density', 'Density'],
  ['GrainSize', 'GrainSizeMs'],
  ['Spray', 'Spray'],
  ['GrainOct', 'GrainOctaveProbability'],
  ['Gain', 'Gain'],
  ['Pan', 'Pan'],
  ['Blur', 'Blur'],
  ['PosLFODepth', 'PositionLfoDepth'],
  ['PanLFORate', 'PanLfoRate'],
];

for (const [stateSuffix, paramSuffix] of granularVoiceRangeSuffixes) {
  assert(
    events.includes(`['${stateSuffix}', '${paramSuffix}']`),
    `core-product events are missing granular voice ${stateSuffix} -> ${paramSuffix} range mapping`,
  );
}

for (const token of [
  'for (const voiceNumber of [1, 2, 3, 4] as const)',
  '`granularV${voiceNumber}${stateSuffix}`',
  '`FxGranularV${voiceNumber}${paramSuffix}`',
]) {
  assert(events.includes(token), `core-product events are missing generated granular voice range token ${token}`);
}

for (const token of [
  "type: 'snapshot'",
  "type: 'register-asset'",
  "type: 'unregister-asset'",
  'unregisterAsset(assetId: number): void',
  "type: 'request-telemetry'",
  "type: 'visual-telemetry'",
  'CORE_PRODUCT_VISUAL_TELEMETRY_INTERVAL_MS',
  "type: 'telemetry'",
  'get outputNode(): AudioNode | null',
  'context.createGain()',
  'setTelemetryCallback(callback:',
  'setVisualTelemetryActive(active:',
  'dispose(): void',
  'window.clearInterval(this.telemetryTimer)',
  'window.clearInterval(this.visualTelemetryTimer)',
  'void context.close();',
]) {
  assert(runtime.includes(token), `core-product runtime is missing ${token}`);
}

for (const token of [
  'Math.abs(prev.pad1FilterFreq - next.pad1FilterFreq) < 0.01',
  'Math.abs(prev.pad1LfoValue - next.pad1LfoValue) < 0.00001',
  "useRuntimeSliderPosition('padPostLPF'",
  'postLpfHz={livePad1PostLpf}',
  'pad1FilterModEnvActive',
  'pad2FilterModEnvActive',
  'return hasAnimatedFilterView ? 50 : 180;',
  'useVisibleInterval(updateLiveFilterViz, synthLivePollMs',
]) {
  assert(synthPage.includes(token), `Synth live filter visualizer must stay responsive in Product Core: missing ${token}`);
}
assert(
  !synthPage.includes('window.setInterval(poll, 50)'),
  'Synth live filter visualizer must use one visible interval instead of duplicate Product Core polling loops',
);
assert(
  /const DRUM_LANE_ENABLED_KEYS = \[[\s\S]*'drumEuclid1Enabled'[\s\S]*'drumEuclid4Enabled'[\s\S]*\] as const/.test(drumPage) &&
    /const toggleDrumSequencerTransport = useCallback[\s\S]*const startPatch: Partial<SliderState> = next \? \{ drumEuclidMasterEnabled: true \} : \{\};[\s\S]*if \(next && !state\.drumEnabled\) \{[\s\S]*startPatch\.drumEnabled = true;[\s\S]*if \(next && !DRUM_LANE_ENABLED_KEYS\.some\(\(key\) => Boolean\(state\[key\]\)\)\) \{[\s\S]*startPatch\[activeLaneEnabledKey\] = true;[\s\S]*onSelectChange\('drumEuclidMasterEnabled', next\);[\s\S]*if \(next && !isRunning\) \{[\s\S]*onRequestPlaybackStart\?\.\(startPatch\);/.test(drumPage),
  'Drum keyboard/button transport must enable the drum engine, an audible lane, and start Product with the requested state patch',
);
assert(
  /const SYNTH_LANE_ENABLED_KEYS = \[[\s\S]*'synthEuclid1Enabled'[\s\S]*'synthEuclid4Enabled'[\s\S]*\] as const/.test(synthPage) &&
    /const toggleSynthSequencerTransport = useCallback[\s\S]*const startPatch: Partial<SliderState> = next \? \{ synthEuclideanMasterEnabled: true \} : \{\};[\s\S]*const requestedLaneEnabledKey = next && !hasEnabledLane \? activeLaneEnabledKey : null;[\s\S]*const enableSequencerSource = \(source: ManualSynthSource\) => \{[\s\S]*source === 'pad1'[\s\S]*startPatch\.padEnabled = true;[\s\S]*source === 'lead1'[\s\S]*startPatch\.leadEnabled = true;[\s\S]*SYNTH_LANE_ENABLED_KEYS\.forEach\(\(key, laneIndex\) => \{[\s\S]*key !== requestedLaneEnabledKey[\s\S]*getManualSourceForLaneSource\([\s\S]*startPatch\[requestedLaneEnabledKey\] = true;[\s\S]*onRequestPlaybackStart\?\.\(startPatch\);/.test(synthPage),
  'Synth keyboard/button transport must enable only selected sequencer source engines, an audible lane, and start Product with the requested state patch',
);
for (const token of [
  'onRequestPlaybackStart?: (statePatch?: Partial<SliderState>) => void;',
  'isRunning: boolean;',
]) {
  assert(drumPage.includes(token), `Drum transport must know whether global playback is running: missing ${token}`);
  assert(synthPage.includes(token), `Synth transport must know whether global playback is running: missing ${token}`);
}
for (const token of [
  'useSelectedAudioEngineStartAction({',
  'prepareSelectedPlaybackStartState',
  'onRequestPlaybackStart: requestSequencerPlaybackStart',
  'onRequestPlaybackStart: options.onRequestPlaybackStart',
]) {
  assert(app.includes(token) || selectedPageRuntimeBridges.includes(token) || selectedAudioEnginePlaybackSurface.includes(token), `Sequencer transport playback-start bridge is missing ${token}`);
}
for (const token of [
  'useSelectedAudioEnginePlaybackStartState({',
  'let stateToStart = requestedState ?? stateRef.current;',
  'applyPreset(defaultPreset, {',
  'applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);',
  'restoreEvolveConfigs(result.preset);',
]) {
  assert(app.includes(token) || selectedAudioEnginePlaybackStartState.includes(token), `Selected playback-start state bridge is missing ${token}`);
}
for (const token of [
  'preparePlaybackStartState',
  'startSelectedPlayback',
  'startArmedRecordingAfterPlaybackStart',
]) {
  assert(selectedAudioEngineStartAction.includes(token), `Selected start action hook is missing ${token}`);
}
for (const token of [
  'useSelectedAudioEngineJourneyPlaybackAction({',
  'startJourneyPlayback(startState, startPreset.name)',
]) {
  assert(app.includes(token) || selectedAudioEnginePlaybackSurface.includes(token) || journeyMorphRuntimeSurface.includes(token), `Journey playback-start bridge is missing token ${token}`);
}
for (const token of [
  'startSelectedPlayback',
  'dualRanges',
  "console.log('[Journey] Starting audio engine')",
  "console.error('[Journey] Failed to start audio:', err)",
]) {
  assert(selectedAudioEngineJourneyPlaybackAction.includes(token), `Selected journey playback action hook is missing ${token}`);
}
for (const token of [
  'useSelectedAudioEngineStopAction({',
  'stopJourney: journey.stop',
]) {
  assert(app.includes(token) || selectedAudioEnginePlaybackSurface.includes(token), `Selected stop action bridge is missing token ${token}`);
}
for (const token of [
  'stopSelectedPlayback();',
  'drumEuclidMasterEnabled: false',
  'synthEuclideanMasterEnabled: false',
  'stopJourneyMorphPlayback(true);',
  'resetPlaybackTimer();',
]) {
  assert(selectedAudioEngineStopAction.includes(token), `Selected stop action hook is missing ${token}`);
}
for (const token of [
  'useSelectedAudioEnginePresetLoadFade({',
  'fadeSelectedAudioEngineOutput,',
]) {
  assert(app.includes(token) || selectedAudioEnginePlaybackSurface.includes(token), `Selected preset-load fade bridge is missing token ${token}`);
}
for (const token of [
  'const PRESET_LOAD_FADE_MS = 2000',
  'fadeSelectedAudioEngineOutput(0, PRESET_LOAD_FADE_MS)',
  'stopPlayback();',
  'window.setTimeout(resolve, PRESET_LOAD_STOP_SETTLE_MS)',
  'fadeSelectedAudioEngineOutput(1, PRESET_LOAD_RESTORE_FADE_MS)',
]) {
  assert(selectedAudioEnginePresetLoadFade.includes(token), `Selected preset-load fade hook is missing ${token}`);
}
for (const token of [
  'useSelectedAudioEngineCapacitorAudioSession(options);',
  'startPlayback: handleStart',
  'stopPlayback: handleStop',
]) {
  assert(app.includes(token) || selectedAudioEnginePlatformRuntimeSurface.includes(token), `Selected Capacitor audio-session bridge is missing token ${token}`);
}
for (const token of [
  'useSelectedAudioEngineRemoteCommandPlayback({',
  'useCapacitorAudioSessionDiagnostics({',
  'isPlaying: playbackIsRunning || isJourneyPlaying',
  'onRemoteCommand: handleCapacitorAudioSessionRemoteCommand',
]) {
  assert(selectedAudioEngineCapacitorAudioSession.includes(token), `Selected Capacitor audio-session hook is missing ${token}`);
}
for (const token of [
  "command === 'play'",
  "command === 'pause'",
  'if (!playbackIsRunning) void startPlayback();',
  'if (playbackIsRunning) stopPlayback();',
]) {
  assert(selectedAudioEngineRemoteCommandPlayback.includes(token), `Selected remote command playback hook is missing ${token}`);
}
for (const token of [
  'const requestSequencerPlaybackStart = useCallback((statePatch?: Partial<SliderState>): void => {',
  'if (playbackIsRunning || isJourneyPlaying) return;',
  'void startPlayback(patchedState);',
]) {
  assert(lazySequencerTransport.includes(token), `Sequencer transport playback-start hook is missing ${token}`);
}
assert(
  !app.includes('onRequestPlaybackStart={requestSequencerPlaybackStart}') &&
    app.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') &&
    app.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') &&
    (selectedPageRuntimeBridges.match(/onRequestPlaybackStart: options\.onRequestPlaybackStart/g) ?? []).length >= 2,
  'Both drum and synth pages must receive the playback-start bridge through selected page runtime props in web and Product Core modes',
);
for (const token of [
  'toggleDrumSequencerTransport();',
  'onClick={toggleDrumSequencerTransport}',
]) {
  assert(drumPage.includes(token), `Drum keyboard and button transport must share the same start logic: missing ${token}`);
}
for (const token of [
  'toggleSynthSequencerTransport();',
  'onClick={toggleSynthSequencerTransport}',
]) {
  assert(synthPage.includes(token), `Synth keyboard and button transport must share the same start logic: missing ${token}`);
}

for (const token of [
  "const SUB_LANE_KINDS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance', 'slice', 'reverse'];",
  'const sanitized = cloneSubLaneState(saved);',
  'Number.isFinite(state.steps)',
  'direction: normalizeSequencerLaneDirection(state.direction)',
  'rangeMin: Math.min(rangeMin, rangeMax ?? rangeMin)',
  'rangeMax: Math.max(rangeMax, rangeMin ?? rangeMax)',
]) {
  assert(sequencePresetLane.includes(token), `Sequence lane preset restore must sanitize sub-lane state: missing ${token}`);
}
for (const token of [
  "'slice',\n  'reverse',",
  "'sliceDirection',\n  'reverseDirection',",
]) {
  assert(stepOverrideSerialization.includes(token), `Step override serialization must preserve drum slice/reverse sub-lanes: missing ${token}`);
}

for (const token of [
  'displayedCutoffRef',
  'lastDrawMsRef',
  '1 - Math.exp(-elapsedMs / 80)',
  'postLpfHz?: number',
  'postLpfDominant',
  'drawCombinedResponseCurve',
  "filterGain(freq, postLpfCutoff, 0, 0.7, 'lowpass', 0, 24)",
  'Engine telemetry owns live cutoff, including LFO and mod-envelope motion.',
  'const hasFilterTelemetryMotion = props.isRunning',
  "props.lfoDest !== 'none' || hasFilterModEnvelopeMotion(props)",
]) {
  assert(filterLfoViz.includes(token), `FilterLfoViz must smooth live Product Core telemetry between polling ticks: missing ${token}`);
}
assert(
  !filterLfoViz.includes('loopingModEnvValue') &&
    !filterLfoViz.includes('filterEnv * (props.filterCutoffMax - props.filterCutoffMin)'),
  'FilterLfoViz must not locally synthesize live filter cutoff on top of Product Core telemetry',
);
assert(
  !filterLfoViz.includes('Hz audible'),
  'FilterLfoViz must not present the pad source post-LPF as a hard audible ceiling',
);

for (const token of [
  'laneManualMaskFromPattern',
  'resolveEuclidPatternParams(',
  'euclideanPatternMask(steps, hits, rotation)',
  'synthSourcePadVoiceIndexFromState',
  'encodedPadVoiceLaneSeed',
  'PAD_VOICE_SEED_FLAG',
  'exactPadPatchFromState(state, 0',
  'exactPadPatchFromState(state, 1',
]) {
  assert(snapshot.includes(token), `Product Core Pad snapshot must route distance-aware exact patch comparison through CoreProductPadPatch: missing ${token}`);
}

for (const token of [
  'target_pad_voice_index = kPadVoiceNoPreference',
  'padVoiceIndexFromEncodedSeed',
  'laneSeedFromEncodedPadVoice',
  'sequencerPadVoiceEventFlags',
  'padVoiceIndexFromSequencerEventFlags',
  'sequencerPadVoiceEventFlags(lane.target_pad_voice_index)',
  'pad_voice_index < static_cast<uint32_t>(PAD_VOICES_PER_PAD)',
  'exact pad voice trigger should not consume pad2 round-robin cursor',
]) {
  assert(
    `${productSequencerState}\n${productMath}\n${productSequencerVoiceRouting}\n${productSynthSequencer}\n${productSourceModuleTrigger}\n${productSourceVoiceAllocator}\n${productSequencerTests}`.includes(token),
    `Product Core Pad sequencer must preserve exact synthN voice routing: missing ${token}`,
  );
}

for (const token of [
  'coreProductPadVoiceEventFlags',
  'padVoiceIndex?: number',
  'normalized.flags = this.optionalUint(event, \'flags\', 0, 0, 0xffffffff)',
  'padVoiceIndexFromSequencerEventFlags(event.flags)',
  'targeted pad note event should not consume pad2 round-robin cursor',
]) {
  assert(
    `${events}\n${worklet}\n${arrangementScheduler}\n${host}\n${productEvents}\n${productSequencerTests}`.includes(token),
    `Product Core manual Pad notes must preserve exact voice routing: missing ${token}`,
  );
}

for (const token of [
  'mapPadExactValueForDistance',
  'productParamTarget(coreProductPadRuntimeParamId(0, spec.index), key, (value, context)',
  'productParamTarget(coreProductPadRuntimeParamId(1, spec.index), key, (value, context)',
]) {
  assert(events.includes(token), `Product Core Pad runtime ranges must apply distance mapping for web parity: missing ${token}`);
}

for (const token of [
  "export type PadRandomStyle = 'target' | 'walk'",
  'const WALK_LINEAR_RADIUS',
  "const LFO_WAVES = ['sine', 'triangle', 'sawtooth', 'square', 'sampleHold', 'randomSmooth', 'randomWalk'] as const",
  "const walkMode = style === 'walk'",
  'return stabilizePadSnapshot(scope, next)',
]) {
  assert(padRandomize.includes(token), `Pad patch randomizer must keep the walk variant available: missing ${token}`);
}

for (const token of [
  'const PAD_VARIANT_PROGRESS = [0.2, 0.4, 0.65, 0.85, 1] as const',
  "const walkGoal = createPadRandomGoal(current, scope, 'walk', `walk|${variation.history.length}`)",
  'const nextSnapshot = blendPadScopeState(scope, current, walkGoal, PAD_WALK_BLEND, PAD_WALK_DISCRETE_THRESHOLD)',
  'applyPadVariationSnapshot(scope, nextSnapshot)',
  'appliedSteps: prev.appliedSteps + 1',
]) {
  assert(synthPage.includes(token), `Synth Pad randomizer walk-step controls must stay wired: missing ${token}`);
}
assert(
  synthPresetManager.includes('variationControls.progressText') &&
    !synthPresetManager.includes("? 'Walk mode'\n              : (variationControls.progressText"),
  'Synth Pad randomizer must display walk-step progress instead of hiding it behind static Walk mode text',
);

for (const token of [
  'this.appendSourceOverrideDiffs(events, previous.sources, next.sources)',
  'createCoreProductSourceOverrideSlotEvent',
  'createCoreProductSourceOverrideCommitEvent',
  'legacyExactBridgeFieldsPresent',
  "this.legacyExactBridgeFieldsPresent(previousSource) || this.legacyExactBridgeFieldsPresent(nextSource)) return 'source-structure-change'",
  "this.padOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'pad-override-change'",
  "this.leadOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'lead-override-change'",
  "this.drumOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'drum-override-change'",
  'private padOverrideChanged',
  'private leadOverrideChanged',
  'private drumOverrideChanged',
  'private canApplySourceOverrideDiff',
]) {
  assert(runtimeAdapter.includes(token), `Product TS sparse override dirty diff must reject legacy exact bridge fields and keep override events wired: missing ${token}`);
}
for (const forbidden of [
  'appendPadExactPatchDiffs',
  'appendLeadExactPatchDiffs',
  'appendDrumExactPatchDiffs',
  'canApplyPadExactPatchDiff',
  'canApplyLeadExactPatchDiff',
  'canApplyDrumExactPatchDiff',
  'exact-patch-change',
]) {
  assert(!runtimeAdapter.includes(forbidden), `Product runtime adapter must not retain legacy exact patch dirty-diff path: ${forbidden}`);
}

for (const token of [
  'wasmHeapBudgetBytes?: number',
  'decodedAssetBytes?: number',
  'decodedAssetBudgetBytes?: number',
  'assetAllocationBytes?: number',
  'workletLeadStemPeak?: number',
  'workletGraphTapPeaks?: number[]',
  'stepValueConfigEnabledMask?: number',
  'probabilityOverrideSetLow?: number',
  'expressionRangeSetLow?: number',
  'expressionRangeMaxes?: number[] | null',
  'synthSequencerHitCounts?: number[]',
  'drumSequencerHitCounts?: number[]',
  'synthSequencerCurrentSteps?: number[]',
  'drumSequencerCurrentSteps?: number[]',
]) {
  assert(telemetryTypes.includes(token), `core-product telemetry type is missing ${token}`);
}

for (const token of [
  "this.resolve('kessho_product_copy_telemetry')",
  "this.resolve('kessho_product_copy_sequencer_ui_state')",
  'copyTelemetry(this.engine, this.telemetryPtr) !== 1',
  'copySequencerUiState(this.engine, this.sequencerUiStatePtr)',
  'const SEQUENCER_UI_STATE_BYTES = 96292;',
  "message.type === 'request-telemetry'",
  "message.type === 'request-visual-telemetry'",
  "this.port.postMessage({ type: 'telemetry', telemetry });",
  "this.port.postMessage({ type: 'visual-telemetry', telemetry });",
  'readVisualTelemetry()',
  'this.heapF32.buffer !== this.exports.memory.buffer',
  'workletOutputPeak: this.lastOutputPeak',
  'wasmHeapBytes: this.exports.memory.buffer.byteLength',
  'decodedAssetBytes: this.assetDecodedBytes',
  'assetAllocationBytes: this.assetAllocationBytes',
  "getStem: this.resolve('kessho_product_get_stem')",
  "getGraphTap: this.resolve('kessho_product_get_graph_tap')",
  'workletStemPeaks: this.lastStemPeaks',
  'workletGraphTapPeaks: this.lastGraphTapPeaks',
  'workletPadStemPeak: this.lastStemPeaks[1] || 0',
  'workletLeadStemPeak: Math.max(this.lastStemPeaks[3] || 0, this.lastStemPeaks[4] || 0)',
  'runtimeWalkValues[controlId] = value;',
  'highestMaskStep(setLow, setHigh)',
  'stepValueConfigEnabledMask: this.view.getUint32(ptr + 100, true)',
  'stepValueConfigSteps: this.readUint32Array(ptr, 104, 8)',
  'stepValueConfigDirections: this.readUint32Array(ptr, 136, 8)',
  'expressionRangeSetLow: this.view.getUint32(ptr + 2216, true)',
  'expressionRangeMaxes: this.readFloatOverrides(',
  'const TELEMETRY_BYTES = 1296;',
  'rngSeed: this.view.getUint32(ptr + 928, true)',
  'rngState: this.view.getUint32(ptr + 932, true)',
  'sourcePresetIds.push(this.view.getUint32(ptr + 936 + index * 4, true));',
  'masterOutputPeak: this.view.getFloat32(ptr + 968, true)',
  'masterLimiterGainReductionDb: this.view.getFloat32(ptr + 976, true)',
  'const sequencerUiStateRevision = this.view.getUint32(ptr + 984, true);',
  'masterTruePeak: this.view.getFloat32(ptr + 988, true)',
  'masterTruePeakDbtp: this.view.getFloat32(ptr + 992, true)',
  'masterIntegratedLufs: this.view.getFloat32(ptr + 996, true)',
  'granularWriteHeadPosition: this.view.getFloat32(ptr + 1000, true)',
  'granularVoicePositions: [',
  'pad1FilterFreq: this.view.getFloat32(ptr + 1020, true)',
  'pad1Lfo1Value: this.view.getFloat32(ptr + 1024, true)',
  'pad2FilterFreq: this.view.getFloat32(ptr + 1028, true)',
  'pad2Lfo1Value: this.view.getFloat32(ptr + 1032, true)',
  'synthSequencerHitCounts.push(this.view.getUint32(ptr + 1036 + index * 4, true));',
  'drumSequencerHitCounts.push(this.view.getUint32(ptr + 1100 + index * 4, true));',
  'synthSequencerCurrentSteps.push(this.view.getUint32(ptr + 1164 + index * 4, true));',
  'drumSequencerCurrentSteps.push(this.view.getUint32(ptr + 1228 + index * 4, true));',
  'sequencerUiState,',
]) {
  assert(worklet.includes(token), `core-product worklet is missing ${token}`);
}

assert(
  manifest.includes("'kessho_product_copy_telemetry'") &&
    manifest.includes("'kessho_product_copy_sequencer_ui_state'") &&
    manifest.includes("'kessho_product_get_graph_tap'"),
  'WASM manifest must export Product Core telemetry, sequencer UI state, and graph tap APIs',
);

for (const token of [
  'transport',
  'harmony',
  'sources',
  'synthLanes',
  'drumLanes',
  'journey',
  "booleanFromState(sliderState, 'journeyEnabled', false)",
  "numberFromState(sliderState, 'journeyMorphPhase', 0)",
  "numberFromState(sliderState, 'journeyMorphRateBars', 8)",
  'fx',
  "const granularEnabled = booleanFromState(sliderState, 'granularEnabled', false)",
  "const delayAEnabled =",
  "const delayBEnabled =",
  "const spectralFreezeEnabled = booleanFromState(sliderState, 'spectralFreezeEnabled', false)",
  "const dynamicsEnabled = booleanFromState(sliderState, 'dynamicsEnabled', false)",
  "granularMix: granularEnabled",
  "delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/8d', transport.bpm), 10, 5000)",
  "delayATimeRightMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteR', '1/4', transport.bpm), 10, 5000)",
  "delayAFeedback: clamp(numberFromState(sliderState, booleanFromState(sliderState, 'drumDelayEnabled', false) ? 'drumDelayFeedback' : 'delayAFeedback', 0.4), 0, 0.95)",
  "delayAMix: delayAEnabled",
  "delayAFilterHz: booleanFromState(sliderState, 'drumDelayEnabled', false)",
  "delayBMix: delayBEnabled",
  "const delayBTapeMode = sliderState?.delayBAlgorithm === 'tapeHeads';",
  'delayBPattern: delayBTapeMode',
  'delayBTapeSpacingId(sliderState?.delayBTapeSpacing)',
  'delayBPatternId(sliderState?.delayBPattern)',
  "reverbType: reverbTypeId(sliderState?.reverbType)",
  "reverbQuality: reverbQualityId(shouldUseMobileReverbQualityOverride(sliderState) ? 'balanced' : sliderState?.reverbQuality)",
  "reverbErLpFreq: clamp(numberFromState(sliderState, 'reverbErLpFreq', 2500), 200, 12000)",
  "delayBToReverb: clamp(numberFromState(sliderState, 'granularDelayReverbSend', 0.4), 0, 1)",
  "spectralFreezeMix: clamp(numberFromState(sliderState, 'spectralFreezeMix', 1), 0, 1)",
  "spectralFreezeEnabled,",
  "dynamicsDrive: dynamicsEnabled",
  "dynamicsCharacterMode: dynamicsCharacterModeId(sliderState?.characterMode)",
  "dynamicsDegradeMix: clamp(numberFromState(sliderState, 'degradeMix', 0), 0, 1)",
  "dynamicsModSlowWow: clamp(numberFromState(sliderState, 'degradeModSlowWow', 0.18), 0, 1)",
  "dynamicsModNoiseAlias: clamp(numberFromState(sliderState, 'degradeModNoiseAlias', 0.02), 0, 1)",
  "dynamicsSaturationDrive: clamp(numberFromState(sliderState, 'dynamicsSaturationDrive', 0), 0, 1)",
  "dynamicsEndCompThreshold: clamp(numberFromState(sliderState, 'endCompThreshold', -18), -60, 0)",
  "sidechainKeyA: sidechainKeyId(sliderState?.sidechainKeyA)",
  "sidechainPad1Target: clamp(numberFromState(sliderState, 'sidechainPad1Target', 0), 0, 1)",
  'routing',
  'master',
  'limiterCeilingDb',
  "numberFromState(sliderState, 'masterLimiterCeilingDb', -0.5)",
  'f32(snapshot.master.limiterCeilingDb)',
  'rng',
  'evolution',
  'evolutionAmountFromState',
  'snapshot.evolution.amount',
  'snapshot.evolution.state',
  'synthLanesFromState',
  'drumLanesFromState',
  'synthSourceIdFromState',
  'synthEuclidUsesSourceId',
  'synthEuclidLaneEnabled',
  "booleanFromState(state, 'synthEuclideanMasterEnabled', false)",
  "numberFromState(state, 'pad2VoiceAssign', 0)",
  "booleanFromState(state, 'pad2Enabled', false)",
  'source.slice(\'synth\'.length)',
  "source.enabled = booleanFromState(state, 'padEnabled', false) || synthEuclidUsesSourceId(state, sourceId)",
  "source.enabled = booleanFromState(state, 'lead2Enabled', booleanFromState(state, 'leadEnabled', false)) || synthEuclidUsesSourceId(state, sourceId)",
  "source.enabled = booleanFromState(state, 'pianoEnabled', false) || synthEuclidUsesSourceId(state, sourceId)",
  'drumTargetVoiceIndices',
  'CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID',
  'getPrimaryCoreProductSoundscapeAssetIdForState(state)',
  'sourcePresetId',
  'soundscapePresetIdFromState',
  'u32(snapshot.fx.reverbType >>> 0)',
  'f32(snapshot.fx.reverbErLpFreq)',
]) {
  assert(snapshotSurface.includes(token), `core-product snapshot/encoder is missing ${token}`);
}
assert(
  !snapshotSurface.includes("source.enabled = booleanFromState(state, 'padEnabled', true) || synthEuclidUsesSourceId(state, sourceId)"),
  'Product snapshot must not default Pad 1 on unless Pad 1 is enabled or selected by an enabled synth sequencer lane',
);

for (const forbidden of [
  'setInterval(',
  'setTimeout(',
  'AudioBufferSourceNode',
  'createBufferSource(',
  'missingNoopMethods',
]) {
  assert(!host.includes(forbidden), `core-product host must not schedule/render product audio with ${forbidden}`);
}

assert(!referenceRuntime.includes('missingNoopMethods'), 'reference runtime must not keep audio-critical missing-method no-op fallbacks');
assert(!referenceRuntime.includes('preInitGetterFallbacks'), 'reference runtime must not keep broad pre-init getter fallbacks');
assert(referenceRuntime.includes('preInitNullableLifecycleGetters'), 'reference runtime must keep only explicit nullable lifecycle getters before engine init');
for (const forbiddenPreInitGetter of [
  'getDynamicsVisualTelemetry:',
  'getEarthTextureDebugState:',
  'getGranularActiveGrainCount:',
  'getGranularVoicePositions:',
  'getCurrentPadFilterFreq:',
  'getLeadMorphedParams:',
  'getRecordableBusNodes:',
  'getTransportDebugState:',
]) {
  assert(!referenceRuntime.includes(forbiddenPreInitGetter), `reference runtime must not fake ${forbiddenPreInitGetter} before engine init`);
}
assert(productAudioRuntimeSelection.includes("'core-product'"), 'product runtime selection must keep Product Core selectable');
assert(referenceRuntime.includes("case 'core-smoke':"), 'reference runtime must keep the Core smoke renderer explicitly selectable');
assert(!referenceRuntime.includes('isLegacyCoreBridgeOptInEnabled'), 'reference runtime must not hide the verified Core bridge behind a transitional opt-in');
assert(!referenceRuntime.includes('legacyCoreBridge'), 'reference runtime must not require a legacy bridge query/storage escape hatch');
const runtimeSelectionBody = methodBody(productAudioRuntimeSelection, 'getAudioEngineRuntimeMode');
assert(
  runtimeSelectionBody.includes("if (typeof window === 'undefined') return getProductionAudioEngineRuntimeMode();") &&
    productAudioRuntimeSelection.includes('getProductEngineRuntimeMode()'),
  'product runtime selection must default SSR to Product Core through the ProductEngineProxy decision point',
);
assert(
  runtimeSelectionBody.includes("if (!isDevRuntime()) return getProductionAudioEngineRuntimeMode();") &&
    productAudioRuntimeSelection.includes('getProductEngineRuntimeMode()'),
  'product runtime selection must force Product Core outside dev/reference builds through the ProductEngineProxy decision point',
);
assert(referenceRuntime.includes("'startJourneyMorphClock'"), 'reference runtime must eagerly load startJourneyMorphClock');
assert(referenceRuntime.includes("'stopJourneyMorphClock'"), 'reference runtime must eagerly load stopJourneyMorphClock');

const appCalledAudioMethods = new Set(
  Array.from(app.matchAll(/\baudioEngine\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g), (match) => match[1]),
);
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
for (const method of appCalledAudioMethods) {
  if (retiredGuardedAppMethods.has(method)) continue;
  assert(
    new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?${method}\\s*\\(`).test(host),
    `core-product host must explicitly implement app-called audioEngine.${method}()`,
  );
}
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
    selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEnginePlaybackRuntime } from './useSelectedAudioEnginePlaybackRuntime'") &&
    selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEngineRuntimeUi } from './useSelectedAudioEngineRuntimeUi'") &&
    selectedAudioEngineRuntimeShell.includes('useSelectedAudioEnginePlaybackRuntime({') &&
    selectedAudioEngineRuntimeShell.includes('useSelectedAudioEngineRuntimeUi({') &&
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
    productRuntimePlaybackRuntime.includes('useProductRuntimePlaybackAdapter(options)') &&
    productRuntimeUi.includes("import { useProductRuntimeNavigation } from './useProductRuntimeNavigation'") &&
    productRuntimeUi.includes("import { useProductRuntimePerf } from './useProductRuntimePerf'") &&
    productRuntimeUi.includes('useProductRuntimeNavigation({') &&
    productRuntimeUi.includes('useProductRuntimePerf(audioEngineRuntimeMode, runtimeNavigation.showAudioEngineSwitcher)') &&
    !productRuntimeUi.includes('useSelectedAudioEngineRuntimeUi') &&
    !app.includes("from './ui/useSelectedAudioEngineMediaSession'") &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackControls'") &&
    !app.includes("from './ui/audioEngineMediaSession'") &&
    !app.includes('connectSelectedMediaSessionToAudio();') &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes('useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode)') &&
    !app.includes("from './ui/useAudioRecording'") &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeRecordingRuntime(options.audioEngineRuntimeMode)') &&
    productRuntimeRecordingRuntime.includes('useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode)') &&
    selectedAudioEngineRecordingRuntime.includes('useAudioRecording(audioEngineRuntimeMode)') &&
    selectedAudioEngineRecordingRuntime.includes('startArmedRecordingAfterPlaybackStart') &&
    selectedAudioEngineRecordingRuntime.includes('globalRecordingProps') &&
    audioRecordingHook.includes("throw new Error('Recording is explicitly unavailable in core-product until a Product recording bridge exists')") &&
    audioRecordingHook.includes("if (audioEngineRuntimeMode === 'core-product') {") &&
    audioRecordingHook.includes('setRecordingDuration(0);'),
  'retired recording/platform node getters must remain unreachable in core-product App paths',
);
assert(
  app.includes('{...productPageRuntimeSurface.dynamicsPageRuntimeProps}') &&
    app.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') &&
    !app.includes('getDynamicsAnalyser={productRuntimeDebugAnalysers.dynamicsAnalyser}') &&
    !app.includes('getAnalyserNode={productRuntimeDebugAnalysers.drumVoiceAnalyser}') &&
    app.includes("from './ui/useProductRuntimeSurfaces'") &&
    app.includes('useProductRuntimeSurfaces(audioEngineRuntimeMode)') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeSurfaces'") &&
    !app.includes('useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode)') &&
    productRuntimeSurfaces.includes("import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime'") &&
    productRuntimeSurfaces.includes('useProductRuntimeDebugRuntime(audioEngineRuntimeMode)') &&
    productRuntimeSurfaces.includes('...debugRuntime') &&
    !productRuntimeSurfaces.includes('useSelectedAudioEngineRuntimeSurfaces') &&
    !app.includes("from './ui/useSelectedAudioEngineDebugRuntime'") &&
    !app.includes("from './ui/useSelectedAudioEngineDebugSurface'") &&
    !app.includes("from './ui/useSelectedAudioEngineDebugAnalyserBridge'") &&
    selectedPageRuntimeBridges.includes('getDynamicsAnalyser: options.productRuntimeDebugAnalysers.dynamicsAnalyser') &&
    selectedPageRuntimeBridges.includes('getAnalyserNode: options.productRuntimeDebugAnalysers.drumVoiceAnalyser') &&
    selectedAudioEngineRuntimeSurfaces.includes('useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode)') &&
    selectedAudioEngineRuntimeSurfaces.includes('...debugRuntime') &&
    selectedAudioEngineDebugRuntime.includes('useSelectedAudioEngineDebugSurface(audioEngineRuntimeMode)') &&
    selectedAudioEngineDebugRuntime.includes('useSelectedAudioEngineDebugAnalyserBridge({') &&
    selectedAudioEngineDebugRuntime.includes('selectedAudioEngineDebugAnalysers,') &&
    selectedAudioEngineDebugAnalyserBridge.includes('drumVoiceAnalyser: referenceDrumVoiceAnalyser') &&
    selectedAudioEngineDebugAnalyserBridge.includes('dynamicsAnalyser: referenceDynamicsAnalyser') &&
    app.includes('{...productPageRuntimeSurface.granularPageRuntimeProps}') &&
    app.includes('useProductRuntimePageSurface({') &&
    !app.includes('useSelectedAudioEnginePageRuntimeBridgeOptions({') &&
    !app.includes('useSelectedAudioEnginePageTelemetryRuntimeProps({') &&
    !app.includes('...pageTelemetryRuntimeProps') &&
    !app.includes('useSelectedAudioEnginePageSequencerRuntimeProps({') &&
    !app.includes('...pageSequencerRuntimeProps') &&
    !app.includes('useSelectedAudioEnginePageControlRuntimeProps({') &&
    !app.includes('...pageControlRuntimeProps') &&
    !app.includes('liveWaveformTelemetryAvailable={liveWaveformTelemetryAvailable}') &&
    selectedPageRuntimeBridges.includes('liveWaveformTelemetryAvailable: options.liveWaveformTelemetryAvailable') &&
    selectedPageTelemetryRuntimeProps.includes('liveWaveformTelemetryAvailable') &&
    selectedPageSequencerRuntimeProps.includes('captureSelectedSynthEuclidLaneHome') &&
    selectedPageSequencerRuntimeProps.includes('setSelectedDrumStepOverrides') &&
    selectedPageSequencerRuntimeProps.includes('synthStepOverridesRef') &&
    selectedPageControlRuntimeProps.includes('productRuntimeManualTriggers') &&
    selectedPageControlRuntimeProps.includes('preloadSelectedAudioEngine') && productRuntimePageControlProps.includes('preloadProductRuntime') &&
    selectedPageControlRuntimeProps.includes('setSelectedDrumEvolveTriggerCallback') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageTelemetryRuntimeProps(telemetry)') &&
    selectedPageRuntimeBridgeOptions.includes('...pageTelemetryRuntimeProps') &&
    selectedAudioEngineDebugSurface.includes("throw new Error('Granular waveform samples are explicitly unavailable in core-product')") &&
    app.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') &&
    !app.includes('liveLeadMorphedParamsAvailable={liveLeadMorphedParamsAvailable}') &&
    selectedPageRuntimeBridges.includes('liveLeadMorphedParamsAvailable: options.liveLeadMorphedParamsAvailable') &&
    selectedPageTelemetryRuntimeProps.includes('liveLeadMorphedParamsAvailable') &&
    app.includes('{...productPageRuntimeSurface.earthPageRuntimeProps}') &&
    !app.includes('textureDebugAvailable={textureDebugAvailable}') &&
    selectedPageRuntimeBridges.includes('textureDebugAvailable: options.textureDebugAvailable') &&
    selectedPageTelemetryRuntimeProps.includes('textureDebugAvailable') &&
    selectedAudioEngineDebugSurface.includes('EMPTY_EARTH_TEXTURE_DEBUG_STATE'),
  'retired visual/debug getters must remain guarded away from core-product App paths',
);

function importSpecifiers(source) {
  return Array.from(source.matchAll(/from ['"]([^'"]+)['"]/g), (match) => match[1]).sort();
}

const snapshotImportAllowlist = new Set([
  '../ui/state',
  '../platform',
  './CoreProductDrumPatch',
  './CoreProductLeadPatch',
  './CoreProductPadPatch',
  './CoreProductModeIds',
  './CoreProductPresetIds',
  './coreProductDelaySnapshot',
  './coreProductAssets',
  './coreProductEvents',
  './coreProductSequencerMacroDefaults',
  './coreProductSequencerHold',
  './coreProductSoundscapesSnapshot',
  './coreProductSnapshotEncoder',
  './coreProductSnapshotState',
  './coreProductSnapshotTypes',
  './distanceMacro',
  './euclideanPatterns',
  './generated/kesshoProductSchema',
  './granularMacroCore',
  './harmony',
  './outputTrims',
  './rng',
  './scales',
  './sequencerClockDivisions',
  './sequencerPitchBinding',
  './sequencerSwing',
  './transport',
]);
for (const specifier of importSpecifiers(snapshot)) {
  assert(
    snapshotImportAllowlist.has(specifier),
    `core-product snapshot adapter import is not classified: ${specifier}`,
  );
}

const hostImportAllowlist = new Set([
  '../native/capacitorMidiRouting',
  './product/host/CoreProductAssetRegistrar',
  './CoreProductHostDebugTelemetry',
  './CoreProductHostSequencerAdapter',
  './CoreProductHostSequencerClock',
  './CoreProductHostSequencerEvolve',
  './CoreProductHostSequencerEvolveConfig',
  './CoreProductHostSequencerHome',
  './CoreProductHostSequencerRangePayload',
  './CoreProductHostSequencerSubLaneEvolve',
  './CoreProductHostSequencerSwing',
  './CoreProductHostSequencerUiState',
  './CoreProductHostHarmonyState',
  './CoreProductHostMidi',
  './product/host/CoreProductHostDiagnostics',
  './product/host/CoreProductPatchClassifier',
  './product/host/CoreProductLeadPresetDataLoader',
  './product/host/CoreProductModulationRangeBridge',
  './product/host/CoreProductSnapshotCoordinator',
  './product/host/CoreProductTelemetryAdapter',
  './product/host/CoreProductSequencerUiAdapter',
  './CoreProductHostSynthNoteRangeEvolve',
  './CoreProductHostSynthPitch',
  './CoreProductHostRuntimeGuards',
  './CoreProductHostSequencerVisuals',
  './CoreProductLeadPatch',
  './CoreProductRuntimeAdapter',
  './coreMidiEvents',
  './coreProductArrangementScheduler',
  './coreProductAssets',
  './CoreProductFallbackDiagnostics',
  './coreProductEvents',
  './coreProductGraphTaps',
  './coreProductRuntime',
  './coreProductSnapshot',
  './coreProductTelemetry',
  './drumSeqTypes',
  './engine',
  './engineSharedTypes',
  './generated/kesshoProductEvents',
  './generated/kesshoProductParams',
  './product/ProductEngineTypes',
  './product/ProductRuntimeCapabilityReport',
  './product/ProductRuntimeDiagnostics',
  './sequencerLaneDirection',
  './sequencerPitchBinding',
  './sequencerPitchSettings',
  './sequencerSwing',
  './transport',
]);
for (const specifier of importSpecifiers(host)) {
  assert(
    hostImportAllowlist.has(specifier),
    `core-product host import is not classified: ${specifier}`,
  );
}

console.log('Kessho Product web host checks passed');
