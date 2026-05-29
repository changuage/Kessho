import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useSelectedAudioEngineLifecycle } from './useSelectedAudioEngineLifecycle';

type ProductRuntimeLifecycle = {
  startProductRuntime: (stateToStart: SliderState) => Promise<void>;
  resumeProductRuntime: () => Promise<void>;
  suspendProductRuntime: () => Promise<void>;
  preloadProductRuntime: () => Promise<unknown>;
  stopProductRuntime: () => void;
  fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>;
};

export function useProductRuntimeLifecycle(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeLifecycle {
  // TODO(product-runtime-compat-10C): burn this adapter down after the selected-audio-engine lifecycle
  // helpers are either product-renamed or isolated under reference/dev runtime code.
  const selectedLifecycle = useSelectedAudioEngineLifecycle(productRuntimeMode);

  return {
    startProductRuntime: selectedLifecycle.startSelectedAudioEngine,
    resumeProductRuntime: selectedLifecycle.resumeSelectedAudioEngine,
    suspendProductRuntime: selectedLifecycle.suspendSelectedAudioEngine,
    preloadProductRuntime: selectedLifecycle.preloadSelectedAudioEngine,
    stopProductRuntime: selectedLifecycle.stopSelectedAudioEngine,
    fadeProductRuntimeOutput: selectedLifecycle.fadeSelectedAudioEngineOutput,
  };
}
