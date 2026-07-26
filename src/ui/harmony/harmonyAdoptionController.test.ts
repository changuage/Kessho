import assert from 'node:assert/strict';
import test from 'node:test';
import { crossedHarmonyProgressionBoundary, createHarmonyAdoptionController } from './harmonyAdoptionController';

const authored = { rootNote: 0, manualScale: 'Major (Ionian)', cofCurrentStep: 3 };
const target = { rootPitchClass: 11, scaleId: 8, scaleName: 'Dorian' };

test('stopped Adopt is atomic and exposes one inverse patch', () => {
  const controller = createHarmonyAdoptionController(authored);
  const result = controller.adoptStopped(target);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.patch, { rootNote: 11, manualScale: 'Dorian', cofCurrentStep: 0 });
  assert.deepEqual(result.inverse, authored);
  assert.equal(controller.snapshot().isActive, false);
});

test('running Adopt begins at effective drifted root and advances only at boundaries', () => {
  const controller = createHarmonyAdoptionController(authored);
  const started = controller.startRunning({ effectiveRootMidi: 67, effectiveScaleId: 1, target, sourceNotePool: [67, 71, 74] });
  assert.equal(started.accepted, true);
  assert.equal(started.transition?.sourceEffectiveRoot, 67);
  assert.equal(controller.advance(false).patch, null);
  const moved = controller.advance(true);
  assert.ok(moved.patch);
  assert.equal(moved.patch?.cofCurrentStep, 0);
  assert.equal(controller.startRunning({ effectiveRootMidi: 67, effectiveScaleId: 1, target }).accepted, false);
});

test('completion, safe cancel, and preview do not auto-author', () => {
  const controller = createHarmonyAdoptionController(authored);
  assert.equal(controller.startRunning({ effectiveRootMidi: 60, effectiveScaleId: 1, target: { rootPitchClass: 2, scaleId: 2 }, preview: true }).accepted, false);
  const started = controller.startRunning({ effectiveRootMidi: 60, effectiveScaleId: 1, target });
  assert.equal(started.accepted, true);
  assert.equal(controller.cancel(false).accepted, false);
  const cancelled = controller.cancel(true);
  assert.equal(cancelled.accepted, true);
  assert.deepEqual(cancelled.patch, authored);
  const completeController = createHarmonyAdoptionController(authored);
  completeController.startRunning({ effectiveRootMidi: 60, effectiveScaleId: 1, target });
  let last = completeController.advance(true);
  while (!last.complete) last = completeController.advance(true);
  assert.deepEqual(last.patch, { rootNote: 11, manualScale: 'Dorian', cofCurrentStep: 0 });
  assert.equal(completeController.snapshot().isActive, false);
});

test('syncAuthored follows external edits and ignores them during an active transition', () => {
  const controller = createHarmonyAdoptionController(authored);
  controller.syncAuthored({ rootNote: 4, manualScale: 'Lydian', cofCurrentStep: 2 });
  const stopped = controller.adoptStopped({ rootPitchClass: 8, scaleId: 2, scaleName: 'Aeolian' });
  assert.deepEqual(stopped.inverse, { rootNote: 4, manualScale: 'Lydian', cofCurrentStep: 2 });
  const active = createHarmonyAdoptionController(authored);
  active.startRunning({ effectiveRootMidi: 60, effectiveScaleId: 1, target });
  active.syncAuthored({ rootNote: 9, manualScale: 'Dorian', cofCurrentStep: 5 });
  assert.deepEqual(active.cancel(true).patch, authored);
  active.syncAuthored({ rootNote: 9, manualScale: 'Dorian', cofCurrentStep: 0 });
  assert.deepEqual(active.adoptStopped({ rootPitchClass: 0, scaleId: 1 }).inverse, { rootNote: 9, manualScale: 'Dorian', cofCurrentStep: 0 });
});

test('boundary helper waits for canonical event ends and handles one-bar cycle wraps', () => {
  const long = { version: 1 as const, enabled: true, currentEventIndex: 0, events: [{ id: 'long', source: { type: 'auto' as const }, duration: { unit: 'phrase' as const, value: 2 as const } }, { id: 'next', source: { type: 'auto' as const }, duration: { unit: 'bar' as const, value: 1 as const } }] };
  assert.equal(crossedHarmonyProgressionBoundary({ eventIndex: 0, absoluteBarIndex: 0 }, { eventIndex: 0, absoluteBarIndex: 1 }, long), false);
  assert.equal(crossedHarmonyProgressionBoundary({ eventIndex: 0, absoluteBarIndex: 1 }, { eventIndex: 1, absoluteBarIndex: 8 }, long), true);
  const one = { version: 1 as const, enabled: true, currentEventIndex: 0, events: [{ id: 'one', source: { type: 'auto' as const }, duration: { unit: 'bar' as const, value: 1 as const } }] };
  assert.equal(crossedHarmonyProgressionBoundary({ eventIndex: 0, absoluteBarIndex: 0 }, { eventIndex: 0, absoluteBarIndex: 1 }, one), true);
});
