import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineRecordingRuntime } from './useSelectedAudioEngineRecordingRuntime';

export function useProductRuntimeRecordingRuntime(productRuntimeMode: ProductRuntimeSelectionMode) {
  return useSelectedAudioEngineRecordingRuntime(productRuntimeMode);
}
