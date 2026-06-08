import { useCallback, useRef } from 'react';

type AutoStartPresetSource = 'cloud' | 'device-local' | 'bundled';

type AutoStartPreset<TPreset> = {
  preset: TPreset | null;
  source: AutoStartPresetSource | null;
};

type UseAutoStartPresetResolverOptions<TPreset extends { name: string; source?: AutoStartPresetSource }> = {
  cloudEnabled: boolean;
  cloudPresetAllowed: boolean;
  usesCapacitorLocalPresetLibrary: boolean;
  usesCloudBackedStatePresetLibrary: boolean;
  defaultAutoStartPresetName: string;
  savedPresets: TPreset[];
  loadCloudAutoStartPreset: () => Promise<TPreset | null>;
  loadBundledPresetByName: (name: string) => Promise<TPreset | null>;
};

type AutoStartPresetResolver<TPreset> = {
  resolveDefaultAutoStartPreset: () => Promise<AutoStartPreset<TPreset>>;
  setCloudAutoStartPreset: (preset: TPreset | null, source: 'prefetch' | 'load') => void;
};

export function useAutoStartPresetResolver<TPreset extends { name: string; source?: AutoStartPresetSource }>({
  cloudEnabled,
  cloudPresetAllowed,
  usesCapacitorLocalPresetLibrary,
  usesCloudBackedStatePresetLibrary,
  defaultAutoStartPresetName,
  savedPresets,
  loadCloudAutoStartPreset,
  loadBundledPresetByName,
}: UseAutoStartPresetResolverOptions<TPreset>): AutoStartPresetResolver<TPreset> {
  const autoStartPresetRef = useRef<TPreset | null>(null);
  const autoStartPresetSourceRef = useRef<AutoStartPresetSource | null>(null);

  const setCloudAutoStartPreset = useCallback((preset: TPreset | null, source: 'prefetch' | 'load') => {
    if (preset) {
      autoStartPresetRef.current = preset;
      autoStartPresetSourceRef.current = 'cloud';
      return;
    }

    if (source === 'prefetch') {
      autoStartPresetRef.current = null;
    }
  }, []);

  const resolveDefaultAutoStartPreset = useCallback(async (): Promise<AutoStartPreset<TPreset>> => {
    if (autoStartPresetRef.current) {
      return {
        preset: autoStartPresetRef.current,
        source: autoStartPresetSourceRef.current,
      };
    }

    if (cloudEnabled && cloudPresetAllowed) {
      const timeoutMs = 1500;
      const timedCloudPreset = await Promise.race<TPreset | null>([
        loadCloudAutoStartPreset(),
        new Promise<TPreset | null>((resolve) => {
          window.setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      if (timedCloudPreset) {
        return { preset: timedCloudPreset, source: 'cloud' };
      }
    }

    const deviceLocalPreset = savedPresets.find((preset) => preset.name === defaultAutoStartPresetName) ?? null;
    if (deviceLocalPreset) {
      autoStartPresetRef.current = deviceLocalPreset;
      autoStartPresetSourceRef.current = deviceLocalPreset.source ?? (
        usesCloudBackedStatePresetLibrary
          ? 'cloud'
          : usesCapacitorLocalPresetLibrary
            ? 'device-local'
            : 'bundled'
      );
      return {
        preset: deviceLocalPreset,
        source: autoStartPresetSourceRef.current,
      };
    }

    const bundledPreset = await loadBundledPresetByName(defaultAutoStartPresetName);
    if (bundledPreset) {
      autoStartPresetRef.current = bundledPreset;
      autoStartPresetSourceRef.current = 'bundled';
      return {
        preset: bundledPreset,
        source: 'bundled',
      };
    }

    return { preset: null, source: null };
  }, [
    cloudEnabled,
    cloudPresetAllowed,
    defaultAutoStartPresetName,
    loadBundledPresetByName,
    loadCloudAutoStartPreset,
    savedPresets,
    usesCapacitorLocalPresetLibrary,
    usesCloudBackedStatePresetLibrary,
  ]);

  return {
    resolveDefaultAutoStartPreset,
    setCloudAutoStartPreset,
  };
}
