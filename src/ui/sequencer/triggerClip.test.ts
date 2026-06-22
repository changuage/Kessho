import assert from 'node:assert/strict';

import {
  createBitmapTriggerClip,
  countTriggerHits,
  deserializeTriggerClip,
  flattenTriggerClipEdits,
  flattenTriggerClipToManual,
  resizeTriggerClip,
  resolveTriggerClip,
  rotateTriggerClip,
  serializeTriggerClip,
  setTriggerClipStep,
  toggleTriggerClipStep,
} from './triggerClip';

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

console.log('Trigger clip tests passed');
