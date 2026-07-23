import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { defaultHarmonyChordSlot, emptyHarmonyChordSlot } from './CoreProductHarmonyControl';
import {
  normalizeProductPlayConfig,
  resolveProductChordChoiceIndex,
  resolveProductPlayEnginePattern,
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
