import { useEffect, useRef } from 'react';
import { useDocumentVisibility } from './useDocumentVisibility';

interface UseVisibleIntervalOptions {
  enabled?: boolean;
  immediate?: boolean;
  pauseWhenHidden?: boolean;
  isVisible?: boolean;
}

export function useVisibleInterval(
  callback: () => void,
  delayMs: number | null,
  options: UseVisibleIntervalOptions = {},
) {
  const {
    enabled = true,
    immediate = true,
    pauseWhenHidden = true,
    isVisible = true,
  } = options;

  const callbackRef = useRef(callback);
  const documentVisible = useDocumentVisibility(pauseWhenHidden);

  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || delayMs === null) return;
    if (!isVisible) return;
    if (pauseWhenHidden && !documentVisible) return;

    if (immediate) {
      callbackRef.current();
    }

    const intervalId = window.setInterval(() => {
      callbackRef.current();
    }, delayMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [delayMs, documentVisible, enabled, immediate, isVisible, pauseWhenHidden]);
}
