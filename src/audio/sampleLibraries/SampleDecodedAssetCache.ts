import {
  getDecodedCoreProductAssetByteLength,
  type DecodedCoreProductAsset,
} from '../coreProductAssets';
import type { SampleAssetDescriptor } from './sampleAssetDescriptors';
import { withSampleAssetMetadata } from './sampleAssetDescriptors';

export const DESKTOP_SAMPLE_CACHE_BYTES = 128 * 1024 * 1024;
export const MOBILE_SAMPLE_CACHE_BYTES = 32 * 1024 * 1024;

export interface SampleDecodedAssetCacheDiagnostics {
  hitCount: number;
  missCount: number;
  decodeCount: number;
  evictCount: number;
  bytesUsed: number;
  inFlightCount: number;
  entryCount: number;
}

export type SampleDecodedAssetLoader = (
  descriptor: SampleAssetDescriptor,
) => Promise<DecodedCoreProductAsset>;

type CacheEntry = {
  asset: DecodedCoreProductAsset;
  bytes: number;
};

export class SampleDecodedAssetCache {
  private readonly entries = new Map<number, CacheEntry>();
  private readonly inFlight = new Map<number, Promise<DecodedCoreProductAsset>>();
  private readonly requiredAssetIds = new Set<number>();
  private bytesUsed = 0;
  private hitCount = 0;
  private missCount = 0;
  private decodeCount = 0;
  private evictCount = 0;

  constructor(private maxBytes = DESKTOP_SAMPLE_CACHE_BYTES) {}

  resize(maxBytes: number): void {
    this.maxBytes = Math.max(0, Math.round(maxBytes));
    this.evictUntilWithinBudget();
  }

  setRequiredAssetIds(assetIds: Iterable<number>): void {
    this.requiredAssetIds.clear();
    for (const assetId of assetIds) {
      if (Number.isInteger(assetId) && assetId > 0) {
        this.requiredAssetIds.add(assetId);
      }
    }
    this.evictUntilWithinBudget();
  }

  has(assetId: number): boolean {
    return this.entries.has(assetId);
  }

  get(assetId: number): DecodedCoreProductAsset | null {
    const entry = this.entries.get(assetId);
    if (!entry) return null;
    this.touch(assetId, entry);
    this.hitCount += 1;
    return entry.asset;
  }

  async getOrLoad(
    descriptor: SampleAssetDescriptor,
    loader: SampleDecodedAssetLoader,
  ): Promise<DecodedCoreProductAsset> {
    const cached = this.entries.get(descriptor.assetId);
    if (cached) {
      this.touch(descriptor.assetId, cached);
      this.hitCount += 1;
      return cached.asset;
    }

    const pending = this.inFlight.get(descriptor.assetId);
    if (pending) {
      this.hitCount += 1;
      return pending;
    }

    this.missCount += 1;
    const promise = loader(descriptor)
      .then((asset) => {
        const assetWithMetadata = withSampleAssetMetadata(asset, descriptor);
        this.decodeCount += 1;
        this.insert(assetWithMetadata);
        return assetWithMetadata;
      })
      .finally(() => {
        this.inFlight.delete(descriptor.assetId);
      });
    this.inFlight.set(descriptor.assetId, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.requiredAssetIds.clear();
    this.bytesUsed = 0;
  }

  diagnostics(): SampleDecodedAssetCacheDiagnostics {
    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      decodeCount: this.decodeCount,
      evictCount: this.evictCount,
      bytesUsed: this.bytesUsed,
      inFlightCount: this.inFlight.size,
      entryCount: this.entries.size,
    };
  }

  private touch(assetId: number, entry: CacheEntry): void {
    this.entries.delete(assetId);
    this.entries.set(assetId, entry);
  }

  private insert(asset: DecodedCoreProductAsset): void {
    const existing = this.entries.get(asset.assetId);
    if (existing) {
      this.bytesUsed -= existing.bytes;
      this.entries.delete(asset.assetId);
    }

    const bytes = getDecodedCoreProductAssetByteLength(asset);
    this.entries.set(asset.assetId, { asset, bytes });
    this.bytesUsed += bytes;
    this.evictUntilWithinBudget(asset.assetId);
  }

  private evictUntilWithinBudget(protectedAssetId: number | null = null): void {
    while (this.bytesUsed > this.maxBytes && this.entries.size > 0) {
      const evictable = [...this.entries.entries()].find(([assetId]) => (
        assetId !== protectedAssetId && !this.requiredAssetIds.has(assetId)
      ));
      if (!evictable) return;
      const [assetId, entry] = evictable;
      this.entries.delete(assetId);
      this.bytesUsed -= entry.bytes;
      this.evictCount += 1;
    }
  }
}

export function defaultSampleDecodedAssetCacheBytes(
  navigatorLike: Pick<Navigator, 'maxTouchPoints' | 'userAgent'> | null | undefined = typeof navigator === 'undefined' ? null : navigator,
): number {
  const isLikelyMobile = Boolean(
    navigatorLike &&
      (navigatorLike.maxTouchPoints > 1 || /Mobile|Android|iPhone|iPad|iPod/i.test(navigatorLike.userAgent)),
  );
  return isLikelyMobile ? MOBILE_SAMPLE_CACHE_BYTES : DESKTOP_SAMPLE_CACHE_BYTES;
}
