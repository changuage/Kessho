import {
  createCoreProductSequencerLaneParamEvent,
  type CoreProductEvent,
} from '../../coreProductEvents';
import { coreProductSynthNoteRangeHome } from '../../CoreProductHostSynthNoteRangeEvolve';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import {
  normalizeSequencerPitchMode,
  normalizeSequencerPitchRoot,
  normalizeSequencerPitchScale,
  normalizeSequencerPitchSettings,
} from '../../sequencerPitchSettings';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';

type PitchSettings = ReturnType<typeof normalizeSequencerPitchSettings>;

const PRODUCT_SCALE_ID_TO_NAME: Record<number, string> = Object.freeze({
  0: 'Chromatic',
  1: 'Major',
  2: 'Minor',
  3: 'Dorian',
  4: 'Phrygian',
  5: 'Lydian',
  6: 'Mixolydian',
  7: 'Locrian',
  8: 'Pentatonic',
  9: 'Min Penta',
  10: 'Blues',
  11: 'Harmonic Minor',
  12: 'Melodic Minor',
  13: 'Whole Tone',
  14: 'Diminished',
  15: 'Augmented',
  16: 'Hungarian Minor',
  17: 'Japanese',
  18: 'Arabic',
});

const EXACT_SCALE_ID_TO_NAME = Object.freeze([
  'Harmony',
  'Chromatic',
  'Major',
  'Minor',
  'Dorian',
  'Phrygian',
  'Lydian',
  'Mixolydian',
  'Locrian',
  'Pentatonic',
  'Min Penta',
  'Blues',
  'Harmonic Minor',
  'Melodic Minor',
  'Whole Tone',
  'Diminished',
  'Augmented',
  'Hungarian Minor',
  'Japanese',
  'Arabic',
] as const);

export function applyCoreProductSequencerPitchSettingEvent(options: {
  adapterState: Record<string, unknown>;
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  latestSliderState: Record<string, unknown> | null;
  synthNoteRangeOverrides: readonly ({ min: number; max: number } | null | undefined)[];
  runtimeReady: boolean;
  post: (event: CoreProductEvent) => void;
}): { handled: boolean; adapterState: Record<string, unknown> } {
  const { event, sequencer, laneIndex } = options;
  if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane || !isPitchSettingParam(event.paramId)) return { handled: false, adapterState: options.adapterState };
  const key = sequencer === 'synth' ? 'synthPitchSettings' : 'drumPitchSettings';
  const existing = Array.isArray(options.adapterState[key]) ? options.adapterState[key] : [];
  const laneCount = Math.max(4, Math.min(16, Math.max(existing.length, laneIndex + 1)));
  const settings = Array.from({ length: laneCount }, (_, index) => normalizeSequencerPitchSettings(existing[index]));
  settings[laneIndex] = patchPitchSetting(settings[laneIndex] ?? normalizeSequencerPitchSettings(undefined), event);
  const adapterState = { ...options.adapterState, [key]: settings };
  if (options.runtimeReady) {
    options.post(event);
    if (sequencer === 'synth') postSynthNoteRange({ ...options, adapterState });
  }
  return { handled: true, adapterState };
}

function isPitchSettingParam(paramId: unknown): boolean {
  return paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchMode ||
    paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchRoot ||
    paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchScale;
}

function patchPitchSetting(current: PitchSettings, event: CoreProductEvent): PitchSettings {
  if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchMode) return { ...current, mode: pitchMode(event.value, current.mode) };
  if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchRoot) return { ...current, root: normalizeSequencerPitchRoot(event.value, current.root) };
  return { ...current, scale: pitchScale(event.value, event.value2, current.scale) };
}

function pitchMode(value: unknown, fallback: PitchSettings['mode']): PitchSettings['mode'] {
  const mode = Math.round(typeof value === 'number' && Number.isFinite(value) ? value : -1);
  return normalizeSequencerPitchMode(mode === 2 ? 'noteRange' : mode === 1 ? 'notes' : mode === 0 ? 'semitones' : fallback, fallback);
}

function pitchScale(value: unknown, exactValue: unknown, fallback: PitchSettings['scale']): PitchSettings['scale'] {
  const exactIndex = Math.round(typeof exactValue === 'number' && Number.isFinite(exactValue) ? exactValue : -1);
  const exact = EXACT_SCALE_ID_TO_NAME[exactIndex];
  if (exact) return normalizeSequencerPitchScale(exact, fallback);
  const productId = Math.round(typeof value === 'number' && Number.isFinite(value) ? value : -1);
  return normalizeSequencerPitchScale(PRODUCT_SCALE_ID_TO_NAME[productId], fallback);
}

function postSynthNoteRange(options: {
  adapterState: Record<string, unknown>;
  laneIndex: number;
  latestSliderState: Record<string, unknown> | null;
  synthNoteRangeOverrides: readonly ({ min: number; max: number } | null | undefined)[];
  post: (event: CoreProductEvent) => void;
}): void {
  const range = coreProductSynthNoteRangeHome({
    laneIndex: options.laneIndex,
    state: options.latestSliderState,
    pitchSettings: options.adapterState.synthPitchSettings,
    current: options.synthNoteRangeOverrides[options.laneIndex],
  });
  if (!range) return;
  options.post(createCoreProductSequencerLaneParamEvent('synth', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneNoteRangeMin, range.min));
  options.post(createCoreProductSequencerLaneParamEvent('synth', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneNoteRangeMax, range.max));
  options.post(createCoreProductSequencerLaneParamEvent('synth', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, (range.min + range.max) * 0.5));
}
