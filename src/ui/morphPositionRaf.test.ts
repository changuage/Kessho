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
  const commits: Array<{ position: number; flush?: boolean }> = [];
  const scheduler = createMorphPositionScheduler(
    (position, options) => commits.push({ position, flush: options?.flush }),
    (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    () => undefined,
  );

  scheduler.schedule(42);
  scheduler.flush(47);
  assert.deepEqual(commits, [{ position: 47, flush: true }]);
  callbacks.forEach((callback) => callback(16.7));
  assert.deepEqual(commits, [{ position: 47, flush: true }]);
  assert.equal(scheduler.metrics().commits, 1);
});

test('morph release flush reaches an already committed position', () => {
  const callbacks: FrameRequestCallback[] = [];
  const commits: Array<{ position: number; flush?: boolean }> = [];
  const scheduler = createMorphPositionScheduler(
    (position, options) => commits.push({ position, flush: options?.flush }),
    (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    () => undefined,
  );

  scheduler.schedule(30);
  callbacks.shift()?.(16.7);
  scheduler.flush(30);

  assert.deepEqual(commits, [
    { position: 30, flush: undefined },
    { position: 30, flush: true },
  ]);
  assert.equal(scheduler.metrics().commits, 2);
});

test('morph reset allows unchanged positions after endpoint content replacement', () => {
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

  scheduler.schedule(50);
  const staleCallback = callbacks.shift();
  scheduler.reset();
  staleCallback?.(16.7);
  assert.deepEqual(commits, [], 'reset cancels the stale callback');
  scheduler.schedule(50);
  callbacks.shift()?.(33.4);

  assert.deepEqual(commits, [50]);
  assert.equal(scheduler.metrics().commits, 1);
});
