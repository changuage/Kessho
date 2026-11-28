import type { SliderState } from '../ui/state';
import { getPhraseDurationForClockSource } from './transport';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { clamp, numberFromState } from './coreProductSnapshotState';
import type { CoreProductSnapshot, ProductLaneSnapshot } from './coreProductSnapshotTypes';
import { padEuclidOwnedVoiceMask } from './coreProductArrangementVoiceMapping';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { manualNoteSourceEnabled } from './coreProductArrangementSchedulerUtils';
import { SEQUENCER_MODE_IDS } from './coreProductSequencerFaceSnapshot';
import { resolveSequencerLaneAudibility } from './sequencerAudibility';
import { getEffectiveTension } from './harmony';
import { synthRandomSettingsFromState } from '../ui/sequencer/synthRandomSlot';

/**
 * Turns a synth lane into a Random lane from its slot: the slot's own source,
 * `partId` and `synthEuclid<N>Random*` settings. Nothing here reads another
 * slot, so a slot's lane (and the stream seeded from its `partId`) never
 * changes when a different slot is edited or retyped.
 */
export function applyRandomSlotToLane(
  lane: ProductLaneSnapshot,
  state: Record<string, unknown> | undefined,
  laneNumber: number,
  partId: number,
): void {
  const record = state ?? {};
  const settings = synthRandomSettingsFromState(record, laneNumber);
  const split = settings.PadSplit && (
    lane.targetSourceId === CORE_PRODUCT_SOURCE_IDS.pad1 || lane.targetSourceId === CORE_PRODUCT_SOURCE_IDS.pad2
  );
  const sourceId = lane.targetSourceId;
  const audibility = resolveSequencerLaneAudibility(record, 'synth', laneNumber);
  const sourcePlayable = split
    ? manualNoteSourceEnabled(record, CORE_PRODUCT_SOURCE_IDS.pad1)
      || manualNoteSourceEnabled(record, CORE_PRODUCT_SOURCE_IDS.pad2)
    : manualNoteSourceEnabled(record, sourceId);

  // A Random slot plays on its own phrase clock, independent of the Euclid
  // master transport, and native reads only `enabled`, so mute and solo fold in.
  lane.sequencerMode = SEQUENCER_MODE_IDS.random;
  lane.muted = audibility.muted;
  lane.enabled = !audibility.muted && sourcePlayable;

  const tension = getEffectiveTension(
    clamp(numberFromState(record, 'tension', 0.3), 0, 1),
    settings.TensionMode,
    settings.TensionValue,
  );
  lane.random = {
    ...lane.random,
    mode: settings.Mode === 'notes' ? 1 : 0,
    partId,
    voiceCount: settings.VoiceCount,
    waveSpread: settings.WaveSpread,
    octave: settings.Octave,
    voiceMask: settings.VoiceMask >>> 0,
    pad2VoiceAssign: settings.Pad2VoiceAssign >>> 0,
    padSplit: split,
    fitEnvelopeToChord: settings.FitEnvelope,
    // Playback start is the shared phrase-zero boundary; a live enable is
    // aligned by the native lane arm instead of a wall-clock delay.
    phraseSeconds: getPhraseDurationForClockSource(record as unknown as SliderState, settings.PhraseSource),
    density: settings.Density,
    notesOctave: settings.NotesOctave,
    octaveRange: settings.OctaveRange,
    holdSeconds: coreProductSynthSequencerHoldSecondsFromState(record, sourceId, 0.5),
    velocityMin: 0.5,
    velocityMax: 0.9,
    chordBias: tension < 0 ? 0.9 : 0.9 - tension * 0.4,
    initialDelaySeconds: 0,
  };
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
