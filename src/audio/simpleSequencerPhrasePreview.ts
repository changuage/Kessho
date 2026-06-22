import {
  applyLeadDistanceEnvelope,
  applyPianoDistanceEnvelope,
  getVoiceDistanceValue,
} from './distanceMacro';
import { createHarmonyState, getEffectiveTension, updateHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { chordIntervalSecondsFromState, resolveChordsPerPhrase } from './chordPhraseTiming';
import {
  enabledChordMidiForMask,
  enabledVoiceRank,
  padChordVoiceMasksForSource,
  padEuclidOwnedVoiceMask,
  PAD_VOICE_COUNT,
} from './coreProductArrangementVoiceMapping';
import { createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange } from './scales';
import { getPhraseDurationForClockSource } from './transport';
import { harmonySeedMaterialFromState } from './harmonySeedMaterial';
import { HARMONY_SLOT_COUNT } from './CoreProductHarmonyControl';
import {
  createSynthChordSlotResolutionContext,
  resolveSynthChordStepMidiPool,
  sanitizeSynthChordSequencerConfig,
  synthChordArpSpeedSeconds,
  synthChordSequencerTriggerOrdinalForTick,
  synthChordSequencerStepForTick,
  synthChordSubLaneValue,
  ticksUntilNextEnabledSynthChordStep,
  type SynthChordSequencerArpOrder,
  type SynthChordSequencerConfig,
  type SynthChordSequencerStrumDirection,
} from './synthChordSequencer';
import type {
  SimpleSequencerPhrasePreview,
  SimpleSequencerVizEnvelope,
  SimpleSequencerVizNote,
  SimpleSequencerVizSource,
} from './simpleSequencerRuntimePlan';
import type { SliderState } from '../ui/state';

export type {
  SimpleSequencerPhrasePreview,
  SimpleSequencerVizEnvelope,
  SimpleSequencerVizKind,
  SimpleSequencerVizNote,
  SimpleSequencerVizSource,
} from './simpleSequencerRuntimePlan';

const PAD_ENVELOPE_SAFETY_SECONDS = 0.05;
const DEFAULT_NOTE_MIN = 48;
const DEFAULT_NOTE_MAX = 72;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(finiteNumber(value, fallback), min, max);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function midiNoteLabel(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rounded = Math.round(clamp(midi, 0, 127));
  const name = names[((rounded % 12) + 12) % 12] ?? 'C';
  return `${name}${Math.floor(rounded / 12) - 1}`;
}

function getSeedWindow(state: SliderState): 'hour' | 'day' {
  return state.seedWindow === 'day' ? 'day' : 'hour';
}

function harmonyParamsFromState(state: SliderState): Partial<HarmonyParams> {
  return {
    cofDriftEnabled: state.cofDriftEnabled ?? false,
    cofDriftRate: state.cofDriftRate ?? 2,
    cofDriftDirection: state.cofDriftDirection ?? 'cw',
    cofDriftRange: state.cofDriftRange ?? 3,
    chordProgressionEnabled: state.chordProgressionEnabled ?? false,
    chordProgressionPattern: state.chordProgressionPattern ?? [0, 3, 4, 0],
    chordProgressionSteps: state.chordProgressionSteps ?? 4,
    chordProgressionStepEnabled: state.chordProgressionStepEnabled ?? [true, true, true, true],
    chordProgressionPhraseMultiplier: state.chordProgressionPhraseMultiplier ?? 1,
  };
}

function corePreviewHarmonySeedMaterial(state: SliderState): string {
  return harmonySeedMaterialFromState(state);
}

function createPreviewHarmonyState(state: SliderState): HarmonyState {
  const phraseSeconds = getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
  const chordIntervalSeconds = chordIntervalSecondsFromState(state.chordRate, phraseSeconds);
  return createHarmonyState(
    corePreviewHarmonySeedMaterial(state),
    boundedNumber(state.tension, 0.3, 0, 1),
    chordIntervalSeconds,
    boundedNumber(state.voicingSpread, 0.5, 0, 1),
    boundedNumber(state.detune, 8, 0, 50),
    state.scaleMode === 'manual' ? 'manual' : 'auto',
    typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)',
    boundedInteger(state.rootNote, 4, 0, 11),
    phraseSeconds,
    harmonyParamsFromState(state),
  );
}

function chordTicksPerPhrase(state: SliderState, phraseSeconds: number): number {
  return resolveChordsPerPhrase(state.chordRate, phraseSeconds);
}

function harmonyAtTick(state: SliderState, targetTick: number, ticksPerPhrase: number): HarmonyState {
  let harmonyState = createPreviewHarmonyState(state);
  const phraseSeconds = getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
  const seed = corePreviewHarmonySeedMaterial(state);
  for (let tickIndex = 1; tickIndex <= targetTick; tickIndex += 1) {
    const phraseIndex = Math.floor(tickIndex / Math.max(1, ticksPerPhrase));
    const isPhraseBoundary = tickIndex % Math.max(1, ticksPerPhrase) === 0;
    harmonyState = updateHarmonyState(
      harmonyState,
      seed,
      phraseIndex,
      boundedNumber(state.tension, 0.3, 0, 1),
      chordIntervalSecondsFromState(state.chordRate, phraseSeconds),
      boundedNumber(state.voicingSpread, 0.5, 0, 1),
      boundedNumber(state.detune, 8, 0, 50),
      state.scaleMode === 'manual' ? 'manual' : 'auto',
      typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)',
      boundedInteger(state.rootNote, 4, 0, 11),
      phraseSeconds,
      harmonyParamsFromState(state),
      phraseIndex,
      isPhraseBoundary,
    );
  }
  return harmonyState;
}

function padVoiceDelays(state: SliderState, absoluteChordIndex: number, triggerIntervalSeconds: number): number[] {
  const bucket = getUtcBucket(getSeedWindow(state));
  const rng = createRng(`${bucket}|E_ROOT`);
  for (let skip = 0; skip < absoluteChordIndex * PAD_VOICE_COUNT; skip += 1) {
    rng();
  }
  const waveSpreadSeconds = boundedNumber(state.waveSpread, 0.125, 0, 1) * triggerIntervalSeconds;
  return Array.from({ length: PAD_VOICE_COUNT }, () => rng() * waveSpreadSeconds).sort((a, b) => a - b);
}

function orderedChordNotes(
  notes: readonly SimpleSequencerVizNote[],
  order: SynthChordSequencerArpOrder | SynthChordSequencerStrumDirection,
): SimpleSequencerVizNote[] {
  const up = [...notes].sort((left, right) => left.midi - right.midi || (left.voiceIndex ?? 0) - (right.voiceIndex ?? 0));
  if (order === 'up') return up;
  if (order === 'down') return [...up].reverse();
  if (order === 'random') {
    return up.map((note, index) => ({
      note,
      key: Math.sin((Math.round(note.midi) + 1) * 12.9898 + (index + 1) * 78.233),
    })).sort((left, right) => left.key - right.key).map((entry) => entry.note);
  }
  if (order === 'outsideIn') {
    const result: SimpleSequencerVizNote[] = [];
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
    const result: SimpleSequencerVizNote[] = [];
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

function padEnvelope(state: SliderState, source: 'pad1' | 'pad2', voiceDelaySeconds: number, triggerIntervalSeconds: number): SimpleSequencerVizEnvelope {
  const record = state as unknown as Record<string, unknown>;
  const isPad2 = source === 'pad2';
  const attack = boundedNumber(record[isPad2 ? 'pad2Attack' : 'synthAttack'], 6, 0.001, 16);
  const decay = boundedNumber(record[isPad2 ? 'pad2Decay' : 'synthDecay'], 1, 0.01, 8);
  const sustain = boundedNumber(record[isPad2 ? 'pad2Sustain' : 'synthSustain'], 0.7, 0, 1);
  const requestedHold = boundedNumber(record[isPad2 ? 'pad2Hold' : 'synthHold'], 1, 0, 20);
  const release = boundedNumber(record[isPad2 ? 'pad2Release' : 'synthRelease'], 12, 0.01, 30);
  const fit = booleanValue(record[isPad2 ? 'pad2FitEnvelopeToChord' : 'padFitEnvelopeToChord'], true);
  let hold = requestedHold;
  if (fit) {
    const availableSeconds = triggerIntervalSeconds - voiceDelaySeconds - PAD_ENVELOPE_SAFETY_SECONDS;
    const maxHold = availableSeconds - attack - decay - release;
    hold = clamp(requestedHold, 0, Math.max(0, maxHold));
  }
  return {
    attack,
    decay,
    sustain,
    gateSeconds: clamp(attack + decay + hold, 0.02, 20),
    release,
  };
}

function leadEnvelope(state: SliderState, source: 'lead1' | 'lead2'): SimpleSequencerVizEnvelope {
  const record = state as unknown as Record<string, unknown>;
  const isLead2 = source === 'lead2';
  const attack = boundedNumber(record[isLead2 ? 'lead2Attack' : 'lead1Attack'], 0.01, 0.001, 16);
  const decay = boundedNumber(record[isLead2 ? 'lead2Decay' : 'lead1Decay'], 0.8, 0.01, 8);
  const sustain = boundedNumber(record[isLead2 ? 'lead2Sustain' : 'lead1Sustain'], 0.3, 0, 1);
  const hold = boundedNumber(record[isLead2 ? 'lead2Hold' : 'lead1Hold'], 0.5, 0, 20);
  const release = boundedNumber(record[isLead2 ? 'lead2Release' : 'lead1Release'], 2, 0.01, 30);
  const distance = getVoiceDistanceValue(state, source);
  const shaped = applyLeadDistanceEnvelope(source, { attack, decay, sustain, hold, release }, distance);
  return {
    attack: shaped.attack,
    decay: shaped.decay,
    sustain: shaped.sustain,
    gateSeconds: clamp(shaped.attack + shaped.decay + (shaped.hold ?? hold), 0.02, 44),
    release: shaped.release,
  };
}

function pianoEnvelope(state: SliderState): SimpleSequencerVizEnvelope {
  const record = state as unknown as Record<string, unknown>;
  const attack = boundedNumber(record.pianoAttack, 0.005, 0.001, 2);
  const decay = boundedNumber(record.pianoDecay, 0.65, 0.01, 4);
  const sustain = boundedNumber(record.pianoSustain, 0.35, 0, 1);
  const hold = boundedNumber(record.pianoHold, 0.2, 0, 4);
  const release = boundedNumber(record.pianoRelease, 1.2, 0.01, 8);
  const distance = getVoiceDistanceValue(state, 'piano');
  const shaped = applyPianoDistanceEnvelope({ attack, decay, sustain, hold, release }, distance);
  return {
    attack: shaped.attack,
    decay: shaped.decay,
    sustain: shaped.sustain,
    gateSeconds: shaped.hold ?? hold,
    release: shaped.release,
  };
}

export function envelopeForSource(
  state: SliderState,
  source: SimpleSequencerVizSource,
  voiceDelaySeconds: number,
  triggerIntervalSeconds: number,
): SimpleSequencerVizEnvelope {
  if (source === 'pad1' || source === 'pad2') return padEnvelope(state, source, voiceDelaySeconds, triggerIntervalSeconds);
  if (source === 'lead1' || source === 'lead2') return leadEnvelope(state, source);
  return pianoEnvelope(state);
}

function padChordSource(state: SliderState): string {
  return String((state as unknown as Record<string, unknown>).synthChordSequencerSource ?? 'piano').trim().toLowerCase();
}

function createPadChordTickNotes(
  state: SliderState,
  phraseTickIndex: number,
  absoluteTickIndex: number,
  triggerIntervalSeconds: number,
  chordMidi: readonly number[],
  config: SynthChordSequencerConfig,
): SimpleSequencerVizNote[] {
  const record = state as unknown as Record<string, unknown>;
  const source = padChordSource(state);
  const voiceCount = boundedInteger(record.synthChordSequencerVoiceCount, 6, 1, PAD_VOICE_COUNT);
  const octaveShift = boundedInteger(record.synthOctave, 0, -2, 2) * 12;
  const chordTriggerOrdinal = synthChordSequencerTriggerOrdinalForTick(config, absoluteTickIndex);
  const velocityScale = clamp(synthChordSubLaneValue(config, 'expression', chordTriggerOrdinal) ?? 1, 0.001, 1);
  const nudgeSeconds = clamp(synthChordSubLaneValue(config, 'nudge', chordTriggerOrdinal) ?? 0, -1, 1) * triggerIntervalSeconds * 0.45;
  const midiPool = chordMidi.length > 0
    ? chordMidi.map((midi) => clamp(midi + octaveShift, 0, 127))
    : [clamp(48 + boundedInteger(record.rootNote, 4, 0, 11) + octaveShift, 0, 127)];
  const delays = padVoiceDelays(state, absoluteTickIndex, triggerIntervalSeconds);
  const tickStartSeconds = Math.max(0, phraseTickIndex * triggerIntervalSeconds + nudgeSeconds);
  const notes: SimpleSequencerVizNote[] = [];

  const nonPadSource: SimpleSequencerVizSource | null =
    source === 'lead1' || source === 'lead' ? 'lead1'
      : source === 'lead2' ? 'lead2'
        : source === 'piano' ? 'piano'
          : null;
  if (nonPadSource) {
    for (let index = 0; index < voiceCount; index += 1) {
      const midi = midiPool[index % midiPool.length] ?? 60;
      const delay = delays[index] ?? 0;
      notes.push({
        id: `pad-chord:${absoluteTickIndex}:${nonPadSource}:${index}`,
        source: nonPadSource,
        midi,
        label: midiNoteLabel(midi),
        voiceIndex: index,
        triggerSeconds: tickStartSeconds + delay,
        velocity: velocityScale,
        envelope: envelopeForSource(state, nonPadSource, delay, triggerIntervalSeconds),
      });
    }
  }
  if (!nonPadSource) {
    const maskLimit = (1 << PAD_VOICE_COUNT) - 1;
    const rawVoiceMask = boundedInteger(record.synthVoiceMask, 63, 0, maskLimit) & maskLimit;
    const euclidOwnedMask = padEuclidOwnedVoiceMask(record);
    const availablePadMask = rawVoiceMask & ~euclidOwnedMask;
    const pad2Assign = boundedInteger(record.pad2VoiceAssign, 0, 0, maskLimit) & maskLimit;
    const { pad1Mask, pad2Mask } = padChordVoiceMasksForSource(source, availablePadMask, pad2Assign, voiceCount);
    const pad1ChordMidi = enabledChordMidiForMask(midiPool, pad1Mask);
    const pad2ChordMidi = enabledChordMidiForMask(midiPool, pad2Mask);

    for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
      const bit = 1 << voiceIndex;
      const delay = delays[voiceIndex] ?? 0;
      if ((pad1Mask & bit) !== 0) {
        const enabledIndex = enabledVoiceRank(pad1Mask, voiceIndex);
        const midi = pad1ChordMidi[enabledIndex % pad1ChordMidi.length] ?? midiPool[0] ?? 60;
        notes.push({
          id: `pad-chord:${absoluteTickIndex}:pad1:${voiceIndex}`,
          source: 'pad1',
          midi,
          label: midiNoteLabel(midi),
          voiceIndex,
          triggerSeconds: tickStartSeconds + delay,
          velocity: velocityScale,
          envelope: envelopeForSource(state, 'pad1', delay, triggerIntervalSeconds),
        });
      }
      if ((pad2Mask & bit) !== 0) {
        const enabledIndex = enabledVoiceRank(pad2Mask, voiceIndex);
        const midi = pad2ChordMidi[enabledIndex % pad2ChordMidi.length] ?? midiPool[0] ?? 60;
        notes.push({
          id: `pad-chord:${absoluteTickIndex}:pad2:${voiceIndex}`,
          source: 'pad2',
          midi,
          label: midiNoteLabel(midi),
          voiceIndex,
          triggerSeconds: tickStartSeconds + delay,
          velocity: velocityScale,
          envelope: envelopeForSource(state, 'pad2', delay, triggerIntervalSeconds),
        });
      }
    }
  }

  if (notes.length === 0 || config.playbackMode === 'chord') {
    return notes.sort((left, right) => left.triggerSeconds - right.triggerSeconds || left.midi - right.midi);
  }

  if (config.playbackMode === 'arp') {
    const ordered = orderedChordNotes(notes, config.arp.order);
    const speedSeconds = synthChordArpSpeedSeconds(record, config.arp.speed);
    const heldTicks = config.arp.hold === 'untilNextTrigger'
      ? ticksUntilNextEnabledSynthChordStep(config, absoluteTickIndex)
      : 1;
    const spanSeconds = clamp(heldTicks * triggerIntervalSeconds, speedSeconds, triggerIntervalSeconds * config.stepCount);
    const pulseCount = clamp(Math.floor((spanSeconds + 0.0001) / speedSeconds), 1, 128);
    const gateSeconds = clamp(speedSeconds * config.arp.gate, 0.02, Math.max(0.02, speedSeconds * 0.98));
    return Array.from({ length: pulseCount }, (_, pulse) => {
      const sourceNote = ordered[pulse % ordered.length] ?? ordered[0]!;
      return {
        ...sourceNote,
        id: `${sourceNote.id}:arp:${pulse}`,
        triggerSeconds: tickStartSeconds + pulse * speedSeconds,
        envelope: {
          ...sourceNote.envelope,
          gateSeconds,
        },
      };
    });
  }

  const direction = config.strum.direction === 'upDown'
    ? (absoluteTickIndex % 2 === 0 ? 'up' : 'down')
    : config.strum.direction === 'downUp'
      ? (absoluteTickIndex % 2 === 0 ? 'down' : 'up')
      : config.strum.direction;
  const ordered = orderedChordNotes(notes, direction);
  const spreadSeconds = config.strum.spreadMs / 1000;
  const denom = Math.max(1, ordered.length - 1);
  return ordered.map((note, index) => {
    const linear = index / denom;
    const curved = config.strum.curve >= 0
      ? Math.pow(linear, 1 + config.strum.curve * 2)
      : 1 - Math.pow(1 - linear, 1 + Math.abs(config.strum.curve) * 2);
    return {
      ...note,
      id: `${note.id}:strum:${index}`,
      triggerSeconds: tickStartSeconds + curved * spreadSeconds,
      velocity: clamp(note.velocity * (1 - config.strum.velocityFalloff * linear), 0.001, 1),
      envelope: {
        ...note.envelope,
        gateSeconds: note.envelope.gateSeconds * config.strum.gate,
      },
    };
  }).sort((left, right) => left.triggerSeconds - right.triggerSeconds || left.midi - right.midi);

  return notes.sort((left, right) => left.triggerSeconds - right.triggerSeconds || left.midi - right.midi);
}

export function previewRange(notes: readonly SimpleSequencerVizNote[], fallbackMin = DEFAULT_NOTE_MIN, fallbackMax = DEFAULT_NOTE_MAX): { minMidi: number; maxMidi: number } {
  if (notes.length === 0) return { minMidi: fallbackMin, maxMidi: fallbackMax };
  const midiValues = notes.map((note) => note.midi);
  const min = Math.min(...midiValues);
  const max = Math.max(...midiValues);
  const pad = Math.max(1, Math.round((max - min) * 0.12));
  return {
    minMidi: clamp(min - pad, 0, 127),
    maxMidi: clamp(max + pad, 1, 128),
  };
}

export function createPadChordPhrasePreview(state: SliderState, phraseIndex = 0): SimpleSequencerPhrasePreview {
  const phraseSeconds = getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
  const ticksPerPhrase = chordTicksPerPhrase(state, phraseSeconds);
  const triggerIntervalSeconds = phraseSeconds / Math.max(1, ticksPerPhrase);
  const enabled = (state as unknown as Record<string, unknown>).synthChordSequencerEnabled === true;
  if (!enabled) {
    return {
      kind: 'padChord',
      enabled: false,
      phraseSeconds,
      triggerIntervalSeconds,
      notes: [],
      minMidi: DEFAULT_NOTE_MIN,
      maxMidi: DEFAULT_NOTE_MAX,
      key: `padChord:off:${phraseSeconds.toFixed(3)}`,
    };
  }

  const safePhraseIndex = Math.max(0, Math.round(phraseIndex));
  const startTick = safePhraseIndex * ticksPerPhrase;
  const config = sanitizeSynthChordSequencerConfig((state as unknown as Record<string, unknown>).synthChordSequencer);
  const notes: SimpleSequencerVizNote[] = [];
  for (let phraseTick = 0; phraseTick < ticksPerPhrase; phraseTick += 1) {
    const absoluteTick = startTick + phraseTick;
    const step = synthChordSequencerStepForTick(config, absoluteTick);
    if (!step.enabled || step.probability <= 0) continue;
    const harmonyState = harmonyAtTick(state, absoluteTick, ticksPerPhrase);
    const slotContext = createSynthChordSlotResolutionContext(state as unknown as Record<string, unknown>, harmonyState);
    const chordTriggerOrdinal = synthChordSequencerTriggerOrdinalForTick(config, absoluteTick);
    const chordSlotValue = synthChordSubLaneValue(config, 'chord', chordTriggerOrdinal);
    const resolvedStep = {
      ...step,
      slotId: chordSlotValue == null ? step.slotId : clamp(Math.round(chordSlotValue) - 1, 0, HARMONY_SLOT_COUNT - 1),
    };
    const chordMidi = resolveSynthChordStepMidiPool({
      step: resolvedStep,
      context: slotContext,
      fallbackMidi: harmonyState.currentChord.midiNotes,
    });
    notes.push(...createPadChordTickNotes(
      state,
      phraseTick,
      absoluteTick,
      triggerIntervalSeconds,
      chordMidi.length > 0 ? chordMidi : harmonyState.currentChord.midiNotes,
      config,
    ));
  }
  const range = previewRange(notes);
  return {
    kind: 'padChord',
    enabled,
    phraseSeconds,
    triggerIntervalSeconds,
    notes,
    ...range,
    key: `padChord:${safePhraseIndex}:${phraseSeconds.toFixed(3)}:${triggerIntervalSeconds.toFixed(3)}:${notes.map((note) => `${note.id}:${note.midi}:${note.triggerSeconds.toFixed(3)}`).join('|')}`,
  };
}

function randomTimingSource(state: SliderState): 'lead1' | 'lead2' | 'piano' {
  const source = (state as unknown as Record<string, unknown>).leadRandomSource;
  return source === 'lead2' || source === 'piano' ? source : 'lead1';
}

function isRandomTimingEnabled(state: SliderState): boolean {
  const record = state as unknown as Record<string, unknown>;
  if (!booleanValue(record.leadRandomEnabled, false)) return false;
  const source = randomTimingSource(state);
  if (source === 'lead2') return booleanValue(record.lead2Enabled, false);
  if (source === 'piano') return booleanValue(record.pianoEnabled, false);
  return booleanValue(record.leadEnabled, false);
}

function pickChordWeightedNote(
  rng: () => number,
  availableNotes: readonly number[],
  chordMidiNotes: readonly number[] | undefined,
  chordBias: number,
): number {
  if (availableNotes.length === 0) return 60;
  if (!chordMidiNotes || chordMidiNotes.length === 0 || availableNotes.length <= 1) {
    return availableNotes[Math.floor(rng() * availableNotes.length)] ?? availableNotes[0] ?? 60;
  }
  const chordPitchClasses = new Set(chordMidiNotes.map((note) => ((note % 12) + 12) % 12));
  const chordTones = availableNotes.filter((note) => chordPitchClasses.has(((note % 12) + 12) % 12));
  const passingTones = availableNotes.filter((note) => !chordPitchClasses.has(((note % 12) + 12) % 12));
  if (chordTones.length === 0) {
    return availableNotes[Math.floor(rng() * availableNotes.length)] ?? availableNotes[0] ?? 60;
  }
  if (passingTones.length === 0 || rng() < chordBias) {
    return chordTones[Math.floor(rng() * chordTones.length)] ?? chordTones[0] ?? 60;
  }
  return passingTones[Math.floor(rng() * passingTones.length)] ?? passingTones[0] ?? chordTones[0] ?? 60;
}

function harmonyAtRandomPhrase(state: SliderState, phraseIndex: number): HarmonyState {
  let harmonyState = createPreviewHarmonyState(state);
  const phraseSeconds = getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
  const seed = corePreviewHarmonySeedMaterial(state);
  for (let index = 1; index <= phraseIndex; index += 1) {
    harmonyState = updateHarmonyState(
      harmonyState,
      seed,
      index,
      boundedNumber(state.tension, 0.3, 0, 1),
      chordIntervalSecondsFromState(state.chordRate, phraseSeconds),
      boundedNumber(state.voicingSpread, 0.5, 0, 1),
      boundedNumber(state.detune, 8, 0, 50),
      state.scaleMode === 'manual' ? 'manual' : 'auto',
      typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)',
      boundedInteger(state.rootNote, 4, 0, 11),
      phraseSeconds,
      harmonyParamsFromState(state),
      index,
      true,
    );
  }
  return harmonyState;
}

export function createRandomTimingPhrasePreview(state: SliderState, phraseIndex = 0): SimpleSequencerPhrasePreview {
  const phraseClock = state.leadRandomClockSource ?? 'globalPhrase';
  const phraseSeconds = getPhraseDurationForClockSource(state, phraseClock);
  const source = randomTimingSource(state);
  const enabled = isRandomTimingEnabled(state);
  const octaveOffset = boundedInteger((state as unknown as Record<string, unknown>).lead1Octave, 1, -1, 2);
  const octaveRange = boundedInteger((state as unknown as Record<string, unknown>).lead1OctaveRange, 2, 1, 4);
  const baseLow = 64 + octaveOffset * 12;
  const baseHigh = baseLow + octaveRange * 12;
  if (!enabled) {
    return {
      kind: 'randomTiming',
      enabled: false,
      phraseSeconds,
      triggerIntervalSeconds: phraseSeconds,
      notes: [],
      minMidi: baseLow,
      maxMidi: baseHigh,
      rangeMinMidi: baseLow,
      rangeMaxMidi: baseHigh,
      key: `randomTiming:off:${phraseSeconds.toFixed(3)}:${baseLow}:${baseHigh}`,
    };
  }

  const record = state as unknown as Record<string, unknown>;
  const safePhraseIndex = Math.max(0, Math.round(phraseIndex));
  const bucket = getUtcBucket(getSeedWindow(state));
  const rng = createRng(`${bucket}|E_ROOT|core-lead-random|phrase:${safePhraseIndex}`);
  const harmonyState = harmonyAtRandomPhrase(state, safePhraseIndex);
  const availableNotes = getScaleNotesInRange(
    harmonyState.scaleFamily,
    Math.max(24, baseLow),
    Math.min(108, baseHigh),
    harmonyState.effectiveRoot,
  );
  const density = boundedNumber(record.lead1Density, 0.5, 0.1, 12);
  const leadTension = getEffectiveTension(
    boundedNumber(record.tension, 0.3, 0, 1),
    record.leadTensionMode === 'locked' || record.leadTensionMode === 'bypass' ? record.leadTensionMode : 'follow',
    boundedNumber(record.leadTensionValue, 0, -0.5, 0.5),
  );
  const chordBias = leadTension < 0 ? 0.9 : 0.9 - leadTension * 0.4;
  const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
  const notes: SimpleSequencerVizNote[] = [];
  for (let noteIndex = 0; noteIndex < notesThisPhrase; noteIndex += 1) {
    if (availableNotes.length === 0) continue;
    const midi = pickChordWeightedNote(rng, availableNotes, harmonyState.currentChord?.midiNotes, chordBias);
    const velocity = 0.5 + rng() * 0.4;
    const triggerSeconds = rng() * phraseSeconds;
    notes.push({
      id: `random:${safePhraseIndex}:${source}:${noteIndex}`,
      source,
      midi,
      label: midiNoteLabel(midi),
      voiceIndex: noteIndex,
      triggerSeconds,
      velocity,
      envelope: envelopeForSource(state, source, 0, phraseSeconds),
    });
  }
  notes.sort((left, right) => left.triggerSeconds - right.triggerSeconds || left.midi - right.midi);
  const range = previewRange(notes, baseLow, baseHigh);
  return {
    kind: 'randomTiming',
    enabled,
    phraseSeconds,
    triggerIntervalSeconds: phraseSeconds,
    notes,
    ...range,
    rangeMinMidi: baseLow,
    rangeMaxMidi: baseHigh,
    key: `randomTiming:${safePhraseIndex}:${phraseSeconds.toFixed(3)}:${source}:${notes.map((note) => `${note.midi}:${note.triggerSeconds.toFixed(3)}`).join('|')}`,
  };
}

export function envelopeAmplitudeAt(ageSeconds: number, envelope: SimpleSequencerVizEnvelope): number {
  if (ageSeconds < 0) return 0;
  const attack = Math.max(0.001, envelope.attack);
  const decay = Math.max(0.001, envelope.decay);
  const sustain = clamp(envelope.sustain, 0, 1);
  const gate = Math.max(0.001, envelope.gateSeconds);
  const release = Math.max(0.001, envelope.release);
  if (ageSeconds < attack) return clamp(ageSeconds / attack, 0, 1);
  if (ageSeconds < attack + decay) {
    const t = (ageSeconds - attack) / decay;
    return 1 - (1 - sustain) * clamp(t, 0, 1);
  }
  if (ageSeconds < gate) return sustain;
  if (ageSeconds < gate + release) {
    const t = (ageSeconds - gate) / release;
    return sustain * (1 - clamp(t, 0, 1));
  }
  return 0;
}
