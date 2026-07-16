import {
  CORE_PRODUCT_EVOLVE_FLAGS,
  createCoreProductSequencerLaneParamEvent,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import {
  normalizeEvolveConfigs,
  type NormalizedSequencerEvolveConfig,
} from '../../CoreProductHostSequencerEvolveConfig';
import { coreProductSequencerEvolveRngSeed } from '../../CoreProductHostSequencerEvolveRng';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';
import { nativeEvolveFlagsForEvolveConfig } from './CoreProductSequencerNativeEvolveFlags';

export type CoreProductSequencerEvolveRuntimeBridgeOptions = {
  adapterState: () => Record<string, unknown>;
  latestSliderState: () => Record<string, unknown> | null;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  latestTelemetry: () => CoreProductTelemetrySnapshot | null;
  runtimeReady: () => boolean;
  postWithHomeCapture: (event: CoreProductEvent) => void;
};

function disabledConfig(): NormalizedSequencerEvolveConfig {
  return { enabled: false, evolution: 0, everyBars: 4, writeOffset: 'auto', mutationMode: 'biased', methods: {} };
}

function nativeWriteOffset(config: NormalizedSequencerEvolveConfig): number {
  return config.writeOffset === 'auto' ? -1 : Math.max(0, Math.round(config.writeOffset));
}

export class CoreProductSequencerEvolveRuntimeBridge {
  private readonly lastConfigKeys: Record<SequencerKind, string[]> = { synth: [], drum: [] };

  constructor(private readonly options: CoreProductSequencerEvolveRuntimeBridgeOptions) {}

  reset(): void {
    this.lastConfigKeys.synth = [];
    this.lastConfigKeys.drum = [];
  }

  tick(hostTelemetry: CoreProductTelemetrySnapshot): void {
    this.syncAll(hostTelemetry);
  }

  syncAll(telemetry: CoreProductTelemetrySnapshot | null = this.options.latestTelemetry()): void {
    for (const sequencer of ['synth', 'drum'] as const) {
      for (let laneIndex = 0; laneIndex < 4; laneIndex += 1) this.syncLane(sequencer, laneIndex, telemetry);
    }
  }

  syncLane(
    sequencer: SequencerKind,
    laneIndex: number,
    telemetry: CoreProductTelemetrySnapshot | null = this.options.latestTelemetry(),
  ): void {
    if (!this.options.runtimeReady() || laneIndex < 0 || laneIndex >= 4) return;
    const stateKey = sequencer === 'synth' ? 'synthEuclidEvolveConfigs' : 'drumEuclidEvolveConfigs';
    const configs = normalizeEvolveConfigs(this.options.adapterState()[stateKey], sequencer);
    const config = configs[laneIndex] ?? disabledConfig();
    const nativeFlags = nativeEvolveFlagsForEvolveConfig(config, sequencer);
    const fallbackSeed = this.options.latestProductSnapshot()?.rng.seed ?? 1;
    const seedTelemetry = telemetry ?? ({ rngSeed: fallbackSeed } as CoreProductTelemetrySnapshot);
    const seed = coreProductSequencerEvolveRngSeed(
      this.options.latestSliderState(),
      seedTelemetry,
      fallbackSeed,
    ) >>> 0;
    const enabled = config.enabled && config.evolution > 0 && nativeFlags !== 0;
    const flags = enabled
      ? nativeFlags + CORE_PRODUCT_EVOLVE_FLAGS.modeParity + CORE_PRODUCT_EVOLVE_FLAGS.rngStream
      : 0;
    const key = JSON.stringify({ config, enabled, flags, seed });
    if (this.lastConfigKeys[sequencer][laneIndex] === key) return;
    this.lastConfigKeys[sequencer][laneIndex] = key;

    this.options.postWithHomeCapture(createCoreProductSequencerLaneParamEvent(
      sequencer,
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerEvolveRuntimeSeedLow,
      seed & 0xffff,
    ));
    this.options.postWithHomeCapture(createCoreProductSequencerLaneParamEvent(
      sequencer,
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerEvolveRuntimeSeedHigh,
      seed >>> 16,
    ));
    this.options.postWithHomeCapture({
      ...createCoreProductSequencerLaneParamEvent(
        sequencer,
        laneIndex,
        KESSHO_PRODUCT_PARAM_IDS.SequencerEvolveRuntimeConfig,
        enabled ? 1 : 0,
        flags,
      ),
      value2: config.evolution,
      value3: Math.max(1, Math.round(config.everyBars)),
      value4: nativeWriteOffset(config),
    });
  }
}
