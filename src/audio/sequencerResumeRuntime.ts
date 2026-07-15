import {
  normalizeSequencerResumeQuantization,
  type SequencerResumeQuantization,
} from './sequencerResumeQuantization';

export type SequencerResumeRuntimeState = {
  lastRequestedMuted: Array<boolean | undefined>;
  effectiveMuted: boolean[];
  pendingUnmuteTime: Array<number | null>;
  policy: Array<SequencerResumeQuantization | undefined>;
};

export function createSequencerResumeRuntimeState(laneCount: number): SequencerResumeRuntimeState {
  return {
    lastRequestedMuted: Array.from({ length: laneCount }, () => undefined),
    effectiveMuted: Array.from({ length: laneCount }, () => true),
    pendingUnmuteTime: Array.from({ length: laneCount }, () => null),
    policy: Array.from({ length: laneCount }, () => undefined),
  };
}

export function resetSequencerResumeRuntimeState(state: SequencerResumeRuntimeState): void {
  state.lastRequestedMuted.fill(undefined);
  state.effectiveMuted.fill(true);
  state.pendingUnmuteTime.fill(null);
  state.policy.fill(undefined);
}

export function invalidatePendingSequencerResumeBoundaries(state: SequencerResumeRuntimeState): void {
  for (let lane = 0; lane < state.pendingUnmuteTime.length; lane += 1) {
    if (state.pendingUnmuteTime[lane] === null) continue;
    state.pendingUnmuteTime[lane] = null;
    state.lastRequestedMuted[lane] = true;
  }
}

export function updateSequencerResumeRuntimeLane(options: {
  state: SequencerResumeRuntimeState;
  laneIndex: number;
  requestedMuted: boolean;
  policy: unknown;
  now: number;
  nextBoundaryTime: (policy: Exclude<SequencerResumeQuantization, 'immediate'>) => number;
}): (scheduledTime: number) => boolean {
  const { state, laneIndex, requestedMuted, now, nextBoundaryTime } = options;
  const policy = normalizeSequencerResumeQuantization(options.policy);
  const previousRequestedMuted = state.lastRequestedMuted[laneIndex];
  const previousPolicy = state.policy[laneIndex];

  if (previousRequestedMuted === undefined) {
    state.effectiveMuted[laneIndex] = requestedMuted;
    state.pendingUnmuteTime[laneIndex] = null;
  } else if (requestedMuted) {
    state.effectiveMuted[laneIndex] = true;
    state.pendingUnmuteTime[laneIndex] = null;
  } else if (previousRequestedMuted || (state.pendingUnmuteTime[laneIndex] !== null && previousPolicy !== policy)) {
    if (policy === 'immediate') {
      state.effectiveMuted[laneIndex] = false;
      state.pendingUnmuteTime[laneIndex] = null;
    } else {
      state.effectiveMuted[laneIndex] = true;
      state.pendingUnmuteTime[laneIndex] = nextBoundaryTime(policy);
    }
  }

  const pendingTime = state.pendingUnmuteTime[laneIndex] ?? null;
  if (!requestedMuted && pendingTime !== null && now >= pendingTime) {
    state.effectiveMuted[laneIndex] = false;
    state.pendingUnmuteTime[laneIndex] = null;
  }

  state.lastRequestedMuted[laneIndex] = requestedMuted;
  state.policy[laneIndex] = policy;

  return (scheduledTime: number): boolean => {
    if (requestedMuted) return true;
    const boundary = state.pendingUnmuteTime[laneIndex] ?? null;
    return boundary !== null ? scheduledTime < boundary : (state.effectiveMuted[laneIndex] ?? true);
  };
}
