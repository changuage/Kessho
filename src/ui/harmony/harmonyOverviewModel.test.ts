import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChord } from '../../audio/harmony/chord';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';
import { analyzeHarmonyVoiceLeading, applyHarmonyOverviewAction, clearHarmonyOverviewChord, overviewFocusTarget, overviewRows, updateHarmonyOverviewDuration, virtualizeOverviewRows } from './harmonyOverviewModel';

const key = { rootPitchClass: 0, scaleId: 1 };
const progression = (count: number): HarmonyProgression => ({ version: 2, enabled: true, currentEventIndex: 0, events: Array.from({ length: count }, (_, id) => ({ id: `e-${id}`, source: { type: 'auto' as const }, duration: { unit: 'bar' as const, value: 1 as const } })) });
const fixed = (notes: number[]) => normalizeChord({ behavior: 'fixed', notes: notes.map((midi) => ({ midi })) })!;

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

test('duplicating a chord event copies the chord instead of sharing it', () => {
  const base = progression(1);
  base.events[0]!.source = { type: 'chord', chord: fixed([60, 64, 67]) };
  const duplicated = applyHarmonyOverviewAction(base, 0, 'duplicate').progression;
  const [first, copy] = duplicated.events.map((event) => event.source);
  assert.deepEqual(first, copy);
  assert.notEqual((first as { chord: unknown }).chord, (copy as { chord: unknown }).chord);
});

test('rows are authored event projections and virtualization keeps stable index offsets', () => {
  const rows = overviewRows(progression(30), key);
  assert.equal(rows.length, 30);
  assert.equal(rows[0]?.label, 'Auto');
  const window = virtualizeOverviewRows(rows, 760, 300, 76, 2);
  assert.ok(window.start > 0);
  assert.equal(window.offsetTop, window.start * 76);
  assert.equal(window.totalHeight, 30 * 76);
  assert.equal(virtualizeOverviewRows(rows.slice(0, 24), 0, 300).rows.length, 24);
});

test('duration edits are pure and a chord event can be set back to Auto', () => {
  const base = progression(2);
  const next = updateHarmonyOverviewDuration(base, 1, 'phrase', 4);
  assert.equal(next.events[1]?.duration.unit, 'phrase');
  assert.equal(base.events[1]?.duration.unit, 'bar');
  const withChord: HarmonyProgression = { ...base, events: [{ ...base.events[0]!, source: { type: 'chord', chord: fixed([60, 64, 67]) } }, base.events[1]!] };
  assert.equal(clearHarmonyOverviewChord(withChord, 0).events[0]?.source.type, 'auto');
  assert.equal(withChord.events[0]?.source.type, 'chord');
});

test('chord rows are named and voice-leading summarizes adjacent chords', () => {
  const base = progression(2);
  const withChords: HarmonyProgression = { ...base, events: [
    { ...base.events[0]!, source: { type: 'chord', chord: fixed([60, 64, 67, 71]) } },
    { ...base.events[1]!, source: { type: 'chord', chord: fixed([57, 60, 64, 67]) } },
  ] };
  const rows = overviewRows(withChords, key);
  assert.equal(rows[0]?.label, 'C4 E4 G4 B4');
  assert.equal(rows[1]?.relation?.commonTones, 3);
  assert.equal(rows[1]?.relation?.bassDelta, -3);
  assert.match(rows[1]?.relation?.summary ?? '', /3 common/);
  assert.deepEqual(analyzeHarmonyVoiceLeading([], [60, 64]), null);
});

test('virtualized focus restores by stable event id after a row leaves and re-enters', () => {
  const rows = overviewRows(progression(30), key);
  assert.equal(overviewFocusTarget(rows, rows[27]!.id, 0), rows[27]!.id);
  const visible = virtualizeOverviewRows(rows, 0, 200, 76, 1);
  assert.equal(visible.rows.some((row) => row.id === rows[27]!.id), false);
  const reentered = virtualizeOverviewRows(rows, 27 * 76, 200, 76, 1);
  assert.equal(reentered.rows.some((row) => row.id === rows[27]!.id), true);
  assert.equal(overviewFocusTarget(rows, rows[27]!.id, 0), rows[27]!.id);
});
