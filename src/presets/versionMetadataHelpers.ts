import { getVersionData } from './codec';
import { extractPresetVersionMetadata } from './presetUtils';
import type { PresetEntry, PresetVersionMetadata } from './types';

function cloneJson<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON clone.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildPresetVersionMetadata(
  source: Partial<PresetVersionMetadata> | null | undefined,
): PresetVersionMetadata | undefined {
  if (!source) return undefined;

  const metadata: PresetVersionMetadata = {};
  let hasMetadata = false;

  const filteredSliderModes = source.sliderModes
    ? Object.fromEntries(
        Object.entries(source.sliderModes).filter(([, mode]) => mode !== 'single'),
      )
    : undefined;

  if (source.dualRanges) {
    const nextDualRanges = filteredSliderModes
      ? Object.fromEntries(
          Object.entries(source.dualRanges).filter(([key]) => key in filteredSliderModes),
        )
      : source.dualRanges;
    if (Object.keys(nextDualRanges).length > 0) {
      metadata.dualRanges = cloneJson(nextDualRanges);
      hasMetadata = true;
    }
  }

  if (filteredSliderModes && Object.keys(filteredSliderModes).length > 0) {
    metadata.sliderModes = cloneJson(filteredSliderModes);
    hasMetadata = true;
  }

  if (source.drumEvolveConfigs && source.drumEvolveConfigs.length > 0) {
    metadata.drumEvolveConfigs = cloneJson(source.drumEvolveConfigs);
    hasMetadata = true;
  }

  if (source.synthEvolveConfigs && source.synthEvolveConfigs.length > 0) {
    metadata.synthEvolveConfigs = cloneJson(source.synthEvolveConfigs);
    hasMetadata = true;
  }

  if (source.drumStepOverrides && Object.keys(source.drumStepOverrides).length > 0) {
    metadata.drumStepOverrides = cloneJson(source.drumStepOverrides);
    hasMetadata = true;
  }

  if (source.synthStepOverrides && Object.keys(source.synthStepOverrides).length > 0) {
    metadata.synthStepOverrides = cloneJson(source.synthStepOverrides);
    hasMetadata = true;
  }

  if (source.drumSubLaneStates && source.drumSubLaneStates.length > 0) {
    metadata.drumSubLaneStates = cloneJson(source.drumSubLaneStates);
    hasMetadata = true;
  }

  if (source.synthSubLaneStates && source.synthSubLaneStates.length > 0) {
    metadata.synthSubLaneStates = cloneJson(source.synthSubLaneStates);
    hasMetadata = true;
  }

  if (source.synthPitchBindingModes && source.synthPitchBindingModes.length > 0) {
    metadata.synthPitchBindingModes = cloneJson(source.synthPitchBindingModes);
    hasMetadata = true;
  }

  return hasMetadata ? metadata : undefined;
}

export function getPresetVersionSnapshot(
  entry: PresetEntry,
  versionNum?: number,
): { data: Record<string, unknown>; metadata?: PresetVersionMetadata } | null {
  const version = versionNum !== undefined
    ? entry.versions.find(candidate => candidate.v === versionNum)
    : (entry.versions.find(candidate => candidate.v === entry.currentVersion)
      ?? entry.versions[entry.versions.length - 1]);
  if (!version) return null;

  const data = getVersionData(entry, version.v);
  if (!data) return null;

  return {
    data,
    metadata: extractPresetVersionMetadata(version),
  };
}
