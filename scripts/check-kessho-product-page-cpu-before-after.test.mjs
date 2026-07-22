import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAGE_CPU_MAX_REGRESSION_PERCENT,
  PAGE_CPU_RUN_COUNT,
  assertPairedPageCpuMeasurementQuality,
  planPairedPageCpuRetry,
  planInterleavedPageCpuRuns,
} from './lib/kesshoProductPageCpuBeforeAfter.mjs';

function runs(values) {
  return values.map((productBrowserProcessCpuPercent, index) => ({
    scenarios: [{ id: 'global', productBrowserProcessCpuPercent }],
    runIndex: index + 1,
  }));
}

test('valid paired phases do not request a retry', () => {
  const decision = planPairedPageCpuRetry({
    baselineRuns: runs([10, 11, 10]),
    currentRuns: runs([10, 10, 11]),
    basePort: 5306,
  });
  assert.equal(decision.retry, false);
  assert.deepEqual(decision.plan, []);
});

test('one invalid phase requests a fresh paired replacement with alternating unique ports', () => {
  const decision = planPairedPageCpuRetry({
    baselineRuns: runs([10, 11, 10]),
    currentRuns: runs([10, 10, 13]),
    basePort: 5306,
  });
  assert.equal(decision.retry, true);
  assert.deepEqual(decision.quality.invalidPhases, ['current']);
  assert.deepEqual(decision.plan.map(({ phase }) => phase), [
    'baseline', 'current', 'current', 'baseline', 'baseline', 'current',
  ]);
  assert.deepEqual(decision.plan.map(({ port }) => port), [5306, 5307, 5308, 5309, 5310, 5311]);
  assert.equal(new Set(decision.plan.map(({ port }) => port)).size, PAGE_CPU_RUN_COUNT * 2);
  assert.deepEqual(
    [...new Set(decision.plan.map(({ phase }) => phase))],
    ['baseline', 'current'],
  );
  assert.equal(decision.plan.filter(({ phase }) => phase === 'baseline').length, PAGE_CPU_RUN_COUNT);
  assert.equal(decision.plan.filter(({ phase }) => phase === 'current').length, PAGE_CPU_RUN_COUNT);
});

test('persistent invalidity fails paired quality validation', () => {
  assert.throws(
    () => assertPairedPageCpuMeasurementQuality(
      runs([10, 11, 10]),
      runs([10, 10, 13]),
      { runCount: PAGE_CPU_RUN_COUNT },
    ),
    /current: global/,
  );
});

test('the Product regression gate remains exactly three percent', () => {
  assert.equal(PAGE_CPU_MAX_REGRESSION_PERCENT, 3);
});

test('each planned collection yields exactly three accepted runs per phase', () => {
  const accepted = { baseline: [], current: [] };
  for (const planned of planInterleavedPageCpuRuns({ basePort: 5400 })) accepted[planned.phase].push(planned);
  assert.equal(accepted.baseline.length, PAGE_CPU_RUN_COUNT);
  assert.equal(accepted.current.length, PAGE_CPU_RUN_COUNT);
});
