import { cycleSequencerRatchet } from '../seqEvolveCore';
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultProductArpConfig } from '../productArpeggiator';
import {
  autoPrintSynthSequenceVariation,
  withSynthVariationStepLength,
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
  // Fields 4/5/8 are pitch/expression/nudge. Their lengths are intentionally
  // independent: pitch follows the owning grid, the others follow hits.
  assert.equal(view.getUint32(snapshot + 20 + 4 * 4, true), 4);
  assert.equal(view.getUint32(snapshot + 20 + 5 * 4, true), 2);
  assert.equal(view.getUint32(snapshot + 20 + 8 * 4, true), 2);
  // The Notes lane (field 9) walks one cell per step, forward, Advance = Steps.
  assert.equal(view.getUint32(snapshot + 20 + 9 * 4, true), 4);
  assert.equal(view.getUint32(snapshot + 60 + 9 * 4, true), 0);
  // The printed lane binds pitch to 'sequence', so pitch Advance (bit 4) is Steps.
  assert.equal(view.getUint32(snapshot + 100, true), (1 << 5) | (1 << 8));
  assert.equal(view.getUint32(snapshot + 116, true), 0b1111);
  assert.equal(view.getFloat32(snapshot + 660, true), 0);
  assert.equal(view.getFloat32(snapshot + 660 + 4, true), 3);
  assert.equal(view.getFloat32(snapshot + 788, true), 0.25);
  assert.ok(Math.abs(view.getFloat32(snapshot + 1556, true) - 0.2) < 1e-6);

  // Printed Notes-mode steps are FIXED cells at root + interval (root 61).
  const firstCell = cellOffset(snapshot, 0);
  assert.equal(view.getUint32(firstCell, true), 2);
  assert.equal(view.getUint32(firstCell + 4, true), 0);
  assert.equal(view.getUint32(firstCell + 8, true), 1);
  assert.equal(view.getFloat32(firstCell + 12, true), 0.5);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES, true), 61);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES + 4, true), 1);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES + 8, true), 0);
  assert.equal(view.getFloat32(firstCell + CELL_NOTES + 12, true), 0);
  assert.equal(view.getUint32(firstCell + CELL_NOTES + 16, true), 0);
  const secondCell = cellOffset(snapshot, 1);
  assert.equal(view.getFloat32(secondCell + 12, true), 6);
  assert.equal(view.getFloat32(secondCell + CELL_NOTES, true), 61);
  // A step without a trigger is a REST cell with no notes.
  assert.equal(view.getUint32(cellOffset(snapshot, 2), true), 0);
  assert.equal(view.getUint32(cellOffset(snapshot, 2) + 8, true), 0);
});

test('pitch Advance follows the pitch binding and Semitones steps ride the harmony pitch', () => {
  const bank = printedBank();
  const lane = bank.variations.A!.lane;
  for (const [binding, hits] of [['polyrhythmic', true], ['linked', true], ['sequence', false]] as const) {
    lane.state.pitchBindingMode = binding;
    const view = new DataView(encodeSynthSequenceVariationBank(bank));
    assert.equal((view.getUint32(snapshotOffset(0) + 100, true) & (1 << 4)) !== 0, hits, binding);
  }
  lane.state.pitchSettings = { mode: 'semitones', root: 60, scale: 'Chromatic' };
  const view = new DataView(encodeSynthSequenceVariationBank(bank));
  const cell = cellOffset(snapshotOffset(0), 0);
  assert.equal(view.getUint32(cell, true), 1);
  assert.equal(view.getFloat32(cell + CELL_NOTES, true), 0);
});

test('writes chained snapshots at their own bases and preserves sparse non-chain selection', () => {
  const source = printedBank();
  const a = source.variations.A!;
  const b = {
    ...a,
    id: 'B' as const,
    steps: 2,
    spanBeats: 2,
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
    stepMetadata: { '0': a.stepMetadata['0']! },
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
  assert.equal(chainedView.getUint32(bOffset + 120, true), 0b111);
  assert.ok(Math.abs(chainedView.getFloat32(bOffset + 788 + 2 * 4, true) - 0.3) < 1e-6);

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

test('encodes local chord intervals and full per-step ARP configuration', () => {
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
  variation.stepMetadata = {
    ...variation.stepMetadata,
    '0': {
      mode: 'arp',
      gateBeats: 5,
      chord: {
        intervals: [
          { intervalSemitones: 0, velocity: 1, gateBeats: 3 },
          { intervalSemitones: 7, velocity: 0.5, gateBeats: 1 },
        ],
      },
      arp: { config: arp, spanBeats: 2 },
    },
  };
  const view = new DataView(encodeSynthSequenceVariationBank(source));
  const step = cellOffset(snapshotOffset(0), 0);
  assert.equal(view.getUint32(step, true), 2);
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
  // Fixed cells store root (61) + interval.
  assert.equal(view.getFloat32(step + CELL_NOTES, true), 61);
  assert.equal(view.getFloat32(step + CELL_NOTES + 8, true), 3);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES, true), 68);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES + 4, true), 0.5);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES + 8, true), 1);
});

test('rejects values the native ABI cannot represent instead of clamping them', () => {
  const source = printedBank();
  const variation = source.variations.A!;
  variation.lane.overrides.probability = [[1.1]];
  assert.throws(() => encodeSynthSequenceVariationBank(source), RangeError);

  const invalidInterval = printedBank();
  invalidInterval.variations.A!.stepMetadata['0'] = {
    mode: 'chord',
    gateBeats: 1,
    chord: { intervals: [{ intervalSemitones: 49, velocity: 1 }] },
  };
  assert.throws(() => encodeSynthSequenceVariationBank(invalidInterval), /invalid chord payload/);

  const invalidArp = printedBank();
  invalidArp.variations.A!.stepMetadata['0'] = {
    mode: 'arp',
    gateBeats: 1,
    chord: { intervals: [{ intervalSemitones: 0, velocity: 1 }] },
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
  const metadata = {
    mode: 'arp' as const,
    gateBeats: 4,
    chord: { intervals: [
      { intervalSemitones: 0, velocity: 1, gateBeats: 4 },
      { intervalSemitones: 7, velocity: 1, gateBeats: 2 },
    ] },
    arp: { config: defaultProductArpConfig(), spanBeats: 8 },
  };
  bank.variations.A!.stepMetadata['0'] = withSynthVariationStepLength(metadata, 2);
  const view = new DataView(encodeSynthSequenceVariationBank(bank));
  const step = cellOffset(snapshotOffset(0), 0);
  assert.equal(view.getFloat32(step + 12, true), 2);
  assert.equal(view.getFloat32(step + 16, true), 8);
  assert.equal(view.getFloat32(step + CELL_NOTES + 8, true), 2);
  assert.equal(view.getFloat32(step + CELL_NOTES + CELL_NOTE_BYTES + 8, true), 1);
  assert.equal(metadata.chord.intervals[0]!.gateBeats, 4);
  assert.equal(withSynthVariationStepLength({ ...metadata, gateBeats: 0 }, 3).chord?.intervals[0]?.gateBeats, 3);
});

test('shared length UI caps every chord voice at the supported hold limit', () => {
  const metadata = { mode: 'chord' as const, gateBeats: 2, chord: { intervals: [
    { intervalSemitones: 0, velocity: 1, gateBeats: 2 },
    { intervalSemitones: 7, velocity: 1, gateBeats: 8 },
  ] } };
  const bounded = withSynthVariationStepLength(metadata, 100);
  assert.equal(bounded.gateBeats, 16);
  assert.deepEqual(bounded.chord?.intervals.map((interval) => interval.gateBeats), [16, 64]);
  assert.equal(withSynthVariationStepLength({ mode: 'note', gateBeats: 1 }, 100).gateBeats, 64);
});
