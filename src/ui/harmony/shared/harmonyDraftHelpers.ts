import {
  HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES,
  recognizeHarmonyCandidatesFromMidiPool,
  resolveHarmonyIntentToNotePool,
  defaultHarmonyIntent,
  type HarmonyIntent,
} from '../../../audio/CoreProductHarmonyControl';
import {
  editSharedChordExactNotes,
  editSharedChordIntent,
  sharedChordToDraft,
  sharedHarmonyChordToLegacyIntent,
} from '../../../audio/harmony/harmonyChordAdapters';
import type {
  HarmonyCapturedContext,
  HarmonyChordExtension,
  HarmonyDraftChord,
  HarmonyRecognitionCandidate,
  SharedHarmonyChord,
  SharedHarmonyChordSlot,
} from '../../../audio/harmony/harmonyTypes';
import { harmonyRequiresSemanticSelection, uniqueHarmonyRecognitionCandidate } from '../../../audio/harmony/chordRecognition';

export { HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES };

export const DRAFT_GROUPING_WINDOW_MS = 100;

export function countSharedSlotUses(
  slotId: number,
  playConfigs: ReadonlyArray<{ chord?: { choiceLength?: number; steps?: ReadonlyArray<{ slotId?: number }> } }>,
  progression: ReadonlyArray<{ slotId?: number | null }> = [],
): number {
  const laneUses = playConfigs.reduce((total, config) => {
    const steps = config.chord?.steps ?? [];
    const length = Math.max(0, Math.min(steps.length, Math.round(config.chord?.choiceLength ?? steps.length)));
    return total + steps.slice(0, length).filter((step) => step.slotId === slotId).length;
  }, 0);
  return laneUses + progression.filter((event) => event.slotId === slotId).length;
}

export function emptyHarmonyDraft(context: HarmonyCapturedContext = { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 }): HarmonyDraftChord {
  return {
    intent: null,
    intentSource: null,
    exactMidiNotes: [],
    semanticCandidates: [],
    quality: null,
    extensions: [],
    playbackBehavior: 'auto',
    capturedContext: context,
    recognizedLabel: 'custom',
    editFocus: null,
    source: 'manualVoicing',
    dirty: false,
  };
}

export function ensureDraftIntent(draft: HarmonyDraftChord): HarmonyIntent {
  return draft.intent ?? defaultHarmonyIntent('manualControl', 0);
}

/** Copy a slot into the draft; callers can safely mutate the returned object. */
export function draftFromSlot(slot: SharedHarmonyChordSlot | null | undefined): HarmonyDraftChord {
  const draft = sharedChordToDraft(slot?.chord ?? null);
  return {
    ...draft,
    exactMidiNotes: draft.exactMidiNotes.slice(),
    semanticCandidates: draft.semanticCandidates?.map((candidate) => ({ ...candidate, intent: { ...candidate.intent } })) ?? [],
    extensions: draft.extensions?.slice() ?? [],
    source: 'slot',
  };
}

export function markDraftChanged(draft: HarmonyDraftChord, patch: Partial<HarmonyDraftChord>): HarmonyDraftChord {
  return { ...draft, ...patch, source: patch.source ?? draft.source ?? 'manualVoicing', editFocus: patch.editFocus ?? draft.editFocus, dirty: true };
}

export function draftFromExactNotes(
  notes: readonly number[],
  context: HarmonyCapturedContext,
  previousIntent: HarmonyIntent | null = null,
): HarmonyDraftChord {
  const exactMidiNotes = Array.from(new Set(notes.map((note) => Math.max(0, Math.min(127, Math.round(note)))))).sort((a, b) => a - b);
  const recognitionCandidates = exactMidiNotes.length > 0
    ? recognizeHarmonyCandidatesFromMidiPool({ midiNotes: exactMidiNotes, previousIntent, rootMidi: context.rootMidi, scaleId: context.scaleId, tension: 0.35 })
    : [];
  const top = recognitionCandidates[0];
  const unique = uniqueHarmonyRecognitionCandidate(recognitionCandidates);
  const intent = previousIntent && previousIntent.preserveCapturedVoicing ? previousIntent : unique?.intent ?? null;
  return {
    intent,
    intentSource: previousIntent ? 'confirmed' : intent ? 'inferred' : null,
    exactMidiNotes,
    semanticCandidates: top ? [{ intent: top.intent, confidence: top.confidence }] : [],
    recognitionCandidates,
    recognitionMismatch: Boolean(previousIntent && unique && (previousIntent.rootNote !== unique.intent.rootNote || previousIntent.quality !== unique.intent.quality)),
    requiresSemanticSelection: harmonyRequiresSemanticSelection({ intent, playbackBehavior: 'auto' }),
    quality: intent?.quality ?? null,
    extensions: (intent?.extensions?.slice() ?? []) as HarmonyChordExtension[],
    playbackBehavior: 'auto',
    capturedContext: context,
    recognizedLabel: intent ? `${intent.rootMode === 'degree' ? `Degree ${intent.degree + 1}` : `Root ${intent.rootNote}`} ${intent.quality}` : 'custom',
    editFocus: 'exact',
    source: 'matrix',
    dirty: true,
  };
}

export function updateDraftExactNotes(draft: HarmonyDraftChord, notes: readonly number[], context?: Partial<HarmonyCapturedContext>): HarmonyDraftChord {
  return draftFromExactNotes(notes, {
    ...draft.capturedContext,
    ...context,
    rootMidi: context?.rootMidi ?? draft.capturedContext.rootMidi,
    rootMidiAnchor: context?.rootMidiAnchor ?? draft.capturedContext.rootMidiAnchor ?? context?.rootMidi ?? draft.capturedContext.rootMidi,
    scaleId: context?.scaleId ?? draft.capturedContext.scaleId,
  }, draft.intent);
}

export function updateDraftIntent(draft: HarmonyDraftChord, intent: HarmonyIntent | null, context?: Partial<HarmonyCapturedContext>): HarmonyDraftChord {
  const nextContext = {
    ...draft.capturedContext,
    ...context,
    rootMidi: context?.rootMidi ?? draft.capturedContext.rootMidi,
    rootMidiAnchor: context?.rootMidiAnchor ?? draft.capturedContext.rootMidiAnchor ?? context?.rootMidi ?? draft.capturedContext.rootMidi,
    scaleId: context?.scaleId ?? draft.capturedContext.scaleId,
  };
  const exactMidiNotes = intent ? resolveHarmonyIntentToNotePool({ intent, rootMidi: nextContext.rootMidi, scaleId: nextContext.scaleId, tension: 0.35 }) : draft.exactMidiNotes;
  return {
    ...draft,
    intent,
    intentSource: intent ? 'confirmed' : null,
    exactMidiNotes,
    quality: intent?.quality ?? null,
    extensions: (intent?.extensions?.slice() ?? []) as HarmonyChordExtension[],
    capturedContext: nextContext,
    recognizedLabel: intent ? `${intent.quality}` : 'custom',
    editFocus: 'semantic',
    source: 'manualVoicing',
    dirty: true,
  };
}

/** Confirm a ranked semantic interpretation without normalizing the user's exact voicing. */
export function adoptDraftRecognitionCandidate(
  draft: HarmonyDraftChord,
  candidate: HarmonyRecognitionCandidate,
): HarmonyDraftChord {
  const intent = {
    ...candidate.intent,
    extensions: [...candidate.intent.extensions],
    alterations: [...(candidate.intent.alterations ?? [])],
    capturedMidiNotes: [...candidate.intent.capturedMidiNotes],
  };
  return {
    ...draft,
    intent,
    intentSource: 'confirmed',
    semanticCandidates: [{ intent, confidence: candidate.confidence }],
    quality: candidate.quality,
    extensions: [...candidate.extensions],
    recognizedLabel: candidate.label,
    playbackBehavior: 'relative',
    recognitionMismatch: false,
    requiresSemanticSelection: false,
    editFocus: 'semantic',
    dirty: true,
  };
}

export function resolveDraftNotes(draft: HarmonyDraftChord, effectiveRootMidi: number, scaleId = draft.capturedContext.scaleId): number[] {
  if (harmonyRequiresSemanticSelection(draft)) return [];
  const anchor = draft.capturedContext.rootMidiAnchor ?? draft.capturedContext.rootMidi;
  const displacement = effectiveRootMidi - anchor;
  if (draft.playbackBehavior !== 'relative' && Math.abs(displacement) <= HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES && draft.exactMidiNotes.length > 0) {
    return draft.exactMidiNotes.slice();
  }
  if (draft.playbackBehavior === 'exact' && draft.exactMidiNotes.length > 0) return draft.exactMidiNotes.slice();
  return draft.intent ? resolveHarmonyIntentToNotePool({ intent: draft.intent, rootMidi: effectiveRootMidi, scaleId, tension: 0.35 }) : draft.exactMidiNotes.slice();
}

export function resolveLiveReanchoredNotes(
  chord: { intent: HarmonyIntent | null; exactMidiNotes: readonly number[]; playbackBehavior: 'auto' | 'relative' | 'exact'; capturedContext: HarmonyCapturedContext },
  pressedRootMidi: number,
  effectiveRootMidi: number,
  scaleId: number,
): number[] {
  if (harmonyRequiresSemanticSelection(chord)) return [];
  if (chord.playbackBehavior === 'exact' && chord.exactMidiNotes.length > 0) return [...chord.exactMidiNotes];
  const displacement = pressedRootMidi - (chord.capturedContext.rootMidiAnchor ?? chord.capturedContext.rootMidi);
  if (chord.playbackBehavior === 'auto' && Math.abs(displacement) <= HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES && chord.exactMidiNotes.length > 0) return [...chord.exactMidiNotes];
  return chord.intent ? resolveHarmonyIntentToNotePool({ intent: chord.intent, rootMidi: chord.playbackBehavior === 'relative' ? pressedRootMidi : effectiveRootMidi + (pressedRootMidi - effectiveRootMidi), scaleId, tension: 0.35 }) : [...chord.exactMidiNotes];
}

/** One authored Capture command. It never mutates the source slot or draft object. */
export function captureDraftToSlot(slot: SharedHarmonyChordSlot, draft: HarmonyDraftChord, context?: Partial<HarmonyCapturedContext>): SharedHarmonyChordSlot {
  if (slot.locked) return slot;
  if (!draft.intent && draft.exactMidiNotes.length === 0) return slot;
  const capturedContext = { ...draft.capturedContext, ...context };
  let chord: SharedHarmonyChord = {
    ...draft,
    intentSource: draft.intentSource ?? (draft.intent ? 'confirmed' : null),
    exactMidiNotes: draft.exactMidiNotes.slice(),
    recognizedLabel: draft.recognizedLabel,
    capturedContext,
    editFocus: undefined,
  } as unknown as SharedHarmonyChord;
  if (draft.intent) chord = editSharedChordIntent(chord, draft.intent, capturedContext);
  else if (draft.exactMidiNotes.length > 0) chord = editSharedChordExactNotes(chord, draft.exactMidiNotes, capturedContext);
  return { ...slot, chord };
}

export function slotIntent(slot: SharedHarmonyChordSlot | null | undefined): HarmonyIntent | null {
  return slot?.chord ? sharedHarmonyChordToLegacyIntent(slot.chord) : null;
}
