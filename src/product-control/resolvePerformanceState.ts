import type {
  ProductEvent,
  ProductResolvedStateApplyMode,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
} from '../audio/product/ProductEngineTypes';
import { getAllMorphedDrumParams } from '../audio/drumMorph';
import type { SliderState } from '../ui/state';
import { buildResolvedProductPatch } from './buildResolvedProductPatch';
import {
  clampMorphPosition,
  type MorphState,
  type ProductControlReason,
  type ProductControlSliderKey,
  type ProductControlState,
} from './ProductControlState';

export type ResolvedPerformanceState = {
  readonly sliders: SliderState;
  readonly productPatch: ProductSnapshotPatch;
  readonly productEvents?: readonly ProductEvent[];
  readonly revision: number;
  readonly reason: ProductSnapshotPatchReason | ProductControlReason;
  readonly triggerCritical: boolean;
  readonly applyMode?: ProductResolvedStateApplyMode;
};

type ResolvePerformanceStateOptions = {
  readonly reason?: ProductSnapshotPatchReason | ProductControlReason;
  readonly triggerCritical?: boolean;
  readonly productEvents?: readonly ProductEvent[];
  readonly applyMode?: ProductResolvedStateApplyMode;
};

function mergeMorphKeys(morph: MorphState): ProductControlSliderKey[] {
  if (morph.keys && morph.keys.length > 0) return [...morph.keys];
  const keys = new Set<ProductControlSliderKey>();
  for (const key of Object.keys(morph.presetA.sliders) as ProductControlSliderKey[]) {
    if (!Object.is(morph.presetA.sliders[key], morph.presetB.sliders[key])) {
      keys.add(key);
    }
  }
  for (const key of Object.keys(morph.presetB.sliders) as ProductControlSliderKey[]) {
    if (!Object.is(morph.presetA.sliders[key], morph.presetB.sliders[key])) {
      keys.add(key);
    }
  }
  return [...keys];
}

function resolveMorphedValue(a: unknown, b: unknown, position: number): unknown {
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isFinite(a) &&
    Number.isFinite(b)
  ) {
    return a + (b - a) * position;
  }
  return position < 0.5 ? a : b;
}

function applyMorph(resolved: SliderState, morph: MorphState): SliderState {
  const position = clampMorphPosition(morph.position);
  const next = { ...resolved } as Record<string, unknown>;
  for (const key of mergeMorphKeys(morph)) {
    const a = morph.presetA.sliders[key];
    const b = morph.presetB.sliders[key];
    if (a === undefined && b === undefined) continue;
    next[key] = resolveMorphedValue(a, b, position);
  }
  return next as unknown as SliderState;
}

export function resolvePerformanceState(
  controlState: ProductControlState,
  options: ResolvePerformanceStateOptions = {},
): ResolvedPerformanceState {
  let sliders = { ...controlState.rawSliders } as SliderState;
  sliders = applyMorph(sliders, controlState.synthMorph);
  sliders = applyMorph(sliders, controlState.drumMorph);
  sliders = {
    ...sliders,
    ...controlState.sequencer.patch,
  } as SliderState;
  sliders = {
    ...sliders,
    ...getAllMorphedDrumParams(sliders, controlState.drumMorphOverrides),
  } as SliderState;
  sliders = {
    ...sliders,
    ...controlState.overrides.visibleMidpoint.synth,
    ...controlState.overrides.visibleMidpoint.drum,
  } as SliderState;

  return {
    sliders,
    productPatch: buildResolvedProductPatch(sliders),
    ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    revision: controlState.revision,
    reason: options.reason ?? controlState.lastReason,
    triggerCritical: options.triggerCritical ?? controlState.triggerCritical,
    ...(options.applyMode ? { applyMode: options.applyMode } : {}),
  };
}
