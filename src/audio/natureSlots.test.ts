import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateLegacyNatureSlotState } from './natureSlots';
import { getCoreProductSoundscapeAssetDescriptorsForState } from './coreProductAssets';
import { coreProductStateUsesSoundscape } from './product/host/CoreProductAssetReadiness';
import {
  SOUNDSCAPE_TEXTURE_PARAM_START,
  SOUNDSCAPE_TEXTURE_PARAM_STRIDE,
  exactSoundscapesModuleParamsFromState,
  soundscapeSnapshotPayloadFromState,
} from './coreProductSoundscapesSnapshot';

test('legacy Waves and Nature textures migrate to stable Nature slots', () => {
  const migrated = migrateLegacyNatureSlotState({
    oceanSampleEnabled: true,
    oceanSampleLevel: 0.72,
    oceanSliceDuration: 19,
    oceanFilterType: 'highpass',
    oceanFilterCutoff: 2400,
    birdsEnabled: true,
    birdsLevel: 0.5,
    natureLevel: 0.8,
  });

  assert.equal(migrated.natureMasterEnabled, true);
  assert.equal(migrated.nature1Enabled, true);
  assert.equal(migrated.nature1SampleId, 'ghetary-waves');
  assert.equal(migrated.nature1Level, 0.72);
  assert.equal(migrated.nature1FilterType, 'highpass');
  assert.equal(migrated.nature2Enabled, true);
  assert.equal(migrated.nature2Level, 0.4);
});

test('canonical slots allow duplicate selections and serialize identity independently', () => {
  const state = {
    natureMasterEnabled: true,
    nature1Enabled: true,
    nature1SampleId: 'birds-alps',
    nature1Level: 0.3,
    nature1SliceDuration: 12,
    nature1SliceDensity: 0.2,
    nature1FilterType: 'bandpass',
    nature1FilterCutoff: 1800,
    nature1FilterResonance: 0.4,
    nature2Enabled: true,
    nature2SampleId: 'birds-alps',
    nature2Level: 0.7,
    nature2SliceDuration: 17,
    nature2SliceDensity: 0.8,
    nature2FilterType: 'notch',
    nature2FilterCutoff: 4200,
    nature2FilterResonance: 0.2,
  };
  const payload = soundscapeSnapshotPayloadFromState(state);
  const slot1 = SOUNDSCAPE_TEXTURE_PARAM_START;
  const slot2 = slot1 + SOUNDSCAPE_TEXTURE_PARAM_STRIDE;

  assert.equal(payload.enabled, true);
  assert.equal(payload.textureParams[slot1 + 5], 7102);
  assert.equal(payload.textureParams[slot2 + 5], 7102);
  assert.equal(payload.textureParams[slot1 + 7], 0.3);
  assert.equal(payload.textureParams[slot2 + 7], 0.7);
  assert.equal(payload.textureParams[slot1 + 8], 1);
  assert.equal(payload.textureParams[slot2 + 8], 3);
  assert.equal(payload.textureParams[slot1 + 2], 5);
});

test('aggregate module gates are independent from configured child state', () => {
  const params = exactSoundscapesModuleParamsFromState({
    insectsMasterEnabled: false,
    insectsEnabled: true,
    insectsLevel: 0.6,
  });
  assert.equal(params[61], 1, 'child remains configured for the fade lifecycle');
  assert.equal(params[102], 0, 'aggregate gate is off');
});

test('canonical Nature activation participates in soundscape asset readiness', () => {
  assert.equal(coreProductStateUsesSoundscape({ nature2Enabled: true }), true);
  assert.equal(coreProductStateUsesSoundscape({ natureMasterEnabled: true }), false);
  assert.equal(coreProductStateUsesSoundscape({ nature2Enabled: false }), false);
});

test('only enabled Nature slots request playback assets', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'http://localhost' } },
  });
  try {
    const descriptors = getCoreProductSoundscapeAssetDescriptorsForState({
      nature1Enabled: false,
      nature1SampleId: 'ghetary-waves',
      nature2Enabled: true,
      nature2SampleId: 'birds-fujian',
      nature3Enabled: false,
      nature3SampleId: 'birds-alps',
      nature4Enabled: false,
      nature4SampleId: 'frogs-fujian',
    });
    assert.deepEqual(descriptors.map((descriptor) => descriptor.assetId), [7105]);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});

test('legacy soundscape enables still request playback assets', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'http://localhost' } },
  });
  try {
    const descriptors = getCoreProductSoundscapeAssetDescriptorsForState({
      oceanSampleEnabled: true,
      oceanSampleLevel: 0.23,
      birdsEnabled: true,
      birdsLevel: 0.41,
    });
    assert.deepEqual(
      descriptors.map((descriptor) => [descriptor.assetId, descriptor.level]),
      [[7101, 0.23], [7102, 0.41]],
    );
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});
