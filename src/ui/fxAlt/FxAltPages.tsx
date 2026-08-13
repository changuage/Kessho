import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GranularPage, { type GranularPageProps } from '../granular/GranularPage';
import DelayPage, { type DelayPageProps } from '../delay/DelayPage';
import ReverbPage, { type ReverbPageProps } from '../reverb/ReverbPage';
import DynamicsPage, { type DynamicsPageProps } from '../dynamics/DynamicsPage';
import GranularBufferCanvas, { type CanvasVoiceVisual } from '../granular/GranularBufferCanvas';
import DelayRhythmMap from '../delay/DelayRhythmMap';
import ReverbEnvelopeCanvas from '../reverb/ReverbEnvelopeCanvas';
import {
  DynamicsCompressorVisualizer,
  DynamicsDriftVisualizer,
  DynamicsEqVisualizer,
  DynamicsErosionVisualizer,
  DynamicsSaturationVisualizer,
} from '../dynamics/DynamicsVisualizers';
import {
  formatIndexedDelayDivision,
  getParamInfo,
  getSliderNumericValue,
  type IndexedDelayDivisionKey,
  type SliderState,
} from '../state';
import { delayNoteToSeconds } from '../../audio/delayBuses';
import './fxAlt.css';

type Variant = 'original' | 'alt';
type HeroView = 'viz' | 'slider';
type FxAltPageId = 'granular' | 'delay' | 'reverb' | 'texture';

const GRANULAR_COLORS = ['#E8B44A', '#7B9A6D', '#E8DCC4', '#5EA8A6'] as const;

function readInitialVariant(page: FxAltPageId): Variant {
  if (typeof window === 'undefined') return 'original';
  const query = new URLSearchParams(window.location.search).get('fxAlt');
  if (query === '1' || query === 'alt') return 'alt';
  if (query === '0' || query === 'original') return 'original';
  return window.localStorage.getItem(`kessho.fxAlt.${page}`) === 'alt' ? 'alt' : 'original';
}

function useVariant(page: FxAltPageId): [Variant, (next: Variant) => void] {
  const [variant, setVariantState] = useState<Variant>(() => readInitialVariant(page));
  const setVariant = (next: Variant) => {
    setVariantState(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(`kessho.fxAlt.${page}`, next);
  };
  return [variant, setVariant];
}

const VariantBar: React.FC<{ page: FxAltPageId; variant: Variant; onChange: (next: Variant) => void }> = ({ page, variant, onChange }) => (
  <div className="fx-alt-variant-bar" aria-label={`${page} page A/B variant`}>
    <span className="fx-alt-variant-label">A/B</span>
    <button type="button" className={variant === 'original' ? 'active' : ''} onClick={() => onChange('original')}>Original</button>
    <button type="button" className={variant === 'alt' ? 'active' : ''} onClick={() => onChange('alt')}>Alt HERO</button>
  </div>
);

interface PortalProps {
  root: React.RefObject<HTMLDivElement | null>;
  targetSelector: string;
  hideSelector?: string;
  hostClassName: string;
  children: React.ReactNode;
}

const HeroPortal: React.FC<PortalProps> = ({ root, targetSelector, hideSelector, hostClassName, children }) => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const rootNode = root.current;
    const target = rootNode?.querySelector<HTMLElement>(targetSelector);
    if (!rootNode || !target) return;

    const nextHost = document.createElement('div');
    nextHost.className = `fx-alt-hero-host ${hostClassName}`;
    target.insertBefore(nextHost, target.firstChild);

    const hidden = hideSelector ? rootNode.querySelector<HTMLElement>(hideSelector) : null;
    hidden?.classList.add('fx-alt-original-viz-hidden');
    setHost(nextHost);

    return () => {
      hidden?.classList.remove('fx-alt-original-viz-hidden');
      nextHost.remove();
      setHost(null);
    };
  }, [hideSelector, hostClassName, root, targetSelector]);

  return host ? createPortal(children, host) : null;
};

interface HeroShellProps {
  title: string;
  note: string;
  view: HeroView;
  onViewChange: (view: HeroView) => void;
  tabs?: readonly { id: string; label: string; color?: string }[];
  selectedTab?: string;
  onTabChange?: (id: string) => void;
  children: React.ReactNode;
}

const HeroShell: React.FC<HeroShellProps> = ({ title, note, view, onViewChange, tabs, selectedTab, onTabChange, children }) => (
  <section className="fx-alt-hero-card">
    <div className="fx-alt-hero-head">
      <div className="fx-alt-hero-heading">
        <span className="fx-alt-hero-title">{title}</span>
        <span className="fx-alt-live-badge">LIVE</span>
      </div>
      <span className="fx-alt-hero-note">{note}</span>
    </div>
    {(tabs?.length || true) && (
      <div className="fx-alt-hero-toolbar">
        <div className="fx-alt-hero-tabs">
          {tabs?.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={selectedTab === tab.id ? 'active' : ''}
              style={{ '--fx-alt-tab-color': tab.color ?? 'var(--page-accent)' } as React.CSSProperties}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="fx-alt-view-switch" aria-label="HERO view mode">
          <button type="button" className={view === 'viz' ? 'active' : ''} onClick={() => onViewChange('viz')}>VIZ</button>
          <button type="button" className={view === 'slider' ? 'active' : ''} onClick={() => onViewChange('slider')}>SLIDER</button>
        </div>
      </div>
    )}
    <div className={`fx-alt-hero-content view-${view}`}>{children}</div>
  </section>
);

interface HeroParam {
  key: keyof SliderState;
  label: string;
  unit?: string;
  format?: (value: number) => string;
}

interface SliderGridProps {
  state: SliderState;
  params: readonly HeroParam[];
  sliderProps: (key: keyof SliderState) => ReturnType<GranularPageProps['sliderProps']>;
  SliderComponent: GranularPageProps['SliderComponent'];
  onParamChange: (key: keyof SliderState, value: number) => void;
}

const HeroSliderGrid: React.FC<SliderGridProps> = ({ state, params, sliderProps, SliderComponent, onParamChange }) => {
  const Slider = SliderComponent;
  return (
    <div className="fx-alt-slider-grid">
      {params.map((param) => {
        const value = getSliderNumericValue(param.key, state[param.key]) ?? 0;
        return (
          <Slider
            key={String(param.key)}
            label={param.label}
            value={value}
            paramKey={param.key}
            unit={param.unit}
            format={param.format}
            onChange={onParamChange}
            {...sliderProps(param.key)}
          />
        );
      })}
    </div>
  );
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface DragHandleProps {
  state: SliderState;
  paramKey: keyof SliderState;
  label: string;
  axis: 'x' | 'y';
  onParamChange: (key: keyof SliderState, value: number) => void;
  fixed?: number;
  className?: string;
}

const DragHandle: React.FC<DragHandleProps> = ({ state, paramKey, label, axis, onParamChange, fixed = 0.5, className = '' }) => {
  const info = getParamInfo(paramKey);
  const value = getSliderNumericValue(paramKey, state[paramKey]);
  if (!info || value === null || info.max <= info.min) return null;
  const normalized = clamp01((value - info.min) / (info.max - info.min));
  const style = axis === 'x'
    ? { left: `${normalized * 100}%`, top: `${fixed * 100}%` }
    : { left: `${fixed * 100}%`, top: `${(1 - normalized) * 100}%` };

  const update = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const stage = event.currentTarget.closest<HTMLElement>('.fx-alt-viz-stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const fraction = axis === 'x'
      ? clamp01((event.clientX - rect.left) / Math.max(1, rect.width))
      : 1 - clamp01((event.clientY - rect.top) / Math.max(1, rect.height));
    onParamChange(paramKey, info.min + fraction * (info.max - info.min));
  };

  return (
    <button
      type="button"
      className={`fx-alt-drag-handle axis-${axis} ${className}`}
      style={style}
      aria-label={`${label}, drag ${axis === 'x' ? 'left or right' : 'up or down'}`}
      title={`${label} · ${axis === 'x' ? 'drag ↔' : 'drag ↕'}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={update}
    >
      <span className="fx-alt-handle-dot" />
      <span className="fx-alt-handle-label">{label} {axis === 'x' ? '↔' : '↕'}</span>
    </button>
  );
};

interface XYHandleProps {
  state: SliderState;
  xKey: keyof SliderState;
  yKey: keyof SliderState;
  label: string;
  onParamChange: (key: keyof SliderState, value: number) => void;
}

const XYHandle: React.FC<XYHandleProps> = ({ state, xKey, yKey, label, onParamChange }) => {
  const xInfo = getParamInfo(xKey);
  const yInfo = getParamInfo(yKey);
  const xValue = getSliderNumericValue(xKey, state[xKey]);
  const yValue = getSliderNumericValue(yKey, state[yKey]);
  if (!xInfo || !yInfo || xValue === null || yValue === null) return null;
  const x = clamp01((xValue - xInfo.min) / Math.max(1e-9, xInfo.max - xInfo.min));
  const y = clamp01((yValue - yInfo.min) / Math.max(1e-9, yInfo.max - yInfo.min));

  const update = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const stage = event.currentTarget.closest<HTMLElement>('.fx-alt-viz-stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const nx = clamp01((event.clientX - rect.left) / Math.max(1, rect.width));
    const ny = 1 - clamp01((event.clientY - rect.top) / Math.max(1, rect.height));
    onParamChange(xKey, xInfo.min + nx * (xInfo.max - xInfo.min));
    onParamChange(yKey, yInfo.min + ny * (yInfo.max - yInfo.min));
  };

  return (
    <button
      type="button"
      className="fx-alt-drag-handle axis-xy"
      style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%` }}
      aria-label={`${label}, drag horizontally for frequency and vertically for gain`}
      title={`${label} · ↔ frequency · ↕ gain`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={update}
    >
      <span className="fx-alt-handle-dot" />
      <span className="fx-alt-handle-label">{label} ↔/↕</span>
    </button>
  );
};

function useVisualTick(enabled: boolean, hz = 20): void {
  const [, force] = useState(0);
  React.useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => force((value) => (value + 1) % 100000), Math.max(33, Math.round(1000 / hz)));
    return () => window.clearInterval(id);
  }, [enabled, hz]);
}

function granularKey(voice: number, suffix: string): keyof SliderState {
  return `granularV${voice}${suffix}` as keyof SliderState;
}

const GranularHero: React.FC<GranularPageProps> = (props) => {
  const [view, setView] = useState<HeroView>('viz');
  const [voice, setVoice] = useState(1);
  useVisualTick(view === 'viz');

  const voicePositions = props.getVoicePositions();
  const voices = useMemo<CanvasVoiceVisual[]>(() => [1, 2, 3, 4].map((n, index) => {
    const slice = Number(props.state[granularKey(n, 'Slice')] ?? 0);
    const currentPos = Number(voicePositions[index] ?? ((slice + 0.5) / 16));
    const lookback = Number(props.state[granularKey(n, 'Lookback')] ?? 0.2);
    const anchorPos = (slice + 0.5) / 16;
    const rangeStart = clamp01(anchorPos - lookback * 0.5);
    const rangeWidth = Math.min(1 - rangeStart, Math.max(0.02, lookback));
    const speed = Number(props.state[granularKey(n, 'Speed')] ?? 1);
    return {
      index,
      mode: props.state[granularKey(n, 'Mode')] === 'clean' ? 'clean' : 'granular',
      motionMode: speed === 0 ? 'scan' : 'linear',
      color: GRANULAR_COLORS[index]!,
      slice,
      currentPos,
      markerPositions: [currentPos],
      anchorPos,
      rangeSegments: [{ left: rangeStart, width: rangeWidth }],
      rangeHeight: 0.55,
      rangeOpacity: index === voice - 1 ? 0.28 : 0.14,
      bandTopOffset: 0,
      tempoSync: Boolean(props.state[granularKey(n, 'TempoSync')]),
      tempoLabel: String(props.state[granularKey(n, 'TempoDiv')] ?? '1/8'),
      attack: Number(props.state[granularKey(n, 'Attack')] ?? 0.1),
      decay: Number(props.state[granularKey(n, 'Decay')] ?? 0.2),
      reverse: Boolean(props.state[granularKey(n, 'Reverse')]),
      speed,
      scanRate: Number(props.state[granularKey(n, 'ScanRate')] ?? 1),
      positionSpray: Number(props.state[granularKey(n, 'PositionSpray')] ?? 0),
      timingSpray: Number(props.state[granularKey(n, 'TimingSpray')] ?? 0),
      lookback,
      writeGuard: Number(props.state[granularKey(n, 'WriteGuard')] ?? 0),
      reverseChance: Number(props.state[granularKey(n, 'ReverseChance')] ?? 0),
      bloom: Number(props.state[granularKey(n, 'Bloom')] ?? 0),
      glide: Number(props.state[granularKey(n, 'Glide')] ?? 0),
      cloudStyle: (props.state[granularKey(n, 'CloudStyle')] ?? 'classic') as CanvasVoiceVisual['cloudStyle'],
      anchorPattern: (props.state[granularKey(n, 'AnchorPattern')] ?? 'forward') as CanvasVoiceVisual['anchorPattern'],
      loopCrossfade: Number(props.state[granularKey(n, 'LoopCrossfade')] ?? 0),
      quality: (props.state.granularQuality ?? 'balanced') as CanvasVoiceVisual['quality'],
    };
  }), [props.state, voice, voicePositions]);

  const params: HeroParam[] = [
    { key: granularKey(voice, 'Slice'), label: 'Slice / Anchor' },
    { key: granularKey(voice, 'Lookback'), label: 'Lookback' },
    { key: granularKey(voice, 'Density'), label: 'Density' },
    { key: granularKey(voice, 'GrainSize'), label: 'Grain Size' },
    { key: granularKey(voice, 'PositionSpray'), label: 'Position Spray' },
    { key: granularKey(voice, 'Pitch'), label: 'Pitch' },
    { key: granularKey(voice, 'Attack'), label: 'Attack' },
    { key: granularKey(voice, 'Decay'), label: 'Decay' },
  ];

  return (
    <HeroShell
      title="Granular Field"
      note="Select a voice, then use VIZ gestures or the same parameters as dual-capable sliders"
      view={view}
      onViewChange={setView}
      selectedTab={`v${voice}`}
      onTabChange={(id) => setVoice(Number(id.slice(1)) || 1)}
      tabs={GRANULAR_COLORS.map((color, index) => ({ id: `v${index + 1}`, label: `V${index + 1}`, color }))}
    >
      {view === 'viz' ? (
        <div className="fx-alt-viz-stage fx-alt-granular-stage">
          <GranularBufferCanvas
            height={228}
            isRunning={props.isRunning}
            voices={voices}
            writeHeadPosition={props.getWriteHeadPosition()}
            activeGrainCount={props.getActiveGrainCount()}
            grainEvents={props.getVisualEvents()}
            bufferWaveform={props.getBufferWaveform()}
            bufferSeconds={Number(props.state.granularBufferSeconds ?? 16)}
            isFrozen={Boolean(props.state.granularFreeze)}
            activeSlices={new Set(voices.map((item) => item.slice))}
            numSlices={16}
            visualDetail={props.state.granularVisualDetail ?? 'basic'}
          />
          <DragHandle state={props.state} paramKey={granularKey(voice, 'Slice')} label="ANCHOR" axis="x" fixed={0.22 + (voice - 1) * 0.16} onParamChange={props.onParamChange} />
          <DragHandle state={props.state} paramKey={granularKey(voice, 'Lookback')} label="LOOKBACK" axis="x" fixed={0.84} onParamChange={props.onParamChange} />
          <DragHandle state={props.state} paramKey={granularKey(voice, 'Pitch')} label="PITCH" axis="y" fixed={0.78} onParamChange={props.onParamChange} />
          <DragHandle state={props.state} paramKey={granularKey(voice, 'Density')} label="DENSITY" axis="y" fixed={0.9} onParamChange={props.onParamChange} />
          <div className="fx-alt-gesture-hint">Tap a handle · ↔ horizontal · ↕ vertical</div>
        </div>
      ) : (
        <HeroSliderGrid state={props.state} params={params} sliderProps={props.sliderProps} SliderComponent={props.SliderComponent} onParamChange={props.onParamChange} />
      )}
    </HeroShell>
  );
};

const delayDivisionFormat = (key: IndexedDelayDivisionKey) => (value: number) => formatIndexedDelayDivision(key, value);

const DelayHero: React.FC<DelayPageProps> = (props) => {
  const [view, setView] = useState<HeroView>('viz');
  const [section, setSection] = useState<'a' | 'b' | 'cross'>('a');
  const bpm = Number(props.state.sequencerMasterBPM ?? 120);
  const echoTimeL = delayNoteToSeconds(props.state.drumDelayNoteL ?? '1/4', bpm);
  const echoTimeR = delayNoteToSeconds(props.state.drumDelayNoteR ?? '1/4', bpm);
  const clockedBaseTime = delayNoteToSeconds(props.state.granularDelayTime ?? '1/4', bpm);

  const params: Record<typeof section, HeroParam[]> = {
    a: [
      { key: 'drumDelayNoteL', label: 'Left Division', format: delayDivisionFormat('drumDelayNoteL') },
      { key: 'drumDelayNoteR', label: 'Right Division', format: delayDivisionFormat('drumDelayNoteR') },
      { key: 'delayAFeedback', label: 'Feedback' },
      { key: 'delayAWidth', label: 'Width' },
      { key: 'delayAModDepth', label: 'Mod Depth' },
      { key: 'delayAMix', label: 'Mix' },
    ],
    b: [
      { key: 'granularDelayTime', label: 'Base Time', format: delayDivisionFormat('granularDelayTime') },
      { key: 'granularDelayActivity', label: 'Activity' },
      { key: 'granularDelayRepeats', label: 'Repeats' },
      { key: 'delayBSpread', label: 'Spread' },
      { key: 'delayBWarpIntensity', label: 'Warp Depth' },
      { key: 'granularDelayMix', label: 'Mix' },
    ],
    cross: [
      { key: 'delayAToBSend', label: 'A → B' },
      { key: 'delayBToASend', label: 'B → A' },
      { key: 'delayACrossFeedFilter', label: 'Cross-feed Filter', unit: ' Hz' },
      { key: 'delayAGranularSend', label: 'A → Granular' },
      { key: 'delayBGranularSend', label: 'B → Granular' },
    ],
  };

  return (
    <HeroShell
      title="Delay Rhythm Map"
      note="The existing rhythm map promoted to an editor; selection scopes the Slider view"
      view={view}
      onViewChange={setView}
      selectedTab={section}
      onTabChange={(id) => setSection(id as typeof section)}
      tabs={[
        { id: 'a', label: 'Delay A', color: '#b9c9ff' },
        { id: 'b', label: props.state.delayBAlgorithm === 'tapeHeads' ? 'Tape Heads' : 'Delay B', color: '#9fe5f0' },
        { id: 'cross', label: 'Cross-feed', color: '#c4a8e0' },
      ]}
    >
      {view === 'viz' ? (
        <div className="fx-alt-viz-stage fx-alt-delay-stage">
          <DelayRhythmMap
            bpm={bpm}
            echoTimeL={echoTimeL}
            echoTimeR={echoTimeR}
            echoFeedback={Number(props.state.delayAFeedback ?? 0.3)}
            echoPingPong={Boolean(props.state.delayAPingPong)}
            echoWidth={Number(props.state.delayAWidth ?? 0.5)}
            clockedPattern={props.state.delayBPattern ?? 'cascade'}
            clockedWarp={props.state.delayBWarp ?? 'clean'}
            clockedActivity={Number(props.state.granularDelayActivity ?? 0.5)}
            clockedBaseTime={clockedBaseTime}
            clockedSpread={Number(props.state.delayBSpread ?? 0.5)}
            delayBAlgorithm={props.state.delayBAlgorithm ?? 'clockedSpace'}
            tapeSpacing={props.state.delayBTapeSpacing ?? 'even'}
            tapeHeadEnabled={[props.state.delayBTapeHead1Enabled ?? true, props.state.delayBTapeHead2Enabled ?? true, props.state.delayBTapeHead3Enabled ?? true, props.state.delayBTapeHead4Enabled ?? true]}
            tapeHeadLevels={[props.state.delayBTapeHead1Level ?? 0.72, props.state.delayBTapeHead2Level ?? 0.8, props.state.delayBTapeHead3Level ?? 0.88, props.state.delayBTapeHead4Level ?? 1]}
            tapeHeadPans={[props.state.delayBTapeHead1Pan ?? 0.28, props.state.delayBTapeHead2Pan ?? 0.72, props.state.delayBTapeHead3Pan ?? 0.38, props.state.delayBTapeHead4Pan ?? 0.62]}
            aToBSend={Number(props.state.delayAToBSend ?? 0)}
            bToASend={Number(props.state.delayBToASend ?? 0)}
          />
          {section === 'a' && <>
            <DragHandle state={props.state} paramKey="drumDelayNoteL" label="LEFT TIME" axis="x" fixed={0.22} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="drumDelayNoteR" label="RIGHT TIME" axis="x" fixed={0.39} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="delayAFeedback" label="FEEDBACK" axis="x" fixed={0.08} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="delayAWidth" label="WIDTH" axis="y" fixed={0.9} onParamChange={props.onParamChange} />
          </>}
          {section === 'b' && <>
            <DragHandle state={props.state} paramKey="granularDelayTime" label="BASE TIME" axis="x" fixed={0.68} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="granularDelayActivity" label="ACTIVITY" axis="y" fixed={0.82} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="granularDelayRepeats" label="REPEATS" axis="x" fixed={0.88} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="delayBSpread" label="SPREAD" axis="y" fixed={0.92} onParamChange={props.onParamChange} />
          </>}
          {section === 'cross' && <>
            <DragHandle state={props.state} paramKey="delayAToBSend" label="A → B" axis="x" fixed={0.42} onParamChange={props.onParamChange} />
            <DragHandle state={props.state} paramKey="delayBToASend" label="B → A" axis="x" fixed={0.58} onParamChange={props.onParamChange} />
          </>}
          <div className="fx-alt-gesture-hint">Tap a handle · ↔ horizontal · ↕ vertical</div>
        </div>
      ) : (
        <HeroSliderGrid state={props.state} params={params[section]} sliderProps={props.sliderProps} SliderComponent={props.SliderComponent} onParamChange={props.onParamChange} />
      )}
    </HeroShell>
  );
};

const ReverbHero: React.FC<ReverbPageProps> = (props) => {
  const [view, setView] = useState<HeroView>('viz');
  const state = props.state;
  const params: HeroParam[] = [
    { key: 'predelay', label: 'Pre-delay', unit: ' ms' },
    { key: 'reverbDecay', label: 'Decay' },
    { key: 'reverbSize', label: 'Size' },
    { key: 'reverbDiffusion', label: 'Diffusion' },
    { key: 'reverbEarlyReflections', label: 'Early Reflections' },
    { key: 'width', label: 'Width' },
    { key: 'damping', label: 'Damping' },
    { key: 'reverbShimmer', label: 'Shimmer' },
    { key: 'reverbReverse', label: 'Reverse' },
    { key: 'reverbWarp', label: 'Warp' },
  ];

  return (
    <HeroShell title="Reverb Tail Map" note="Direct geometry edits the same base parameters shown in Slider view" view={view} onViewChange={setView}>
      {view === 'viz' ? (
        <div className="fx-alt-viz-stage fx-alt-reverb-stage">
          <ReverbEnvelopeCanvas
            engine={state.reverbEngine}
            quality={state.reverbQuality}
            decay={state.reverbDecay}
            size={state.reverbSize}
            diffusion={state.reverbDiffusion}
            modulation={state.reverbModulation}
            predelay={state.predelay}
            damping={state.damping}
            width={state.width}
            shimmer={state.reverbShimmer}
            shimmerPitch={state.reverbShimmerPitch}
            reverse={state.reverbReverse}
            reverseLength={state.reverbReverseLength}
            earlyReflections={state.reverbEarlyReflections}
            airAbsorption={state.reverbAirAbsorption}
            dampLow={state.reverbDampLow}
            dampHigh={state.reverbDampHigh}
            inputTone={state.reverbInputTone}
            warp={state.reverbWarp}
            saturationMode={state.reverbSaturationMode}
            frozen={Boolean(state.spectralFreezeEnabled && state.spectralFreezeActive)}
            enabled={state.reverbEnabled}
            chorusDepth={state.reverbChorusDepth}
            slowModDepth={state.reverbSlowModDepth}
          />
          <DragHandle state={state} paramKey="predelay" label="PRE-DELAY" axis="x" fixed={0.84} onParamChange={props.onParamChange} />
          <DragHandle state={state} paramKey="reverbDecay" label="DECAY" axis="x" fixed={0.24} onParamChange={props.onParamChange} />
          <DragHandle state={state} paramKey="reverbSize" label="SIZE" axis="y" fixed={0.56} onParamChange={props.onParamChange} />
          <DragHandle state={state} paramKey="reverbEarlyReflections" label="EARLY" axis="y" fixed={0.16} onParamChange={props.onParamChange} />
          <DragHandle state={state} paramKey="width" label="WIDTH" axis="x" fixed={0.94} onParamChange={props.onParamChange} />
          <div className="fx-alt-gesture-hint">Tap a handle · ↔ time/width · ↕ size/energy</div>
        </div>
      ) : (
        <HeroSliderGrid state={state} params={params} sliderProps={props.sliderProps} SliderComponent={props.SliderComponent} onParamChange={props.onParamChange} />
      )}
    </HeroShell>
  );
};

type DynamicsSection = 'eq' | 'comp' | 'sat' | 'drift' | 'erosion';

const DynamicsHero: React.FC<DynamicsPageProps> = (props) => {
  const [view, setView] = useState<HeroView>('viz');
  const [section, setSection] = useState<DynamicsSection>('comp');
  const state = props.state;

  const params: Record<DynamicsSection, HeroParam[]> = {
    eq: [
      { key: 'dynamicsEq1LowFreq', label: 'Low Freq', unit: ' Hz' },
      { key: 'dynamicsEq1LowGain', label: 'Low Gain', unit: ' dB' },
      { key: 'dynamicsEq1MidFreq', label: 'Mid Freq', unit: ' Hz' },
      { key: 'dynamicsEq1MidGain', label: 'Mid Gain', unit: ' dB' },
      { key: 'dynamicsEq1HighFreq', label: 'High Freq', unit: ' Hz' },
      { key: 'dynamicsEq1HighGain', label: 'High Gain', unit: ' dB' },
      { key: 'dynamicsEq1MidQ', label: 'Mid Q' },
    ],
    comp: [
      { key: 'endCompThreshold', label: 'Threshold', unit: ' dB' },
      { key: 'endCompRatio', label: 'Ratio' },
      { key: 'endCompKnee', label: 'Knee', unit: ' dB' },
      { key: 'endCompMakeup', label: 'Makeup' },
      { key: 'endCompAttackMs', label: 'Attack', unit: ' ms' },
      { key: 'endCompReleaseMs', label: 'Release', unit: ' ms' },
    ],
    sat: [
      { key: 'dynamicsSaturationDrive', label: 'Drive' },
      { key: 'dynamicsSaturationTone', label: 'Tone' },
      { key: 'dynamicsSaturationBias', label: 'Bias' },
    ],
    drift: [
      { key: 'driftMix', label: 'Mix' },
      { key: 'driftDepth', label: 'Depth' },
      { key: 'driftRate', label: 'Rate' },
      { key: 'driftStereo', label: 'Stereo' },
      { key: 'driftAge', label: 'Age' },
      { key: 'driftDamp', label: 'Damp' },
    ],
    erosion: [
      { key: 'erosionMix', label: 'Mix' },
      { key: 'erosionAge', label: 'Wear' },
      { key: 'erosionWow', label: 'Wow' },
      { key: 'erosionFlutter', label: 'Flutter' },
      { key: 'erosionTone', label: 'Tone' },
      { key: 'erosionSaturation', label: 'Clip' },
    ],
  };

  const visualizer = section === 'eq' ? (
    <DynamicsEqVisualizer state={state} eqId="eq1" onParamChange={props.onParamChange} sliderProps={props.sliderProps} />
  ) : section === 'comp' ? (
    <DynamicsCompressorVisualizer state={state} getDynamicsAnalyser={props.getDynamicsAnalyser} getDynamicsTelemetry={props.getDynamicsTelemetry} />
  ) : section === 'sat' ? (
    <DynamicsSaturationVisualizer state={state} getDynamicsAnalyser={props.getDynamicsAnalyser} getDynamicsTelemetry={props.getDynamicsTelemetry} />
  ) : section === 'drift' ? (
    <DynamicsDriftVisualizer state={state} onParamChange={props.onParamChange} getDynamicsAnalyser={props.getDynamicsAnalyser} getDynamicsTelemetry={props.getDynamicsTelemetry} />
  ) : (
    <DynamicsErosionVisualizer state={state} getDynamicsAnalyser={props.getDynamicsAnalyser} getDynamicsTelemetry={props.getDynamicsTelemetry} />
  );

  return (
    <HeroShell
      title="Texture Signal Chain"
      note="Select one processor first; VIZ and Slider are two views of that processor only"
      view={view}
      onViewChange={setView}
      selectedTab={section}
      onTabChange={(id) => setSection(id as DynamicsSection)}
      tabs={[
        { id: 'eq', label: 'EQ', color: '#B8E0FF' },
        { id: 'comp', label: 'COMP', color: '#C4724E' },
        { id: 'sat', label: 'SAT', color: '#D4A520' },
        { id: 'drift', label: 'DRIFT', color: '#7B9A6D' },
        { id: 'erosion', label: 'EROSION', color: '#8B5CF6' },
      ]}
    >
      {view === 'viz' ? (
        <div className={`fx-alt-viz-stage fx-alt-dynamics-stage module-${section}`}>
          {visualizer}
          {section === 'eq' && <>
            <XYHandle state={state} xKey="dynamicsEq1LowFreq" yKey="dynamicsEq1LowGain" label="LOW" onParamChange={props.onParamChange} />
            <XYHandle state={state} xKey="dynamicsEq1MidFreq" yKey="dynamicsEq1MidGain" label="MID" onParamChange={props.onParamChange} />
            <XYHandle state={state} xKey="dynamicsEq1HighFreq" yKey="dynamicsEq1HighGain" label="HIGH" onParamChange={props.onParamChange} />
          </>}
          {section === 'comp' && <>
            <DragHandle state={state} paramKey="endCompThreshold" label="THRESHOLD" axis="x" fixed={0.72} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="endCompRatio" label="RATIO" axis="y" fixed={0.72} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="endCompKnee" label="KNEE" axis="x" fixed={0.42} onParamChange={props.onParamChange} />
          </>}
          {section === 'sat' && <>
            <DragHandle state={state} paramKey="dynamicsSaturationDrive" label="DRIVE" axis="x" fixed={0.75} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="dynamicsSaturationTone" label="TONE" axis="y" fixed={0.84} onParamChange={props.onParamChange} />
          </>}
          {section === 'drift' && <>
            <DragHandle state={state} paramKey="driftDepth" label="DEPTH" axis="y" fixed={0.78} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="driftRate" label="RATE" axis="x" fixed={0.8} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="driftStereo" label="STEREO" axis="x" fixed={0.9} onParamChange={props.onParamChange} />
          </>}
          {section === 'erosion' && <>
            <DragHandle state={state} paramKey="erosionAge" label="WEAR" axis="x" fixed={0.78} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="erosionWow" label="WOW" axis="y" fixed={0.82} onParamChange={props.onParamChange} />
            <DragHandle state={state} paramKey="erosionFlutter" label="FLUTTER" axis="x" fixed={0.9} onParamChange={props.onParamChange} />
          </>}
          <div className="fx-alt-gesture-hint">Tap a handle · labels show drag direction</div>
        </div>
      ) : (
        <HeroSliderGrid state={state} params={params[section]} sliderProps={props.sliderProps} SliderComponent={props.SliderComponent} onParamChange={props.onParamChange} />
      )}
    </HeroShell>
  );
};

export const GranularVariantPage: React.FC<GranularPageProps> = (props) => {
  const [variant, setVariant] = useVariant('granular');
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} className={`fx-alt-page fx-alt-page--granular variant-${variant}`}>
      <VariantBar page="granular" variant={variant} onChange={setVariant} />
      <GranularPage {...props} />
      {variant === 'alt' && (
        <HeroPortal root={rootRef} targetSelector=".granular-voices-panel" hostClassName="fx-alt-hero-host--granular">
          <GranularHero {...props} />
        </HeroPortal>
      )}
    </div>
  );
};

export const DelayVariantPage: React.FC<DelayPageProps> = (props) => {
  const [variant, setVariant] = useVariant('delay');
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} className={`fx-alt-page fx-alt-page--delay variant-${variant}`}>
      <VariantBar page="delay" variant={variant} onChange={setVariant} />
      <DelayPage {...props} />
      {variant === 'alt' && (
        <HeroPortal root={rootRef} targetSelector=".delay-right" hideSelector=".delay-right > .delay-card" hostClassName="fx-alt-hero-host--delay">
          <DelayHero {...props} />
        </HeroPortal>
      )}
    </div>
  );
};

export const ReverbVariantPage: React.FC<ReverbPageProps> = (props) => {
  const [variant, setVariant] = useVariant('reverb');
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} className={`fx-alt-page fx-alt-page--reverb variant-${variant}`}>
      <VariantBar page="reverb" variant={variant} onChange={setVariant} />
      <ReverbPage {...props} />
      {variant === 'alt' && (
        <HeroPortal root={rootRef} targetSelector=".reverb-right-grid" hideSelector=".reverb-visualizer-card" hostClassName="fx-alt-hero-host--reverb">
          <ReverbHero {...props} />
        </HeroPortal>
      )}
    </div>
  );
};

export const TextureVariantPage: React.FC<DynamicsPageProps> = (props) => {
  const [variant, setVariant] = useVariant('texture');
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} className={`fx-alt-page fx-alt-page--dynamics variant-${variant}`}>
      <VariantBar page="texture" variant={variant} onChange={setVariant} />
      <DynamicsPage {...props} />
      {variant === 'alt' && (
        <HeroPortal root={rootRef} targetSelector=".dynamics-container" hostClassName="fx-alt-hero-host--dynamics">
          <DynamicsHero {...props} />
        </HeroPortal>
      )}
    </div>
  );
};
