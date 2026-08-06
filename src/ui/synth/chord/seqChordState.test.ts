import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHarmonyIntent, type HarmonyChordSlot } from '../../../audio/CoreProductHarmonyControl';
import { emptyHarmonyDraft } from '../../harmony/shared/harmonyDraftHelpers';
import { applySeqSuggestionToDraft, editSeqSharedSlotExactNotes, readSeqHarmonySlots, seqHarmonySlotsKey, writeSeqHarmonySlots } from './seqChordState';

test('Seq slot patches are bank-specific and never write the legacy slot authority', () => {
  assert.equal(seqHarmonySlotsKey('A'), 'harmonyChordSlotsA');
  const slots = [{ id: 0, name: 'B', intent: defaultHarmonyIntent('slot', 0), chord: null, locked: false }];
  const next = writeSeqHarmonySlots({ harmonyChordSlots: ['legacy'], harmonyChordSlotsA: [] }, 'B', slots);
  assert.deepEqual(next.harmonyChordSlots, ['legacy']);
  assert.deepEqual(next.harmonyChordSlotsB, slots);
  assert.deepEqual(readSeqHarmonySlots(next, 'B')[0], { id: 0, name: 'B', chord: null, locked: false });
  assert.deepEqual(readSeqHarmonySlots({}, 'A', slots)[0], { id: 0, name: 'B', chord: null, locked: false });
});

test('suggestion application clears stale semantic intent while accepting its new intent', () => {
  const stale = { ...emptyHarmonyDraft(), intent: { ...defaultHarmonyIntent('manualControl', 0), quality: 'min' as const }, intentSource: 'confirmed' as const, exactMidiNotes: [60, 63, 67] };
  const suggestionIntent = { ...defaultHarmonyIntent('audition', 4), quality: 'dom7' as const };
  const next = applySeqSuggestionToDraft(stale, { notes: [67, 71, 74, 77], label: 'G7', intent: suggestionIntent });
  assert.deepEqual(next.exactMidiNotes, [67, 71, 74, 77]);
  assert.equal(next.intent?.quality, 'dom7');
  assert.equal(next.intentSource, 'confirmed');
  assert.equal(next.recognitionMismatch, false);
  assert.equal(next.source, 'suggestion');
});

test('first Seq matrix note materializes an empty shared slot through capture', () => {
  const empty: HarmonyChordSlot = { id: 0, name: 'Slot 1', chord: null, locked: false };
  const next = editSeqSharedSlotExactNotes(empty, [60], { rootMidi: 60, scaleId: 1 });
  assert(next.chord, 'the first authored matrix note must create the shared chord');
  assert.deepEqual(next.chord.exactMidiNotes, [60]);
  assert.equal(next.chord.recognizedLabel, 'custom');
});

test('removing the last exact note preserves confirmed semantic intent', () => {
  const intent = { ...defaultHarmonyIntent('slot', 0), quality: 'maj' as const };
  const slot: HarmonyChordSlot = {
    id: 0,
    name: 'Slot 1',
    locked: false,
    chord: {
      intent,
      intentSource: 'confirmed',
      exactMidiNotes: [60],
      recognizedLabel: 'C maj',
      playbackBehavior: 'auto',
      capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
    },
  };
  const next = editSeqSharedSlotExactNotes(slot, [], { rootMidi: 60, scaleId: 1 });
  assert(next.chord, 'clearing exact notes must not delete the shared slot intent');
  assert.deepEqual(next.chord.exactMidiNotes, []);
  assert.equal(next.chord.intent?.quality, 'maj');
  assert.equal(next.chord.intentSource, 'confirmed');
});
