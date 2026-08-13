import {
  CORE_PRODUCT_ASSET_FLAGS,
  decodeCoreProductAsset,
  getDecodedCoreProductAssetByteLength,
  type DecodedCoreProductAsset,
} from '../../coreProductAssets';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import type { SampleDecodedAssetCache } from '../../sampleLibraries/SampleDecodedAssetCache';
import {
  SAMPLE_DECODE_RESERVATION_BYTES,
  SOUNDSCAPE_DECODE_RESERVATION_BYTES,
  coreProductSampleFlags,
  type CoreProductAssetEnsureResult,
} from './CoreProductAssetReadiness';

type AssetDecoder = typeof decodeCoreProductAsset;
type NotReadyReason = Extract<CoreProductAssetEnsureResult, { status: 'not-ready' }>['reason'];
type SoundscapeDescriptor = { readonly assetId: number; readonly url: string };

type CoreProductAssetDecodeServiceOptions = {
  runtime: CoreProductRuntime;
  cache: SampleDecodedAssetCache;
  mobile: boolean;
  transferAssets: boolean;
  decodeAsset: AssetDecoder;
  registeredAssetIds: ReadonlySet<number>;
  pendingRegistrationAssetIds: Set<number>;
  isRequired: (assetId: number) => boolean;
  prepareAdmission: (assetId: number, reservationBytes: number) => Promise<boolean>;
  canStartDecode: () => boolean;
  setNotReady: (reason: NotReadyReason, additionalBytes?: number) => void;
  registerAsset: (asset: DecodedCoreProductAsset) => Promise<void>;
  runMobileOperation: <T>(operation: () => Promise<T>) => Promise<T>;
};

export class CoreProductAssetDecodeService {
  private readonly soundscapePromises = new Map<number, Promise<void>>();
  private inFlightDecodedBytes = 0;

  constructor(private readonly options: CoreProductAssetDecodeServiceOptions) {}

  clear(): void {
    this.soundscapePromises.clear();
    this.inFlightDecodedBytes = 0;
  }

  forget(assetId: number): void {
    this.soundscapePromises.delete(assetId);
  }

  inFlightBytes(): number {
    return this.inFlightDecodedBytes;
  }

  async ensureSampleAssets(descriptors: readonly SampleAssetDescriptor[]): Promise<void> {
    await Promise.all(descriptors.map((descriptor) => (
      this.options.runMobileOperation(() => this.ensureSampleAsset(descriptor, true))
    )));
  }

  async ensureSampleAsset(descriptor: SampleAssetDescriptor, requireCurrent = false): Promise<void> {
    if (this.options.registeredAssetIds.has(descriptor.assetId)) return;
    if (requireCurrent && !this.options.isRequired(descriptor.assetId)) return;
    const context = this.options.runtime.audioContext;
    if (!context) return this.options.setNotReady('runtime-unavailable', SAMPLE_DECODE_RESERVATION_BYTES);
    if (!await this.options.prepareAdmission(descriptor.assetId, SAMPLE_DECODE_RESERVATION_BYTES)) return;
    if (!this.options.canStartDecode()) return this.options.setNotReady('document-hidden', SAMPLE_DECODE_RESERVATION_BYTES);
    this.options.pendingRegistrationAssetIds.add(descriptor.assetId);
    try {
      const asset = await this.options.cache.getOrLoad(descriptor, (candidate) => this.withDecodeReservation(
        SAMPLE_DECODE_RESERVATION_BYTES,
        () => this.options.decodeAsset(context, candidate.assetId, candidate.url, coreProductSampleFlags(candidate)),
      ));
      if (requireCurrent && !this.options.isRequired(asset.assetId)) {
        if (this.options.transferAssets) this.options.cache.take(asset.assetId);
        return;
      }
      const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
      if (!await this.options.prepareAdmission(descriptor.assetId, decodedBytes)) {
        if (this.options.transferAssets) this.options.cache.take(asset.assetId);
        return;
      }
      if (!this.options.registeredAssetIds.has(asset.assetId)) {
        const ownedAsset = this.options.transferAssets ? (this.options.cache.take(asset.assetId) ?? asset) : asset;
        await this.options.registerAsset(ownedAsset);
      }
    } finally {
      this.options.pendingRegistrationAssetIds.delete(descriptor.assetId);
    }
  }

  async ensureSoundscapeAssets(descriptors: readonly SoundscapeDescriptor[]): Promise<void> {
    await Promise.all(descriptors.map((descriptor) => this.options.runMobileOperation(
      () => this.ensureSoundscapeAsset(descriptor),
    )));
  }

  private async ensureSoundscapeAsset(descriptor: SoundscapeDescriptor): Promise<void> {
    const { assetId, url } = descriptor;
    if (this.options.registeredAssetIds.has(assetId)) return;
    if (!this.options.isRequired(assetId)) return;
    const pending = this.soundscapePromises.get(assetId);
    if (pending) return pending;
    const context = this.options.runtime.audioContext;
    if (!context) return this.options.setNotReady('runtime-unavailable', SOUNDSCAPE_DECODE_RESERVATION_BYTES);
    if (!await this.options.prepareAdmission(assetId, SOUNDSCAPE_DECODE_RESERVATION_BYTES)) return;
    if (!this.options.canStartDecode()) return this.options.setNotReady('document-hidden', SOUNDSCAPE_DECODE_RESERVATION_BYTES);
    this.options.pendingRegistrationAssetIds.add(assetId);
    const promise = this.withDecodeReservation(SOUNDSCAPE_DECODE_RESERVATION_BYTES, () => this.options.decodeAsset(
      context,
      assetId,
      url,
      CORE_PRODUCT_ASSET_FLAGS.loop | CORE_PRODUCT_ASSET_FLAGS.soundscape,
    )).then(async (asset) => {
      if (!this.options.isRequired(asset.assetId)) return;
      const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
      if (await this.options.prepareAdmission(asset.assetId, decodedBytes)) await this.options.registerAsset(asset);
    }).finally(() => {
      this.soundscapePromises.delete(assetId);
      this.options.pendingRegistrationAssetIds.delete(assetId);
    });
    this.soundscapePromises.set(assetId, promise);
    await promise;
  }

  private async withDecodeReservation<T>(bytes: number, operation: () => Promise<T>): Promise<T> {
    this.inFlightDecodedBytes += bytes;
    try {
      return await operation();
    } finally {
      this.inFlightDecodedBytes = Math.max(0, this.inFlightDecodedBytes - bytes);
    }
  }
}
