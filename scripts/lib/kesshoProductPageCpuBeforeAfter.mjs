export const PAGE_CPU_RUN_COUNT = 3;
export const PAGE_CPU_MAX_REGRESSION_PERCENT = 3;
export const PAGE_CPU_MAX_RAW_REGRESSION_PERCENT = 20;

/**
 * Classify the deterministic Product CPU gate independently from collection
 * quality. A finite measurement is a regression only when both the raw
 * Product delta and the paired Product/Web delta exceed the 3% threshold, or
 * when the raw Product delta exceeds the catastrophic 20% guard.
 */
export function classifyPageCpuRegression({
  rawRegressionPercent,
  normalizedRegressionPercent,
  pairedNormalizedRegressionPercents = null,
}) {
  if (Number.isFinite(rawRegressionPercent) && rawRegressionPercent > PAGE_CPU_MAX_RAW_REGRESSION_PERCENT) {
    return {
      status: 'regression',
      reason: 'catastrophic-raw-regression',
    };
  }
  if (!Number.isFinite(rawRegressionPercent) || !Number.isFinite(normalizedRegressionPercent)) {
    return {
      status: 'inconclusive',
      reason: 'missing-or-invalid-regression-metric',
    };
  }
  if (rawRegressionPercent > PAGE_CPU_MAX_REGRESSION_PERCENT &&
      normalizedRegressionPercent > PAGE_CPU_MAX_REGRESSION_PERCENT) {
    const pairedValuesAreConsistent = Array.isArray(pairedNormalizedRegressionPercents) &&
      pairedNormalizedRegressionPercents.length === PAGE_CPU_RUN_COUNT &&
      pairedNormalizedRegressionPercents.every((value) =>
        Number.isFinite(value) && value > PAGE_CPU_MAX_REGRESSION_PERCENT);
    if (!pairedValuesAreConsistent) {
      return {
        status: 'inconclusive',
        reason: 'inconsistent-paired-normalized-regression',
      };
    }
    return {
      status: 'regression',
      reason: 'corroborated-raw-and-normalized-regression',
    };
  }
  return { status: 'pass', reason: 'within-threshold' };
}

export function isPageCpuRegressionWithinGate({ rawRegressionPercent, normalizedRegressionPercent }) {
  return classifyPageCpuRegression({ rawRegressionPercent, normalizedRegressionPercent }).status === 'pass';
}

export function pageCpuGateExitCode(status) {
  return status === 'pass' || status === 'inconclusive' ? 0 : 1;
}

export function overallPageCpuGateStatus(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return 'inconclusive';
  if (statuses.some((status) => status === 'inconclusive')) return 'inconclusive';
  if (statuses.some((status) => status === 'regression')) return 'regression';
  return statuses.every((status) => status === 'pass') ? 'pass' : 'error';
}
export const PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO = 1.2;

/**
 * Resolve the commit used for before/after collection. GitHub passes an
 * explicit pull-request base or push predecessor; local dirty worktrees use
 * HEAD so an uncommitted change is compared with its own clean tree, while a
 * clean commit defaults to its immediate parent.
 */
export function resolvePageCpuBaselineRef({
  explicitRef = null,
  githubActions = false,
  pullRequestBaseRef = null,
  pushBeforeRef = null,
  dirty = false,
  defaultRef = 'HEAD^',
} = {}) {
  const normalize = (value) => {
    const ref = typeof value === 'string' ? value.trim() : '';
    if (!ref || /^0+$/.test(ref)) return null;
    return ref;
  };
  const explicit = normalize(explicitRef);
  if (explicit) return explicit;
  if (githubActions) {
    const pullRequestBase = normalize(pullRequestBaseRef);
    if (pullRequestBase) return pullRequestBase;
    const pushBefore = normalize(pushBeforeRef);
    if (pushBefore) return pushBefore;
  }
  return dirty ? 'HEAD' : normalize(defaultRef) ?? 'HEAD^';
}

export function normalizedPageCpuRegressionPercent({
  baselineProduct,
  baselineWeb,
  currentProduct,
  currentWeb,
}) {
  if (![baselineProduct, baselineWeb, currentProduct, currentWeb].every(Number.isFinite) ||
      baselineProduct <= 0 || baselineWeb <= 0 || currentProduct <= 0 || currentWeb <= 0) {
    return null;
  }
  const baselineRatio = baselineProduct / baselineWeb;
  const currentRatio = currentProduct / currentWeb;
  return ((currentRatio - baselineRatio) / baselineRatio) * 100;
}

export function pairedNormalizedPageCpuRegressionPercent({
  baselineProduct,
  currentProduct,
  baselineWeb,
  currentWeb,
}) {
  if (![baselineProduct, currentProduct, baselineWeb, currentWeb].every(Number.isFinite) ||
      baselineProduct <= 0 || currentProduct <= 0 || baselineWeb <= 0 || currentWeb <= 0) {
    return null;
  }
  return (((currentProduct / baselineProduct) / (currentWeb / baselineWeb)) - 1) * 100;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Plan one complete paired/interleaved collection. A pair always uses two
 * fresh ports, and the phase order alternates on each pair to reduce host
 * drift. `basePort` must be different for every collection attempt.
 */
export function planInterleavedPageCpuRuns({ basePort, runCount = PAGE_CPU_RUN_COUNT }) {
  assert(Number.isInteger(basePort) && basePort > 0, 'basePort must be a positive integer');
  assert(Number.isInteger(runCount) && runCount > 0, 'runCount must be a positive integer');
  const plan = [];
  for (let pairIndex = 0; pairIndex < runCount; pairIndex += 1) {
    const baselineFirst = pairIndex % 2 === 0;
    const phases = baselineFirst ? ['baseline', 'current'] : ['current', 'baseline'];
    phases.forEach((phase, phaseIndex) => {
      plan.push({
        phase,
        runIndex: pairIndex + 1,
        port: basePort + (pairIndex * 2) + phaseIndex,
      });
    });
  }
  return plan;
}

export function findPageCpuMeasurementOutliers(
  runs,
  {
    runCount = PAGE_CPU_RUN_COUNT,
    outlierRatio = PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO,
    metric = 'productBrowserProcessCpuPercent',
    label = '',
  } = {},
) {
  if (!Array.isArray(runs) || runs.length !== runCount) return ['phase-run-count'];
  const scenarioIds = runs[0]?.scenarios?.map((scenario) => scenario.id) ?? [];
  return scenarioIds.filter((id) => {
    const values = runs
      .map((run) => run.scenarios.find((scenario) => scenario.id === id)?.[metric])
      .filter((value) => Number.isFinite(value));
    if (values.length !== runCount) return true;
    const sorted = [...values].sort((left, right) => left - right);
    const minimum = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    const maximum = sorted[sorted.length - 1];
    // With three short browser samples, require both adjacent ratios to exceed
    // the threshold before rejecting. One tail sample is then treated as a
    // possible scheduler under/over-count, while three genuinely unstable
    // observations still trigger a paired retry.
    if (minimum <= 0 || median <= 0) return true;
    // A single tail is acceptable only while it remains bounded. A larger
    // spread indicates the runner changed load states between samples.
    if (maximum / minimum > outlierRatio * outlierRatio) return true;
    return median / minimum > outlierRatio && maximum / median > outlierRatio;
  }).map((id) => label ? `${id}:${label}` : id);
}

export function assessPairedPageCpuMeasurementQuality(
  baselineRuns,
  currentRuns,
  options,
) {
  const baseline = [
    ...findPageCpuMeasurementOutliers(baselineRuns, options),
    ...findPageCpuMeasurementOutliers(baselineRuns, {
      ...options,
      metric: 'webBrowserProcessCpuPercent',
      label: 'web',
    }),
  ];
  const current = [
    ...findPageCpuMeasurementOutliers(currentRuns, options),
    ...findPageCpuMeasurementOutliers(currentRuns, {
      ...options,
      metric: 'webBrowserProcessCpuPercent',
      label: 'web',
    }),
  ];
  return {
    baseline,
    current,
    invalidPhases: [
      ...(baseline.length > 0 ? ['baseline'] : []),
      ...(current.length > 0 ? ['current'] : []),
    ],
    valid: baseline.length === 0 && current.length === 0,
  };
}

export function describePairedPageCpuQuality(quality) {
  return quality.invalidPhases
    .map((phase) => `${phase}: ${(quality[phase] ?? []).join(', ')}`)
    .join('; ');
}

export function assertPairedPageCpuMeasurementQuality(baselineRuns, currentRuns, options) {
  const quality = assessPairedPageCpuMeasurementQuality(baselineRuns, currentRuns, options);
  assert(quality.valid, `Paired page CPU phases are statistically invalid: ${describePairedPageCpuQuality(quality)}`);
  return quality;
}

export function planPairedPageCpuRetry({
  baselineRuns,
  currentRuns,
  basePort,
  runCount = PAGE_CPU_RUN_COUNT,
  outlierRatio = PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO,
}) {
  const quality = assessPairedPageCpuMeasurementQuality(
    baselineRuns,
    currentRuns,
    { runCount, outlierRatio },
  );
  return quality.valid
    ? { retry: false, quality, plan: [] }
    : { retry: true, quality, plan: planInterleavedPageCpuRuns({ basePort, runCount }) };
}
