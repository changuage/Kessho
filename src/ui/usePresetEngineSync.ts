import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import type { ApplyPresetOptions } from './presetUtils';
import type { SliderState } from './state';

export type PresetEngineUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

export type ProductPresetSyncOptions = {
  immediate: true;
  reason: 'preset-load';
  forceFullSnapshot: true;
  triggerCritical: true;
};

type ScheduleAudioEngineParamUpdate = (
  nextState: SliderState,
  options?: {
    immediate?: boolean;
    reason?: ProductSnapshotPatchReason;
    forceFullSnapshot?: boolean;
    triggerCritical?: boolean;
  },
) => void;

type UsePresetEngineSyncOptions = {
  audioEngineProductCore: boolean;
  scheduleAudioEngineParamUpdate: ScheduleAudioEngineParamUpdate;
  resetSelectedCofDrift: () => void;
  updateSelectedReferenceParams: (
    nextState: SliderState,
    metadata: { presetId: string; presetName: string },
  ) => void;
};

type PresetEngineSyncControls = {
  presetEngineUpdateOptions: PresetEngineUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => void;
  syncScheduledAudioEngineState: (nextState: SliderState) => void;
  skipNextPresetLoadEngineSync: () => void;
};

export function createPresetEngineUpdateOptions(
  audioEngineProductCore: boolean,
  resetSelectedCofDrift: () => void,
  updateSelectedReferenceParams: (
    nextState: SliderState,
    metadata: { presetId: string; presetName: string },
  ) => void,
): PresetEngineUpdateOptions {
  return {
    updateEngine: !audioEngineProductCore,
    resetCofDrift: !audioEngineProductCore,
    onUpdateEngine: (
      nextState: SliderState,
      metadata: { presetId: string; presetName: string },
    ) => {
      if (audioEngineProductCore) return;
      updateSelectedReferenceParams(nextState, metadata);
    },
    onResetCofDrift: () => {
      if (audioEngineProductCore) return;
      resetSelectedCofDrift();
    },
  };
}

export function createProductPresetSyncOptions(): ProductPresetSyncOptions {
  return {
    immediate: true,
    reason: 'preset-load',
    forceFullSnapshot: true,
    triggerCritical: true,
  };
}

export function usePresetEngineSync({
  audioEngineProductCore,
  scheduleAudioEngineParamUpdate,
  resetSelectedCofDrift,
  updateSelectedReferenceParams,
}: UsePresetEngineSyncOptions): PresetEngineSyncControls {
  const immediatelyAppliedAudioEngineStateRef = useRef<SliderState | null>(null);
  const skipNextPresetLoadEngineSyncRef = useRef(false);

  useEffect(() => () => {
    immediatelyAppliedAudioEngineStateRef.current = null;
    skipNextPresetLoadEngineSyncRef.current = false;
  }, []);

  const presetEngineUpdateOptions = useMemo(
    () => createPresetEngineUpdateOptions(
      audioEngineProductCore,
      resetSelectedCofDrift,
      updateSelectedReferenceParams,
    ),
    [audioEngineProductCore, resetSelectedCofDrift, updateSelectedReferenceParams],
  );

  const syncCoreProductAppliedPreset = useCallback((nextState: SliderState): void => {
    if (!audioEngineProductCore) return;
    immediatelyAppliedAudioEngineStateRef.current = nextState;
    scheduleAudioEngineParamUpdate(nextState, createProductPresetSyncOptions());
  }, [audioEngineProductCore, scheduleAudioEngineParamUpdate]);

  const syncScheduledAudioEngineState = useCallback((nextState: SliderState): void => {
    if (immediatelyAppliedAudioEngineStateRef.current === nextState) {
      immediatelyAppliedAudioEngineStateRef.current = null;
      return;
    }
    if (skipNextPresetLoadEngineSyncRef.current) {
      skipNextPresetLoadEngineSyncRef.current = false;
      return;
    }
    scheduleAudioEngineParamUpdate(nextState);
  }, [scheduleAudioEngineParamUpdate]);

  const skipNextPresetLoadEngineSync = useCallback((): void => {
    skipNextPresetLoadEngineSyncRef.current = true;
  }, []);

  return {
    presetEngineUpdateOptions,
    syncCoreProductAppliedPreset,
    syncScheduledAudioEngineState,
    skipNextPresetLoadEngineSync,
  };
}
