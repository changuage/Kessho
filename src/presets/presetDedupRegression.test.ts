import assert from 'node:assert/strict';

import { extractCascade, getCascadeKeys } from './codec';
import {
  getPresetChildSpecs,
  hashCanonicalJson,
  normalizeResolvedVersionData,
  stripReferencedChildData,
  type PresetChildSpec,
} from './presetStorageV2';
import type { PresetLevel } from './types';
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

async function childHash(type: PresetLevel, scope: string, slot: string, state: SliderState): Promise<string> {
  return hashCanonicalJson(childSpec(type, scope, slot).extract(state));
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
}

function testOverlapIsStrippedAtEachLevel(): void {
  const synthData = extractCascade(DEFAULT_STATE, 3, 'synth');
  const synthOverride = stripReferencedChildData(
    synthData,
    childRefData(getPresetChildSpecs('source', 'synth'), synthData),
  );
  assert.equal('leadEnabled' in synthOverride, true, 'source-owned synth params should remain in L3 override');
  assert.equal('padPresetA' in synthOverride, false, 'L2 pad kit selector should move out of L3 override');
  assert.equal('padOscAWave' in synthOverride, false, 'L1 pad params should move out of L3 override through pad1Kit');
  assert.equal('lead1Attack' in synthOverride, false, 'L1 lead params should move out of L3 override through lead1Kit');

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

async function run(): Promise<void> {
  testGraphCoversAllCompositeLevels();
  testCascadeExtractionIsRecursive();
  testOverlapIsStrippedAtEachLevel();
  await testIdenticalUnsavedChildrenResolveToSameDerivedName();
  await testMissingDefaultKeysDoNotCreateFalseDifferences();
  console.log('preset dedup regression checks passed');
}

await run();
