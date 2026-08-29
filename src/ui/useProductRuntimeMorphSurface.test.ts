import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useProductRuntimeMorphSurface } from './useProductRuntimeMorphSurface';

test('registers a fresh callback before each Journey morph clock start', () => {
  const calls: string[] = [];
  const frames: string[] = [];
  const toB = (now: number) => frames.push(`toB:${now}`);
  const toA = (now: number) => frames.push(`toA:${now}`);
  let registered: ((now: number) => void) | null = null;
  const invokeRegistered = (now: number): void => {
    assert.ok(registered);
    registered(now);
  };
  let surface!: ReturnType<typeof useProductRuntimeMorphSurface>;

  function Harness() {
    surface = useProductRuntimeMorphSurface({
      resetProductCofDrift: () => undefined,
      setProductJourneyMorphClockCallback: (callback) => {
        registered = callback;
        calls.push(callback === toB ? 'set:toB' : callback === toA ? 'set:toA' : 'set:null');
      },
      startProductJourneyMorphClock: () => calls.push('start'),
      stopProductJourneyMorphClock: () => calls.push('stop'),
    });
    return null;
  }

  renderToStaticMarkup(createElement(Harness));

  surface.startProductJourneyMorphClock(toB);
  invokeRegistered(25);
  surface.stopProductJourneyMorphClock();
  surface.startProductJourneyMorphClock(toA);
  invokeRegistered(75);
  surface.stopProductJourneyMorphClock();

  assert.deepEqual(calls, [
    'set:toB', 'start', 'stop', 'set:null',
    'set:toA', 'start', 'stop', 'set:null',
  ]);
  assert.deepEqual(frames, ['toB:25', 'toA:75']);
  assert.equal(registered, null);
});
