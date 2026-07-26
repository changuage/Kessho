import {
  HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES,
  resolveHarmonyIntentToNotePool,
  type HarmonyIntent,
} from '../CoreProductHarmonyControl';
import type { HarmonyPlaybackBehavior } from './harmonyTypes';

export type HarmonyAdoptionStatus = 'queued' | 'running' | 'complete' | 'cancelled';

export interface HarmonyAdoptionTransition {
  sourceEffectiveRoot: number;
  sourceScaleId: number;
  /** Target authored root as a pitch class. */
  targetRoot: number;
  /** Continuous MIDI target used by the transition path. */
  targetRootMidi: number;
  targetScaleId: number;
  cofPath: number[];
  currentPathIndex: number;
  status: HarmonyAdoptionStatus;
  /** Boundary index where the target scale family can hand over most stably. */
  scaleHandoverPathIndex: number;
  /** Authored context used to produce a safe inverse/cancel command. */
  sourceAuthored: HarmonyAdoptionAuthoredState;
  targetScaleName?: string;
}

export interface HarmonyAdoptionAuthoredState {
  rootNote: number;
  manualScale: string;
  cofCurrentStep: number;
}

export interface HarmonyAdoptionPatch extends HarmonyAdoptionAuthoredState {}

export interface HarmonyAdoptionCommand {
  patch: HarmonyAdoptionPatch;
  inverse: HarmonyAdoptionPatch;
}

export interface StoppedAdoptionInput {
  authored: HarmonyAdoptionAuthoredState;
  targetRoot: number;
  targetScaleId: number;
  targetScaleName?: string;
  preview?: boolean;
}

export interface StoppedAdoptionResult {
  kind: 'noop' | 'command' | 'preview';
  command: HarmonyAdoptionCommand | null;
}

export interface RunningAdoptionInput {
  authored: HarmonyAdoptionAuthoredState;
  /** Continuous effective MIDI root, including current CoF drift. */
  effectiveRootMidi: number;
  effectiveScaleId: number;
  targetRoot: number;
  targetScaleId: number;
  targetScaleName?: string;
  sourceScalePitchClasses?: readonly number[];
  targetScalePitchClasses?: readonly number[];
  sourceNotePool?: readonly number[];
  activeTransition?: HarmonyAdoptionTransition | null;
  preview?: boolean;
}

export type RunningAdoptionStartResult =
  | { kind: 'started'; transition: HarmonyAdoptionTransition }
  | { kind: 'noop'; transition: null }
  | { kind: 'rejected'; reason: 'active-transition' | 'preview'; transition: null };

export interface AdoptionAdvanceResult {
  transition: HarmonyAdoptionTransition;
  patch: HarmonyAdoptionPatch | null;
  inverse: HarmonyAdoptionPatch | null;
  advanced: boolean;
}

export interface AdoptionCancelResult {
  accepted: boolean;
  transition: HarmonyAdoptionTransition;
  patch: HarmonyAdoptionPatch | null;
  inverse: HarmonyAdoptionPatch | null;
}

const COF_SEQUENCE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;
const SCALE_ID_NAMES: Readonly<Record<number, string>> = {
  1: 'Major (Ionian)', 2: 'Aeolian', 3: 'Major Pentatonic', 4: 'Octatonic Half-Whole', 5: 'Lydian', 6: 'Mixolydian',
  7: 'Minor Pentatonic', 8: 'Dorian', 9: 'Harmonic Minor', 10: 'Melodic Minor', 11: 'Phrygian Dominant',
};
const clampPitch = (value: number) => ((Math.round(value) % 12) + 12) % 12;
const clampRoot = (value: number) => Math.max(0, Math.min(127, Math.round(value)));
const uniquePitchClasses = (values: readonly number[] | undefined): number[] => Array.from(new Set((values ?? []).map(clampPitch)));
const scaleNameForId = (scaleId: number, explicit?: string): string => explicit ?? SCALE_ID_NAMES[scaleId] ?? 'Major (Ionian)';

function nearestMidiForPitchClass(sourceMidi: number, target: number): number {
  const source = clampRoot(sourceMidi);
  const pitchClass = clampPitch(target);
  let candidate = Math.floor(source / 12) * 12 + pitchClass;
  while (candidate - source > 6) candidate -= 12;
  while (source - candidate > 6) candidate += 12;
  return clampRoot(candidate);
}

function cofIndex(pitchClass: number): number {
  return COF_SEQUENCE.indexOf(clampPitch(pitchClass) as typeof COF_SEQUENCE[number]);
}

/** Bounded shortest CoF path; equal routes deterministically prefer clockwise (+7). */
export function calculateHarmonyAdoptionCoFPath(fromRoot: number, toRoot: number): number[] {
  const source = clampRoot(fromRoot);
  const target = clampRoot(toRoot);
  const fromIndex = cofIndex(source);
  const toIndex = cofIndex(target);
  if (fromIndex < 0 || toIndex < 0) return [source, target];
  const clockwise = (toIndex - fromIndex + 12) % 12;
  const counterClockwise = (fromIndex - toIndex + 12) % 12;
  const direction = clockwise <= counterClockwise ? 1 : -1;
  const steps = Math.min(clockwise, counterClockwise);
  const path = [source];
  let current = source;
  for (let index = 0; index < steps; index += 1) {
    // One CoF move is exactly ±7 semitones; retaining the continuous MIDI
    // anchor is what keeps Auto's six-semitone policy meaningful.
    current = clampRoot(current + (direction === 1 ? 7 : -7));
    path.push(current);
  }
  path[path.length - 1] = target;
  return path;
}

function overlapScore(source: readonly number[], target: readonly number[]): number {
  const sourceSet = new Set(source.map(clampPitch));
  return target.filter((note) => sourceSet.has(clampPitch(note))).length;
}

/** Choose the earliest maximum-overlap handover, making ties deterministic. */
export function selectStableScaleHandoverPathIndex(input: {
  cofPath: readonly number[];
  sourceRoot: number;
  sourceScalePitchClasses?: readonly number[];
  targetScalePitchClasses?: readonly number[];
  sourceNotePool?: readonly number[];
}): number {
  const source = input.sourceNotePool?.length ? input.sourceNotePool : input.sourceScalePitchClasses ?? [];
  const targetScale = uniquePitchClasses(input.targetScalePitchClasses);
  if (source.length === 0 || targetScale.length === 0 || input.cofPath.length <= 1) return Math.max(0, input.cofPath.length - 1);
  let bestIndex = input.cofPath.length - 1;
  let bestScore = -1;
  for (let index = 0; index < input.cofPath.length; index += 1) {
    const rootDelta = clampPitch(input.cofPath[index]! - input.sourceRoot);
    const candidate = targetScale.map((pitch) => pitch + rootDelta);
    const score = overlapScore(source, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function sameContext(a: HarmonyAdoptionAuthoredState, rootNote: number, scaleName: string): boolean {
  return clampPitch(a.rootNote) === clampPitch(rootNote) && a.manualScale === scaleName && a.cofCurrentStep === 0;
}

export function createStoppedHarmonyAdoptionCommand(input: StoppedAdoptionInput): StoppedAdoptionResult {
  if (input.preview) return { kind: 'preview', command: null };
  const targetScaleName = scaleNameForId(input.targetScaleId, input.targetScaleName);
  const patch: HarmonyAdoptionPatch = { rootNote: clampPitch(input.targetRoot), manualScale: targetScaleName, cofCurrentStep: 0 };
  if (sameContext(input.authored, patch.rootNote, patch.manualScale)) return { kind: 'noop', command: null };
  return { kind: 'command', command: { patch, inverse: { ...input.authored } } };
}

export function startHarmonyAdoptionTransition(input: RunningAdoptionInput): RunningAdoptionStartResult {
  if (input.preview) return { kind: 'rejected', reason: 'preview', transition: null };
  if (input.activeTransition?.status === 'queued' || input.activeTransition?.status === 'running') {
    return { kind: 'rejected', reason: 'active-transition', transition: null };
  }
  const sourceRoot = clampRoot(input.effectiveRootMidi);
  const targetRootPitchClass = clampPitch(input.targetRoot);
  const targetRootMidi = input.targetRoot > 11 ? clampRoot(input.targetRoot) : nearestMidiForPitchClass(sourceRoot, targetRootPitchClass);
  const targetScaleName = scaleNameForId(input.targetScaleId, input.targetScaleName);
  if (sourceRoot === targetRootMidi && input.effectiveScaleId === input.targetScaleId && input.authored.cofCurrentStep === 0) {
    return { kind: 'noop', transition: null };
  }
  const cofPath = calculateHarmonyAdoptionCoFPath(sourceRoot, targetRootMidi);
  const transition: HarmonyAdoptionTransition = {
    sourceEffectiveRoot: sourceRoot,
    sourceScaleId: input.effectiveScaleId,
    targetRoot: targetRootPitchClass,
    targetRootMidi,
    targetScaleId: input.targetScaleId,
    cofPath,
    currentPathIndex: 0,
    status: 'running',
    scaleHandoverPathIndex: selectStableScaleHandoverPathIndex({
      cofPath,
      sourceRoot,
      sourceScalePitchClasses: input.sourceScalePitchClasses,
      targetScalePitchClasses: input.targetScalePitchClasses,
      sourceNotePool: input.sourceNotePool,
    }),
    sourceAuthored: { ...input.authored },
    targetScaleName,
  };
  return { kind: 'started', transition };
}

function patchForTransition(transition: HarmonyAdoptionTransition): HarmonyAdoptionPatch {
  const root = transition.cofPath[transition.currentPathIndex] ?? transition.targetRootMidi;
  return {
    rootNote: clampPitch(root),
    manualScale: transition.currentPathIndex >= transition.scaleHandoverPathIndex
      ? scaleNameForId(transition.targetScaleId, transition.targetScaleName)
      : transition.sourceAuthored.manualScale,
    // Each intermediate patch writes the direct effective root. Keeping a
    // nonzero CoF step here would apply the drift a second time in projection.
    cofCurrentStep: 0,
  };
}

/** Advance only when the caller explicitly confirms a musical Harmony boundary. */
export function advanceHarmonyAdoptionTransition(transition: HarmonyAdoptionTransition, atHarmonyBoundary: boolean): AdoptionAdvanceResult {
  if (transition.status !== 'running' || !atHarmonyBoundary) return { transition, patch: null, inverse: null, advanced: false };
  const nextIndex = Math.min(transition.cofPath.length - 1, transition.currentPathIndex + 1);
  const next: HarmonyAdoptionTransition = { ...transition, currentPathIndex: nextIndex, status: nextIndex >= transition.cofPath.length - 1 ? 'complete' : 'running' };
  const patch = patchForTransition(next);
  return { transition: next, patch, inverse: next.status === 'complete' ? { ...transition.sourceAuthored } : null, advanced: true };
}

/** Cancellation/undo is accepted only at an explicit safe Harmony boundary. */
export function cancelHarmonyAdoptionTransition(transition: HarmonyAdoptionTransition, atHarmonyBoundary: boolean): AdoptionCancelResult {
  if (transition.status !== 'running' || !atHarmonyBoundary) return { accepted: false, transition, patch: null, inverse: null };
  const cancelled: HarmonyAdoptionTransition = { ...transition, status: 'cancelled' };
  return { accepted: true, transition: cancelled, patch: { ...transition.sourceAuthored }, inverse: patchForTransition(transition) };
}

export function resolveAdoptionPlaybackNotes(input: {
  playbackBehavior: HarmonyPlaybackBehavior;
  exactMidiNotes: readonly number[];
  intent: HarmonyIntent | null;
  capturedRootMidi: number;
  effectiveRootMidi: number;
  scaleId: number;
}): number[] {
  if (input.playbackBehavior === 'exact') return input.exactMidiNotes.slice();
  const displacement = input.effectiveRootMidi - input.capturedRootMidi;
  if (input.playbackBehavior === 'auto' && Math.abs(displacement) <= HARMONY_AUTO_EXACT_THRESHOLD_SEMITONES) return input.exactMidiNotes.slice();
  return input.intent
    ? resolveHarmonyIntentToNotePool({ intent: input.intent, rootMidi: input.effectiveRootMidi, scaleId: input.scaleId, tension: 0.35 })
    : [];
}
