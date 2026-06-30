import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { getCoreProductPianoAssetIdForMidiVariant } from '../coreProductAssets';
import { predictedSampleAssetsForState, sampleDescriptorForSlotNote, samplePredictionState } from '../product/host/CoreProductSampleAssetResolver';
import { getSampleLibraryRegistry } from './sampleLibraryRegistry';
import { resolveSample } from './sampleResolver';
import {
  applySampleLibrarySelectionDefaultsToFlatState,
  sampleSlotDefaultsForLibrary,
} from './sampleLibrarySelectionDefaults';
import { writeSampleSlotStateToFlatState } from './sampleSlotState';
import type { SampleLibraryKey, SampleSlotId } from './SampleLibraryTypes';

const registry = getSampleLibraryRegistry();
const slotIds: SampleSlotId[] = ['sample1', 'sample2'];
const velocities = [32, 80, 120];

const spellsingerDefaults = sampleSlotDefaultsForLibrary('sample1', 'the-spellsinger');
assert.equal(spellsingerDefaults.role, 'sustain', 'The Spellsinger should default to the pitched sustain layer');
assert.equal(spellsingerDefaults.articulation, 'sustain', 'The Spellsinger should default to sustain articulation');

const sample2PianoSimpleSequencerState = samplePredictionState(writeSampleSlotStateToFlatState(
  'sample2',
  sampleSlotDefaultsForLibrary('sample2', 'piano'),
  {
    leadRandomEnabled: true,
    leadRandomSource: 'sample2',
    lead1Octave: 0,
    lead1OctaveRange: 1,
  },
));
const sample2PianoPredicted = predictedSampleAssetsForState(sample2PianoSimpleSequencerState);
assert(
  sample2PianoPredicted.some((descriptor) => descriptor.assetId === getCoreProductPianoAssetIdForMidiVariant(64, 'regular')),
  'Sample 2 Piano Random Timing should preload regular piano assets for its note range',
);
assert(
  sample2PianoPredicted.some((descriptor) => descriptor.assetId === getCoreProductPianoAssetIdForMidiVariant(64, 'short')),
  'Sample 2 Piano Random Timing should preload short piano assets for legacy parity',
);

const sample2HydratedDefaultState = samplePredictionState({
  sample2Enabled: true,
  leadRandomEnabled: true,
  leadRandomSource: 'sample2',
  lead1Octave: 0,
  lead1OctaveRange: 1,
});
const sample2HydratedDefaultDescriptor = sampleDescriptorForSlotNote(sample2HydratedDefaultState, 'sample2', 60, 0.75);
assert.equal(
  sample2HydratedDefaultDescriptor?.libraryKey,
  'soft-string-spurs',
  'Sample 2 missing library state should resolve the same Soft String Spurs fallback shown by the UI',
);
const sample2HydratedDefaultPredicted = predictedSampleAssetsForState(sample2HydratedDefaultState);
assert(
  sample2HydratedDefaultPredicted.some((descriptor) => descriptor.libraryKey === 'soft-string-spurs'),
  'Sample 2 missing library state should preload Soft String Spurs assets for Random Timing',
);

function assetPathExists(libraryAssetBasePath: string, assetPath: string): boolean {
  return existsSync(path.join(process.cwd(), 'public', libraryAssetBasePath, assetPath));
}

for (const library of registry) {
  assert(library.samples.length > 0, `${library.libraryKey} should include samples`);
  for (const sample of library.samples) {
    assert(
      assetPathExists(library.assetBasePath, sample.assetPath),
      `${library.libraryKey}:${sample.sampleId} should be delivered at ${sample.assetPath}`,
    );
    const result = resolveSample({
      slot: {
        ...sampleSlotDefaultsForLibrary('sample1', library.libraryKey as SampleLibraryKey),
        role: sample.role,
        articulation: sample.articulation,
        selectionMode: 'exact',
        dynamicMode: 'fixed',
        fixedDynamic: sample.dynamic,
      },
      targetMidi: sample.rootMidi,
      velocity: Math.max(1, Math.round((sample.velocityMin + sample.velocityMax) / 2)),
    }, registry);
    assert.equal(result.kind, 'hit', `${library.libraryKey}:${sample.sampleId} should resolve from its own slot selection`);
    if (result.kind === 'hit') {
      assert.equal(result.sample.role, sample.role, `${library.libraryKey}:${sample.sampleId} should resolve the requested role`);
      assert.equal(result.sample.articulation, sample.articulation, `${library.libraryKey}:${sample.sampleId} should resolve the requested articulation`);
      assert.equal(result.sample.dynamic, sample.dynamic, `${library.libraryKey}:${sample.sampleId} should resolve the requested dynamic`);
    }
  }

  for (const slotId of slotIds) {
    const slot = sampleSlotDefaultsForLibrary(slotId, library.libraryKey as SampleLibraryKey);
    const candidateMidi = Array.from(new Set([
      library.defaultMidi,
      ...library.recommendedPreloadMidi.slice(0, 3),
      library.samples[0]?.rootMidi ?? library.defaultMidi,
    ]));
    for (const midi of candidateMidi) {
      for (const velocity of velocities) {
        const result = resolveSample({ slot, targetMidi: midi, velocity }, registry);
        assert.equal(result.kind, 'hit', `${slotId} ${library.libraryKey} should resolve default selection at MIDI ${midi} velocity ${velocity}`);
      }
    }

    const staleState = writeSampleSlotStateToFlatState(slotId, sampleSlotDefaultsForLibrary(slotId, 'piano'));
    applySampleLibrarySelectionDefaultsToFlatState(staleState, slotId, library.libraryKey as SampleLibraryKey);
    const descriptor = sampleDescriptorForSlotNote(samplePredictionState(staleState), slotId, library.defaultMidi, 0.75);
    assert.equal(
      descriptor?.libraryKey,
      library.libraryKey,
      `${slotId} should resolve ${library.libraryKey} after changing from Piano defaults`,
    );
  }
}
