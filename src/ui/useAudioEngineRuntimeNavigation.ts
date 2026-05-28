import type { MutableRefObject } from 'react';
import type { SliderState } from './state';
import {
  readProductRuntimeSwitchState,
  useProductRuntimeMode,
  useProductRuntimeNavigationCore,
  type ProductRuntimeNavigationMode,
} from './useProductRuntimeNavigationCore';

type UseAudioEngineRuntimeNavigationOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  preloadSelectedAudioEngine: () => Promise<unknown>;
  stateRef: MutableRefObject<SliderState>;
  stopSelectedAudioEngine: () => void;
};

type AudioEngineRuntimeNavigation = {
  audioEngineRuntimeModes: readonly AudioEngineRuntimeMode[];
  showAudioEngineSwitcher: boolean;
  startInAdvancedEditor: boolean;
  handleAudioEngineRuntimeModeChange: (mode: AudioEngineRuntimeMode) => void;
  preloadAdvancedEditorRuntime: () => void;
};

export type AudioEngineRuntimeMode = ProductRuntimeNavigationMode;

export function readAudioEngineRuntimeSwitchState(): SliderState | null {
  return readProductRuntimeSwitchState();
}

export function useSelectedAudioEngineRuntimeMode(): AudioEngineRuntimeMode {
  return useProductRuntimeMode();
}

export function useAudioEngineRuntimeNavigation({
  audioEngineRuntimeMode,
  preloadSelectedAudioEngine,
  stateRef,
  stopSelectedAudioEngine,
}: UseAudioEngineRuntimeNavigationOptions): AudioEngineRuntimeNavigation {
  return useProductRuntimeNavigationCore({
    audioEngineRuntimeMode,
    preloadProductRuntime: preloadSelectedAudioEngine,
    stateRef,
    stopProductRuntime: stopSelectedAudioEngine,
  });
}
