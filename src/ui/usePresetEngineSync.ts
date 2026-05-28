import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import type { ApplyPresetOptions } from './presetUtils';
import type { SliderState } from './state';

type PresetEngineUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

type ScheduleAudioEngineParamUpdate = (
  nextState: SliderState,
  options?: {
    immediate?: boolean;
    reason?: ProductSnapshotPatchReason;
    forceFullSnapshot?: boolean;
  },
) => void;

type UsePresetEngineSyncOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
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

export function usePresetEngineSync({
  audioEngineRuntimeMode,
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

  const presetEngineUpdateOptions = useMemo((): PresetEngineUpdateOptions => ({
    updateEngine: audioEngineRuntimeMode !== 'core-product',
    resetCofDrift: audioEngineRuntimeMode !== 'core-product',
    onUpdateEngine: (
      nextState: SliderState,
      metadata: { presetId: string; presetName: string },
    ) => {
      if (audioEngineRuntimeMode === 'core-product') return;
      updateSelectedReferenceParams(nextState, metadata);
    },
    onResetCofDrift: () => {
      if (audioEngineRuntimeMode === 'core-product') return;
      resetSelectedCofDrift();
    },
  }), [audioEngineRuntimeMode, resetSelectedCofDrift, updateSelectedReferenceParams]);

  const syncCoreProductAppliedPreset = useCallback((nextState: SliderState): void => {
    if (audioEngineRuntimeMode !== 'core-product') return;
    immediatelyAppliedAudioEngineStateRef.current = nextState;
    scheduleAudioEngineParamUpdate(nextState, {
      immediate: true,
      reason: 'preset-load',
      forceFullSnapshot: true,
    });
    resetSelectedCofDrift();
  }, [audioEngineRuntimeMode, resetSelectedCofDrift, scheduleAudioEngineParamUpdate]);

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
