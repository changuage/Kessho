import { CoreProductArrangementScheduler } from '../../coreProductArrangementScheduler';
import type { CoreProductEvent } from '../../coreProductEvents';

type CoreProductArrangementAudioContextProvider = () => AudioContext | null;
type CoreProductArrangementPostEvent = (event: CoreProductEvent) => void;

export class CoreProductArrangementBridge {
  private readonly scheduler: CoreProductArrangementScheduler;

  constructor(postEvent: CoreProductArrangementPostEvent, audioContext: CoreProductArrangementAudioContextProvider) {
    this.scheduler = new CoreProductArrangementScheduler(postEvent, audioContext);
  }

  createState(
    latestSliderState: Record<string, unknown> | null,
    adapterState: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!latestSliderState && Object.keys(adapterState).length === 0) return null;
    return {
      ...(latestSliderState ?? {}),
      ...adapterState,
    };
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
