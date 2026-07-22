import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { isAtEndpoint0 } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import { applyPreset, type ApplyPresetOptions } from './presetUtils';
import type { SavedPreset, SliderMode, SliderState } from './state';

type PresetEngineUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

type LoadPresetOptions = {
  forceApply?: boolean;
  morphPositionOverride?: number;
  skipFade?: boolean;
  skipJourneyOverridePrompt?: boolean;
};

type UseSavedPresetLoadRuntimeSurfaceOptions<TPreset extends SavedPreset> = {
  state: SliderState;
  sliderModes: Record<string, SliderMode>;
  dualSliderRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  morphPresetB: TPreset | null;
  morphPosition: number;
  snowflakeActivated: boolean;
  setSnowflakeActivated: Dispatch<SetStateAction<boolean>>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  lastAppliedPresetLoadRef: MutableRefObject<{
    preset: TPreset;
    state: SliderState;
  } | null>;
  morphCapturedStateRef: MutableRefObject<SliderState | null>;
  morphCapturedDualRangesRef: MutableRefObject<Record<string, { min: number; max: number }> | null>;
  morphCapturedSliderModesRef: MutableRefObject<Record<string, SliderMode> | null>;
  setMorphPresetA: Dispatch<SetStateAction<TPreset | null>>;
  setMorphSlotAName: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  resolveSavedPresetForLoad: (preset: TPreset) => Promise<TPreset | null>;
  fadeOutAndStopForPresetLoad: () => Promise<void>;
  confirmOverrideArmedJourneyForStatePreset: (presetName: string) => Promise<boolean>;
  checkPresetCompatibility: (preset: TPreset) => string[];
  presetEngineUpdateOptions: PresetEngineUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => void;
  skipNextPresetLoadEngineSync: () => void;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => void;
  restoreEvolveConfigs: (preset: TPreset) => void;
  onPresetPoolLoad?: (preset: TPreset) => void;
  onRoutingMuteGroupsLoad?: (state: SavedPreset['routingMuteGroups']) => void;
};

type SavedPresetLoadRuntimeSurface<TPreset extends SavedPreset> = {
  handleLoadPresetFromList: (preset: TPreset, options?: LoadPresetOptions) => Promise<boolean>;
};

export function useSavedPresetLoadRuntimeSurface<TPreset extends SavedPreset>({
  state,
  sliderModes,
  dualSliderRanges,
  morphPresetB,
  morphPosition,
  snowflakeActivated,
  setSnowflakeActivated,
  hasLoadedPresetRef,
  lastAppliedPresetLoadRef,
  morphCapturedStateRef,
  morphCapturedDualRangesRef,
  morphCapturedSliderModesRef,
  setMorphPresetA,
  setMorphSlotAName,
  setState,
  setStatePresetName,
  resolveSavedPresetForLoad,
  fadeOutAndStopForPresetLoad,
  confirmOverrideArmedJourneyForStatePreset,
  checkPresetCompatibility,
  presetEngineUpdateOptions,
  syncCoreProductAppliedPreset,
  skipNextPresetLoadEngineSync,
  applyDualRangesFromPreset,
  restoreEvolveConfigs,
  onPresetPoolLoad,
  onRoutingMuteGroupsLoad,
}: UseSavedPresetLoadRuntimeSurfaceOptions<TPreset>): SavedPresetLoadRuntimeSurface<TPreset> {
  const captureCurrentMorphBasis = useCallback((): void => {
    morphCapturedStateRef.current = { ...state };
    const currentDualRanges: Record<string, { min: number; max: number }> = {};
    Object.keys(sliderModes).forEach((key) => {
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        currentDualRanges[key] = { min: range.min, max: range.max };
      }
    });
    morphCapturedDualRangesRef.current = currentDualRanges;
    morphCapturedSliderModesRef.current = { ...sliderModes };
  }, [
    dualSliderRanges,
    morphCapturedDualRangesRef,
    morphCapturedSliderModesRef,
    morphCapturedStateRef,
    sliderModes,
    state,
  ]);

  const warnAboutPresetCompatibility = useCallback((preset: TPreset): void => {
    const warnings = checkPresetCompatibility(preset);
    if (warnings.length === 0) return;
    console.warn('[Preset Compatibility]', warnings);
    setTimeout(() => {
      alert(`⚠️ Preset Compatibility Notice:\n\n${warnings.join('\n')}`);
    }, 100);
  }, [checkPresetCompatibility]);

  const handleLoadPresetFromList = useCallback(
    async (preset: TPreset, options?: LoadPresetOptions): Promise<boolean> => {
      if (!options?.skipJourneyOverridePrompt && !(await confirmOverrideArmedJourneyForStatePreset(preset.name))) {
        return false;
      }

      if (!options?.skipFade) {
        await fadeOutAndStopForPresetLoad();
      }

      lastAppliedPresetLoadRef.current = null;
      const resolvedPreset = await resolveSavedPresetForLoad(preset);
      if (!resolvedPreset) return false;

      if (!snowflakeActivated) setSnowflakeActivated(true);
      hasLoadedPresetRef.current = true;

      captureCurrentMorphBasis();

      setMorphPresetA(resolvedPreset);
      setMorphSlotAName(resolvedPreset.name);
      warnAboutPresetCompatibility(resolvedPreset);

      const effectiveMorphPosition = options?.morphPositionOverride ?? morphPosition;
      const atEndpoint0 = isAtEndpoint0(effectiveMorphPosition, true);
      const shouldApplyPresetA = options?.forceApply || atEndpoint0 || !morphPresetB;

      if (shouldApplyPresetA) {
        const result = applyPreset(resolvedPreset, {
          loadMode: 'exact-as-saved',
          currentState: state,
          normalize: (current) => current,
          ...presetEngineUpdateOptions,
          updateEngine: false,
          resetCofDrift: false,
        });
        syncCoreProductAppliedPreset(result.state);
        skipNextPresetLoadEngineSync();
        setMorphPresetA(result.preset as TPreset);
        lastAppliedPresetLoadRef.current = {
          preset: result.preset as TPreset,
          state: result.state,
        };
        setState(result.state);
        setStatePresetName(resolvedPreset.name);
        onRoutingMuteGroupsLoad?.(result.preset.routingMuteGroups);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        restoreEvolveConfigs(result.preset as TPreset);
        onPresetPoolLoad?.(result.preset as TPreset);
      }

      return true;
    },
    [
      applyDualRangesFromPreset,
      captureCurrentMorphBasis,
      confirmOverrideArmedJourneyForStatePreset,
      fadeOutAndStopForPresetLoad,
      hasLoadedPresetRef,
      lastAppliedPresetLoadRef,
      morphPosition,
      morphPresetB,
      onPresetPoolLoad,
      presetEngineUpdateOptions,
      resolveSavedPresetForLoad,
      restoreEvolveConfigs,
      setMorphPresetA,
      setMorphSlotAName,
      setSnowflakeActivated,
      setState,
      setStatePresetName,
      syncCoreProductAppliedPreset,
      skipNextPresetLoadEngineSync,
      snowflakeActivated,
      state,
      onRoutingMuteGroupsLoad,
      warnAboutPresetCompatibility,
    ],
  );

  return { handleLoadPresetFromList };
}
