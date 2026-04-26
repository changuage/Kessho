/**
 * Main App Component
 * 
 * Complete UI with all sliders, selects, and debug panel.
 * Wires up to audio engine with deterministic state management.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SliderState,
  SliderMode,
  DEFAULT_STATE,
  quantize,
  decodeStateFromUrl,
  getParamInfo,
  getSliderNumericValue,
  getStateValueFromSliderNumber,
  migratePreset,
  DRUM_MORPH_KEYS,
} from './ui/state';
import { DualSlider, DualSliderRange } from './ui/DualSlider';
import { SliderPrimitive } from './ui/sliderSystem';
import { audioEngine, preloadAudioEngine } from './audio/runtime';
import type { EngineState } from './audio/runtime';
import { isCloudEnabled as isCloudPresetConfigEnabled } from './cloud/config';
import { formatChordDegrees, calculateDriftedRoot } from './audio/harmony';
import { DrumVoiceType as DrumPresetVoice } from './audio/drumPresets';
import { getPadPreset, morphPadPresets, PAD_PRESET_PARAM_KEYS, PAD1_TO_PAD2_KEY } from './audio/padPresets';
import {
  morphWaterPresets,
  WATER_MORPH_PARAM_KEYS,
  INSECT_ENGINE_DEFAULTS,
  getWaterPresetDualRanges,
  getWaterPresetSliderModes,
} from './audio/waterPresets';
import { applyMorphToState, setDrumMorphOverride, clearDrumMorphEndpointOverrides, clearMidMorphOverrides, setDrumMorphDualRangeOverride, getDrumMorphDualRangeOverrides, interpolateDrumMorphDualRanges } from './audio/drumMorph';

import { isInMidMorph, isAtEndpoint0, isAtEndpoint1 } from './audio/morphUtils';
import { applyPreset, USER_PREFERENCE_KEYS } from './ui/presetUtils';
import {
  clearRuntimeFlashKeys,
  getRuntimeSliderFlashing,
  getRuntimeSliderPosition,
  mergeRuntimeTriggerPositions,
  mergeRuntimeWalkPositions,
  removeRuntimeTriggerPositions,
  removeRuntimeWalkPositions,
  replaceRuntimeWalkPositions,
  setRuntimeFlashKeys,
} from './ui/runtimeSliderState';
import {
  mergeRuntimeValues,
  removeRuntimeValues,
} from './ui/runtimeValueState';
import {
  getGranularPresetData,
  getGranularPresetSliderModes,
  isGranularDelayBStateKey,
} from './ui/granular/granularPresets';
import SnowflakeUI from './ui/SnowflakeUI';
import { CpuOverlay } from './ui/CpuOverlay';
import { SliderHelpProvider, useSliderHelp } from './ui/SliderHelpOverlay';
import { CircleOfFifths, getMorphedRootNote } from './ui/CircleOfFifths';
import { useJourney } from './ui/journeyState';
import type { SeqSimpleState } from './ui/drums/SeqSimple';
import { getVersionData } from './presets/codec';
import type { IPresetStore } from './presets/PresetStore';
import { extractPresetVersionMetadata } from './presets/presetUtils';
import { SHARED_PRESET_TEST_MODE } from './presets/sharedMode';
import { extractOptimizedStatePresetData } from './presets/statePresetOptimization';
import type { PresetEntry } from './presets/types';
import { buildPresetVersionMetadata } from './presets/versionMetadataHelpers';
import { CollapsiblePanel } from './ui/CollapsiblePanel';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './ui/sequencer/useEuclideanSequencer';
import type { PitchBindingMode } from './audio/drumSeqTypes';
import type { SliderPageId } from './ui/sliderHelpCatalog';
import { isIOSLikeDevice, isMobileDevice } from './platform';
import { useVisibleInterval } from './ui/hooks/useVisibleInterval';
import {
  addCapacitorRemoteCommandListener,
  getCapacitorBackgroundAudioStatus,
  isCapacitorBackgroundAudioAvailable,
  isCapacitorNativeShell,
  setCapacitorNowPlaying,
  shouldUseCapacitorNativeAudioSpike,
  startCapacitorNativePlayback,
  stopCapacitorNativePlayback,
  syncCapacitorNativeAudioState,
} from './native/capacitorBackgroundAudio';
import type { SynthKeyboardUiState } from './ui/synth/SynthPage';
import {
  RECORD_TRACK_FILENAME_SUFFIX,
  STEM_RECORD_DEFAULTS,
  STEM_RECORD_TRACK_IDS,
  type RecordTrackId,
  type StemRecordTrackId,
} from './audio/recordingTracks';

const JourneyModeView = React.lazy(() => import('./ui/JourneyModeView'));
const GlobalPage = React.lazy(() => import('./ui/global/GlobalPage'));
const SynthPage = React.lazy(() => import('./ui/synth/SynthPage'));
const ReverbPage = React.lazy(() => import('./ui/reverb/ReverbPage'));
const DrumPage = React.lazy(() => import('./ui/drums/DrumPage'));
const GranularPage = React.lazy(() => import('./ui/granular/GranularPage'));
const DelayPage = React.lazy(() => import('./ui/delay/DelayPage'));
const RoutingPage = React.lazy(() => import('./ui/routing/RoutingPage'));
const EarthPage = React.lazy(() => import('./ui/earth/EarthPage'));
const SliderLabPage = React.lazy(() => import('./ui/sliderLab/SliderLabPage'));

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Unicode symbols with text variation selector (U+FE0E) to prevent emoji rendering on mobile
const TEXT_SYMBOLS = {
  play: '▶\uFE0E',
  stop: '■\uFE0E',
  record: '●\uFE0E',
  range: '⟷\uFE0E',
  random: '⟷\uFE0E',
  download: '⬇\uFE0E',
  upload: '⬆\uFE0E',
  hexagon: '⬡\uFE0E',
  sparkle: '✲\uFE0E',
  target: '◎\uFE0E',
  filledCircle: '●\uFE0E',
  emptyCircle: '○\uFE0E',
  // Drum voice icons
  drumSub: '◉\uFE0E',
  drumKick: '⬤\uFE0E',
  drumClick: '▫\uFE0E',
  drumBeepHi: '⊡\uFE0E',
  drumBeepLo: '⋰\uFE0E',
  drumNoise: '≋\uFE0E',
  drumMembrane: '※\uFE0E',
} as const;

const DEFAULT_AUTO_START_PRESET_NAME = 'String Waves';
const CLOUD_ENABLED = isCloudPresetConfigEnabled();
const CAPACITOR_LOCAL_STATE_PRESET_SCOPE = 'global';

const LAZY_PAGE_FALLBACK = (
  <div style={{ padding: '24px', color: '#9ca3af', textAlign: 'center' }}>
    Loading...
  </div>
);

// File input ref for loading presets
const fileInputRef = { current: null as HTMLInputElement | null };

// Global audio element for iOS media session (must persist and be played from user gesture)
let mediaSessionAudio: HTMLAudioElement | null = null;

// Setup iOS media session with audio element connected to Web Audio output
const setupIOSMediaSession = async () => {
  if (!('mediaSession' in navigator)) return;
  
  // Create audio element if it doesn't exist
  if (!mediaSessionAudio) {
    mediaSessionAudio = new Audio();
    mediaSessionAudio.loop = false; // We'll use MediaStream, not a file
    mediaSessionAudio.volume = 1.0; // Full volume since it carries actual audio on iOS
    
    // Important for iOS
    (mediaSessionAudio as any).webkitPreservesPitch = false;
  }
  
  // Set metadata first
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Generative Ambient',
    artist: 'Kessho',
    album: 'Ambient Dreams',
  });
  
  navigator.mediaSession.playbackState = 'playing';
  
  // Handle controls
  navigator.mediaSession.setActionHandler('play', () => {
    mediaSessionAudio?.play();
    audioEngine.resume();
    navigator.mediaSession.playbackState = 'playing';
  });
  
  navigator.mediaSession.setActionHandler('pause', () => {
    mediaSessionAudio?.pause();
    audioEngine.suspend();
    navigator.mediaSession.playbackState = 'paused';
  });
};

const recorderTapWorkletUrl = new URL(
  `${import.meta.env.BASE_URL}worklets/recorder-tap.worklet.js`,
  window.location.href,
).toString();

// Connect the audio element to Web Audio MediaStream (call after engine starts)
// iOS-only: other mobile browsers are more stable via direct AudioContext output.
const connectMediaSessionToWebAudio = () => {
  if (!mediaSessionAudio) return;
  
  // Only connect on iOS - non-iOS browsers don't need MediaStream bridging
  // and can exhibit periodic output stutter through the extra stream path.
  const isIOS = isIOSLikeDevice();
  
  if (!isIOS) {
    console.log('Skipping MediaStream audio element on non-iOS devices');
    return;
  }
  
  const stream = audioEngine.getMediaStream();
  if (stream) {
    mediaSessionAudio.srcObject = stream;
    mediaSessionAudio.play().catch(e => console.log('Media stream play failed:', e));
    console.log('MediaStream connected to audio element for background playback');
  }
};

// Stop iOS media session
const stopIOSMediaSession = () => {
  if (mediaSessionAudio) {
    mediaSessionAudio.pause();
    mediaSessionAudio.srcObject = null;
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }
};

// Preset type - local override with sliderModes support
interface SavedPreset {
  name: string;
  timestamp: string;
  state: SliderState;
  dualRanges?: Record<string, { min: number; max: number }>;  // Optional for backward compatibility
  sliderModes?: Record<string, SliderMode>;  // Mode per parameter key
  drumEvolveConfigs?: EvolveConfig[];
  synthEvolveConfigs?: EvolveConfig[];
  drumSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  synthSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  synthPitchBindingModes?: PitchBindingMode[];
}

// iOS-only reverb types that won't work on web
const IOS_ONLY_REVERB_TYPES = new Set([
  'smallRoom', 'mediumRoom', 'largeRoom', 'mediumHall', 'largeHall',
  'mediumChamber', 'largeChamber', 'largeRoom2', 'mediumHall2', 
  'mediumHall3', 'largeHall2'
]);

// Decorative snowflake state shown before user interacts.
// All arms appear at ~75% length/width so the snowflake looks inviting.
// Values are computed so valueToSliderPosition(v, min, max) ≈ 0.75 for each arm.
const SNOWFLAKE_WELCOME_STATE: SliderState = {
  ...DEFAULT_STATE,
  masterVolume: 0.75,
  tension: 0.15,
  // Arm lengths (level keys) — 75% on log curve ≈ 0.487 of linear range
  reverbLevel: 0.97,       // max 2
  synthLevel: 0.49,        // max 1\n  pad2Level: 0.49,         // max 1
  granularLevel: 1.95,     // max 4 (snowflake scale)
  leadLevel: 1.0,           // hidden — always unity (per-lead levels control)
  lead1Level: 0.49,         // max 1
  drumLevel: 0.49,         // max 1
  oceanSampleLevel: 0.49,  // max 1
  // Arm widths (reverb send / secondary keys) — 75% visual width
  reverbDecay: 0.56,
  pad1ReverbSend: 0.56,
  pad2ReverbSend: 0.56,
  granularReverbSend: 0.56,
  lead1ReverbSend: 0.56,
  lead2ReverbSend: 0.56,
  drumReverbSend: 0.06,    // uses 0.1 exponent; 0.06^0.1 ≈ 0.75
  oceanFilterCutoff: 6800,  // normalized ≈ 0.56 of 40–12000
  // Enable all engines so the "disabled → 0" normalization doesn't zero them
  granularEnabled: true,
  leadEnabled: true,
  drumEnabled: true,
  oceanSampleEnabled: true,
};

// User preference keys imported from presetUtils.ts

// Reverb character presets are defined in ReverbPage.tsx

// Check preset for iOS-only settings and return warnings
const checkPresetCompatibility = (preset: SavedPreset): string[] => {
  const warnings: string[] = [];
  
  // Check for iOS-only reverb type
  if (preset.state.reverbType && IOS_ONLY_REVERB_TYPES.has(preset.state.reverbType)) {
    warnings.push(`Reverb type "${preset.state.reverbType}" is iOS-only and will use "hall" instead.`);
  }
  
  return warnings;
};

// Normalize iOS-only settings to web-compatible values
const normalizePresetForWeb = (state: SliderState): SliderState => {
  const normalized = { ...state };
  const raw = state as Partial<SliderState> & Record<string, unknown>;
  
  // Replace iOS-only reverb types with 'hall'
  if (normalized.reverbType && IOS_ONLY_REVERB_TYPES.has(normalized.reverbType)) {
    normalized.reverbType = 'hall';
  }

  // Legacy lead timbre migration:
  // Map old timbre range (0..1 Rhodes→Gamelan) to Lead 1 morph value.
  // Keep Lead 1 preset pair fixed to Soft Rhodes↔Gamelan for old presets.
  const hasLead1Morph =
    typeof raw.lead1Morph === 'number' ||
    typeof raw.lead1MorphMin === 'number';
  const hasLegacyTimbreRange =
    typeof raw.leadTimbreMin === 'number' &&
    typeof raw.leadTimbreMax === 'number';

  if (hasLegacyTimbreRange) {
    const legacyMin = Math.min(1, Math.max(0, Number(raw.leadTimbreMin ?? 0)));
    const legacyMax = Math.min(1, Math.max(0, Number(raw.leadTimbreMax ?? 0)));
    const currentMorph = typeof raw.lead1Morph === 'number' ? raw.lead1Morph : (typeof raw.lead1MorphMin === 'number' ? raw.lead1MorphMin : undefined);
    const hasLegacyDominance = !hasLead1Morph || (
      currentMorph === 0 &&
      (legacyMin !== 0 || legacyMax !== 0)
    );
    if (hasLegacyDominance) {
      normalized.lead1Morph = (legacyMin + legacyMax) / 2;
    }
  }

  // Legacy ADSR migration:
  // If old preset includes explicit lead ADSR fields and no explicit mode, default to custom ADSR ON.
  const hasExplicitAdsrMode = typeof raw.lead1UseCustomAdsr === 'boolean' || typeof raw.leadUseCustomAdsr === 'boolean';
  const hasLegacyLeadAdsr = ['leadAttack', 'leadDecay', 'leadSustain', 'leadRelease'].some((key) => {
    const value = raw[key];
    return Object.prototype.hasOwnProperty.call(raw, key) && typeof value === 'number' && Number.isFinite(value);
  });
  if (!hasExplicitAdsrMode) {
    normalized.lead1UseCustomAdsr = hasLegacyLeadAdsr;
  } else if (typeof raw.leadUseCustomAdsr === 'boolean' && typeof raw.lead1UseCustomAdsr !== 'boolean') {
    normalized.lead1UseCustomAdsr = raw.leadUseCustomAdsr as boolean;
  }

  // Legacy ADSHR rename migration:
  // Old presets used leadAttack/Decay/Sustain/Hold/Release — now lead1*.
  const adsrhMap: [string, keyof SliderState][] = [
    ['leadAttack', 'lead1Attack'], ['leadDecay', 'lead1Decay'],
    ['leadSustain', 'lead1Sustain'], ['leadHold', 'lead1Hold'],
    ['leadRelease', 'lead1Release'],
  ];
  for (const [oldKey, newKey] of adsrhMap) {
    if (typeof raw[oldKey] === 'number' && typeof raw[newKey as string] !== 'number') {
      (normalized as unknown as Record<string, unknown>)[newKey] = raw[oldKey] as number;
    }
  }

  // Ensure legacy presets use the intended Lead 1 pair
  if (!normalized.lead1PresetA) normalized.lead1PresetA = 'soft_rhodes';
  if (!normalized.lead1PresetB) normalized.lead1PresetB = 'gamelan';

  // Legacy lead density / octave rename migration:
  // Old presets used leadDensity, leadOctave, leadOctaveRange — now lead1*.
  if (typeof raw.leadDensity === 'number' && typeof raw.lead1Density !== 'number') {
    normalized.lead1Density = raw.leadDensity as number;
  }
  if (typeof raw.leadOctave === 'number' && typeof raw.lead1Octave !== 'number') {
    normalized.lead1Octave = raw.leadOctave as number;
  }
  if (typeof raw.leadOctaveRange === 'number' && typeof raw.lead1OctaveRange !== 'number') {
    normalized.lead1OctaveRange = raw.leadOctaveRange as number;
  }

  // Legacy leadReverbSend → lead1ReverbSend rename migration:
  if (typeof raw.leadReverbSend === 'number' && typeof raw.lead1ReverbSend !== 'number') {
    normalized.lead1ReverbSend = raw.leadReverbSend as number;
  }
  // Legacy leadLevel → lead1Level rename migration (leadLevel is now always 1.0):
  if (typeof raw.leadLevel === 'number' && typeof raw.lead1Level !== 'number') {
    normalized.lead1Level = raw.leadLevel as number;
  }

  // Legacy waterSpace → waterReverbSend rename migration:
  if (typeof raw.waterSpace === 'number' && typeof raw.waterReverbSend !== 'number') {
    normalized.waterReverbSend = raw.waterSpace as number;
  }

  // Legacy looper* → granular* rename migration:
  // Old presets/cloud saves used looper* keys — now granular*.
  for (const key of Object.keys(raw)) {
    if (key.startsWith('looper')) {
      const newKey = 'granular' + key.slice(6);
      if (newKey in DEFAULT_STATE && !(newKey in raw)) {
        (normalized as unknown as Record<string, unknown>)[newKey] = raw[key];
      }
    }
  }

  // Defensive sanitization: preserve only valid scalar types and fall back to defaults.
  // Prevents runtime crashes when legacy/cloud presets contain null/invalid values.
  const merged = { ...DEFAULT_STATE, ...normalized } as SliderState;
  for (const key of Object.keys(DEFAULT_STATE) as (keyof SliderState)[]) {
    const defaultValue = DEFAULT_STATE[key];
    const value = merged[key];

    if (typeof defaultValue === 'number') {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          (merged as unknown as Record<string, unknown>)[key] = defaultValue;
        }
      } else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        (merged as unknown as Record<string, unknown>)[key] = Number(value);
      } else {
        (merged as unknown as Record<string, unknown>)[key] = defaultValue;
      }
    } else if (typeof defaultValue === 'boolean') {
      if (typeof value !== 'boolean') {
        (merged as unknown as Record<string, unknown>)[key] = defaultValue;
      }
    } else if (typeof defaultValue === 'string') {
      if (typeof value !== 'string') {
        (merged as unknown as Record<string, unknown>)[key] = defaultValue;
      }
    }
  }

  // ── Apply pad preset morph params ──
  // When loading a preset that specifies padPresetA/B, morph their params onto state
  const presetA = getPadPreset(merged.padPresetA, 'pad1');
  const presetB = getPadPreset(merged.padPresetB, 'pad1');
  if (presetA && presetB) {
    const morphed = morphPadPresets(presetA, presetB, merged.padMorph);
    for (const k of PAD_PRESET_PARAM_KEYS) {
      if (k in morphed && !Object.prototype.hasOwnProperty.call(raw, k)) {
        (merged as unknown as Record<string, unknown>)[k] = morphed[k];
      }
    }
  }

  // ── Apply pad2 preset morph params ──
  const pad2A = getPadPreset(merged.pad2PresetA, 'pad2');
  const pad2B = getPadPreset(merged.pad2PresetB, 'pad2');
  if (pad2A && pad2B) {
    const morphed = morphPadPresets(pad2A, pad2B, merged.pad2Morph);
    for (const k of PAD_PRESET_PARAM_KEYS) {
      if (k in morphed) {
        const pad2Key = PAD1_TO_PAD2_KEY[k];
        if (pad2Key && !Object.prototype.hasOwnProperty.call(raw, pad2Key)) {
          (merged as unknown as Record<string, unknown>)[pad2Key] = morphed[k];
        }
      }
    }
  }

  return merged;
};

// Load presets by fetching the manifest from public/presets
const loadPresetsFromFolder = async (): Promise<SavedPreset[]> => {
  const presets: SavedPreset[] = [];
  try {
    // Fetch the preset manifest (list of files)
    const manifestResponse = await fetch('/presets/manifest.json');
    if (!manifestResponse.ok) {
      console.warn('No preset manifest found, trying known files...');
      // Fallback: try known preset files
      const knownFiles = ['Ethereal_Ambient.json', 'Dark_Textures.json', 'Bright_Bells.json', 'StringWavesR.json', 'ZoneOut1.json', 'Gamelantest.json'];
      for (const file of knownFiles) {
        try {
          const response = await fetch(`/presets/${file}`);
          if (response.ok) {
            const data = await response.json();
            presets.push(migratePreset({
              name: data.name || file.replace('.json', ''),
              timestamp: data.timestamp || new Date().toISOString(),
              state: data.state || data,
              dualRanges: data.dualRanges,
              sliderModes: data.sliderModes,
              drumEvolveConfigs: data.drumEvolveConfigs,
              synthEvolveConfigs: data.synthEvolveConfigs,
              drumSubLaneStates: data.drumSubLaneStates,
              synthSubLaneStates: data.synthSubLaneStates,
              synthPitchBindingModes: data.synthPitchBindingModes,
            }));
          }
        } catch (e) {
          // Skip missing files
        }
      }
      return presets;
    }
    
    const manifest = await manifestResponse.json();
    for (const file of manifest.files || []) {
      try {
        const response = await fetch(`/presets/${file}`);
        if (response.ok) {
          const data = await response.json();
          presets.push(migratePreset({
            name: data.name || file.replace('.json', ''),
            timestamp: data.timestamp || new Date().toISOString(),
            state: data.state || data,
            dualRanges: data.dualRanges,
            sliderModes: data.sliderModes,
            drumEvolveConfigs: data.drumEvolveConfigs,
            synthEvolveConfigs: data.synthEvolveConfigs,
            drumSubLaneStates: data.drumSubLaneStates,
            synthSubLaneStates: data.synthSubLaneStates,
            synthPitchBindingModes: data.synthPitchBindingModes,
          }));
        }
      } catch (e) {
        console.warn(`Failed to load preset ${file}:`, e);
      }
    }
  } catch (e) {
    console.warn('Failed to load presets:', e);
  }
  return presets;
};

function statePresetEntryToSavedPreset(
  entry: PresetEntry,
  versionSelection: 'current' | 'highest' = 'current',
): SavedPreset | null {
  const version = versionSelection === 'highest'
    ? entry.versions.reduce<typeof entry.versions[number] | null>((highest, candidate) => {
        if (!highest || candidate.v > highest.v) return candidate;
        return highest;
      }, null)
    : (entry.versions.find(v => v.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1]);
  if (!version) return null;

  const versionData = getVersionData(entry, version.v);
  if (!versionData) return null;

  return migratePreset({
    name: entry.name,
    timestamp: new Date(version.timestamp).toISOString(),
    state: versionData as unknown as SliderState,
    ...(extractPresetVersionMetadata(version) ?? {}),
  });
}

async function loadCapacitorLocalStatePresets(): Promise<SavedPreset[]> {
  const { LocalStoragePresetStore } = await import('./presets');
  const store = new LocalStoragePresetStore();
  const summaries = await store.list('state', CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  const entries = await Promise.all(
    summaries
      .filter((summary) => summary.author !== 'factory' && summary.library !== 'stock')
      .map((summary) => store.load('state', summary.name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE)),
  );

  return entries
    .map((entry) => (entry ? statePresetEntryToSavedPreset(entry) : null))
    .filter((preset): preset is SavedPreset => !!preset)
    .sort((left, right) => {
      const timeDiff = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return left.name.localeCompare(right.name);
    });
}

async function saveCapacitorLocalStatePreset(preset: SavedPreset): Promise<void> {
  const { LocalStoragePresetStore } = await import('./presets');
  const store = new LocalStoragePresetStore();
  const existing = await store.load('state', preset.name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  const parsedTimestamp = Date.parse(preset.timestamp);
  const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  const migratedPreset = migratePreset(preset);
  const versionMetadata = buildPresetVersionMetadata(migratedPreset);
  const optimizedState = extractOptimizedStatePresetData(migratedPreset.state);

  if (existing && existing.author !== 'factory' && existing.library !== 'stock') {
    const nextVersion = Math.max(...existing.versions.map((version) => version.v), 0) + 1;
    existing.versions.push({
      v: nextVersion,
      note: 'Saved from Capacitor shell',
      timestamp,
      data: optimizedState,
      ...versionMetadata,
    });
    existing.currentVersion = nextVersion;
    existing.updatedAt = timestamp;
    await store.save(existing);
    return;
  }

  await store.save({
    id: existing?.id,
    type: 'state',
    scope: CAPACITOR_LOCAL_STATE_PRESET_SCOPE,
    name: preset.name,
    author: 'user',
    library: 'user',
    visibility: existing?.visibility ?? 'private',
    creator: existing?.creator,
    description: existing?.description,
    familyId: existing?.familyId,
    familyName: existing?.familyName ?? preset.name,
    variantId: existing?.variantId,
    variantName: existing?.variantName ?? preset.name,
    variantRank: existing?.variantRank,
    tags: existing?.tags ?? [],
    versions: [{
      v: 1,
      note: 'Saved from Capacitor shell',
      timestamp,
      data: optimizedState,
      ...versionMetadata,
    }],
    currentVersion: 1,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

async function loadBundledPresetByName(name: string): Promise<SavedPreset | null> {
  const presets = await loadPresetsFromFolder();
  return presets.find((preset) => preset.name === name) ?? null;
}

async function deleteCapacitorLocalStatePreset(name: string): Promise<void> {
  const { LocalStoragePresetStore } = await import('./presets');
  const store = new LocalStoragePresetStore();
  await store.delete('state', name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
}

// Save preset to file using File System Access API
const savePresetToFile = async (preset: SavedPreset): Promise<boolean> => {
  try {
    // Check if File System Access API is available
    if ('showSaveFilePicker' in window) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `${preset.name.replace(/[^a-z0-9]/gi, '_')}.json`,
        startIn: 'downloads',
        types: [{
          description: 'JSON Preset',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(preset, null, 2));
      await writable.close();
      return true;
    } else {
      // Fallback to download
      const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${preset.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      console.error('Failed to save preset:', e);
    }
    return false;
  }
};

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
  shareButton: {
    color: 'rgba(255,255,255,0.7)',
  } as React.CSSProperties,
  presetButton: {
    color: 'rgba(255,255,255,0.7)',
  } as React.CSSProperties,
  presetListContainer: {
    background: 'rgba(15, 25, 40, 0.95)',
    borderRadius: '12px',
    padding: '15px',
    marginBottom: '20px',
    border: '1px solid rgba(100, 150, 200, 0.3)',
    maxHeight: '300px',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    maxWidth: '100%',
  } as React.CSSProperties,
  presetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  } as React.CSSProperties,
  loadPresetBtn: {
    padding: '5px 12px',
    fontSize: '0.85rem',
    background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
    color: '#fff',
  } as React.CSSProperties,
  deletePresetBtn: {
    padding: '5px 10px',
    fontSize: '0.85rem',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    color: '#fff',
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
    background: 'rgba(15, 25, 40, 0.6)',
    borderRadius: '12px',
    marginBottom: '16px',
    border: '1px solid rgba(100, 150, 200, 0.2)',
  } as React.CSSProperties,
  tab: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#666',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '60px',
  } as React.CSSProperties,
  tabActive: {
    background: 'rgba(168, 85, 247, 0.2)',
    color: '#a855f7',
    border: '1px solid rgba(168, 85, 247, 0.4)',
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

type AdvancedTab = 'global' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'routing' | 'sliderLab';

const ADVANCED_TAB_SHORTCUTS: Record<string, AdvancedTab> = {
  '1': 'global',
  '2': 'synth',
  '3': 'drums',
  '4': 'earth',
  '5': 'granular',
  '6': 'delay',
  '7': 'reverb',
  '8': 'routing',
  '9': 'sliderLab',
};

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

// Logarithmic scaling helpers for frequency sliders
function linearToLog(value: number, min: number, max: number): number {
  // Convert linear slider position (0-1) to logarithmic frequency
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return Math.exp(minLog + value * (maxLog - minLog));
}

function logToLinear(value: number, min: number, max: number): number {
  // Convert logarithmic frequency to linear slider position (0-1)
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return (Math.log(value) - minLog) / (maxLog - minLog);
}

// Slider component - now a simple component, DualSlider handles dual mode
interface SliderProps {
  label: string;
  value: number;
  paramKey: keyof SliderState;
  ghostValue?: number;
  format?: (value: number) => string;
  unit?: string;
  logarithmic?: boolean;  // Use logarithmic scaling (for frequency params)
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
  'waterChannelsMorph', 'waterChannelsSpeed',
  'insectsDensity', 'insectsTemperature', 'insectsDistance', 'insectsProximity',
  'insectsAntiphony', 'insectsClickRate', 'insectsMotion',
  'insects2Density', 'insects2Temperature', 'insects2Distance', 'insects2Proximity',
  'insects2Antiphony', 'insects2ClickRate', 'insects2Motion',
]);

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
  return WALK_ONLY_DUAL_KEYS.has(key) && mode === 'sampleHold' ? 'walk' : mode;
}

const Slider: React.FC<SliderProps> = ({ 
  label, 
  value, 
  paramKey,
  ghostValue,
  format,
  unit,
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
  const announceHelp = () => announceSlider(String(paramKey), { label, page: helpPage });

  // If dual mode props are provided, use shared DualSlider
  if (onCycleMode && onDualRangeChange) {
    const info = getParamInfo(paramKey);
    if (!info) return null;
    return (
      <DualSlider<keyof SliderState>
        label={label}
        value={value}
        paramKey={paramKey}
        paramInfo={info}
        quantizeFn={quantize}
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
  const info = getParamInfo(paramKey);
  if (!info) return null;

  const valueToPercent = (nextValue: number) => {
    if (logarithmic) {
      return logToLinear(Math.max(info.min, Math.min(info.max, nextValue)), info.min, info.max) * 100;
    }
    return ((nextValue - info.min) / Math.max(1e-9, info.max - info.min)) * 100;
  };

  const percentToValue = (percent: number) => {
    const normalized = Math.max(0, Math.min(100, percent)) / 100;
    const raw = logarithmic
      ? linearToLog(normalized, info.min, info.max)
      : info.min + normalized * (info.max - info.min);
    return quantize(paramKey, raw);
  };

  const formatDisplayValue = (nextValue: number) =>
    format ? format(nextValue) : info.step < 1 ? nextValue.toFixed(2) : String(Math.round(nextValue));
  const displayValue = formatDisplayValue(value);
  const valuePercent = valueToPercent(value);
  const ghostPercent = ghostValue == null || !Number.isFinite(ghostValue)
    ? null
    : valueToPercent(ghostValue);

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
      onValueChange={(nextPercent) => {
        if (disabled) return;
        onChange(paramKey, percentToValue(nextPercent));
      }}
    />
  );
};

const HelpButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { helpKey: string }> = ({
  helpKey,
  onMouseEnter,
  onPointerDown,
  onFocus,
  ...props
}) => {
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
    <div
      className="app-slider-group"
      style={styles.sliderGroup}
      onMouseEnter={onMouseEnter}
      onPointerDown={onPointerDown}
    >
      <div className="app-slider-label" style={styles.sliderLabel}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        onFocus={onFocus}
        className="app-select"
        style={{ ...styles.select, maxWidth: '100%' }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// CollapsiblePanel imported from ./ui/CollapsiblePanel

type RecorderTapSession = {
  trackId: RecordTrackId;
  sourceNode: AudioNode;
  tapNode: AudioWorkletNode;
  sinkNode: GainNode;
  flushPromise: Promise<void>;
  resolveFlush: () => void;
  handleMessage: (event: MessageEvent<unknown>) => void;
};

type RecorderWorkerFinalizedMessage = {
  type: 'finalized';
  files: Array<{
    trackId: RecordTrackId;
    totalFrames: number;
    blob: Blob;
  }>;
};

const createEmptyRecorderTapSessions = (): Record<RecordTrackId, RecorderTapSession | null> => ({
  mix: null,
  ...Object.fromEntries(STEM_RECORD_TRACK_IDS.map((trackId) => [trackId, null])) as Record<StemRecordTrackId, null>,
});

// Main App

const App: React.FC = () => {
  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  const [splashOpacity, setSplashOpacity] = useState(0);
  
  // Splash gradient colors - procedurally generated from app's color palette
  const [splashGradient] = useState(() => {
    // App color palette (from SnowflakeUI prongs):
    // #E8DCC4 warm cream, #C4724E muted orange, #7B9A6D sage green
    // #D4A520 mustard gold, #8B5CF6 purple, #5A7B8A slate blue
    // #3C7181 teal, #C1930A gold accent
    const palettes = [
      { baseHue: 25, name: 'orange' },   // Muted orange (#C4724E)
      { baseHue: 95, name: 'sage' },     // Sage green (#7B9A6D)  
      { baseHue: 45, name: 'gold' },     // Mustard gold (#D4A520)
      { baseHue: 265, name: 'purple' },  // Purple (#8B5CF6)
      { baseHue: 200, name: 'slate' },   // Slate blue (#5A7B8A)
      { baseHue: 190, name: 'teal' },    // Teal (#3C7181)
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
    height: typeof window !== 'undefined' ? window.innerHeight : 600 
  });
  
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize cloud preset store if Supabase is configured
  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    if (isCapacitorNativeShell()) {
      markCloudPresetStoreReady();
      return;
    }

    let cancelled = false;

    // Use anonymous auth so RLS policies work (user_id is always set).
    // Supabase project must have "Allow anonymous sign-ins" enabled.
    void (async () => {
      try {
        const { getSupabase } = await import('./cloud/supabase');
        const {
          LocalStoragePresetStore,
          SupabasePresetStore,
          HybridPresetStore,
          setPresetStore,
        } = await import('./presets');
        if (cancelled) {
          markCloudPresetStoreReady();
          return;
        }

        const supabaseClient = getSupabase();
        if (!supabaseClient) {
          markCloudPresetStoreReady();
          return;
        }

        const local = new LocalStoragePresetStore();
        const cloud = new SupabasePresetStore(supabaseClient);
        cloudPresetStoreRef.current = cloud;

        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session?.user) {
            cloud.setUserId(session.user.id, session.user.is_anonymous ?? false);
          } else {
            const { data, error } = await supabaseClient.auth.signInAnonymously();
            if (error) {
              console.warn('Anonymous auth failed:', error.message);
            } else if (data.user) {
              cloud.setUserId(data.user.id, true);
            }
          }
        } catch (e) {
          console.warn('Auth init failed:', e);
        }

        if (cancelled) {
          markCloudPresetStoreReady();
          return;
        }

        const hybrid = new HybridPresetStore(local, cloud);
        setPresetStore(hybrid);
        markCloudPresetStoreReady();
        console.log('Cloud preset store initialized');

        try {
          const autoStartEntry = await cloud.load('state', DEFAULT_AUTO_START_PRESET_NAME, 'global');
          if (cancelled) return;

          autoStartPresetRef.current = autoStartEntry
            ? statePresetEntryToSavedPreset(autoStartEntry, 'highest')
            : null;
          if (autoStartPresetRef.current) {
            autoStartPresetSourceRef.current = 'cloud';
            console.log(`[App] Prefetched latest cloud auto-start preset: ${autoStartEntry!.name}`);
          }
        } catch (e) {
          console.warn('Failed to preload cloud auto-start preset:', e);
        }
      } catch (e) {
        markCloudPresetStoreReady();
        console.warn('Cloud preset store initialization failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      markCloudPresetStoreReady();
    };
  }, []);

  useEffect(() => {
    if (!CLOUD_ENABLED || typeof window === 'undefined') return;

    const target = window as typeof window & {
      kesshoPresetV2Migration?: {
        run: (options?: unknown) => Promise<unknown>;
        optimizeStringWaves: (options?: unknown) => Promise<unknown>;
        verify: () => Promise<unknown>;
      };
    };

    target.kesshoPresetV2Migration = {
      run: async (options?: unknown) => {
        const { runPresetV2Migration } = await import('./presets');
        const report = await runPresetV2Migration(options as never);
        console.info(`[Preset V2 Migration] ${report.dryRun ? 'Dry run' : 'Write run'} complete.`);
        console.table(report.phases.map((phase) => ({
          phase: phase.phase,
          candidates: phase.candidates,
          [report.dryRun ? 'wouldWrite' : 'inserted']: report.dryRun ? phase.wouldWrite : phase.inserted,
          skippedExisting: phase.skippedExisting,
          skippedInvalid: phase.skippedInvalid,
          errors: phase.errors.length,
        })));
        if (report.phases.some((phase) => phase.errors.length > 0)) {
          console.warn('[Preset V2 Migration] Phase errors:', report.phases);
        }
        return report;
      },
      optimizeStringWaves: async (options?: unknown) => {
        const { optimizeStringWavesV2 } = await import('./presets');
        const report = await optimizeStringWavesV2(options as never);
        console.info(`[Preset V2 Migration] String Waves optimization ${report.dryRun ? 'dry run' : 'write run'} complete.`);
        console.table(report.childPresets);
        console.info('[Preset V2 Migration] String Waves latest ref count:', report.latestRefCount);
        return report;
      },
      verify: async () => {
        const { verifyPresetV2Migration } = await import('./presets');
        return verifyPresetV2Migration();
      },
    };

    return () => {
      delete target.kesshoPresetV2Migration;
    };
  }, []);

  // Seed factory presets into PresetStore on first launch
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (SHARED_PRESET_TEST_MODE && CLOUD_ENABLED) {
        await cloudPresetStoreReadyPromiseRef.current;
      }
      if (cancelled) return;

      const { loadFactoryPresets } = await import('./presets');
      if (cancelled) return;

      const n = await loadFactoryPresets();
      if (!cancelled && n > 0) {
        console.log(`Seeded ${n} factory presets`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingArmed, setIsRecordingArmed] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  // Format selection - can record both simultaneously
  const [recordFormats, setRecordFormats] = useState({ webm: true, wav: false });
  
  // Playback timer state
  const [playbackTimerEnabled, setPlaybackTimerEnabled] = useState(false);
  const [playbackTimerMinutes, setPlaybackTimerMinutes] = useState(30); // Default 30 minutes
  const [playbackTimerRemaining, setPlaybackTimerRemaining] = useState<number | null>(null);
  const playbackTimerTargetTimeRef = useRef<number | null>(null);
  
  // Track if user has loaded a preset (for auto-loading default on first play)
  const hasLoadedPresetRef = useRef(false);
  // Track if user has interacted with any UI element (sliders, buttons, etc.)
  const hasUserInteractedRef = useRef(false);
  const autoStartPresetRef = useRef<SavedPreset | null>(null);
  const autoStartPresetSourceRef = useRef<'cloud' | 'device-local' | 'bundled' | null>(null);
  const cloudPresetStoreRef = useRef<IPresetStore | null>(null);
  const cloudAutoStartStoreInitPromiseRef = useRef<Promise<IPresetStore | null> | null>(null);
  const cloudPresetStoreReadyRef = useRef(!CLOUD_ENABLED);
  const cloudPresetStoreReadyResolveRef = useRef<(() => void) | null>(null);
  const cloudPresetStoreReadyPromiseRef = useRef<Promise<void> | null>(null);
  if (cloudPresetStoreReadyPromiseRef.current === null) {
    cloudPresetStoreReadyPromiseRef.current = cloudPresetStoreReadyRef.current
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          cloudPresetStoreReadyResolveRef.current = resolve;
        });
  }
  const markCloudPresetStoreReady = () => {
    if (cloudPresetStoreReadyRef.current) return;
    cloudPresetStoreReadyRef.current = true;
    cloudPresetStoreReadyResolveRef.current?.();
    cloudPresetStoreReadyResolveRef.current = null;
  };
  type StemName = StemRecordTrackId;
  // Routing-level stem recording options.
  const [recordStems, setRecordStems] = useState<Record<StemName, boolean>>(STEM_RECORD_DEFAULTS);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingExportWorkerRef = useRef<Worker | null>(null);
  const recorderWorkletContextRef = useRef<AudioContext | null>(null);
  const recorderTapSessionsRef = useRef<Record<RecordTrackId, RecorderTapSession | null>>(createEmptyRecorderTapSessions());

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
  const [state, setState] = useState<SliderState>(() => {
    const urlState = decodeStateFromUrl(window.location.search);
    return normalizePresetForWeb(urlState || DEFAULT_STATE);
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const [engineState, setEngineState] = useState<EngineState>({
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
  const [nativeBackgroundAudioMode, setNativeBackgroundAudioMode] = useState(false);
  const [nativePlaybackState, setNativePlaybackState] = useState(false);
  const nativeRemoteCommandCleanupRef = useRef<(() => Promise<void>) | null>(null);
  
  // Saved presets list - start empty, load from folder on mount
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [showPresetList, setShowPresetList] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(true);

  // L4 State preset name tracking
  const [statePresetName, setStatePresetName] = useState('');

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
  const [morphLoadTarget, setMorphLoadTarget] = useState<'a' | 'b' | null>(null); // For advanced UI load dialog
  const [morphCountdown, setMorphCountdown] = useState<{ phase: string; phrasesLeft: number } | null>(null);
  
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
  
  // Upload slot choice dialog
  const [uploadSlotDialogOpen, setUploadSlotDialogOpen] = useState(false);
  const [pendingUploadPreset, setPendingUploadPreset] = useState<SavedPreset | null>(null);
  
  // Morph CoF visualization state
  const [morphCoFViz, setMorphCoFViz] = useState<{
    isMorphing: boolean;
    startRoot: number;      // Original starting root (captured at morph start)
    effectiveRoot: number;
    targetRoot: number;
    cofStep: number;
    totalSteps: number;
  } | null>(null);
  
  // Refs for phrase settings - used in animation loop to avoid restarting effect
  const morphPlayPhrasesRef = useRef(morphPlayPhrases);
  const morphTransitionPhrasesRef = useRef(morphTransitionPhrases);
  useEffect(() => { morphPlayPhrasesRef.current = morphPlayPhrases; }, [morphPlayPhrases]);
  useEffect(() => { morphTransitionPhrasesRef.current = morphTransitionPhrases; }, [morphTransitionPhrases]);
  
  // UI mode: 'snowflake', 'advanced', or 'journey'
  const [uiMode, setUiMode] = useState<'snowflake' | 'advanced' | 'journey'>('snowflake');

  // Snowflake welcome state: show decorative 75% arms until user interacts
  const [snowflakeActivated, setSnowflakeActivated] = useState(false);
  // Separate display state for welcome mode — user can drag arms visually without affecting real state
  const [welcomeDisplayState, setWelcomeDisplayState] = useState<SliderState>(SNOWFLAKE_WELCOME_STATE);
  const handleWelcomeSliderChange = useCallback((key: keyof SliderState, value: number) => {
    setWelcomeDisplayState(prev => ({ ...prev, [key]: value }));
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
    (presetName) => journeyLoadPresetRef.current(presetName)
  );

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Mobile-responsive style overrides ──
  const m = useMemo(() => {
    if (!isMobile) return null;
    return {
      container: { padding: '4px', maxWidth: '100%', overflowX: 'hidden' as const } as React.CSSProperties,
      controls: { gap: '4px', marginBottom: '10px', paddingTop: '6px' } as React.CSSProperties,
      grid: { gridTemplateColumns: '1fr', gap: '8px', marginBottom: '12px' } as React.CSSProperties,
      panel: { padding: '10px', borderRadius: '8px', maxWidth: '100%', overflow: 'hidden' as const } as React.CSSProperties,
      panelTitle: { fontSize: '0.9rem', marginBottom: '8px' } as React.CSSProperties,
      sliderGroup: { marginBottom: '8px', maxWidth: '100%', overflow: 'hidden' as const } as React.CSSProperties,
      sliderLabel: { fontSize: '0.75rem', marginBottom: '3px', gap: '4px' } as React.CSSProperties,
      select: { fontSize: '0.78rem', padding: '6px 8px', minHeight: '36px', maxWidth: '100%' } as React.CSSProperties,
      tabBar: { padding: '4px 6px', gap: '2px', borderRadius: '8px', marginBottom: '8px', flexWrap: 'wrap' as const } as React.CSSProperties,
      tab: { padding: '6px 4px', minWidth: '40px', fontSize: '0.58rem', gap: '2px' } as React.CSSProperties,
      tabIcon: { fontSize: '0.9rem' } as React.CSSProperties,
      iconButton: { width: '36px', height: '36px', fontSize: '1.2rem', padding: '4px' } as React.CSSProperties,
      debugPanel: { padding: '10px', fontSize: '0.75rem', wordBreak: 'break-all' as const, overflow: 'hidden' as const } as React.CSSProperties,
      presetList: { padding: '10px', maxHeight: '200px' } as React.CSSProperties,
    };
  }, [isMobile]);

  // Collapsible panel state for mobile (track which panels are expanded)
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const togglePanel = useCallback((panelId: string) => {
    setExpandedPanels(prev => {
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

  const openAdvancedTab = useCallback((tab: AdvancedTab) => {
    if (uiMode === 'snowflake' && !snowflakeActivated) {
      setSnowflakeActivated(true);
    }
    void preloadAudioEngine();
    setActiveTab(tab);
    setUiMode('advanced');
  }, [uiMode, snowflakeActivated]);

  useEffect(() => {
    const handleAdvancedTabShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableShortcutTarget(event.target)) return;

      const nextTab = ADVANCED_TAB_SHORTCUTS[event.key];
      if (!nextTab) return;

      event.preventDefault();
      openAdvancedTab(nextTab);
    };

    window.addEventListener('keydown', handleAdvancedTabShortcut);
    return () => window.removeEventListener('keydown', handleAdvancedTabShortcut);
  }, [openAdvancedTab]);

  // Unified slider mode state: key → SliderMode ('single' | 'walk' | 'sampleHold')
  // Absent key means 'single'. dualSliderRanges stores ranges for walk/sampleHold modes.
  const [sliderModes, setSliderModes] = useState<Record<string, SliderMode>>({});
  const [dualSliderRanges, setDualSliderRanges] = useState<DualSliderState>({});
  const usesCapacitorLocalPresetLibrary = isCapacitorNativeShell();
  const playbackIsRunning = nativeBackgroundAudioMode ? nativePlaybackState : engineState.isRunning;

  const ensureCloudAutoStartPresetStore = useCallback(async (): Promise<IPresetStore | null> => {
    if (!CLOUD_ENABLED) return null;
    if (cloudPresetStoreRef.current) return cloudPresetStoreRef.current;
    if (!cloudAutoStartStoreInitPromiseRef.current) {
      cloudAutoStartStoreInitPromiseRef.current = (async () => {
        try {
          const { getSupabase } = await import('./cloud/supabase');
          const { SupabasePresetStore } = await import('./presets');
          const supabaseClient = getSupabase();
          if (!supabaseClient) return null;

          const cloud = new SupabasePresetStore(supabaseClient);

          try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user) {
              cloud.setUserId(session.user.id, session.user.is_anonymous ?? false);
            } else {
              const { data, error } = await supabaseClient.auth.signInAnonymously();
              if (error) {
                console.warn('Anonymous auth failed for cloud auto-start preset:', error.message);
              } else if (data.user) {
                cloud.setUserId(data.user.id, true);
              }
            }
          } catch (error) {
            console.warn('Cloud auto-start auth init failed:', error);
          }

          cloudPresetStoreRef.current = cloud;
          return cloud;
        } catch (error) {
          console.warn('Cloud auto-start preset store initialization failed:', error);
          return null;
        }
      })();
    }

    return cloudAutoStartStoreInitPromiseRef.current;
  }, []);

  const loadCloudAutoStartPreset = useCallback(async (): Promise<SavedPreset | null> => {
    if (!CLOUD_ENABLED) return null;

    const store = await ensureCloudAutoStartPresetStore();
    if (!store) return null;

    try {
      const autoStartEntry = await store.load('state', DEFAULT_AUTO_START_PRESET_NAME, 'global');
      const preset = autoStartEntry
        ? statePresetEntryToSavedPreset(autoStartEntry, 'highest')
        : null;

      if (preset) {
        autoStartPresetRef.current = preset;
        autoStartPresetSourceRef.current = 'cloud';
        console.log(`[App] Loaded latest cloud auto-start preset: ${autoStartEntry!.name}`);
      }

      return preset;
    } catch (error) {
      console.warn('Failed to load latest cloud auto-start preset:', error);
      return null;
    }
  }, [ensureCloudAutoStartPresetStore]);

  const resolveDefaultAutoStartPreset = useCallback(async (): Promise<{
    preset: SavedPreset | null;
    source: 'cloud' | 'device-local' | 'bundled' | null;
  }> => {
    if (autoStartPresetRef.current) {
      return {
        preset: autoStartPresetRef.current,
        source: autoStartPresetSourceRef.current,
      };
    }

    if (CLOUD_ENABLED) {
      const timeoutMs = 1500;
      const timedCloudPreset = await Promise.race<SavedPreset | null>([
        loadCloudAutoStartPreset(),
        new Promise<SavedPreset | null>((resolve) => {
          window.setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      if (timedCloudPreset) {
        return { preset: timedCloudPreset, source: 'cloud' };
      }
    }

    const deviceLocalPreset = savedPresets.find((preset) => preset.name === DEFAULT_AUTO_START_PRESET_NAME) ?? null;
    if (deviceLocalPreset) {
      autoStartPresetRef.current = deviceLocalPreset;
      autoStartPresetSourceRef.current = usesCapacitorLocalPresetLibrary ? 'device-local' : 'bundled';
      return {
        preset: deviceLocalPreset,
        source: autoStartPresetSourceRef.current,
      };
    }

    const bundledPreset = await loadBundledPresetByName(DEFAULT_AUTO_START_PRESET_NAME);
    if (bundledPreset) {
      autoStartPresetRef.current = bundledPreset;
      autoStartPresetSourceRef.current = 'bundled';
      return {
        preset: bundledPreset,
        source: 'bundled',
      };
    }

    return { preset: null, source: null };
  }, [loadCloudAutoStartPreset, savedPresets, usesCapacitorLocalPresetLibrary]);

  useEffect(() => {
    if (!usesCapacitorLocalPresetLibrary || !CLOUD_ENABLED || autoStartPresetRef.current) return;
    void loadCloudAutoStartPreset();
  }, [loadCloudAutoStartPreset, usesCapacitorLocalPresetLibrary]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const setupNativeMode = () => {
      if (cancelled) return;
      if (!shouldUseCapacitorNativeAudioSpike() || !isCapacitorBackgroundAudioAvailable()) {
        retryTimer = window.setTimeout(setupNativeMode, 250);
        return;
      }

      setNativeBackgroundAudioMode(true);

      void getCapacitorBackgroundAudioStatus().then((status) => {
        if (!cancelled && status) {
          setNativePlaybackState(!!status.isPlaying);
        }
      });

      void addCapacitorRemoteCommandListener((command) => {
        if (cancelled) return;
        if (command === 'play') {
          setNativePlaybackState(true);
        } else if (command === 'pause') {
          setNativePlaybackState(false);
        } else {
          setNativePlaybackState((prev) => !prev);
        }
      }).then((cleanup) => {
        if (cancelled) {
          void cleanup?.();
          return;
        }
        nativeRemoteCommandCleanupRef.current = cleanup;
      });
    };

    setupNativeMode();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      const cleanup = nativeRemoteCommandCleanupRef.current;
      nativeRemoteCommandCleanupRef.current = null;
      if (cleanup) void cleanup();
    };
  }, []);

  useEffect(() => {
    if (!nativeBackgroundAudioMode) return;
    void setCapacitorNowPlaying({
      title: statePresetName || 'Generative Ambient',
      artist: 'Kessho',
      album: 'Kessho Native',
      isLiveStream: true,
      isPlaying: nativePlaybackState,
      elapsedTime: 0,
    });
  }, [nativeBackgroundAudioMode, nativePlaybackState, statePresetName]);

  const applyDualRangesFromPreset = useCallback((
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => {
    if (dualRanges && Object.keys(dualRanges).length > 0) {
      const newSliderModes: Record<string, SliderMode> = {};
      const newDualRanges: DualSliderState = {};
      const newWalkPositions: Record<string, number> = {};

      Object.entries(dualRanges).forEach(([key, range]) => {
        const paramKey = key as keyof SliderState;
        // Use saved mode if available, else default: walk for generic, sampleHold for expression/delay/morph
        newSliderModes[key] = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
        newDualRanges[paramKey] = range;
        if (newSliderModes[key] === 'walk') {
          newWalkPositions[key] = 0.5;
        }
      });

      setSliderModes(newSliderModes);
      setDualSliderRanges(newDualRanges);
      replaceRuntimeWalkPositions(newWalkPositions);
    } else {
      setSliderModes({});
      setDualSliderRanges({});
      replaceRuntimeWalkPositions({});
    }
  }, []);

  const applyScopedDualRangesFromPreset = useCallback((
    relevantKeys: string[],
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => {
    const relevantKeySet = new Set(relevantKeys);
    const nextWalkPositions: Record<string, number> = {};

    setSliderModes(prev => {
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

    setDualSliderRanges(prev => {
      const next: Record<string, { min: number; max: number } | undefined> = { ...prev };
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

    removeRuntimeWalkPositions(relevantKeySet);
    mergeRuntimeWalkPositions(nextWalkPositions);
  }, []);
  const shFlashTimerRef = useRef<number | null>(null);

  const [drumEditingVoice, setDrumEditingVoice] = useState<string | null>(null);
  const drumViewModeRef = useRef<'simple' | 'detail' | 'overview'>('detail');
  const drumStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const drumSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const drumEvolveConfigsRef = useRef<EvolveConfig[] | undefined>(undefined);
  const drumSeqSimpleStateRef = useRef<SeqSimpleState | undefined>(undefined);

  // Evolved step overrides pushed from audio engine for visual sync
  const [drumEvolvedOverrides, setDrumEvolvedOverrides] = useState<{ laneIndex: number; version: number; data: Partial<StepOverrides> } | undefined>(undefined);
  const drumEvolvedVersionRef = useRef(0);

  // ── Lead/Synth Euclidean sequencer state ──
  const synthViewModeRef = useRef<'simple' | 'detail' | 'overview'>('simple');
  const synthStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const synthSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const synthPitchSettingsRef = useRef<PitchSettings[] | undefined>(undefined);
  const synthPitchBindingModesRef = useRef<PitchBindingMode[] | undefined>(undefined);
  const synthKeyboardUiStateRef = useRef<SynthKeyboardUiState | undefined>(undefined);
  const synthEvolveConfigsRef = useRef<EvolveConfig[] | undefined>(undefined);
  // Evolved step overrides pushed from audio engine for visual sync
  const [synthEvolvedOverrides, setSynthEvolvedOverrides] = useState<{ laneIndex: number; version: number; data: Partial<StepOverrides> } | undefined>(undefined);
  const synthEvolvedVersionRef = useRef(0);

  const [drumPresetVersion, setDrumPresetVersion] = useState(0);
  const [synthPresetVersion, setSynthPresetVersion] = useState(0);

  const createEmptyStepOverrides = useCallback((): StepOverrides => ({
    triggerToggles: Array.from({ length: 4 }, () => new Map<number, boolean>()),
    probability: Array.from({ length: 4 }, () => null),
    ratchet: Array.from({ length: 4 }, () => null),
    trigCondition: Array.from({ length: 4 }, () => null),
    expression: Array.from({ length: 4 }, () => null),
    pitch: Array.from({ length: 4 }, () => null),
    morph: Array.from({ length: 4 }, () => null),
    distance: Array.from({ length: 4 }, () => null),
    slice: Array.from({ length: 4 }, () => null),
    reverse: Array.from({ length: 4 }, () => null),
    expressionDirection: Array.from({ length: 4 }, () => null),
    morphDirection: Array.from({ length: 4 }, () => null),
    distanceDirection: Array.from({ length: 4 }, () => null),
    pitchDirection: Array.from({ length: 4 }, () => null),
    sliceDirection: Array.from({ length: 4 }, () => null),
    reverseDirection: Array.from({ length: 4 }, () => null),
    expressionRanges: Array.from({ length: 4 }, () => null),
    morphRanges: Array.from({ length: 4 }, () => null),
    distanceRanges: Array.from({ length: 4 }, () => null),
  }), []);

  const createDisabledSubLaneFlags = useCallback((): Record<SubLaneKind, boolean>[] => (
    Array.from({ length: 4 }, () => ({
      pitch: false,
      expression: false,
      morph: false,
      distance: false,
      slice: false,
      reverse: false,
    }))
  ), []);

  const mapSubLaneStatesToEnabledFlags = useCallback((
    states: Record<SubLaneKind, SubLaneState>[] | undefined,
  ): Record<SubLaneKind, boolean>[] => {
    if (!states) return createDisabledSubLaneFlags();
    return Array.from({ length: 4 }, (_, index) => ({
      pitch: states[index]?.pitch.enabled === true,
      expression: states[index]?.expression.enabled === true,
      morph: states[index]?.morph.enabled === true,
      distance: states[index]?.distance.enabled === true,
      slice: states[index]?.slice.enabled === true,
      reverse: states[index]?.reverse.enabled === true,
    }));
  }, [createDisabledSubLaneFlags]);

  const createDefaultSynthPitchSettings = useCallback((): PitchSettings[] => (
    Array.from({ length: 4 }, () => ({ mode: 'semitones', root: 60, scale: 'Major' }))
  ), []);

  // Helper: restore evolve configs from a loaded preset into refs + engine
  const restoreEvolveConfigs = useCallback((preset: SavedPreset) => {
    const defaultEvolve = (): EvolveConfig => ({
      enabled: false, everyBars: 4, evolution: 0.5, writeOffset: 0,
      mutationMode: 'biased', methods: {},
    });
    const defaultConfigs = () => Array.from({ length: 4 }, defaultEvolve);

    const drumConfigs = preset.drumEvolveConfigs ?? defaultConfigs();
    drumEvolveConfigsRef.current = drumConfigs;
    audioEngine.setDrumEuclidEvolveConfigs(drumConfigs);

    const synthConfigs = preset.synthEvolveConfigs ?? defaultConfigs();
    synthEvolveConfigsRef.current = synthConfigs;
    audioEngine.setSynthEuclidEvolveConfigs(synthConfigs);

    // Presets do not persist per-step sequencer edits, so clear any in-memory leftovers.
    drumStepOverridesRef.current = undefined;
    audioEngine.setDrumStepOverrides(createEmptyStepOverrides());
    synthStepOverridesRef.current = undefined;
    audioEngine.setSynthStepOverrides(createEmptyStepOverrides());

    // Restore sub-lane states (backward-compatible: undefined if preset lacks them)
    drumSubLaneStatesRef.current = preset.drumSubLaneStates;
    synthSubLaneStatesRef.current = preset.synthSubLaneStates;
    audioEngine.setDrumSubLaneEnabled(mapSubLaneStatesToEnabledFlags(preset.drumSubLaneStates));
    audioEngine.setSynthSubLaneEnabled(mapSubLaneStatesToEnabledFlags(preset.synthSubLaneStates));

    // Pitch settings are UI-only sequencer metadata; reset them to defaults when a preset loads.
    synthPitchSettingsRef.current = undefined;
    audioEngine.setSynthPitchSettings(createDefaultSynthPitchSettings());

    synthPitchBindingModesRef.current = preset.synthPitchBindingModes;
    audioEngine.setSynthPitchBindingModes(preset.synthPitchBindingModes ?? ['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic']);

    // Bump all version counters so mounted pages re-initialize from refs
    setDrumPresetVersion(v => v + 1);
    setSynthPresetVersion(v => v + 1);
  }, [
    createDefaultSynthPitchSettings,
    createDisabledSubLaneFlags,
    createEmptyStepOverrides,
    mapSubLaneStatesToEnabledFlags,
  ]);

  const getStatePresetSaveMetadata = useCallback(() => buildPresetVersionMetadata({
    dualRanges: dualSliderRanges as Record<string, { min: number; max: number }>,
    sliderModes,
    drumEvolveConfigs: drumEvolveConfigsRef.current,
    synthEvolveConfigs: synthEvolveConfigsRef.current,
    drumSubLaneStates: drumSubLaneStatesRef.current,
    synthSubLaneStates: synthSubLaneStatesRef.current,
    synthPitchBindingModes: synthPitchBindingModesRef.current,
  }), [dualSliderRanges, sliderModes]);

  // Drum morph keys - these use per-trigger randomization, not random walk
  const drumMorphKeys = useMemo(() => new Set<keyof SliderState>([
    'drumSubMorph', 'drumKickMorph', 'drumClickMorph',
    'drumBeepHiMorph', 'drumBeepLoMorph', 'drumNoiseMorph', 'drumMembraneMorph'
  ]), []);

  // Map drum morph keys to voice names for engine API
  const drumMorphKeyToVoice = useMemo<Record<string, DrumPresetVoice>>(() => ({
    drumSubMorph: 'sub',
    drumKickMorph: 'kick',
    drumClickMorph: 'click',
    drumBeepHiMorph: 'beepHi',
    drumBeepLoMorph: 'beepLo',
    drumNoiseMorph: 'noise',
    drumMembraneMorph: 'membrane'
  }), []);

  // Drum S&H param keys — all numeric per-voice drum params except morph/preset selectors.
  const drumSHParamKeys = useMemo(() => new Set(
    Object.keys(state).filter((key) => {
      if (!/^drum(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)/.test(key)) return false;
      if (key.includes('Morph') || key.includes('Preset')) return false;
      return typeof state[key as keyof SliderState] === 'number';
    })
  ), [state]);

  const handleCycleSliderMode = useCallback((key: keyof SliderState) => {
    // Block changes when journey mode is playing
    if (isJourneyPlaying) return;
    
    const keyStr = key as string;
    const isMorphActive = morphPresetA !== null || morphPresetB !== null;
    
    // Check if this is a drum synth param and get its voice/morph key
    let drumVoice: DrumPresetVoice | null = null;
    let drumMorphKey: keyof SliderState | null = null;
    if (keyStr.startsWith('drumSub') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'sub'; drumMorphKey = 'drumSubMorph';
    } else if (keyStr.startsWith('drumKick') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'kick'; drumMorphKey = 'drumKickMorph';
    } else if (keyStr.startsWith('drumClick') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'click'; drumMorphKey = 'drumClickMorph';
    } else if (keyStr.startsWith('drumBeepHi') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'beepHi'; drumMorphKey = 'drumBeepHiMorph';
    } else if (keyStr.startsWith('drumBeepLo') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'beepLo'; drumMorphKey = 'drumBeepLoMorph';
    } else if (keyStr.startsWith('drumNoise') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'noise'; drumMorphKey = 'drumNoiseMorph';
    } else if (keyStr.startsWith('drumMembrane') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'membrane'; drumMorphKey = 'drumMembraneMorph';
    }

    // Cycle: single → walk → sampleHold → single (walk-only keys skip sampleHold)
    const current = sliderModes[keyStr] ?? 'single';
    const nextMode: SliderMode = current === 'single' ? 'walk'
      : current === 'walk' ? (WALK_ONLY_DUAL_KEYS.has(keyStr) ? 'single' : 'sampleHold')
      : 'single';

    if (nextMode === 'single') {
      // Collapsing to single preserves the authored value; runtime dots can be stale at mode boundaries.
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        const currentValue = getSliderNumericValue(key, state[key]);
        const fallbackValue = range.min + 0.5 * (range.max - range.min);
        const nextNumericValue = Math.max(range.min, Math.min(range.max, currentValue ?? fallbackValue));
        const quantizedValue = quantize(key, nextNumericValue);
        const nextValue = getStateValueFromSliderNumber(key, quantizedValue);
        setState(s => ({ ...s, [key]: nextValue }));
      }
      // Clean up
      setDualSliderRanges(r => {
        const newRanges = { ...r };
        delete newRanges[key];
        return newRanges;
      });
      removeRuntimeWalkPositions([keyStr]);
      removeRuntimeTriggerPositions([keyStr]);
      setSliderModes(prev => {
        const next = { ...prev };
        delete next[keyStr];
        return next;
      });

      // Update morph preset dualRanges at endpoints (Rule 2)
      if (isMorphActive) {
        if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
          setMorphPresetA(prev => {
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
          setMorphPresetB(prev => {
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
          setDrumMorphDualRangeOverride(drumVoice, keyStr, false, currentVal, undefined, 0);
        } else if (isAtEndpoint1(drumMorphPosition)) {
          setDrumMorphDualRangeOverride(drumVoice, keyStr, false, currentVal, undefined, 1);
        }
      }
    } else {
      // Entering walk or sampleHold
      setSliderModes(prev => ({ ...prev, [keyStr]: nextMode }));

      // If entering walk/sampleHold from single, create a range
      if (current === 'single') {
        const info = getParamInfo(key);
        if (info) {
          const currentVal = getSliderNumericValue(key, state[key]) ?? info.min;
          const rangeSize = (info.max - info.min) * 0.2; // 20% of total range
          const min = Math.max(info.min, currentVal - rangeSize / 2);
          const max = Math.min(info.max, currentVal + rangeSize / 2);
          setDualSliderRanges(r => ({ ...r, [key]: { min, max } }));

          // Initialize random walk for walk mode (not for sampleHold)
          if (nextMode === 'walk') {
            mergeRuntimeWalkPositions({ [keyStr]: 0.5 });
            removeRuntimeTriggerPositions([keyStr]);
          } else {
            removeRuntimeWalkPositions([keyStr]);
            removeRuntimeTriggerPositions([keyStr]);
          }

          // Update morph preset dualRanges at endpoints (Rule 2)
          if (isMorphActive) {
            if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
              setMorphPresetA(prev => prev ? {
                ...prev,
                dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } },
                sliderModes: { ...prev.sliderModes, [keyStr]: nextMode }
              } : null);
            } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
              setMorphPresetB(prev => prev ? {
                ...prev,
                dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } },
                sliderModes: { ...prev.sliderModes, [keyStr]: nextMode }
              } : null);
            }
          }

          // Update drum morph dual range override at endpoints
          if (drumVoice && drumMorphKey) {
            const drumMorphPosition = state[drumMorphKey] as number;
            if (isAtEndpoint0(drumMorphPosition)) {
              setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 0);
            } else if (isAtEndpoint1(drumMorphPosition)) {
              setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 1);
            }
          }
        }
      } else if (current === 'walk' && nextMode === 'sampleHold') {
        // Switching from walk to sampleHold — stop live walk and clear stale trigger dots.
        removeRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);

        // Update morph preset sliderModes at endpoints (range is unchanged)
        if (isMorphActive) {
          if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
            setMorphPresetA(prev => prev ? {
              ...prev,
              sliderModes: { ...prev.sliderModes, [keyStr]: nextMode }
            } : null);
          } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
            setMorphPresetB(prev => prev ? {
              ...prev,
              sliderModes: { ...prev.sliderModes, [keyStr]: nextMode }
            } : null);
          }
        }
      }
    }
  }, [isJourneyPlaying, dualSliderRanges, sliderModes, state, drumMorphKeys, morphPosition, morphPresetA, morphPresetB]);

  // Update dual slider range
  const handleDualRangeChange = useCallback((key: keyof SliderState, min: number, max: number) => {
    // Block changes when journey mode is playing
    if (isJourneyPlaying) return;
    
    setDualSliderRanges(prev => ({ ...prev, [key]: { min, max } }));
    
    const keyStr = key as string;
    
    // Update morph preset dualRanges at endpoints (Rule 2)
    const isMorphActive = morphPresetA !== null || morphPresetB !== null;
    if (isMorphActive) {
      if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
        setMorphPresetA(prev => prev ? {
          ...prev,
          dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } }
        } : null);
      } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
        setMorphPresetB(prev => prev ? {
          ...prev,
          dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } }
        } : null);
      }
    }
    
    // Check if this is a drum synth param and update drum morph override
    let drumVoice: DrumPresetVoice | null = null;
    let drumMorphKey: keyof SliderState | null = null;
    if (keyStr.startsWith('drumSub') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'sub'; drumMorphKey = 'drumSubMorph';
    } else if (keyStr.startsWith('drumKick') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'kick'; drumMorphKey = 'drumKickMorph';
    } else if (keyStr.startsWith('drumClick') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'click'; drumMorphKey = 'drumClickMorph';
    } else if (keyStr.startsWith('drumBeepHi') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'beepHi'; drumMorphKey = 'drumBeepHiMorph';
    } else if (keyStr.startsWith('drumBeepLo') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'beepLo'; drumMorphKey = 'drumBeepLoMorph';
    } else if (keyStr.startsWith('drumNoise') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'noise'; drumMorphKey = 'drumNoiseMorph';
    } else if (keyStr.startsWith('drumMembrane') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'membrane'; drumMorphKey = 'drumMembraneMorph';
    }
    
    // Update drum morph dual range override at endpoints
    if (drumVoice && drumMorphKey) {
      const drumMorphPosition = state[drumMorphKey] as number;
      const currentVal = state[key] as number;
      if (isAtEndpoint0(drumMorphPosition)) {
        setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 0);
      } else if (isAtEndpoint1(drumMorphPosition)) {
        setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 1);
      }
    }
  }, [isJourneyPlaying, morphPosition, morphPresetA, morphPresetB, state]);

  // Update engine morph ranges when dual mode changes for drum morph sliders
  // Only set morphRange for sampleHold (per-trigger random within range).
  // For walk mode, leave range null so engine uses the state value (updated by walk timer).
  useEffect(() => {
    if (!audioEngine.setDrumMorphRange) return;
    drumMorphKeys.forEach(key => {
      const voice = drumMorphKeyToVoice[key];
      if (!voice) return; // Guard against undefined
      const keyStr = key as string;
      if (sliderModes[keyStr] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) {
          audioEngine.setDrumMorphRange(voice, range);
        }
      } else {
        // single or walk → engine uses slider state value directly
        audioEngine.setDrumMorphRange(voice, null);
      }
    });
  }, [sliderModes, dualSliderRanges, drumMorphKeys, drumMorphKeyToVoice]);

  // Update engine S&H ranges for drum non-morph params (distance, etc.)
  // Uses the generic setDrumParamSHRange API — one call per param key.
  useEffect(() => {
    if (!audioEngine.setDrumParamSHRange) return;
    drumSHParamKeys.forEach(key => {
      if (sliderModes[key] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) {
          audioEngine.setDrumParamSHRange(key, range);
        }
      } else {
        audioEngine.setDrumParamSHRange(key, null);
      }
    });
  }, [sliderModes, dualSliderRanges, drumSHParamKeys]);

  // Push non-drum dualSliderRanges to engine for per-trigger sampling (sampleHold only).
  // Walk mode updates state values directly via the walk timer, so the engine reads those.
  useEffect(() => {
    if (audioEngine.setDualRanges) {
      const engineRanges: Partial<Record<string, { min: number; max: number }>> = {};
      Object.entries(dualSliderRanges).forEach(([key, range]) => {
        if (range && !DRUM_MORPH_KEYS.has(key as keyof SliderState) && !drumSHParamKeys.has(key) && sliderModes[key] === 'sampleHold') {
          engineRanges[key] = range;
        }
      });
      audioEngine.setDualRanges(engineRanges);
    }
  }, [dualSliderRanges, sliderModes, drumSHParamKeys]);

  // Engine-owned random-walk runtime: App only mirrors lightweight positions for slider indicators.
  useEffect(() => {
    const walkRanges: Record<string, { min: number; max: number }> = {};
    Object.entries(sliderModes).forEach(([key, mode]) => {
      if (mode !== 'walk') return;
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        walkRanges[key] = range;
      }
    });
    audioEngine.setRuntimeWalkRanges(walkRanges);
  }, [sliderModes, dualSliderRanges]);

  // Keep the runtime walk indicator store live while hidden so walk-mode sliders
  // do not resubscribe to a stale snapshot and visibly jump on tab restore.
  const shouldMirrorRuntimeWalkPositions = uiMode === 'advanced';

  useEffect(() => {
    if (!shouldMirrorRuntimeWalkPositions) {
      audioEngine.setRuntimeWalkPositionsCallback(null);
      return;
    }

    audioEngine.setRuntimeWalkPositionsCallback((positions) => {
      replaceRuntimeWalkPositions(positions);
    });

    return () => {
      audioEngine.setRuntimeWalkPositionsCallback(null);
    };
  }, [shouldMirrorRuntimeWalkPositions]);

  // Load presets from folder on mount
  useEffect(() => {
    let cancelled = false;

    const loadPresets = usesCapacitorLocalPresetLibrary
      ? loadCapacitorLocalStatePresets
      : loadPresetsFromFolder;

    loadPresets().then((presets) => {
      if (cancelled) return;
      setSavedPresets(presets);
      setPresetsLoading(false);
    });

    // Check for cloud preset in URL (?cloud=presetId)
    const urlParams = new URLSearchParams(window.location.search);
    const cloudPresetId = urlParams.get('cloud');
    if (cloudPresetId && CLOUD_ENABLED) {
      void import('./cloud/supabase').then(({ fetchPresetById }) => fetchPresetById(cloudPresetId)).then((preset) => {
        if (cancelled || !preset) return;

        if (preset) {
          const rawData = preset.data as unknown;
          const wrappedData =
            rawData !== null &&
            typeof rawData === 'object' &&
            Object.prototype.hasOwnProperty.call(rawData, 'state')
              ? (rawData as Partial<SavedPreset>)
              : null;

          const presetState = wrappedData?.state && typeof wrappedData.state === 'object'
            ? wrappedData.state
            : (preset.data as SliderState);

          const result = applyPreset({
            name: preset.name,
            timestamp: new Date().toISOString(),
            state: presetState,
            dualRanges: wrappedData?.dualRanges,
            sliderModes: wrappedData?.sliderModes,
            drumEvolveConfigs: wrappedData?.drumEvolveConfigs,
            synthEvolveConfigs: wrappedData?.synthEvolveConfigs,
            drumSubLaneStates: wrappedData?.drumSubLaneStates,
            synthSubLaneStates: wrappedData?.synthSubLaneStates,
            synthPitchBindingModes: wrappedData?.synthPitchBindingModes,
          }, { currentState: state, normalize: normalizePresetForWeb });
          setState(result.state);
          applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
          restoreEvolveConfigs(result.preset);
          console.log(`Loaded cloud preset: ${preset.name} by ${preset.author}`);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [applyDualRangesFromPreset, restoreEvolveConfigs, usesCapacitorLocalPresetLibrary]);

  // Engine state callback
  useEffect(() => {
    audioEngine.setStateChangeCallback((nextState) => {
      setEngineState((prev) => {
        const fxOwnersChanged =
          ['delayA', 'delayB', 'granular', 'reverb'].some((bus) => {
            const previous = prev.fxOwners[bus as keyof typeof prev.fxOwners];
            const next = nextState.fxOwners[bus as keyof typeof nextState.fxOwners];
            return (
              previous.owner !== next.owner ||
              Math.abs(previous.strength - next.strength) > 0.0005 ||
              previous.lastOrigin !== next.lastOrigin ||
              previous.active !== next.active
            );
          });

        if (
          prev.isRunning === nextState.isRunning &&
          prev.harmonyState === nextState.harmonyState &&
          prev.currentSeed === nextState.currentSeed &&
          prev.currentBucket === nextState.currentBucket &&
          prev.cofCurrentStep === nextState.cofCurrentStep &&
          !fxOwnersChanged
        ) {
          return prev;
        }

        return {
          ...prev,
          isRunning: nextState.isRunning,
          harmonyState: nextState.harmonyState,
          currentSeed: nextState.currentSeed,
          currentBucket: nextState.currentBucket,
          cofCurrentStep: nextState.cofCurrentStep,
          fxOwners: fxOwnersChanged ? nextState.fxOwners : prev.fxOwners,
        };
      });
    });
    return () => { audioEngine.setStateChangeCallback(null as unknown as (state: EngineState) => void); };
  }, []);

  // Lead expression trigger callback
  useEffect(() => {
    audioEngine.setLeadExpressionCallback((expression) => {
      if (uiMode !== 'advanced' || activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      mergeRuntimeTriggerPositions({
        leadVibratoDepth: expression.vibratoDepth,
        leadVibratoRate: expression.vibratoRate,
        leadGlide: expression.glide,
      });
    });
    return () => {
      audioEngine.setLeadExpressionCallback(null as unknown as (expression: {
        vibratoDepth: number;
        vibratoRate: number;
        glide: number;
      }) => void);
    };
  }, [activeTab, uiMode]);

  // Lead morph trigger callback — keep live values in the external runtime store so
  // the synth page can mirror them without fanning updates through root App state.
  useEffect(() => {
    let lastLeadMorph = 0;
    audioEngine.setLeadMorphCallback((morph) => {
      if (uiMode !== 'advanced' || activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastLeadMorph < 66) return;
      lastLeadMorph = now;
      const triggerUpdates: Record<string, number> = {};
      if (morph.lead1 >= 0) triggerUpdates.lead1Morph = morph.lead1;
      if (morph.lead2 >= 0) triggerUpdates.lead2Morph = morph.lead2;
      if (Object.keys(triggerUpdates).length > 0) {
        mergeRuntimeTriggerPositions(triggerUpdates);
        mergeRuntimeValues(triggerUpdates);
      }
    });
    return () => {
      audioEngine.setLeadMorphCallback(null as unknown as (morph: { lead1: number; lead2: number }) => void);
      removeRuntimeValues(['lead1Morph', 'lead2Morph']);
    };
  }, [activeTab, uiMode]);

  // Pad morph sub-sequencer callback (moves padMorph slider + applies morphed preset) — throttled to ~15Hz
  useEffect(() => {
    let lastPad1Morph = 0;
    audioEngine.setPadMorphTriggerCallback((morphPosition: number) => {
      if (uiMode !== 'advanced' || activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastPad1Morph < 66) return;
      lastPad1Morph = now;
      mergeRuntimeTriggerPositions({ padMorph: morphPosition });
      mergeRuntimeValues({ padMorph: morphPosition });
    });
    return () => {
      audioEngine.setPadMorphTriggerCallback(null as unknown as (morphPosition: number) => void);
      removeRuntimeValues(['padMorph']);
    };
  }, [activeTab, uiMode]);

  // Pad 2 morph sub-sequencer callback (moves pad2Morph slider + applies morphed preset to pad2 keys) — throttled to ~15Hz
  useEffect(() => {
    let lastPad2Morph = 0;
    audioEngine.setPad2MorphTriggerCallback((morphPosition: number) => {
      if (uiMode !== 'advanced' || activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastPad2Morph < 66) return;
      lastPad2Morph = now;
      mergeRuntimeTriggerPositions({ pad2Morph: morphPosition });
      mergeRuntimeValues({ pad2Morph: morphPosition });
    });
    return () => {
      audioEngine.setPad2MorphTriggerCallback(null as unknown as (morphPosition: number) => void);
      removeRuntimeValues(['pad2Morph']);
    };
  }, [activeTab, uiMode]);

  useEffect(() => {
    const distanceKeys = ['lead1Distance', 'lead2Distance', 'padDistance', 'pad2Distance', 'pianoDistance'] as const;
    const lastDistanceUpdate = {
      lead1Distance: 0,
      lead2Distance: 0,
      padDistance: 0,
      pad2Distance: 0,
      pianoDistance: 0,
    } as Record<typeof distanceKeys[number], number>;
    const commitDistance = (key: typeof distanceKeys[number], value: number) => {
      if (uiMode !== 'advanced' || activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastDistanceUpdate[key] < 66) return;
      lastDistanceUpdate[key] = now;
      mergeRuntimeTriggerPositions({ [key]: value });
      mergeRuntimeValues({ [key]: value });
    };
    audioEngine.setLeadDistanceCallback((distance) => {
      if (distance.lead1 >= 0) commitDistance('lead1Distance', distance.lead1);
      if (distance.lead2 >= 0) commitDistance('lead2Distance', distance.lead2);
    });
    audioEngine.setPadDistanceTriggerCallback((distance) => {
      commitDistance('padDistance', distance);
    });
    audioEngine.setPad2DistanceTriggerCallback((distance) => {
      commitDistance('pad2Distance', distance);
    });
    audioEngine.setPianoDistanceTriggerCallback((distance) => {
      commitDistance('pianoDistance', distance);
    });
    return () => {
      audioEngine.setLeadDistanceCallback(null as unknown as (distance: { lead1: number; lead2: number }) => void);
      audioEngine.setPadDistanceTriggerCallback(null as unknown as (distance: number) => void);
      audioEngine.setPad2DistanceTriggerCallback(null as unknown as (distance: number) => void);
      audioEngine.setPianoDistanceTriggerCallback(null as unknown as (distance: number) => void);
      removeRuntimeTriggerPositions(distanceKeys);
      removeRuntimeValues(distanceKeys);
    };
  }, [activeTab, uiMode]);

  // Lead delay trigger callback
  useEffect(() => {
    audioEngine.setLeadDelayCallback((delay) => {
      if (uiMode !== 'advanced' || (activeTab !== 'synth' && activeTab !== 'delay') || document.visibilityState !== 'visible') return;
      mergeRuntimeTriggerPositions({
        delayATime: delay.time,
        delayAFeedback: delay.feedback,
        delayAMix: delay.mix,
      });
    });
    return () => { audioEngine.setLeadDelayCallback(null as unknown as (delay: {
      time: number;
      feedback: number;
      mix: number;
    }) => void); };
  }, [activeTab, uiMode]);

  // Drum morph trigger callback (per-trigger random morph position)
  // Updates the morph indicator plus an optional lightweight live morph value mirror.
  useEffect(() => {
    if (audioEngine.setDrumMorphTriggerCallback) {
      const lastMorphIndicator: Record<string, number> = {};
      let lastMorphState = 0;
      const voiceToMorphKey: Record<string, keyof SliderState> = {
        sub: 'drumSubMorph',
        kick: 'drumKickMorph',
        click: 'drumClickMorph',
        beepHi: 'drumBeepHiMorph',
        beepLo: 'drumBeepLoMorph',
        noise: 'drumNoiseMorph',
        membrane: 'drumMembraneMorph',
      };
      audioEngine.setDrumMorphTriggerCallback((voice, morphPosition) => {
        if (uiMode !== 'advanced' || activeTab !== 'drums' || document.visibilityState !== 'visible') return;
        const now = performance.now();
        const morphKey = voiceToMorphKey[voice];
        // Throttle indicator update to ~15Hz per voice
        if (now - (lastMorphIndicator[voice] || 0) >= 66) {
          lastMorphIndicator[voice] = now;
          if (morphKey) {
            mergeRuntimeTriggerPositions({ [morphKey]: morphPosition });
          }
        }

        // Mirror the normalized morph value into a lightweight external store instead of
        // re-running the full App tree during auto-morph playback.
        if (morphKey && stateRef.current.drumMorphSliderAnimate && now - lastMorphState >= 100) {
          lastMorphState = now;
          mergeRuntimeValues({ [morphKey]: morphPosition });
        }
      });
      return () => {
        audioEngine.setDrumMorphTriggerCallback(() => {});
        removeRuntimeValues(Object.values(voiceToMorphKey));
      };
    }
  }, [activeTab, uiMode]);

  // Drum distance trigger callback (per-trigger random distance position for S&H) — throttled per-key
  useEffect(() => {
    if (audioEngine.setDrumParamSHTriggerCallback) {
      const lastSH: Record<string, number> = {};
      audioEngine.setDrumParamSHTriggerCallback((_voice, key, position) => {
        if (uiMode !== 'advanced' || activeTab !== 'drums' || document.visibilityState !== 'visible') return;
        const now = performance.now();
        if (now - (lastSH[key] || 0) < 80) return; // max ~12Hz per key
        lastSH[key] = now;
        mergeRuntimeTriggerPositions({ [key]: position });
      });
      return () => {
        audioEngine.setDrumParamSHTriggerCallback(() => {});
      };
    }
  }, [activeTab, uiMode]);

  // Granular/Earth S&H trigger callback (generic engine-side resampling + exact Surf wave triggers)
  useEffect(() => {
    audioEngine.setGranularSHTriggerCallback((positions: Record<string, number>) => {
      if (uiMode !== 'advanced' || (activeTab === 'synth' || activeTab === 'drums') || document.visibilityState !== 'visible') return;
      setRuntimeFlashKeys(Object.keys(positions));
      mergeRuntimeTriggerPositions(positions);
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
      shFlashTimerRef.current = window.setTimeout(() => {
        clearRuntimeFlashKeys();
      }, 70);
    });
    return () => {
      audioEngine.setGranularSHTriggerCallback(() => {});
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
      clearRuntimeFlashKeys();
    };
  }, [activeTab, uiMode]);

  // Drum evolve overrides callback — push evolved values to UI for visual sync
  useEffect(() => {
    audioEngine.setDrumEvolveOverridesChangedCallback((laneIndex, overrides) => {
      drumEvolvedVersionRef.current += 1;
      if (activeTab !== 'drums' || document.visibilityState !== 'visible') return;
      setDrumEvolvedOverrides({ laneIndex, version: drumEvolvedVersionRef.current, data: overrides as Partial<StepOverrides> });
    });
    return () => {
      audioEngine.setDrumEvolveOverridesChangedCallback(() => {});
    };
  }, [activeTab]);

  // Synth evolve overrides callback — push evolved values to UI for visual sync
  useEffect(() => {
    audioEngine.setSynthEvolveOverridesChangedCallback((laneIndex, overrides) => {
      synthEvolvedVersionRef.current += 1;
      const data: Partial<StepOverrides> = {};
        if (overrides.triggerToggles != null) {
          const arr = [new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>()];
          arr[laneIndex] = new Map(overrides.triggerToggles);
          data.triggerToggles = arr;
        }
      const keys = ['expression', 'morph', 'distance', 'probability', 'ratchet'] as const;
      for (const key of keys) {
        if (overrides[key] != null) {
          const arr: (number[] | null)[] = [null, null, null, null];
          arr[laneIndex] = overrides[key]!;
          data[key] = arr;
        }
      }
      // Pitch arrives as relative offsets (engine converts MIDI→offsets at evolve boundary)
      if (overrides.pitch != null) {
        const arr: (number[] | null)[] = [null, null, null, null];
        arr[laneIndex] = overrides.pitch;
        data.pitch = arr;
      }
      // Keep synthStepOverridesRef in sync so tab switches don't lose evolved state
      if (synthStepOverridesRef.current) {
        const prev = synthStepOverridesRef.current;
        const next = { ...prev };
        if (data.triggerToggles?.[laneIndex] != null) {
          const arr = [...prev.triggerToggles];
          arr[laneIndex] = new Map(data.triggerToggles[laneIndex]);
          next.triggerToggles = arr;
        }
        const mergeKeys = ['expression', 'morph', 'distance', 'probability', 'ratchet', 'pitch'] as const;
        for (const key of mergeKeys) {
          if (data[key] && data[key]![laneIndex] != null) {
            const arr = [...prev[key]];
            arr[laneIndex] = data[key]![laneIndex];
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        synthStepOverridesRef.current = next;
      }
      if (activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      setSynthEvolvedOverrides({ laneIndex, version: synthEvolvedVersionRef.current, data });
    });
    return () => {
      audioEngine.setSynthEvolveOverridesChangedCallback(() => {});
    };
  }, [activeTab]);

  // Synth noteRange evolve callback — push evolved noteMin/noteMax to UI sliders
  useEffect(() => {
    audioEngine.setSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) => {
      mergeRuntimeValues({
        [`synthEuclid${laneIndex + 1}NoteMin`]: noteMin,
        [`synthEuclid${laneIndex + 1}NoteMax`]: noteMax,
      });
    });
    return () => {
      audioEngine.setSynthNoteRangeEvolvedCallback(null as unknown as (laneIndex: number, noteMin: number, noteMax: number) => void);
    };
  }, []);

  useEffect(() => {
    if (playbackIsRunning) return;
    removeRuntimeValues([
      'lead1Morph',
      'lead2Morph',
      'lead1Distance',
      'lead2Distance',
      'padDistance',
      'pad2Distance',
      'pianoDistance',
      'synthEuclid1NoteMin',
      'synthEuclid1NoteMax',
      'synthEuclid2NoteMin',
      'synthEuclid2NoteMax',
      'synthEuclid3NoteMin',
      'synthEuclid3NoteMax',
      'synthEuclid4NoteMin',
      'synthEuclid4NoteMax',
    ]);
    removeRuntimeTriggerPositions([
      'lead1Distance',
      'lead2Distance',
      'padDistance',
      'pad2Distance',
      'pianoDistance',
    ]);
  }, [playbackIsRunning]);

  const updateTransportDebug = useCallback(() => {
    const transportDebug = audioEngine.getTransportDebugState();
    setEngineState(prev => {
      const current = prev.transportDebug;
      if (
        current &&
        transportDebug &&
        Math.abs(current.effectiveBpm - transportDebug.effectiveBpm) < 0.05 &&
        Math.abs(current.effectivePhraseSeconds - transportDebug.effectivePhraseSeconds) < 0.05 &&
        Math.abs(current.nextPhraseBoundaryIn - transportDebug.nextPhraseBoundaryIn) < 0.05 &&
        Math.abs((current.nextHarmonyEventIn ?? -1) - (transportDebug.nextHarmonyEventIn ?? -1)) < 0.05 &&
        Math.abs((current.nextProgressionStepIn ?? -1) - (transportDebug.nextProgressionStepIn ?? -1)) < 0.05
      ) {
        return prev;
      }
      return { ...prev, transportDebug };
    });
  }, []);

  useVisibleInterval(updateTransportDebug, 1000, {
    enabled: engineState.isRunning,
  });

  useEffect(() => {
    setState(prev => {
      const barsPerPhrase = Math.max(1, prev.transportBarsPerPhrase ?? 4);
      const beatsPerBar = Math.max(1, prev.transportBeatsPerBar ?? 4);
      const phraseSeconds = Math.max(0.001, prev.phraseLength ?? 16);
      const bpm = Math.max(1, prev.sequencerMasterBPM ?? prev.synthEuclidBaseBPM ?? prev.drumEuclidBaseBPM ?? 120);
      const primaryClock = prev.transportPrimaryClock ?? 'seconds';
      const nextBpm = quantize('sequencerMasterBPM', bpm);

      if (primaryClock === 'decoupled') {
        if (
          nextBpm === prev.sequencerMasterBPM &&
          nextBpm === prev.synthEuclidBaseBPM &&
          nextBpm === prev.drumEuclidBaseBPM
        ) {
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
        if (
          derivedBpm === prev.sequencerMasterBPM &&
          derivedBpm === prev.synthEuclidBaseBPM &&
          derivedBpm === prev.drumEuclidBaseBPM
        ) {
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
      if (
        derivedPhrase === prev.phraseLength &&
        nextBpm === prev.sequencerMasterBPM &&
        nextBpm === prev.synthEuclidBaseBPM &&
        nextBpm === prev.drumEuclidBaseBPM
      ) {
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

  const nativeDualRanges = useMemo(
    () => extractNativeDualRanges(dualSliderRanges),
    [dualSliderRanges],
  );

  // Web audio does not consume dual-slider ranges, so avoid re-sending params when
  // only the UI runtime range model changes.
  useEffect(() => {
    if (nativeBackgroundAudioMode) return;
    audioEngine.updateParams(state);
  }, [state, nativeBackgroundAudioMode]);

  useEffect(() => {
    if (!nativeBackgroundAudioMode) return;
    void syncCapacitorNativeAudioState({
      state,
      dualRanges: nativeDualRanges,
    });
  }, [state, nativeBackgroundAudioMode, nativeDualRanges]);

  type SliderChangeOptions = {
    preserveEnabledFlags?: boolean;
  };

  const handleSliderChangeWithOptions = useCallback((
    key: keyof SliderState,
    value: number | string,
    options?: SliderChangeOptions,
  ) => {
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
    const stateValue = quantizedSliderValue !== null
      ? getStateValueFromSliderNumber(key, quantizedSliderValue)
      : value;
    const isStateNumericValue = typeof stateValue === 'number';
    const isMorphActive = morphPresetA !== null || morphPresetB !== null;
    
    if (isMorphActive) {
      if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
        // At endpoint A: update preset A permanently (both numeric and string values)
        setMorphPresetA(prev => prev ? {
          ...prev,
          state: { ...prev.state, [key]: stateValue }
        } : null);
      } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
        // At endpoint B: update preset B permanently (both numeric and string values)
        setMorphPresetB(prev => prev ? {
          ...prev,
          state: { ...prev.state, [key]: stateValue }
        } : null);
      } else if (morphPosition > 0 && morphPosition < 100 && isStateNumericValue) {
        // Mid-morph: store as temporary override (numeric only)
        morphManualOverridesRef.current[key] = {
          value: stateValue as number,
          morphPosition
        };
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // DRUM SYNTH PARAMETER OVERRIDE SYSTEM
    // When a drum synth param (like drumSubFreq) is changed at a drum morph
    // endpoint (0 or 1), save as override so it persists during morph
    // ═══════════════════════════════════════════════════════════════════════
    const keyStr = key as string;
    
    // Detect which voice this param belongs to based on prefix
    let drumVoice: DrumPresetVoice | null = null;
    let drumMorphKey: keyof SliderState | null = null;
    
    if (keyStr.startsWith('drumSub') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'sub';
      drumMorphKey = 'drumSubMorph';
    } else if (keyStr.startsWith('drumKick') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'kick';
      drumMorphKey = 'drumKickMorph';
    } else if (keyStr.startsWith('drumClick') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'click';
      drumMorphKey = 'drumClickMorph';
    } else if (keyStr.startsWith('drumBeepHi') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'beepHi';
      drumMorphKey = 'drumBeepHiMorph';
    } else if (keyStr.startsWith('drumBeepLo') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'beepLo';
      drumMorphKey = 'drumBeepLoMorph';
    } else if (keyStr.startsWith('drumNoise') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'noise';
      drumMorphKey = 'drumNoiseMorph';
    } else if (keyStr.startsWith('drumMembrane') && !keyStr.includes('Morph') && !keyStr.includes('Preset')) {
      drumVoice = 'membrane';
      drumMorphKey = 'drumMembraneMorph';
    }
    
    // If this is a drum synth param, check for drum morph endpoint and save override
    if (drumVoice && drumMorphKey && isStateNumericValue) {
      // Get current drum morph position for this voice from state
      // We need to read from the current state, so we'll do this inside setState
    }
    
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
        setDrumMorphOverride(drumVoice, keyStr, stateValue as number, drumMorphPosition);
      }
      
      const routeKey = key as keyof SliderState;
      const positiveNumber = typeof stateValue === 'number' && stateValue > 0;

      if (positiveNumber) {
        switch (routeKey) {
          case 'delayAMix':
          case 'delayAReverbSend':
          case 'delayAToBSend':
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
          case 'delayBWarpIntensity':
          case 'delayBSpread':
            newState.granularDelayEnabled = true;
            break;
          case 'granularLevel':
          case 'granularReverbSend':
          case 'granularDelayASend':
          case 'granularDelayBSend':
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
          case 'lead1Level':
          case 'lead1ReverbSend':
          case 'lead1DelayASend':
          case 'lead1DelayBSend':
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
            newState.padEnabled = true;
            break;
          case 'pad2ReverbSend':
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
      }

      const pad1WetActive =
        (newState.synthLevel ?? 0) > 0 ||
        (newState.pad1ReverbSend ?? 0) > 0 ||
        (newState.pad1DelayASend ?? 0) > 0 ||
        (newState.pad1DelayBSend ?? 0) > 0 ||
        (newState.granularPad1Send ?? 0) > 0;
      const pad2WetActive =
        (newState.pad2Level ?? 0) > 0 ||
        (newState.pad2ReverbSend ?? 0) > 0 ||
        (newState.pad2DelayASend ?? 0) > 0 ||
        (newState.pad2DelayBSend ?? 0) > 0 ||
        (newState.granularPad2Send ?? 0) > 0;
      const granularEngineActive =
        (newState.granularLevel ?? 0) > 0 ||
        (newState.granularReverbSend ?? 0) > 0 ||
        (newState.granularDelayASend ?? 0) > 0 ||
        (newState.granularDelayBSend ?? 0) > 0 ||
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
        (newState.delayAGranularSend ?? 0) > 0;
      const delayBWetActive =
        (newState.granularDelayMix ?? 0) > 0 ||
        (newState.granularDelayReverbSend ?? 0) > 0 ||
        (newState.delayBToASend ?? 0) > 0 ||
        (newState.delayBGranularSend ?? 0) > 0;
      const lead1WetActive =
        (newState.lead1Level ?? 0) > 0 ||
        (newState.lead1ReverbSend ?? 0) > 0 ||
        (newState.lead1DelayASend ?? 0) > 0 ||
        (newState.lead1DelayBSend ?? 0) > 0 ||
        (newState.granularLead1Send ?? 0) > 0;
      const lead2WetActive =
        (newState.lead2Level ?? 0) > 0 ||
        (newState.lead2ReverbSend ?? 0) > 0 ||
        (newState.lead2DelayASend ?? 0) > 0 ||
        (newState.lead2DelayBSend ?? 0) > 0 ||
        (newState.granularLead2Send ?? 0) > 0;
      const pianoWetActive =
        (newState.pianoLevel ?? 0) > 0 ||
        (newState.pianoReverbSend ?? 0) > 0 ||
        (newState.pianoDelayASend ?? 0) > 0 ||
        (newState.pianoDelayBSend ?? 0) > 0 ||
        (newState.granularPianoSend ?? 0) > 0;
      const drumWetActive =
        (newState.drumLevel ?? 0) > 0 ||
        (newState.drumReverbSend ?? 0) > 0 ||
        (newState.drumDelayASend ?? 0) > 0 ||
        (newState.drumDelayBSend ?? 0) > 0 ||
        (newState.granularDrumSend ?? 0) > 0;
      const oceanWetActive =
        (newState.oceanSampleLevel ?? 0) > 0 ||
        (newState.oceanReverbSend ?? 0) > 0 ||
        (newState.oceanDelayASend ?? 0) > 0 ||
        (newState.oceanDelayBSend ?? 0) > 0 ||
        (newState.granularWavesSend ?? 0) > 0;
      const birdsWetActive =
        (newState.birdsLevel ?? 0) > 0 ||
        (newState.natureReverbSend ?? 0) > 0 ||
        (newState.natureDelayASend ?? 0) > 0 ||
        (newState.natureDelayBSend ?? 0) > 0 ||
        (newState.granularNatureSend ?? 0) > 0;
      const birds2WetActive =
        (newState.birds2Level ?? 0) > 0 ||
        (newState.natureReverbSend ?? 0) > 0 ||
        (newState.natureDelayASend ?? 0) > 0 ||
        (newState.natureDelayBSend ?? 0) > 0 ||
        (newState.granularNatureSend ?? 0) > 0;
      const frogsWetActive =
        (newState.frogsLevel ?? 0) > 0 ||
        (newState.natureReverbSend ?? 0) > 0 ||
        (newState.natureDelayASend ?? 0) > 0 ||
        (newState.natureDelayBSend ?? 0) > 0 ||
        (newState.granularNatureSend ?? 0) > 0;
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
        (newState.granularWaterSend ?? 0) > 0;
      const insectsSharedWetActive =
        (newState.insectsReverbSend ?? 0) > 0 ||
        (newState.insDelayASend ?? 0) > 0 ||
        (newState.insDelayBSend ?? 0) > 0 ||
        (newState.granularInsectsSend ?? 0) > 0;

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
      if (((newState.insectsLevel ?? 0) <= 0) && !insectsSharedWetActive) {
        newState.insectsEnabled = false;
      }
      if (((newState.insects2Level ?? 0) <= 0) && !insectsSharedWetActive) {
        newState.insects2Enabled = false;
      }

      // When drum morph slider or preset selectors change, apply morphed values to sliders
      const morphKeys: Record<string, DrumPresetVoice> = {
        drumSubMorph: 'sub', drumSubPresetA: 'sub', drumSubPresetB: 'sub',
        drumKickMorph: 'kick', drumKickPresetA: 'kick', drumKickPresetB: 'kick',
        drumClickMorph: 'click', drumClickPresetA: 'click', drumClickPresetB: 'click',
        drumBeepHiMorph: 'beepHi', drumBeepHiPresetA: 'beepHi', drumBeepHiPresetB: 'beepHi',
        drumBeepLoMorph: 'beepLo', drumBeepLoPresetA: 'beepLo', drumBeepLoPresetB: 'beepLo',
        drumNoiseMorph: 'noise', drumNoisePresetA: 'noise', drumNoisePresetB: 'noise',
        drumMembraneMorph: 'membrane', drumMembranePresetA: 'membrane', drumMembranePresetB: 'membrane',
      };
      
      const voice = morphKeys[key];
      if (voice) {
        // Clear only the relevant endpoint's overrides when a preset changes
        // This preserves user edits at the OTHER endpoint
        if (keyStr.includes('PresetA')) {
          clearDrumMorphEndpointOverrides(voice, 0);
        } else if (keyStr.includes('PresetB')) {
          clearDrumMorphEndpointOverrides(voice, 1);
        }
        
        // Clear mid-morph overrides when reaching an endpoint (keep endpoint edits)
        if (keyStr.includes('Morph') && !keyStr.includes('Auto') && !keyStr.includes('Speed') && !keyStr.includes('Mode')) {
          const morphValue = value as number;
          if (isAtEndpoint0(morphValue) || isAtEndpoint1(morphValue)) {
            clearMidMorphOverrides(voice);
          }
        }
        
        // Apply morphed preset values to the state
        const morphedParams = applyMorphToState(newState, voice);
        newState = { ...newState, ...morphedParams };
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // PAD SYNTH PRESET MORPH SYSTEM
      // When padMorph slider changes, morph between padPresetA & padPresetB
      // and apply the resulting params to state
      // ═══════════════════════════════════════════════════════════════════════
      if (key === 'padMorph') {
        const presetA = getPadPreset(newState.padPresetA as string, 'pad1');
        const presetB = getPadPreset(newState.padPresetB as string, 'pad1');
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, newState.padMorph as number);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              (newState as Record<string, unknown>)[k] = morphed[k];
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PAD 2 PRESET MORPH SYSTEM
      // When pad2Morph slider changes, morph between pad2PresetA & pad2PresetB
      // and apply the resulting params to pad2 state keys
      // ═══════════════════════════════════════════════════════════════════════
      if (key === 'pad2Morph') {
        const presetA = getPadPreset(newState.pad2PresetA as string, 'pad2');
        const presetB = getPadPreset(newState.pad2PresetB as string, 'pad2');
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, newState.pad2Morph as number);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              const pad2Key = PAD1_TO_PAD2_KEY[k];
              if (pad2Key) {
                (newState as Record<string, unknown>)[pad2Key] = morphed[k];
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // WATER PRESET MORPH SYSTEM
      // When waterMorph slider changes, morph between waterMorphA & waterMorphB
      // ═══════════════════════════════════════════════════════════════════════
      if (key === 'waterMorph' || key === 'waterMorphA' || key === 'waterMorphB') {
        const morphed = morphWaterPresets(
          newState.waterMorphA as number,
          newState.waterMorphB as number,
          newState.waterMorph as number,
        );
        for (const k of WATER_MORPH_PARAM_KEYS) {
          if (k in morphed) {
            (newState as Record<string, unknown>)[k] = morphed[k];
          }
        }
        // Snap waterPreset to nearest morph endpoint
        newState.waterPreset = (newState.waterMorph as number) < 0.5
          ? (newState.waterMorphA as number)
          : (newState.waterMorphB as number);
      }

      if (preservedEnabledFlags) {
        newState = {
          ...newState,
          ...preservedEnabledFlags,
        };
      }
      
      return newState;
    });

    // Apply water preset dual ranges when morph endpoints or position change
    if (key === 'waterMorph' || key === 'waterMorphA' || key === 'waterMorphB') {
      // Read target preset from latest state
      setState(prev => {
        const presetIdx = prev.waterPreset as number;
        const ranges = getWaterPresetDualRanges(presetIdx);
        const modes = getWaterPresetSliderModes(presetIdx);

        // Water surf keys that presets can control
        const waterSurfKeys = ['waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfProximity', 'waterSurfDepth'];

        // Merge preset ranges into existing dual ranges (additive, not replacing)
        setSliderModes(prev => {
          const next = { ...prev };
          for (const k of waterSurfKeys) {
            if (modes[k]) next[k] = modes[k];
            else delete next[k];
          }
          return next;
        });
        setDualSliderRanges(prev => {
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
    
    // Map of voice to its drum synth param prefixes
    const voiceParamPrefixes: Record<DrumPresetVoice, string> = {
      sub: 'drumSub', kick: 'drumKick', click: 'drumClick',
      beepHi: 'drumBeepHi', beepLo: 'drumBeepLo', noise: 'drumNoise', membrane: 'drumMembrane',
    };
    
    // Map preset keys to their voice
    const presetVoiceMap: Record<string, DrumPresetVoice> = {
      drumSubPresetA: 'sub', drumSubPresetB: 'sub',
      drumKickPresetA: 'kick', drumKickPresetB: 'kick',
      drumClickPresetA: 'click', drumClickPresetB: 'click',
      drumBeepHiPresetA: 'beepHi', drumBeepHiPresetB: 'beepHi',
      drumBeepLoPresetA: 'beepLo', drumBeepLoPresetB: 'beepLo',
      drumNoisePresetA: 'noise', drumNoisePresetB: 'noise',
      drumMembranePresetA: 'membrane', drumMembranePresetB: 'membrane',
    };
    
    // Map voice to its morph key to get current position
    const voiceMorphKeys: Record<DrumPresetVoice, keyof SliderState> = {
      sub: 'drumSubMorph', kick: 'drumKickMorph', click: 'drumClickMorph',
      beepHi: 'drumBeepHiMorph', beepLo: 'drumBeepLoMorph', noise: 'drumNoiseMorph', membrane: 'drumMembraneMorph',
    };
    
    // When a preset changes, only reset dual slider modes/ranges if we're at that endpoint
    // If preset A changes and we're at endpoint 1 (B), preserve the current dual modes
    const presetVoice = presetVoiceMap[key];
    if (presetVoice) {
      const prefix = voiceParamPrefixes[presetVoice];
      const morphKey = voiceMorphKeys[presetVoice];
      const currentMorph = state[morphKey] as number;
      
      // Determine if we should reset dual modes
      // Only reset if we're at the endpoint matching the changed preset
      const isPresetA = keyStr.includes('PresetA');
      const atEndpoint0 = isAtEndpoint0(currentMorph);
      const atEndpoint1 = isAtEndpoint1(currentMorph);
      
      // Reset dual modes only if:
      // - Preset A changed and we're at endpoint 0 (or mid-morph)
      // - Preset B changed and we're at endpoint 1 (or mid-morph)
      const shouldResetDualModes = (isPresetA && !atEndpoint1) || (!isPresetA && !atEndpoint0);
      
      if (shouldResetDualModes) {
        // Reset all dual modes for params starting with this prefix (excluding Morph/Preset keys)
        setSliderModes(prev => {
          const next = { ...prev };
          for (const modeKey of Object.keys(prev)) {
            if (modeKey.startsWith(prefix) && !modeKey.includes('Morph') && !modeKey.includes('Preset')) {
              delete next[modeKey];
            }
          }
          return next;
        });
        // Also clear the ranges
        setDualSliderRanges(prev => {
          const newRanges = { ...prev };
          for (const rangeKey of Object.keys(prev)) {
            if (rangeKey.startsWith(prefix) && !rangeKey.includes('Morph') && !rangeKey.includes('Preset')) {
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
    const drumMorphVoiceKeys: Record<string, DrumPresetVoice> = {
      drumSubMorph: 'sub', drumKickMorph: 'kick', drumClickMorph: 'click',
      drumBeepHiMorph: 'beepHi', drumBeepLoMorph: 'beepLo', drumNoiseMorph: 'noise', drumMembraneMorph: 'membrane',
    };
    
    const morphVoice = drumMorphVoiceKeys[key];
    if (morphVoice && keyStr.includes('Morph') && !keyStr.includes('Auto') && !keyStr.includes('Speed') && !keyStr.includes('Mode')) {
      const morphValue = value as number;
      
      // Build current values map for fallback
      // We need to read current state values for the interpolation
      const currentValues: Record<string, number> = {};
      const overrides = getDrumMorphDualRangeOverrides(morphVoice);
      for (const param of Object.keys(overrides)) {
        const stateVal = state[param as keyof SliderState];
        if (typeof stateVal === 'number') {
          currentValues[param] = stateVal;
        }
      }
      
      // Get interpolated dual ranges for all params
      const interpolatedRanges = interpolateDrumMorphDualRanges(morphVoice, morphValue, currentValues);
      
      // Apply the interpolated states
      for (const [param, interpState] of Object.entries(interpolatedRanges)) {
        const paramKey = param as keyof SliderState;
        
        if (interpState.isDualMode && interpState.range) {
          // Interpolated to dual mode - enable and set range
          setSliderModes(prev => ({...prev, [paramKey as string]: prev[paramKey as string] ?? 'sampleHold'}));
          setDualSliderRanges(prev => ({ ...prev, [paramKey]: interpState.range! }));
        } else {
          // Interpolated to single mode - disable dual
          setSliderModes(prev => {
            const next = { ...prev };
            delete next[paramKey as string];
            return next;
          });
          setDualSliderRanges(prev => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [paramKey]: _, ...rest } = prev;
            return rest as typeof prev;
          });
        }
      }
    }
  }, [isJourneyPlaying, morphPosition, morphPresetA, morphPresetB, setMorphPresetA, setMorphPresetB, state]);

  // Handle slider change
  const handleSliderChange = useCallback((key: keyof SliderState, value: number | string) => {
    handleSliderChangeWithOptions(key, value);
  }, [handleSliderChangeWithOptions]);

  const handleRoutingColumnChange = useCallback((key: keyof SliderState, value: number) => {
    handleSliderChangeWithOptions(key, value, { preserveEnabledFlags: true });
  }, [handleSliderChangeWithOptions]);

  // Helper to create slider props with dual mode support
  const sliderProps = useCallback((paramKey: keyof SliderState): {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  } => {
    const keyStr = paramKey as string;
    const mode: SliderMode = sliderModes[keyStr] ?? 'single';
    const walkPos = getRuntimeSliderPosition(keyStr, mode);
    const isFlashing = getRuntimeSliderFlashing(keyStr, mode);

    return {
      mode,
      dualRange: dualSliderRanges[paramKey],
      walkPosition: walkPos,
      isFlashing,
      onCycleMode: handleCycleSliderMode,
      onDualRangeChange: handleDualRangeChange,
    };
  }, [sliderModes, dualSliderRanges, handleCycleSliderMode, handleDualRangeChange]);

  const shouldDisableLeadRandomTiming = useCallback((nextState: SliderState): boolean => {
    if (!nextState.leadRandomEnabled) return false;
    const randomSource = nextState.leadRandomSource ?? 'lead1';
    if (randomSource === 'lead2') return !nextState.lead2Enabled;
    if (randomSource === 'piano') return !nextState.pianoEnabled;
    return !nextState.leadEnabled;
  }, []);

  // Handle select change
  const handleSelectChange = useCallback(<K extends keyof SliderState>(key: K, value: SliderState[K]) => {
    // Mark that user has interacted with the UI
    hasUserInteractedRef.current = true;
    setState((prev) => {
      const newState: SliderState = { ...prev, [key]: value } as SliderState;

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
        const presetA = getPadPreset(newState.padPresetA as string, 'pad1');
        const presetB = getPadPreset(newState.padPresetB as string, 'pad1');
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, newState.padMorph as number);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              (newState as unknown as Record<string, unknown>)[k] = morphed[k];
            }
          }
        }
      }

      // ═══ PAD 2 PRESET MORPH: when pad2 preset A or B changes, re-morph and apply ═══
      if (key === 'pad2PresetA' || key === 'pad2PresetB') {
        const presetA = getPadPreset(newState.pad2PresetA as string, 'pad2');
        const presetB = getPadPreset(newState.pad2PresetB as string, 'pad2');
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, newState.pad2Morph as number);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              const pad2Key = PAD1_TO_PAD2_KEY[k];
              if (pad2Key) {
                (newState as unknown as Record<string, unknown>)[pad2Key] = morphed[k];
              }
            }
          }
        }
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
        const morphed = morphWaterPresets(
          newState.waterMorphA as number,
          newState.waterMorphB as number,
          newState.waterMorph as number,
        );
        for (const k of WATER_MORPH_PARAM_KEYS) {
          if (k in morphed) {
            (newState as unknown as Record<string, unknown>)[k] = morphed[k];
          }
        }
        newState.waterPreset = (newState.waterMorph as number) < 0.5
          ? (newState.waterMorphA as number)
          : (newState.waterMorphB as number);
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

      return newState;
    });

    // Apply granular preset slider modes (outside setState since sliderModes is separate state)
    if (key === 'granularPreset') {
      const modes = getGranularPresetSliderModes(value as string);
      if (modes) {
        // 1. Update slider modes
        setSliderModes(prev => {
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
        setDualSliderRanges(prev => {
          const next: Record<string, DualSliderRange | undefined> = { ...prev };
          for (const k of Object.keys(next)) {
            if (k.startsWith('granularV')) delete next[k];
          }
          Object.assign(next, newDualRanges);
          return next as DualSliderState;
        });
        removeRuntimeWalkPositions(Object.keys(DEFAULT_STATE).filter((key) => key.startsWith('granularV')));
        mergeRuntimeWalkPositions(newWalkPositions);
      }
    }
  }, [shouldDisableLeadRandomTiming]);

  useEffect(() => {
    if (!shouldDisableLeadRandomTiming(state)) return;
    setState(prev => {
      if (!shouldDisableLeadRandomTiming(prev)) return prev;
      return { ...prev, leadRandomEnabled: false };
    });
  }, [
    shouldDisableLeadRandomTiming,
    state.leadEnabled,
    state.lead2Enabled,
    state.pianoEnabled,
    state.leadRandomEnabled,
    state.leadRandomSource,
  ]);

  // Start/Stop
  const handleStart = async () => {
    try {
      // Activate snowflake on first play
      if (!snowflakeActivated) setSnowflakeActivated(true);
      
      // Auto-load String Waves if user hasn't loaded any preset or interacted with UI
      let stateToStart = state;
      if (!hasLoadedPresetRef.current && !hasUserInteractedRef.current) {
        const { preset: defaultPreset, source: defaultPresetSource } = await resolveDefaultAutoStartPreset();
        if (defaultPreset) {
          console.log(`[App] Auto-loading default preset: ${defaultPreset.name}${defaultPresetSource ? ` (${defaultPresetSource})` : ''}`);
          hasLoadedPresetRef.current = true;
          const result = applyPreset(defaultPreset, { currentState: state, updateEngine: false, resetCofDrift: false, normalize: normalizePresetForWeb });
          setState(result.state);
          setStatePresetName(defaultPreset.name);
          setMorphPresetA(result.preset);
          stateToStart = result.state;
          applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
          restoreEvolveConfigs(result.preset);
        }
      }

      if (!nativeBackgroundAudioMode && isCapacitorNativeShell() && isCapacitorBackgroundAudioAvailable()) {
        setNativeBackgroundAudioMode(true);
      }

      if (nativeBackgroundAudioMode) {
        await startCapacitorNativePlayback(
          {
            state: stateToStart,
            dualRanges: extractNativeDualRanges(dualSliderRanges),
          },
          {
            title: 'Generative Ambient',
            artist: 'Kessho',
            album: 'Kessho Native',
            isLiveStream: true,
            isPlaying: true,
          },
        );
        setNativePlaybackState(true);
        return;
      }

      if (isCapacitorNativeShell()) {
        throw new Error('Native background audio plugin is not ready yet. Relaunch the app after sync if this persists.');
      }

      // Setup iOS media session FIRST (must be synchronous from user gesture)
      setupIOSMediaSession();
      
      // Then start the audio engine
      await audioEngine.start(stateToStart);
      
      // Connect the MediaStream to the audio element for iOS background playback
      connectMediaSessionToWebAudio();
      
      // If recording was armed, start recording now
      if (isRecordingArmed) {
        setIsRecordingArmed(false);
        // Small delay to ensure audio context is fully running
        setTimeout(() => {
          void handleStartRecording();
        }, 50);
      }
    } catch (err) {
      console.error('Failed to start audio:', err);
      alert(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}\n\nCheck console for details.`);
    }
  };

  const handleStop = () => {
    if (nativeBackgroundAudioMode) {
      void stopCapacitorNativePlayback();
      setNativePlaybackState(false);
      return;
    }

    // Don't stop recording when stopping playback - let tails continue
    // Recording must be stopped manually
    stopIOSMediaSession();
    audioEngine.stop();

    // Master stop also turns off the drum sequencer and lead Euclidean sequencer
    setState(prev => ({ ...prev, drumEuclidMasterEnabled: false, synthEuclideanMasterEnabled: false }));
    
    // Stop journey playback if running
    if (isJourneyPlaying) {
      journey.stop();
      stopJourneyMorphPlayback(true);
      setIsJourneyPlaying(false);
    }

    playbackTimerTargetTimeRef.current = null;
    setPlaybackTimerRemaining(null);
  };

  const updatePlaybackTimerCountdown = useCallback(() => {
    if (!playbackIsRunning || !playbackTimerEnabled) return;

    const targetTime = playbackTimerTargetTimeRef.current;
    if (targetTime === null) return;

    const remainingMs = targetTime - Date.now();
    if (remainingMs <= 0) {
      playbackTimerTargetTimeRef.current = null;
      setPlaybackTimerRemaining(null);

      window.setTimeout(() => {
        if (nativeBackgroundAudioMode) {
          void stopCapacitorNativePlayback();
          setNativePlaybackState(false);
        } else {
          audioEngine.stop();
          stopIOSMediaSession();
        }
      }, 0);
      return;
    }

    const nextRemaining = Math.ceil(remainingMs / 1000);
    setPlaybackTimerRemaining(prev => (prev === nextRemaining ? prev : nextRemaining));
  }, [playbackIsRunning, playbackTimerEnabled, nativeBackgroundAudioMode]);

  // Playback timer effect - keeps countdown based on absolute time so hidden tabs do not drift.
  useEffect(() => {
    if (playbackIsRunning && playbackTimerEnabled) {
      if (playbackTimerTargetTimeRef.current === null) {
        const initialRemaining = playbackTimerRemaining ?? playbackTimerMinutes * 60;
        playbackTimerTargetTimeRef.current = Date.now() + initialRemaining * 1000;
        if (playbackTimerRemaining === null) {
          setPlaybackTimerRemaining(initialRemaining);
        }
      }
      updatePlaybackTimerCountdown();
      return;
    }

    if (!playbackIsRunning) {
      playbackTimerTargetTimeRef.current = null;
      setPlaybackTimerRemaining(null);
      return;
    }

    playbackTimerTargetTimeRef.current = null;
  }, [
    playbackIsRunning,
    playbackTimerEnabled,
    playbackTimerMinutes,
    playbackTimerRemaining,
    updatePlaybackTimerCountdown,
  ]);

  useVisibleInterval(updatePlaybackTimerCountdown, 1000, {
    enabled: playbackIsRunning && playbackTimerEnabled,
    immediate: false,
  });
  
  // Arm recording - will start recording when playback starts
  const handleArmRecording = () => {
    setIsRecordingArmed(prev => !prev);
  };

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const downloadRecordingArchive = async (
    filesToExport: Array<{ filename: string; blob: Blob }>,
    timestamp: string,
  ) => {
    if (filesToExport.length === 0) {
      console.log('No files to export');
      return;
    }

    if (filesToExport.length === 1) {
      const firstFile = filesToExport[0];
      if (!firstFile) return;
      downloadBlob(firstFile.filename, firstFile.blob);
      console.log(`Exported: ${firstFile.filename}`);
      return;
    }

    console.log(`Creating zip archive with ${filesToExport.length} files...`);
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const { filename, blob } of filesToExport) {
      zip.file(filename, blob);
    }
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    downloadBlob(`kessho-${timestamp}.zip`, zipBlob);
    console.log(`Exported: kessho-${timestamp}.zip (${filesToExport.length} files)`);
  };

  const ensureRecorderTapWorklet = useCallback(async (ctx: AudioContext) => {
    if (recorderWorkletContextRef.current === ctx) return;
    await ctx.audioWorklet.addModule(recorderTapWorkletUrl);
    recorderWorkletContextRef.current = ctx;
  }, []);

  const ensureRecordingExportWorker = useCallback(() => {
    if (recordingExportWorkerRef.current) return recordingExportWorkerRef.current;
    const worker = new Worker(
      new URL('./audio/recording/exportRecorder.worker.ts', import.meta.url),
      { type: 'module' },
    );
    recordingExportWorkerRef.current = worker;
    return worker;
  }, []);

  const attachRecorderTap = useCallback((
    ctx: AudioContext,
    trackId: RecordTrackId,
    sourceNode: AudioNode,
    worker: Worker,
    outputIndex = 0,
  ) => {
    let resolveFlush = () => {};
    const flushPromise = new Promise<void>((resolve) => {
      resolveFlush = resolve;
    });

    const tapNode = new AudioWorkletNode(ctx, 'kessho-recorder-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      processorOptions: {
        trackId,
        chunkFrames: 4096,
      },
    });
    const sinkNode = ctx.createGain();
    sinkNode.gain.value = 0;

    const handleMessage = (event: MessageEvent<unknown>) => {
      const message = event.data as {
        type?: string;
        trackId?: RecordTrackId;
        frameCount?: number;
        left?: Float32Array;
        right?: Float32Array;
      };
      if (message.type === 'chunk' && message.left && message.right && typeof message.frameCount === 'number') {
        worker.postMessage(
          {
            type: 'chunk',
            trackId,
            frameCount: message.frameCount,
            left: message.left,
            right: message.right,
          },
          [message.left.buffer, message.right.buffer],
        );
        return;
      }
      if (message.type === 'flushed') {
        resolveFlush();
      }
    };

    tapNode.port.addEventListener('message', handleMessage as EventListener);
    tapNode.port.start?.();
    sourceNode.connect(tapNode, outputIndex);
    tapNode.connect(sinkNode);
    sinkNode.connect(ctx.destination);

    recorderTapSessionsRef.current[trackId] = {
      trackId,
      sourceNode,
      tapNode,
      sinkNode,
      flushPromise,
      resolveFlush,
      handleMessage,
    };
  }, []);

  const flushAndDetachRecorderTapSessions = useCallback(async () => {
    const sessions = Object.values(recorderTapSessionsRef.current).filter((session): session is RecorderTapSession => Boolean(session));
    if (sessions.length === 0) return;

    for (const session of sessions) {
      session.tapNode.port.postMessage({ type: 'flush' });
    }

    await Promise.all(sessions.map((session) => session.flushPromise));

    for (const session of sessions) {
      try {
        session.sourceNode.disconnect(session.tapNode);
      } catch { /* noop */ }
      session.tapNode.port.removeEventListener('message', session.handleMessage as EventListener);
      try {
        session.tapNode.port.postMessage({ type: 'destroy' });
      } catch { /* noop */ }
      try {
        session.tapNode.disconnect();
      } catch { /* noop */ }
      try {
        session.sinkNode.disconnect();
      } catch { /* noop */ }
      recorderTapSessionsRef.current[session.trackId] = null;
    }
  }, []);

  const finalizeRecordingWorkerFiles = useCallback((timestamp: string) => {
    const worker = recordingExportWorkerRef.current;
    if (!worker) return Promise.resolve<Array<{ filename: string; blob: Blob }>>([]);

    return new Promise<Array<{ filename: string; blob: Blob }>>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<RecorderWorkerFinalizedMessage>) => {
        if (event.data?.type !== 'finalized') return;
        worker.removeEventListener('message', handleMessage as EventListener);
        worker.removeEventListener('error', handleError as EventListener);
        const files = event.data.files.map(({ trackId, blob, totalFrames }) => {
          const suffix = RECORD_TRACK_FILENAME_SUFFIX[trackId];
          const filename = suffix
            ? `kessho-${timestamp}-${suffix}.wav`
            : `kessho-${timestamp}.wav`;
          console.log(`Prepared ${filename} (${totalFrames} frames, 24-bit WAV)`);
          return { filename, blob };
        });
        worker.terminate();
        recordingExportWorkerRef.current = null;
        resolve(files);
      };

      const handleError = (event: Event) => {
        worker.removeEventListener('message', handleMessage as EventListener);
        worker.removeEventListener('error', handleError as EventListener);
        worker.terminate();
        recordingExportWorkerRef.current = null;
        reject(event);
      };

      worker.addEventListener('message', handleMessage as EventListener);
      worker.addEventListener('error', handleError as EventListener);
      worker.postMessage({ type: 'finalize' });
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const session of Object.values(recorderTapSessionsRef.current)) {
        if (!session) continue;
        try {
          session.sourceNode.disconnect(session.tapNode);
        } catch { /* noop */ }
        try {
          session.tapNode.disconnect();
        } catch { /* noop */ }
        try {
          session.sinkNode.disconnect();
        } catch { /* noop */ }
      }
      recordingExportWorkerRef.current?.terminate();
      recordingExportWorkerRef.current = null;
    };
  }, []);

  // Recording functions
  const handleStartRecording = async () => {
    const ctx = audioEngine.getAudioContext();
    const limiterNode = audioEngine.getLimiterNode();
    if (!ctx || !limiterNode) {
      console.error('Audio context not available for recording');
      return;
    }
    
    // Must have at least one format selected
    if (!recordFormats.webm && !recordFormats.wav) {
      alert('Please select at least one recording format (WebM or WAV)');
      return;
    }

    const enabledStemIds = STEM_RECORD_TRACK_IDS.filter((trackId) => recordStems[trackId]);
    if (isMobileDevice() && (recordFormats.wav || enabledStemIds.length > 0)) {
      alert('Mobile recording is limited to the stereo WebM mix to avoid high CPU and memory use. Disable WAV and stem capture, or record on desktop.');
      return;
    }

    try {
      // WebM recording using MediaRecorder (if selected)
      if (recordFormats.webm) {
        const streamDest = ctx.createMediaStreamDestination();
        limiterNode.connect(streamDest);
        recordingStreamDestRef.current = streamDest;

        const mediaRecorder = new MediaRecorder(streamDest.stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 256000,
        });

        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(1000);
        mediaRecorderRef.current = mediaRecorder;
      }

      const trackIdsToCapture: RecordTrackId[] = [];
      if (recordFormats.wav) trackIdsToCapture.push('mix');
      trackIdsToCapture.push(...enabledStemIds);

      if (trackIdsToCapture.length > 0) {
        await ensureRecorderTapWorklet(ctx);
        const worker = ensureRecordingExportWorker();
        worker.postMessage({
          type: 'init',
          sampleRate: ctx.sampleRate,
          trackIds: trackIdsToCapture,
        });

        if (recordFormats.wav) {
          attachRecorderTap(ctx, 'mix', limiterNode, worker);
        }

        const recordableNodes = audioEngine.getRecordableBusNodes();
        for (const stemName of enabledStemIds) {
          const stemSource = recordableNodes[stemName];
          if (!stemSource?.node) {
            console.warn(`Stem node not available for ${stemName}`);
            continue;
          }
          attachRecorderTap(ctx, stemName, stemSource.node, worker, stemSource.outputIndex ?? 0);
          console.log(`Stem recording started for: ${stemName}`);
        }
      }
      
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      const formats = [recordFormats.webm && 'WebM', recordFormats.wav && 'WAV'].filter(Boolean).join(' + ');
      const stemCount = enabledStemIds.length;
      const stemInfo = stemCount > 0 ? ` + ${stemCount} stems` : '';
      console.log(`Recording started: ${formats}${stemInfo}`);
    } catch (err) {
      console.error('Failed to start recording:', err);
      await flushAndDetachRecorderTapSessions();
      recordingExportWorkerRef.current?.terminate();
      recordingExportWorkerRef.current = null;
      if (recordingStreamDestRef.current && limiterNode) {
        try {
          limiterNode.disconnect(recordingStreamDestRef.current);
        } catch { /* noop */ }
        recordingStreamDestRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch { /* noop */ }
      }
      mediaRecorderRef.current = null;
    }
  };

  const handleStopRecording = async () => {
    const limiterNode = audioEngine.getLimiterNode();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const filesToZip: Array<{ filename: string; blob: Blob }> = [];
    let webmFilePromise: Promise<{ filename: string; blob: Blob } | null> = Promise.resolve(null);

    if (recordFormats.webm && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      webmFilePromise = new Promise((resolve) => {
        mediaRecorderRef.current!.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
          if (recordingStreamDestRef.current && limiterNode) {
            try {
              limiterNode.disconnect(recordingStreamDestRef.current);
            } catch { /* noop */ }
            recordingStreamDestRef.current = null;
          }
          mediaRecorderRef.current = null;
          console.log('WebM prepared');
          resolve({ filename: `kessho-${timestamp}.webm`, blob });
        };
      });
      mediaRecorderRef.current.stop();
    } else if (recordingStreamDestRef.current && limiterNode) {
      try {
        limiterNode.disconnect(recordingStreamDestRef.current);
      } catch { /* noop */ }
      recordingStreamDestRef.current = null;
    }

    try {
      await flushAndDetachRecorderTapSessions();
      const [webmFile, wavFiles] = await Promise.all([
        webmFilePromise,
        finalizeRecordingWorkerFiles(timestamp),
      ]);

      if (webmFile) filesToZip.push(webmFile);
      filesToZip.push(...wavFiles);
      await downloadRecordingArchive(filesToZip, timestamp);
    } catch (error) {
      console.error('Failed to finalize recording:', error);
      recordingExportWorkerRef.current?.terminate();
      recordingExportWorkerRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
    console.log('Recording stopped');
  };

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useVisibleInterval(() => {
    const nextDuration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
    setRecordingDuration(prev => (prev === nextDuration ? prev : nextDuration));
  }, 1000, {
    enabled: isRecording,
    immediate: false,
  });

  // Save preset to file in presets folder
  const handleSavePreset = async () => {
    const name = prompt('Enter preset name:', `preset-${Date.now()}`);
    if (!name) return;
    
    // Convert dual slider ranges to a serializable format
    const dualRangesObj: Record<string, { min: number; max: number }> = {};
    Object.keys(sliderModes).forEach(key => {
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        dualRangesObj[key] = { min: range.min, max: range.max };
      }
    });
    
    // Build slider modes for serialization (only non-single modes)
    const modesObj: Record<string, SliderMode> = {};
    for (const [k, m] of Object.entries(sliderModes)) {
      if (m !== 'single') modesObj[k] = m;
    }

    const preset: SavedPreset = {
      name,
      timestamp: new Date().toISOString(),
      state: extractOptimizedStatePresetData(state) as unknown as SliderState,
      dualRanges: Object.keys(dualRangesObj).length > 0 ? dualRangesObj : undefined,
      sliderModes: Object.keys(modesObj).length > 0 ? modesObj : undefined,
      drumEvolveConfigs: drumEvolveConfigsRef.current,
      synthEvolveConfigs: synthEvolveConfigsRef.current,
      drumSubLaneStates: drumSubLaneStatesRef.current,
      synthSubLaneStates: synthSubLaneStatesRef.current,
      synthPitchBindingModes: synthPitchBindingModesRef.current,
    };

    if (usesCapacitorLocalPresetLibrary) {
      await saveCapacitorLocalStatePreset(preset);
      setSavedPresets(await loadCapacitorLocalStatePresets());
      setStatePresetName(name);
      setShowPresetList(true);
      return;
    }

    const success = await savePresetToFile(preset);
    if (success) {
      // Add to local list for immediate display
      setSavedPresets([...savedPresets, preset]);
    }
  };

  // Result type for lerpPresets - includes both state and dual ranges
  interface LerpResult {
    state: SliderState;
    dualRanges: DualSliderState;
    dualModes: Record<string, SliderMode>;
    // CoF morph visualization info
    morphCoFInfo?: {
      isMorphing: boolean;
      startRoot: number;       // Original starting root (captured at morph start)
      effectiveRoot: number;   // Current root during morph (stepping through CoF)
      targetRoot: number;      // Final destination root
      cofStep: number;         // Current CoF step relative to start
      totalSteps: number;      // Total steps in the journey
    };
  }

  // Lerp between two preset states based on morph position (0-100)
  // capturedStartRoot: if provided, use this as the starting root (for consistent morphing)
  // currentCofStep: fallback CoF drift step if capturedStartRoot not provided
  // direction: 'toB' (A→B, 0→100) or 'toA' (B→A, 100→0)
  const lerpPresets = useCallback((presetA: SavedPreset, presetB: SavedPreset, t: number, currentCofStep: number = 0, capturedStartRoot?: number, direction: 'toA' | 'toB' = 'toB'): LerpResult => {
    const stateA = { ...DEFAULT_STATE, ...normalizePresetForWeb(presetA.state) };
    const stateB = { ...DEFAULT_STATE, ...normalizePresetForWeb(presetB.state) };
    const result = { ...stateA };
    const tNorm = t / 100; // Normalize to 0-1
    
    // Handle rootNote via Circle of Fifths path
    // Direction determines which preset we're morphing FROM and TO:
    // - 'toB': morph A → B (slider 0→100), capturedStartRoot is A's effective root
    // - 'toA': morph B → A (slider 100→0), capturedStartRoot is B's effective root
    let fromRoot: number;
    let toRoot: number;
    let cofMorphT: number; // The t value to use for CoF path progression
    
    if (direction === 'toB') {
      // Morphing A → B: from A's root (or captured) to B's root
      fromRoot = capturedStartRoot !== undefined
        ? capturedStartRoot
        : (stateA.cofDriftEnabled 
            ? calculateDriftedRoot(stateA.rootNote, currentCofStep)
            : stateA.rootNote);
      toRoot = stateB.rootNote;
      cofMorphT = t; // 0→100 maps directly
    } else {
      // Morphing B → A: from B's root (or captured) to A's root
      fromRoot = capturedStartRoot !== undefined
        ? capturedStartRoot
        : (stateB.cofDriftEnabled 
            ? calculateDriftedRoot(stateB.rootNote, currentCofStep)
            : stateB.rootNote);
      toRoot = stateA.rootNote;
      cofMorphT = 100 - t; // 100→0 needs to become 0→100 for path progression
    }
    
    // Get the morphed root note stepping through CoF
    const { currentRoot, cofStep, totalSteps } = getMorphedRootNote(fromRoot, toRoot, cofMorphT);
    result.rootNote = currentRoot;
    
    // Scale transition: snap at 50% (or when we've completed the CoF journey)
    // For a musical feel, snap scale when we're halfway or past
    result.scaleMode = tNorm < 0.5 ? stateA.scaleMode : stateB.scaleMode;
    result.manualScale = tNorm < 0.5 ? stateA.manualScale : stateB.manualScale;
    
    // Build morph CoF info for visualization
    const morphCoFInfo = (fromRoot !== toRoot) ? {
      isMorphing: true,
      startRoot: fromRoot,      // Original starting root (captured at morph start)
      effectiveRoot: currentRoot,
      targetRoot: toRoot,
      cofStep,
      totalSteps
    } : undefined;
    
    // Compute interpolated dual ranges
    const dualRangesA = presetA.dualRanges || {};
    const dualRangesB = presetB.dualRanges || {};
    const rawModesA = presetA.sliderModes || {};
    const rawModesB = presetB.sliderModes || {};
    const resultDualRanges: DualSliderState = {};
    const resultDualModes: Record<string, SliderMode> = {};
    
    // Get all keys that have dual ranges in either preset
    const allDualKeys = new Set([
      ...Object.keys(dualRangesA),
      ...Object.keys(dualRangesB)
    ]);
    
    for (const keyStr of allDualKeys) {
      const key = keyStr as keyof SliderState;
      const rangeA = dualRangesA[keyStr];
      const rangeB = dualRangesB[keyStr];
      const info = getParamInfo(key);
      const fallbackValue = info ? (info.min + info.max) * 0.5 : 0;
      const valA = getSliderNumericValue(key, stateA[key]) ?? fallbackValue;
      const valB = getSliderNumericValue(key, stateB[key]) ?? fallbackValue;
      
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
        resultDualModes[key as string] = tNorm < 0.5
          ? (modeA || modeB || 'walk')
          : (modeB || modeA || 'walk');
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
        'granularReverbSend', 'granularLevel', 'granularReverbLPF', 'granularOutputLPF',
        'granularDelayASend', 'granularDelayBSend',
        'delayAGranularSend', 'delayBGranularSend',
        'granularPad1Send', 'granularPad2Send', 'granularLead1Send', 'granularLead2Send', 'granularPianoSend',
        'granularDrumSend', 'granularWavesSend', 'granularNatureSend', 'granularWaterSend', 'granularInsectsSend',
      ],
      leadEnabled: [
        'lead1Attack', 'lead1Decay', 'lead1Sustain', 'lead1Release',
        'lead2Attack', 'lead2Decay', 'lead2Sustain', 'lead2Release',
        'delayATime', 'delayAFeedback',
        'delayAMix', 'lead1Density',
        'lead1Octave', 'lead1OctaveRange',
        'leadVibratoDepth', 'leadVibratoRate',
        'leadGlide', 'lead1ReverbSend', 'lead2ReverbSend', 'delayAReverbSend',
        'lead1DelayASend', 'lead1DelayBSend', 'lead2DelayASend', 'lead2DelayBSend',
      ],
      pianoEnabled: [
        'pianoAttack', 'pianoDecay', 'pianoSustain', 'pianoHold', 'pianoRelease',
        'pianoLevel', 'pianoReverbSend', 'pianoDelayASend', 'pianoDelayBSend', 'granularPianoSend',
      ],
      synthEuclideanMasterEnabled: [
        'synthEuclideanTempo'
      ],
      oceanSampleEnabled: [
        'oceanFilterCutoff', 'oceanFilterResonance', 'oceanDelayASend', 'oceanDelayBSend', 'granularWavesSend', 'oceanSliceDuration', 'oceanSliceDensity'
      ],
      birdsEnabled: [
        'birdsLevel', 'birdsSliceDuration', 'birdsSliceDensity'
      ],
      birds2Enabled: [
        'birds2Level', 'birds2SliceDuration', 'birds2SliceDensity'
      ],
      frogsEnabled: [
        'frogsLevel', 'frogsSliceDuration', 'frogsSliceDensity'
      ],
    };
    
    // Determine which keys should be snapped (not morphed) based on parent boolean state
    const keysToSnap = new Set<keyof SliderState>();
    for (const [parentKey, childKeys] of Object.entries(parentChildMap)) {
      const parentA = stateA[parentKey as keyof SliderState];
      const parentB = stateB[parentKey as keyof SliderState];
      // If either preset has the parent OFF, snap the children instead of morphing
      if (!parentA || !parentB) {
        for (const childKey of childKeys) {
          keysToSnap.add(childKey);
        }
      }
    }
    
    // Interpolate all numeric values (except those that should snap)
    const numericKeys: (keyof SliderState)[] = [
      'masterVolume', 'synthLevel', 'pad2Level', 'granularLevel', 'pad1ReverbSend', 'pad2ReverbSend', 'granularReverbSend',
      'pad1DelayASend', 'pad1DelayBSend', 'pad2DelayASend', 'pad2DelayBSend', 'lead1DelayASend', 'lead1DelayBSend', 'lead2DelayASend', 'lead2DelayBSend',
      'pianoLevel', 'pianoReverbSend', 'pianoDelayASend', 'pianoDelayBSend',
      'drumDelayASend', 'drumDelayBSend', 'delayAToBSend', 'delayAGranularSend', 'delayBGranularSend',
      'granularDelayASend', 'granularDelayBSend',
      'granularPad1Send', 'granularPad2Send', 'granularLead1Send', 'granularLead2Send', 'granularPianoSend',
      'granularDrumSend', 'granularWavesSend', 'granularNatureSend', 'granularWaterSend', 'granularInsectsSend',
      'drumReverbSend', 'oceanReverbSend', 'natureLevel', 'natureReverbSend', 'waterReverbSend', 'insectsSharedLevel', 'insectsReverbSend',
      'oceanDelayASend', 'oceanDelayBSend', 'natureDelayASend', 'natureDelayBSend', 'waterDelayASend', 'waterDelayBSend', 'insDelayASend', 'insDelayBSend',
      'granularReverbLPF', 'granularOutputLPF',
      'lead1ReverbSend', 'lead2ReverbSend', 'delayAReverbSend', 'reverbLevel', 'randomness', 'tension',
      'chordRate', 'voicingSpread', 'waveSpread', 'detune', 'synthAttack', 'synthDecay',
      'synthSustain', 'synthRelease', 'synthVoiceMask', 'synthOctave', 'hardness',
      'filterCutoffMin', 'filterCutoffMax', 'filterResonance', 'filterQ', 'filterSlope', 'filterKeyTracking',
      'warmth', 'presence', 'reverbDecay', 'reverbSize', 'reverbDiffusion',
      'reverbModulation', 'predelay', 'damping', 'width',
      'reverbShimmer', 'reverbShimmerPitch', 'reverbSlowModRate', 'reverbSlowModDepth',
      'reverbReverse', 'reverbReverseLength',
      'grainProbability', 'grainSize',
      'density', 'spray', 'jitter', 'pitchSpread', 'stereoSpread', 'feedback',
      'wetHPF', 'wetLPF', 'leadLevel', 'lead1Level', 'lead2Level', 'lead1Attack', 'lead1Decay', 'lead1Sustain', 'lead1Release',
      'lead1PostLPF', 'lead1PostLPFKeyTracking', 'lead2PostLPF', 'lead2PostLPFKeyTracking',
      'lead2Attack', 'lead2Decay', 'lead2Sustain', 'lead2Release',
      'pianoAttack', 'pianoDecay', 'pianoSustain', 'pianoHold', 'pianoRelease', 'pianoPostLPF',
      'delayATime', 'delayAFeedback',
      'delayAMix', 'lead1Density', 'lead1Octave',
      'lead1OctaveRange',
      'leadVibratoDepth', 'leadVibratoRate',
      'leadGlide', 'synthEuclideanTempo',
      'oceanSampleLevel', 'oceanFilterCutoff', 'oceanFilterResonance', 'oceanSliceDuration', 'oceanSliceDensity',
      'birdsLevel', 'birdsSliceDuration', 'birdsSliceDensity',
      'birds2Level', 'birds2SliceDuration', 'birds2SliceDensity',
      'frogsLevel', 'frogsSliceDuration', 'frogsSliceDensity',
      'natureLevel', 'natureReverbSend', 'natureDelayASend', 'natureDelayBSend', 'granularNatureSend',
      'cofDriftRate', 'cofDriftRange',
      // Drum morph positions - should interpolate when master morph changes
      'drumSubMorph', 'drumKickMorph', 'drumClickMorph',
      'drumBeepHiMorph', 'drumBeepLoMorph', 'drumNoiseMorph', 'drumMembraneMorph',
      // Drum voice params - should interpolate when master morph changes
      'drumLevel', 'drumSubFreq', 'drumSubDecay', 'drumSubLevel', 'drumSubTone',
      'drumKickFreq', 'drumKickPitchEnv', 'drumKickPitchDecay', 'drumKickDecay', 'drumKickLevel', 'drumKickClick',
      'drumClickDecay', 'drumClickFilter', 'drumClickResonance', 'drumClickLevel', 'drumClickTone', 'drumClickPitch', 'drumClickPitchEnv',
      'drumBeepHiFreq', 'drumBeepHiAttack', 'drumBeepHiDecay', 'drumBeepHiTone', 'drumBeepHiLevel',
      'drumBeepLoFreq', 'drumBeepLoAttack', 'drumBeepLoDecay', 'drumBeepLoTone', 'drumBeepLoLevel',
      'drumNoiseFilterFreq', 'drumNoiseFilterQ', 'drumNoiseAttack', 'drumNoiseDecay', 'drumNoiseLevel',
      // Pad Synth 2
      'pad2Attack', 'pad2Decay', 'pad2Sustain', 'pad2Release', 'pad2Octave',
      'pad2Hardness', 'pad2Warmth', 'pad2Presence', 'pad2OscMix',
      'pad2FilterCutoffMin', 'pad2FilterCutoffMax', 'pad2FilterResonance', 'pad2FilterQ', 'pad2FilterSlope', 'pad2FilterKeyTracking',
      'pad2OscAOctave', 'pad2OscADetune', 'pad2OscALevel',
      'pad2OscBOctave', 'pad2OscBDetune', 'pad2OscBLevel',
      'pad2SubOctave', 'pad2SubLevel', 'pad2NoiseLevel',
      'pad2FilterBCutoff', 'pad2FilterBResonance', 'pad2FilterBQ',
      'pad2Lfo1Rate', 'pad2Lfo1Depth', 'pad2Lfo2Rate', 'pad2Lfo2Depth',
      'pad2ModEnvAttack', 'pad2ModEnvDecay', 'pad2ModEnvSustain', 'pad2ModEnvRelease', 'pad2ModEnvDepth',
      'pad2Morph', 'pad2MorphSpeed', 'pad2VoiceAssign',
    ];
    
    for (const key of numericKeys) {
      const valA = stateA[key];
      const valB = stateB[key];
      if (typeof valA === 'number' && typeof valB === 'number') {
        // If this key should snap (parent is off), snap at 50% instead of morphing
        if (keysToSnap.has(key)) {
          (result as Record<string, unknown>)[key] = tNorm < 0.5 ? valA : valB;
        } else {
          (result as Record<string, unknown>)[key] = valA + (valB - valA) * tNorm;
        }
      }
    }
    
    // Snap discrete values at 50% (scaleMode and manualScale handled above with rootNote)
    // Note: reverbQuality is excluded - it's a user preference, not a musical parameter
    const discreteKeys: (keyof SliderState)[] = [
      'seedWindow', 'filterType', 'reverbEngine', 'reverbType', 'grainPitchMode', 'cofDriftDirection',
      // Drum preset names and discrete settings should snap at 50%
      'drumSubPresetA', 'drumSubPresetB', 'drumKickPresetA', 'drumKickPresetB',
      'drumClickPresetA', 'drumClickPresetB', 'drumBeepHiPresetA', 'drumBeepHiPresetB',
      'drumBeepLoPresetA', 'drumBeepLoPresetB', 'drumNoisePresetA', 'drumNoisePresetB',
      'drumMembranePresetA', 'drumMembranePresetB',
      'drumNoiseFilterType',
      // Pad Synth 2 discrete
      'pad2FilterType', 'pad2OscAWave', 'pad2OscBWave', 'pad2SubWave', 'pad2NoiseType',
      'pad2FilterBType', 'pad2FilterRouting',
      'pad2Lfo1Wave', 'pad2Lfo1Dest', 'pad2Lfo2Wave', 'pad2Lfo2Dest',
      'pad2ModEnvDest', 'pad2PresetA', 'pad2PresetB',
    ];
    for (const key of discreteKeys) {
      (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
    }
    
    // Snap boolean values at 50% (except engine toggles and cofDriftEnabled which have special handling)
    const boolKeys: (keyof SliderState)[] = [
      'lead1UseCustomAdsr', 'lead2UseCustomAdsr', 'synthEuclideanMasterEnabled', 'synthEuclid1Enabled', 'synthEuclid2Enabled',
      'synthEuclid3Enabled', 'synthEuclid4Enabled',
      // Drum synth booleans
      'drumSubMorphAuto', 'drumKickMorphAuto', 'drumClickMorphAuto',
      'drumBeepHiMorphAuto', 'drumBeepLoMorphAuto', 'drumNoiseMorphAuto', 'drumMembraneMorphAuto',
      // Pad Synth 2 booleans
      'pad2Enabled', 'pad2SubEnabled', 'pad2FilterBEnabled', 'pad2ModEnvEnabled', 'pad2MorphAuto',
    ];
    for (const key of boolKeys) {
      (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
    }
    
    // Special handling for engine toggles and cofDriftEnabled:
    // - Off → On: Turn ON immediately when leaving the "off" endpoint (engine fades in via level morph from 0)
    // - On → Off: Keep ON until arriving at the "off" endpoint (engine fades out via level morph to 0)
    const atEndpointA = isAtEndpoint0(t, true);
    const atEndpointB = isAtEndpoint1(t, true);
    
    const engineToggleKeys: (keyof SliderState)[] = [
      'cofDriftEnabled', 'granularEnabled', 'leadEnabled', 'drumEnabled',
      'oceanSampleEnabled', 'birdsEnabled', 'birds2Enabled', 'frogsEnabled'
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
    
    return { state: result, dualRanges: resultDualRanges, dualModes: resultDualModes, morphCoFInfo };
  }, []);

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

  // Load preset into morph slot (A or B)
  const handleLoadPresetToSlot = useCallback((preset: SavedPreset, slot: 'a' | 'b') => {
    // Mark that user has loaded a preset (disables auto-load on first play)
    hasLoadedPresetRef.current = true;
    
    // Check for iOS-only settings and warn user
    const warnings = checkPresetCompatibility(preset);
    if (warnings.length > 0) {
      console.warn('[Preset Compatibility]', warnings);
      setTimeout(() => {
          alert(`⚠️ Preset Compatibility Notice:\n\n${warnings.join('\n')}`);
      }, 100);
    }
    
    // Normalize iOS-only settings and migrate old *Min/*Max fields
    const migrated = migratePreset(preset);
    const normalizedPreset: SavedPreset = {
      ...migrated,
      state: normalizePresetForWeb(migrated.state)
    };
    
    // Convert current dualSliderRanges to serializable format
    const currentDualRanges: Record<string, { min: number; max: number }> = {};
    Object.keys(sliderModes).forEach(key => {
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        currentDualRanges[key as string] = { min: range.min, max: range.max };
      }
    });
    const currentSliderModes: Record<string, SliderMode> = { ...sliderModes };
    
    if (slot === 'a') {
      setMorphPresetA(normalizedPreset);
      // When loading A, capture current state for B to use as fallback
      // But only if B is not already loaded
      if (!morphPresetB) {
        morphCapturedStateRef.current = { ...state };
        morphCapturedDualRangesRef.current = currentDualRanges;
        morphCapturedSliderModesRef.current = currentSliderModes;
      }
      
      // Check if we should apply preset A values directly:
      // - Only apply if we're at endpoint 0 (near position 0)
      // - OR if no preset B is loaded yet (not in morph mode)
      // At endpoint 1 (position ~100), we should keep the current B values
      const atEndpoint0 = isAtEndpoint0(morphPosition, true);
      const shouldApplyPresetA = atEndpoint0 || !morphPresetB;
      
      if (shouldApplyPresetA) {
        // Apply the preset immediately when loading to slot A (and at or near position 0)
        const result = applyPreset(normalizedPreset, { migrate: false, currentState: state, normalize: s => s });
        setState(result.state);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        restoreEvolveConfigs(normalizedPreset);
      }
      // If in mid-morph, the useEffect will handle applying the interpolated state
    } else {
      setMorphPresetB(normalizedPreset);
      // When loading B, capture current state for A to use as fallback
      // But only if A is not already loaded
      if (!morphPresetA) {
        morphCapturedStateRef.current = { ...state };
        morphCapturedDualRangesRef.current = currentDualRanges;
        morphCapturedSliderModesRef.current = currentSliderModes;
      }

      // Check if we should apply preset B values directly:
      // - Only apply if we're at endpoint 1 (near position 100)
      // - OR if no preset A is loaded yet (not in morph mode)
      // At endpoint 0 (position ~0), we should keep the current A values
      const atEndpoint1 = isAtEndpoint1(morphPosition, true);
      const shouldApplyPresetB = atEndpoint1 || !morphPresetA;

      if (shouldApplyPresetB) {
        // Apply the preset immediately when loading to slot B (and at or near position 100)
        const result = applyPreset(normalizedPreset, { migrate: false, currentState: state, normalize: s => s });
        setState(result.state);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        restoreEvolveConfigs(normalizedPreset);
      }
    }
    setMorphLoadTarget(null);
  }, [state, morphPresetA, morphPresetB, sliderModes, dualSliderRanges, morphPosition]);

  // Reapply morph interpolation when a preset changes while in mid-morph
  // This ensures that if you're at position 50 and load a new preset A or B,
  // the state reflects the interpolated values, not just the raw preset
  const prevMorphPresetARef = useRef<SavedPreset | null>(null);
  const prevMorphPresetBRef = useRef<SavedPreset | null>(null);
  
  useEffect(() => {
    const presetAChanged = morphPresetA !== prevMorphPresetARef.current;
    const presetBChanged = morphPresetB !== prevMorphPresetBRef.current;
    
    prevMorphPresetARef.current = morphPresetA;
    prevMorphPresetBRef.current = morphPresetB;
    
    // Only reapply if a preset changed and we're in mid-morph
    if (!presetAChanged && !presetBChanged) return;
    if (!morphPresetA && !morphPresetB) return;
    
    // Check if we're in mid-morph (not at endpoints) using shared utility
    // Main morph uses 0-100 scale
    if (!isInMidMorph(morphPosition, true)) return;
    
    // Reapply the morph at current position
    const fallbackState = morphCapturedStateRef.current || DEFAULT_STATE;
    const fallbackDualRanges = morphCapturedDualRangesRef.current || undefined;
    const fallbackSliderModes = morphCapturedSliderModesRef.current || undefined;
    const effectiveA: SavedPreset = morphPresetA || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges, sliderModes: fallbackSliderModes };
    const effectiveB: SavedPreset = morphPresetB || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges, sliderModes: fallbackSliderModes };
    
    // Determine direction based on which preset changed
    const direction = morphDirectionRef.current || 'toB';
    const morphResult = lerpPresets(effectiveA, effectiveB, morphPosition, engineState.cofCurrentStep, morphCapturedStartRootRef.current ?? undefined, direction);
    
    // Preserve user preference keys (like reverbQuality) that shouldn't change with morphing
    const stateWithPrefs = { ...morphResult.state };
    for (const key of USER_PREFERENCE_KEYS) {
      (stateWithPrefs as Record<string, unknown>)[key] = state[key];
    }
    
    // Apply the interpolated state
    setState(prev => ({ ...prev, ...stateWithPrefs }));
    audioEngine.updateParams(stateWithPrefs);
    
    // Apply interpolated dual ranges — merge (don't wipe modes unrelated to morph)
    setSliderModes(prev => {
      const next: Record<string, SliderMode> = {};
      // Keep modes for keys NOT managed by the morph interpolation
      for (const [key, mode] of Object.entries(prev)) {
        if (!(key in morphResult.dualModes)) {
          next[key] = mode;
        }
      }
      // Add morph-interpolated modes (skip 'single' — no need to store them)
      for (const [key, mode] of Object.entries(morphResult.dualModes)) {
        if (mode !== 'single') {
          next[key] = mode;
        }
      }
      return next;
    });
    setDualSliderRanges(prev => {
      const next: typeof prev = {};
      // Keep ranges for keys NOT managed by the morph
      for (const [key, range] of Object.entries(prev)) {
        if (!(key in morphResult.dualModes)) {
          next[key as keyof SliderState] = range;
        }
      }
      // Add morph ranges (only effectively dual ones)
      for (const [key, range] of Object.entries(morphResult.dualRanges)) {
        next[key as keyof SliderState] = range;
      }
      return next;
    });
    
  }, [morphPresetA, morphPresetB, morphPosition, lerpPresets, engineState.cofCurrentStep]);

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
      kick: { a: 'drumKickPresetA', b: 'drumKickPresetB', morph: 'drumKickMorph' },
      click: { a: 'drumClickPresetA', b: 'drumClickPresetB', morph: 'drumClickMorph' },
      beepHi: { a: 'drumBeepHiPresetA', b: 'drumBeepHiPresetB', morph: 'drumBeepHiMorph' },
      beepLo: { a: 'drumBeepLoPresetA', b: 'drumBeepLoPresetB', morph: 'drumBeepLoMorph' },
      noise: { a: 'drumNoisePresetA', b: 'drumNoisePresetB', morph: 'drumNoiseMorph' },
      membrane: { a: 'drumMembranePresetA', b: 'drumMembranePresetB', morph: 'drumMembraneMorph' },
    };
    
    for (const voice of drumVoices) {
      const keys = presetKeys[voice];
      const currentState = stateRef.current; // Read current state from ref
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
      const morphedParams = applyMorphToState(currentState, voice);
      setState(prev => ({ ...prev, ...morphedParams }));
      
      // Also reapply dual range interpolation if there are overrides
      const currentValues: Record<string, number> = {};
      const overrides = getDrumMorphDualRangeOverrides(voice);
      for (const param of Object.keys(overrides)) {
        const stateVal = currentState[param as keyof SliderState];
        if (typeof stateVal === 'number') {
          currentValues[param] = stateVal;
        }
      }
      
      const interpolatedRanges = interpolateDrumMorphDualRanges(voice, morphValue, currentValues);
      
      for (const [param, interpState] of Object.entries(interpolatedRanges)) {
        const paramKey = param as keyof SliderState;
        
        if (interpState.isDualMode && interpState.range) {
          setSliderModes(prev => ({...prev, [paramKey as string]: prev[paramKey as string] ?? 'sampleHold'}));
          setDualSliderRanges(prev => ({ ...prev, [paramKey]: interpState.range! }));
        } else {
          setSliderModes(prev => {
            const next = { ...prev };
            delete next[paramKey as string];
            return next;
          });
          setDualSliderRanges(prev => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [paramKey]: _, ...rest } = prev;
            return rest as typeof prev;
          });
        }
      }
    }
  }, [drumPresetFingerprint]); // Only re-run when drum preset names actually change

  // Handle morph slider change
  const handleMorphPositionChange = useCallback((newPosition: number) => {
    setMorphPosition(newPosition);
    
    // Inline apply morph to ensure state updates correctly
    if (!morphPresetA && !morphPresetB) return;
    
    const fallbackState = morphCapturedStateRef.current || DEFAULT_STATE;
    const fallbackDualRanges = morphCapturedDualRangesRef.current || undefined;
    const fallbackSliderModes = morphCapturedSliderModesRef.current || undefined;
    const effectiveA: SavedPreset = morphPresetA || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges, sliderModes: fallbackSliderModes };
    const effectiveB: SavedPreset = morphPresetB || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges, sliderModes: fallbackSliderModes };
    
    if (morphPresetA && morphPresetB && morphPresetA.name === morphPresetB.name) return;
    
    // Detect morph direction and capture starting root when leaving an endpoint
    const wasAtA = lastMorphEndpointRef.current === 0;
    const wasAtB = lastMorphEndpointRef.current === 100;
    const leavingA = wasAtA && newPosition > 0;
    const leavingB = wasAtB && newPosition < 100;
    
    // Update endpoint tracking when reaching endpoints
    if (isAtEndpoint0(newPosition, true)) {
      lastMorphEndpointRef.current = 0;
      morphDirectionRef.current = null;
      morphCapturedStartRootRef.current = null;
    } else if (isAtEndpoint1(newPosition, true)) {
      lastMorphEndpointRef.current = 100;
      morphDirectionRef.current = null;
      morphCapturedStartRootRef.current = null;
    }
    
    // Capture starting root when first leaving an endpoint
    if (leavingA && morphCapturedStartRootRef.current === null) {
      // Starting morph from A towards B
      morphDirectionRef.current = 'toB';
      const stateA = { ...DEFAULT_STATE, ...effectiveA.state };
      morphCapturedStartRootRef.current = stateA.cofDriftEnabled
        ? calculateDriftedRoot(stateA.rootNote, engineState.cofCurrentStep)
        : stateA.rootNote;
    } else if (leavingB && morphCapturedStartRootRef.current === null) {
      // Starting morph from B towards A
      morphDirectionRef.current = 'toA';
      const stateB = { ...DEFAULT_STATE, ...effectiveB.state };
      morphCapturedStartRootRef.current = stateB.cofDriftEnabled
        ? calculateDriftedRoot(stateB.rootNote, engineState.cofCurrentStep)
        : stateB.rootNote;
    }
    
    const direction = morphDirectionRef.current || 'toB';
    const morphResult = lerpPresets(effectiveA, effectiveB, newPosition, engineState.cofCurrentStep, morphCapturedStartRootRef.current ?? undefined, direction);
    
    // Apply manual overrides with smooth blending toward destination
    // For each override, interpolate from override value to destination based on remaining morph distance
    const overrides = morphManualOverridesRef.current;
    const finalState = { ...morphResult.state };
    
    // Preserve user preference keys (like reverbQuality) that shouldn't change with morphing
    for (const key of USER_PREFERENCE_KEYS) {
      (finalState as unknown as Record<string, unknown>)[key] = state[key];
    }
    
    for (const [key, override] of Object.entries(overrides)) {
      const typedKey = key as keyof SliderState;
      const lerpedValue = morphResult.state[typedKey];
      if (typeof lerpedValue !== 'number') continue;
      
      // Determine destination based on morph direction
      const stateA = { ...DEFAULT_STATE, ...effectiveA.state };
      const stateB = { ...DEFAULT_STATE, ...effectiveB.state };
      const destValue = direction === 'toB' 
        ? (stateB[typedKey] as number) 
        : (stateA[typedKey] as number);
      const destPosition = direction === 'toB' ? 100 : 0;
      
      // Calculate blend factor: 0 at override position, 1 at destination
      const overridePos = override.morphPosition;
      const totalDistance = Math.abs(destPosition - overridePos);
      const currentDistance = Math.abs(newPosition - overridePos);
      
      if (totalDistance > 0) {
        // Moving toward destination
        const progressTowardDest = (direction === 'toB' && newPosition >= overridePos) ||
                                   (direction === 'toA' && newPosition <= overridePos);
        
        if (progressTowardDest) {
          // Blend from override value toward destination
          const blendFactor = Math.min(1, currentDistance / totalDistance);
          const blendedValue = override.value + (destValue - override.value) * blendFactor;
          (finalState as Record<string, unknown>)[key] = blendedValue;
        } else {
          // Moving away from destination (back toward origin) - keep override value
          (finalState as Record<string, unknown>)[key] = override.value;
        }
      }
    }
    
    setState(finalState);
    audioEngine.updateParams(finalState);
    
    // Update CoF morph visualization (clear at endpoints - we've arrived)
    const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);
    setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));
    
    // Reset CoF drift and clear manual overrides when reaching an endpoint
    if (atEndpoint) {
      // Only reset CoF drift if the target preset doesn't use drift,
      // to avoid a sudden root note jump that retriggers synths.
      const targetPreset = isAtEndpoint0(newPosition, true) ? effectiveA : effectiveB;
      const targetState = { ...DEFAULT_STATE, ...targetPreset.state };
      if (!targetState.cofDriftEnabled) {
        audioEngine.resetCofDrift();
      }
      morphManualOverridesRef.current = {};  // Clear temporary overrides
    }
    
    // Apply interpolated dual ranges — merge (don't wipe modes unrelated to morph)
    setSliderModes(prev => {
      const next: Record<string, SliderMode> = {};
      for (const [key, mode] of Object.entries(prev)) {
        if (!(key in morphResult.dualModes)) {
          next[key] = mode;
        }
      }
      for (const [key, mode] of Object.entries(morphResult.dualModes)) {
        if (mode !== 'single') {
          next[key] = mode;
        }
      }
      return next;
    });
    setDualSliderRanges(prev => {
      const next: typeof prev = {};
      for (const [key, range] of Object.entries(prev)) {
        if (!(key in morphResult.dualModes)) {
          next[key as keyof SliderState] = range;
        }
      }
      for (const [key, range] of Object.entries(morphResult.dualRanges)) {
        next[key as keyof SliderState] = range;
      }
      return next;
    });
    
    // Initialize indicator defaults for any new walk sliders while the engine syncs.
    const newWalkPositions: Record<string, number> = {};
    const morphWalkKeys = Object.keys(morphResult.dualModes);
    Object.entries(morphResult.dualModes).forEach(([key, mode]) => {
      if (mode === 'single') return; // Skip keys that collapsed to single
      newWalkPositions[key] = 0.5;
    });
    removeRuntimeWalkPositions(morphWalkKeys);
    mergeRuntimeWalkPositions(newWalkPositions);
  }, [morphPresetA, morphPresetB, lerpPresets, engineState.cofCurrentStep]);

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

  // ── PresetEntry-based Morph Slot Load Handlers ──
  // Convert L4 PresetEntry data → SavedPreset and feed into morph system
  const presetEntryToSavedPreset = useCallback((entry: PresetEntry, data: Record<string, unknown>): SavedPreset => {
    const version = entry.versions.find(v => v.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
    return migratePreset({
      name: entry.name,
      timestamp: new Date().toISOString(),
      state: normalizePresetForWeb(data as unknown as SliderState),
      ...(extractPresetVersionMetadata(version) ?? {}),
    });
  }, []);

  const handleLoadMorphA = useCallback((entry: PresetEntry, data: Record<string, unknown>) => {
    const preset = presetEntryToSavedPreset(entry, data);
    setMorphSlotAName(entry.name);
    if (!morphPresetB) {
      morphCapturedStateRef.current = { ...state };
      const currentDualRanges: Record<string, { min: number; max: number }> = {};
      Object.keys(sliderModes).forEach(key => {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) currentDualRanges[key] = { min: range.min, max: range.max };
      });
      morphCapturedDualRangesRef.current = currentDualRanges;
      morphCapturedSliderModesRef.current = { ...sliderModes };
    }
    setMorphPresetA(preset);
    const atEndpoint0 = isAtEndpoint0(morphPosition, true);
    if (atEndpoint0 || !morphPresetB) {
      const result = applyPreset(preset, { migrate: false, currentState: state, normalize: s => s });
      setState(result.state);
      setStatePresetName(entry.name);
      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
      restoreEvolveConfigs(preset);
    }
  }, [presetEntryToSavedPreset, morphPresetB, morphPosition, state, sliderModes, dualSliderRanges, applyDualRangesFromPreset, restoreEvolveConfigs]);

  const handleLoadMorphB = useCallback((entry: PresetEntry, data: Record<string, unknown>) => {
    const preset = presetEntryToSavedPreset(entry, data);
    setMorphSlotBName(entry.name);
    if (!morphPresetA) {
      morphCapturedStateRef.current = { ...state };
      const currentDualRanges: Record<string, { min: number; max: number }> = {};
      Object.keys(sliderModes).forEach(key => {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) currentDualRanges[key] = { min: range.min, max: range.max };
      });
      morphCapturedDualRangesRef.current = currentDualRanges;
      morphCapturedSliderModesRef.current = { ...sliderModes };
    }
    setMorphPresetB(preset);
    const atEndpoint1 = isAtEndpoint1(morphPosition, true);
    if (atEndpoint1 || !morphPresetA) {
      const result = applyPreset(preset, { migrate: false, currentState: state, normalize: s => s });
      setState(result.state);
      setStatePresetName(entry.name);
      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
      restoreEvolveConfigs(preset);
    }
  }, [presetEntryToSavedPreset, morphPresetA, morphPosition, state, sliderModes, dualSliderRanges, applyDualRangesFromPreset, restoreEvolveConfigs]);

  // ── Record Stems Toggle Callback (used by GlobalPage) ──
  const handleRecordStemsToggle = useCallback((key: string) => {
    setRecordStems(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  }, []);

  // Auto-cycle morph effect - continuous smooth animation
  const morphStartTimeRef = useRef<number>(Date.now());
  const lastMorphPosRef = useRef<number>(0);
  const lastMorphUiPosRef = useRef<number>(0);
  const manualPositionOnEnterRef = useRef<number>(0); // Track position when entering auto mode
  const cofCurrentStepRef = useRef<number>(0); // Current CoF step for morph calculations
  const morphPlayTimeoutRef = useRef<number | null>(null);
  
  // Keep CoF step ref up to date
  useEffect(() => { cofCurrentStepRef.current = engineState.cofCurrentStep; }, [engineState.cofCurrentStep]);
  
  // Phase tracking for auto-cycle (to avoid jumps when durations change)
  type MorphPhase = 'hold' | 'entry' | 'playA' | 'morphAB' | 'playB' | 'morphBA';
  const currentPhaseRef = useRef<MorphPhase>('hold');
  const phaseStartTimeRef = useRef<number>(Date.now());
  const phaseDurationRef = useRef<number>(0); // Duration locked at phase start
  
  useEffect(() => {
    if (morphMode !== 'auto' || !engineState.isRunning || (!morphPresetA && !morphPresetB)) {
      setMorphCountdown(null);
      return;
    }
    
    // Use state.phraseLength for harmony phrase duration
    // Use refs for phrase settings to avoid restarting effect when they change
    const pl = state.phraseLength ?? 16;
    const getPlayDuration = () => morphPlayPhrasesRef.current * pl * 1000;
    const getTransitionDuration = () => morphTransitionPhrasesRef.current * pl * 1000;
    const HOLD_DURATION = pl * 1000; // Hold current position for 1 phrase before transitioning
    
    // Capture the current manual position when entering auto mode
    morphStartTimeRef.current = Date.now();
    manualPositionOnEnterRef.current = morphPosition;
    lastMorphPosRef.current = -1; // Force first update
    lastMorphUiPosRef.current = -1;
    
    // Capture initial transition duration for the entry transition (won't change mid-transition)
    const initialTransitionDuration = getTransitionDuration();
    
    const fallbackState = morphCapturedStateRef.current || DEFAULT_STATE;
    const fallbackDualRanges = morphCapturedDualRangesRef.current || undefined;
    const fallbackSliderModes = morphCapturedSliderModesRef.current || undefined;
    const effectiveA: SavedPreset = morphPresetA || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges, sliderModes: fallbackSliderModes };
    const effectiveB: SavedPreset = morphPresetB || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges, sliderModes: fallbackSliderModes };
    const samePreset = morphPresetA && morphPresetB && morphPresetA.name === morphPresetB.name;
    
    // Calculate the target position to transition to after the hold period
    // If manual position is closer to A (0-50%), transition to A, else transition to B
    const startPos = manualPositionOnEnterRef.current;
    const targetAfterHold = startPos <= 50 ? 0 : 100;
    
    // If already at the target (within 5%), skip hold and transition phases
    const alreadyAtTarget = (targetAfterHold === 0 && startPos <= 5) || (targetAfterHold === 100 && startPos >= 95);
    
    // Initialize phase tracking
    if (alreadyAtTarget) {
      // Start directly in the appropriate play phase
      currentPhaseRef.current = targetAfterHold === 0 ? 'playA' : 'playB';
      phaseStartTimeRef.current = Date.now();
      phaseDurationRef.current = getPlayDuration();
    } else {
      currentPhaseRef.current = 'hold';
      phaseStartTimeRef.current = Date.now();
      phaseDurationRef.current = HOLD_DURATION;
    }
    
    // Helper to transition to next phase
    const transitionToPhase = (phase: MorphPhase) => {
      currentPhaseRef.current = phase;
      phaseStartTimeRef.current = Date.now();
      // Lock duration at phase start - won't change until next phase
      if (phase === 'playA' || phase === 'playB') {
        phaseDurationRef.current = getPlayDuration();
        // Clear captured start root and direction at play phases
        morphCapturedStartRootRef.current = null;
        morphDirectionRef.current = null;
        // Update endpoint tracking
        lastMorphEndpointRef.current = phase === 'playA' ? 0 : 100;
      } else if (phase === 'morphAB' || phase === 'morphBA') {
        phaseDurationRef.current = getTransitionDuration();
        // Set direction based on phase
        morphDirectionRef.current = phase === 'morphAB' ? 'toB' : 'toA';
        // Capture the starting root for this morph phase
        const sourcePreset = phase === 'morphAB' ? effectiveA : effectiveB;
        const sourceState = { ...DEFAULT_STATE, ...sourcePreset.state };
        morphCapturedStartRootRef.current = sourceState.cofDriftEnabled
          ? calculateDriftedRoot(sourceState.rootNote, cofCurrentStepRef.current)
          : sourceState.rootNote;
      } else if (phase === 'entry') {
        phaseDurationRef.current = initialTransitionDuration;
        // Set direction based on target
        morphDirectionRef.current = targetAfterHold === 100 ? 'toB' : 'toA';
        // Capture the starting root for entry transition
        const sourcePreset = startPos <= 50 ? effectiveA : effectiveB;
        const sourceState = { ...DEFAULT_STATE, ...sourcePreset.state };
        morphCapturedStartRootRef.current = sourceState.cofDriftEnabled
          ? calculateDriftedRoot(sourceState.rootNote, cofCurrentStepRef.current)
          : sourceState.rootNote;
      }
    };
    
    const cancelMorphPlayLoop = () => {
      if (morphPlayTimeoutRef.current !== null) {
        clearTimeout(morphPlayTimeoutRef.current);
        morphPlayTimeoutRef.current = null;
      }
    };

    const animate = () => {
      const now = Date.now();
      const phaseElapsed = now - phaseStartTimeRef.current;
      const phaseDuration = phaseDurationRef.current;
      const isVisible = document.visibilityState === 'visible';
      const currentState = stateRef.current;
      
      let newPos: number;
      let phaseName: string;
      let timeLeftInPhase: number;
      
      // Check for phase transitions and calculate position
      switch (currentPhaseRef.current) {
        case 'hold':
          newPos = startPos;
          phaseName = 'Hold';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('entry');
          }
          break;
          
        case 'entry':
          if (phaseDuration > 0) {
            const t = Math.min(1, phaseElapsed / phaseDuration);
            newPos = Math.round(startPos + (targetAfterHold - startPos) * t);
          } else {
            newPos = targetAfterHold;
          }
          phaseName = targetAfterHold === 0 ? 'Morph → A' : 'Morph → B';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase(targetAfterHold === 0 ? 'playA' : 'playB');
          }
          break;
          
        case 'playA':
          newPos = 0;
          phaseName = 'Playing A';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('morphAB');
          }
          break;
          
        case 'morphAB':
          {
            const t = phaseDuration > 0 ? Math.min(1, phaseElapsed / phaseDuration) : 1;
            newPos = Math.round(t * 100);
          }
          phaseName = 'Morph A→B';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('playB');
          }
          break;
          
        case 'playB':
          newPos = 100;
          phaseName = 'Playing B';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('morphBA');
          }
          break;
          
        case 'morphBA':
          {
            const t = phaseDuration > 0 ? Math.min(1, phaseElapsed / phaseDuration) : 1;
            newPos = Math.round((1 - t) * 100);
          }
          phaseName = 'Morph B→A';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('playA');
          }
          break;
          
        default:
          newPos = 0;
          phaseName = 'Unknown';
          timeLeftInPhase = 0;
      }
      
      const positionChanged = lastMorphPosRef.current !== newPos;
      const shouldSyncUi = isVisible && lastMorphUiPosRef.current !== newPos;

      if (positionChanged) {
        lastMorphPosRef.current = newPos;
      }

      let morphResult: ReturnType<typeof lerpPresets> | null = null;
      let stateWithPrefs: SliderState | null = null;
      if (!samePreset && (positionChanged || shouldSyncUi)) {
        const direction = morphDirectionRef.current || 'toB';
        morphResult = lerpPresets(effectiveA, effectiveB, newPos, cofCurrentStepRef.current, morphCapturedStartRootRef.current ?? undefined, direction);

        stateWithPrefs = { ...morphResult.state };
        for (const key of USER_PREFERENCE_KEYS) {
          (stateWithPrefs as unknown as Record<string, unknown>)[key] = currentState[key];
        }
      }

      if (positionChanged && stateWithPrefs) {
        audioEngine.updateParams(stateWithPrefs);
        if (isAtEndpoint0(newPos, true) || isAtEndpoint1(newPos, true)) {
          audioEngine.resetCofDrift();
        }
      }

      if (shouldSyncUi) {
        lastMorphUiPosRef.current = newPos;
        setMorphPosition(newPos);

        if (stateWithPrefs && morphResult) {
          setState(stateWithPrefs);

          const atEndpoint = isAtEndpoint0(newPos, true) || isAtEndpoint1(newPos, true);
          setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));

          setSliderModes(prev => {
            const next: Record<string, SliderMode> = {};
            for (const [key, mode] of Object.entries(prev)) {
              if (!(key in morphResult.dualModes)) {
                next[key] = mode;
              }
            }
            for (const [key, mode] of Object.entries(morphResult.dualModes)) {
              if (mode !== 'single') {
                next[key] = mode;
              }
            }
            return next;
          });
          setDualSliderRanges(prev => {
            const next: typeof prev = {};
            for (const [key, range] of Object.entries(prev)) {
              if (!(key in morphResult.dualModes)) {
                next[key as keyof SliderState] = range;
              }
            }
            for (const [key, range] of Object.entries(morphResult.dualRanges)) {
              next[key as keyof SliderState] = range;
            }
            return next;
          });

          const newWalkPositions: Record<string, number> = {};
          const morphWalkKeys = Object.keys(morphResult.dualModes);
          Object.entries(morphResult.dualModes).forEach(([key, mode]) => {
            if (mode === 'single') return;
            newWalkPositions[key] = 0.5;
          });
          removeRuntimeWalkPositions(morphWalkKeys);
          mergeRuntimeWalkPositions(newWalkPositions);
        }
      }
      
      if (isVisible) {
        const phrasesLeft = Math.ceil(timeLeftInPhase / ((currentState.phraseLength ?? 16) * 1000));
        setMorphCountdown(prev => (
          prev?.phase === phaseName && prev.phrasesLeft === phrasesLeft
            ? prev
            : { phase: phaseName, phrasesLeft }
        ));
      }
    };

    const scheduleNextTick = () => {
      if (!engineState.isRunning) return;
      morphPlayTimeoutRef.current = window.setTimeout(() => {
        morphPlayTimeoutRef.current = null;
        animate();
        scheduleNextTick();
      }, 100);
    };

    const handleVisibilityChange = () => {
      cancelMorphPlayLoop();
      animate();
      scheduleNextTick();
    };

    animate();
    scheduleNextTick();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelMorphPlayLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setMorphCountdown(null);
      setMorphCoFViz(null); // Clear CoF morph visualization
    };
  }, [morphMode, engineState.isRunning, morphPresetA, morphPresetB, lerpPresets]);

  // Load preset from list - modified to support morph slots in advanced mode
  const handleLoadPresetFromList = useCallback((preset: SavedPreset) => {
    // Activate snowflake on preset load
    if (!snowflakeActivated) setSnowflakeActivated(true);
    // Mark that user has loaded a preset (disables auto-load on first play)
    hasLoadedPresetRef.current = true;
    
    // If in advanced mode and a morph target is set, load to that slot
    if (uiMode === 'advanced' && morphLoadTarget) {
      handleLoadPresetToSlot(preset, morphLoadTarget);
      setShowPresetList(false);
      return;
    }
    
    // Capture current state BEFORE loading, then load to slot A
    morphCapturedStateRef.current = { ...state };
    // Also capture current dual ranges
    const currentDualRanges: Record<string, { min: number; max: number }> = {};
    Object.keys(sliderModes).forEach(key => {
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        currentDualRanges[key as string] = { min: range.min, max: range.max };
      }
    });
    morphCapturedDualRangesRef.current = currentDualRanges;
    morphCapturedSliderModesRef.current = { ...sliderModes };
    
    setMorphPresetA(preset);
    // Don't reset morph position - keep it where user had it
    
    // Check for iOS-only settings and warn user
    const warnings = checkPresetCompatibility(preset);
    if (warnings.length > 0) {
      console.warn('[Preset Compatibility]', warnings);
      // Show non-blocking warning after a short delay
      setTimeout(() => {
        alert(`⚠️ Preset Compatibility Notice:\n\n${warnings.join('\n')}`);
      }, 100);
    }
    
    // Check if we should apply preset A values directly:
    // - Only apply if we're at endpoint 0 (near position 0)
    // - OR if no preset B is loaded yet (not in morph mode)
    // At endpoint 1 (position ~100), we should keep the current B values
    const atEndpoint0 = isAtEndpoint0(morphPosition, true);
    const shouldApplyPresetA = atEndpoint0 || !morphPresetB;
    
    if (shouldApplyPresetA) {
      const result = applyPreset(preset, { currentState: state, normalize: normalizePresetForWeb });
      setState(result.state);
      setStatePresetName(preset.name);
      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
      restoreEvolveConfigs(result.preset);
    }
    // If in mid-morph, the useEffect will handle applying the interpolated state
    
    setShowPresetList(false);
  }, [uiMode, morphLoadTarget, handleLoadPresetToSlot, state, sliderModes, dualSliderRanges, morphPresetB, morphPosition, snowflakeActivated]);

  // Delete preset - just removes from UI list (can't delete files from browser)
  const handleDeletePreset = async (index: number) => {
    if (usesCapacitorLocalPresetLibrary) {
      const preset = savedPresets[index];
      if (!preset) return;
      if (!confirm(`Delete local preset "${preset.name}" from this device?`)) return;
      await deleteCapacitorLocalStatePreset(preset.name);
      setSavedPresets(await loadCapacitorLocalStatePresets());
      return;
    }

    const updatedPresets = savedPresets.filter((_, i) => i !== index);
    setSavedPresets(updatedPresets);
  };

  // Load preset from file (for importing)
  const handleLoadPreset = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      void (async () => {
        try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.state) {
          // Migrate, normalize, merge with defaults, and preserve user preferences
          const result = applyPreset(parsed, { currentState: state, updateEngine: false, resetCofDrift: false, normalize: normalizePresetForWeb });
          
          // Create the preset object
          const importedPreset: SavedPreset = {
            name: parsed.name || file.name.replace('.json', ''),
            timestamp: parsed.timestamp || new Date().toISOString(),
            state: result.state,
            dualRanges: result.preset.dualRanges,
            sliderModes: result.preset.sliderModes,
            drumEvolveConfigs: result.preset.drumEvolveConfigs,
            synthEvolveConfigs: result.preset.synthEvolveConfigs,
            drumSubLaneStates: result.preset.drumSubLaneStates,
            synthSubLaneStates: result.preset.synthSubLaneStates,
            synthPitchBindingModes: result.preset.synthPitchBindingModes,
          };

          if (usesCapacitorLocalPresetLibrary) {
            await saveCapacitorLocalStatePreset(importedPreset);
            setSavedPresets(await loadCapacitorLocalStatePresets());
          } else {
            // Add to preset list for display
            setSavedPresets(prev => [...prev, importedPreset]);
          }
          
          // In advanced mode, show dialog to choose slot A or B
          if (uiMode === 'advanced') {
            setPendingUploadPreset(importedPreset);
            setUploadSlotDialogOpen(true);
          } else {
            // In snowflake mode, just apply directly
            setState(result.state);
            setStatePresetName(importedPreset.name);
            audioEngine.updateParams(result.state);
            audioEngine.resetCofDrift();
            
            // Apply dual ranges and slider modes from migrated preset
            applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
            restoreEvolveConfigs(result.preset);
          }
        }
        } catch (err) {
          console.error('Failed to load preset:', err);
          alert('Failed to load preset. Invalid file format.');
        }
      })();
    };
    reader.readAsText(file);
    // Reset input so same file can be loaded again
    event.target.value = '';
  };

  // Handle slot choice from upload dialog
  const handleUploadSlotChoice = (slot: 'a' | 'b') => {
    if (!pendingUploadPreset) return;
    
    // Capture current state before loading
    morphCapturedStateRef.current = { ...state };
    const currentDualRanges: Record<string, { min: number; max: number }> = {};
    Object.keys(sliderModes).forEach(key => {
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        currentDualRanges[key as string] = { min: range.min, max: range.max };
      }
    });
    morphCapturedDualRangesRef.current = currentDualRanges;
    morphCapturedSliderModesRef.current = { ...sliderModes };
    
    handleLoadPresetToSlot(pendingUploadPreset, slot);
    
    // Close dialog and clear pending preset
    setUploadSlotDialogOpen(false);
    setPendingUploadPreset(null);
  };

  // ========================================================================
  // JOURNEY MODE CALLBACKS
  // ========================================================================
  
  // Journey mode: load a preset by name (used at journey start)
  const handleJourneyLoadPreset = useCallback(async (presetName: string) => {
    const preset = savedPresets.find(p => p.name === presetName);
    if (!preset) {
      console.warn('[Journey] Preset not found:', presetName);
      return;
    }
    
    console.log('[Journey] Loading preset:', presetName);
    
    // Mark journey as playing (locks sliders)
    setIsJourneyPlaying(true);
    
    // Load preset as preset A
    handleLoadPresetFromList(preset);
    
    // Reset morph position and direction for new journey
    setMorphPosition(0);
    setMorphPresetB(null);
    journeyMorphDirectionRef.current = 'toB'; // First morph will go A→B (0→100)
    
    // Update refs synchronously for animation loop
    journeyPresetARef.current = preset;
    journeyPresetBRef.current = null;
    journeyLastAppliedStateRef.current = preset.state;
    journeyLastDualModesRef.current = {};
    journeyLastDualRangesRef.current = {};
    journeyLastMorphPositionRef.current = 0;
    journeyLastMorphCoFVizRef.current = null;
    
    // Start audio engine if not already running
    if (!playbackIsRunning) {
      console.log('[Journey] Starting audio engine');
      try {
        if (nativeBackgroundAudioMode) {
          await startCapacitorNativePlayback(
            {
              state: preset.state,
              dualRanges: extractNativeDualRanges(dualSliderRanges),
            },
            {
              title: preset.name,
              artist: 'Kessho',
              album: 'Kessho Native',
              isLiveStream: true,
              isPlaying: true,
            },
          );
          setNativePlaybackState(true);
        } else {
          setupIOSMediaSession();
          await audioEngine.start(preset.state);
          connectMediaSessionToWebAudio();
        }
      } catch (err) {
        console.error('[Journey] Failed to start audio:', err);
      }
    }
  }, [savedPresets, handleLoadPresetFromList, playbackIsRunning, nativeBackgroundAudioMode, dualSliderRanges, audioEngine, setupIOSMediaSession, connectMediaSessionToWebAudio]);

  const getEarthTextureDebugState = useCallback(() => audioEngine.getEarthTextureDebugState(), []);

  const applyJourneyDualSnapshot = useCallback((
    nextDualModes: Record<string, SliderMode>,
    nextDualRanges: Partial<Record<keyof SliderState, DualSliderRange>>,
  ) => {
    setSliderModes((prev) => {
      const next: Record<string, SliderMode> = {};
      for (const [key, mode] of Object.entries(prev)) {
        if (!(key in nextDualModes)) {
          next[key] = mode;
        }
      }
      for (const [key, mode] of Object.entries(nextDualModes)) {
        if (mode !== 'single') {
          next[key] = mode;
        }
      }
      return next;
    });
    setDualSliderRanges((prev) => {
      const next: typeof prev = {};
      for (const [key, range] of Object.entries(prev)) {
        if (!(key in nextDualModes)) {
          next[key as keyof SliderState] = range;
        }
      }
      for (const [key, range] of Object.entries(nextDualRanges)) {
        if (range) {
          next[key as keyof SliderState] = range;
        }
      }
      return next;
    });
  }, []);

  const commitJourneyRuntimeState = useCallback(() => {
    const nextState = journeyLastAppliedStateRef.current;
    if (nextState) {
      setState(nextState);
    }
    applyJourneyDualSnapshot(journeyLastDualModesRef.current, journeyLastDualRangesRef.current);
    if (journeyLastMorphPositionRef.current !== null) {
      setMorphPosition(journeyLastMorphPositionRef.current);
    }
    setMorphCoFViz(journeyLastMorphCoFVizRef.current);
  }, [applyJourneyDualSnapshot]);

  const stopJourneyMorphPlayback = useCallback((commitRuntimeState = false) => {
    audioEngine.stopJourneyMorphClock();
    audioEngine.setJourneyMorphClockCallback(null);
    if (commitRuntimeState) {
      commitJourneyRuntimeState();
    }
  }, [audioEngine, commitJourneyRuntimeState]);

  // Journey mode: morph to a target preset over specified duration
  const handleJourneyMorphTo = useCallback((targetPresetName: string, durationPhrases: number) => {
    const preset = savedPresets.find(p => p.name === targetPresetName);
    if (!preset) {
      console.warn('[Journey] Target preset not found:', targetPresetName);
      return;
    }
    
    const direction = journeyMorphDirectionRef.current;
    console.log('[Journey] Morphing to:', targetPresetName, 'over', durationPhrases, 'phrases', 'direction:', direction);

    stopJourneyMorphPlayback(false);
    
    // Calculate duration in milliseconds using phrase-based timing
    // 1 phrase = phraseLength seconds (default 16s)
    const msPerPhrase = (state.phraseLength ?? 16) * 1000;
    const durationMs = durationPhrases * msPerPhrase;
    
    console.log('[Journey] Morph duration:', durationMs, 'ms (', durationPhrases, 'phrases x', (state.phraseLength ?? 16), 's)');
    
    // Determine start and end positions based on direction
    // toB: Load target into B, morph 0→100
    // toA: Load target into A, morph 100→0
    const startPosition = direction === 'toB' ? 0 : 100;
    const endPosition = direction === 'toB' ? 100 : 0;
    
    // Update refs SYNCHRONOUSLY before animation starts to avoid stale closures
    // The refs will be read by the animation loop
    if (direction === 'toB') {
      journeyPresetBRef.current = preset;
      setMorphPresetB(preset);
    } else {
      journeyPresetARef.current = preset;
      setMorphPresetA(preset);
    }
    
    // Capture both presets for use in animation loop (using refs for current values)
    const animPresetA = journeyPresetARef.current;
    const animPresetB = journeyPresetBRef.current;
    
    if (!animPresetA || !animPresetB) {
      console.warn('[Journey] Missing preset for morph. A:', animPresetA?.name, 'B:', animPresetB?.name);
      return;
    }
    
    // console.log('[Journey] Animation presets - A:', animPresetA.name, 'B:', animPresetB.name);
    
    const startTime = performance.now();
    let lastUIUpdate = 0;
    
    const animateMorph = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      
      // Ease-in-out curve for smoother morphing
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Interpolate from start to end position
      const rawPosition = startPosition + (endPosition - startPosition) * eased;
      // Round to 1 decimal place to avoid long decimal percentages
      const newPosition = Math.round(rawPosition * 10) / 10;
      
      // Apply lerp directly using captured presets (not stale closures)
      const morphResult = lerpPresets(
        animPresetA,
        animPresetB,
        newPosition,
        engineState.cofCurrentStep,
        undefined, // startRoot
        direction
      );
      
      // Preserve user preference keys (like reverbQuality) that shouldn't change with morphing
      // Use ref to read current state — avoids stale closure from useCallback
      const stateWithPrefs = { ...morphResult.state };
      const currentState = stateRef.current;
      for (const key of USER_PREFERENCE_KEYS) {
        (stateWithPrefs as Record<string, unknown>)[key] = currentState[key];
      }

      const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);
      const nextMorphCoFViz = atEndpoint ? null : (morphResult.morphCoFInfo || null);
      journeyLastAppliedStateRef.current = stateWithPrefs;
      journeyLastDualModesRef.current = morphResult.dualModes;
      journeyLastDualRangesRef.current = morphResult.dualRanges;
      journeyLastMorphPositionRef.current = newPosition;
      journeyLastMorphCoFVizRef.current = nextMorphCoFViz;

      // ALWAYS update audio engine at full frame rate for smooth audio
      audioEngine.updateParams(stateWithPrefs);
      
      // Throttle visible UI sync while the engine owns the actual morph clock.
      const shouldUpdateUI = now - lastUIUpdate >= 66 || progress >= 1;
      if (shouldUpdateUI) {
        lastUIUpdate = now;
        setMorphPosition(newPosition);
        setMorphCoFViz(nextMorphCoFViz);
        if (atEndpoint) {
          audioEngine.resetCofDrift();
        }
      }
      
      if (progress >= 1) {
        commitJourneyRuntimeState();
        // Morph complete - alternate direction for next morph
        journeyMorphDirectionRef.current = direction === 'toB' ? 'toA' : 'toB';
        stopJourneyMorphPlayback(false);
      }
    };

    audioEngine.setJourneyMorphClockCallback(animateMorph);
    audioEngine.startJourneyMorphClock();
  }, [savedPresets, stopJourneyMorphPlayback, state.phraseLength, lerpPresets, engineState.cofCurrentStep, audioEngine, commitJourneyRuntimeState]);
  
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

  // Cleanup journey animation on unmount
  useEffect(() => {
    return () => {
      stopJourneyMorphPlayback(false);
    };
  }, [stopJourneyMorphPlayback]);

  const handleRoutingSourceToggle = useCallback((sourceId: string, enabled: boolean) => {
    hasUserInteractedRef.current = true;
    setState((prev) => {
      let nextState: SliderState | null = null;
      const ensureNextState = () => {
        if (!nextState) nextState = { ...prev };
        return nextState;
      };
      const setFlag = <K extends keyof SliderState>(key: K, value: SliderState[K]) => {
        if (prev[key] === value) return;
        ensureNextState()[key] = value;
      };

      switch (sourceId) {
        case 'pad1':
          setFlag('padEnabled', enabled);
          break;
        case 'pad2':
          setFlag('pad2Enabled', enabled);
          break;
        case 'lead1':
          setFlag('leadEnabled', enabled);
          break;
        case 'lead2':
          setFlag('lead2Enabled', enabled);
          break;
        case 'piano':
          setFlag('pianoEnabled', enabled);
          break;
        case 'drums':
          setFlag('drumEnabled', enabled);
          break;
        case 'granular':
          setFlag('granularEnabled', enabled);
          break;
        case 'waves':
          setFlag('oceanSampleEnabled', enabled);
          break;
        case 'water':
          setFlag('waterEnabled', enabled);
          break;
        case 'insects':
          if (!enabled) {
            setFlag('insectsEnabled', false);
            setFlag('insects2Enabled', false);
          }
          break;
        case 'nature':
          if (!enabled) {
            setFlag('birdsEnabled', false);
            setFlag('birds2Enabled', false);
            setFlag('frogsEnabled', false);
          }
          break;
        case 'delayAOut':
          setFlag('delayAEnabled', enabled);
          break;
        case 'delayBOut':
          setFlag('granularDelayEnabled', enabled);
          break;
        default:
          break;
      }

      return nextState ?? prev;
    });
  }, []);

  // Render journey mode UI
  if (uiMode === 'journey') {
    return (
      <React.Suspense fallback={LAZY_PAGE_FALLBACK}>
        <JourneyModeView
          presets={savedPresets}
          journey={journey}
          onJourneyEnd={handleJourneyEnd}
          onStopAudio={handleStop}
          onShowSnowflake={() => setUiMode('snowflake')}
          onShowAdvanced={() => setUiMode('advanced')}
          isPlaying={playbackIsRunning}
        />
      </React.Suspense>
    );
  }

  // Render snowflake UI
  if (uiMode === 'snowflake') {
    return (
      <>
        {/* Splash Screen */}
        {showSplash && (() => {
          // Calculate circle size matching snowflake UI
          const smallerDimension = Math.min(windowSize.width, windowSize.height - 100);
          const isMobile = windowSize.width < 1024;
          const circleSize = isMobile 
            ? Math.max(250, Math.min(smallerDimension * 0.875, 650))
            : Math.max(200, Math.min(smallerDimension * 0.7, 550));
          
          return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            opacity: splashOpacity,
            transition: 'opacity 1s ease-in-out',
          }}>
            {/* Gradient circle behind text with fuzzy halo edge */}
            <div style={{
              position: 'absolute',
              width: circleSize * 1.5,
              height: circleSize * 1.5,
              borderRadius: '50%',
              background: `radial-gradient(circle at center, 
                ${splashGradient.inner} 0%, 
                ${splashGradient.mid} 30%, 
                ${splashGradient.outer} 50%,
                rgba(22, 33, 62, 0.6) 65%,
                rgba(15, 52, 96, 0.3) 75%,
                rgba(26, 26, 46, 0.1) 85%,
                transparent 95%)`,
              filter: 'blur(15px)',
              opacity: 0.85,
            }} />
            
            <span style={{
              fontSize: 'min(20vw, 120px)',
              color: 'white',
              fontWeight: 300,
              letterSpacing: '0.1em',
              textShadow: '0 0 40px rgba(255,255,255,0.3)',
              fontFamily: "'Zen Maru Gothic', sans-serif",
              position: 'relative',
              zIndex: 1,
            }}>
              結晶
            </span>
            <span style={{
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
            }}>
              kesshō
            </span>
          </div>
          );
        })()}
        {/* Hide SnowflakeUI until splash is done */}
        <div style={{ 
          opacity: showSplash ? 0 : 1,
          transition: 'opacity 0.5s ease-in-out',
          visibility: showSplash ? 'hidden' : 'visible',
        }}>
          <SnowflakeUI
            state={snowflakeActivated ? state : welcomeDisplayState}
            onChange={snowflakeActivated ? handleSliderChange : handleWelcomeSliderChange}
            onShowAdvanced={() => { if (!snowflakeActivated) setSnowflakeActivated(true); setUiMode('advanced'); }}
            onShowJourney={() => { if (!snowflakeActivated) setSnowflakeActivated(true); setUiMode('journey'); }}
            onTogglePlay={(playbackIsRunning || isJourneyPlaying) ? handleStop : handleStart}
            onLoadPreset={handleLoadPresetFromList}
            presets={savedPresets}
            isPlaying={playbackIsRunning || isJourneyPlaying}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            onStopRecording={handleStopRecording}
            journeyState={journey.state}
            journeyConfig={journey.config}
            isJourneyPlaying={isJourneyPlaying}
          />
        </div>
      </>
    );
  }

  // Render advanced UI
  return (
    <SliderHelpProvider activePage={activeTab}>
      <div className="app-container" style={{ ...styles.container, ...m?.container }}>
        <CpuOverlay />
        {/* Controls - centered */}
        <div className="app-controls" style={{ ...styles.controls, paddingTop: '12px', ...m?.controls }}>
        {!(playbackIsRunning || isJourneyPlaying) ? (
          <button
            style={{ ...styles.iconButton, ...styles.startButton, ...m?.iconButton }}
            onClick={handleStart}
            title="Start"
          >
            {TEXT_SYMBOLS.play}
          </button>
        ) : (
          <button
            style={{ ...styles.iconButton, ...styles.stopButton, ...m?.iconButton }}
            onClick={handleStop}
            title="Stop"
          >
            {TEXT_SYMBOLS.stop}
          </button>
        )}
        {/* Record button - can arm before playing */}
        <button
          style={{ 
            ...styles.iconButton, 
            ...(isRecording ? styles.recordingButton : isRecordingArmed ? styles.recordArmedButton : styles.recordButton),
            ...m?.iconButton,
            position: 'relative',
            opacity: 1,
          }}
          onClick={() => {
            if (isRecording) {
              void handleStopRecording();
            } else if (nativeBackgroundAudioMode) {
              return;
            } else if (playbackIsRunning) {
              void handleStartRecording();
            } else {
              handleArmRecording();
            }
          }}
          title={
            nativeBackgroundAudioMode
              ? 'Recording is unavailable in the Capacitor native audio spike'
              : isRecording
                ? `Recording ${formatRecordingTime(recordingDuration)} - Click to stop`
                : isRecordingArmed
                  ? 'Recording armed - will start with playback (click to disarm)'
                  : (playbackIsRunning ? 'Start Recording' : 'Arm Recording (will start with playback)')
          }
          disabled={nativeBackgroundAudioMode}
        >
          {TEXT_SYMBOLS.record}
          {isRecording && (
            <span style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              fontSize: '0.55rem',
              background: '#FF4444',
              color: 'white',
              padding: '1px 4px',
              borderRadius: '8px',
              fontWeight: 'bold',
            }}>
              {formatRecordingTime(recordingDuration)}
            </span>
          )}
        </button>
        {/* Save/Import preset buttons */}
        <button
          style={{ ...styles.iconButton, ...styles.presetButton, ...m?.iconButton }}
          onClick={handleSavePreset}
          title="Save Preset"
        >
          {TEXT_SYMBOLS.download}
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.presetButton, ...m?.iconButton }}
          onClick={() => {
            if (usesCapacitorLocalPresetLibrary) {
              setShowPresetList(prev => !prev);
            } else {
              fileInputRef.current?.click();
            }
          }}
          title={usesCapacitorLocalPresetLibrary ? 'Load Local Preset' : 'Import Preset'}
        >
          {TEXT_SYMBOLS.upload}
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.simpleButton, ...m?.iconButton }}
          onClick={() => setUiMode('journey')}
          title="Journey Mode"
        >
          ⟡
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.simpleButton, ...m?.iconButton }}
          onClick={() => setUiMode('snowflake')}
          title="Simple Mode"
        >
          ❄
        </button>
        <input
          ref={(el) => (fileInputRef.current = el)}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleLoadPreset}
        />
      </div>

      {/* Preset List */}
      {showPresetList && (
        <div className="app-preset-list" style={{ ...styles.presetListContainer, ...m?.presetList }}>
          <h4 style={{ margin: '0 0 10px', color: '#a855f7' }}>
            {usesCapacitorLocalPresetLibrary ? 'Local Presets (saved on this device)' : 'Presets (from /presets folder)'}
          </h4>
          {presetsLoading ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Loading presets...</p>
          ) : savedPresets.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
              {usesCapacitorLocalPresetLibrary
                ? 'No local presets saved on this device yet.'
                : 'No presets found. Save one to the presets folder.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {savedPresets.map((preset, index) => (
                <div key={index} style={styles.presetItem}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: '#e5e7eb' }}>{preset.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {new Date(preset.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <button
                    style={{ ...styles.button, ...styles.loadPresetBtn }}
                    onClick={() => handleLoadPresetFromList(preset)}
                  >
                    Load
                  </button>
                  <button
                    style={{ ...styles.button, ...styles.deletePresetBtn }}
                    onClick={() => handleDeletePreset(index)}
                    title={usesCapacitorLocalPresetLibrary ? 'Delete local preset from this device' : 'Remove from list (doesn\'t delete file)'}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Bar */}
      <div className="app-tab-bar" style={{ ...styles.tabBar, ...m?.tabBar }}>
        <HelpButton
          helpKey="tabGlobal"
          style={{
            ...styles.tab,
            ...(activeTab === 'global' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('global')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>{TEXT_SYMBOLS.target}</span>
          <span>Global</span>
        </HelpButton>
        <HelpButton
          helpKey="tabSynth"
          style={{
            ...styles.tab,
            ...(activeTab === 'synth' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('synth')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>∿</span>
          <span>Synth</span>
        </HelpButton>
        <HelpButton
          helpKey="tabDrums"
          style={{
            ...styles.tab,
            ...(activeTab === 'drums' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('drums')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>⋮⋮</span>
          <span>Drums</span>
        </HelpButton>
        <HelpButton
          helpKey="tabEarth"
          style={{
            ...styles.tab,
            ...(activeTab === 'earth' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('earth')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>{"\u2248"}</span>
          <span>Earth</span>
        </HelpButton>
        <HelpButton
          helpKey="tabGranular"
          style={{
            ...styles.tab,
            ...(activeTab === 'granular' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('granular')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>⊞</span>
          <span>Granular</span>
        </HelpButton>
        <HelpButton
          helpKey="tabDelay"
          style={{
            ...styles.tab,
            ...(activeTab === 'delay' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('delay')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>↭</span>
          <span>Delay</span>
        </HelpButton>
        <HelpButton
          helpKey="tabReverb"
          style={{
            ...styles.tab,
            ...(activeTab === 'reverb' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('reverb')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>◈</span>
          <span>Reverb</span>
        </HelpButton>
        <HelpButton
          helpKey="tabRouting"
          style={{
            ...styles.tab,
            ...(activeTab === 'routing' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('routing')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>▦</span>
          <span>Routing</span>
        </HelpButton>
        <HelpButton
          helpKey="tabSliderLab"
          style={{
            ...styles.tab,
            ...(activeTab === 'sliderLab' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('sliderLab')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>◫</span>
          <span>Lab</span>
        </HelpButton>
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
            sliderProps={sliderProps}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            SelectComponent={Select as unknown as React.ComponentType<Record<string, unknown>>}
            CircleOfFifthsComponent={CircleOfFifths as unknown as React.ComponentType<Record<string, unknown>>}
            engineState={engineState}
            onResetCofDrift={() => audioEngine.resetCofDrift()}
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
            isRecording={isRecording}
            recordFormats={recordFormats}
            recordStems={recordStems}
            recordingDuration={recordingDuration}
            formatRecordingTime={formatRecordingTime}
            onRecordFormatsChange={setRecordFormats}
            onRecordStemsChange={handleRecordStemsToggle}
            playbackTimerEnabled={playbackTimerEnabled}
            playbackTimerMinutes={playbackTimerMinutes}
            playbackTimerRemaining={playbackTimerRemaining}
            onTimerEnabledChange={setPlaybackTimerEnabled}
            onTimerMinutesChange={setPlaybackTimerMinutes}
            onTimerRemainingChange={setPlaybackTimerRemaining}
            sliderModes={sliderModes}
            dualSliderRanges={dualSliderRanges as Record<string, { min: number; max: number }>}
            getStatePresetSaveMetadata={getStatePresetSaveMetadata}
          />
        )}

        {/* === SYNTH + LEAD TAB === */}
        {activeTab === 'synth' && (
          <SynthPage
            state={state}
            isMobile={isMobile}
            expandedPanels={expandedPanels}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            onStateChange={setState}
            togglePanel={togglePanel}
            sliderProps={sliderProps}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            SelectComponent={Select as unknown as React.ComponentType<Record<string, unknown>>}
            CollapsiblePanelComponent={CollapsiblePanel as unknown as React.ComponentType<Record<string, unknown>>}
            isRunning={playbackIsRunning}
            getLeadMorphedParams={(lead: 1 | 2) => audioEngine.getLeadMorphedParams(lead)}
            initialViewMode={synthViewModeRef.current}
            onViewModeChange={(mode) => { synthViewModeRef.current = mode; }}
            initialStepOverrides={synthStepOverridesRef.current}
            initialSubLaneStates={synthSubLaneStatesRef.current}
            onSubLaneStatesChange={(states) => {
              synthSubLaneStatesRef.current = states;
              audioEngine.setSynthSubLaneEnabled(states.map(s => {
                const out: Record<string, boolean> = {};
                for (const [k, v] of Object.entries(s)) out[k] = v.enabled;
                return out;
              }));
            }}
            initialPitchSettings={synthPitchSettingsRef.current}
            onPitchSettingsChange={(settings) => { synthPitchSettingsRef.current = settings; audioEngine.setSynthPitchSettings(settings); }}
            initialPitchBindingModes={synthPitchBindingModesRef.current}
            onPitchBindingModesChange={(modes) => { synthPitchBindingModesRef.current = modes; audioEngine.setSynthPitchBindingModes(modes); }}
            initialKeyboardUiState={synthKeyboardUiStateRef.current}
            onKeyboardUiStateChange={(keyboardState) => { synthKeyboardUiStateRef.current = keyboardState; }}
            onRawStepOverridesChange={(raw) => {
              synthStepOverridesRef.current = raw;
            }}
            onStepOverridesChange={(overrides) => {
              audioEngine.setSynthStepOverrides({
                pitch: overrides.pitch,
                pitchDirection: overrides.pitchDirection,
                triggerToggles: overrides.triggerToggles,
                expression: overrides.expression,
                expressionDirection: overrides.expressionDirection,
                expressionRanges: overrides.expressionRanges,
                morph: overrides.morph,
                morphDirection: overrides.morphDirection,
                morphRanges: overrides.morphRanges,
                distance: overrides.distance,
                distanceDirection: overrides.distanceDirection,
                distanceRanges: overrides.distanceRanges,
                probability: overrides.probability,
                ratchet: overrides.ratchet,
                trigCondition: overrides.trigCondition,
              });
            }}
            onClockDivsChange={(divs) => audioEngine.setSynthEuclidClockDivs(divs)}
            onSwingsChange={(swings) => audioEngine.setSynthEuclidSwings(swings)}
            onEvolveConfigsChange={(configs) => { synthEvolveConfigsRef.current = configs; audioEngine.setSynthEuclidEvolveConfigs(configs); }}
            initialEvolveConfigs={synthEvolveConfigsRef.current}
            presetVersion={synthPresetVersion}
            resetEvolveHome={(laneIdx) => audioEngine.resetSynthEuclidLaneHome(laneIdx)}
            diceLane={(laneIdx, intensity) => audioEngine.diceSynthEuclidLane(laneIdx, intensity)}
            evolvedOverrides={synthEvolvedOverrides}
            onAuditionNote={(note) => {
              void audioEngine.auditionSynthNote(note, state);
            }}
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
            onStateChange={setState}
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
            expandedPanels={expandedPanels}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            onStateChange={setState}
            togglePanel={togglePanel}
            sliderProps={sliderProps}
            triggerVoice={(voice) => { void audioEngine.triggerDrumVoice(voice, 0.8, state); }}
            getAnalyserNode={(v) => audioEngine.getDrumVoiceAnalyser(v)}
            resetEvolveHome={(laneIdx) => audioEngine.resetDrumEuclidLaneHome(laneIdx)}
            diceLane={(laneIdx, intensity) => audioEngine.diceDrumEuclidLane(laneIdx, intensity)}
            evolvedOverrides={drumEvolvedOverrides}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            CollapsiblePanelComponent={CollapsiblePanel as unknown as React.ComponentType<Record<string, unknown>>}
            editingVoice={drumEditingVoice}
            onToggleEditing={(v) => setDrumEditingVoice(prev => prev === v ? null : v)}
            onEvolveConfigsChange={(configs) => { drumEvolveConfigsRef.current = configs; audioEngine.setDrumEuclidEvolveConfigs(configs); }}
            initialEvolveConfigs={drumEvolveConfigsRef.current}
            presetVersion={drumPresetVersion}
            onStepOverridesChange={(overrides) => { drumStepOverridesRef.current = overrides; audioEngine.setDrumStepOverrides(overrides); }}
            initialStepOverrides={drumStepOverridesRef.current}
            initialSubLaneStates={drumSubLaneStatesRef.current}
            onSubLaneStatesChange={(states) => {
              drumSubLaneStatesRef.current = states;
              audioEngine.setDrumSubLaneEnabled(states.map(s => {
                const out: Record<string, boolean> = {};
                for (const [k, v] of Object.entries(s)) out[k] = v.enabled;
                return out;
              }));
            }}
            initialViewMode={drumViewModeRef.current}
            onViewModeChange={(mode) => { drumViewModeRef.current = mode; }}
            onClockDivsChange={(divs) => audioEngine.setDrumEuclidClockDivs(divs)}
            onSwingsChange={(swings) => audioEngine.setDrumEuclidSwings(swings)}
            initialSeqSimpleState={drumSeqSimpleStateRef.current}
            onSeqSimpleStateChange={(s) => { drumSeqSimpleStateRef.current = s; }}
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
            onStateChange={setState}
            sliderProps={sliderProps}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
          />
        )}

        {/* === DELAY TAB === */}
        {activeTab === 'delay' && (
          <DelayPage
            state={state}
            isMobile={isMobile}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            onStateChange={setState}
            sliderProps={sliderProps}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            sliderModes={sliderModes}
            dualSliderRanges={dualSliderRanges}
            onDualStateChange={applyScopedDualRangesFromPreset}
          />
        )}

        {/* === ROUTING TAB === */}
        {activeTab === 'routing' && (
          <RoutingPage
            state={state}
            isMobile={isMobile}
            onParamChange={handleSliderChange}
            onColumnParamChange={handleRoutingColumnChange}
            onToggleSource={handleRoutingSourceToggle}
            sliderProps={sliderProps}
          />
        )}

        {/* === EARTH TAB === */}
        {activeTab === 'earth' && (
          <EarthPage
            state={state}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            onStateChange={setState}
            sliderProps={sliderProps}
            isRunning={playbackIsRunning}
            getEarthTextureDebugState={getEarthTextureDebugState}
          />
        )}

        {activeTab === 'sliderLab' && (
          <SliderLabPage
            isMobile={isMobile}
          />
        )}
        </React.Suspense>
      </div>


      {/* Debug Panel */}
      {activeTab !== 'sliderLab' && (
      <div className="app-debug-panel" style={{ ...styles.debugPanel, ...m?.debugPanel }}>
        <h3 style={{ ...styles.panelTitle, color: '#a855f7' }}>Debug Info</h3>
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>UTC Bucket:</span>
          <span style={styles.debugValue}>{engineState.currentBucket || '—'}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>Seed:</span>
          <span style={styles.debugValue}>
            {engineState.currentSeed ? engineState.currentSeed.toString(16).toUpperCase() : '—'}
          </span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>Scale Family:</span>
          <span style={styles.debugValue}>
            {engineState.harmonyState?.scaleFamily.name 
              ? `${NOTE_NAMES[state.cofDriftEnabled ? calculateDriftedRoot(state.rootNote, engineState.cofCurrentStep) : state.rootNote]} ${engineState.harmonyState.scaleFamily.name}`
              : '—'}
          </span>
        </div>
        {state.cofDriftEnabled && (
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>CoF Key:</span>
            <span style={styles.debugValue}>
              {NOTE_NAMES[
                calculateDriftedRoot(state.rootNote, engineState.cofCurrentStep)
              ]} (step: {engineState.cofCurrentStep > 0 ? '+' : ''}{engineState.cofCurrentStep})
            </span>
          </div>
        )}
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>Current Chord:</span>
          <span style={styles.debugValue}>
            {engineState.harmonyState
              ? formatChordDegrees(engineState.harmonyState.currentChord.midiNotes)
              : '—'}
          </span>
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
          <span style={styles.debugValue}>
            {engineState.isRunning && engineState.transportDebug
              ? `${engineState.transportDebug.nextPhraseBoundaryIn.toFixed(1)}s`
              : '—'}
          </span>
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
          <span style={styles.debugValue}>
            {engineState.transportDebug
              ? `${engineState.transportDebug.effectivePhraseSeconds.toFixed(2)}s`
              : '—'}
          </span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>Beat BPM:</span>
          <span style={styles.debugValue}>
            {engineState.transportDebug
              ? `${engineState.transportDebug.effectiveBpm.toFixed(1)}`
              : '—'}
          </span>
        </div>
        <div style={{ borderTop: '1px solid #333', margin: '8px 0', paddingTop: '8px' }}>
          <span style={{ color: '#a855f7', fontSize: '0.7rem', fontWeight: 'bold' }}>FX Ownership</span>
        </div>
        {(['delayA', 'delayB', 'granular', 'reverb'] as const).map((bus) => {
          const ownerState = engineState.fxOwners[bus];
          const ownerLabel = ownerState.owner ? FX_OWNER_LABELS[ownerState.owner] : '—';
          const originLabel = ownerState.lastOrigin ? FX_ORIGIN_LABELS[ownerState.lastOrigin] : null;
          return (
            <div key={bus} style={styles.debugRow}>
              <span style={styles.debugLabel}>{FX_BUS_LABELS[bus]}:</span>
              <span style={styles.debugValue}>
                {ownerState.owner
                  ? `${ownerLabel}${ownerState.active ? '' : ' (stale)'}${originLabel ? ` · ${originLabel}` : ''}`
                  : '—'}
              </span>
            </div>
          );
        })}

        {/* Tension / Chord Complexity */}
        {engineState.harmonyState && (
          <>
            <div style={{ borderTop: '1px solid #333', margin: '8px 0', paddingTop: '8px' }}>
              <span style={{ color: '#a855f7', fontSize: '0.7rem', fontWeight: 'bold' }}>Tension &amp; Chord Complexity</span>
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
              <span style={styles.debugValue}>
                {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][engineState.harmonyState.currentDegree] ?? '—'}
              </span>
            </div>
            <div style={styles.debugRow}>
              <span style={styles.debugLabel}>Tension Arc:</span>
              <span style={styles.debugValue}>
                {engineState.harmonyState.tensionArc.type}
                {engineState.harmonyState.tensionArc.phrasesRemaining > 0
                  ? ` (${engineState.harmonyState.tensionArc.phrasesRemaining} left)`
                  : ''}
              </span>
            </div>
          </>
        )}
        
        {/* Journey Debug Info */}
        {isJourneyPlaying && journey.config && (
          <>
            <div style={{ borderTop: '1px solid #333', margin: '8px 0', paddingTop: '8px' }}>
              <span style={{ color: '#a855f7', fontSize: '0.7rem', fontWeight: 'bold' }}>Journey Mode</span>
            </div>
            <div style={styles.debugRow}>
              <span style={styles.debugLabel}>Phase:</span>
              <span style={styles.debugValue}>{journey.state.phase}</span>
            </div>
            <div style={styles.debugRow}>
              <span style={styles.debugLabel}>Current:</span>
              <span style={styles.debugValue}>
                {journey.config.nodes.find(n => n.id === journey.state.currentNodeId)?.presetName || '—'}
              </span>
            </div>
            {journey.state.phase === 'morphing' && (
              <>
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>Morphing To:</span>
                  <span style={styles.debugValue}>
                    {journey.config.nodes.find(n => n.id === journey.state.nextNodeId)?.presetName || '—'}
                  </span>
                </div>
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>Morph Progress:</span>
                  <span style={styles.debugValue}>
                    {(journey.state.morphProgress * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>Morph Time Left:</span>
                  <span style={styles.debugValue}>
                    {((journey.state.resolvedMorphDuration * (1 - journey.state.morphProgress)) * (state.phraseLength ?? 16)).toFixed(1)}s
                  </span>
                </div>
              </>
            )}
            {journey.state.phase === 'playing' && (
              <>
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>Phrases Left:</span>
                  <span style={styles.debugValue}>
                    {Math.ceil(journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress))}
                  </span>
                </div>
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>Phrase Time Left:</span>
                  <span style={styles.debugValue}>
                    {((journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress)) * (state.phraseLength ?? 16)).toFixed(1)}s
                  </span>
                </div>
                <div style={styles.debugRow}>
                  <span style={styles.debugLabel}>Next Preset:</span>
                  <span style={styles.debugValue}>
                    {journey.config.nodes.find(n => n.id === journey.state.plannedNextNodeId)?.presetName || '—'}
                  </span>
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
      )}

      {/* Footer with kanji */}
      <div style={{
        textAlign: 'center',
        padding: '20px 0 30px 0',
        fontFamily: "'Zen Maru Gothic', sans-serif",
        fontSize: 'min(10vw, 48px)',
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 300,
        letterSpacing: '0.1em',
      }}>
        結晶
      </div>

      {/* Upload Slot Choice Dialog */}
      {uploadSlotDialogOpen && pendingUploadPreset && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #1a1a2e, #0f0f1a)',
            border: '1px solid #444',
            borderRadius: '12px',
            padding: '24px',
            width: 'min(320px, calc(100vw - 24px))',
            minWidth: 'min(280px, calc(100vw - 24px))',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            boxSizing: 'border-box',
          }}>
            <div style={{ fontSize: '1rem', marginBottom: '8px', color: '#e0e0e0' }}>
              Load to which slot?
            </div>
            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '20px' }}>
              "{pendingUploadPreset.name}"
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => handleUploadSlotChoice('a')}
                style={{
                  padding: '12px 32px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #064e3b, #022c22)',
                  border: '2px solid #10b981',
                  borderRadius: '8px',
                  color: '#6ee7b7',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #065f46, #064e3b)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #064e3b, #022c22)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Slot A
              </button>
              <button
                onClick={() => handleUploadSlotChoice('b')}
                style={{
                  padding: '12px 32px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #4c1d95, #2e1065)',
                  border: '2px solid #8b5cf6',
                  borderRadius: '8px',
                  color: '#a78bfa',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #5b21b6, #4c1d95)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #4c1d95, #2e1065)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Slot B
              </button>
            </div>
            <button
              onClick={() => {
                setUploadSlotDialogOpen(false);
                setPendingUploadPreset(null);
              }}
              style={{
                marginTop: '16px',
                padding: '8px 20px',
                fontSize: '0.8rem',
                background: 'transparent',
                border: '1px solid #666',
                borderRadius: '6px',
                color: '#888',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    </SliderHelpProvider>
  );
};

export default App;
