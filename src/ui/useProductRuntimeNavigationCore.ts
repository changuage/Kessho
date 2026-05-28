import { useCallback, useMemo, type MutableRefObject } from 'react';
import {
  getAudioEngineRuntimeMode,
  getAudioEngineRuntimeModes,
  type AudioEngineRuntimeMode,
} from '../audio/product/ProductAudioRuntimeSelection';
import {
  buildAudioEngineSwitchUrl,
  readAudioEngineSwitchStateFromSession,
  shouldShowAudioEngineSwitcher,
  shouldStartInAdvancedEditor,
} from './audioEngineRuntimeUi';
import type { SliderState } from './state';

type ProductRuntimeNavigationCoreOptions = {
  audioEngineRuntimeMode: ProductRuntimeNavigationMode;
  preloadProductRuntime: () => Promise<unknown>;
  stateRef: MutableRefObject<SliderState>;
  stopProductRuntime: () => void;
};

type ProductRuntimeNavigationCore = {
  audioEngineRuntimeModes: readonly ProductRuntimeNavigationMode[];
  showAudioEngineSwitcher: boolean;
  startInAdvancedEditor: boolean;
  handleAudioEngineRuntimeModeChange: (mode: ProductRuntimeNavigationMode) => void;
  preloadAdvancedEditorRuntime: () => void;
};

export type ProductRuntimeNavigationMode = AudioEngineRuntimeMode;

export function readProductRuntimeSwitchState(): SliderState | null {
  return readAudioEngineSwitchStateFromSession();
}

export function useProductRuntimeMode(): ProductRuntimeNavigationMode {
  return useMemo(() => getAudioEngineRuntimeMode(), []);
}

export function useProductRuntimeNavigationCore({
  audioEngineRuntimeMode,
  preloadProductRuntime,
  stateRef,
  stopProductRuntime,
}: ProductRuntimeNavigationCoreOptions): ProductRuntimeNavigationCore {
  const showAudioEngineSwitcher = useMemo(() => shouldShowAudioEngineSwitcher(), []);
  const startInAdvancedEditor = useMemo(() => shouldStartInAdvancedEditor(), []);
  const audioEngineRuntimeModes = useMemo(() => getAudioEngineRuntimeModes(), []);

  const handleAudioEngineRuntimeModeChange = useCallback((mode: ProductRuntimeNavigationMode): void => {
    if (mode === audioEngineRuntimeMode) return;
    try {
      stopProductRuntime();
    } catch {
      // The page reload is the actual switch boundary.
    }
    window.location.assign(buildAudioEngineSwitchUrl(mode, stateRef.current));
  }, [audioEngineRuntimeMode, stateRef, stopProductRuntime]);

  const preloadAdvancedEditorRuntime = useCallback((): void => {
    void preloadProductRuntime();
  }, [preloadProductRuntime]);

  return {
    audioEngineRuntimeModes,
    showAudioEngineSwitcher,
    startInAdvancedEditor,
    handleAudioEngineRuntimeModeChange,
    preloadAdvancedEditorRuntime,
  };
}
