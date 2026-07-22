export const PAGE_CPU_RUN_COUNT = 3;
export const PAGE_CPU_MAX_REGRESSION_PERCENT = 3;
export const PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO = 1.2;

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
  { runCount = PAGE_CPU_RUN_COUNT, outlierRatio = PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO } = {},
) {
  if (!Array.isArray(runs) || runs.length !== runCount) return ['phase-run-count'];
  const scenarioIds = runs[0]?.scenarios?.map((scenario) => scenario.id) ?? [];
  return scenarioIds.filter((id) => {
    const values = runs
      .map((run) => run.scenarios.find((scenario) => scenario.id === id)?.productBrowserProcessCpuPercent)
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
    return median / minimum > outlierRatio && maximum / median > outlierRatio;
  });
}

export function assessPairedPageCpuMeasurementQuality(
  baselineRuns,
  currentRuns,
  options,
) {
  const baseline = findPageCpuMeasurementOutliers(baselineRuns, options);
  const current = findPageCpuMeasurementOutliers(currentRuns, options);
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
