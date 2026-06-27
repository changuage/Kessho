import { useRef, type MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { useVisibleInterval } from './hooks/useVisibleInterval';
import type { SliderState } from './state';

type ProductRuntimeMacRecoveryOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  macShellAvailable: boolean;
  playbackIsRunning: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeMacRecovery({
  productRuntimeMode,
  macShellAvailable,
  playbackIsRunning,
  stateRef,
}: ProductRuntimeMacRecoveryOptions): void {
  const recoveryInFlightRef = useRef(false);
  const productRuntimeActive = productRuntimeMode === 'core-product';

  useVisibleInterval(() => {
    if (!productRuntimeActive || !macShellAvailable || !playbackIsRunning || recoveryInFlightRef.current) return;
    if (productEngine.getLifecycleState() !== 'suspended') return;

    recoveryInFlightRef.current = true;
    const recover = async () => {
      try {
        await productEngine.resume();
        if (productEngine.getLifecycleState() === 'stopped') {
          await productEngine.start({ initialState: stateRef.current as unknown as Readonly<Record<string, unknown>> });
        }
      } catch (error) {
        console.warn('Product audio lifecycle recovery failed:', error);
      } finally {
        recoveryInFlightRef.current = false;
      }
    };
    void recover();
  }, 2000, {
    enabled: productRuntimeActive && macShellAvailable && playbackIsRunning,
    pauseWhenHidden: false,
  });
}
