import assert from 'node:assert/strict';

import { seqEuclidean } from '../../audio/drumSequencer';
import { createEuclideanTriggerClip } from './euclideanTriggerGenerator';
import {
  legacyEuclideanParamsToTriggerClip,
  triggerClipToLegacyEuclideanParams,
} from './triggerClipLegacyBridge';
import {
  createBitmapTriggerClip,
  resolveTriggerClip,
  setTriggerClipStep,
} from './triggerClip';

function resolveLegacy(args: {
  steps: number;
  hits: number;
  rotation: number;
  triggerToggles: Map<number, boolean>;
}): boolean[] {
  return seqEuclidean(args.steps, args.hits, args.rotation).map((value, step) => (
    args.triggerToggles.has(step) ? args.triggerToggles.get(step)! : value
  ));
}

{
  const clip = setTriggerClipStep(createEuclideanTriggerClip({
    preset: 'custom',
    steps: 8,
    hits: 3,
    rotation: 1,
  }), 2, true);
  const legacy = triggerClipToLegacyEuclideanParams(clip);
  assert.equal(legacy.steps, 8);
  assert.equal(legacy.hits, 3);
  assert.equal(legacy.rotation, 1);
  assert.deepEqual(resolveLegacy(legacy), resolveTriggerClip(clip));
}

{
  const clip = createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, true, false, false, true, false, false],
    origin: 'scatter',
  });
  const legacy = triggerClipToLegacyEuclideanParams(clip);
  assert.equal(legacy.steps, 8);
  assert.equal(legacy.hits, 0);
  assert.equal(legacy.rotation, 0);
  assert.deepEqual([...legacy.triggerToggles.entries()], [
    [0, true],
    [1, false],
    [2, true],
    [3, false],
    [4, false],
    [5, true],
    [6, false],
    [7, false],
  ]);
  assert.deepEqual(resolveLegacy(legacy), resolveTriggerClip(clip));
}

{
  const toggles = new Map<number, boolean>([[1, true], [2, false]]);
  const clip = legacyEuclideanParamsToTriggerClip({
    preset: 'custom',
    steps: 8,
    hits: 3,
    rotation: 0,
    triggerToggles: toggles,
  });
  assert.deepEqual(resolveTriggerClip(clip), resolveLegacy({
    steps: 8,
    hits: 3,
    rotation: 0,
    triggerToggles: toggles,
  }));
}

console.log('Trigger clip legacy bridge tests passed');
