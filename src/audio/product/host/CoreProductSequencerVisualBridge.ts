import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductAnchorWalkerVisualLaneState, CoreProductOrbitVisualLaneState, CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { currentCoreProductSynthAnchorWalkerVisualState, currentCoreProductSynthOrbitVisualState, publishCoreProductSequencerVisuals, publishCoreProductSynthAnchorWalkerVisualState, publishCoreProductSynthOrbitVisualState } from '../../CoreProductHostSequencerVisuals';
import { selectCoreProductSequencerCache, type CoreProductSequencerCacheState } from './CoreProductSequencerCacheBridge';
import { CoreProductSequencerMorphFeedbackBridge } from './CoreProductSequencerMorphFeedbackBridge';

type CoreProductStepVisualCallbackName = 'synthStepPosition' | 'drumStepPosition';
type CoreProductSynthVisualCallbackName = 'synthOrbitVisualState' | 'synthAnchorWalkerVisualState';
type CoreProductVisualCallbackName = CoreProductStepVisualCallbackName | CoreProductSynthVisualCallbackName | string;

type CoreProductSequencerVisualBridgeOptions = {
  synthVisibleLaneCount: number;
  drumVisibleLaneCount: number;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  latestSliderState: () => Record<string, unknown> | null;
  adapterState: () => Record<string, unknown>;
  sequencerCache: () => CoreProductSequencerCacheState;
  synthSubLaneEnabled: () => Record<string, boolean>[];
  drumSubLaneEnabled: () => Record<string, boolean>[];
  fallbackSampleRate: () => number;
  hasCallback: (name: CoreProductVisualCallbackName) => boolean;
  publish: (name: string, ...payload: unknown[]) => void;
};

export class CoreProductSequencerVisualBridge {
  private readonly morphFeedback = new CoreProductSequencerMorphFeedbackBridge();

  constructor(private readonly options: CoreProductSequencerVisualBridgeOptions) {}

  publish(telemetry: CoreProductTelemetrySnapshot | null): void {
    if (this.hasStepVisualCallback()) {
      const latestSliderState = this.options.latestSliderState();
      publishCoreProductSequencerVisuals({
        telemetry,
        snapshot: this.options.latestProductSnapshot(),
        state: latestSliderState ? { ...latestSliderState, ...this.options.adapterState() } : this.options.adapterState(),
        synthToggles: selectCoreProductSequencerCache(this.options.sequencerCache(), 'synth').toggles,
        drumToggles: selectCoreProductSequencerCache(this.options.sequencerCache(), 'drum').toggles,
        synthVisibleLaneCount: this.options.synthVisibleLaneCount,
        drumVisibleLaneCount: this.options.drumVisibleLaneCount,
        sampleRate: telemetry?.sampleRate ?? this.options.fallbackSampleRate(),
        hasCallback: (name) => this.options.hasCallback(name),
        publish: (name, steps, hitCounts) => this.options.publish(name, steps, hitCounts),
      });
    }
    publishCoreProductSynthOrbitVisualState({
      telemetry,
      visibleLaneCount: this.options.synthVisibleLaneCount,
      hasCallback: (name) => this.options.hasCallback(name),
      publish: (name, lanes) => this.options.publish(name, lanes),
    });
    publishCoreProductSynthAnchorWalkerVisualState({
      telemetry,
      visibleLaneCount: this.options.synthVisibleLaneCount,
      hasCallback: (name) => this.options.hasCallback(name),
      publish: (name, lanes) => this.options.publish(name, lanes),
    });
  }

  publishStepCallbackRegistration(
    callback: ((steps: number[], hitCounts: number[]) => void) | null,
    running: boolean,
    telemetry: CoreProductTelemetrySnapshot | null,
    laneCount: number,
  ): void {
    if (!callback) return;
    if (running) {
      if (telemetry) this.publish(telemetry);
      return;
    }
    callback(this.zeroLaneValues(laneCount), this.zeroLaneValues(laneCount));
  }

  currentSynthOrbitVisualState(telemetry: CoreProductTelemetrySnapshot | null): Array<CoreProductOrbitVisualLaneState | null> {
    return currentCoreProductSynthOrbitVisualState(telemetry, this.options.synthVisibleLaneCount);
  }

  currentSynthAnchorWalkerVisualState(telemetry: CoreProductTelemetrySnapshot | null): Array<CoreProductAnchorWalkerVisualLaneState | null> {
    return currentCoreProductSynthAnchorWalkerVisualState(telemetry, this.options.synthVisibleLaneCount);
  }

  updateMorphFeedback(telemetry: CoreProductTelemetrySnapshot): void {
    this.morphFeedback.update({
      telemetry,
      snapshot: this.options.latestProductSnapshot(),
      cache: this.options.sequencerCache(),
      synthSubLaneEnabled: this.options.synthSubLaneEnabled(),
      drumSubLaneEnabled: this.options.drumSubLaneEnabled(),
      hasCallback: (name) => this.options.hasCallback(name),
      publish: (name, ...payload) => this.options.publish(name, ...payload),
    });
  }

  clearMorphFeedback(): void {
    this.morphFeedback.clear({
      hasCallback: (name) => this.options.hasCallback(name),
      publish: (name, ...payload) => this.options.publish(name, ...payload),
    });
  }

  reset(): void {
    this.publish(null);
    this.clearMorphFeedback();
  }

  private hasStepVisualCallback(): boolean {
    return this.options.hasCallback('synthStepPosition') || this.options.hasCallback('drumStepPosition');
  }

  private zeroLaneValues(laneCount: number): number[] {
    const count = Math.max(0, Math.trunc(laneCount));
    return Array.from({ length: count }, () => 0);
  }
}
