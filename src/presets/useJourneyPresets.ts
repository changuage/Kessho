import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { JourneyConfig, JourneyNode } from '../audio/journeyTypes';
import {
  getPresetStore,
  PresetMetadataConflictError,
  subscribePresetStore,
  type IPresetStore,
} from './PresetStore';
import { getVersionData } from './codec';
import { buildJourneyPresetPreview } from './journeyPresetPreview';
import { getPresetScope } from './presetUtils';
import { decodeCurrentPresetEntry } from './currentPresetSchema';
import { getPresetCommandService } from './presetCommands';
import { isSharedPresetCloudOnlyMode } from './sharedMode';
import { stableStringifyContent } from './contentCanonicalization';
import type {
  JourneyPresetPreview,
  PresetEntry,
  PresetMetadataUpdateOptions,
  PresetRef,
  PresetSummary,
  PresetVersion,
} from './types';
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
  /**
   * Stable name of the persisted Journey being saved from. This is the only
   * implicit authorization for replacing an existing entry; omit it for a
   * new/unknown source so collisions always require explicit confirmation.
   */
  sourceName?: string;
  /** Explicit user acknowledgement required before Save As replaces another Journey. */
  overwriteExisting?: boolean;
}

export function normalizeJourneyPresetNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export class JourneyPresetNameConflictError extends Error {
  readonly code = 'JOURNEY_PRESET_NAME_CONFLICT';

  constructor(
    readonly sourceName: string | undefined,
    readonly requestedName: string,
    readonly existingName: string,
  ) {
    super(`A Journey named "${existingName}" already exists. Confirm replacement to overwrite it.`);
    this.name = 'JourneyPresetNameConflictError';
  }
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
  updateMetadata: (name: string, meta: { rating?: number; description?: string }) => Promise<boolean>;
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

const JOURNEY_PREVIEW_LOAD_CONCURRENCY = 6;
const MAX_JOURNEY_PREVIEW_CACHE_ENTRIES = 96;

type JourneyPreviewCacheIdentity = Pick<PresetSummary, 'id' | 'name' | 'currentVersion'>;

function journeyPreviewCacheKeys(identity: JourneyPreviewCacheIdentity): string[] {
  const versionSuffix = `:v${identity.currentVersion}`;
  const nameKey = `name:${identity.name.trim().toLowerCase()}${versionSuffix}`;
  return identity.id
    ? [`id:${identity.id}${versionSuffix}`, nameKey]
    : [nameKey];
}

function cacheJourneyPreview(
  cache: Map<string, JourneyPresetPreview | null>,
  identity: JourneyPreviewCacheIdentity,
  preview: JourneyPresetPreview | null,
): void {
  for (const key of journeyPreviewCacheKeys(identity)) {
    cache.delete(key);
    cache.set(key, preview);
  }
  while (cache.size > MAX_JOURNEY_PREVIEW_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function readCachedJourneyPreview(
  cache: Map<string, JourneyPresetPreview | null>,
  identity: JourneyPreviewCacheIdentity,
): { found: boolean; preview: JourneyPresetPreview | null } {
  for (const key of journeyPreviewCacheKeys(identity)) {
    if (!cache.has(key)) continue;
    const preview = cache.get(key) ?? null;
    // Touch the entry so frequently displayed cards survive bounded eviction.
    cache.delete(key);
    cache.set(key, preview);
    return { found: true, preview };
  }
  return { found: false, preview: null };
}

function invalidateJourneyPreview(
  cache: Map<string, JourneyPresetPreview | null>,
  identity: Pick<PresetSummary, 'id' | 'name'>,
): void {
  const prefixes = [
    `name:${identity.name.trim().toLowerCase()}:`,
    ...(identity.id ? [`id:${identity.id}:`] : []),
  ];
  for (const key of cache.keys()) {
    if (prefixes.some(prefix => key.startsWith(prefix))) cache.delete(key);
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
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
  return decodeCurrentPresetEntry(capJourneyVersions(existing, name, data, refs, note));
}

/** Factory and stock Journey entries are immutable regardless of backing store. */
export function isJourneyPresetMutable(
  entry: Pick<PresetEntry, 'author' | 'library'> | null,
): boolean {
  return Boolean(entry && entry.author !== 'factory' && entry.library !== 'stock');
}

/**
 * This runs from PresetCommandService.rename while both source and target
 * keys are held, so a stale preflight cannot let a read-only Journey through.
 */
export async function canRenameJourneyPreset(
  store: Pick<IPresetStore, 'load'>,
  name: string,
): Promise<boolean> {
  return isJourneyPresetMutable(await store.load('journey', name));
}

export type JourneyPresetSaveKind = 'content' | 'metadata' | 'noop';

export interface JourneyPresetPersistenceResult {
  entry: PresetEntry;
  kind: JourneyPresetSaveKind;
  preview: JourneyPresetPreview | null;
}

interface JourneyPresetSavePlan {
  entry: PresetEntry;
  contentChanged: boolean;
  descriptionChanged: boolean;
  description: string | undefined;
}

type JourneyPresetStoreWritePort = Pick<IPresetStore, 'load' | 'save' | 'updateMetadata'>;
type JourneyMetadataSummary = Pick<PresetSummary, 'id' | 'remoteId' | 'updatedAtRevision'>;

function normalizeJourneyDescription(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getJourneySaveSourceName(options: SaveJourneyPresetOptions): string | undefined {
  return options.sourceName?.trim() || undefined;
}

function assertJourneySaveTargetIsAuthorized(
  existing: PresetEntry | null,
  requestedName: string,
  sourceName: string | undefined,
  overwriteExisting: boolean | undefined,
): void {
  if (!existing || overwriteExisting) return;
  if (sourceName && normalizeJourneyPresetNameKey(sourceName) === normalizeJourneyPresetNameKey(requestedName)) return;
  throw new JourneyPresetNameConflictError(sourceName, requestedName, existing.name);
}

/**
 * Compare the durable graph shape rather than object identity or runtime node
 * ids. This matches the canonical JSON contract used by preset content hashes.
 */
export function isCurrentJourneyPayload(
  existing: PresetEntry | null,
  data: Record<string, unknown>,
  refs: Record<string, PresetRef> | undefined,
): boolean {
  if (!existing) return false;
  const current = getCurrentVersion(existing);
  const currentData = current ? getVersionData(existing, current.v) : null;
  if (!currentData) return false;
  return stableStringifyContent({ data: currentData, refs: current?.refs ?? {} })
    === stableStringifyContent({ data, refs: refs ?? {} });
}

export function buildJourneyPresetSavePlan(
  existing: PresetEntry | null,
  name: string,
  data: Record<string, unknown>,
  refs: Record<string, PresetRef> | undefined,
  options: SaveJourneyPresetOptions = {},
): JourneyPresetSavePlan {
  const hasDescription = Object.prototype.hasOwnProperty.call(options, 'description');
  const description = normalizeJourneyDescription(options.description);
  const descriptionChanged = Boolean(hasDescription && (
    normalizeJourneyDescription(existing?.description) !== description
  ));

  if (isCurrentJourneyPayload(existing, data, refs)) {
    return {
      entry: existing!,
      contentChanged: false,
      descriptionChanged,
      description,
    };
  }

  const entry = coerceJourneyPresetEntry(
    existing,
    name,
    data,
    refs,
    options.note ?? 'Saved journey graph',
  );
  if (hasDescription) entry.description = description;
  return {
    entry,
    contentChanged: true,
    descriptionChanged,
    description,
  };
}

export function getJourneyMetadataUpdateOptions(
  entry: Pick<PresetEntry, 'id' | 'remoteId' | 'updatedAtRevision'>,
  summary?: JourneyMetadataSummary,
): PresetMetadataUpdateOptions | undefined {
  const targetId = entry.remoteId ?? summary?.remoteId ?? entry.id ?? summary?.id;
  const expectedUpdatedAt = entry.updatedAtRevision ?? summary?.updatedAtRevision;
  if (!targetId && expectedUpdatedAt === undefined) return undefined;
  return {
    ...(targetId ? { targetId } : {}),
    ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
  };
}

export async function resolveJourneyStatePresetRef(
  node: JourneyNode,
  store: Pick<IPresetStore, 'load'> = getPresetStore(),
): Promise<PresetRef> {
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

function journeyStatePresetRefKey(node: JourneyNode): string {
  return `${node.presetId.trim().toLowerCase()}:${node.presetName.trim().toLowerCase()}`;
}

export async function buildJourneyPresetPayload(
  config: JourneyConfig,
  store: Pick<IPresetStore, 'load'> = getPresetStore(),
): Promise<{
  data: Record<string, unknown>;
  refs?: Record<string, PresetRef>;
}> {
  const resolvedRefs = new Map<string, Promise<PresetRef>>();
  const refEntries = await Promise.all(config.nodes.map(async (node) => {
    if (!node.presetName || !node.presetId || node.presetId === '__CENTER__') return [node, null] as const;
    const key = journeyStatePresetRefKey(node);
    let resolved = resolvedRefs.get(key);
    if (!resolved) {
      resolved = resolveJourneyStatePresetRef(node, store);
      resolvedRefs.set(key, resolved);
    }
    return [node, await resolved] as const;
  }));
  const refByNode = new Map<JourneyNode, PresetRef | null>(refEntries);
  const refs = buildJourneyRefsFromConfig(config, (node) => refByNode.get(node));
  return {
    data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
    refs,
  };
}

/**
 * Persist one Journey save after the caller has acquired its per-preset write
 * key. A graph retry does not consume the single undo slot; a description-only
 * edit stays on the identity/metadata path and therefore never creates a
 * content version.
 */
export async function persistJourneyPreset(
  store: JourneyPresetStoreWritePort,
  name: string,
  config: JourneyConfig,
  options: SaveJourneyPresetOptions = {},
  summary?: JourneyMetadataSummary,
): Promise<JourneyPresetPersistenceResult | null> {
  const requestedName = name.trim();
  if (!requestedName) return null;

  const existing = await store.load('journey', requestedName);
  assertJourneySaveTargetIsAuthorized(
    existing,
    requestedName,
    getJourneySaveSourceName(options),
    options.overwriteExisting,
  );
  const canonicalName = existing?.name ?? requestedName;
  const nextConfig = { ...config, name: canonicalName };
  const payload = await buildJourneyPresetPayload(nextConfig, store);
  const plan = buildJourneyPresetSavePlan(existing, canonicalName, payload.data, payload.refs, options);

  if (!plan.contentChanged) {
    const currentPreview = getCurrentVersion(existing!)?.journeyPreview ?? null;
    if (!plan.descriptionChanged) {
      return { entry: existing!, kind: 'noop', preview: currentPreview };
    }

    const updated = await store.updateMetadata(
      'journey',
      canonicalName,
      { description: plan.description ?? null },
      undefined,
      getJourneyMetadataUpdateOptions(existing!, summary),
    );
    if (!updated) return null;
    return {
      entry: { ...existing!, description: plan.description },
      kind: 'metadata',
      preview: currentPreview,
    };
  }

  const entry = plan.entry;
  const preview = buildJourneyPresetPreview(nextConfig);
  const current = getCurrentVersion(entry);
  if (current && preview) current.journeyPreview = preview;
  await store.save(entry);
  return { entry, kind: 'content', preview: preview ?? null };
}

export function useJourneyPresets(): UseJourneyPresetsResult {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const previewCacheRef = useRef(new Map<string, JourneyPresetPreview | null>());
  const store = useSyncExternalStore(subscribePresetStore, getPresetStore, getPresetStore);
  const storeRef = useRef(store);
  const previewCacheStoreRef = useRef(store);
  const refreshInFlightRef = useRef<{ store: IPresetStore; promise: Promise<void> } | null>(null);
  storeRef.current = store;
  if (previewCacheStoreRef.current !== store) {
    previewCacheStoreRef.current = store;
    previewCacheRef.current.clear();
  }
  const commandService = useMemo(() => getPresetCommandService(store), [store]);

  const refresh = useCallback((): Promise<void> => {
    const inFlight = refreshInFlightRef.current;
    if (inFlight?.store === store) return inFlight.promise;

    const activeStore = store;
    setLoading(true);
    const task = (async () => {
      try {
        const listed = await activeStore.list('journey');
        if (isSharedPresetCloudOnlyMode()) {
          if (storeRef.current === activeStore) setPresets(listed);
          return;
        }
        const withPreviews = await mapWithConcurrency(listed, JOURNEY_PREVIEW_LOAD_CONCURRENCY, async (summary) => {
          if (summary.journeyPreview) {
            if (storeRef.current === activeStore) {
              cacheJourneyPreview(previewCacheRef.current, summary, summary.journeyPreview);
            }
            return summary;
          }

          if (storeRef.current === activeStore) {
            const cached = readCachedJourneyPreview(previewCacheRef.current, summary);
            if (cached.found) return cached.preview ? { ...summary, journeyPreview: cached.preview } : summary;
          }

          try {
            const entry = await activeStore.load('journey', summary.name);
            const config = entry ? versionToConfig(entry, getCurrentVersion(entry)) : null;
            const preview = buildJourneyPresetPreview(config);
            if (storeRef.current === activeStore) {
              cacheJourneyPreview(previewCacheRef.current, summary, preview ?? null);
            }
            return preview ? { ...summary, journeyPreview: preview } : summary;
          } catch {
            if (storeRef.current === activeStore) {
              cacheJourneyPreview(previewCacheRef.current, summary, null);
            }
            return summary;
          }
        });
        if (storeRef.current === activeStore) setPresets(withPreviews);
      } catch (error) {
        console.warn('Failed to load journey presets:', error);
        if (storeRef.current === activeStore) setPresets([]);
      } finally {
        if (storeRef.current === activeStore) setLoading(false);
      }
    })();
    refreshInFlightRef.current = { store: activeStore, promise: task };
    void task.finally(() => {
      if (refreshInFlightRef.current?.promise === task) refreshInFlightRef.current = null;
    });
    return task;
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const load = useCallback(async (name: string): Promise<LoadedJourneyPreset | null> => {
    const entry = await store.load('journey', name);
    if (!entry) return null;
    const current = getCurrentVersion(entry);
    const config = versionToConfig(entry, current);
    if (!config) return null;
    const preview = current?.journeyPreview ?? buildJourneyPresetPreview(config);
    if (storeRef.current === store) {
      cacheJourneyPreview(previewCacheRef.current, entry, preview ?? null);
    }
    return {
      entry,
      config,
      validation: validateJourneyConfig(config),
    };
  }, [store]);

  const save = useCallback(async (name: string, config: JourneyConfig, options: SaveJourneyPresetOptions = {}): Promise<PresetEntry | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const sourceName = getJourneySaveSourceName(options) ?? trimmed;
    return commandService.runExclusiveForNames('journey', undefined, [sourceName, trimmed], async () => {
      const summary = presets.find((preset) => normalizeJourneyPresetNameKey(preset.name) === normalizeJourneyPresetNameKey(trimmed));
      const persisted = await persistJourneyPreset(store, trimmed, config, options, summary);
      if (!persisted) {
        await refresh();
        return null;
      }
      if (persisted.kind === 'content' && storeRef.current === store) {
        cacheJourneyPreview(previewCacheRef.current, persisted.entry, persisted.preview);
      }
      if (persisted.kind !== 'noop') await refresh();
      return persisted.entry;
    });
  }, [commandService, presets, refresh, store]);

  const remove = useCallback(async (name: string): Promise<boolean> => {
    return commandService.runExclusive('journey', undefined, name, async () => {
      const entry = await store.load('journey', name);
      if (!entry) return false;
      if (!isJourneyPresetMutable(entry)) return false;
      await store.delete('journey', name);
      if (storeRef.current === store) {
        invalidateJourneyPreview(previewCacheRef.current, entry);
      }
      await refresh();
      return true;
    });
  }, [commandService, refresh, store]);

  const rename = useCallback(async (
    name: string,
    nextName: string,
    options: SaveJourneyPresetOptions = {},
  ): Promise<PresetEntry | null> => {
    const trimmedCurrent = name.trim();
    const trimmedNext = nextName.trim();
    if (!trimmedCurrent || !trimmedNext) return null;
    const renamed = await commandService.rename(
      'journey',
      trimmedCurrent,
      trimmedNext,
      undefined,
      'description' in options
        ? { description: options.description?.trim() || undefined }
        : undefined,
      () => canRenameJourneyPreset(store, trimmedCurrent),
    );
    await refresh();
    return renamed;
  }, [commandService, refresh, store]);

  const restoreBackup = useCallback(async (name: string): Promise<LoadedJourneyPreset | null> => {
    return commandService.runExclusive('journey', undefined, name, async () => {
      const entry = await store.load('journey', name);
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
      await store.save(entry);
      const config = versionToConfig(entry, getCurrentVersion(entry));
      if (!config) {
        await refresh();
        return null;
      }
      const preview = getCurrentVersion(entry)?.journeyPreview ?? buildJourneyPresetPreview(config);
      if (storeRef.current === store) {
        cacheJourneyPreview(previewCacheRef.current, entry, preview ?? null);
      }
      await refresh();
      return {
        entry,
        config,
        validation: validateJourneyConfig(config),
      };
    });
  }, [commandService, refresh, store]);

  const hasBackup = useCallback(async (name: string): Promise<boolean> => {
    const entry = await store.load('journey', name);
    return Boolean(entry && getBackupVersion(entry));
  }, [store]);

  const updateMetadata = useCallback(async (
    name: string,
    meta: { rating?: number; description?: string },
  ): Promise<boolean> => {
    const summary = presets.find(
      (preset) => normalizeJourneyPresetNameKey(preset.name) === normalizeJourneyPresetNameKey(name),
    );
    const updateOptions = summary
      ? {
        ...(summary.remoteId || summary.id ? { targetId: summary.remoteId ?? summary.id } : {}),
        ...(summary.updatedAtRevision ? { expectedUpdatedAt: summary.updatedAtRevision } : {}),
      }
      : undefined;
    try {
      const updated = await commandService.updateMetadata('journey', name, {
        ...(typeof meta.rating === 'number' ? { rating: meta.rating } : {}),
        ...('description' in meta ? { description: meta.description?.trim() || null } : {}),
      }, undefined, updateOptions);
      if (!updated) {
        await refresh();
        return false;
      }
      await refresh();
      return true;
    } catch (error) {
      if (error instanceof PresetMetadataConflictError) await refresh();
      throw error;
    }
  }, [commandService, presets, refresh]);

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
