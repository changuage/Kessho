/**
 * Runtime independent recorded-note session.
 *
 * The recorder owns a mutable sparse append buffer. React/UI consumers ask for
 * snapshots at frame or commit boundaries, so recording does not copy the
 * growing note list for every input event.
 */

import {
  RECORDED_NOTE_CLIP_MAX_GRID_STEPS,
  RECORDED_NOTE_CLIP_MIN_GRID_STEPS,
  RECORDED_NOTE_CLIP_MAX_DURATION_BEATS,
  RECORDED_NOTE_CLIP_MAX_ID,
  RECORDED_NOTE_CLIP_MAX_NOTES,
  RECORDED_NOTE_CLIP_MAX_SOURCE_ID,
  RECORDED_NOTE_CLIP_SCHEMA_VERSION,
  createRecordedNoteClip,
  validateRecordedNoteClip,
  type RecordedNoteClip as CanonicalRecordedNoteClip,
  type RecordedNoteClipNote,
} from './recordedNoteClip';

export type RecordedNote = RecordedNoteClipNote;
export type RecordedNoteClip = CanonicalRecordedNoteClip;

export const RECORDED_NOTE_CAPACITY = RECORDED_NOTE_CLIP_MAX_NOTES;
export const UINT32_MAX = RECORDED_NOTE_CLIP_MAX_ID;
export const RECORDED_NOTE_SESSION_SCHEMA_VERSION = RECORDED_NOTE_CLIP_SCHEMA_VERSION;
export const RECORDED_NOTE_MIN_DURATION_BEATS = 1e-6;

export type RecordedNoteSource = 'keyboard' | 'orbit' | 'walker';
export type RecordedNoteMode = 'replace' | 'overdub' | 'extend';
export type RecordedNoteSessionPhase =
  | 'idle'
  | 'recording'
  | 'finishing'
  | 'ready'
  | 'pending'
  | 'committed'
  | 'cancelled'
  | 'error';

export interface RecordedNoteInput {
  readonly source: RecordedNoteSource;
  readonly pitch: number;
  readonly velocity: number;
  /** Position in beats relative to this recording pass. */
  readonly onsetBeats: number;
  readonly durationBeats?: number;
  readonly sourceId?: number;
  /** Input event identity. It is remapped to a positive u32 note id. */
  readonly id?: number;
  readonly chordGroupId?: string;
  readonly mode?: RecordedNote['mode'];
  readonly chord?: RecordedNote['chord'];
  readonly arp?: RecordedNote['arp'];
}

export interface RecordedNoteOnInput {
  readonly source: RecordedNoteSource;
  readonly pitch: number;
  readonly velocity: number;
  readonly onsetBeats: number;
  readonly sourceId?: number;
  readonly id?: number;
  readonly chordGroupId?: string;
  readonly mode?: RecordedNote['mode'];
  readonly chord?: RecordedNote['chord'];
  readonly arp?: RecordedNote['arp'];
}

export interface RecordedNoteOffInput {
  /** Input identity used by noteOn. */
  readonly inputId?: string;
  /** Explicit note instance id, useful for MIDI and generated sources. */
  readonly id?: number;
  /** Position in beats relative to this recording pass. */
  readonly offsetBeats: number;
}

export interface RecordedNoteSessionOptions {
  readonly clipId?: string;
  readonly revision?: number;
  readonly durationBeats?: number;
  readonly gridSteps?: number;
  readonly originBeat?: number;
  readonly previousClip?: RecordedNoteClip | null;
}

export interface RecordedNoteSessionError {
  readonly kind: 'capacity' | 'invalid' | 'not-ready' | 'acknowledgement';
  readonly message: string;
  readonly droppedCount?: number;
}

export interface RecordedNoteSessionState {
  readonly phase: RecordedNoteSessionPhase;
  readonly token: string | null;
  readonly mode: RecordedNoteMode | null;
  readonly draft: RecordedNoteClip | null;
  readonly previousClip: RecordedNoteClip | null;
  readonly committedClip: RecordedNoteClip | null;
  readonly finishAtBeat: number | null;
  readonly openNoteCount: number;
  readonly retainedNoteCount: number;
  readonly undoCount: number;
  readonly capacity: number;
  readonly error: RecordedNoteSessionError | null;
}

export interface RecordedNoteCommitRequest {
  readonly sessionToken: string;
  readonly clip: RecordedNoteClip;
}

export interface RecordedNoteCommitAcknowledgement {
  readonly sessionToken: string;
  readonly accepted: boolean;
  readonly revision?: number;
  readonly clip?: RecordedNoteClip;
  readonly error?: string;
}

export interface RecordedNoteCommitResult {
  readonly applied: boolean;
  readonly stale: boolean;
  readonly state: RecordedNoteSessionState;
}

export type RecordedNoteEdit = Partial<Pick<RecordedNote, 'onsetBeats' | 'durationBeats' | 'pitch' | 'velocity' | 'sourceId'>>;

type MutableNote = {
  id: number;
  onsetBeats: number;
  durationBeats: number;
  pitch: number;
  velocity: number;
  sourceId?: number;
  chordGroupId?: string;
  mode?: RecordedNote['mode'];
  chord?: RecordedNote['chord'];
  arp?: RecordedNote['arp'];
};

type NoteUndo = {
  readonly id: number;
  readonly previous: MutableNote;
};

let sessionCounter = 0;
const RECORDED_NOTE_UNDO_LIMIT = 64;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function positiveDuration(value: number): number {
  return Math.max(RECORDED_NOTE_MIN_DURATION_BEATS, value);
}

function normalizePitch(value: number): number {
  return Math.max(0, Math.min(127, value));
}

function normalizeVelocity(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeGridSteps(value: number | undefined, fallback: number): number {
  const candidate = value ?? fallback;
  return Math.max(RECORDED_NOTE_CLIP_MIN_GRID_STEPS, Math.min(RECORDED_NOTE_CLIP_MAX_GRID_STEPS, Math.round(finite(candidate) ? candidate : fallback)));
}

function normalizeDuration(value: number | undefined, fallback: number): number {
  return Math.min(
    RECORDED_NOTE_CLIP_MAX_DURATION_BEATS,
    Math.max(RECORDED_NOTE_MIN_DURATION_BEATS, finite(value ?? NaN) ? value! : fallback),
  );
}

function cloneClip(clip: RecordedNoteClip | null): RecordedNoteClip | null {
  if (!clip) return null;
  return validateRecordedNoteClip(clip);
}

function validNote(note: RecordedNote): boolean {
  return Number.isInteger(note.id) && note.id > 0 && note.id <= UINT32_MAX
    && finite(note.onsetBeats) && note.onsetBeats >= 0
    && finite(note.durationBeats) && note.durationBeats >= RECORDED_NOTE_MIN_DURATION_BEATS
    && note.durationBeats <= RECORDED_NOTE_CLIP_MAX_DURATION_BEATS
    && finite(note.pitch) && note.pitch >= 0 && note.pitch <= 127
    && finite(note.velocity) && note.velocity >= 0 && note.velocity <= 1
    && (note.sourceId === undefined || (Number.isInteger(note.sourceId) && note.sourceId >= 0 && note.sourceId <= RECORDED_NOTE_CLIP_MAX_SOURCE_ID))
    && (note.chordGroupId === undefined || typeof note.chordGroupId === 'string')
    && (note.mode === undefined || note.mode === 'note' || note.mode === 'chord' || note.mode === 'arp')
    && (note.chord === undefined || (Array.isArray(note.chord.intervals) && note.chord.intervals.length > 0))
    && (note.arp === undefined || Boolean(note.arp.config));
}

/**
 * A single recorder for keyboard, Orbit, and Walker note grammars.
 * All mutating methods are synchronous and cheap; only snapshot() copies notes.
 */
export class RecordedNoteSession {
  private readonly capacity: number;
  private readonly clipId: string;
  private revision: number;
  private originBeat: number;
  private notes: MutableNote[] = [];
  private readonly noteIndex = new Map<number, number>();
  private readonly openByInput = new Map<string, number[]>();
  private nextNoteId = 1;
  private tokenSerial = 0;
  private currentToken: string | null = null;
  private phase: RecordedNoteSessionPhase = 'idle';
  private mode: RecordedNoteMode | null = null;
  private previousClip: RecordedNoteClip | null;
  private committedClip: RecordedNoteClip | null;
  private durationBeats: number;
  private gridSteps: number;
  private baseOffsetBeats = 0;
  private finishAtBeat: number | null = null;
  private error: RecordedNoteSessionError | null = null;
  private pendingRevision: number | null = null;
  private passNoteCount = 0;
  private readonly undoStack: NoteUndo[] = [];

  constructor(options: RecordedNoteSessionOptions = {}) {
    this.capacity = RECORDED_NOTE_CAPACITY;
    this.previousClip = cloneClip(options.previousClip ?? null);
    this.committedClip = cloneClip(options.previousClip ?? null);
    this.clipId = options.clipId ?? options.previousClip?.id ?? 'recorded-clip';
    this.revision = Math.max(0, Math.round(options.revision ?? options.previousClip?.revision ?? 0));
    this.durationBeats = normalizeDuration(options.durationBeats, options.previousClip?.durationBeats ?? 4);
    this.gridSteps = normalizeGridSteps(options.gridSteps, options.previousClip?.grid.steps ?? 16);
    const originBeat = options.originBeat;
    this.originBeat = originBeat !== undefined && finite(originBeat) ? originBeat : 0;
  }

  start(mode: RecordedNoteMode = 'replace', options: Pick<RecordedNoteSessionOptions, 'durationBeats' | 'gridSteps' | 'originBeat'> = {}): RecordedNoteSessionState {
    const previous = this.committedClip;
    const requestedDuration = options.durationBeats;
    if (requestedDuration !== undefined && (!finite(requestedDuration) || requestedDuration <= 0 || requestedDuration > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS)) {
      return this.rejectStart('Recording duration must be finite, positive, and within the clip limit.');
    }
    if (options.gridSteps !== undefined && (!Number.isInteger(options.gridSteps) || options.gridSteps < RECORDED_NOTE_CLIP_MIN_GRID_STEPS || options.gridSteps > RECORDED_NOTE_CLIP_MAX_GRID_STEPS)) {
      return this.rejectStart('Recording grid steps must be an integer between 2 and 32.');
    }
    if (options.originBeat !== undefined && !finite(options.originBeat)) {
      return this.rejectStart('Recording origin beat must be finite.');
    }

    const baseOffsetBeats = mode === 'extend' && previous ? previous.durationBeats : 0;
    const passDurationBeats = normalizeDuration(requestedDuration, previous?.durationBeats ?? this.durationBeats);
    const nextDurationBeats = baseOffsetBeats + passDurationBeats;
    if (mode === 'overdub' && previous && passDurationBeats < previous.durationBeats) {
      return this.rejectStart('Overdub cannot shorten the retained clip.');
    }
    if (nextDurationBeats > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS) {
      return this.rejectStart('Recording duration would exceed the clip limit.');
    }
    const nextGridSteps = normalizeGridSteps(options.gridSteps, previous?.grid.steps ?? this.gridSteps);

    this.tokenSerial += 1;
    sessionCounter += 1;
    this.currentToken = `recording-${sessionCounter}-${this.tokenSerial}`;
    this.mode = mode;
    this.phase = 'recording';
    this.error = null;
    this.finishAtBeat = null;
    this.pendingRevision = null;
    if (options.originBeat !== undefined && finite(options.originBeat)) this.originBeat = options.originBeat;
    this.openByInput.clear();
    this.notes = [];
    this.noteIndex.clear();
    this.nextNoteId = 1;
    this.passNoteCount = 0;
    this.undoStack.length = 0;

    this.revision = Math.max(1, this.revision + 1, (previous?.revision ?? 0) + 1);
    if (mode === 'overdub' || mode === 'extend') {
      this.copyNotes(previous?.notes ?? []);
    }
    this.baseOffsetBeats = baseOffsetBeats;
    this.durationBeats = nextDurationBeats;
    this.gridSteps = nextGridSteps;
    this.previousClip = cloneClip(previous);
    return this.snapshot();
  }

  /** Append one already-timed note. Input onset is local to this pass. */
  recordNote(input: RecordedNoteInput): number | null {
    if (!this.canRecord()) return null;
    if (!finite(input.onsetBeats) || input.onsetBeats < 0 || input.onsetBeats >= this.passDurationBeats() || !finite(input.pitch) || !finite(input.velocity)) {
      this.setError({ kind: 'invalid', message: 'Note onset, pitch, and velocity must be finite.' });
      return null;
    }
    const duration = positiveDuration(input.durationBeats ?? RECORDED_NOTE_MIN_DURATION_BEATS);
    if (!finite(duration)) {
      this.setError({ kind: 'invalid', message: 'Note duration must be finite.' });
      return null;
    }
    if (duration > RECORDED_NOTE_CLIP_MAX_DURATION_BEATS) {
      this.setError({ kind: 'invalid', message: 'Note duration exceeds the clip limit.' });
      return null;
    }
    const onsetBeats = this.baseOffsetBeats + input.onsetBeats;
    if (onsetBeats < 0 || onsetBeats >= this.durationBeats) {
      this.setError({ kind: 'invalid', message: 'Note onset must fall inside the clip duration.' });
      return null;
    }
    if (input.sourceId !== undefined && (!Number.isInteger(input.sourceId) || input.sourceId < 0 || input.sourceId > RECORDED_NOTE_CLIP_MAX_SOURCE_ID)) {
      this.setError({ kind: 'invalid', message: 'Note source id must be a u32.' });
      return null;
    }
    if (this.notes.length >= this.capacity) {
      this.setError({
        kind: 'capacity',
        message: `Recording reached its ${this.capacity}-note capacity. Draft retained.`,
        droppedCount: 1,
      });
      return null;
    }
    const id = this.allocateNoteId(input.id);
    const note: MutableNote = {
      id,
      onsetBeats,
      durationBeats: duration,
      pitch: normalizePitch(input.pitch),
      velocity: normalizeVelocity(input.velocity),
      ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      ...(input.chordGroupId === undefined ? {} : { chordGroupId: input.chordGroupId }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(input.chord === undefined ? {} : { chord: input.chord }),
      ...(input.arp === undefined ? {} : { arp: input.arp }),
    };
    this.noteIndex.set(id, this.notes.length);
    this.notes.push(note);
    this.passNoteCount += 1;
    return id;
  }

  noteOn(inputId: string, input: RecordedNoteOnInput): number | null {
    const id = this.recordNote({ ...input, durationBeats: RECORDED_NOTE_MIN_DURATION_BEATS });
    if (id === null) return null;
    const open = this.openByInput.get(inputId) ?? [];
    open.push(id);
    this.openByInput.set(inputId, open);
    return id;
  }

  noteOff(input: RecordedNoteOffInput): boolean {
    if (this.phase !== 'recording' && this.phase !== 'finishing') return false;
    if (!finite(input.offsetBeats)) return false;
    if (input.id !== undefined && !this.isOpenId(input.id)) return false;
    const id = input.id ?? this.takeOpenId(input.inputId);
    if (id === null || id === undefined) return false;
    if (input.id !== undefined) this.removeOpenId(id);
    const index = this.noteIndex.get(id);
    if (index === undefined) return false;
    const note = this.notes[index];
    if (!note) return false;
    const absoluteOffset = this.baseOffsetBeats + input.offsetBeats;
    note.durationBeats = positiveDuration(absoluteOffset - note.onsetBeats);
    return true;
  }

  releaseAll(offsetBeats: number): number {
    if (!finite(offsetBeats)) return 0;
    const ids: number[] = [];
    for (const open of this.openByInput.values()) ids.push(...open);
    let released = 0;
    for (const id of ids) {
      if (this.noteOff({ id, offsetBeats })) released += 1;
    }
    this.openByInput.clear();
    return released;
  }

  /** Request a loop boundary. Completion happens when advanceClock reaches it. */
  finishLoop(clockBeat: number): RecordedNoteSessionState {
    if (this.phase !== 'recording' && this.phase !== 'finishing') return this.snapshot();
    const endBeat = this.originBeat + this.passDurationBeats();
    if (finite(clockBeat) && clockBeat >= endBeat) {
      this.completeAt(endBeat);
    } else {
      this.finishAtBeat = endBeat;
      this.phase = 'finishing';
    }
    return this.snapshot();
  }

  /** Transport calls this even while no notes arrive, so silence completes. Returns whether phase changed. */
  advanceClock(clockBeat: number): boolean {
    const before = this.phase;
    if (finite(clockBeat)) {
      const endBeat = this.originBeat + this.passDurationBeats();
      if (this.phase === 'recording' && clockBeat >= endBeat) {
        this.completeAt(endBeat);
      } else if (this.phase === 'finishing' && this.finishAtBeat !== null && clockBeat >= this.finishAtBeat) {
        this.completeAt(this.finishAtBeat);
      }
    }
    return this.phase !== before;
  }

  stopNow(clockBeat: number): RecordedNoteSessionState {
    if (this.phase !== 'recording' && this.phase !== 'finishing') return this.snapshot();
    if (finite(clockBeat)) {
      const localBeat = Math.max(0, clockBeat - this.originBeat);
      this.releaseAll(localBeat);
      const latestOnset = this.notes.reduce((latest, note) => Math.max(latest, note.onsetBeats), 0);
      this.durationBeats = Math.max(
        RECORDED_NOTE_MIN_DURATION_BEATS,
        this.baseOffsetBeats,
        Math.min(this.durationBeats, this.baseOffsetBeats + localBeat),
        latestOnset + RECORDED_NOTE_MIN_DURATION_BEATS,
      );
    }
    this.finishAtBeat = null;
    this.phase = 'ready';
    return this.snapshot();
  }

  requestCommit(): RecordedNoteCommitRequest | null {
    if (this.phase === 'error') return null;
    if (this.phase !== 'ready') {
      this.setError({ kind: 'not-ready', message: 'Finish the loop or stop the recording before committing.' });
      return null;
    }
    const token = this.currentToken;
    if (!token) return null;
    const clip = this.draftSnapshot();
    this.phase = 'pending';
    this.pendingRevision = clip.revision;
    return { sessionToken: token, clip };
  }

  /** Retry the same retained draft after a rejected external commit. */
  retryCommit(): RecordedNoteCommitRequest | null {
    if (this.phase !== 'error' || this.error?.kind !== 'acknowledgement' || !this.currentToken) return null;
    const clip = this.draftSnapshot();
    this.pendingRevision = clip.revision;
    this.phase = 'pending';
    this.error = null;
    return { sessionToken: this.currentToken, clip };
  }

  acknowledge(result: RecordedNoteCommitAcknowledgement): RecordedNoteCommitResult {
    if (result.sessionToken !== this.currentToken || this.phase !== 'pending') {
      return { applied: false, stale: true, state: this.snapshot() };
    }
    if (result.revision !== this.pendingRevision) {
      this.setError({ kind: 'acknowledgement', message: 'The audio engine acknowledgement revision does not match the requested clip.' });
      return { applied: false, stale: false, state: this.snapshot() };
    }
    if (!result.accepted) {
      this.setError({ kind: 'acknowledgement', message: result.error ?? 'The audio engine rejected the recorded clip.' });
      return { applied: false, stale: false, state: this.snapshot() };
    }
    const draft = this.draftSnapshot();
    let committed: RecordedNoteClip;
    try {
      const candidate = cloneClip(result.clip ?? {
        ...draft,
        revision: result.revision,
      });
      if (!candidate || candidate.revision !== this.pendingRevision) throw new RangeError('Acknowledged clip revision mismatch');
      committed = candidate;
    } catch (error) {
      this.setError({ kind: 'acknowledgement', message: error instanceof Error ? error.message : String(error) });
      return { applied: false, stale: false, state: this.snapshot() };
    }
    this.committedClip = committed;
    this.phase = 'committed';
    this.pendingRevision = null;
    this.error = null;
    return { applied: true, stale: false, state: this.snapshot() };
  }

  cancel(): RecordedNoteSessionState {
    this.tokenSerial += 1;
    this.currentToken = null;
    this.phase = 'cancelled';
    this.mode = null;
    this.finishAtBeat = null;
    this.error = null;
    this.openByInput.clear();
    this.notes = [];
    this.noteIndex.clear();
    this.undoStack.length = 0;
    return this.snapshot();
  }

  snapshot(): RecordedNoteSessionState {
    return {
      phase: this.phase,
      token: this.currentToken,
      mode: this.mode,
      draft: this.phase === 'idle' || this.phase === 'cancelled' ? null : this.draftSnapshot(),
      previousClip: cloneClip(this.previousClip),
      committedClip: cloneClip(this.committedClip),
      finishAtBeat: this.finishAtBeat,
      openNoteCount: Array.from(this.openByInput.values()).reduce((total, ids) => total + ids.length, 0),
      retainedNoteCount: this.notes.length,
      undoCount: this.undoStack.length,
      capacity: this.capacity,
      error: this.error ? { ...this.error } : null,
    };
  }

  getCommittedClip(): RecordedNoteClip | null {
    return cloneClip(this.committedClip);
  }

  /** Bind the runtime's absolute origin before the first note is appended. */
  setOriginBeat(originBeat: number): boolean {
    if (!finite(originBeat) || this.passNoteCount > 0 || (this.phase !== 'recording' && this.phase !== 'finishing')) return false;
    const delta = originBeat - this.originBeat;
    this.originBeat = originBeat;
    if (this.finishAtBeat !== null) this.finishAtBeat += delta;
    return true;
  }

  getPhase(): RecordedNoteSessionPhase {
    return this.phase;
  }

  getFinishAtBeat(): number | null {
    return this.finishAtBeat;
  }

  getRetainedNoteCount(): number {
    return this.notes.length;
  }

  getGridSteps(): number {
    return this.gridSteps;
  }

  /** Retain the draft while surfacing a runtime capture error. */
  reportError(error: RecordedNoteSessionError): RecordedNoteSessionState {
    this.setError(error);
    return this.snapshot();
  }

  /** Edit the retained timed note draft; the next commit receives a new revision. */
  editNote(id: number, patch: RecordedNoteEdit): boolean {
    if (this.phase === 'pending' || this.phase === 'recording' || this.phase === 'finishing') return false;
    const index = this.noteIndex.get(id);
    if (index === undefined) return false;
    const note = this.notes[index];
    if (!note) return false;
    const next: MutableNote = { ...note, ...patch };
    if (!validNote(next) || next.onsetBeats >= this.durationBeats) {
      this.setError({ kind: 'invalid', message: 'Edited note falls outside the recorded clip bounds.' });
      return false;
    }
    this.undoStack.push({ id, previous: { ...note } });
    if (this.undoStack.length > RECORDED_NOTE_UNDO_LIMIT) this.undoStack.shift();
    Object.assign(note, next);
    this.revision = Math.max(1, this.revision + 1, (this.committedClip?.revision ?? 0) + 1);
    this.error = null;
    this.phase = 'ready';
    return true;
  }

  /** Restore the last successful note edit without changing the canonical clip authority. */
  undo(): boolean {
    if (this.phase === 'pending' || this.phase === 'recording' || this.phase === 'finishing') return false;
    const edit = this.undoStack.pop();
    if (!edit) return false;
    const index = this.noteIndex.get(edit.id);
    if (index === undefined || !this.notes[index]) return false;
    this.notes[index] = { ...edit.previous };
    this.revision = Math.max(1, this.revision + 1, (this.committedClip?.revision ?? 0) + 1);
    this.error = null;
    this.phase = 'ready';
    return true;
  }

  private canRecord(): boolean {
    if (this.phase === 'recording' || this.phase === 'finishing') return true;
    if (this.phase === 'error' && this.error?.kind === 'capacity') return false;
    return false;
  }

  private setError(error: RecordedNoteSessionError): void {
    this.error = error;
    this.phase = 'error';
  }

  private rejectStart(message: string): RecordedNoteSessionState {
    this.tokenSerial += 1;
    this.currentToken = null;
    this.mode = null;
    this.phase = 'error';
    this.finishAtBeat = null;
    this.pendingRevision = null;
    this.error = { kind: 'invalid', message };
    // The initial session has no content revision yet, but an error snapshot
    // still needs to be a canonical draft so callers can render it safely.
    this.revision = Math.max(1, this.revision, this.committedClip?.revision ?? 0);
    return this.snapshot();
  }

  private completeAt(endBeat: number): void {
    this.releaseAll(Math.max(0, endBeat - this.originBeat));
    this.finishAtBeat = null;
    this.phase = 'ready';
  }

  private copyNotes(notes: readonly RecordedNote[]): void {
    for (const source of notes) {
      if (this.notes.length >= this.capacity) {
        throw new RangeError(`Recorded clip exceeds its ${this.capacity}-note capacity`);
      }
      if (!validNote(source) || this.noteIndex.has(source.id)) {
        throw new RangeError('Invalid or duplicate previous recorded note');
      }
      const note = { ...source };
      this.noteIndex.set(note.id, this.notes.length);
      this.notes.push(note);
      this.nextNoteId = Math.max(this.nextNoteId, note.id + 1);
    }
  }

  private passDurationBeats(): number {
    return Math.max(RECORDED_NOTE_MIN_DURATION_BEATS, this.durationBeats - this.baseOffsetBeats);
  }

  private allocateNoteId(preferred: number | undefined): number {
    const candidate = Number.isInteger(preferred) && preferred! > 0 && preferred! <= UINT32_MAX
      ? preferred!
      : null;
    if (candidate !== null && !this.noteIndex.has(candidate)) return candidate;
    while (this.nextNoteId <= UINT32_MAX && this.noteIndex.has(this.nextNoteId)) this.nextNoteId += 1;
    if (this.nextNoteId > UINT32_MAX) {
      for (let id = 1; id <= UINT32_MAX; id += 1) {
        if (!this.noteIndex.has(id)) return id;
      }
    }
    return this.nextNoteId++;
  }

  private takeOpenId(inputId: string | undefined): number | null {
    if (!inputId) return null;
    const open = this.openByInput.get(inputId);
    if (!open || open.length === 0) return null;
    const id = open.pop() ?? null;
    if (open.length === 0) this.openByInput.delete(inputId);
    return id;
  }

  private removeOpenId(id: number): void {
    for (const [inputId, open] of this.openByInput) {
      const index = open.lastIndexOf(id);
      if (index < 0) continue;
      open.splice(index, 1);
      if (open.length === 0) this.openByInput.delete(inputId);
      return;
    }
  }

  private isOpenId(id: number): boolean {
    for (const open of this.openByInput.values()) {
      if (open.includes(id)) return true;
    }
    return false;
  }

  private draftSnapshot(): RecordedNoteClip {
    return createRecordedNoteClip({
      id: this.clipId,
      revision: this.revision,
      durationBeats: this.durationBeats,
      grid: { steps: this.gridSteps },
      notes: this.notes.map((note) => ({ ...note })),
    });
  }
}

export function createRecordedNoteSession(options: RecordedNoteSessionOptions = {}): RecordedNoteSession {
  return new RecordedNoteSession(options);
}
