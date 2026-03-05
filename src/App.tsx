/**
 * Main App Component
 * 
 * Complete UI with all sliders, selects, and debug panel.
 * Wires up to audio engine with deterministic state management.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import {
  SliderState,
  SliderMode,
  DEFAULT_STATE,
  quantize,
  decodeStateFromUrl,
  getParamInfo,
  migratePreset,
  DRUM_MORPH_KEYS,
} from './ui/state';
import { DualSlider, DualSliderRange } from './ui/DualSlider';
import { audioEngine, EngineState } from './audio/engine';
import { SCALE_FAMILIES } from './audio/scales';
import { formatChordDegrees, getTimeUntilNextPhrase, calculateDriftedRoot, PHRASE_LENGTH } from './audio/harmony';
import { getPresetNames, DrumVoiceType as DrumPresetVoice } from './audio/drumPresets';
import { getPadPreset, morphPadPresets, PAD_PRESET_PARAM_KEYS } from './audio/padPresets';
import { morphWaterPresets, WATER_MORPH_PARAM_KEYS, INSECT_ENGINE_DEFAULTS } from './audio/waterPresets';
import { applyMorphToState, setDrumMorphOverride, clearDrumMorphEndpointOverrides, clearMidMorphOverrides, setDrumMorphDualRangeOverride, getDrumMorphDualRangeOverrides, interpolateDrumMorphDualRanges, drumMorphManager } from './audio/drumMorph';

// Maps pad-preset param keys (pad1 naming) → pad2 state keys
const PAD1_TO_PAD2_KEY: Record<string, string> = {
  padOscAWave: 'pad2OscAWave', padOscAOctave: 'pad2OscAOctave', padOscADetune: 'pad2OscADetune', padOscALevel: 'pad2OscALevel',
  padOscBWave: 'pad2OscBWave', padOscBOctave: 'pad2OscBOctave', padOscBDetune: 'pad2OscBDetune', padOscBLevel: 'pad2OscBLevel',
  padSubEnabled: 'pad2SubEnabled', padSubOctave: 'pad2SubOctave', padSubWave: 'pad2SubWave', padSubLevel: 'pad2SubLevel',
  padNoiseType: 'pad2NoiseType', padNoiseLevel: 'pad2NoiseLevel',
  hardness: 'pad2Hardness', warmth: 'pad2Warmth', presence: 'pad2Presence',
  filterType: 'pad2FilterType', filterCutoffMin: 'pad2FilterCutoffMin', filterCutoffMax: 'pad2FilterCutoffMax',
  filterResonance: 'pad2FilterResonance', filterQ: 'pad2FilterQ',
  padFilterBEnabled: 'pad2FilterBEnabled', padFilterBType: 'pad2FilterBType', padFilterBCutoff: 'pad2FilterBCutoff',
  padFilterBResonance: 'pad2FilterBResonance', padFilterBQ: 'pad2FilterBQ', padFilterRouting: 'pad2FilterRouting',
  synthAttack: 'pad2Attack', synthDecay: 'pad2Decay', synthSustain: 'pad2Sustain', synthRelease: 'pad2Release',
  padLfo1Rate: 'pad2Lfo1Rate', padLfo1Depth: 'pad2Lfo1Depth', padLfo1Wave: 'pad2Lfo1Wave', padLfo1Dest: 'pad2Lfo1Dest',
  padLfo2Rate: 'pad2Lfo2Rate', padLfo2Depth: 'pad2Lfo2Depth', padLfo2Wave: 'pad2Lfo2Wave', padLfo2Dest: 'pad2Lfo2Dest',
  padModEnvEnabled: 'pad2ModEnvEnabled', padModEnvAttack: 'pad2ModEnvAttack', padModEnvDecay: 'pad2ModEnvDecay',
  padModEnvSustain: 'pad2ModEnvSustain', padModEnvRelease: 'pad2ModEnvRelease',
  padModEnvDepth: 'pad2ModEnvDepth', padModEnvDest: 'pad2ModEnvDest',
};
import { isInMidMorph, isAtEndpoint0, isAtEndpoint1 } from './audio/morphUtils';
import { applyPreset, USER_PREFERENCE_KEYS } from './ui/presetUtils';
import { getLead4opFMPresetList } from './audio/lead4opfm';
import { getLooperPresetData, getLooperPresetSliderModes, getLooperPresetSeqConfig } from './ui/looper/looperPresets';
import SnowflakeUI from './ui/SnowflakeUI';
import { CpuOverlay } from './ui/CpuOverlay';
import { CircleOfFifths, getMorphedRootNote } from './ui/CircleOfFifths';
import CloudPresets from './ui/CloudPresets';
import { fetchPresetById, isCloudEnabled } from './cloud/supabase';
import JourneyModeView from './ui/JourneyModeView';
import { useJourney } from './ui/journeyState';
import DrumPage from './ui/drums/DrumPage';
import SynthPage from './ui/synth/SynthPage';
import LooperPage from './ui/looper/LooperPage';
import EarthPage from './ui/earth/EarthPage';
import ReverbPage from './ui/reverb/ReverbPage';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings } from './ui/sequencer/useEuclideanSequencer';
import type { ClockDivision } from './audio/drumSeqTypes';

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
    mediaSessionAudio.volume = 1.0; // Full volume since it carries actual audio
    
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

// Connect the audio element to Web Audio MediaStream (call after engine starts)
// Only on iOS/mobile to avoid double audio on desktop
const connectMediaSessionToWebAudio = () => {
  if (!mediaSessionAudio) return;
  
  // Only connect on iOS/mobile - desktop browsers play fine without this
  // and connecting causes double audio
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (!isIOS && !isMobile) {
    console.log('Skipping MediaStream audio element on desktop to avoid double audio');
    return;
  }
  
  const stream = audioEngine.getMediaStream();
  if (stream) {
    // Connect the Web Audio output to the HTML audio element
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
  leadLevel: 0.49,         // max 1
  drumLevel: 0.49,         // max 1
  oceanSampleLevel: 0.49,  // max 1
  // Arm widths (reverb send / secondary keys) — 75% visual width
  reverbDecay: 0.56,
  synthReverbSend: 0.56,
  granularReverbSend: 0.56,
  leadReverbSend: 0.56,
  drumReverbSend: 0.06,    // uses 0.1 exponent; 0.06^0.1 ≈ 0.75
  oceanFilterCutoff: 6800,  // normalized ≈ 0.56 of 40–12000
  // Enable all engines so the "disabled → 0" normalization doesn't zero them
  granularEnabled: true,
  looperEnabled: true,   // granularEnabled now controls looper engine
  leadEnabled: true,
  drumEnabled: true,
  oceanSampleEnabled: true,
  oceanWaveSynthEnabled: true,
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

  // ── Zero level for disabled engines ──
  // When an engine is off, force its mix level to 0 so no audio leaks through.
  if (merged.granularEnabled === false) {
    merged.granularLevel = 0;
    merged.looperEnabled = false;  // granularEnabled controls looper
  }
  if (merged.leadEnabled === false)           merged.leadLevel = 0;
  if (merged.drumEnabled === false)           merged.drumLevel = 0;
  if (merged.oceanSampleEnabled === false)    merged.oceanSampleLevel = 0;
  if (merged.oceanWaveSynthEnabled === false) merged.oceanWaveSynthLevel = 0;

  // ── Apply pad preset morph params ──
  // When loading a preset that specifies padPresetA/B, morph their params onto state
  const presetA = getPadPreset(merged.padPresetA);
  const presetB = getPadPreset(merged.padPresetB);
  if (presetA && presetB) {
    const morphed = morphPadPresets(presetA, presetB, merged.padMorph);
    for (const k of PAD_PRESET_PARAM_KEYS) {
      if (k in morphed) {
        (merged as unknown as Record<string, unknown>)[k] = morphed[k];
      }
    }
  }

  // ── Apply pad2 preset morph params ──
  const pad2A = getPadPreset(merged.pad2PresetA);
  const pad2B = getPadPreset(merged.pad2PresetB);
  if (pad2A && pad2B) {
    const morphed = morphPadPresets(pad2A, pad2B, merged.pad2Morph);
    for (const k of PAD_PRESET_PARAM_KEYS) {
      if (k in morphed) {
        const pad2Key = PAD1_TO_PAD2_KEY[k];
        if (pad2Key) {
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
      const knownFiles = ['Ethereal_Ambient.json', 'Dark_Textures.json', 'Bright_Bells.json', 'StringWaves.json', 'ZoneOut1.json', 'Gamelantest.json'];
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
  slider: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    appearance: 'none' as const,
    background: 'rgba(255, 255, 255, 0.2)',
    outline: 'none',
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

// Random walk state for each slider
interface RandomWalkState {
  position: number;  // Current position (0-1) within the range
  velocity: number;  // Current velocity
}
type RandomWalkStates = Partial<Record<keyof SliderState, RandomWalkState>>;

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
  unit?: string;
  logarithmic?: boolean;  // Use logarithmic scaling (for frequency params)
  onChange: (key: keyof SliderState, value: number) => void;
  // Dual slider props (optional)
  mode?: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
}

const Slider: React.FC<SliderProps> = ({ 
  label, 
  value, 
  paramKey, 
  unit, 
  logarithmic, 
  onChange,
  mode = 'single',
  dualRange,
  walkPosition,
  isFlashing,
  onCycleMode,
  onDualRangeChange,
}) => {
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
        mode={mode}
        dualRange={dualRange}
        walkPosition={walkPosition}
        isFlashing={isFlashing}
        onChange={onChange}
        onCycleMode={onCycleMode}
        onDualRangeChange={onDualRangeChange}
        groupStyle={styles.sliderGroup}
        labelStyle={styles.sliderLabel}
        sliderStyle={styles.slider}
      />
    );
  }
  
  // Fallback to simple slider (no dual mode support)
  const info = getParamInfo(paramKey);
  if (!info) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = parseFloat(e.target.value);
    if (logarithmic) {
      // Slider position is 0-1, convert to logarithmic frequency
      newValue = linearToLog(newValue, info.min, info.max);
    }
    onChange(paramKey, quantize(paramKey, newValue));
  };

  // For logarithmic sliders, convert value to 0-1 position
  const sliderValue = logarithmic 
    ? logToLinear(Math.max(info.min, Math.min(info.max, value)), info.min, info.max)
    : value;
  const sliderMin = logarithmic ? 0 : info.min;
  const sliderMax = logarithmic ? 1 : info.max;
  const sliderStep = logarithmic ? 0.001 : info.step;

  const displayValue = info.step < 1 ? value.toFixed(2) : Math.round(value);

  // Compute fill percentage for visual track gradient
  const fillPercent = sliderMax > sliderMin
    ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
    : 0;

  return (
    <div className="app-slider-group" style={styles.sliderGroup}>
      <div className="app-slider-label" style={styles.sliderLabel}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>{label}</span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          {displayValue}
          {unit || ''}
        </span>
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={sliderValue}
        onChange={handleChange}
        className="app-slider"
        style={{
          ...styles.slider,
          background: `linear-gradient(to right, rgba(160,200,220,0.5) 0%, rgba(160,200,220,0.5) ${fillPercent}%, rgba(255,255,255,0.2) ${fillPercent}%, rgba(255,255,255,0.2) 100%)`,
        }}
      />
    </div>
  );
};

// Select component
interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  return (
    <div className="app-slider-group" style={styles.sliderGroup}>
      <div className="app-slider-label" style={styles.sliderLabel}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
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

// Collapsible Panel component for mobile
interface CollapsiblePanelProps {
  id: string;
  title: string;
  titleColor?: string;
  titleStyle?: React.CSSProperties;
  headerAction?: React.ReactNode;
  isMobile: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  id,
  title,
  titleColor,
  titleStyle,
  headerAction,
  isMobile,
  isExpanded,
  onToggle,
  children,
}) => {
  const showContent = !isMobile || isExpanded;

  return (
    <div className="app-panel" style={styles.panel}>
      <h3
        className="app-panel-title"
        style={{
          ...styles.panelTitle,
          ...(titleColor ? { color: titleColor } : {}),
          ...titleStyle,
          cursor: isMobile ? 'pointer' : undefined,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: isMobile ? 'none' as const : undefined,
        }}
        onClick={isMobile ? () => onToggle(id) : undefined}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {title}
          {headerAction}
        </span>
        {isMobile && (
          <span style={{
            fontSize: '0.9rem',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            ▼
          </span>
        )}
      </h3>
      {showContent && children}
    </div>
  );
};

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
    
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
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
  const playbackTimerIntervalRef = useRef<number | null>(null);
  
  // Track if user has loaded a preset (for auto-loading default on first play)
  const hasLoadedPresetRef = useRef(false);
  // Track if user has interacted with any UI element (sliders, buttons, etc.)
  const hasUserInteractedRef = useRef(false);
  // Stem recording options (which buses to record pre-reverb)
  const [recordStems, setRecordStems] = useState({
    synth: false,
    lead: false,
    drums: false,
    waves: false,
    granular: false,
    reverb: false,
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  // WAV recording refs
  const wavBuffersRef = useRef<Float32Array[][]>([[], []]); // [leftChannels, rightChannels]
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  
  // Stem recording refs - separate buffers and processors for each stem
  type StemName = 'synth' | 'lead' | 'drums' | 'waves' | 'granular' | 'reverb';
  const stemBuffersRef = useRef<Record<StemName, Float32Array[][]>>({
    synth: [[], []],
    lead: [[], []],
    drums: [[], []],
    waves: [[], []],
    granular: [[], []],
    reverb: [[], []],
  });
  const stemProcessorsRef = useRef<Record<StemName, ScriptProcessorNode | null>>({
    synth: null,
    lead: null,
    drums: null,
    waves: null,
    granular: null,
    reverb: null,
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
  const [state, setState] = useState<SliderState>(() => {
    const urlState = decodeStateFromUrl(window.location.search);
    return normalizePresetForWeb(urlState || DEFAULT_STATE);
  });

  const [engineState, setEngineState] = useState<EngineState>({
    isRunning: false,
    harmonyState: null,
    currentSeed: 0,
    currentBucket: '',
    currentFilterFreq: 1000,
    currentLfoValue: 0,
    currentLfo2Value: 0,
    cofCurrentStep: 0,
  });

  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<number | null>(null);
  
  // Saved presets list - start empty, load from folder on mount
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [showPresetList, setShowPresetList] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(true);
  
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
  
  // Journey uses phrase-based timing (1 phrase = 16 seconds by default)
  const journey = useJourney(
    PHRASE_LENGTH,
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
      slider: { height: '20px' } as React.CSSProperties,
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

  // Active tab for Advanced UI panels
  type AdvancedTab = 'global' | 'synth' | 'drums' | 'reverb' | 'looper' | 'earth';
  const [activeTab, setActiveTab] = useState<AdvancedTab>('global');

  // Unified slider mode state: key → SliderMode ('single' | 'walk' | 'sampleHold')
  // Absent key means 'single'. dualSliderRanges stores ranges for walk/sampleHold modes.
  const [sliderModes, setSliderModes] = useState<Record<string, SliderMode>>({});
  const [dualSliderRanges, setDualSliderRanges] = useState<DualSliderState>({});
  const [randomWalkPositions, setRandomWalkPositions] = useState<Record<string, number>>({});
  const randomWalkRef = useRef<RandomWalkStates>({});

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
        newSliderModes[key] = presetSliderModes?.[key] ?? 'walk';
        newDualRanges[paramKey] = range;
        if (newSliderModes[key] === 'walk') {
          const walkPos = Math.random();
          newWalkPositions[key] = walkPos;
          randomWalkRef.current[paramKey] = {
            position: walkPos,
            velocity: (Math.random() - 0.5) * 0.02,
          };
        }
      });

      setSliderModes(newSliderModes);
      setDualSliderRanges(newDualRanges);
      setRandomWalkPositions(newWalkPositions);
    } else {
      setSliderModes({});
      setDualSliderRanges({});
      setRandomWalkPositions({});
      randomWalkRef.current = {};
    }
  }, []);

  // Lead expression trigger positions (0-1 within each range, updated on each note)
  const [leadExpressionPositions, setLeadExpressionPositions] = useState<{
    vibratoDepth: number;
    vibratoRate: number;
    glide: number;
  }>({ vibratoDepth: 0.5, vibratoRate: 0.5, glide: 0.5 });

  // Lead 4op FM preset list (loaded async from manifest)
  const [lead4opPresets, setLead4opPresets] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    getLead4opFMPresetList().then(setLead4opPresets).catch(() => {
      // Fallback if manifest fails — use embedded defaults
      setLead4opPresets([
        { id: 'soft_rhodes', name: 'Soft Rhodes' },
        { id: 'gamelan', name: 'Gamelan' },
      ]);
    });
  }, []);

  // Track which expression params are in dual (range) mode vs single mode
  // (Now unified in sliderModes - these are kept as convenience getters)

  // Lead morph trigger positions (0-1 within min/max range, updated per note)
  const [leadMorphPositions, setLeadMorphPositions] = useState<{
    lead1: number;
    lead2: number;
  }>({ lead1: 0.5, lead2: 0.5 });

  // Pad morph trigger positions (updated per synth voice trigger in S&H/walk mode)
  const [padMorphPositions, setPadMorphPositions] = useState<{
    pad1: number;
    pad2: number;
  }>({ pad1: 0.5, pad2: 0.5 });

  // Track last triggered delay values for the indicator
  const [leadDelayPositions, setLeadDelayPositions] = useState<{
    time: number;
    feedback: number;
    mix: number;
  }>({ time: 0.5, feedback: 0.5, mix: 0.5 });

  // Track random walk positions for ocean params (static defaults — WASM ocean no longer fires JS callbacks)
  const [oceanPositions] = useState<{
    duration: number;
    interval: number;
    foam: number;
    depth: number;
  }>({ duration: 0.5, interval: 0.5, foam: 0.5, depth: 0.5 });

  // Track last triggered drum morph positions (per-trigger random values)
  const [drumMorphPositions, setDrumMorphPositions] = useState<{
    sub: number;
    kick: number;
    click: number;
    beepHi: number;
    beepLo: number;
    noise: number;
    membrane: number;
  }>({ sub: 0.5, kick: 0.5, click: 0.5, beepHi: 0.5, beepLo: 0.5, noise: 0.5, membrane: 0.5 });

  // Track last triggered drum S&H positions for any param (keyed by full param name)
  const [drumParamSHPositions, setDrumParamSHPositions] = useState<Record<string, number>>({});

  // Granular/looper S&H flash state: set of param keys currently pulsing
  const [shFlashKeys, setShFlashKeys] = useState<Set<string>>(new Set());
  const shFlashTimerRef = useRef<number | null>(null);

  const [drumSeqPlayheads, setDrumSeqPlayheads] = useState<number[]>([0, 0, 0, 0]);
  const [drumSeqHitCounts, setDrumSeqHitCounts] = useState<number[]>([0, 0, 0, 0]);
  const [drumEditingVoice, setDrumEditingVoice] = useState<string | null>(null);
  const [drumTriggeredVoices, setDrumTriggeredVoices] = useState<Record<string, boolean>>({});
  const drumTriggerTimersRef = useRef<Record<string, number | null>>({});
  const drumViewModeRef = useRef<'simple' | 'detail' | 'overview'>('detail');
  const drumStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const drumSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);

  // Evolve flash state — driven by audio engine callback, passed to DrumPage
  const [drumEuclidEvolveFlashing, setDrumEuclidEvolveFlashing] = useState<boolean[]>([false, false, false, false]);
  const drumEuclidEvolveFlashTimersRef = useRef<Array<number | null>>([null, null, null, null]);

  // ── Lead/Synth Euclidean sequencer state ──
  const [leadSeqPlayheads, setLeadSeqPlayheads] = useState<number[]>([0, 0, 0, 0]);
  const [leadSeqHitCounts, setLeadSeqHitCounts] = useState<number[]>([0, 0, 0, 0]);
  const synthViewModeRef = useRef<'simple' | 'detail' | 'overview'>('simple');
  const synthStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const synthSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const synthPitchSettingsRef = useRef<PitchSettings[] | undefined>(undefined);
  // @ts-expect-error Reserved for future evolve flash animation UI
  const [synthEuclidEvolveFlashing, setSynthEuclidEvolveFlashing] = useState<boolean[]>([false, false, false, false]);
  // @ts-expect-error Reserved for future evolve flash animation UI
  const synthEuclidEvolveFlashTimersRef = useRef<Array<number | null>>([null, null, null, null]);

  // ── Looper Euclidean sequencer state ──
  const [looperSeqPlayheads, setLooperSeqPlayheads] = useState<number[]>([0, 0, 0, 0]);
  const [looperSeqHitCounts, setLooperSeqHitCounts] = useState<number[]>([0, 0, 0, 0]);
  const looperViewModeRef = useRef<'simple' | 'detail' | 'overview'>('detail');
  const looperStepOverridesRef = useRef<StepOverrides | undefined>(undefined);
  const looperSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | undefined>(undefined);
  const looperClockDivsRef = useRef<ClockDivision[] | undefined>(undefined);
  const [looperPresetVersion, setLooperPresetVersion] = useState(0);

  // ── Looper buffer position state (from worklet) ──
  const [looperWriteHead, setLooperWriteHead] = useState(0);
  const [looperVoicePositions, setLooperVoicePositions] = useState<number[]>([0, 0, 0, 0]);

  // ── Looper per-trigger override feedback (for UI flash/highlight) ──
  const [looperTriggerOverrides, setLooperTriggerOverrides] = useState<{
    sliceOverride?: number;
    pitchOverride?: number;
    reverseOverride?: boolean;
  }[]>([{}, {}, {}, {}]);
  const looperTriggerTimersRef = useRef<(number | null)[]>([null, null, null, null]);

  // Trigger position map: maps slider keys to their per-trigger position values
  const triggerPositionMap = useMemo<Record<string, number>>(() => ({
    leadVibratoDepth: leadExpressionPositions.vibratoDepth,
    leadVibratoRate: leadExpressionPositions.vibratoRate,
    leadGlide: leadExpressionPositions.glide,
    leadDelayTime: leadDelayPositions.time,
    leadDelayFeedback: leadDelayPositions.feedback,
    leadDelayMix: leadDelayPositions.mix,
    oceanDuration: oceanPositions.duration,
    oceanInterval: oceanPositions.interval,
    oceanFoam: oceanPositions.foam,
    oceanDepth: oceanPositions.depth,
    lead1Morph: leadMorphPositions.lead1,
    lead2Morph: leadMorphPositions.lead2,
    padMorph: padMorphPositions.pad1,
    pad2Morph: padMorphPositions.pad2,
  }), [leadExpressionPositions, leadDelayPositions, oceanPositions, leadMorphPositions, padMorphPositions]);

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

  // Drum S&H param keys — any drum param (except morph) that should use per-trigger sampling in S&H mode.
  // Keyed by full param name. Maps to voice for the engine callback.
  const drumSHParamKeyToVoice = useMemo<Record<string, DrumPresetVoice>>(() => ({
    drumSubDistance: 'sub',
    drumKickDistance: 'kick',
    drumClickDistance: 'click',
    drumBeepHiDistance: 'beepHi',
    drumBeepLoDistance: 'beepLo',
    drumNoiseDistance: 'noise',
    drumMembraneDistance: 'membrane',
    drumSubVariation: 'sub',
    drumKickVariation: 'kick',
    drumClickVariation: 'click',
    drumBeepHiVariation: 'beepHi',
    drumBeepLoVariation: 'beepLo',
    drumNoiseVariation: 'noise',
    drumMembraneVariation: 'membrane',
    // Add future S&H drum params here — no other code changes needed
  }), []);
  const drumSHParamKeys = useMemo(() => new Set(Object.keys(drumSHParamKeyToVoice)), [drumSHParamKeyToVoice]);

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

    // Cycle: single → walk → sampleHold → single
    const current = sliderModes[keyStr] ?? 'single';
    const nextMode: SliderMode = current === 'single' ? 'walk'
      : current === 'walk' ? 'sampleHold'
      : 'single';

    if (nextMode === 'single') {
      // Collapsing to single — use the current walk/trigger position value
      const range = dualSliderRanges[key as keyof SliderState];
      const walkPos = randomWalkPositions[keyStr] ?? triggerPositionMap[keyStr] ?? 0.5;
      if (range) {
        const meanValue = range.min + walkPos * (range.max - range.min);
        setState(s => ({ ...s, [key]: quantize(key, meanValue) }));
      }
      // Clean up
      setDualSliderRanges(r => {
        const newRanges = { ...r };
        delete newRanges[key];
        return newRanges;
      });
      delete randomWalkRef.current[key];
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
          const currentVal = state[key] as number;
          const rangeSize = (info.max - info.min) * 0.2; // 20% of total range
          const min = Math.max(info.min, currentVal - rangeSize / 2);
          const max = Math.min(info.max, currentVal + rangeSize / 2);
          setDualSliderRanges(r => ({ ...r, [key]: { min, max } }));

          // Initialize random walk for walk mode (not for sampleHold)
          if (nextMode === 'walk') {
            randomWalkRef.current[key] = {
              position: Math.random(),
              velocity: (Math.random() - 0.5) * 0.02,
            };
            setRandomWalkPositions(p => ({ ...p, [keyStr]: randomWalkRef.current[key]!.position }));
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
        // Switching from walk to sampleHold — stop walk, keep range
        delete randomWalkRef.current[key];

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
  }, [isJourneyPlaying, dualSliderRanges, randomWalkPositions, triggerPositionMap, sliderModes, state, drumMorphKeys, morphPosition, morphPresetA, morphPresetB]);

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

  // Random walk animation (for all sliders in 'walk' mode)
  useEffect(() => {
    const walkKeys = Object.entries(sliderModes)
      .filter(([_key, mode]) => mode === 'walk')
      .map(([key]) => key as keyof SliderState);
    if (walkKeys.length === 0) return;

    const animate = () => {
      const speed = state.randomWalkSpeed;
      const updates: Record<string, number> = {};
      let hasUpdates = false;

      walkKeys.forEach(key => {
        const walk = randomWalkRef.current[key];
        const range = dualSliderRanges[key as keyof SliderState];
        if (!walk || !range) return;

        // Random walk with brownian motion
        // Add small random acceleration
        walk.velocity += (Math.random() - 0.5) * 0.01 * speed;
        // Dampen velocity
        walk.velocity *= 0.98;
        // Clamp velocity
        walk.velocity = Math.max(-0.05 * speed, Math.min(0.05 * speed, walk.velocity));
        // Update position
        walk.position += walk.velocity;
        
        // Bounce off boundaries
        if (walk.position < 0) {
          walk.position = 0;
          walk.velocity = Math.abs(walk.velocity);
        } else if (walk.position > 1) {
          walk.position = 1;
          walk.velocity = -Math.abs(walk.velocity);
        }

        updates[key] = walk.position;
        hasUpdates = true;
      });

      if (hasUpdates) {
        setRandomWalkPositions(prev => ({ ...prev, ...updates }));
        
        // Update actual parameter values for the audio engine
        setState(prev => {
          const newState = { ...prev };
          walkKeys.forEach(key => {
            const range = dualSliderRanges[key as keyof SliderState];
            const walkPos = updates[key] ?? randomWalkPositions[key] ?? 0.5;
            if (range) {
              (newState as any)[key] = quantize(key, range.min + walkPos * (range.max - range.min));
            }
          });

          // Apply pad morph preset interpolation when padMorph is walking
          if ('padMorph' in updates) {
            const presetA = getPadPreset(newState.padPresetA as string);
            const presetB = getPadPreset(newState.padPresetB as string);
            if (presetA && presetB) {
              const morphed = morphPadPresets(presetA, presetB, newState.padMorph as number);
              for (const k of PAD_PRESET_PARAM_KEYS) {
                if (k in morphed) {
                  (newState as Record<string, unknown>)[k] = morphed[k];
                }
              }
            }
          }

          // Apply pad2 morph preset interpolation when pad2Morph is walking
          if ('pad2Morph' in updates) {
            const presetA = getPadPreset(newState.pad2PresetA as string);
            const presetB = getPadPreset(newState.pad2PresetB as string);
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

          // Apply water morph preset interpolation when waterMorph is walking
          if ('waterMorph' in updates) {
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
            newState.waterPreset = (newState.waterMorph as number) < 0.5
              ? (newState.waterMorphA as number)
              : (newState.waterMorphB as number);
          }

          // Apply drum morph preset interpolation when any drumXxxMorph is walking
          const drumWalkMorphMap: Record<string, DrumPresetVoice> = {
            drumSubMorph: 'sub', drumKickMorph: 'kick', drumClickMorph: 'click',
            drumBeepHiMorph: 'beepHi', drumBeepLoMorph: 'beepLo', drumNoiseMorph: 'noise', drumMembraneMorph: 'membrane',
          };
          for (const [morphKey, voice] of Object.entries(drumWalkMorphMap)) {
            if (morphKey in updates) {
              const morphedParams = applyMorphToState(newState as SliderState, voice);
              Object.assign(newState, morphedParams);
            }
          }

          return newState;
        });
      }
    };

    // Run at 10 Hz for smooth but efficient animation
    const intervalId = window.setInterval(animate, 100);
    return () => clearInterval(intervalId);
  }, [sliderModes, dualSliderRanges, state.randomWalkSpeed, drumMorphKeys]);

  // Load presets from folder on mount
  useEffect(() => {
    loadPresetsFromFolder().then((presets) => {
      setSavedPresets(presets);
      setPresetsLoading(false);
    });

    // Check for cloud preset in URL (?cloud=presetId)
    const urlParams = new URLSearchParams(window.location.search);
    const cloudPresetId = urlParams.get('cloud');
    if (cloudPresetId && isCloudEnabled()) {
      fetchPresetById(cloudPresetId).then((preset) => {
        if (preset) {
          const rawData = preset.data as unknown;
          const wrappedData =
            rawData !== null &&
            typeof rawData === 'object' &&
            Object.prototype.hasOwnProperty.call(rawData, 'state')
              ? (rawData as { state?: SliderState; dualRanges?: Record<string, { min: number; max: number }> })
              : null;

          const presetState = wrappedData?.state && typeof wrappedData.state === 'object'
            ? wrappedData.state
            : (preset.data as SliderState);

          const result = applyPreset({
            name: preset.name,
            timestamp: new Date().toISOString(),
            state: presetState,
            dualRanges: wrappedData?.dualRanges,
          }, { currentState: state, normalize: normalizePresetForWeb });
          setState(result.state);
          applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
          console.log(`Loaded cloud preset: ${preset.name} by ${preset.author}`);
        }
      });
    }
  }, [applyDualRangesFromPreset]);

  // Engine state callback
  useEffect(() => {
    audioEngine.setStateChangeCallback(setEngineState);
    return () => { audioEngine.setStateChangeCallback(null as unknown as (state: EngineState) => void); };
  }, []);

  // Lead expression trigger callback
  useEffect(() => {
    audioEngine.setLeadExpressionCallback(setLeadExpressionPositions);
    return () => { audioEngine.setLeadExpressionCallback(null as unknown as typeof setLeadExpressionPositions); };
  }, []);

  // Lead morph trigger callback (updates walk indicator + actual morph slider value) — throttled to ~15Hz
  useEffect(() => {
    let lastLeadMorph = 0;
    audioEngine.setLeadMorphCallback((morph) => {
      const now = performance.now();
      if (now - lastLeadMorph < 66) return;
      lastLeadMorph = now;
      setLeadMorphPositions(prev => ({
        lead1: morph.lead1 >= 0 ? morph.lead1 : prev.lead1,
        lead2: morph.lead2 >= 0 ? morph.lead2 : prev.lead2,
      }));
      // Also update the actual lead morph slider state so UI reflects the position
      setState(prev => {
        const updates: Partial<SliderState> = {};
        if (morph.lead1 >= 0) updates.lead1Morph = morph.lead1 as SliderState['lead1Morph'];
        if (morph.lead2 >= 0) updates.lead2Morph = morph.lead2 as SliderState['lead2Morph'];
        if (Object.keys(updates).length === 0) return prev;
        return { ...prev, ...updates };
      });
    });
  }, []);

  // Pad morph sub-sequencer callback (moves padMorph slider + applies morphed preset) — throttled to ~15Hz
  useEffect(() => {
    let lastPad1Morph = 0;
    audioEngine.setPadMorphTriggerCallback((morphPosition: number) => {
      const now = performance.now();
      if (now - lastPad1Morph < 66) return;
      lastPad1Morph = now;
      setPadMorphPositions(prev => ({ ...prev, pad1: morphPosition }));
      setState(prev => {
        const presetA = getPadPreset(prev.padPresetA as string);
        const presetB = getPadPreset(prev.padPresetB as string);
        let newState = { ...prev, padMorph: morphPosition };
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, morphPosition);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              (newState as Record<string, unknown>)[k] = morphed[k];
            }
          }
        }
        return newState;
      });
    });
  }, []);

  // Pad 2 morph sub-sequencer callback (moves pad2Morph slider + applies morphed preset to pad2 keys) — throttled to ~15Hz
  useEffect(() => {
    let lastPad2Morph = 0;
    audioEngine.setPad2MorphTriggerCallback((morphPosition: number) => {
      const now = performance.now();
      if (now - lastPad2Morph < 66) return;
      lastPad2Morph = now;
      setPadMorphPositions(prev => ({ ...prev, pad2: morphPosition }));
      setState(prev => {
        const presetA = getPadPreset(prev.pad2PresetA as string);
        const presetB = getPadPreset(prev.pad2PresetB as string);
        let newState = { ...prev, pad2Morph: morphPosition };
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, morphPosition);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              const pad2Key = PAD1_TO_PAD2_KEY[k];
              if (pad2Key) {
                (newState as Record<string, unknown>)[pad2Key] = morphed[k];
              }
            }
          }
        }
        return newState;
      });
    });
  }, []);

  // Lead delay trigger callback
  useEffect(() => {
    audioEngine.setLeadDelayCallback(setLeadDelayPositions);
    return () => { audioEngine.setLeadDelayCallback(null as unknown as typeof setLeadDelayPositions); };
  }, []);

  // Drum morph trigger callback (per-trigger random morph position)
  // Updates both the indicator position AND the individual parameter sliders
  // Throttled: morph indicator at ~15Hz, full setState at ~10Hz to avoid re-render storms
  useEffect(() => {
    if (audioEngine.setDrumMorphTriggerCallback) {
      const lastMorphIndicator: Record<string, number> = {};
      let lastMorphState = 0;
      audioEngine.setDrumMorphTriggerCallback((voice, morphPosition) => {
        const now = performance.now();
        // Throttle indicator update to ~15Hz per voice
        if (now - (lastMorphIndicator[voice] || 0) >= 66) {
          lastMorphIndicator[voice] = now;
          setDrumMorphPositions(prev => ({ ...prev, [voice]: morphPosition }));
        }
        
        // Map voice to morph key and update slider state with morphed values
        const voiceToMorphKey: Record<string, keyof SliderState> = {
          sub: 'drumSubMorph',
          kick: 'drumKickMorph',
          click: 'drumClickMorph',
          beepHi: 'drumBeepHiMorph',
          beepLo: 'drumBeepLoMorph',
          noise: 'drumNoiseMorph',
          membrane: 'drumMembraneMorph',
        };
        const morphKey = voiceToMorphKey[voice];
        
        // Throttle full state updates to ~10Hz (audio engine already got correct morph values)
        if (morphKey && now - lastMorphState >= 100) {
          lastMorphState = now;
          setState(prev => {
            // Check if updates are enabled
            if (!prev.drumMorphSliderAnimate) return prev;

            // Convert normalized position (0-1) back to actual morph value using the range
            const range = dualSliderRanges[morphKey];
            const actualMorphValue = range 
              ? range.min + morphPosition * (range.max - range.min)
              : prev[morphKey] as number;
            
            // Create state with the random morph value
            const stateWithMorph = { ...prev, [morphKey]: actualMorphValue };
            
            // Apply morphed preset values to the sliders
            const morphedParams = applyMorphToState(stateWithMorph, voice as DrumPresetVoice);
            return { ...stateWithMorph, ...morphedParams };
          });
        }
      });
    }
  }, [dualSliderRanges]);

  // Drum distance trigger callback (per-trigger random distance position for S&H) — throttled per-key
  useEffect(() => {
    if (audioEngine.setDrumParamSHTriggerCallback) {
      const lastSH: Record<string, number> = {};
      audioEngine.setDrumParamSHTriggerCallback((_voice, key, position) => {
        const now = performance.now();
        if (now - (lastSH[key] || 0) < 80) return; // max ~12Hz per key
        lastSH[key] = now;
        setDrumParamSHPositions(prev => ({ ...prev, [key]: position }));
      });
    }
  }, []);

  // Granular/looper S&H trigger callback (engine-side 10Hz re-sampling)
  useEffect(() => {
    audioEngine.setGranLooperSHTriggerCallback((keys: string[]) => {
      setShFlashKeys(new Set(keys));
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
      shFlashTimerRef.current = window.setTimeout(() => {
        setShFlashKeys(new Set());
      }, 70);
    });
    return () => {
      audioEngine.setGranLooperSHTriggerCallback(() => {});
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
    };
  }, []);

  // Drum Euclid evolve trigger callback (lane mutation pulse)
  useEffect(() => {
    audioEngine.setDrumEuclidEvolveTriggerCallback((laneIndex: number) => {
      if (laneIndex < 0 || laneIndex > 3) return;
      setDrumEuclidEvolveFlashing(prev => prev.map((v, idx) => (idx === laneIndex ? true : v)));

      const existingTimer = drumEuclidEvolveFlashTimersRef.current[laneIndex];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      drumEuclidEvolveFlashTimersRef.current[laneIndex] = window.setTimeout(() => {
        setDrumEuclidEvolveFlashing(prev => prev.map((v, idx) => (idx === laneIndex ? false : v)));
        drumEuclidEvolveFlashTimersRef.current[laneIndex] = null;
      }, 180);
    });

    return () => {
      drumEuclidEvolveFlashTimersRef.current.forEach((timer, laneIndex) => {
        if (timer) {
          window.clearTimeout(timer);
          drumEuclidEvolveFlashTimersRef.current[laneIndex] = null;
        }
      });
    };
  }, []);

  // Drum Euclid step position callback (live playhead tracking) — throttled to ~8Hz
  useEffect(() => {
    let lastDrumStep = 0;
    audioEngine.setDrumStepPositionCallback((steps: number[], hitCounts: number[]) => {
      const now = performance.now();
      if (now - lastDrumStep < 120) return;
      lastDrumStep = now;
      setDrumSeqPlayheads(steps);
      setDrumSeqHitCounts(hitCounts);
    });
  }, []);

  // Lead Euclid step position callback (live playhead tracking) — throttled to ~8Hz
  useEffect(() => {
    let lastLeadStep = 0;
    audioEngine.setSynthStepPositionCallback((steps: number[], hitCounts: number[]) => {
      const now = performance.now();
      if (now - lastLeadStep < 120) return;
      lastLeadStep = now;
      setLeadSeqPlayheads(steps);
      setLeadSeqHitCounts(hitCounts);
    });
  }, []);

  // Looper Euclid step position callback (live playhead tracking) — throttled to ~8Hz
  useEffect(() => {
    let lastLooperStep = 0;
    audioEngine.setLooperStepPositionCallback((steps: number[], hitCounts: number[]) => {
      const now = performance.now();
      if (now - lastLooperStep < 120) return;
      lastLooperStep = now;
      setLooperSeqPlayheads(steps);
      setLooperSeqHitCounts(hitCounts);
    });
  }, []);

  // Looper buffer position polling — ~12Hz for smooth head animation
  useEffect(() => {
    if (!engineState.isRunning) return;
    const id = setInterval(() => {
      setLooperWriteHead(audioEngine.getLooperWriteHeadPosition());
      setLooperVoicePositions(audioEngine.getLooperVoicePositions());
    }, 80); // ~12fps — matches CSS transition for continuous motion
    return () => clearInterval(id);
  }, [engineState.isRunning]);

  // Looper per-trigger override callback (reverse toggle, pitch flash, slice highlight) — throttled to ~10Hz
  useEffect(() => {
    const lastOverride: Record<number, number> = {};
    audioEngine.setLooperTriggerOverrideCallback((voice: number, overrides: { sliceOverride?: number; pitchOverride?: number; reverseOverride?: boolean }) => {
      if (voice < 0 || voice > 3) return;
      const now = performance.now();
      if (now - (lastOverride[voice] || 0) < 100) return;
      lastOverride[voice] = now;
      setLooperTriggerOverrides(prev => {
        const next = [...prev];
        next[voice] = overrides;
        return next;
      });
      // Clear after 150ms
      const existing = looperTriggerTimersRef.current[voice];
      if (existing) window.clearTimeout(existing);
      looperTriggerTimersRef.current[voice] = window.setTimeout(() => {
        setLooperTriggerOverrides(prev => {
          const next = [...prev];
          next[voice] = {};
          return next;
        });
        looperTriggerTimersRef.current[voice] = null;
      }, 150);
    });
    return () => {
      looperTriggerTimersRef.current.forEach((timer, i) => {
        if (timer) {
          window.clearTimeout(timer);
          looperTriggerTimersRef.current[i] = null;
        }
      });
    };
  }, []);

  // Drum trigger callback (per-voice flash for envelope visualizer) — throttled to ~12Hz per voice
  useEffect(() => {
    const lastTrigTime: Record<string, number> = {};
    audioEngine.setDrumTriggerCallback((voice: string, _velocity: number) => {
      const now = performance.now();
      if (now - (lastTrigTime[voice] || 0) < 80) return;
      lastTrigTime[voice] = now;
      setDrumTriggeredVoices(prev => ({ ...prev, [voice]: true }));
      const existing = drumTriggerTimersRef.current[voice];
      if (existing) window.clearTimeout(existing);
      drumTriggerTimersRef.current[voice] = window.setTimeout(() => {
        setDrumTriggeredVoices(prev => ({ ...prev, [voice]: false }));
        drumTriggerTimersRef.current[voice] = null;
      }, 120);
    });
  }, []);

  // Auto-morph animation loop — drives morph positions for voices with auto-morph enabled
  // Only runs when at least one drum auto-morph is active (saves CPU/battery when idle)
  const autoMorphRafRef = useRef<number | null>(null);
  const autoMorphStateRef = useRef(state);
  autoMorphStateRef.current = state;

  const anyDrumAutoMorphActive = (
    state.drumSubMorphAuto || state.drumKickMorphAuto || state.drumClickMorphAuto ||
    state.drumBeepHiMorphAuto || state.drumBeepLoMorphAuto ||
    state.drumNoiseMorphAuto || state.drumMembraneMorphAuto
  );

  useEffect(() => {
    if (!anyDrumAutoMorphActive) return; // No auto-morph active — skip RAF loop entirely

    const MORPH_STATE_KEYS: Record<string, keyof SliderState> = {
      sub: 'drumSubMorph',
      kick: 'drumKickMorph',
      click: 'drumClickMorph',
      beepHi: 'drumBeepHiMorph',
      beepLo: 'drumBeepLoMorph',
      noise: 'drumNoiseMorph',
      membrane: 'drumMembraneMorph',
    };

    let active = true;
    const tick = () => {
      if (!active) return;
      const newValues = drumMorphManager.update(autoMorphStateRef.current, performance.now());
      if (newValues.size > 0) {
        setState(prev => {
          const updates: Partial<SliderState> = {};
          for (const [voice, value] of newValues) {
            const key = MORPH_STATE_KEYS[voice];
            if (key && Math.abs((prev[key] as number) - value) > 0.001) {
              (updates as Record<string, unknown>)[key] = value;
            }
          }
          if (Object.keys(updates).length === 0) return prev;
          // Apply drum morph preset interpolation for each updated voice
          let newState = { ...prev, ...updates };
          for (const [voice] of newValues) {
            const morphedParams = applyMorphToState(newState as SliderState, voice as DrumPresetVoice);
            newState = { ...newState, ...morphedParams };
          }
          return newState;
        });
      }
      autoMorphRafRef.current = requestAnimationFrame(tick);
    };
    autoMorphRafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (autoMorphRafRef.current !== null) {
        cancelAnimationFrame(autoMorphRafRef.current);
        autoMorphRafRef.current = null;
      }
    };
  }, [anyDrumAutoMorphActive]);

  // Countdown timer
  useEffect(() => {
    if (engineState.isRunning) {
      const update = () => {
        setCountdown(getTimeUntilNextPhrase());
      };
      update();
      countdownRef.current = window.setInterval(update, 1000); // 1Hz — displays whole seconds
      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      };
    }
  }, [engineState.isRunning]);

  // Filter frequency + LFO value polling for live visualization
  const [liveFilterFreq, setLiveFilterFreq] = useState(1000);
  const [liveLfoValue, setLiveLfoValue] = useState(0);
  useEffect(() => {
    if (engineState.isRunning) {
      const updateFilter = () => {
        setLiveFilterFreq(audioEngine.getCurrentFilterFreq());
        setLiveLfoValue(audioEngine.getCurrentLfoValue());
      };
      const filterId = window.setInterval(updateFilter, 150); // ~7fps — throttled to reduce re-renders
      return () => clearInterval(filterId);
    }
  }, [engineState.isRunning]);

  // Update engine when state changes (always — drum sequencer works independently)
  useEffect(() => {
    audioEngine.updateParams(state);
  }, [state, engineState.isRunning]);

  // Handle slider change
  const handleSliderChange = useCallback((key: keyof SliderState, value: number | string) => {
    // Mark that user has interacted with the UI
    hasUserInteractedRef.current = true;
    
    // Block slider changes when journey mode is playing
    if (isJourneyPlaying) {
      console.log('[Journey] Slider change blocked - journey is playing');
      return;
    }
    
    // Rule 1: Mid-morph changes are temporary overrides (numeric only)
    // Rule 2: Endpoint changes (0% or 100%) update the respective preset permanently (all types)
    const isNumericValue = typeof value === 'number';
    const isMorphActive = morphPresetA !== null || morphPresetB !== null;
    
    if (isMorphActive) {
      if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
        // At endpoint A: update preset A permanently (both numeric and string values)
        setMorphPresetA(prev => prev ? {
          ...prev,
          state: { ...prev.state, [key]: value }
        } : null);
      } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
        // At endpoint B: update preset B permanently (both numeric and string values)
        setMorphPresetB(prev => prev ? {
          ...prev,
          state: { ...prev.state, [key]: value }
        } : null);
      } else if (morphPosition > 0 && morphPosition < 100 && isNumericValue) {
        // Mid-morph: store as temporary override (numeric only)
        morphManualOverridesRef.current[key] = {
          value: value as number,
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
    if (drumVoice && drumMorphKey && isNumericValue) {
      // Get current drum morph position for this voice from state
      // We need to read from the current state, so we'll do this inside setState
    }
    
    setState((prev) => {
      let newState = { ...prev, [key]: value };
      
      // Handle drum synth param override at any morph position
      // Works like the main morph system: endpoint changes are permanent,
      // mid-morph changes blend toward destination
      if (drumVoice && drumMorphKey && isNumericValue) {
        const drumMorphPosition = prev[drumMorphKey] as number; // 0-1
        // Store override at current morph position (works for both endpoints and mid-morph)
        setDrumMorphOverride(drumVoice, keyStr, value as number, drumMorphPosition);
      }
      
      // Auto-disable granular (looper) when level is 0
      if (key === 'granularLevel' && value === 0) {
        newState.granularEnabled = false;
        newState.looperEnabled = false;
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
        const presetA = getPadPreset(newState.padPresetA as string);
        const presetB = getPadPreset(newState.padPresetB as string);
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
        const presetA = getPadPreset(newState.pad2PresetA as string);
        const presetB = getPadPreset(newState.pad2PresetB as string);
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
      
      return newState;
    });
    
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

    // Determine walk/trigger position based on mode
    let walkPos: number | undefined;
    if (mode === 'walk') {
      walkPos = randomWalkPositions[keyStr];
    } else if (mode === 'sampleHold') {
      walkPos = triggerPositionMap[keyStr];
    }

    // For drum morph keys in sampleHold, use per-trigger positions
    if (drumMorphKeys.has(paramKey) && mode === 'sampleHold') {
      const voice = drumMorphKeyToVoice[paramKey];
      if (voice) {
        walkPos = drumMorphPositions[voice];
      }
    }

    // For any drum S&H param key (distance, etc.), use the generic per-trigger positions
    if (drumSHParamKeys.has(keyStr) && mode === 'sampleHold') {
      walkPos = drumParamSHPositions[keyStr];
    }

    // S&H flash for granular/looper params (engine-side 10Hz re-sampling)
    const isFlashing = mode === 'sampleHold' && shFlashKeys.has(keyStr);

    return {
      mode,
      dualRange: dualSliderRanges[paramKey],
      walkPosition: walkPos,
      isFlashing,
      onCycleMode: handleCycleSliderMode,
      onDualRangeChange: handleDualRangeChange,
    };
  }, [sliderModes, dualSliderRanges, randomWalkPositions, triggerPositionMap, drumMorphPositions, drumMorphKeys, drumMorphKeyToVoice, drumSHParamKeys, drumParamSHPositions, shFlashKeys, handleCycleSliderMode, handleDualRangeChange]);

  // Handle select change
  const handleSelectChange = useCallback(<K extends keyof SliderState>(key: K, value: SliderState[K]) => {
    // Mark that user has interacted with the UI
    hasUserInteractedRef.current = true;
    setState((prev) => {
      const newState = { ...prev, [key]: value };
      
      // ═══ PAD PRESET MORPH: when preset A or B changes, re-morph and apply ═══
      if (key === 'padPresetA' || key === 'padPresetB') {
        const presetA = getPadPreset(newState.padPresetA as string);
        const presetB = getPadPreset(newState.padPresetB as string);
        if (presetA && presetB) {
          const morphed = morphPadPresets(presetA, presetB, newState.padMorph as number);
          for (const k of PAD_PRESET_PARAM_KEYS) {
            if (k in morphed) {
              (newState as Record<string, unknown>)[k] = morphed[k];
            }
          }
        }
      }

      // ═══ PAD 2 PRESET MORPH: when pad2 preset A or B changes, re-morph and apply ═══
      if (key === 'pad2PresetA' || key === 'pad2PresetB') {
        const presetA = getPadPreset(newState.pad2PresetA as string);
        const presetB = getPadPreset(newState.pad2PresetB as string);
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

      // ═══ GRANULAR ↔ LOOPER SYNC: granularEnabled controls looperEnabled ═══
      if (key === 'granularEnabled') {
        newState.looperEnabled = value as boolean;
      }

      // ═══ LOOPER PRESET: apply partial state overrides ═══
      if (key === 'looperPreset') {
        const presetData = getLooperPresetData(value as string);
        if (presetData) {
          for (const k of Object.keys(presetData)) {
            (newState as Record<string, unknown>)[k] = (presetData as Record<string, unknown>)[k];
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
            (newState as Record<string, unknown>)[k] = morphed[k];
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
          (newState as Record<string, unknown>).insectsDensity = defs.density;
          (newState as Record<string, unknown>).insectsTemperature = defs.temperature;
          (newState as Record<string, unknown>).insectsDistance = defs.distance;
          (newState as Record<string, unknown>).insectsProximity = defs.proximity;
          (newState as Record<string, unknown>).insectsAntiphony = defs.antiphony;
          (newState as Record<string, unknown>).insectsClickRate = defs.clickRate;
          (newState as Record<string, unknown>).insectsMotion = defs.motion;
        }
      }
      if (key === 'insects2Engine') {
        const defs = INSECT_ENGINE_DEFAULTS[value as number];
        if (defs) {
          (newState as Record<string, unknown>).insects2Density = defs.density;
          (newState as Record<string, unknown>).insects2Temperature = defs.temperature;
          (newState as Record<string, unknown>).insects2Distance = defs.distance;
          (newState as Record<string, unknown>).insects2Proximity = defs.proximity;
          (newState as Record<string, unknown>).insects2Antiphony = defs.antiphony;
          (newState as Record<string, unknown>).insects2ClickRate = defs.clickRate;
          (newState as Record<string, unknown>).insects2Motion = defs.motion;
        }
      }

      return newState;
    });

    // Apply looper preset slider modes (outside setState since sliderModes is separate state)
    if (key === 'looperPreset') {
      const modes = getLooperPresetSliderModes(value as string);
      if (modes) {
        // 1. Update slider modes
        setSliderModes(prev => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (k.startsWith('looperV')) delete next[k];
          }
          for (const [k, v] of Object.entries(modes)) {
            next[k] = v as SliderMode;
          }
          return next;
        });

        // 2. Initialise dualSliderRanges + randomWalkRef for walk/sampleHold keys
        //    so that the walk animation and sampleHold triggers actually fire.
        const presetData = getLooperPresetData(value as string);
        const newDualRanges: DualSliderState = {};
        const newWalkPositions: Record<string, number> = {};
        for (const [k, mode] of Object.entries(modes)) {
          const paramKey = k as keyof SliderState;
          const info = getParamInfo(paramKey);
          if (!info) continue;
          // Centre the walk range around the preset value (20% of full range)
          const currentVal = presetData?.[k as keyof typeof presetData] as number
            ?? (state[paramKey] as number)
            ?? (info.min + info.max) * 0.5;
          const rangeSize = (info.max - info.min) * 0.2;
          const rMin = Math.max(info.min, currentVal - rangeSize / 2);
          const rMax = Math.min(info.max, currentVal + rangeSize / 2);
          newDualRanges[paramKey] = { min: rMin, max: rMax };

          if (mode === 'walk') {
            const walkPos = Math.random();
            newWalkPositions[k] = walkPos;
            randomWalkRef.current[paramKey] = {
              position: walkPos,
              velocity: (Math.random() - 0.5) * 0.02,
            };
          }
        }
        // Merge with existing non-looper ranges
        setDualSliderRanges(prev => {
          const next: Record<string, DualSliderRange | undefined> = { ...prev };
          for (const k of Object.keys(next)) {
            if (k.startsWith('looperV')) delete next[k];
          }
          Object.assign(next, newDualRanges);
          return next as DualSliderState;
        });
        setRandomWalkPositions(prev => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (k.startsWith('looperV')) delete next[k];
          }
          return { ...next, ...newWalkPositions };
        });
        // Clean up stale walk refs for looper keys
        for (const k of Object.keys(randomWalkRef.current)) {
          if (k.startsWith('looperV') && !(k in modes)) {
            delete randomWalkRef.current[k as keyof SliderState];
          }
        }
      }

      // Apply sequencer configuration (sub-lanes, clock divs, step overrides)
      const seqConfig = getLooperPresetSeqConfig(value as string);
      if (seqConfig) {
        looperStepOverridesRef.current = seqConfig.stepOverrides;
        looperSubLaneStatesRef.current = seqConfig.subLaneStates;
        looperClockDivsRef.current = seqConfig.clockDivs;
        // Forward step overrides to audio engine immediately
        audioEngine.setLooperStepOverrides({
          triggerToggles: seqConfig.stepOverrides.triggerToggles,
          expression: seqConfig.stepOverrides.expression,
          expressionDirection: seqConfig.stepOverrides.expressionDirection,
          probability: seqConfig.stepOverrides.probability,
          ratchet: seqConfig.stepOverrides.ratchet,
          trigCondition: seqConfig.stepOverrides.trigCondition,
          slice: seqConfig.stepOverrides.slice,
          sliceDirection: seqConfig.stepOverrides.sliceDirection,
          pitch: seqConfig.stepOverrides.pitch,
          pitchDirection: seqConfig.stepOverrides.pitchDirection,
          reverse: seqConfig.stepOverrides.reverse,
          reverseDirection: seqConfig.stepOverrides.reverseDirection,
        });
        audioEngine.setLooperEuclidClockDivs(seqConfig.clockDivs);
      } else {
        // Non-rhythmic preset: clear sub-lane overrides
        looperStepOverridesRef.current = undefined;
        looperSubLaneStatesRef.current = undefined;
        looperClockDivsRef.current = undefined;
      }
      // Bump version to trigger hook re-initialization from initial* props
      setLooperPresetVersion(v => v + 1);
    }
  }, []);

  // Start/Stop
  const handleStart = async () => {
    try {
      // Activate snowflake on first play
      if (!snowflakeActivated) setSnowflakeActivated(true);
      // Setup iOS media session FIRST (must be synchronous from user gesture)
      setupIOSMediaSession();
      
      // Auto-load String Waves if user hasn't loaded any preset or interacted with UI
      let stateToStart = state;
      if (!hasLoadedPresetRef.current && !hasUserInteractedRef.current) {
        const defaultPreset = savedPresets.find(p => p.name === 'String Waves');
        if (defaultPreset) {
          console.log('[App] Auto-loading default preset: String Waves');
          hasLoadedPresetRef.current = true;
          const result = applyPreset(defaultPreset, { currentState: state, updateEngine: false, resetCofDrift: false, normalize: normalizePresetForWeb });
          setState(result.state);
          setMorphPresetA(result.preset);
          stateToStart = result.state;
          applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        }
      }
      
      // Then start the audio engine
      await audioEngine.start(stateToStart);
      
      // Connect the MediaStream to the audio element for iOS background playback
      connectMediaSessionToWebAudio();
      
      // If recording was armed, start recording now
      if (isRecordingArmed) {
        setIsRecordingArmed(false);
        // Small delay to ensure audio context is fully running
        setTimeout(() => {
          handleStartRecording();
        }, 50);
      }
    } catch (err) {
      console.error('Failed to start audio:', err);
      alert(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}\n\nCheck console for details.`);
    }
  };

  const handleStop = () => {
    // Don't stop recording when stopping playback - let tails continue
    // Recording must be stopped manually
    stopIOSMediaSession();
    audioEngine.stop();

    // Master stop also turns off the drum sequencer and lead Euclidean sequencer
    setState(prev => ({ ...prev, drumEuclidMasterEnabled: false, synthEuclideanMasterEnabled: false }));
    
    // Stop journey playback if running
    if (isJourneyPlaying) {
      journey.stop();
      if (journeyMorphAnimationRef.current) {
        cancelAnimationFrame(journeyMorphAnimationRef.current);
        journeyMorphAnimationRef.current = null;
      }
      setIsJourneyPlaying(false);
    }
    
    // Clear playback timer
    if (playbackTimerIntervalRef.current) {
      clearInterval(playbackTimerIntervalRef.current);
      playbackTimerIntervalRef.current = null;
    }
    setPlaybackTimerRemaining(null);
  };
  
  // Playback timer effect - starts countdown when playback starts
  useEffect(() => {
    // Clear any existing interval first
    if (playbackTimerIntervalRef.current) {
      clearInterval(playbackTimerIntervalRef.current);
      playbackTimerIntervalRef.current = null;
    }
    
    if (engineState.isRunning && playbackTimerEnabled) {
      // Start or restart the countdown
      // If no remaining time set, initialize from minutes setting
      if (playbackTimerRemaining === null) {
        const totalSeconds = playbackTimerMinutes * 60;
        setPlaybackTimerRemaining(totalSeconds);
      }
      
      // Start the interval
      playbackTimerIntervalRef.current = window.setInterval(() => {
        setPlaybackTimerRemaining(prev => {
          if (prev === null || prev <= 1) {
            // Timer reached zero - stop playback
            if (playbackTimerIntervalRef.current) {
              clearInterval(playbackTimerIntervalRef.current);
              playbackTimerIntervalRef.current = null;
            }
            // Use setTimeout to avoid state update during render
            setTimeout(() => {
              audioEngine.stop();
              stopIOSMediaSession();
            }, 0);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!engineState.isRunning) {
      // Playback stopped - clear timer state
      setPlaybackTimerRemaining(null);
    }
    
    return () => {
      if (playbackTimerIntervalRef.current) {
        clearInterval(playbackTimerIntervalRef.current);
        playbackTimerIntervalRef.current = null;
      }
    };
  }, [engineState.isRunning, playbackTimerEnabled]);
  
  // Arm recording - will start recording when playback starts
  const handleArmRecording = () => {
    setIsRecordingArmed(prev => !prev);
  };

  // WAV encoding helper - creates 24-bit 48kHz WAV
  const encodeWav24bit = (leftChannel: Float32Array, rightChannel: Float32Array, sampleRate: number): ArrayBuffer => {
    const numChannels = 2;
    const bitsPerSample = 24;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = leftChannel.length;
    const dataSize = numSamples * numChannels * bytesPerSample;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);
    
    // Helper to write string
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    
    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
    view.setUint16(32, numChannels * bytesPerSample, true); // block align
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write interleaved 24-bit samples
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      // Left channel - clamp and convert to 24-bit signed integer
      const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
      const leftInt = Math.floor(leftSample * 8388607); // 2^23 - 1
      view.setUint8(offset, leftInt & 0xFF);
      view.setUint8(offset + 1, (leftInt >> 8) & 0xFF);
      view.setUint8(offset + 2, (leftInt >> 16) & 0xFF);
      offset += 3;
      
      // Right channel
      const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));
      const rightInt = Math.floor(rightSample * 8388607);
      view.setUint8(offset, rightInt & 0xFF);
      view.setUint8(offset + 1, (rightInt >> 8) & 0xFF);
      view.setUint8(offset + 2, (rightInt >> 16) & 0xFF);
      offset += 3;
    }
    
    return buffer;
  };

  // Recording functions
  const handleStartRecording = () => {
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

    try {
      // Always capture WAV data (for WAV output or both)
      if (recordFormats.wav || recordFormats.webm) {
        // WAV recording using ScriptProcessorNode for raw PCM capture
        wavBuffersRef.current = [[], []];
        const bufferSize = 4096;
        const scriptProcessor = ctx.createScriptProcessor(bufferSize, 2, 2);
        
        scriptProcessor.onaudioprocess = (e) => {
          const leftData = e.inputBuffer.getChannelData(0);
          const rightData = e.inputBuffer.getChannelData(1);
          // Copy the data since the buffer is reused
          wavBuffersRef.current[0].push(new Float32Array(leftData));
          wavBuffersRef.current[1].push(new Float32Array(rightData));
        };
        
        limiterNode.connect(scriptProcessor);
        scriptProcessor.connect(ctx.destination); // Required for processing to work
        scriptProcessorRef.current = scriptProcessor;
      }
      
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
      
      // Set up stem recording for each enabled stem
      const stemNodes = audioEngine.getAllStemNodes();
      const enabledStems = Object.entries(recordStems).filter(([, enabled]) => enabled);
      
      for (const [stemName, isEnabled] of enabledStems) {
        if (!isEnabled) continue;
        
        const stemNode = stemNodes[stemName];
        if (!stemNode) {
          console.warn(`Stem node not available for ${stemName}`);
          continue;
        }
        
        // Clear previous buffers
        stemBuffersRef.current[stemName as StemName] = [[], []];
        
        // Create ScriptProcessor for this stem
        const bufferSize = 4096;
        const stemProcessor = ctx.createScriptProcessor(bufferSize, 2, 2);
        
        const stemNameCapture = stemName as StemName;
        stemProcessor.onaudioprocess = (e) => {
          const leftData = e.inputBuffer.getChannelData(0);
          const rightData = e.inputBuffer.getChannelData(1);
          // Copy the data since the buffer is reused
          stemBuffersRef.current[stemNameCapture][0].push(new Float32Array(leftData));
          stemBuffersRef.current[stemNameCapture][1].push(new Float32Array(rightData));
        };
        
        // Connect stem node to its processor
        stemNode.connect(stemProcessor);
        stemProcessor.connect(ctx.destination); // Required for processing to work
        stemProcessorsRef.current[stemName as StemName] = stemProcessor;
        
        console.log(`Stem recording started for: ${stemName}`);
      }
      
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
      }, 1000);

      const formats = [recordFormats.webm && 'WebM', recordFormats.wav && 'WAV'].filter(Boolean).join(' + ');
      const stemCount = Object.values(recordStems).filter(Boolean).length;
      const stemInfo = stemCount > 0 ? ` + ${stemCount} stems` : '';
      console.log(`Recording started: ${formats}${stemInfo}`);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const handleStopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    const ctx = audioEngine.getAudioContext();
    const limiterNode = audioEngine.getLimiterNode();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    // Stop ScriptProcessor for WAV
    if (scriptProcessorRef.current) {
      if (limiterNode) {
        try {
          limiterNode.disconnect(scriptProcessorRef.current);
        } catch (e) { /* ignore */ }
      }
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    
    // Collect all files for zip archive
    const filesToZip: Array<{ filename: string; blob: Blob }> = [];
    
    // Export WAV if selected
    if (recordFormats.wav) {
      const leftBuffers = wavBuffersRef.current[0];
      const rightBuffers = wavBuffersRef.current[1];
      const totalSamples = leftBuffers.reduce((acc, buf) => acc + buf.length, 0);
      
      if (totalSamples > 0) {
        const leftChannel = new Float32Array(totalSamples);
        const rightChannel = new Float32Array(totalSamples);
        let offset = 0;
        for (let i = 0; i < leftBuffers.length; i++) {
          leftChannel.set(leftBuffers[i], offset);
          rightChannel.set(rightBuffers[i], offset);
          offset += leftBuffers[i].length;
        }
        
        const sampleRate = ctx?.sampleRate || 48000;
        const wavBuffer = encodeWav24bit(leftChannel, rightChannel, sampleRate);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        filesToZip.push({ filename: `kessho-${timestamp}.wav`, blob });
        
        console.log(`WAV prepared: ${totalSamples} samples at ${sampleRate}Hz, 24-bit`);
      }
    }
    
    wavBuffersRef.current = [[], []];
    
    // Stop and export WebM if selected
    let webmPending = false;
    if (recordFormats.webm && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      webmPending = true;
      // Set up export callback before stopping
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        filesToZip.push({ filename: `kessho-${timestamp}.webm`, blob });
        webmPending = false;

        if (recordingStreamDestRef.current && limiterNode) {
          try {
            limiterNode.disconnect(recordingStreamDestRef.current);
          } catch (e) { /* ignore */ }
          recordingStreamDestRef.current = null;
        }
        
        console.log('WebM prepared');
      };
      
      mediaRecorderRef.current.stop();
    }
    
    // Stop and export stem recordings
    const stemNodes = audioEngine.getAllStemNodes();
    const sampleRate = ctx?.sampleRate || 48000;
    
    for (const [stemName, processor] of Object.entries(stemProcessorsRef.current)) {
      if (!processor) continue;
      
      const stemNode = stemNodes[stemName];
      
      // Disconnect the processor
      if (stemNode) {
        try {
          stemNode.disconnect(processor);
        } catch (e) { /* ignore */ }
      }
      processor.disconnect();
      stemProcessorsRef.current[stemName as StemName] = null;
      
      // Prepare stem WAV
      const leftBuffers = stemBuffersRef.current[stemName as StemName][0];
      const rightBuffers = stemBuffersRef.current[stemName as StemName][1];
      const totalSamples = leftBuffers.reduce((acc, buf) => acc + buf.length, 0);
      
      if (totalSamples > 0) {
        const leftChannel = new Float32Array(totalSamples);
        const rightChannel = new Float32Array(totalSamples);
        let offset = 0;
        for (let i = 0; i < leftBuffers.length; i++) {
          leftChannel.set(leftBuffers[i], offset);
          rightChannel.set(rightBuffers[i], offset);
          offset += leftBuffers[i].length;
        }
        
        const wavBuffer = encodeWav24bit(leftChannel, rightChannel, sampleRate);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        filesToZip.push({ filename: `kessho-${timestamp}-${stemName}.wav`, blob });
        
        console.log(`Stem prepared: ${stemName} - ${totalSamples} samples at ${sampleRate}Hz, 24-bit`);
      }
      
      // Clear buffer
      stemBuffersRef.current[stemName as StemName] = [[], []];
    }
    
    // Create and download zip archive (or single file if only one)
    const createAndDownloadArchive = async () => {
      // Wait for WebM onstop callback if WebM recording was active
      if (webmPending) {
        let waitCount = 0;
        while (webmPending && waitCount < 50) { // Max 5 seconds wait
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
      }
      
      if (filesToZip.length === 0) {
        console.log('No files to export');
        return;
      }
      
      // If only one file, download directly (no need for zip)
      if (filesToZip.length === 1) {
        const { filename, blob } = filesToZip[0];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`Exported: ${filename}`);
        return;
      }
      
      // Multiple files: create a zip archive
      console.log(`Creating zip archive with ${filesToZip.length} files...`);
      const zip = new JSZip();
      
      // Add all files to zip
      for (const { filename, blob } of filesToZip) {
        zip.file(filename, blob);
      }
      
      // Generate zip blob
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 } // Balance between speed and compression
      });
      
      // Download zip
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kessho-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`Exported: kessho-${timestamp}.zip (${filesToZip.length} files)`);
    };
    
    // Start archive creation with a brief initial delay
    setTimeout(() => createAndDownloadArchive(), 100);
    
    setIsRecording(false);
    setRecordingDuration(0);
    console.log('Recording stopped');
  };

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
      state,
      dualRanges: Object.keys(dualRangesObj).length > 0 ? dualRangesObj : undefined,
      sliderModes: Object.keys(modesObj).length > 0 ? modesObj : undefined,
    };
    
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
      const valA = typeof stateA[key] === 'number' ? stateA[key] as number : 0;
      const valB = typeof stateB[key] === 'number' ? stateB[key] as number : 0;
      
      // Resolve effective mode per preset: explicit mode, or infer 'walk' when
      // a dualRange exists without an explicit sliderMode (same default used by
      // applyDualRangesFromPreset). Without this, a missing mode causes the ||
      // fallback chain to pick the OTHER preset's mode, defeating the midpoint snap.
      const modeA: SliderMode | undefined = rawModesA[keyStr] || (rangeA ? 'walk' : undefined);
      const modeB: SliderMode | undefined = rawModesB[keyStr] || (rangeB ? 'walk' : undefined);
      
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
        'granularReverbSend', 'granularLevel',
      ],
      leadEnabled: [
        'lead1Attack', 'lead1Decay', 'lead1Sustain', 'lead1Release',
        'lead2Attack', 'lead2Decay', 'lead2Sustain', 'lead2Release',
        'leadDelayTime', 'leadDelayFeedback',
        'leadDelayMix', 'lead1Density',
        'lead1Octave', 'lead1OctaveRange',
        'leadVibratoDepth', 'leadVibratoRate',
        'leadGlide', 'leadReverbSend', 'leadDelayReverbSend'
      ],
      synthEuclideanMasterEnabled: [
        'synthEuclideanTempo'
      ],
      oceanSampleEnabled: [
        'oceanFilterCutoff', 'oceanFilterResonance',
        'oceanDuration', 'oceanInterval',
        'oceanFoam', 'oceanDepth'
      ]
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
      'masterVolume', 'synthLevel', 'pad2Level', 'granularLevel', 'synthReverbSend', 'granularReverbSend',
      'leadReverbSend', 'leadDelayReverbSend', 'reverbLevel', 'randomness', 'tension',
      'chordRate', 'voicingSpread', 'waveSpread', 'detune', 'synthAttack', 'synthDecay',
      'synthSustain', 'synthRelease', 'synthVoiceMask', 'synthOctave', 'hardness',
      'filterCutoffMin', 'filterCutoffMax', 'filterResonance', 'filterQ',
      'warmth', 'presence', 'reverbDecay', 'reverbSize', 'reverbDiffusion',
      'reverbModulation', 'predelay', 'damping', 'width',
      'reverbShimmer', 'reverbShimmerPitch', 'reverbSlowModRate', 'reverbSlowModDepth',
      'reverbReverse', 'reverbReverseLength',
      'grainProbability', 'grainSize',
      'density', 'spray', 'jitter', 'pitchSpread', 'stereoSpread', 'feedback',
      'wetHPF', 'wetLPF', 'leadLevel', 'lead1Level', 'lead2Level', 'lead1Attack', 'lead1Decay', 'lead1Sustain', 'lead1Release',
      'lead2Attack', 'lead2Decay', 'lead2Sustain', 'lead2Release',
      'leadDelayTime', 'leadDelayFeedback',
      'leadDelayMix', 'lead1Density', 'lead1Octave',
      'lead1OctaveRange',
      'leadVibratoDepth', 'leadVibratoRate',
      'leadGlide', 'synthEuclideanTempo',
      'oceanSampleLevel', 'oceanWaveSynthLevel', 'oceanFilterCutoff', 'oceanFilterResonance',
      'oceanDuration', 'oceanInterval',
      'oceanFoam', 'oceanDepth',
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
      'pad2FilterCutoffMin', 'pad2FilterCutoffMax', 'pad2FilterResonance', 'pad2FilterQ',
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
      'oceanSampleEnabled', 'oceanWaveSynthEnabled'
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
      const currentState = autoMorphStateRef.current; // Read current state from ref
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
      audioEngine.resetCofDrift();
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
    
    // Initialize random walk for any new dual sliders and update positions state
    const newWalkPositions: Record<string, number> = {};
    Object.entries(morphResult.dualModes).forEach(([key, mode]) => {
      if (mode === 'single') return; // Skip keys that collapsed to single
      const paramKey = key as keyof SliderState;
      if (!randomWalkRef.current[paramKey]) {
        const walkPos = Math.random();
        randomWalkRef.current[paramKey] = {
          position: walkPos,
          velocity: (Math.random() - 0.5) * 0.02,
        };
      }
      // Always sync ref to state for all active dual sliders
      newWalkPositions[key] = randomWalkRef.current[paramKey]?.position ?? 0.5;
    });
    setRandomWalkPositions(newWalkPositions);
    
    // Clean up refs for sliders that are no longer dual (or collapsed to single by morph)
    Object.keys(randomWalkRef.current).forEach(key => {
      const morphMode = morphResult.dualModes[key];
      // Remove if: not morph-managed at all, OR morph says it's now single
      if (morphMode === undefined || morphMode === 'single') {
        // But only remove if it was morph-managed — keep user-set walk refs
        if (morphMode === 'single') {
          delete randomWalkRef.current[key as keyof SliderState];
        }
      }
    });
  }, [morphPresetA, morphPresetB, lerpPresets, engineState.cofCurrentStep]);

  // Auto-cycle morph effect - continuous smooth animation
  const morphStartTimeRef = useRef<number>(Date.now());
  const lastMorphPosRef = useRef<number>(0);
  const manualPositionOnEnterRef = useRef<number>(0); // Track position when entering auto mode
  const cofCurrentStepRef = useRef<number>(0); // Current CoF step for morph calculations
  
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
    
    // PHRASE_LENGTH is imported from harmony.ts (16 seconds per phrase)
    // Use refs for phrase settings to avoid restarting effect when they change
    const getPlayDuration = () => morphPlayPhrasesRef.current * PHRASE_LENGTH * 1000;
    const getTransitionDuration = () => morphTransitionPhrasesRef.current * PHRASE_LENGTH * 1000;
    const HOLD_DURATION = PHRASE_LENGTH * 1000; // Hold current position for 1 phrase before transitioning
    
    // Capture the current manual position when entering auto mode
    morphStartTimeRef.current = Date.now();
    manualPositionOnEnterRef.current = morphPosition;
    lastMorphPosRef.current = -1; // Force first update
    
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
    
    const animate = () => {
      const now = Date.now();
      const phaseElapsed = now - phaseStartTimeRef.current;
      const phaseDuration = phaseDurationRef.current;
      
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
      
      // Only update if position changed
      if (lastMorphPosRef.current !== newPos) {
        lastMorphPosRef.current = newPos;
        setMorphPosition(newPos);
        
        // Apply morph inline (not inside state setter)
        if (!samePreset) {
          const direction = morphDirectionRef.current || 'toB';
          const morphResult = lerpPresets(effectiveA, effectiveB, newPos, cofCurrentStepRef.current, morphCapturedStartRootRef.current ?? undefined, direction);
          
          // Preserve user preference keys (like reverbQuality) that shouldn't change with morphing
          const stateWithPrefs = { ...morphResult.state };
          for (const key of USER_PREFERENCE_KEYS) {
            (stateWithPrefs as Record<string, unknown>)[key] = state[key];
          }
          
          setState(stateWithPrefs);
          audioEngine.updateParams(stateWithPrefs);
          
          // Update CoF morph visualization (clear at endpoints - we've arrived)
          const atEndpoint = isAtEndpoint0(newPos, true) || isAtEndpoint1(newPos, true);
          setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));
          
          // Reset CoF drift when reaching an endpoint
          if (atEndpoint) {
            audioEngine.resetCofDrift();
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
          
          // Initialize random walk for any new dual sliders and update positions state
          const newWalkPositions: Record<string, number> = {};
          Object.entries(morphResult.dualModes).forEach(([key, mode]) => {
            if (mode === 'single') return;
            const paramKey = key as keyof SliderState;
            if (!randomWalkRef.current[paramKey]) {
              const walkPos = Math.random();
              randomWalkRef.current[paramKey] = {
                position: walkPos,
                velocity: (Math.random() - 0.5) * 0.02,
              };
            }
            // Always sync ref to state for all active dual sliders
            newWalkPositions[key] = randomWalkRef.current[paramKey]?.position ?? 0.5;
          });
          setRandomWalkPositions(newWalkPositions);
          
          // Clean up refs for sliders that morphed to single
          Object.keys(randomWalkRef.current).forEach(key => {
            if (morphResult.dualModes[key] === 'single') {
              delete randomWalkRef.current[key as keyof SliderState];
            }
          });
        }
      }
      
      // Update countdown UI
      const phrasesLeft = Math.ceil(timeLeftInPhase / (PHRASE_LENGTH * 1000));
      setMorphCountdown({ phase: phaseName, phrasesLeft });
    };
    
    // Run at 10Hz for smooth animation (same as random walk)
    const intervalId = window.setInterval(animate, 100);
    animate(); // Run immediately
    
    return () => {
      clearInterval(intervalId);
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
      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
    }
    // If in mid-morph, the useEffect will handle applying the interpolated state
    
    setShowPresetList(false);
  }, [uiMode, morphLoadTarget, handleLoadPresetToSlot, state, sliderModes, dualSliderRanges, morphPresetB, morphPosition, snowflakeActivated]);

  // Delete preset - just removes from UI list (can't delete files from browser)
  const handleDeletePreset = (index: number) => {
    const updatedPresets = savedPresets.filter((_, i) => i !== index);
    setSavedPresets(updatedPresets);
  };

  // Load preset from file (for importing)
  const handleLoadPreset = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
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
          };
          
          // Add to preset list for display
          setSavedPresets(prev => [...prev, importedPreset]);
          
          // In advanced mode, show dialog to choose slot A or B
          if (uiMode === 'advanced') {
            setPendingUploadPreset(importedPreset);
            setUploadSlotDialogOpen(true);
          } else {
            // In snowflake mode, just apply directly
            setState(result.state);
            audioEngine.updateParams(result.state);
            audioEngine.resetCofDrift();
            
            // Apply dual ranges and slider modes from migrated preset
            applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
          }
        }
      } catch (err) {
        console.error('Failed to load preset:', err);
        alert('Failed to load preset. Invalid file format.');
      }
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
    
    // Start audio engine if not already running
    if (!engineState.isRunning) {
      console.log('[Journey] Starting audio engine');
      try {
        setupIOSMediaSession();
        await audioEngine.start(preset.state);
        connectMediaSessionToWebAudio();
      } catch (err) {
        console.error('[Journey] Failed to start audio:', err);
      }
    }
  }, [savedPresets, handleLoadPresetFromList, engineState.isRunning, audioEngine, setupIOSMediaSession, connectMediaSessionToWebAudio]);
  
  // Journey mode: morph to a target preset over specified duration
  const journeyMorphAnimationRef = useRef<number | null>(null);
  
  const handleJourneyMorphTo = useCallback((targetPresetName: string, durationPhrases: number) => {
    const preset = savedPresets.find(p => p.name === targetPresetName);
    if (!preset) {
      console.warn('[Journey] Target preset not found:', targetPresetName);
      return;
    }
    
    const direction = journeyMorphDirectionRef.current;
    console.log('[Journey] Morphing to:', targetPresetName, 'over', durationPhrases, 'phrases', 'direction:', direction);
    
    // Cancel any existing morph animation
    if (journeyMorphAnimationRef.current) {
      cancelAnimationFrame(journeyMorphAnimationRef.current);
    }
    
    // Calculate duration in milliseconds using phrase-based timing
    // 1 phrase = PHRASE_LENGTH seconds (default 16s)
    const msPerPhrase = PHRASE_LENGTH * 1000;
    const durationMs = durationPhrases * msPerPhrase;
    
    console.log('[Journey] Morph duration:', durationMs, 'ms (', durationPhrases, 'phrases x', PHRASE_LENGTH, 's)');
    
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
      const currentState = autoMorphStateRef.current;
      for (const key of USER_PREFERENCE_KEYS) {
        (stateWithPrefs as Record<string, unknown>)[key] = currentState[key];
      }
      
      // ALWAYS update audio engine at full frame rate for smooth audio
      audioEngine.updateParams(stateWithPrefs);
      
      // Throttle React setState calls to ~15fps to avoid re-render storms
      const shouldUpdateUI = now - lastUIUpdate >= 66 || progress >= 1;
      if (shouldUpdateUI) {
        lastUIUpdate = now;
        
        // Update position state
        setMorphPosition(newPosition);
        
        // Apply the morphed state to React
        setState(stateWithPrefs);
        
        // Update CoF morph visualization (clear at endpoints)
        const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);
        setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));
        
        if (atEndpoint) {
          audioEngine.resetCofDrift();
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
      }
      
      if (progress < 1) {
        journeyMorphAnimationRef.current = requestAnimationFrame(animateMorph);
      } else {
        // Morph complete - alternate direction for next morph
        // console.log('[Journey] Morph complete at position:', endPosition);
        journeyMorphDirectionRef.current = direction === 'toB' ? 'toA' : 'toB';
        journeyMorphAnimationRef.current = null;
      }
    };
    
    journeyMorphAnimationRef.current = requestAnimationFrame(animateMorph);
  }, [savedPresets, lerpPresets, engineState.cofCurrentStep, audioEngine]);
  
  // Journey mode: handle journey end
  const handleJourneyEnd = useCallback(() => {
    // Cancel any ongoing morph animation
    if (journeyMorphAnimationRef.current) {
      cancelAnimationFrame(journeyMorphAnimationRef.current);
      journeyMorphAnimationRef.current = null;
    }
    
    // Unlock sliders
    setIsJourneyPlaying(false);
    
    // Keep the last preset playing - don't stop audio
    // User can manually stop if desired
  }, []);
  
  // Update refs for journey hook callbacks
  useEffect(() => {
    journeyLoadPresetRef.current = handleJourneyLoadPreset;
    journeyMorphToRef.current = handleJourneyMorphTo;
  }, [handleJourneyLoadPreset, handleJourneyMorphTo]);
  
  // Cleanup journey animation on unmount
  useEffect(() => {
    return () => {
      if (journeyMorphAnimationRef.current) {
        cancelAnimationFrame(journeyMorphAnimationRef.current);
      }
    };
  }, []);

  // Render journey mode UI
  if (uiMode === 'journey') {
    return (
      <JourneyModeView
        presets={savedPresets}
        journey={journey}
        onJourneyEnd={handleJourneyEnd}
        onStopAudio={handleStop}
        onShowSnowflake={() => setUiMode('snowflake')}
        onShowAdvanced={() => setUiMode('advanced')}
        isPlaying={engineState.isRunning}
      />
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
            onTogglePlay={(engineState.isRunning || isJourneyPlaying) ? handleStop : handleStart}
            onLoadPreset={handleLoadPresetFromList}
            presets={savedPresets}
            isPlaying={engineState.isRunning || isJourneyPlaying}
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
    <div className="app-container" style={{ ...styles.container, ...m?.container }}>
      <CpuOverlay />
      {/* Controls - centered */}
      <div className="app-controls" style={{ ...styles.controls, paddingTop: '12px', ...m?.controls }}>
        {!(engineState.isRunning || isJourneyPlaying) ? (
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
              handleStopRecording();
            } else if (engineState.isRunning) {
              handleStartRecording();
            } else {
              handleArmRecording();
            }
          }}
          title={isRecording ? `Recording ${formatRecordingTime(recordingDuration)} - Click to stop` : isRecordingArmed ? 'Recording armed - will start with playback (click to disarm)' : (engineState.isRunning ? 'Start Recording' : 'Arm Recording (will start with playback)')}
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
          onClick={() => fileInputRef.current?.click()}
          title="Import Preset"
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
          ❄︎
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
          <h4 style={{ margin: '0 0 10px', color: '#a855f7' }}>Presets (from /presets folder)</h4>
          {presetsLoading ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Loading presets...</p>
          ) : savedPresets.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No presets found. Save one to the presets folder.</p>
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
                    title="Remove from list (doesn't delete file)"
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
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'global' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('global')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>{TEXT_SYMBOLS.target}</span>
          <span>Global</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'synth' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('synth')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>∿</span>
          <span>Synth</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'drums' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('drums')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>⋮⋮</span>
          <span>Drums</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'reverb' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('reverb')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>◈</span>
          <span>Reverb</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'looper' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('looper')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>⊞</span>
          <span>Granular</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'earth' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('earth')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>{"\u2248"}</span>
          <span>Earth</span>
        </button>
      </div>

      {/* Parameter Grid */}
      <div className="app-grid" style={{ ...styles.grid, ...m?.grid }}>
        {/* === GLOBAL TAB === */}
        {activeTab === 'global' && (
          <>
        {/* Master Mixer */}
        <CollapsiblePanel
          id="mixer"
          title="Master Mixer"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('mixer')}
          onToggle={togglePanel}
        >
          <Slider
            label="Master Volume"
            value={state.masterVolume}
            paramKey="masterVolume"
            onChange={handleSliderChange}
            {...sliderProps('masterVolume')}
          />
          <Slider
            label="Pad 1 Level"
            value={state.synthLevel}
            paramKey="synthLevel"
            onChange={handleSliderChange}
            {...sliderProps('synthLevel')}
          />
          <Slider
            label="Pad 2 Level"
            value={state.pad2Level}
            paramKey="pad2Level"
            onChange={handleSliderChange}
            {...sliderProps('pad2Level')}
          />
          <Slider
            label="Granular Level"
            value={state.granularLevel}
            paramKey="granularLevel"
            onChange={handleSliderChange}
            {...sliderProps('granularLevel')}
          />
          <Slider
            label="Lead Level"
            value={state.leadLevel}
            paramKey="leadLevel"
            onChange={handleSliderChange}
            {...sliderProps('leadLevel')}
          />
          <Slider
            label="Lead 2 Level"
            value={state.lead2Level}
            paramKey="lead2Level"
            onChange={handleSliderChange}
            {...sliderProps('lead2Level')}
          />
          <Slider
            label="Drum Level"
            value={state.drumLevel}
            paramKey="drumLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumLevel')}
          />
          <Slider
            label="Waves Level"
            value={state.oceanSampleLevel}
            paramKey="oceanSampleLevel"
            onChange={handleSliderChange}
            {...sliderProps('oceanSampleLevel')}
          />
          
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px' }}>Reverb Sends</div>
            <Slider
              label="Synth → Reverb"
              value={state.synthReverbSend}
              paramKey="synthReverbSend"
              onChange={handleSliderChange}
              {...sliderProps('synthReverbSend')}
            />
            <Slider
              label="Granular → Reverb"
              value={state.granularReverbSend}
              paramKey="granularReverbSend"
              onChange={handleSliderChange}
              {...sliderProps('granularReverbSend')}
            />
            <Slider
              label="Drum → Reverb"
              value={state.drumReverbSend}
              paramKey="drumReverbSend"
              onChange={handleSliderChange}
              {...sliderProps('drumReverbSend')}
            />
            <Slider
              label="Lead → Reverb"
              value={state.leadReverbSend}
              paramKey="leadReverbSend"
              onChange={handleSliderChange}
              {...sliderProps('leadReverbSend')}
            />
            <Slider
              label="Reverb Level"
              value={state.reverbLevel}
              paramKey="reverbLevel"
              onChange={handleSliderChange}
              {...sliderProps('reverbLevel')}
            />
          </div>
        </CollapsiblePanel>

        {/* Global */}
        <CollapsiblePanel
          id="global"
          title="Global"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('global')}
          onToggle={togglePanel}
        >
          <Select
            label="Root Note"
            value={String(state.rootNote)}
            options={[
              { value: '0', label: 'C' },
              { value: '1', label: 'C#' },
              { value: '2', label: 'D' },
              { value: '3', label: 'D#' },
              { value: '4', label: 'E' },
              { value: '5', label: 'F' },
              { value: '6', label: 'F#' },
              { value: '7', label: 'G' },
              { value: '8', label: 'G#' },
              { value: '9', label: 'A' },
              { value: '10', label: 'A#' },
              { value: '11', label: 'B' },
            ]}
            onChange={(v) => handleSelectChange('rootNote', parseInt(v, 10))}
          />
          
          {/* Circle of Fifths Drift */}
          <div style={{ 
            marginTop: '16px', 
            marginBottom: '8px', 
            padding: '12px',
            background: '#1a1a1a',
            borderRadius: '8px',
            border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: state.cofDriftEnabled ? '#4ade80' : '#666' }}>
                Circle of Fifths Drift
              </span>
              <button
                onClick={() => handleSelectChange('cofDriftEnabled', !state.cofDriftEnabled)}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  background: state.cofDriftEnabled ? '#22c55e' : '#333',
                  border: 'none',
                  borderRadius: '4px',
                  color: state.cofDriftEnabled ? '#000' : '#888',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {state.cofDriftEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            
            <CircleOfFifths
              homeRoot={state.rootNote}
              currentStep={morphCoFViz ? morphCoFViz.cofStep : engineState.cofCurrentStep}
              driftRange={state.cofDriftRange}
              driftDirection={state.cofDriftDirection}
              enabled={state.cofDriftEnabled}
              size={160}
              isMorphing={!!morphCoFViz}
              morphStartRoot={morphCoFViz?.startRoot}
              morphTargetRoot={morphCoFViz?.targetRoot}
              morphProgress={morphPosition}
              onSelectRoot={(semitone) => {
                setState(prev => ({ ...prev, rootNote: semitone }));
                audioEngine.resetCofDrift();
              }}
            />
            
            {state.cofDriftEnabled && (
              <>
                <div style={{ marginTop: '12px' }}>
                  <Slider
                    label="Drift Rate (phrases)"
                    value={state.cofDriftRate}
                    paramKey="cofDriftRate"
                    onChange={handleSliderChange}
                  />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <Select
                    label="Drift Direction"
                    value={state.cofDriftDirection}
                    options={[
                      { value: 'cw', label: '↻ Clockwise (sharps)' },
                      { value: 'ccw', label: '↺ Counter-clockwise (flats)' },
                      { value: 'random', label: `${TEXT_SYMBOLS.random} Random` },
                    ]}
                    onChange={(v) => handleSelectChange('cofDriftDirection', v)}
                  />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <Slider
                    label="Drift Range (max steps)"
                    value={state.cofDriftRange}
                    paramKey="cofDriftRange"
                    onChange={handleSliderChange}
                  />
                </div>
                <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                  Key drifts using pivot chord transitions for smooth modulation
                </div>
              </>
            )}
          </div>
          <Slider
            label="Randomness"
            value={state.randomness}
            paramKey="randomness"
            onChange={handleSliderChange}
            {...sliderProps('randomness')}
          />
          <Slider
            label="Random Walk Speed"
            value={state.randomWalkSpeed}
            paramKey="randomWalkSpeed"
            logarithmic
            onChange={handleSliderChange}
          />
          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '-8px', marginBottom: '8px' }}>
            Speed of value drift for range sliders (double-click any slider)
          </div>
          
          {/* Scale & Tension (moved from Harmony) */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px' }}>Scale & Tension</div>
            <Select
              label="Scale Mode"
              value={state.scaleMode}
              options={[
                { value: 'auto', label: 'Auto (tension-based)' },
                { value: 'manual', label: 'Manual' },
              ]}
              onChange={(v) => handleSelectChange('scaleMode', v)}
            />
            {state.scaleMode === 'manual' && (
              <Select
                label="Scale Family"
                value={state.manualScale}
                options={SCALE_FAMILIES.map((s) => ({ value: s.name, label: `${NOTE_NAMES[state.rootNote]} ${s.name}` }))}
                onChange={(v) => handleSelectChange('manualScale', v)}
              />
            )}
            <Slider
              label="Tension"
              value={state.tension}
              paramKey="tension"
              onChange={handleSliderChange}
              {...sliderProps('tension')}
            />
            <Select
              label="Seed Window"
              value={state.seedWindow}
              options={[
                { value: 'hour', label: 'Hour (changes hourly)' },
                { value: 'day', label: 'Day (changes daily)' },
              ]}
              onChange={(v) => handleSelectChange('seedWindow', v)}
            />
          </div>
        </CollapsiblePanel>

        {/* Preset Morph */}
        <CollapsiblePanel
          id="morph"
          title="Preset Morph"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('morph')}
          onToggle={togglePanel}
        >
          {/* Slot A - Dropdown */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6ee7b7' }}>Slot A</span>
              {morphPresetA && (
                <button
                  onClick={() => { setMorphPresetA(null); setMorphPosition(0); }}
                  style={{
                    padding: '2px 6px',
                    fontSize: '0.6rem',
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    borderRadius: '3px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={morphPresetA?.name || ''}
              onChange={(e) => {
                const presetName = e.target.value;
                if (presetName === '') {
                  setMorphPresetA(null);
                } else {
                  const preset = savedPresets.find(p => p.name === presetName);
                  if (preset) {
                    const migratedA = migratePreset(preset);
                    const normalizedPreset: SavedPreset = {
                      ...migratedA,
                      state: normalizePresetForWeb(migratedA.state),
                    };
                    // Capture current state and dual ranges before loading
                    if (!morphPresetB) {
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
                    }
                    setMorphPresetA(normalizedPreset);
                    
                    // Check if we should apply preset A values directly:
                    // - Only apply if we're at endpoint 0 (near position 0)
                    // - OR if no preset B is loaded yet (not in morph mode)
                    // At endpoint 1 (position ~100), we should keep the current B values
                    const atEndpoint0 = isAtEndpoint0(morphPosition, true);
                    const shouldApplyPresetA = atEndpoint0 || !morphPresetB;
                    
                    if (shouldApplyPresetA) {
                      const result = applyPreset(normalizedPreset, { migrate: false, currentState: state, normalize: s => s });
                      setState(result.state);
                      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
                    }
                    // If in mid-morph, the useEffect will handle applying the interpolated state
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: morphPresetA 
                  ? '#022c22' 
                  : 'rgba(30, 30, 40, 0.8)',
                border: `1px solid ${morphPresetA ? '#10b981' : '#444'}`,
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: morphPresetA ? '#6ee7b7' : '#888',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: morphPresetA
                  ? `linear-gradient(135deg, #064e3b, #022c22), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236ee7b7'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`
                  : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236ee7b7'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '16px',
                paddingRight: '32px',
              }}
            >
              <option value="" style={{ background: '#1a1a2e', color: '#888' }}>
                (empty - using current)
              </option>
              {savedPresets.map((preset, idx) => (
                <option 
                  key={`${preset.name}-${idx}`} 
                  value={preset.name}
                  style={{ background: '#1a1a2e', color: '#6ee7b7' }}
                >
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Morph Position Slider */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Morph Position</span>
              <span style={{ fontSize: '0.7rem', color: '#888' }}>{morphPosition}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.65rem', color: '#6ee7b7' }}>A</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={morphPosition}
                onChange={(e) => handleMorphPositionChange(parseInt(e.target.value))}
                disabled={!morphPresetA && !morphPresetB}
                style={{
                  flex: 1,
                  height: '6px',
                  cursor: (!morphPresetA && !morphPresetB) ? 'not-allowed' : 'pointer',
                  opacity: (!morphPresetA && !morphPresetB) ? 0.4 : 1,
                }}
              />
              <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>B</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginTop: '4px', 
              fontSize: '0.65rem', 
              color: '#888' 
            }}>
              {isAtEndpoint0(morphPosition, true) ? 'Full A' : 
               isAtEndpoint1(morphPosition, true) ? 'Full B' : 
               `${100 - morphPosition}% A + ${morphPosition}% B`}
            </div>
          </div>

          {/* Slot B - Dropdown */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a78bfa' }}>Slot B</span>
              {morphPresetB && (
                <button
                  onClick={() => { setMorphPresetB(null); setMorphPosition(0); }}
                  style={{
                    padding: '2px 6px',
                    fontSize: '0.6rem',
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    borderRadius: '3px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={morphPresetB?.name || ''}
              onChange={(e) => {
                const presetName = e.target.value;
                if (presetName === '') {
                  setMorphPresetB(null);
                } else {
                  const preset = savedPresets.find(p => p.name === presetName);
                  if (preset) {
                    const migratedB = migratePreset(preset);
                    const normalizedPreset: SavedPreset = {
                      ...migratedB,
                      state: normalizePresetForWeb(migratedB.state),
                    };
                    // Capture current state and dual ranges before loading
                    if (!morphPresetA) {
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
                    }
                    setMorphPresetB(normalizedPreset);

                    // Check if we should apply preset B values directly:
                    // - Only apply if we're at endpoint 1 (near position 100)
                    // - OR if no preset A is loaded yet (not in morph mode)
                    // At endpoint 0 (position ~0), we should keep the current A values
                    const atEndpoint1 = isAtEndpoint1(morphPosition, true);
                    const shouldApplyPresetB = atEndpoint1 || !morphPresetA;

                    if (shouldApplyPresetB) {
                      const result = applyPreset(normalizedPreset, { migrate: false, currentState: state, normalize: s => s });
                      setState(result.state);
                      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
                    }
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: morphPresetB 
                  ? '#2e1065' 
                  : 'rgba(30, 30, 40, 0.8)',
                border: `1px solid ${morphPresetB ? '#8b5cf6' : '#444'}`,
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: morphPresetB ? '#c4b5fd' : '#888',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: morphPresetB
                  ? `linear-gradient(135deg, #4c1d95, #2e1065), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a78bfa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`
                  : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a78bfa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '16px',
                paddingRight: '32px',
              }}
            >
              <option value="" style={{ background: '#1a1a2e', color: '#888' }}>
                (empty - using current)
              </option>
              {savedPresets.map((preset, idx) => (
                <option 
                  key={`${preset.name}-${idx}`} 
                  value={preset.name}
                  style={{ background: '#1a1a2e', color: '#c4b5fd' }}
                >
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Toggle */}
          <div style={{ marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid #333' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Mode:</span>
              <button
                onClick={() => setMorphMode('manual')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.7rem',
                  background: morphMode === 'manual' ? 'linear-gradient(135deg, #374151, #1f2937)' : 'transparent',
                  border: `1px solid ${morphMode === 'manual' ? '#6b7280' : '#444'}`,
                  borderRadius: '4px',
                  color: morphMode === 'manual' ? '#fff' : '#666',
                  cursor: 'pointer',
                }}
              >
                Manual
              </button>
              <button
                onClick={() => setMorphMode('auto')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.7rem',
                  background: morphMode === 'auto' ? 'linear-gradient(135deg, #374151, #1f2937)' : 'transparent',
                  border: `1px solid ${morphMode === 'auto' ? '#6b7280' : '#444'}`,
                  borderRadius: '4px',
                  color: morphMode === 'auto' ? '#fff' : '#666',
                  cursor: 'pointer',
                }}
              >
                Auto-Cycle
              </button>
            </div>
          </div>

          {/* Auto-Cycle Settings */}
          {morphMode === 'auto' && (
            <div style={{ 
              padding: '12px', 
              background: 'rgba(30, 30, 40, 0.4)', 
              borderRadius: '6px',
              border: '1px solid #333'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Play Phrases</span>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>{morphPlayPhrases}</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="64"
                  step="4"
                  value={morphPlayPhrases}
                  onChange={(e) => setMorphPlayPhrases(parseInt(e.target.value))}
                  style={{ width: '100%', height: '6px', cursor: 'pointer' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Morph Phrases</span>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>{morphTransitionPhrases}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="32"
                  step="2"
                  value={morphTransitionPhrases}
                  onChange={(e) => setMorphTransitionPhrases(parseInt(e.target.value))}
                  style={{ width: '100%', height: '6px', cursor: 'pointer' }}
                />
              </div>
              <div style={{ fontSize: '0.65rem', color: '#666', textAlign: 'center' }}>
                Cycle: {morphPlayPhrases}→morph({morphTransitionPhrases})→{morphPlayPhrases}→morph({morphTransitionPhrases})
              </div>
              
              {/* Countdown Display */}
              {morphCountdown && engineState.isRunning && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '8px 12px', 
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))',
                  borderRadius: '6px',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.65rem', color: '#a5b4fc', marginBottom: '2px' }}>
                    {morphCountdown.phase}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#c4b5fd' }}>
                    {morphCountdown.phrasesLeft} phrase{morphCountdown.phrasesLeft !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </div>
          )}
        </CollapsiblePanel>

        {/* Cloud Presets */}
        <CloudPresets
          currentState={state}
          onLoadPreset={(presetState, _name) => {
            const result = applyPreset({ state: presetState, name: _name }, { currentState: state, normalize: normalizePresetForWeb });
            setState(result.state);
            applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
          }}
        />

        {/* Recording */}
        <CollapsiblePanel
          id="recording"
          title="Recording"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('recording')}
          onToggle={togglePanel}
        >
          {/* Format Selection - can select both */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>Output Format</div>
            <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: '8px' }}>
              Select one or both formats to record simultaneously
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setRecordFormats(prev => ({ ...prev, webm: !prev.webm }))}
                disabled={isRecording}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '6px',
                  border: `1px solid ${recordFormats.webm ? '#22c55e' : '#444'}`,
                  background: recordFormats.webm ? 'linear-gradient(135deg, #166534, #14532d)' : 'rgba(30, 30, 40, 0.8)',
                  color: recordFormats.webm ? '#86efac' : '#888',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  opacity: isRecording ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{recordFormats.webm ? '●' : '○'} WebM</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Opus · ~2 MB/min</div>
              </button>
              <button
                onClick={() => setRecordFormats(prev => ({ ...prev, wav: !prev.wav }))}
                disabled={isRecording}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '6px',
                  border: `1px solid ${recordFormats.wav ? '#22c55e' : '#444'}`,
                  background: recordFormats.wav ? 'linear-gradient(135deg, #166534, #14532d)' : 'rgba(30, 30, 40, 0.8)',
                  color: recordFormats.wav ? '#86efac' : '#888',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  opacity: isRecording ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{recordFormats.wav ? '●' : '○'} WAV</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>24-bit 48kHz · ~17 MB/min</div>
              </button>
            </div>
          </div>

          {/* Stem Recording Options */}
          <div style={{ marginBottom: '16px', paddingTop: '12px', borderTop: '1px solid #333' }}>
            <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '8px' }}>
              Stem Recording (Pre-Reverb)
            </div>
            <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: '12px' }}>
              Record individual engine outputs before reverb send
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { key: 'synth', label: 'Synth' },
                { key: 'lead', label: 'Lead' },
                { key: 'drums', label: 'Drums' },
                { key: 'waves', label: 'Waves' },
                { key: 'granular', label: 'Granular' },
                { key: 'reverb', label: 'Reverb' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRecordStems(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                  disabled={isRecording}
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: `1px solid ${recordStems[key as keyof typeof recordStems] ? '#3b82f6' : '#444'}`,
                    background: recordStems[key as keyof typeof recordStems] 
                      ? 'linear-gradient(135deg, #1e40af, #1e3a8a)' 
                      : 'rgba(30, 30, 40, 0.8)',
                    color: recordStems[key as keyof typeof recordStems] ? '#93c5fd' : '#888',
                    cursor: isRecording ? 'not-allowed' : 'pointer',
                    opacity: isRecording ? 0.5 : 1,
                    fontSize: '0.75rem',
                    fontWeight: recordStems[key as keyof typeof recordStems] ? 'bold' : 'normal',
                  }}
                >
                  {recordStems[key as keyof typeof recordStems] ? '●' : '○'} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recording Status */}
          {isRecording && (
            <div style={{ 
              padding: '12px', 
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.2))',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              textAlign: 'center',
            }}>
              <div style={{ 
                fontSize: '1.5rem', 
                fontWeight: 'bold', 
                color: '#fca5a5',
                animation: 'pulse 1s ease-in-out infinite',
              }}>
                ● {formatRecordingTime(recordingDuration)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '4px' }}>
                Recording in progress...
              </div>
            </div>
          )}
        </CollapsiblePanel>

        {/* Playback Timer */}
        <CollapsiblePanel
          id="playback-timer"
          title="Playback Timer"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('playback-timer')}
          onToggle={togglePanel}
        >
          {/* Timer Enable Toggle */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#aaa' }}>Auto-Stop Timer</div>
                <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '2px' }}>
                  Automatically stop playback after set duration
                </div>
              </div>
              <button
                onClick={() => setPlaybackTimerEnabled(!playbackTimerEnabled)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: `1px solid ${playbackTimerEnabled ? '#f59e0b' : '#444'}`,
                  background: playbackTimerEnabled 
                    ? 'linear-gradient(135deg, #b45309, #92400e)' 
                    : 'rgba(30, 30, 40, 0.8)',
                  color: playbackTimerEnabled ? '#fcd34d' : '#888',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                }}
              >
                {playbackTimerEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Duration Selection */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '8px' }}>
              Duration {engineState.isRunning && playbackTimerEnabled && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>(click to reset)</span>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {[5, 15, 30, 60, 90, 120].map(mins => (
                <button
                  key={mins}
                  onClick={() => {
                    setPlaybackTimerMinutes(mins);
                    // If timer is running, reset to the new duration
                    if (engineState.isRunning && playbackTimerEnabled) {
                      setPlaybackTimerRemaining(mins * 60);
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${playbackTimerMinutes === mins ? '#f59e0b' : '#444'}`,
                    background: playbackTimerMinutes === mins 
                      ? 'linear-gradient(135deg, #b45309, #92400e)' 
                      : 'rgba(30, 30, 40, 0.8)',
                    color: playbackTimerMinutes === mins ? '#fcd34d' : '#888',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    minWidth: '50px',
                  }}
                >
                  {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              ))}
              {/* Custom time input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  min="1"
                  max="480"
                  value={![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? playbackTimerMinutes : ''}
                  placeholder="Custom"
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1 && val <= 480) {
                      setPlaybackTimerMinutes(val);
                      if (engineState.isRunning && playbackTimerEnabled) {
                        setPlaybackTimerRemaining(val * 60);
                      }
                    }
                  }}
                  style={{
                    width: '60px',
                    padding: '8px',
                    borderRadius: '6px',
                    border: `1px solid ${![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? '#f59e0b' : '#444'}`,
                    background: ![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes)
                      ? 'linear-gradient(135deg, #b45309, #92400e)'
                      : 'rgba(30, 30, 40, 0.8)',
                    color: ![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? '#fcd34d' : '#888',
                    fontSize: '0.8rem',
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#666' }}>min</span>
              </div>
            </div>
          </div>

          {/* Timer Status */}
          {playbackTimerEnabled && playbackTimerRemaining !== null && (
            <div style={{ 
              padding: '12px', 
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(180, 83, 9, 0.2))',
              borderRadius: '8px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              textAlign: 'center',
            }}>
              <div style={{ 
                fontSize: '1.5rem', 
                fontWeight: 'bold', 
                color: '#fcd34d',
              }}>
                ⏱ {Math.floor(playbackTimerRemaining / 60)}:{(playbackTimerRemaining % 60).toString().padStart(2, '0')}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '4px' }}>
                Remaining until auto-stop
              </div>
            </div>
          )}

          {/* Info when enabled but not running */}
          {playbackTimerEnabled && playbackTimerRemaining === null && !engineState.isRunning && (
            <div style={{ 
              padding: '12px', 
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: '#d97706',
            }}>
              Timer will start when playback begins ({playbackTimerMinutes} min)
            </div>
          )}
        </CollapsiblePanel>
        </>)}

        {/* === SYNTH + LEAD TAB === */}
        {activeTab === 'synth' && (
          <SynthPage
            state={state}
            isMobile={isMobile}
            expandedPanels={expandedPanels}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            togglePanel={togglePanel}
            sliderProps={sliderProps}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            SelectComponent={Select as unknown as React.ComponentType<Record<string, unknown>>}
            CollapsiblePanelComponent={CollapsiblePanel as unknown as React.ComponentType<Record<string, unknown>>}
            lead4opPresets={lead4opPresets}
            liveFilterFreq={liveFilterFreq}
            liveLfoValue={liveLfoValue}
            isRunning={engineState.isRunning}
            getLeadMorphedParams={(lead: 1 | 2) => audioEngine.getLeadMorphedParams(lead)}
            playheads={leadSeqPlayheads}
            hitCounts={leadSeqHitCounts}
            evolveFlashing={synthEuclidEvolveFlashing}
            initialViewMode={synthViewModeRef.current}
            onViewModeChange={(mode) => { synthViewModeRef.current = mode; }}
            initialStepOverrides={synthStepOverridesRef.current}
            initialSubLaneStates={synthSubLaneStatesRef.current}
            onSubLaneStatesChange={(states) => { synthSubLaneStatesRef.current = states; }}
            initialPitchSettings={synthPitchSettingsRef.current}
            onPitchSettingsChange={(settings) => { synthPitchSettingsRef.current = settings; }}
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
                morph: overrides.morph,
                morphDirection: overrides.morphDirection,
                distance: overrides.distance,
                distanceDirection: overrides.distanceDirection,
                probability: overrides.probability,
                ratchet: overrides.ratchet,
                trigCondition: overrides.trigCondition,
              });
            }}
            onClockDivsChange={(divs) => audioEngine.setSynthEuclidClockDivs(divs)}
            onSwingsChange={(swings) => audioEngine.setSynthEuclidSwings(swings)}
          />
        )}

        {/* === REVERB TAB === */}
        {activeTab === 'reverb' && (
          <ReverbPage
            state={state}
            isMobile={isMobile}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
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
            togglePanel={togglePanel}
            sliderProps={sliderProps}
            getPresetNames={getPresetNames}
            triggerVoice={(voice) => { void audioEngine.triggerDrumVoice(voice, 0.8, state); }}
            getAnalyserNode={(v) => audioEngine.getDrumVoiceAnalyser(v)}
            resetEvolveHome={(laneIdx) => audioEngine.resetDrumEuclidLaneHome(laneIdx)}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            CollapsiblePanelComponent={CollapsiblePanel as unknown as React.ComponentType<Record<string, unknown>>}
            editingVoice={drumEditingVoice}
            onToggleEditing={(v) => setDrumEditingVoice(prev => prev === v ? null : v)}
            triggeredVoices={drumTriggeredVoices}
            playheads={drumSeqPlayheads}
            hitCounts={drumSeqHitCounts}
            evolveFlashing={drumEuclidEvolveFlashing}
            onEvolveConfigsChange={(configs) => audioEngine.setDrumEuclidEvolveConfigs(configs)}
            onStepOverridesChange={(overrides) => { drumStepOverridesRef.current = overrides; audioEngine.setDrumStepOverrides(overrides); }}
            initialStepOverrides={drumStepOverridesRef.current}
            initialSubLaneStates={drumSubLaneStatesRef.current}
            onSubLaneStatesChange={(states) => { drumSubLaneStatesRef.current = states; }}
            initialViewMode={drumViewModeRef.current}
            onViewModeChange={(mode) => { drumViewModeRef.current = mode; }}
            onClockDivsChange={(divs) => audioEngine.setDrumEuclidClockDivs(divs)}
            onSwingsChange={(swings) => audioEngine.setDrumEuclidSwings(swings)}
          />
        )}

        {/* === GRANULAR TAB (was Looper) === */}
        {activeTab === 'looper' && (
          <LooperPage
            state={state}
            isMobile={isMobile}
            expandedPanels={expandedPanels}
            togglePanel={togglePanel}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            sliderProps={sliderProps}
            SliderComponent={Slider as unknown as React.ComponentType<Record<string, unknown>>}
            writeHeadPosition={looperWriteHead}
            voicePositions={looperVoicePositions}
            triggerOverrides={looperTriggerOverrides}
            playheads={looperSeqPlayheads}
            hitCounts={looperSeqHitCounts}
            initialViewMode={looperViewModeRef.current}
            onViewModeChange={(mode) => { looperViewModeRef.current = mode; }}
            initialStepOverrides={looperStepOverridesRef.current}
            initialSubLaneStates={looperSubLaneStatesRef.current}
            initialClockDivs={looperClockDivsRef.current}
            presetVersion={looperPresetVersion}
            onSubLaneStatesChange={(states) => { looperSubLaneStatesRef.current = states; }}
            onStepOverridesChange={(overrides) => {
              looperStepOverridesRef.current = overrides;
              audioEngine.setLooperStepOverrides({
                triggerToggles: overrides.triggerToggles,
                expression: overrides.expression,
                expressionDirection: overrides.expressionDirection,
                probability: overrides.probability,
                ratchet: overrides.ratchet,
                trigCondition: overrides.trigCondition,
                slice: overrides.slice,
                sliceDirection: overrides.sliceDirection,
                pitch: overrides.pitch,
                pitchDirection: overrides.pitchDirection,
                reverse: overrides.reverse,
                reverseDirection: overrides.reverseDirection,
              });
            }}
            onClockDivsChange={(divs) => audioEngine.setLooperEuclidClockDivs(divs)}
            onSwingsChange={(swings) => audioEngine.setLooperEuclidSwings(swings)}
          />
        )}

        {/* === EARTH TAB === */}
        {activeTab === 'earth' && (
          <EarthPage
            state={state}
            onParamChange={handleSliderChange}
            onSelectChange={handleSelectChange}
            sliderProps={sliderProps}
            isRunning={engineState.isRunning}
          />
        )}
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
          <span style={styles.debugLabel}>Next Phrase In:</span>
          <span style={styles.debugValue}>
            {engineState.isRunning ? `${countdown.toFixed(1)}s` : '—'}
          </span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>Phrases Until Chord:</span>
          <span style={styles.debugValue}>
            {engineState.harmonyState?.phrasesUntilChange || '—'}
          </span>
        </div>
        
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
                    {((journey.state.resolvedMorphDuration * (1 - journey.state.morphProgress)) * PHRASE_LENGTH).toFixed(1)}s
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
                    {((journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress)) * PHRASE_LENGTH).toFixed(1)}s
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
            minWidth: '280px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
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
  );
};

export default App;
