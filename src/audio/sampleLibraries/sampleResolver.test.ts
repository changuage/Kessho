import assert from 'node:assert/strict';

import { getCoreProductPianoAssetIdForMidiVariant } from '../coreProductAssets';
import { choosePianoSampleVariant } from '../pianoSamples';
import type {
  NormalizedSampleDescriptor,
  NormalizedSampleLibraryManifest,
  SampleDynamicKey,
  SampleSlotState,
} from './SampleLibraryTypes';
import { getSampleLibraryRegistry } from './sampleLibraryRegistry';
import { resolveSample } from './sampleResolver';
import { getDefaultSampleSlotState } from './sampleSlotState';
import { SAMPLE_DYNAMIC_MODE_IDS, sampleSlotSnapshotFields } from './sampleSlotProductSnapshot';

function sample(
  sampleId: string,
  assetId: number,
  rootMidi: number,
  loMidi: number,
  hiMidi: number,
  dynamic: SampleDynamicKey = 'single',
  velocityMin = 0,
  velocityMax = 127,
): NormalizedSampleDescriptor {
  return {
    sampleId,
    assetId,
    assetPath: `Test/${sampleId}.ogg`,
    rootMidi,
    loMidi,
    hiMidi,
    role: 'test',
    articulation: '',
    dynamic,
    velocityMin,
    velocityMax,
    loop: null,
  };
}

function testLibrary(samples: readonly NormalizedSampleDescriptor[]): NormalizedSampleLibraryManifest {
  return {
    schema: 'kessho-normalized-sample-library-v1',
    libraryKey: 'archive-found-strings-001',
    displayName: 'Resolver Test',
    assetBasePath: 'samples',
    sourceSampleRate: 48000,
    encodedSampleRate: 24000,
    defaultRole: 'test',
    defaultArticulation: '',
    defaultDynamic: 'single',
    defaultMidi: 60,
    recommendedPreloadMidi: [60],
    samples,
  };
}

function slot(overrides: Partial<SampleSlotState> = {}): SampleSlotState {
  return getDefaultSampleSlotState({
    enabled: true,
    libraryKey: 'archive-found-strings-001',
    role: 'test',
    articulation: '',
    selectionMode: 'nearest',
    dynamicMode: 'fixed',
    fixedDynamic: 'single',
    ...overrides,
  });
}

const mappedLibrary = testLibrary([
  sample('mapped', 8400, 70, 60, 60),
  sample('nearest-but-unmapped', 8401, 60, 61, 61),
]);
const mappedResult = resolveSample({
  slot: slot({ selectionMode: 'mapped' }),
  targetMidi: 60,
  velocity: 90,
}, [mappedLibrary]);
assert.equal(mappedResult.kind, 'hit');
assert.equal(mappedResult.kind === 'hit' ? mappedResult.sampleId : '', 'mapped');

const nearestLibrary = testLibrary([
  sample('low', 8402, 55, 55, 55),
  sample('near', 8403, 62, 62, 62),
]);
const nearestResult = resolveSample({
  slot: slot({ selectionMode: 'nearest' }),
  targetMidi: 61,
  velocity: 90,
}, [nearestLibrary]);
assert.equal(nearestResult.kind, 'hit');
assert.equal(nearestResult.kind === 'hit' ? nearestResult.sampleId : '', 'near');

const exactMiss = resolveSample({
  slot: slot({ selectionMode: 'exact' }),
  targetMidi: 61,
  velocity: 90,
}, [nearestLibrary]);
assert.deepEqual(exactMiss, { kind: 'miss', reason: 'no-note-match' });

const velocityLibrary = testLibrary([
  sample('pp', 8404, 60, 60, 60, 'pp', 0, 39),
  sample('ff', 8405, 60, 60, 60, 'ff', 40, 127),
]);
const velocityLow = resolveSample({
  slot: slot({ dynamicMode: 'velocity', selectionMode: 'exact' }),
  targetMidi: 60,
  velocity: 39,
}, [velocityLibrary]);
assert.equal(velocityLow.kind === 'hit' ? velocityLow.dynamic : '', 'pp');
const velocityHigh = resolveSample({
  slot: slot({ dynamicMode: 'velocity', selectionMode: 'exact' }),
  targetMidi: 60,
  velocity: 40,
}, [velocityLibrary]);
assert.equal(velocityHigh.kind === 'hit' ? velocityHigh.dynamic : '', 'ff');

const fixedResult = resolveSample({
  slot: slot({ dynamicMode: 'fixed', fixedDynamic: 'ff', selectionMode: 'exact' }),
  targetMidi: 60,
  velocity: 0,
}, [velocityLibrary]);
assert.equal(fixedResult.kind === 'hit' ? fixedResult.sampleId : '', 'ff');

const staleLegacyNonPianoResult = resolveSample({
  slot: slot({ dynamicMode: 'legacy-piano-parity', selectionMode: 'exact' }),
  targetMidi: 60,
  velocity: 64,
}, [testLibrary([sample('non-piano-single', 8412, 60, 60, 60, 'single', 0, 127)])]);
assert.equal(staleLegacyNonPianoResult.kind, 'hit');
assert.equal(staleLegacyNonPianoResult.kind === 'hit' ? staleLegacyNonPianoResult.sampleId : '', 'non-piano-single');
assert.equal(
  sampleSlotSnapshotFields(slot({ dynamicMode: 'legacy-piano-parity' })).sampleDynamicMode,
  SAMPLE_DYNAMIC_MODE_IDS.velocity,
  'non-piano Product snapshots should normalize stale legacy piano dynamic mode to velocity',
);

const pitchLibrary = testLibrary([sample('root-60', 8406, 60, 60, 60)]);
const pitchResult = resolveSample({
  slot: slot({ selectionMode: 'nearest' }),
  targetMidi: 72,
  velocity: 90,
}, [pitchLibrary]);
assert.equal(pitchResult.kind, 'hit');
assert.equal(pitchResult.kind === 'hit' ? pitchResult.playbackRate : 0, 2);

const tieLibrary = testLibrary([
  sample('lower-root', 8407, 58, 58, 58),
  sample('higher-root-lower-asset', 8406, 62, 62, 62),
]);
const tieResult = resolveSample({
  slot: slot({ selectionMode: 'nearest' }),
  targetMidi: 60,
  velocity: 90,
}, [tieLibrary]);
assert.equal(tieResult.kind === 'hit' ? tieResult.sampleId : '', 'lower-root');

const disabledResult = resolveSample({
  slot: slot({ enabled: false }),
  targetMidi: 60,
  velocity: 90,
}, [pitchLibrary]);
assert.deepEqual(disabledResult, { kind: 'miss', reason: 'slot-disabled' });

const pianoSlot = getDefaultSampleSlotState({
  enabled: true,
  libraryKey: 'piano',
  dynamicMode: 'legacy-piano-parity',
  selectionMode: 'nearest',
});
const pianoVelocity = 96;
const pianoTarget = 61;
const pianoResult = resolveSample({
  slot: pianoSlot,
  targetMidi: pianoTarget,
  velocity: pianoVelocity,
}, getSampleLibraryRegistry());
const expectedVariant = choosePianoSampleVariant(pianoTarget, pianoVelocity / 127);
assert.equal(pianoResult.kind, 'hit');
assert.equal(pianoResult.kind === 'hit' ? pianoResult.dynamic : '', expectedVariant);
assert.equal(
  pianoResult.kind === 'hit' ? pianoResult.assetId : 0,
  getCoreProductPianoAssetIdForMidiVariant(pianoTarget, expectedVariant),
);
