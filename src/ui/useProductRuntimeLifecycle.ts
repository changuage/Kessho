import type { SliderState } from './state';
import type { ProductEngineLifecycleState } from '../audio/product/ProductEngineTypes';

export type ProductRuntimeLifecycle = {
  primeProductRuntimeAudio: () => void;
  startProductRuntime: (stateToStart: SliderState) => Promise<void>;
  resumeProductRuntime: () => Promise<void>;
  suspendProductRuntime: () => Promise<void>;
  preloadProductRuntime: () => Promise<unknown>;
  stopProductRuntime: () => void;
  fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>;
  getProductLifecycleState: () => ProductEngineLifecycleState;
  supportsBackgroundResume: boolean;
};

export function useProductRuntimeLifecycle(lifecycle: ProductRuntimeLifecycle): ProductRuntimeLifecycle {
  return lifecycle;
}
