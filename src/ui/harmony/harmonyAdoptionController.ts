import {
  advanceHarmonyAdoptionTransition,
  cancelHarmonyAdoptionTransition,
  createStoppedHarmonyAdoptionCommand,
  startHarmonyAdoptionTransition,
  type HarmonyAdoptionAuthoredState,
  type HarmonyAdoptionPatch,
  type HarmonyAdoptionTransition,
} from '../../audio/harmony/harmonyAdoptionTransition';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';

export interface HarmonyAdoptionTarget {
  rootPitchClass: number;
  scaleId: number;
  scaleName?: string;
}

export interface HarmonyAdoptionControllerSnapshot {
  transition: HarmonyAdoptionTransition | null;
  pendingUndo: HarmonyAdoptionPatch | null;
  isActive: boolean;
}

export interface HarmonyAdoptionController {
  snapshot(): HarmonyAdoptionControllerSnapshot;
  syncAuthored(authored: HarmonyAdoptionAuthoredState): void;
  adoptStopped(target: HarmonyAdoptionTarget, preview?: boolean): { accepted: boolean; patch: HarmonyAdoptionPatch | null; inverse: HarmonyAdoptionPatch | null };
  startRunning(input: { effectiveRootMidi: number; effectiveScaleId: number; target: HarmonyAdoptionTarget; preview?: boolean; sourceScalePitchClasses?: readonly number[]; targetScalePitchClasses?: readonly number[]; sourceNotePool?: readonly number[] }): { accepted: boolean; reason?: 'active-transition' | 'preview'; transition: HarmonyAdoptionTransition | null };
  advance(atHarmonyBoundary: boolean): { patch: HarmonyAdoptionPatch | null; complete: boolean; transition: HarmonyAdoptionTransition | null };
  cancel(atHarmonyBoundary: boolean): { accepted: boolean; patch: HarmonyAdoptionPatch | null; inverse: HarmonyAdoptionPatch | null };
}

/** Thin stateful adapter: transition math stays in audio/harmony and all writes
 * remain caller-owned, so previews never mutate authored state. */
export function createHarmonyAdoptionController(authored: HarmonyAdoptionAuthoredState): HarmonyAdoptionController {
  let currentAuthored = { ...authored };
  let transition: HarmonyAdoptionTransition | null = null;
  let pendingUndo: HarmonyAdoptionPatch | null = null;
  const snapshot = (): HarmonyAdoptionControllerSnapshot => ({ transition, pendingUndo, isActive: transition?.status === 'running' });
  return {
    snapshot,
    syncAuthored(nextAuthored) { if (transition?.status !== 'running') currentAuthored = { ...nextAuthored }; },
    adoptStopped(target, preview = false) {
      if (transition?.status === 'running') return { accepted: false, patch: null, inverse: null };
      const result = createStoppedHarmonyAdoptionCommand({ authored: currentAuthored, targetRoot: target.rootPitchClass, targetScaleId: target.scaleId, targetScaleName: target.scaleName, preview });
      if (result.kind !== 'command' || !result.command) return { accepted: false, patch: null, inverse: null };
      currentAuthored = { ...result.command.patch };
      pendingUndo = { ...result.command.inverse };
      return { accepted: true, patch: result.command.patch, inverse: result.command.inverse };
    },
    startRunning(input) {
      const result = startHarmonyAdoptionTransition({ authored: currentAuthored, effectiveRootMidi: input.effectiveRootMidi, effectiveScaleId: input.effectiveScaleId, targetRoot: input.target.rootPitchClass, targetScaleId: input.target.scaleId, targetScaleName: input.target.scaleName, sourceScalePitchClasses: input.sourceScalePitchClasses, targetScalePitchClasses: input.targetScalePitchClasses, sourceNotePool: input.sourceNotePool, activeTransition: transition, preview: input.preview });
      if (result.kind !== 'started') return { accepted: false, ...(result.kind === 'rejected' ? { reason: result.reason } : {}), transition: null };
      transition = result.transition;
      pendingUndo = null;
      return { accepted: true, transition };
    },
    advance(atHarmonyBoundary) {
      if (!transition) return { patch: null, complete: false, transition: null };
      const result = advanceHarmonyAdoptionTransition(transition, atHarmonyBoundary);
      transition = result.transition;
      if (result.patch) {
        currentAuthored = { ...currentAuthored, ...result.patch };
        if (transition.status === 'complete') pendingUndo = result.inverse ? { ...result.inverse } : null;
      }
      return { patch: result.patch, complete: transition.status === 'complete', transition };
    },
    cancel(atHarmonyBoundary) {
      if (!transition) return { accepted: false, patch: null, inverse: null };
      const result = cancelHarmonyAdoptionTransition(transition, atHarmonyBoundary);
      if (!result.accepted) return { accepted: false, patch: null, inverse: null };
      transition = result.transition;
      if (result.patch) currentAuthored = { ...currentAuthored, ...result.patch };
      pendingUndo = result.inverse ? { ...result.inverse } : null;
      return { accepted: true, patch: result.patch, inverse: result.inverse };
    },
  };
}

export interface HarmonyBoundaryPosition {
  eventIndex: number;
  absoluteBarIndex: number | null;
}

/** True only when the canonical progression crosses an event boundary. A
 * single one-bar event wraps once per bar; long events do not fire early. */
export function crossedHarmonyProgressionBoundary(
  previous: HarmonyBoundaryPosition,
  current: HarmonyBoundaryPosition,
  progression: HarmonyProgression,
  barsPerPhrase = 4,
): boolean {
  if (progression.events.length === 0) return false;
  const durations = progression.events.map((event) => event.duration.unit === 'phrase' ? event.duration.value * Math.max(1, Math.round(barsPerPhrase)) : event.duration.value);
  const cycleBars = Math.max(1, durations.reduce((sum, duration) => sum + duration, 0));
  const previousAbsolute = previous.absoluteBarIndex;
  const currentAbsolute = current.absoluteBarIndex;
  if (previousAbsolute !== null && currentAbsolute !== null && currentAbsolute > previousAbsolute) {
    const previousCycle = Math.floor(previousAbsolute / cycleBars);
    const currentCycle = Math.floor(currentAbsolute / cycleBars);
    if (currentCycle > previousCycle) return true;
    if (current.eventIndex !== previous.eventIndex) return true;
    // A one-event cycle has no event-index change; its wrap is the boundary.
    return currentAbsolute % cycleBars < previousAbsolute % cycleBars;
  }
  return current.eventIndex !== previous.eventIndex;
}
