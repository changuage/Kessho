// src/presets/usePresets.ts
// Phase 1 — React hook for preset CRUD at any level.

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  PresetEntry,
  PresetFamilySummary,
  PresetIdentityMetadata,
  PresetLevel,
  PresetRenameIdentity,
  PresetSaveIdentity,
  PresetSummary,
  PresetVersionMetadata,
} from './types';
import { getPresetStore, subscribePresetStore } from './PresetStore';
import { extractParams, applyParams, extractCascade, applyCascade, compressVersions, getVersionData } from './codec';
import { extractPresetVersionMetadata, presetValuesEqual } from './presetUtils';
import { buildPresetFamilies } from './catalog';
import { normalizePresetTags } from './presetPool';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE, isSharedPresetCloudOnlyMode } from './sharedMode';
import type { ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';
import {
  cleanupJourneyRefsForDeletedStatePreset,
  findJourneyPresetsReferencingStatePreset,
} from './journeyPresetReferences';

function levelToParamLevel(level: PresetLevel): ParamLevel {
  switch (level) {
    case 'engine': return 1;
    case 'kit': return 2;
    case 'source': return 3;
    case 'state': return 4;
    case 'journey': return 4; // journey uses L4 refs
  }
}

function normalizePresetNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function isInternalDerivedPresetRefName(name: string): boolean {
  return name.startsWith('__derived__/');
}

function stripInternalDerivedPresetRefs(
  metadata: PresetVersionMetadata | undefined,
): PresetVersionMetadata | undefined {
  if (!metadata?.refs) return metadata;

  const refs = Object.fromEntries(
    Object.entries(metadata.refs).filter(([, ref]) => !isInternalDerivedPresetRefName(ref.name)),
  );
  if (Object.keys(refs).length === Object.keys(metadata.refs).length) return metadata;

  const next: PresetVersionMetadata = { ...metadata };
  if (Object.keys(refs).length > 0) next.refs = refs;
  else delete next.refs;
  return Object.keys(next).length > 0 ? next : undefined;
}

function findActiveNameConflict(presets: PresetSummary[], name: string): PresetSummary | null {
  const nameKey = normalizePresetNameKey(name);
  return presets.find((preset) => normalizePresetNameKey(preset.name) === nameKey) ?? null;
}

function chooseDuplicatePresetNameAction(
  requestedName: string,
  existingName: string,
  presets: PresetSummary[],
): string | null {
  if (requestedName === existingName) return existingName;
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
    return existingName;
  }

  const choice = window.prompt(
    `A preset with this name already exists.\n\nExisting preset: "${existingName}"\nRequested name: "${requestedName}"\n\nChoose one:\n1. Update existing preset as a new version\n2. Save with a different name\n3. Cancel`,
    '1',
  );

  if (choice === null || choice.trim() === '3') return null;
  if (choice.trim() === '1') return existingName;
  if (choice.trim() !== '2') return null;

  const nextName = window.prompt('Save with a different preset name:', requestedName);
  const trimmed = nextName?.trim();
  if (!trimmed) return null;

  const nextConflict = findActiveNameConflict(presets, trimmed);
  if (nextConflict) {
    window.alert(`A preset named "${nextConflict.name}" already exists. Save canceled.`);
    return null;
  }

  return trimmed;
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
  /** Load a preset by stable id, returns the full entry */
  loadById: (id: string, version?: number) => Promise<PresetEntry | null>;
  /** Delete a preset by name (only user presets) */
  remove: (name: string) => Promise<boolean>;
  /** Rename a preset in place without creating a new preset id/version */
  rename: (name: string, nextName: string, identity?: PresetRenameIdentity) => Promise<PresetEntry | null>;
  /** Refresh the preset list from the store */
  refresh: () => Promise<void>;
  /** Extract params from state for the current level/scope */
  extract: (state: SliderState) => Record<string, unknown>;
  /** Apply preset data to state, returning new state */
  apply: (state: SliderState, data: Record<string, unknown>) => SliderState;
  /** Update metadata on a preset without creating a new version */
  updateMetadata: (name: string, meta: Partial<PresetIdentityMetadata> & { tags?: string[] }) => Promise<void>;
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
      const sharedCloudOnly = isSharedPresetCloudOnlyMode();
      const visibleList = sharedCloudOnly
        ? list.filter((preset) => !!preset.remoteId)
        : list;
      setPresets(visibleList);
      setFamilies(buildPresetFamilies(visibleList));
      if (sharedCloudOnly && visibleList.length === 0 && emptySharedListRetryCountRef.current < 4) {
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
      if (isSharedPresetCloudOnlyMode() && emptySharedListRetryCountRef.current < 4) {
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
    const requestedName = name.trim();
    if (!requestedName) return;
    const nameConflict = findActiveNameConflict(presets, requestedName);
    const targetName = nameConflict
      ? chooseDuplicatePresetNameAction(requestedName, nameConflict.name, presets)
      : requestedName;
    if (!targetName) return;

    const data = options?.customExtract
      ? options.customExtract(state)
      : (paramLevel >= 3 ? extractCascade(state, paramLevel, scope) : extractParams(state, paramLevel, scope));
    const now = Date.now();

    // Check if preset already exists → push new version
    const activeStore = getPresetStore();
    const existing = await activeStore.load(type, targetName, storeScope);
    const shouldForkExisting = !SHARED_PRESET_TEST_MODE && !!existing && (existing.author === 'factory' || existing.library === 'stock');
    const existingVersion = existing?.versions.find(v => v.v === existing.currentVersion)
      || existing?.versions[existing.versions.length - 1];
    // Merge: start with preserved metadata from prior version, then overlay any caller-supplied fields
    const previousMetadata = extractPresetVersionMetadata(existingVersion);
    const preserved = type === 'journey'
      ? previousMetadata
      : stripInternalDerivedPresetRefs(previousMetadata);
    const mergedMetadata = metadata
      ? { ...(preserved || {}), ...metadata }
      : preserved;
    const preservedMetadata = type === 'journey'
      ? mergedMetadata
      : stripInternalDerivedPresetRefs(mergedMetadata);
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
        identity?.rating === undefined &&
        identity?.visibility === undefined;
      const normalizedTags = tags === undefined ? undefined : normalizePresetTags(tags);
      const tagsUnchanged = normalizedTags === undefined
        || presetValuesEqual(existing.tags ?? [], normalizedTags);

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
      if (normalizedTags !== undefined) existing.tags = normalizedTags;
      if (identity?.creator !== undefined) existing.creator = identity.creator;
      if (identity?.description !== undefined) existing.description = identity.description;
      if (identity?.familyId !== undefined) existing.familyId = identity.familyId;
      if (identity?.familyName !== undefined) existing.familyName = identity.familyName;
      if (identity?.variantId !== undefined) existing.variantId = identity.variantId;
      if (identity?.variantName !== undefined) existing.variantName = identity.variantName;
      if (identity?.variantRank !== undefined) existing.variantRank = identity.variantRank;
      if (identity?.rating !== undefined) existing.rating = identity.rating;
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
        name: targetName,
        author: 'user',
        library: 'user',
        creator: identity?.creator ?? existing?.creator,
        description: identity?.description ?? existing?.description,
        visibility: identity?.visibility ?? (SHARED_PRESET_TEST_MODE ? 'public' : (shouldForkExisting ? 'private' : existing?.visibility) ?? 'private'),
        familyId: identity?.familyId ?? existing?.familyId,
        familyName: identity?.familyName ?? existing?.familyName ?? targetName,
        variantId: identity?.variantId ?? existing?.variantId,
        variantName: identity?.variantName ?? existing?.variantName ?? targetName,
        variantRank: identity?.variantRank ?? existing?.variantRank,
        rating: identity?.rating ?? existing?.rating,
        tags: tags !== undefined ? normalizePresetTags(tags) : existing?.tags || [],
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
  }, [type, scope, storeScope, paramLevel, store, refresh, options, presets]);

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

  const loadById = useCallback(async (id: string, version?: number): Promise<PresetEntry | null> => {
    const activeStore = getPresetStore();
    const entry = await activeStore.loadById(id, version);
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
  }, [store]);

  const remove = useCallback(async (name: string): Promise<boolean> => {
    if (!PRESET_DELETE_ENABLED) return false;
    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, name, storeScope);
    if (!entry) return false;
    if (!SHARED_PRESET_TEST_MODE && (entry.library === 'stock' || entry.author === 'factory')) return false;
    try {
      if (type === 'state') {
        const impacts = await findJourneyPresetsReferencingStatePreset(entry, activeStore);
        if (impacts.length > 0) {
          const blocked = impacts
            .filter((impact) => impact.entry.library === 'stock' || impact.entry.author === 'factory')
            .map((impact) => impact.journeyName);
          if (blocked.length > 0) {
            window.alert(
              `Cannot delete "${name}" because it is used by read-only journey preset${blocked.length === 1 ? '' : 's'}:\n\n${blocked.join('\n')}`,
            );
            return false;
          }
          const journeyNames = impacts.map((impact) => impact.journeyName);
          const confirmed = window.confirm(
            `Delete "${name}"?\n\nThis state preset is used by ${journeyNames.length} journey preset${journeyNames.length === 1 ? '' : 's'}:\n\n${journeyNames.join('\n')}\n\nDeleting it will remove the referenced node from ${journeyNames.length === 1 ? 'that journey' : 'those journeys'}.`,
          );
          if (!confirmed) return false;
        }
        if (impacts.length > 0) {
          const cleanup = await cleanupJourneyRefsForDeletedStatePreset(entry, activeStore);
          if (cleanup.blocked.length > 0) {
            window.alert(
              `Cannot delete "${name}" because these journey presets could not be updated:\n\n${cleanup.blocked.join('\n')}`,
            );
            await refresh();
            return false;
          }
        }
      }
      await activeStore.delete(type, name, storeScope);
      await refresh();
      return true;
    } catch (error) {
      console.warn('Failed to delete preset:', error);
      await refresh();
      return false;
    }
  }, [type, storeScope, store, refresh]);

  const rename = useCallback(async (
    name: string,
    nextName: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> => {
    const currentName = name.trim();
    const trimmedName = nextName.trim();
    if (!currentName || !trimmedName) return null;
    if (currentName === trimmedName) return load(currentName);

    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, currentName, storeScope);
    if (!entry) return null;
    if (!SHARED_PRESET_TEST_MODE && (entry.library === 'stock' || entry.author === 'factory')) {
      if (typeof window !== 'undefined') {
        window.alert(`Cannot rename read-only preset "${currentName}".`);
      }
      return null;
    }

    const nameConflict = findActiveNameConflict(presets, trimmedName);
    if (nameConflict && normalizePresetNameKey(nameConflict.name) !== normalizePresetNameKey(currentName)) {
      if (typeof window !== 'undefined') {
        window.alert(`A preset named "${nameConflict.name}" already exists. Rename canceled.`);
      }
      return null;
    }

    const renamed = await activeStore.rename(type, currentName, trimmedName, storeScope, identity);
    await refresh();
    return renamed;
  }, [type, storeScope, store, refresh, load, presets]);

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

  const updateMetadata = useCallback(async (name: string, meta: Partial<PresetIdentityMetadata> & { tags?: string[] }) => {
    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, name, storeScope);
    if (!entry) return;
    if (meta.rating !== undefined) entry.rating = meta.rating;
    if (meta.description !== undefined) entry.description = meta.description;
    if (meta.visibility !== undefined) entry.visibility = meta.visibility;
    else if (SHARED_PRESET_TEST_MODE) entry.visibility = 'public';
    if (meta.creator !== undefined) entry.creator = meta.creator;
    if (meta.tags !== undefined) entry.tags = normalizePresetTags(meta.tags);
    entry.updatedAt = Date.now();
    await activeStore.save(entry);
    await refresh();
  }, [type, storeScope, store, refresh]);

  return { presets, families, loading, save, load, loadById, remove, rename, refresh, extract, apply, updateMetadata };
}
