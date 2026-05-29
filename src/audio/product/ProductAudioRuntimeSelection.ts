import { getProductEngineRuntimeMode } from './ProductEngineProxy';

export type ProductRuntimeMode = 'core-product';
export type ProductReferenceRuntimeMode = 'web-ts' | 'core-smoke';
export type ProductRuntimeSelectionMode = ProductRuntimeMode | ProductReferenceRuntimeMode;

const PRODUCT_RUNTIME_MODES = ['core-product'] as const satisfies readonly ProductRuntimeSelectionMode[];
const REFERENCE_RUNTIME_MODES = ['core-product', 'web-ts', 'core-smoke'] as const satisfies readonly ProductRuntimeSelectionMode[];
export const AUDIO_ENGINE_PARAM = 'engine';
export const AUDIO_ENGINE_SWITCHER_PARAM = 'engineAB';

function isDevRuntime(): boolean {
  return Boolean((import.meta.env as unknown as { DEV?: boolean }).DEV);
}

function normalizeReferenceRuntimeMode(mode: string | null): ProductReferenceRuntimeMode | null {
  if (mode === 'web-ts') return 'web-ts';
  if (mode === 'core-smoke') return 'core-smoke';
  return null;
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isReferenceRuntimeEnabled(params: URLSearchParams): boolean {
  return (
    isLocalDevHost() ||
    params.get(AUDIO_ENGINE_SWITCHER_PARAM) === '1' ||
    params.get('parity') === '1' ||
    normalizeReferenceRuntimeMode(params.get(AUDIO_ENGINE_PARAM)) !== null
  );
}

function getProductionProductRuntimeMode(): ProductRuntimeMode {
  const mode = getProductEngineRuntimeMode();
  if (mode !== 'core-product') {
    throw new Error(`${mode} runtime is not implemented as a production audio engine mode`);
  }
  return mode;
}

export function getProductRuntimeMode(): ProductRuntimeSelectionMode {
  if (typeof window === 'undefined') return getProductionProductRuntimeMode();
  if (!isDevRuntime()) return getProductionProductRuntimeMode();
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get(AUDIO_ENGINE_PARAM);
    if (mode === 'core-product') return getProductionProductRuntimeMode();
    if (mode === 'native-product' || mode === 'test-product') return getProductionProductRuntimeMode();
    const referenceMode = normalizeReferenceRuntimeMode(mode);
    if (referenceMode && isReferenceRuntimeEnabled(params)) return referenceMode;
    return getProductionProductRuntimeMode();
  } catch {
    return getProductionProductRuntimeMode();
  }
}

export function getProductRuntimeModes(): readonly ProductRuntimeSelectionMode[] {
  if (typeof window === 'undefined') return PRODUCT_RUNTIME_MODES;
  if (!isDevRuntime()) return PRODUCT_RUNTIME_MODES;
  try {
    const params = new URLSearchParams(window.location.search);
    return isReferenceRuntimeEnabled(params) ? REFERENCE_RUNTIME_MODES : PRODUCT_RUNTIME_MODES;
  } catch {
    return PRODUCT_RUNTIME_MODES;
  }
}
