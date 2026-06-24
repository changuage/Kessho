import {
  HARMONY_POOL_MAX_NOTES,
  HARMONY_SLOT_COUNT,
  resolveHarmonyIntentToNotePool,
  resolveProductHarmonyState,
  type HarmonyChordSlot,
} from './CoreProductHarmonyControl';
import { productHarmonyScaleIdFromName } from './coreProductHarmonyScaleIds';
import { coreProductSequencerBeatDurationSeconds } from './coreProductChordSequencerClock';
import type { HarmonyState } from './harmony';

export const SYNTH_CHORD_SEQUENCER_STEP_COUNT = 8 as const;

export type SynthChordSequencerPlaybackMode = 'chord' | 'arp' | 'strum';
export type SynthChordSequencerArpHoldMode = 'step' | 'untilNextTrigger';
export type SynthChordSequencerArpOrder = 'up' | 'down' | 'upDown' | 'downUp' | 'outsideIn' | 'insideOut' | 'random';
export type SynthChordSequencerArpSpeed = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32';
export type SynthChordSequencerArpShape = 'up' | 'down' | 'upDown' | 'skip' | 'octave' | 'custom';
export type SynthChordSequencerArpPatternLength = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SynthChordSequencerArpOctave = -1 | 0 | 1;
export type SynthChordSequencerStrumDirection = 'up' | 'down' | 'upDown' | 'downUp' | 'random';
export type SynthChordSequencerSlotId = number | null;
export type SynthChordSequencerSubLaneName = 'chord' | 'pitch' | 'expression' | 'morph' | 'distance' | 'nudge';
export type SynthChordSequencerSubLaneDirection = 'forward' | 'reverse' | 'pingpong';

export interface SynthChordSequencerStep {
  id: number;
  enabled: boolean;
  slotId: SynthChordSequencerSlotId;
  probability: number;
  holdSteps: number;
}

export interface SynthChordSequencerArpPatternStep {
  active: boolean;
  tone: number;
  octave: SynthChordSequencerArpOctave;
}

export interface SynthChordSequencerArpConfig {
  order: SynthChordSequencerArpOrder;
  hold: SynthChordSequencerArpHoldMode;
  speed: SynthChordSequencerArpSpeed;
  gate: number;
  shape: SynthChordSequencerArpShape;
  patternLength: SynthChordSequencerArpPatternLength;
  pattern: SynthChordSequencerArpPatternStep[];
}

export interface SynthChordSequencerStrumConfig {
  direction: SynthChordSequencerStrumDirection;
  spreadMs: number;
  curve: number;
  gate: number;
  velocityFalloff: number;
}

export interface SynthChordSequencerSubLaneConfig {
  enabled: boolean;
  steps: number;
  direction: SynthChordSequencerSubLaneDirection;
  values: number[];
}

export interface SynthChordSequencerConfig {
  stepCount: number;
  steps: SynthChordSequencerStep[];
  playbackMode: SynthChordSequencerPlaybackMode;
  arp: SynthChordSequencerArpConfig;
  strum: SynthChordSequencerStrumConfig;
  subLanes: Record<SynthChordSequencerSubLaneName, SynthChordSequencerSubLaneConfig>;
}

const PLAYBACK_MODES: readonly SynthChordSequencerPlaybackMode[] = ['chord', 'arp', 'strum'];
const ARP_HOLD_MODES: readonly SynthChordSequencerArpHoldMode[] = ['step', 'untilNextTrigger'];
const ARP_ORDERS: readonly SynthChordSequencerArpOrder[] = ['up', 'down', 'upDown', 'downUp', 'outsideIn', 'insideOut', 'random'];
const ARP_SHAPES: readonly SynthChordSequencerArpShape[] = ['up', 'down', 'upDown', 'skip', 'octave', 'custom'];
const ARP_PATTERN_LENGTHS: readonly SynthChordSequencerArpPatternLength[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const SYNTH_CHORD_ARP_SPEEDS: readonly SynthChordSequencerArpSpeed[] = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'];
const STRUM_DIRECTIONS: readonly SynthChordSequencerStrumDirection[] = ['up', 'down', 'upDown', 'downUp', 'random'];
export const SYNTH_CHORD_SUB_LANE_NAMES: readonly SynthChordSequencerSubLaneName[] = ['chord', 'expression', 'morph', 'distance', 'nudge'];
const SUB_LANE_DIRECTIONS: readonly SynthChordSequencerSubLaneDirection[] = ['forward', 'reverse', 'pingpong'];

const SUB_LANE_DEFAULT_VALUE: Record<SynthChordSequencerSubLaneName, number> = {
  chord: 1,
  pitch: 0,
  expression: 1,
  morph: 0.5,
  distance: 0.5,
  nudge: 0,
};

const SUB_LANE_RANGE: Record<SynthChordSequencerSubLaneName, { min: number; max: number }> = {
  chord: { min: 1, max: HARMONY_SLOT_COUNT },
  pitch: { min: -48, max: 48 },
  expression: { min: 0, max: 1 },
  morph: { min: 0, max: 1 },
  distance: { min: 0, max: 1 },
  nudge: { min: -1, max: 1 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteInteger(value: unknown, fallback: number): number {
  return Math.round(finiteNumber(value, fallback));
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

const DEFAULT_SYNTH_CHORD_ARP_PATTERN: SynthChordSequencerArpPatternStep[] = [
  { active: true, tone: 1, octave: 0 },
  { active: true, tone: 3, octave: 0 },
  { active: true, tone: 2, octave: 0 },
  { active: true, tone: 4, octave: 1 },
  { active: false, tone: 1, octave: 0 },
  { active: true, tone: 2, octave: 0 },
  { active: true, tone: 1, octave: 1 },
  { active: true, tone: 3, octave: -1 },
  { active: true, tone: 1, octave: 0 },
  { active: true, tone: 3, octave: 0 },
  { active: true, tone: 2, octave: 0 },
  { active: true, tone: 4, octave: 1 },
  { active: false, tone: 1, octave: 0 },
  { active: true, tone: 2, octave: 0 },
  { active: true, tone: 1, octave: 1 },
  { active: true, tone: 3, octave: -1 },
];

function sanitizeArpPatternStep(value: unknown, fallback: SynthChordSequencerArpPatternStep): SynthChordSequencerArpPatternStep {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    active: boolValue(record.active, fallback.active),
    tone: clamp(finiteInteger(record.tone, fallback.tone), 1, 8),
    octave: clamp(finiteInteger(record.octave, fallback.octave), -1, 1) as SynthChordSequencerArpOctave,
  };
}

export function synthChordArpPatternForShape(
  shape: SynthChordSequencerArpShape,
  length: SynthChordSequencerArpPatternLength,
): SynthChordSequencerArpPatternStep[] {
  const tone = (n: number, octave = 0, active = true): SynthChordSequencerArpPatternStep => ({
    active,
    tone: clamp(Math.round(n), 1, 8),
    octave: clamp(Math.round(octave), -1, 1) as SynthChordSequencerArpOctave,
  });
  const safeLength = clamp(Math.round(length), 1, 8);
  const seed = Array.from({ length: safeLength }, (_, index) => {
    const position = index + 1;
    if (shape === 'down') return tone(safeLength - index);
    if (shape === 'upDown') {
      const upCount = Math.ceil(safeLength / 2);
      const downStart = safeLength % 2 === 0 ? upCount : upCount - 1;
      return index < upCount
        ? tone(position)
        : tone(Math.max(1, downStart - (index - upCount)));
    }
    if (shape === 'skip') {
      const oddCount = Math.ceil(safeLength / 2);
      const oddTone = index < oddCount ? index * 2 + 1 : (index - oddCount + 1) * 2;
      return tone(clamp(oddTone, 1, safeLength));
    }
    if (shape === 'octave') {
      const baseTone = Math.floor(index / 2) + 1;
      return tone(Math.min(safeLength, baseTone), index % 2 === 1 ? 1 : 0);
    }
    return tone(position);
  });
  return Array.from({ length: 16 }, (_, index) => {
    const source = seed[index % safeLength] ?? tone(1);
    return { ...source };
  });
}

function sanitizeSlotId(value: unknown): SynthChordSequencerSlotId {
  if (value === null || value === undefined || value === -1) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clamp(Math.round(value), 0, HARMONY_SLOT_COUNT - 1);
}

export function defaultSynthChordSequencerStep(id: number): SynthChordSequencerStep {
  const safeId = clamp(Math.round(id), 0, SYNTH_CHORD_SEQUENCER_STEP_COUNT - 1);
  return {
    id: safeId,
    enabled: true,
    slotId: null,
    probability: 1,
    holdSteps: 1,
  };
}

export function defaultSynthChordSequencerSubLane(lane: SynthChordSequencerSubLaneName): SynthChordSequencerSubLaneConfig {
  return {
    enabled: lane === 'chord',
    steps: lane === 'chord' ? SYNTH_CHORD_SEQUENCER_STEP_COUNT : lane === 'pitch' ? 5 : 4,
    direction: 'forward',
    values: Array.from(
      { length: SYNTH_CHORD_SEQUENCER_STEP_COUNT },
      (_, index) => lane === 'chord' ? (index % HARMONY_SLOT_COUNT) + 1 : SUB_LANE_DEFAULT_VALUE[lane],
    ),
  };
}

export function defaultSynthChordSequencerConfig(): SynthChordSequencerConfig {
  return {
    stepCount: SYNTH_CHORD_SEQUENCER_STEP_COUNT,
    steps: Array.from({ length: SYNTH_CHORD_SEQUENCER_STEP_COUNT }, (_, id) => defaultSynthChordSequencerStep(id)),
    playbackMode: 'chord',
    arp: {
      order: 'upDown',
      hold: 'step',
      speed: '1/8',
      gate: 0.62,
      shape: 'custom',
      patternLength: 8,
      pattern: DEFAULT_SYNTH_CHORD_ARP_PATTERN.map((step) => ({ ...step })),
    },
    strum: {
      direction: 'up',
      spreadMs: 90,
      curve: 0.35,
      gate: 0.86,
      velocityFalloff: 0.08,
    },
    subLanes: {
      chord: defaultSynthChordSequencerSubLane('chord'),
      pitch: defaultSynthChordSequencerSubLane('pitch'),
      expression: defaultSynthChordSequencerSubLane('expression'),
      morph: defaultSynthChordSequencerSubLane('morph'),
      distance: defaultSynthChordSequencerSubLane('distance'),
      nudge: defaultSynthChordSequencerSubLane('nudge'),
    },
  };
}

function sanitizeSynthChordSubLane(
  lane: SynthChordSequencerSubLaneName,
  value: unknown,
): SynthChordSequencerSubLaneConfig {
  const fallback = defaultSynthChordSequencerSubLane(lane);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const rawValues = Array.isArray(record.values) ? record.values : [];
  const range = SUB_LANE_RANGE[lane];
  return {
    enabled: boolValue(record.enabled, fallback.enabled),
    steps: clamp(finiteInteger(record.steps, fallback.steps), 1, SYNTH_CHORD_SEQUENCER_STEP_COUNT),
    direction: enumValue(record.direction, SUB_LANE_DIRECTIONS, fallback.direction),
    values: Array.from({ length: SYNTH_CHORD_SEQUENCER_STEP_COUNT }, (_, index) => {
      const raw = rawValues[index];
      const sanitized = clamp(finiteNumber(raw, fallback.values[index] ?? SUB_LANE_DEFAULT_VALUE[lane]), range.min, range.max);
      return lane === 'pitch' || lane === 'chord' ? Math.round(sanitized) : sanitized;
    }),
  };
}

export function sanitizeSynthChordSequencerConfig(value: unknown): SynthChordSequencerConfig {
  const fallback = defaultSynthChordSequencerConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const steps = Array.from({ length: SYNTH_CHORD_SEQUENCER_STEP_COUNT }, (_, id) => {
    const raw = rawSteps[id];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback.steps[id]!;
    const step = raw as Record<string, unknown>;
    return {
      id,
      enabled: boolValue(step.enabled, fallback.steps[id]!.enabled),
      slotId: sanitizeSlotId(step.slotId),
      probability: clamp(finiteNumber(step.probability, fallback.steps[id]!.probability), 0, 1),
      holdSteps: clamp(finiteInteger(step.holdSteps, fallback.steps[id]!.holdSteps), 1, SYNTH_CHORD_SEQUENCER_STEP_COUNT),
    };
  });
  const rawArp = record.arp && typeof record.arp === 'object' && !Array.isArray(record.arp)
    ? record.arp as Record<string, unknown>
    : {};
  const rawStrum = record.strum && typeof record.strum === 'object' && !Array.isArray(record.strum)
    ? record.strum as Record<string, unknown>
    : {};
  const rawSubLanes = record.subLanes && typeof record.subLanes === 'object' && !Array.isArray(record.subLanes)
    ? record.subLanes as Record<string, unknown>
    : {};
  const hasRawChordLane = Object.prototype.hasOwnProperty.call(rawSubLanes, 'chord');
  const sanitizedChordLane = sanitizeSynthChordSubLane('chord', rawSubLanes.chord);
  const chordLane = hasRawChordLane
    ? sanitizedChordLane
    : {
        ...sanitizedChordLane,
        enabled: steps.some((step) => step.slotId !== null) ? true : sanitizedChordLane.enabled,
        values: sanitizedChordLane.values.map((fallbackValue, index) => {
          const slotId = steps[index]?.slotId;
          return slotId == null ? fallbackValue : slotId + 1;
        }),
      };
  return {
    stepCount: clamp(finiteInteger(record.stepCount, fallback.stepCount), 1, SYNTH_CHORD_SEQUENCER_STEP_COUNT),
    steps,
    playbackMode: enumValue(record.playbackMode, PLAYBACK_MODES, fallback.playbackMode),
    arp: {
      order: enumValue(rawArp.order, ARP_ORDERS, fallback.arp.order),
      hold: enumValue(rawArp.hold, ARP_HOLD_MODES, fallback.arp.hold),
      speed: enumValue(rawArp.speed, SYNTH_CHORD_ARP_SPEEDS, fallback.arp.speed),
      gate: clamp(finiteNumber(rawArp.gate, fallback.arp.gate), 0.05, 1),
      shape: enumValue(rawArp.shape, ARP_SHAPES, fallback.arp.shape),
      patternLength: ARP_PATTERN_LENGTHS.includes(rawArp.patternLength as SynthChordSequencerArpPatternLength)
        ? rawArp.patternLength as SynthChordSequencerArpPatternLength
        : fallback.arp.patternLength,
      pattern: Array.from({ length: 16 }, (_, index) => sanitizeArpPatternStep(
        Array.isArray(rawArp.pattern) ? rawArp.pattern[index] : undefined,
        fallback.arp.pattern[index] ?? DEFAULT_SYNTH_CHORD_ARP_PATTERN[index]!,
      )),
    },
    strum: {
      direction: enumValue(rawStrum.direction, STRUM_DIRECTIONS, fallback.strum.direction),
      spreadMs: clamp(finiteNumber(rawStrum.spreadMs, fallback.strum.spreadMs), 0, 400),
      curve: clamp(finiteNumber(rawStrum.curve, fallback.strum.curve), -1, 1),
      gate: clamp(finiteNumber(rawStrum.gate, fallback.strum.gate), 0.05, 1),
      velocityFalloff: clamp(finiteNumber(rawStrum.velocityFalloff, fallback.strum.velocityFalloff), 0, 0.6),
    },
    subLanes: {
      chord: chordLane,
      pitch: sanitizeSynthChordSubLane('pitch', rawSubLanes.pitch),
      expression: sanitizeSynthChordSubLane('expression', rawSubLanes.expression),
      morph: sanitizeSynthChordSubLane('morph', rawSubLanes.morph),
      distance: sanitizeSynthChordSubLane('distance', rawSubLanes.distance),
      nudge: sanitizeSynthChordSubLane('nudge', rawSubLanes.nudge),
    },
  };
}

export function synthChordSequencerStepForTick(
  config: SynthChordSequencerConfig,
  absoluteTickIndex: number,
): SynthChordSequencerStep {
  const normalized = sanitizeSynthChordSequencerConfig(config);
  const stepCount = Math.max(1, normalized.stepCount);
  const index = ((Math.round(absoluteTickIndex) % stepCount) + stepCount) % stepCount;
  return normalized.steps[index] ?? defaultSynthChordSequencerStep(index);
}

export function ticksUntilNextEnabledSynthChordStep(
  config: SynthChordSequencerConfig,
  absoluteTickIndex: number,
): number {
  const normalized = sanitizeSynthChordSequencerConfig(config);
  const stepCount = Math.max(1, normalized.stepCount);
  for (let offset = 1; offset <= stepCount; offset += 1) {
    const step = synthChordSequencerStepForTick(normalized, absoluteTickIndex + offset);
    if (step.enabled && step.probability > 0) return offset;
  }
  return stepCount;
}

export function synthChordSequencerTriggerOrdinalForTick(
  config: SynthChordSequencerConfig,
  absoluteTickIndex: number,
): number {
  const normalized = sanitizeSynthChordSequencerConfig(config);
  const stepCount = Math.max(1, normalized.stepCount);
  const safeTick = Math.max(0, Math.floor(absoluteTickIndex));
  const stepIndex = safeTick % stepCount;
  const enabledPerCycle = Math.max(1, normalized.steps.slice(0, stepCount).filter((step) => step.enabled && step.probability > 0).length);
  let ordinalInCycle = 0;
  for (let index = 0; index <= stepIndex; index += 1) {
    const candidate = normalized.steps[index];
    if (candidate?.enabled && candidate.probability > 0) ordinalInCycle += 1;
  }
  return Math.floor(safeTick / stepCount) * enabledPerCycle + Math.max(0, ordinalInCycle - 1);
}

export function synthChordSubLaneIndex(
  lane: SynthChordSequencerSubLaneConfig,
  triggerOrdinal: number,
): number {
  const steps = Math.max(1, Math.min(SYNTH_CHORD_SEQUENCER_STEP_COUNT, Math.round(lane.steps)));
  const safeOrdinal = Math.max(0, Math.floor(triggerOrdinal));
  if (lane.direction === 'reverse') return steps - 1 - (safeOrdinal % steps);
  if (lane.direction === 'pingpong' && steps > 1) {
    const cycle = steps * 2 - 2;
    const phase = safeOrdinal % cycle;
    return phase < steps ? phase : cycle - phase;
  }
  return safeOrdinal % steps;
}

export function synthChordSubLaneValue(
  config: SynthChordSequencerConfig,
  laneName: SynthChordSequencerSubLaneName,
  triggerOrdinal: number,
): number | null {
  const normalized = sanitizeSynthChordSequencerConfig(config);
  const lane = normalized.subLanes[laneName];
  if (!lane.enabled) return null;
  const index = synthChordSubLaneIndex(lane, triggerOrdinal);
  return lane.values[index] ?? SUB_LANE_DEFAULT_VALUE[laneName];
}

export function synthChordArpSpeedSeconds(state: Record<string, unknown>, speed: SynthChordSequencerArpSpeed): number {
  const beat = Math.max(0.001, coreProductSequencerBeatDurationSeconds(state));
  switch (speed) {
    case '1/4':
      return beat;
    case '1/8':
      return beat / 2;
    case '1/8T':
      return beat / 3;
    case '1/16':
      return beat / 4;
    case '1/16T':
      return beat / 6;
    case '1/32':
      return beat / 8;
    default:
      return beat / 2;
  }
}

function normalizePool(notes: readonly number[]): number[] {
  const pool: number[] = [];
  for (const note of notes) {
    if (!Number.isFinite(note)) continue;
    const midi = clamp(Math.round(note), 0, 127);
    if (!pool.includes(midi)) pool.push(midi);
    if (pool.length >= HARMONY_POOL_MAX_NOTES) break;
  }
  return pool.sort((left, right) => left - right);
}

function numberFromState(state: Record<string, unknown>, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rootMidiFromState(state: Record<string, unknown>): number {
  const explicitRootMidi = numberFromState(state, 'rootMidi', Number.NaN);
  if (Number.isFinite(explicitRootMidi)) return clamp(Math.round(explicitRootMidi), 0, 127);
  const rootNote = numberFromState(state, 'rootNote', 4);
  const pitchClass = ((Math.round(rootNote) % 12) + 12) % 12;
  return 60 + pitchClass;
}

function rootMidiWithPitchClass(baseMidi: number, rootPitchClass: number): number {
  const base = clamp(Math.round(baseMidi), 0, 127);
  const candidate = Math.floor(base / 12) * 12 + ((Math.round(rootPitchClass) % 12) + 12) % 12;
  return clamp(candidate > 127 ? candidate - 12 : candidate, 0, 127);
}

function positiveU32(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback >>> 0 || 1;
  const rounded = Math.round(value) >>> 0;
  return rounded === 0 ? (fallback >>> 0 || 1) : rounded;
}

export interface SynthChordSlotResolutionContext {
  rootMidi: number;
  scaleId: number;
  tension: number;
  chordSlots: HarmonyChordSlot[];
}

export function createSynthChordSlotResolutionContext(
  state: Record<string, unknown>,
  harmonyState: HarmonyState,
): SynthChordSlotResolutionContext {
  const rootMidi = rootMidiWithPitchClass(rootMidiFromState(state), harmonyState.effectiveRoot);
  const scaleId = productHarmonyScaleIdFromName(harmonyState.scaleFamily.name);
  const tension = clamp(numberFromState(state, 'tension', 0.3), 0, 1);
  const seed = positiveU32(numberFromState(state, 'rngSeed', numberFromState(state, 'seed', 1)), 1);
  const morphPercent = clamp(numberFromState(state, 'journeyMorphPhase', 0), 0, 1) * 100;
  const resolved = resolveProductHarmonyState({ state, rootMidi, scaleId, tension, seed, morphPercent });
  return {
    rootMidi,
    scaleId,
    tension,
    chordSlots: resolved.chordSlots,
  };
}

export function resolveSynthChordStepMidiPool(args: {
  step: SynthChordSequencerStep;
  context: SynthChordSlotResolutionContext;
  fallbackMidi: readonly number[];
}): number[] {
  if (args.step.slotId === null) return normalizePool(args.fallbackMidi);
  const slot = args.context.chordSlots[args.step.slotId];
  if (!slot) return normalizePool(args.fallbackMidi);
  return normalizePool(resolveHarmonyIntentToNotePool({
    intent: { ...slot.intent, source: 'slot' },
    rootMidi: args.context.rootMidi,
    scaleId: args.context.scaleId,
    tension: args.context.tension,
  }));
}
