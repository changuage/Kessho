import React from 'react';
import type { SliderState, SavedPreset } from '../state';
import type { EngineState } from '../../audio/engine';
import type { TensionArcType } from '../../audio/harmony';
import type { PresetEntry } from '../../presets/types';
import { PresetDropdown, PresetFamilyTree } from '../../presets';
import type { SliderMode } from '../state';
import { SCALE_FAMILIES } from '../../audio/scales';
import { isAtEndpoint0, isAtEndpoint1 } from '../../audio/morphUtils';
import { getTransportMetrics } from '../../audio/transport';
import { STEM_RECORD_TRACK_IDS, STEM_RECORD_TRACK_LABELS } from '../../audio/recordingTracks';
import { useSliderHelp } from '../SliderHelpOverlay';
import './global.css';

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const GLOBAL_EXPANDED_SECTIONS_STORAGE_KEY = 'global:expanded-sections:v1';
const DEFAULT_GLOBAL_EXPANDED_SECTIONS = ['mixer-buses', 'morph', 'state-presets', 'scale-tension', 'transport-sync', 'root-cof', 'chord-progression'];

// ═══════════════ Props ═══════════════

export interface GlobalPageProps {
  state: SliderState;
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onParamChange: (key: any, value: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectChange: (key: any, value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sliderProps: (paramKey: any) => Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SliderComponent: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SelectComponent: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CircleOfFifthsComponent: React.ComponentType<any>;

  // Engine state
  engineState: EngineState;
  onResetCofDrift: () => void;

  // Morph CoF visualization
  morphCoFViz: {
    cofStep: number;
    startRoot: number;
    targetRoot: number;
  } | null;

  // Morph state
  morphPresetA: SavedPreset | null;
  morphPresetB: SavedPreset | null;
  morphPosition: number;
  morphMode: 'manual' | 'auto';
  morphPlayPhrases: number;
  morphTransitionPhrases: number;
  morphCountdown: { phase: string; phrasesLeft: number } | null;
  onLoadMorphA: (entry: PresetEntry, data: Record<string, unknown>) => void;
  morphSlotAName: string;
  onClearMorphA: () => void;
  onLoadMorphB: (entry: PresetEntry, data: Record<string, unknown>) => void;
  morphSlotBName: string;
  onClearMorphB: () => void;
  onMorphPositionChange: (value: number) => void;
  onMorphModeChange: (mode: 'manual' | 'auto') => void;
  onMorphPlayPhrasesChange: (value: number) => void;
  onMorphTransitionPhrasesChange: (value: number) => void;

  // State preset
  statePresetName: string;

  // Recording
  isRecording: boolean;
  recordFormats: { webm: boolean; wav: boolean };
  recordStems: Record<string, boolean>;
  recordingDuration: number;
  formatRecordingTime: (seconds: number) => string;
  onRecordFormatsChange: (updater: (prev: { webm: boolean; wav: boolean }) => { webm: boolean; wav: boolean }) => void;
  onRecordStemsChange: (key: string) => void;

  // Playback Timer
  playbackTimerEnabled: boolean;
  playbackTimerMinutes: number;
  playbackTimerRemaining: number | null;
  onTimerEnabledChange: (enabled: boolean) => void;
  onTimerMinutesChange: (minutes: number) => void;
  onTimerRemainingChange: (remaining: number) => void;

  // Dual slider state (for version diff comparison)
  sliderModes?: Record<string, SliderMode>;
  dualSliderRanges?: Record<string, { min: number; max: number }>;
}

// ═══════════════ Component ═══════════════

const GlobalPage: React.FC<GlobalPageProps> = ({
  state,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent: Slider,
  SelectComponent: Select,
  CircleOfFifthsComponent: CircleOfFifths,
  engineState,
  onResetCofDrift,
  morphCoFViz,
  morphPresetA,
  morphPresetB,
  morphPosition,
  morphMode,
  morphPlayPhrases,
  morphTransitionPhrases,
  morphCountdown,
  onLoadMorphA,
  morphSlotAName,
  onClearMorphA,
  onLoadMorphB,
  morphSlotBName,
  onClearMorphB,
  onMorphPositionChange,
  onMorphModeChange,
  onMorphPlayPhrasesChange,
  onMorphTransitionPhrasesChange,
  statePresetName,
  isRecording,
  recordFormats,
  recordStems,
  recordingDuration,
  formatRecordingTime,
  onRecordFormatsChange,
  onRecordStemsChange,
  playbackTimerEnabled,
  playbackTimerMinutes,
  playbackTimerRemaining,
  onTimerEnabledChange,
  onTimerMinutesChange,
  onTimerRemainingChange,
  sliderModes,
  dualSliderRanges,
}) => {
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    () => {
      if (typeof window === 'undefined') return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
      try {
        const raw = window.sessionStorage.getItem(GLOBAL_EXPANDED_SECTIONS_STORAGE_KEY);
        if (!raw) return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
        return new Set(parsed.filter((value): value is string => typeof value === 'string'));
      } catch {
        return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
      }
    }
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(GLOBAL_EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(Array.from(expandedSections)));
    } catch {
      // Ignore storage failures; section state can remain in-memory.
    }
  }, [expandedSections]);
  const { announceHelp } = useSliderHelp();
  const bindHelp = React.useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, { ...options, page: 'global' }),
    onPointerDown: () => announceHelp(helpKey, { ...options, page: 'global' }),
    onFocus: () => announceHelp(helpKey, { ...options, page: 'global' }),
  }), [announceHelp]);
  const transportMetrics = React.useMemo(() => getTransportMetrics(state), [state]);
  const progressionSteps = Math.max(1, state.chordProgressionSteps ?? 4);
  const progressionStepEnabled = React.useMemo(
    () => (state.chordProgressionStepEnabled ?? [])
      .slice(0, progressionSteps)
      .concat(new Array(Math.max(0, progressionSteps - (state.chordProgressionStepEnabled?.length ?? 0))).fill(true)),
    [progressionSteps, state.chordProgressionStepEnabled],
  );
  const DEGREE_LABELS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  const primaryClock = state.transportPrimaryClock ?? 'seconds';
  const isSecondsMaster = primaryClock === 'seconds';
  const isBpmMaster = primaryClock === 'bpm';
  const isDecoupled = primaryClock === 'decoupled';
  const phraseSeconds = state.phraseLength ?? transportMetrics.phraseDurationFromBeatClockSec;
  const beatBpm = state.sequencerMasterBPM ?? transportMetrics.effectiveBpm;
  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="global-root">
      <div className="global-container">
      {/* Master Mixer */}
      <div className="global-mixer-panel">
          <div className="mixer-card">
            <h3 className="mixer-card-title">Master Mixer</h3>
            <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('mixer-buses')}>
              <span className={`harmony-section-chevron ${expandedSections.has('mixer-buses') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Channel Buses</span>
            </div>
            {expandedSections.has('mixer-buses') && (
              <div className="harmony-section-body">
                <div className="mixer-bus-grid">
                  <div className="mixer-bus-group">
                    <div className="mixer-bus-label">Pad</div>
                    <Slider label="Pad 1" value={state.synthLevel} paramKey="synthLevel" onChange={onParamChange} {...sliderProps('synthLevel')} />
                    <Slider label="Pad 2" value={state.pad2Level} paramKey="pad2Level" onChange={onParamChange} {...sliderProps('pad2Level')} />
                    <Slider label="Reverb 1" value={state.pad1ReverbSend} paramKey="pad1ReverbSend" onChange={onParamChange} {...sliderProps('pad1ReverbSend')} />
                    <Slider label="Reverb 2" value={state.pad2ReverbSend} paramKey="pad2ReverbSend" onChange={onParamChange} {...sliderProps('pad2ReverbSend')} />
                  </div>
                  <div className="mixer-bus-group">
                    <div className="mixer-bus-label">Lead</div>
                    <Slider label="Lead 1" value={state.lead1Level} paramKey="lead1Level" onChange={onParamChange} {...sliderProps('lead1Level')} />
                    <Slider label="Lead 2" value={state.lead2Level} paramKey="lead2Level" onChange={onParamChange} {...sliderProps('lead2Level')} />
                    <Slider label="Reverb 1" value={state.lead1ReverbSend} paramKey="lead1ReverbSend" onChange={onParamChange} {...sliderProps('lead1ReverbSend')} />
                    <Slider label="Reverb 2" value={state.lead2ReverbSend} paramKey="lead2ReverbSend" onChange={onParamChange} {...sliderProps('lead2ReverbSend')} />
                  </div>
                  <div className="mixer-bus-group">
                    <div className="mixer-bus-label">Drum</div>
                    <Slider label="Level" value={state.drumLevel} paramKey="drumLevel" onChange={onParamChange} {...sliderProps('drumLevel')} />
                    <Slider label="Reverb" value={state.drumReverbSend} paramKey="drumReverbSend" onChange={onParamChange} {...sliderProps('drumReverbSend')} />
                  </div>
                  <div className="mixer-bus-group">
                    <div className="mixer-bus-label">Granular</div>
                    <Slider label="Level" value={state.granularLevel} paramKey="granularLevel" onChange={onParamChange} {...sliderProps('granularLevel')} />
                    <Slider label="Reverb" value={state.granularReverbSend} paramKey="granularReverbSend" onChange={onParamChange} {...sliderProps('granularReverbSend')} />
                  </div>
                  <div className="mixer-bus-group">
                    <div className="mixer-bus-label">Earth</div>
                    <Slider label="Waves" value={state.oceanSampleLevel} paramKey="oceanSampleLevel" onChange={onParamChange} {...sliderProps('oceanSampleLevel')} />
                    <Slider label="Water" value={state.waterLevel} paramKey="waterLevel" onChange={onParamChange} {...sliderProps('waterLevel')} />
                    <Slider label="Insects" value={state.insectsLevel} paramKey="insectsLevel" onChange={onParamChange} {...sliderProps('insectsLevel')} />
                  </div>
                  <div className="mixer-bus-group">
                    <div className="mixer-bus-label">Output</div>
                    <Slider label="Master" value={state.masterVolume} paramKey="masterVolume" onChange={onParamChange} {...sliderProps('masterVolume')} />
                    <Slider label="Reverb" value={state.reverbLevel} paramKey="reverbLevel" onChange={onParamChange} {...sliderProps('reverbLevel')} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Presets Card (under Mixer) */}
        <div className="presets-card">
          <h3 className="presets-card-title">Presets</h3>

          {/* Preset Morph Section */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('morph')}>
              <span className={`harmony-section-chevron ${expandedSections.has('morph') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Preset Morph</span>
            </div>
            {expandedSections.has('morph') && (
              <div className="harmony-section-body">
                {/* Slot A */}
                <div className="morph-slot">
                  <div className="morph-slot-header">
                    <span className="morph-slot-label slot-a">Slot A</span>
                    {morphPresetA && (
                      <button onClick={onClearMorphA} className="morph-clear-btn">✕</button>
                    )}
                  </div>
                  <PresetDropdown
                    level="state"
                    scope="global"
                    state={state}
                    currentName={morphSlotAName}
                    onLoad={onLoadMorphA}
                    showSaveButton={false}
                    compact
                  />
                </div>

                {/* Morph Position */}
                <div className="morph-position">
                  <div className="morph-position-header">
                    <span className="morph-position-label">Morph Position</span>
                    <span className="morph-position-value">{morphPosition}%</span>
                  </div>
                  <div className="morph-position-track">
                    <span className="morph-endpoint a">A</span>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={morphPosition}
                      onChange={(e) => onMorphPositionChange(parseInt(e.target.value))}
                      disabled={!morphPresetA && !morphPresetB}
                    />
                    <span className="morph-endpoint b">B</span>
                  </div>
                  <div className="morph-position-hint">
                    {isAtEndpoint0(morphPosition, true) ? 'Full A' :
                     isAtEndpoint1(morphPosition, true) ? 'Full B' :
                     `${100 - morphPosition}% A + ${morphPosition}% B`}
                  </div>
                </div>

                {/* Slot B */}
                <div className="morph-slot">
                  <div className="morph-slot-header">
                    <span className="morph-slot-label slot-b">Slot B</span>
                    {morphPresetB && (
                      <button onClick={onClearMorphB} className="morph-clear-btn">✕</button>
                    )}
                  </div>
                  <PresetDropdown
                    level="state"
                    scope="global"
                    state={state}
                    currentName={morphSlotBName}
                    onLoad={onLoadMorphB}
                    showSaveButton={false}
                    compact
                  />
                </div>

                {/* Mode Toggle */}
                <div className="morph-divider">
                  <div className="morph-mode-row">
                    <span className="morph-mode-label">Mode:</span>
                    <button
                      onClick={() => onMorphModeChange('manual')}
                      className={`morph-mode-btn ${morphMode === 'manual' ? 'active' : ''}`}
                    >Manual</button>
                    <button
                      onClick={() => onMorphModeChange('auto')}
                      className={`morph-mode-btn ${morphMode === 'auto' ? 'active' : ''}`}
                    >Auto-Cycle</button>
                  </div>

                  {/* Auto-Cycle Settings */}
                  {morphMode === 'auto' && (
                    <div className="morph-auto-box">
                      <div className="morph-auto-slider">
                        <div className="morph-auto-slider-header">
                          <span className="morph-auto-slider-label">Play Phrases</span>
                          <span className="morph-auto-slider-val">{morphPlayPhrases}</span>
                        </div>
                        <input
                          type="range" min="4" max="64" step="4"
                          value={morphPlayPhrases}
                          onChange={(e) => onMorphPlayPhrasesChange(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="morph-auto-slider">
                        <div className="morph-auto-slider-header">
                          <span className="morph-auto-slider-label">Morph Phrases</span>
                          <span className="morph-auto-slider-val">{morphTransitionPhrases}</span>
                        </div>
                        <input
                          type="range" min="2" max="32" step="2"
                          value={morphTransitionPhrases}
                          onChange={(e) => onMorphTransitionPhrasesChange(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="morph-cycle-text">
                        Cycle: {morphPlayPhrases}→morph({morphTransitionPhrases})→{morphPlayPhrases}→morph({morphTransitionPhrases})
                      </div>
                      {morphCountdown && engineState.isRunning && (
                        <div className="morph-countdown">
                          <div className="morph-countdown-phase">{morphCountdown.phase}</div>
                          <div className="morph-countdown-value">
                            {morphCountdown.phrasesLeft} phrase{morphCountdown.phrasesLeft !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* State Preset Save/Load */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('state-presets')}>
              <span className={`harmony-section-chevron ${expandedSections.has('state-presets') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">State Presets</span>
            </div>
            {expandedSections.has('state-presets') && (
              <div className="harmony-section-body">
                <PresetFamilyTree
                  level="state"
                  scope="global"
                  state={state}
                  currentName={statePresetName}
                  onLoadSlotA={onLoadMorphA}
                  onLoadSlotB={onLoadMorphB}
                  sliderModes={sliderModes}
                  dualSliderRanges={dualSliderRanges}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Harmony Engine */}
      <div className="global-engine-panel">
        <div className="harmony-card">
          <h3 className="harmony-card-title">Harmony Engine</h3>

          {/* Scale & Tension */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('scale-tension')}>
              <span className={`harmony-section-chevron ${expandedSections.has('scale-tension') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Scale & Tension</span>
            </div>
            {expandedSections.has('scale-tension') && (
              <div className="harmony-section-body">
                <div className="harmony-grid-2">
                  <Select
                    label="Scale Mode"
                    value={state.scaleMode}
                    options={[
                      { value: 'auto', label: 'Auto (tension-based)' },
                      { value: 'manual', label: 'Manual' },
                    ]}
                    onChange={(v: string) => onSelectChange('scaleMode', v)}
                  />
                  <Select
                    label="Seed Window"
                    value={state.seedWindow}
                    options={[
                      { value: 'hour', label: 'Hour (changes hourly)' },
                      { value: 'day', label: 'Day (changes daily)' },
                    ]}
                    onChange={(v: string) => onSelectChange('seedWindow', v)}
                  />
                </div>
                {state.scaleMode === 'manual' && (
                  <Select
                    label="Scale Family"
                    value={state.manualScale}
                    options={SCALE_FAMILIES.map((s) => ({ value: s.name, label: `${NOTE_NAMES[state.rootNote]} ${s.name}` }))}
                    onChange={(v: string) => onSelectChange('manualScale', v)}
                  />
                )}
                <div className="harmony-grid-2">
                  <Slider label="Tension" value={state.tension} paramKey="tension" onChange={onParamChange} {...sliderProps('tension')} />
                  <Slider label="Randomness" value={state.randomness} paramKey="randomness" onChange={onParamChange} {...sliderProps('randomness')} />
                </div>
                <div className="harmony-grid-2">
                  <Slider label="Walk Speed" value={state.randomWalkSpeed} paramKey="randomWalkSpeed" logarithmic onChange={onParamChange} />
                  <Select
                    label="Walk Mode"
                    value={state.randomWalkMode}
                    options={[
                      { value: 'localBrownian', label: 'Local Brownian' },
                      { value: 'globalWalk', label: 'Global Epoch Walk' },
                    ]}
                    onChange={(v: string) => onSelectChange('randomWalkMode', v)}
                    {...bindHelp('randomWalkMode')}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('transport-sync')}>
              <span className={`harmony-section-chevron ${expandedSections.has('transport-sync') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Transport & Sync</span>
            </div>
            {expandedSections.has('transport-sync') && (
              <div className="harmony-section-body">
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '8px', lineHeight: 1.4 }}>
                  {isSecondsMaster
                    ? `${phraseSeconds.toFixed(1)}s phrase is the master clock and derives ≈ ${transportMetrics.equivalentBpmFromPhraseClock.toFixed(1)} BPM`
                    : isBpmMaster
                      ? `${beatBpm.toFixed(1)} BPM is the master clock and derives ${transportMetrics.phraseDurationFromBeatClockSec.toFixed(2)}s phrases`
                      : `${phraseSeconds.toFixed(1)}s phrase seconds and ${beatBpm.toFixed(1)} BPM are independent; phrase clocks read seconds while beat clocks read the shared BPM grid`}
                  <br />
                  {`${state.transportBarsPerPhrase} bars of ${state.transportBeatsPerBar}/4 per phrase`}
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Primary Clock"
                    value={primaryClock}
                    options={[
                      { value: 'seconds', label: 'Phrase Seconds Master' },
                      { value: 'bpm', label: 'Shared BPM Master' },
                      { value: 'decoupled', label: 'Decoupled' },
                    ]}
                    onChange={(v: string) => onSelectChange('transportPrimaryClock', v)}
                    {...bindHelp('transportPrimaryClock')}
                  />
                  {isSecondsMaster ? (
                    <Slider
                      label="Phrase Seconds"
                      value={phraseSeconds}
                      paramKey="phraseLength"
                      onChange={onParamChange}
                      {...sliderProps('phraseLength')}
                    />
                  ) : isBpmMaster ? (
                    <Slider
                      label="Shared BPM"
                      value={beatBpm}
                      paramKey="sequencerMasterBPM"
                      onChange={onParamChange}
                      {...sliderProps('sequencerMasterBPM')}
                    />
                  ) : (
                    <div style={{ padding: '10px 12px', border: '1px solid #262626', borderRadius: '10px', background: '#141414' }}>
                      <div style={{ fontSize: '0.62rem', color: '#7f7f7f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                        Decoupled Transport
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#d4d4d8', lineHeight: 1.45 }}>
                        Phrase-based clocks use Phrase Seconds. Beat-based clocks and sequencers use Shared BPM.
                      </div>
                    </div>
                  )}
                </div>
                {isDecoupled && (
                  <div className="harmony-grid-2">
                    <Slider
                      label="Phrase Seconds"
                      value={phraseSeconds}
                      paramKey="phraseLength"
                      onChange={onParamChange}
                      {...sliderProps('phraseLength')}
                    />
                    <Slider
                      label="Shared BPM"
                      value={beatBpm}
                      paramKey="sequencerMasterBPM"
                      onChange={onParamChange}
                      {...sliderProps('sequencerMasterBPM')}
                    />
                  </div>
                )}
                <div className="harmony-grid-2">
                  <div style={{ padding: '10px 12px', border: '1px solid #262626', borderRadius: '10px', background: '#141414' }}>
                    <div style={{ fontSize: '0.62rem', color: '#7f7f7f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                      Beat Phrase from BPM
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isBpmMaster ? '#f5f5f5' : '#9ca3af' }}>
                      {transportMetrics.phraseDurationFromBeatClockSec.toFixed(2)}s
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', border: '1px solid #262626', borderRadius: '10px', background: '#141414' }}>
                    <div style={{ fontSize: '0.62rem', color: '#7f7f7f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                      Equivalent BPM from Phrase
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isSecondsMaster ? '#f5f5f5' : '#9ca3af' }}>
                      {transportMetrics.equivalentBpmFromPhraseClock.toFixed(1)}
                    </div>
                  </div>
                </div>
                <div className="harmony-grid-2">
                  <Slider
                    label="Bars / Phrase"
                    value={state.transportBarsPerPhrase}
                    paramKey="transportBarsPerPhrase"
                    onChange={onParamChange}
                    {...sliderProps('transportBarsPerPhrase')}
                  />
                  <Slider
                    label="Beats / Bar"
                    value={state.transportBeatsPerBar}
                    paramKey="transportBeatsPerBar"
                    onChange={onParamChange}
                    {...sliderProps('transportBeatsPerBar')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Harmony / Pad Clock"
                    value={state.harmonyClockSource}
                    options={[
                      { value: 'globalPhrase', label: 'Global Phrase' },
                      { value: 'localPhrase', label: 'Local Phrase' },
                      { value: 'globalBeat', label: 'Global Beat Phrase' },
                      { value: 'localBeat', label: 'Local Beat Phrase' },
                    ]}
                    onChange={(v: string) => onSelectChange('harmonyClockSource', v)}
                    {...bindHelp('harmonyClockSource')}
                  />
                  <Select
                    label="Harmony / Pad Apply"
                    value={state.harmonySyncPolicy}
                    options={[
                      { value: 'nextPhrase', label: 'Next Phrase' },
                      { value: 'free', label: 'Immediate' },
                      { value: 'restartNow', label: 'Restart Now' },
                    ]}
                    onChange={(v: string) => onSelectChange('harmonySyncPolicy', v)}
                    {...bindHelp('harmonySyncPolicy')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Lead Random Clock"
                    value={state.leadRandomClockSource}
                    options={[
                      { value: 'globalPhrase', label: 'Global Phrase' },
                      { value: 'localPhrase', label: 'Local Phrase' },
                      { value: 'globalBeat', label: 'Global Beat Phrase' },
                      { value: 'localBeat', label: 'Local Beat Phrase' },
                    ]}
                    onChange={(v: string) => onSelectChange('leadRandomClockSource', v)}
                    {...bindHelp('leadRandomClockSource')}
                  />
                  <Select
                    label="Lead Random Apply"
                    value={state.leadRandomSyncPolicy}
                    options={[
                      { value: 'nextPhrase', label: 'Next Phrase' },
                      { value: 'free', label: 'Immediate' },
                    ]}
                    onChange={(v: string) => onSelectChange('leadRandomSyncPolicy', v)}
                    {...bindHelp('leadRandomSyncPolicy')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Synth Euclid Clock"
                    value={state.synthEuclidClockSource}
                    options={[
                      { value: 'localBeat', label: 'Local Beat' },
                      { value: 'globalBeat', label: 'Global Beat' },
                    ]}
                    onChange={(v: string) => onSelectChange('synthEuclidClockSource', v)}
                    {...bindHelp('synthEuclidClockSource')}
                  />
                  <Select
                    label="Synth Euclid Join"
                    value={state.synthEuclidJoinPolicy}
                    options={[
                      { value: 'bar', label: 'Next Bar' },
                      { value: 'grid', label: 'Grid' },
                    ]}
                    onChange={(v: string) => onSelectChange('synthEuclidJoinPolicy', v)}
                    {...bindHelp('synthEuclidJoinPolicy')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Drum Euclid Clock"
                    value={state.drumEuclidClockSource}
                    options={[
                      { value: 'localBeat', label: 'Local Beat' },
                      { value: 'globalBeat', label: 'Global Beat' },
                    ]}
                    onChange={(v: string) => onSelectChange('drumEuclidClockSource', v)}
                    {...bindHelp('drumEuclidClockSource')}
                  />
                  <Select
                    label="Drum Euclid Join"
                    value={state.drumEuclidJoinPolicy}
                    options={[
                      { value: 'bar', label: 'Next Bar' },
                      { value: 'grid', label: 'Grid' },
                    ]}
                    onChange={(v: string) => onSelectChange('drumEuclidJoinPolicy', v)}
                    {...bindHelp('drumEuclidJoinPolicy')}
                  />
                </div>
                <div style={{ marginTop: '8px', padding: '8px 10px', background: '#161616', border: '1px solid #262626', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#c084fc', fontWeight: 700, marginBottom: '6px' }}>Next Events</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 12px', fontSize: '0.68rem' }}>
                    <div><span style={{ color: '#777' }}>Harmony:</span> <span style={{ color: '#ddd' }}>{engineState.transportDebug?.nextHarmonyEventIn !== null && engineState.transportDebug?.nextHarmonyEventIn !== undefined ? `${engineState.transportDebug.nextHarmonyEventIn.toFixed(2)}s` : '—'}</span></div>
                    <div><span style={{ color: '#777' }}>Phrase:</span> <span style={{ color: '#ddd' }}>{engineState.transportDebug ? `${engineState.transportDebug.nextPhraseBoundaryIn.toFixed(2)}s` : '—'}</span></div>
                    <div><span style={{ color: '#777' }}>Progression:</span> <span style={{ color: '#ddd' }}>{engineState.transportDebug?.nextProgressionStepIn !== null && engineState.transportDebug?.nextProgressionStepIn !== undefined ? `${engineState.transportDebug.nextProgressionStepIn.toFixed(2)}s` : '—'}</span></div>
                    <div><span style={{ color: '#777' }}>Beat BPM:</span> <span style={{ color: '#ddd' }}>{transportMetrics.effectiveBpm.toFixed(1)}</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Root & CoF + Chord Progression side by side */}
          <div className="harmony-row-2col">
            {/* Root & CoF Drift */}
            <div className="harmony-section">
              <div className="harmony-section-header" onClick={() => toggleSection('root-cof')}>
                <span className={`harmony-section-chevron ${expandedSections.has('root-cof') ? 'expanded' : ''}`}>▶</span>
                <span className="harmony-section-name">Root & CoF Drift</span>
              </div>
              {expandedSections.has('root-cof') && (
                <div className="harmony-section-body">
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
                    onChange={(v: string) => onSelectChange('rootNote', parseInt(v, 10))}
                  />
                  <div className="cof-drift-block">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: state.cofDriftEnabled ? '#4ade80' : '#666' }}>
                        CoF Drift
                      </span>
                      <button
                        onClick={() => onSelectChange('cofDriftEnabled', !state.cofDriftEnabled)}
                        style={{
                          padding: '3px 10px',
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
                      size={140}
                      isMorphing={!!morphCoFViz}
                      morphStartRoot={morphCoFViz?.startRoot}
                      morphTargetRoot={morphCoFViz?.targetRoot}
                      morphProgress={morphPosition}
                      onSelectRoot={(semitone: number) => {
                        onSelectChange('rootNote', semitone);
                        onResetCofDrift();
                      }}
                    />
                    {state.cofDriftEnabled && (
                      <>
                        <Slider label="Rate (phrases)" value={state.cofDriftRate} paramKey="cofDriftRate" onChange={onParamChange} />
                        <Select
                          label="Direction"
                          value={state.cofDriftDirection}
                          options={[
                            { value: 'cw', label: 'CW' },
                            { value: 'ccw', label: 'CCW' },
                            { value: 'random', label: 'Rnd' },
                          ]}
                          onChange={(v: string) => onSelectChange('cofDriftDirection', v)}
                        />
                        <Slider label="Range (steps)" value={state.cofDriftRange} paramKey="cofDriftRange" onChange={onParamChange} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Chord Progression */}
            <div className="harmony-section">
              <div className="harmony-section-header" onClick={() => toggleSection('chord-progression')}>
                <span className={`harmony-section-chevron ${expandedSections.has('chord-progression') ? 'expanded' : ''}`}>▶</span>
                <span className="harmony-section-name">Chord Progression</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectChange('chordProgressionEnabled', !state.chordProgressionEnabled); }}
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    background: state.chordProgressionEnabled ? '#22c55e' : '#333',
                    border: 'none',
                    borderRadius: '4px',
                    color: state.chordProgressionEnabled ? '#000' : '#888',
                    cursor: 'pointer',
                  }}
                >
                  {state.chordProgressionEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {expandedSections.has('chord-progression') && state.chordProgressionEnabled && (
                <div className="harmony-section-body">
                  <div className="harmony-grid-2">
                    <Select
                      label="Clock Source"
                      value={state.chordProgressionClockSource}
                      options={[
                        { value: 'harmony', label: 'Follow Harmony' },
                        { value: 'globalPhrase', label: 'Global Phrase' },
                        { value: 'localPhrase', label: 'Local Phrase' },
                      ]}
                      onChange={(v: string) => onSelectChange('chordProgressionClockSource', v)}
                      {...bindHelp('chordProgressionClockSource')}
                    />
                    <Select
                      label="Step Length"
                      value={String(state.chordProgressionPhraseMultiplier)}
                      options={[
                        { value: '1', label: '1 Phrase' },
                        { value: '2', label: '2 Phrases' },
                        { value: '4', label: '4 Phrases' },
                        { value: '8', label: '8 Phrases' },
                      ]}
                      onChange={(v: string) => onSelectChange('chordProgressionPhraseMultiplier', parseInt(v, 10))}
                      {...bindHelp('chordProgressionPhraseMultiplier')}
                    />
                  </div>
                  <Slider
                    label="Pattern Length"
                    value={state.chordProgressionSteps}
                    paramKey="chordProgressionSteps"
                    onChange={onParamChange}
                    {...sliderProps('chordProgressionSteps')}
                  />
                  <Select
                    label="Preset"
                    value="custom"
                    options={[
                      { value: 'custom', label: 'Custom' },
                      { value: '0,3,4,0', label: 'I – IV – V – I' },
                      { value: '0,5,3,4', label: 'I – vi – IV – V' },
                      { value: '1,4,0,0', label: 'ii – V – I – I' },
                      { value: '0,2,5,3', label: 'I – iii – vi – IV' },
                      { value: '0,4,5,3', label: 'I – V – vi – IV' },
                      { value: '0,3,1,4', label: 'I – IV – ii – V' },
                      { value: '0,5,3,4,0,3,4,0', label: 'I – vi – IV – V – I – IV – V – I' },
                      { value: '0,6,5,6', label: 'i – VII – VI – VII' },
                      { value: '0,6,3,0', label: 'I – bVII – IV – I' },
                    ]}
                    onChange={(v: string) => {
                      if (v !== 'custom') {
                        const degrees = v.split(',').map(Number);
                        onSelectChange('chordProgressionPattern', degrees);
                        onSelectChange('chordProgressionSteps', degrees.length);
                        onSelectChange('chordProgressionStepEnabled', new Array(degrees.length).fill(true));
                      }
                    }}
                  />
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '5px' }}>Progression Steps</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))', gap: '6px' }}>
                      {Array.from({ length: progressionSteps }, (_, i) => {
                        const deg = (state.chordProgressionPattern ?? [])[i] ?? 0;
                        const isActive = progressionStepEnabled[i] ?? true;
                        return (
                          <div
                            key={i}
                            style={{
                              border: `1px solid ${isActive ? '#7c3aed' : '#333'}`,
                              background: isActive ? 'rgba(124, 58, 237, 0.14)' : '#171717',
                              borderRadius: '8px',
                              padding: '6px 5px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '5px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.6rem', color: '#888' }}>{`S${i + 1}`}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextEnabled = progressionStepEnabled.slice();
                                  nextEnabled[i] = !isActive;
                                  onSelectChange('chordProgressionStepEnabled', nextEnabled);
                                }}
                                style={{
                                  fontSize: '0.56rem',
                                  fontWeight: 700,
                                  color: isActive ? '#ede9fe' : '#777',
                                  background: isActive ? 'rgba(167, 139, 250, 0.18)' : '#222',
                                  border: '1px solid #3a3a3a',
                                  borderRadius: '999px',
                                  padding: '2px 5px',
                                  cursor: 'pointer',
                                }}
                                {...bindHelp('chordProgressionStepEnabled', { label: 'Step On/Off' })}
                              >
                                {isActive ? 'on' : 'off'}
                              </button>
                            </div>
                            <select
                              value={deg}
                              onChange={(e) => {
                                const newPattern = [...(state.chordProgressionPattern ?? [0, 3, 4, 0])];
                                while (newPattern.length < progressionSteps) newPattern.push(0);
                                newPattern[i] = parseInt(e.target.value, 10);
                                onSelectChange('chordProgressionPattern', newPattern);
                              }}
                              style={{
                                background: '#222',
                                color: '#ddd',
                                border: '1px solid #3a3a3a',
                                borderRadius: '6px',
                                padding: '4px 3px',
                                fontSize: '0.65rem',
                                cursor: 'pointer',
                              }}
                            >
                              {DEGREE_LABELS.map((label, d) => (
                                <option key={d} value={d}>{label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Per-Engine Tension */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('per-engine-tension')}>
              <span className={`harmony-section-chevron ${expandedSections.has('per-engine-tension') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Per-Engine Tension</span>
            </div>
            {expandedSections.has('per-engine-tension') && (
              <div className="harmony-section-body">
                <div className="tension-engine-grid">
                  {([
                    ['pad', 'Pad', 'padTensionMode', 'padTensionValue'],
                    ['lead', 'Lead', 'leadTensionMode', 'leadTensionValue'],
                    ['synthEuclid', 'Synth', 'synthEuclidTensionMode', 'synthEuclidTensionValue'],
                    ['granular', 'Gran', 'granularTensionMode', 'granularTensionValue'],
                    ['reverb', 'Reverb', 'reverbTensionMode', 'reverbTensionValue'],
                    ['drum', 'Drum', 'drumTensionMode', 'drumTensionValue'],
                  ] as const).map(([_key, label, modeKey, valueKey]) => {
                    const mode = state[modeKey] ?? 'follow';
                    const value = state[valueKey] ?? 0;
                    const isBypassed = mode === 'bypass';
                    const effectiveT = isBypassed ? null
                      : mode === 'locked' ? Math.max(0, Math.min(1, value))
                      : Math.max(0, Math.min(1, (state.tension ?? 0.3) + value));
                    return (
                      <div key={modeKey} className="tension-engine-cell" style={isBypassed ? { opacity: 0.4 } : undefined}>
                        <div className="tension-engine-header">
                          <button
                            className={`tension-lock-btn ${mode === 'locked' ? 'locked' : ''}`}
                            onClick={() => {
                              const newMode = mode === 'follow' ? 'locked'
                                : mode === 'locked' ? 'bypass' : 'follow';
                              onSelectChange(modeKey, newMode);
                              if (newMode === 'locked') {
                                const effective = Math.max(0, Math.min(1, (state.tension ?? 0.3) + value));
                                onParamChange(valueKey, effective);
                              } else if (newMode === 'follow') {
                                onParamChange(valueKey, 0);
                              }
                            }}
                            title={mode === 'follow' ? 'Following (click to lock)' : mode === 'locked' ? 'Locked (click to bypass)' : 'Bypassed (click to follow)'}
                          >
                            {mode === 'locked' ? '▪' : mode === 'bypass' ? '⊘' : '▫'}
                          </button>
                          <span className="tension-engine-name">{label}</span>
                          {effectiveT !== null && (
                            <span className="tension-effective-value">{effectiveT.toFixed(2)}</span>
                          )}
                        </div>
                        {!isBypassed && (
                          <Slider
                            label=""
                            value={value}
                            paramKey={valueKey}
                            onChange={onParamChange}
                            {...(mode === 'locked'
                              ? { min: 0, max: 1, step: 0.01 }
                              : { min: -0.5, max: 0.5, step: 0.01 })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tension Arc */}
          {engineState.isRunning && engineState.harmonyState?.tensionArc && (
            <div className="harmony-section">
              <div className="harmony-section-body">
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Tension Arc</div>
                {(() => {
                  const arc = engineState.harmonyState!.tensionArc;
                  const colorMap: Record<TensionArcType, string> = {
                    sustain: '#4ade80',
                    building: '#facc15',
                    resolving: '#60a5fa',
                  };
                  const labelMap: Record<TensionArcType, string> = {
                    sustain: 'Sustain',
                    building: 'Building',
                    resolving: 'Resolving',
                  };
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      background: '#1a1a1a',
                      borderRadius: '6px',
                      border: `1px solid ${colorMap[arc.type]}33`,
                    }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: colorMap[arc.type],
                        boxShadow: `0 0 6px ${colorMap[arc.type]}88`,
                      }} />
                      <span style={{ fontSize: '0.75rem', color: colorMap[arc.type], fontWeight: 'bold' }}>
                        {labelMap[arc.type]}
                      </span>
                      {arc.phrasesRemaining > 0 && (
                        <span style={{ fontSize: '0.65rem', color: '#666' }}>
                          {arc.phrasesRemaining} phrase{arc.phrasesRemaining !== 1 ? 's' : ''} left
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Recording & Timer Card */}
        <div className="utility-card">
          <h3 className="utility-card-title">Recording & Timer</h3>

          {/* Recording Section */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('recording')}>
              <span className={`harmony-section-chevron ${expandedSections.has('recording') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Recording</span>
            </div>
            {expandedSections.has('recording') && (
              <div className="harmony-section-body">
                <div className="utility-sub-label">Output Format</div>
                <div className="utility-hint">Select one or both formats</div>
                <div className="utility-btn-row">
                  <button
                    onClick={() => onRecordFormatsChange(prev => ({ ...prev, webm: !prev.webm }))}
                    disabled={isRecording}
                    className={`utility-toggle-btn ${recordFormats.webm ? 'active' : ''}`}
                  >
                    <span className="utility-toggle-dot">{recordFormats.webm ? '●' : '○'}</span> WebM
                    <span className="utility-toggle-hint">Opus · ~2 MB/min</span>
                  </button>
                  <button
                    onClick={() => onRecordFormatsChange(prev => ({ ...prev, wav: !prev.wav }))}
                    disabled={isRecording}
                    className={`utility-toggle-btn ${recordFormats.wav ? 'active' : ''}`}
                  >
                    <span className="utility-toggle-dot">{recordFormats.wav ? '●' : '○'}</span> WAV
                    <span className="utility-toggle-hint">24-bit 48kHz · ~17 MB/min</span>
                  </button>
                </div>
                <div className="utility-sub-label" style={{ marginTop: '6px' }}>Stem Recording (Pre-Reverb)</div>
                <div className="utility-stem-grid">
                  {STEM_RECORD_TRACK_IDS.map((key) => (
                    <button
                      key={key}
                      onClick={() => onRecordStemsChange(key)}
                      disabled={isRecording}
                      className={`utility-stem-btn ${recordStems[key] ? 'active' : ''}`}
                    >
                      {recordStems[key] ? '●' : '○'} {STEM_RECORD_TRACK_LABELS[key]}
                    </button>
                  ))}
                </div>
                {isRecording && (
                  <div className="utility-status recording-status">
                    <div className="utility-status-value recording-pulse">● {formatRecordingTime(recordingDuration)}</div>
                    <div className="utility-status-hint">Recording in progress...</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Playback Timer Section */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('playback-timer')}>
              <span className={`harmony-section-chevron ${expandedSections.has('playback-timer') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Playback Timer</span>
              <button
                onClick={(e) => { e.stopPropagation(); onTimerEnabledChange(!playbackTimerEnabled); }}
                className={`utility-on-off-btn ${playbackTimerEnabled ? 'on' : ''}`}
              >
                {playbackTimerEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {expandedSections.has('playback-timer') && (
              <div className="harmony-section-body">
                <div className="utility-sub-label">
                  Duration {engineState.isRunning && playbackTimerEnabled && <span style={{ color: '#f59e0b', fontSize: '0.6rem' }}>(click to reset)</span>}
                </div>
                <div className="utility-duration-row">
                  {[5, 15, 30, 60, 90, 120].map(mins => (
                    <button
                      key={mins}
                      onClick={() => {
                        onTimerMinutesChange(mins);
                        if (engineState.isRunning && playbackTimerEnabled) {
                          onTimerRemainingChange(mins * 60);
                        }
                      }}
                      className={`utility-dur-btn ${playbackTimerMinutes === mins ? 'active' : ''}`}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                  <div className="utility-custom-time">
                    <input
                      type="number"
                      min="1"
                      max="480"
                      value={![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? playbackTimerMinutes : ''}
                      placeholder="Custom"
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 480) {
                          onTimerMinutesChange(val);
                          if (engineState.isRunning && playbackTimerEnabled) {
                            onTimerRemainingChange(val * 60);
                          }
                        }
                      }}
                      className={`utility-custom-input ${![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? 'active' : ''}`}
                    />
                    <span className="utility-custom-suffix">min</span>
                  </div>
                </div>
                {playbackTimerEnabled && playbackTimerRemaining !== null && (
                  <div className="utility-status timer-status">
                    <div className="utility-status-value">{Math.floor(playbackTimerRemaining / 60)}:{(playbackTimerRemaining % 60).toString().padStart(2, '0')}</div>
                    <div className="utility-status-hint">Remaining until auto-stop</div>
                  </div>
                )}
                {playbackTimerEnabled && playbackTimerRemaining === null && !engineState.isRunning && (
                  <div className="utility-status timer-status" style={{ opacity: 0.6 }}>
                    <div className="utility-status-hint">Timer will start when playback begins ({playbackTimerMinutes} min)</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default GlobalPage;
