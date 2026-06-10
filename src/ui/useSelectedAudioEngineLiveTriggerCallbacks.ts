import type { MutableRefObject } from 'react';
import {
  useLiveTriggerUiCallbacks,
  type LiveTriggerActiveTab,
  type LiveTriggerUiMode,
} from './useLiveTriggerUiCallbacks';
import type { SliderState } from './state';

type ActiveTab = LiveTriggerActiveTab;
type UiMode = LiveTriggerUiMode;

type SelectedAudioEngineLiveTriggerCallbacksOptions = {
  activeTab: ActiveTab;
  setSelectedDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setSelectedDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
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
  stateRef: MutableRefObject<SliderState>;
  uiMode: UiMode;
};

export function useSelectedAudioEngineLiveTriggerCallbacks({
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
  ...options
}: SelectedAudioEngineLiveTriggerCallbacksOptions): void {
  useLiveTriggerUiCallbacks({
    ...options,
    setDrumMorphTriggerCallback: setSelectedDrumMorphTriggerCallback,
    setDrumParamSHTriggerCallback: setSelectedDrumParamSHTriggerCallback,
    setGranularSHTriggerCallback: setSelectedGranularSHTriggerCallback,
    setLeadDelayCallback: setSelectedLeadDelayCallback,
    setLeadDistanceCallback: setSelectedLeadDistanceCallback,
    setLeadExpressionCallback: setSelectedLeadExpressionCallback,
    setLeadMorphCallback: setSelectedLeadMorphCallback,
    setPad2DistanceTriggerCallback: setSelectedPad2DistanceTriggerCallback,
    setPad2MorphTriggerCallback: setSelectedPad2MorphTriggerCallback,
    setPadDistanceTriggerCallback: setSelectedPadDistanceTriggerCallback,
    setPadMorphTriggerCallback: setSelectedPadMorphTriggerCallback,
    setPianoDistanceTriggerCallback: setSelectedPianoDistanceTriggerCallback,
  });
}
