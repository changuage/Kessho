import type { TriggerClip } from './triggerClip';
import {
  resolveTriggerClip,
  setTriggerClipStep,
} from './triggerClip';
import { createEuclideanTriggerClip } from './euclideanTriggerGenerator';

function cloneToggleMap(map: Map<number, boolean> | undefined, steps: number): Map<number, boolean> {
  const next = new Map<number, boolean>();
  if (!map) return next;
  for (const [step, value] of map) {
    if (Number.isInteger(step) && step >= 0 && step < steps) {
      next.set(step, Boolean(value));
    }
  }
  return next;
}

export function triggerClipToLegacyEuclideanParams(clip: TriggerClip): {
  steps: number;
  hits: number;
  rotation: number;
  triggerToggles: Map<number, boolean>;
} {
  if (clip.generator?.kind === 'euclidean' && clip.origin === 'euclidean') {
    return {
      steps: clip.generator.steps,
      hits: clip.generator.hits,
      rotation: clip.generator.rotation,
      triggerToggles: cloneToggleMap(clip.edits, clip.steps),
    };
  }

  const pattern = resolveTriggerClip(clip);
  const triggerToggles = new Map<number, boolean>();
  pattern.forEach((enabled, step) => {
    if (enabled) triggerToggles.set(step, true);
  });

  return {
    steps: clip.steps,
    hits: 0,
    rotation: 0,
    triggerToggles,
  };
}

export function legacyEuclideanParamsToTriggerClip(args: {
  preset: string;
  steps: number;
  hits: number;
  rotation: number;
  triggerToggles?: Map<number, boolean>;
}): TriggerClip {
  let clip = createEuclideanTriggerClip({
    preset: args.preset,
    steps: args.steps,
    hits: args.hits,
    rotation: args.rotation,
  });
  for (const [step, value] of cloneToggleMap(args.triggerToggles, clip.steps)) {
    if ((clip.basePattern[step] ?? false) !== value) {
      clip = setTriggerClipStep(clip, step, value);
    }
  }
  return clip;
}
