import { useRef, type MutableRefObject } from 'react';
import { useVisibleInterval } from './hooks/useVisibleInterval';
import type { SliderState } from './state';
import type { ProductRuntimeLifecycle } from './useProductRuntimeLifecycle';

type ProductRuntimeMacRecoveryOptions = {
  productRuntimeLifecycle: ProductRuntimeLifecycle;
  macShellAvailable: boolean;
  playbackIsRunning: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeMacRecovery({
  productRuntimeLifecycle,
  macShellAvailable,
  playbackIsRunning,
  stateRef,
}: ProductRuntimeMacRecoveryOptions): void {
  const recoveryInFlightRef = useRef(false);

  useVisibleInterval(() => {
    if (!productRuntimeLifecycle.supportsBackgroundResume || !macShellAvailable || !playbackIsRunning || recoveryInFlightRef.current) return;
    if (productRuntimeLifecycle.getProductLifecycleState() !== 'suspended') return;

    recoveryInFlightRef.current = true;
    const recover = async () => {
      try {
        await productRuntimeLifecycle.resumeProductRuntime();
        if (productRuntimeLifecycle.getProductLifecycleState() === 'stopped') {
          await productRuntimeLifecycle.startProductRuntime(stateRef.current);
        }
      } catch (error) {
        console.warn('Product audio lifecycle recovery failed:', error);
      } finally {
        recoveryInFlightRef.current = false;
      }
    };
    void recover();
  }, 2000, {
    enabled: productRuntimeLifecycle.supportsBackgroundResume && macShellAvailable && playbackIsRunning,
    pauseWhenHidden: false,
  });
}
