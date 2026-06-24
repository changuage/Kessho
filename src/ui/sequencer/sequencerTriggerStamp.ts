export type TriggerStampLaneValue = number | boolean | string | null;

export interface TriggerStampTriggerData {
  enabled: boolean;
  probability?: number;
  ratchet?: number;
  trigCondition?: [number, number];
  holdSteps?: number;
}

export interface TriggerStamp {
  kind: 'sequencerTriggerStamp';
  source: 'synthLane' | 'seq5Chord';
  copiedStep: number;
  copiedHitOrdinal: number;
  trigger: TriggerStampTriggerData;
  lanes: Record<string, TriggerStampLaneValue>;
  label: string;
}

export interface TriggerPatternLike {
  steps: number;
  pattern: boolean[];
  probability?: number[];
  ratchet?: number[];
  trigCondition?: Array<[number, number]>;
}

export interface SubLaneLike {
  enabled: boolean;
  steps: number;
  direction: 'forward' | 'reverse' | 'pingpong';
  values: number[];
}

export interface PasteTriggerStampResult {
  pattern: boolean[];
  probability?: number[];
  ratchet?: number[];
  trigCondition?: Array<[number, number]>;
  subLanes: Record<string, SubLaneLike>;
  foldedTailLanes: string[];
}

export function triggerHitOrdinalFromStart(pattern: readonly boolean[], stepIndex: number): number | null {
  if (stepIndex < 0 || stepIndex >= pattern.length || !pattern[stepIndex]) return null;
  let ordinal = 0;
  for (let index = 0; index <= stepIndex; index += 1) {
    if (pattern[index]) ordinal += 1;
  }
  return ordinal - 1;
}

export function insertionHitOrdinal(pattern: readonly boolean[], stepIndex: number): number {
  let ordinal = 0;
  for (let index = 0; index < Math.max(0, stepIndex); index += 1) {
    if (pattern[index]) ordinal += 1;
  }
  return ordinal;
}

export function subLaneIndexForHitOrdinal(
  ordinal: number,
  steps: number,
  direction: 'forward' | 'reverse' | 'pingpong',
): number {
  const safeSteps = Math.max(1, Math.round(steps));
  const safeOrdinal = Math.max(0, Math.floor(ordinal));
  if (direction === 'reverse') return safeSteps - 1 - (safeOrdinal % safeSteps);
  if (direction === 'pingpong' && safeSteps > 1) {
    const cycle = safeSteps * 2 - 2;
    const phase = safeOrdinal % cycle;
    return phase < safeSteps ? phase : cycle - phase;
  }
  return safeOrdinal % safeSteps;
}

export function effectiveSubLaneValueAtHit(lane: SubLaneLike, hitOrdinal: number): number | null {
  if (!lane.enabled) return null;
  const index = subLaneIndexForHitOrdinal(hitOrdinal, lane.steps, lane.direction);
  return lane.values[index] ?? null;
}

export function copyTriggerStamp(args: {
  source: TriggerStamp['source'];
  stepIndex: number;
  trigger: TriggerPatternLike;
  subLanes: Record<string, SubLaneLike | undefined>;
  extraTriggerData?: Partial<TriggerStampTriggerData>;
  label?: string;
}): TriggerStamp | null {
  const ordinal = triggerHitOrdinalFromStart(args.trigger.pattern, args.stepIndex);
  if (ordinal == null) return null;
  const lanes: Record<string, TriggerStampLaneValue> = {};
  for (const [laneName, lane] of Object.entries(args.subLanes)) {
    if (!lane?.enabled) continue;
    lanes[laneName] = effectiveSubLaneValueAtHit(lane, ordinal);
  }
  return {
    kind: 'sequencerTriggerStamp',
    source: args.source,
    copiedStep: args.stepIndex,
    copiedHitOrdinal: ordinal,
    trigger: {
      enabled: true,
      probability: args.trigger.probability?.[args.stepIndex],
      ratchet: args.trigger.ratchet?.[ordinal],
      trigCondition: args.trigger.trigCondition?.[args.stepIndex],
      ...args.extraTriggerData,
    },
    lanes,
    label: args.label ?? `Trigger ${args.stepIndex + 1}`,
  };
}

export function pasteTriggerStamp(args: {
  stamp: TriggerStamp;
  stepIndex: number;
  trigger: TriggerPatternLike;
  subLanes: Record<string, SubLaneLike>;
  maxSubLaneSteps: number;
}): PasteTriggerStampResult {
  const wasActive = args.trigger.pattern[args.stepIndex] === true;
  const oldPattern = args.trigger.pattern;
  const newPattern = [...oldPattern];
  newPattern[args.stepIndex] = true;
  const targetOrdinal = wasActive
    ? triggerHitOrdinalFromStart(oldPattern, args.stepIndex) ?? insertionHitOrdinal(oldPattern, args.stepIndex)
    : insertionHitOrdinal(oldPattern, args.stepIndex);
  const oldHitOrdinalsByStep = oldPattern
    .map((hit, step) => hit ? ({ step, ordinal: triggerHitOrdinalFromStart(oldPattern, step)! }) : null)
    .filter(Boolean) as Array<{ step: number; ordinal: number }>;
  const subLanes: Record<string, SubLaneLike> = {};
  const foldedTailLanes: string[] = [];

  for (const [laneName, lane] of Object.entries(args.subLanes)) {
    const oldHitValues = oldHitOrdinalsByStep.map(({ ordinal }) => effectiveSubLaneValueAtHit(lane, ordinal));
    const stampValue = args.stamp.lanes[laneName];
    if (stampValue == null || typeof stampValue !== 'number') {
      subLanes[laneName] = lane;
      continue;
    }
    const nextHitValues = [...oldHitValues];
    if (wasActive) {
      nextHitValues[targetOrdinal] = stampValue;
    } else {
      nextHitValues.splice(targetOrdinal, 0, stampValue);
    }
    const oldTailValues = lane.values.slice(Math.max(0, oldHitValues.length), lane.steps);
    const desiredValues = [...nextHitValues, ...oldTailValues].filter((value): value is number => typeof value === 'number');
    const nextSteps = Math.min(args.maxSubLaneSteps, Math.max(1, desiredValues.length));
    if (desiredValues.length > args.maxSubLaneSteps) foldedTailLanes.push(laneName);
    subLanes[laneName] = materializeSubLaneValuesForDirection({
      lane,
      desiredValues: desiredValues.slice(0, nextSteps),
      steps: nextSteps,
    });
  }

  return {
    pattern: newPattern,
    probability: writeTriggerArrayValue(args.trigger.probability, args.stepIndex, args.stamp.trigger.probability),
    ratchet: writeHitArrayValue(args.trigger.ratchet, targetOrdinal, args.stamp.trigger.ratchet, wasActive),
    trigCondition: writeTriggerArrayValue(args.trigger.trigCondition, args.stepIndex, args.stamp.trigger.trigCondition),
    subLanes,
    foldedTailLanes,
  };
}

function materializeSubLaneValuesForDirection(args: {
  lane: SubLaneLike;
  desiredValues: number[];
  steps: number;
}): SubLaneLike {
  const values = Array.from({ length: args.steps }, (_, index) => args.lane.values[index] ?? 0);
  for (let ordinal = 0; ordinal < args.desiredValues.length; ordinal += 1) {
    const index = subLaneIndexForHitOrdinal(ordinal, args.steps, args.lane.direction);
    values[index] = args.desiredValues[ordinal] ?? values[index] ?? 0;
  }
  return {
    ...args.lane,
    steps: args.steps,
    values,
  };
}

function writeTriggerArrayValue<T>(source: readonly T[] | undefined, stepIndex: number, value: T | undefined): T[] | undefined {
  if (!source || value === undefined) return source ? [...source] : undefined;
  return source.map((current, index) => index === stepIndex ? value : current);
}

function writeHitArrayValue<T>(
  source: readonly T[] | undefined,
  ordinal: number,
  value: T | undefined,
  replace: boolean,
): T[] | undefined {
  if (!source || value === undefined) return source ? [...source] : undefined;
  const next = [...source];
  if (replace) next[ordinal] = value;
  else next.splice(ordinal, 0, value);
  return next;
}
