// @ts-nocheck
/**
 * GranularPage — Unified Granular FX UI
 *
 * 4-voice granular-chopper-granular engine with:
 * - Global controls bar (enable, freeze, dry/wet, feedback, preset)
 * - 16-slice buffer visualization with write head + voice position markers
 * - 4 expandable voice cards with mode selection, slice, pitch, grain, LFO controls
 * - Legacy mode support for original granulator compatibility
 *
 * Follows SynthPage/DrumPage pattern: dedicated component with own CSS,
 * receives SliderComponent, sliderProps, onParamChange as props from App.tsx
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SliderState } from '../state';
import { useEuclideanSequencer, type EvolveConfig, type StepOverrides, type SubLaneKind, type SubLaneState } from '../sequencer/useEuclideanSequencer';
import type { ClockDivision } from '../../audio/drumSeqTypes';
import DragNumber from '../drums/DragNumber';
import SeqLane from '../drums/SeqLane';
import SeqSparkline from '../drums/SeqSparkline';
import SeqMiniOverview from '../drums/SeqMiniOverview';
import './granular.css';

// ═══════════════ Types ═══════════════

type VoiceMode = 'clean' | 'granular' | 'legacy';

interface VoicePrefix {
  enabled: keyof SliderState;
  mode: keyof SliderState;
  slice: keyof SliderState;
  speed: keyof SliderState;
  reverse: keyof SliderState;
  pitch: keyof SliderState;
  attack: keyof SliderState;
  decay: keyof SliderState;
  blur: keyof SliderState;
  grainOct: keyof SliderState;
  spray: keyof SliderState;
  density: keyof SliderState;
  grainSize: keyof SliderState;
  pan: keyof SliderState;
  gain: keyof SliderState;
  posLFORate: keyof SliderState;
  posLFODepth: keyof SliderState;
  panLFORate: keyof SliderState;
  stereoSpread: keyof SliderState;
  reverseLFORate: keyof SliderState;
  writeFollow: keyof SliderState;
}

// ═══════════════ Constants ═══════════════

const NUM_SLICES = 16;

const VOICE_COLORS = ['#4a9eff', '#a855f7', '#2ecc71', '#f59e0b'];
const VOICE_NAMES = ['Voice 1', 'Voice 2', 'Voice 3', 'Voice 4'];

const VOICE_KEYS: VoicePrefix[] = [1, 2, 3, 4].map(n => ({
  enabled: `granularV${n}Enabled` as keyof SliderState,
  mode: `granularV${n}Mode` as keyof SliderState,
  slice: `granularV${n}Slice` as keyof SliderState,
  speed: `granularV${n}Speed` as keyof SliderState,
  reverse: `granularV${n}Reverse` as keyof SliderState,
  pitch: `granularV${n}Pitch` as keyof SliderState,
  attack: `granularV${n}Attack` as keyof SliderState,
  decay: `granularV${n}Decay` as keyof SliderState,
  blur: `granularV${n}Blur` as keyof SliderState,
  grainOct: `granularV${n}GrainOct` as keyof SliderState,
  spray: `granularV${n}Spray` as keyof SliderState,
  density: `granularV${n}Density` as keyof SliderState,
  grainSize: `granularV${n}GrainSize` as keyof SliderState,
  pan: `granularV${n}Pan` as keyof SliderState,
  gain: `granularV${n}Gain` as keyof SliderState,
  posLFORate: `granularV${n}PosLFORate` as keyof SliderState,
  posLFODepth: `granularV${n}PosLFODepth` as keyof SliderState,
  panLFORate: `granularV${n}PanLFORate` as keyof SliderState,
  stereoSpread: `granularV${n}StereoSpread` as keyof SliderState,
  reverseLFORate: `granularV${n}ReverseLFORate` as keyof SliderState,
  writeFollow: `granularV${n}WriteFollow` as keyof SliderState,
}));

// Granular presets
const GRANULAR_PRESETS: { id: string; name: string }[] = [
  { id: 'init', name: 'Init' },
  { id: 'legacy_cloud', name: 'Legacy Cloud' },
  { id: 'loop_forest', name: 'Loop Forest' },
  { id: 'mood_slip', name: 'Mood Slip' },
  { id: 'mosaic_shimmer', name: 'Mosaic Shimmer' },
  { id: 'flux_cloud', name: 'Flux Cloud' },
  { id: 'self_generating', name: 'Self-Generating' },
  { id: 'tape_loop', name: 'Tape Loop' },
  { id: 'shimmer_pad', name: 'Shimmer Pad' },
  { id: 'glitch_chop', name: 'Glitch Chop' },
  { id: 'ambient_wash', name: 'Ambient Wash' },
  { id: 'stutter', name: 'Stutter' },
  { id: 'reverse_cloud', name: 'Reverse Cloud' },
  { id: 'drone_freeze', name: 'Drone Freeze' },
  { id: 'polyrhythm', name: 'Polyrhythm' },
  { id: 'scatter', name: 'Scatter' },
  { id: 'warm_delay', name: 'Warm Delay' },
  { id: 'ice_crystals', name: 'Ice Crystals' },
  { id: 'microcosm', name: 'Microcosm' },
];

const GRANULAR_SEQ_LANE_CONFIGS = [
  { color: '#4a9eff', name: 'Seq 1' },
  { color: '#a855f7', name: 'Seq 2' },
  { color: '#2ecc71', name: 'Seq 3' },
  { color: '#f59e0b', name: 'Seq 4' },
];

// ═══════════════ Props ═══════════════

// Note division options for delay time selector
const DELAY_NOTE_OPTIONS: { value: string; label: string }[] = [
  { value: '1/1', label: '1/1' },
  { value: '1/2', label: '1/2' },
  { value: '1/2d', label: '1/2 dotted' },
  { value: '1/4', label: '1/4' },
  { value: '1/4d', label: '1/4 dotted' },
  { value: '1/4t', label: '1/4 triplet' },
  { value: '1/8', label: '1/8' },
  { value: '1/8d', label: '1/8 dotted' },
  { value: '1/8t', label: '1/8 triplet' },
  { value: '1/16', label: '1/16' },
  { value: '1/16d', label: '1/16 dotted' },
  { value: '1/16t', label: '1/16 triplet' },
  { value: '1/32', label: '1/32' },
];

export interface GranularPageProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  /** Write head position 0-1 from engine */
  writeHeadPosition: number;
  /** Per-voice read positions 0-1 from engine (array of 4) */
  voicePositions: number[];
  /** Per-voice trigger overrides from Euclidean subsequencer (slice, pitch, reverse) */
  triggerOverrides?: { sliceOverride?: number; pitchOverride?: number; reverseOverride?: boolean }[];

  // ── Euclidean sequencer props ──
  playheads: number[];
  hitCounts: number[];
  evolveFlashing?: boolean[];
  onEvolveConfigsChange?: (configs: EvolveConfig[]) => void;
  /** Initial evolve configs to restore across tab switches / preset loads */
  initialEvolveConfigs?: EvolveConfig[];
  onStepOverridesChange?: (overrides: StepOverrides) => void;
  initialStepOverrides?: StepOverrides;
  initialSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  onSubLaneStatesChange?: (states: Record<SubLaneKind, SubLaneState>[]) => void;
  initialViewMode?: 'simple' | 'detail' | 'overview';
  onViewModeChange?: (mode: 'simple' | 'detail' | 'overview') => void;
  onClockDivsChange?: (divs: ClockDivision[]) => void;
  onSwingsChange?: (swings: number[]) => void;
  resetEvolveHome?: (laneIdx: number) => void;
  /** Dice: regenerate lane with random values */
  diceLane?: (laneIdx: number, intensity: number) => void;
  /** Evolved step overrides pushed from audio engine (for visual sync) */
  evolvedOverrides?: { laneIndex: number; version: number; data: Partial<StepOverrides> };
  /** Clock divs to apply when a preset is loaded */
  initialClockDivs?: ClockDivision[];
  /** Bumped when a preset is loaded to reset hook state from initial* props */
  presetVersion?: number;
}

// ═══════════════ Component ═══════════════

const GranularPage: React.FC<GranularPageProps> = ({
  state,
  isMobile: _isMobile,
  expandedPanels,
  togglePanel,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent,
  writeHeadPosition,
  voicePositions,
  triggerOverrides,
  playheads,
  hitCounts,
  evolveFlashing,
  onEvolveConfigsChange,
  onStepOverridesChange,
  initialStepOverrides,
  initialSubLaneStates,
  onSubLaneStatesChange,
  initialViewMode,
  onViewModeChange,
  onClockDivsChange,
  onSwingsChange,
  resetEvolveHome,
  diceLane,
  evolvedOverrides,
  initialClockDivs,
  presetVersion,
  initialEvolveConfigs,
}) => {
  const [diceIntensity, setDiceIntensity] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Alias Slider for convenience (it's passed as generic ComponentType)
  const Slider = SliderComponent as React.ComponentType<{
    label: string;
    value: number;
    paramKey: keyof SliderState;
    unit?: string;
    logarithmic?: boolean;
    onChange: (key: keyof SliderState, value: number) => void;
    [key: string]: unknown;
  }>;

  // Which voice cards are expanded for editing
  const [expandedVoices, setExpandedVoices] = useState<Set<number>>(new Set([0]));

  const toggleVoice = (idx: number) => {
    setExpandedVoices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Compute active slices for highlighting (base param + Euclidean override)
  const activeSlices = useMemo(() => {
    const slices = new Set<number>();
    for (let v = 0; v < 4; v++) {
      const keys = VOICE_KEYS[v];
      if (state[keys.enabled]) {
        // If a Euclidean sub-lane is overriding the slice, show that instead
        const ov = triggerOverrides?.[v];
        if (ov?.sliceOverride !== undefined && ov.sliceOverride >= 0) {
          slices.add(ov.sliceOverride);
        } else {
          slices.add(state[keys.slice] as number);
        }
      }
    }
    return slices;
  }, [
    state.granularV1Enabled, state.granularV1Slice,
    state.granularV2Enabled, state.granularV2Slice,
    state.granularV3Enabled, state.granularV3Slice,
    state.granularV4Enabled, state.granularV4Slice,
    triggerOverrides,
  ]);

  // Compute triggered slices from subsequencer overrides (highlighted separately)
  const triggeredSlices = useMemo(() => {
    const slices = new Set<number>();
    if (triggerOverrides) {
      for (let v = 0; v < 4; v++) {
        const ov = triggerOverrides[v];
        if (ov?.sliceOverride !== undefined && ov.sliceOverride >= 0) {
          slices.add(ov.sliceOverride);
        }
      }
    }
    return slices;
  }, [triggerOverrides]);

  // ── Euclidean sequencer hook ──
  const seq = useEuclideanSequencer({
    state,
    onParamChange,
    onSelectChange,
    prefix: 'granular',
    laneCount: 4,
    lanes: GRANULAR_SEQ_LANE_CONFIGS,
    playheads,
    hitCounts,
    evolveFlashing,
    initialViewMode,
    initialStepOverrides,
    initialSubLaneStates,
    initialClockDivs,
    initialEvolveConfigs,
    resetKey: presetVersion,
  });

  const activeSeq = seq.activeSeq;

  // Auto-open corresponding voice panel when switching sequencer tabs
  const prevActiveTabRef = useRef(seq.activeTab);
  useEffect(() => {
    if (prevActiveTabRef.current !== seq.activeTab) {
      prevActiveTabRef.current = seq.activeTab;
      // Expand only the active voice, collapse others
      setExpandedVoices(new Set([seq.activeTab]));
    }
  }, [seq.activeTab]);

  // Notify parent when viewMode changes so it persists across tab switches
  useEffect(() => {
    onViewModeChange?.(seq.viewMode);
  }, [seq.viewMode, onViewModeChange]);

  // Sync evolve configs to audio engine when they change
  const evolveConfigsRef = useRef(seq.evolveConfigs);
  useEffect(() => {
    if (evolveConfigsRef.current !== seq.evolveConfigs) {
      evolveConfigsRef.current = seq.evolveConfigs;
      onEvolveConfigsChange?.(seq.evolveConfigs);
    }
  }, [seq.evolveConfigs, onEvolveConfigsChange]);

  // Merge evolved overrides from audio engine into visualizer state
  const evolvedVersionRef = useRef(-1);
  useEffect(() => {
    if (!evolvedOverrides || evolvedOverrides.version === evolvedVersionRef.current) return;
    evolvedVersionRef.current = evolvedOverrides.version;
    const { laneIndex, data } = evolvedOverrides;
    seq.setStepOverrides(prev => {
      const next = { ...prev };
      const keys = ['expression', 'pitch', 'slice', 'reverse'] as const;
      for (const key of keys) {
        if (data[key] && data[key]![laneIndex] != null) {
          const arr = [...prev[key]];
          arr[laneIndex] = data[key]![laneIndex];
          next[key] = arr;
        }
      }
      return next;
    });
  }, [evolvedOverrides, seq]);

  // Sync step overrides to audio engine when they change
  const stepOverridesRef = useRef(seq.stepOverrides);
  useEffect(() => {
    if (stepOverridesRef.current !== seq.stepOverrides) {
      stepOverridesRef.current = seq.stepOverrides;
      onStepOverridesChange?.(seq.stepOverrides);
    }
  }, [seq.stepOverrides, onStepOverridesChange]);

  // Persist sub-lane states across tab switches
  const subLaneStatesRef = useRef(seq.subLaneStates);
  useEffect(() => {
    if (subLaneStatesRef.current !== seq.subLaneStates) {
      subLaneStatesRef.current = seq.subLaneStates;
      onSubLaneStatesChange?.(seq.subLaneStates);
    }
  }, [seq.subLaneStates, onSubLaneStatesChange]);

  // Sync per-lane clock divisions to audio engine
  const clockDivsRef = useRef(seq.clockDivs);
  useEffect(() => {
    if (clockDivsRef.current !== seq.clockDivs) {
      clockDivsRef.current = seq.clockDivs;
      onClockDivsChange?.(seq.clockDivs);
    }
  }, [seq.clockDivs, onClockDivsChange]);

  // Sync per-lane swing amounts to audio engine
  const swingsRef = useRef(seq.swings);
  useEffect(() => {
    if (swingsRef.current !== seq.swings) {
      swingsRef.current = seq.swings;
      onSwingsChange?.(seq.swings);
    }
  }, [seq.swings, onSwingsChange]);

  return (
    <div className="granular-root">
      <div className="granular-container">

        {/* ═══════════════ SOUND PANEL (left) ═══════════════ */}
        <div className="granular-sound-panel">

          {/* ── Global Controls Bar ── */}
          <div className="granular-global-bar">
            <span className="granular-title">⊞ Granular FX</span>

            <button
              className={`granular-enable-btn${state.granularEnabled ? ' on' : ''}`}
              onClick={() => onSelectChange('granularEnabled' as keyof SliderState, !state.granularEnabled)}
            >
              {state.granularEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              className={`granular-freeze-btn${state.granularFreeze ? ' frozen' : ''}`}
              onClick={() => onSelectChange('granularFreeze' as keyof SliderState, !state.granularFreeze)}
            >
              {state.granularFreeze ? '❄ FROZEN' : '❄ Freeze'}
            </button>

            <select
              className="granular-preset-select"
              value={state.granularPreset}
              onChange={e => onSelectChange('granularPreset' as keyof SliderState, e.target.value)}
            >
              {GRANULAR_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* ── Global Sliders Row ── */}
          <div className="granular-global-sliders">
            <Slider
                label="Granular Level"
                value={state.granularLevel}
                paramKey="granularLevel"
                onChange={onParamChange}
                {...sliderProps('granularLevel')}
              />
              <Slider
                label="Feedback"
                value={state.granularFeedback}
                paramKey={'granularFeedback' as keyof SliderState}
                onChange={onParamChange}
                {...sliderProps('granularFeedback' as keyof SliderState)}
              />
              <Slider
                label="FB LPF"
                value={state.granularFeedbackLPF}
                paramKey={'granularFeedbackLPF' as keyof SliderState}
                unit="Hz"
                onChange={onParamChange}
                {...sliderProps('granularFeedbackLPF' as keyof SliderState)}
              />
              <Slider
                label="Reverb Send"
                value={state.granularReverbSend}
                paramKey="granularReverbSend"
                onChange={onParamChange}
                {...sliderProps('granularReverbSend')}
              />
              <Slider
                label="Reverb LPF"
                value={state.granularReverbLPF}
                paramKey={'granularReverbLPF' as keyof SliderState}
                unit="Hz"
                onChange={onParamChange}
                {...sliderProps('granularReverbLPF' as keyof SliderState)}
              />
              <Slider
                label="Output LPF"
                value={state.granularOutputLPF}
                paramKey={'granularOutputLPF' as keyof SliderState}
                unit="Hz"
                onChange={onParamChange}
                {...sliderProps('granularOutputLPF' as keyof SliderState)}
              />
              <Slider
                label="Chord Bias"
                value={state.granularChordBias}
                paramKey={'granularChordBias' as keyof SliderState}
                onChange={onParamChange}
                {...sliderProps('granularChordBias' as keyof SliderState)}
              />
          </div>

          {/* ── Source Sends ── */}
          <div className="granular-source-sends">
            <span className="granular-sends-label">Input Sources</span>
            <div className="granular-sends-sliders">
              <Slider label="Pad 1" value={state.granularPad1Send} paramKey={'granularPad1Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularPad1Send' as keyof SliderState)} />
              <Slider label="Pad 2" value={state.granularPad2Send} paramKey={'granularPad2Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularPad2Send' as keyof SliderState)} />
              <Slider label="Lead 1" value={state.granularLead1Send} paramKey={'granularLead1Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLead1Send' as keyof SliderState)} />
              <Slider label="Lead 2" value={state.granularLead2Send} paramKey={'granularLead2Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLead2Send' as keyof SliderState)} />
              <Slider label="Drums" value={state.granularDrumSend} paramKey={'granularDrumSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDrumSend' as keyof SliderState)} />
              <Slider label="Waves" value={state.granularWavesSend} paramKey={'granularWavesSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularWavesSend' as keyof SliderState)} />
            </div>
          </div>

          {/* ── Buffer Visualization ── */}
          <div className="granular-buffer-viz">
            <div className="granular-buffer-slices">
              {Array.from({ length: NUM_SLICES }, (_, i) => {
                // Determine which voices are assigned to this slice
                const voicesOnSlice: number[] = [];
                for (let v = 0; v < 4; v++) {
                  if (state[VOICE_KEYS[v].enabled] && (state[VOICE_KEYS[v].slice] as number) === i) {
                    voicesOnSlice.push(v);
                  }
                }
                return (
                  <div
                    key={i}
                    className={`granular-slice${activeSlices.has(i) ? ' active' : ''}${triggeredSlices.has(i) ? ' triggered' : ''}`}
                    title={`Slice ${i + 1}${voicesOnSlice.length > 0 ? ` (V${voicesOnSlice.map(v => v + 1).join('+')})` : ''}`}
                  >
                    <span className="granular-slice-label">{i + 1}</span>
                    {/* Voice color dots for assigned voices */}
                    {voicesOnSlice.length > 0 && (
                      <div className="granular-slice-voice-dots">
                        {voicesOnSlice.map(v => (
                          <span
                            key={v}
                            className="granular-slice-voice-dot"
                            style={{ background: VOICE_COLORS[v] }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Write head position line */}
            <div
              className={`granular-write-head${state.granularFreeze ? ' frozen' : ''}`}
              style={{ left: `${writeHeadPosition * 100}%` }}
            />
            {/* Per-voice read position markers */}
            {[0, 1, 2, 3].map(v => (
              state[VOICE_KEYS[v].enabled] ? (
                <div
                  key={v}
                  className="granular-buffer-voice-marker"
                  style={{
                    left: `${(voicePositions[v] || 0) * 100}%`,
                    background: VOICE_COLORS[v],
                  }}
                >
                  <span className="granular-voice-marker-label">V{v + 1}</span>
                </div>
              ) : null
            ))}
            {/* Time scale ticks — adapt to buffer duration */}
            <div className="granular-buffer-time-ticks">
              {(() => {
                const bs = (state.granularBufferSeconds as number) || 16;
                const ticks = bs <= 4 ? [0, 1, 2, 3, 4] : [0, 4, 8, 12, 16];
                return ticks.map(t => (
                  <span key={t} className="granular-time-tick" style={{ left: `${(t / bs) * 100}%` }}>
                    {t}s
                  </span>
                ));
              })()}
            </div>
          </div>

          {/* ── Macro Sliders ── */}
          <div className="granular-macro-section">
            <div
              className={`section-header${expandedPanels.has('granularMacros') ? '' : ' collapsed'}`}
              onClick={() => togglePanel('granularMacros')}
            >
              <span className="section-header-content">
                Macros
              </span>
            </div>
            <div className={`section-body${expandedPanels.has('granularMacros') ? '' : ' collapsed'}`}>
              <div className="granular-grid-4">
                <Slider
                  label="Texture"
                  value={state.granularMacroTexture ?? 0.3}
                  paramKey={'granularMacroTexture' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroTexture' as keyof SliderState)}
                />
                <Slider
                  label="Complexity"
                  value={state.granularMacroComplexity ?? 0.2}
                  paramKey={'granularMacroComplexity' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroComplexity' as keyof SliderState)}
                />
                <Slider
                  label="Darkness"
                  value={state.granularMacroDarkness ?? 0.3}
                  paramKey={'granularMacroDarkness' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroDarkness' as keyof SliderState)}
                />
                <Slider
                  label="Chaos"
                  value={state.granularMacroChaos ?? 0.1}
                  paramKey={'granularMacroChaos' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroChaos' as keyof SliderState)}
                />
              </div>
            </div>
          </div>

          {/* ── Delay Section (matching DrumPage pattern) ── */}
          <div className="granular-delay-section">
            <div
              className={`section-header${expandedPanels.has('granularDelay') ? '' : ' collapsed'}`}
              onClick={() => togglePanel('granularDelay')}
            >
              <span className="section-header-content">
                Multi-Tap Delay
                <button
                  className={`delay-toggle-btn${state.granularDelayEnabled ? ' on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onSelectChange('granularDelayEnabled' as keyof SliderState, !state.granularDelayEnabled); }}
                >
                  {state.granularDelayEnabled ? 'ON' : 'OFF'}
                </button>
                <span className="delay-bpm-info">@ {state.drumEuclidBaseBPM} BPM</span>
              </span>
            </div>
            <div className={`section-body${expandedPanels.has('granularDelay') ? '' : ' collapsed'}`}>
              {state.granularDelayEnabled && (
                <>
                  <div className="delay-note-row">
                    <div className="delay-note-col">
                      <label>Time</label>
                      <select
                        value={state.granularDelayTime as string}
                        onChange={e => onSelectChange('granularDelayTime' as keyof SliderState, e.target.value)}
                      >
                        {DELAY_NOTE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Slider label="Activity" value={state.granularDelayActivity ?? 0.3} paramKey={'granularDelayActivity' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayActivity' as keyof SliderState)} />
                  <Slider label="Repeats" value={state.granularDelayRepeats ?? 0.3} paramKey={'granularDelayRepeats' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayRepeats' as keyof SliderState)} />
                  <Slider label="Filter" value={state.granularDelayFilter ?? 0.5} paramKey={'granularDelayFilter' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayFilter' as keyof SliderState)} />
                  <Slider label="Vibrato" value={state.granularDelayVibrato ?? 0} paramKey={'granularDelayVibrato' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayVibrato' as keyof SliderState)} />
                  <Slider label="Mix" value={state.granularDelayMix ?? 0.3} paramKey={'granularDelayMix' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayMix' as keyof SliderState)} />
                  <Slider label="Reverb Send" value={state.granularDelayReverbSend ?? 0.4} paramKey={'granularDelayReverbSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayReverbSend' as keyof SliderState)} />
                </>
              )}
            </div>
          </div>

          {/* ── Voice Cards ── */}
          <div className="granular-voices">
            {VOICE_KEYS.map((keys, v) => {
            const isEnabled = state[keys.enabled] as boolean;
            const isExpanded = expandedVoices.has(v);
            const mode = state[keys.mode] as VoiceMode;
            const slice = state[keys.slice] as number;
            const speed = state[keys.speed] as number;
            const pitch = state[keys.pitch] as number;
            const baseReverse = state[keys.reverse] as boolean;
            const trigOv = triggerOverrides?.[v];
            const trigReverse = trigOv?.reverseOverride;
            const effectiveReverse = trigReverse !== undefined ? (baseReverse !== trigReverse) : baseReverse;
            const reverseTriggered = trigReverse !== undefined;
            const pitchOv = trigOv?.pitchOverride;

            // Summary text
            const summaryParts: string[] = [];
            summaryParts.push(`S${slice + 1}`);
            if (speed !== 1) summaryParts.push(`${speed.toFixed(2)}×`);
            if (pitch !== 0) summaryParts.push(`${pitch > 0 ? '+' : ''}${pitch}st`);
            if (baseReverse) summaryParts.push('REV');
            const summary = summaryParts.join(' · ');

            return (
              <div
                key={v}
                className={`granular-voice-card${isExpanded ? ' editing' : ''}${!isEnabled ? ' disabled' : ''}`}
              >
                {/* Header */}
                <div
                  className="granular-voice-header"
                  onClick={() => toggleVoice(v)}
                >
                  <div
                    className="granular-voice-dot"
                    style={{ background: isEnabled ? VOICE_COLORS[v] : '#555' }}
                  />
                  <span className="granular-voice-name">{VOICE_NAMES[v]}</span>
                  <span className="granular-voice-mode-badge">{mode}</span>
                  <span className="granular-voice-summary">{summary}</span>

                  <button
                    className={`granular-voice-enable-btn${isEnabled ? ' on' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      onSelectChange(keys.enabled, !isEnabled);
                    }}
                  >
                    {isEnabled ? 'ON' : 'OFF'}
                  </button>
                  <button className={`granular-voice-expand-btn${isExpanded ? ' active' : ''}`}>
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* Body (expanded) */}
                {isExpanded && (
                  <div className="granular-voice-body">

                    {/* Mode Select */}
                    <div className="granular-mode-row">
                      {(['clean', 'granular', 'legacy'] as VoiceMode[]).map(m => (
                        <button
                          key={m}
                          className={`granular-mode-btn${mode === m ? ' active' : ''}`}
                          onClick={() => onSelectChange(keys.mode, m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    {/* ── Slice & Playback ── */}
                    <div className="granular-section-label">Slice & Playback</div>
                    <div className="granular-grid-4">
                      <Slider
                        label="Slice"
                        value={state[keys.slice] as number}
                        paramKey={keys.slice}
                        onChange={onParamChange}
                        {...sliderProps(keys.slice)}
                      />
                      <Slider
                        label="Speed"
                        value={state[keys.speed] as number}
                        paramKey={keys.speed}
                        unit="×"
                        onChange={onParamChange}
                        {...sliderProps(keys.speed)}
                      />
                      {/* Pitch slider with triggered override flash */}
                      <div className="granular-pitch-wrap">
                        <Slider
                          label="Pitch"
                          value={state[keys.pitch] as number}
                          paramKey={keys.pitch}
                          unit="st"
                          onChange={onParamChange}
                          {...sliderProps(keys.pitch)}
                        />
                        {pitchOv !== undefined && pitchOv !== 0 && (
                          <span className="granular-pitch-flash" style={{ color: VOICE_COLORS[v] }}>
                            {(pitchOv > 0 ? '+' : '') + pitchOv.toFixed(0)}st
                          </span>
                        )}
                      </div>
                      {/* Reverse button: reflects base state XOR Euclidean trigger override */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button
                          className={`granular-reverse-btn${effectiveReverse ? ' active' : ''}${reverseTriggered ? ' seq-triggered' : ''}`}
                          onClick={() => onSelectChange(keys.reverse, !baseReverse)}
                        >
                          ↺ REV
                        </button>
                      </div>
                    </div>

                    {/* ── Grain Controls (only for granular/legacy) ── */}
                    {mode !== 'clean' && (
                      <>
                        <div className="granular-section-label">Grain</div>
                        <div className="granular-grid-4">
                          <Slider
                            label="Density"
                            value={state[keys.density] as number}
                            paramKey={keys.density}
                            unit="/s"
                            onChange={onParamChange}
                            {...sliderProps(keys.density)}
                          />
                          <Slider
                            label="Size"
                            value={state[keys.grainSize] as number}
                            paramKey={keys.grainSize}
                            unit="ms"
                            onChange={onParamChange}
                            {...sliderProps(keys.grainSize)}
                          />
                          <Slider
                            label="Spray"
                            value={state[keys.spray] as number}
                            paramKey={keys.spray}
                            onChange={onParamChange}
                            {...sliderProps(keys.spray)}
                          />
                          <Slider
                            label="Shimmer"
                            value={state[keys.grainOct] as number}
                            paramKey={keys.grainOct}
                            onChange={onParamChange}
                            {...sliderProps(keys.grainOct)}
                          />
                        </div>
                      </>
                    )}

                    {/* ── Envelope & Texture ── */}
                    <div className="granular-section-label">Envelope & Texture</div>
                    <div className="granular-grid-4">
                      <Slider
                        label="Attack"
                        value={state[keys.attack] as number}
                        paramKey={keys.attack}
                        unit="s"
                        onChange={onParamChange}
                        {...sliderProps(keys.attack)}
                      />
                      <Slider
                        label="Decay"
                        value={state[keys.decay] as number}
                        paramKey={keys.decay}
                        unit="s"
                        onChange={onParamChange}
                        {...sliderProps(keys.decay)}
                      />
                      <Slider
                        label="Blur"
                        value={state[keys.blur] as number}
                        paramKey={keys.blur}
                        onChange={onParamChange}
                        {...sliderProps(keys.blur)}
                      />
                      <Slider
                        label="Gain"
                        value={state[keys.gain] as number}
                        paramKey={keys.gain}
                        onChange={onParamChange}
                        {...sliderProps(keys.gain)}
                      />
                    </div>

                    {/* ── Panning & Stereo ── */}
                    <div className="granular-section-label">Pan & Stereo</div>
                    <div className="granular-grid-3">
                      <Slider
                        label="Pan"
                        value={state[keys.pan] as number}
                        paramKey={keys.pan}
                        onChange={onParamChange}
                        {...sliderProps(keys.pan)}
                      />
                      <Slider
                        label="Spread"
                        value={state[keys.stereoSpread] as number}
                        paramKey={keys.stereoSpread}
                        onChange={onParamChange}
                        {...sliderProps(keys.stereoSpread)}
                      />
                      <Slider
                        label="Pan LFO"
                        value={state[keys.panLFORate] as number}
                        paramKey={keys.panLFORate}
                        onChange={onParamChange}
                        {...sliderProps(keys.panLFORate)}
                      />
                    </div>

                    {/* ── Position LFO ── */}
                    <div className="granular-section-label">Position LFO</div>
                    <div className="granular-grid-2">
                      <Slider
                        label="Pos Rate"
                        value={state[keys.posLFORate] as number}
                        paramKey={keys.posLFORate}
                        onChange={onParamChange}
                        {...sliderProps(keys.posLFORate)}
                      />
                      <Slider
                        label="Pos Depth"
                        value={state[keys.posLFODepth] as number}
                        paramKey={keys.posLFODepth}
                        onChange={onParamChange}
                        {...sliderProps(keys.posLFODepth)}
                      />
                    </div>

                    {/* ── Modulation ── */}
                    <div className="granular-section-label">Modulation</div>
                    <div className="granular-grid-2">
                      <Slider
                        label="Rev LFO"
                        value={(state[keys.reverseLFORate] as number) ?? 0}
                        paramKey={keys.reverseLFORate}
                        onChange={onParamChange}
                        {...sliderProps(keys.reverseLFORate)}
                      />
                      <Slider
                        label="Write Fol"
                        value={(state[keys.writeFollow] as number) ?? 0}
                        paramKey={keys.writeFollow}
                        onChange={onParamChange}
                        {...sliderProps(keys.writeFollow)}
                      />
                    </div>

                    {/* ── Legacy-only controls ── */}
                    {mode === 'legacy' && v === 0 && (
                      <div className="granular-legacy-section">
                        <div className="granular-legacy-label">Legacy Granulator</div>
                        <div className="granular-grid-3">
                          <Slider
                            label="Jitter"
                            value={state.granularLegacyJitter}
                            paramKey={'granularLegacyJitter' as keyof SliderState}
                            unit="ms"
                            onChange={onParamChange}
                            {...sliderProps('granularLegacyJitter' as keyof SliderState)}
                          />
                          <Slider
                            label="Probability"
                            value={state.granularLegacyProbability}
                            paramKey={'granularLegacyProbability' as keyof SliderState}
                            onChange={onParamChange}
                            {...sliderProps('granularLegacyProbability' as keyof SliderState)}
                          />
                          <Slider
                            label="Max Grains"
                            value={state.granularLegacyMaxGrains}
                            paramKey={'granularLegacyMaxGrains' as keyof SliderState}
                            onChange={onParamChange}
                            {...sliderProps('granularLegacyMaxGrains' as keyof SliderState)}
                          />
                        </div>
                        <div className="granular-grid-2" style={{ marginTop: 4 }}>
                          <Slider
                            label="Pitch Spread"
                            value={state.granularLegacyPitchSpread}
                            paramKey={'granularLegacyPitchSpread' as keyof SliderState}
                            unit="st"
                            onChange={onParamChange}
                            {...sliderProps('granularLegacyPitchSpread' as keyof SliderState)}
                          />
                          <Slider
                            label="Legacy FB"
                            value={state.granularLegacyFeedback}
                            paramKey={'granularLegacyFeedback' as keyof SliderState}
                            onChange={onParamChange}
                            {...sliderProps('granularLegacyFeedback' as keyof SliderState)}
                          />
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <select
                            style={{
                              width: '100%',
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.2)',
                              background: 'rgba(0,0,0,0.3)',
                              color: '#e0e0e0',
                              fontSize: '0.65rem',
                            }}
                            value={state.granularLegacyPitchMode}
                            onChange={e => onSelectChange(
                              'granularLegacyPitchMode' as keyof SliderState,
                              e.target.value as SliderState[keyof SliderState]
                            )}
                          >
                            <option value="harmonic">Harmonic Intervals</option>
                            <option value="random">Random Pitch</option>
                          </select>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>

        </div>{/* end .granular-sound-panel */}

        {/* ═══════════════ SEQUENCER PANEL (right) ═══════════════ */}
        <div className="granular-sequencer-panel">
          {/* Transport */}
          <div className="seq-transport">
            <button
              className={`seq-play-btn${state.granularEuclidMasterEnabled ? ' playing' : ''}`}
              onClick={() => {
                const next = !state.granularEuclidMasterEnabled;
                if (next && !state.granularEnabled) {
                  onSelectChange('granularEnabled' as keyof SliderState, true);
                }
                onSelectChange('granularEuclidMasterEnabled' as keyof SliderState, next);
              }}
            >
              {state.granularEuclidMasterEnabled ? '■' : '▶'}
            </button>
            <DragNumber
              value={state.granularEuclidBaseBPM as number}
              min={40}
              max={300}
              label="BPM"
              onChange={(v) => onParamChange('granularEuclidBaseBPM' as keyof SliderState, v)}
              shapeByDrag
            />
            <div className="seq-view-toggle">
              <button
                className={`seq-view-btn${seq.viewMode === 'detail' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('detail')}
              >
                Detail
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'overview' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('overview')}
              >
                Overview
              </button>
            </div>
          </div>

          {/* ── Detail Mode ── */}
          {seq.viewMode === 'detail' && (
            <div>
              {/* Tab bar */}
              <div className="seq-tab-bar">
                {seq.sequencerModels.map((seqModel, idx) => (
                  <div
                    key={seqModel.id}
                    className={`seq-tab${idx === seq.activeTab ? ' active' : ''}${seqModel.muted ? ' muted' : ''}`}
                    style={{ '--sc': seqModel.color } as React.CSSProperties}
                    onClick={() => seq.setActiveTab(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <span>{seqModel.name}</span>
                    <div className="seq-tab-ms">
                      <button
                        className={`mute-btn${seqModel.muted ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleMute(idx); }}
                      >M</button>
                      <button
                        className={`solo-btn${seqModel.solo ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleSolo(idx); }}
                      >S</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Seq body */}
              <div className="seq-body" style={{ '--sc': activeSeq.color } as React.CSSProperties}>

                {/* ── Per-seq controls (no source toggles — 1:1 lane→voice) ── */}
                <div className="seq-sources">
                  <span className="granular-lane-voice-label" style={{ color: activeSeq.color }}>
                    → Voice {seq.activeTab + 1}
                  </span>

                  <div className="seq-per-controls">
                    <label className="seq-clock-label">
                      Clock
                      <select
                        className="seq-clock-select"
                        value={seq.clockDivs[seq.activeTab]}
                        onChange={(e) => seq.setClockDiv(seq.activeTab, e.target.value as any)}
                      >
                        <option value="1/4">1/4</option>
                        <option value="1/8">1/8</option>
                        <option value="1/16">1/16</option>
                        <option value="1/8T">1/8T</option>
                      </select>
                    </label>
                    <label className="seq-swing-label">
                      Swing
                      <input
                        type="range"
                        className="seq-swing-range"
                        min={0}
                        max={0.75}
                        step={0.05}
                        value={seq.swings[seq.activeTab]}
                        onChange={(e) => seq.setSwing(seq.activeTab, parseFloat(e.target.value))}
                      />
                      <span className="seq-swing-val">{Math.round(seq.swings[seq.activeTab] * 100)}%</span>
                    </label>
                    <button
                      className={`seq-link-btn${seq.linked[seq.activeTab] ? ' on' : ''}`}
                      onClick={() => seq.toggleLinked(seq.activeTab)}
                      title={seq.linked[seq.activeTab] ? 'Sub-lanes linked to trigger steps' : 'Sub-lanes use independent step counts'}
                    >
                      Link
                    </button>
                    <button
                      className={`seq-evolve-btn${seq.evolveConfigs[seq.activeTab]?.enabled ? ' on' : ''}`}
                      onClick={() => {
                        seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                          idx === seq.activeTab ? { ...cfg, enabled: !cfg.enabled } : cfg
                        )));
                      }}
                    >
                      Evolve
                    </button>
                  </div>
                </div>

                {/* Evolution panel */}
                <div className={`seq-evolve-panel${seq.evolveConfigs[seq.activeTab]?.enabled ? ' open' : ''}`}>
                  <div className="seq-evolve-row">
                    <DragNumber
                      value={seq.evolveConfigs[seq.activeTab]?.everyBars ?? 4}
                      min={1}
                      max={32}
                      label="Every"
                      onChange={(v) => {
                        seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                          idx === seq.activeTab ? { ...cfg, everyBars: v } : cfg
                        )));
                      }}
                    />
                    <span className="seq-drag-num-label">bars</span>
                    <div className="seq-evolve-zone-wrap">
                      <label>
                        Evolution
                        <input
                          type="range" min={0} max={100} step={5}
                          value={Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}
                          onChange={(e) => {
                            const evolution = parseInt(e.target.value, 10) / 100;
                            seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                              if (idx !== seq.activeTab) return cfg;
                              const pct = evolution * 100;
                              const methods = {
                                rotateDrift: true,
                                swingDrift: true,
                                probDrift: pct > 30,
                                ghostNotes: pct > 60,
                                ratchetSpray: pct > 60,
                                hitDrift: pct > 80,
                                pitchWalk: pct > 80,
                                valueDrift: true,
                                valueScramble: pct > 40,
                                valueWiden: pct > 60,
                                subLaneLengthDrift: pct > 50,
                                subLaneDirectionFlip: pct > 80,
                              };
                              return { ...cfg, evolution, methods };
                            }));
                          }}
                        />
                        <span>{Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}%</span>
                      </label>
                      {(() => {
                        const pct = Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100);
                        return (
                          <div className="seq-evolve-methods">
                            <span className="seq-evolve-method on">Rotate</span>
                            <span className="seq-evolve-method on">Swing</span>
                            <span className="seq-evolve-method on">Drift</span>
                            <span className={`seq-evolve-method${pct > 30 ? ' on-t' : ''}`}>Probability</span>
                            <span className={`seq-evolve-method${pct > 40 ? ' on-t' : ''}`}>Scramble</span>
                            <span className={`seq-evolve-method${pct > 50 ? ' on-t' : ''}`}>Length</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Ghosts</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Ratchet</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Widen</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Hits</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Pitch</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Direction</span>
                          </div>
                        );
                      })()}
                    </div>
                    <button className="seq-evolve-reset" onClick={() => resetEvolveHome?.(seq.activeTab)}>Reset</button>
                    {diceLane && (
                      <span className="seq-dice-group">
                        <input type="range" className="seq-dice-slider" min={0} max={100} value={Math.round(diceIntensity * 100)} onChange={e => setDiceIntensity(Number(e.target.value) / 100)} title={`Dice intensity: ${Math.round(diceIntensity * 100)}%`} />
                        <button className="seq-evolve-dice" onClick={() => diceLane(seq.activeTab, diceIntensity)} title="Randomize lane">&#x1F3B2;</button>
                      </span>
                    )}
                  </div>
                  <button
                    className="seq-evolve-advanced-toggle"
                    onClick={() => setShowAdvanced(v => !v)}
                  >
                    {showAdvanced ? '▾' : '▸'} Advanced
                  </button>
                  <div className={`seq-evolve-advanced-body${showAdvanced ? ' open' : ''}`}>
                    <div className="seq-evolve-advanced-row">
                      <label>Write Offset</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'auto' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 'auto' } : cfg))}
                        >Auto</button>
                        <button
                          className={`seq-evolve-mode-btn${typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 0 } : cfg))}
                        >Manual</button>
                      </span>
                      {typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' && (
                        <input
                          type="range" min={0} max={Math.max(1, (activeSeq?.trigger?.steps ?? 16) - 1)} step={1}
                          value={seq.evolveConfigs[seq.activeTab]?.writeOffset as number}
                          onChange={(e) => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: parseInt(e.target.value, 10) } : cfg))}
                        />
                      )}
                    </div>
                    <div className="seq-evolve-advanced-row">
                      <label>Mutation</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'biased' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'biased' } : cfg))}
                        >Biased</button>
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'strict' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'strict' } : cfg))}
                        >Strict</button>
                      </span>
                    </div>
                    <div className="seq-evolve-checks">
                      {Object.keys(seq.evolveConfigs[seq.activeTab]?.methods ?? {}).map((method) => (
                        <label key={method}>
                          <input
                            type="checkbox"
                            checked={!!seq.evolveConfigs[seq.activeTab]?.methods[method]}
                            onChange={() => {
                              seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                                idx === seq.activeTab
                                  ? { ...cfg, methods: { ...cfg.methods, [method]: !cfg.methods[method] } }
                                  : cfg
                              )));
                            }}
                          />
                          {method}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── TRIGGER LANE — always visible ── */}
                <div className="seq-trigger-always">
                  <div className="seq-lane-header">
                    <button
                      className={`seq-lane-enable-btn trigger-toggle${!activeSeq.muted ? ' on' : ''}`}
                      style={!activeSeq.muted ? { background: activeSeq.color, color: '#000' } as React.CSSProperties : undefined}
                      onClick={() => seq.toggleMute(seq.activeTab)}
                    >
                      {activeSeq.muted ? 'Off' : 'On'}
                    </button>
                    <div className="seq-lane-controls">
                      <DragNumber
                        value={activeSeq.trigger.steps}
                        min={2}
                        max={16}
                        label="Steps"
                        shapeByDrag
                        onChange={(v) => seq.setParam(seq.activeTab, 'Steps', v)}
                      />
                      <DragNumber
                        value={activeSeq.trigger.hits}
                        min={0}
                        max={activeSeq.trigger.steps}
                        label="Hits"
                        onChange={(v) => seq.setParam(seq.activeTab, 'Hits', v)}
                      />
                      <div className="seq-rotation-control">
                        <button onClick={() => seq.setParam(seq.activeTab, 'Rotation', activeSeq.trigger.rotation - 1)}>←</button>
                        <span className="seq-rotation-val">{activeSeq.trigger.rotation}</span>
                        <button onClick={() => seq.setParam(seq.activeTab, 'Rotation', activeSeq.trigger.rotation + 1)}>→</button>
                      </div>
                      <select
                        className="seq-preset-select"
                        value={seq.getParam(seq.activeTab, 'Preset') as string}
                        onChange={(e) => seq.setParamSelect(seq.activeTab, 'Preset', e.target.value as any)}
                      >
                        {seq.presetNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <SeqLane
                    sequencer={activeSeq}
                    lane="trigger"
                    color={activeSeq.color}
                    playhead={seq.playheads[seq.activeTab]}
                    hitCount={seq.hitCounts[seq.activeTab]}
                    onToggleTriggerStep={(step) => seq.toggleTriggerStep(seq.activeTab, step)}
                    onSetProbability={(step, value) => seq.setStepProbability(seq.activeTab, step, value)}
                    onResetProbability={(step) => seq.resetStepProbability(seq.activeTab, step)}
                    onCycleRatchet={(step) => seq.cycleStepRatchet(seq.activeTab, step)}
                    onCycleTrigCondition={(step) => seq.cycleTrigCondition(seq.activeTab, step)}
                  />
                </div>

                {/* ── Sub-lane sparklines: slice, pitch, reverse, expression (velocity + ratchets) ── */}
                <div className="seq-spark-container">
                  {([
                    { kind: 'slice' as const, label: 'Slice:', color: '#06b6d4', bipolar: false, invertFill: false,
                      getValues: () => activeSeq.slice.values,
                      getSteps: () => activeSeq.slice.steps },
                    { kind: 'pitch' as const, label: 'Pitch:', color: '#ff6b81', bipolar: true, invertFill: false,
                      getValues: () => activeSeq.pitch.offsets.map(off => (off + 24) / 48),
                      getSteps: () => activeSeq.pitch.steps },
                    { kind: 'reverse' as const, label: 'Rev:', color: '#f472b6', bipolar: false, invertFill: false,
                      getValues: () => activeSeq.reverse.values,
                      getSteps: () => activeSeq.reverse.steps,
                      sparkMode: 'reverse' as const },
                    { kind: 'expression' as const, label: 'Vel:', color: '#ffa502', bipolar: false, invertFill: true,
                      getValues: () => activeSeq.expression.velocities,
                      getSteps: () => activeSeq.expression.steps },
                  ]).map(({ kind: laneKind, label, color: laneColor, bipolar, invertFill, getValues, getSteps, sparkMode }) => {
                    const subState = seq.subLaneStates[seq.activeTab]?.[laneKind];
                    return (
                      <React.Fragment key={laneKind}>
                        <SeqSparkline
                          label={label}
                          steps={subState?.steps ?? getSteps()}
                          values={getValues()}
                          color={laneColor}
                          playhead={seq.playheads[seq.activeTab]}
                          hitCount={seq.hitCounts[seq.activeTab]}
                          direction={subState?.direction ?? 'forward'}
                          bipolar={bipolar}
                          invertFill={invertFill}
                          enabled={subState?.enabled ?? false}
                          expanded={seq.openLane === laneKind}
                          mode={sparkMode}
                          onClick={() => seq.setOpenLane(seq.openLane === laneKind ? 'trigger' : laneKind)}
                          onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                        />
                        {seq.openLane === laneKind && (
                          <div className="seq-lane-editor-wrap">
                            <SeqLane
                              sequencer={activeSeq}
                              lane={laneKind}
                              color={laneColor}
                              playhead={seq.playheads[seq.activeTab]}
                              hitCount={seq.hitCounts[seq.activeTab]}
                              enabled={subState?.enabled ?? false}
                              direction={subState?.direction ?? 'forward'}
                              onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                              onChangeSteps={(v) => seq.setSubLaneSteps(seq.activeTab, laneKind, v)}
                              onCycleDirection={() => seq.cycleSubLaneDirection(seq.activeTab, laneKind)}
                              onChangeValue={(step, value) => seq.changeStepValue(seq.activeTab, laneKind, step, value)}
                              linked={seq.linked[seq.activeTab]}
                              onCycleRatchet={(step: number) => seq.cycleStepRatchet(seq.activeTab, step)}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Mini overview at bottom */}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={GRANULAR_SEQ_LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => seq.setActiveTab(idx)}
              />
            </div>
          )}

          {/* ── Overview Mode ── */}
          {seq.viewMode === 'overview' && (
            <>
              <div className="seq-overview">
                {seq.sequencerModels.map((seqModel, row) => (
                  <div
                    key={seqModel.id}
                    className={`seq-ov-row${seqModel.muted ? ' muted' : ''}`}
                    style={{ '--sc': seqModel.color } as React.CSSProperties}
                  >
                    <div className="seq-ov-header" onClick={() => { seq.setActiveTab(row); seq.setViewMode('detail'); }}>
                      <span className="seq-ov-name">{seqModel.name}</span>
                      <span className="granular-ov-voice" style={{ color: VOICE_COLORS[row] }}>→ V{row + 1}</span>
                      <div className="seq-ov-controls" onClick={(e) => e.stopPropagation()}>
                        <DragNumber
                          value={seqModel.trigger.steps}
                          min={2} max={16} label="S" shapeByDrag
                          onChange={(v) => seq.setParam(row, 'Steps', v)}
                        />
                        <DragNumber
                          value={seqModel.trigger.hits}
                          min={0} max={seqModel.trigger.steps} label="H"
                          onChange={(v) => seq.setParam(row, 'Hits', v)}
                        />
                        <div className="seq-rotation-control seq-ov-rot">
                          <button onClick={() => seq.setParam(row, 'Rotation', seqModel.trigger.rotation - 1)}>←</button>
                          <span className="seq-rotation-val">{seqModel.trigger.rotation}</span>
                          <button onClick={() => seq.setParam(row, 'Rotation', seqModel.trigger.rotation + 1)}>→</button>
                        </div>
                        <select
                          className="seq-ov-select"
                          value={(seq.getParam(row, 'Preset') as string) ?? 'custom'}
                          onChange={(e) => seq.setParamSelect(row, 'Preset', e.target.value as any)}
                        >
                          {seq.presetNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <select
                          className="seq-ov-select seq-ov-clk"
                          value={seqModel.clockDiv}
                          onChange={(e) => seq.setClockDiv(row, e.target.value as any)}
                        >
                          <option value="1/4">1/4</option>
                          <option value="1/8">1/8</option>
                          <option value="1/16">1/16</option>
                          <option value="1/8T">1/8T</option>
                        </select>
                        <button
                          className={`ov-mute-btn${seqModel.muted ? ' on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); seq.toggleMute(row); }}
                        >M</button>
                        <button
                          className={`ov-solo-btn${seqModel.solo ? ' on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); seq.toggleSolo(row); }}
                        >S</button>
                      </div>
                    </div>
                    {/* Trigger grid */}
                    <div className="seq-ov-grid-wrap">
                      {(() => {
                        const maxCells = seqModel.trigger.steps < 9 ? 8 : 16;
                        return (
                          <div className="seq-step-grid" style={{ gridTemplateColumns: `repeat(${maxCells}, 1fr)` }}>
                            {new Array(maxCells).fill(0).map((_, step) => {
                              const inRange = step < seqModel.trigger.steps;
                              const hit = inRange ? (seqModel.trigger.pattern[step] ?? false) : false;
                              const isPlayhead = inRange && (seq.playheads[row] % seqModel.trigger.steps === step);
                              const prob = inRange ? (seqModel.trigger.probability[step] ?? 1.0) : 1.0;
                              const probPct = Math.round(prob * 100);
                              return (
                                <div key={step} className="seq-step">
                                  <span className="seq-step-num">{step % 4 === 0 ? step + 1 : ''}</span>
                                  <button
                                    type="button"
                                    className={`seq-step-cell${hit ? ' active' : ''}${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                                    onClick={inRange ? () => seq.toggleTriggerStep(row, step) : undefined}
                                    onDoubleClick={inRange ? () => seq.resetStepProbability(row, step) : undefined}
                                  >
                                    {inRange && (
                                      <div className="prob-fill" style={{ height: `${probPct}%` }} />
                                    )}
                                    {inRange && <span className="prob-label">{probPct}%</span>}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={GRANULAR_SEQ_LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => {
                  seq.setActiveTab(idx);
                  seq.setViewMode('detail');
                }}
              />
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default GranularPage;
