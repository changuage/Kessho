import { CORE_PRODUCT_MEMORY_BUDGETS } from '../../coreProductAssets';
import type { CoreProductTelemetrySnapshot, CoreProductVisualTelemetrySnapshot } from '../../coreProductTelemetry';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';

export function mergeCoreProductVisualTelemetry(
  previous: CoreProductTelemetrySnapshot | null,
  telemetry: CoreProductVisualTelemetrySnapshot,
  running: boolean,
): CoreProductTelemetrySnapshot {
  return {
    ...(previous ?? {}),
    ...telemetry,
    schemaHash: telemetry.schemaHash,
    transportRunning: telemetry.transportRunning ?? running,
    activeSources: previous?.activeSources ?? 0,
    activeVoices: previous?.activeVoices ?? 0,
    activeAssets: previous?.activeAssets ?? 0,
    sequencerEventCount: previous?.sequencerEventCount ?? 0,
    controlQueueDepth: previous?.controlQueueDepth ?? 0,
    assetMissingCount: previous?.assetMissingCount ?? 0,
    lastErrorCode: previous?.lastErrorCode ?? 0,
  };
}

export function enrichCoreProductHostTelemetry(
  telemetry: CoreProductTelemetrySnapshot,
  diagnostics: ProductRuntimeDiagnostics,
  decodedAssetBytes: number,
): CoreProductTelemetrySnapshot {
  return {
    ...telemetry,
    wasmHeapBudgetBytes: CORE_PRODUCT_MEMORY_BUDGETS.webWorkletHeapBytes,
    decodedAssetBytes: telemetry.decodedAssetBytes ?? decodedAssetBytes,
    decodedAssetBudgetBytes: CORE_PRODUCT_MEMORY_BUDGETS.totalRegisteredDecodedBytes,
    ...diagnostics,
    lastSnapshotReloadReason: diagnostics.lastSnapshotReloadReason ?? undefined,
  };
}

export function createCoreProductPerfSnapshot(
  telemetry: CoreProductTelemetrySnapshot,
  diagnostics: ProductRuntimeDiagnostics,
  decodedAssetBytes: number,
): Record<string, unknown> {
  return {
    product: {
      avgPercent: telemetry.renderCpuPercent ?? 0,
      peakPercent: telemetry.renderCpuPeakPercent ?? 0,
      missPercent: telemetry.missedQuantumCount ?? null,
      scope: 'worklet',
    },
    sequencerEventCount: telemetry.sequencerEventCount,
    controlQueueDepth: telemetry.controlQueueDepth,
    activeVoices: telemetry.activeVoices,
    activeSources: telemetry.activeSources,
    activeAssets: telemetry.activeAssets,
    wasmHeapBytes: telemetry.wasmHeapBytes ?? 0,
    wasmHeapBudgetBytes: telemetry.wasmHeapBudgetBytes ?? CORE_PRODUCT_MEMORY_BUDGETS.webWorkletHeapBytes,
    decodedAssetBytes: telemetry.decodedAssetBytes ?? decodedAssetBytes,
    decodedAssetBudgetBytes: telemetry.decodedAssetBudgetBytes ?? CORE_PRODUCT_MEMORY_BUDGETS.totalRegisteredDecodedBytes,
    assetAllocationBytes: telemetry.assetAllocationBytes ?? telemetry.decodedAssetBytes ?? decodedAssetBytes,
    activeGrains: telemetry.activeGrains ?? 0,
    masterTruePeak: telemetry.masterTruePeak ?? telemetry.masterOutputPeak ?? 0,
    masterTruePeakDbtp: telemetry.masterTruePeakDbtp ?? 0,
    masterIntegratedLufs: telemetry.masterIntegratedLufs ?? -100,
    journeyMorphPhase: telemetry.journeyMorphPhase ?? 0,
    journeyMorphRunning: telemetry.journeyMorphRunning ?? false,
    transportRunning: telemetry.transportRunning,
    absoluteSampleTime: telemetry.absoluteSampleTime ?? 0,
    assetMissingCount: telemetry.assetMissingCount,
    lastErrorCode: telemetry.lastErrorCode,
    dirtyDiffCount: telemetry.dirtyDiffCount ?? diagnostics.dirtyDiffCount,
    fullSnapshotReloadCount: telemetry.fullSnapshotReloadCount ?? diagnostics.fullSnapshotReloadCount,
    unsupportedControlCount: telemetry.unsupportedControlCount ?? diagnostics.unsupportedControlCount,
    unsupportedGetterCount: telemetry.unsupportedGetterCount ?? diagnostics.unsupportedGetterCount,
    lastUnsupportedMethod: telemetry.lastUnsupportedMethod ?? diagnostics.lastUnsupportedMethod,
    lastUnsupportedMethodClass: telemetry.lastUnsupportedMethodClass ?? diagnostics.lastUnsupportedMethodClass,
    runtimeFallbackDiagnosticCount: telemetry.runtimeFallbackDiagnosticCount ?? diagnostics.runtimeFallbackDiagnosticCount,
    audioCriticalFallbackCount: telemetry.audioCriticalFallbackCount ?? diagnostics.audioCriticalFallbackCount,
    snapshotReloadCpuMs: telemetry.snapshotReloadCpuMs ?? diagnostics.snapshotReloadCpuMs,
    lastSnapshotReloadReason: telemetry.lastSnapshotReloadReason ?? diagnostics.lastSnapshotReloadReason,
    snapshotReloadReasons: telemetry.snapshotReloadReasons ?? diagnostics.snapshotReloadReasons,
  };
}
