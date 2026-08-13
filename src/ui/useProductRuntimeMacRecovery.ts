import { useEffect, useRef, type MutableRefObject } from 'react';
import { addCapacitorAudioSessionEventListener } from '../native/capacitorAudioSession';
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

  useEffect(() => {
    if (!productRuntimeLifecycle.supportsBackgroundResume || !macShellAvailable || !playbackIsRunning) return;
    let cancelled = false;
    let cleanup: (() => Promise<void>) | null = null;
    void addCapacitorAudioSessionEventListener((event) => {
      if (event.type !== 'interruption' || event.interruptionType !== 'ended' || recoveryInFlightRef.current) return;
      recoveryInFlightRef.current = true;
      void productRuntimeLifecycle.resumeProductRuntime()
        .then(async () => {
          if (!cancelled && productRuntimeLifecycle.getProductLifecycleState() === 'stopped') {
            await productRuntimeLifecycle.startProductRuntime(stateRef.current);
          }
        })
        .catch((error) => console.warn('Product audio lifecycle recovery failed:', error))
        .finally(() => { recoveryInFlightRef.current = false; });
    }).then((remove) => {
      if (cancelled) void remove?.();
      else cleanup = remove;
    });
    return () => {
      cancelled = true;
      void cleanup?.();
    };
  }, [macShellAvailable, playbackIsRunning, productRuntimeLifecycle, stateRef]);
}
