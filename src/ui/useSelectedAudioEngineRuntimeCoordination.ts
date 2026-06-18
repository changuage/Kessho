import type { MutableRefObject } from 'react';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';
import type { DualSliderRange } from './DualSlider';
import type { SliderMode, SliderState } from './state';
import type { PitchSettings, StepOverrides, SubLaneKind, SubLaneState } from './sequencer/useEuclideanSequencer';
import {
  useSelectedAudioEngineEvolveOverrideCallbacks,
  type EvolvedOverrideState,
} from './useSelectedAudioEngineEvolveOverrideCallbacks';
import { useSelectedAudioEngineRangeSync } from './useSelectedAudioEngineRangeSync';
import { useSelectedAudioEngineRuntimeValueCleanup } from './useSelectedAudioEngineRuntimeValueCleanup';
import { useSelectedAudioEngineRuntimeWalkSync } from './useSelectedAudioEngineRuntimeWalkSync';

type ProductRange = { min: number; max: number };

type SelectedAudioEngineRuntimeCoordinationOptions = {
  activeTab: string;
  createDefaultPitchSettings: (laneCount?: number) => PitchSettings[];
  drumMorphKeyToVoice: Record<string, ProductDrumVoice>;
  drumMorphKeys: Set<keyof SliderState>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  drumSHParamKeys: Set<string>;
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  dualSliderRanges: Partial<Record<keyof SliderState, DualSliderRange | undefined>>;
  playbackIsRunning: boolean;
  randomWalkMode: SliderState['randomWalkMode'];
  randomWalkSpeed: SliderState['randomWalkSpeed'];
  selectedRuntimeSupportsRangeKey: (key: string) => boolean;
  setSelectedDrumEvolveOverridesChangedCallback: (callback: ((laneIndex: number, overrides: unknown) => void) | null) => void;
  setSelectedDrumMorphRange: (voice: ProductDrumVoice, range: ProductRange | null) => void;
  setSelectedDrumParamSHRange: (key: string, range: ProductRange | null) => void;
  setSelectedDualRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  setSelectedRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setSelectedRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  setSelectedSynthEvolveOverridesChangedCallback: (callback: ((laneIndex: number, overrides: unknown) => void) | null) => void;
  setSelectedSynthNoteRangeEvolvedCallback: (callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null) => void;
  shouldMirrorRuntimeWalkPositions: boolean;
  sliderModes: Record<string, SliderMode>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
};

type SelectedAudioEngineRuntimeCoordination = {
  drumEvolvedOverrides: EvolvedOverrideState | undefined;
  synthEvolvedOverrides: EvolvedOverrideState | undefined;
};

export function useSelectedAudioEngineRuntimeCoordination({
  activeTab,
  createDefaultPitchSettings,
  drumMorphKeyToVoice,
  drumMorphKeys,
  drumPitchSettingsRef,
  drumSHParamKeys,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  dualSliderRanges,
  playbackIsRunning,
  randomWalkMode,
  randomWalkSpeed,
  selectedRuntimeSupportsRangeKey,
  setSelectedDrumEvolveOverridesChangedCallback,
  setSelectedDrumMorphRange,
  setSelectedDrumParamSHRange,
  setSelectedDualRanges,
  setSelectedRuntimeWalkPositionsCallback,
  setSelectedRuntimeWalkRanges,
  setSelectedSynthEvolveOverridesChangedCallback,
  setSelectedSynthNoteRangeEvolvedCallback,
  shouldMirrorRuntimeWalkPositions,
  sliderModes,
  synthPitchSettingsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: SelectedAudioEngineRuntimeCoordinationOptions): SelectedAudioEngineRuntimeCoordination {
  useSelectedAudioEngineRangeSync({
    drumMorphKeyToVoice,
    drumMorphKeys,
    drumSHParamKeys,
    dualSliderRanges,
    selectedRuntimeSupportsRangeKey,
    setSelectedDrumMorphRange,
    setSelectedDrumParamSHRange,
    setSelectedDualRanges,
    sliderModes,
  });

  useSelectedAudioEngineRuntimeWalkSync({
    dualSliderRanges,
    randomWalkMode,
    randomWalkSpeed,
    selectedRuntimeSupportsRangeKey,
    setSelectedRuntimeWalkPositionsCallback,
    setSelectedRuntimeWalkRanges,
    shouldMirrorRuntimeWalkPositions,
    sliderModes,
  });

  const evolvedOverrides = useSelectedAudioEngineEvolveOverrideCallbacks({
    activeTab,
    createDefaultPitchSettings,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
    drumPitchSettingsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
    synthPitchSettingsRef,
    setSelectedDrumEvolveOverridesChangedCallback,
    setSelectedSynthEvolveOverridesChangedCallback,
    setSelectedSynthNoteRangeEvolvedCallback,
  });

  useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);

  return evolvedOverrides;
}
