import {
  CORE_PRODUCT_ASSET_FLAGS,
  decodeCoreProductAsset,
  getDecodedCoreProductAssetByteLength,
  getCoreProductSoundscapeAssetDescriptorsForState,
  type DecodedCoreProductAsset,
} from '../../coreProductAssets';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import { SampleDecodedAssetCache, defaultSampleDecodedAssetCacheBytes } from '../../sampleLibraries/SampleDecodedAssetCache';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';
import {
  predictedSampleAssetsForState,
  sampleDescriptorForSlotNote,
  samplePredictionState,
} from './CoreProductSampleAssetResolver';

type SliderStateReader = () => Record<string, unknown> | null;

export class CoreProductAssetRegistrar {
  private readonly registeredAssetIds = new Set<number>();
  private readonly defaultSoundscapeAssetPromises = new Map<number, Promise<void>>();
  private readonly registeredAssetDecodedBytes = new Map<number, number>();
  private readonly sampleAssetCache = new SampleDecodedAssetCache(defaultSampleDecodedAssetCacheBytes());

  constructor(
    private readonly runtime: CoreProductRuntime,
    private readonly readSliderState: SliderStateReader,
  ) {}

  clear(): void {
    this.registeredAssetIds.clear();
    this.registeredAssetDecodedBytes.clear();
    this.defaultSoundscapeAssetPromises.clear();
    this.sampleAssetCache.clear();
  }

  registerAsset(asset: DecodedCoreProductAsset): void {
    const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
    this.runtime.registerAsset(asset);
    this.registeredAssetIds.add(asset.assetId);
    this.registeredAssetDecodedBytes.set(asset.assetId, decodedBytes);
  }

  unregisterAsset(assetId: number): void {
    this.runtime.unregisterAsset(assetId);
    this.registeredAssetIds.delete(assetId);
    this.registeredAssetDecodedBytes.delete(assetId);
    this.defaultSoundscapeAssetPromises.delete(assetId);
  }

  registeredDecodedAssetByteLength(): number {
    let total = 0;
    for (const bytes of this.registeredAssetDecodedBytes.values()) {
      total += bytes;
    }
    return total;
  }

  hasMissingDefaultAssetsForState(): boolean {
    return this.hasMissingPredictedSampleAssets() || this.hasMissingDefaultSoundscapeAsset();
  }

  async ensureDefaultAssetsForState(): Promise<void> {
    const pending: Promise<void>[] = [];
    pending.push(this.ensureSampleAssetsForState());
    if (this.shouldUseSoundscapeAsset()) {
      pending.push(this.ensureDefaultSoundscapeAsset());
    }
    if (pending.length > 0) {
      await Promise.all(pending);
    }
  }

  async ensureSampleSlotAssetForNote(slotId: SampleSlotId, midiNote: number, velocity: number): Promise<void> {
    const descriptor = sampleDescriptorForSlotNote(samplePredictionState(this.readSliderState()), slotId, midiNote, velocity);
    if (descriptor) await this.ensureSampleAsset(descriptor);
  }

  private hasMissingPredictedSampleAssets(): boolean {
    return predictedSampleAssetsForState(samplePredictionState(this.readSliderState()))
      .some((descriptor) => !this.registeredAssetIds.has(descriptor.assetId));
  }

  private shouldUseSoundscapeAsset(): boolean {
    const sliderState = this.readSliderState();
    if (!sliderState) return false;
    return sliderState.oceanSampleEnabled === true ||
      sliderState.waterEnabled === true ||
      sliderState.insectsEnabled === true ||
      sliderState.insects2Enabled === true ||
      sliderState.birdsEnabled === true ||
      sliderState.birds2Enabled === true ||
      sliderState.frogsEnabled === true;
  }

  private hasMissingDefaultSoundscapeAsset(): boolean {
    if (!this.shouldUseSoundscapeAsset()) return false;
    return getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState())
      .some((descriptor) => !this.registeredAssetIds.has(descriptor.assetId));
  }

  private async ensureSampleAssetsForState(): Promise<void> {
    const descriptors = predictedSampleAssetsForState(samplePredictionState(this.readSliderState()));
    this.sampleAssetCache.setRequiredAssetIds(descriptors.map((descriptor) => descriptor.assetId));
    await Promise.all(
      descriptors.map((descriptor) => this.ensureSampleAsset(descriptor)),
    );
  }

  private sampleFlagsForDescriptor(descriptor: SampleAssetDescriptor): number {
    return CORE_PRODUCT_ASSET_FLAGS.sample |
      (descriptor.libraryKey === 'piano' ? CORE_PRODUCT_ASSET_FLAGS.piano : 0) |
      (descriptor.loop ? CORE_PRODUCT_ASSET_FLAGS.loop : 0);
  }

  private async ensureSampleAsset(descriptor: SampleAssetDescriptor): Promise<void> {
    if (this.registeredAssetIds.has(descriptor.assetId)) return;
    const context = this.runtime.audioContext;
    if (!context) return;
    const asset = await this.sampleAssetCache.getOrLoad(descriptor, (candidate) => (
      decodeCoreProductAsset(
        context,
        candidate.assetId,
        candidate.url,
        this.sampleFlagsForDescriptor(candidate),
      )
    ));
    if (!this.registeredAssetIds.has(asset.assetId)) {
      this.registerAsset(asset);
    }
  }

  private async ensureDefaultSoundscapeAsset(): Promise<void> {
    await this.ensureSoundscapeAssetsForState();
  }

  private async ensureSoundscapeAssetsForState(): Promise<void> {
    const descriptors = getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState());
    await Promise.all(
      descriptors.map((descriptor) => this.ensureSoundscapeAsset(descriptor.assetId, descriptor.url)),
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
    if (!context) return;
    const promise = decodeCoreProductAsset(
      context,
      assetId,
      url,
      CORE_PRODUCT_ASSET_FLAGS.loop | CORE_PRODUCT_ASSET_FLAGS.soundscape,
    ).then((asset) => {
      this.registerAsset(asset);
    }).finally(() => {
      this.defaultSoundscapeAssetPromises.delete(assetId);
    });
    this.defaultSoundscapeAssetPromises.set(assetId, promise);
    await promise;
  }
}
