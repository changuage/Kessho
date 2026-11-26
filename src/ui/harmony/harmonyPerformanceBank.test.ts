import assert from 'node:assert/strict';
import test from 'node:test';
import { HARMONY_PERFORMANCE_BANK_CODES, harmonyPerformanceBankIndex, harmonyPerformanceBankTrigger } from './harmonyPerformanceBank';

test('Z through comma form one stable eight-item performance bank', () => {
  assert.deepEqual(HARMONY_PERFORMANCE_BANK_CODES, ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma']);
  assert.equal(harmonyPerformanceBankIndex('KeyZ', 'Z'), 0);
  assert.equal(harmonyPerformanceBankIndex('Comma', '<'), 7);
  assert.equal(harmonyPerformanceBankTrigger(7), ',');
});
