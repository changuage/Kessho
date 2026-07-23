import assert from 'node:assert/strict';
import { createCoreProductHostHarmonySnapshot } from './CoreProductHostHarmonyState';
import {
  createCoreProductChordGeneratorSchedule,
  createCoreProductChordSequencerSchedule,
} from './coreProductArrangementPadChord';
import { createPadChordPhrasePreview, createRandomTimingPhrasePreview } from './simpleSequencerPhrasePreview';
import { arrangementRestartKey } from './coreProductArrangementVoiceMapping';
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
import {
  normalizeProductPlayConfig,
  resolveProductChordPlayEvents,
  resolveProductChordPlayPatternDetails,
  resolveProductPlayEnginePattern,
  resolveProductPlayMidiPattern,
} from './productPlaySequencer';
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
  defaultHarmonyChordSlot,
  defaultHarmonyIntent,
  formatHarmonyIntentChordLabel,
  generateHarmonySlotsAndSequence,
  recognizeHarmonyIntentFromMidiPool,
  resolveHarmonyIntentToNotePool,
  resolveProductHarmonyState,
  type HarmonyChordAlteration,
  type HarmonyChordQuality,
} from './CoreProductHarmonyControl';
import { sampleDescriptorForSlotNote, samplePredictionState } from './product/host/CoreProductSampleAssetResolver';
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

function absoluteHarmonyIntent(options: {
  quality: HarmonyChordQuality;
  extensions?: string[];
  alterations?: HarmonyChordAlteration[];
}) {
  return {
    ...defaultHarmonyIntent('slot'),
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

const harmonyRecognitionCases: Array<{ notes: number[]; label: string }> = [
  { notes: [60, 64, 67, 71, 74], label: 'Cmaj9' },
  { notes: [60, 64, 67, 70, 74], label: 'C9' },
  { notes: [60, 63, 67, 70, 74], label: 'Cm9' },
  { notes: [60, 64, 67, 69], label: 'C6' },
  { notes: [60, 64, 67, 69, 74], label: 'C6/9' },
  { notes: [60, 64, 67, 70, 73], label: 'C7b9' },
  { notes: [60, 64, 67, 70, 75], label: 'C7#9' },
  { notes: [60, 64, 67, 70, 78], label: 'C7#11' },
  { notes: [60, 64, 67, 70, 81], label: 'C13' },
  { notes: [60, 65, 67], label: 'Csus' },
  { notes: [60, 65, 70, 75], label: 'Cquartal' },
  { notes: [60, 61, 62, 64], label: 'Ccluster' },
];
const previousCmaj7Intent = absoluteHarmonyIntent({ quality: 'maj7' });
for (const testCase of harmonyRecognitionCases) {
  const recognized = recognizeHarmonyIntentFromMidiPool({
    midiNotes: testCase.notes,
    previousIntent: previousCmaj7Intent,
    rootMidi: 60,
    scaleId: 1,
    tension: 0.3,
  });
  assert.equal(
    formatHarmonyIntentChordLabel(recognized, { rootMidi: 60, scaleId: 1 }),
    testCase.label,
    `Harmony recognition should identify ${testCase.label}`,
  );
}
assert.equal(
  formatHarmonyIntentChordLabel(recognizeHarmonyIntentFromMidiPool({
    midiNotes: [60, 64, 67, 69],
    previousIntent: previousCmaj7Intent,
    rootMidi: 60,
    scaleId: 1,
    tension: 0.3,
  }), { rootMidi: 60, scaleId: 1 }),
  'C6',
  'Harmony recognition should prefer previous-root C6 over Am7/C',
);
const freeVoicingIntent = recognizeHarmonyIntentFromMidiPool({
  midiNotes: [60, 61, 67, 71],
  previousIntent: previousCmaj7Intent,
  rootMidi: 60,
  scaleId: 1,
  tension: 0.3,
});
assert.equal(freeVoicingIntent.preserveCapturedVoicing, true, 'unsupported Harmony recognition should preserve exact free voicing');
assert.deepEqual(freeVoicingIntent.capturedMidiNotes, [60, 61, 67, 71], 'free voicing fallback should keep exact edited MIDI notes');
assert.notEqual(
  formatHarmonyIntentChordLabel(freeVoicingIntent, { rootMidi: 60, scaleId: 1 }),
  'FREE',
  'captured Harmony voicing labels should not fall back to FREE',
);
assert.equal(
  formatHarmonyIntentChordLabel({
    ...freeVoicingIntent,
    capturedMidiNotes: [64, 67, 71, 74],
    preserveCapturedVoicing: true,
  }, { rootMidi: 60, scaleId: 1 }),
  'Em7',
  'captured Harmony voicing labels should infer common chord names',
);

function productArpTestHarmony(
  notePoolMidi: number[],
  chordSlots: ProductArpHarmonyContext['chordSlots'] = [],
): ProductArpHarmonyContext {
  return {
    rootMidi: 60,
    scaleId: 1,
    tension: 0.3,
    notePoolMidi,
    chordSlots,
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

const migratedPlay = normalizeProductPlayConfig({
  enabled: true,
  direction: 'down',
  pulseCount: 5,
  pulseMask: 0xffff,
  tonePattern: [0, 2, 1, 3, 4],
});
assert.equal(migratedPlay.enabled, true, 'Product Play migration should preserve legacy ARP enabled state');
assert.equal(migratedPlay.mode, 'arp', 'Product Play migration should load legacy ARP as ARP mode');
assert.equal(migratedPlay.arp.flow, 'down', 'Product Play migration should preserve legacy ARP flow');
assert.equal(migratedPlay.arp.length, 5, 'Product Play migration should preserve legacy ARP length');

const disabledDesignedPlay = normalizeProductPlayConfig({
  enabled: false,
  mode: 'chord',
  chord: {
    length: 12,
    style: 'strum',
    steps: Array.from({ length: 16 }, (_, index) => ({ active: index !== 2, slotId: (index + 1) % 8 })),
  },
});
assert.equal(disabledDesignedPlay.enabled, false, 'Product Play should keep disabled state without dropping design');
assert.equal(disabledDesignedPlay.mode, 'chord', 'Product Play should preserve disabled chord mode');
assert.equal(disabledDesignedPlay.chord.choiceLength, 12, 'Product Play should preserve disabled chord-choice length');
assert.equal('active' in (disabledDesignedPlay.chord.steps[2] ?? {}), false, 'Product Play chord choices should not carry active state');

const defaultChordLength8 = normalizeProductPlayConfig({
  enabled: false,
  mode: 'chord',
  chord: { length: 8 },
});
assert.equal(defaultChordLength8.chord.steps.length, 16, 'Product Play chord mode should always preserve 16 stored steps');
assert.equal(defaultChordLength8.chord.steps[0]?.slotId, 0, 'Product Play chord mode should default step 1 to S1');
assert.equal(defaultChordLength8.chord.steps[7]?.slotId, 7, 'Product Play chord mode should default the final live step to S8');
assert.equal('active' in (defaultChordLength8.chord.steps[8] ?? {}), false, 'Product Play chord mode should keep stored choices slot-only');
const defaultChordLength12 = normalizeProductPlayConfig({
  enabled: false,
  mode: 'chord',
  chord: { length: 12 },
});
assert.equal(defaultChordLength12.chord.steps[10]?.slotId, 2, 'Product Play chord mode should default newly included choices by slot');
assert.equal(defaultChordLength12.chord.steps[11]?.slotId, 3, 'Product Play chord mode should default choice 12 by slot');
const rememberedChordLength10 = normalizeProductPlayConfig({
  enabled: false,
  mode: 'chord',
  chord: {
    length: 10,
    steps: Array.from({ length: 16 }, (_, index) => ({ active: index === 10 || index === 11, slotId: index % 8 })),
  },
});
const rememberedChordLength12 = normalizeProductPlayConfig({
  ...rememberedChordLength10,
  chord: { ...rememberedChordLength10.chord, length: 12 },
});
assert.equal(rememberedChordLength10.chord.steps[10]?.slotId, 2, 'Product Play chord mode should preserve choice 11 above a shorter length');
assert.equal(rememberedChordLength12.chord.steps[10]?.slotId, 2, 'Product Play chord mode should restore stored choice 11 when length expands');
assert.equal(rememberedChordLength12.chord.steps[11]?.slotId, 3, 'Product Play chord mode should restore stored choice 12 when length expands');

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

const chordPlaySlot = defaultHarmonyChordSlot(0);
chordPlaySlot.intent = absoluteHarmonyIntent({ quality: 'maj7', extensions: ['9'] });
const chordPlayHarmony = productArpTestHarmony([60, 64, 67], [chordPlaySlot]);
const emptyChordPlayConfig = normalizeProductPlayConfig({
  enabled: true,
  mode: 'chord',
  chord: { length: 4 },
});
assert.deepEqual(
  resolveProductPlayMidiPattern({ config: emptyChordPlayConfig, harmony: chordPlayHarmony, laneIndex: 0 }),
  [60, -1, -1, -1],
  'Product Play chord mode should preserve empty slot choices as silent positions',
);
const chordPlayConfig = normalizeProductPlayConfig({
  enabled: true,
  mode: 'chord',
  chord: {
    style: 'straight',
    length: 2,
    steps: [
      { slotId: 0 },
      { slotId: 0 },
    ],
  },
});
const chordPlayDetails = resolveProductChordPlayPatternDetails({
  config: chordPlayConfig.chord,
  harmony: chordPlayHarmony,
});
assert.deepEqual(chordPlayDetails[0]?.notes, [60, 64, 67, 71, 74], 'Product Play chord mode should resolve S1 through global Harmony slot');
assert.deepEqual(chordPlayDetails[1]?.notes, [60, 64, 67, 71, 74], 'Product Play chord mode should treat every choice as a trigger event');
chordPlaySlot.intent = absoluteHarmonyIntent({ quality: 'nine' });
assert.deepEqual(
  resolveProductChordPlayPatternDetails({ config: chordPlayConfig.chord, harmony: chordPlayHarmony })[0]?.notes,
  [60, 64, 67, 70, 74],
  'Product Play chord mode should follow changed global slot intent',
);
assert.deepEqual(
  resolveProductPlayMidiPattern({ config: chordPlayConfig, harmony: chordPlayHarmony, laneIndex: 0 }),
  [60, 60],
  'Product Play chord choices should retain one engine position per choice',
);
assert.deepEqual(
  resolveProductChordPlayEvents({ config: chordPlayConfig.chord, harmony: chordPlayHarmony }).map((event) => event.step),
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
  'Product Play chord note fan-out should attach voices to each trigger choice',
);
const sparseChordPlayConfig = normalizeProductPlayConfig({
  enabled: true,
  mode: 'chord',
  chord: {
    style: 'straight',
    length: 8,
    steps: [
      { slotId: 0 },
      { slotId: 0 },
      { slotId: 0 },
      { slotId: 0 },
    ],
  },
});
const sparseChordEnginePattern = resolveProductPlayEnginePattern({
  config: sparseChordPlayConfig,
  harmony: chordPlayHarmony,
  laneIndex: 0,
});
assert.deepEqual(
  sparseChordEnginePattern?.midiPattern,
  [60, 60, 60, 60, -1, -1, -1, -1],
  'Product Play chord engine pattern should preserve every slot choice',
);
assert.equal(sparseChordEnginePattern?.steps, 8, 'Product Play chord choices should clock at their authored choice length');
const sequenceBoundChordEnginePattern = resolveProductPlayEnginePattern({
  config: chordPlayConfig,
  harmony: chordPlayHarmony,
  laneIndex: 0,
  pitchBindingMode: 'sequence',
  triggerPattern: [true, false, false, true, false, false, false, true],
});
assert.deepEqual(
  sequenceBoundChordEnginePattern?.midiPattern,
  [60, 60],
  'chord Product Play should keep choice-length pitch pattern for hit-count binding',
);
assert.deepEqual(
  sequenceBoundChordEnginePattern?.playNotes?.map((event) => event.step),
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
  'chord Product Play should fan out voices by choice index for hit-count binding',
);
const continuousArpPlayConfig = normalizeProductPlayConfig({
  enabled: true,
  mode: 'arp',
  arp: {
    enabled: true,
    flow: 'up',
    rate: 1,
    length: 4,
    pulseMask: 0b1111,
    contour: Array.from({ length: 16 }, () => 0),
  },
});
const continuousArpEnginePattern = resolveProductPlayEnginePattern({
  config: continuousArpPlayConfig,
  harmony: productArpTestHarmony([60, 64, 67, 71]),
  laneIndex: 0,
  triggerPattern: [true, false, false, false, true, false, false, false],
});
assert.deepEqual(
  continuousArpEnginePattern?.midiPattern,
  [60, 64, 67, 71],
  'Product Play ARP should pass the resolved arp pitch lane to Product Core in hit-bound mode',
);
assert.equal(
  continuousArpEnginePattern?.playNotes,
  null,
  'Product Play ARP should leave continuous timing to Product Core instead of host play-note fan-out',
);
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
const sequenceBoundArpEnginePattern = resolveProductPlayEnginePattern({
  config: continuousArpPlayConfig,
  harmony: productArpTestHarmony([60, 64, 67, 71]),
  laneIndex: 0,
  pitchBindingMode: 'sequence',
  triggerPattern: [true, false, false, false, true, false, false, false],
});
assert.deepEqual(
  sequenceBoundArpEnginePattern?.midiPattern,
  [60, 64, 67, 71],
  'sequence-bound Product Play ARP should still pass the compact arp pitch lane to Product Core',
);
assert.equal(
  sequenceBoundArpEnginePattern?.playNotes,
  null,
  'sequence-bound Product Play ARP should not host-schedule continuous arp notes',
);
const strumPlayEvents = resolveProductChordPlayEvents({
  config: normalizeProductPlayConfig({
    enabled: true,
    mode: 'chord',
    chord: {
      style: 'strum',
      length: 1,
      strum: { direction: 'down', spreadMs: 120, curve: 0, velocityFalloff: 0.1 },
      steps: [{ active: true, slotId: 0 }],
    },
  }).chord,
  harmony: chordPlayHarmony,
});
assert.deepEqual(
  strumPlayEvents.map((event) => event.midi),
  [74, 70, 67, 64, 60],
  'Product Play strum should order down strums high to low',
);
const lastStrumPlayEvent = strumPlayEvents[strumPlayEvents.length - 1];
assert(strumPlayEvents[0]?.offsetMs === 0 && (lastStrumPlayEvent?.offsetMs ?? 0) > 0, 'Product Play strum should add delayed offsets after the first note');
assert((strumPlayEvents[0]?.velocity ?? 0) > (lastStrumPlayEvent?.velocity ?? 1), 'Product Play strum should apply velocity falloff');

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

const arpLockedSlot = defaultHarmonyChordSlot(0);
arpLockedSlot.intent = {
  ...arpLockedSlot.intent,
  preserveCapturedVoicing: true,
  capturedMidiNotes: [72, 76, 79],
};
const sourceLockDetails = resolveProductArpPatternDetails({
  config: normalizeProductArpConfig({
    enabled: true,
    flow: 'up',
    length: 2,
    pulseMask: 0b11,
    contour: [0, 0],
    slotLane: [-1, 0],
  }),
  harmony: productArpTestHarmony([60, 62, 64], [arpLockedSlot]),
  laneIndex: 0,
});
assert(sourceLockDetails, 'enabled Product arp source-lock test should resolve step details');
assert.deepEqual(
  sourceLockDetails.map((step) => step.outputMidi),
  [60, 76],
  'Product arp per-step source lock should resolve that step from the selected harmony slot pool',
);
assert.equal(sourceLockDetails[1]?.source, 0, 'Product arp resolved details should expose the selected source lock');

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

    const hostTimingScheduler = new CoreProductArrangementScheduler(() => undefined, () => null);
    const hostTimingState = {
      ...baseTransportState,
      synthChordSequencerEnabled: true,
      synthChordSequencerClockDivision: '1/8' as const,
    };
    hostTimingScheduler.start(hostTimingState);
    const activeHostTimingScheduler = hostTimingScheduler as unknown as {
      chordSequencerTimer: number | null;
    };
    const activeChordSequencerTimer = activeHostTimingScheduler.chordSequencerTimer;
    assert.notEqual(activeChordSequencerTimer, null, 'enabled host chord timing should have an active sequencer timer');
    hostTimingScheduler.update({
      ...hostTimingState,
      synthChordSequencerClockDivision: '1/16' as const,
    });
    const pendingHostTimingScheduler = hostTimingScheduler as unknown as {
      state: Record<string, unknown>;
      pendingHostTimingState: Record<string, unknown> | null;
      onHarmonyTick: (isPhraseBoundary: boolean) => void;
      chordSequencerTimer: number | null;
    };
    assert.equal(
      pendingHostTimingScheduler.state.synthChordSequencerClockDivision,
      '1/8',
      'host sequencer timing should remain active until the phrase boundary',
    );
    assert.equal(
      pendingHostTimingScheduler.pendingHostTimingState?.synthChordSequencerClockDivision,
      '1/16',
      'host sequencer timing should stage the requested clock division',
    );
    assert.equal(
      pendingHostTimingScheduler.chordSequencerTimer,
      activeChordSequencerTimer,
      'staging host sequencer timing must leave the current phrase timer running',
    );
    hostTimingScheduler.update({
      ...hostTimingState,
      synthChordSequencerClockDivision: '1/16' as const,
      seedWindow: hostTimingState.seedWindow === 'day' ? 'hour' : 'day',
    });
    assert.equal(
      pendingHostTimingScheduler.pendingHostTimingState?.synthChordSequencerClockDivision,
      '1/16',
      'an unrelated arrangement restart must preserve staged host timing',
    );
    const chordSequencerTimerBeforeBoundary = pendingHostTimingScheduler.chordSequencerTimer;
    assert.notEqual(
      chordSequencerTimerBeforeBoundary,
      null,
      'an unrelated arrangement restart must leave the host chord sequencer running',
    );
    pendingHostTimingScheduler.onHarmonyTick(true);
    assert.equal(
      pendingHostTimingScheduler.state.synthChordSequencerClockDivision,
      '1/16',
      'host sequencer timing should become active at the next phrase boundary',
    );
    assert.equal(
      pendingHostTimingScheduler.pendingHostTimingState,
      null,
      'applied host sequencer timing should clear pending state',
    );
    assert.notEqual(
      pendingHostTimingScheduler.chordSequencerTimer,
      chordSequencerTimerBeforeBoundary,
      'the phrase boundary should replace the old host timer with one using the staged timing',
    );
    assert.notEqual(
      pendingHostTimingScheduler.chordSequencerTimer,
      null,
      'the host chord sequencer must remain running after its timing transition',
    );
    hostTimingScheduler.stop();
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

const postedSampleChordEvents: Array<{ eventKind: number; targetId?: number; value?: number; value2?: number }> = [];
const ensuredSampleChordAssets: Array<{ slotId: string; midi: number; velocity: number }> = [];
const sampleChordOrder: string[] = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => {
      postedSampleChordEvents.push({
        eventKind: event.eventKind,
        targetId: event.targetId,
        value: event.value,
        value2: event.value2,
      });
      if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn) {
        sampleChordOrder.push(`post:${event.targetId}:${Math.round(event.value ?? -1)}`);
      }
    },
    () => null,
    undefined,
    async (slotId, midi, velocity) => {
      ensuredSampleChordAssets.push({ slotId, midi, velocity });
      sampleChordOrder.push(`ensure:${slotId}:${Math.round(midi)}`);
    },
  );
  scheduler.start({
    ...DEFAULT_STATE,
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.3,
    chordRate: 32,
    voicingSpread: 0.5,
    detune: 0,
    seedWindow: 'hour',
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample1',
    synthChordGeneratorVoiceCount: 2,
    sample1Enabled: true,
    sample1LibraryKey: 'piano',
    sample1DynamicMode: 'legacy-piano-parity',
    waveSpread: 0,
  });
  await Promise.resolve();
  await Promise.resolve();
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}
const postedSampleManualNotes = postedSampleChordEvents.filter((event) => (
  event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn &&
  event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Sample1
));
assert.equal(postedSampleManualNotes.length, 2, 'Product scheduler should post Sample 1 Chord Generator notes');
assert.equal(ensuredSampleChordAssets.length, 2, 'Product scheduler should load Sample 1 assets before generated note playback');
assert(ensuredSampleChordAssets.every((entry) => entry.slotId === 'sample1'), 'generated Sample 1 notes should load through the sample1 slot');
assert.deepEqual(
  ensuredSampleChordAssets.map((entry) => Math.round(entry.midi)),
  postedSampleManualNotes.map((event) => Math.round(event.value ?? -1)),
  'loaded sample asset MIDI should match scheduled Product note MIDI',
);
for (const note of postedSampleManualNotes) {
  const midi = Math.round(note.value ?? -1);
  assert(
    sampleChordOrder.indexOf(`ensure:sample1:${midi}`) >= 0 &&
      sampleChordOrder.indexOf(`ensure:sample1:${midi}`) < sampleChordOrder.indexOf(`post:${KESSHO_PRODUCT_SOURCE_IDS.Sample1}:${midi}`),
    `Sample 1 asset for MIDI ${midi} should load before the note event is posted`,
  );
}

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

const postedSample2ChordEvents: Array<{ eventKind: number; targetId?: number; value?: number }> = [];
const ensuredSample2ChordAssets: Array<{ slotId: string; midi: number; velocity: number }> = [];
const sample2ChordOrder: string[] = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => {
      postedSample2ChordEvents.push({ eventKind: event.eventKind, targetId: event.targetId, value: event.value });
      if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn) {
        sample2ChordOrder.push(`post:${event.targetId}:${Math.round(event.value ?? -1)}`);
      }
    },
    () => null,
    undefined,
    async (slotId, midi, velocity) => {
      ensuredSample2ChordAssets.push({ slotId, midi, velocity });
      sample2ChordOrder.push(`ensure:${slotId}:${Math.round(midi)}`);
    },
  );
  scheduler.start({
    ...DEFAULT_STATE,
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.3,
    chordRate: 32,
    voicingSpread: 0.5,
    detune: 0,
    seedWindow: 'hour',
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample2',
    synthChordGeneratorVoiceCount: 2,
    sample2Enabled: true,
    sample2LibraryKey: 'archive-found-strings-001',
    sample2Role: 'profile',
    sample2Articulation: 'found-string-loop',
    sample2SelectionMode: 'mapped',
    sample2DynamicMode: 'velocity',
    sample2FixedDynamic: 'single',
    waveSpread: 0,
  });
  await Promise.resolve();
  await Promise.resolve();
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}
const postedSample2ManualNotes = postedSample2ChordEvents.filter((event) => (
  event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn &&
  event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Sample2
));
assert.equal(postedSample2ManualNotes.length, 2, 'Product scheduler should post Sample 2 Chord Generator notes');
assert.equal(ensuredSample2ChordAssets.length, 2, 'Product scheduler should load Sample 2 assets before generated note playback');
assert(ensuredSample2ChordAssets.every((entry) => entry.slotId === 'sample2'), 'generated Sample 2 notes should load through the sample2 slot');
for (const note of postedSample2ManualNotes) {
  const midi = Math.round(note.value ?? -1);
  assert(
    sample2ChordOrder.indexOf(`ensure:sample2:${midi}`) >= 0 &&
      sample2ChordOrder.indexOf(`ensure:sample2:${midi}`) < sample2ChordOrder.indexOf(`post:${KESSHO_PRODUCT_SOURCE_IDS.Sample2}:${midi}`),
    `Sample 2 asset for MIDI ${midi} should load before the Chord Generator note event is posted`,
  );
}

const postedSample2ChordUpdateEvents: Array<{ eventKind: number; targetId?: number; value?: number }> = [];
const ensuredSample2ChordUpdateAssets: Array<{ slotId: string; midi: number; velocity: number }> = [];
(globalThis as { window?: unknown }).window = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};
try {
  const scheduler = new CoreProductArrangementScheduler(
    (event) => postedSample2ChordUpdateEvents.push({ eventKind: event.eventKind, targetId: event.targetId, value: event.value }),
    () => null,
    undefined,
    async (slotId, midi, velocity) => {
      ensuredSample2ChordUpdateAssets.push({ slotId, midi, velocity });
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
    synthChordGeneratorEnabled: false,
    synthChordGeneratorSource: 'sample1' as const,
    synthChordGeneratorVoiceCount: 2,
    sample1Enabled: true,
    sample2Enabled: true,
    waveSpread: 0,
  };
  scheduler.start(baseState);
  scheduler.update({
    ...baseState,
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample2' as const,
  });
  await Promise.resolve();
  await Promise.resolve();
  scheduler.stop();
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}
assert.equal(
  postedSample2ChordUpdateEvents.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn && event.targetId === KESSHO_PRODUCT_SOURCE_IDS.Sample2).length,
  2,
  'Product scheduler should start Sample 2 Chord Generator notes when enabled during playback',
);
assert.equal(ensuredSample2ChordUpdateAssets.length, 2, 'running Chord Generator enable should load Sample 2 assets before playback');
assert(ensuredSample2ChordUpdateAssets.every((entry) => entry.slotId === 'sample2'), 'running Chord Generator enable should load through the sample2 slot');

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
    sample1Enabled: true,
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
    synthChordGeneratorSource: 'sample1' as const,
    synthChordGeneratorVoiceCount: 2,
    synthChordSequencerSource: 'sample1' as const,
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
  const generatorPreview = createPadChordPhrasePreview({
    ...baseState,
    synthChordGeneratorEnabled: true,
    synthChordSequencerEnabled: false,
  });
  assert.equal(generatorPreview.enabled, true, 'Simple Chord Generator preview should follow generator enable, not Seq 5 enable');
  assert(generatorPreview.notes.length > 0, 'Simple Chord Generator preview should render generator notes without Seq 5');

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
  const seq5OnlyPreview = createPadChordPhrasePreview({
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
  });
  assert.equal(seq5OnlyPreview.enabled, false, 'Simple Chord Generator preview should stay off when only Seq 5 is enabled');
  assert.equal(seq5OnlyPreview.notes.length, 0, 'Simple Chord Generator preview should not render Seq 5 notes');
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
  assert.equal(
    arrangementRestartKey({
      ...baseState,
      synthChordSequencerEnabled: true,
      cofDriftRate: 1,
      cofDriftRange: 6,
      cofDriftDirection: 'ccw' as const,
    }),
    restartKey,
    'CoF drift config edits should update at the next phrase without resetting the active step',
  );
}

{
  const simpleSequencerState = {
    ...DEFAULT_STATE,
    rootNote: 0,
    scaleMode: 'manual' as const,
    manualScale: 'Major (Ionian)',
    chordRate: 4,
    phraseLength: 16,
    sequencerMasterBPM: 120,
    padEnabled: true,
    pad2Enabled: true,
    leadEnabled: true,
    lead2Enabled: true,
    sample1Enabled: true,
    sample2Enabled: true,
    pianoEnabled: false,
    synthChordGeneratorVoiceCount: 2,
    lead1Density: 0.5,
    lead1Octave: 0,
    lead1OctaveRange: 2,
  };
  const chordOnlyPreview = createPadChordPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'pad2' as const,
    leadRandomEnabled: false,
    leadRandomSource: 'sample1' as const,
  });
  assert.equal(chordOnlyPreview.enabled, true, 'Chord Generator should keep its own enabled state');
  assert(chordOnlyPreview.notes.length > 0, 'Chord Generator should preview notes when Random Timing is off');
  assert(chordOnlyPreview.notes.every((note) => note.source === 'pad2'), 'Chord Generator source should not follow Random Timing source');

  const randomOnlyPreview = createRandomTimingPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: false,
    synthChordGeneratorSource: 'pad1' as const,
    leadRandomEnabled: true,
    leadRandomSource: 'sample2' as const,
  });
  assert.equal(randomOnlyPreview.enabled, true, 'Random Timing should keep its own enabled state');
  assert(randomOnlyPreview.notes.length > 0, 'Random Timing should preview notes when Chord Generator is off');
  assert(randomOnlyPreview.notes.every((note) => note.source === 'sample2'), 'Random Timing source should not follow Chord Generator source');

  const disabledSample2Preview = createRandomTimingPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: false,
    leadRandomEnabled: true,
    leadRandomSource: 'sample2' as const,
    sample2Enabled: false,
  });
  assert.equal(disabledSample2Preview.enabled, false, 'Random Timing should stay disabled when selected Sample 2 is explicitly disabled');
  assert.equal(disabledSample2Preview.notes.length, 0, 'Disabled Sample 2 preview should not synthesize notes');

  const independentChordPreview = createPadChordPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'pad1' as const,
    leadRandomEnabled: true,
    leadRandomSource: 'lead2' as const,
  });
  const independentRandomPreview = createRandomTimingPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'pad1' as const,
    leadRandomEnabled: true,
    leadRandomSource: 'lead2' as const,
  });
  assert(independentChordPreview.notes.every((note) => note.source === 'pad1'), 'Chord Generator should use its selected source when both simple sequencers are enabled');
  assert(independentRandomPreview.notes.every((note) => note.source === 'lead2'), 'Random Timing should use its selected source when both simple sequencers are enabled');

  const randomDisabledPreview = createRandomTimingPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample1' as const,
    leadRandomEnabled: false,
    leadRandomSource: 'sample2' as const,
  });
  assert.equal(randomDisabledPreview.enabled, false, 'Chord Generator enable should not turn on Random Timing');
  const chordDisabledPreview = createPadChordPhrasePreview({
    ...simpleSequencerState,
    synthChordGeneratorEnabled: false,
    synthChordGeneratorSource: 'sample1' as const,
    leadRandomEnabled: true,
    leadRandomSource: 'sample2' as const,
  });
  assert.equal(chordDisabledPreview.enabled, false, 'Random Timing enable should not turn on Chord Generator');
}

console.log('Kessho Product harmony parity regression passed');
