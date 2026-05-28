import type { MutableRefObject } from 'react';
import type { ClockDivision, DrumStepOverrides, PitchBindingMode } from '../audio/drumSeqTypes';
import {
  useSelectedAudioEnginePageSequencerRuntimeProps,
} from './useSelectedAudioEnginePageSequencerRuntimeProps';
import type { EvolveConfig, PitchSettings, StepOverrides, SubLaneKind, SubLaneState } from './sequencer/useEuclideanSequencer';

export type ProductRuntimePageSequencerProps = {
  captureProductSynthEuclidLaneHome: (laneIdx: number, pitchState?: SubLaneState) => void;
  captureProductDrumEuclidLaneHome: (laneIdx: number, pitchSettings?: PitchSettings, pitchState?: SubLaneState) => void;
  diceProductSynthEuclidLane: (laneIdx: number, intensity: number) => void;
  diceProductDrumEuclidLane: (laneIdx: number, intensity: number) => void;
  drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  drumEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  drumLinkedRef: MutableRefObject<boolean[] | undefined>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  resetProductDrumEuclidLaneHome: (laneIdx: number) => void;
  resetProductSynthEuclidLaneHome: (laneIdx: number) => void;
  setProductDrumEuclidClockDivs: (divs: ClockDivision[]) => void;
  setProductDrumEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setProductDrumEuclidSwings: (swings: number[]) => void;
  setProductDrumStepOverrides: (overrides: DrumStepOverrides) => void;
  setProductDrumSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
  setProductSynthEuclidClockDivs: (divs: ClockDivision[]) => void;
  setProductSynthEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setProductSynthEuclidSwings: (swings: number[]) => void;
  setProductSynthPitchBindingModes: (modes: PitchBindingMode[]) => void;
  setProductSynthPitchSettings: (settings: PitchSettings[]) => void;
  setProductSynthStepOverrides: (overrides: Partial<StepOverrides>) => void;
  setProductSynthSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
  synthClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  synthEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  synthLinkedRef: MutableRefObject<boolean[] | undefined>;
  synthPitchBindingModesRef: MutableRefObject<PitchBindingMode[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
};

export function useProductRuntimePageSequencerProps({
  captureProductSynthEuclidLaneHome,
  captureProductDrumEuclidLaneHome,
  diceProductSynthEuclidLane,
  diceProductDrumEuclidLane,
  resetProductDrumEuclidLaneHome,
  resetProductSynthEuclidLaneHome,
  setProductDrumEuclidClockDivs,
  setProductDrumEuclidEvolveConfigs,
  setProductDrumEuclidSwings,
  setProductDrumStepOverrides,
  setProductDrumSubLaneEnabled,
  setProductSynthEuclidClockDivs,
  setProductSynthEuclidEvolveConfigs,
  setProductSynthEuclidSwings,
  setProductSynthPitchBindingModes,
  setProductSynthPitchSettings,
  setProductSynthStepOverrides,
  setProductSynthSubLaneEnabled,
  ...options
}: ProductRuntimePageSequencerProps) {
  return useSelectedAudioEnginePageSequencerRuntimeProps({
    ...options,
    captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome,
    captureSelectedDrumEuclidLaneHome: captureProductDrumEuclidLaneHome,
    diceSelectedSynthEuclidLane: diceProductSynthEuclidLane,
    diceSelectedDrumEuclidLane: diceProductDrumEuclidLane,
    resetSelectedDrumEuclidLaneHome: resetProductDrumEuclidLaneHome,
    resetSelectedSynthEuclidLaneHome: resetProductSynthEuclidLaneHome,
    setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs: setProductDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings: setProductDrumEuclidSwings,
    setSelectedDrumStepOverrides: setProductDrumStepOverrides,
    setSelectedDrumSubLaneEnabled: setProductDrumSubLaneEnabled,
    setSelectedSynthEuclidClockDivs: setProductSynthEuclidClockDivs,
    setSelectedSynthEuclidEvolveConfigs: setProductSynthEuclidEvolveConfigs,
    setSelectedSynthEuclidSwings: setProductSynthEuclidSwings,
    setSelectedSynthPitchBindingModes: setProductSynthPitchBindingModes,
    setSelectedSynthPitchSettings: setProductSynthPitchSettings,
    setSelectedSynthStepOverrides: setProductSynthStepOverrides,
    setSelectedSynthSubLaneEnabled: setProductSynthSubLaneEnabled,
  });
}
