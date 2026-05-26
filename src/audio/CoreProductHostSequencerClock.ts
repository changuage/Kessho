type SequencerClockKind = 'synth' | 'drum';

const PRODUCT_VISIBLE_LANE_COUNT = 4;
const CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY = '__coreProductClockStartDelay';
const CORE_PRODUCT_SNAPSHOT_WALL_SEC_STATE_KEY = '__coreProductSnapshotWallSec';

function shouldRejoinSequencerKind(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  kind: SequencerClockKind,
): boolean {
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const masterKey = kind === 'synth' ? 'synthEuclideanMasterEnabled' : 'drumEuclidMasterEnabled';
  if (next[masterKey] !== true) return false;
  const timingKeys = [
    'transportPrimaryClock',
    'phraseLength',
    'sequencerMasterBPM',
    'transportBarsPerPhrase',
    'transportBeatsPerBar',
    `${prefix}ClockSource`,
    `${prefix}JoinPolicy`,
  ];
  if (timingKeys.some((key) => previous[key] !== next[key])) return true;
  for (let lane = 1; lane <= PRODUCT_VISIBLE_LANE_COUNT; lane += 1) {
    const enabledKey = `${prefix}${lane}Enabled`;
    if (previous[enabledKey] !== true && next[enabledKey] === true) return true;
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
