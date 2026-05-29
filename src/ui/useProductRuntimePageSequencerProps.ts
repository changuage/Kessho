import { useMemo, type MutableRefObject } from 'react';
import type { ClockDivision, DrumStepOverrides, PitchBindingMode } from '../audio/drumSeqTypes';
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
  drumClockDivsRef,
  drumEvolveConfigsRef,
  drumLinkedRef,
  drumPitchSettingsRef,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  synthClockDivsRef,
  synthEvolveConfigsRef,
  synthLinkedRef,
  synthPitchBindingModesRef,
  synthPitchSettingsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: ProductRuntimePageSequencerProps): ProductRuntimePageSequencerProps {
  return useMemo(() => ({
    captureProductSynthEuclidLaneHome,
    captureProductDrumEuclidLaneHome,
    diceProductSynthEuclidLane,
    diceProductDrumEuclidLane,
    drumClockDivsRef,
    drumEvolveConfigsRef,
    drumLinkedRef,
    drumPitchSettingsRef,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
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
    synthClockDivsRef,
    synthEvolveConfigsRef,
    synthLinkedRef,
    synthPitchBindingModesRef,
    synthPitchSettingsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
  }), [
    captureProductDrumEuclidLaneHome,
    captureProductSynthEuclidLaneHome,
    diceProductDrumEuclidLane,
    diceProductSynthEuclidLane,
    drumClockDivsRef,
    drumEvolveConfigsRef,
    drumLinkedRef,
    drumPitchSettingsRef,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
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
    synthClockDivsRef,
    synthEvolveConfigsRef,
    synthLinkedRef,
    synthPitchBindingModesRef,
    synthPitchSettingsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
  ]);
}
