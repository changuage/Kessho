import type { CoreProductTelemetrySnapshot } from '../audio/coreProductTelemetry';
import type { JourneyConfig } from '../audio/journeyTypes';
import {
  resolveBackgroundJourneyRuntimePhase,
  type BackgroundJourneyRuntimePhase,
} from '../audio/product/journey/reconcileBackgroundJourneyProjection';

export type BackgroundJourneyTelemetryProjection = {
  phase: BackgroundJourneyRuntimePhase;
  currentNodeId: string | null;
  nextNodeId: string | null;
  scheduleIndex: number | null;
  phraseProgress: number;
  morphProgress: number;
};

export type BackgroundJourneyRuntimeVisibility = {
  documentVisible: boolean;
  runtimeProjectionActive: boolean;
};

type ScheduleTelemetryRead = (callback: () => void) => () => void;

export function requestAndReadBackgroundJourneyTelemetry(
  requestTelemetry: () => void,
  readTelemetry: () => CoreProductTelemetrySnapshot | null,
  scheduleRead: ScheduleTelemetryRead,
  onFreshTelemetry: (telemetry: CoreProductTelemetrySnapshot) => void,
  maxReads = 8,
): () => void {
  const previousTelemetry = readTelemetry();
  let cancelled = false;
  let reads = 0;
  let cancelScheduledRead: (() => void) | null = null;

  const readFreshTelemetry = (): void => {
    if (cancelled) return;
    const latestTelemetry = readTelemetry();
    if (latestTelemetry && latestTelemetry !== previousTelemetry) {
      cancelScheduledRead = null;
      onFreshTelemetry(latestTelemetry);
      return;
    }
    reads += 1;
    if (reads >= Math.max(1, maxReads)) {
      cancelScheduledRead = null;
      return;
    }
    cancelScheduledRead = scheduleRead(readFreshTelemetry);
  };

  requestTelemetry();
  cancelScheduledRead = scheduleRead(readFreshTelemetry);
  return () => {
    cancelled = true;
    cancelScheduledRead?.();
    cancelScheduledRead = null;
  };
}

export function projectBackgroundJourneyTelemetry(
  telemetry: Pick<CoreProductTelemetrySnapshot, 'journeySchedulePhase' | 'journeyScheduleRunning' | 'journeyCurrentNodeIndex' | 'journeyNextNodeIndex' | 'journeyScheduleIndex' | 'journeyHoldProgress' | 'journeyMorphProgress'>,
  playableNodes: JourneyConfig['nodes'],
): BackgroundJourneyTelemetryProjection {
  const current = playableNodes[telemetry.journeyCurrentNodeIndex ?? 0];
  const next = playableNodes[telemetry.journeyNextNodeIndex ?? 0];
  return {
    phase: resolveBackgroundJourneyRuntimePhase(telemetry),
    currentNodeId: current?.id ?? null,
    nextNodeId: next?.id ?? null,
    scheduleIndex: Number.isInteger(telemetry.journeyScheduleIndex) ? telemetry.journeyScheduleIndex! : null,
    phraseProgress: telemetry.journeyHoldProgress ?? 0,
    morphProgress: telemetry.journeyMorphProgress ?? 0,
  };
}

export function shouldRefreshBackgroundJourneyTelemetry(
  previous: BackgroundJourneyRuntimeVisibility,
  current: BackgroundJourneyRuntimeVisibility,
): boolean {
  return current.documentVisible && current.runtimeProjectionActive &&
    (!previous.documentVisible || !previous.runtimeProjectionActive);
}
