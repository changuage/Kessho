import {
  HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES,
  recognizeHarmonyCandidatesFromMidiPool,
  resolveHarmonyIntentToNotePool,
  defaultHarmonyIntent,
  type HarmonyIntent,
} from '../../audio/CoreProductHarmonyControl';
import type {
  HarmonyCapturedContext,
  HarmonyChordExtension,
  HarmonyChordQuality,
  HarmonyDraftChord as AudioHarmonyDraftChord,
  HarmonyPlaybackBehavior,
} from '../../audio/harmony/harmonyTypes';
import { harmonyRequiresSemanticSelection, uniqueHarmonyRecognitionCandidate } from '../../audio/harmony/chordRecognition';

/** The one draft representation shared by Detail and all four Seq chord bays. */
export interface HarmonyDraftChord extends Omit<AudioHarmonyDraftChord, 'intentSource' | 'semanticCandidates' | 'quality' | 'extensions' | 'source'> {
  intentSource: 'inferred' | 'confirmed' | null;
  semanticCandidates: Array<{ intent: HarmonyIntent; confidence: number }>;
  quality: HarmonyChordQuality | null;
  extensions: HarmonyChordExtension[];
  source: 'qwerty' | 'midi' | 'onscreen' | 'manualVoicing' | 'matrix' | 'suggestion' | 'slot';
}

export type HarmonyDraftPlaybackBehavior = PlaybackBehavior;
export type PlaybackBehavior = HarmonyPlaybackBehavior;

export interface HarmonyDraftOptions {
  readonly context?: HarmonyCapturedContext;
  readonly source?: HarmonyDraftChord['source'];
}

export interface HarmonyCaptureState {
  readonly heldNotes: Set<number>;
  readonly capturedGesture: number[];
  readonly releaseOccurredSinceLastAddition: boolean;
  readonly sustainDown: boolean;
  readonly groupingStartedAt: number | null;
  /** Notes released while sustain was down; physically held keys are retained. */
  readonly sustainReleasedNotes: Set<number>;
}

export const HARMONY_DRAFT_GROUPING_WINDOW_MS = 100;

const clampMidi = (note: number) => Math.max(0, Math.min(127, Math.round(note)));
const uniqueSorted = (notes: Iterable<number>) => Array.from(new Set(Array.from(notes, clampMidi))).sort((a, b) => a - b);

export function createHarmonyDraft(options: HarmonyDraftOptions = {}): HarmonyDraftChord {
  const context = options.context ?? { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 };
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
    source: options.source ?? 'manualVoicing',
    dirty: false,
  };
}

export function draftFromCapturedNotes(
  notes: readonly number[],
  context: HarmonyCapturedContext,
  source: HarmonyDraftChord['source'] = 'midi',
  previousIntent: HarmonyIntent | null = null,
): HarmonyDraftChord {
  const exactMidiNotes = uniqueSorted(notes);
  const recognitionCandidates = exactMidiNotes.length > 0
    ? recognizeHarmonyCandidatesFromMidiPool({ midiNotes: exactMidiNotes, previousIntent, rootMidi: context.rootMidi, scaleId: context.scaleId, tension: 0.35 })
    : [];
  const top = recognitionCandidates[0];
  const unique = uniqueHarmonyRecognitionCandidate(recognitionCandidates);
  const intent = previousIntent && previousIntent.preserveCapturedVoicing ? previousIntent : unique?.intent ?? null;
  return {
    ...createHarmonyDraft({ context, source }),
    intent,
    intentSource: intent ? (previousIntent ? 'confirmed' : 'inferred') : null,
    exactMidiNotes,
    semanticCandidates: top ? [{ intent: top.intent, confidence: top.confidence }] : [],
    recognitionCandidates,
    recognitionMismatch: Boolean(previousIntent && unique && (previousIntent.rootNote !== unique.intent.rootNote || previousIntent.quality !== unique.intent.quality)),
    requiresSemanticSelection: harmonyRequiresSemanticSelection({ intent, playbackBehavior: 'auto' }),
    quality: intent?.quality ?? null,
    extensions: (intent?.extensions?.slice() ?? []) as HarmonyChordExtension[],
    recognizedLabel: intent ? `${intent.rootMode === 'degree' ? `Degree ${intent.degree + 1}` : `Root ${intent.rootNote}`} ${intent.quality}` : 'custom',
    editFocus: 'exact',
    dirty: true,
  };
}

export function setDraftPlaybackBehavior(draft: HarmonyDraftChord, playbackBehavior: PlaybackBehavior): HarmonyDraftChord {
  return { ...draft, playbackBehavior, dirty: true };
}

/** Resolve without ever discarding either semantic intent or captured MIDI. */
export function resolveHarmonyDraftNotes(draft: HarmonyDraftChord, effectiveRootMidi: number, scaleId = draft.capturedContext.scaleId): number[] {
  if (harmonyRequiresSemanticSelection(draft)) return [];
  const anchor = draft.capturedContext.rootMidiAnchor ?? draft.capturedContext.rootMidi;
  const displacement = effectiveRootMidi - anchor;
  if (draft.playbackBehavior === 'exact') return draft.exactMidiNotes.slice();
  if (draft.playbackBehavior === 'auto' && draft.exactMidiNotes.length > 0 && Math.abs(displacement) <= HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES) {
    return draft.exactMidiNotes.slice();
  }
  return draft.intent
    ? resolveHarmonyIntentToNotePool({ intent: draft.intent, rootMidi: effectiveRootMidi, scaleId, tension: 0.35 })
    : draft.exactMidiNotes.slice();
}

/** Draft-only voicing experiment; it never edits Home Root, slots, or progression. */
export function resolveHarmonyDraftRerootPreview(
  draft: HarmonyDraftChord,
  effectiveRootMidi: number,
  rerootSemitones: number,
  scaleId = draft.capturedContext.scaleId,
): number[] {
  const notes = resolveHarmonyDraftNotes(draft, effectiveRootMidi, scaleId);
  const shift = Math.max(-24, Math.min(24, Math.round(rerootSemitones)));
  return notes.map((note) => Math.max(0, Math.min(127, note + shift)));
}

export function harmonyDraftWithIntent(draft: HarmonyDraftChord, intent: HarmonyIntent | null): HarmonyDraftChord {
  return {
    ...draft,
    intent,
    intentSource: intent ? 'confirmed' : null,
    quality: intent?.quality ?? null,
    extensions: (intent?.extensions?.slice() ?? []) as HarmonyChordExtension[],
    dirty: true,
  };
}

export function initialHarmonyCaptureState(): HarmonyCaptureState {
  return { heldNotes: new Set(), capturedGesture: [], releaseOccurredSinceLastAddition: false, sustainDown: false, groupingStartedAt: null, sustainReleasedNotes: new Set() };
}

export function reduceHarmonyCaptureNoteOn(
  state: HarmonyCaptureState,
  note: number,
  timestampMs: number,
): HarmonyCaptureState {
  const midi = clampMidi(note);
  const heldNotes = new Set(state.heldNotes);
  if (heldNotes.has(midi)) return state;
  heldNotes.add(midi);
  const withinInitialGrouping = state.groupingStartedAt != null && timestampMs - state.groupingStartedAt <= HARMONY_DRAFT_GROUPING_WINDOW_MS;
  const groupingExpired = state.groupingStartedAt != null && !withinInitialGrouping;
  const restart = state.releaseOccurredSinceLastAddition || state.capturedGesture.length === 0 || groupingExpired;
  const capturedGesture = restart
    ? uniqueSorted(heldNotes)
    : uniqueSorted([...state.capturedGesture, midi]);
  return {
    ...state,
    heldNotes,
    capturedGesture,
    releaseOccurredSinceLastAddition: false,
    groupingStartedAt: restart ? timestampMs : state.groupingStartedAt ?? timestampMs,
    sustainReleasedNotes: new Set(state.sustainReleasedNotes),
  };
}

export function reduceHarmonyCaptureNoteOff(state: HarmonyCaptureState, note: number): HarmonyCaptureState {
  const midi = clampMidi(note);
  if (state.sustainDown) {
    const sustainReleasedNotes = new Set(state.sustainReleasedNotes);
    sustainReleasedNotes.add(midi);
    return { ...state, releaseOccurredSinceLastAddition: true, sustainReleasedNotes };
  }
  const heldNotes = new Set(state.heldNotes);
  heldNotes.delete(midi);
  return { ...state, heldNotes, releaseOccurredSinceLastAddition: true, sustainReleasedNotes: new Set(state.sustainReleasedNotes) };
}

export function reduceHarmonyCaptureSustain(state: HarmonyCaptureState, down: boolean): HarmonyCaptureState {
  if (down === state.sustainDown) return state;
  if (down) return { ...state, sustainDown: true, sustainReleasedNotes: new Set() };
  const heldNotes = new Set(state.heldNotes);
  for (const note of state.sustainReleasedNotes) heldNotes.delete(note);
  return { ...state, sustainDown: false, heldNotes, sustainReleasedNotes: new Set(), releaseOccurredSinceLastAddition: true };
}

export function resetHarmonyCaptureState(): HarmonyCaptureState { return initialHarmonyCaptureState(); }

export function draftFromHarmonyCaptureState(
  state: HarmonyCaptureState,
  context: HarmonyCapturedContext,
  source: HarmonyDraftChord['source'] = 'midi',
  previousDraft?: HarmonyDraftChord,
): HarmonyDraftChord {
  return draftFromCapturedNotes(state.capturedGesture, context, source, previousDraft?.intent ?? null);
}

// Keep this export discoverable for callers that previously imported the default intent.
export { defaultHarmonyIntent };
