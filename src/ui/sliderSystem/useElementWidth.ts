import { useLayoutEffect, useState, type RefObject } from 'react';

const listeners = new WeakMap<Element, (width: number) => void>();
let sharedObserver: ResizeObserver | null = null;

function observeWidth(element: Element, listener: (width: number) => void): () => void {
  listener(element.getBoundingClientRect().width);
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  sharedObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.contentRect.width);
  });
  listeners.set(element, listener);
  sharedObserver.observe(element);
  return () => {
    listeners.delete(element);
    sharedObserver?.unobserve(element);
  };
}

export function useElementWidth(ref: RefObject<Element>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return observeWidth(element, (next) => {
      setWidth((current) => Math.abs(current - next) > 0.5 ? next : current);
    });
  }, [ref]);
  return width;
}
