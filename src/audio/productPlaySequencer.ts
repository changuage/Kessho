import {
  HARMONY_POOL_MAX_NOTES,
  HARMONY_SLOT_COUNT,
} from './CoreProductHarmonyControl';
import { sharedSlotResolvedMidiPool } from './harmony/harmonyChordAdapters';
import type { PitchBindingMode } from './drumSeqTypes';
import {
  defaultProductArpConfig,
  normalizeProductArpConfig,
  normalizeProductArpConfigs,
  productArpPulseValues,
  resolveProductArpMidiPattern,
  resolveProductArpPatternDetails,
  type ProductArpConfig,
  type ProductArpHarmonyContext,
  type ProductArpResolvedStep,
} from './productArpeggiator';
import type { SynthChordSequencerStrumDirection } from './synthChordSequencer';

export type ProductPlayMode = 'arp' | 'chord';
export type ProductChordStyle = 'straight' | 'strum';
export type ProductChordFlow = 'forward' | 'reverse' | 'pingpong';

export interface ProductChordStep {
  active: boolean;
  slotId: number;
}

export interface ProductChordStrumConfig {
  direction: SynthChordSequencerStrumDirection;
  spreadMs: number;
  curve: number;
  velocityFalloff: number;
}

export interface ProductChordPlayConfig {
  style: ProductChordStyle;
  length: number;
  flow: ProductChordFlow;
  gate: number;
  voiceCount: number;
  steps: ProductChordStep[];
  strum: ProductChordStrumConfig;
}

export interface ProductPlayConfig {
  enabled: boolean;
  mode: ProductPlayMode;
  arp: ProductArpConfig;
  chord: ProductChordPlayConfig;
}

export interface ProductChordResolvedStep {
  step: number;
  sourceStep: number;
  active: boolean;
  slotId: number;
  label: string;
  locked: boolean;
  notes: number[];
  strumOrder: number[];
}

export interface ProductPlayNoteEvent {
  step: number;
  sourceStep: number;
  slotId: number | null;
  midi: number;
  offsetMs: number;
  velocity: number;
  voiceIndex: number;
}

export type ProductPlayResolvedStep =
  | { mode: 'arp'; arp: ProductArpResolvedStep }
  | { mode: 'chord'; chord: ProductChordResolvedStep };

export interface ProductPlayEnginePattern {
  midiPattern: number[];
  playNotes: ProductPlayNoteEvent[] | null;
  steps: number;
}

const PRODUCT_PLAY_MODES: readonly ProductPlayMode[] = ['arp', 'chord'];
const PRODUCT_CHORD_STYLES: readonly ProductChordStyle[] = ['straight', 'strum'];
const PRODUCT_CHORD_FLOWS: readonly ProductChordFlow[] = ['forward', 'reverse', 'pingpong'];
const PRODUCT_STRUM_DIRECTIONS: readonly SynthChordSequencerStrumDirection[] = ['up', 'down', 'upDown', 'downUp', 'random'];
const PRODUCT_PLAY_MAX_STEPS = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteInteger(value: unknown, fallback: number): number {
  return Math.round(finiteNumber(value, fallback));
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

function normalizeStepLength(value: unknown, fallback = 8): number {
  return clamp(finiteInteger(value, fallback), 1, PRODUCT_PLAY_MAX_STEPS);
}

function normalizeChordSlotId(value: unknown, fallback: number): number {
  return clamp(finiteInteger(value, fallback), 0, HARMONY_SLOT_COUNT - 1);
}

function defaultChordStep(index: number, active = false): ProductChordStep {
  return {
    active,
    slotId: index % HARMONY_SLOT_COUNT,
  };
}

export function defaultProductChordPlayConfig(): ProductChordPlayConfig {
  return {
    style: 'straight',
    length: 8,
    flow: 'forward',
    gate: 0.86,
    voiceCount: HARMONY_POOL_MAX_NOTES,
    steps: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, (_, index) => defaultChordStep(index, false)),
    strum: {
      direction: 'up',
      spreadMs: 90,
      curve: 0.35,
      velocityFalloff: 0.08,
    },
  };
}

export function defaultProductPlayConfig(): ProductPlayConfig {
  const arp = defaultProductArpConfig();
  return {
    enabled: arp.enabled,
    mode: 'arp',
    arp,
    chord: defaultProductChordPlayConfig(),
  };
}

function normalizeChordStep(value: unknown, index: number, fallbackActive = false): ProductChordStep {
  const fallback = defaultChordStep(index, fallbackActive);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    active: boolValue(record.active, fallback.active),
    slotId: normalizeChordSlotId(record.slotId, fallback.slotId),
  };
}

export function normalizeProductChordPlayConfig(value: unknown): ProductChordPlayConfig {
  const fallback = defaultProductChordPlayConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const length = normalizeStepLength(record.length, fallback.length);
  const rawStrum = record.strum && typeof record.strum === 'object' && !Array.isArray(record.strum)
    ? record.strum as Record<string, unknown>
    : {};
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  return {
    style: enumValue(record.style, PRODUCT_CHORD_STYLES, fallback.style),
    length,
    flow: enumValue(record.flow, PRODUCT_CHORD_FLOWS, fallback.flow),
    gate: clamp(finiteNumber(record.gate, fallback.gate), 0.05, 1),
    voiceCount: clamp(finiteInteger(record.voiceCount, fallback.voiceCount), 1, HARMONY_POOL_MAX_NOTES),
    steps: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, (_, index) => normalizeChordStep(rawSteps[index], index, false)),
    strum: {
      direction: enumValue(rawStrum.direction, PRODUCT_STRUM_DIRECTIONS, fallback.strum.direction),
      spreadMs: clamp(finiteNumber(rawStrum.spreadMs, fallback.strum.spreadMs), 0, 400),
      curve: clamp(finiteNumber(rawStrum.curve, fallback.strum.curve), -1, 1),
      velocityFalloff: clamp(finiteNumber(rawStrum.velocityFalloff, fallback.strum.velocityFalloff), 0, 0.6),
    },
  };
}

function looksLikeLegacyArpConfig(record: Record<string, unknown>): boolean {
  return 'flow' in record ||
    'direction' in record ||
    'pulseCount' in record ||
    'tonePattern' in record ||
    'contour' in record ||
    'pulseMask' in record;
}

export function normalizeProductPlayConfig(value: unknown): ProductPlayConfig {
  const fallback = defaultProductPlayConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  if (!('arp' in record) && looksLikeLegacyArpConfig(record)) {
    const arp = normalizeProductArpConfig(record);
    return {
      ...fallback,
      enabled: arp.enabled,
      mode: 'arp',
      arp,
    };
  }
  const arp = normalizeProductArpConfig(record.arp ?? record);
  const chord = normalizeProductChordPlayConfig(record.chord);
  return {
    enabled: boolValue(record.enabled, arp.enabled),
    mode: enumValue(record.mode, PRODUCT_PLAY_MODES, fallback.mode),
    arp,
    chord,
  };
}

export function normalizeProductPlayConfigs(value: unknown, laneCount = 4): ProductPlayConfig[] {
  const lanes = Array.isArray(value) ? value : [];
  if (lanes.length === 0 && Array.isArray(value)) return normalizeProductArpConfigs(value, laneCount).map((arp) => ({
    ...defaultProductPlayConfig(),
    enabled: arp.enabled,
    mode: 'arp',
    arp,
  }));
  return Array.from({ length: laneCount }, (_, index) => normalizeProductPlayConfig(lanes[index]));
}

export function productPlayConfigsHaveEnabledLane(configs: readonly ProductPlayConfig[] | undefined): boolean {
  return configs?.some((config) => config.enabled) === true;
}

export function sanitizeProductPlayConfigs(configs: readonly ProductPlayConfig[] | undefined): ProductPlayConfig[] | undefined {
  if (!configs) return undefined;
  return normalizeProductPlayConfigs(configs, Math.max(4, configs.length));
}

function directedStepIndex(flow: ProductChordFlow, length: number, ordinal: number): number {
  const steps = Math.max(1, Math.min(PRODUCT_PLAY_MAX_STEPS, Math.round(length)));
  const safeOrdinal = Math.max(0, Math.floor(ordinal));
  if (flow === 'reverse') return steps - 1 - (safeOrdinal % steps);
  if (flow === 'pingpong' && steps > 1) {
    const cycle = steps * 2 - 2;
    const phase = safeOrdinal % cycle;
    return phase < steps ? phase : cycle - phase;
  }
  return safeOrdinal % steps;
}

function orderChordNotes(notes: readonly number[], direction: SynthChordSequencerStrumDirection, step: number): number[] {
  const ascending = [...notes].sort((left, right) => left - right);
  if (direction === 'down') return ascending.reverse();
  if (direction === 'downUp') return step % 2 === 0 ? ascending.reverse() : ascending;
  if (direction === 'upDown') return step % 2 === 0 ? ascending : ascending.reverse();
  if (direction === 'random') {
    return ascending
      .map((midi, index) => ({ midi, key: hashU32((step + 1) * 0x9e3779b1 + midi * 0x85ebca6b + index) }))
      .sort((left, right) => left.key - right.key)
      .map((entry) => entry.midi);
  }
  return ascending;
}

function hashU32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function strumOffsetMs(index: number, count: number, spreadMs: number, curve: number): number {
  if (count <= 1) return 0;
  const phase = index / (count - 1);
  const curved = curve >= 0
    ? Math.pow(phase, 1 + curve * 2)
    : 1 - Math.pow(1 - phase, 1 + Math.abs(curve) * 2);
  return Math.max(0, spreadMs) * curved;
}

function resolveChordStepNotes(step: ProductChordStep, harmony: ProductArpHarmonyContext, voiceCount: number): {
  notes: number[];
  label: string;
  locked: boolean;
} {
  const slot = harmony.chordSlots[step.slotId];
  if (!slot) return { notes: [], label: `S${step.slotId + 1}`, locked: false };
  if (!slot.chord) return { notes: [], label: `S${step.slotId + 1} Empty`, locked: slot.locked };
  const notes = sharedSlotResolvedMidiPool(slot, {
    rootMidi: harmony.rootMidi,
    effectiveRootMidi: harmony.rootMidi,
    scaleId: harmony.scaleId,
    tension: harmony.tension,
  }).slice(0, voiceCount);
  return {
    notes,
    label: slot.chord.recognizedLabel || 'custom',
    locked: slot.locked,
  };
}

export function resolveProductChordPlayPatternDetails(options: {
  config: ProductChordPlayConfig;
  harmony: ProductArpHarmonyContext;
}): ProductChordResolvedStep[] {
  const config = normalizeProductChordPlayConfig(options.config);
  return Array.from({ length: config.length }, (_, step) => {
    const sourceStep = directedStepIndex(config.flow, config.length, step);
    const chordStep = config.steps[sourceStep] ?? defaultChordStep(sourceStep);
    const resolved = resolveChordStepNotes(chordStep, options.harmony, config.voiceCount);
    const ordered = orderChordNotes(resolved.notes, config.strum.direction, sourceStep);
    return {
      step,
      sourceStep,
      active: chordStep.active,
      slotId: chordStep.slotId,
      label: resolved.label,
      locked: resolved.locked,
      notes: chordStep.active ? resolved.notes : [],
      strumOrder: ordered,
    };
  });
}

function resolveProductChordPlayActivePatternDetails(options: {
  config: ProductChordPlayConfig;
  harmony: ProductArpHarmonyContext;
}): ProductChordResolvedStep[] {
  return resolveProductChordPlayPatternDetails(options)
    .filter((detail) => detail.active && detail.notes.length > 0)
    .map((detail, step) => ({ ...detail, step }));
}

export function resolveProductChordPlayEvents(options: {
  config: ProductChordPlayConfig;
  harmony: ProductArpHarmonyContext;
}): ProductPlayNoteEvent[] {
  const config = normalizeProductChordPlayConfig(options.config);
  return resolveProductChordPlayActivePatternDetails({ config, harmony: options.harmony }).flatMap((detail) => {
    const ordered = config.style === 'strum' ? detail.strumOrder : detail.notes;
    return ordered.map((midi, index) => ({
      step: detail.step,
      sourceStep: detail.sourceStep,
      slotId: detail.slotId,
      midi,
      offsetMs: config.style === 'strum'
        ? strumOffsetMs(index, ordered.length, config.strum.spreadMs, config.strum.curve)
        : 0,
      velocity: clamp(1 - index * config.strum.velocityFalloff, 0.05, 1),
      voiceIndex: index,
    }));
  });
}

export function resolveProductPlayNoteEvents(options: {
  config: ProductPlayConfig;
  harmony: ProductArpHarmonyContext;
}): ProductPlayNoteEvent[] | null {
  const config = normalizeProductPlayConfig(options.config);
  if (!config.enabled || config.mode !== 'chord') return null;
  return resolveProductChordPlayEvents({
    config: config.chord,
    harmony: options.harmony,
  });
}

export function resolveProductPlayPatternDetails(options: {
  config: ProductPlayConfig;
  harmony: ProductArpHarmonyContext;
  laneIndex: number;
  runtimeTick?: number;
}): ProductPlayResolvedStep[] | null {
  const config = normalizeProductPlayConfig(options.config);
  if (!config.enabled) return null;
  if (config.mode === 'chord') {
    return resolveProductChordPlayPatternDetails({
      config: config.chord,
      harmony: options.harmony,
    }).map((chord) => ({ mode: 'chord' as const, chord }));
  }
  return (resolveProductArpPatternDetails({
    config: { ...config.arp, enabled: true },
    harmony: options.harmony,
    laneIndex: options.laneIndex,
    runtimeTick: options.runtimeTick,
  }) ?? []).map((arp) => ({ mode: 'arp' as const, arp }));
}

export function resolveProductPlayMidiPattern(options: {
  config: ProductPlayConfig;
  harmony: ProductArpHarmonyContext;
  laneIndex: number;
  runtimeTick?: number;
  anchorMidi?: number | null;
}): number[] | null {
  const config = normalizeProductPlayConfig(options.config);
  if (!config.enabled) return null;
  if (config.mode === 'chord') {
    const activeSteps = resolveProductChordPlayActivePatternDetails({ config: config.chord, harmony: options.harmony });
    return activeSteps.length > 0 ? activeSteps.map((step) => step.notes[0] ?? -1) : [-1];
  }
  return resolveProductArpMidiPattern({
    config: { ...config.arp, enabled: true },
    harmony: options.harmony,
    laneIndex: options.laneIndex,
    runtimeTick: options.runtimeTick,
    anchorMidi: options.anchorMidi,
  });
}

export function resolveProductPlayEnginePattern(options: {
  config: ProductPlayConfig;
  harmony: ProductArpHarmonyContext;
  laneIndex: number;
  runtimeTick?: number;
  pitchBindingMode?: PitchBindingMode;
  triggerPattern?: readonly boolean[] | null;
  anchorMidi?: number | null;
}): ProductPlayEnginePattern | null {
  const config = normalizeProductPlayConfig(options.config);
  if (!config.enabled) return null;

  const midiPattern = resolveProductPlayMidiPattern({ ...options, config });
  if (!midiPattern || midiPattern.length === 0) return null;
  const playNotes = resolveProductPlayNoteEvents({
    config,
    harmony: options.harmony,
  });
  if (config.mode === 'arp') {
    return {
      midiPattern,
      playNotes: null,
      steps: midiPattern.length,
    };
  }
  const shouldUseTriggerStepBinding =
    options.pitchBindingMode === 'sequence' &&
    Array.isArray(options.triggerPattern) &&
    options.triggerPattern.length > 0;
  if (!shouldUseTriggerStepBinding) {
    return {
      midiPattern,
      playNotes,
      steps: midiPattern.length,
    };
  }

  const notesByStep = new Map<number, ProductPlayNoteEvent[]>();
  for (const event of playNotes ?? []) {
    const events = notesByStep.get(event.step) ?? [];
    events.push(event);
    notesByStep.set(event.step, events);
  }

  let hitOrdinal = 0;
  const expandedMidiPattern = options.triggerPattern!.map((enabled) => {
    if (!enabled) return -1;
    const sourceStep = hitOrdinal % midiPattern.length;
    hitOrdinal += 1;
    return midiPattern[sourceStep] ?? -1;
  });

  hitOrdinal = 0;
  const expandedPlayNotes: ProductPlayNoteEvent[] = [];
  options.triggerPattern!.forEach((enabled, triggerStep) => {
    if (!enabled) return;
    const sourceStep = hitOrdinal % midiPattern.length;
    hitOrdinal += 1;
    for (const event of notesByStep.get(sourceStep) ?? []) {
      expandedPlayNotes.push({ ...event, step: triggerStep });
    }
  });

  return {
    midiPattern: expandedMidiPattern,
    playNotes: expandedPlayNotes.length > 0 ? expandedPlayNotes : null,
    steps: expandedMidiPattern.length,
  };
}

export function productPlayPulseValues(config: ProductPlayConfig): number[] {
  const normalized = normalizeProductPlayConfig(config);
  if (normalized.mode === 'arp') return productArpPulseValues(normalized.arp);
  const chord = normalized.chord;
  return Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, (_, step) => {
    if (step >= chord.length) return 0;
    const chordStep = chord.steps[step] ?? defaultChordStep(step);
    return chordStep.active ? (chordStep.slotId + 1) / HARMONY_SLOT_COUNT : 0;
  });
}

export function productPlayLiveLength(config: ProductPlayConfig): number {
  const normalized = normalizeProductPlayConfig(config);
  return normalized.mode === 'chord' ? normalized.chord.length : normalized.arp.length;
}
