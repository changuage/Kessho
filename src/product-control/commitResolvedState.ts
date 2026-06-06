import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type {
  ProductEvent,
  ProductResolvedStateApplyMode,
  ProductResolvedStateCommitReceipt,
  ProductSnapshotPatchReason,
} from '../audio/product/ProductEngineTypes';
import type { SliderState } from '../ui/state';
import type { ProductControlAction } from './ProductControlActions';
import {
  createInitialProductControlState,
  type ProductControlStatePatch,
  type ProductControlStateRecord,
} from './ProductControlState';
import type { ProductControlReason, ProductControlState } from './ProductControlState';
import { reduceProductControlState } from './controlReducer';
import {
  hydrateProductControlLeadPresetDataPatch,
  PRODUCT_CONTROL_LEAD_PRESET_DATA_KEYS,
} from './leadPresetData';
import { resolvePerformanceState } from './resolvePerformanceState';
import type { ResolvedPerformanceState } from './resolvePerformanceState';

const PRODUCT_PATCH_REASONS = new Set<ProductSnapshotPatchReason>([
  'ui-control-change',
  'fx-control-change',
  'morph-control-change',
  'journey-morph-change',
  'sequencer-edit',
  'sequencer-control-change',
  'midi-cc-control-change',
  'transport-change',
  'asset-reference-change',
  'preset-load',
  'runtime-start',
  'runtime-bootstrap',
  'debug-force-reload',
]);

export function productPatchReasonForResolvedState(reason: ProductControlReason): ProductSnapshotPatchReason {
  return PRODUCT_PATCH_REASONS.has(reason as ProductSnapshotPatchReason)
    ? reason as ProductSnapshotPatchReason
    : 'ui-control-change';
}

export type ResolveVisibleSliderStateCommitOptions = {
  readonly revision?: number;
  readonly reason?: ProductSnapshotPatchReason | ProductControlReason;
  readonly triggerCritical?: boolean;
  readonly productEvents?: readonly ProductEvent[];
  readonly forceFullSnapshot?: boolean;
  readonly applyMode?: ProductResolvedStateApplyMode;
  readonly presetId?: string;
};

export type ProductControlPatchCommitOptions = Omit<ResolveVisibleSliderStateCommitOptions, 'revision'>;

export type ProductControlActionTriggerOptions = ProductControlPatchCommitOptions & {
  readonly syncVisibleSliders?: boolean;
};

const productControlStateByEngine = new WeakMap<ProductEnginePort, ProductControlState>();

function getAlignedProductControlStateRecordForEngine(
  productEngine: ProductEnginePort,
  sliders: SliderState,
): { state: ProductControlState; initialized: boolean } {
  const committedRevision = productEngine.getCommittedStateRevision();
  const existing = productControlStateByEngine.get(productEngine);
  return {
    state: alignProductControlStateRevision(
      existing ?? createInitialProductControlState(sliders, { revision: committedRevision }),
      committedRevision,
    ),
    initialized: existing === undefined,
  };
}

function getAlignedProductControlStateForEngine(
  productEngine: ProductEnginePort,
  sliders: SliderState,
): ProductControlState {
  return getAlignedProductControlStateRecordForEngine(productEngine, sliders).state;
}

function applyModeForCommitOptions(
  options: Pick<ResolveVisibleSliderStateCommitOptions, 'applyMode' | 'forceFullSnapshot'>,
): ProductResolvedStateApplyMode | undefined {
  if (options.forceFullSnapshot) return 'full-snapshot';
  return options.applyMode;
}

function alignProductControlStateRevision(
  state: ProductControlState,
  committedRevision: number,
): ProductControlState {
  return committedRevision > state.revision
    ? { ...state, revision: committedRevision }
    : state;
}

function collectProductControlSliderPatch(
  previous: ProductControlStateRecord,
  next: SliderState,
): ProductControlStatePatch {
  const patch: ProductControlStatePatch = {};
  for (const key of Object.keys(next) as Array<keyof SliderState>) {
    if (!Object.is(previous[key], next[key])) {
      (patch as Record<string, unknown>)[key as string] = next[key];
    }
  }
  return patch;
}

function productControlActionForVisiblePatch(
  sliders: SliderState,
  patch: ProductControlStatePatch,
  options: ProductControlPatchCommitOptions = {},
): ProductControlAction {
  const reason = options.reason ?? 'ui-control-change';
  const triggerCritical = options.triggerCritical ?? true;
  const hydratedSliders = { ...sliders, ...patch } as SliderState;
  if (reason === 'preset-load') {
    return {
      type: 'preset/load',
      presetId: options.presetId ?? 'visible-preset-load',
      sliders: hydratedSliders,
    };
  }
  if (reason === 'transport-change') {
    return {
      type: 'transport/edit',
      patch: patch as Readonly<Record<string, unknown>>,
      triggerCritical,
    };
  }
  if (reason === 'sequencer-control-change' || reason === 'sequencer-edit') {
    return {
      type: 'sequencer/edit',
      patch: patch as Readonly<Record<string, unknown>>,
      triggerCritical,
    };
  }
  const keys = Object.keys(patch) as Array<keyof SliderState>;
  if (keys.length === 1 && !PRODUCT_CONTROL_LEAD_PRESET_DATA_KEYS.has(String(keys[0]))) {
    const key = keys[0]!;
    return {
      type: 'slider/edit',
      key,
      value: patch[key] as SliderState[typeof key],
      triggerCritical,
    };
  }
  return {
    type: 'slider/patch',
    patch,
    reason,
    triggerCritical,
  };
}

function visibleSliderSyncCommitOptions(
  options: ProductControlActionTriggerOptions,
  triggerCritical: boolean,
): ProductControlPatchCommitOptions {
  return {
    reason: 'ui-control-change',
    triggerCritical,
    forceFullSnapshot: options.forceFullSnapshot,
  };
}

export function reduceVisibleSliderPatchForProductCommit(
  previous: ProductControlState,
  sliders: SliderState,
  patch: ProductControlStatePatch,
  options: ProductControlPatchCommitOptions = {},
): ProductControlState {
  return reduceProductControlState(
    previous,
    productControlActionForVisiblePatch(sliders, patch, options),
  );
}

export function reduceVisibleSliderStateForProductCommit(
  previous: ProductControlState,
  sliders: SliderState,
  options: ResolveVisibleSliderStateCommitOptions = {},
): ProductControlState {
  return reduceVisibleSliderPatchForProductCommit(
    previous,
    sliders,
    collectProductControlSliderPatch(previous.rawSliders, sliders),
    options,
  );
}

export function resolveVisibleSliderStateForProductCommit(
  sliders: SliderState,
  options: ResolveVisibleSliderStateCommitOptions = {},
): ResolvedPerformanceState {
  const reason = options.reason ?? 'ui-control-change';
  const controlState = {
    ...createInitialProductControlState(sliders, {
      revision: options.revision ?? 0,
    }),
    lastReason: reason,
    triggerCritical: options.triggerCritical ?? true,
  };
  return resolvePerformanceState(controlState, {
    reason,
    triggerCritical: options.triggerCritical ?? true,
    ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    ...(applyModeForCommitOptions(options) ? { applyMode: applyModeForCommitOptions(options) } : {}),
  });
}

export async function commitVisibleSliderStateForProduct(
  productEngine: ProductEnginePort,
  sliders: SliderState,
  options: ResolveVisibleSliderStateCommitOptions = {},
): Promise<ProductResolvedStateCommitReceipt> {
  const previousControlState = getAlignedProductControlStateForEngine(productEngine, sliders);
  const patch = await hydrateProductControlLeadPresetDataPatch(
    previousControlState.rawSliders,
    collectProductControlSliderPatch(previousControlState.rawSliders, sliders),
  );
  const nextControlState = reduceVisibleSliderPatchForProductCommit(previousControlState, sliders, patch, options);
  const applyMode = applyModeForCommitOptions(options);
  const resolved = resolvePerformanceState(nextControlState, {
    reason: options.reason ?? nextControlState.lastReason,
    triggerCritical: options.triggerCritical ?? nextControlState.triggerCritical,
    ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    ...(applyMode ? { applyMode } : {}),
  });
  const receipt = await commitResolvedStateForProduct(productEngine, resolved);
  if (receipt.applied) {
    productControlStateByEngine.set(productEngine, nextControlState);
  }
  return receipt;
}

export async function commitProductControlPatchForProduct(
  productEngine: ProductEnginePort,
  sliders: SliderState,
  patch: Partial<SliderState>,
  options: ProductControlPatchCommitOptions = {},
): Promise<ProductResolvedStateCommitReceipt> {
  const previousControlState = getAlignedProductControlStateForEngine(productEngine, sliders);
  const hydratedPatch = await hydrateProductControlLeadPresetDataPatch(
    previousControlState.rawSliders,
    patch as ProductControlStatePatch,
  );
  const nextControlState = reduceVisibleSliderPatchForProductCommit(previousControlState, sliders, hydratedPatch, options);
  const applyMode = applyModeForCommitOptions(options);
  const resolved = resolvePerformanceState(nextControlState, {
    reason: options.reason ?? nextControlState.lastReason,
    triggerCritical: options.triggerCritical ?? nextControlState.triggerCritical,
    ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    ...(applyMode ? { applyMode } : {}),
  });
  const receipt = await commitResolvedStateForProduct(productEngine, resolved);
  if (receipt.applied) {
    productControlStateByEngine.set(productEngine, nextControlState);
  }
  return receipt;
}

export async function commitProductControlActionForProduct(
  productEngine: ProductEnginePort,
  sliders: SliderState,
  action: ProductControlAction,
  options: ProductControlActionTriggerOptions = {},
): Promise<ProductResolvedStateCommitReceipt> {
  const aligned = getAlignedProductControlStateRecordForEngine(productEngine, sliders);
  let nextControlState = aligned.state;
  if (options.syncVisibleSliders !== false) {
    const patch = collectProductControlSliderPatch(nextControlState.rawSliders, sliders);
    const hydratedPatch = await hydrateProductControlLeadPresetDataPatch(nextControlState.rawSliders, patch);
    if (Object.keys(hydratedPatch).length > 0 || options.forceFullSnapshot) {
      nextControlState = reduceVisibleSliderPatchForProductCommit(
        nextControlState,
        sliders,
        hydratedPatch,
        visibleSliderSyncCommitOptions(options, options.triggerCritical ?? true),
      );
    }
  }
  nextControlState = reduceProductControlState(nextControlState, action);
  const applyMode = applyModeForCommitOptions(options);
  const resolved = resolvePerformanceState(nextControlState, {
    reason: options.reason ?? nextControlState.lastReason,
    triggerCritical: options.triggerCritical ?? nextControlState.triggerCritical,
    ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    ...(applyMode ? { applyMode } : {}),
  });
  const receipt = await commitResolvedStateForProduct(productEngine, resolved);
  if (receipt.applied) {
    productControlStateByEngine.set(productEngine, nextControlState);
  }
  return receipt;
}

export async function commitProductControlActionThenTrigger<T>(
  productEngine: ProductEnginePort,
  sliders: SliderState,
  action: ProductControlAction,
  trigger: (revision: number) => Promise<T> | T,
  options: ProductControlActionTriggerOptions = {},
): Promise<T> {
  const aligned = getAlignedProductControlStateRecordForEngine(productEngine, sliders);
  let nextControlState = aligned.state;
  if (options.syncVisibleSliders !== false) {
    const patch = collectProductControlSliderPatch(nextControlState.rawSliders, sliders);
    const hydratedPatch = await hydrateProductControlLeadPresetDataPatch(nextControlState.rawSliders, patch);
    if (aligned.initialized || Object.keys(hydratedPatch).length > 0 || options.forceFullSnapshot) {
      nextControlState = reduceVisibleSliderPatchForProductCommit(
        nextControlState,
        sliders,
        hydratedPatch,
        visibleSliderSyncCommitOptions(options, true),
      );
    }
  }
  nextControlState = reduceProductControlState(nextControlState, action);
  const applyMode = applyModeForCommitOptions(options);
  const resolved = resolvePerformanceState(nextControlState, {
    reason: options.reason ?? nextControlState.lastReason,
    triggerCritical: options.triggerCritical ?? nextControlState.triggerCritical,
    ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    ...(applyMode ? { applyMode } : {}),
  });
  const receipt = await commitResolvedStateForProduct(productEngine, resolved);
  const committedRevision = productEngine.getCommittedStateRevision();
  if (resolved.triggerCritical && (!receipt.applied || committedRevision < resolved.revision)) {
    throw new Error(`Product state revision ${resolved.revision} was not committed before trigger`);
  }
  if (receipt.applied) {
    productControlStateByEngine.set(productEngine, nextControlState);
  }
  return trigger(resolved.revision);
}

export function getProductControlStateForProductEngine(
  productEngine: ProductEnginePort,
  sliders: SliderState,
): ProductControlState {
  const controlState = getAlignedProductControlStateForEngine(productEngine, sliders);
  productControlStateByEngine.set(productEngine, controlState);
  return controlState;
}

export function dispatchProductControlActionForProductEngine(
  productEngine: ProductEnginePort,
  sliders: SliderState,
  action: ProductControlAction,
): ProductControlState {
  const previousControlState = getAlignedProductControlStateForEngine(productEngine, sliders);
  const nextControlState = reduceProductControlState(previousControlState, action);
  productControlStateByEngine.set(productEngine, nextControlState);
  return nextControlState;
}

export function resetProductControlStateForProductEngine(
  productEngine: ProductEnginePort,
  sliders?: SliderState,
): void {
  if (!sliders) {
    productControlStateByEngine.delete(productEngine);
    return;
  }
  productControlStateByEngine.set(
    productEngine,
    createInitialProductControlState(sliders, {
      revision: productEngine.getCommittedStateRevision(),
    }),
  );
}

export async function commitResolvedStateForProduct(
  productEngine: ProductEnginePort,
  resolved: ResolvedPerformanceState,
): Promise<ProductResolvedStateCommitReceipt> {
  return productEngine.commitResolvedState({
    revision: resolved.revision,
    reason: productPatchReasonForResolvedState(resolved.reason),
    patch: resolved.productPatch,
    events: resolved.productEvents,
    triggerCritical: resolved.triggerCritical,
    applyMode: resolved.applyMode,
  });
}

export async function commitThenTrigger<T>(
  productEngine: ProductEnginePort,
  resolved: ResolvedPerformanceState,
  trigger: (revision: number) => Promise<T> | T,
): Promise<T> {
  const receipt = await commitResolvedStateForProduct(productEngine, resolved);
  const committedRevision = productEngine.getCommittedStateRevision();
  if (resolved.triggerCritical && (!receipt.applied || committedRevision < resolved.revision)) {
    throw new Error(`Product state revision ${resolved.revision} was not committed before trigger`);
  }
  return trigger(resolved.revision);
}
