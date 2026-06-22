import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { JourneyConfig, JourneyNode } from '../audio/journeyTypes';
import { getPresetStore, subscribePresetStore } from './PresetStore';
import { getVersionData } from './codec';
import { buildJourneyPresetPreview } from './journeyPresetPreview';
import { getPresetScope, normalizePresetEntry } from './presetUtils';
import { isSharedPresetCloudOnlyMode } from './sharedMode';
import type { JourneyPresetPreview, PresetEntry, PresetRef, PresetSummary, PresetVersion } from './types';
import {
  JOURNEY_STATE_PRESET_SCOPE,
  buildJourneyRefsFromConfig,
  decodeJourneyPresetData,
  encodeJourneyPresetData,
  validateJourneyConfig,
  type JourneyValidationResult,
} from './journeyPresetCodec';

export interface LoadedJourneyPreset {
  entry: PresetEntry;
  config: JourneyConfig;
  validation: JourneyValidationResult;
}

export interface SaveJourneyPresetOptions {
  note?: string;
  description?: string;
}

export interface UseJourneyPresetsResult {
  presets: PresetSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
  load: (name: string) => Promise<LoadedJourneyPreset | null>;
  save: (name: string, config: JourneyConfig, options?: SaveJourneyPresetOptions) => Promise<PresetEntry | null>;
  rename: (name: string, nextName: string, options?: SaveJourneyPresetOptions) => Promise<PresetEntry | null>;
  remove: (name: string) => Promise<boolean>;
  restoreBackup: (name: string) => Promise<LoadedJourneyPreset | null>;
  hasBackup: (name: string) => Promise<boolean>;
  validate: (config: JourneyConfig | null) => JourneyValidationResult;
  updateMetadata: (name: string, meta: { rating?: number; description?: string }) => Promise<void>;
}

function getCurrentVersion(entry: PresetEntry): PresetVersion | undefined {
  return entry.versions.find((version) => version.v === entry.currentVersion)
    ?? entry.versions[entry.versions.length - 1];
}

function getBackupVersion(entry: PresetEntry): PresetVersion | undefined {
  const currentVersion = getCurrentVersion(entry);
  return entry.versions
    .filter((version) => version.v !== currentVersion?.v)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
}

function versionToConfig(entry: PresetEntry, version?: PresetVersion): JourneyConfig | null {
  if (!version) return null;
  const data = getVersionData(entry, version.v);
  if (!data) return null;
  return {
    ...decodeJourneyPresetData(data, version.refs, entry.name),
    name: entry.name,
  };
}

function clonePresetData(data: Record<string, unknown>): Record<string, unknown> {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(data) as Record<string, unknown>;
    } catch {
      // Fall through to JSON clone for cross-realm values.
    }
  }
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

function materializeVersion(entry: PresetEntry, version: PresetVersion): PresetVersion {
  const data = getVersionData(entry, version.v) ?? version.data;
  const rest = { ...version };
  delete rest._isDelta;
  return {
    ...rest,
    data: clonePresetData(data),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]!);
    }
  }));
  return results;
}

function capJourneyVersions(
  existing: PresetEntry | null,
  name: string,
  data: Record<string, unknown>,
  refs: Record<string, PresetRef> | undefined,
  note: string,
): PresetEntry {
  const now = Date.now();
  const previousVersion = existing ? getCurrentVersion(existing) : undefined;
  const previous = existing && previousVersion
    ? materializeVersion(existing, previousVersion)
    : undefined;
  const nextCurrent: PresetVersion = {
    v: previous ? previous.v + 1 : 1,
    note,
    timestamp: now,
    data,
    ...(refs ? { refs } : {}),
  };
  const nextVersions = previous
    ? [{ ...previous }, nextCurrent]
    : [nextCurrent];

  return {
    ...(existing ?? {
      type: 'journey' as const,
      name,
      author: 'user' as const,
      library: 'user' as const,
      visibility: 'private' as const,
      familyName: name,
      variantName: name,
      tags: ['journey'],
      createdAt: now,
    }),
    type: 'journey',
    scope: undefined,
    source: undefined,
    engine: undefined,
    name,
    author: existing?.author === 'factory' ? 'user' : existing?.author ?? 'user',
    library: existing?.library === 'stock' ? 'user' : existing?.library ?? 'user',
    versions: nextVersions,
    currentVersion: nextCurrent.v,
    updatedAt: now,
  };
}

export function coerceJourneyPresetEntry(
  existing: PresetEntry | null,
  name: string,
  data: Record<string, unknown>,
  refs: Record<string, PresetRef> | undefined,
  note = 'Saved journey graph',
): PresetEntry {
  return normalizePresetEntry(capJourneyVersions(existing, name, data, refs, note))!;
}

export async function resolveJourneyStatePresetRef(node: JourneyNode): Promise<PresetRef> {
  const store = getPresetStore();
  try {
    const entry = await store.load('state', node.presetName, JOURNEY_STATE_PRESET_SCOPE);
    if (entry) {
      return {
        id: entry.id,
        name: entry.name,
        version: 'latest',
        scope: getPresetScope(entry, 'state') ?? JOURNEY_STATE_PRESET_SCOPE,
      };
    }
  } catch {
    // Name fallback keeps bundled or unavailable presets referenceable.
  }

  return {
    name: node.presetName,
    version: 'latest',
    scope: JOURNEY_STATE_PRESET_SCOPE,
  };
}

export async function buildJourneyPresetPayload(config: JourneyConfig): Promise<{
  data: Record<string, unknown>;
  refs?: Record<string, PresetRef>;
}> {
  const refEntries = await Promise.all(config.nodes.map(async (node) => {
    if (!node.presetName || !node.presetId || node.presetId === '__CENTER__') return [node, null] as const;
    return [node, await resolveJourneyStatePresetRef(node)] as const;
  }));
  const refByNode = new Map<JourneyNode, PresetRef | null>(refEntries);
  const refs = buildJourneyRefsFromConfig(config, (node) => refByNode.get(node));
  return {
    data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
    refs,
  };
}

export function useJourneyPresets(): UseJourneyPresetsResult {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const previewCacheRef = useRef(new Map<string, JourneyPresetPreview | null>());
  const store = useSyncExternalStore(subscribePresetStore, getPresetStore, getPresetStore);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const activeStore = getPresetStore();
      const listed = await activeStore.list('journey');
      if (isSharedPresetCloudOnlyMode()) {
        setPresets(listed);
        return;
      }
      const withPreviews = await mapWithConcurrency(listed, 8, async (summary) => {
        if (summary.journeyPreview) return summary;
        const cacheKey = `${summary.id ?? summary.name}:${summary.currentVersion}:${summary.updatedAt}`;
        if (previewCacheRef.current.has(cacheKey)) {
          const cached = previewCacheRef.current.get(cacheKey);
          return cached ? { ...summary, journeyPreview: cached } : summary;
        }

        try {
          const entry = await activeStore.load('journey', summary.name);
          const config = entry ? versionToConfig(entry, getCurrentVersion(entry)) : null;
          const preview = buildJourneyPresetPreview(config);
          previewCacheRef.current.set(cacheKey, preview ?? null);
          return preview ? { ...summary, journeyPreview: preview } : summary;
        } catch {
          previewCacheRef.current.set(cacheKey, null);
          return summary;
        }
      });
      setPresets(withPreviews);
    } catch (error) {
      console.warn('Failed to load journey presets:', error);
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const load = useCallback(async (name: string): Promise<LoadedJourneyPreset | null> => {
    const entry = await getPresetStore().load('journey', name);
    if (!entry) return null;
    const config = versionToConfig(entry, getCurrentVersion(entry));
    if (!config) return null;
    return {
      entry,
      config,
      validation: validateJourneyConfig(config),
    };
  }, [store]);

  const save = useCallback(async (name: string, config: JourneyConfig, options: SaveJourneyPresetOptions = {}): Promise<PresetEntry | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const nextConfig = { ...config, name: trimmed };
    const existing = await getPresetStore().load('journey', trimmed);
    const payload = await buildJourneyPresetPayload(nextConfig);
    const entry = coerceJourneyPresetEntry(existing, trimmed, payload.data, payload.refs, options.note ?? 'Saved journey graph');
    const current = getCurrentVersion(entry);
    const preview = buildJourneyPresetPreview(nextConfig);
    if (current && preview) {
      current.journeyPreview = preview;
    }
    if ('description' in options) {
      const description = options.description?.trim();
      entry.description = description || undefined;
    }
    await getPresetStore().save(entry);
    await refresh();
    return entry;
  }, [refresh, store]);

  const remove = useCallback(async (name: string): Promise<boolean> => {
    const entry = await getPresetStore().load('journey', name);
    if (!entry) return false;
    if (entry.library === 'stock' || entry.author === 'factory') return false;
    await getPresetStore().delete('journey', name);
    await refresh();
    return true;
  }, [refresh, store]);

  const rename = useCallback(async (
    name: string,
    nextName: string,
    options: SaveJourneyPresetOptions = {},
  ): Promise<PresetEntry | null> => {
    const trimmedCurrent = name.trim();
    const trimmedNext = nextName.trim();
    if (!trimmedCurrent || !trimmedNext) return null;
    const renamed = await getPresetStore().rename(
      'journey',
      trimmedCurrent,
      trimmedNext,
      undefined,
      'description' in options
        ? { description: options.description?.trim() || undefined }
        : undefined,
    );
    await refresh();
    return renamed;
  }, [refresh, store]);

  const restoreBackup = useCallback(async (name: string): Promise<LoadedJourneyPreset | null> => {
    const entry = await getPresetStore().load('journey', name);
    if (!entry) return null;
    const current = getCurrentVersion(entry);
    const backup = getBackupVersion(entry);
    if (!current || !backup) return null;
    const now = Date.now();
    entry.versions = [
      materializeVersion(entry, current),
      { ...materializeVersion(entry, backup), v: current.v + 1, timestamp: now, note: 'Undo journey change' },
    ];
    entry.currentVersion = current.v + 1;
    entry.updatedAt = now;
    await getPresetStore().save(entry);
    await refresh();
    return load(name);
  }, [load, refresh, store]);

  const hasBackup = useCallback(async (name: string): Promise<boolean> => {
    const entry = await getPresetStore().load('journey', name);
    return Boolean(entry && getBackupVersion(entry));
  }, [store]);

  const updateMetadata = useCallback(async (name: string, meta: { rating?: number; description?: string }) => {
    const entry = await getPresetStore().load('journey', name);
    if (!entry) return;
    if (typeof meta.rating === 'number') {
      entry.rating = meta.rating;
    }
    if ('description' in meta) {
      const description = meta.description?.trim();
      entry.description = description || undefined;
    }
    await getPresetStore().save(entry);
    await refresh();
  }, [refresh, store]);

  return {
    presets,
    loading,
    refresh,
    load,
    save,
    rename,
    remove,
    restoreBackup,
    hasBackup,
    validate: validateJourneyConfig,
    updateMetadata,
  };
}
