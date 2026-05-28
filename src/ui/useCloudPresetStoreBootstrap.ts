import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { IPresetStore } from '../presets/PresetStore';
import type { PresetEntry } from '../presets/types';

type AutoStartPresetSource = 'prefetch' | 'load';

type UseCloudPresetStoreBootstrapOptions<TSavedPreset> = {
  cloudEnabled: boolean;
  defaultAutoStartPresetName: string;
  shouldInitializeCloudPresetStore: boolean;
  cloudPresetAllowed: boolean;
  entryToSavedPreset: (entry: PresetEntry, freshness?: 'highest') => TSavedPreset | null;
  onCloudAutoStartPreset: (preset: TSavedPreset | null, source: AutoStartPresetSource) => void;
};

type CloudPresetStoreBootstrap<TSavedPreset> = {
  cloudPresetStoreReadyPromiseRef: MutableRefObject<Promise<void>>;
  loadCloudAutoStartPreset: () => Promise<TSavedPreset | null>;
};

export function useCloudPresetStoreBootstrap<TSavedPreset>({
  cloudEnabled,
  defaultAutoStartPresetName,
  shouldInitializeCloudPresetStore,
  cloudPresetAllowed,
  entryToSavedPreset,
  onCloudAutoStartPreset,
}: UseCloudPresetStoreBootstrapOptions<TSavedPreset>): CloudPresetStoreBootstrap<TSavedPreset> {
  const cloudPresetStoreRef = useRef<IPresetStore | null>(null);
  const cloudAutoStartStoreInitPromiseRef = useRef<Promise<IPresetStore | null> | null>(null);
  const cloudPresetStoreReadyRef = useRef(!cloudPresetAllowed);
  const cloudPresetStoreReadyResolveRef = useRef<(() => void) | null>(null);
  const cloudPresetStoreReadyPromiseRef = useRef<Promise<void> | null>(null);

  if (cloudPresetStoreReadyPromiseRef.current === null) {
    cloudPresetStoreReadyPromiseRef.current = cloudPresetStoreReadyRef.current
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          cloudPresetStoreReadyResolveRef.current = resolve;
        });
  }

  const markCloudPresetStoreReady = useCallback(() => {
    if (cloudPresetStoreReadyRef.current) return;
    cloudPresetStoreReadyRef.current = true;
    cloudPresetStoreReadyResolveRef.current?.();
    cloudPresetStoreReadyResolveRef.current = null;
  }, []);

  useEffect(() => {
    if (!shouldInitializeCloudPresetStore) {
      markCloudPresetStoreReady();
      return;
    }

    let cancelled = false;

    // Use anonymous auth so RLS policies work (user_id is always set).
    // Supabase project must have "Allow anonymous sign-ins" enabled.
    void (async () => {
      try {
        const { getSupabase } = await import('../cloud/supabase');
        const {
          LocalStoragePresetStore,
          SupabasePresetStore,
          HybridPresetStore,
          setPresetStore,
        } = await import('../presets');
        if (cancelled) return;

        const supabaseClient = getSupabase();
        if (!supabaseClient) {
          markCloudPresetStoreReady();
          return;
        }

        const local = new LocalStoragePresetStore();
        const cloud = new SupabasePresetStore(supabaseClient);
        cloudPresetStoreRef.current = cloud;

        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session?.user) {
            cloud.setUserId(session.user.id, session.user.is_anonymous ?? false);
          } else {
            const { data, error } = await supabaseClient.auth.signInAnonymously();
            if (error) {
              console.warn('Anonymous auth failed:', error.message);
            } else if (data.user) {
              cloud.setUserId(data.user.id, true);
            }
          }
        } catch (error) {
          console.warn('Auth init failed:', error);
        }

        if (cancelled) return;

        const hybrid = new HybridPresetStore(local, cloud);
        setPresetStore(hybrid);
        markCloudPresetStoreReady();
        console.log('Cloud preset store initialized');

        try {
          const autoStartEntry = await cloud.load('state', defaultAutoStartPresetName, 'global');
          if (cancelled) return;

          const preset = autoStartEntry
            ? entryToSavedPreset(autoStartEntry, 'highest')
            : null;
          onCloudAutoStartPreset(preset, 'prefetch');
          if (preset) {
            console.log(`[App] Prefetched latest cloud auto-start preset: ${autoStartEntry!.name}`);
          }
        } catch (error) {
          console.warn('Failed to preload cloud auto-start preset:', error);
        }
      } catch (error) {
        if (cancelled) return;
        markCloudPresetStoreReady();
        console.warn('Cloud preset store initialization failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    defaultAutoStartPresetName,
    entryToSavedPreset,
    markCloudPresetStoreReady,
    onCloudAutoStartPreset,
    shouldInitializeCloudPresetStore,
  ]);

  const ensureCloudAutoStartPresetStore = useCallback(async (): Promise<IPresetStore | null> => {
    if (!cloudPresetAllowed) return null;
    if (cloudPresetStoreRef.current) return cloudPresetStoreRef.current;
    if (!cloudAutoStartStoreInitPromiseRef.current) {
      cloudAutoStartStoreInitPromiseRef.current = (async () => {
        try {
          const { getSupabase } = await import('../cloud/supabase');
          const { SupabasePresetStore } = await import('../presets');
          const supabaseClient = getSupabase();
          if (!supabaseClient) return null;

          const cloud = new SupabasePresetStore(supabaseClient);

          try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user) {
              cloud.setUserId(session.user.id, session.user.is_anonymous ?? false);
            } else {
              const { data, error } = await supabaseClient.auth.signInAnonymously();
              if (error) {
                console.warn('Anonymous auth failed for cloud auto-start preset:', error.message);
              } else if (data.user) {
                cloud.setUserId(data.user.id, true);
              }
            }
          } catch (error) {
            console.warn('Cloud auto-start auth init failed:', error);
          }

          cloudPresetStoreRef.current = cloud;
          return cloud;
        } catch (error) {
          console.warn('Cloud auto-start preset store initialization failed:', error);
          return null;
        }
      })();
    }

    return cloudAutoStartStoreInitPromiseRef.current;
  }, [cloudPresetAllowed]);

  const loadCloudAutoStartPreset = useCallback(async (): Promise<TSavedPreset | null> => {
    if (!cloudEnabled) return null;

    const store = await ensureCloudAutoStartPresetStore();
    if (!store) return null;

    try {
      const autoStartEntry = await store.load('state', defaultAutoStartPresetName, 'global');
      const preset = autoStartEntry
        ? entryToSavedPreset(autoStartEntry, 'highest')
        : null;

      if (preset) {
        onCloudAutoStartPreset(preset, 'load');
        console.log(`[App] Loaded latest cloud auto-start preset: ${autoStartEntry!.name}`);
      }

      return preset;
    } catch (error) {
      console.warn('Failed to load latest cloud auto-start preset:', error);
      return null;
    }
  }, [
    cloudEnabled,
    defaultAutoStartPresetName,
    ensureCloudAutoStartPresetStore,
    entryToSavedPreset,
    onCloudAutoStartPreset,
  ]);

  return {
    cloudPresetStoreReadyPromiseRef: cloudPresetStoreReadyPromiseRef as MutableRefObject<Promise<void>>,
    loadCloudAutoStartPreset,
  };
}
