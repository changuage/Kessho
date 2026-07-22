import { useEffect, useMemo } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import {
  filterDawOutputRoutingConfigForSources,
  saveDawOutputDeviceSelection,
  saveDawOutputRoutingConfig,
  sanitizeDawOutputDeviceSelection,
  sanitizeDawOutputRoutingConfig,
  type DawOutputDeviceSelection,
  type DawOutputRoutingConfig,
  type DawOutputSourceId,
} from '../audio/dawOutputRouting';
import { getActiveDawOutputSourceIds } from '../ui/routing';
import type { SliderState } from '../ui/state';

interface ProductDawOutputSyncOptions {
  productRuntimeCore: boolean;
  state: SliderState;
  dawOutputRouting: DawOutputRoutingConfig;
  dawOutputDevice: DawOutputDeviceSelection;
}

export function useProductDawOutputSync({
  productRuntimeCore,
  state,
  dawOutputRouting,
  dawOutputDevice,
}: ProductDawOutputSyncOptions): void {
  const productRuntimeActive = productRuntimeCore;
  const activeDawOutputSources = useMemo(
    () => productRuntimeActive ? getActiveDawOutputSourceIds(state) as DawOutputSourceId[] : [],
    [
      productRuntimeActive,
      state.padEnabled,
      state.pad2Enabled,
      state.leadEnabled,
      state.lead2Enabled,
      state.sample1Enabled,
      state.sample2Enabled,
      state.drumEnabled,
      state.granularEnabled,
      state.oceanSampleEnabled,
      state.waterEnabled,
      state.insectsEnabled,
      state.insects2Enabled,
      state.birdsEnabled,
      state.birds2Enabled,
      state.frogsEnabled,
      state.delayAEnabled,
      state.granularDelayEnabled,
      state.degradeEnabled,
      state.driftEnabled,
      state.erosionEnabled,
      state.dynamicsSaturationEnabled,
      state.degradeReverbSend,
      state.reverbDegradeSend,
      state.reverbEnabled,
      state.dynamicsEnabled,
    ],
  );

  useEffect(() => {
    const config = sanitizeDawOutputRoutingConfig(dawOutputRouting);
    saveDawOutputRoutingConfig(config);
    if (!productRuntimeActive) return;
    productEngine.setDawOutputRouting(filterDawOutputRoutingConfigForSources(config, activeDawOutputSources));
  }, [activeDawOutputSources, dawOutputRouting, productRuntimeActive]);

  useEffect(() => {
    const selection = sanitizeDawOutputDeviceSelection(dawOutputDevice);
    saveDawOutputDeviceSelection(selection);
    if (!productRuntimeActive) return;
    void productEngine.setDawOutputDeviceId(selection.deviceId || null).catch((error: unknown) => {
      console.warn('DAW output device selection failed:', error);
    });
  }, [dawOutputDevice, productRuntimeActive]);
}
