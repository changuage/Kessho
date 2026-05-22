import { getPresetStore, type IPresetStore } from './PresetStore';
import { getVersionData } from './codec';
import { extractPresetVersionMetadata } from './presetUtils';
import type { PresetEntry, PresetVersion } from './types';
import { journeyDataReferencesStatePreset, removeStatePresetRefFromJourneyData } from './journeyPresetCodec';

export interface JourneyReferenceImpact {
  journeyName: string;
  entry: PresetEntry;
}

export interface CleanupJourneyReferencesResult {
  updated: string[];
  blocked: string[];
}

function currentVersion(entry: PresetEntry): PresetVersion | undefined {
  return entry.versions.find((version) => version.v === entry.currentVersion)
    ?? entry.versions[entry.versions.length - 1];
}

function entryReferencesStatePreset(entry: PresetEntry, statePreset: Pick<PresetEntry, 'id' | 'name'>): boolean {
  for (const version of entry.versions) {
    const data = getVersionData(entry, version.v);
    if (data && journeyDataReferencesStatePreset(data, version.refs, statePreset)) return true;
  }
  return false;
}

export async function findJourneyPresetsReferencingStatePreset(
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
  store: IPresetStore = getPresetStore(),
): Promise<JourneyReferenceImpact[]> {
  const summaries = await store.list('journey');
  const entries = await Promise.all(summaries.map((summary) => store.load('journey', summary.name)));
  return entries
    .filter((entry): entry is PresetEntry => Boolean(entry))
    .filter((entry) => entryReferencesStatePreset(entry, statePreset))
    .map((entry) => ({ journeyName: entry.name, entry }));
}

export async function cleanupJourneyRefsForDeletedStatePreset(
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
  store: IPresetStore = getPresetStore(),
): Promise<CleanupJourneyReferencesResult> {
  const impacts = await findJourneyPresetsReferencingStatePreset(statePreset, store);
  const updated: string[] = [];
  const blocked: string[] = [];

  for (const impact of impacts) {
    const entry = impact.entry;
    if (entry.library === 'stock' || entry.author === 'factory') {
      blocked.push(entry.name);
      continue;
    }

    const version = currentVersion(entry);
    const versionData = version ? getVersionData(entry, version.v) : null;
    if (!version || !versionData) {
      blocked.push(entry.name);
      continue;
    }

    const cleanup = removeStatePresetRefFromJourneyData(versionData, version.refs, statePreset);
    if (!cleanup.changed) continue;

    const now = Date.now();
    entry.versions = [{
      v: 1,
      note: `Removed deleted state preset "${statePreset.name}"`,
      timestamp: now,
      data: cleanup.data,
      ...(cleanup.refs ? { refs: cleanup.refs } : {}),
      ...(extractPresetVersionMetadata(version) ?? {}),
    }];
    entry.currentVersion = 1;
    entry.updatedAt = now;
    await store.save(entry);
    updated.push(entry.name);
  }

  return { updated, blocked };
}
