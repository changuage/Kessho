#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function requireToken(path, token) {
  assert(read(path).includes(token), `${path} is missing required sample-hold parity token: ${token}`);
}

const matrix = read('docs/product-core/sample-hold-parity-matrix.md');
for (let index = 1; index <= 15; index += 1) {
  const caseId = `Case ${String(index).padStart(2, '0')}`;
  assert(matrix.includes(caseId), `sample-hold parity matrix is missing ${caseId}`);
}
assert(!/\|\s*Case\s+\d+[^|]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*todo\s*\|/i.test(matrix), 'sample-hold parity matrix still contains todo status rows');

requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'requireTimedGlobalParam');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'requireSourceTriggerRanges');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'requireDrumTriggerRanges');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_A');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_B');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_GRANULAR');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_REVERB');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'requireDisabledAndRangeNormalization');
requireToken('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', 'requireStopResumeAndDeterminism');
requireToken('src/audio/product/host/CoreProductModulationRangeBridge.ts', 'updateSampleHoldTriggerFeedback');
requireToken('src/ui/runtimeSliderState.ts', 'triggerIndicatorConsumeCount');
requireToken('scripts/check-kessho-product-browser-runtime.mjs', 'sample-hold-ui');

execFileSync('node', ['scripts/run-kessho-product-cpp-test.mjs', 'ProductSampleHoldParityTests'], {
  cwd: root,
  stdio: 'inherit',
});

console.log('Kessho Product sample-hold parity checks passed');
