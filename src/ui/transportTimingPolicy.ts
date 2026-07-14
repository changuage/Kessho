import type { SliderState } from './state';

const RELEASE_COMMITTED_TRANSPORT_TIMING_KEYS = new Set<keyof SliderState>([
  'phraseLength',
  'sequencerMasterBPM',
  'synthEuclidBaseBPM',
  'drumEuclidBaseBPM',
  'transportBarsPerPhrase',
  'transportBeatsPerBar',
]);

const TRANSPORT_CLOCK_STATE_KEYS = new Set<keyof SliderState>([
  ...RELEASE_COMMITTED_TRANSPORT_TIMING_KEYS,
  'transportPrimaryClock',
]);

/** Controls whose drag preview must stay local until release. */
export function isReleaseCommittedTransportTimingKey(key: keyof SliderState): boolean {
  return RELEASE_COMMITTED_TRANSPORT_TIMING_KEYS.has(key);
}

/** State edits that must normalize linked transport clocks as one transaction. */
export function isTransportClockStateKey(key: keyof SliderState): boolean {
  return TRANSPORT_CLOCK_STATE_KEYS.has(key);
}
