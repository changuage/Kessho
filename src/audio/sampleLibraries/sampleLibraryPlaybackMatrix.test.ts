import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { CORE_PRODUCT_SOURCE_IDS } from '../coreProductEvents';
import { getCoreProductPianoAssetIdForMidiVariant } from '../coreProductAssets';
import { predictedSampleAssetsForState, sampleDescriptorForSlotNote, samplePredictionState } from '../product/host/CoreProductSampleAssetResolver';
import { createWalkerLayer } from '../../ui/sequencer/anchorWalkerTypes';
import { createDefaultOrbitNote } from '../../ui/sequencer/orbitSequencerTypes';
import { createDefaultSynthSequencerFaceState } from '../../ui/sequencer/sequencerModeTypes';
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

const sequencedSample2PianoState = samplePredictionState(writeSampleSlotStateToFlatState(
  'sample2',
  {
    ...sampleSlotDefaultsForLibrary('sample2', 'piano'),
    enabled: true,
  },
  {
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample2',
    synthChordGeneratorVoiceCount: 2,
  },
));
assert.equal(sequencedSample2PianoState.sample2Enabled, true, 'Sample 2 prediction state should honor explicit sample2Enabled');
const sequencedSample2PianoPredicted = predictedSampleAssetsForState(sequencedSample2PianoState);
assert(
  sequencedSample2PianoPredicted.some((descriptor) => descriptor.assetId === getCoreProductPianoAssetIdForMidiVariant(60, 'regular')),
  'Sequenced Sample 2 Piano should preload regular piano assets when Sample 2 is explicitly enabled',
);

const disabledSequencedSample2PianoState = samplePredictionState(writeSampleSlotStateToFlatState(
  'sample2',
  {
    ...sampleSlotDefaultsForLibrary('sample2', 'piano'),
    enabled: false,
  },
  {
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample2',
    synthChordGeneratorVoiceCount: 2,
  },
));
assert.equal(disabledSequencedSample2PianoState.sample2Enabled, false, 'Sample prediction must not force-enable Sample 2');
assert.equal(
  predictedSampleAssetsForState(disabledSequencedSample2PianoState).length,
  0,
  'Disabled Sample 2 should not preload sequencer assets',
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

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
    orbit: {
      ...firstSlot.orbit,
      enabled: true,
      targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
      notes: [
        createDefaultOrbitNote(0, {
          targetSourceId: CORE_PRODUCT_SOURCE_IDS.sample2,
          pitchMode: 'fixedMidi',
          midiNote: 98,
          pitchRangeMin: 48,
          pitchRangeMax: 100,
        }),
      ],
    },
  };
  const state = applySampleLibrarySelectionDefaultsToFlatState({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'lead1',
    synthSequencerFaces: faces,
  }, 'sample2', 'the-spellsinger');
  state.sample2Enabled = true;
  const predictionState = samplePredictionState(state);
  const neededDescriptor = sampleDescriptorForSlotNote(predictionState, 'sample2', 98, 0.82);
  assert(neededDescriptor, 'Sample 2 native Orbit note should resolve an exact Spellsinger asset');
  const predicted = predictedSampleAssetsForState(predictionState);
  assert(
    predicted.some((descriptor) => descriptor.assetId === neededDescriptor.assetId),
    'Sample 2 native Orbit target should preload the exact asset required for Product Core playback',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'anchorWalker',
    anchorWalker: {
      ...firstSlot.anchorWalker,
      enabled: true,
      targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
      outputRangeMin: 90,
      outputRangeMax: 100,
      layers: [
        createWalkerLayer(0, {
          enabled: true,
          targetSourceId: CORE_PRODUCT_SOURCE_IDS.sample2,
          tuning: 'rawTranspose',
        }),
        createWalkerLayer(1, { enabled: false }),
        createWalkerLayer(2, { enabled: false }),
        createWalkerLayer(3, { enabled: false }),
      ],
    },
  };
  const state = applySampleLibrarySelectionDefaultsToFlatState({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'lead1',
    synthSequencerFaces: faces,
  }, 'sample2', 'the-spellsinger');
  state.sample2Enabled = true;
  const predictionState = samplePredictionState(state);
  const neededDescriptor = sampleDescriptorForSlotNote(predictionState, 'sample2', 100, 0.82);
  assert(neededDescriptor, 'Sample 2 native Anchor Walker range should resolve a Spellsinger asset');
  const predicted = predictedSampleAssetsForState(predictionState);
  assert(
    predicted.some((descriptor) => descriptor.assetId === neededDescriptor.assetId),
    'Sample 2 native Anchor Walker layer should preload assets for its routed output range',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
    orbit: {
      ...firstSlot.orbit,
      enabled: true,
      targetSourceId: 'sample2',
      notes: [
        {
          ...createDefaultOrbitNote(0, {
            pitchMode: 'fixedMidi',
            midiNote: 98,
            pitchRangeMin: 48,
            pitchRangeMax: 100,
          }),
          targetSourceId: 'sample2',
        },
      ],
    },
  } as unknown as typeof faces.slots[number];
  const state = applySampleLibrarySelectionDefaultsToFlatState({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'lead1',
    synthSequencerFaces: faces,
  }, 'sample2', 'the-spellsinger');
  state.sample2Enabled = true;
  const predictionState = samplePredictionState(state);
  assert.equal(predictionState.sample2Enabled, true, 'Sample 2 string Orbit prediction should honor explicit sample2Enabled');
  const neededDescriptor = sampleDescriptorForSlotNote(predictionState, 'sample2', 98, 0.82);
  assert(neededDescriptor, 'Sample 2 string Orbit target should resolve an exact Spellsinger asset');
  const predicted = predictedSampleAssetsForState(predictionState);
  assert(
    predicted.some((descriptor) => descriptor.assetId === neededDescriptor.assetId),
    'Sample 2 string Orbit target should preload the exact asset required for live Product Core playback',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'anchorWalker',
    anchorWalker: {
      ...firstSlot.anchorWalker,
      enabled: true,
      targetSourceId: 'lead1',
      outputRangeMin: 90,
      outputRangeMax: 100,
      layers: [
        {
          ...createWalkerLayer(0, {
            enabled: true,
            tuning: 'rawTranspose',
          }),
          targetSourceId: 'sample2',
        },
        createWalkerLayer(1, { enabled: false }),
        createWalkerLayer(2, { enabled: false }),
        createWalkerLayer(3, { enabled: false }),
      ],
    },
  } as unknown as typeof faces.slots[number];
  const state = applySampleLibrarySelectionDefaultsToFlatState({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'lead1',
    synthSequencerFaces: faces,
  }, 'sample2', 'the-spellsinger');
  state.sample2Enabled = true;
  const predictionState = samplePredictionState(state);
  assert.equal(predictionState.sample2Enabled, true, 'Sample 2 string Walker prediction should honor explicit sample2Enabled');
  const neededDescriptor = sampleDescriptorForSlotNote(predictionState, 'sample2', 100, 0.82);
  assert(neededDescriptor, 'Sample 2 string Walker target should resolve a Spellsinger asset');
  const predicted = predictedSampleAssetsForState(predictionState);
  assert(
    predicted.some((descriptor) => descriptor.assetId === neededDescriptor.assetId),
    'Sample 2 string Walker layer should preload assets for live Product Core playback',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
    orbit: {
      ...firstSlot.orbit,
      enabled: true,
      targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
      pitchRangeMin: 98,
      pitchRangeMax: 98,
      notes: [
        createDefaultOrbitNote(0, {
          targetSourceId: 'follow',
          pitchMode: 'fixedMidi',
          midiNote: 98,
          pitchRangeMin: 98,
          pitchRangeMax: 98,
        }),
      ],
    },
  };
  const state = applySampleLibrarySelectionDefaultsToFlatState({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
    synthSequencerFaces: faces,
  }, 'sample2', 'the-spellsinger');
  state.sample2Enabled = true;
  const predictionState = samplePredictionState(state);
  const neededDescriptor = sampleDescriptorForSlotNote(predictionState, 'sample2', 98, 0.82);
  assert(neededDescriptor, 'Sample 2 lane-follow Orbit note should resolve an exact Spellsinger asset');
  const predicted = predictedSampleAssetsForState(predictionState);
  assert(
    predicted.some((descriptor) => descriptor.assetId === neededDescriptor.assetId),
    'Sample 2 lane-follow Orbit should preload the exact asset required by the Product Core snapshot target',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'anchorWalker',
    anchorWalker: {
      ...firstSlot.anchorWalker,
      enabled: true,
      targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
      outputRangeMin: 98,
      outputRangeMax: 98,
      layers: [
        createWalkerLayer(0, {
          enabled: true,
          targetSourceId: 'follow',
          tuning: 'rawTranspose',
        }),
        createWalkerLayer(1, { enabled: false }),
        createWalkerLayer(2, { enabled: false }),
        createWalkerLayer(3, { enabled: false }),
      ],
    },
  };
  const state = applySampleLibrarySelectionDefaultsToFlatState({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
    synthSequencerFaces: faces,
  }, 'sample2', 'the-spellsinger');
  state.sample2Enabled = true;
  const predictionState = samplePredictionState(state);
  const neededDescriptor = sampleDescriptorForSlotNote(predictionState, 'sample2', 98, 0.82);
  assert(neededDescriptor, 'Sample 2 lane-follow Anchor Walker output should resolve a Spellsinger asset');
  const predicted = predictedSampleAssetsForState(predictionState);
  assert(
    predicted.some((descriptor) => descriptor.assetId === neededDescriptor.assetId),
    'Sample 2 lane-follow Anchor Walker should preload assets for the Product Core snapshot target',
  );
}

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
