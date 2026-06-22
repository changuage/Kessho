import assert from 'node:assert/strict';
import {
  getPresetChildSpecs,
  hashCanonicalJson,
  type PresetChildSpec,
} from './presetStorageV2';
import type { PresetVersionMetadata } from './types';
import { DEFAULT_STATE, type SliderState } from '../ui/state';

function childSpec(type: 'source' | 'kit', scope: string, slot: string): PresetChildSpec {
  const spec = getPresetChildSpecs(type, scope).find(candidate => candidate.slot === slot);
  assert.ok(spec, `${type}:${scope} should include ${slot}`);
  return spec;
}

async function childHash(
  type: 'source' | 'kit',
  scope: string,
  slot: string,
  state: SliderState,
  metadata?: PresetVersionMetadata,
): Promise<string> {
  return hashCanonicalJson(childSpec(type, scope, slot).extract(state, metadata));
}

function cloneMetadata(metadata: PresetVersionMetadata): PresetVersionMetadata {
  return JSON.parse(JSON.stringify(metadata)) as PresetVersionMetadata;
}

function makeState(): SliderState {
  return {
    ...DEFAULT_STATE,
    drumEuclid5Enabled: true,
    drumEuclid5Steps: 17,
    drumEuclid5Hits: 5,
    drumEuclid5Rotation: 3,
    drumEuclid5TargetBeepLo: true,
    drumEuclid6Enabled: true,
    drumEuclid6Steps: 19,
    drumEuclid6Hits: 7,
    drumEuclid6Rotation: 4,
    drumEuclid6TargetMembrane: true,
  };
}

function makeMaximalSixLaneMetadata(): PresetVersionMetadata {
  return {
    drumClockDivs: ['1/8', '1/16', '1/8T', '1/4', '1/16', '1/8'],
    drumSwings: [0, 0.05, 0.1, 0.15, 0.2, 0.25],
    drumLinked: [false, true, false, true, false, true],
    drumEvolveConfigs: [
      { enabled: true, everyBars: 2, evolution: 0.11, writeOffset: 0, mutationMode: 'strict', methods: { triggerToggle: true } },
      { enabled: true, everyBars: 3, evolution: 0.22, writeOffset: 1, mutationMode: 'biased', methods: { rotation: true } },
      { enabled: true, everyBars: 4, evolution: 0.33, writeOffset: 2, mutationMode: 'strict', methods: { hits: true } },
      { enabled: true, everyBars: 5, evolution: 0.44, writeOffset: 3, mutationMode: 'biased', methods: { steps: true } },
      { enabled: true, everyBars: 6, evolution: 0.55, writeOffset: 4, mutationMode: 'strict', methods: { triggerToggle: true, pitchWalk: true } },
      { enabled: true, everyBars: 7, evolution: 0.66, writeOffset: 5, mutationMode: 'biased', methods: { rotation: true, velocity: true } },
    ],
    drumStepOverrides: {
      triggerToggles: [[], [], [], [], [{ step: 5, value: true }], [{ step: 6, value: false }]],
      pitch: [null, null, null, null, [1, 2, 3], [4, 5, 6]],
      expression: [null, null, null, null, [0.2, 0.4], [0.6, 0.8]],
      morph: [null, null, null, null, [0.1], [0.9]],
      distance: [null, null, null, null, [0.3], [0.7]],
      nudge: [null, null, null, null, [0.01], [-0.01]],
    },
    drumSubLaneStates: [
      {},
      {},
      {},
      {},
      { pitch: { enabled: true, steps: 5, direction: 'reverse' } },
      { expression: { enabled: true, steps: 6, direction: 'pingpong', valueMode: 'range', rangeMin: 0.2, rangeMax: 0.9 } },
    ],
    drumPitchSettings: [
      { mode: 'semitones', root: 40, scale: 'Major' },
      { mode: 'semitones', root: 41, scale: 'Major' },
      { mode: 'semitones', root: 42, scale: 'Major' },
      { mode: 'semitones', root: 43, scale: 'Major' },
      { mode: 'notes', root: 44, scale: 'Minor' },
      { mode: 'semitones', root: 45, scale: 'Dorian' },
    ],
  };
}

async function assertEuclideanMutationOnly(
  label: string,
  baseState: SliderState,
  mutatedState: SliderState,
  baseMetadata: PresetVersionMetadata,
  mutatedMetadata: PresetVersionMetadata,
): Promise<void> {
  const baseEuclidean = await childHash('source', 'drums', 'euclideanPattern', baseState, baseMetadata);
  const mutatedEuclidean = await childHash('source', 'drums', 'euclideanPattern', mutatedState, mutatedMetadata);
  const baseKit = await childHash('kit', 'drumKit', 'drumKick', baseState, baseMetadata);
  const mutatedKit = await childHash('kit', 'drumKit', 'drumKick', mutatedState, mutatedMetadata);
  assert.notEqual(baseEuclidean, mutatedEuclidean, `${label} should change the drum Euclidean child hash`);
  assert.equal(baseKit, mutatedKit, `${label} should not change unrelated drum kit child hash`);
}

const baseState = makeState();
const baseMetadata = makeMaximalSixLaneMetadata();

await assertEuclideanMutationOnly(
  'lane5EnabledChangesEuclideanHash',
  baseState,
  { ...baseState, drumEuclid5Enabled: false },
  baseMetadata,
  baseMetadata,
);

{
  const mutated = cloneMetadata(baseMetadata);
  mutated.drumClockDivs![5] = '1/32';
  await assertEuclideanMutationOnly('lane6ClockDivisionChangesEuclideanHash', baseState, baseState, baseMetadata, mutated);
}

{
  const mutated = cloneMetadata(baseMetadata);
  mutated.drumSubLaneStates![4] = { pitch: { enabled: true, steps: 9, direction: 'forward' } };
  await assertEuclideanMutationOnly('lane5SubLaneStateChangesEuclideanHash', baseState, baseState, baseMetadata, mutated);
}

{
  const mutated = cloneMetadata(baseMetadata);
  mutated.drumPitchSettings![5] = { mode: 'notes', root: 63, scale: 'Phrygian' };
  await assertEuclideanMutationOnly('lane6PitchSettingChangesEuclideanHash', baseState, baseState, baseMetadata, mutated);
}

{
  const mutated = cloneMetadata(baseMetadata);
  mutated.drumStepOverrides!.pitch![4] = [7, 8, 9];
  await assertEuclideanMutationOnly('lane5StepOverrideChangesEuclideanHash', baseState, baseState, baseMetadata, mutated);
}

await assertEuclideanMutationOnly(
  'lane6TargetVoiceFlagsChangeEuclideanHash',
  baseState,
  { ...baseState, drumEuclid6TargetMembrane: false, drumEuclid6TargetNoise: true },
  baseMetadata,
  baseMetadata,
);

await assertEuclideanMutationOnly(
  'drumSequencerChainChangesEuclideanHash',
  baseState,
  {
    ...baseState,
    drumSequencerChain: {
      version: 1,
      enabled: true,
      entries: [
        { laneIndex: 4, repeats: 2 },
        { laneIndex: 5, repeats: 1 },
      ],
    },
  },
  baseMetadata,
  baseMetadata,
);

assert.equal(
  await hashCanonicalJson({ z: 1, a: { b: 2, a: 1 } }),
  await hashCanonicalJson({ a: { a: 1, b: 2 }, z: 1 }),
  'canonical key order should not change hash',
);

assert.equal(
  await childHash('source', 'drums', 'euclideanPattern', baseState, { drumClockDivs: [] }),
  await childHash('source', 'drums', 'euclideanPattern', baseState, undefined),
  'missing default-equivalent empty sequencer metadata should not change hash',
);

assert.equal(
  await childHash('source', 'drums', 'euclideanPattern', baseState, baseMetadata),
  await childHash('source', 'drums', 'euclideanPattern', JSON.parse(JSON.stringify(baseState)) as SliderState, cloneMetadata(baseMetadata)),
  'exact save/load/save equivalent data should preserve the Euclidean hash',
);

console.log('preset sequencer hash coverage regression passed');
