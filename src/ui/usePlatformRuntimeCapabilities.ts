import { useMemo } from 'react';
import { isCapacitorNativeShell } from '../native/capacitorAudioSession';
import { isCapacitorMacShell } from '../native/capacitorMacShell';

type UsePlatformRuntimeCapabilitiesOptions = {
  cloudEnabled: boolean;
  sonicParityMode: boolean;
  localPresetStoreOverride: boolean;
};

type PlatformRuntimeCapabilities = {
  nativeShellAvailable: boolean;
  macShellAvailable: boolean;
  cloudPresetAllowed: boolean;
  usesSupabaseStatePresetLibrary: boolean;
  usesCapacitorLocalPresetLibrary: boolean;
  usesCloudBackedStatePresetLibrary: boolean;
  shouldInitializeCloudPresetStore: boolean;
};

export function usePlatformRuntimeCapabilities({
  cloudEnabled,
  sonicParityMode,
  localPresetStoreOverride,
}: UsePlatformRuntimeCapabilitiesOptions): PlatformRuntimeCapabilities {
  return useMemo(() => {
    const nativeShellAvailable = isCapacitorNativeShell();
    const macShellAvailable = isCapacitorMacShell();
    const cloudPresetAllowed = cloudEnabled && !sonicParityMode && !localPresetStoreOverride;
    const usesSupabaseStatePresetLibrary = macShellAvailable && cloudPresetAllowed;
    const usesCapacitorLocalPresetLibrary = nativeShellAvailable && !usesSupabaseStatePresetLibrary;
    const usesCloudBackedStatePresetLibrary = cloudPresetAllowed && !usesCapacitorLocalPresetLibrary;
    const shouldInitializeCloudPresetStore = cloudPresetAllowed && (!nativeShellAvailable || macShellAvailable);

    return {
      nativeShellAvailable,
      macShellAvailable,
      cloudPresetAllowed,
      usesSupabaseStatePresetLibrary,
      usesCapacitorLocalPresetLibrary,
      usesCloudBackedStatePresetLibrary,
      shouldInitializeCloudPresetStore,
    };
  }, [cloudEnabled, sonicParityMode, localPresetStoreOverride]);
}
