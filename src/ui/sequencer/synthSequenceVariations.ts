import type { ProductArpConfig } from '../../audio/productArpeggiator';
import type { ClockDivision } from '../../audio/drumSeqTypes';
import { CHORD_MAX_NOTES_PER_CELL, normalizeChord, normalizeChordNote, type Chord, type ChordNote } from '../../audio/harmony/chord';
import { sequencerClockDivisionToNumericValue } from '../../audio/sequencerClockDivisions';
import type { SerializedStepOverrides } from '../state';
import type { SerializedSequenceLanePresetState } from './sequencePresetLane';
import { createBitmapTriggerClip, deserializeTriggerClip, resolveTriggerClip, rotateTriggerClip, serializeTriggerClip } from './triggerClip';

/** Schema 2 stores Notes-lane cells; schema 1 stored per-step metadata and still loads. */
export const SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION = 2 as const;
export const SYNTH_SEQUENCE_VARIATION_IDS = ['A', 'B', 'C', 'D'] as const;
export type SynthSequenceVariationId = typeof SYNTH_SEQUENCE_VARIATION_IDS[number];
export type SynthSequenceVariationIndex = 0 | 1 | 2 | 3;

const ROTATABLE_VARIATION_OVERRIDE_KEYS = [
  'probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'nudge', 'slice', 'reverse',
] as const;

function rotateArray<T>(values: readonly T[], delta: number): T[] {
  if (values.length <= 1) return [...values];
  const shift = positiveModulo(delta, values.length);
  return values.map((_, index) => values[positiveModulo(index - shift, values.length)]!);
}

function rotateHitArray<T>(values: readonly T[], pattern: readonly boolean[], delta: number): T[] | null {
  const oldHits = pattern.map((enabled, step) => enabled ? step : -1).filter((step) => step >= 0);
  if (values.length !== oldHits.length || oldHits.length === 0) return null;
  const nextPattern = rotateArray(pattern, delta);
  const nextHits = nextPattern.map((enabled, step) => enabled ? step : -1).filter((step) => step >= 0);
  const next = Array.from({ length: values.length }, () => values[0]!);
  oldHits.forEach((oldStep, oldIndex) => {
    const nextStep = positiveModulo(oldStep + delta, pattern.length);
    const nextIndex = nextHits.indexOf(nextStep);
    if (nextIndex >= 0) next[nextIndex] = values[oldIndex]!;
  });
  return next;
}

/** Rotate a printed variation while preserving each value's trigger ownership. */
export function rotateSynthSequenceVariation(
  variation: SynthSequenceVariation,
  delta: number,
): SynthSequenceVariation {
  const steps = Math.max(1, Math.round(variation.steps));
  const safeDelta = positiveModulo(delta, steps);
  if (steps <= 1 || safeDelta === 0) return variation;
  const serializedClip = variation.lane.overrides.triggerClips?.[0];
  const clip = deserializeTriggerClip(serializedClip);
  const pattern = clip
    ? resolveTriggerClip(clip).slice(0, steps)
    : variation.cells.slice(0, steps).map((cell) => cell.kind !== 'rest');
  const overrides: SerializedStepOverrides = { ...variation.lane.overrides };
  const sourceRecord = variation.lane.overrides as unknown as Record<string, unknown>;
  const overrideRecord = overrides as unknown as Record<string, unknown>;
  for (const key of ROTATABLE_VARIATION_OVERRIDE_KEYS) {
    const sourceLanes = sourceRecord[key];
    const values = Array.isArray(sourceLanes) && Array.isArray(sourceLanes[0]) ? sourceLanes[0] as unknown[] : null;
    if (!values) continue;
    const hitBound = key === 'expression' || key === 'nudge'
      ? variation.lane.state.subLaneStates?.[key]?.followTriggerHits === true
      : key === 'pitch'
        ? variation.lane.state.pitchBindingMode !== 'sequence'
        : false;
    const rotated = hitBound
      ? rotateHitArray(values, pattern, safeDelta)
      : values.length === steps ? rotateArray(values, safeDelta) : null;
    if (rotated) {
      const lanes = Array.isArray(overrideRecord[key]) ? [...overrideRecord[key] as unknown[]] : [];
      lanes[0] = rotated;
      overrideRecord[key] = lanes;
    }
  }
  const nextClip = clip ? rotateTriggerClip(clip, safeDelta) : null;
  if (nextClip) {
    overrides.triggerClips = [serializeTriggerClip(nextClip)];
    overrides.triggerToggles = [[]];
  }
  return {
    ...variation,
    lane: { ...variation.lane, overrides },
    cells: rotateNotesCells(variation, pattern, safeDelta),
  };
}

/** Cells follow their owner: the step under Advance = Steps, the hit under Advance = Hits. */
function rotateNotesCells(variation: SynthSequenceVariation, pattern: readonly boolean[], delta: number): NotesCell[] {
  const { length, advance } = variation.notesLane;
  const owned = variation.cells.slice(0, length);
  const rotated = advance === 'hits'
    ? rotateHitArray(owned, pattern, delta)
    : length === pattern.length ? rotateArray(owned, delta) : null;
  return rotated ? [...rotated, ...variation.cells.slice(length)] : variation.cells;
}

/** The bank is persisted; its selection is deliberately UI-owned and transient. */
export interface SynthSequenceVariationPlaybackSelection {
  laneIndex: number;
  /** UI-only edit/play selection; never serialized into the bank. */
  selectedVariation: SynthSequenceVariationIndex;
}

export type SynthSequenceVariationSelection = SynthSequenceVariationPlaybackSelection;

export function selectSynthSequenceVariationInBank(
  bank: SynthSequenceVariationBank,
  variationId: SynthSequenceVariationId,
): SynthSequenceVariationBank {
  if (bank.chainEnabled) return bank;
  const index = SYNTH_SEQUENCE_VARIATION_IDS.indexOf(variationId);
  if (index < 0 || bank.playVariation === index) return bank;
  return { ...bank, playVariation: index as SynthSequenceVariationIndex };
}

export interface SynthVariationLane {
  /** A serialized lane copied through sequencePresetLane helpers (source lane 0). */
  overrides: SerializedStepOverrides;
  state: SerializedSequenceLanePresetState;
}

export type SynthVariationLaneInput = Omit<SynthVariationLane, 'overrides'> & {
  overrides?: SerializedStepOverrides;
};

export interface SynthVariationArpPayload {
  config: ProductArpConfig;
  spanBeats?: number;
}

export type LaneDirection = 'forward' | 'reverse' | 'pingpong';
export type NotesAdvance = 'steps' | 'hits';
export const SYNTH_NOTES_LANE_MAX_LENGTH = 32;
export const SYNTH_NOTES_CELL_COUNT = 32;

/** The Notes lane is its own sublane: a cell table with its own length, direction and Advance. */
export interface NotesLane {
  /** 1..32 */
  length: number;
  direction: LaneDirection;
  advance: NotesAdvance;
}

export type NotesCellKind = 'rest' | 'harmony' | 'chord';
export type NotesArticulation = 'chord' | 'arp';

export interface NotesCell {
  kind: NotesCellKind;
  /** Harmony cells: `midi` is a semitone interval from the part's harmony pitch, -48..48. */
  intervals?: ChordNote[];
  /** Chord cells: Follow resolves against the harmony frame; Fixed holds up to 32 absolute notes. */
  chord?: Chord;
  gateBeats: number;
  articulation: NotesArticulation;
  arp?: SynthVariationArpPayload;
}

export function createRestNotesCell(): NotesCell {
  return { kind: 'rest', gateBeats: 0, articulation: 'chord' };
}

export function createDefaultNotesLane(length: number): NotesLane {
  return { length: Math.max(1, Math.min(SYNTH_NOTES_LANE_MAX_LENGTH, Math.round(length))), direction: 'forward', advance: 'steps' };
}

/**
 * One plain note at a step. A Notes-mode lane prints absolute notes at its
 * root (a Fixed chord); every other lane rides the part's harmony pitch.
 */
export function createPlainNotesCell(lane: SynthVariationLane, gateBeats: number): NotesCell {
  const settings = lane.state.pitchSettings;
  const note: ChordNote = { midi: 0, velocity: 1 };
  if (settings?.mode === 'notes') {
    const root = Math.max(0, Math.min(127, Math.round(settings.root ?? 60)));
    return {
      kind: 'chord',
      chord: {
        behavior: 'fixed',
        degree: 0,
        quality: 'diatonic',
        extensions: [],
        voicing: { inversion: 0, spread: 0, register: 0, bass: 'inversion' },
        notes: [{ ...note, midi: root }],
      },
      gateBeats,
      articulation: 'chord',
    };
  }
  return { kind: 'harmony', intervals: [note], gateBeats, articulation: 'chord' };
}

export function notesCellNotes(cell: NotesCell): ChordNote[] {
  return cell.kind === 'harmony' ? cell.intervals ?? [] : cell.kind === 'chord' ? cell.chord?.notes ?? [] : [];
}

export function withNotesCellNotes(cell: NotesCell, notes: ChordNote[]): NotesCell {
  if (cell.kind === 'harmony') return { ...cell, intervals: notes };
  if (cell.kind === 'chord' && cell.chord) return { ...cell, chord: { ...cell.chord, notes } };
  return cell;
}

export function notesCellGateMax(cell: NotesCell): number {
  const longestVoice = Math.max(cell.gateBeats, ...notesCellNotes(cell).map((note) => note.gate ?? cell.gateBeats));
  return cell.gateBeats > 0 && longestVoice > cell.gateBeats ? 64 * cell.gateBeats / longestVoice : 64;
}

/** Keep per-note gates proportional when editing the shared cell length. */
export function withNotesCellGate(cell: NotesCell, length: number): NotesCell {
  const gateBeats = Number.isFinite(length) ? Math.max(0, Math.min(notesCellGateMax(cell), length)) : cell.gateBeats;
  const notes = notesCellNotes(cell).map((note) => ({
    ...note,
    gate: cell.gateBeats > 0 ? (note.gate ?? cell.gateBeats) * gateBeats / cell.gateBeats : gateBeats,
  }));
  return { ...withNotesCellNotes(cell, notes), gateBeats };
}

export interface SynthSequenceVariation {
  id: SynthSequenceVariationId;
  steps: number;
  spanBeats: number;
  lane: SynthVariationLane;
  notesLane: NotesLane;
  /** Always 32 cells; the Notes lane walks the first `notesLane.length`. */
  cells: NotesCell[];
}

export interface SynthSequenceVariationBank {
  schemaVersion: typeof SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION;
  phraseBeats: number;
  clockDiv: ClockDivision;
  chainEnabled: boolean;
  /** Index of the variation used when chain playback is disabled. */
  playVariation: SynthSequenceVariationIndex;
  chainOrder: SynthSequenceVariationId[];
  variations: Partial<Record<SynthSequenceVariationId, SynthSequenceVariation>>;
}

export type SynthSequenceVariationBanks = Array<SynthSequenceVariationBank | null>;

export interface SynthVariationCaptureNote {
  id?: string;
  /** Phrase phase, or an unwrapped offset from the capture origin for audio batches. */
  onsetBeats: number;
  durationBeats: number;
  pitch: number;
  velocity: number;
  sourceId?: number;
  chordGroupId?: string;
  /** A held input is included in a print snapshot until its noteoff arrives. */
  held?: boolean;
}

export interface SynthVariationPrintInput {
  phraseBeats: number;
  /** Lane state copied into the printed variation (Morph, Distance, Slice and Reverse are kept). */
  baseLane: SynthVariationLaneInput;
  notes: readonly SynthVariationCaptureNote[];
  /** Optional preferred resolution. Candidates are still restricted to supported clocks. */
  clockDiv?: ClockDivision;
  /** The one variation this print replaces. */
  targetVariation: SynthSequenceVariationId;
  /** The lane's current bank; every other variation is left untouched. */
  bank: SynthSequenceVariationBank | null;
}

export type SynthVariationPrintFailure =
  | 'invalid-phrase'
  | 'invalid-note'
  | 'unsupported-resolution'
  | 'capacity'
  | 'collision';

export interface SynthVariationPrintResult {
  accepted: boolean;
  bank: SynthSequenceVariationBank | null;
  failure?: SynthVariationPrintFailure;
  message?: string;
}

export class SynthSequenceVariationValidationError extends Error {
  readonly code = 'invalid-synth-sequence-variation-bank';

  constructor(message: string) {
    super(message);
    this.name = 'SynthSequenceVariationValidationError';
  }
}

const SUPPORTED_CLOCK_DIVISIONS: readonly ClockDivision[] = [
  '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32', '1/32T', '1/64',
];
const NUDGE_TOLERANCE = 1e-6;
const NOTE_EPSILON = 1e-5;
const MIN_VARIATION_STEPS = 2;
const MAX_VARIATION_STEPS = 32;
const MAX_VARIATIONS = 4;
export const SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES = 1024;

/** Apply an async print receipt only while its lane capture identity is current. */
export function isCurrentSynthVariationCommit(
  currentSerial: number,
  requestSerial: number,
  currentCapture: object | null,
  requestCapture: object,
): boolean {
  return currentSerial === requestSerial && currentCapture === requestCapture;
}

export function settleSynthVariationCommit(
  currentSerial: number,
  requestSerial: number,
  currentCapture: object | null,
  requestCapture: object,
): { accepted: boolean; clearPending: boolean; clearCapture: boolean } {
  const accepted = isCurrentSynthVariationCommit(currentSerial, requestSerial, currentCapture, requestCapture);
  return { accepted, clearPending: accepted, clearCapture: accepted };
}

/** Preserve independent lane indices when a printed trigger cell changes. */
export function variationLaneValuesAfterTriggerToggle(
  previousValues: readonly number[] | undefined,
  oldPattern: readonly boolean[],
  nextPattern: readonly boolean[],
  compactToHits: boolean,
  fallback: number,
): number[] {
  if (!compactToHits) return Array.isArray(previousValues) ? [...previousValues] : [];
  const oldHitSteps = oldPattern.flatMap((hit, index) => hit ? [index] : []);
  const nextHitSteps = nextPattern.flatMap((hit, index) => hit ? [index] : []);
  return nextHitSteps.map((hitStep) => {
    const oldIndex = oldHitSteps.indexOf(hitStep);
    return oldIndex >= 0
      ? previousValues?.[oldIndex] ?? fallback
      : fallback;
  });
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function invalid(message: string): never {
  throw new SynthSequenceVariationValidationError(message);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isVariationId(value: unknown): value is SynthSequenceVariationId {
  return typeof value === 'string' && (SYNTH_SEQUENCE_VARIATION_IDS as readonly string[]).includes(value);
}

function cloneLane(lane: SynthVariationLaneInput): SynthVariationLane {
  return {
    overrides: cloneJson(lane.overrides ?? {}),
    state: cloneJson(lane.state),
  };
}

function copyLaneField(
  overrides: SerializedStepOverrides,
  field: keyof SerializedStepOverrides,
  values: unknown,
): void {
  const record = overrides as unknown as Record<string, unknown>;
  const existing = record[field as string];
  const lanes = Array.isArray(existing) ? [...existing] : [];
  lanes[0] = values;
  record[field as string] = lanes;
}

const PRINT_OFF_SUBLANE = {
  enabled: false,
  steps: 1,
  direction: 'forward' as const,
  valueMode: 'sequence' as const,
};

/**
 * A printed variation keeps the base lane's Morph, Distance, Slice and Reverse
 * state. Pitch, Expression and Nudge are switched off because the printed
 * notes carry pitch, velocity and timing themselves.
 */
function configurePrintedLane(lane: SynthVariationLane, clockDiv: ClockDivision): void {
  const state = { ...lane.state };
  delete state.evolveConfig;
  delete state.playConfig;
  delete state.arpConfig;
  lane.state = {
    ...state,
    clockDiv,
    swing: 0,
    linked: false,
    subLaneStates: {
      ...state.subLaneStates,
      pitch: { ...PRINT_OFF_SUBLANE, scaleQuantize: false },
      expression: { ...PRINT_OFF_SUBLANE },
      nudge: { ...PRINT_OFF_SUBLANE },
    },
  };
}

function validCaptureNote(note: SynthVariationCaptureNote): boolean {
  if (!finite(note.onsetBeats) || !finite(note.durationBeats) || note.durationBeats < 0) return false;
  if (!finite(note.pitch) || note.pitch < 0 || note.pitch > 127) return false;
  if (!finite(note.velocity) || note.velocity < 0 || note.velocity > 1) return false;
  if (note.chordGroupId !== undefined && typeof note.chordGroupId !== 'string') return false;
  if (note.sourceId !== undefined && (!Number.isInteger(note.sourceId) || note.sourceId < 0 || note.sourceId > 255)) return false;
  return true;
}

/** A Fixed chord: exact absolute notes, no harmony intent. */
export function createFixedChord(notes: ChordNote[]): Chord {
  return {
    behavior: 'fixed',
    degree: 0,
    quality: 'diatonic',
    extensions: [],
    voicing: { inversion: 0, spread: 0, register: 0, bass: 'inversion' },
    notes,
  };
}

type PrintCandidate = SynthSequenceVariation | 'unsupported' | 'capacity' | 'collision';

/** Every attack becomes a Fixed-chord note at its offset from the owning step. */
function printCandidate(input: SynthVariationPrintInput, clockDiv: ClockDivision): PrintCandidate {
  const numericClock = sequencerClockDivisionToNumericValue(clockDiv, 0);
  const stepBeats = 4 / numericClock;
  const exactSteps = input.phraseBeats / stepBeats;
  const steps = Math.round(exactSteps);
  if (!Number.isFinite(exactSteps) || Math.abs(exactSteps - steps) > NUDGE_TOLERANCE) return 'unsupported';
  if (steps > MAX_VARIATION_STEPS) return 'capacity';
  if (steps < MIN_VARIATION_STEPS) return 'unsupported';

  const byStep = new Map<number, ChordNote[]>();
  for (const note of input.notes) {
    const phase = positiveModulo(note.onsetBeats, input.phraseBeats);
    const step = Math.min(steps - 1, Math.floor(phase / stepBeats + NUDGE_TOLERANCE));
    const offset = Math.max(0, phase - step * stepBeats);
    const printed: ChordNote = {
      midi: note.pitch,
      velocity: note.velocity,
      // A hold may cross the phrase boundary; keep its gate so the runtime releases at noteoff.
      gate: Math.min(64, note.durationBeats),
      ...(offset > NUDGE_TOLERANCE ? { offset } : {}),
      ...(note.sourceId === undefined ? {} : { destination: note.sourceId }),
    };
    const cell = byStep.get(step) ?? [];
    cell.push(printed);
    byStep.set(step, cell);
  }
  for (const notes of byStep.values()) {
    if (notes.length > CHORD_MAX_NOTES_PER_CELL) return 'collision';
    // One pitch cannot sound twice inside one cell; a finer grid separates the attacks.
    if (new Set(notes.map((note) => note.midi)).size !== notes.length) return 'collision';
  }

  const bits = Array.from({ length: steps }, () => false);
  const toggles: { step: number; value: boolean }[] = [];
  const cells: NotesCell[] = Array.from({ length: SYNTH_NOTES_CELL_COUNT }, createRestNotesCell);
  for (const [step, notes] of [...byStep.entries()].sort((left, right) => left[0] - right[0])) {
    notes.sort((left, right) => (left.offset ?? 0) - (right.offset ?? 0) || left.midi - right.midi);
    bits[step] = true;
    toggles.push({ step, value: true });
    cells[step] = {
      kind: 'chord',
      chord: createFixedChord(notes),
      gateBeats: Math.max(0, ...notes.map((note) => note.gate ?? 0)),
      articulation: 'chord',
    };
  }

  const lane = cloneLane(input.baseLane);
  const overrides = lane.overrides ?? {};
  lane.overrides = overrides;
  configurePrintedLane(lane, clockDiv);
  copyLaneField(overrides, 'triggerClips', serializeTriggerClip(createBitmapTriggerClip({
    steps,
    bits,
    origin: 'recorded',
    label: 'Synth variation',
  })));
  copyLaneField(overrides, 'triggerToggles', toggles);
  for (const field of [
    'ratchet', 'pitch', 'expression', 'nudge',
    'expressionDirection', 'nudgeDirection', 'pitchDirection', 'expressionRanges',
  ] as const) copyLaneField(overrides, field, null);
  copyLaneField(overrides, 'probability', Array.from({ length: steps }, () => 1));
  copyLaneField(overrides, 'trigCondition', Array.from({ length: steps }, () => [1, 1] as [number, number]));

  return {
    id: input.targetVariation,
    steps,
    spanBeats: steps * stepBeats,
    lane,
    notesLane: createDefaultNotesLane(steps),
    cells,
  };
}

/** Replace one variation, leaving the others byte-for-byte as they were. */
function mergePrintedVariation(
  input: SynthVariationPrintInput,
  printed: SynthSequenceVariation,
  clockDiv: ClockDivision,
): SynthSequenceVariationBank {
  const current = input.bank;
  const target = input.targetVariation;
  const targetIndex = SYNTH_SEQUENCE_VARIATION_IDS.indexOf(target) as SynthSequenceVariationIndex;
  const variations = { ...(current?.variations ?? {}), [target]: printed };
  const bank: SynthSequenceVariationBank = {
    schemaVersion: SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION,
    phraseBeats: input.phraseBeats,
    clockDiv: current?.clockDiv ?? clockDiv,
    chainEnabled: false,
    playVariation: targetIndex,
    chainOrder: current && current.chainOrder.length > 0 ? current.chainOrder : [target],
    variations,
  };
  if (current?.chainEnabled) {
    // A playing chain keeps playing and keeps filling the phrase, so its length follows its spans.
    const phraseBeats = current.chainOrder.reduce((sum, id) => sum + (variations[id]?.spanBeats ?? 0), 0);
    return { ...bank, chainEnabled: true, phraseBeats, playVariation: current.playVariation };
  }
  return bank;
}

/**
 * Print a take into `targetVariation` and merge it into the current bank.
 * Picks the coarsest supported grid of at most 32 steps that holds every attack.
 */
export function autoPrintSynthSequenceVariation(input: SynthVariationPrintInput): SynthVariationPrintResult {
  if (!finite(input.phraseBeats) || input.phraseBeats <= 0) {
    return { accepted: false, bank: null, failure: 'invalid-phrase', message: 'phraseBeats must be positive' };
  }
  if (!isVariationId(input.targetVariation)) {
    return { accepted: false, bank: null, failure: 'invalid-note', message: 'targetVariation must be A-D' };
  }
  if (input.notes.some((note) => !validCaptureNote(note))) {
    return { accepted: false, bank: null, failure: 'invalid-note', message: 'capture notes are invalid' };
  }
  let sawCapacity = false;
  let sawCollision = false;
  for (const clockDiv of SUPPORTED_CLOCK_DIVISIONS) {
    const candidate = printCandidate(input, clockDiv);
    if (candidate === 'capacity') sawCapacity = true;
    else if (candidate === 'collision') sawCollision = true;
    else if (candidate !== 'unsupported') return { accepted: true, bank: mergePrintedVariation(input, candidate, clockDiv) };
  }
  return {
    accepted: false,
    bank: null,
    failure: sawCollision ? 'collision' : sawCapacity ? 'capacity' : 'unsupported-resolution',
    message: sawCollision
      ? 'the same pitch is attacked twice inside one grid step'
      : 'capture cannot fit a supported 32-step variation grid',
  };
}

function normalizeArp(value: unknown, label: string): SynthVariationArpPayload {
  const source = value as Partial<SynthVariationArpPayload> | null;
  if (!source || typeof source !== 'object' || !source.config) invalid(`${label} has an invalid arp payload`);
  if (source.spanBeats !== undefined && (!finite(source.spanBeats) || source.spanBeats <= 0)) {
    invalid(`${label} has an invalid arp spanBeats`);
  }
  return {
    config: cloneJson(source.config),
    ...(source.spanBeats === undefined ? {} : { spanBeats: source.spanBeats }),
  };
}

function normalizeGateBeats(value: unknown, label: string): number {
  if (!finite(value) || value < 0 || value > 64) invalid(`${label} has an invalid gateBeats`);
  return value;
}

function normalizeNotesCell(raw: unknown, index: number): NotesCell {
  const label = `cells[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(`${label} must be an object`);
  const source = raw as Partial<NotesCell>;
  if (source.kind !== 'rest' && source.kind !== 'harmony' && source.kind !== 'chord') invalid(`${label} has an invalid kind`);
  if (source.articulation !== 'chord' && source.articulation !== 'arp') invalid(`${label} has an invalid articulation`);
  const cell: NotesCell = {
    kind: source.kind,
    gateBeats: normalizeGateBeats(source.gateBeats, label),
    articulation: source.articulation,
  };
  if (source.kind === 'harmony') {
    const intervals = (Array.isArray(source.intervals) ? source.intervals : [])
      .map((note) => normalizeChordNote(note, [-48, 48]));
    if (intervals.some((note) => note === null) || intervals.length > CHORD_MAX_NOTES_PER_CELL) invalid(`${label} has invalid intervals`);
    cell.intervals = intervals.length > 0 ? intervals as ChordNote[] : [{ midi: 0, velocity: 1 }];
  } else if (source.kind === 'chord') {
    const chord = normalizeChord(source.chord, { maxNotes: CHORD_MAX_NOTES_PER_CELL });
    if (!chord) invalid(`${label} has an invalid chord`);
    cell.chord = chord;
  }
  if (source.arp !== undefined) cell.arp = normalizeArp(source.arp, label);
  if (source.articulation === 'arp' && !cell.arp) invalid(`${label} needs an arp payload`);
  return cell;
}

function normalizeNotesLane(raw: unknown, id: SynthSequenceVariationId): NotesLane {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(`variation ${id} is missing notesLane`);
  const source = raw as Partial<NotesLane>;
  if (!finite(source.length) || !Number.isInteger(source.length) || source.length < 1 || source.length > SYNTH_NOTES_LANE_MAX_LENGTH) {
    invalid(`variation ${id} notesLane.length must be an integer in [1, ${SYNTH_NOTES_LANE_MAX_LENGTH}]`);
  }
  if (source.direction !== 'forward' && source.direction !== 'reverse' && source.direction !== 'pingpong') {
    invalid(`variation ${id} notesLane.direction is invalid`);
  }
  if (source.advance !== 'steps' && source.advance !== 'hits') invalid(`variation ${id} notesLane.advance is invalid`);
  return { length: source.length, direction: source.direction, advance: source.advance };
}

function normalizeCells(raw: unknown, id: SynthSequenceVariationId): NotesCell[] {
  if (raw === undefined) return Array.from({ length: SYNTH_NOTES_CELL_COUNT }, createRestNotesCell);
  if (!Array.isArray(raw) || raw.length > SYNTH_NOTES_CELL_COUNT) invalid(`variation ${id} cells must be an array of at most ${SYNTH_NOTES_CELL_COUNT}`);
  return Array.from({ length: SYNTH_NOTES_CELL_COUNT }, (_, index) => (
    index < raw.length ? normalizeNotesCell(raw[index], index) : createRestNotesCell()
  ));
}

/** Which steps fire, from the lane's trigger clip or toggles. */
export function variationTriggerMask(overrides: SerializedStepOverrides, steps: number): number {
  const clip = deserializeTriggerClip(overrides.triggerClips?.[0] ?? null);
  if (clip) {
    return resolveTriggerClip(clip)
      .slice(0, steps)
      .reduce((mask, enabled, step) => enabled ? mask | (1 << step) : mask, 0) >>> 0;
  }
  let mask = 0;
  const toggles = Array.isArray(overrides.triggerToggles?.[0]) ? overrides.triggerToggles[0] : [];
  for (const toggle of toggles as { step: number; value: unknown }[]) {
    if (toggle && Number.isInteger(toggle.step) && toggle.step >= 0 && toggle.step < steps) {
      if (typeof toggle.value !== 'boolean') invalid(`Invalid trigger toggle at step ${toggle.step}`);
      if (toggle.value) mask |= 1 << toggle.step;
      else mask &= ~(1 << toggle.step);
    }
  }
  return mask >>> 0;
}

interface LegacyChordInterval { intervalSemitones: number; velocity: number; gateBeats?: number }
interface LegacyStepMetadata {
  mode: 'note' | 'chord' | 'arp';
  gateBeats: number;
  followHarmony?: boolean;
  chord?: { intervals: LegacyChordInterval[]; followHarmony?: boolean };
  arp?: SynthVariationArpPayload;
}

function legacyMetadata(raw: unknown, key: string): LegacyStepMetadata {
  if (!raw || typeof raw !== 'object') invalid(`stepMetadata ${key} must be an object`);
  const source = raw as Partial<LegacyStepMetadata>;
  if (source.mode !== 'note' && source.mode !== 'chord' && source.mode !== 'arp') invalid(`stepMetadata ${key} has an invalid mode`);
  if (!finite(source.gateBeats) || source.gateBeats < 0) invalid(`stepMetadata ${key} has an invalid gateBeats`);
  if (source.followHarmony !== undefined && typeof source.followHarmony !== 'boolean') invalid(`stepMetadata ${key} has an invalid followHarmony flag`);
  const chord = source.chord;
  if (chord !== undefined) {
    const valid = chord && typeof chord === 'object'
      && Array.isArray(chord.intervals) && chord.intervals.length > 0 && chord.intervals.length <= CHORD_MAX_NOTES_PER_CELL
      && (chord.followHarmony === undefined || typeof chord.followHarmony === 'boolean')
      && chord.intervals.every((interval) => finite(interval.intervalSemitones)
        && interval.intervalSemitones >= -48 && interval.intervalSemitones <= 48
        && finite(interval.velocity) && interval.velocity >= 0 && interval.velocity <= 1
        && (interval.gateBeats === undefined || (finite(interval.gateBeats) && interval.gateBeats >= 0)));
    if (!valid) invalid(`stepMetadata ${key} has an invalid chord payload`);
  }
  return source as LegacyStepMetadata;
}

/**
 * Schema 1 stored step content by trigger step. An inactive trigger is a Rest
 * cell; a Notes-mode step that does not follow harmony is a Fixed chord at
 * root + interval; every other active step is a Harmony cell.
 */
function cellsFromLegacyStepMetadata(stepMetadata: unknown, steps: number, lane: SynthVariationLane): NotesCell[] {
  if (stepMetadata !== undefined && (!stepMetadata || typeof stepMetadata !== 'object' || Array.isArray(stepMetadata))) {
    invalid('stepMetadata must be an object');
  }
  const records = (stepMetadata ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(records)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= steps) invalid(`stepMetadata index ${key} is outside variation steps`);
  }
  const mask = variationTriggerMask(lane.overrides ?? {}, steps);
  const pitchSettings = lane.state.pitchSettings;
  const notesMode = pitchSettings?.mode === 'notes';
  const root = Math.max(0, Math.min(127, finite(pitchSettings?.root) ? pitchSettings.root : 60));
  return Array.from({ length: SYNTH_NOTES_CELL_COUNT }, (_, step) => {
    const raw = records[String(step)];
    const metadata = raw === undefined ? undefined : legacyMetadata(raw, String(step));
    const active = step < steps && (mask & (1 << step)) !== 0;
    const withChord = metadata?.mode === 'chord' || metadata?.mode === 'arp';
    const intervals: LegacyChordInterval[] = withChord && metadata?.chord?.intervals.length
      ? metadata.chord.intervals
      : [{ intervalSemitones: 0, velocity: 1 }];
    const followHarmony = metadata?.followHarmony ?? metadata?.chord?.followHarmony ?? false;
    const fixed = notesMode && !followHarmony;
    const toNote = (interval: LegacyChordInterval, midi: number): ChordNote => ({
      midi,
      velocity: interval.velocity,
      ...(interval.gateBeats === undefined ? {} : { gate: interval.gateBeats }),
    });
    const cell: NotesCell = {
      kind: !active ? 'rest' : fixed ? 'chord' : 'harmony',
      gateBeats: normalizeGateBeats(metadata?.gateBeats ?? 0, `stepMetadata ${step}`),
      articulation: metadata?.mode === 'arp' ? 'arp' : 'chord',
    };
    if (cell.kind === 'harmony') cell.intervals = intervals.map((interval) => toNote(interval, interval.intervalSemitones));
    if (cell.kind === 'chord') {
      cell.chord = createFixedChord(intervals.map((interval) => toNote(interval, Math.min(127, Math.max(0, root + interval.intervalSemitones)))));
    }
    if (metadata?.arp !== undefined) cell.arp = normalizeArp(metadata.arp, `stepMetadata ${step}`);
    if (metadata?.mode === 'arp' && !cell.arp) invalid(`stepMetadata ${step} needs an arp payload`);
    return cell;
  });
}

function normalizeVariation(
  value: unknown,
  id: SynthSequenceVariationId,
  bankClockDiv: ClockDivision,
  schemaVersion: number,
): SynthSequenceVariation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`variation ${id} must be an object`);
  const source = value as Partial<SynthSequenceVariation> & { stepMetadata?: unknown };
  if (!source.lane || typeof source.lane !== 'object' || !source.lane.state) invalid(`variation ${id} is missing serialized lane data`);
  const lane = source.lane as SynthVariationLane;
  if (Array.isArray(lane.state) || typeof lane.state !== 'object') invalid(`variation ${id} has invalid lane state`);
  if (lane.overrides !== undefined && (Array.isArray(lane.overrides) || typeof lane.overrides !== 'object')) {
    invalid(`variation ${id} has invalid serialized overrides`);
  }
  // A variation may run its own grid; the bank clock is the default.
  const clockDiv = lane.state.clockDiv ?? bankClockDiv;
  if (!SUPPORTED_CLOCK_DIVISIONS.includes(clockDiv)) invalid(`variation ${id} lane clockDiv is unsupported`);
  const steps = finite(source.steps) && Number.isInteger(source.steps) ? source.steps : 0;
  const spanBeats = finite(source.spanBeats) ? source.spanBeats : 0;
  const expectedSpanBeats = steps * 4 / sequencerClockDivisionToNumericValue(clockDiv, 0);
  if (steps < MIN_VARIATION_STEPS || steps > MAX_VARIATION_STEPS || spanBeats <= 0 || Math.abs(spanBeats - expectedSpanBeats) > NUDGE_TOLERANCE) {
    invalid(`variation ${id} has inconsistent steps/spanBeats`);
  }
  if (lane.state.pitchBindingMode !== undefined
    && lane.state.pitchBindingMode !== 'polyrhythmic'
    && lane.state.pitchBindingMode !== 'linked'
    && lane.state.pitchBindingMode !== 'sequence') {
    invalid(`variation ${id} has an invalid pitchBindingMode`);
  }
  const normalizedLane = { overrides: cloneJson(lane.overrides ?? {}), state: cloneJson(lane.state) };
  const legacy = schemaVersion === 1;
  return {
    id,
    steps,
    spanBeats,
    lane: normalizedLane,
    notesLane: legacy ? createDefaultNotesLane(steps) : normalizeNotesLane(source.notesLane, id),
    cells: legacy ? cellsFromLegacyStepMetadata(source.stepMetadata, steps, normalizedLane) : normalizeCells(source.cells, id),
  };
}

export function normalizeSynthSequenceVariationBank(value: unknown): SynthSequenceVariationBank | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('variation bank must be an object');
  const source = value as Partial<Omit<SynthSequenceVariationBank, 'schemaVersion'>> & { schemaVersion?: number };
  const schemaVersion = source.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION) invalid('unsupported variation bank schemaVersion');
  if (!finite(source.phraseBeats) || source.phraseBeats <= 0) invalid('variation bank phraseBeats must be positive');
  if (!SUPPORTED_CLOCK_DIVISIONS.includes(source.clockDiv as ClockDivision)) invalid('variation bank clockDiv is unsupported');
  const clockDiv = source.clockDiv as ClockDivision;
  if (!Array.isArray(source.chainOrder) || source.chainOrder.length > MAX_VARIATIONS) invalid('variation bank chainOrder is invalid');
  const chainOrder: SynthSequenceVariationId[] = [];
  for (const id of source.chainOrder) {
    if (!isVariationId(id) || chainOrder.includes(id)) invalid('variation bank chainOrder contains an invalid or duplicate id');
    chainOrder.push(id);
  }
  if (typeof source.chainEnabled !== 'boolean') invalid('variation bank chainEnabled is required');
  if (!finite(source.playVariation) || !Number.isInteger(source.playVariation) || source.playVariation < 0 || source.playVariation > 3) invalid('variation bank playVariation is invalid');
  const variations: Partial<Record<SynthSequenceVariationId, SynthSequenceVariation>> = {};
  if (!source.variations || typeof source.variations !== 'object' || Array.isArray(source.variations)) invalid('variation bank variations is required');
  for (const key of Object.keys(source.variations)) {
    if (!isVariationId(key)) invalid(`variation ${key} is not a variation id`);
    variations[key] = normalizeVariation(source.variations[key], key, clockDiv, schemaVersion);
  }
  if (chainOrder.some((id) => variations[id] === undefined)) invalid('variation bank chainOrder references a missing variation');
  if (source.chainEnabled && chainOrder.length === 0) invalid('enabled variation chain is empty');
  // Variations are independent; only a playing chain must fill the phrase.
  if (source.chainEnabled) {
    const spanSum = chainOrder.reduce((sum, id) => sum + (variations[id]?.spanBeats ?? 0), 0);
    if (Math.abs(spanSum - source.phraseBeats) > NUDGE_TOLERANCE) invalid('variation spans do not cover phraseBeats');
  }
  const playVariation = source.playVariation as SynthSequenceVariationIndex;
  const playVariationId = SYNTH_SEQUENCE_VARIATION_IDS[playVariation];
  if (Object.keys(variations).length > 0 && !playVariationId) invalid('playVariation is outside the variation bank');
  if (playVariationId && Object.keys(variations).length > 0 && !variations[playVariationId]) invalid('playVariation is not populated');
  return {
    schemaVersion: SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION,
    phraseBeats: source.phraseBeats,
    clockDiv,
    chainEnabled: source.chainEnabled,
    playVariation,
    chainOrder,
    variations,
  };
}

/** True while the bank has not been edited: used to commit an async print only against the bank it was armed on. */
export function isSameSynthSequenceVariationBank(
  left: SynthSequenceVariationBank | null | undefined,
  right: SynthSequenceVariationBank | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function serializeSynthSequenceVariationBank(
  bank: SynthSequenceVariationBank | null | undefined,
): SynthSequenceVariationBank | null {
  const normalized = normalizeSynthSequenceVariationBank(bank);
  return normalized ? cloneJson(normalized) : null;
}

export function normalizeSynthSequenceVariationBanks(value: unknown, laneCount = 4): SynthSequenceVariationBanks {
  if (value === undefined || value === null) return createDefaultSynthSequenceVariationBanks(laneCount);
  if (!Array.isArray(value)) invalid('variation banks must be an array');
  const values = value;
  return Array.from({ length: Math.max(0, laneCount) }, (_, laneIndex) => (
    normalizeSynthSequenceVariationBank(values[laneIndex])
  ));
}

export function serializeSynthSequenceVariationBanks(
  banks: readonly (SynthSequenceVariationBank | null)[] | undefined,
  laneCount = 4,
): SynthSequenceVariationBanks {
  return Array.from({ length: Math.max(0, laneCount) }, (_, laneIndex) => (
    serializeSynthSequenceVariationBank(banks?.[laneIndex])
  ));
}

export function createDefaultSynthSequenceVariationBanks(laneCount = 4): SynthSequenceVariationBanks {
  return Array.from({ length: Math.max(0, laneCount) }, () => null);
}

interface OpenCaptureNote {
  inputId: string;
  note: SynthVariationCaptureNote;
  absoluteOnsetBeats: number;
}

interface StoredCaptureNote {
  note: SynthVariationCaptureNote;
  insertedAtBeat: number;
}

export interface SynthSequenceCaptureScratchSnapshot {
  phraseBeats: number;
  recording: boolean;
  stopped: boolean;
  clockBeat: number;
  notes: SynthVariationCaptureNote[];
  heldInputIds: string[];
  overflowed: boolean;
}

/**
 * Beat-relative looping capture. Closed attacks are swept by onset phase; open
 * input IDs stay alive across wraps and are never retriggered by the sweep.
 */
export class SynthSequenceCaptureScratch {
  readonly phraseBeats: number;
  private readonly closedNotes: StoredCaptureNote[] = [];
  private readonly openNotes = new Map<string, OpenCaptureNote[]>();
  private originBeat = 0;
  private sweptThroughBeat = 0;
  private clockBeat = 0;
  private recording = false;
  private stopped = false;
  private nextId = 1;
  private overflowed = false;

  constructor(phraseBeats: number) {
    if (!finite(phraseBeats) || phraseBeats <= 0) throw new RangeError('phraseBeats must be positive');
    this.phraseBeats = phraseBeats;
  }

  start(originBeat: number, previousNotes: readonly SynthVariationCaptureNote[] = []): void {
    if (!finite(originBeat)) throw new RangeError('originBeat must be finite');
    if (previousNotes.length > SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES) throw new RangeError('previous capture exceeds scratch capacity');
    this.closedNotes.length = 0;
    this.closedNotes.push(...cloneJson(previousNotes).map((note) => ({
      note,
      insertedAtBeat: originBeat - this.phraseBeats,
    })));
    this.openNotes.clear();
    this.originBeat = originBeat;
    this.sweptThroughBeat = originBeat;
    this.clockBeat = originBeat;
    this.recording = true;
    this.stopped = false;
    this.overflowed = false;
  }

  private activeNoteCount(): number {
    let count = 0;
    for (const notes of this.openNotes.values()) count += notes.length;
    return count;
  }

  private sweep(fromBeat: number, toBeat: number): void {
    if (toBeat <= fromBeat) return;
    const distance = toBeat - fromBeat;
    if (distance >= this.phraseBeats) {
      this.closedNotes.length = 0;
      return;
    }
    const start = positiveModulo(fromBeat - this.originBeat, this.phraseBeats);
    const end = positiveModulo(toBeat - this.originBeat, this.phraseBeats);
    const wraps = end <= start;
    for (let index = this.closedNotes.length - 1; index >= 0; index -= 1) {
      const entry = this.closedNotes[index]!;
      if (entry.insertedAtBeat >= fromBeat) continue;
      const onset = positiveModulo(entry.note.onsetBeats, this.phraseBeats);
      const inside = wraps ? onset >= start || onset < end : onset >= start && onset < end;
      if (inside) this.closedNotes.splice(index, 1);
    }
  }

  advance(clockBeat: number): void {
    if (!finite(clockBeat) || !this.recording || clockBeat < this.sweptThroughBeat) return;
    this.sweep(this.sweptThroughBeat, clockBeat);
    this.sweptThroughBeat = clockBeat;
    this.clockBeat = clockBeat;
  }

  /** Rebase an audio origin before the first local phrase has advanced. */
  setOriginBeat(originBeat: number): boolean {
    if (!finite(originBeat) || this.closedNotes.length > 0 || this.activeNoteCount() > 0) return false;
    const delta = originBeat - this.originBeat;
    if (!finite(delta)) return false;
    this.originBeat = originBeat;
    this.sweptThroughBeat += delta;
    this.clockBeat += delta;
    return true;
  }

  noteOn(inputId: string, note: Omit<SynthVariationCaptureNote, 'onsetBeats' | 'durationBeats'>, clockBeat: number): string {
    if (!this.recording || !inputId || !finite(clockBeat)) return '';
    this.advance(clockBeat);
    if (this.closedNotes.length + this.activeNoteCount() >= SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES) {
      this.overflowed = true;
      return '';
    }
    const id = note.id ?? `${inputId}:${this.nextId++}`;
    const open: OpenCaptureNote = {
      inputId,
      absoluteOnsetBeats: clockBeat,
      note: { ...cloneJson(note), id, onsetBeats: positiveModulo(clockBeat - this.originBeat, this.phraseBeats), durationBeats: 0, held: true },
    };
    const notes = this.openNotes.get(inputId) ?? [];
    notes.push(open);
    this.openNotes.set(inputId, notes);
    return id;
  }

  noteOff(inputId: string, clockBeat: number): boolean {
    if (!finite(clockBeat)) return false;
    const notes = this.openNotes.get(inputId);
    const open = notes?.pop();
    if (!open) return false;
    this.advance(clockBeat);
    const durationBeats = Math.max(0, clockBeat - open.absoluteOnsetBeats);
    this.closedNotes.push({
      note: { ...open.note, durationBeats, held: false },
      insertedAtBeat: clockBeat,
    });
    if (notes && notes.length > 0) this.openNotes.set(inputId, notes);
    else this.openNotes.delete(inputId);
    return true;
  }

  private appendPhaseNotes(notes: readonly SynthVariationCaptureNote[], insertedAtBeat: number): number {
    const available = SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES
      - this.closedNotes.length
      - this.activeNoteCount();
    if (notes.length > available) {
      this.overflowed = true;
      return 0;
    }
    for (const note of notes) {
      this.closedNotes.push({
        note: {
          ...cloneJson(note),
          onsetBeats: positiveModulo(note.onsetBeats, this.phraseBeats),
          held: false,
        },
        insertedAtBeat,
      });
    }
    return notes.length;
  }

  /** Add a generated event with a phrase-relative onset at the current watermark. */
  ingest(note: SynthVariationCaptureNote): boolean {
    if (!this.recording || !validCaptureNote(note)) return false;
    return this.appendPhaseNotes([note], this.sweptThroughBeat) === 1;
  }

  /**
   * Add an audio batch whose onsetBeats values are unwrapped offsets from the
   * capture origin. The clock boundary sweeps first, then only the last phrase
   * window is retained; insertion never advances into a future pass.
   */
  ingestBatch(notes: readonly SynthVariationCaptureNote[], clockBeat: number): number {
    if (!this.recording || !finite(clockBeat) || clockBeat < this.sweptThroughBeat) return 0;
    if (clockBeat > this.sweptThroughBeat) this.advance(clockBeat);
    if (notes.some((note) => !validCaptureNote(note))) return 0;
    const elapsedBeat = this.sweptThroughBeat - this.originBeat;
    const oldestAcceptedBeat = elapsedBeat - this.phraseBeats;
    const batchNotes = notes.filter((note) => (
      note.onsetBeats >= Math.max(0, oldestAcceptedBeat) - NOTE_EPSILON
      && note.onsetBeats <= elapsedBeat + NOTE_EPSILON
    ));
    return this.appendPhaseNotes(batchNotes, this.sweptThroughBeat);
  }

  private closeOpenNotes(clockBeat: number): void {
    for (const [inputId, notes] of this.openNotes) {
      for (const open of notes) {
        this.closedNotes.push({
          note: {
            ...open.note,
            durationBeats: Math.max(0, clockBeat - open.absoluteOnsetBeats),
            held: false,
          },
          insertedAtBeat: clockBeat,
        });
      }
      this.openNotes.delete(inputId);
    }
  }

  stop(clockBeat: number): void {
    if (!finite(clockBeat)) return;
    this.advance(clockBeat);
    this.closeOpenNotes(clockBeat);
    this.recording = false;
    this.stopped = true;
    this.clockBeat = clockBeat;
  }

  cancel(): void {
    this.closedNotes.length = 0;
    this.openNotes.clear();
    this.recording = false;
    this.stopped = false;
    this.overflowed = false;
  }

  /** Cheap live counters for the recorder UI; avoids cloning the 1024-note snapshot. */
  noteCount(): number {
    return this.closedNotes.length + this.activeNoteCount();
  }

  heldInputCount(): number {
    return this.openNotes.size;
  }

  isOverflowed(): boolean {
    return this.overflowed;
  }

  snapshot(): SynthSequenceCaptureScratchSnapshot {
    const heldNotes = [...this.openNotes.values()].flatMap((notes) => notes.map((open) => ({
      ...open.note,
      durationBeats: Math.max(0, this.clockBeat - open.absoluteOnsetBeats),
      held: true,
    })));
    return {
      phraseBeats: this.phraseBeats,
      recording: this.recording,
      stopped: this.stopped,
      clockBeat: this.clockBeat,
      notes: [...cloneJson(this.closedNotes.map((entry) => entry.note)), ...heldNotes],
      heldInputIds: [...this.openNotes.keys()],
      overflowed: this.overflowed,
    };
  }
}
