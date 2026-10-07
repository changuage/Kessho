import assert from 'node:assert/strict';
import test from 'node:test';

import { DRUM_VOICE_PRESETS } from './drumPresets';
import { encodeCoreProductSnapshot } from './coreProductSnapshotEncoder';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import { KESSHO_PRODUCT_DRUM_VOICES } from './generated/kesshoProductSchema';
import { mergeMorphEndpointStatePatch } from '../ui/useMorphEndpointStatePatch';
import { DEFAULT_STATE, type SliderState } from '../ui/state';

type StatePatch = Record<string, unknown>;
type Endpoint = 'a' | 'b';
type EndpointPreset = { name: string; timestamp: string; state: SliderState };
type DomainRow = { name: string; a: StatePatch; b: StatePatch };

if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'http://localhost' } },
  });
}

function withPatch(patch: StatePatch): SliderState {
  const state = { ...DEFAULT_STATE } as SliderState;
  for (const [key, value] of Object.entries(patch)) {
    (state as unknown as Record<string, unknown>)[key] = value;
  }
  return state;
}

function captureEndpoint(name: string, base: SliderState, patch: StatePatch): EndpointPreset {
  const captured = mergeMorphEndpointStatePatch(
    { name, timestamp: '', state: base },
    base,
    withPatch(patch),
  );
  assert.ok(captured, `${name} endpoint should remain owned after capture`);
  return captured;
}

function followEndpoints(scene: Record<Endpoint, EndpointPreset>, sequence: Endpoint[]): SliderState {
  let state = { ...DEFAULT_STATE } as SliderState;
  for (const endpoint of sequence) {
    // This is the exact endpoint branch of App's whole-preset morph overlay.
    state = { ...state, ...scene[endpoint].state } as SliderState;
  }
  return state;
}

function encoded(state: SliderState): Uint8Array {
  return new Uint8Array(encodeCoreProductSnapshot(createCoreProductSnapshot(
    state as unknown as Record<string, unknown>,
  )));
}

function assertEncodedEqual(expected: Uint8Array, actual: Uint8Array, message: string): void {
  assert.equal(actual.byteLength, expected.byteLength, `${message}: encoded size`);
  assert.deepEqual(actual, expected, message);
}

const drumDspKeys: Record<string, string> = {
  sub: 'drumSubFreq',
  kick: 'drumKickFreq',
  click: 'drumClickFilter',
  beepHi: 'drumBeepHiFreq',
  beepLo: 'drumBeepLoFreq',
  noise: 'drumNoiseFilterFreq',
  membrane: 'drumMembraneSize',
};

function drumVoicePatch(endpoint: Endpoint, voice: (typeof KESSHO_PRODUCT_DRUM_VOICES)[number]): StatePatch {
  const patch: StatePatch = {
    drumEnabled: true,
  };
  const presets = DRUM_VOICE_PRESETS[voice.name as keyof typeof DRUM_VOICE_PRESETS];
  const first = presets[0]!;
  const second = presets[1] ?? first;
  patch[voice.presetAKey] = endpoint === 'a' ? first.name : second.name;
  patch[voice.presetBKey] = endpoint === 'a' ? second.name : first.name;
  patch[voice.morphKey] = endpoint === 'a' ? 0 : 1;
  patch[drumDspKeys[voice.name]!] = endpoint === 'a'
    ? 45 + voice.index * 7
    : 58 + voice.index * 9;
  return patch;
}

const DRUM_ROWS: DomainRow[] = KESSHO_PRODUCT_DRUM_VOICES.map((voice) => ({
  name: `drums/${voice.name}`,
  a: drumVoicePatch('a', voice),
  b: drumVoicePatch('b', voice),
}));

const NATURE_A: StatePatch = {
  natureMasterEnabled: true,
  natureLevel: 0.62,
  nature1Enabled: true, nature1SampleId: 'ghetary-waves', nature1Level: 0.22, nature1SliceDuration: 14, nature1SliceDensity: 0.31, nature1FilterType: 'lowpass', nature1FilterCutoff: 4200, nature1FilterResonance: 0.17,
  nature2Enabled: true, nature2SampleId: 'birds-alps', nature2Level: 0.35, nature2SliceDuration: 13, nature2SliceDensity: 0.43, nature2FilterType: 'bandpass', nature2FilterCutoff: 5100, nature2FilterResonance: 0.21,
  nature3Enabled: true, nature3SampleId: 'birds-fujian', nature3Level: 0.28, nature3SliceDuration: 11, nature3SliceDensity: 0.49, nature3FilterType: 'highpass', nature3FilterCutoff: 6200, nature3FilterResonance: 0.13,
  nature4Enabled: true, nature4SampleId: 'frogs-fujian', nature4Level: 0.41, nature4SliceDuration: 12, nature4SliceDensity: 0.56, nature4FilterType: 'notch', nature4FilterCutoff: 3300, nature4FilterResonance: 0.24,
};

const NATURE_B: StatePatch = {
  natureMasterEnabled: true,
  natureLevel: 0.91,
  nature1Enabled: false, nature1SampleId: 'birds-alps', nature1Level: 0.47, nature1SliceDuration: 18, nature1SliceDensity: 0.64, nature1FilterType: 'highpass', nature1FilterCutoff: 7600, nature1FilterResonance: 0.33,
  nature2Enabled: false, nature2SampleId: 'frogs-fujian', nature2Level: 0.54, nature2SliceDuration: 16, nature2SliceDensity: 0.52, nature2FilterType: 'notch', nature2FilterCutoff: 6800, nature2FilterResonance: 0.29,
  nature3Enabled: false, nature3SampleId: 'ghetary-waves', nature3Level: 0.44, nature3SliceDuration: 15, nature3SliceDensity: 0.58, nature3FilterType: 'lowpass', nature3FilterCutoff: 9100, nature3FilterResonance: 0.31,
  nature4Enabled: false, nature4SampleId: 'birds-fujian', nature4Level: 0.33, nature4SliceDuration: 14, nature4SliceDensity: 0.61, nature4FilterType: 'bandpass', nature4FilterCutoff: 5400, nature4FilterResonance: 0.37,
};

const WATER_A: StatePatch = {
  waterEnabled: true, waterLevel: 0.68, waterMorphA: 0, waterMorphB: 2, waterMorph: 0.2,
  waterIntensity: 0.42, waterDistance: 0.18, waterLayerHardDrops: 0.72, waterLayerHardDropsEnabled: true,
  waterLayerWaterDrops: 0.41, waterLayerWaterDropsEnabled: true, waterLayerBubbling: 0.33, waterLayerBubblingEnabled: true,
  waterHardDropRate: 0.63, waterHardDropLPF: 7200, waterWaterDropRate: 0.82, waterWaterDropLPF: 10400,
  waterChannelsMorph: 0.24, waterChannelsSpeed: 0.37,
};

const WATER_B: StatePatch = {
  waterEnabled: true, waterLevel: 0.89, waterMorphA: 4, waterMorphB: 7, waterMorph: 0.81,
  waterIntensity: 0.87, waterDistance: 0.71, waterLayerHardDrops: 0.18, waterLayerHardDropsEnabled: false,
  waterLayerWaterDrops: 0.76, waterLayerWaterDropsEnabled: false, waterLayerBubbling: 0.62, waterLayerBubblingEnabled: true,
  waterHardDropRate: 1.42, waterHardDropLPF: 14800, waterWaterDropRate: 1.17, waterWaterDropLPF: 6200,
  waterChannelsMorph: 0.78, waterChannelsSpeed: 0.73,
};

const INSECTS_A: StatePatch = {
  insectsMasterEnabled: true, insectsEnabled: true, insectsEngine: 1, insectsDensity: 0.31, insectsTemperature: 0.24,
  insectsDistance: 0.17, insectsProximity: 0.42, insectsAntiphony: 0.28, insectsClickRate: 0.36, insectsMotion: 0.44, insectsLevel: 0.52,
  insects2Enabled: true, insects2Engine: 3, insects2Density: 0.47, insects2Temperature: 0.33, insects2Distance: 0.27,
  insects2Proximity: 0.38, insects2Antiphony: 0.35, insects2ClickRate: 0.51, insects2Motion: 0.59, insects2Level: 0.42,
};

const INSECTS_B: StatePatch = {
  insectsMasterEnabled: true, insectsEnabled: false, insectsEngine: 5, insectsDensity: 0.79, insectsTemperature: 0.72,
  insectsDistance: 0.68, insectsProximity: 0.81, insectsAntiphony: 0.74, insectsClickRate: 0.63, insectsMotion: 0.69, insectsLevel: 0.71,
  insects2Enabled: false, insects2Engine: 6, insects2Density: 0.82, insects2Temperature: 0.67, insects2Distance: 0.76,
  insects2Proximity: 0.73, insects2Antiphony: 0.66, insects2ClickRate: 0.77, insects2Motion: 0.84, insects2Level: 0.63,
};

const GRANULAR_A: StatePatch = {
  granularEnabled: true, granularFreeze: true, granularFeedback: 0.24, granularFeedbackLPF: 5200, granularBufferSeconds: 8,
  granularQuality: 'eco', granularMaxGrains: 24, granularShape: 'sawUp', granularDiffusion: 0.32,
  granularV1Enabled: true, granularV1Mode: 'clean', granularV1Slice: 3, granularV1Speed: 0.72, granularV1Pitch: -5, granularV1Density: 19, granularV1Gain: 0.61,
};

const GRANULAR_B: StatePatch = {
  granularEnabled: true, granularFreeze: false, granularFeedback: 0.71, granularFeedbackLPF: 10800, granularBufferSeconds: 24,
  granularQuality: 'hq', granularMaxGrains: 56, granularShape: 'square', granularDiffusion: 0.78,
  granularV1Enabled: false, granularV1Mode: 'granular', granularV1Slice: 11, granularV1Speed: 2.1, granularV1Pitch: 7, granularV1Density: 43, granularV1Gain: 0.83,
};

const ROUTING_A: StatePatch = {
  masterVolume: 0.43, synthLevel: 0.34, pad2Level: 0.39, delayAEnabled: true, reverbEnabled: true, granularEnabled: true,
  fxRoutingGraph: { version: 1, edges: [{ from: 'delayA', to: 'reverb', amount: 0.19 }, { from: 'granular', to: 'reverb', amount: 0.12 }], dynamicsBuses: { delayA: 1, reverb: 2 } },
};

const ROUTING_B: StatePatch = {
  masterVolume: 0.92, synthLevel: 0.81, pad2Level: 0.76, delayAEnabled: true, reverbEnabled: true, granularEnabled: true,
  fxRoutingGraph: { version: 1, edges: [{ from: 'delayA', to: 'reverb', amount: 0.73 }, { from: 'granular', to: 'reverb', amount: 0.64 }], dynamicsBuses: { delayA: 3, reverb: 1 } },
};

const DOMAIN_ROWS: DomainRow[] = [
  {
    name: 'pad1',
    a: { padEnabled: true, padPresetA: 'soft_pluck', padPresetB: 'buchla_pluck', padMorph: 0.17, padOscMix: 0.24, padDistance: 0.18 },
    b: { padEnabled: true, padPresetA: 'buchla_pluck', padPresetB: 'saturated_drift', padMorph: 0.83, padOscMix: 0.76, padDistance: 0.67 },
  },
  {
    name: 'pad2',
    a: { pad2Enabled: true, pad2PresetA: 'soft_pluck', pad2PresetB: 'buchla_pluck', pad2Morph: 0.21, pad2OscMix: 0.31, pad2Distance: 0.14 },
    b: { pad2Enabled: true, pad2PresetA: 'buchla_pluck', pad2PresetB: 'saturated_drift', pad2Morph: 0.79, pad2OscMix: 0.69, pad2Distance: 0.73 },
  },
  ...DRUM_ROWS,
  {
    name: 'sample1 (piano asset-backed)',
    a: { pianoEnabled: true, pianoLevel: 0.62, sample1Enabled: true, sample1LibraryKey: 'piano', sample1Level: 0.74, sample1AttackMs: 8, sample1ReleaseMs: 220, sample1Distance: 0.12 },
    b: { pianoEnabled: false, pianoLevel: 0.31, sample1Enabled: true, sample1LibraryKey: 'pneuma-eleni-teaser', sample1Role: 'drone', sample1Articulation: 'drone', sample1Level: 1.18, sample1AttackMs: 47, sample1ReleaseMs: 640, sample1Distance: 0.71 },
  },
  {
    name: 'sample2',
    a: { sample2Enabled: true, sample2LibraryKey: 'soft-string-spurs', sample2Role: 'sustain', sample2Articulation: 'sustain', sample2Level: 0.58, sample2AttackMs: 18, sample2ReleaseMs: 280 },
    b: { sample2Enabled: true, sample2LibraryKey: 'array-mbira', sample2Role: 'strum', sample2Articulation: 'direct-strum', sample2Level: 1.24, sample2AttackMs: 66, sample2ReleaseMs: 910 },
  },
  { name: 'Nature', a: NATURE_A, b: NATURE_B },
  { name: 'Water', a: WATER_A, b: WATER_B },
  { name: 'Insects', a: INSECTS_A, b: INSECTS_B },
  {
    name: 'Reverb',
    a: { reverbEnabled: true, reverbType: 'hall', reverbDecay: 0.27, reverbSize: 2.2, reverbDiffusion: 0.32, reverbModulation: 0.21, predelay: 22, damping: 0.41, width: 0.63, reverbShimmer: 0.18, reverbBloom: -0.21 },
    b: { reverbEnabled: true, reverbType: 'dattorroPlate', reverbDecay: 0.81, reverbSize: 7.4, reverbDiffusion: 0.74, reverbModulation: 0.67, predelay: 79, damping: 0.18, width: 0.91, reverbShimmer: 0.62, reverbBloom: 0.38 },
  },
  {
    name: 'Delay A',
    a: { delayAEnabled: true, drumDelayEnabled: true, drumDelayNoteL: '1/4', drumDelayNoteR: '1/8', drumDelayFeedback: 0.23, drumDelayMix: 0.31, drumDelayFilter: 0.28, delayAFilterType: 'bandpass', delayAPingPong: true },
    b: { delayAEnabled: true, drumDelayEnabled: true, drumDelayNoteL: '1/8d', drumDelayNoteR: '1/2', drumDelayFeedback: 0.71, drumDelayMix: 0.69, drumDelayFilter: 0.82, delayAFilterType: 'highpass', delayAPingPong: false },
  },
  {
    name: 'Delay B',
    a: { granularDelayEnabled: true, granularDelayActivity: 0.22, granularDelayRepeats: 0.18, granularDelayTime: '1/8', granularDelayFilter: 0.32, granularDelayVibrato: 0.17, granularDelayMix: 0.41, delayBAlgorithm: 'clockedSpace', delayBPattern: 'golden' },
    b: { granularDelayEnabled: true, granularDelayActivity: 0.79, granularDelayRepeats: 0.67, granularDelayTime: '1/2d', granularDelayFilter: 0.83, granularDelayVibrato: 0.62, granularDelayMix: 0.78, delayBAlgorithm: 'tapeHeads', delayBTapeSpacing: 'golden', delayBPattern: 'mirror', delayBWarp: 'pitchDrift' },
  },
  { name: 'Granular', a: GRANULAR_A, b: GRANULAR_B },
  {
    name: 'Degrade',
    a: { degradeEnabled: true, degradeLevel: 0.43, driftEnabled: true, driftMix: 0.37, erosionEnabled: false, degradeHp: 0.18, degradeLp: 0.76, degradePad1Send: 0.42 },
    b: { degradeEnabled: true, degradeLevel: 0.86, driftEnabled: false, driftMix: 0.71, erosionEnabled: true, degradeHp: 0.63, degradeLp: 0.34, degradePad1Send: 0.77 },
  },
  {
    name: 'Spectral Freeze',
    a: { spectralFreezeEnabled: true, spectralFreezeActive: true, spectralFreezeMode: 'solid', spectralFreezeMix: 0.31, spectralFreezeCaptureSerial: 7, spectralFreezeStretchSpeed: 0.22, spectralFreezePosition: 0.18, spectralFreezeDiffusion: 0.37 },
    b: { spectralFreezeEnabled: true, spectralFreezeActive: true, spectralFreezeMode: 'livingStretch', spectralFreezeMix: 0.76, spectralFreezeCaptureSerial: 19, spectralFreezeStretchSpeed: 0.81, spectralFreezePosition: 0.73, spectralFreezeDiffusion: 0.69 },
  },
  {
    name: 'Dynamics',
    a: { dynamicsEnabled: true, dynamicsSaturationEnabled: true, dynamicsSaturationMode: 'tape', dynamicsSaturationDrive: 0.27, dynamicsSaturationTone: 0.34, dynamicsSaturationBias: 0.42, endCompEnabled: true, endCompThreshold: -29, endCompRatio: 3.2, endCompMix: 0.48 },
    b: { dynamicsEnabled: true, dynamicsSaturationEnabled: true, dynamicsSaturationMode: 'fold', dynamicsSaturationDrive: 0.74, dynamicsSaturationTone: 0.76, dynamicsSaturationBias: 0.63, endCompEnabled: true, endCompThreshold: -11, endCompRatio: 8.1, endCompMix: 0.83 },
  },
  { name: 'routing/mixer', a: ROUTING_A, b: ROUTING_B },
  {
    name: 'harmony',
    a: { rootNote: 2, tension: 0.21, voicingSpread: 0.26, detune: 5, harmonyMorphPercent: 17 },
    b: { rootNote: 9, tension: 0.79, voicingSpread: 0.82, detune: 31, harmonyMorphPercent: 83 },
  },
  {
    name: 'transport',
    a: { sequencerMasterBPM: 88, transportBarsPerPhrase: 3, transportBeatsPerBar: 3, transportPrimaryClock: 'bpm' },
    b: { sequencerMasterBPM: 176, transportBarsPerPhrase: 7, transportBeatsPerBar: 5, transportPrimaryClock: 'decoupled' },
  },
  {
    name: 'synth sequencer',
    a: { synthEuclideanMasterEnabled: true, synthEuclideanTempo: 0.72, synthEuclid1Enabled: true, synthEuclid1Steps: 7, synthEuclid1Hits: 3, synthEuclid1Rotation: 2, synthEuclid1NoteMin: 52, synthEuclid1NoteMax: 68, synthEuclid1Level: 0.47, synthEuclid1Probability: 0.63 },
    b: { synthEuclideanMasterEnabled: true, synthEuclideanTempo: 1.84, synthEuclid1Enabled: true, synthEuclid1Steps: 13, synthEuclid1Hits: 9, synthEuclid1Rotation: 8, synthEuclid1NoteMin: 67, synthEuclid1NoteMax: 88, synthEuclid1Level: 0.86, synthEuclid1Probability: 0.29 },
  },
  {
    name: 'drum sequencer',
    a: { drumEuclidMasterEnabled: true, drumEuclidTempo: 0.68, drumEuclid1Enabled: true, drumEuclid1Steps: 5, drumEuclid1Hits: 2, drumEuclid1Rotation: 1, drumEuclid1TargetKick: true, drumEuclid1TargetSub: false, drumEuclid1Level: 0.44, drumEuclid1Probability: 0.58 },
    b: { drumEuclidMasterEnabled: true, drumEuclidTempo: 1.73, drumEuclid1Enabled: true, drumEuclid1Steps: 11, drumEuclid1Hits: 7, drumEuclid1Rotation: 6, drumEuclid1TargetKick: false, drumEuclid1TargetSub: true, drumEuclid1Level: 0.89, drumEuclid1Probability: 0.31 },
  },
];

const CASES = [
  { name: 'A-only', select: (row: DomainRow) => ({ a: row.a, b: {} }) },
  { name: 'B-only', select: (row: DomainRow) => ({ a: {}, b: row.b }) },
  { name: 'both-different', select: (row: DomainRow) => ({ a: row.a, b: row.b }) },
] as const;

test('non-Lead Product endpoint edits survive encoded snapshot morph round trips', () => {
  // Compare the encoded Product Core snapshot, not SliderState. This covers
  // native DSP/runtime fields while intentionally omitting USER_PREFERENCE_KEYS
  // (`reverbQuality`) and the four fields preserved by
  // preserveRunningSimpleSequencers (`synthChordGeneratorEnabled`,
  // `synthChordGeneratorSource`, `leadRandomEnabled`, `leadRandomSource`).
  for (const row of DOMAIN_ROWS) {
    const base = { ...DEFAULT_STATE } as SliderState;
    const unedited = encoded(base);
    for (const endpointCase of CASES) {
      const { a: aPatch, b: bPatch } = endpointCase.select(row);
      const scene = {
        a: captureEndpoint(`${row.name} A`, base, aPatch),
        b: captureEndpoint(`${row.name} B`, base, bPatch),
      };
      const directA = encoded(withPatch(aPatch));
      const directB = encoded(withPatch(bPatch));
      if (Object.keys(aPatch).length > 0) {
        assert.notDeepEqual(directA, unedited, `${row.name} ${endpointCase.name} A patch must reach Product Core`);
      }
      if (Object.keys(bPatch).length > 0) {
        assert.notDeepEqual(directB, unedited, `${row.name} ${endpointCase.name} B patch must reach Product Core`);
      }

      const returnA = encoded(followEndpoints(scene, ['a', 'b', 'a']));
      const returnB = encoded(followEndpoints(scene, ['b', 'a', 'b']));
      assertEncodedEqual(directA, returnA, `${row.name} ${endpointCase.name} A→B→A`);
      assertEncodedEqual(directB, returnB, `${row.name} ${endpointCase.name} B→A→B`);
    }
  }
});
