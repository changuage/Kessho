import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CloudSharedPresetPayload } from './usePresetLibraryRuntimeSurface';
import { applyPreset, type ApplyPresetOptions } from './presetUtils';
import type { SavedPreset, SliderMode, SliderState } from './state';

type PresetEngineUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

type UseCloudSharedPresetRuntimeSurfaceOptions = {
  stateRef: MutableRefObject<SliderState>;
  setState: Dispatch<SetStateAction<SliderState>>;
  presetEngineUpdateOptions: PresetEngineUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => void;
  normalizeState: (state: SliderState) => SliderState;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => void;
  restoreEvolveConfigs: (preset: SavedPreset) => void;
};

type CloudSharedPresetRuntimeSurface = {
  cloudSharedPresetToSavedPreset: (preset: CloudSharedPresetPayload) => SavedPreset;
  applyCloudSharedPreset: (preset: SavedPreset, metadata: { name: string; author: string }) => void;
};

export function useCloudSharedPresetRuntimeSurface({
  stateRef,
  setState,
  presetEngineUpdateOptions,
  syncCoreProductAppliedPreset,
  normalizeState,
  applyDualRangesFromPreset,
  restoreEvolveConfigs,
}: UseCloudSharedPresetRuntimeSurfaceOptions): CloudSharedPresetRuntimeSurface {
  const cloudSharedPresetToSavedPreset = useCallback((preset: CloudSharedPresetPayload): SavedPreset => {
    const rawData = preset.data;
    const wrappedData = rawData !== null && typeof rawData === 'object' && Object.prototype.hasOwnProperty.call(rawData, 'state') ? (rawData as Partial<SavedPreset>) : null;
    const presetState = wrappedData?.state && typeof wrappedData.state === 'object' ? wrappedData.state : (preset.data as SliderState);

    return {
      name: preset.name,
      timestamp: new Date().toISOString(),
      state: presetState,
      dualRanges: wrappedData?.dualRanges,
      sliderModes: wrappedData?.sliderModes,
      drumEvolveConfigs: wrappedData?.drumEvolveConfigs,
      synthEvolveConfigs: wrappedData?.synthEvolveConfigs,
      drumStepOverrides: wrappedData?.drumStepOverrides,
      synthStepOverrides: wrappedData?.synthStepOverrides,
      drumClockDivs: wrappedData?.drumClockDivs,
      synthClockDivs: wrappedData?.synthClockDivs,
      drumSwings: wrappedData?.drumSwings,
      synthSwings: wrappedData?.synthSwings,
      drumLinked: wrappedData?.drumLinked,
      synthLinked: wrappedData?.synthLinked,
      drumSubLaneStates: wrappedData?.drumSubLaneStates,
      synthSubLaneStates: wrappedData?.synthSubLaneStates,
      drumPitchSettings: wrappedData?.drumPitchSettings,
      synthPitchSettings: wrappedData?.synthPitchSettings,
      synthPitchBindingModes: wrappedData?.synthPitchBindingModes,
    };
  }, []);

  const applyCloudSharedPreset = useCallback(
    (preset: SavedPreset, metadata: { name: string; author: string }) => {
      const result = applyPreset(preset, {
        currentState: stateRef.current,
        normalize: normalizeState,
        ...presetEngineUpdateOptions,
      });
      syncCoreProductAppliedPreset(result.state);
      setState(result.state);
      applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
      restoreEvolveConfigs(result.preset);
      console.log(`Loaded cloud preset: ${metadata.name} by ${metadata.author}`);
    },
    [
      applyDualRangesFromPreset,
      normalizeState,
      presetEngineUpdateOptions,
      restoreEvolveConfigs,
      setState,
      stateRef,
      syncCoreProductAppliedPreset,
    ],
  );

  return {
    cloudSharedPresetToSavedPreset,
    applyCloudSharedPreset,
  };
}
