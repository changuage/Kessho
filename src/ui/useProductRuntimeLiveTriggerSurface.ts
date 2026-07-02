import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface';

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
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeLiveTriggerSurface {
  const liveTriggerSurface = useSelectedAudioEngineLiveTriggerSurface(productRuntimeMode);

  return {
    setProductLeadExpressionCallback: liveTriggerSurface.setSelectedLeadExpressionCallback,
    setProductLeadMorphCallback: liveTriggerSurface.setSelectedLeadMorphCallback,
    setProductPadMorphTriggerCallback: liveTriggerSurface.setSelectedPadMorphTriggerCallback,
    setProductPad2MorphTriggerCallback: liveTriggerSurface.setSelectedPad2MorphTriggerCallback,
    setProductLeadDistanceCallback: liveTriggerSurface.setSelectedLeadDistanceCallback,
    setProductPadDistanceTriggerCallback: liveTriggerSurface.setSelectedPadDistanceTriggerCallback,
    setProductPad2DistanceTriggerCallback: liveTriggerSurface.setSelectedPad2DistanceTriggerCallback,
    setProductPianoDistanceTriggerCallback: liveTriggerSurface.setSelectedPianoDistanceTriggerCallback,
    setProductSample1DistanceTriggerCallback: liveTriggerSurface.setSelectedSample1DistanceTriggerCallback,
    setProductSample2DistanceTriggerCallback: liveTriggerSurface.setSelectedSample2DistanceTriggerCallback,
    setProductLeadDelayCallback: liveTriggerSurface.setSelectedLeadDelayCallback,
    setProductDrumMorphTriggerCallback: liveTriggerSurface.setSelectedDrumMorphTriggerCallback,
    setProductDrumParamSHTriggerCallback: liveTriggerSurface.setSelectedDrumParamSHTriggerCallback,
    setProductGranularSHTriggerCallback: liveTriggerSurface.setSelectedGranularSHTriggerCallback,
  };
}
