import type { StepOverrides, SubLaneKind, SubLaneState } from './useEuclideanSequencer';
import { clampEuclideanSubLaneSteps } from './sequencerLimits';
import { triggerClipToLegacyEuclideanParams } from './triggerClipLegacyBridge';

const SUB_LANE_VALUE_FIELDS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance', 'slice', 'reverse'];
const SUB_LANE_RANGE_FIELDS = {
  expression: 'expressionRanges',
  morph: 'morphRanges',
  distance: 'distanceRanges',
} as const;

const SUB_LANE_DEFAULT_VALUES: Record<SubLaneKind, number> = {
  pitch: 0,
  expression: 1,
  morph: 0,
  distance: 0,
  slice: 0,
  reverse: 0,
};

function visibleSubLaneSteps(state: SubLaneState | undefined, fallback: number): number {
  const source = typeof state?.steps === 'number' && Number.isFinite(state.steps) ? state.steps : fallback;
  return clampEuclideanSubLaneSteps(Math.floor(source), fallback);
}

function engineLaneValues(
  lane: SubLaneKind,
  values: number[] | null | undefined,
  state: SubLaneState | undefined,
): number[] | null {
  if (!state?.enabled || !Array.isArray(values)) return null;
  const steps = visibleSubLaneSteps(state, values.length || 1);
  const next = values.slice(0, steps);
  if (next.length < steps) {
    next.push(...Array.from({ length: steps - next.length }, () => SUB_LANE_DEFAULT_VALUES[lane]));
  }
  return next;
}

function engineRatchetValues(
  values: number[] | null | undefined,
  expressionState: SubLaneState | undefined,
): number[] | null {
  if (!expressionState?.enabled || !Array.isArray(values)) return null;
  const steps = visibleSubLaneSteps(expressionState, values.length || 1);
  const next = values.slice(0, steps);
  if (next.length < steps) {
    next.push(...Array.from({ length: steps - next.length }, () => 1));
  }
  return next;
}

export function stepOverridesForEngineSubLaneState(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
): StepOverrides {
  if (!subLaneStates) return overrides;
  const next: StepOverrides = {
    ...overrides,
    expressionRanges: [...(overrides.expressionRanges ?? [])],
    morphRanges: [...(overrides.morphRanges ?? [])],
    distanceRanges: [...(overrides.distanceRanges ?? [])],
  };
  if (overrides.triggerClips?.some(Boolean)) {
    next.triggerToggles = overrides.triggerToggles.map((map, laneIndex) => {
      const clip = overrides.triggerClips?.[laneIndex];
      return clip ? triggerClipToLegacyEuclideanParams(clip).triggerToggles : new Map(map);
    });
    next.triggerClips = undefined;
  }
  next.ratchet = overrides.ratchet.map((values, laneIndex) =>
    engineRatchetValues(values, subLaneStates[laneIndex]?.expression)
  );
  for (const lane of SUB_LANE_VALUE_FIELDS) {
    const source = overrides[lane];
    next[lane] = source.map((values, laneIndex) =>
      engineLaneValues(lane, values, subLaneStates[laneIndex]?.[lane])
    ) as never;
  }
  for (const [lane, rangeField] of Object.entries(SUB_LANE_RANGE_FIELDS) as [keyof typeof SUB_LANE_RANGE_FIELDS, typeof SUB_LANE_RANGE_FIELDS[keyof typeof SUB_LANE_RANGE_FIELDS]][]) {
    const source = overrides[rangeField] ?? [];
    next[rangeField] = Array.from({ length: Math.max(4, source.length) }, (_, laneIndex) => {
      const state = subLaneStates[laneIndex]?.[lane];
      return state?.enabled === true && state.valueMode === 'range' ? source[laneIndex] ?? null : null;
    });
  }
  return next;
}
