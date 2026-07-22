import { useEffect, useMemo, useState } from 'react';
import { isMobileDevice } from '../platform';
import {
  DEFAULT_STATE,
  MOBILE_STATE,
  decodeStateFromUrl,
  type SliderState,
} from './state';
import {
  readProductRuntimeSwitchState,
  useProductRuntimeMode,
} from './useProductRuntimeNavigationCore';
import { createProductRuntimeConstruction } from './productRuntimeConstruction';
import { useProductRuntimeCallbackSurfaces } from './useProductRuntimeCallbackSurfaces';
import type { ReferenceRuntimeCallbackSurfaces } from './referenceRuntime/useReferenceRuntimeCallbackSurfaces';

type RuntimeCallbackSurfaces = ReferenceRuntimeCallbackSurfaces;
type ReferenceCallbackSurfaceFactory = () => RuntimeCallbackSurfaces;

async function loadReferenceCallbackSurfaceFactory(): Promise<ReferenceCallbackSurfaceFactory> {
  if (!import.meta.env.DEV) throw new Error('Reference runtime callback surfaces are unavailable in production.');
  const module = await import('./referenceRuntime/useReferenceRuntimeCallbackSurfaces');
  return module.createReferenceRuntimeCallbackSurfaces;
}

type ResolveProductRuntimeModeInitialStateOptions = {
  normalizeState: (state: SliderState) => SliderState;
};

export function resolveProductRuntimeModeInitialState({
  normalizeState,
}: ResolveProductRuntimeModeInitialStateOptions): SliderState {
  const urlState = readProductRuntimeSwitchState() ?? decodeStateFromUrl(window.location.search);
  const mobileDefaultState = isMobileDevice() || window.innerWidth < 768;
  return normalizeState(urlState || (mobileDefaultState ? MOBILE_STATE : DEFAULT_STATE));
}

export function useProductRuntimeModeSession() {
  const productRuntimeMode = useProductRuntimeMode();
  const productRuntimeConstruction = useMemo(
    () => createProductRuntimeConstruction(productRuntimeMode),
    [productRuntimeMode],
  );
  const productCallbackSurfaces = useProductRuntimeCallbackSurfaces();
  const [referenceCallbackSurfaceFactory, setReferenceCallbackSurfaceFactory] = useState<ReferenceCallbackSurfaceFactory | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (productRuntimeConstruction.isCoreProduct || !import.meta.env.DEV) {
      setReferenceCallbackSurfaceFactory(null);
      return () => {
        cancelled = true;
      };
    }
    void loadReferenceCallbackSurfaceFactory().then((factory) => {
      if (!cancelled) setReferenceCallbackSurfaceFactory(() => factory);
    });
    return () => {
      cancelled = true;
    };
  }, [productRuntimeConstruction.isCoreProduct]);
  const referenceCallbackSurfaces = useMemo(
    () => referenceCallbackSurfaceFactory?.() ?? null,
    [referenceCallbackSurfaceFactory],
  );
  const productRuntimeCallbackSurfaces = useMemo<RuntimeCallbackSurfaces>(() => {
    if (productRuntimeConstruction.isCoreProduct || !referenceCallbackSurfaceFactory) {
      return productCallbackSurfaces as RuntimeCallbackSurfaces;
    }
    return referenceCallbackSurfaces ?? productCallbackSurfaces as RuntimeCallbackSurfaces;
  }, [productCallbackSurfaces, productRuntimeConstruction.isCoreProduct, referenceCallbackSurfaceFactory, referenceCallbackSurfaces]);
  return {
    productRuntimeMode,
    productRuntimeCore: productRuntimeConstruction.isCoreProduct,
    productRuntimeLifecycle: productRuntimeConstruction.lifecycle,
    productRuntimeState: productRuntimeConstruction.state,
    productRuntimeTelemetry: productRuntimeConstruction.telemetry,
    productRuntimeReferenceAdapter: productRuntimeConstruction.referenceAdapter,
    productRuntimeAutoStop: productRuntimeConstruction.autoStop,
    productRuntimeCallbackSurfaces,
  };
}
