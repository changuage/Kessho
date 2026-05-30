import { CoreProductArrangementScheduler } from '../../coreProductArrangementScheduler';
import type { CoreProductEvent } from '../../coreProductEvents';

type CoreProductArrangementAudioContextProvider = () => AudioContext | null;
type CoreProductArrangementPostEvent = (event: CoreProductEvent) => void;
type CoreProductArrangementPublishTrigger = (name: string, ...payload: unknown[]) => void;

export class CoreProductArrangementBridge {
  private readonly scheduler: CoreProductArrangementScheduler;
  private runtimeWalkStatePatch: Record<string, number> = {};

  constructor(
    postEvent: CoreProductArrangementPostEvent,
    audioContext: CoreProductArrangementAudioContextProvider,
    publishTrigger?: CoreProductArrangementPublishTrigger,
  ) {
    this.scheduler = new CoreProductArrangementScheduler(postEvent, audioContext, publishTrigger);
  }

  createState(
    latestSliderState: Record<string, unknown> | null,
    adapterState: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!latestSliderState && Object.keys(adapterState).length === 0) return null;
    return {
      ...(latestSliderState ?? {}),
      ...adapterState,
      ...this.runtimeWalkStatePatch,
    };
  }

  setRuntimeWalkStatePatch(patch: Record<string, number>): void {
    this.runtimeWalkStatePatch = { ...patch };
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
}
