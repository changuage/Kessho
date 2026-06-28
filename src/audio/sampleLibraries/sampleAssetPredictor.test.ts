import assert from 'node:assert/strict';

import { getCoreProductPianoAssetIdForMidiVariant } from '../coreProductAssets';
import { predictLegacyPianoSampleAssets, predictSampleAssets } from './sampleAssetPredictor';
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

const legacyPianoPredicted = predictLegacyPianoSampleAssets({
  pianoEnabled: true,
  synthEuclid1Enabled: true,
  synthEuclid1Source: 'piano',
  synthEuclid1NoteMin: 48,
  synthEuclid1NoteMax: 72,
});
assert.ok(legacyPianoPredicted.length > 0, 'legacy Piano compatibility predictor should produce descriptors');
assert.ok(legacyPianoPredicted.length <= 32, 'legacy Piano compatibility predictor must not preload full Piano library');
