import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarmonyWorkspaceHistory, reduceHarmonyWorkspaceHistory, undoHarmonyWorkspaceHistory } from './harmonyWorkspaceState';
import { captureHarmonyAuthoredSnapshot } from './useHarmonyWorkspaceController';
import type { SliderState } from '../state';

test('Synth-visible commit survives Global unmount and is undoable after remount', () => {
  const initial = { rootNote: 0, harmonyChordSlotsA: [], synthPlayConfigs: [] } as unknown as SliderState;
  const before = captureHarmonyAuthoredSnapshot(initial);
  let history = createHarmonyWorkspaceHistory(before);
  const after = captureHarmonyAuthoredSnapshot({ ...initial, harmonyChordSlotsA: [{ id: 0, name: 'S1', chord: null, locked: false }] });

  // This models the App-owned controller receiving a Seq commit while Global
  // is unmounted; no component-local bridge is involved.
  history = reduceHarmonyWorkspaceHistory(history, { type: 'authored', before, after, label: 'Seq shared matrix edit' });
  assert.equal(history.past.length, 1);
  assert.equal(history.past[0]?.label, 'Seq shared matrix edit');

  // Global remount reads the same App-owned history and can undo the Seq edit.
  history = undoHarmonyWorkspaceHistory(history);
  assert.deepEqual(history.present, before);
});
