import { CoreProductArrangementScheduler } from '../../coreProductArrangementScheduler';
import type { CoreProductEvent } from '../../coreProductEvents';
import type { ProductSimpleSequencerVisualPlanActive } from '../ProductEngineTypes';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';
import type { TransportDebugSnapshot } from '../../transport';

type CoreProductArrangementAudioContextProvider = () => AudioContext | null;
type CoreProductArrangementPostEvent = (event: CoreProductEvent) => void;
type CoreProductArrangementPublishTrigger = (name: string, ...payload: unknown[]) => void;
type CoreProductArrangementSampleAssetLoader = (slotId: SampleSlotId, midi: number, velocity: number) => Promise<void>;

export class CoreProductArrangementBridge {
  private readonly scheduler: CoreProductArrangementScheduler;
  private runtimeWalkStatePatch: Record<string, number> = {};

  constructor(
    postEvent: CoreProductArrangementPostEvent,
    audioContext: CoreProductArrangementAudioContextProvider,
    publishTrigger?: CoreProductArrangementPublishTrigger,
    ensureScheduledSampleAsset?: CoreProductArrangementSampleAssetLoader,
  ) {
    this.scheduler = new CoreProductArrangementScheduler(postEvent, audioContext, publishTrigger, ensureScheduledSampleAsset);
  }

  createState(
    latestSliderState: Record<string, unknown> | null,
    adapterState: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!latestSliderState && Object.keys(adapterState).length === 0) return null;
    const restartState = {
      ...(latestSliderState ?? {}),
      ...adapterState,
    };
    const state = {
      ...restartState,
      ...this.runtimeWalkStatePatch,
    };
    Object.defineProperty(state, '__arrangementRestartState', {
      value: restartState,
      enumerable: false,
      configurable: true,
    });
    return state;
  }

  setRuntimeWalkStatePatch(patch: Record<string, number>): void {
    this.runtimeWalkStatePatch = { ...patch };
  }

  setRuntimePlanCaptureEnabled(active: ProductSimpleSequencerVisualPlanActive): void {
    this.scheduler.setRuntimePlanCaptureEnabled(active);
  }

  start(latestSliderState: Record<string, unknown> | null, adapterState: Record<string, unknown>): void {
    this.scheduler.start(this.createState(latestSliderState, adapterState));
  }

  update(latestSliderState: Record<string, unknown> | null, adapterState: Record<string, unknown>): void {
    this.scheduler.update(this.createState(latestSliderState, adapterState));
  }

  stop(): void {
    this.scheduler.stop();
  }

  getTransportDebugState(nowWallSec?: number): Partial<TransportDebugSnapshot> | null {
    return this.scheduler.getTransportDebugState(nowWallSec);
  }
}
