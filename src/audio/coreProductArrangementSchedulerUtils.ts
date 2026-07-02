import { CORE_PRODUCT_SOURCE_IDS, type CoreProductEvent } from './coreProductEvents';
import { chordIntervalSecondsFromState } from './chordPhraseTiming';
import { createHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { harmonySeedMaterialFromState } from './harmonySeedMaterial';
import { productSourceEnabledForPlayback } from './coreProductSourcePlayability';
import {
  getAnchorWallForClockSource,
  getCurrentClockIndexWall,
  getPhraseDurationForClockSource,
  resolveProgressionPhraseClockSource,
  type TransportAnchors,
} from './transport';
import type { SimpleSequencerVizSource } from './simpleSequencerPhrasePreview';
import type { LeadRandomSource, PhraseClockSource, SliderState } from '../ui/state';
import type { SampleSlotId } from './sampleLibraries/SampleLibraryTypes';

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

export function leadRandomSource(state: Record<string, unknown>): LeadRandomSource {
  const source = state.leadRandomSource;
  if (source === 'pad1') return 'pad1';
  if (source === 'pad2') return 'pad2';
  if (source === 'lead2') return 'lead2';
  if (source === 'sample1') return 'sample1';
  if (source === 'sample2') return 'sample2';
  return 'lead1';
}

export function leadRandomSourceId(source: LeadRandomSource): number {
  if (source === 'pad1') return CORE_PRODUCT_SOURCE_IDS.pad1;
  if (source === 'pad2') return CORE_PRODUCT_SOURCE_IDS.pad2;
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'sample1') return CORE_PRODUCT_SOURCE_IDS.sample1;
  if (source === 'sample2') return CORE_PRODUCT_SOURCE_IDS.sample2;
  return CORE_PRODUCT_SOURCE_IDS.lead1;
}

export function simpleSequencerSourceId(source: unknown, fallback: number = CORE_PRODUCT_SOURCE_IDS.sample1): number {
  const sourceValue = String(source ?? '').trim().toLowerCase();
  if (sourceValue === 'pad1' || sourceValue === 'pad') return CORE_PRODUCT_SOURCE_IDS.pad1;
  if (sourceValue === 'pad2') return CORE_PRODUCT_SOURCE_IDS.pad2;
  if (sourceValue === 'lead1' || sourceValue === 'lead') return CORE_PRODUCT_SOURCE_IDS.lead1;
  if (sourceValue === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (sourceValue === 'sample1') return CORE_PRODUCT_SOURCE_IDS.sample1;
  if (sourceValue === 'sample2') return CORE_PRODUCT_SOURCE_IDS.sample2;
  return fallback;
}

export function synthChordGeneratorSource(state: Record<string, unknown>): string {
  return String(state.synthChordGeneratorSource ?? 'sample1').trim().toLowerCase();
}

export function synthChordGeneratorSourceEnabled(state: Record<string, unknown>): boolean {
  if (!booleanFromState(state, 'synthChordGeneratorEnabled', false)) return false;
  return manualNoteSourceEnabled(state, simpleSequencerSourceId(synthChordGeneratorSource(state)));
}

export function runtimeSourceFromSourceId(sourceId: number): SimpleSequencerVizSource {
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.pad2) return 'pad2';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead1) return 'lead1';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead2) return 'lead2';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.sample1) return 'sample1';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.sample2) return 'sample2';
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

export function publishManualNoteTriggerForEvent(
  event: { targetId?: number },
  state: Record<string, unknown>,
  publishTrigger: ((name: string, ...payload: unknown[]) => void) | undefined,
): void {
  if (!publishTrigger) return;
  switch (event.targetId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      publishTrigger('padDistance', sourceDistanceValue(state, 'padDistance'));
      break;
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      publishTrigger('pad2Distance', sourceDistanceValue(state, 'pad2Distance'));
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      publishTrigger('leadDistance', { lead1: sourceDistanceValue(state, 'lead1Distance'), lead2: -1 });
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      publishTrigger('leadDistance', { lead1: -1, lead2: sourceDistanceValue(state, 'lead2Distance') });
      break;
    case CORE_PRODUCT_SOURCE_IDS.sample1:
      publishTrigger('sample1Distance', sourceDistanceValue(state, 'sample1Distance'));
      break;
    case CORE_PRODUCT_SOURCE_IDS.sample2:
      publishTrigger('sample2Distance', sourceDistanceValue(state, 'sample2Distance'));
      break;
    default:
      break;
  }
}

export type EnsureScheduledSampleAsset = (slotId: SampleSlotId, midi: number, velocity: number) => Promise<void>;
type PostManualNoteEvent = (event: CoreProductEvent) => void;
type PublishManualNoteTrigger = (name: string, ...payload: unknown[]) => void;

export function leadRandomSourceEnabled(state: Record<string, unknown>, source: LeadRandomSource): boolean {
  if (!booleanFromState(state, 'leadRandomEnabled', false)) return false;
  return manualNoteSourceEnabled(state, leadRandomSourceId(source));
}

export function manualNoteSourceEnabled(state: Record<string, unknown>, sourceId: number): boolean {
  return productSourceEnabledForPlayback(state, sourceId);
}

export function manualNoteEventSourceEnabled(state: Record<string, unknown>, event: CoreProductEvent): boolean {
  return typeof event.targetId === 'number' && manualNoteSourceEnabled(state, event.targetId);
}

export function postManualNoteEventIfSourceEnabled(
  state: Record<string, unknown>,
  event: CoreProductEvent,
  postEvent: PostManualNoteEvent,
  publishTrigger?: PublishManualNoteTrigger,
): void {
  if (!manualNoteEventSourceEnabled(state, event)) return;
  postEvent(event);
  publishManualNoteTriggerForEvent(event, state, publishTrigger);
}

function sampleSlotIdForManualNoteSource(sourceId: number | undefined): SampleSlotId | null {
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.sample1) return 'sample1';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.sample2) return 'sample2';
  return null;
}

export function ensureScheduledSampleAssetForEvent(
  event: CoreProductEvent,
  ensureScheduledSampleAsset?: EnsureScheduledSampleAsset,
): Promise<void> | null {
  const slotId = sampleSlotIdForManualNoteSource(event.targetId);
  if (!slotId || !ensureScheduledSampleAsset) return null;
  const midi = event.value;
  const velocity = event.value2;
  if (typeof midi !== 'number' || !Number.isFinite(midi) || typeof velocity !== 'number' || !Number.isFinite(velocity)) {
    return null;
  }
  return ensureScheduledSampleAsset(slotId, midi, velocity);
}

export function padChordHasEnabledTarget(state: Record<string, unknown>): boolean {
  const generatorEnabled = booleanFromState(state, 'synthChordGeneratorEnabled', false);
  const sequencerEnabled = booleanFromState(state, 'synthChordSequencerEnabled', false);
  if (!generatorEnabled && !sequencerEnabled) return false;
  const source = String(
    generatorEnabled
      ? state.synthChordGeneratorSource ?? state.synthChordSequencerSource ?? 'sample1'
      : state.synthChordSequencerSource ?? 'sample1',
  ).trim().toLowerCase();
  const sourceId = simpleSequencerSourceId(source, 0);
  if (sourceId !== 0) return manualNoteSourceEnabled(state, sourceId);
  return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1) ||
    manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2);
}
