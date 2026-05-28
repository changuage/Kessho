import { useCallback, type Dispatch, type SetStateAction } from 'react';

type DeferredSavedPreset = {
  name: string;
  deferred?: boolean;
};

type UseSavedPresetResolverOptions<TSavedPreset extends DeferredSavedPreset> = {
  savedPresets: TSavedPreset[];
  setSavedPresets: Dispatch<SetStateAction<TSavedPreset[]>>;
  usesCloudBackedStatePresetLibrary: boolean;
  loadPresetByName: (name: string) => Promise<TSavedPreset | null>;
  sortPresets: (presets: TSavedPreset[]) => TSavedPreset[];
};

type SavedPresetResolver<TSavedPreset> = {
  resolveSavedPresetForLoad: (preset: TSavedPreset) => Promise<TSavedPreset | null>;
  resolveSavedPresetByName: (presetName: string) => Promise<TSavedPreset | null>;
};

export function useSavedPresetResolver<TSavedPreset extends DeferredSavedPreset>({
  savedPresets,
  setSavedPresets,
  usesCloudBackedStatePresetLibrary,
  loadPresetByName,
  sortPresets,
}: UseSavedPresetResolverOptions<TSavedPreset>): SavedPresetResolver<TSavedPreset> {
  const resolveSavedPresetForLoad = useCallback(async (preset: TSavedPreset): Promise<TSavedPreset | null> => {
    if (!preset.deferred) return preset;

    try {
      const loadedPreset = await loadPresetByName(preset.name);
      if (!loadedPreset) {
        console.warn(`Failed to load preset "${preset.name}" from the preset store.`);
        return null;
      }

      setSavedPresets(prev => sortPresets(prev.map(item => (
        item.name === preset.name ? loadedPreset : item
      ))));
      return loadedPreset;
    } catch (error) {
      console.warn(`Failed to load preset "${preset.name}" from the preset store:`, error);
      return null;
    }
  }, [loadPresetByName, setSavedPresets, sortPresets]);

  const resolveSavedPresetByName = useCallback(async (presetName: string): Promise<TSavedPreset | null> => {
    const preset = savedPresets.find(item => item.name === presetName);
    if (preset) return resolveSavedPresetForLoad(preset);

    if (!usesCloudBackedStatePresetLibrary) return null;

    try {
      const loadedPreset = await loadPresetByName(presetName);
      if (loadedPreset) {
        setSavedPresets(prev => sortPresets(
          prev.some(item => item.name === loadedPreset.name)
            ? prev.map(item => (item.name === loadedPreset.name ? loadedPreset : item))
            : [...prev, loadedPreset],
        ));
      }
      return loadedPreset;
    } catch (error) {
      console.warn(`Failed to load preset "${presetName}" from the preset store:`, error);
      return null;
    }
  }, [
    loadPresetByName,
    resolveSavedPresetForLoad,
    savedPresets,
    setSavedPresets,
    sortPresets,
    usesCloudBackedStatePresetLibrary,
  ]);

  return {
    resolveSavedPresetForLoad,
    resolveSavedPresetByName,
  };
}
