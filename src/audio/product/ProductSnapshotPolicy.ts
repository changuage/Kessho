import type {
  ProductResolvedStateApplyMode,
  ProductSnapshotPatchReason,
} from './ProductEngineTypes';

export type ProductSnapshotReason =
  | ProductSnapshotPatchReason
  | 'deterministic-fixture'
  | 'schema-validation';

/** UI projection keys are intentionally outside the Product audio snapshot.
 * Keeping the allowlist here makes dirty classification explicit for future
 * state migrations instead of relying on accidental object omission. */
export const PRODUCT_HARMONY_UI_ONLY_KEYS = Object.freeze([
  'harmonyFocus',
  'harmonyDraft',
  'harmonyDraftDirty',
  'harmonySuggestionSelection',
  'harmonySuggestionDock',
  'harmonyDotMapSelection',
] as const);

export function isProductHarmonyUiOnlyKey(key: string): boolean {
  return (PRODUCT_HARMONY_UI_ONLY_KEYS as readonly string[]).includes(key);
}

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
