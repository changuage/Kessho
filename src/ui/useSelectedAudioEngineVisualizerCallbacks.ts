import { useEffect } from 'react';
import {
  emitVisualizerPulse,
  setVisualizerSequencerState,
} from './visualizer/visualizerSignals';

type ActiveTab = 'global' | 'visualizer' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'texture' | 'routing';
type UiMode = 'snowflake' | 'advanced' | 'journey';

type SelectedAudioEngineVisualizerCallbacksOptions = {
  activeTab: ActiveTab;
  setSelectedDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setSelectedDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setSelectedSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  uiMode: UiMode;
};

export function useSelectedAudioEngineVisualizerCallbacks({
  activeTab,
  setSelectedDrumEvolveTriggerCallback,
  setSelectedDrumStepPositionCallback,
  setSelectedDrumTriggerCallback,
  setSelectedSynthEvolveTriggerCallback,
  setSelectedSynthStepPositionCallback,
  uiMode,
}: SelectedAudioEngineVisualizerCallbacksOptions): void {
  useEffect(() => {
    if (uiMode !== 'advanced' || activeTab !== 'visualizer') return;

    setSelectedDrumTriggerCallback((voice: string, velocity: number) => {
      if (document.visibilityState !== 'visible') return;
      const amount = Math.max(0.08, Math.min(1, velocity || 0.4));
      emitVisualizerPulse('drums', amount);
      emitVisualizerPulse('dynamics', amount * 0.12);
      if (voice.toLowerCase().includes('kick')) {
        emitVisualizerPulse('global', amount * 0.18);
      }
    });
    setSelectedDrumStepPositionCallback((steps: number[], hitCounts: number[]) => {
      if (document.visibilityState !== 'visible') return;
      setVisualizerSequencerState('drum', steps, hitCounts);
    });
    setSelectedSynthStepPositionCallback((steps: number[], hitCounts: number[]) => {
      if (document.visibilityState !== 'visible') return;
      setVisualizerSequencerState('synth', steps, hitCounts);
    });
    setSelectedDrumEvolveTriggerCallback((laneIndex: number) => {
      if (document.visibilityState !== 'visible') return;
      emitVisualizerPulse('drums', 0.22 + Math.min(0.24, laneIndex * 0.04));
      emitVisualizerPulse('sequencer', 0.18);
    });
    setSelectedSynthEvolveTriggerCallback((laneIndex: number) => {
      if (document.visibilityState !== 'visible') return;
      emitVisualizerPulse('synth', 0.2 + Math.min(0.24, laneIndex * 0.04));
      emitVisualizerPulse('sequencer', 0.18);
    });

    return () => {
      setSelectedDrumTriggerCallback(null);
      setSelectedDrumStepPositionCallback(null);
      setSelectedSynthStepPositionCallback(null);
      setSelectedDrumEvolveTriggerCallback(null);
      setSelectedSynthEvolveTriggerCallback(null);
    };
  }, [
    activeTab,
    setSelectedDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback,
    setSelectedDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback,
    uiMode,
  ]);
}
