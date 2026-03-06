// src/presets/usePresets.ts
// Phase 1 — React hook for preset CRUD at any level.

import { useState, useCallback, useEffect } from 'react';
import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import { getPresetStore } from './PresetStore';
import { extractParams, applyParams } from './codec';
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
  /** Whether the preset list is loading */
  loading: boolean;
  /** Save current state as a new preset (or push a new version if name matches) */
  save: (name: string, state: SliderState, note?: string, tags?: string[]) => Promise<void>;
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
}

/**
 * React hook for preset CRUD at a specific level and optional engine/source scope.
 *
 * @param type   - Preset level ('engine', 'kit', 'source', 'state', 'journey')
 * @param scope  - For L1: engine name (e.g. 'pad1', 'drumKick'). For L2/L3: source (e.g. 'synth', 'drums')
 */
export function usePresets(type: PresetLevel, scope?: string): UsePresetsResult {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const store = getPresetStore();
  const paramLevel = levelToParamLevel(type);

  // Determine engine/source from scope depending on level
  const engine = type === 'engine' ? scope : undefined;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await store.list(type, engine);
      setPresets(list);
    } catch (e) {
      console.warn('Failed to load preset list:', e);
    }
    setLoading(false);
  }, [type, engine, store]);

  // Load on mount and when scope changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (
    name: string,
    state: SliderState,
    note?: string,
    tags?: string[],
  ) => {
    const data = extractParams(state, paramLevel, scope);
    const now = Date.now();

    // Check if preset already exists → push new version
    const existing = await store.load(type, name, engine);
    if (existing && existing.author === 'user') {
      const maxV = Math.max(...existing.versions.map(v => v.v));
      existing.versions.push({
        v: maxV + 1,
        note: note || '',
        timestamp: now,
        data,
      });
      existing.currentVersion = maxV + 1;
      existing.updatedAt = now;
      if (tags) existing.tags = tags;
      await store.save(existing);
    } else {
      // New preset (or saving over factory creates user copy)
      const entry: PresetEntry = {
        type,
        engine,
        source: type !== 'engine' ? scope : undefined,
        name: existing?.author === 'factory' ? `${name} (Custom)` : name,
        author: 'user',
        tags: tags || [],
        versions: [{
          v: 1,
          note: note || '',
          timestamp: now,
          data,
        }],
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      await store.save(entry);
    }

    await refresh();
  }, [type, scope, engine, paramLevel, store, refresh]);

  const load = useCallback(async (name: string, _version?: number): Promise<PresetEntry | null> => {
    return store.load(type, name, engine);
  }, [type, engine, store]);

  const remove = useCallback(async (name: string): Promise<boolean> => {
    const entry = await store.load(type, name, engine);
    if (!entry) return false;
    if (entry.author === 'factory') return false; // Can't delete factory presets
    await store.delete(type, name, engine);
    await refresh();
    return true;
  }, [type, engine, store, refresh]);

  const extract = useCallback((state: SliderState): Record<string, unknown> => {
    return extractParams(state, paramLevel, scope);
  }, [paramLevel, scope]);

  const apply = useCallback((state: SliderState, data: Record<string, unknown>): SliderState => {
    return applyParams(state, data, paramLevel, scope);
  }, [paramLevel, scope]);

  return { presets, loading, save, load, remove, refresh, extract, apply };
}
