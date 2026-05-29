import type {
  SequencerKind,
  SequencerStepToggleOverride,
  SequencerStepValueConfig,
  SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';

export type CoreProductSequencerCacheState = {
  synthStepToggleOverrides: SequencerStepToggleOverride[][];
  drumStepToggleOverrides: SequencerStepToggleOverride[][];
  synthStepValueOverrides: SequencerStepValueOverride[][];
  drumStepValueOverrides: SequencerStepValueOverride[][];
  synthStepValueConfigs: SequencerStepValueConfig[][];
  drumStepValueConfigs: SequencerStepValueConfig[][];
};

export function selectCoreProductSequencerCache(
  cache: CoreProductSequencerCacheState,
  sequencer: SequencerKind,
): {
  toggles: SequencerStepToggleOverride[][];
  values: SequencerStepValueOverride[][];
  configs: SequencerStepValueConfig[][];
} {
  return sequencer === 'synth'
    ? {
      toggles: cache.synthStepToggleOverrides,
      values: cache.synthStepValueOverrides,
      configs: cache.synthStepValueConfigs,
    }
    : {
      toggles: cache.drumStepToggleOverrides,
      values: cache.drumStepValueOverrides,
      configs: cache.drumStepValueConfigs,
    };
}

export function ensureCoreProductSequencerLaneCache(
  cache: CoreProductSequencerCacheState,
  sequencer: SequencerKind,
  laneIndex: number,
): void {
  const { toggles, values, configs } = selectCoreProductSequencerCache(cache, sequencer);
  while (toggles.length <= laneIndex) toggles.push([]);
  while (values.length <= laneIndex) values.push([]);
  while (configs.length <= laneIndex) configs.push([]);
}

export function coreProductSequencerLaneCacheCount(cache: CoreProductSequencerCacheState, sequencer: SequencerKind): number {
  const { toggles, values, configs } = selectCoreProductSequencerCache(cache, sequencer);
  return Math.max(toggles.length, values.length, configs.length);
}

export function cloneCoreProductSequencerStepValueConfigs(
  cache: CoreProductSequencerCacheState,
  sequencer: SequencerKind,
  laneIndex: number,
): SequencerStepValueConfig[] {
  ensureCoreProductSequencerLaneCache(cache, sequencer, laneIndex);
  return (selectCoreProductSequencerCache(cache, sequencer).configs[laneIndex] ?? []).map((entry) => ({ ...entry }));
}

export function cloneCoreProductSequencerStepValueOverrides(
  cache: CoreProductSequencerCacheState,
  sequencer: SequencerKind,
  laneIndex: number,
): SequencerStepValueOverride[] {
  ensureCoreProductSequencerLaneCache(cache, sequencer, laneIndex);
  return (selectCoreProductSequencerCache(cache, sequencer).values[laneIndex] ?? []).map((entry) => ({ ...entry }));
}

export function enabledCoreProductSequencerSubLanes(
  synthSubLaneEnabled: Record<string, boolean>[],
  drumSubLaneEnabled: Record<string, boolean>[],
  sequencer: SequencerKind,
  laneIndex: number,
): string[] {
  const state = (sequencer === 'synth' ? synthSubLaneEnabled : drumSubLaneEnabled)[laneIndex] ?? {};
  return ['probability', 'ratchet', ...['pitch', 'expression', 'morph', 'distance'].filter((lane) => state[lane] === true)];
}
