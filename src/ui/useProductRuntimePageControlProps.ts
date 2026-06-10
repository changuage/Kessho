import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductDrumVoice, ProductManualSynthNote } from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';

export type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  triggerDrumVoice: (voice: ProductDrumVoice) => void;
};

export type ProductRuntimePageControlProps = {
  onRequestPlaybackStart: (statePatch?: Partial<SliderState>) => void;
  preloadProductRuntime: () => Promise<unknown>;
  productRuntimeManualTriggers: ProductRuntimeManualTriggers;
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
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
    setProductSynthStepPositionCallback,
  ]);
}
