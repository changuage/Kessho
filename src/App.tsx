/**
 * Main App Component
 *
 * Complete UI with all sliders, selects, and debug panel.
 * Wires up to the product runtime with deterministic state management.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SliderState,
  SliderMode,
  DEFAULT_STATE,
  quantize,
  getParamInfo,
  getSliderNumericValue,
  getStateValueFromSliderNumber,
  PAD_FILTER_CUTOFF_KEY_PAIRS,
} from './ui/state';
import { DualSlider, DualSliderRange } from './ui/DualSlider';
import { SliderPrimitive } from './ui/sliderSystem';
import type { ProductEngineState } from './audio/product/ProductEngineTypes';
import { ProductRuntimeSwitch } from './ui/ProductRuntimeSwitch';
import { AppFooterMark } from './ui/AppFooterMark';
import { useProductRuntimeManualTriggers } from './ui/useProductRuntimeManualTriggers';
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
import { formatChordDegrees, calculateDriftedRoot } from './audio/harmony';
import { DrumVoiceType as DrumPresetVoice } from './audio/drumPresets';
import { getPadPreset, morphPadPresets, PAD_PRESET_PARAM_KEYS, PAD1_TO_PAD2_KEY, type PadPreset, type PadPresetParamKey } from './audio/padPresets';
import { morphWaterPresets, WATER_MORPH_PARAM_KEYS, INSECT_ENGINE_DEFAULTS, getWaterPresetDualRanges, getWaterPresetSliderModes } from './audio/waterPresets';
import { productEngine as productRuntimePort } from './audio/product/ProductEngineProxy';
import {
  filterDawOutputRoutingConfigForSources,
  loadDawOutputDeviceSelection,
  loadDawOutputRoutingConfig,
  saveDawOutputDeviceSelection,
  saveDawOutputRoutingConfig,
  sanitizeDawOutputDeviceSelection,
  sanitizeDawOutputRoutingConfig,
  type DawOutputDeviceSelection,
  type DawOutputRoutingConfig,
  type DawOutputSourceId,
} from './audio/dawOutputRouting';
import {
  applyMorphToState,
} from './audio/drumMorph';
import {
  dispatchProductControlActionForProductEngine,
  getProductControlStateForProductEngine,
  getProductDrumMorphDualRangeOverrides,
  interpolateProductDrumMorphDualRanges,
  type ProductControlAction,
  type ProductDrumMorphOverrideState,
} from './product-control';

import { clampMorphPosition, isInMidMorph, isAtEndpoint0, isAtEndpoint1 } from './audio/morphUtils';
import {
  getRuntimeSliderFlashing,
  getRuntimeSliderPosition,
  removeRuntimeTriggerPositions,
} from './ui/runtimeSliderState';
import { getRuntimeValue } from './ui/runtimeValueState';
import { useProductCoreDebugSummary } from './ui/useProductCoreDebugSummary';
import { useProductRuntimeParityProbe } from './ui/useProductRuntimeParityProbe';
import {
  clearRuntimeWalkPositions,
  resetRuntimeWalkPositionsForKeys,
  resetRuntimeWalkPositionsForModes,
  seedRuntimeWalkPosition,
} from './ui/runtimeWalkPositionSync';
import { VISUALIZER_PRESET_SCOPE } from './ui/visualizer/visualizerPresetStore';
import { getGranularPresetData, getGranularPresetSliderModes, isGranularDelayBStateKey } from './ui/granular/granularPresets';
import SnowflakeUI from './ui/SnowflakeUI';
import SnowflakePrototypePage from './ui/SnowflakePrototypePage';
import { CpuOverlay } from './ui/CpuOverlay';
import { SliderHelpProvider, useSliderHelp } from './ui/SliderHelpOverlay';
import { MidiLearnProvider } from './ui/midiLearn/MidiLearnProvider';
import { MidiLearnSliderAdornment } from './ui/midiLearn/MidiLearnSliderAdornment';
import { useMidiLearn } from './ui/midiLearn/useMidiLearn';
import { CircleOfFifths, getMorphedRootNote } from './ui/CircleOfFifths';
import { useJourney } from './ui/journeyState';
import { ENGINE_GROUPS as SNOWFLAKE_ENGINE_GROUPS } from './ui/snowflakeV2';
import { SOURCE_COLORS } from './designSystem/colors';
import { APP_TAB_SYMBOLS, TEXT_SYMBOLS } from './designSystem/textSymbols';
import type { SeqSimpleState } from './ui/drums/SeqSimple';
import type { SeqScatterState } from './ui/drums/scatter/scatterTypes';
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
  loadActiveStatePresetStorePresetByName,
  loadActiveStatePresetStorePresets,
  loadBundledPresetByName,
  loadCapacitorLocalStatePresets,
  normalizePresetForWeb,
  sortSavedStatePresetsByFreshness,
  statePresetEntryToSavedPreset,
  type SavedPreset,
} from './presets/statePresetRuntime';
import { buildPresetVersionMetadata } from './presets/versionMetadataHelpers';
import { CollapsiblePanel } from './ui/CollapsiblePanel';

import { OptionalVisualizerGate } from './ui/components/OptionalVisualizerGate';
import { useIsMobileViewport } from './ui/hooks/useIsMobileViewport';
import { useVisualFeatureToggle } from './ui/hooks/useVisualFeatureToggle';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig, SequencerViewMode } from './ui/sequencer/useEuclideanSequencer';
import { serializeStepOverrides } from './ui/sequencer/stepOverrideSerialization';
import { type ClockDivision, type PitchBindingMode } from './audio/drumSeqTypes';
import { sanitizeProductArpConfigs, type ProductArpConfig } from './audio/productArpeggiator';
import { normalizeSequencerPitchSettingsArray } from './audio/sequencerPitchSettings';
import type { SliderPageId } from './ui/pages/pageAliases';
import {
  getActiveDawOutputSourceIds,
  getRoutingSourceDef,
  getRoutingSourceToggleKeys,
  normalizeDegradeReverbCrossfeed,
  normalizeDegradeReverbCrossfeedRanges,
  ROUTING_DEGRADE_ACTIVE_KEYS,
  ROUTING_DELAY_A_INPUT_KEYS,
  ROUTING_DELAY_B_INPUT_KEYS,
  ROUTING_INSECTS_KEYS,
  ROUTING_NATURE_KEYS,
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

const JourneyModeView = React.lazy(() => import('./ui/JourneyModeView'));
const GlobalPage = React.lazy(() => import('./ui/global/GlobalPage'));
const SynthPage = React.lazy(() => import('./ui/synth/SynthPage'));
const ReverbPage = React.lazy(() => import('./ui/reverb/ReverbPage'));
const DrumPage = React.lazy(() => import('./ui/drums/DrumPage'));

const DRUM_PRESET_SLOT_CHANGE: Record<string, { voice: DrumPresetVoice; endpoint: 0 | 1 }> =
  Object.fromEntries(
    DRUM_VOICE_PARAM_ROUTES.flatMap((route) => [
      [route.presetAKey, { voice: route.voice, endpoint: 0 }] as const,
      [route.presetBKey, { voice: route.voice, endpoint: 1 }] as const,
    ]),
  ) as Record<string, { voice: DrumPresetVoice; endpoint: 0 | 1 }>;

const DRUM_EUCLID_LANE_ENABLED_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
  'drumEuclid5Enabled',
  'drumEuclid6Enabled',
] as const satisfies readonly (keyof SliderState)[];

function isDrumSequencerActive(state: SliderState): boolean {
  return Boolean(state.drumEuclidMasterEnabled)
    && DRUM_EUCLID_LANE_ENABLED_KEYS.some((key) => Boolean(state[key]));
}

function preserveRunningDrumSequencerSource(
  previous: SliderState,
  next: SliderState,
  options: { allowExplicitDrumDisable?: boolean } = {},
): SliderState {
  if (options.allowExplicitDrumDisable && previous.drumEnabled !== next.drumEnabled && next.drumEnabled === false) {
    return next;
  }
  if (!isDrumSequencerActive(previous) && !isDrumSequencerActive(next)) {
    return next;
  }
  if (next.drumEnabled === true) {
    return next;
  }
  return { ...next, drumEnabled: true };
}

const LEAD_PRESET_SLOT_KEYS = [
  'lead1PresetA',
  'lead1PresetB',
  'lead2PresetC',
  'lead2PresetD',
] as const satisfies readonly (keyof SliderState)[];

type LeadPresetSlotStateKey = typeof LEAD_PRESET_SLOT_KEYS[number];

function isLeadPresetSlotKey(key: keyof SliderState): key is LeadPresetSlotStateKey {
  return (LEAD_PRESET_SLOT_KEYS as readonly string[]).includes(String(key));
}

function leadPresetSlotsChanged(previous: SliderState, next: SliderState): boolean {
  return LEAD_PRESET_SLOT_KEYS.some((key) => previous[key] !== next[key]);
}

type PadMorphScope = 'pad1' | 'pad2';
type LeadMorphScope = 'lead1' | 'lead2';
type PadMorphEndpoint = 'a' | 'b';
type PadMorphEndpointParamValue = number | string | boolean;
type PadMorphEndpointParamOverrides = Partial<Record<PadPresetParamKey, PadMorphEndpointParamValue>>;
type PadMorphEndpointOverrides = Record<PadMorphScope, Record<PadMorphEndpoint, PadMorphEndpointParamOverrides>>;

const PAD_PRESET_PARAM_KEY_SET = new Set<string>(PAD_PRESET_PARAM_KEYS);
const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, PadPresetParamKey>;

function createPadMorphEndpointOverrides(): PadMorphEndpointOverrides {
  return {
    pad1: { a: {}, b: {} },
    pad2: { a: {}, b: {} },
  };
}

function getPadMorphParamChange(key: keyof SliderState): { scope: PadMorphScope; paramKey: PadPresetParamKey } | null {
  const keyStr = String(key);
  if (PAD_PRESET_PARAM_KEY_SET.has(keyStr)) {
    return { scope: 'pad1', paramKey: keyStr as PadPresetParamKey };
  }

  const pad1Key = PAD2_TO_PAD1_KEY[keyStr];
  return pad1Key ? { scope: 'pad2', paramKey: pad1Key } : null;
}

function getPadMorphPosition(state: SliderState, scope: PadMorphScope): number | null {
  const runtimeKey = scope === 'pad2' ? 'pad2Morph' : 'padMorph';
  const runtimeMorph = getRuntimeValue(runtimeKey);
  if (typeof runtimeMorph === 'number' && Number.isFinite(runtimeMorph)) {
    return runtimeMorph;
  }
  const morphPosition = scope === 'pad2' ? state.pad2Morph : state.padMorph;
  if (typeof morphPosition !== 'number') return null;
  return morphPosition;
}

function applyLiveLeadMorphToPresetChange(state: SliderState, scope: LeadMorphScope): void {
  const runtimeKey = scope === 'lead2' ? 'lead2Morph' : 'lead1Morph';
  const runtimeMorph = getRuntimeValue(runtimeKey);
  if (typeof runtimeMorph !== 'number' || !Number.isFinite(runtimeMorph)) return;
  state[runtimeKey] = clampMorphPosition(runtimeMorph);
}

function applyLiveLeadMorphToChangedPresetSlots(previous: SliderState, next: SliderState): SliderState {
  let normalized = next;
  if (previous.lead1PresetA !== next.lead1PresetA || previous.lead1PresetB !== next.lead1PresetB) {
    normalized = normalized === next ? { ...next } : normalized;
    applyLiveLeadMorphToPresetChange(normalized, 'lead1');
  }
  if (previous.lead2PresetC !== next.lead2PresetC || previous.lead2PresetD !== next.lead2PresetD) {
    normalized = normalized === next ? { ...next } : normalized;
    applyLiveLeadMorphToPresetChange(normalized, 'lead2');
  }
  return normalized;
}

function getPadMorphEndpoint(state: SliderState, scope: PadMorphScope): PadMorphEndpoint | null {
  const morphPosition = getPadMorphPosition(state, scope);
  if (morphPosition === null) return null;
  if (isAtEndpoint0(morphPosition)) return 'a';
  if (isAtEndpoint1(morphPosition)) return 'b';
  return null;
}

function getPadPresetStateKey(scope: PadMorphScope, paramKey: PadPresetParamKey): string | undefined {
  return scope === 'pad2' ? PAD1_TO_PAD2_KEY[paramKey] : paramKey;
}

function isPadMorphEndpointParamValue(value: unknown): value is PadMorphEndpointParamValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

function rememberPadMorphEndpointState(
  overrides: PadMorphEndpointOverrides,
  state: SliderState,
  scope: PadMorphScope,
): void {
  const endpoint = getPadMorphEndpoint(state, scope);
  if (!endpoint) return;

  const target = overrides[scope][endpoint];
  for (const paramKey of PAD_PRESET_PARAM_KEYS) {
    const stateKey = getPadPresetStateKey(scope, paramKey);
    if (!stateKey) continue;
    const value = (state as unknown as Record<string, unknown>)[stateKey];
    if (isPadMorphEndpointParamValue(value)) {
      target[paramKey] = value;
    }
  }
}

function padMorphScopeParamsChanged(previous: SliderState, next: SliderState, scope: PadMorphScope): boolean {
  for (const paramKey of PAD_PRESET_PARAM_KEYS) {
    const stateKey = getPadPresetStateKey(scope, paramKey);
    if (!stateKey) continue;
    const key = stateKey as keyof SliderState;
    if (previous[key] !== next[key]) return true;
  }
  return false;
}

function rememberChangedPadMorphEndpointStates(
  overrides: PadMorphEndpointOverrides,
  previous: SliderState,
  next: SliderState,
): void {
  if (padMorphScopeParamsChanged(previous, next, 'pad1')) {
    rememberPadMorphEndpointState(overrides, next, 'pad1');
  }
  if (padMorphScopeParamsChanged(previous, next, 'pad2')) {
    rememberPadMorphEndpointState(overrides, next, 'pad2');
  }
}

function clearPadMorphEndpointState(
  overrides: PadMorphEndpointOverrides,
  scope: PadMorphScope,
  endpoint: PadMorphEndpoint,
): void {
  overrides[scope][endpoint] = {};
}

function applyPadEndpointOverridesToPreset(
  preset: PadPreset,
  overrides: PadMorphEndpointParamOverrides,
): PadPreset {
  if (Object.keys(overrides).length === 0) return preset;
  return {
    ...preset,
    params: {
      ...preset.params,
      ...overrides,
    },
  };
}

function applyPadPresetMorphToState(
  state: SliderState,
  scope: PadMorphScope,
  overrides: PadMorphEndpointOverrides,
): void {
  const presetAKey = scope === 'pad2' ? 'pad2PresetA' : 'padPresetA';
  const presetBKey = scope === 'pad2' ? 'pad2PresetB' : 'padPresetB';
  const presetA = getPadPreset(String(state[presetAKey] ?? 'init'), scope);
  const presetB = getPadPreset(String(state[presetBKey] ?? state[presetAKey] ?? 'init'), scope);
  if (!presetA || !presetB) return;

  const morphPosition = getPadMorphPosition(state, scope) ?? 0;
  const morphed = morphPadPresets(
    applyPadEndpointOverridesToPreset(presetA, overrides[scope].a),
    applyPadEndpointOverridesToPreset(presetB, overrides[scope].b),
    morphPosition,
  );
  const record = state as unknown as Record<string, unknown>;
  for (const paramKey of PAD_PRESET_PARAM_KEYS) {
    if (!(paramKey in morphed)) continue;
    const targetKey = getPadPresetStateKey(scope, paramKey);
    if (targetKey) {
      record[targetKey] = morphed[paramKey];
    }
  }
}

const GranularPage = React.lazy(() => import('./ui/granular/GranularPage'));
const DelayPage = React.lazy(() => import('./ui/delay/DelayPage'));
const TexturePage = React.lazy(() => import('./ui/texture/TexturePage'));
const RoutingPage = React.lazy(() => import('./ui/routing/RoutingPage'));
const EarthPage = React.lazy(() => import('./ui/earth/EarthPage'));
const ReactiveVisualizerPage = React.lazy(() => import('./ui/visualizer/ReactiveVisualizerPage'));

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const DEFAULT_AUTO_START_PRESET_NAME = 'String Waves';
const CLOUD_ENABLED = isCloudPresetConfigEnabled();
const isSonicParityMode = () => (
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('parity') === '1'
);
const LAZY_PAGE_FALLBACK = <div style={{ padding: '24px', color: '#9ca3af', textAlign: 'center' }}>Loading...</div>;

// Base for the decorative snowflake shown before activation. This state is
// local to SnowflakeUI and is not pushed into the product runtime.
const SNOWFLAKE_WELCOME_STATE: SliderState = {
  ...DEFAULT_STATE,
  masterVolume: 0.85,
  tension: 0.15,
  reverbLevel: 0.5,
  reverbDecay: 0.7,
  reverbDiffusion: 0.3,
  synthLevel: 0.1,
  pad2Level: 0.1,
  granularLevel: 0,
  leadLevel: 1.0,
  lead1Level: 0.1,
  lead2Level: 0.1,
  pianoLevel: 0.1,
  drumLevel: 0.1,
  oceanSampleLevel: 0,
  padEnabled: true,
  pad2Enabled: true,
  leadEnabled: true,
  lead2Enabled: true,
  pianoEnabled: true,
  drumEnabled: true,
  granularEnabled: false,
  oceanSampleEnabled: false,
  waterEnabled: false,
  insectsEnabled: false,
  birdsEnabled: false,
  delayAEnabled: false,
  granularDelayEnabled: false,
};

const WELCOME_MACRO_MAGNITUDE = 0.5;
const WELCOME_STRUCTURE_LOG_CURVE = 80;

function randomWelcomeSign(): 1 | -1 {
  return Math.random() >= 0.5 ? 1 : -1;
}

function normalizedLevelForWelcomeStructure(structureMacro: number): number {
  const clamped = Math.max(-1, Math.min(1, structureMacro));
  const shifted = (clamped + 1) / 2;
  return Math.expm1(shifted * Math.log1p(WELCOME_STRUCTURE_LOG_CURVE)) / WELCOME_STRUCTURE_LOG_CURVE;
}

function setWelcomeValue(state: SliderState, key: keyof SliderState, value: number | boolean | string): void {
  (state as unknown as Record<string, number | boolean | string>)[String(key)] = value;
}

function createSignedSnowflakeWelcomeState(): SliderState {
  const next: SliderState = { ...SNOWFLAKE_WELCOME_STATE };
  const activeEngineIds = new Set(SNOWFLAKE_ENGINE_GROUPS.slice(0, 6).map((engine) => engine.id));
  const fractalSign = randomWelcomeSign();

  setWelcomeValue(next, 'granularV1Mode', fractalSign > 0 ? 'granular' : 'clean');

  for (const engine of SNOWFLAKE_ENGINE_GROUPS) {
    const active = activeEngineIds.has(engine.id);
    if (engine.enabledKey) setWelcomeValue(next, engine.enabledKey, active);

    const level = active
      ? normalizedLevelForWelcomeStructure(WELCOME_MACRO_MAGNITUDE)
      : 0;
    setWelcomeValue(next, engine.levelKey, engine.levelMin + level * (engine.levelMax - engine.levelMin));

    for (const sendKey of Object.values(engine.sends)) {
      if (!sendKey) continue;
      setWelcomeValue(next, sendKey, 0);
    }

    if (!active) continue;
    if (engine.sends.granular) {
      setWelcomeValue(next, engine.sends.granular, WELCOME_MACRO_MAGNITUDE);
    }

    const densityPositive = randomWelcomeSign() > 0;
    const primaryDensitySend = densityPositive ? engine.sends.delayA : engine.sends.delayB;
    const fallbackDensitySend = densityPositive ? engine.sends.delayB : engine.sends.delayA;
    const densitySend = primaryDensitySend ?? fallbackDensitySend;
    if (densitySend) setWelcomeValue(next, densitySend, WELCOME_MACRO_MAGNITUDE);
  }

  return next;
}

// Styles
const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '10px',
  } as React.CSSProperties,
  header: {
    textAlign: 'center' as const,
    marginBottom: '20px',
  } as React.CSSProperties,
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    background: 'linear-gradient(90deg, #a5c4d4, #e8f4f8, #a5c4d4)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '10px',
    textShadow: '0 0 30px rgba(165, 196, 212, 0.3)',
  } as React.CSSProperties,
  subtitle: {
    color: '#7a9aaf',
    fontSize: '0.9rem',
  } as React.CSSProperties,
  controls: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    marginBottom: '30px',
    paddingTop: 'calc(12px + env(safe-area-inset-top))',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  button: {
    padding: '10px 20px',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  iconButton: {
    padding: '8px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  } as React.CSSProperties,
  badge: {
    position: 'absolute' as const,
    top: '-5px',
    right: '-5px',
    background: '#e74c3c',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 'bold',
    borderRadius: '50%',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  startButton: {
    color: '#FFFFFF',
  } as React.CSSProperties,
  stopButton: {
    color: '#ED5A24',
  } as React.CSSProperties,
  recordButton: {
    color: '#FF4444',
  } as React.CSSProperties,
  recordArmedButton: {
    color: '#FF4444',
    border: '2px solid #FF4444',
    animation: 'pulse 2s ease-in-out infinite',
  } as React.CSSProperties,
  recordingButton: {
    color: '#FF4444',
    animation: 'pulse 1s ease-in-out infinite',
  } as React.CSSProperties,
  visualizerButton: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.92rem',
    lineHeight: 1,
  } as React.CSSProperties,
  visualizerButtonActive: {
    color: 'rgba(255,255,255,0.88)',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    boxShadow: '0 0 14px rgba(255, 255, 255, 0.08)',
  } as React.CSSProperties,
  journeyOverrideOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 'calc(76px + env(safe-area-inset-top)) 14px 14px',
    background: 'rgba(0, 0, 0, 0.48)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  journeyOverrideDialog: {
    width: 'min(360px, 100%)',
    borderRadius: '8px',
    border: '1px solid rgba(232, 220, 196, 0.28)',
    background: 'rgba(20, 20, 35, 0.92)',
    boxShadow: '0 18px 52px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
    padding: '16px',
    color: '#f4ede4',
  } as React.CSSProperties,
  journeyOverrideHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  } as React.CSSProperties,
  journeyOverrideIcon: {
    width: '30px',
    height: '30px',
    borderRadius: '7px',
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(184,224,255,0.12)',
    color: '#B8E0FF',
    fontSize: '1.05rem',
    flexShrink: 0,
  } as React.CSSProperties,
  journeyOverrideTitle: {
    color: '#B8E0FF',
    fontSize: '0.9rem',
    fontWeight: 800,
    letterSpacing: 0,
  } as React.CSSProperties,
  journeyOverrideBody: {
    color: 'rgba(244,237,228,0.76)',
    fontSize: '0.82rem',
    lineHeight: 1.45,
    marginBottom: '14px',
  } as React.CSSProperties,
  journeyOverrideStrong: {
    color: '#f4ede4',
    fontWeight: 800,
  } as React.CSSProperties,
  journeyOverrideActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
  journeyOverrideSecondaryButton: {
    height: '34px',
    padding: '0 12px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#f4ede4',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 700,
  } as React.CSSProperties,
  journeyOverridePrimaryButton: {
    height: '34px',
    padding: '0 12px',
    borderRadius: '6px',
    border: '1px solid rgba(184,224,255,0.38)',
    background: 'rgba(184,224,255,0.18)',
    color: '#B8E0FF',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 800,
  } as React.CSSProperties,
  macAudioStatus: {
    position: 'fixed',
    left: '14px',
    bottom: 'calc(14px + env(safe-area-inset-bottom))',
    zIndex: 1300,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    maxWidth: 'min(520px, calc(100vw - 28px))',
    padding: '8px 10px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    background: 'rgba(6, 10, 14, 0.82)',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.22)',
    backdropFilter: 'blur(12px)',
  } as React.CSSProperties,
  backgroundAudioStatus: {
    position: 'fixed',
    right: '14px',
    bottom: 'calc(14px + env(safe-area-inset-bottom))',
    zIndex: 1300,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    maxWidth: 'min(620px, calc(100vw - 28px))',
    padding: '8px 10px',
    border: '1px solid rgba(184, 224, 255, 0.16)',
    borderRadius: '8px',
    background: 'rgba(6, 10, 14, 0.82)',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.22)',
    backdropFilter: 'blur(12px)',
  } as React.CSSProperties,
  macAudioStatusText: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: '0.72rem',
    fontWeight: 700,
  } as React.CSSProperties,
  macAudioStatusButton: {
    flex: '0 0 auto',
    minHeight: '26px',
    padding: '5px 9px',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    borderRadius: '7px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.68)',
    cursor: 'pointer',
    fontSize: '0.68rem',
    fontWeight: 800,
    lineHeight: 1,
  } as React.CSSProperties,
  macAudioStatusButtonActive: {
    borderColor: 'rgba(94, 234, 212, 0.45)',
    background: 'rgba(20, 184, 166, 0.18)',
    color: '#99f6e4',
  } as React.CSSProperties,
  statusButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  snowflakeControls: {
    position: 'fixed' as const,
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '20px',
    zIndex: 1000,
  } as React.CSSProperties,
  simpleButton: {
    color: 'rgba(255,255,255,0.7)',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
    gap: '15px',
    marginBottom: '30px',
  } as React.CSSProperties,
  panel: {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '15px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    maxWidth: '100%',
  } as React.CSSProperties,
  panelTitle: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    marginBottom: '15px',
    color: '#a5c4d4',
  } as React.CSSProperties,
  sliderGroup: {
    marginBottom: '12px',
  } as React.CSSProperties,
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '5px',
    fontSize: '0.85rem',
    minWidth: 0,
    gap: '4px',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: 'white',
    fontSize: '0.9rem',
    colorScheme: 'dark',
  } as React.CSSProperties,
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 16px',
    background: 'rgba(18, 17, 15, 0.6)',
    borderRadius: '12px',
    marginBottom: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  } as React.CSSProperties,
  tab: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    color: '#666',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '60px',
  } as React.CSSProperties,
  tabActive: {
    background: 'rgba(247, 250, 252, 0.09)',
    color: '#F7FAFC',
    border: '1px solid rgba(247, 250, 252, 0.24)',
    boxShadow: '0 0 14px rgba(247, 250, 252, 0.08)',
  } as React.CSSProperties,
  tabIcon: {
    fontSize: '1.2rem',
    lineHeight: 1,
  } as React.CSSProperties,
  debugPanel: {
    background: 'rgba(15, 25, 40, 0.4)',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid rgba(100, 150, 200, 0.3)',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    overflow: 'hidden',
    maxWidth: '100%',
  } as React.CSSProperties,
  debugRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  debugLabel: {
    color: '#9ca3af',
    flexShrink: 0,
  } as React.CSSProperties,
  debugValue: {
    color: '#a5c4d4',
    fontWeight: 'bold',
    wordBreak: 'break-all' as const,
    minWidth: 0,
  } as React.CSSProperties,
  copied: {
    color: '#2ecc71',
    fontSize: '0.85rem',
    marginTop: '10px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// Dual slider state type - stores min/max for each parameter when in dual mode
type DualSliderState = Partial<Record<keyof SliderState, DualSliderRange>>;

function extractNativeDualRanges(ranges: DualSliderState): Record<string, { min: number; max: number }> {
  const output: Record<string, { min: number; max: number }> = {};
  for (const [key, range] of Object.entries(ranges)) {
    if (!range) continue;
    output[key] = { min: range.min, max: range.max };
  }
  return output;
}

type AdvancedTab = 'global' | 'visualizer' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'texture' | 'routing';
type AdvancedEditorTab = Exclude<AdvancedTab, 'visualizer'>;

const ADVANCED_TAB_COLORS: Record<AdvancedTab, string> = {
  global: SOURCE_COLORS.global,
  visualizer: SOURCE_COLORS.visualizer,
  synth: SOURCE_COLORS.synth,
  drums: SOURCE_COLORS.drums,
  reverb: SOURCE_COLORS.reverb,
  granular: SOURCE_COLORS.granular,
  earth: SOURCE_COLORS.earth,
  delay: SOURCE_COLORS.delayA,
  texture: SOURCE_COLORS.dynamics,
  routing: SOURCE_COLORS.routing,
};

const ADVANCED_EDITOR_TABS = [
  {
    id: 'global',
    helpKey: 'tabGlobal',
    symbol: APP_TAB_SYMBOLS.global,
    label: 'Global',
  },
  {
    id: 'synth',
    helpKey: 'tabSynth',
    symbol: APP_TAB_SYMBOLS.synth,
    label: 'Synth',
  },
  {
    id: 'drums',
    helpKey: 'tabDrums',
    symbol: APP_TAB_SYMBOLS.drums,
    label: 'Drums',
  },
  {
    id: 'earth',
    helpKey: 'tabEarth',
    symbol: APP_TAB_SYMBOLS.earth,
    label: 'Earth',
  },
  {
    id: 'granular',
    helpKey: 'tabGranular',
    symbol: APP_TAB_SYMBOLS.granular,
    label: 'Granular',
  },
  {
    id: 'delay',
    helpKey: 'tabDelay',
    symbol: APP_TAB_SYMBOLS.delay,
    label: 'Delay',
  },
  {
    id: 'reverb',
    helpKey: 'tabReverb',
    symbol: APP_TAB_SYMBOLS.reverb,
    label: 'Reverb',
  },
  {
    id: 'texture',
    helpKey: 'tabDynamics',
    symbol: APP_TAB_SYMBOLS.dynamics,
    label: 'Texture',
  },
  {
    id: 'routing',
    helpKey: 'tabRouting',
    symbol: APP_TAB_SYMBOLS.routing,
    label: 'Routing',
  },
] as const satisfies readonly {
  id: AdvancedEditorTab;
  helpKey: string;
  symbol: string;
  label: string;
}[];

const getAdvancedTabActiveStyle = (accent: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${accent} 15%, transparent)`,
  color: `color-mix(in srgb, ${accent} 88%, white 12%)`,
  border: `1px solid color-mix(in srgb, ${accent} 34%, rgba(255, 255, 255, 0.08))`,
  boxShadow: `0 0 14px color-mix(in srgb, ${accent} 18%, transparent)`,
});

const ADVANCED_TAB_SHORTCUTS: Record<string, AdvancedTab> = {
  '1': 'global',
  '2': 'synth',
  '3': 'drums',
  '4': 'earth',
  '5': 'granular',
  '6': 'delay',
  '7': 'reverb',
  '8': 'texture',
  '9': 'routing',
};

type TopLevelShortcutTarget = 'snowflake' | 'journey';

const TOP_LEVEL_SHORTCUTS: Record<string, TopLevelShortcutTarget | AdvancedTab> = {
  '0': 'snowflake',
  Digit0: 'snowflake',
  '-': 'journey',
  Minus: 'journey',
  '=': 'visualizer',
  Equal: 'visualizer',
  '`': 'routing',
  Backquote: 'routing',
};

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

// Logarithmic scaling helpers for frequency and time sliders.
function linearToLog(value: number, min: number, max: number): number {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return Math.exp(minLog + value * (maxLog - minLog));
}

function logToLinear(value: number, min: number, max: number): number {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return (Math.log(value) - minLog) / (maxLog - minLog);
}

function getEffectiveLogMin(min: number, max: number, step: number): number | null {
  if (max <= 0) return null;
  if (min > 0) return min;
  const stepFloor = step > 0 ? step : max * 0.001;
  return Math.max(1e-9, Math.min(max, stepFloor));
}

// Slider component - now a simple component, DualSlider handles dual mode
interface SliderProps {
  label: string;
  value: number;
  paramKey: keyof SliderState;
  ghostValue?: number;
  format?: (value: number) => string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  logarithmic?: boolean; // Use logarithmic scaling (for frequency params)
  helpPage?: SliderPageId;
  disabled?: boolean;
  onChange: (key: keyof SliderState, value: number) => void;
  // Dual slider props (optional)
  mode?: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
}

const WALK_ONLY_DUAL_KEYS = new Set<string>([
  'waterChannelsMorph',
  'waterChannelsSpeed',
  'insectsDensity',
  'insectsTemperature',
  'insectsDistance',
  'insectsProximity',
  'insectsAntiphony',
  'insectsClickRate',
  'insectsMotion',
  'insects2Density',
  'insects2Temperature',
  'insects2Distance',
  'insects2Proximity',
  'insects2Antiphony',
  'insects2ClickRate',
  'insects2Motion',
]);

const SINGLE_ONLY_SLIDER_KEYS = new Set<string>();

function clampQuantizedSliderValue(key: keyof SliderState, value: number): number {
  const info = getParamInfo(key);
  if (!info) return value;
  return quantize(key, Math.max(info.min, Math.min(info.max, value)));
}

function normalizePadFilterCutoffPairs(state: SliderState, changedKey?: keyof SliderState): SliderState {
  const record = state as unknown as Record<string, SliderState[keyof SliderState] | number>;
  const changedKeyStr = changedKey as string | undefined;

  for (const pair of PAD_FILTER_CUTOFF_KEY_PAIRS) {
    const { minKey, maxKey } = pair;
    const minKeyName = String(minKey);
    const maxKeyName = String(maxKey);
    const minInfo = getParamInfo(minKey);
    const maxInfo = getParamInfo(maxKey);
    if (!minInfo || !maxInfo) continue;

    const rawMin = getSliderNumericValue(minKey, state[minKey]);
    const rawMax = getSliderNumericValue(maxKey, state[maxKey]);
    if (rawMin === null || rawMax === null) continue;

    const step = Math.max(minInfo.step, maxInfo.step, 1e-6);
    let min = clampQuantizedSliderValue(minKey, rawMin);
    let max = clampQuantizedSliderValue(maxKey, rawMax);

    if (min >= max) {
      if (changedKeyStr === minKeyName) {
        max = clampQuantizedSliderValue(maxKey, min + step);
        if (min >= max) min = clampQuantizedSliderValue(minKey, max - step);
      } else if (changedKeyStr === maxKeyName) {
        min = clampQuantizedSliderValue(minKey, max - step);
        if (min >= max) max = clampQuantizedSliderValue(maxKey, min + step);
      } else {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        min = clampQuantizedSliderValue(minKey, low);
        max = clampQuantizedSliderValue(maxKey, high);
        if (min >= max) {
          max = clampQuantizedSliderValue(maxKey, min + step);
          if (min >= max) min = clampQuantizedSliderValue(minKey, max - step);
        }
      }
    }

    record[pair.minKey] = getStateValueFromSliderNumber(minKey, min) as SliderState[keyof SliderState];
    record[pair.maxKey] = getStateValueFromSliderNumber(maxKey, max) as SliderState[keyof SliderState];
  }

  return state;
}

const FX_BUS_LABELS = {
  delayA: 'Delay A',
  delayB: 'Delay B',
  granular: 'Granular',
  reverb: 'Reverb',
} as const;

const FX_OWNER_LABELS = {
  pad1: 'Pad 1',
  pad2: 'Pad 2',
  lead1: 'Lead 1',
  lead2: 'Lead 2',
  piano: 'Piano',
  drum: 'Drums',
} as const;

const FX_ORIGIN_LABELS = {
  padChord: 'Chord',
  padEuclid: 'Euclid',
  leadNote: 'Lead Note',
  pianoNote: 'Piano Note',
  drumHit: 'Drum Hit',
} as const;

function normalizeDualSliderMode(key: string, mode?: SliderMode): SliderMode | undefined {
  if (!mode) return mode;
  if (SINGLE_ONLY_SLIDER_KEYS.has(key)) return undefined;
  return WALK_ONLY_DUAL_KEYS.has(key) && mode === 'sampleHold' ? 'walk' : mode;
}

const Slider: React.FC<SliderProps> = ({
  label,
  value,
  paramKey,
  ghostValue,
  format,
  unit,
  min,
  max,
  step,
  logarithmic,
  helpPage,
  disabled = false,
  onChange,
  mode = 'single',
  dualRange,
  walkPosition,
  isFlashing,
  onCycleMode,
  onDualRangeChange,
}) => {
  const { announceSlider } = useSliderHelp();
  const midiLearn = useMidiLearn();
  const announceHelp = () => announceSlider(String(paramKey), { label, page: helpPage });
  const baseInfo = getParamInfo(paramKey);
  if (!baseInfo) return null;

  const info = {
    ...baseInfo,
    min: min ?? baseInfo.min,
    max: max ?? baseInfo.max,
    step: step ?? baseInfo.step,
  };

  const quantizeWithInfo = (_key: keyof SliderState, nextValue: number): number => {
    const clamped = Math.max(info.min, Math.min(info.max, nextValue));
    const stepSize = Math.max(info.step, 1e-9);
    const steps = Math.round((clamped - info.min) / stepSize);
    return info.min + steps * stepSize;
  };

  // If dual mode props are provided, use shared DualSlider
  if (onCycleMode && onDualRangeChange && !SINGLE_ONLY_SLIDER_KEYS.has(String(paramKey))) {
    return (
      <DualSlider<keyof SliderState>
        label={label}
        value={value}
        paramKey={paramKey}
        paramInfo={info}
        quantizeFn={quantizeWithInfo}
        unit={unit}
        logarithmic={logarithmic}
        format={format}
        ghostValue={ghostValue}
        helpPage={helpPage}
        disabled={disabled}
        mode={mode}
        dualRange={dualRange}
        walkPosition={walkPosition}
        isFlashing={isFlashing}
        onChange={onChange}
        onCycleMode={onCycleMode}
        onDualRangeChange={onDualRangeChange}
        groupStyle={styles.sliderGroup}
      />
    );
  }

  // Fallback sliders still use the same primitive; they just do not expose dual-mode editing.
  const valueToPercent = (nextValue: number) => {
    const clampedValue = Math.max(info.min, Math.min(info.max, nextValue));
    const effectiveLogMin = logarithmic ? getEffectiveLogMin(info.min, info.max, info.step) : null;
    if (effectiveLogMin != null) {
      if (clampedValue <= info.min) return 0;
      return logToLinear(Math.max(effectiveLogMin, clampedValue), effectiveLogMin, info.max) * 100;
    }
    return ((clampedValue - info.min) / Math.max(1e-9, info.max - info.min)) * 100;
  };

  const percentToValue = (percent: number) => {
    const normalized = Math.max(0, Math.min(100, percent)) / 100;
    const effectiveLogMin = logarithmic ? getEffectiveLogMin(info.min, info.max, info.step) : null;
    const raw = effectiveLogMin != null
      ? (normalized <= 0 && info.min <= 0 ? info.min : linearToLog(normalized, effectiveLogMin, info.max))
      : info.min + normalized * (info.max - info.min);
    return quantizeWithInfo(paramKey, raw);
  };

  const formatDisplayValue = (nextValue: number) => (format ? format(nextValue) : info.step < 1 ? nextValue.toFixed(2) : String(Math.round(nextValue)));
  const displayValue = formatDisplayValue(value);
  const valuePercent = valueToPercent(value);
  const ghostPercent = ghostValue == null || !Number.isFinite(ghostValue) ? null : valueToPercent(ghostValue);

  return (
    <SliderPrimitive
      className="app-slider-group"
      style={{ ...styles.sliderGroup, opacity: disabled ? 0.58 : 1 }}
      label={label}
      mode="single"
      value={valuePercent}
      unit={unit}
      hero="#a5c4d4"
      variant="full"
      density="compact"
      displayValue={`${displayValue}${unit || ''}`}
      formatValue={(percent) => formatDisplayValue(percentToValue(percent))}
      ghostValue={ghostPercent ?? undefined}
      disabled={disabled}
      onAnnounce={announceHelp}
      onValueGestureStart={() => {
        midiLearn.notifySliderDrag(paramKey, label);
      }}
      headAdornment={<MidiLearnSliderAdornment paramKey={paramKey} label={label} />}
      onValueChange={(nextPercent) => {
        if (disabled) return;
        onChange(paramKey, percentToValue(nextPercent));
      }}
    />
  );
};

const HelpButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { helpKey: string }> = ({ helpKey, onMouseEnter, onPointerDown, onFocus, ...props }) => {
  const { announceHelp } = useSliderHelp();
  const triggerHelp = useCallback(() => {
    announceHelp(helpKey);
  }, [announceHelp, helpKey]);

  return (
    <button
      {...props}
      onMouseEnter={(e) => {
        triggerHelp();
        onMouseEnter?.(e);
      }}
      onPointerDown={(e) => {
        triggerHelp();
        onPointerDown?.(e);
      }}
      onFocus={(e) => {
        triggerHelp();
        onFocus?.(e);
      }}
    />
  );
};

// Select component
interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onFocus?: React.FocusEventHandler<HTMLSelectElement>;
}

function Select<T extends string>({ label, value, options, onChange, onMouseEnter, onPointerDown, onFocus }: SelectProps<T>) {
  return (
    <div className="app-slider-group" style={styles.sliderGroup} onMouseEnter={onMouseEnter} onPointerDown={onPointerDown}>
      <div className="app-slider-label" style={styles.sliderLabel}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {label}
        </span>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} onFocus={onFocus} className="app-select" style={{ ...styles.select, maxWidth: '100%' }}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Main App

const App: React.FC = () => {
  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  const [splashOpacity, setSplashOpacity] = useState(0);

  // Splash gradient colors - procedurally generated from app's color palette
  const [splashGradient] = useState(() => {
    // App color palette (from SnowflakeUI prongs):
    // #F7FAFC text white, #C4724E muted orange, #7B9A6D sage green
    // #D4A520 mustard gold, #8B5CF6 purple, #5A7B8A slate blue
    // #3C7181 teal, #C1930A gold accent
    const palettes = [
      { baseHue: 25, name: 'orange' }, // Muted orange (#C4724E)
      { baseHue: 95, name: 'sage' }, // Sage green (#7B9A6D)
      { baseHue: 45, name: 'gold' }, // Mustard gold (#D4A520)
      { baseHue: 265, name: 'purple' }, // Purple (#8B5CF6)
      { baseHue: 200, name: 'slate' }, // Slate blue (#5A7B8A)
      { baseHue: 190, name: 'teal' }, // Teal (#3C7181)
    ];

    const palette = palettes[Math.floor(Math.random() * palettes.length)] ?? palettes[0]!;
    const hueVariation = (Math.random() - 0.5) * 20;

    // Muted, desaturated colors to blend with dark theme
    const inner = `hsl(${palette.baseHue + hueVariation}, ${30 + Math.random() * 15}%, ${40 + Math.random() * 12}%)`;
    const mid = `hsl(${palette.baseHue}, ${35 + Math.random() * 12}%, ${30 + Math.random() * 8}%)`;
    const outer = `hsl(${palette.baseHue - 10}, ${25 + Math.random() * 10}%, ${15 + Math.random() * 6}%)`;

    return { inner, mid, outer };
  });

  // Window size for splash gradient circle sizing
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 800,
    height: typeof window !== 'undefined' ? window.innerHeight : 600,
  });

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { macShellAvailable, cloudPresetAllowed, usesCapacitorLocalPresetLibrary, usesCloudBackedStatePresetLibrary, shouldInitializeCloudPresetStore } =
    usePlatformRuntimeCapabilities({
      cloudEnabled: CLOUD_ENABLED,
      sonicParityMode: isSonicParityMode(),
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
    sonicParityMode: isSonicParityMode(),
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
  });

  // Splash screen animation
  useEffect(() => {
    // Fade in
    const fadeInTimer = setTimeout(() => setSplashOpacity(1), 100);
    // Hold
    const holdTimer = setTimeout(() => setSplashOpacity(0), 3750);
    // Hide splash
    const hideTimer = setTimeout(() => setShowSplash(false), 5250);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(holdTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Load initial state from URL or defaults
  const [state, setState] = useState<SliderState>(() => resolveProductRuntimeInitialState({ normalizeState: normalizePresetForWeb }));
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
  const activeDawOutputSources = useMemo(
    () => getActiveDawOutputSourceIds(state) as DawOutputSourceId[],
    [
      state.padEnabled,
      state.pad2Enabled,
      state.leadEnabled,
      state.lead2Enabled,
      state.pianoEnabled,
      state.drumEnabled,
      state.granularEnabled,
      state.oceanSampleEnabled,
      state.waterEnabled,
      state.insectsEnabled,
      state.insects2Enabled,
      state.birdsEnabled,
      state.birds2Enabled,
      state.frogsEnabled,
      state.delayAEnabled,
      state.granularDelayEnabled,
      state.degradeEnabled,
      state.driftEnabled,
      state.erosionEnabled,
      state.dynamicsSaturationEnabled,
      state.degradeReverbSend,
      state.reverbDegradeSend,
      state.reverbEnabled,
      state.dynamicsEnabled,
    ],
  );

  useEffect(() => {
    const config = sanitizeDawOutputRoutingConfig(dawOutputRouting);
    saveDawOutputRoutingConfig(config);
    productRuntimePort.setDawOutputRouting(filterDawOutputRoutingConfigForSources(config, activeDawOutputSources));
  }, [activeDawOutputSources, dawOutputRouting]);

  useEffect(() => {
    const selection = sanitizeDawOutputDeviceSelection(dawOutputDevice);
    saveDawOutputDeviceSelection(selection);
    void productRuntimePort.setDawOutputDeviceId(selection.deviceId || null).catch((error: unknown) => {
      console.warn('DAW output device selection failed:', error);
    });
  }, [dawOutputDevice]);
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

  const getCurrentDrumMorphOverrideState = useCallback(
    (sourceState: SliderState = stateRef.current): ProductDrumMorphOverrideState =>
      getProductControlStateForProductEngine(productRuntimePort, sourceState).drumMorphOverrides,
    [],
  );

  const dispatchDrumMorphProductControlAction = useCallback(
    (sourceState: SliderState, action: ProductControlAction): ProductDrumMorphOverrideState =>
      dispatchProductControlActionForProductEngine(productRuntimePort, sourceState, action).drumMorphOverrides,
    [],
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

  const isSnowflakePrototypeRoute = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('snowflakePrototype') === '1' : false;
  const isSnowflakeGeneratorRoute = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('snowflakeGenerator') === '1' : false;

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
  const productCoreDebugSummary = useProductCoreDebugSummary(productRuntimeMode, productRuntimePort);
  // Snowflake welcome state: local-only six-arm macro seed until playback, preset load, or advanced mode activation.
  const [snowflakeActivated, setSnowflakeActivated] = useState(startInAdvancedEditor);
  const [welcomeDisplayState, setWelcomeDisplayState] = useState<SliderState>(() => createSignedSnowflakeWelcomeState());
  const handleWelcomeSliderChange = useCallback((key: keyof SliderState, value: number) => {
    setWelcomeDisplayState((prev) => ({ ...prev, [key]: value }));
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

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobileViewport = useIsMobileViewport();
  const reactiveVisualizerToggle = useVisualFeatureToggle(
    'kessho.visualizers.reactive.enabled',
    !isMobileViewport,
  );

  // ── Mobile-responsive style overrides ──
  const m = useMemo(() => {
    if (!isMobile) return null;
    return {
      container: {
        padding: '4px',
        maxWidth: '100%',
        overflowX: 'hidden' as const,
      } as React.CSSProperties,
      controls: {
        gap: '4px',
        marginBottom: '10px',
        paddingTop: '6px',
      } as React.CSSProperties,
      grid: {
        gridTemplateColumns: '1fr',
        gap: '8px',
        marginBottom: '12px',
      } as React.CSSProperties,
      panel: {
        padding: '10px',
        borderRadius: '8px',
        maxWidth: '100%',
        overflow: 'hidden' as const,
      } as React.CSSProperties,
      panelTitle: {
        fontSize: '0.9rem',
        marginBottom: '8px',
      } as React.CSSProperties,
      sliderGroup: {
        marginBottom: '8px',
        maxWidth: '100%',
        overflow: 'hidden' as const,
      } as React.CSSProperties,
      sliderLabel: {
        fontSize: '0.75rem',
        marginBottom: '3px',
        gap: '4px',
      } as React.CSSProperties,
      select: {
        fontSize: '0.78rem',
        padding: '6px 8px',
        minHeight: '36px',
        maxWidth: '100%',
      } as React.CSSProperties,
      tabBar: {
        justifyContent: 'flex-start',
        gap: '4px',
        padding: '5px max(6px, env(safe-area-inset-left))',
        borderRadius: '8px',
        marginBottom: '8px',
        flexWrap: 'nowrap' as const,
        overflowX: 'auto' as const,
        overflowY: 'hidden' as const,
        maxWidth: '100%',
        width: '100%',
        scrollSnapType: 'x proximity',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch' as const,
      } as React.CSSProperties,
      tab: {
        flex: '0 0 58px',
        minWidth: '58px',
        minHeight: '44px',
        padding: '6px 4px',
        fontSize: '0.58rem',
        gap: '2px',
        scrollSnapAlign: 'start',
        whiteSpace: 'nowrap' as const,
      } as React.CSSProperties,
      tabIcon: { fontSize: '0.9rem' } as React.CSSProperties,
      iconButton: {
        width: '36px',
        height: '36px',
        fontSize: '1.2rem',
        padding: '4px',
      } as React.CSSProperties,
      debugPanel: {
        padding: '10px',
        fontSize: '0.75rem',
        wordBreak: 'break-all' as const,
        overflow: 'hidden' as const,
      } as React.CSSProperties,
    };
  }, [isMobile]);

  // Collapsible panel state for mobile (track which panels are expanded)
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const togglePanel = useCallback((panelId: string) => {
    setExpandedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }, []);

  const [activeTab, setActiveTab] = useState<AdvancedTab>('global');
  const activePageAccent = ADVANCED_TAB_COLORS[activeTab];
  const activeTabStyle = useMemo(() => getAdvancedTabActiveStyle(activePageAccent), [activePageAccent]);
  const activePageAccentStyle = useMemo(
    () =>
      ({
        '--page-accent': activePageAccent,
      }) as React.CSSProperties,
    [activePageAccent],
  );
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
    setProductSynthEvolveTriggerCallback,
    setProductSynthStepPositionCallback,
    stateRef,
    uiMode,
  });

  const openAdvancedTab = useCallback(
    (tab: AdvancedTab) => {
      if (uiMode === 'snowflake' && !snowflakeActivated) {
        setSnowflakeActivated(true);
      }
      preloadAdvancedEditorRuntime();
      setActiveTab(tab);
      setUiMode('advanced');
    },
    [preloadAdvancedEditorRuntime, uiMode, snowflakeActivated],
  );

  useEffect(() => {
    const handleAppShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableShortcutTarget(event.target)) return;

      const shortcutTarget = TOP_LEVEL_SHORTCUTS[event.key] ?? (!event.shiftKey ? TOP_LEVEL_SHORTCUTS[event.code] : undefined) ?? ADVANCED_TAB_SHORTCUTS[event.key];

      if (!shortcutTarget) return;

      event.preventDefault();
      if (shortcutTarget === 'snowflake') {
        setUiMode('snowflake');
        return;
      }
      if (shortcutTarget === 'journey') {
        setSnowflakeActivated(true);
        setUiMode('journey');
        return;
      }

      openAdvancedTab(shortcutTarget);
    };

    window.addEventListener('keydown', handleAppShortcut);
    return () => window.removeEventListener('keydown', handleAppShortcut);
  }, [openAdvancedTab]);

  // Unified slider mode state: key → SliderMode ('single' | 'walk' | 'sampleHold')
  // Absent key means 'single'. dualSliderRanges stores ranges for walk/sampleHold modes.
  const [sliderModes, setSliderModes] = useState<Record<string, SliderMode>>({});
  const [dualSliderRanges, setDualSliderRanges] = useState<DualSliderState>({});
  const { globalRuntimeProps, resetPlaybackTimer } = useProductRuntimeGlobalSurface({
    playbackIsRunning,
    stopProductPlayback,
    runtimeComparison: globalRuntimeComparison,
    onResetCofDrift: resetCofDrift,
    recordingProps: globalRecordingProps,
  });

  const applyScopedDualRangesFromPreset = useCallback(
    (relevantKeys: string[], dualRanges?: Record<string, { min: number; max: number }>, presetSliderModes?: Record<string, SliderMode>) => {
      const relevantKeySet = new Set(relevantKeys);
      const nextWalkPositions: Record<string, number> = {};

      setSliderModes((prev) => {
        const next: Record<string, SliderMode> = { ...prev };
        for (const key of relevantKeySet) {
          delete next[key];
        }
        if (dualRanges) {
          for (const [key] of Object.entries(dualRanges)) {
            if (!relevantKeySet.has(key)) continue;
            next[key] = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
          }
        }
        return next;
      });

      setDualSliderRanges((prev) => {
        const next: Record<string, { min: number; max: number } | undefined> = {
          ...prev,
        };
        for (const key of relevantKeySet) {
          delete next[key];
        }
        if (dualRanges) {
          for (const [key, range] of Object.entries(dualRanges)) {
            if (!relevantKeySet.has(key)) continue;
            next[key] = range;
            const mode = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
            if (mode === 'walk') {
              nextWalkPositions[key] = 0.5;
            }
          }
        }
        return next as DualSliderState;
      });

      resetRuntimeWalkPositionsForKeys(relevantKeySet, nextWalkPositions);
    },
    [],
  );
  const [drumEditingVoice, setDrumEditingVoice] = useState<string | null>(null);
  const drumViewModeRef = useRef<SequencerViewMode>('detail');
  const drumStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const drumSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const drumEvolveConfigsRef = useRef<EvolveConfig[] | undefined>(undefined);
  const drumClockDivsRef = useRef<ClockDivision[] | undefined>(undefined);
  const drumSwingsRef = useRef<number[] | undefined>(undefined);
  const drumLinkedRef = useRef<boolean[] | undefined>(undefined);
  const drumPitchSettingsRef = useRef<PitchSettings[] | undefined>(undefined);
  const drumSeqSimpleStateRef = useRef<SeqSimpleState | undefined>(undefined);
  const drumSeqScatterStateRef = useRef<SeqScatterState | undefined>(undefined);

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
  const synthArpConfigsRef = useRef<ProductArpConfig[] | undefined>(undefined);
  const synthEvolveConfigsRef = useRef<EvolveConfig[] | undefined>(undefined);

  const [drumPresetVersion, setDrumPresetVersion] = useState(0);
  const [synthPresetVersion, setSynthPresetVersion] = useState(0);

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
        synthArpConfigs: sanitizeProductArpConfigs(synthArpConfigsRef.current),
        drumPitchSettings: normalizeSequencerPitchSettingsArray(drumPitchSettingsRef.current, 4) as PitchSettings[],
        synthPitchSettings: normalizeSequencerPitchSettingsArray(synthPitchSettingsRef.current, 4) as PitchSettings[],
        synthPitchBindingModes: synthPitchBindingModesRef.current,
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
    [dualSliderRanges, sliderModes, visualizerPresetName],
  );

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

  const handleCycleSliderMode = useCallback(
    (key: keyof SliderState) => {
      // Block changes when journey mode is playing
      if (isJourneyPlaying) return;

      const keyStr = key as string;
      if (SINGLE_ONLY_SLIDER_KEYS.has(keyStr)) {
        setSliderModes((prev) => {
          if (!(keyStr in prev)) return prev;
          const next = { ...prev };
          delete next[keyStr];
          return next;
        });
        setDualSliderRanges((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        clearRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);
        return;
      }
      const isMorphActive = morphPresetA !== null || morphPresetB !== null;

      const drumParamRoute = getDrumVoiceParamRoute(key);
      const drumVoice = drumParamRoute?.voice ?? null;
      const drumMorphKey = drumParamRoute?.morphKey ?? null;

      // Cycle: single → walk → sampleHold → single (walk-only keys skip sampleHold)
      const current = sliderModes[keyStr] ?? 'single';
      const nextMode: SliderMode = current === 'single' ? 'walk' : current === 'walk' ? (WALK_ONLY_DUAL_KEYS.has(keyStr) ? 'single' : 'sampleHold') : 'single';

      if (nextMode === 'single') {
        // Collapsing to single preserves the authored value; runtime dots can be stale at mode boundaries.
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) {
          const currentValue = getSliderNumericValue(key, state[key]);
          const fallbackValue = range.min + 0.5 * (range.max - range.min);
          const nextNumericValue = Math.max(range.min, Math.min(range.max, currentValue ?? fallbackValue));
          const quantizedValue = quantize(key, nextNumericValue);
          const nextValue = getStateValueFromSliderNumber(key, quantizedValue);
          setState((s) => ({ ...s, [key]: nextValue }));
        }
        // Clean up
        setDualSliderRanges((r) => {
          const newRanges = { ...r };
          delete newRanges[key];
          return newRanges;
        });
        clearRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);
        setSliderModes((prev) => {
          const next = { ...prev };
          delete next[keyStr];
          return next;
        });

        // Update morph preset dualRanges at endpoints (Rule 2)
        if (isMorphActive) {
          if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
            setMorphPresetA((prev) => {
              if (!prev) return null;
              const newDualRanges = { ...prev.dualRanges };
              const newSliderModes = { ...prev.sliderModes };
              delete newDualRanges[keyStr];
              delete newSliderModes[keyStr];
              return {
                ...prev,
                dualRanges: Object.keys(newDualRanges).length > 0 ? newDualRanges : undefined,
                sliderModes: Object.keys(newSliderModes).length > 0 ? newSliderModes : undefined,
              };
            });
          } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
            setMorphPresetB((prev) => {
              if (!prev) return null;
              const newDualRanges = { ...prev.dualRanges };
              const newSliderModes = { ...prev.sliderModes };
              delete newDualRanges[keyStr];
              delete newSliderModes[keyStr];
              return {
                ...prev,
                dualRanges: Object.keys(newDualRanges).length > 0 ? newDualRanges : undefined,
                sliderModes: Object.keys(newSliderModes).length > 0 ? newSliderModes : undefined,
              };
            });
          }
        }

        // Update drum morph dual range override at endpoints
        if (drumVoice && drumMorphKey) {
          const drumMorphPosition = state[drumMorphKey] as number;
          const currentVal = state[key] as number;
          if (isAtEndpoint0(drumMorphPosition)) {
            dispatchDrumMorphProductControlAction(stateRef.current, {
              type: 'drum-morph/dual-range-set',
              voice: drumVoice,
              param: keyStr,
              isDualMode: false,
              value: currentVal,
              endpoint: 0,
            });
          } else if (isAtEndpoint1(drumMorphPosition)) {
            dispatchDrumMorphProductControlAction(stateRef.current, {
              type: 'drum-morph/dual-range-set',
              voice: drumVoice,
              param: keyStr,
              isDualMode: false,
              value: currentVal,
              endpoint: 1,
            });
          }
        }
      } else {
        // Entering walk or sampleHold
        setSliderModes((prev) => ({ ...prev, [keyStr]: nextMode }));

        // If entering walk/sampleHold from single, create a range
        if (current === 'single') {
          const info = getParamInfo(key);
          if (info) {
            const currentVal = getSliderNumericValue(key, state[key]) ?? info.min;
            const rangeSize = (info.max - info.min) * 0.2; // 20% of total range
            const min = Math.max(info.min, currentVal - rangeSize / 2);
            const max = Math.min(info.max, currentVal + rangeSize / 2);
            setDualSliderRanges((r) => ({ ...r, [key]: { min, max } }));

            // Initialize random walk for walk mode (not for sampleHold)
            if (nextMode === 'walk') {
              seedRuntimeWalkPosition(keyStr);
              removeRuntimeTriggerPositions([keyStr]);
            } else {
              clearRuntimeWalkPositions([keyStr]);
              removeRuntimeTriggerPositions([keyStr]);
            }

            // Update morph preset dualRanges at endpoints (Rule 2)
            if (isMorphActive) {
              if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
                setMorphPresetA((prev) =>
                  prev
                    ? {
                        ...prev,
                        dualRanges: {
                          ...prev.dualRanges,
                          [keyStr]: { min, max },
                        },
                        sliderModes: {
                          ...prev.sliderModes,
                          [keyStr]: nextMode,
                        },
                      }
                    : null,
                );
              } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
                setMorphPresetB((prev) =>
                  prev
                    ? {
                        ...prev,
                        dualRanges: {
                          ...prev.dualRanges,
                          [keyStr]: { min, max },
                        },
                        sliderModes: {
                          ...prev.sliderModes,
                          [keyStr]: nextMode,
                        },
                      }
                    : null,
                );
              }
            }

            // Update drum morph dual range override at endpoints
            if (drumVoice && drumMorphKey) {
              const drumMorphPosition = state[drumMorphKey] as number;
              if (isAtEndpoint0(drumMorphPosition)) {
                dispatchDrumMorphProductControlAction(stateRef.current, {
                  type: 'drum-morph/dual-range-set',
                  voice: drumVoice,
                  param: keyStr,
                  isDualMode: true,
                  value: currentVal,
                  range: { min, max },
                  endpoint: 0,
                });
              } else if (isAtEndpoint1(drumMorphPosition)) {
                dispatchDrumMorphProductControlAction(stateRef.current, {
                  type: 'drum-morph/dual-range-set',
                  voice: drumVoice,
                  param: keyStr,
                  isDualMode: true,
                  value: currentVal,
                  range: { min, max },
                  endpoint: 1,
                });
              }
            }
          }
        } else if (current === 'walk' && nextMode === 'sampleHold') {
          // Switching from walk to sampleHold — stop live walk and clear stale trigger dots.
          clearRuntimeWalkPositions([keyStr]);
          removeRuntimeTriggerPositions([keyStr]);

          // Update morph preset sliderModes at endpoints (range is unchanged)
          if (isMorphActive) {
            if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
              setMorphPresetA((prev) =>
                prev
                  ? {
                      ...prev,
                      sliderModes: { ...prev.sliderModes, [keyStr]: nextMode },
                    }
                  : null,
              );
            } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
              setMorphPresetB((prev) =>
                prev
                  ? {
                      ...prev,
                      sliderModes: { ...prev.sliderModes, [keyStr]: nextMode },
                    }
                  : null,
              );
            }
          }
        }
      }
    },
    [
      isJourneyPlaying,
      dualSliderRanges,
      sliderModes,
      state,
      morphPosition,
      morphPresetA,
      morphPresetB,
      dispatchDrumMorphProductControlAction,
    ],
  );

  // Update dual slider range
  const handleDualRangeChange = useCallback(
    (key: keyof SliderState, min: number, max: number) => {
      // Block changes when journey mode is playing
      if (isJourneyPlaying) return;

      const keyStr = key as string;
      if (SINGLE_ONLY_SLIDER_KEYS.has(keyStr)) return;
      // Product runtime forwarding still gates unsupported keys in the audio sync effects.

      setDualSliderRanges((prev) => ({ ...prev, [key]: { min, max } }));

      // Update morph preset dualRanges at endpoints (Rule 2)
      const isMorphActive = morphPresetA !== null || morphPresetB !== null;
      if (isMorphActive) {
        if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
          setMorphPresetA((prev) =>
            prev
              ? {
                  ...prev,
                  dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } },
                }
              : null,
          );
        } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
          setMorphPresetB((prev) =>
            prev
              ? {
                  ...prev,
                  dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } },
                }
              : null,
          );
        }
      }

      const drumParamRoute = getDrumVoiceParamRoute(key);
      const drumVoice = drumParamRoute?.voice ?? null;
      const drumMorphKey = drumParamRoute?.morphKey ?? null;

      // Update drum morph dual range override at endpoints
      if (drumVoice && drumMorphKey) {
        const drumMorphPosition = state[drumMorphKey] as number;
        const currentVal = state[key] as number;
        if (isAtEndpoint0(drumMorphPosition)) {
          dispatchDrumMorphProductControlAction(stateRef.current, {
            type: 'drum-morph/dual-range-set',
            voice: drumVoice,
            param: keyStr,
            isDualMode: true,
            value: currentVal,
            range: { min, max },
            endpoint: 0,
          });
        } else if (isAtEndpoint1(drumMorphPosition)) {
          dispatchDrumMorphProductControlAction(stateRef.current, {
            type: 'drum-morph/dual-range-set',
            voice: drumVoice,
            param: keyStr,
            isDualMode: true,
            value: currentVal,
            range: { min, max },
            endpoint: 1,
          });
        }
      }
    },
    [isJourneyPlaying, morphPosition, morphPresetA, morphPresetB, state, dispatchDrumMorphProductControlAction],
  );

  const { cloudSharedPresetToSavedPreset, applyCloudSharedPreset } = useCloudSharedPresetRuntimeSurface({
    stateRef,
    setState,
    presetEngineUpdateOptions: presetProductRuntimeUpdateOptions,
    syncCoreProductAppliedPreset,
    normalizeState: normalizePresetForWeb,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
  });

  const { resolveSavedPresetForLoad, resolveSavedPresetByName } = usePresetLibraryRuntimeSurface<SavedPreset>({
    cloudEnabled: CLOUD_ENABLED,
    cloudPresetAllowed,
    cloudPresetStoreReadyPromiseRef,
    loadBundledPresets: loadPresetsFromFolder,
    loadCapacitorLocalPresets: loadCapacitorLocalStatePresets,
    loadCloudBackedPresets: loadActiveStatePresetStorePresets,
    loadPresetByName: loadActiveStatePresetStorePresetByName,
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
    || isSnowflakePrototypeRoute;

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
    enabled: isSonicParityMode(),
    runtime: productRuntimePort,
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
    setState((prev) => {
      const barsPerPhrase = Math.max(1, prev.transportBarsPerPhrase ?? 4);
      const beatsPerBar = Math.max(1, prev.transportBeatsPerBar ?? 4);
      const phraseSeconds = Math.max(0.001, prev.phraseLength ?? 16);
      const bpm = Math.max(1, prev.sequencerMasterBPM ?? prev.synthEuclidBaseBPM ?? prev.drumEuclidBaseBPM ?? 120);
      const primaryClock = prev.transportPrimaryClock ?? 'seconds';
      const nextBpm = quantize('sequencerMasterBPM', bpm);

      if (primaryClock === 'decoupled') {
        if (nextBpm === prev.sequencerMasterBPM && nextBpm === prev.synthEuclidBaseBPM && nextBpm === prev.drumEuclidBaseBPM) {
          return prev;
        }
        return {
          ...prev,
          sequencerMasterBPM: nextBpm,
          synthEuclidBaseBPM: nextBpm,
          drumEuclidBaseBPM: nextBpm,
        };
      }

      if (primaryClock === 'seconds') {
        const derivedBpm = quantize('sequencerMasterBPM', (barsPerPhrase * beatsPerBar * 60) / phraseSeconds);
        if (derivedBpm === prev.sequencerMasterBPM && derivedBpm === prev.synthEuclidBaseBPM && derivedBpm === prev.drumEuclidBaseBPM) {
          return prev;
        }
        return {
          ...prev,
          sequencerMasterBPM: derivedBpm,
          synthEuclidBaseBPM: derivedBpm,
          drumEuclidBaseBPM: derivedBpm,
        };
      }

      const derivedPhrase = quantize('phraseLength', (barsPerPhrase * beatsPerBar * 60) / bpm);
      if (derivedPhrase === prev.phraseLength && nextBpm === prev.sequencerMasterBPM && nextBpm === prev.synthEuclidBaseBPM && nextBpm === prev.drumEuclidBaseBPM) {
        return prev;
      }
      return {
        ...prev,
        phraseLength: derivedPhrase,
        sequencerMasterBPM: nextBpm,
        synthEuclidBaseBPM: nextBpm,
        drumEuclidBaseBPM: nextBpm,
      };
    });
  }, [
    state.transportPrimaryClock,
    state.phraseLength,
    state.sequencerMasterBPM,
    state.synthEuclidBaseBPM,
    state.drumEuclidBaseBPM,
    state.transportBarsPerPhrase,
    state.transportBeatsPerBar,
  ]);

  const nativeDualRanges = useMemo(() => extractNativeDualRanges(dualSliderRanges), [dualSliderRanges]);

  // Web audio does not consume dual-slider ranges, so avoid re-sending params when
  // only the UI runtime range model changes.
  useEffect(() => {
    if (pendingImmediateLeadPresetSyncRef.current) {
      pendingImmediateLeadPresetSyncRef.current = false;
      scheduleProductRuntimeParamUpdate(state, {
        immediate: true,
        reason: 'ui-control-change',
      });
      return;
    }
    syncScheduledProductRuntimeState(state);
  }, [scheduleProductRuntimeParamUpdate, state, syncScheduledProductRuntimeState]);

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
        const preservedEnabledFlags = options?.preserveEnabledFlags
          ? {
              padEnabled: prev.padEnabled,
              pad2Enabled: prev.pad2Enabled,
              leadEnabled: prev.leadEnabled,
              lead2Enabled: prev.lead2Enabled,
              pianoEnabled: prev.pianoEnabled,
              drumEnabled: prev.drumEnabled,
              granularEnabled: prev.granularEnabled,
              oceanSampleEnabled: prev.oceanSampleEnabled,
              waterEnabled: prev.waterEnabled,
              insectsEnabled: prev.insectsEnabled,
              insects2Enabled: prev.insects2Enabled,
              birdsEnabled: prev.birdsEnabled,
              birds2Enabled: prev.birds2Enabled,
              frogsEnabled: prev.frogsEnabled,
              delayAEnabled: prev.delayAEnabled,
              granularDelayEnabled: prev.granularDelayEnabled,
              reverbEnabled: prev.reverbEnabled,
            }
          : null;
        let newState = { ...prev, [key]: stateValue };
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

        const routeKey = key as keyof SliderState;
        const positiveNumber = typeof stateValue === 'number' && stateValue > 0;

        if (positiveNumber) {
          switch (routeKey) {
            case 'delayAMix':
            case 'delayAReverbSend':
            case 'delayAToBSend':
            case 'delayADegradeSend':
              newState.delayAEnabled = true;
              if (routeKey === 'delayAToBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularDelayActivity':
            case 'granularDelayRepeats':
            case 'granularDelayMix':
            case 'granularDelayReverbSend':
            case 'granularDelayFilter':
            case 'granularDelayVibrato':
            case 'delayBToASend':
            case 'delayBDegradeSend':
            case 'delayBWarpIntensity':
            case 'delayBSpread':
              newState.granularDelayEnabled = true;
              break;
            case 'granularLevel':
            case 'granularReverbSend':
            case 'granularDelayASend':
            case 'granularDelayBSend':
            case 'granularDegradeSend':
              newState.granularEnabled = true;
              if (routeKey === 'granularDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              // Mutual exclusion: zero the reverse direction
              if (positiveNumber) newState.delayBGranularSend = 0;
              break;
            case 'delayAGranularSend':
              newState.delayAEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'delayBGranularSend':
              newState.granularDelayEnabled = true;
              newState.granularEnabled = true;
              // Mutual exclusion: zero the reverse direction
              if (positiveNumber) newState.granularDelayBSend = 0;
              break;
            case 'degradeReverbSend':
              newState.reverbEnabled = true;
              if (positiveNumber) {
                newState = normalizeDegradeReverbCrossfeed(newState, prev, {
                  preserveActiveDirection: 'last-edited',
                  lastEditedDirection: 'degrade-to-reverb',
                });
              }
              break;
            case 'reverbDegradeSend':
              if (positiveNumber) {
                newState = normalizeDegradeReverbCrossfeed(newState, prev, {
                  preserveActiveDirection: 'last-edited',
                  lastEditedDirection: 'reverb-to-degrade',
                });
              }
              break;
            case 'lead1Level':
            case 'lead1ReverbSend':
            case 'lead1DelayASend':
            case 'lead1DelayBSend':
            case 'degradeLead1Send':
              newState.leadEnabled = true;
              if (routeKey === 'lead1DelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularLead1Send':
              newState.leadEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'lead2Level':
            case 'lead2ReverbSend':
            case 'lead2DelayASend':
            case 'lead2DelayBSend':
            case 'degradeLead2Send':
              newState.lead2Enabled = true;
              if (routeKey === 'lead2DelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularLead2Send':
              newState.lead2Enabled = true;
              newState.granularEnabled = true;
              break;
            case 'pianoLevel':
            case 'pianoReverbSend':
            case 'pianoDelayASend':
            case 'pianoDelayBSend':
            case 'degradePianoSend':
              newState.pianoEnabled = true;
              if (routeKey === 'pianoDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularPianoSend':
              newState.pianoEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'drumLevel':
            case 'drumReverbSend':
            case 'drumDelayASend':
            case 'drumDelayBSend':
            case 'degradeDrumSend':
              newState.drumEnabled = true;
              if (routeKey === 'drumDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularDrumSend':
              newState.drumEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'oceanSampleLevel':
            case 'oceanReverbSend':
            case 'oceanDelayASend':
            case 'oceanDelayBSend':
            case 'degradeWavesSend':
            case 'oceanSliceDuration':
            case 'oceanSliceDensity':
              newState.oceanSampleEnabled = true;
              if (routeKey === 'oceanDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularWavesSend':
              newState.oceanSampleEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'natureLevel':
            case 'natureReverbSend':
            case 'natureDelayASend':
            case 'natureDelayBSend':
            case 'degradeNatureSend':
              if (routeKey === 'natureDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularNatureSend':
              newState.granularEnabled = true;
              break;
            case 'birdsLevel':
            case 'birdsSliceDuration':
            case 'birdsSliceDensity':
              newState.birdsEnabled = true;
              break;
            case 'birds2Level':
            case 'birds2SliceDuration':
            case 'birds2SliceDensity':
              newState.birds2Enabled = true;
              break;
            case 'frogsLevel':
            case 'frogsSliceDuration':
            case 'frogsSliceDensity':
              newState.frogsEnabled = true;
              break;
            case 'synthLevel':
              newState.padEnabled = true;
              break;
            case 'pad1ReverbSend':
            case 'degradePad1Send':
              newState.padEnabled = true;
              break;
            case 'pad2ReverbSend':
            case 'degradePad2Send':
              newState.pad2Enabled = true;
              break;
            case 'pad1DelayASend':
            case 'pad1DelayBSend':
              newState.padEnabled = true;
              break;
            case 'pad2Level':
            case 'pad2DelayASend':
            case 'pad2DelayBSend':
              newState.pad2Enabled = true;
              break;
            case 'granularPad1Send':
              newState.padEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'granularPad2Send':
              newState.pad2Enabled = true;
              newState.granularEnabled = true;
              break;
            case 'waterLevel':
            case 'waterReverbSend':
            case 'waterDelayASend':
            case 'waterDelayBSend':
            case 'degradeWaterSend':
            case 'waterLayerHardDrops':
            case 'waterLayerWaterDrops':
            case 'waterLayerTurbulence':
            case 'waterLayerBubbling':
            case 'waterLayerSurf':
            case 'waterLayerChannels':
              newState.waterEnabled = true;
              if (routeKey === 'waterDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularWaterSend':
              newState.waterEnabled = true;
              newState.granularEnabled = true;
              break;
            case 'insectsLevel':
              newState.insectsEnabled = true;
              break;
            case 'insectsSharedLevel':
              break;
            case 'insects2Level':
              newState.insects2Enabled = true;
              break;
            case 'insectsReverbSend':
            case 'insDelayASend':
            case 'insDelayBSend':
            case 'degradeInsectsSend':
              if (routeKey === 'insDelayBSend') {
                newState.granularDelayEnabled = true;
              }
              break;
            case 'granularInsectsSend':
              newState.granularEnabled = true;
              break;
            default:
              break;
          }
          if (ROUTING_DELAY_A_INPUT_KEYS.has(routeKey)) {
            newState.delayAEnabled = true;
          }
          if (ROUTING_DELAY_B_INPUT_KEYS.has(routeKey)) {
            newState.granularDelayEnabled = true;
          }
          if (ROUTING_NATURE_KEYS.has(routeKey) && !newState.birdsEnabled && !newState.birds2Enabled && !newState.frogsEnabled) {
            newState.birdsEnabled = true;
          }
          if (ROUTING_INSECTS_KEYS.has(routeKey) && !newState.insectsEnabled && !newState.insects2Enabled) {
            newState.insectsEnabled = true;
          }
          if (ROUTING_DEGRADE_ACTIVE_KEYS.has(routeKey)) {
            newState.dynamicsEnabled = true;
            newState.degradeEnabled = true;
            if (!newState.driftEnabled && !newState.erosionEnabled) {
              newState.driftEnabled = true;
            }
            if ((newState.driftMix ?? 0) <= 0 && (newState.erosionMix ?? 0) <= 0) {
              if (newState.erosionEnabled && !newState.driftEnabled) {
                newState.erosionMix = 1;
              } else {
                newState.driftMix = 1;
              }
            }
            if ((newState.degradeLevel ?? 0) <= 0) {
              newState.degradeLevel = 1;
            }
          }
        }

        newState = preserveRunningDrumSequencerSource(prev, newState as SliderState);

        const pad1WetActive =
          (newState.synthLevel ?? 0) > 0 ||
          (newState.pad1ReverbSend ?? 0) > 0 ||
          (newState.pad1DelayASend ?? 0) > 0 ||
          (newState.pad1DelayBSend ?? 0) > 0 ||
          (newState.granularPad1Send ?? 0) > 0 ||
          (newState.degradePad1Send ?? 0) > 0;
        const pad2WetActive =
          (newState.pad2Level ?? 0) > 0 ||
          (newState.pad2ReverbSend ?? 0) > 0 ||
          (newState.pad2DelayASend ?? 0) > 0 ||
          (newState.pad2DelayBSend ?? 0) > 0 ||
          (newState.granularPad2Send ?? 0) > 0 ||
          (newState.degradePad2Send ?? 0) > 0;
        const granularEngineActive =
          (newState.granularLevel ?? 0) > 0 ||
          (newState.granularReverbSend ?? 0) > 0 ||
          (newState.granularDelayASend ?? 0) > 0 ||
          (newState.granularDelayBSend ?? 0) > 0 ||
          (newState.granularDegradeSend ?? 0) > 0 ||
          (newState.delayAGranularSend ?? 0) > 0 ||
          (newState.delayBGranularSend ?? 0) > 0 ||
          (newState.granularPad1Send ?? 0) > 0 ||
          (newState.granularPad2Send ?? 0) > 0 ||
          (newState.granularLead1Send ?? 0) > 0 ||
          (newState.granularLead2Send ?? 0) > 0 ||
          (newState.granularPianoSend ?? 0) > 0 ||
          (newState.granularDrumSend ?? 0) > 0 ||
          (newState.granularWavesSend ?? 0) > 0 ||
          (newState.granularNatureSend ?? 0) > 0 ||
          (newState.granularWaterSend ?? 0) > 0 ||
          (newState.granularInsectsSend ?? 0) > 0;
        const delayAWetActive =
          (newState.delayAMix ?? 0) > 0 ||
          (newState.delayAReverbSend ?? 0) > 0 ||
          (newState.delayAToBSend ?? 0) > 0 ||
          (newState.delayAGranularSend ?? 0) > 0 ||
          (newState.delayADegradeSend ?? 0) > 0 ||
          (newState.delayBToASend ?? 0) > 0 ||
          (newState.pad1DelayASend ?? 0) > 0 ||
          (newState.pad2DelayASend ?? 0) > 0 ||
          (newState.lead1DelayASend ?? 0) > 0 ||
          (newState.lead2DelayASend ?? 0) > 0 ||
          (newState.pianoDelayASend ?? 0) > 0 ||
          (newState.drumDelayASend ?? 0) > 0 ||
          (newState.oceanDelayASend ?? 0) > 0 ||
          (newState.waterDelayASend ?? 0) > 0 ||
          (newState.insDelayASend ?? 0) > 0 ||
          (newState.natureDelayASend ?? 0) > 0 ||
          (newState.granularDelayASend ?? 0) > 0;
        const delayBWetActive =
          (newState.granularDelayMix ?? 0) > 0 ||
          (newState.granularDelayReverbSend ?? 0) > 0 ||
          (newState.delayBToASend ?? 0) > 0 ||
          (newState.delayBGranularSend ?? 0) > 0 ||
          (newState.delayBDegradeSend ?? 0) > 0 ||
          (newState.delayAToBSend ?? 0) > 0 ||
          (newState.pad1DelayBSend ?? 0) > 0 ||
          (newState.pad2DelayBSend ?? 0) > 0 ||
          (newState.lead1DelayBSend ?? 0) > 0 ||
          (newState.lead2DelayBSend ?? 0) > 0 ||
          (newState.pianoDelayBSend ?? 0) > 0 ||
          (newState.drumDelayBSend ?? 0) > 0 ||
          (newState.oceanDelayBSend ?? 0) > 0 ||
          (newState.waterDelayBSend ?? 0) > 0 ||
          (newState.insDelayBSend ?? 0) > 0 ||
          (newState.natureDelayBSend ?? 0) > 0 ||
          (newState.granularDelayBSend ?? 0) > 0;
        const lead1WetActive =
          (newState.lead1Level ?? 0) > 0 ||
          (newState.lead1ReverbSend ?? 0) > 0 ||
          (newState.lead1DelayASend ?? 0) > 0 ||
          (newState.lead1DelayBSend ?? 0) > 0 ||
          (newState.granularLead1Send ?? 0) > 0 ||
          (newState.degradeLead1Send ?? 0) > 0;
        const lead2WetActive =
          (newState.lead2Level ?? 0) > 0 ||
          (newState.lead2ReverbSend ?? 0) > 0 ||
          (newState.lead2DelayASend ?? 0) > 0 ||
          (newState.lead2DelayBSend ?? 0) > 0 ||
          (newState.granularLead2Send ?? 0) > 0 ||
          (newState.degradeLead2Send ?? 0) > 0;
        const pianoWetActive =
          (newState.pianoLevel ?? 0) > 0 ||
          (newState.pianoReverbSend ?? 0) > 0 ||
          (newState.pianoDelayASend ?? 0) > 0 ||
          (newState.pianoDelayBSend ?? 0) > 0 ||
          (newState.granularPianoSend ?? 0) > 0 ||
          (newState.degradePianoSend ?? 0) > 0;
        const drumWetActive =
          isDrumSequencerActive(newState as SliderState) ||
          (newState.drumLevel ?? 0) > 0 ||
          (newState.drumReverbSend ?? 0) > 0 ||
          (newState.drumDelayASend ?? 0) > 0 ||
          (newState.drumDelayBSend ?? 0) > 0 ||
          (newState.granularDrumSend ?? 0) > 0 ||
          (newState.degradeDrumSend ?? 0) > 0;
        const oceanWetActive =
          (newState.oceanSampleLevel ?? 0) > 0 ||
          (newState.oceanReverbSend ?? 0) > 0 ||
          (newState.oceanDelayASend ?? 0) > 0 ||
          (newState.oceanDelayBSend ?? 0) > 0 ||
          (newState.granularWavesSend ?? 0) > 0 ||
          (newState.degradeWavesSend ?? 0) > 0;
        const birdsWetActive =
          (newState.birdsLevel ?? 0) > 0 ||
          (newState.natureReverbSend ?? 0) > 0 ||
          (newState.natureDelayASend ?? 0) > 0 ||
          (newState.natureDelayBSend ?? 0) > 0 ||
          (newState.granularNatureSend ?? 0) > 0 ||
          (newState.degradeNatureSend ?? 0) > 0;
        const birds2WetActive =
          (newState.birds2Level ?? 0) > 0 ||
          (newState.natureReverbSend ?? 0) > 0 ||
          (newState.natureDelayASend ?? 0) > 0 ||
          (newState.natureDelayBSend ?? 0) > 0 ||
          (newState.granularNatureSend ?? 0) > 0 ||
          (newState.degradeNatureSend ?? 0) > 0;
        const frogsWetActive =
          (newState.frogsLevel ?? 0) > 0 ||
          (newState.natureReverbSend ?? 0) > 0 ||
          (newState.natureDelayASend ?? 0) > 0 ||
          (newState.natureDelayBSend ?? 0) > 0 ||
          (newState.granularNatureSend ?? 0) > 0 ||
          (newState.degradeNatureSend ?? 0) > 0;
        const waterWetActive =
          (newState.waterLevel ?? 0) > 0 ||
          (newState.waterReverbSend ?? 0) > 0 ||
          (newState.waterDelayASend ?? 0) > 0 ||
          (newState.waterDelayBSend ?? 0) > 0 ||
          (newState.waterLayerHardDrops ?? 0) > 0 ||
          (newState.waterLayerWaterDrops ?? 0) > 0 ||
          (newState.waterLayerTurbulence ?? 0) > 0 ||
          (newState.waterLayerBubbling ?? 0) > 0 ||
          (newState.waterLayerSurf ?? 0) > 0 ||
          (newState.waterLayerChannels ?? 0) > 0 ||
          (newState.granularWaterSend ?? 0) > 0 ||
          (newState.degradeWaterSend ?? 0) > 0;
        const insectsSharedWetActive =
          (newState.insectsReverbSend ?? 0) > 0 || (newState.insDelayASend ?? 0) > 0 || (newState.insDelayBSend ?? 0) > 0 || (newState.granularInsectsSend ?? 0) > 0 || (newState.degradeInsectsSend ?? 0) > 0;

        if (!granularEngineActive) {
          newState.granularEnabled = false;
        }
        if (!delayAWetActive) {
          newState.delayAEnabled = false;
        }
        if (!delayBWetActive) {
          newState.granularDelayEnabled = false;
        }
        if (!lead1WetActive) {
          newState.leadEnabled = false;
        }
        if (!lead2WetActive) {
          newState.lead2Enabled = false;
        }
        if (!pianoWetActive) {
          newState.pianoEnabled = false;
        }
        if (!drumWetActive) {
          newState.drumEnabled = false;
        }
        if (!oceanWetActive) {
          newState.oceanSampleEnabled = false;
        }
        if (!birdsWetActive) {
          newState.birdsEnabled = false;
        }
        if (!birds2WetActive) {
          newState.birds2Enabled = false;
        }
        if (!frogsWetActive) {
          newState.frogsEnabled = false;
        }
        if (!pad1WetActive) {
          newState.padEnabled = false;
        }
        if (!pad2WetActive) {
          newState.pad2Enabled = false;
        }
        if (!waterWetActive) {
          newState.waterEnabled = false;
        }
        if ((newState.insectsLevel ?? 0) <= 0 && !insectsSharedWetActive) {
          newState.insectsEnabled = false;
        }
        if ((newState.insects2Level ?? 0) <= 0 && !insectsSharedWetActive) {
          newState.insects2Enabled = false;
        }

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
          newState = {
            ...newState,
            ...preservedEnabledFlags,
          };
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
      const mode: SliderMode = dualModeSupported ? (normalizeDualSliderMode(keyStr, sliderModes[keyStr]) ?? 'single') : 'single';
      const walkPos = getRuntimeSliderPosition(keyStr, mode);
      const isFlashing = getRuntimeSliderFlashing(keyStr, mode);

      return {
        mode,
        dualRange: dualModeSupported ? dualSliderRanges[paramKey] : undefined,
        walkPosition: dualModeSupported && productRuntimeRangeSupported ? walkPos : undefined,
        isFlashing: dualModeSupported && productRuntimeRangeSupported ? isFlashing : false,
        onCycleMode: dualModeSupported ? handleCycleSliderMode : undefined,
        onDualRangeChange: dualModeSupported ? handleDualRangeChange : undefined,
      };
    },
    [productRuntimeSupportsRangeKey, sliderModes, dualSliderRanges, handleCycleSliderMode, handleDualRangeChange],
  );

  const shouldDisableLeadRandomTiming = useCallback((nextState: SliderState): boolean => {
    if (!nextState.leadRandomEnabled) return false;
    const randomSource = nextState.leadRandomSource ?? 'lead1';
    if (randomSource === 'lead2') return !nextState.lead2Enabled;
    if (randomSource === 'piano') return !nextState.pianoEnabled;
    return !nextState.leadEnabled;
  }, []);

  // Handle select change
  const handleSelectChange = useCallback(
    <K extends keyof SliderState>(key: K, value: SliderState[K]) => {
      // Mark that user has interacted with the UI
      hasUserInteractedRef.current = true;
      const padMorphParamChange = getPadMorphParamChange(key);
      setState((prev) => {
        const newState: SliderState = { ...prev, [key]: value } as SliderState;
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
    [shouldDisableLeadRandomTiming, applyMorphEndpointStatePatch],
  );

  useEffect(() => {
    if (!shouldDisableLeadRandomTiming(state)) return;
    setState((prev) => {
      if (!shouldDisableLeadRandomTiming(prev)) return prev;
      return { ...prev, leadRandomEnabled: false };
    });
  }, [shouldDisableLeadRandomTiming, state.leadEnabled, state.lead2Enabled, state.pianoEnabled, state.leadRandomEnabled, state.leadRandomSource]);

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
    if (!isSonicParityMode()) return;
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
  }, []);

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

  const renderMacAudioStatusPill = useCallback(() => {
    if (!macShellAvailable) return null;
    const outputName = macAudioOutputStatus?.outputName ?? 'Mac Output';
    const routeLabel = macAudioOutputStatus?.isAirPlay ? 'AirPlay' : macAudioOutputStatus?.transportType ? macAudioOutputStatus.transportType : 'macOS';
    const sampleRate = macAudioOutputStatus?.sampleRate ? `${Math.round(macAudioOutputStatus.sampleRate / 100) / 10}k` : null;

    return (
      <div style={styles.macAudioStatus} aria-label="macOS audio output">
        <span style={styles.macAudioStatusText}>
          {routeLabel} · {outputName}
          {sampleRate ? ` · ${sampleRate}` : ''}
        </span>
        <button
          type="button"
          style={{
            ...styles.macAudioStatusButton,
            ...(macAirPlayPerformanceActive ? styles.macAudioStatusButtonActive : {}),
          }}
          aria-pressed={macAirPlayPerformanceActive}
          onClick={handleMacAirPlayPerformanceToggle}
          title="Toggle AirPlay performance mode"
        >
          Stable
        </button>
        <button type="button" style={styles.macAudioStatusButton} onClick={openMacSoundSettings} title="Open macOS Sound settings">
          Sound
        </button>
      </div>
    );
  }, [handleMacAirPlayPerformanceToggle, macAirPlayPerformanceActive, macAudioOutputStatus, macShellAvailable, openMacSoundSettings]);

  const renderBackgroundAudioStatusPill = useCallback(() => {
    if (productRuntimeMode !== 'core-product') return null;
    const wakeLockAction = backgroundAudioStatus.wakeLockStatus === 'active'
      ? releaseVisiblePageWakeLock
      : requestVisiblePageWakeLock;
    const wakeLockDisabled = backgroundAudioStatus.wakeLockStatus === 'unsupported' || backgroundAudioStatus.pageStatus !== 'foreground';
    const wakeLockLabel = backgroundAudioStatus.wakeLockStatus === 'active' ? 'Release' : 'Wake';
    const nativeProbeLabel = nativeProductRendererDiagnosticStatus.active
      ? nativeProductRendererDiagnosticStatus.probePeak !== null
        ? ` · Native ${nativeProductRendererDiagnosticStatus.probePeak.toFixed(3)}`
        : nativeProductRendererDiagnosticStatus.bridgeAvailable
          ? ' · Native ready'
          : ' · Native waiting'
      : '';

    return (
      <div style={styles.backgroundAudioStatus} aria-label="Browser background audio status" title={backgroundAudioStatus.limitation}>
        <span style={styles.macAudioStatusText}>
          {backgroundAudioStatus.pageStatus === 'foreground' ? 'Foreground' : 'Hidden'}
          {' · '}
          {backgroundAudioStatus.productLifecycleState}
          {' · Media '}
          {backgroundAudioStatus.mediaSessionStatus}
          {' · Wake '}
          {backgroundAudioStatus.wakeLockStatus}
          {nativeProbeLabel}
        </span>
        <button
          type="button"
          style={{
            ...styles.macAudioStatusButton,
            ...(backgroundAudioStatus.wakeLockStatus === 'active' ? styles.macAudioStatusButtonActive : {}),
            ...(wakeLockDisabled ? styles.statusButtonDisabled : {}),
          }}
          onClick={() => void wakeLockAction()}
          disabled={wakeLockDisabled}
          title="Visible-page Wake Lock. Browser/mobile lock-screen and app-background playback remain best-effort."
        >
          {wakeLockLabel}
        </button>
      </div>
    );
  }, [
    backgroundAudioStatus,
    nativeProductRendererDiagnosticStatus,
    productRuntimeMode,
    releaseVisiblePageWakeLock,
    requestVisiblePageWakeLock,
  ]);

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

  // Reapply drum morph interpolation when a drum preset changes while in mid-morph
  // This mirrors the main morph system's behavior
  // Only re-runs when actual drum preset names change (not on every state change)
  const prevDrumPresetsRef = useRef<Record<string, string>>({});

  const drumPresetFingerprint = `${state.drumSubPresetA}|${state.drumSubPresetB}|${state.drumKickPresetA}|${state.drumKickPresetB}|${state.drumClickPresetA}|${state.drumClickPresetB}|${state.drumBeepHiPresetA}|${state.drumBeepHiPresetB}|${state.drumBeepLoPresetA}|${state.drumBeepLoPresetB}|${state.drumNoisePresetA}|${state.drumNoisePresetB}|${state.drumMembranePresetA}|${state.drumMembranePresetB}`;

  useEffect(() => {
    // Check each drum voice for preset changes
    const drumVoices: DrumPresetVoice[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    const presetKeys: Record<DrumPresetVoice, { a: keyof SliderState; b: keyof SliderState; morph: keyof SliderState }> = {
      sub: { a: 'drumSubPresetA', b: 'drumSubPresetB', morph: 'drumSubMorph' },
      kick: {
        a: 'drumKickPresetA',
        b: 'drumKickPresetB',
        morph: 'drumKickMorph',
      },
      click: {
        a: 'drumClickPresetA',
        b: 'drumClickPresetB',
        morph: 'drumClickMorph',
      },
      beepHi: {
        a: 'drumBeepHiPresetA',
        b: 'drumBeepHiPresetB',
        morph: 'drumBeepHiMorph',
      },
      beepLo: {
        a: 'drumBeepLoPresetA',
        b: 'drumBeepLoPresetB',
        morph: 'drumBeepLoMorph',
      },
      noise: {
        a: 'drumNoisePresetA',
        b: 'drumNoisePresetB',
        morph: 'drumNoiseMorph',
      },
      membrane: {
        a: 'drumMembranePresetA',
        b: 'drumMembranePresetB',
        morph: 'drumMembraneMorph',
      },
    };

    let nextResolvedState: SliderState | null = null;
    for (const voice of drumVoices) {
      const keys = presetKeys[voice];
      const currentState: SliderState = nextResolvedState ?? stateRef.current; // Read current state from ref
      const presetA = currentState[keys.a] as string;
      const presetB = currentState[keys.b] as string;
      const morphValue = currentState[keys.morph] as number;

      const prevA = prevDrumPresetsRef.current[keys.a];
      const prevB = prevDrumPresetsRef.current[keys.b];

      const presetAChanged = presetA !== prevA;
      const presetBChanged = presetB !== prevB;

      // Update refs
      prevDrumPresetsRef.current[keys.a] = presetA;
      prevDrumPresetsRef.current[keys.b] = presetB;

      // Only reapply if a preset changed and we're in mid-morph
      if (!presetAChanged && !presetBChanged) continue;

      // Check if we're in mid-morph (not at endpoints) using shared utility
      // Drum morph uses 0-1 scale
      if (!isInMidMorph(morphValue)) continue;

      // Reapply the morphed values using applyMorphToState
      // This recalculates interpolation with the new preset
      const drumMorphOverrideState = getCurrentDrumMorphOverrideState(currentState);
      const morphedParams = applyMorphToState(currentState, voice, drumMorphOverrideState);
      nextResolvedState = { ...currentState, ...morphedParams };

      // Also reapply dual range interpolation if there are overrides
      const currentValues: Record<string, number> = {};
      const overrides = getProductDrumMorphDualRangeOverrides(drumMorphOverrideState, voice);
      for (const param of Object.keys(overrides)) {
        const stateVal = currentState[param as keyof SliderState];
        if (typeof stateVal === 'number') {
          currentValues[param] = stateVal;
        }
      }

      const interpolatedRanges = interpolateProductDrumMorphDualRanges(
        drumMorphOverrideState,
        voice,
        morphValue,
        currentValues,
      );

      for (const [param, interpState] of Object.entries(interpolatedRanges)) {
        const paramKey = param as keyof SliderState;

        if (interpState.isDualMode && interpState.range) {
          setSliderModes((prev) => ({
            ...prev,
            [paramKey as string]: prev[paramKey as string] ?? 'sampleHold',
          }));
          setDualSliderRanges((prev) => ({
            ...prev,
            [paramKey]: interpState.range!,
          }));
        } else {
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
    if (nextResolvedState) {
      const currentState = stateRef.current;
      const liveResolvedState = preserveRunningDrumSequencerSource(currentState, nextResolvedState);
      setState(liveResolvedState);
      scheduleProductRuntimeParamUpdate(liveResolvedState, {
        immediate: true,
        reason: 'morph-control-change',
        triggerCritical: true,
      });
    }
  }, [drumPresetFingerprint, scheduleProductRuntimeParamUpdate, stateRef, getCurrentDrumMorphOverrideState]); // Only re-run when drum preset names actually change

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
    skipNextPresetLoadEngineSync,
    normalizeState: normalizePresetForWeb,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
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

  const { handleLoadJourneyPreset, handleSaveJourneyPreset, handleDeleteJourneyPreset, handleUndoJourneyPreset } = useJourneyPresetActionSurface({
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

  if (isSnowflakeGeneratorRoute) {
    const clearGeneratorRoute = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      params.delete('snowflakeGenerator');
      const nextSearch = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`);
    };

    return (
      <SnowflakeGeneratorPage
        onBack={() => {
          clearGeneratorRoute();
          setUiMode('snowflake');
        }}
      />
    );
  }

  if (isSnowflakePrototypeRoute) {
    const clearPrototypeRoute = () => {
      if (typeof window === 'undefined') return;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    };

    return (
      <SnowflakePrototypePage
        state={state}
        dualRanges={dualSliderRanges}
        sliderModes={sliderModes}
        {...snowflakePrototypePlaybackProps}
        onBack={() => {
          clearPrototypeRoute();
          setUiMode('snowflake');
        }}
        onShowAdvanced={() => {
          clearPrototypeRoute();
          setUiMode('advanced');
        }}
      />
    );
  }

  // Render journey mode UI
  if (uiMode === 'journey') {
    return (
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
        {renderMacAudioStatusPill()}
        {renderBackgroundAudioStatusPill()}
      </>
    );
  }

  // Render snowflake UI
  if (uiMode === 'snowflake') {
    return (
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
          {renderMacAudioStatusPill()}
          {renderBackgroundAudioStatusPill()}
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
      </>
    );
  }

  // Render advanced UI
  return (
    <SliderHelpProvider activePage={activeTab === 'visualizer' ? 'global' : activeTab}>
      <MidiLearnProvider
        onParamChange={handleRoutingParamChange}
        onMidiMessage={pushProductMidiMessage}
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
        {renderMacAudioStatusPill()}
        {renderBackgroundAudioStatusPill()}
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
                isMobile={isMobile}
                isRunning={playbackIsRunning}
                expandedPanels={expandedPanels}
                onParamChange={handleSliderChange}
                onSelectChange={handleSelectChange}
                onStateChange={handleStateChange}
                togglePanel={togglePanel}
                sliderProps={sliderProps}
                {...productPageRuntimeSurface.drumPageRuntimeProps}
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
                initialSeqScatterState={drumSeqScatterStateRef.current}
                onSeqScatterStateChange={(s) => {
                  drumSeqScatterStateRef.current = s;
                }}
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
                {...productPageRuntimeSurface.dynamicsPageRuntimeProps}
              />
            )}

            {/* === ROUTING TAB === */}
            {activeTab === 'routing' && (
              <RoutingPage
                state={state}
                isMobile={isMobile}
                onParamChange={handleRoutingParamChange}
                onColumnParamChange={handleRoutingColumnChange}
                onToggleSource={handleRoutingSourceToggle}
                onMidiMessage={pushProductMidiMessage}
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

        {/* Debug Panel */}
        <div className="app-debug-panel" style={{ ...styles.debugPanel, ...m?.debugPanel }}>
          <h3 style={{ ...styles.panelTitle, color: '#a855f7' }}>Debug Info</h3>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>UTC Bucket:</span>
            <span style={styles.debugValue}>{engineState.currentBucket || '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Seed:</span>
            <span style={styles.debugValue}>{engineState.currentSeed ? engineState.currentSeed.toString(16).toUpperCase() : '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Scale Family:</span>
            <span style={styles.debugValue}>
              {engineState.harmonyState?.scaleFamily.name
                ? `${NOTE_NAMES[engineState.harmonyState.effectiveRoot] ?? NOTE_NAMES[state.cofDriftEnabled ? calculateDriftedRoot(state.rootNote, engineState.cofCurrentStep) : state.rootNote]} ${engineState.harmonyState.scaleFamily.name}`
                : '—'}
            </span>
          </div>
          {state.cofDriftEnabled && (
            <div style={styles.debugRow}>
              <span style={styles.debugLabel}>CoF Key:</span>
              <span style={styles.debugValue}>
                {NOTE_NAMES[engineState.harmonyState?.effectiveRoot ?? calculateDriftedRoot(state.rootNote, engineState.cofCurrentStep)]} (step: {engineState.cofCurrentStep > 0 ? '+' : ''}
                {engineState.cofCurrentStep})
              </span>
            </div>
          )}
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Current Chord:</span>
            <span style={styles.debugValue}>{engineState.harmonyState ? formatChordDegrees(engineState.harmonyState.currentChord.midiNotes) : '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Next Harmony Event:</span>
            <span style={styles.debugValue}>
              {engineState.isRunning && engineState.transportDebug && engineState.transportDebug.nextHarmonyEventIn !== null
                ? `${engineState.transportDebug.nextHarmonyEventIn.toFixed(1)}s`
                : '—'}
            </span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Next Phrase:</span>
            <span style={styles.debugValue}>{engineState.isRunning && engineState.transportDebug ? `${engineState.transportDebug.nextPhraseBoundaryIn.toFixed(1)}s` : '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Next Progression:</span>
            <span style={styles.debugValue}>
              {engineState.isRunning && engineState.transportDebug && engineState.transportDebug.nextProgressionStepIn !== null
                ? `${engineState.transportDebug.nextProgressionStepIn.toFixed(1)}s`
                : '—'}
            </span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Phrase Length:</span>
            <span style={styles.debugValue}>{engineState.transportDebug ? `${engineState.transportDebug.effectivePhraseSeconds.toFixed(2)}s` : '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Beat BPM:</span>
            <span style={styles.debugValue}>{engineState.transportDebug ? `${engineState.transportDebug.effectiveBpm.toFixed(1)}` : '—'}</span>
          </div>
          {productRuntimeMode === 'core-product' && (
            <>
              <div
                style={{
                  borderTop: '1px solid #333',
                  margin: '8px 0',
                  paddingTop: '8px',
                }}
              >
                <span
                  style={{
                    color: '#a855f7',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                  }}
                >
                  Product Core
                </span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Earth:</span>
                <span style={styles.debugValue}>{productCoreDebugSummary?.earth ?? '—'}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Walk:</span>
                <span style={styles.debugValue}>{productCoreDebugSummary?.randomWalk ?? '—'}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>S&amp;H:</span>
                <span style={styles.debugValue}>{productCoreDebugSummary?.sampleHold ?? '—'}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>BG:</span>
                <span style={styles.debugValue}>{backgroundAudioStatus.pageStatus} · {backgroundAudioStatus.lifecycleEvent} · {backgroundAudioStatus.productLifecycleState}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Wake:</span>
                <span style={styles.debugValue}>{backgroundAudioStatus.wakeLockStatus}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Media:</span>
                <span style={styles.debugValue}>{backgroundAudioStatus.mediaSessionStatus}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Native:</span>
                <span style={styles.debugValue}>
                  {nativeProductRendererDiagnosticStatus.active
                    ? [
                      nativeProductRendererDiagnosticStatus.bridgeAvailable ? 'bridge' : 'waiting',
                      nativeProductRendererDiagnosticStatus.rendererRunning ? 'running' : 'idle',
                      nativeProductRendererDiagnosticStatus.probePeak !== null
                        ? `peak ${nativeProductRendererDiagnosticStatus.probePeak.toFixed(3)}`
                        : null,
                      nativeProductRendererDiagnosticStatus.probeRms !== null
                        ? `rms ${nativeProductRendererDiagnosticStatus.probeRms.toFixed(3)}`
                        : null,
                      nativeProductRendererDiagnosticStatus.routeChangeCount > 0
                        ? `route ${nativeProductRendererDiagnosticStatus.routeChangeCount}`
                        : null,
                      nativeProductRendererDiagnosticStatus.interruptionBeginCount + nativeProductRendererDiagnosticStatus.interruptionEndCount > 0
                        ? `int ${nativeProductRendererDiagnosticStatus.interruptionBeginCount}/${nativeProductRendererDiagnosticStatus.interruptionEndCount}`
                        : null,
                      nativeProductRendererDiagnosticStatus.mediaServicesResetCount > 0
                        ? `reset ${nativeProductRendererDiagnosticStatus.mediaServicesResetCount}`
                        : null,
                      nativeProductRendererDiagnosticStatus.remoteCommandCount > 0
                        ? `cmd ${nativeProductRendererDiagnosticStatus.lastRemoteCommand ?? nativeProductRendererDiagnosticStatus.remoteCommandCount}`
                        : null,
                      nativeProductRendererDiagnosticStatus.lastAudioSessionEvent,
                    ].filter(Boolean).join(' · ')
                    : '—'}
                </span>
              </div>
            </>
          )}
          <div
            style={{
              borderTop: '1px solid #333',
              margin: '8px 0',
              paddingTop: '8px',
            }}
          >
            <span
              style={{
                color: '#a855f7',
                fontSize: '0.7rem',
                fontWeight: 'bold',
              }}
            >
              FX Ownership
            </span>
          </div>
          {(['delayA', 'delayB', 'granular', 'reverb'] as const).map((bus) => {
            const ownerState = engineState.fxOwners[bus];
            const ownerLabel = ownerState.owner ? FX_OWNER_LABELS[ownerState.owner] : '—';
            const originLabel = ownerState.lastOrigin ? FX_ORIGIN_LABELS[ownerState.lastOrigin] : null;
            return (
              <div key={bus} style={styles.debugRow}>
                <span style={styles.debugLabel}>{FX_BUS_LABELS[bus]}:</span>
                <span style={styles.debugValue}>{ownerState.owner ? `${ownerLabel}${ownerState.active ? '' : ' (stale)'}${originLabel ? ` · ${originLabel}` : ''}` : '—'}</span>
              </div>
            );
          })}

          {/* Tension / Chord Complexity */}
          {engineState.harmonyState && (
            <>
              <div
                style={{
                  borderTop: '1px solid #333',
                  margin: '8px 0',
                  paddingTop: '8px',
                }}
              >
                <span
                  style={{
                    color: '#a855f7',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                  }}
                >
                  Tension &amp; Chord Complexity
                </span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Scale Tension:</span>
                <span style={styles.debugValue}>{engineState.harmonyState.scaleTension.toFixed(2)}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Chord Tension:</span>
                <span style={styles.debugValue}>{engineState.harmonyState.chordTension.toFixed(2)}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Chord Type:</span>
                <span style={styles.debugValue}>
                  {(() => {
                    const ct = engineState.harmonyState!.chordTension;
                    if (ct < 0.2) return 'Triads';
                    if (ct < 0.4) return 'Triads + Sus';
                    if (ct < 0.6) return '7th Chords';
                    if (ct < 0.8) return '9ths / Extensions';
                    return 'Clusters / Quartal';
                  })()}
                </span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Chord Size:</span>
                <span style={styles.debugValue}>{engineState.harmonyState.currentChord.midiNotes.length} notes</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Current Degree:</span>
                <span style={styles.debugValue}>{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][engineState.harmonyState.currentDegree] ?? '—'}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Tension Arc:</span>
                <span style={styles.debugValue}>
                  {engineState.harmonyState.tensionArc.type}
                  {engineState.harmonyState.tensionArc.phrasesRemaining > 0 ? ` (${engineState.harmonyState.tensionArc.phrasesRemaining} left)` : ''}
                </span>
              </div>
            </>
          )}

          {/* Journey Debug Info */}
          {isJourneyPlaying && journey.config && (
            <>
              <div
                style={{
                  borderTop: '1px solid #333',
                  margin: '8px 0',
                  paddingTop: '8px',
                }}
              >
                <span
                  style={{
                    color: '#a855f7',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                  }}
                >
                  Journey Mode
                </span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Phase:</span>
                <span style={styles.debugValue}>{journey.state.phase}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Current:</span>
                <span style={styles.debugValue}>{journey.config.nodes.find((n) => n.id === journey.state.currentNodeId)?.presetName || '—'}</span>
              </div>
              {journey.state.phase === 'morphing' && (
                <>
                  <div style={styles.debugRow}>
                    <span style={styles.debugLabel}>Morphing To:</span>
                    <span style={styles.debugValue}>{journey.config.nodes.find((n) => n.id === journey.state.nextNodeId)?.presetName || '—'}</span>
                  </div>
                  <div style={styles.debugRow}>
                    <span style={styles.debugLabel}>Morph Progress:</span>
                    <span style={styles.debugValue}>{(journey.state.morphProgress * 100).toFixed(0)}%</span>
                  </div>
                  <div style={styles.debugRow}>
                    <span style={styles.debugLabel}>Morph Time Left:</span>
                    <span style={styles.debugValue}>{(journey.state.resolvedMorphDuration * (1 - journey.state.morphProgress) * (state.phraseLength ?? 16)).toFixed(1)}s</span>
                  </div>
                </>
              )}
              {journey.state.phase === 'playing' && (
                <>
                  <div style={styles.debugRow}>
                    <span style={styles.debugLabel}>Phrases Left:</span>
                    <span style={styles.debugValue}>{Math.ceil(journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress))}</span>
                  </div>
                  <div style={styles.debugRow}>
                    <span style={styles.debugLabel}>Phrase Time Left:</span>
                    <span style={styles.debugValue}>{(journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress) * (state.phraseLength ?? 16)).toFixed(1)}s</span>
                  </div>
                  <div style={styles.debugRow}>
                    <span style={styles.debugLabel}>Next Preset:</span>
                    <span style={styles.debugValue}>{journey.config.nodes.find((n) => n.id === journey.state.plannedNextNodeId)?.presetName || '—'}</span>
                  </div>
                </>
              )}
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Morph Direction:</span>
                <span style={styles.debugValue}>{journeyMorphDirectionRef.current}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Morph Pos:</span>
                <span style={styles.debugValue}>{morphPosition}%</span>
              </div>
            </>
          )}
        </div>

        <AppFooterMark />
      </div>
      </MidiLearnProvider>
    </SliderHelpProvider>
  );
};

export default App;
