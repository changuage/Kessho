export type ProductDrumMorphVoice =
  | 'sub'
  | 'kick'
  | 'click'
  | 'beepHi'
  | 'beepLo'
  | 'noise'
  | 'membrane';

export type ProductDrumMorphEndpoint = 0 | 1;

export interface ProductDrumMorphOverride {
  value: number;
  morphPosition: number;
  isEndpoint: boolean;
}

export interface ProductDrumMorphEndpointState {
  isDualMode: boolean;
  value: number;
  range?: { min: number; max: number };
}

export interface ProductDrumMorphDualRangeOverride {
  endpoint0?: ProductDrumMorphEndpointState;
  endpoint1?: ProductDrumMorphEndpointState;
}

export interface ProductInterpolatedDrumMorphDualRange {
  isDualMode: boolean;
  range?: { min: number; max: number };
}

export type ProductDrumMorphOverrides = Readonly<
  Record<ProductDrumMorphVoice, Readonly<Record<string, ProductDrumMorphOverride>>>
>;

export type ProductDrumMorphDualRangeOverrides = Readonly<
  Record<ProductDrumMorphVoice, Readonly<Record<string, ProductDrumMorphDualRangeOverride>>>
>;

export type ProductDrumMorphOverrideState = Readonly<{
  valueOverrides: ProductDrumMorphOverrides;
  dualRangeOverrides: ProductDrumMorphDualRangeOverrides;
}>;

export const PRODUCT_DRUM_MORPH_VOICES: readonly ProductDrumMorphVoice[] = [
  'sub',
  'kick',
  'click',
  'beepHi',
  'beepLo',
  'noise',
  'membrane',
];

function emptyVoiceRecord<T>(): Record<ProductDrumMorphVoice, Record<string, T>> {
  return {
    sub: {},
    kick: {},
    click: {},
    beepHi: {},
    beepLo: {},
    noise: {},
    membrane: {},
  };
}

export function createInitialDrumMorphOverrideState(): ProductDrumMorphOverrideState {
  return {
    valueOverrides: emptyVoiceRecord<ProductDrumMorphOverride>(),
    dualRangeOverrides: emptyVoiceRecord<ProductDrumMorphDualRangeOverride>(),
  };
}

function clampMorphPosition(position: number): number {
  if (!Number.isFinite(position)) return 0;
  return Math.max(0, Math.min(1, position));
}

function isEndpointPosition(position: number): boolean {
  const clamped = clampMorphPosition(position);
  return clamped === 0 || clamped === 1;
}

function createSingleEndpointState(value: number): ProductDrumMorphEndpointState {
  return { isDualMode: false, value };
}

function createDualEndpointState(
  value: number,
  range: { min: number; max: number },
): ProductDrumMorphEndpointState {
  return { isDualMode: true, value, range: { ...range } };
}

function setEndpointState(
  existing: ProductDrumMorphDualRangeOverride | undefined,
  endpoint: ProductDrumMorphEndpoint,
  endpointState: ProductDrumMorphEndpointState,
): ProductDrumMorphDualRangeOverride {
  return endpoint === 0
    ? { ...existing, endpoint0: endpointState }
    : { ...existing, endpoint1: endpointState };
}

function withValueVoice(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  nextVoice: Record<string, ProductDrumMorphOverride>,
): ProductDrumMorphOverrideState {
  return {
    ...state,
    valueOverrides: {
      ...state.valueOverrides,
      [voice]: nextVoice,
    },
  };
}

function withDualRangeVoice(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  nextVoice: Record<string, ProductDrumMorphDualRangeOverride>,
): ProductDrumMorphOverrideState {
  return {
    ...state,
    dualRangeOverrides: {
      ...state.dualRangeOverrides,
      [voice]: nextVoice,
    },
  };
}

export function setProductDrumMorphOverride(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  param: string,
  value: number,
  morphPosition: number,
): ProductDrumMorphOverrideState {
  const nextVoice = {
    ...state.valueOverrides[voice],
    [param]: {
      value,
      morphPosition: clampMorphPosition(morphPosition),
      isEndpoint: isEndpointPosition(morphPosition),
    },
  };
  return withValueVoice(state, voice, nextVoice);
}

export function removeProductDrumMorphOverride(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  param: string,
): ProductDrumMorphOverrideState {
  if (!(param in state.valueOverrides[voice])) return state;
  const nextVoice = { ...state.valueOverrides[voice] };
  delete nextVoice[param];
  return withValueVoice(state, voice, nextVoice);
}

export function clearProductDrumMorphValueOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
): ProductDrumMorphOverrideState {
  if (Object.keys(state.valueOverrides[voice]).length === 0) return state;
  return withValueVoice(state, voice, {});
}

export function setProductDrumMorphDualRangeOverride(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  param: string,
  isDualMode: boolean,
  value: number,
  range: { min: number; max: number } | undefined,
  endpoint: ProductDrumMorphEndpoint,
): ProductDrumMorphOverrideState {
  const endpointState = isDualMode
    ? createDualEndpointState(value, range ?? { min: value, max: value })
    : createSingleEndpointState(value);
  const nextVoice = {
    ...state.dualRangeOverrides[voice],
    [param]: setEndpointState(state.dualRangeOverrides[voice][param], endpoint, endpointState),
  };
  return withDualRangeVoice(state, voice, nextVoice);
}

export function removeProductDrumMorphDualRangeOverride(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  param: string,
): ProductDrumMorphOverrideState {
  if (!(param in state.dualRangeOverrides[voice])) return state;
  const nextVoice = { ...state.dualRangeOverrides[voice] };
  delete nextVoice[param];
  return withDualRangeVoice(state, voice, nextVoice);
}

export function clearProductDrumMorphDualRangeOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
): ProductDrumMorphOverrideState {
  if (Object.keys(state.dualRangeOverrides[voice]).length === 0) return state;
  return withDualRangeVoice(state, voice, {});
}

export function clearProductDrumMorphOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
): ProductDrumMorphOverrideState {
  let next = clearProductDrumMorphValueOverrides(state, voice);
  next = clearProductDrumMorphDualRangeOverrides(next, voice);
  return next;
}

export function clearProductDrumMorphEndpointOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  endpoint: ProductDrumMorphEndpoint,
): ProductDrumMorphOverrideState {
  let changed = false;
  const nextValueVoice = { ...state.valueOverrides[voice] };
  for (const param of Object.keys(nextValueVoice)) {
    const override = nextValueVoice[param];
    if (!override?.isEndpoint) continue;
    if (
      (endpoint === 0 && override.morphPosition < 0.01) ||
      (endpoint === 1 && override.morphPosition > 0.99)
    ) {
      delete nextValueVoice[param];
      changed = true;
    }
  }

  const nextDualVoice = { ...state.dualRangeOverrides[voice] };
  for (const param of Object.keys(nextDualVoice)) {
    const override = nextDualVoice[param];
    if (!override) continue;
    const nextOverride = { ...override };
    if (endpoint === 0 && nextOverride.endpoint0) {
      delete nextOverride.endpoint0;
      changed = true;
    } else if (endpoint === 1 && nextOverride.endpoint1) {
      delete nextOverride.endpoint1;
      changed = true;
    }
    if (!nextOverride.endpoint0 && !nextOverride.endpoint1) {
      delete nextDualVoice[param];
    } else {
      nextDualVoice[param] = nextOverride;
    }
  }

  if (!changed) return state;
  return {
    ...state,
    valueOverrides: {
      ...state.valueOverrides,
      [voice]: nextValueVoice,
    },
    dualRangeOverrides: {
      ...state.dualRangeOverrides,
      [voice]: nextDualVoice,
    },
  };
}

export function clearProductDrumMorphMidpointOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
): ProductDrumMorphOverrideState {
  let changed = false;
  const nextVoice = { ...state.valueOverrides[voice] };
  for (const param of Object.keys(nextVoice)) {
    const override = nextVoice[param];
    if (!override?.isEndpoint) {
      delete nextVoice[param];
      changed = true;
    }
  }
  return changed ? withValueVoice(state, voice, nextVoice) : state;
}

export function getProductDrumMorphOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
): Readonly<Record<string, ProductDrumMorphOverride>> {
  return state.valueOverrides[voice];
}

export function getProductDrumMorphDualRangeOverrides(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
): Readonly<Record<string, ProductDrumMorphDualRangeOverride>> {
  return state.dualRangeOverrides[voice];
}

function interpolateDualRange(
  state0: ProductDrumMorphEndpointState,
  state1: ProductDrumMorphEndpointState,
  morphPosition: number,
): ProductInterpolatedDrumMorphDualRange {
  const position = clampMorphPosition(morphPosition);
  let morphedMin: number;
  let morphedMax: number;

  if (state0.isDualMode && state1.isDualMode) {
    const range0 = state0.range ?? { min: state0.value, max: state0.value };
    const range1 = state1.range ?? { min: state1.value, max: state1.value };
    morphedMin = range0.min + (range1.min - range0.min) * position;
    morphedMax = range0.max + (range1.max - range0.max) * position;
  } else if (state0.isDualMode && !state1.isDualMode) {
    const range0 = state0.range ?? { min: state0.value, max: state0.value };
    morphedMin = range0.min + (state1.value - range0.min) * position;
    morphedMax = range0.max + (state1.value - range0.max) * position;
  } else if (!state0.isDualMode && state1.isDualMode) {
    const range1 = state1.range ?? { min: state1.value, max: state1.value };
    morphedMin = state0.value + (range1.min - state0.value) * position;
    morphedMax = state0.value + (range1.max - state0.value) * position;
  } else {
    return { isDualMode: false };
  }

  return Math.abs(morphedMax - morphedMin) > 0.001
    ? { isDualMode: true, range: { min: morphedMin, max: morphedMax } }
    : { isDualMode: false };
}

export function interpolateProductDrumMorphDualRanges(
  state: ProductDrumMorphOverrideState,
  voice: ProductDrumMorphVoice,
  morphPosition: number,
  currentValues: Record<string, number>,
): Record<string, ProductInterpolatedDrumMorphDualRange> {
  const result: Record<string, ProductInterpolatedDrumMorphDualRange> = {};
  const overrides = state.dualRangeOverrides[voice];
  for (const param of Object.keys(overrides)) {
    const override = overrides[param];
    if (!override) continue;
    const state0 = override.endpoint0;
    const state1 = override.endpoint1;
    if (!state0 && !state1) continue;
    result[param] = interpolateDualRange(
      state0 ?? { isDualMode: false, value: currentValues[param] ?? 0 },
      state1 ?? { isDualMode: false, value: currentValues[param] ?? 0 },
      morphPosition,
    );
  }
  return result;
}
