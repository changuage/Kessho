import assert from 'node:assert/strict';
import test from 'node:test';
import { KESSHO_PRODUCT_PARAM_IDS } from '../audio/generated/kesshoProductParams';
import { DEFAULT_STATE } from './state';
import {
  createSpectralFreezeGestureEvents,
  isSpectralFreezeGesturePatch,
  prepareSpectralFreezeCaptureForPlayback,
} from './spectralFreezeGesture';

test('capture sends serial before active and release sends active off', () => {
  const capturePatch = { spectralFreezeCaptureSerial: 7, spectralFreezeActive: true };
  const capture = createSpectralFreezeGestureEvents(
    { ...DEFAULT_STATE, ...capturePatch },
    capturePatch,
  );
  assert.deepEqual(
    capture.map(({ paramId, value }) => [paramId, value]),
    [
      [KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeCaptureSerial, 7],
      [KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive, 1],
    ],
  );

  const releasePatch = { spectralFreezeActive: false };
  const release = createSpectralFreezeGestureEvents(
    { ...DEFAULT_STATE, ...releasePatch },
    releasePatch,
  );
  assert.deepEqual(
    release.map(({ paramId, value }) => [paramId, value]),
    [[KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive, 0]],
  );
  assert.equal(isSpectralFreezeGesturePatch({ spectralFreezeMix: 1 }), false);
});

test('an armed L4 freeze requests one new capture at each playback start', () => {
  const armed = {
    ...DEFAULT_STATE,
    spectralFreezeEnabled: true,
    spectralFreezeActive: true,
    spectralFreezeCaptureSerial: 41,
  };
  const firstStart = prepareSpectralFreezeCaptureForPlayback(armed);
  const secondStart = prepareSpectralFreezeCaptureForPlayback(firstStart);
  assert.equal(firstStart.spectralFreezeCaptureSerial, 42);
  assert.equal(secondStart.spectralFreezeCaptureSerial, 43);
  assert.equal(prepareSpectralFreezeCaptureForPlayback(DEFAULT_STATE), DEFAULT_STATE);
});
