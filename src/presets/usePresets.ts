// src/presets/usePresets.ts
// Phase 1 — React hook for preset CRUD at any level.

import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type {
  PresetEntry,
  PresetFamilySummary,
  PresetLevel,
  PresetMetadataPatch,
  PresetRenameIdentity,
  PresetSaveIdentity,
  PresetSummary,
  PresetVersionMetadata,
} from './types';
import { getPresetStore, PresetMetadataConflictError, subscribePresetStore } from './PresetStore';
import { extractParams, applyParams, extractCascade, applyCascade } from './codec';
import { buildPresetFamilies } from './catalog';
import { normalizePresetTags } from './presetPool';
import { getPresetCommandService } from './presetCommands';
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

function findActiveNameConflict(presets: PresetSummary[], name: string): PresetSummary | null {
  const nameKey = normalizePresetNameKey(name);
  return presets.find((preset) => normalizePresetNameKey(preset.name) === nameKey) ?? null;
}

function samePresetList(left: readonly PresetSummary[], right: readonly PresetSummary[]): boolean {
  if (left === right || left.length === right.length && left.every((preset, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && preset.id === candidate.id
      && preset.name === candidate.name
      && preset.remoteId === candidate.remoteId
      && preset.library === candidate.library
      && preset.updatedAt === candidate.updatedAt
      && preset.updatedAtRevision === candidate.updatedAtRevision
      && preset.currentVersion === candidate.currentVersion
      && preset.versionCount === candidate.versionCount;
  })) {
    return true;
  }
  return false;
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
  ) => Promise<PresetEntry | null>;
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
  updateMetadata: (name: string, meta: PresetMetadataPatch) => Promise<boolean>;
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
  const [loading, setLoading] = useState(true);
  const emptySharedListRetryCountRef = useRef(0);
  const sharedListRetryTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const listScopeGenerationRef = useRef(0);
  const store = useSyncExternalStore(subscribePresetStore, getPresetStore, getPresetStore);
  const commandService = useMemo(() => getPresetCommandService(store), [store]);
  const paramLevel = levelToParamLevel(type);
  const storeScope = scope;
  const families = useMemo(() => buildPresetFamilies(presets), [presets]);

  const clearSharedListRetry = useCallback(() => {
    const timer = sharedListRetryTimerRef.current;
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    sharedListRetryTimerRef.current = null;
  }, []);

  const refresh = useCallback((): Promise<void> => {
    const generation = listScopeGenerationRef.current;
    const inFlight = refreshInFlightRef.current;
    if (inFlight?.generation === generation) return inFlight.promise;

    clearSharedListRetry();
    const scheduleSharedListRetry = () => {
      if (
        !isSharedPresetCloudOnlyMode()
        || emptySharedListRetryCountRef.current >= 4
        || sharedListRetryTimerRef.current !== null
        || typeof window === 'undefined'
      ) {
        return;
      }
      const retryAttempt = ++emptySharedListRetryCountRef.current;
      sharedListRetryTimerRef.current = window.setTimeout(() => {
        sharedListRetryTimerRef.current = null;
        if (
          listScopeGenerationRef.current !== generation
          || !isSharedPresetCloudOnlyMode()
        ) {
          return;
        }
        void refresh();
      }, retryAttempt * 1500);
    };

    const request = (async () => {
      if (listScopeGenerationRef.current === generation) setLoading(true);
      try {
        const list = await store.list(type, storeScope);
        if (listScopeGenerationRef.current !== generation) return;

        const sharedCloudOnly = isSharedPresetCloudOnlyMode();
        const visibleList = sharedCloudOnly
          ? list.filter((preset) => !!preset.remoteId)
          : list;
        setPresets(current => samePresetList(current, visibleList) ? current : visibleList);
        if (sharedCloudOnly && visibleList.length === 0) {
          scheduleSharedListRetry();
        } else if (visibleList.length > 0) {
          emptySharedListRetryCountRef.current = 0;
          clearSharedListRetry();
        }
      } catch (error) {
        if (listScopeGenerationRef.current !== generation) return;
        console.warn('Failed to load preset list:', error);
        scheduleSharedListRetry();
      } finally {
        if (listScopeGenerationRef.current === generation) setLoading(false);
      }
    })();

    refreshInFlightRef.current = { generation, promise: request };
    void request.finally(() => {
      if (refreshInFlightRef.current?.promise === request) {
        refreshInFlightRef.current = null;
      }
    });
    return request;
  }, [clearSharedListRetry, store, storeScope, type]);

  useEffect(() => {
    const generation = ++listScopeGenerationRef.current;
    emptySharedListRetryCountRef.current = 0;
    clearSharedListRetry();
    return () => {
      if (listScopeGenerationRef.current === generation) {
        listScopeGenerationRef.current += 1;
      }
      clearSharedListRetry();
    };
  }, [clearSharedListRetry, store, storeScope, type]);

  // Load on mount and when scope changes
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (
    name: string,
    state: SliderState,
    note?: string,
    tags?: string[],
    metadata?: PresetVersionMetadata,
    identity?: PresetSaveIdentity,
  ): Promise<PresetEntry | null> => {
    const requestedName = name.trim();
    if (!requestedName) return null;
    const nameConflict = findActiveNameConflict(presets, requestedName);
    const targetName = nameConflict
      ? chooseDuplicatePresetNameAction(requestedName, nameConflict.name, presets)
      : requestedName;
    if (!targetName) return null;

    const data = options?.customExtract
      ? options.customExtract(state)
      : (paramLevel >= 3 ? extractCascade(state, paramLevel, scope) : extractParams(state, paramLevel, scope));
    const result = await commandService.save({
      type,
      scope: storeScope,
      name: targetName,
      data,
      note,
      tags,
      metadata,
      identity: {
        ...identity,
        ...(SHARED_PRESET_TEST_MODE && identity?.visibility === undefined
          ? { visibility: 'public' as const }
          : {}),
      },
      forkReadOnly: !SHARED_PRESET_TEST_MODE,
    });
    let savedEntry = result.entry;
    if (result.changed && result.kind === 'create') {
      const [canonicalEntry] = await Promise.all([
        store.load(type, targetName, storeScope),
        refresh(),
      ]);
      savedEntry = canonicalEntry ?? savedEntry;
    } else if (result.changed) {
      await refresh();
    }
    return savedEntry;
  }, [type, scope, storeScope, paramLevel, commandService, refresh, options, presets]);

  const load = useCallback(async (name: string, version?: number): Promise<PresetEntry | null> => {
    const activeStore = getPresetStore();
    const entry = await activeStore.load(type, name, storeScope, version);
    // Lazy migration is serialized with saves for the same logical preset.
    if (entry && !entry.remoteId && entry.author === 'user' && entry.versions.length > 1) {
      const needsCompression = entry.versions.some(
        (v, i) => i > 0 && !v._isDelta
      );
      if (needsCompression) {
        void commandService.compactLocalVersions(type, name, storeScope)
          .catch((error) => console.warn('Failed to compact local preset versions:', error));
      }
    }
    return entry;
  }, [type, storeScope, store, commandService]);

  const loadById = useCallback(async (id: string, version?: number): Promise<PresetEntry | null> => {
    const activeStore = getPresetStore();
    const entry = await activeStore.loadById(id, version);
    if (entry && !entry.remoteId && entry.author === 'user' && entry.versions.length > 1) {
      const needsCompression = entry.versions.some(
        (v, i) => i > 0 && !v._isDelta
      );
      if (needsCompression) {
        const entryScope = entry.scope ?? entry.engine ?? entry.source;
        void commandService.compactLocalVersions(entry.type, entry.name, entryScope)
          .catch((error) => console.warn('Failed to compact local preset versions:', error));
      }
    }
    return entry;
  }, [store, commandService]);

  const remove = useCallback(async (name: string): Promise<boolean> => {
    if (!PRESET_DELETE_ENABLED) return false;
    let refreshRequired = false;
    try {
      const removed = await commandService.remove(type, name, storeScope, async () => {
        const entry = await store.load(type, name, storeScope);
        if (!entry) return false;
        if (!SHARED_PRESET_TEST_MODE && (entry.library === 'stock' || entry.author === 'factory')) return false;

        if (type === 'state') {
          const impacts = await findJourneyPresetsReferencingStatePreset(entry, store);
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
            // Reuse the confirmed candidate list, but cleanup re-loads each
            // journey under its own command key before changing it.
            const cleanup = await cleanupJourneyRefsForDeletedStatePreset(entry, store, impacts);
            if (cleanup.blocked.length > 0) {
              window.alert(
                `Cannot delete "${name}" because these journey presets could not be updated:\n\n${cleanup.blocked.join('\n')}`,
              );
              refreshRequired = true;
              return false;
            }
          }
        }
        refreshRequired = true;
        return true;
      });
      if (refreshRequired) await refresh();
      return removed;
    } catch (error) {
      console.warn('Failed to delete preset:', error);
      await refresh();
      return false;
    }
  }, [type, storeScope, store, commandService, refresh]);

  const rename = useCallback(async (
    name: string,
    nextName: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> => {
    const currentName = name.trim();
    const trimmedName = nextName.trim();
    if (!currentName || !trimmedName) return null;
    if (currentName === trimmedName) return load(currentName);

    const nameConflict = findActiveNameConflict(presets, trimmedName);
    if (nameConflict && normalizePresetNameKey(nameConflict.name) !== normalizePresetNameKey(currentName)) {
      if (typeof window !== 'undefined') {
        window.alert(`A preset named "${nameConflict.name}" already exists. Rename canceled.`);
      }
      return null;
    }

    const renamed = await commandService.rename(
      type,
      currentName,
      trimmedName,
      storeScope,
      identity,
      async () => {
        const entry = await store.load(type, currentName, storeScope);
        if (!entry) return false;
        if (!SHARED_PRESET_TEST_MODE && (entry.library === 'stock' || entry.author === 'factory')) {
          if (typeof window !== 'undefined') {
            window.alert(`Cannot rename read-only preset "${currentName}".`);
          }
          return false;
        }
        return true;
      },
    );
    if (renamed) await refresh();
    return renamed;
  }, [type, storeScope, store, commandService, refresh, load, presets]);

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

  const updateMetadata = useCallback(async (name: string, meta: PresetMetadataPatch): Promise<boolean> => {
    const metadata = {
      ...meta,
      ...(meta.tags !== undefined ? { tags: normalizePresetTags(meta.tags) } : {}),
      ...(SHARED_PRESET_TEST_MODE && meta.visibility === undefined ? { visibility: 'public' as const } : {}),
    };
    const target = findActiveNameConflict(presets, name);
    const updateOptions = target
      ? {
        ...(target.remoteId ? { targetId: target.remoteId } : {}),
        ...(target.updatedAtRevision ? { expectedUpdatedAt: target.updatedAtRevision } : {}),
      }
      : undefined;
    try {
      const updated = await commandService.updateMetadata(type, name, metadata, storeScope, updateOptions);
      if (!updated) {
        await refresh();
        return false;
      }
      await refresh();
      return true;
    } catch (error) {
      if (error instanceof PresetMetadataConflictError) {
        await refresh();
      }
      throw error;
    }
  }, [type, storeScope, commandService, presets, refresh]);

  return { presets, families, loading, save, load, loadById, remove, rename, refresh, extract, apply, updateMetadata };
}
