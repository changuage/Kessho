import React, { useCallback, useState } from 'react';
import type { SliderState } from '../state';
import type { SliderPageId } from '../sliderHelpCatalog';
import { useSliderHelp } from '../SliderHelpOverlay';
import { getGranularPresetMeta, getGranularPresetSuggestedDelayBGranularSend } from '../granular/granularPresets';
import { delayNoteToSeconds } from '../../audio/delayBuses';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import DelayRhythmMap from './DelayRhythmMap';
import DelayAlgorithmCard from './DelayAlgorithmCard';
import DelayScope from './DelayScope';
import DelayThumbnail from './DelayThumbnail';
import './delay.css';

const ECHO_LINE_NOTE_OPTIONS = [
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
] as const;

const CLOCKED_SPACE_NOTE_OPTIONS = [
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
] as const;

const FILTER_TYPE_OPTIONS = [
  { value: 'lowpass', label: 'LP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'highpass', label: 'HP' },
] as const;

const PATTERN_OPTIONS = [
  { value: 'cascade', label: 'Cascade' },
  { value: 'golden', label: 'Golden' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'dotted', label: 'Dotted' },
] as const;

const WARP_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'filterSweep', label: 'Filter' },
  { value: 'pitchDrift', label: 'Pitch' },
  { value: 'grainCrossfade', label: 'Grain' },
] as const;

const SAT_MODE_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'tape', label: 'Tape' },
  { value: 'tube', label: 'Tube' },
] as const;

export interface DelayPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: (newState: SliderState) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
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
}) => {
  const Slider = SliderComponent as React.ComponentType<any>;
  const { announceHelp, announceSlider } = useSliderHelp();

  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(['echo-line', 'clocked-space']),
  );
  const [vizTab, setVizTab] = useState<'rhythm' | 'scope'>('rhythm');
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
  const masterExpanded = expandedCards.has('master-sat');

  const bpm = state.sequencerMasterBPM ?? 120;
  const echoTimeL = delayNoteToSeconds(state.drumDelayNoteL ?? '1/4', bpm);
  const echoTimeR = delayNoteToSeconds(state.drumDelayNoteR ?? '1/4', bpm);
  const clockedBaseTime = delayNoteToSeconds(state.granularDelayTime ?? '1/4', bpm);

  return (
    <div className={`delay-root${isMobile ? ' mobile' : ''}`}>
      <div className="delay-container">

      {/* ── Page-Level Source Preset (L3) ── */}
      <div className="delay-source-preset-bar">
        <span className="delay-source-preset-label">Delay Source</span>
        <PresetDropdown
          level="source"
          scope="delay"
          state={state}
          currentName={sourcePresetName}
          onLoad={handleSourcePresetLoad}
          onStateChange={onStateChange}
          compact
        />
      </div>

      {/* ════ LEFT PANEL ════ */}
      <div className="delay-left">

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
              <div className="delay-select-grid">
                <label className="delay-select-field">
                  <span>Left</span>
                  <select
                    value={state.drumDelayNoteL}
                    onChange={(e) => onSelectChange('drumDelayNoteL', e.target.value as SliderState['drumDelayNoteL'])}
                    {...bindSliderHelp('drumDelayNoteL', 'Left')}
                  >
                    {ECHO_LINE_NOTE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="delay-select-field">
                  <span>Right</span>
                  <select
                    value={state.drumDelayNoteR}
                    onChange={(e) => onSelectChange('drumDelayNoteR', e.target.value as SliderState['drumDelayNoteR'])}
                    {...bindSliderHelp('drumDelayNoteR', 'Right')}
                  >
                    {ECHO_LINE_NOTE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
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

        {/* ── Clocked Space ── */}
        <div
          className={`delay-card${clockedExpanded ? ' expanded' : ''}`}
          style={{ '--sc': 'var(--accent-clocked)' } as React.CSSProperties}
        >
          <div className="delay-card-header" onClick={() => toggleCard('clocked-space')}>
            <div className="delay-card-header-left">
              <span className="delay-card-title">Clocked Space</span>
              <span className="delay-card-subtitle">Delay B</span>
            </div>
            <div className="delay-card-header-right">
              <FeedBadge feeds={delayBFeeds} />
              <span className="delay-card-chevron">{clockedExpanded ? '▼' : '▶'}</span>
            </div>
          </div>

          {clockedExpanded && (
            <div className="delay-card-body">
              {/* Preset selector */}
              <PresetDropdown
                level="engine"
                scope="clockedSpace"
                state={state}
                currentName={clockedPresetName}
                onLoad={handleClockedPresetLoad}
                onStateChange={onStateChange}
                compact
              />

              {/* Mode */}
              <div className="delay-section-label">Mode</div>
              <div className="delay-mode-row">
                <button
                  className={`delay-mode-btn${state.granularSpaceMode === 'diffuse' ? ' active' : ''}`}
                  onClick={() => onSelectChange('granularSpaceMode', 'diffuse')}
                  {...bindHelp('granularSpaceModeDiffuse', { label: 'Diffuse', page: 'delay' })}
                >
                  Diffuse
                </button>
                <button
                  className={`delay-mode-btn${state.granularSpaceMode === 'clocked' ? ' active' : ''}`}
                  onClick={() => onSelectChange('granularSpaceMode', 'clocked')}
                  {...bindHelp('granularSpaceModeClocked', { label: 'Clocked', page: 'delay' })}
                >
                  Clocked
                </button>
              </div>

              {/* Pattern */}
              <div className="delay-section-label">Pattern</div>
              <div className="delay-mode-row">
                {PATTERN_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    className={`delay-mode-btn${state.delayBPattern === p.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('delayBPattern', p.value as SliderState['delayBPattern'])}
                    {...bindHelp(`delayBPattern_${p.value}`, { label: p.label, page: 'delay' })}
                  >
                    <DelayThumbnail type="pattern" variant={p.value} accent="#9fe5f0" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Warp */}
              <div className="delay-section-label">Warp</div>
              <div className="delay-mode-row">
                {WARP_OPTIONS.map((w) => (
                  <button
                    key={w.value}
                    className={`delay-mode-btn${state.delayBWarp === w.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('delayBWarp', w.value as SliderState['delayBWarp'])}
                    {...bindHelp(`delayBWarp_${w.value}`, { label: w.label, page: 'delay' })}
                  >
                    <DelayThumbnail type="warp" variant={w.value} accent="#9fe5f0" />
                    <span>{w.label}</span>
                  </button>
                ))}
              </div>

              {/* Algorithm Card */}
              <DelayAlgorithmCard pattern={state.delayBPattern} warp={state.delayBWarp} accent="#9fe5f0" />

              {/* Time */}
              <label className="delay-select-field">
                <span>Time</span>
                <select
                  value={state.granularDelayTime}
                  onChange={(e) => onSelectChange('granularDelayTime', e.target.value as SliderState['granularDelayTime'])}
                  {...bindSliderHelp('granularDelayTime', 'Time')}
                >
                  {CLOCKED_SPACE_NOTE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              {/* Sliders */}
              <Slider label="Activity" value={state.granularDelayActivity} paramKey="granularDelayActivity" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayActivity')} />
              <Slider label="Repeats" value={state.granularDelayRepeats} paramKey="granularDelayRepeats" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayRepeats')} />
              <Slider label="Filter" value={state.granularDelayFilter} paramKey="granularDelayFilter" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayFilter')} />
              <Slider label="Intensity" value={state.delayBWarpIntensity} paramKey="delayBWarpIntensity" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBWarpIntensity')} />
              <Slider label="Spread" value={state.delayBSpread} paramKey="delayBSpread" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBSpread')} />
              <Slider label="Vibrato" value={state.granularDelayVibrato} paramKey="granularDelayVibrato" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayVibrato')} />
              <Slider label="Reverb Send" value={state.granularDelayReverbSend} paramKey="granularDelayReverbSend" onChange={onParamChange} helpPage="delay" {...sliderProps('granularDelayReverbSend')} />
            </div>
          )}
        </div>
      </div>

      {/* ════ RIGHT PANEL ════ */}
      <div className="delay-right">

        {/* ── Delay Visualizer ── */}
        <div className="delay-card" style={{ '--sc': 'var(--accent-primary)' } as React.CSSProperties}>
          <div className="delay-card-body" style={{ padding: '8px 10px 10px' }}>
            <div className="delay-viz-tabs">
              <button
                className={`delay-viz-tab${vizTab === 'rhythm' ? ' active' : ''}`}
                onClick={() => setVizTab('rhythm')}
              >
                Rhythm Map
              </button>
              <button
                className={`delay-viz-tab${vizTab === 'scope' ? ' active' : ''}`}
                onClick={() => setVizTab('scope')}
              >
                Scope
              </button>
            </div>

            {vizTab === 'rhythm' ? (
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
                aToBSend={state.delayAToBSend ?? 0}
                bToASend={state.delayBToASend ?? 0}
              />
            ) : (
              <DelayScope
                echoAnalyser={null}
                clockedAnalyser={null}
                echoPingPong={state.delayAPingPong ?? false}
                clockedWarp={state.delayBWarp ?? 'clean'}
              />
            )}
          </div>
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
                compact
              />
              <Slider label="Echo Line → Clocked Space" value={state.delayAToBSend} paramKey="delayAToBSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAToBSend')} />
              <Slider label="Clocked Space → Echo Line" value={state.delayBToASend} paramKey="delayBToASend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBToASend')} />
              <Slider label="Cross-Feed Filter" value={state.delayACrossFeedFilter} paramKey="delayACrossFeedFilter" unit=" Hz" onChange={onParamChange} helpPage="delay" {...sliderProps('delayACrossFeedFilter')} />
              <Slider label="Echo Line → Granular" value={state.delayAGranularSend} paramKey="delayAGranularSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayAGranularSend')} />
              {(state.granularDelayBSend ?? 0) < 0.0001 && (
                <Slider label="Clocked Space → Granular" value={state.delayBGranularSend} paramKey="delayBGranularSend" onChange={onParamChange} helpPage="delay" {...sliderProps('delayBGranularSend')} />
              )}
              <Slider label="Drums → Clocked Space" value={state.drumDelayBSend} paramKey="drumDelayBSend" onChange={onParamChange} helpPage="delay" {...sliderProps('drumDelayBSend')} />
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
                  ? `${selectedGranularPreset?.name ?? 'The current granular preset'} currently carries Clocked Space voicing on preset load.`
                  : 'Granular preset changes leave the current Clocked Space voicing untouched.'}
                {typeof linkedDelayBSendSuggestion === 'number'
                  ? ` Suggested Clocked Space → Granular return: ${Math.round(linkedDelayBSendSuggestion * 100)}%.`
                  : ''}
              </p>
            </div>
          )}
        </div>

        {/* ── Master Saturation ── */}
        <div
          className={`delay-card${masterExpanded ? ' expanded' : ''}`}
          style={{ '--sc': 'var(--accent-master)' } as React.CSSProperties}
        >
          <div className="delay-card-header" onClick={() => toggleCard('master-sat')}>
            <div className="delay-card-header-left">
              <span className="delay-card-title">Master Saturation</span>
            </div>
            <div className="delay-card-header-right">
              <span className="delay-card-chevron">{masterExpanded ? '▼' : '▶'}</span>
            </div>
          </div>

          {masterExpanded && (
            <div className="delay-card-body">
              {/* Character mode */}
              <div className="delay-section-label">Character</div>
              <div className="delay-mode-row">
                {SAT_MODE_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    className={`delay-mode-btn${state.masterSatMode === m.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('masterSatMode', m.value as SliderState['masterSatMode'])}
                    {...bindHelp(`masterSatMode_${m.value}`, { label: m.label, page: 'delay' })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Slider label="Drive" value={state.masterSatDrive} paramKey="masterSatDrive" onChange={onParamChange} helpPage="delay" {...sliderProps('masterSatDrive')} />
              <Slider label="Tone" value={state.masterSatTone} paramKey="masterSatTone" onChange={onParamChange} helpPage="delay" {...sliderProps('masterSatTone')} />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default DelayPage;
