import {
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  type CoreProductStepValueField,
  type CoreProductSubLaneDirection,
} from './coreProductEvents';

export type SequencerSubLaneConfigState = Partial<Record<
  'pitch' | 'expression' | 'morph' | 'distance' | 'nudge' | 'slice' | 'reverse',
  { enabled?: unknown; steps?: unknown; direction?: unknown }
>>;

export type SequencerStepValueConfig = {
  field: CoreProductStepValueField;
  steps: number;
  direction: CoreProductSubLaneDirection;
};

export function addSubLaneStateConfigs(
  lanes: SequencerStepValueConfig[][],
  subLaneStates: readonly (SequencerSubLaneConfigState | null | undefined)[] | undefined,
  includeMidiNote: boolean,
): void {
  if (!subLaneStates?.length) return;
  while (lanes.length < Math.min(16, subLaneStates.length)) lanes.push([]);
  for (let laneIndex = 0; laneIndex < Math.min(subLaneStates.length, lanes.length); laneIndex += 1) {
    const state = subLaneStates[laneIndex];
    const laneOut = lanes[laneIndex];
    if (!state || !laneOut) continue;
    for (const config of SUB_LANE_STATE_CONFIG_FIELDS) {
      if (config.midiNote && !includeMidiNote) continue;
      if (laneOut.some((entry) => entry.field === config.field)) continue;
      const subLane = state[config.lane];
      if (subLane?.enabled !== true) continue;
      laneOut.push({
        field: config.field,
        steps: typeof subLane.steps === 'number' && Number.isFinite(subLane.steps)
          ? Math.max(1, Math.min(64, Math.floor(subLane.steps)))
          : 1,
        direction: normalizeSubLaneDirection(subLane.direction),
      });
    }
  }
}

export function normalizeSubLaneDirection(value: unknown): CoreProductSubLaneDirection {
  const text = String(value ?? 'forward').toLowerCase();
  if (text === 'reverse') return CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse;
  if (text === 'pingpong') return CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong;
  return CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
}

const SUB_LANE_STATE_CONFIG_FIELDS: {
  lane: keyof SequencerSubLaneConfigState;
  field: CoreProductStepValueField;
  midiNote?: boolean;
}[] = [
  { lane: 'pitch', field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, midiNote: true },
  { lane: 'expression', field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression },
  { lane: 'morph', field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph },
  { lane: 'distance', field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance },
  { lane: 'nudge', field: CORE_PRODUCT_STEP_VALUE_FIELDS.nudge },
];
