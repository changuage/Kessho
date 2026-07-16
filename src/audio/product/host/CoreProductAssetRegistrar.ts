import {
  CORE_PRODUCT_ASSET_FLAGS,
  decodeCoreProductAsset,
  getDecodedCoreProductAssetByteLength,
  getCoreProductSoundscapeAssetDescriptorsForState,
  type DecodedCoreProductAsset,
} from '../../coreProductAssets';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { AssetTransferOwnership } from '../../coreProductRuntime';
import type { SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import { SampleDecodedAssetCache, defaultSampleDecodedAssetCacheBytes } from '../../sampleLibraries/SampleDecodedAssetCache';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';
import {
  predictedSampleAssetsForState,
  sampleDescriptorForSlotNote,
  samplePredictionState,
} from './CoreProductSampleAssetResolver';
import { isIOSLikeDevice, isMobileDevice } from '../../../platform';
import { CoreProductAssetWorkingSet, MOBILE_PRODUCT_ASSET_BUDGET } from './CoreProductAssetWorkingSet';
import {
  CoreProductAssetNotReadyError,
  CoreProductAssetReleaseCoordinator,
  SAMPLE_DECODE_RESERVATION_BYTES,
  SOUNDSCAPE_DECODE_RESERVATION_BYTES,
  coreProductSampleFlags,
  coreProductStateUsesSoundscape,
  createCoreProductBackgroundAssetClosure,
  type CoreProductAssetEnsureResult,
  type CoreProductBackgroundAssetClosure,
} from './CoreProductAssetReadiness';
export { CoreProductAssetNotReadyError } from './CoreProductAssetReadiness';
export type { CoreProductAssetEnsureResult, CoreProductBackgroundAssetClosure } from './CoreProductAssetReadiness';

type SliderStateReader = () => Record<string, unknown> | null;
type AssetDecoder = typeof decodeCoreProductAsset;

export class CoreProductAssetRegistrar {
  private readonly registeredAssetIds = new Set<number>();
  private readonly pendingReleaseAssetIds = new Set<number>();
  private readonly pendingRegistrationAssetIds = new Set<number>();
  private readonly requiredAssetIds = new Set<number>();
  private readonly defaultSoundscapeAssetPromises = new Map<number, Promise<void>>();
  private readonly registeredAssetDecodedBytes = new Map<number, number>();
  private readonly mobile: boolean;
  private readonly sampleAssetCache: SampleDecodedAssetCache;
  private readonly workingSet = new CoreProductAssetWorkingSet();
  private readonly releaseCoordinator = new CoreProductAssetReleaseCoordinator();
  private mobileOperationTail: Promise<void> = Promise.resolve();
  private requiredRevision = 0;
  private ensureResult: CoreProductAssetEnsureResult = { status: 'ready' };
  private inFlightDecodedBytes = 0;

  constructor(
    private readonly runtime: CoreProductRuntime,
    private readonly readSliderState: SliderStateReader,
    mobile = isMobileDevice() || isIOSLikeDevice(),
    private readonly decodeAsset: AssetDecoder = decodeCoreProductAsset,
    private readonly documentVisible: () => boolean = () => (
      typeof document === 'undefined' || document.visibilityState === 'visible'
    ),
  ) {
    this.mobile = mobile;
    this.sampleAssetCache = new SampleDecodedAssetCache(
      mobile ? MOBILE_PRODUCT_ASSET_BUDGET.hostDecodedBytes : defaultSampleDecodedAssetCacheBytes(),
    );
    this.runtime.setAssetReleaseCallback((assetId) => this.handleAssetReleaseComplete(assetId));
    this.runtime.setAssetReleaseFailureCallback((assetId) => this.handleAssetReleaseFailure(assetId));
  }

  clear(): void {
    this.registeredAssetIds.clear();
    this.pendingReleaseAssetIds.clear();
    this.pendingRegistrationAssetIds.clear();
    this.requiredAssetIds.clear();
    this.registeredAssetDecodedBytes.clear();
    this.defaultSoundscapeAssetPromises.clear();
    this.sampleAssetCache.clear();
  }

  async registerAsset(asset: DecodedCoreProductAsset): Promise<void> {
    if (this.registeredAssetIds.has(asset.assetId) || this.pendingReleaseAssetIds.has(asset.assetId)) {
      throw new Error(`Core Product asset ${asset.assetId} is already registered or pending release`);
    }
    const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
    const ownership: AssetTransferOwnership = this.mobile ? 'transfer' : 'retain-host-copy';
    await this.runtime.registerAsset(asset, ownership);
    this.registeredAssetIds.add(asset.assetId);
    this.registeredAssetDecodedBytes.set(asset.assetId, decodedBytes);
    this.workingSet.recordRegistration(asset.assetId, decodedBytes);
  }

  unregisterAsset(assetId: number): void {
    if (!this.registeredAssetIds.has(assetId) || this.pendingReleaseAssetIds.has(assetId)) return;
    this.pendingReleaseAssetIds.add(assetId);
    this.runtime.requestAssetRelease(assetId);
  }

  private handleAssetReleaseComplete(assetId: number): void {
    this.pendingReleaseAssetIds.delete(assetId);
    this.registeredAssetIds.delete(assetId);
    this.registeredAssetDecodedBytes.delete(assetId);
    this.defaultSoundscapeAssetPromises.delete(assetId);
    this.workingSet.recordRelease(assetId);
    this.releaseCoordinator.resolve(assetId, true);
  }

  private handleAssetReleaseFailure(assetId: number): void {
    this.pendingReleaseAssetIds.delete(assetId);
    this.setNotReady('release-failed');
    this.releaseCoordinator.resolve(assetId, false);
  }

  registeredDecodedAssetByteLength(): number {
    let total = 0;
    for (const bytes of this.registeredAssetDecodedBytes.values()) {
      total += bytes;
    }
    return total;
  }

  hostDecodedBytes(): number {
    return this.sampleAssetCache.diagnostics().bytesUsed;
  }

  inFlightDecodedByteLength(): number {
    return this.inFlightDecodedBytes;
  }

  backgroundAssetClosure(): CoreProductBackgroundAssetClosure {
    return createCoreProductBackgroundAssetClosure({
      requiredAssetIds: this.requiredAssetIds,
      registeredAssetIds: this.registeredAssetIds,
      pendingRegistrationAssetIds: this.pendingRegistrationAssetIds,
      registeredDecodedBytes: this.registeredDecodedAssetByteLength(),
      readinessRevision: this.requiredRevision,
      ensureResult: this.ensureResult,
    });
  }

  hasMissingDefaultAssetsForState(): boolean {
    return this.hasMissingPredictedSampleAssets() || this.hasMissingDefaultSoundscapeAsset();
  }

  async ensureDefaultAssetsForState(): Promise<CoreProductAssetEnsureResult> {
    this.ensureResult = { status: 'ready' };
    this.updateRequiredAssetsForState();
    const pending: Promise<void>[] = [];
    pending.push(this.ensureSampleAssetsForState());
    if (coreProductStateUsesSoundscape(this.readSliderState())) {
      pending.push(this.ensureDefaultSoundscapeAsset());
    }
    if (pending.length > 0) {
      await Promise.all(pending);
    }
    if (this.ensureResult.status === 'ready' && this.hasMissingDefaultAssetsForState()) {
      this.setNotReady('asset-closure-incomplete');
    }
    return this.ensureResult;
  }

  updateRequiredAssetsForState(): void {
    this.refreshRequiredAssetIds();
    if (!this.mobile) return;
    for (const assetId of this.workingSet.obsoleteReleaseAssetIds()) this.unregisterAsset(assetId);
  }

  async ensureSampleSlotAssetForNote(
    slotId: SampleSlotId,
    midiNote: number,
    velocity: number,
  ): Promise<void> {
    this.ensureResult = { status: 'ready' };
    const descriptor = sampleDescriptorForSlotNote(samplePredictionState(this.readSliderState()), slotId, midiNote, velocity);
    if (descriptor) await this.runMobileOperation(() => this.ensureSampleAsset(descriptor));
    const result = this.currentEnsureResult();
    if (result.status === 'not-ready') {
      throw new CoreProductAssetNotReadyError(result);
    }
  }

  private hasMissingPredictedSampleAssets(): boolean {
    return predictedSampleAssetsForState(samplePredictionState(this.readSliderState()))
      .some((descriptor) => !this.registeredAssetIds.has(descriptor.assetId));
  }

  private hasMissingDefaultSoundscapeAsset(): boolean {
    if (!coreProductStateUsesSoundscape(this.readSliderState())) return false;
    return getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState())
      .some((descriptor) => !this.registeredAssetIds.has(descriptor.assetId));
  }

  private async ensureSampleAssetsForState(): Promise<void> {
    const descriptors = predictedSampleAssetsForState(samplePredictionState(this.readSliderState()));
    this.sampleAssetCache.setRequiredAssetIds(descriptors.map((descriptor) => descriptor.assetId));
    await Promise.all(
      descriptors.map((descriptor) => this.runMobileOperation(() => this.ensureSampleAsset(descriptor))),
    );
  }

  private async ensureSampleAsset(descriptor: SampleAssetDescriptor): Promise<void> {
    if (this.registeredAssetIds.has(descriptor.assetId)) return;
    const context = this.runtime.audioContext;
    if (!context) {
      this.setNotReady('runtime-unavailable', SAMPLE_DECODE_RESERVATION_BYTES);
      return;
    }
    if (!await this.prepareAdmission(descriptor.assetId, SAMPLE_DECODE_RESERVATION_BYTES)) return;
    if (!this.canStartDecode()) {
      this.setNotReady('document-hidden', SAMPLE_DECODE_RESERVATION_BYTES);
      return;
    }
    this.pendingRegistrationAssetIds.add(descriptor.assetId);
    try {
      const asset = await this.sampleAssetCache.getOrLoad(descriptor, (candidate) => (
        this.withDecodeReservation(SAMPLE_DECODE_RESERVATION_BYTES, () => this.decodeAsset(
          context,
          candidate.assetId,
          candidate.url,
          coreProductSampleFlags(candidate),
        ))
      ));
      const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
      if (!await this.prepareAdmission(descriptor.assetId, decodedBytes)) {
        if (this.mobile) this.sampleAssetCache.take(asset.assetId);
        return;
      }
      if (!this.registeredAssetIds.has(asset.assetId)) {
        const ownedAsset = this.mobile ? (this.sampleAssetCache.take(asset.assetId) ?? asset) : asset;
        await this.registerAsset(ownedAsset);
      }
    } finally {
      this.pendingRegistrationAssetIds.delete(descriptor.assetId);
    }
  }

  private async ensureDefaultSoundscapeAsset(): Promise<void> {
    await this.ensureSoundscapeAssetsForState();
  }

  private async ensureSoundscapeAssetsForState(): Promise<void> {
    const descriptors = getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState());
    await Promise.all(
      descriptors.map((descriptor) => this.runMobileOperation(() => this.ensureSoundscapeAsset(descriptor.assetId, descriptor.url))),
    );
  }

  private async ensureSoundscapeAsset(assetId: number, url: string): Promise<void> {
    if (this.registeredAssetIds.has(assetId)) return;
    const pending = this.defaultSoundscapeAssetPromises.get(assetId);
    if (pending) {
      await pending;
      return;
    }
    const context = this.runtime.audioContext;
    if (!context) {
      this.setNotReady('runtime-unavailable', SOUNDSCAPE_DECODE_RESERVATION_BYTES);
      return;
    }
    if (!await this.prepareAdmission(assetId, SOUNDSCAPE_DECODE_RESERVATION_BYTES)) return;
    if (!this.canStartDecode()) {
      this.setNotReady('document-hidden', SOUNDSCAPE_DECODE_RESERVATION_BYTES);
      return;
    }
    this.pendingRegistrationAssetIds.add(assetId);
    const promise = this.withDecodeReservation(SOUNDSCAPE_DECODE_RESERVATION_BYTES, () => (
      this.decodeAsset(
        context,
        assetId,
        url,
        CORE_PRODUCT_ASSET_FLAGS.loop | CORE_PRODUCT_ASSET_FLAGS.soundscape,
      )
    )).then(async (asset) => {
      const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
      if (!await this.prepareAdmission(asset.assetId, decodedBytes)) return;
      await this.registerAsset(asset);
    }).finally(() => {
      this.defaultSoundscapeAssetPromises.delete(assetId);
      this.pendingRegistrationAssetIds.delete(assetId);
    });
    this.defaultSoundscapeAssetPromises.set(assetId, promise);
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

  private refreshRequiredAssetIds(): void {
    const sampleDescriptors = predictedSampleAssetsForState(samplePredictionState(this.readSliderState()));
    const soundscapeDescriptors = coreProductStateUsesSoundscape(this.readSliderState())
      ? getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState())
      : [];
    this.requiredAssetIds.clear();
    for (const descriptor of [...sampleDescriptors, ...soundscapeDescriptors]) {
      this.requiredAssetIds.add(descriptor.assetId);
    }
    this.requiredRevision += 1;
    this.workingSet.setRequiredAssetIds(this.requiredAssetIds, this.requiredRevision);
  }

  private async prepareAdmission(assetId: number, reservationBytes: number): Promise<boolean> {
    if (!this.mobile) return true;
    const admission = this.workingSet.planAdmission(assetId, reservationBytes);
    if (admission.status === 'not-ready') {
      this.ensureResult = admission;
      return false;
    }
    for (const releaseAssetId of admission.releaseAssetIds) {
      if (!await this.releaseCoordinator.request(releaseAssetId, (id) => this.unregisterAsset(id))) {
        this.setNotReady('release-failed', reservationBytes);
        return false;
      }
    }
    const finalAdmission = this.workingSet.planAdmission(assetId, reservationBytes);
    if (finalAdmission.status === 'not-ready') {
      this.ensureResult = finalAdmission;
      return false;
    }
    return true;
  }

  private canStartDecode(): boolean {
    return this.documentVisible();
  }

  private setNotReady(
    reason: Extract<CoreProductAssetEnsureResult, { status: 'not-ready' }>['reason'],
    additionalBytes = 0,
  ): void {
    this.ensureResult = {
      status: 'not-ready',
      reason,
      requiredBytes: this.workingSet.registeredBytes() + Math.max(0, Math.round(additionalBytes)),
      hardBytes: MOBILE_PRODUCT_ASSET_BUDGET.registeredHardBytes,
    };
  }

  private runMobileOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.mobile) return operation();
    const result = this.mobileOperationTail.then(operation, operation);
    this.mobileOperationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private currentEnsureResult(): CoreProductAssetEnsureResult {
    return this.ensureResult;
  }
}
