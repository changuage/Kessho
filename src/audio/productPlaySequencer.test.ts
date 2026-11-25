import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHarmonyChordSlot, emptyHarmonyChordSlot, type HarmonyIntent } from './CoreProductHarmonyControl';
import { editSharedChordIntent } from './harmony/harmonyChordAdapters';
import {
  normalizeProductPlayConfig,
  resolveProductChordChoiceIndex,
  resolveProductPlayEnginePattern,
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
    ...harmony.chordSlots[0]!.chord!.intent!,
    quality: 'dom7',
    rootMode: 'absolute',
    rootNote: 0,
    extensions: [],
    inversion: 0,
    bassMode: 'off',
    bassNote: null,
  };
  const slot = harmony.chordSlots[0]!;
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
});

test('normalized chord cells are slot-only and expose choice length', () => {
  const normalized = normalizeProductPlayConfig({ mode: 'chord', chord: { length: 3, steps: [{ active: false, slotId: 2 }] } });
  assert.equal(normalized.chord.choiceLength, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.chord.steps[0] ?? {}, 'active'), false);
});

test('voice reduction keeps root, third, and seventh of a seventh chord', () => {
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { choiceLength: 1, voiceCount: 3, steps: [{ slotId: 0 }] } });
  const detail = resolveProductChordPlayPatternDetails({ config: config.chord, harmony: seventhHarmony() })[0];
  assert.deepEqual(detail?.notes, [60, 64, 70]);
});

test('exact inversion remains the exact sorted note set and is not mutated', () => {
  const harmony = seventhHarmony([64, 67, 70, 72]);
  const before = [...harmony.chordSlots[0]!.chord!.exactMidiNotes];
  const config = normalizeProductPlayConfig({ enabled: true, mode: 'chord', chord: { choiceLength: 1, voiceCount: 8, steps: [{ slotId: 0 }] } });
  const detail = resolveProductChordPlayPatternDetails({ config: config.chord, harmony })[0];
  assert.deepEqual(detail?.notes, [64, 67, 70, 72]);
  assert.deepEqual(harmony.chordSlots[0]!.chord!.exactMidiNotes, before);
});

