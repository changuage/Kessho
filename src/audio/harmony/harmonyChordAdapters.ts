import {
  defaultHarmonyIntent,
  formatHarmonyIntentChordLabel,
  recognizeHarmonyCandidatesFromMidiPool,
  resolveHarmonyIntentToNotePool,
  sanitizeHarmonyIntent,
  type HarmonyChordSlot,
  type HarmonyIntent,
} from '../CoreProductHarmonyControl';
import type {
  HarmonyCapturedContext,
  HarmonyDraftChord,
  SharedHarmonyChord,
  SharedHarmonyChordSlot,
} from './harmonyTypes';
import { harmonyRequiresSemanticSelection, uniqueHarmonyRecognitionCandidate } from './chordRecognition';
import { HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES, HARMONY_SLOT_COUNT } from '../CoreProductHarmonyControl';

export interface HarmonyChordAdapterContext {
  rootMidi?: number;
  scaleId?: number;
  tension?: number;
}

function semanticMatches(left: HarmonyIntent | null, right: HarmonyIntent | null): boolean {
  if (!left || !right) return left === right;
  return left.rootMode === right.rootMode
    && left.degree === right.degree
    && left.rootNote === right.rootNote
    && left.quality === right.quality
    && [...left.extensions].sort().join(',') === [...right.extensions].sort().join(',')
    && [...(left.alterations ?? [])].sort().join(',') === [...(right.alterations ?? [])].sort().join(',');
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function midiPool(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).map((item) => Math.max(0, Math.min(127, Math.round(item)))))]
    .sort((left, right) => left - right)
    .slice(0, 8);
}

function contextFor(value: unknown, fallbackRoot = 60, fallbackScale = 1): HarmonyCapturedContext {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rootMidi = finite(record.rootMidi, finite(record.rootMidiAnchor, fallbackRoot));
  return {
    rootMidi,
    rootMidiAnchor: finite(record.rootMidiAnchor, rootMidi),
    scaleId: Math.round(finite(record.scaleId, fallbackScale)),
    capturedAt: typeof record.capturedAt === 'number' ? record.capturedAt : undefined,
  };
}

function resolveSnapshot(intent: HarmonyIntent | null, exact: unknown, context: HarmonyCapturedContext, tension: number): number[] {
  const captured = midiPool(exact);
  if (captured.length > 0) return captured;
  if (!intent) return [];
  return resolveHarmonyIntentToNotePool({ intent, rootMidi: context.rootMidi, scaleId: context.scaleId, tension });
}

/** Convert either a legacy slot payload or a shared slot to the new dual model. */
export function legacyHarmonySlotToSharedSlot(value: unknown, context: HarmonyChordAdapterContext = {}): SharedHarmonyChordSlot {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const id = Math.max(0, Math.min(HARMONY_SLOT_COUNT - 1, Math.round(finite(record.id, 0))));
  const name = typeof record.name === 'string' && record.name.trim() ? record.name : `Slot ${id + 1}`;
  const legacy = record as Partial<HarmonyChordSlot>;
  const legacyIntent = legacy.intent ? sanitizeHarmonyIntent(legacy.intent, defaultHarmonyIntent('slot', id % 7)) : null;
  const rawChord = record.chord;
  const hasExplicitChord = Object.prototype.hasOwnProperty.call(record, 'chord');
  if (rawChord === null || (hasExplicitChord && !rawChord)) return { id, name, chord: null, locked: record.locked === true };

  const chordRecord = rawChord && typeof rawChord === 'object' ? rawChord as Record<string, unknown> : {};
  const intent = chordRecord.intent
    ? sanitizeHarmonyIntent(chordRecord.intent, legacyIntent ?? defaultHarmonyIntent('slot', id % 7))
    : legacyIntent;
  const capturedContext = contextFor(chordRecord.capturedContext, context.rootMidi ?? 60, context.scaleId ?? 1);
  const exactMidiNotes = resolveSnapshot(intent, chordRecord.exactMidiNotes ?? chordRecord.capturedMidiNotes ?? record.exactMidiNotes ?? record.capturedMidiNotes ?? legacyIntent?.capturedMidiNotes, capturedContext, context.tension ?? 0.35);
  if (!intent && exactMidiNotes.length === 0) return { id, name, chord: null, locked: record.locked === true };

  const recognitionCandidates = exactMidiNotes.length > 0
    ? recognizeHarmonyCandidatesFromMidiPool({
      midiNotes: exactMidiNotes,
      previousIntent: intent,
      rootMidi: capturedContext.rootMidi,
      scaleId: capturedContext.scaleId,
      tension: context.tension ?? 0.35,
    })
    : [];
  const inferredCandidate = uniqueHarmonyRecognitionCandidate(recognitionCandidates);
  const inferredIntent = intent ?? inferredCandidate?.intent ?? null;
  const intentSource = chordRecord.intentSource === 'inferred' || chordRecord.intentSource === 'confirmed'
    ? chordRecord.intentSource
    : intent ? 'confirmed' : inferredIntent ? 'inferred' : null;
  const preserved = Boolean(inferredIntent?.preserveCapturedVoicing || legacyIntent?.preserveCapturedVoicing || (!intent && (record.capturedMidiNotes || record.exactMidiNotes)));
  const playbackBehavior = (chordRecord.playbackBehavior === 'relative' || chordRecord.playbackBehavior === 'exact' || chordRecord.playbackBehavior === 'auto')
    ? chordRecord.playbackBehavior
    : preserved ? 'exact' : 'auto';
  const chord: SharedHarmonyChord = {
    intent: inferredIntent,
    intentSource,
    exactMidiNotes,
    recognizedLabel: typeof chordRecord.recognizedLabel === 'string' && chordRecord.recognizedLabel.length > 0
      ? chordRecord.recognizedLabel
      : inferredIntent ? formatHarmonyIntentChordLabel(inferredIntent, { rootMidi: capturedContext.rootMidi, scaleId: capturedContext.scaleId }) : 'custom',
    playbackBehavior,
    capturedContext,
    recognitionCandidates: recognitionCandidates.length > 0 ? recognitionCandidates : undefined,
    recognitionMismatch: Boolean(intent && inferredCandidate && !semanticMatches(intent, inferredCandidate.intent)),
    requiresSemanticSelection: harmonyRequiresSemanticSelection({ intent: inferredIntent, playbackBehavior }),
  };
  return { id, name, chord, locked: record.locked === true };
}

/** Temporary compatibility path for old consumers that still require an intent. */
export function sharedHarmonyChordToLegacyIntent(chord: SharedHarmonyChord | null): HarmonyIntent | null {
  return chord?.intent ? { ...chord.intent, capturedMidiNotes: [...chord.intent.capturedMidiNotes] } : null;
}

export function sharedChordResolvedMidiPool(chord: SharedHarmonyChord | null, args: HarmonyChordAdapterContext & { effectiveRootMidi?: number } = {}): number[] {
  if (!chord) return [];
  const exact = midiPool(chord.exactMidiNotes);
  // Relative/Auto semantics for an ambiguous custom capture are pending an
  // explicit candidate or manual Root/Degree/Quality/Extensions selection.
  if (harmonyRequiresSemanticSelection(chord)) return [];
  const rootMidi = finite(args.rootMidi, chord.capturedContext.rootMidi);
  const effectiveRootMidi = finite(args.effectiveRootMidi, rootMidi);
  const displacement = effectiveRootMidi - finite(chord.capturedContext.rootMidiAnchor, chord.capturedContext.rootMidi);
  const useExact = chord.playbackBehavior === 'exact'
    || (chord.playbackBehavior === 'auto' && Math.abs(displacement) <= HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES);
  if (useExact && exact.length > 0) return exact;
  if (!chord.intent) return exact;
  return resolveHarmonyIntentToNotePool({
    intent: chord.intent,
    rootMidi: effectiveRootMidi,
    scaleId: args.scaleId ?? chord.capturedContext.scaleId,
    tension: args.tension ?? 0.35,
  });
}

/** Resolve a saved slot while tolerating legacy callers that mutate `intent` directly. */
export function sharedSlotResolvedMidiPool(slot: { chord: SharedHarmonyChord | null; intent?: HarmonyIntent }, args: HarmonyChordAdapterContext & { effectiveRootMidi?: number } = {}): number[] {
  if (!slot.chord) return [];
  const chord = slot.intent && slot.chord.intent && slot.intent !== slot.chord.intent
    ? editSharedChordIntent(slot.chord, slot.intent, args)
    : slot.chord;
  return sharedChordResolvedMidiPool(chord, args);
}

export const resolveSharedChordPlayback = sharedChordResolvedMidiPool;

export function sharedChordDisplayIntent(chord: SharedHarmonyChord | null): HarmonyIntent | null {
  return chord?.intent ?? null;
}

export function editSharedChordExactNotes(chord: SharedHarmonyChord, exactMidiNotes: readonly number[], context: HarmonyChordAdapterContext = {}): SharedHarmonyChord {
  const exact = midiPool(exactMidiNotes);
  const nextContext = {
    ...chord.capturedContext,
    rootMidi: finite(context.rootMidi, chord.capturedContext.rootMidi),
    rootMidiAnchor: finite(context.rootMidi, finite(chord.capturedContext.rootMidiAnchor, chord.capturedContext.rootMidi)),
    scaleId: Math.round(finite(context.scaleId, chord.capturedContext.scaleId)),
  };
  const recognitionCandidates = exact.length > 0
    ? recognizeHarmonyCandidatesFromMidiPool({ midiNotes: exact, previousIntent: chord.intent, rootMidi: nextContext.rootMidi, scaleId: nextContext.scaleId, tension: context.tension ?? 0.35 })
    : [];
  const inferredCandidate = uniqueHarmonyRecognitionCandidate(recognitionCandidates);
  const recognized = inferredCandidate?.intent ?? null;
  // A confirmed semantic intent is never silently replaced by recognition.
  const nextIntent = chord.intentSource === 'confirmed' ? chord.intent : recognized;
  return {
    ...chord,
    intent: nextIntent,
    intentSource: chord.intentSource === 'confirmed' ? 'confirmed' : nextIntent ? 'inferred' : null,
    exactMidiNotes: exact,
    recognizedLabel: nextIntent ? formatHarmonyIntentChordLabel(nextIntent, { rootMidi: nextContext.rootMidi, scaleId: nextContext.scaleId }) : 'custom',
    capturedContext: nextContext,
    recognitionCandidates: recognitionCandidates.length > 0 ? recognitionCandidates : undefined,
    recognitionMismatch: chord.intentSource === 'confirmed' && Boolean(inferredCandidate && !semanticMatches(chord.intent, inferredCandidate.intent)),
    requiresSemanticSelection: harmonyRequiresSemanticSelection({ intent: nextIntent, playbackBehavior: chord.playbackBehavior }),
  };
}

export function editSharedChordIntent(chord: SharedHarmonyChord, intent: HarmonyIntent | null, context: HarmonyChordAdapterContext = {}): SharedHarmonyChord {
  const nextContext = {
    ...chord.capturedContext,
    rootMidi: finite(context.rootMidi, chord.capturedContext.rootMidi),
    rootMidiAnchor: finite(context.rootMidi, finite(chord.capturedContext.rootMidiAnchor, chord.capturedContext.rootMidi)),
    scaleId: Math.round(finite(context.scaleId, chord.capturedContext.scaleId)),
  };
  const exact = intent
    ? resolveHarmonyIntentToNotePool({ intent, rootMidi: nextContext.rootMidi, scaleId: nextContext.scaleId, tension: context.tension ?? 0.35 })
    : chord.exactMidiNotes;
  return {
    ...chord,
    intent,
    intentSource: intent ? 'confirmed' : null,
    exactMidiNotes: exact,
    recognizedLabel: intent ? formatHarmonyIntentChordLabel(intent, { rootMidi: nextContext.rootMidi, scaleId: nextContext.scaleId }) : 'custom',
    capturedContext: nextContext,
    recognitionCandidates: undefined,
    recognitionMismatch: false,
    requiresSemanticSelection: harmonyRequiresSemanticSelection({ intent, playbackBehavior: chord.playbackBehavior }),
  };
}

export function sharedChordToDraft(chord: SharedHarmonyChord | null): HarmonyDraftChord {
  return {
    intent: chord?.intent ?? null,
    intentSource: chord?.intentSource ?? null,
    exactMidiNotes: chord ? [...chord.exactMidiNotes] : [],
    playbackBehavior: chord?.playbackBehavior ?? 'auto',
    capturedContext: chord?.capturedContext ?? { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
    recognizedLabel: chord?.recognizedLabel ?? 'custom',
    editFocus: null,
    source: 'slot',
    dirty: false,
    recognitionCandidates: chord?.recognitionCandidates,
    recognitionMismatch: chord?.recognitionMismatch,
    requiresSemanticSelection: chord?.requiresSemanticSelection,
  };
}

export function sharedChordFromDraft(draft: HarmonyDraftChord): SharedHarmonyChord {
  return {
    intent: draft.intent,
    intentSource: draft.intentSource ?? (draft.intent ? 'confirmed' : null),
    exactMidiNotes: midiPool(draft.exactMidiNotes),
    recognizedLabel: draft.recognizedLabel,
    playbackBehavior: draft.playbackBehavior,
    capturedContext: draft.capturedContext,
    recognitionCandidates: draft.recognitionCandidates,
    recognitionMismatch: draft.recognitionMismatch,
    requiresSemanticSelection: draft.requiresSemanticSelection,
  };
}
