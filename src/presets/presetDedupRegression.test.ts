import assert from 'node:assert/strict';

import { extractCascade, extractParams, getCascadeKeys, validateRegistry } from './codec';
import {
  buildDrumEuclideanStateFromPatternData,
  buildSynthEuclideanStateFromPatternData,
  extractEuclideanPatternDataFromDrumState,
  extractEuclideanPatternDataFromSynthState,
} from './euclideanPatternBank';
import {
  getPresetChildSpecs,
  hashCanonicalJson,
  normalizeResolvedVersionData,
  presetVersionStorageSignaturesEqual,
  stripReferencedChildData,
  type PresetChildSpec,
} from './presetStorageV2';
import {
  buildPresetKeyCandidates,
  isPresetCompatibleWithSlot,
} from './presetUtils';
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

function withSynthFaceMode(state: SliderState, slotIndex: number, mode: 'euclid' | 'anchorWalker' | 'orbit'): SliderState {
  return {
    ...state,
    synthSequencerFaces: {
      ...state.synthSequencerFaces,
      slots: state.synthSequencerFaces.slots.map((slot, index) => (
        index === slotIndex ? { ...slot, mode } : slot
      )),
    },
  };
}

function withSynthChain(state: SliderState): SliderState {
  return {
    ...state,
    synthSequencerChain: {
      version: 1,
      enabled: true,
      entries: [
        { laneIndex: 1, repeats: 2 },
        { laneIndex: 3, repeats: 1 },
      ],
    },
  };
}

function withDrumChain(state: SliderState): SliderState {
  return {
    ...state,
    drumSequencerChain: {
      version: 1,
      enabled: true,
      entries: [
        { laneIndex: 4, repeats: 3 },
        { laneIndex: 5, repeats: 1 },
      ],
    },
  };
}

function testRegistryCoversPresetOwnedState(): void {
  const currentStateKeys = Object.keys(DEFAULT_STATE).filter((key) => (
    !key.startsWith('chordProgression') &&
    !key.startsWith('harmonyChordSequence') &&
    key !== 'harmonyGenerationSeed'
  ));
  const result = validateRegistry(currentStateKeys);
  assert.deepStrictEqual(result.missing, [], 'registry keys should exist on DEFAULT_STATE');
  assert.deepStrictEqual(result.unassigned, [], 'preset-owned DEFAULT_STATE keys should be assigned to the hierarchy');
}

function testGraphCoversAllCompositeLevels(): void {
  assertChildScopes('state', undefined, [
    'source:synth:synth',
    'source:drums:drums',
    'source:granular:granular',
    'source:delay:delay',
    'source:reverb:reverb',
    'source:degrade:degrade',
    'source:dynamicsBus:dynamicsBus',
    'source:masterFx:masterFx',
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
  assertChildScopes('source', 'dynamicsBus', [
    'engine:dynamicsEq1:eq1',
    'engine:dynamicsEq2:eq2',
    'engine:dynamicsSidechain:sidechain',
  ]);
  assertChildScopes('source', 'degrade', [
    'kit:degradeDrift:drift',
    'kit:degradeErosion:erosion',
  ]);
  assertChildScopes('source', 'masterFx', [
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

function testLegacyDegradeChildScopesAliasToCanonical(): void {
  const canonicalDrift = extractParams(DEFAULT_STATE, 2, 'degradeDrift');
  const legacyDrift = extractParams(DEFAULT_STATE, 2, 'dynamicsDrift');
  assert.ok(Object.keys(canonicalDrift).length > 0, 'canonical Drift scope should own L2 params');
  assert.deepStrictEqual(legacyDrift, canonicalDrift, 'legacy Drift scope should read canonical Drift params');

  const canonicalErosion = extractParams(DEFAULT_STATE, 2, 'degradeErosion');
  const legacyErosion = extractParams(DEFAULT_STATE, 2, 'dynamicsErosion');
  assert.ok(Object.keys(canonicalErosion).length > 0, 'canonical Erosion scope should own L2 params');
  assert.deepStrictEqual(legacyErosion, canonicalErosion, 'legacy Erosion scope should read canonical Erosion params');

  assert.equal(
    isPresetCompatibleWithSlot({ type: 'kit', scope: 'dynamicsDrift' }, 'kit', 'degradeDrift'),
    true,
    'legacy Drift presets should remain compatible with canonical Drift slots',
  );
  assert.equal(
    isPresetCompatibleWithSlot({ type: 'kit', scope: 'dynamicsErosion' }, 'kit', 'degradeErosion'),
    true,
    'legacy Erosion presets should remain compatible with canonical Erosion slots',
  );

  const driftCandidates = buildPresetKeyCandidates('kit', 'Clean Tape Head', 'degradeDrift');
  assert.equal(
    driftCandidates.includes('preset:kit:dynamicsDrift:Clean Tape Head'),
    true,
    'canonical Drift key lookup should include legacy localStorage keys',
  );
}

function testCascadeExtractionIsRecursive(): void {
  const synthKeys = new Set(getCascadeKeys(3, 'synth'));
  assert.equal(synthKeys.has('leadEnabled'), true, 'synth source should include direct L3 params');
  assert.equal(synthKeys.has('padPresetA'), true, 'synth source should include L2 pad kit params');
  assert.equal(synthKeys.has('padOscAWave'), true, 'synth source should include L1 pad1 params through pad1Kit');
  assert.equal(synthKeys.has('pad2Attack'), true, 'synth source should include L1 pad2 params through pad2Kit');
  assert.equal(synthKeys.has('lead1Attack'), true, 'synth source should include L1 lead1 params through lead1Kit');
  assert.equal(synthKeys.has('lead2Attack'), true, 'synth source should include L1 lead2 params through lead2Kit');
  assert.equal(synthKeys.has('synthSequencerFaces'), true, 'synth source should include sequencer face state through its Euclidean child');
  assert.equal(synthKeys.has('synthSequencerChain'), true, 'synth source should include sequencer chain state through its Euclidean child');

  const drumKeys = new Set(getCascadeKeys(3, 'drums'));
  assert.equal(drumKeys.has('drumEnabled'), true, 'drums source should include direct L3 params');
  assert.equal(drumKeys.has('drumKickPresetA'), true, 'drums source should include L2 drum kit params');
  assert.equal(drumKeys.has('drumKickFreq'), true, 'drums source should include L1 drum voice params through drumKit');
  assert.equal(drumKeys.has('drumEuclid1Steps'), true, 'drums source should include shared Euclidean trigger params');
  assert.equal(drumKeys.has('drumSequencerChain'), true, 'drums source should include sequencer chain state through its Euclidean child');

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

  const degradeKeys = new Set(getCascadeKeys(3, 'degrade'));
  assert.equal(degradeKeys.has('degradeEnabled'), true, 'degrade source should include direct L3 Degrade params');
  assert.equal(degradeKeys.has('degradeHp'), true, 'degrade source should include shared Degrade filter params');
  assert.equal(degradeKeys.has('driftEnabled'), true, 'degrade source should own Drift enable');
  assert.equal(degradeKeys.has('driftMode'), true, 'degrade source should include L2 drift params');
  assert.equal(degradeKeys.has('erosionEnabled'), true, 'degrade source should own Erosion enable');
  assert.equal(degradeKeys.has('erosionMix'), true, 'degrade source should include L2 erosion mix params');
  assert.equal(degradeKeys.has('erosionGeneration'), true, 'degrade source should include L2 erosion generation params');
  assert.equal(degradeKeys.has('erosionAlias'), true, 'degrade source should include L2 erosion alias params');
  assert.equal(degradeKeys.has('erosionWow'), true, 'degrade source should include L2 erosion params');
  assert.equal(degradeKeys.has('sidechainAmount'), false, 'degrade source should not include sidechain params');
  assert.equal(degradeKeys.has('endCompThreshold'), false, 'degrade source should not include end-chain params');

  const dynamicsBusKeys = new Set(getCascadeKeys(3, 'dynamicsBus'));
  assert.equal(dynamicsBusKeys.has('dynamicsBusEnabled'), true, 'dynamics bus source should include its L3 enable');
  assert.equal(dynamicsBusKeys.has('dynamicsEq1Enabled'), true, 'dynamics bus source should own EQ 1 enable');
  assert.equal(dynamicsBusKeys.has('dynamicsEq2Enabled'), true, 'dynamics bus source should own EQ 2 enable');
  assert.equal(dynamicsBusKeys.has('sidechainEnabled'), true, 'dynamics bus source should own sidechain enable');
  assert.equal(dynamicsBusKeys.has('dynamicsEq1LowFreq'), true, 'dynamics bus source should include EQ 1 child params');
  assert.equal(dynamicsBusKeys.has('dynamicsEq2HighQ'), true, 'dynamics bus source should include EQ 2 child params');
  assert.equal(dynamicsBusKeys.has('sidechainAmount'), true, 'dynamics bus source should include sidechain compression child params');
  assert.equal(dynamicsBusKeys.has('driftMix'), false, 'dynamics bus source should not include Degrade params');
  assert.equal(dynamicsBusKeys.has('endCompThreshold'), false, 'dynamics bus source should not include end-chain params');

  const masterFxKeys = new Set(getCascadeKeys(3, 'masterFx'));
  assert.equal(masterFxKeys.has('dynamicsSaturationEnabled'), true, 'master FX source should own Saturation enable');
  assert.equal(masterFxKeys.has('endCompEnabled'), true, 'master FX source should own End Chain enable');
  assert.equal(masterFxKeys.has('dynamicsSaturationDrive'), true, 'master FX source should include Saturation child params');
  assert.equal(masterFxKeys.has('endCompThreshold'), true, 'master FX source should include End Chain child params');
  assert.equal(masterFxKeys.has('dynamicsEq1LowFreq'), false, 'master FX source should not include Dynamics Bus params');
  assert.equal(masterFxKeys.has('driftMix'), false, 'master FX source should not include Degrade params');
}

function testOverlapIsStrippedAtEachLevel(): void {
  const stateData = extractCascade(DEFAULT_STATE, 4);
  const stateOverride = stripReferencedChildData(
    stateData,
    childRefData(getPresetChildSpecs('state', undefined), stateData),
  );
  assert.equal('dynamicsEnabled' in stateOverride, true, 'global Dynamics enable should remain in the L4 state override');
  assert.equal('harmonyChordSlots' in stateOverride, true, 'global structured harmony slots should remain in the L4 state override');
  assert.equal('chordProgressionHits' in stateOverride, false, 'legacy chord progression controls should not remain in the L4 state override');
  assert.equal('synthSequencerFaces' in stateOverride, true, 'synth sequencer faces are L4 arrangement state');
  assert.equal('synthSequencerChain' in stateOverride, true, 'synth sequencer chain is L4 arrangement state');
  assert.equal('drumSequencerChain' in stateOverride, true, 'drum sequencer chain is L4 arrangement state');

  const synthData = extractCascade(DEFAULT_STATE, 3, 'synth');
  const synthOverride = stripReferencedChildData(
    synthData,
    childRefData(getPresetChildSpecs('source', 'synth'), synthData),
  );
  assert.equal('leadEnabled' in synthOverride, true, 'source-owned synth params should remain in L3 override');
  assert.equal('padPresetA' in synthOverride, false, 'L2 pad kit selector should move out of L3 override');
  assert.equal('synthEuclid2Steps' in synthOverride, false, 'all synth Euclidean lanes should move out of L3 override');
  assert.equal('synthSequencerFaces' in synthOverride, false, 'synth sequencer face state should move out of L3 override');
  assert.equal('synthSequencerChain' in synthOverride, false, 'synth sequencer chain state should move out of L3 override');
  assert.equal('padOscAWave' in synthOverride, false, 'L1 pad params should move out of L3 override through pad1Kit');
  assert.equal('lead1Attack' in synthOverride, false, 'L1 lead params should move out of L3 override through lead1Kit');

  const drumsData = extractCascade(DEFAULT_STATE, 3, 'drums');
  const drumsOverride = stripReferencedChildData(
    drumsData,
    childRefData(getPresetChildSpecs('source', 'drums'), drumsData),
  );
  assert.equal('drumEnabled' in drumsOverride, true, 'source-owned drum params should remain in L3 override');
  assert.equal('drumEuclid4Hits' in drumsOverride, false, 'all drum Euclidean lanes should move out of L3 override');
  assert.equal('drumSequencerChain' in drumsOverride, false, 'drum sequencer chain state should move out of L3 override');

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

  const degradeData = extractCascade(DEFAULT_STATE, 3, 'degrade');
  const degradeOverride = stripReferencedChildData(
    degradeData,
    childRefData(getPresetChildSpecs('source', 'degrade'), degradeData),
  );
  assert.equal('degradeEnabled' in degradeOverride, true, 'source-owned Degrade params should remain in L3 override');
  assert.equal('degradeHp' in degradeOverride, true, 'shared Degrade filter params should remain in L3 override');
  assert.equal('driftEnabled' in degradeOverride, true, 'Drift enable should remain in Degrade L3 override');
  assert.equal('erosionEnabled' in degradeOverride, true, 'Erosion enable should remain in Degrade L3 override');
  assert.equal('driftMode' in degradeOverride, false, 'Drift L2 params should move out of Degrade source override');
  assert.equal('erosionMix' in degradeOverride, false, 'Erosion L2 params should move out of Degrade source override');
  assert.equal('sidechainAmount' in degradeOverride, false, 'Sidechain params should not live in Degrade source override');
  assert.equal('endCompThreshold' in degradeOverride, false, 'End-chain params should not live in Degrade source override');

  const dynamicsBusData = extractCascade(DEFAULT_STATE, 3, 'dynamicsBus');
  const dynamicsBusOverride = stripReferencedChildData(
    dynamicsBusData,
    childRefData(getPresetChildSpecs('source', 'dynamicsBus'), dynamicsBusData),
  );
  assert.equal('dynamicsBusEnabled' in dynamicsBusOverride, true, 'source-owned Dynamics Bus params should remain in bus override');
  assert.equal('dynamicsEq1Enabled' in dynamicsBusOverride, true, 'EQ 1 enable should remain in Dynamics Bus L3 override');
  assert.equal('dynamicsEq2Enabled' in dynamicsBusOverride, true, 'EQ 2 enable should remain in Dynamics Bus L3 override');
  assert.equal('sidechainEnabled' in dynamicsBusOverride, true, 'Sidechain enable should remain in Dynamics Bus L3 override');
  assert.equal('dynamicsEq1LowFreq' in dynamicsBusOverride, false, 'EQ 1 L1 params should move out of Dynamics Bus source override');
  assert.equal('dynamicsEq2HighQ' in dynamicsBusOverride, false, 'EQ 2 L1 params should move out of Dynamics Bus source override');
  assert.equal('sidechainAmount' in dynamicsBusOverride, false, 'Sidechain L1 params should move out of Dynamics Bus source override');
  assert.equal('driftMix' in dynamicsBusOverride, false, 'Degrade params should not live in Dynamics Bus source override');

  const masterFxData = extractCascade(DEFAULT_STATE, 3, 'masterFx');
  const masterFxOverride = stripReferencedChildData(
    masterFxData,
    childRefData(getPresetChildSpecs('source', 'masterFx'), masterFxData),
  );
  assert.equal('dynamicsSaturationEnabled' in masterFxOverride, true, 'Saturation enable should remain in Master FX L3 override');
  assert.equal('endCompEnabled' in masterFxOverride, true, 'End Chain enable should remain in Master FX L3 override');
  assert.equal('dynamicsSaturationDrive' in masterFxOverride, false, 'Saturation L1 params should move out of Master FX source override');
  assert.equal('endCompThreshold' in masterFxOverride, false, 'End Chain L1 params should move out of Master FX source override');
  assert.equal('dynamicsEq1LowFreq' in masterFxOverride, false, 'Dynamics Bus params should not live in Master FX source override');

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
    synthClockDivs: ['1/8', '1/16', '1/4', '1/32'],
    synthSwings: [0, 0.1, 0.2, 0.3],
    synthLinked: [false, true, false, false],
    synthEvolveConfigs: [{
      enabled: true,
      everyBars: 8,
      evolution: 0.65,
      writeOffset: 'auto',
      mutationMode: 'strict',
      methods: { pitchWalk: true },
      enabledSubLanes: ['pitch'],
    }],
    synthSubLaneStates: [{
      pitch: { enabled: true, steps: 7, direction: 'reverse' },
    }],
    synthPitchSettings: [{ mode: 'notes', root: 62, scale: 'Dorian' }],
    synthPitchBindingModes: ['sequence', 'polyrhythmic', 'linked', 'polyrhythmic'],
    drumStepOverrides: {
      triggerToggles: [[], [{ step: 7, value: true }], [], []],
    },
    drumClockDivs: ['1/16', '1/8', '1/4', '1/32'],
    drumSwings: [0, 0.2, 0, 0],
    drumLinked: [false, false, true, false],
    drumEvolveConfigs: [{
      enabled: true,
      everyBars: 4,
      evolution: 0.5,
      writeOffset: 2,
      mutationMode: 'biased',
      methods: { triggerToggle: true },
    }],
    drumSubLaneStates: [{
      expression: { enabled: true, steps: 5, direction: 'pingpong', valueMode: 'range', rangeMin: 0.2, rangeMax: 0.8 },
    }],
    drumPitchSettings: [{ mode: 'notes', root: 43, scale: 'Minor' }],
  };
  const synthClockOnly: PresetVersionMetadata = {
    synthClockDivs: ['1/4', '1/16', '1/16', '1/16'],
  };
  const drumSubLaneOnly: PresetVersionMetadata = {
    drumSubLaneStates: [{
      expression: { enabled: true, steps: 11, direction: 'reverse' },
    }],
  };
  const drumPitchOnly: PresetVersionMetadata = {
    drumPitchSettings: [{ mode: 'notes', root: 47, scale: 'Dorian' }],
  };

  const synthHash = await childHash('source', 'synth', 'euclideanPattern', DEFAULT_STATE);
  const synthHashWithOverrides = await childHash('source', 'synth', 'euclideanPattern', DEFAULT_STATE, metadata);
  const synthHashWithClock = await childHash('source', 'synth', 'euclideanPattern', DEFAULT_STATE, synthClockOnly);
  const padHash = await childHash('kit', 'pad1Kit', 'pad1', DEFAULT_STATE);
  const padHashWithOverrides = await childHash('kit', 'pad1Kit', 'pad1', DEFAULT_STATE, metadata);

  assert.notEqual(
    synthHash,
    synthHashWithOverrides,
    'custom synth sequencer metadata should create a distinct Euclidean child hash',
  );
  assert.notEqual(
    synthHash,
    synthHashWithClock,
    'custom synth clock divisions should create a distinct Euclidean child hash',
  );

  const synthFacesState = withSynthFaceMode(DEFAULT_STATE, 1, 'orbit');
  const synthChainState = withSynthChain(DEFAULT_STATE);
  assert.notEqual(
    synthHash,
    await childHash('source', 'synth', 'euclideanPattern', synthFacesState),
    'custom synth sequencer face state should create a distinct Euclidean child hash',
  );
  assert.notEqual(
    synthHash,
    await childHash('source', 'synth', 'euclideanPattern', synthChainState),
    'custom synth sequencer chain state should create a distinct Euclidean child hash',
  );
  assert.equal(
    padHash,
    padHashWithOverrides,
    'sequencer metadata should not affect unrelated L1 child hashes',
  );
  assert.equal(
    padHash,
    await childHash('kit', 'pad1Kit', 'pad1', synthChainState),
    'synth sequencer chain state should not affect unrelated pad child hashes',
  );

  const drumHash = await childHash('source', 'drums', 'euclideanPattern', DEFAULT_STATE);
  const drumHashWithOverrides = await childHash('source', 'drums', 'euclideanPattern', DEFAULT_STATE, metadata);
  const drumHashWithSubLane = await childHash('source', 'drums', 'euclideanPattern', DEFAULT_STATE, drumSubLaneOnly);
  const drumHashWithPitchSettings = await childHash('source', 'drums', 'euclideanPattern', DEFAULT_STATE, drumPitchOnly);
  assert.notEqual(
    drumHash,
    drumHashWithOverrides,
    'custom drum sequencer metadata should create a distinct Euclidean child hash',
  );
  assert.notEqual(
    drumHash,
    drumHashWithSubLane,
    'custom drum sub-lane states should create a distinct Euclidean child hash',
  );
  assert.notEqual(
    drumHash,
    drumHashWithPitchSettings,
    'custom drum pitch settings should create a distinct Euclidean child hash',
  );

  const drumChainState = withDrumChain(DEFAULT_STATE);
  assert.notEqual(
    drumHash,
    await childHash('source', 'drums', 'euclideanPattern', drumChainState),
    'custom drum sequencer chain state should create a distinct Euclidean child hash',
  );
  assert.equal(
    await childHash('kit', 'drumKit', 'drumKick', DEFAULT_STATE),
    await childHash('kit', 'drumKit', 'drumKick', drumChainState),
    'drum sequencer chain state should not affect unrelated drum kit child hashes',
  );
}

function testEuclideanSpecificDataPreservesStructuredSequencerState(): void {
  const synthState = withSynthChain(withSynthFaceMode(DEFAULT_STATE, 2, 'anchorWalker'));
  const synthData = extractEuclideanPatternDataFromSynthState(synthState);
  assert.deepStrictEqual(
    synthData.synthSequencerFaces,
    synthState.synthSequencerFaces,
    'synth Euclidean extraction should include structured face state',
  );
  assert.deepStrictEqual(
    synthData.synthSequencerChain,
    synthState.synthSequencerChain,
    'synth Euclidean extraction should include structured chain state',
  );
  assert.deepStrictEqual(
    buildSynthEuclideanStateFromPatternData(synthData).synthSequencerFaces,
    synthState.synthSequencerFaces,
    'synth Euclidean child rehydration should preserve structured face state',
  );
  assert.deepStrictEqual(
    buildSynthEuclideanStateFromPatternData(synthData).synthSequencerChain,
    synthState.synthSequencerChain,
    'synth Euclidean child rehydration should preserve structured chain state',
  );
  const drumState = withDrumChain(DEFAULT_STATE);
  const drumData = extractEuclideanPatternDataFromDrumState(drumState);
  assert.deepStrictEqual(
    drumData.drumSequencerChain,
    drumState.drumSequencerChain,
    'drum Euclidean extraction should include structured chain state',
  );
  assert.deepStrictEqual(
    buildDrumEuclideanStateFromPatternData(drumData).drumSequencerChain,
    drumState.drumSequencerChain,
    'drum Euclidean child rehydration should preserve structured chain state',
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
  testRegistryCoversPresetOwnedState();
  testGraphCoversAllCompositeLevels();
  testLegacyDegradeChildScopesAliasToCanonical();
  testCascadeExtractionIsRecursive();
  testOverlapIsStrippedAtEachLevel();
  await testEuclideanStepOverridesAffectOnlyEuclideanChildHash();
  testEuclideanSpecificDataPreservesStructuredSequencerState();
  await testIdenticalUnsavedChildrenResolveToSameDerivedName();
  await testMissingDefaultKeysDoNotCreateFalseDifferences();
  testVersionStorageSignatureTreatsMetadataAndRefsAsContent();
  testJourneyDedupKeepsGraphAsResolvedPayload();
  console.log('preset dedup regression checks passed');
}

await run();
