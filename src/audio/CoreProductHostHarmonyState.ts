import { createHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { chordIntervalSecondsFromState } from './chordPhraseTiming';
import { computeGranularRuntimeSeed, getUtcBucket } from './rng';
import { getPhraseDurationForClockSource } from './transport';
import { getScaleByName, midiToFreq } from './scales';
import { canonicalProgressionIndexAtPosition, sanitizeHarmonyProgression } from './CoreProductHarmonyControl';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import type { SliderState } from '../ui/state';

type SeedWindow = 'hour' | 'day';

export type CoreProductHostHarmonySnapshot = {
  harmonyState: HarmonyState | null;
  currentBucket: string;
  currentSeed: number;
  signature: string;
};

const PRODUCT_SCALE_NAMES_BY_ID = new Map<number, string>([
  [1, 'Major (Ionian)'],
  [2, 'Aeolian'],
  [3, 'Major Pentatonic'],
  [4, 'Octatonic Half-Whole'],
  [5, 'Lydian'],
  [6, 'Mixolydian'],
  [7, 'Minor Pentatonic'],
  [8, 'Dorian'],
  [9, 'Harmonic Minor'],
  [10, 'Melodic Minor'],
  [11, 'Phrygian Dominant'],
]);

const COF_SEQUENCE: readonly number[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteInteger(value: unknown, fallback: number): number {
  return Math.round(finiteNumber(value, fallback));
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function seedWindowFromState(state: Record<string, unknown>): SeedWindow {
  return state.seedWindow === 'day' ? 'day' : 'hour';
}

function rootNoteFromMidi(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function cofStepBetween(homeRoot: number, effectiveRoot: number): number {
  const homeIndex = COF_SEQUENCE.indexOf(rootNoteFromMidi(homeRoot));
  const effectiveIndex = COF_SEQUENCE.indexOf(rootNoteFromMidi(effectiveRoot));
  if (homeIndex < 0 || effectiveIndex < 0) return 0;
  const clockwise = (effectiveIndex - homeIndex + 12) % 12;
  return clockwise <= 6 ? clockwise : clockwise - 12;
}

function scaleNameFromProductId(scaleId: unknown): string | null {
  if (typeof scaleId !== 'number' || !Number.isFinite(scaleId)) return null;
  return PRODUCT_SCALE_NAMES_BY_ID.get(Math.round(scaleId)) ?? null;
}

function harmonyParamsFromState(state: Record<string, unknown>): Partial<HarmonyParams> {
  return {
    cofDriftEnabled: boolValue(state.cofDriftEnabled, false),
    cofDriftRate: finiteNumber(state.cofDriftRate, 2),
    cofDriftDirection: state.cofDriftDirection === 'ccw' || state.cofDriftDirection === 'random' ? state.cofDriftDirection : 'cw',
    cofDriftRange: finiteNumber(state.cofDriftRange, 3),
    chordProgressionEnabled: false,
    chordProgressionPattern: [0, 3, 4, 0],
    chordProgressionSteps: 4,
    chordProgressionStepEnabled: [true, true, true, true],
    chordProgressionPhraseMultiplier: 1,
    canonicalProgression: sanitizeHarmonyProgression(state.harmonyProgression),
    transportBarsPerPhrase: finiteInteger(state.transportBarsPerPhrase, 4),
  };
}

function phraseSecondsFromState(state: Record<string, unknown>): number {
  const source = state.harmonyClockSource === 'localBeat' || state.harmonyClockSource === 'localPhrase' || state.harmonyClockSource === 'globalBeat'
    ? state.harmonyClockSource
    : 'globalPhrase';
  return getPhraseDurationForClockSource(state as Partial<SliderState>, source);
}

function telemetryChordMidi(telemetry: CoreProductTelemetrySnapshot | null | undefined): number[] | null {
  const notes = telemetry?.harmonyChordMidi;
  if (!Array.isArray(notes)) return null;
  const midi = notes.filter((note) => typeof note === 'number' && Number.isFinite(note) && note > 0);
  return midi.length > 0 ? midi : null;
}

export function createCoreProductHostHarmonySnapshot(
  state: Record<string, unknown> | null | undefined,
  telemetry?: CoreProductTelemetrySnapshot | null,
): CoreProductHostHarmonySnapshot {
  if (!state) {
    return { harmonyState: null, currentBucket: '', currentSeed: 0, signature: 'none' };
  }

  const seedWindow = seedWindowFromState(state);
  const currentBucket = getUtcBucket(seedWindow);
  const currentSeed = computeGranularRuntimeSeed(currentBucket);
  const telemetryScaleName = scaleNameFromProductId(telemetry?.harmonyScaleId);
  const manualScale = telemetryScaleName ?? stringValue(state.manualScale, 'Major (Ionian)');
  const homeRoot = finiteInteger(state.rootNote, 4);
  const telemetryRoot = typeof telemetry?.harmonyRootMidi === 'number' && Number.isFinite(telemetry.harmonyRootMidi)
    ? rootNoteFromMidi(telemetry.harmonyRootMidi)
    : null;
  const rootNote = telemetryRoot ?? homeRoot;
  const tension = finiteNumber(telemetry?.harmonyTension, finiteNumber(state.tension, 0.3));
  const phraseSeconds = phraseSecondsFromState(state);
  const harmonyParams = harmonyParamsFromState(state);
  const harmonyState = createHarmonyState(
    `${currentBucket}|E_ROOT`,
    tension,
    chordIntervalSecondsFromState(state.chordRate, phraseSeconds),
    finiteNumber(state.voicingSpread, 0.5),
    finiteNumber(state.detune, 8),
    telemetryScaleName ? 'manual' : (state.scaleMode === 'manual' ? 'manual' : 'auto'),
    manualScale,
    rootNote,
    phraseSeconds,
    harmonyParams,
  );
  const canonical = harmonyParams.canonicalProgression;
  const barsPerPhrase = finiteNumber(telemetry?.transportBarsPerPhrase, finiteNumber(state.transportBarsPerPhrase, 4));
  if (canonical && (telemetry?.barIndex !== undefined || telemetry?.phraseIndex !== undefined)) {
    const step = canonicalProgressionIndexAtPosition(canonical, {
      absoluteBarIndex: telemetry?.barIndex,
      phraseIndex: telemetry?.phraseIndex,
      barsPerPhrase,
    });
    harmonyState.progression = {
      ...harmonyState.progression,
      step,
      pattern: canonical.events.map((event) => event.source.type === 'slot' ? event.source.slotId % 7 : 0),
      stepEnabled: canonical.events.map(() => true),
      phraseMultiplier: 1,
      phraseCounter: 0,
    };
  }

  const scaleFamily = telemetryScaleName ? getScaleByName(telemetryScaleName) ?? harmonyState.scaleFamily : harmonyState.scaleFamily;
  const midiNotes = telemetryChordMidi(telemetry);
  const currentChord = midiNotes
    ? { midiNotes, frequencies: midiNotes.map(midiToFreq) }
    : harmonyState.currentChord;
  const effectiveRoot = telemetryRoot ?? harmonyState.effectiveRoot;
  const resolved: HarmonyState = {
    ...harmonyState,
    scaleFamily,
    currentChord,
    chordDegrees: currentChord.midiNotes.map((note) => rootNoteFromMidi(note)),
    chordTension: (tension % 0.5) * 2,
    scaleTension: tension,
    currentDegree: finiteInteger(telemetry?.harmonyChordDegree, harmonyState.currentDegree),
    effectiveRoot,
    cof: {
      ...harmonyState.cof,
      homeRoot,
      currentStep: telemetryRoot === null ? harmonyState.cof.currentStep : cofStepBetween(homeRoot, telemetryRoot),
    },
  };
  const signature = [
    currentBucket,
    currentSeed,
    resolved.effectiveRoot,
    resolved.scaleFamily.name,
    resolved.scaleTension.toFixed(4),
    resolved.chordTension.toFixed(4),
    resolved.currentDegree,
    resolved.currentChord.midiNotes.map((note) => note.toFixed(3)).join(','),
    telemetry?.barIndex ?? '',
    telemetry?.phraseIndex ?? '',
  ].join('|');

  return { harmonyState: resolved, currentBucket, currentSeed, signature };
}
