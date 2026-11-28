// Legacy singleton generator state, kept only for the isolated Web/TS reference
// scheduler and engines. Product Core no longer has these keys: Random Chords
// and Random Notes are Random slots (`synthEuclid<N>Random*`), and presets that
// still carry the old keys are migrated by `presets/synthRandomMigration.ts`.

import type { SliderState } from '../../ui/state';
import type { PhraseClockSource } from '../../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from '../coreProductEvents';
import { manualNoteSourceEnabled, booleanFromState, sourceDistanceValue } from '../coreProductArrangementSchedulerUtils';
import { productSourceEnabledForPlayback } from '../coreProductSourcePlayability';

export type LeadRandomSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'sample1' | 'sample2';
export type SynthChordSource = 'pad1' | 'pad2' | 'both' | 'lead1' | 'lead2' | 'sample1' | 'sample2';

/** The retired arrangement keys the reference engines still read. */
export interface LegacyArrangementKeys {
  waveSpread?: number;
  synthOctave?: number;
  synthVoiceMask?: number;
  pad2VoiceAssign?: number;
  padFitEnvelopeToChord?: boolean;
  pad2FitEnvelopeToChord?: boolean;
  lead1Density?: number;
  lead1Octave?: number;
  lead1OctaveRange?: number;
  leadRandomEnabled?: boolean;
  leadRandomSource?: LeadRandomSource;
  leadRandomClockSource?: PhraseClockSource;
  leadRandomSyncPolicy?: 'free' | 'nextPhrase' | 'restartNow';
  leadTensionMode?: 'follow' | 'locked' | 'bypass';
  leadTensionValue?: number;
  synthChordGeneratorEnabled?: boolean;
  synthChordGeneratorSource?: SynthChordSource;
  synthChordGeneratorVoiceCount?: number;
}

export type ReferenceSliderState = SliderState & LegacyArrangementKeys;

export function leadRandomSource(state: Record<string, unknown>): LeadRandomSource {
  // ALLOW_PIANO_ALIAS_MIGRATION: legacy preset reads normalize Piano to Sample 1.
  const source = state.leadRandomSource;
  if (source === 'pad1') return 'pad1';
  if (source === 'pad2') return 'pad2';
  if (source === 'lead2') return 'lead2';
  if (source === 'sample1' || source === 'piano') return 'sample1';
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
  const source = synthChordGeneratorSource(state);
  if (source === 'both') {
    return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1)
      || manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2);
  }
  return manualNoteSourceEnabled(state, simpleSequencerSourceId(source));
}


export function leadRandomSourceEnabled(state: Record<string, unknown>, source: LeadRandomSource): boolean {
  if (!booleanFromState(state, 'leadRandomEnabled', false)) return false;
  if (source === 'sample1' && (
    state.leadRandomSource === 'piano' ||
    (booleanFromState(state, 'pianoEnabled', false) && sourceDistanceValue(state, 'pianoDistance') > 0)
  )) {
    return booleanFromState(state, 'pianoEnabled', false) ||
      productSourceEnabledForPlayback(state, CORE_PRODUCT_SOURCE_IDS.sample1);
  }
  return manualNoteSourceEnabled(state, leadRandomSourceId(source));
}

