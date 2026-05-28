import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

type ProductRange = { min: number; max: number };

// TODO(product-core-burn-down): replace this port-to-host dispatch bridge with
// product-owned dirty range patches or generated ProductEvents for modulation
// range and runtime-walk control updates.
export function setCoreProductRuntimeWalkPositionsCallback(
  callHost: CoreProductHostMethodCall,
  callback: ((positions: Record<string, number>) => void) | null,
): void {
  callHost<void>('setRuntimeWalkPositionsCallback', callback);
}

export function setCoreProductDrumMorphRange(
  callHost: CoreProductHostMethodCall,
  voice: unknown,
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
  ranges: Partial<Record<string, ProductRange>>,
): void {
  callHost<void>('setDualRanges', ranges);
}

export function setCoreProductRuntimeWalkRanges(
  callHost: CoreProductHostMethodCall,
  ranges: Partial<Record<string, ProductRange>>,
): void {
  callHost<void>('setRuntimeWalkRanges', ranges);
}
