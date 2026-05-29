import { classifyCoreProductRuntimeFallback, type RuntimeFallbackClassification } from '../../CoreProductFallbackDiagnostics';

export type CoreProductEngineHostProxy = Record<string, unknown>;

export type CoreProductRuntimeFallbackReporter = {
  reportRuntimeFallback(method: string, classification: RuntimeFallbackClassification): void;
};

export function createCoreProductEngineHostProxy(host: CoreProductRuntimeFallbackReporter): CoreProductEngineHostProxy {
  return new Proxy(host as unknown as CoreProductEngineHostProxy, {
    get(target, property) {
      if (property === 'then') return undefined;
      if (typeof property !== 'string') return undefined;
      const value = (target as unknown as Record<string, unknown>)[property];
      if (typeof value === 'function') return value.bind(target);
      if (value !== undefined) return value;
      const classification = classifyCoreProductRuntimeFallback(property);
      if (property.startsWith('get')) {
        return () => {
          host.reportRuntimeFallback(property, classification);
          throw new Error(`AudioEngine.${property} is not implemented by core-product`);
        };
      }
      return (..._args: unknown[]) => {
        host.reportRuntimeFallback(property, classification);
        throw new Error(`AudioEngine.${property} is not implemented by core-product`);
      };
    },
  }) as CoreProductEngineHostProxy;
}
