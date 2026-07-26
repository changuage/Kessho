import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceHarmonyAdoptionTransition,
  calculateHarmonyAdoptionCoFPath,
  cancelHarmonyAdoptionTransition,
  createStoppedHarmonyAdoptionCommand,
  resolveAdoptionPlaybackNotes,
  selectStableScaleHandoverPathIndex,
  startHarmonyAdoptionTransition,
} from './harmonyAdoptionTransition';
import { defaultHarmonyIntent } from '../CoreProductHarmonyControl';

const authored = { rootNote: 0, manualScale: 'Major (Ionian)', cofCurrentStep: 3 };

test('stopped adoption is immediate, atomic, and invertible', () => {
  const result = createStoppedHarmonyAdoptionCommand({ authored, targetRoot: 7, targetScaleId: 8, targetScaleName: 'Dorian' });
  assert.equal(result.kind, 'command');
  assert.deepEqual(result.command?.patch, { rootNote: 7, manualScale: 'Dorian', cofCurrentStep: 0 });
  assert.deepEqual(result.command?.inverse, authored);
  assert.equal(createStoppedHarmonyAdoptionCommand({ authored: result.command!.patch, targetRoot: 7, targetScaleId: 8, targetScaleName: 'Dorian' }).kind, 'noop');
  assert.equal(createStoppedHarmonyAdoptionCommand({ authored, targetRoot: 7, targetScaleId: 8, targetScaleName: 'Dorian', preview: true }).kind, 'preview');
});

test('running adoption begins from effective drifted root, not home, and advances only at explicit boundaries', () => {
  const result = startHarmonyAdoptionTransition({
    authored,
    effectiveRootMidi: 67,
    effectiveScaleId: 1,
    targetRoot: 11,
    targetScaleId: 8,
    targetScaleName: 'Dorian',
    sourceScalePitchClasses: [0, 2, 4, 5, 7, 9, 11],
    targetScalePitchClasses: [0, 2, 3, 5, 7, 9, 10],
    sourceNotePool: [67, 71, 74],
  });
  assert.equal(result.kind, 'started');
  if (result.kind !== 'started') return;
  assert.equal(result.transition.sourceEffectiveRoot, 67);
  assert.equal(result.transition.cofPath[0], 67);
  const held = advanceHarmonyAdoptionTransition(result.transition, false);
  assert.equal(held.advanced, false);
  assert.equal(held.transition.currentPathIndex, 0);
  const moved = advanceHarmonyAdoptionTransition(result.transition, true);
  assert.equal(moved.advanced, true);
  assert.equal(moved.patch?.cofCurrentStep, 0);
  assert.ok((moved.patch?.rootNote ?? 0) <= 11, 'intermediate authored root is normalized pitch class');
});

test('completion lands on exact Root/Scale and resets CoF step; active adoption rejects replacement', () => {
  const result = startHarmonyAdoptionTransition({ authored, effectiveRootMidi: 60, effectiveScaleId: 1, targetRoot: 6, targetScaleId: 9, targetScaleName: 'Harmonic Minor' });
  assert.equal(result.kind, 'started');
  if (result.kind !== 'started') return;
  let transition = result.transition;
  let last = advanceHarmonyAdoptionTransition(transition, true);
  while (last.transition.status === 'running') last = advanceHarmonyAdoptionTransition(last.transition, true);
  transition = last.transition;
  assert.equal(transition.status, 'complete');
  assert.deepEqual(last.patch, { rootNote: 6, manualScale: 'Harmonic Minor', cofCurrentStep: 0 });
  const rejected = startHarmonyAdoptionTransition({ authored, effectiveRootMidi: 60, effectiveScaleId: 1, targetRoot: 3, targetScaleId: 2, activeTransition: result.transition });
  assert.deepEqual(rejected, { kind: 'rejected', reason: 'active-transition', transition: null });
});

test('safe cancellation restores authored context; unsafe cancellation is ignored', () => {
  const result = startHarmonyAdoptionTransition({ authored, effectiveRootMidi: 60, effectiveScaleId: 1, targetRoot: 9, targetScaleId: 2 });
  assert.equal(result.kind, 'started');
  if (result.kind !== 'started') return;
  assert.equal(cancelHarmonyAdoptionTransition(result.transition, false).accepted, false);
  const cancelled = cancelHarmonyAdoptionTransition(result.transition, true);
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.transition.status, 'cancelled');
  assert.deepEqual(cancelled.patch, authored);
});

test('scale-family handover chooses maximum common-tone overlap with earliest tie', () => {
  assert.equal(selectStableScaleHandoverPathIndex({ cofPath: [60, 67, 62], sourceRoot: 60, sourceNotePool: [60, 64], targetScalePitchClasses: [0, 4] }), 0);
  assert.deepEqual(calculateHarmonyAdoptionCoFPath(0, 6).slice(0, 2), [0, 7]);
});

test('Exact remains exact while Relative and eligible Auto follow moving context', () => {
  const intent = { ...defaultHarmonyIntent('manualControl', 0), rootMode: 'degree' as const, rootNote: 0, quality: 'maj' as const };
  const common = { exactMidiNotes: [60, 64, 67], intent, capturedRootMidi: 60, effectiveRootMidi: 66, scaleId: 1 };
  assert.deepEqual(resolveAdoptionPlaybackNotes({ ...common, playbackBehavior: 'exact' }), [60, 64, 67]);
  assert.deepEqual(resolveAdoptionPlaybackNotes({ ...common, playbackBehavior: 'auto' }), [60, 64, 67]);
  assert.notDeepEqual(resolveAdoptionPlaybackNotes({ ...common, playbackBehavior: 'relative', effectiveRootMidi: 72 }), [60, 64, 67]);
  assert.notDeepEqual(resolveAdoptionPlaybackNotes({ ...common, playbackBehavior: 'auto', effectiveRootMidi: 72 }), [60, 64, 67]);
  assert.deepEqual(resolveAdoptionPlaybackNotes({ ...common, intent: null, playbackBehavior: 'relative', effectiveRootMidi: 72 }), []);
});

test('continuous CoF path keeps a drifted source near target register while authored roots stay pitch classes', () => {
  const result = startHarmonyAdoptionTransition({ authored, effectiveRootMidi: 67, effectiveScaleId: 1, targetRoot: 2, targetScaleId: 8, targetScaleName: 'Dorian' });
  assert.equal(result.kind, 'started');
  if (result.kind !== 'started') return;
  assert.ok(Math.abs((result.transition.cofPath[result.transition.cofPath.length - 1] ?? 0) - 62) <= 1);
  let advanced = result.transition;
  let last = advanceHarmonyAdoptionTransition(advanced, true);
  while (last.transition.status === 'running') last = advanceHarmonyAdoptionTransition(last.transition, true);
  assert.equal(last.patch?.rootNote, 2);
  assert.equal(last.patch?.cofCurrentStep, 0);
});

test('preview never creates an adoption transition or authored command', () => {
  assert.equal(startHarmonyAdoptionTransition({ authored, effectiveRootMidi: 60, effectiveScaleId: 1, targetRoot: 9, targetScaleId: 2, preview: true }).kind, 'rejected');
  assert.equal(createStoppedHarmonyAdoptionCommand({ authored, targetRoot: 9, targetScaleId: 2, preview: true }).command, null);
});
