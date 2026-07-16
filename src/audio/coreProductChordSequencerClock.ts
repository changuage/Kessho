import type { ClockDivision } from './drumSeqTypes';
import { normalizeSequencerClockDivision, sequencerClockDivisionToSeconds } from './sequencerClockDivisions';
import { getAnchorWallForClockSource, type TransportAnchors } from './transport';

const DEFAULT_CLOCK_DIVISION: ClockDivision = '1/4';
type ChordSequencerBeatClockSource = 'localBeat' | 'globalBeat';

export function coreProductSequencerBeatDurationSeconds(state: Record<string, unknown>): number {
  const bpm = typeof state.sequencerMasterBPM === 'number' && Number.isFinite(state.sequencerMasterBPM)
    ? state.sequencerMasterBPM
    : typeof state.synthEuclidBaseBPM === 'number' && Number.isFinite(state.synthEuclidBaseBPM)
      ? state.synthEuclidBaseBPM
      : typeof state.drumEuclidBaseBPM === 'number' && Number.isFinite(state.drumEuclidBaseBPM)
        ? state.drumEuclidBaseBPM
        : 120;
  return 60 / Math.max(1, bpm);
}

export function coreProductChordSequencerClockDivision(state: Record<string, unknown>): ClockDivision {
  return normalizeSequencerClockDivision(state.synthChordSequencerClockDivision, DEFAULT_CLOCK_DIVISION);
}

export function coreProductChordSequencerClockSource(state: Record<string, unknown>): ChordSequencerBeatClockSource {
  return state.synthEuclidClockSource === 'globalBeat' ? 'globalBeat' : 'localBeat';
}

export function coreProductChordSequencerStepSeconds(state: Record<string, unknown>): number {
  return sequencerClockDivisionToSeconds(
    coreProductChordSequencerClockDivision(state),
    coreProductSequencerBeatDurationSeconds(state),
    DEFAULT_CLOCK_DIVISION,
  );
}

export function nextCoreProductChordSequencerStepDelaySeconds(
  state: Record<string, unknown>,
  anchors: TransportAnchors,
  nowWallSec: number = Date.now() / 1000,
): number {
  const stepSeconds = Math.max(0.001, coreProductChordSequencerStepSeconds(state));
  const anchor = getAnchorWallForClockSource(coreProductChordSequencerClockSource(state), anchors);
  const nextStepIndex = Math.floor((nowWallSec - anchor) / stepSeconds) + 1;
  return Math.max(0.001, anchor + nextStepIndex * stepSeconds - nowWallSec);
}
