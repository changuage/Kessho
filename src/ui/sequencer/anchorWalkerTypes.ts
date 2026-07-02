import { normalizeSequencerProductSourceId } from './productSourceIds';

export type AnchorWalkerMode = 'hybrid' | 'compactPad';
export type AnchorSource = 'harmonyRoot' | 'manualLatch';
export type SnapSource = 'harmonyEngine' | 'manualVoicing' | 'chordStep' | 'customPitchClasses' | 'liveBlueKeys';
export type AnchorWalkerSnapSource = 'harmonyEngine' | 'customPitchClasses';
export type WalkFeel = 'straight' | 'dotted' | 'triplet';
export type WalkRate = 'off' | '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32';
export type WalkerPlayMode = 'hybridPlay' | 'gridPattern';
export type WalkerTriggerMode = 'gestureHold' | 'stepGrid' | 'autoClock';
export type WalkerBoundaryMode = 'fold' | 'wrap' | 'clamp';
export type WalkerVisualizerRange = 'oneOctave' | 'twoOctaves';
export type WalkerLayerTuning = 'rawTranspose' | 'snapAfterTranspose' | 'diatonicOffset';
export type WalkerLayerMotion = 'linked' | 'inverted';
export type AnchorWalkerBoundaryEvent =
  | 'none'
  | 'foldTop'
  | 'foldBottom'
  | 'wrapTop'
  | 'wrapBottom'
  | 'clampTop'
  | 'clampBottom';
export type AnchorWalkerPerformanceAction =
  | 'gestureTap'
  | 'gestureDown'
  | 'gestureUp'
  | 'resetCursor'
  | 'setManualAnchor';

export interface AnchorWalkerPerformanceEvent {
  action: AnchorWalkerPerformanceAction;
  delta?: number;
  velocity?: number;
  midi?: number;
}

export interface AnchorWalkerLayerConfig {
  id: string;
  enabled: boolean;
  label: string;
  transposeSemitones: number;
  diatonicOffset: number;
  tuning: WalkerLayerTuning;
  motion: WalkerLayerMotion;
  delayMs: number;
  gateRatio: number;
  velocityScale: number;
  velocityOffset: number;
  targetSourceId: 'follow' | number;
}

export interface AnchorWalkerConfig {
  enabled: boolean;
  mode: AnchorWalkerMode;
  playMode: WalkerPlayMode;
  targetSourceId: number;
  anchorSource: AnchorSource;
  manualAnchorMidi: number;
  snapSource: AnchorWalkerSnapSource;
  customPitchClasses: number[];
  triggerMode: WalkerTriggerMode;
  boundaryMode: WalkerBoundaryMode;
  keyboardRange: WalkerVisualizerRange;
  showLinkedOutputs: boolean;
  autoRate: WalkRate;
  autoFeel: WalkFeel;
  swing: number;
  leadMode: boolean;
  mwToVelocity: boolean;
  pitchWheelWalk: boolean;
  gesturePattern: number[];
  gesturePatternLength: number;
  activePadDelta: number;
  layerPreset: string;
  layerTuning: WalkerLayerTuning;
  spreadMs: number;
  layers: AnchorWalkerLayerConfig[];
  outputRangeMin: number;
  outputRangeMax: number;
  seed: number;
}

export interface AnchorWalkerRuntimeViewState {
  anchorMidi: number | null;
  cursorMidi: number | null;
  previousCursorMidi: number | null;
  cursorDegree: number;
  activeSnapPitchClasses: number[];
  layerOutputMidis: number[];
  linkedOutputMidis?: Array<{ slotIndex: number; midi: number; velocity: number }>;
  lastGestureDelta: number;
  direction: 'up' | 'down' | 'none';
  isGestureHeld: boolean;
  isWalking: boolean;
  boundaryEvent: AnchorWalkerBoundaryEvent;
}

export interface AnchorWalkerLayerPreset {
  id: string;
  label: string;
  spreadMs: number;
  layers: AnchorWalkerLayerConfig[];
}

const WALKER_LAYER_COUNT = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeProductSourceId(value: unknown, fallback: number): number {
  return normalizeSequencerProductSourceId(value, fallback);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function createWalkerLayer(
  index: number,
  patch: Partial<AnchorWalkerLayerConfig> = {},
): AnchorWalkerLayerConfig {
  const label = patch.label ?? `L${index + 1}`;
  return {
    id: patch.id ?? `walker-layer-${index + 1}`,
    enabled: patch.enabled ?? index === 0,
    label,
    transposeSemitones: Math.round(finiteNumber(patch.transposeSemitones, 0)),
    diatonicOffset: Math.round(finiteNumber(patch.diatonicOffset, 0)),
    tuning: patch.tuning ?? 'diatonicOffset',
    motion: patch.motion ?? 'linked',
    delayMs: clamp(finiteNumber(patch.delayMs, 0), 0, 500),
    gateRatio: clamp(finiteNumber(patch.gateRatio, 0.75), 0.05, 1),
    velocityScale: clamp(finiteNumber(patch.velocityScale, 1), 0, 2),
    velocityOffset: clamp(finiteNumber(patch.velocityOffset, 0), -1, 1),
    targetSourceId: patch.targetSourceId ?? 'follow',
  };
}

export const ANCHOR_WALKER_LAYER_PRESETS: readonly AnchorWalkerLayerPreset[] = [
  {
    id: 'solo',
    label: 'Solo',
    spreadMs: 0,
    layers: [createWalkerLayer(0, { enabled: true, label: 'root', diatonicOffset: 0 })],
  },
  {
    id: 'openFifths',
    label: 'Open Fifths',
    spreadMs: 0,
    layers: [
      createWalkerLayer(0, { enabled: true, label: 'root', transposeSemitones: 0, tuning: 'rawTranspose' }),
      createWalkerLayer(1, { enabled: true, label: 'fifth', transposeSemitones: 7, tuning: 'rawTranspose' }),
    ],
  },
  {
    id: 'triadRoll',
    label: 'Triad Roll',
    spreadMs: 35,
    layers: [
      createWalkerLayer(0, { enabled: true, label: 'root', diatonicOffset: 0, delayMs: 0 }),
      createWalkerLayer(1, { enabled: true, label: 'third', diatonicOffset: 2, delayMs: 35, velocityScale: 0.9 }),
      createWalkerLayer(2, { enabled: true, label: 'fifth', diatonicOffset: 4, delayMs: 70, velocityScale: 0.82 }),
    ],
  },
  {
    id: 'seventhCloud',
    label: 'Seventh Cloud',
    spreadMs: 35,
    layers: [
      createWalkerLayer(0, { enabled: true, label: 'root', diatonicOffset: 0, delayMs: 0 }),
      createWalkerLayer(1, { enabled: true, label: 'third', diatonicOffset: 2, delayMs: 30, velocityScale: 0.9 }),
      createWalkerLayer(2, { enabled: true, label: 'fifth', diatonicOffset: 4, delayMs: 65, velocityScale: 0.82 }),
      createWalkerLayer(3, { enabled: true, label: 'seventh', diatonicOffset: 6, delayMs: 105, velocityScale: 0.75 }),
    ],
  },
  {
    id: 'wideFour',
    label: 'Wide Four Instance',
    spreadMs: 0,
    layers: [
      createWalkerLayer(0, { enabled: true, label: '+0', transposeSemitones: 0, tuning: 'rawTranspose' }),
      createWalkerLayer(1, { enabled: true, label: '+7', transposeSemitones: 7, tuning: 'rawTranspose' }),
      createWalkerLayer(2, { enabled: true, label: '+15', transposeSemitones: 15, tuning: 'rawTranspose' }),
      createWalkerLayer(3, { enabled: true, label: '+19', transposeSemitones: 19, tuning: 'rawTranspose' }),
    ],
  },
  {
    id: 'wideFourRoll',
    label: 'Wide Four Roll',
    spreadMs: 35,
    layers: [
      createWalkerLayer(0, { enabled: true, label: '+0', transposeSemitones: 0, tuning: 'rawTranspose', delayMs: 0 }),
      createWalkerLayer(1, { enabled: true, label: '+7', transposeSemitones: 7, tuning: 'rawTranspose', delayMs: 30 }),
      createWalkerLayer(2, { enabled: true, label: '+15', transposeSemitones: 15, tuning: 'rawTranspose', delayMs: 65 }),
      createWalkerLayer(3, { enabled: true, label: '+19', transposeSemitones: 19, tuning: 'rawTranspose', delayMs: 100 }),
    ],
  },
  {
    id: 'counterWalker',
    label: 'Counter Walker',
    spreadMs: 0,
    layers: [
      createWalkerLayer(0, { enabled: true, label: 'linked', transposeSemitones: 0, tuning: 'rawTranspose', motion: 'linked' }),
      createWalkerLayer(1, { enabled: true, label: 'invert', transposeSemitones: 12, tuning: 'rawTranspose', motion: 'inverted' }),
    ],
  },
] as const;

export function applyAnchorWalkerLayerPreset(config: AnchorWalkerConfig, presetId: string): AnchorWalkerConfig {
  const preset = ANCHOR_WALKER_LAYER_PRESETS.find((item) => item.id === presetId)
    ?? ANCHOR_WALKER_LAYER_PRESETS[0];
  if (!preset) return config;
  const layers = Array.from({ length: WALKER_LAYER_COUNT }, (_, index) => (
    preset.layers[index]
      ? createWalkerLayer(index, {
          ...preset.layers[index],
          delayMs: index * preset.spreadMs,
        })
      : createWalkerLayer(index, { enabled: false, delayMs: index * preset.spreadMs })
  ));
  return {
    ...config,
    layerPreset: preset.id,
    spreadMs: preset.spreadMs,
    layerTuning: layers.find((layer) => layer.enabled)?.tuning ?? config.layerTuning,
    layers,
  };
}

export function createDefaultAnchorWalkerConfig(slotIndex = 0): AnchorWalkerConfig {
  return applyAnchorWalkerLayerPreset({
    enabled: true,
    mode: 'hybrid',
    playMode: 'hybridPlay',
    targetSourceId: 3,
    anchorSource: 'harmonyRoot',
    manualAnchorMidi: 60 + slotIndex * 2,
    snapSource: 'harmonyEngine',
    customPitchClasses: [0, 2, 4, 5, 7, 9, 11],
    triggerMode: 'gestureHold',
    boundaryMode: 'fold',
    keyboardRange: 'oneOctave',
    showLinkedOutputs: false,
    autoRate: 'off',
    autoFeel: 'straight',
    swing: 0,
    leadMode: false,
    mwToVelocity: false,
    pitchWheelWalk: false,
    gesturePattern: [1, -1, 2, -1],
    gesturePatternLength: 4,
    activePadDelta: 0,
    layerPreset: 'solo',
    layerTuning: 'diatonicOffset',
    spreadMs: 0,
    layers: [],
    outputRangeMin: 36,
    outputRangeMax: 96,
    seed: 1001 + slotIndex,
  }, 'solo');
}

function normalizePitchClasses(value: unknown, fallback: readonly number[]): number[] {
  const input = Array.isArray(value) ? value : fallback;
  const result: number[] = [];
  for (const item of input) {
    const pitchClass = ((Math.round(finiteNumber(item, -1)) % 12) + 12) % 12;
    if (pitchClass >= 0 && !result.includes(pitchClass)) result.push(pitchClass);
  }
  return result.length > 0 ? result.sort((a, b) => a - b) : [...fallback];
}

function normalizeGesturePattern(value: unknown, fallback: readonly number[]): number[] {
  const input = Array.isArray(value) ? value : fallback;
  const result: number[] = [];
  for (const item of input) {
    const delta = Math.round(finiteNumber(item, 0));
    if (delta !== 0) result.push(clamp(delta, -7, 7));
    if (result.length >= 16) break;
  }
  return result.length > 0 ? result : [...fallback];
}

function normalizeLayer(value: unknown, index: number, fallback: AnchorWalkerLayerConfig): AnchorWalkerLayerConfig {
  const record = typeof value === 'object' && value !== null ? value as Partial<AnchorWalkerLayerConfig> : {};
  return createWalkerLayer(index, {
    ...fallback,
    ...record,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    tuning: enumValue(record.tuning, ['rawTranspose', 'snapAfterTranspose', 'diatonicOffset'] as const, fallback.tuning),
    motion: enumValue(record.motion, ['linked', 'inverted'] as const, fallback.motion),
    targetSourceId: record.targetSourceId === 'follow'
      ? 'follow'
      : normalizeProductSourceId(record.targetSourceId, fallback.targetSourceId === 'follow' ? 3 : fallback.targetSourceId),
  });
}

export function normalizeAnchorWalkerConfig(value: unknown, slotIndex = 0): AnchorWalkerConfig {
  const fallback = createDefaultAnchorWalkerConfig(slotIndex);
  const record = typeof value === 'object' && value !== null ? value as Partial<AnchorWalkerConfig> : {};
  const rangeMin = clamp(finiteNumber(record.outputRangeMin, fallback.outputRangeMin), 0, 127);
  const rangeMax = clamp(finiteNumber(record.outputRangeMax, fallback.outputRangeMax), rangeMin, 127);
  const rawLayers = Array.isArray(record.layers) ? record.layers : fallback.layers;
  const playMode = enumValue(record.playMode, ['hybridPlay', 'gridPattern'] as const, fallback.playMode);
  return {
    ...fallback,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    mode: enumValue(record.mode, ['hybrid', 'compactPad'] as const, fallback.mode),
    playMode,
    targetSourceId: normalizeProductSourceId(record.targetSourceId, fallback.targetSourceId),
    anchorSource: enumValue(record.anchorSource, ['harmonyRoot', 'manualLatch'] as const, fallback.anchorSource),
    manualAnchorMidi: clamp(finiteNumber(record.manualAnchorMidi, fallback.manualAnchorMidi), 0, 127),
    snapSource: enumValue(record.snapSource, ['harmonyEngine', 'customPitchClasses'] as const, fallback.snapSource),
    customPitchClasses: normalizePitchClasses(record.customPitchClasses, fallback.customPitchClasses),
    triggerMode: playMode === 'gridPattern' ? 'stepGrid' : 'gestureHold',
    boundaryMode: enumValue(record.boundaryMode, ['fold', 'wrap', 'clamp'] as const, fallback.boundaryMode),
    keyboardRange: 'oneOctave',
    showLinkedOutputs: false,
    autoRate: 'off',
    autoFeel: 'straight',
    swing: 0,
    leadMode: false,
    mwToVelocity: false,
    pitchWheelWalk: false,
    gesturePattern: normalizeGesturePattern(record.gesturePattern, fallback.gesturePattern),
    gesturePatternLength: clamp(Math.round(finiteNumber(record.gesturePatternLength, fallback.gesturePatternLength)), 1, 16),
    activePadDelta: clamp(Math.round(finiteNumber(record.activePadDelta, fallback.activePadDelta)), -7, 7),
    layerPreset: typeof record.layerPreset === 'string' ? record.layerPreset : fallback.layerPreset,
    layerTuning: enumValue(record.layerTuning, ['rawTranspose', 'snapAfterTranspose', 'diatonicOffset'] as const, fallback.layerTuning),
    spreadMs: clamp(finiteNumber(record.spreadMs, fallback.spreadMs), 0, 500),
    layers: Array.from({ length: WALKER_LAYER_COUNT }, (_, index) => normalizeLayer(rawLayers[index], index, fallback.layers[index] ?? createWalkerLayer(index))),
    outputRangeMin: rangeMin,
    outputRangeMax: rangeMax,
    seed: Math.max(1, Math.round(finiteNumber(record.seed, fallback.seed))),
  };
}
