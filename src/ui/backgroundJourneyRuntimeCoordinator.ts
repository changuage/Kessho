import type { CoreProductTelemetrySnapshot } from '../audio/coreProductTelemetry';
import type { JourneyConfig } from '../audio/journeyTypes';
import type { SavedPreset } from './state';
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

export type BackgroundJourneyMorphProjection = {
  presetA: SavedPreset;
  presetB: SavedPreset;
  position: number;
  direction: 'toA' | 'toB';
};

type ScheduleTelemetryRead = (callback: () => void) => () => void;

export function requestAndReadBackgroundJourneyTelemetry(
  requestTelemetry: () => void,
  readTelemetry: () => CoreProductTelemetrySnapshot | null,
  scheduleRead: ScheduleTelemetryRead,
  onFreshTelemetry: (telemetry: CoreProductTelemetrySnapshot) => void,
  maxReads = 8,
  onSettled: () => void = () => undefined,
): () => void {
  const previousTelemetry = readTelemetry();
  let cancelled = false;
  let settled = false;
  let reads = 0;
  let cancelScheduledRead: (() => void) | null = null;
  const settle = (): void => {
    if (settled) return;
    settled = true;
    onSettled();
  };

  const readFreshTelemetry = (): void => {
    if (cancelled) return;
    const latestTelemetry = readTelemetry();
    if (latestTelemetry && latestTelemetry !== previousTelemetry) {
      cancelScheduledRead = null;
      onFreshTelemetry(latestTelemetry);
      settle();
      return;
    }
    reads += 1;
    if (reads >= Math.max(1, maxReads)) {
      cancelScheduledRead = null;
      settle();
      return;
    }
    cancelScheduledRead = scheduleRead(readFreshTelemetry);
  };

  requestTelemetry();
  cancelScheduledRead = scheduleRead(readFreshTelemetry);
  return () => {
    if (cancelled) return;
    cancelled = true;
    cancelScheduledRead?.();
    cancelScheduledRead = null;
    settle();
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

export function projectBackgroundJourneyMorph(
  telemetry: Pick<CoreProductTelemetrySnapshot, 'journeyCurrentNodeIndex' | 'journeyNextNodeIndex' | 'journeyMorphProgress' | 'journeyTransitionCount'>,
  playableNodes: JourneyConfig['nodes'],
  presets: ReadonlyMap<string, SavedPreset>,
): BackgroundJourneyMorphProjection | null {
  const currentNode = playableNodes[telemetry.journeyCurrentNodeIndex ?? 0];
  const nextNode = playableNodes[telemetry.journeyNextNodeIndex ?? 0];
  const currentPreset = currentNode ? presets.get(currentNode.id) : null;
  const nextPreset = nextNode ? presets.get(nextNode.id) : null;
  if (!currentPreset || !nextPreset) return null;

  const progress = Math.max(0, Math.min(1, telemetry.journeyMorphProgress ?? 0));
  const transitionCount = Math.max(0, Math.trunc(telemetry.journeyTransitionCount ?? 0));
  if (transitionCount % 2 === 0) {
    return { presetA: currentPreset, presetB: nextPreset, position: progress * 100, direction: 'toB' };
  }
  return { presetA: nextPreset, presetB: currentPreset, position: (1 - progress) * 100, direction: 'toA' };
}

export function shouldRefreshBackgroundJourneyTelemetry(
  previous: BackgroundJourneyRuntimeVisibility,
  current: BackgroundJourneyRuntimeVisibility,
): boolean {
  return current.documentVisible && current.runtimeProjectionActive &&
    (!previous.documentVisible || !previous.runtimeProjectionActive);
}
