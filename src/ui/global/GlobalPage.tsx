import React from 'react';
import type { SliderState, SavedPreset } from '../state';
import type { TensionArcType } from '../../audio/harmony';
import { SCALE_FAMILIES } from '../../audio/scales';
import { isAtEndpoint0, isAtEndpoint1 } from '../../audio/morphUtils';
import './global.css';

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ═══════════════ Props ═══════════════

export interface GlobalPageProps {
  state: SliderState;
  isMobile: boolean;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CloudPresetsComponent: React.ComponentType<any>;

  // Engine state
  engineState: {
    cofCurrentStep: number;
    isRunning: boolean;
    harmonyState?: { tensionArc: { type: TensionArcType; phrasesRemaining: number } } | null;
  };
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
  savedPresets: SavedPreset[];
  onSelectMorphA: (presetName: string) => void;
  onClearMorphA: () => void;
  onSelectMorphB: (presetName: string) => void;
  onClearMorphB: () => void;
  onMorphPositionChange: (value: number) => void;
  onMorphModeChange: (mode: 'manual' | 'auto') => void;
  onMorphPlayPhrasesChange: (value: number) => void;
  onMorphTransitionPhrasesChange: (value: number) => void;

  // Cloud Presets
  onLoadCloudPreset: (presetState: SliderState, name: string) => void;

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
  CloudPresetsComponent: CloudPresets,
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
  savedPresets,
  onSelectMorphA,
  onClearMorphA,
  onSelectMorphB,
  onClearMorphB,
  onMorphPositionChange,
  onMorphModeChange,
  onMorphPlayPhrasesChange,
  onMorphTransitionPhrasesChange,
  onLoadCloudPreset,
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
}) => {
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    () => new Set(['mixer-buses', 'scale-tension', 'root-cof', 'chord-progression', 'per-engine-tension', 'morph', 'recording', 'playback-timer'])
  );
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
                    <Slider label="Reverb" value={state.synthReverbSend} paramKey="synthReverbSend" onChange={onParamChange} {...sliderProps('synthReverbSend')} />
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
                    <Slider label="Waves" value={state.oceanWaveSynthLevel} paramKey="oceanWaveSynthLevel" onChange={onParamChange} {...sliderProps('oceanWaveSynthLevel')} />
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
                  <select
                    value={morphPresetA?.name || ''}
                    onChange={(e) => onSelectMorphA(e.target.value)}
                    className={`morph-select ${morphPresetA ? 'filled-a' : ''}`}
                  >
                    <option value="">(empty - using current)</option>
                    {savedPresets.map((preset, idx) => (
                      <option key={`${preset.name}-${idx}`} value={preset.name}>{preset.name}</option>
                    ))}
                  </select>
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
                  <select
                    value={morphPresetB?.name || ''}
                    onChange={(e) => onSelectMorphB(e.target.value)}
                    className={`morph-select ${morphPresetB ? 'filled-b' : ''}`}
                  >
                    <option value="">(empty - using current)</option>
                    {savedPresets.map((preset, idx) => (
                      <option key={`${preset.name}-${idx}`} value={preset.name}>{preset.name}</option>
                    ))}
                  </select>
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

          {/* Cloud Presets Section */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('cloud-presets')}>
              <span className={`harmony-section-chevron ${expandedSections.has('cloud-presets') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Cloud Presets</span>
            </div>
            {expandedSections.has('cloud-presets') && (
              <div className="harmony-section-body">
                <CloudPresets
                  currentState={state}
                  onLoadPreset={onLoadCloudPreset}
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
                  <Slider label={`Phrase (${state.phraseLength ?? 16}s)`} value={state.phraseLength ?? 16} paramKey="phraseLength" onChange={onParamChange} {...sliderProps('phraseLength')} />
                </div>
                <div className="harmony-grid-2">
                  <Slider label="Randomness" value={state.randomness} paramKey="randomness" onChange={onParamChange} {...sliderProps('randomness')} />
                  <Slider label="Walk Speed" value={state.randomWalkSpeed} paramKey="randomWalkSpeed" logarithmic onChange={onParamChange} />
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
                  <Select
                    label="Phrases per Step"
                    value={String(state.chordProgressionPhraseMultiplier)}
                    options={[
                      { value: '1', label: '×1' },
                      { value: '2', label: '×2' },
                      { value: '4', label: '×4' },
                      { value: '8', label: '×8' },
                    ]}
                    onChange={(v: string) => onSelectChange('chordProgressionPhraseMultiplier', parseInt(v, 10))}
                  />
                  <Slider
                    label="Pattern Length"
                    value={state.chordProgressionSteps}
                    paramKey="chordProgressionSteps"
                    onChange={onParamChange}
                    {...sliderProps('chordProgressionSteps')}
                  />
                  <Slider
                    label="Euclidean Hits"
                    value={state.chordProgressionHits}
                    paramKey="chordProgressionHits"
                    onChange={onParamChange}
                    {...sliderProps('chordProgressionHits')}
                  />
                  <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '2px' }}>
                    {state.chordProgressionHits}/{state.chordProgressionSteps} — rests sustain prev chord
                  </div>
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
                      }
                    }}
                  />
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '3px' }}>Chord Degrees</div>
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {Array.from({ length: state.chordProgressionSteps }, (_, i) => {
                        const DEGREE_LABELS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
                        const deg = (state.chordProgressionPattern ?? [])[i] ?? 0;
                        return (
                          <select
                            key={i}
                            value={deg}
                            onChange={(e) => {
                              const newPattern = [...(state.chordProgressionPattern ?? [0, 3, 4, 0])];
                              while (newPattern.length < state.chordProgressionSteps) newPattern.push(0);
                              newPattern[i] = parseInt(e.target.value, 10);
                              onSelectChange('chordProgressionPattern', newPattern);
                            }}
                            style={{
                              background: '#222',
                              color: '#ccc',
                              border: '1px solid #444',
                              borderRadius: '4px',
                              padding: '3px 2px',
                              fontSize: '0.65rem',
                              minWidth: '38px',
                              textAlign: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            {DEGREE_LABELS.map((label, d) => (
                              <option key={d} value={d}>{label}</option>
                            ))}
                          </select>
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
                      onClick={() => onRecordStemsChange(key)}
                      disabled={isRecording}
                      className={`utility-stem-btn ${recordStems[key] ? 'active' : ''}`}
                    >
                      {recordStems[key] ? '●' : '○'} {label}
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
