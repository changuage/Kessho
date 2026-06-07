import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { usePresetLibraryLoader, type CloudSharedPresetPayload } from './usePresetLibraryLoader';
import { useSavedPresetResolver } from './useSavedPresetResolver';

export type { CloudSharedPresetPayload } from './usePresetLibraryLoader';

type DeferredSavedPreset = {
  name: string;
  deferred?: boolean;
};

type UsePresetLibraryRuntimeSurfaceOptions<TSavedPreset extends DeferredSavedPreset> = {
  cloudEnabled: boolean;
  cloudPresetAllowed: boolean;
  cloudPresetStoreReadyPromiseRef: MutableRefObject<Promise<void>>;
  loadBundledPresets: () => Promise<TSavedPreset[]>;
  loadCapacitorLocalPresets: () => Promise<TSavedPreset[]>;
  loadCloudBackedPresets: () => Promise<TSavedPreset[]>;
  loadPresetByName: (name: string) => Promise<TSavedPreset | null>;
  onCloudSharedPresetLoaded: (preset: TSavedPreset, metadata: { name: string; author: string }) => void;
  reloadKey?: unknown;
  savedPresets: TSavedPreset[];
  setSavedPresets: Dispatch<SetStateAction<TSavedPreset[]>>;
  sortPresets: (presets: TSavedPreset[]) => TSavedPreset[];
  toCloudSharedPreset: (preset: CloudSharedPresetPayload) => TSavedPreset;
  usesCapacitorLocalPresetLibrary: boolean;
  usesCloudBackedStatePresetLibrary: boolean;
};

export function usePresetLibraryRuntimeSurface<TSavedPreset extends DeferredSavedPreset>({
  cloudEnabled,
  cloudPresetAllowed,
  cloudPresetStoreReadyPromiseRef,
  loadBundledPresets,
  loadCapacitorLocalPresets,
  loadCloudBackedPresets,
  loadPresetByName,
  onCloudSharedPresetLoaded,
  reloadKey,
  savedPresets,
  setSavedPresets,
  sortPresets,
  toCloudSharedPreset,
  usesCapacitorLocalPresetLibrary,
  usesCloudBackedStatePresetLibrary,
}: UsePresetLibraryRuntimeSurfaceOptions<TSavedPreset>) {
  const handlePresetsLoadFailed = useCallback(() => {
    setSavedPresets((previous) => (previous.length === 0 ? previous : []));
  }, [setSavedPresets]);

  usePresetLibraryLoader<TSavedPreset>({
    cloudEnabled,
    cloudPresetAllowed,
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
    cloudPresetStoreReadyPromiseRef,
    reloadKey,
    loadBundledPresets,
    loadCapacitorLocalPresets,
    loadCloudBackedPresets,
    onPresetsLoaded: setSavedPresets,
    onPresetsLoadFailed: handlePresetsLoadFailed,
    toCloudSharedPreset,
    onCloudSharedPresetLoaded,
  });

  return useSavedPresetResolver<TSavedPreset>({
    savedPresets,
    setSavedPresets,
    usesCloudBackedStatePresetLibrary,
    loadPresetByName,
    sortPresets,
  });
}
