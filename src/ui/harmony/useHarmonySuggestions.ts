import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HARMONY_SUGGESTION_TRIGGER_KEYS,
  createHarmonySuggestionEngine,
  createSuggestionBankLatch,
  sharedHarmonyPitchAxis,
  type HarmonySuggestion,
  type HarmonySuggestionBank,
  type HarmonySuggestionInput,
  type HarmonySuggestionTriggerKey,
} from '../../audio/harmony/chordSuggestionEngine';

export const HARMONY_SUGGESTION_RECOMPUTE_GROUP_MS = 100;

export interface UseHarmonySuggestionsOptions extends HarmonySuggestionInput {
  nearbyNotes?: readonly (readonly number[])[];
  enabled?: boolean;
  onPreviewStart?: (suggestion: HarmonySuggestion) => void;
  onPreviewRelease?: (suggestion: HarmonySuggestion | null) => void;
}

export interface HarmonySuggestionsController {
  bank: HarmonySuggestionBank;
  suggestions: HarmonySuggestion[];
  axis: { min: number; max: number };
  heldKeys: HarmonySuggestionTriggerKey[];
  isGrouping: boolean;
  press: (key: HarmonySuggestionTriggerKey) => HarmonySuggestion | null;
  release: (key: HarmonySuggestionTriggerKey) => HarmonySuggestionBank;
  stop: () => void;
}

const engine = createHarmonySuggestionEngine();

function inputFingerprint(input: UseHarmonySuggestionsOptions): string {
  return JSON.stringify({
    rootMidi: input.rootMidi,
    scaleId: input.scaleId,
    tension: input.tension,
    currentDraft: input.currentDraft ? { intent: input.currentDraft.intent, exactMidiNotes: input.currentDraft.exactMidiNotes, recognizedLabel: input.currentDraft.recognizedLabel } : null,
    previousChord: input.previousChord,
    nextChord: input.nextChord,
    recentChords: input.recentChords,
    recentTensions: input.recentTensions,
    phrasePosition: input.phrasePosition,
    tonalContext: input.tonalContext?.top ? { root: input.tonalContext.top.rootPitchClass, scale: input.tonalContext.top.scaleId, confidence: input.tonalContext.top.confidence } : null,
    maxCandidates: input.maxCandidates,
    beamWidth: input.beamWidth,
    nearbyNotes: input.nearbyNotes,
  });
}

/** UI/controller-only suggestion bridge. Recomputes are grouped and stale
 * results are discarded; the latch owns physical mapping while keys are held. */
export function useHarmonySuggestions(options: UseHarmonySuggestionsOptions = {}): HarmonySuggestionsController {
  const {
    nearbyNotes = [],
    enabled = true,
    onPreviewStart,
    onPreviewRelease,
    ...engineInput
  } = options;
  const fingerprint = inputFingerprint(options);
  const calculated = useMemo(() => enabled ? engine.bank(engineInput) : Array.from({ length: 8 }, () => null), [enabled, fingerprint]);
  const latchRef = useRef<ReturnType<typeof createSuggestionBankLatch> | null>(null);
  if (!latchRef.current) latchRef.current = createSuggestionBankLatch(calculated);
  const latch = latchRef.current;
  const [bank, setBank] = useState<HarmonySuggestionBank>(() => latch.current());
  const [isGrouping, setIsGrouping] = useState(false);
  const [heldKeys, setHeldKeys] = useState<HarmonySuggestionTriggerKey[]>([]);
  const revisionRef = useRef(0);

  useEffect(() => {
    const revision = ++revisionRef.current;
    setIsGrouping(true);
    const timer = setTimeout(() => {
      if (revisionRef.current !== revision) return;
      setBank(latch.update(calculated));
      setIsGrouping(false);
    }, HARMONY_SUGGESTION_RECOMPUTE_GROUP_MS);
    return () => clearTimeout(timer);
  }, [calculated, latch]);

  const press = useCallback((key: HarmonySuggestionTriggerKey) => {
    const suggestion = latch.press(key);
    setHeldKeys(latch.heldKeys());
    if (suggestion) onPreviewStart?.(suggestion);
    return suggestion;
  }, [latch, onPreviewStart]);

  const release = useCallback((key: HarmonySuggestionTriggerKey) => {
    const suggestion = latch.current()[HARMONY_SUGGESTION_TRIGGER_KEYS.indexOf(key)] ?? null;
    const next = latch.release(key);
    setBank(next);
    setHeldKeys(latch.heldKeys());
    if (latch.heldKeys().length === 0) onPreviewRelease?.(suggestion);
    return next;
  }, [latch, onPreviewRelease]);

  const stop = useCallback(() => {
    for (const key of latch.heldKeys()) latch.release(key);
    setHeldKeys([]);
    setBank(latch.current());
    onPreviewRelease?.(null);
  }, [latch, onPreviewRelease]);

  const axis = useMemo(() => sharedHarmonyPitchAxis([bank], nearbyNotes), [bank, nearbyNotes]);
  const suggestions = useMemo(() => bank.filter((item): item is HarmonySuggestion => item !== null), [bank]);
  return { bank, suggestions, axis, heldKeys, isGrouping, press, release, stop };
}

export default useHarmonySuggestions;
