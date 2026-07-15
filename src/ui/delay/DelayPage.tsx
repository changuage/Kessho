import React, { useCallback, useMemo, useState } from 'react';
import type { SliderRendererProps, SliderRuntimeRendererProps } from '../sliderSystem';
import { formatIndexedDelayDivision, getSliderNumericValue, type SliderMode, type SliderState } from '../state';
import type { SliderPageId } from '../sliderHelpCatalog';
import { useSliderHelp } from '../SliderHelpOverlay';
import { getGranularPresetMeta, getGranularPresetSuggestedDelayBGranularSend } from '../granular/granularPresets';
import { DELAY_B_TAPE_HEAD_SPACING_RATIOS, delayNoteToSeconds } from '../../audio/delayBuses';
import { applyParams, extractParams } from '../../presets/codec';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';
import { OptionalVisualizerGate } from '../components/OptionalVisualizerGate';
import { useVisualFeatureToggle } from '../hooks/useVisualFeatureToggle';
import DelayRhythmMap from './DelayRhythmMap';
import './delay.css';

const FILTER_TYPE_OPTIONS = [
  { value: 'lowpass', label: 'LP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'highpass', label: 'HP' },
] as const;

const PATTERN_OPTIONS = [
  { value: 'cascade', label: 'Spread' },
  { value: 'golden', label: 'Ratio' },
  { value: 'mirror', label: 'Ping' },
  { value: 'dotted', label: 'Dotted' },
] as const;

const WARP_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'filterSweep', label: 'Filter' },
  { value: 'pitchDrift', label: 'Pitch' },
  { value: 'grainCrossfade', label: 'Smear' },
] as const;

const DELAY_B_ALGORITHM_OPTIONS = [
  { value: 'clockedSpace', label: 'Clocked' },
  { value: 'tapeHeads', label: 'Tape' },
] as const;

const TAPE_SPACING_OPTIONS = [
  { value: 'even', label: 'Even' },
  { value: 'triplet', label: 'Triplet' },
  { value: 'golden', label: 'Golden' },
  { value: 'silver', label: 'Silver' },
] as const;

const TAPE_HEADS = [
  { index: 1, enabled: 'delayBTapeHead1Enabled', level: 'delayBTapeHead1Level', pan: 'delayBTapeHead1Pan' },
  { index: 2, enabled: 'delayBTapeHead2Enabled', level: 'delayBTapeHead2Level', pan: 'delayBTapeHead2Pan' },
  { index: 3, enabled: 'delayBTapeHead3Enabled', level: 'delayBTapeHead3Level', pan: 'delayBTapeHead3Pan' },
  { index: 4, enabled: 'delayBTapeHead4Enabled', level: 'delayBTapeHead4Level', pan: 'delayBTapeHead4Pan' },
] as const;

export interface DelayPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntimeRendererProps<keyof SliderState>;
  SliderComponent: React.ComponentType<SliderRendererProps<keyof SliderState>>;
  sliderModes?: Record<string, SliderMode>;
  dualSliderRanges?: Record<string, { min: number; max: number }>;
  onDualStateChange?: (
    relevantKeys: string[],
    dualRanges?: Record<string, { min: number; max: number }>,
    sliderModes?: Record<string, SliderMode>,
  ) => void;
}

/* ── Feed Badge ── */
const FeedBadge: React.FC<{ feeds: string[] }> = ({ feeds }) => {
  const active = feeds.length > 0;
  return (
    <span className="delay-feed-badge" title={active ? feeds.join(', ') : 'No active feeds'}>
      <span className="delay-feed-dot" style={{ background: active ? '#48c4a0' : '#444' }} />
      <span>{feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'}</span>
    </span>
  );
};

const DelayPage: React.FC<DelayPageProps> = ({
  state,
  isMobile,
  onParamChange,
  onSelectChange,
  onStateChange,
  sliderProps,
  SliderComponent,
  sliderModes,
  dualSliderRanges,
  onDualStateChange,
}) => {
  const Slider = SliderComponent;
  const { announceHelp, announceSlider } = useSliderHelp();
  const delayRhythmMapToggle = useVisualFeatureToggle(
    'kessho.visualizers.delayRhythmMap.enabled',
    !isMobile,
  );
  const echoPresetOptions = useCallback<NonNullable<UsePresetsOptions['customExtract']>>((snapshot) => ({
    ...extractParams(snapshot, 1, 'echoLine'),
    ...extractParams(snapshot, 1, 'leadDelay'),
    drumDelayNoteL: snapshot.drumDelayNoteL,
    drumDelayNoteR: snapshot.drumDelayNoteR,
  }), []);
  const applyEchoPreset = useCallback<NonNullable<UsePresetsOptions['customApply']>>((snapshot, data) => {
    let next = applyParams(snapshot, data, 1, 'echoLine');
    next = applyParams(next, data, 1, 'leadDelay');
    if ('drumDelayNoteL' in data) {
      next = { ...next, drumDelayNoteL: data.drumDelayNoteL as SliderState['drumDelayNoteL'] };
    }
    if ('drumDelayNoteR' in data) {
      next = { ...next, drumDelayNoteR: data.drumDelayNoteR as SliderState['drumDelayNoteR'] };
    }
    return next;
  }, []);
  const echoPresetDropdownOptions = useMemo<UsePresetsOptions>(() => ({
    customExtract: echoPresetOptions,
    customApply: applyEchoPreset,
  }), [applyEchoPreset, echoPresetOptions]);

  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(['echo-line', 'clocked-space']),
  );
  const [echoPresetName, setEchoPresetName] = useState<string | undefined>();
  const [clockedPresetName, setClockedPresetName] = useState<string | undefined>();
  const [kitPresetName, setKitPresetName] = useState<string | undefined>();
  const [sourcePresetName, setSourcePresetName] = useState<string | undefined>();
  const handleEchoPresetLoad = useCallback((_entry: PresetEntry, _data: Record<string, unknown>) => {
    setEchoPresetName(_entry.name);
  }, []);
  const handleClockedPresetLoad = useCallback((_entry: PresetEntry, _data: Record<string, unknown>) => {
    setClockedPresetName(_entry.name);
  }, []);
  const handleKitPresetLoad = useCallback((_entry: PresetEntry, _data: Record<string, unknown>) => {
    setKitPresetName(_entry.name);
  }, []);
  const handleSourcePresetLoad = useCallback((_entry: PresetEntry, _data: Record<string, unknown>) => {
    setSourcePresetName(_entry.name);
  }, []);

  const toggleCard = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ── Feed computation ── */
  const delayAFeeds = [
    (state.pad1DelayASend ?? 0) > 0.001 ? 'Pad 1' : null,
    (state.pad2DelayASend ?? 0) > 0.001 ? 'Pad 2' : null,
    (state.lead1DelayASend ?? 0) > 0.001 ? 'Lead 1' : null,
    (state.lead2DelayASend ?? 0) > 0.001 ? 'Lead 2' : null,
    (state.drumDelayASend ?? 0) > 0.001 ? 'Drums' : null,
    (state.granularDelayASend ?? 0) > 0.001 ? 'Granular' : null,
    (state.oceanDelayASend ?? 0) > 0.001 ? 'Waves' : null,
    (state.waterDelayASend ?? 0) > 0.001 ? 'Water' : null,
    (state.insDelayASend ?? 0) > 0.001 ? 'Insects' : null,
  ].filter(Boolean) as string[];

  const delayBFeeds = [
    (state.granularDelayBSend ?? 0) > 0.001 ? 'Granular' : null,
    (state.pad1DelayBSend ?? 0) > 0.001 ? 'Pad 1' : null,
    (state.pad2DelayBSend ?? 0) > 0.001 ? 'Pad 2' : null,
    (state.lead1DelayBSend ?? 0) > 0.001 ? 'Lead 1' : null,
    (state.lead2DelayBSend ?? 0) > 0.001 ? 'Lead 2' : null,
    (state.delayAToBSend ?? 0) > 0.001 ? 'Echo Line' : null,
    (state.drumDelayBSend ?? 0) > 0.001 ? 'Drums' : null,
    (state.oceanDelayBSend ?? 0) > 0.001 ? 'Waves' : null,
    (state.waterDelayBSend ?? 0) > 0.001 ? 'Water' : null,
    (state.insDelayBSend ?? 0) > 0.001 ? 'Insects' : null,
    (state.delayBGranularSend ?? 0) > 0.001 ? 'Gran. return' : null,
  ].filter(Boolean) as string[];

  const selectedGranularPreset = getGranularPresetMeta(state.granularPreset);
  const linkedDelayBSendSuggestion = getGranularPresetSuggestedDelayBGranularSend(state.granularPreset);

  const bindSliderHelp = useCallback((paramKey: keyof SliderState, label: string, page: SliderPageId = 'delay') => ({
    onMouseEnter: () => announceSlider(String(paramKey), { label, page }),
    onPointerDown: () => announceSlider(String(paramKey), { label, page }),
    onFocus: () => announceSlider(String(paramKey), { label, page }),
  }), [announceSlider]);

  const bindHelp = useCallback((helpKey: string, options: { label?: string; page?: SliderPageId } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);

  const echoExpanded = expandedCards.has('echo-line');
  const clockedExpanded = expandedCards.has('clocked-space');
  const crossExpanded = expandedCards.has('cross-feeds');
  const linkageExpanded = expandedCards.has('linkage');
  const delayBAlgorithm = state.delayBAlgorithm ?? 'clockedSpace';
  const delayBTapeMode = delayBAlgorithm === 'tapeHeads';
  const delayBTapeSpacing = state.delayBTapeSpacing ?? 'even';

  const bpm = state.sequencerMasterBPM ?? 120;
  const echoTimeL = delayNoteToSeconds(state.drumDelayNoteL ?? '1/4', bpm);
  const echoTimeR = delayNoteToSeconds(state.drumDelayNoteR ?? '1/4', bpm);
  const clockedBaseTime = delayNoteToSeconds(state.granularDelayTime ?? '1/4', bpm);

  return (
    <div className={`delay-root${isMobile ? ' mobile' : ''}`}>
      <div className="delay-container">

      {/* ════ LEFT PANEL ════ */}
      <div className="delay-left">
        {/* ── Page Identity ── */}
        <div className="delay-source-preset-bar fx-page-header fx-page-header--identity">
          <span className="delay-source-preset-label fx-page-title">↭ Delay FX</span>
        </div>

        {/* ── Page-Level Source Preset (L3) ── */}
        <div className="delay-source-preset-card fx-kit-preset-card">
          <span className="fx-kit-preset-title">Preset</span>
          <PresetDropdown
            level="source"
            scope="delay"
            state={state}
            currentName={sourcePresetName}
            onLoad={handleSourcePresetLoad}
            onStateChange={onStateChange}
            sliderModes={sliderModes}
            dualSliderRanges={dualSliderRanges}
            onDualStateChange={onDualStateChange}
            compact
          />
        </div>

        {/* ── Echo Line ── */}
        <div
          className={`delay-card${echoExpanded ? ' expanded' : ''}`}
          style={{ '--sc': 'var(--accent-echo)' } as React.CSSProperties}
        >
          <div className="delay-card-header" onClick={() => toggleCard('echo-line')}>
            <div className="delay-card-header-left">
              <span className="delay-card-title">Echo Line</span>
              <span className="delay-card-subtitle">Delay A</span>
            </div>
            <div className="delay-card-header-right">
              <FeedBadge feeds={delayAFeeds} />
              <span className="delay-card-chevron">{echoExpanded ? '▼' : '▶'}</span>
            </div>
          </div>

          {echoExpanded && (
            <div className="delay-card-body">
              {/* Preset selector */}
              <PresetDropdown
                level="engine"
                scope="echoLine"
                state={state}
                currentName={echoPresetName}
                onLoad={handleEchoPresetLoad}
                onStateChange={onStateChange}
                presetOptions={echoPresetDropdownOptions}
                sliderModes={sliderModes}
                dualSliderRanges={dualSliderRanges}
                onDualStateChange={onDualStateChange}
                compact
              />

              {/* Ping-Pong toggle */}
              <div className="delay-inline-toggle">
                <span className="delay-inline-toggle-label">Ping-Pong</span>
                <button
                  className={`delay-toggle-btn${state.delayAPingPong ? ' on' : ''}`}
                  onClick={() => onSelectChange('delayAPingPong', !state.delayAPingPong)}
                  {...bindHelp('delayAPingPong', { label: 'Ping-Pong', page: 'delay' })}
                >
                  {state.delayAPingPong ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Timing */}
              <Slider
                label="Left Division"
                value={getSliderNumericValue('drumDelayNoteL', state.drumDelayNoteL) ?? 0}
                paramKey="drumDelayNoteL"
                onChange={onParamChange}
                helpPage="delay"
                format={(value: number) => formatIndexedDelayDivision('drumDelayNoteL', value)}
                {...sliderProps('drumDelayNoteL')}
              />
              <Slider
                label="Right Division"
                value={getSliderNumericValue('drumDelayNoteR', state.drumDelayNoteR) ?? 0}
                paramKey="drumDelayNoteR"
                onChange={onParamChange}
                helpPage="delay"
                format={(value: number) => formatIndexedDelayDivision('drumDelayNoteR', value)}
                {...sliderProps('drumDelayNoteR')}
              />
              <div className="delay-select-grid">
                <label className="delay-select-field">
                  <span>Filter Type</span>
                  <select
                    value={state.delayAFilterType}
                    onChange={(e) => onSelectChange('delayAFilterType', e.target.value as SliderState['delayAFilterType'])}
                    {...bindSliderHelp('delayAFilterType', 'Filter Type')}
                  >
                    {FILTER_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Sliders */}
              <Slider label="Feedback" value={state.delayAFeedback} paramKey="delayAFeedback" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAFeedback')} />
              <Slider label="Mix" value={state.delayAMix} paramKey="delayAMix" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAMix')} />
              <Slider label="Filter" value={state.delayAFilter} paramKey="delayAFilter" unit=" Hz" logarithmic helpPage="delay" onChange={onParamChange} {...sliderProps('delayAFilter')} />
              <Slider label="Width" value={state.delayAWidth} paramKey="delayAWidth" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAWidth')} />
              <Slider label="Mod Rate" value={state.delayAModRate} paramKey="delayAModRate" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAModRate')} />
              <Slider label="Mod Depth" value={state.delayAModDepth} paramKey="delayAModDepth" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAModDepth')} />
              <Slider label="Duck" value={state.delayADuck} paramKey="delayADuck" onChange={onParamChange} helpPage="delay" {...sliderProps('delayADuck')} />
              <Slider label="Reverb Send" value={state.delayAReverbSend} paramKey="delayAReverbSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAReverbSend')} />
            </div>
          )}
        </div>

      </div>

      {/* ════ RIGHT PANEL ════ */}
      <div className="delay-right">

        {/* ── Delay Visualizer ── */}
        <div className="delay-card" style={{ '--sc': 'var(--accent-primary)' } as React.CSSProperties}>
          <div className="delay-card-body" style={{ padding: '8px 10px 10px' }}>
            <OptionalVisualizerGate
              enabled={delayRhythmMapToggle.enabled}
              title="Delay rhythm map"
              description="Paused by default on mobile."
              enableLabel="Show rhythm map"
              hideLabel="Hide rhythm map"
              onEnable={delayRhythmMapToggle.show}
              onHide={delayRhythmMapToggle.hide}
            >
              <DelayRhythmMap
                bpm={bpm}
                echoTimeL={echoTimeL}
                echoTimeR={echoTimeR}
                echoFeedback={state.delayAFeedback ?? 0.3}
                echoPingPong={state.delayAPingPong ?? false}
                echoWidth={state.delayAWidth ?? 0.5}
                clockedPattern={state.delayBPattern ?? 'cascade'}
                clockedWarp={state.delayBWarp ?? 'clean'}
                clockedActivity={state.granularDelayActivity ?? 0.5}
                clockedBaseTime={clockedBaseTime}
                clockedSpread={state.delayBSpread ?? 0.5}
                delayBAlgorithm={delayBAlgorithm}
                tapeSpacing={delayBTapeSpacing}
                tapeHeadEnabled={[
                  state.delayBTapeHead1Enabled ?? true,
                  state.delayBTapeHead2Enabled ?? true,
                  state.delayBTapeHead3Enabled ?? true,
                  state.delayBTapeHead4Enabled ?? true,
                ]}
                tapeHeadLevels={[
                  state.delayBTapeHead1Level ?? 0.72,
                  state.delayBTapeHead2Level ?? 0.8,
                  state.delayBTapeHead3Level ?? 0.88,
                  state.delayBTapeHead4Level ?? 1,
                ]}
                tapeHeadPans={[
                  state.delayBTapeHead1Pan ?? 0.28,
                  state.delayBTapeHead2Pan ?? 0.72,
                  state.delayBTapeHead3Pan ?? 0.38,
                  state.delayBTapeHead4Pan ?? 0.62,
                ]}
                aToBSend={state.delayAToBSend ?? 0}
                bToASend={state.delayBToASend ?? 0}
              />
            </OptionalVisualizerGate>
          </div>
        </div>

        {/* ── Delay B ── */}
        <div
          className={`delay-card${clockedExpanded ? ' expanded' : ''}`}
          style={{ '--sc': 'var(--accent-clocked)' } as React.CSSProperties}
        >
          <div className="delay-card-header" onClick={() => toggleCard('clocked-space')}>
            <div className="delay-card-header-left">
              <span className="delay-card-title">{delayBTapeMode ? 'Tape Heads' : 'Clocked Space'}</span>
              <span className="delay-card-subtitle">Delay B</span>
            </div>
            <div className="delay-card-header-right">
              <FeedBadge feeds={delayBFeeds} />
              <span className="delay-card-chevron">{clockedExpanded ? '▼' : '▶'}</span>
            </div>
          </div>

          {clockedExpanded && (
            <div className="delay-card-body delay-b-editor">
              <PresetDropdown
                level="engine"
                scope="clockedSpace"
                state={state}
                currentName={clockedPresetName}
                onLoad={handleClockedPresetLoad}
                onStateChange={onStateChange}
                sliderModes={sliderModes}
                dualSliderRanges={dualSliderRanges}
                onDualStateChange={onDualStateChange}
                compact
              />

              <div className="delay-control-strip">
                <span className="delay-section-label">Algorithm</span>
                <div className="delay-mode-row delay-mode-row--segmented">
                  {DELAY_B_ALGORITHM_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`delay-mode-btn${delayBAlgorithm === option.value ? ' active' : ''}`}
                      onClick={() => onSelectChange('delayBAlgorithm', option.value as SliderState['delayBAlgorithm'])}
                      {...bindHelp(`delayBAlgorithm_${option.value}`, { label: option.label, page: 'delay' })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {!delayBTapeMode ? (
                <>
                  <div className="delay-control-grid delay-control-grid--three">
                    <div>
                      <div className="delay-section-label">Mode</div>
                      <div className="delay-mode-row">
                        <button
                          className={`delay-mode-btn${state.granularSpaceMode === 'clocked' ? ' active' : ''}`}
                          onClick={() => onSelectChange('granularSpaceMode', 'clocked')}
                          {...bindHelp('granularSpaceModeClocked', { label: 'Clear', page: 'delay' })}
                        >
                          Clear
                        </button>
                        <button
                          className={`delay-mode-btn${state.granularSpaceMode === 'diffuse' ? ' active' : ''}`}
                          onClick={() => onSelectChange('granularSpaceMode', 'diffuse')}
                          {...bindHelp('granularSpaceModeDiffuse', { label: 'Diffuse', page: 'delay' })}
                        >
                          Diffuse
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="delay-section-label">Rhythm</div>
                      <div className="delay-mode-row">
                        {PATTERN_OPTIONS.map((p) => (
                          <button
                            key={p.value}
                            className={`delay-mode-btn${state.delayBPattern === p.value ? ' active' : ''}`}
                            onClick={() => onSelectChange('delayBPattern', p.value as SliderState['delayBPattern'])}
                            {...bindHelp(`delayBPattern_${p.value}`, { label: p.label, page: 'delay' })}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="delay-section-label">Style</div>
                      <div className="delay-mode-row">
                        {WARP_OPTIONS.map((w) => (
                          <button
                            key={w.value}
                            className={`delay-mode-btn${state.delayBWarp === w.value ? ' active' : ''}`}
                            onClick={() => onSelectChange('delayBWarp', w.value as SliderState['delayBWarp'])}
                            {...bindHelp(`delayBWarp_${w.value}`, { label: w.label, page: 'delay' })}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Slider
                    label="Delay"
                    value={getSliderNumericValue('granularDelayTime', state.granularDelayTime) ?? 0}
                    paramKey="granularDelayTime"
                    onChange={onParamChange}
                    helpPage="delay"
                    format={(value: number) => formatIndexedDelayDivision('granularDelayTime', value)}
                    {...sliderProps('granularDelayTime')}
                  />

                  <div className="delay-control-grid">
                    <Slider label="Feedback" value={state.granularDelayRepeats} paramKey="granularDelayRepeats" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayRepeats')} />
                    <Slider label="Mix" value={state.granularDelayMix} paramKey="granularDelayMix" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayMix')} />
                    <Slider label="Tone" value={state.granularDelayFilter} paramKey="granularDelayFilter" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayFilter')} />
                    <Slider label="Mod" value={state.granularDelayVibrato} paramKey="granularDelayVibrato" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayVibrato')} />
                    <Slider label="Density" value={state.granularDelayActivity} paramKey="granularDelayActivity" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayActivity')} />
                    <Slider label="Depth" value={state.delayBWarpIntensity} paramKey="delayBWarpIntensity" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBWarpIntensity')} />
                    <Slider label="Width" value={state.delayBSpread} paramKey="delayBSpread" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBSpread')} />
                    <Slider label="Reverb" value={state.granularDelayReverbSend} paramKey="granularDelayReverbSend" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayReverbSend')} />
                  </div>
                </>
              ) : (
                <>
                  <div className="delay-control-strip">
                    <span className="delay-section-label">Spacing</span>
                    <div className="delay-mode-row">
                      {TAPE_SPACING_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          className={`delay-mode-btn${delayBTapeSpacing === option.value ? ' active' : ''}`}
                          onClick={() => onSelectChange('delayBTapeSpacing', option.value as SliderState['delayBTapeSpacing'])}
                          {...bindHelp(`delayBTapeSpacing_${option.value}`, { label: option.label, page: 'delay' })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Slider
                    label="Head 4 Time"
                    value={getSliderNumericValue('granularDelayTime', state.granularDelayTime) ?? 0}
                    paramKey="granularDelayTime"
                    onChange={onParamChange}
                    helpPage="delay"
                    format={(value: number) => formatIndexedDelayDivision('granularDelayTime', value)}
                    {...sliderProps('granularDelayTime')}
                  />

                  <div className="delay-tape-head-grid">
                    {TAPE_HEADS.map((head, arrayIndex) => {
                      const enabledKey = head.enabled as keyof SliderState;
                      const levelKey = head.level as keyof SliderState;
                      const panKey = head.pan as keyof SliderState;
                      const enabled = state[enabledKey] !== false;
                      const level = Number(state[levelKey] ?? 0);
                      const pan = Number(state[panKey] ?? 0.5);
                      const ratio = DELAY_B_TAPE_HEAD_SPACING_RATIOS[delayBTapeSpacing][arrayIndex] ?? 1;
                      return (
                        <div key={head.index} className={`delay-tape-head-row${enabled ? '' : ' off'}`}>
                          <button
                            className={`delay-tape-head-toggle${enabled ? ' on' : ''}`}
                            onClick={() => onSelectChange(enabledKey, !enabled)}
                            {...bindHelp(`delayBTapeHead${head.index}Enabled`, { label: `Head ${head.index}`, page: 'delay' })}
                          >
                            H{head.index}
                          </button>
                          <span className="delay-tape-head-ratio">{ratio.toFixed(3).replace(/^0/, '')}x</span>
                          <label className="delay-mini-slider">
                            <span>Level</span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={level}
                              onChange={(event) => onParamChange(levelKey, Number(event.currentTarget.value))}
                              {...bindSliderHelp(levelKey, `Head ${head.index} Level`)}
                            />
                          </label>
                          <label className="delay-mini-slider">
                            <span>Pan</span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={pan}
                              onChange={(event) => onParamChange(panKey, Number(event.currentTarget.value))}
                              {...bindSliderHelp(panKey, `Head ${head.index} Pan`)}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  <div className="delay-control-grid">
                    <Slider label="Feedback" value={state.granularDelayRepeats} paramKey="granularDelayRepeats" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayRepeats')} />
                    <Slider label="Output" value={state.granularDelayMix} paramKey="granularDelayMix" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayMix')} />
                    <Slider label="Age" value={state.granularDelayFilter} paramKey="granularDelayFilter" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayFilter')} />
                    <Slider label="Drive" value={state.granularDelayActivity} paramKey="granularDelayActivity" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayActivity')} />
                    <Slider label="Mechanics" value={state.delayBWarpIntensity} paramKey="delayBWarpIntensity" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBWarpIntensity')} />
                    <Slider label="Flutter" value={state.granularDelayVibrato} paramKey="granularDelayVibrato" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayVibrato')} />
                    <Slider label="Width" value={state.delayBSpread} paramKey="delayBSpread" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBSpread')} />
                    <Slider label="Reverb" value={state.granularDelayReverbSend} paramKey="granularDelayReverbSend" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayReverbSend')} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Cross-Feeds ── */}
        <div
          className={`delay-card${crossExpanded ? ' expanded' : ''}`}
          style={{ '--sc': 'var(--accent-cross)' } as React.CSSProperties}
        >
          <div className="delay-card-header" onClick={() => toggleCard('cross-feeds')}>
            <div className="delay-card-header-left">
              <span className="delay-card-title">Cross-Feeds</span>
            </div>
            <div className="delay-card-header-right">
              <span className="delay-card-chevron">{crossExpanded ? '▼' : '▶'}</span>
            </div>
          </div>

          {crossExpanded && (
            <div className="delay-card-body">
              {/* Kit preset selector (L2) */}
              <PresetDropdown
                level="kit"
                scope="delayKit"
                state={state}
                currentName={kitPresetName}
                onLoad={handleKitPresetLoad}
                onStateChange={onStateChange}
                sliderModes={sliderModes}
                dualSliderRanges={dualSliderRanges}
                onDualStateChange={onDualStateChange}
                compact
              />
              <Slider label="Echo Line → Delay B" value={state.delayAToBSend} paramKey="delayAToBSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAToBSend')} />
              <Slider label="Delay B → Echo Line" value={state.delayBToASend} paramKey="delayBToASend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBToASend')} />
              <Slider label="Cross-Feed Filter" value={state.delayACrossFeedFilter} paramKey="delayACrossFeedFilter" unit=" Hz" onChange={onParamChange} helpPage="delay" {...sliderProps('delayACrossFeedFilter')} />
              <Slider label="Echo Line → Granular" value={state.delayAGranularSend} paramKey="delayAGranularSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAGranularSend')} />
              {(state.granularDelayBSend ?? 0) < 0.0001 && (
                <Slider label="Delay B → Granular" value={state.delayBGranularSend} paramKey="delayBGranularSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBGranularSend')} />
              )}
              <Slider label="Drums → Delay B" value={state.drumDelayBSend} paramKey="drumDelayBSend" onChange={onParamChange} helpPage="delay" {...sliderProps('drumDelayBSend')} />
            </div>
          )}
        </div>

        {/* ── Preset Linkage ── */}
        <div
          className={`delay-card${linkageExpanded ? ' expanded' : ''}`}
          style={{ '--sc': 'var(--accent-clocked)' } as React.CSSProperties}
        >
          <div className="delay-card-header" onClick={() => toggleCard('linkage')}>
            <div className="delay-card-header-left">
              <span className="delay-card-title">Preset Linkage</span>
            </div>
            <div className="delay-card-header-right">
              <button
                className={`delay-toggle-btn${state.delayBGranularLinked ? ' on' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSelectChange('delayBGranularLinked', !state.delayBGranularLinked); }}
                {...bindHelp('delayBGranularLinkToggle', { page: 'delay' })}
              >
                {state.delayBGranularLinked ? 'LINKED' : 'FREE'}
              </button>
              <span className="delay-card-chevron">{linkageExpanded ? '▼' : '▶'}</span>
            </div>
          </div>

          {linkageExpanded && (
            <div className="delay-card-body">
              <p className="delay-linkage-note">
                {state.delayBGranularLinked
                  ? `${selectedGranularPreset?.name ?? 'The current granular preset'} currently carries Delay B voicing on preset load.`
                  : 'Granular preset changes leave the current Delay B voicing untouched.'}
                {typeof linkedDelayBSendSuggestion === 'number'
                  ? ` Suggested Delay B → Granular return: ${Math.round(linkedDelayBSendSuggestion * 100)}%.`
                  : ''}
              </p>
            </div>
          )}
        </div>

      </div>
      </div>
    </div>
  );
};

export default DelayPage;
