import {
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  type CoreProductStepValueField,
  type CoreProductSubLaneDirection,
} from './coreProductEvents';
import type { SequencerKind, SequencerStepValueConfig, SequencerStepValueOverride } from './CoreProductHostSequencerAdapter';
import type { NormalizedSequencerEvolveConfig } from './CoreProductHostSequencerEvolveConfig';

type DirectionName = 'forward' | 'reverse' | 'pingpong';
type SubLaneName = 'pitch' | 'expression' | 'morph' | 'distance';
export type CoreProductSubLaneEvolveResult = { configs: SequencerStepValueConfig[]; valueOverrides?: SequencerStepValueOverride[]; changedValueFields?: CoreProductStepValueField[]; subLaneStates: Partial<Record<SubLaneName, { enabled: boolean; steps: number; direction: DirectionName }>>; directionPayloads: Record<string, DirectionName> };

const SUB_LANE_FIELDS: Record<SubLaneName, { field: CoreProductStepValueField; directionKey: string }> = {
  pitch: { field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, directionKey: 'pitchDirection' },
  expression: { field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, directionKey: 'expressionDirection' },
  morph: { field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph, directionKey: 'morphDirection' },
  distance: { field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance, directionKey: 'distanceDirection' },
};

function hashUnit(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 0x1_0000_0000;
}

function chance(seed: number, probability: number): boolean {
  return hashUnit(seed) < Math.max(0, Math.min(1, probability));
}

function directionName(direction: CoreProductSubLaneDirection): DirectionName {
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) return 'reverse';
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong) return 'pingpong';
  return 'forward';
}

function randomOtherDirection(current: CoreProductSubLaneDirection, seed: number): CoreProductSubLaneDirection {
  const choices = [
    CORE_PRODUCT_SUBLANE_DIRECTIONS.forward,
    CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse,
    CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong,
  ].filter((direction) => direction !== current);
  return choices[Math.floor(hashUnit(seed) * choices.length)] ?? CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
}

function allows(config: NormalizedSequencerEvolveConfig, lane: SubLaneName): boolean {
  return !config.enabledSubLanes || config.enabledSubLanes.includes(lane);
}

function enabledConfigEntries(configs: SequencerStepValueConfig[], config: NormalizedSequencerEvolveConfig) {
  return (Object.entries(SUB_LANE_FIELDS) as [SubLaneName, typeof SUB_LANE_FIELDS[SubLaneName]][])
    .filter(([lane]) => allows(config, lane))
    .map(([lane, field]) => ({ lane, field, index: configs.findIndex((entry) => entry.field === field.field) }))
    .filter((entry) => entry.index >= 0);
}

function writePayload(result: CoreProductSubLaneEvolveResult, lane: SubLaneName, config: SequencerStepValueConfig): void {
  const direction = directionName(config.direction);
  result.subLaneStates[lane] = { enabled: true, steps: config.steps, direction };
  result.directionPayloads[SUB_LANE_FIELDS[lane].directionKey] = direction;
}

function resizeFieldOverrides(overrides: SequencerStepValueOverride[], field: CoreProductStepValueField, nextSteps: number): SequencerStepValueOverride[] | null {
  const fieldEntries = overrides
    .filter((entry) => entry.field === field)
    .sort((left, right) => left.step - right.step);
  if (fieldEntries.length === 0 || fieldEntries.every((entry) => entry.range === true)) return null;
  const byStep = new Map(fieldEntries.map((entry) => [entry.step, entry]));
  const fallback = fieldEntries[fieldEntries.length - 1]!;
  const resized = Array.from({ length: nextSteps }, (_, step) => ({ ...(byStep.get(step) ?? fallback), step }));
  return [...overrides.filter((entry) => entry.field !== field), ...resized].sort((left, right) => left.step - right.step || left.field - right.field);
}

export function evolveCoreProductSequencerSubLaneConfigs(sequencer: SequencerKind, configs: SequencerStepValueConfig[], valueOverrides: SequencerStepValueOverride[], config: NormalizedSequencerEvolveConfig, seed: number): CoreProductSubLaneEvolveResult | null {
  const candidates = enabledConfigEntries(configs, config);
  if (candidates.length === 0) return null;
  const next = configs.map((entry) => ({ ...entry }));
  const result: CoreProductSubLaneEvolveResult = { configs: next, subLaneStates: {}, directionPayloads: {} };
  let changed = false;
  if (config.methods?.subLaneLengthDrift && config.evolution > 0.5 && chance(seed ^ 0x9e3779b9, 0.25 * config.evolution)) {
    const picked = candidates[Math.floor(hashUnit(seed ^ 0x2c1b3c6d) * candidates.length)]!;
    const laneConfig = next[picked.index]!;
    const minSteps = sequencer === 'synth' ? 2 : 1;
    const maxSteps = 32;
    const delta = hashUnit(seed ^ 0x51f15ca9) < 0.5 ? -1 : 1;
    const steps = Math.max(minSteps, Math.min(maxSteps, laneConfig.steps + delta));
    if (steps !== laneConfig.steps) {
      laneConfig.steps = steps;
      const resized = resizeFieldOverrides(result.valueOverrides ?? valueOverrides, laneConfig.field, steps);
      if (resized) {
        result.valueOverrides = resized;
        result.changedValueFields = [...(result.changedValueFields ?? []), laneConfig.field];
      }
      writePayload(result, picked.lane, laneConfig);
      changed = true;
    }
  }
  if (config.methods?.subLaneDirectionFlip && config.evolution > 0.8 && chance(seed ^ 0x165667b1, 0.08 * config.evolution)) {
    const picked = candidates[Math.floor(hashUnit(seed ^ 0x94d049bb) * candidates.length)]!;
    const laneConfig = next[picked.index]!;
    laneConfig.direction = randomOtherDirection(laneConfig.direction, seed ^ 0x7f4a7c15);
    writePayload(result, picked.lane, laneConfig);
    changed = true;
  }
  return changed ? result : null;
}
