import type { ProductEnginePort } from './ProductEnginePort';
import type { ProductEngineRuntimeMode } from './ProductRuntimeMode';
import { WebProductEngine } from './WebProductEngine';

let loadedProductEngine: ProductEnginePort | null = null;
let loadPromise: Promise<ProductEnginePort> | null = null;
let resolvedRuntimeMode: ProductEngineRuntimeMode | null = null;

export function getProductEngineRuntimeMode(): ProductEngineRuntimeMode {
  if (resolvedRuntimeMode) return resolvedRuntimeMode;
  if (typeof window === 'undefined') {
    resolvedRuntimeMode = 'core-product';
    return resolvedRuntimeMode;
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('engine');
  if (requested === 'native-product' || requested === 'test-product') {
    resolvedRuntimeMode = requested;
    return resolvedRuntimeMode;
  }

  resolvedRuntimeMode = 'core-product';
  return resolvedRuntimeMode;
}

export async function loadProductEngine(): Promise<ProductEnginePort> {
  if (loadedProductEngine) return loadedProductEngine;
  if (!loadPromise) {
    loadPromise = Promise.resolve().then(() => {
      const mode = getProductEngineRuntimeMode();
      if (mode !== 'core-product') {
        throw new Error(`${mode} runtime is not implemented in this build`);
      }
      const engine = new WebProductEngine();
      loadedProductEngine = engine;
      return engine;
    });
  }
  return loadPromise;
}

export const productEngine = new Proxy({} as ProductEnginePort, {
  get(_target, property) {
    if (property === 'then') return undefined;
    if (typeof property !== 'string') return undefined;

    if (loadedProductEngine) {
      const value = (loadedProductEngine as unknown as Record<string, unknown>)[property];
      return typeof value === 'function' ? value.bind(loadedProductEngine) : value;
    }

    return (...args: unknown[]) =>
      loadProductEngine().then((engine) => {
        const value = (engine as unknown as Record<string, unknown>)[property];
        if (typeof value !== 'function') {
          throw new Error(`ProductEngine.${property} is not a function`);
        }
        return (value as (...invokeArgs: unknown[]) => unknown).apply(engine, args);
      });
  },
});
