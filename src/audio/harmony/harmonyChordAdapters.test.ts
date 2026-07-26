import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultHarmonyIntent,
  sanitizeHarmonyChordSlots,
  resolveHarmonyIntentToNotePool,
} from '../CoreProductHarmonyControl';
import {
  editSharedChordExactNotes,
  editSharedChordIntent,
  legacyHarmonySlotToSharedSlot,
  sharedChordResolvedMidiPool,
} from './harmonyChordAdapters';

test('legacy semantic slots migrate to intent plus an exact snapshot', () => {
  const intent = { ...defaultHarmonyIntent('slot', 2), quality: 'maj' as const };
  const slot = legacyHarmonySlotToSharedSlot({ id: 2, intent });
  assert(slot.chord);
  assert.deepEqual(slot.chord.intent?.quality, 'maj');
  assert.deepEqual(slot.chord.exactMidiNotes, resolveHarmonyIntentToNotePool({ intent, rootMidi: 60, scaleId: 1, tension: 0.35 }));
  assert.equal(slot.chord.intentSource, 'confirmed');
});

test('capture/edit materializes an empty slot while explicit empty remains empty', () => {
  const intent = { ...defaultHarmonyIntent('slot', 1), quality: 'min' as const };
  const captured = legacyHarmonySlotToSharedSlot({ id: 1, intent });
  assert(captured.chord, 'capturing into an empty slot must author the shared chord');
  const stillEmpty = legacyHarmonySlotToSharedSlot({ id: 1, chord: null, intent });
  assert.equal(stillEmpty.chord, null, 'compatibility intent cannot repopulate explicit emptiness');
});

test('legacy captured voicing is preserved as exact and receives inferred metadata', () => {
  const slot = legacyHarmonySlotToSharedSlot({ id: 0, capturedMidiNotes: [60, 64, 67] });
  assert(slot.chord);
  assert.deepEqual(slot.chord.exactMidiNotes, [60, 64, 67]);
  assert.equal(slot.chord.intentSource, 'inferred');
  assert.equal(slot.chord.playbackBehavior, 'exact');
});

test('a custom exact-only chord remains playable without fabricated semantic intent', () => {
  const slot = legacyHarmonySlotToSharedSlot({ id: 0, capturedMidiNotes: [60, 61, 66] });
  assert(slot.chord);
  assert.deepEqual(slot.chord.exactMidiNotes, [60, 61, 66]);
  assert.equal(slot.chord.intent, null);
  assert.equal(slot.chord.intentSource, null);
  assert.equal(slot.chord.recognizedLabel, 'custom');
  assert.equal(slot.chord.playbackBehavior, 'exact');
});

test('missing and explicitly empty slots stay genuinely empty', () => {
  const missing = sanitizeHarmonyChordSlots(undefined);
  assert.equal(missing.length, 8);
  assert(missing.every((slot) => slot.chord === null));
  const explicit = sanitizeHarmonyChordSlots([{ id: 0, chord: null, intent: defaultHarmonyIntent('slot') }]);
  assert.equal(explicit[0]?.chord, null);
  const malformed = sanitizeHarmonyChordSlots([{ id: 0, chord: {} }]);
  assert.equal(malformed[0]?.chord, null);
  const custom = sanitizeHarmonyChordSlots([{ id: 0, chord: { exactMidiNotes: [60, 61, 66], playbackBehavior: 'exact' } }]);
  assert.equal(custom[0]?.chord?.intent, null);
  assert.equal(custom[0]?.chord?.recognizedLabel, 'custom');
});

test('Auto keeps exact notes through ±6 and resolves relative beyond it using a continuous anchor', () => {
  const intent = { ...defaultHarmonyIntent('slot', 0), quality: 'maj' as const };
  const chord = legacyHarmonySlotToSharedSlot({ id: 0, intent }, { rootMidi: 60 }).chord!;
  assert.deepEqual(sharedChordResolvedMidiPool(chord, { effectiveRootMidi: 66 }), chord.exactMidiNotes);
  assert.deepEqual(sharedChordResolvedMidiPool(chord, { effectiveRootMidi: 54 }), chord.exactMidiNotes);
  assert.notDeepEqual(sharedChordResolvedMidiPool(chord, { effectiveRootMidi: 67 }), chord.exactMidiNotes);
  assert.notDeepEqual(sharedChordResolvedMidiPool(chord, { effectiveRootMidi: 53 }), chord.exactMidiNotes);
});

test('Relative follows changed root/scale while Exact remains literal', () => {
  const intent = { ...defaultHarmonyIntent('slot', 0), quality: 'maj' as const };
  const chord = legacyHarmonySlotToSharedSlot({ id: 0, intent }, { rootMidi: 60 }).chord!;
  const relative = { ...chord, playbackBehavior: 'relative' as const };
  const exact = { ...chord, playbackBehavior: 'exact' as const };
  assert.notDeepEqual(sharedChordResolvedMidiPool(relative, { effectiveRootMidi: 62, scaleId: 1 }), chord.exactMidiNotes);
  assert.deepEqual(sharedChordResolvedMidiPool(exact, { effectiveRootMidi: 62, scaleId: 8 }), chord.exactMidiNotes);
});

test('editing exact notes retains confirmed semantic intent; editing intent refreshes snapshot', () => {
  const intent = { ...defaultHarmonyIntent('slot', 0), quality: 'maj' as const };
  const chord = legacyHarmonySlotToSharedSlot({ id: 0, intent }).chord!;
  const editedExact = editSharedChordExactNotes(chord, [61, 65, 68]);
  assert.equal(editedExact.intent?.quality, 'maj');
  const editedIntent = editSharedChordIntent(chord, { ...intent, quality: 'min' });
  assert.equal(editedIntent.intent?.quality, 'min');
  assert.deepEqual(editedIntent.exactMidiNotes, resolveHarmonyIntentToNotePool({ intent: editedIntent.intent!, rootMidi: 60, scaleId: 1, tension: 0.35 }));
});
