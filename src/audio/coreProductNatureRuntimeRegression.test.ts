import assert from 'node:assert/strict';

import {
  CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID,
  CORE_PRODUCT_DRUM_RANGE_TARGET_BASE,
  CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE,
  CORE_PRODUCT_MODULATION_RANGE_MODE,
  CORE_PRODUCT_SOURCE_IDS,
  CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE,
  createCoreProductModulationRangeEvent,
  resolveCoreProductRangeTargets,
} from './coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_DRUM_PARAM_SPECS } from './generated/kesshoProductSchema';
import { CORE_PRODUCT_SOUNDSCAPE_ASSETS } from './coreProductAssets';
import { createCoreProductEarthTextureDebugState } from './product/host/CoreProductEarthTextureDebug';

type ExpectedRangeTarget = {
  targetId: number;
  paramId: number;
};

function assertResolvedTargets(key: string, expected: ExpectedRangeTarget[]): void {
  const targets = resolveCoreProductRangeTargets(key);
  assert.equal(targets.length, expected.length, `${key} must resolve to the expected target count`);
  for (const expectedTarget of expected) {
    assert(
      targets.some((target) => (
        target.targetId === expectedTarget.targetId &&
        target.paramId === expectedTarget.paramId
      )),
      `${key} missing target ${expectedTarget.targetId}:${expectedTarget.paramId}`,
    );
  }
  for (const target of targets) {
    const event = createCoreProductModulationRangeEvent(
      target,
      { min: 0.25, max: 0.75 },
      CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk,
      0.5,
      {
        randomWalkMode: 'localBrownian',
        randomWalkSpeed: 1,
        state: {
          birdsLevel: 0.32,
          birds2Level: 0.22,
          frogsLevel: 0.18,
          natureLevel: 0.5,
        },
      },
    );
    assert.equal(event.eventKind, KESSHO_PRODUCT_EVENT_IDS.SetModulationRange, `${key} must encode a modulation range`);
    assert.equal(event.targetId, target.targetId, `${key} encoded the wrong target id`);
    assert.equal(event.paramId, target.paramId, `${key} encoded the wrong param id`);
    assert(Number.isFinite(event.value), `${key} encoded a non-finite range minimum`);
    assert(Number.isFinite(event.value2), `${key} encoded a non-finite range maximum`);
    assert(Number.isFinite(event.value4), `${key} encoded a non-finite current value`);
    assert.notEqual(event.flags ?? 0, 0, `${key} encoded an inactive range`);
  }
}

function assetTarget(assetId: number): number {
  return CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + assetId;
}

function drumRuntimeParamId(key: string): number {
  const spec = KESSHO_PRODUCT_DRUM_PARAM_SPECS.find((candidate) => candidate.key === key);
  assert(spec, `Missing generated drum param spec for ${key}`);
  return CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE + spec.index;
}

{
  const soundEngineCases: Array<[string, ExpectedRangeTarget[]]> = [
    ['synthLevel', [
      { targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: CORE_PRODUCT_SOURCE_IDS.pad2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
    ]],
    ['pad2Level', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['leadLevel', [
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
    ]],
    ['lead1Level', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['lead2Level', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['drumLevel', [
      { targetId: CORE_PRODUCT_SOURCE_IDS.drum, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: 0, paramId: drumRuntimeParamId('drumLevel') },
    ]],
    ['pianoLevel', [{ targetId: CORE_PRODUCT_SOURCE_IDS.piano, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['oceanSampleLevel', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['waterLevel', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['insectsSharedLevel', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['birdsLevel', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['birds2Level', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds2.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['frogsLevel', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.frogs.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['natureLevel', [
      { targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds2.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.frogs.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
    ]],
  ];
  for (const [key, expected] of soundEngineCases) assertResolvedTargets(key, expected);
}

{
  const sourceParamCases: Array<[string, ExpectedRangeTarget[]]> = [
    ['padMorph', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceMorph }]],
    ['padDistance', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDistance }]],
    ['padExpression', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceExpression }]],
    ['padPostLPF', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz }]],
    ['padStereoWidth', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth }]],
    ['pad1ReverbSend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend }]],
    ['pad1DelayASend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend }]],
    ['pad1DelayBSend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend }]],
    ['granularPad1Send', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend }]],
    ['padDiffuseSend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend }]],
    ['lead1PostLPFKeyTracking', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking }]],
    ['pianoAttack', [{ targetId: CORE_PRODUCT_SOURCE_IDS.piano, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds }]],
    ['pianoDecay', [{ targetId: CORE_PRODUCT_SOURCE_IDS.piano, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds }]],
    ['pianoSustain', [{ targetId: CORE_PRODUCT_SOURCE_IDS.piano, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceSustain }]],
    ['pianoHold', [{ targetId: CORE_PRODUCT_SOURCE_IDS.piano, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['pianoRelease', [{ targetId: CORE_PRODUCT_SOURCE_IDS.piano, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds }]],
    ['waterMorph', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceMorph }]],
    ['natureReverbSend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend }]],
    ['natureDelayASend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend }]],
    ['natureDelayBSend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend }]],
    ['granularNatureSend', [{ targetId: CORE_PRODUCT_SOURCE_IDS.soundscape, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend }]],
    ['drumKickMorph', [{ targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + 1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceMorph }]],
    ['drumNoiseExpression', [{ targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + 5, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceExpression }]],
    ['drumMembraneDistance', [{ targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + 6, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDistance }]],
    ['drumSubDelaySend', [{ targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend }]],
    ['drumKickDecay', [{ targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + 1, paramId: drumRuntimeParamId('drumKickDecay') }]],
  ];
  for (const [key, expected] of sourceParamCases) assertResolvedTargets(key, expected);
}

{
  const fxCases: Array<[string, ExpectedRangeTarget[]]> = [
    ['masterVolume', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterGain }]],
    ['masterLimiterCeilingDb', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterLimiterCeilingDb }]],
    ['delayAFeedback', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayAFeedback }]],
    ['delayAModRate', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayAModRateHz }]],
    ['delayAModDepth', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayAModDepthMs }]],
    ['delayACrossFeedFilter', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayACrossFeedFilterHz }]],
    ['delayBMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix }]],
    ['granularDelayTime', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayBBaseTimeMs }]],
    ['granularDelayActivity', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayBActivity }]],
    ['delayBTapeHead3Pan', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead3Pan }]],
    ['granularLevel', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxGranularMix }]],
    ['granularFeedback', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxGranularFeedback }]],
    ['granularReverbLPF', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxGranularReverbLpfHz }]],
    ['granularV1Speed', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxGranularV1Speed }]],
    ['reverbLevel', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxReverbMix }]],
    ['reverbDecay', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxReverbDecay }]],
    ['reverbShimmer', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerAmount }]],
    ['reverbPreCompRatio', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompRatio }]],
    ['spectralFreezeMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeMix }]],
    ['spectralFreezeSpeed', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeSpeed }]],
    ['dynamicsDrive', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDrive }]],
    ['characterMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterMix }]],
    ['degradeMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeMix }]],
    ['dynamicsSaturationDrive', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationDrive }]],
    ['endCompMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMix }]],
    ['sidechainAmount', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainAmount }]],
    ['sidechainPad1Target', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad1Target }]],
    ['delayAToBSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToDelayB }]],
    ['delayBGranularSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToGranular }]],
    ['granularReverbSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToReverb }]],
    ['lead1Density', [{ targetId: CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID, paramId: KESSHO_PRODUCT_PARAM_IDS.SequencerLaneProbability }]],
  ];
  for (const [key, expected] of fxCases) assertResolvedTargets(key, expected);
}

{
  const targets = resolveCoreProductRangeTargets('birdsLevel');
  assert.equal(targets.length, 1, 'Birds level must be a Product Core runtime-walk range key');
  const event = createCoreProductModulationRangeEvent(
    targets[0]!,
    { min: 0, max: 0.32 },
    CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk,
    0.16,
    {
      randomWalkMode: 'localBrownian',
      randomWalkSpeed: 1,
      state: { birdsLevel: 0.16 },
    },
  );
  assert.equal(event.eventKind, KESSHO_PRODUCT_EVENT_IDS.SetModulationRange);
  assert.equal(event.targetId, CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId);
  assert.equal(event.paramId, KESSHO_PRODUCT_PARAM_IDS.SourceLevel);
  assert.equal(event.value, 0);
  assert.equal(event.value2, 0.32, 'Birds runtime walk must target the baked soundscape asset level');
  assert.equal(event.value4, 0.16, 'The current birds level should map to the current asset-ref gain');
}

{
  const targets = resolveCoreProductRangeTargets('natureLevel');
  assert.equal(targets.length, 3, 'Shared Nature level must modulate every Product Core nature asset-ref level');
  const event = createCoreProductModulationRangeEvent(
    targets[0]!,
    { min: 0, max: 0.5 },
    CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk,
    0.25,
    {
      randomWalkMode: 'localBrownian',
      randomWalkSpeed: 1,
      state: { birdsLevel: 0.32, natureLevel: 0.25 },
    },
  );
  assert.equal(event.value, 0);
  assert.equal(event.value2, 0.16, 'Shared Nature runtime walk must scale the Birds asset-ref level');
  assert.equal(event.value4, 0.08, 'Shared Nature current value must map through the active Birds level');
}

{
  const debugState = createCoreProductEarthTextureDebugState({
    birdsEnabled: true,
    birdsLevel: 0.16,
    natureLevel: 1,
    birdsSliceDuration: 20,
    birdsSliceDensity: 0,
    seed: 42,
    seedWindow: 'hour',
  }, 18);
  const birds = debugState.birds;
  assert(birds, 'Birds texture debug snapshot should exist');
  assert.equal(birds.active, true, 'Enabled audible birds should be marked active');
  assert(birds.activeSliceCount >= 4, 'Product Core texture debug must track queued/staged slices');
  assert(
    birds.activeSlices.length > 0 && birds.activeSlices.length <= 3,
    'Product Core texture debug should draw a readable near-now slice window',
  );
  assert(
    birds.activeSlices.some((slice) => slice.startTime > birds.nowTime),
    'Product Core texture debug should include the next scheduled slice',
  );
  const sortedSlices = [...birds.activeSlices].sort((a, b) => a.startTime - b.startTime);
  const currentSlice = sortedSlices.find((slice) => slice.startTime <= birds.nowTime && slice.endTime >= birds.nowTime);
  const nextSlice = currentSlice
    ? sortedSlices.find((slice) => slice.startTime > currentSlice.endTime)
    : null;
  assert(currentSlice && nextSlice, 'Product Core texture debug should expose the density-zero current-to-next gap');
  assert(nextSlice.startTime > currentSlice.endTime, 'Product Core density-zero texture debug should leave a visible gap');
  assert(
    new Set(birds.activeSlices.map((slice) => slice.offset.toFixed(2))).size >= 2,
    'Product Core Birds debug should expose varying sample offsets at density zero',
  );
}
