import {
  applyLeadDistanceEnvelope,
  getVoiceDistanceValue,
} from './distanceMacro';
import { createHarmonyState, getEffectiveTension, updateHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { chordIntervalSecondsFromState } from './chordPhraseTiming';
import { sampleSlotEnabledForPlayback } from './coreProductSourcePlayability';
import { createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange } from './scales';
import { getPhraseDurationForClockSource } from './transport';
import { harmonySeedMaterialFromState } from './harmonySeedMaterial';
import type {
  SimpleSequencerPhrasePreview,
  SimpleSequencerVizEnvelope,
  SimpleSequencerVizNote,
  SimpleSequencerVizSource,
} from './simpleSequencerRuntimePlan';
import type { LeadRandomSource, SliderState } from '../ui/state';

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

function sampleEnvelope(state: SliderState, source: 'sample1' | 'sample2'): SimpleSequencerVizEnvelope {
  const record = state as unknown as Record<string, unknown>;
  const prefix = source;
  return {
    attack: boundedNumber(record[`${prefix}AttackMs`], source === 'sample1' ? 5 : 25, 0, 5000) / 1000,
    decay: 0.02,
    sustain: 1,
    gateSeconds: 0.35,
    release: boundedNumber(record[`${prefix}ReleaseMs`], source === 'sample1' ? 120 : 350, 0, 10000) / 1000,
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
  return sampleEnvelope(state, source);
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

function randomTimingSource(state: SliderState): LeadRandomSource {
  const source = (state as unknown as Record<string, unknown>).leadRandomSource;
  if (source === 'pad1') return 'pad1';
  if (source === 'pad2') return 'pad2';
  if (source === 'lead2') return 'lead2';
  if (source === 'sample1') return 'sample1';
  if (source === 'sample2') return 'sample2';
  return 'lead1';
}

function isRandomTimingEnabled(state: SliderState): boolean {
  const record = state as unknown as Record<string, unknown>;
  if (!booleanValue(record.leadRandomEnabled, false)) return false;
  const source = randomTimingSource(state);
  if (source === 'pad1') return booleanValue(record.padEnabled, false);
  if (source === 'pad2') return booleanValue(record.pad2Enabled, false);
  if (source === 'lead2') return booleanValue(record.lead2Enabled, false);
  if (source === 'sample1') return sampleSlotEnabledForPlayback(record, 'sample1');
  if (source === 'sample2') return sampleSlotEnabledForPlayback(record, 'sample2');
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
  const octaveOffset = boundedInteger((state as unknown as Record<string, unknown>).lead1Octave, 1, -4, 4);
  const octaveRange = boundedInteger((state as unknown as Record<string, unknown>).lead1OctaveRange, 2, 1, 4);
  const baseLow = 64 + octaveOffset * 12;
  const baseHigh = baseLow + octaveRange * 12;
  const rangeMinMidi = Math.max(24, baseLow);
  const rangeMaxMidi = Math.min(127, baseHigh);
  if (!enabled) {
    return {
      kind: 'randomTiming',
      enabled: false,
      phraseSeconds,
      triggerIntervalSeconds: phraseSeconds,
      notes: [],
      minMidi: rangeMinMidi,
      maxMidi: rangeMaxMidi,
      rangeMinMidi,
      rangeMaxMidi,
      key: `randomTiming:off:${phraseSeconds.toFixed(3)}:${rangeMinMidi}:${rangeMaxMidi}`,
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
    Math.min(127, baseHigh),
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
  const range = previewRange(notes, rangeMinMidi, rangeMaxMidi);
  return {
    kind: 'randomTiming',
    enabled,
    phraseSeconds,
    triggerIntervalSeconds: phraseSeconds,
    notes,
    ...range,
    rangeMinMidi,
    rangeMaxMidi,
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
