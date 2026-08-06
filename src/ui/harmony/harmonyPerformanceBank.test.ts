import assert from 'node:assert/strict';
import test from 'node:test';
import { HARMONY_PERFORMANCE_BANK_CODES, harmonyPerformanceBankIndex, harmonyPerformanceBankScope, harmonyPerformanceBankTrigger } from './harmonyPerformanceBank';

test('Z through comma form one stable eight-item performance bank', () => {
  assert.deepEqual(HARMONY_PERFORMANCE_BANK_CODES, ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma']);
  assert.equal(harmonyPerformanceBankIndex('KeyZ', 'Z'), 0);
  assert.equal(harmonyPerformanceBankIndex('Comma', '<'), 7);
  assert.equal(harmonyPerformanceBankTrigger(7), ',');
});

test('slash momentary scope and persistent tray use the same suggestion bank', () => {
  assert.equal(harmonyPerformanceBankScope(false, false), 'slots');
  assert.equal(harmonyPerformanceBankScope(true, false), 'suggestions');
  assert.equal(harmonyPerformanceBankScope(false, true), 'suggestions');
});
