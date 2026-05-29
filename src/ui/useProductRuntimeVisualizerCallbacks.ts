import { useSelectedAudioEngineVisualizerCallbacks } from './useSelectedAudioEngineVisualizerCallbacks';

type ProductRuntimeVisualizerActiveTab =
  | 'global'
  | 'visualizer'
  | 'synth'
  | 'drums'
  | 'reverb'
  | 'granular'
  | 'earth'
  | 'delay'
  | 'dynamics'
  | 'routing';
type ProductRuntimeVisualizerUiMode = 'snowflake' | 'advanced' | 'journey';

export type ProductRuntimeVisualizerCallbacksOptions = {
  activeTab: ProductRuntimeVisualizerActiveTab;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  uiMode: ProductRuntimeVisualizerUiMode;
};

export function useProductRuntimeVisualizerCallbacks({
  activeTab,
  setProductDrumEvolveTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  uiMode,
}: ProductRuntimeVisualizerCallbacksOptions): void {
  // TODO(product-runtime-compat-10E): visualizer registration still delegates to the
  // selected-runtime compatibility hook until callback registration is product-owned.
  useSelectedAudioEngineVisualizerCallbacks({
    activeTab,
    setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: setProductDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback,
    uiMode,
  });
}
