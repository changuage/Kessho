import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { extractPresetVersionMetadata } from '../presets/presetUtils';
import type { PresetEntry } from '../presets/types';
import { isAtEndpoint0, isAtEndpoint1 } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import { applyPreset, type ApplyPresetOptions } from './presetUtils';
import { migratePreset, type SavedPreset, type SliderMode, type SliderState } from './state';
import { VISUALIZER_PRESET_SCOPE } from './visualizer/visualizerPresetStore';

type PresetEngineUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

type UseMorphSlotLoadRuntimeSurfaceOptions<TPreset extends SavedPreset> = {
  morphPresetA: TPreset | null;
  morphPresetB: TPreset | null;
  morphPosition: number;
  state: SliderState;
  sliderModes: Record<string, SliderMode>;
  dualSliderRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  morphCapturedStateRef: MutableRefObject<SliderState | null>;
  morphCapturedDualRangesRef: MutableRefObject<Record<string, { min: number; max: number }> | null>;
  morphCapturedSliderModesRef: MutableRefObject<Record<string, SliderMode> | null>;
  setMorphPresetA: Dispatch<SetStateAction<TPreset | null>>;
  setMorphPresetB: Dispatch<SetStateAction<TPreset | null>>;
  setMorphSlotAName: Dispatch<SetStateAction<string>>;
  setMorphSlotBName: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  setVisualizerPresetName: Dispatch<SetStateAction<string>>;
  setLinkedVisualizerPresetRequest: Dispatch<SetStateAction<{ name: string; nonce: number } | null>>;
  presetEngineUpdateOptions: PresetEngineUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => void;
  normalizeState: (state: SliderState) => SliderState;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => void;
  restoreEvolveConfigs: (preset: SavedPreset) => void;
  confirmOverrideArmedJourneyForStatePreset: (presetName: string) => Promise<boolean>;
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
  state,
  sliderModes,
  dualSliderRanges,
  hasLoadedPresetRef,
  morphCapturedStateRef,
  morphCapturedDualRangesRef,
  morphCapturedSliderModesRef,
  setMorphPresetA,
  setMorphPresetB,
  setMorphSlotAName,
  setMorphSlotBName,
  setState,
  setStatePresetName,
  setVisualizerPresetName,
  setLinkedVisualizerPresetRequest,
  presetEngineUpdateOptions,
  syncCoreProductAppliedPreset,
  normalizeState,
  applyDualRangesFromPreset,
  restoreEvolveConfigs,
  confirmOverrideArmedJourneyForStatePreset,
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
      if (atEndpoint0 || !morphPresetB) {
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
      }
      return true;
    },
    [
      applyDualRangesFromPreset,
      applyLinkedVisualizerPreset,
      captureCurrentMorphBasis,
      confirmOverrideArmedJourneyForStatePreset,
      hasLoadedPresetRef,
      morphPosition,
      morphPresetB,
      normalizeState,
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
      if (atEndpoint1 || !morphPresetA) {
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
      }
      return true;
    },
    [
      applyDualRangesFromPreset,
      applyLinkedVisualizerPreset,
      captureCurrentMorphBasis,
      confirmOverrideArmedJourneyForStatePreset,
      hasLoadedPresetRef,
      morphPosition,
      morphPresetA,
      normalizeState,
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
