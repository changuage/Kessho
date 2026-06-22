import assert from 'node:assert/strict';
import { requestedApplyModeAllowedForReason } from './ProductSnapshotPolicy';

for (const reason of ['ui-control-change', 'fx-control-change', 'morph-control-change', 'sequencer-edit', 'sequencer-control-change', 'midi-cc-control-change', 'transport-change'] as const) {
  assert.equal(requestedApplyModeAllowedForReason(reason, 'full-snapshot'), false, `${reason} must not use full-snapshot`);
}

for (const reason of ['preset-load', 'session-restore', 'runtime-start', 'runtime-bootstrap', 'asset-reference-change', 'debug-force-reload'] as const) {
  assert.equal(requestedApplyModeAllowedForReason(reason, 'full-snapshot'), true, `${reason} may use full-snapshot`);
}

console.log('Product snapshot policy regression passed');
