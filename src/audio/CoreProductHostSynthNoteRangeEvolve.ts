import type { NormalizedSequencerEvolveConfig } from './CoreProductHostSequencerEvolveConfig';

type NoteRange = { min: number; max: number };
type PitchMode = 'semitones' | 'notes' | 'noteRange';
type PitchSetting = Partial<{ mode: PitchMode }>;

function synthNoteRangeHashUnit(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x / 0xffffffff;
}

function synthNoteRangeLaneNumber(laneIndex: number): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(4, Math.floor(laneIndex) + 1)) as 1 | 2 | 3 | 4;
}

function synthNoteRangeNumberFromState(state: Record<string, unknown> | null, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function synthNoteRangePitchSetting(settings: unknown, laneIndex: number): PitchSetting {
  if (!Array.isArray(settings)) return {};
  const value = settings[laneIndex];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PitchSetting : {};
}

function synthNoteRangeSliderRange(state: Record<string, unknown> | null, laneIndex: number): NoteRange {
  const lane = synthNoteRangeLaneNumber(laneIndex);
  const fallbackMin = lane === 2 ? 76 : lane === 3 ? 52 : lane === 4 ? 88 : 64;
  const fallbackMax = lane === 2 ? 88 : lane === 3 ? 64 : lane === 4 ? 96 : 76;
  const min = synthNoteRangeNumberFromState(state, `synthEuclid${lane}NoteMin`, fallbackMin);
  const max = synthNoteRangeNumberFromState(state, `synthEuclid${lane}NoteMax`, fallbackMax);
  return { min: Math.max(36, Math.min(94, Math.round(Math.min(min, max - 2)))), max: Math.max(38, Math.min(96, Math.round(Math.max(max, min + 2)))) };
}

export function coreProductSynthNoteRangeHome(input: {
  laneIndex: number;
  state: Record<string, unknown> | null;
  pitchSettings: unknown;
  current?: NoteRange | null;
}): NoteRange | null {
  if (synthNoteRangePitchSetting(input.pitchSettings, input.laneIndex).mode !== 'noteRange') return null;
  return input.current ?? synthNoteRangeSliderRange(input.state, input.laneIndex);
}

export function evolveCoreProductSynthNoteRange(input: {
  laneIndex: number;
  config: NormalizedSequencerEvolveConfig;
  seed: number;
  state: Record<string, unknown> | null;
  pitchSettings: unknown;
  current: NoteRange | null | undefined;
  home?: NoteRange | null;
}): { handled: boolean; range?: NoteRange; midiNote?: number } {
  const home = input.home ?? coreProductSynthNoteRangeHome({
    laneIndex: input.laneIndex,
    state: input.state,
    pitchSettings: input.pitchSettings,
  });
  if (!home) return { handled: false };
  if (input.config.methods?.pitchWalk !== true || (input.config.enabledSubLanes && !input.config.enabledSubLanes.includes('pitch'))) return { handled: true };
  const current = input.current ?? home;
  const intensity = Math.max(0, Math.min(1, input.config.evolution));
  if (synthNoteRangeHashUnit(input.seed ^ 0x6c8e9cf5) >= 0.6 * intensity) return { handled: true };
  const shiftStep = intensity > 0.5 && synthNoteRangeHashUnit(input.seed ^ 0x9e3779b9) < intensity ? 2 : 1;
  const shift = synthNoteRangeHashUnit(input.seed ^ 0x85ebca6b) < 0.5 ? -shiftStep : shiftStep;
  let min = current.min + shift;
  let max = current.max + shift;
  if (intensity > 0.6 && synthNoteRangeHashUnit(input.seed ^ 0xc2b2ae35) < intensity - 0.4) {
    const widen = intensity > 0.8 && synthNoteRangeHashUnit(input.seed ^ 0x27d4eb2f) < intensity ? 2 : 1;
    min -= widen;
    max += widen;
  }
  if (max - min < 2) {
    const mid = (min + max) / 2;
    min = Math.floor(mid - 1);
    max = Math.ceil(mid + 1);
  }
  const homeMid = (home.min + home.max) / 2;
  const mid = (min + max) / 2;
  if (Math.abs(mid - homeMid) > 12) {
    const correction = mid - homeMid > 0 ? mid - homeMid - 12 : mid - homeMid + 12;
    min -= Math.round(correction);
    max -= Math.round(correction);
  }
  min = Math.max(36, Math.min(94, Math.round(min)));
  max = Math.max(min + 2, Math.min(96, Math.round(max)));
  if (min === current.min && max === current.max) return { handled: true };
  return { handled: true, range: { min, max }, midiNote: (min + max) * 0.5 };
}
