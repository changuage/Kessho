import type {
  HarmonyBassMode,
  HarmonyChordAlteration,
  HarmonyChordQuality,
  HarmonyControlSource,
  HarmonyControlStrength,
  HarmonyIntent,
  HarmonyRootMode,
  HarmonySequenceStep,
  HarmonySequenceStepMode,
  HarmonyProgression,
  HarmonyProgressionEvent,
  HarmonyProgressionDurationValue,
  HarmonyProgressionDurationUnit,
  ManualHarmonyControlMode,
  ManualHarmonyControlState,
  ResolvedHarmonyFrame,
  L4HarmonyStateExtension,
  HarmonyChordSlot,
  SharedHarmonyChord,
} from './harmony/harmonyTypes';
import {
  recognizeHarmonyCandidates,
  recognizeHarmonyIntentFromCandidates,
} from './harmony/chordRecognition';
import {
  DEFAULT_HARMONY_SCALE_INTERVALS,
  HARMONY_SCALE_INTERVALS,
} from './harmony/harmonyScaleIntervals';
import type { HarmonyRecognitionCandidate } from './harmony/harmonyTypes';
export type {
  HarmonyBassMode,
  HarmonyChordAlteration,
  HarmonyChordQuality,
  HarmonyChordExtension,
  HarmonyControlSource,
  HarmonyControlStrength,
  HarmonyIntent,
  HarmonyRootMode,
  HarmonySequenceStep,
  HarmonySequenceStepMode,
  HarmonyProgression,
  HarmonyProgressionEvent,
  HarmonyProgressionDurationValue,
  HarmonyProgressionDurationUnit,
  ManualHarmonyControlMode,
  ManualHarmonyControlState,
  ResolvedHarmonyFrame,
  L4HarmonyStateExtension,
  HarmonyChordSlot,
  LegacyHarmonyChordSlotInput,
  HarmonyCapturedContext,
  HarmonyDraftChord,
  HarmonyPlaybackBehavior,
  SharedHarmonyChord,
  SharedHarmonyChordSlot,
  HarmonyRecognitionCandidate,
} from './harmony/harmonyTypes';

export const HARMONY_SLOT_COUNT = 8 as const;
export const HARMONY_SEQUENCE_STEP_COUNT = 8 as const;
export const HARMONY_SEQUENCE_STEP_MIN = 3 as const;
export const HARMONY_POOL_MAX_NOTES = 8 as const;
/** Auto retains the authored exact voicing through this many semitones of root movement. */
export const HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES = 6 as const;
export const HARMONY_PROGRESSION_CAPACITY = 64 as const;
export const HARMONY_PROGRESSION_DURATION_VALUES = [1, 2, 4, 8] as const;

export const HARMONY_SLOT_TRIGGER_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','] as const;
export const HARMONY_NOTE_KEYS = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j'] as const;

/** Compatibility name retained for older callers of the Harmony control. */
export type HarmonyIntentSource = HarmonyControlSource;

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

// Stable wire IDs used by the Product Core snapshot ABI. Keep these explicit;
// array position must not silently change the native recipe meaning.
export const HARMONY_EXTENSION_IDS = Object.freeze({
  '6': 0, '7': 1, maj7: 2, '9': 3, '11': 4, '13': 5, six: 6, min7: 7,
  dom7: 8, add9: 9, nine: 10, sixNine: 11, add13: 12,
} as const);
export const HARMONY_ALTERATION_IDS = Object.freeze({
  b5: 0, '#5': 1, b9: 2, '#9': 3, '#11': 4, b13: 5, omit3: 6, omit5: 7,
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
  slot: 2,
} as const);

export const MANUAL_HARMONY_MODE_IDS = Object.freeze({
  audition: 0,
  control: 1,
  capture: 2,
} as const);

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

const EXTENSION_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  '6': [9],
  '7': [10],
  '9': [14],
  '11': [14, 17],
  '13': [14, 21],
  add13: [21],
  six: [9],
  min7: [10],
  dom7: [10],
  maj7: [11],
  add9: [14],
  nine: [14],
  sixNine: [9, 14],
};

const HARMONY_CHORD_ALTERATIONS: readonly HarmonyChordAlteration[] = [
  'b5',
  '#5',
  'b9',
  '#9',
  '#11',
  'b13',
  'omit3',
  'omit5',
] as const;

const CHROMATIC_ROOT_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

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

function sanitizeMidiVelocities(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const midi = Number(key);
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    result[String(midi)] = clamp(raw, 0, 1);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function replaceOrAddInterval(intervals: number[], source: readonly number[], replacements: readonly number[], fallback: number): void {
  let replaced = false;
  for (let index = 0; index < intervals.length; index += 1) {
    if (!source.includes(intervals[index]!)) continue;
    intervals[index] = replacements[0] ?? fallback;
    replaced = true;
    break;
  }
  for (let index = 1; index < replacements.length; index += 1) {
    const value = replacements[index]!;
    if (!intervals.includes(value)) intervals.push(value);
  }
  if (!replaced && !intervals.includes(fallback)) intervals.push(fallback);
}

function applyExtensionIntervals(baseIntervals: readonly number[], extensions: readonly string[]): number[] {
  const intervals = [...baseIntervals];
  for (const extension of extensions) {
    const extensionIntervals = EXTENSION_INTERVALS[extension];
    if (!extensionIntervals) continue;
    for (const interval of extensionIntervals) {
      if (!intervals.includes(interval)) intervals.push(interval);
    }
  }
  return intervals.sort((a, b) => a - b);
}

function applyAlterationIntervals(baseIntervals: readonly number[], alterations: readonly HarmonyChordAlteration[]): number[] {
  if (alterations.length === 0) return [...baseIntervals];
  const intervals = [...baseIntervals];
  for (const alteration of alterations) {
    if (alteration === 'b5') {
      replaceOrAddInterval(intervals, [7, 8], [6], 6);
    } else if (alteration === '#5') {
      replaceOrAddInterval(intervals, [7, 6], [8], 8);
    } else if (alteration === 'b9') {
      replaceOrAddInterval(intervals, [14, 15], [13], 13);
    } else if (alteration === '#9') {
      replaceOrAddInterval(intervals, [14, 13], [15], 15);
    } else if (alteration === '#11') {
      replaceOrAddInterval(intervals, [17], [18], 18);
    } else if (alteration === 'b13') {
      replaceOrAddInterval(intervals, [21], [20], 20);
    } else if (alteration === 'omit3') {
      for (let index = intervals.length - 1; index >= 0; index -= 1) {
        if ([3, 4].includes(pitchClass(intervals[index]!))) intervals.splice(index, 1);
      }
    } else if (alteration === 'omit5') {
      for (let index = intervals.length - 1; index >= 0; index -= 1) {
        if ([6, 7, 8].includes(pitchClass(intervals[index]!))) intervals.splice(index, 1);
      }
    }
  }
  return intervals.sort((a, b) => a - b);
}

export function buildHarmonyChordIntervals(intent: HarmonyIntent, args?: {
  rootMidi?: number;
  scaleId?: number;
  tension?: number;
}): number[] {
  const scaleId = args?.scaleId ?? 1;
  const tension = args?.tension ?? 0.35;
  const baseQualityIntervals = intent.quality === 'auto'
    ? [0, 2, 4, tension > 0.5 ? 6 : 7].map((degree) => scaleDegreeMidi(0, scaleId, degree, degree >= 7 ? 1 : 0))
    : QUALITY_INTERVALS[intent.quality] ?? QUALITY_INTERVALS.maj ?? [0, 4, 7];
  const intervals = applyAlterationIntervals(
    applyExtensionIntervals(baseQualityIntervals, intent.extensions),
    intent.alterations ?? [],
  );
  return intervals.filter((interval, index, values) => values.indexOf(interval) === index).sort((a, b) => a - b);
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
    alterations: [],
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
  const intent = defaultHarmonyIntent('slot', id % 7);
  const exactMidiNotes = resolveHarmonyIntentToNotePool({ intent, rootMidi: 60, scaleId: 1, tension: 0.35 });
  return {
    id: clamp(Math.round(id), 0, HARMONY_SLOT_COUNT - 1),
    name: `Slot ${id + 1}`,
    chord: {
      intent,
      intentSource: 'confirmed',
      exactMidiNotes,
      recognizedLabel: formatHarmonyIntentChordLabel(intent, { rootMidi: 60, scaleId: 1 }),
      playbackBehavior: 'auto',
      capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
    },
    locked: false,
  };
}

/** A stable empty slot used by the sanitizer for absent array positions. */
export function emptyHarmonyChordSlot(id: number): HarmonyChordSlot {
  return {
    id: clamp(Math.round(id), 0, HARMONY_SLOT_COUNT - 1),
    name: `Slot ${id + 1}`,
    chord: null,
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

export function defaultHarmonyProgressionEvent(id = 'harmony-event-0'): HarmonyProgressionEvent {
  return { id, source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 } };
}

export function defaultHarmonyProgression(): HarmonyProgression {
  return { version: 1, enabled: false, events: [defaultHarmonyProgressionEvent()], currentEventIndex: 0 };
}

function progressionEventId(value: unknown, index: number): string {
  const id = typeof value === 'string' && value.trim().length > 0 ? value.trim() : `harmony-event-${index}`;
  return id.slice(0, 64);
}

function progressionDurationUnit(value: unknown): HarmonyProgressionDurationUnit {
  return value === 'bar' ? 'bar' : 'phrase';
}

function progressionDurationValue(value: unknown): HarmonyProgressionDurationValue {
  const rounded = Math.round(finiteNumber(value, 1));
  return rounded === 2 || rounded === 4 || rounded === 8 ? rounded : 1;
}

export interface HarmonyProgressionMigrationDiagnostic {
  code: 'progression-capacity-exceeded';
  inputCount: number;
  retainedCount: number;
  discardedCount: number;
  capacity: typeof HARMONY_PROGRESSION_CAPACITY;
}

export interface HarmonyProgressionMigrationResult {
  progression: HarmonyProgression;
  diagnostics: readonly HarmonyProgressionMigrationDiagnostic[];
}

/**
 * Migrate/sanitize the sole authored progression and report bounded-input
 * diagnostics. Legacy sequence payloads are accepted as a version-0
 * migration and never become a second runtime authority.
 */
export function migrateHarmonyProgression(
  value: unknown,
  legacySequence?: unknown,
  legacyEnabled?: unknown,
): HarmonyProgressionMigrationResult {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const rawEvents = raw && Array.isArray(raw.events) ? raw.events : Array.isArray(legacySequence) ? legacySequence : [];
  const migratedFromLegacy = !(raw && Array.isArray(raw.events));
  const seen = new Set<string>();
  const events: HarmonyProgressionEvent[] = [];
  for (let index = 0; index < rawEvents.length && events.length < HARMONY_PROGRESSION_CAPACITY; index += 1) {
    const item = rawEvents[index];
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (migratedFromLegacy && record.enabled === false) continue;
    let id = progressionEventId(record.id, index);
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const durationRecord = record.duration && typeof record.duration === 'object' ? record.duration as Record<string, unknown> : null;
    const legacyMode = record.mode;
    const sourceRecord = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : null;
    // `sanitizeHarmonyProgression` can receive a legacy sequence that has
    // already passed through `sanitizeHarmonySequence` during URL decoding.
    // Preserve its normalized `mode: 'slot'` instead of demoting it to Auto
    // on the second migration pass.
    const source = sourceRecord?.type === 'slot' || legacyMode === 'slot' || legacyMode === 'slotCopy' || legacyMode === 'slotFollow'
      ? { type: 'slot' as const, slotId: clamp(finiteInteger(sourceRecord?.slotId ?? record.slotId, 0), 0, HARMONY_SLOT_COUNT - 1) }
      : { type: 'auto' as const };
    events.push({
      id,
      source,
      duration: {
        unit: progressionDurationUnit(durationRecord?.unit ?? (record.duration === 'bar' ? 'bar' : undefined)),
        value: progressionDurationValue(durationRecord?.value ?? record.durationBars ?? (typeof record.duration === 'number' ? record.duration : 1)),
      },
    });
  }
  const safeEvents = events.length > 0 ? events : [defaultHarmonyProgressionEvent()];
  const current = clamp(finiteInteger(raw?.currentEventIndex, 0), 0, safeEvents.length - 1);
  const diagnostics: HarmonyProgressionMigrationDiagnostic[] = rawEvents.length > HARMONY_PROGRESSION_CAPACITY
    ? [{
      code: 'progression-capacity-exceeded',
      inputCount: rawEvents.length,
      retainedCount: events.length,
      discardedCount: rawEvents.length - HARMONY_PROGRESSION_CAPACITY,
      capacity: HARMONY_PROGRESSION_CAPACITY,
    }]
    : [];
  return {
    progression: {
      version: 1,
      enabled: boolValue(raw?.enabled, Array.isArray(legacySequence) ? boolValue(legacyEnabled, false) : false),
      events: safeEvents,
      currentEventIndex: current,
    },
    diagnostics,
  };
}

/** Compatibility sanitizer for runtime callers that do not need diagnostics. */
export function sanitizeHarmonyProgression(value: unknown, legacySequence?: unknown, legacyEnabled?: unknown): HarmonyProgression {
  return migrateHarmonyProgression(value, legacySequence, legacyEnabled).progression;
}

/** Resolve the canonical event at an absolute transport position. Bar-based
 * events use the authoritative bars-per-phrase conversion; phrase context is
 * only a fallback when no absolute bar index is available. */
export function canonicalProgressionIndexAtPosition(
  progression: HarmonyProgression,
  args: { absoluteBarIndex?: number; phraseIndex?: number; barsPerPhrase?: number } = {},
): number {
  const events = progression.events;
  if (events.length === 0) return 0;
  const barsPerPhrase = Math.max(1, Math.round(args.barsPerPhrase ?? 4));
  const absoluteBarIndex = Number.isFinite(args.absoluteBarIndex)
    ? Math.max(0, args.absoluteBarIndex as number)
    : Math.max(0, Number.isFinite(args.phraseIndex) ? (args.phraseIndex as number) * barsPerPhrase : 0);
  const durations = events.map((event) => event.duration.unit === 'phrase' ? event.duration.value * barsPerPhrase : event.duration.value);
  const totalBars = Math.max(1, durations.reduce((sum, duration) => sum + duration, 0));
  let cursor = absoluteBarIndex % totalBars;
  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index]!;
    if (cursor < duration || index === durations.length - 1) return index;
    cursor -= duration;
  }
  return 0;
}

export type HarmonyProgressionCommand =
  | { type: 'insert'; afterId?: string | null }
  | { type: 'duplicate'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'delete'; id: string }
  | { type: 'setDuration'; id: string; unit: HarmonyProgressionDurationUnit; value: HarmonyProgressionDurationValue }
  | { type: 'setEnabled'; enabled: boolean };

/** Pure atomic reducer for Overview editing. Invalid commands return the
 * original object, making failed edits impossible to partially apply. */
export function reduceHarmonyProgression(progression: HarmonyProgression, command: HarmonyProgressionCommand): HarmonyProgression {
  const current = sanitizeHarmonyProgression(progression);
  const events = current.events.slice();
  if (command.type === 'setEnabled') return { ...current, enabled: command.enabled };
  if (command.type === 'insert') {
    if (events.length >= HARMONY_PROGRESSION_CAPACITY) return current;
    let eventId = `harmony-event-${events.length}`;
    let suffix = 1;
    while (events.some((item) => item.id === eventId)) eventId = `harmony-event-${events.length}-${suffix++}`;
    const event = defaultHarmonyProgressionEvent(eventId);
    const at = command.afterId == null ? events.length : events.findIndex((item) => item.id === command.afterId) + 1;
    if (at <= 0) return current;
    events.splice(Math.min(at, events.length), 0, event);
    return { ...current, events, currentEventIndex: current.currentEventIndex >= at ? current.currentEventIndex + 1 : current.currentEventIndex };
  }
  const index = events.findIndex((item) => item.id === command.id);
  if (index < 0) return current;
  if (command.type === 'duplicate') {
    if (events.length >= HARMONY_PROGRESSION_CAPACITY) return current;
    const usedIds = new Set(events.map((item) => item.id));
    let copyId = `${events[index]!.id}-copy`;
    let copySuffix = 2;
    while (usedIds.has(copyId)) copyId = `${events[index]!.id}-copy-${copySuffix++}`;
    const copy = { ...events[index]!, id: copyId, duration: { ...events[index]!.duration }, source: { ...events[index]!.source } } as HarmonyProgressionEvent;
    events.splice(index + 1, 0, copy);
    return { ...current, events, currentEventIndex: current.currentEventIndex > index ? current.currentEventIndex + 1 : current.currentEventIndex };
  }
  if (command.type === 'setDuration') {
    events[index] = { ...events[index]!, duration: { unit: command.unit, value: command.value } };
    return { ...current, events };
  }
  if (command.type === 'move') {
    const target = command.direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= events.length) return current;
    [events[index], events[target]] = [events[target]!, events[index]!];
    const currentEventIndex = current.currentEventIndex === index ? target : current.currentEventIndex === target ? index : current.currentEventIndex;
    return { ...current, events, currentEventIndex };
  }
  if (events.length <= 1) return current;
  events.splice(index, 1);
  const currentEventIndex = current.currentEventIndex > index
    ? current.currentEventIndex - 1
    : Math.min(current.currentEventIndex, events.length - 1);
  return { ...current, events, currentEventIndex };
}

export function makeHarmonyProgressionEventUnique(
  progression: HarmonyProgression,
  eventId: string,
  slots: readonly HarmonyChordSlot[],
): { progression: HarmonyProgression; slots: HarmonyChordSlot[] } | null {
  const event = progression.events.find((item) => item.id === eventId);
  if (!event || event.source.type !== 'slot') return null;
  const emptyIndex = slots.findIndex((slot) => slot.chord === null && !slot.locked);
  if (emptyIndex < 0) return null;
  const sourceSlot = slots[event.source.slotId];
  if (!sourceSlot?.chord) return null;
  // Copy only canonical fields so a legacy migration payload cannot re-enter
  // runtime state as a second top-level intent authority.
  const copied: HarmonyChordSlot = {
    id: emptyIndex,
    name: `Slot ${emptyIndex + 1}`,
    locked: false,
    chord: {
      ...sourceSlot.chord,
      intent: sourceSlot.chord.intent ? { ...sourceSlot.chord.intent } : null,
      exactMidiNotes: [...sourceSlot.chord.exactMidiNotes],
      capturedContext: { ...sourceSlot.chord.capturedContext },
    },
  };
  const nextSlots = slots.map((slot, index) => index === emptyIndex ? copied : slot);
  const nextProgression: HarmonyProgression = {
    ...sanitizeHarmonyProgression(progression),
    events: progression.events.map((item) => item.id === eventId
      ? { ...item, source: { type: 'slot' as const, slotId: emptyIndex } }
      : item),
  };
  return { progression: nextProgression, slots: nextSlots };
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
    effectiveRootMidiAnchor: rootMidi,
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
    alterations: arrayValue(record.alterations, (item) => enumValue(item, HARMONY_CHORD_ALTERATIONS, null as unknown as HarmonyChordAlteration)).slice(0, 8),
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
    const legacyIntent = record.intent ? sanitizeHarmonyIntent(record.intent, defaultHarmonyIntent('slot', id % 7)) : null;
    const hasExplicitChord = Object.prototype.hasOwnProperty.call(record, 'chord');
    const topLevelExactMidiNotes = normalizeMidiPool(arrayValue(
      record.exactMidiNotes ?? record.capturedMidiNotes,
      (entry) => typeof entry === 'number' ? entry : null,
    ));
    const rawChord = record.chord;
    let chord: SharedHarmonyChord | null = null;
    if (rawChord && typeof rawChord === 'object') {
      const chordRecord = rawChord as Record<string, unknown>;
      const chordIntent = chordRecord.intent
        ? sanitizeHarmonyIntent(chordRecord.intent, legacyIntent ?? defaultHarmonyIntent('slot', id % 7))
        : legacyIntent;
      const exactMidiNotes = normalizeMidiPool(arrayValue(
        chordRecord.exactMidiNotes ?? chordRecord.capturedMidiNotes,
        (entry) => typeof entry === 'number' ? entry : null,
      ));
      const exactRecognition = !chordIntent && exactMidiNotes.length > 0
        ? recognizeHarmonyIntentFromMidiPool({ midiNotes: exactMidiNotes, rootMidi: 60, scaleId: 1, tension: 0.35 })
        : null;
      const inferredIntent = exactRecognition?.quality === 'custom' ? null : exactRecognition;
      const semanticIntent = chordIntent ?? inferredIntent;
      if (semanticIntent || exactMidiNotes.length > 0) {
        const snapshot = exactMidiNotes.length > 0
          ? exactMidiNotes
          : resolveHarmonyIntentToNotePool({ intent: semanticIntent!, rootMidi: 60, scaleId: 1, tension: 0.35 });
        chord = {
          intent: semanticIntent,
          intentSource: semanticIntent
            ? (chordRecord.intentSource === 'inferred' || chordRecord.intentSource === 'confirmed'
              ? chordRecord.intentSource
              : chordIntent ? 'confirmed' : 'inferred')
            : null,
          exactMidiNotes: snapshot,
          exactMidiVelocities: sanitizeMidiVelocities(chordRecord.exactMidiVelocities),
          recognizedLabel: stringValue(
            chordRecord.recognizedLabel,
            semanticIntent
              ? formatHarmonyIntentChordLabel(semanticIntent, { rootMidi: 60, scaleId: 1 })
              : 'custom',
          ),
          playbackBehavior: enumValue(chordRecord.playbackBehavior, ['auto', 'relative', 'exact'] as const, 'auto'),
          capturedContext: (() => {
            const capturedRecord = chordRecord.capturedContext as Record<string, unknown> | null;
            const capturedTension = finiteNumber(capturedRecord?.tension, Number.NaN);
            return {
              rootMidi: finiteNumber(capturedRecord?.rootMidi, 60),
              rootMidiAnchor: finiteNumber(capturedRecord?.rootMidiAnchor, finiteNumber(capturedRecord?.rootMidi, 60)),
              scaleId: finiteInteger(capturedRecord?.scaleId, 1),
              ...(Number.isFinite(capturedTension) ? { tension: capturedTension } : {}),
            };
          })(),
        };
      }
    } else if (!hasExplicitChord && (legacyIntent || topLevelExactMidiNotes.length > 0)) {
      const legacyCaptured = legacyIntent?.capturedMidiNotes ?? [];
      const exactMidiNotes = topLevelExactMidiNotes.length > 0
        ? topLevelExactMidiNotes
        : legacyCaptured.length > 0
        ? normalizeMidiPool(legacyCaptured)
        : resolveHarmonyIntentToNotePool({ intent: legacyIntent!, rootMidi: 60, scaleId: 1, tension: 0.35 });
      const exactRecognition = legacyIntent
        ? null
        : recognizeHarmonyIntentFromMidiPool({ midiNotes: exactMidiNotes, rootMidi: 60, scaleId: 1, tension: 0.35 });
      const recognizedIntent = legacyIntent ?? (exactRecognition?.quality === 'custom' ? null : exactRecognition);
      chord = {
        intent: recognizedIntent,
        intentSource: legacyIntent ? 'confirmed' : recognizedIntent ? 'inferred' : null,
        exactMidiNotes,
        exactMidiVelocities: sanitizeMidiVelocities(record.exactMidiVelocities),
        recognizedLabel: recognizedIntent
          ? formatHarmonyIntentChordLabel(recognizedIntent, { rootMidi: 60, scaleId: 1 })
          : 'custom',
        playbackBehavior: legacyIntent?.preserveCapturedVoicing ? 'exact' : 'auto',
        capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
      };
    }
    return {
      id,
      name: stringValue(record.name, `Slot ${id + 1}`),
      chord,
      locked: boolValue(record.locked, false),
    };
  });
  return Array.from({ length: HARMONY_SLOT_COUNT }, (_, id) => {
    const match = slots.find((slot) => slot.id === id);
    return match ?? emptyHarmonyChordSlot(id);
  });
}

export function sanitizeHarmonySequence(value: unknown): HarmonySequenceStep[] {
  const steps = arrayValue(value, (item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = clamp(finiteInteger(record.id, 0), 0, HARMONY_SEQUENCE_STEP_COUNT - 1);
    const legacySlotMode = record.mode === 'slotCopy' || record.mode === 'slotFollow';
    const mode = legacySlotMode
      ? (record.slotId === null || record.slotId === undefined ? (record.intent ? 'intent' : 'auto') : 'slot')
      : enumValue(record.mode, Object.keys(HARMONY_SEQUENCE_MODE_IDS) as HarmonySequenceStepMode[], 'auto');
    return {
      id,
      enabled: boolValue(record.enabled, true),
      locked: boolValue(record.locked, false),
      mode,
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

export function sanitizeHarmonySequenceLength(value: unknown): number {
  return clamp(finiteInteger(value, HARMONY_SEQUENCE_STEP_COUNT), HARMONY_SEQUENCE_STEP_MIN, HARMONY_SEQUENCE_STEP_COUNT);
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
  const intervals = HARMONY_SCALE_INTERVALS[Math.round(args.scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
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
  sequenceLength?: number;
  sequence: readonly HarmonySequenceStep[];
  slots: readonly HarmonyChordSlot[];
  canonical?: boolean;
}): HarmonyIntent | null {
  if (!args.sequenceEnabled) return null;
  const sequenceLength = args.canonical
    ? clamp(finiteInteger(args.sequenceLength, args.sequence.length), 1, HARMONY_PROGRESSION_CAPACITY)
    : sanitizeHarmonySequenceLength(args.sequenceLength);
  const step = args.sequence[((Math.round(args.stepIndex) % sequenceLength) + sequenceLength) % sequenceLength];
  if (!step || !step.enabled || step.probability <= 0) return null;
  if (step.mode === 'slot' && step.slotId !== null) {
    const slot = args.slots[step.slotId];
    // `chord: null` is authoritative: an empty saved slot cannot fabricate a
    // fallback legacy intent or produce audible material.
    return slot?.chord?.intent ? { ...slot.chord.intent, source: 'sequence' } : null;
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
  return slot?.chord?.intent ? { ...slot.chord.intent, source: 'slot' } : null;
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
  const intervals = HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
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
  const baseRoot = intent.rootMode === 'degree'
    ? scaleDegreeMidi(args.rootMidi, args.scaleId, intent.degree)
    : 60 + pitchClass(intent.rootNote);
  const degreeRoot = baseRoot + (clamp(Math.round(intent.octave), 0, 8) - 4) * 12;
  const qualityIntervals = buildHarmonyChordIntervals(intent, {
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    tension: args.tension,
  });
  const spreadOctave = intent.spread > 0.66 ? 1 : 0;
  const raw = qualityIntervals.map((interval, index) => degreeRoot + interval + (index >= 3 ? spreadOctave * 12 : 0));
  if (intent.bassMode === 'root') raw.unshift(degreeRoot - 12);
  if (intent.bassMode === 'fifth') raw.unshift(degreeRoot - 5);
  if (intent.bassMode === 'captured' && intent.bassNote !== null) raw.unshift(intent.bassNote);
  return normalizeMidiPool(applyInversion(raw, intent.inversion));
}

function pitchClassSignatureForRoot(notes: readonly number[], rootPc: number): string {
  return [...new Set(notes.map((note) => (pitchClass(note) - rootPc + 12) % 12))]
    .sort((left, right) => left - right)
    .join(',');
}

function formatCapturedVoicingChordLabel(notes: readonly number[]): string {
  const pool = normalizeMidiPool(notes);
  if (pool.length === 0) return 'custom';
  const signatures: Record<string, string> = {
    '0,4,7': '',
    '0,3,7': 'm',
    '0,3,6': 'dim',
    '0,5,7': 'sus',
    '0,4,7,11': 'maj7',
    '0,3,7,10': 'm7',
    '0,4,7,10': '7',
    '0,2,4,7': 'add9',
    '0,4,7,9': '6',
    '0,2,4,7,9': '6/9',
    '0,2,4,7,10': '9',
    '0,2,3,7,10': 'm9',
    '0,2,4,7,11': 'maj9',
  };
  const rootCandidates = [pitchClass(pool[0] ?? 60)];
  for (const note of pool) {
    const pc = pitchClass(note);
    if (!rootCandidates.includes(pc)) rootCandidates.push(pc);
  }
  for (const rootPc of rootCandidates) {
    const suffix = signatures[pitchClassSignatureForRoot(pool, rootPc)];
    if (suffix !== undefined) return `${CHROMATIC_ROOT_LABELS[rootPc] ?? 'C'}${suffix}`;
  }
  const rootPc = rootCandidates[0] ?? 0;
  return `${CHROMATIC_ROOT_LABELS[rootPc] ?? 'C'} custom`;
}

export function recognizeHarmonyIntentFromMidiPool(args: {
  midiNotes: readonly number[];
  previousIntent?: HarmonyIntent | null;
  rootMidi: number;
  scaleId: number;
  tension: number;
}): HarmonyIntent {
  const previous = args.previousIntent ? sanitizeHarmonyIntent(args.previousIntent) : defaultHarmonyIntent('slot');
  return recognizeHarmonyIntentFromCandidates({
    midiNotes: args.midiNotes,
    previousIntent: previous,
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    tension: args.tension,
  });
}

/** Ranked recognition metadata for dual-representation capture and adopt UI. */
export function recognizeHarmonyCandidatesFromMidiPool(args: {
  midiNotes: readonly number[];
  previousIntent?: HarmonyIntent | null;
  rootMidi: number;
  scaleId: number;
  tension: number;
  engineContext?: { rootPitchClass?: number; quality?: HarmonyChordQuality; degree?: number };
  maxCandidates?: number;
}): HarmonyRecognitionCandidate[] {
  return recognizeHarmonyCandidates(args);
}

export function formatHarmonyIntentChordLabel(intent: HarmonyIntent, args?: {
  rootMidi?: number;
  scaleId?: number;
}): string {
  if (intent.preserveCapturedVoicing && intent.capturedMidiNotes.length > 0) {
    return formatCapturedVoicingChordLabel(intent.capturedMidiNotes);
  }
  const rootMidi = args?.rootMidi ?? 60;
  const scaleId = args?.scaleId ?? 1;
  const rootPitchClass = intent.rootMode === 'degree'
    ? pitchClass(scaleDegreeMidi(rootMidi, scaleId, intent.degree))
    : pitchClass(intent.rootNote);
  const root = CHROMATIC_ROOT_LABELS[rootPitchClass] ?? 'C';
  const extensions = new Set(intent.extensions);
  const alterations = (intent.alterations ?? []).join('');
  let quality = '';
  if (intent.quality === 'min') quality = 'm';
  else if (intent.quality === 'dim') quality = 'dim';
  else if (intent.quality === 'sus') quality = 'sus';
  else if (intent.quality === 'maj7') quality = extensions.has('9') ? 'maj9' : 'maj7';
  else if (intent.quality === 'min7') quality = extensions.has('9') ? 'm9' : 'm7';
  else if (intent.quality === 'dom7') quality = extensions.has('13') || extensions.has('add13') ? '13' : `7${alterations}`;
  else if (intent.quality === 'add9') quality = 'add9';
  else if (intent.quality === 'six') quality = '6';
  else if (intent.quality === 'sixNine') quality = '6/9';
  else if (intent.quality === 'nine') quality = '9';
  else if (intent.quality === 'quartal') quality = 'quartal';
  else if (intent.quality === 'cluster') quality = 'cluster';
  else if (intent.quality === 'custom') quality = 'custom';
  else if (intent.quality === 'auto') quality = 'auto';
  const extraExtensions = [...extensions].filter((extension) => {
    if (extension === '9' && (intent.quality === 'maj7' || intent.quality === 'min7')) return false;
    if ((extension === '13' || extension === 'add13') && intent.quality === 'dom7') return false;
    return !['six', '6', 'sixNine', 'add9', 'nine'].includes(extension);
  }).join('');
  return `${root}${quality}${intent.quality === 'dom7' || alterations.length === 0 ? '' : alterations}${extraExtensions}`;
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
    effectiveRootMidiAnchor: args.rootMidi,
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
  // Callers resolving an endpoint (A=0/B=100) must be able to override the
  // current authored slider value. The explicit runtime morph is authoritative
  // when present; state is only the fallback for ordinary frame resolution.
  const morphPercent = clamp(finiteNumber(args.morphPercent, finiteNumber(args.state?.harmonyMorphPercent, 0)), 0, 100);
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
  sequenceLength: number;
  sequence: readonly HarmonySequenceStep[];
  slots: readonly HarmonyChordSlot[];
  baselineIntent: HarmonyIntent;
  canonical?: boolean;
}): Pick<ResolvedHarmonyFrame, 'nextNotePool' | 'nextSource' | 'nextStepIndex'> {
  const sequenceLength = args.canonical
    ? clamp(finiteInteger(args.sequenceLength, args.sequence.length), 1, HARMONY_PROGRESSION_CAPACITY)
    : sanitizeHarmonySequenceLength(args.sequenceLength);
  const stepIndex = ((Math.round(args.stepIndex) % sequenceLength) + sequenceLength) % sequenceLength;
  const nextStepIndex = args.sequenceEnabled ? (stepIndex + 1) % sequenceLength : null;
  const nextIntent = nextStepIndex === null
    ? { ...args.baselineIntent, degree: (args.baselineIntent.degree + 3) % 7 }
    : resolveSequenceIntent({ sequenceEnabled: true, stepIndex: nextStepIndex, sequenceLength, sequence: args.sequence, slots: args.slots, canonical: args.canonical }) ?? args.baselineIntent;
  return {
    nextNotePool: resolveHarmonyIntentToNotePool({ intent: nextIntent, rootMidi: args.rootMidi, scaleId: args.scaleId, tension: args.tension }),
    nextSource: nextIntent.source,
    nextStepIndex,
  };
}

export function resolveProductHarmonyState(args: {
  state: Record<string, unknown> | undefined;
  rootMidi: number;
  /** Optional continuous anchor supplied by drift/adoption/morph hosts. */
  rootMidiAnchor?: number;
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
  const progressionValue = morphContext.bank === 'B'
    ? state.harmonyProgressionB ?? state.harmonyProgression
    : state.harmonyProgressionA ?? state.harmonyProgression;
  // Canonical progression is the sole runtime authority. Legacy sequence
  // fields are consumed only by preset/URL migration before this adapter.
  const progression = sanitizeHarmonyProgression(progressionValue ?? {
    version: 1,
    enabled: false,
    currentEventIndex: 0,
    events: Array.from({ length: HARMONY_SEQUENCE_STEP_COUNT }, (_, index) => ({
      id: `harmony-event-${index}`,
      source: { type: 'auto' as const },
      duration: { unit: 'phrase' as const, value: 1 as const },
    })),
  });
  const chordSequence: HarmonySequenceStep[] = progression.events.map((event, index) => {
    // This compatibility projection exists only for downstream ABI/UI readers;
    // it is never persisted or used as an authored decision source.
    const legacy = defaultHarmonySequenceStep(index);
    return event.source.type === 'slot'
      ? { ...legacy, id: index, enabled: true, mode: 'slot', slotId: event.source.slotId, probability: 1 }
      : { ...legacy, id: index, enabled: true, mode: 'auto', slotId: null, probability: 1 };
  });
  const chordSequenceEnabled = progression.enabled;
  const chordSequenceLength = Math.max(1, progression.events.length);
  const canonical = true;
  const hasCanonicalPosition = args.barIndex !== undefined || args.phraseIndex !== undefined;
  const canonicalPositionIndex = hasCanonicalPosition
    ? canonicalProgressionIndexAtPosition(progression, {
      absoluteBarIndex: args.barIndex,
      phraseIndex: args.phraseIndex,
      barsPerPhrase: finiteNumber(state.transportBarsPerPhrase, 4),
    })
    : progression.currentEventIndex;
  const rawChordSequenceStepIndex = canonicalPositionIndex;
  const chordSequenceStepIndex = rawChordSequenceStepIndex % chordSequenceLength;
  const baselineIntent = buildBaselineHarmonyIntent({
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    tension: args.tension,
    seed: args.seed,
    barIndex: args.barIndex ?? 0,
    phraseIndex: args.phraseIndex ?? 0,
  });
  const sequenceIntent = resolveSequenceIntent({ sequenceEnabled: chordSequenceEnabled, stepIndex: chordSequenceStepIndex, sequenceLength: chordSequenceLength, sequence: chordSequence, slots: chordSlots, canonical });
  const slotTriggerIntent = resolveSlotTriggerIntent({ manualControl, slots: chordSlots, morphPercent: morphContext.morphPercent });
  const manualControlIntent = resolveManualControlIntent({ manualControl, morphPercent: morphContext.morphPercent });
  const activeIntent = chooseActiveHarmonyIntent({ baselineIntent, sequenceIntent, slotTriggerIntent, manualControlIntent, morphPercent: morphContext.morphPercent });
  const nextFrame = resolveNextHarmonyFrame({
    rootMidi: args.rootMidi,
    scaleId: args.scaleId,
    tension: args.tension,
    sequenceEnabled: chordSequenceEnabled,
    stepIndex: chordSequenceStepIndex,
    sequenceLength: chordSequenceLength,
    sequence: chordSequence,
    slots: chordSlots,
    canonical,
    baselineIntent,
  });
  const resolvedHarmonyFrame: ResolvedHarmonyFrame = {
    activeSource: activeIntent.source,
    activeStepIndex: activeIntent.source === 'sequence' ? chordSequenceStepIndex : null,
    activeSlotId: activeIntent.source === 'slot' ? manualControl.activeSlotId : null,
    rootMidi: args.rootMidi,
    effectiveRootMidiAnchor: args.rootMidiAnchor ?? args.rootMidi,
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
    chordSequenceLength,
    chordSequenceStepIndex,
    progression: { ...progression, currentEventIndex: chordSequenceStepIndex },
    resolvedHarmonyFrame,
  };
}
