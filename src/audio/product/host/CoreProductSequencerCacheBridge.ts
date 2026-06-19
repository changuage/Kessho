import type {
  SequencerKind,
  SequencerStepToggleOverride,
  SequencerStepValueConfig,
  SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';

export type CoreProductSequencerLaneCache = {
  toggles: SequencerStepToggleOverride[][];
  values: SequencerStepValueOverride[][];
  configs: SequencerStepValueConfig[][];
};

export type CoreProductSequencerCacheState = Record<SequencerKind, CoreProductSequencerLaneCache>;

export function createCoreProductSequencerCacheState(): CoreProductSequencerCacheState {
  return {
    synth: { toggles: [[], [], [], []], values: [[], [], [], []], configs: [[], [], [], []] },
    drum: { toggles: [[], [], [], []], values: [[], [], [], []], configs: [[], [], [], []] },
  };
}

export function selectCoreProductSequencerCache(
  cache: CoreProductSequencerCacheState,
  sequencer: SequencerKind,
): CoreProductSequencerLaneCache {
  return cache[sequencer];
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
  if (Object.keys(state).length === 0) {
    return ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'];
  }
  return [
    'probability',
    ...(state.expression === true && state.ratchet !== false ? ['ratchet'] : []),
    ...['pitch', 'expression', 'morph', 'distance', 'nudge'].filter((lane) => state[lane] === true),
  ];
}
