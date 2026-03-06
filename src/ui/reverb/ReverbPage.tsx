/**
 * ReverbPage — Two-card layout for reverb controls
 *
 * Left card  : Core reverb (Active, Engine, Type, Quality, Decay, Size, Diffusion)
 * Right card : Mod & Character (Presets, Modulation, Pre-delay, Damping, Width,
 *              Shimmer, Slow Mod, Reverse, Freeze)
 *
 * Follows SynthPage / EarthPage / LooperPage pattern: dedicated component with
 * own CSS, receives SliderComponent, SelectComponent, sliderProps, onParamChange
 * as props from App.tsx.
 */

import React, { useState, useCallback } from 'react';
import type { SliderState, SliderMode } from '../state';
import type { DualSliderRange } from '../DualSlider';
import './reverb.css';

// ═══ Reverb Character Presets ═══

export const REVERB_CHARACTER_PRESETS: Record<string, {
  label: string;
  description: string;
  params: Partial<SliderState>;
}> = {
  default: {
    label: 'Default',
    description: 'Clean ambient cathedral',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.9, reverbSize: 2.0, reverbDiffusion: 1.0, reverbModulation: 0.4,
      predelay: 60, damping: 0.2, width: 0.85,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.5, reverbChorusDepth: 12,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.3, reverbCrossoverFreq: 800,
      reverbInputTone: 0, reverbShimmerFeedback: 0,
    },
  },
  shimmerPad: {
    label: 'Shimmer Pad',
    description: 'Octave-up shimmer with long decay and compound feedback',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.95, reverbSize: 2.5, reverbDiffusion: 0.95, reverbModulation: 0.5,
      predelay: 40, damping: 0.15, width: 0.95,
      reverbShimmer: 0.45, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.03, reverbSlowModDepth: 0.2,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.7, reverbChorusDepth: 18,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.2, reverbCrossoverFreq: 1200,
      reverbInputTone: 0.2, reverbShimmerFeedback: 0.35,
    },
  },
  blackhole: {
    label: 'Blackhole',
    description: 'Massive infinite-like space with drift modulation + dark tone',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.98, reverbSize: 3.0, reverbDiffusion: 1.0, reverbModulation: 0.65,
      predelay: 80, damping: 0.08, width: 1.0,
      reverbShimmer: 0.3, reverbShimmerPitch: 5,
      reverbSlowModRate: 0.02, reverbSlowModDepth: 0.7,
      reverbFreeze: false, reverbReverse: 0.4, reverbReverseLength: 3.5,
      reverbChorusRate: 0.3, reverbChorusDepth: 30,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.15, reverbCrossoverFreq: 600,
      reverbInputTone: -0.4, reverbShimmerFeedback: 0.5,
    },
  },
  nightsky: {
    label: 'Nightsky',
    description: 'Warm drifting reverb with organic modulation and subtle shimmer',
    params: {
      reverbType: 'darkHall' as SliderState['reverbType'],
      reverbDecay: 0.92, reverbSize: 2.0, reverbDiffusion: 0.85, reverbModulation: 0.55,
      predelay: 50, damping: 0.35, width: 0.9,
      reverbShimmer: 0.2, reverbShimmerPitch: 7,
      reverbSlowModRate: 0.04, reverbSlowModDepth: 0.6,
      reverbFreeze: false, reverbReverse: 0.15, reverbReverseLength: 2.5,
      reverbChorusRate: 0.4, reverbChorusDepth: 20,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.15, reverbDampHigh: 0.45, reverbCrossoverFreq: 700,
      reverbInputTone: -0.3, reverbShimmerFeedback: 0.2,
    },
  },
  frozenCathedral: {
    label: 'Frozen Cathedral',
    description: 'Infinite sustain with wide stereo and gentle chorus',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 1.0, reverbSize: 3.0, reverbDiffusion: 1.0, reverbModulation: 0.3,
      predelay: 100, damping: 0.05, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: true, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.8, reverbChorusDepth: 15,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.0, reverbDampHigh: 0.05, reverbCrossoverFreq: 1000,
      reverbInputTone: 0.1, reverbShimmerFeedback: 0,
    },
  },
  reverseWash: {
    label: 'Reverse Wash',
    description: 'Heavy reverse tail with drift modulation for swell effects',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.88, reverbSize: 1.8, reverbDiffusion: 0.9, reverbModulation: 0.4,
      predelay: 30, damping: 0.25, width: 0.85,
      reverbShimmer: 0.15, reverbShimmerPitch: -12,
      reverbSlowModRate: 0.06, reverbSlowModDepth: 0.3,
      reverbFreeze: false, reverbReverse: 0.7, reverbReverseLength: 2.0,
      reverbChorusRate: 0.6, reverbChorusDepth: 25,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.35, reverbCrossoverFreq: 900,
      reverbInputTone: -0.2, reverbShimmerFeedback: 0.15,
    },
  },
  cosmicDrift: {
    label: 'Cosmic Drift',
    description: 'Deep slow-breathing space with compound shimmer and dark tone',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.94, reverbSize: 2.8, reverbDiffusion: 0.92, reverbModulation: 0.7,
      predelay: 70, damping: 0.12, width: 1.0,
      reverbShimmer: 0.35, reverbShimmerPitch: 19,
      reverbSlowModRate: 0.015, reverbSlowModDepth: 0.85,
      reverbFreeze: false, reverbReverse: 0.25, reverbReverseLength: 3.0,
      reverbChorusRate: 0.25, reverbChorusDepth: 35,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.2, reverbCrossoverFreq: 500,
      reverbInputTone: -0.5, reverbShimmerFeedback: 0.6,
    },
  },
  tightPlate: {
    label: 'Tight Plate',
    description: 'Short bright plate — no effects',
    params: {
      reverbType: 'plate' as SliderState['reverbType'],
      reverbDecay: 0.5, reverbSize: 0.7, reverbDiffusion: 0.7, reverbModulation: 0.15,
      predelay: 10, damping: 0.4, width: 0.6,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 1.2, reverbChorusDepth: 5,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.2, reverbDampHigh: 0.5, reverbCrossoverFreq: 2000,
      reverbInputTone: 0.3, reverbShimmerFeedback: 0,
    },
  },
};

// ═══ Props ═══

export interface ReverbPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  };
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  SelectComponent: React.ComponentType<Record<string, unknown>>;
}

// ═══ Component ═══

export default function ReverbPage({
  state,
  isMobile: _isMobile,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent,
  SelectComponent,
}: ReverbPageProps) {
  // Local expand/collapse state for cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(['core', 'mod']),
  );

  const toggleCard = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Cast components so TS allows our props
  const Slider = SliderComponent as React.ComponentType<{
    label: string;
    value: number;
    paramKey: keyof SliderState;
    unit?: string;
    onChange: (key: keyof SliderState, value: number) => void;
    mode?: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode?: (key: keyof SliderState) => void;
    onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
  }>;

  const Select = SelectComponent as React.ComponentType<{
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }>;

  // Helper to spread slider props
  function sp(key: keyof SliderState) {
    return sliderProps(key);
  }

  return (
    <div className="reverb-root">
      <div className="reverb-container">

        {/* ════ LEFT: Core Reverb ════ */}
        <div className="reverb-left">
          <div
            className={`reverb-card${expandedCards.has('core') ? ' expanded' : ''}`}
            style={{ '--sc': '#8b5cf6' } as React.CSSProperties}
          >
            <div className="reverb-card-header" onClick={() => toggleCard('core')}>
              <span className="rc-name">Reverb</span>
              <span className="rc-chevron">{expandedCards.has('core') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('core') && (
              <div className="reverb-card-body">
                {/* Active toggle */}
                <div className="app-slider-group" style={{ marginBottom: 10 }}>
                  <div className="app-slider-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: 4 }}>
                    <span>Reverb</span>
                    <span style={{
                      color: state.reverbEnabled ? '#10b981' : '#6b7280',
                      fontWeight: 'bold',
                    }}>
                      {state.reverbEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <button
                    className={`reverb-toggle ${state.reverbEnabled ? 'active' : 'inactive'}`}
                    onClick={() => onSelectChange('reverbEnabled', !state.reverbEnabled)}
                  >
                    {state.reverbEnabled ? '● Active' : '○ Bypassed (saves CPU)'}
                  </button>
                </div>

                <Select
                  label="Engine"
                  value={state.reverbEngine}
                  options={[
                    { value: 'algorithmic', label: 'Algorithmic' },
                    { value: 'convolution', label: 'Convolution (HQ)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbEngine', v as SliderState['reverbEngine'])}
                />
                <Select
                  label="Type"
                  value={state.reverbType}
                  options={[
                    { value: 'plate', label: 'Plate' },
                    { value: 'hall', label: 'Hall' },
                    { value: 'cathedral', label: 'Cathedral' },
                    { value: 'darkHall', label: 'Dark Hall' },
                  ]}
                  onChange={(v) => onSelectChange('reverbType', v as SliderState['reverbType'])}
                />
                <Select
                  label="Quality"
                  value={state.reverbQuality}
                  options={[
                    { value: 'ultra', label: 'Ultra (16-ch FDN + mid diffusion)' },
                    { value: 'balanced', label: 'Balanced (8-ch FDN)' },
                    { value: 'lite', label: 'Lite (4-ch, saves CPU)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbQuality', v as SliderState['reverbQuality'])}
                />

                <Slider label="Decay" value={state.reverbDecay} paramKey="reverbDecay" onChange={onParamChange} {...sp('reverbDecay')} />
                <Slider label="Size" value={state.reverbSize} paramKey="reverbSize" onChange={onParamChange} {...sp('reverbSize')} />
                <Slider label="Diffusion" value={state.reverbDiffusion} paramKey="reverbDiffusion" onChange={onParamChange} {...sp('reverbDiffusion')} />
              </div>
            )}
          </div>
        </div>

        {/* ════ RIGHT: Mod & Character ════ */}
        <div className="reverb-right">
          <div
            className={`reverb-card${expandedCards.has('mod') ? ' expanded' : ''}`}
            style={{ '--sc': '#f59e0b' } as React.CSSProperties}
          >
            <div className="reverb-card-header" onClick={() => toggleCard('mod')}>
              <span className="rc-name">Mod &amp; Character</span>
              <span className="rc-chevron">{expandedCards.has('mod') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('mod') && (
              <div className="reverb-card-body">
                {/* Character Presets */}
                <div style={{ marginBottom: 10 }}>
                  <div className="reverb-subsection" style={{ marginTop: 0 }}>Character Preset</div>
                  <div className="reverb-preset-grid">
                    {Object.entries(REVERB_CHARACTER_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        className="reverb-preset-btn"
                        title={preset.description}
                        onClick={() => {
                          for (const [k, v] of Object.entries(preset.params)) {
                            onSelectChange(k as keyof SliderState, v as SliderState[keyof SliderState]);
                          }
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Core mod params */}
                <Slider label="Modulation" value={state.reverbModulation} paramKey="reverbModulation" onChange={onParamChange} {...sp('reverbModulation')} />
                <Slider label="Pre-delay" value={state.predelay} paramKey="predelay" unit="ms" onChange={onParamChange} {...sp('predelay')} />
                <Slider label="Damping" value={state.damping} paramKey="damping" onChange={onParamChange} {...sp('damping')} />
                <Slider label="Width" value={state.width} paramKey="width" onChange={onParamChange} {...sp('width')} />

                {/* Shimmer */}
                <div className="reverb-subsection">Shimmer</div>
                <Slider label="Shimmer" value={state.reverbShimmer} paramKey="reverbShimmer" onChange={onParamChange} {...sp('reverbShimmer')} />
                <Slider label="Shimmer Pitch" value={state.reverbShimmerPitch} paramKey="reverbShimmerPitch" unit="st" onChange={onParamChange} {...sp('reverbShimmerPitch')} />
                <Slider label="Shimmer Feedback" value={state.reverbShimmerFeedback} paramKey="reverbShimmerFeedback" onChange={onParamChange} {...sp('reverbShimmerFeedback')} />

                {/* Chorus & Modulation Character */}
                <div className="reverb-subsection">Chorus &amp; Mod Character</div>
                <Select
                  label="Mod Character"
                  value={state.reverbModCharacter}
                  options={[
                    { value: 'sine', label: 'Sine (smooth)' },
                    { value: 'drift', label: 'Drift (organic)' },
                    { value: 'hybrid', label: 'Hybrid (sine + drift)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbModCharacter', v as SliderState['reverbModCharacter'])}
                />
                <Slider label="Chorus Rate" value={state.reverbChorusRate} paramKey="reverbChorusRate" unit="Hz" onChange={onParamChange} {...sp('reverbChorusRate')} />
                <Slider label="Chorus Depth" value={state.reverbChorusDepth} paramKey="reverbChorusDepth" unit="smp" onChange={onParamChange} {...sp('reverbChorusDepth')} />

                {/* Multi-band Damping */}
                <div className="reverb-subsection">Multi-band Damping</div>
                <Slider label="Damp Low" value={state.reverbDampLow} paramKey="reverbDampLow" onChange={onParamChange} {...sp('reverbDampLow')} />
                <Slider label="Damp High" value={state.reverbDampHigh} paramKey="reverbDampHigh" onChange={onParamChange} {...sp('reverbDampHigh')} />
                <Slider label="Crossover" value={state.reverbCrossoverFreq} paramKey="reverbCrossoverFreq" unit="Hz" onChange={onParamChange} {...sp('reverbCrossoverFreq')} />

                {/* Input Tone */}
                <div className="reverb-subsection">Input Tone</div>
                <Slider label="Tone" value={state.reverbInputTone} paramKey="reverbInputTone" onChange={onParamChange} {...sp('reverbInputTone')} />

                {/* Slow Modulation */}
                <div className="reverb-subsection">Slow Modulation</div>
                <Slider label="Mod Rate" value={state.reverbSlowModRate} paramKey="reverbSlowModRate" unit="Hz" onChange={onParamChange} {...sp('reverbSlowModRate')} />
                <Slider label="Mod Depth" value={state.reverbSlowModDepth} paramKey="reverbSlowModDepth" onChange={onParamChange} {...sp('reverbSlowModDepth')} />

                {/* Reverse */}
                <div className="reverb-subsection">Special</div>
                <Slider label="Reverse Mix" value={state.reverbReverse} paramKey="reverbReverse" onChange={onParamChange} {...sp('reverbReverse')} />
                {state.reverbReverse > 0 && (
                  <Slider label="Reverse Length" value={state.reverbReverseLength} paramKey="reverbReverseLength" unit="s" onChange={onParamChange} {...sp('reverbReverseLength')} />
                )}

                {/* Freeze toggle */}
                <div className="app-slider-group" style={{ marginTop: 8 }}>
                  <div className="app-slider-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: 4 }}>
                    <span>Freeze</span>
                    <span style={{
                      color: state.reverbFreeze ? '#60a5fa' : '#6b7280',
                      fontWeight: 'bold',
                    }}>
                      {state.reverbFreeze ? 'FROZEN' : 'OFF'}
                    </span>
                  </div>
                  <button
                    className={`reverb-toggle ${state.reverbFreeze ? 'freeze-on' : 'freeze-off'}`}
                    onClick={() => onSelectChange('reverbFreeze', !state.reverbFreeze)}
                  >
                    {state.reverbFreeze ? '❄ Infinite Sustain' : '○ Normal Decay'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
