import { useEffect, type MutableRefObject } from 'react';

export type CloudSharedPresetPayload = {
  name: string;
  author: string;
  data: unknown;
};

type UsePresetLibraryLoaderOptions<TSavedPreset> = {
  cloudEnabled: boolean;
  cloudPresetAllowed: boolean;
  usesCapacitorLocalPresetLibrary: boolean;
  usesCloudBackedStatePresetLibrary: boolean;
  cloudPresetStoreReadyPromiseRef: MutableRefObject<Promise<void>>;
  reloadKey?: unknown;
  loadBundledPresets: () => Promise<TSavedPreset[]>;
  loadCapacitorLocalPresets: () => Promise<TSavedPreset[]>;
  loadCloudBackedPresets: () => Promise<TSavedPreset[]>;
  onPresetsLoaded: (presets: TSavedPreset[]) => void;
  onPresetsLoadFailed: (error: unknown) => void;
  toCloudSharedPreset: (preset: CloudSharedPresetPayload) => TSavedPreset;
  onCloudSharedPresetLoaded: (preset: TSavedPreset, metadata: { name: string; author: string }) => void;
};

export function usePresetLibraryLoader<TSavedPreset>({
  cloudEnabled,
  cloudPresetAllowed,
  usesCapacitorLocalPresetLibrary,
  usesCloudBackedStatePresetLibrary,
  cloudPresetStoreReadyPromiseRef,
  reloadKey,
  loadBundledPresets,
  loadCapacitorLocalPresets,
  loadCloudBackedPresets,
  onPresetsLoaded,
  onPresetsLoadFailed,
  toCloudSharedPreset,
  onCloudSharedPresetLoaded,
}: UsePresetLibraryLoaderOptions<TSavedPreset>): void {
  useEffect(() => {
    let cancelled = false;

    const loadPresets = async () => {
      if (usesCloudBackedStatePresetLibrary) {
        await cloudPresetStoreReadyPromiseRef.current;
        return loadCloudBackedPresets();
      }
      if (usesCapacitorLocalPresetLibrary) {
        return loadCapacitorLocalPresets();
      }
      return loadBundledPresets();
    };

    loadPresets()
      .then((presets) => {
        if (cancelled) return;
        onPresetsLoaded(presets);
      })
      .catch((error) => {
        console.warn('Failed to load presets:', error);
        if (!cancelled) onPresetsLoadFailed(error);
      });

    const urlParams = new URLSearchParams(window.location.search);
    const cloudPresetId = urlParams.get('cloud');
    if (cloudPresetId && cloudEnabled && cloudPresetAllowed) {
      void import('../cloud/supabase')
        .then(({ fetchPresetById }) => fetchPresetById(cloudPresetId))
        .then((preset) => {
          if (cancelled || !preset) return;

          onCloudSharedPresetLoaded(
            toCloudSharedPreset({
              name: preset.name,
              author: preset.author,
              data: preset.data,
            }),
            { name: preset.name, author: preset.author },
          );
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    cloudEnabled,
    cloudPresetAllowed,
    cloudPresetStoreReadyPromiseRef,
    loadBundledPresets,
    loadCapacitorLocalPresets,
    loadCloudBackedPresets,
    onCloudSharedPresetLoaded,
    onPresetsLoadFailed,
    onPresetsLoaded,
    reloadKey,
    toCloudSharedPreset,
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
  ]);
}
