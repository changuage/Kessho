/**
 * Main App Component
 *
 * Complete UI with all sliders, selects, and debug panel.
 * Wires up to the product runtime with deterministic state management.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { appStyles as styles } from './app/appStyles';
import {
  SliderState,
  SliderMode,
  DEFAULT_STATE,
  quantize,
  getParamInfo,
  getSliderNumericValue,
  getStateValueFromSliderNumber,
} from './ui/state';
import type { DualSliderRange } from './ui/DualSlider';
import type { ProductEngineState } from './audio/product/ProductEngineTypes';
import { ProductRuntimeSwitch } from './ui/ProductRuntimeSwitch';
import { AppFooterMark } from './ui/AppFooterMark';
import { useProductRuntimeManualTriggers } from './ui/useProductRuntimeManualTriggers';
import { useLiveNoteInput } from './ui/keyboard/liveNoteInput';
import type { ProductLiveNoteEvent } from './audio/product/liveNoteEvents';
import { useProductRuntimeMorphSurface } from './ui/useProductRuntimeMorphSurface';
import { useProductRuntimeSurfaces } from './ui/useProductRuntimeSurfaces';
import { useMorphEndpointStatePatch } from './ui/useMorphEndpointStatePatch';
import { useProductRuntimePresetSurface } from './ui/useProductRuntimePresetSurface';
import {
  resolveProductRuntimeInitialState,
  useProductRuntimeSession,
  useProductRuntimeShell,
} from './ui/useProductRuntimeSession';
import { isCloudEnabled as isCloudPresetConfigEnabled } from './cloud/config';
import { calculateDriftedRoot } from './audio/harmony';
import { DrumVoiceType as DrumPresetVoice } from './audio/drumPresets';
import { morphWaterPresets, WATER_MORPH_PARAM_KEYS, INSECT_ENGINE_DEFAULTS, getWaterPresetDualRanges, getWaterPresetSliderModes } from './audio/waterPresets';
import {
  loadDawOutputDeviceSelection,
  loadDawOutputRoutingConfig,
  type DawOutputDeviceSelection,
  type DawOutputRoutingConfig,
} from './audio/dawOutputRouting';
import { getEffectivePhraseDuration } from './audio/transport';
import {
  applyMorphToState,
} from './audio/drumMorph';
import { getProductDrumMorphDualRangeOverrides, interpolateProductDrumMorphDualRanges } from './product-control';

import { clampMorphPosition, isInMidMorph, isAtEndpoint0, isAtEndpoint1 } from './audio/morphUtils';
import {
  getRuntimeSliderFlashing,
  getRuntimeSliderPosition,
} from './ui/runtimeSliderState';
import { useProductCoreDebugSummary } from './ui/useProductCoreDebugSummary';
import { useProductRuntimeParityProbe } from './ui/useProductRuntimeParityProbe';
import {
  resetRuntimeWalkPositionsForKeys,
  resetRuntimeWalkPositionsForModes,
} from './ui/runtimeWalkPositionSync';
import { VISUALIZER_PRESET_SCOPE } from './ui/visualizer/visualizerPresetStore';
import { getGranularPresetData, getGranularPresetSliderModes, isGranularDelayBStateKey } from './ui/granular/granularPresets';
import SnowflakeUI from './ui/SnowflakeUI';
import SnowflakePrototypePage from './ui/SnowflakePrototypePage';
import { CpuOverlay } from './ui/CpuOverlay';
import { SliderHelpProvider } from './ui/SliderHelpOverlay';
import { MidiLearnProvider } from './ui/midiLearn/MidiLearnProvider';
import { CircleOfFifths, getMorphedRootNote } from './ui/CircleOfFifths';
import { useJourney } from './ui/journeyState';
import { TEXT_SYMBOLS } from './designSystem/textSymbols';
import {
  DRUM_VOICE_PARAM_ROUTES,
  getDrumVoiceMorphRoute,
  getDrumVoiceParamRoute,
  getDrumVoicePresetRoute,
  isDrumVoiceParamKey,
} from './ui/drums/drumVoiceParamRouting';
import { useJourneyPresets } from './presets/useJourneyPresets';
import { isLocalPresetStoreOverride } from './presets/sharedMode';
import { loadPresetsFromFolder } from './presets/bundledPresetLoader';
import {
  checkPresetCompatibility,
  loadActiveStatePresetStorePresetById,
  loadActiveStatePresetStorePresetByName,
  loadActiveStatePresetStorePresets,
  loadBundledPresetByName,
  loadCapacitorLocalStatePresets,
  normalizePresetForWeb,
  sortSavedStatePresetsByFreshness,
  statePresetEntryToSavedPreset,
  type SavedPreset,
} from './presets/statePresetRuntime';
import {
  buildPresetVersionMetadata,
  normalizeStatePresetPitchMetadata,
} from './presets/versionMetadataHelpers';
import { PresetPoolProvider } from './presets/PresetPoolContext';
import {
  createEmptyPresetPool,
  normalizePresetPoolMetadata,
  readPresetPoolPreference,
  writePresetPoolPreference,
} from './presets/presetPool';
import { CollapsiblePanel } from './ui/CollapsiblePanel';

import { OptionalVisualizerGate } from './ui/components/OptionalVisualizerGate';
import { useVisualFeatureToggle } from './ui/hooks/useVisualFeatureToggle';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig, SequencerViewMode } from './ui/sequencer/useEuclideanSequencer';
import { serializeStepOverrides } from './ui/sequencer/stepOverrideSerialization';
import { type ClockDivision, type PitchBindingMode } from './audio/drumSeqTypes';
import { sanitizeProductPlayConfigs, type ProductPlayConfig } from './audio/productPlaySequencer';
import {
  getRoutingSourceDef,
  getRoutingSourceToggleKeys,
  normalizeDegradeReverbCrossfeed,
  normalizeDegradeReverbCrossfeedRanges,
  normalizeRoutingMuteGroupsState,
  type RoutingMuteGroupsState,
} from './ui/routing';
import type { SynthKeyboardUiState } from './ui/synth/SynthPage';
import SnowflakeGeneratorPage from './ui/snowflakeGenerator/SnowflakeGeneratorPage';
import { usePlatformRuntimeCapabilities } from './ui/usePlatformRuntimeCapabilities';
import { usePresetLibraryRuntimeSurface } from './ui/usePresetLibraryRuntimeSurface';
import { useCloudSharedPresetRuntimeSurface } from './ui/useCloudSharedPresetRuntimeSurface';
import { useSavedPresetLoadRuntimeSurface } from './ui/useSavedPresetLoadRuntimeSurface';
import { createDefaultPitchSettings, sanitizeSequencerSubLaneStates } from './ui/usePresetSequencerRestore';
import { useProductRuntimePageSurface } from './ui/useProductRuntimePageSurface';
import { useLazySequencerTransport } from './ui/useLazySequencerTransport';
import {
  isReleaseCommittedTransportTimingKey,
  isTransportClockStateKey,
} from './ui/transportTimingPolicy';
import {
  DRUM_LANE_ENABLED_KEYS,
  drumLaneEnableTouchedAfterPresetRestore,
} from './ui/sequencer/sequencerTransportPolicy';
import { useProductRuntimeLifecycleSurface } from './ui/useProductRuntimeLifecycleSurface';
import { useProductRuntimeCallbackRegistrations } from './ui/useProductRuntimeCallbackRegistrations';
import { useProductRuntimeCoordination } from './ui/useProductRuntimeCoordination';
import { useProductRuntimePlaybackSurface } from './ui/useProductRuntimePlaybackSurface';
import { useProductRuntimeGlobalSurface } from './ui/useProductRuntimeGlobalSurface';
import { useProductRuntimePlatformSurface } from './ui/useProductRuntimePlatformSurface';
import { usePresetBootstrapRuntimeSurface } from './ui/usePresetBootstrapRuntimeSurface';
import { usePresetRestoreRuntimeSurface } from './ui/usePresetRestoreRuntimeSurface';
import { useJourneyPresetActionSurface, useJourneyPresetRuntimeSurface } from './ui/useJourneyPresetRuntimeSurface';
import { useJourneyOverrideRuntimeSurface } from './ui/useJourneyOverrideRuntimeSurface';
import { useJourneyMorphRuntimeSurface } from './ui/useJourneyMorphRuntimeSurface';
import { useMorphPositionRuntimeSurface } from './ui/useMorphPositionRuntimeSurface';
import { useMorphSlotLoadRuntimeSurface } from './ui/useMorphSlotLoadRuntimeSurface';
import {
  HelpButton,
  Select,
  SINGLE_ONLY_SLIDER_KEYS,
  Slider,
  normalizeDualSliderMode,
  normalizePadFilterCutoffPairs,
} from './app/AppControls';
import { createSignedSnowflakeWelcomeState } from './app/signedSnowflakeWelcomeState';
import { AppDebugPanel } from './app/AppDebugPanel';
import { BackgroundAudioStatusPill, MacAudioStatusPill } from './app/AppRuntimeStatusPills';
import { applySampleLibrarySelectionDefaultsToFlatState } from './audio/sampleLibraries/sampleLibrarySelectionDefaults';
import type { SampleLibraryKey } from './audio/sampleLibraries/SampleLibraryTypes';
import {
  DRUM_PRESET_SLOT_CHANGE,
  preserveRunningDrumSequencerSource,
} from './app/drumSequencerSourcePolicy';
import type { DualSliderState } from './app/nativeDualRanges';
import { useDualSliderRuntimeState } from './app/useDualSliderRuntimeState';
import {
  clearSnowflakeGeneratorRoute,
  clearSnowflakePrototypeRoute,
  isSnowflakeGeneratorRoute,
  isSnowflakePrototypeRoute,
  isSonicParityRoute,
} from './app/appRouteFlags';
import {
  DelayPage,
  DrumPage,
  EarthPage,
  GlobalPage,
  GranularPage,
  JourneyModeView,
  LAZY_PAGE_FALLBACK,
  ReactiveVisualizerPage,
  ReverbPage,
  RoutingPage,
  SynthPage,
  TexturePage,
} from './app/appLazyPages';
import { loadRoutingMuteGroupsState, saveRoutingMuteGroupsState } from './app/routingMuteGroupStorage';
import { useAppSplash } from './app/useAppSplash';
import { useAppResponsiveShell } from './app/useAppResponsiveShell';
import { useProductDrumMorphOverrides } from './app/useProductDrumMorphOverrides';
import { useProductDawOutputSync } from './app/useProductDawOutputSync';
import { useRoutingMuteGroupRuntimeLevelSync } from './app/useRoutingMuteGroupRuntimeLevelSync';
import { useRoutingMuteGroupSystem } from './app/useRoutingMuteGroupSystem';
import { useDrumScatterRuntimeState } from './app/useDrumScatterRuntimeState';
import { useDrumMorphPresetInterpolationSync } from './app/useDrumMorphPresetInterpolationSync';
import {
  applyRoutingActivationForSliderValue,
  captureRuntimeEnabledFlags,
  normalizeRoutingRuntimeEnabledFlags,
  restoreRuntimeEnabledFlags,
} from './app/sliderRoutingState';
import {
  ADVANCED_EDITOR_TABS,
} from './app/appNavigation';
import { useAdvancedEditorNavigation } from './app/useAdvancedEditorNavigation';
import {
  applyLiveLeadMorphToChangedPresetSlots,
  applyLiveLeadMorphToPresetChange,
  applyPadPresetMorphToState,
  clearPadMorphEndpointState,
  createPadMorphEndpointOverrides,
  getPadMorphParamChange,
  isLeadPresetSlotKey,
  leadPresetSlotsChanged,
  rememberChangedPadMorphEndpointStates,
  rememberPadMorphEndpointState,
  type PadMorphEndpointOverrides,
} from './features/morph/morphEndpointMath';

const DEFAULT_AUTO_START_PRESET_NAME = 'String Waves';
const CLOUD_ENABLED = isCloudPresetConfigEnabled();

// Main App

function normalizeTransportClockState(prev: SliderState): SliderState {
  const barsPerPhrase = Math.max(1, prev.transportBarsPerPhrase ?? 4);
  const beatsPerBar = Math.max(1, prev.transportBeatsPerBar ?? 4);
  const phraseSeconds = Math.max(0.001, prev.phraseLength ?? 16);
  const bpm = Math.max(1, prev.sequencerMasterBPM ?? prev.synthEuclidBaseBPM ?? prev.drumEuclidBaseBPM ?? 120);
  const primaryClock = prev.transportPrimaryClock ?? 'seconds';
  const nextBpm = quantize('sequencerMasterBPM', bpm);

  if (primaryClock === 'decoupled') {
    if (nextBpm === prev.sequencerMasterBPM && nextBpm === prev.synthEuclidBaseBPM && nextBpm === prev.drumEuclidBaseBPM) return prev;
    return { ...prev, sequencerMasterBPM: nextBpm, synthEuclidBaseBPM: nextBpm, drumEuclidBaseBPM: nextBpm };
  }

  if (primaryClock === 'seconds') {
    const derivedBpm = quantize('sequencerMasterBPM', (barsPerPhrase * beatsPerBar * 60) / phraseSeconds);
    if (derivedBpm === prev.sequencerMasterBPM && derivedBpm === prev.synthEuclidBaseBPM && derivedBpm === prev.drumEuclidBaseBPM) return prev;
    return { ...prev, sequencerMasterBPM: derivedBpm, synthEuclidBaseBPM: derivedBpm, drumEuclidBaseBPM: derivedBpm };
  }

  const derivedPhrase = quantize('phraseLength', (barsPerPhrase * beatsPerBar * 60) / bpm);
  if (derivedPhrase === prev.phraseLength && nextBpm === prev.sequencerMasterBPM && nextBpm === prev.synthEuclidBaseBPM && nextBpm === prev.drumEuclidBaseBPM) return prev;
  return { ...prev, phraseLength: derivedPhrase, sequencerMasterBPM: nextBpm, synthEuclidBaseBPM: nextBpm, drumEuclidBaseBPM: nextBpm };
}

const App: React.FC = () => {
  const { showSplash, splashOpacity, splashGradient, windowSize } = useAppSplash();
  const sonicParityMode = isSonicParityRoute();
  const snowflakePrototypeRoute = isSnowflakePrototypeRoute();
  const snowflakeGeneratorRoute = isSnowflakeGeneratorRoute();

  const { macShellAvailable, cloudPresetAllowed, usesCapacitorLocalPresetLibrary, usesCloudBackedStatePresetLibrary, shouldInitializeCloudPresetStore } =
    usePlatformRuntimeCapabilities({
      cloudEnabled: CLOUD_ENABLED,
      sonicParityMode,
      localPresetStoreOverride: isLocalPresetStoreOverride(),
    });

  // Track if user has loaded a preset (for auto-loading default on first play)
  const hasLoadedPresetRef = useRef(false);
  // Track if user has interacted with any UI element (sliders, buttons, etc.)
  const hasUserInteractedRef = useRef(false);
  // Saved presets list - start empty, load from folder on mount
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const { cloudPresetStoreReadyPromiseRef, resolveDefaultAutoStartPreset } = usePresetBootstrapRuntimeSurface<SavedPreset>({
    cloudEnabled: CLOUD_ENABLED,
    cloudPresetAllowed,
    defaultAutoStartPresetName: DEFAULT_AUTO_START_PRESET_NAME,
    entryToSavedPreset: statePresetEntryToSavedPreset,
    loadBundledPresetByName,
    localPresetStoreOverride: isLocalPresetStoreOverride(),
    savedPresets,
    shouldInitializeCloudPresetStore,
    sonicParityMode,
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
  });

  // Load initial state from URL or defaults
  const [state, setState] = useState<SliderState>(() => resolveProductRuntimeInitialState({ normalizeState: normalizePresetForWeb }));
  const [routingMuteGroups, setRoutingMuteGroups] = useState<RoutingMuteGroupsState>(() => loadRoutingMuteGroupsState());
  const [dawOutputRouting, setDawOutputRouting] = useState<DawOutputRoutingConfig>(() => loadDawOutputRoutingConfig());
  const [dawOutputDevice, setDawOutputDevice] = useState<DawOutputDeviceSelection>(() => loadDawOutputDeviceSelection());
  const stateRef = useRef(state);
  stateRef.current = state;
  const pendingImmediateLeadPresetSyncRef = useRef(false);
  const padMorphEndpointOverridesRef = useRef<PadMorphEndpointOverrides>(createPadMorphEndpointOverrides());
  const { productRuntimeMode } = useProductRuntimeSession();
  const lastAppliedPresetLoadRef = useRef<{
    preset: SavedPreset;
    state: SliderState;
  } | null>(null);
  const [capacitorAudioSessionDiagnosticActive, setCapacitorAudioSessionDiagnosticActive] = useState(false);
  const {
    productRuntimeModes,
    showProductRuntimeSwitcher,
    startInAdvancedEditor,
    handleProductRuntimeModeChange,
    preloadAdvancedEditorRuntime,
    setProductPerfMonitorEnabled,
    setProductPerfUpdateCallback,
    globalRuntimeComparison,
    startProductPlayback,
    stopProductPlayback,
    preloadProductRuntime,
    fadeProductRuntimeOutput,
    backgroundAudioStatus,
    requestVisiblePageWakeLock,
    releaseVisiblePageWakeLock,
  } = useProductRuntimeShell({
    productRuntimeMode,
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
    stateRef,
  });
  useProductDawOutputSync({ productRuntimeMode, state, dawOutputRouting, dawOutputDevice });

  useEffect(() => {
    saveRoutingMuteGroupsState(routingMuteGroups);
  }, [routingMuteGroups]);

  const {
    setProductDrumStepPositionCallback,
    setProductDrumEvolveTriggerCallback,
    setProductDrumTriggerCallback,
    setProductSynthStepPositionCallback,
    setProductSynthAnchorWalkerVisualStateCallback,
    setProductSynthOrbitVisualStateCallback,
    setProductSynthEvolveTriggerCallback,
    setProductLeadExpressionCallback,
    setProductLeadMorphCallback,
    setProductPadMorphTriggerCallback,
    setProductPad2MorphTriggerCallback,
    setProductLeadDistanceCallback,
    setProductPadDistanceTriggerCallback,
    setProductPad2DistanceTriggerCallback,
    setProductPianoDistanceTriggerCallback,
    setProductSample1DistanceTriggerCallback,
    setProductSample2DistanceTriggerCallback,
    setProductLeadDelayCallback,
    setProductDrumMorphTriggerCallback,
    setProductDrumParamSHTriggerCallback,
    setProductGranularSHTriggerCallback,
    setProductDrumEvolveOverridesChangedCallback,
    setProductSynthEvolveOverridesChangedCallback,
    setProductSynthNoteRangeEvolvedCallback,
    setProductRuntimeWalkPositionsCallback,
    setProductDrumMorphRange,
    setProductDrumParamSHRange,
    setProductDualRanges,
    setProductRuntimeWalkRanges,
    setProductJourneyMorphClockCallback: setProductJourneyMorphClockCallbackRuntime,
    startProductJourneyMorphClock: startProductJourneyMorphClockRuntime,
    stopProductJourneyMorphClock: stopProductJourneyMorphClockRuntime,
    resetProductCofDrift: resetProductCofDriftRuntime,
    setProductDrumEuclidEvolveConfigs,
    setProductSynthEuclidEvolveConfigs,
    setProductDrumEuclidClockDivs,
    setProductSynthEuclidClockDivs,
    setProductDrumEuclidSwings,
    setProductSynthEuclidSwings,
    setProductDrumSubLaneEnabled,
    setProductSynthSubLaneEnabled,
    setProductDrumPitchSettings,
    setProductSynthPitchSettings,
    setProductSynthPitchBindingModes,
    setProductDrumStepOverrides,
    setProductSynthStepOverrides,
    setProductSequencerPresetHomeSnapshots,
    resetProductSynthEuclidLaneHome,
    captureProductSynthEuclidLaneHome,
    diceProductSynthEuclidLane,
    resetProductDrumEuclidLaneHome,
    captureProductDrumEuclidLaneHome,
    diceProductDrumEuclidLane,
    getProductGranularBufferWaveform,
    getProductTransportDebugState,
    getEarthTextureDebugState,
    getProductLeadMorphedParams,
    productRuntimeDebugAnalysers,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    textureDebugAvailable,
    updateProductReferenceParams,
  } = useProductRuntimeSurfaces({ productRuntimeMode, stateRef });

  const [engineState, setEngineState] = useState<ProductEngineState>({
    isRunning: false,
    harmonyState: null,
    currentSeed: 0,
    currentBucket: '',
    currentFilterFreq: 1000,
    currentLfoValue: 0,
    currentLfo2Value: 0,
    cofCurrentStep: 0,
    fxOwners: {
      delayA: { owner: null, strength: 0, lastOrigin: null, active: false },
      delayB: { owner: null, strength: 0, lastOrigin: null, active: false },
      granular: { owner: null, strength: 0, lastOrigin: null, active: false },
      reverb: { owner: null, strength: 0, lastOrigin: null, active: false },
    },
    transportDebug: null,
  });
  const playbackIsRunning = engineState.isRunning;

  const { resetCofDrift, startJourneyMorphClock, stopJourneyMorphClock } = useProductRuntimeMorphSurface({
    resetProductCofDrift: resetProductCofDriftRuntime,
    setProductJourneyMorphClockCallback: setProductJourneyMorphClockCallbackRuntime,
    startProductJourneyMorphClock: startProductJourneyMorphClockRuntime,
    stopProductJourneyMorphClock: stopProductJourneyMorphClockRuntime,
  });
  const {
    scheduleProductRuntimeParamUpdate,
    presetProductRuntimeUpdateOptions,
    syncCoreProductAppliedPreset,
    syncScheduledProductRuntimeState,
    skipNextPresetLoadEngineSync,
  } = useProductRuntimePresetSurface({
    productRuntimeMode,
    resetProductCofDrift: resetCofDrift,
    updateSelectedReferenceParams: updateProductReferenceParams,
  });

  const {
    applyRoutingMuteGroupRuntimeLevels,
    handleRoutingMuteGroupRuntimeLevelPatchChange,
  } = useRoutingMuteGroupRuntimeLevelSync({
    stateRef,
    scheduleProductRuntimeParamUpdate,
  });

  const {
    getCurrentDrumMorphOverrideState: getProductDrumMorphOverrideState,
    dispatchDrumMorphProductControlAction,
  } = useProductDrumMorphOverrides(productRuntimeMode);
  const getCurrentDrumMorphOverrideState = useCallback(
    (sourceState: SliderState = stateRef.current) => getProductDrumMorphOverrideState(sourceState),
    [getProductDrumMorphOverrideState],
  );

  const productRuntimeManualTriggers = useProductRuntimeManualTriggers({
    productRuntimeMode,
    stateRef,
  });

  // L4 State preset name tracking
  const [statePresetName, setStatePresetName] = useState('');
  const [visualizerPresetName, setVisualizerPresetName] = useState('');
  const [linkedVisualizerPresetRequest, setLinkedVisualizerPresetRequest] = useState<{ name: string; nonce: number } | null>(null);

  // Morph slot name tracking (for PresetDropdown display)
  const [morphSlotAName, setMorphSlotAName] = useState('');
  const [morphSlotBName, setMorphSlotBName] = useState('');

  // Preset Morph state
  const [morphPresetA, setMorphPresetA] = useState<SavedPreset | null>(null);
  const [morphPresetB, setMorphPresetB] = useState<SavedPreset | null>(null);
  const [morphPosition, setMorphPosition] = useState(0); // 0 = full A, 100 = full B
  const [morphMode, setMorphMode] = useState<'manual' | 'auto'>('manual');
  const [morphPlayPhrases, setMorphPlayPhrases] = useState(16);
  const [morphTransitionPhrases, setMorphTransitionPhrases] = useState(4);
  const [morphCountdown, setMorphCountdown] = useState<{
    phase: string;
    phrasesLeft: number;
  } | null>(null);

  // Refs for journey mode animation - updated synchronously to avoid stale closures
  const journeyPresetARef = useRef<SavedPreset | null>(null);
  const journeyPresetBRef = useRef<SavedPreset | null>(null);
  const journeyLastAppliedStateRef = useRef<SliderState | null>(null);
  const journeyLastDualModesRef = useRef<Record<string, SliderMode>>({});
  const journeyLastDualRangesRef = useRef<Partial<Record<keyof SliderState, DualSliderRange>>>({});
  const journeyLastMorphPositionRef = useRef<number | null>(null);
  const journeyLastMorphCoFVizRef = useRef<{
    isMorphing: boolean;
    startRoot: number;
    effectiveRoot: number;
    targetRoot: number;
    cofStep: number;
    totalSteps: number;
  } | null>(null);

  // Morph CoF visualization state
  const [morphCoFViz, setMorphCoFViz] = useState<{
    isMorphing: boolean;
    startRoot: number; // Original starting root (captured at morph start)
    effectiveRoot: number;
    targetRoot: number;
    cofStep: number;
    totalSteps: number;
  } | null>(null);

  // Refs for phrase settings - used in animation loop to avoid restarting effect
  const morphPlayPhrasesRef = useRef(morphPlayPhrases);
  const morphTransitionPhrasesRef = useRef(morphTransitionPhrases);
  useEffect(() => {
    morphPlayPhrasesRef.current = morphPlayPhrases;
  }, [morphPlayPhrases]);
  useEffect(() => {
    morphTransitionPhrasesRef.current = morphTransitionPhrases;
  }, [morphTransitionPhrases]);

  // UI mode: 'snowflake', 'advanced', or 'journey'
  const [uiMode, setUiMode] = useState<'snowflake' | 'advanced' | 'journey'>(startInAdvancedEditor ? 'advanced' : 'snowflake');
  const {
    advancedRecordingButton,
    globalRecordingProps,
    snowflakeRecordingProps,
    startArmedRecordingAfterPlaybackStart,
    getProductGranularActiveGrainCount,
    getProductGranularWriteHeadPosition,
    getProductGranularVoicePositions,
    getProductGranularVisualEvents,
    getProductDynamicsVisualTelemetry,
    setProductGranularUiActive,
    setProductSimpleSequencerVisualPlanActive,
    setProductVisualTelemetryActive,
    pushProductMidiMessage,
    getProductPadFilterFreq,
    getProductPadLfoValue,
    productRuntimeSupportsRangeKey,
  } = useProductRuntimeLifecycleSurface({
    productRuntimeMode,
    getProductTransportDebugState,
    macShellAvailable,
    playbackIsRunning,
    setEngineState,
    stateRef,
    uiMode,
  });
  const productCoreDebugSummary = useProductCoreDebugSummary(productRuntimeMode);
  // Snowflake welcome state: local-only six-arm macro seed until playback, preset load, or advanced mode activation.
  const [snowflakeActivated, setSnowflakeActivated] = useState(startInAdvancedEditor);
  const [welcomeDisplayState, setWelcomeDisplayState] = useState<SliderState>(() => createSignedSnowflakeWelcomeState());
  const handleWelcomeSliderChange = useCallback((key: keyof SliderState, value: number) => {
    setWelcomeDisplayState((prev) => ({ ...prev, [key]: value }));
  }, []);
  const [activePresetPool, setActivePresetPool] = useState(readPresetPoolPreference);
  useEffect(() => {
    writePresetPoolPreference(activePresetPool);
  }, [activePresetPool]);
  const handlePresetPoolLoad = useCallback((preset: { presetPool?: unknown }) => {
    setActivePresetPool(normalizePresetPoolMetadata(preset.presetPool) ?? createEmptyPresetPool());
  }, []);

  // Journey mode playing state - when true, sliders should be read-only
  const [isJourneyPlaying, setIsJourneyPlaying] = useState(false);

  // Journey morph direction tracking - alternates between toB (0→100) and toA (100→0)
  const journeyMorphDirectionRef = useRef<'toB' | 'toA'>('toB');

  // Journey mode state - managed at App level so it persists across UI mode switches
  // Note: The callbacks are defined later in the file, so we use refs to avoid stale closures
  const journeyLoadPresetRef = useRef<(presetName: string) => void>(() => {});
  const journeyMorphToRef = useRef<(presetName: string, duration: number) => void>(() => {});

  // Journey uses phrase-based timing (1 phrase = phraseLength seconds)
  const journey = useJourney(
    state.phraseLength ?? 16,
    (presetName, duration) => journeyMorphToRef.current(presetName, duration),
    (presetName) => journeyLoadPresetRef.current(presetName),
  );
  const journeyPresets = useJourneyPresets();
  const {
    activeJourneyPresetName,
    setActiveJourneyPresetName,
    activeJourneyValidation,
    setActiveJourneyValidation,
    activeJourneyHasBackup,
    setActiveJourneyHasBackup,
  } = useJourneyPresetRuntimeSurface({
    journeyConfig: journey.config,
    hasJourneyPresetBackup: journeyPresets.hasBackup,
  });
  const { journeyOverridePrompt, resolveJourneyOverridePrompt, confirmOverrideArmedJourneyForStatePreset } = useJourneyOverrideRuntimeSurface({
    activeJourneyPresetName,
    journey,
    setIsJourneyPlaying,
    setActiveJourneyPresetName,
    setActiveJourneyHasBackup,
  });

  const {
    isMobile,
    isMobileViewport,
    mobileStyleOverrides: m,
    expandedPanels,
    togglePanel,
  } = useAppResponsiveShell();
  const reactiveVisualizerToggle = useVisualFeatureToggle(
    'kessho.visualizers.reactive.enabled',
    !isMobileViewport,
  );

  const {
    activeTab,
    activeTabRef,
    activeTabStyle,
    activePageAccentStyle,
    setActiveTab,
    openAdvancedTab,
    isEditableShortcutTarget,
  } = useAdvancedEditorNavigation({
    uiMode,
    setUiMode,
    snowflakeActivated,
    setSnowflakeActivated,
    preloadAdvancedEditorRuntime,
  });
  const [textureVisualTelemetryActive, setTextureVisualTelemetryActive] = useState(false);
  const productVisualTelemetryActive = uiMode === 'advanced' && (
    (activeTab === 'visualizer' && reactiveVisualizerToggle.enabled) ||
    (activeTab === 'texture' && textureVisualTelemetryActive)
  );
  useEffect(() => {
    setProductVisualTelemetryActive(productVisualTelemetryActive);
  }, [productVisualTelemetryActive, setProductVisualTelemetryActive]);
  useEffect(() => (
    () => {
      setProductVisualTelemetryActive(false);
    }
  ), [setProductVisualTelemetryActive]);

  useProductRuntimeCallbackRegistrations({
    activeTab,
    setProductDrumEvolveTriggerCallback,
    setProductDrumMorphTriggerCallback,
    setProductDrumParamSHTriggerCallback,
    setProductDrumStepPositionCallback,
    setProductDrumTriggerCallback,
    setProductGranularSHTriggerCallback,
    setProductLeadDelayCallback,
    setProductLeadDistanceCallback,
    setProductLeadExpressionCallback,
    setProductLeadMorphCallback,
    setProductPad2DistanceTriggerCallback,
    setProductPad2MorphTriggerCallback,
    setProductPadDistanceTriggerCallback,
    setProductPadMorphTriggerCallback,
    setProductPianoDistanceTriggerCallback,
    setProductSample1DistanceTriggerCallback,
    setProductSample2DistanceTriggerCallback,
    setProductSynthEvolveTriggerCallback,
    setProductSynthStepPositionCallback,
    stateRef,
    uiMode,
  });

  const {
    sliderModes,
    setSliderModes,
    dualSliderRanges,
    setDualSliderRanges,
    nativeDualRanges,
    applyScopedDualRangesFromPreset,
    handleCycleSliderMode,
    handleDualRangeChange,
  } = useDualSliderRuntimeState<SavedPreset>({
    state,
    stateRef,
    setState,
    isJourneyPlaying,
    morphPosition,
    morphPresetA,
    morphPresetB,
    setMorphPresetA,
    setMorphPresetB,
    dispatchDrumMorphProductControlAction,
  });
  const { globalRuntimeProps, resetPlaybackTimer } = useProductRuntimeGlobalSurface({
    playbackIsRunning,
    stopProductPlayback,
    runtimeComparison: globalRuntimeComparison,
    onResetCofDrift: resetCofDrift,
    recordingProps: globalRecordingProps,
  });
  const [drumEditingVoice, setDrumEditingVoice] = useState<string | null>(null);
  const drumViewModeRef = useRef<SequencerViewMode>('detail');
  const drumStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const drumSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const drumEvolveConfigsRef = useRef<EvolveConfig[] | undefined>(undefined);
  const drumClockDivsRef = useRef<ClockDivision[] | undefined>(undefined);
  const drumSwingsRef = useRef<number[] | undefined>(undefined);
  const drumLinkedRef = useRef<boolean[] | undefined>(undefined);
  const drumPitchSettingsRef = useRef<PitchSettings[] | undefined>(undefined);
  const {
    drumSeqSimpleStateRef,
    drumSeqScatterState,
    handleDrumSeqScatterStateChange,
    drumScatterRuntimePulses,
  } = useDrumScatterRuntimeState({
    activeTab,
    activeTabRef,
    playbackIsRunning,
    state,
    stateRef,
    triggerDrumVoice: productRuntimeManualTriggers.triggerDrumVoice,
  });

  // ── Lead/Synth Euclidean sequencer state ──
  const synthViewModeRef = useRef<SequencerViewMode>('simple');
  const synthStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const synthSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const synthClockDivsRef = useRef<ClockDivision[] | undefined>(undefined);
  const synthSwingsRef = useRef<number[] | undefined>(undefined);
  const synthLinkedRef = useRef<boolean[] | undefined>(undefined);
  const synthPitchSettingsRef = useRef<PitchSettings[] | undefined>(undefined);
  const synthPitchBindingModesRef = useRef<PitchBindingMode[] | undefined>(undefined);
  const synthKeyboardUiStateRef = useRef<SynthKeyboardUiState | undefined>(undefined);
  const synthArpConfigsRef = useRef<ProductPlayConfig[] | undefined>(undefined);
  const synthEvolveConfigsRef = useRef<EvolveConfig[] | undefined>(undefined);

  const [drumPresetVersion, setDrumPresetVersion] = useState(0);
  const [synthPresetVersion, setSynthPresetVersion] = useState(0);
  const drumLaneEnableTouchedRef = useRef(false);
  const previousDrumLaneIntentPresetVersionRef = useRef(drumPresetVersion);
  useEffect(() => {
    if (previousDrumLaneIntentPresetVersionRef.current === drumPresetVersion) return;
    previousDrumLaneIntentPresetVersionRef.current = drumPresetVersion;
    drumLaneEnableTouchedRef.current = drumLaneEnableTouchedAfterPresetRestore({
      anyLaneEnabled: DRUM_LANE_ENABLED_KEYS.some((key) => Boolean(state[key])),
    });
  }, [drumPresetVersion, state]);

  const { applyDualRangesFromPreset, restoreEvolveConfigs } = usePresetRestoreRuntimeSurface({
    drumClockDivsRef,
    drumEvolveConfigsRef,
    drumLinkedRef,
    drumPitchSettingsRef,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
    setDrumPresetVersion,
    setProductDrumEuclidClockDivs,
    setProductDrumEuclidEvolveConfigs,
    setProductDrumEuclidSwings,
    setProductDrumStepOverrides,
    setProductDrumSubLaneEnabled,
    setProductDrumPitchSettings,
    setProductSequencerPresetHomeSnapshots,
    setProductSynthEuclidClockDivs,
    setProductSynthEuclidEvolveConfigs,
    setProductSynthEuclidSwings,
    setProductSynthPitchBindingModes,
    setProductSynthPitchSettings,
    setProductSynthStepOverrides,
    setProductSynthSubLaneEnabled,
    setSynthPresetVersion,
    synthClockDivsRef,
    synthEvolveConfigsRef,
    synthLinkedRef,
    synthPitchBindingModesRef,
    synthPitchSettingsRef,
    synthArpConfigsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
    normalizeDualSliderMode,
    setDualSliderRanges,
    setSliderModes,
  });

  const getStatePresetSaveMetadata = useCallback(
    () =>
      buildPresetVersionMetadata({
        routingMuteGroups,
        dualRanges: dualSliderRanges as Record<string, { min: number; max: number }>,
        sliderModes,
        drumEvolveConfigs: drumEvolveConfigsRef.current,
        synthEvolveConfigs: synthEvolveConfigsRef.current,
        drumStepOverrides: serializeStepOverrides(drumStepOverridesRef.current),
        synthStepOverrides: serializeStepOverrides(synthStepOverridesRef.current),
        drumClockDivs: drumClockDivsRef.current,
        synthClockDivs: synthClockDivsRef.current,
        drumSwings: drumSwingsRef.current,
        synthSwings: synthSwingsRef.current,
        drumLinked: drumLinkedRef.current,
        synthLinked: synthLinkedRef.current,
        drumSubLaneStates: sanitizeSequencerSubLaneStates(drumSubLaneStatesRef.current),
        synthSubLaneStates: sanitizeSequencerSubLaneStates(synthSubLaneStatesRef.current),
        synthArpConfigs: sanitizeProductPlayConfigs(synthArpConfigsRef.current),
        ...normalizeStatePresetPitchMetadata({
          drumPitchSettings: drumPitchSettingsRef.current,
          synthPitchSettings: synthPitchSettingsRef.current,
        }),
        synthPitchBindingModes: synthPitchBindingModesRef.current,
        presetPool: activePresetPool,
        refs: visualizerPresetName
          ? {
              visualizer: {
                name: visualizerPresetName,
                version: 'latest',
                scope: VISUALIZER_PRESET_SCOPE,
              },
            }
          : undefined,
      }),
    [activePresetPool, dualSliderRanges, routingMuteGroups, sliderModes, visualizerPresetName],
  );

  const restoreRoutingMuteGroupsFromPreset = useCallback((value: SavedPreset['routingMuteGroups']) => {
    setRoutingMuteGroups(normalizeRoutingMuteGroupsState(value));
  }, []);

  // Drum morph keys - these use per-trigger randomization, not random walk
  const drumMorphKeys = useMemo(
    () => new Set<keyof SliderState>(DRUM_VOICE_PARAM_ROUTES.map((route) => route.morphKey)),
    [],
  );

  // Map drum morph keys to voice names for engine API
  const drumMorphKeyToVoice = useMemo<Record<string, DrumPresetVoice>>(
    () => Object.fromEntries(
      DRUM_VOICE_PARAM_ROUTES.map((route) => [route.morphKey, route.voice]),
    ) as Record<string, DrumPresetVoice>,
    [],
  );

  // Drum S&H param keys — all numeric per-voice drum params except morph/preset selectors.
  const drumSHParamKeys = useMemo(
    () =>
      new Set(
        Object.keys(state).filter((key) => {
          if (!isDrumVoiceParamKey(key)) return false;
          return typeof state[key as keyof SliderState] === 'number';
        }),
      ),
    [state],
  );

  const { cloudSharedPresetToSavedPreset, applyCloudSharedPreset } = useCloudSharedPresetRuntimeSurface({
    stateRef,
    setState,
    presetEngineUpdateOptions: presetProductRuntimeUpdateOptions,
    syncCoreProductAppliedPreset,
    normalizeState: normalizePresetForWeb,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
    onRoutingMuteGroupsLoad: restoreRoutingMuteGroupsFromPreset,
  });

  const { resolveSavedPresetForLoad, resolveSavedPresetByName } = usePresetLibraryRuntimeSurface<SavedPreset>({
    cloudEnabled: CLOUD_ENABLED,
    cloudPresetAllowed,
    cloudPresetStoreReadyPromiseRef,
    loadBundledPresets: loadPresetsFromFolder,
    loadCapacitorLocalPresets: loadCapacitorLocalStatePresets,
    loadCloudBackedPresets: loadActiveStatePresetStorePresets,
    loadPresetByName: loadActiveStatePresetStorePresetByName,
    loadPresetById: loadActiveStatePresetStorePresetById,
    onCloudSharedPresetLoaded: applyCloudSharedPreset,
    reloadKey: uiMode,
    savedPresets,
    setSavedPresets,
    sortPresets: sortSavedStatePresetsByFreshness,
    toCloudSharedPreset: cloudSharedPresetToSavedPreset,
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
  });
  const shouldMirrorRuntimeWalkPositions = productRuntimeMode === 'core-product'
    || uiMode === 'snowflake'
    || uiMode === 'advanced'
    || snowflakePrototypeRoute;

  const { drumEvolvedOverrides, synthEvolvedOverrides } = useProductRuntimeCoordination({
    activeTab,
    createDefaultPitchSettings,
    drumMorphKeyToVoice,
    drumMorphKeys,
    drumPitchSettingsRef,
    drumSHParamKeys,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
    dualSliderRanges,
    playbackIsRunning,
    randomWalkMode: state.randomWalkMode,
    randomWalkSpeed: state.randomWalkSpeed,
    productRuntimeSupportsRangeKey,
    setProductDrumEvolveOverridesChangedCallback,
    setProductDrumMorphRange,
    setProductDrumParamSHRange,
    setProductDualRanges,
    setProductRuntimeWalkPositionsCallback,
    setProductRuntimeWalkRanges,
    setProductSynthEvolveOverridesChangedCallback,
    setProductSynthNoteRangeEvolvedCallback,
    shouldMirrorRuntimeWalkPositions,
    sliderModes,
    synthPitchSettingsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
  });

  useProductRuntimeParityProbe({
    enabled: sonicParityMode,
    productRuntimeSupportsRangeKey,
    setActiveTab,
    setDualSliderRanges,
    setSliderModes,
    setState,
    setUiMode,
    stateRef,
    normalizeStatePatch: applyLiveLeadMorphToChangedPresetSlots,
  });

  useEffect(() => {
    setState(normalizeTransportClockState);
  }, [
    state.transportPrimaryClock,
    state.phraseLength,
    state.sequencerMasterBPM,
    state.synthEuclidBaseBPM,
    state.drumEuclidBaseBPM,
    state.transportBarsPerPhrase,
    state.transportBeatsPerBar,
  ]);

  // Web audio does not consume dual-slider ranges, so avoid re-sending params when
  // only the UI runtime range model changes.
  useEffect(() => {
    const runtimeState = applyRoutingMuteGroupRuntimeLevels(state);
    if (pendingImmediateLeadPresetSyncRef.current) {
      pendingImmediateLeadPresetSyncRef.current = false;
      scheduleProductRuntimeParamUpdate(runtimeState, {
        immediate: true,
        reason: 'ui-control-change',
      });
      return;
    }
    syncScheduledProductRuntimeState(runtimeState);
  }, [applyRoutingMuteGroupRuntimeLevels, scheduleProductRuntimeParamUpdate, state, syncScheduledProductRuntimeState]);

  type SliderChangeOptions = {
    preserveEnabledFlags?: boolean;
  };

  const applyMorphEndpointStatePatch = useMorphEndpointStatePatch<SavedPreset>(morphPosition, setMorphPresetA, setMorphPresetB);

  const handleSliderChangeWithOptions = useCallback(
    (key: keyof SliderState, value: number | string, options?: SliderChangeOptions) => {
      // Mark that user has interacted with the UI
      hasUserInteractedRef.current = true;

      // Block slider changes when journey mode is playing
      if (isJourneyPlaying) {
        console.log('[Journey] Slider change blocked - journey is playing');
        return;
      }

      // Rule 1: Mid-morph changes are temporary overrides (numeric only)
      // Rule 2: Endpoint changes (0% or 100%) update the respective preset permanently (all types)
      const quantizedSliderValue = typeof value === 'number' ? quantize(key, value) : null;
      const stateValue = quantizedSliderValue !== null ? getStateValueFromSliderNumber(key, quantizedSliderValue) : value;
      const isStateNumericValue = typeof stateValue === 'number';
      const isMorphActive = morphPresetA !== null || morphPresetB !== null;

      if (isMorphActive && isInMidMorph(morphPosition, true) && isStateNumericValue) {
        // Mid-morph: store as temporary override (numeric only)
        morphManualOverridesRef.current[key] = {
          value: stateValue as number,
          morphPosition,
        };
      }

      // ═══════════════════════════════════════════════════════════════════════
      // DRUM SYNTH PARAMETER OVERRIDE SYSTEM
      // When a drum synth param (like drumSubFreq) is changed at a drum morph
      // endpoint (0 or 1), save as override so it persists during morph
      // ═══════════════════════════════════════════════════════════════════════
      const keyStr = key as string;
      const padMorphParamChange = getPadMorphParamChange(key);

      const drumParamRoute = getDrumVoiceParamRoute(key);
      const drumVoice = drumParamRoute?.voice ?? null;
      const drumMorphKey = drumParamRoute?.morphKey ?? null;

      // If this is a drum synth param, check for drum morph endpoint and save override
      if (drumVoice && drumMorphKey && isStateNumericValue) {
        // Get current drum morph position for this voice from state
        // We need to read from the current state, so we'll do this inside setState
      }

      let drumMorphProductControlChanged = false;
      setState((prev) => {
        const preservedEnabledFlags = options?.preserveEnabledFlags ? captureRuntimeEnabledFlags(prev) : null;
        let newState = { ...prev, [key]: stateValue };
        if (isTransportClockStateKey(key)) {
          // Timing edits are a single transport transaction. Derive linked clock
          // values in the same state commit so the runtime receives one boundary edit.
          newState = normalizeTransportClockState(newState as SliderState);
        }
        let drumMorphOverrideState = getCurrentDrumMorphOverrideState(prev);

        if (key === 'chordProgressionSteps' && typeof stateValue === 'number') {
          const nextSteps = Math.max(1, Math.round(stateValue));
          const pattern = [...(prev.chordProgressionPattern ?? [0, 3, 4, 0])];
          while (pattern.length < nextSteps) pattern.push(0);
          const enabled = [...(prev.chordProgressionStepEnabled ?? new Array(pattern.length).fill(true))];
          while (enabled.length < nextSteps) enabled.push(true);
          newState.chordProgressionSteps = nextSteps;
          newState.chordProgressionPattern = pattern.slice(0, nextSteps);
          newState.chordProgressionStepEnabled = enabled.slice(0, nextSteps);
          newState.chordProgressionHits = Math.min(nextSteps, Math.max(0, prev.chordProgressionHits ?? nextSteps));
          newState.chordProgressionRotation = Math.min(Math.max(0, prev.chordProgressionRotation ?? 0), Math.max(0, nextSteps - 1));
        }

        // Handle drum synth param override at any morph position
        // Works like the main morph system: endpoint changes are permanent,
        // mid-morph changes blend toward destination
        if (drumVoice && drumMorphKey && isStateNumericValue) {
          const drumMorphPosition = prev[drumMorphKey] as number; // 0-1
          // Store override at current morph position (works for both endpoints and mid-morph)
          const nextDrumMorphOverrideState = dispatchDrumMorphProductControlAction(prev, {
            type: 'drum-morph/override-set',
            voice: drumVoice,
            param: keyStr,
            value: stateValue as number,
            morphPosition: drumMorphPosition,
          });
          drumMorphProductControlChanged = nextDrumMorphOverrideState !== drumMorphOverrideState;
          drumMorphOverrideState = nextDrumMorphOverrideState;
        }

        newState = applyRoutingActivationForSliderValue(prev, newState as SliderState, key, stateValue);
        newState = preserveRunningDrumSequencerSource(prev, newState as SliderState);
        newState = normalizeRoutingRuntimeEnabledFlags(newState as SliderState);

        // When drum morph slider or preset selectors change, apply morphed values to sliders.
        const drumPresetRoute = getDrumVoicePresetRoute(key);
        const drumMorphRoute = getDrumVoiceMorphRoute(key);
        const drumSelectorRoute = drumPresetRoute ?? drumMorphRoute;
        if (drumSelectorRoute) {
          const voice = drumSelectorRoute.voice;
          // Clear only the relevant endpoint's overrides when a preset changes
          // This preserves user edits at the OTHER endpoint
          if (key === drumSelectorRoute.presetAKey) {
            const nextDrumMorphOverrideState = dispatchDrumMorphProductControlAction(prev, {
              type: 'drum-morph/endpoint-clear',
              voice,
              endpoint: 0,
            });
            drumMorphProductControlChanged = drumMorphProductControlChanged
              || nextDrumMorphOverrideState !== drumMorphOverrideState;
            drumMorphOverrideState = nextDrumMorphOverrideState;
          } else if (key === drumSelectorRoute.presetBKey) {
            const nextDrumMorphOverrideState = dispatchDrumMorphProductControlAction(prev, {
              type: 'drum-morph/endpoint-clear',
              voice,
              endpoint: 1,
            });
            drumMorphProductControlChanged = drumMorphProductControlChanged
              || nextDrumMorphOverrideState !== drumMorphOverrideState;
            drumMorphOverrideState = nextDrumMorphOverrideState;
          }

          // Clear mid-morph overrides when reaching an endpoint (keep endpoint edits)
          if (key === drumSelectorRoute.morphKey) {
            const morphValue = value as number;
            if (isAtEndpoint0(morphValue) || isAtEndpoint1(morphValue)) {
              const nextDrumMorphOverrideState = dispatchDrumMorphProductControlAction(prev, {
                type: 'drum-morph/midpoint-clear',
                voice,
              });
              drumMorphProductControlChanged = drumMorphProductControlChanged
                || nextDrumMorphOverrideState !== drumMorphOverrideState;
              drumMorphOverrideState = nextDrumMorphOverrideState;
            }
          }

          // Apply morphed preset values to the state
          const morphedParams = applyMorphToState(newState, voice, drumMorphOverrideState);
          newState = { ...newState, ...morphedParams };
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PAD SYNTH PRESET MORPH SYSTEM
        // When padMorph slider changes, morph between padPresetA & padPresetB
        // and apply the resulting params to state
        // ═══════════════════════════════════════════════════════════════════════
        if (key === 'padMorph') {
          applyPadPresetMorphToState(newState as SliderState, 'pad1', padMorphEndpointOverridesRef.current);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PAD 2 PRESET MORPH SYSTEM
        // When pad2Morph slider changes, morph between pad2PresetA & pad2PresetB
        // and apply the resulting params to pad2 state keys
        // ═══════════════════════════════════════════════════════════════════════
        if (key === 'pad2Morph') {
          applyPadPresetMorphToState(newState as SliderState, 'pad2', padMorphEndpointOverridesRef.current);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // WATER PRESET MORPH SYSTEM
        // When waterMorph slider changes, morph between waterMorphA & waterMorphB
        // ═══════════════════════════════════════════════════════════════════════
        if (key === 'waterMorph' || key === 'waterMorphA' || key === 'waterMorphB') {
          const morphed = morphWaterPresets(newState.waterMorphA as number, newState.waterMorphB as number, newState.waterMorph as number);
          for (const k of WATER_MORPH_PARAM_KEYS) {
            if (k in morphed) {
              (newState as Record<string, unknown>)[k] = morphed[k];
            }
          }
          // Snap waterPreset to nearest morph endpoint
          newState.waterPreset = (newState.waterMorph as number) < 0.5 ? (newState.waterMorphA as number) : (newState.waterMorphB as number);
        }

        newState = normalizePadFilterCutoffPairs(newState, key);
        if (padMorphParamChange) {
          rememberPadMorphEndpointState(padMorphEndpointOverridesRef.current, newState, padMorphParamChange.scope);
        }

        if (preservedEnabledFlags) {
          newState = restoreRuntimeEnabledFlags(newState as SliderState, preservedEnabledFlags);
          newState = preserveRunningDrumSequencerSource(prev, newState as SliderState);
        }

        applyMorphEndpointStatePatch(prev, newState);
        if (
          drumVoice
          && drumMorphKey
          && isStateNumericValue
          && drumMorphProductControlChanged
        ) {
          scheduleProductRuntimeParamUpdate(newState as SliderState, {
            immediate: true,
            reason: 'morph-control-change',
            triggerCritical: true,
          });
        }
        return newState;
      });

      // Apply water preset dual ranges when morph endpoints or position change
      if (key === 'waterMorph' || key === 'waterMorphA' || key === 'waterMorphB') {
        // Read target preset from latest state
        setState((prev) => {
          const presetIdx = prev.waterPreset as number;
          const ranges = getWaterPresetDualRanges(presetIdx);
          const modes = getWaterPresetSliderModes(presetIdx);

          // Water surf keys that presets can control
          const waterSurfKeys = ['waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfProximity', 'waterSurfDepth'];

          // Merge preset ranges into existing dual ranges (additive, not replacing)
          setSliderModes((prev) => {
            const next = { ...prev };
            for (const k of waterSurfKeys) {
              if (modes[k]) next[k] = modes[k];
              else delete next[k];
            }
            return next;
          });
          setDualSliderRanges((prev) => {
            const next = { ...prev };
            for (const k of waterSurfKeys) {
              if (ranges[k]) (next as Record<string, { min: number; max: number }>)[k] = ranges[k];
              else delete (next as Record<string, unknown>)[k];
            }
            return next;
          });
          return prev; // no state change here
        });
      }

      // When a preset changes, only reset dual slider modes/ranges if we're at that endpoint
      // If preset A changes and we're at endpoint 1 (B), preserve the current dual modes
      const presetRoute = getDrumVoicePresetRoute(key);
      if (presetRoute) {
        const currentMorph = state[presetRoute.morphKey] as number;

        // Determine if we should reset dual modes
        // Only reset if we're at the endpoint matching the changed preset
        const isPresetA = key === presetRoute.presetAKey;
        const atEndpoint0 = isAtEndpoint0(currentMorph);
        const atEndpoint1 = isAtEndpoint1(currentMorph);

        // Reset dual modes only if:
        // - Preset A changed and we're at endpoint 0 (or mid-morph)
        // - Preset B changed and we're at endpoint 1 (or mid-morph)
        const shouldResetDualModes = (isPresetA && !atEndpoint1) || (!isPresetA && !atEndpoint0);

        if (shouldResetDualModes) {
          // Reset all dual modes for params starting with this prefix (excluding Morph/Preset keys)
          setSliderModes((prev) => {
            const next = { ...prev };
            for (const modeKey of Object.keys(prev)) {
              if (getDrumVoiceParamRoute(modeKey)?.voice === presetRoute.voice) {
                delete next[modeKey];
              }
            }
            return next;
          });
          // Also clear the ranges
          setDualSliderRanges((prev) => {
            const newRanges = { ...prev };
            for (const rangeKey of Object.keys(prev)) {
              if (getDrumVoiceParamRoute(rangeKey)?.voice === presetRoute.voice) {
                delete newRanges[rangeKey as keyof typeof newRanges];
              }
            }
            return newRanges;
          });
        }
      }

      // Apply interpolated dual range overrides for drum morph
      // This happens at EVERY morph position, not just endpoints
      // Mimics lerpPresets behavior: ranges interpolate smoothly, mode only snaps when range collapses
      const morphRoute = getDrumVoiceMorphRoute(key);
      if (morphRoute) {
        const morphVoice = morphRoute.voice;
        const morphValue = value as number;

        // Build current values map for fallback
        // We need to read current state values for the interpolation
        const currentValues: Record<string, number> = {};
        const drumMorphOverrideState = getCurrentDrumMorphOverrideState();
        const overrides = getProductDrumMorphDualRangeOverrides(drumMorphOverrideState, morphVoice);
        for (const param of Object.keys(overrides)) {
          const stateVal = state[param as keyof SliderState];
          if (typeof stateVal === 'number') {
            currentValues[param] = stateVal;
          }
        }

        // Get interpolated dual ranges for all params
        const interpolatedRanges = interpolateProductDrumMorphDualRanges(
          drumMorphOverrideState,
          morphVoice,
          morphValue,
          currentValues,
        );

        // Apply the interpolated states
        for (const [param, interpState] of Object.entries(interpolatedRanges)) {
          const paramKey = param as keyof SliderState;

          if (interpState.isDualMode && interpState.range) {
            // Interpolated to dual mode - enable and set range
            setSliderModes((prev) => ({
              ...prev,
              [paramKey as string]: prev[paramKey as string] ?? 'sampleHold',
            }));
            setDualSliderRanges((prev) => ({
              ...prev,
              [paramKey]: interpState.range!,
            }));
          } else {
            // Interpolated to single mode - disable dual
            setSliderModes((prev) => {
              const next = { ...prev };
              delete next[paramKey as string];
              return next;
            });
            setDualSliderRanges((prev) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [paramKey]: _, ...rest } = prev;
              return rest as typeof prev;
            });
          }
        }
      }
    },
    [
      isJourneyPlaying,
      morphPosition,
      morphPresetA,
      morphPresetB,
      state,
      applyMorphEndpointStatePatch,
      scheduleProductRuntimeParamUpdate,
      getCurrentDrumMorphOverrideState,
      dispatchDrumMorphProductControlAction,
    ],
  );

  // Handle slider change
  const handleSliderChange = useCallback(
    (key: keyof SliderState, value: number | string) => {
      handleSliderChangeWithOptions(key, value);
    },
    [handleSliderChangeWithOptions],
  );

  const handleRoutingColumnChange = useCallback(
    (key: keyof SliderState, value: number) => {
      handleSliderChangeWithOptions(key, value, { preserveEnabledFlags: true });
    },
    [handleSliderChangeWithOptions],
  );

  const handleRoutingParamChange = useCallback(
    (key: keyof SliderState, value: number) => {
      handleSliderChangeWithOptions(key, value, { preserveEnabledFlags: true });
    },
    [handleSliderChangeWithOptions],
  );

  const handleRoutingBooleanParamChange = useCallback(
    (key: keyof SliderState, value: boolean) => {
      hasUserInteractedRef.current = true;
      setState((prev) => {
        if (prev[key] === value) return prev;
        const nextState = {
          ...prev,
          [key]: value,
        } as SliderState;
        applyMorphEndpointStatePatch(prev, nextState);
        return nextState;
      });
    },
    [applyMorphEndpointStatePatch],
  );

  // Helper to create slider props with dual mode support
  const sliderProps = useCallback(
    (
      paramKey: keyof SliderState,
    ): {
      mode: SliderMode;
      dualRange?: DualSliderRange;
      walkPosition?: number;
      isFlashing?: boolean;
      onCycleMode?: (key: keyof SliderState) => void;
      onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
    } => {
      const keyStr = paramKey as string;
      const productRuntimeRangeSupported = productRuntimeSupportsRangeKey(keyStr);
      const dualModeSupported = !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);
      const resolvedDualModeSupported = dualModeSupported && !isReleaseCommittedTransportTimingKey(paramKey);
      const mode: SliderMode = resolvedDualModeSupported ? (normalizeDualSliderMode(keyStr, sliderModes[keyStr]) ?? 'single') : 'single';
      const walkPos = getRuntimeSliderPosition(keyStr, mode);
      const isFlashing = getRuntimeSliderFlashing(keyStr, mode);

      return {
        mode,
        dualRange: resolvedDualModeSupported ? dualSliderRanges[paramKey] : undefined,
        walkPosition: resolvedDualModeSupported && productRuntimeRangeSupported ? walkPos : undefined,
        isFlashing: resolvedDualModeSupported && productRuntimeRangeSupported ? isFlashing : false,
        onCycleMode: resolvedDualModeSupported ? handleCycleSliderMode : undefined,
        onDualRangeChange: resolvedDualModeSupported ? handleDualRangeChange : undefined,
      };
    },
    [productRuntimeSupportsRangeKey, sliderModes, dualSliderRanges, handleCycleSliderMode, handleDualRangeChange],
  );

  const shouldDisableLeadRandomTiming = useCallback((nextState: SliderState): boolean => {
    if (!nextState.leadRandomEnabled) return false;
    const randomSource = String(nextState.leadRandomSource ?? 'lead1');
    if (randomSource === 'pad1') return !nextState.padEnabled;
    if (randomSource === 'pad2') return !nextState.pad2Enabled;
    if (randomSource === 'lead2') return !nextState.lead2Enabled;
    if (randomSource === 'piano') return !nextState.pianoEnabled && !nextState.sample1Enabled;
    if (randomSource === 'sample1') return !nextState.sample1Enabled;
    if (randomSource === 'sample2') return !nextState.sample2Enabled;
    return !nextState.leadEnabled;
  }, []);

  const enableLeadRandomTimingSource = useCallback((nextState: SliderState): void => {
    const randomSource = String(nextState.leadRandomSource ?? 'lead1');
    if (randomSource === 'pad1') {
      nextState.padEnabled = true;
    } else if (randomSource === 'pad2') {
      nextState.pad2Enabled = true;
    } else if (randomSource === 'lead2') {
      nextState.lead2Enabled = true;
    } else if (randomSource === 'piano') {
      nextState.pianoEnabled = true;
      nextState.sample1Enabled = true;
    } else if (randomSource === 'sample1') {
      nextState.sample1Enabled = true;
    } else if (randomSource === 'sample2') {
      nextState.sample2Enabled = true;
    } else {
      nextState.leadEnabled = true;
    }
  }, []);

  // Handle select change
  const handleSelectChange = useCallback(
    <K extends keyof SliderState>(key: K, value: SliderState[K]) => {
      // Mark that user has interacted with the UI
      hasUserInteractedRef.current = true;
      const padMorphParamChange = getPadMorphParamChange(key);
      setState((prev) => {
        let newState: SliderState = { ...prev, [key]: value } as SliderState;
        if (isTransportClockStateKey(key)) {
          newState = normalizeTransportClockState(newState);
        }
        if (isLeadPresetSlotKey(key) && prev[key] !== value) {
          pendingImmediateLeadPresetSyncRef.current = true;
        }

        if (key === 'chordProgressionPattern' && Array.isArray(value)) {
          const stepCount = Math.max(1, prev.chordProgressionSteps ?? 1, value.length);
          const pattern = [...value];
          while (pattern.length < stepCount) pattern.push(0);
          newState.chordProgressionPattern = pattern.slice(0, stepCount);
        }

        if (key === 'chordProgressionStepEnabled' && Array.isArray(value)) {
          const stepCount = Math.max(1, prev.chordProgressionSteps ?? 1, value.length);
          const enabled = [...value];
          while (enabled.length < stepCount) enabled.push(true);
          newState.chordProgressionStepEnabled = enabled.slice(0, stepCount);
        }

        // ═══ PAD PRESET MORPH: when preset A or B changes, re-morph and apply ═══
        if (key === 'padPresetA' || key === 'padPresetB') {
          clearPadMorphEndpointState(padMorphEndpointOverridesRef.current, 'pad1', key === 'padPresetA' ? 'a' : 'b');
          applyPadPresetMorphToState(newState, 'pad1', padMorphEndpointOverridesRef.current);
        }

        // ═══ PAD 2 PRESET MORPH: when pad2 preset A or B changes, re-morph and apply ═══
        if (key === 'pad2PresetA' || key === 'pad2PresetB') {
          clearPadMorphEndpointState(padMorphEndpointOverridesRef.current, 'pad2', key === 'pad2PresetA' ? 'a' : 'b');
          applyPadPresetMorphToState(newState, 'pad2', padMorphEndpointOverridesRef.current);
        }

        if (key === 'lead1PresetA' || key === 'lead1PresetB') {
          newState.lead1UseCustomAdsr = false;
          applyLiveLeadMorphToPresetChange(newState, 'lead1');
        }

        if (key === 'lead2PresetC' || key === 'lead2PresetD') {
          newState.lead2UseCustomAdsr = false;
          applyLiveLeadMorphToPresetChange(newState, 'lead2');
        }

        // ═══ GRANULAR ↔ GRANULAR SYNC: granularEnabled controls granularEnabled ═══
        if (key === 'granularEnabled') {
          newState.granularEnabled = value as boolean;
        }

        // ═══ GRANULAR PRESET: apply partial state overrides ═══
        if (key === 'granularPreset') {
          const presetData = getGranularPresetData(value as string);
          if (presetData) {
            const delayBGranularLinked = newState.delayBGranularLinked ?? true;
            for (const k of Object.keys(presetData)) {
              if (!delayBGranularLinked && isGranularDelayBStateKey(k)) {
                continue;
              }
              if (k in newState) {
                (newState as unknown as Record<string, unknown>)[k] = (presetData as Record<string, unknown>)[k];
              }
            }
            if (delayBGranularLinked) {
              // Auto-set the Granular → Delay B send when loading a preset that uses delay
              if (!('granularDelayBSend' in presetData)) {
                newState.granularDelayBSend = presetData.granularDelayEnabled === true ? 1 : 0;
              }
              if ((newState.granularDelayBSend ?? 0) > 0) {
                newState.granularDelayEnabled = true;
              }
            }
          }
        }

        // ═══ WATER MORPH: re-interpolate when morph endpoint A/B changes ═══
        if (key === 'waterMorphA' || key === 'waterMorphB') {
          const morphed = morphWaterPresets(newState.waterMorphA as number, newState.waterMorphB as number, newState.waterMorph as number);
          for (const k of WATER_MORPH_PARAM_KEYS) {
            if (k in morphed) {
              (newState as unknown as Record<string, unknown>)[k] = morphed[k];
            }
          }
          newState.waterPreset = (newState.waterMorph as number) < 0.5 ? (newState.waterMorphA as number) : (newState.waterMorphB as number);
        }

        // ═══ INSECT ENGINE DEFAULTS: apply per-engine param defaults on change ═══
        if (key === 'insectsEngine') {
          const defs = INSECT_ENGINE_DEFAULTS[value as number];
          if (defs) {
            (newState as unknown as Record<string, unknown>).insectsDensity = defs.density;
            (newState as unknown as Record<string, unknown>).insectsTemperature = defs.temperature;
            (newState as unknown as Record<string, unknown>).insectsDistance = defs.distance;
            (newState as unknown as Record<string, unknown>).insectsProximity = defs.proximity;
            (newState as unknown as Record<string, unknown>).insectsAntiphony = defs.antiphony;
            (newState as unknown as Record<string, unknown>).insectsClickRate = defs.clickRate;
            (newState as unknown as Record<string, unknown>).insectsMotion = defs.motion;
          }
        }
        if (key === 'insects2Engine') {
          const defs = INSECT_ENGINE_DEFAULTS[value as number];
          if (defs) {
            (newState as unknown as Record<string, unknown>).insects2Density = defs.density;
            (newState as unknown as Record<string, unknown>).insects2Temperature = defs.temperature;
            (newState as unknown as Record<string, unknown>).insects2Distance = defs.distance;
            (newState as unknown as Record<string, unknown>).insects2Proximity = defs.proximity;
            (newState as unknown as Record<string, unknown>).insects2Antiphony = defs.antiphony;
            (newState as unknown as Record<string, unknown>).insects2ClickRate = defs.clickRate;
            (newState as unknown as Record<string, unknown>).insects2Motion = defs.motion;
          }
        }

        if ((key === 'sample1LibraryKey' || key === 'sample2LibraryKey') && typeof value === 'string') {
          applySampleLibrarySelectionDefaultsToFlatState(newState as unknown as Record<string, unknown>, key === 'sample2LibraryKey' ? 'sample2' : 'sample1', value as SampleLibraryKey);
        }

        if (key === 'leadRandomSource') {
          newState.leadRandomSource = value === 'piano' ? 'sample1' : newState.leadRandomSource;
          if (newState.leadRandomEnabled) enableLeadRandomTimingSource(newState);
        } else if (key === 'leadRandomEnabled' && value === true) {
          enableLeadRandomTimingSource(newState);
        }

        if (shouldDisableLeadRandomTiming(newState)) {
          newState.leadRandomEnabled = false;
        }

        let normalizedState = normalizePadFilterCutoffPairs(newState, key);
        normalizedState = preserveRunningDrumSequencerSource(prev, normalizedState, {
          allowExplicitDrumDisable: key === 'drumEnabled',
        });
        if (padMorphParamChange) {
          rememberPadMorphEndpointState(padMorphEndpointOverridesRef.current, normalizedState, padMorphParamChange.scope);
        }
        applyMorphEndpointStatePatch(prev, normalizedState);
        return normalizedState;
      });

      // Apply granular preset slider modes (outside setState since sliderModes is separate state)
      if (key === 'granularPreset') {
        const modes = getGranularPresetSliderModes(value as string);
        if (modes) {
          // 1. Update slider modes
          setSliderModes((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
              if (k.startsWith('granularV')) delete next[k];
            }
            for (const [k, v] of Object.entries(modes)) {
              next[k] = v as SliderMode;
            }
            return next;
          });

          // 2. Initialise dualSliderRanges for walk/sampleHold keys
          //    so that the walk animation and sampleHold triggers actually fire.
          const presetData = getGranularPresetData(value as string);
          const newDualRanges: DualSliderState = {};
          const newWalkPositions: Record<string, number> = {};
          for (const [k, mode] of Object.entries(modes)) {
            const paramKey = k as keyof SliderState;
            const info = getParamInfo(paramKey);
            if (!info) continue;
            // Centre the walk range around the preset value (20% of full range)
            const presetValue = presetData?.[k as keyof typeof presetData] as SliderState[keyof SliderState] | undefined;
            const currentVal = getSliderNumericValue(paramKey, presetValue ?? state[paramKey]) ?? (info.min + info.max) * 0.5;
            const rangeSize = (info.max - info.min) * 0.2;
            const rMin = Math.max(info.min, currentVal - rangeSize / 2);
            const rMax = Math.min(info.max, currentVal + rangeSize / 2);
            newDualRanges[paramKey] = { min: rMin, max: rMax };

            if (mode === 'walk') {
              newWalkPositions[k] = 0.5;
            }
          }
          // Merge with existing non-granular ranges
          setDualSliderRanges((prev) => {
            const next: Record<string, DualSliderRange | undefined> = {
              ...prev,
            };
            for (const k of Object.keys(next)) {
              if (k.startsWith('granularV')) delete next[k];
            }
            Object.assign(next, newDualRanges);
            return next as DualSliderState;
          });
          resetRuntimeWalkPositionsForKeys(
            Object.keys(DEFAULT_STATE).filter((key) => key.startsWith('granularV')),
            newWalkPositions,
          );
        }
      }
    },
    [shouldDisableLeadRandomTiming, enableLeadRandomTimingSource, applyMorphEndpointStatePatch],
  );

  useEffect(() => {
    if (!shouldDisableLeadRandomTiming(state)) return;
    setState((prev) => {
      if (!shouldDisableLeadRandomTiming(prev)) return prev;
      return { ...prev, leadRandomEnabled: false };
    });
  }, [
    shouldDisableLeadRandomTiming,
    state.padEnabled,
    state.pad2Enabled,
    state.leadEnabled,
    state.lead2Enabled,
    state.pianoEnabled,
    state.sample1Enabled,
    state.sample2Enabled,
    state.leadRandomEnabled,
    state.leadRandomSource,
  ]);

  const handleStateChange = useCallback<React.Dispatch<React.SetStateAction<SliderState>>>(
    (nextStateOrUpdater) => {
      setState((prev) => {
        let nextState = typeof nextStateOrUpdater === 'function' ? (nextStateOrUpdater as (prevState: SliderState) => SliderState)(prev) : nextStateOrUpdater;
        if (leadPresetSlotsChanged(prev, nextState)) {
          pendingImmediateLeadPresetSyncRef.current = true;
          nextState = applyLiveLeadMorphToChangedPresetSlots(prev, nextState);
        }
        let drumMorphOverrideState = getCurrentDrumMorphOverrideState(prev);
        let drumPresetSlotChanged = false;
        for (const [key, config] of Object.entries(DRUM_PRESET_SLOT_CHANGE)) {
          const stateKey = key as keyof SliderState;
          if (Object.is(prev[stateKey], nextState[stateKey])) continue;
          drumPresetSlotChanged = true;
          drumMorphOverrideState = dispatchDrumMorphProductControlAction(prev, {
            type: 'drum-morph/endpoint-clear',
            voice: config.voice,
            endpoint: config.endpoint,
          });
          nextState = {
            ...nextState,
            ...applyMorphToState(nextState, config.voice, drumMorphOverrideState),
          };
        }
        if (drumPresetSlotChanged) {
          pendingImmediateLeadPresetSyncRef.current = true;
        }
        nextState = preserveRunningDrumSequencerSource(prev, nextState);
        rememberChangedPadMorphEndpointStates(padMorphEndpointOverridesRef.current, prev, nextState);
        applyMorphEndpointStatePatch(prev, nextState);
        return nextState;
      });
    },
    [applyMorphEndpointStatePatch, dispatchDrumMorphProductControlAction, getCurrentDrumMorphOverrideState],
  );

  useEffect(() => {
    if (!sonicParityMode) return;
    let cancelled = false;
    import('./audio/sonicParityHarness')
      .then(({ installSonicParityHarness }) => {
        if (cancelled) return;
        installSonicParityHarness({ getState: () => stateRef.current });
      })
      .catch((error) => {
        console.error('Failed to install sonic parity harness:', error);
      });
    return () => {
      cancelled = true;
      window.__kesshoSonicParity?.teardown();
    };
  }, [sonicParityMode]);

  const {
    advancedTransportButton,
    fadeOutAndStopForPresetLoad,
    handleStart,
    handleStop,
    journeyPlaybackProps,
    snowflakePlaybackProps,
    snowflakePrototypePlaybackProps,
    startJourneyPlayback,
    stopJourneyMorphPlaybackRef,
  } = useProductRuntimePlaybackSurface({
    snowflakeActivated,
    setSnowflakeActivated,
    stateRef,
    hasLoadedPresetRef,
    hasUserInteractedRef,
    resolveDefaultAutoStartPreset,
    normalizePresetForWeb,
    setState,
    setStatePresetName,
    setMorphPresetA,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
    onRoutingMuteGroupsLoad: restoreRoutingMuteGroupsFromPreset,
    startProductPlayback,
    startArmedRecordingAfterPlaybackStart,
    dualRanges: nativeDualRanges,
    title: statePresetName || 'Generative Ambient',
    stopProductPlayback,
    isJourneyPlaying,
    stopJourney: journey.stop,
    setIsJourneyPlaying,
    resetPlaybackTimer,
    playbackIsRunning,
    journey: {
      activeJourneyPresetName,
      config: journey.config,
      play: journey.play,
      validation: activeJourneyValidation,
    },
    fadeProductRuntimeOutput,
  });

  const { requestSequencerPlaybackStart } = useLazySequencerTransport({
    activeTab,
    uiMode,
    playbackIsRunning,
    isJourneyPlaying,
    stateRef,
    handleSelectChange,
    startPlayback: handleStart,
    isEditableShortcutTarget,
    drumLaneEnableTouchedRef,
  });

  const {
    macAudioOutputStatus,
    macAirPlayPerformanceActive,
    handleMacAirPlayPerformanceToggle,
    openMacSoundSettings,
    nativeProductRendererDiagnosticStatus,
  } = useProductRuntimePlatformSurface({
    active: capacitorAudioSessionDiagnosticActive,
    setActive: setCapacitorAudioSessionDiagnosticActive,
    macShellAvailable,
    title: statePresetName || morphSlotAName || 'Generative Ambient',
    playbackIsRunning,
    isJourneyPlaying,
    state,
    dualRanges: nativeDualRanges,
    preloadProductRuntime,
    startProductPlayback: handleStart,
    stopProductPlayback: handleStop,
  });

  const productPageRuntimeSurface = useProductRuntimePageSurface({
    telemetry: {
      getEarthTextureDebugState,
      getProductDynamicsVisualTelemetry,
      getProductGranularActiveGrainCount,
      getProductGranularBufferWaveform,
      getProductGranularVoicePositions,
      getProductGranularVisualEvents,
      getProductGranularWriteHeadPosition,
      getProductLeadMorphedParams,
      getProductPadFilterFreq,
      getProductPadLfoValue,
      liveLeadMorphedParamsAvailable,
      liveWaveformTelemetryAvailable,
      productRuntimeDebugAnalysers,
      setProductGranularUiActive,
      textureDebugAvailable,
    },
    sequencer: {
      captureProductSynthEuclidLaneHome,
      captureProductDrumEuclidLaneHome,
      diceProductSynthEuclidLane,
      diceProductDrumEuclidLane,
      drumClockDivsRef,
      drumEvolveConfigsRef,
      drumLinkedRef,
      drumPitchSettingsRef,
      drumStepOverridesRef,
      drumSubLaneStatesRef,
      drumSwingsRef,
      resetProductDrumEuclidLaneHome,
      resetProductSynthEuclidLaneHome,
      setProductDrumEuclidClockDivs,
      setProductDrumEuclidEvolveConfigs,
      setProductDrumEuclidSwings,
      setProductDrumStepOverrides,
      setProductDrumSubLaneEnabled,
      setProductDrumPitchSettings,
      setProductSynthEuclidClockDivs,
      setProductSynthEuclidEvolveConfigs,
      setProductSynthEuclidSwings,
      setProductSynthPitchBindingModes,
      setProductSynthPitchSettings,
      setProductSynthStepOverrides,
      setProductSynthSubLaneEnabled,
      synthClockDivsRef,
      synthEvolveConfigsRef,
      synthLinkedRef,
      synthPitchBindingModesRef,
      synthPitchSettingsRef,
      synthArpConfigsRef,
      synthStepOverridesRef,
      synthSubLaneStatesRef,
      synthSwingsRef,
    },
    control: {
      onRequestPlaybackStart: requestSequencerPlaybackStart,
      preloadProductRuntime,
      productRuntimeManualTriggers,
      productRuntimeMode,
      stateRef,
      setProductDrumEvolveTriggerCallback,
      setProductDrumStepPositionCallback,
      setProductDrumTriggerCallback,
      setProductSynthEvolveTriggerCallback,
      setProductSynthAnchorWalkerVisualStateCallback,
      setProductSynthOrbitVisualStateCallback,
      setProductSynthStepPositionCallback,
    },
  });

  const midiLiveNoteStart = productPageRuntimeSurface.synthPageRuntimeProps.onLiveNoteStart;
  const midiLiveNoteStop = productPageRuntimeSurface.synthPageRuntimeProps.onLiveNoteStop;
  const midiLiveNoteInput = useLiveNoteInput({
    start: (event) => midiLiveNoteStart?.(event),
    stop: (event) => midiLiveNoteStop?.(event),
  });
  const previousMidiLiveNoteBridgeRef = useRef({ midiLiveNoteStart, midiLiveNoteStop });
  useEffect(() => {
    const previous = previousMidiLiveNoteBridgeRef.current;
    if (previous.midiLiveNoteStart !== midiLiveNoteStart || previous.midiLiveNoteStop !== midiLiveNoteStop) {
      midiLiveNoteInput.releaseAll();
      previousMidiLiveNoteBridgeRef.current = { midiLiveNoteStart, midiLiveNoteStop };
    }
  }, [midiLiveNoteInput, midiLiveNoteStart, midiLiveNoteStop]);
  const handleMidiLiveNoteEvent = useCallback((event: ProductLiveNoteEvent, inputId: string): boolean => {
    // Drum MIDI retains its native one-shot routing semantics; the shared owned-note
    // lifecycle is for sustained synth sources with paired note-offs.
    if (event.instrument === 'drum') return false;
    if (event.kind === 'live-note-off') {
      return midiLiveNoteInput.noteOff(inputId, {
        timestampMs: event.timestampMs,
        timestampHostTime: event.timestampHostTime,
        timestampAudioFrame: event.timestampAudioFrame,
      });
    }
    return midiLiveNoteInput.noteOn(inputId, {
      source: 'midi',
      instrument: event.instrument,
      note: event.note,
      velocity: event.velocity,
      channel: event.channel,
      timestampMs: event.timestampMs,
      timestampHostTime: event.timestampHostTime,
      timestampAudioFrame: event.timestampAudioFrame,
    });
  }, [midiLiveNoteInput]);

  // Result type for lerpPresets - includes both state and dual ranges
  interface LerpResult {
    state: SliderState;
    dualRanges: DualSliderState;
    dualModes: Record<string, SliderMode>;
    // CoF morph visualization info
    morphCoFInfo?: {
      isMorphing: boolean;
      startRoot: number; // Original starting root (captured at morph start)
      effectiveRoot: number; // Current root during morph (stepping through CoF)
      targetRoot: number; // Final destination root
      cofStep: number; // Current CoF step relative to start
      totalSteps: number; // Total steps in the journey
    };
  }

  // Lerp between two preset states based on morph position (0-100)
  // capturedStartRoot: if provided, use this as the starting root (for consistent morphing)
  // currentCofStep: fallback CoF drift step if capturedStartRoot not provided
  // direction: 'toB' (A→B, 0→100) or 'toA' (B→A, 100→0)
  const lerpPresets = useCallback(
    (presetA: SavedPreset, presetB: SavedPreset, t: number, currentCofStep: number = 0, capturedStartRoot?: number, direction: 'toA' | 'toB' = 'toB'): LerpResult => {
      const stateA = {
        ...DEFAULT_STATE,
        ...normalizePresetForWeb(presetA.state),
      };
      const stateB = {
        ...DEFAULT_STATE,
        ...normalizePresetForWeb(presetB.state),
      };
      const result = { ...stateA };
      const morphPosition = clampMorphPosition(t, true);
      const tNorm = morphPosition / 100; // Normalize to 0-1

      // Handle rootNote via Circle of Fifths path
      // Direction determines which preset we're morphing FROM and TO:
      // - 'toB': morph A → B (slider 0→100), capturedStartRoot is A's effective root
      // - 'toA': morph B → A (slider 100→0), capturedStartRoot is B's effective root
      let fromRoot: number;
      let toRoot: number;
      let cofMorphT: number; // The t value to use for CoF path progression

      if (direction === 'toB') {
        // Morphing A → B: from A's root (or captured) to B's root
        fromRoot = capturedStartRoot !== undefined ? capturedStartRoot : stateA.cofDriftEnabled ? calculateDriftedRoot(stateA.rootNote, currentCofStep) : stateA.rootNote;
        toRoot = stateB.rootNote;
        cofMorphT = morphPosition; // 0→100 maps directly
      } else {
        // Morphing B → A: from B's root (or captured) to A's root
        fromRoot = capturedStartRoot !== undefined ? capturedStartRoot : stateB.cofDriftEnabled ? calculateDriftedRoot(stateB.rootNote, currentCofStep) : stateB.rootNote;
        toRoot = stateA.rootNote;
        cofMorphT = 100 - morphPosition; // 100→0 needs to become 0→100 for path progression
      }

      // Get the morphed root note stepping through CoF
      const { currentRoot, cofStep, totalSteps } = getMorphedRootNote(fromRoot, toRoot, cofMorphT);
      result.rootNote = currentRoot;

      // Scale transition: snap at 50% (or when we've completed the CoF journey)
      // For a musical feel, snap scale when we're halfway or past
      result.scaleMode = tNorm < 0.5 ? stateA.scaleMode : stateB.scaleMode;
      result.manualScale = tNorm < 0.5 ? stateA.manualScale : stateB.manualScale;

      // Build morph CoF info for visualization
      const morphCoFInfo =
        fromRoot !== toRoot
          ? {
              isMorphing: true,
              startRoot: fromRoot, // Original starting root (captured at morph start)
              effectiveRoot: currentRoot,
              targetRoot: toRoot,
              cofStep,
              totalSteps,
            }
          : undefined;

      // ─── Router-matrix asymmetric morph ────────────────────────────────────
      // When one preset has an engine OFF and the other has it ON, the engine's
      // router-matrix values (level + delay/granular/reverb sends) should be
      // treated as 0 on the OFF side so the engine smoothly fades in/out through
      // routing. Computed BEFORE dual-range / numeric loops so both honor it.
      const routerMatrixByEngine: Array<{
        isOn: (s: SliderState) => boolean;
        keys: (keyof SliderState)[];
      }> = [
        {
          isOn: (s) => !!s.padEnabled,
          keys: ['synthLevel', 'pad1ReverbSend', 'pad1DelayASend', 'pad1DelayBSend', 'granularPad1Send', 'degradePad1Send'],
        },
        {
          isOn: (s) => !!s.pad2Enabled,
          keys: ['pad2Level', 'pad2ReverbSend', 'pad2DelayASend', 'pad2DelayBSend', 'granularPad2Send', 'degradePad2Send'],
        },
        {
          isOn: (s) => !!s.granularEnabled,
          keys: [
            'granularLevel',
            'granularReverbSend',
            'granularDelayASend',
            'granularDelayBSend',
            'granularDegradeSend',
            'delayAGranularSend',
            'delayBGranularSend',
            'granularPad1Send',
            'granularPad2Send',
            'granularLead1Send',
            'granularLead2Send',
            'granularPianoSend',
            'granularDrumSend',
            'granularWavesSend',
            'granularNatureSend',
            'granularWaterSend',
            'granularInsectsSend',
          ],
        },
        {
          isOn: (s) => !!s.leadEnabled,
          keys: ['leadLevel', 'lead1Level', 'lead1ReverbSend', 'lead1DelayASend', 'lead1DelayBSend', 'delayAReverbSend', 'delayAMix', 'granularLead1Send', 'degradeLead1Send'],
        },
        {
          isOn: (s) => !!s.lead2Enabled,
          keys: ['lead2Level', 'lead2ReverbSend', 'lead2DelayASend', 'lead2DelayBSend', 'granularLead2Send', 'degradeLead2Send'],
        },
        {
          isOn: (s) => !!s.pianoEnabled,
          keys: ['pianoLevel', 'pianoReverbSend', 'pianoDelayASend', 'pianoDelayBSend', 'granularPianoSend', 'degradePianoSend'],
        },
        {
          isOn: (s) => !!s.drumEnabled,
          keys: ['drumLevel', 'drumReverbSend', 'drumDelayASend', 'drumDelayBSend', 'granularDrumSend', 'degradeDrumSend'],
        },
        {
          isOn: (s) => !!s.oceanSampleEnabled,
          keys: ['oceanSampleLevel', 'oceanReverbSend', 'oceanDelayASend', 'oceanDelayBSend', 'granularWavesSend', 'degradeWavesSend'],
        },
        // "Nature" engine = birds OR birds2 OR frogs. Master nature router values
        // collapse to 0 only when ALL nature sub-engines are off on that side.
        {
          isOn: (s) => !!s.birdsEnabled || !!s.birds2Enabled || !!s.frogsEnabled,
          keys: ['natureLevel', 'natureReverbSend', 'natureDelayASend', 'natureDelayBSend', 'granularNatureSend', 'degradeNatureSend'],
        },
        {
          isOn: (s) => !!s.waterEnabled,
          keys: ['waterLevel', 'waterReverbSend', 'waterDelayASend', 'waterDelayBSend', 'granularWaterSend', 'degradeWaterSend'],
        },
        // Insects share bus sends, but each layer has its own dry carrier level.
        {
          isOn: (s) => !!s.insectsEnabled || !!s.insects2Enabled,
          keys: ['insectsSharedLevel', 'insectsReverbSend', 'insDelayASend', 'insDelayBSend', 'granularInsectsSend', 'degradeInsectsSend'],
        },
        { isOn: (s) => !!s.insectsEnabled, keys: ['insectsLevel'] },
        { isOn: (s) => !!s.insects2Enabled, keys: ['insects2Level'] },
        // Per-sub-engine nature levels follow their own toggles.
        { isOn: (s) => !!s.birdsEnabled, keys: ['birdsLevel'] },
        { isOn: (s) => !!s.birds2Enabled, keys: ['birds2Level'] },
        { isOn: (s) => !!s.frogsEnabled, keys: ['frogsLevel'] },
        {
          isOn: (s) => !!s.delayAEnabled,
          keys: ['delayAMix', 'delayAReverbSend', 'delayAToBSend', 'delayAGranularSend', 'delayADegradeSend'],
        },
        {
          isOn: (s) => !!s.granularDelayEnabled,
          keys: ['granularDelayMix', 'granularDelayReverbSend', 'delayBToASend', 'delayBGranularSend', 'delayBDegradeSend'],
        },
        {
          isOn: (s) => Boolean(s.dynamicsEnabled && (s.driftEnabled || s.erosionEnabled)),
          keys: ['degradeLevel', 'degradeReverbSend'],
        },
        { isOn: (s) => !!s.reverbEnabled || (s.reverbDegradeSend ?? 0) > 0.0001 || (s.degradeReverbSend ?? 0) > 0.0001, keys: ['reverbLevel', 'reverbDegradeSend', 'degradeReverbSend'] },
      ];

      // For router-matrix keys with mismatched engine toggle: record which side is OFF.
      // 'A' means stateA's engine is off (treat valA / rangeA as 0); 'B' means stateB's.
      const routerZeroSide = new Map<keyof SliderState, 'A' | 'B'>();
      for (const entry of routerMatrixByEngine) {
        const onA = entry.isOn(stateA);
        const onB = entry.isOn(stateB);
        if (onA === onB) continue; // both on or both off → handled normally
        const offSide: 'A' | 'B' = onA ? 'B' : 'A';
        for (const childKey of entry.keys) {
          if (!routerZeroSide.has(childKey)) {
            routerZeroSide.set(childKey, offSide);
          }
        }
      }

      // Dynamics asymmetric morph:
      // When one side has a Dynamics module effectively OFF (master off or module off)
      // and the other has it ON, fade the module's audible carrier from/to zero.
      // Saturation has no wet mix, so its drive is the fade carrier.
      const dynamicsFadeByModule: Array<{
        isOn: (s: SliderState) => boolean;
        fadeKey: keyof SliderState;
      }> = [
        {
          isOn: (s) => Boolean(s.dynamicsEnabled && s.sidechainEnabled),
          fadeKey: 'sidechainMix',
        },
        {
          isOn: (s) => Boolean(s.dynamicsEnabled && s.driftEnabled),
          fadeKey: 'driftMix',
        },
        {
          isOn: (s) => Boolean(s.dynamicsEnabled && s.erosionEnabled),
          fadeKey: 'erosionMix',
        },
        {
          isOn: (s) => Boolean(s.dynamicsEnabled && s.dynamicsSaturationEnabled),
          fadeKey: 'dynamicsSaturationDrive',
        },
        {
          isOn: (s) => Boolean(s.dynamicsEnabled && s.endCompEnabled),
          fadeKey: 'endCompMix',
        },
      ];

      const dynamicsZeroSide = new Map<keyof SliderState, 'A' | 'B'>();
      for (const entry of dynamicsFadeByModule) {
        const onA = entry.isOn(stateA);
        const onB = entry.isOn(stateB);
        if (onA === onB) continue;
        dynamicsZeroSide.set(entry.fadeKey, onA ? 'B' : 'A');
      }

      // Compute interpolated dual ranges
      const dualRangesA = presetA.dualRanges || {};
      const dualRangesB = presetB.dualRanges || {};
      const rawModesA = presetA.sliderModes || {};
      const rawModesB = presetB.sliderModes || {};
      const resultDualRanges: DualSliderState = {};
      const resultDualModes: Record<string, SliderMode> = {};

      // Get all keys that have dual ranges in either preset
      const allDualKeys = new Set([...Object.keys(dualRangesA), ...Object.keys(dualRangesB)]);

      for (const keyStr of allDualKeys) {
        const key = keyStr as keyof SliderState;
        let rangeA = dualRangesA[keyStr];
        let rangeB = dualRangesB[keyStr];
        const info = getParamInfo(key);
        const fallbackValue = info ? (info.min + info.max) * 0.5 : 0;
        let valA = getSliderNumericValue(key, stateA[key]) ?? fallbackValue;
        let valB = getSliderNumericValue(key, stateB[key]) ?? fallbackValue;

        // Asymmetric morph: collapse the OFF side's value AND range to 0 so
        // engine sends / Dynamics carriers fade in/out instead of jumping.
        const offSide = routerZeroSide.get(key) ?? dynamicsZeroSide.get(key);
        if (offSide === 'A') {
          valA = 0;
          rangeA = undefined;
        } else if (offSide === 'B') {
          valB = 0;
          rangeB = undefined;
        }

        // Resolve effective mode per preset: explicit mode, or infer 'walk' when
        // a dualRange exists without an explicit sliderMode (same default used by
        // applyDualRangesFromPreset). Without this, a missing mode causes the ||
        // fallback chain to pick the OTHER preset's mode, defeating the midpoint snap.
        const modeA = normalizeDualSliderMode(keyStr, rawModesA[keyStr] || (rangeA ? 'walk' : undefined));
        const modeB = normalizeDualSliderMode(keyStr, rawModesB[keyStr] || (rangeB ? 'walk' : undefined));

        let morphedMin: number;
        let morphedMax: number;

        if (rangeA && rangeB) {
          // Dual A → Dual B: morph min→min, max→max
          morphedMin = rangeA.min + (rangeB.min - rangeA.min) * tNorm;
          morphedMax = rangeA.max + (rangeB.max - rangeA.max) * tNorm;
        } else if (rangeA && !rangeB) {
          // Dual A → Single B: both min and max morph toward B's single value
          morphedMin = rangeA.min + (valB - rangeA.min) * tNorm;
          morphedMax = rangeA.max + (valB - rangeA.max) * tNorm;
        } else if (!rangeA && rangeB) {
          // Single A → Dual B: start both at A's value, morph to B's min/max
          morphedMin = valA + (rangeB.min - valA) * tNorm;
          morphedMax = valA + (rangeB.max - valA) * tNorm;
        } else {
          // Neither has dual - shouldn't happen given allDualKeys
          continue;
        }

        // Only add to dual ranges if min !== max (i.e., it's still a range)
        // At t=0 for Single→Dual, min===max (both at valA)
        // At t=100 for Dual→Single, min===max (both at valB)
        const isEffectivelyDual = Math.abs(morphedMax - morphedMin) > 0.001;

        if (isEffectivelyDual) {
          // Midpoint snap for discrete mode handoff (same pattern used for other discrete morph keys)
          resultDualModes[key as string] = tNorm < 0.5 ? modeA || modeB || 'walk' : modeB || modeA || 'walk';
          resultDualRanges[key] = { min: morphedMin, max: morphedMax };
        } else {
          // Collapsed to single value — explicitly mark as 'single' so the merge
          // in handleMorphPositionChange resets any previous 'walk'/'sampleHold' mode
          resultDualModes[key as string] = 'single';
        }
      }

      // Define parent-child relationships for conditional morphing
      // If parent boolean is OFF in the target preset, don't morph child sliders
      const parentChildMap: Record<string, (keyof SliderState)[]> = {
        granularEnabled: [
          'granularReverbSend',
          'granularLevel',
          'granularReverbLPF',
          'granularOutputLPF',
          'granularDelayASend',
          'granularDelayBSend',
          'granularDegradeSend',
          'delayAGranularSend',
          'delayBGranularSend',
          'granularPad1Send',
          'granularPad2Send',
          'granularLead1Send',
          'granularLead2Send',
          'granularPianoSend',
          'granularDrumSend',
          'granularWavesSend',
          'granularNatureSend',
          'granularWaterSend',
          'granularInsectsSend',
        ],
        leadEnabled: [
          'lead1Attack',
          'lead1Decay',
          'lead1Sustain',
          'lead1Release',
          'lead2Attack',
          'lead2Decay',
          'lead2Sustain',
          'lead2Release',
          'delayATime',
          'delayAFeedback',
          'delayAMix',
          'lead1Density',
          'lead1Octave',
          'lead1OctaveRange',
          'leadVibratoDepth',
          'leadVibratoRate',
          'leadGlide',
          'lead1ReverbSend',
          'lead2ReverbSend',
          'delayAReverbSend',
          'lead1DelayASend',
          'lead1DelayBSend',
          'degradeLead1Send',
          'lead2DelayASend',
          'lead2DelayBSend',
          'degradeLead2Send',
        ],
        pianoEnabled: [
          'pianoAttack',
          'pianoDecay',
          'pianoSustain',
          'pianoHold',
          'pianoRelease',
          'pianoLevel',
          'pianoReverbSend',
          'pianoDelayASend',
          'pianoDelayBSend',
          'granularPianoSend',
          'degradePianoSend',
        ],
        synthEuclideanMasterEnabled: ['synthEuclideanTempo'],
        oceanSampleEnabled: ['oceanFilterCutoff', 'oceanFilterResonance', 'oceanDelayASend', 'oceanDelayBSend', 'granularWavesSend', 'degradeWavesSend', 'oceanSliceDuration', 'oceanSliceDensity'],
        birdsEnabled: ['birdsLevel', 'birdsSliceDuration', 'birdsSliceDensity'],
        birds2Enabled: ['birds2Level', 'birds2SliceDuration', 'birds2SliceDensity'],
        frogsEnabled: ['frogsLevel', 'frogsSliceDuration', 'frogsSliceDensity'],
      };

      // Router-matrix child keys (per engine toggle) that represent the engine's
      // contribution into the global mix. The OFF-side substitution is handled
      // above (see routerMatrixByEngine / routerZeroSide); here we only need to
      // ensure router keys are excluded from the midpoint-snap behavior so the
      // asymmetric morph (already baked into stateA/stateB-derived values via
      // routerZeroSide) reaches the numeric loop unimpeded.

      // Determine which keys should be snapped (not morphed) based on parent boolean state.
      // Router-matrix keys are excluded here because they get the asymmetric "off=0" morph below.
      const keysToSnap = new Set<keyof SliderState>();
      for (const [parentKey, childKeys] of Object.entries(parentChildMap)) {
        const parentA = stateA[parentKey as keyof SliderState];
        const parentB = stateB[parentKey as keyof SliderState];
        // If either preset has the parent OFF, snap the children instead of morphing
        if (!parentA || !parentB) {
          for (const childKey of childKeys) {
            if (routerZeroSide.has(childKey)) continue; // router keys morph asymmetrically instead
            keysToSnap.add(childKey);
          }
        }
      }

      // Interpolate all numeric values (except those that should snap)
      const numericKeys: (keyof SliderState)[] = [
        'masterVolume',
        'synthLevel',
        'pad2Level',
        'granularLevel',
        'pad1ReverbSend',
        'pad2ReverbSend',
        'granularReverbSend',
        'pad1DelayASend',
        'pad1DelayBSend',
        'degradePad1Send',
        'pad2DelayASend',
        'pad2DelayBSend',
        'degradePad2Send',
        'lead1DelayASend',
        'lead1DelayBSend',
        'degradeLead1Send',
        'lead2DelayASend',
        'lead2DelayBSend',
        'degradeLead2Send',
        'pianoLevel',
        'pianoReverbSend',
        'pianoDelayASend',
        'pianoDelayBSend',
        'degradePianoSend',
        'drumDelayASend',
        'drumDelayBSend',
        'degradeDrumSend',
        'delayAToBSend',
        'delayAGranularSend',
        'delayADegradeSend',
        'delayBToASend',
        'delayBGranularSend',
        'delayBDegradeSend',
        'granularDelayASend',
        'granularDelayBSend',
        'granularDegradeSend',
        'granularPad1Send',
        'granularPad2Send',
        'granularLead1Send',
        'granularLead2Send',
        'granularPianoSend',
        'granularDrumSend',
        'granularWavesSend',
        'granularNatureSend',
        'granularWaterSend',
        'granularInsectsSend',
        'degradeWavesSend',
        'degradeNatureSend',
        'degradeWaterSend',
        'degradeInsectsSend',
        'drumReverbSend',
        'oceanReverbSend',
        'natureLevel',
        'natureReverbSend',
        'waterLevel',
        'waterReverbSend',
        'insectsLevel',
        'insects2Level',
        'insectsSharedLevel',
        'insectsReverbSend',
        'oceanDelayASend',
        'oceanDelayBSend',
        'natureDelayASend',
        'natureDelayBSend',
        'waterDelayASend',
        'waterDelayBSend',
        'insDelayASend',
        'insDelayBSend',
        'granularReverbLPF',
        'granularOutputLPF',
        'lead1ReverbSend',
        'lead2ReverbSend',
        'delayAReverbSend',
        'reverbLevel',
        'reverbDegradeSend',
        'degradeReverbSend',
        'degradeLevel',
        'randomness',
        'tension',
        'chordRate',
        'voicingSpread',
        'waveSpread',
        'detune',
        'synthAttack',
        'synthDecay',
        'synthSustain',
        'synthHold',
        'synthRelease',
        'padFitEnvelopeToChord',
        'synthVoiceMask',
        'synthOctave',
        'hardness',
        'filterCutoffMin',
        'filterCutoffMax',
        'filterResonance',
        'filterQ',
        'filterSlope',
        'filterKeyTracking',
        'warmth',
        'presence',
        'reverbDecay',
        'reverbSize',
        'reverbDiffusion',
        'reverbModulation',
        'predelay',
        'damping',
        'width',
        'reverbShimmer',
        'reverbShimmerPitch',
        'reverbSlowModRate',
        'reverbSlowModDepth',
        'reverbReverse',
        'reverbReverseLength',
        'grainProbability',
        'grainSize',
        'density',
        'spray',
        'jitter',
        'pitchSpread',
        'stereoSpread',
        'feedback',
        'wetHPF',
        'wetLPF',
        'leadLevel',
        'lead1Level',
        'lead2Level',
        'lead1Attack',
        'lead1Decay',
        'lead1Sustain',
        'lead1Release',
        'lead1PostLPF',
        'lead1PostLPFKeyTracking',
        'lead2PostLPF',
        'lead2PostLPFKeyTracking',
        'lead2Attack',
        'lead2Decay',
        'lead2Sustain',
        'lead2Release',
        'pianoAttack',
        'pianoDecay',
        'pianoSustain',
        'pianoHold',
        'pianoRelease',
        'pianoPostLPF',
        'delayATime',
        'delayAFeedback',
        'delayAMix',
        'lead1Density',
        'lead1Octave',
        'lead1OctaveRange',
        'leadVibratoDepth',
        'leadVibratoRate',
        'leadGlide',
        'synthEuclideanTempo',
        'granularDelayMix',
        'granularDelayReverbSend',
        // Dynamics page
        'dynamicsSaturationDrive',
        'dynamicsSaturationTone',
        'dynamicsSaturationBias',
        'sidechainKeyAWeight',
        'sidechainKeyBWeight',
        'sidechainAmount',
        'sidechainThreshold',
        'sidechainRatio',
        'sidechainKnee',
        'sidechainAttackMs',
        'sidechainHoldMs',
        'sidechainReleaseMs',
        'sidechainMakeup',
        'sidechainMix',
        'sidechainCurve',
        'sidechainDetectorHp',
        'sidechainDetectorLp',
        'sidechainPad1Target',
        'sidechainPad2Target',
        'sidechainLead1Target',
        'sidechainLead2Target',
        'sidechainPianoTarget',
        'sidechainGranularTarget',
        'sidechainDelayATarget',
        'sidechainDelayBTarget',
        'sidechainReverbTarget',
        'driftMix',
        'driftAge',
        'driftBias',
        'driftLpgAmount',
        'driftDepth',
        'driftRate',
        'driftDamp',
        'driftEnvFollow',
        'driftWetHp',
        'driftStereo',
        'driftResonance',
        'erosionMix',
        'erosionAge',
        'erosionGeneration',
        'erosionAlias',
        'erosionWow',
        'erosionFlutter',
        'erosionDrift',
        'erosionNoise',
        'degradeHp',
        'degradeLp',
        'erosionTone',
        'erosionSaturation',
        'erosionCorrosion',
        'erosionModSlowWow',
        'erosionModSlowFlutter',
        'erosionModSlowLp',
        'erosionModSlowWet',
        'erosionModSlowDropout',
        'erosionModSlowAlias',
        'erosionModFlutterWow',
        'erosionModFlutterFlutter',
        'erosionModFlutterLp',
        'erosionModFlutterWet',
        'erosionModFlutterDropout',
        'erosionModFlutterAlias',
        'erosionModRandomWow',
        'erosionModRandomFlutter',
        'erosionModRandomLp',
        'erosionModRandomWet',
        'erosionModRandomDropout',
        'erosionModRandomAlias',
        'erosionModEnvWow',
        'erosionModEnvFlutter',
        'erosionModEnvLp',
        'erosionModEnvWet',
        'erosionModEnvDropout',
        'erosionModEnvAlias',
        'erosionModNoiseWow',
        'erosionModNoiseFlutter',
        'erosionModNoiseLp',
        'erosionModNoiseWet',
        'erosionModNoiseDropout',
        'erosionModNoiseAlias',
        'endCompThreshold',
        'endCompKnee',
        'endCompRatio',
        'endCompAttackMs',
        'endCompReleaseMs',
        'endCompMakeup',
        'endCompMix',
        'endCompDetectorHp',
        'endCompDetectorTilt',
        'endCompAutoMakeup',
        'endCompProgramRelease',
        'oceanSampleLevel',
        'oceanFilterCutoff',
        'oceanFilterResonance',
        'oceanSliceDuration',
        'oceanSliceDensity',
        'birdsLevel',
        'birdsSliceDuration',
        'birdsSliceDensity',
        'birds2Level',
        'birds2SliceDuration',
        'birds2SliceDensity',
        'frogsLevel',
        'frogsSliceDuration',
        'frogsSliceDensity',
        'natureLevel',
        'natureReverbSend',
        'natureDelayASend',
        'natureDelayBSend',
        'granularNatureSend',
        'cofDriftRate',
        'cofDriftRange',
        // Drum morph positions - should interpolate when master morph changes
        'drumSubMorph',
        'drumKickMorph',
        'drumClickMorph',
        'drumBeepHiMorph',
        'drumBeepLoMorph',
        'drumNoiseMorph',
        'drumMembraneMorph',
        // Drum voice params - should interpolate when master morph changes
        'drumLevel',
        'drumSubFreq',
        'drumSubDecay',
        'drumSubLevel',
        'drumSubTone',
        'drumKickFreq',
        'drumKickPitchEnv',
        'drumKickPitchDecay',
        'drumKickDecay',
        'drumKickLevel',
        'drumKickClick',
        'drumClickDecay',
        'drumClickFilter',
        'drumClickResonance',
        'drumClickLevel',
        'drumClickTone',
        'drumClickPitch',
        'drumClickPitchEnv',
        'drumBeepHiFreq',
        'drumBeepHiAttack',
        'drumBeepHiDecay',
        'drumBeepHiTone',
        'drumBeepHiLevel',
        'drumBeepLoFreq',
        'drumBeepLoAttack',
        'drumBeepLoDecay',
        'drumBeepLoTone',
        'drumBeepLoLevel',
        'drumNoiseFilterFreq',
        'drumNoiseFilterQ',
        'drumNoiseAttack',
        'drumNoiseDecay',
        'drumNoiseLevel',
        // Pad Synth 2
        'pad2Attack',
        'pad2Decay',
        'pad2Sustain',
        'pad2Hold',
        'pad2Release',
        'pad2FitEnvelopeToChord',
        'pad2Octave',
        'pad2Hardness',
        'pad2Warmth',
        'pad2Presence',
        'pad2OscMix',
        'pad2FilterCutoffMin',
        'pad2FilterCutoffMax',
        'pad2FilterResonance',
        'pad2FilterQ',
        'pad2FilterSlope',
        'pad2FilterKeyTracking',
        'pad2OscAOctave',
        'pad2OscADetune',
        'pad2OscALevel',
        'pad2OscBOctave',
        'pad2OscBDetune',
        'pad2OscBLevel',
        'pad2SubOctave',
        'pad2SubLevel',
        'pad2NoiseLevel',
        'pad2FilterBCutoff',
        'pad2FilterBResonance',
        'pad2FilterBQ',
        'pad2Lfo1Rate',
        'pad2Lfo1Depth',
        'pad2Lfo2Rate',
        'pad2Lfo2Depth',
        'pad2ModEnvAttack',
        'pad2ModEnvDecay',
        'pad2ModEnvSustain',
        'pad2ModEnvRelease',
        'pad2ModEnvDepth',
        'pad2Morph',
        'pad2MorphSpeed',
        'pad2VoiceAssign',
      ];

      for (const key of numericKeys) {
        const valA = stateA[key];
        const valB = stateB[key];
        if (typeof valA === 'number' && typeof valB === 'number') {
          // Asymmetric morph: when one preset has the source/module OFF and the
          // other ON, treat the OFF side's audible carrier as 0.
          const offSide = routerZeroSide.get(key) ?? dynamicsZeroSide.get(key);
          if (offSide === 'A') {
            // A is off → start at 0, morph to B's value
            (result as Record<string, unknown>)[key] = valB * tNorm;
          } else if (offSide === 'B') {
            // B is off → start at A's value, morph to 0
            (result as Record<string, unknown>)[key] = valA * (1 - tNorm);
          } else if (keysToSnap.has(key)) {
            // If this key should snap (parent is off), snap at 50% instead of morphing
            (result as Record<string, unknown>)[key] = tNorm < 0.5 ? valA : valB;
          } else {
            (result as Record<string, unknown>)[key] = valA + (valB - valA) * tNorm;
          }
        }
      }

      // Snap discrete values at 50% (scaleMode and manualScale handled above with rootNote)
      // Note: reverbQuality is excluded - it's a user preference, not a musical parameter
      const discreteKeys: (keyof SliderState)[] = [
        'seedWindow',
        'filterType',
        'reverbEngine',
        'reverbType',
        'grainPitchMode',
        'cofDriftDirection',
        'leadRandomSource',
        // Dynamics discrete choices
        'driftMode',
        'dynamicsSaturationMode',
        'sidechainKeyA',
        'sidechainKeyB',
        // Drum preset names and discrete settings should snap at 50%
        'drumSubPresetA',
        'drumSubPresetB',
        'drumKickPresetA',
        'drumKickPresetB',
        'drumClickPresetA',
        'drumClickPresetB',
        'drumBeepHiPresetA',
        'drumBeepHiPresetB',
        'drumBeepLoPresetA',
        'drumBeepLoPresetB',
        'drumNoisePresetA',
        'drumNoisePresetB',
        'drumMembranePresetA',
        'drumMembranePresetB',
        'drumNoiseFilterType',
        // Pad Synth 2 discrete
        'pad2FilterType',
        'pad2OscAWave',
        'pad2OscBWave',
        'pad2SubWave',
        'pad2NoiseType',
        'pad2FilterBType',
        'pad2FilterRouting',
        'pad2Lfo1Wave',
        'pad2Lfo1Dest',
        'pad2Lfo2Wave',
        'pad2Lfo2Dest',
        'pad2ModEnvDest',
        'pad2PresetA',
        'pad2PresetB',
      ];
      for (const key of discreteKeys) {
        (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
      }

      // Snap boolean values at 50% (except engine toggles and cofDriftEnabled which have special handling)
      const boolKeys: (keyof SliderState)[] = [
        'lead1UseCustomAdsr',
        'lead2UseCustomAdsr',
        'synthEuclideanMasterEnabled',
        'synthEuclid1Enabled',
        'synthEuclid2Enabled',
        'synthEuclid3Enabled',
        'synthEuclid4Enabled',
        // Drum synth booleans
        'drumSubMorphAuto',
        'drumKickMorphAuto',
        'drumClickMorphAuto',
        'drumBeepHiMorphAuto',
        'drumBeepLoMorphAuto',
        'drumNoiseMorphAuto',
        'drumMembraneMorphAuto',
        // Pad Synth 2 booleans
        'pad2Enabled',
        'pad2SubEnabled',
        'pad2FilterBEnabled',
        'pad2ModEnvEnabled',
        'pad2MorphAuto',
      ];
      for (const key of boolKeys) {
        (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
      }

      // Special handling for engine toggles and cofDriftEnabled:
      // - Off → On: Turn ON immediately when leaving the "off" endpoint (engine fades in via level morph from 0)
      // - On → Off: Keep ON until arriving at the "off" endpoint (engine fades out via level morph to 0)
      const atEndpointA = isAtEndpoint0(morphPosition, true);
      const atEndpointB = isAtEndpoint1(morphPosition, true);

      const engineToggleKeys: (keyof SliderState)[] = [
        'cofDriftEnabled',
        'padEnabled',
        'pad2Enabled',
        'granularEnabled',
        'leadEnabled',
        'lead2Enabled',
        'pianoEnabled',
        'drumEnabled',
        'oceanSampleEnabled',
        'waterEnabled',
        'insectsEnabled',
        'insects2Enabled',
        'birdsEnabled',
        'birds2Enabled',
        'frogsEnabled',
        'delayAEnabled',
        'granularDelayEnabled',
        'reverbEnabled',
      ];
      for (const key of engineToggleKeys) {
        const onA = stateA[key] as boolean;
        const onB = stateB[key] as boolean;
        if (onA && onB) {
          (result as Record<string, unknown>)[key] = true;
        } else if (!onA && !onB) {
          (result as Record<string, unknown>)[key] = false;
        } else if (!onA && onB) {
          // A off, B on: turn ON as soon as we leave A (t > 0)
          (result as Record<string, unknown>)[key] = !atEndpointA;
        } else {
          // A on, B off: stay ON until we arrive at B (t === 100)
          (result as Record<string, unknown>)[key] = !atEndpointB;
        }
      }

      const dynamicsToggleKeys: Array<{
        key: keyof SliderState;
        isOn: (s: SliderState) => boolean;
      }> = [
        { key: 'dynamicsEnabled', isOn: (s) => Boolean(s.dynamicsEnabled) },
        {
          key: 'sidechainEnabled',
          isOn: (s) => Boolean(s.dynamicsEnabled && s.sidechainEnabled),
        },
        {
          key: 'driftEnabled',
          isOn: (s) => Boolean(s.dynamicsEnabled && s.driftEnabled),
        },
        {
          key: 'erosionEnabled',
          isOn: (s) => Boolean(s.dynamicsEnabled && s.erosionEnabled),
        },
        {
          key: 'dynamicsSaturationEnabled',
          isOn: (s) => Boolean(s.dynamicsEnabled && s.dynamicsSaturationEnabled),
        },
        {
          key: 'endCompEnabled',
          isOn: (s) => Boolean(s.dynamicsEnabled && s.endCompEnabled),
        },
      ];
      for (const entry of dynamicsToggleKeys) {
        const onA = entry.isOn(stateA);
        const onB = entry.isOn(stateB);
        const rawA = Boolean(stateA[entry.key]);
        const rawB = Boolean(stateB[entry.key]);
        if (onA && onB) {
          (result as Record<string, unknown>)[entry.key] = true;
        } else if (!onA && !onB) {
          (result as Record<string, unknown>)[entry.key] = tNorm < 0.5 ? rawA : rawB;
        } else if (!onA && onB) {
          (result as Record<string, unknown>)[entry.key] = atEndpointA ? rawA : true;
        } else {
          (result as Record<string, unknown>)[entry.key] = atEndpointB ? rawB : true;
        }
      }

      // Endpoints must be exact preset states. The interpolation loops above only
      // touch morph-managed keys, so overlay the full endpoint to avoid stale keys
      // from the opposite slot surviving at Full A / Full B.
      if (atEndpointA) {
        Object.assign(result, stateA);
      } else if (atEndpointB) {
        Object.assign(result, stateB);
      }
      const normalizedResult = normalizeDegradeReverbCrossfeed(result);
      normalizeDegradeReverbCrossfeedRanges(normalizedResult, resultDualRanges, resultDualModes);

      return {
        state: normalizedResult,
        dualRanges: resultDualRanges,
        dualModes: resultDualModes,
        morphCoFInfo,
      };
    },
    [],
  );

  // Store captured state for morph reference (when no preset is loaded)
  // This captures the state BEFORE any morph preset is loaded
  const morphCapturedStateRef = useRef<SliderState | null>(null);
  const morphCapturedDualRangesRef = useRef<Record<string, { min: number; max: number }> | null>(null);
  const morphCapturedSliderModesRef = useRef<Record<string, SliderMode> | null>(null);
  // Capture the effective starting root (accounting for CoF drift) when morph begins
  const morphCapturedStartRootRef = useRef<number | null>(null);
  // Track morph direction: 'toB' when going 0→100, 'toA' when going 100→0
  const morphDirectionRef = useRef<'toA' | 'toB' | null>(null);
  // Track last endpoint visited (0 or 100) to detect when morph starts
  const lastMorphEndpointRef = useRef<0 | 100>(0);

  // Manual override tracking for mid-morph parameter changes
  // Stores { value, morphPosition } for each manually adjusted parameter
  // These are temporary - cleared when reaching an endpoint
  const morphManualOverridesRef = useRef<Record<string, { value: number; morphPosition: number }>>({});

  useDrumMorphPresetInterpolationSync({
    state,
    stateRef,
    setState,
    setSliderModes,
    setDualSliderRanges,
    getCurrentDrumMorphOverrideState,
    scheduleProductRuntimeParamUpdate,
  });

  const { handleMorphPositionChange } = useMorphPositionRuntimeSurface({
    morphPresetA,
    morphPresetB,
    morphMode,
    morphPosition,
    currentCofStep: engineState.cofCurrentStep,
    state,
    stateRef,
    morphPlayPhrasesRef,
    morphTransitionPhrasesRef,
    morphCapturedStateRef,
    morphCapturedDualRangesRef,
    morphCapturedSliderModesRef,
    morphCapturedStartRootRef,
    morphDirectionRef,
    lastMorphEndpointRef,
    morphManualOverridesRef,
    setMorphPosition,
    setState,
    setSliderModes,
    setDualSliderRanges,
    setMorphCoFViz,
    setMorphCountdown,
    lerpPresets,
    resetCofDrift,
    resetRuntimeWalkPositionsForModes,
    scheduleProductRuntimeParamUpdate,
    isEngineRunning: engineState.isRunning,
  });

  const handleMorphSlotAClear = useCallback(() => {
    setMorphPresetA(null);
    setMorphSlotAName('');
    setMorphPosition(0);
  }, []);

  const handleMorphSlotBClear = useCallback(() => {
    setMorphPresetB(null);
    setMorphSlotBName('');
    setMorphPosition(0);
  }, []);

  const { handleLoadMorphA, handleLoadMorphB } = useMorphSlotLoadRuntimeSurface<SavedPreset>({
    morphPresetA,
    morphPresetB,
    morphPosition,
    currentCofStep: engineState.cofCurrentStep,
    state,
    sliderModes,
    dualSliderRanges,
    hasLoadedPresetRef,
    morphCapturedStateRef,
    morphCapturedDualRangesRef,
    morphCapturedSliderModesRef,
    morphCapturedStartRootRef,
    morphDirectionRef,
    setMorphPresetA,
    setMorphPresetB,
    setMorphSlotAName,
    setMorphSlotBName,
    setState,
    setSliderModes,
    setDualSliderRanges,
    setStatePresetName,
    setVisualizerPresetName,
    setLinkedVisualizerPresetRequest,
    presetEngineUpdateOptions: presetProductRuntimeUpdateOptions,
    syncCoreProductAppliedPreset,
    scheduleProductRuntimeParamUpdate,
    lerpPresets,
    normalizeState: normalizePresetForWeb,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
    confirmOverrideArmedJourneyForStatePreset,
    onPresetPoolLoad: handlePresetPoolLoad,
  });

  const { handleLoadPresetFromList } = useSavedPresetLoadRuntimeSurface<SavedPreset>({
    state,
    sliderModes,
    dualSliderRanges,
    morphPresetB,
    morphPosition,
    snowflakeActivated,
    setSnowflakeActivated,
    hasLoadedPresetRef,
    lastAppliedPresetLoadRef,
    morphCapturedStateRef,
    morphCapturedDualRangesRef,
    morphCapturedSliderModesRef,
    setMorphPresetA,
    setMorphSlotAName,
    setState,
    setStatePresetName,
    resolveSavedPresetForLoad,
    fadeOutAndStopForPresetLoad,
    confirmOverrideArmedJourneyForStatePreset,
    checkPresetCompatibility,
    presetEngineUpdateOptions: presetProductRuntimeUpdateOptions,
    syncCoreProductAppliedPreset,
    skipNextPresetLoadEngineSync,
    normalizeState: normalizePresetForWeb,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
    onPresetPoolLoad: handlePresetPoolLoad,
    onRoutingMuteGroupsLoad: restoreRoutingMuteGroupsFromPreset,
  });

  // ========================================================================
  // JOURNEY MODE CALLBACKS
  // ========================================================================

  // Journey mode: load a preset by name (used at journey start)
  const { handleJourneyLoadPreset, handleJourneyMorphTo, stopJourneyMorphPlayback } = useJourneyMorphRuntimeSurface({
    journeyPresetARef,
    journeyPresetBRef,
    journeyLastAppliedStateRef,
    journeyLastDualModesRef,
    journeyLastDualRangesRef,
    journeyLastMorphPositionRef,
    journeyLastMorphCoFVizRef,
    setState,
    setSliderModes,
    setDualSliderRanges,
    setMorphPresetA,
    setMorphPresetB,
    setMorphSlotAName,
    setMorphSlotBName,
    setMorphPosition,
    setMorphCoFViz,
    setStatePresetName,
    stateRef,
    journeyMorphDirectionRef,
    phraseLength: state.phraseLength,
    currentCofStep: engineState.cofCurrentStep,
    resolveSavedPresetByName,
    handleLoadPresetFromList,
    lastAppliedPresetLoadRef,
    startJourneyPlayback,
    lerpPresets,
    resetCofDrift,
    scheduleProductRuntimeParamUpdate,
    startJourneyMorphClock,
    stopJourneyMorphClock,
    setIsJourneyPlaying,
    onPresetPoolLoad: handlePresetPoolLoad,
  });
  stopJourneyMorphPlaybackRef.current = stopJourneyMorphPlayback;

  // Journey mode: handle journey end
  const handleJourneyEnd = useCallback(() => {
    stopJourneyMorphPlayback(true);
    // Unlock sliders
    setIsJourneyPlaying(false);

    // Keep the last preset playing - don't stop audio
    // User can manually stop if desired
  }, [stopJourneyMorphPlayback]);

  // Update refs for journey hook callbacks
  useEffect(() => {
    journeyLoadPresetRef.current = handleJourneyLoadPreset;
    journeyMorphToRef.current = handleJourneyMorphTo;
  }, [handleJourneyLoadPreset, handleJourneyMorphTo]);

  const { handleLoadJourneyPreset, handleSaveJourneyPreset, handleRenameJourneyPreset, handleDeleteJourneyPreset, handleUndoJourneyPreset } = useJourneyPresetActionSurface({
    activeJourneyPresetName,
    journey,
    journeyPresets,
    fadeOutAndStopForPresetLoad,
    stopJourneyMorphPlayback,
    setIsJourneyPlaying,
    setActiveJourneyPresetName,
    setActiveJourneyValidation,
    setActiveJourneyHasBackup,
  });

  // Cleanup journey animation on unmount
  useEffect(() => {
    return () => {
      stopJourneyMorphPlayback(false);
    };
  }, [stopJourneyMorphPlayback]);

  const renderJourneyOverridePrompt = () => {
    if (!journeyOverridePrompt) return null;
    return (
      <div style={styles.journeyOverrideOverlay} role="presentation" onClick={() => resolveJourneyOverridePrompt(false)}>
        <div style={styles.journeyOverrideDialog} role="dialog" aria-modal="true" aria-labelledby="journey-override-title" onClick={(event) => event.stopPropagation()}>
          <div style={styles.journeyOverrideHeader}>
            <span style={styles.journeyOverrideIcon} aria-hidden="true">
              ⟡
            </span>
            <span id="journey-override-title" style={styles.journeyOverrideTitle}>
              Override Journey?
            </span>
          </div>
          <div style={styles.journeyOverrideBody}>
            Loading <strong style={styles.journeyOverrideStrong}>{journeyOverridePrompt.presetName}</strong> will unarm{' '}
            <strong style={styles.journeyOverrideStrong}>{journeyOverridePrompt.journeyName}</strong>.
          </div>
          <div style={styles.journeyOverrideActions}>
            <button type="button" style={styles.journeyOverrideSecondaryButton} onClick={() => resolveJourneyOverridePrompt(false)}>
              Cancel
            </button>
            <button type="button" style={styles.journeyOverridePrimaryButton} onClick={() => resolveJourneyOverridePrompt(true)} autoFocus>
              Load State
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleRoutingSourceToggle = useCallback(
    (sourceId: string, enabled: boolean) => {
      hasUserInteractedRef.current = true;
      setState((prev) => {
        const source = getRoutingSourceDef(sourceId);
        if (!source) return prev;
        let nextState: SliderState | null = null;
        const ensureNextState = () => {
          if (!nextState) nextState = { ...prev };
          return nextState;
        };
        const setFlag = (key: keyof SliderState, value: boolean) => {
          if (prev[key] === value) return;
          (ensureNextState() as unknown as Record<keyof SliderState, unknown>)[key] = value;
        };

        const toggleKeys = getRoutingSourceToggleKeys(sourceId);
        if (source.toggleMode === 'simple-toggle' || source.toggleMode === 'return-row') {
          toggleKeys.forEach((key) => setFlag(key, enabled));
          const finalState = nextState ?? prev;
          if (nextState) {
            applyMorphEndpointStatePatch(prev, finalState);
          }
          return finalState;
        }

        if (source.toggleMode === 'disable-only-family' && !enabled) {
          toggleKeys.forEach((key) => setFlag(key, false));
        }

        const finalState = nextState ?? prev;
        if (nextState) {
          applyMorphEndpointStatePatch(prev, finalState);
        }
        return finalState;
      });
    },
    [applyMorphEndpointStatePatch],
  );

  const routingMuteGroupsController = useRoutingMuteGroupSystem({
    state,
    routingMuteGroups,
    onRoutingMuteGroupsChange: setRoutingMuteGroups,
    onRuntimeLevelPatchChange: handleRoutingMuteGroupRuntimeLevelPatchChange,
    onBooleanParamChange: handleRoutingBooleanParamChange,
    isRunning: playbackIsRunning,
    phraseSeconds: engineState.transportDebug?.effectivePhraseSeconds ?? getEffectivePhraseDuration(state),
  });

  const renderWithPresetPoolProvider = (children: React.ReactNode) => (
    <PresetPoolProvider value={activePresetPool} onChange={setActivePresetPool}>
      {children}
    </PresetPoolProvider>
  );

  if (snowflakeGeneratorRoute) {
    return (
      <SnowflakeGeneratorPage
        onBack={() => {
          clearSnowflakeGeneratorRoute();
          setUiMode('snowflake');
        }}
      />
    );
  }

  if (snowflakePrototypeRoute) {
    return (
      <SnowflakePrototypePage
        state={state}
        dualRanges={dualSliderRanges}
        sliderModes={sliderModes}
        {...snowflakePrototypePlaybackProps}
        onBack={() => {
          clearSnowflakePrototypeRoute();
          setUiMode('snowflake');
        }}
        onShowAdvanced={() => {
          clearSnowflakePrototypeRoute();
          setUiMode('advanced');
        }}
      />
    );
  }

  // Render journey mode UI
  if (uiMode === 'journey') {
    return renderWithPresetPoolProvider(
      <>
        <React.Suspense fallback={LAZY_PAGE_FALLBACK}>
          <JourneyModeView
            presets={savedPresets}
            journey={journey}
            journeyPresets={journeyPresets.presets}
            activeJourneyPresetName={activeJourneyPresetName}
            activeJourneyHasBackup={activeJourneyHasBackup}
            journeyValidation={activeJourneyValidation}
            onLoadJourneyPreset={handleLoadJourneyPreset}
            onSaveJourneyPreset={handleSaveJourneyPreset}
            onRenameJourneyPreset={handleRenameJourneyPreset}
            onDeleteJourneyPreset={handleDeleteJourneyPreset}
            onUndoJourneyPreset={handleUndoJourneyPreset}
            onRateJourneyPreset={(name, rating) => journeyPresets.updateMetadata(name, { rating })}
            onJourneyEnd={handleJourneyEnd}
            {...journeyPlaybackProps}
            onShowSnowflake={() => setUiMode('snowflake')}
            onShowVisualizer={() => openAdvancedTab('visualizer')}
            onShowAdvanced={() => setUiMode('advanced')}
          />
        </React.Suspense>
        {renderJourneyOverridePrompt()}
        <MacAudioStatusPill
          macShellAvailable={macShellAvailable}
          macAudioOutputStatus={macAudioOutputStatus}
          macAirPlayPerformanceActive={macAirPlayPerformanceActive}
          onToggleAirPlayPerformance={handleMacAirPlayPerformanceToggle}
          onOpenMacSoundSettings={openMacSoundSettings}
        />
        <BackgroundAudioStatusPill
          productRuntimeMode={productRuntimeMode}
          backgroundAudioStatus={backgroundAudioStatus}
          nativeProductRendererDiagnosticStatus={nativeProductRendererDiagnosticStatus}
          requestVisiblePageWakeLock={requestVisiblePageWakeLock}
          releaseVisiblePageWakeLock={releaseVisiblePageWakeLock}
        />
      </>,
    );
  }

  // Render snowflake UI
  if (uiMode === 'snowflake') {
    return renderWithPresetPoolProvider(
      <>
        {/* Splash Screen */}
        {showSplash &&
          (() => {
            // Calculate circle size matching snowflake UI
            const smallerDimension = Math.min(windowSize.width, windowSize.height - 100);
            const isMobile = windowSize.width < 1024;
            const circleSize = isMobile ? Math.max(250, Math.min(smallerDimension * 0.875, 650)) : Math.max(200, Math.min(smallerDimension * 0.7, 550));

            return (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(135deg, #100f0e 0%, #171615 50%, #1c1b19 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  opacity: splashOpacity,
                  transition: 'opacity 1s ease-in-out',
                }}
              >
                {/* Gradient circle behind text with fuzzy halo edge */}
                <div
                  style={{
                    position: 'absolute',
                    width: circleSize * 1.5,
                    height: circleSize * 1.5,
                    borderRadius: '50%',
                    background: `radial-gradient(circle at center,
                ${splashGradient.inner} 0%,
                ${splashGradient.mid} 30%,
                ${splashGradient.outer} 50%,
                rgba(16, 15, 14, 0.6) 65%,
                rgba(13, 12, 11, 0.3) 75%,
                rgba(10, 9, 8, 0.1) 85%,
                transparent 95%)`,
                    filter: 'blur(15px)',
                    opacity: 0.85,
                  }}
                />

                <span
                  style={{
                    fontSize: 'min(20vw, 120px)',
                    color: 'white',
                    fontWeight: 300,
                    letterSpacing: '0.1em',
                    textShadow: '0 0 40px rgba(255,255,255,0.3)',
                    fontFamily: "'Zen Maru Gothic', sans-serif",
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  結晶
                </span>
                <span
                  style={{
                    fontSize: 'min(8.5vw, 51px)',
                    color: 'rgba(255,255,255,0.8)',
                    fontWeight: 300,
                    letterSpacing: '0.28em',
                    marginTop: '0.5em',
                    textTransform: 'lowercase',
                    fontFamily: "Avenir, 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif",
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  kesshō
                </span>
              </div>
            );
          })()}
        {/* Hide SnowflakeUI until splash is done */}
        <div
          style={{
            opacity: showSplash ? 0 : 1,
            transition: 'opacity 0.5s ease-in-out',
            visibility: showSplash ? 'hidden' : 'visible',
          }}
        >
          <MacAudioStatusPill
            macShellAvailable={macShellAvailable}
            macAudioOutputStatus={macAudioOutputStatus}
            macAirPlayPerformanceActive={macAirPlayPerformanceActive}
            onToggleAirPlayPerformance={handleMacAirPlayPerformanceToggle}
            onOpenMacSoundSettings={openMacSoundSettings}
          />
          <BackgroundAudioStatusPill
            productRuntimeMode={productRuntimeMode}
            backgroundAudioStatus={backgroundAudioStatus}
            nativeProductRendererDiagnosticStatus={nativeProductRendererDiagnosticStatus}
            requestVisiblePageWakeLock={requestVisiblePageWakeLock}
            releaseVisiblePageWakeLock={releaseVisiblePageWakeLock}
          />
          <ProductRuntimeSwitch
            currentMode={productRuntimeMode}
            modes={productRuntimeModes}
            onModeChange={handleProductRuntimeModeChange}
            visible={showProductRuntimeSwitcher}
            floating
          />
          <SnowflakeUI
            state={snowflakeActivated ? state : welcomeDisplayState}
            onChange={snowflakeActivated ? handleRoutingParamChange : handleWelcomeSliderChange}
            sliderModes={snowflakeActivated ? sliderModes : undefined}
            dualSliderRanges={snowflakeActivated ? dualSliderRanges : undefined}
            onDualRangeChange={snowflakeActivated ? handleDualRangeChange : undefined}
            forceFullArmOpacity={!snowflakeActivated}
            onShowAdvanced={() => {
              if (!snowflakeActivated) setSnowflakeActivated(true);
              setUiMode('advanced');
            }}
            onShowJourney={() => {
              if (!snowflakeActivated) setSnowflakeActivated(true);
              setUiMode('journey');
            }}
            onShowVisualizer={() => openAdvancedTab('visualizer')}
            {...snowflakePlaybackProps}
            onLoadPreset={handleLoadPresetFromList}
            journeyPresets={journeyPresets.presets}
            onLoadJourneyPreset={handleLoadJourneyPreset}
            presets={savedPresets}
            {...snowflakeRecordingProps}
            journeyState={journey.state}
            journeyConfig={journey.config}
            isJourneyPlaying={isJourneyPlaying}
            activeJourneyName={activeJourneyPresetName}
            journeyValidation={activeJourneyValidation}
          />
        </div>
        {renderJourneyOverridePrompt()}
      </>,
    );
  }

  // Render advanced UI
  return (
    <PresetPoolProvider value={activePresetPool} onChange={setActivePresetPool}>
      <SliderHelpProvider activePage={activeTab === 'visualizer' ? 'global' : activeTab}>
        <MidiLearnProvider
        onParamChange={handleRoutingParamChange}
        onMidiMessage={pushProductMidiMessage}
        onLiveNoteEvent={handleMidiLiveNoteEvent}
        onOpenMidiPage={() => {
          setUiMode('advanced');
          setActiveTab('routing');
        }}
      >
      <div
        className="app-container"
        style={{
          ...activePageAccentStyle,
          ...styles.container,
          ...m?.container,
        }}
      >
        <CpuOverlay setPerfMonitorEnabled={setProductPerfMonitorEnabled} setPerfUpdateCallback={setProductPerfUpdateCallback} />
        {renderJourneyOverridePrompt()}
        <MacAudioStatusPill
          macShellAvailable={macShellAvailable}
          macAudioOutputStatus={macAudioOutputStatus}
          macAirPlayPerformanceActive={macAirPlayPerformanceActive}
          onToggleAirPlayPerformance={handleMacAirPlayPerformanceToggle}
          onOpenMacSoundSettings={openMacSoundSettings}
        />
        <BackgroundAudioStatusPill
          productRuntimeMode={productRuntimeMode}
          backgroundAudioStatus={backgroundAudioStatus}
          nativeProductRendererDiagnosticStatus={nativeProductRendererDiagnosticStatus}
          requestVisiblePageWakeLock={requestVisiblePageWakeLock}
          releaseVisiblePageWakeLock={releaseVisiblePageWakeLock}
        />
        {/* Controls - centered */}
        <div className="app-controls" style={{ ...styles.controls, paddingTop: '12px', ...m?.controls }}>
          {!advancedTransportButton.isPlaying ? (
            <button
              style={{
                ...styles.iconButton,
                ...styles.startButton,
                ...m?.iconButton,
              }}
              onClick={() => {
                advancedTransportButton.onStart();
              }}
              title="Start"
            >
              {TEXT_SYMBOLS.play}
            </button>
          ) : (
            <button
              style={{
                ...styles.iconButton,
                ...styles.stopButton,
                ...m?.iconButton,
              }}
              onClick={advancedTransportButton.onStop}
              title="Stop"
            >
              {TEXT_SYMBOLS.stop}
            </button>
          )}
          {advancedRecordingButton.visible && (
            <button
              style={{
                ...styles.iconButton,
                ...(advancedRecordingButton.isRecording ? styles.recordingButton : advancedRecordingButton.isRecordingArmed ? styles.recordArmedButton : styles.recordButton),
                ...m?.iconButton,
                position: 'relative',
                opacity: 1,
              }}
              onClick={() => {
                advancedRecordingButton.handlePress(playbackIsRunning);
              }}
              title={advancedRecordingButton.getTitle(playbackIsRunning)}
            >
              {TEXT_SYMBOLS.record}
              {advancedRecordingButton.isRecording && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    fontSize: '0.55rem',
                    background: '#FF4444',
                    color: 'white',
                    padding: '1px 4px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                  }}
                >
                  {advancedRecordingButton.recordingDurationLabel}
                </span>
              )}
            </button>
          )}
          <HelpButton
            helpKey="appVisualizerView"
            style={{
              ...styles.iconButton,
              ...m?.iconButton,
              ...styles.visualizerButton,
              ...(activeTab === 'visualizer' ? styles.visualizerButtonActive : {}),
            }}
            onClick={() => setActiveTab('visualizer')}
            title="Visualizer Mode"
            aria-label="Visualizer Mode"
            aria-pressed={activeTab === 'visualizer'}
          >
            {TEXT_SYMBOLS.visualizer}
          </HelpButton>
          <button
            style={{
              ...styles.iconButton,
              ...styles.simpleButton,
              ...m?.iconButton,
            }}
            onClick={() => setUiMode('journey')}
            title="Journey Mode"
          >
            ⟡
          </button>
          <button
            style={{
              ...styles.iconButton,
              ...styles.simpleButton,
              ...m?.iconButton,
            }}
            onClick={() => setUiMode('snowflake')}
            title="Simple Mode"
          >
            ❄
          </button>
          <ProductRuntimeSwitch
            currentMode={productRuntimeMode}
            modes={productRuntimeModes}
            onModeChange={handleProductRuntimeModeChange}
            visible={showProductRuntimeSwitcher}
          />
        </div>

        {/* Tab Bar */}
        <div className="app-tab-bar" style={{ ...styles.tabBar, ...m?.tabBar }}>
          {ADVANCED_EDITOR_TABS.map((tab) => (
            <HelpButton
              key={tab.id}
              helpKey={tab.helpKey}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? activeTabStyle : {}),
                ...m?.tab,
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>{tab.symbol}</span>
              <span>{tab.label}</span>
            </HelpButton>
          ))}
        </div>

        {/* Parameter Grid */}
        <div className="app-grid" style={{ ...styles.grid, ...m?.grid }}>
          <React.Suspense fallback={LAZY_PAGE_FALLBACK}>
            {/* === GLOBAL TAB === */}
            {activeTab === 'global' && (
              <GlobalPage
                state={state}
                expandedPanels={expandedPanels}
                togglePanel={togglePanel}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                onAuditionHarmonyNote={productRuntimeManualTriggers.auditionSynthNote}
                sliderProps={sliderProps}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                SelectComponent={Select as unknown as React.ComponentType<Record<string, unknown>>}
                CircleOfFifthsComponent={CircleOfFifths as unknown as React.ComponentType<Record<string, unknown>>}
                engineState={engineState}
                routingMuteGroupSnapshot={routingMuteGroupsController.runtimeSnapshot}
                {...globalRuntimeProps}
                morphCoFViz={morphCoFViz}
                morphPresetA={morphPresetA}
                morphPresetB={morphPresetB}
                morphPosition={morphPosition}
                morphMode={morphMode}
                morphPlayPhrases={morphPlayPhrases}
                morphTransitionPhrases={morphTransitionPhrases}
                morphCountdown={morphCountdown}
                onLoadMorphA={handleLoadMorphA}
                morphSlotAName={morphSlotAName}
                onClearMorphA={handleMorphSlotAClear}
                onLoadMorphB={handleLoadMorphB}
                morphSlotBName={morphSlotBName}
                onClearMorphB={handleMorphSlotBClear}
                onMorphPositionChange={handleMorphPositionChange}
                onMorphModeChange={setMorphMode}
                onMorphPlayPhrasesChange={setMorphPlayPhrases}
                onMorphTransitionPhrasesChange={setMorphTransitionPhrases}
                statePresetName={statePresetName}
                sliderModes={sliderModes}
                dualSliderRanges={dualSliderRanges as Record<string, { min: number; max: number }>}
                getStatePresetSaveMetadata={getStatePresetSaveMetadata}
              />
            )}

            {/* === VISUALIZER MODE === */}
            {activeTab === 'visualizer' && (
              <OptionalVisualizerGate
                enabled={reactiveVisualizerToggle.enabled}
                title="Reactive visualizer is off"
                description={
                  isMobileViewport
                    ? 'Mobile starts with this visualizer hidden to save battery and keep controls responsive. Enable it when you want the full reactive canvas.'
                    : 'Visualizer rendering is paused while hidden. Enable it to show the full reactive canvas.'
                }
                enableLabel="Enable Visualizer"
                hideLabel="Hide Visualizer"
                onEnable={reactiveVisualizerToggle.show}
                onHide={reactiveVisualizerToggle.hide}
              >
                <ReactiveVisualizerPage
                  state={state}
                  sliderModes={sliderModes}
                  dualRanges={dualSliderRanges as Record<string, { min: number; max: number }>}
                  engineState={engineState}
                  isPlaying={(playbackIsRunning || isJourneyPlaying) && !macAirPlayPerformanceActive}
                  {...productPageRuntimeSurface.visualizerPageRuntimeProps}
                  linkedPresetRequest={linkedVisualizerPresetRequest}
                  onVisualizerPresetChange={setVisualizerPresetName}
                  enabled={reactiveVisualizerToggle.enabled}
                  mobileReducedVisuals={isMobileViewport}
                />
              </OptionalVisualizerGate>
            )}

            {/* === SYNTH + LEAD TAB === */}
            {activeTab === 'synth' && (
              <SynthPage
                state={state}
                isMobile={isMobile}
                expandedPanels={expandedPanels}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                togglePanel={togglePanel}
                sliderProps={sliderProps}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                SelectComponent={Select as unknown as React.ComponentType<Record<string, unknown>>}
                CollapsiblePanelComponent={CollapsiblePanel as unknown as React.ComponentType<Record<string, unknown>>}
                isRunning={playbackIsRunning}
                transportDebug={engineState.transportDebug}
                onSimpleVisualizerRuntimePlanVisibilityChange={setProductSimpleSequencerVisualPlanActive}
                initialViewMode={synthViewModeRef.current}
                onViewModeChange={(mode) => {
                  synthViewModeRef.current = mode;
                }}
                initialStepOverrides={synthStepOverridesRef.current}
                initialSubLaneStates={synthSubLaneStatesRef.current}
                onSubLaneStatesChange={productPageRuntimeSurface.synthPageSequencerBridge.onSubLaneStatesChange}
                initialPitchSettings={synthPitchSettingsRef.current}
                onPitchSettingsChange={productPageRuntimeSurface.synthPageSequencerBridge.onPitchSettingsChange}
                initialPitchBindingModes={synthPitchBindingModesRef.current}
                onPitchBindingModesChange={productPageRuntimeSurface.synthPageSequencerBridge.onPitchBindingModesChange}
                initialKeyboardUiState={synthKeyboardUiStateRef.current}
                onKeyboardUiStateChange={(keyboardState) => {
                  synthKeyboardUiStateRef.current = keyboardState;
                }}
                initialArpConfigs={synthArpConfigsRef.current}
                onArpConfigsChange={productPageRuntimeSurface.synthPageSequencerBridge.onArpConfigsChange}
                onRawStepOverridesChange={productPageRuntimeSurface.synthPageSequencerBridge.onRawStepOverridesChange}
                onStepOverridesChange={productPageRuntimeSurface.synthPageSequencerBridge.onStepOverridesChange}
                onSequencerRuntimeDetach={productPageRuntimeSurface.synthPageSequencerBridge.reassertRuntimeState}
                initialClockDivs={synthClockDivsRef.current}
                onClockDivsChange={productPageRuntimeSurface.synthPageSequencerBridge.onClockDivsChange}
                initialSwings={synthSwingsRef.current}
                onSwingsChange={productPageRuntimeSurface.synthPageSequencerBridge.onSwingsChange}
                initialLinked={synthLinkedRef.current}
                onLinkedChange={productPageRuntimeSurface.synthPageSequencerBridge.onLinkedChange}
                onEvolveConfigsChange={productPageRuntimeSurface.synthPageSequencerBridge.onEvolveConfigsChange}
                initialEvolveConfigs={synthEvolveConfigsRef.current}
                presetVersion={synthPresetVersion}
                resetEvolveHome={productPageRuntimeSurface.synthPageSequencerBridge.resetEvolveHome}
                captureEvolveHome={productPageRuntimeSurface.synthPageSequencerBridge.captureEvolveHome}
                diceLane={productPageRuntimeSurface.synthPageSequencerBridge.diceLane}
                evolvedOverrides={synthEvolvedOverrides}
                {...productPageRuntimeSurface.synthPageRuntimeProps}
                onAuditionPresetPreview={productRuntimeManualTriggers.auditionSynthNoteWithState}
                harmonyState={engineState.harmonyState}
              />
            )}

            {/* === REVERB TAB === */}
            {activeTab === 'reverb' && (
              <ReverbPage
                state={state}
                isMobile={isMobile}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                sliderProps={sliderProps}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                SelectComponent={Select as unknown as React.ComponentType<Record<string, unknown>>}
              />
            )}

            {/* === DRUMS TAB === */}
            {activeTab === 'drums' && (
              <DrumPage
                state={state}
                drumLaneEnableTouchedRef={drumLaneEnableTouchedRef}
                isMobile={isMobile}
                isRunning={playbackIsRunning}
                expandedPanels={expandedPanels}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                togglePanel={togglePanel}
                sliderProps={sliderProps}
                {...productPageRuntimeSurface.drumPageRuntimeProps}
                previewTriggerVoice={productRuntimeManualTriggers.triggerDrumVoiceWithState}
                resetEvolveHome={productPageRuntimeSurface.drumPageSequencerBridge.resetEvolveHome}
                captureEvolveHome={productPageRuntimeSurface.drumPageSequencerBridge.captureEvolveHome}
                diceLane={productPageRuntimeSurface.drumPageSequencerBridge.diceLane}
                evolvedOverrides={drumEvolvedOverrides}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                CollapsiblePanelComponent={CollapsiblePanel as unknown as React.ComponentType<Record<string, unknown>>}
                editingVoice={drumEditingVoice}
                onToggleEditing={(v) => setDrumEditingVoice((prev) => (prev === v ? null : v))}
                onEvolveConfigsChange={productPageRuntimeSurface.drumPageSequencerBridge.onEvolveConfigsChange}
                initialEvolveConfigs={drumEvolveConfigsRef.current}
                presetVersion={drumPresetVersion}
                onRawStepOverridesChange={productPageRuntimeSurface.drumPageSequencerBridge.onRawStepOverridesChange}
                onStepOverridesChange={productPageRuntimeSurface.drumPageSequencerBridge.onStepOverridesChange}
                initialStepOverrides={drumStepOverridesRef.current}
                initialSubLaneStates={drumSubLaneStatesRef.current}
                initialPitchSettings={drumPitchSettingsRef.current}
                onPitchSettingsChange={productPageRuntimeSurface.drumPageSequencerBridge.onPitchSettingsChange}
                onSubLaneStatesChange={productPageRuntimeSurface.drumPageSequencerBridge.onSubLaneStatesChange}
                initialViewMode={drumViewModeRef.current}
                onViewModeChange={(mode) => {
                  drumViewModeRef.current = mode;
                }}
                initialClockDivs={drumClockDivsRef.current}
                onClockDivsChange={productPageRuntimeSurface.drumPageSequencerBridge.onClockDivsChange}
                initialSwings={drumSwingsRef.current}
                onSwingsChange={productPageRuntimeSurface.drumPageSequencerBridge.onSwingsChange}
                initialLinked={drumLinkedRef.current}
                onLinkedChange={productPageRuntimeSurface.drumPageSequencerBridge.onLinkedChange}
                initialSeqSimpleState={drumSeqSimpleStateRef.current}
                onSeqSimpleStateChange={(s) => {
                  drumSeqSimpleStateRef.current = s;
                }}
                initialSeqScatterState={drumSeqScatterState}
                onSeqScatterStateChange={handleDrumSeqScatterStateChange}
                scatterRuntimeActivePulses={drumScatterRuntimePulses}
              />
            )}

            {/* === GRANULAR TAB (was Looper tab) === */}
            {activeTab === 'granular' && (
              <GranularPage
                state={state}
                isMobile={isMobile}
                isRunning={playbackIsRunning}
                expandedPanels={expandedPanels}
                togglePanel={togglePanel}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                sliderProps={sliderProps}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                {...productPageRuntimeSurface.granularPageRuntimeProps}
              />
            )}

            {/* === DELAY TAB === */}
            {activeTab === 'delay' && (
              <DelayPage
                state={state}
                isMobile={isMobile}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                sliderProps={sliderProps}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                sliderModes={sliderModes}
                dualSliderRanges={dualSliderRanges}
                onDualStateChange={applyScopedDualRangesFromPreset}
              />
            )}

            {/* Texture page controls persisted dynamics* keys until the schema migration. */}
            {activeTab === 'texture' && (
              <TexturePage
                state={state}
                isMobile={isMobile}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                sliderProps={sliderProps}
                SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
                onVisualTelemetryActiveChange={setTextureVisualTelemetryActive}
                {...productPageRuntimeSurface.dynamicsPageRuntimeProps}
              />
            )}

            {/* === ROUTING TAB === */}
            {activeTab === 'routing' && (
              <RoutingPage
                state={state}
                isMobile={isMobile}
                routingMuteGroups={routingMuteGroups}
                muteGroupsController={routingMuteGroupsController}
                onParamChange={handleRoutingParamChange}
                onColumnParamChange={handleRoutingColumnChange}
                onToggleSource={handleRoutingSourceToggle}
                dawOutputRouting={dawOutputRouting}
                dawOutputDeviceSelection={dawOutputDevice}
                onDawOutputRoutingChange={setDawOutputRouting}
                onDawOutputDeviceSelectionChange={setDawOutputDevice}
                sliderProps={sliderProps}
              />
            )}

            {/* === EARTH TAB === */}
            {activeTab === 'earth' && (
              <EarthPage
                state={state}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                sliderProps={sliderProps}
                isRunning={playbackIsRunning}
                {...productPageRuntimeSurface.earthPageRuntimeProps}
              />
            )}
          </React.Suspense>
        </div>

        <AppDebugPanel
          state={state}
          engineState={engineState}
          productRuntimeMode={productRuntimeMode}
          productCoreDebugSummary={productCoreDebugSummary}
          backgroundAudioStatus={backgroundAudioStatus}
          nativeProductRendererDiagnosticStatus={nativeProductRendererDiagnosticStatus}
          isJourneyPlaying={isJourneyPlaying}
          journey={journey}
          journeyMorphDirection={journeyMorphDirectionRef.current}
          morphPosition={morphPosition}
          mobileDebugPanelStyle={m?.debugPanel}
        />

        <AppFooterMark />
      </div>
      </MidiLearnProvider>
    </SliderHelpProvider>
    </PresetPoolProvider>
  );
};

export default App;
