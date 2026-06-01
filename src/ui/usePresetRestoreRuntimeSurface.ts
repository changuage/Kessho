import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { DualSliderRange } from './DualSlider';
import { replaceRuntimeWalkPositionSnapshot } from './runtimeWalkPositionSync';
import type { SliderMode, SliderState } from './state';
import { usePresetSequencerRestore } from './usePresetSequencerRestore';

type DualSliderState = Partial<Record<keyof SliderState, DualSliderRange>>;

type PresetSequencerRestoreOptions = Parameters<typeof usePresetSequencerRestore>[0];
type SelectedPresetSequencerSetterKey =
  | 'setSelectedDrumEuclidClockDivs'
  | 'setSelectedDrumEuclidEvolveConfigs'
  | 'setSelectedDrumEuclidSwings'
  | 'setSelectedDrumPitchSettings'
  | 'setSelectedDrumStepOverrides'
  | 'setSelectedDrumSubLaneEnabled'
  | 'setSelectedSequencerPresetHomeSnapshots'
  | 'setSelectedSynthEuclidClockDivs'
  | 'setSelectedSynthEuclidEvolveConfigs'
  | 'setSelectedSynthEuclidSwings'
  | 'setSelectedSynthPitchBindingModes'
  | 'setSelectedSynthPitchSettings'
  | 'setSelectedSynthStepOverrides'
  | 'setSelectedSynthSubLaneEnabled';
type ProductPresetSequencerRestoreOptions = Omit<PresetSequencerRestoreOptions, SelectedPresetSequencerSetterKey> & {
  setProductDrumEuclidClockDivs: PresetSequencerRestoreOptions['setSelectedDrumEuclidClockDivs'];
  setProductDrumEuclidEvolveConfigs: PresetSequencerRestoreOptions['setSelectedDrumEuclidEvolveConfigs'];
  setProductDrumEuclidSwings: PresetSequencerRestoreOptions['setSelectedDrumEuclidSwings'];
  setProductDrumPitchSettings: PresetSequencerRestoreOptions['setSelectedDrumPitchSettings'];
  setProductDrumStepOverrides: PresetSequencerRestoreOptions['setSelectedDrumStepOverrides'];
  setProductDrumSubLaneEnabled: PresetSequencerRestoreOptions['setSelectedDrumSubLaneEnabled'];
  setProductSequencerPresetHomeSnapshots: PresetSequencerRestoreOptions['setSelectedSequencerPresetHomeSnapshots'];
  setProductSynthEuclidClockDivs: PresetSequencerRestoreOptions['setSelectedSynthEuclidClockDivs'];
  setProductSynthEuclidEvolveConfigs: PresetSequencerRestoreOptions['setSelectedSynthEuclidEvolveConfigs'];
  setProductSynthEuclidSwings: PresetSequencerRestoreOptions['setSelectedSynthEuclidSwings'];
  setProductSynthPitchBindingModes: PresetSequencerRestoreOptions['setSelectedSynthPitchBindingModes'];
  setProductSynthPitchSettings: PresetSequencerRestoreOptions['setSelectedSynthPitchSettings'];
  setProductSynthStepOverrides: PresetSequencerRestoreOptions['setSelectedSynthStepOverrides'];
  setProductSynthSubLaneEnabled: PresetSequencerRestoreOptions['setSelectedSynthSubLaneEnabled'];
};

type PresetRestoreRuntimeSurfaceOptions = ProductPresetSequencerRestoreOptions & {
  normalizeDualSliderMode: (key: string, mode?: SliderMode) => SliderMode | undefined;
  setDualSliderRanges: Dispatch<SetStateAction<DualSliderState>>;
  setSliderModes: Dispatch<SetStateAction<Record<string, SliderMode>>>;
};

export function usePresetRestoreRuntimeSurface({
  normalizeDualSliderMode,
  setDualSliderRanges,
  setSliderModes,
  setProductDrumEuclidClockDivs,
  setProductDrumEuclidEvolveConfigs,
  setProductDrumEuclidSwings,
  setProductDrumPitchSettings,
  setProductDrumStepOverrides,
  setProductDrumSubLaneEnabled,
  setProductSequencerPresetHomeSnapshots,
  setProductSynthEuclidClockDivs,
  setProductSynthEuclidEvolveConfigs,
  setProductSynthEuclidSwings,
  setProductSynthPitchBindingModes,
  setProductSynthPitchSettings,
  setProductSynthStepOverrides,
  setProductSynthSubLaneEnabled,
  ...sequencerRestoreOptions
}: PresetRestoreRuntimeSurfaceOptions) {
  const restoreEvolveConfigs = usePresetSequencerRestore({
    ...sequencerRestoreOptions,
    setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs: setProductDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings: setProductDrumEuclidSwings,
    setSelectedDrumPitchSettings: setProductDrumPitchSettings,
    setSelectedDrumStepOverrides: setProductDrumStepOverrides,
    setSelectedDrumSubLaneEnabled: setProductDrumSubLaneEnabled,
    setSelectedSequencerPresetHomeSnapshots: setProductSequencerPresetHomeSnapshots,
    setSelectedSynthEuclidClockDivs: setProductSynthEuclidClockDivs,
    setSelectedSynthEuclidEvolveConfigs: setProductSynthEuclidEvolveConfigs,
    setSelectedSynthEuclidSwings: setProductSynthEuclidSwings,
    setSelectedSynthPitchBindingModes: setProductSynthPitchBindingModes,
    setSelectedSynthPitchSettings: setProductSynthPitchSettings,
    setSelectedSynthStepOverrides: setProductSynthStepOverrides,
    setSelectedSynthSubLaneEnabled: setProductSynthSubLaneEnabled,
  });

  const applyDualRangesFromPreset = useCallback((dualRanges?: Record<string, { min: number; max: number }>, presetSliderModes?: Record<string, SliderMode>) => {
    if (dualRanges && Object.keys(dualRanges).length > 0) {
      const newSliderModes: Record<string, SliderMode> = {};
      const newDualRanges: DualSliderState = {};
      const newWalkPositions: Record<string, number> = {};

      Object.entries(dualRanges).forEach(([key, range]) => {
        const paramKey = key as keyof SliderState;
        const mode = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
        newSliderModes[key] = mode;
        newDualRanges[paramKey] = range;
        if (mode === 'walk') {
          newWalkPositions[key] = 0.5;
        }
      });

      setSliderModes(newSliderModes);
      setDualSliderRanges(newDualRanges);
      replaceRuntimeWalkPositionSnapshot(newWalkPositions);
      return;
    }

    setSliderModes({});
    setDualSliderRanges({});
    replaceRuntimeWalkPositionSnapshot({});
  }, [
    normalizeDualSliderMode,
    setDualSliderRanges,
    setSliderModes,
  ]);

  return {
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
  };
}
