import type { SliderState } from '../ui/state';
import { getPhraseDurationForClockSource } from './transport';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { clamp, numberFromState } from './coreProductSnapshotState';
import type { CoreProductSnapshot, ProductLaneSnapshot } from './coreProductSnapshotTypes';
import { laneDefaults } from './coreProductSnapshotDefaults';
import { padEuclidOwnedVoiceMask } from './coreProductArrangementVoiceMapping';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import {
  leadRandomSource,
  leadRandomSourceEnabled,
  leadRandomSourceId,
  simpleSequencerSourceId,
  synthChordGeneratorSource,
  synthChordGeneratorSourceEnabled,
} from './coreProductArrangementSchedulerUtils';
import { getEffectiveTension } from './harmony';

// Random lane mode id shared with native kSequencerModeRandom.
export const PRODUCT_SEQUENCER_MODE_RANDOM = 3;

// Transitional part ids (until the six-slot TS state owns saved ids): each
// migrated generator keeps one fixed identity, so its stream never depends on
// which lane it runs in.
export const RANDOM_CHORDS_TRANSITIONAL_PART_ID = 1;
export const RANDOM_NOTES_TRANSITIONAL_PART_ID = 2;

// Transitional lane positions: chords always run on lane 5 and notes on lane 6.
// A generator that is off leaves its lane disabled, so toggling one is a
// parameter diff, never a lane move.
export const RANDOM_CHORDS_TRANSITIONAL_LANE_INDEX = 4;
export const RANDOM_NOTES_TRANSITIONAL_LANE_INDEX = 5;

type State = Record<string, unknown>;

// Harmony owns the pitches; a Random Chords lane only renders and routes them.
function randomChordsLane(state: State): ProductLaneSnapshot {
  const chordSource = synthChordGeneratorSource(state);
  const sourceId = simpleSequencerSourceId(chordSource === 'both' ? 'pad1' : chordSource);
  const lane = laneDefaults(sourceId, 60);
  lane.enabled = synthChordGeneratorSourceEnabled(state);
  lane.sequencerMode = PRODUCT_SEQUENCER_MODE_RANDOM;
  // Pad 1 and Pad 2 keep their own fit flags; a split chord follows Pad 1.
  const padFit = sourceId === CORE_PRODUCT_SOURCE_IDS.pad2
    ? state.pad2FitEnvelopeToChord !== false
    : state.padFitEnvelopeToChord !== false;
  lane.random = {
    ...lane.random,
    mode: 0,
    partId: RANDOM_CHORDS_TRANSITIONAL_PART_ID,
    voiceCount: clamp(Math.round(numberFromState(state, 'synthChordGeneratorVoiceCount', 6)), 1, 8),
    waveSpread: clamp(numberFromState(state, 'waveSpread', 0.125), 0, 1),
    octave: clamp(Math.round(numberFromState(state, 'synthOctave', 0)), -4, 4),
    voiceMask: clamp(Math.round(numberFromState(state, 'synthVoiceMask', 63)), 0, 255) >>> 0,
    pad2VoiceAssign: clamp(Math.round(numberFromState(state, 'pad2VoiceAssign', 0)), 0, 255) >>> 0,
    padSplit: chordSource === 'both',
    fitEnvelopeToChord: padFit,
  };
  return lane;
}

function randomNotesLane(state: State): ProductLaneSnapshot {
  const source = leadRandomSource(state);
  const sourceId = leadRandomSourceId(source);
  const lane = laneDefaults(sourceId, 60);
  lane.enabled = leadRandomSourceEnabled(state, source);
  lane.sequencerMode = PRODUCT_SEQUENCER_MODE_RANDOM;
  const tensionMode = state.leadTensionMode === 'locked' || state.leadTensionMode === 'bypass'
    ? state.leadTensionMode
    : 'follow';
  const tension = getEffectiveTension(
    clamp(numberFromState(state, 'tension', 0.3), 0, 1),
    tensionMode,
    clamp(numberFromState(state, 'leadTensionValue', 0), -0.5, 0.5),
  );
  lane.random = {
    ...lane.random,
    mode: 1,
    partId: RANDOM_NOTES_TRANSITIONAL_PART_ID,
    // Playback start is the shared phrase-zero boundary; a live "next phrase"
    // enable is aligned by the native lane arm instead of a wall-clock delay.
    phraseSeconds: getPhraseDurationForClockSource(
      state as unknown as SliderState,
      (state as unknown as SliderState).leadRandomClockSource ?? 'globalPhrase',
    ),
    density: clamp(numberFromState(state, 'lead1Density', 0.5), 0.1, 12),
    notesOctave: clamp(Math.round(numberFromState(state, 'lead1Octave', 1)), -4, 4),
    octaveRange: clamp(Math.round(numberFromState(state, 'lead1OctaveRange', 2)), 1, 4),
    holdSeconds: coreProductSynthSequencerHoldSecondsFromState(state, sourceId, 0.5),
    velocityMin: 0.5,
    velocityMax: 0.9,
    chordBias: tension < 0 ? 0.9 : 0.9 - tension * 0.4,
    initialDelaySeconds: 0,
  };
  return lane;
}

// Today's chord generator and Random Notes become lanes 5 and 6.
export function coreProductRandomLanesFromState(state: State | undefined): ProductLaneSnapshot[] {
  const resolved = state ?? {};
  return [randomChordsLane(resolved), randomNotesLane(resolved)];
}

// Harmony owns the pitches and Random lanes own their generators; this block
// holds only the settings that are global to every lane.
export function coreProductArrangementSnapshotFromState(
  state: Record<string, unknown> | undefined,
): CoreProductSnapshot['arrangement'] {
  const arrangementState = state ?? {};
  return {
    sourceHoldSeconds: Array.from(
      { length: 8 },
      (_, index) => coreProductSynthSequencerHoldSecondsFromState(arrangementState, index + 1, 0.5),
    ),
    padEuclidOwnedVoiceMask: padEuclidOwnedVoiceMask(arrangementState) >>> 0,
  };
}
