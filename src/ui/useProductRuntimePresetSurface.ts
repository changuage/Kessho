import { useSelectedAudioEnginePresetRuntimeSurface } from './useSelectedAudioEnginePresetRuntimeSurface';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import type { ApplyPresetOptions } from './presetUtils';
import type { SliderState } from './state';

export type ProductRuntimeParamUpdateOptions = {
  immediate?: boolean;
  reason?: ProductSnapshotPatchReason;
  forceFullSnapshot?: boolean;
  triggerCritical?: boolean;
};

type ProductRuntimePresetUpdateOptions = Pick<
  ApplyPresetOptions,
  'updateEngine' | 'resetCofDrift' | 'onUpdateEngine' | 'onResetCofDrift'
>;

export type ProductRuntimePresetSurfaceOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  resetProductCofDrift: () => void;
  updateSelectedReferenceParams: (
    nextState: SliderState,
    metadata: { presetId: string; presetName: string },
  ) => void;
};

export type ProductRuntimePresetSurface = {
  scheduleProductRuntimeParamUpdate: (
    nextState: SliderState,
    options?: ProductRuntimeParamUpdateOptions,
  ) => void;
  presetProductRuntimeUpdateOptions: ProductRuntimePresetUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => void;
  syncScheduledProductRuntimeState: (nextState: SliderState) => void;
  skipNextPresetLoadEngineSync: () => void;
};

export function useProductRuntimePresetSurface({
  productRuntimeMode,
  resetProductCofDrift,
  ...options
}: ProductRuntimePresetSurfaceOptions): ProductRuntimePresetSurface {
  // TODO(product-runtime-compat-10B): keep selected-audio-engine preset sync hidden behind this
  // product runtime facade until preset/session orchestration is fully product-owned.
  const selectedPresetSurface = useSelectedAudioEnginePresetRuntimeSurface({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
    resetSelectedCofDrift: resetProductCofDrift,
  });

  return {
    scheduleProductRuntimeParamUpdate: selectedPresetSurface.scheduleAudioEngineParamUpdate,
    presetProductRuntimeUpdateOptions: selectedPresetSurface.presetEngineUpdateOptions,
    syncCoreProductAppliedPreset: selectedPresetSurface.syncCoreProductAppliedPreset,
    syncScheduledProductRuntimeState: selectedPresetSurface.syncScheduledAudioEngineState,
    skipNextPresetLoadEngineSync: selectedPresetSurface.skipNextPresetLoadEngineSync,
  };
}
