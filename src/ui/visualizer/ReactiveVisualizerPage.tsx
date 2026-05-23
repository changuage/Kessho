import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/runtime';
import type { EngineState } from '../../audio/runtime';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';
import { getRuntimeSliderPosition } from '../runtimeSliderState';
import { getRuntimeValue } from '../runtimeValueState';
import type { SliderMode, SliderState } from '../state';
import {
  ReactiveVisualizerRenderer,
  type ReactiveVisualizerControls,
  type ReactiveVisualizerSnapshot,
  type VisualizerFocus,
} from './ReactiveVisualizerRenderer';
import { getVisualizerPulseSnapshot } from './visualizerSignals';
import './reactiveVisualizer.css';

type DualRanges = Record<string, { min: number; max: number } | undefined>;

interface ReactiveVisualizerPageProps {
  state: SliderState;
  sliderModes: Record<string, SliderMode>;
  dualRanges: DualRanges;
  engineState: EngineState;
  isPlaying: boolean;
}

type NumericControlKey = Exclude<keyof ReactiveVisualizerControls, 'focus'>;

type ControlDefinition = {
  key: NumericControlKey;
  label: string;
  left: string;
  right: string;
  step?: number;
};

type EngineMeter = {
  key: keyof Pick<
    ReactiveVisualizerSnapshot,
    'pad' | 'lead' | 'drums' | 'earth' | 'granular' | 'delay' | 'reverb' | 'dynamics'
  >;
  label: string;
  color: string;
};

const DEFAULT_CONTROLS: ReactiveVisualizerControls = {
  style: 0,
  kaleidoscope: 0,
  triggerResponse: 0,
  ripples: 0,
  motion: 0,
  color: 0,
  diffusion: 0,
  density: 0,
  background: 0,
  frameRate: 0,
  shape: 0,
  organic: 0,
  edges: 0,
  focus: 'stringWaves',
};

const FOCUS_OPTIONS: Array<{ value: VisualizerFocus; label: string }> = [
  { value: 'stringWaves', label: 'String Waves' },
  { value: 'all', label: 'All' },
  { value: 'synth', label: 'Synth' },
  { value: 'earth', label: 'Earth' },
  { value: 'granular', label: 'Granular' },
  { value: 'drums', label: 'Drums' },
  { value: 'fx', label: 'FX' },
];

const CONTROL_GROUPS: Array<{ label: string; controls: ControlDefinition[] }> = [
  {
    label: 'Form',
    controls: [
      { key: 'style', label: 'Form', left: 'Noise fields', right: 'Gradient orbs' },
      { key: 'shape', label: 'Shape', left: 'Triangles', right: 'Circles' },
      { key: 'organic', label: 'Organic', left: 'Equal sided', right: 'Irregular angles' },
      { key: 'edges', label: 'Edges', left: 'Amoeba blobs', right: 'Hard cut' },
      { key: 'kaleidoscope', label: 'Granular fold', left: 'Sharper mirror shards', right: 'Soft glass repeats' },
      { key: 'density', label: 'Structure', left: 'Sparse layers', right: 'Dense layers' },
    ],
  },
  {
    label: 'Light',
    controls: [
      { key: 'background', label: 'Backdrop', left: 'Black gallery', right: 'Lit wall wash' },
      { key: 'color', label: 'Palette', left: 'Vivid accents', right: 'Kessho pastels' },
      { key: 'diffusion', label: 'Edge', left: 'Hard edge', right: 'Soft halo' },
    ],
  },
  {
    label: 'Motion',
    controls: [
      { key: 'triggerResponse', label: 'Trigger feel', left: 'Short sparks', right: 'Long afterglow' },
      { key: 'ripples', label: 'Water', left: 'Crisp rings', right: 'Soft pond' },
      { key: 'motion', label: 'Movement', left: 'Fast orbit', right: 'Slow breathe' },
      { key: 'frameRate', label: 'Performance', left: 'Battery saver', right: 'Smooth' },
    ],
  },
];

const ENGINE_METERS: EngineMeter[] = [
  { key: 'pad', label: 'Pad', color: '#E07A84' },
  { key: 'lead', label: 'Lead', color: '#D4A520' },
  { key: 'drums', label: 'Drums', color: '#A870E8' },
  { key: 'earth', label: 'Earth', color: '#6AAE82' },
  { key: 'granular', label: 'Granular', color: '#E8B44A' },
  { key: 'delay', label: 'Delay', color: '#5EA8A6' },
  { key: 'reverb', label: 'Reverb', color: '#B0785A' },
  { key: 'dynamics', label: 'Dynamics', color: '#CC7DB8' },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function createVisualizerSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return clamp(Number(values[0]) / 0xffffffff, 0.001, 0.999999);
  }
  return clamp(Math.random(), 0.001, 0.999999);
}

function formatSeed(seed: number): string {
  return Math.round(clamp(seed, 0, 1) * 999999).toString().padStart(6, '0');
}

function readNumber(state: SliderState, key: string, fallback = 0): number {
  const value = (state as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(state: SliderState, key: string, fallback = false): boolean {
  const value = (state as unknown as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
}

function normalizedRange(value: number, min: number, max: number): number {
  return clamp01((value - min) / Math.max(0.00001, max - min));
}

function logNorm(value: number, min: number, max: number): number {
  const safeMin = Math.max(0.0001, min);
  const safeValue = clamp(value, safeMin, max);
  return clamp01((Math.log(safeValue) - Math.log(safeMin)) / (Math.log(max) - Math.log(safeMin)));
}

function runtimeValue(
  state: SliderState,
  sliderModes: Record<string, SliderMode>,
  dualRanges: DualRanges,
  key: string,
  fallback = 0,
): number {
  const liveValue = getRuntimeValue(key);
  if (typeof liveValue === 'number' && Number.isFinite(liveValue)) return liveValue;
  const mode = sliderModes[key];
  if (mode === 'walk' || mode === 'sampleHold') {
    const position = getRuntimeSliderPosition(key, mode);
    if (typeof position === 'number' && Number.isFinite(position)) {
      const range = dualRanges[key];
      if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) {
        const min = Math.min(range.min, range.max);
        const max = Math.max(range.min, range.max);
        return min + (max - min) * clamp01(position);
      }
      return position;
    }
  }
  return readNumber(state, key, fallback);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getActiveGrains(): number {
  try {
    return audioEngine.getGranularActiveGrainCount();
  } catch {
    return 0;
  }
}

function focusSnapshot(snapshot: ReactiveVisualizerSnapshot, focus: VisualizerFocus): ReactiveVisualizerSnapshot {
  const next = { ...snapshot };
  const apply = (key: keyof ReactiveVisualizerSnapshot, multiplier: number) => {
    const value = next[key];
    if (typeof value === 'number') {
      (next as unknown as Record<string, number>)[key] = clamp01(value * multiplier);
    }
  };

  if (focus === 'stringWaves') {
    apply('pad', 1.24);
    apply('lead', 1.16);
    apply('earth', 1.18);
    apply('granular', 1.22);
    apply('delay', 1.12);
    apply('reverb', 1.24);
    apply('drums', 0.62);
    apply('dynamics', 0.7);
    return next;
  }
  if (focus === 'synth') {
    apply('pad', 1.36);
    apply('lead', 1.3);
    apply('granular', 0.86);
    apply('earth', 0.7);
    apply('drums', 0.44);
    return next;
  }
  if (focus === 'earth') {
    apply('earth', 1.55);
    apply('granular', 1.08);
    apply('pad', 0.72);
    apply('lead', 0.66);
    apply('drums', 0.36);
    return next;
  }
  if (focus === 'granular') {
    apply('granular', 1.58);
    apply('delay', 1.14);
    apply('reverb', 1.08);
    apply('earth', 0.8);
    apply('drums', 0.42);
    return next;
  }
  if (focus === 'drums') {
    apply('drums', 1.65);
    apply('dynamics', 1.16);
    apply('pad', 0.52);
    apply('earth', 0.46);
    return next;
  }
  if (focus === 'fx') {
    apply('delay', 1.42);
    apply('reverb', 1.48);
    apply('dynamics', 1.26);
    apply('granular', 1.08);
    apply('pad', 0.74);
    apply('lead', 0.78);
  }
  return next;
}

function buildSnapshot(
  state: SliderState,
  sliderModes: Record<string, SliderMode>,
  dualRanges: DualRanges,
  engineState: EngineState,
  controls: ReactiveVisualizerControls,
  timeMs: number,
): ReactiveVisualizerSnapshot {
  const value = (key: string, fallback = 0) => runtimeValue(state, sliderModes, dualRanges, key, fallback);
  const padLevel = Math.max(value('synthLevel'), value('pad2Level') * (readBoolean(state, 'pad2Enabled') ? 1 : 0.55));
  const padMorph = avg([
    value('padMorph'),
    value('pad2Morph'),
  ]);
  const padMotion = avg([
    normalizedRange(value('padLfo1Rate', 0), 0.05, 20),
    normalizedRange(value('padLfo2Rate', 0), 0.05, 20),
    normalizedRange(value('filterModSpeed', 0), 0, 20),
  ]);
  const padTone = avg([
    value('hardness'),
    value('warmth'),
    value('presence'),
    logNorm(value('filterCutoffMax', 1600), 40, 12000),
    padMorph,
  ]);

  const leadLevel = Math.max(
    value('leadLevel'),
    value('lead1Level'),
    value('lead2Level') * (readBoolean(state, 'lead2Enabled') ? 1 : 0.5),
    value('pianoLevel') * (readBoolean(state, 'pianoEnabled') ? 0.82 : 0.35),
  );
  const leadMorph = avg([
    value('lead1Morph'),
    value('lead2Morph'),
    value('lead1Distance'),
    value('lead2Distance'),
    value('pianoDistance'),
  ]);
  const leadRhythm = avg([
    value('lead1Density', value('leadDensity', 0.5)) / 2,
    value('synthEuclideanTempo', 1) / 12,
    value('synthEuclid1Level'),
    value('synthEuclid2Level'),
    value('synthEuclid3Level'),
    value('synthEuclid4Level'),
  ]);

  const drumVoiceLevel = avg([
    value('drumSubLevel'),
    value('drumKickLevel'),
    value('drumClickLevel'),
    value('drumBeepHiLevel'),
    value('drumBeepLoLevel'),
    value('drumNoiseLevel'),
    value('drumMembraneLevel'),
  ]);
  const drumSeqLevel = avg([
    value('drumEuclid1Level'),
    value('drumEuclid2Level'),
    value('drumEuclid3Level'),
    value('drumEuclid4Level'),
  ]);

  const earthLevel = value('earthLevel', 1);
  const waves = value('oceanSampleLevel') + value('granularWavesSend') * 0.45;
  const water = value('waterLevel') + value('granularWaterSend') * 0.38;
  const insects = (
    (readBoolean(state, 'insectsEnabled') ? value('insectsLevel') : 0) +
    (readBoolean(state, 'insects2Enabled') ? value('insects2Level') : 0)
  ) * value('insectsSharedLevel', 1);
  const nature = value('natureLevel') + value('granularNatureSend') * 0.34;

  const granularDensities = avg([
    normalizedRange(value('granularV1Density', value('density', 20)), 1, 64),
    normalizedRange(value('granularV2Density', 20), 1, 64),
    normalizedRange(value('granularV3Density', 20), 1, 64),
    normalizedRange(value('granularV4Density', 20), 1, 64),
  ]);
  const granularSends = avg([
    value('granularPad1Send'),
    value('granularPad2Send'),
    value('granularLead1Send'),
    value('granularLead2Send'),
    value('granularPianoSend'),
    value('granularDrumSend'),
    value('granularWavesSend'),
    value('granularNatureSend'),
    value('granularWaterSend'),
    value('granularInsectsSend'),
  ]);
  const activeGrains = getActiveGrains();

  const delayEnergy = avg([
    value('delayAMix'),
    value('delayAFeedback') / 0.8,
    value('delayAReverbSend'),
    value('delayAToBSend'),
    value('delayBToASend'),
    value('granularDelayMix'),
    value('delayAGranularSend'),
    value('delayBGranularSend'),
  ]);
  const reverbEnergy = avg([
    value('reverbLevel'),
    value('reverbDecay'),
    normalizedRange(value('reverbSize', 2), 0.5, 10),
    value('reverbDiffusion'),
    value('reverbModulation'),
    value('width'),
    value('granularReverbSend'),
  ]);
  const dynamicsEnergy = readBoolean(state, 'dynamicsEnabled') || readBoolean(state, 'dynamicsSaturationEnabled')
    ? avg([
      value('dynamicsSaturationDrive'),
      value('sidechainAmount'),
      value('characterMix'),
      value('degradeMix'),
      value('endCompMix'),
    ])
    : avg([value('masterSatDrive'), value('hardness')]) * 0.35;

  const modulationRangeEnergy = clamp01(Object.keys(dualRanges).length / 80);
  const transportPulse = engineState.isRunning ? 0.12 : 0;
  const pulses = getVisualizerPulseSnapshot(timeMs);

  const snapshot: ReactiveVisualizerSnapshot = {
    pad: clamp01(padLevel * 0.62 + padTone * 0.28 + padMotion * 0.18),
    lead: clamp01(leadLevel * 0.62 + leadMorph * 0.22 + leadRhythm * 0.24),
    drums: clamp01(value('drumLevel') * 0.7 + drumVoiceLevel * drumSeqLevel * 0.35),
    earth: clamp01(earthLevel * avg([waves, water, insects, nature])),
    granular: clamp01(value('granularLevel') * 0.58 + granularDensities * 0.26 + granularSends * 0.3 + activeGrains / 96),
    delay: clamp01(delayEnergy),
    reverb: clamp01(reverbEnergy),
    dynamics: clamp01(dynamicsEnergy),
    root: clamp01(((value('rootNote') + 12 + value('cofCurrentStep') + engineState.cofCurrentStep) % 12) / 12),
    tension: clamp01(value('tension') * 0.8 + modulationRangeEnergy * 0.2),
    spread: clamp01(value('waveSpread') * 0.58 + value('voicingSpread') * 0.32 + transportPulse),
    detune: clamp01(value('detune') / 25),
    morph: clamp01(avg([padMorph, leadMorph, pulses.sequencer])),
    brightness: clamp01(avg([
      logNorm(value('filterCutoffMax', 1600), 40, 12000),
      value('presence'),
      value('reverbInputTone', 0) * 0.5 + 0.5,
    ])),
    activeGrains,
    pulses,
  };

  return focusSnapshot(snapshot, controls.focus);
}

function fpsFromControl(value: number): number {
  if (value < 0) return Math.round(36 + value * 12);
  return Math.round(36 + value * 24);
}

function formatControlValue(def: ControlDefinition, value: number): string {
  if (def.key === 'frameRate') return `${fpsFromControl(value)} fps`;
  if (Math.abs(value) < 0.005) return 'neutral';
  return `${value < 0 ? def.left : def.right} ${Math.round(Math.abs(value) * 100)}%`;
}

const ReactiveVisualizerPage: React.FC<ReactiveVisualizerPageProps> = ({
  state,
  sliderModes,
  dualRanges,
  engineState,
  isPlaying,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReactiveVisualizerRenderer | null>(null);
  const controlsRef = useRef(DEFAULT_CONTROLS);
  const stateRef = useRef(state);
  const sliderModesRef = useRef(sliderModes);
  const dualRangesRef = useRef(dualRanges);
  const engineStateRef = useRef(engineState);
  const isPlayingRef = useRef(isPlaying);
  const sizeRef = useRef({ width: 960, height: 640 });
  const lastFrameRef = useRef(0);
  const [controls, setControls] = useState<ReactiveVisualizerControls>(DEFAULT_CONTROLS);
  const [seed, setSeed] = useState(createVisualizerSeed);
  const seedRef = useRef(seed);
  const [rendererMode, setRendererMode] = useState<'webgl2' | 'canvas2d'>('webgl2');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [meterSnapshot, setMeterSnapshot] = useState<ReactiveVisualizerSnapshot>(() => (
    buildSnapshot(state, sliderModes, dualRanges, engineState, DEFAULT_CONTROLS, 0)
  ));
  const meterUpdateRef = useRef(0);
  const { canAnimate } = useAnimationVisibility(rootRef, { rootMargin: '80px' });

  controlsRef.current = controls;
  seedRef.current = seed;
  stateRef.current = state;
  sliderModesRef.current = sliderModes;
  dualRangesRef.current = dualRanges;
  engineStateRef.current = engineState;
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ReactiveVisualizerRenderer(canvas);
    rendererRef.current = renderer;
    setRendererMode(renderer.mode);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const target = canvasWrapRef.current;
    if (!target) return;
    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      sizeRef.current = {
        width: Math.max(320, rect.width),
        height: Math.max(260, rect.height),
      };
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(target);
    updateSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
      if (document.fullscreenElement === rootRef.current) {
        setFullscreenFallback(false);
      }
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    updateFullscreen();
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useEffect(() => {
    if (!canAnimate) {
      lastFrameRef.current = 0;
      return undefined;
    }
    let frameId = 0;
    const loop = (timeMs: number) => {
      const renderer = rendererRef.current;
      if (renderer) {
        const controlState = controlsRef.current;
        const fps = isPlayingRef.current ? fpsFromControl(controlState.frameRate) : Math.min(24, fpsFromControl(controlState.frameRate));
        const frameInterval = 1000 / clamp(fps, 12, 60);
        if (timeMs - lastFrameRef.current >= frameInterval) {
          lastFrameRef.current = timeMs;
          const { width, height } = sizeRef.current;
          const dpr = getCappedCanvasDpr(1.1, 1.35);
          const snapshot = buildSnapshot(
            stateRef.current,
            sliderModesRef.current,
            dualRangesRef.current,
            engineStateRef.current,
            controlState,
            timeMs,
          );
          renderer.resize(width, height, dpr);
          renderer.render({
            timeMs,
            width,
            height,
            dpr,
            snapshot,
            controls: controlState,
            seed: seedRef.current,
          });
          if (timeMs - meterUpdateRef.current > 180) {
            meterUpdateRef.current = timeMs;
            setMeterSnapshot(snapshot);
          }
        }
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [canAnimate]);

  const updateControl = useCallback((key: NumericControlKey, value: number) => {
    setControls((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const updateFocus = useCallback((focus: VisualizerFocus) => {
    setControls((prev) => ({
      ...prev,
      focus,
    }));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      void document.exitFullscreen();
      return;
    }
    if (fullscreenFallback) {
      setFullscreenFallback(false);
      return;
    }
    if (!root.requestFullscreen) {
      setFullscreenFallback(true);
      return;
    }
    void root.requestFullscreen().catch(() => {
      setFullscreenFallback(true);
    });
  }, [fullscreenFallback]);

  useEffect(() => {
    if (!fullscreenFallback) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenFallback(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreenFallback]);

  const resetControls = useCallback(() => {
    setControls(DEFAULT_CONTROLS);
  }, []);

  const reseedVisualizer = useCallback(() => {
    setSeed(createVisualizerSeed());
  }, []);

  const controlRows = useMemo(() => CONTROL_GROUPS, []);

  return (
    <div ref={rootRef} className={`visualizer-root${fullscreenFallback ? ' visualizer-root--fullscreen-fallback' : ''}`}>
      <div ref={canvasWrapRef} className="visualizer-canvas-wrap">
        <canvas ref={canvasRef} className="visualizer-canvas" aria-label="Reactive visualizer" />
        <div className="visualizer-status-row">
          <span>{rendererMode === 'webgl2' ? 'WebGL2' : 'Canvas 2D'}</span>
          <span>{isPlaying ? 'Live' : 'Idle'}</span>
          <span>{fpsFromControl(controls.frameRate)} FPS cap</span>
          <span>Seed {formatSeed(seed)}</span>
        </div>
      </div>

      <aside className="visualizer-controls" aria-label="Visualizer controls">
        <div className="visualizer-controls-head">
          <div>
            <h2>Visualizer</h2>
            <div className="visualizer-mode-label">{controls.focus}</div>
          </div>
          <div className="visualizer-head-actions">
            <button type="button" onClick={toggleFullscreen} title={(isFullscreen || fullscreenFallback) ? 'Exit fullscreen' : 'Fullscreen'}>
              {(isFullscreen || fullscreenFallback) ? '[]' : '[ ]'}
            </button>
            <button type="button" onClick={reseedVisualizer} title="New random seed">
              S
            </button>
            <button type="button" onClick={resetControls} title="Reset">
              R
            </button>
          </div>
        </div>

        <label className="visualizer-select-row">
          <span>Focus</span>
          <select
            value={controls.focus}
            onChange={(event) => updateFocus(event.target.value as VisualizerFocus)}
          >
            {FOCUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="visualizer-meter-grid">
          {ENGINE_METERS.map((meter) => {
            const value = clamp01(meterSnapshot[meter.key]);
            return (
              <div className="visualizer-meter" key={meter.key}>
                <span>{meter.label}</span>
                <div className="visualizer-meter-track">
                  <div
                    className="visualizer-meter-fill"
                    style={{
                      width: `${Math.round(value * 100)}%`,
                      backgroundColor: meter.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {controlRows.map((group) => (
          <section className="visualizer-control-group" key={group.label}>
            <h3>{group.label}</h3>
            {group.controls.map((def) => {
              const value = controls[def.key];
              const numericValue = typeof value === 'number' ? value : 0;
              return (
                <label className="visualizer-slider-row" key={def.key}>
                  <span className="visualizer-slider-label">
                    <span>{def.label}</span>
                    <strong>{formatControlValue(def, numericValue)}</strong>
                  </span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={def.step ?? 0.01}
                    value={numericValue}
                    onChange={(event) => updateControl(def.key, Number(event.target.value))}
                  />
                  <span className="visualizer-slider-directions">
                    <span>{def.left}</span>
                    <span>neutral</span>
                    <span>{def.right}</span>
                  </span>
                </label>
              );
            })}
          </section>
        ))}
      </aside>
    </div>
  );
};

export default ReactiveVisualizerPage;
