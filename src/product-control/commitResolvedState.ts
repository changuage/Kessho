import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type {
  ProductEvent,
  ProductResolvedStateCommitReceipt,
  ProductSnapshotPatchReason,
} from '../audio/product/ProductEngineTypes';
import type { SliderState } from '../ui/state';
import { createInitialProductControlState } from './ProductControlState';
import type { ProductControlReason } from './ProductControlState';
import { nextProductControlRevision } from './ProductStateRevision';
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
};

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
  });
}

export async function commitVisibleSliderStateForProduct(
  productEngine: ProductEnginePort,
  sliders: SliderState,
  options: ResolveVisibleSliderStateCommitOptions = {},
): Promise<ProductResolvedStateCommitReceipt> {
  const revision = options.revision ?? nextProductControlRevision(productEngine.getCommittedStateRevision());
  return commitResolvedStateForProduct(
    productEngine,
    resolveVisibleSliderStateForProductCommit(sliders, {
      ...options,
      revision,
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
