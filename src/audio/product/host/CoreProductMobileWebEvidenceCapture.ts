import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';

export type MobileWebEvidenceScenario = {
  readonly kind: 'screen-lock' | 'app-switch';
  readonly presetId: string;
  readonly output: 'speaker' | 'wired' | 'bluetooth';
  readonly durationMinutes: number;
  readonly lockedMinutes: number;
  readonly appSwitchedMinutes: number;
  readonly bundles: readonly ('base-autonomy' | 'base-max-cpu' | 'current-smoke' | 'auto-stop' | 'advanced-parity')[];
};

export type MobileWebEvidenceCaptureConfig = {
  readonly device: {
    readonly model: string;
    readonly os: string;
    readonly browser: 'safari' | 'chrome' | 'home-screen';
  };
  readonly scenario: MobileWebEvidenceScenario;
  readonly initialAudibleGapCount: number;
};

export type MobileWebEvidenceExternalMeasurements = {
  readonly expectedTraceHash: string;
  readonly afterAudibleGapCount: number;
  readonly processTerminated: boolean;
  readonly warmedHeapFirstCycleBytes: number;
  readonly warmedHeapSecondCycleBytes: number;
  readonly assetAllocationFirstCycleBytes: number;
  readonly assetAllocationSecondCycleBytes: number;
  readonly thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
  readonly sustainedThermalDropouts: boolean;
  readonly maxAudibleGapMs: number;
  readonly repeatedGapPattern: boolean;
  readonly outputCorrelation: number;
  readonly loudnessDeltaDb: number;
  readonly interruptionTested: boolean;
  readonly interruptionRecoveryPass: boolean;
  readonly lockScreenControlsPass: boolean;
};

type MetricSnapshot = {
  readonly renderCpuMean: number;
  readonly renderCpuPeak: number;
  readonly renderP95Ms: number;
  readonly renderP99Ms: number;
  readonly missedQuantumCount: number;
  readonly assetMissingCount: number;
  readonly wasmHeapBytes: number;
  readonly decodedAssetBytes: number;
  readonly assetAllocationBytes: number;
  readonly hostDecodedBytes: number;
  readonly inFlightDecodedBytes: number;
  readonly audibleGapCount: number;
};

type RuntimeClassification = 'pass' | 'browser-policy-suspension' | 'engine-failure';

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function integer(value: number | undefined): number {
  return Math.trunc(finite(value));
}

function sampleFrame(telemetry: CoreProductTelemetrySnapshot): number {
  return integer(telemetry.absoluteSampleTime);
}

function metricSnapshot(
  telemetry: CoreProductTelemetrySnapshot,
  audibleGapCount: number,
): MetricSnapshot {
  return {
    renderCpuMean: finite(telemetry.renderCpuPercent),
    renderCpuPeak: finite(telemetry.renderCpuPeakPercent),
    renderP95Ms: finite(telemetry.renderP95Ms),
    renderP99Ms: finite(telemetry.renderP99Ms),
    missedQuantumCount: integer(telemetry.missedQuantumCount),
    assetMissingCount: integer(telemetry.assetMissingCount),
    wasmHeapBytes: integer(telemetry.wasmHeapBytes),
    decodedAssetBytes: integer(telemetry.decodedAssetBytes),
    assetAllocationBytes: integer(telemetry.assetAllocationBytes),
    hostDecodedBytes: integer(telemetry.hostDecodedBytes),
    inFlightDecodedBytes: integer(telemetry.inFlightDecodedBytes),
    audibleGapCount: Math.max(0, Math.trunc(audibleGapCount)),
  };
}

function classifyRuntime(
  browser: MobileWebEvidenceCaptureConfig['device']['browser'],
  observedHiddenFrames: number,
  expectedHiddenFrames: number,
  sonicStateAdvanced: boolean,
  traceMatches: boolean,
): RuntimeClassification {
  if (expectedHiddenFrames > 0 && observedHiddenFrames <= expectedHiddenFrames * 0.1) {
    return browser === 'home-screen' ? 'engine-failure' : 'browser-policy-suspension';
  }
  if (
    expectedHiddenFrames > 0 &&
    observedHiddenFrames >= expectedHiddenFrames * 0.95 &&
    sonicStateAdvanced &&
    traceMatches
  ) {
    return 'pass';
  }
  return 'engine-failure';
}

export class CoreProductMobileWebEvidenceCapture {
  private latestTelemetry: CoreProductTelemetrySnapshot;
  private beforeTelemetry: CoreProductTelemetrySnapshot | null = null;
  private afterTelemetry: CoreProductTelemetrySnapshot | null = null;
  private hiddenStartedMs: number | null = null;
  private hiddenEndedMs: number | null = null;
  private awaitingForegroundTelemetry = false;
  private completedHiddenInterval = false;
  private hiddenUiCallbackCount = 0;
  private foregroundRefreshCount = 0;
  private staleForegroundEventCount = 0;
  private maxDecodedAssetBytes = 0;
  private maxHostDecodedBytes = 0;

  constructor(
    private readonly config: MobileWebEvidenceCaptureConfig,
    initialTelemetry: CoreProductTelemetrySnapshot,
  ) {
    this.latestTelemetry = initialTelemetry;
    this.observeHighWater(initialTelemetry);
  }

  observeVisibility(hidden: boolean, nowMs: number): void {
    if (hidden) {
      if (this.hiddenStartedMs !== null || this.completedHiddenInterval) {
        throw new Error('Mobile evidence capture supports one continuous hidden interval per run');
      }
      this.beforeTelemetry = this.latestTelemetry;
      this.hiddenStartedMs = nowMs;
      return;
    }
    if (this.hiddenStartedMs === null || this.hiddenEndedMs !== null) return;
    this.hiddenEndedMs = nowMs;
    this.awaitingForegroundTelemetry = true;
  }

  observeTelemetry(telemetry: CoreProductTelemetrySnapshot, documentHidden: boolean): void {
    this.latestTelemetry = telemetry;
    this.observeHighWater(telemetry);
    if (documentHidden) {
      this.hiddenUiCallbackCount += 1;
      return;
    }
    if (!this.awaitingForegroundTelemetry) return;
    this.awaitingForegroundTelemetry = false;
    this.completedHiddenInterval = true;
    this.foregroundRefreshCount += 1;
    const beforeFrame = this.beforeTelemetry ? sampleFrame(this.beforeTelemetry) : 0;
    if (sampleFrame(telemetry) <= beforeFrame) this.staleForegroundEventCount += 1;
    this.afterTelemetry = telemetry;
  }

  isReadyToFinish(): boolean {
    return this.completedHiddenInterval && this.beforeTelemetry !== null && this.afterTelemetry !== null;
  }

  finish(external: MobileWebEvidenceExternalMeasurements): Record<string, unknown> {
    if (!this.isReadyToFinish() || this.hiddenStartedMs === null || this.hiddenEndedMs === null) {
      throw new Error('Mobile evidence capture requires one completed hidden interval and its foreground telemetry refresh');
    }
    const beforeTelemetry = this.beforeTelemetry!;
    const afterTelemetry = this.afterTelemetry!;
    const beforeFrame = sampleFrame(beforeTelemetry);
    const afterFrame = sampleFrame(afterTelemetry);
    const observedHiddenFrames = Math.max(0, afterFrame - beforeFrame);
    const sampleRate = Math.max(1, finite(beforeTelemetry.sampleRate) || finite(afterTelemetry.sampleRate) || 48_000);
    let expectedHiddenFrames = Math.max(
      1,
      Math.round(Math.max(0, this.hiddenEndedMs - this.hiddenStartedMs) * sampleRate / 1000),
    );
    const autoStopTargetFrame = this.config.scenario.bundles.includes('auto-stop')
      ? integer(beforeTelemetry.autoStopTargetSampleFrame)
      : 0;
    if (autoStopTargetFrame > beforeFrame) {
      expectedHiddenFrames = autoStopTargetFrame - beforeFrame;
    }
    const beforeRevision = integer(beforeTelemetry.sonicAutonomyRevision);
    const afterRevision = integer(afterTelemetry.sonicAutonomyRevision);
    const observedTraceHash = afterTelemetry.sonicAutonomyFingerprint ?? '';
    const sonicStateAdvanced = afterRevision > beforeRevision;
    const runtimeClassification = classifyRuntime(
      this.config.device.browser,
      observedHiddenFrames,
      expectedHiddenFrames,
      sonicStateAdvanced,
      observedTraceHash === external.expectedTraceHash,
    );
    const runtime: Record<string, unknown> = {
      sampleRate,
      sampleFrameBefore: beforeFrame,
      sampleFrameAfter: afterFrame,
      autonomyRevisionBefore: beforeRevision,
      autonomyRevisionAfter: afterRevision,
      expectedHiddenFrames,
      observedHiddenFrames,
      sonicStateAdvanced,
      expectedTraceHash: external.expectedTraceHash,
      observedTraceHash,
    };
    if (this.config.scenario.bundles.includes('auto-stop')) {
      const targetFrame = autoStopTargetFrame;
      runtime.autoStopTargetFrame = targetFrame;
      runtime.autoStopObservedFrame = afterFrame;
      runtime.autoStopFiredWhileHidden = targetFrame > beforeFrame &&
        afterFrame === targetFrame &&
        afterTelemetry.autoStopEnabled === false;
    }
    if (this.config.scenario.bundles.includes('advanced-parity')) {
      const preparedFrames = integer(afterTelemetry.journeyPreparedTotalFrames);
      runtime.journeyReady = afterTelemetry.journeyScheduleRevision !== undefined &&
        afterTelemetry.journeyScheduleRevision > 0 &&
        preparedFrames >= sampleRate * 7_200;
      runtime.journeyPreparedDurationSeconds = Math.floor(preparedFrames / sampleRate);
      runtime.journeyScheduleEntries = integer(afterTelemetry.journeyScheduleEntryCount);
      runtime.journeyAssetBytes = integer(afterTelemetry.decodedAssetBytes);
      runtime.journeyTransitionCount = integer(afterTelemetry.journeyTransitionCount);
    }

    return {
      schema: 'kessho-mobile-web-audio-evidence-v2',
      device: this.config.device,
      scenario: { ...this.config.scenario, bundles: [...this.config.scenario.bundles] },
      before: metricSnapshot(beforeTelemetry, this.config.initialAudibleGapCount),
      after: metricSnapshot(afterTelemetry, external.afterAudibleGapCount),
      acceptance: {
        milestone: this.config.scenario.bundles.includes('advanced-parity') ? 'advanced' : 'base',
        runtimeClassification,
        runtime,
        processTerminated: external.processTerminated,
        maxDecodedAssetBytes: this.maxDecodedAssetBytes,
        maxHostDecodedBytes: this.maxHostDecodedBytes,
        deferredReleaseDecodedAssetBytes: integer(afterTelemetry.decodedAssetBytes),
        warmedHeapFirstCycleBytes: external.warmedHeapFirstCycleBytes,
        warmedHeapSecondCycleBytes: external.warmedHeapSecondCycleBytes,
        assetAllocationFirstCycleBytes: external.assetAllocationFirstCycleBytes,
        assetAllocationSecondCycleBytes: external.assetAllocationSecondCycleBytes,
        thermalState: external.thermalState,
        sustainedThermalDropouts: external.sustainedThermalDropouts,
        hidden: {
          maxAudibleGapMs: external.maxAudibleGapMs,
          repeatedGapPattern: external.repeatedGapPattern,
          hiddenUiCallbackCount: this.hiddenUiCallbackCount,
          foregroundRefreshCount: this.foregroundRefreshCount,
          staleForegroundEventCount: this.staleForegroundEventCount,
          outputCorrelation: external.outputCorrelation,
          loudnessDeltaDb: external.loudnessDeltaDb,
          interruptionTested: external.interruptionTested,
          interruptionRecoveryPass: external.interruptionRecoveryPass,
          lockScreenControlsPass: external.lockScreenControlsPass,
        },
      },
    };
  }

  private observeHighWater(telemetry: CoreProductTelemetrySnapshot): void {
    this.maxDecodedAssetBytes = Math.max(this.maxDecodedAssetBytes, integer(telemetry.decodedAssetBytes));
    this.maxHostDecodedBytes = Math.max(this.maxHostDecodedBytes, integer(telemetry.hostDecodedBytes));
  }
}
