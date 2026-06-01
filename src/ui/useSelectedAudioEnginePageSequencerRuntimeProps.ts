import { useMemo } from 'react';
import type { SelectedAudioEnginePageRuntimeBridgeOptions } from './useSelectedAudioEnginePageRuntimeBridges';

export type SelectedAudioEnginePageSequencerRuntimeProps = Pick<
  SelectedAudioEnginePageRuntimeBridgeOptions,
  | 'captureSelectedSynthEuclidLaneHome'
  | 'captureSelectedDrumEuclidLaneHome'
  | 'diceSelectedSynthEuclidLane'
  | 'diceSelectedDrumEuclidLane'
  | 'drumClockDivsRef'
  | 'drumEvolveConfigsRef'
  | 'drumLinkedRef'
  | 'drumPitchSettingsRef'
  | 'drumStepOverridesRef'
  | 'drumSubLaneStatesRef'
  | 'drumSwingsRef'
  | 'resetSelectedDrumEuclidLaneHome'
  | 'resetSelectedSynthEuclidLaneHome'
  | 'setSelectedDrumEuclidClockDivs'
  | 'setSelectedDrumEuclidEvolveConfigs'
  | 'setSelectedDrumEuclidSwings'
  | 'setSelectedDrumStepOverrides'
  | 'setSelectedDrumSubLaneEnabled'
  | 'setSelectedDrumPitchSettings'
  | 'setSelectedSynthEuclidClockDivs'
  | 'setSelectedSynthEuclidEvolveConfigs'
  | 'setSelectedSynthEuclidSwings'
  | 'setSelectedSynthPitchBindingModes'
  | 'setSelectedSynthPitchSettings'
  | 'setSelectedSynthStepOverrides'
  | 'setSelectedSynthSubLaneEnabled'
  | 'synthClockDivsRef'
  | 'synthEvolveConfigsRef'
  | 'synthLinkedRef'
  | 'synthPitchBindingModesRef'
  | 'synthPitchSettingsRef'
  | 'synthArpConfigsRef'
  | 'synthStepOverridesRef'
  | 'synthSubLaneStatesRef'
  | 'synthSwingsRef'
>;

export function useSelectedAudioEnginePageSequencerRuntimeProps({
  captureSelectedSynthEuclidLaneHome,
  captureSelectedDrumEuclidLaneHome,
  diceSelectedSynthEuclidLane,
  diceSelectedDrumEuclidLane,
  drumClockDivsRef,
  drumEvolveConfigsRef,
  drumLinkedRef,
  drumPitchSettingsRef,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  resetSelectedDrumEuclidLaneHome,
  resetSelectedSynthEuclidLaneHome,
  setSelectedDrumEuclidClockDivs,
  setSelectedDrumEuclidEvolveConfigs,
  setSelectedDrumEuclidSwings,
  setSelectedDrumStepOverrides,
  setSelectedDrumSubLaneEnabled,
  setSelectedDrumPitchSettings,
  setSelectedSynthEuclidClockDivs,
  setSelectedSynthEuclidEvolveConfigs,
  setSelectedSynthEuclidSwings,
  setSelectedSynthPitchBindingModes,
  setSelectedSynthPitchSettings,
  setSelectedSynthStepOverrides,
  setSelectedSynthSubLaneEnabled,
  synthClockDivsRef,
  synthEvolveConfigsRef,
  synthLinkedRef,
  synthPitchBindingModesRef,
  synthPitchSettingsRef,
  synthArpConfigsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: SelectedAudioEnginePageSequencerRuntimeProps): SelectedAudioEnginePageSequencerRuntimeProps {
  return useMemo(() => ({
    captureSelectedSynthEuclidLaneHome,
    captureSelectedDrumEuclidLaneHome,
    diceSelectedSynthEuclidLane,
    diceSelectedDrumEuclidLane,
    drumClockDivsRef,
    drumEvolveConfigsRef,
    drumLinkedRef,
    drumPitchSettingsRef,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
    resetSelectedDrumEuclidLaneHome,
    resetSelectedSynthEuclidLaneHome,
    setSelectedDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings,
    setSelectedDrumStepOverrides,
    setSelectedDrumSubLaneEnabled,
    setSelectedDrumPitchSettings,
    setSelectedSynthEuclidClockDivs,
    setSelectedSynthEuclidEvolveConfigs,
    setSelectedSynthEuclidSwings,
    setSelectedSynthPitchBindingModes,
    setSelectedSynthPitchSettings,
    setSelectedSynthStepOverrides,
    setSelectedSynthSubLaneEnabled,
    synthClockDivsRef,
    synthEvolveConfigsRef,
    synthLinkedRef,
    synthPitchBindingModesRef,
    synthPitchSettingsRef,
    synthArpConfigsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
  }), [
    captureSelectedDrumEuclidLaneHome,
    captureSelectedSynthEuclidLaneHome,
    diceSelectedDrumEuclidLane,
    diceSelectedSynthEuclidLane,
    drumClockDivsRef,
    drumEvolveConfigsRef,
    drumLinkedRef,
    drumPitchSettingsRef,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
    resetSelectedDrumEuclidLaneHome,
    resetSelectedSynthEuclidLaneHome,
    setSelectedDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings,
    setSelectedDrumStepOverrides,
    setSelectedDrumSubLaneEnabled,
    setSelectedDrumPitchSettings,
    setSelectedSynthEuclidClockDivs,
    setSelectedSynthEuclidEvolveConfigs,
    setSelectedSynthEuclidSwings,
    setSelectedSynthPitchBindingModes,
    setSelectedSynthPitchSettings,
    setSelectedSynthStepOverrides,
    setSelectedSynthSubLaneEnabled,
    synthClockDivsRef,
    synthEvolveConfigsRef,
    synthLinkedRef,
    synthPitchBindingModesRef,
    synthPitchSettingsRef,
    synthArpConfigsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
  ]);
}
