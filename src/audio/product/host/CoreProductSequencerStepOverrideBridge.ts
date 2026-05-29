import {
  normalizeDrumSequencerStepValueOverrides,
  normalizeSequencerStepToggleOverrides,
  normalizeSequencerStepValueConfigs,
  normalizeSequencerStepValueOverrides,
  type SequencerStepToggleOverride,
  type SequencerStepValueConfig,
  type SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';

export function applyCoreProductSynthStepOverrides(options: {
  overrides: unknown;
  previousToggles: SequencerStepToggleOverride[][];
  previousValues: SequencerStepValueOverride[][];
  previousConfigs: SequencerStepValueConfig[][];
  visibleLaneCount: number;
  consumeManualDice: (laneIndex: number) => boolean;
}): {
  toggles: SequencerStepToggleOverride[][];
  values: SequencerStepValueOverride[][];
  configs: SequencerStepValueConfig[][];
  manualDiceCaptureLanes: number[];
} {
  const toggles = normalizeSequencerStepToggleOverrides(options.overrides, options.previousToggles);
  const values = normalizeSequencerStepValueOverrides(options.overrides, options.previousValues, true);
  const configs = normalizeSequencerStepValueConfigs(options.overrides, options.previousConfigs, true);
  const manualDiceCaptureLanes: number[] = [];
  for (let laneIndex = 0; laneIndex < options.visibleLaneCount; laneIndex += 1) {
    if (options.consumeManualDice(laneIndex)) manualDiceCaptureLanes.push(laneIndex);
  }
  return { toggles, values, configs, manualDiceCaptureLanes };
}

export function applyCoreProductDrumStepOverrides(options: {
  overrides: unknown;
  previousToggles: SequencerStepToggleOverride[][];
  previousValues: SequencerStepValueOverride[][];
  previousConfigs: SequencerStepValueConfig[][];
  drumBaseMidi: (laneIndex: number) => number;
}): {
  toggles: SequencerStepToggleOverride[][];
  values: SequencerStepValueOverride[][];
  configs: SequencerStepValueConfig[][];
} {
  return {
    toggles: normalizeSequencerStepToggleOverrides(options.overrides, options.previousToggles),
    values: normalizeDrumSequencerStepValueOverrides(options.overrides, options.previousValues, options.drumBaseMidi),
    configs: normalizeSequencerStepValueConfigs(options.overrides, options.previousConfigs, true),
  };
}
