import { decodeCoreProductAsset, getDecodedCoreProductAssetByteLength, type DecodedCoreProductAsset } from '../../coreProductAssets';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { AssetTransferOwnership } from '../../coreProductRuntime';
import { SampleDecodedAssetCache, defaultSampleDecodedAssetCacheBytes } from '../../sampleLibraries/SampleDecodedAssetCache';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';
import {
  sampleDescriptorForSlotNote,
  samplePredictionState,
} from './CoreProductSampleAssetResolver';
import { isIOSLikeDevice, isMobileDevice } from '../../../platform';
import { CoreProductAssetWorkingSet, MOBILE_PRODUCT_ASSET_BUDGET } from './CoreProductAssetWorkingSet';
import { predictedDecodedAssetBytes } from './CoreProductAssetPrediction';
import {
  CoreProductAssetNotReadyError,
  CoreProductAssetReleaseCoordinator,
  createCoreProductBackgroundAssetClosure,
  type CoreProductAssetEnsureResult,
  type CoreProductBackgroundAssetClosure,
} from './CoreProductAssetReadiness';
import { CoreProductAssetRequirements } from './CoreProductAssetRequirements';
import { CoreProductAssetDecodeService } from './CoreProductAssetDecodeService';
export { CoreProductAssetNotReadyError } from './CoreProductAssetReadiness';
export type { CoreProductAssetEnsureResult, CoreProductBackgroundAssetClosure } from './CoreProductAssetReadiness';

type SliderStateReader = () => Record<string, unknown> | null;
type AssetDecoder = typeof decodeCoreProductAsset;

export class CoreProductAssetRegistrar {
  private readonly registeredAssetIds = new Set<number>();
  private readonly pendingReleaseAssetIds = new Set<number>();
  private readonly pendingRegistrationAssetIds = new Set<number>();
  private readonly requiredAssetIds = new Set<number>();
  private readonly registeredAssetDecodedBytes = new Map<number, number>();
  private readonly mobile: boolean;
  private readonly sampleAssetCache: SampleDecodedAssetCache;
  private readonly workingSet = new CoreProductAssetWorkingSet();
  private readonly releaseCoordinator = new CoreProductAssetReleaseCoordinator();
  private readonly requirements = new CoreProductAssetRequirements();
  private readonly decodeService: CoreProductAssetDecodeService;
  private mobileOperationTail: Promise<void> = Promise.resolve();
  private requiredRevision = 0;
  private ensureResult: CoreProductAssetEnsureResult = { status: 'ready' };

  constructor(
    private readonly runtime: CoreProductRuntime,
    private readonly readSliderState: SliderStateReader,
    mobile = isMobileDevice() || isIOSLikeDevice(),
    decodeAsset: AssetDecoder = decodeCoreProductAsset,
    private readonly documentVisible: () => boolean = () => (
      typeof document === 'undefined' || document.visibilityState === 'visible'
    ),
  ) {
    this.mobile = mobile;
    this.sampleAssetCache = new SampleDecodedAssetCache(
      mobile ? MOBILE_PRODUCT_ASSET_BUDGET.hostDecodedBytes : defaultSampleDecodedAssetCacheBytes(),
    );
    this.decodeService = new CoreProductAssetDecodeService({
      runtime,
      cache: this.sampleAssetCache,
      mobile,
      decodeAsset,
      registeredAssetIds: this.registeredAssetIds,
      pendingRegistrationAssetIds: this.pendingRegistrationAssetIds,
      isRequired: (assetId) => this.requiredAssetIds.has(assetId),
      prepareAdmission: (assetId, bytes) => this.prepareAdmission(assetId, bytes),
      canStartDecode: () => this.canStartDecode(),
      setNotReady: (reason, bytes) => this.setNotReady(reason, bytes),
      registerAsset: (asset) => this.registerAsset(asset),
      runMobileOperation: (operation) => this.runMobileOperation(operation),
    });
    this.runtime.setAssetReleaseCallback((assetId) => this.handleAssetReleaseComplete(assetId));
    this.runtime.setAssetReleaseFailureCallback((assetId) => this.handleAssetReleaseFailure(assetId));
  }

  clear(): void {
    this.registeredAssetIds.clear();
    this.pendingReleaseAssetIds.clear();
    this.pendingRegistrationAssetIds.clear();
    this.requiredAssetIds.clear();
    this.registeredAssetDecodedBytes.clear();
    this.sampleAssetCache.clear();
    this.requirements.clear();
    this.decodeService.clear();
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
    this.decodeService.forget(assetId);
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
    return this.decodeService.inFlightBytes();
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

  estimateRegisteredSceneAssetBytes(states: readonly Record<string, unknown>[]): {
    complete: boolean;
    decodedBytes: number;
    sharedAssetReuse: number;
  } {
    const perStateIds = states.map((state) => new Set([
      ...this.requirements.sampleDescriptors([state]).map((descriptor) => descriptor.assetId),
      ...this.requirements.soundscapeDescriptors([state]).map((descriptor) => descriptor.assetId),
    ]));
    const uniqueIds = new Set(perStateIds.flatMap((ids) => [...ids]));
    let decodedBytes = 0;
    let complete = true;
    for (const assetId of uniqueIds) {
      const bytes = this.registeredAssetDecodedBytes.get(assetId);
      if (bytes === undefined) complete = false;
      else decodedBytes += bytes;
    }
    const totalReferences = perStateIds.reduce((sum, ids) => sum + ids.size, 0);
    return { complete, decodedBytes, sharedAssetReuse: Math.max(0, totalReferences - uniqueIds.size) };
  }

  predictSceneAssetBytes(states: readonly Record<string, unknown>[], outputSampleRate: number): {
    complete: boolean;
    decodedBytes: number;
    largestPendingDecodeBytes: number;
    assetCount: number;
  } {
    const descriptors = [
      ...this.requirements.sampleDescriptors(states),
      ...this.requirements.soundscapeDescriptors(states),
    ];
    const unique = new Map(descriptors.map((descriptor) => [descriptor.assetId, descriptor]));
    let complete = true;
    let decodedBytes = 0;
    let largestPendingDecodeBytes = 0;
    for (const [assetId, descriptor] of unique) {
      const registeredBytes = this.registeredAssetDecodedBytes.get(assetId);
      const predictedBytes = registeredBytes ?? predictedDecodedAssetBytes(descriptor.assetPath, outputSampleRate);
      if (predictedBytes === null) {
        complete = false;
        continue;
      }
      decodedBytes += predictedBytes;
      if (registeredBytes === undefined) largestPendingDecodeBytes = Math.max(largestPendingDecodeBytes, predictedBytes);
    }
    return { complete, decodedBytes, largestPendingDecodeBytes, assetCount: unique.size };
  }

  hasMissingDefaultAssetsForState(): boolean {
    return this.hasMissingAssetsForStates(this.requiredStates());
  }

  async ensureDefaultAssetsForState(): Promise<CoreProductAssetEnsureResult> {
    return this.ensureAssetsForStates(this.requiredStates());
  }

  async ensureSceneAssets(states: readonly Record<string, unknown>[]): Promise<CoreProductAssetEnsureResult> {
    this.requirements.replaceSceneStates(states);
    return this.ensureAssetsForStates(this.requiredStates());
  }

  clearSceneAssets(): void {
    if (!this.requirements.clearSceneStates()) return;
    this.updateRequiredAssetsForState();
  }

  private async ensureAssetsForStates(
    states: readonly Record<string, unknown>[],
  ): Promise<CoreProductAssetEnsureResult> {
    this.ensureResult = { status: 'ready' };
    this.refreshRequiredAssetIds(states);
    await Promise.all([
      this.ensureSampleAssetsForStates(states),
      this.ensureSoundscapeAssetsForStates(states),
    ]);
    if (this.ensureResult.status === 'ready' && this.hasMissingAssetsForStates(states)) {
      this.setNotReady('asset-closure-incomplete');
    }
    return this.ensureResult;
  }

  updateRequiredAssetsForState(): void {
    this.refreshRequiredAssetIds(this.requiredStates());
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
    if (descriptor) await this.runMobileOperation(() => this.decodeService.ensureSampleAsset(descriptor));
    const result = this.currentEnsureResult();
    if (result.status === 'not-ready') {
      throw new CoreProductAssetNotReadyError(result);
    }
  }

  private requiredStates(): Record<string, unknown>[] {
    return this.requirements.states(this.readSliderState());
  }

  private hasMissingAssetsForStates(states: readonly Record<string, unknown>[]): boolean {
    return this.requirements.sampleDescriptors(states)
      .some((descriptor) => !this.registeredAssetIds.has(descriptor.assetId)) ||
      this.requirements.soundscapeDescriptors(states)
      .some((descriptor) => !this.registeredAssetIds.has(descriptor.assetId));
  }

  private async ensureSampleAssetsForStates(states: readonly Record<string, unknown>[]): Promise<void> {
    const descriptors = this.requirements.sampleDescriptors(states);
    this.sampleAssetCache.setRequiredAssetIds(descriptors.map((descriptor) => descriptor.assetId));
    await this.decodeService.ensureSampleAssets(descriptors);
  }

  private async ensureSoundscapeAssetsForStates(states: readonly Record<string, unknown>[]): Promise<void> {
    const descriptors = this.requirements.soundscapeDescriptors(states);
    await this.decodeService.ensureSoundscapeAssets(descriptors);
  }

  private refreshRequiredAssetIds(states: readonly Record<string, unknown>[]): void {
    const sampleDescriptors = this.requirements.sampleDescriptors(states);
    const soundscapeDescriptors = this.requirements.soundscapeDescriptors(states);
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
