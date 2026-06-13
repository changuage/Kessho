import { useMemo } from 'react';
import type { SelectedAudioEnginePageRuntimeBridgeOptions } from './useSelectedAudioEnginePageRuntimeBridges';

export type SelectedAudioEnginePageControlRuntimeProps = Pick<
  SelectedAudioEnginePageRuntimeBridgeOptions,
  | 'onRequestPlaybackStart'
  | 'preloadSelectedAudioEngine'
  | 'productRuntimeManualTriggers'
  | 'setSelectedDrumEvolveTriggerCallback'
  | 'setSelectedDrumStepPositionCallback'
  | 'setSelectedDrumTriggerCallback'
  | 'setSelectedSynthEvolveTriggerCallback'
  | 'setSelectedSynthAnchorWalkerVisualStateCallback'
  | 'setSelectedSynthOrbitVisualStateCallback'
  | 'setSelectedSynthStepPositionCallback'
>;

export function useSelectedAudioEnginePageControlRuntimeProps({
  onRequestPlaybackStart,
  preloadSelectedAudioEngine,
  productRuntimeManualTriggers,
  setSelectedDrumEvolveTriggerCallback,
  setSelectedDrumStepPositionCallback,
  setSelectedDrumTriggerCallback,
  setSelectedSynthEvolveTriggerCallback,
  setSelectedSynthAnchorWalkerVisualStateCallback,
  setSelectedSynthOrbitVisualStateCallback,
  setSelectedSynthStepPositionCallback,
}: SelectedAudioEnginePageControlRuntimeProps): SelectedAudioEnginePageControlRuntimeProps {
  return useMemo(() => ({
    onRequestPlaybackStart,
    preloadSelectedAudioEngine,
    productRuntimeManualTriggers,
    setSelectedDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback,
    setSelectedDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback,
    setSelectedSynthAnchorWalkerVisualStateCallback,
    setSelectedSynthOrbitVisualStateCallback,
    setSelectedSynthStepPositionCallback,
  }), [
    onRequestPlaybackStart,
    preloadSelectedAudioEngine,
    productRuntimeManualTriggers,
    setSelectedDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback,
    setSelectedDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback,
    setSelectedSynthAnchorWalkerVisualStateCallback,
    setSelectedSynthOrbitVisualStateCallback,
    setSelectedSynthStepPositionCallback,
  ]);
}
