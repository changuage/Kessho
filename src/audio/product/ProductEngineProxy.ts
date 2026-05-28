import type { ProductEnginePort } from './ProductEnginePort';
import type { ProductEngineRuntimeMode } from './ProductRuntimeMode';
import { WebProductEngine } from './WebProductEngine';

let loadedProductEngine: ProductEnginePort | null = null;
let resolvedRuntimeMode: ProductEngineRuntimeMode | null = null;

function isDevRuntime(): boolean {
  return Boolean((import.meta.env as unknown as { DEV?: boolean }).DEV);
}

export function getProductEngineRuntimeMode(): ProductEngineRuntimeMode {
  if (resolvedRuntimeMode) return resolvedRuntimeMode;
  if (typeof window === 'undefined') {
    resolvedRuntimeMode = 'core-product';
    return resolvedRuntimeMode;
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('engine');
  if (requested === 'web-ts' || requested === 'web-audio' || requested === 'core-smoke') {
    resolvedRuntimeMode = 'core-product';
    return resolvedRuntimeMode;
  }
  if (requested === 'native-product' || requested === 'test-product') {
    if (isDevRuntime()) {
      throw new Error(`${requested} runtime is not implemented in this build`);
    }
    resolvedRuntimeMode = 'core-product';
    return resolvedRuntimeMode;
  }

  resolvedRuntimeMode = 'core-product';
  return resolvedRuntimeMode;
}

export async function loadProductEngine(): Promise<ProductEnginePort> {
  return getOrCreateProductEngine();
}

function getOrCreateProductEngine(): ProductEnginePort {
  if (loadedProductEngine) return loadedProductEngine;
  const mode = getProductEngineRuntimeMode();
  if (mode !== 'core-product') {
    throw new Error(`${mode} runtime is not implemented in this build`);
  }
  loadedProductEngine = new WebProductEngine();
  return loadedProductEngine;
}

export const productEngine = new Proxy({} as ProductEnginePort, {
  get(_target, property) {
    if (property === 'then') return undefined;
    if (typeof property !== 'string') return undefined;

    const engine = getOrCreateProductEngine();
    const value = (engine as unknown as Record<string, unknown>)[property];
    return typeof value === 'function' ? value.bind(engine) : value;
  },
});
