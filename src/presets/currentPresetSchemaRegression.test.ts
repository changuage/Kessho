import assert from 'node:assert/strict';
import {
  decodeCurrentPresetEntry,
  UnsupportedPresetVersionError,
} from './currentPresetSchema';
import { DEFAULT_STATE, serializeState } from '../ui/state';
import { PRESET_VERSION_METADATA_FIELDS } from './presetUtils';
import { SYNTH_EUCLIDEAN_LANE_COUNT } from '../audio/sequencerLaneCounts';
import { canonicalizeStoredPresetEntry } from './storedPresetCompatibility';

const currentStatePayload = JSON.parse(serializeState(DEFAULT_STATE)) as Record<string, unknown>;
for (const legacyKey of [
  'harmonyChordSequence', 'harmonyChordSequenceA', 'harmonyChordSequenceB',
  'harmonyChordSequenceEnabled', 'harmonyChordSequenceLength', 'harmonyChordSequenceStepIndex',
  'synthArpConfigs',
  'chordProgressionEnabled', 'chordProgressionPattern', 'chordProgressionSteps',
  'chordProgressionHits', 'chordProgressionRotation', 'chordProgressionStepEnabled',
  'chordProgressionPhraseMultiplier', 'chordProgressionClockSource',
]) {
  assert.equal(legacyKey in currentStatePayload, false, `current state must not author ${legacyKey}`);
}
assert.equal(PRESET_VERSION_METADATA_FIELDS.includes('synthArpConfigs' as never), false, 'legacy Play metadata is decode-only');
assert.equal(SYNTH_EUCLIDEAN_LANE_COUNT, 4, 'current schema has exactly four authored Synth Euclid lanes');
assert.equal(Object.keys(currentStatePayload).some((key) => /^synthEuclid5/.test(key)), false, 'Seq5 state keys are not authored');

const entry = {
  type: 'engine' as const,
  scope: 'pad1',
  engine: 'pad1',
  name: 'Canonical',
  author: 'user' as const,
  library: 'user' as const,
  versions: [{ v: 1, note: '', timestamp: 1, data: { masterVolume: 0.5 } }],
  currentVersion: 1,
  createdAt: 1,
  updatedAt: 1,
};

const decoded = decodeCurrentPresetEntry(entry);
assert.equal(decoded, entry, 'current decoding must preserve the canonical object without repair');
assert.equal(decoded.versions[0]?.data.masterVolume, 0.5);

const laneRelativeSequenceData = {
  euclideanPatternEnabled: true,
  euclideanPatternPreset: 'tresillo',
  euclideanPatternSteps: 8,
  euclideanPatternHits: 3,
  euclideanPatternRotation: 0,
  euclideanPatternNoteMin: 48,
  euclideanPatternNoteMax: 67,
  euclideanPatternVoiceMask: 128,
  euclideanPatternSequenceState: { clockDivs: [4], swings: [0] },
};
const sequenceEntry = decodeCurrentPresetEntry({
  ...entry,
  scope: 'euclideanPattern',
  engine: 'euclideanPattern',
  versions: [{ ...entry.versions[0], data: laneRelativeSequenceData }],
});
assert.deepEqual(sequenceEntry.versions[0]?.data, laneRelativeSequenceData);

assert.throws(
  () => decodeCurrentPresetEntry({ ...entry, versions: [{ ...entry.versions[0], data: { legacyAlias: 0.5 } }] }),
  UnsupportedPresetVersionError,
  'unknown legacy data keys must be rejected',
);

const storedLegacyState = decodeCurrentPresetEntry(canonicalizeStoredPresetEntry({
  ...entry,
  type: 'state',
  scope: 'global',
  engine: undefined,
  source: 'global',
  versions: [{
    ...entry.versions[0],
    data: {
      masterVolume: 0.5,
      masterSatDrive: 0.4,
      masterSatMode: 'tape',
      masterSatTone: 0.6,
      airNoise: 0.15,
      filterModSpeed: 2,
      oscBrightness: 2,
      chordProgressionClockSource: 'phrase',
      harmonyGenerationSeed: 4,
      granularPreset: 'legacy_cloud',
      granularDryWet: 0.42,
      synthChordSequencerEnabled: true,
      synthChordSequencer: { steps: [] },
      spectralFreezeEnabled: false,
      spectralFreezeActive: true,
      spectralFreezeCaptureSerial: 41,
      spectralFreezeDecay: 0.82,
      characterAge: 0.37,
      degradeModEnvAlias: 0.24,
      drumRandomBeepHiProb: 0.2,
      filterCutoffMin: 100,
      filterCutoffMax: 2000,
    },
  }],
}));
assert.deepEqual(storedLegacyState.versions[0]?.data, {
  masterVolume: 0.5,
  masterSaturationDrive: 0.4,
  masterSaturationMode: 'tape',
  masterSaturationTone: 0.6,
  masterSaturationEnabled: true,
  padOscAWave: 'sawtooth',
  padOscBWave: 'triangle',
  granularLevel: 0.42,
  spectralFreezeEnabled: false,
  driftAge: 0.37,
  erosionModEnvAlias: 0.24,
  filterCutoff: 1050,
});
assert.deepEqual(storedLegacyState.versions[0]?.dualRanges?.filterCutoff, { min: 100, max: 2000 });
assert.equal(storedLegacyState.versions[0]?.sliderModes?.filterCutoff, 'walk');

assert.throws(
  () => decodeCurrentPresetEntry(canonicalizeStoredPresetEntry({
    ...entry,
    type: 'state',
    scope: 'global',
    engine: undefined,
    source: 'global',
    versions: [{ ...entry.versions[0], data: { spectralFreezeEnabled: true, spectralFreezeDecay: 0.5 } }],
  })),
  UnsupportedPresetVersionError,
  'active legacy spectral-freeze data must not be silently discarded',
);

assert.throws(
  () => decodeCurrentPresetEntry(canonicalizeStoredPresetEntry({
    ...entry,
    type: 'state',
    scope: 'global',
    engine: undefined,
    source: 'global',
    versions: [{ ...entry.versions[0], data: { genuinelyUnknownField: true } }],
  })),
  UnsupportedPresetVersionError,
  'stored compatibility must keep rejecting genuinely unknown fields',
);

assert.throws(
  () => decodeCurrentPresetEntry({ ...entry, currentVersion: 2 }),
  UnsupportedPresetVersionError,
  'unknown current version must be rejected',
);
assert.throws(
  () => decodeCurrentPresetEntry({
    ...entry,
    versions: [entry.versions[0], { v: 1, note: '', timestamp: 2, data: {} }],
  }),
  UnsupportedPresetVersionError,
  'duplicate versions must be rejected',
);
assert.throws(
  () => decodeCurrentPresetEntry({ ...entry, versions: [{ ...entry.versions[0], data: null }] }),
  UnsupportedPresetVersionError,
  'invalid version data must be rejected',
);

assert.throws(
  () => decodeCurrentPresetEntry({
    ...entry,
    type: 'journey',
    scope: undefined,
    engine: undefined,
    source: undefined,
    versions: [{
      ...entry.versions[0],
      data: {
        formatVersion: 1,
        name: 'Journey',
        autoAdvance: true,
        loopEnabled: true,
        nodes: [],
        connections: [],
        legacyAlias: true,
      },
    }],
  }),
  UnsupportedPresetVersionError,
  'journey data must reject unknown keys instead of relying on decoder repair',
);

assert.throws(
  () => decodeCurrentPresetEntry({
    ...entry,
    type: 'source',
    scope: 'visualizer',
    source: 'visualizer',
    versions: [{
      ...entry.versions[0],
      data: {
        format: 'kessho-visualizer-preset',
        formatVersion: 1,
        mode: 'scene',
        controls: {},
        reaction: {},
        seed: 1,
        legacyAlias: true,
      },
    }],
  }),
  UnsupportedPresetVersionError,
  'visualizer data must reject unknown keys instead of accepting arbitrary records',
);

console.log('current preset schema regression passed');
