import {
  getCoreProductSoundscapeAssetDescriptorsForState,
} from '../../coreProductAssets';
import type { SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import {
  predictedSampleAssetsForState,
  samplePredictionState,
} from './CoreProductSampleAssetResolver';
import { coreProductStateUsesSoundscape } from './CoreProductAssetReadiness';

type ProductState = Record<string, unknown>;
type SoundscapeDescriptor = ReturnType<typeof getCoreProductSoundscapeAssetDescriptorsForState>[number];

export class CoreProductAssetRequirements {
  private sceneStates: ProductState[] = [];

  clear(): void {
    this.sceneStates = [];
  }

  replaceSceneStates(states: readonly ProductState[]): void {
    this.sceneStates = states.map((state) => ({ ...state }));
  }

  clearSceneStates(): boolean {
    if (this.sceneStates.length === 0) return false;
    this.sceneStates = [];
    return true;
  }

  states(current: ProductState | null): ProductState[] {
    return current ? [current, ...this.sceneStates] : [...this.sceneStates];
  }

  sampleDescriptors(states: readonly ProductState[]): SampleAssetDescriptor[] {
    const descriptors = new Map<number, SampleAssetDescriptor>();
    for (const state of states) {
      for (const descriptor of predictedSampleAssetsForState(samplePredictionState(state))) {
        descriptors.set(descriptor.assetId, descriptor);
      }
    }
    return [...descriptors.values()];
  }

  soundscapeDescriptors(states: readonly ProductState[]): SoundscapeDescriptor[] {
    const descriptors = new Map<number, SoundscapeDescriptor>();
    for (const state of states) {
      if (!coreProductStateUsesSoundscape(state)) continue;
      for (const descriptor of getCoreProductSoundscapeAssetDescriptorsForState(state)) {
        descriptors.set(descriptor.assetId, descriptor);
      }
    }
    return [...descriptors.values()];
  }
}
