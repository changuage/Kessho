// A Random Notes slot plays through one sound source. Turning the slot on or
// changing its source switches that source on, and switching the source off
// again stops the slot, so a Random slot never runs silently against a muted
// source. Random Chords slots do not follow the source toggles.

import { SYNTH_EUCLIDEAN_LANE_NUMBERS } from '../../audio/sequencerLaneCounts';
import { normalizeSynthEuclidSource } from '../../audio/coreProductSourceMapping';
import { synthRandomKey } from './synthRandomSlot';
import { normalizeSynthSequencerFaceState } from './sequencerModeTypes';
import type { SliderState } from '../state';

type SourceEnabledKey = 'padEnabled' | 'pad2Enabled' | 'leadEnabled' | 'lead2Enabled' | 'sample1Enabled' | 'sample2Enabled';

function sourceEnabledKey(value: unknown): SourceEnabledKey {
  const source = normalizeSynthEuclidSource(value);
  if (source === 'pad2') return 'pad2Enabled';
  if (source === 'lead2') return 'lead2Enabled';
  if (source === 'sample1') return 'sample1Enabled';
  if (source === 'sample2') return 'sample2Enabled';
  if (source === 'pad1' || source.startsWith('synth')) return 'padEnabled';
  return 'leadEnabled';
}

function isRandomNotesSlot(state: SliderState, laneNumber: number): boolean {
  const slot = normalizeSynthSequencerFaceState(state.synthSequencerFaces).slots[laneNumber - 1];
  return slot?.mode === 'random' && state[synthRandomKey(laneNumber, 'Mode')] === 'notes';
}

/** Switches on the source a Random Notes slot plays through. */
export function enableRandomNotesSource(next: SliderState, laneNumber: number): void {
  const key = sourceEnabledKey(next[`synthEuclid${laneNumber as 1}Source` as 'synthEuclid1Source']);
  next[key] = true;
}

/** Lanes holding an enabled Random Notes slot whose source is switched off. */
export function randomNotesLanesWithoutSource(state: SliderState): number[] {
  return SYNTH_EUCLIDEAN_LANE_NUMBERS.filter((lane) => (
    isRandomNotesSlot(state, lane)
    && state[`synthEuclid${lane}Enabled` as 'synthEuclid1Enabled'] === true
    && state[sourceEnabledKey(state[`synthEuclid${lane}Source` as 'synthEuclid1Source'])] !== true
  ));
}

/**
 * Applies the on-enable behaviour for a state key edit: enabling a Random Notes
 * slot, changing its source, or switching a slot to Notes brings its source up.
 */
export function enableRandomNotesSourceForEdit(next: SliderState, key: string): void {
  const match = /^synthEuclid([1-6])(Enabled|Source|RandomMode)$/.exec(key);
  if (!match) return;
  const lane = Number(match[1]);
  if (!isRandomNotesSlot(next, lane)) return;
  if (next[`synthEuclid${lane}Enabled` as 'synthEuclid1Enabled'] !== true) return;
  enableRandomNotesSource(next, lane);
}

/** Stops every Random Notes slot that has no live source. */
export function disableRandomNotesWithoutSource(state: SliderState): SliderState {
  const lanes = randomNotesLanesWithoutSource(state);
  if (lanes.length === 0) return state;
  const next = { ...state };
  for (const lane of lanes) (next as Record<string, unknown>)[`synthEuclid${lane}Enabled`] = false;
  return next;
}
