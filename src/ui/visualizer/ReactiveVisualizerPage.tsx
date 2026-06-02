import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductEngineState } from '../../audio/product/ProductEngineTypes';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';
import { getRuntimeSliderPosition } from '../runtimeSliderState';
import { getRuntimeValue } from '../runtimeValueState';
import { SliderPrimitive } from '../sliderSystem';
import type { SliderMode, SliderState } from '../state';
import {
  ReactiveVisualizerRenderer,
  type ReactiveVisualizerControls,
  type ReactiveVisualizerSnapshot,
  type VisualizerFocus,
} from './ReactiveVisualizerRenderer';
import {
  type VisualizerReactionSettings,
  type VisualizerReactiveRanges,
  type VisualizerNumericControlKey,
  buildVisualBuses,
  applyVisualizerModulation,
  createDefaultReactiveRanges,
  getDriversForTarget,
  getEffectiveReactionDepth,
} from './visualizerModulation';
import {
  type VisualizerPresetData,
  listVisualizerPresets,
  loadVisualizerPreset,
  saveVisualizerPreset,
} from './visualizerPresetStore';
import type { PresetSummary } from '../../presets/types';
import { getVisualizerPulseSnapshot } from './visualizerSignals';
import { reactiveVisualizerRootSignal } from './reactiveVisualizerHarmony';
import './reactiveVisualizer.css';

type DualRanges = Record<string, { min: number; max: number } | undefined>;

interface ReactiveVisualizerPageProps {
  state: SliderState;
  sliderModes: Record<string, SliderMode>;
  dualRanges: DualRanges;
  engineState: ProductEngineState;
  isPlaying: boolean;
  getActiveGrains: () => number;
  linkedPresetRequest: { name: string; nonce: number } | null;
  onVisualizerPresetChange: React.Dispatch<React.SetStateAction<string>>;
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
  background: 0,
  frameRate: 0,
  shape: 0,
  organic: 0,
  edges: 0,
  backdropFade: 0,
  noiseTurbulence: 0,
  noiseFlow: 0,
  noiseSpeed: 0,
  noiseColor: 0,
  pulseSync: 0,
  shapeSize: 0,
  shapeCount: 0,
  noiseSize: 0,
  noiseDensity: 0,
  bloomSize: 0,
  kaleidoSize: 0,
  glitchIntensity: 0,
  glitchScale: 0,
  glitchChromatic: 0,
  glitchRate: 0,
  charAmount: 0,
  charStyle: 0,
  charGrain: 0,
  charDrift: 0,
  kaleidoSegments: 0,
  kaleidoSpin: 0,
  kaleidoType: 0,
  kaleidoReflections: 0,
  brightness: 0,
  vibrance: 0,
  saturation: 0,
  impactFlash: 0,
  visualLimiter: 0,
  layerOrder: [0, 1, 2, 3],  // shapes, atmos, glitch, kaleido
  focus: 'stringWaves',
};

const DEFAULT_REACTION: VisualizerReactionSettings = {
  reactionAmount: 0.72,
  morphAroundPreset: 0.5,
  afterglow: 0.4,
  mode: 'auto',
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

const CONTROL_GROUPS: Array<{ label: string; collapsed?: boolean; controls: ControlDefinition[] }> = [
  {
    label: 'Shape',
    controls: [
      { key: 'shape', label: 'Geometry', left: 'Angular', right: 'Round' },
      { key: 'shapeCount', label: 'Count', left: 'Few', right: 'Many' },
      { key: 'shapeSize', label: 'Spread', left: 'Tight', right: 'Fill' },
      { key: 'organic', label: 'Organic', left: 'Uniform', right: 'Irregular' },
      { key: 'edges', label: 'Edges', left: 'Amoeba', right: 'Gradient' },
      { key: 'diffusion', label: 'Opacity', left: 'Solid', right: 'Faded' },
    ],
  },
  {
    label: 'Color',
    controls: [
      { key: 'color', label: 'Palette', left: 'Electric', right: 'Jewel' },
      { key: 'background', label: 'Background', left: 'Indigo', right: 'Blush' },
      { key: 'backdropFade', label: 'Backdrop', left: 'Hidden', right: 'Glow' },
    ],
  },
  {
    label: 'Motion',
    controls: [
      { key: 'motion', label: 'Drift', left: 'Fast orbit', right: 'Slow breathe' },
      { key: 'ripples', label: 'Ripple', left: 'Tight', right: 'Soft' },
      { key: 'triggerResponse', label: 'Trigger', left: 'Sparks', right: 'Afterglow' },
    ],
  },
  {
    label: 'Atmosphere',
    controls: [
      { key: 'style', label: 'Type', left: 'Nebula', right: 'Aurora' },
      { key: 'noiseTurbulence', label: 'Turbulence', left: 'Smooth', right: 'Chaotic' },
      { key: 'noiseFlow', label: 'Flow', left: 'Horizontal', right: 'Vertical' },
      { key: 'noiseSpeed', label: 'Speed', left: 'Frozen', right: 'Fast' },
      { key: 'noiseColor', label: 'Color', left: 'Random', right: 'Shape sync' },
      { key: 'noiseSize', label: 'Scale', left: 'Detail', right: 'Broad' },
      { key: 'noiseDensity', label: 'Density', left: 'Sparse', right: 'Dense' },
      { key: 'bloomSize', label: 'Bloom', left: 'Tight', right: 'Wide' },
    ],
  },
  {
    label: 'Glitch',
    collapsed: true,
    controls: [
      { key: 'glitchIntensity', label: 'Mode', left: 'VHS', right: 'Digital' },
      { key: 'glitchScale', label: 'Size', left: 'Large', right: 'Fine' },
      { key: 'glitchChromatic', label: 'Chromatic', left: 'Clean', right: 'RGB split' },
      { key: 'glitchRate', label: 'Rate', left: 'Slow', right: 'Chaotic' },
    ],
  },
  {
    label: 'Kaleidoscope',
    collapsed: true,
    controls: [
      { key: 'kaleidoscope', label: 'Intensity', left: 'Shards', right: 'Glass' },
      { key: 'kaleidoSegments', label: 'Segments', left: 'Few', right: 'Many' },
      { key: 'kaleidoSpin', label: 'Spin', left: 'Reverse', right: 'Forward' },
      { key: 'kaleidoType', label: 'Mode', left: 'Prism', right: 'Liquid' },
      { key: 'kaleidoSize', label: 'Coverage', left: 'Center', right: 'Full' },
    ],
  },
  {
    label: 'Character',
    collapsed: true,
    controls: [
      { key: 'charAmount', label: 'Amount', left: 'Clean', right: 'Heavy' },
      { key: 'charStyle', label: 'Style', left: 'Tape', right: 'Digital' },
      { key: 'charGrain', label: 'Grain', left: 'Smooth', right: 'Noisy' },
      { key: 'charDrift', label: 'Drift', left: 'Stable', right: 'Wobbly' },
    ],
  },
  {
    label: 'System',
    collapsed: true,
    controls: [
      { key: 'pulseSync', label: 'Pulse sync', left: 'Free', right: 'Locked' },
      { key: 'frameRate', label: 'Performance', left: 'Battery', right: 'Smooth' },
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
  engineState: ProductEngineState,
  activeGrains: number,
  controls: ReactiveVisualizerControls,
  timeMs: number,
): ReactiveVisualizerSnapshot {
  const value = (key: string, fallback = 0) => runtimeValue(state, sliderModes, dualRanges, key, fallback);
  const padLevel = Math.max(value('synthLevel'), value('pad2Level') * (readBoolean(state, 'pad2Enabled') ? 1 : 0.55));
  const padMorph = Math.max(value('padMorph'), value('pad2Morph'));
  const padMotion = Math.max(
    normalizedRange(value('padLfo1Rate', 0), 0.05, 20),
    normalizedRange(value('padLfo2Rate', 0), 0.05, 20),
    normalizedRange(value('filterModSpeed', 0), 0, 20),
  );
  const padTone = Math.max(
    value('hardness'),
    value('warmth'),
    value('presence'),
    logNorm(value('filterCutoffMax', 1600), 40, 12000),
  );

  const leadLevel = Math.max(
    value('leadLevel'),
    value('lead1Level'),
    value('lead2Level') * (readBoolean(state, 'lead2Enabled') ? 1 : 0.5),
    value('pianoLevel') * (readBoolean(state, 'pianoEnabled') ? 0.82 : 0.35),
  );
  const leadMorph = Math.max(
    value('lead1Morph'),
    value('lead2Morph'),
    value('lead1Distance'),
    value('lead2Distance'),
  );
  const leadRhythm = Math.max(
    value('lead1Density', value('leadDensity', 0.5)) / 2,
    value('synthEuclideanTempo', 1) / 12,
    Math.max(value('synthEuclid1Level'), value('synthEuclid2Level'), value('synthEuclid3Level'), value('synthEuclid4Level')),
  );

  const drumVoiceLevel = Math.max(
    value('drumSubLevel'),
    value('drumKickLevel'),
    value('drumClickLevel'),
    value('drumBeepHiLevel'),
    value('drumBeepLoLevel'),
    value('drumNoiseLevel'),
    value('drumMembraneLevel'),
  );
  const drumSeqLevel = Math.max(
    value('drumEuclid1Level'),
    value('drumEuclid2Level'),
    value('drumEuclid3Level'),
    value('drumEuclid4Level'),
  );

  const earthLevel = value('earthLevel', 1);
  const earthSources = Math.max(
    value('oceanSampleLevel') + value('granularWavesSend') * 0.45,
    value('waterLevel') + value('granularWaterSend') * 0.38,
    (readBoolean(state, 'insectsEnabled') ? value('insectsLevel') : 0) +
      (readBoolean(state, 'insects2Enabled') ? value('insects2Level') : 0),
    value('natureLevel') + value('granularNatureSend') * 0.34,
  );

  const granularDensities = Math.max(
    normalizedRange(value('granularV1Density', value('density', 20)), 1, 64),
    normalizedRange(value('granularV2Density', 20), 1, 64),
    normalizedRange(value('granularV3Density', 20), 1, 64),
    normalizedRange(value('granularV4Density', 20), 1, 64),
  );
  const granularSends = Math.max(
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
  );
  const delayEnergy = Math.max(
    value('delayAMix'),
    value('delayAFeedback') / 0.8,
    value('granularDelayMix'),
    (value('delayAToBSend') + value('delayBToASend')) * 0.8,
  );
  const reverbEnergy = Math.max(
    value('reverbLevel'),
    value('reverbDecay'),
    normalizedRange(value('reverbSize', 2), 0.5, 10),
    value('reverbModulation'),
    value('granularReverbSend'),
  );
  const dynamicsEnergy = readBoolean(state, 'dynamicsEnabled') || readBoolean(state, 'dynamicsSaturationEnabled')
    ? Math.max(
      value('dynamicsSaturationDrive'),
      value('sidechainAmount'),
      value('characterMix'),
      value('degradeMix'),
      value('endCompMix'),
    )
    : Math.max(value('masterSatDrive'), value('hardness')) * 0.5;

  const modulationRangeEnergy = clamp01(Object.keys(dualRanges).length / 80);
  const transportPulse = engineState.isRunning ? 0.12 : 0;
  const pulses = getVisualizerPulseSnapshot(timeMs);

  const snapshot: ReactiveVisualizerSnapshot = {
    pad: clamp01(padLevel * 0.72 + padTone * 0.32 + padMotion * 0.28 + padMorph * 0.2),
    lead: clamp01(leadLevel * 0.72 + leadMorph * 0.32 + leadRhythm * 0.3),
    drums: clamp01(value('drumLevel') * 0.75 + drumVoiceLevel * 0.3 + drumSeqLevel * 0.3),
    earth: clamp01(earthLevel * 0.5 + earthSources * 0.7),
    granular: clamp01(value('granularLevel') * 0.6 + granularDensities * 0.32 + granularSends * 0.28 + activeGrains / 36),
    delay: clamp01(delayEnergy * 1.2),
    reverb: clamp01(reverbEnergy * 1.15),
    dynamics: clamp01(dynamicsEnergy * 1.1),
    root: clamp01(reactiveVisualizerRootSignal({
      rootNote: value('rootNote'),
      cofCurrentStep: value('cofCurrentStep'),
      cofDriftEnabled: readBoolean(state, 'cofDriftEnabled'),
      engineState,
    })),
    tension: clamp01(value('tension') * 0.8 + modulationRangeEnergy * 0.2),
    spread: clamp01(value('waveSpread') * 0.58 + value('voicingSpread') * 0.32 + transportPulse),
    detune: clamp01(value('detune') / 25),
    morph: clamp01(Math.max(padMorph, leadMorph, pulses.sequencer)),
    brightness: clamp01(Math.max(
      logNorm(value('filterCutoffMax', 1600), 40, 12000),
      value('presence'),
      value('reverbInputTone', 0) * 0.5 + 0.5,
    )),
    activeGrains,
    pulses,
  };

  return focusSnapshot(snapshot, controls.focus);
}

function fpsFromControl(value: number): number {
  if (value < 0) return Math.round(36 + value * 12);
  return Math.round(36 + value * 24);
}

const ReactiveVisualizerPage: React.FC<ReactiveVisualizerPageProps> = ({
  state,
  sliderModes,
  dualRanges,
  engineState,
  isPlaying,
  getActiveGrains,
  linkedPresetRequest: _linkedPresetRequest,
  onVisualizerPresetChange: _onVisualizerPresetChange,
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
  const getActiveGrainsRef = useRef(getActiveGrains);
  const sizeRef = useRef({ width: 960, height: 640 });
  const lastFrameRef = useRef(0);
  const [controls, setControls] = useState<ReactiveVisualizerControls>(DEFAULT_CONTROLS);
  const [seed, setSeed] = useState(createVisualizerSeed);
  const seedRef = useRef(seed);
  const [rendererMode, setRendererMode] = useState<'webgl2' | 'canvas2d'>('webgl2');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [meterSnapshot, setMeterSnapshot] = useState<ReactiveVisualizerSnapshot>(() => (
    buildSnapshot(state, sliderModes, dualRanges, engineState, getActiveGrains(), DEFAULT_CONTROLS, 0)
  ));
  const [modulatedControlsState, setModulatedControlsState] = useState<ReactiveVisualizerControls>(DEFAULT_CONTROLS);
  const meterUpdateRef = useRef(0);
  const { canAnimate } = useAnimationVisibility(rootRef, { rootMargin: '80px' });

  // --- Reaction / modulation state ---
  const [reaction, setReaction] = useState<VisualizerReactionSettings>(DEFAULT_REACTION);
  const [reactiveRanges, setReactiveRanges] = useState<VisualizerReactiveRanges>(() =>
    createDefaultReactiveRanges(DEFAULT_CONTROLS),
  );
  const reactionRef = useRef(reaction);
  const reactiveRangesRef = useRef(reactiveRanges);
  reactionRef.current = reaction;
  reactiveRangesRef.current = reactiveRanges;

  // --- Preset state ---
  const [presetList, setPresetList] = useState<PresetSummary[]>([]);
  const [presetName, setPresetName] = useState('');
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);

  controlsRef.current = controls;
  seedRef.current = seed;
  stateRef.current = state;
  sliderModesRef.current = sliderModes;
  dualRangesRef.current = dualRanges;
  engineStateRef.current = engineState;
  isPlayingRef.current = isPlaying;
  getActiveGrainsRef.current = getActiveGrains;

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
            getActiveGrainsRef.current(),
            controlState,
            timeMs,
          );
          // Apply modulation: visual buses → mod matrix → modulated controls
          const currentReaction = reactionRef.current;
          const buses = buildVisualBuses(snapshot, currentReaction);
          const modulatedControls = applyVisualizerModulation(
            controlState,
            reactiveRangesRef.current,
            buses,
            currentReaction,
          );
          renderer.resize(width, height, dpr);
          renderer.render({
            timeMs,
            width,
            height,
            dpr,
            snapshot,
            controls: modulatedControls,
            seed: seedRef.current,
          });
          if (timeMs - meterUpdateRef.current > 180) {
            meterUpdateRef.current = timeMs;
            setMeterSnapshot(snapshot);
            setModulatedControlsState(modulatedControls);
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
    setReactiveRanges(createDefaultReactiveRanges(DEFAULT_CONTROLS));
    setReaction(DEFAULT_REACTION);
    setActivePresetName(null);
  }, []);

  const reseedVisualizer = useCallback(() => {
    setSeed(createVisualizerSeed());
  }, []);

  // --- Preset handlers ---
  const refreshPresets = useCallback(() => {
    void listVisualizerPresets().then(setPresetList);
  }, []);

  useEffect(() => { refreshPresets(); }, [refreshPresets]);

  const handleSavePreset = useCallback(async () => {
    const name = presetName.trim();
    if (!name) return;
    setPresetSaving(true);
    const data: VisualizerPresetData = {
      format: 'kessho-visualizer-preset',
      formatVersion: 1,
      mode: reaction.mode,
      controls,
      reactiveRanges,
      reaction,
      seed,
    };
    await saveVisualizerPreset(name, data);
    setActivePresetName(name);
    _onVisualizerPresetChange(name);
    refreshPresets();
    setPresetSaving(false);
  }, [presetName, controls, reactiveRanges, reaction, seed, refreshPresets, _onVisualizerPresetChange]);

  const handleLoadPreset = useCallback(async (name: string) => {
    const result = await loadVisualizerPreset(name);
    if (!result) return;
    const { data } = result;
    setControls(data.controls);
    setReactiveRanges(data.reactiveRanges);
    setReaction(data.reaction);
    setSeed(data.seed);
    setActivePresetName(name);
    setPresetName(name);
    _onVisualizerPresetChange(name);
  }, [_onVisualizerPresetChange]);

  // Handle linked preset requests from parent
  useEffect(() => {
    if (_linkedPresetRequest && _linkedPresetRequest.name) {
      void handleLoadPreset(_linkedPresetRequest.name);
    }
  }, [_linkedPresetRequest, handleLoadPreset]);

  // Update reactive ranges when controls change
  const updateReactiveRanges = useCallback(() => {
    setReactiveRanges(createDefaultReactiveRanges(controls));
  }, [controls]);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of CONTROL_GROUPS) {
      if (group.collapsed) initial[group.label] = true;
    }
    return initial;
  });

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  const [metersOpen, setMetersOpen] = useState(false);

  // Per-slider mode: single (value line) / walk (range band + indicator) / sampleHold
  const [vizSliderModes, setVizSliderModes] = useState<Record<string, SliderMode>>({});
  const cycleVizMode = useCallback((key: string) => {
    setVizSliderModes((prev) => {
      const current = prev[key] ?? 'walk';
      const next: SliderMode = current === 'single' ? 'walk' : current === 'walk' ? 'sampleHold' : 'single';
      return { ...prev, [key]: next };
    });
  }, []);

  const formatBipolar = useCallback((percent: number) => {
    const val = ((percent / 100) * 2 - 1);
    if (Math.abs(val) < 0.01) return '0';
    return val > 0 ? `+${Math.round(val * 100)}` : `${Math.round(val * 100)}`;
  }, []);

  return (
    <div ref={rootRef} className={`visualizer-root${fullscreenFallback ? ' visualizer-root--fullscreen-fallback' : ''}`}>
      <div ref={canvasWrapRef} className="visualizer-canvas-wrap">
        <canvas ref={canvasRef} className="visualizer-canvas" aria-label="Reactive visualizer" />
        <div className="visualizer-status-row">
          <span>{rendererMode === 'webgl2' ? 'WebGL2' : '2D'}</span>
          <span>{isPlaying ? 'Live' : 'Idle'}</span>
          <span>{fpsFromControl(controls.frameRate)} FPS</span>
          <span>{formatSeed(seed)}</span>
        </div>
      </div>

      <aside className="visualizer-controls" aria-label="Visualizer controls">
        <div className="visualizer-controls-head">
          <div className="visualizer-head-title">
            <h2>Visualizer</h2>
            <select
              className="visualizer-focus-select"
              value={controls.focus}
              onChange={(event) => updateFocus(event.target.value as VisualizerFocus)}
            >
              {FOCUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="visualizer-head-actions">
            <button type="button" onClick={toggleFullscreen} title={(isFullscreen || fullscreenFallback) ? 'Exit fullscreen' : 'Fullscreen'}>
              {(isFullscreen || fullscreenFallback) ? '⊡' : '⊞'}
            </button>
            <button type="button" onClick={reseedVisualizer} title="New seed">⟳</button>
            <button type="button" onClick={resetControls} title="Reset all">↺</button>
          </div>
        </div>

        <button
          type="button"
          className={`visualizer-meters-toggle${metersOpen ? ' open' : ''}`}
          onClick={() => setMetersOpen((v) => !v)}
        >
          <span>Engine levels</span>
          <span className="visualizer-meters-arrow">{metersOpen ? '▾' : '▸'}</span>
        </button>
        {metersOpen && (
          <div className="visualizer-meter-grid">
            {ENGINE_METERS.map((meter) => {
              const value = clamp01(meterSnapshot[meter.key]);
              return (
                <div className="visualizer-meter" key={meter.key}>
                  <span>{meter.label}</span>
                  <div className="visualizer-meter-track">
                    <div
                      className="visualizer-meter-fill"
                      style={{ width: `${Math.round(value * 100)}%`, backgroundColor: meter.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Macros: Reactivity & Intensity ─── */}
        <section className="visualizer-macros">
          <div className="visualizer-slider-wrap">
            <SliderPrimitive
              label="Reactivity"
              mode="single"
              value={reaction.reactionAmount * 100}
              variant="full"
              density="compact"
              hero="#9ccfbd"
              formatValue={(p) => `${Math.round(p)}%`}
              displayValue={`${Math.round(reaction.reactionAmount * 100)}%`}
              onValueChange={(p) => setReaction((prev) => ({ ...prev, reactionAmount: p / 100 }))}
            />
          </div>
          <div className="visualizer-slider-wrap">
            <SliderPrimitive
              label="Afterglow"
              mode="single"
              value={reaction.afterglow * 100}
              variant="full"
              density="compact"
              hero="#9ccfbd"
              formatValue={(p) => `${Math.round(p)}%`}
              displayValue={`${Math.round(reaction.afterglow * 100)}%`}
              onValueChange={(p) => setReaction((prev) => ({ ...prev, afterglow: p / 100 }))}
            />
          </div>
          <div className="visualizer-slider-wrap">
            <SliderPrimitive
              label="Morph Depth"
              mode="single"
              value={reaction.morphAroundPreset * 100}
              variant="full"
              density="compact"
              hero="#9ccfbd"
              formatValue={(p) => `${Math.round(p)}%`}
              displayValue={`${Math.round(reaction.morphAroundPreset * 100)}%`}
              onValueChange={(p) => setReaction((prev) => ({ ...prev, morphAroundPreset: p / 100 }))}
            />
          </div>
        </section>

        {/* ─── Preset save/load ─── */}
        <section className="visualizer-presets">
          <div className="visualizer-preset-save-row">
            <input
              type="text"
              className="visualizer-preset-input"
              placeholder={activePresetName ?? 'Preset name…'}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSavePreset(); }}
            />
            <button
              type="button"
              className="visualizer-preset-save-btn"
              onClick={() => void handleSavePreset()}
              disabled={!presetName.trim() || presetSaving}
              title="Save preset"
            >
              {presetSaving ? '…' : '↓'}
            </button>
            <button
              type="button"
              className="visualizer-preset-save-btn"
              onClick={updateReactiveRanges}
              title="Recalculate reactive ranges from current controls"
            >
              ⟲
            </button>
          </div>
          {presetList.length > 0 && (
            <div className="visualizer-preset-list">
              {presetList.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`visualizer-preset-chip${p.name === activePresetName ? ' active' : ''}`}
                  onClick={() => void handleLoadPreset(p.name)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </section>

        {CONTROL_GROUPS.map((group) => {
          const isCollapsed = collapsedGroups[group.label] ?? false;
          return (
            <section className="visualizer-control-group" key={group.label}>
              <button
                type="button"
                className="visualizer-group-header"
                onClick={() => toggleGroup(group.label)}
              >
                <h3>{group.label}</h3>
                <span className="visualizer-group-arrow">{isCollapsed ? '▸' : '▾'}</span>
              </button>
              {!isCollapsed && group.controls.map((def) => {
                const value = controls[def.key];
                const numericValue = typeof value === 'number' ? value : 0;
                // Map bipolar -1..+1 to 0..100 for SliderPrimitive
                const percent = (numericValue + 1) * 50;
                // Reactive range mapped to 0-100%
                const rr = reactiveRanges[def.key as VisualizerNumericControlKey];
                const sliderRange = rr
                  ? { min: (rr.min + 1) * 50, max: (rr.max + 1) * 50 }
                  : undefined;
                // Modulated value mapped to 0-100%
                const modVal = modulatedControlsState[def.key];
                const modPercent = typeof modVal === 'number' ? (modVal + 1) * 50 : percent;
                // Mod routes driving this param
                const drivers = getDriversForTarget(def.key as VisualizerNumericControlKey);
                const modActive = Math.abs(modPercent - percent) > 0.5;
                // Per-slider mode (default walk if has range, else single)
                const sliderMode = vizSliderModes[def.key] ?? (sliderRange ? 'walk' : 'single');
                return (
                  <div className="visualizer-slider-wrap" key={def.key}>
                    <SliderPrimitive
                      label={def.label}
                      mode={sliderMode}
                      value={percent}
                      range={sliderMode !== 'single' ? sliderRange : undefined}
                      indicatorValue={sliderMode !== 'single' ? modPercent : undefined}
                      variant="full"
                      density="compact"
                      hero="#9ccfbd"
                      formatValue={formatBipolar}
                      displayValue={
                        Math.abs(numericValue) < 0.01
                          ? '—'
                          : numericValue < 0
                            ? `${def.left} ${Math.round(Math.abs(numericValue) * 100)}%`
                            : `${def.right} ${Math.round(numericValue * 100)}%`
                      }
                      onValueChange={(nextPercent) => {
                        const bipolar = (nextPercent / 50) - 1;
                        updateControl(def.key, Math.round(bipolar * 100) / 100);
                      }}
                      onRangeChange={sliderMode !== 'single' ? (nextRange) => {
                        const bipolarMin = (nextRange.min / 50) - 1;
                        const bipolarMax = (nextRange.max / 50) - 1;
                        setReactiveRanges((prev) => ({
                          ...prev,
                          [def.key]: { min: bipolarMin, max: bipolarMax },
                        }));
                      } : undefined}
                      onModeCycle={() => cycleVizMode(def.key)}
                    />
                    {drivers.length > 0 && (
                      <div className={`visualizer-mod-drivers${modActive ? ' active' : ''}`}>
                        {drivers.map((route) => {
                          const effectivePct = Math.round(route.amount * getEffectiveReactionDepth(reaction) * 100);
                          return (
                            <span
                              key={route.label}
                              className={`visualizer-mod-chip${route.eventDriven ? ' visualizer-mod-chip--event' : ' visualizer-mod-chip--engine'}`}
                              title={`${route.label} — ${route.engines.join(', ')} → ${route.target} (${effectivePct}%)`}
                            >
                              <span className="visualizer-mod-chip-bar" style={{ width: `${effectivePct}%` }} />
                              <span className="visualizer-mod-chip-text">
                              {route.eventDriven ? '▲ ' : '∼ '}{route.label}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </aside>
    </div>
  );
};

export default ReactiveVisualizerPage;
