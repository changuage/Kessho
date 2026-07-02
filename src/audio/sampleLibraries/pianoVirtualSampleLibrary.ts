import {
  PIANO_BASE_MIDI,
  PIANO_SAMPLE_COUNT,
  getPianoSamplePath,
} from '../pianoSamples';
import {
  CORE_PRODUCT_DEFAULT_PIANO_MIDI,
  CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES,
  getCoreProductPianoAssetIdForMidiVariant,
} from '../coreProductAssets';
import type { NormalizedSampleDescriptor, NormalizedSampleLibraryManifest } from './SampleLibraryTypes';

const PIANO_SAMPLE_RATE = 44100;

function uniqueMidi(notes: readonly number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const note of notes) {
    const midi = Math.max(0, Math.min(127, Math.round(note)));
    if (seen.has(midi)) continue;
    seen.add(midi);
    result.push(midi);
  }
  return result;
}

function createPianoSample(midi: number, variant: 'regular' | 'short'): NormalizedSampleDescriptor {
  const index = midi - PIANO_BASE_MIDI + 1;
  return {
    sampleId: `piano:${variant}:${midi}`,
    assetId: getCoreProductPianoAssetIdForMidiVariant(midi, variant),
    assetPath: getPianoSamplePath(variant, index),
    rootMidi: midi,
    loMidi: midi,
    hiMidi: midi,
    role: variant,
    articulation: '',
    dynamic: variant,
    velocityMin: 0,
    velocityMax: 127,
    loop: null,
  };
}

export function createPianoVirtualSampleLibrary(): NormalizedSampleLibraryManifest {
  const samples: NormalizedSampleDescriptor[] = [];
  for (let midi = PIANO_BASE_MIDI; midi < PIANO_BASE_MIDI + PIANO_SAMPLE_COUNT; midi += 1) {
    samples.push(createPianoSample(midi, 'regular'));
    samples.push(createPianoSample(midi, 'short'));
  }

  return {
    schema: 'kessho-normalized-sample-library-v1',
    libraryKey: 'piano',
    displayName: 'Legacy Keys',
    assetBasePath: 'samples',
    sourceSampleRate: PIANO_SAMPLE_RATE,
    encodedSampleRate: PIANO_SAMPLE_RATE,
    defaultRole: '',
    defaultArticulation: '',
    defaultDynamic: 'regular',
    defaultMidi: CORE_PRODUCT_DEFAULT_PIANO_MIDI,
    recommendedPreloadMidi: uniqueMidi([
      CORE_PRODUCT_DEFAULT_PIANO_MIDI,
      ...CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES,
    ]),
    samples,
  };
}
