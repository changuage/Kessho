import { useMemo, type MutableRefObject } from 'react';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import type { GlobalRuntimeComparisonPanelProps } from './global/GlobalRuntimeComparisonPanel';
import type { SliderState } from './state';
import { useSelectedAudioEnginePerf } from './useSelectedAudioEnginePerf';
import { useSelectedAudioEngineRuntimeSessionNavigation } from './useSelectedAudioEngineRuntimeSession';

type SelectedAudioEngineRuntimeUiOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  preloadSelectedAudioEngine: () => Promise<unknown>;
  stateRef: MutableRefObject<SliderState>;
  stopSelectedAudioEngine: () => void;
};

export function useSelectedAudioEngineRuntimeUi({
  audioEngineRuntimeMode,
  preloadSelectedAudioEngine,
  stateRef,
  stopSelectedAudioEngine,
}: SelectedAudioEngineRuntimeUiOptions) {
  const runtimeNavigation = useSelectedAudioEngineRuntimeSessionNavigation({
    audioEngineRuntimeMode,
    preloadSelectedAudioEngine,
    stateRef,
    stopSelectedAudioEngine,
  });
  const perf = useSelectedAudioEnginePerf(audioEngineRuntimeMode, runtimeNavigation.showAudioEngineSwitcher);
  const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({
    currentMode: audioEngineRuntimeMode,
    modes: runtimeNavigation.audioEngineRuntimeModes,
    cpuSummaries: perf.audioEngineCpuSummaries,
    visible: runtimeNavigation.showAudioEngineSwitcher,
    onModeChange: runtimeNavigation.handleAudioEngineRuntimeModeChange,
  }), [
    audioEngineRuntimeMode,
    perf.audioEngineCpuSummaries,
    runtimeNavigation.audioEngineRuntimeModes,
    runtimeNavigation.handleAudioEngineRuntimeModeChange,
    runtimeNavigation.showAudioEngineSwitcher,
  ]);

  return {
    ...runtimeNavigation,
    ...perf,
    globalRuntimeComparison,
  };
}
