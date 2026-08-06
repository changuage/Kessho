import { createCoreProductStartEvent, createCoreProductStopEvent, type CoreProductEvent } from '../../coreProductEvents';
import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import { CoreProductAssetNotReadyError, type CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';
import type { CoreProductArrangementBridge } from './CoreProductArrangementBridge';
import type { CoreProductJourneyMorphClock } from './CoreProductJourneyMorphClock';
import type { CoreProductModulationRangeBridge } from './CoreProductModulationRangeBridge';
import type { CoreProductPostSnapshotEventQueue } from './CoreProductPostSnapshotEventQueue';
import type { CoreProductRealtimeTimestampMapper } from './CoreProductRealtimeTimestampMapper';
import type { CoreProductSequencerVisualBridge } from './CoreProductSequencerVisualBridge';
import type { CoreProductHostSequencerChain } from '../../CoreProductHostSequencerChain';

type CoreProductHostLifecycleCoordinatorOptions = {
  readonly runtime: CoreProductRuntime;
  readonly assetRegistrar: CoreProductAssetRegistrar;
  readonly arrangementBridge: CoreProductArrangementBridge;
  readonly journeyMorphClock: CoreProductJourneyMorphClock;
  readonly modulationRangeBridge: CoreProductModulationRangeBridge;
  readonly postSnapshotEvents: CoreProductPostSnapshotEventQueue;
  readonly realtimeTimestampMapper: CoreProductRealtimeTimestampMapper;
  readonly sequencerChain: CoreProductHostSequencerChain;
  readonly sequencerVisuals: CoreProductSequencerVisualBridge;
  readonly latestSliderState: () => Record<string, unknown> | null;
  readonly setLatestSliderState: (state: Record<string, unknown> | null) => void;
  readonly adapterState: () => Record<string, unknown>;
  readonly setLatestProductSnapshotNull: () => void;
  readonly setRuntimeReady: (ready: boolean) => void;
  readonly setRunning: (running: boolean) => void;
  readonly resetSequencerEvolveState: () => void;
  readonly resetSynthNoteRangeOverrides: () => void;
  readonly updateRuntimeTelemetryPolling: () => void;
  readonly loadLatestSnapshot: (reason?: SnapshotReloadReason, includeClockStartDelay?: boolean, awaitAudioThreadAck?: boolean) => Promise<void>;
  readonly postRuntimeProductEvent: (event: CoreProductEvent) => void;
  readonly publishStateChange: (isRunning: boolean) => void;
};

export class CoreProductHostLifecycleCoordinator {
  constructor(private readonly options: CoreProductHostLifecycleCoordinatorOptions) {}

  private publishParityStartupPhase(phase: string): void {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('parity') !== '1') return;
    document.documentElement.dataset.coreProductRuntimePhase = phase;
  }

  async start(sliderState?: Record<string, unknown>): Promise<void> {
    if (sliderState) {
      this.options.setLatestSliderState({ ...sliderState });
    }
    await this.options.runtime.resume();
    this.publishParityStartupPhase('runtime-resumed');
    this.options.setRuntimeReady(true);
    const assetResult = await this.options.assetRegistrar.ensureDefaultAssetsForState();
    if (assetResult.status === 'not-ready') {
      throw new CoreProductAssetNotReadyError(assetResult);
    }
    this.publishParityStartupPhase('assets-ready');
    this.options.resetSequencerEvolveState();
    await this.options.loadLatestSnapshot('runtime-start', true, true);
    this.publishParityStartupPhase('snapshot-ready');
    this.startRunningSurfaces();
    this.publishParityStartupPhase('running');
    this.options.modulationRangeBridge.flushModulationRanges();
    this.options.arrangementBridge.start(this.options.latestSliderState(), this.options.adapterState());
    this.options.publishStateChange(true);
  }

  async resume(): Promise<void> {
    // MIDI host timestamps are relative to the current audio clock epoch.
    // Recalibrate after every explicit resume so events queued across a
    // suspend cannot inherit a stale wall-clock offset.
    this.options.realtimeTimestampMapper.reset();
    await this.options.runtime.resume();
    this.options.resetSequencerEvolveState();
    await this.options.loadLatestSnapshot('runtime-start', true, true);
    this.startRunningSurfaces();
    this.options.arrangementBridge.start(this.options.latestSliderState(), this.options.adapterState());
    this.options.publishStateChange(true);
  }

  async suspend(): Promise<void> {
    this.options.sequencerChain.stop();
    this.options.arrangementBridge.stop();
    this.options.postRuntimeProductEvent(createCoreProductStopEvent());
    await this.options.runtime.suspend();
    this.options.realtimeTimestampMapper.reset();
    this.finishStoppedRuntime();
  }

  async stop(runtimeReady: boolean): Promise<void> {
    this.options.sequencerChain.stop();
    this.options.arrangementBridge.stop();
    if (runtimeReady) {
      this.options.postRuntimeProductEvent(createCoreProductStopEvent());
    }
    await this.options.runtime.suspend();
    this.options.realtimeTimestampMapper.reset();
    this.finishStoppedRuntime();
  }

  dispose(runtimeReady: boolean): void {
    this.options.sequencerChain.stop();
    this.options.arrangementBridge.stop();
    if (runtimeReady) {
      this.options.postRuntimeProductEvent(createCoreProductStopEvent());
    }
    this.options.postSnapshotEvents.clear();
    this.options.runtime.dispose();
    this.options.setRuntimeReady(false);
    this.options.resetSequencerEvolveState();
    this.options.realtimeTimestampMapper.reset();
    this.options.setLatestProductSnapshotNull();
    this.options.assetRegistrar.clear();
    this.finishStoppedRuntime();
  }

  private startRunningSurfaces(): void {
    this.options.setRunning(true);
    this.options.sequencerChain.start(this.options.latestSliderState(), this.options.adapterState());
    this.options.updateRuntimeTelemetryPolling();
    this.options.postRuntimeProductEvent(createCoreProductStartEvent());
  }

  private finishStoppedRuntime(): void {
    this.options.resetSequencerEvolveState();
    this.options.setRunning(false);
    this.options.resetSynthNoteRangeOverrides();
    this.options.updateRuntimeTelemetryPolling();
    this.options.sequencerVisuals.reset();
    this.options.publishStateChange(false);
  }
}
