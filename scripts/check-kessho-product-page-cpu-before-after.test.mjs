import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAGE_CPU_MAX_REGRESSION_PERCENT,
  PAGE_CPU_RUN_COUNT,
  assertPairedPageCpuMeasurementQuality,
  isPageCpuRegressionWithinGate,
  normalizedPageCpuRegressionPercent,
  pairedNormalizedPageCpuRegressionPercent,
  planPairedPageCpuRetry,
  planInterleavedPageCpuRuns,
} from './lib/kesshoProductPageCpuBeforeAfter.mjs';

function runs(values, webValues = values) {
  return values.map((productBrowserProcessCpuPercent, index) => ({
    scenarios: [{
      id: 'global',
      productBrowserProcessCpuPercent,
      webBrowserProcessCpuPercent: webValues[index],
    }],
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

test('single moderate tail sample does not invalidate an otherwise stable phase', () => {
  const decision = planPairedPageCpuRetry({
    baselineRuns: runs([10, 11, 10]),
    currentRuns: runs([10, 11, 13]),
    basePort: 5306,
  });
  assert.equal(decision.retry, false);
});

test('one high or low tail sample is accepted by the two-of-three consensus', () => {
  for (const values of [[10, 10, 13], [10, 13, 13]]) {
    const decision = planPairedPageCpuRetry({
      baselineRuns: runs(values),
      currentRuns: runs([10, 11, 10]),
      basePort: 5306,
    });
    assert.equal(decision.retry, false);
  }
});

test('known low browser-process samples from texture and routing remain valid', () => {
  for (const values of [
    [73.711, 73.251, 59.427],
    [72.559, 73.674, 60.057],
  ]) {
    const decision = planPairedPageCpuRetry({
      baselineRuns: runs(values),
      currentRuns: runs([10, 11, 10]),
      basePort: 5306,
    });
    assert.equal(decision.retry, false);
  }
});

test('one invalid phase requests a fresh paired replacement with alternating unique ports', () => {
  const decision = planPairedPageCpuRetry({
    baselineRuns: runs([10, 11, 10]),
    currentRuns: runs([10, 13, 17]),
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
      runs([10, 13, 17]),
      runs([10, 13, 17]),
      { runCount: PAGE_CPU_RUN_COUNT },
    ),
    /baseline: global(?:, global:web)?; current: global/,
  );
});

test('nonpositive CPU samples remain invalid', () => {
  assert.throws(
    () => assertPairedPageCpuMeasurementQuality(
      runs([0, 10, 13]),
      runs([10, 13, 17]),
      { runCount: PAGE_CPU_RUN_COUNT },
    ),
    /baseline: global/,
  );
});

test('Web CPU outliers are included in paired quality validation', () => {
  assert.throws(
    () => assertPairedPageCpuMeasurementQuality(
      runs([10, 10, 10], [10, 13, 17]),
      runs([10, 10, 10]),
      { runCount: PAGE_CPU_RUN_COUNT },
    ),
    /baseline: global:web/,
  );
});

test('the Product regression gate remains exactly three percent', () => {
  assert.equal(PAGE_CPU_MAX_REGRESSION_PERCENT, 3);
});

test('paired Product/Web difference-in-differences cancels shared load', () => {
  assert.equal(
    pairedNormalizedPageCpuRegressionPercent({
      baselineProduct: 40,
      currentProduct: 44,
      baselineWeb: 60,
      currentWeb: 66,
    }),
    0,
  );
  assert.equal(
    normalizedPageCpuRegressionPercent({
      baselineProduct: 40,
      currentProduct: 44,
      baselineWeb: 60,
      currentWeb: 66,
    }),
    0,
  );
});

test('paired Product/Web regression tracks Product-only work', () => {
  const sharedLoad = pairedNormalizedPageCpuRegressionPercent({
    baselineProduct: 42.444,
    currentProduct: 44.738,
    baselineWeb: 59.36,
    currentWeb: 63.511,
  });
  assert.ok(sharedLoad > -3 && sharedLoad < 3);
  const productOnly = pairedNormalizedPageCpuRegressionPercent({
    baselineProduct: 100,
    currentProduct: 105,
    baselineWeb: 100,
    currentWeb: 100,
  });
  assert.ok(Math.abs(productOnly - 5) < 1e-9);
});

test('regression gate requires corroborated raw and normalized evidence', () => {
  assert.equal(isPageCpuRegressionWithinGate({ rawRegressionPercent: 5.31, normalizedRegressionPercent: 0.2 }), true);
  assert.equal(isPageCpuRegressionWithinGate({ rawRegressionPercent: 2.73, normalizedRegressionPercent: 4.91 }), true);
  assert.equal(isPageCpuRegressionWithinGate({ rawRegressionPercent: 5.0, normalizedRegressionPercent: 5.0 }), false);
  assert.equal(isPageCpuRegressionWithinGate({ rawRegressionPercent: 21.0, normalizedRegressionPercent: 0.0 }), false);
});

test('each planned collection yields exactly three accepted runs per phase', () => {
  const accepted = { baseline: [], current: [] };
  for (const planned of planInterleavedPageCpuRuns({ basePort: 5400 })) accepted[planned.phase].push(planned);
  assert.equal(accepted.baseline.length, PAGE_CPU_RUN_COUNT);
  assert.equal(accepted.current.length, PAGE_CPU_RUN_COUNT);
});
