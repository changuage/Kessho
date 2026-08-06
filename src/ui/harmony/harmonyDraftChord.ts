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

export type HarmonyMidiCaptureEvent =
  | { readonly kind: 'noteOn'; readonly midi: number; readonly velocity: number; readonly timestampMs?: number }
  | { readonly kind: 'noteOff'; readonly midi: number; readonly timestampMs?: number }
  | { readonly kind: 'sustain'; readonly down: boolean; readonly timestampMs?: number };

const harmonyMidiCaptureListeners = new Set<(event: HarmonyMidiCaptureEvent) => void>();

/** Register the currently active Detail capture surface for hardware MIDI. */
export function subscribeHarmonyMidiCapture(listener: (event: HarmonyMidiCaptureEvent) => void): () => void {
  harmonyMidiCaptureListeners.add(listener);
  return () => harmonyMidiCaptureListeners.delete(listener);
}

/** Fan out normalized MIDI capture events without creating a second MIDI input subscription. */
export function publishHarmonyMidiCapture(event: HarmonyMidiCaptureEvent): void {
  for (const listener of harmonyMidiCaptureListeners) listener(event);
}

export interface HarmonyDraftOptions {
  readonly context?: HarmonyCapturedContext;
  readonly source?: HarmonyDraftChord['source'];
}

export interface HarmonyCaptureState {
  readonly heldNotes: Set<number>;
  readonly velocities: Map<number, number>;
  /** Last complete manual chord. Note-off events never shrink this set. */
  readonly capturedGesture: number[];
  /** Candidate being collected before it replaces the retained chord. */
  readonly pendingGesture: number[];
  readonly releaseOccurredSinceLastAddition: boolean;
  readonly sustainDown: boolean;
  readonly groupingStartedAt: number | null;
  readonly pendingStartedAt: number | null;
  /** True until the first release in a gesture that began with no held notes. */
  readonly gestureStartedFromSilence: boolean;
  /** Notes released while sustain was down; physically held keys are retained. */
  readonly sustainReleasedNotes: Set<number>;
}

export const HARMONY_DRAFT_GROUPING_WINDOW_MS = 150;
export const HARMONY_DRAFT_MIN_CHORD_NOTES = 3;

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
  velocities?: ReadonlyMap<number, number>,
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
    exactMidiVelocities: velocities ? Object.fromEntries(exactMidiNotes.flatMap((note) => {
      const velocity = velocities.get(note);
      return typeof velocity === 'number' && Number.isFinite(velocity) ? [[String(note), Math.max(0, Math.min(1, velocity))]] : [];
    })) : undefined,
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
  return {
    heldNotes: new Set(),
    velocities: new Map(),
    capturedGesture: [],
    pendingGesture: [],
    releaseOccurredSinceLastAddition: false,
    sustainDown: false,
    groupingStartedAt: null,
    pendingStartedAt: null,
    gestureStartedFromSilence: false,
    sustainReleasedNotes: new Set(),
  };
}

function heldSetContainsNewChordTone(heldNotes: ReadonlySet<number>, retained: readonly number[]): boolean {
  if (retained.length === 0) return true;
  const retainedSet = new Set(retained);
  for (const note of heldNotes) if (!retainedSet.has(note)) return true;
  return false;
}

function commitPendingGesture(state: HarmonyCaptureState): HarmonyCaptureState {
  if (state.pendingGesture.length < HARMONY_DRAFT_MIN_CHORD_NOTES) {
    return { ...state, pendingGesture: [], pendingStartedAt: null };
  }
  return {
    ...state,
    capturedGesture: uniqueSorted(state.pendingGesture),
    pendingGesture: [],
    pendingStartedAt: null,
  };
}

export function reduceHarmonyCaptureNoteOn(
  state: HarmonyCaptureState,
  note: number,
  timestampMs: number,
  velocity?: number,
): HarmonyCaptureState {
  const midi = clampMidi(note);
  const heldNotes = new Set(state.heldNotes);
  if (heldNotes.has(midi)) return state;
  heldNotes.add(midi);
  const velocities = new Map(state.velocities);
  if (typeof velocity === 'number' && Number.isFinite(velocity)) velocities.set(midi, Math.max(0, Math.min(1, velocity)));
  const startedFromSilence = state.heldNotes.size === 0;
  const gestureStartedFromSilence = startedFromSilence || state.gestureStartedFromSilence;
  const qualifiesAsChord = heldNotes.size >= HARMONY_DRAFT_MIN_CHORD_NOTES
    && (
      gestureStartedFromSilence
      || state.capturedGesture.length === 0
      || heldSetContainsNewChordTone(heldNotes, state.capturedGesture)
    );
  return {
    ...state,
    heldNotes,
    velocities,
    pendingGesture: qualifiesAsChord ? uniqueSorted(heldNotes) : state.pendingGesture.slice(),
    releaseOccurredSinceLastAddition: false,
    groupingStartedAt: startedFromSilence ? timestampMs : state.groupingStartedAt ?? timestampMs,
    pendingStartedAt: qualifiesAsChord ? timestampMs : state.pendingStartedAt,
    gestureStartedFromSilence,
    sustainReleasedNotes: new Set(state.sustainReleasedNotes),
  };
}

export function reduceHarmonyCaptureNoteOff(state: HarmonyCaptureState, note: number): HarmonyCaptureState {
  const midi = clampMidi(note);
  const committed = commitPendingGesture(state);
  if (state.sustainDown) {
    const sustainReleasedNotes = new Set(state.sustainReleasedNotes);
    sustainReleasedNotes.add(midi);
    return {
      ...committed,
      releaseOccurredSinceLastAddition: true,
      gestureStartedFromSilence: false,
      sustainReleasedNotes,
    };
  }
  const heldNotes = new Set(committed.heldNotes);
  heldNotes.delete(midi);
  return {
    ...committed,
    heldNotes,
    releaseOccurredSinceLastAddition: true,
    groupingStartedAt: heldNotes.size === 0 ? null : committed.groupingStartedAt,
    gestureStartedFromSilence: false,
    sustainReleasedNotes: new Set(committed.sustainReleasedNotes),
  };
}

export function reduceHarmonyCaptureSustain(state: HarmonyCaptureState, down: boolean): HarmonyCaptureState {
  if (down === state.sustainDown) return state;
  if (down) return { ...state, sustainDown: true, sustainReleasedNotes: new Set() };
  const heldNotes = new Set(state.heldNotes);
  for (const note of state.sustainReleasedNotes) heldNotes.delete(note);
  return {
    ...state,
    sustainDown: false,
    heldNotes,
    groupingStartedAt: heldNotes.size === 0 ? null : state.groupingStartedAt,
    gestureStartedFromSilence: false,
    sustainReleasedNotes: new Set(),
    releaseOccurredSinceLastAddition: true,
  };
}

/** Commit a stable near-simultaneous note-on cluster without polling. */
export function reduceHarmonyCaptureSettled(state: HarmonyCaptureState, timestampMs: number): HarmonyCaptureState {
  if (
    state.pendingStartedAt == null
    || timestampMs - state.pendingStartedAt < HARMONY_DRAFT_GROUPING_WINDOW_MS
  ) return state;
  return commitPendingGesture(state);
}

/** Blur/unmount releases sound but preserves the largest complete chord gesture. */
export function reduceHarmonyCaptureReleaseAll(state: HarmonyCaptureState): HarmonyCaptureState {
  const committed = commitPendingGesture(state);
  return {
    ...committed,
    heldNotes: new Set(),
    groupingStartedAt: null,
    gestureStartedFromSilence: false,
    releaseOccurredSinceLastAddition: true,
    sustainDown: false,
    sustainReleasedNotes: new Set(),
  };
}

export function resetHarmonyCaptureState(): HarmonyCaptureState { return initialHarmonyCaptureState(); }

export function draftFromHarmonyCaptureState(
  state: HarmonyCaptureState,
  context: HarmonyCapturedContext,
  source: HarmonyDraftChord['source'] = 'midi',
  previousDraft?: HarmonyDraftChord,
): HarmonyDraftChord {
  return draftFromCapturedNotes(state.capturedGesture, context, source, previousDraft?.intent ?? null, state.velocities);
}

// Keep this export discoverable for callers that previously imported the default intent.
export { defaultHarmonyIntent };
