import { applyParams, extractParams } from '../presets/codec';
import { QUANTIZATION, type SliderState } from '../ui/state';
import { PAD1_TO_PAD2_KEY, PAD_PRESET_DEFAULT_PARAMS } from './padPresets';
import { createRng, rngPick } from './rng';

export type PadRandomScope = 'pad1' | 'pad2';
export type PadRandomStyle = 'target' | 'walk';
export type PadScopeSnapshot = Record<string, number | string | boolean>;

const OSC_WAVES = ['sine', 'triangle', 'sawtooth', 'square'] as const;
const SUB_WAVES = ['sine', 'triangle'] as const;
const NOISE_TYPES = ['white', 'pink'] as const;
const FILTER_TYPES = ['lowpass', 'bandpass', 'highpass', 'notch'] as const;
const FILTER_ROUTINGS = ['series', 'aOnly', 'bOnly'] as const;
const LFO_WAVES = ['sine', 'triangle', 'sawtooth', 'square', 'sampleHold', 'randomSmooth', 'randomWalk'] as const;
const LFO_DESTS = ['none', 'filterCutoff', 'filterBCutoff', 'amplitude', 'pitch', 'oscBLevel', 'foldAmount'] as const;
const MOD_ENV_DESTS = ['filterCutoff', 'pitch', 'oscBLevel', 'foldAmount'] as const;

const TARGET_LINEAR_RADIUS = 0.28;
const WALK_LINEAR_RADIUS = 0.09;
const TARGET_Q_RADIUS = 0.3;
const WALK_Q_RADIUS = 0.12;
const TARGET_DETUNE_RADIUS = 28;
const WALK_DETUNE_RADIUS = 9;
const TARGET_LOG_RADIUS = 1.45;
const WALK_LOG_RADIUS = 0.42;

function scopeKey(scope: PadRandomScope, pad1Key: string): string {
  if (scope === 'pad1') return pad1Key;
  return PAD1_TO_PAD2_KEY[pad1Key] ?? pad1Key;
}

function countStepDecimals(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const text = step.toString();
  const decimalIndex = text.indexOf('.');
  return decimalIndex >= 0 ? text.length - decimalIndex - 1 : 0;
}

function quantizeNumber(key: keyof SliderState, value: number): number {
  const quant = QUANTIZATION[key];
  if (!quant) return value;
  const clamped = Math.min(quant.max, Math.max(quant.min, value));
  const snapped = quant.min + Math.round((clamped - quant.min) / quant.step) * quant.step;
  const decimals = countStepDecimals(quant.step);
  return Number(snapped.toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomSigned(rng: () => number): number {
  return rng() * 2 - 1;
}

function maybe(rng: () => number, chance: number): boolean {
  return rng() < chance;
}

function pickDifferent<T extends string | number>(
  rng: () => number,
  current: T,
  choices: readonly T[],
): T {
  const filtered = choices.filter((choice) => choice !== current);
  return filtered.length > 0 ? rngPick(rng, filtered) : current;
}

function mutateLinear(
  rng: () => number,
  key: keyof SliderState,
  current: number,
  radius: number,
): number {
  const quant = QUANTIZATION[key];
  if (!quant) return current;
  const range = quant.max - quant.min;
  const next = current + randomSigned(rng) * range * radius;
  return quantizeNumber(key, next);
}

function mutateDetune(
  rng: () => number,
  key: keyof SliderState,
  current: number,
  radius: number,
): number {
  return quantizeNumber(key, current + randomSigned(rng) * radius);
}

function mutateLogarithmic(
  rng: () => number,
  key: keyof SliderState,
  current: number,
  radiusOctaves: number,
): number {
  const quant = QUANTIZATION[key];
  if (!quant) return current;
  const safeCurrent = clamp(current, quant.min, quant.max);
  const next = safeCurrent * Math.pow(2, randomSigned(rng) * radiusOctaves);
  return quantizeNumber(key, next);
}

function mutateOctave(
  rng: () => number,
  current: number,
  min: number,
  max: number,
  walkMode: boolean,
): number {
  const deltas = walkMode ? [-1, 0, 0, 1] : [-2, -1, -1, 0, 0, 1, 1, 2];
  const next = current + rngPick(rng, deltas);
  return clamp(Math.round(next), min, max);
}

function pickTargetValue<T extends string>(
  rng: () => number,
  current: T,
  choices: readonly T[],
  changeChance: number,
): T {
  if (!maybe(rng, changeChance)) return current;
  const mergedChoices = choices.includes(current) ? choices : [current, ...choices];
  return pickDifferent(rng, current, mergedChoices);
}

function setScopedValue(
  snapshot: PadScopeSnapshot,
  scope: PadRandomScope,
  pad1Key: string,
  value: number | string | boolean,
): void {
  snapshot[scopeKey(scope, pad1Key)] = value;
}

function getScopedNumber(
  snapshot: PadScopeSnapshot,
  scope: PadRandomScope,
  pad1Key: string,
): number {
  const value = snapshot[scopeKey(scope, pad1Key)];
  if (typeof value === 'number') return value;
  const defaultValue = PAD_PRESET_DEFAULT_PARAMS[pad1Key];
  return typeof defaultValue === 'number' ? defaultValue : 0;
}

function getScopedString(
  snapshot: PadScopeSnapshot,
  scope: PadRandomScope,
  pad1Key: string,
): string {
  const value = snapshot[scopeKey(scope, pad1Key)];
  if (typeof value === 'string') return value;
  const defaultValue = PAD_PRESET_DEFAULT_PARAMS[pad1Key];
  return typeof defaultValue === 'string' ? defaultValue : '';
}

function getScopedBoolean(
  snapshot: PadScopeSnapshot,
  scope: PadRandomScope,
  pad1Key: string,
): boolean {
  const value = snapshot[scopeKey(scope, pad1Key)];
  if (typeof value === 'boolean') return value;
  const defaultValue = PAD_PRESET_DEFAULT_PARAMS[pad1Key];
  return typeof defaultValue === 'boolean' ? defaultValue : false;
}

function stabilizePadSnapshot(scope: PadRandomScope, snapshot: PadScopeSnapshot): PadScopeSnapshot {
  const next = { ...snapshot };

  const filterMinKey = scopeKey(scope, 'filterCutoffMin') as keyof SliderState;
  const filterMaxKey = scopeKey(scope, 'filterCutoffMax') as keyof SliderState;
  const filterMin = quantizeNumber(filterMinKey, getScopedNumber(next, scope, 'filterCutoffMin'));
  const filterMax = quantizeNumber(filterMaxKey, getScopedNumber(next, scope, 'filterCutoffMax'));
  if (filterMin <= filterMax) {
    setScopedValue(next, scope, 'filterCutoffMin', filterMin);
    setScopedValue(next, scope, 'filterCutoffMax', Math.max(filterMin + 40, filterMax));
  } else {
    setScopedValue(next, scope, 'filterCutoffMin', filterMax);
    setScopedValue(next, scope, 'filterCutoffMax', Math.max(filterMax + 40, filterMin));
  }

  const filterBCutoffKey = scopeKey(scope, 'padFilterBCutoff') as keyof SliderState;
  setScopedValue(
    next,
    scope,
    'padFilterBCutoff',
    quantizeNumber(filterBCutoffKey, getScopedNumber(next, scope, 'padFilterBCutoff')),
  );

  const oscMixKey = scopeKey(scope, 'padOscMix') as keyof SliderState;
  setScopedValue(next, scope, 'padOscMix', quantizeNumber(oscMixKey, getScopedNumber(next, scope, 'padOscMix')));

  const levelKeys = ['padOscALevel', 'padOscBLevel', 'padSubLevel', 'padNoiseLevel'] as const;
  for (const key of levelKeys) {
    setScopedValue(next, scope, key, quantizeNumber(scopeKey(scope, key) as keyof SliderState, getScopedNumber(next, scope, key)));
  }

  const synthTimes = ['synthAttack', 'synthDecay', 'synthRelease', 'padModEnvAttack', 'padModEnvDecay', 'padModEnvRelease'] as const;
  for (const key of synthTimes) {
    setScopedValue(next, scope, key, quantizeNumber(scopeKey(scope, key) as keyof SliderState, getScopedNumber(next, scope, key)));
  }

  return next;
}

export function extractPadScopeState(state: SliderState, scope: PadRandomScope): PadScopeSnapshot {
  const extracted = extractParams(state, 1, scope) as PadScopeSnapshot;
  return stabilizePadSnapshot(scope, extracted);
}

export function applyPadScopeState(
  state: SliderState,
  scope: PadRandomScope,
  snapshot: PadScopeSnapshot,
): SliderState {
  return applyParams(state, stabilizePadSnapshot(scope, snapshot), 1, scope);
}

export function blendPadScopeState(
  scope: PadRandomScope,
  start: PadScopeSnapshot,
  end: PadScopeSnapshot,
  amount: number,
  discreteThreshold = 0.5,
): PadScopeSnapshot {
  const next: PadScopeSnapshot = { ...start };
  const t = clamp(amount, 0, 1);
  const keys = new Set([...Object.keys(start), ...Object.keys(end)]);

  for (const key of keys) {
    const startValue = start[key];
    const endValue = end[key];

    if (typeof startValue === 'number' && typeof endValue === 'number') {
      next[key] = quantizeNumber(key as keyof SliderState, startValue + (endValue - startValue) * t);
      continue;
    }

    if (endValue !== undefined) {
      next[key] = t >= discreteThreshold ? endValue : (startValue ?? endValue);
    }
  }

  return stabilizePadSnapshot(scope, next);
}

export function createPadRandomGoal(
  current: PadScopeSnapshot,
  scope: PadRandomScope,
  style: PadRandomStyle,
  seedHint = '',
): PadScopeSnapshot {
  const rng = createRng(`${scope}|${style}|${seedHint}|${Date.now()}`);
  const walkMode = style === 'walk';
  const linearRadius = walkMode ? WALK_LINEAR_RADIUS : TARGET_LINEAR_RADIUS;
  const qRadius = walkMode ? WALK_Q_RADIUS : TARGET_Q_RADIUS;
  const detuneRadius = walkMode ? WALK_DETUNE_RADIUS : TARGET_DETUNE_RADIUS;
  const logRadius = walkMode ? WALK_LOG_RADIUS : TARGET_LOG_RADIUS;

  const next = stabilizePadSnapshot(scope, current);

  setScopedValue(next, scope, 'padOscAWave', pickTargetValue(rng, getScopedString(next, scope, 'padOscAWave'), OSC_WAVES, walkMode ? 0.12 : 0.38));
  setScopedValue(next, scope, 'padOscBWave', pickTargetValue(rng, getScopedString(next, scope, 'padOscBWave'), OSC_WAVES, walkMode ? 0.12 : 0.38));
  setScopedValue(next, scope, 'padSubWave', pickTargetValue(rng, getScopedString(next, scope, 'padSubWave'), SUB_WAVES, walkMode ? 0.08 : 0.22));
  setScopedValue(next, scope, 'padNoiseType', pickTargetValue(rng, getScopedString(next, scope, 'padNoiseType'), NOISE_TYPES, walkMode ? 0.08 : 0.22));
  setScopedValue(next, scope, 'filterType', pickTargetValue(rng, getScopedString(next, scope, 'filterType'), FILTER_TYPES, walkMode ? 0.08 : 0.28));

  setScopedValue(
    next,
    scope,
    'padSubEnabled',
    maybe(rng, walkMode ? 0.08 : 0.18) ? !getScopedBoolean(next, scope, 'padSubEnabled') : getScopedBoolean(next, scope, 'padSubEnabled'),
  );
  setScopedValue(
    next,
    scope,
    'padFilterBEnabled',
    maybe(rng, walkMode ? 0.08 : 0.18) ? !getScopedBoolean(next, scope, 'padFilterBEnabled') : getScopedBoolean(next, scope, 'padFilterBEnabled'),
  );
  setScopedValue(
    next,
    scope,
    'padModEnvEnabled',
    maybe(rng, walkMode ? 0.08 : 0.18) ? !getScopedBoolean(next, scope, 'padModEnvEnabled') : getScopedBoolean(next, scope, 'padModEnvEnabled'),
  );

  setScopedValue(next, scope, 'padOscAOctave', mutateOctave(rng, getScopedNumber(next, scope, 'padOscAOctave'), -2, 2, walkMode));
  setScopedValue(next, scope, 'padOscBOctave', mutateOctave(rng, getScopedNumber(next, scope, 'padOscBOctave'), -2, 2, walkMode));
  setScopedValue(next, scope, 'padSubOctave', mutateOctave(rng, getScopedNumber(next, scope, 'padSubOctave'), -2, -1, walkMode));

  setScopedValue(next, scope, 'padOscADetune', mutateDetune(rng, scopeKey(scope, 'padOscADetune') as keyof SliderState, getScopedNumber(next, scope, 'padOscADetune'), detuneRadius));
  setScopedValue(next, scope, 'padOscBDetune', mutateDetune(rng, scopeKey(scope, 'padOscBDetune') as keyof SliderState, getScopedNumber(next, scope, 'padOscBDetune'), detuneRadius));
  if (scope === 'pad1') {
    setScopedValue(next, scope, 'detune', mutateDetune(rng, scopeKey(scope, 'detune') as keyof SliderState, getScopedNumber(next, scope, 'detune'), walkMode ? 4 : 12));
  }

  const linearKeys = [
    'padOscALevel',
    'padOscBLevel',
    'padSubLevel',
    'padNoiseLevel',
    'hardness',
    'warmth',
    'presence',
    'padFoldAmount',
    'filterResonance',
    'padFilterBResonance',
    'padLfo1Depth',
    'padLfo2Depth',
    'padModEnvSustain',
    'padModEnvDepth',
    'synthSustain',
    'padOscMix',
  ] as const;

  for (const key of linearKeys) {
    setScopedValue(next, scope, key, mutateLinear(rng, scopeKey(scope, key) as keyof SliderState, getScopedNumber(next, scope, key), linearRadius));
  }

  const qKeys = ['filterQ', 'padFilterBQ'] as const;
  for (const key of qKeys) {
    setScopedValue(next, scope, key, mutateLinear(rng, scopeKey(scope, key) as keyof SliderState, getScopedNumber(next, scope, key), qRadius));
  }

  const logKeys = [
    'synthAttack',
    'synthDecay',
    'synthRelease',
    'padLfo1Rate',
    'padLfo2Rate',
    'padModEnvAttack',
    'padModEnvDecay',
    'padModEnvRelease',
    'padFilterBCutoff',
  ] as const;

  for (const key of logKeys) {
    setScopedValue(next, scope, key, mutateLogarithmic(rng, scopeKey(scope, key) as keyof SliderState, getScopedNumber(next, scope, key), logRadius));
  }

  const currentMin = getScopedNumber(next, scope, 'filterCutoffMin');
  const currentMax = getScopedNumber(next, scope, 'filterCutoffMax');
  const currentCenter = Math.sqrt(Math.max(40, currentMin) * Math.max(50, currentMax));
  const currentSpread = Math.log2(Math.max(currentMax, currentMin + 40) / Math.max(40, currentMin));
  const nextCenter = mutateLogarithmic(rng, scopeKey(scope, 'filterCutoffMax') as keyof SliderState, currentCenter, walkMode ? 0.65 : 1.7);
  const nextSpread = clamp(currentSpread + randomSigned(rng) * (walkMode ? 0.5 : 1.5), 0.8, 6);
  const nextMin = nextCenter / Math.pow(2, nextSpread / 2);
  const nextMax = nextCenter * Math.pow(2, nextSpread / 2);
  setScopedValue(next, scope, 'filterCutoffMin', quantizeNumber(scopeKey(scope, 'filterCutoffMin') as keyof SliderState, nextMin));
  setScopedValue(next, scope, 'filterCutoffMax', quantizeNumber(scopeKey(scope, 'filterCutoffMax') as keyof SliderState, nextMax));

  const lfo1Dest = pickTargetValue(
    rng,
    getScopedString(next, scope, 'padLfo1Dest'),
    LFO_DESTS,
    walkMode ? 0.12 : 0.34,
  );
  const lfo2Dest = pickTargetValue(
    rng,
    getScopedString(next, scope, 'padLfo2Dest'),
    LFO_DESTS,
    walkMode ? 0.1 : 0.28,
  );
  setScopedValue(next, scope, 'padLfo1Dest', lfo1Dest);
  setScopedValue(next, scope, 'padLfo2Dest', lfo2Dest);
  setScopedValue(next, scope, 'padLfo1Wave', pickTargetValue(rng, getScopedString(next, scope, 'padLfo1Wave'), LFO_WAVES, lfo1Dest === 'none' ? 0.05 : (walkMode ? 0.18 : 0.42)));
  setScopedValue(next, scope, 'padLfo2Wave', pickTargetValue(rng, getScopedString(next, scope, 'padLfo2Wave'), LFO_WAVES, lfo2Dest === 'none' ? 0.05 : (walkMode ? 0.14 : 0.34)));

  const modEnvDest = pickTargetValue(
    rng,
    getScopedString(next, scope, 'padModEnvDest'),
    MOD_ENV_DESTS,
    walkMode ? 0.12 : 0.3,
  );
  setScopedValue(next, scope, 'padModEnvDest', modEnvDest);
  setScopedValue(next, scope, 'padFilterBType', pickTargetValue(rng, getScopedString(next, scope, 'padFilterBType'), FILTER_TYPES, walkMode ? 0.08 : 0.24));
  setScopedValue(next, scope, 'padFilterRouting', pickTargetValue(rng, getScopedString(next, scope, 'padFilterRouting'), FILTER_ROUTINGS, walkMode ? 0.06 : 0.18));

  if (getScopedString(next, scope, 'padLfo1Dest') === 'none') {
    setScopedValue(next, scope, 'padLfo1Depth', quantizeNumber(scopeKey(scope, 'padLfo1Depth') as keyof SliderState, getScopedNumber(next, scope, 'padLfo1Depth') * 0.35));
  }
  if (getScopedString(next, scope, 'padLfo2Dest') === 'none') {
    setScopedValue(next, scope, 'padLfo2Depth', quantizeNumber(scopeKey(scope, 'padLfo2Depth') as keyof SliderState, getScopedNumber(next, scope, 'padLfo2Depth') * 0.35));
  }

  return stabilizePadSnapshot(scope, next);
}
