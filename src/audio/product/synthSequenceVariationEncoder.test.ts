import { cycleSequencerRatchet } from '../seqEvolveCore';
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultProductArpConfig } from '../productArpeggiator';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import {
  autoPrintSynthSequenceVariation,
  createRestNotesCell,
  normalizeSynthSequenceVariationBank,
  withNotesCellGate,
  type NotesCell,
  type SynthSequenceVariationBank,
  type SynthVariationLane,
} from '../../ui/sequencer/synthSequenceVariations';
import {
  encodeSynthSequenceVariationBank,
  SYNTH_SEQUENCE_VARIATION_BANK_BYTES,
  SYNTH_SEQUENCE_VARIATION_SNAPSHOT_BYTES,
  SYNTH_SEQUENCE_VARIATION_CELL_BYTES,
} from './synthSequenceVariationEncoder';

function baseLane(): SynthVariationLane {
  return {
    overrides: {},
    state: {
      clockDiv: '1/4',
      swing: 0,
      linked: false,
      pitchSettings: { mode: 'semitones', root: 60, scale: 'Chromatic' },
      pitchBindingMode: 'sequence',
    },
  };
}

function printedBank(): SynthSequenceVariationBank {
  const result = autoPrintSynthSequenceVariation({
    phraseBeats: 4,
    baseLane: baseLane(),
    notes: [
      { onsetBeats: 0.2, durationBeats: 0.5, pitch: 61, velocity: 0.25 },
      { onsetBeats: 1.3, durationBeats: 6, pitch: 64, velocity: 0.75 },
    ],
    targetVariation: 'A',
    bank: null,
  });
  assert.equal(result.accepted, true, result.message);
  assert.ok(result.bank);
  return result.bank;
}

function snapshotOffset(index: number): number {
  return 40 + index * SYNTH_SEQUENCE_VARIATION_SNAPSHOT_BYTES;
}

function cellOffset(snapshot: number, cell: number): number {
  return snapshot + 1684 + cell * SYNTH_SEQUENCE_VARIATION_CELL_BYTES;
}

const CELL_NOTES = 152;
const CELL_NOTE_BYTES = 20;

test('encodes native ABI sizes, offsets, independent sub-lane lengths, and printed fixed cells', () => {
  const bank = printedBank();
  const bytes = encodeSynthSequenceVariationBank(bank);
  assert.equal(bytes.byteLength, SYNTH_SEQUENCE_VARIATION_BANK_BYTES);
  assert.equal(SYNTH_SEQUENCE_VARIATION_SNAPSHOT_BYTES, 27028);
  assert.equal(SYNTH_SEQUENCE_VARIATION_CELL_BYTES, 792);
  const view = new DataView(bytes);
  assert.equal(view.getUint32(0, true), 2);
  assert.equal(view.getUint32(4, true), 1);
  assert.equal(view.getUint32(8, true), 1);
  assert.equal(view.getUint32(12, true), 0);
  assert.equal(view.getUint32(28, true), 0);

  const snapshot = snapshotOffset(0);
  assert.equal(view.getUint32(snapshot, true), 4);
  assert.equal(view.getUint32(snapshot + 4, true), 4);
  assert.equal(view.getUint32(snapshot + 12, true), 0b0011);
  // A print switches Pitch, Expression and Nudge off (fields 4, 5 and 8): the notes carry them.
  const enabled = view.getUint32(snapshot + 16, true);
  for (const field of [4, 5, 8]) assert.equal((enabled >> field) & 1, 0, `field ${field} is off`);
  // The Notes lane (field 9) walks one cell per step, forward, Advance = Steps.
  assert.equal(view.getUint32(snapshot + 20 + 9 * 4, true), 4);
  assert.equal(view.getUint32(snapshot + 60 + 9 * 4, true), 0);
  assert.equal((view.getUint32(snapshot + 100, true) >> 9) & 1, 0);

  // Each attack is a FIXED cell holding its absolute note, offset, velocity and gate.
  const firstCell = cellOffset(snapshot, 0);
  assert.equal(view.getUint32(firstCell, true), 2);
  assert.equal(view.getUint32(firstCell + 4, true), 0);
  assert.equal(view.getUint32(firstCell + 8, true), 1);
  assert.equal(view.getFloat32(firstCell + 12, true), 0.5);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES, true), 61);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES + 4, true), 0.25);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES + 8, true), 0.5);
  assert.ok(Math.abs(view.getFloat32(firstCell + CELL_NOTES + 12, true) - 0.2) < 1e-6);
  assert.equal(view.getUint32(firstCell + CELL_NOTES + 16, true), 0);
  const secondCell = cellOffset(snapshot, 1);
  assert.equal(view.getFloat32(secondCell + 12, true), 6);
  assert.equal(view.getFloat32(secondCell + CELL_NOTES, true), 64);
  assert.ok(Math.abs(view.getFloat32(secondCell + CELL_NOTES + 12, true) - 0.3) < 1e-6);
  // A step without a trigger is a REST cell with no notes.
  assert.equal(view.getUint32(cellOffset(snapshot, 2), true), 0);
  assert.equal(view.getUint32(cellOffset(snapshot, 2) + 8, true), 0);
});

test('pitch Advance follows the pitch binding and Harmony cells ride the harmony pitch', () => {
  const bank = printedBank();
  const lane = bank.variations.A!.lane;
  for (const [binding, hits] of [['polyrhythmic', true], ['linked', true], ['sequence', false]] as const) {
    lane.state.pitchBindingMode = binding;
    const view = new DataView(encodeSynthSequenceVariationBank(bank));
    assert.equal((view.getUint32(snapshotOffset(0) + 100, true) & (1 << 4)) !== 0, hits, binding);
  }
  bank.variations.A!.cells[0] = { kind: 'harmony', intervals: [{ midi: -5, velocity: 0.5, gate: 2 }], gateBeats: 1, articulation: 'chord' };
  const view = new DataView(encodeSynthSequenceVariationBank(bank));
  const cell = cellOffset(snapshotOffset(0), 0);
  assert.equal(view.getUint32(cell, true), 1);
  assert.equal(view.getFloat32(cell + CELL_NOTES, true), -5);
  assert.equal(view.getFloat32(cell + CELL_NOTES + 8, true), 2);
});

test('writes chained snapshots at their own bases, the Notes lane from notesLane, and sparse non-chain selection', () => {
  const source = printedBank();
  const a = source.variations.A!;
  const b = {
    ...a,
    id: 'B' as const,
    steps: 2,
    spanBeats: 2,
    notesLane: { length: 2, direction: 'reverse' as const, advance: 'hits' as const },
    lane: {
      state: {
        ...a.lane.state,
        subLaneStates: {
          ...a.lane.state.subLaneStates,
          pitch: { enabled: true, steps: 2, direction: 'forward' as const },
          expression: { enabled: true, steps: 3, direction: 'reverse' as const },
        },
      },
      overrides: {
        ...a.lane.overrides,
        triggerClips: [null],
        triggerToggles: [[{ step: 0, value: true }]],
        pitch: [[0, 1]],
        expression: [[0.1, 0.2, 0.3]],
      },
    },
  };
  const chained: SynthSequenceVariationBank = {
    ...source,
    phraseBeats: 6,
    chainEnabled: true,
    chainOrder: ['A', 'B'],
    variations: { A: a, B: b },
  };
  const chainedView = new DataView(encodeSynthSequenceVariationBank(chained));
  assert.equal(chainedView.getUint32(8, true), 2);
  assert.equal(chainedView.getUint32(12, true), 0);
  assert.equal(chainedView.getUint32(16, true), 1);
  const bOffset = snapshotOffset(1);
  assert.equal(chainedView.getUint32(bOffset, true), 2);
  assert.equal(chainedView.getUint32(bOffset + 20 + 4 * 4, true), 2);
  assert.equal(chainedView.getUint32(bOffset + 20 + 5 * 4, true), 3);
  assert.equal(chainedView.getUint32(bOffset + 12, true), 1);
  assert.equal(chainedView.getUint32(bOffset + 20 + 9 * 4, true), 2);
  assert.equal(chainedView.getUint32(bOffset + 60 + 9 * 4, true), 1);
  assert.equal((chainedView.getUint32(bOffset + 100, true) >> 9) & 1, 1);

  const sparse: SynthSequenceVariationBank = {
    ...source,
    chainEnabled: false,
    chainOrder: ['B'],
    playVariation: 1,
    variations: { B: { ...a, id: 'B' } },
  };
  const sparseView = new DataView(encodeSynthSequenceVariationBank(sparse));
  assert.equal(sparseView.getUint32(8, true), 1);
  assert.equal(sparseView.getUint32(12, true), 1);
  assert.equal(sparseView.getUint32(28, true), 1);
  assert.equal(sparseView.getUint32(snapshotOffset(1), true), 4);
});

test('encodes Harmony, Fixed and Follow cells with per-note offset and destination, and full per-cell ARP configuration', () => {
  const source = printedBank();
  const variation = source.variations.A!;
  const arp = defaultProductArpConfig();
  arp.enabled = true;
  arp.flow = 'downUp';
  arp.rate = 2;
  arp.length = 3;
  arp.pulseMask = 0b111;
  arp.resetMask = 0b001;
  arp.contour = [0, 2, -1];
  variation.cells[0] = {
    kind: 'harmony',
    intervals: [
      { midi: 0, velocity: 1, gate: 3 },
      { midi: 7, velocity: 0.5, gate: 1 },
    ],
    gateBeats: 5,
    articulation: 'arp',
    arp: { config: arp, spanBeats: 2 },
  };
  variation.cells[1] = {
    kind: 'chord',
    chord: {
      behavior: 'fixed', degree: 0, quality: 'diatonic', extensions: [], voicing: { inversion: 0, spread: 0, register: 0, bass: 'inversion' },
      notes: [
        { midi: 60, velocity: 0.5, gate: 1, offset: 0.25, destination: 3 },
        { midi: 67, velocity: 0.75, gate: 2 },
      ],
    },
    gateBeats: 2,
    articulation: 'chord',
  };
  variation.cells[2] = {
    kind: 'chord',
    chord: {
      behavior: 'follow', degree: 2, quality: 'minor', extensions: ['7'], voicing: { inversion: 1, spread: 0.5, register: -1, bass: 'root' },
      notes: [{ midi: 60 }],
    },
    gateBeats: 1,
    articulation: 'chord',
  };
  const view = new DataView(encodeSynthSequenceVariationBank(source));
  const step = cellOffset(snapshotOffset(0), 0);
  assert.equal(view.getUint32(step, true), 1);
  assert.equal(view.getUint32(step + 4, true), 1);
  assert.equal(view.getUint32(step + 8, true), 2);
  assert.equal(view.getFloat32(step + 12, true), 5);
  assert.equal(view.getFloat32(step + 16, true), 2);
  assert.equal(view.getUint32(step + 28, true), 3);
  assert.equal(view.getUint32(step + 32, true), 0b111);
  assert.equal(view.getUint32(step + 36, true), 3);
  assert.equal(view.getUint32(step + 40, true), 0);
  assert.equal(view.getUint32(step + 44, true), 0);
  assert.equal(view.getUint32(step + 48, true), 1);
  assert.equal(view.getInt32(step + 52 + 4, true), 2);
  // Harmony notes are semitone intervals.
  assert.equal(view.getFloat32(step + CELL_NOTES, true), 0);
  assert.equal(view.getFloat32(step + CELL_NOTES + 8, true), 3);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES, true), 7);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES + 4, true), 0.5);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES + 8, true), 1);

  const fixed = cellOffset(snapshotOffset(0), 1);
  assert.equal(view.getUint32(fixed, true), 2);
  assert.equal(view.getUint32(fixed + 8, true), 2);
  assert.equal(view.getFloat32(fixed + CELL_NOTES, true), 60);
  assert.equal(view.getFloat32(fixed + CELL_NOTES + 12, true), 0.25);
  assert.equal(view.getUint32(fixed + CELL_NOTES + 16, true), 3);
  assert.equal(view.getFloat32(fixed + CELL_NOTES + CELL_NOTE_BYTES, true), 67);
  assert.equal(view.getUint32(fixed + CELL_NOTES + CELL_NOTE_BYTES + 16, true), 0);

  // Follow cells send intent only; the notes are a display cache and stay unsent.
  const follow = cellOffset(snapshotOffset(0), 2);
  assert.equal(view.getUint32(follow, true), 3);
  assert.equal(view.getUint32(follow + 8, true), 0);
  assert.equal(view.getUint32(follow + 116, true), 0);
  assert.equal(view.getInt32(follow + 116 + 4, true), 2);
  assert.equal(view.getUint32(follow + 116 + 8, true), 2);
  assert.equal(view.getUint32(follow + 116 + 12, true), 0b10);
  assert.equal(view.getInt32(follow + 116 + 16, true), 1);
  assert.equal(view.getFloat32(follow + 116 + 20, true), 0.5);
  assert.equal(view.getInt32(follow + 116 + 24, true), -1);
  assert.equal(view.getUint32(follow + 116 + 28, true), 1);
});

test('rejects values the native ABI cannot represent instead of clamping them', () => {
  const source = printedBank();
  const variation = source.variations.A!;
  variation.lane.overrides.probability = [[1.1]];
  assert.throws(() => encodeSynthSequenceVariationBank(source), RangeError);

  const invalidInterval = printedBank();
  invalidInterval.variations.A!.cells[0] = {
    kind: 'harmony', intervals: [{ midi: 49, velocity: 1 }], gateBeats: 1, articulation: 'chord',
  };
  assert.throws(() => encodeSynthSequenceVariationBank(invalidInterval), /invalid intervals/);

  const invalidArp = printedBank();
  invalidArp.variations.A!.cells[0] = {
    kind: 'harmony',
    intervals: [{ midi: 0, velocity: 1 }],
    gateBeats: 1,
    articulation: 'arp',
    arp: { config: { ...defaultProductArpConfig(), contour: [13] } },
  };
  assert.throws(() => encodeSynthSequenceVariationBank(invalidArp), RangeError);
});

test('every UI ratchet cycle remains encodable and wraps from four to one', () => {
  const bank = printedBank();
  let ratchet: number | undefined;
  const values: number[] = [];
  for (let click = 0; click < 5; click += 1) {
    ratchet = cycleSequencerRatchet(ratchet);
    values.push(ratchet);
    bank.variations.A!.lane.overrides.ratchet = [[ratchet]];
    assert.doesNotThrow(() => encodeSynthSequenceVariationBank(bank));
  }
  assert.deepEqual(values, [2, 3, 4, 1, 2]);
});

test('shared length scales encoded chord voice holds and preserves the arp run span', () => {
  const bank = printedBank();
  const cell: NotesCell = {
    kind: 'harmony',
    intervals: [
      { midi: 0, velocity: 1, gate: 4 },
      { midi: 7, velocity: 1, gate: 2 },
    ],
    gateBeats: 4,
    articulation: 'arp',
    arp: { config: defaultProductArpConfig(), spanBeats: 8 },
  };
  bank.variations.A!.cells[0] = withNotesCellGate(cell, 2);
  const view = new DataView(encodeSynthSequenceVariationBank(bank));
  const step = cellOffset(snapshotOffset(0), 0);
  assert.equal(view.getFloat32(step + 12, true), 2);
  assert.equal(view.getFloat32(step + 16, true), 8);
  assert.equal(view.getFloat32(step + CELL_NOTES + 8, true), 2);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES + 8, true), 1);
  assert.equal(cell.intervals![0]!.gate, 4);
  assert.equal(withNotesCellGate({ ...cell, gateBeats: 0 }, 3).intervals?.[0]?.gate, 3);
});

test('shared length UI caps every chord voice at the supported hold limit', () => {
  const cell: NotesCell = {
    kind: 'harmony',
    intervals: [{ midi: 0, velocity: 1, gate: 2 }, { midi: 7, velocity: 1, gate: 8 }],
    gateBeats: 2,
    articulation: 'chord',
  };
  const bounded = withNotesCellGate(cell, 100);
  assert.equal(bounded.gateBeats, 16);
  assert.deepEqual(bounded.intervals?.map((note) => note.gate), [16, 64]);
  assert.equal(withNotesCellGate({ ...createRestNotesCell(), gateBeats: 1 }, 100).gateBeats, 64);
});

test('printing into one variation leaves the other variations byte-identical', () => {
  const printInto = (bank: SynthSequenceVariationBank | null, target: 'A' | 'B' | 'C' | 'D', pitch: number) => {
    const result = autoPrintSynthSequenceVariation({
      phraseBeats: 4,
      baseLane: baseLane(),
      notes: [{ onsetBeats: 0.5, durationBeats: 0.5, pitch, velocity: 0.8 }],
      targetVariation: target,
      bank,
    });
    assert.equal(result.accepted, true, result.message);
    return result.bank!;
  };
  let bank = printInto(null, 'A', 60);
  bank = printInto(bank, 'C', 62);
  bank = printInto(bank, 'D', 63);
  bank = printInto(bank, 'B', 64);
  const before = new Uint8Array(encodeSynthSequenceVariationBank(bank));
  const after = new Uint8Array(encodeSynthSequenceVariationBank(printInto(bank, 'B', 70)));
  const slice = (bytes: Uint8Array, index: number) => bytes.slice(snapshotOffset(index), snapshotOffset(index + 1));
  for (const index of [0, 2, 3]) assert.deepEqual(slice(after, index), slice(before, index), `variation ${'ABCD'[index]}`);
  assert.notDeepEqual(slice(after, 1), slice(before, 1));
  assert.equal(new DataView(after.buffer).getUint32(28, true), 1, 'the printed variation plays when the chain is off');
});

interface V1Fixture { bank: unknown; bytesGzipBase64: string; byteLength: number }

test('a schema 1 bank encodes to the same bytes as before the cell model (Notes and Semitones modes)', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./synthSequenceVariationV1Fixture.json', import.meta.url), 'utf8')) as Record<'notes' | 'semitones', V1Fixture>;
  for (const mode of ['notes', 'semitones'] as const) {
    const fixture = fixtures[mode];
    const expected = new Uint8Array(gunzipSync(Buffer.from(fixture.bytesGzipBase64, 'base64')));
    assert.equal(expected.length, fixture.byteLength);
    const normalized = normalizeSynthSequenceVariationBank(fixture.bank);
    assert.equal(normalized?.schemaVersion, 2);
    const actual = new Uint8Array(encodeSynthSequenceVariationBank(normalized));
    assert.equal(actual.length, expected.length);
    const mismatch = actual.findIndex((byte, index) => byte !== expected[index]);
    assert.equal(mismatch, -1, `${mode}: first differing byte ${mismatch}`);
    // The v1 bank encodes identically without a prior normalize, and the v2 form round-trips.
    assert.deepEqual(new Uint8Array(encodeSynthSequenceVariationBank(fixture.bank as SynthSequenceVariationBank)), expected);
    assert.deepEqual(normalizeSynthSequenceVariationBank(JSON.parse(JSON.stringify(normalized))), normalized);
  }
});
