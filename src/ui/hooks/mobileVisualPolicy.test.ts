import assert from 'node:assert/strict';
import test from 'node:test';
import { getCappedCanvasDpr } from './useAnimationVisibility';
import { isMobileVisualViewport, MOBILE_VISUAL_QUERY } from './mobileVisualPolicy';

test('mobile visual policy combines the 767px width and coarse-pointer signals once', () => {
  const originalWindow = globalThis.window;
  let matchMediaCalls = 0;
  let coarsePointer = false;
  const media = {
    get matches() {
      return coarsePointer;
    },
  } as unknown as MediaQueryList;
  let innerWidth = 1280;
  const windowStub = {
    get innerWidth() {
      return innerWidth;
    },
    devicePixelRatio: 3,
    matchMedia(query: string) {
      matchMediaCalls += 1;
      assert.equal(query, MOBILE_VISUAL_QUERY);
      return media;
    },
  } as unknown as Window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });

  try {
    assert.equal(isMobileVisualViewport(), false);
    assert.equal(getCappedCanvasDpr(1.25, 1.5), 1.5);
    assert.equal(getCappedCanvasDpr(1.25, 1.5), 1.5);
    assert.equal(matchMediaCalls, 1);

    innerWidth = 768;
    assert.equal(isMobileVisualViewport(), false);

    innerWidth = 767;
    assert.equal(isMobileVisualViewport(), true);
    assert.equal(getCappedCanvasDpr(1.25, 1.5), 1.25);

    innerWidth = 1280;
    coarsePointer = true;
    assert.equal(isMobileVisualViewport(), true);
    assert.equal(getCappedCanvasDpr(1.25, 1.5), 1.25);
    assert.equal(matchMediaCalls, 1);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});

test('mobile visual policy keeps SSR and no-matchMedia fallbacks safe', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
  try {
    assert.equal(isMobileVisualViewport(), false);
    assert.equal(getCappedCanvasDpr(), 1);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }

  const windowStub = { innerWidth: 767, devicePixelRatio: 2 } as unknown as Window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
  try {
    assert.equal(isMobileVisualViewport(), true);
    assert.equal(getCappedCanvasDpr(), 1.25);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});
