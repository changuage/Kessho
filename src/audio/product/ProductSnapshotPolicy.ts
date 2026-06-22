import type {
  ProductResolvedStateApplyMode,
  ProductSnapshotPatchReason,
} from './ProductEngineTypes';

export type ProductSnapshotReason =
  | ProductSnapshotPatchReason
  | 'deterministic-fixture'
  | 'schema-validation';

const FULL_SNAPSHOT_ALLOWED_REASONS = new Set<ProductSnapshotReason>([
  'runtime-start',
  'runtime-bootstrap',
  'preset-load',
  'session-restore',
  'asset-reference-change',
  'deterministic-fixture',
  'schema-validation',
  'debug-force-reload',
]);

export function requestedApplyModeAllowedForReason(
  reason: ProductSnapshotReason | string,
  mode: ProductResolvedStateApplyMode,
): boolean {
  if (mode !== 'full-snapshot') return true;
  return FULL_SNAPSHOT_ALLOWED_REASONS.has(reason as ProductSnapshotReason);
}

export function resolveProductApplyModeForReason(
  reason: ProductSnapshotReason | string,
  requestedMode: ProductResolvedStateApplyMode | undefined,
): ProductResolvedStateApplyMode | undefined {
  if (!requestedMode) return undefined;
  return requestedApplyModeAllowedForReason(reason, requestedMode) ? requestedMode : undefined;
}
