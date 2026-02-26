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
import { audioEngine, EngineState } from './audio/engine';
import { SCALE_FAMILIES } from './audio/scales';
import { formatChordDegrees, getTimeUntilNextPhrase, calculateDriftedRoot, PHRASE_LENGTH } from './audio/harmony';
import { getPresetNames, DrumVoiceType as DrumPresetVoice } from './audio/drumPresets';
import { applyMorphToState, setDrumMorphOverride, clearDrumMorphEndpointOverrides, clearMidMorphOverrides, setDrumMorphDualRangeOverride, getDrumMorphDualRangeOverrides, interpolateDrumMorphDualRanges, drumMorphManager } from './audio/drumMorph';
import { isInMidMorph, isAtEndpoint0, isAtEndpoint1 } from './audio/morphUtils';
import { getLead4opFMPresetList } from './audio/lead4opfm';
import SnowflakeUI from './ui/SnowflakeUI';
import { CircleOfFifths, getMorphedRootNote } from './ui/CircleOfFifths';
import CloudPresets from './ui/CloudPresets';
import { fetchPresetById, isCloudEnabled } from './cloud/supabase';
import JourneyModeView from './ui/JourneyModeView';
import { useJourney } from './ui/journeyState';
import { resolveDrumEuclidPatternParams } from './audio/drumSequencer';
import DrumPage from './ui/drums/DrumPage';

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
  synthLevel: 0.49,        // max 1
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
  leadEnabled: true,
  drumEnabled: true,
  oceanSampleEnabled: true,
  oceanWaveSynthEnabled: true,
};

// User preference keys - these are audio processing settings, not musical elements
// They should NOT change when loading presets or morphing between them
const USER_PREFERENCE_KEYS: (keyof SliderState)[] = [
  'reverbQuality',  // Ultra/Balanced/Lite - affects CPU usage, not sound character
];

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
  if (merged.granularEnabled === false)       merged.granularLevel = 0;
  if (merged.leadEnabled === false)           merged.leadLevel = 0;
  if (merged.drumEnabled === false)           merged.drumLevel = 0;
  if (merged.oceanSampleEnabled === false)    merged.oceanSampleLevel = 0;
  if (merged.oceanWaveSynthEnabled === false) merged.oceanWaveSynthLevel = 0;

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
  dualSliderContainer: {
    position: 'relative' as const,
    width: '100%',
    height: '20px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.2)',
    cursor: 'pointer',
  } as React.CSSProperties,
  dualSliderTrack: {
    position: 'absolute' as const,
    height: '100%',
    background: 'rgba(165, 196, 212, 0.4)',
    borderRadius: '3px',
  } as React.CSSProperties,
  dualSliderThumb: {
    position: 'absolute' as const,
    top: '50%',
    width: '16px',
    height: '16px',
    background: '#a5c4d4',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    cursor: 'grab',
    border: '2px solid rgba(255,255,255,0.8)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  } as React.CSSProperties,
  dualSliderWalkIndicator: {
    position: 'absolute' as const,
    top: '50%',
    width: '8px',
    height: '8px',
    background: '#fff',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 0 8px rgba(255,255,255,0.8)',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,
  dualModeIndicator: {
    fontSize: '0.65rem',
    color: 'rgba(165, 196, 212, 0.7)',
    marginLeft: '8px',
  } as React.CSSProperties,
};

// Dual slider state type - stores min/max for each parameter when in dual mode
interface DualSliderRange {
  min: number;
  max: number;
}
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
  onCycleMode,
  onDualRangeChange,
}) => {
  // If dual mode props are provided, use DualSlider
  if (onCycleMode && onDualRangeChange) {
    return (
      <DualSlider
        label={label}
        value={value}
        paramKey={paramKey}
        unit={unit}
        logarithmic={logarithmic}
        mode={mode}
        dualRange={dualRange}
        walkPosition={walkPosition}
        onChange={onChange}
        onCycleMode={onCycleMode}
        onDualRangeChange={onDualRangeChange}
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

// DualSlider component - supports single, walk, or sampleHold mode
interface DualSliderProps {
  label: string;
  value: number;
  paramKey: keyof SliderState;
  unit?: string;
  logarithmic?: boolean;
  mode: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;  // Current random walk position (0-1)
  onChange: (key: keyof SliderState, value: number) => void;
  onCycleMode: (key: keyof SliderState) => void;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}

const DualSlider: React.FC<DualSliderProps> = ({
  label,
  value,
  paramKey,
  unit,
  logarithmic,
  mode,
  dualRange,
  walkPosition,
  onChange,
  onCycleMode,
  onDualRangeChange,
}) => {
  const info = getParamInfo(paramKey);
  if (!info) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  
  // Long press detection for mobile (cycle slider mode)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const LONG_PRESS_DURATION = 400; // ms
  
  const handleLongPressStart = (_e: React.TouchEvent) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
      onCycleMode(paramKey);
    }, LONG_PRESS_DURATION);
  };
  
  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  const handleLongPressMove = () => {
    // Cancel long press if finger moves (user is dragging, not pressing)
    handleLongPressEnd();
  };

  // Calculate position percentage from value
  const valueToPercent = (val: number) => {
    if (logarithmic) {
      return logToLinear(Math.max(info.min, Math.min(info.max, val)), info.min, info.max) * 100;
    }
    return ((val - info.min) / (info.max - info.min)) * 100;
  };

  // Calculate value from position percentage
  const percentToValue = (percent: number) => {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    if (logarithmic) {
      return linearToLog(clampedPercent / 100, info.min, info.max);
    }
    return info.min + (clampedPercent / 100) * (info.max - info.min);
  };

  // Format display value
  const formatValue = (val: number) => {
    return info.step < 1 ? val.toFixed(2) : Math.round(val);
  };

  // Handle double click to cycle mode
  const handleDoubleClick = () => {
    onCycleMode(paramKey);
  };

  // Handle mouse/touch drag
  const handleDragStart = (thumb: 'min' | 'max') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(thumb);
  };

  const isDualMode = mode !== 'single';

  // Mode-dependent colors
  const modeColor = mode === 'walk' ? '#a5c4d4' : '#D4A520';
  const modeLabel = mode === 'walk' ? '⟷ walk' : '⟷ S&H';

  useEffect(() => {
    if (!dragging || !isDualMode || !dualRange) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const percent = ((clientX - rect.left) / rect.width) * 100;
      const newValue = quantize(paramKey, percentToValue(percent));

      if (dragging === 'min') {
        const newMin = Math.min(newValue, dualRange.max);
        onDualRangeChange(paramKey, newMin, dualRange.max);
      } else {
        const newMax = Math.max(newValue, dualRange.min);
        onDualRangeChange(paramKey, dualRange.min, newMax);
      }
    };

    const handleEnd = () => {
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragging, isDualMode, dualRange, paramKey, onDualRangeChange]);

  // Single slider mode
  if (!isDualMode) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = parseFloat(e.target.value);
      if (logarithmic) {
        newValue = linearToLog(newValue, info.min, info.max);
      }
      onChange(paramKey, quantize(paramKey, newValue));
    };

    const sliderValue = logarithmic 
      ? logToLinear(Math.max(info.min, Math.min(info.max, value)), info.min, info.max)
      : value;
    const sliderMin = logarithmic ? 0 : info.min;
    const sliderMax = logarithmic ? 1 : info.max;
    const sliderStep = logarithmic ? 0.001 : info.step;

    // Compute fill percentage for visual track gradient
    const fillPercent = sliderMax > sliderMin
      ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
      : 0;

    return (
      <div className="app-slider-group" style={styles.sliderGroup}>
        <div className="app-slider-label" style={styles.sliderLabel}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>{label}</span>
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatValue(value)}
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
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          onTouchMove={handleLongPressMove}
          className="app-slider"
          style={{
            ...styles.slider,
            background: `linear-gradient(to right, rgba(160,200,220,0.5) 0%, rgba(160,200,220,0.5) ${fillPercent}%, rgba(255,255,255,0.2) ${fillPercent}%, rgba(255,255,255,0.2) 100%)`,
          }}
          title="Double-click or long-press to cycle mode"
        />
      </div>
    );
  }

  // Dual slider mode (walk or sampleHold)
  const minPercent = valueToPercent(dualRange?.min ?? info.min);
  const maxPercent = valueToPercent(dualRange?.max ?? info.max);
  
  // Calculate walk indicator position
  const walkPercent = walkPosition !== undefined
    ? minPercent + (walkPosition * (maxPercent - minPercent))
    : (minPercent + maxPercent) / 2;

  // Current interpolated value
  const currentValue = dualRange
    ? dualRange.min + (walkPosition ?? 0.5) * (dualRange.max - dualRange.min)
    : value;

  return (
    <div className="app-slider-group" style={styles.sliderGroup}>
      <div className="app-slider-label" style={styles.sliderLabel}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
          {label}
          <span style={{...styles.dualModeIndicator, color: modeColor}}>{modeLabel}</span>
        </span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
          {formatValue(dualRange?.min ?? info.min)}-{formatValue(dualRange?.max ?? info.max)}
          {unit || ''}
          <span style={{ color: '#fff', marginLeft: '4px' }}>
            ({formatValue(currentValue)})
          </span>
        </span>
      </div>
      <div
        ref={containerRef}
        style={styles.dualSliderContainer}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        onTouchMove={handleLongPressMove}
        title="Double-click or long-press to cycle mode"
      >
        {/* Range track */}
        <div
          style={{
            ...styles.dualSliderTrack,
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
            background: mode === 'walk' ? 'rgba(165,196,212,0.3)' : 'rgba(212,165,32,0.3)',
          }}
        />
        {/* Min thumb */}
        <div
          style={{
            ...styles.dualSliderThumb,
            left: `${minPercent}%`,
            background: dragging === 'min' ? '#fff' : modeColor,
          }}
          onMouseDown={handleDragStart('min')}
          onTouchStart={handleDragStart('min')}
        />
        {/* Max thumb */}
        <div
          style={{
            ...styles.dualSliderThumb,
            left: `${maxPercent}%`,
            background: dragging === 'max' ? '#fff' : modeColor,
          }}
          onMouseDown={handleDragStart('max')}
          onTouchStart={handleDragStart('max')}
        />
        {/* Walk/trigger indicator */}
        <div
          style={{
            ...styles.dualSliderWalkIndicator,
            left: `${walkPercent}%`,
          }}
        />
      </div>
    </div>
  );
};

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
  type AdvancedTab = 'global' | 'synth' | 'lead' | 'drums' | 'fx';
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

  // Track last triggered delay values for the indicator
  const [leadDelayPositions, setLeadDelayPositions] = useState<{
    time: number;
    feedback: number;
    mix: number;
  }>({ time: 0.5, feedback: 0.5, mix: 0.5 });

  // Track random walk positions for ocean params (updated by ocean worklet)
  const [oceanPositions, setOceanPositions] = useState<{
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

  const [drumSeqPlayheads, setDrumSeqPlayheads] = useState<number[]>([0, 0, 0, 0]);
  const [drumSeqHitCounts, setDrumSeqHitCounts] = useState<number[]>([0, 0, 0, 0]);
  const [drumEditingVoice, setDrumEditingVoice] = useState<string | null>(null);
  const [drumTriggeredVoices, setDrumTriggeredVoices] = useState<Record<string, boolean>>({});
  const drumTriggerTimersRef = useRef<Record<string, number | null>>({});
  const drumViewModeRef = useRef<'simple' | 'detail' | 'overview'>('detail');

  // Evolve flash state — driven by audio engine callback, passed to DrumPage
  const [drumEuclidEvolveFlashing, setDrumEuclidEvolveFlashing] = useState<boolean[]>([false, false, false, false]);
  const drumEuclidEvolveFlashTimersRef = useRef<Array<number | null>>([null, null, null, null]);

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
  }), [leadExpressionPositions, leadDelayPositions, oceanPositions, leadMorphPositions]);

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

  // Push non-drum dualSliderRanges to engine for per-trigger sampling (sampleHold only).
  // Walk mode updates state values directly via the walk timer, so the engine reads those.
  useEffect(() => {
    if (audioEngine.setDualRanges) {
      const engineRanges: Partial<Record<string, { min: number; max: number }>> = {};
      Object.entries(dualSliderRanges).forEach(([key, range]) => {
        if (range && !DRUM_MORPH_KEYS.has(key as keyof SliderState) && sliderModes[key] === 'sampleHold') {
          engineRanges[key] = range;
        }
      });
      audioEngine.setDualRanges(engineRanges);
    }
  }, [dualSliderRanges, sliderModes]);

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

          const cloudMigrated = migratePreset({
            name: preset.name,
            timestamp: new Date().toISOString(),
            state: presetState,
            dualRanges: wrappedData?.dualRanges,
          });
          const normalizedState = normalizePresetForWeb(cloudMigrated.state);
          const newState = { ...DEFAULT_STATE, ...normalizedState };
          setState(newState);
          applyDualRangesFromPreset(cloudMigrated.dualRanges);
          audioEngine.updateParams(newState);
          audioEngine.resetCofDrift();
          console.log(`Loaded cloud preset: ${preset.name} by ${preset.author}`);
        }
      });
    }
  }, [applyDualRangesFromPreset]);

  // Engine state callback
  useEffect(() => {
    audioEngine.setStateChangeCallback(setEngineState);
  }, []);

  // Lead expression trigger callback
  useEffect(() => {
    audioEngine.setLeadExpressionCallback(setLeadExpressionPositions);
  }, []);

  // Lead morph trigger callback (updates walk indicator)
  useEffect(() => {
    audioEngine.setLeadMorphCallback((morph) => {
      setLeadMorphPositions(prev => ({
        lead1: morph.lead1 >= 0 ? morph.lead1 : prev.lead1,
        lead2: morph.lead2 >= 0 ? morph.lead2 : prev.lead2,
      }));
    });
  }, []);

  // Lead delay trigger callback
  useEffect(() => {
    audioEngine.setLeadDelayCallback(setLeadDelayPositions);
  }, []);

  // Ocean wave trigger callback
  useEffect(() => {
    audioEngine.setOceanWaveCallback(setOceanPositions);
  }, []);

  // Drum morph trigger callback (per-trigger random morph position)
  // Updates both the indicator position AND the individual parameter sliders
  useEffect(() => {
    if (audioEngine.setDrumMorphTriggerCallback) {
      audioEngine.setDrumMorphTriggerCallback((voice, morphPosition) => {
        // Update the indicator position
        setDrumMorphPositions(prev => ({ ...prev, [voice]: morphPosition }));
        
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
        
        // Only update individual sliders if the option is enabled
        // Use a functional update to access the latest stateRef if needed, but here we use the functional update of setState
        if (morphKey) {
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

  // Drum Euclid step position callback (live playhead tracking)
  useEffect(() => {
    audioEngine.setDrumStepPositionCallback((steps: number[], hitCounts: number[]) => {
      setDrumSeqPlayheads(steps);
      setDrumSeqHitCounts(hitCounts);
    });
  }, []);

  // Drum trigger callback (per-voice flash for envelope visualizer)
  useEffect(() => {
    audioEngine.setDrumTriggerCallback((voice: string, _velocity: number) => {
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
  const autoMorphRafRef = useRef<number | null>(null);
  const autoMorphStateRef = useRef(state);
  autoMorphStateRef.current = state;
  useEffect(() => {
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
          return { ...prev, ...updates };
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
  }, []);

  // Countdown timer
  useEffect(() => {
    if (engineState.isRunning) {
      const update = () => {
        setCountdown(getTimeUntilNextPhrase());
      };
      update();
      countdownRef.current = window.setInterval(update, 100);
      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      };
    }
  }, [engineState.isRunning]);

  // Filter frequency polling for live visualization
  const [liveFilterFreq, setLiveFilterFreq] = useState(1000);
  useEffect(() => {
    if (engineState.isRunning) {
      const updateFilter = () => {
        setLiveFilterFreq(audioEngine.getCurrentFilterFreq());
      };
      const filterId = window.setInterval(updateFilter, 50); // 20fps for smooth animation
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
      
      // Auto-disable granular when level is 0
      if (key === 'granularLevel' && value === 0) {
        newState.granularEnabled = false;
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
    return {
      mode,
      dualRange: dualSliderRanges[paramKey],
      walkPosition: walkPos,
      onCycleMode: handleCycleSliderMode,
      onDualRangeChange: handleDualRangeChange,
    };
  }, [sliderModes, dualSliderRanges, randomWalkPositions, triggerPositionMap, drumMorphPositions, drumMorphKeys, drumMorphKeyToVoice, handleCycleSliderMode, handleDualRangeChange]);

  // Handle select change
  const handleSelectChange = useCallback(<K extends keyof SliderState>(key: K, value: SliderState[K]) => {
    // Mark that user has interacted with the UI
    hasUserInteractedRef.current = true;
    setState((prev) => ({ ...prev, [key]: value }));
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
          const migrated = migratePreset(defaultPreset);
          // Apply preset state
          const normalizedState = { ...DEFAULT_STATE, ...normalizePresetForWeb(migrated.state) };
          // Preserve user preference keys
          for (const key of USER_PREFERENCE_KEYS) {
            (normalizedState as Record<string, unknown>)[key] = state[key];
          }
          setState(normalizedState);
          setMorphPresetA(migrated);
          stateToStart = normalizedState;

          // Restore dual slider state from preset
          applyDualRangesFromPreset(migrated.dualRanges, migrated.sliderModes);
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

    // Master stop also turns off the drum sequencer
    setState(prev => ({ ...prev, drumEuclidMasterEnabled: false }));
    
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
        'granularReverbSend', 'grainProbability', 'grainSize',
        'density', 'spray', 'jitter', 'pitchSpread', 'stereoSpread', 'feedback', 'wetHPF', 'wetLPF'
      ],
      leadEnabled: [
        'lead1Attack', 'lead1Decay', 'lead1Sustain', 'lead1Release',
        'leadDelayTime', 'leadDelayFeedback',
        'leadDelayMix', 'lead1Density',
        'lead1Octave', 'lead1OctaveRange',
        'leadVibratoDepth', 'leadVibratoRate',
        'leadGlide', 'leadReverbSend', 'leadDelayReverbSend'
      ],
      leadEuclideanMasterEnabled: [
        'leadEuclideanTempo'
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
      'masterVolume', 'synthLevel', 'granularLevel', 'synthReverbSend', 'granularReverbSend',
      'leadReverbSend', 'leadDelayReverbSend', 'reverbLevel', 'randomness', 'tension',
      'chordRate', 'voicingSpread', 'waveSpread', 'detune', 'synthAttack', 'synthDecay',
      'synthSustain', 'synthRelease', 'synthVoiceMask', 'synthOctave', 'hardness', 'oscBrightness',
      'filterCutoffMin', 'filterCutoffMax', 'filterModSpeed', 'filterResonance', 'filterQ',
      'warmth', 'presence', 'airNoise', 'reverbDecay', 'reverbSize', 'reverbDiffusion',
      'reverbModulation', 'predelay', 'damping', 'width', 'grainProbability', 'grainSize',
      'density', 'spray', 'jitter', 'pitchSpread', 'stereoSpread', 'feedback',
      'wetHPF', 'wetLPF', 'leadLevel', 'lead1Attack', 'lead1Decay', 'lead1Sustain', 'lead1Release',
      'leadDelayTime', 'leadDelayFeedback',
      'leadDelayMix', 'lead1Density', 'lead1Octave',
      'lead1OctaveRange',
      'leadVibratoDepth', 'leadVibratoRate',
      'leadGlide', 'leadEuclideanTempo',
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
    ];
    for (const key of discreteKeys) {
      (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
    }
    
    // Snap boolean values at 50% (except engine toggles and cofDriftEnabled which have special handling)
    const boolKeys: (keyof SliderState)[] = [
      'lead1UseCustomAdsr', 'leadEuclideanMasterEnabled', 'leadEuclid1Enabled', 'leadEuclid2Enabled',
      'leadEuclid3Enabled', 'leadEuclid4Enabled',
      // Drum synth booleans
      'drumSubMorphAuto', 'drumKickMorphAuto', 'drumClickMorphAuto',
      'drumBeepHiMorphAuto', 'drumBeepLoMorphAuto', 'drumNoiseMorphAuto', 'drumMembraneMorphAuto',
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
        // Preserve user preference keys (like reverbQuality) that shouldn't change with presets
        const newState = { ...DEFAULT_STATE, ...normalizedPreset.state };
        for (const key of USER_PREFERENCE_KEYS) {
          (newState as Record<string, unknown>)[key] = state[key];
        }
        if (newState.granularLevel === 0) {
          newState.granularEnabled = false;
        }
        setState(newState);
        audioEngine.updateParams(newState);
        audioEngine.resetCofDrift();
        // Don't reset morph position - keep it where user had it
        
        // Apply dual ranges and slider modes from migrated preset
        applyDualRangesFromPreset(normalizedPreset.dualRanges, normalizedPreset.sliderModes);
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
        // Preserve user preference keys (like reverbQuality) that shouldn't change with presets
        const newState = { ...DEFAULT_STATE, ...normalizedPreset.state };
        for (const key of USER_PREFERENCE_KEYS) {
          (newState as Record<string, unknown>)[key] = state[key];
        }
        if (newState.granularLevel === 0) {
          newState.granularEnabled = false;
        }
        setState(newState);
        audioEngine.updateParams(newState);
        audioEngine.resetCofDrift();

        // Apply dual ranges and slider modes from migrated preset
        applyDualRangesFromPreset(normalizedPreset.dualRanges, normalizedPreset.sliderModes);
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
  const prevDrumPresetsRef = useRef<Record<string, string>>({});
  
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
      const presetA = state[keys.a] as string;
      const presetB = state[keys.b] as string;
      const morphValue = state[keys.morph] as number;
      
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
      const morphedParams = applyMorphToState(state, voice);
      setState(prev => ({ ...prev, ...morphedParams }));
      
      // Also reapply dual range interpolation if there are overrides
      const currentValues: Record<string, number> = {};
      const overrides = getDrumMorphDualRangeOverrides(voice);
      for (const param of Object.keys(overrides)) {
        const stateVal = state[param as keyof SliderState];
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
  }, [state]);

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
    
    // Debug: log morph interpolation — every 10 positions to avoid console spam
    if (newPosition % 10 === 0) {
      console.log(`[Morph] pos=${newPosition} masterVol=${(finalState as any).masterVolume?.toFixed(2)} tension=${(finalState as any).tension?.toFixed(2)} synthLevel=${(finalState as any).synthLevel?.toFixed(2)} chordRate=${(finalState as any).chordRate?.toFixed(2)}`);
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
      // Apply the preset directly, with auto-disable for zero-level features
      // Also normalize iOS-only settings to web-compatible values
      const migrated = migratePreset(preset);
      const normalizedState = normalizePresetForWeb(migrated.state);
      const newState = { ...DEFAULT_STATE, ...normalizedState };
      
      // Preserve user preference keys (like reverbQuality) that shouldn't change with presets
      for (const key of USER_PREFERENCE_KEYS) {
        (newState as Record<string, unknown>)[key] = state[key];
      }
      
      // Auto-disable granular if level is 0
      if (newState.granularLevel === 0) {
        newState.granularEnabled = false;
      }
      
      setState(newState);
      audioEngine.updateParams(newState);
      audioEngine.resetCofDrift(); // Reset CoF drift when loading preset
      
      // Apply dual ranges and slider modes from migrated preset
      applyDualRangesFromPreset(migrated.dualRanges, migrated.sliderModes);
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
          // Migrate old *Min/*Max fields and merge with defaults
          const migrated = migratePreset(parsed);
          const normalizedState = normalizePresetForWeb(migrated.state);
          const newState = { ...DEFAULT_STATE, ...normalizedState };
          
          // Preserve user preference keys (like reverbQuality) that shouldn't change with presets
          for (const key of USER_PREFERENCE_KEYS) {
            (newState as Record<string, unknown>)[key] = state[key];
          }
          
          // Auto-disable granular if level is 0
          if (newState.granularLevel === 0) {
            newState.granularEnabled = false;
          }
          
          // Create the preset object
          const importedPreset: SavedPreset = {
            name: parsed.name || file.name.replace('.json', ''),
            timestamp: parsed.timestamp || new Date().toISOString(),
            state: newState,
            dualRanges: migrated.dualRanges,
            sliderModes: migrated.sliderModes,
          };
          
          // Add to preset list for display
          setSavedPresets(prev => [...prev, importedPreset]);
          
          // In advanced mode, show dialog to choose slot A or B
          if (uiMode === 'advanced') {
            setPendingUploadPreset(importedPreset);
            setUploadSlotDialogOpen(true);
          } else {
            // In snowflake mode, just apply directly
            setState(newState);
            audioEngine.updateParams(newState);
            audioEngine.resetCofDrift(); // Reset CoF drift when loading preset
            
            // Apply dual ranges and slider modes from migrated preset
            applyDualRangesFromPreset(migrated.dualRanges, migrated.sliderModes);
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
    
    console.log('[Journey] Animation presets - A:', animPresetA.name, 'B:', animPresetB.name);
    
    const startTime = performance.now();
    
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
      
      // Update position state
      setMorphPosition(newPosition);
      
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
      const stateWithPrefs = { ...morphResult.state };
      for (const key of USER_PREFERENCE_KEYS) {
        (stateWithPrefs as Record<string, unknown>)[key] = state[key];
      }
      
      // Apply the morphed state
      setState(stateWithPrefs);
      audioEngine.updateParams(stateWithPrefs);
      
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
      
      if (progress < 1) {
        journeyMorphAnimationRef.current = requestAnimationFrame(animateMorph);
      } else {
        // Morph complete - alternate direction for next morph
        console.log('[Journey] Morph complete at position:', endPosition);
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
            ...(activeTab === 'lead' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('lead')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>♪</span>
          <span>Lead</span>
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
            ...(activeTab === 'fx' ? styles.tabActive : {}),
            ...m?.tab,
          }}
          onClick={() => setActiveTab('fx')}
        >
          <span style={{ ...styles.tabIcon, ...m?.tabIcon }}>◈</span>
          <span>FX</span>
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
            label="Synth Level"
            value={state.synthLevel}
            paramKey="synthLevel"
            onChange={handleSliderChange}
            {...sliderProps('synthLevel')}
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
                      // Apply the preset settings (with auto-disable for zero-level features)
                      const newState = { ...DEFAULT_STATE, ...normalizedPreset.state };
                      if (newState.granularLevel === 0) {
                        newState.granularEnabled = false;
                      }
                      setState(newState);
                      audioEngine.updateParams(newState);
                      audioEngine.resetCofDrift(); // Reset CoF drift when loading preset
                      // Don't reset morph position - keep it where user had it
                      
                      // Apply dual ranges and slider modes from migrated preset
                      applyDualRangesFromPreset(normalizedPreset.dualRanges, normalizedPreset.sliderModes);
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
                      // Apply the preset settings (with auto-disable for zero-level features)
                      const newState = { ...DEFAULT_STATE, ...normalizedPreset.state };
                      if (newState.granularLevel === 0) {
                        newState.granularEnabled = false;
                      }
                      setState(newState);
                      audioEngine.updateParams(newState);
                      audioEngine.resetCofDrift();

                      // Apply dual ranges and slider modes from migrated preset
                      applyDualRangesFromPreset(normalizedPreset.dualRanges, normalizedPreset.sliderModes);
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
            const cloudMigrated = migratePreset({ state: presetState, name: _name });
            const newState = { ...DEFAULT_STATE, ...normalizePresetForWeb(cloudMigrated.state) };
            setState(newState);
            audioEngine.updateParams(newState);
            audioEngine.resetCofDrift();
            // Apply dual ranges and slider modes from migrated cloud preset
            applyDualRangesFromPreset(cloudMigrated.dualRanges, cloudMigrated.sliderModes);
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
        {activeTab === 'synth' && (<>
        {/* Harmony */}
        <CollapsiblePanel
          id="harmony"
          title="Pad Synth"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('harmony')}
          onToggle={togglePanel}
        >
          <Slider
            label="Chord Rate"
            value={state.chordRate}
            paramKey="chordRate"
            unit="s"
            onChange={handleSliderChange}
            {...sliderProps('chordRate')}
          />
          <Slider
            label="Voicing Spread"
            value={state.voicingSpread}
            paramKey="voicingSpread"
            onChange={handleSliderChange}
            {...sliderProps('voicingSpread')}
          />
          <Slider
            label="Wave Spread"
            value={state.waveSpread}
            paramKey="waveSpread"
            unit="s"
            onChange={handleSliderChange}
            {...sliderProps('waveSpread')}
          />
          <Slider
            label="Detune"
            value={state.detune}
            paramKey="detune"
            unit="¢"
            onChange={handleSliderChange}
            {...sliderProps('detune')}
          />

          {/* Synth Chord Sequencer Toggle */}
          <div style={{ marginTop: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Synth Chord Sequencer</span>
              <button
                onClick={() => handleSelectChange('synthChordSequencerEnabled', !state.synthChordSequencerEnabled)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  background: state.synthChordSequencerEnabled !== false
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  color: state.synthChordSequencerEnabled !== false ? 'white' : '#9ca3af',
                  fontSize: '0.75rem',
                }}
              >
                {state.synthChordSequencerEnabled !== false ? '● ON' : '○ OFF'}
              </button>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '4px' }}>
              When off, synth pads won't play chord changes (use with Euclidean synth sources)
            </div>
          </div>

          {/* Visual ADSR Curve for Synth */}
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Synth Envelope (ADSR)</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            padding: '10px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            {/* Attack slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                className="adsr-vertical"
                min="0.01"
                max="8"
                step="0.01"
                value={state.synthAttack}
                onChange={(e) => handleSliderChange('synthAttack', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#4a9eff' }}>A</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.synthAttack.toFixed(1)}s</span>
            </div>
            {/* Decay slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                className="adsr-vertical"
                min="0.01"
                max="8"
                step="0.01"
                value={state.synthDecay}
                onChange={(e) => handleSliderChange('synthDecay', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#9e4aff' }}>D</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.synthDecay.toFixed(1)}s</span>
            </div>
            {/* Sustain slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                className="adsr-vertical"
                min="0"
                max="1"
                step="0.01"
                value={state.synthSustain}
                onChange={(e) => handleSliderChange('synthSustain', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#4aff9e' }}>S</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{(state.synthSustain * 100).toFixed(0)}%</span>
            </div>
            {/* Release slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                className="adsr-vertical"
                min="0.01"
                max="16"
                step="0.01"
                value={state.synthRelease}
                onChange={(e) => handleSliderChange('synthRelease', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#ff9e4a' }}>R</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.synthRelease.toFixed(1)}s</span>
            </div>
            {/* Visual ADSR curve preview */}
            <div style={{ flex: 2, height: '80px', marginLeft: '8px' }}>
              <svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="none">
                {/* Normalize times for display */}
                {(() => {
                  const totalTime = state.synthAttack + state.synthDecay + 2 + state.synthRelease;
                  const aEnd = (state.synthAttack / totalTime) * 100;
                  const dEnd = ((state.synthAttack + state.synthDecay) / totalTime) * 100;
                  const sEnd = ((state.synthAttack + state.synthDecay + 2) / totalTime) * 100;
                  const sustainY = (1 - state.synthSustain) * 80;
                  return (
                    <>
                      <path
                        d={`M 0 80 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 80`}
                        fill="none"
                        stroke="rgba(150, 200, 255, 0.8)"
                        strokeWidth="2"
                      />
                      <path
                        d={`M 0 80 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 80 Z`}
                        fill="rgba(100, 150, 255, 0.15)"
                      />
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
          
          {/* Voice Mask - toggles for which chord voices play */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Voice Mask</span>
              <span style={{ fontSize: '0.6rem', color: '#888' }}>
                {[1, 2, 3, 4, 5, 6].filter(v => (state.synthVoiceMask || 63) & (1 << (v - 1))).join(' ')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
              {[1, 2, 3, 4, 5, 6].map(voice => {
                const bit = 1 << (voice - 1);
                const isEnabled = ((state.synthVoiceMask || 63) & bit) !== 0;
                return (
                  <button
                    key={voice}
                    onClick={() => {
                      const currentMask = state.synthVoiceMask || 63;
                      let newMask = currentMask ^ bit; // Toggle the bit
                      // Ensure at least one voice is enabled
                      if (newMask === 0) newMask = bit;
                      handleSliderChange('synthVoiceMask', newMask);
                    }}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: '0.75rem',
                      fontWeight: isEnabled ? 'bold' : 'normal',
                      color: isEnabled ? '#fff' : '#666',
                      background: isEnabled 
                        ? `linear-gradient(135deg, hsl(${210 + voice * 25}, 60%, 35%), hsl(${210 + voice * 25}, 60%, 25%))`
                        : 'rgba(30, 30, 40, 0.6)',
                      border: `1px solid ${isEnabled ? `hsl(${210 + voice * 25}, 60%, 50%)` : '#444'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={`Voice ${voice} (${voice === 1 ? 'Bass' : voice === 6 ? 'High' : 'Mid'})`}
                  >
                    {voice}
                  </button>
                );
              })}
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginTop: '2px', 
              fontSize: '0.55rem', 
              color: '#555' 
            }}>
              <span>Bass</span>
              <span>High</span>
            </div>
          </div>
          
          {/* Synth Octave slider */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Octave</span>
              <span style={{ fontSize: '0.65rem', color: '#888' }}>
                {state.synthOctave === 0 ? '0' : (state.synthOctave > 0 ? `+${state.synthOctave}` : state.synthOctave)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
              {[-2, -1, 0, 1, 2].map(oct => {
                const isSelected = state.synthOctave === oct;
                return (
                  <button
                    key={oct}
                    onClick={() => handleSliderChange('synthOctave', oct)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: '0.75rem',
                      fontWeight: isSelected ? 'bold' : 'normal',
                      color: isSelected ? '#fff' : '#666',
                      background: isSelected 
                        ? 'linear-gradient(135deg, hsl(260, 50%, 40%), hsl(260, 50%, 30%))'
                        : 'rgba(30, 30, 40, 0.6)',
                      border: `1px solid ${isSelected ? 'hsl(260, 50%, 55%)' : '#444'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {oct === 0 ? '0' : (oct > 0 ? `+${oct}` : oct)}
                  </button>
                );
              })}
            </div>
          </div>
        </CollapsiblePanel>

        {/* Timbre */}
        <CollapsiblePanel
          id="timbre"
          title="Pad Timbre"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('timbre')}
          onToggle={togglePanel}
        >
          <Slider
            label="Hardness"
            value={state.hardness}
            paramKey="hardness"
            onChange={handleSliderChange}
            {...sliderProps('hardness')}
          />
          <Select
            label="Osc Brightness"
            value={String(state.oscBrightness)}
            options={[
              { value: '0', label: '0 - Sine (Soft)' },
              { value: '1', label: '1 - Triangle' },
              { value: '2', label: '2 - Saw + Tri (Balanced)' },
              { value: '3', label: '3 - Sawtooth (Bright)' },
            ]}
            onChange={(v) => handleSelectChange('oscBrightness', Number(v))}
          />
          <Select
            label="Filter Type"
            value={state.filterType}
            options={[
              { value: 'lowpass', label: 'Lowpass (Warm)' },
              { value: 'bandpass', label: 'Bandpass (Focused)' },
              { value: 'highpass', label: 'Highpass (Airy)' },
              { value: 'notch', label: 'Notch (Scoop)' },
            ]}
            onChange={(v) => handleSelectChange('filterType', v)}
          />
          <Slider
            label="Filter Min"
            value={state.filterCutoffMin}
            paramKey="filterCutoffMin"
            unit="Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('filterCutoffMin')}
          />
          <Slider
            label="Filter Max"
            value={state.filterCutoffMax}
            paramKey="filterCutoffMax"
            unit="Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('filterCutoffMax')}
          />
          <Slider
            label="Filter Mod Speed"
            value={state.filterModSpeed}
            paramKey="filterModSpeed"
            unit=" phrases"
            onChange={handleSliderChange}
            {...sliderProps('filterModSpeed')}
          />
          <Slider
            label="Filter Resonance"
            value={state.filterResonance}
            paramKey="filterResonance"
            onChange={handleSliderChange}
            {...sliderProps('filterResonance')}
          />
          <Slider
            label="Filter Q (Bandwidth)"
            value={state.filterQ}
            paramKey="filterQ"
            onChange={handleSliderChange}
            {...sliderProps('filterQ')}
          />

          {/* Filter Visualization */}
          <div style={{ marginTop: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '8px' }}>Filter Response (Mod Range)</div>
            <div style={{
              height: '100px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              padding: '8px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <svg width="100%" height="100%" viewBox="0 0 200 80" preserveAspectRatio="none">
                {(() => {
                  // Calculate min/max cutoff positions (log scale: 40Hz-8000Hz mapped to 0-200)
                  const minFreq = 40;
                  const maxFreq = 8000;
                  const freqToX = (freq: number) => (Math.log(Math.max(minFreq, freq) / minFreq) / Math.log(maxFreq / minFreq)) * 200;
                  
                  const minCutoffX = freqToX(state.filterCutoffMin);
                  const maxCutoffX = freqToX(state.filterCutoffMax);
                  const liveX = freqToX(liveFilterFreq);
                  
                  // Resonance affects the peak height (0-1 mapped to 0-15px boost, capped)
                  const resPeak = Math.min(state.filterResonance * 15, 20);
                  
                  // Q affects the slope/bandwidth - cap the effect to prevent extreme values
                  const qFactor = Math.min(state.filterQ, 12);
                  const slopeSharpness = Math.min(5 + qFactor * 1.5, 25); // Cap sharpness
                  
                  // Generate filter curve paths based on filter type
                  const baseY = 30; // Top of the response (0dB)
                  const floorY = 70; // Bottom (attenuated)
                  
                  // Helper to generate a single filter curve
                  const generateCurve = (cutoffX: number): string => {
                    let pathD = '';
                    if (state.filterType === 'lowpass') {
                      const dropWidth = Math.max(15, 35 - qFactor * 1.5);
                      pathD = `M 0 ${baseY} 
                               L ${Math.max(0, cutoffX - 15)} ${baseY} 
                               Q ${cutoffX - 5} ${baseY} ${cutoffX} ${baseY - resPeak}
                               Q ${cutoffX + slopeSharpness * 0.5} ${baseY + 5} ${Math.min(200, cutoffX + dropWidth)} ${floorY - 5}
                               L 200 ${floorY}`;
                    } else if (state.filterType === 'highpass') {
                      const riseWidth = Math.max(15, 35 - qFactor * 1.5);
                      pathD = `M 0 ${floorY} 
                               L ${Math.max(0, cutoffX - riseWidth)} ${floorY - 5}
                               Q ${cutoffX - slopeSharpness * 0.5} ${baseY + 5} ${cutoffX} ${baseY - resPeak}
                               Q ${cutoffX + 5} ${baseY} ${Math.min(200, cutoffX + 15)} ${baseY}
                               L 200 ${baseY}`;
                    } else if (state.filterType === 'bandpass') {
                      const width = Math.max(20, 50 - qFactor * 3);
                      pathD = `M 0 ${floorY} 
                               L ${Math.max(0, cutoffX - width)} ${floorY - 5}
                               Q ${cutoffX - width * 0.4} ${baseY + 8} ${cutoffX} ${baseY - resPeak}
                               Q ${cutoffX + width * 0.4} ${baseY + 8} ${Math.min(200, cutoffX + width)} ${floorY - 5}
                               L 200 ${floorY}`;
                    } else if (state.filterType === 'notch') {
                      const width = Math.max(15, 40 - qFactor * 2);
                      pathD = `M 0 ${baseY}
                               L ${Math.max(0, cutoffX - width)} ${baseY}
                               Q ${cutoffX - width * 0.3} ${baseY} ${cutoffX} ${floorY}
                               Q ${cutoffX + width * 0.3} ${baseY} ${Math.min(200, cutoffX + width)} ${baseY}
                               L 200 ${baseY}`;
                    }
                    return pathD;
                  };
                  
                  const minPath = generateCurve(minCutoffX);
                  const maxPath = generateCurve(maxCutoffX);
                  
                  return (
                    <>
                      {/* Grid lines */}
                      <line x1="0" y1="40" x2="200" y2="40" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                      
                      {/* Modulation range indicator */}
                      <rect 
                        x={minCutoffX} 
                        y="0" 
                        width={Math.max(2, maxCutoffX - minCutoffX)} 
                        height="80" 
                        fill="rgba(100,180,255,0.15)"
                      />
                      
                      {/* Min cutoff line */}
                      <line x1={minCutoffX} y1="0" x2={minCutoffX} y2="80" stroke="rgba(100,180,255,0.5)" strokeWidth="1" strokeDasharray="3,3" />
                      
                      {/* Max cutoff line */}
                      <line x1={maxCutoffX} y1="0" x2={maxCutoffX} y2="80" stroke="rgba(255,180,100,0.5)" strokeWidth="1" strokeDasharray="3,3" />
                      
                      {/* Live filter position - bright green dotted line */}
                      {engineState.isRunning && (
                        <line 
                          x1={liveX} 
                          y1="0" 
                          x2={liveX} 
                          y2="80" 
                          stroke="rgb(0,255,150)" 
                          strokeWidth="1" 
                          strokeDasharray="4,4"
                        />
                      )}
                      
                      {/* Filter curve at min cutoff (faded) */}
                      <path
                        d={minPath}
                        fill="none"
                        stroke="rgba(100, 180, 255, 0.5)"
                        strokeWidth="1.5"
                      />
                      
                      {/* Filter curve at max cutoff */}
                      <path
                        d={maxPath}
                        fill="none"
                        stroke="rgba(255, 180, 100, 0.9)"
                        strokeWidth="2"
                      />
                      {/* Fill under max curve */}
                      <path
                        d={maxPath + ` L 200 80 L 0 80 Z`}
                        fill="rgba(255, 180, 100, 0.1)"
                      />
                      
                      {/* Labels */}
                      <text 
                        x={Math.min(170, Math.max(10, minCutoffX))} 
                        y="78" 
                        fill="rgba(100,180,255,0.8)" 
                        fontSize="7" 
                        textAnchor="middle"
                      >
                        {state.filterCutoffMin}
                      </text>
                      <text 
                        x={Math.min(190, Math.max(30, maxCutoffX))} 
                        y="78" 
                        fill="rgba(255,180,100,0.8)" 
                        fontSize="7" 
                        textAnchor="middle"
                      >
                        {state.filterCutoffMax}
                      </text>
                      
                      {/* Q indicator */}
                      <text 
                        x="190" 
                        y="12" 
                        fill="rgba(150,200,255,0.6)" 
                        fontSize="7" 
                        textAnchor="end"
                      >
                        Q:{state.filterQ.toFixed(1)}
                      </text>
                      
                      {/* Mod speed indicator */}
                      <text 
                        x="5" 
                        y="12" 
                        fill="rgba(180,255,180,0.7)" 
                        fontSize="7" 
                        textAnchor="start"
                      >
                        ~{state.filterModSpeed.toFixed(1)} phrases
                      </text>
                    </>
                  );
                })()}
              </svg>
              {/* Live frequency display - outside SVG for performance */}
              {engineState.isRunning && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'rgb(0,255,150)',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textShadow: '0 0 10px rgba(0,255,150,0.5)'
                }}>
                  {Math.round(liveFilterFreq)} Hz
                </div>
              )}
              {/* Frequency axis labels */}
              <div style={{
                position: 'absolute',
                bottom: '2px',
                left: '8px',
                right: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.6rem',
                color: 'rgba(255,255,255,0.3)'
              }}>
                <span>40Hz</span>
                <span>500Hz</span>
                <span>8kHz</span>
              </div>
            </div>
          </div>

          <Slider
            label="Warmth"
            value={state.warmth}
            paramKey="warmth"
            onChange={handleSliderChange}
            {...sliderProps('warmth')}
          />
          <Slider
            label="Presence"
            value={state.presence}
            paramKey="presence"
            onChange={handleSliderChange}
            {...sliderProps('presence')}
          />
          <Slider
            label="Air / Noise"
            value={state.airNoise}
            paramKey="airNoise"
            onChange={handleSliderChange}
            {...sliderProps('airNoise')}
          />
        </CollapsiblePanel>
        </>)}

        {/* === FX TAB === */}
        {activeTab === 'fx' && (<>
        {/* Space */}
        <CollapsiblePanel
          id="space"
          title="Space (Reverb)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('space')}
          onToggle={togglePanel}
        >
          {/* Reverb Enable toggle */}
          <div className="app-slider-group" style={styles.sliderGroup}>
            <div className="app-slider-label" style={styles.sliderLabel}>
              <span>Reverb</span>
              <span style={{ 
                color: state.reverbEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.reverbEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('reverbEnabled', !state.reverbEnabled)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.reverbEnabled 
                  ? 'linear-gradient(135deg, #10b981, #059669)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.reverbEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.reverbEnabled ? '● Active' : '○ Bypassed (saves CPU)'}
            </button>
          </div>

          <Select
            label="Reverb Engine"
            value={state.reverbEngine}
            options={[
              { value: 'algorithmic', label: 'Algorithmic' },
              { value: 'convolution', label: 'Convolution (HQ)' },
            ]}
            onChange={(v) => handleSelectChange('reverbEngine', v)}
          />
          <Select
            label="Reverb Type"
            value={state.reverbType}
            options={[
              { value: 'plate', label: 'Plate' },
              { value: 'hall', label: 'Hall' },
              { value: 'cathedral', label: 'Cathedral' },
              { value: 'darkHall', label: 'Dark Hall' },
            ]}
            onChange={(v) => handleSelectChange('reverbType', v)}
          />
          <Select
            label="Reverb Quality"
            value={state.reverbQuality}
            options={[
              { value: 'ultra', label: 'Ultra (32 diffusers)' },
              { value: 'balanced', label: 'Balanced (16 diffusers)' },
              { value: 'lite', label: 'Lite (4-ch FDN)' },
            ]}
            onChange={(v) => handleSelectChange('reverbQuality', v)}
          />
          <Slider
            label="Decay"
            value={state.reverbDecay}
            paramKey="reverbDecay"
            onChange={handleSliderChange}
            {...sliderProps('reverbDecay')}
          />
          <Slider
            label="Size"
            value={state.reverbSize}
            paramKey="reverbSize"
            onChange={handleSliderChange}
            {...sliderProps('reverbSize')}
          />
          <Slider
            label="Diffusion"
            value={state.reverbDiffusion}
            paramKey="reverbDiffusion"
            onChange={handleSliderChange}
            {...sliderProps('reverbDiffusion')}
          />
          <Slider
            label="Modulation"
            value={state.reverbModulation}
            paramKey="reverbModulation"
            onChange={handleSliderChange}
            {...sliderProps('reverbModulation')}
          />
          <Slider
            label="Pre-delay"
            value={state.predelay}
            paramKey="predelay"
            unit="ms"
            onChange={handleSliderChange}
            {...sliderProps('predelay')}
          />
          <Slider
            label="Damping"
            value={state.damping}
            paramKey="damping"
            onChange={handleSliderChange}
            {...sliderProps('damping')}
          />
          <Slider
            label="Width"
            value={state.width}
            paramKey="width"
            onChange={handleSliderChange}
            {...sliderProps('width')}
          />
        </CollapsiblePanel>

        {/* Granular */}
        <CollapsiblePanel
          id="granular"
          title="Granular"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('granular')}
          onToggle={togglePanel}
        >
          {/* Enable toggle */}
          <div className="app-slider-group" style={styles.sliderGroup}>
            <div className="app-slider-label" style={styles.sliderLabel}>
              <span>Granular Enabled</span>
              <span style={{ 
                color: state.granularEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.granularEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('granularEnabled', !state.granularEnabled)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.granularEnabled 
                  ? 'linear-gradient(135deg, #10b981, #059669)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.granularEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.granularEnabled ? '● Active' : '○ Bypassed'}
            </button>
          </div>

          <Slider
            label="Max Grains"
            value={state.maxGrains}
            paramKey="maxGrains"
            onChange={handleSliderChange}
            {...sliderProps('maxGrains')}
          />
          <Slider
            label="Grain Probability"
            value={state.grainProbability}
            paramKey="grainProbability"
            onChange={handleSliderChange}
            {...sliderProps('grainProbability')}
          />
          
          <Slider
            label="Grain Size"
            value={state.grainSize}
            paramKey="grainSize"
            unit="ms"
            onChange={handleSliderChange}
            {...sliderProps('grainSize')}
          />

          <Slider
            label="Density"
            value={state.density}
            paramKey="density"
            unit="/s"
            onChange={handleSliderChange}
            {...sliderProps('density')}
          />
          <Slider
            label="Spray"
            value={state.spray}
            paramKey="spray"
            unit="ms"
            onChange={handleSliderChange}
            {...sliderProps('spray')}
          />
          <Slider
            label="Jitter"
            value={state.jitter}
            paramKey="jitter"
            unit="ms"
            onChange={handleSliderChange}
            {...sliderProps('jitter')}
          />
          <Select
            label="Pitch Mode"
            value={state.grainPitchMode}
            options={[
              { value: 'harmonic', label: 'Harmonic (5ths, Octaves)' },
              { value: 'random', label: 'Random Spread' },
            ]}
            onChange={(v) => handleSelectChange('grainPitchMode', v)}
          />
          <Slider
            label="Pitch Spread"
            value={state.pitchSpread}
            paramKey="pitchSpread"
            unit="st"
            onChange={handleSliderChange}
            {...sliderProps('pitchSpread')}
          />
          <Slider
            label="Stereo Spread"
            value={state.stereoSpread}
            paramKey="stereoSpread"
            onChange={handleSliderChange}
            {...sliderProps('stereoSpread')}
          />
          <Slider
            label="Feedback"
            value={state.feedback}
            paramKey="feedback"
            onChange={handleSliderChange}
            {...sliderProps('feedback')}
          />
          <Slider
            label="Wet HPF"
            value={state.wetHPF}
            paramKey="wetHPF"
            unit="Hz"
            onChange={handleSliderChange}
            {...sliderProps('wetHPF')}
          />
          <Slider
            label="Wet LPF"
            value={state.wetLPF}
            paramKey="wetLPF"
            unit="Hz"
            onChange={handleSliderChange}
            {...sliderProps('wetLPF')}
          />
        </CollapsiblePanel>
        </>)}

        {/* === LEAD TAB === */}
        {activeTab === 'lead' && (<>
        {/* Lead Synth (4op FM Preset Morph) */}
        <CollapsiblePanel
          id="lead"
          title="Lead Synth"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('lead')}
          onToggle={togglePanel}
        >
          {/* Enable toggle */}
          <div className="app-slider-group" style={styles.sliderGroup}>
            <div className="app-slider-label" style={styles.sliderLabel}>
              <span>Lead Enabled</span>
              <span style={{ 
                color: state.leadEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.leadEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('leadEnabled', !state.leadEnabled)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.leadEnabled 
                  ? 'linear-gradient(135deg, #10b981, #059669)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.leadEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.leadEnabled ? '● Playing' : '○ Stopped'}
            </button>
          </div>

          <Slider
            label="Note Density"
            value={state.lead1Density}
            paramKey="lead1Density"
            unit="/phrase"
            onChange={handleSliderChange}
            {...sliderProps('lead1Density')}
          />

          <Slider
            label="Octave Offset"
            value={state.lead1Octave}
            paramKey="lead1Octave"
            onChange={handleSliderChange}
            {...sliderProps('lead1Octave')}
          />

          <Slider
            label="Octave Range"
            value={state.lead1OctaveRange}
            paramKey="lead1OctaveRange"
            unit=" oct"
            onChange={handleSliderChange}
            {...sliderProps('lead1OctaveRange')}
          />

          {/* ═══ Lead 1: Preset A ↔ B Morph ═══ */}
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 'bold' }}>Lead 1 — Preset Morph</span>
          </div>
          <div style={{
            padding: '12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            {/* Preset A / B selectors */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginBottom: '4px' }}>Preset A</div>
                <select
                  value={state.lead1PresetA}
                  onChange={(e) => handleSelectChange('lead1PresetA', e.target.value)}
                  style={{
                    width: '100%', padding: '6px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.08)', color: '#ddd',
                    border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.8rem',
                  }}
                >
                  {lead4opPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginBottom: '4px' }}>Preset B</div>
                <select
                  value={state.lead1PresetB}
                  onChange={(e) => handleSelectChange('lead1PresetB', e.target.value)}
                  style={{
                    width: '100%', padding: '6px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.08)', color: '#ddd',
                    border: '1px solid rgba(139,92,246,0.3)', fontSize: '0.8rem',
                  }}
                >
                  {lead4opPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <Slider
              label="Morph A→B"
              value={state.lead1Morph}
              paramKey="lead1Morph"
              onChange={handleSliderChange}
              {...sliderProps('lead1Morph')}
            />

            {/* Random walk controls */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
              <button
                onClick={() => handleSelectChange('lead1MorphAuto', !state.lead1MorphAuto)}
                style={{
                  padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 'bold',
                  background: state.lead1MorphAuto ? 'linear-gradient(135deg, #f59e0b, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                  color: state.lead1MorphAuto ? '#fff' : '#888',
                }}
              >
                {state.lead1MorphAuto ? '● Random Walk' : '○ Random Walk'}
              </button>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Speed"
                  value={state.lead1MorphSpeed}
                  paramKey="lead1MorphSpeed"
                  unit=" phr"
                  onChange={handleSliderChange}
                  {...sliderProps('lead1MorphSpeed')}
                />
              </div>
            </div>

            {/* Algorithm mode */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#888' }}>Algorithm:</span>
              <button
                onClick={() => handleSelectChange('lead1AlgorithmMode', state.lead1AlgorithmMode === 'snap' ? 'presetA' : 'snap')}
                style={{
                  padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem',
                  background: state.lead1AlgorithmMode === 'snap' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)',
                  color: state.lead1AlgorithmMode === 'snap' ? '#f59e0b' : '#8b5cf6',
                }}
              >
                {state.lead1AlgorithmMode === 'snap' ? 'Snap @ 50%' : 'Always A'}
              </button>
            </div>

            {/* Level */}
            <Slider
              label="Lead 1 Level"
              value={state.lead1Level}
              paramKey="lead1Level"
              onChange={handleSliderChange}
              {...sliderProps('lead1Level')}
            />

            {/* ADSR (Preset or Custom) */}
            {(() => {
              const mp = audioEngine.getLeadMorphedParams(1);
              const env = mp
                ? {
                    attack: mp.attack,
                    decay: mp.decay,
                    sustain: mp.sustain,
                    release: mp.release,
                  }
                : null;
              const useCustomAdsr = state.lead1UseCustomAdsr;
              const hasPresetEnv = (
                !!env &&
                typeof env.attack === 'number' &&
                typeof env.decay === 'number' &&
                typeof env.sustain === 'number' &&
                typeof env.release === 'number' &&
                Number.isFinite(env.attack) &&
                Number.isFinite(env.decay) &&
                Number.isFinite(env.sustain) &&
                Number.isFinite(env.release)
              );
              const customEnv = {
                attack: state.lead1Attack,
                decay: state.lead1Decay,
                sustain: state.lead1Sustain,
                release: state.lead1Release,
              };
              const safeEnv = useCustomAdsr
                ? customEnv
                : hasPresetEnv
                ? env
                : customEnv;

              if (
                typeof safeEnv.attack !== 'number' ||
                typeof safeEnv.decay !== 'number' ||
                typeof safeEnv.sustain !== 'number' ||
                typeof safeEnv.release !== 'number' ||
                !Number.isFinite(safeEnv.attack) ||
                !Number.isFinite(safeEnv.decay) ||
                !Number.isFinite(safeEnv.sustain) ||
                !Number.isFinite(safeEnv.release)
              ) {
                return null;
              }

              const totalTime = safeEnv.attack + safeEnv.decay + state.lead1Hold + safeEnv.release;
              const safeTotal = totalTime > 0 ? totalTime : 0.001;
              const aEnd = (safeEnv.attack / safeTotal) * 100;
              const dEnd = ((safeEnv.attack + safeEnv.decay) / safeTotal) * 100;
              const sEnd = ((safeEnv.attack + safeEnv.decay + state.lead1Hold) / safeTotal) * 100;
              const sustainY = (1 - Math.min(1, Math.max(0, safeEnv.sustain))) * 50;
              const sourceLabel = useCustomAdsr ? 'custom' : (hasPresetEnv ? 'from preset' : 'fallback');

              return (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <button
                      onClick={() => handleSelectChange('lead1UseCustomAdsr', false)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        fontSize: '0.7rem',
                        background: !useCustomAdsr ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)',
                        color: !useCustomAdsr ? '#f59e0b' : '#999',
                      }}
                    >
                      Preset ADSR
                    </button>
                    <button
                      onClick={() => handleSelectChange('lead1UseCustomAdsr', true)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        fontSize: '0.7rem',
                        background: useCustomAdsr ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)',
                        color: useCustomAdsr ? '#f59e0b' : '#999',
                      }}
                    >
                      Custom ADSR
                    </button>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>
                    Envelope ({sourceLabel}) — A:{safeEnv.attack.toFixed(3)}s D:{safeEnv.decay.toFixed(2)}s S:{(safeEnv.sustain * 100).toFixed(0)}% R:{safeEnv.release.toFixed(2)}s
                  </div>
                  <svg width="100%" height="40" viewBox="0 0 100 50" preserveAspectRatio="none" style={{ opacity: 0.7 }}>
                    <path
                      d={`M 0 50 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 50`}
                      fill="none" stroke="rgba(245,158,11,0.8)" strokeWidth="1.5"
                    />
                    <path
                      d={`M 0 50 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 50 Z`}
                      fill="rgba(245,158,11,0.1)"
                    />
                  </svg>
                  {useCustomAdsr && (
                    <div style={{ marginTop: '8px' }}>
                      <Slider
                        label="Attack"
                        value={state.lead1Attack}
                        paramKey="lead1Attack"
                        unit="s"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Attack')}
                      />
                      <Slider
                        label="Decay"
                        value={state.lead1Decay}
                        paramKey="lead1Decay"
                        unit="s"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Decay')}
                      />
                      <Slider
                        label="Sustain"
                        value={state.lead1Sustain}
                        paramKey="lead1Sustain"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Sustain')}
                      />
                      <Slider
                        label="Release"
                        value={state.lead1Release}
                        paramKey="lead1Release"
                        unit="s"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Release')}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ═══ Lead 2: Preset C ↔ D Morph ═══ */}
          <div style={{ marginTop: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#06b6d4', fontWeight: 'bold' }}>Lead 2 — Preset Morph</span>
            <button
              onClick={() => handleSelectChange('lead2Enabled', !state.lead2Enabled)}
              style={{
                padding: '2px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                fontSize: '0.7rem', fontWeight: 'bold',
                background: state.lead2Enabled ? 'linear-gradient(135deg, #06b6d4, #0284c7)' : 'rgba(255,255,255,0.1)',
                color: state.lead2Enabled ? '#fff' : '#888',
              }}
            >
              {state.lead2Enabled ? '● ON' : '○ OFF'}
            </button>
          </div>
          {state.lead2Enabled && (
          <div style={{
            padding: '12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            {/* Preset C / D selectors */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: '#06b6d4', marginBottom: '4px' }}>Preset C</div>
                <select
                  value={state.lead2PresetC}
                  onChange={(e) => handleSelectChange('lead2PresetC', e.target.value)}
                  style={{
                    width: '100%', padding: '6px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.08)', color: '#ddd',
                    border: '1px solid rgba(6,182,212,0.3)', fontSize: '0.8rem',
                  }}
                >
                  {lead4opPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: '#a78bfa', marginBottom: '4px' }}>Preset D</div>
                <select
                  value={state.lead2PresetD}
                  onChange={(e) => handleSelectChange('lead2PresetD', e.target.value)}
                  style={{
                    width: '100%', padding: '6px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.08)', color: '#ddd',
                    border: '1px solid rgba(167,139,250,0.3)', fontSize: '0.8rem',
                  }}
                >
                  {lead4opPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <Slider
              label="Morph A→B"
              value={state.lead2Morph}
              paramKey="lead2Morph"
              onChange={handleSliderChange}
              {...sliderProps('lead2Morph')}
            />

            {/* Random walk controls */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
              <button
                onClick={() => handleSelectChange('lead2MorphAuto', !state.lead2MorphAuto)}
                style={{
                  padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 'bold',
                  background: state.lead2MorphAuto ? 'linear-gradient(135deg, #06b6d4, #a78bfa)' : 'rgba(255,255,255,0.1)',
                  color: state.lead2MorphAuto ? '#fff' : '#888',
                }}
              >
                {state.lead2MorphAuto ? '● Random Walk' : '○ Random Walk'}
              </button>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Speed"
                  value={state.lead2MorphSpeed}
                  paramKey="lead2MorphSpeed"
                  unit=" phr"
                  onChange={handleSliderChange}
                  {...sliderProps('lead2MorphSpeed')}
                />
              </div>
            </div>

            {/* Algorithm mode */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#888' }}>Algorithm:</span>
              <button
                onClick={() => handleSelectChange('lead2AlgorithmMode', state.lead2AlgorithmMode === 'snap' ? 'presetA' : 'snap')}
                style={{
                  padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem',
                  background: state.lead2AlgorithmMode === 'snap' ? 'rgba(6,182,212,0.2)' : 'rgba(167,139,250,0.2)',
                  color: state.lead2AlgorithmMode === 'snap' ? '#06b6d4' : '#a78bfa',
                }}
              >
                {state.lead2AlgorithmMode === 'snap' ? 'Snap @ 50%' : 'Always C'}
              </button>
            </div>

            {/* Level */}
            <Slider
              label="Lead 2 Level"
              value={state.lead2Level}
              paramKey="lead2Level"
              onChange={handleSliderChange}
              {...sliderProps('lead2Level')}
            />

            {/* ADSR (Preset or Custom) */}
            {(() => {
              const mp = audioEngine.getLeadMorphedParams(2);
              const env = mp
                ? {
                    attack: mp.attack,
                    decay: mp.decay,
                    sustain: mp.sustain,
                    release: mp.release,
                  }
                : null;
              const useCustomAdsr = state.lead1UseCustomAdsr;
              const hasPresetEnv = (
                !!env &&
                typeof env.attack === 'number' &&
                typeof env.decay === 'number' &&
                typeof env.sustain === 'number' &&
                typeof env.release === 'number' &&
                Number.isFinite(env.attack) &&
                Number.isFinite(env.decay) &&
                Number.isFinite(env.sustain) &&
                Number.isFinite(env.release)
              );
              const customEnv = {
                attack: state.lead1Attack,
                decay: state.lead1Decay,
                sustain: state.lead1Sustain,
                release: state.lead1Release,
              };
              const safeEnv = useCustomAdsr
                ? customEnv
                : hasPresetEnv
                ? env
                : customEnv;

              if (
                typeof safeEnv.attack !== 'number' ||
                typeof safeEnv.decay !== 'number' ||
                typeof safeEnv.sustain !== 'number' ||
                typeof safeEnv.release !== 'number' ||
                !Number.isFinite(safeEnv.attack) ||
                !Number.isFinite(safeEnv.decay) ||
                !Number.isFinite(safeEnv.sustain) ||
                !Number.isFinite(safeEnv.release)
              ) {
                return null;
              }

              const totalTime = safeEnv.attack + safeEnv.decay + state.lead1Hold + safeEnv.release;
              const safeTotal = totalTime > 0 ? totalTime : 0.001;
              const aEnd = (safeEnv.attack / safeTotal) * 100;
              const dEnd = ((safeEnv.attack + safeEnv.decay) / safeTotal) * 100;
              const sEnd = ((safeEnv.attack + safeEnv.decay + state.lead1Hold) / safeTotal) * 100;
              const sustainY = (1 - Math.min(1, Math.max(0, safeEnv.sustain))) * 50;
              const sourceLabel = useCustomAdsr ? 'custom' : (hasPresetEnv ? 'from preset' : 'fallback');
              return (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <button
                      onClick={() => handleSelectChange('lead1UseCustomAdsr', false)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        fontSize: '0.7rem',
                        background: !useCustomAdsr ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.08)',
                        color: !useCustomAdsr ? '#06b6d4' : '#999',
                      }}
                    >
                      Preset ADSR
                    </button>
                    <button
                      onClick={() => handleSelectChange('lead1UseCustomAdsr', true)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        fontSize: '0.7rem',
                        background: useCustomAdsr ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.08)',
                        color: useCustomAdsr ? '#06b6d4' : '#999',
                      }}
                    >
                      Custom ADSR
                    </button>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>
                    Envelope ({sourceLabel}) — A:{safeEnv.attack.toFixed(3)}s D:{safeEnv.decay.toFixed(2)}s S:{(safeEnv.sustain*100).toFixed(0)}% R:{safeEnv.release.toFixed(2)}s
                  </div>
                  <svg width="100%" height="40" viewBox="0 0 100 50" preserveAspectRatio="none" style={{ opacity: 0.7 }}>
                    <path
                      d={`M 0 50 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 50`}
                      fill="none" stroke="rgba(6,182,212,0.8)" strokeWidth="1.5"
                    />
                    <path
                      d={`M 0 50 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 50 Z`}
                      fill="rgba(6,182,212,0.1)"
                    />
                  </svg>
                  {useCustomAdsr && (
                    <div style={{ marginTop: '8px' }}>
                      <Slider
                        label="Attack"
                        value={state.lead1Attack}
                        paramKey="lead1Attack"
                        unit="s"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Attack')}
                      />
                      <Slider
                        label="Decay"
                        value={state.lead1Decay}
                        paramKey="lead1Decay"
                        unit="s"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Decay')}
                      />
                      <Slider
                        label="Sustain"
                        value={state.lead1Sustain}
                        paramKey="lead1Sustain"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Sustain')}
                      />
                      <Slider
                        label="Release"
                        value={state.lead1Release}
                        paramKey="lead1Release"
                        unit="s"
                        onChange={handleSliderChange}
                        {...sliderProps('lead1Release')}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          )}

          {/* Shared Hold (not in presets) */}
          <Slider
            label="Hold Time"
            value={state.lead1Hold}
            paramKey="lead1Hold"
            unit="s"
            onChange={handleSliderChange}
            {...sliderProps('lead1Hold')}
          />

          {/* Expression Section - per-note random ranges with trigger indicator */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '12px' }}>Expression (per note)</div>
            
            <Slider
              label="Vibrato Depth"
              value={state.leadVibratoDepth}
              paramKey="leadVibratoDepth"
              unit=" st"
              onChange={handleSliderChange}
              {...sliderProps('leadVibratoDepth')}
            />

            <Slider
              label="Vibrato Rate"
              value={state.leadVibratoRate}
              paramKey="leadVibratoRate"
              unit=" Hz"
              onChange={handleSliderChange}
              {...sliderProps('leadVibratoRate')}
            />

            <Slider
              label="Glide"
              value={state.leadGlide}
              paramKey="leadGlide"
              onChange={handleSliderChange}
              {...sliderProps('leadGlide')}
            />
          </div>

          {/* Delay Section - per-note random ranges with trigger indicator */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '12px' }}>Delay Effect (per note)</div>
            
            <Slider
              label="Delay Time"
              value={state.leadDelayTime}
              paramKey="leadDelayTime"
              unit=" ms"
              onChange={handleSliderChange}
              {...sliderProps('leadDelayTime')}
            />

            <Slider
              label="Delay Feedback"
              value={state.leadDelayFeedback}
              paramKey="leadDelayFeedback"
              onChange={handleSliderChange}
              {...sliderProps('leadDelayFeedback')}
            />

            <Slider
              label="Delay Mix"
              value={state.leadDelayMix}
              paramKey="leadDelayMix"
              onChange={handleSliderChange}
              {...sliderProps('leadDelayMix')}
            />
          </div>
        </CollapsiblePanel>

        {/* Euclidean Polyrhythm Sequencer */}
        <CollapsiblePanel
          id="euclidean"
          title="Euclidean Sequencer"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('euclidean')}
          onToggle={togglePanel}
        >
            
          {/* Master Enable toggle */}
          <div className="app-slider-group" style={styles.sliderGroup}>
            <div className="app-slider-label" style={styles.sliderLabel}>
              <span>Euclidean Mode</span>
              <span style={{ 
                color: state.leadEuclideanMasterEnabled ? '#8b5cf6' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.leadEuclideanMasterEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('leadEuclideanMasterEnabled', !state.leadEuclideanMasterEnabled)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.leadEuclideanMasterEnabled 
                  ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.leadEuclideanMasterEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.leadEuclideanMasterEnabled ? '● Active - Using Patterns' : '○ Inactive - Lead Uses Random'}
            </button>
          </div>
          <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '4px', marginBottom: '12px' }}>
            When ON, enabled lanes trigger notes. When OFF, Lead synth uses random timing.
          </div>

          {/* Tempo control */}
          <Slider
            label="Pattern Tempo"
            value={state.leadEuclideanTempo}
            paramKey="leadEuclideanTempo"
            unit="x"
            onChange={handleSliderChange}
          />
          <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '-8px', marginBottom: '12px' }}>
            Speed multiplier for all lanes
          </div>

          {/* 4 Lane Controls */}
          {[1, 2, 3, 4].map((laneNum) => {
            const laneColors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899'];
            const laneColor = laneColors[laneNum - 1];
            const enabledKey = `leadEuclid${laneNum}Enabled` as keyof typeof state;
            const presetKey = `leadEuclid${laneNum}Preset` as keyof typeof state;
            const stepsKey = `leadEuclid${laneNum}Steps` as keyof typeof state;
            const hitsKey = `leadEuclid${laneNum}Hits` as keyof typeof state;
            const rotationKey = `leadEuclid${laneNum}Rotation` as keyof typeof state;
            const noteMinKey = `leadEuclid${laneNum}NoteMin` as keyof typeof state;
            const noteMaxKey = `leadEuclid${laneNum}NoteMax` as keyof typeof state;
            const levelKey = `leadEuclid${laneNum}Level` as keyof typeof state;
            const probabilityKey = `leadEuclid${laneNum}Probability` as keyof typeof state;
            const sourceKey = `leadEuclid${laneNum}Source` as keyof typeof state;
            
            const isEnabled = state[enabledKey] as boolean;
            const preset = state[presetKey] as string;
            const steps = state[stepsKey] as number;
            const hits = state[hitsKey] as number;
            const rotation = state[rotationKey] as number;
            const noteMin = state[noteMinKey] as number;
            const noteMax = state[noteMaxKey] as number;
            const level = state[levelKey] as number;
            const probability = (state[probabilityKey] as number) ?? 1.0;
            const source = (state[sourceKey] as string) ?? 'lead';

            // Get root note from state (0=C, 1=C#, ..., 4=E, ..., 11=B)
            // Root at octave 2: C2=36, so rootMidi = 36 + rootNote
            const rootMidi = 36 + state.rootNote;
            
            // Helper to convert MIDI note to name relative to root
            const midiToNoteName = (midi: number): string => {
              const noteInOctave = midi % 12;
              const noteName = NOTE_NAMES[noteInOctave];
              // Calculate octave relative to root (root2 = 0, root3 = 1, etc.)
              const octaveFromRoot = Math.floor((midi - rootMidi) / 12);
              return `${noteName}${octaveFromRoot}`;
            };
            
            // Get octave markers based on root note (root3, root4, root5, root6)
            const rootOctaveMarkers = [rootMidi + 12, rootMidi + 24, rootMidi + 36, rootMidi + 48];

            // Generate pattern for visualization
            const resolvedPattern = resolveDrumEuclidPatternParams(preset, steps, hits, rotation);
            const patternSteps = resolvedPattern.steps;
            const patternHits = resolvedPattern.hits;
            const patternRotation = resolvedPattern.rotation;
                  const generatePattern = (s: number, h: number, r: number): boolean[] => {
                    const pattern: boolean[] = [];
                    if (h === 0) {
                      for (let i = 0; i < s; i++) pattern.push(false);
                    } else if (h >= s) {
                      for (let i = 0; i < s; i++) pattern.push(true);
                    } else {
                      let groups: number[][] = [];
                      for (let i = 0; i < h; i++) groups.push([1]);
                      for (let i = 0; i < s - h; i++) groups.push([0]);
                      
                      while (groups.length > 1) {
                        const ones = groups.filter(g => g[0] === 1);
                        const zeros = groups.filter(g => g[0] === 0);
                        if (zeros.length === 0) break;
                        
                        const combined: number[][] = [];
                        const minLen = Math.min(ones.length, zeros.length);
                        for (let i = 0; i < minLen; i++) {
                          combined.push([...ones[i], ...zeros[i]]);
                        }
                        const remainder = ones.length > zeros.length ? ones.slice(minLen) : zeros.slice(minLen);
                        if (remainder.length === 0 || remainder.length === groups.length - minLen) {
                          groups = [...combined, ...remainder];
                          break;
                        }
                        groups = [...combined, ...remainder];
                      }
                      
                      for (const g of groups) {
                        for (const v of g) pattern.push(v === 1);
                      }
                    }
                    return [...pattern.slice(r % pattern.length), ...pattern.slice(0, r % pattern.length)];
                  };

                  const pattern = generatePattern(patternSteps, patternHits, patternRotation);

                  return (
                    <div 
                      key={laneNum}
                      style={{
                        marginBottom: '12px',
                        padding: '10px',
                        background: isEnabled ? `rgba(${laneNum === 1 ? '245, 158, 11' : laneNum === 2 ? '16, 185, 129' : laneNum === 3 ? '59, 130, 246' : '236, 72, 153'}, 0.1)` : 'rgba(255,255,255,0.02)',
                        borderRadius: '8px',
                        border: `1px solid ${isEnabled ? laneColor : '#333'}`,
                        opacity: isEnabled ? 1 : 0.6,
                      }}
                    >
                      {/* Lane header with toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <button
                          onClick={() => handleSelectChange(enabledKey, !isEnabled)}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: 'none',
                            cursor: 'pointer',
                            background: isEnabled ? laneColor : 'rgba(255,255,255,0.15)',
                            color: isEnabled ? 'white' : '#666',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          {laneNum}
                        </button>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          color: isEnabled ? laneColor : '#666',
                          fontWeight: isEnabled ? 'bold' : 'normal',
                          flex: 1,
                        }}>
                          Lane {laneNum} {isEnabled ? '' : '(off)'}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#888' }}>
                          {midiToNoteName(noteMin)}–{midiToNoteName(noteMax)}
                        </span>
                      </div>

                      {isEnabled && (
                        <>
                          {/* Pattern visualization */}
                          <div style={{ 
                            display: 'flex', 
                            flexWrap: 'wrap', 
                            gap: '2px',
                            marginBottom: '8px',
                            justifyContent: 'center',
                          }}>
                            {pattern.map((hit, i) => (
                              <div
                                key={i}
                                style={{
                                  width: patternSteps > 16 ? '8px' : '12px',
                                  height: patternSteps > 16 ? '8px' : '12px',
                                  borderRadius: '50%',
                                  background: hit ? laneColor : 'rgba(255,255,255,0.15)',
                                  boxShadow: hit ? `0 0 6px ${laneColor}` : 'none',
                                }}
                              />
                            ))}
                          </div>

                          {/* Preset selector */}
                          <select
                            value={preset}
                            onChange={(e) => handleSelectChange(presetKey, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px',
                              borderRadius: '4px',
                              border: `1px solid ${laneColor}40`,
                              background: 'rgba(0,0,0,0.4)',
                              color: '#eee',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              marginBottom: '6px',
                            }}
                          >
                            <optgroup label="Polyrhythmic / Complex">
                              <option value="sparse">Sparse (16/1)</option>
                              <option value="dense">Dense (8/7)</option>
                              <option value="longSparse">Long Sparse (32/3)</option>
                              <option value="poly3v4">3 vs 4 (12/3)</option>
                              <option value="poly4v3">4 vs 3 (12/4)</option>
                              <option value="poly5v3">5 vs 3 (15/5)</option>
                              <option value="poly5v4">5 vs 4 (20/5)</option>
                              <option value="poly7v4">7 vs 4 (28/7)</option>
                              <option value="poly5v7">5 vs 7 (35/5)</option>
                              <option value="prime17">Prime 17 (17/7)</option>
                              <option value="prime19">Prime 19 (19/7)</option>
                              <option value="prime23">Prime 23 (23/9)</option>
                            </optgroup>
                            <optgroup label="Indonesian Gamelan">
                              <option value="lancaran">Lancaran (16/4)</option>
                              <option value="ketawang">Ketawang (16/2)</option>
                              <option value="ladrang">Ladrang (32/8)</option>
                              <option value="gangsaran">Gangsaran (8/4)</option>
                              <option value="kotekan">Kotekan A (8/3)</option>
                              <option value="kotekan2">Kotekan B (8/3 r:4)</option>
                              <option value="srepegan">Srepegan (16/6)</option>
                              <option value="sampak">Sampak (8/5)</option>
                              <option value="ayak">Ayak (16/3)</option>
                              <option value="bonang">Bonang (12/5)</option>
                            </optgroup>
                            <optgroup label="World Rhythms">
                              <option value="tresillo">Tresillo (8/3)</option>
                              <option value="cinquillo">Cinquillo (8/5)</option>
                              <option value="rumba">Rumba (16/5)</option>
                              <option value="bossa">Bossa Nova (16/5)</option>
                              <option value="son">Son Clave (16/7)</option>
                              <option value="shiko">Shiko (16/5)</option>
                              <option value="soukous">Soukous (12/7)</option>
                              <option value="gahu">Gahu (16/7)</option>
                              <option value="bembe">Bembé (12/7)</option>
                              <option value="aksak9">Aksak 9 (9/5)</option>
                              <option value="aksak7">Aksak 7 (7/3)</option>
                              <option value="clave23">Clave 2+3 (8/2)</option>
                              <option value="clave32">Clave 3+2 (8/3)</option>
                            </optgroup>
                            <optgroup label="Steve Reich / Experimental">
                              <option value="clapping">Clapping Music (12/8)</option>
                              <option value="clappingB">Clapping B (12/8 r:5)</option>
                              <option value="additive7">Additive 7 (7/4)</option>
                              <option value="additive11">Additive 11 (11/5)</option>
                              <option value="additive13">Additive 13 (13/5)</option>
                              <option value="reich18">Reich 18 (12/7)</option>
                              <option value="drumming">Drumming (8/6)</option>
                            </optgroup>
                            <option value="custom">Custom</option>
                          </select>

                          {/* Note Range - dual slider display */}
                          <div style={{ marginBottom: '6px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '4px' }}>
                              Note Range: {noteMin === noteMax ? midiToNoteName(noteMin) : `${midiToNoteName(noteMin)} – ${midiToNoteName(noteMax)}`}
                            </div>
                            {/* Visual range bar */}
                            <div style={{
                              position: 'relative',
                              height: '20px',
                              background: 'rgba(255,255,255,0.1)',
                              borderRadius: '4px',
                              marginBottom: '4px',
                            }}>
                              {/* Active range */}
                              <div style={{
                                position: 'absolute',
                                left: `${((noteMin - 36) / 60) * 100}%`,
                                width: noteMin === noteMax ? '3px' : `${((noteMax - noteMin) / 60) * 100}%`,
                                minWidth: '3px',
                                height: '100%',
                                background: `linear-gradient(90deg, ${laneColor}80, ${laneColor})`,
                                borderRadius: '4px',
                              }} />
                              {/* Octave markers on E (root note) */}
                              {rootOctaveMarkers.map((midi) => (
                                <div
                                  key={midi}
                                  style={{
                                    position: 'absolute',
                                    left: `${((midi - 36) / 60) * 100}%`,
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    background: 'rgba(255,255,255,0.4)',
                                  }}
                                />
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', color: '#666' }}>Low: {midiToNoteName(noteMin)}</div>
                                <input
                                  type="range"
                                  min="36"
                                  max="96"
                                  step="1"
                                  value={noteMin}
                                  onChange={(e) => {
                                    const newMin = parseInt(e.target.value);
                                    handleSliderChange(noteMinKey as keyof SliderState, Math.min(newMin, noteMax));
                                  }}
                                  style={{ width: '100%', cursor: 'pointer' }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', color: '#666' }}>High: {midiToNoteName(noteMax)}</div>
                                <input
                                  type="range"
                                  min="36"
                                  max="96"
                                  step="1"
                                  value={noteMax}
                                  onChange={(e) => {
                                    const newMax = parseInt(e.target.value);
                                    handleSliderChange(noteMaxKey as keyof SliderState, Math.max(newMax, noteMin));
                                  }}
                                  style={{ width: '100%', cursor: 'pointer' }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Level and Rotation row */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {/* Level slider */}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Level {Math.round(level * 100)}%</div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={level}
                                onChange={(e) => handleSliderChange(levelKey as keyof SliderState, parseFloat(e.target.value))}
                                style={{ width: '100%', cursor: 'pointer' }}
                              />
                            </div>
                            
                            {/* Rotation buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Rotate: {rotation}</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  onClick={() => {
                                    const maxSteps = preset === 'custom' ? steps : patternSteps;
                                    const newRot = (rotation + 1) % maxSteps;
                                    handleSliderChange(rotationKey as keyof SliderState, newRot);
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: `${laneColor}30`,
                                    border: `1px solid ${laneColor}60`,
                                    borderRadius: '4px',
                                    color: laneColor,
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                  }}
                                  title="Rotate pattern left"
                                >
                                  ←
                                </button>
                                <button
                                  onClick={() => {
                                    const maxSteps = preset === 'custom' ? steps : patternSteps;
                                    const newRot = (rotation - 1 + maxSteps) % maxSteps;
                                    handleSliderChange(rotationKey as keyof SliderState, newRot);
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: `${laneColor}30`,
                                    border: `1px solid ${laneColor}60`,
                                    borderRadius: '4px',
                                    color: laneColor,
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                  }}
                                  title="Rotate pattern right"
                                >
                                  →
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Probability and Source row */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                            {/* Probability slider */}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Probability {Math.round(probability * 100)}%</div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={probability}
                                onChange={(e) => handleSliderChange(probabilityKey as keyof SliderState, parseFloat(e.target.value))}
                                style={{ width: '100%', cursor: 'pointer' }}
                              />
                            </div>
                            
                            {/* Sound Source dropdown */}
                            <div style={{ minWidth: '80px' }}>
                              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Source</div>
                              <select
                                value={source}
                                onChange={(e) => handleSelectChange(sourceKey, e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  border: `1px solid ${laneColor}40`,
                                  background: 'rgba(0,0,0,0.4)',
                                  color: source === 'lead' || source === 'lead1' ? '#D4A520' : source === 'lead2' ? '#06b6d4' : '#C4724E',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem',
                                }}
                              >
                                <option value="lead">Lead 1</option>
                                <option value="lead1">Lead 1</option>
                                <option value="lead2">Lead 2</option>
                                <option value="synth1">Synth 1</option>
                                <option value="synth2">Synth 2</option>
                                <option value="synth3">Synth 3</option>
                                <option value="synth4">Synth 4</option>
                                <option value="synth5">Synth 5</option>
                                <option value="synth6">Synth 6</option>
                              </select>
                            </div>
                          </div>

                          {/* Custom controls - only show when custom is selected */}
                          {preset === 'custom' && (
                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', color: '#888' }}>Steps: {steps}</div>
                                <input
                                  type="range"
                                  min="4"
                                  max="32"
                                  step="1"
                                  value={steps}
                                  onChange={(e) => handleSliderChange(stepsKey as keyof SliderState, parseInt(e.target.value))}
                                  style={{ width: '100%', cursor: 'pointer' }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', color: '#888' }}>Hits: {hits}</div>
                                <input
                                  type="range"
                                  min="1"
                                  max={steps}
                                  step="1"
                                  value={Math.min(hits, steps)}
                                  onChange={(e) => handleSliderChange(hitsKey as keyof SliderState, parseInt(e.target.value))}
                                  style={{ width: '100%', cursor: 'pointer' }}
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

          <div style={{ fontSize: '0.65rem', color: '#666', textAlign: 'center', marginTop: '4px' }}>
            Enable multiple lanes for interlocking gamelan-style polyrhythms
          </div>
        </CollapsiblePanel>
        </>)}

        {/* === FX TAB (continued) === */}
        {activeTab === 'fx' && (<>
        {/* Ocean Waves */}
        <CollapsiblePanel
          id="ocean"
          title="Ocean Sounds"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('ocean')}
          onToggle={togglePanel}
        >
          {/* Real Sample Toggle */}
          <div className="app-slider-group" style={styles.sliderGroup}>
            <div className="app-slider-label" style={styles.sliderLabel}>
              <span>Beach Recording (Ghetary)</span>
              <span style={{ 
                color: state.oceanSampleEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.oceanSampleEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.oceanSampleEnabled 
                  ? 'linear-gradient(135deg, #06b6d4, #0891b2)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.oceanSampleEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.oceanSampleEnabled ? '● Playing Sample' : '○ Sample Off'}
            </button>
          </div>

          {/* Wave Synth Toggle */}
          <div className="app-slider-group" style={{ marginTop: '16px', ...styles.sliderGroup }}>
            <div className="app-slider-label" style={styles.sliderLabel}>
              <span>Wave Synthesis</span>
              <span style={{ 
                color: state.oceanWaveSynthEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.oceanWaveSynthEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('oceanWaveSynthEnabled', !state.oceanWaveSynthEnabled)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.oceanWaveSynthEnabled 
                  ? 'linear-gradient(135deg, #3b82f6, #2563eb)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.oceanWaveSynthEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.oceanWaveSynthEnabled ? '● Synth Playing' : '○ Synth Off'}
            </button>
          </div>

          <Slider
            label="Wave Synth Level"
            value={state.oceanWaveSynthLevel}
            paramKey="oceanWaveSynthLevel"
            onChange={handleSliderChange}
            {...sliderProps('oceanWaveSynthLevel')}
          />

          {/* Wave Timing (only for synthesis) */}
          {state.oceanWaveSynthEnabled && (
            <>
              <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Wave Timing</span>
              </div>
              
              <Slider label="Duration" value={state.oceanDuration} paramKey="oceanDuration" unit=" s"
                onChange={handleSliderChange} {...sliderProps('oceanDuration')}
              />

              <Slider label="Interval" value={state.oceanInterval} paramKey="oceanInterval" unit=" s"
                onChange={handleSliderChange} {...sliderProps('oceanInterval')}
              />

              {/* Wave Character */}
              <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Wave Character</span>
              </div>

              <Slider label="Foam" value={state.oceanFoam} paramKey="oceanFoam"
                onChange={handleSliderChange} {...sliderProps('oceanFoam')}
              />

              <Slider label="Depth" value={state.oceanDepth} paramKey="oceanDepth"
                onChange={handleSliderChange} {...sliderProps('oceanDepth')}
              />
            </>
          )}

          {/* Ocean Filter (applies to both sample and synth) */}
          <div style={{ marginTop: '16px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Ocean Filter</span>
          </div>
          <Select
            label="Filter Type"
            value={state.oceanFilterType}
            options={[
              { value: 'lowpass', label: 'Lowpass (Warm)' },
              { value: 'bandpass', label: 'Bandpass (Focused)' },
              { value: 'highpass', label: 'Highpass (Airy)' },
              { value: 'notch', label: 'Notch (Scoop)' },
            ]}
            onChange={(v) => handleSelectChange('oceanFilterType', v)}
          />
          <Slider
            label="Filter Cutoff"
            value={state.oceanFilterCutoff}
            paramKey="oceanFilterCutoff"
            unit=" Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('oceanFilterCutoff')}
          />
          <Slider
            label="Filter Resonance"
            value={state.oceanFilterResonance}
            paramKey="oceanFilterResonance"
            onChange={handleSliderChange}
            {...sliderProps('oceanFilterResonance')}
          />
        </CollapsiblePanel>
        </>)}

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
            onStepOverridesChange={(overrides) => audioEngine.setDrumStepOverrides(overrides)}
            initialViewMode={drumViewModeRef.current}
            onViewModeChange={(mode) => { drumViewModeRef.current = mode; }}
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
