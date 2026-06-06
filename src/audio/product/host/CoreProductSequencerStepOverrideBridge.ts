import {
  normalizeSequencerStepToggleOverrides,
  normalizeSequencerStepValueConfigs,
  normalizeSequencerStepValueOverrides,
  type SequencerStepToggleOverride,
  type SequencerStepValueConfig,
  type SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';

type CoreProductSequencerStepOverrideResult = {
  toggles: SequencerStepToggleOverride[][];
  values: SequencerStepValueOverride[][];
  configs: SequencerStepValueConfig[][];
  manualDiceCaptureLanes: number[];
};

function applyCoreProductSequencerStepOverrides(options: {
  overrides: unknown;
  previousToggles: SequencerStepToggleOverride[][];
  previousValues: SequencerStepValueOverride[][];
  previousConfigs: SequencerStepValueConfig[][];
  visibleLaneCount: number;
  normalizeValues: (
    overrides: unknown,
    previousValues: SequencerStepValueOverride[][],
  ) => SequencerStepValueOverride[][];
  consumeManualDice: (laneIndex: number) => boolean;
}): CoreProductSequencerStepOverrideResult {
  const toggles = normalizeSequencerStepToggleOverrides(options.overrides, options.previousToggles);
  const values = options.normalizeValues(options.overrides, options.previousValues);
  const configs = normalizeSequencerStepValueConfigs(options.overrides, options.previousConfigs, true);
  const manualDiceCaptureLanes: number[] = [];
  for (let laneIndex = 0; laneIndex < options.visibleLaneCount; laneIndex += 1) {
    if (options.consumeManualDice(laneIndex)) manualDiceCaptureLanes.push(laneIndex);
  }
  return { toggles, values, configs, manualDiceCaptureLanes };
}

export function applyCoreProductSynthStepOverrides(options: {
  overrides: unknown;
  previousToggles: SequencerStepToggleOverride[][];
  previousValues: SequencerStepValueOverride[][];
  previousConfigs: SequencerStepValueConfig[][];
  visibleLaneCount: number;
  consumeManualDice: (laneIndex: number) => boolean;
}): CoreProductSequencerStepOverrideResult {
  return applyCoreProductSequencerStepOverrides({
    ...options,
    normalizeValues: (overrides, previousValues) =>
      normalizeSequencerStepValueOverrides(overrides, previousValues, true),
  });
}
