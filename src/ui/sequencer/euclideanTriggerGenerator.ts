import { seqEuclidean } from '../../audio/drumSequencer';
import type { TriggerClip } from './triggerClip';
import { clampStepCount, createBitmapTriggerClip } from './triggerClip';

export function createEuclideanTriggerClip(args: {
  preset: string;
  steps: number;
  hits: number;
  rotation: number;
  label?: string;
}): TriggerClip {
  const steps = clampStepCount(args.steps);
  const hits = Math.max(0, Math.min(steps, Math.round(args.hits)));
  const rotation = Math.round(args.rotation || 0);

  return createBitmapTriggerClip({
    steps,
    bits: seqEuclidean(steps, hits, rotation),
    origin: 'euclidean',
    label: args.label ?? 'Euclidean',
    generator: {
      kind: 'euclidean',
      preset: args.preset,
      steps,
      hits,
      rotation,
    },
  });
}
