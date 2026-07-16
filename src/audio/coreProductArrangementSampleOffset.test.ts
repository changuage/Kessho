import assert from 'node:assert/strict';
import test from 'node:test';
import { coreProductSampleOffsetForDelay } from './reference/CoreProductArrangementSchedulerReference';

test('converts arrangement delays to deterministic sample offsets', () => {
  assert.equal(coreProductSampleOffsetForDelay(0, 48_000), 0);
  assert.equal(coreProductSampleOffsetForDelay(0.5, 48_000), 24_000);
  assert.equal(coreProductSampleOffsetForDelay(1 / 48_000, 48_000), 1);
  assert.equal(coreProductSampleOffsetForDelay(-1, 48_000), 0);
});

test('keeps sample offsets inside the Product event ABI', () => {
  assert.equal(coreProductSampleOffsetForDelay(Number.MAX_SAFE_INTEGER, 192_000), 0xffff_ffff);
});
