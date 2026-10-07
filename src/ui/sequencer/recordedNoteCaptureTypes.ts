import type {
  RecordedNoteMode,
  RecordedNoteSource,
  RecordedNote,
} from './recordedNoteSession';

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
  readonly mode?: RecordedNote['mode'];
  readonly chord?: RecordedNote['chord'];
  readonly arp?: RecordedNote['arp'];
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
  readonly durationBeats: number;
  readonly gridSteps: number;
  readonly originBeat?: number;
}

export type RecordedNoteCaptureSubscription = (
  listener: (batch: RecordedNoteCaptureBatch) => void,
) => (() => void);
