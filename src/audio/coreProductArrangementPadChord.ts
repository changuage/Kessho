import { CORE_PRODUCT_SOURCE_IDS, createCoreProductManualNoteEvent, createCoreProductParamEvent, type CoreProductEvent } from './coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  PAD_VOICE_COUNT,
} from './coreProductArrangementVoiceMapping';
import {
  resolveCoreProductChordVoices,
  type CoreProductChordVoice,
} from './coreProductChordVoices';
import { coreProductChordSequencerClockSource, coreProductChordSequencerStepSeconds } from './coreProductChordSequencerClock';
import { coreProductPadEnvelopeGateSecondsFromState, coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { HARMONY_SLOT_COUNT } from './CoreProductHarmonyControl';
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
import {
  createSynthChordSlotResolutionContext,
  resolveSynthChordStepMidiPool,
  sanitizeSynthChordSequencerConfig,
  synthChordArpPatternForShape,
  synthChordArpSpeedSeconds,
  type SynthChordSequencerArpPatternStep,
  synthChordSequencerTriggerOrdinalForTick,
  synthChordSequencerStepForTick,
  synthChordSubLaneValue,
  type SynthChordSequencerArpOrder,
  type SynthChordSequencerStrumDirection,
} from './synthChordSequencer';

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

type ChordVoice = CoreProductChordVoice;

const CHORD_MORPH_SOURCE_IDS = new Set<number>([
  CORE_PRODUCT_SOURCE_IDS.pad1,
  CORE_PRODUCT_SOURCE_IDS.pad2,
  CORE_PRODUCT_SOURCE_IDS.lead1,
  CORE_PRODUCT_SOURCE_IDS.lead2,
]);

const CHORD_DISTANCE_SOURCE_IDS = new Set<number>([
  CORE_PRODUCT_SOURCE_IDS.pad1,
  CORE_PRODUCT_SOURCE_IDS.pad2,
  CORE_PRODUCT_SOURCE_IDS.lead1,
  CORE_PRODUCT_SOURCE_IDS.lead2,
  CORE_PRODUCT_SOURCE_IDS.piano,
]);

function orderedChordVoices(
  voices: readonly ChordVoice[],
  order: SynthChordSequencerArpOrder | SynthChordSequencerStrumDirection,
  rng: () => number,
): ChordVoice[] {
  const up = [...voices].sort((left, right) => left.midi - right.midi || left.voiceIndex - right.voiceIndex);
  if (order === 'up') return up;
  if (order === 'down') return [...up].reverse();
  if (order === 'random') return up.map((voice) => ({ voice, key: rng() }))
    .sort((left, right) => left.key - right.key)
    .map((entry) => entry.voice);
  if (order === 'outsideIn') {
    const result: ChordVoice[] = [];
    let low = 0;
    let high = up.length - 1;
    while (low <= high) {
      if (up[low]) result.push(up[low]!);
      if (high !== low && up[high]) result.push(up[high]!);
      low += 1;
      high -= 1;
    }
    return result;
  }
  if (order === 'insideOut') {
    const result: ChordVoice[] = [];
    let low = Math.floor((up.length - 1) / 2);
    let high = low + 1;
    while (low >= 0 || high < up.length) {
      if (up[low]) result.push(up[low]!);
      if (up[high]) result.push(up[high]!);
      low -= 1;
      high += 1;
    }
    return result;
  }
  if (order === 'downUp') {
    const down = [...up].reverse();
    return down.concat(up.slice(1, -1));
  }
  return up.concat([...up].reverse().slice(1, -1));
}

export function createCoreProductPadChordSchedule(args: {
  state: Record<string, unknown>;
  harmonyState: HarmonyState;
  rng: () => number;
  anchors: TransportAnchors | null;
  nowWallSec: number;
}): CoreProductPadChordSchedule {
  return createCoreProductChordSequencerSchedule(args);
}

export function createCoreProductChordGeneratorSchedule(args: {
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
  const source = String(state.synthChordGeneratorSource ?? 'piano').trim().toLowerCase();
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
    if (!timing) return;
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

export function createCoreProductChordSequencerSchedule(args: {
  state: Record<string, unknown>;
  harmonyState: HarmonyState;
  rng: () => number;
  anchors: TransportAnchors | null;
  nowWallSec: number;
}): CoreProductPadChordSchedule {
  const { state, harmonyState, rng, anchors, nowWallSec } = args;
  const sliderState = sliderStateFromRecord(state);
  const config = sanitizeSynthChordSequencerConfig(state.synthChordSequencer);
  const triggerIntervalSeconds = coreProductChordSequencerStepSeconds(state);
  const phraseSeconds = triggerIntervalSeconds * config.stepCount;
  const timing = anchors
    ? phraseTimingForClockSource(coreProductChordSequencerClockSource(state), phraseSeconds, anchors, nowWallSec)
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
  const ticksPerPhrase = config.stepCount;
  const phraseTickIndex = timing
    ? clamp(Math.floor((nowWallSec - timing.phraseStartWallSec + 0.002) / Math.max(0.001, triggerIntervalSeconds)), 0, ticksPerPhrase - 1)
    : 0;
  const absoluteTickIndex = timing ? timing.phraseIndex * ticksPerPhrase + phraseTickIndex : 0;
  const step = synthChordSequencerStepForTick(config, absoluteTickIndex);
  if (!step.enabled || (step.probability < 1 && rng() > step.probability)) return schedule;
  const chordTriggerOrdinal = synthChordSequencerTriggerOrdinalForTick(config, absoluteTickIndex);
  const chordSlotValue = synthChordSubLaneValue(config, 'chord', chordTriggerOrdinal);
  const resolvedStep = {
    ...step,
    slotId: chordSlotValue == null ? step.slotId : clamp(Math.round(chordSlotValue) - 1, 0, HARMONY_SLOT_COUNT - 1),
  };
  const chordVelocityScale = clamp(synthChordSubLaneValue(config, 'expression', chordTriggerOrdinal) ?? 1, 0.001, 1);
  const chordMorph = synthChordSubLaneValue(config, 'morph', chordTriggerOrdinal);
  const chordDistance = synthChordSubLaneValue(config, 'distance', chordTriggerOrdinal);
  const chordNudgeSeconds = clamp(synthChordSubLaneValue(config, 'nudge', chordTriggerOrdinal) ?? 0, -1, 1) * triggerIntervalSeconds * 0.45;

  const source = String(state.synthChordSequencerSource ?? 'piano').trim().toLowerCase();
  const voiceCount = boundedInteger(state, 'synthChordSequencerVoiceCount', 6, 1, PAD_VOICE_COUNT);
  const fallbackChordMidi = harmonyState.currentChord.midiNotes.length > 0
    ? harmonyState.currentChord.midiNotes
    : [48 + boundedInteger(state, 'rootNote', 4, 0, 11)];
  const slotContext = createSynthChordSlotResolutionContext(state, harmonyState);
  const resolvedChordMidi = resolveSynthChordStepMidiPool({
    step: resolvedStep,
    context: slotContext,
    fallbackMidi: fallbackChordMidi,
  });
  const chordMidi = resolvedChordMidi.length > 0 ? resolvedChordMidi : fallbackChordMidi;
  const octaveShift = boundedInteger(state, 'synthOctave', 0, -2, 2) * 12;
  const voices = resolveCoreProductChordVoices({
    state,
    source,
    voiceCount,
    chordMidi,
    octaveShift,
    triggerIntervalSeconds,
    rng,
    velocity: chordVelocityScale,
  });
  const addRuntimeNote = (
    sourceId: number,
    midi: number,
    delaySeconds: number,
    voiceIndex: number,
    velocity = 1,
    envelopeIntervalSeconds = triggerIntervalSeconds,
    holdSeconds?: number,
  ) => {
    if (!timing) return;
    const vizSource = runtimeSourceFromSourceId(sourceId);
    const triggerWallSec = nowWallSec + delaySeconds;
    const envelope = envelopeForSource(sliderState, vizSource, delaySeconds, envelopeIntervalSeconds);
    if (typeof holdSeconds === 'number' && Number.isFinite(holdSeconds)) {
      envelope.gateSeconds = clamp(holdSeconds, 0.02, 24);
    }
    runtimeNotes.push({
      id: `pad-runtime:${timing.phraseIndex}:${triggerWallSec.toFixed(4)}:${vizSource}:${voiceIndex}:${Math.round(midi)}:${runtimeNotes.length}`,
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
  const holdSecondsForVoice = (voice: ChordVoice, delaySeconds: number, intervalSeconds: number): number => {
    if (voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1) {
      return coreProductPadEnvelopeGateSecondsFromState(state, 'pad1', {
        triggerIntervalSeconds: intervalSeconds,
        voiceDelaySeconds: delaySeconds,
      });
    }
    if (voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2) {
      return coreProductPadEnvelopeGateSecondsFromState(state, 'pad2', {
        triggerIntervalSeconds: intervalSeconds,
        voiceDelaySeconds: delaySeconds,
      });
    }
    return coreProductSynthSequencerHoldSecondsFromState(state, voice.sourceId, 0.5);
  };

  const emitVoice = (
    voice: ChordVoice,
    delaySeconds: number,
    velocity: number,
    intervalSeconds: number,
    holdOverrideSeconds?: number,
  ) => {
    const nudgedDelaySeconds = Math.max(0, delaySeconds + chordNudgeSeconds);
    const holdSeconds = holdOverrideSeconds ?? holdSecondsForVoice(voice, nudgedDelaySeconds, intervalSeconds);
    addRuntimeNote(voice.sourceId, voice.midi, nudgedDelaySeconds, voice.voiceIndex, velocity, intervalSeconds, holdSeconds);
    scheduledNotes.push({
      delaySeconds: nudgedDelaySeconds,
      event: createCoreProductManualNoteEvent(
        voice.sourceId,
        voice.midi,
        clamp(velocity, 0.001, 1),
        holdSeconds * 1000,
        voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 || voice.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2
          ? voice.voiceIndex
          : undefined,
      ),
    });
  };

  if (voices.length === 0) return schedule;

  const emitChordSourceParams = () => {
    if (chordMorph == null && chordDistance == null) return;
    const delaySeconds = Math.max(0, chordNudgeSeconds);
    const sourceIds = Array.from(new Set(voices.map((voice) => voice.sourceId)));
    for (const sourceId of sourceIds) {
      if (chordMorph != null && CHORD_MORPH_SOURCE_IDS.has(sourceId)) {
        scheduledNotes.push({
          delaySeconds,
          event: createCoreProductParamEvent(
            KESSHO_PRODUCT_PARAM_IDS.SourceMorph,
            clamp(chordMorph, 0, 1),
            sourceId,
          ),
        });
      }
      if (chordDistance != null && CHORD_DISTANCE_SOURCE_IDS.has(sourceId)) {
        scheduledNotes.push({
          delaySeconds,
          event: createCoreProductParamEvent(
            KESSHO_PRODUCT_PARAM_IDS.SourceDistance,
            clamp(chordDistance, 0, 1),
            sourceId,
          ),
        });
      }
    }
  };

  emitChordSourceParams();

  if (config.playbackMode === 'arp') {
    const ordered = orderedChordVoicesForTokenPattern(voices);
    const pattern = config.arp.shape === 'custom'
      ? config.arp.pattern
      : synthChordArpPatternForShape(config.arp.shape, config.arp.patternLength);
    const speedSeconds = synthChordArpSpeedSeconds(state, config.arp.speed);
    const holdTicks = Math.max(1, Math.min(config.stepCount, step.holdSteps ?? 1));
    const spanSeconds = Math.max(speedSeconds, holdTicks * triggerIntervalSeconds);
    const pulseCount = clamp(Math.floor((spanSeconds + 0.0001) / speedSeconds), 1, 128);
    const holdSeconds = clamp(speedSeconds * config.arp.gate, 0.02, Math.max(0.02, speedSeconds * 0.98));
    for (let pulse = 0; pulse < pulseCount; pulse += 1) {
      const patternStep = pattern[pulse % config.arp.patternLength] ?? pattern[0];
      const voice = patternStep ? resolveArpPatternVoice(ordered, patternStep) : null;
      if (!voice) continue;
      emitVoice(voice, pulse * speedSeconds, voice.velocity, speedSeconds, holdSeconds);
    }
    return schedule;
  }

  if (config.playbackMode === 'strum') {
    const direction = config.strum.direction === 'upDown'
      ? (absoluteTickIndex % 2 === 0 ? 'up' : 'down')
      : config.strum.direction === 'downUp'
        ? (absoluteTickIndex % 2 === 0 ? 'down' : 'up')
        : config.strum.direction;
    const ordered = orderedChordVoices(voices, direction, rng);
    const spreadSeconds = config.strum.spreadMs / 1000;
    const denom = Math.max(1, ordered.length - 1);
    const holdTicks = Math.max(1, Math.min(config.stepCount, step.holdSteps ?? 1));
    const holdSpanSeconds = holdTicks * triggerIntervalSeconds;
    for (let index = 0; index < ordered.length; index += 1) {
      const voice = ordered[index]!;
      const linear = index / denom;
      const curved = config.strum.curve >= 0
        ? Math.pow(linear, 1 + config.strum.curve * 2)
        : 1 - Math.pow(1 - linear, 1 + Math.abs(config.strum.curve) * 2);
      const velocity = clamp(voice.velocity * (1 - config.strum.velocityFalloff * linear), 0.001, 1);
      const delaySeconds = curved * spreadSeconds;
      const holdSeconds = Math.max(0.02, holdSpanSeconds - delaySeconds) * config.strum.gate;
      emitVoice(voice, delaySeconds, velocity, triggerIntervalSeconds, holdSeconds);
    }
    return schedule;
  }

  const holdTicks = Math.max(1, Math.min(config.stepCount, step.holdSteps ?? 1));
  const holdSpanSeconds = holdTicks * triggerIntervalSeconds;
  for (const voice of voices) {
    const holdSeconds = Math.max(0.02, holdSpanSeconds - voice.baseDelaySeconds);
    emitVoice(voice, voice.baseDelaySeconds, voice.velocity, triggerIntervalSeconds, holdSeconds);
  }
  return schedule;
}

function orderedChordVoicesForTokenPattern(voices: readonly ChordVoice[]): ChordVoice[] {
  return [...voices].sort((left, right) => left.midi - right.midi || left.voiceIndex - right.voiceIndex);
}

function resolveArpPatternVoice(
  ordered: readonly ChordVoice[],
  step: SynthChordSequencerArpPatternStep,
): ChordVoice | null {
  if (!step.active || ordered.length === 0) return null;
  const zeroTone = Math.max(0, Math.round(step.tone) - 1);
  const baseVoice = ordered[zeroTone % ordered.length] ?? ordered[0];
  if (!baseVoice) return null;
  const wrapOctave = Math.floor(zeroTone / ordered.length);
  const octaveShift = (wrapOctave + step.octave) * 12;
  return {
    ...baseVoice,
    midi: clamp(baseVoice.midi + octaveShift, 0, 127),
  };
}
