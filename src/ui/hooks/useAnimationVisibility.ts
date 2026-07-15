import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useDocumentVisibility } from './useDocumentVisibility';

interface UseAnimationVisibilityOptions {
  enabled?: boolean;
  rootMargin?: string;
  threshold?: number;
  defaultVisible?: boolean;
}

export function resolveCanAnimate(
  enabled: boolean,
  isDocumentVisible: boolean,
  isElementVisible: boolean,
): boolean {
  return !enabled || (isDocumentVisible && isElementVisible);
}

export function getCappedCanvasDpr(
  mobileMax = 1.25,
  desktopMax = 1.5,
): number {
  if (typeof window === 'undefined') return 1;
  const rawDpr = window.devicePixelRatio || 1;
  const isMobile = window.innerWidth < 768;
  return Math.min(rawDpr, isMobile ? mobileMax : desktopMax);
}

export function useAnimationVisibility<T extends Element>(
  targetRef: RefObject<T | null>,
  options: UseAnimationVisibilityOptions = {},
) {
  const {
    enabled = true,
    rootMargin = '180px',
    threshold = 0.01,
    defaultVisible = true,
  } = options;

  const documentVisible = useDocumentVisibility(enabled);
  const isDocumentVisible = !enabled || documentVisible;
  const [isElementVisible, setIsElementVisible] = useState(defaultVisible);

  useEffect(() => {
    if (!enabled) {
      setIsElementVisible(true);
      return;
    }

    const target = targetRef.current;
    if (!target || typeof IntersectionObserver !== 'function') {
      setIsElementVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsElementVisible(entry ? (entry.isIntersecting || entry.intersectionRatio > threshold) : defaultVisible);
      },
      {
        root: null,
        rootMargin,
        threshold: [threshold],
      },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [enabled, rootMargin, targetRef, threshold]);

  return {
    canAnimate: resolveCanAnimate(enabled, isDocumentVisible, isElementVisible),
    isDocumentVisible,
    isElementVisible,
  };
}
