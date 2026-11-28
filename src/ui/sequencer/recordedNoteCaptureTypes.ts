import type {
  RecordedNoteMode,
  RecordedNoteSource,
} from './recordedNoteSession';

/**
 * `fixed` starts at the next bar on the audio clock, records exactly
 * `durationBeats`, then finishes and drains by itself (Print).
 * `rolling` keeps the last `durationBeats` until Finish (live replace/overdub).
 */
export type RecordedNoteCapturePolicy = 'fixed' | 'rolling';

/** Native generated-capture mode ids (KesshoProductGeneratedSequencerCaptureMode). */
export const RECORDED_CAPTURE_MODE_IDS: Readonly<Record<RecordedNoteSource, number>> = {
  keyboard: 0,
  walker: 1,
  orbit: 2,
  randomChords: 3,
  randomNotes: 4,
};

export function recordedCaptureModeId(source: RecordedNoteSource): number {
  return RECORDED_CAPTURE_MODE_IDS[source];
}

/** The native source-mode mask that selects this source's producer tap. */
export function recordedCaptureModeMask(source: RecordedNoteSource): number {
  return 1 << recordedCaptureModeId(source);
}

export type RecordedNoteCaptureBatchPhase = 'recording' | 'finishing' | 'ready' | 'error';

/** One authoritative timed note delivered by the runtime capture stream. */
export interface RecordedNoteCaptureEvent {
  readonly sessionToken: string;
  readonly eventId: number;
  readonly source: RecordedNoteSource;
  /** Onset and duration are beats relative to this capture pass. */
  readonly onsetBeats: number;
  readonly durationBeats: number;
  readonly pitch: number;
  readonly velocity: number;
  readonly sourceId?: number;
  readonly chordGroupId?: string;
}

/**
 * A batch is the unit of capture progress. The runtime must publish events and
 * its transport watermark together so a finish boundary cannot outrun a late
 * event batch while the page is hidden.
 */
export interface RecordedNoteCaptureBatch {
  readonly sessionToken: string;
  readonly originBeat: number;
  readonly clockBeat: number;
  /** AudioContext time at the same audio boundary as clockBeat. */
  readonly clockContextTime?: number;
  /** Transport BPM at clockContextTime. */
  readonly clockBpm?: number;
  readonly events: readonly RecordedNoteCaptureEvent[];
  readonly phase: RecordedNoteCaptureBatchPhase;
  /** Highest event id included in the drained capture stream, when known. */
  readonly finalEventId: number | null;
  readonly overflowCount: number;
  readonly error?: string;
}

export interface RecordedNoteCaptureStartRequest {
  readonly action: 'start' | 'finish' | 'stop' | 'cancel';
  readonly enabled: boolean;
  readonly sessionToken: string;
  readonly sourceLaneIndex: number;
  readonly targetLaneIndex: number;
  readonly source: RecordedNoteSource;
  readonly mode: RecordedNoteMode;
  readonly policy: RecordedNoteCapturePolicy;
  readonly durationBeats: number;
  readonly gridSteps: number;
  /** Bar length used to find the next bar for `fixed` captures. */
  readonly beatsPerBar: number;
  readonly originBeat?: number;
}

export type RecordedNoteCaptureSubscription = (
  listener: (batch: RecordedNoteCaptureBatch) => void,
) => (() => void);
