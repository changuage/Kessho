import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import type { SliderState } from '../ui/state';

export type ProductControlRevision = number;

export type ProductControlTarget = 'synth' | 'drum';

export type ProductControlActionReason =
  | 'manual-trigger'
  | 'session-restore'
  | 'ui-only';

export type ProductControlReason = ProductSnapshotPatchReason | ProductControlActionReason;

export type ProductControlSliderKey = keyof SliderState;

export type MorphEndpointName = 'A' | 'B';

export type MorphEndpointState = {
  readonly presetId: string | null;
  readonly sliders: SliderState;
  readonly label?: string;
};

export type MorphState = {
  readonly presetA: MorphEndpointState;
  readonly presetB: MorphEndpointState;
  readonly position: number;
  readonly keys?: readonly ProductControlSliderKey[];
};

export type MidMorphEditPolicy =
  | 'disallow-midpoint-edits'
  | 'visible-midpoint-override';

export type ProductSequencerPatch = Readonly<Record<string, unknown>>;

export type ProductTransportPatch = Readonly<Record<string, unknown>>;

export type SequencerControlState = Readonly<{
  patch: ProductSequencerPatch;
}>;

export type ProductControlOverrides = Readonly<{
  visibleMidpoint: Readonly<Record<ProductControlTarget, Partial<SliderState>>>;
}>;

export type ProductControlState = {
  readonly rawSliders: SliderState;
  readonly synthMorph: MorphState;
  readonly drumMorph: MorphState;
  readonly sequencer: SequencerControlState;
  readonly overrides: ProductControlOverrides;
  readonly revision: ProductControlRevision;
  readonly midMorphEditPolicy: MidMorphEditPolicy;
  readonly lastReason: ProductControlReason;
  readonly triggerCritical: boolean;
};

export function cloneSliderState(sliders: SliderState): SliderState {
  return { ...sliders };
}

export function createMorphEndpointState(
  sliders: SliderState,
  presetId: string | null = null,
  label?: string,
): MorphEndpointState {
  return {
    presetId,
    sliders: cloneSliderState(sliders),
    ...(label ? { label } : {}),
  };
}

export function createMorphState(
  sliders: SliderState,
  options: {
    presetAId?: string | null;
    presetBId?: string | null;
    position?: number;
    keys?: readonly ProductControlSliderKey[];
  } = {},
): MorphState {
  return {
    presetA: createMorphEndpointState(sliders, options.presetAId ?? null, 'A'),
    presetB: createMorphEndpointState(sliders, options.presetBId ?? options.presetAId ?? null, 'B'),
    position: clampMorphPosition(options.position ?? 0),
    ...(options.keys ? { keys: [...options.keys] } : {}),
  };
}

export function createInitialProductControlState(
  sliders: SliderState,
  options: {
    revision?: ProductControlRevision;
    synthMorphKeys?: readonly ProductControlSliderKey[];
    drumMorphKeys?: readonly ProductControlSliderKey[];
    midMorphEditPolicy?: MidMorphEditPolicy;
  } = {},
): ProductControlState {
  const rawSliders = cloneSliderState(sliders);
  return {
    rawSliders,
    synthMorph: createMorphState(rawSliders, { keys: options.synthMorphKeys ?? [] }),
    drumMorph: createMorphState(rawSliders, { keys: options.drumMorphKeys ?? [] }),
    sequencer: { patch: {} },
    overrides: { visibleMidpoint: { synth: {}, drum: {} } },
    revision: options.revision ?? 0,
    midMorphEditPolicy: options.midMorphEditPolicy ?? 'visible-midpoint-override',
    lastReason: 'runtime-bootstrap',
    triggerCritical: false,
  };
}

export function clampMorphPosition(position: number): number {
  if (!Number.isFinite(position)) return 0;
  return Math.max(0, Math.min(1, position));
}

export function isMorphEndpoint(position: number, endpoint: MorphEndpointName): boolean {
  const clamped = clampMorphPosition(position);
  return endpoint === 'A' ? clamped <= 0.000001 : clamped >= 0.999999;
}
