/**
 * Earth Page — Pure UI for Soundscapes (Water + Ocean + Insects)
 *
 * No audio code — all synthesis runs in the main engine (engine.ts).
 * State flows through SliderState; props follow the same pattern as
 * SynthPage / DrumPage / LooperPage.
 *
 * Layout: Left = Sound-engine controls, Right = Mixer
 */

import React, { useState, useCallback, useMemo } from 'react';
import './earth.css';import { DualSlider, type DualSliderRange } from '../DualSlider';
import type { SliderState, SliderMode } from '../state';
import { QUANTIZATION } from '../state';
import {
  WATER_PRESETS, INSECT_ENGINES,
  LAYER_KEYS, LAYER_LABELS,
  type LayerKey,
} from '../../audio/waterPresets';

// ═══ Props ═══

export interface EarthPageProps {
  state: SliderState;
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
  isRunning: boolean;
}

// ═══ Helpers ═══

/** Map LayerKey → SliderState key */
const LAYER_STATE_KEY: Record<LayerKey, keyof SliderState> = {
  hardDrops: 'waterLayerHardDrops',
  waterDrops: 'waterLayerWaterDrops',
  turbulence: 'waterLayerTurbulence',
  bubbling: 'waterLayerBubbling',
  roar: 'waterLayerRoar',
  rivulets: 'waterLayerRivulets',
};

/** All earth dual-slider keys — used to check if any is in walk mode */
const EARTH_DUAL_KEYS: readonly (keyof SliderState)[] = [
  'waterMorph',
  'waterIntensity', 'waterRate', 'waterDistance', 'waterDropSize',
  'waterHardness', 'waterGlassThickness', 'waterBaseFreq', 'waterSpace',
  'oceanWaveSynthLevel', 'oceanDuration', 'oceanInterval', 'oceanFoam', 'oceanDepth',
  'insectsDensity', 'insectsTemperature', 'insectsDistance', 'insectsProximity',
  'insectsAntiphony', 'insectsClickRate', 'insectsMotion',
  'insects2Density', 'insects2Temperature', 'insects2Distance', 'insects2Proximity',
  'insects2Antiphony', 'insects2ClickRate', 'insects2Motion',
  'waterLevel', 'insectsLevel', 'insects2Level',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerRoar', 'waterLayerRivulets',
] as const;

function quantize(key: string, v: number): number {
  const q = (QUANTIZATION as Record<string, { min: number; max: number; step: number }>)[key];
  if (!q) return v;
  const clamped = Math.max(q.min, Math.min(q.max, v));
  return q.min + Math.round((clamped - q.min) / q.step) * q.step;
}

// ═══ Component ═══

export default function EarthPage({
  state, onParamChange, onSelectChange, sliderProps, isRunning: _isRunning,
}: EarthPageProps) {

  // ── Local UI state ──
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(['water']),
  );

  const toggleCard = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Show walk-speed control when any earth slider is in walk mode
  const anyWalkMode = useMemo(
    () => EARTH_DUAL_KEYS.some(k => sliderProps(k).mode === 'walk'),
    [sliderProps],
  );

  // ── DualSlider helper ──
  function ds(
    key: keyof SliderState,
    label: string,
    fillColor: string,
    opts?: { format?: (v: number) => string },
  ) {
    const sp = sliderProps(key);
    const q = (QUANTIZATION as Record<string, { min: number; max: number; step: number }>)[key as string];
    if (!q) return null;
    return (
      <DualSlider<keyof SliderState>
        label={label}
        value={state[key] as number}
        paramKey={key}
        paramInfo={q}
        quantizeFn={(_, v) => quantize(key as string, v)}
        mode={sp.mode}
        dualRange={sp.dualRange}
        walkPosition={sp.walkPosition}
        isFlashing={sp.isFlashing}
        onChange={onParamChange}
        onCycleMode={sp.onCycleMode}
        onDualRangeChange={sp.onDualRangeChange}
        groupClassName="param-row"
        labelClassName="param-label"
        sliderClassName="param-slider"
        fillColor={fillColor}
        format={opts?.format}
      />
    );
  }

  // ════════════════════════════════════════════
  // JSX
  // ════════════════════════════════════════════
  return (
    <div className="earth-root">
      <div className="container">

        {/* ════ LEFT: Sound Engine Controls ════ */}
        <div className="sound-panel">

          {/* ─── Water Engine Card ─── */}
          <div
            className={`earth-card${expandedCards.has('water') ? ' expanded' : ''}`}
            style={{ '--sc': '#4a9eff' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('water')}>
              <span className="ec-name">Water Engine</span>
              <span className="ec-chevron">{expandedCards.has('water') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('water') && (
              <div className="earth-card-body">
                {/* Morph row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <select
                    className="earth-select"
                    style={{ flex: '0 0 auto', width: 100 }}
                    value={state.waterMorphA}
                    onChange={e =>
                      onSelectChange('waterMorphA', Number(e.target.value) as SliderState['waterMorphA'])
                    }
                  >
                    {WATER_PRESETS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>

                  <div style={{ flex: 1 }}>
                    {ds('waterMorph', 'Morph', 'rgba(74,158,255,0.5)')}
                  </div>

                  <select
                    className="earth-select"
                    style={{ flex: '0 0 auto', width: 100 }}
                    value={state.waterMorphB}
                    onChange={e =>
                      onSelectChange('waterMorphB', Number(e.target.value) as SliderState['waterMorphB'])
                    }
                  >
                    {WATER_PRESETS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>

                {ds('waterIntensity', 'Intensity', 'rgba(74,158,255,0.5)')}
                {ds('waterRate', 'Rate', 'rgba(74,158,255,0.5)')}
                {ds('waterDistance', 'Distance', 'rgba(74,158,255,0.5)')}
                {ds('waterDropSize', 'Drop Size', 'rgba(74,158,255,0.5)')}
                {ds('waterHardness', 'Hardness', 'rgba(74,158,255,0.5)')}
                {ds('waterGlassThickness', 'Glass', 'rgba(74,158,255,0.5)')}
                {ds('waterBaseFreq', 'Base Freq', 'rgba(74,158,255,0.5)', {
                  format: v => `${Math.round(v)} Hz`,
                })}
                {ds('waterSpace', 'Reverb Send', 'rgba(139,92,246,0.5)')}
              </div>
            )}
          </div>

          {/* ─── Ocean Waves Card ─── */}
          <div
            className={`earth-card${expandedCards.has('ocean') ? ' expanded' : ''}`}
            style={{ '--sc': '#00d4ff' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('ocean')}>
              <span className="ec-name">Ocean Waves</span>
              <span className="ec-chevron">{expandedCards.has('ocean') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('ocean') && (
              <div className="earth-card-body">
                {/* Wave Sample toggle + level (at top) */}
                <div className="layer-row" style={{ marginBottom: 10 }}>
                  <button
                    className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
                    onClick={() =>
                      onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)
                    }
                    title={state.oceanSampleEnabled ? 'Disable Wave Sample' : 'Enable Wave Sample'}
                  >
                    {state.oceanSampleEnabled ? '●' : '○'}
                  </button>
                  <span className="layer-label" style={{ minWidth: 100 }}>Wave Sample</span>
                  <span className="layer-value">
                    {state.oceanSampleEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                {ds('oceanSampleLevel', 'Wave Sample Level', 'rgba(0,212,255,0.5)')}

                {/* Wave Synth toggle */}
                <div className="layer-row" style={{ marginBottom: 10, marginTop: 12 }}>
                  <button
                    className={`layer-toggle ${state.oceanWaveSynthEnabled ? 'on' : ''}`}
                    onClick={() =>
                      onSelectChange('oceanWaveSynthEnabled', !state.oceanWaveSynthEnabled)
                    }
                    title={state.oceanWaveSynthEnabled ? 'Disable Wave Synth' : 'Enable Wave Synth'}
                  >
                    {state.oceanWaveSynthEnabled ? '●' : '○'}
                  </button>
                  <span className="layer-label" style={{ minWidth: 100 }}>Wave Synthesis</span>
                  <span className="layer-value">
                    {state.oceanWaveSynthEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                {/* Wave Synth parameters — only rendered when synthesis is enabled */}
                {state.oceanWaveSynthEnabled && (<>
                  {ds('oceanWaveSynthLevel', 'Wave Synth Level', 'rgba(0,212,255,0.5)')}

                  <div style={{ marginTop: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Wave Timing</span>
                  </div>
                  {ds('oceanDuration', 'Duration', 'rgba(0,212,255,0.5)', {
                    format: v => `${v.toFixed(1)} s`,
                  })}
                  {ds('oceanInterval', 'Interval', 'rgba(0,212,255,0.5)', {
                    format: v => `${v.toFixed(1)} s`,
                  })}

                  <div style={{ marginTop: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Wave Character
                    </span>
                  </div>
                  {ds('oceanFoam', 'Foam', 'rgba(0,212,255,0.5)')}
                  {ds('oceanDepth', 'Depth', 'rgba(0,212,255,0.5)')}
                </>)}

                {/* Ocean Filter — shared by both sample and synth, always visible */}
                <div style={{ marginTop: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Ocean Filter
                  </span>
                </div>
                <div className="param-row">
                  <span className="param-label">Filter Type</span>
                  <select
                    className="earth-select"
                    value={state.oceanFilterType}
                    onChange={e =>
                      onSelectChange(
                        'oceanFilterType',
                        e.target.value as SliderState['oceanFilterType'],
                      )
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="lowpass">Lowpass (Warm)</option>
                    <option value="bandpass">Bandpass (Focused)</option>
                    <option value="highpass">Highpass (Airy)</option>
                    <option value="notch">Notch (Scoop)</option>
                  </select>
                  <span className="param-value">&nbsp;</span>
                </div>

                <ParamSlider
                  label="Filter Cutoff"
                  value={state.oceanFilterCutoff}
                  min={40} max={12000} step={10}
                  onChange={v => onParamChange('oceanFilterCutoff', v)}
                  format={v => `${Math.round(v)} Hz`}
                />
                <ParamSlider
                  label="Filter Resonance"
                  value={state.oceanFilterResonance}
                  onChange={v => onParamChange('oceanFilterResonance', v)}
                />
              </div>
            )}
          </div>

          {/* ─── Insects Layer 1 Card ─── */}
          <div
            className={`earth-card${expandedCards.has('insects1') ? ' expanded' : ''}`}
            style={{ '--sc': '#2ecc71' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('insects1')}>
              <span className="ec-name">Insects — Layer 1</span>
              <span className="ec-chevron">{expandedCards.has('insects1') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('insects1') && (
              <div className="earth-card-body">
                <select
                  className="earth-select"
                  value={state.insectsEngine}
                  onChange={e =>
                    onSelectChange(
                      'insectsEngine',
                      Number(e.target.value) as SliderState['insectsEngine'],
                    )
                  }
                >
                  {INSECT_ENGINES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>

                {ds('insectsDensity', 'Density', 'rgba(46,204,113,0.5)')}
                {ds('insectsTemperature', 'Temperature', 'rgba(46,204,113,0.5)')}
                {ds('insectsDistance', 'Distance', 'rgba(46,204,113,0.5)')}
                {ds('insectsProximity', 'Proximity', 'rgba(46,204,113,0.5)')}
                {ds('insectsAntiphony', 'Antiphony', 'rgba(46,204,113,0.5)')}
                {ds('insectsClickRate', 'Click Rate', 'rgba(46,204,113,0.5)')}
                {ds('insectsMotion', 'Motion', 'rgba(46,204,113,0.5)')}
              </div>
            )}
          </div>

          {/* ─── Insects Layer 2 Card ─── */}
          <div
            className={`earth-card${expandedCards.has('insects2') ? ' expanded' : ''}`}
            style={{ '--sc': '#27ae60' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('insects2')}>
              <span className="ec-name">Insects — Layer 2</span>
              <span className="ec-chevron">{expandedCards.has('insects2') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('insects2') && (
              <div className="earth-card-body">
                <select
                  className="earth-select"
                  value={state.insects2Engine}
                  onChange={e =>
                    onSelectChange(
                      'insects2Engine',
                      Number(e.target.value) as SliderState['insects2Engine'],
                    )
                  }
                >
                  {INSECT_ENGINES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>

                {ds('insects2Density', 'Density', 'rgba(39,174,96,0.5)')}
                {ds('insects2Temperature', 'Temperature', 'rgba(39,174,96,0.5)')}
                {ds('insects2Distance', 'Distance', 'rgba(39,174,96,0.5)')}
                {ds('insects2Proximity', 'Proximity', 'rgba(39,174,96,0.5)')}
                {ds('insects2Antiphony', 'Antiphony', 'rgba(39,174,96,0.5)')}
                {ds('insects2ClickRate', 'Click Rate', 'rgba(39,174,96,0.5)')}
                {ds('insects2Motion', 'Motion', 'rgba(39,174,96,0.5)')}
              </div>
            )}
          </div>

          {/* ─── Walk Speed (shown when any earth slider is in walk mode) ─── */}
          {anyWalkMode && (
            <div
              className="earth-card"
              style={{ '--sc': '#a5c4d4', padding: '8px 12px' } as React.CSSProperties}
            >
              <ParamSlider
                label="Walk Speed"
                value={state.randomWalkSpeed}
                min={0.1} max={5} step={0.1}
                onChange={v => onParamChange('randomWalkSpeed', v)}
                format={v => v.toFixed(1)}
                labelColor="#a5c4d4"
              />
            </div>
          )}
        </div>

        {/* ════ RIGHT: Mixer ════ */}
        <div className="mixer-panel">

          {/* Water Layers */}
          <div className="mixer-section">
            <div className="mixer-section-header">Water Layers</div>
            <div className="mixer-section-body">
              {LAYER_KEYS.map(key => {
                const stateKey = LAYER_STATE_KEY[key];
                const level = state[stateKey] as number;
                return (
                  <div
                    key={key}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}
                  >
                    <button
                      className={`layer-toggle ${level > 0.01 ? 'on' : ''}`}
                      onClick={() => onParamChange(stateKey, level > 0.01 ? 0 : 0.5)}
                      title={level > 0.01 ? 'Mute layer' : 'Unmute layer'}
                    >
                      {level > 0.01 ? '●' : '○'}
                    </button>
                    {ds(stateKey, LAYER_LABELS[key], 'rgba(74,158,255,0.5)')}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Earth Mixer */}
          <div className="mixer-section">
            <div className="mixer-section-header">Earth Mixer</div>
            <div className="mixer-section-body">
              {/* Water */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.waterEnabled ? 'on' : ''}`}
                  onClick={() => onSelectChange('waterEnabled', !state.waterEnabled)}
                  title={state.waterEnabled ? 'Disable Water' : 'Enable Water'}
                >
                  {state.waterEnabled ? '●' : '○'}
                </button>
                {ds('waterLevel', 'Water', 'rgba(74,158,255,0.5)')}
              </div>

              {/* Wave Synthesis */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.oceanWaveSynthEnabled ? 'on' : ''}`}
                  onClick={() =>
                    onSelectChange('oceanWaveSynthEnabled', !state.oceanWaveSynthEnabled)
                  }
                  title={state.oceanWaveSynthEnabled ? 'Disable Wave Synthesis' : 'Enable Wave Synthesis'}
                >
                  {state.oceanWaveSynthEnabled ? '●' : '○'}
                </button>
                {ds('oceanWaveSynthLevel', 'Wave Synthesis', 'rgba(0,212,255,0.5)')}
              </div>

              {/* Ghetary Waves */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
                  onClick={() =>
                    onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)
                  }
                  title={state.oceanSampleEnabled ? 'Disable Ghetary Waves' : 'Enable Ghetary Waves'}
                >
                  {state.oceanSampleEnabled ? '●' : '○'}
                </button>
                {ds('oceanSampleLevel', 'Ghetary Waves', 'rgba(0,212,255,0.5)')}
              </div>

              {/* Insect 1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.insectsEnabled ? 'on' : ''}`}
                  onClick={() => onSelectChange('insectsEnabled', !state.insectsEnabled)}
                  title={state.insectsEnabled ? 'Disable Insect 1' : 'Enable Insect 1'}
                >
                  {state.insectsEnabled ? '●' : '○'}
                </button>
                {ds('insectsLevel', 'Insect 1', 'rgba(46,204,113,0.5)')}
              </div>

              {/* Insect 2 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.insects2Enabled ? 'on' : ''}`}
                  onClick={() => onSelectChange('insects2Enabled', !state.insects2Enabled)}
                  title={state.insects2Enabled ? 'Disable Insect 2' : 'Enable Insect 2'}
                >
                  {state.insects2Enabled ? '●' : '○'}
                </button>
                {ds('insects2Level', 'Insect 2', 'rgba(39,174,96,0.5)')}
              </div>

              <div className="section-divider" />

              {/* Reverb Sends */}
              {ds('oceanReverbSend', 'Waves Reverb', 'rgba(139,92,246,0.5)')}
              {ds('waterSpace', 'Water Reverb', 'rgba(139,92,246,0.5)')}
              {ds('insectsReverbSend', 'Insect Reverb', 'rgba(139,92,246,0.5)')}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ═══ Sub-Components ═══

interface ParamSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  labelColor?: string;
}

function ParamSlider({
  label, value, min = 0, max = 1, step = 0.01, onChange, format, labelColor,
}: ParamSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="param-row">
      <span
        className="param-label"
        style={labelColor ? { color: labelColor } : undefined}
      >
        {label}
      </span>
      <input
        className="param-slider"
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, rgba(165,196,212,0.5) 0%, rgba(165,196,212,0.5) ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`,
        }}
      />
      <span className="param-value">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}
