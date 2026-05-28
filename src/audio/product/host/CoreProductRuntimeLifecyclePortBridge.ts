import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';
import type { ProductEngineStartOptions } from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this lifecycle bridge with
// product-owned runtime lifecycle dispatch once WebProductEngine is no longer
// adapting Product host method names.
export function startCoreProductRuntime(
  callHost: CoreProductHostMethodCall,
  initialState?: ProductEngineStartOptions['initialState'],
): Promise<void> {
  return callHost<Promise<void>>('start', initialState);
}

export function stopCoreProductRuntime(callHost: CoreProductHostMethodCall): void {
  callHost<void>('stop');
}

export function suspendCoreProductRuntime(callHost: CoreProductHostMethodCall): Promise<void> {
  return callHost<Promise<void>>('suspend');
}

export function resumeCoreProductRuntime(callHost: CoreProductHostMethodCall): Promise<void> {
  return callHost<Promise<void>>('resume');
}
