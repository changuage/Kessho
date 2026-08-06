import test from 'node:test';
import assert from 'node:assert/strict';
import { createMorphPositionScheduler } from './morphPositionRaf';

test('morph input commits at most once per animation frame and drops duplicate positions', () => {
  const callbacks: FrameRequestCallback[] = [];
  const commits: number[] = [];
  const scheduler = createMorphPositionScheduler(
    (position) => commits.push(position),
    (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    () => undefined,
  );

  scheduler.schedule(10);
  scheduler.schedule(20);
  scheduler.schedule(20);
  scheduler.schedule(30);
  assert.equal(callbacks.length, 1, 'one RAF should cover the whole input burst');
  callbacks.shift()?.(16.7);
  assert.deepEqual(commits, [30]);
  assert.deepEqual(scheduler.metrics(), {
    frameRequests: 1,
    commits: 1,
    duplicatePositions: 0,
  });

  scheduler.schedule(30);
  callbacks.shift()?.(33.4);
  assert.deepEqual(commits, [30]);
  assert.equal(scheduler.metrics().duplicatePositions, 1);
});

test('morph release flush commits the final position before the pending frame', () => {
  const callbacks: FrameRequestCallback[] = [];
  const commits: number[] = [];
  const scheduler = createMorphPositionScheduler(
    (position) => commits.push(position),
    (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    () => undefined,
  );

  scheduler.schedule(42);
  scheduler.flush(47);
  assert.deepEqual(commits, [47]);
  callbacks.forEach((callback) => callback(16.7));
  assert.deepEqual(commits, [47]);
  assert.equal(scheduler.metrics().commits, 1);
});
