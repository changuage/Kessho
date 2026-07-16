const MiB = 1024 * 1024;

export const MOBILE_PRODUCT_ASSET_BUDGET = Object.freeze({
  registeredSoftBytes: 160 * MiB,
  registeredHardBytes: 192 * MiB,
  hostDecodedBytes: 16 * MiB,
  maxConcurrentDecodes: 1,
});

export type CoreProductAssetAdmission =
  | { status: 'ready'; releaseAssetIds: readonly number[] }
  | {
      status: 'not-ready';
      reason: 'hard-budget' | 'document-hidden' | 'release-failed' | 'runtime-unavailable' | 'asset-closure-incomplete';
      requiredBytes: number;
      hardBytes: number;
    };

type RegisteredAsset = {
  bytes: number;
  lastRequiredRevision: number;
};

export class CoreProductAssetWorkingSet {
  private readonly registered = new Map<number, RegisteredAsset>();
  private readonly requiredAssetIds = new Set<number>();
  private revision = 0;

  constructor(
    private readonly softBytes = MOBILE_PRODUCT_ASSET_BUDGET.registeredSoftBytes,
    private readonly hardBytes = MOBILE_PRODUCT_ASSET_BUDGET.registeredHardBytes,
  ) {}

  setRequiredAssetIds(assetIds: Iterable<number>, revision: number): void {
    this.revision = Math.max(this.revision, Math.trunc(revision));
    this.requiredAssetIds.clear();
    for (const assetId of assetIds) {
      if (!Number.isInteger(assetId) || assetId <= 0) continue;
      this.requiredAssetIds.add(assetId);
      const registered = this.registered.get(assetId);
      if (registered) registered.lastRequiredRevision = this.revision;
    }
  }

  recordRegistration(assetId: number, bytes: number): void {
    this.registered.set(assetId, {
      bytes: Math.max(0, Math.round(bytes)),
      lastRequiredRevision: this.requiredAssetIds.has(assetId) ? this.revision : -1,
    });
  }

  recordRelease(assetId: number): void {
    this.registered.delete(assetId);
  }

  planAdmission(assetId: number, reservationBytes: number): CoreProductAssetAdmission {
    const reservation = Math.max(0, Math.round(reservationBytes));
    if (this.registered.has(assetId)) return { status: 'ready', releaseAssetIds: [] };
    const candidates = [...this.registered.entries()]
      .filter(([registeredAssetId]) => !this.requiredAssetIds.has(registeredAssetId))
      .sort((left, right) => left[1].lastRequiredRevision - right[1].lastRequiredRevision);
    let projectedBytes = this.registeredBytes() + reservation;
    const releaseAssetIds: number[] = [];
    for (const [registeredAssetId, entry] of candidates) {
      if (projectedBytes <= this.softBytes) break;
      projectedBytes -= entry.bytes;
      releaseAssetIds.push(registeredAssetId);
    }
    if (projectedBytes > this.hardBytes) {
      return {
        status: 'not-ready',
        reason: 'hard-budget',
        requiredBytes: projectedBytes,
        hardBytes: this.hardBytes,
      };
    }
    return { status: 'ready', releaseAssetIds };
  }

  obsoleteReleaseAssetIds(): readonly number[] {
    const admission = this.planAdmission(0, 0);
    return admission.status === 'ready' ? admission.releaseAssetIds : [];
  }

  registeredBytes(): number {
    let total = 0;
    for (const entry of this.registered.values()) total += entry.bytes;
    return total;
  }
}
