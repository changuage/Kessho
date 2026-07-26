import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { defaultHarmonyChordSlot, emptyHarmonyChordSlot, type HarmonyIntent } from './CoreProductHarmonyControl';
import { editSharedChordIntent } from './harmony/harmonyChordAdapters';
import {
  normalizeProductPlayConfig,
  resolveProductChordChoiceIndex,
  resolveProductPlayEnginePattern,
  resolveProductChordPlayEvents,
  resolveProductChordPlayPatternDetails,
} from './productPlaySequencer';

function harmonyWithSlots(emptySlotId?: number) {
  return {
    rootMidi: 60,
    scaleId: 1,
    tension: 0.35,
    notePoolMidi: [60, 62, 64],
    chordSlots: Array.from({ length: 8 }, (_, id) => id === emptySlotId
      ? emptyHarmonyChordSlot(id)
      : defaultHarmonyChordSlot(id)),
  };
}

function chordConfig(overrides: Record<string, unknown> = {}) {
  return normalizeProductPlayConfig({
    enabled: true,
    mode: 'chord',
    chord: {
      choiceLength: 3,
      steps: [{ slotId: 0 }, { slotId: 1 }, { slotId: 2 }],
      ...overrides,
    },
  });
}

function seventhHarmony(notes = [60, 64, 67, 70]) {
  const harmony = harmonyWithSlots();
  const intent: HarmonyIntent = {
    ...harmony.chordSlots[0]!.intent,
    quality: 'dom7',
    rootMode: 'absolute',
    rootNote: 0,
    extensions: [],
    inversion: 0,
    bassMode: 'off',
    bassNote: null,
  };
  const slot = harmony.chordSlots[0]!;
  slot.intent = intent;
  slot.chord = {
    ...editSharedChordIntent(slot.chord!, intent),
    exactMidiNotes: [...notes],
  };
  return harmony;
}

test('chord choices follow audible hit ordinal and preserve 5-hit/3-choice polymeter', () => {
  const config = chordConfig();
  assert.deepEqual(
    Array.from({ length: 7 }, (_, ordinal) => config.chord.steps[resolveProductChordChoiceIndex('forward', 3, ordinal)]?.slotId),
    [0, 1, 2, 0, 1, 2, 0],
  );
});

test('reverse and pingpong traversal operate over choice length', () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, ordinal) => chordConfig({ flow: 'reverse' }).chord.steps[resolveProductChordChoiceIndex('reverse', 3, ordinal)]?.slotId), [2, 1, 0, 2, 1, 0, 2]);
  assert.deepEqual(Array.from({ length: 7 }, (_, ordinal) => chordConfig({ flow: 'pingpong' }).chord.steps[resolveProductChordChoiceIndex('pingpong', 3, ordinal)]?.slotId), [0, 1, 2, 1, 0, 1, 2]);
});

test('empty slot consumes a choice ordinal but emits silence', () => {
  const config = chordConfig({ steps: [{ slotId: 0 }, { slotId: 1 }, { slotId: 2 }] });
  const pattern = resolveProductPlayEnginePattern({
    config,
    harmony: harmonyWithSlots(1),
    laneIndex: 0,
    pitchBindingMode: 'sequence',
    triggerPattern: [true, true, true, true],
  });
  assert.deepEqual(pattern?.midiPattern, [60, -1, 64]);
  assert.deepEqual((pattern?.playNotes ?? []).filter((event) => event.voiceIndex === 0).map((event) => event.slotId), [0, 2]);
});

test('normalized chord cells are slot-only and expose choice length', () => {
  const normalized = normalizeProductPlayConfig({ mode: 'chord', chord: { length: 3, steps: [{ active: false, slotId: 2 }] } });
  assert.equal(normalized.chord.choiceLength, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.chord.steps[0] ?? {}, 'active'), false);
});

test('ratchet/probability remain trigger-event concerns while a chord event fans out all voices', () => {
  const config = chordConfig();
  const pattern = resolveProductPlayEnginePattern({
    config,
    harmony: harmonyWithSlots(),
    laneIndex: 0,
    pitchBindingMode: 'sequence',
    triggerPattern: [true],
  });
  assert.equal(pattern?.playNotes?.filter((event) => event.step === 0).length, 4);
  assert.deepEqual([...new Set(pattern?.playNotes?.map((event) => event.step) ?? [])], [0, 1, 2]);
});

test('reference runtime gates probability once and ratchets the complete strummed event', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/audio/reference/webTs/engine.ts'), 'utf8');
  assert.match(source, /if \(trigCondPassed && rng\(\) <= lane\.probability \* stepProb\) \{[\s\S]{0,18000}const triggerNotes =/);
  assert.match(source, /for \(let r = 0; r < ratchet; r\+\+\) \{[\s\S]{0,1200}for \(const note of triggerNotes\)/);
  assert.match(source, /const rDelayMs = ratchetDelayMs \+ note\.offsetMs/);
});

test('voice reduction keeps root, third, and seventh of a seventh chord', () => {
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { choiceLength: 1, voiceCount: 3, steps: [{ slotId: 0 }] } });
  const detail = resolveProductChordPlayPatternDetails({ config: config.chord, harmony: seventhHarmony() })[0];
  assert.deepEqual(detail?.notes, [60, 64, 70]);
});

test('mono destinations traverse an ascending chord within the straight gate window', () => {
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { choiceLength: 1, voiceCount: 4, style: 'straight', gate: 0.5, steps: [{ slotId: 0 }] } });
  const events = resolveProductChordPlayEvents({ config: config.chord, harmony: seventhHarmony([64, 67, 70, 72]), sourceId: CORE_PRODUCT_SOURCE_IDS.lead1 });
  assert.deepEqual(events.map((event) => event.midi), [64, 67, 70, 72]);
  assert.deepEqual(events.map((event) => Math.round(event.offsetMs * 1000) / 1000), [0, 16.667, 33.333, 50]);
});

test('exact inversion remains the exact sorted note set and is not mutated', () => {
  const harmony = seventhHarmony([64, 67, 70, 72]);
  const before = [...harmony.chordSlots[0]!.chord!.exactMidiNotes];
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { choiceLength: 1, voiceCount: 8, steps: [{ slotId: 0 }] } });
  const detail = resolveProductChordPlayPatternDetails({ config: config.chord, harmony })[0];
  assert.deepEqual(detail?.notes, [64, 67, 70, 72]);
  assert.deepEqual(harmony.chordSlots[0]!.chord!.exactMidiNotes, before);
});

test('each mono trigger starts its traversal at the lowest note', () => {
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { choiceLength: 2, voiceCount: 4, steps: [{ slotId: 0 }, { slotId: 0 }] } });
  const events = resolveProductChordPlayEvents({ config: config.chord, harmony: seventhHarmony([64, 67, 70, 72]), sourceId: CORE_PRODUCT_SOURCE_IDS.lead1 });
  assert.deepEqual(events.filter((event) => event.step === 0).map((event) => event.midi), [64, 67, 70, 72]);
  assert.deepEqual(events.filter((event) => event.step === 1).map((event) => event.midi), [64, 67, 70, 72]);
});

test('mono strum ordering and timing are deterministic', () => {
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { style: 'strum', choiceLength: 1, voiceCount: 4, strum: { spreadMs: 120, curve: -0.2 }, steps: [{ slotId: 0 }] } });
  const options = { config: config.chord, harmony: seventhHarmony([64, 67, 70, 72]), sourceId: CORE_PRODUCT_SOURCE_IDS.lead1 };
  assert.deepEqual(resolveProductChordPlayEvents(options), resolveProductChordPlayEvents(options));
  assert.deepEqual(resolveProductChordPlayEvents(options).map((event) => event.midi), [64, 67, 70, 72]);
});
