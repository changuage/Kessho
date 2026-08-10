import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { applyPreset } from './presetUtils';
import type { SavedPreset, SliderMode, SliderState } from './state';

type AutoStartPresetSource = 'cloud' | 'device-local' | 'bundled';

type PlaybackStartPreset = SavedPreset;

export type ProductRuntimePlaybackStartStateOptions = {
  snowflakeActivated: boolean;
  setSnowflakeActivated: Dispatch<SetStateAction<boolean>>;
  stateRef: MutableRefObject<SliderState>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  hasUserInteractedRef: MutableRefObject<boolean>;
  resolveDefaultAutoStartPreset: () => Promise<{
    preset: PlaybackStartPreset | null;
    source: AutoStartPresetSource | null;
  }>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  setMorphPresetA: (preset: PlaybackStartPreset) => void;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
    presetDualConfigs?: SavedPreset['dualSliderConfigs'],
  ) => void;
  restoreEvolveConfigs: (preset: PlaybackStartPreset) => void;
  onRoutingMuteGroupsLoad?: (state: SavedPreset['routingMuteGroups']) => void;
};

export function useProductRuntimePlaybackStartState(options: ProductRuntimePlaybackStartStateOptions) {
  const {
    snowflakeActivated,
    setSnowflakeActivated,
    stateRef,
    hasLoadedPresetRef,
    hasUserInteractedRef,
    resolveDefaultAutoStartPreset,
    setState,
    setStatePresetName,
    setMorphPresetA,
    applyDualRangesFromPreset,
    restoreEvolveConfigs,
    onRoutingMuteGroupsLoad,
  } = options;

  return useCallback(async (requestedState?: SliderState): Promise<SliderState> => {
    if (!snowflakeActivated) setSnowflakeActivated(true);

    let stateToStart = requestedState ?? stateRef.current;
    if (!hasLoadedPresetRef.current && !hasUserInteractedRef.current) {
      const { preset: defaultPreset, source: defaultPresetSource } = await resolveDefaultAutoStartPreset();
      if (defaultPreset) {
        console.log(`[App] Auto-loading default preset: ${defaultPreset.name}${defaultPresetSource ? ` (${defaultPresetSource})` : ''}`);
        hasLoadedPresetRef.current = true;
        const result = applyPreset(defaultPreset, {
          loadMode: 'exact-as-saved',
          currentState: stateToStart,
          updateEngine: false,
          resetCofDrift: false,
          normalize: (current) => current,
        });
        setState(result.state);
        setStatePresetName(defaultPreset.name);
        setMorphPresetA(result.preset);
        stateToStart = result.state;
        onRoutingMuteGroupsLoad?.(result.preset.routingMuteGroups);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes, result.preset.dualSliderConfigs);
        restoreEvolveConfigs(result.preset);
      }
    }

    return stateToStart;
  }, [
    applyDualRangesFromPreset,
    hasLoadedPresetRef,
    hasUserInteractedRef,
    onRoutingMuteGroupsLoad,
    resolveDefaultAutoStartPreset,
    restoreEvolveConfigs,
    setMorphPresetA,
    setSnowflakeActivated,
    setState,
    setStatePresetName,
    snowflakeActivated,
    stateRef,
  ]);
}
