import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineSequencerControls } from './useSelectedAudioEngineSequencerControls';

type ProductRuntimeSequencerPitchState = { steps?: number; direction?: string; scaleQuantize?: boolean } | null;

type ProductRuntimeSequencerControls = {
  setProductDrumEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setProductSynthEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setProductDrumEuclidClockDivs: (divs: readonly unknown[]) => void;
  setProductSynthEuclidClockDivs: (divs: readonly unknown[]) => void;
  setProductDrumEuclidSwings: (swings: readonly unknown[]) => void;
  setProductSynthEuclidSwings: (swings: readonly unknown[]) => void;
  setProductDrumSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setProductSynthSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setProductDrumPitchSettings: (settings: readonly unknown[]) => void;
  setProductSynthPitchSettings: (settings: readonly unknown[]) => void;
  setProductSynthPitchBindingModes: (modes: readonly unknown[]) => void;
  setProductDrumStepOverrides: (overrides: unknown) => void;
  setProductSynthStepOverrides: (overrides: unknown) => void;
  setProductSequencerPresetHomeSnapshots: (
    drumPitchSettings?: readonly unknown[],
    drumPitchStates?: readonly (ProductRuntimeSequencerPitchState | undefined)[],
    synthPitchStates?: readonly (ProductRuntimeSequencerPitchState | undefined)[],
  ) => void;
  resetProductSynthEuclidLaneHome: (laneIndex: number) => void;
  captureProductSynthEuclidLaneHome: (laneIndex: number, pitchState?: ProductRuntimeSequencerPitchState) => void;
  diceProductSynthEuclidLane: (laneIndex: number, intensity?: number) => void;
  resetProductDrumEuclidLaneHome: (laneIndex: number) => void;
  captureProductDrumEuclidLaneHome: (laneIndex: number, pitchSettings?: unknown, pitchState?: ProductRuntimeSequencerPitchState) => void;
  diceProductDrumEuclidLane: (laneIndex: number, intensity?: number) => void;
};

export function useProductRuntimeSequencerControls(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeSequencerControls {
  const sequencerControls = useSelectedAudioEngineSequencerControls(productRuntimeMode);

  return {
    setProductDrumEuclidEvolveConfigs: sequencerControls.setSelectedDrumEuclidEvolveConfigs,
    setProductSynthEuclidEvolveConfigs: sequencerControls.setSelectedSynthEuclidEvolveConfigs,
    setProductDrumEuclidClockDivs: sequencerControls.setSelectedDrumEuclidClockDivs,
    setProductSynthEuclidClockDivs: sequencerControls.setSelectedSynthEuclidClockDivs,
    setProductDrumEuclidSwings: sequencerControls.setSelectedDrumEuclidSwings,
    setProductSynthEuclidSwings: sequencerControls.setSelectedSynthEuclidSwings,
    setProductDrumSubLaneEnabled: sequencerControls.setSelectedDrumSubLaneEnabled,
    setProductSynthSubLaneEnabled: sequencerControls.setSelectedSynthSubLaneEnabled,
    setProductDrumPitchSettings: sequencerControls.setSelectedDrumPitchSettings,
    setProductSynthPitchSettings: sequencerControls.setSelectedSynthPitchSettings,
    setProductSynthPitchBindingModes: sequencerControls.setSelectedSynthPitchBindingModes,
    setProductDrumStepOverrides: sequencerControls.setSelectedDrumStepOverrides,
    setProductSynthStepOverrides: sequencerControls.setSelectedSynthStepOverrides,
    setProductSequencerPresetHomeSnapshots: sequencerControls.setSelectedSequencerPresetHomeSnapshots,
    resetProductSynthEuclidLaneHome: sequencerControls.resetSelectedSynthEuclidLaneHome,
    captureProductSynthEuclidLaneHome: sequencerControls.captureSelectedSynthEuclidLaneHome,
    diceProductSynthEuclidLane: sequencerControls.diceSelectedSynthEuclidLane,
    resetProductDrumEuclidLaneHome: sequencerControls.resetSelectedDrumEuclidLaneHome,
    captureProductDrumEuclidLaneHome: sequencerControls.captureSelectedDrumEuclidLaneHome,
    diceProductDrumEuclidLane: sequencerControls.diceSelectedDrumEuclidLane,
  };
}
