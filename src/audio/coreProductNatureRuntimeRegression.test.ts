import assert from 'node:assert/strict';

import {
  CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID,
  CORE_PRODUCT_DRUM_RANGE_TARGET_BASE,
  CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE,
  CORE_PRODUCT_MODULATION_RANGE_MODE,
  CORE_PRODUCT_PAD_RUNTIME_PARAM_ID_BASE,
  CORE_PRODUCT_PAD2_RUNTIME_PARAM_ID_BASE,
  CORE_PRODUCT_SOURCE_IDS,
  CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX,
  CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_TEXTURE_LEVEL_RANGE_TARGET_BASE,
  createCoreProductModulationRangeEvent,
  resolveCoreProductRangeTargets,
  type CoreProductModulationRangeMode,
} from './coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_DRUM_PARAM_SPECS, KESSHO_PRODUCT_PAD_PARAM_SPECS } from './generated/kesshoProductSchema';
import { CORE_PRODUCT_SOUNDSCAPE_ASSETS } from './coreProductAssets';
import { SOUNDSCAPE_TEXTURE_PARAM_START, SOUNDSCAPE_TEXTURE_PARAM_STRIDE } from './coreProductSoundscapesSnapshot';
import { createCoreProductEarthTextureDebugState } from './product/host/CoreProductEarthTextureDebug';
import type { SliderState } from '../ui/state';

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
          nature1Level: 0.4,
          nature2Level: 0.3,
          nature3Level: 0.2,
          nature4Level: 0.1,
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

function assertResolvedTargetsForMode(key: string, mode: CoreProductModulationRangeMode, expected: ExpectedRangeTarget[]): void {
  const targets = resolveCoreProductRangeTargets(key, mode);
  assert.equal(targets.length, expected.length, `${key} must resolve to the expected target count for mode ${mode}`);
  for (const expectedTarget of expected) {
    assert(
      targets.some((target) => (
        target.targetId === expectedTarget.targetId &&
        target.paramId === expectedTarget.paramId
      )),
      `${key} missing mode ${mode} target ${expectedTarget.targetId}:${expectedTarget.paramId}`,
    );
  }
}

function assetTarget(assetId: number): number {
  return CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + assetId;
}

function natureSlotLevelTarget(slotIndex: number): number {
  return CORE_PRODUCT_SOUNDSCAPE_TEXTURE_LEVEL_RANGE_TARGET_BASE + slotIndex;
}

function natureSlotParamTarget(slotIndex: number, paramIndex: number): number {
  return CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE +
    SOUNDSCAPE_TEXTURE_PARAM_START + slotIndex * SOUNDSCAPE_TEXTURE_PARAM_STRIDE + paramIndex;
}

function drumRuntimeParamId(key: string): number {
  const spec = KESSHO_PRODUCT_DRUM_PARAM_SPECS.find((candidate) => candidate.key === key);
  assert(spec, `Missing generated drum param spec for ${key}`);
  return CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE + spec.index;
}

function padRuntimeParamId(key: string, padIndex: 0 | 1): number {
  const spec = KESSHO_PRODUCT_PAD_PARAM_SPECS.find((candidate) => (
    padIndex === 0 ? candidate.key === key : candidate.pad2Key === key
  ));
  assert(spec, `Missing generated pad param spec for ${key}`);
  const base = padIndex === 0 ? CORE_PRODUCT_PAD_RUNTIME_PARAM_ID_BASE : CORE_PRODUCT_PAD2_RUNTIME_PARAM_ID_BASE;
  return base + spec.index;
}

function assertStateBackedEnumValue<K extends keyof SliderState>(key: K, stateValue: SliderState[K], expectedValue: number): void {
  const targets = resolveCoreProductRangeTargets(String(key));
  assert.equal(targets.length, 1, `${String(key)} must resolve to one enum target`);
  const event = createCoreProductModulationRangeEvent(
    targets[0]!,
    { min: 0, max: 1 },
    CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk,
    0.5,
    { state: { [key]: stateValue } as Partial<SliderState> },
  );
  assert.equal(event.value4, expectedValue, `${String(key)} must map ${String(stateValue)} to ${expectedValue}`);
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
    ['sample1Level', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['sample2Level', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature1Level', [{ targetId: natureSlotLevelTarget(0), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature2Level', [{ targetId: natureSlotLevelTarget(1), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature3Level', [{ targetId: natureSlotLevelTarget(2), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature4Level', [{ targetId: natureSlotLevelTarget(3), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature1SliceDuration', [{ targetId: natureSlotParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature2SliceDuration', [{ targetId: natureSlotParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature3SliceDuration', [{ targetId: natureSlotParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature4SliceDuration', [{ targetId: natureSlotParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature1SliceDensity', [{ targetId: natureSlotParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature2SliceDensity', [{ targetId: natureSlotParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature3SliceDensity', [{ targetId: natureSlotParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature4SliceDensity', [{ targetId: natureSlotParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature1FilterCutoff', [{ targetId: natureSlotParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature2FilterCutoff', [{ targetId: natureSlotParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature3FilterCutoff', [{ targetId: natureSlotParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature4FilterCutoff', [{ targetId: natureSlotParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature1FilterResonance', [{ targetId: natureSlotParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature2FilterResonance', [{ targetId: natureSlotParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature3FilterResonance', [{ targetId: natureSlotParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['nature4FilterResonance', [{ targetId: natureSlotParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['oceanSampleLevel', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['waterLevel', [{ targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 96, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['insectsSharedLevel', [{ targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 99, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['waterIntensity', [
      { targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 3, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
    ]],
    ['waterLayerHardDrops', [{ targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 23, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['insectsDensity', [
      { targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 63, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 64, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
    ]],
    ['insects2Motion', [
      { targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 92, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + 93, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
    ]],
    ['birdsLevel', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['birds2Level', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds2.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['frogsLevel', [{ targetId: assetTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.frogs.assetId), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel }]],
    ['natureLevel', [
      { targetId: natureSlotLevelTarget(0), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: natureSlotLevelTarget(1), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: natureSlotLevelTarget(2), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
      { targetId: natureSlotLevelTarget(3), paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel },
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
    ['leadVibratoDepth', [
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth },
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth },
    ]],
    ['leadVibratoRate', [
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate },
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate },
    ]],
    ['leadGlide', [
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide },
      { targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide },
    ]],
    ['lead1VibratoDepth', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth }]],
    ['lead1VibratoRate', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate }]],
    ['lead1Glide', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide }]],
    ['lead2VibratoDepth', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth }]],
    ['lead2VibratoRate', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate }]],
    ['lead2Glide', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide }]],
    ['lead1PostLPFKeyTracking', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking }]],
    ['lead1Attack', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds }]],
    ['lead1Decay', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds }]],
    ['lead1Sustain', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceSustain }]],
    ['lead1Hold', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['lead1Release', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds }]],
    ['lead2Attack', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds }]],
    ['lead2Decay', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds }]],
    ['lead2Sustain', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceSustain }]],
    ['lead2Hold', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['lead2Release', [{ targetId: CORE_PRODUCT_SOURCE_IDS.lead2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds }]],
    ['synthHold', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['pad2Hold', [{ targetId: CORE_PRODUCT_SOURCE_IDS.pad2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['sample1AttackMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds }]],
    ['sample1DecayMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds }]],
    ['sample1Sustain', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceSustain }]],
    ['sample1HoldMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['sample1ReleaseMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds }]],
    ['sample2AttackMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds }]],
    ['sample2DecayMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds }]],
    ['sample2Sustain', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceSustain }]],
    ['sample2HoldMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds }]],
    ['sample2ReleaseMs', [{ targetId: CORE_PRODUCT_SOURCE_IDS.sample2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds }]],
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
  for (const key of ['pianoLevel', 'pianoAttack', 'pianoDecay', 'pianoSustain', 'pianoHold', 'pianoRelease']) {
    assert.equal(resolveCoreProductRangeTargets(key).length, 0, `${key} must not resolve as a Product Core runtime source`);
  }
}

{
  assertResolvedTargets('synthAttack', [
    { targetId: 0, paramId: padRuntimeParamId('synthAttack', 0) },
    { targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds },
  ]);
  assertResolvedTargetsForMode('synthAttack', CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, [
    { targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: padRuntimeParamId('synthAttack', 0) },
    { targetId: CORE_PRODUCT_SOURCE_IDS.pad1, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds },
  ]);
  assertResolvedTargetsForMode('pad2Attack', CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, [
    { targetId: CORE_PRODUCT_SOURCE_IDS.pad2, paramId: padRuntimeParamId('pad2Attack', 1) },
    { targetId: CORE_PRODUCT_SOURCE_IDS.pad2, paramId: KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds },
  ]);
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
    ['spectralFreezeStretchSpeed', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeStretchSpeed }]],
    ['dynamicsDrive', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDrive }]],
    ['dynamicsEnabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEnabled }]],
    ['driftEnabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftEnabled }]],
    ['driftMode', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftMode }]],
    ['driftQuality', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftQuality }]],
    ['driftMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftMix }]],
    ['erosionEnabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionEnabled }]],
    ['erosionQuality', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionQuality }]],
    ['erosionMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionMix }]],
    ['degradeHp', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeHp }]],
    ['degradeLp', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeLp }]],
    ['dynamicsSaturationEnabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationEnabled }]],
    ['dynamicsSaturationMode', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationMode }]],
    ['dynamicsSaturationQuality', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationQuality }]],
    ['dynamicsSaturationDrive', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationDrive }]],
    ['endCompEnabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompEnabled }]],
    ['endCompMode', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMode }]],
    ['endCompMix', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMix }]],
    ['dynamicsEq1Enabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1Enabled }]],
    ['dynamicsEq1LowType', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1LowType }]],
    ['dynamicsEq2Enabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2Enabled }]],
    ['dynamicsEq2HighType', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2HighType }]],
    ['sidechainEnabled', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainEnabled }]],
    ['sidechainAmount', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainAmount }]],
    ['sidechainKeyA', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyA }]],
    ['sidechainKeyB', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyB }]],
    ['sidechainKeyAWeight', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyAWeight }]],
    ['sidechainKeyBWeight', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyBWeight }]],
    ['sidechainPad1Target', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad1Target }]],
    ['delayAToBSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToDelayB }]],
    ['delayBGranularSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToGranular }]],
    ['granularReverbSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToReverb }]],
    ['degradeReverbSend', [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.RoutingDegradeToReverb }]],
    ['lead1Density', [{ targetId: CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID, paramId: KESSHO_PRODUCT_PARAM_IDS.SequencerLaneProbability }]],
  ];
  for (const [key, expected] of fxCases) assertResolvedTargets(key, expected);
}

{
  assertStateBackedEnumValue('driftMode', 'clean', 0);
  assertStateBackedEnumValue('driftMode', 'abyssWater', 1);
  assertStateBackedEnumValue('driftMode', 'shallowWater', 2);
  assertStateBackedEnumValue('driftQuality', 'balanced', 1);
  assertStateBackedEnumValue('driftQuality', 'hq', 2);
  assertStateBackedEnumValue('erosionQuality', 'media', 1);
  assertStateBackedEnumValue('erosionQuality', 'hq', 2);
  assertStateBackedEnumValue('dynamicsSaturationMode', 'clean', 0);
  assertStateBackedEnumValue('dynamicsSaturationMode', 'fold', 4);
  assertStateBackedEnumValue('dynamicsSaturationQuality', 'smooth', 1);
  assertStateBackedEnumValue('dynamicsSaturationQuality', 'hq', 2);
  assertStateBackedEnumValue('endCompMode', 'studioClear', 0);
  assertStateBackedEnumValue('endCompMode', 'twoBand', 4);
  assertStateBackedEnumValue('sidechainKeyA', 'kick', 2);
  assertStateBackedEnumValue('sidechainKeyB', 'membrane', 7);
}

{
  const targets = resolveCoreProductRangeTargets('oceanSampleLevel');
  assert.equal(targets.length, 1, 'Waves level must be a Product Core runtime-walk range key');
  const event = createCoreProductModulationRangeEvent(
    targets[0]!,
    { min: 0, max: 0.08 },
    CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk,
    0.04,
    {
      randomWalkMode: 'localBrownian',
      randomWalkSpeed: 1,
      state: { oceanSampleLevel: 0.04 },
    },
  );
  assert.equal(event.eventKind, KESSHO_PRODUCT_EVENT_IDS.SetModulationRange);
  assert.equal(event.targetId, CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId);
  assert.equal(event.paramId, KESSHO_PRODUCT_PARAM_IDS.SourceLevel);
  assert.equal(event.value, 0);
  assert.equal(event.value2, 0.08, 'Waves runtime walk must target the ocean asset level');
  assert.equal(event.value4, 0.04, 'The current Waves level should map to the current asset-ref gain');
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
  assert.equal(targets.length, 7, 'Shared Nature level must modulate canonical slots and legacy asset refs');
  const textureEvent = createCoreProductModulationRangeEvent(
    targets.find((target) => target.targetId === natureSlotLevelTarget(0))!,
    { min: 0, max: 0.5 },
    CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk,
    0.25,
    {
      randomWalkMode: 'localBrownian',
      randomWalkSpeed: 1,
      state: { nature1Level: 0.4, natureLevel: 0.25 },
    },
  );
  assert.equal(textureEvent.value, 0);
  assert.equal(textureEvent.value2, 0.2, 'Shared Nature runtime walk must scale the canonical slot level');
  assert.equal(textureEvent.value4, 0.1, 'Shared Nature current value must map through the canonical slot level');
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
  }, 18, {
    waves: null,
    birds: {
      fileName: 'Alps Birds 2_noiseremoval_441_m.ogg',
      active: true,
      textureParamsAvailable: false,
      useTextureSlices: true,
      assetTooShortForRequestedSlice: false,
      seed: 2,
      sliceDuration: 20,
      fadeTime: 3.2,
      density: 0,
      strideSeconds: 0,
      nowTime: 18,
      activeSliceCount: 4,
      playingSliceCount: 1,
      activeSlices: [],
    },
    birds2: null,
    frogs: null,
  });
  const birds = debugState.birds;
  assert(birds, 'Birds texture debug snapshot should exist');
  assert.equal(birds.active, true, 'Enabled audible birds should be marked active');
  assert.equal(birds.textureParamsAvailable, false, 'Product Core Birds debug should preserve missing texture params');
  assert.equal(birds.useTextureSlices, true, 'Product Core Birds debug should mark texture slices enabled');
  assert.equal(
    birds.assetTooShortForRequestedSlice,
    false,
    'Product Core Birds debug should not flag a long asset as too short',
  );
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
