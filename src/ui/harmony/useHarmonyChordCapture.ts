import { useCallback, useEffect, useRef, useState } from 'react';
import type { HarmonyCapturedContext } from '../../audio/harmony/harmonyTypes';
import {
  createHarmonyDraft,
  draftFromHarmonyCaptureState,
  initialHarmonyCaptureState,
  reduceHarmonyCaptureNoteOff,
  reduceHarmonyCaptureNoteOn,
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
  readonly noteDown: (midi: number, timestampMs?: number) => HarmonyDraftChord;
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
  const [capture, setCapture] = useState<HarmonyCaptureState>(() => initialHarmonyCaptureState());
  const [draft, setDraftState] = useState<HarmonyDraftChord>(() => options.initialDraft ?? createHarmonyDraft({ context: contextRef.current, source: sourceRef.current }));
  const captureRef = useRef(capture);
  const draftRef = useRef(draft);
  captureRef.current = capture;
  draftRef.current = draft;

  const emitDraft = useCallback((nextCapture: HarmonyCaptureState, previousDraft = draftRef.current) => {
    const nextDraft = nextCapture.capturedGesture.length === 0
      ? previousDraft
      : draftFromHarmonyCaptureState(nextCapture, contextRef.current, sourceRef.current, previousDraft);
    setCapture(nextCapture);
    if (nextDraft !== previousDraft) {
      draftRef.current = nextDraft;
      setDraftState(nextDraft);
      options.onDraftChange?.(nextDraft);
    }
    return nextDraft;
  }, [options.onDraftChange]);

  const noteDown = useCallback((midi: number, timestampMs = typeof performance === 'undefined' ? Date.now() : performance.now()) => {
    if (options.enabled === false) return draftRef.current;
    const nextCapture = reduceHarmonyCaptureNoteOn(captureRef.current, midi, timestampMs);
    return emitDraft(nextCapture);
  }, [emitDraft, options.enabled]);

  const noteUp = useCallback((midi: number) => {
    const nextCapture = reduceHarmonyCaptureNoteOff(captureRef.current, midi);
    captureRef.current = nextCapture;
    setCapture(nextCapture);
    return nextCapture;
  }, []);

  const setSustain = useCallback((down: boolean) => {
    const nextCapture = reduceHarmonyCaptureSustain(captureRef.current, down);
    captureRef.current = nextCapture;
    setCapture(nextCapture);
  }, []);

  const releaseAll = useCallback(() => {
    const nextCapture = { ...captureRef.current, heldNotes: new Set<number>(), releaseOccurredSinceLastAddition: true };
    captureRef.current = nextCapture;
    setCapture(nextCapture);
  }, []);

  const reset = useCallback(() => {
    const nextCapture = resetHarmonyCaptureState();
    const nextDraft = createHarmonyDraft({ context: contextRef.current, source: sourceRef.current });
    captureRef.current = nextCapture;
    draftRef.current = nextDraft;
    setCapture(nextCapture);
    setDraftState(nextDraft);
    options.onDraftChange?.(nextDraft);
  }, [options.onDraftChange]);

  const setDraft = useCallback((nextDraft: HarmonyDraftChord) => {
    draftRef.current = nextDraft;
    setDraftState(nextDraft);
    options.onDraftChange?.(nextDraft);
  }, [options.onDraftChange]);

  useEffect(() => () => {
    const nextCapture = { ...captureRef.current, heldNotes: new Set<number>(), releaseOccurredSinceLastAddition: true };
    captureRef.current = nextCapture;
  }, []);

  useEffect(() => {
    if (options.enabled !== false) return;
    const nextCapture = resetHarmonyCaptureState();
    const nextDraft = createHarmonyDraft({ context: contextRef.current, source: sourceRef.current });
    captureRef.current = nextCapture;
    draftRef.current = nextDraft;
    setCapture(nextCapture);
    setDraftState(nextDraft);
  }, [options.enabled]);

  return { draft, capture, noteDown, noteUp, setSustain, releaseAll, reset, setDraft };
}

export default useHarmonyChordCapture;
