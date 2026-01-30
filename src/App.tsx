/**
 * Main App Component
 * 
 * Complete UI with all sliders, selects, and debug panel.
 * Wires up to audio engine with deterministic state management.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SliderState,
  DEFAULT_STATE,
  quantize,
  decodeStateFromUrl,
  getParamInfo,
} from './ui/state';
import { audioEngine, EngineState } from './audio/engine';
import { SCALE_FAMILIES } from './audio/scales';
import { formatChordDegrees, getTimeUntilNextPhrase } from './audio/harmony';
import SnowflakeUI from './ui/SnowflakeUI';

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
const connectMediaSessionToWebAudio = () => {
  if (!mediaSessionAudio) return;
  
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
    color: '#a5c4d4',
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
          style={styles.slider}
          title="Double-click for range mode"
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
        title="Double-click for single value mode"
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
  isMobile: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  id,
  title,
  titleColor,
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
          ...(isMobile ? {
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none' as const,
          } : {}),
        }}
        onClick={isMobile ? () => onToggle(id) : undefined}
      >
        <span>{title}</span>
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
  });

  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<number | null>(null);
  
  // Saved presets list - start empty, load from folder on mount
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [showPresetList, setShowPresetList] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(true);
  
  // UI mode: 'snowflake' or 'advanced'
  const [uiMode, setUiMode] = useState<'snowflake' | 'advanced'>('snowflake');

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

  // Dual slider state - tracks which sliders are in dual mode and their ranges
  const [dualSliderModes, setDualSliderModes] = useState<Set<keyof SliderState>>(new Set());
  const [dualSliderRanges, setDualSliderRanges] = useState<DualSliderState>({});
  const [randomWalkPositions, setRandomWalkPositions] = useState<Record<string, number>>({});
  const randomWalkRef = useRef<RandomWalkStates>({});

  // Toggle dual slider mode for a parameter
  const handleToggleDualMode = useCallback((key: keyof SliderState) => {
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
          // Initialize random walk with random starting position
          randomWalkRef.current[key] = {
            position: Math.random(),
            velocity: (Math.random() - 0.5) * 0.02,
          };
          setRandomWalkPositions(p => ({ ...p, [key]: randomWalkRef.current[key]!.position }));
        }
      }
      return next;
    });
  }, [dualSliderRanges, randomWalkPositions, state]);

  // Update dual slider range
  const handleDualRangeChange = useCallback((key: keyof SliderState, min: number, max: number) => {
    setDualSliderRanges(prev => ({ ...prev, [key]: { min, max } }));
  }, []);

  // Random walk animation
  useEffect(() => {
    if (dualSliderModes.size === 0) return;

    const animate = () => {
      const speed = state.randomWalkSpeed;
      const updates: Record<string, number> = {};
      let hasUpdates = false;

      dualSliderModes.forEach(key => {
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
        
        // Update actual parameter values for the audio engine
        setState(prev => {
          const newState = { ...prev };
          dualSliderModes.forEach(key => {
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
  }, [dualSliderModes, dualSliderRanges, state.randomWalkSpeed]);

  // Load presets from folder on mount
  useEffect(() => {
    loadPresetsFromFolder().then((presets) => {
      setSavedPresets(presets);
      setPresetsLoading(false);
    });
  }, []);

  // Engine state callback
  useEffect(() => {
    audioEngine.setStateChangeCallback(setEngineState);
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

  // Update engine when state changes
  useEffect(() => {
    if (engineState.isRunning) {
      audioEngine.updateParams(state);
    }
  }, [state, engineState.isRunning]);

  // Handle slider change
  const handleSliderChange = useCallback((key: keyof SliderState, value: number) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Helper to create slider props with dual mode support
  const sliderProps = useCallback((paramKey: keyof SliderState): {
    isDualMode: boolean;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    onToggleDual: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  } => ({
    isDualMode: dualSliderModes.has(paramKey),
    dualRange: dualSliderRanges[paramKey],
    walkPosition: randomWalkPositions[paramKey],
    onToggleDual: handleToggleDualMode,
    onDualRangeChange: handleDualRangeChange,
  }), [dualSliderModes, dualSliderRanges, randomWalkPositions, handleToggleDualMode, handleDualRangeChange]);

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
    } catch (err) {
      console.error('Failed to start audio:', err);
      alert(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}\n\nCheck console for details.`);
    }
  };

  const handleStop = () => {
    stopIOSMediaSession();
    audioEngine.stop();
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

  // Load preset from list
  const handleLoadPresetFromList = (preset: SavedPreset) => {
    const newState = { ...DEFAULT_STATE, ...preset.state };
    setState(newState);
    audioEngine.updateParams(newState);
    
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
    
    setShowPresetList(false);
  };

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
        const preset = JSON.parse(e.target?.result as string);
        if (preset.state) {
          // Merge with defaults to handle missing keys
          const newState = { ...DEFAULT_STATE, ...preset.state };
          setState(newState);
          audioEngine.updateParams(newState);
          
          // Restore dual slider state if present
          if (preset.dualRanges && Object.keys(preset.dualRanges).length > 0) {
            const newDualModes = new Set<keyof SliderState>();
            const newDualRanges: DualSliderState = {};
            const newWalkPositions: Record<string, number> = {};
            
            Object.entries(preset.dualRanges).forEach(([key, range]) => {
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
          
          // Add to preset list for display
          const importedPreset: SavedPreset = {
            name: preset.name || file.name.replace('.json', ''),
            timestamp: preset.timestamp || new Date().toISOString(),
            state: newState,
            dualRanges: preset.dualRanges,
          };
          setSavedPresets([...savedPresets, importedPreset]);
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

  // Render snowflake UI
  if (uiMode === 'snowflake') {
    return (
      <SnowflakeUI
        state={state}
        onChange={handleSliderChange}
        onShowAdvanced={() => setUiMode('advanced')}
        onTogglePlay={engineState.isRunning ? handleStop : handleStart}
        onLoadPreset={handleLoadPresetFromList}
        presets={savedPresets}
        isPlaying={engineState.isRunning}
      />
    );
  }

  // Render advanced UI
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Kessho</h1>
        <p style={styles.subtitle}>
          Auditory Snowflakes
        </p>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {!engineState.isRunning ? (
          <button
            style={{ ...styles.iconButton, ...styles.startButton }}
            onClick={handleStart}
            title="Start"
          >
            ▶
          </button>
        ) : (
          <button
            style={{ ...styles.iconButton, ...styles.stopButton }}
            onClick={handleStop}
            title="Stop"
          >
            ■
          </button>
        )}
        <button
          style={{ ...styles.iconButton, ...styles.presetButton }}
          onClick={handleSavePreset}
          title="Save Preset"
        >
          ⬇
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.presetButton }}
          onClick={() => fileInputRef.current?.click()}
          title="Import Preset"
        >
          ⬆
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.presetButton }}
          onClick={() => setShowPresetList(!showPresetList)}
          title={showPresetList ? 'Hide Presets' : 'Load Preset'}
        >
          ⬡{savedPresets.length > 0 && <span style={styles.badge}>{savedPresets.length}</span>}
        </button>
        <button
          style={{ ...styles.iconButton, ...styles.simpleButton }}
          onClick={() => setUiMode('snowflake')}
          title="Simple Mode"
        >
          ✲
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

      {/* Parameter Grid */}
      <div style={styles.grid}>
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
          <Select
            label="Seed Window"
            value={state.seedWindow}
            options={[
              { value: 'hour', label: 'Hour (changes hourly)' },
              { value: 'day', label: 'Day (changes daily)' },
            ]}
            onChange={(v) => handleSelectChange('seedWindow', v)}
          />
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
        </CollapsiblePanel>

        {/* Harmony */}
        <CollapsiblePanel
          id="harmony"
          title="Harmony / Pitch"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('harmony')}
          onToggle={togglePanel}
        >
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
              options={SCALE_FAMILIES.map((s) => ({ value: s.name, label: s.name }))}
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
        </CollapsiblePanel>

        {/* Timbre */}
        <CollapsiblePanel
          id="timbre"
          title="Timbre"
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

        {/* Space */}
        <CollapsiblePanel
          id="space"
          title="Space (Reverb)"
          isMobile={isMobile}
          isExpanded={expandedPanels.has('space')}
          onToggle={togglePanel}
        >
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
                  const totalTime = state.leadAttack + state.leadDecay + 0.5 + state.leadRelease;
                  const aEnd = (state.leadAttack / totalTime) * 100;
                  const dEnd = ((state.leadAttack + state.leadDecay) / totalTime) * 100;
                  const sEnd = ((state.leadAttack + state.leadDecay + 0.5) / totalTime) * 100;
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

          {/* Delay Section */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px' }}>Delay Effect</div>
            <Slider
              label="Delay Time"
              value={state.leadDelayTime}
              paramKey="leadDelayTime"
              unit="ms"
              onChange={handleSliderChange}
            />
            <Slider
              label="Delay Feedback"
              value={state.leadDelayFeedback}
              paramKey="leadDelayFeedback"
              onChange={handleSliderChange}
            />
            <Slider
              label="Delay Mix"
              value={state.leadDelayMix}
              paramKey="leadDelayMix"
              onChange={handleSliderChange}
            />
          </div>

          {/* Euclidean Polyrhythm Sequencer Section */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px' }}>Euclidean Polyrhythm Sequencer</div>
            
            {/* Master Enable toggle */}
            <div style={styles.sliderGroup}>
              <div style={styles.sliderLabel}>
                <span>Sequencer Mode</span>
                <span style={{ 
                  color: state.leadEuclideanMasterEnabled ? '#8b5cf6' : '#6b7280',
                  fontWeight: 'bold'
                }}>
                  {state.leadEuclideanMasterEnabled ? 'EUCLIDEAN' : 'RANDOM'}
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
                {state.leadEuclideanMasterEnabled ? '● Polyrhythmic Patterns' : '○ Random Notes'}
              </button>
            </div>

            {/* Tempo control (always visible when enabled) */}
            {state.leadEuclideanMasterEnabled && (
              <>
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
                  
                  const isEnabled = state[enabledKey] as boolean;
                  const preset = state[presetKey] as string;
                  const steps = state[stepsKey] as number;
                  const hits = state[hitsKey] as number;
                  const rotation = state[rotationKey] as number;
                  const noteMin = state[noteMinKey] as number;
                  const noteMax = state[noteMaxKey] as number;
                  const level = state[levelKey] as number;

                  // Get root note from state (0=C, 1=C#, ..., 4=E, ..., 11=B)
                  // Root at octave 2: C2=36, so rootMidi = 36 + rootNote
                  const rootMidi = 36 + state.rootNote;
                  
                  // Helper to convert MIDI note to name relative to root
                  const midiToNoteName = (midi: number): string => {
                    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const noteInOctave = midi % 12;
                    const noteName = noteNames[noteInOctave];
                    // Calculate octave relative to root (root2 = 0, root3 = 1, etc.)
                    const octaveFromRoot = Math.floor((midi - rootMidi) / 12);
                    return `${noteName}${octaveFromRoot}`;
                  };
                  
                  // Get octave markers based on root note (root3, root4, root5, root6)
                  const rootOctaveMarkers = [rootMidi + 12, rootMidi + 24, rootMidi + 36, rootMidi + 48];

                  // Generate pattern for visualization
                  const presetData: Record<string, { steps: number; hits: number; rotation: number }> = {
                    // Gamelan
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
                    // Reich / Minimalist
                    clapping: { steps: 12, hits: 8, rotation: 0 },
                    clappingB: { steps: 12, hits: 8, rotation: 5 },
                    poly3v4: { steps: 12, hits: 3, rotation: 0 },
                    poly4v3: { steps: 12, hits: 4, rotation: 0 },
                    poly5v4: { steps: 20, hits: 5, rotation: 0 },
                    additive7: { steps: 7, hits: 4, rotation: 0 },
                    additive11: { steps: 11, hits: 5, rotation: 0 },
                    additive13: { steps: 13, hits: 5, rotation: 0 },
                    reich18: { steps: 12, hits: 7, rotation: 3 },
                    drumming: { steps: 8, hits: 6, rotation: 1 },
                    // Polyrhythmic
                    sparse: { steps: 16, hits: 1, rotation: 0 },
                    dense: { steps: 8, hits: 7, rotation: 0 },
                    longSparse: { steps: 32, hits: 3, rotation: 0 },
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
                            <optgroup label="Gamelan">
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
                            <optgroup label="Reich / Minimalist">
                              <option value="clapping">Clapping Music (12/8)</option>
                              <option value="clappingB">Clapping B (12/8 r:5)</option>
                              <option value="poly3v4">3 vs 4 (12/3)</option>
                              <option value="poly4v3">4 vs 3 (12/4)</option>
                              <option value="poly5v4">5 vs 4 (20/5)</option>
                              <option value="additive7">Additive 7 (7/4)</option>
                              <option value="additive11">Additive 11 (11/5)</option>
                              <option value="additive13">Additive 13 (13/5)</option>
                              <option value="reich18">Reich 18 (12/7)</option>
                              <option value="drumming">Drumming (8/6)</option>
                            </optgroup>
                            <optgroup label="Polyrhythmic">
                              <option value="sparse">Sparse (16/1)</option>
                              <option value="dense">Dense (8/7)</option>
                              <option value="longSparse">Long Sparse (32/3)</option>
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
              </>
            )}
          </div>
        </CollapsiblePanel>

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

          <Slider
            label="Sample Level"
            value={state.oceanSampleLevel}
            paramKey="oceanSampleLevel"
            onChange={handleSliderChange}
            {...sliderProps('oceanSampleLevel')}
          />

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
              <Slider
                label="Duration Min"
                value={state.oceanDurationMin}
                paramKey="oceanDurationMin"
                unit="s"
                onChange={handleSliderChange}
                {...sliderProps('oceanDurationMin')}
              />
              <Slider
                label="Duration Max"
                value={state.oceanDurationMax}
                paramKey="oceanDurationMax"
                unit="s"
                onChange={handleSliderChange}
                {...sliderProps('oceanDurationMax')}
              />
              <Slider
                label="Interval Min"
                value={state.oceanIntervalMin}
                paramKey="oceanIntervalMin"
                unit="s"
                onChange={handleSliderChange}
                {...sliderProps('oceanIntervalMin')}
              />
              <Slider
                label="Interval Max"
                value={state.oceanIntervalMax}
                paramKey="oceanIntervalMax"
                unit="s"
                onChange={handleSliderChange}
                {...sliderProps('oceanIntervalMax')}
              />

              {/* Wave Character */}
              <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Wave Character</span>
              </div>
              <Slider
                label="Foam Min"
                value={state.oceanFoamMin}
                paramKey="oceanFoamMin"
                onChange={handleSliderChange}
                {...sliderProps('oceanFoamMin')}
              />
              <Slider
                label="Foam Max"
                value={state.oceanFoamMax}
                paramKey="oceanFoamMax"
                onChange={handleSliderChange}
                {...sliderProps('oceanFoamMax')}
              />
              <Slider
                label="Depth Min"
                value={state.oceanDepthMin}
                paramKey="oceanDepthMin"
                onChange={handleSliderChange}
                {...sliderProps('oceanDepthMin')}
              />
              <Slider
                label="Depth Max"
                value={state.oceanDepthMax}
                paramKey="oceanDepthMax"
                onChange={handleSliderChange}
                {...sliderProps('oceanDepthMax')}
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
            {engineState.harmonyState?.scaleFamily.name || '—'}
          </span>
        </div>
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
      </div>
    </div>
  );
};

export default App;
