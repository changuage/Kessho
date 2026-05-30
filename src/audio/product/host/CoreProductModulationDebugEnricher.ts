import type { CoreProductModulationDebugEntry, CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';

export function enrichCoreProductModulationDebug(
  telemetry: CoreProductTelemetrySnapshot,
  controlNames: Map<number, string>,
  controlRanges: Map<number, { min: number; max: number }>,
): CoreProductTelemetrySnapshot {
  const debug = telemetry.productModulationDebug;
  if (!debug) return telemetry;
  const enrich = (entry: CoreProductModulationDebugEntry) => {
    const range = controlRanges.get(entry.controlId);
    return {
      ...entry,
      controlName: controlNames.get(entry.controlId) ?? entry.controlName,
      normalizedPosition: range
        ? Math.max(0, Math.min(1, (entry.currentValue - range.min) / Math.max(1.0e-9, range.max - range.min)))
        : entry.normalizedPosition,
    };
  };
  return {
    ...telemetry,
    productModulationDebug: {
      randomWalk: debug.randomWalk.map(enrich),
      sampleHold: debug.sampleHold.map(enrich),
    },
  };
}
