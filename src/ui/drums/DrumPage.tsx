/**
 * DrumPage — Top-level layout for the Drums tab.
 * Uses the generic useEuclideanSequencer hook for all sequencer state.
 * Renders the prototype's two-panel layout:
 *   .container → .sound-panel + .sequencer-panel
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './drums.css';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumStepOverrides } from '../../audio/drumSeqTypes';
import type { ClockDivision } from '../../audio/drumSeqTypes';
import { normalizeNoteDegreeOffset } from '../../audio/drumSeqTypes';
import { DRUM_VOICES as VOICE_CONFIG, DRUM_VOICE_ORDER } from '../../audio/drumVoiceConfig';
import { useEuclideanSequencer, type EvolveConfig, type StepOverrides, type SubLaneKind, type SubLaneState } from '../sequencer/useEuclideanSequencer';
import DrumPanel from './DrumPanel';
import DragNumber from './DragNumber';
import SeqOverview from './SeqOverview';
import SeqSimple from './SeqSimple';
import type { SeqSimpleState } from './SeqSimple';
import SeqMiniOverview from './SeqMiniOverview';
import SeqLane from './SeqLane';
import SeqSparkline from './SeqSparkline';
import { useSliderHelp } from '../SliderHelpOverlay';
import { PresetDropdown } from '../../presets/PresetDropdown';
import { extractParams } from '../../presets/codec';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';

const LANE_CONFIGS = [
  { color: '#00d4ff', name: 'Seq 1' },
  { color: '#ff6b81', name: 'Seq 2' },
  { color: '#22c55e', name: 'Seq 3' },
  { color: '#ffa502', name: 'Seq 4' },
];

// ── Keyboard shortcuts: A S D F G H J → voice triggers ──
const KEY_TO_VOICE: Record<string, DrumVoiceType> = {
  a: 'sub', s: 'kick', d: 'click', f: 'beepHi', g: 'beepLo', h: 'noise', j: 'membrane',
};

export interface DrumPageProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: (newState: SliderState) => void;
  togglePanel: (id: string) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  getPresetNames: (voice: DrumVoiceType) => string[];
  triggerVoice: (voice: DrumVoiceType) => void;
  getAnalyserNode: (voice: DrumVoiceType) => AnalyserNode | undefined;
  resetEvolveHome: (laneIdx: number) => void;
  diceLane?: (laneIdx: number, intensity: number) => void;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  editingVoice: string | null;
  onToggleEditing: (voice: string) => void;
  triggeredVoices: Record<string, boolean>;
  /** Playhead positions from audio engine callback */
  playheads: number[];
  /** Hit counts per lane from audio engine (for sub-lane playheads) */
  hitCounts: number[];
  /** Evolve flash state from audio engine callback */
  evolveFlashing?: boolean[];
  /** Called when evolve configs change, so parent can sync to audio engine */
  onEvolveConfigsChange?: (configs: EvolveConfig[]) => void;
  /** Initial evolve configs to restore across tab switches / preset loads */
  initialEvolveConfigs?: EvolveConfig[];
  /** Preset version counter for triggering UI reset on preset load */
  presetVersion?: number;
  /** Called when step overrides change, so parent can sync to audio engine */
  onStepOverridesChange?: (overrides: DrumStepOverrides) => void;
  /** Initial step overrides to restore across tab switches */
  initialStepOverrides?: StepOverrides;
  /** Initial sub-lane states to restore across tab switches */
  initialSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  /** Called when sub-lane states change, so parent can persist across tab switches */
  onSubLaneStatesChange?: (states: Record<SubLaneKind, SubLaneState>[]) => void;
  /** Initial view mode to restore across tab switches */
  initialViewMode?: 'simple' | 'detail' | 'overview';
  /** Called when view mode changes so parent can persist it */
  onViewModeChange?: (mode: 'simple' | 'detail' | 'overview') => void;
  /** Evolved step overrides pushed from audio engine (for visual sync) */
  evolvedOverrides?: { laneIndex: number; version: number; data: Partial<StepOverrides> };
  /** Called when per-lane clock divisions change */
  onClockDivsChange?: (divs: ClockDivision[]) => void;
  /** Called when per-lane swing amounts change */
  onSwingsChange?: (swings: number[]) => void;
  /** Initial simple sequencer state to restore across tab switches */
  initialSeqSimpleState?: SeqSimpleState;
  /** Called when simple sequencer state changes */
  onSeqSimpleStateChange?: (state: SeqSimpleState) => void;
}

const DrumPage: React.FC<DrumPageProps> = (props) => {
  const {
    state,
    isMobile,
    expandedPanels,
    onParamChange,
    onSelectChange,
    togglePanel,
    sliderProps,
    getPresetNames,
    triggerVoice,
    getAnalyserNode,
    resetEvolveHome,
    diceLane,
    SliderComponent,
    CollapsiblePanelComponent,
    editingVoice,
    onToggleEditing,
    triggeredVoices,
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
  } = props;
  const onStateChange = props.onStateChange;
  const evolvedOverrides = props.evolvedOverrides;
  const initialEvolveConfigs = props.initialEvolveConfigs;
  const presetVersion = props.presetVersion;

  const { announceHelp, announceSlider } = useSliderHelp();

  const [diceIntensity, setDiceIntensity] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const announceDrumLevelHelp = useCallback(() => {
    announceSlider('drumLevel', { label: 'Level' });
  }, [announceSlider]);

  const announceDrumReverbHelp = useCallback(() => {
    announceSlider('drumReverbSend', { label: 'Reverb' });
  }, [announceSlider]);
  const bindHelp = useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);

  // ── Euclidean sequencer preset (L1 drumEuclidean) ──
  const [euclidPresetName, setEuclidPresetName] = useState<string | undefined>();
  const handleEuclidPresetLoad = useCallback((entry: PresetEntry, _data: Record<string, unknown>) => {
    setEuclidPresetName(entry.name);
  }, []);

  // ── Composite extract: L3 drums source includes L1 drumEuclidean + L2 drumKit ──
  const drumsCompositeExtract = React.useMemo<UsePresetsOptions>(() => ({
    customExtract: (s: SliderState) => {
      const combined: Record<string, unknown> = {};
      Object.assign(combined, extractParams(s, 1, 'drumEuclidean'));
      Object.assign(combined, extractParams(s, 2, 'drumKit'));
      Object.assign(combined, extractParams(s, 3, 'drums'));
      return combined;
    },
  }), []);

  // ── Reusable sequencer hook ──
  const seq = useEuclideanSequencer({
    state,
    onParamChange,
    onSelectChange,
    prefix: 'drum',
    laneCount: 4,
    lanes: LANE_CONFIGS,
    playheads,
    hitCounts,
    evolveFlashing,
    initialViewMode,
    initialStepOverrides,
    initialSubLaneStates,
    initialEvolveConfigs,
    resetKey: presetVersion,
  });

  const setSharedSequencerBpm = useCallback((bpm: number) => {
    onParamChange('sequencerMasterBPM' as keyof SliderState, bpm);
    onParamChange('synthEuclidBaseBPM' as keyof SliderState, bpm);
    onParamChange('drumEuclidBaseBPM' as keyof SliderState, bpm);
    onParamChange('granularEuclidBaseBPM' as keyof SliderState, bpm);
  }, [onParamChange]);

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
      if (data.triggerToggles?.[laneIndex] != null) {
        const arr = [...prev.triggerToggles];
        arr[laneIndex] = new Map(data.triggerToggles[laneIndex]);
        next.triggerToggles = arr;
      }
      const keys = ['probability', 'ratchet', 'expression', 'pitch', 'morph', 'distance', 'slice', 'reverse'] as const;
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

  // Sync step overrides (all sub-lane data) to audio engine when they change
  const stepOverridesRef = useRef(seq.stepOverrides);
  useEffect(() => {
    if (stepOverridesRef.current !== seq.stepOverrides) {
      stepOverridesRef.current = seq.stepOverrides;
      onStepOverridesChange?.(seq.stepOverrides);
    }
  }, [seq.stepOverrides, onStepOverridesChange]);

  // Persist sub-lane states (enabled/steps/direction) across tab switches
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

  const activeSeq = seq.activeSeq;

  // ── Keyboard shortcuts ──
  const triggerVoiceRef = useRef(triggerVoice);
  triggerVoiceRef.current = triggerVoice;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.repeat) return;
    const voice = KEY_TO_VOICE[e.key?.toLowerCase()];
    if (!voice) return;
    e.preventDefault();
    triggerVoiceRef.current(voice);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="drum-root">
      <div className="container">
        {/* ═══ Drums Source Preset (L3) ═══ */}
        <div className="drums-source-preset-bar" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Drums Source</span>
          <PresetDropdown
            level="source"
            scope="drums"
            state={state}
            onLoad={(_entry: PresetEntry) => {}}
            onStateChange={onStateChange}
            presetOptions={drumsCompositeExtract}
            compact
          />
        </div>

        {/* ═══ SOUND PANEL (left, 460px) ═══ */}
        <div className="sound-panel">
          {/* Master strip */}
          <div className="master-strip">
            <button
              className={`drum-enable-btn${state.drumEnabled ? ' on' : ''}`}
              onClick={() => onSelectChange('drumEnabled', !state.drumEnabled)}
              title={state.drumEnabled ? 'Drum engine ON' : 'Drum engine OFF'}
              {...bindHelp('drumEngineEnable')}
            >
              {state.drumEnabled ? 'ON' : 'OFF'}
            </button>
            <div className="master-item">
              <label>Level</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={state.drumLevel as number}
                onChange={(e) => {
                  announceDrumLevelHelp();
                  onParamChange('drumLevel', parseFloat(e.target.value));
                }}
                onMouseEnter={announceDrumLevelHelp}
                onPointerDown={announceDrumLevelHelp}
                onFocus={announceDrumLevelHelp}
              />
              <span className="val">{Math.round((state.drumLevel as number) * 100)}%</span>
            </div>
            <div className="master-item">
              <label>Reverb</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={state.drumReverbSend as number}
                onChange={(e) => {
                  announceDrumReverbHelp();
                  onParamChange('drumReverbSend', parseFloat(e.target.value));
                }}
                onMouseEnter={announceDrumReverbHelp}
                onPointerDown={announceDrumReverbHelp}
                onFocus={announceDrumReverbHelp}
              />
              <span className="val">{Math.round((state.drumReverbSend as number) * 100)}%</span>
            </div>
            <button
              className={`master-anim-btn${state.drumMorphSliderAnimate ? ' on' : ''}`}
              onClick={() => onSelectChange('drumMorphSliderAnimate', !state.drumMorphSliderAnimate)}
              title="Animate slider positions during morph"
            >
              {state.drumMorphSliderAnimate ? '⟳ Anim' : '⟳'}
            </button>
          </div>

          {/* Voice cards */}
          <div className="voice-cards">
            <DrumPanel
              state={state}
              isMobile={isMobile}
              expandedPanels={expandedPanels}
              togglePanel={togglePanel}
              onParamChange={onParamChange as (key: keyof SliderState, value: SliderState[keyof SliderState]) => void}
              sliderProps={sliderProps}
              getPresetNames={getPresetNames}
              triggerVoice={triggerVoice}
              SliderComponent={SliderComponent}
              CollapsiblePanelComponent={CollapsiblePanelComponent}
              editingVoice={editingVoice}
              onToggleEditing={onToggleEditing}
              triggeredVoices={triggeredVoices}
              getAnalyserNode={getAnalyserNode}
            />
          </div>

          {/* Status bar */}
          <div className="status-bar">
            <span className="count">64+</span> presets loaded across 7 voices
          </div>
        </div>

        {/* ═══ SEQUENCER PANEL (right, flex: 1) ═══ */}
        <div className="sequencer-panel">
          {/* Transport */}
          <div className="seq-transport">
            <button
              className={`seq-play-btn${state.drumEuclidMasterEnabled ? ' playing' : ''}`}
              onClick={() => {
                const next = !state.drumEuclidMasterEnabled;
                if (next && !state.drumEnabled) {
                  onSelectChange('drumEnabled', true);
                }
                onSelectChange('drumEuclidMasterEnabled', next);
              }}
              {...bindHelp('drumSeqPlayToggle')}
            >
              {state.drumEuclidMasterEnabled ? '■' : '▶'}
            </button>
            <DragNumber
              value={state.sequencerMasterBPM as number}
              min={40}
              max={300}
              label="BPM"
              onChange={setSharedSequencerBpm}
              shapeByDrag
            />
            <div className="seq-view-toggle">
              <button
                className={`seq-view-btn${seq.viewMode === 'simple' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('simple')}
                {...bindHelp('drumSeqViewSimple')}
              >
                Simple
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'detail' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('detail')}
                {...bindHelp('drumSeqViewDetail')}
              >
                Detail
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'overview' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('overview')}
                {...bindHelp('drumSeqViewOverview')}
              >
                Overview
              </button>

            </div>
          </div>

          {/* Sequencer Preset (L1 drumEuclidean) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', marginBottom: 4, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Pattern</span>
            <PresetDropdown
              level="engine"
              scope="drumEuclidean"
              state={state}
              currentName={euclidPresetName}
              onLoad={handleEuclidPresetLoad}
              onStateChange={onStateChange}
              showSaveButton={false}
              compact
            />
          </div>

          {/* ── Simple Mode (standalone random trigger) ── */}
          {seq.viewMode === 'simple' && (
            <SeqSimple
              triggerVoice={triggerVoice}
              drumEnabled={state.drumEnabled as boolean}
              masterEnabled={state.drumEuclidMasterEnabled as boolean}
              onEnableDrums={() => {
                if (!state.drumEnabled) {
                  onSelectChange('drumEnabled', true);
                }
              }}
              initialState={props.initialSeqSimpleState}
              onStateChange={props.onSeqSimpleStateChange}
            />
          )}

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

                {/* ── Source voice toggles + per-seq controls (inline) ── */}
                <div className="seq-sources">
                  {DRUM_VOICE_ORDER.map((voice) => {
                    const isOn = Boolean(activeSeq.sources[voice as DrumVoiceType]);
                    const cfg = VOICE_CONFIG[voice];
                    return (
                      <button
                        key={voice}
                        className={`seq-source-toggle${isOn ? ' active' : ''}`}
                        style={{ '--vc': cfg.color } as React.CSSProperties}
                        onClick={() => seq.setParamSelect(seq.activeTab, `Target${voice.charAt(0).toUpperCase() + voice.slice(1)}`, !isOn as any)}
                        title={cfg.label}
                        {...bindHelp('drumSeqSourceToggle', { label: cfg.label })}
                      >
                        {cfg.icon}
                      </button>
                    );
                  })}

                  {/* ── Per-seq controls: Clock / Swing / Link / Evolve (inline) ── */}
                  <div className="seq-per-controls">
                  <label className="seq-clock-label">
                    Clock
                    <select
                      className="seq-clock-select"
                      value={seq.clockDivs[seq.activeTab]}
                      onChange={(e) => seq.setClockDiv(seq.activeTab, e.target.value as any)}
                      {...bindHelp('drumSeqClockSelect')}
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
                      value={seq.swings[seq.activeTab] ?? 0}
                      onChange={(e) => seq.setSwing(seq.activeTab, parseFloat(e.target.value))}
                    />
                    <span className="seq-swing-val">{Math.round((seq.swings[seq.activeTab] ?? 0) * 100)}%</span>
                  </label>
                  <button
                    className={`seq-link-btn${seq.linked[seq.activeTab] ? ' on' : ''}`}
                    onClick={() => seq.toggleLinked(seq.activeTab)}
                    title={seq.linked[seq.activeTab] ? 'Sub-lanes linked to trigger steps' : 'Sub-lanes use independent step counts'}
                    {...bindHelp('drumSeqLink')}
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
                    {...bindHelp('drumSeqEvolve')}
                  >
                    Evolve
                  </button>
                  </div>{/* end seq-per-controls */}
                </div>{/* end seq-sources */}

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
                    <button className="seq-evolve-reset" onClick={() => resetEvolveHome(seq.activeTab)}>Reset</button>
                    {diceLane && (
                      <span className="seq-dice-group">
                        <input type="range" className="seq-dice-slider" min={0} max={100} step={5}
                          value={Math.round(diceIntensity * 100)}
                          onChange={(e) => setDiceIntensity(Number(e.target.value) / 100)}
                          title={`Dice intensity: ${Math.round(diceIntensity * 100)}%`}
                        />
                        <button className="seq-evolve-dice" onClick={() => diceLane(seq.activeTab, diceIntensity)} title={`Randomize lane (${Math.round(diceIntensity * 100)}%)`}>&#x1F3B2;</button>
                      </span>
                    )}
                  </div>
                  <button
                    className="seq-evolve-advanced-toggle"
                    onClick={() => setShowAdvanced(v => !v)}
                    {...bindHelp('drumSeqEvolveAdvanced')}
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
                          {...bindHelp('drumSeqWriteOffsetAuto')}
                        >Auto</button>
                        <button
                          className={`seq-evolve-mode-btn${typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 0 } : cfg))}
                          {...bindHelp('drumSeqWriteOffsetManual')}
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
                          {...bindHelp('drumSeqMutationBiased')}
                        >Biased</button>
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'strict' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'strict' } : cfg))}
                          {...bindHelp('drumSeqMutationStrict')}
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

                {/* ── TRIGGER LANE – always visible ── */}
                <div className="seq-trigger-always">
                  {/* Trigger lane header: Steps / Hits / Rotation / Preset */}
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
                        {...bindHelp('drumSeqTriggerPreset')}
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
                    playhead={seq.playheads[seq.activeTab] ?? 0}
                    hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                    onToggleTriggerStep={(step) => seq.toggleTriggerStep(seq.activeTab, step)}
                    onSetProbability={(step, value) => seq.setStepProbability(seq.activeTab, step, value)}
                    onResetProbability={(step) => seq.resetStepProbability(seq.activeTab, step)}
                    onCycleRatchet={(step) => seq.cycleStepRatchet(seq.activeTab, step)}
                    onCycleTrigCondition={(step) => seq.cycleTrigCondition(seq.activeTab, step)}
                  />
                </div>

                {/* ── Sub-lane sparkline accordion (4 sub-lanes only) ── */}
                <div className="seq-spark-container">
                  {(['pitch', 'expression', 'morph', 'distance'] as const).map((laneKind) => {
                    const subState = seq.subLaneStates[seq.activeTab]?.[laneKind];
                    const laneColor = laneKind === 'pitch' ? '#ff6b81'
                      : laneKind === 'expression' ? '#ffa502'
                      : laneKind === 'morph' ? '#c084fc'
                      : '#2dd4bf';
                    return (
                      <React.Fragment key={laneKind}>
                        <SeqSparkline
                          label={`${laneKind.charAt(0).toUpperCase()}:`}
                          steps={subState?.steps ?? 5}
                          values={
                            laneKind === 'pitch'
                              ? activeSeq.pitch.offsets.map(off =>
                                  activeSeq.pitch.mode === 'notes'
                                    ? normalizeNoteDegreeOffset(off)
                                    : (off + 24) / 48
                                )
                              : laneKind === 'expression'
                                ? activeSeq.expression.velocities
                                : laneKind === 'morph'
                                  ? activeSeq.morph.values
                                  : activeSeq.distance.values
                          }
                          color={laneColor}
                          playhead={seq.playheads[seq.activeTab]}
                          hitCount={seq.hitCounts[seq.activeTab]}
                          direction={subState?.direction ?? 'forward'}
                          bipolar={
                            laneKind === 'morph' || laneKind === 'distance' ||
                            (laneKind === 'pitch' && activeSeq.pitch.mode !== 'notes')
                          }
                          invertFill={laneKind === 'expression'}
                          enabled={subState?.enabled ?? false}
                          expanded={seq.openLane === laneKind}
                          onClick={() => seq.setOpenLane(seq.openLane === laneKind ? 'trigger' : laneKind)}
                          onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                        />
                        {/* Expanded sub-lane editor */}
                        {seq.openLane === laneKind && (
                          <div className="seq-lane-editor-wrap">
                            <SeqLane
                              sequencer={activeSeq}
                              lane={laneKind}
                              color={laneColor}
                              playhead={seq.playheads[seq.activeTab] ?? 0}
                              hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                              enabled={subState?.enabled ?? false}
                              direction={subState?.direction ?? 'forward'}
                              onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                              onChangeSteps={(v) => seq.setSubLaneSteps(seq.activeTab, laneKind, v)}
                              onCycleDirection={() => seq.cycleSubLaneDirection(seq.activeTab, laneKind)}
                              onChangeValue={(step, value) => seq.changeStepValue(seq.activeTab, laneKind, step, value)}
                              linked={seq.linked[seq.activeTab]}
                              {...(laneKind === 'expression' ? {
                                onCycleRatchet: (step: number) => seq.cycleStepRatchet(seq.activeTab, step),
                              } : {})}
                              {...(laneKind === 'pitch' ? {
                                onChangePitchMode: (mode) => seq.setPitchMode(seq.activeTab, mode),
                                onChangePitchRoot: (root) => seq.setPitchRoot(seq.activeTab, root),
                                onChangePitchScale: (scale) => seq.setPitchScale(seq.activeTab, scale),
                                onToggleScaleQuantize: () => seq.toggleScaleQuantize(seq.activeTab),
                              } : {})}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Mini overview at bottom — clickable to switch seq */}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => seq.setActiveTab(idx)}
              />
            </div>
          )}

          {/* ── Overview Mode ── */}
          {seq.viewMode === 'overview' && (
            <>
              <SeqOverview
                sequencers={seq.sequencerModels}
                playheads={seq.playheads}
                presetNames={seq.presetNames}
                onSelectSequencer={(index) => {
                  seq.setActiveTab(index);
                  seq.setViewMode('detail');
                }}
                onSetParam={(seqIdx, param, value) => seq.setParam(seqIdx, param, value)}
                onSetParamSelect={(seqIdx, param, value) => seq.setParamSelect(seqIdx, param, value as any)}
                onToggleSource={(seqIdx, voice, on) => seq.setParamSelect(seqIdx, `Target${voice.charAt(0).toUpperCase() + voice.slice(1)}`, on as any)}
                onToggleMute={(seqIdx) => seq.toggleMute(seqIdx)}
                onToggleSolo={(seqIdx) => seq.toggleSolo(seqIdx)}
                onSetClockDiv={(seqIdx, div) => seq.setClockDiv(seqIdx, div)}
                getParam={(seqIdx, param) => seq.getParam(seqIdx, param)}
                onToggleTriggerStep={(seqIdx, step) => seq.toggleTriggerStep(seqIdx, step)}
                onSetProbability={(seqIdx, step, value) => seq.setStepProbability(seqIdx, step, value)}
                onResetProbability={(seqIdx, step) => seq.resetStepProbability(seqIdx, step)}
                onCycleTrigCondition={(seqIdx, step) => seq.cycleTrigCondition(seqIdx, step)}
              />
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
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

export default DrumPage;
