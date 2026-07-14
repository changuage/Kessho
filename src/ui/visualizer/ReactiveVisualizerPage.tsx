import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductEngineState } from '../../audio/product/ProductEngineTypes';
import { useAnimationVisibility } from '../hooks/useAnimationVisibility';
import { getRuntimeSliderPosition } from '../runtimeSliderState';
import { getRuntimeValue } from '../runtimeValueState';
import {
  resolveDualSliderAutomation,
  type DualSliderAutomationState,
} from '../shared/dualSliderAutomation';
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
  DEFAULT_LAYER_STACK,
  DEFAULT_VISUALIZER_LAYER_MACROS,
  DEFAULT_VISUALIZER_MACROS,
  VISUALIZER_LAYER_DEFS,
  layerOrderToStack,
  moveLayerInStack,
  normalizeLayerOrder,
  stackToLayerOrder,
  updateControlsPatch,
  type VisualizerLayerId,
  type VisualizerLayerMacroId,
  type VisualizerLayerMacros,
  type VisualizerPerformanceMacroId,
  type VisualizerPerformanceMacros,
  type VisualizerQualityMode,
} from './visualizerControls';
import { resolveVisualizerMacroControls } from './visualizerSceneResolver';
import {
  resolveVisualizerQualityMode,
  type VisualizerQualitySettings,
} from './visualizerQuality';
import {
  type VisualizerPresetData,
  listVisualizerPresets,
  loadVisualizerPreset,
  saveVisualizerPreset,
} from './visualizerPresetStore';
import type { PresetSummary } from '../../presets/types';
import {
  getVisualizerPulseSnapshot,
  setVisualizerSignalDemand,
  subscribeVisualizerSignals,
} from './visualizerSignals';
import {
  resolveVisualizerFramePlan,
  type VisualizerFrameMode,
} from './visualizerFrameScheduler';
import {
  recordVisualizerFramePerformance,
  recordVisualizerParkedTransition,
  visualizerPerformanceInstrumentationEnabled,
} from './visualizerPerformance';
import { readVisualizerTelemetrySignal } from './visualizerTelemetry';
import { formatVisualizerControlValue } from './visualizerControlDomains';
import {
  DEFAULT_VISUALIZER_CONTROLS,
  VISUALIZER_CONTROL_GROUPS,
  VISUALIZER_FOCUS_OPTIONS,
} from './visualizerControlSchema';
import { VisualizerMacroPanels } from './VisualizerMacroPanels';
import { VisualizerCanvasSurface } from './VisualizerCanvasSurface';
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
  enabled?: boolean;
  mobileReducedVisuals?: boolean;
}

type ReactiveVisualizerPageInnerProps = Omit<ReactiveVisualizerPageProps, 'enabled'> & {
  mobileReducedVisuals: boolean;
};

type NumericControlKey = VisualizerNumericControlKey;

type EngineMeter = {
  key: keyof Pick<
    ReactiveVisualizerSnapshot,
    'pad' | 'lead' | 'drums' | 'earth' | 'granular' | 'delay' | 'reverb' | 'dynamics'
  >;
  label: string;
  color: string;
};

const DEFAULT_CONTROLS = DEFAULT_VISUALIZER_CONTROLS;

const DEFAULT_REACTION: VisualizerReactionSettings = {
  reactionAmount: 0.5,
  morphAroundPreset: 0.5,
  afterglow: 0.5,
  mode: 'auto',
};

const DEFAULT_QUALITY_MODE: VisualizerQualityMode = 'auto';

const FOCUS_OPTIONS = VISUALIZER_FOCUS_OPTIONS;
const CONTROL_GROUPS = VISUALIZER_CONTROL_GROUPS;

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

const QUALITY_MODE_LABELS: Record<VisualizerQualityMode, string> = {
  auto: 'Auto',
  mobileSafe: 'Mobile Safe',
  desktopBeauty: 'Desktop Beauty',
};

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

function getBrowserDpr(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
}

function resolveCurrentQuality(
  requestedMode: VisualizerQualityMode,
  mobileReducedVisuals: boolean,
  isCoarsePointer: boolean,
): VisualizerQualitySettings {
  return resolveVisualizerQualityMode({
    requestedMode,
    isMobileReducedVisuals: mobileReducedVisuals,
    isCoarsePointer,
    devicePixelRatio: getBrowserDpr(),
  });
}

function isVisualizerQualityMode(value: unknown): value is VisualizerQualityMode {
  return value === 'auto' || value === 'mobileSafe' || value === 'desktopBeauty';
}

function sanitizeVisualizerControls(source: Partial<ReactiveVisualizerControls> | undefined): ReactiveVisualizerControls {
  const controls = source ?? {};
  const focus = FOCUS_OPTIONS.some((option) => option.value === controls.focus)
    ? controls.focus as VisualizerFocus
    : DEFAULT_CONTROLS.focus;
  return {
    ...DEFAULT_CONTROLS,
    ...controls,
    pointCloudAmount: controls.pointCloudAmount ?? DEFAULT_CONTROLS.pointCloudAmount,
    pointCloudSize: controls.pointCloudSize ?? DEFAULT_CONTROLS.pointCloudSize,
    pointCloudDensity: controls.pointCloudDensity ?? DEFAULT_CONTROLS.pointCloudDensity,
    pointCloudScatter: controls.pointCloudScatter ?? DEFAULT_CONTROLS.pointCloudScatter,
    pointCloudColor: controls.pointCloudColor ?? DEFAULT_CONTROLS.pointCloudColor,
    kaleidoPattern: controls.kaleidoPattern ?? DEFAULT_CONTROLS.kaleidoPattern,
    shapeSpread: controls.shapeSpread ?? DEFAULT_CONTROLS.shapeSpread,
    layerOrder: normalizeLayerOrder(controls.layerOrder),
    focus,
  };
}

function sanitizePerformanceMacros(source: Partial<VisualizerPerformanceMacros> | undefined): VisualizerPerformanceMacros {
  return {
    soft: clamp01(source?.soft ?? DEFAULT_VISUALIZER_MACROS.soft),
    pulse: clamp01(source?.pulse ?? DEFAULT_VISUALIZER_MACROS.pulse),
    particles: clamp01(source?.particles ?? DEFAULT_VISUALIZER_MACROS.particles),
    glitch: clamp01(source?.glitch ?? DEFAULT_VISUALIZER_MACROS.glitch),
    bright: clamp01(source?.bright ?? DEFAULT_VISUALIZER_MACROS.bright),
  };
}

function sanitizeLayerMacros(source: Partial<VisualizerLayerMacros> | undefined): VisualizerLayerMacros {
  return {
    formation: clamp01(source?.formation ?? DEFAULT_VISUALIZER_LAYER_MACROS.formation),
    weather: clamp01(source?.weather ?? DEFAULT_VISUALIZER_LAYER_MACROS.weather),
    fragmentation: clamp01(source?.fragmentation ?? DEFAULT_VISUALIZER_LAYER_MACROS.fragmentation),
    symmetry: clamp01(source?.symmetry ?? DEFAULT_VISUALIZER_LAYER_MACROS.symmetry),
    material: clamp01(source?.material ?? DEFAULT_VISUALIZER_LAYER_MACROS.material),
    age: clamp01(source?.age ?? DEFAULT_VISUALIZER_LAYER_MACROS.age),
    depth: clamp01(source?.depth ?? DEFAULT_VISUALIZER_LAYER_MACROS.depth),
  };
}

function resolveVisualizerSliderMode(
  key: VisualizerNumericControlKey,
  modes: Record<string, SliderMode>,
  _ranges: VisualizerReactiveRanges,
): SliderMode {
  return modes[key] ?? 'single';
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

type ReactiveVisualizerIntentSnapshot = Omit<ReactiveVisualizerSnapshot, 'activeGrains' | 'pulses'>;

function buildIntentSnapshot(
  state: SliderState,
  sliderModes: Record<string, SliderMode>,
  dualRanges: DualRanges,
  engineState: ProductEngineState,
): ReactiveVisualizerIntentSnapshot {
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
    value('drumEuclid5Level'),
    value('drumEuclid6Level'),
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
      value('driftMix'),
      value('erosionMix'),
      value('endCompMix'),
    )
    : Math.max(value('masterSatDrive'), value('hardness')) * 0.5;

  const modulationRangeEnergy = clamp01(Object.keys(dualRanges).length / 80);
  const transportPulse = engineState.isRunning ? 0.12 : 0;
  return {
    pad: clamp01(padLevel * 0.72 + padTone * 0.32 + padMotion * 0.28 + padMorph * 0.2),
    lead: clamp01(leadLevel * 0.72 + leadMorph * 0.32 + leadRhythm * 0.3),
    drums: clamp01(value('drumLevel') * 0.75 + drumVoiceLevel * 0.3 + drumSeqLevel * 0.3),
    earth: clamp01(earthLevel * 0.5 + earthSources * 0.7),
    granular: clamp01(value('granularLevel') * 0.6 + granularDensities * 0.32 + granularSends * 0.28),
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
    morph: clamp01(Math.max(padMorph, leadMorph)),
    brightness: clamp01(Math.max(
      logNorm(value('filterCutoffMax', 1600), 40, 12000),
      value('presence'),
      value('reverbInputTone', 0) * 0.5 + 0.5,
    )),
  };
}

function buildSnapshotFromIntent(
  intent: ReactiveVisualizerIntentSnapshot,
  activeGrains: number,
  controls: ReactiveVisualizerControls,
  timeMs: number,
): ReactiveVisualizerSnapshot {
  const pulses = getVisualizerPulseSnapshot(timeMs);
  const snapshot: ReactiveVisualizerSnapshot = {
    ...intent,
    pad: resolveLiveVisualizerLevel('pad', intent.pad, timeMs),
    lead: resolveLiveVisualizerLevel('lead', intent.lead, timeMs),
    drums: resolveLiveVisualizerLevel('drums', intent.drums, timeMs),
    earth: resolveLiveVisualizerLevel('earth', intent.earth, timeMs),
    granular: resolveLiveVisualizerLevel('granular', clamp01(intent.granular + activeGrains / 36), timeMs),
    delay: resolveLiveVisualizerLevel('delay', intent.delay, timeMs),
    reverb: resolveLiveVisualizerLevel('reverb', intent.reverb, timeMs),
    dynamics: resolveLiveVisualizerLevel('dynamics', intent.dynamics, timeMs),
    morph: clamp01(Math.max(intent.morph, pulses.sequencer)),
    activeGrains,
    pulses,
  };
  return focusSnapshot(snapshot, controls.focus);
}

function resolveLiveVisualizerLevel(
  key: Parameters<typeof readVisualizerTelemetrySignal>[0],
  fallback: number,
  timeMs: number,
): number {
  const level = readVisualizerTelemetrySignal(key, 'level', timeMs);
  return level === null ? fallback : clamp01(fallback * 0.24 + level * 0.86);
}

function fpsFromControl(value: number): number {
  if (value < 0) return Math.round(36 + value * 12);
  return Math.round(36 + value * 24);
}

const ReactiveVisualizerPageInner: React.FC<ReactiveVisualizerPageInnerProps> = ({
  state,
  sliderModes,
  dualRanges,
  engineState,
  isPlaying,
  getActiveGrains,
  linkedPresetRequest: _linkedPresetRequest,
  onVisualizerPresetChange: _onVisualizerPresetChange,
  mobileReducedVisuals,
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
  const intentSnapshotRef = useRef<ReactiveVisualizerIntentSnapshot>(
    buildIntentSnapshot(state, sliderModes, dualRanges, engineState),
  );
  const intentSnapshotUpdatedAtRef = useRef(0);
  const intentSnapshotDirtyRef = useRef(true);
  const mobileReducedVisualsRef = useRef(mobileReducedVisuals);
  const sizeRef = useRef({ width: 960, height: 640 });
  const renderSizeRef = useRef({ width: 0, height: 0, dpr: 0 });
  const lastFrameRef = useRef(0);
  const lastInteractionRef = useRef(0);
  const wakeRenderRef = useRef<(interaction?: boolean) => void>(() => undefined);
  const coarsePointerRef = useRef(false);
  const vizAutomationStateRef = useRef<Record<string, DualSliderAutomationState>>({});
  const [controls, setControls] = useState<ReactiveVisualizerControls>(DEFAULT_CONTROLS);
  const [seed, setSeed] = useState(createVisualizerSeed);
  const seedRef = useRef(seed);
  const [performanceMacros, setPerformanceMacros] = useState<VisualizerPerformanceMacros>(DEFAULT_VISUALIZER_MACROS);
  const performanceMacrosRef = useRef(performanceMacros);
  const [layerMacros, setLayerMacros] = useState<VisualizerLayerMacros>(DEFAULT_VISUALIZER_LAYER_MACROS);
  const layerMacrosRef = useRef(layerMacros);
  const [qualityMode, setQualityMode] = useState<VisualizerQualityMode>(DEFAULT_QUALITY_MODE);
  const qualityModeRef = useRef(qualityMode);
  const [rendererMode, setRendererMode] = useState<'webgl2' | 'canvas2d'>('webgl2');
  const [frameMode, setFrameMode] = useState<VisualizerFrameMode>('settling');
  const frameModeRef = useRef<VisualizerFrameMode>('settling');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [meterSnapshot, setMeterSnapshot] = useState<ReactiveVisualizerSnapshot>(() => (
    buildSnapshotFromIntent(
      intentSnapshotRef.current,
      getActiveGrains(),
      DEFAULT_CONTROLS,
      0,
    )
  ));
  const [modulatedControlsState, setModulatedControlsState] = useState<ReactiveVisualizerControls>(DEFAULT_CONTROLS);
  const meterUpdateRef = useRef(0);
  const metersOpenRef = useRef(false);
  const { canAnimate } = useAnimationVisibility(canvasWrapRef, { rootMargin: '80px' });

  useEffect(() => {
    setVisualizerSignalDemand(canAnimate);
    return () => setVisualizerSignalDemand(false);
  }, [canAnimate]);

  // --- Reaction / modulation state ---
  const [reaction, setReaction] = useState<VisualizerReactionSettings>(DEFAULT_REACTION);
  const [reactiveRanges, setReactiveRanges] = useState<VisualizerReactiveRanges>(() =>
    createDefaultReactiveRanges(DEFAULT_CONTROLS),
  );
  const reactionRef = useRef(reaction);
  const reactiveRangesRef = useRef(reactiveRanges);
  const [vizSliderModes, setVizSliderModes] = useState<Record<string, SliderMode>>({});
  const vizSliderModesRef = useRef(vizSliderModes);
  reactionRef.current = reaction;
  reactiveRangesRef.current = reactiveRanges;
  vizSliderModesRef.current = vizSliderModes;

  // --- Preset state ---
  const [presetList, setPresetList] = useState<PresetSummary[]>([]);
  const [presetName, setPresetName] = useState('');
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);

  controlsRef.current = controls;
  performanceMacrosRef.current = performanceMacros;
  layerMacrosRef.current = layerMacros;
  seedRef.current = seed;
  qualityModeRef.current = qualityMode;
  stateRef.current = state;
  sliderModesRef.current = sliderModes;
  dualRangesRef.current = dualRanges;
  engineStateRef.current = engineState;
  isPlayingRef.current = isPlaying;
  getActiveGrainsRef.current = getActiveGrains;
  mobileReducedVisualsRef.current = mobileReducedVisuals;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const forceCanvas2d = import.meta.env.DEV && new URLSearchParams(window.location.search)
      .get('visualizerRenderer') === 'canvas2d';
    const renderer = new ReactiveVisualizerRenderer(canvas, { forceCanvas2d });
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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updatePointerMode = () => {
      coarsePointerRef.current = mediaQuery.matches;
    };
    updatePointerMode();
    mediaQuery.addEventListener?.('change', updatePointerMode);
    return () => {
      mediaQuery.removeEventListener?.('change', updatePointerMode);
    };
  }, []);

  useEffect(() => {
    if (!canAnimate) {
      lastFrameRef.current = 0;
      frameModeRef.current = 'parked';
      setFrameMode('parked');
      return undefined;
    }
    let frameId = 0;
    let timerId: number | null = null;
    let scheduled = false;

    const publishFrameMode = (mode: VisualizerFrameMode) => {
      if (frameModeRef.current === mode) return;
      frameModeRef.current = mode;
      setFrameMode(mode);
      if (mode === 'parked') recordVisualizerParkedTransition();
    };

    const scheduleFrame = (delayMs = 0) => {
      if (scheduled) return;
      scheduled = true;
      const requestFrame = () => {
        timerId = null;
        frameId = requestAnimationFrame(loop);
      };
      if (delayMs > 18) {
        timerId = window.setTimeout(requestFrame, Math.max(0, delayMs - 8));
      } else {
        requestFrame();
      }
    };

    const loop = (timeMs: number) => {
      scheduled = false;
      const renderer = rendererRef.current;
      if (renderer) {
        const measurePerformance = visualizerPerformanceInstrumentationEnabled();
        const frameStartedAt = measurePerformance ? performance.now() : 0;
        let intentBuildMs = 0;
        let intentBuilt = false;
        const controlState = resolveVisualizerMacroControls(
          controlsRef.current,
          performanceMacrosRef.current,
          layerMacrosRef.current,
        );
        const quality = resolveCurrentQuality(
          qualityModeRef.current,
          mobileReducedVisualsRef.current,
          coarsePointerRef.current,
        );
        const requestedFps = fpsFromControl(controlState.frameRate);
        const deltaSeconds = lastFrameRef.current > 0
          ? clamp((timeMs - lastFrameRef.current) / 1000, 0, 0.25)
          : 1 / 60;
        lastFrameRef.current = timeMs;
          const { width, height } = sizeRef.current;
          const dpr = quality.maxDpr;
          const intentRefreshIntervalMs = isPlayingRef.current ? 100 : 500;
          if (
            intentSnapshotDirtyRef.current ||
            timeMs - intentSnapshotUpdatedAtRef.current >= intentRefreshIntervalMs
          ) {
            const intentStartedAt = measurePerformance ? performance.now() : 0;
            intentSnapshotRef.current = buildIntentSnapshot(
              stateRef.current,
              sliderModesRef.current,
              dualRangesRef.current,
              engineStateRef.current,
            );
            intentSnapshotUpdatedAtRef.current = timeMs;
            intentSnapshotDirtyRef.current = false;
            intentBuilt = true;
            if (measurePerformance) intentBuildMs = performance.now() - intentStartedAt;
          }
          const snapshot = buildSnapshotFromIntent(
            intentSnapshotRef.current,
            getActiveGrainsRef.current(),
            controlState,
            timeMs,
          );
          const automatedControls: ReactiveVisualizerControls = {
            ...controlState,
            layerOrder: [...controlState.layerOrder],
          };
          const triggerAmount = Math.max(
            snapshot.pulses.global,
            snapshot.pulses.drums,
            snapshot.pulses.lead,
            snapshot.pulses.sequencer,
          );
          const currentSliderModes = vizSliderModesRef.current;
          const currentRanges = reactiveRangesRef.current;
          for (const [key, range] of Object.entries(currentRanges) as Array<[VisualizerNumericControlKey, { min: number; max: number } | undefined]>) {
            const mode = resolveVisualizerSliderMode(key, currentSliderModes, currentRanges);
            if (mode !== 'walk' && mode !== 'sampleHold') continue;
            if (!range) continue;
            const baseValue = controlState[key];
            if (typeof baseValue !== 'number') continue;
            const result = resolveDualSliderAutomation({
              key,
              baseValue,
              minValue: -1,
              maxValue: 1,
              mode,
              lowerBound: range.min,
              upperBound: range.max,
              nowSeconds: timeMs / 1000,
              deltaSeconds,
              triggerAmount,
              seed: seedRef.current,
              state: vizAutomationStateRef.current[key],
              walkMode: stateRef.current.randomWalkMode,
              walkSpeed: stateRef.current.randomWalkSpeed,
              seedWindow: stateRef.current.seedWindow,
            });
            vizAutomationStateRef.current[key] = result.state;
            (automatedControls as Record<VisualizerNumericControlKey, number>)[key] = result.value;
          }
          // Apply modulation: visual buses → mod matrix → modulated controls
          const currentReaction = reactionRef.current;
          const buses = buildVisualBuses(snapshot, currentReaction);
          const modulationStartedAt = measurePerformance ? performance.now() : 0;
          const modulatedControls = applyVisualizerModulation(
            automatedControls,
            reactiveRangesRef.current,
            buses,
            currentReaction,
          );
          const modulationMs = measurePerformance ? performance.now() - modulationStartedAt : 0;
          const lastRenderSize = renderSizeRef.current;
          if (
            Math.abs(lastRenderSize.width - width) > 0.5 ||
            Math.abs(lastRenderSize.height - height) > 0.5 ||
            Math.abs(lastRenderSize.dpr - dpr) > 0.001
          ) {
            renderer.resize(width, height, dpr);
            renderSizeRef.current = { width, height, dpr };
          }
          renderer.render({
            timeMs,
            width,
            height,
            dpr,
            snapshot,
            controls: modulatedControls,
            seed: seedRef.current,
            quality,
          });
          const meterUpdateIntervalMs = mobileReducedVisualsRef.current ? 400 : 250;
          let uiPublished = false;
          const modulationIndicatorDemand = Object.values(vizSliderModesRef.current)
            .some((mode) => mode === 'walk' || mode === 'sampleHold');
          if (
            (metersOpenRef.current || modulationIndicatorDemand) &&
            timeMs - meterUpdateRef.current >= meterUpdateIntervalMs
          ) {
            meterUpdateRef.current = timeMs;
            if (metersOpenRef.current) setMeterSnapshot(snapshot);
            if (modulationIndicatorDemand) setModulatedControlsState(modulatedControls);
            uiPublished = true;
          }
          const pulses = snapshot.pulses;
          const pulseActivity = Math.max(
            pulses.global,
            pulses.synth,
            pulses.pad,
            pulses.lead,
            pulses.drums,
            pulses.earth,
            pulses.granular,
            pulses.delay,
            pulses.reverb,
            pulses.dynamics,
            pulses.sequencer,
          );
          const hasAutomation = Object.values(vizSliderModesRef.current)
            .some((mode) => mode === 'walk' || mode === 'sampleHold');
          const plan = resolveVisualizerFramePlan({
            canAnimate: true,
            isPlaying: isPlayingRef.current,
            hasAutomation,
            pulseActivity,
            millisecondsSinceInteraction: Math.max(0, timeMs - lastInteractionRef.current),
            requestedFps,
            qualityTargetFps: quality.targetFps,
          });
          publishFrameMode(plan.mode);
          if (measurePerformance) {
            recordVisualizerFramePerformance(
              performance.now() - frameStartedAt,
              intentBuildMs,
              modulationMs,
              intentBuilt,
              uiPublished,
            );
          }
          if (plan.delayMs !== null) scheduleFrame(plan.delayMs);
      }
    };

    wakeRenderRef.current = (interaction = false) => {
      if (interaction) lastInteractionRef.current = performance.now();
      scheduleFrame(0);
    };
    const unsubscribeSignals = subscribeVisualizerSignals(() => wakeRenderRef.current(false));
    lastInteractionRef.current = performance.now();
    scheduleFrame(0);
    return () => {
      unsubscribeSignals();
      wakeRenderRef.current = () => undefined;
      if (timerId !== null) window.clearTimeout(timerId);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [canAnimate]);

  useEffect(() => {
    intentSnapshotDirtyRef.current = true;
    wakeRenderRef.current(false);
  }, [dualRanges, engineState, isPlaying, mobileReducedVisuals, sliderModes, state]);

  useEffect(() => {
    wakeRenderRef.current(true);
  }, [controls, layerMacros, performanceMacros, qualityMode, reaction, reactiveRanges, seed, vizSliderModes]);

  const updateControl = useCallback((key: NumericControlKey, value: number) => {
    const nextControlsForRange = {
      ...controlsRef.current,
      [key]: value,
    };
    const nextRange = createDefaultReactiveRanges(nextControlsForRange)[key as VisualizerNumericControlKey];
    setControls((prev) => ({
      ...prev,
      [key]: value,
    }));
    if (nextRange) {
      setReactiveRanges((prev) => ({
        ...prev,
        [key]: nextRange,
      }));
    }
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
    setPerformanceMacros(DEFAULT_VISUALIZER_MACROS);
    setLayerMacros(DEFAULT_VISUALIZER_LAYER_MACROS);
    setQualityMode(DEFAULT_QUALITY_MODE);
    setVizSliderModes({});
    vizAutomationStateRef.current = {};
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
      performanceMacros,
      layerMacros,
      qualityMode,
      seed,
    };
    await saveVisualizerPreset(name, data);
    setActivePresetName(name);
    _onVisualizerPresetChange(name);
    refreshPresets();
    setPresetSaving(false);
  }, [presetName, controls, reactiveRanges, reaction, performanceMacros, layerMacros, qualityMode, seed, refreshPresets, _onVisualizerPresetChange]);

  const handleLoadPreset = useCallback(async (name: string) => {
    const result = await loadVisualizerPreset(name);
    if (!result) return;
    const { data } = result;
    const nextControls = sanitizeVisualizerControls(data.controls);
    setControls(nextControls);
    setReactiveRanges({
      ...createDefaultReactiveRanges(nextControls),
      ...(data.reactiveRanges ?? {}),
    });
    setReaction(data.reaction ?? DEFAULT_REACTION);
    setPerformanceMacros(sanitizePerformanceMacros(data.performanceMacros));
    setLayerMacros(sanitizeLayerMacros(data.layerMacros));
    setQualityMode(isVisualizerQualityMode(data.qualityMode) ? data.qualityMode : DEFAULT_QUALITY_MODE);
    setSeed(Number.isFinite(data.seed) ? data.seed : createVisualizerSeed());
    setVizSliderModes({});
    vizAutomationStateRef.current = {};
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
  metersOpenRef.current = metersOpen;
  const displayedRequestedFps = isPlaying
    ? fpsFromControl(controls.frameRate)
    : Math.min(24, fpsFromControl(controls.frameRate));
  const displayedQuality = resolveCurrentQuality(qualityMode, mobileReducedVisuals, coarsePointerRef.current);
  const displayedFps = clamp(displayedRequestedFps, 12, displayedQuality.targetFps);

  // Per-slider mode: single (value line) / walk (range band + indicator) / sampleHold
  const cycleVizMode = useCallback((key: string) => {
    setVizSliderModes((prev) => {
      const current = prev[key] ?? 'single';
      const next: SliderMode = current === 'single' ? 'walk' : current === 'walk' ? 'sampleHold' : 'single';
      return { ...prev, [key]: next };
    });
  }, []);

  useEffect(() => {
    const activeKeys = new Set<string>(
      (Object.keys(reactiveRanges) as VisualizerNumericControlKey[])
        .filter((key) => {
          const mode = resolveVisualizerSliderMode(key, vizSliderModes, reactiveRanges);
          return mode === 'walk' || mode === 'sampleHold';
        }),
    );
    for (const key of Object.keys(vizAutomationStateRef.current)) {
      if (!activeKeys.has(key)) {
        delete vizAutomationStateRef.current[key];
      }
    }
  }, [reactiveRanges, vizSliderModes]);

  const layerStack = useMemo(() => layerOrderToStack(controls.layerOrder), [controls.layerOrder]);

  const moveVisualizerLayer = useCallback((layer: VisualizerLayerId, direction: -1 | 1) => {
    setControls((prev) => {
      const stack = layerOrderToStack(prev.layerOrder);
      const nextStack = moveLayerInStack(stack, layer, direction);
      return updateControlsPatch(prev, { layerOrder: stackToLayerOrder(nextStack) });
    });
    setActivePresetName(null);
  }, []);

  const resetLayerStack = useCallback(() => {
    setControls((prev) => updateControlsPatch(prev, { layerOrder: stackToLayerOrder(DEFAULT_LAYER_STACK) }));
    setActivePresetName(null);
  }, []);

  const updatePerformanceMacro = useCallback((macroKey: VisualizerPerformanceMacroId, value: number) => {
    setPerformanceMacros((prev) => sanitizePerformanceMacros({ ...prev, [macroKey]: value }));
    setActivePresetName(null);
  }, []);

  const updateLayerMacro = useCallback((macroKey: VisualizerLayerMacroId, value: number) => {
    setLayerMacros((prev) => sanitizeLayerMacros({ ...prev, [macroKey]: value }));
    setActivePresetName(null);
  }, []);

  const formatBipolar = useCallback((percent: number) => {
    const val = ((percent / 100) * 2 - 1);
    if (Math.abs(val) < 0.01) return '0';
    return val > 0 ? `+${Math.round(val * 100)}` : `${Math.round(val * 100)}`;
  }, []);

  return (
    <div
      ref={rootRef}
      className={`visualizer-root${fullscreenFallback ? ' visualizer-root--fullscreen-fallback' : ''}`}
      data-frame-mode={frameMode}
    >
      <VisualizerCanvasSurface
        canvasRef={canvasRef}
        wrapRef={canvasWrapRef}
        rendererMode={rendererMode}
        isPlaying={isPlaying}
        frameMode={frameMode}
        displayedFps={displayedFps}
        seedLabel={formatSeed(seed)}
      />

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

        <section className="visualizer-quality-panel" aria-label="Visualizer quality mode">
          <div className="visualizer-panel-header">
            <h3>Visual Quality</h3>
            <span>{QUALITY_MODE_LABELS[displayedQuality.effectiveMode]}</span>
          </div>
          <div className="visualizer-quality-options">
            {(['auto', 'mobileSafe', 'desktopBeauty'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={qualityMode === mode ? 'is-active' : undefined}
                onClick={() => {
                  setQualityMode(mode);
                  setActivePresetName(null);
                }}
              >
                {QUALITY_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </section>

        <VisualizerMacroPanels
          sceneMacros={performanceMacros}
          layerMacros={layerMacros}
          onSceneMacroChange={updatePerformanceMacro}
          onLayerMacroChange={updateLayerMacro}
        />

        <section className="visualizer-layer-panel" aria-label="Visualizer effect scope and order">
          <div className="visualizer-layer-panel-header">
            <h3>Effect Scope &amp; Order</h3>
            <button type="button" onClick={resetLayerStack} title="Reset layer order">
              Reset
            </button>
          </div>
          <p className="visualizer-layer-help">Effects process only source layers placed below them.</p>
          <ol className="visualizer-layer-list">
            {layerStack.map((layerId, index) => {
              const def = VISUALIZER_LAYER_DEFS.find((entry) => entry.id === layerId);
              if (!def) return null;
              const isBottom = index === 0;
              const isTop = index === layerStack.length - 1;
              return (
                <li className={`visualizer-layer-chip visualizer-layer-chip--${def.kind}`} key={layerId} title={def.description}>
                  <div className="visualizer-layer-meta">
                    <span className="visualizer-layer-position">{index + 1}</span>
                    <div>
                      <strong>{def.label}</strong>
                      <small>{def.kind === 'source' ? 'Source' : 'Effect'}</small>
                    </div>
                  </div>
                  <div className="visualizer-layer-actions">
                    <button
                      type="button"
                      disabled={isBottom}
                      onClick={() => moveVisualizerLayer(layerId, -1)}
                      title={`Move ${def.label} lower`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={isTop}
                      onClick={() => moveVisualizerLayer(layerId, 1)}
                      title={`Move ${def.label} higher`}
                    >
                      ↑
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

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
                const sliderMode = resolveVisualizerSliderMode(
                  def.key as VisualizerNumericControlKey,
                  vizSliderModes,
                  reactiveRanges,
                );
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
                        formatVisualizerControlValue(def.key, numericValue, def.left, def.right)
                      }
                      onValueChange={(nextPercent) => {
                        const bipolar = (nextPercent / 50) - 1;
                        updateControl(def.key, clamp(bipolar, -1, 1));
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

function ReactiveVisualizerPage({
  enabled = true,
  mobileReducedVisuals = false,
  ...props
}: ReactiveVisualizerPageProps) {
  if (!enabled) {
    return null;
  }

  return (
    <ReactiveVisualizerPageInner
      {...props}
      mobileReducedVisuals={mobileReducedVisuals}
    />
  );
}

export default ReactiveVisualizerPage;
