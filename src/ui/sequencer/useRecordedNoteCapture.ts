import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentVisibility } from '../hooks/useDocumentVisibility';
import {
  RECORDED_NOTE_CAPACITY,
  RecordedNoteSession,
  type RecordedNote,
  type RecordedNoteClip,
  type RecordedNoteMode,
  type RecordedNoteSessionState,
  type RecordedNoteSource,
} from './recordedNoteSession';
import type {
  RecordedNoteCaptureBatch,
  RecordedNoteCaptureStartRequest,
  RecordedNoteCaptureSubscription,
} from './recordedNoteCaptureTypes';
import { createRecordedNoteClip } from './recordedNoteClip';
import {
  SynthSequenceCaptureScratch,
  type SynthVariationCaptureNote,
} from './synthSequenceVariations';

export interface StartRecordedNoteCaptureRequest {
  readonly sourceLaneIndex?: number;
  readonly targetLaneIndex?: number;
  readonly source?: RecordedNoteSource;
  readonly mode?: RecordedNoteMode;
  readonly durationBeats?: number;
  readonly gridSteps?: number;
  readonly originBeat?: number;
}

export interface RecordedNoteCaptureView {
  readonly sourceLaneIndex: number;
  readonly targetLaneIndex: number;
  readonly source: RecordedNoteSource;
  readonly mode: RecordedNoteMode;
  readonly originBeat: number;
  readonly passDurationBeats: number;
  readonly gridSteps: number;
  readonly currentClockBeat: number;
  readonly receivedEventId: number;
  readonly finalEventId: number | null;
  readonly overflowCount: number;
  readonly waitingForWatermark: boolean;
  readonly recorder: RecordedNoteSessionState;
}

export interface UseRecordedNoteCaptureArgs {
  readonly activeLaneIndex: number;
  readonly activeSource: RecordedNoteSource;
  readonly defaultDurationBeats?: number;
  readonly defaultGridSteps?: number;
  readonly setCaptureEnabled?: (request: RecordedNoteCaptureStartRequest) => void;
  readonly subscribeCapture?: RecordedNoteCaptureSubscription;
  /** Audio-clock correlation for direct keyboard/UI note events. */
  readonly getCaptureClockBeat?: () => number | null;
}

export interface RecordedNoteCaptureApi {
  readonly view: RecordedNoteCaptureView | null;
  readonly isCapturing: boolean;
  readonly capturedCount: number;
  readonly start: (request?: StartRecordedNoteCaptureRequest) => void;
  readonly finishLoop: () => void;
  readonly stopNow: () => void;
  readonly cancel: () => void;
  readonly recordNoteOn: (
    inputId: string,
    pitch: number,
    velocity: number,
    clockBeat?: number,
    sourceId?: number,
    metadata?: Pick<RecordedNote, 'chordGroupId' | 'mode' | 'chord' | 'arp'>,
  ) => number | null;
  readonly recordNoteOff: (input: { inputId?: string; id?: number; clockBeat?: number }) => boolean;
  /** Feed one atomic runtime batch, including empty batches during silence. */
  readonly ingestBatch: (batch: RecordedNoteCaptureBatch) => void;
}

type PendingBoundary =
  | { kind: 'finish' | 'auto' }
  | { kind: 'stop'; clockBeat: number };

const RECORDED_CAPTURE_PREVIEW_INTERVAL_MS = 50;

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

interface ActiveCapture {
  readonly controller: RecordedNoteSession;
  readonly sourceLaneIndex: number;
  readonly targetLaneIndex: number;
  readonly source: RecordedNoteSource;
  readonly mode: RecordedNoteMode;
  originBeat: number;
  readonly passDurationBeats: number;
  readonly gridSteps: number;
  readonly token: string;
  readonly seenEventIds: Set<number>;
  currentClockBeat: number;
  receivedEventId: number;
  finalEventId: number | null;
  overflowCount: number;
  pendingBoundary: PendingBoundary | null;
  runtimePhase: RecordedNoteCaptureBatch['phase'];
  /** Reuse the last immutable session snapshot across clock-only batches. */
  snapshot: RecordedNoteSessionState | null;
  snapshotDirty: boolean;
  /** Looping auto-print scratch; the session remains the phase/draft lifecycle. */
  scratch: SynthSequenceCaptureScratch | null;
  scratchNoteSerial: number;
  scratchOverflowed: boolean;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function safeLaneIndex(value: number | undefined, fallback: number): number {
  const candidate = value ?? fallback;
  return Number.isFinite(candidate) ? Math.max(0, Math.round(candidate)) : fallback;
}

function sourceForMode(mode: 'euclid' | 'anchorWalker' | 'orbit'): RecordedNoteSource {
  if (mode === 'anchorWalker') return 'walker';
  if (mode === 'orbit') return 'orbit';
  return 'keyboard';
}

function controlRequest(
  active: ActiveCapture,
  action: RecordedNoteCaptureStartRequest['action'],
): RecordedNoteCaptureStartRequest {
  return {
    action,
    enabled: action === 'start' || action === 'finish',
    sessionToken: active.token,
    sourceLaneIndex: active.sourceLaneIndex,
    targetLaneIndex: active.targetLaneIndex,
    source: active.source,
    mode: active.mode,
    durationBeats: active.passDurationBeats,
    gridSteps: active.gridSteps,
    originBeat: active.originBeat,
  };
}

function watermarkReached(active: ActiveCapture): boolean {
  return active.finalEventId !== null && active.receivedEventId >= active.finalEventId;
}

function scratchClip(active: ActiveCapture): RecordedNoteClip | null {
  if (!active.scratch) return null;
  const snapshot = active.scratch.snapshot();
  const state = active.controller.snapshot();
  if (state.phase === 'idle' || state.phase === 'cancelled') return null;
  const usedIds = new Set<number>();
  const notes = snapshot.notes.map((note, index) => {
    const parsed = Number(note.id);
    const id = Number.isSafeInteger(parsed) && parsed > 0 && !usedIds.has(parsed)
      ? parsed
      : (() => {
          let next = index + 1;
          while (usedIds.has(next)) next += 1;
          return next;
        })();
    usedIds.add(id);
    return {
      id,
      onsetBeats: Math.max(0, note.onsetBeats),
      durationBeats: Math.max(1e-6, note.durationBeats),
      pitch: note.pitch,
      velocity: note.velocity,
      ...(note.sourceId === undefined ? {} : { sourceId: note.sourceId }),
      ...(note.chordGroupId === undefined ? {} : { chordGroupId: note.chordGroupId }),
      ...(note.mode === undefined ? {} : { mode: note.mode }),
      ...(note.chord === undefined ? {} : { chord: note.chord }),
      ...(note.arp === undefined ? {} : { arp: note.arp }),
    };
  });
  return createRecordedNoteClip({
    id: `recorded-${active.token}`,
    revision: 1,
    durationBeats: active.scratch.phraseBeats,
    grid: { steps: active.gridSteps },
    notes,
  });
}

export function useRecordedNoteCapture({
  activeLaneIndex,
  activeSource,
  defaultDurationBeats = 4,
  defaultGridSteps = 16,
  setCaptureEnabled,
  subscribeCapture,
  getCaptureClockBeat,
}: UseRecordedNoteCaptureArgs): RecordedNoteCaptureApi {
  const [view, setView] = useState<RecordedNoteCaptureView | null>(null);
  const activeRef = useRef<ActiveCapture | null>(null);
  const currentClockRef = useRef(0);
  const ingestRef = useRef<(batch: RecordedNoteCaptureBatch) => void>(() => undefined);
  const sendControlRef = useRef(setCaptureEnabled);
  const pendingPreviewRef = useRef<ActiveCapture | null | undefined>(undefined);
  const previewHandleRef = useRef<number | null>(null);
  const previewGenerationRef = useRef(0);
  const nextPreviewAtRef = useRef(0);
  const documentVisible = useDocumentVisibility();
  const documentVisibleRef = useRef(documentVisible);
  documentVisibleRef.current = documentVisible;

  useEffect(() => {
    sendControlRef.current = setCaptureEnabled;
  }, [setCaptureEnabled]);

  const buildView = useCallback((active: ActiveCapture): RecordedNoteCaptureView => ({
      sourceLaneIndex: active.sourceLaneIndex,
      targetLaneIndex: active.targetLaneIndex,
      source: active.source,
      mode: active.mode,
      originBeat: active.originBeat,
      passDurationBeats: active.passDurationBeats,
      gridSteps: active.gridSteps,
      currentClockBeat: active.currentClockBeat,
      receivedEventId: active.receivedEventId,
      finalEventId: active.finalEventId,
      overflowCount: active.overflowCount,
      waitingForWatermark: active.pendingBoundary !== null && !watermarkReached(active),
      recorder: (() => {
        if (active.snapshot === null || active.snapshotDirty) {
          const session = active.controller.snapshot();
          const shouldMaterializeScratch = active.scratch
            && session.phase !== 'idle'
            && session.phase !== 'cancelled'
            && session.phase !== 'recording'
            && session.phase !== 'finishing';
          const draft = shouldMaterializeScratch
            ? scratchClip(active)
            : null;
          active.snapshot = draft ? {
            ...session,
            draft,
            retainedNoteCount: draft.notes.length,
            openNoteCount: active.scratch?.heldInputCount() ?? session.openNoteCount,
          } : active.scratch ? {
            ...session,
            retainedNoteCount: active.scratch.noteCount(),
            openNoteCount: active.scratch.heldInputCount(),
          } : session;
          active.snapshotDirty = false;
        }
        return active.snapshot;
      })(),
  }), []);

  const cancelPreviewTask = useCallback((clearPending = false) => {
    if (previewHandleRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(previewHandleRef.current);
    }
    previewHandleRef.current = null;
    previewGenerationRef.current += 1;
    if (clearPending) pendingPreviewRef.current = undefined;
  }, []);

  const publish = useCallback((active: ActiveCapture | null, immediate = false) => {
    if (!active) {
      cancelPreviewTask(true);
      nextPreviewAtRef.current = 0;
      setView(null);
      return;
    }
    // An old async receipt may finish after a re-arm or cancel. It can never
    // schedule a preview for a controller that is no longer current.
    if (activeRef.current !== active) return;
    pendingPreviewRef.current = active;
    if (typeof window === 'undefined') {
      pendingPreviewRef.current = undefined;
      setView(buildView(active));
      return;
    }

    if (immediate) {
      cancelPreviewTask(false);
      pendingPreviewRef.current = undefined;
      nextPreviewAtRef.current = nowMs() + RECORDED_CAPTURE_PREVIEW_INTERVAL_MS;
      setView(buildView(active));
      return;
    }
    if (!documentVisibleRef.current || previewHandleRef.current !== null) return;
    const generation = previewGenerationRef.current;
    const delay = Math.max(0, nextPreviewAtRef.current - nowMs());
    previewHandleRef.current = window.setTimeout(() => {
      previewHandleRef.current = null;
      if (generation !== previewGenerationRef.current) return;
      const latest = pendingPreviewRef.current;
      pendingPreviewRef.current = undefined;
      if (!latest || activeRef.current !== latest || !documentVisibleRef.current) return;
      nextPreviewAtRef.current = nowMs() + RECORDED_CAPTURE_PREVIEW_INTERVAL_MS;
      setView(buildView(latest));
    }, delay);
  }, [buildView, cancelPreviewTask]);

  useEffect(() => () => {
    cancelPreviewTask(true);
  }, [cancelPreviewTask]);

  useEffect(() => {
    if (!documentVisible) {
      cancelPreviewTask(false);
      return;
    }
    const active = activeRef.current;
    if (active) publish(active, true);
  }, [cancelPreviewTask, documentVisible, publish]);

  const sendControl = useCallback((active: ActiveCapture, action: RecordedNoteCaptureStartRequest['action']) => {
    sendControlRef.current?.(controlRequest(active, action));
  }, []);

  const maybeAdvance = useCallback((active: ActiveCapture) => {
    if (active.runtimePhase === 'finishing' && active.controller.getPhase() === 'recording') {
      active.controller.finishLoop(Number.NEGATIVE_INFINITY);
      active.snapshotDirty = true;
      active.pendingBoundary ??= { kind: 'finish' };
    }

    if (active.controller.getPhase() !== 'finishing' || active.runtimePhase !== 'ready' || !watermarkReached(active)) return;
    const finalizeScratch = () => {
      if (!active.scratch) return;
      active.scratch.stop(active.pendingBoundary?.kind === 'stop'
        ? active.pendingBoundary.clockBeat
        : active.currentClockBeat);
      active.snapshotDirty = true;
    };
    if (active.pendingBoundary?.kind === 'stop') {
      finalizeScratch();
      active.controller.stopNow(active.pendingBoundary.clockBeat);
      if (active.scratchOverflowed) {
        active.controller.reportError({
          kind: 'capacity',
          message: `The looping take exceeded its ${RECORDED_NOTE_CAPACITY}-note phrase capacity. Draft retained; discard and record again.`,
          droppedCount: active.overflowCount,
        });
      }
      active.snapshotDirty = true;
      active.pendingBoundary = null;
      return;
    }
    const finishAtBeat = active.controller.getFinishAtBeat();
    if (finishAtBeat !== null && active.currentClockBeat >= finishAtBeat) {
      finalizeScratch();
      active.controller.advanceClock(active.currentClockBeat);
      if (active.scratchOverflowed) {
        active.controller.reportError({
          kind: 'capacity',
          message: `The looping take exceeded its ${RECORDED_NOTE_CAPACITY}-note phrase capacity. Draft retained; discard and record again.`,
          droppedCount: active.overflowCount,
        });
      }
      active.snapshotDirty = true;
      active.pendingBoundary = null;
    }
  }, []);

  const ingestBatch = useCallback((batch: RecordedNoteCaptureBatch) => {
    const active = activeRef.current;
    if (!active || batch.sessionToken !== active.token) return;
    const previousOverflow = active.overflowCount;
    const previousScratchOverflowed = active.scratchOverflowed;
    let receivedNewEvent = false;
    active.runtimePhase = batch.phase;
    if (finite(batch.originBeat) && batch.originBeat !== active.originBeat) {
      const controllerOriginUpdated = active.controller.setOriginBeat(batch.originBeat);
      const scratchOriginUpdated = active.scratch?.setOriginBeat(batch.originBeat) ?? true;
      if (controllerOriginUpdated && scratchOriginUpdated) {
        active.originBeat = batch.originBeat;
        active.snapshotDirty = true;
      } else if (active.controller.getPhase() !== 'error') {
        active.controller.reportError({ kind: 'invalid', message: 'Runtime capture origin changed after note capture began.' });
        active.snapshotDirty = true;
      }
    }
    if (finite(batch.clockBeat)) active.currentClockBeat = batch.clockBeat;
    currentClockRef.current = active.currentClockBeat;

    const scratchEvents: SynthVariationCaptureNote[] = [];
    for (const event of batch.events) {
      if (event.sessionToken !== active.token || active.seenEventIds.has(event.eventId)) continue;
      receivedNewEvent = true;
      active.receivedEventId = Math.max(active.receivedEventId, event.eventId);
      active.seenEventIds.add(event.eventId);
      if (active.seenEventIds.size > RECORDED_NOTE_CAPACITY * 4) {
        const oldest = active.seenEventIds.values().next().value;
        if (typeof oldest === 'number') active.seenEventIds.delete(oldest);
      }
      if (active.scratch) {
        scratchEvents.push({
          id: String(event.eventId),
          onsetBeats: event.onsetBeats,
          durationBeats: event.durationBeats,
          pitch: event.pitch,
          velocity: event.velocity,
          ...(event.sourceId === undefined ? {} : { sourceId: event.sourceId }),
          ...(event.chordGroupId === undefined ? {} : { chordGroupId: event.chordGroupId }),
          ...(event.mode === undefined ? {} : { mode: event.mode }),
          ...(event.chord === undefined ? {} : { chord: event.chord }),
          ...(event.arp === undefined ? {} : { arp: event.arp }),
        });
      } else {
        active.controller.recordNote({
          source: event.source,
          pitch: event.pitch,
          velocity: event.velocity,
          onsetBeats: event.onsetBeats,
          durationBeats: event.durationBeats,
          sourceId: event.sourceId,
          id: event.eventId,
          chordGroupId: event.chordGroupId,
          mode: event.mode,
          chord: event.chord,
          arp: event.arp,
        });
      }
      active.snapshotDirty = true;
    }
    if (active.scratch) {
      const previousCount = active.scratch.noteCount();
      active.scratch.ingestBatch(scratchEvents, active.currentClockBeat);
      if (active.scratch.noteCount() !== previousCount || scratchEvents.length > 0) active.snapshotDirty = true;
      if (active.scratch.isOverflowed()) {
        active.scratchOverflowed = true;
        active.overflowCount = Math.max(active.overflowCount, 1);
      }
    }
    if (batch.finalEventId !== null && finite(batch.finalEventId)) {
      active.finalEventId = Math.max(active.finalEventId ?? 0, batch.finalEventId);
    }
    if (batch.overflowCount > active.overflowCount) {
      active.overflowCount = batch.overflowCount;
      // Native capture can drop events before they reach the page. Treat that
      // telemetry exactly like local scratch overflow so Keep is unavailable
      // even when the retained draft itself still fits the 1024-note bound.
      active.scratchOverflowed = true;
      active.snapshotDirty = true;
    }
    if (batch.error || batch.phase === 'error') {
      active.controller.reportError({ kind: 'acknowledgement', message: batch.error ?? 'Runtime capture failed.' });
      active.snapshotDirty = true;
    }
    // Events are appended before this clock advancement. This ordering is
    // what keeps the final event in a batch inside a finish boundary.
    maybeAdvance(active);
    publish(active,
      receivedNewEvent || active.scratchOverflowed !== previousScratchOverflowed
        || active.overflowCount > previousOverflow
        || batch.finalEventId !== null
        || batch.phase === 'ready'
        || batch.phase === 'error'
        || Boolean(batch.error));
  }, [maybeAdvance, publish]);

  ingestRef.current = ingestBatch;

  useEffect(() => {
    if (!subscribeCapture) return undefined;
    return subscribeCapture((batch) => ingestRef.current(batch));
  }, [subscribeCapture]);

  useEffect(() => () => {
    const active = activeRef.current;
    if (active) sendControlRef.current?.(controlRequest(active, 'cancel'));
  }, []);

  const start = useCallback((request: StartRecordedNoteCaptureRequest = {}) => {
    const existing = activeRef.current;
    if (existing && ['recording', 'finishing', 'pending'].includes(existing.controller.getPhase())) {
      publish(existing);
      return;
    }
    const sourceLaneIndex = safeLaneIndex(request.sourceLaneIndex, activeLaneIndex);
    const targetLaneIndex = safeLaneIndex(request.targetLaneIndex, activeLaneIndex);
    const source = request.source ?? activeSource;
    const mode = request.mode ?? 'replace';
    const correlatedOriginBeat = request.originBeat === undefined ? getCaptureClockBeat?.() : null;
    const originBeat = request.originBeat ?? (
      correlatedOriginBeat !== null && correlatedOriginBeat !== undefined && finite(correlatedOriginBeat)
        ? correlatedOriginBeat
        : currentClockRef.current
    );
    const controller = new RecordedNoteSession({
      durationBeats: request.durationBeats ?? defaultDurationBeats,
      gridSteps: request.gridSteps ?? defaultGridSteps,
      originBeat,
    });
    const state = controller.start(mode, {
      durationBeats: request.durationBeats,
      gridSteps: request.gridSteps,
      originBeat,
    });
    const token = state.token;
    if (!token) {
      const failed: ActiveCapture = {
        controller,
        sourceLaneIndex,
        targetLaneIndex,
        source,
        mode,
        originBeat,
        passDurationBeats: request.durationBeats ?? defaultDurationBeats,
        gridSteps: state.draft?.grid.steps ?? request.gridSteps ?? defaultGridSteps,
        token: `invalid-${Date.now()}`,
        seenEventIds: new Set(),
        currentClockBeat: originBeat,
        receivedEventId: 0,
        finalEventId: null,
        overflowCount: 0,
        pendingBoundary: null,
        runtimePhase: 'error',
        snapshot: null,
        snapshotDirty: true,
        scratch: null,
        scratchNoteSerial: 0,
        scratchOverflowed: false,
      };
      activeRef.current = failed;
      publish(failed, true);
      return;
    }
    const draftDuration = state.draft?.durationBeats ?? (request.durationBeats ?? defaultDurationBeats);
    const captureScratch = new SynthSequenceCaptureScratch(Math.max(1e-6, draftDuration));
    const active: ActiveCapture = {
      controller,
      sourceLaneIndex,
      targetLaneIndex,
      source,
      mode,
      originBeat,
      passDurationBeats: Math.max(1e-6, draftDuration),
      gridSteps: state.draft?.grid.steps ?? request.gridSteps ?? defaultGridSteps,
      token,
      seenEventIds: new Set(),
      currentClockBeat: originBeat,
      receivedEventId: 0,
      finalEventId: null,
      overflowCount: 0,
      pendingBoundary: null,
      runtimePhase: 'recording',
      snapshot: null,
      snapshotDirty: true,
      scratch: captureScratch,
      scratchNoteSerial: 0,
      scratchOverflowed: false,
    };
    captureScratch.start(originBeat, []);
    activeRef.current = active;
    currentClockRef.current = originBeat;
    sendControl(active, 'start');
    publish(active, true);
  }, [activeLaneIndex, activeSource, defaultDurationBeats, defaultGridSteps, getCaptureClockBeat, publish, sendControl]);

  const finishLoop = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    const state = active.controller.finishLoop(Number.NEGATIVE_INFINITY);
    active.snapshotDirty = true;
    if (state.phase === 'finishing') {
      active.pendingBoundary = { kind: 'finish' };
      sendControl(active, 'finish');
      publish(active, true);
    }
  }, [publish, sendControl]);

  const stopNow = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    const correlatedClockBeat = getCaptureClockBeat?.();
    if (correlatedClockBeat !== null && correlatedClockBeat !== undefined && finite(correlatedClockBeat)) {
      active.currentClockBeat = correlatedClockBeat;
      currentClockRef.current = correlatedClockBeat;
    }
    active.controller.finishLoop(Number.NEGATIVE_INFINITY);
    active.snapshotDirty = true;
    active.pendingBoundary = { kind: 'stop', clockBeat: active.currentClockBeat };
    sendControl(active, 'stop');
    publish(active, true);
  }, [getCaptureClockBeat, publish, sendControl]);

  const cancel = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    if (active.controller.getPhase() === 'pending') {
      publish(active);
      return;
    }
    sendControl(active, 'cancel');
    active.scratch?.cancel();
    active.controller.cancel();
    active.snapshotDirty = true;
    activeRef.current = null;
    cancelPreviewTask(true);
    setView(buildView(active));
  }, [buildView, cancelPreviewTask, sendControl]);

  const recordNoteOn = useCallback((inputId: string, pitch: number, velocity: number, clockBeat?: number, sourceId?: number, metadata?: Pick<RecordedNote, 'chordGroupId' | 'mode' | 'chord' | 'arp'>) => {
    const active = activeRef.current;
    if (!active || active.source !== 'keyboard') return null;
    const correlatedClockBeat = getCaptureClockBeat?.();
    const nextClockBeat = finite(clockBeat ?? Number.NaN)
      ? clockBeat!
      : finite(correlatedClockBeat ?? Number.NaN)
        ? correlatedClockBeat!
        : active.currentClockBeat;
    if (finite(nextClockBeat)) active.currentClockBeat = nextClockBeat;
    currentClockRef.current = active.currentClockBeat;
    const onsetBeats = Math.max(0, active.currentClockBeat - active.originBeat);
    if (active.scratch) {
      const scratchId = active.scratch.noteOn(inputId, { pitch, velocity, sourceId, ...metadata }, active.currentClockBeat);
      active.snapshotDirty = true;
      publish(active, true);
      if (!scratchId) return null;
      active.scratchNoteSerial += 1;
      return active.scratchNoteSerial;
    }
    const id = active.controller.noteOn(inputId, {
      source: 'keyboard',
      pitch,
      velocity,
      onsetBeats,
      sourceId,
      ...metadata,
    });
    active.snapshotDirty = true;
    publish(active, true);
    return id;
  }, [getCaptureClockBeat, publish]);

  const recordNoteOff = useCallback((input: { inputId?: string; id?: number; clockBeat?: number }) => {
    const active = activeRef.current;
    if (!active) return false;
    const correlatedClockBeat = getCaptureClockBeat?.();
    const nextClockBeat = finite(input.clockBeat ?? Number.NaN)
      ? input.clockBeat!
      : finite(correlatedClockBeat ?? Number.NaN)
        ? correlatedClockBeat!
        : active.currentClockBeat;
    if (finite(nextClockBeat)) active.currentClockBeat = nextClockBeat;
    currentClockRef.current = active.currentClockBeat;
    const offsetBeats = Math.max(0, active.currentClockBeat - active.originBeat);
    const closed = active.scratch
      ? Boolean(input.inputId && active.scratch.noteOff(input.inputId, active.currentClockBeat))
      : active.controller.noteOff({ id: input.id, inputId: input.inputId, offsetBeats });
    if (closed) {
      active.snapshotDirty = true;
      publish(active, true);
    }
    return closed;
  }, [getCaptureClockBeat, publish]);

  return {
    view,
    isCapturing: view?.recorder.phase === 'recording' || view?.recorder.phase === 'finishing' || view?.recorder.phase === 'pending',
    capturedCount: view?.recorder.retainedNoteCount ?? 0,
    start,
    finishLoop,
    stopNow,
    cancel,
    recordNoteOn,
    recordNoteOff,
    ingestBatch,
  };
}

export { sourceForMode };
