import assert from 'node:assert/strict';

import {
  createBitmapTriggerClip,
  countTriggerHits,
  deserializeTriggerClip,
  flattenTriggerClipEdits,
  flattenTriggerClipToManual,
  retagTriggerClipAsEuclidean,
  resizeTriggerClip,
  resolveTriggerClip,
  rotateTriggerClip,
  serializeTriggerClip,
  setTriggerClipStep,
  toggleTriggerClipStep,
} from './triggerClip';
import {
  copyTriggerStamp,
  pasteTriggerStamp,
} from './sequencerTriggerStamp';

{
  const clip = createBitmapTriggerClip({
    steps: 4,
    bits: [true, false, true, false],
    origin: 'manual',
  });
  assert.deepEqual(resolveTriggerClip(clip), [true, false, true, false]);
  assert.equal(countTriggerHits(clip), 2);
}

{
  const clip = setTriggerClipStep(createBitmapTriggerClip({
    steps: 4,
    bits: [true, false, false, true],
    origin: 'euclidean',
    generator: {
      kind: 'euclidean',
      preset: 'custom',
      steps: 4,
      hits: 2,
      rotation: 0,
    },
  }), 1, true);
  const manual = flattenTriggerClipToManual(clip);
  assert.deepEqual(resolveTriggerClip(manual), [true, true, false, true]);
  assert.equal(manual.origin, 'manual');
  assert.equal(manual.generator?.kind, 'manual');
  assert.equal(manual.label, 'Step');
  assert.equal(manual.dirty, false);
  assert.equal(manual.edits.size, 0);
}

{
  const clip = createBitmapTriggerClip({
    steps: 4,
    bits: [true, false, true, false],
    origin: 'manual',
  });
  const edited = setTriggerClipStep(clip, 1, true);
  assert.deepEqual(resolveTriggerClip(edited), [true, true, true, false]);
  assert.equal(edited.dirty, true);

  const flattened = flattenTriggerClipEdits(edited);
  assert.deepEqual(flattened.basePattern, [true, true, true, false]);
  assert.equal(flattened.edits.size, 0);
  assert.equal(flattened.dirty, false);
}

{
  const manual = createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, false, true, false, true, false, false],
    origin: 'manual',
    label: 'Step',
  });
  const euclid = retagTriggerClipAsEuclidean(manual);
  assert.deepEqual(
    resolveTriggerClip(euclid),
    resolveTriggerClip(manual),
    'switching Step to Euclid should not reshape the trigger pattern',
  );
  assert.equal(euclid.origin, 'euclidean');
  assert.equal(euclid.generator?.kind, 'euclidean');
  assert.equal(euclid.generator?.steps, 8);
  assert.equal(euclid.generator?.hits, 3);
  assert.equal(euclid.generator?.rotation, 0);
  assert.equal(euclid.dirty, false);
  assert.equal(euclid.edits.size, 0);
}

{
  const clip = createBitmapTriggerClip({
    steps: 4,
    bits: [true, false, false, true],
    origin: 'scatter',
  });
  assert.deepEqual(resolveTriggerClip(rotateTriggerClip(clip, 1)), [true, true, false, false]);
  assert.deepEqual(resolveTriggerClip(rotateTriggerClip(clip, -1)), [false, false, true, true]);
}

{
  const clip = createBitmapTriggerClip({
    steps: 4,
    bits: [true, false, true, false],
    origin: 'scatter',
  });
  assert.deepEqual(resolveTriggerClip(resizeTriggerClip(clip, 6)), [true, false, true, false, false, false]);
  assert.deepEqual(resolveTriggerClip(resizeTriggerClip(clip, 2)), [true, false]);
}

{
  const clip = toggleTriggerClipStep(createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, false, false, true, false, false, false],
    origin: 'scatter',
    generator: {
      kind: 'scatter',
      phraseId: 'phrase-a',
      seed: 123,
      engine: 'kick',
      feelX: 0.4,
      feelY: -0.2,
      chaos: 0.4,
      label: 'Kick Rise',
    },
    label: 'Kick · Rise',
  }), 2);
  const serialized = serializeTriggerClip(clip);
  const restored = deserializeTriggerClip(serialized);
  assert.deepEqual(resolveTriggerClip(restored!), resolveTriggerClip(clip));
  assert.equal(restored?.origin, 'scatter');
  assert.equal(restored?.generator?.kind, 'scatter');
  assert.equal(restored?.edits.get(2), true);
}

{
  const stamp = copyTriggerStamp({
    source: 'synthLane',
    stepIndex: 6,
    trigger: {
      steps: 8,
      pattern: [true, false, true, false, true, false, true, false],
      probability: new Array(8).fill(1),
    },
    subLanes: {
      pitch: {
        enabled: true,
        steps: 3,
        direction: 'forward',
        values: [10, 20, 30],
      },
    },
  });
  assert(stamp);
  assert.equal(stamp.copiedHitOrdinal, 3);
  assert.equal(stamp.lanes.pitch, 10, 'H4 of a 4-trigger / 3-pitch pattern should resolve to slot 1');

  const pasted = pasteTriggerStamp({
    stamp,
    stepIndex: 5,
    trigger: {
      steps: 8,
      pattern: [true, false, true, false, true, false, true, false],
      probability: new Array(8).fill(1),
    },
    subLanes: {
      pitch: {
        enabled: true,
        steps: 3,
        direction: 'forward',
        values: [10, 20, 30],
      },
    },
    maxSubLaneSteps: 8,
  });
  assert.deepEqual(pasted.pattern, [true, false, true, false, true, true, true, false]);
  assert.deepEqual(pasted.subLanes.pitch!.values.slice(0, 5), [10, 20, 30, 10, 10]);
}

{
  const stamp = copyTriggerStamp({
    source: 'synthLane',
    stepIndex: 4,
    trigger: {
      steps: 8,
      pattern: [true, false, true, false, true, false, true, false],
    },
    subLanes: {
      pitch: {
        enabled: true,
        steps: 4,
        direction: 'forward',
        values: [1, 2, 3, 4],
      },
    },
  });
  assert(stamp);
  const pasted = pasteTriggerStamp({
    stamp,
    stepIndex: 2,
    trigger: {
      steps: 8,
      pattern: [true, false, true, false, true, false, true, false],
    },
    subLanes: {
      pitch: {
        enabled: true,
        steps: 4,
        direction: 'forward',
        values: [1, 2, 3, 4],
      },
    },
    maxSubLaneSteps: 8,
  });
  assert.deepEqual(pasted.pattern, [true, false, true, false, true, false, true, false]);
  assert.deepEqual(pasted.subLanes.pitch!.values.slice(0, 4), [1, 3, 3, 4], 'pasting onto an active trigger should replace without shifting later hits');
}

console.log('Trigger clip tests passed');
