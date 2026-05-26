import { applyParams, extractParams } from './codec';
import type { SliderState } from '../ui/state';

export interface EuclideanPatternDefinition {
  steps: number;
  hits: number;
  rotation: number;
}

export const EUCLIDEAN_PATTERN_LABELS: Record<string, string> = {
  sparse: 'Sparse',
  dense: 'Dense',
  longSparse: 'Long Sparse',
  poly3v4: 'Poly 3v4',
  poly4v3: 'Poly 4v3',
  poly5v4: 'Poly 5v4',
  lancaran: 'Lancaran',
  ketawang: 'Ketawang',
  ladrang: 'Ladrang',
  gangsaran: 'Gangsaran',
  kotekan: 'Kotekan',
  kotekan2: 'Kotekan B',
  srepegan: 'Srepegan',
  sampak: 'Sampak',
  ayak: 'Ayak',
  bonang: 'Bonang',
  tresillo: 'Tresillo',
  cinquillo: 'Cinquillo',
  rumba: 'Rumba',
  bossa: 'Bossa Nova',
  son: 'Son Clave',
  shiko: 'Shiko',
  soukous: 'Soukous',
  gahu: 'Gahu',
  bembe: 'Bembe',
  clapping: 'Clapping',
  clappingB: 'Clapping B',
  additive7: 'Additive 7',
  additive11: 'Additive 11',
  additive13: 'Additive 13',
  reich18: 'Reich 18',
  drumming: 'Drumming',
};

type NormalizedEuclideanPatternData = {
  enabled: boolean;
  preset: string;
  steps: number;
  hits: number;
  rotation: number;
};

export const EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY = 'euclideanPatternStepOverrides';
export const EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY = 'euclideanPatternSequenceState';
export const EUCLIDEAN_PATTERN_SOURCE_SEQUENCE_STATE_KEY = 'euclideanPatternSourceSequenceState';

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceMidiNote(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(127, Math.round(coerceNumber(value, fallback))));
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizePatternData(data: Record<string, unknown>): NormalizedEuclideanPatternData {
  return {
    enabled: coerceBoolean(data.euclideanPatternEnabled, true),
    preset: coerceString(data.euclideanPatternPreset, 'custom'),
    steps: coerceNumber(data.euclideanPatternSteps, 16),
    hits: coerceNumber(data.euclideanPatternHits, 4),
    rotation: coerceNumber(data.euclideanPatternRotation, 0),
  };
}

function getLaneNumber(laneIndex: number): 1 | 2 | 3 | 4 {
  const normalized = Math.max(0, Math.min(3, Math.floor(laneIndex)));
  return (normalized + 1) as 1 | 2 | 3 | 4;
}

function extractLanePatternData(
  state: SliderState,
  prefix: 'drum' | 'synth',
  laneIndex: number,
): Record<string, unknown> {
  const lane = getLaneNumber(laneIndex);
  const stateRecord = state as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {
    euclideanPatternEnabled: stateRecord[`${prefix}Euclid${lane}Enabled`],
    euclideanPatternPreset: stateRecord[`${prefix}Euclid${lane}Preset`],
    euclideanPatternSteps: stateRecord[`${prefix}Euclid${lane}Steps`],
    euclideanPatternHits: stateRecord[`${prefix}Euclid${lane}Hits`],
    euclideanPatternRotation: stateRecord[`${prefix}Euclid${lane}Rotation`],
  };
  if (prefix === 'synth') {
    data.euclideanPatternNoteMin = stateRecord[`synthEuclid${lane}NoteMin`];
    data.euclideanPatternNoteMax = stateRecord[`synthEuclid${lane}NoteMax`];
  }
  return data;
}

function normalizeSpecificLanePatternData(
  data: Record<string, unknown>,
  prefix: 'drum' | 'synth',
  laneIndex: number,
): NormalizedEuclideanPatternData | null {
  const lane = getLaneNumber(laneIndex);
  const lanePrefix = `${prefix}Euclid${lane}`;
  const hasLaneData = Object.keys(data).some((key) => key.startsWith(lanePrefix));
  if (!hasLaneData) return null;

  const generic = normalizePatternData(data);
  return {
    enabled: coerceBoolean(data[`${lanePrefix}Enabled`], generic.enabled),
    preset: coerceString(data[`${lanePrefix}Preset`], generic.preset),
    steps: coerceNumber(data[`${lanePrefix}Steps`], generic.steps),
    hits: coerceNumber(data[`${lanePrefix}Hits`], generic.hits),
    rotation: coerceNumber(data[`${lanePrefix}Rotation`], generic.rotation),
  };
}

function buildLaneStateFromPatternData(
  data: Record<string, unknown>,
  prefix: 'drum' | 'synth',
  laneIndex: number,
): Record<string, unknown> {
  const lane = getLaneNumber(laneIndex);
  const alternatePrefix = prefix === 'drum' ? 'synth' : 'drum';
  const pattern = normalizeSpecificLanePatternData(data, prefix, laneIndex)
    ?? normalizeSpecificLanePatternData(data, alternatePrefix, laneIndex)
    ?? normalizeSpecificLanePatternData(data, prefix, 0)
    ?? normalizeSpecificLanePatternData(data, alternatePrefix, 0)
    ?? normalizePatternData(data);
  const next: Record<string, unknown> = {
    [`${prefix}Euclid${lane}Enabled`]: pattern.enabled,
    [`${prefix}Euclid${lane}Preset`]: pattern.preset,
    [`${prefix}Euclid${lane}Steps`]: pattern.steps,
    [`${prefix}Euclid${lane}Hits`]: pattern.hits,
    [`${prefix}Euclid${lane}Rotation`]: pattern.rotation,
  };
  if (prefix === 'synth') {
    const sourceLane = getLaneNumber(laneIndex);
    const sourcePrefix = `synthEuclid${sourceLane}`;
    const lowFallback = lane === 1 ? 64 : lane === 2 ? 76 : lane === 3 ? 52 : 88;
    const highFallback = lane === 1 ? 76 : lane === 2 ? 88 : lane === 3 ? 64 : 96;
    const rawLow = data.euclideanPatternNoteMin ?? data[`${sourcePrefix}NoteMin`];
    const rawHigh = data.euclideanPatternNoteMax ?? data[`${sourcePrefix}NoteMax`];
    if (rawLow !== undefined || rawHigh !== undefined) {
      const low = coerceMidiNote(rawLow, lowFallback);
      const high = coerceMidiNote(rawHigh, highFallback);
      next[`synthEuclid${lane}NoteMin`] = Math.min(low, high);
      next[`synthEuclid${lane}NoteMax`] = Math.max(low, high);
    }
  }
  return next;
}

function buildNeutralDrumLaneDefaults(lane: 2 | 3 | 4): Record<string, unknown> {
  return {
    [`drumEuclid${lane}Enabled`]: false,
    [`drumEuclid${lane}Preset`]: 'custom',
    [`drumEuclid${lane}Steps`]: 16,
    [`drumEuclid${lane}Hits`]: 4,
    [`drumEuclid${lane}Rotation`]: 0,
    [`drumEuclid${lane}TargetSub`]: false,
    [`drumEuclid${lane}TargetKick`]: false,
    [`drumEuclid${lane}TargetClick`]: false,
    [`drumEuclid${lane}TargetBeepHi`]: lane === 2,
    [`drumEuclid${lane}TargetBeepLo`]: lane === 3,
    [`drumEuclid${lane}TargetNoise`]: lane === 4,
    [`drumEuclid${lane}TargetMembrane`]: false,
    [`drumEuclid${lane}Probability`]: 1,
    [`drumEuclid${lane}VelocityMin`]: 0.5,
    [`drumEuclid${lane}VelocityMax`]: 1,
    [`drumEuclid${lane}Level`]: 0.7,
  };
}

function buildNeutralSynthLaneDefaults(lane: 2 | 3 | 4): Record<string, unknown> {
  const defaults = {
    2: { noteMin: 76, noteMax: 88, level: 0.6, steps: 8, hits: 3 },
    3: { noteMin: 52, noteMax: 64, level: 0.9, steps: 16, hits: 2 },
    4: { noteMin: 88, noteMax: 96, level: 0.5, steps: 16, hits: 6 },
  } as const;

  const laneDefaults = defaults[lane];
  return {
    [`synthEuclid${lane}Enabled`]: false,
    [`synthEuclid${lane}Preset`]: 'custom',
    [`synthEuclid${lane}Steps`]: laneDefaults.steps,
    [`synthEuclid${lane}Hits`]: laneDefaults.hits,
    [`synthEuclid${lane}Rotation`]: 0,
    [`synthEuclid${lane}NoteMin`]: laneDefaults.noteMin,
    [`synthEuclid${lane}NoteMax`]: laneDefaults.noteMax,
    [`synthEuclid${lane}Level`]: laneDefaults.level,
    [`synthEuclid${lane}Probability`]: 1,
    [`synthEuclid${lane}Source`]: 'lead',
  };
}

export function buildEuclideanPatternPresetData(
  preset: string,
  pattern: EuclideanPatternDefinition,
  enabled = true,
): Record<string, unknown> {
  return {
    euclideanPatternEnabled: enabled,
    euclideanPatternPreset: preset,
    euclideanPatternSteps: pattern.steps,
    euclideanPatternHits: pattern.hits,
    euclideanPatternRotation: pattern.rotation,
  };
}

export function extractEuclideanPatternDataFromDrumState(state: SliderState): Record<string, unknown> {
  return extractParams(state, 1, 'drumEuclidean');
}

export function extractEuclideanPatternDataFromSynthState(state: SliderState): Record<string, unknown> {
  return extractParams(state, 1, 'synthEuclidean');
}

export function extractEuclideanPatternLaneDataFromDrumState(
  state: SliderState,
  laneIndex: number,
): Record<string, unknown> {
  return extractLanePatternData(state, 'drum', laneIndex);
}

export function extractEuclideanPatternLaneDataFromSynthState(
  state: SliderState,
  laneIndex: number,
): Record<string, unknown> {
  return extractLanePatternData(state, 'synth', laneIndex);
}

function hasSpecificEuclideanData(data: Record<string, unknown>, prefix: 'drum' | 'synth'): boolean {
  const masterKey = prefix === 'drum' ? 'drumEuclidMasterEnabled' : 'synthEuclideanMasterEnabled';
  return masterKey in data || Object.keys(data).some((key) => key.startsWith(`${prefix}Euclid`));
}

function pickSpecificEuclideanData(data: Record<string, unknown>, prefix: 'drum' | 'synth'): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const isDrumKey = prefix === 'drum' && key.startsWith('drumEuclid');
    const isSynthKey = prefix === 'synth' && (
      key.startsWith('synthEuclid')
      || key === 'synthEuclideanMasterEnabled'
      || key === 'synthEuclideanTempo'
      || key === 'synthChordSequencerEnabled'
    );
    if (
      isDrumKey
      || isSynthKey
      || key === EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY
      || key === EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY
      || key === EUCLIDEAN_PATTERN_SOURCE_SEQUENCE_STATE_KEY
    ) {
      picked[key] = value;
    }
  }
  return picked;
}

export function buildDrumEuclideanStateFromPatternData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (hasSpecificEuclideanData(data, 'drum')) {
    return pickSpecificEuclideanData(data, 'drum');
  }

  const pattern = normalizePatternData(data);
  return {
    drumEuclidMasterEnabled: true,
    drumEuclidBaseBPM: 120,
    drumEuclidTempo: 1,
    drumEuclidSwing: 0,
    drumEuclidDivision: 16,
    drumEuclid1Enabled: pattern.enabled,
    drumEuclid1Preset: pattern.preset,
    drumEuclid1Steps: pattern.steps,
    drumEuclid1Hits: pattern.hits,
    drumEuclid1Rotation: pattern.rotation,
    drumEuclid1TargetSub: false,
    drumEuclid1TargetKick: true,
    drumEuclid1TargetClick: true,
    drumEuclid1TargetBeepHi: false,
    drumEuclid1TargetBeepLo: false,
    drumEuclid1TargetNoise: false,
    drumEuclid1TargetMembrane: false,
    drumEuclid1Probability: 1,
    drumEuclid1VelocityMin: 0.5,
    drumEuclid1VelocityMax: 1,
    drumEuclid1Level: 0.8,
    ...buildNeutralDrumLaneDefaults(2),
    ...buildNeutralDrumLaneDefaults(3),
    ...buildNeutralDrumLaneDefaults(4),
  };
}

export function applyEuclideanPatternToDrumState(
  state: SliderState,
  data: Record<string, unknown>,
): SliderState {
  return applyParams(state, buildDrumEuclideanStateFromPatternData(data), 1, 'drumEuclidean');
}

export function applyEuclideanPatternToDrumLaneState(
  state: SliderState,
  data: Record<string, unknown>,
  laneIndex: number,
): SliderState {
  return applyParams(state, buildLaneStateFromPatternData(data, 'drum', laneIndex), 1, 'drumEuclidean');
}

export function buildSynthEuclideanStateFromPatternData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (hasSpecificEuclideanData(data, 'synth')) {
    return pickSpecificEuclideanData(data, 'synth');
  }

  const pattern = normalizePatternData(data);
  return {
    synthEuclideanMasterEnabled: true,
    synthEuclideanTempo: 1,
    synthEuclidBaseBPM: 120,
    synthChordSequencerEnabled: false,
    synthEuclid1Enabled: pattern.enabled,
    synthEuclid1Preset: pattern.preset,
    synthEuclid1Steps: pattern.steps,
    synthEuclid1Hits: pattern.hits,
    synthEuclid1Rotation: pattern.rotation,
    synthEuclid1NoteMin: 64,
    synthEuclid1NoteMax: 76,
    synthEuclid1Level: 0.8,
    synthEuclid1Probability: 1,
    synthEuclid1Source: 'lead',
    ...buildNeutralSynthLaneDefaults(2),
    ...buildNeutralSynthLaneDefaults(3),
    ...buildNeutralSynthLaneDefaults(4),
  };
}

export function applyEuclideanPatternToSynthState(
  state: SliderState,
  data: Record<string, unknown>,
): SliderState {
  return applyParams(state, buildSynthEuclideanStateFromPatternData(data), 1, 'synthEuclidean');
}

export function applyEuclideanPatternToSynthLaneState(
  state: SliderState,
  data: Record<string, unknown>,
  laneIndex: number,
): SliderState {
  return applyParams(state, buildLaneStateFromPatternData(data, 'synth', laneIndex), 1, 'synthEuclidean');
}
