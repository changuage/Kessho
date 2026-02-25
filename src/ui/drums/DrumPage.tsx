/**
 * DrumPage — Top-level layout for the Drums tab.
 * Uses the generic useEuclideanSequencer hook for all sequencer state.
 * Renders the prototype's two-panel layout:
 *   .container → .sound-panel + .sequencer-panel
 */
import React, { useCallback, useEffect, useRef } from 'react';
import './drums.css';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumStepOverrides } from '../../audio/drumSeqTypes';
import { DRUM_VOICES as VOICE_CONFIG, DRUM_VOICE_ORDER } from '../../audio/drumVoiceConfig';
import { useEuclideanSequencer, type EvolveConfig } from '../sequencer/useEuclideanSequencer';
import DrumPanel from './DrumPanel';
import DragNumber from './DragNumber';
import SeqOverview from './SeqOverview';
import SeqSimple from './SeqSimple';
import SeqMiniOverview from './SeqMiniOverview';
import SeqLane from './SeqLane';
import SeqSparkline from './SeqSparkline';

const LANE_CONFIGS = [
  { color: '#00d4ff', name: 'Seq 1' },
  { color: '#ff6b81', name: 'Seq 2' },
  { color: '#22c55e', name: 'Seq 3' },
  { color: '#ffa502', name: 'Seq 4' },
];

export interface DrumPageProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  togglePanel: (id: string) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  getPresetNames: (voice: DrumVoiceType) => string[];
  triggerVoice: (voice: DrumVoiceType) => void;
  getAnalyserNode: (voice: DrumVoiceType) => AnalyserNode | undefined;
  resetEvolveHome: (laneIdx: number) => void;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  SelectComponent: React.ComponentType<Record<string, unknown>>;
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
  /** Called when step overrides change, so parent can sync to audio engine */
  onStepOverridesChange?: (overrides: DrumStepOverrides) => void;
  /** Initial view mode to restore across tab switches */
  initialViewMode?: 'simple' | 'detail' | 'overview';
  /** Called when view mode changes so parent can persist it */
  onViewModeChange?: (mode: 'simple' | 'detail' | 'overview') => void;
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
    initialViewMode,
    onViewModeChange,
  } = props;

  const Slider = SliderComponent as React.ComponentType<any>;

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
  });

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

  // Sync step overrides (all sub-lane data) to audio engine when they change
  const stepOverridesRef = useRef(seq.stepOverrides);
  useEffect(() => {
    if (stepOverridesRef.current !== seq.stepOverrides) {
      stepOverridesRef.current = seq.stepOverrides;
      onStepOverridesChange?.(seq.stepOverrides);
    }
  }, [seq.stepOverrides, onStepOverridesChange]);

  const activeSeq = seq.activeSeq;

  // ── Keyboard shortcuts: A S D F G H J → voice triggers ──
  const KEY_TO_VOICE: Record<string, DrumVoiceType> = {
    a: 'sub', s: 'kick', d: 'click', f: 'beepHi', g: 'beepLo', h: 'noise', j: 'membrane',
  };
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
        {/* ═══ SOUND PANEL (left, 460px) ═══ */}
        <div className="sound-panel">
          {/* Master strip */}
          <div className="master-strip">
            <button
              className={`drum-enable-btn${state.drumEnabled ? ' on' : ''}`}
              onClick={() => onSelectChange('drumEnabled', !state.drumEnabled)}
              title={state.drumEnabled ? 'Drum engine ON' : 'Drum engine OFF'}
            >
              {state.drumEnabled ? 'ON' : 'OFF'}
            </button>
            <div className="master-item">
              <label>Level</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={state.drumLevel as number}
                onChange={(e) => onParamChange('drumLevel', parseFloat(e.target.value))}
              />
              <span className="val">{Math.round((state.drumLevel as number) * 100)}%</span>
            </div>
            <div className="master-item">
              <label>Reverb</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={state.drumReverbSend as number}
                onChange={(e) => onParamChange('drumReverbSend', parseFloat(e.target.value))}
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

          {/* Delay section */}
          <div className="delay-section">
            <div
              className={`section-header${expandedPanels.has('drumDelay') ? '' : ' collapsed'}`}
              onClick={() => togglePanel('drumDelay')}
            >
              <span className="section-header-content">
                Delay
                <button
                  className={`delay-toggle-btn${state.drumDelayEnabled ? ' on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onSelectChange('drumDelayEnabled', !state.drumDelayEnabled); }}
                >
                  {state.drumDelayEnabled ? 'ON' : 'OFF'}
                </button>
                <span className="delay-bpm-info">@ {state.drumEuclidBaseBPM} BPM</span>
              </span>
            </div>
            <div className={`section-body${expandedPanels.has('drumDelay') ? '' : ' collapsed'}`}>
              {state.drumDelayEnabled && (
                <>
                  <div className="delay-note-row">
                    <div className="delay-note-col">
                      <label>Left</label>
                      <select
                        value={state.drumDelayNoteL as string}
                        onChange={(e) => onParamChange('drumDelayNoteL' as keyof SliderState, e.target.value as any)}
                      >
                        <option value="1/1">1/1</option><option value="1/2">1/2</option><option value="1/2d">1/2 dotted</option>
                        <option value="1/4">1/4</option><option value="1/4d">1/4 dotted</option><option value="1/4t">1/4 triplet</option>
                        <option value="1/8">1/8</option><option value="1/8d">1/8 dotted</option><option value="1/8t">1/8 triplet</option>
                        <option value="1/16">1/16</option><option value="1/16d">1/16 dotted</option><option value="1/16t">1/16 triplet</option>
                        <option value="1/32">1/32</option>
                      </select>
                    </div>
                    <div className="delay-note-col">
                      <label>Right</label>
                      <select
                        value={state.drumDelayNoteR as string}
                        onChange={(e) => onParamChange('drumDelayNoteR' as keyof SliderState, e.target.value as any)}
                      >
                        <option value="1/1">1/1</option><option value="1/2">1/2</option><option value="1/2d">1/2 dotted</option>
                        <option value="1/4">1/4</option><option value="1/4d">1/4 dotted</option><option value="1/4t">1/4 triplet</option>
                        <option value="1/8">1/8</option><option value="1/8d">1/8 dotted</option><option value="1/8t">1/8 triplet</option>
                        <option value="1/16">1/16</option><option value="1/16d">1/16 dotted</option><option value="1/16t">1/16 triplet</option>
                        <option value="1/32">1/32</option>
                      </select>
                    </div>
                  </div>
                  <Slider label="Feedback" value={state.drumDelayFeedback} paramKey="drumDelayFeedback" onChange={onParamChange} {...sliderProps('drumDelayFeedback')} />
                  <Slider label="Mix" value={state.drumDelayMix} paramKey="drumDelayMix" onChange={onParamChange} {...sliderProps('drumDelayMix')} />
                  <Slider label="Filter" value={state.drumDelayFilter} paramKey="drumDelayFilter" onChange={onParamChange} {...sliderProps('drumDelayFilter')} />
                </>
              )}
            </div>
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
            >
              {state.drumEuclidMasterEnabled ? '■' : '▶'}
            </button>
            <DragNumber
              value={state.drumEuclidBaseBPM as number}
              min={40}
              max={300}
              label="BPM"
              onChange={(v) => onParamChange('drumEuclidBaseBPM' as keyof SliderState, v)}
              shapeByDrag
            />
            <div className="seq-view-toggle">
              <button
                className={`seq-view-btn${seq.viewMode === 'simple' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('simple')}
              >
                Simple
              </button>
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
                    <label>
                      Intensity
                      <input
                        type="range" min={0} max={100} step={5}
                        value={Math.round((seq.evolveConfigs[seq.activeTab]?.intensity ?? 0.25) * 100)}
                        onChange={(e) => {
                          const intensity = parseInt(e.target.value, 10) / 100;
                          seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                            if (idx !== seq.activeTab) return cfg;
                            // Auto-sync methods based on intensity thresholds (matches prototype)
                            const pct = intensity * 100;
                            const methods = {
                              rotateDrift: true,
                              velocityBreath: true,
                              swingDrift: true,
                              probDrift: pct > 30,
                              morphDrift: pct > 30,
                              ghostNotes: pct > 60,
                              ratchetSpray: pct > 60,
                              hitDrift: pct > 80,
                              pitchWalk: pct > 80,
                            };
                            return { ...cfg, intensity, methods };
                          }));
                        }}
                      />
                      <span>{Math.round((seq.evolveConfigs[seq.activeTab]?.intensity ?? 0.25) * 100)}%</span>
                    </label>
                    <button className="seq-evolve-reset" onClick={() => resetEvolveHome(seq.activeTab)}>Reset</button>
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
                          label={`${laneKind[0].toUpperCase()}:`}
                          steps={subState?.steps ?? 5}
                          values={
                            laneKind === 'pitch'
                              ? activeSeq.pitch.offsets.map(off =>
                                  activeSeq.pitch.mode === 'notes'
                                    ? Math.min(1, off / 14)
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
                              playhead={seq.playheads[seq.activeTab]}
                              hitCount={seq.hitCounts[seq.activeTab]}
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
                onCycleRatchet={(seqIdx, step) => seq.cycleStepRatchet(seqIdx, step)}
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
