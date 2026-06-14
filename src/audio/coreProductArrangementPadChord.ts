import { CORE_PRODUCT_SOURCE_IDS, createCoreProductManualNoteEvent, type CoreProductEvent } from './coreProductEvents';
import {
  PAD_VOICE_COUNT,
  enabledChordMidiForMask,
  enabledVoiceRank,
  padChordVoiceMasksForSource,
  padEuclidOwnedVoiceMask,
} from './coreProductArrangementVoiceMapping';
import { coreProductPadEnvelopeGateSecondsFromState, coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import type { HarmonyState } from './harmony';
import type { TransportAnchors } from './transport';
import {
  envelopeForSource,
  midiNoteLabel,
  type SimpleSequencerVizNote,
} from './simpleSequencerPhrasePreview';
import {
  boundedInteger,
  boundedNumber,
  clamp,
  harmonyPhraseSeconds,
  manualNoteSourceEnabled,
  padChordTriggerIntervalSeconds,
  phraseTimingForClockSource,
  runtimeSourceFromSourceId,
  sliderStateFromRecord,
  type PhraseTiming,
} from './coreProductArrangementSchedulerUtils';

export type CoreProductArrangementScheduledNote = {
  delaySeconds: number;
  event: CoreProductEvent;
};

export type CoreProductPadChordSchedule = {
  phraseSeconds: number;
  triggerIntervalSeconds: number;
  timing: PhraseTiming | null;
  runtimeNotes: SimpleSequencerVizNote[];
  scheduledNotes: CoreProductArrangementScheduledNote[];
};

export function createCoreProductPadChordSchedule(args: {
  state: Record<string, unknown>;
  harmonyState: HarmonyState;
  rng: () => number;
  anchors: TransportAnchors | null;
  nowWallSec: number;
}): CoreProductPadChordSchedule {
  const { state, harmonyState, rng, anchors, nowWallSec } = args;
  const sliderState = sliderStateFromRecord(state);
  const phraseSeconds = harmonyPhraseSeconds(sliderState);
  const triggerIntervalSeconds = padChordTriggerIntervalSeconds(sliderState);
  const timing = anchors
    ? phraseTimingForClockSource(sliderState.harmonyClockSource ?? 'globalPhrase', phraseSeconds, anchors, nowWallSec)
    : null;
  const runtimeNotes: SimpleSequencerVizNote[] = [];
  const scheduledNotes: CoreProductArrangementScheduledNote[] = [];
  const schedule: CoreProductPadChordSchedule = {
    phraseSeconds,
    triggerIntervalSeconds,
    timing,
    runtimeNotes,
    scheduledNotes,
  };
  const maskLimit = (1 << PAD_VOICE_COUNT) - 1;
  const source = String(state.synthChordSequencerSource ?? 'both').trim().toLowerCase();
  const voiceCount = boundedInteger(state, 'synthChordSequencerVoiceCount', 6, 1, PAD_VOICE_COUNT);
  const euclidOwnedMask = padEuclidOwnedVoiceMask(state);
  const rawVoiceMask = boundedInteger(state, 'synthVoiceMask', 63, 0, maskLimit) & maskLimit;
  const pad2Assign = boundedInteger(state, 'pad2VoiceAssign', 0, 0, maskLimit) & maskLimit;
  const availablePadMask = rawVoiceMask & ~euclidOwnedMask;
  const chordMidi = harmonyState.currentChord.midiNotes.length > 0
    ? harmonyState.currentChord.midiNotes
    : [48 + boundedInteger(state, 'rootNote', 4, 0, 11)];
  const octaveShift = boundedInteger(state, 'synthOctave', 0, -2, 2) * 12;
  const addRuntimeNote = (
    sourceId: number,
    midi: number,
    delaySeconds: number,
    voiceIndex: number,
    velocity = 1,
  ) => {
    if (!timing) return;
    const vizSource = runtimeSourceFromSourceId(sourceId);
    const triggerWallSec = nowWallSec + delaySeconds;
    runtimeNotes.push({
      id: `pad-runtime:${timing.phraseIndex}:${triggerWallSec.toFixed(4)}:${vizSource}:${voiceIndex}:${Math.round(midi)}:${runtimeNotes.length}`,
      source: vizSource,
      midi,
      label: midiNoteLabel(midi),
      voiceIndex,
      triggerSeconds: triggerWallSec - timing.phraseStartWallSec,
      triggerWallSec,
      velocity,
      envelope: envelopeForSource(sliderState, vizSource, delaySeconds, triggerIntervalSeconds),
    });
  };
  const waveSpreadSeconds =
    boundedNumber(state, 'waveSpread', 0.125, 0, 1) *
    triggerIntervalSeconds;
  const voiceOffsets = Array.from({ length: PAD_VOICE_COUNT }, () => rng() * waveSpreadSeconds).sort((a, b) => a - b);
  const nonPadSourceId = source === 'lead1' || source === 'lead'
    ? CORE_PRODUCT_SOURCE_IDS.lead1
    : source === 'lead2'
      ? CORE_PRODUCT_SOURCE_IDS.lead2
      : source === 'piano'
        ? CORE_PRODUCT_SOURCE_IDS.piano
        : 0;
  if (nonPadSourceId !== 0) {
    if (!manualNoteSourceEnabled(state, nonPadSourceId)) return schedule;
    for (let index = 0; index < voiceCount; index += 1) {
      const midi = clamp(chordMidi[index % chordMidi.length]! + octaveShift, 0, 127);
      const holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, nonPadSourceId, 0.5);
      const delaySeconds = voiceOffsets[index] ?? 0;
      addRuntimeNote(nonPadSourceId, midi, delaySeconds, index);
      scheduledNotes.push({
        delaySeconds,
        event: createCoreProductManualNoteEvent(nonPadSourceId, midi, 1, holdSeconds * 1000),
      });
    }
    return schedule;
  }
  const rawPadMasks = padChordVoiceMasksForSource(source, availablePadMask, pad2Assign, voiceCount);
  const pad1Mask = manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1) ? rawPadMasks.pad1Mask : 0;
  const pad2Mask = manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2) ? rawPadMasks.pad2Mask : 0;
  if ((pad1Mask | pad2Mask) === 0) return schedule;
  const pad1ChordMidi = enabledChordMidiForMask(chordMidi, pad1Mask);
  const pad2ChordMidi = enabledChordMidiForMask(chordMidi, pad2Mask);
  for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
    const bit = 1 << voiceIndex;
    const delaySeconds = voiceOffsets[voiceIndex] ?? 0;
    if ((pad1Mask & bit) !== 0) {
      const enabledIndex = enabledVoiceRank(pad1Mask, voiceIndex);
      const midi = clamp(pad1ChordMidi[enabledIndex % pad1ChordMidi.length]! + octaveShift, 0, 127);
      const holdSeconds = coreProductPadEnvelopeGateSecondsFromState(state, 'pad1', {
        triggerIntervalSeconds,
        voiceDelaySeconds: delaySeconds,
      });
      addRuntimeNote(CORE_PRODUCT_SOURCE_IDS.pad1, midi, delaySeconds, voiceIndex);
      scheduledNotes.push({
        delaySeconds,
        event: createCoreProductManualNoteEvent(CORE_PRODUCT_SOURCE_IDS.pad1, midi, 1, holdSeconds * 1000, voiceIndex),
      });
    }
    if ((pad2Mask & bit) !== 0) {
      const enabledIndex = enabledVoiceRank(pad2Mask, voiceIndex);
      const midi = clamp(pad2ChordMidi[enabledIndex % pad2ChordMidi.length]! + octaveShift, 0, 127);
      const holdSeconds = coreProductPadEnvelopeGateSecondsFromState(state, 'pad2', {
        triggerIntervalSeconds,
        voiceDelaySeconds: delaySeconds,
      });
      addRuntimeNote(CORE_PRODUCT_SOURCE_IDS.pad2, midi, delaySeconds, voiceIndex);
      scheduledNotes.push({
        delaySeconds,
        event: createCoreProductManualNoteEvent(CORE_PRODUCT_SOURCE_IDS.pad2, midi, 1, holdSeconds * 1000, voiceIndex),
      });
    }
  }
  return schedule;
}
