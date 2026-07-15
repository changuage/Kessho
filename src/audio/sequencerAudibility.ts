export type SequencerAudibilityKind = 'synth' | 'drum';

const LANE_COUNTS: Readonly<Record<SequencerAudibilityKind, number>> = {
  synth: 4,
  drum: 6,
};

export type SequencerLaneAudibility = Readonly<{
  muted: boolean;
  soloed: boolean;
  soloActive: boolean;
}>;

/**
 * Resolves only whether a sequencer lane may emit sound. It intentionally does
 * not decide whether the lane clock runs; master transport owns that decision.
 */
export function resolveSequencerLaneAudibility(
  state: object | undefined,
  kind: SequencerAudibilityKind,
  laneNumber: number,
): SequencerLaneAudibility {
  const values = state as Record<string, unknown> | undefined;
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const laneCount = LANE_COUNTS[kind];
  const normalizedLane = Math.max(1, Math.min(laneCount, Math.trunc(laneNumber)));
  const defaultEnabled = kind === 'synth' && normalizedLane === 1;
  const enabledValue = values?.[`${prefix}${normalizedLane}Enabled`];
  const enabled = typeof enabledValue === 'boolean' ? enabledValue : defaultEnabled;
  const soloed = values?.[`${prefix}${normalizedLane}Solo`] === true;
  let soloActive = false;
  for (let index = 1; index <= laneCount; index += 1) {
    if (values?.[`${prefix}${index}Solo`] === true) {
      soloActive = true;
      break;
    }
  }
  return {
    muted: !enabled || (soloActive && !soloed),
    soloed,
    soloActive,
  };
}
