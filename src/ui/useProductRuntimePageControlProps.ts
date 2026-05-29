import {
  useSelectedAudioEnginePageControlRuntimeProps,
} from './useSelectedAudioEnginePageControlRuntimeProps';
import type { SliderState } from './state';

export type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: unknown) => void;
  triggerDrumVoice: (voice: unknown) => void;
};

export type ProductRuntimePageControlProps = {
  onRequestPlaybackStart: (statePatch?: Partial<SliderState>) => void;
  preloadProductRuntime: () => Promise<unknown>;
  productRuntimeManualTriggers: ProductRuntimeManualTriggers;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
};

export function useProductRuntimePageControlProps({
  preloadProductRuntime,
  setProductDrumEvolveTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimePageControlProps) {
  return useSelectedAudioEnginePageControlRuntimeProps({
    ...options,
    preloadSelectedAudioEngine: preloadProductRuntime,
    setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: setProductDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback,
  });
}
