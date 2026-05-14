import {
  CORE_PRODUCT_ASSET_FLAGS,
  decodeCoreProductAsset,
  getDecodedCoreProductAssetByteLength,
  getCoreProductPianoPreloadAssetDescriptors,
  getCoreProductPianoAssetIdForMidi,
  getCoreProductPianoAssetUrlForMidi,
  getCoreProductSoundscapeAssetDescriptorsForState,
  type DecodedCoreProductAsset,
} from './coreProductAssets';
import type { CoreProductRuntime } from './coreProductRuntime';

type SliderStateReader = () => Record<string, unknown> | null;

export class CoreProductAssetAdapter {
  private readonly registeredAssetIds = new Set<number>();
  private readonly pianoAssetPromises = new Map<number, Promise<void>>();
  private readonly defaultSoundscapeAssetPromises = new Map<number, Promise<void>>();
  private readonly registeredAssetDecodedBytes = new Map<number, number>();

  constructor(
    private readonly runtime: CoreProductRuntime,
    private readonly readSliderState: SliderStateReader,
  ) {}

  clear(): void {
    this.registeredAssetIds.clear();
    this.registeredAssetDecodedBytes.clear();
    this.pianoAssetPromises.clear();
    this.defaultSoundscapeAssetPromises.clear();
  }

  registerAsset(asset: DecodedCoreProductAsset): void {
    const decodedBytes = getDecodedCoreProductAssetByteLength(asset);
    this.runtime.registerAsset(asset);
    this.registeredAssetIds.add(asset.assetId);
    this.registeredAssetDecodedBytes.set(asset.assetId, decodedBytes);
  }

  registeredDecodedAssetByteLength(): number {
    let total = 0;
    for (const bytes of this.registeredAssetDecodedBytes.values()) {
      total += bytes;
    }
    return total;
  }

  hasMissingDefaultAssetsForState(): boolean {
    return this.hasMissingDefaultPianoAsset() || this.hasMissingDefaultSoundscapeAsset();
  }

  async ensureDefaultAssetsForState(): Promise<void> {
    const pending: Promise<void>[] = [];
    if (this.shouldUsePianoAsset()) {
      pending.push(this.ensureDefaultPianoAsset());
    }
    if (this.shouldUseSoundscapeAsset()) {
      pending.push(this.ensureDefaultSoundscapeAsset());
    }
    if (pending.length > 0) {
      await Promise.all(pending);
    }
  }

  async ensurePianoAssetForMidi(midiNote: number): Promise<void> {
    await this.ensurePianoAsset(
      getCoreProductPianoAssetIdForMidi(midiNote),
      getCoreProductPianoAssetUrlForMidi(midiNote),
    );
  }

  private shouldUsePianoAsset(): boolean {
    const sliderState = this.readSliderState();
    if (!sliderState) return false;
    if (sliderState.pianoEnabled === true) return true;
    for (let index = 1; index <= 4; index += 1) {
      if (
        sliderState[`synthEuclid${index}Enabled`] === true &&
        sliderState[`synthEuclid${index}Source`] === 'piano'
      ) {
        return true;
      }
    }
    return false;
  }

  private hasMissingDefaultPianoAsset(): boolean {
    if (!this.shouldUsePianoAsset()) return false;
    return getCoreProductPianoPreloadAssetDescriptors(this.readSliderState())
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

  private async ensureDefaultPianoAsset(): Promise<void> {
    await this.ensurePianoAssetsForState();
  }

  private async ensurePianoAssetsForState(): Promise<void> {
    const descriptors = getCoreProductPianoPreloadAssetDescriptors(this.readSliderState());
    await Promise.all(
      descriptors.map((descriptor) => this.ensurePianoAsset(descriptor.assetId, descriptor.url)),
    );
  }

  private async ensurePianoAsset(assetId: number, url: string): Promise<void> {
    if (this.registeredAssetIds.has(assetId)) return;
    const pending = this.pianoAssetPromises.get(assetId);
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
      CORE_PRODUCT_ASSET_FLAGS.piano,
    ).then((asset) => {
      this.registerAsset(asset);
    }).finally(() => {
      this.pianoAssetPromises.delete(assetId);
    });
    this.pianoAssetPromises.set(assetId, promise);
    await promise;
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
