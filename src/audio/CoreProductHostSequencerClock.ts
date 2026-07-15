import { euclideanLaneCount } from './sequencerLaneCounts';

type SequencerClockKind = 'synth' | 'drum';

const CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY = '__coreProductClockStartDelay';
const CORE_PRODUCT_SNAPSHOT_WALL_SEC_STATE_KEY = '__coreProductSnapshotWallSec';

function booleanFromState(state: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}

export type CoreProductSequencerClockRejoinMask = Readonly<{
  synth: number;
  drum: number;
}>;

export const EMPTY_CORE_PRODUCT_SEQUENCER_CLOCK_REJOIN_MASK: CoreProductSequencerClockRejoinMask = {
  synth: 0,
  drum: 0,
};

export function hasCoreProductSequencerClockRejoin(
  mask: CoreProductSequencerClockRejoinMask,
): boolean {
  return mask.synth !== 0 || mask.drum !== 0;
}

function sequencerKindRejoinMask(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  kind: SequencerClockKind,
): number {
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const masterKey = kind === 'synth' ? 'synthEuclideanMasterEnabled' : 'drumEuclidMasterEnabled';
  if (!booleanFromState(next, masterKey, false)) return 0;
  const laneCount = euclideanLaneCount(kind);
  const allLaneMask = (1 << laneCount) - 1;
  if (!booleanFromState(previous, masterKey, false)) return allLaneMask;
  const timingKeys = [
    `${prefix}ClockSource`,
    `${prefix}JoinPolicy`,
  ];
  return timingKeys.some((key) => previous[key] !== next[key]) ? allLaneMask : 0;
}

export function coreProductSequencerClockRejoinMask(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): CoreProductSequencerClockRejoinMask {
  if (!previous) return EMPTY_CORE_PRODUCT_SEQUENCER_CLOCK_REJOIN_MASK;
  return {
    synth: sequencerKindRejoinMask(previous, next, 'synth'),
    drum: sequencerKindRejoinMask(previous, next, 'drum'),
  };
}

export function shouldRejoinCoreProductSequencerClocks(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): boolean {
  return hasCoreProductSequencerClockRejoin(coreProductSequencerClockRejoinMask(previous, next));
}

export function withCoreProductClockStartDelayState(
  state: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(state ?? {}),
    [CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY]: true,
    [CORE_PRODUCT_SNAPSHOT_WALL_SEC_STATE_KEY]: Date.now() / 1000,
  };
}
