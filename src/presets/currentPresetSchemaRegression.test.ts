import assert from 'node:assert/strict';
import {
  decodeCurrentPresetEntry,
  UnsupportedPresetVersionError,
} from './currentPresetSchema';

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
