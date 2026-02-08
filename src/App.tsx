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
  DEFAULT_STATE,
  quantize,
  decodeStateFromUrl,
  getParamInfo,
} from './ui/state';
import { audioEngine, EngineState } from './audio/engine';
import { SCALE_FAMILIES } from './audio/scales';
import { formatChordDegrees, getTimeUntilNextPhrase, calculateDriftedRoot, PHRASE_LENGTH } from './audio/harmony';
import { getPresetNames, DrumVoiceType as DrumPresetVoice } from './audio/drumPresets';
import { applyMorphToState, setDrumMorphOverride, clearDrumMorphEndpointOverrides, clearMidMorphOverrides, setDrumMorphDualRangeOverride, getDrumMorphDualRangeOverrides, interpolateDrumMorphDualRanges } from './audio/drumMorph';
import { isInMidMorph, isAtEndpoint0 } from './audio/morphUtils';
import SnowflakeUI from './ui/SnowflakeUI';
import { CircleOfFifths, getMorphedRootNote } from './ui/CircleOfFifths';
import CloudPresets from './ui/CloudPresets';
import { fetchPresetById, isCloudEnabled } from './cloud/supabase';
import JourneyModeView from './ui/JourneyModeView';
import { useJourney } from './ui/journeyState';

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
  drumKick: '●\uFE0E',
  drumClick: '▪\uFE0E',
  drumBeepHi: '△\uFE0E',
  drumBeepLo: '▽\uFE0E',
  drumNoise: '≋\uFE0E',
} as const;

// Inline long-press helper for elements that can't use hooks (IIFEs, etc.)
// Returns event handlers to spread onto an element
const createLongPressHandlers = (callback: () => void, duration = 400) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    onTouchStart: () => {
      timer = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(50);
        callback();
      }, duration);
    },
    onTouchEnd: () => { if (timer) { clearTimeout(timer); timer = null; } },
    onTouchMove: () => { if (timer) { clearTimeout(timer); timer = null; } },
  };
};

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

// Preset type
interface SavedPreset {
  name: string;
  timestamp: string;
  state: SliderState;
  dualRanges?: Record<string, { min: number; max: number }>;  // Optional for backward compatibility
}

// iOS-only reverb types that won't work on web
const IOS_ONLY_REVERB_TYPES = new Set([
  'smallRoom', 'mediumRoom', 'largeRoom', 'mediumHall', 'largeHall',
  'mediumChamber', 'largeChamber', 'largeRoom2', 'mediumHall2', 
  'mediumHall3', 'largeHall2'
]);

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
  
  // Replace iOS-only reverb types with 'hall'
  if (normalized.reverbType && IOS_ONLY_REVERB_TYPES.has(normalized.reverbType)) {
    normalized.reverbType = 'hall';
  }
  
  return normalized;
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
            presets.push({
              name: data.name || file.replace('.json', ''),
              timestamp: data.timestamp || new Date().toISOString(),
              state: data.state || data,
              dualRanges: data.dualRanges,
            });
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
          presets.push({
            name: data.name || file.replace('.json', ''),
            timestamp: data.timestamp || new Date().toISOString(),
            state: data.state || data,
            dualRanges: data.dualRanges,
          });
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
  } as React.CSSProperties,
  presetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '15px',
    marginBottom: '30px',
  } as React.CSSProperties,
  panel: {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '15px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
  } as React.CSSProperties,
  debugRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  } as React.CSSProperties,
  debugLabel: {
    color: '#9ca3af',
  } as React.CSSProperties,
  debugValue: {
    color: '#a5c4d4',
    fontWeight: 'bold',
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
  isDualMode?: boolean;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  onToggleDual?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
}

const Slider: React.FC<SliderProps> = ({ 
  label, 
  value, 
  paramKey, 
  unit, 
  logarithmic, 
  onChange,
  isDualMode = false,
  dualRange,
  walkPosition,
  onToggleDual,
  onDualRangeChange,
}) => {
  // If dual mode props are provided, use DualSlider
  if (onToggleDual && onDualRangeChange) {
    return (
      <DualSlider
        label={label}
        value={value}
        paramKey={paramKey}
        unit={unit}
        logarithmic={logarithmic}
        isDualMode={isDualMode}
        dualRange={dualRange}
        walkPosition={walkPosition}
        onChange={onChange}
        onToggleDual={onToggleDual}
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

  return (
    <div style={styles.sliderGroup}>
      <div style={styles.sliderLabel}>
        <span>{label}</span>
        <span>
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
        style={styles.slider}
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
    <div style={styles.sliderGroup}>
      <div style={styles.sliderLabel}>
        <span>{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={styles.select}
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

// DualSlider component - supports single or dual (range) mode with random walk
interface DualSliderProps {
  label: string;
  value: number;
  paramKey: keyof SliderState;
  unit?: string;
  logarithmic?: boolean;
  isDualMode: boolean;
  dualRange?: DualSliderRange;
  walkPosition?: number;  // Current random walk position (0-1)
  onChange: (key: keyof SliderState, value: number) => void;
  onToggleDual: (key: keyof SliderState) => void;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}

const DualSlider: React.FC<DualSliderProps> = ({
  label,
  value,
  paramKey,
  unit,
  logarithmic,
  isDualMode,
  dualRange,
  walkPosition,
  onChange,
  onToggleDual,
  onDualRangeChange,
}) => {
  const info = getParamInfo(paramKey);
  if (!info) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  
  // Long press detection for mobile (toggle dual mode)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const LONG_PRESS_DURATION = 400; // ms
  
  const handleLongPressStart = (_e: React.TouchEvent) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
      onToggleDual(paramKey);
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

  // Handle double click to toggle mode
  const handleDoubleClick = () => {
    onToggleDual(paramKey);
  };

  // Handle mouse/touch drag
  const handleDragStart = (thumb: 'min' | 'max') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(thumb);
  };

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

    return (
      <div style={styles.sliderGroup}>
        <div style={styles.sliderLabel}>
          <span>{label}</span>
          <span>
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
          style={styles.slider}
          title="Double-click or long-press for range mode"
        />
      </div>
    );
  }

  // Dual slider mode
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
    <div style={styles.sliderGroup}>
      <div style={styles.sliderLabel}>
        <span>
          {label}
          <span style={styles.dualModeIndicator}>⟷ range</span>
        </span>
        <span>
          {formatValue(dualRange?.min ?? info.min)} - {formatValue(dualRange?.max ?? info.max)}
          {unit || ''}
          <span style={{ color: '#fff', marginLeft: '8px' }}>
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
        title="Double-click or long-press for single value mode"
      >
        {/* Range track */}
        <div
          style={{
            ...styles.dualSliderTrack,
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
          }}
        />
        {/* Min thumb */}
        <div
          style={{
            ...styles.dualSliderThumb,
            left: `${minPercent}%`,
            background: dragging === 'min' ? '#fff' : '#a5c4d4',
          }}
          onMouseDown={handleDragStart('min')}
          onTouchStart={handleDragStart('min')}
        />
        {/* Max thumb */}
        <div
          style={{
            ...styles.dualSliderThumb,
            left: `${maxPercent}%`,
            background: dragging === 'max' ? '#fff' : '#a5c4d4',
          }}
          onMouseDown={handleDragStart('max')}
          onTouchStart={handleDragStart('max')}
        />
        {/* Random walk indicator */}
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
    <div style={styles.panel}>
      <h3
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
    return urlState || DEFAULT_STATE;
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
  type AdvancedTab = 'global' | 'synth' | 'drums' | 'fx';
  const [activeTab, setActiveTab] = useState<AdvancedTab>('global');

  // Dual slider state - tracks which sliders are in dual mode and their ranges
  const [dualSliderModes, setDualSliderModes] = useState<Set<keyof SliderState>>(new Set());
  const [dualSliderRanges, setDualSliderRanges] = useState<DualSliderState>({});
  const [randomWalkPositions, setRandomWalkPositions] = useState<Record<string, number>>({});
  const randomWalkRef = useRef<RandomWalkStates>({});

  // Lead expression trigger positions (0-1 within each range, updated on each note)
  const [leadExpressionPositions, setLeadExpressionPositions] = useState<{
    vibratoDepth: number;
    vibratoRate: number;
    glide: number;
  }>({ vibratoDepth: 0.5, vibratoRate: 0.5, glide: 0.5 });

  // Track which expression params are in dual (range) mode vs single mode
  const [expressionDualModes, setExpressionDualModes] = useState<{
    vibratoDepth: boolean;
    vibratoRate: boolean;
    glide: boolean;
  }>({ vibratoDepth: false, vibratoRate: false, glide: false });

  // Toggle expression dual mode
  const toggleExpressionDualMode = useCallback((param: 'vibratoDepth' | 'vibratoRate' | 'glide') => {
    setExpressionDualModes(prev => {
      const isDual = prev[param];
      if (isDual) {
        // Switching from dual to single - set min=max at the midpoint
        if (param === 'vibratoDepth') {
          const mid = (state.leadVibratoDepthMin + state.leadVibratoDepthMax) / 2;
          setState(s => ({ ...s, leadVibratoDepthMin: mid, leadVibratoDepthMax: mid }));
        } else if (param === 'vibratoRate') {
          const mid = (state.leadVibratoRateMin + state.leadVibratoRateMax) / 2;
          setState(s => ({ ...s, leadVibratoRateMin: mid, leadVibratoRateMax: mid }));
        } else {
          const mid = (state.leadGlideMin + state.leadGlideMax) / 2;
          setState(s => ({ ...s, leadGlideMin: mid, leadGlideMax: mid }));
        }
      }
      return { ...prev, [param]: !isDual };
    });
  }, [state.leadVibratoDepthMin, state.leadVibratoDepthMax, state.leadVibratoRateMin, state.leadVibratoRateMax, state.leadGlideMin, state.leadGlideMax]);

  // Track which delay params are in dual (range) mode vs single mode
  const [delayDualModes, setDelayDualModes] = useState<{
    time: boolean;
    feedback: boolean;
    mix: boolean;
  }>({ time: false, feedback: false, mix: false });

  // Track last triggered delay values for the indicator
  const [leadDelayPositions, setLeadDelayPositions] = useState<{
    time: number;
    feedback: number;
    mix: number;
  }>({ time: 0.5, feedback: 0.5, mix: 0.5 });

  // Toggle delay dual mode
  const toggleDelayDualMode = useCallback((param: 'time' | 'feedback' | 'mix') => {
    setDelayDualModes(prev => {
      const isDual = prev[param];
      if (isDual) {
        // Switching from dual to single - set min=max at the midpoint
        if (param === 'time') {
          const mid = (state.leadDelayTimeMin + state.leadDelayTimeMax) / 2;
          setState(s => ({ ...s, leadDelayTimeMin: mid, leadDelayTimeMax: mid }));
        } else if (param === 'feedback') {
          const mid = (state.leadDelayFeedbackMin + state.leadDelayFeedbackMax) / 2;
          setState(s => ({ ...s, leadDelayFeedbackMin: mid, leadDelayFeedbackMax: mid }));
        } else {
          const mid = (state.leadDelayMixMin + state.leadDelayMixMax) / 2;
          setState(s => ({ ...s, leadDelayMixMin: mid, leadDelayMixMax: mid }));
        }
      }
      return { ...prev, [param]: !isDual };
    });
  }, [state.leadDelayTimeMin, state.leadDelayTimeMax, state.leadDelayFeedbackMin, state.leadDelayFeedbackMax, state.leadDelayMixMin, state.leadDelayMixMax]);

  // Track which ocean params are in dual (range) mode vs single mode
  // Default to dual mode (blue range sliders)
  const [oceanDualModes, setOceanDualModes] = useState<{
    duration: boolean;
    interval: boolean;
    foam: boolean;
    depth: boolean;
  }>({ duration: true, interval: true, foam: true, depth: true });

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
  }>({ sub: 0.5, kick: 0.5, click: 0.5, beepHi: 0.5, beepLo: 0.5, noise: 0.5 });

  // Toggle ocean dual mode
  const toggleOceanDualMode = useCallback((param: 'duration' | 'interval' | 'foam' | 'depth') => {
    setOceanDualModes(prev => {
      const isDual = prev[param];
      if (isDual) {
        // Switching from dual to single - set min=max at the midpoint
        if (param === 'duration') {
          const mid = (state.oceanDurationMin + state.oceanDurationMax) / 2;
          setState(s => ({ ...s, oceanDurationMin: mid, oceanDurationMax: mid }));
        } else if (param === 'interval') {
          const mid = (state.oceanIntervalMin + state.oceanIntervalMax) / 2;
          setState(s => ({ ...s, oceanIntervalMin: mid, oceanIntervalMax: mid }));
        } else if (param === 'foam') {
          const mid = (state.oceanFoamMin + state.oceanFoamMax) / 2;
          setState(s => ({ ...s, oceanFoamMin: mid, oceanFoamMax: mid }));
        } else {
          const mid = (state.oceanDepthMin + state.oceanDepthMax) / 2;
          setState(s => ({ ...s, oceanDepthMin: mid, oceanDepthMax: mid }));
        }
      }
      return { ...prev, [param]: !isDual };
    });
  }, [state.oceanDurationMin, state.oceanDurationMax, state.oceanIntervalMin, state.oceanIntervalMax, state.oceanFoamMin, state.oceanFoamMax, state.oceanDepthMin, state.oceanDepthMax]);

  // Toggle dual slider mode for a parameter
  // Drum morph keys - these use per-trigger randomization, not random walk
  const drumMorphKeys = useMemo(() => new Set<keyof SliderState>([
    'drumSubMorph', 'drumKickMorph', 'drumClickMorph',
    'drumBeepHiMorph', 'drumBeepLoMorph', 'drumNoiseMorph'
  ]), []);

  // Map drum morph keys to voice names for engine API
  const drumMorphKeyToVoice = useMemo<Record<string, DrumPresetVoice>>(() => ({
    drumSubMorph: 'sub',
    drumKickMorph: 'kick',
    drumClickMorph: 'click',
    drumBeepHiMorph: 'beepHi',
    drumBeepLoMorph: 'beepLo',
    drumNoiseMorph: 'noise'
  }), []);

  const handleToggleDualMode = useCallback((key: keyof SliderState) => {
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
    }
    
    setDualSliderModes(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Switching from dual to single - use the current walk position value
        next.delete(key);
        const range = dualSliderRanges[key];
        const walkPos = randomWalkPositions[key] ?? 0.5;
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
        
        // Update morph preset dualRanges at endpoints (Rule 2)
        if (isMorphActive) {
          if (morphPosition === 0 && morphPresetA) {
            setMorphPresetA(prev => {
              if (!prev) return null;
              const newDualRanges = { ...prev.dualRanges };
              delete newDualRanges[keyStr];
              return {
                ...prev,
                dualRanges: Object.keys(newDualRanges).length > 0 ? newDualRanges : undefined
              };
            });
          } else if (morphPosition === 100 && morphPresetB) {
            setMorphPresetB(prev => {
              if (!prev) return null;
              const newDualRanges = { ...prev.dualRanges };
              delete newDualRanges[keyStr];
              return {
                ...prev,
                dualRanges: Object.keys(newDualRanges).length > 0 ? newDualRanges : undefined
              };
            });
          }
        }
        
        // Update drum morph dual range override at endpoints
        if (drumVoice && drumMorphKey) {
          const drumMorphPosition = state[drumMorphKey] as number;
          const currentVal = state[key] as number;
          // Use tolerance for endpoint detection
          const isAtEndpoint0 = drumMorphPosition < 0.001;
          const isAtEndpoint1 = drumMorphPosition > 0.999;
          if (isAtEndpoint0) {
            setDrumMorphDualRangeOverride(drumVoice, keyStr, false, currentVal, undefined, 0);
          } else if (isAtEndpoint1) {
            setDrumMorphDualRangeOverride(drumVoice, keyStr, false, currentVal, undefined, 1);
          }
        }
      } else {
        // Switching from single to dual - initialize range centered on current value
        next.add(key);
        const info = getParamInfo(key);
        if (info) {
          const currentVal = state[key] as number;
          const rangeSize = (info.max - info.min) * 0.2; // 20% of total range
          const min = Math.max(info.min, currentVal - rangeSize / 2);
          const max = Math.min(info.max, currentVal + rangeSize / 2);
          setDualSliderRanges(r => ({ ...r, [key]: { min, max } }));
          // Only initialize random walk for non-drum-morph keys
          // Drum morph keys use per-trigger randomization instead
          if (!drumMorphKeys.has(key)) {
            randomWalkRef.current[key] = {
              position: Math.random(),
              velocity: (Math.random() - 0.5) * 0.02,
            };
            setRandomWalkPositions(p => ({ ...p, [key]: randomWalkRef.current[key]!.position }));
          }
          
          // Update morph preset dualRanges at endpoints (Rule 2)
          if (isMorphActive) {
            if (morphPosition === 0 && morphPresetA) {
              setMorphPresetA(prev => prev ? {
                ...prev,
                dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } }
              } : null);
            } else if (morphPosition === 100 && morphPresetB) {
              setMorphPresetB(prev => prev ? {
                ...prev,
                dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } }
              } : null);
            }
          }
          
          // Update drum morph dual range override at endpoints
          if (drumVoice && drumMorphKey) {
            const drumMorphPosition = state[drumMorphKey] as number;
            const currentVal = state[key] as number;
            // Use tolerance for endpoint detection
            const isAtEndpoint0 = drumMorphPosition < 0.001;
            const isAtEndpoint1 = drumMorphPosition > 0.999;
            if (isAtEndpoint0) {
              setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 0);
            } else if (isAtEndpoint1) {
              setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 1);
            }
          }
        }
      }
      return next;
    });
  }, [isJourneyPlaying, dualSliderRanges, randomWalkPositions, state, drumMorphKeys, morphPosition, morphPresetA, morphPresetB]);

  // Update dual slider range
  const handleDualRangeChange = useCallback((key: keyof SliderState, min: number, max: number) => {
    // Block changes when journey mode is playing
    if (isJourneyPlaying) return;
    
    setDualSliderRanges(prev => ({ ...prev, [key]: { min, max } }));
    
    const keyStr = key as string;
    
    // Update morph preset dualRanges at endpoints (Rule 2)
    const isMorphActive = morphPresetA !== null || morphPresetB !== null;
    if (isMorphActive) {
      if (morphPosition === 0 && morphPresetA) {
        setMorphPresetA(prev => prev ? {
          ...prev,
          dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } }
        } : null);
      } else if (morphPosition === 100 && morphPresetB) {
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
    }
    
    // Update drum morph dual range override at endpoints
    if (drumVoice && drumMorphKey) {
      const drumMorphPosition = state[drumMorphKey] as number;
      const currentVal = state[key] as number;
      // Use tolerance for endpoint detection
      const isAtEndpoint0 = drumMorphPosition < 0.001;
      const isAtEndpoint1 = drumMorphPosition > 0.999;
      if (isAtEndpoint0) {
        setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 0);
      } else if (isAtEndpoint1) {
        setDrumMorphDualRangeOverride(drumVoice, keyStr, true, currentVal, { min, max }, 1);
      }
    }
  }, [isJourneyPlaying, morphPosition, morphPresetA, morphPresetB, state]);

  // Update engine morph ranges when dual mode changes for drum morph sliders
  useEffect(() => {
    if (!audioEngine.setDrumMorphRange) return;
    drumMorphKeys.forEach(key => {
      const voice = drumMorphKeyToVoice[key];
      if (!voice) return; // Guard against undefined
      if (dualSliderModes.has(key)) {
        const range = dualSliderRanges[key];
        if (range) {
          audioEngine.setDrumMorphRange(voice, range);
        }
      } else {
        audioEngine.setDrumMorphRange(voice, null);
      }
    });
  }, [dualSliderModes, dualSliderRanges, drumMorphKeys, drumMorphKeyToVoice]);

  // Random walk animation (excludes drum morph keys - they use per-trigger randomization)
  useEffect(() => {
    // Filter out drum morph keys - they use per-trigger random, not random walk
    const walkKeys = Array.from(dualSliderModes).filter(key => !drumMorphKeys.has(key));
    if (walkKeys.length === 0) return;

    const animate = () => {
      const speed = state.randomWalkSpeed;
      const updates: Record<string, number> = {};
      let hasUpdates = false;

      walkKeys.forEach(key => {
        const walk = randomWalkRef.current[key];
        const range = dualSliderRanges[key];
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
        
        // Update actual parameter values for the audio engine (only for walk keys, not drum morph)
        setState(prev => {
          const newState = { ...prev };
          walkKeys.forEach(key => {
            const range = dualSliderRanges[key];
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
  }, [dualSliderModes, dualSliderRanges, state.randomWalkSpeed, drumMorphKeys]);

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
          const newState = { ...DEFAULT_STATE, ...preset.data };
          setState(newState);
          audioEngine.updateParams(newState);
          audioEngine.resetCofDrift();
          console.log(`Loaded cloud preset: ${preset.name} by ${preset.author}`);
        }
      });
    }
  }, []);

  // Engine state callback
  useEffect(() => {
    audioEngine.setStateChangeCallback(setEngineState);
  }, []);

  // Lead expression trigger callback
  useEffect(() => {
    audioEngine.setLeadExpressionCallback(setLeadExpressionPositions);
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
        };
        const morphKey = voiceToMorphKey[voice];
        
        // Only update individual sliders if the option is enabled
        // Use a functional update to access the latest stateRef if needed, but here we use the functional update of setState
        if (morphKey) {
          setState(prev => {
            // Check if updates are enabled
            if (!prev.drumRandomMorphUpdate) return prev;

            // Convert normalized position (0-1) back to actual morph value using the range
            const range = dualSliderRanges[morphKey];
            const actualMorphValue = range 
              ? range.min + morphPosition * (range.max - range.min)
              : prev[morphKey] as number;
            
            // Create state with the random morph value
            const stateWithMorph = { ...prev, [morphKey]: actualMorphValue };
            
            // Apply morphed preset values to the sliders
            const morphedParams = applyMorphToState(stateWithMorph, voice as any);
            return { ...stateWithMorph, ...morphedParams };
          });
        }
      });
    }
  }, [dualSliderRanges]);

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

  // Update engine when state changes
  useEffect(() => {
    if (engineState.isRunning) {
      audioEngine.updateParams(state);
    }
  }, [state, engineState.isRunning]);

  // Handle slider change
  const handleSliderChange = useCallback((key: keyof SliderState, value: number | string) => {
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
      if (morphPosition === 0 && morphPresetA) {
        // At endpoint A: update preset A permanently (both numeric and string values)
        setMorphPresetA(prev => prev ? {
          ...prev,
          state: { ...prev.state, [key]: value }
        } : null);
      } else if (morphPosition === 100 && morphPresetB) {
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
          // Use tolerance for endpoint detection since sliders might not hit exactly 0 or 1
          const isAtEndpoint0 = morphValue < 0.001;
          const isAtEndpoint1 = morphValue > 0.999;
          
          if (isAtEndpoint0 || isAtEndpoint1) {
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
      beepHi: 'drumBeepHi', beepLo: 'drumBeepLo', noise: 'drumNoise',
    };
    
    // Map preset keys to their voice
    const presetVoiceMap: Record<string, DrumPresetVoice> = {
      drumSubPresetA: 'sub', drumSubPresetB: 'sub',
      drumKickPresetA: 'kick', drumKickPresetB: 'kick',
      drumClickPresetA: 'click', drumClickPresetB: 'click',
      drumBeepHiPresetA: 'beepHi', drumBeepHiPresetB: 'beepHi',
      drumBeepLoPresetA: 'beepLo', drumBeepLoPresetB: 'beepLo',
      drumNoisePresetA: 'noise', drumNoisePresetB: 'noise',
    };
    
    // Map voice to its morph key to get current position
    const voiceMorphKeys: Record<DrumPresetVoice, keyof SliderState> = {
      sub: 'drumSubMorph', kick: 'drumKickMorph', click: 'drumClickMorph',
      beepHi: 'drumBeepHiMorph', beepLo: 'drumBeepLoMorph', noise: 'drumNoiseMorph',
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
      const atEndpoint0 = currentMorph < 0.01;
      const atEndpoint1 = currentMorph > 0.99;
      
      // Reset dual modes only if:
      // - Preset A changed and we're at endpoint 0 (or mid-morph)
      // - Preset B changed and we're at endpoint 1 (or mid-morph)
      const shouldResetDualModes = (isPresetA && !atEndpoint1) || (!isPresetA && !atEndpoint0);
      
      if (shouldResetDualModes) {
        // Reset all dual modes for params starting with this prefix (excluding Morph/Preset keys)
        setDualSliderModes(prev => {
          const next = new Set(prev);
          for (const mode of prev) {
            const modeStr = mode as string;
            if (modeStr.startsWith(prefix) && !modeStr.includes('Morph') && !modeStr.includes('Preset')) {
              next.delete(mode);
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
      drumBeepHiMorph: 'beepHi', drumBeepLoMorph: 'beepLo', drumNoiseMorph: 'noise',
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
          setDualSliderModes(prev => new Set([...prev, paramKey]));
          setDualSliderRanges(prev => ({ ...prev, [paramKey]: interpState.range! }));
        } else {
          // Interpolated to single mode - disable dual
          setDualSliderModes(prev => {
            const next = new Set(prev);
            next.delete(paramKey);
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
    isDualMode: boolean;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    onToggleDual: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  } => {
    // For drum morph keys, use per-trigger positions instead of random walk
    let walkPos = randomWalkPositions[paramKey];
    if (drumMorphKeys.has(paramKey)) {
      const voice = drumMorphKeyToVoice[paramKey];
      if (voice) {
        walkPos = drumMorphPositions[voice];
      }
    }
    return {
      isDualMode: dualSliderModes.has(paramKey),
      dualRange: dualSliderRanges[paramKey],
      walkPosition: walkPos,
      onToggleDual: handleToggleDualMode,
      onDualRangeChange: handleDualRangeChange,
    };
  }, [dualSliderModes, dualSliderRanges, randomWalkPositions, drumMorphPositions, drumMorphKeys, drumMorphKeyToVoice, handleToggleDualMode, handleDualRangeChange]);

  // Handle select change
  const handleSelectChange = useCallback(<K extends keyof SliderState>(key: K, value: SliderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Start/Stop
  const handleStart = async () => {
    try {
      // Setup iOS media session FIRST (must be synchronous from user gesture)
      setupIOSMediaSession();
      
      // Then start the audio engine
      await audioEngine.start(state);
      
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
    dualSliderModes.forEach(key => {
      const range = dualSliderRanges[key];
      if (range) {
        dualRangesObj[key] = { min: range.min, max: range.max };
      }
    });
    
    const preset: SavedPreset = {
      name,
      timestamp: new Date().toISOString(),
      state,
      dualRanges: Object.keys(dualRangesObj).length > 0 ? dualRangesObj : undefined,
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
    dualModes: Set<keyof SliderState>;
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
    const stateA = { ...DEFAULT_STATE, ...presetA.state };
    const stateB = { ...DEFAULT_STATE, ...presetB.state };
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
    const resultDualRanges: DualSliderState = {};
    const resultDualModes = new Set<keyof SliderState>();
    
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
        resultDualModes.add(key);
        resultDualRanges[key] = { min: morphedMin, max: morphedMax };
      }
      // If not effectively dual, just use the interpolated state value (already computed)
    }
    
    // Define parent-child relationships for conditional morphing
    // If parent boolean is OFF in the target preset, don't morph child sliders
    const parentChildMap: Record<string, (keyof SliderState)[]> = {
      granularEnabled: [
        'granularLevel', 'granularReverbSend', 'grainProbability', 'grainSizeMin', 'grainSizeMax',
        'density', 'spray', 'jitter', 'pitchSpread', 'stereoSpread', 'feedback', 'wetHPF', 'wetLPF'
      ],
      leadEnabled: [
        'leadLevel', 'leadAttack', 'leadDecay', 'leadSustain', 'leadRelease',
        'leadDelayTimeMin', 'leadDelayTimeMax', 'leadDelayFeedbackMin', 'leadDelayFeedbackMax',
        'leadDelayMixMin', 'leadDelayMixMax', 'leadDensity',
        'leadOctave', 'leadOctaveRange', 'leadTimbreMin', 'leadTimbreMax',
        'leadVibratoDepthMin', 'leadVibratoDepthMax', 'leadVibratoRateMin', 'leadVibratoRateMax',
        'leadGlideMin', 'leadGlideMax', 'leadReverbSend', 'leadDelayReverbSend'
      ],
      leadEuclideanMasterEnabled: [
        'leadEuclideanTempo'
      ],
      oceanSampleEnabled: [
        'oceanSampleLevel', 'oceanFilterCutoff', 'oceanFilterResonance',
        'oceanDurationMin', 'oceanDurationMax', 'oceanIntervalMin', 'oceanIntervalMax',
        'oceanFoamMin', 'oceanFoamMax', 'oceanDepthMin', 'oceanDepthMax'
      ],
      oceanWaveSynthEnabled: [
        'oceanWaveSynthLevel'
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
      'reverbModulation', 'predelay', 'damping', 'width', 'grainProbability', 'grainSizeMin',
      'grainSizeMax', 'density', 'spray', 'jitter', 'pitchSpread', 'stereoSpread', 'feedback',
      'wetHPF', 'wetLPF', 'leadLevel', 'leadAttack', 'leadDecay', 'leadSustain', 'leadRelease',
      'leadDelayTimeMin', 'leadDelayTimeMax', 'leadDelayFeedbackMin', 'leadDelayFeedbackMax',
      'leadDelayMixMin', 'leadDelayMixMax', 'leadDensity', 'leadOctave',
      'leadOctaveRange', 'leadTimbreMin', 'leadTimbreMax',
      'leadVibratoDepthMin', 'leadVibratoDepthMax', 'leadVibratoRateMin', 'leadVibratoRateMax',
      'leadGlideMin', 'leadGlideMax', 'leadEuclideanTempo',
      'oceanSampleLevel', 'oceanWaveSynthLevel', 'oceanFilterCutoff', 'oceanFilterResonance',
      'oceanDurationMin', 'oceanDurationMax', 'oceanIntervalMin', 'oceanIntervalMax',
      'oceanFoamMin', 'oceanFoamMax', 'oceanDepthMin', 'oceanDepthMax',
      'cofDriftRate', 'cofDriftRange',
      // Drum morph positions - should interpolate when master morph changes
      'drumSubMorph', 'drumKickMorph', 'drumClickMorph',
      'drumBeepHiMorph', 'drumBeepLoMorph', 'drumNoiseMorph',
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
      'drumNoiseFilterType',
    ];
    for (const key of discreteKeys) {
      (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
    }
    
    // Snap boolean values at 50% (except cofDriftEnabled which has special handling)
    const boolKeys: (keyof SliderState)[] = [
      'granularEnabled', 'leadEnabled', 'leadEuclideanMasterEnabled', 'leadEuclid1Enabled', 'leadEuclid2Enabled',
      'leadEuclid3Enabled', 'leadEuclid4Enabled', 'oceanSampleEnabled', 'oceanWaveSynthEnabled',
      // Drum synth booleans
      'drumEnabled', 'drumRandomEnabled',
      'drumSubMorphAuto', 'drumKickMorphAuto', 'drumClickMorphAuto',
      'drumBeepHiMorphAuto', 'drumBeepLoMorphAuto', 'drumNoiseMorphAuto',
    ];
    for (const key of boolKeys) {
      (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
    }
    
    // Special handling for cofDriftEnabled:
    // - Off → On: Turn ON immediately when leaving the "off" preset (so CoF walk happens during morph)
    // - On → Off: Keep ON during entire morph (do CoF walk), only turn OFF when arriving at target
    const cofOnA = stateA.cofDriftEnabled;
    const cofOnB = stateB.cofDriftEnabled;
    const atEndpointA = t === 0;
    const atEndpointB = t === 100;
    
    if (cofOnA && cofOnB) {
      // Both on: stay on
      result.cofDriftEnabled = true;
    } else if (!cofOnA && !cofOnB) {
      // Both off: stay off
      result.cofDriftEnabled = false;
    } else if (!cofOnA && cofOnB) {
      // A is off, B is on: turn ON as soon as we leave A (t > 0)
      result.cofDriftEnabled = !atEndpointA;
    } else {
      // A is on, B is off: stay ON until we arrive at B (t < 100)
      result.cofDriftEnabled = !atEndpointB;
    }
    
    // Auto-disable granular if level is 0
    if (result.granularLevel === 0) {
      result.granularEnabled = false;
    }
    
    return { state: result, dualRanges: resultDualRanges, dualModes: resultDualModes, morphCoFInfo };
  }, []);

  // Store captured state for morph reference (when no preset is loaded)
  // This captures the state BEFORE any morph preset is loaded
  const morphCapturedStateRef = useRef<SliderState | null>(null);
  const morphCapturedDualRangesRef = useRef<Record<string, { min: number; max: number }> | null>(null);
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
    // Check for iOS-only settings and warn user
    const warnings = checkPresetCompatibility(preset);
    if (warnings.length > 0) {
      console.warn('[Preset Compatibility]', warnings);
      setTimeout(() => {
        alert(`⚠️ Preset Compatibility Notice:\n\n${warnings.join('\n')}`);
      }, 100);
    }
    
    // Normalize iOS-only settings
    const normalizedPreset: SavedPreset = {
      ...preset,
      state: normalizePresetForWeb(preset.state)
    };
    
    // Convert current dualSliderRanges to serializable format
    const currentDualRanges: Record<string, { min: number; max: number }> = {};
    dualSliderModes.forEach(key => {
      const range = dualSliderRanges[key];
      if (range) {
        currentDualRanges[key as string] = { min: range.min, max: range.max };
      }
    });
    
    if (slot === 'a') {
      setMorphPresetA(normalizedPreset);
      // When loading A, capture current state for B to use as fallback
      // But only if B is not already loaded
      if (!morphPresetB) {
        morphCapturedStateRef.current = { ...state };
        morphCapturedDualRangesRef.current = currentDualRanges;
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
        
        // Update ocean dual modes based on whether min !== max in the loaded state
        setOceanDualModes({
          duration: Math.abs(newState.oceanDurationMax - newState.oceanDurationMin) > 0.01,
          interval: Math.abs(newState.oceanIntervalMax - newState.oceanIntervalMin) > 0.01,
          foam: Math.abs(newState.oceanFoamMax - newState.oceanFoamMin) > 0.001,
          depth: Math.abs(newState.oceanDepthMax - newState.oceanDepthMin) > 0.001,
        });
        
        // Update expression dual modes based on whether min !== max in the loaded state
        setExpressionDualModes({
          vibratoDepth: Math.abs(newState.leadVibratoDepthMax - newState.leadVibratoDepthMin) > 0.001,
          vibratoRate: Math.abs(newState.leadVibratoRateMax - newState.leadVibratoRateMin) > 0.001,
          glide: Math.abs(newState.leadGlideMax - newState.leadGlideMin) > 0.001,
        });
        
        // Update delay dual modes based on whether min !== max in the loaded state
        setDelayDualModes({
          time: Math.abs(newState.leadDelayTimeMax - newState.leadDelayTimeMin) > 0.1,
          feedback: Math.abs(newState.leadDelayFeedbackMax - newState.leadDelayFeedbackMin) > 0.001,
          mix: Math.abs(newState.leadDelayMixMax - newState.leadDelayMixMin) > 0.001,
        });
        
        // Restore dual slider state if present
        if (normalizedPreset.dualRanges && Object.keys(normalizedPreset.dualRanges).length > 0) {
          const newDualModes = new Set<keyof SliderState>();
          const newDualRanges: DualSliderState = {};
          const newWalkPositions: Record<string, number> = {};
          
          Object.entries(normalizedPreset.dualRanges).forEach(([key, range]) => {
            const paramKey = key as keyof SliderState;
            newDualModes.add(paramKey);
            newDualRanges[paramKey] = range;
            const walkPos = Math.random();
            newWalkPositions[key] = walkPos;
            randomWalkRef.current[paramKey] = {
              position: walkPos,
              velocity: (Math.random() - 0.5) * 0.02,
            };
          });
          
          setDualSliderModes(newDualModes);
          setDualSliderRanges(newDualRanges);
          setRandomWalkPositions(newWalkPositions);
        } else {
          setDualSliderModes(new Set());
          setDualSliderRanges({});
          setRandomWalkPositions({});
          randomWalkRef.current = {};
        }
      }
      // If in mid-morph, the useEffect will handle applying the interpolated state
    } else {
      setMorphPresetB(normalizedPreset);
      // When loading B, capture current state for A to use as fallback
      // But only if A is not already loaded
      if (!morphPresetA) {
        morphCapturedStateRef.current = { ...state };
        morphCapturedDualRangesRef.current = currentDualRanges;
      }
    }
    setMorphLoadTarget(null);
  }, [state, morphPresetA, morphPresetB, dualSliderModes, dualSliderRanges]);

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
    const effectiveA: SavedPreset = morphPresetA || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges };
    const effectiveB: SavedPreset = morphPresetB || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges };
    
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
    
    // Apply interpolated dual ranges
    setDualSliderModes(morphResult.dualModes);
    setDualSliderRanges(morphResult.dualRanges);
    
  }, [morphPresetA, morphPresetB, morphPosition, lerpPresets, engineState.cofCurrentStep]);

  // Reapply drum morph interpolation when a drum preset changes while in mid-morph
  // This mirrors the main morph system's behavior
  const prevDrumPresetsRef = useRef<Record<string, string>>({});
  
  useEffect(() => {
    // Check each drum voice for preset changes
    const drumVoices: DrumPresetVoice[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
    const presetKeys: Record<DrumPresetVoice, { a: keyof SliderState; b: keyof SliderState; morph: keyof SliderState }> = {
      sub: { a: 'drumSubPresetA', b: 'drumSubPresetB', morph: 'drumSubMorph' },
      kick: { a: 'drumKickPresetA', b: 'drumKickPresetB', morph: 'drumKickMorph' },
      click: { a: 'drumClickPresetA', b: 'drumClickPresetB', morph: 'drumClickMorph' },
      beepHi: { a: 'drumBeepHiPresetA', b: 'drumBeepHiPresetB', morph: 'drumBeepHiMorph' },
      beepLo: { a: 'drumBeepLoPresetA', b: 'drumBeepLoPresetB', morph: 'drumBeepLoMorph' },
      noise: { a: 'drumNoisePresetA', b: 'drumNoisePresetB', morph: 'drumNoiseMorph' },
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
          setDualSliderModes(prev => new Set([...prev, paramKey]));
          setDualSliderRanges(prev => ({ ...prev, [paramKey]: interpState.range! }));
        } else {
          setDualSliderModes(prev => {
            const next = new Set(prev);
            next.delete(paramKey);
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
    const effectiveA: SavedPreset = morphPresetA || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges };
    const effectiveB: SavedPreset = morphPresetB || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges };
    
    if (morphPresetA && morphPresetB && morphPresetA.name === morphPresetB.name) return;
    
    // Detect morph direction and capture starting root when leaving an endpoint
    const wasAtA = lastMorphEndpointRef.current === 0;
    const wasAtB = lastMorphEndpointRef.current === 100;
    const leavingA = wasAtA && newPosition > 0;
    const leavingB = wasAtB && newPosition < 100;
    
    // Update endpoint tracking when reaching endpoints
    if (newPosition === 0) {
      lastMorphEndpointRef.current = 0;
      morphDirectionRef.current = null;
      morphCapturedStartRootRef.current = null;
    } else if (newPosition === 100) {
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
    const atEndpoint = newPosition === 0 || newPosition === 100;
    setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));
    
    // Reset CoF drift and clear manual overrides when reaching an endpoint
    if (atEndpoint) {
      audioEngine.resetCofDrift();
      morphManualOverridesRef.current = {};  // Clear temporary overrides
    }
    
    // Apply interpolated dual ranges
    setDualSliderModes(morphResult.dualModes);
    setDualSliderRanges(morphResult.dualRanges);
    
    // Initialize random walk for any new dual sliders and update positions state
    const newWalkPositions: Record<string, number> = {};
    morphResult.dualModes.forEach(key => {
      if (!randomWalkRef.current[key]) {
        const walkPos = Math.random();
        randomWalkRef.current[key] = {
          position: walkPos,
          velocity: (Math.random() - 0.5) * 0.02,
        };
      }
      // Always sync ref to state for all active dual sliders
      newWalkPositions[key as string] = randomWalkRef.current[key]?.position ?? 0.5;
    });
    setRandomWalkPositions(newWalkPositions);
    
    // Clean up refs for sliders that are no longer dual
    Object.keys(randomWalkRef.current).forEach(key => {
      if (!morphResult.dualModes.has(key as keyof SliderState)) {
        delete randomWalkRef.current[key as keyof SliderState];
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
    const effectiveA: SavedPreset = morphPresetA || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges };
    const effectiveB: SavedPreset = morphPresetB || { name: 'Current', timestamp: '', state: fallbackState, dualRanges: fallbackDualRanges };
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
          const atEndpoint = newPos === 0 || newPos === 100;
          setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));
          
          // Reset CoF drift when reaching an endpoint
          if (atEndpoint) {
            audioEngine.resetCofDrift();
          }
          
          // Apply interpolated dual ranges
          setDualSliderModes(morphResult.dualModes);
          setDualSliderRanges(morphResult.dualRanges);
          
          // Initialize random walk for any new dual sliders and update positions state
          const newWalkPositions: Record<string, number> = {};
          morphResult.dualModes.forEach(key => {
            if (!randomWalkRef.current[key]) {
              const walkPos = Math.random();
              randomWalkRef.current[key] = {
                position: walkPos,
                velocity: (Math.random() - 0.5) * 0.02,
              };
            }
            // Always sync ref to state for all active dual sliders
            newWalkPositions[key as string] = randomWalkRef.current[key]?.position ?? 0.5;
          });
          setRandomWalkPositions(newWalkPositions);
          
          // Clean up refs for sliders that are no longer dual
          Object.keys(randomWalkRef.current).forEach(key => {
            if (!morphResult.dualModes.has(key as keyof SliderState)) {
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
    dualSliderModes.forEach(key => {
      const range = dualSliderRanges[key];
      if (range) {
        currentDualRanges[key as string] = { min: range.min, max: range.max };
      }
    });
    morphCapturedDualRangesRef.current = currentDualRanges;
    
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
      const normalizedState = normalizePresetForWeb(preset.state);
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
      
      // Update ocean dual modes based on whether min !== max in the loaded state
      setOceanDualModes({
        duration: Math.abs(newState.oceanDurationMax - newState.oceanDurationMin) > 0.01,
        interval: Math.abs(newState.oceanIntervalMax - newState.oceanIntervalMin) > 0.01,
        foam: Math.abs(newState.oceanFoamMax - newState.oceanFoamMin) > 0.001,
        depth: Math.abs(newState.oceanDepthMax - newState.oceanDepthMin) > 0.001,
      });
      
      // Update expression dual modes based on whether min !== max in the loaded state
      setExpressionDualModes({
        vibratoDepth: Math.abs(newState.leadVibratoDepthMax - newState.leadVibratoDepthMin) > 0.001,
        vibratoRate: Math.abs(newState.leadVibratoRateMax - newState.leadVibratoRateMin) > 0.001,
        glide: Math.abs(newState.leadGlideMax - newState.leadGlideMin) > 0.001,
      });
      
      // Update delay dual modes based on whether min !== max in the loaded state
      setDelayDualModes({
        time: Math.abs(newState.leadDelayTimeMax - newState.leadDelayTimeMin) > 0.1,
        feedback: Math.abs(newState.leadDelayFeedbackMax - newState.leadDelayFeedbackMin) > 0.001,
        mix: Math.abs(newState.leadDelayMixMax - newState.leadDelayMixMin) > 0.001,
      });
      
      // Restore dual slider state if present
      if (preset.dualRanges && Object.keys(preset.dualRanges).length > 0) {
        const newDualModes = new Set<keyof SliderState>();
        const newDualRanges: DualSliderState = {};
        const newWalkPositions: Record<string, number> = {};
        
        Object.entries(preset.dualRanges).forEach(([key, range]) => {
          const paramKey = key as keyof SliderState;
          newDualModes.add(paramKey);
          newDualRanges[paramKey] = range;
          // Initialize random walk with random starting position
          const walkPos = Math.random();
          newWalkPositions[key] = walkPos;
          randomWalkRef.current[paramKey] = {
            position: walkPos,
            velocity: (Math.random() - 0.5) * 0.02,
          };
        });
        
        setDualSliderModes(newDualModes);
        setDualSliderRanges(newDualRanges);
        setRandomWalkPositions(newWalkPositions);
      } else {
        // No dual ranges in preset - reset to single mode
        setDualSliderModes(new Set());
        setDualSliderRanges({});
        setRandomWalkPositions({});
        randomWalkRef.current = {};
      }
    }
    // If in mid-morph, the useEffect will handle applying the interpolated state
    
    setShowPresetList(false);
  }, [uiMode, morphLoadTarget, handleLoadPresetToSlot, state, dualSliderModes, dualSliderRanges, morphPresetB, morphPosition]);

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
          // Merge with defaults to handle missing keys
          const newState = { ...DEFAULT_STATE, ...parsed.state };
          
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
            dualRanges: parsed.dualRanges,
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
            
            // Restore dual slider state if present
            if (parsed.dualRanges && Object.keys(parsed.dualRanges).length > 0) {
              const newDualModes = new Set<keyof SliderState>();
              const newDualRanges: DualSliderState = {};
              const newWalkPositions: Record<string, number> = {};
              
              Object.entries(parsed.dualRanges).forEach(([key, range]) => {
                const paramKey = key as keyof SliderState;
                newDualModes.add(paramKey);
                newDualRanges[paramKey] = range as { min: number; max: number };
                const walkPos = Math.random();
                newWalkPositions[key] = walkPos;
                randomWalkRef.current[paramKey] = {
                  position: walkPos,
                  velocity: (Math.random() - 0.5) * 0.02,
                };
              });
              
              setDualSliderModes(newDualModes);
              setDualSliderRanges(newDualRanges);
              setRandomWalkPositions(newWalkPositions);
            } else {
              // No dual ranges - reset to single mode
              setDualSliderModes(new Set());
              setDualSliderRanges({});
              setRandomWalkPositions({});
              randomWalkRef.current = {};
            }
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
    dualSliderModes.forEach(key => {
      const range = dualSliderRanges[key];
      if (range) {
        currentDualRanges[key as string] = { min: range.min, max: range.max };
      }
    });
    morphCapturedDualRangesRef.current = currentDualRanges;
    
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
      const atEndpoint = newPosition === 0 || newPosition === 100;
      setMorphCoFViz(atEndpoint ? null : (morphResult.morphCoFInfo || null));
      
      if (atEndpoint) {
        audioEngine.resetCofDrift();
      }
      
      // Apply interpolated dual ranges
      setDualSliderModes(morphResult.dualModes);
      setDualSliderRanges(morphResult.dualRanges);
      
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
            state={state}
            onChange={handleSliderChange}
            onShowAdvanced={() => setUiMode('advanced')}
            onShowJourney={() => setUiMode('journey')}
            onTogglePlay={(engineState.isRunning || isJourneyPlaying) ? handleStop : handleStart}
            onLoadPreset={handleLoadPresetFromList}
            presets={savedPresets}
            isPlaying={engineState.isRunning || isJourneyPlaying}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            onStopRecording={handleStopRecording}
          />
        </div>
      </>
    );
  }

  // Render advanced UI
  return (
    <div style={styles.container}>
      {/* Controls - centered */}
      <div style={{ ...styles.controls, paddingTop: '12px' }}>
        {!(engineState.isRunning || isJourneyPlaying) ? (
          <button
            style={{ ...styles.iconButton, ...styles.startButton }}
            onClick={handleStart}
            title="Start"
          >
            {TEXT_SYMBOLS.play}
          </button>
        ) : (
          <button
            style={{ ...styles.iconButton, ...styles.stopButton }}
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
          style={{ ...styles.iconButton, ...styles.presetButton }}
          onClick={handleSavePreset}
          title="Save Preset"
        >
          {TEXT_SYMBOLS.download}
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.presetButton }}
          onClick={() => fileInputRef.current?.click()}
          title="Import Preset"
        >
          {TEXT_SYMBOLS.upload}
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.simpleButton }}
          onClick={() => setUiMode('journey')}
          title="Journey Mode"
        >
          ⟡
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.simpleButton }}
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
        <div style={styles.presetListContainer}>
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
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'global' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('global')}
        >
          <span style={styles.tabIcon}>{TEXT_SYMBOLS.target}</span>
          <span>Global</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'synth' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('synth')}
        >
          <span style={styles.tabIcon}>∿</span>
          <span>Synth</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'drums' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('drums')}
        >
          <span style={styles.tabIcon}>⋮⋮</span>
          <span>Drums</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'fx' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('fx')}
        >
          <span style={styles.tabIcon}>◈</span>
          <span>FX</span>
        </button>
      </div>

      {/* Parameter Grid */}
      <div style={styles.grid}>
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
                    // Capture current state and dual ranges before loading
                    if (!morphPresetB) {
                      morphCapturedStateRef.current = { ...state };
                      const currentDualRanges: Record<string, { min: number; max: number }> = {};
                      dualSliderModes.forEach(key => {
                        const range = dualSliderRanges[key];
                        if (range) {
                          currentDualRanges[key as string] = { min: range.min, max: range.max };
                        }
                      });
                      morphCapturedDualRangesRef.current = currentDualRanges;
                    }
                    setMorphPresetA(preset);
                    
                    // Check if we should apply preset A values directly:
                    // - Only apply if we're at endpoint 0 (near position 0)
                    // - OR if no preset B is loaded yet (not in morph mode)
                    // At endpoint 1 (position ~100), we should keep the current B values
                    const atEndpoint0 = isAtEndpoint0(morphPosition, true);
                    const shouldApplyPresetA = atEndpoint0 || !morphPresetB;
                    
                    if (shouldApplyPresetA) {
                      // Apply the preset settings (with auto-disable for zero-level features)
                      const newState = { ...DEFAULT_STATE, ...preset.state };
                      if (newState.granularLevel === 0) {
                        newState.granularEnabled = false;
                      }
                      setState(newState);
                      audioEngine.updateParams(newState);
                      audioEngine.resetCofDrift(); // Reset CoF drift when loading preset
                      // Don't reset morph position - keep it where user had it
                      
                      // Restore dual slider state if present
                      if (preset.dualRanges && Object.keys(preset.dualRanges).length > 0) {
                        const newDualModes = new Set<keyof SliderState>();
                        const newDualRanges: DualSliderState = {};
                        const newWalkPositions: Record<string, number> = {};
                        
                        Object.entries(preset.dualRanges).forEach(([key, range]) => {
                          const paramKey = key as keyof SliderState;
                          newDualModes.add(paramKey);
                          newDualRanges[paramKey] = range;
                          const walkPos = Math.random();
                          newWalkPositions[key] = walkPos;
                          randomWalkRef.current[paramKey] = {
                            position: walkPos,
                            velocity: (Math.random() - 0.5) * 0.02,
                          };
                        });
                        
                        setDualSliderModes(newDualModes);
                        setDualSliderRanges(newDualRanges);
                        setRandomWalkPositions(newWalkPositions);
                      } else {
                        setDualSliderModes(new Set());
                        setDualSliderRanges({});
                        setRandomWalkPositions({});
                        randomWalkRef.current = {};
                      }
                    }
                    // If in mid-morph, the useEffect will handle applying the interpolated state
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: morphPresetA 
                  ? 'linear-gradient(135deg, #064e3b, #022c22)' 
                  : 'rgba(30, 30, 40, 0.8)',
                border: `1px solid ${morphPresetA ? '#10b981' : '#444'}`,
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: morphPresetA ? '#6ee7b7' : '#888',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236ee7b7'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
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
              {morphPosition === 0 ? 'Full A' : 
               morphPosition === 100 ? 'Full B' : 
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
                    // Capture current state and dual ranges before loading
                    if (!morphPresetA) {
                      morphCapturedStateRef.current = { ...state };
                      const currentDualRanges: Record<string, { min: number; max: number }> = {};
                      dualSliderModes.forEach(key => {
                        const range = dualSliderRanges[key];
                        if (range) {
                          currentDualRanges[key as string] = { min: range.min, max: range.max };
                        }
                      });
                      morphCapturedDualRangesRef.current = currentDualRanges;
                    }
                    setMorphPresetB(preset);
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: morphPresetB 
                  ? 'linear-gradient(135deg, #4c1d95, #2e1065)' 
                  : 'rgba(30, 30, 40, 0.8)',
                border: `1px solid ${morphPresetB ? '#8b5cf6' : '#444'}`,
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: morphPresetB ? '#c4b5fd' : '#888',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a78bfa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
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
            const newState = { ...DEFAULT_STATE, ...presetState };
            setState(newState);
            audioEngine.updateParams(newState);
            audioEngine.resetCofDrift();
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
            height: '120px',
            padding: '10px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            {/* Attack slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
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
            <div style={{ flex: 2, height: '100%', marginLeft: '8px' }}>
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
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
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
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
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
          
          {/* Grain Size Range */}
          <div style={{ marginTop: '8px', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '4px' }}>
              Grain Size Range: {state.grainSizeMin}ms - {state.grainSizeMax}ms
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Min Size"
                  value={state.grainSizeMin}
                  paramKey="grainSizeMin"
                  unit="ms"
                  onChange={handleSliderChange}
                  {...sliderProps('grainSizeMin')}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Max Size"
                  value={state.grainSizeMax}
                  paramKey="grainSizeMax"
                  unit="ms"
                  onChange={handleSliderChange}
                  {...sliderProps('grainSizeMax')}
                />
              </div>
            </div>
          </div>

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

        {/* === SYNTH + LEAD TAB (continued) === */}
        {activeTab === 'synth' && (<>
        {/* Lead Synth (Rhodes/Bell) */}
        <CollapsiblePanel
          id="lead"
          title="Lead Synth"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('lead')}
          onToggle={togglePanel}
        >
          {/* Enable toggle */}
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
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
            value={state.leadDensity}
            paramKey="leadDensity"
            unit="/phrase"
            onChange={handleSliderChange}
            {...sliderProps('leadDensity')}
          />

          <Slider
            label="Octave Offset"
            value={state.leadOctave}
            paramKey="leadOctave"
            onChange={handleSliderChange}
            {...sliderProps('leadOctave')}
          />

          <Slider
            label="Octave Range"
            value={state.leadOctaveRange}
            paramKey="leadOctaveRange"
            unit=" oct"
            onChange={handleSliderChange}
            {...sliderProps('leadOctaveRange')}
          />

          {/* Timbre Range (Rhodes to Bell) */}
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Timbre Range (per note)</span>
          </div>
          <div style={{
            padding: '12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Soft Rhodes</span>
              <span style={{ fontSize: '0.75rem', color: '#8b5cf6' }}>Gamelan</span>
            </div>
            
            {/* Visual range indicator */}
            <div style={{
              position: 'relative',
              height: '24px',
              background: 'linear-gradient(90deg, #f59e0b 0%, #8b5cf6 100%)',
              borderRadius: '12px',
              marginBottom: '12px',
              opacity: 0.3
            }}>
              {/* Active range overlay */}
              <div style={{
                position: 'absolute',
                left: `${state.leadTimbreMin * 100}%`,
                width: `${(state.leadTimbreMax - state.leadTimbreMin) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b, #8b5cf6)',
                borderRadius: '12px',
                opacity: 1,
                boxShadow: '0 0 10px rgba(139, 92, 246, 0.5)'
              }} />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Min Timbre"
                  value={state.leadTimbreMin}
                  paramKey="leadTimbreMin"
                  onChange={(key, value) => {
                    // Ensure min doesn't exceed max
                    const clampedValue = Math.min(value, state.leadTimbreMax);
                    handleSliderChange(key, clampedValue);
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Max Timbre"
                  value={state.leadTimbreMax}
                  paramKey="leadTimbreMax"
                  onChange={(key, value) => {
                    // Ensure max doesn't go below min
                    const clampedValue = Math.max(value, state.leadTimbreMin);
                    handleSliderChange(key, clampedValue);
                  }}
                />
              </div>
            </div>
            <div style={{ 
              fontSize: '0.7rem', 
              color: '#666', 
              textAlign: 'center',
              marginTop: '4px'
            }}>
              Each note picks a random timbre in this range
            </div>
          </div>

          {/* Lead ADSR */}
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Lead Envelope (ADSR)</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            height: '120px',
            padding: '10px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            {/* Attack slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                min="0.001"
                max="2"
                step="0.001"
                value={state.leadAttack}
                onChange={(e) => handleSliderChange('leadAttack', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#4a9eff' }}>A</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.leadAttack.toFixed(2)}s</span>
            </div>
            {/* Decay slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                min="0.01"
                max="4"
                step="0.01"
                value={state.leadDecay}
                onChange={(e) => handleSliderChange('leadDecay', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#9e4aff' }}>D</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.leadDecay.toFixed(1)}s</span>
            </div>
            {/* Sustain slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={state.leadSustain}
                onChange={(e) => handleSliderChange('leadSustain', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#4aff9e' }}>S</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{(state.leadSustain * 100).toFixed(0)}%</span>
            </div>
            {/* Hold slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                min="0"
                max="4"
                step="0.01"
                value={state.leadHold}
                onChange={(e) => handleSliderChange('leadHold', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#ffff4a' }}>H</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.leadHold.toFixed(1)}s</span>
            </div>
            {/* Release slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <input
                type="range"
                min="0.01"
                max="8"
                step="0.01"
                value={state.leadRelease}
                onChange={(e) => handleSliderChange('leadRelease', parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '80px',
                  width: '20px',
                  cursor: 'pointer',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: '0.7rem', marginTop: '4px', color: '#ff9e4a' }}>R</span>
              <span style={{ fontSize: '0.6rem', color: '#666' }}>{state.leadRelease.toFixed(1)}s</span>
            </div>
            {/* Visual ADSR curve preview */}
            <div style={{ flex: 2, height: '100%', marginLeft: '8px' }}>
              <svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="none">
                {(() => {
                  const totalTime = state.leadAttack + state.leadDecay + state.leadHold + state.leadRelease;
                  const aEnd = (state.leadAttack / totalTime) * 100;
                  const dEnd = ((state.leadAttack + state.leadDecay) / totalTime) * 100;
                  const sEnd = ((state.leadAttack + state.leadDecay + state.leadHold) / totalTime) * 100;
                  const sustainY = (1 - state.leadSustain) * 80;
                  return (
                    <>
                      <path
                        d={`M 0 80 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 80`}
                        fill="none"
                        stroke="rgba(255, 180, 100, 0.8)"
                        strokeWidth="2"
                      />
                      <path
                        d={`M 0 80 L ${aEnd} 0 L ${dEnd} ${sustainY} L ${sEnd} ${sustainY} L 100 80 Z`}
                        fill="rgba(255, 180, 100, 0.15)"
                      />
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>

          {/* Expression Section - per-note random ranges with trigger indicator */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '12px' }}>Expression (per note)</div>
            
            {/* Vibrato Depth */}
            {expressionDualModes.vibratoDepth ? (
              // Dual mode - range slider
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>
                    Vibrato Depth
                    <span style={styles.dualModeIndicator}>⟷ range</span>
                  </span>
                  <span>
                    {(state.leadVibratoDepthMin * 0.5).toFixed(2)} - {(state.leadVibratoDepthMax * 0.5).toFixed(2)} st
                    <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                      ({((state.leadVibratoDepthMin + leadExpressionPositions.vibratoDepth * (state.leadVibratoDepthMax - state.leadVibratoDepthMin)) * 0.5).toFixed(2)})
                    </span>
                  </span>
                </div>
                <div 
                  style={styles.dualSliderContainer}
                  onDoubleClick={() => toggleExpressionDualMode('vibratoDepth')}
                  title="Double-click for single value mode"
                >
                  <div style={{
                    ...styles.dualSliderTrack,
                    left: `${state.leadVibratoDepthMin * 100}%`,
                    width: `${(state.leadVibratoDepthMax - state.leadVibratoDepthMin) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.6), rgba(217, 119, 6, 0.6))',
                  }} />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadVibratoDepthMin * 100}%`, background: '#f59e0b' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadVibratoDepthMin', Math.min(pct / 100, state.leadVibratoDepthMax));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadVibratoDepthMax * 100}%`, background: '#f59e0b' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadVibratoDepthMax', Math.max(pct / 100, state.leadVibratoDepthMin));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div style={{
                    ...styles.dualSliderWalkIndicator,
                    left: `${(state.leadVibratoDepthMin + leadExpressionPositions.vibratoDepth * (state.leadVibratoDepthMax - state.leadVibratoDepthMin)) * 100}%`,
                    background: '#f59e0b',
                    boxShadow: '0 0 8px rgba(245, 158, 11, 0.8)',
                  }} />
                </div>
              </div>
            ) : (
              // Single mode - regular slider
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>Vibrato Depth</span>
                  <span>{(state.leadVibratoDepthMin * 0.5).toFixed(2)} st</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.leadVibratoDepthMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleSliderChange('leadVibratoDepthMin', v);
                    handleSliderChange('leadVibratoDepthMax', v);
                  }}
                  onDoubleClick={() => toggleExpressionDualMode('vibratoDepth')}
                  style={styles.slider}
                  title="Double-click for range mode"
                />
              </div>
            )}

            {/* Vibrato Rate */}
            {expressionDualModes.vibratoRate ? (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>
                    Vibrato Rate
                    <span style={styles.dualModeIndicator}>⟷ range</span>
                  </span>
                  <span>
                    {(2 + state.leadVibratoRateMin * 6).toFixed(1)} - {(2 + state.leadVibratoRateMax * 6).toFixed(1)} Hz
                    <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                      ({(2 + (state.leadVibratoRateMin + leadExpressionPositions.vibratoRate * (state.leadVibratoRateMax - state.leadVibratoRateMin)) * 6).toFixed(1)})
                    </span>
                  </span>
                </div>
                <div 
                  style={styles.dualSliderContainer}
                  onDoubleClick={() => toggleExpressionDualMode('vibratoRate')}
                  title="Double-click for single value mode"
                >
                  <div style={{
                    ...styles.dualSliderTrack,
                    left: `${state.leadVibratoRateMin * 100}%`,
                    width: `${(state.leadVibratoRateMax - state.leadVibratoRateMin) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.6), rgba(217, 119, 6, 0.6))',
                  }} />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadVibratoRateMin * 100}%`, background: '#f59e0b' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadVibratoRateMin', Math.min(pct / 100, state.leadVibratoRateMax));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadVibratoRateMax * 100}%`, background: '#f59e0b' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadVibratoRateMax', Math.max(pct / 100, state.leadVibratoRateMin));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div style={{
                    ...styles.dualSliderWalkIndicator,
                    left: `${(state.leadVibratoRateMin + leadExpressionPositions.vibratoRate * (state.leadVibratoRateMax - state.leadVibratoRateMin)) * 100}%`,
                    background: '#f59e0b',
                    boxShadow: '0 0 8px rgba(245, 158, 11, 0.8)',
                  }} />
                </div>
              </div>
            ) : (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>Vibrato Rate</span>
                  <span>{(2 + state.leadVibratoRateMin * 6).toFixed(1)} Hz</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.leadVibratoRateMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleSliderChange('leadVibratoRateMin', v);
                    handleSliderChange('leadVibratoRateMax', v);
                  }}
                  onDoubleClick={() => toggleExpressionDualMode('vibratoRate')}
                  style={styles.slider}
                  title="Double-click for range mode"
                />
              </div>
            )}

            {/* Glide */}
            {expressionDualModes.glide ? (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>
                    Glide (Portamento)
                    <span style={styles.dualModeIndicator}>⟷ range</span>
                  </span>
                  <span>
                    {(state.leadGlideMin * 100).toFixed(0)} - {(state.leadGlideMax * 100).toFixed(0)}%
                    <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                      ({((state.leadGlideMin + leadExpressionPositions.glide * (state.leadGlideMax - state.leadGlideMin)) * 100).toFixed(0)})
                    </span>
                  </span>
                </div>
                <div 
                  style={styles.dualSliderContainer}
                  onDoubleClick={() => toggleExpressionDualMode('glide')}
                  title="Double-click for single value mode"
                >
                  <div style={{
                    ...styles.dualSliderTrack,
                    left: `${state.leadGlideMin * 100}%`,
                    width: `${(state.leadGlideMax - state.leadGlideMin) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.6), rgba(217, 119, 6, 0.6))',
                  }} />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadGlideMin * 100}%`, background: '#f59e0b' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadGlideMin', Math.min(pct / 100, state.leadGlideMax));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadGlideMax * 100}%`, background: '#f59e0b' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadGlideMax', Math.max(pct / 100, state.leadGlideMin));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div style={{
                    ...styles.dualSliderWalkIndicator,
                    left: `${(state.leadGlideMin + leadExpressionPositions.glide * (state.leadGlideMax - state.leadGlideMin)) * 100}%`,
                    background: '#f59e0b',
                    boxShadow: '0 0 8px rgba(245, 158, 11, 0.8)',
                  }} />
                </div>
              </div>
            ) : (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>Glide (Portamento)</span>
                  <span>{(state.leadGlideMin * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.leadGlideMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleSliderChange('leadGlideMin', v);
                    handleSliderChange('leadGlideMax', v);
                  }}
                  onDoubleClick={() => toggleExpressionDualMode('glide')}
                  style={styles.slider}
                  title="Double-click for range mode"
                />
              </div>
            )}

            <div style={{ 
              fontSize: '0.7rem', 
              color: '#666', 
              textAlign: 'center',
              marginTop: '8px'
            }}>
              {(expressionDualModes.vibratoDepth || expressionDualModes.vibratoRate || expressionDualModes.glide) 
                ? 'Each note picks random value • Double-click to toggle range mode' 
                : 'Double-click slider for range mode'}
            </div>
          </div>

          {/* Delay Section - per-note random ranges with trigger indicator */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '12px' }}>Delay Effect (per note)</div>
            
            {/* Delay Time */}
            {delayDualModes.time ? (
              // Dual mode - range slider
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>
                    Delay Time
                    <span style={styles.dualModeIndicator}>⟷ range</span>
                  </span>
                  <span>
                    {state.leadDelayTimeMin.toFixed(0)} - {state.leadDelayTimeMax.toFixed(0)} ms
                    <span style={{ color: '#8b5cf6', marginLeft: '8px' }}>
                      ({(state.leadDelayTimeMin + leadDelayPositions.time * (state.leadDelayTimeMax - state.leadDelayTimeMin)).toFixed(0)})
                    </span>
                  </span>
                </div>
                <div 
                  style={styles.dualSliderContainer}
                  onDoubleClick={() => toggleDelayDualMode('time')}
                  title="Double-click for single value mode"
                >
                  <div style={{
                    ...styles.dualSliderTrack,
                    left: `${(state.leadDelayTimeMin / 1000) * 100}%`,
                    width: `${((state.leadDelayTimeMax - state.leadDelayTimeMin) / 1000) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.6), rgba(124, 58, 237, 0.6))',
                  }} />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${(state.leadDelayTimeMin / 1000) * 100}%`, background: '#8b5cf6' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadDelayTimeMin', Math.min(pct * 10, state.leadDelayTimeMax));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${(state.leadDelayTimeMax / 1000) * 100}%`, background: '#8b5cf6' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadDelayTimeMax', Math.max(pct * 10, state.leadDelayTimeMin));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div style={{
                    ...styles.dualSliderWalkIndicator,
                    left: `${((state.leadDelayTimeMin + leadDelayPositions.time * (state.leadDelayTimeMax - state.leadDelayTimeMin)) / 1000) * 100}%`,
                    background: '#8b5cf6',
                    boxShadow: '0 0 8px rgba(139, 92, 246, 0.8)',
                  }} />
                </div>
              </div>
            ) : (
              // Single mode - regular slider
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>Delay Time</span>
                  <span>{state.leadDelayTimeMin.toFixed(0)} ms</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={10}
                  value={state.leadDelayTimeMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleSliderChange('leadDelayTimeMin', v);
                    handleSliderChange('leadDelayTimeMax', v);
                  }}
                  onDoubleClick={() => toggleDelayDualMode('time')}
                  style={styles.slider}
                  title="Double-click for range mode"
                />
              </div>
            )}

            {/* Delay Feedback */}
            {delayDualModes.feedback ? (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>
                    Delay Feedback
                    <span style={styles.dualModeIndicator}>⟷ range</span>
                  </span>
                  <span>
                    {(state.leadDelayFeedbackMin * 100).toFixed(0)} - {(state.leadDelayFeedbackMax * 100).toFixed(0)}%
                    <span style={{ color: '#a855f7', marginLeft: '8px' }}>
                      ({((state.leadDelayFeedbackMin + leadDelayPositions.feedback * (state.leadDelayFeedbackMax - state.leadDelayFeedbackMin)) * 100).toFixed(0)})
                    </span>
                  </span>
                </div>
                <div 
                  style={styles.dualSliderContainer}
                  onDoubleClick={() => toggleDelayDualMode('feedback')}
                  title="Double-click for single value mode"
                >
                  <div style={{
                    ...styles.dualSliderTrack,
                    left: `${(state.leadDelayFeedbackMin / 0.8) * 100}%`,
                    width: `${((state.leadDelayFeedbackMax - state.leadDelayFeedbackMin) / 0.8) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.6), rgba(147, 51, 234, 0.6))',
                  }} />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${(state.leadDelayFeedbackMin / 0.8) * 100}%`, background: '#a855f7' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadDelayFeedbackMin', Math.min((pct / 100) * 0.8, state.leadDelayFeedbackMax));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${(state.leadDelayFeedbackMax / 0.8) * 100}%`, background: '#a855f7' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadDelayFeedbackMax', Math.max((pct / 100) * 0.8, state.leadDelayFeedbackMin));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div style={{
                    ...styles.dualSliderWalkIndicator,
                    left: `${((state.leadDelayFeedbackMin + leadDelayPositions.feedback * (state.leadDelayFeedbackMax - state.leadDelayFeedbackMin)) / 0.8) * 100}%`,
                    background: '#a855f7',
                    boxShadow: '0 0 8px rgba(168, 85, 247, 0.8)',
                  }} />
                </div>
              </div>
            ) : (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>Delay Feedback</span>
                  <span>{(state.leadDelayFeedbackMin * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.01}
                  value={state.leadDelayFeedbackMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleSliderChange('leadDelayFeedbackMin', v);
                    handleSliderChange('leadDelayFeedbackMax', v);
                  }}
                  onDoubleClick={() => toggleDelayDualMode('feedback')}
                  style={styles.slider}
                  title="Double-click for range mode"
                />
              </div>
            )}

            {/* Delay Mix */}
            {delayDualModes.mix ? (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>
                    Delay Mix
                    <span style={styles.dualModeIndicator}>⟷ range</span>
                  </span>
                  <span>
                    {(state.leadDelayMixMin * 100).toFixed(0)} - {(state.leadDelayMixMax * 100).toFixed(0)}%
                    <span style={{ color: '#c084fc', marginLeft: '8px' }}>
                      ({((state.leadDelayMixMin + leadDelayPositions.mix * (state.leadDelayMixMax - state.leadDelayMixMin)) * 100).toFixed(0)})
                    </span>
                  </span>
                </div>
                <div 
                  style={styles.dualSliderContainer}
                  onDoubleClick={() => toggleDelayDualMode('mix')}
                  title="Double-click for single value mode"
                >
                  <div style={{
                    ...styles.dualSliderTrack,
                    left: `${state.leadDelayMixMin * 100}%`,
                    width: `${(state.leadDelayMixMax - state.leadDelayMixMin) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(192, 132, 252, 0.6), rgba(168, 85, 247, 0.6))',
                  }} />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadDelayMixMin * 100}%`, background: '#c084fc' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadDelayMixMin', Math.min(pct / 100, state.leadDelayMixMax));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div
                    style={{ ...styles.dualSliderThumb, left: `${state.leadDelayMixMax * 100}%`, background: '#c084fc' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      const move = (me: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                        handleSliderChange('leadDelayMixMax', Math.max(pct / 100, state.leadDelayMixMin));
                      };
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                  <div style={{
                    ...styles.dualSliderWalkIndicator,
                    left: `${(state.leadDelayMixMin + leadDelayPositions.mix * (state.leadDelayMixMax - state.leadDelayMixMin)) * 100}%`,
                    background: '#c084fc',
                    boxShadow: '0 0 8px rgba(192, 132, 252, 0.8)',
                  }} />
                </div>
              </div>
            ) : (
              <div style={styles.sliderGroup}>
                <div style={styles.sliderLabel}>
                  <span>Delay Mix</span>
                  <span>{(state.leadDelayMixMin * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.leadDelayMixMin}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleSliderChange('leadDelayMixMin', v);
                    handleSliderChange('leadDelayMixMax', v);
                  }}
                  onDoubleClick={() => toggleDelayDualMode('mix')}
                  style={styles.slider}
                  title="Double-click for range mode"
                />
              </div>
            )}

            <div style={{ 
              fontSize: '0.7rem', 
              color: '#666', 
              textAlign: 'center',
              marginTop: '8px'
            }}>
              {(delayDualModes.time || delayDualModes.feedback || delayDualModes.mix) 
                ? 'Each note picks random value • Double-click to toggle range mode' 
                : 'Double-click slider for range mode'}
            </div>
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
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
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
            const presetData: Record<string, { steps: number; hits: number; rotation: number }> = {
              // Polyrhythmic / Complex
              sparse: { steps: 16, hits: 1, rotation: 0 },
              dense: { steps: 8, hits: 7, rotation: 0 },
              longSparse: { steps: 32, hits: 3, rotation: 0 },
              poly3v4: { steps: 12, hits: 3, rotation: 0 },
              poly4v3: { steps: 12, hits: 4, rotation: 0 },
              poly5v3: { steps: 15, hits: 5, rotation: 0 },
              poly5v4: { steps: 20, hits: 5, rotation: 0 },
              poly7v4: { steps: 28, hits: 7, rotation: 0 },
              poly5v7: { steps: 35, hits: 5, rotation: 0 },
              prime17: { steps: 17, hits: 7, rotation: 0 },
              prime19: { steps: 19, hits: 7, rotation: 0 },
              prime23: { steps: 23, hits: 9, rotation: 0 },
              // Indonesian Gamelan
              lancaran: { steps: 16, hits: 4, rotation: 0 },
              ketawang: { steps: 16, hits: 2, rotation: 0 },
              ladrang: { steps: 32, hits: 8, rotation: 0 },
              gangsaran: { steps: 8, hits: 4, rotation: 0 },
              kotekan: { steps: 8, hits: 3, rotation: 1 },
              kotekan2: { steps: 8, hits: 3, rotation: 4 },
              srepegan: { steps: 16, hits: 6, rotation: 2 },
              sampak: { steps: 8, hits: 5, rotation: 0 },
              ayak: { steps: 16, hits: 3, rotation: 4 },
              bonang: { steps: 12, hits: 5, rotation: 2 },
              // World Rhythms
              tresillo: { steps: 8, hits: 3, rotation: 0 },
              cinquillo: { steps: 8, hits: 5, rotation: 0 },
              rumba: { steps: 16, hits: 5, rotation: 0 },
              bossa: { steps: 16, hits: 5, rotation: 3 },
              son: { steps: 16, hits: 7, rotation: 0 },
              shiko: { steps: 16, hits: 5, rotation: 0 },
              soukous: { steps: 12, hits: 7, rotation: 0 },
              gahu: { steps: 16, hits: 7, rotation: 0 },
              bembe: { steps: 12, hits: 7, rotation: 0 },
              aksak9: { steps: 9, hits: 5, rotation: 0 },
              aksak7: { steps: 7, hits: 3, rotation: 0 },
              clave23: { steps: 8, hits: 2, rotation: 0 },
              clave32: { steps: 8, hits: 3, rotation: 0 },
                    // Steve Reich / Experimental
                    clapping: { steps: 12, hits: 8, rotation: 0 },
                    clappingB: { steps: 12, hits: 8, rotation: 5 },
                    additive7: { steps: 7, hits: 4, rotation: 0 },
                    additive11: { steps: 11, hits: 5, rotation: 0 },
                    additive13: { steps: 13, hits: 5, rotation: 0 },
                    reich18: { steps: 12, hits: 7, rotation: 3 },
                    drumming: { steps: 8, hits: 6, rotation: 1 },
                  };
                  
                  const patternSteps = preset === 'custom' ? steps : (presetData[preset]?.steps || 16);
                  const patternHits = preset === 'custom' ? hits : (presetData[preset]?.hits || 4);
                  // User rotation is always applied (additive to preset's base rotation for presets)
                  const baseRotation = preset === 'custom' ? 0 : (presetData[preset]?.rotation || 0);
                  const patternRotation = (baseRotation + rotation) % patternSteps;

                  // Bjorklund's algorithm
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
                                  color: source === 'lead' ? '#D4A520' : '#C4724E',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem',
                                }}
                              >
                                <option value="lead">Lead</option>
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
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
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
          <div style={{ marginTop: '16px', ...styles.sliderGroup }}>
            <div style={styles.sliderLabel}>
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
              
              {/* Duration - dual slider */}
              {oceanDualModes.duration ? (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>
                      Duration
                      <span style={styles.dualModeIndicator}>⟷ range</span>
                    </span>
                    <span>
                      {state.oceanDurationMin.toFixed(1)} - {state.oceanDurationMax.toFixed(1)} s
                      <span style={{ color: '#3b82f6', marginLeft: '8px' }}>
                        ({(state.oceanDurationMin + oceanPositions.duration * (state.oceanDurationMax - state.oceanDurationMin)).toFixed(1)})
                      </span>
                    </span>
                  </div>
                  <div 
                    style={styles.dualSliderContainer}
                    onDoubleClick={() => toggleOceanDualMode('duration')}
                    title="Double-click for single value mode"
                  >
                    <div style={{
                      ...styles.dualSliderTrack,
                      left: `${((state.oceanDurationMin - 2) / 13) * 100}%`,
                      width: `${((state.oceanDurationMax - state.oceanDurationMin) / 13) * 100}%`,
                      background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.6))',
                    }} />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${((state.oceanDurationMin - 2) / 13) * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          const val = 2 + pct * 13;
                          handleSliderChange('oceanDurationMin', Math.min(val, state.oceanDurationMax));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${((state.oceanDurationMax - 2) / 13) * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          const val = 2 + pct * 13;
                          handleSliderChange('oceanDurationMax', Math.max(val, state.oceanDurationMin));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div style={{
                      ...styles.dualSliderWalkIndicator,
                      left: `${((state.oceanDurationMin + oceanPositions.duration * (state.oceanDurationMax - state.oceanDurationMin) - 2) / 13) * 100}%`,
                      background: '#3b82f6',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
                    }} />
                  </div>
                </div>
              ) : (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>Duration</span>
                    <span>{state.oceanDurationMin.toFixed(1)} s</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    step={0.5}
                    value={state.oceanDurationMin}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleSliderChange('oceanDurationMin', v);
                      handleSliderChange('oceanDurationMax', v);
                    }}
                    onDoubleClick={() => toggleOceanDualMode('duration')}
                    style={styles.slider}
                    title="Double-click for range mode"
                  />
                </div>
              )}

              {/* Interval - dual slider */}
              {oceanDualModes.interval ? (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>
                      Interval
                      <span style={styles.dualModeIndicator}>⟷ range</span>
                    </span>
                    <span>
                      {state.oceanIntervalMin.toFixed(1)} - {state.oceanIntervalMax.toFixed(1)} s
                      <span style={{ color: '#3b82f6', marginLeft: '8px' }}>
                        ({(state.oceanIntervalMin + oceanPositions.interval * (state.oceanIntervalMax - state.oceanIntervalMin)).toFixed(1)})
                      </span>
                    </span>
                  </div>
                  <div 
                    style={styles.dualSliderContainer}
                    onDoubleClick={() => toggleOceanDualMode('interval')}
                    title="Double-click for single value mode"
                  >
                    <div style={{
                      ...styles.dualSliderTrack,
                      left: `${((state.oceanIntervalMin - 3) / 17) * 100}%`,
                      width: `${((state.oceanIntervalMax - state.oceanIntervalMin) / 17) * 100}%`,
                      background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.6))',
                    }} />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${((state.oceanIntervalMin - 3) / 17) * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          const val = 3 + pct * 17;
                          handleSliderChange('oceanIntervalMin', Math.min(val, state.oceanIntervalMax));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${((state.oceanIntervalMax - 3) / 17) * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          const val = 3 + pct * 17;
                          handleSliderChange('oceanIntervalMax', Math.max(val, state.oceanIntervalMin));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div style={{
                      ...styles.dualSliderWalkIndicator,
                      left: `${((state.oceanIntervalMin + oceanPositions.interval * (state.oceanIntervalMax - state.oceanIntervalMin) - 3) / 17) * 100}%`,
                      background: '#3b82f6',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
                    }} />
                  </div>
                </div>
              ) : (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>Interval</span>
                    <span>{state.oceanIntervalMin.toFixed(1)} s</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={0.5}
                    value={state.oceanIntervalMin}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleSliderChange('oceanIntervalMin', v);
                      handleSliderChange('oceanIntervalMax', v);
                    }}
                    onDoubleClick={() => toggleOceanDualMode('interval')}
                    style={styles.slider}
                    title="Double-click for range mode"
                  />
                </div>
              )}

              {/* Wave Character */}
              <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Wave Character</span>
              </div>

              {/* Foam - dual slider */}
              {oceanDualModes.foam ? (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>
                      Foam
                      <span style={styles.dualModeIndicator}>⟷ range</span>
                    </span>
                    <span>
                      {(state.oceanFoamMin * 100).toFixed(0)} - {(state.oceanFoamMax * 100).toFixed(0)}%
                      <span style={{ color: '#3b82f6', marginLeft: '8px' }}>
                        ({((state.oceanFoamMin + oceanPositions.foam * (state.oceanFoamMax - state.oceanFoamMin)) * 100).toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div 
                    style={styles.dualSliderContainer}
                    onDoubleClick={() => toggleOceanDualMode('foam')}
                    title="Double-click for single value mode"
                  >
                    <div style={{
                      ...styles.dualSliderTrack,
                      left: `${state.oceanFoamMin * 100}%`,
                      width: `${(state.oceanFoamMax - state.oceanFoamMin) * 100}%`,
                      background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.6))',
                    }} />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${state.oceanFoamMin * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          handleSliderChange('oceanFoamMin', Math.min(pct, state.oceanFoamMax));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${state.oceanFoamMax * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          handleSliderChange('oceanFoamMax', Math.max(pct, state.oceanFoamMin));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div style={{
                      ...styles.dualSliderWalkIndicator,
                      left: `${(state.oceanFoamMin + oceanPositions.foam * (state.oceanFoamMax - state.oceanFoamMin)) * 100}%`,
                      background: '#3b82f6',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
                    }} />
                  </div>
                </div>
              ) : (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>Foam</span>
                    <span>{(state.oceanFoamMin * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.oceanFoamMin}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleSliderChange('oceanFoamMin', v);
                      handleSliderChange('oceanFoamMax', v);
                    }}
                    onDoubleClick={() => toggleOceanDualMode('foam')}
                    style={styles.slider}
                    title="Double-click for range mode"
                  />
                </div>
              )}

              {/* Depth - dual slider */}
              {oceanDualModes.depth ? (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>
                      Depth
                      <span style={styles.dualModeIndicator}>⟷ range</span>
                    </span>
                    <span>
                      {(state.oceanDepthMin * 100).toFixed(0)} - {(state.oceanDepthMax * 100).toFixed(0)}%
                      <span style={{ color: '#3b82f6', marginLeft: '8px' }}>
                        ({((state.oceanDepthMin + oceanPositions.depth * (state.oceanDepthMax - state.oceanDepthMin)) * 100).toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div 
                    style={styles.dualSliderContainer}
                    onDoubleClick={() => toggleOceanDualMode('depth')}
                    title="Double-click for single value mode"
                  >
                    <div style={{
                      ...styles.dualSliderTrack,
                      left: `${state.oceanDepthMin * 100}%`,
                      width: `${(state.oceanDepthMax - state.oceanDepthMin) * 100}%`,
                      background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.6))',
                    }} />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${state.oceanDepthMin * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          handleSliderChange('oceanDepthMin', Math.min(pct, state.oceanDepthMax));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${state.oceanDepthMax * 100}%`, background: '#3b82f6' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                          handleSliderChange('oceanDepthMax', Math.max(pct, state.oceanDepthMin));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div style={{
                      ...styles.dualSliderWalkIndicator,
                      left: `${(state.oceanDepthMin + oceanPositions.depth * (state.oceanDepthMax - state.oceanDepthMin)) * 100}%`,
                      background: '#3b82f6',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
                    }} />
                  </div>
                </div>
              ) : (
                <div style={styles.sliderGroup}>
                  <div style={styles.sliderLabel}>
                    <span>Depth</span>
                    <span>{(state.oceanDepthMin * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.oceanDepthMin}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleSliderChange('oceanDepthMin', v);
                      handleSliderChange('oceanDepthMax', v);
                    }}
                    onDoubleClick={() => toggleOceanDualMode('depth')}
                    style={styles.slider}
                    title="Double-click for range mode"
                  />
                </div>
              )}
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
        {activeTab === 'drums' && (<>
        {/* Drum Synth Master */}
        <CollapsiblePanel
          id="drums"
          title="Drum Synth"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drums')}
          onToggle={togglePanel}
        >
          {/* Master Enable + Slider Morph Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={styles.sliderLabel}>
                <span>Drum Synth</span>
                <span style={{ 
                  color: state.drumEnabled ? '#10b981' : '#6b7280',
                  fontWeight: 'bold'
                }}>
                  {state.drumEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <button
                onClick={() => handleSelectChange('drumEnabled', !state.drumEnabled)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  background: state.drumEnabled 
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  color: state.drumEnabled ? 'white' : '#9ca3af',
                  transition: 'all 0.2s',
                }}
              >
                {state.drumEnabled ? '● Active' : '○ Off'}
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.sliderLabel}>
                <span>Slider Updates</span>
                <span style={{ 
                  color: state.drumRandomMorphUpdate ? '#10b981' : '#6b7280',
                  fontWeight: 'bold'
                }}>
                  {state.drumRandomMorphUpdate ? 'ON' : 'OFF'}
                </span>
              </div>
              <button
                onClick={() => handleSelectChange('drumRandomMorphUpdate', !state.drumRandomMorphUpdate)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  background: state.drumRandomMorphUpdate 
                    ? 'linear-gradient(135deg, #10b981, #059669)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  color: state.drumRandomMorphUpdate ? 'white' : '#9ca3af',
                  transition: 'all 0.2s',
                }}
              >
                {state.drumRandomMorphUpdate ? '● Animate' : '○ Static'}
              </button>
            </div>
          </div>

          <Slider
            label="Level"
            value={state.drumLevel}
            paramKey="drumLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumLevel')}
          />
          <Slider
            label="Reverb Send"
            value={state.drumReverbSend}
            paramKey="drumReverbSend"
            onChange={handleSliderChange}
            {...sliderProps('drumReverbSend')}
          />
          
          {/* Delay Effect */}
          <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(100, 200, 255, 0.1)', borderRadius: '6px', border: '1px solid rgba(100, 200, 255, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ color: '#64c8ff', fontSize: '0.85rem', fontWeight: 'bold' }}>Stereo Delay</span>
              <button
                onClick={() => handleSelectChange('drumDelayEnabled', !state.drumDelayEnabled)}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.75rem',
                  background: state.drumDelayEnabled ? 'rgba(100, 200, 255, 0.3)' : 'transparent',
                  border: '1px solid #64c8ff',
                  borderRadius: '4px',
                  color: state.drumDelayEnabled ? '#fff' : '#64c8ff',
                  cursor: 'pointer'
                }}
              >
                {state.drumDelayEnabled ? 'ON' : 'OFF'}
              </button>
              <span style={{ color: '#888', fontSize: '0.7rem' }}>@ {state.drumEuclidBaseBPM} BPM</span>
            </div>
            {state.drumDelayEnabled && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '4px', display: 'block' }}>Left</label>
                    <select
                      value={state.drumDelayNoteL}
                      onChange={(e) => handleSliderChange('drumDelayNoteL', e.target.value)}
                      style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#fff', border: '1px solid #64c8ff', borderRadius: '4px', fontSize: '0.85rem' }}
                    >
                      <option value="1/1">1/1</option>
                      <option value="1/2">1/2</option>
                      <option value="1/2d">1/2 dotted</option>
                      <option value="1/4">1/4</option>
                      <option value="1/4d">1/4 dotted</option>
                      <option value="1/4t">1/4 triplet</option>
                      <option value="1/8">1/8</option>
                      <option value="1/8d">1/8 dotted</option>
                      <option value="1/8t">1/8 triplet</option>
                      <option value="1/16">1/16</option>
                      <option value="1/16d">1/16 dotted</option>
                      <option value="1/16t">1/16 triplet</option>
                      <option value="1/32">1/32</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '4px', display: 'block' }}>Right</label>
                    <select
                      value={state.drumDelayNoteR}
                      onChange={(e) => handleSliderChange('drumDelayNoteR', e.target.value)}
                      style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#fff', border: '1px solid #64c8ff', borderRadius: '4px', fontSize: '0.85rem' }}
                    >
                      <option value="1/1">1/1</option>
                      <option value="1/2">1/2</option>
                      <option value="1/2d">1/2 dotted</option>
                      <option value="1/4">1/4</option>
                      <option value="1/4d">1/4 dotted</option>
                      <option value="1/4t">1/4 triplet</option>
                      <option value="1/8">1/8</option>
                      <option value="1/8d">1/8 dotted</option>
                      <option value="1/8t">1/8 triplet</option>
                      <option value="1/16">1/16</option>
                      <option value="1/16d">1/16 dotted</option>
                      <option value="1/16t">1/16 triplet</option>
                      <option value="1/32">1/32</option>
                    </select>
                  </div>
                </div>
                <Slider
                  label="Feedback"
                  value={state.drumDelayFeedback}
                  paramKey="drumDelayFeedback"
                  onChange={handleSliderChange}
                  {...sliderProps('drumDelayFeedback')}
                />
                <Slider
                  label="Mix"
                  value={state.drumDelayMix}
                  paramKey="drumDelayMix"
                  onChange={handleSliderChange}
                  {...sliderProps('drumDelayMix')}
                />
                <Slider
                  label="Filter"
                  value={state.drumDelayFilter}
                  paramKey="drumDelayFilter"
                  onChange={handleSliderChange}
                  {...sliderProps('drumDelayFilter')}
                />
              </>
            )}
          </div>
        </CollapsiblePanel>

        {/* Voice 1: Sub */}
        <CollapsiblePanel
          id="drumSub"
          title="Sub (Deep Pulse)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumSub')}
          onToggle={togglePanel}
          titleStyle={{ color: '#ef4444' }}
          headerAction={
            <button
              onClick={(e) => { e.stopPropagation(); audioEngine.triggerDrumVoice('sub', 0.8, state); }}
              style={{ padding: '2px 8px', fontSize: '1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '4px', color: '#ef4444', cursor: 'pointer', lineHeight: 1 }}
              title="Test Sub"
            >{TEXT_SYMBOLS.drumSub}</button>
          }
        >
          {/* Morph Controls */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <select
              value={state.drumSubPresetA}
              onChange={(e) => handleSliderChange('drumSubPresetA', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset A"
            >
              {getPresetNames('sub').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              value={state.drumSubPresetB}
              onChange={(e) => handleSliderChange('drumSubPresetB', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset B"
            >
              {getPresetNames('sub').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <Slider
            label="A ↔ B Morph"
            value={state.drumSubMorph}
            paramKey="drumSubMorph"
            onChange={handleSliderChange}
            {...sliderProps('drumSubMorph')}
          />
          {/* Core Parameters */}
          <Slider
            label="Frequency"
            value={state.drumSubFreq}
            paramKey="drumSubFreq"
            unit=" Hz"
            onChange={handleSliderChange}
            {...sliderProps('drumSubFreq')}
          />
          <Slider
            label="Decay"
            value={state.drumSubDecay}
            paramKey="drumSubDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumSubDecay')}
          />
          <Slider
            label="Level"
            value={state.drumSubLevel}
            paramKey="drumSubLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumSubLevel')}
          />
          <Slider
            label="Harmonics"
            value={state.drumSubTone}
            paramKey="drumSubTone"
            onChange={handleSliderChange}
            {...sliderProps('drumSubTone')}
          />
          {/* New Synthesis Parameters */}
          <Slider
            label="Shape (Sin→Saw)"
            value={state.drumSubShape}
            paramKey="drumSubShape"
            onChange={handleSliderChange}
            {...sliderProps('drumSubShape')}
          />
          <Slider
            label="Pitch Envelope"
            value={state.drumSubPitchEnv}
            paramKey="drumSubPitchEnv"
            unit=" st"
            onChange={handleSliderChange}
            {...sliderProps('drumSubPitchEnv')}
          />
          <Slider
            label="Pitch Decay"
            value={state.drumSubPitchDecay}
            paramKey="drumSubPitchDecay"
            unit=" ms"
            onChange={handleSliderChange}
            {...sliderProps('drumSubPitchDecay')}
          />
          <Slider
            label="Drive"
            value={state.drumSubDrive}
            paramKey="drumSubDrive"
            onChange={handleSliderChange}
            {...sliderProps('drumSubDrive')}
          />
          <Slider
            label="Sub Octave"
            value={state.drumSubSub}
            paramKey="drumSubSub"
            onChange={handleSliderChange}
            {...sliderProps('drumSubSub')}
          />
          {state.drumDelayEnabled && (
            <Slider
              label="Delay Send"
              value={state.drumSubDelaySend}
              paramKey="drumSubDelaySend"
              onChange={handleSliderChange}
              {...sliderProps('drumSubDelaySend')}
            />
          )}
        </CollapsiblePanel>

        {/* Voice 2: Kick */}
        <CollapsiblePanel
          id="drumKick"
          title="Kick (Punch)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumKick')}
          onToggle={togglePanel}
          titleStyle={{ color: '#f97316' }}
          headerAction={
            <button
              onClick={(e) => { e.stopPropagation(); audioEngine.triggerDrumVoice('kick', 0.8, state); }}
              style={{ padding: '2px 8px', fontSize: '1rem', background: 'rgba(249, 115, 22, 0.2)', border: '1px solid #f97316', borderRadius: '4px', color: '#f97316', cursor: 'pointer', lineHeight: 1 }}
              title="Test Kick"
            >{TEXT_SYMBOLS.drumKick}</button>
          }
        >
          {/* Morph Controls */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <select
              value={state.drumKickPresetA}
              onChange={(e) => handleSliderChange('drumKickPresetA', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #f97316', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset A"
            >
              {getPresetNames('kick').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              value={state.drumKickPresetB}
              onChange={(e) => handleSliderChange('drumKickPresetB', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #f97316', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset B"
            >
              {getPresetNames('kick').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <Slider
            label="A ↔ B Morph"
            value={state.drumKickMorph}
            paramKey="drumKickMorph"
            onChange={handleSliderChange}
            {...sliderProps('drumKickMorph')}
          />
          {/* Core Parameters */}
          <Slider
            label="Frequency"
            value={state.drumKickFreq}
            paramKey="drumKickFreq"
            unit=" Hz"
            onChange={handleSliderChange}
            {...sliderProps('drumKickFreq')}
          />
          <Slider
            label="Pitch Sweep"
            value={state.drumKickPitchEnv}
            paramKey="drumKickPitchEnv"
            unit=" st"
            onChange={handleSliderChange}
            {...sliderProps('drumKickPitchEnv')}
          />
          <Slider
            label="Pitch Decay"
            value={state.drumKickPitchDecay}
            paramKey="drumKickPitchDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumKickPitchDecay')}
          />
          <Slider
            label="Amp Decay"
            value={state.drumKickDecay}
            paramKey="drumKickDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumKickDecay')}
          />
          <Slider
            label="Level"
            value={state.drumKickLevel}
            paramKey="drumKickLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumKickLevel')}
          />
          <Slider
            label="Click Transient"
            value={state.drumKickClick}
            paramKey="drumKickClick"
            onChange={handleSliderChange}
            {...sliderProps('drumKickClick')}
          />
          {/* New Synthesis Parameters */}
          <Slider
            label="Body"
            value={state.drumKickBody}
            paramKey="drumKickBody"
            onChange={handleSliderChange}
            {...sliderProps('drumKickBody')}
          />
          <Slider
            label="Punch"
            value={state.drumKickPunch}
            paramKey="drumKickPunch"
            onChange={handleSliderChange}
            {...sliderProps('drumKickPunch')}
          />
          <Slider
            label="Tail"
            value={state.drumKickTail}
            paramKey="drumKickTail"
            onChange={handleSliderChange}
            {...sliderProps('drumKickTail')}
          />
          <Slider
            label="Tone/Drive"
            value={state.drumKickTone}
            paramKey="drumKickTone"
            onChange={handleSliderChange}
            {...sliderProps('drumKickTone')}
          />
          {state.drumDelayEnabled && (
            <Slider
              label="Delay Send"
              value={state.drumKickDelaySend}
              paramKey="drumKickDelaySend"
              onChange={handleSliderChange}
              {...sliderProps('drumKickDelaySend')}
            />
          )}
        </CollapsiblePanel>

        {/* Voice 3: Click */}
        <CollapsiblePanel
          id="drumClick"
          title="Click (Data)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumClick')}
          onToggle={togglePanel}
          titleStyle={{ color: '#eab308' }}
          headerAction={
            <button
              onClick={(e) => { e.stopPropagation(); audioEngine.triggerDrumVoice('click', 0.8, state); }}
              style={{ padding: '2px 8px', fontSize: '1rem', background: 'rgba(234, 179, 8, 0.2)', border: '1px solid #eab308', borderRadius: '4px', color: '#eab308', cursor: 'pointer', lineHeight: 1 }}
              title="Test Click"
            >{TEXT_SYMBOLS.drumClick}</button>
          }
        >
          {/* Morph Controls */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <select
              value={state.drumClickPresetA}
              onChange={(e) => handleSliderChange('drumClickPresetA', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #eab308', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset A"
            >
              {getPresetNames('click').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              value={state.drumClickPresetB}
              onChange={(e) => handleSliderChange('drumClickPresetB', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #eab308', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset B"
            >
              {getPresetNames('click').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <Slider
            label="A ↔ B Morph"
            value={state.drumClickMorph}
            paramKey="drumClickMorph"
            onChange={handleSliderChange}
            {...sliderProps('drumClickMorph')}
          />
          {/* Synthesis Mode */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '0.75rem', color: '#888', marginBottom: '4px', display: 'block' }}>Mode</label>
            <select
              value={state.drumClickMode}
              onChange={(e) => handleSliderChange('drumClickMode', e.target.value)}
              style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#fff', border: '1px solid #eab308', borderRadius: '4px', fontSize: '0.85rem' }}
            >
              <option value="impulse">Impulse (Sharp)</option>
              <option value="noise">Noise (Burst)</option>
              <option value="tonal">Tonal (Pitched)</option>
              <option value="granular">Granular (Texture)</option>
            </select>
          </div>
          {/* Core Parameters */}
          <Slider
            label="Decay"
            value={state.drumClickDecay}
            paramKey="drumClickDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumClickDecay')}
          />
          <Slider
            label="HP Filter"
            value={state.drumClickFilter}
            paramKey="drumClickFilter"
            unit=" Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumClickFilter')}
          />
          <Slider
            label="Tone (Impulse/Noise)"
            value={state.drumClickTone}
            paramKey="drumClickTone"
            onChange={handleSliderChange}
            {...sliderProps('drumClickTone')}
          />
          <Slider
            label="Resonance"
            value={state.drumClickResonance}
            paramKey="drumClickResonance"
            onChange={handleSliderChange}
            {...sliderProps('drumClickResonance')}
          />
          <Slider
            label="Level"
            value={state.drumClickLevel}
            paramKey="drumClickLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumClickLevel')}
          />
          {/* New Synthesis Parameters */}
          <Slider
            label="Pitch"
            value={state.drumClickPitch}
            paramKey="drumClickPitch"
            unit=" Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumClickPitch')}
          />
          <Slider
            label="Pitch Envelope"
            value={state.drumClickPitchEnv}
            paramKey="drumClickPitchEnv"
            unit=" st"
            onChange={handleSliderChange}
            {...sliderProps('drumClickPitchEnv')}
          />
          <Slider
            label="Grain Count"
            value={state.drumClickGrainCount}
            paramKey="drumClickGrainCount"
            onChange={handleSliderChange}
            {...sliderProps('drumClickGrainCount')}
          />
          <Slider
            label="Grain Spread"
            value={state.drumClickGrainSpread}
            paramKey="drumClickGrainSpread"
            unit=" ms"
            onChange={handleSliderChange}
            {...sliderProps('drumClickGrainSpread')}
          />
          <Slider
            label="Stereo Width"
            value={state.drumClickStereoWidth}
            paramKey="drumClickStereoWidth"
            onChange={handleSliderChange}
            {...sliderProps('drumClickStereoWidth')}
          />
          {state.drumDelayEnabled && (
            <Slider
              label="Delay Send"
              value={state.drumClickDelaySend}
              paramKey="drumClickDelaySend"
              onChange={handleSliderChange}
              {...sliderProps('drumClickDelaySend')}
            />
          )}
        </CollapsiblePanel>

        {/* Voice 4: Beep Hi */}
        <CollapsiblePanel
          id="drumBeepHi"
          title="Beep Hi (Ping)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumBeepHi')}
          onToggle={togglePanel}
          titleStyle={{ color: '#22c55e' }}
          headerAction={
            <button
              onClick={(e) => { e.stopPropagation(); audioEngine.triggerDrumVoice('beepHi', 0.8, state); }}
              style={{ padding: '2px 8px', fontSize: '1rem', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', borderRadius: '4px', color: '#22c55e', cursor: 'pointer', lineHeight: 1 }}
              title="Test Beep Hi"
            >{TEXT_SYMBOLS.drumBeepHi}</button>
          }
        >
          {/* Morph Controls */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <select
              value={state.drumBeepHiPresetA}
              onChange={(e) => handleSliderChange('drumBeepHiPresetA', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #22c55e', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset A"
            >
              {getPresetNames('beepHi').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              value={state.drumBeepHiPresetB}
              onChange={(e) => handleSliderChange('drumBeepHiPresetB', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #22c55e', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset B"
            >
              {getPresetNames('beepHi').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <Slider
            label="A ↔ B Morph"
            value={state.drumBeepHiMorph}
            paramKey="drumBeepHiMorph"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiMorph')}
          />
          {/* Core Parameters */}
          <Slider
            label="Frequency"
            value={state.drumBeepHiFreq}
            paramKey="drumBeepHiFreq"
            unit=" Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiFreq')}
          />
          <Slider
            label="Attack"
            value={state.drumBeepHiAttack}
            paramKey="drumBeepHiAttack"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiAttack')}
          />
          <Slider
            label="Decay"
            value={state.drumBeepHiDecay}
            paramKey="drumBeepHiDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiDecay')}
          />
          <Slider
            label="FM Tone"
            value={state.drumBeepHiTone}
            paramKey="drumBeepHiTone"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiTone')}
          />
          <Slider
            label="Level"
            value={state.drumBeepHiLevel}
            paramKey="drumBeepHiLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiLevel')}
          />
          {/* New Synthesis Parameters */}
          <Slider
            label="Inharmonic"
            value={state.drumBeepHiInharmonic}
            paramKey="drumBeepHiInharmonic"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiInharmonic')}
          />
          <Slider
            label="Partials"
            value={state.drumBeepHiPartials}
            paramKey="drumBeepHiPartials"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiPartials')}
          />
          <Slider
            label="Shimmer"
            value={state.drumBeepHiShimmer}
            paramKey="drumBeepHiShimmer"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiShimmer')}
          />
          <Slider
            label="Shimmer Rate"
            value={state.drumBeepHiShimmerRate}
            paramKey="drumBeepHiShimmerRate"
            unit=" Hz"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiShimmerRate')}
          />
          <Slider
            label="Brightness"
            value={state.drumBeepHiBrightness}
            paramKey="drumBeepHiBrightness"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepHiBrightness')}
          />
          {state.drumDelayEnabled && (
            <Slider
              label="Delay Send"
              value={state.drumBeepHiDelaySend}
              paramKey="drumBeepHiDelaySend"
              onChange={handleSliderChange}
              {...sliderProps('drumBeepHiDelaySend')}
            />
          )}
        </CollapsiblePanel>

        {/* Voice 5: Beep Lo */}
        <CollapsiblePanel
          id="drumBeepLo"
          title="Beep Lo (Blip)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumBeepLo')}
          onToggle={togglePanel}
          titleStyle={{ color: '#06b6d4' }}
          headerAction={
            <button
              onClick={(e) => { e.stopPropagation(); audioEngine.triggerDrumVoice('beepLo', 0.8, state); }}
              style={{ padding: '2px 8px', fontSize: '1rem', background: 'rgba(6, 182, 212, 0.2)', border: '1px solid #06b6d4', borderRadius: '4px', color: '#06b6d4', cursor: 'pointer', lineHeight: 1 }}
              title="Test Beep Lo"
            >{TEXT_SYMBOLS.drumBeepLo}</button>
          }
        >
          {/* Morph Controls */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <select
              value={state.drumBeepLoPresetA}
              onChange={(e) => handleSliderChange('drumBeepLoPresetA', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #06b6d4', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset A"
            >
              {getPresetNames('beepLo').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              value={state.drumBeepLoPresetB}
              onChange={(e) => handleSliderChange('drumBeepLoPresetB', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #06b6d4', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset B"
            >
              {getPresetNames('beepLo').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <Slider
            label="A ↔ B Morph"
            value={state.drumBeepLoMorph}
            paramKey="drumBeepLoMorph"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoMorph')}
          />
          {/* Core Parameters */}
          <Slider
            label="Frequency"
            value={state.drumBeepLoFreq}
            paramKey="drumBeepLoFreq"
            unit=" Hz"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoFreq')}
          />
          <Slider
            label="Attack"
            value={state.drumBeepLoAttack}
            paramKey="drumBeepLoAttack"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoAttack')}
          />
          <Slider
            label="Decay"
            value={state.drumBeepLoDecay}
            paramKey="drumBeepLoDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoDecay')}
          />
          <Slider
            label="Tone (Sine/Square)"
            value={state.drumBeepLoTone}
            paramKey="drumBeepLoTone"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoTone')}
          />
          <Slider
            label="Level"
            value={state.drumBeepLoLevel}
            paramKey="drumBeepLoLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoLevel')}
          />
          {/* New Synthesis Parameters */}
          <Slider
            label="Pitch Envelope"
            value={state.drumBeepLoPitchEnv}
            paramKey="drumBeepLoPitchEnv"
            unit=" st"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoPitchEnv')}
          />
          <Slider
            label="Pitch Decay"
            value={state.drumBeepLoPitchDecay}
            paramKey="drumBeepLoPitchDecay"
            unit=" ms"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoPitchDecay')}
          />
          <Slider
            label="Body"
            value={state.drumBeepLoBody}
            paramKey="drumBeepLoBody"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoBody')}
          />
          <Slider
            label="Pluck"
            value={state.drumBeepLoPluck}
            paramKey="drumBeepLoPluck"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoPluck')}
          />
          <Slider
            label="Pluck Damping"
            value={state.drumBeepLoPluckDamp}
            paramKey="drumBeepLoPluckDamp"
            onChange={handleSliderChange}
            {...sliderProps('drumBeepLoPluckDamp')}
          />
          {state.drumDelayEnabled && (
            <Slider
              label="Delay Send"
              value={state.drumBeepLoDelaySend}
              paramKey="drumBeepLoDelaySend"
              onChange={handleSliderChange}
              {...sliderProps('drumBeepLoDelaySend')}
            />
          )}
        </CollapsiblePanel>

        {/* Voice 6: Noise */}
        <CollapsiblePanel
          id="drumNoise"
          title="Noise (Hi-Hat)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumNoise')}
          onToggle={togglePanel}
          titleStyle={{ color: '#8b5cf6' }}
          headerAction={
            <button
              onClick={(e) => { e.stopPropagation(); audioEngine.triggerDrumVoice('noise', 0.8, state); }}
              style={{ padding: '2px 8px', fontSize: '1rem', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid #8b5cf6', borderRadius: '4px', color: '#8b5cf6', cursor: 'pointer', lineHeight: 1 }}
              title="Test Noise"
            >{TEXT_SYMBOLS.drumNoise}</button>
          }
        >
          {/* Morph Controls */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <select
              value={state.drumNoisePresetA}
              onChange={(e) => handleSliderChange('drumNoisePresetA', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #8b5cf6', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset A"
            >
              {getPresetNames('noise').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select
              value={state.drumNoisePresetB}
              onChange={(e) => handleSliderChange('drumNoisePresetB', e.target.value)}
              style={{ flex: 1, minWidth: '80px', padding: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #8b5cf6', borderRadius: '4px', fontSize: '0.75rem' }}
              title="Preset B"
            >
              {getPresetNames('noise').map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <Slider
            label="A ↔ B Morph"
            value={state.drumNoiseMorph}
            paramKey="drumNoiseMorph"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseMorph')}
          />
          {/* Core Parameters */}
          <Select
            label="Filter Type"
            value={state.drumNoiseFilterType}
            options={[
              { value: 'lowpass', label: 'Lowpass' },
              { value: 'bandpass', label: 'Bandpass' },
              { value: 'highpass', label: 'Highpass' },
            ]}
            onChange={(v) => handleSelectChange('drumNoiseFilterType', v)}
          />
          <Slider
            label="Filter Freq"
            value={state.drumNoiseFilterFreq}
            paramKey="drumNoiseFilterFreq"
            unit=" Hz"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseFilterFreq')}
          />
          <Slider
            label="Filter Q"
            value={state.drumNoiseFilterQ}
            paramKey="drumNoiseFilterQ"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseFilterQ')}
          />
          <Slider
            label="Attack"
            value={state.drumNoiseAttack}
            paramKey="drumNoiseAttack"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseAttack')}
          />
          <Slider
            label="Decay"
            value={state.drumNoiseDecay}
            paramKey="drumNoiseDecay"
            unit=" ms"
            logarithmic
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseDecay')}
          />
          <Slider
            label="Level"
            value={state.drumNoiseLevel}
            paramKey="drumNoiseLevel"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseLevel')}
          />
          {/* New Synthesis Parameters */}
          <Slider
            label="Formant"
            value={state.drumNoiseFormant}
            paramKey="drumNoiseFormant"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseFormant')}
          />
          <Slider
            label="Breath"
            value={state.drumNoiseBreath}
            paramKey="drumNoiseBreath"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseBreath')}
          />
          <Slider
            label="Filter Envelope"
            value={state.drumNoiseFilterEnv}
            paramKey="drumNoiseFilterEnv"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseFilterEnv')}
          />
          <Slider
            label="Filter Env Decay"
            value={state.drumNoiseFilterEnvDecay}
            paramKey="drumNoiseFilterEnvDecay"
            unit=" ms"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseFilterEnvDecay')}
          />
          <Slider
            label="Density"
            value={state.drumNoiseDensity}
            paramKey="drumNoiseDensity"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseDensity')}
          />
          <Slider
            label="Color LFO"
            value={state.drumNoiseColorLFO}
            paramKey="drumNoiseColorLFO"
            unit=" Hz"
            onChange={handleSliderChange}
            {...sliderProps('drumNoiseColorLFO')}
          />
          {state.drumDelayEnabled && (
            <Slider
              label="Delay Send"
              value={state.drumNoiseDelaySend}
              paramKey="drumNoiseDelaySend"
              onChange={handleSliderChange}
              {...sliderProps('drumNoiseDelaySend')}
            />
          )}
        </CollapsiblePanel>

        {/* Sequencer */}
        <CollapsiblePanel
          id="drumRandom"
          title="Sequencer"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('drumRandom')}
          onToggle={togglePanel}
          titleStyle={{ color: '#f472b6' }}
        >
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
              <span>Random Mode</span>
              <span style={{ 
                color: state.drumRandomEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.drumRandomEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('drumRandomEnabled', !state.drumRandomEnabled)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.drumRandomEnabled 
                  ? 'linear-gradient(135deg, #f472b6, #ec4899)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.drumRandomEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.drumRandomEnabled ? '● Random Active' : '○ Random Off'}
            </button>
          </div>
          {state.drumRandomEnabled && (
            <>
              <Slider
                label="Density"
                value={state.drumRandomDensity}
                paramKey="drumRandomDensity"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomDensity')}
              />
              <Slider
                label="Min Interval"
                value={state.drumRandomMinInterval}
                paramKey="drumRandomMinInterval"
                unit=" ms"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomMinInterval')}
              />
              <Slider
                label="Max Interval"
                value={state.drumRandomMaxInterval}
                paramKey="drumRandomMaxInterval"
                unit=" ms"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomMaxInterval')}
              />
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '8px' }}>Per-Voice Probability:</div>
              <Slider
                label="Sub"
                value={state.drumRandomSubProb}
                paramKey="drumRandomSubProb"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomSubProb')}
              />
              <Slider
                label="Kick"
                value={state.drumRandomKickProb}
                paramKey="drumRandomKickProb"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomKickProb')}
              />
              <Slider
                label="Click"
                value={state.drumRandomClickProb}
                paramKey="drumRandomClickProb"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomClickProb')}
              />
              <Slider
                label="Beep Hi"
                value={state.drumRandomBeepHiProb}
                paramKey="drumRandomBeepHiProb"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomBeepHiProb')}
              />
              <Slider
                label="Beep Lo"
                value={state.drumRandomBeepLoProb}
                paramKey="drumRandomBeepLoProb"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomBeepLoProb')}
              />
              <Slider
                label="Noise"
                value={state.drumRandomNoiseProb}
                paramKey="drumRandomNoiseProb"
                onChange={handleSliderChange}
                {...sliderProps('drumRandomNoiseProb')}
              />
            </>
          )}

          {/* Euclidean Sequencer Settings */}
          <div style={{ marginTop: '16px', borderTop: '1px solid #444', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#a855f7', marginBottom: '8px' }}>⬡ Euclidean Sequencer</div>
          </div>
          <div style={styles.sliderGroup}>
            <div style={styles.sliderLabel}>
              <span>Euclidean Mode</span>
              <span style={{ 
                color: state.drumEuclidMasterEnabled ? '#10b981' : '#6b7280',
                fontWeight: 'bold'
              }}>
                {state.drumEuclidMasterEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => handleSelectChange('drumEuclidMasterEnabled', !state.drumEuclidMasterEnabled)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: state.drumEuclidMasterEnabled 
                  ? 'linear-gradient(135deg, #a855f7, #9333ea)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: state.drumEuclidMasterEnabled ? 'white' : '#9ca3af',
                transition: 'all 0.2s',
              }}
            >
              {state.drumEuclidMasterEnabled ? '● Euclidean Active' : '○ Euclidean Off'}
            </button>
          </div>
          <Slider
            label="Base BPM"
            value={state.drumEuclidBaseBPM}
            paramKey="drumEuclidBaseBPM"
            unit="bpm"
            onChange={handleSliderChange}
            {...sliderProps('drumEuclidBaseBPM')}
          />
          <Slider
            label="Tempo"
            value={state.drumEuclidTempo}
            paramKey="drumEuclidTempo"
            unit="x"
            onChange={handleSliderChange}
            {...sliderProps('drumEuclidTempo')}
          />
          <Slider
            label="Swing"
            value={state.drumEuclidSwing}
            paramKey="drumEuclidSwing"
            unit="%"
            onChange={handleSliderChange}
            {...sliderProps('drumEuclidSwing')}
          />
          <Select
            label="Division"
            value={state.drumEuclidDivision.toString()}
            options={[
              { value: '4', label: '1/4 (Quarter)' },
              { value: '8', label: '1/8 (Eighth)' },
              { value: '16', label: '1/16 (Sixteenth)' },
              { value: '32', label: '1/32 (Thirty-second)' },
            ]}
            onChange={(v) => handleSelectChange('drumEuclidDivision', parseInt(v))}
          />
        </CollapsiblePanel>

        {/* Euclidean Lane 1 */}
        {(() => {
          const laneNum = 1;
          const laneColor = '#ef4444';
          const voiceIcons: Record<string, string> = {
            sub: '◉', kick: '●', click: '▪', beepHi: '△', beepLo: '▽', noise: '≋'
          };
          const voiceNames: Record<string, string> = {
            sub: 'Sub (Deep Pulse)', kick: 'Kick (Punch)', click: 'Click (Data)', 
            beepHi: 'Beep Hi (Ping)', beepLo: 'Beep Lo (Blip)', noise: 'Noise (Hi-Hat)'
          };
          const voiceOrder = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'] as const;
          
          const enabledKey = `drumEuclid${laneNum}Enabled` as keyof typeof state;
          const presetKey = `drumEuclid${laneNum}Preset` as keyof typeof state;
          const stepsKey = `drumEuclid${laneNum}Steps` as keyof typeof state;
          const hitsKey = `drumEuclid${laneNum}Hits` as keyof typeof state;
          const rotationKey = `drumEuclid${laneNum}Rotation` as keyof typeof state;
          const targetSubKey = `drumEuclid${laneNum}TargetSub` as keyof typeof state;
          const targetKickKey = `drumEuclid${laneNum}TargetKick` as keyof typeof state;
          const targetClickKey = `drumEuclid${laneNum}TargetClick` as keyof typeof state;
          const targetBeepHiKey = `drumEuclid${laneNum}TargetBeepHi` as keyof typeof state;
          const targetBeepLoKey = `drumEuclid${laneNum}TargetBeepLo` as keyof typeof state;
          const targetNoiseKey = `drumEuclid${laneNum}TargetNoise` as keyof typeof state;
          const probabilityKey = `drumEuclid${laneNum}Probability` as keyof typeof state;
          const velocityMinKey = `drumEuclid${laneNum}VelocityMin` as keyof typeof state;
          const velocityMaxKey = `drumEuclid${laneNum}VelocityMax` as keyof typeof state;
          
          const isEnabled = state[enabledKey] as boolean;
          const preset = state[presetKey] as string;
          const steps = state[stepsKey] as number;
          const hits = state[hitsKey] as number;
          const rotation = state[rotationKey] as number;
          
          const legacyTargetKey = `drumEuclid${laneNum}Target` as keyof typeof state;
          const legacyTarget = (state as any)[legacyTargetKey] as string | undefined;
          const voiceToggles: Record<string, boolean> = {
            sub: (state[targetSubKey] as boolean | undefined) ?? (legacyTarget === 'sub'),
            kick: (state[targetKickKey] as boolean | undefined) ?? (legacyTarget === 'kick'),
            click: (state[targetClickKey] as boolean | undefined) ?? (legacyTarget === 'click'),
            beepHi: (state[targetBeepHiKey] as boolean | undefined) ?? (legacyTarget === 'beepHi'),
            beepLo: (state[targetBeepLoKey] as boolean | undefined) ?? (legacyTarget === 'beepLo'),
            noise: (state[targetNoiseKey] as boolean | undefined) ?? (legacyTarget === 'noise'),
          };
          const voiceKeyMap: Record<string, keyof typeof state> = {
            sub: targetSubKey, kick: targetKickKey, click: targetClickKey,
            beepHi: targetBeepHiKey, beepLo: targetBeepLoKey, noise: targetNoiseKey,
          };
          const probability = state[probabilityKey] as number;
          const velocityMin = state[velocityMinKey] as number;
          const velocityMax = state[velocityMaxKey] as number;
          const isVelocityDual = velocityMin !== velocityMax;
          
          const presetData: Record<string, { steps: number; hits: number; rotation: number }> = {
            sparse: { steps: 16, hits: 1, rotation: 0 },
            dense: { steps: 8, hits: 7, rotation: 0 },
            longSparse: { steps: 32, hits: 3, rotation: 0 },
            poly3v4: { steps: 12, hits: 3, rotation: 0 },
            poly4v3: { steps: 12, hits: 4, rotation: 0 },
            poly5v4: { steps: 20, hits: 5, rotation: 0 },
            lancaran: { steps: 16, hits: 4, rotation: 0 },
            ketawang: { steps: 16, hits: 2, rotation: 0 },
            ladrang: { steps: 32, hits: 8, rotation: 0 },
            gangsaran: { steps: 8, hits: 4, rotation: 0 },
            kotekan: { steps: 8, hits: 3, rotation: 1 },
            kotekan2: { steps: 8, hits: 3, rotation: 4 },
            srepegan: { steps: 16, hits: 6, rotation: 2 },
            sampak: { steps: 8, hits: 5, rotation: 0 },
            ayak: { steps: 16, hits: 3, rotation: 4 },
            bonang: { steps: 12, hits: 5, rotation: 2 },
            tresillo: { steps: 8, hits: 3, rotation: 0 },
            cinquillo: { steps: 8, hits: 5, rotation: 0 },
            rumba: { steps: 16, hits: 5, rotation: 0 },
            bossa: { steps: 16, hits: 5, rotation: 3 },
            son: { steps: 16, hits: 7, rotation: 0 },
            shiko: { steps: 16, hits: 5, rotation: 0 },
            soukous: { steps: 12, hits: 7, rotation: 0 },
            gahu: { steps: 16, hits: 7, rotation: 0 },
            bembe: { steps: 12, hits: 7, rotation: 0 },
            clapping: { steps: 12, hits: 8, rotation: 0 },
            clappingB: { steps: 12, hits: 8, rotation: 5 },
            additive7: { steps: 7, hits: 4, rotation: 0 },
            additive11: { steps: 11, hits: 5, rotation: 0 },
            additive13: { steps: 13, hits: 5, rotation: 0 },
            reich18: { steps: 12, hits: 7, rotation: 3 },
            drumming: { steps: 8, hits: 6, rotation: 1 },
          };
          
          const patternSteps = preset === 'custom' ? steps : (presetData[preset]?.steps || 16);
          const patternHits = preset === 'custom' ? hits : (presetData[preset]?.hits || 4);
          const baseRotation = preset === 'custom' ? 0 : (presetData[preset]?.rotation || 0);
          const patternRotation = (baseRotation + rotation) % patternSteps;
          
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
            <CollapsiblePanel
              id="drumEuclid1"
              title={`⬡ Euclidean Lane 1 ${isEnabled ? `• ${voiceOrder.filter(v => voiceToggles[v]).map(v => voiceIcons[v]).join('')} ${patternHits}/${patternSteps}` : '(off)'}`}
              isMobile={isMobile}
              isExpanded={expandedPanels.has('drumEuclid1')}
              onToggle={togglePanel}
              titleStyle={{ color: laneColor }}
            >
              {/* Enable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <button
                  onClick={() => handleSelectChange(enabledKey, !isEnabled)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    background: isEnabled ? laneColor : 'rgba(255, 255, 255, 0.1)',
                    color: isEnabled ? 'white' : '#9ca3af',
                    transition: 'all 0.2s',
                  }}
                >
                  {isEnabled ? '● Lane Active' : '○ Lane Off'}
                </button>
              </div>

              {/* Pattern visualization */}
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '2px',
                marginBottom: '8px',
                justifyContent: 'center',
                opacity: isEnabled ? 1 : 0.4,
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
              
              {/* Pattern Preset Selector */}
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
                  <option value="poly5v4">5 vs 4 (20/5)</option>
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
              
              {/* Voice toggle buttons row */}
              <div style={{ 
                display: 'flex', 
                gap: '4px', 
                marginBottom: '8px',
                justifyContent: 'space-between'
              }}>
                {voiceOrder.map(voice => {
                  const isOn = voiceToggles[voice];
                  const toggleKey = voiceKeyMap[voice];
                  return (
                    <button
                      key={voice}
                      onClick={() => handleSelectChange(toggleKey, !isOn)}
                      title={voiceNames[voice]}
                      style={{
                        flex: 1,
                        padding: '6px 2px',
                        borderRadius: '4px',
                        border: isOn ? `2px solid ${laneColor}` : '1px solid #444',
                        background: isOn ? `${laneColor}40` : 'rgba(0,0,0,0.3)',
                        color: isOn ? laneColor : '#666',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {voiceIcons[voice]}
                    </button>
                  );
                })}
              </div>

              {/* Custom mode: Steps & Hits sliders */}
              {preset === 'custom' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <Slider 
                      label="Steps" 
                      value={steps} 
                      paramKey={stepsKey} 
                      onChange={handleSliderChange} 
                      {...sliderProps(stepsKey)} 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Slider 
                      label="Hits" 
                      value={hits} 
                      paramKey={hitsKey} 
                      onChange={handleSliderChange} 
                      {...sliderProps(hitsKey)} 
                    />
                  </div>
                </div>
              )}
              
              {/* Probability and Rotation row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                  <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Rotate: {rotation}</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => {
                        const newRot = (rotation + 1) % patternSteps;
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
                    >
                      ←
                    </button>
                    <button
                      onClick={() => {
                        const newRot = (rotation - 1 + patternSteps) % patternSteps;
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
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>

              {/* Level row */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>
                  Level {isVelocityDual 
                    ? <span style={{ color: laneColor }}>{Math.round(velocityMin * 100)}–{Math.round(velocityMax * 100)}%</span>
                    : `${Math.round(velocityMin * 100)}%`
                  }
                  {isVelocityDual && <span style={{ color: laneColor, marginLeft: '4px', fontSize: '0.6rem' }}>⟷ range</span>}
                </div>
                {isVelocityDual ? (
                  <div 
                    style={styles.dualSliderContainer}
                    onDoubleClick={() => {
                      const mid = (velocityMin + velocityMax) / 2;
                      handleSliderChange(velocityMinKey as keyof SliderState, mid);
                      handleSliderChange(velocityMaxKey as keyof SliderState, mid);
                    }}
                    {...createLongPressHandlers(() => {
                      const mid = (velocityMin + velocityMax) / 2;
                      handleSliderChange(velocityMinKey as keyof SliderState, mid);
                      handleSliderChange(velocityMaxKey as keyof SliderState, mid);
                    })}
                    title="Double-click or long-press for single value mode"
                  >
                    <div style={{
                      ...styles.dualSliderTrack,
                      left: `${velocityMin * 100}%`,
                      width: `${(velocityMax - velocityMin) * 100}%`,
                      background: `linear-gradient(90deg, ${laneColor}99, ${laneColor}cc)`,
                    }} />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${velocityMin * 100}%`, background: laneColor }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                          handleSliderChange(velocityMinKey as keyof SliderState, Math.min(pct / 100, velocityMax));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div
                      style={{ ...styles.dualSliderThumb, left: `${velocityMax * 100}%`, background: laneColor }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;
                        const move = (me: MouseEvent) => {
                          const rect = container.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
                          handleSliderChange(velocityMaxKey as keyof SliderState, Math.max(pct / 100, velocityMin));
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                  </div>
                ) : (
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={velocityMin}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      handleSliderChange(velocityMinKey as keyof SliderState, val);
                      handleSliderChange(velocityMaxKey as keyof SliderState, val);
                    }}
                    onDoubleClick={() => {
                      const current = velocityMin;
                      const spread = 0.1;
                      const newMin = Math.max(0, current - spread);
                      const newMax = Math.min(1, current + spread);
                      handleSliderChange(velocityMinKey as keyof SliderState, newMin);
                      handleSliderChange(velocityMaxKey as keyof SliderState, newMax);
                    }}
                    {...createLongPressHandlers(() => {
                      const current = velocityMin;
                      const spread = 0.1;
                      const newMin = Math.max(0, current - spread);
                      const newMax = Math.min(1, current + spread);
                      handleSliderChange(velocityMinKey as keyof SliderState, newMin);
                      handleSliderChange(velocityMaxKey as keyof SliderState, newMax);
                    })}
                    style={{ width: '100%', cursor: 'pointer' }}
                    title="Double-click or long-press for range mode"
                  />
                )}
              </div>
            </CollapsiblePanel>
          );
        })()}

        {/* Euclidean Lane 2 */}
        {(() => {
          const laneNum = 2;
          const laneColor = '#f97316';
          const voiceIcons: Record<string, string> = {
            sub: '◉', kick: '●', click: '▪', beepHi: '△', beepLo: '▽', noise: '≋'
          };
          const voiceNames: Record<string, string> = {
            sub: 'Sub (Deep Pulse)', kick: 'Kick (Punch)', click: 'Click (Data)', 
            beepHi: 'Beep Hi (Ping)', beepLo: 'Beep Lo (Blip)', noise: 'Noise (Hi-Hat)'
          };
          const voiceOrder = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'] as const;
          
          const enabledKey = `drumEuclid${laneNum}Enabled` as keyof typeof state;
          const presetKey = `drumEuclid${laneNum}Preset` as keyof typeof state;
          const stepsKey = `drumEuclid${laneNum}Steps` as keyof typeof state;
          const hitsKey = `drumEuclid${laneNum}Hits` as keyof typeof state;
          const rotationKey = `drumEuclid${laneNum}Rotation` as keyof typeof state;
          const targetSubKey = `drumEuclid${laneNum}TargetSub` as keyof typeof state;
          const targetKickKey = `drumEuclid${laneNum}TargetKick` as keyof typeof state;
          const targetClickKey = `drumEuclid${laneNum}TargetClick` as keyof typeof state;
          const targetBeepHiKey = `drumEuclid${laneNum}TargetBeepHi` as keyof typeof state;
          const targetBeepLoKey = `drumEuclid${laneNum}TargetBeepLo` as keyof typeof state;
          const targetNoiseKey = `drumEuclid${laneNum}TargetNoise` as keyof typeof state;
          const probabilityKey = `drumEuclid${laneNum}Probability` as keyof typeof state;
          const velocityMinKey = `drumEuclid${laneNum}VelocityMin` as keyof typeof state;
          const velocityMaxKey = `drumEuclid${laneNum}VelocityMax` as keyof typeof state;
          
          const isEnabled = state[enabledKey] as boolean;
          const preset = state[presetKey] as string;
          const steps = state[stepsKey] as number;
          const hits = state[hitsKey] as number;
          const rotation = state[rotationKey] as number;
          
          const legacyTargetKey = `drumEuclid${laneNum}Target` as keyof typeof state;
          const legacyTarget = (state as any)[legacyTargetKey] as string | undefined;
          const voiceToggles: Record<string, boolean> = {
            sub: (state[targetSubKey] as boolean | undefined) ?? (legacyTarget === 'sub'),
            kick: (state[targetKickKey] as boolean | undefined) ?? (legacyTarget === 'kick'),
            click: (state[targetClickKey] as boolean | undefined) ?? (legacyTarget === 'click'),
            beepHi: (state[targetBeepHiKey] as boolean | undefined) ?? (legacyTarget === 'beepHi'),
            beepLo: (state[targetBeepLoKey] as boolean | undefined) ?? (legacyTarget === 'beepLo'),
            noise: (state[targetNoiseKey] as boolean | undefined) ?? (legacyTarget === 'noise'),
          };
          const voiceKeyMap: Record<string, keyof typeof state> = {
            sub: targetSubKey, kick: targetKickKey, click: targetClickKey,
            beepHi: targetBeepHiKey, beepLo: targetBeepLoKey, noise: targetNoiseKey,
          };
          const probability = state[probabilityKey] as number;
          const velocityMin = state[velocityMinKey] as number;
          const velocityMax = state[velocityMaxKey] as number;
          const isVelocityDual = velocityMin !== velocityMax;
          
          const presetData: Record<string, { steps: number; hits: number; rotation: number }> = {
            sparse: { steps: 16, hits: 1, rotation: 0 }, dense: { steps: 8, hits: 7, rotation: 0 },
            longSparse: { steps: 32, hits: 3, rotation: 0 }, poly3v4: { steps: 12, hits: 3, rotation: 0 },
            poly4v3: { steps: 12, hits: 4, rotation: 0 }, poly5v4: { steps: 20, hits: 5, rotation: 0 },
            lancaran: { steps: 16, hits: 4, rotation: 0 }, ketawang: { steps: 16, hits: 2, rotation: 0 },
            ladrang: { steps: 32, hits: 8, rotation: 0 }, gangsaran: { steps: 8, hits: 4, rotation: 0 },
            kotekan: { steps: 8, hits: 3, rotation: 1 }, kotekan2: { steps: 8, hits: 3, rotation: 4 },
            srepegan: { steps: 16, hits: 6, rotation: 2 }, sampak: { steps: 8, hits: 5, rotation: 0 },
            ayak: { steps: 16, hits: 3, rotation: 4 }, bonang: { steps: 12, hits: 5, rotation: 2 },
            tresillo: { steps: 8, hits: 3, rotation: 0 }, cinquillo: { steps: 8, hits: 5, rotation: 0 },
            rumba: { steps: 16, hits: 5, rotation: 0 }, bossa: { steps: 16, hits: 5, rotation: 3 },
            son: { steps: 16, hits: 7, rotation: 0 }, shiko: { steps: 16, hits: 5, rotation: 0 },
            soukous: { steps: 12, hits: 7, rotation: 0 }, gahu: { steps: 16, hits: 7, rotation: 0 },
            bembe: { steps: 12, hits: 7, rotation: 0 }, clapping: { steps: 12, hits: 8, rotation: 0 },
            clappingB: { steps: 12, hits: 8, rotation: 5 }, additive7: { steps: 7, hits: 4, rotation: 0 },
            additive11: { steps: 11, hits: 5, rotation: 0 }, additive13: { steps: 13, hits: 5, rotation: 0 },
            reich18: { steps: 12, hits: 7, rotation: 3 }, drumming: { steps: 8, hits: 6, rotation: 1 },
          };
          
          const patternSteps = preset === 'custom' ? steps : (presetData[preset]?.steps || 16);
          const patternHits = preset === 'custom' ? hits : (presetData[preset]?.hits || 4);
          const baseRotation = preset === 'custom' ? 0 : (presetData[preset]?.rotation || 0);
          const patternRotation = (baseRotation + rotation) % patternSteps;
          
          const generatePattern = (s: number, h: number, r: number): boolean[] => {
            const pattern: boolean[] = [];
            if (h === 0) { for (let i = 0; i < s; i++) pattern.push(false); }
            else if (h >= s) { for (let i = 0; i < s; i++) pattern.push(true); }
            else {
              let groups: number[][] = [];
              for (let i = 0; i < h; i++) groups.push([1]);
              for (let i = 0; i < s - h; i++) groups.push([0]);
              while (groups.length > 1) {
                const ones = groups.filter(g => g[0] === 1);
                const zeros = groups.filter(g => g[0] === 0);
                if (zeros.length === 0) break;
                const combined: number[][] = [];
                const minLen = Math.min(ones.length, zeros.length);
                for (let i = 0; i < minLen; i++) combined.push([...ones[i], ...zeros[i]]);
                const remainder = ones.length > zeros.length ? ones.slice(minLen) : zeros.slice(minLen);
                if (remainder.length === 0 || remainder.length === groups.length - minLen) { groups = [...combined, ...remainder]; break; }
                groups = [...combined, ...remainder];
              }
              for (const g of groups) for (const v of g) pattern.push(v === 1);
            }
            return [...pattern.slice(r % pattern.length), ...pattern.slice(0, r % pattern.length)];
          };
          const pattern = generatePattern(patternSteps, patternHits, patternRotation);
          
          return (
            <CollapsiblePanel
              id="drumEuclid2"
              title={`⬡ Euclidean Lane 2 ${isEnabled ? `• ${voiceOrder.filter(v => voiceToggles[v]).map(v => voiceIcons[v]).join('')} ${patternHits}/${patternSteps}` : '(off)'}`}
              isMobile={isMobile}
              isExpanded={expandedPanels.has('drumEuclid2')}
              onToggle={togglePanel}
              titleStyle={{ color: laneColor }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <button onClick={() => handleSelectChange(enabledKey, !isEnabled)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: isEnabled ? laneColor : 'rgba(255, 255, 255, 0.1)', color: isEnabled ? 'white' : '#9ca3af', transition: 'all 0.2s' }}>
                  {isEnabled ? '● Lane Active' : '○ Lane Off'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '8px', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4 }}>
                {pattern.map((hit, i) => (<div key={i} style={{ width: patternSteps > 16 ? '8px' : '12px', height: patternSteps > 16 ? '8px' : '12px', borderRadius: '50%', background: hit ? laneColor : 'rgba(255,255,255,0.15)', boxShadow: hit ? `0 0 6px ${laneColor}` : 'none' }} />))}
              </div>
              <select value={preset} onChange={(e) => handleSelectChange(presetKey, e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${laneColor}40`, background: 'rgba(0,0,0,0.4)', color: '#eee', cursor: 'pointer', fontSize: '0.75rem', marginBottom: '6px' }}>
                <optgroup label="Polyrhythmic"><option value="sparse">Sparse (16/1)</option><option value="dense">Dense (8/7)</option><option value="longSparse">Long Sparse (32/3)</option><option value="poly3v4">3 vs 4 (12/3)</option><option value="poly4v3">4 vs 3 (12/4)</option><option value="poly5v4">5 vs 4 (20/5)</option></optgroup>
                <optgroup label="Gamelan"><option value="lancaran">Lancaran (16/4)</option><option value="ketawang">Ketawang (16/2)</option><option value="ladrang">Ladrang (32/8)</option><option value="gangsaran">Gangsaran (8/4)</option><option value="kotekan">Kotekan A (8/3)</option><option value="kotekan2">Kotekan B (8/3)</option><option value="srepegan">Srepegan (16/6)</option><option value="sampak">Sampak (8/5)</option><option value="ayak">Ayak (16/3)</option><option value="bonang">Bonang (12/5)</option></optgroup>
                <optgroup label="World"><option value="tresillo">Tresillo (8/3)</option><option value="cinquillo">Cinquillo (8/5)</option><option value="rumba">Rumba (16/5)</option><option value="bossa">Bossa Nova (16/5)</option><option value="son">Son Clave (16/7)</option><option value="shiko">Shiko (16/5)</option><option value="soukous">Soukous (12/7)</option><option value="gahu">Gahu (16/7)</option><option value="bembe">Bembé (12/7)</option></optgroup>
                <optgroup label="Experimental"><option value="clapping">Clapping Music (12/8)</option><option value="clappingB">Clapping B (12/8)</option><option value="additive7">Additive 7 (7/4)</option><option value="additive11">Additive 11 (11/5)</option><option value="additive13">Additive 13 (13/5)</option><option value="reich18">Reich 18 (12/7)</option><option value="drumming">Drumming (8/6)</option></optgroup>
                <option value="custom">Custom</option>
              </select>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', justifyContent: 'space-between' }}>
                {voiceOrder.map(voice => { const isOn = voiceToggles[voice]; return (<button key={voice} onClick={() => handleSelectChange(voiceKeyMap[voice], !isOn)} title={voiceNames[voice]} style={{ flex: 1, padding: '6px 2px', borderRadius: '4px', border: isOn ? `2px solid ${laneColor}` : '1px solid #444', background: isOn ? `${laneColor}40` : 'rgba(0,0,0,0.3)', color: isOn ? laneColor : '#666', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>{voiceIcons[voice]}</button>); })}
              </div>
              {preset === 'custom' && (<div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}><div style={{ flex: 1 }}><Slider label="Steps" value={steps} paramKey={stepsKey} onChange={handleSliderChange} {...sliderProps(stepsKey)} /></div><div style={{ flex: 1 }}><Slider label="Hits" value={hits} paramKey={hitsKey} onChange={handleSliderChange} {...sliderProps(hitsKey)} /></div></div>)}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Probability {Math.round(probability * 100)}%</div><input type="range" min="0" max="1" step="0.05" value={probability} onChange={(e) => handleSliderChange(probabilityKey as keyof SliderState, parseFloat(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Rotate: {rotation}</div><div style={{ display: 'flex', gap: '4px' }}><button onClick={() => handleSliderChange(rotationKey as keyof SliderState, (rotation + 1) % patternSteps)} style={{ padding: '4px 8px', background: `${laneColor}30`, border: `1px solid ${laneColor}60`, borderRadius: '4px', color: laneColor, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>←</button><button onClick={() => handleSliderChange(rotationKey as keyof SliderState, (rotation - 1 + patternSteps) % patternSteps)} style={{ padding: '4px 8px', background: `${laneColor}30`, border: `1px solid ${laneColor}60`, borderRadius: '4px', color: laneColor, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>→</button></div></div>
              </div>
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Level {isVelocityDual ? <span style={{ color: laneColor }}>{Math.round(velocityMin * 100)}–{Math.round(velocityMax * 100)}%</span> : `${Math.round(velocityMin * 100)}%`}{isVelocityDual && <span style={{ color: laneColor, marginLeft: '4px', fontSize: '0.6rem' }}>{TEXT_SYMBOLS.range} range</span>}</div>
                <input type="range" min="0" max="1" step="0.05" value={velocityMin} onChange={(e) => { const val = parseFloat(e.target.value); handleSliderChange(velocityMinKey as keyof SliderState, val); handleSliderChange(velocityMaxKey as keyof SliderState, val); }} onDoubleClick={() => { handleSliderChange(velocityMinKey as keyof SliderState, Math.max(0, velocityMin - 0.1)); handleSliderChange(velocityMaxKey as keyof SliderState, Math.min(1, velocityMin + 0.1)); }} {...createLongPressHandlers(() => { handleSliderChange(velocityMinKey as keyof SliderState, Math.max(0, velocityMin - 0.1)); handleSliderChange(velocityMaxKey as keyof SliderState, Math.min(1, velocityMin + 0.1)); })} style={{ width: '100%', cursor: 'pointer' }} title="Double-click or long-press for range mode" />
              </div>
            </CollapsiblePanel>
          );
        })()}

        {/* Euclidean Lane 3 */}
        {(() => {
          const laneNum = 3;
          const laneColor = '#22c55e';
          const voiceIcons: Record<string, string> = { sub: '◉', kick: '●', click: '▪', beepHi: '△', beepLo: '▽', noise: '≋' };
          const voiceNames: Record<string, string> = { sub: 'Sub (Deep Pulse)', kick: 'Kick (Punch)', click: 'Click (Data)', beepHi: 'Beep Hi (Ping)', beepLo: 'Beep Lo (Blip)', noise: 'Noise (Hi-Hat)' };
          const voiceOrder = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'] as const;
          const enabledKey = `drumEuclid${laneNum}Enabled` as keyof typeof state;
          const presetKey = `drumEuclid${laneNum}Preset` as keyof typeof state;
          const stepsKey = `drumEuclid${laneNum}Steps` as keyof typeof state;
          const hitsKey = `drumEuclid${laneNum}Hits` as keyof typeof state;
          const rotationKey = `drumEuclid${laneNum}Rotation` as keyof typeof state;
          const targetSubKey = `drumEuclid${laneNum}TargetSub` as keyof typeof state;
          const targetKickKey = `drumEuclid${laneNum}TargetKick` as keyof typeof state;
          const targetClickKey = `drumEuclid${laneNum}TargetClick` as keyof typeof state;
          const targetBeepHiKey = `drumEuclid${laneNum}TargetBeepHi` as keyof typeof state;
          const targetBeepLoKey = `drumEuclid${laneNum}TargetBeepLo` as keyof typeof state;
          const targetNoiseKey = `drumEuclid${laneNum}TargetNoise` as keyof typeof state;
          const probabilityKey = `drumEuclid${laneNum}Probability` as keyof typeof state;
          const velocityMinKey = `drumEuclid${laneNum}VelocityMin` as keyof typeof state;
          const velocityMaxKey = `drumEuclid${laneNum}VelocityMax` as keyof typeof state;
          const isEnabled = state[enabledKey] as boolean;
          const preset = state[presetKey] as string;
          const steps = state[stepsKey] as number;
          const hits = state[hitsKey] as number;
          const rotation = state[rotationKey] as number;
          const legacyTargetKey = `drumEuclid${laneNum}Target` as keyof typeof state;
          const legacyTarget = (state as any)[legacyTargetKey] as string | undefined;
          const voiceToggles: Record<string, boolean> = { sub: (state[targetSubKey] as boolean | undefined) ?? (legacyTarget === 'sub'), kick: (state[targetKickKey] as boolean | undefined) ?? (legacyTarget === 'kick'), click: (state[targetClickKey] as boolean | undefined) ?? (legacyTarget === 'click'), beepHi: (state[targetBeepHiKey] as boolean | undefined) ?? (legacyTarget === 'beepHi'), beepLo: (state[targetBeepLoKey] as boolean | undefined) ?? (legacyTarget === 'beepLo'), noise: (state[targetNoiseKey] as boolean | undefined) ?? (legacyTarget === 'noise') };
          const voiceKeyMap: Record<string, keyof typeof state> = { sub: targetSubKey, kick: targetKickKey, click: targetClickKey, beepHi: targetBeepHiKey, beepLo: targetBeepLoKey, noise: targetNoiseKey };
          const probability = state[probabilityKey] as number;
          const velocityMin = state[velocityMinKey] as number;
          const velocityMax = state[velocityMaxKey] as number;
          const isVelocityDual = velocityMin !== velocityMax;
          const presetData: Record<string, { steps: number; hits: number; rotation: number }> = { sparse: { steps: 16, hits: 1, rotation: 0 }, dense: { steps: 8, hits: 7, rotation: 0 }, longSparse: { steps: 32, hits: 3, rotation: 0 }, poly3v4: { steps: 12, hits: 3, rotation: 0 }, poly4v3: { steps: 12, hits: 4, rotation: 0 }, poly5v4: { steps: 20, hits: 5, rotation: 0 }, lancaran: { steps: 16, hits: 4, rotation: 0 }, ketawang: { steps: 16, hits: 2, rotation: 0 }, ladrang: { steps: 32, hits: 8, rotation: 0 }, gangsaran: { steps: 8, hits: 4, rotation: 0 }, kotekan: { steps: 8, hits: 3, rotation: 1 }, kotekan2: { steps: 8, hits: 3, rotation: 4 }, srepegan: { steps: 16, hits: 6, rotation: 2 }, sampak: { steps: 8, hits: 5, rotation: 0 }, ayak: { steps: 16, hits: 3, rotation: 4 }, bonang: { steps: 12, hits: 5, rotation: 2 }, tresillo: { steps: 8, hits: 3, rotation: 0 }, cinquillo: { steps: 8, hits: 5, rotation: 0 }, rumba: { steps: 16, hits: 5, rotation: 0 }, bossa: { steps: 16, hits: 5, rotation: 3 }, son: { steps: 16, hits: 7, rotation: 0 }, shiko: { steps: 16, hits: 5, rotation: 0 }, soukous: { steps: 12, hits: 7, rotation: 0 }, gahu: { steps: 16, hits: 7, rotation: 0 }, bembe: { steps: 12, hits: 7, rotation: 0 }, clapping: { steps: 12, hits: 8, rotation: 0 }, clappingB: { steps: 12, hits: 8, rotation: 5 }, additive7: { steps: 7, hits: 4, rotation: 0 }, additive11: { steps: 11, hits: 5, rotation: 0 }, additive13: { steps: 13, hits: 5, rotation: 0 }, reich18: { steps: 12, hits: 7, rotation: 3 }, drumming: { steps: 8, hits: 6, rotation: 1 } };
          const patternSteps = preset === 'custom' ? steps : (presetData[preset]?.steps || 16);
          const patternHits = preset === 'custom' ? hits : (presetData[preset]?.hits || 4);
          const baseRotation = preset === 'custom' ? 0 : (presetData[preset]?.rotation || 0);
          const patternRotation = (baseRotation + rotation) % patternSteps;
          const generatePattern = (s: number, h: number, r: number): boolean[] => { const pattern: boolean[] = []; if (h === 0) { for (let i = 0; i < s; i++) pattern.push(false); } else if (h >= s) { for (let i = 0; i < s; i++) pattern.push(true); } else { let groups: number[][] = []; for (let i = 0; i < h; i++) groups.push([1]); for (let i = 0; i < s - h; i++) groups.push([0]); while (groups.length > 1) { const ones = groups.filter(g => g[0] === 1); const zeros = groups.filter(g => g[0] === 0); if (zeros.length === 0) break; const combined: number[][] = []; const minLen = Math.min(ones.length, zeros.length); for (let i = 0; i < minLen; i++) combined.push([...ones[i], ...zeros[i]]); const remainder = ones.length > zeros.length ? ones.slice(minLen) : zeros.slice(minLen); if (remainder.length === 0 || remainder.length === groups.length - minLen) { groups = [...combined, ...remainder]; break; } groups = [...combined, ...remainder]; } for (const g of groups) for (const v of g) pattern.push(v === 1); } return [...pattern.slice(r % pattern.length), ...pattern.slice(0, r % pattern.length)]; };
          const pattern = generatePattern(patternSteps, patternHits, patternRotation);
          return (
            <CollapsiblePanel id="drumEuclid3" title={`⬡ Euclidean Lane 3 ${isEnabled ? `• ${voiceOrder.filter(v => voiceToggles[v]).map(v => voiceIcons[v]).join('')} ${patternHits}/${patternSteps}` : '(off)'}`} isMobile={isMobile} isExpanded={expandedPanels.has('drumEuclid3')} onToggle={togglePanel} titleStyle={{ color: laneColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><button onClick={() => handleSelectChange(enabledKey, !isEnabled)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: isEnabled ? laneColor : 'rgba(255, 255, 255, 0.1)', color: isEnabled ? 'white' : '#9ca3af', transition: 'all 0.2s' }}>{isEnabled ? '● Lane Active' : '○ Lane Off'}</button></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '8px', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4 }}>{pattern.map((hit, i) => (<div key={i} style={{ width: patternSteps > 16 ? '8px' : '12px', height: patternSteps > 16 ? '8px' : '12px', borderRadius: '50%', background: hit ? laneColor : 'rgba(255,255,255,0.15)', boxShadow: hit ? `0 0 6px ${laneColor}` : 'none' }} />))}</div>
              <select value={preset} onChange={(e) => handleSelectChange(presetKey, e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${laneColor}40`, background: 'rgba(0,0,0,0.4)', color: '#eee', cursor: 'pointer', fontSize: '0.75rem', marginBottom: '6px' }}><optgroup label="Polyrhythmic"><option value="sparse">Sparse (16/1)</option><option value="dense">Dense (8/7)</option><option value="longSparse">Long Sparse (32/3)</option><option value="poly3v4">3 vs 4 (12/3)</option><option value="poly4v3">4 vs 3 (12/4)</option><option value="poly5v4">5 vs 4 (20/5)</option></optgroup><optgroup label="Gamelan"><option value="lancaran">Lancaran (16/4)</option><option value="ketawang">Ketawang (16/2)</option><option value="ladrang">Ladrang (32/8)</option><option value="gangsaran">Gangsaran (8/4)</option><option value="kotekan">Kotekan A (8/3)</option><option value="kotekan2">Kotekan B (8/3)</option><option value="srepegan">Srepegan (16/6)</option><option value="sampak">Sampak (8/5)</option><option value="ayak">Ayak (16/3)</option><option value="bonang">Bonang (12/5)</option></optgroup><optgroup label="World"><option value="tresillo">Tresillo (8/3)</option><option value="cinquillo">Cinquillo (8/5)</option><option value="rumba">Rumba (16/5)</option><option value="bossa">Bossa Nova (16/5)</option><option value="son">Son Clave (16/7)</option><option value="shiko">Shiko (16/5)</option><option value="soukous">Soukous (12/7)</option><option value="gahu">Gahu (16/7)</option><option value="bembe">Bembé (12/7)</option></optgroup><optgroup label="Experimental"><option value="clapping">Clapping Music (12/8)</option><option value="clappingB">Clapping B (12/8)</option><option value="additive7">Additive 7 (7/4)</option><option value="additive11">Additive 11 (11/5)</option><option value="additive13">Additive 13 (13/5)</option><option value="reich18">Reich 18 (12/7)</option><option value="drumming">Drumming (8/6)</option></optgroup><option value="custom">Custom</option></select>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', justifyContent: 'space-between' }}>{voiceOrder.map(voice => { const isOn = voiceToggles[voice]; return (<button key={voice} onClick={() => handleSelectChange(voiceKeyMap[voice], !isOn)} title={voiceNames[voice]} style={{ flex: 1, padding: '6px 2px', borderRadius: '4px', border: isOn ? `2px solid ${laneColor}` : '1px solid #444', background: isOn ? `${laneColor}40` : 'rgba(0,0,0,0.3)', color: isOn ? laneColor : '#666', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>{voiceIcons[voice]}</button>); })}</div>
              {preset === 'custom' && (<div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}><div style={{ flex: 1 }}><Slider label="Steps" value={steps} paramKey={stepsKey} onChange={handleSliderChange} {...sliderProps(stepsKey)} /></div><div style={{ flex: 1 }}><Slider label="Hits" value={hits} paramKey={hitsKey} onChange={handleSliderChange} {...sliderProps(hitsKey)} /></div></div>)}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><div style={{ flex: 1 }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Probability {Math.round(probability * 100)}%</div><input type="range" min="0" max="1" step="0.05" value={probability} onChange={(e) => handleSliderChange(probabilityKey as keyof SliderState, parseFloat(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} /></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Rotate: {rotation}</div><div style={{ display: 'flex', gap: '4px' }}><button onClick={() => handleSliderChange(rotationKey as keyof SliderState, (rotation + 1) % patternSteps)} style={{ padding: '4px 8px', background: `${laneColor}30`, border: `1px solid ${laneColor}60`, borderRadius: '4px', color: laneColor, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>←</button><button onClick={() => handleSliderChange(rotationKey as keyof SliderState, (rotation - 1 + patternSteps) % patternSteps)} style={{ padding: '4px 8px', background: `${laneColor}30`, border: `1px solid ${laneColor}60`, borderRadius: '4px', color: laneColor, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>→</button></div></div></div>
              <div style={{ marginTop: '8px' }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Level {isVelocityDual ? <span style={{ color: laneColor }}>{Math.round(velocityMin * 100)}–{Math.round(velocityMax * 100)}%</span> : `${Math.round(velocityMin * 100)}%`}{isVelocityDual && <span style={{ color: laneColor, marginLeft: '4px', fontSize: '0.6rem' }}>{TEXT_SYMBOLS.range} range</span>}</div><input type="range" min="0" max="1" step="0.05" value={velocityMin} onChange={(e) => { const val = parseFloat(e.target.value); handleSliderChange(velocityMinKey as keyof SliderState, val); handleSliderChange(velocityMaxKey as keyof SliderState, val); }} onDoubleClick={() => { handleSliderChange(velocityMinKey as keyof SliderState, Math.max(0, velocityMin - 0.1)); handleSliderChange(velocityMaxKey as keyof SliderState, Math.min(1, velocityMin + 0.1)); }} {...createLongPressHandlers(() => { handleSliderChange(velocityMinKey as keyof SliderState, Math.max(0, velocityMin - 0.1)); handleSliderChange(velocityMaxKey as keyof SliderState, Math.min(1, velocityMin + 0.1)); })} style={{ width: '100%', cursor: 'pointer' }} title="Double-click or long-press for range mode" /></div>
            </CollapsiblePanel>
          );
        })()}

        {/* Euclidean Lane 4 */}
        {(() => {
          const laneNum = 4;
          const laneColor = '#8b5cf6';
          const voiceIcons: Record<string, string> = { sub: '◉', kick: '●', click: '▪', beepHi: '△', beepLo: '▽', noise: '≋' };
          const voiceNames: Record<string, string> = { sub: 'Sub (Deep Pulse)', kick: 'Kick (Punch)', click: 'Click (Data)', beepHi: 'Beep Hi (Ping)', beepLo: 'Beep Lo (Blip)', noise: 'Noise (Hi-Hat)' };
          const voiceOrder = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'] as const;
          const enabledKey = `drumEuclid${laneNum}Enabled` as keyof typeof state;
          const presetKey = `drumEuclid${laneNum}Preset` as keyof typeof state;
          const stepsKey = `drumEuclid${laneNum}Steps` as keyof typeof state;
          const hitsKey = `drumEuclid${laneNum}Hits` as keyof typeof state;
          const rotationKey = `drumEuclid${laneNum}Rotation` as keyof typeof state;
          const targetSubKey = `drumEuclid${laneNum}TargetSub` as keyof typeof state;
          const targetKickKey = `drumEuclid${laneNum}TargetKick` as keyof typeof state;
          const targetClickKey = `drumEuclid${laneNum}TargetClick` as keyof typeof state;
          const targetBeepHiKey = `drumEuclid${laneNum}TargetBeepHi` as keyof typeof state;
          const targetBeepLoKey = `drumEuclid${laneNum}TargetBeepLo` as keyof typeof state;
          const targetNoiseKey = `drumEuclid${laneNum}TargetNoise` as keyof typeof state;
          const probabilityKey = `drumEuclid${laneNum}Probability` as keyof typeof state;
          const velocityMinKey = `drumEuclid${laneNum}VelocityMin` as keyof typeof state;
          const velocityMaxKey = `drumEuclid${laneNum}VelocityMax` as keyof typeof state;
          const isEnabled = state[enabledKey] as boolean;
          const preset = state[presetKey] as string;
          const steps = state[stepsKey] as number;
          const hits = state[hitsKey] as number;
          const rotation = state[rotationKey] as number;
          const legacyTargetKey = `drumEuclid${laneNum}Target` as keyof typeof state;
          const legacyTarget = (state as any)[legacyTargetKey] as string | undefined;
          const voiceToggles: Record<string, boolean> = { sub: (state[targetSubKey] as boolean | undefined) ?? (legacyTarget === 'sub'), kick: (state[targetKickKey] as boolean | undefined) ?? (legacyTarget === 'kick'), click: (state[targetClickKey] as boolean | undefined) ?? (legacyTarget === 'click'), beepHi: (state[targetBeepHiKey] as boolean | undefined) ?? (legacyTarget === 'beepHi'), beepLo: (state[targetBeepLoKey] as boolean | undefined) ?? (legacyTarget === 'beepLo'), noise: (state[targetNoiseKey] as boolean | undefined) ?? (legacyTarget === 'noise') };
          const voiceKeyMap: Record<string, keyof typeof state> = { sub: targetSubKey, kick: targetKickKey, click: targetClickKey, beepHi: targetBeepHiKey, beepLo: targetBeepLoKey, noise: targetNoiseKey };
          const probability = state[probabilityKey] as number;
          const velocityMin = state[velocityMinKey] as number;
          const velocityMax = state[velocityMaxKey] as number;
          const isVelocityDual = velocityMin !== velocityMax;
          const presetData: Record<string, { steps: number; hits: number; rotation: number }> = { sparse: { steps: 16, hits: 1, rotation: 0 }, dense: { steps: 8, hits: 7, rotation: 0 }, longSparse: { steps: 32, hits: 3, rotation: 0 }, poly3v4: { steps: 12, hits: 3, rotation: 0 }, poly4v3: { steps: 12, hits: 4, rotation: 0 }, poly5v4: { steps: 20, hits: 5, rotation: 0 }, lancaran: { steps: 16, hits: 4, rotation: 0 }, ketawang: { steps: 16, hits: 2, rotation: 0 }, ladrang: { steps: 32, hits: 8, rotation: 0 }, gangsaran: { steps: 8, hits: 4, rotation: 0 }, kotekan: { steps: 8, hits: 3, rotation: 1 }, kotekan2: { steps: 8, hits: 3, rotation: 4 }, srepegan: { steps: 16, hits: 6, rotation: 2 }, sampak: { steps: 8, hits: 5, rotation: 0 }, ayak: { steps: 16, hits: 3, rotation: 4 }, bonang: { steps: 12, hits: 5, rotation: 2 }, tresillo: { steps: 8, hits: 3, rotation: 0 }, cinquillo: { steps: 8, hits: 5, rotation: 0 }, rumba: { steps: 16, hits: 5, rotation: 0 }, bossa: { steps: 16, hits: 5, rotation: 3 }, son: { steps: 16, hits: 7, rotation: 0 }, shiko: { steps: 16, hits: 5, rotation: 0 }, soukous: { steps: 12, hits: 7, rotation: 0 }, gahu: { steps: 16, hits: 7, rotation: 0 }, bembe: { steps: 12, hits: 7, rotation: 0 }, clapping: { steps: 12, hits: 8, rotation: 0 }, clappingB: { steps: 12, hits: 8, rotation: 5 }, additive7: { steps: 7, hits: 4, rotation: 0 }, additive11: { steps: 11, hits: 5, rotation: 0 }, additive13: { steps: 13, hits: 5, rotation: 0 }, reich18: { steps: 12, hits: 7, rotation: 3 }, drumming: { steps: 8, hits: 6, rotation: 1 } };
          const patternSteps = preset === 'custom' ? steps : (presetData[preset]?.steps || 16);
          const patternHits = preset === 'custom' ? hits : (presetData[preset]?.hits || 4);
          const baseRotation = preset === 'custom' ? 0 : (presetData[preset]?.rotation || 0);
          const patternRotation = (baseRotation + rotation) % patternSteps;
          const generatePattern = (s: number, h: number, r: number): boolean[] => { const pattern: boolean[] = []; if (h === 0) { for (let i = 0; i < s; i++) pattern.push(false); } else if (h >= s) { for (let i = 0; i < s; i++) pattern.push(true); } else { let groups: number[][] = []; for (let i = 0; i < h; i++) groups.push([1]); for (let i = 0; i < s - h; i++) groups.push([0]); while (groups.length > 1) { const ones = groups.filter(g => g[0] === 1); const zeros = groups.filter(g => g[0] === 0); if (zeros.length === 0) break; const combined: number[][] = []; const minLen = Math.min(ones.length, zeros.length); for (let i = 0; i < minLen; i++) combined.push([...ones[i], ...zeros[i]]); const remainder = ones.length > zeros.length ? ones.slice(minLen) : zeros.slice(minLen); if (remainder.length === 0 || remainder.length === groups.length - minLen) { groups = [...combined, ...remainder]; break; } groups = [...combined, ...remainder]; } for (const g of groups) for (const v of g) pattern.push(v === 1); } return [...pattern.slice(r % pattern.length), ...pattern.slice(0, r % pattern.length)]; };
          const pattern = generatePattern(patternSteps, patternHits, patternRotation);
          return (
            <CollapsiblePanel id="drumEuclid4" title={`⬡ Euclidean Lane 4 ${isEnabled ? `• ${voiceOrder.filter(v => voiceToggles[v]).map(v => voiceIcons[v]).join('')} ${patternHits}/${patternSteps}` : '(off)'}`} isMobile={isMobile} isExpanded={expandedPanels.has('drumEuclid4')} onToggle={togglePanel} titleStyle={{ color: laneColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><button onClick={() => handleSelectChange(enabledKey, !isEnabled)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: isEnabled ? laneColor : 'rgba(255, 255, 255, 0.1)', color: isEnabled ? 'white' : '#9ca3af', transition: 'all 0.2s' }}>{isEnabled ? '● Lane Active' : '○ Lane Off'}</button></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '8px', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4 }}>{pattern.map((hit, i) => (<div key={i} style={{ width: patternSteps > 16 ? '8px' : '12px', height: patternSteps > 16 ? '8px' : '12px', borderRadius: '50%', background: hit ? laneColor : 'rgba(255,255,255,0.15)', boxShadow: hit ? `0 0 6px ${laneColor}` : 'none' }} />))}</div>
              <select value={preset} onChange={(e) => handleSelectChange(presetKey, e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${laneColor}40`, background: 'rgba(0,0,0,0.4)', color: '#eee', cursor: 'pointer', fontSize: '0.75rem', marginBottom: '6px' }}><optgroup label="Polyrhythmic"><option value="sparse">Sparse (16/1)</option><option value="dense">Dense (8/7)</option><option value="longSparse">Long Sparse (32/3)</option><option value="poly3v4">3 vs 4 (12/3)</option><option value="poly4v3">4 vs 3 (12/4)</option><option value="poly5v4">5 vs 4 (20/5)</option></optgroup><optgroup label="Gamelan"><option value="lancaran">Lancaran (16/4)</option><option value="ketawang">Ketawang (16/2)</option><option value="ladrang">Ladrang (32/8)</option><option value="gangsaran">Gangsaran (8/4)</option><option value="kotekan">Kotekan A (8/3)</option><option value="kotekan2">Kotekan B (8/3)</option><option value="srepegan">Srepegan (16/6)</option><option value="sampak">Sampak (8/5)</option><option value="ayak">Ayak (16/3)</option><option value="bonang">Bonang (12/5)</option></optgroup><optgroup label="World"><option value="tresillo">Tresillo (8/3)</option><option value="cinquillo">Cinquillo (8/5)</option><option value="rumba">Rumba (16/5)</option><option value="bossa">Bossa Nova (16/5)</option><option value="son">Son Clave (16/7)</option><option value="shiko">Shiko (16/5)</option><option value="soukous">Soukous (12/7)</option><option value="gahu">Gahu (16/7)</option><option value="bembe">Bembé (12/7)</option></optgroup><optgroup label="Experimental"><option value="clapping">Clapping Music (12/8)</option><option value="clappingB">Clapping B (12/8)</option><option value="additive7">Additive 7 (7/4)</option><option value="additive11">Additive 11 (11/5)</option><option value="additive13">Additive 13 (13/5)</option><option value="reich18">Reich 18 (12/7)</option><option value="drumming">Drumming (8/6)</option></optgroup><option value="custom">Custom</option></select>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', justifyContent: 'space-between' }}>{voiceOrder.map(voice => { const isOn = voiceToggles[voice]; return (<button key={voice} onClick={() => handleSelectChange(voiceKeyMap[voice], !isOn)} title={voiceNames[voice]} style={{ flex: 1, padding: '6px 2px', borderRadius: '4px', border: isOn ? `2px solid ${laneColor}` : '1px solid #444', background: isOn ? `${laneColor}40` : 'rgba(0,0,0,0.3)', color: isOn ? laneColor : '#666', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>{voiceIcons[voice]}</button>); })}</div>
              {preset === 'custom' && (<div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}><div style={{ flex: 1 }}><Slider label="Steps" value={steps} paramKey={stepsKey} onChange={handleSliderChange} {...sliderProps(stepsKey)} /></div><div style={{ flex: 1 }}><Slider label="Hits" value={hits} paramKey={hitsKey} onChange={handleSliderChange} {...sliderProps(hitsKey)} /></div></div>)}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><div style={{ flex: 1 }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Probability {Math.round(probability * 100)}%</div><input type="range" min="0" max="1" step="0.05" value={probability} onChange={(e) => handleSliderChange(probabilityKey as keyof SliderState, parseFloat(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} /></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Rotate: {rotation}</div><div style={{ display: 'flex', gap: '4px' }}><button onClick={() => handleSliderChange(rotationKey as keyof SliderState, (rotation + 1) % patternSteps)} style={{ padding: '4px 8px', background: `${laneColor}30`, border: `1px solid ${laneColor}60`, borderRadius: '4px', color: laneColor, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>←</button><button onClick={() => handleSliderChange(rotationKey as keyof SliderState, (rotation - 1 + patternSteps) % patternSteps)} style={{ padding: '4px 8px', background: `${laneColor}30`, border: `1px solid ${laneColor}60`, borderRadius: '4px', color: laneColor, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>→</button></div></div></div>
              <div style={{ marginTop: '8px' }}><div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>Level {isVelocityDual ? <span style={{ color: laneColor }}>{Math.round(velocityMin * 100)}–{Math.round(velocityMax * 100)}%</span> : `${Math.round(velocityMin * 100)}%`}{isVelocityDual && <span style={{ color: laneColor, marginLeft: '4px', fontSize: '0.6rem' }}>{TEXT_SYMBOLS.range} range</span>}</div><input type="range" min="0" max="1" step="0.05" value={velocityMin} onChange={(e) => { const val = parseFloat(e.target.value); handleSliderChange(velocityMinKey as keyof SliderState, val); handleSliderChange(velocityMaxKey as keyof SliderState, val); }} onDoubleClick={() => { handleSliderChange(velocityMinKey as keyof SliderState, Math.max(0, velocityMin - 0.1)); handleSliderChange(velocityMaxKey as keyof SliderState, Math.min(1, velocityMin + 0.1)); }} {...createLongPressHandlers(() => { handleSliderChange(velocityMinKey as keyof SliderState, Math.max(0, velocityMin - 0.1)); handleSliderChange(velocityMaxKey as keyof SliderState, Math.min(1, velocityMin + 0.1)); })} style={{ width: '100%', cursor: 'pointer' }} title="Double-click or long-press for range mode" /></div>
            </CollapsiblePanel>
          );
        })()}
        </>)}
      </div>

      {/* Debug Panel */}
      <div style={styles.debugPanel}>
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
