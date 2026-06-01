import {
  CORE_PRODUCT_EVOLVE_FLAGS,
  createCoreProductSequencerDiceEvent,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import { createCoreProductSequencerEvolveClock } from '../../CoreProductHostSequencerEvolve';
import { coreProductSequencerEvolveRngSeed } from '../../CoreProductHostSequencerEvolveRng';
import { coreProductSequencerEffectiveEvolveTension } from '../../CoreProductHostSequencerEvolveTension';
import {
  type NormalizedSequencerEvolveConfig,
} from '../../CoreProductHostSequencerEvolveConfig';
import { nativeEvolveFlagsForEvolveConfig } from './CoreProductSequencerNativeEvolveFlags';

export type CoreProductSequencerEvolveRuntimeBridgeOptions = {
  adapterState: () => Record<string, unknown>;
  latestSliderState: () => Record<string, unknown> | null;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  runtimeReady: () => boolean;
  captureLaneHome: (sequencer: SequencerKind, laneIndex: number) => void;
  getEnabledSubLanes: (sequencer: SequencerKind, laneIndex: number) => string[];
  postWithHomeCapture: (event: CoreProductEvent) => void;
  publish: (name: string, ...payload: unknown[]) => void;
};

export class CoreProductSequencerEvolveRuntimeBridge {
  private readonly clock = createCoreProductSequencerEvolveClock();

  constructor(private readonly options: CoreProductSequencerEvolveRuntimeBridgeOptions) {}

  reset(): void {
    this.clock.reset();
  }

  tick(hostTelemetry: CoreProductTelemetrySnapshot): void {
    this.clock.tick({
      telemetry: hostTelemetry,
      synthConfigs: this.options.adapterState().synthEuclidEvolveConfigs,
      drumConfigs: this.options.adapterState().drumEuclidEvolveConfigs,
      post: (event) => this.options.postWithHomeCapture(event),
      publish: (name, laneIndex) => this.options.publish(name, laneIndex),
      getEnabledSubLanes: (sequencer, laneIndex) => this.options.getEnabledSubLanes(sequencer, laneIndex),
      getEffectiveTension: (sequencer, laneIndex) => coreProductSequencerEffectiveEvolveTension({ sequencer, laneIndex, latestSliderState: this.options.latestSliderState(), latestProductSnapshot: this.options.latestProductSnapshot(), telemetry: hostTelemetry }),
      getRngSeed: (_sequencer, _laneIndex, fallbackSeed) => coreProductSequencerEvolveRngSeed(this.options.latestSliderState(), hostTelemetry, fallbackSeed),
      evolveLane: (sequencer, laneIndex, config, seed, bar) => this.evolveLaneWithNativeProductCore(hostTelemetry, sequencer, laneIndex, config, seed, bar),
    });
  }

  private evolveLaneWithNativeProductCore(
    telemetry: CoreProductTelemetrySnapshot,
    sequencer: SequencerKind,
    laneIndex: number,
    config: NormalizedSequencerEvolveConfig,
    seed: number,
    bar: number,
  ): { handled: boolean; changed: boolean } {
    if (!this.options.runtimeReady()) return { handled: true, changed: false };
    const nativeFlags = nativeEvolveFlagsForEvolveConfig(config, sequencer);
    if (nativeFlags === 0) return { handled: true, changed: false };
    const streamSeed = coreProductSequencerEvolveRngSeed(this.options.latestSliderState(), telemetry, seed);
    const flags = nativeFlags + CORE_PRODUCT_EVOLVE_FLAGS.modeParity + CORE_PRODUCT_EVOLVE_FLAGS.rngStream;
    this.options.captureLaneHome(sequencer, laneIndex);
    this.options.postWithHomeCapture(createCoreProductSequencerDiceEvent(
      sequencer,
      laneIndex,
      config.evolution,
      streamSeed,
      flags,
      nativeDiceWriteOffset(config),
      bar,
      coreProductSequencerEffectiveEvolveTension({ sequencer, laneIndex, latestSliderState: this.options.latestSliderState(), latestProductSnapshot: this.options.latestProductSnapshot(), telemetry }),
    ));
    return { handled: true, changed: true };
  }
}

function nativeDiceWriteOffset(config: NormalizedSequencerEvolveConfig): number {
  return config.writeOffset === 'auto' ? -1 : typeof config.writeOffset === 'number' && config.writeOffset > 0 ? Math.round(config.writeOffset) : 0;
}
