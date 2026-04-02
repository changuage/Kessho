// src/presets/usePresetVersioning.ts
// Phase 8 — Version navigation hook for stepping through preset versions.
// Phase 9 — Modified (dirty) flag detection.

import { useState, useCallback, useMemo } from 'react';
import type { PresetEntry, PresetVersion, PresetVersionMetadata } from './types';
import { extractParams } from './codec';
import { comparePresetVersions } from './presetUtils';
import type { ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';

export interface UsePresetVersioningResult {
  /** Currently viewed version number */
  currentVersion: number;
  /** Total number of versions */
  totalVersions: number;
  /** Can step backward */
  canStepBack: boolean;
  /** Can step forward */
  canStepForward: boolean;
  /** Step to previous version; returns its data */
  stepBack: () => PresetVersion | null;
  /** Step to next version; returns its data */
  stepForward: () => PresetVersion | null;
  /** Get data for a specific version */
  getVersion: (v: number) => PresetVersion | null;
  /** Get list of param keys that changed between current and another version */
  diffWith: (otherVersion: number) => string[];
  /** Whether the current state differs from the loaded version (dirty flag) */
  isDirty: boolean;
  /** Set the loaded entry (call when a preset is loaded) */
  setEntry: (entry: PresetEntry | null) => void;
}

/**
 * Hook for version navigation and dirty-flag detection on a loaded preset.
 *
 * @param state      Current SliderState
 * @param paramLevel The param level for dirty detection (1=engine, 2=kit, etc.)
 * @param scope      The scope for dirty detection ('pad1', 'drumKit', etc.)
 */
export function usePresetVersioning(
  state: SliderState,
  paramLevel: ParamLevel,
  scope?: string,
  currentMetadata?: PresetVersionMetadata,
): UsePresetVersioningResult {
  const [entry, setEntry] = useState<PresetEntry | null>(null);
  const [viewingVersion, setViewingVersion] = useState(0);

  const versions = entry?.versions || [];
  const totalVersions = versions.length;
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => a.v - b.v),
    [versions],
  );

  const currentVersion = viewingVersion || entry?.currentVersion || 0;
  const currentIdx = sortedVersions.findIndex(v => v.v === currentVersion);

  const canStepBack = currentIdx > 0;
  const canStepForward = currentIdx < sortedVersions.length - 1;

  const stepBack = useCallback((): PresetVersion | null => {
    if (!canStepBack) return null;
    const prev = sortedVersions[currentIdx - 1];
    if (!prev) return null;
    setViewingVersion(prev.v);
    return prev;
  }, [canStepBack, currentIdx, sortedVersions]);

  const stepForward = useCallback((): PresetVersion | null => {
    if (!canStepForward) return null;
    const next = sortedVersions[currentIdx + 1];
    if (!next) return null;
    setViewingVersion(next.v);
    return next;
  }, [canStepForward, currentIdx, sortedVersions]);

  const getVersion = useCallback((v: number): PresetVersion | null => {
    return sortedVersions.find(ver => ver.v === v) || null;
  }, [sortedVersions]);

  const diffWith = useCallback((otherVersion: number): string[] => {
    const current = sortedVersions.find(v => v.v === currentVersion);
    const other = sortedVersions.find(v => v.v === otherVersion);
    if (!current || !other) return [];

    return comparePresetVersions(current, other);
  }, [currentVersion, sortedVersions]);

  // Phase 9: Dirty flag — compare current state params with loaded version
  const isDirty = useMemo(() => {
    if (!entry) return false;
    const savedVersion = sortedVersions.find(v => v.v === currentVersion);
    if (!savedVersion) return false;

    const currentParams = extractParams(state, paramLevel, scope);
    const currentSnapshot: PresetVersion = {
      v: currentVersion,
      note: '',
      timestamp: savedVersion.timestamp,
      data: currentParams,
    };
    if (currentMetadata) {
      Object.assign(currentSnapshot, currentMetadata);
      return comparePresetVersions(currentSnapshot, savedVersion).length > 0;
    }

    const savedDataOnly: PresetVersion = {
      v: savedVersion.v,
      note: savedVersion.note,
      timestamp: savedVersion.timestamp,
      data: savedVersion.data,
    };
    return comparePresetVersions(currentSnapshot, savedDataOnly).length > 0;
  }, [entry, state, paramLevel, scope, currentVersion, sortedVersions, currentMetadata]);

  // Wrap setEntry to also reset viewing version
  const handleSetEntry = useCallback((newEntry: PresetEntry | null) => {
    setEntry(newEntry);
    setViewingVersion(newEntry?.currentVersion || 0);
  }, []);

  return {
    currentVersion,
    totalVersions,
    canStepBack,
    canStepForward,
    stepBack,
    stepForward,
    getVersion,
    diffWith,
    isDirty,
    setEntry: handleSetEntry,
  };
}
