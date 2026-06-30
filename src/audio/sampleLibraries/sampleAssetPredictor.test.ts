import assert from 'node:assert/strict';

import { getCoreProductPianoAssetIdForMidiVariant } from '../coreProductAssets';
import { predictLegacyPianoSampleAssets, predictSampleAssets } from './sampleAssetPredictor';
import { getSampleLibrary } from './sampleLibraryRegistry';
import { getDefaultSampleSlotState, writeSampleSlotStateToFlatState } from './sampleSlotState';

const state = writeSampleSlotStateToFlatState('sample1', getDefaultSampleSlotState({
  enabled: true,
  libraryKey: 'piano',
  selectionMode: 'nearest',
  dynamicMode: 'legacy-piano-parity',
  loopEnabled: false,
}));

const predicted = predictSampleAssets({
  state,
  recentMidiBySlot: new Map([['sample1', [60, 64]]]),
  sequencerLaneRanges: [{ source: 'sample1', minMidi: 48, maxMidi: 72 }],
  manualPriorityMidi: [60],
  maxAssetsPerSlot: 32,
});

assert.ok(predicted.length > 0, 'predictor should return assets for enabled sample1 Piano slot');
assert.ok(predicted.length <= 32, 'predictor must cap per-slot assets');
assert.equal(new Set(predicted.map((descriptor) => descriptor.assetId)).size, predicted.length, 'predictor must dedupe by asset id');
assert.ok(
  predicted.some((descriptor) => descriptor.assetId === getCoreProductPianoAssetIdForMidiVariant(60, 'regular')),
  'legacy Piano prediction should include regular variant',
);
assert.ok(
  predicted.some((descriptor) => descriptor.assetId === getCoreProductPianoAssetIdForMidiVariant(60, 'short')),
  'legacy Piano prediction should include short variant',
);

const softStringSpurs = getSampleLibrary('soft-string-spurs');
assert.ok(softStringSpurs, 'Soft String Spurs sample library should be delivered in the app registry');
const sample1StringState = writeSampleSlotStateToFlatState('sample1', getDefaultSampleSlotState({
  enabled: true,
  libraryKey: 'soft-string-spurs',
  role: softStringSpurs?.defaultRole ?? 'harmonic',
  articulation: softStringSpurs?.defaultArticulation ?? 'harmonic',
  selectionMode: 'mapped',
  dynamicMode: 'legacy-piano-parity',
  fixedDynamic: softStringSpurs?.defaultDynamic ?? 'single',
  loopEnabled: true,
}));
const sample1StringPredicted = predictSampleAssets({
  state: sample1StringState,
  recentMidiBySlot: new Map([['sample1', [60]]]),
  sequencerLaneRanges: [{ source: 'sample1', minMidi: 60, maxMidi: 60 }],
  manualPriorityMidi: [60],
  maxAssetsPerSlot: 8,
});
assert.ok(sample1StringPredicted.some((descriptor) => descriptor.libraryKey === 'soft-string-spurs'), 'Sample 1 should predict non-piano sample assets even with stale legacy dynamic mode');

const archiveFoundStrings = getSampleLibrary('archive-found-strings-001');
assert.ok(archiveFoundStrings, 'Archive Found Strings sample library should be delivered in the app registry');
const sample2ArchiveState = writeSampleSlotStateToFlatState('sample2', getDefaultSampleSlotState({
  enabled: true,
  libraryKey: 'archive-found-strings-001',
  role: archiveFoundStrings?.defaultRole ?? 'profile',
  articulation: archiveFoundStrings?.defaultArticulation ?? 'found-string-loop',
  selectionMode: 'mapped',
  dynamicMode: 'velocity',
  fixedDynamic: archiveFoundStrings?.defaultDynamic ?? 'single',
  loopEnabled: true,
}));
const sample2ArchivePredicted = predictSampleAssets({
  state: sample2ArchiveState,
  recentMidiBySlot: new Map([['sample2', [61, 63]]]),
  sequencerLaneRanges: [{ source: 'sample2', minMidi: 61, maxMidi: 63 }],
  manualPriorityMidi: [61],
  maxAssetsPerSlot: 8,
});
assert.ok(sample2ArchivePredicted.some((descriptor) => descriptor.libraryKey === 'archive-found-strings-001'), 'Sample 2 should predict delivered non-piano sample assets');

const legacyPianoPredicted = predictLegacyPianoSampleAssets({
  pianoEnabled: true,
  synthEuclid1Enabled: true,
  synthEuclid1Source: 'piano',
  synthEuclid1NoteMin: 48,
  synthEuclid1NoteMax: 72,
});
assert.ok(legacyPianoPredicted.length > 0, 'legacy Piano compatibility predictor should produce descriptors');
assert.ok(legacyPianoPredicted.length <= 32, 'legacy Piano compatibility predictor must not preload full Piano library');
