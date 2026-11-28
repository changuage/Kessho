// Per-slot Random settings live in shared-slider state keys of the form
// `synthEuclid<N>Random<Param>` (N = 1..6), so Mod A/B, moving ranges, preset
// morph and modulation metadata work through the same architecture as every
// other slider. This module is the single description of that key family.

import { SYNTH_EUCLIDEAN_LANE_NUMBERS } from '../../audio/sequencerLaneCounts';

export type SynthRandomLaneNumber = (typeof SYNTH_EUCLIDEAN_LANE_NUMBERS)[number];
export type SynthRandomClockSource = 'localPhrase' | 'globalPhrase' | 'localBeat' | 'globalBeat';
export type SynthRandomTensionMode = 'follow' | 'locked' | 'bypass';
export type SynthRandomMode = 'chords' | 'notes';

export interface SynthRandomValueMap {
  Mode: SynthRandomMode;
  VoiceCount: number;
  WaveSpread: number;
  Octave: number;
  VoiceMask: number;
  Pad2VoiceAssign: number;
  PadSplit: boolean;
  FitEnvelope: boolean;
  PhraseSource: SynthRandomClockSource;
  Density: number;
  NotesOctave: number;
  OctaveRange: number;
  TensionMode: SynthRandomTensionMode;
  TensionValue: number;
}

export type SynthRandomParam = keyof SynthRandomValueMap;

export type SynthRandomKey<P extends SynthRandomParam = SynthRandomParam> =
  `synthEuclid${SynthRandomLaneNumber}Random${P}`;

/** Slot-keyed Random state, spread into `SliderState`. */
export type SynthRandomSlotState = {
  [P in SynthRandomParam as `synthEuclid${SynthRandomLaneNumber}Random${P}`]: SynthRandomValueMap[P];
};

type NumericSpec = { kind: 'number'; min: number; max: number; step: number; default: number; modulation: 'dual' | 'single' };
type EnumSpec<T extends string> = { kind: 'enum'; values: readonly T[]; default: T };
type BooleanSpec = { kind: 'boolean'; default: boolean };

export const SYNTH_RANDOM_PARAM_SPECS = {
  Mode: { kind: 'enum', values: ['chords', 'notes'], default: 'chords' } as EnumSpec<SynthRandomMode>,
  VoiceCount: { kind: 'number', min: 1, max: 8, step: 1, default: 6, modulation: 'single' } as NumericSpec,
  WaveSpread: { kind: 'number', min: 0, max: 1, step: 0.01, default: 0.125, modulation: 'dual' } as NumericSpec,
  Octave: { kind: 'number', min: -4, max: 4, step: 1, default: 0, modulation: 'dual' } as NumericSpec,
  VoiceMask: { kind: 'number', min: 0, max: 255, step: 1, default: 63, modulation: 'single' } as NumericSpec,
  Pad2VoiceAssign: { kind: 'number', min: 0, max: 255, step: 1, default: 0, modulation: 'single' } as NumericSpec,
  PadSplit: { kind: 'boolean', default: false } as BooleanSpec,
  FitEnvelope: { kind: 'boolean', default: true } as BooleanSpec,
  PhraseSource: {
    kind: 'enum',
    values: ['globalPhrase', 'localPhrase', 'globalBeat', 'localBeat'],
    default: 'globalPhrase',
  } as EnumSpec<SynthRandomClockSource>,
  Density: { kind: 'number', min: 0.1, max: 12, step: 0.1, default: 0.5, modulation: 'dual' } as NumericSpec,
  NotesOctave: { kind: 'number', min: -4, max: 4, step: 1, default: 1, modulation: 'dual' } as NumericSpec,
  OctaveRange: { kind: 'number', min: 1, max: 4, step: 1, default: 2, modulation: 'dual' } as NumericSpec,
  TensionMode: {
    kind: 'enum',
    values: ['follow', 'locked', 'bypass'],
    default: 'follow',
  } as EnumSpec<SynthRandomTensionMode>,
  TensionValue: { kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0, modulation: 'single' } as NumericSpec,
} as const;

export const SYNTH_RANDOM_PARAMS = Object.keys(SYNTH_RANDOM_PARAM_SPECS) as SynthRandomParam[];
export const SYNTH_RANDOM_LANE_NUMBERS = SYNTH_EUCLIDEAN_LANE_NUMBERS;

export function synthRandomKey<P extends SynthRandomParam>(
  laneNumber: number,
  param: P,
): `synthEuclid${SynthRandomLaneNumber}Random${P}` {
  return `synthEuclid${laneNumber}Random${param}` as `synthEuclid${SynthRandomLaneNumber}Random${P}`;
}

/** Every key of the family, in lane then parameter order. */
export const SYNTH_RANDOM_STATE_KEYS: readonly SynthRandomKey[] = SYNTH_RANDOM_LANE_NUMBERS.flatMap((lane) => (
  SYNTH_RANDOM_PARAMS.map((param) => synthRandomKey(lane, param))
));

const SYNTH_RANDOM_KEY_PATTERN = /^synthEuclid([1-6])Random([A-Za-z0-9]+)$/;

/** Parses `synthEuclid3RandomDensity` into lane 3 and 'Density'. */
export function parseSynthRandomKey(key: string): { laneNumber: number; param: SynthRandomParam } | null {
  const match = SYNTH_RANDOM_KEY_PATTERN.exec(key);
  if (!match) return null;
  const param = match[2] as SynthRandomParam;
  if (!(param in SYNTH_RANDOM_PARAM_SPECS)) return null;
  return { laneNumber: Number(match[1]), param };
}

export function isSynthRandomKey(key: string): key is SynthRandomKey {
  return parseSynthRandomKey(key) !== null;
}

export function synthRandomKeysWhere(predicate: (spec: (typeof SYNTH_RANDOM_PARAM_SPECS)[SynthRandomParam]) => boolean): SynthRandomKey[] {
  return SYNTH_RANDOM_LANE_NUMBERS.flatMap((lane) => (
    SYNTH_RANDOM_PARAMS
      .filter((param) => predicate(SYNTH_RANDOM_PARAM_SPECS[param]))
      .map((param) => synthRandomKey(lane, param))
  ));
}

/** Numeric keys that take Mod A/B ranges. */
export const SYNTH_RANDOM_DUAL_KEYS = synthRandomKeysWhere(
  (spec) => spec.kind === 'number' && spec.modulation === 'dual',
);
/** Numeric keys without a modulation range. */
export const SYNTH_RANDOM_SINGLE_KEYS = synthRandomKeysWhere(
  (spec) => spec.kind === 'number' && spec.modulation === 'single',
);
export const SYNTH_RANDOM_CONTINUOUS_KEYS = synthRandomKeysWhere((spec) => spec.kind === 'number');
export const SYNTH_RANDOM_BOOLEAN_KEYS = synthRandomKeysWhere((spec) => spec.kind === 'boolean');
export const SYNTH_RANDOM_ENUM_KEYS = synthRandomKeysWhere((spec) => spec.kind === 'enum');

export function synthRandomDefaults(): SynthRandomSlotState {
  const defaults: Record<string, unknown> = {};
  for (const lane of SYNTH_RANDOM_LANE_NUMBERS) {
    for (const param of SYNTH_RANDOM_PARAMS) defaults[synthRandomKey(lane, param)] = SYNTH_RANDOM_PARAM_SPECS[param].default;
  }
  return defaults as SynthRandomSlotState;
}

/** Numeric ranges for QUANTIZATION-style tables. */
export function synthRandomNumericRanges(): Record<string, { min: number; max: number; step: number }> {
  const ranges: Record<string, { min: number; max: number; step: number }> = {};
  for (const lane of SYNTH_RANDOM_LANE_NUMBERS) {
    for (const param of SYNTH_RANDOM_PARAMS) {
      const spec = SYNTH_RANDOM_PARAM_SPECS[param];
      if (spec.kind === 'number') ranges[synthRandomKey(lane, param)] = { min: spec.min, max: spec.max, step: spec.step };
    }
  }
  return ranges;
}

/** Coerces one stored value to its valid domain, falling back to the default. */
export function normalizeSynthRandomValue<P extends SynthRandomParam>(param: P, value: unknown): SynthRandomValueMap[P] {
  const spec = SYNTH_RANDOM_PARAM_SPECS[param];
  if (spec.kind === 'number') {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : spec.default;
    const clamped = Math.max(spec.min, Math.min(spec.max, numeric));
    return (spec.step >= 1 ? Math.round(clamped) : clamped) as SynthRandomValueMap[P];
  }
  if (spec.kind === 'boolean') {
    return (typeof value === 'boolean' ? value : spec.default) as SynthRandomValueMap[P];
  }
  return ((spec.values as readonly string[]).includes(value as string) ? value : spec.default) as SynthRandomValueMap[P];
}

export type SynthRandomSettings = { [P in SynthRandomParam]: SynthRandomValueMap[P] };

/** Reads one lane's normalized Random settings from a state record. */
export function synthRandomSettingsFromState(
  state: Record<string, unknown> | undefined,
  laneNumber: number,
): SynthRandomSettings {
  const settings: Record<string, unknown> = {};
  for (const param of SYNTH_RANDOM_PARAMS) {
    settings[param] = normalizeSynthRandomValue(param, state?.[synthRandomKey(laneNumber, param)]);
  }
  return settings as SynthRandomSettings;
}

/** `synthEuclid3Random…` keys rewritten to lane `to`, for lane-to-lane moves. */
export function synthRandomPatchForLane(laneNumber: number, settings: Partial<SynthRandomSettings>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const param of SYNTH_RANDOM_PARAMS) {
    const value = settings[param];
    if (value !== undefined) patch[synthRandomKey(laneNumber, param)] = value;
  }
  return patch;
}
