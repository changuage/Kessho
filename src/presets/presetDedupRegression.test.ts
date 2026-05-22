import assert from 'node:assert/strict';

import { extractCascade, getCascadeKeys } from './codec';
import {
  getPresetChildSpecs,
  hashCanonicalJson,
  normalizeResolvedVersionData,
  presetVersionStorageSignaturesEqual,
  stripReferencedChildData,
  type PresetChildSpec,
} from './presetStorageV2';
import type { PresetLevel, PresetVersionMetadata } from './types';
import { DEFAULT_STATE, type SliderState } from '../ui/state';

function assertChildScopes(type: PresetLevel, scope: string | undefined, expected: string[]): void {
  const actual = new Set(getPresetChildSpecs(type, scope).map(spec => `${spec.type}:${spec.scope}:${spec.slot}`));
  for (const item of expected) {
    assert.equal(actual.has(item), true, `${type}:${scope ?? ''} should include child ${item}`);
  }
}

function childRefData(specs: PresetChildSpec[], state: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const refs: Record<string, Record<string, unknown>> = {};
  for (const spec of specs) {
    const extracted = spec.extract(state as unknown as SliderState);
    if (!Object.keys(extracted).length) continue;
    refs[spec.slot] = spec.strip
      ? spec.strip(state as unknown as SliderState)
      : extracted;
  }
  return refs;
}

function childSpec(type: PresetLevel, scope: string, slot: string): PresetChildSpec {
  const spec = getPresetChildSpecs(type, scope).find(candidate => candidate.slot === slot);
  assert.ok(spec, `${type}:${scope} should include ${slot}`);
  return spec;
}

async function childHash(
  type: PresetLevel,
  scope: string,
  slot: string,
  state: SliderState,
  metadata?: PresetVersionMetadata,
): Promise<string> {
  return hashCanonicalJson(childSpec(type, scope, slot).extract(state, metadata));
}

function bumped<K extends keyof SliderState>(state: SliderState, key: K, amount: number): SliderState {
  return {
    ...state,
    [key]: Number(state[key] ?? 0) + amount,
  } as SliderState;
}

function testGraphCoversAllCompositeLevels(): void {
  assertChildScopes('state', undefined, [
    'source:synth:synth',
    'source:drums:drums',
    'source:granular:granular',
    'source:delay:delay',
    'source:reverb:reverb',
    'source:dynamics:dynamics',
    'kit:earthKit:earth',
  ]);

  assertChildScopes('source', 'synth', [
    'engine:euclideanPattern:euclideanPattern',
    'engine:leadDelay:leadDelay',
    'kit:pad1Kit:pad1Kit',
    'kit:pad2Kit:pad2Kit',
    'kit:lead1Kit:lead1Kit',
    'kit:lead2Kit:lead2Kit',
  ]);
  assertChildScopes('source', 'drums', [
    'engine:euclideanPattern:euclideanPattern',
    'kit:drumKit:drumKit',
  ]);
  assertChildScopes('source', 'granular', ['kit:granularKit:granularKit']);
  assertChildScopes('source', 'delay', ['kit:delayKit:delayKit']);
  assertChildScopes('source', 'dynamics', [
    'engine:dynamicsSidechain:sidechain',
    'engine:dynamicsCharacter:character',
    'engine:dynamicsDegrade:degrade',
    'engine:dynamicsSaturation:saturation',
    'engine:dynamicsEndChain:endChain',
  ]);

  assertChildScopes('kit', 'pad1Kit', ['engine:pad1:pad1']);
  assertChildScopes('kit', 'pad2Kit', ['engine:pad2:pad2']);
  assertChildScopes('kit', 'lead1Kit', ['engine:lead1:lead1']);
  assertChildScopes('kit', 'lead2Kit', ['engine:lead2:lead2']);
  assertChildScopes('kit', 'drumKit', [
    'engine:drumSub:drumSub',
    'engine:drumKick:drumKick',
    'engine:drumClick:drumClick',
    'engine:drumBeepHi:drumBeepHi',
    'engine:drumBeepLo:drumBeepLo',
    'engine:drumNoise:drumNoise',
    'engine:drumMembrane:drumMembrane',
  ]);
  assertChildScopes('kit', 'granularKit', [
    'engine:granularVoice1:granularVoice1',
    'engine:granularVoice2:granularVoice2',
    'engine:granularVoice3:granularVoice3',
    'engine:granularVoice4:granularVoice4',
    'engine:granularLegacy:granularLegacy',
    'engine:legacyGranular:legacyGranular',
  ]);
  assertChildScopes('kit', 'delayKit', [
    'engine:leadDelay:leadDelay',
    'engine:echoLine:echoLine',
    'engine:clockedSpace:clockedSpace',
  ]);
  assertChildScopes('kit', 'earthKit', [
    'engine:water:water',
    'engine:insects1:insects1',
    'engine:insects2:insects2',
  ]);
}

function testCascadeExtractionIsRecursive(): void {
  const synthKeys = new Set(getCascadeKeys(3, 'synth'));
  assert.equal(synthKeys.has('leadEnabled'), true, 'synth source should include direct L3 params');
  assert.equal(synthKeys.has('padPresetA'), true, 'synth source should include L2 pad kit params');
  assert.equal(synthKeys.has('padOscAWave'), true, 'synth source should include L1 pad1 params through pad1Kit');
  assert.equal(synthKeys.has('pad2Attack'), true, 'synth source should include L1 pad2 params through pad2Kit');
  assert.equal(synthKeys.has('lead1Attack'), true, 'synth source should include L1 lead1 params through lead1Kit');
  assert.equal(synthKeys.has('lead2Attack'), true, 'synth source should include L1 lead2 params through lead2Kit');

  const drumKeys = new Set(getCascadeKeys(3, 'drums'));
  assert.equal(drumKeys.has('drumEnabled'), true, 'drums source should include direct L3 params');
  assert.equal(drumKeys.has('drumKickPresetA'), true, 'drums source should include L2 drum kit params');
  assert.equal(drumKeys.has('drumKickFreq'), true, 'drums source should include L1 drum voice params through drumKit');
  assert.equal(drumKeys.has('drumEuclid1Steps'), true, 'drums source should include shared Euclidean trigger params');

  const granularKeys = new Set(getCascadeKeys(3, 'granular'));
  assert.equal(granularKeys.has('granularEnabled'), true, 'granular source should include direct L3 params');
  assert.equal(granularKeys.has('granularV1Enabled'), true, 'granular source should include L2 kit params');
  assert.equal(granularKeys.has('granularV1Mode'), true, 'granular source should include L1 voice params through granularKit');
  assert.equal(granularKeys.has('granularLegacyJitter'), true, 'granular source should include L1 legacy voice params');

  const delayKeys = new Set(getCascadeKeys(3, 'delay'));
  assert.equal(delayKeys.has('granularSpaceMode'), true, 'delay source should include direct L3 params');
  assert.equal(delayKeys.has('delayBToASend'), true, 'delay source should include L2 delay kit params');
  assert.equal(delayKeys.has('delayAEnabled'), true, 'delay source should include Delay A L1 params through delayKit');
  assert.equal(delayKeys.has('delayAPingPong'), true, 'delay source should include Echo Line L1 params through delayKit');
  assert.equal(delayKeys.has('delayBPattern'), true, 'delay source should include Clocked Space L1 params through delayKit');

  const dynamicsKeys = new Set(getCascadeKeys(3, 'dynamics'));
  assert.equal(dynamicsKeys.has('dynamicsEnabled'), true, 'dynamics source should include direct L3 page params');
  assert.equal(dynamicsKeys.has('sidechainAmount'), true, 'dynamics source should include L1 sidechain params');
  assert.equal(dynamicsKeys.has('characterEnabled'), true, 'dynamics source should include L1 character bypass params');
  assert.equal(dynamicsKeys.has('characterMode'), true, 'dynamics source should include L1 character params');
  assert.equal(dynamicsKeys.has('degradeEnabled'), true, 'dynamics source should include L1 degrade bypass params');
  assert.equal(dynamicsKeys.has('degradeMix'), true, 'dynamics source should include L1 degrade mix params');
  assert.equal(dynamicsKeys.has('degradeGeneration'), true, 'dynamics source should include L1 degrade generation params');
  assert.equal(dynamicsKeys.has('degradeAlias'), true, 'dynamics source should include L1 degrade alias params');
  assert.equal(dynamicsKeys.has('degradeWow'), true, 'dynamics source should include L1 degrade params');
  assert.equal(dynamicsKeys.has('dynamicsSaturationDrive'), true, 'dynamics source should include L1 saturation params');
  assert.equal(dynamicsKeys.has('dynamicsSaturationEnabled'), true, 'dynamics source should include L1 saturation bypass params');
  assert.equal(dynamicsKeys.has('endCompThreshold'), true, 'dynamics source should include L1 end-chain params');
  assert.equal(dynamicsKeys.has('masterSatDrive'), false, 'dynamics source should not include Delay-owned master saturation params');
}

function testOverlapIsStrippedAtEachLevel(): void {
  const synthData = extractCascade(DEFAULT_STATE, 3, 'synth');
  const synthOverride = stripReferencedChildData(
    synthData,
    childRefData(getPresetChildSpecs('source', 'synth'), synthData),
  );
  assert.equal('leadEnabled' in synthOverride, true, 'source-owned synth params should remain in L3 override');
  assert.equal('padPresetA' in synthOverride, false, 'L2 pad kit selector should move out of L3 override');
  assert.equal('synthEuclid2Steps' in synthOverride, false, 'all synth Euclidean lanes should move out of L3 override');
  assert.equal('padOscAWave' in synthOverride, false, 'L1 pad params should move out of L3 override through pad1Kit');
  assert.equal('lead1Attack' in synthOverride, false, 'L1 lead params should move out of L3 override through lead1Kit');

  const drumsData = extractCascade(DEFAULT_STATE, 3, 'drums');
  const drumsOverride = stripReferencedChildData(
    drumsData,
    childRefData(getPresetChildSpecs('source', 'drums'), drumsData),
  );
  assert.equal('drumEnabled' in drumsOverride, true, 'source-owned drum params should remain in L3 override');
  assert.equal('drumEuclid4Hits' in drumsOverride, false, 'all drum Euclidean lanes should move out of L3 override');

  const drumKitData = extractCascade(DEFAULT_STATE, 2, 'drumKit');
  const drumKitOverride = stripReferencedChildData(
    drumKitData,
    childRefData(getPresetChildSpecs('kit', 'drumKit'), drumKitData),
  );
  assert.equal('drumKickPresetA' in drumKitOverride, true, 'L2 drum morph selector should remain in drumKit override');
  assert.equal('drumKickFreq' in drumKitOverride, false, 'L1 drum voice params should move out of drumKit override');

  const delayKitData = extractCascade(DEFAULT_STATE, 2, 'delayKit');
  const delayKitOverride = stripReferencedChildData(
    delayKitData,
    childRefData(getPresetChildSpecs('kit', 'delayKit'), delayKitData),
  );
  assert.equal('delayBToASend' in delayKitOverride, true, 'L2 delay routing should remain in delayKit override');
  assert.equal('delayAEnabled' in delayKitOverride, false, 'Delay A L1 params should move out of delayKit override');
  assert.equal('delayAPingPong' in delayKitOverride, false, 'Echo Line L1 params should move out of delayKit override');

  const delayData = extractCascade(DEFAULT_STATE, 3, 'delay');
  const delayOverride = stripReferencedChildData(
    delayData,
    childRefData(getPresetChildSpecs('source', 'delay'), delayData),
  );
  assert.equal('granularSpaceMode' in delayOverride, true, 'source-owned delay params should remain in L3 override');
  assert.equal('delayBToASend' in delayOverride, false, 'L2 delay kit params should move out of delay source override');
  assert.equal('delayBPattern' in delayOverride, false, 'Clocked Space L1 params should move out of delay source override');

  const dynamicsData = extractCascade(DEFAULT_STATE, 3, 'dynamics');
  const dynamicsOverride = stripReferencedChildData(
    dynamicsData,
    childRefData(getPresetChildSpecs('source', 'dynamics'), dynamicsData),
  );
  assert.equal('dynamicsEnabled' in dynamicsOverride, true, 'source-owned dynamics params should remain in L3 override');
  assert.equal('sidechainAmount' in dynamicsOverride, false, 'Sidechain L1 params should move out of dynamics source override');
  assert.equal('characterMode' in dynamicsOverride, false, 'Character L1 params should move out of dynamics source override');
  assert.equal('degradeMix' in dynamicsOverride, false, 'Degrade L1 params should move out of dynamics source override');
  assert.equal('dynamicsSaturationDrive' in dynamicsOverride, false, 'Saturation L1 params should move out of dynamics source override');
  assert.equal('endCompThreshold' in dynamicsOverride, false, 'End-chain L1 params should move out of dynamics source override');

  const granularData = extractCascade(DEFAULT_STATE, 3, 'granular');
  const granularOverride = stripReferencedChildData(
    granularData,
    childRefData(getPresetChildSpecs('source', 'granular'), granularData),
  );
  assert.equal('granularEnabled' in granularOverride, true, 'source-owned granular params should remain in L3 override');
  assert.equal('granularV1Enabled' in granularOverride, false, 'L2 granular kit params should move out of granular source override');
  assert.equal('granularV1Mode' in granularOverride, false, 'Granular voice L1 params should move out of granular source override');
  assert.equal('granularLegacyJitter' in granularOverride, false, 'Granular legacy L1 params should move out of granular source override');

  const granularKitData = extractCascade(DEFAULT_STATE, 2, 'granularKit');
  const granularKitOverride = stripReferencedChildData(
    granularKitData,
    childRefData(getPresetChildSpecs('kit', 'granularKit'), granularKitData),
  );
  assert.equal('granularMacroActivity' in granularKitOverride, true, 'L2 granular macros should remain in granularKit override');
  assert.equal('granularV4Mode' in granularKitOverride, false, 'Granular voice 4 L1 params should move out of granularKit override');
  assert.equal('density' in granularKitOverride, false, 'Legacy Granular L1 params should move out of granularKit override');

  const earthKitData = extractCascade(DEFAULT_STATE, 2, 'earthKit');
  const earthKitOverride = stripReferencedChildData(
    earthKitData,
    childRefData(getPresetChildSpecs('kit', 'earthKit'), earthKitData),
  );
  assert.equal('waterEnabled' in earthKitOverride, true, 'L2 earth kit toggles should remain in earthKit override');
  assert.equal('waterMorph' in earthKitOverride, false, 'Water L1 params should move out of earthKit override');
  assert.equal('insectsDensity' in earthKitOverride, false, 'Insects 1 L1 params should move out of earthKit override');
  assert.equal('insects2Density' in earthKitOverride, false, 'Insects 2 L1 params should move out of earthKit override');
}

async function testEuclideanStepOverridesAffectOnlyEuclideanChildHash(): Promise<void> {
  const metadata: PresetVersionMetadata = {
    synthStepOverrides: {
      triggerToggles: [[{ step: 5, value: true }], [], [], []],
    },
    drumStepOverrides: {
      triggerToggles: [[], [{ step: 7, value: true }], [], []],
    },
  };

  const synthHash = await childHash('source', 'synth', 'euclideanPattern', DEFAULT_STATE);
  const synthHashWithOverrides = await childHash('source', 'synth', 'euclideanPattern', DEFAULT_STATE, metadata);
  const padHash = await childHash('kit', 'pad1Kit', 'pad1', DEFAULT_STATE);
  const padHashWithOverrides = await childHash('kit', 'pad1Kit', 'pad1', DEFAULT_STATE, metadata);

  assert.notEqual(
    synthHash,
    synthHashWithOverrides,
    'custom synth trigger toggles should create a distinct Euclidean child hash',
  );
  assert.equal(
    padHash,
    padHashWithOverrides,
    'sequencer metadata should not affect unrelated L1 child hashes',
  );

  const drumHash = await childHash('source', 'drums', 'euclideanPattern', DEFAULT_STATE);
  const drumHashWithOverrides = await childHash('source', 'drums', 'euclideanPattern', DEFAULT_STATE, metadata);
  assert.notEqual(
    drumHash,
    drumHashWithOverrides,
    'custom drum trigger toggles should create a distinct Euclidean child hash',
  );
}

async function testIdenticalUnsavedChildrenResolveToSameDerivedName(): Promise<void> {
  const tester = bumped(DEFAULT_STATE, 'lead1Attack', 0.07);
  const testerWithDifferentDrums = bumped(tester, 'drumKickFreq', 12);
  const testerWithDifferentLead = bumped(tester, 'lead1Attack', 0.03);

  const leadHash = await childHash('kit', 'lead1Kit', 'lead1', tester);
  const leadHashWithDifferentDrums = await childHash('kit', 'lead1Kit', 'lead1', testerWithDifferentDrums);
  const leadHashWithDifferentLead = await childHash('kit', 'lead1Kit', 'lead1', testerWithDifferentLead);

  assert.equal(
    `__derived__/lead1/${leadHash.slice(0, 12)}`,
    `__derived__/lead1/${leadHashWithDifferentDrums.slice(0, 12)}`,
    'same unsaved L1 child under different parent presets should resolve to the same hidden derived name',
  );
  assert.notEqual(
    `__derived__/lead1/${leadHash.slice(0, 12)}`,
    `__derived__/lead1/${leadHashWithDifferentLead.slice(0, 12)}`,
    'changing that L1 child should resolve to a new hidden derived name instead of overwriting the old one',
  );

  const padHash = await childHash('kit', 'pad1Kit', 'pad1', tester);
  const padHashWithDifferentLead = await childHash('kit', 'pad1Kit', 'pad1', testerWithDifferentLead);
  assert.equal(
    padHash,
    padHashWithDifferentLead,
    'unmodified sibling L1 children should keep reusing their existing payload hash',
  );
}

async function testMissingDefaultKeysDoNotCreateFalseDifferences(): Promise<void> {
  const olderState = { ...DEFAULT_STATE };
  delete (olderState as Partial<SliderState>).lead1PostLPFKeyTracking;
  delete (olderState as Partial<SliderState>).lead2PostLPFKeyTracking;

  const normalizedOlder = normalizeResolvedVersionData('state', 'global', olderState as unknown as Record<string, unknown>);
  const normalizedCurrent = normalizeResolvedVersionData('state', 'global', DEFAULT_STATE as unknown as Record<string, unknown>);

  const olderSynthHash = await childHash('state', 'global', 'synth', normalizedOlder as unknown as SliderState);
  const currentSynthHash = await childHash('state', 'global', 'synth', normalizedCurrent as unknown as SliderState);

  assert.equal(
    olderSynthHash,
    currentSynthHash,
    'missing default-valued keys from older presets should not create a different child hash',
  );
}

function testVersionStorageSignatureTreatsMetadataAndRefsAsContent(): void {
  const base = {
    resolvedHash: 'resolved-a',
    overrideHash: 'override-a',
    metadataHash: 'metadata-a',
    refKeys: [
      'delay:delay-id:5:',
      'synth:synth-id:3:',
    ],
  };

  assert.equal(
    presetVersionStorageSignaturesEqual(base, { ...base, refKeys: [...base.refKeys] }),
    true,
    'identical storage signatures should be treated as no-op versions',
  );
  assert.equal(
    presetVersionStorageSignaturesEqual(base, { ...base, metadataHash: 'metadata-b' }),
    false,
    'metadata-only changes should still create a meaningful version',
  );
  assert.equal(
    presetVersionStorageSignaturesEqual(base, { ...base, refKeys: [...base.refKeys].reverse() }),
    true,
    'ref signatures should compare as a set so query ordering cannot create false versions',
  );
  assert.equal(
    presetVersionStorageSignaturesEqual(base, { ...base, refKeys: ['delay:delay-id:6:', 'synth:synth-id:3:'] }),
    false,
    'child ref target version changes should create a meaningful version',
  );
}

function testJourneyDedupKeepsGraphAsResolvedPayload(): void {
  const journeyGraph: Record<string, unknown> = {
    formatVersion: 1,
    name: 'Dedup Journey',
    autoAdvance: true,
    loopEnabled: true,
    nodes: [
      { position: 'left', phraseLength: 2, color: '#8357ff', refSlot: 'node:left', presetName: 'State A' },
      { position: 'center', phraseLength: 0, color: '#4fc3f7' },
    ],
    connections: [
      { fromPosition: 'center', toPosition: 'left', morphDuration: 2, probability: 1 },
    ],
  };

  assert.equal(getPresetChildSpecs('journey').length, 0, 'Journey should not enter the L1-L4 child dedup graph');
  assert.deepStrictEqual(
    stripReferencedChildData(normalizeResolvedVersionData('journey', undefined, journeyGraph), {}),
    normalizeResolvedVersionData('journey', undefined, journeyGraph),
    'Journey graph data should be stored as its own resolved payload without child stripping',
  );
}

async function run(): Promise<void> {
  testGraphCoversAllCompositeLevels();
  testCascadeExtractionIsRecursive();
  testOverlapIsStrippedAtEachLevel();
  await testEuclideanStepOverridesAffectOnlyEuclideanChildHash();
  await testIdenticalUnsavedChildrenResolveToSameDerivedName();
  await testMissingDefaultKeysDoNotCreateFalseDifferences();
  testVersionStorageSignatureTreatsMetadataAndRefsAsContent();
  testJourneyDedupKeepsGraphAsResolvedPayload();
  console.log('preset dedup regression checks passed');
}

await run();
