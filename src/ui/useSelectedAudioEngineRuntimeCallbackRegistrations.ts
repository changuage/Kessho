import type { MutableRefObject } from 'react';
import type { SliderState } from './state';
import { useSelectedAudioEngineLiveTriggerCallbacks } from './useSelectedAudioEngineLiveTriggerCallbacks';
import { useSelectedAudioEngineVisualizerCallbacks } from './useSelectedAudioEngineVisualizerCallbacks';

type ActiveTab = 'global' | 'visualizer' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'texture' | 'routing';
type UiMode = 'snowflake' | 'advanced' | 'journey';

type SelectedAudioEngineRuntimeCallbackRegistrationsOptions = {
  activeTab: ActiveTab;
  setSelectedDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setSelectedDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setSelectedDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setSelectedDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setSelectedGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setSelectedLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setSelectedLeadDistanceCallback: (callback: ((distance: { lead1: number; lead2: number }) => void) | null) => void;
  setSelectedLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setSelectedLeadMorphCallback: (callback: ((morph: { lead1: number; lead2: number }) => void) | null) => void;
  setSelectedPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setSelectedPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setSelectedPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedSample1DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  setSelectedSample2DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  setSelectedSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  stateRef: MutableRefObject<SliderState>;
  uiMode: UiMode;
};

export function useSelectedAudioEngineRuntimeCallbackRegistrations({
  activeTab,
  setSelectedDrumEvolveTriggerCallback,
  setSelectedDrumMorphTriggerCallback,
  setSelectedDrumParamSHTriggerCallback,
  setSelectedDrumStepPositionCallback,
  setSelectedDrumTriggerCallback,
  setSelectedGranularSHTriggerCallback,
  setSelectedLeadDelayCallback,
  setSelectedLeadDistanceCallback,
  setSelectedLeadExpressionCallback,
  setSelectedLeadMorphCallback,
  setSelectedPad2DistanceTriggerCallback,
  setSelectedPad2MorphTriggerCallback,
  setSelectedPadDistanceTriggerCallback,
  setSelectedPadMorphTriggerCallback,
  setSelectedPianoDistanceTriggerCallback,
  setSelectedSample1DistanceTriggerCallback,
  setSelectedSample2DistanceTriggerCallback,
  setSelectedSynthEvolveTriggerCallback,
  setSelectedSynthStepPositionCallback,
  stateRef,
  uiMode,
}: SelectedAudioEngineRuntimeCallbackRegistrationsOptions): void {
  useSelectedAudioEngineVisualizerCallbacks({
    activeTab,
    setSelectedDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback,
    setSelectedDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback,
    uiMode,
  });

  useSelectedAudioEngineLiveTriggerCallbacks({
    activeTab,
    setSelectedDrumMorphTriggerCallback,
    setSelectedDrumParamSHTriggerCallback,
    setSelectedGranularSHTriggerCallback,
    setSelectedLeadDelayCallback,
    setSelectedLeadDistanceCallback,
    setSelectedLeadExpressionCallback,
    setSelectedLeadMorphCallback,
    setSelectedPad2DistanceTriggerCallback,
    setSelectedPad2MorphTriggerCallback,
    setSelectedPadDistanceTriggerCallback,
    setSelectedPadMorphTriggerCallback,
    setSelectedPianoDistanceTriggerCallback,
    setSelectedSample1DistanceTriggerCallback,
    setSelectedSample2DistanceTriggerCallback,
    stateRef,
    uiMode,
  });
}
