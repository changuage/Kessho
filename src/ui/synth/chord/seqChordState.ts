import { sanitizeHarmonyChordSlots, type HarmonyChordSlot } from '../../../audio/CoreProductHarmonyControl';
import { editSharedChordExactNotes, type HarmonyChordAdapterContext } from '../../../audio/harmony/harmonyChordAdapters';
import type { HarmonyDraftChord, HarmonyIntent } from '../../../audio/harmony/harmonyTypes';
import { draftFromHarmonyCaptureState, type HarmonyCaptureState, type HarmonyDraftChord as UiHarmonyDraftChord } from '../../harmony/harmonyDraftChord';
import { captureDraftToSlot, emptyHarmonyDraft, updateDraftExactNotes } from '../../harmony/shared/harmonyDraftHelpers';

export type SeqHarmonyBank = 'A' | 'B';

/** The Seq chord editor writes only the endpoint bank it is currently viewing. */
export function seqHarmonySlotsKey(bank: SeqHarmonyBank): 'harmonyChordSlotsA' | 'harmonyChordSlotsB' {
  return bank === 'B' ? 'harmonyChordSlotsB' : 'harmonyChordSlotsA';
}

export function readSeqHarmonySlots(
  record: Record<string, unknown>,
  bank: SeqHarmonyBank,
  fallback: readonly HarmonyChordSlot[] = [],
): HarmonyChordSlot[] {
  const value = record[seqHarmonySlotsKey(bank)];
  return Array.isArray(value) ? sanitizeHarmonyChordSlots(value) : sanitizeHarmonyChordSlots(fallback);
}

export function writeSeqHarmonySlots(
  record: Record<string, unknown>,
  bank: SeqHarmonyBank,
  slots: readonly HarmonyChordSlot[],
): Record<string, unknown> {
  return { ...record, [seqHarmonySlotsKey(bank)]: slots };
}

/**
 * Apply an exact-note edit to a shared Seq slot. Empty slots are materialized
 * through the same draft/capture path used by the interaction bay; populated
 * slots retain their dual semantic/exact representation while an exact edit
 * can intentionally clear the exact snapshot without deleting confirmed intent.
 */
export function editSeqSharedSlotExactNotes(
  slot: HarmonyChordSlot,
  notes: readonly number[],
  context: HarmonyChordAdapterContext,
): HarmonyChordSlot {
  if (slot.locked) return slot;
  if (slot.chord) {
    return { ...slot, chord: editSharedChordExactNotes(slot.chord, notes, context) };
  }
  if (notes.length === 0) return slot;
  const rootMidi = typeof context.rootMidi === 'number' && Number.isFinite(context.rootMidi) ? context.rootMidi : 60;
  const scaleId = typeof context.scaleId === 'number' && Number.isFinite(context.scaleId) ? context.scaleId : 1;
  const draft = updateDraftExactNotes(
    emptyHarmonyDraft({ rootMidi, rootMidiAnchor: rootMidi, scaleId }),
    notes,
    context,
  );
  return captureDraftToSlot(slot, draft, context);
}

export interface SeqSuggestionDraft {
  notes: readonly number[];
  label: string;
  intent?: HarmonyIntent | null;
  playbackBehavior?: HarmonyDraftChord['playbackBehavior'];
}

export function draftFromSeqCaptureState(
  state: HarmonyCaptureState,
  context: Parameters<typeof draftFromHarmonyCaptureState>[1],
  source: Parameters<typeof draftFromHarmonyCaptureState>[2],
  previousDraft: HarmonyDraftChord,
): HarmonyDraftChord {
  return draftFromHarmonyCaptureState(state, context, source, previousDraft as unknown as UiHarmonyDraftChord) as unknown as HarmonyDraftChord;
}

/** Apply a suggestion as a fresh exact edit; never retain stale semantic intent. */
export function applySeqSuggestionToDraft(draft: HarmonyDraftChord, suggestion: SeqSuggestionDraft): HarmonyDraftChord {
  const base: UiHarmonyDraftChord = {
    ...(draft as UiHarmonyDraftChord),
    intent: null,
    intentSource: null,
    semanticCandidates: [],
    recognitionCandidates: [],
    recognitionMismatch: false,
    requiresSemanticSelection: false,
  };
  const next = updateDraftExactNotes(base, suggestion.notes);
  return {
    ...next,
    intent: suggestion.intent ?? next.intent,
    intentSource: suggestion.intent ? 'confirmed' : next.intentSource,
    playbackBehavior: suggestion.playbackBehavior ?? next.playbackBehavior,
    recognizedLabel: suggestion.label,
    source: 'suggestion',
    dirty: true,
  } as unknown as HarmonyDraftChord;
}
