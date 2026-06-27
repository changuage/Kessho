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
  state: SliderState;
  dawOutputRouting: DawOutputRoutingConfig;
  dawOutputDevice: DawOutputDeviceSelection;
}

export function useProductDawOutputSync({
  state,
  dawOutputRouting,
  dawOutputDevice,
}: ProductDawOutputSyncOptions): void {
  const activeDawOutputSources = useMemo(
    () => getActiveDawOutputSourceIds(state) as DawOutputSourceId[],
    [
      state.padEnabled,
      state.pad2Enabled,
      state.leadEnabled,
      state.lead2Enabled,
      state.pianoEnabled,
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
    productEngine.setDawOutputRouting(filterDawOutputRoutingConfigForSources(config, activeDawOutputSources));
  }, [activeDawOutputSources, dawOutputRouting]);

  useEffect(() => {
    const selection = sanitizeDawOutputDeviceSelection(dawOutputDevice);
    saveDawOutputDeviceSelection(selection);
    void productEngine.setDawOutputDeviceId(selection.deviceId || null).catch((error: unknown) => {
      console.warn('DAW output device selection failed:', error);
    });
  }, [dawOutputDevice]);
}
