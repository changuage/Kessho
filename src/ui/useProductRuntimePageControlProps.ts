import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';
import type { RuntimeManualTriggerSurface } from './useProductRuntimeManualTriggers';

export type ProductRuntimePageControlProps = {
  onRequestPlaybackStart: (statePatch?: Partial<SliderState>) => void;
  preloadProductRuntime: () => Promise<unknown>;
  productRuntimeManualTriggers: RuntimeManualTriggerSurface;
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductSynthAnchorWalkerVisualStateCallback: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
  setProductSynthOrbitVisualStateCallback: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
};

export function useProductRuntimePageControlProps({
  onRequestPlaybackStart,
  preloadProductRuntime,
  productRuntimeManualTriggers,
  productRuntimeMode,
  stateRef,
  setProductDrumEvolveTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthAnchorWalkerVisualStateCallback,
  setProductSynthOrbitVisualStateCallback,
  setProductSynthStepPositionCallback,
}: ProductRuntimePageControlProps): ProductRuntimePageControlProps {
  return useMemo(() => ({
    onRequestPlaybackStart,
    preloadProductRuntime,
    productRuntimeManualTriggers,
    productRuntimeMode,
    stateRef,
    setProductDrumEvolveTriggerCallback,
    setProductDrumStepPositionCallback,
    setProductDrumTriggerCallback,
    setProductSynthEvolveTriggerCallback,
    setProductSynthAnchorWalkerVisualStateCallback,
    setProductSynthOrbitVisualStateCallback,
    setProductSynthStepPositionCallback,
  }), [
    onRequestPlaybackStart,
    preloadProductRuntime,
    productRuntimeManualTriggers,
    productRuntimeMode,
    stateRef,
    setProductDrumEvolveTriggerCallback,
    setProductDrumStepPositionCallback,
    setProductDrumTriggerCallback,
    setProductSynthEvolveTriggerCallback,
    setProductSynthAnchorWalkerVisualStateCallback,
    setProductSynthOrbitVisualStateCallback,
    setProductSynthStepPositionCallback,
  ]);
}
