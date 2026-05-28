import type { MutableRefObject } from 'react';
import { isMobileDevice } from '../platform';
import {
  DEFAULT_STATE,
  MOBILE_STATE,
  decodeStateFromUrl,
  type SliderState,
} from './state';
import {
  readAudioEngineRuntimeSwitchState,
  useAudioEngineRuntimeNavigation,
  useSelectedAudioEngineRuntimeMode,
} from './useAudioEngineRuntimeNavigation';

type SelectedAudioEngineRuntimeSessionNavigationOptions = {
  audioEngineRuntimeMode: ReturnType<typeof useSelectedAudioEngineRuntimeMode>;
  preloadSelectedAudioEngine: () => Promise<unknown>;
  stateRef: MutableRefObject<SliderState>;
  stopSelectedAudioEngine: () => void;
};

type ResolveSelectedAudioEngineInitialStateOptions = {
  normalizeState: (state: SliderState) => SliderState;
};

export function resolveSelectedAudioEngineInitialState({
  normalizeState,
}: ResolveSelectedAudioEngineInitialStateOptions): SliderState {
  const urlState = readAudioEngineRuntimeSwitchState() ?? decodeStateFromUrl(window.location.search);
  const mobileDefaultState = isMobileDevice() || window.innerWidth < 768;
  return normalizeState(urlState || (mobileDefaultState ? MOBILE_STATE : DEFAULT_STATE));
}

export function useSelectedAudioEngineRuntimeSession() {
  return {
    audioEngineRuntimeMode: useSelectedAudioEngineRuntimeMode(),
  };
}

export function useSelectedAudioEngineRuntimeSessionNavigation({
  audioEngineRuntimeMode,
  preloadSelectedAudioEngine,
  stateRef,
  stopSelectedAudioEngine,
}: SelectedAudioEngineRuntimeSessionNavigationOptions) {
  return useAudioEngineRuntimeNavigation({
    audioEngineRuntimeMode,
    preloadSelectedAudioEngine,
    stateRef,
    stopSelectedAudioEngine,
  });
}
