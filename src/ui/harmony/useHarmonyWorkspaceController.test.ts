import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarmonyWorkspaceHistory, reduceHarmonyWorkspaceHistory, undoHarmonyWorkspaceHistory } from './harmonyWorkspaceState';
import { captureHarmonyAuthoredSnapshot } from './useHarmonyWorkspaceController';
import { normalizeChord } from '../../audio/harmony/chord';
import type { SliderState } from '../state';

test('App-owned commit survives Global unmount and is undoable after remount', () => {
  const initial = { rootNote: 0, harmonyPalette: [], synthPlayConfigs: [] } as unknown as SliderState;
  const before = captureHarmonyAuthoredSnapshot(initial);
  let history = createHarmonyWorkspaceHistory(before);
  const after = captureHarmonyAuthoredSnapshot({ ...initial, harmonyPalette: [normalizeChord({ behavior: 'follow', degree: 4 })!] });

  // This models the App-owned controller receiving a commit while Global
  // is unmounted; no component-local bridge is involved.
  history = reduceHarmonyWorkspaceHistory(history, { type: 'authored', before, after, label: 'Palette edit' });
  assert.equal(history.past.length, 1);
  assert.equal(history.past[0]?.label, 'Palette edit');

  // Global remount reads the same App-owned history and can undo the Seq edit.
  history = undoHarmonyWorkspaceHistory(history);
  assert.deepEqual(history.present, before);
});
