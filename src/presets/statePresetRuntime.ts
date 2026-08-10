import { normalizeDegradeReverbCrossfeed } from '../ui/routing';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import { loadPresetsFromFolder, type BundledSavedPreset } from './bundledPresetLoader';
import { getVersionData } from './codec';
import { decodeCurrentPresetEntry } from './currentPresetSchema';
import { enforceProductCorePresetBoundaryState } from './productCorePresetBoundary';
import { extractPresetVersionMetadata } from './presetUtils';
import { savedPresetSourceFor } from './savedPresetSource';
import { sanitizePresetParameterBehaviorMetadata } from './versionMetadataHelpers';
import type { PresetEntry, PresetSummary } from './types';
import { completeCanonicalPresetState } from './presetStateCompatibility';

export type SavedPreset = BundledSavedPreset;

const CAPACITOR_LOCAL_STATE_PRESET_SCOPE = 'global';

const IOS_ONLY_REVERB_TYPES = new Set([
  'smallRoom',
  'mediumRoom',
  'largeRoom',
  'mediumHall',
  'largeHall',
  'mediumChamber',
  'largeChamber',
  'largeRoom2',
  'mediumHall2',
  'mediumHall3',
  'largeHall2',
]);

/** Report platform-specific values without rewriting current preset data. */
export const checkPresetCompatibility = (preset: SavedPreset): string[] => {
  const reverbType = preset.state.reverbType;
  return reverbType && IOS_ONLY_REVERB_TYPES.has(reverbType)
    ? [`Reverb type "${reverbType}" is not available on the Web Product runtime.`]
    : [];
};

/**
 * Validate and apply only current canonical state semantics.
 *
 * Missing current-contract fields receive their canonical defaults so presets
 * do not become unloadable when the contract grows. Authored values are kept
 * intact and malformed values still fail Product boundary validation.
 */
export const normalizePresetForWeb = (state: SliderState): SliderState => {
  const current = enforceProductCorePresetBoundaryState(completeCanonicalPresetState(state));
  return enforceProductCorePresetBoundaryState(normalizeDegradeReverbCrossfeed({ ...current }));
};

export function sortSavedStatePresetsByFreshness(presets: SavedPreset[]): SavedPreset[] {
  return [...presets].sort((left, right) => {
    const timeDiff = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return left.name.localeCompare(right.name);
  });
}

function savedPresetFromSummary(summary: PresetSummary): SavedPreset {
  return {
    id: summary.id,
    name: summary.name,
    timestamp: new Date(summary.updatedAt ?? Date.now()).toISOString(),
    state: DEFAULT_STATE,
    source: savedPresetSourceFor(summary),
    deferred: true,
    tags: summary.tags,
    familyId: summary.familyId,
    familyName: summary.familyName,
    variantId: summary.variantId,
    variantName: summary.variantName,
    variantRank: summary.variantRank,
    versionCount: summary.versionCount,
    currentVersion: summary.currentVersion,
  };
}

export function statePresetEntryToSavedPreset(entry: PresetEntry, versionSelection: 'current' | 'highest' = 'current'): SavedPreset | null {
  const currentEntry = decodeCurrentPresetEntry(entry);
  const version = versionSelection === 'highest'
    ? currentEntry.versions.reduce<(typeof currentEntry.versions)[number] | null>((highest, candidate) => {
        if (!highest || candidate.v > highest.v) return candidate;
        return highest;
      }, null)
    : (currentEntry.versions.find((candidate) => candidate.v === currentEntry.currentVersion)
      ?? currentEntry.versions[currentEntry.versions.length - 1]);
  if (!version) return null;

  const versionData = getVersionData(currentEntry, version.v);
  if (!versionData) return null;
  const state = enforceProductCorePresetBoundaryState(completeCanonicalPresetState(versionData));
  const metadata = extractPresetVersionMetadata(version) ?? {};
  const behavior = sanitizePresetParameterBehaviorMetadata(metadata);
  if (behavior.sliderModes) metadata.sliderModes = behavior.sliderModes;
  else delete metadata.sliderModes;
  if (behavior.dualRanges) metadata.dualRanges = behavior.dualRanges;
  else delete metadata.dualRanges;
  if (behavior.dualSliderConfigs) metadata.dualSliderConfigs = behavior.dualSliderConfigs;
  else delete metadata.dualSliderConfigs;

  return {
    id: currentEntry.id,
    name: currentEntry.name,
    timestamp: new Date(version.timestamp).toISOString(),
    state,
    ...metadata,
    source: savedPresetSourceFor(currentEntry),
    tags: currentEntry.tags,
    familyId: currentEntry.familyId,
    familyName: currentEntry.familyName ?? currentEntry.name,
    variantId: currentEntry.variantId,
    variantName: currentEntry.variantName ?? currentEntry.name,
    variantRank: currentEntry.variantRank,
    versionCount: currentEntry.versions.length,
    currentVersion: currentEntry.currentVersion,
  };
}

export async function loadCapacitorLocalStatePresets(): Promise<SavedPreset[]> {
  const { LocalStoragePresetStore } = await import('./index');
  const store = new LocalStoragePresetStore();
  const summaries = await store.list('state', CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  const entries = await Promise.all(
    summaries
      .filter((summary) => summary.author !== 'factory' && summary.library !== 'stock')
      .map((summary) => store.load('state', summary.name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE)),
  );

  return sortSavedStatePresetsByFreshness(
    entries.map((entry) => (entry ? statePresetEntryToSavedPreset(entry) : null)).filter((preset): preset is SavedPreset => !!preset),
  );
}

export async function loadActiveStatePresetStorePresets(): Promise<SavedPreset[]> {
  const { getPresetStore } = await import('./index');
  const store = getPresetStore();
  const summaries = await store.list('state', CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  return sortSavedStatePresetsByFreshness(summaries.map(savedPresetFromSummary));
}

export async function loadActiveStatePresetStorePresetByName(name: string): Promise<SavedPreset | null> {
  const { getPresetStore } = await import('./index');
  const store = getPresetStore();
  const entry = await store.load('state', name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  return entry ? statePresetEntryToSavedPreset(entry) : null;
}

export async function loadActiveStatePresetStorePresetById(id: string): Promise<SavedPreset | null> {
  const { getPresetStore } = await import('./index');
  const store = getPresetStore();
  const entry = await store.loadById(id);
  return entry ? statePresetEntryToSavedPreset(entry) : null;
}

export async function loadBundledPresetByName(name: string): Promise<SavedPreset | null> {
  const presets = await loadPresetsFromFolder();
  return presets.find((preset) => preset.name === name) ?? null;
}
