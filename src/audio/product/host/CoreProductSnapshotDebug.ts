import { CORE_PRODUCT_SOURCE_IDS } from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import { fnv1a32Bytes, hashJson } from '../../../debug/productStateDebugHash';
import { logProductStateDebug, productStateDebugEnabled } from '../../../debug/productStateDebug';
import type { ProductRuntimeSnapshotMetadata } from '../ProductEngineTypes';

type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];

function sourceForDebug(
  snapshot: CoreProductSnapshot,
  sourceId: number,
): ProductSourceSnapshot | undefined {
  return snapshot.sources.find((source) => source.sourceId === sourceId);
}

function summarizeSourceForDebug(source: ProductSourceSnapshot | undefined): Record<string, unknown> | null {
  if (!source) return null;

  const padOverrideBlock = {
    padOverrideCount: source.padOverrideCount,
    padOverrideIndices: source.padOverrideIndices,
    padOverrideValues: source.padOverrideValues,
  };
  const leadOverrideBlock = {
    leadOverrideCount: source.leadOverrideCount,
    leadOverrideIndices: source.leadOverrideIndices,
    leadOverrideValues: source.leadOverrideValues,
  };

  return {
    sourceId: source.sourceId,
    enabled: source.enabled,
    presetId: source.presetId,
    sourcePresetAId: source.sourcePresetAId,
    sourcePresetBId: source.sourcePresetBId,
    morph: source.morph,
    postLpfHz: source.postLpfHz,
    attackSeconds: source.attackSeconds,
    decaySeconds: source.decaySeconds,
    sustain: source.sustain,
    holdSeconds: source.holdSeconds,
    releaseSeconds: source.releaseSeconds,
    padOverrideHash: hashJson(padOverrideBlock),
    leadOverrideHash: hashJson(leadOverrideBlock),
    sourceSnapshotHash: hashJson(source),
  };
}

export function logEncodedSnapshotForDebug(
  snapshot: CoreProductSnapshot,
  reason: SnapshotReloadReason,
  encodedSnapshot: ArrayBuffer,
  metadata?: Omit<ProductRuntimeSnapshotMetadata, 'encodedSnapshotHash'>,
): void {
  if (!productStateDebugEnabled()) return;
  logProductStateDebug({
    stage: 'encoded-product-snapshot',
    reason,
    revision: metadata?.revision ?? null,
    encodedSnapshotHash: fnv1a32Bytes(encodedSnapshot),
    encodedByteLength: encodedSnapshot.byteLength,
    pad1: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.pad1)),
    pad2: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.pad2)),
    lead1: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.lead1)),
    lead2: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.lead2)),
  });
}
