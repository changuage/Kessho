import { useCallback, useRef } from 'react';
import type { PresetEntry } from '../presets/types';
import { useAutoStartPresetResolver } from './useAutoStartPresetResolver';
import { useCloudPresetStoreBootstrap } from './useCloudPresetStoreBootstrap';
import { usePresetPlatformMaintenance } from './usePresetPlatformMaintenance';

type AutoStartPresetSource = 'cloud' | 'device-local' | 'bundled';

type PresetBootstrapRuntimeSurfaceOptions<TSavedPreset extends { name: string; source?: AutoStartPresetSource }> = {
  cloudEnabled: boolean;
  cloudPresetAllowed: boolean;
  defaultAutoStartPresetName: string;
  entryToSavedPreset: (entry: PresetEntry, freshness?: 'highest') => TSavedPreset | null;
  loadBundledPresetByName: (name: string) => Promise<TSavedPreset | null>;
  localPresetStoreOverride: boolean;
  savedPresets: TSavedPreset[];
  shouldInitializeCloudPresetStore: boolean;
  sonicParityMode: boolean;
  usesCapacitorLocalPresetLibrary: boolean;
  usesCloudBackedStatePresetLibrary: boolean;
};

export function usePresetBootstrapRuntimeSurface<TSavedPreset extends { name: string; source?: AutoStartPresetSource }>({
  cloudEnabled,
  cloudPresetAllowed,
  defaultAutoStartPresetName,
  entryToSavedPreset,
  loadBundledPresetByName,
  localPresetStoreOverride,
  savedPresets,
  shouldInitializeCloudPresetStore,
  sonicParityMode,
  usesCapacitorLocalPresetLibrary,
  usesCloudBackedStatePresetLibrary,
}: PresetBootstrapRuntimeSurfaceOptions<TSavedPreset>) {
  const loadCloudAutoStartPresetRef = useRef<() => Promise<TSavedPreset | null>>(async () => null);
  const loadCloudAutoStartPresetFromBootstrap = useCallback(() => loadCloudAutoStartPresetRef.current(), []);

  const { resolveDefaultAutoStartPreset, setCloudAutoStartPreset } = useAutoStartPresetResolver<TSavedPreset>({
    cloudEnabled,
    cloudPresetAllowed,
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
    defaultAutoStartPresetName,
    savedPresets,
    loadCloudAutoStartPreset: loadCloudAutoStartPresetFromBootstrap,
    loadBundledPresetByName,
  });

  const {
    cloudPresetStoreReadyPromiseRef,
    loadCloudAutoStartPreset,
    loadCloudAutoStartPresetStrict,
  } = useCloudPresetStoreBootstrap<TSavedPreset>({
    cloudEnabled,
    defaultAutoStartPresetName,
    shouldInitializeCloudPresetStore,
    cloudPresetAllowed,
    entryToSavedPreset,
    onCloudAutoStartPreset: setCloudAutoStartPreset,
  });
  loadCloudAutoStartPresetRef.current = loadCloudAutoStartPreset;

  usePresetPlatformMaintenance({
    cloudEnabled,
    sonicParityMode,
    localPresetStoreOverride,
    cloudPresetStoreReadyPromiseRef,
  });

  return {
    cloudPresetStoreReadyPromiseRef,
    loadCloudAutoStartPresetStrict,
    resolveDefaultAutoStartPreset,
  };
}
