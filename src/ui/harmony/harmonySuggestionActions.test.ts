import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHarmonyIntent, type HarmonyChordSlot, type HarmonySequenceStep } from '../../audio/CoreProductHarmonyControl';
import { generateHarmonySuggestionBank, type HarmonySuggestion } from '../../audio/harmony/chordSuggestionEngine';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';
import { assignHarmonySuggestionToPlayConfig, assignHarmonySuggestionToStep, insertHarmonySuggestion, replaceHarmonySuggestion, saveHarmonySuggestion } from './harmonySuggestionActions';

const suggestion = (): HarmonySuggestion => generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.4 }).find((entry): entry is HarmonySuggestion => entry !== null)!;
const emptySlot = (id: number): HarmonyChordSlot => ({ id, name: `Slot ${id + 1}`, intent: defaultHarmonyIntent('slot', id % 7), chord: null, locked: false });
const progression: HarmonyProgression = { version: 1, enabled: true, currentEventIndex: 0, events: [{ id: 'event-0', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } }] };
const step = (id: number, locked = false): HarmonySequenceStep => ({ id, enabled: true, locked, mode: 'auto', degree: id, quality: 'auto', intent: null, slotId: null, probability: 1 });

test('Shift+key save chooses the first genuinely empty slot and never overwrites', () => {
  const state = { slots: [{ ...emptySlot(0), chord: { intent: defaultHarmonyIntent('slot', 0), intentSource: 'confirmed' as const, exactMidiNotes: [48], recognizedLabel: 'old', playbackBehavior: 'auto' as const, capturedContext: { rootMidi: 48, scaleId: 1 } } }, emptySlot(1), emptySlot(2)] };
  const result = saveHarmonySuggestion(state, suggestion());
  assert.equal(result.ok, true);
  assert.equal(result.slotId, 1);
  assert.deepEqual(result.state.slots[0], state.slots[0]);
  assert.ok(result.state.slots[1]?.chord);
});

test('semantic + exact + playback duplicate reuses, while voicing or behavior differences do not', () => {
  const candidate = suggestion();
  const saved = saveHarmonySuggestion({ slots: [emptySlot(0)] }, candidate, { rootMidi: 72, scaleId: 8 });
  assert.equal(saved.slotId, 0);
  assert.deepEqual(saved.state.slots[0]?.chord?.capturedContext, { rootMidi: 72, rootMidiAnchor: 72, scaleId: 8 });
  const duplicate = saveHarmonySuggestion(saved.state, { ...candidate, id: 'different-id' });
  assert.equal(duplicate.slotId, 0);
  assert.equal(duplicate.state, saved.state);
  const differentVoicing = saveHarmonySuggestion(saved.state, { ...candidate, id: 'voicing', exactMidiNotes: candidate.exactMidiNotes.map((note) => note + 12) });
  assert.equal(differentVoicing.slotId, null);
  const differentBehavior = saveHarmonySuggestion(saved.state, { ...candidate, id: 'behavior', playbackBehavior: 'relative' });
  assert.equal(differentBehavior.slotId, null);
});

test('full pool returns visible failure with no mutation', () => {
  const state = { slots: Array.from({ length: 2 }, (_, id) => ({ ...emptySlot(id), chord: { intent: defaultHarmonyIntent('slot', id), intentSource: 'confirmed' as const, exactMidiNotes: [48 + id], recognizedLabel: 'old', playbackBehavior: 'auto' as const, capturedContext: { rootMidi: 48, scaleId: 1 } } })) };
  const result = saveHarmonySuggestion(state, suggestion());
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.match(result.error ?? '', /empty/i);
});

test('Replace only changes selected event reference and Insert adds one phrase event', () => {
  const state = { slots: [emptySlot(0)], progression };
  const replaced = replaceHarmonySuggestion(state, suggestion(), 0);
  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.state.progression?.events[0]?.source, { type: 'slot', slotId: 0 });
  assert.equal(replaced.state.progression?.events.length, 1);
  const inserted = insertHarmonySuggestion(state, suggestion(), 0);
  assert.equal(inserted.ok, true);
  assert.equal(inserted.state.progression?.events.length, 2);
  assert.deepEqual(inserted.state.progression?.events[1]?.duration, { unit: 'phrase', value: 1 });
});

test('Save-only and failed multi-field actions leave progression and sequence untouched', () => {
  const sequence = [step(0)];
  const state = { slots: [emptySlot(0)], progression, sequence };
  const saved = saveHarmonySuggestion(state, suggestion());
  assert.equal(saved.ok, true);
  assert.equal(saved.state.progression, progression);
  assert.equal(saved.state.sequence, sequence);
  const failedState = { ...state, progression: undefined };
  const failed = insertHarmonySuggestion(failedState, suggestion(), 0);
  assert.equal(failed.ok, false);
  assert.equal(failed.state, failedState);
});

test('Seq Assign Step is atomic and respects locks', () => {
  const state = { slots: [emptySlot(0)], sequence: [step(0)] };
  const assigned = assignHarmonySuggestionToStep(state, suggestion(), 0);
  assert.equal(assigned.ok, true);
  assert.equal(assigned.state.sequence?.[0]?.mode, 'slotCopy');
  assert.equal(assigned.state.sequence?.[0]?.slotId, 0);
  assert.ok(assigned.state.slots[0]?.chord);
  const locked = assignHarmonySuggestionToStep({ ...state, sequence: [step(0, true)] }, suggestion(), 0);
  assert.equal(locked.ok, false);
  assert.equal(locked.state.sequence?.[0]?.locked, true);
});

test('Seq Assign writes shared slot reference into ProductPlayConfig chord choice step', () => {
  const state = { slots: [emptySlot(0)], seqPlayConfigs: [{ chord: { steps: [{ slotId: null }] } }] };
  const assigned = assignHarmonySuggestionToPlayConfig(state, suggestion(), 0, 0, { rootMidi: 60, scaleId: 1 });
  assert.equal(assigned.ok, true);
  assert.equal(assigned.slotId, 0);
  assert.equal(assigned.state.seqPlayConfigs?.[0]?.chord?.steps[0]?.slotId, 0);
  assert.ok(assigned.state.slots[0]?.chord);
  const lockedState = { ...state, seqPlayConfigs: [{ chord: { steps: [{ slotId: null, locked: true }] } }] };
  const locked = assignHarmonySuggestionToPlayConfig(lockedState, suggestion(), 0, 0);
  assert.equal(locked.ok, false);
  assert.equal(locked.state, lockedState);
});
