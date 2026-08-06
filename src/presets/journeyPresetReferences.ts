import { getPresetStore, type IPresetStore } from './PresetStore';
import { getVersionData } from './codec';
import { extractPresetVersionMetadata } from './presetUtils';
import { getPresetCommandService } from './presetCommands';
import { buildJourneyPresetPreview } from './journeyPresetPreview';
import type {
  PresetEntry,
  PresetReferenceCandidate,
  PresetSummary,
  PresetVersion,
} from './types';
import {
  decodeJourneyPresetData,
  journeyDataReferencesStatePreset,
  removeStatePresetRefFromJourneyData,
} from './journeyPresetCodec';

export interface JourneyReferenceImpact {
  journeyName: string;
  entry: PresetEntry;
}

export interface CleanupJourneyReferencesResult {
  updated: string[];
  blocked: string[];
}

const JOURNEY_DETAIL_LOAD_CONCURRENCY = 6;
const JOURNEY_CLEANUP_CONCURRENCY = 4;

type CleanupOutcome = {
  journeyName: string;
  status: 'updated' | 'blocked' | 'unchanged';
};

function currentVersion(entry: PresetEntry): PresetVersion | undefined {
  return entry.versions.find((version) => version.v === entry.currentVersion)
    ?? entry.versions[entry.versions.length - 1];
}

function sameJourneyLogicalName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function entryReferencesStatePreset(entry: PresetEntry, statePreset: Pick<PresetEntry, 'id' | 'name'>): boolean {
  for (const version of entry.versions) {
    const data = getVersionData(entry, version.v);
    if (data && journeyDataReferencesStatePreset(data, version.refs, statePreset)) return true;
  }
  return false;
}

async function loadJourneyReferenceCandidate(
  candidate: Pick<PresetReferenceCandidate, 'id' | 'name'>,
  store: IPresetStore,
): Promise<PresetEntry | null> {
  const byName = await store.load('journey', candidate.name);
  if (byName && (!candidate.id || byName.id === candidate.id)) return byName;
  if (!candidate.id) return null;
  const byId = await store.loadById(candidate.id);
  return byId?.type === 'journey' ? byId : null;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]!);
    }
  }));
  return results;
}

function materializeVersion(entry: PresetEntry, version: PresetVersion): PresetVersion {
  const data = getVersionData(entry, version.v) ?? version.data;
  const materialized = {
    ...version,
    data,
  };
  delete materialized._isDelta;
  return materialized;
}

function buildCleanedJourneyEntry(
  entry: PresetEntry,
  version: PresetVersion,
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
): PresetEntry | null {
  const data = getVersionData(entry, version.v);
  if (!data) return null;

  const cleanup = removeStatePresetRefFromJourneyData(data, version.refs, statePreset);
  if (!cleanup.changed) return entry;

  const now = Date.now();
  const nextVersionNumber = Math.max(...entry.versions.map(candidate => candidate.v)) + 1;
  const metadata = extractPresetVersionMetadata(version) ?? {};
  const { refs: _previousRefs, journeyPreview: _previousPreview, ...preservedMetadata } = metadata;
  const config = decodeJourneyPresetData(cleanup.data, cleanup.refs, entry.name);
  const preview = buildJourneyPresetPreview(config);

  return {
    ...entry,
    // Journey saves deliberately retain only the immediately prior graph as an
    // undo target. Keep that contract instead of collapsing history to v1.
    versions: [
      materializeVersion(entry, version),
      {
        v: nextVersionNumber,
        note: `Removed deleted state preset "${statePreset.name}"`,
        timestamp: now,
        data: cleanup.data,
        ...(cleanup.refs ? { refs: cleanup.refs } : {}),
        ...preservedMetadata,
        ...(preview ? { journeyPreview: preview } : {}),
      },
    ],
    currentVersion: nextVersionNumber,
    updatedAt: now,
  };
}

async function cleanupLoadedJourney(
  entry: PresetEntry,
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
  store: IPresetStore,
): Promise<CleanupOutcome> {
  if (!entryReferencesStatePreset(entry, statePreset)) {
    return { journeyName: entry.name, status: 'unchanged' };
  }
  if (entry.library === 'stock' || entry.author === 'factory') {
    return { journeyName: entry.name, status: 'blocked' };
  }

  const version = currentVersion(entry);
  if (!version) return { journeyName: entry.name, status: 'blocked' };
  const cleaned = buildCleanedJourneyEntry(entry, version, statePreset);
  if (!cleaned) return { journeyName: entry.name, status: 'blocked' };
  if (cleaned === entry) return { journeyName: entry.name, status: 'unchanged' };

  await store.save(cleaned);
  return { journeyName: cleaned.name, status: 'updated' };
}

async function cleanupJourneySummary(
  summary: Pick<PresetSummary, 'id' | 'name'>,
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
  store: IPresetStore,
): Promise<CleanupOutcome> {
  const commandService = getPresetCommandService(store);
  try {
    return await commandService.runExclusive('journey', undefined, summary.name, async () => {
      const entry = await store.load('journey', summary.name);
      if (entry) return cleanupLoadedJourney(entry, statePreset, store);
      if (!summary.id) return { journeyName: summary.name, status: 'unchanged' };

      // Rename uses the previous logical-name queue. If it wins the race after
      // the summary scan, follow the stable id and take the new logical key
      // before loading/writing the renamed entry.
      const renamed = await store.loadById(summary.id);
      if (!renamed || renamed.type !== 'journey') {
        return { journeyName: summary.name, status: 'unchanged' };
      }
      if (sameJourneyLogicalName(renamed.name, summary.name)) {
        return cleanupLoadedJourney(renamed, statePreset, store);
      }
      return commandService.runExclusive('journey', undefined, renamed.name, async () => {
        const latest = await store.load('journey', renamed.name);
        if (!latest || latest.id !== summary.id) {
          return { journeyName: renamed.name, status: 'unchanged' };
        }
        return cleanupLoadedJourney(latest, statePreset, store);
      });
    });
  } catch (error) {
    // A partial cleanup must fail closed: the caller will keep the state
    // preset rather than leaving a journey pointing at a deleted preset.
    console.warn(`Failed to clean deleted state preset from journey "${summary.name}":`, error);
    return { journeyName: summary.name, status: 'blocked' };
  }
}

export async function findJourneyPresetsReferencingStatePreset(
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
  store: IPresetStore = getPresetStore(),
): Promise<JourneyReferenceImpact[]> {
  const candidates = await store.findCurrentReferenceCandidates(
    'state',
    statePreset.id,
    statePreset.name,
  );
  const entries = await mapWithConcurrency(
    candidates,
    JOURNEY_DETAIL_LOAD_CONCURRENCY,
    (candidate) => loadJourneyReferenceCandidate(candidate, store),
  );
  return entries
    .filter((entry): entry is PresetEntry => Boolean(entry))
    .filter((entry) => entryReferencesStatePreset(entry, statePreset))
    .map((entry) => ({ journeyName: entry.name, entry }));
}

export async function cleanupJourneyRefsForDeletedStatePreset(
  statePreset: Pick<PresetEntry, 'id' | 'name'>,
  store: IPresetStore = getPresetStore(),
  confirmedImpacts?: readonly JourneyReferenceImpact[],
): Promise<CleanupJourneyReferencesResult> {
  const summaries: Array<Pick<PresetSummary, 'id' | 'name'>> = confirmedImpacts
    ? confirmedImpacts.map((impact) => ({ id: impact.entry.id, name: impact.journeyName }))
    : await store.findCurrentReferenceCandidates('state', statePreset.id, statePreset.name);
  const outcomes = await mapWithConcurrency(
    summaries,
    JOURNEY_CLEANUP_CONCURRENCY,
    (summary): Promise<CleanupOutcome> => cleanupJourneySummary(summary, statePreset, store),
  );

  return {
    updated: outcomes.filter(outcome => outcome.status === 'updated').map(outcome => outcome.journeyName),
    blocked: outcomes.filter(outcome => outcome.status === 'blocked').map(outcome => outcome.journeyName),
  };
}
