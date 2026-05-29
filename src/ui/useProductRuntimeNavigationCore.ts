import { useCallback, useMemo, type MutableRefObject } from 'react';
import {
  getProductRuntimeMode,
  getProductRuntimeModes,
  type ProductRuntimeSelectionMode,
} from '../audio/product/ProductAudioRuntimeSelection';
import {
  buildProductRuntimeSwitchUrl,
  readProductRuntimeSwitchStateFromSession,
  shouldShowProductRuntimeSwitcher,
  shouldStartInAdvancedEditor,
} from './productRuntimeUi';
import type { SliderState } from './state';

type ProductRuntimeNavigationCoreOptions = {
  productRuntimeMode: ProductRuntimeNavigationMode;
  preloadProductRuntime: () => Promise<unknown>;
  stateRef: MutableRefObject<SliderState>;
  stopProductRuntime: () => void;
};

type ProductRuntimeNavigationCore = {
  productRuntimeModes: readonly ProductRuntimeNavigationMode[];
  showProductRuntimeSwitcher: boolean;
  startInAdvancedEditor: boolean;
  handleProductRuntimeModeChange: (mode: ProductRuntimeNavigationMode) => void;
  preloadAdvancedEditorRuntime: () => void;
};

export type ProductRuntimeNavigationMode = ProductRuntimeSelectionMode;

export function readProductRuntimeSwitchState(): SliderState | null {
  return readProductRuntimeSwitchStateFromSession();
}

export function useProductRuntimeMode(): ProductRuntimeNavigationMode {
  return useMemo(() => getProductRuntimeMode(), []);
}

export function useProductRuntimeNavigationCore({
  productRuntimeMode,
  preloadProductRuntime,
  stateRef,
  stopProductRuntime,
}: ProductRuntimeNavigationCoreOptions): ProductRuntimeNavigationCore {
  const showProductRuntimeSwitcher = useMemo(() => shouldShowProductRuntimeSwitcher(), []);
  const startInAdvancedEditor = useMemo(() => shouldStartInAdvancedEditor(), []);
  const productRuntimeModes = useMemo(() => getProductRuntimeModes(), []);

  const handleProductRuntimeModeChange = useCallback((mode: ProductRuntimeNavigationMode): void => {
    if (mode === productRuntimeMode) return;
    try {
      stopProductRuntime();
    } catch {
      // The page reload is the actual switch boundary.
    }
    window.location.assign(buildProductRuntimeSwitchUrl(mode, stateRef.current));
  }, [productRuntimeMode, stateRef, stopProductRuntime]);

  const preloadAdvancedEditorRuntime = useCallback((): void => {
    void preloadProductRuntime();
  }, [preloadProductRuntime]);

  return {
    productRuntimeModes,
    showProductRuntimeSwitcher,
    startInAdvancedEditor,
    handleProductRuntimeModeChange,
    preloadAdvancedEditorRuntime,
  };
}
