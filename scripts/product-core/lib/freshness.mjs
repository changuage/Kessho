export function readReportTimestamp(report) {
  if (typeof report === 'string') return report;
  if (!report || typeof report !== 'object') return null;
  return report.generatedAt ?? report.metadata?.generatedAt ?? report.runner?.finishedAt ?? null;
}

export function reportAgeHours(report, now = Date.now()) {
  const timestamp = readReportTimestamp(report);
  const parsed = Date.parse(timestamp ?? '');
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (now - parsed) / 3_600_000;
}

export function assertFresh(report, maxAgeHours, label = 'report') {
  const age = reportAgeHours(report);
  if (age > maxAgeHours) {
    throw new Error(`${label} must be refreshed within ${maxAgeHours}h`);
  }
}
