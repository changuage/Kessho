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
  setSelectedDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setSelectedDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setSelectedSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
};

export function useProductRuntimePageControlProps({
  preloadProductRuntime,
  ...options
}: ProductRuntimePageControlProps) {
  return useSelectedAudioEnginePageControlRuntimeProps({
    ...options,
    preloadSelectedAudioEngine: preloadProductRuntime,
  });
}
