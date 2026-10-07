import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CoreProductSynthSequenceVariationSynchronizer,
  type CoreProductSynthSequenceVariationRuntimeBridge,
} from './CoreProductSynthSequenceVariationSynchronizer';
import type { SynthSequenceVariationBank } from '../../../ui/sequencer/synthSequenceVariations';

function bank(): SynthSequenceVariationBank {
  const lane = {
    overrides: { triggerToggles: [[{ step: 0, value: true }]] },
    state: { clockDiv: '1/4' as const, swing: 0, pitchSettings: { mode: 'notes' as const, root: 60, scale: 'Chromatic' as const }, pitchBindingMode: 'sequence' as const },
  };
  const variation = { id: 'A' as const, steps: 4, spanBeats: 4, lane, stepMetadata: { '0': { mode: 'note' as const, gateBeats: 1 } } };
  return { schemaVersion: 1, phraseBeats: 4, clockDiv: '1/4', chainEnabled: false, playVariation: 0, chainOrder: ['A'], variations: { A: variation } };
}

test('bootstrap, restore, and null preset state send only changed targets', async () => {
  const synchronizer = new CoreProductSynthSequenceVariationSynchronizer(4);
  const calls: Array<{ lane: number; bank: SynthSequenceVariationBank | null }> = [];
  const runtime: CoreProductSynthSequenceVariationRuntimeBridge = {
    commitSynthSequenceVariationBank: async (lane, next) => {
      calls.push({ lane, bank: next });
      return true;
    },
  };
  const source = [bank(), null, null, null];
  synchronizer.setTargetsFromState(source);
  await synchronizer.sync(() => runtime);
  await synchronizer.sync(() => runtime);
  await synchronizer.replay(() => runtime);
  synchronizer.setTargetsFromState([null, null, null, null]);
  await synchronizer.sync(() => runtime);

  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.lane, 0);
  assert.ok(calls[0]?.bank);
  assert.ok(calls[1]?.bank);
  assert.deepEqual(calls[2], { lane: 0, bank: null });
});

test('a rejected bank receipt retains the previously accepted target', async () => {
  const synchronizer = new CoreProductSynthSequenceVariationSynchronizer(4);
  const previous = bank();
  const rejected = {
    ...previous,
    phraseBeats: 8,
    variations: { A: { ...previous.variations.A!, steps: 8, spanBeats: 8 } },
  };
  synchronizer.setTargetsFromState([previous]);
  let reject = false;
  const calls: Array<SynthSequenceVariationBank | null> = [];
  const runtime: CoreProductSynthSequenceVariationRuntimeBridge = {
    commitSynthSequenceVariationBank: async (_lane, next) => {
      calls.push(next);
      if (reject) return false;
      return true;
    },
  };
  await synchronizer.sync(() => runtime);
  reject = true;
  await assert.rejects(synchronizer.commit(0, rejected, () => runtime), /not applied/);
  reject = false;
  await synchronizer.replay(() => runtime);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2], previous);
});

test('a target replacement during an in-flight receipt is sent on the next sync', async () => {
  const synchronizer = new CoreProductSynthSequenceVariationSynchronizer(4);
  const first = bank();
  const second = {
    ...first,
    phraseBeats: 8,
    variations: { A: { ...first.variations.A!, steps: 8, spanBeats: 8 } },
  };
  synchronizer.setTargetsFromState([first]);
  const calls: Array<SynthSequenceVariationBank | null> = [];
  let release!: (accepted: boolean) => void;
  const delayedReceipt = new Promise<boolean>((resolve) => { release = resolve; });
  const runtime: CoreProductSynthSequenceVariationRuntimeBridge = {
    commitSynthSequenceVariationBank: async (_lane, next) => {
      calls.push(next);
      if (calls.length === 1) return delayedReceipt;
      return true;
    },
  };

  const firstSync = synchronizer.sync(() => runtime);
  await Promise.resolve();
  synchronizer.setTargetsFromState([second]);
  release(true);
  await firstSync;
  await synchronizer.sync(() => runtime);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.phraseBeats, 4);
  assert.equal(calls[1]?.phraseBeats, 8);
});

test('persisted variation selection and chain edits each produce one bank transaction', async () => {
  const synchronizer = new CoreProductSynthSequenceVariationSynchronizer(4);
  const initial = bank();
  const selected: SynthSequenceVariationBank = {
    ...initial,
    phraseBeats: 8,
    playVariation: 1,
    chainOrder: ['A', 'B'],
    variations: { ...initial.variations, B: { ...initial.variations.A!, id: 'B' } },
  };
  const calls: Array<SynthSequenceVariationBank | null> = [];
  const runtime: CoreProductSynthSequenceVariationRuntimeBridge = {
    commitSynthSequenceVariationBank: async (_lane, next) => { calls.push(next); return true; },
  };
  synchronizer.setTargetsFromState([selected]);
  await synchronizer.sync(() => runtime);
  synchronizer.setTargetsFromState([selected]);
  await synchronizer.sync(() => runtime);
  const chained = { ...selected, chainEnabled: true };
  synchronizer.setTargetsFromState([chained]);
  await synchronizer.sync(() => runtime);
  await synchronizer.sync(() => runtime);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.playVariation, 1);
  assert.equal(calls[1]?.chainEnabled, true);
});

test('UI bank-only resize and clock patches reach the host queue and encoded runtime payload', async () => {
  const { CoreProductStatePatchQueue } = await import('./CoreProductStatePatchQueue');
  const { collectChangedStatePatch } = await import('../../../ui/audioEngineStatePatch');
  const { encodeSynthSequenceVariationBank } = await import('../synthSequenceVariationEncoder');
  const synchronizer = new CoreProductSynthSequenceVariationSynchronizer(4);
  const initial = bank();
  initial.phraseBeats = 8;
  initial.variations.A = { ...initial.variations.A!, steps: 8, spanBeats: 8 };
  let state: Record<string, unknown> = { synthSequenceVariationBanks: [initial] };
  const payloads: DataView[] = [];
  const bridge = { commitSynthSequenceVariationBank: async (_lane: number, next: SynthSequenceVariationBank | null) => {
    payloads.push(new DataView(encodeSynthSequenceVariationBank(next)));
    return true;
  } };
  const queue = new CoreProductStatePatchQueue({
    latestSliderState: () => state,
    applyProductState: async (next) => {
      state = next;
      synchronizer.setTargetsFromState(next.synthSequenceVariationBanks);
      await synchronizer.sync(() => bridge);
      return { applied: true, mode: 'event' };
    },
  });
  await queue.apply(state, 'product-patch');
  const resized = { ...initial, phraseBeats: 24, variations: { A: { ...initial.variations.A!, steps: 24, spanBeats: 24 } } };
  const resizedState = { ...state, synthSequenceVariationBanks: [resized] };
  await queue.apply(collectChangedStatePatch(state as never, resizedState as never), 'product-patch');
  const triplet: SynthSequenceVariationBank = { ...resized, clockDiv: '1/8T', phraseBeats: 8,
    variations: { A: { ...resized.variations.A, spanBeats: 8,
      lane: { ...resized.variations.A.lane, state: { ...resized.variations.A.lane.state, clockDiv: '1/8T' } },
    } },
  };
  await queue.apply(collectChangedStatePatch(state as never, { ...state, synthSequenceVariationBanks: [triplet] } as never), 'product-patch');
  assert.deepEqual(payloads.map((payload) => payload.getUint32(40, true)), [8, 24, 24]);
  assert.deepEqual(payloads.map((payload) => payload.getUint32(44, true)), [4, 4, 12]);
});
