import { useCallback, type Dispatch, type SetStateAction } from 'react';

type DeferredSavedPreset = {
  id?: string;
  name: string;
  deferred?: boolean;
};

type UseSavedPresetResolverOptions<TSavedPreset extends DeferredSavedPreset> = {
  savedPresets: TSavedPreset[];
  setSavedPresets: Dispatch<SetStateAction<TSavedPreset[]>>;
  usesCloudBackedStatePresetLibrary: boolean;
  loadPresetByName: (name: string) => Promise<TSavedPreset | null>;
  loadPresetById?: (id: string) => Promise<TSavedPreset | null>;
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
  loadPresetById,
  sortPresets,
}: UseSavedPresetResolverOptions<TSavedPreset>): SavedPresetResolver<TSavedPreset> {
  const resolveSavedPresetForLoad = useCallback(async (preset: TSavedPreset): Promise<TSavedPreset | null> => {
    if (!preset.deferred) return preset;

    try {
      let resolvedPreset = preset.id && loadPresetById
        ? await loadPresetById(preset.id)
        : null;
      if (!resolvedPreset) {
        const loadedPreset = await loadPresetByName(preset.name);
        resolvedPreset = loadedPreset;
      }
      const loadedPreset = resolvedPreset;
      if (!loadedPreset) {
        console.warn(`Failed to load preset "${preset.name}" from the preset store.`);
        return null;
      }

      setSavedPresets(prev => sortPresets(prev.map(item => (
        (preset.id && item.id === preset.id) || (!preset.id && item.name === preset.name) ? loadedPreset : item
      ))));
      return loadedPreset;
    } catch (error) {
      console.warn(`Failed to load preset "${preset.name}" from the preset store:`, error);
      return null;
    }
  }, [loadPresetById, loadPresetByName, setSavedPresets, sortPresets]);

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
