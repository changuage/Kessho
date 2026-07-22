import { useCallback } from 'react';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';

type ProductRuntimeRange = { min: number; max: number };

type ProductRuntimeModulationRanges = {
  setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void;
  setProductDrumParamSHRange: (key: string, range: ProductRuntimeRange | null) => void;
  setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void;
  setProductRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void;
};

export function useProductRuntimeModulationRanges(
  productRuntimeCore: boolean,
): ProductRuntimeModulationRanges {
  const productRuntimeActive = productRuntimeCore;

  const setProductRuntimeWalkPositionsCallback = useCallback((callback: ((positions: Record<string, number>) => void) | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setRuntimeWalkPositionsCallback(callback);
  }, [productRuntimeActive]);

  const setProductDrumMorphRange = useCallback((voice: ProductDrumVoice, range: ProductRuntimeRange | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setDrumMorphRange(voice, range);
  }, [productRuntimeActive]);

  const setProductDrumParamSHRange = useCallback((key: string, range: ProductRuntimeRange | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setDrumParamSHRange(key, range);
  }, [productRuntimeActive]);

  const setProductDualRanges = useCallback((ranges: Partial<Record<string, ProductRuntimeRange>>): void => {
    if (!productRuntimeActive) return;
    productEngine.setDualRanges(ranges);
  }, [productRuntimeActive]);

  const setProductRuntimeWalkRanges = useCallback((ranges: Partial<Record<string, ProductRuntimeRange>>): void => {
    if (!productRuntimeActive) return;
    productEngine.setRuntimeWalkRanges(ranges);
  }, [productRuntimeActive]);

  return {
    setProductRuntimeWalkPositionsCallback,
    setProductDrumMorphRange,
    setProductDrumParamSHRange,
    setProductDualRanges,
    setProductRuntimeWalkRanges,
  };
}
