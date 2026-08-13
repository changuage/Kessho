import { applyCascade, extractCascade, getVersionData, type ParamLevel } from './codec';
import { getPresetScope, presetValuesEqual } from './presetUtils';
import { completeCanonicalPresetState } from './presetStateCompatibility';
import {
  extractOptimizedStatePresetData,
  hydrateOptimizedStatePresetData,
} from './statePresetOptimization';
import { isStatePresetDiffKeyActive, normalizeStatePresetDiffData } from './statePresetDiffs';
import { sanitizePresetParameterBehaviorMetadata } from './versionMetadataHelpers';
import type { PresetEntry, PresetLevel, PresetVersionMetadata } from './types';
import { DEFAULT_STATE } from '../ui/state';

type PresetIdentity = Pick<PresetEntry, 'type' | 'scope' | 'engine' | 'source'>;

export interface PresetDiffSnapshot {
  data: Record<string, unknown>;
  metadata?: PresetVersionMetadata;
}

function paramLevel(type: PresetLevel): ParamLevel | null {
  if (type === 'state') return 4;
  if (type === 'source') return 3;
  if (type === 'kit') return 2;
  if (type === 'engine') return 1;
  return null;
}

function normalizeDiffData(
  preset: PresetIdentity,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (preset.type === 'state') {
    const completed = completeCanonicalPresetState(hydrateOptimizedStatePresetData(data));
    return normalizeStatePresetDiffData(extractOptimizedStatePresetData(completed));
  }

  const level = paramLevel(preset.type);
  if (level === null) return data;
  const scope = getPresetScope(preset, preset.type);
  const applied = applyCascade(DEFAULT_STATE, data, level, scope);
  return extractCascade(applied, level, scope);
}

/** Compare authored preset meaning rather than sparse/full storage representation. */
export function getSemanticPresetDiffKeys(
  preset: PresetIdentity,
  left: PresetDiffSnapshot,
  right: PresetDiffSnapshot,
): string[] {
  const leftData = normalizeDiffData(preset, left.data);
  const rightData = normalizeDiffData(preset, right.data);
  const leftBehavior = sanitizePresetParameterBehaviorMetadata(left.metadata);
  const rightBehavior = sanitizePresetParameterBehaviorMetadata(right.metadata);
  const result: string[] = [];

  for (const key of new Set([...Object.keys(leftData), ...Object.keys(rightData)])) {
    const leftActive = preset.type !== 'state' || isStatePresetDiffKeyActive(leftData, key);
    const rightActive = preset.type !== 'state' || isStatePresetDiffKeyActive(rightData, key);
    const leftMode = leftActive ? leftBehavior.sliderModes?.[key] : undefined;
    const rightMode = rightActive ? rightBehavior.sliderModes?.[key] : undefined;

    if (leftMode || rightMode) {
      const leftValue = leftData[key];
      const rightValue = rightData[key];
      const leftRange = leftMode
        ? leftBehavior.dualRanges?.[key]
        : typeof leftValue === 'number' ? { min: leftValue, max: leftValue } : undefined;
      const rightRange = rightMode
        ? rightBehavior.dualRanges?.[key]
        : typeof rightValue === 'number' ? { min: rightValue, max: rightValue } : undefined;
      if (leftMode !== rightMode || !presetValuesEqual(leftRange, rightRange)) result.push(key);
      continue;
    }

    if (!presetValuesEqual(leftData[key], rightData[key])) result.push(key);
  }

  return result;
}

export function getPresetVersionDiffKeys(
  entry: PresetEntry,
  leftVersion: number,
  rightVersion: number,
): string[] {
  const left = entry.versions.find(version => version.v === leftVersion);
  const right = entry.versions.find(version => version.v === rightVersion);
  const leftData = getVersionData(entry, leftVersion);
  const rightData = getVersionData(entry, rightVersion);
  if (!left || !right || !leftData || !rightData) return [];
  return getSemanticPresetDiffKeys(
    entry,
    { data: leftData, metadata: left },
    { data: rightData, metadata: right },
  );
}
