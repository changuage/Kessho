import assert from 'node:assert/strict';
import test from 'node:test';
import { COLUMNS, FX_ROW_DEFS, fxMatrixRow } from './routingMatrixModel';

test('Matrix exposes every FX-to-Saturator route supported by the graph', () => {
  assert.ok(COLUMNS.some((column) => column.id === 'creativeSaturation'));
  for (const def of FX_ROW_DEFS) {
    const cell = fxMatrixRow(def).cells.creativeSaturation;
    if (def.node === 'creativeSaturation') {
      assert.equal(cell.kind, 'self');
    } else {
      assert.deepEqual(cell.fxRoute, [def.node, 'creativeSaturation']);
    }
  }
});
