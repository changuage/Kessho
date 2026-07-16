import { CORE_PRODUCT_ASSET_FLAGS } from '../../coreProductAssets';
import type { SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import type { CoreProductAssetAdmission } from './CoreProductAssetWorkingSet';

export type CoreProductAssetEnsureResult =
  | { status: 'ready' }
  | Extract<CoreProductAssetAdmission, { status: 'not-ready' }>;

export type CoreProductBackgroundAssetClosure = {
  requiredAssetIds: readonly number[];
  pendingRegistrationAssetIds: readonly number[];
  registeredDecodedBytes: number;
  readinessRevision: number;
  ready: boolean;
  notReadyReason: Extract<CoreProductAssetEnsureResult, { status: 'not-ready' }>['reason'] | null;
};

export class CoreProductAssetNotReadyError extends Error {
  constructor(readonly result: Extract<CoreProductAssetEnsureResult, { status: 'not-ready' }>) {
    super(`Core Product assets are not ready: ${result.reason} (${result.requiredBytes}/${result.hardBytes} bytes)`);
    this.name = 'CoreProductAssetNotReadyError';
  }
}

export const SAMPLE_DECODE_RESERVATION_BYTES = 4 * 1024 * 1024;
export const SOUNDSCAPE_DECODE_RESERVATION_BYTES = 128 * 1024 * 1024;

export function coreProductStateUsesSoundscape(state: Record<string, unknown> | null): boolean {
  return !!state && [
    'oceanSampleEnabled', 'waterEnabled', 'insectsEnabled', 'insects2Enabled',
    'birdsEnabled', 'birds2Enabled', 'frogsEnabled',
  ].some((key) => state[key] === true);
}

export function coreProductSampleFlags(descriptor: SampleAssetDescriptor): number {
  return CORE_PRODUCT_ASSET_FLAGS.sample |
    (descriptor.libraryKey === 'piano' ? CORE_PRODUCT_ASSET_FLAGS.piano : 0) |
    (descriptor.loop ? CORE_PRODUCT_ASSET_FLAGS.loop : 0);
}

export class CoreProductAssetReleaseCoordinator {
  private readonly waiters = new Map<number, Array<(released: boolean) => void>>();

  request(assetId: number, release: (assetId: number) => void): Promise<boolean> {
    return new Promise((resolve) => {
      const waiters = this.waiters.get(assetId) ?? [];
      waiters.push(resolve);
      this.waiters.set(assetId, waiters);
      release(assetId);
    });
  }

  resolve(assetId: number, released: boolean): void {
    const waiters = this.waiters.get(assetId) ?? [];
    this.waiters.delete(assetId);
    for (const resolve of waiters) resolve(released);
  }
}

export function createCoreProductBackgroundAssetClosure(input: {
  requiredAssetIds: ReadonlySet<number>;
  registeredAssetIds: ReadonlySet<number>;
  pendingRegistrationAssetIds: ReadonlySet<number>;
  registeredDecodedBytes: number;
  readinessRevision: number;
  ensureResult: CoreProductAssetEnsureResult;
}): CoreProductBackgroundAssetClosure {
  const requiredAssetIds = [...input.requiredAssetIds].sort((left, right) => left - right);
  const pendingRegistrationAssetIds = [...input.pendingRegistrationAssetIds].sort((left, right) => left - right);
  const ready = input.ensureResult.status === 'ready' &&
    requiredAssetIds.every((assetId) => input.registeredAssetIds.has(assetId)) &&
    pendingRegistrationAssetIds.length === 0;
  return {
    requiredAssetIds,
    pendingRegistrationAssetIds,
    registeredDecodedBytes: input.registeredDecodedBytes,
    readinessRevision: input.readinessRevision,
    ready,
    notReadyReason: input.ensureResult.status === 'not-ready'
      ? input.ensureResult.reason
      : ready ? null : 'asset-closure-incomplete',
  };
}
