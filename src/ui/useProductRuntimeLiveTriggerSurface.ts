import { useCallback, useMemo } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';

type ProductLeadMorph = { lead1: number; lead2: number };
type ProductLeadDistance = { lead1: number; lead2: number };

type ProductRuntimeLiveTriggerSurface = {
  setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setProductLeadMorphCallback: (callback: ((morph: ProductLeadMorph) => void) | null) => void;
  setProductPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setProductPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setProductLeadDistanceCallback: (callback: ((distance: ProductLeadDistance) => void) | null) => void;
  setProductPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductSample1DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductSample2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setProductDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setProductDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
};

export function useProductRuntimeLiveTriggerSurface(
): ProductRuntimeLiveTriggerSurface {
  const setProductLeadExpressionCallback = useCallback((callback: ((expression: Record<string, number>) => void) | null) => {
    productEngine.setLeadExpressionCallback(callback);
  }, []);
  const setProductLeadMorphCallback = useCallback((callback: ((morph: ProductLeadMorph) => void) | null) => {
    productEngine.setLeadMorphCallback(callback);
  }, []);
  const setProductPadMorphTriggerCallback = useCallback((callback: ((morphPosition: number) => void) | null) => {
    productEngine.setPadMorphTriggerCallback(callback);
  }, []);
  const setProductPad2MorphTriggerCallback = useCallback((callback: ((morphPosition: number) => void) | null) => {
    productEngine.setPad2MorphTriggerCallback(callback);
  }, []);
  const setProductLeadDistanceCallback = useCallback((callback: ((distance: ProductLeadDistance) => void) | null) => {
    productEngine.setLeadDistanceCallback(callback);
  }, []);
  const setProductPadDistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null) => {
    productEngine.setPadDistanceTriggerCallback(callback);
  }, []);
  const setProductPad2DistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null) => {
    productEngine.setPad2DistanceTriggerCallback(callback);
  }, []);
  const setProductPianoDistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null) => {
    productEngine.setPianoDistanceTriggerCallback(callback);
  }, []);
  const setProductSample1DistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null) => {
    productEngine.setSample1DistanceTriggerCallback(callback);
  }, []);
  const setProductSample2DistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null) => {
    productEngine.setSample2DistanceTriggerCallback(callback);
  }, []);
  const setProductLeadDelayCallback = useCallback((callback: ((delay: Record<string, number | string>) => void) | null) => {
    productEngine.setLeadDelayCallback(callback);
  }, []);
  const setProductDrumMorphTriggerCallback = useCallback((callback: ((voice: unknown, morphPosition: number) => void) | null) => {
    productEngine.setDrumMorphTriggerCallback(callback);
  }, []);
  const setProductDrumParamSHTriggerCallback = useCallback((callback: ((voice: unknown, key: string, position: number) => void) | null) => {
    productEngine.setDrumParamSHTriggerCallback(callback);
  }, []);
  const setProductGranularSHTriggerCallback = useCallback((callback: ((positions: Record<string, number>) => void) | null) => {
    productEngine.setGranularSHTriggerCallback(callback);
  }, []);

  return useMemo(() => ({
    setProductLeadExpressionCallback,
    setProductLeadMorphCallback,
    setProductPadMorphTriggerCallback,
    setProductPad2MorphTriggerCallback,
    setProductLeadDistanceCallback,
    setProductPadDistanceTriggerCallback,
    setProductPad2DistanceTriggerCallback,
    setProductPianoDistanceTriggerCallback,
    setProductSample1DistanceTriggerCallback,
    setProductSample2DistanceTriggerCallback,
    setProductLeadDelayCallback,
    setProductDrumMorphTriggerCallback,
    setProductDrumParamSHTriggerCallback,
    setProductGranularSHTriggerCallback,
  }), [
    setProductLeadExpressionCallback,
    setProductLeadMorphCallback,
    setProductPadMorphTriggerCallback,
    setProductPad2MorphTriggerCallback,
    setProductLeadDistanceCallback,
    setProductPadDistanceTriggerCallback,
    setProductPad2DistanceTriggerCallback,
    setProductPianoDistanceTriggerCallback,
    setProductSample1DistanceTriggerCallback,
    setProductSample2DistanceTriggerCallback,
    setProductLeadDelayCallback,
    setProductDrumMorphTriggerCallback,
    setProductDrumParamSHTriggerCallback,
    setProductGranularSHTriggerCallback,
  ]);
}
