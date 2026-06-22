import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { PresetLevel, PresetPoolMetadata } from './types';
import {
  createEmptyPresetPool,
  filterPresetPoolCandidates,
  getDefaultPresetPoolIds,
  normalizePresetPoolMetadata,
  normalizePresetPoolId,
  presetPoolCandidateMatches,
  resolvePresetPoolKey,
  type PresetPoolCandidate,
} from './presetPool';

interface PresetPoolContextValue {
  presetPool: PresetPoolMetadata;
  setPresetPool: (presetPool: PresetPoolMetadata) => void;
  setPoolIds: (poolKey: string, ids: string[]) => void;
  resetPoolIds: (poolKey: string, ids: string[]) => void;
}

const fallbackPresetPool = createEmptyPresetPool();

const PresetPoolContext = createContext<PresetPoolContextValue>({
  presetPool: fallbackPresetPool,
  setPresetPool: () => {},
  setPoolIds: () => {},
  resetPoolIds: () => {},
});

export interface PresetPoolProviderProps {
  value: PresetPoolMetadata;
  onChange: (presetPool: PresetPoolMetadata) => void;
  children: React.ReactNode;
}

function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const nextIds: string[] = [];
  for (const rawId of ids) {
    const id = normalizePresetPoolId(rawId);
    const key = id?.toLowerCase();
    if (!id || !key || seen.has(key)) continue;
    seen.add(key);
    nextIds.push(id);
  }
  return nextIds;
}

export function PresetPoolProvider({ value, onChange, children }: PresetPoolProviderProps): JSX.Element {
  const presetPool = useMemo(() => normalizePresetPoolMetadata(value) ?? createEmptyPresetPool(), [value]);

  const setPresetPool = useCallback((nextPool: PresetPoolMetadata) => {
    onChange(normalizePresetPoolMetadata(nextPool) ?? createEmptyPresetPool());
  }, [onChange]);

  const setPoolIds = useCallback((poolKey: string, ids: string[]) => {
    const key = normalizePresetPoolId(poolKey);
    if (!key) return;
    const nextIds = normalizeIds(ids);
    onChange({
      version: 1,
      pools: {
        ...presetPool.pools,
        [key]: nextIds,
      },
    });
  }, [onChange, presetPool.pools]);

  const resetPoolIds = useCallback((poolKey: string, ids: string[]) => {
    const key = normalizePresetPoolId(poolKey);
    if (!key) return;
    const nextIds = normalizeIds(ids);
    onChange({
      version: 1,
      pools: {
        ...presetPool.pools,
        [key]: nextIds,
      },
    });
  }, [onChange, presetPool.pools]);

  const contextValue = useMemo<PresetPoolContextValue>(() => ({
    presetPool,
    setPresetPool,
    setPoolIds,
    resetPoolIds,
  }), [presetPool, resetPoolIds, setPoolIds, setPresetPool]);

  return (
    <PresetPoolContext.Provider value={contextValue}>
      {children}
    </PresetPoolContext.Provider>
  );
}

export function usePresetPool(): PresetPoolContextValue {
  return useContext(PresetPoolContext);
}

export function usePresetPoolCandidates(
  level: PresetLevel,
  scope: string | undefined,
  candidates: readonly PresetPoolCandidate[],
  keepIds: readonly string[] = [],
): {
  poolKey: string | null;
  poolIds: string[];
  defaultIds: string[];
  filteredCandidates: PresetPoolCandidate[];
  setPoolIds: (ids: string[]) => void;
  resetPoolIds: () => void;
  candidateInPool: (candidate: PresetPoolCandidate) => boolean;
} {
  const { presetPool, setPoolIds, resetPoolIds } = usePresetPool();
  const poolKey = useMemo(() => resolvePresetPoolKey(level, scope), [level, scope]);
  const hasStoredPool = Boolean(poolKey && Object.prototype.hasOwnProperty.call(presetPool.pools, poolKey));
  const storedPoolIds = poolKey ? presetPool.pools[poolKey] ?? [] : [];
  const defaultIds = useMemo(
    () => (poolKey ? getDefaultPresetPoolIds(poolKey, candidates) : []),
    [candidates, poolKey],
  );
  const poolIds = hasStoredPool ? storedPoolIds : defaultIds;

  useEffect(() => {
    if (!poolKey || hasStoredPool || candidates.length === 0) return;
    setPoolIds(poolKey, defaultIds);
  }, [candidates.length, defaultIds, hasStoredPool, poolKey, setPoolIds]);

  const filteredCandidates = useMemo(
    () => (poolKey ? filterPresetPoolCandidates(candidates, poolIds, keepIds) : [...candidates]),
    [candidates, keepIds, poolIds, poolKey],
  );

  const setCurrentPoolIds = useCallback((ids: string[]) => {
    if (!poolKey) return;
    setPoolIds(poolKey, ids);
  }, [poolKey, setPoolIds]);

  const resetCurrentPoolIds = useCallback(() => {
    if (!poolKey) return;
    resetPoolIds(poolKey, defaultIds);
  }, [defaultIds, poolKey, resetPoolIds]);

  const candidateInPool = useCallback((candidate: PresetPoolCandidate) => (
    presetPoolCandidateMatches(candidate, poolIds)
  ), [poolIds]);

  return {
    poolKey,
    poolIds,
    defaultIds,
    filteredCandidates,
    setPoolIds: setCurrentPoolIds,
    resetPoolIds: resetCurrentPoolIds,
    candidateInPool,
  };
}
