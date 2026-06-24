import assert from 'node:assert/strict';
import { createCoreProductHostHarmonySnapshot } from './CoreProductHostHarmonyState';
import {
  createCoreProductChordGeneratorSchedule,
  createCoreProductChordSequencerSchedule,
} from './coreProductArrangementPadChord';
import { arrangementRestartKey } from './coreProductArrangementVoiceMapping';
import { CoreProductArrangementScheduler } from './coreProductArrangementScheduler';
import { createHarmonyState } from './harmony';
import { PRODUCT_HARMONY_SCALE_IDS } from './coreProductHarmonyScaleIds';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import { createProductArpHarmonyContext } from './productArpeggiator';
import { createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange, SCALE_FAMILIES, selectScaleFamily } from './scales';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_SOURCE_IDS, KESSHO_PRODUCT_SOURCE_PRESET_IDS } from './generated/kesshoProductSchema';
import { DEFAULT_GAMELAN, DEFAULT_SOFT_RHODES } from './lead4opfm';
import { applyPadPresetMorphParamsToState } from './padPresets';
import { drumPitchUiValuesToEngineOffsets } from '../ui/sequencer/drumPitchSequencer';
import { reactiveVisualizerRootPitchClass } from '../ui/visualizer/reactiveVisualizerHarmony';
import { DEFAULT_STATE } from '../ui/state';
import {
  HARMONY_SEQUENCE_STEP_COUNT,
  HARMONY_SLOT_COUNT,
  commitBaselineMap,
  generateHarmonySlotsAndSequence,
  resolveHarmonyIntentToNotePool,
  resolveProductHarmonyState,
} from './CoreProductHarmonyControl';

function assertNoWebExactPatchFields(source: unknown, label: string): void {
  assert(source && typeof source === 'object', `${label} source should exist`);
  const shape = source as Record<string, unknown>;
  for (const key of [
    'exactPadParamCount',
    'exactPadParams',
    'exactLeadParamCount',
    'exactLeadParams',
    'exactDrumParamCount',
    'exactDrumParams',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(shape, key), false, `${label} should not expose ${key}`);
  }
}

function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

for (const family of SCALE_FAMILIES) {
  const expectedScaleId = PRODUCT_HARMONY_SCALE_IDS.get(family.name);
  assert.equal(typeof expectedScaleId, 'number', `missing Product scale ID for ${family.name}`);
  const snapshot = createCoreProductSnapshot({
    scaleMode: 'manual',
    manualScale: family.name,
    tension: family.tensionValue,
    rootNote: 4,
  });
  assert.equal(snapshot.harmony.scaleId, expectedScaleId, `manual ${family.name} Product scale ID mismatch`);

  const webHarmony = createHarmonyState(
    'manual-scale-parity',
    family.tensionValue,
    32,
    0.5,
    0,
    'manual',
    family.name,
    4,
  );
  assert.equal(webHarmony.scaleFamily.name, family.name, `web manual ${family.name} scale mismatch`);
  assert.equal(pitchClass(snapshot.harmony.rootMidi), webHarmony.effectiveRoot, `manual ${family.name} root pitch-class mismatch`);
  const webScaleNotes = getScaleNotesInRange(webHarmony.scaleFamily, 48, 84, webHarmony.effectiveRoot);
  assert(webScaleNotes.length > 0, `web manual ${family.name} should expose sequencer notes in range`);
  for (const note of webHarmony.currentChord.midiNotes) {
    assert(
      family.intervals.includes((pitchClass(note) - webHarmony.effectiveRoot + 12) % 12),
      `web manual ${family.name} chord note left selected scale`,
    );
  }
}

for (const tension of [0, 0.08, 0.18, 0.28, 0.38, 0.48, 0.55, 0.65, 0.75, 0.88, 0.95]) {
  const seedWindow = 'hour';
  const selected = selectScaleFamily(createRng(`${getUtcBucket(seedWindow)}|E_ROOT`), tension);
  const expectedScaleId = PRODUCT_HARMONY_SCALE_IDS.get(selected.name);
  const snapshot = createCoreProductSnapshot({
    scaleMode: 'auto',
    seedWindow,
    tension,
    rootNote: 4,
  });
  assert.equal(snapshot.harmony.scaleId, expectedScaleId, `auto ${selected.name} Product scale ID mismatch`);
  assert.equal(
    createProductArpHarmonyContext({ scaleMode: 'auto', seedWindow, tension, rootNote: 4 }).scaleId,
    expectedScaleId,
    `auto ${selected.name} Product arp scale ID mismatch`,
  );
  const webHarmony = createHarmonyState(
    `${getUtcBucket(seedWindow)}|E_ROOT`,
    tension,
    32,
    0.5,
    0,
    'auto',
    'Major (Ionian)',
    4,
  );
  assert.equal(webHarmony.scaleFamily.name, selected.name, `auto ${selected.name} web/Product scale selection mismatch`);
  assert.equal(pitchClass(snapshot.harmony.rootMidi), webHarmony.effectiveRoot, `auto ${selected.name} root pitch-class mismatch`);
}

const productHostManualHarmony = createCoreProductHostHarmonySnapshot({
  scaleMode: 'manual',
  manualScale: 'Lydian',
  tension: 0.18,
  rootNote: 5,
  chordRate: 32,
  voicingSpread: 0.5,
  detune: 0,
  seedWindow: 'hour',
});
assert.equal(productHostManualHarmony.harmonyState?.scaleFamily.name, 'Lydian', 'Product host UI harmony should expose manual web scale');
assert.equal(productHostManualHarmony.harmonyState?.effectiveRoot, 5, 'Product host UI harmony should expose manual root');
assert(productHostManualHarmony.currentBucket.length > 0, 'Product host UI harmony should expose seed bucket');
assert(productHostManualHarmony.currentSeed > 0, 'Product host UI harmony should expose deterministic seed');

const productHostTelemetryHarmony = createCoreProductHostHarmonySnapshot({
  scaleMode: 'auto',
  tension: 0.95,
  rootNote: 4,
  chordRate: 32,
  voicingSpread: 0.5,
  detune: 0,
  seedWindow: 'hour',
}, {
  schemaHash: 1,
  transportRunning: true,
  activeSources: 0,
  activeVoices: 0,
  activeAssets: 0,
  sequencerEventCount: 0,
  controlQueueDepth: 0,
  assetMissingCount: 0,
  lastErrorCode: 0,
  harmonyRootMidi: 67,
  harmonyScaleId: 11,
  harmonyTension: 0.95,
  harmonyChordDegree: 3,
  harmonyChordMidi: [67, 68, 71, 72],
});
assert.equal(productHostTelemetryHarmony.harmonyState?.scaleFamily.name, 'Phrygian Dominant', 'Product host UI harmony should follow Product telemetry scale');
assert.equal(productHostTelemetryHarmony.harmonyState?.effectiveRoot, 7, 'Product host UI harmony should follow Product telemetry root');
assert.deepEqual(productHostTelemetryHarmony.harmonyState?.currentChord.midiNotes, [67, 68, 71, 72], 'Product host UI harmony should expose Product telemetry chord notes');
assert.equal(productHostTelemetryHarmony.harmonyState?.currentDegree, 3, 'Product host UI harmony should expose Product telemetry chord degree');

const productHostTelemetryCofHarmony = createCoreProductHostHarmonySnapshot({
  scaleMode: 'manual',
  manualScale: 'Major (Ionian)',
  tension: 0.3,
  rootNote: 0,
  chordRate: 32,
  voicingSpread: 0.5,
  detune: 0,
  seedWindow: 'hour',
  cofDriftEnabled: true,
}, {
  schemaHash: 1,
  transportRunning: true,
  activeSources: 0,
  activeVoices: 0,
  activeAssets: 0,
  sequencerEventCount: 0,
  controlQueueDepth: 0,
  assetMissingCount: 0,
  lastErrorCode: 0,
  harmonyRootMidi: 67,
  harmonyScaleId: 1,
  harmonyTension: 0.3,
  harmonyChordDegree: 0,
  harmonyChordMidi: [67, 71, 74],
});
assert.equal(productHostTelemetryCofHarmony.harmonyState?.effectiveRoot, 7, 'Product host UI harmony should expose drifted telemetry root');
assert.equal(productHostTelemetryCofHarmony.harmonyState?.cof.homeRoot, 0, 'Product host UI harmony should preserve CoF home root');
assert.equal(productHostTelemetryCofHarmony.harmonyState?.cof.currentStep, 1, 'Product host UI harmony should infer CoF step from telemetry root');
const productArpTelemetryCofHarmony = createProductArpHarmonyContext({ rootNote: 0, scaleMode: 'manual', manualScale: 'Major (Ionian)', tension: 0.3 }, productHostTelemetryCofHarmony.harmonyState);
assert.equal(pitchClass(productArpTelemetryCofHarmony.rootMidi), 7, 'Product arp harmony context should follow drifted telemetry root');
assert.equal(productArpTelemetryCofHarmony.scaleId, 1, 'Product arp harmony context should follow live Product harmony scale');
assert.equal(
  reactiveVisualizerRootPitchClass({
    rootNote: 0,
    cofCurrentStep: 1,
    cofDriftEnabled: true,
    engineState: {
      isRunning: true,
      harmonyState: productHostTelemetryCofHarmony.harmonyState,
      cofCurrentStep: 1,
    },
  }),
  7,
  'Reactive visualizer root bus should follow live drifted harmony root without double-counting CoF step',
);
assert.equal(
  reactiveVisualizerRootPitchClass({
    rootNote: 0,
    cofCurrentStep: 1,
    cofDriftEnabled: true,
    engineState: {
      isRunning: true,
      harmonyState: null,
      cofCurrentStep: 1,
    },
  }),
  7,
  'Reactive visualizer fallback should convert CoF step through the circle of fifths instead of adding semitones',
);

const originalWindow = (globalThis as { window?: unknown }).window;
const postedHarmonyEvents: Array<{ paramId?: number; value?: number }> = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => postedHarmonyEvents.push({ paramId: event.paramId, value: event.value }),
    () => null,
  );
  scheduler.start({
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.3,
    chordRate: 32,
    voicingSpread: 0.5,
    detune: 0,
    seedWindow: 'hour',
    cofDriftEnabled: true,
    cofDriftRate: 1,
    cofDriftDirection: 'cw',
    cofDriftRange: 3,
  });
  (scheduler as unknown as { onHarmonyTick: (isPhraseBoundary: boolean) => void }).onHarmonyTick(true);
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}
const postedHarmonyRoots = postedHarmonyEvents
  .filter((event) => event.paramId === KESSHO_PRODUCT_PARAM_IDS.HarmonyRootMidi)
  .map((event) => event.value);
assert.deepEqual(postedHarmonyRoots.slice(0, 2), [60, 67], 'Product scheduler should post CoF drift into Product harmony root');
const postedHarmonyScales = postedHarmonyEvents
  .filter((event) => event.paramId === KESSHO_PRODUCT_PARAM_IDS.HarmonyScaleId)
  .map((event) => event.value);
assert.deepEqual(postedHarmonyScales.slice(0, 2), [1, 1], 'Product scheduler should post live harmony scale with CoF drift');

const postedVoicingSpreadPadEvents: Array<{ eventKind: number; targetId?: number; value?: number }> = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => postedVoicingSpreadPadEvents.push({ eventKind: event.eventKind, targetId: event.targetId, value: event.value }),
    () => null,
  );
  const state = {
    rootNote: 0,
    tension: 0.3,
    chordRate: 32,
    voicingSpread: 0.5,
    detune: 0,
    seedWindow: 'hour',
    synthChordSequencerEnabled: true,
    synthChordSequencerSource: 'pad1',
    synthChordSequencer: {
      ...DEFAULT_STATE.synthChordSequencer,
      subLanes: {
        ...DEFAULT_STATE.synthChordSequencer.subLanes,
        chord: {
          ...DEFAULT_STATE.synthChordSequencer.subLanes.chord,
          enabled: false,
        },
      },
    },
    padEnabled: true,
    pad2Enabled: false,
    synthVoiceMask: 1,
    waveSpread: 0,
  };
  scheduler.start(state);
  scheduler.update({ ...state, voicingSpread: 0.95 });
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}
assert.equal(
  postedVoicingSpreadPadEvents.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn && event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Pad1).length,
  2,
  'Product scheduler should regenerate pad chord immediately when voicing spread changes',
);

const postedMaskedPadEvents: Array<{ eventKind: number; targetId?: number; value?: number }> = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => postedMaskedPadEvents.push({ eventKind: event.eventKind, targetId: event.targetId, value: event.value }),
    () => null,
  );
  scheduler.start({
    rootNote: 0,
    tension: 0.3,
    chordRate: 32,
    voicingSpread: 0.5,
    detune: 0,
    seedWindow: 'hour',
    synthChordSequencerEnabled: true,
    synthChordSequencerSource: 'pad1',
    synthChordSequencer: {
      ...DEFAULT_STATE.synthChordSequencer,
      subLanes: {
        ...DEFAULT_STATE.synthChordSequencer.subLanes,
        chord: {
          ...DEFAULT_STATE.synthChordSequencer.subLanes.chord,
          enabled: false,
        },
      },
    },
    padEnabled: true,
    pad2Enabled: false,
    synthVoiceMask: 1 << 5,
    waveSpread: 0,
  });
  const harmonyState = (scheduler as unknown as { harmonyState?: { currentChord: { midiNotes: number[] } } }).harmonyState;
  const padEvent = postedMaskedPadEvents.find((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn && event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Pad1);
  assert.equal(
    padEvent?.value,
    harmonyState?.currentChord.midiNotes[0],
    'Product scheduler should match web-ts masked pad voice pitch assignment',
  );
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}

const selectedScaleDrumPitch = drumPitchUiValuesToEngineOffsets(
  [0, 2],
  { mode: 'semitones', root: 60, scale: 'Major' },
  60,
);
assert.deepEqual(selectedScaleDrumPitch, [0, 4], 'drum semitones mode should store scale-degree offsets from root and scale');
assert.deepEqual(
  drumPitchUiValuesToEngineOffsets([60, 64], { mode: 'notes', root: 60, scale: 'Major' }, 60),
  [0, 4],
  'drum notes mode should store fixed MIDI notes independent of root and scale',
);

const defaultSynthLaneCenters = [
  (DEFAULT_STATE.synthEuclid1NoteMin + DEFAULT_STATE.synthEuclid1NoteMax) * 0.5,
  (DEFAULT_STATE.synthEuclid2NoteMin + DEFAULT_STATE.synthEuclid2NoteMax) * 0.5,
  (DEFAULT_STATE.synthEuclid3NoteMin + DEFAULT_STATE.synthEuclid3NoteMax) * 0.5,
  (DEFAULT_STATE.synthEuclid4NoteMin + DEFAULT_STATE.synthEuclid4NoteMax) * 0.5,
];
const sparseSequencerSnapshot = createCoreProductSnapshot({});
assert.equal(
  sparseSequencerSnapshot.harmony.voicingMode,
  1,
  'Product synth sequencer should default to range-based voicing to match web pitch-off note selection',
);
assert.deepEqual(
  sparseSequencerSnapshot.synthLanes.slice(0, 4).map((lane) => lane.midiNote),
  defaultSynthLaneCenters,
  'Product synth sequencer fallback MIDI centers should follow web note-range defaults',
);
const partialRangeSnapshot = createCoreProductSnapshot({ synthEuclid1NoteMin: 60 });
assert.equal(
  partialRangeSnapshot.synthLanes[0]?.midiNote,
  (60 + DEFAULT_STATE.synthEuclid1NoteMax) * 0.5,
  'Product synth sequencer should combine sparse note-range state with the web default range',
);
const padSequencerGateSnapshot = createCoreProductSnapshot({
  synthEuclideanMasterEnabled: true,
  synthEuclid1Enabled: true,
  synthEuclid1Source: 'synth1',
  synthAttack: 0.35,
  synthDecay: 0.42,
  synthHold: 1.7,
});
assert.equal(
  padSequencerGateSnapshot.synthLanes[0]?.targetSourceId,
  KESSHO_PRODUCT_SOURCE_IDS.Pad1,
  'Product synth sequencer pad lane fixture should target Pad 1',
);
assert.equal(
  padSequencerGateSnapshot.synthLanes[0]?.holdSeconds,
  0.35 + 0.42 + 1.7,
  'Product synth sequencer pad gate should match chord ADSH timing',
);
const padSequencerHoldSliderSnapshot = createCoreProductSnapshot({
  synthEuclideanMasterEnabled: true,
  synthEuclid1Enabled: true,
  synthEuclid1Source: 'synth1',
  synthAttack: 0.35,
  synthDecay: 0.42,
  synthHold: 0.25,
});
assert.equal(
  padSequencerHoldSliderSnapshot.synthLanes[0]?.holdSeconds,
  0.35 + 0.42 + 0.25,
  'Product synth sequencer pad gate should follow the Hold slider instead of deriving hold from attack/decay',
);

const sequencerMacroSnapshot = createCoreProductSnapshot({
  synthEuclideanMasterEnabled: true,
  synthEuclid1Enabled: true,
  synthEuclid1Source: 'lead',
  lead1Morph: 0.87,
  lead1Distance: 0.34,
  drumEnabled: true,
  drumEuclidMasterEnabled: true,
  drumEuclid1Enabled: true,
  drumEuclid1TargetKick: true,
  drumKickMorph: 0.91,
  drumKickDistance: 0.62,
});
assert.equal(
  sequencerMacroSnapshot.synthLanes[0]?.morph,
  0.87,
  'Product synth sequencer lane should inherit source morph at the preset B endpoint',
);
assert.equal(
  sequencerMacroSnapshot.synthLanes[0]?.distance,
  0.34,
  'Product synth sequencer lane should inherit source distance unless a sub-lane overrides it',
);
assert.equal(
  sequencerMacroSnapshot.drumLanes[0]?.morph,
  0.91,
  'Product drum sequencer lane should inherit selected voice morph at the preset B endpoint',
);
assert.equal(
  sequencerMacroSnapshot.drumLanes[0]?.distance,
  0.62,
  'Product drum sequencer lane should inherit selected voice distance unless a sub-lane overrides it',
);

const hydratedLeadPresetSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1PresetAData: DEFAULT_SOFT_RHODES,
  lead1PresetBData: DEFAULT_GAMELAN,
  lead1Morph: 0.37,
});
const hydratedLeadSource = hydratedLeadPresetSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assert.equal(
  hydratedLeadSource?.sourcePresetAId,
  KESSHO_PRODUCT_SOURCE_PRESET_IDS.LeadSoftRhodes,
  'Product lead preset endpoint A should stay encoded when exact preset data is hydrated',
);
assert.equal(
  hydratedLeadSource?.sourcePresetBId,
  KESSHO_PRODUCT_SOURCE_PRESET_IDS.LeadGamelan,
  'Product lead preset endpoint B should stay encoded when exact preset data is hydrated',
);

const customAdsrLeadSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1Morph: 0.37,
  lead1UseCustomAdsr: true,
  lead1Attack: 0.047,
  lead1Decay: 0.91,
  lead1Sustain: 0.42,
  lead1Release: 3.25,
  lead1Distance: 0,
});
const customAdsrLeadSource = customAdsrLeadSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assertNoWebExactPatchFields(customAdsrLeadSource, 'Product lead custom ADSR');
assert.equal(customAdsrLeadSource?.leadEnvelopeOverrideEnabled, true, 'Product lead custom ADSR should set the structured override flag');
assert.equal(customAdsrLeadSource?.attackSeconds, 0.047, 'Product lead custom ADSR attack should use the source envelope field');
assert.equal(customAdsrLeadSource?.decaySeconds, 0.91, 'Product lead custom ADSR decay should use the source envelope field');
assert.equal(customAdsrLeadSource?.sustain, 0.42, 'Product lead custom ADSR sustain should use the source envelope field');
assert.equal(customAdsrLeadSource?.releaseSeconds, 3.25, 'Product lead custom ADSR release should use the source envelope field');

const algorithmOverrideLeadSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1Morph: 0.73,
  lead1AlgorithmMode: 'presetA',
  lead1Distance: 0,
});
const algorithmOverrideLeadSource = algorithmOverrideLeadSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assertNoWebExactPatchFields(algorithmOverrideLeadSource, 'Product lead algorithm override');
assert.equal(algorithmOverrideLeadSource?.leadAlgorithmPresetAEnabled, true, 'Product lead algorithm override should set the structured preset-A flag');

const customLeadPresetDataSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1PresetAData: {
    ...DEFAULT_SOFT_RHODES,
    params: { ...DEFAULT_SOFT_RHODES.params, gain: DEFAULT_SOFT_RHODES.params.gain + 0.11 },
  },
  lead1Morph: 0,
  lead1Distance: 0,
});
const customLeadPresetDataSource = customLeadPresetDataSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assertNoWebExactPatchFields(customLeadPresetDataSource, 'Product lead custom preset data');
assert.equal(customLeadPresetDataSource?.sourcePresetAId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.LeadSoftRhodes, 'Product lead custom preset data should keep a generated endpoint A anchor');
assert.equal(customLeadPresetDataSource?.sourcePresetBId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.LeadGamelan, 'Product lead custom preset data should keep a generated endpoint B anchor');
assert.ok((customLeadPresetDataSource?.leadOverrideCount ?? 0) > 0, 'Product lead custom preset data should serialize at least one sparse override');
const customLeadGainOverrideSlot = customLeadPresetDataSource?.leadOverrideIndices
  .slice(0, customLeadPresetDataSource.leadOverrideCount)
  .indexOf(62) ?? -1;
assert.ok(customLeadGainOverrideSlot >= 0, 'Product lead custom gain should target the generated gain param index');
assert.ok(Number.isFinite(customLeadPresetDataSource?.leadOverrideValues[customLeadGainOverrideSlot]), 'Product lead sparse override should carry a finite value');

const customLeadUnknownKeySnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'runtime-user-lead',
  lead1PresetAData: {
    ...DEFAULT_SOFT_RHODES,
    id: 'runtime-user-lead',
    params: { ...DEFAULT_SOFT_RHODES.params, gain: DEFAULT_SOFT_RHODES.params.gain + 0.17 },
  },
  lead1Morph: 0,
  lead1Distance: 0,
});
const customLeadUnknownKeySource = customLeadUnknownKeySnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assertNoWebExactPatchFields(customLeadUnknownKeySource, 'Product lead custom preset data with a user key');
assert.equal(customLeadUnknownKeySource?.sourcePresetAId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.LeadSoftRhodes, 'Product lead custom preset data with a user key should anchor endpoint A to the slot default');
assert.equal(customLeadUnknownKeySource?.sourcePresetBId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.LeadGamelan, 'Product lead custom preset data with a missing B key should use the slot default endpoint');
assert.ok((customLeadUnknownKeySource?.leadOverrideCount ?? 0) > 0, 'Product lead custom preset data with a user key should serialize sparse overrides');

const invalidLeadEndpointSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'runtime-user-lead',
  lead1PresetB: 'gamelan',
  lead1Morph: 0,
  lead1Distance: 0,
});
const invalidLeadEndpointSource = invalidLeadEndpointSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assert.equal(invalidLeadEndpointSource?.sourcePresetAId, 0, 'Product lead explicit unknown endpoint without custom data should serialize as invalid');
assertNoWebExactPatchFields(invalidLeadEndpointSource, 'Product lead explicit unknown endpoint');
assert.equal(invalidLeadEndpointSource?.leadOverrideCount, 0, 'Product lead explicit unknown endpoint should not be masked by sparse Lead overrides');

const distanceLeadSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1Morph: 0.41,
  lead1Distance: 0.67,
});
const distanceLeadSource = distanceLeadSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assertNoWebExactPatchFields(distanceLeadSource, 'Product lead distance macro');

const customAdsrDistanceLeadSnapshot = createCoreProductSnapshot({
  leadEnabled: true,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1Morph: 0.29,
  lead1UseCustomAdsr: true,
  lead1Attack: 0.023,
  lead1Decay: 1.12,
  lead1Sustain: 0.51,
  lead1Release: 2.7,
  lead1Distance: 0.58,
});
const customAdsrDistanceLeadSource = customAdsrDistanceLeadSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Lead1);
assertNoWebExactPatchFields(customAdsrDistanceLeadSource, 'Product lead custom ADSR plus distance');
assert.equal(customAdsrDistanceLeadSource?.leadEnvelopeOverrideEnabled, true, 'Product lead custom ADSR plus distance should keep the structured envelope flag');

const distancePadSnapshot = createCoreProductSnapshot({
  padEnabled: true,
  padPresetA: 'soft_pluck',
  padPresetB: 'buchla_pluck',
  padMorph: 0.43,
  padDistance: 0.72,
});
const distancePadSource = distancePadSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1);
assertNoWebExactPatchFields(distancePadSource, 'Product pad distance macro');

const fullDefaultPadPresetSnapshot = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  padEnabled: true,
  padPresetA: 'soft_pluck',
  padPresetB: 'buchla_pluck',
  padMorph: 0.43,
});
const fullDefaultPadPresetSource = fullDefaultPadPresetSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1);
assertNoWebExactPatchFields(fullDefaultPadPresetSource, 'Product pad full default state cache');

const staleSoftPluckCacheBuchlaSnapshot = createCoreProductSnapshot({
  ...applyPadPresetMorphParamsToState({
    ...DEFAULT_STATE,
    padEnabled: true,
    padPresetA: 'soft_pluck',
    padPresetB: 'soft_pluck',
    padMorph: 0,
  }),
  padPresetA: 'buchla_pluck',
  padPresetB: 'buchla_pluck',
  padMorph: 0,
});
const staleSoftPluckCacheBuchlaSource = staleSoftPluckCacheBuchlaSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1);
assert.equal(staleSoftPluckCacheBuchlaSource?.sourcePresetAId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.PadBuchlaPluck, 'Product pad stale cache test should select the Buchla endpoint');
assertNoWebExactPatchFields(staleSoftPluckCacheBuchlaSource, 'Product pad stale generated preset cache');
assert.equal(staleSoftPluckCacheBuchlaSource?.padOverrideCount, 0, 'Product pad stale generated preset cache should not become sparse overrides over Buchla');

const customFullDefaultPadPatchSnapshot = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  padEnabled: true,
  padPresetA: 'soft_pluck',
  padPresetB: 'buchla_pluck',
  padMorph: 0.43,
  hardness: DEFAULT_STATE.hardness + 0.11,
});
const customFullDefaultPadPatchSource = customFullDefaultPadPatchSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1);
assertNoWebExactPatchFields(customFullDefaultPadPatchSource, 'Product pad non-default custom controls');
assert.ok((customFullDefaultPadPatchSource?.padOverrideCount ?? 0) > 0, 'Product pad custom controls should serialize at least one sparse override');
const customFullDefaultPadHardnessOverrideSlot = customFullDefaultPadPatchSource?.padOverrideIndices
  .slice(0, customFullDefaultPadPatchSource.padOverrideCount)
  .indexOf(15) ?? -1;
assert.ok(customFullDefaultPadHardnessOverrideSlot >= 0, 'Product pad hardness custom control should target the generated hardness param index');
assert.ok(Number.isFinite(customFullDefaultPadPatchSource?.padOverrideValues[customFullDefaultPadHardnessOverrideSlot]), 'Product pad sparse override should carry a finite value');

const drumSourceFieldSnapshot = createCoreProductSnapshot({
  drumEnabled: true,
  drumLevel: 0.72,
  drumReverbSend: 0.34,
});
const drumSourceFieldSource = drumSourceFieldSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Drum);
assertNoWebExactPatchFields(drumSourceFieldSource, 'Product drum level and reverb send');
assert.equal(drumSourceFieldSource?.level, 0.72, 'Product drum level should stay in the canonical source level field');
assert.equal(drumSourceFieldSource?.reverbSend, 0.34, 'Product drum reverb should stay in the canonical source send field');

const fullDefaultDrumSourceFieldSnapshot = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  drumEnabled: true,
  drumLevel: 0.72,
  drumReverbSend: 0.34,
});
const fullDefaultDrumSourceFieldSource = fullDefaultDrumSourceFieldSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Drum);
assertNoWebExactPatchFields(fullDefaultDrumSourceFieldSource, 'Product drum full default state');
assert.equal(fullDefaultDrumSourceFieldSource?.level, 0.72, 'Product drum full default state should keep level in the canonical source field');
assert.equal(fullDefaultDrumSourceFieldSource?.reverbSend, 0.34, 'Product drum full default state should keep reverb in the canonical source field');

const fullDefaultDrumVoicePresetSnapshot = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  drumEnabled: true,
  drumSubPresetA: 'Classic Sub',
  drumSubPresetB: 'Soft Touch',
  drumSubMorph: 0.4,
});
const fullDefaultDrumVoicePresetSource = fullDefaultDrumVoicePresetSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Drum);
assertNoWebExactPatchFields(fullDefaultDrumVoicePresetSource, 'Product drum full default state cache');

const customFullDefaultDrumPatchSnapshot = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  drumEnabled: true,
  drumSubPresetA: 'Classic Sub',
  drumSubPresetB: 'Soft Touch',
  drumSubMorph: 0.4,
  drumSubFreq: DEFAULT_STATE.drumSubFreq + 7,
});
const customFullDefaultDrumPatchSource = customFullDefaultDrumPatchSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Drum);
assertNoWebExactPatchFields(customFullDefaultDrumPatchSource, 'Product drum non-default custom controls');
assert.ok((customFullDefaultDrumPatchSource?.drumOverrideCount ?? 0) > 0, 'Product drum custom controls should serialize at least one sparse override');
const customFullDefaultDrumFreqOverrideSlot = customFullDefaultDrumPatchSource?.drumOverrideIndices
  .slice(0, customFullDefaultDrumPatchSource.drumOverrideCount)
  .indexOf(0) ?? -1;
assert.ok(customFullDefaultDrumFreqOverrideSlot >= 0, 'Product drum custom sub frequency control should target the generated Drum param index');
assert.ok(Number.isFinite(customFullDefaultDrumPatchSource?.drumOverrideValues[customFullDefaultDrumFreqOverrideSlot]), 'Product drum sparse override should carry a finite value');

const customUnknownDrumVoicePresetSnapshot = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  drumEnabled: true,
  drumSubPresetA: 'My Custom Sub',
  drumSubPresetB: 'Soft Touch',
  drumSubMorph: 0,
  drumSubFreq: DEFAULT_STATE.drumSubFreq + 11,
});
const customUnknownDrumVoicePresetSource = customUnknownDrumVoicePresetSnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Drum);
assertNoWebExactPatchFields(customUnknownDrumVoicePresetSource, 'Product drum unknown voice preset');
assert.ok((customUnknownDrumVoicePresetSource?.drumVoicePresetAIds[0] ?? 0) > 0, 'Product drum unknown voice preset should fall back to a valid generated endpoint ID');
assert.ok((customUnknownDrumVoicePresetSource?.drumOverrideCount ?? 0) > 0, 'Product drum unknown voice preset should carry slider-derived sparse overrides');

const harmonyDefaultsSnapshot = createCoreProductSnapshot({ rootMidi: 60, tension: 0.35 });
assert.equal(harmonyDefaultsSnapshot.harmony.chordSlots.length, HARMONY_SLOT_COUNT, 'Product harmony should initialize 8 chord slots');
assert.equal(harmonyDefaultsSnapshot.harmony.chordSequence.length, HARMONY_SEQUENCE_STEP_COUNT, 'Product harmony should initialize 8 sequence steps');
assert.equal(harmonyDefaultsSnapshot.harmony.resolvedHarmonyFrame.activeSource, 'baseline', 'Product harmony baseline should remain default authority');
assert.equal(harmonyDefaultsSnapshot.harmony.manualControlAvailable, true, 'manual harmony control should be available at endpoint morph');
assert.ok(harmonyDefaultsSnapshot.harmony.notePoolCount > 0, 'Product harmony should expose a current note pool');
assert.ok(harmonyDefaultsSnapshot.harmony.nextNotePoolCount > 0, 'Product harmony should expose a next note pool');

const harmonyManualAtEndpoint = createCoreProductSnapshot({
  rootMidi: 60,
  tension: 0.35,
  manualHarmonyControl: {
    enabled: true,
    mode: 'control',
    strength: 'force',
    activeIntent: {
      source: 'manualControl',
      strength: 'force',
      rootMode: 'degree',
      degree: 3,
      rootNote: 0,
      quality: 'min7',
      extensions: [],
      inversion: 0,
      spread: 0.5,
      octave: 4,
      bassMode: 'off',
      bassNote: null,
      capturedMidiNotes: [],
      preserveCapturedVoicing: false,
    },
  },
});
assert.equal(harmonyManualAtEndpoint.harmony.resolvedHarmonyFrame.activeSource, 'manualControl', 'manual harmony control should win at endpoint morph');
assert.equal(harmonyManualAtEndpoint.harmony.controlStrength, 1, 'manual harmony force should pack as numeric strength');

const harmonyManualDuringMorph = createCoreProductSnapshot({
  rootMidi: 60,
  journeyEnabled: true,
  journeyMorphPhase: 0.42,
  manualHarmonyControl: {
    enabled: true,
    mode: 'control',
    activeIntent: {
      source: 'manualControl',
      strength: 'force',
      rootMode: 'degree',
      degree: 3,
      rootNote: 0,
      quality: 'min7',
      extensions: [],
      inversion: 0,
      spread: 0.5,
      octave: 4,
      bassMode: 'off',
      bassNote: null,
      capturedMidiNotes: [],
      preserveCapturedVoicing: false,
    },
  },
});
assert.equal(harmonyManualDuringMorph.harmony.manualControlAvailable, false, 'manual harmony control should be locked during morph');
assert.equal(harmonyManualDuringMorph.harmony.resolvedHarmonyFrame.activeSource, 'baseline', 'manual harmony control should not mutate active harmony during morph');

const slotTriggerIntent = {
  source: 'slot' as const,
  strength: 'force' as const,
  rootMode: 'degree' as const,
  degree: 4,
  rootNote: 0,
  quality: 'min7' as const,
  extensions: [],
  inversion: 0,
  spread: 0.5,
  octave: 4,
  bassMode: 'off' as const,
  bassNote: null,
  capturedMidiNotes: [],
  preserveCapturedVoicing: false,
};
const slotTriggerState = resolveProductHarmonyState({
  state: {
    manualHarmonyControl: {
      slotTriggerMode: true,
      activeSlotId: 2,
    },
    harmonyChordSlots: [{
      id: 2,
      name: 'Slot 3',
      locked: false,
      intent: slotTriggerIntent,
    }],
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
const expectedSlotTriggerPool = resolveHarmonyIntentToNotePool({
  intent: slotTriggerIntent,
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
});
assert.equal(slotTriggerState.resolvedHarmonyFrame.activeSource, 'slot', 'slot trigger should become active harmony at endpoint morph');
assert.equal(slotTriggerState.resolvedHarmonyFrame.activeSlotId, 2, 'slot trigger should preserve the active slot id');
assert.deepEqual(slotTriggerState.resolvedHarmonyFrame.currentNotePool, expectedSlotTriggerPool, 'slot trigger should resolve the selected slot note pool');
const harmonySlotTriggerSnapshot = createCoreProductSnapshot({
  rootMidi: 60,
  scaleMode: 'manual',
  manualScale: 'Major (Ionian)',
  tension: 0.35,
  manualHarmonyControl: {
    slotTriggerMode: true,
    activeSlotId: 2,
  },
  harmonyChordSlots: [{
    id: 2,
    name: 'Slot 3',
    locked: false,
    intent: slotTriggerIntent,
  }],
});
assert.equal(harmonySlotTriggerSnapshot.harmony.activeSource, 2, 'Product snapshot should encode slot trigger as active slot source');
assert.equal(harmonySlotTriggerSnapshot.harmony.controlMode, 3, 'Product snapshot should encode slot trigger as slot control mode');
assert.equal(harmonySlotTriggerSnapshot.harmony.activeSlotId, 2, 'Product snapshot should encode the triggered slot id');
assert.deepEqual(
  harmonySlotTriggerSnapshot.harmony.notePoolMidi.slice(0, harmonySlotTriggerSnapshot.harmony.notePoolCount),
  expectedSlotTriggerPool,
  'Product snapshot should carry the triggered slot note pool',
);

const slotTriggerDuringMorph = resolveProductHarmonyState({
  state: {
    harmonyMorphPercent: 50,
    manualHarmonyControl: {
      slotTriggerMode: true,
      activeSlotId: 2,
    },
    harmonyChordSlots: [{
      id: 2,
      name: 'Slot 3',
      locked: false,
      intent: slotTriggerIntent,
    }],
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(slotTriggerDuringMorph.resolvedHarmonyFrame.manualControlAvailable, false, 'slot trigger should be locked during preset morph');
assert.equal(slotTriggerDuringMorph.resolvedHarmonyFrame.activeSource, 'baseline', 'slot trigger should not mutate active harmony during preset morph');

const morphBankState = resolveProductHarmonyState({
  state: {
    harmonyMorphPercent: 50,
    harmonyChordSequenceEnabled: true,
    harmonyChordSequenceA: [{ id: 0, enabled: true, locked: false, mode: 'auto', degree: 1, quality: 'auto', intent: null, slotId: null, probability: 1 }],
    harmonyChordSequenceB: [{ id: 0, enabled: true, locked: false, mode: 'auto', degree: 5, quality: 'auto', intent: null, slotId: null, probability: 1 }],
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(morphBankState.chordSequence[0]?.degree, 5, 'Product harmony should select the Preset B sequence bank at 50% morph');

const generatedA = generateHarmonySlotsAndSequence(1234);
const generatedB = generateHarmonySlotsAndSequence(1234);
assert.deepEqual(generatedA, generatedB, 'harmony slot/sequence generation should be deterministic from seed');
const lockedSlot = { ...generatedA.slots[0]!, locked: true };
const lockedStep = { ...generatedA.sequence[0]!, locked: true };
const lockedGenerated = generateHarmonySlotsAndSequence(2222, {}, [lockedSlot], [lockedStep]);
assert.deepEqual(lockedGenerated.slots[0], lockedSlot, 'locked harmony slots should survive regeneration');
assert.deepEqual(lockedGenerated.sequence[0], lockedStep, 'locked harmony sequence steps should survive regeneration');

const committedBaseline = commitBaselineMap({ seed: 99, rootMidi: 60, scaleId: 1, tension: 0.9 });
assert.equal(committedBaseline.length, HARMONY_SEQUENCE_STEP_COUNT, 'Commit Baseline Map should write exactly 8 harmony steps');
assert.equal(committedBaseline.every((step) => step.quality === 'auto'), true, 'Commit Baseline Map should preserve tension-engine quality:auto steps');

const extendedHarmonyPool = resolveHarmonyIntentToNotePool({
  intent: {
    source: 'audition',
    strength: 'bias',
    rootMode: 'degree',
    degree: 0,
    rootNote: 0,
    quality: 'maj',
    extensions: ['six', 'nine'],
    inversion: 0,
    spread: 0.5,
    octave: 4,
    bassMode: 'off',
    bassNote: null,
    capturedMidiNotes: [],
    preserveCapturedVoicing: false,
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
});
assert.deepEqual(extendedHarmonyPool, [60, 64, 67, 69, 74], 'harmony extensions should appear in the resolved preview note pool');

const auditionState = resolveProductHarmonyState({
  state: {
    manualHarmonyControl: {
      enabled: true,
      mode: 'audition',
      auditionIntent: {
        source: 'audition',
        strength: 'force',
        rootMode: 'degree',
        degree: 4,
        rootNote: 0,
        quality: 'dom7',
        extensions: [],
        inversion: 0,
        spread: 0.5,
        octave: 4,
        bassMode: 'off',
        bassNote: null,
        capturedMidiNotes: [],
        preserveCapturedVoicing: false,
      },
    },
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(auditionState.resolvedHarmonyFrame.activeSource, 'baseline', 'audition should not mutate active resolved harmony');

{
  const harmonyState = createHarmonyState('chord-generator-seq5-regression', 0.3, 16, 0.5, 0, 'manual', 'Major (Ionian)', 0);
  const baseState = {
    ...DEFAULT_STATE,
    pianoEnabled: true,
    padEnabled: false,
    pad2Enabled: false,
    leadEnabled: false,
    lead2Enabled: false,
    rootNote: 0,
    scaleMode: 'manual' as const,
    manualScale: 'Major (Ionian)',
    chordRate: 4,
    phraseLength: 16,
    sequencerMasterBPM: 120,
    synthChordGeneratorSource: 'piano' as const,
    synthChordGeneratorVoiceCount: 2,
    synthChordSequencerSource: 'piano' as const,
    synthChordSequencerVoiceCount: 1,
    synthChordSequencerClockDivision: '1/8' as const,
  };
  const generatorSchedule = createCoreProductChordGeneratorSchedule({
    state: {
      ...baseState,
      synthChordGeneratorEnabled: true,
      synthChordSequencerEnabled: false,
    },
    harmonyState,
    rng: () => 0,
    anchors: null,
    nowWallSec: 0,
  });
  assert.equal(generatorSchedule.scheduledNotes.length, 2, 'Chord Generator should emit without Seq 5');

  const seq5Schedule = createCoreProductChordSequencerSchedule({
    state: {
      ...baseState,
      synthChordGeneratorEnabled: false,
      synthChordSequencerEnabled: true,
      synthChordSequencer: {
        ...DEFAULT_STATE.synthChordSequencer,
        stepCount: 4,
        steps: DEFAULT_STATE.synthChordSequencer.steps.map((step, index) => ({
          ...step,
          enabled: index === 0,
        })),
      },
    },
    harmonyState,
    rng: () => 0,
    anchors: null,
    nowWallSec: 0,
  });
  assert.equal(seq5Schedule.scheduledNotes.length, 1, 'Seq 5 should emit without Chord Generator');
  assert.equal(seq5Schedule.triggerIntervalSeconds, 0.25, 'Seq 5 should use sequencer BPM and clock division for step timing');
  assert.equal(seq5Schedule.phraseSeconds, 1, 'Seq 5 cycle length should be step interval times Seq 5 step count');

  const heldArpSchedule = createCoreProductChordSequencerSchedule({
    state: {
      ...baseState,
      synthChordSequencerEnabled: true,
      synthChordSequencer: {
        ...DEFAULT_STATE.synthChordSequencer,
        stepCount: 4,
        playbackMode: 'arp' as const,
        arp: {
          ...DEFAULT_STATE.synthChordSequencer.arp,
          speed: '1/16' as const,
          gate: 0.5,
          shape: 'custom' as const,
          patternLength: 4 as const,
          pattern: DEFAULT_STATE.synthChordSequencer.arp.pattern.map((step, index) => ({
            ...step,
            active: index < 4,
            tone: (index % 4) + 1,
            octave: 0 as const,
          })),
        },
        steps: DEFAULT_STATE.synthChordSequencer.steps.map((step, index) => ({
          ...step,
          enabled: index === 0,
          holdSteps: index === 0 ? 3 : 1,
        })),
      },
    },
    harmonyState,
    rng: () => 0,
    anchors: null,
    nowWallSec: 0,
  });
  assert(heldArpSchedule.scheduledNotes.length > seq5Schedule.scheduledNotes.length, 'Seq 5 holdSteps should extend arp pulses across multiple steps');

  const bothSchedules = [
    createCoreProductChordGeneratorSchedule({
      state: { ...baseState, synthChordGeneratorEnabled: true },
      harmonyState,
      rng: () => 0,
      anchors: null,
      nowWallSec: 0,
    }),
    createCoreProductChordSequencerSchedule({
      state: { ...baseState, synthChordSequencerEnabled: true },
      harmonyState,
      rng: () => 0,
      anchors: null,
      nowWallSec: 0,
    }),
  ];
  assert.equal(
    bothSchedules.reduce((count, schedule) => count + schedule.scheduledNotes.length, 0),
    3,
    'Chord Generator and Seq 5 schedules should both emit when enabled independently',
  );

  const restartKey = arrangementRestartKey({ ...baseState, synthChordSequencerEnabled: true });
  assert.equal(
    arrangementRestartKey({
      ...baseState,
      synthChordSequencerEnabled: false,
      synthChordSequencerSource: 'lead1' as const,
      synthChordSequencerVoiceCount: 4,
      synthChordSequencer: {
        ...DEFAULT_STATE.synthChordSequencer,
        stepCount: 4,
      },
    }),
    restartKey,
    'Seq 5 live edits should not reset arrangement transport anchors',
  );
}

console.log('Kessho Product harmony parity regression passed');
