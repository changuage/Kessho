import { euclideanLaneCount } from './sequencerLaneCounts';

type SequencerClockKind = 'synth' | 'drum';

const CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY = '__coreProductClockStartDelay';
const CORE_PRODUCT_SNAPSHOT_WALL_SEC_STATE_KEY = '__coreProductSnapshotWallSec';

function booleanFromState(state: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}

function resolvedSequencerLaneEnabled(
  state: Record<string, unknown>,
  kind: SequencerClockKind,
  laneNumber: number,
): boolean {
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const masterKey = kind === 'synth' ? 'synthEuclideanMasterEnabled' : 'drumEuclidMasterEnabled';
  if (!booleanFromState(state, masterKey, false)) return false;
  const defaultLaneEnabled = kind === 'synth' && laneNumber === 1;
  return booleanFromState(state, `${prefix}${laneNumber}Enabled`, defaultLaneEnabled);
}

function shouldRejoinSequencerKind(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  kind: SequencerClockKind,
): boolean {
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const masterKey = kind === 'synth' ? 'synthEuclideanMasterEnabled' : 'drumEuclidMasterEnabled';
  if (!booleanFromState(next, masterKey, false)) return false;
  const timingKeys = [
    `${prefix}ClockSource`,
    `${prefix}JoinPolicy`,
  ];
  if (timingKeys.some((key) => previous[key] !== next[key])) return true;
  const laneCount = euclideanLaneCount(kind);
  for (let lane = 1; lane <= laneCount; lane += 1) {
    if (!resolvedSequencerLaneEnabled(previous, kind, lane) && resolvedSequencerLaneEnabled(next, kind, lane)) return true;
  }
  return false;
}

export function shouldRejoinCoreProductSequencerClocks(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): boolean {
  if (!previous) return false;
  return shouldRejoinSequencerKind(previous, next, 'synth') ||
    shouldRejoinSequencerKind(previous, next, 'drum');
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
