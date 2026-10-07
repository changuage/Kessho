import type {
  SynthLocalChordPayload,
  SynthSequenceVariationMode,
  SynthVariationArpPayload,
} from './synthSequenceVariations';

/** Portable, lossless recorded-note phrase shared by the editor and Product Core. */

export const RECORDED_NOTE_CLIP_SCHEMA_VERSION = 1 as const;
export const RECORDED_NOTE_CLIP_MAX_NOTES = 1024;
/** Native generated synth capacity; the visible editor currently exposes four lanes. */
export const RECORDED_NOTE_CLIP_MAX_LANES = 8;
export const RECORDED_NOTE_CLIP_MAX_DURATION_BEATS = 4096;
export const RECORDED_NOTE_CLIP_MIN_GRID_STEPS = 2;
export const RECORDED_NOTE_CLIP_MAX_GRID_STEPS = 32;
export const RECORDED_NOTE_CLIP_MAX_ID = 0xffff_ffff;
/** Product Core has eight routed sources; zero is the inherit-lane sentinel. */
export const RECORDED_NOTE_CLIP_MAX_SOURCE_ID = 8;

export interface RecordedNoteClipNote {
  /** Positive u32 identity. Manual negative draft ids are remapped at capture conversion. */
  id: number;
  onsetBeats: number;
  /** May cross the clip loop; it is intentionally independent of clip duration. */
  durationBeats: number;
  /** Absolute MIDI pitch by default. Fractional values are retained for future pitch sources. */
  pitch: number;
  /** Linear note velocity in [0, 1]. */
  velocity: number;
  /** Zero is the native inherit-lane sentinel; omitted means inherit too. */
  sourceId?: number;
  /** Capture-only attack grouping; the fitter must not infer chords without it. */
  chordGroupId?: string;
  /** Optional source grammar carried through the scratch clip before printing. */
  mode?: SynthSequenceVariationMode;
  chord?: SynthLocalChordPayload;
  arp?: SynthVariationArpPayload;
}

export interface RecordedNoteClip {
  schemaVersion: typeof RECORDED_NOTE_CLIP_SCHEMA_VERSION;
  id: string;
  revision: number;
  durationBeats: number;
  grid: { steps: number };
  notes: RecordedNoteClipNote[];
}

export type SerializedRecordedNoteClip = RecordedNoteClip;
export type SerializedRecordedNoteClips = (SerializedRecordedNoteClip | null)[];

export interface RecordedNoteClipCaptureEvent {
  /** Existing positive source event identity, or a negative/manual draft identity. */
  id?: number;
  sourceId?: number | null;
  /** Explicit authoritative onset. When supplied it is never silently wrapped. */
  onsetBeats?: number;
  durationBeats?: number;
  targetStepIndex?: number | null;
  targetStepFloat?: number | null;
  cycleIndex?: number | null;
  midiNote: number;
  velocity: number;
  gateSeconds?: number | null;
  /** Optional metadata from the capture stream used by the auto printer. */
  chordGroupId?: string;
  mode?: SynthSequenceVariationMode;
  chord?: SynthLocalChordPayload;
  arp?: SynthVariationArpPayload;
}

export interface RecordedNoteClipFromCaptureOptions {
  id: string;
  revision: number;
  durationBeats: number;
  gridSteps: number;
  events: readonly RecordedNoteClipCaptureEvent[];
  secondsPerBeat?: number;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`Invalid recorded clip ${label}`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const number = finite(value, label);
  if (!Number.isSafeInteger(number) || number <= 0 || number > RECORDED_NOTE_CLIP_MAX_ID) {
    throw new RangeError(`Invalid recorded clip ${label}`);
  }
  return number;
}

function positiveRevision(value: unknown): number {
  const number = finite(value, 'revision');
  if (!Number.isSafeInteger(number) || number <= 0) throw new RangeError('Invalid recorded clip revision');
  return number;
}

function uint32(value: unknown, label: string): number {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < 0 || number > RECORDED_NOTE_CLIP_MAX_ID) {
    throw new RangeError(`Invalid recorded clip ${label}`);
  }
  return number;
}

function sourceIdValue(value: unknown): number {
  const number = uint32(value, 'note source id');
  if (number > RECORDED_NOTE_CLIP_MAX_SOURCE_ID) throw new RangeError('Invalid recorded clip note source id');
  return number;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validVariationMetadata(note: Pick<RecordedNoteClipNote, 'chordGroupId' | 'mode' | 'chord' | 'arp'>): boolean {
  if (note.chordGroupId !== undefined && typeof note.chordGroupId !== 'string') return false;
  if (note.mode !== undefined && note.mode !== 'note' && note.mode !== 'chord' && note.mode !== 'arp') return false;
  if (note.chord !== undefined) {
    if (!note.chord || !Array.isArray(note.chord.intervals) || note.chord.intervals.length === 0) return false;
    if (note.chord.followHarmony !== undefined && typeof note.chord.followHarmony !== 'boolean') return false;
    if (!note.chord.intervals.every((interval) => (
      Number.isFinite(interval.intervalSemitones)
      && interval.intervalSemitones >= -48
      && interval.intervalSemitones <= 48
      && Number.isFinite(interval.velocity)
      && interval.velocity >= 0
      && interval.velocity <= 1
      && (interval.gateBeats === undefined || (Number.isFinite(interval.gateBeats) && interval.gateBeats >= 0))
    ))) return false;
  }
  if (note.arp !== undefined) {
    if (!note.arp || typeof note.arp !== 'object' || !note.arp.config) return false;
    if (note.arp.spanBeats !== undefined && (!Number.isFinite(note.arp.spanBeats) || note.arp.spanBeats <= 0)) return false;
  }
  return true;
}

function cloneAndValidateNote(raw: unknown): RecordedNoteClipNote {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RangeError('Invalid recorded clip note');
  const note = raw as Partial<RecordedNoteClipNote>;
  const normalized: RecordedNoteClipNote = {
    id: positiveInteger(note.id, 'note id'),
    onsetBeats: finite(note.onsetBeats, 'note onset'),
    durationBeats: finite(note.durationBeats, 'note duration'),
    pitch: finite(note.pitch, 'note pitch'),
    velocity: finite(note.velocity, 'note velocity'),
  };
  if (note.sourceId !== undefined) normalized.sourceId = sourceIdValue(note.sourceId);
  if (!validVariationMetadata(note)) throw new RangeError('Invalid recorded clip capture metadata');
  if (note.chordGroupId !== undefined) normalized.chordGroupId = note.chordGroupId;
  if (note.mode !== undefined) normalized.mode = note.mode;
  if (note.chord !== undefined) normalized.chord = cloneJson(note.chord);
  if (note.arp !== undefined) normalized.arp = cloneJson(note.arp);
  return normalized;
}

/** Validate and detach a clip at a persistence or worker boundary. */
export function validateRecordedNoteClip(value: unknown): RecordedNoteClip {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('Invalid recorded note clip');
  const input = value as Partial<RecordedNoteClip>;
  if (input.schemaVersion !== RECORDED_NOTE_CLIP_SCHEMA_VERSION) throw new RangeError('Unsupported recorded note clip schema');
  if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 128) throw new RangeError('Invalid recorded clip id');
  const revision = positiveRevision(input.revision);
  const durationBeats = finite(input.durationBeats, 'duration');
  if (durationBeats <= 0 || durationBeats > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS) throw new RangeError('Invalid recorded clip duration');
  const steps = finite(input.grid?.steps, 'grid steps');
  if (!Number.isInteger(steps) || steps < RECORDED_NOTE_CLIP_MIN_GRID_STEPS || steps > RECORDED_NOTE_CLIP_MAX_GRID_STEPS) {
    throw new RangeError('Invalid recorded clip grid steps');
  }
  if (!Array.isArray(input.notes) || input.notes.length > RECORDED_NOTE_CLIP_MAX_NOTES) throw new RangeError('Invalid recorded clip note count');
  const ids = new Set<number>();
  const notes = input.notes.map((raw) => {
    const note = cloneAndValidateNote(raw);
    if (ids.has(note.id)) throw new RangeError(`Duplicate recorded clip note id ${note.id}`);
    ids.add(note.id);
    if (note.onsetBeats < 0 || note.onsetBeats >= durationBeats) throw new RangeError('Recorded clip onset outside duration');
    if (note.durationBeats <= 0 || note.durationBeats > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS) throw new RangeError('Recorded clip note duration outside bounds');
    if (note.pitch < 0 || note.pitch > 127) throw new RangeError('Invalid recorded clip pitch');
    if (note.velocity < 0 || note.velocity > 1) throw new RangeError('Invalid recorded clip velocity');
    return note;
  });
  notes.sort((left, right) => left.onsetBeats - right.onsetBeats || left.id - right.id);
  return {
    schemaVersion: RECORDED_NOTE_CLIP_SCHEMA_VERSION,
    id: input.id,
    revision,
    durationBeats,
    grid: { steps },
    notes,
  };
}

export function createRecordedNoteClip(
  input: Omit<RecordedNoteClip, 'schemaVersion'> & { schemaVersion?: typeof RECORDED_NOTE_CLIP_SCHEMA_VERSION },
): RecordedNoteClip {
  return validateRecordedNoteClip({ ...input, schemaVersion: RECORDED_NOTE_CLIP_SCHEMA_VERSION });
}

export function serializeRecordedNoteClip(value: RecordedNoteClip | null | undefined): SerializedRecordedNoteClip | null {
  return value == null ? null : validateRecordedNoteClip(value);
}

/** Invalid persisted data throws so callers can retain the draft and show the error. */
export function deserializeRecordedNoteClip(value: unknown): SerializedRecordedNoteClip | null {
  if (value == null) return null;
  return validateRecordedNoteClip(value);
}

export function deserializeRecordedNoteClips(value: unknown): SerializedRecordedNoteClips | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > RECORDED_NOTE_CLIP_MAX_LANES) {
    throw new RangeError('Invalid recorded clip lane list');
  }
  return value.map((clip) => deserializeRecordedNoteClip(clip));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function onsetFromCaptureEvent(event: RecordedNoteClipCaptureEvent, durationBeats: number, gridSteps: number): number {
  if (event.onsetBeats !== undefined) {
    const onset = finite(event.onsetBeats, 'note onset');
    if (onset < 0 || onset >= durationBeats) throw new RangeError('Captured note onset outside duration');
    return onset;
  }
  const step = typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)
    ? event.targetStepFloat
    : typeof event.targetStepIndex === 'number' && Number.isFinite(event.targetStepIndex)
      ? event.targetStepIndex
      : 0;
  const cycle = typeof event.cycleIndex === 'number' && Number.isFinite(event.cycleIndex) ? event.cycleIndex : 0;
  const cycleRelative = step - cycle * gridSteps;
  const relative = cycleRelative >= -0.5 && cycleRelative < gridSteps + 0.5 ? cycleRelative : step;
  return positiveModulo(relative, gridSteps) / gridSteps * durationBeats;
}

function captureId(eventId: number | undefined, index: number, used: Set<number>): number {
  const candidate = typeof eventId === 'number' && Number.isInteger(eventId) && eventId > 0 && eventId <= RECORDED_NOTE_CLIP_MAX_ID
    ? eventId
    : 0;
  if (candidate > 0 && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let next = Math.max(1, index + 1);
  while (used.has(next)) next += 1;
  if (next > RECORDED_NOTE_CLIP_MAX_ID) throw new RangeError('Recorded clip note id capacity exceeded');
  used.add(next);
  return next;
}

/** Convert capture telemetry into a lossless clip. Colliding onsets remain separate notes. */
export function recordedNoteClipFromCaptureEvents(options: RecordedNoteClipFromCaptureOptions): RecordedNoteClip {
  if (options.events.length > RECORDED_NOTE_CLIP_MAX_NOTES) throw new RangeError('Recorded clip note capacity exceeded');
  const durationBeats = finite(options.durationBeats, 'duration');
  if (durationBeats <= 0 || durationBeats > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS) throw new RangeError('Invalid recorded clip duration');
  const gridSteps = finite(options.gridSteps, 'grid steps');
  if (!Number.isInteger(gridSteps) || gridSteps < RECORDED_NOTE_CLIP_MIN_GRID_STEPS || gridSteps > RECORDED_NOTE_CLIP_MAX_GRID_STEPS) throw new RangeError('Invalid recorded clip grid steps');
  const secondsPerBeat = options.secondsPerBeat === undefined ? 1 : finite(options.secondsPerBeat, 'seconds per beat');
  if (secondsPerBeat <= 0) throw new RangeError('Invalid seconds per beat');
  const usedIds = new Set<number>();
  const notes = options.events.map((event, index) => {
    const onsetBeats = onsetFromCaptureEvent(event, durationBeats, gridSteps);
    const rawDuration = event.durationBeats !== undefined
      ? finite(event.durationBeats, 'note duration')
      : event.gateSeconds !== undefined && event.gateSeconds !== null
        ? finite(event.gateSeconds, 'gate seconds') / secondsPerBeat
        : durationBeats / gridSteps;
    if (rawDuration <= 0 || rawDuration > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS) throw new RangeError('Invalid captured note duration');
    const sourceId = event.sourceId == null ? undefined : sourceIdValue(event.sourceId);
    const pitch = finite(event.midiNote, 'note pitch');
    if (pitch < 0 || pitch > 127) throw new RangeError('Invalid captured note pitch');
    const velocity = finite(event.velocity, 'note velocity');
    if (velocity < 0 || velocity > 1) throw new RangeError('Invalid captured note velocity');
    return {
      id: captureId(event.id, index, usedIds),
      onsetBeats,
      durationBeats: rawDuration,
      pitch,
      velocity,
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(event.chordGroupId === undefined ? {} : { chordGroupId: event.chordGroupId }),
      ...(event.mode === undefined ? {} : { mode: event.mode }),
      ...(event.chord === undefined ? {} : { chord: cloneJson(event.chord) }),
      ...(event.arp === undefined ? {} : { arp: cloneJson(event.arp) }),
    };
  });
  return createRecordedNoteClip({ id: options.id, revision: options.revision, durationBeats, grid: { steps: gridSteps }, notes });
}
