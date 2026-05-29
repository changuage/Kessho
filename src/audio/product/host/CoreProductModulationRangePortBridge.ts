import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';
import type {
  ProductDrumVoice,
  ProductRange,
  ProductRangeMap,
  ProductRuntimeWalkPositionsCallback,
} from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this port-to-host dispatch bridge with
// product-owned dirty range patches or generated ProductEvents for modulation
// range and runtime-walk control updates.
export function setCoreProductRuntimeWalkPositionsCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductRuntimeWalkPositionsCallback | null,
): void {
  callHost<void>('setRuntimeWalkPositionsCallback', callback);
}

export function setCoreProductDrumMorphRange(
  callHost: CoreProductHostMethodCall,
  voice: ProductDrumVoice,
  range: ProductRange | null,
): void {
  callHost<void>('setDrumMorphRange', voice, range);
}

export function setCoreProductDrumParamSampleHoldRange(
  callHost: CoreProductHostMethodCall,
  key: string,
  range: ProductRange | null,
): void {
  callHost<void>('setDrumParamSHRange', key, range);
}

export function setCoreProductSampleHoldRanges(
  callHost: CoreProductHostMethodCall,
  ranges: ProductRangeMap,
): void {
  callHost<void>('setDualRanges', ranges);
}

export function setCoreProductRuntimeWalkRanges(
  callHost: CoreProductHostMethodCall,
  ranges: ProductRangeMap,
): void {
  callHost<void>('setRuntimeWalkRanges', ranges);
}
