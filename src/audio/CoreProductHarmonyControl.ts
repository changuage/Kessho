export const HARMONY_SLOT_COUNT = 8 as const;
export const HARMONY_SEQUENCE_STEP_COUNT = 8 as const;
export const HARMONY_POOL_MAX_NOTES = 8 as const;

export const HARMONY_SLOT_TRIGGER_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','] as const;
export const HARMONY_NOTE_KEYS = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j'] as const;

export type HarmonyIntentSource =
  | 'baseline'
  | 'sequence'
  | 'slot'
  | 'manualControl'
  | 'audition'
  | 'presetMorph';

export type HarmonyControlStrength = 'bias' | 'force';
export type HarmonyRootMode = 'degree' | 'absolute' | 'captured';
export type HarmonyChordQuality =
  | 'auto'
  | 'dim'
  | 'min'
  | 'maj'
  | 'sus'
  | 'maj7'
  | 'min7'
  | 'dom7'
  | 'add9'
  | 'six'
  | 'sixNine'
  | 'nine'
  | 'quartal'
  | 'cluster'
  | 'custom';
export type HarmonyBassMode = 'off' | 'root' | 'fifth' | 'captured';
export type HarmonySequenceStepMode = 'auto' | 'intent' | 'slotCopy' | 'slotFollow';
export type ManualHarmonyControlMode = 'audition' | 'control' | 'capture';

export interface HarmonyIntent {
  source: HarmonyIntentSource;
  strength: HarmonyControlStrength;
  rootMode: HarmonyRootMode;
  degree: number;
  rootNote: number;
  quality: HarmonyChordQuality;
  extensions: string[];
  inversion: number;
  spread: number;
  octave: number;
  bassMode: HarmonyBassMode;
  bassNote: number | null;
  capturedMidiNotes: number[];
  preserveCapturedVoicing: boolean;
}

export interface HarmonyChordSlot {
  id: number;
  name: string;
  intent: HarmonyIntent;
  locked: boolean;
}

export interface HarmonySequenceStep {
  id: number;
  enabled: boolean;
  locked: boolean;
  mode: HarmonySequenceStepMode;
  degree: number;
  quality: HarmonyChordQuality;
  intent: HarmonyIntent | null;
  slotId: number | null;
  probability: number;
}

export interface ManualHarmonyControlState {
  enabled: boolean;
  mode: ManualHarmonyControlMode;
  strength: HarmonyControlStrength;
  selectedRootNote: number;
  selectedDegree: number;
  selectedQuality: HarmonyChordQuality;
  selectedExtensions: string[];
  selectedOctave: number;
  selectedInversion: number;
  selectedSpread: number;
  selectedBassMode: HarmonyBassMode;
  activeIntent: HarmonyIntent | null;
  auditionIntent: HarmonyIntent | null;
  slotTriggerMode: boolean;
  activeSlotId: number | null;
}

export interface ResolvedHarmonyFrame {
  activeSource: HarmonyIntentSource;
  activeStepIndex: number | null;
  activeSlotId: number | null;
  rootMidi: number;
  scaleId: number;
  degree: number;
  quality: HarmonyChordQuality;
  currentNotePool: number[];
  bassNote: number | null;
  nextNotePool: number[];
  nextSource: HarmonyIntentSource | null;
  nextStepIndex: number | null;
  morphPercent: number;
  manualControlAvailable: boolean;
}

export interface L4HarmonyStateExtension {
  manualControl: ManualHarmonyControlState;
  chordSlots: HarmonyChordSlot[];
  chordSequence: HarmonySequenceStep[];
  chordSequenceEnabled: boolean;
  chordSequenceStepIndex: number;
  resolvedHarmonyFrame: ResolvedHarmonyFrame;
}

export const HARMONY_SOURCE_IDS = Object.freeze({
  baseline: 0,
  sequence: 1,
  slot: 2,
  manualControl: 3,
  audition: 4,
  presetMorph: 5,
} as const);

export const HARMONY_STRENGTH_IDS = Object.freeze({
  bias: 0,
  force: 1,
} as const);

export const HARMONY_ROOT_MODE_IDS = Object.freeze({
  degree: 0,
  absolute: 1,
  captured: 2,
} as const);

export const HARMONY_QUALITY_IDS = Object.freeze({
  auto: 0,
  dim: 1,
  min: 2,
  maj: 3,
  sus: 4,
  maj7: 5,
  min7: 6,
  dom7: 7,
  add9: 8,
  six: 9,
  sixNine: 10,
  nine: 11,
  quartal: 12,
  cluster: 13,
  custom: 14,
} as const);

export const HARMONY_BASS_MODE_IDS = Object.freeze({
  off: 0,
  root: 1,
  fifth: 2,
  captured: 3,
} as const);

export const HARMONY_SEQUENCE_MODE_IDS = Object.freeze({
  auto: 0,
  intent: 1,
  slotCopy: 2,
  slotFollow: 3,
} as const);

export const MANUAL_HARMONY_MODE_IDS = Object.freeze({
  audition: 0,
  control: 1,
  capture: 2,
} as const);

const SCALE_INTERVALS: Record<number, readonly number[]> = {
  1: [0, 2, 4, 5, 7, 9, 11],
  2: [0, 2, 3, 5, 7, 8, 10],
  3: [0, 2, 4, 7, 9],
  4: [0, 1, 3, 4, 6, 7, 9, 10],
  5: [0, 2, 4, 6, 7, 9, 11],
  6: [0, 2, 4, 5, 7, 9, 10],
  7: [0, 3, 5, 7, 10],
  8: [0, 2, 3, 5, 7, 9, 10],
  9: [0, 2, 3, 5, 7, 8, 11],
  10: [0, 2, 3, 5, 7, 9, 11],
  11: [0, 1, 4, 5, 7, 8, 10],
};

const QUALITY_INTERVALS: Partial<Record<HarmonyChordQuality, readonly number[]>> = {
  dim: [0, 3, 6],
  min: [0, 3, 7],
  maj: [0, 4, 7],
  sus: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  add9: [0, 4, 7, 14],
  six: [0, 4, 7, 9],
  sixNine: [0, 4, 7, 9, 14],
  nine: [0, 4, 7, 10, 14],
  quartal: [0, 5, 10, 15],
  cluster: [0, 1, 2, 4],
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

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function arrayValue<T>(value: unknown, guard: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const item of value) {
    const parsed = guard(item);
    if (parsed !== null) result.push(parsed);
  }
  return result;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
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

function unitFromSeed(seed: number): number {
  return hashU32(seed) / 0x100000000;
}

function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function normalizeMidiPool(notes: readonly number[]): number[] {
  const pool: number[] = [];
  for (const note of notes) {
    if (!Number.isFinite(note)) continue;
    const midi = clamp(Math.round(note), 0, 127);
    if (!pool.includes(midi)) pool.push(midi);
    if (pool.length >= HARMONY_POOL_MAX_NOTES) break;
  }
  return pool.sort((a, b) => a - b);
}

export function defaultHarmonyIntent(source: HarmonyIntentSource = 'baseline', degree = 0): HarmonyIntent {
  return {
    source,
    strength: 'bias',
    rootMode: 'degree',
    degree: clamp(Math.round(degree), 0, 6),
    rootNote: 0,
    quality: 'auto',
    extensions: [],
    inversion: 0,
    spread: 0.5,
    octave: 4,
    bassMode: 'off',
    bassNote: null,
    capturedMidiNotes: [],
    preserveCapturedVoicing: false,
  };
}

export function defaultHarmonyChordSlot(id: number): HarmonyChordSlot {
  return {
    id: clamp(Math.round(id), 0, HARMONY_SLOT_COUNT - 1),
    name: `Slot ${id + 1}`,
    intent: defaultHarmonyIntent('slot', id % 7),
    locked: false,
  };
}

export function defaultHarmonySequenceStep(id: number): HarmonySequenceStep {
  return {
    id: clamp(Math.round(id), 0, HARMONY_SEQUENCE_STEP_COUNT - 1),
    enabled: true,
    locked: false,
    mode: 'auto',
    degree: id % 7,
    quality: 'auto',
    intent: null,
    slotId: null,
    probability: 1,
  };
}

export function defaultManualHarmonyControlState(): ManualHarmonyControlState {
  return {
    enabled: false,
    mode: 'audition',
    strength: 'bias',
    selectedRootNote: 0,
    selectedDegree: 0,
    selectedQuality: 'auto',
    selectedExtensions: [],
    selectedOctave: 4,
    selectedInversion: 0,
    selectedSpread: 0.5,
    selectedBassMode: 'off',
    activeIntent: null,
    auditionIntent: null,
    slotTriggerMode: false,
    activeSlotId: null,
  };
}

export function defaultResolvedHarmonyFrame(rootMidi = 60, scaleId = 1, tension = 0.35): ResolvedHarmonyFrame {
  const intent = buildBaselineHarmonyIntent({ rootMidi, scaleId, tension, seed: 1, barIndex: 0, phraseIndex: 0 });
  return {
    activeSource: 'baseline',
    activeStepIndex: null,
    activeSlotId: null,
    rootMidi,
    scaleId,
    degree: intent.degree,
    quality: 'auto',
    currentNotePool: resolveHarmonyIntentToNotePool({ intent, rootMidi, scaleId, tension }),
    bassNote: null,
    nextNotePool: resolveHarmonyIntentToNotePool({ intent: { ...intent, degree: (intent.degree + 3) % 7 }, rootMidi, scaleId, tension }),
    nextSource: 'baseline',
    nextStepIndex: null,
    morphPercent: 0,
    manualControlAvailable: true,
  };
}

export function sanitizeHarmonyIntent(value: unknown, fallback = defaultHarmonyIntent()): HarmonyIntent {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  return {
    source: enumValue(record.source, Object.keys(HARMONY_SOURCE_IDS) as HarmonyIntentSource[], fallback.source),
    strength: enumValue(record.strength, Object.keys(HARMONY_STRENGTH_IDS) as HarmonyControlStrength[], fallback.strength),
    rootMode: enumValue(record.rootMode, Object.keys(HARMONY_ROOT_MODE_IDS) as HarmonyRootMode[], fallback.rootMode),
    degree: clamp(finiteInteger(record.degree, fallback.degree), 0, 6),
    rootNote: clamp(finiteInteger(record.rootNote, fallback.rootNote), 0, 11),
    quality: enumValue(record.quality, Object.keys(HARMONY_QUALITY_IDS) as HarmonyChordQuality[], fallback.quality),
    extensions: arrayValue(record.extensions, (item) => typeof item === 'string' ? item : null).slice(0, 8),
    inversion: clamp(finiteInteger(record.inversion, fallback.inversion), -4, 4),
    spread: clamp(finiteNumber(record.spread, fallback.spread), 0, 1),
    octave: clamp(finiteInteger(record.octave, fallback.octave), 0, 8),
    bassMode: enumValue(record.bassMode, Object.keys(HARMONY_BASS_MODE_IDS) as HarmonyBassMode[], fallback.bassMode),
    bassNote: record.bassNote === null ? null : clamp(finiteInteger(record.bassNote, fallback.bassNote ?? -1), -1, 127),
    capturedMidiNotes: normalizeMidiPool(arrayValue(record.capturedMidiNotes, (item) => typeof item === 'number' ? item : null)),
    preserveCapturedVoicing: boolValue(record.preserveCapturedVoicing, fallback.preserveCapturedVoicing),
  };
}

export function sanitizeHarmonyChordSlots(value: unknown): HarmonyChordSlot[] {
  const slots = arrayValue(value, (item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = clamp(finiteInteger(record.id, 0), 0, HARMONY_SLOT_COUNT - 1);
    return {
      id,
      name: stringValue(record.name, `Slot ${id + 1}`),
      intent: sanitizeHarmonyIntent(record.intent, defaultHarmonyIntent('slot', id % 7)),
      locked: boolValue(record.locked, false),
    };
  });
  return Array.from({ length: HARMONY_SLOT_COUNT }, (_, id) => {
    const match = slots.find((slot) => slot.id === id);
    return match ?? defaultHarmonyChordSlot(id);
  });
}

export function sanitizeHarmonySequence(value: unknown): HarmonySequenceStep[] {
  const steps = arrayValue(value, (item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = clamp(finiteInteger(record.id, 0), 0, HARMONY_SEQUENCE_STEP_COUNT - 1);
    return {
      id,
      enabled: boolValue(record.enabled, true),
      locked: boolValue(record.locked, false),
      mode: enumValue(record.mode, Object.keys(HARMONY_SEQUENCE_MODE_IDS) as HarmonySequenceStepMode[], 'auto'),
      degree: clamp(finiteInteger(record.degree, id % 7), 0, 6),
      quality: enumValue(record.quality, Object.keys(HARMONY_QUALITY_IDS) as HarmonyChordQuality[], 'auto'),
      intent: record.intent ? sanitizeHarmonyIntent(record.intent, defaultHarmonyIntent('sequence', id % 7)) : null,
      slotId: record.slotId === null || record.slotId === undefined ? null : clamp(finiteInteger(record.slotId, 0), 0, HARMONY_SLOT_COUNT - 1),
      probability: clamp(finiteNumber(record.probability, 1), 0, 1),
    };
  });
  return Array.from({ length: HARMONY_SEQUENCE_STEP_COUNT }, (_, id) => {
    const match = steps.find((step) => step.id === id);
    return match ?? defaultHarmonySequenceStep(id);
  });
}

export function sanitizeManualHarmonyControl(value: unknown): ManualHarmonyControlState {
  const fallback = defaultManualHarmonyControlState();
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  return {
    enabled: boolValue(record.enabled, fallback.enabled),
    mode: enumValue(record.mode, Object.keys(MANUAL_HARMONY_MODE_IDS) as ManualHarmonyControlMode[], fallback.mode),
    strength: enumValue(record.strength, Object.keys(HARMONY_STRENGTH_IDS) as HarmonyControlStrength[], fallback.strength),
    selectedRootNote: clamp(finiteInteger(record.selectedRootNote, fallback.selectedRootNote), 0, 11),
    selectedDegree: clamp(finiteInteger(record.selectedDegree, fallback.selectedDegree), 0, 6),
    selectedQuality: enumValue(record.selectedQuality, Object.keys(HARMONY_QUALITY_IDS) as HarmonyChordQuality[], fallback.selectedQuality),
    selectedExtensions: arrayValue(record.selectedExtensions, (item) => typeof item === 'string' ? item : null).slice(0, 8),
    selectedOctave: clamp(finiteInteger(record.selectedOctave, fallback.selectedOctave), 0, 8),
    selectedInversion: clamp(finiteInteger(record.selectedInversion, fallback.selectedInversion), -4, 4),
    selectedSpread: clamp(finiteNumber(record.selectedSpread, fallback.selectedSpread), 0, 1),
    selectedBassMode: enumValue(record.selectedBassMode, Object.keys(HARMONY_BASS_MODE_IDS) as HarmonyBassMode[], fallback.selectedBassMode),
    activeIntent: record.activeIntent ? sanitizeHarmonyIntent(record.activeIntent, defaultHarmonyIntent('manualControl')) : null,
    auditionIntent: record.auditionIntent ? sanitizeHarmonyIntent(record.auditionIntent, defaultHarmonyIntent('audition')) : null,
    slotTriggerMode: boolValue(record.slotTriggerMode, fallback.slotTriggerMode),
    activeSlotId: record.activeSlotId === null || record.activeSlotId === undefined ? null : clamp(finiteInteger(record.activeSlotId, 0), 0, HARMONY_SLOT_COUNT - 1),
  };
}

export function buildBaselineHarmonyIntent(args: {
  rootMidi: number;
  scaleId: number;
  tension: number;
  seed: number;
  barIndex: number;
  phraseIndex: number;
}): HarmonyIntent {
  const intervals = SCALE_INTERVALS[Math.round(args.scaleId)] ?? SCALE_INTERVALS[1] ?? [0, 2, 4, 5, 7, 9, 11];
  const degree = args.tension <= 0.5
    ? 0
    : hashU32((args.seed >>> 0) ^ Math.imul(Math.round(args.barIndex), 31) ^ Math.imul(Math.round(args.phraseIndex), 131)) % Math.max(1, intervals.length);
  return {
    ...defaultHarmonyIntent('baseline', degree % 7),
    rootNote: pitchClass(args.rootMidi),
    quality: 'auto',
  };
}

export function resolveSequenceIntent(args: {
  sequenceEnabled: boolean;
  stepIndex: number;
  sequence: readonly HarmonySequenceStep[];
  slots: readonly HarmonyChordSlot[];
}): HarmonyIntent | null {
  if (!args.sequenceEnabled) return null;
  const step = args.sequence[clamp(Math.round(args.stepIndex), 0, HARMONY_SEQUENCE_STEP_COUNT - 1)];
  if (!step || !step.enabled || step.probability <= 0) return null;
  if ((step.mode === 'slotCopy' || step.mode === 'slotFollow') && step.slotId !== null) {
    const slot = args.slots[step.slotId];
    return slot ? { ...slot.intent, source: 'sequence' } : null;
  }
  if (step.mode === 'intent' && step.intent) {
    return { ...step.intent, source: 'sequence' };
  }
  return {
    ...defaultHarmonyIntent('sequence', step.degree),
    quality: step.quality,
  };
}

export function resolveSlotTriggerIntent(args: {
  manualControl: ManualHarmonyControlState;
  slots: readonly HarmonyChordSlot[];
  morphPercent: number;
}): HarmonyIntent | null {
  if (args.morphPercent > 0 && args.morphPercent < 100) return null;
  if (!args.manualControl.slotTriggerMode || args.manualControl.activeSlotId === null) return null;
  const slot = args.slots[args.manualControl.activeSlotId];
  return slot ? { ...slot.intent, source: 'slot' } : null;
}

export function resolveManualControlIntent(args: {
  manualControl: ManualHarmonyControlState;
  morphPercent: number;
}): HarmonyIntent | null {
  if (args.morphPercent > 0 && args.morphPercent < 100) return null;
  if (!args.manualControl.enabled || args.manualControl.mode !== 'control') return null;
  return args.manualControl.activeIntent ? { ...args.manualControl.activeIntent, source: 'manualControl' } : null;
}

export function chooseActiveHarmonyIntent(args: {
  baselineIntent: HarmonyIntent;
  sequenceIntent: HarmonyIntent | null;
  slotTriggerIntent: HarmonyIntent | null;
  manualControlIntent: HarmonyIntent | null;
  morphPercent: number;
}): HarmonyIntent {
  const manualAllowed = args.morphPercent === 0 || args.morphPercent === 100;
  if (manualAllowed && args.manualControlIntent) return args.manualControlIntent;
  if (manualAllowed && args.slotTriggerIntent) return args.slotTriggerIntent;
  if (args.sequenceIntent) return args.sequenceIntent;
  return args.baselineIntent;
}

function scaleDegreeMidi(rootMidi: number, scaleId: number, degree: number, octaveShift = 0): number {
  const intervals = SCALE_INTERVALS[Math.round(scaleId)] ?? SCALE_INTERVALS[1] ?? [0, 2, 4, 5, 7, 9, 11];
  const safeDegree = ((Math.round(degree) % intervals.length) + intervals.length) % intervals.length;
  return Math.round(rootMidi) + (intervals[safeDegree] ?? 0) + octaveShift * 12;
}

function applyInversion(notes: number[], inversion: number): number[] {
  const result = [...notes].sort((a, b) => a - b);
  if (result.length < 2) return result;
  const steps = clamp(Math.round(inversion), -4, 4);
  if (steps > 0) {
    for (let index = 0; index < steps; index += 1) {
      const note = result.shift();
      if (note !== undefined) result.push(note + 12);
    }
  } else if (steps < 0) {
    for (let index = 0; index < Math.abs(steps); index += 1) {
      const note = result.pop();
      if (note !== undefined) result.unshift(note - 12);
    }
  }
  return result;
}

export function resolveHarmonyIntentToNotePool(args: {
  intent: HarmonyIntent;
  rootMidi: number;
  scaleId: number;
  tension: number;
}): number[] {
  const intent = args.intent;
  if (intent.preserveCapturedVoicing && intent.capturedMidiNotes.length > 0) {
    return normalizeMidiPool(intent.capturedMidiNotes);
  }
  const degreeRoot = intent.rootMode === 'degree'
    ? scaleDegreeMidi(args.rootMidi, args.scaleId, intent.degree)
    : 60 + pitchClass(intent.rootNote);
  const qualityIntervals = intent.quality === 'auto'
    ? [0, 2, 4, args.tension > 0.5 ? 6 : 7].map((degree) => scaleDegreeMidi(degreeRoot, args.scaleId, degree, degree >= 7 ? 1 : 0) - degreeRoot)
    : QUALITY_INTERVALS[intent.quality] ?? QUALITY_INTERVALS.maj ?? [0, 4, 7];
  const spreadOctave = intent.spread > 0.66 ? 1 : 0;
  const raw = qualityIntervals.map((interval, index) => degreeRoot + interval + (index >= 3 ? spreadOctave * 12 : 0));
  if (intent.bassMode === 'root') raw.unshift(degreeRoot - 12);
  if (intent.bassMode === 'fifth') raw.unshift(degreeRoot - 5);
  if (intent.bassMode === 'captured' && intent.bassNote !== null) raw.unshift(intent.bassNote);
  return normalizeMidiPool(applyInversion(raw, intent.inversion));
}

export function resolveAuditionPreview(args: {
  manualControl: ManualHarmonyControlState;
  rootMidi: number;
  scaleId: number;
  tension: number;
}): ResolvedHarmonyFrame | null {
  if (!args.manualControl.auditionIntent) return null;
  const intent = { ...args.manualControl.auditionIntent, source: 'audition' as const };
  return {
    activeSource: 'audition',
    activeStepIndex: null,
    activeSlotId: null,
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    degree: intent.degree,
    quality: intent.quality,
    currentNotePool: resolveHarmonyIntentToNotePool({ intent, rootMidi: args.rootMidi, scaleId: args.scaleId, tension: args.tension }),
    bassNote: null,
    nextNotePool: [],
    nextSource: null,
    nextStepIndex: null,
    morphPercent: 0,
    manualControlAvailable: true,
  };
}

export function resolvePresetMorphContext(args: {
  state: Record<string, unknown> | undefined;
  morphPercent?: number;
}): {
  morphPercent: number;
  manualControlAvailable: boolean;
  bank: 'A' | 'B';
} {
  const morphPercent = clamp(finiteNumber(args.state?.harmonyMorphPercent, args.morphPercent ?? 0), 0, 100);
  return {
    morphPercent,
    manualControlAvailable: morphPercent === 0 || morphPercent === 100,
    bank: morphPercent >= 50 ? 'B' : 'A',
  };
}

export function resolveNextHarmonyFrame(args: {
  rootMidi: number;
  scaleId: number;
  tension: number;
  sequenceEnabled: boolean;
  stepIndex: number;
  sequence: readonly HarmonySequenceStep[];
  slots: readonly HarmonyChordSlot[];
  baselineIntent: HarmonyIntent;
}): Pick<ResolvedHarmonyFrame, 'nextNotePool' | 'nextSource' | 'nextStepIndex'> {
  const nextStepIndex = args.sequenceEnabled ? (args.stepIndex + 1) % HARMONY_SEQUENCE_STEP_COUNT : null;
  const nextIntent = nextStepIndex === null
    ? { ...args.baselineIntent, degree: (args.baselineIntent.degree + 3) % 7 }
    : resolveSequenceIntent({ sequenceEnabled: true, stepIndex: nextStepIndex, sequence: args.sequence, slots: args.slots }) ?? args.baselineIntent;
  return {
    nextNotePool: resolveHarmonyIntentToNotePool({ intent: nextIntent, rootMidi: args.rootMidi, scaleId: args.scaleId, tension: args.tension }),
    nextSource: nextIntent.source,
    nextStepIndex,
  };
}

export function resolveProductHarmonyState(args: {
  state: Record<string, unknown> | undefined;
  rootMidi: number;
  scaleId: number;
  tension: number;
  seed: number;
  barIndex?: number;
  phraseIndex?: number;
  morphPercent?: number;
}): L4HarmonyStateExtension {
  const state = args.state ?? {};
  const morphContext = resolvePresetMorphContext({ state, morphPercent: args.morphPercent });
  const manualControl = sanitizeManualHarmonyControl(state.manualHarmonyControl);
  const chordSlots = sanitizeHarmonyChordSlots(
    morphContext.bank === 'B'
      ? state.harmonyChordSlotsB ?? state.harmonyChordSlots
      : state.harmonyChordSlotsA ?? state.harmonyChordSlots,
  );
  const chordSequence = sanitizeHarmonySequence(
    morphContext.bank === 'B'
      ? state.harmonyChordSequenceB ?? state.harmonyChordSequence
      : state.harmonyChordSequenceA ?? state.harmonyChordSequence,
  );
  const chordSequenceEnabled = boolValue(state.harmonyChordSequenceEnabled, false);
  const chordSequenceStepIndex = clamp(finiteInteger(state.harmonyChordSequenceStepIndex, 0), 0, HARMONY_SEQUENCE_STEP_COUNT - 1);
  const baselineIntent = buildBaselineHarmonyIntent({
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    tension: args.tension,
    seed: args.seed,
    barIndex: args.barIndex ?? 0,
    phraseIndex: args.phraseIndex ?? 0,
  });
  const sequenceIntent = resolveSequenceIntent({ sequenceEnabled: chordSequenceEnabled, stepIndex: chordSequenceStepIndex, sequence: chordSequence, slots: chordSlots });
  const slotTriggerIntent = resolveSlotTriggerIntent({ manualControl, slots: chordSlots, morphPercent: morphContext.morphPercent });
  const manualControlIntent = resolveManualControlIntent({ manualControl, morphPercent: morphContext.morphPercent });
  const activeIntent = chooseActiveHarmonyIntent({ baselineIntent, sequenceIntent, slotTriggerIntent, manualControlIntent, morphPercent: morphContext.morphPercent });
  const nextFrame = resolveNextHarmonyFrame({
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    tension: args.tension,
    sequenceEnabled: chordSequenceEnabled,
    stepIndex: chordSequenceStepIndex,
    sequence: chordSequence,
    slots: chordSlots,
    baselineIntent,
  });
  const resolvedHarmonyFrame: ResolvedHarmonyFrame = {
    activeSource: activeIntent.source,
    activeStepIndex: activeIntent.source === 'sequence' ? chordSequenceStepIndex : null,
    activeSlotId: activeIntent.source === 'slot' ? manualControl.activeSlotId : null,
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    degree: activeIntent.degree,
    quality: activeIntent.quality,
    currentNotePool: resolveHarmonyIntentToNotePool({ intent: activeIntent, rootMidi: args.rootMidi, scaleId: args.scaleId, tension: args.tension }),
    bassNote: activeIntent.bassMode === 'off' ? null : activeIntent.bassNote,
    nextNotePool: nextFrame.nextNotePool,
    nextSource: nextFrame.nextSource,
    nextStepIndex: nextFrame.nextStepIndex,
    morphPercent: morphContext.morphPercent,
    manualControlAvailable: morphContext.manualControlAvailable,
  };
  return {
    manualControl,
    chordSlots,
    chordSequence,
    chordSequenceEnabled,
    chordSequenceStepIndex,
    resolvedHarmonyFrame,
  };
}

export function generateHarmonySlots(
  seed: number,
  params: { rootMidi?: number; scaleId?: number; tension?: number } = {},
  existingSlots: readonly HarmonyChordSlot[] = [],
): HarmonyChordSlot[] {
  const slots = sanitizeHarmonyChordSlots(existingSlots);
  return slots.map((slot, id) => {
    if (slot.locked) return slot;
    const unit = unitFromSeed((seed >>> 0) ^ Math.imul(id + 1, 0x9e3779b9));
    const quality: HarmonyChordQuality = unit > 0.72 ? 'auto' : unit > 0.5 ? 'min7' : unit > 0.28 ? 'add9' : 'maj';
    return {
      ...slot,
      id,
      name: slot.name || `Slot ${id + 1}`,
      intent: {
        ...defaultHarmonyIntent('slot', (id * 3 + Math.round(unit * 6)) % 7),
        rootNote: pitchClass(params.rootMidi ?? 60),
        quality,
      },
    };
  });
}

export function generateHarmonySequence(
  seed: number,
  params: { rootMidi?: number; scaleId?: number; tension?: number } = {},
  existingSequence: readonly HarmonySequenceStep[] = [],
  slots: readonly HarmonyChordSlot[] = [],
): HarmonySequenceStep[] {
  void params;
  const sequence = sanitizeHarmonySequence(existingSequence);
  const slotBank = sanitizeHarmonyChordSlots(slots);
  return sequence.map((step, id) => {
    if (step.locked) return step;
    const unit = unitFromSeed((seed >>> 0) ^ Math.imul(id + 17, 0x85ebca6b));
    const useSlot = unit > 0.65;
    const slotId = useSlot ? id % HARMONY_SLOT_COUNT : null;
    return {
      ...step,
      id,
      enabled: true,
      mode: useSlot ? 'slotCopy' : 'auto',
      degree: useSlot ? slotBank[slotId ?? 0]?.intent.degree ?? id % 7 : [0, 3, 4, 5, 1, 4, 6, 0][id] ?? id % 7,
      quality: unit > 0.45 ? 'auto' : 'maj',
      intent: null,
      slotId,
      probability: 1,
    };
  });
}

export function generateHarmonySlotsAndSequence(
  seed: number,
  params: { rootMidi?: number; scaleId?: number; tension?: number } = {},
  existingSlots: readonly HarmonyChordSlot[] = [],
  existingSequence: readonly HarmonySequenceStep[] = [],
): { slots: HarmonyChordSlot[]; sequence: HarmonySequenceStep[] } {
  const slots = generateHarmonySlots(seed, params, existingSlots);
  return {
    slots,
    sequence: generateHarmonySequence(hashU32(seed ^ 0x68bc21eb), params, existingSequence, slots),
  };
}

export function commitBaselineMap(args: {
  seed: number;
  rootMidi: number;
  scaleId: number;
  tension: number;
  existingSequence?: readonly HarmonySequenceStep[];
}): HarmonySequenceStep[] {
  const sequence = sanitizeHarmonySequence(args.existingSequence);
  return sequence.map((step, id) => {
    if (step.locked) return step;
    const baseline = buildBaselineHarmonyIntent({
      rootMidi: args.rootMidi,
      scaleId: args.scaleId,
      tension: args.tension,
      seed: args.seed,
      barIndex: id,
      phraseIndex: id,
    });
    return {
      ...step,
      id,
      enabled: true,
      mode: 'auto',
      degree: baseline.degree,
      quality: 'auto',
      intent: null,
      slotId: null,
      probability: 1,
    };
  });
}
