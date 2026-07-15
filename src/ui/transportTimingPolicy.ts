import type { SliderState } from './state';

const TRANSPORT_TIMING_KEYS = new Set<keyof SliderState>([
  'phraseLength',
  'sequencerMasterBPM',
  'synthEuclidBaseBPM',
  'drumEuclidBaseBPM',
  'transportBarsPerPhrase',
  'transportBeatsPerBar',
]);

const TRANSPORT_CLOCK_STATE_KEYS = new Set<keyof SliderState>([
  ...TRANSPORT_TIMING_KEYS,
  'transportPrimaryClock',
]);

/** State edits that must normalize linked transport clocks as one transaction. */
export function isTransportClockStateKey(key: keyof SliderState): boolean {
  return TRANSPORT_CLOCK_STATE_KEYS.has(key);
}
