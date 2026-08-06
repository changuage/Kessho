import assert from 'node:assert/strict';
import test from 'node:test';
import { KESSHO_PRODUCT_PARAM_IDS } from '../audio/generated/kesshoProductParams';
import { DEFAULT_STATE } from './state';
import {
  createSpectralFreezeGestureEvents,
  isSpectralFreezeGesturePatch,
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
