import { useSelectedAudioEngineSequencerControls } from './useSelectedAudioEngineSequencerControls';

type ProductRuntimeSequencerControlsMode = Parameters<typeof useSelectedAudioEngineSequencerControls>[0];
type SelectedRuntimeSequencerControls = ReturnType<typeof useSelectedAudioEngineSequencerControls>;

type ProductRuntimeSequencerControls = {
  setProductDrumEuclidEvolveConfigs: SelectedRuntimeSequencerControls['setSelectedDrumEuclidEvolveConfigs'];
  setProductSynthEuclidEvolveConfigs: SelectedRuntimeSequencerControls['setSelectedSynthEuclidEvolveConfigs'];
  setProductDrumEuclidClockDivs: SelectedRuntimeSequencerControls['setSelectedDrumEuclidClockDivs'];
  setProductSynthEuclidClockDivs: SelectedRuntimeSequencerControls['setSelectedSynthEuclidClockDivs'];
  setProductDrumEuclidSwings: SelectedRuntimeSequencerControls['setSelectedDrumEuclidSwings'];
  setProductSynthEuclidSwings: SelectedRuntimeSequencerControls['setSelectedSynthEuclidSwings'];
  setProductDrumSubLaneEnabled: SelectedRuntimeSequencerControls['setSelectedDrumSubLaneEnabled'];
  setProductSynthSubLaneEnabled: SelectedRuntimeSequencerControls['setSelectedSynthSubLaneEnabled'];
  setProductSynthPitchSettings: SelectedRuntimeSequencerControls['setSelectedSynthPitchSettings'];
  setProductSynthPitchBindingModes: SelectedRuntimeSequencerControls['setSelectedSynthPitchBindingModes'];
  setProductDrumStepOverrides: SelectedRuntimeSequencerControls['setSelectedDrumStepOverrides'];
  setProductSynthStepOverrides: SelectedRuntimeSequencerControls['setSelectedSynthStepOverrides'];
  setProductSequencerPresetHomeSnapshots: SelectedRuntimeSequencerControls['setSelectedSequencerPresetHomeSnapshots'];
  resetProductSynthEuclidLaneHome: SelectedRuntimeSequencerControls['resetSelectedSynthEuclidLaneHome'];
  captureProductSynthEuclidLaneHome: SelectedRuntimeSequencerControls['captureSelectedSynthEuclidLaneHome'];
  diceProductSynthEuclidLane: SelectedRuntimeSequencerControls['diceSelectedSynthEuclidLane'];
  resetProductDrumEuclidLaneHome: SelectedRuntimeSequencerControls['resetSelectedDrumEuclidLaneHome'];
  captureProductDrumEuclidLaneHome: SelectedRuntimeSequencerControls['captureSelectedDrumEuclidLaneHome'];
  diceProductDrumEuclidLane: SelectedRuntimeSequencerControls['diceSelectedDrumEuclidLane'];
};

export function useProductRuntimeSequencerControls(
  audioEngineRuntimeMode: ProductRuntimeSequencerControlsMode,
): ProductRuntimeSequencerControls {
  const sequencerControls = useSelectedAudioEngineSequencerControls(audioEngineRuntimeMode);

  return {
    setProductDrumEuclidEvolveConfigs: sequencerControls.setSelectedDrumEuclidEvolveConfigs,
    setProductSynthEuclidEvolveConfigs: sequencerControls.setSelectedSynthEuclidEvolveConfigs,
    setProductDrumEuclidClockDivs: sequencerControls.setSelectedDrumEuclidClockDivs,
    setProductSynthEuclidClockDivs: sequencerControls.setSelectedSynthEuclidClockDivs,
    setProductDrumEuclidSwings: sequencerControls.setSelectedDrumEuclidSwings,
    setProductSynthEuclidSwings: sequencerControls.setSelectedSynthEuclidSwings,
    setProductDrumSubLaneEnabled: sequencerControls.setSelectedDrumSubLaneEnabled,
    setProductSynthSubLaneEnabled: sequencerControls.setSelectedSynthSubLaneEnabled,
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
