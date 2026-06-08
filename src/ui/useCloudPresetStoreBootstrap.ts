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

type CachedCloudAutoStartPreset<TSavedPreset> = {
  preset: TSavedPreset | null;
  entryName: string | null;
};

type CachedCloudAutoStartEntry = {
  entry: PresetEntry | null;
};

const sharedCloudAutoStartEntryCache = new Map<string, CachedCloudAutoStartEntry>();
const sharedCloudAutoStartEntryInFlight = new Map<string, Promise<CachedCloudAutoStartEntry>>();

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
  const cloudAutoStartCacheKeyRef = useRef<string | null>(null);
  const cloudAutoStartPresetRef = useRef<CachedCloudAutoStartPreset<TSavedPreset> | null>(null);
  const cloudAutoStartPresetInFlightRef = useRef<Promise<CachedCloudAutoStartPreset<TSavedPreset>> | null>(null);
  const cloudAutoStartLoadLogRef = useRef<string | null>(null);
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

  const ensureCloudAutoStartPresetStore = useCallback(async (): Promise<IPresetStore | null> => {
    if (!cloudPresetAllowed) return null;
    if (cloudPresetStoreRef.current) return cloudPresetStoreRef.current;
    if (!cloudAutoStartStoreInitPromiseRef.current) {
      cloudAutoStartStoreInitPromiseRef.current = (async () => {
        try {
          const { ensureCloudAnonymousSession, getSupabase } = await import('../cloud/supabase');
          const { SupabasePresetStore } = await import('../presets');
          const supabaseClient = getSupabase();
          if (!supabaseClient) return null;

          const cloud = new SupabasePresetStore(supabaseClient);

          try {
            const sessionUser = await ensureCloudAnonymousSession(supabaseClient);
            if (sessionUser) cloud.setUserId(sessionUser.id, sessionUser.isAnonymous);
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

  const readCloudAutoStartPreset = useCallback(async (): Promise<CachedCloudAutoStartPreset<TSavedPreset>> => {
    if (!cloudEnabled || !cloudPresetAllowed) return { preset: null, entryName: null };

    const cacheKey = getCloudAutoStartCacheKey(defaultAutoStartPresetName);
    if (cloudAutoStartCacheKeyRef.current !== cacheKey) {
      cloudAutoStartCacheKeyRef.current = cacheKey;
      cloudAutoStartPresetRef.current = null;
      cloudAutoStartPresetInFlightRef.current = null;
      cloudAutoStartLoadLogRef.current = null;
    }

    if (cloudAutoStartPresetRef.current) return cloudAutoStartPresetRef.current;
    if (cloudAutoStartPresetInFlightRef.current) return cloudAutoStartPresetInFlightRef.current;

    cloudAutoStartPresetInFlightRef.current = (async () => {
      let cachedEntry = sharedCloudAutoStartEntryCache.get(cacheKey);
      if (!cachedEntry) {
        let sharedInFlight = sharedCloudAutoStartEntryInFlight.get(cacheKey);
        if (!sharedInFlight) {
          sharedInFlight = (async () => {
            const store = await ensureCloudAutoStartPresetStore();
            if (!store) return { entry: null };

            return { entry: await store.load('state', defaultAutoStartPresetName, 'global') };
          })()
            .then((result) => {
              sharedCloudAutoStartEntryCache.set(cacheKey, result);
              return result;
            })
            .finally(() => {
              sharedCloudAutoStartEntryInFlight.delete(cacheKey);
            });
          sharedCloudAutoStartEntryInFlight.set(cacheKey, sharedInFlight);
        }
        cachedEntry = await sharedInFlight;
      }

      const preset = cachedEntry.entry
        ? entryToSavedPreset(cachedEntry.entry, 'highest')
        : null;
      const result = {
        preset,
        entryName: cachedEntry.entry?.name ?? null,
      };
      cloudAutoStartPresetRef.current = result;
      return result;
    })().finally(() => {
      cloudAutoStartPresetInFlightRef.current = null;
    });

    return cloudAutoStartPresetInFlightRef.current;
  }, [
    cloudEnabled,
    cloudPresetAllowed,
    defaultAutoStartPresetName,
    ensureCloudAutoStartPresetStore,
    entryToSavedPreset,
  ]);

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
        const { ensureCloudAnonymousSession, getSupabase } = await import('../cloud/supabase');
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
          const sessionUser = await ensureCloudAnonymousSession(supabaseClient);
          if (sessionUser) cloud.setUserId(sessionUser.id, sessionUser.isAnonymous);
        } catch (error) {
          console.warn('Auth init failed:', error);
        }

        if (cancelled) return;

        const hybrid = new HybridPresetStore(local, cloud);
        setPresetStore(hybrid);
        markCloudPresetStoreReady();
        console.log('Cloud preset store initialized');
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
    markCloudPresetStoreReady,
    shouldInitializeCloudPresetStore,
  ]);

  const loadCloudAutoStartPreset = useCallback(async (): Promise<TSavedPreset | null> => {
    try {
      const { preset, entryName } = await readCloudAutoStartPreset();

      if (preset) {
        onCloudAutoStartPreset(preset, 'load');
        const logKey = entryName ?? presetNameForLog(preset) ?? defaultAutoStartPresetName;
        if (cloudAutoStartLoadLogRef.current !== logKey) {
          cloudAutoStartLoadLogRef.current = logKey;
          console.log(`[App] Loaded latest cloud auto-start preset: ${logKey}`);
        }
      }

      return preset;
    } catch (error) {
      console.warn('Failed to load latest cloud auto-start preset:', error);
      return null;
    }
  }, [
    defaultAutoStartPresetName,
    onCloudAutoStartPreset,
    readCloudAutoStartPreset,
  ]);

  return {
    cloudPresetStoreReadyPromiseRef: cloudPresetStoreReadyPromiseRef as MutableRefObject<Promise<void>>,
    loadCloudAutoStartPreset,
  };
}

function presetNameForLog(preset: unknown): string | null {
  if (!preset || typeof preset !== 'object' || !('name' in preset)) return null;
  const value = (preset as { name?: unknown }).name;
  return typeof value === 'string' ? value : null;
}

function getCloudAutoStartCacheKey(defaultAutoStartPresetName: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL ?? 'unconfigured'}:state:global:${defaultAutoStartPresetName}`;
}
