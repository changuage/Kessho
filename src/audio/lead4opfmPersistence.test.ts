import assert from 'node:assert/strict';
import test from 'node:test';
import { getPresetStore, setPresetStore } from '../presets/PresetStore';
import type { IPresetStore } from '../presets/PresetStore';
import { decodeCurrentPresetEntry, UnsupportedPresetVersionError } from '../presets/currentPresetSchema';
import {
  isLead4opFMPresetData,
  readLead4opFMPresetData,
} from '../presets/lead4opPresetPayload';
import type { PresetEntry, PresetLevel, PresetSummary } from '../presets/types';
import {
  DEFAULT_SOFT_RHODES,
  getLead4opFMPresetList,
  loadLead4opFMPreset,
  overwriteLead4opFMPreset,
  saveUserLead4opFMPreset,
  setUserLead4opFMPresets,
  type Lead4opFMPreset,
} from './lead4opfm';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeLeadPreset(id: string, name: string, gain = 0.7): Lead4opFMPreset {
  return {
    ...DEFAULT_SOFT_RHODES,
    id,
    name,
    params: {
      ...DEFAULT_SOFT_RHODES.params,
      gain,
    },
  };
}

function makeEntry(
  id: string,
  name: string,
  preset: Lead4opFMPreset,
  author: PresetEntry['author'] = 'cloud',
  library: NonNullable<PresetEntry['library']> = 'cloud',
): PresetEntry {
  return {
    id,
    remoteId: id,
    type: 'engine',
    scope: 'lead4opfm',
    engine: 'lead4opfm',
    name,
    author,
    library,
    visibility: 'public',
    familyId: `engine:lead4opfm:${name.toLowerCase()}`,
    familyName: name,
    variantId: `engine:lead4opfm:${name.toLowerCase()}:${name.toLowerCase()}`,
    variantName: name,
    versions: [{
      v: 1,
      note: '',
      timestamp: 1,
      data: clone(preset) as unknown as Record<string, unknown>,
    }],
    currentVersion: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeSummary(entry: PresetEntry): PresetSummary {
  return {
    id: entry.id,
    remoteId: entry.remoteId,
    type: entry.type,
    scope: entry.scope,
    engine: entry.engine,
    source: entry.source,
    name: entry.name,
    author: entry.author,
    library: entry.library ?? 'user',
    visibility: entry.visibility ?? 'private',
    familyId: entry.familyId ?? entry.name,
    familyName: entry.familyName ?? entry.name,
    variantId: entry.variantId ?? entry.name,
    variantName: entry.variantName ?? entry.name,
    versionCount: entry.versions.length,
    currentVersion: entry.currentVersion,
    updatedAt: entry.updatedAt,
  };
}

class Lead4opCountingStore {
  readonly entriesByName = new Map<string, PresetEntry>();
  readonly entriesById = new Map<string, PresetEntry>();
  readonly loadNames: string[] = [];
  readonly loadByIds: string[] = [];
  listCalls = 0;
  saveCalls = 0;

  constructor(
    entries: PresetEntry[] = [],
    private readonly summaries: PresetSummary[] = entries.map(makeSummary),
  ) {
    for (const entry of entries) this.put(entry);
  }

  private put(entry: PresetEntry): void {
    const stored = clone(entry);
    this.entriesByName.set(stored.name, stored);
    if (stored.id) this.entriesById.set(stored.id, stored);
    if (stored.remoteId) this.entriesById.set(stored.remoteId, stored);
  }

  async load(_type: PresetLevel, name: string): Promise<PresetEntry | null> {
    this.loadNames.push(name);
    await Promise.resolve();
    const entry = this.entriesByName.get(name);
    return entry ? clone(entry) : null;
  }

  async loadById(id: string): Promise<PresetEntry | null> {
    this.loadByIds.push(id);
    const entry = this.entriesById.get(id);
    return entry ? clone(entry) : null;
  }

  async list(): Promise<PresetSummary[]> {
    this.listCalls += 1;
    return clone(this.summaries);
  }

  async save(entry: PresetEntry): Promise<void> {
    this.saveCalls += 1;
    this.put(entry);
  }
}

async function withLead4opStore(store: Lead4opCountingStore, operation: () => Promise<void>): Promise<void> {
  const previousStore = getPresetStore();
  setUserLead4opFMPresets([]);
  setPresetStore(store as unknown as IPresetStore);
  try {
    await operation();
  } finally {
    setUserLead4opFMPresets([]);
    setPresetStore(previousStore);
  }
}

test('Lead4op list uses summary identities without loading every detail payload', async () => {
  const cloudId = '04cac4ec-d42c-4ef0-a2b4-a9745087a001';
  const entry = makeEntry(cloudId, 'Summary-only Lead', makeLeadPreset(cloudId, 'Summary-only Lead'));
  const store = new Lead4opCountingStore([entry]);

  await withLead4opStore(store, async () => {
    const presets = await getLead4opFMPresetList();
    assert.deepEqual(
      presets.find((preset) => preset.name === entry.name),
      { id: cloudId, name: entry.name },
    );
    assert.equal(store.listCalls, 1);
    assert.deepEqual(store.loadNames, []);
    assert.deepEqual(store.loadByIds, []);
  });
});

test('Lead4op alias loads fetch only the matching detail and coalesce concurrent requests', async () => {
  const target = makeEntry('summary-alias-001', 'Summary Alias Lead', makeLeadPreset('summary-alias-001', 'Summary Alias Lead'));
  const irrelevant = makeEntry('summary-irrelevant-001', 'Irrelevant Lead', makeLeadPreset('summary-irrelevant-001', 'Irrelevant Lead'));
  const store = new Lead4opCountingStore([target, irrelevant]);

  await withLead4opStore(store, async () => {
    const [first, second] = await Promise.all([
      loadLead4opFMPreset('summary-alias-001'),
      loadLead4opFMPreset('summary-alias-001'),
    ]);

    assert.equal(first.id, 'summary-alias-001');
    assert.equal(second.id, 'summary-alias-001');
    assert.equal(store.listCalls, 1);
    assert.deepEqual(store.loadNames, ['summary-alias-001', 'Summary Alias Lead']);
    assert.equal(store.loadNames.includes('Irrelevant Lead'), false);
  });
});

test('Lead4op saves are serialized and identical payloads do not write another version', async () => {
  const store = new Lead4opCountingStore();
  const first = makeLeadPreset('transient', 'Queued Lead', 0.31);
  const second = makeLeadPreset('transient', 'Queued Lead', 0.82);
  second.params = {
    ...second.params,
    envelope: { ...second.params.envelope, hold: 0.7 },
    distance: 0.4,
    postLpfHz: 12000,
    postLpfKeyTracking: 0.25,
    stereoWidth: 0.8,
    diffuseSend: 0.2,
    vibratoDepth: 0.35,
    vibratoRate: 0.45,
    glide: 0.15,
  };
  second.dualRanges = { vibratoDepth: { min: 0.2, max: 0.5 } };
  second.sliderModes = { vibratoDepth: 'sampleHold' };

  await withLead4opStore(store, async () => {
    const names = await Promise.all([
      saveUserLead4opFMPreset('Queued Lead', first, 'first edit'),
      saveUserLead4opFMPreset('Queued Lead', second, 'second edit'),
    ]);
    assert.deepEqual(names, ['Queued Lead', 'Queued Lead']);
    assert.equal(store.saveCalls, 2);

    const saved = store.entriesByName.get('Queued Lead');
    assert.equal(saved?.currentVersion, 2);
    const currentPayload = readLead4opFMPresetData(saved?.versions[1]?.data);
    assert.equal(currentPayload?.preset.params.gain, 0.82);
    assert.equal(currentPayload?.preset.params.distance, 0.4);
    assert.equal(currentPayload?.preset.params.envelope.hold, 0.7);
    assert.deepEqual(saved?.versions[1]?.dualRanges, second.dualRanges);
    assert.deepEqual(saved?.versions[1]?.sliderModes, second.sliderModes);
    assert.equal(isLead4opFMPresetData(saved?.versions[1]?.data), true);

    await saveUserLead4opFMPreset('Queued Lead', second);
    assert.equal(store.saveCalls, 2);
    const loaded = await loadLead4opFMPreset('Queued Lead');
    assert.deepEqual(loaded.dualRanges, second.dualRanges);
    assert.deepEqual(loaded.sliderModes, second.sliderModes);
  });
});

test('Lead4op overwrite retains canonical cloud identity without a post-save reload', async () => {
  const cloudId = '14cac4ec-d42c-4ef0-a2b4-a9745087a001';
  const name = 'Canonical Cloud Lead';
  const entry = makeEntry(cloudId, name, makeLeadPreset(name, name));
  const store = new Lead4opCountingStore([entry]);
  const edited = makeLeadPreset('transient', name, 0.91);

  await withLead4opStore(store, async () => {
    assert.equal(await overwriteLead4opFMPreset(cloudId, edited), name);
    const saved = store.entriesByName.get(name);
    assert.equal(saved?.id, cloudId);
    assert.equal(saved?.remoteId, cloudId);
    assert.equal(saved?.currentVersion, 2);
    assert.equal(isLead4opFMPresetData(saved?.versions[1]?.data), true);
    assert.doesNotThrow(() => decodeCurrentPresetEntry(clone(saved)));

    const loaded = await loadLead4opFMPreset(cloudId);
    assert.equal(loaded.id, cloudId);
    assert.equal(store.loadByIds.length, 1);
  });
});

test('Lead4op schema accepts the explicit envelope and rejects arbitrary engine payload keys', () => {
  const preset = makeLeadPreset('schema-lead', 'Schema Lead');
  const entry = makeEntry('schema-lead', 'Schema Lead', preset, 'user', 'user');
  entry.versions[0]!.data = {
    format: 'kessho-lead4opfm-preset',
    formatVersion: 1,
    preset: clone(preset),
  };
  assert.doesNotThrow(() => decodeCurrentPresetEntry(clone(entry)));

  const invalid = clone(entry);
  invalid.versions[0]!.data = {
    ...invalid.versions[0]!.data,
    arbitraryRuntimeState: { shouldNotPersist: true },
  };
  assert.throws(
    () => decodeCurrentPresetEntry(invalid),
    (error: unknown) => error instanceof UnsupportedPresetVersionError
      && error.message.includes('Lead4opFM data must use the current allowlisted'),
  );
});
