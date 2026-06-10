import assert from 'node:assert/strict';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import { CORE_PRODUCT_SOURCE_IDS, resolveCoreProductRangeTargets } from './coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';

const disabledDelaySnapshot = createCoreProductSnapshot({
  padEnabled: true,
  synthLevel: 1,
  pad1DelayASend: 1,
  pad1DelayBSend: 1,
  delayAEnabled: false,
  delayAMix: 1,
  delayAReverbSend: 1,
  delayAToBSend: 1,
  delayAGranularSend: 1,
  delayADegradeSend: 1,
  granularDelayEnabled: false,
  granularDelayMix: 1,
  granularDelayReverbSend: 1,
  delayBToASend: 1,
  delayBGranularSend: 1,
  delayBDegradeSend: 1,
  granularDelayASend: 1,
  granularDelayBSend: 1,
});

const pad1Source = disabledDelaySnapshot.sources.find((source) => source.delayASend > 0.9 && source.delayBSend > 0.9);
assert(pad1Source, 'regression fixture should keep active source delay sends');
assert.equal(disabledDelaySnapshot.fx.delayAEnabled, false, 'Delay A disabled flag must not be auto-enabled by active sends');
assert.equal(disabledDelaySnapshot.fx.delayAMix, 0, 'Delay A mix should resolve to silence while disabled');
assert.equal(disabledDelaySnapshot.fx.delayBEnabled, false, 'Delay B disabled flag must not be auto-enabled by active sends');
assert.equal(disabledDelaySnapshot.fx.delayBMix, 0, 'Delay B mix should resolve to silence while disabled');

const delayAEnableTargets = resolveCoreProductRangeTargets('delayAEnabled');
assert.equal(delayAEnableTargets.length, 1, 'Delay A enable should have one live Product Core target');
assert.equal(delayAEnableTargets[0]?.paramId, KESSHO_PRODUCT_PARAM_IDS.FxDelayAEnabled);
assert.equal(delayAEnableTargets[0]?.mapValue?.(0, {}), 0);
assert.equal(delayAEnableTargets[0]?.mapValue?.(1, {}), 1);

const delayBEnableTargets = resolveCoreProductRangeTargets('granularDelayEnabled');
assert.equal(delayBEnableTargets.length, 1, 'Delay B enable should have one live Product Core target');
assert.equal(delayBEnableTargets[0]?.paramId, KESSHO_PRODUCT_PARAM_IDS.FxDelayBEnabled);
assert.equal(delayBEnableTargets[0]?.mapValue?.(0, {}), 0);
assert.equal(delayBEnableTargets[0]?.mapValue?.(1, {}), 1);

const synthSourceAliasCases = [
  ['lead', CORE_PRODUCT_SOURCE_IDS.lead1],
  ['lead1', CORE_PRODUCT_SOURCE_IDS.lead1],
  ['lead2', CORE_PRODUCT_SOURCE_IDS.lead2],
  ['piano', CORE_PRODUCT_SOURCE_IDS.piano],
  ['pad', CORE_PRODUCT_SOURCE_IDS.pad1],
  ['pad1', CORE_PRODUCT_SOURCE_IDS.pad1],
  ['pad2', CORE_PRODUCT_SOURCE_IDS.pad2],
  ['synth1', CORE_PRODUCT_SOURCE_IDS.pad1],
] as const;

for (const [sourceValue, expectedSourceId] of synthSourceAliasCases) {
  const snapshot = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: sourceValue,
  });
  assert.equal(
    snapshot.synthLanes[0]?.targetSourceId,
    expectedSourceId,
    `Product synth sequencer source ${sourceValue} should map to the intended source ID`,
  );
}
