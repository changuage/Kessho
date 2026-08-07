import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAGE_CPU_MAX_REGRESSION_PERCENT,
  PAGE_CPU_RUN_COUNT,
  assertPairedPageCpuMeasurementQuality,
  classifyPageCpuRegression,
  isPageCpuRegressionWithinGate,
  normalizedPageCpuRegressionPercent,
  overallPageCpuGateStatus,
  pairedNormalizedPageCpuRegressionPercent,
  pageCpuGateExitCode,
  planPairedPageCpuRetry,
  planInterleavedPageCpuRuns,
  resolvePageCpuBaselineRef,
} from './lib/kesshoProductPageCpuBeforeAfter.mjs';
import {
  PAGE_CPU_MAX_TRANSIENT_RETRIES,
  PAGE_CPU_LEGACY_VITE_DISABLE_HMR_ENV,
  PAGE_CPU_VITE_CACHE_DIR_ENV,
  PAGE_CPU_VITE_DISABLE_HMR_ENV,
  classifyPageCpuTransientError,
  createPageCpuViteEnv,
  createPageCpuRetryEntry,
  shouldRetryPageCpuAttempt,
} from './lib/kesshoProductPageCpuComparison.mjs';

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

test('a catastrophic one-sided tail requests a paired retry', () => {
  const decision = planPairedPageCpuRetry({
    baselineRuns: runs([10, 10, 16]),
    currentRuns: runs([10, 11, 10]),
    basePort: 5306,
  });
  assert.equal(decision.retry, true);
  assert.deepEqual(decision.quality.invalidPhases, ['baseline']);
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

test('regression policy distinguishes valid regressions from inconclusive metrics', () => {
  assert.deepEqual(
    classifyPageCpuRegression({
      rawRegressionPercent: 5.1,
      normalizedRegressionPercent: 4.2,
      pairedNormalizedRegressionPercents: [4.1, 5.2, 4.8],
    }),
    { status: 'regression', reason: 'corroborated-raw-and-normalized-regression' },
  );
  assert.deepEqual(
    classifyPageCpuRegression({
      rawRegressionPercent: 5.1,
      normalizedRegressionPercent: 4.2,
      pairedNormalizedRegressionPercents: [4.1, 2.2, 5.8],
    }),
    { status: 'inconclusive', reason: 'inconsistent-paired-normalized-regression' },
  );
  assert.deepEqual(
    classifyPageCpuRegression({
      rawRegressionPercent: 5.1,
      normalizedRegressionPercent: 4.2,
      pairedNormalizedRegressionPercents: [4.1],
    }),
    { status: 'inconclusive', reason: 'inconsistent-paired-normalized-regression' },
  );
  assert.deepEqual(
    classifyPageCpuRegression({ rawRegressionPercent: 21, normalizedRegressionPercent: 0 }),
    { status: 'regression', reason: 'catastrophic-raw-regression' },
  );
  assert.deepEqual(
    classifyPageCpuRegression({ rawRegressionPercent: 21, normalizedRegressionPercent: null }),
    { status: 'regression', reason: 'catastrophic-raw-regression' },
  );
  assert.deepEqual(
    classifyPageCpuRegression({ rawRegressionPercent: null, normalizedRegressionPercent: 4 }),
    { status: 'inconclusive', reason: 'missing-or-invalid-regression-metric' },
  );
  assert.equal(isPageCpuRegressionWithinGate({ rawRegressionPercent: null, normalizedRegressionPercent: 0 }), false);
});

test('baseline resolution is explicit and stable across GitHub event types', () => {
  assert.equal(resolvePageCpuBaselineRef({ explicitRef: 'release-baseline' }), 'release-baseline');
  assert.equal(resolvePageCpuBaselineRef({
    githubActions: true,
    pullRequestBaseRef: 'abc123',
    pushBeforeRef: 'def456',
  }), 'abc123');
  assert.equal(resolvePageCpuBaselineRef({
    githubActions: true,
    pushBeforeRef: 'def456',
  }), 'def456');
  assert.equal(resolvePageCpuBaselineRef({
    githubActions: true,
    pullRequestBaseRef: '0000000000000000000000000000000000000000',
    pushBeforeRef: '0000000000000000000000000000000000000000',
    dirty: false,
  }), 'HEAD^');
  assert.equal(resolvePageCpuBaselineRef({ dirty: true }), 'HEAD');
});

test('inconclusive measurements do not fail the required process gate', () => {
  assert.equal(pageCpuGateExitCode('pass'), 0);
  assert.equal(pageCpuGateExitCode('inconclusive'), 0);
  assert.equal(pageCpuGateExitCode('regression'), 1);
  assert.equal(pageCpuGateExitCode('error'), 1);
});

test('inconclusive scenario evidence takes overall precedence over pass', () => {
  assert.equal(overallPageCpuGateStatus(['pass', 'pass']), 'pass');
  assert.equal(overallPageCpuGateStatus(['pass', 'inconclusive']), 'inconclusive');
  assert.equal(overallPageCpuGateStatus(['regression', 'inconclusive']), 'inconclusive');
  assert.equal(overallPageCpuGateStatus(['pass', 'regression']), 'regression');
});

test('each planned collection yields exactly three accepted runs per phase', () => {
  const accepted = { baseline: [], current: [] };
  for (const planned of planInterleavedPageCpuRuns({ basePort: 5400 })) accepted[planned.phase].push(planned);
  assert.equal(accepted.baseline.length, PAGE_CPU_RUN_COUNT);
  assert.equal(accepted.current.length, PAGE_CPU_RUN_COUNT);
});

test('page CPU retry policy only accepts the explicitly transient failures', () => {
  assert.equal(PAGE_CPU_MAX_TRANSIENT_RETRIES, 1);
  assert.equal(shouldRetryPageCpuAttempt({ attempt: 1, reason: 'silent-capture' }), true);
  assert.equal(shouldRetryPageCpuAttempt({ attempt: 2, reason: 'silent-capture' }), false);
  assert.equal(shouldRetryPageCpuAttempt({ attempt: 1, reason: null }), false);
  assert.equal(classifyPageCpuTransientError(new Error('Execution context was destroyed, most likely because of a navigation.')), 'execution-context-destroyed');
  assert.equal(classifyPageCpuTransientError(new Error('No execution context available')), 'execution-context-destroyed');
  assert.equal(classifyPageCpuTransientError(new Error('Cannot find context with specified id')), 'execution-context-destroyed');
  assert.equal(classifyPageCpuTransientError(new Error('Timed out waiting for Product snapshot revision -1 (hash) to be applied by the audio thread')), 'initial-product-snapshot-revision-minus-one-timeout');
  assert.equal(classifyPageCpuTransientError(new Error('AudioContext was destroyed while stopping')), null);
  assert.equal(classifyPageCpuTransientError(new Error('routing/core-product: capture RMS stayed silent (0)')), 'silent-capture');
  assert.equal(classifyPageCpuTransientError(new Error('capture failed because the route is invalid')), null);
  assert.deepEqual(createPageCpuRetryEntry({
    attempt: 1,
    status: 'fail',
    reason: 'silent-capture',
    error: new Error('capture RMS stayed silent (0)'),
  }), {
    attempt: 1,
    status: 'fail',
    transient: true,
    reason: 'silent-capture',
    error: 'capture RMS stayed silent (0)',
  });
});

test('Vite phase env construction is isolated and browser-proof', () => {
  assert.equal(PAGE_CPU_VITE_DISABLE_HMR_ENV, 'KESSHO_VITE_DISABLE_HMR');
  assert.equal(PAGE_CPU_VITE_CACHE_DIR_ENV, 'KESSHO_VITE_CACHE_DIR');
  assert.deepEqual(createPageCpuViteEnv({ PATH: '/bin', BROWSER: 'chrome' }, '/tmp/page-cpu-cache'), {
    PATH: '/bin',
    BROWSER: 'none',
    KESSHO_VITE_DISABLE_HMR: '1',
    KESSHO_SEQUENCER_UI_PROOF_DISABLE_HMR: '1',
    KESSHO_VITE_CACHE_DIR: '/tmp/page-cpu-cache',
  });
  assert.equal(PAGE_CPU_LEGACY_VITE_DISABLE_HMR_ENV, 'KESSHO_SEQUENCER_UI_PROOF_DISABLE_HMR');
});
