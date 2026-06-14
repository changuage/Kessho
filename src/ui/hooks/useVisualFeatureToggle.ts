import { useCallback, useEffect, useMemo, useState } from 'react';

type VisualFeatureToggle = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  show: () => void;
  hide: () => void;
  hasStoredPreference: boolean;
};

function readStored(key: string): boolean | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // Private browsing and storage restrictions should not break rendering.
  }

  return null;
}

function writeStored(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Private browsing and storage restrictions should not break rendering.
  }
}

export function useVisualFeatureToggle(
  storageKey: string,
  defaultEnabled: boolean,
): VisualFeatureToggle {
  const initialStored = useMemo(() => readStored(storageKey), [storageKey]);
  const [hasStoredPreference, setHasStoredPreference] = useState(initialStored !== null);
  const [enabled, setEnabledState] = useState(() => initialStored ?? defaultEnabled);

  useEffect(() => {
    if (!hasStoredPreference) {
      setEnabledState(defaultEnabled);
    }
  }, [defaultEnabled, hasStoredPreference]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setHasStoredPreference(true);
      setEnabledState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  return {
    enabled,
    setEnabled,
    show: () => setEnabled(true),
    hide: () => setEnabled(false),
    hasStoredPreference,
  };
}
