import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHarmonyIntent } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';
import { applyHarmonyOverviewAction, makeUniqueHarmonySlot, overviewFocusTarget, overviewRows, toggleHarmonyOverviewNote, updateHarmonyOverviewDuration, virtualizeOverviewRows } from './harmonyOverviewModel';

const progression = (count: number): HarmonyProgression => ({ version: 1, enabled: true, currentEventIndex: 0, events: Array.from({ length: count }, (_, id) => ({ id: `e-${id}`, source: { type: 'auto' as const }, duration: { unit: 'bar' as const, value: 1 as const } })) });
const slot = (id: number, notes: number[] | null) => ({ id, name: `S${id + 1}`, locked: false, intent: defaultHarmonyIntent('slot', id % 7), chord: notes ? { intent: defaultHarmonyIntent('slot', id % 7), intentSource: 'confirmed' as const, exactMidiNotes: notes, recognizedLabel: 'C', playbackBehavior: 'auto' as const, capturedContext: { rootMidi: 60, scaleId: 1 } } : null });

test('Arrange actions preserve selection parity and enforce 64 event cap', () => {
  const base = progression(2);
  const added = applyHarmonyOverviewAction(base, 0, 'add');
  assert.equal(added.ok, true);
  assert.equal(added.progression.events.length, 3);
  assert.equal(added.selectedIndex, 1);
  const duplicated = applyHarmonyOverviewAction(added.progression, 1, 'duplicate');
  assert.equal(duplicated.progression.events.length, 4);
  const moved = applyHarmonyOverviewAction(duplicated.progression, 2, 'moveUp');
  assert.equal(moved.selectedIndex, 1);
  const deleted = applyHarmonyOverviewAction(moved.progression, 1, 'delete');
  assert.equal(deleted.progression.events.length, 3);
  const full = applyHarmonyOverviewAction(progression(64), 0, 'add');
  assert.equal(full.ok, false);
  assert.equal(full.progression.events.length, 64);
});

test('rows are authored event projections and virtualization keeps stable index offsets', () => {
  const rows = overviewRows(progression(30), [slot(0, [60, 64, 67])]);
  assert.equal(rows.length, 30);
  const window = virtualizeOverviewRows(rows, 760, 300, 76, 2);
  assert.ok(window.start > 0);
  assert.equal(window.offsetTop, window.start * 76);
  assert.equal(window.totalHeight, 30 * 76);
  assert.equal(virtualizeOverviewRows(rows.slice(0, 24), 0, 300).rows.length, 24);
});

test('Make Unique copies chord identity into first empty slot without changing source', () => {
  const slots = [slot(0, [60, 64, 67]), slot(1, null), slot(2, null)];
  const result = makeUniqueHarmonySlot(slots, 0);
  assert.equal(result.ok, true);
  assert.equal(result.slotId, 1);
  assert.deepEqual(result.slots[0]?.chord?.exactMidiNotes, [60, 64, 67]);
  assert.deepEqual(result.slots[1]?.chord?.exactMidiNotes, [60, 64, 67]);
  assert.equal(makeUniqueHarmonySlot([slot(0, [60]), { ...slot(1, null), locked: true }], 0).ok, false);
});

test('duration and exact-note edits are pure and preserve unrelated events/slots', () => {
  const base = progression(2);
  const next = updateHarmonyOverviewDuration(base, 1, 'phrase', 4);
  assert.equal(next.events[1]?.duration.unit, 'phrase');
  assert.equal(base.events[1]?.duration.unit, 'bar');
  const slots = [slot(0, [60, 64]), slot(1, null)];
  const toggled = toggleHarmonyOverviewNote(slots, 0, 67);
  assert.deepEqual(toggled[0]?.chord?.exactMidiNotes, [60, 64, 67]);
  assert.deepEqual(toggleHarmonyOverviewNote(toggled, 0, 60)[0]?.chord?.exactMidiNotes, [64, 67]);
  assert.deepEqual(slots[0]?.chord?.exactMidiNotes, [60, 64]);
});

test('virtualized focus restores by stable event id after a row leaves and re-enters', () => {
  const rows = overviewRows(progression(30), [slot(0, [60])]);
  assert.equal(overviewFocusTarget(rows, rows[27]!.id, 0), rows[27]!.id);
  const visible = virtualizeOverviewRows(rows, 0, 200, 76, 1);
  assert.equal(visible.rows.some((row) => row.id === rows[27]!.id), false);
  const reentered = virtualizeOverviewRows(rows, 27 * 76, 200, 76, 1);
  assert.equal(reentered.rows.some((row) => row.id === rows[27]!.id), true);
  assert.equal(overviewFocusTarget(rows, rows[27]!.id, 0), rows[27]!.id);
});
