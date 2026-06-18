import assert from 'node:assert/strict';

import { hashCanonicalJson } from '../../../presets/presetStorageV2';
import { createEmptyStepOverrides, serializeStepOverrides } from '../../sequencer/stepOverrideSerialization';
import { createBitmapTriggerClip, setTriggerClipStep } from '../../sequencer/triggerClip';

async function testTriggerClipSerializationIsHashStable(): Promise<void> {
  const left = createEmptyStepOverrides(4);
  let leftClip = createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, false, false, true, false, false, false],
    origin: 'scatter',
    label: 'Kick · Rise',
  });
  leftClip = setTriggerClipStep(leftClip, 2, true);
  leftClip = setTriggerClipStep(leftClip, 6, true);
  left.triggerClips![0] = leftClip;

  const right = createEmptyStepOverrides(4);
  let rightClip = createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, false, false, true, false, false, false],
    origin: 'scatter',
    label: 'Kick · Rise',
  });
  rightClip = setTriggerClipStep(rightClip, 6, true);
  rightClip = setTriggerClipStep(rightClip, 2, true);
  right.triggerClips![0] = rightClip;

  const leftSerialized = serializeStepOverrides(left);
  const rightSerialized = serializeStepOverrides(right);
  assert.deepEqual(leftSerialized, rightSerialized, 'trigger clip edits should serialize in deterministic step order');
  assert.equal(
    await hashCanonicalJson(leftSerialized),
    await hashCanonicalJson(rightSerialized),
    'equivalent printed trigger clips should produce identical canonical hashes',
  );
}

async function testDifferentPrintedPatternChangesHash(): Promise<void> {
  const left = createEmptyStepOverrides(4);
  left.triggerClips![0] = createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, false, false, true, false, false, false],
    origin: 'scatter',
  });

  const right = createEmptyStepOverrides(4);
  right.triggerClips![0] = createBitmapTriggerClip({
    steps: 8,
    bits: [true, false, true, false, true, false, false, false],
    origin: 'scatter',
  });

  assert.notEqual(
    await hashCanonicalJson(serializeStepOverrides(left)),
    await hashCanonicalJson(serializeStepOverrides(right)),
    'different printed trigger clips should produce distinct canonical hashes',
  );
}

await testTriggerClipSerializationIsHashStable();
await testDifferentPrintedPatternChangesHash();

console.log('Scatter preset hash tests passed');
