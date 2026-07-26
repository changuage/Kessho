import { CORE_PRODUCT_SOURCE_IDS, createCoreProductManualNoteEvent, type CoreProductEvent } from './coreProductEvents';
import {
  PAD_VOICE_COUNT,
} from './coreProductArrangementVoiceMapping';
import {
  resolveCoreProductChordVoices,
  type CoreProductChordVoice,
} from './coreProductChordVoices';
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
  clamp,
  harmonyPhraseSeconds,
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

type CoreProductPadChordScheduleArgs = {
  state: Record<string, unknown>;
  harmonyState: HarmonyState;
  rng: () => number;
  anchors: TransportAnchors | null;
  nowWallSec: number;
  includeRuntimeNotes?: boolean;
};

type ChordVoice = CoreProductChordVoice;

export function createCoreProductChordGeneratorSchedule(args: CoreProductPadChordScheduleArgs): CoreProductPadChordSchedule {
  const { state, harmonyState, rng, anchors, nowWallSec } = args;
  const includeRuntimeNotes = args.includeRuntimeNotes !== false;
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
  const source = String(state.synthChordGeneratorSource ?? 'sample1').trim().toLowerCase();
  const voiceCount = boundedInteger(state, 'synthChordGeneratorVoiceCount', 6, 1, PAD_VOICE_COUNT);
  const chordMidi = harmonyState.currentChord.midiNotes.length > 0
    ? harmonyState.currentChord.midiNotes
    : [48 + boundedInteger(state, 'rootNote', 4, 0, 11)];
  const octaveShift = boundedInteger(state, 'synthOctave', 0, -2, 2) * 12;
  const voices = resolveCoreProductChordVoices({
    state,
    source,
    voiceCount,
    chordMidi,
    octaveShift,
    triggerIntervalSeconds,
    gate: 1,
    timingMode: 'straight',
    rng,
    velocity: 1,
  });
  if (voices.length === 0) return schedule;

  const addRuntimeNote = (
    sourceId: number,
    midi: number,
    delaySeconds: number,
    voiceIndex: number,
    velocity = 1,
    holdSeconds?: number,
  ) => {
    if (!includeRuntimeNotes || !timing) return;
    const vizSource = runtimeSourceFromSourceId(sourceId);
    const triggerWallSec = nowWallSec + delaySeconds;
    const envelope = envelopeForSource(sliderState, vizSource, delaySeconds, triggerIntervalSeconds);
    if (typeof holdSeconds === 'number' && Number.isFinite(holdSeconds)) {
      envelope.gateSeconds = clamp(holdSeconds, 0.02, 24);
    }
    runtimeNotes.push({
      id: `chord-generator:${timing.phraseIndex}:${triggerWallSec.toFixed(4)}:${vizSource}:${voiceIndex}:${Math.round(midi)}:${runtimeNotes.length}`,
      source: vizSource,
      midi,
      label: midiNoteLabel(midi),
      voiceIndex,
      triggerSeconds: triggerWallSec - timing.phraseStartWallSec,
      triggerWallSec,
      velocity,
      envelope,
    });
  };

  const holdSecondsForVoice = (voice: ChordVoice, delaySeconds: number): number => {
    if (voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1) {
      return coreProductPadEnvelopeGateSecondsFromState(state, 'pad1', {
        triggerIntervalSeconds,
        voiceDelaySeconds: delaySeconds,
      });
    }
    if (voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2) {
      return coreProductPadEnvelopeGateSecondsFromState(state, 'pad2', {
        triggerIntervalSeconds,
        voiceDelaySeconds: delaySeconds,
      });
    }
    return coreProductSynthSequencerHoldSecondsFromState(state, voice.sourceId, 0.5);
  };

  for (const voice of voices) {
    const delaySeconds = voice.baseDelaySeconds;
    const holdSeconds = holdSecondsForVoice(voice, delaySeconds);
    addRuntimeNote(voice.sourceId, voice.midi, delaySeconds, voice.voiceIndex, voice.velocity, holdSeconds);
    scheduledNotes.push({
      delaySeconds,
      event: createCoreProductManualNoteEvent(
        voice.sourceId,
        voice.midi,
        clamp(voice.velocity, 0.001, 1),
        holdSeconds * 1000,
        voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 || voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2
          ? voice.voiceIndex
          : undefined,
      ),
    });
  }
  return schedule;
}
