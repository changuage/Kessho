import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiamondJourney } from '../audio/journeyTypes';
import { getVersionData } from './codec';
import {
  cleanupJourneyRefsForDeletedStatePreset,
  findJourneyPresetsReferencingStatePreset,
} from './journeyPresetReferences';
import { encodeJourneyPresetData, getJourneyNodeRefSlot } from './journeyPresetCodec';
import { HybridPresetStore } from './HybridPresetStore';
import { getPresetCommandService } from './presetCommands';
import type { IPresetStore } from './PresetStore';
import { normalizePresetSummary } from './presetUtils';
import type {
  PresetEntry,
  PresetLevel,
  PresetMetadataPatch,
  PresetReferenceCandidate,
  PresetRenameIdentity,
  PresetSummary,
  PresetVersion,
} from './types';

const DELETED_STATE = {
  id: 'state-deleted',
  name: 'State to delete',
} satisfies Pick<PresetEntry, 'id' | 'name'>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve,
  };
}

function journeyPayload(
  name: string,
  statePreset: Pick<PresetEntry, 'id' | 'name'> | null,
  autoAdvance = true,
): Pick<PresetVersion, 'data' | 'refs'> {
  const config = createDiamondJourney([]);
  config.name = name;
  config.autoAdvance = autoAdvance;
  const left = config.nodes.find(node => node.position === 'left');
  if (left && statePreset) {
    left.presetId = statePreset.id ?? statePreset.name;
    left.presetName = statePreset.name;
  }
  return {
    data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
    ...(statePreset
      ? {
        refs: {
          [getJourneyNodeRefSlot('left')]: {
            id: statePreset.id,
            name: statePreset.name,
            version: 'latest' as const,
            scope: 'global',
          },
        },
      }
      : {}),
  };
}

function journeyEntry(
  name: string,
  versions: PresetVersion[],
  options: Partial<Pick<PresetEntry, 'author' | 'library'>> = {},
): PresetEntry {
  const current = versions[versions.length - 1];
  if (!current) throw new Error('Journey test entry needs at least one version.');
  return {
    id: `journey:${name}`,
    type: 'journey',
    name,
    author: options.author ?? 'user',
    library: options.library ?? 'user',
    visibility: 'private',
    familyName: name,
    variantName: name,
    tags: ['journey'],
    versions,
    currentVersion: current.v,
    createdAt: versions[0]?.timestamp ?? 0,
    updatedAt: current.timestamp,
  };
}

class MemoryJourneyStore implements IPresetStore {
  private readonly entries = new Map<string, PresetEntry>();
  saves = 0;
  listCalls = 0;
  activeLoads = 0;
  maxConcurrentLoads = 0;
  loadDelayMs = 0;
  missNextLoadFor = new Set<string>();
  onList?: () => void | Promise<void>;
  onReferenceCandidates?: () => void | Promise<void>;

  constructor(entries: PresetEntry[]) {
    for (const entry of entries) this.entries.set(this.key(entry.type, entry.name), clone(entry));
  }

  private key(type: PresetLevel, name: string): string {
    return `${type}:${name.trim().toLowerCase()}`;
  }

  async save(entry: PresetEntry): Promise<void> {
    this.saves += 1;
    this.entries.set(this.key(entry.type, entry.name), clone(entry));
  }

  async load(type: PresetLevel, name: string, _scope?: string, _version?: number): Promise<PresetEntry | null> {
    this.activeLoads += 1;
    this.maxConcurrentLoads = Math.max(this.maxConcurrentLoads, this.activeLoads);
    try {
      if (this.loadDelayMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, this.loadDelayMs));
      }
      const key = this.key(type, name);
      if (this.missNextLoadFor.delete(key)) return null;
      const entry = this.entries.get(key);
      return entry ? clone(entry) : null;
    } finally {
      this.activeLoads -= 1;
    }
  }

  async loadById(id: string, _version?: number): Promise<PresetEntry | null> {
    const entry = [...this.entries.values()].find(candidate => candidate.id === id);
    return entry ? clone(entry) : null;
  }

  async list(type: PresetLevel, _scope?: string): Promise<PresetSummary[]> {
    this.listCalls += 1;
    const summaries = [...this.entries.values()]
      .filter(entry => entry.type === type)
      .map(entry => normalizePresetSummary(entry));
    await this.onList?.();
    return summaries;
  }

  async rename(
    type: PresetLevel,
    name: string,
    nextName: string,
    _scope?: string,
    _identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    const entry = this.entries.get(this.key(type, name));
    if (!entry) return null;
    this.entries.delete(this.key(type, name));
    const renamed = { ...clone(entry), name: nextName };
    this.entries.set(this.key(type, nextName), renamed);
    return clone(renamed);
  }

  async updateMetadata(
    _type: PresetLevel,
    _name: string,
    _metadata: PresetMetadataPatch,
    _scope?: string,
  ): Promise<boolean> {
    return false;
  }

  async delete(type: PresetLevel, name: string, _scope?: string): Promise<void> {
    this.entries.delete(this.key(type, name));
  }

  async exists(type: PresetLevel, name: string, _scope?: string): Promise<boolean> {
    return this.entries.has(this.key(type, name));
  }

  async findReferences(_type: PresetLevel, _name: string): Promise<string[]> {
    return [];
  }

  async findCurrentReferenceCandidates(
    type: PresetLevel,
    targetId: string | undefined,
    targetName: string,
  ): Promise<PresetReferenceCandidate[]> {
    const candidates: PresetReferenceCandidate[] = [];
    for (const entry of this.entries.values()) {
      if (type === 'state' && entry.type !== 'journey') continue;
      const current = entry.versions.find(version => version.v === entry.currentVersion)
        ?? entry.versions[entry.versions.length - 1];
      const refs = current?.refs ? Object.values(current.refs) : [];
      if (!refs.some(ref => ref.id === targetId || ref.name === targetName)) continue;
      candidates.push({
        id: entry.id,
        name: entry.name,
        currentVersion: entry.currentVersion,
        updatedAtRevision: String(entry.updatedAt),
      });
    }
    await this.onReferenceCandidates?.();
    return candidates;
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    return { bytes: 0, count: this.entries.size };
  }

  async exportAll(): Promise<Blob> {
    return new Blob();
  }

  async importAll(_json: string): Promise<number> {
    return 0;
  }
}

test('cleanup reads the latest queued journey and keeps its one-step undo backup', async () => {
  const name = 'Queued cleanup journey';
  const initialPayload = journeyPayload(name, DELETED_STATE, true);
  const initial = journeyEntry(name, [{
    v: 1,
    note: 'Initial graph',
    timestamp: 100,
    ...initialPayload,
  }]);
  const freshPayload = journeyPayload(name, DELETED_STATE, false);
  const fresh = journeyEntry(name, [
    initial.versions[0]!,
    {
      v: 2,
      note: 'Newer save',
      timestamp: 200,
      ...freshPayload,
    },
  ]);
  const store = new MemoryJourneyStore([initial]);
  const writerStarted = deferred();
  const releaseWriter = deferred();
  const listed = deferred();
  store.onReferenceCandidates = listed.resolve;

  const writer = getPresetCommandService(store).runExclusive('journey', undefined, name, async () => {
    writerStarted.resolve();
    await releaseWriter.promise;
    await store.save(fresh);
  });
  await writerStarted.promise;

  const cleanup = cleanupJourneyRefsForDeletedStatePreset(DELETED_STATE, store);
  await listed.promise;
  releaseWriter.resolve();
  const [result] = await Promise.all([cleanup, writer]);

  assert.deepEqual(result, { updated: [name], blocked: [] });
  const saved = await store.load('journey', name);
  assert.ok(saved);
  assert.deepEqual(saved.versions.map(version => version.v), [2, 3]);
  assert.equal(saved.currentVersion, 3);
  assert.equal(getVersionData(saved, 2)?.autoAdvance, false, 'the newest queued save remains the undo backup');
  assert.equal(getVersionData(saved, 3)?.autoAdvance, false, 'cleanup must retain newer graph changes');
  assert.equal(saved.versions[1]?.refs?.[getJourneyNodeRefSlot('left')], undefined);
  const cleanedNode = (getVersionData(saved, 3)?.nodes as Array<{ position?: string; presetName?: string }> | undefined)
    ?.find(node => node.position === 'left');
  assert.equal(cleanedNode?.presetName, undefined, 'the cleaned current version removes the deleted state node');
});

test('reference discovery loads only current referrer candidates', async () => {
  const entries = Array.from({ length: 17 }, (_, index) => {
    const name = `Unrelated journey ${index}`;
    const payload = journeyPayload(name, null);
    return journeyEntry(name, [{
      v: 1,
      note: 'Unrelated graph',
      timestamp: index,
      ...payload,
    }]);
  });
  const referencedName = 'Referenced journey';
  const referencedPayload = journeyPayload(referencedName, DELETED_STATE);
  entries.push(journeyEntry(referencedName, [{
    v: 1,
    note: 'Referenced graph',
    timestamp: 100,
    ...referencedPayload,
  }]));
  const store = new MemoryJourneyStore(entries);
  store.loadDelayMs = 2;

  const impacts = await findJourneyPresetsReferencingStatePreset(DELETED_STATE, store);

  assert.deepEqual(impacts.map(impact => impact.journeyName), [referencedName]);
  assert.equal(store.maxConcurrentLoads, 1, 'unrelated journey details must not be loaded');
  assert.equal(store.listCalls, 0, 'reference discovery must not scan the journey summary list');
});

test('cleanup follows a queued rename by stable id before it writes', async () => {
  const beforeName = 'Journey before rename';
  const afterName = 'Journey after rename';
  const payload = journeyPayload(beforeName, DELETED_STATE);
  const store = new MemoryJourneyStore([journeyEntry(beforeName, [{
    v: 1,
    note: 'Graph before rename',
    timestamp: 100,
    ...payload,
  }])]);
  store.onReferenceCandidates = async () => {
    await getPresetCommandService(store).runExclusive('journey', undefined, beforeName, async () => {
      await store.rename('journey', beforeName, afterName);
    });
  };

  const result = await cleanupJourneyRefsForDeletedStatePreset(DELETED_STATE, store);

  assert.deepEqual(result, { updated: [afterName], blocked: [] });
  assert.equal(await store.load('journey', beforeName), null);
  const saved = await store.load('journey', afterName);
  assert.ok(saved);
  assert.equal(saved.currentVersion, 2);
  assert.equal(saved.versions[1]?.refs?.[getJourneyNodeRefSlot('left')], undefined);
});

test('cleanup reuses confirmed impacts without a second scan and avoids same-key re-entry', async () => {
  const name = 'Confirmed journey';
  const payload = journeyPayload(name, DELETED_STATE);
  const entry = journeyEntry(name, [{
    v: 1,
    note: 'Confirmed graph',
    timestamp: 100,
    ...payload,
  }]);
  const store = new MemoryJourneyStore([entry]);
  store.missNextLoadFor.add('journey:confirmed journey');

  const result = await cleanupJourneyRefsForDeletedStatePreset(DELETED_STATE, store, [{
    journeyName: name,
    entry,
  }]);

  assert.deepEqual(result, { updated: [name], blocked: [] });
  assert.equal(store.listCalls, 0, 'the confirmed impacts should avoid a second complete journey scan');
  const saved = await store.load('journey', name);
  assert.ok(saved);
  assert.equal(saved.currentVersion, 2);
});

test('cleanup fails closed when a read-only journey still references the state preset', async () => {
  const name = 'Factory journey';
  const payload = journeyPayload(name, DELETED_STATE);
  const store = new MemoryJourneyStore([journeyEntry(name, [{
    v: 1,
    note: 'Factory graph',
    timestamp: 100,
    ...payload,
  }], { author: 'factory', library: 'stock' })]);

  const result = await cleanupJourneyRefsForDeletedStatePreset(DELETED_STATE, store);

  assert.deepEqual(result, { updated: [], blocked: [name] });
  assert.equal(store.saves, 0);
});

test('hybrid current-reference candidates union cloud and local identities', async () => {
  const localName = 'Local referrer';
  const cloudName = 'Cloud referrer';
  const makeReferencedJourney = (name: string, timestamp: number) => {
    const payload = journeyPayload(name, DELETED_STATE);
    return journeyEntry(name, [{
      v: 1,
      note: 'references target',
      timestamp,
      ...payload,
    }]);
  };
  const local = new MemoryJourneyStore([makeReferencedJourney(localName, 100)]);
  const cloud = new MemoryJourneyStore([makeReferencedJourney(cloudName, 200)]);
  const hybrid = new HybridPresetStore(local, cloud);

  const candidates = await hybrid.findCurrentReferenceCandidates(
    'state',
    DELETED_STATE.id,
    DELETED_STATE.name,
  );

  assert.deepEqual(
    candidates.map(candidate => candidate.name).sort(),
    [cloudName, localName],
    'cloud referrers must not be omitted when a local store is present',
  );
});
