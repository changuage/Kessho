import { useCallback, useEffect, useRef, useState } from 'react';
import type { HarmonyCapturedContext } from '../../audio/harmony/harmonyTypes';
import {
  createHarmonyDraft,
  draftFromHarmonyCaptureState,
  HARMONY_DRAFT_GROUPING_WINDOW_MS,
  initialHarmonyCaptureState,
  reduceHarmonyCaptureNoteOff,
  reduceHarmonyCaptureNoteOn,
  reduceHarmonyCaptureReleaseAll,
  reduceHarmonyCaptureSettled,
  reduceHarmonyCaptureSustain,
  resetHarmonyCaptureState,
  type HarmonyCaptureState,
  type HarmonyDraftChord,
} from './harmonyDraftChord';

export interface UseHarmonyChordCaptureOptions {
  readonly context?: HarmonyCapturedContext;
  readonly source?: HarmonyDraftChord['source'];
  readonly initialDraft?: HarmonyDraftChord;
  readonly enabled?: boolean;
  readonly onDraftChange?: (draft: HarmonyDraftChord) => void;
}

export interface HarmonyChordCaptureController {
  readonly draft: HarmonyDraftChord;
  readonly capture: HarmonyCaptureState;
  readonly noteDown: (midi: number, timestampMs?: number, velocity?: number) => HarmonyDraftChord;
  readonly noteUp: (midi: number) => HarmonyCaptureState;
  readonly setSustain: (down: boolean) => void;
  readonly releaseAll: () => void;
  readonly reset: () => void;
  readonly setDraft: (draft: HarmonyDraftChord) => void;
}

/**
 * Shared QWERTY/MIDI/on-screen capture grammar. Note release is deliberately
 * non-destructive: the visible draft remains the captured gesture until the
 * next note-on starts a new gesture from currently held notes plus that note.
 *
 * MIDI ownership is intentionally App-level: `useLiveNoteInput` normalizes
 * hardware MIDI into this controller's noteDown/noteUp/sustain surface. There
 * is no component-local MIDI subscription to compete with the single keyboard
 * scope, so this hook does not claim a second hardware bridge.
 */
export function useHarmonyChordCapture(options: UseHarmonyChordCaptureOptions = {}): HarmonyChordCaptureController {
  const contextRef = useRef(options.context ?? { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 });
  const sourceRef = useRef(options.source ?? 'midi');
  contextRef.current = options.context ?? contextRef.current;
  sourceRef.current = options.source ?? sourceRef.current;
  const [capture, setCapture] = useState<HarmonyCaptureState>(() => ({
    ...initialHarmonyCaptureState(),
    capturedGesture: options.initialDraft?.exactMidiNotes.slice() ?? [],
  }));
  const [draft, setDraftState] = useState<HarmonyDraftChord>(() => options.initialDraft ?? createHarmonyDraft({ context: contextRef.current, source: sourceRef.current }));
  const captureRef = useRef(capture);
  const draftRef = useRef(draft);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  captureRef.current = capture;
  draftRef.current = draft;

  const emitDraft = useCallback((nextCapture: HarmonyCaptureState, previousDraft = draftRef.current) => {
    const gestureChanged = nextCapture.capturedGesture.length !== captureRef.current.capturedGesture.length
      || nextCapture.capturedGesture.some((note, index) => note !== captureRef.current.capturedGesture[index]);
    captureRef.current = nextCapture;
    const nextDraft = nextCapture.capturedGesture.length === 0
      ? previousDraft
      : gestureChanged
        ? draftFromHarmonyCaptureState(nextCapture, contextRef.current, sourceRef.current, previousDraft)
        : previousDraft;
    setCapture(nextCapture);
    if (nextDraft !== previousDraft) {
      draftRef.current = nextDraft;
      setDraftState(nextDraft);
      options.onDraftChange?.(nextDraft);
    }
    return nextDraft;
  }, [options.onDraftChange]);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current === null) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const scheduleSettle = useCallback((nextCapture: HarmonyCaptureState) => {
    clearSettleTimer();
    if (nextCapture.pendingStartedAt == null || nextCapture.pendingGesture.length < 3) return;
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const delay = Math.max(0, HARMONY_DRAFT_GROUPING_WINDOW_MS - (now - nextCapture.pendingStartedAt));
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      const settledAt = typeof performance === 'undefined' ? Date.now() : performance.now();
      emitDraft(reduceHarmonyCaptureSettled(captureRef.current, settledAt));
    }, delay + 1);
  }, [clearSettleTimer, emitDraft]);

  const noteDown = useCallback((midi: number, timestampMs = typeof performance === 'undefined' ? Date.now() : performance.now(), velocity?: number) => {
    if (options.enabled === false) return draftRef.current;
    const nextCapture = reduceHarmonyCaptureNoteOn(captureRef.current, midi, timestampMs, velocity);
    const nextDraft = emitDraft(nextCapture);
    scheduleSettle(nextCapture);
    return nextDraft;
  }, [emitDraft, options.enabled, scheduleSettle]);

  const noteUp = useCallback((midi: number) => {
    const nextCapture = reduceHarmonyCaptureNoteOff(captureRef.current, midi);
    clearSettleTimer();
    emitDraft(nextCapture);
    return nextCapture;
  }, [clearSettleTimer, emitDraft]);

  const setSustain = useCallback((down: boolean) => {
    const nextCapture = reduceHarmonyCaptureSustain(captureRef.current, down);
    captureRef.current = nextCapture;
    setCapture(nextCapture);
  }, []);

  const releaseAll = useCallback(() => {
    clearSettleTimer();
    emitDraft(reduceHarmonyCaptureReleaseAll(captureRef.current));
  }, [clearSettleTimer, emitDraft]);

  const reset = useCallback(() => {
    clearSettleTimer();
    const nextCapture = resetHarmonyCaptureState();
    const nextDraft = createHarmonyDraft({ context: contextRef.current, source: sourceRef.current });
    captureRef.current = nextCapture;
    draftRef.current = nextDraft;
    setCapture(nextCapture);
    setDraftState(nextDraft);
    options.onDraftChange?.(nextDraft);
  }, [clearSettleTimer, options.onDraftChange]);

  const setDraft = useCallback((nextDraft: HarmonyDraftChord) => {
    const nextCapture = {
      ...captureRef.current,
      capturedGesture: nextDraft.exactMidiNotes.slice(),
      pendingGesture: [],
      pendingStartedAt: null,
    };
    captureRef.current = nextCapture;
    setCapture(nextCapture);
    draftRef.current = nextDraft;
    setDraftState(nextDraft);
    options.onDraftChange?.(nextDraft);
  }, [options.onDraftChange]);

  useEffect(() => () => {
    clearSettleTimer();
    captureRef.current = reduceHarmonyCaptureReleaseAll(captureRef.current);
  }, [clearSettleTimer]);

  useEffect(() => {
    if (options.enabled !== false) return;
    clearSettleTimer();
    const nextCapture = resetHarmonyCaptureState();
    const nextDraft = createHarmonyDraft({ context: contextRef.current, source: sourceRef.current });
    captureRef.current = nextCapture;
    draftRef.current = nextDraft;
    setCapture(nextCapture);
    setDraftState(nextDraft);
  }, [clearSettleTimer, options.enabled]);

  return { draft, capture, noteDown, noteUp, setSustain, releaseAll, reset, setDraft };
}

export default useHarmonyChordCapture;
