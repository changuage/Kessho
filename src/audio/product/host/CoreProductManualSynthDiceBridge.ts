import {
  CORE_PRODUCT_EVOLVE_FLAGS,
  createCoreProductSequencerDiceEvent,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductSequencerLaneUiState, CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { NormalizedSequencerEvolveConfig } from '../../CoreProductHostSequencerEvolveConfig';
import type {
  SequencerKind,
  SequencerStepValueConfig,
  SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';
import {
  coreProductStepValueConfigsFromLane,
  coreProductStepValueOverridesFromLane,
} from '../../CoreProductHostSequencerUiState';
import {
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';
import { coreProductSequencerEffectiveEvolveTension } from '../../CoreProductHostSequencerEvolveTension';
import { nativeEvolveFlagsForEvolveConfig } from './CoreProductSequencerNativeEvolveFlags';

export type CoreProductManualSynthDiceState = {
  baselineSignatures: (string | null)[];
};

export function createCoreProductManualSynthDiceState(): CoreProductManualSynthDiceState {
  return { baselineSignatures: [] };
}

function sequencerStepStateSignature(
  toggles: readonly { step: number; value: boolean }[],
  values: readonly SequencerStepValueOverride[],
  configs: readonly SequencerStepValueConfig[],
): string {
  return JSON.stringify({
    toggles: toggles.map((entry) => ({ step: entry.step, value: entry.value === true })).sort((left, right) => left.step - right.step),
    values: values
      .map((entry) => ({ step: entry.step, field: entry.field, value: entry.value, value2: entry.value2 ?? 0, range: entry.range === true }))
      .sort((left, right) => left.step - right.step || left.field - right.field || Number(left.range) - Number(right.range)),
    configs: configs.map((entry) => ({ field: entry.field, steps: entry.steps, direction: entry.direction })).sort((left, right) => left.field - right.field),
  });
}

function laneStepStateSignature(cache: CoreProductSequencerCacheState, sequencer: SequencerKind, laneIndex: number): string {
  const selected = selectCoreProductSequencerCache(cache, sequencer);
  return sequencerStepStateSignature(selected.toggles[laneIndex] ?? [], selected.values[laneIndex] ?? [], selected.configs[laneIndex] ?? []);
}

function manualSynthDiceConfig(adapterState: Record<string, unknown>, laneIndex: number, intensity: number): NormalizedSequencerEvolveConfig {
  const configs = Array.isArray(adapterState.synthEuclidEvolveConfigs)
    ? adapterState.synthEuclidEvolveConfigs as NormalizedSequencerEvolveConfig[]
    : [];
  const configured = configs[laneIndex];
  return {
    enabled: true,
    evolution: Math.max(0, Math.min(1, intensity)),
    everyBars: 1,
    writeOffset: 0,
    mutationMode: configured?.mutationMode ?? 'strict',
    methods: { ...(configured?.methods ?? {}), valueDrift: true, valueScramble: true },
    ...(configured?.enabledSubLanes ? { enabledSubLanes: configured.enabledSubLanes } : {}),
  };
}

export function armCoreProductSequencerManualDice(options: {
  state: CoreProductManualSynthDiceState;
  sequencer: SequencerKind;
  laneIndex: number;
  cache: CoreProductSequencerCacheState;
  arm: (sequencer: SequencerKind, laneIndex: number) => void;
}): void {
  if (options.sequencer === 'synth') options.state.baselineSignatures[options.laneIndex] = laneStepStateSignature(options.cache, 'synth', options.laneIndex);
  options.arm(options.sequencer, options.laneIndex);
}

export function coreProductManualSynthDiceChanged(state: CoreProductManualSynthDiceState, laneIndex: number, lane: CoreProductSequencerLaneUiState): boolean {
  const values = coreProductStepValueOverridesFromLane(lane, true, true);
  const configs = coreProductStepValueConfigsFromLane(lane, true);
  if (lane.triggerToggles.length === 0 && values.length === 0 && configs.length === 0) return false;
  const baseline = state.baselineSignatures[laneIndex];
  if (!baseline) return true;
  return sequencerStepStateSignature(lane.triggerToggles.map(([step, value]) => ({ step, value })), values, configs) !== baseline;
}

export function markCoreProductManualSynthDiceReady(
  state: CoreProductManualSynthDiceState,
  laneIndex: number,
  markReady: (laneIndex: number) => void,
): void {
  state.baselineSignatures[laneIndex] = null;
  markReady(laneIndex);
}

export function applyCoreProductManualSynthDice(options: {
  state: CoreProductManualSynthDiceState;
  laneIndex: number;
  intensity: number;
  cache: CoreProductSequencerCacheState;
  adapterState: Record<string, unknown>;
  latestSliderState: Record<string, unknown> | null;
  latestProductSnapshot: CoreProductSnapshot | null;
  latestTelemetry: CoreProductTelemetrySnapshot | null;
  runtimeReady: boolean;
  armManualDice: () => void;
  post: (event: CoreProductEvent) => void;
  publish: (name: string, ...payload: unknown[]) => void;
  captureHome: (force?: boolean) => void;
}): boolean {
  options.captureHome();
  options.state.baselineSignatures[options.laneIndex] = laneStepStateSignature(options.cache, 'synth', options.laneIndex);
  options.armManualDice();
  const config = manualSynthDiceConfig(options.adapterState, options.laneIndex, options.intensity);
  const nativeFlags = nativeEvolveFlagsForEvolveConfig(config, 'synth');
  if (options.runtimeReady && nativeFlags !== 0) {
    const telemetry = options.latestTelemetry ?? ({ schemaHash: 0, transportRunning: false, activeSources: 0, activeVoices: 0, activeAssets: 0 } as CoreProductTelemetrySnapshot);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    options.post(createCoreProductSequencerDiceEvent(
      'synth',
      options.laneIndex,
      config.evolution,
      seed,
      nativeFlags + CORE_PRODUCT_EVOLVE_FLAGS.manualCommit + CORE_PRODUCT_EVOLVE_FLAGS.modeParity,
      nativeDiceWriteOffset(config),
      Math.max(1, Math.floor((telemetry.barIndex ?? 0) + 1)),
      coreProductSequencerEffectiveEvolveTension({ sequencer: 'synth', laneIndex: options.laneIndex, latestSliderState: options.latestSliderState, latestProductSnapshot: options.latestProductSnapshot, telemetry }),
    ));
  }
  options.publish('synthEuclidEvolve', options.laneIndex);
  return true;
}

function nativeDiceWriteOffset(config: NormalizedSequencerEvolveConfig): number {
  return config.writeOffset === 'auto' ? -1 : typeof config.writeOffset === 'number' && config.writeOffset > 0 ? Math.round(config.writeOffset) : 0;
}
