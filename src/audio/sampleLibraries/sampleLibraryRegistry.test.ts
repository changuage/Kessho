import assert from 'node:assert/strict';

import {
  getCoreProductPianoAssetIdForMidiVariant,
} from '../coreProductAssets';
import {
  PIANO_BASE_MIDI,
  PIANO_SAMPLE_COUNT,
  getPianoSamplePath,
} from '../pianoSamples';
import {
  assertSampleAssetIdsAreInRanges,
  assertSampleAssetIdsAreUnique,
} from './sampleAssetIdRanges';
import type { NormalizedSampleDescriptor, NormalizedSampleLibraryManifest } from './SampleLibraryTypes';
import { createPianoVirtualSampleLibrary } from './pianoVirtualSampleLibrary';
import { getSampleLibraryRegistry } from './sampleLibraryRegistry';

const registry: readonly NormalizedSampleLibraryManifest[] = getSampleLibraryRegistry();
const piano: NormalizedSampleLibraryManifest | undefined = registry.find((library) => library.libraryKey === 'piano');
assert.ok(piano, 'sample registry must include virtual Piano');
assert.equal(piano.samples.length, PIANO_SAMPLE_COUNT * 2, 'virtual Piano must expose regular and short samples');

const virtualPiano = createPianoVirtualSampleLibrary();
assert.deepEqual(
  virtualPiano.samples.map((sample) => sample.assetId),
  piano.samples.map((sample) => sample.assetId),
  'generated Piano registry must match runtime virtual Piano helper asset IDs',
);

for (let midi = PIANO_BASE_MIDI; midi < PIANO_BASE_MIDI + PIANO_SAMPLE_COUNT; midi += 1) {
  const index = midi - PIANO_BASE_MIDI + 1;
  const regular: NormalizedSampleDescriptor | undefined =
    piano.samples.find((sample) => sample.sampleId === `piano:regular:${midi}`);
  const short: NormalizedSampleDescriptor | undefined =
    piano.samples.find((sample) => sample.sampleId === `piano:short:${midi}`);
  assert.ok(regular, `missing regular Piano descriptor for MIDI ${midi}`);
  assert.ok(short, `missing short Piano descriptor for MIDI ${midi}`);
  assert.equal(regular.assetId, getCoreProductPianoAssetIdForMidiVariant(midi, 'regular'));
  assert.equal(short.assetId, getCoreProductPianoAssetIdForMidiVariant(midi, 'short'));
  assert.equal(regular.assetPath, getPianoSamplePath('regular', index));
  assert.equal(short.assetPath, getPianoSamplePath('short', index));
}

assertSampleAssetIdsAreUnique(registry);
assertSampleAssetIdsAreInRanges(registry);

const expectedLibraries = [
  'pneuma-eleni-teaser',
  'soft-string-spurs',
  'archive-found-strings-001',
  'array-mbira',
  'the-spellsinger',
  'wild-percussion',
] as const;

for (const libraryKey of expectedLibraries) {
  const library = registry.find((candidate) => candidate.libraryKey === libraryKey);
  assert.ok(library, `missing imported sample library ${libraryKey}`);
  assert.ok(library.samples.length > 0, `${libraryKey} should normalize at least one rooted sample`);
}
