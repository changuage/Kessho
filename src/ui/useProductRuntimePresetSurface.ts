import { useCallback, useRef } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import type { ProductRuntimeReferenceAdapterSurface } from './productRuntimeConstruction';
import type { ApplyPresetOptions } from './presetUtils';
import type { SliderState } from './state';
import { useAudioEngineParamSync } from './useAudioEngineParamSync';
import { usePresetEngineSync } from './usePresetEngineSync';

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
  productRuntimeCore: boolean;
  productRuntimeReferenceAdapter: ProductRuntimeReferenceAdapterSurface;
  resetProductCofDrift: () => void;
};

export type ProductRuntimePresetSurface = {
  scheduleProductRuntimeParamUpdate: (
    nextState: SliderState,
    options?: ProductRuntimeParamUpdateOptions,
  ) => void;
  commitProductRuntimeParamUpdate: (
    nextState: SliderState,
    options?: ProductRuntimeParamUpdateOptions,
  ) => Promise<void>;
  prepareMorphSceneAssets: (states: readonly Record<string, unknown>[]) => Promise<void>;
  presetProductRuntimeUpdateOptions: ProductRuntimePresetUpdateOptions;
  syncCoreProductAppliedPreset: (nextState: SliderState) => Promise<void>;
  syncScheduledProductRuntimeState: (nextState: SliderState) => void;
  skipNextPresetLoadEngineSync: () => void;
};

export function useProductRuntimePresetSurface({
  productRuntimeCore,
  productRuntimeReferenceAdapter,
  resetProductCofDrift,
}: ProductRuntimePresetSurfaceOptions): ProductRuntimePresetSurface {
  const scheduleCoreProductRuntimeParamUpdate = useAudioEngineParamSync();
  type ReferenceRuntimeAdapter = Awaited<ReturnType<ProductRuntimeReferenceAdapterSurface['load']>>;
  const referenceRuntimeAdapterPromiseRef = useRef<Promise<ReferenceRuntimeAdapter> | null>(null);
  const updateReferenceRuntimeParams = useCallback((nextState: SliderState, metadata?: unknown): void => {
    if (productRuntimeCore || !productRuntimeReferenceAdapter.available) return;
    if (!referenceRuntimeAdapterPromiseRef.current) {
      referenceRuntimeAdapterPromiseRef.current = productRuntimeReferenceAdapter.load();
    }
    void referenceRuntimeAdapterPromiseRef.current.then((referenceRuntimeAdapter) => {
      referenceRuntimeAdapter.updateParams(nextState, metadata);
    });
  }, [productRuntimeCore, productRuntimeReferenceAdapter]);
  const resetReferenceRuntimeCofDrift = useCallback((): void => {
    if (productRuntimeCore || !productRuntimeReferenceAdapter.available) return;
    if (!referenceRuntimeAdapterPromiseRef.current) {
      referenceRuntimeAdapterPromiseRef.current = productRuntimeReferenceAdapter.load();
    }
    void referenceRuntimeAdapterPromiseRef.current.then((referenceRuntimeAdapter) => {
      referenceRuntimeAdapter.resetCofDrift();
    });
  }, [productRuntimeCore, productRuntimeReferenceAdapter]);
  const commitProductRuntimeParamUpdate = useCallback((
    nextState: SliderState,
    updateOptions?: ProductRuntimeParamUpdateOptions,
  ): Promise<void> => {
    if (productRuntimeCore) {
      return scheduleCoreProductRuntimeParamUpdate(nextState, updateOptions);
    }
    updateReferenceRuntimeParams(nextState, updateOptions);
    return Promise.resolve();
  }, [productRuntimeCore, scheduleCoreProductRuntimeParamUpdate, updateReferenceRuntimeParams]);
  const scheduleProductRuntimeParamUpdate = useCallback((
    nextState: SliderState,
    updateOptions?: ProductRuntimeParamUpdateOptions,
  ): void => {
    void commitProductRuntimeParamUpdate(nextState, updateOptions).catch((error) => {
      console.warn('Product runtime parameter update failed:', error);
    });
  }, [commitProductRuntimeParamUpdate]);
  const prepareMorphSceneAssets = useCallback((states: readonly Record<string, unknown>[]): Promise<void> => {
    if (!productRuntimeCore) return Promise.resolve();
    return productEngine.prepareSceneAssets(states);
  }, [productRuntimeCore]);
  const presetEngineSurface = usePresetEngineSync({
    audioEngineProductCore: productRuntimeCore,
    scheduleAudioEngineParamUpdate: commitProductRuntimeParamUpdate,
    resetSelectedCofDrift: productRuntimeCore ? resetProductCofDrift : resetReferenceRuntimeCofDrift,
    updateSelectedReferenceParams: updateReferenceRuntimeParams,
  });

  return {
    scheduleProductRuntimeParamUpdate,
    commitProductRuntimeParamUpdate,
    prepareMorphSceneAssets,
    presetProductRuntimeUpdateOptions: presetEngineSurface.presetEngineUpdateOptions,
    syncCoreProductAppliedPreset: presetEngineSurface.syncCoreProductAppliedPreset,
    syncScheduledProductRuntimeState: presetEngineSurface.syncScheduledAudioEngineState,
    skipNextPresetLoadEngineSync: presetEngineSurface.skipNextPresetLoadEngineSync,
  };
}
