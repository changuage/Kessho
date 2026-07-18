import { useCallback, useSyncExternalStore } from 'react';
import {
  getRuntimeSliderKeysVersion,
  subscribeRuntimeSliderKeys,
} from './runtimeSliderState';
import {
  getRuntimeValueKeysVersion,
  subscribeRuntimeValueKeys,
} from './runtimeValueState';

/**
 * Coalesces the position and direct-value stores into one visual projection
 * update. This prevents one telemetry sample from producing two React commits.
 */
export function useRuntimeProjectionVersion(keys: readonly string[]): number {
  const subscribe = useCallback((listener: () => void) => {
    let frameId: number | null = null;
    let timerId: number | null = null;
    let lastNotificationAt = 0;
    const notify = () => {
      frameId = null;
      lastNotificationAt = performance.now();
      listener();
    };
    const schedule = () => {
      if (frameId !== null || timerId !== null) return;
      const delayMs = Math.max(0, 100 - (performance.now() - lastNotificationAt));
      if (delayMs <= 0) frameId = requestAnimationFrame(notify);
      else timerId = window.setTimeout(() => {
        timerId = null;
        frameId = requestAnimationFrame(notify);
      }, delayMs);
    };
    const unsubscribeSlider = subscribeRuntimeSliderKeys(keys, schedule);
    const unsubscribeValue = subscribeRuntimeValueKeys(keys, schedule);
    return () => {
      unsubscribeSlider();
      unsubscribeValue();
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [keys]);

  return useSyncExternalStore(
    subscribe,
    () => getRuntimeSliderKeysVersion(keys) + getRuntimeValueKeysVersion(keys),
    () => 0,
  );
}
