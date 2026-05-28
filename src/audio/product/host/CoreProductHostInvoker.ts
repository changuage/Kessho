import { coreProductEngineHost } from '../../coreProductEngineHost';

export type CoreProductHost = Record<string, unknown>;
export type CoreProductHostMethodCall = <T>(method: string, ...args: readonly unknown[]) => T;

function host(): CoreProductHost {
  return coreProductEngineHost as unknown as CoreProductHost;
}

export const callCoreProductHost: CoreProductHostMethodCall = <T>(
  method: string,
  ...args: readonly unknown[]
): T => {
  const candidate = host()[method];
  if (typeof candidate !== 'function') {
    throw new Error(`core-product host does not implement ${method}`);
  }
  return (candidate as (...invokeArgs: readonly unknown[]) => T)(...args);
};
