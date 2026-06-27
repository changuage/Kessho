import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { applyPreset } from './presetUtils';
import type { SavedPreset, SliderMode, SliderState } from './state';

type AutoStartPresetSource = 'cloud' | 'device-local' | 'bundled';

type PlaybackStartPreset = SavedPreset;

type SelectedAudioEnginePlaybackStartStateOptions = {
  snowflakeActivated: boolean;
  setSnowflakeActivated: Dispatch<SetStateAction<boolean>>;
  stateRef: MutableRefObject<SliderState>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  hasUserInteractedRef: MutableRefObject<boolean>;
  resolveDefaultAutoStartPreset: () => Promise<{
    preset: PlaybackStartPreset | null;
    source: AutoStartPresetSource | null;
  }>;
  normalizePresetForWeb: (state: SliderState) => SliderState;
  setState: Dispatch<SetStateAction<SliderState>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  setMorphPresetA: (preset: PlaybackStartPreset) => void;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => void;
  restoreEvolveConfigs: (preset: PlaybackStartPreset) => void;
  onRoutingMuteGroupsLoad?: (state: SavedPreset['routingMuteGroups']) => void;
};

export function useSelectedAudioEnginePlaybackStartState({
  snowflakeActivated,
  setSnowflakeActivated,
  stateRef,
  hasLoadedPresetRef,
  hasUserInteractedRef,
  resolveDefaultAutoStartPreset,
  normalizePresetForWeb,
  setState,
  setStatePresetName,
  setMorphPresetA,
  applyDualRangesFromPreset,
  restoreEvolveConfigs,
  onRoutingMuteGroupsLoad,
}: SelectedAudioEnginePlaybackStartStateOptions): (requestedState?: SliderState) => Promise<SliderState> {
  return useCallback(async (requestedState?: SliderState): Promise<SliderState> => {
    if (!snowflakeActivated) setSnowflakeActivated(true);

    let stateToStart = requestedState ?? stateRef.current;
    if (!hasLoadedPresetRef.current && !hasUserInteractedRef.current) {
      const { preset: defaultPreset, source: defaultPresetSource } = await resolveDefaultAutoStartPreset();
      if (defaultPreset) {
        console.log(`[App] Auto-loading default preset: ${defaultPreset.name}${defaultPresetSource ? ` (${defaultPresetSource})` : ''}`);
        hasLoadedPresetRef.current = true;
        const result = applyPreset(defaultPreset, {
          currentState: stateToStart,
          updateEngine: false,
          resetCofDrift: false,
          normalize: normalizePresetForWeb,
        });
        setState(result.state);
        setStatePresetName(defaultPreset.name);
        setMorphPresetA(result.preset);
        stateToStart = result.state;
        onRoutingMuteGroupsLoad?.(result.preset.routingMuteGroups);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        restoreEvolveConfigs(result.preset);
      }
    }

    return stateToStart;
  }, [
    applyDualRangesFromPreset,
    hasLoadedPresetRef,
    hasUserInteractedRef,
    normalizePresetForWeb,
    resolveDefaultAutoStartPreset,
    restoreEvolveConfigs,
    setMorphPresetA,
    setSnowflakeActivated,
    setState,
    setStatePresetName,
    snowflakeActivated,
    stateRef,
    onRoutingMuteGroupsLoad,
  ]);
}
