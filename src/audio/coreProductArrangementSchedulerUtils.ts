import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { chordIntervalSecondsFromState } from './chordPhraseTiming';
import { createHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { harmonySeedMaterialFromState } from './harmonySeedMaterial';
import {
  getAnchorWallForClockSource,
  getCurrentClockIndexWall,
  getPhraseDurationForClockSource,
  resolveProgressionPhraseClockSource,
  type TransportAnchors,
} from './transport';
import type { SimpleSequencerVizSource } from './simpleSequencerPhrasePreview';
import type { PhraseClockSource, SliderState } from '../ui/state';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function numberFromState(state: Record<string, unknown>, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function boundedNumber(state: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  return clamp(numberFromState(state, key, fallback), min, max);
}

export function boundedInteger(state: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  return clamp(Math.round(numberFromState(state, key, fallback)), min, max);
}

export function booleanFromState(state: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function sliderStateFromRecord(state: Record<string, unknown>): SliderState {
  return state as unknown as SliderState;
}

export function harmonyChordIntervalSeconds(state: SliderState): number {
  const phraseLength = harmonyPhraseSeconds(state);
  return chordIntervalSecondsFromState(state.chordRate, phraseLength);
}

export function padChordTriggerIntervalSeconds(state: SliderState): number {
  return harmonyChordIntervalSeconds(state);
}

export function harmonyParamsFromState(state: SliderState): Partial<HarmonyParams> {
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

export function harmonyPhraseSeconds(state: SliderState): number {
  return getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
}

export function progressionPhraseSeconds(state: SliderState): number {
  const source = resolveProgressionPhraseClockSource(
    state.chordProgressionClockSource ?? 'harmony',
    state.harmonyClockSource ?? 'globalPhrase',
  );
  return getPhraseDurationForClockSource(state, source);
}

export function createSchedulerHarmonyState(state: SliderState): HarmonyState {
  return createHarmonyState(
    harmonySeedMaterialFromState(state),
    state.tension ?? 0.3,
    harmonyChordIntervalSeconds(state),
    state.voicingSpread ?? 0.5,
    state.detune ?? 8,
    state.scaleMode === 'manual' ? 'manual' : 'auto',
    typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)',
    state.rootNote ?? 4,
    harmonyPhraseSeconds(state),
    harmonyParamsFromState(state),
  );
}

export function pickChordWeightedNote(
  rng: () => number,
  availableNotes: number[],
  chordMidiNotes: number[] | undefined,
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
  return passingTones[Math.floor(rng() * passingTones.length)] ?? availableNotes[0] ?? 60;
}

export function leadRandomSource(state: Record<string, unknown>): 'lead1' | 'lead2' | 'piano' {
  const source = state.leadRandomSource;
  return source === 'lead2' || source === 'piano' ? source : 'lead1';
}

export function leadRandomSourceId(source: 'lead1' | 'lead2' | 'piano'): number {
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'piano') return CORE_PRODUCT_SOURCE_IDS.piano;
  return CORE_PRODUCT_SOURCE_IDS.lead1;
}

export function runtimeSourceFromSourceId(sourceId: number): SimpleSequencerVizSource {
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.pad2) return 'pad2';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead1) return 'lead1';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead2) return 'lead2';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.piano) return 'piano';
  return 'pad1';
}

export type PhraseTiming = {
  phraseIndex: number;
  phraseStartWallSec: number;
};

export function phraseTimingForClockSource(
  clockSource: PhraseClockSource,
  phraseSeconds: number,
  anchors: TransportAnchors,
  nowWallSec: number,
): PhraseTiming {
  const safePhraseSeconds = Math.max(0.001, phraseSeconds);
  const phraseIndex = getCurrentClockIndexWall(clockSource, safePhraseSeconds, anchors, nowWallSec);
  const phraseStartWallSec = getAnchorWallForClockSource(clockSource, anchors) + phraseIndex * safePhraseSeconds;
  return {
    phraseIndex,
    phraseStartWallSec,
  };
}

export function sourceDistanceValue(state: Record<string, unknown>, key: string): number {
  return boundedNumber(state, key, 0, 0, 1);
}

export function leadRandomSourceEnabled(state: Record<string, unknown>, source: 'lead1' | 'lead2' | 'piano'): boolean {
  if (!booleanFromState(state, 'leadRandomEnabled', false)) return false;
  if (source === 'lead2') return booleanFromState(state, 'lead2Enabled', false);
  if (source === 'piano') return booleanFromState(state, 'pianoEnabled', false);
  return booleanFromState(state, 'leadEnabled', false);
}

export function manualNoteSourceEnabled(state: Record<string, unknown>, sourceId: number): boolean {
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      return booleanFromState(state, 'padEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      return booleanFromState(state, 'pad2Enabled', false);
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      return booleanFromState(state, 'leadEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return booleanFromState(state, 'lead2Enabled', false);
    case CORE_PRODUCT_SOURCE_IDS.piano:
      return booleanFromState(state, 'pianoEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.drum:
      return booleanFromState(state, 'drumEnabled', false);
    default:
      return true;
  }
}

export function padChordHasEnabledTarget(state: Record<string, unknown>): boolean {
  if (!booleanFromState(state, 'synthChordSequencerEnabled', false)) return false;
  const source = String(state.synthChordSequencerSource ?? 'both').trim().toLowerCase();
  if (source === 'lead1' || source === 'lead') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.lead1);
  if (source === 'lead2') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.lead2);
  if (source === 'piano') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.piano);
  if (source === 'pad1' || source === 'pad') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1);
  if (source === 'pad2') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2);
  return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1) ||
    manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2);
}
