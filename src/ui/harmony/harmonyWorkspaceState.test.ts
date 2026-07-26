import assert from 'node:assert/strict';
import {
  createHarmonyWorkspaceHistory,
  harmonyHistoryCanUndo,
  harmonyWorkspaceActionsEnabled,
  harmonyWorkspaceActionsLocked,
  harmonyWorkspaceSurfaceForView,
  reduceHarmonyWorkspaceHistory,
  undoHarmonyWorkspaceHistory,
} from './harmonyWorkspaceState';

const before = { rootNote: 0, unrelated: 'keep' };
const after = { rootNote: 7, unrelated: 'keep' };
let history = createHarmonyWorkspaceHistory(before);

history = reduceHarmonyWorkspaceHistory(history, { type: 'view/select', view: 'detail' });
assert.equal(history.past.length, 0, 'view selection must not enter authored history');
history = reduceHarmonyWorkspaceHistory(history, { type: 'preview' });
assert.equal(history.past.length, 0, 'preview must not enter authored history');
history = reduceHarmonyWorkspaceHistory(history, { type: 'capture', before, after });
assert.equal(history.past.length, 1);
assert.equal(harmonyHistoryCanUndo(history), true);
assert.equal(history.past[0]?.label, 'Capture chord');
const undone = undoHarmonyWorkspaceHistory(history);
assert.equal(undone.present.rootNote, 0);
assert.equal(undone.present.unrelated, 'keep', 'Harmony undo must preserve the isolated snapshot');
assert.equal(harmonyWorkspaceActionsEnabled(true), false, 'morph midpoint blocks authored/live actions');
assert.equal(harmonyWorkspaceActionsEnabled(false), true);
assert.equal(harmonyWorkspaceActionsLocked(false, true), true, 'projection morph lock must disable all actions');
assert.equal(harmonyWorkspaceActionsLocked(true, false), true, 'explicit morph read-only must disable all actions');
assert.equal(harmonyWorkspaceActionsLocked(false, false), false);
assert.deepEqual(harmonyWorkspaceSurfaceForView('simple'), { simpleControls: true, manualVoicing: false, progressionEditor: false, performanceSurface: false });
assert.deepEqual(harmonyWorkspaceSurfaceForView('detail'), { simpleControls: false, manualVoicing: true, progressionEditor: false, performanceSurface: false });
assert.deepEqual(harmonyWorkspaceSurfaceForView('overview'), { simpleControls: false, manualVoicing: false, progressionEditor: true, performanceSurface: true });
const noop = reduceHarmonyWorkspaceHistory(createHarmonyWorkspaceHistory(before), { type: 'authored', before: { rootNote: 0 }, after: { rootNote: 0 }, label: 'No-op' });
assert.equal(noop.past.length, 0, 'semantically equal snapshots must not create history');

for (const type of ['suggestion/replace', 'suggestion/insert', 'suggestion/assign', 'progression/edit', 'print', 'adopt'] as const) {
  const next = reduceHarmonyWorkspaceHistory(createHarmonyWorkspaceHistory(before), { type, before, after });
  assert.equal(next.past.length, 1, `${type} should be one local history entry`);
}

console.log('harmony workspace state tests passed');
