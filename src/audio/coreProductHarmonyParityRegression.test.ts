import assert from 'node:assert/strict';
import { createCoreProductHostHarmonySnapshot } from './CoreProductHostHarmonyState';
import { CoreProductArrangementScheduler } from './reference/CoreProductArrangementSchedulerReference';
import { createHarmonyState } from './harmony';
import { PRODUCT_HARMONY_SCALE_IDS } from './coreProductHarmonyScaleIds';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import {
  createProductArpHarmonyContext,
  normalizeProductArpConfig,
  resolveProductArpMidiPattern,
  resolveProductArpPatternDetails,
  type ProductArpHarmonyContext,
} from './productArpeggiator';
import { createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange, SCALE_FAMILIES, selectScaleFamily } from './scales';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_SOURCE_IDS, KESSHO_PRODUCT_SOURCE_PRESET_IDS } from './generated/kesshoProductSchema';
import { DEFAULT_GAMELAN, DEFAULT_SOFT_RHODES } from './lead4opfm';
import { applyPadPresetMorphParamsToState, getPadPreset, upsertUserPadPreset } from './padPresets';
import { drumPitchUiValuesToEngineOffsets } from '../ui/sequencer/drumPitchSequencer';
import { reactiveVisualizerRootPitchClass } from '../ui/visualizer/reactiveVisualizerHarmony';
import { DEFAULT_STATE } from '../ui/state';
import {
  defaultHarmonyIntent,
  formatHarmonyIntentChordLabel,
  resolveHarmonyIntentToNotePool,
  resolveProductHarmonyState,
  type HarmonyChordAlteration,
  type HarmonyChordQuality,
} from './CoreProductHarmonyControl';
import { sampleDescriptorForSlotNote, samplePredictionState } from './product/host/CoreProductSampleAssetResolver';
import { normalizeChord } from './harmony/chord';
import {
  createCoreProductSynthSequencerLaneStepOverrideEvents,
  createCoreProductSynthSequencerStepOverrideEvents,
} from './product/ProductSequencerStepOverrideEvents';

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
  harmonyNotePoolMidi: [67, 68, 71, 72],
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
  harmonyNotePoolMidi: [67, 71, 74],
});
assert.equal(productHostTelemetryCofHarmony.harmonyState?.effectiveRoot, 7, 'Product host UI harmony should expose drifted telemetry root');
assert.equal(productHostTelemetryCofHarmony.harmonyState?.cof.homeRoot, 0, 'Product host UI harmony should preserve CoF home root');
assert.equal(productHostTelemetryCofHarmony.harmonyState?.cof.currentStep, 1, 'Product host UI harmony should infer CoF step from telemetry root');
const productArpTelemetryCofHarmony = createProductArpHarmonyContext({ rootNote: 0, scaleMode: 'manual', manualScale: 'Major (Ionian)', tension: 0.3 }, productHostTelemetryCofHarmony.harmonyState);
assert.equal(pitchClass(productArpTelemetryCofHarmony.rootMidi), 7, 'Product arp harmony context should follow drifted telemetry root');
assert.equal(productArpTelemetryCofHarmony.scaleId, 1, 'Product arp harmony context should follow live Product harmony scale');

function absoluteHarmonyIntent(options: {
  quality: HarmonyChordQuality;
  extensions?: string[];
  alterations?: HarmonyChordAlteration[];
}) {
  return {
    ...defaultHarmonyIntent('manualControl'),
    rootMode: 'absolute' as const,
    rootNote: 0,
    quality: options.quality,
    extensions: options.extensions ?? [],
    alterations: options.alterations ?? [],
  };
}

const harmonyVocabularyCases: Array<{
  label: string;
  quality: HarmonyChordQuality;
  extensions?: string[];
  alterations?: HarmonyChordAlteration[];
  expected: number[];
}> = [
  { label: 'Cmaj7', quality: 'maj7', expected: [60, 64, 67, 71] },
  { label: 'C9', quality: 'nine', expected: [60, 64, 67, 70, 74] },
  { label: 'Cm9', quality: 'min7', extensions: ['9'], expected: [60, 63, 67, 70, 74] },
  { label: 'Cmaj9', quality: 'maj7', extensions: ['9'], expected: [60, 64, 67, 71, 74] },
  { label: 'C6', quality: 'six', expected: [60, 64, 67, 69] },
  { label: 'C6/9', quality: 'sixNine', expected: [60, 64, 67, 69, 74] },
  { label: 'C7b9', quality: 'dom7', alterations: ['b9'], expected: [60, 64, 67, 70, 73] },
  { label: 'C7#9', quality: 'dom7', alterations: ['#9'], expected: [60, 64, 67, 70, 75] },
  { label: 'C7#11', quality: 'dom7', alterations: ['#11'], expected: [60, 64, 67, 70, 78] },
  { label: 'C13', quality: 'dom7', extensions: ['13'], expected: [60, 64, 67, 70, 74, 81] },
  { label: 'C7b13', quality: 'dom7', alterations: ['b13'], expected: [60, 64, 67, 70, 80] },
  { label: 'Cdim', quality: 'dim', expected: [60, 63, 66] },
  { label: 'Csus', quality: 'sus', expected: [60, 65, 67] },
  { label: 'Cquartal', quality: 'quartal', expected: [60, 65, 70, 75] },
  { label: 'Ccluster', quality: 'cluster', expected: [60, 61, 62, 64] },
];

for (const testCase of harmonyVocabularyCases) {
  assert.deepEqual(
    resolveHarmonyIntentToNotePool({
      intent: absoluteHarmonyIntent(testCase),
      rootMidi: 60,
      scaleId: 1,
      tension: 0.3,
    }),
    testCase.expected,
    `Harmony vocabulary should resolve ${testCase.label}`,
  );
}

assert.equal(
  formatHarmonyIntentChordLabel({
    ...absoluteHarmonyIntent({ quality: 'maj7' }),
    capturedMidiNotes: [64, 67, 71, 74],
    preserveCapturedVoicing: true,
  }, { rootMidi: 60, scaleId: 1 }),
  'Em7',
  'captured Harmony voicing labels should infer common chord names',
);

function productArpTestHarmony(notePoolMidi: number[]): ProductArpHarmonyContext {
  return {
    rootMidi: 60,
    scaleId: 1,
    tension: 0.3,
    notePoolMidi,
  };
}

function resolveEnabledArp(config: Record<string, unknown>, harmony: ProductArpHarmonyContext, runtimeTick = 0): number[] {
  const result = resolveProductArpMidiPattern({
    config: normalizeProductArpConfig({ enabled: true, ...config }),
    harmony,
    laneIndex: 0,
    runtimeTick,
  });
  assert(result, 'enabled Product arp should resolve a MIDI pattern');
  return result;
}

const legacyArp = normalizeProductArpConfig({
  enabled: true,
  direction: 'up',
  pulseCount: 5,
  pulseMask: 0xffff,
  tonePattern: [0, 2, 1, 3, 4],
});
assert.equal(legacyArp.length, 5, 'legacy Product arp pulseCount should normalize to arbitrary 1-16 length');
assert.equal(legacyArp.flow, 'up', 'legacy Product arp direction should normalize to flow');
assert.equal(legacyArp.pulseMask, 0xffff, 'Product arp pulse mask should preserve all 16 stored steps');
assert.deepEqual(legacyArp.contour.slice(0, 5), [0, 1, -1, 0, 0], 'legacy absolute tone pattern should migrate to traversal-relative contour');

const rememberedLengthArp = normalizeProductArpConfig({
  enabled: true,
  flow: 'up',
  length: 10,
  pulseMask: (1 << 10) | (1 << 11),
  contour: Array.from({ length: 16 }, () => 0),
});
const rememberedLength10Details = resolveProductArpPatternDetails({
  config: rememberedLengthArp,
  harmony: productArpTestHarmony([60, 62, 64]),
  laneIndex: 0,
});
const rememberedLength12Details = resolveProductArpPatternDetails({
  config: normalizeProductArpConfig({ ...rememberedLengthArp, length: 12 }),
  harmony: productArpTestHarmony([60, 62, 64]),
  laneIndex: 0,
});
assert.equal(rememberedLengthArp.pulseMask & (1 << 11), 1 << 11, 'Product arp should remember stored steps above the active length');
assert.equal(rememberedLength10Details?.length, 10, 'Product arp should only resolve the active length');
assert.equal(rememberedLength12Details?.[10]?.enabled, true, 'Product arp should restore remembered step 11 when length expands');
assert.equal(rememberedLength12Details?.[11]?.enabled, true, 'Product arp should restore remembered step 12 when length expands');

const arpOverrideEvents = createCoreProductSynthSequencerStepOverrideEvents({
  playArps: [
    {
      enabled: true,
      mode: 'arp',
      arp: {
        enabled: true,
        length: 4,
        rate: 1,
        pulseMask: 0b1111,
      },
      midiPattern: [60, 64, 67, 71],
    },
    { enabled: false, mode: 'arp', arp: { enabled: false, length: 4, rate: 1, pulseMask: 0 }, midiPattern: [] },
    { enabled: true, mode: 'chord', arp: { enabled: true, length: 4, rate: 1, pulseMask: 0b1111 }, midiPattern: [60, 64, 67, 71] },
    { enabled: false, mode: 'arp', arp: { enabled: false, length: 4, rate: 1, pulseMask: 0 }, midiPattern: [] },
  ],
});
assert.equal(
  arpOverrideEvents.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSynthArpConfig).length,
  4,
  'Product Play ARP should still send one native config event per visible lane',
);
assert.equal(
  arpOverrideEvents.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSynthArpStep).length,
  16,
  'Product Play ARP should only send native step events for active ARP lanes',
);
assert.equal(
  arpOverrideEvents.length,
  24,
  'an ARP-only commit should fit one bounded runtime batch and must not synthesize unrelated sequencer restore events',
);
const laneArpOverrideEvents = createCoreProductSynthSequencerLaneStepOverrideEvents(0, {
  playArps: [{
    enabled: true,
    mode: 'arp',
    arp: { enabled: true, length: 4, rate: 1, pulseMask: 0b1111 },
    midiPattern: [60, 64, 67, 71],
  }],
});
assert.equal(
  laneArpOverrideEvents.length,
  18,
  'a lane-scoped ARP commit must not clear or rebuild its sequencer step lane',
);
const contourHarmony = productArpTestHarmony([60, 62, 64, 67, 69]);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    length: 5,
    pulseMask: 0b11111,
    contour: [0, 2, -1, 0, 3],
    boundaryMode: 'fold',
  }, contourHarmony),
  [60, 67, 62, 67, 62],
  'Product arp should resolve as traversal flow plus relative pool contour',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'downUp',
    length: 5,
    pulseMask: 0b11111,
    contour: [0, 0, 0, 0, 0],
  }, productArpTestHarmony([60, 62, 64, 67])),
  [67, 64, 62, 60, 62],
  'Product arp down/up flow should generate underlying traversal before contour displacement',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    rate: 2,
    length: 4,
    pulseMask: 0b1111,
    contour: [0, 0, 0, 0],
  }, productArpTestHarmony([60, 62, 64, 67])),
  [60, 62, 64, 67],
  'Product arp rate 2x should not alter melodic traversal in the host pitch lane',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    rate: 0.5,
    length: 4,
    pulseMask: 0b1111,
    contour: [0, 0, 0, 0],
  }, productArpTestHarmony([60, 62, 64, 67])),
  [60, 62, 64, 67],
  'Product arp rate 1/2x should not alter melodic traversal in the host pitch lane',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    length: 1,
    pulseMask: 1,
    contour: [4],
    boundaryMode: 'fold',
  }, productArpTestHarmony([60, 62, 64])),
  [60],
  'Product arp fold boundary should fold contour overflow through the pitch pool',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    length: 1,
    pulseMask: 1,
    contour: [4],
    boundaryMode: 'wrap',
  }, productArpTestHarmony([60, 62, 64])),
  [62],
  'Product arp wrap boundary should wrap contour overflow through the pitch pool',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    length: 1,
    pulseMask: 1,
    contour: [4],
    boundaryMode: 'clamp',
  }, productArpTestHarmony([60, 62, 64])),
  [64],
  'Product arp clamp boundary should pin contour overflow to the pool edge',
);
assert.deepEqual(
  resolveEnabledArp({
    flow: 'up',
    length: 3,
    pulseMask: 0b111,
    contour: [1, -2, 12],
    contourMode: 'semitone',
  }, productArpTestHarmony([60, 64, 67])),
  [61, 58, 72],
  'Product arp semitone contour mode should apply signed chromatic moves from one stable base',
);
assert.deepEqual(
  resolveProductArpMidiPattern({
    config: normalizeProductArpConfig({
      enabled: true,
      flow: 'up',
      length: 3,
      pulseMask: 0b111,
      contour: [0, -2, 2],
      contourMode: 'semitone',
    }),
    harmony: productArpTestHarmony([60, 64, 67, 71]),
    laneIndex: 0,
    anchorMidi: 66,
  }),
  [67, 65, 69],
  'Product arp semitone mode should anchor to the nearest enabled pitch-lane note and preserve negative direction',
);
assert.deepEqual(
  resolveProductArpMidiPattern({
    config: normalizeProductArpConfig({
      enabled: true,
      flow: 'up',
      length: 3,
      pulseMask: 0b111,
      contour: [0, 0, 0],
      contourMode: 'pool',
    }),
    harmony: productArpTestHarmony([60, 64, 67, 71]),
    laneIndex: 0,
    anchorMidi: 66,
  }),
  [67, 71, 60],
  'Product arp pool traversal should start at the nearest enabled pitch-lane note',
);

const resetDetails = resolveProductArpPatternDetails({
  config: normalizeProductArpConfig({
    enabled: true,
    flow: 'up',
    length: 5,
    pulseMask: 0b11111,
    contour: [0, 0, 0, 0, 0],
    resetMask: 1 << 3,
  }),
  harmony: productArpTestHarmony([60, 62, 64, 67]),
  laneIndex: 0,
});
assert(resetDetails, 'enabled Product arp should resolve step details');
assert.deepEqual(
  resetDetails.map((step) => step.baseMidi),
  [60, 62, 64, 60, 62],
  'Product arp reset points should restart traversal from the reset step',
);
assert.equal(resetDetails[3]?.reset, true, 'Product arp resolved details should expose reset points for the editor');

const randomArpConfig = normalizeProductArpConfig({
  enabled: true,
  flow: 'randomLiveTone',
  length: 8,
  pulseMask: 0xff,
  contour: [0, 0, 0, 0, 0, 0, 0, 0],
});
const randomHarmony = productArpTestHarmony([60, 62, 64, 65, 67, 69, 71, 72]);
const randomTickA = resolveProductArpMidiPattern({ config: randomArpConfig, harmony: randomHarmony, laneIndex: 2, runtimeTick: 3 });
const randomTickARepeat = resolveProductArpMidiPattern({ config: randomArpConfig, harmony: randomHarmony, laneIndex: 2, runtimeTick: 3 });
assert.deepEqual(randomTickA, randomTickARepeat, 'Product arp random live flow should be deterministic for the same runtime tick');
assert(randomTickA?.every((midi) => randomHarmony.notePoolMidi.includes(midi)), 'Product arp random live flow should stay inside the resolved pitch pool');

const diceArpConfig = normalizeProductArpConfig({
  enabled: true,
  flow: 'diceHold',
  length: 8,
  pulseMask: 0xff,
  contour: [0, 0, 0, 0, 0, 0, 0, 0],
});
assert.deepEqual(
  resolveProductArpMidiPattern({ config: diceArpConfig, harmony: randomHarmony, laneIndex: 2, runtimeTick: 0 }),
  resolveProductArpMidiPattern({ config: diceArpConfig, harmony: randomHarmony, laneIndex: 2, runtimeTick: 999 }),
  'Product arp dice hold flow should ignore runtime tick and hold its generated tone choices',
);

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
{
  let nextTimerId = 1;
  const timerCallbacks = new Map<number, () => void>();
  (globalThis as { window?: unknown }).window = {
    setTimeout: (callback: () => void) => {
      const id = nextTimerId++;
      timerCallbacks.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => { timerCallbacks.delete(id); },
  };
  try {
    const scheduler = new CoreProductArrangementScheduler(() => undefined, () => null);
    const baseTransportState = {
      ...DEFAULT_STATE,
      transportPrimaryClock: 'seconds' as const,
      phraseLength: 16,
      sequencerMasterBPM: 60,
      synthEuclidBaseBPM: 60,
      drumEuclidBaseBPM: 60,
    };
    scheduler.start(baseTransportState);
    scheduler.update({
      ...baseTransportState,
      phraseLength: 32,
      sequencerMasterBPM: 30,
      synthEuclidBaseBPM: 30,
      drumEuclidBaseBPM: 30,
    });
    const pendingScheduler = scheduler as unknown as {
      state: Record<string, unknown>;
      pendingTransportState: Record<string, unknown> | null;
    };
    assert.equal(pendingScheduler.state.phraseLength, 16, 'arrangement timing should remain active until the phrase boundary');
    assert.equal(pendingScheduler.pendingTransportState?.phraseLength, 32, 'arrangement timing should stage the requested phrase');
    scheduler.update({
      ...baseTransportState,
      phraseLength: 48,
      sequencerMasterBPM: 20,
      synthEuclidBaseBPM: 20,
      drumEuclidBaseBPM: 20,
    });
    assert.equal(pendingScheduler.pendingTransportState?.phraseLength, 48, 'later timing edits should replace the pending arrangement state');
    scheduler.syncTransportTelemetry({
      schemaHash: 0,
      transportRunning: true,
      activeSources: 0,
      activeVoices: 0,
      activeAssets: 0,
      sequencerEventCount: 0,
      controlQueueDepth: 0,
      assetMissingCount: 0,
      lastErrorCode: 0,
      transportTransitionRevision: 1,
    });
    assert.equal(pendingScheduler.state.phraseLength, 48, 'latest arrangement timing should become active at the boundary');
    assert.equal(pendingScheduler.pendingTransportState, null, 'applied arrangement timing should clear pending state');
    scheduler.stop();


  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
}
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
    leadRandomEnabled: false,
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

const sample1NonPianoState = samplePredictionState({
  ...DEFAULT_STATE,
  sample1Enabled: true,
  sample1LibraryKey: 'soft-string-spurs',
  sample1Role: 'harmonic',
  sample1Articulation: 'harmonic',
  sample1SelectionMode: 'mapped',
  sample1DynamicMode: 'legacy-piano-parity',
  sample1FixedDynamic: 'single',
  sample1LoopEnabled: true,
});
const sample1NonPianoDescriptor = sampleDescriptorForSlotNote(sample1NonPianoState, 'sample1', 60, 0.75);
assert.equal(sample1NonPianoDescriptor?.libraryKey, 'soft-string-spurs', 'Sample 1 non-piano library should resolve even with stale legacy piano dynamic mode');

const sample1VelocityLayerState = samplePredictionState({
  ...DEFAULT_STATE,
  sample1Enabled: true,
  sample1LibraryKey: 'soft-string-spurs',
  sample1Role: 'sustain',
  sample1Articulation: 'core',
  sample1SelectionMode: 'mapped',
  sample1DynamicMode: 'velocity',
  sample1FixedDynamic: 'level-1',
  sample1LoopEnabled: true,
});
const sample1VelocityDescriptor = sampleDescriptorForSlotNote(sample1VelocityLayerState, 'sample1', 60, 0.75);
assert(
  sample1VelocityDescriptor?.sampleId.includes('level-3'),
  'Product sample asset resolver should convert normalized note velocity before choosing velocity-layered Sample 1 assets',
);

const sample2NonPianoState = samplePredictionState({
  ...DEFAULT_STATE,
  sample2Enabled: true,
  sample2LibraryKey: 'archive-found-strings-001',
  sample2Role: 'profile',
  sample2Articulation: 'found-string-loop',
  sample2SelectionMode: 'mapped',
  sample2DynamicMode: 'velocity',
  sample2FixedDynamic: 'single',
  sample2LoopEnabled: true,
});
const sample2NonPianoDescriptor = sampleDescriptorForSlotNote(sample2NonPianoState, 'sample2', 61, 0.75);
assert.equal(sample2NonPianoDescriptor?.libraryKey, 'archive-found-strings-001', 'Sample 2 non-piano library should resolve from the delivered sample registry');

const postedSample2RandomEvents: Array<{ eventKind: number; targetId?: number; value?: number }> = [];
const ensuredSample2RandomAssets: Array<{ slotId: string; midi: number; velocity: number }> = [];
const sample2RandomOrder: Array<'ensure' | 'post'> = [];
const queuedSample2RandomTimers: Array<() => void> = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: (callback: () => void) => {
    queuedSample2RandomTimers.push(callback);
    return queuedSample2RandomTimers.length;
  },
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => {
      postedSample2RandomEvents.push({ eventKind: event.eventKind, targetId: event.targetId, value: event.value });
      if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn && event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Sample2) {
        sample2RandomOrder.push('post');
      }
    },
    () => null,
    undefined,
    async (slotId, midi, velocity) => {
      ensuredSample2RandomAssets.push({ slotId, midi, velocity });
      if (slotId === 'sample2') sample2RandomOrder.push('ensure');
    },
  );
  const baseState = {
    ...DEFAULT_STATE,
    rootNote: 0,
    scaleMode: 'manual' as const,
    manualScale: 'Major (Ionian)',
    tension: 0.3,
    chordRate: 32,
    voicingSpread: 0.5,
    detune: 0,
    seedWindow: 'hour' as const,
    leadRandomEnabled: false,
    leadRandomSource: 'lead1' as const,
    lead1Density: 0.5,
    lead1Octave: 0,
    lead1OctaveRange: 2,
    sample2Enabled: true,
  };
  scheduler.start(baseState);
  scheduler.update({
    ...baseState,
    leadRandomEnabled: true,
    leadRandomSource: 'sample2' as const,
    sample2LibraryKey: 'archive-found-strings-001',
    sample2Role: 'profile',
    sample2Articulation: 'found-string-loop',
    sample2SelectionMode: 'mapped',
    sample2DynamicMode: 'velocity',
    sample2FixedDynamic: 'single',
  });
  const sample2RandomNoteCount = () => postedSample2RandomEvents.filter((event) => (
    event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn &&
    event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Sample2
  )).length;
  for (let guard = 0; guard < 80 && sample2RandomNoteCount() === 0 && queuedSample2RandomTimers.length > 0; guard += 1) {
    queuedSample2RandomTimers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  }
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}
const postedSample2RandomNotes = postedSample2RandomEvents.filter((event) => (
  event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn &&
  event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Sample2
));
assert(postedSample2RandomNotes.length > 0, 'Product scheduler should start Sample 2 Random Timing notes when enabled during playback');
assert.equal(ensuredSample2RandomAssets.length, postedSample2RandomNotes.length, 'Random Timing Sample 2 notes should wait for Sample 2 assets');
assert(ensuredSample2RandomAssets.every((entry) => entry.slotId === 'sample2'), 'Random Timing should load through the sample2 slot');
let randomEnsuresSeen = 0;
let randomPostsSeen = 0;
for (const entry of sample2RandomOrder) {
  if (entry === 'ensure') randomEnsuresSeen += 1;
  if (entry === 'post') {
    randomPostsSeen += 1;
    assert(randomEnsuresSeen >= randomPostsSeen, 'Random Timing Sample 2 asset should load before each posted manual note');
  }
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
  synthSustain: 0.63,
  synthHold: 1.7,
  synthRelease: 4.6,
});
const padSequencerGateSource = padSequencerGateSnapshot.sources.find(
  (source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1,
);
assert.equal(padSequencerGateSource?.attackSeconds, 0.35, 'Pad source timing must use the same attack as the pad DSP');
assert.equal(padSequencerGateSource?.decaySeconds, 0.42, 'Pad source timing must use the same decay as the pad DSP');
assert.equal(padSequencerGateSource?.sustain, 0.63, 'Pad source timing must use the same sustain as the pad DSP');
assert.equal(padSequencerGateSource?.holdSeconds, 1.7, 'Pad source timing must use the authored hold');
assert.equal(padSequencerGateSource?.releaseSeconds, 4.6, 'Pad source timing must use the same release as the pad DSP');
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
const longPadEnvelopeSnapshot = createCoreProductSnapshot({
  padPresetA: 'saturated_drift',
  padPresetB: 'init',
  padMorph: 0,
  synthAttack: 6,
  synthDecay: 1,
  synthSustain: 0.8,
  synthHold: 1,
  synthRelease: 12,
});
const longPadEnvelopeSource = longPadEnvelopeSnapshot.sources.find(
  (source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1,
);
assert.deepEqual(
  {
    attackSeconds: longPadEnvelopeSource?.attackSeconds,
    decaySeconds: longPadEnvelopeSource?.decaySeconds,
    sustain: longPadEnvelopeSource?.sustain,
    holdSeconds: longPadEnvelopeSource?.holdSeconds,
    releaseSeconds: longPadEnvelopeSource?.releaseSeconds,
  },
  { attackSeconds: 6, decaySeconds: 1, sustain: 0.8, holdSeconds: 1, releaseSeconds: 12 },
  'Saturated Drift Pad scheduling must retain the full authored envelope',
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

const saturatedDriftIIPreset = getPadPreset('saturated_drift_ii');
assert.ok(saturatedDriftIIPreset, 'Saturated Drift II source data should exist');
upsertUserPadPreset('pad1', {
  id: 'supabase-saturated-drift-ii',
  name: 'Saturated Drift II',
  library: 'cloud',
  preset: saturatedDriftIIPreset,
});
const saturatedDriftIISnapshot = createCoreProductSnapshot({
  padEnabled: true,
  padPresetA: 'supabase-saturated-drift-ii',
  padPresetB: 'supabase-saturated-drift-ii',
  padMorph: 0,
});
const saturatedDriftIISource = saturatedDriftIISnapshot.sources.find((source) => source.sourceId === KESSHO_PRODUCT_SOURCE_IDS.Pad1);
assert.equal(saturatedDriftIISource?.presetId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.PadInit, 'Product pad Saturated Drift II should use a stable core anchor');
assert.equal(saturatedDriftIISource?.sourcePresetAId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.PadInit, 'Product pad Saturated Drift II endpoint A should use a stable core anchor');
assert.equal(saturatedDriftIISource?.sourcePresetBId, KESSHO_PRODUCT_SOURCE_PRESET_IDS.PadInit, 'Product pad Saturated Drift II endpoint B should use a stable core anchor');
assert.ok((saturatedDriftIISource?.padOverrideCount ?? 0) > 0, 'Product pad Saturated Drift II should serialize its preset data as sparse overrides');
assertNoWebExactPatchFields(saturatedDriftIISource, 'Product pad Saturated Drift II');

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
assert.equal(harmonyDefaultsSnapshot.harmony.canonicalProgressionEventCount, 8, 'Product harmony should initialize 8 progression events');
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

const idleLiveWireSnapshot = createCoreProductSnapshot({
  rootMidi: 60,
  tension: 0.35,
  harmonyLiveGestureRevision: 91,
  harmonyLiveGestureScope: 4,
  harmonyLiveGestureTarget: 5,
  harmonyLiveGestureNoteCount: 4,
});
assert.equal(idleLiveWireSnapshot.harmony.liveGestureRevision, 0, 'momentary live gestures must not enter authored snapshots');
assert.equal(idleLiveWireSnapshot.harmony.liveGestureScope, 0, 'snapshot live scope must start idle');
assert.equal(idleLiveWireSnapshot.harmony.liveGestureTarget, 0, 'snapshot live target must start idle');
assert.equal(idleLiveWireSnapshot.harmony.liveGestureNoteCount, 0, 'snapshot live notes must start empty');
const morphBankState = resolveProductHarmonyState({
  state: {
    harmonyMorphPercent: 50,
    harmonyProgressionA: {
      version: 2,
      enabled: true,
      currentEventIndex: 0,
      events: [{ id: 'a0', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 }}],
    },
    harmonyProgressionB: {
      version: 2,
      enabled: true,
      currentEventIndex: 0,
      events: [{ id: 'b0', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 }}],
    },
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(morphBankState.progression.events[0]?.id, 'b0', 'Product harmony should select the Preset B progression bank at 50% morph');

const fixedProgressionChord = normalizeChord({ behavior: 'fixed', notes: [{ midi: 60 }, { midi: 64, velocity: 0.5, offset: 0.25, gate: 1, destination: 7 }, { midi: 67 }] })!;
const followProgressionChord = normalizeChord({
  behavior: 'follow', degree: 4, quality: 'major', extensions: ['7', 'dominant'],
  voicing: { inversion: 1, spread: 0.5, register: -1, bass: 'root' },
  notes: [{ midi: 99 }],
})!;
const chordProgressionSnapshot = createCoreProductSnapshot({
  rootMidi: 60,
  tension: 0.35,
  harmonyProgression: {
    version: 2,
    enabled: true,
    currentEventIndex: 0,
    events: [
      { id: 'fixed', source: { type: 'chord', chord: fixedProgressionChord }, duration: { unit: 'bar', value: 1 } },
      { id: 'follow', source: { type: 'chord', chord: followProgressionChord }, duration: { unit: 'bar', value: 1 } },
      { id: 'auto', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } },
    ],
  },
});
const progressionHarmony = chordProgressionSnapshot.harmony;
assert.deepEqual(progressionHarmony.canonicalProgressionSource?.slice(0, 4), [1, 1, 0, 0], 'chord events encode as chord sources and auto events as auto');
assert.deepEqual(progressionHarmony.canonicalProgressionNoteCount?.slice(0, 3), [3, 0, 0], 'only Fixed chords send notes to native');
assert.deepEqual(progressionHarmony.canonicalProgressionChord?.[0], { behavior: 1, degree: 0, quality: 0, extensions: 0, inversion: 0, spread: 0, registerOctave: 0, bassMode: 0, bassPitchClass: 0 });
assert.deepEqual(progressionHarmony.canonicalProgressionChord?.[1], { behavior: 0, degree: 4, quality: 1, extensions: 2 | 32, inversion: 1, spread: 0.5, registerOctave: -1, bassMode: 1, bassPitchClass: 0 });
assert.deepEqual(progressionHarmony.canonicalProgressionNotes?.[1], { midi: 64, velocity: 0.5, gateBeats: 1, offsetBeats: 0.25, destinationSourceId: 7 });
assert.equal(progressionHarmony.canonicalProgressionNotes?.[8]?.midi, 0, 'a Follow chord leaves its note slots empty');

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

console.log('Kessho Product harmony parity regression passed');
