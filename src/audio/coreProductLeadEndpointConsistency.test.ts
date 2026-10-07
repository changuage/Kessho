import assert from 'node:assert/strict';
import test from 'node:test';

import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import { coreProductParamValue } from './coreProductSnapshotState';
import { KESSHO_PRODUCT_LEAD_PARAM_SPECS } from './generated/kesshoProductSchema';
import {
  DEFAULT_GAMELAN,
  DEFAULT_SOFT_RHODES,
  morphPresets,
  type Lead4opFMPreset,
} from './lead4opfm';
import { mergeMorphEndpointStatePatch } from '../ui/useMorphEndpointStatePatch';
import { DEFAULT_STATE, type SliderState } from '../ui/state';

type LeadScope = 'lead1' | 'lead2';
type Endpoint = 'a' | 'b';
type Adsr = { attack: number; decay: number; sustain: number; release: number };
type LeadEndpointKeys = {
  sourceId: number;
  presetA: string;
  presetB: string;
  dataA: string;
  dataB: string;
  morph: string;
  useCustomAdsr: string;
  attack: string;
  decay: string;
  sustain: string;
  release: string;
  distance: string;
};
type EndpointEdit = { preset: Lead4opFMPreset | null; adsr: Adsr | null };
type RememberedScene = {
  a: { name: string; timestamp: string; state: SliderState };
  b: { name: string; timestamp: string; state: SliderState };
};

const A_ADSR: Adsr = { attack: 0.037, decay: 1.27, sustain: 0.43, release: 4.75 };
const B_ADSR: Adsr = { attack: 0.19, decay: 2.43, sustain: 0.21, release: 8.75 };

const LEAD_ENDPOINT_KEYS: Record<LeadScope, LeadEndpointKeys> = {
  lead1: {
    sourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
    presetA: 'lead1PresetA',
    presetB: 'lead1PresetB',
    dataA: 'lead1PresetAData',
    dataB: 'lead1PresetBData',
    morph: 'lead1Morph',
    useCustomAdsr: 'lead1UseCustomAdsr',
    attack: 'lead1Attack',
    decay: 'lead1Decay',
    sustain: 'lead1Sustain',
    release: 'lead1Release',
    distance: 'lead1Distance',
  },
  lead2: {
    sourceId: CORE_PRODUCT_SOURCE_IDS.lead2,
    presetA: 'lead2PresetC',
    presetB: 'lead2PresetD',
    dataA: 'lead2PresetCData',
    dataB: 'lead2PresetDData',
    morph: 'lead2Morph',
    useCustomAdsr: 'lead2UseCustomAdsr',
    attack: 'lead2Attack',
    decay: 'lead2Decay',
    sustain: 'lead2Sustain',
    release: 'lead2Release',
    distance: 'lead2Distance',
  },
};

function editedPreset(base: Lead4opFMPreset, id: string, amount: number, adsr: Adsr): Lead4opFMPreset {
  return {
    ...base,
    id,
    name: id,
    params: {
      ...base.params,
      beatDetune: base.params.beatDetune + amount,
      gain: base.params.gain + amount * 0.7,
      envelope: { ...base.params.envelope, ...adsr },
    },
  };
}

function endpointKeys(scope: LeadScope): LeadEndpointKeys {
  return LEAD_ENDPOINT_KEYS[scope];
}

function baseState(scope: LeadScope, morph: 0 | 1): SliderState {
  const keys = endpointKeys(scope);
  return {
    ...DEFAULT_STATE,
    leadEnabled: true,
    lead2Enabled: true,
    [keys.presetA]: 'soft_rhodes',
    [keys.presetB]: 'gamelan',
    [keys.dataA]: DEFAULT_SOFT_RHODES,
    [keys.dataB]: DEFAULT_GAMELAN,
    [keys.morph]: morph,
    [keys.distance]: 0,
  } as unknown as SliderState;
}

function setDynamicStateValue(state: SliderState, key: string, value: unknown): void {
  (state as unknown as Record<string, unknown>)[key] = value;
}

function applyAdsr(state: SliderState, keys: LeadEndpointKeys, adsr: Adsr): void {
  setDynamicStateValue(state, keys.useCustomAdsr, true);
  setDynamicStateValue(state, keys.attack, adsr.attack);
  setDynamicStateValue(state, keys.decay, adsr.decay);
  setDynamicStateValue(state, keys.sustain, adsr.sustain);
  setDynamicStateValue(state, keys.release, adsr.release);
}

function captureRememberedEndpoint(
  scope: LeadScope,
  endpoint: Endpoint,
  edit: EndpointEdit,
): { name: string; timestamp: string; state: SliderState } {
  const keys = endpointKeys(scope);
  const morph = endpoint === 'a' ? 0 : 1;
  const before = baseState(scope, morph);
  const after = { ...before };
  if (edit.preset) {
    setDynamicStateValue(after, endpoint === 'a' ? keys.dataA : keys.dataB, edit.preset);
  }
  if (edit.adsr) applyAdsr(after, keys, edit.adsr);

  const endpointPreset = { name: endpoint.toUpperCase(), timestamp: '', state: before };
  const captured = mergeMorphEndpointStatePatch(
    endpointPreset,
    before,
    after,
  );
  assert.ok(captured, `${scope} ${endpoint} endpoint should remain owned after capture`);
  return captured;
}

function rememberedScene(scope: LeadScope, a: EndpointEdit, b: EndpointEdit): RememberedScene {
  return {
    a: captureRememberedEndpoint(scope, 'a', a),
    b: captureRememberedEndpoint(scope, 'b', b),
  };
}

function paramsFromPreset(presetA: Lead4opFMPreset, presetB: Lead4opFMPreset, morph: 0 | 1): number[] {
  const morphed = morphPresets(presetA, presetB, morph);
  return KESSHO_PRODUCT_LEAD_PARAM_SPECS.map((spec) =>
    coreProductParamValue((morphed as unknown as Record<string, unknown>)[spec.key], spec.enumMap, spec.fallback),
  );
}

function effectiveParamsFromSnapshot(
  source: ReturnType<typeof createCoreProductSnapshot>['sources'][number],
): number[] {
  const generated = paramsFromPreset(DEFAULT_SOFT_RHODES, DEFAULT_GAMELAN, source.morph === 0 ? 0 : 1);
  if (source.leadEnvelopeOverrideEnabled) {
    generated[43] = source.attackSeconds;
    generated[44] = source.decaySeconds;
    generated[45] = source.sustain;
    generated[46] = source.releaseSeconds;
  }
  for (let index = 0; index < source.leadOverrideCount; index += 1) {
    const paramIndex = source.leadOverrideIndices[index];
    if (paramIndex !== undefined) generated[paramIndex] = source.leadOverrideValues[index] ?? 0;
  }
  return generated;
}

function dspSource(source: ReturnType<typeof createCoreProductSnapshot>['sources'][number]) {
  return {
    presetId: source.presetId,
    sourcePresetAId: source.sourcePresetAId,
    sourcePresetBId: source.sourcePresetBId,
    morph: source.morph,
    leadEnvelopeOverrideEnabled: source.leadEnvelopeOverrideEnabled,
    attackSeconds: source.attackSeconds,
    decaySeconds: source.decaySeconds,
    sustain: source.sustain,
    releaseSeconds: source.releaseSeconds,
    leadOverrideCount: source.leadOverrideCount,
    leadOverrideIndices: source.leadOverrideIndices.slice(0, source.leadOverrideCount),
    leadOverrideValues: source.leadOverrideValues.slice(0, source.leadOverrideCount),
    effectiveParams: effectiveParamsFromSnapshot(source).map((value) => Number(value.toFixed(6))),
  };
}

function assertEndpointSource(
  scope: LeadScope,
  state: SliderState,
  endpoint: Endpoint,
  expectedPresetA: Lead4opFMPreset,
  expectedPresetB: Lead4opFMPreset,
  expectedAdsr: Adsr | null,
): ReturnType<typeof dspSource> {
  const keys = endpointKeys(scope);
  const morph = endpoint === 'a' ? 0 : 1;
  const snapshot = createCoreProductSnapshot(state as unknown as Record<string, unknown>);
  const source = snapshot.sources.find((candidate) => candidate.sourceId === keys.sourceId);
  assert.ok(source, `${scope} Product source should be present`);
  assert.equal(source.sourcePresetAId, 2001, `${scope} endpoint A should retain its generated anchor`);
  assert.equal(source.sourcePresetBId, 2002, `${scope} endpoint B should retain its generated anchor`);
  assert.equal(source.presetId, endpoint === 'a' ? 2001 : 2002, `${scope} should select the exact endpoint preset`);
  assert.equal(source.morph, morph, `${scope} should retain its exact morph endpoint`);

  const expected = paramsFromPreset(expectedPresetA, expectedPresetB, morph);
  if (expectedAdsr) {
    expected[43] = expectedAdsr.attack;
    expected[44] = expectedAdsr.decay;
    expected[45] = expectedAdsr.sustain;
    expected[46] = expectedAdsr.release;
  }
  assert.deepEqual(
    effectiveParamsFromSnapshot(source).map((value) => Number(value.toFixed(6))),
    expected.map((value) => Number(value.toFixed(6))),
    `${scope} ${endpoint} Product effective Lead params should match its resolved endpoint`,
  );
  return dspSource(source);
}

function morphEndpointState(scene: RememberedScene, endpoint: Endpoint): SliderState {
  // App.lerpPresets overlays the complete remembered endpoint at 0/100. Keep
  // this explicit so the round-trip test covers the same whole-preset boundary.
  return { ...DEFAULT_STATE, ...scene[endpoint].state } as SliderState;
}

const CASES = [
  {
    name: 'untouched endpoints',
    a: { preset: null, adsr: null },
    b: { preset: null, adsr: null },
  },
  {
    name: 'A-only custom ADSR and preset body',
    a: { preset: editedPreset(DEFAULT_SOFT_RHODES, 'edited-a', 0.19, A_ADSR), adsr: A_ADSR },
    b: { preset: null, adsr: null },
  },
  {
    name: 'B-only custom ADSR and preset body',
    a: { preset: null, adsr: null },
    b: { preset: editedPreset(DEFAULT_GAMELAN, 'edited-b', -0.17, B_ADSR), adsr: B_ADSR },
  },
  {
    name: 'different custom ADSR and preset bodies on both endpoints',
    a: { preset: editedPreset(DEFAULT_SOFT_RHODES, 'edited-a', 0.19, A_ADSR), adsr: A_ADSR },
    b: { preset: editedPreset(DEFAULT_GAMELAN, 'edited-b', -0.17, B_ADSR), adsr: B_ADSR },
  },
] as const;

for (const scope of ['lead1', 'lead2'] as const) {
  for (const endpointCase of CASES) {
    test(`${scope} ${endpointCase.name} restores DSP state through both morph round trips`, () => {
      const scene = rememberedScene(scope, endpointCase.a, endpointCase.b);
      const directA = assertEndpointSource(scope, scene.a.state, 'a', endpointCase.a.preset ?? DEFAULT_SOFT_RHODES, endpointCase.b.preset ?? DEFAULT_GAMELAN, endpointCase.a.adsr);
      const directB = assertEndpointSource(scope, scene.b.state, 'b', endpointCase.a.preset ?? DEFAULT_SOFT_RHODES, endpointCase.b.preset ?? DEFAULT_GAMELAN, endpointCase.b.adsr);

      for (const endpoint of ['a', 'b'] as const) {
        assert.deepEqual(
          assertEndpointSource(scope, morphEndpointState(scene, endpoint), endpoint, endpointCase.a.preset ?? DEFAULT_SOFT_RHODES, endpointCase.b.preset ?? DEFAULT_GAMELAN, endpoint === 'a' ? endpointCase.a.adsr : endpointCase.b.adsr),
          endpoint === 'a' ? directA : directB,
          `${scope} direct ${endpoint} and morph ${endpoint} Product DSP state should match`,
        );
      }

      const run = (sequence: readonly Endpoint[]): ReturnType<typeof dspSource> => {
        let final: ReturnType<typeof dspSource> | null = null;
        for (const endpoint of sequence) {
          final = assertEndpointSource(
            scope,
            morphEndpointState(scene, endpoint),
            endpoint,
            endpointCase.a.preset ?? DEFAULT_SOFT_RHODES,
            endpointCase.b.preset ?? DEFAULT_GAMELAN,
            endpoint === 'a' ? endpointCase.a.adsr : endpointCase.b.adsr,
          );
        }
        assert.ok(final);
        return final;
      };

      assert.deepEqual(run(['a', 'b', 'a']), directA, `${scope} A→B→A should restore endpoint A`);
      assert.deepEqual(run(['b', 'a', 'b']), directB, `${scope} B→A→B should restore endpoint B`);
    });
  }
}
