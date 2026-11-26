import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoPrintSynthSequenceVariation,
  createRestNotesCell,
  isCurrentSynthVariationCommit,
  isSameSynthSequenceVariationBank,
  notesCellNotes,
  normalizeSynthSequenceVariationBank,
  rotateSynthSequenceVariation,
  selectSynthSequenceVariationInBank,
  settleSynthVariationCommit,
  serializeSynthSequenceVariationBank,
  SynthSequenceCaptureScratch,
  variationLaneValuesAfterTriggerToggle,
  type SynthSequenceVariationBank,
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

test('rotating a printed variation keeps each cell with its trigger', () => {
  const variation = printedBank([
    { onsetBeats: 2, durationBeats: 0.5, pitch: 64, velocity: 0.2 },
    { onsetBeats: 3, durationBeats: 0.5, pitch: 67, velocity: 0.8 },
  ]).variations.A!;
  const rotated = rotateSynthSequenceVariation(variation, 1);
  const occupied = rotated.cells.flatMap((cell, step) => cell.kind === 'rest' ? [] : [step]);
  assert.deepEqual(occupied, [0, 3]);
  assert.deepEqual(notesCellNotes(rotated.cells[3]!).map((note) => note.midi), [64]);
  assert.deepEqual(notesCellNotes(rotated.cells[0]!).map((note) => note.midi), [67]);
  assert.equal(rotated.cells.length, 32);
});

test('rotating with Advance = Hits moves hit-ordinal cells with their hits', () => {
  const variation = printedBank([
    { onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 },
    { onsetBeats: 2, durationBeats: 0.5, pitch: 62, velocity: 1 },
  ]).variations.A!;
  const hits = {
    ...variation,
    notesLane: { length: 2, direction: 'forward' as const, advance: 'hits' as const },
    cells: [variation.cells[0]!, variation.cells[2]!, ...Array.from({ length: 30 }, () => createRestNotesCell())],
  };
  // Rotating by 3 sends the hit at step 2 to step 1 and the hit at step 0 to step 3, so they swap order.
  const rotated = rotateSynthSequenceVariation(hits, 3);
  assert.deepEqual(rotated.cells.slice(0, 2).map((cell) => notesCellNotes(cell)[0]!.midi), [62, 60]);
});

test('selected non-chain variation remains the play target after a bank edit', () => {
  const bank = printedBank([{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }]);
  const withB = {
    ...bank,
    variations: { ...bank.variations, B: { ...bank.variations.A!, id: 'B' as const, cells: Array.from({ length: 32 }, () => createRestNotesCell()) } },
  };
  const selected = selectSynthSequenceVariationInBank(withB, 'B');
  const edited = {
    ...selected,
    variations: {
      ...selected.variations,
      B: { ...selected.variations.B!, cells: bank.variations.A!.cells },
    },
  };
  assert.equal(selected.playVariation, 1);
  assert.equal(edited.playVariation, 1);
  assert.equal(edited.variations.B?.cells[0]?.kind, 'chord');
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
  return print({ notes, phraseBeats });
}

function print(options: {
  notes: Parameters<typeof autoPrintSynthSequenceVariation>[0]['notes'];
  phraseBeats?: number;
  target?: 'A' | 'B' | 'C' | 'D';
  bank?: SynthSequenceVariationBank | null;
  lane?: SynthVariationLane;
}) {
  const result = autoPrintSynthSequenceVariation({
    phraseBeats: options.phraseBeats ?? 4,
    baseLane: options.lane ?? baseLane(),
    notes: options.notes,
    targetVariation: options.target ?? 'A',
    bank: options.bank ?? null,
  });
  assert.equal(result.accepted, true, result.message);
  assert.ok(result.bank);
  return result.bank;
}

test('prints one Fixed chord per occupied step with absolute notes, gates, velocities and offsets', () => {
  const bank = printedBank([
    { onsetBeats: 0.2, durationBeats: 0.5, pitch: 61, velocity: 0.25 },
    { onsetBeats: 1.3, durationBeats: 6, pitch: 64, velocity: 0.75 },
  ]);
  assert.equal(bank.clockDiv, '1/4');
  assert.equal(bank.schemaVersion, 2);
  const variation = bank.variations.A!;
  assert.equal(variation.steps, 4);
  assert.deepEqual(variation.notesLane, { length: 4, direction: 'forward', advance: 'steps' });
  assert.equal(variation.cells.length, 32);
  assert.deepEqual(variation.lane.overrides.triggerToggles?.[0], [
    { step: 0, value: true },
    { step: 1, value: true },
  ]);
  const first = variation.cells[0]!;
  assert.equal(first.kind, 'chord');
  assert.equal(first.chord?.behavior, 'fixed');
  assert.equal(first.articulation, 'chord');
  assert.equal(first.gateBeats, 0.5);
  assert.equal(first.chord?.notes.length, 1);
  assert.equal(first.chord?.notes[0]?.midi, 61);
  assert.equal(first.chord?.notes[0]?.velocity, 0.25);
  assert.equal(first.chord?.notes[0]?.gate, 0.5);
  assert.ok(Math.abs((first.chord?.notes[0]?.offset ?? 0) - 0.2) < 1e-9);
  const second = variation.cells[1]!;
  assert.equal(second.gateBeats, 6);
  assert.ok(Math.abs((second.chord?.notes[0]?.offset ?? 0) - 0.3) < 1e-9);
  assert.equal(variation.cells[2]!.kind, 'rest');
  // Notes carry pitch, velocity and timing, so those sublanes are off and carry no values.
  for (const lane of ['pitch', 'expression', 'nudge'] as const) {
    assert.equal(variation.lane.state.subLaneStates?.[lane]?.enabled, false, lane);
    assert.equal(variation.lane.overrides[lane]?.[0], null, lane);
  }
  assert.equal(variation.lane.state.swing, 0);
  assert.equal(variation.lane.state.linked, false);
  assert.equal(variation.lane.state.evolveConfig, undefined);
  assert.equal(variation.lane.state.playConfig, undefined);
  assert.equal(variation.lane.overrides.ratchet?.[0], null);
  // The base lane's pitch settings are left alone: nothing about the printed notes depends on them.
  assert.deepEqual(variation.lane.state.pitchSettings, baseLane().state.pitchSettings);
  assert.deepEqual(serializeSynthSequenceVariationBank(bank), bank);
});

test('keeps each captured note destination (its source) per note', () => {
  const variation = printedBank([
    { onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1, sourceId: 3 },
    { onsetBeats: 0, durationBeats: 0.5, pitch: 64, velocity: 1, sourceId: 5 },
    { onsetBeats: 0, durationBeats: 0.5, pitch: 67, velocity: 1 },
  ]).variations.A!;
  const notes = variation.cells[0]!.chord!.notes;
  assert.deepEqual(notes.map((note) => [note.midi, note.destination]), [[60, 3], [64, 5], [67, undefined]]);
});

test('two attacks inside one step print as one cell with two offsets', () => {
  const bank = printedBank([
    { onsetBeats: 0.49, durationBeats: 0.25, pitch: 60, velocity: 1 },
    { onsetBeats: 0.51, durationBeats: 0.25, pitch: 61, velocity: 0.5 },
  ]);
  const variation = bank.variations.A!;
  assert.equal(bank.clockDiv, '1/4');
  assert.deepEqual(variation.lane.overrides.triggerToggles?.[0], [{ step: 0, value: true }]);
  const notes = variation.cells[0]!.chord!.notes;
  assert.equal(notes.length, 2);
  assert.ok(Math.abs(notes[0]!.offset! - 0.49) < 1e-9);
  assert.ok(Math.abs(notes[1]!.offset! - 0.51) < 1e-9);
  assert.deepEqual(notes.map((note) => note.midi), [60, 61]);
  assert.equal(variation.cells[1]!.kind, 'rest');
});

test('a phrase-edge onset stays in the step it falls in, at its offset', () => {
  const variation = printedBank([{ onsetBeats: 3.95, durationBeats: 0.25, pitch: 67, velocity: 1 }]).variations.A!;
  assert.deepEqual(variation.lane.overrides.triggerToggles?.[0], [{ step: 3, value: true }]);
  assert.ok(Math.abs(variation.cells[3]!.chord!.notes[0]!.offset! - 0.95) < 1e-9);
});

test('a chord group ID is not needed: simultaneous attacks share one cell', () => {
  const variation = printedBank([
    { onsetBeats: 2, durationBeats: 0.75, pitch: 60, velocity: 0.8, chordGroupId: 'c' },
    { onsetBeats: 2, durationBeats: 1.25, pitch: 64, velocity: 0.6, chordGroupId: 'c' },
  ]).variations.A!;
  assert.deepEqual(variation.cells[2]!.chord!.notes, [
    { midi: 60, velocity: 0.8, gate: 0.75 },
    { midi: 64, velocity: 0.6, gate: 1.25 },
  ]);
  assert.equal(variation.cells[2]!.gateBeats, 1.25);
});

test('the same pitch twice in one step picks a finer grid instead of colliding', () => {
  const bank = printedBank([
    { onsetBeats: 0.1, durationBeats: 0.2, pitch: 60, velocity: 1 },
    { onsetBeats: 0.6, durationBeats: 0.2, pitch: 60, velocity: 1 },
  ]);
  assert.notEqual(bank.clockDiv, '1/4');
  const occupied = bank.variations.A!.cells.filter((cell) => cell.kind === 'chord');
  assert.equal(occupied.length, 2);
  assert.ok(occupied.every((cell) => cell.chord!.notes.length === 1));
});

test('a take that cannot fit 32 steps at any resolution fails with capacity', () => {
  const result = autoPrintSynthSequenceVariation({
    phraseBeats: 33,
    baseLane: baseLane(),
    notes: [{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }],
    targetVariation: 'A',
    bank: null,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.failure, 'capacity');
  assert.equal(result.bank, null);
});

test('Morph, Distance, Slice and Reverse state of the base lane survive a print', () => {
  const lane = baseLane();
  lane.overrides = { morph: [[0.1, 0.5, 0.9]], distance: [[0.2, 0.4]], slice: [[1, 2]], reverse: [[0, 1]], morphRanges: [[null, { min: 0.1, max: 0.6 }]] } as unknown as SynthVariationLane['overrides'];
  lane.state.subLaneStates = {
    ...lane.state.subLaneStates,
    morph: { enabled: true, steps: 3, direction: 'pingpong', valueMode: 'sequence' },
    distance: { enabled: true, steps: 2, direction: 'reverse', valueMode: 'sequence', followTriggerHits: true },
    slice: { enabled: true, steps: 2, direction: 'forward' },
    reverse: { enabled: true, steps: 2, direction: 'forward' },
  };
  const printed = print({ notes: [{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }], lane }).variations.A!;
  assert.deepEqual(printed.lane.overrides.morph, lane.overrides.morph);
  assert.deepEqual(printed.lane.overrides.distance, lane.overrides.distance);
  assert.deepEqual(printed.lane.overrides.slice, lane.overrides.slice);
  assert.deepEqual(printed.lane.overrides.reverse, lane.overrides.reverse);
  assert.deepEqual(printed.lane.overrides.morphRanges, lane.overrides.morphRanges);
  for (const kind of ['morph', 'distance', 'slice', 'reverse'] as const) {
    assert.deepEqual(printed.lane.state.subLaneStates?.[kind], lane.state.subLaneStates?.[kind], kind);
  }
});

test('a print replaces only the target variation and leaves the others as they were', () => {
  let bank = print({ notes: [{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }], target: 'A' });
  bank = print({ notes: [{ onsetBeats: 1, durationBeats: 0.5, pitch: 62, velocity: 1 }], target: 'C', bank });
  const before = structuredClone(bank);
  const next = print({ notes: [{ onsetBeats: 2, durationBeats: 0.5, pitch: 64, velocity: 1 }], target: 'B', bank });
  assert.deepEqual(bank, before, 'the input bank is not mutated');
  assert.deepEqual(next.variations.A, before.variations.A);
  assert.deepEqual(next.variations.C, before.variations.C);
  assert.ok(next.variations.B);
  assert.equal(next.variations.D, undefined);
  assert.equal(next.playVariation, 1);
  assert.equal(next.chainEnabled, false);
  assert.deepEqual(normalizeSynthSequenceVariationBank(next), next);
});

test('printing into a chained bank keeps the chain playing and re-derives its length from its spans', () => {
  const a = print({ notes: [{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }], phraseBeats: 2, target: 'A' });
  const chained: SynthSequenceVariationBank = {
    ...a,
    phraseBeats: 4,
    chainEnabled: true,
    chainOrder: ['A', 'B'],
    variations: { A: a.variations.A!, B: { ...a.variations.A!, id: 'B' } },
  };
  const same = print({ notes: [{ onsetBeats: 1, durationBeats: 0.5, pitch: 62, velocity: 1 }], phraseBeats: 2, target: 'B', bank: chained });
  assert.equal(same.chainEnabled, true);
  assert.equal(same.phraseBeats, 4);
  const longer = print({ notes: [{ onsetBeats: 1, durationBeats: 0.5, pitch: 62, velocity: 1 }], phraseBeats: 4, target: 'B', bank: chained });
  assert.equal(longer.chainEnabled, true);
  assert.equal(longer.phraseBeats, 6);
  assert.equal(longer.playVariation, 0);
  assert.doesNotThrow(() => normalizeSynthSequenceVariationBank(longer));
  // A variation outside the chain does not disturb it either.
  const outside = print({ notes: [{ onsetBeats: 1, durationBeats: 0.5, pitch: 62, velocity: 1 }], phraseBeats: 4, target: 'C', bank: chained });
  assert.equal(outside.chainEnabled, true);
  assert.equal(outside.phraseBeats, 4);
  assert.deepEqual(outside.chainOrder, ['A', 'B']);
});

test('bank revision check treats an edited bank as different and a copy as the same', () => {
  const bank = print({ notes: [{ onsetBeats: 0, durationBeats: 0.5, pitch: 60, velocity: 1 }] });
  assert.equal(isSameSynthSequenceVariationBank(bank, structuredClone(bank)), true);
  assert.equal(isSameSynthSequenceVariationBank(null, null), true);
  assert.equal(isSameSynthSequenceVariationBank(bank, null), false);
  const edited = structuredClone(bank);
  edited.variations.A!.cells[0] = createRestNotesCell();
  assert.equal(isSameSynthSequenceVariationBank(bank, edited), false);
});

test('a schema 1 bank loads as cells: rest, Fixed root + interval, Harmony and arp articulation', () => {
  const lane = (mode: 'notes' | 'semitones') => ({
    overrides: { triggerToggles: [[0, 1, 2].map((step) => ({ step, value: true }))] },
    state: { clockDiv: '1/4' as const, pitchSettings: { mode, root: 60, scale: 'Chromatic' as const } },
  });
  const v1 = (mode: 'notes' | 'semitones') => ({
    schemaVersion: 1, phraseBeats: 4, clockDiv: '1/4', chainEnabled: false, playVariation: 0, chainOrder: ['A'],
    variations: { A: {
      id: 'A', steps: 4, spanBeats: 4, lane: lane(mode),
      stepMetadata: {
        '0': { mode: 'chord', gateBeats: 1, chord: { intervals: [{ intervalSemitones: 0, velocity: 1 }, { intervalSemitones: 4, velocity: 0.5, gateBeats: 2 }] } },
        '1': { mode: 'note', gateBeats: 0.5, followHarmony: true },
      },
    } },
  });
  const notes = normalizeSynthSequenceVariationBank(v1('notes'))!.variations.A!;
  assert.equal(notes.notesLane.length, 4);
  assert.equal(notes.cells.length, 32);
  assert.equal(notes.cells[0]!.kind, 'chord');
  assert.deepEqual(notes.cells[0]!.chord!.notes, [{ midi: 60, velocity: 1 }, { midi: 64, velocity: 0.5, gate: 2 }]);
  assert.equal(notes.cells[1]!.kind, 'harmony', 'followHarmony stays Harmony in Notes mode');
  assert.equal(notes.cells[2]!.kind, 'chord', 'an active step without metadata is a plain Fixed note in Notes mode');
  assert.equal(notes.cells[3]!.kind, 'rest');
  const semitones = normalizeSynthSequenceVariationBank(v1('semitones'))!.variations.A!;
  assert.equal(semitones.cells[0]!.kind, 'harmony');
  assert.deepEqual(semitones.cells[0]!.intervals, [{ midi: 0, velocity: 1 }, { midi: 4, velocity: 0.5, gate: 2 }]);
  assert.equal(semitones.cells[3]!.kind, 'rest');
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
  // A variation may run its own grid, but its span must match that grid.
  const wrongClock = structuredClone(bank);
  wrongClock.variations.A!.lane.state.clockDiv = '1/8';
  assert.throws(() => normalizeSynthSequenceVariationBank(wrongClock), /steps\/spanBeats/);
  const unsupportedClock = structuredClone(bank);
  (unsupportedClock.variations.A!.lane.state as { clockDiv: string }).clockDiv = '1/3';
  assert.throws(() => normalizeSynthSequenceVariationBank(unsupportedClock), /clockDiv/);
});

test('normalization rejects malformed Notes lanes and cells', () => {
  const bank = printedBank([{ onsetBeats: 0, durationBeats: 0.25, pitch: 60, velocity: 1 }]);
  const badLane = structuredClone(bank);
  badLane.variations.A!.notesLane.length = 33;
  assert.throws(() => normalizeSynthSequenceVariationBank(badLane), /notesLane\.length/);
  const badAdvance = structuredClone(bank) as unknown as { variations: { A: { notesLane: { advance: string } } } };
  badAdvance.variations.A.notesLane.advance = 'beats';
  assert.throws(() => normalizeSynthSequenceVariationBank(badAdvance), /advance/);
  const badCell = structuredClone(bank);
  badCell.variations.A!.cells[0] = { kind: 'harmony', intervals: [{ midi: 60, velocity: 1 }], gateBeats: 0, articulation: 'chord' };
  assert.throws(() => normalizeSynthSequenceVariationBank(badCell), /intervals/);
  const manyNotes = structuredClone(bank);
  manyNotes.variations.A!.cells[0]!.chord!.notes = Array.from({ length: 40 }, (_, index) => ({ midi: 40 + (index % 40) }));
  assert.equal(normalizeSynthSequenceVariationBank(manyNotes)!.variations.A!.cells[0]!.chord!.notes.length, 32);
});
