import type { ResolvedHarmonyFrame } from './harmonyTypes';
import type { HarmonyDraftChord } from './harmonyTypes';
import type { HarmonyLiveLayer } from './harmonyProjection';
import { HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES, resolveHarmonyIntentToNotePool } from '../CoreProductHarmonyControl';
import { harmonyRequiresSemanticSelection } from './chordRecognition';

export type LiveChordScope =
  | 'detail-draft'
  | 'detail-live'
  | 'overview'
  | { kind: 'seq'; seqId: number };
export type LiveChordTarget = 'track' | 'harmony';
export type LiveChordSource = 'qwerty' | 'midi' | 'onscreen' | 'slot' | 'suggestion';
export type LiveChordPhase = 'start' | 'update' | 'release' | 'stop';

/** Bounded event envelope shared by Detail, Overview, suggestions, and Seq. */
export interface LiveChordGesture {
  id: string;
  scope: LiveChordScope;
  target: LiveChordTarget;
  source: LiveChordSource;
  phase: LiveChordPhase;
  anchorPitchClass?: number;
  slotId?: number;
  draft?: HarmonyDraftChord;
  velocity?: number;
  latched: boolean;
}

export interface LiveChordExecution {
  readonly target: LiveChordTarget;
  readonly notes: number[];
  readonly entersAtAudioBlock: number;
  readonly temporaryHarmonyFrame: ResolvedHarmonyFrame | null;
  readonly bypassesHarmony: boolean;
}

export function shouldEmitLiveChordMonitorNotes(args: { target: LiveChordTarget; running: boolean; bypassesHarmony: boolean }): boolean {
  return args.target === 'track' || !args.running || args.bypassesHarmony;
}

export interface LiveChordLayerController {
  start: (gestureId: string, layer: HarmonyLiveLayer) => void;
  release: (gestureId: string) => void;
  clear: () => void;
  activeGestureId: () => string | null;
}

/** Small imperative bridge used by App/UI so an old release cannot clear a newer layer. */
export function createLiveChordLayerController(onLayerChange: (layer: HarmonyLiveLayer | null) => void): LiveChordLayerController {
  let activeId: string | null = null;
  const clear = () => { activeId = null; onLayerChange(null); };
  return {
    start: (gestureId, layer) => { activeId = gestureId; onLayerChange(layer); },
    release: (gestureId) => { if (activeId === gestureId) clear(); },
    clear,
    activeGestureId: () => activeId,
  };
}

function clampBlock(block: number): number { return Number.isFinite(block) ? Math.max(0, Math.floor(block)) : 0; }

/** The next block is deliberately immediate for both stopped and running engines. */
export function nextSafeAudioBlock(currentAudioBlock: number, _running: boolean): number {
  return clampBlock(currentAudioBlock) + 1;
}

export function createLiveChordGesture(input: Omit<LiveChordGesture, 'phase' | 'latched'> & Partial<Pick<LiveChordGesture, 'latched'>>): LiveChordGesture {
  return { ...input, phase: 'start', latched: input.latched ?? false };
}

export function releaseLiveChordGesture(gesture: LiveChordGesture, latched = gesture.latched): LiveChordGesture {
  return { ...gesture, phase: latched ? 'update' : 'release', latched };
}

export function stopLiveChordGesture(gesture: LiveChordGesture): LiveChordGesture {
  return { ...gesture, phase: 'stop', latched: false };
}

function frameForDraft(base: ResolvedHarmonyFrame, notes: readonly number[]): ResolvedHarmonyFrame {
  const safeNotes = notes.slice(0, 8);
  return {
    ...base,
    currentNotePool: safeNotes,
    nextNotePool: safeNotes,
    rootMidi: safeNotes[0] ?? base.rootMidi,
    effectiveRootMidiAnchor: safeNotes[0] ?? base.effectiveRootMidiAnchor,
    activeSource: 'audition',
    activeStepIndex: null,
    activeSlotId: null,
    nextSource: null,
    nextStepIndex: null,
  };
}

function resolveDraftNotes(draft: HarmonyDraftChord, effectiveRootMidi: number, scaleId: number): number[] {
  const exact = draft.exactMidiNotes.slice();
  if (harmonyRequiresSemanticSelection(draft)) return [];
  if (draft.playbackBehavior === 'exact') return exact;
  const anchor = draft.capturedContext.rootMidiAnchor ?? draft.capturedContext.rootMidi;
  if (draft.playbackBehavior === 'auto' && exact.length > 0 && Math.abs(effectiveRootMidi - anchor) <= HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES) return exact;
  return draft.intent ? resolveHarmonyIntentToNotePool({ intent: draft.intent, rootMidi: effectiveRootMidi, scaleId, tension: 0.35 }) : exact;
}

/** Resolve a gesture once; callers enqueue the resulting event at the returned block. */
export function resolveLiveChordExecution(args: {
  gesture: LiveChordGesture;
  draft: HarmonyDraftChord;
  effectiveFrame: ResolvedHarmonyFrame;
  currentAudioBlock: number;
  running: boolean;
  scaleId?: number;
}): LiveChordExecution {
  const notes = resolveDraftNotes(args.draft, args.effectiveFrame.rootMidi, args.scaleId ?? args.draft.capturedContext.scaleId);
  const seqExact = typeof args.gesture.scope === 'object' && args.gesture.scope.kind === 'seq' && args.draft.playbackBehavior === 'exact';
  const bypassesHarmony = seqExact;
  return {
    target: args.gesture.target,
    notes,
    entersAtAudioBlock: nextSafeAudioBlock(args.currentAudioBlock, args.running),
    temporaryHarmonyFrame: args.gesture.target === 'harmony' && !bypassesHarmony ? frameForDraft(args.effectiveFrame, notes) : null,
    bypassesHarmony,
  };
}
