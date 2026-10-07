import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoPrintSynthSequenceVariation,
  isCurrentSynthVariationCommit,
  normalizeSynthSequenceVariationBank,
  rotateSynthSequenceVariation,
  selectSynthSequenceVariationInBank,
  settleSynthVariationCommit,
  serializeSynthSequenceVariationBank,
  SynthSequenceCaptureScratch,
  variationLaneValuesAfterTriggerToggle,
  type SynthVariationLane,
} from './synthSequenceVariations';

test('deferred variation receipt is ignored after cancel/rearm but accepted for the current capture', async () => {
  const firstCapture = {};
  const secondCapture = {};
  let currentSerial = 1;
  let currentCapture: object | null = firstCapture;
  let resolveReceipt!: (accepted: boolean) => void;
  const deferredReceipt = new Promise<boolean>((resolve) => { resolveReceipt = resolve; });
  const stale = deferredReceipt.then(() => isCurrentSynthVariationCommit(currentSerial, 1, currentCapture, firstCapture));

  currentSerial = 2;
  currentCapture = secondCapture;
  resolveReceipt(true);
  assert.equal(await stale, false);
  assert.equal(isCurrentSynthVariationCommit(currentSerial, 2, currentCapture, secondCapture), true);
  currentCapture = null;
  assert.equal(isCurrentSynthVariationCommit(currentSerial, 2, currentCapture, secondCapture), false);
});

test('commit settlement clears pending only for the current Keep capture', () => {
  const firstCapture = {};
  const secondCapture = {};
  let currentSerial = 1;
  let currentCapture: object | null = firstCapture;
  let pending = true;

  currentSerial = 2;
  currentCapture = secondCapture;
  const stale = settleSynthVariationCommit(currentSerial, 1, currentCapture, firstCapture);
  if (stale.clearPending) pending = false;
  assert.equal(stale.accepted, false);
  assert.equal(pending, true);
  assert.equal(currentCapture, secondCapture);

  const current = settleSynthVariationCommit(currentSerial, 2, currentCapture, secondCapture);
  if (current.clearPending) pending = false;
  if (current.clearCapture) currentCapture = null;
  assert.equal(current.accepted, true);
  assert.equal(pending, false);
  assert.equal(currentCapture, null);
});

test('trigger edits preserve sequence-bound later pitch values', () => {
  assert.deepEqual(
    variationLaneValuesAfterTriggerToggle([60, 67, 72, 79], [true, false, true, false], [true, true, true, false], false, 60),
    [60, 67, 72, 79],
  );
  assert.deepEqual(
    variationLaneValuesAfterTriggerToggle([0.1, 0.2], [true, false, true], [false, true, true], true, 0),
    [0, 0.2],
  );
});

test('a new hit seeds printed pitch at root-relative zero', () => {
  assert.deepEqual(
    variationLaneValuesAfterTriggerToggle([], [false, false], [true, false], true, 0),
    [0],
  );
});

test('rotating a printed variation keeps pitch and hit-bound values with their trigger', () => {
  const variation = printedBank([
    { onsetBeats: 2, durationBeats: 0.5, pitch: 64, velocity: 0.2 },
    { onsetBeats: 3, durationBeats: 0.5, pitch: 67, velocity: 0.8 },
  ]).variations.A!;
  const rotated = rotateSynthSequenceVariation(variation, 1);
  assert.deepEqual(Object.keys(rotated.stepMetadata).sort(), ['0', '3']);
  assert.deepEqual(rotated.lane.overrides.pitch?.[0], [3, 0, 0, 0]);
  assert.deepEqual(rotated.lane.overrides.expression?.[0], [0.8, 0.2]);
  assert.deepEqual(rotated.lane.overrides.nudge?.[0], [0, 0]);
});

test('selected non-chain variation remains the play target after a bank edit', () => {
  const bank = printedBank([{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }]);
  const withB = {
    ...bank,
    variations: { ...bank.variations, B: { ...bank.variations.A!, id: 'B' as const, stepMetadata: {} } },
  };
  const selected = selectSynthSequenceVariationInBank(withB, 'B');
  const edited = {
    ...selected,
    variations: {
      ...selected.variations,
      B: { ...selected.variations.B!, stepMetadata: { '0': { mode: 'note' as const, gateBeats: 0.5 } } },
    },
  };
  assert.equal(selected.playVariation, 1);
  assert.equal(edited.playVariation, 1);
  assert.equal(edited.variations.B?.stepMetadata['0']?.mode, 'note');
});

function baseLane(): SynthVariationLane {
  return {
    overrides: {},
    state: {
      clockDiv: '1/8',
      swing: 0.35,
      linked: true,
      evolveConfig: {
        enabled: true,
        everyBars: 2,
        evolution: 0.2,
        writeOffset: 0,
        mutationMode: 'biased',
        methods: { rotate: true },
      },
      pitchSettings: { mode: 'semitones', root: 60, scale: 'Major' },
      pitchBindingMode: 'linked',
      subLaneStates: {
        pitch: { enabled: false, steps: 5, direction: 'reverse', valueMode: 'range' },
        expression: { enabled: false, steps: 3, direction: 'pingpong', valueMode: 'range' },
        nudge: { enabled: false, steps: 4, direction: 'reverse', valueMode: 'range' },
      },
    },
  };
}

function printedBank(
  notes: Parameters<typeof autoPrintSynthSequenceVariation>[0]['notes'],
  phraseBeats = 4,
) {
  const result = autoPrintSynthSequenceVariation({ phraseBeats, baseLane: baseLane(), notes });
  assert.equal(result.accepted, true, result.message);
  assert.ok(result.bank);
  return result.bank;
}

test('prints exact grid-relative values into serialized lane arrays', () => {
  const bank = printedBank([
    { onsetBeats: 0.2, durationBeats: 0.5, pitch: 61, velocity: 0.25 },
    { onsetBeats: 1.3, durationBeats: 6, pitch: 64, velocity: 0.75 },
  ]);
  assert.equal(bank.clockDiv, '1/4');
  const variation = bank.variations.A!;
  assert.equal(variation.steps, 4);
  assert.deepEqual(variation.lane.overrides.triggerToggles?.[0], [
    { step: 0, value: true },
    { step: 1, value: true },
  ]);
  assert.deepEqual(variation.lane.overrides.pitch?.[0], [0, 3, 0, 0]);
  assert.deepEqual(variation.lane.overrides.expression?.[0], [0.25, 0.75]);
  const nudges = variation.lane.overrides.nudge?.[0] ?? [];
  assert.ok(Math.abs((nudges[0] ?? 0) - 0.2) < 1e-9);
  assert.ok(Math.abs((nudges[1] ?? 0) - 0.3) < 1e-9);
  assert.equal(variation.lane.state.pitchSettings?.mode, 'notes');
  assert.equal(variation.lane.state.swing, 0);
  assert.equal(variation.lane.state.linked, false);
  assert.equal(variation.lane.state.subLaneStates?.pitch?.enabled, true);
  assert.equal(variation.lane.state.subLaneStates?.pitch?.steps, 4);
  assert.equal(variation.lane.state.pitchBindingMode, 'sequence');
  assert.equal(variation.lane.state.subLaneStates?.morph?.enabled, false);
  assert.equal(variation.lane.state.evolveConfig, undefined);
  assert.equal(variation.lane.state.playConfig, undefined);
  assert.equal(variation.lane.overrides.ratchet?.[0], null);
  assert.equal(variation.stepMetadata['1']?.gateBeats, 6);
  const reconstructed = (variation.lane.overrides.triggerToggles?.[0] ?? []).map((toggle, index) => (
    toggle.step + (variation.lane.overrides.nudge?.[0]?.[index] ?? 0)
  ));
  assert.ok(Math.abs((reconstructed[0] ?? 0) - 0.2) < 1e-9);
  assert.ok(Math.abs((reconstructed[1] ?? 0) - 1.3) < 1e-9);
  assert.deepEqual(serializeSynthSequenceVariationBank(bank), bank);
});

test('fits the full 128-cell print capacity at the supported 1/64 clock', () => {
  const notes = Array.from({ length: 128 }, (_, index) => ({
    onsetBeats: index / 16,
    durationBeats: 0.03,
    pitch: 48 + (index % 24),
    velocity: 0.5,
  }));
  const bank = printedBank(notes, 8);
  assert.equal(bank.clockDiv, '1/64');
  assert.deepEqual(bank.chainOrder, ['A', 'B', 'C', 'D']);
  assert.deepEqual(bank.chainOrder.map((id) => bank.variations[id]!.steps), [32, 32, 32, 32]);
  assert.equal(bank.phraseBeats, 8);
});

test('keeps a phrase-edge onset audible across the cyclic grid anchor', () => {
  const bank = printedBank([
    { onsetBeats: 3.95, durationBeats: 0.25, pitch: 67, velocity: 1 },
  ]);
  const variation = bank.variations.A!;
  const toggle = variation.lane.overrides.triggerToggles?.[0]?.[0];
  const nudge = variation.lane.overrides.nudge?.[0]?.[0] ?? 0;
  assert.ok(toggle);
  assert.deepEqual(toggle, { step: 0, value: true });
  assert.ok(Math.abs(nudge + 0.05) < 1e-9);
  const reconstructedBeat = ((toggle.step + nudge) % bank.phraseBeats + bank.phraseBeats) % bank.phraseBeats;
  assert.ok(Math.abs(reconstructedBeat - 3.95) < 1e-9);
});

test('uses a free adjacent anchor instead of forcing a chord', () => {
  const bank = printedBank([
    { onsetBeats: 0.49, durationBeats: 0.25, pitch: 60, velocity: 1 },
    { onsetBeats: 0.51, durationBeats: 0.25, pitch: 61, velocity: 1 },
  ]);
  const variation = bank.variations.A!;
  const pitches = variation.lane.overrides.pitch?.[0];
  const nudges = variation.lane.overrides.nudge?.[0];
  assert.deepEqual(pitches, [0, 1, 0, 0]);
  assert.ok(Math.abs((nudges?.[0] ?? 0) - 0.49) < 1e-9);
  assert.ok(Math.abs((nudges?.[1] ?? 0) + 0.49) < 1e-9);
  assert.equal(variation.stepMetadata['0']?.mode, 'note');
  assert.equal(variation.stepMetadata['1']?.mode, 'note');
});

test('retains grouped chord intervals without duplicating pitch arrays', () => {
  const bank = printedBank([
    { onsetBeats: 2, durationBeats: 0.75, pitch: 60, velocity: 0.8, chordGroupId: 'c' },
    { onsetBeats: 2, durationBeats: 1.25, pitch: 64, velocity: 0.6, chordGroupId: 'c' },
  ]);
  const variation = bank.variations.A!;
  assert.deepEqual(variation.lane.overrides.pitch?.[0], [0, 0, 0, 0]);
  assert.deepEqual(variation.stepMetadata['2']?.chord?.intervals, [
    { intervalSemitones: 0, velocity: 0.8, gateBeats: 0.75 },
    { intervalSemitones: 4, velocity: 0.6, gateBeats: 1.25 },
  ]);
});

test('uses an explicit capture group ID as chord identity despite delivery offset', () => {
  const grouped = printedBank([
    { onsetBeats: 0, durationBeats: 0.75, pitch: 60, velocity: 0.8, chordGroupId: 'attack-1' },
    { onsetBeats: 0.015, durationBeats: 0.75, pitch: 64, velocity: 0.6, chordGroupId: 'attack-1' },
  ]);
  assert.deepEqual(grouped.variations.A!.lane.overrides.pitch?.[0], [0, 0, 0, 0]);
  assert.equal(grouped.variations.A!.stepMetadata['0']?.mode, 'chord');
  assert.deepEqual(grouped.variations.A!.stepMetadata['0']?.chord?.intervals.map((interval) => interval.intervalSemitones), [0, 4]);

  const independent = printedBank([
    { onsetBeats: 0, durationBeats: 0.75, pitch: 60, velocity: 0.8, chordGroupId: 'attack-1' },
    { onsetBeats: 0.015, durationBeats: 0.75, pitch: 64, velocity: 0.6, chordGroupId: 'attack-2' },
  ]);
  assert.equal(Object.keys(independent.variations.A!.stepMetadata).length, 2);
  assert.equal(independent.variations.A!.stepMetadata['0']?.mode, 'note');
});

test('loop scratch sweeps rests, preserves held IDs, and finalizes on stop', () => {
  const scratch = new SynthSequenceCaptureScratch(4);
  scratch.start(0, [
    { onsetBeats: 0.5, durationBeats: 0.5, pitch: 60, velocity: 1 },
    { onsetBeats: 3.5, durationBeats: 0.5, pitch: 62, velocity: 1 },
  ]);
  scratch.advance(2);
  assert.deepEqual(scratch.snapshot().notes.map((note) => note.onsetBeats), [3.5]);
  const id = scratch.noteOn('keyboard', { pitch: 65, velocity: 1 }, 2.25);
  assert.ok(id);
  scratch.advance(6.25);
  assert.deepEqual(scratch.snapshot().heldInputIds, ['keyboard']);
  assert.equal(scratch.noteOff('keyboard', 6.5), true);
  scratch.stop(6.5);
  assert.equal(scratch.noteOff('keyboard', 7), false);
  assert.equal(scratch.snapshot().heldInputIds.length, 0);
  assert.equal(scratch.snapshot().stopped, true);
});

test('known-duration ingestion survives the current pass and sweeps on the next pass', () => {
  const scratch = new SynthSequenceCaptureScratch(4);
  scratch.start(12);
  assert.equal(scratch.ingest({ onsetBeats: 2, durationBeats: 0.5, pitch: 70, velocity: 1 }), true);
  scratch.advance(12.1);
  assert.equal(scratch.snapshot().notes.length, 1);
  scratch.advance(16.1);
  assert.equal(scratch.snapshot().notes.length, 0);
});

test('filters stale unwrapped events from a throttled multi-pass batch', () => {
  const scratch = new SynthSequenceCaptureScratch(4);
  scratch.start(0);
  const accepted = scratch.ingestBatch([
    { onsetBeats: 0.1, durationBeats: 0.25, pitch: 60, velocity: 1 },
    { onsetBeats: 3, durationBeats: 0.25, pitch: 61, velocity: 1 },
    { onsetBeats: 4.1, durationBeats: 0.25, pitch: 62, velocity: 1 },
  ], 4.2);
  assert.equal(accepted, 2);
  assert.deepEqual(scratch.snapshot().notes.map((note) => [Number(note.onsetBeats.toFixed(6)), note.pitch]), [[3, 61], [0.1, 62]]);
  assert.equal(scratch.ingestBatch([
    { onsetBeats: 0.2, durationBeats: 0.25, pitch: 64, velocity: 1 },
    { onsetBeats: 4.2, durationBeats: 0.25, pitch: 65, velocity: 1 },
  ], 4.25), 1);
  assert.deepEqual(scratch.snapshot().notes.map((note) => [Number(note.onsetBeats.toFixed(6)), note.pitch]), [[3, 61], [0.1, 62], [0.2, 65]]);
});

test('sweeps before capacity rejection and stacks duplicate held input IDs', () => {
  const previousNotes = Array.from({ length: 1024 }, (_, index) => ({
    onsetBeats: index % 4,
    durationBeats: 0.1,
    pitch: 40 + (index % 36),
    velocity: 0.5,
  }));
  const scratch = new SynthSequenceCaptureScratch(4);
  scratch.start(0, previousNotes);
  const firstId = scratch.noteOn('keyboard', { pitch: 60, velocity: 1 }, 4);
  assert.ok(firstId);
  assert.equal(scratch.snapshot().notes.length, 1);

  const duplicate = new SynthSequenceCaptureScratch(4);
  duplicate.start(0);
  assert.ok(duplicate.noteOn('keyboard', { pitch: 60, velocity: 1 }, 0));
  assert.ok(duplicate.noteOn('keyboard', { pitch: 64, velocity: 1 }, 0.25));
  assert.equal(duplicate.noteOff('keyboard', 0.5), true);
  assert.equal(duplicate.noteOff('keyboard', 0.75), true);
  assert.equal(duplicate.noteOff('keyboard', 1), false);
  assert.deepEqual(duplicate.snapshot().notes.map((note) => note.pitch), [64, 60]);
});

test('retains a held note duration beyond one phrase without retriggering it', () => {
  const scratch = new SynthSequenceCaptureScratch(4);
  scratch.start(0);
  assert.ok(scratch.noteOn('held', { pitch: 72, velocity: 0.8 }, 0));
  scratch.advance(5);
  assert.deepEqual(scratch.snapshot().heldInputIds, ['held']);
  assert.equal(scratch.noteOff('held', 5), true);
  const note = scratch.snapshot().notes[0];
  assert.equal(note?.durationBeats, 5);
  assert.equal(note?.held, false);
});

test('normalization rejects inconsistent spans instead of silently clamping', () => {
  const bank = printedBank([{ onsetBeats: 0, durationBeats: 0.25, pitch: 60, velocity: 1 }]);
  const malformed = structuredClone(bank);
  malformed.variations.A!.spanBeats += 0.25;
  assert.throws(() => normalizeSynthSequenceVariationBank(malformed), /steps\/spanBeats/);
  const wrongClock = structuredClone(bank);
  wrongClock.variations.A!.lane.state.clockDiv = '1/8';
  assert.throws(() => normalizeSynthSequenceVariationBank(wrongClock), /clockDiv/);
});
