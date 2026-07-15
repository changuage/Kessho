import { useSyncExternalStore } from 'react';

type VisibilityListener = () => void;
const subscribeNever = (): (() => void) => () => {};
const alwaysVisible = (): boolean => true;

const listeners = new Set<VisibilityListener>();
let listening = false;

function emitVisibilityChange(): void {
  for (const listener of listeners) listener();
}

export function subscribeToDocumentVisibility(listener: VisibilityListener): () => void {
  listeners.add(listener);
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', emitVisibilityChange);
    listening = true;
  }

  return () => {
    listeners.delete(listener);
    if (listening && listeners.size === 0 && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', emitVisibilityChange);
      listening = false;
    }
  };
}

export function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useDocumentVisibility(enabled = true): boolean {
  return useSyncExternalStore(
    enabled ? subscribeToDocumentVisibility : subscribeNever,
    enabled ? isDocumentVisible : alwaysVisible,
    alwaysVisible,
  );
}
