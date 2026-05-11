// src/presets/usePresets.ts
// Phase 1 — React hook for preset CRUD at any level.

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  PresetEntry,
  PresetFamilySummary,
  PresetIdentityMetadata,
  PresetLevel,
  PresetSaveIdentity,
  PresetSummary,
  PresetVersionMetadata,
} from './types';
import { getPresetStore, subscribePresetStore } from './PresetStore';
import { extractParams, applyParams, extractCascade, applyCascade, compressVersions, getVersionData } from './codec';
import { extractPresetVersionMetadata, presetValuesEqual } from './presetUtils';
import { buildPresetFamilies } from './catalog';
import { SHARED_PRESET_TEST_MODE } from './sharedMode';
import type { ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';

function levelToParamLevel(level: PresetLevel): ParamLevel {
  switch (level) {
    case 'engine': return 1;
    case 'kit': return 2;
    case 'source': return 3;
    case 'state': return 4;
    case 'journey': return 4; // journey uses L4 refs
  }
}

export interface UsePresetsResult {
  /** List of preset summaries for the current level/engine */
  presets: PresetSummary[];
  /** Presets grouped into family + horizontal variant collections */
  families: PresetFamilySummary[];
  /** Whether the preset list is loading */
  loading: boolean;
  /** Save current state as a new preset (or push a new version if name matches) */
  save: (
    name: string,
    state: SliderState,
    note?: string,
    tags?: string[],
    metadata?: PresetVersionMetadata,
    identity?: PresetSaveIdentity,
  ) => Promise<void>;
  /** Load a preset by name, returns the full entry */
  load: (name: string, version?: number) => Promise<PresetEntry | null>;
  /** Delete a preset by name (only user presets) */
  remove: (name: string) => Promise<boolean>;
  /** Refresh the preset list from the store */
  refresh: () => Promise<void>;
  /** Extract params from state for the current level/scope */
  extract: (state: SliderState) => Record<string, unknown>;
  /** Apply preset data to state, returning new state */
  apply: (state: SliderState, data: Record<string, unknown>) => SliderState;
  /** Update metadata on a preset without creating a new version */
  updateMetadata: (name: string, meta: Partial<PresetIdentityMetadata>) => Promise<void>;
}

export interface UsePresetsOptions {
  /**
   * Custom param extraction function. When provided, overrides the default
   * `extractParams(state, level, scope)` during save. Useful for composite
   * presets (e.g. granular scenes) that span multiple levels.
   */
  customExtract?: (state: SliderState) => Record<string, unknown>;
  /**
   * Custom apply function. When provided, overrides the default registry-based
   * merge during load. Useful when a preset UI intentionally spans multiple
   * ownership buckets.
   */
  customApply?: (state: SliderState, data: Record<string, unknown>) => SliderState;
}

/**
 * React hook for preset CRUD at a specific level and optional engine/source scope.
 *
 * @param type   - Preset level ('engine', 'kit', 'source', 'state', 'journey')
 * @param scope  - For L1: engine name (e.g. 'pad1', 'drumKick'). For L2/L3: source (e.g. 'synth', 'drums')
 * @param options - Optional config (e.g. customExtract for composite presets)
 */
export function usePresets(type: PresetLevel, scope?: string, options?: UsePresetsOptions): UsePresetsResult {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [families, setFamilies] = useState<PresetFamilySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const emptySharedListRetryCountRef = useRef(0);
  const store = useSyncExternalStore(subscribePresetStore, getPresetStore, getPresetStore);
  const paramLevel = levelToParamLevel(type);
  const storeScope = scope;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getPresetStore().list(type, storeScope);
      const visibleList = SHARED_PRESET_TEST_MODE
        ? list.filter((preset) => !!preset.remoteId)
        : list;
      setPresets(visibleList);
      setFamilies(buildPresetFamilies(visibleList));
      if (SHARED_PRESET_TEST_MODE && visibleList.length === 0 && emptySharedListRetryCountRef.current < 4) {
        const retryAttempt = ++emptySharedListRetryCountRef.current;
        window.setTimeout(() => {
          void refresh();
        }, retryAttempt * 1500);
      } else if (visibleList.length > 0) {
        emptySharedListRetryCountRef.current = 0;
      }
    } catch (e) {
      console.warn('Failed to load preset list:', e);
      setFamilies([]);
      if (SHARED_PRESET_TEST_MODE && emptySharedListRetryCountRef.current < 4) {
        const retryAttempt = ++emptySharedListRetryCountRef.current;
        window.setTimeout(() => {
          void refresh();
        }, retryAttempt * 1500);
      }
    }
    setLoading(false);
  }, [type, storeScope, store]);

  useEffect(() => {
    emptySharedListRetryCountRef.current = 0;
  }, [type, storeScope, store]);

  // Load on mount and when scope changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (
    name: string,
    state: SliderState,
    note?: string,
    tags?: string[],
    metadata?: PresetVersionMetadata,
    identity?: PresetSaveIdentity,
  ) => {
    const data = options?.customExtract
      ? options.customExtract(state)
      : (paramLevel >= 3 ? extractCascade(state, paramLevel, scope) : extractParams(state, paramLevel, scope));
    const now = Date.now();

    // Check if preset already exists → push new version
    const activeStore = getPresetStore();
    const existing = await activeStore.load(type, name, storeScope);
    const shouldForkExisting = !SHARED_PRESET_TEST_MODE && !!existing && (existing.author === 'factory' || existing.library === 'stock');
    const existingVersion = existing?.versions.find(v => v.v === existing.currentVersion)
      || existing?.versions[existing.versions.length - 1];
    // Merge: start with preserved metadata from prior version, then overlay any caller-supplied fields
    const preserved = extractPresetVersionMetadata(existingVersion);
    const preservedMetadata = metadata
      ? { ...(preserved || {}), ...metadata }
      : preserved;
    if (existing && !shouldForkExisting) {
      const currentVersionData = getVersionData(existing) ?? existingVersion?.data ?? {};
      const sameData = presetValuesEqual(currentVersionData, data);
      const sameMetadata = presetValuesEqual(preserved ?? {}, preservedMetadata ?? {});
      const identityUnchanged =
        identity?.creator === undefined &&
        identity?.description === undefined &&
        identity?.familyId === undefined &&
        identity?.familyName === undefined &&
        identity?.variantId === undefined &&
        identity?.variantName === undefined &&
        identity?.variantRank === undefined &&
        identity?.visibility === undefined;
      const tagsUnchanged = !tags;

      if (sameData && sameMetadata && identityUnchanged && tagsUnchanged && !note?.trim()) {
        await refresh();
        return;
      }

      const maxV = Math.max(...existing.versions.map(v => v.v));
      existing.versions.push({
        v: maxV + 1,
        note: note || '',
        timestamp: now,
        data,
        ...(preservedMetadata || {}),
      });
      existing.currentVersion = maxV + 1;
      existing.updatedAt = now;
      if (SHARED_PRESET_TEST_MODE) existing.visibility = 'public';
      if (tags) existing.tags = tags;
      if (identity?.creator !== undefined) existing.creator = identity.creator;
      if (identity?.description !== undefined) existing.description = identity.description;
      if (identity?.familyId !== undefined) existing.familyId = identity.familyId;
      if (identity?.familyName !== undefined) existing.familyName = identity.familyName;
      if (identity?.variantId !== undefined) existing.variantId = identity.variantId;
      if (identity?.variantName !== undefined) existing.variantName = identity.variantName;
      if (identity?.variantRank !== undefined) existing.variantRank = identity.variantRank;
      if (identity?.visibility !== undefined) existing.visibility = identity.visibility;
      if (!existing.remoteId) {
        compressVersions(existing);
      }
      await activeStore.save(existing);
    } else {
      // New preset
      const entry: PresetEntry = {
        type,
        scope: storeScope,
        engine: type === 'engine' ? storeScope : undefined,
        source: type !== 'engine' ? storeScope : undefined,
        name,
        author: 'user',
        library: 'user',
        creator: identity?.creator ?? existing?.creator,
        description: identity?.description ?? existing?.description,
        visibility: identity?.visibility ?? (SHARED_PRESET_TEST_MODE ? 'public' : (shouldForkExisting ? 'private' : existing?.visibility) ?? 'private'),
        familyId: identity?.familyId ?? existing?.familyId,
        familyName: identity?.familyName ?? existing?.familyName ?? name,
        variantId: identity?.variantId ?? existing?.variantId,
        variantName: identity?.variantName ?? existing?.variantName ?? name,
        variantRank: identity?.variantRank ?? existing?.variantRank,
        tags: tags || existing?.tags || [],
        versions: [{
          v: 1,
          note: note || '',
          timestamp: now,
          data,
          ...(preservedMetadata || {}),
        }],
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      await activeStore.save(entry);
    }

    await refresh();
  }, [type, scope, storeScope, paramLevel, store, refresh, options]);

  const load = useCallback(async (name: string, version?: number): Promise<PresetEntry | null> => {
    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, name, storeScope, version);
    // Lazy migration: compress uncompressed user presets on first load
    if (entry && !entry.remoteId && entry.author === 'user' && entry.versions.length > 1) {
      const needsCompression = entry.versions.some(
        (v, i) => i > 0 && !v._isDelta
      );
      if (needsCompression) {
        compressVersions(entry);
        activeStore.save(entry).catch(() => {});
      }
    }
    return entry;
  }, [type, storeScope, store]);

  const remove = useCallback(async (name: string): Promise<boolean> => {
    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, name, storeScope);
    if (!entry) return false;
    await activeStore.delete(type, name, storeScope);
    await refresh();
    return true;
  }, [type, storeScope, store, refresh]);

  const extract = useCallback((state: SliderState): Record<string, unknown> => {
    return options?.customExtract
      ? options.customExtract(state)
      : (paramLevel >= 3 ? extractCascade(state, paramLevel, scope) : extractParams(state, paramLevel, scope));
  }, [paramLevel, scope, options]);

  const apply = useCallback((state: SliderState, data: Record<string, unknown>): SliderState => {
    if (options?.customApply) {
      return options.customApply(state, data);
    }
    return paramLevel >= 3
      ? applyCascade(state, data, paramLevel, scope)
      : applyParams(state, data, paramLevel, scope);
  }, [paramLevel, scope, options]);

  const updateMetadata = useCallback(async (name: string, meta: Partial<PresetIdentityMetadata>) => {
    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, name, storeScope);
    if (!entry) return;
    if (meta.rating !== undefined) entry.rating = meta.rating;
    if (meta.description !== undefined) entry.description = meta.description;
    if (meta.visibility !== undefined) entry.visibility = meta.visibility;
    else if (SHARED_PRESET_TEST_MODE) entry.visibility = 'public';
    if (meta.creator !== undefined) entry.creator = meta.creator;
    entry.updatedAt = Date.now();
    await activeStore.save(entry);
    await refresh();
  }, [type, storeScope, store, refresh]);

  return { presets, families, loading, save, load, remove, refresh, extract, apply, updateMetadata };
}
