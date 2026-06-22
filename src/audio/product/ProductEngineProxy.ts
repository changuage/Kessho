import type { ProductEnginePort } from './ProductEnginePort';
import { WebProductEngine } from './WebProductEngine';

let loadedProductEngine: ProductEnginePort | null = null;

export function getProductEngineRuntimeMode(): 'core-product' {
  return 'core-product';
}

export async function loadProductEngine(): Promise<ProductEnginePort> {
  return getOrCreateProductEngine();
}

function getOrCreateProductEngine(): ProductEnginePort {
  if (loadedProductEngine) return loadedProductEngine;
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
