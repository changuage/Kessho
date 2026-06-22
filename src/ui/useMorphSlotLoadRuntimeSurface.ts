import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { extractPresetVersionMetadata } from '../presets/presetUtils';
import type { PresetEntry } from '../presets/types';
import { isAtEndpoint0, isAtEndpoint1, isInMidMorph } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import { applyPreset, type ApplyPresetOptions, USER_PREFERENCE_KEYS } from './presetUtils';
import { migratePreset, type SavedPreset, type SliderMode, type SliderState } from './state';
import type { ProductRuntimeParamUpdateOptions } from './useProductRuntimePresetSurface';
import { VISUALIZER_PRESET_SCOPE } from './visualizer/visualizerPresetStore';

type PresetEngineUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

type UseMorphSlotLoadRuntimeSurfaceOptions<TPreset extends SavedPreset> = {
  morphPresetA: TPreset | null;
  morphPresetB: TPreset | null;
  morphPosition: number;
  currentCofStep: number;
  state: SliderState;
  sliderModes: Record<string, SliderMode>;
  dualSliderRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  morphCapturedStateRef: MutableRefObject<SliderState | null>;
  morphCapturedDualRangesRef: MutableRefObject<Record<string, { min: number; max: number }> | null>;
  morphCapturedSliderModesRef: MutableRefObject<Record<string, SliderMode> | null>;
  morphCapturedStartRootRef: MutableRefObject<number | null>;
  morphDirectionRef: MutableRefObject<'toA' | 'toB' | null>;
  setMorphPresetA: Dispatch<SetStateAction<TPreset | null>>;
  setMorphPresetB: Dispatch<SetStateAction<TPreset | null>>;
  setMorphSlotAName: Dispatch<SetStateAction<string>>;
  setMorphSlotBName: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setSliderModes: Dispatch<SetStateAction<Record<string, SliderMode>>>;
  setDualSliderRanges: Dispatch<SetStateAction<Partial<Record<keyof SliderState, DualSliderRange>>>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  setVisualizerPresetName: Dispatch<SetStateAction<string>>;
  setLinkedVisualizerPresetRequest: Dispatch<SetStateAction<{ name: string; nonce: number } | null>>;
  presetEngineUpdateOptions: PresetEngineUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => void;
  scheduleProductRuntimeParamUpdate: (nextState: SliderState, options?: ProductRuntimeParamUpdateOptions) => void;
  lerpPresets: (
    presetA: TPreset,
    presetB: TPreset,
    t: number,
    currentCofStep?: number,
    capturedStartRoot?: number,
    direction?: 'toA' | 'toB',
  ) => {
    state: SliderState;
    dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
    dualModes: Record<string, SliderMode>;
  };
  normalizeState: (state: SliderState) => SliderState;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => void;
  restoreEvolveConfigs: (preset: SavedPreset) => void;
  confirmOverrideArmedJourneyForStatePreset: (presetName: string) => Promise<boolean>;
  onPresetPoolLoad?: (preset: TPreset) => void;
};

type MorphSlotLoadRuntimeSurface = {
  handleLoadMorphA: (entry: PresetEntry, data: Record<string, unknown>) => Promise<boolean>;
  handleLoadMorphB: (entry: PresetEntry, data: Record<string, unknown>) => Promise<boolean>;
};

function presetEntryToSavedPreset(entry: PresetEntry, data: Record<string, unknown>, normalizeState: (state: SliderState) => SliderState): SavedPreset {
  const version = entry.versions.find((v) => v.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
  return migratePreset({
    name: entry.name,
    timestamp: new Date().toISOString(),
    state: normalizeState(data as unknown as SliderState),
    tags: entry.tags,
    ...(extractPresetVersionMetadata(version) ?? {}),
  });
}

function getLinkedVisualizerPresetName(entry: PresetEntry): string {
  const version = entry.versions.find((candidate) => candidate.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
  const ref = version?.refs?.visualizer;
  return ref?.scope === VISUALIZER_PRESET_SCOPE || !ref?.scope ? (ref?.name ?? '') : '';
}

export function useMorphSlotLoadRuntimeSurface<TPreset extends SavedPreset>({
  morphPresetA,
  morphPresetB,
  morphPosition,
  currentCofStep,
  state,
  sliderModes,
  dualSliderRanges,
  hasLoadedPresetRef,
  morphCapturedStateRef,
  morphCapturedDualRangesRef,
  morphCapturedSliderModesRef,
  morphCapturedStartRootRef,
  morphDirectionRef,
  setMorphPresetA,
  setMorphPresetB,
  setMorphSlotAName,
  setMorphSlotBName,
  setState,
  setSliderModes,
  setDualSliderRanges,
  setStatePresetName,
  setVisualizerPresetName,
  setLinkedVisualizerPresetRequest,
  presetEngineUpdateOptions,
  syncCoreProductAppliedPreset,
  scheduleProductRuntimeParamUpdate,
  lerpPresets,
  normalizeState,
  applyDualRangesFromPreset,
  restoreEvolveConfigs,
  confirmOverrideArmedJourneyForStatePreset,
  onPresetPoolLoad,
}: UseMorphSlotLoadRuntimeSurfaceOptions<TPreset>): MorphSlotLoadRuntimeSurface {
  const captureCurrentMorphBasis = useCallback((): void => {
    morphCapturedStateRef.current = { ...state };
    const currentDualRanges: Record<string, { min: number; max: number }> = {};
    Object.keys(sliderModes).forEach((key) => {
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) currentDualRanges[key] = { min: range.min, max: range.max };
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

  const applyLinkedVisualizerPreset = useCallback((entry: PresetEntry): void => {
    const linkedVisualizerPreset = getLinkedVisualizerPresetName(entry);
    if (!linkedVisualizerPreset) return;
    setVisualizerPresetName(linkedVisualizerPreset);
    setLinkedVisualizerPresetRequest({
      name: linkedVisualizerPreset,
      nonce: Date.now(),
    });
  }, [setLinkedVisualizerPresetRequest, setVisualizerPresetName]);

  const mergeMorphDualRuntime = useCallback((morphResult: ReturnType<typeof lerpPresets>): void => {
    setSliderModes((prev) => {
      const next: Record<string, SliderMode> = {};
      for (const [key, mode] of Object.entries(prev)) {
        if (!(key in morphResult.dualModes)) {
          next[key] = mode;
        }
      }
      for (const [key, mode] of Object.entries(morphResult.dualModes)) {
        if (mode !== 'single') {
          next[key] = mode;
        }
      }
      return next;
    });
    setDualSliderRanges((prev) => {
      const next: typeof prev = {};
      for (const [key, range] of Object.entries(prev)) {
        if (!(key in morphResult.dualModes)) {
          next[key as keyof SliderState] = range;
        }
      }
      for (const [key, range] of Object.entries(morphResult.dualRanges)) {
        next[key as keyof SliderState] = range;
      }
      return next;
    });
  }, [setDualSliderRanges, setSliderModes]);

  const applyMidMorphSlotReplacement = useCallback((nextA: TPreset | null, nextB: TPreset | null): boolean => {
    if (!isInMidMorph(morphPosition, true)) return false;
    if (!nextA || !nextB) return false;

    const direction = morphDirectionRef.current || 'toB';
    const morphResult = lerpPresets(
      nextA,
      nextB,
      morphPosition,
      currentCofStep,
      morphCapturedStartRootRef.current ?? undefined,
      direction,
    );
    const nextState = { ...morphResult.state };
    for (const key of USER_PREFERENCE_KEYS) {
      (nextState as Record<string, unknown>)[key] = state[key];
    }

    setState(nextState);
    scheduleProductRuntimeParamUpdate(nextState, {
      immediate: true,
      reason: 'morph-control-change',
      triggerCritical: true,
    });
    mergeMorphDualRuntime(morphResult);
    return true;
  }, [
    currentCofStep,
    lerpPresets,
    mergeMorphDualRuntime,
    morphCapturedStartRootRef,
    morphDirectionRef,
    morphPosition,
    scheduleProductRuntimeParamUpdate,
    setState,
    state,
  ]);

  const handleLoadMorphA = useCallback(
    async (entry: PresetEntry, data: Record<string, unknown>): Promise<boolean> => {
      if (!(await confirmOverrideArmedJourneyForStatePreset(entry.name))) return false;
      hasLoadedPresetRef.current = true;
      const preset = presetEntryToSavedPreset(entry, data, normalizeState) as TPreset;
      setMorphSlotAName(entry.name);
      if (!morphPresetB) {
        captureCurrentMorphBasis();
      }
      setMorphPresetA(preset);
      const atEndpoint0 = isAtEndpoint0(morphPosition, true);
      const appliedMidMorph = applyMidMorphSlotReplacement(preset, morphPresetB);
      if (!appliedMidMorph && (atEndpoint0 || !morphPresetB)) {
        const result = applyPreset(preset, {
          migrate: false,
          currentState: state,
          normalize: (s) => s,
          ...presetEngineUpdateOptions,
        });
        setMorphPresetA(result.preset as TPreset);
        syncCoreProductAppliedPreset(result.state);
        setState(result.state);
        setStatePresetName(entry.name);
        applyLinkedVisualizerPreset(entry);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        restoreEvolveConfigs(result.preset);
        onPresetPoolLoad?.(result.preset as TPreset);
      }
      return true;
    },
    [
      applyMidMorphSlotReplacement,
      applyDualRangesFromPreset,
      applyLinkedVisualizerPreset,
      captureCurrentMorphBasis,
      confirmOverrideArmedJourneyForStatePreset,
      hasLoadedPresetRef,
      morphPosition,
      morphPresetB,
      normalizeState,
      onPresetPoolLoad,
      presetEngineUpdateOptions,
      restoreEvolveConfigs,
      setMorphPresetA,
      setMorphSlotAName,
      setState,
      setStatePresetName,
      state,
      syncCoreProductAppliedPreset,
    ],
  );

  const handleLoadMorphB = useCallback(
    async (entry: PresetEntry, data: Record<string, unknown>): Promise<boolean> => {
      if (!(await confirmOverrideArmedJourneyForStatePreset(entry.name))) return false;
      hasLoadedPresetRef.current = true;
      const preset = presetEntryToSavedPreset(entry, data, normalizeState) as TPreset;
      setMorphSlotBName(entry.name);
      if (!morphPresetA) {
        captureCurrentMorphBasis();
      }
      setMorphPresetB(preset);
      const atEndpoint1 = isAtEndpoint1(morphPosition, true);
      const appliedMidMorph = applyMidMorphSlotReplacement(morphPresetA, preset);
      if (!appliedMidMorph && (atEndpoint1 || !morphPresetA)) {
        const result = applyPreset(preset, {
          migrate: false,
          currentState: state,
          normalize: (s) => s,
          ...presetEngineUpdateOptions,
        });
        setMorphPresetB(result.preset as TPreset);
        syncCoreProductAppliedPreset(result.state);
        setState(result.state);
        setStatePresetName(entry.name);
        applyLinkedVisualizerPreset(entry);
        applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);
        restoreEvolveConfigs(result.preset);
        onPresetPoolLoad?.(result.preset as TPreset);
      }
      return true;
    },
    [
      applyMidMorphSlotReplacement,
      applyDualRangesFromPreset,
      applyLinkedVisualizerPreset,
      captureCurrentMorphBasis,
      confirmOverrideArmedJourneyForStatePreset,
      hasLoadedPresetRef,
      morphPosition,
      morphPresetA,
      normalizeState,
      onPresetPoolLoad,
      presetEngineUpdateOptions,
      restoreEvolveConfigs,
      setMorphPresetB,
      setMorphSlotBName,
      setState,
      setStatePresetName,
      state,
      syncCoreProductAppliedPreset,
    ],
  );

  return {
    handleLoadMorphA,
    handleLoadMorphB,
  };
}
