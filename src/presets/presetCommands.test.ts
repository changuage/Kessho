import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PresetCommandConflictError,
  PresetCommandService,
  buildPresetSavePlan,
  getPresetCommandService,
  type PresetSaveCommand,
} from './presetCommands';
import type { IPresetStore } from './PresetStore';
import { PresetMetadataConflictError } from './PresetStore';
import type {
  PresetEntry,
  PresetLevel,
  PresetMetadataPatch,
  PresetMetadataUpdateOptions,
  PresetRenameIdentity,
} from './types';

const baseCommand = (overrides: Partial<PresetSaveCommand> = {}): PresetSaveCommand => ({
  type: 'engine',
  scope: 'pad1',
  name: 'Command Test',
  data: { padOscAWave: 'sine' },
  now: 100,
  ...overrides,
});

class MemoryStore implements Pick<
  IPresetStore,
  'load' | 'save' | 'rename' | 'updateMetadata' | 'delete'
> {
  entry: PresetEntry | null = null;
  saves = 0;
  events: string[] = [];
  lastMetadataOptions?: PresetMetadataUpdateOptions;
  saveGate: Promise<void> | null = null;
  renameGate: Promise<void> | null = null;
  failNextMetadataUpdate = false;
  failNextMetadataConflict = false;

  async load(_type: PresetLevel, name: string): Promise<PresetEntry | null> {
    if (this.entry && this.entry.name.trim().toLowerCase() !== name.trim().toLowerCase()) return null;
    return this.entry ? structuredClone(this.entry) : null;
  }
  async save(entry: PresetEntry): Promise<void> {
    this.events.push(`save:start:${entry.name}`);
    if (this.saveGate) await this.saveGate;
    this.saves += 1;
    this.entry = structuredClone(entry);
    this.events.push(`save:end:${entry.name}`);
  }
  async rename(
    _type: PresetLevel,
    name: string,
    nextName: string,
    _scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    this.events.push(`rename:start:${name}->${nextName}`);
    if (this.renameGate) await this.renameGate;
    if (!this.entry || this.entry.name.trim().toLowerCase() !== name.trim().toLowerCase()) return null;
    this.entry = {
      ...this.entry,
      ...identity,
      name: nextName,
      tags: identity?.tags ?? this.entry.tags,
    };
    this.events.push(`rename:end:${name}->${nextName}`);
    return structuredClone(this.entry);
  }
  async updateMetadata(
    _type: PresetLevel,
    name: string,
    metadata: PresetMetadataPatch,
    _scope?: string,
    options?: PresetMetadataUpdateOptions,
  ): Promise<boolean> {
    this.events.push(`metadata:${name}`);
    this.lastMetadataOptions = options;
    if (this.failNextMetadataConflict) {
      this.failNextMetadataConflict = false;
      throw new PresetMetadataConflictError();
    }
    if (this.failNextMetadataUpdate) {
      this.failNextMetadataUpdate = false;
      throw new Error('metadata write failed');
    }
    if (!this.entry || this.entry.name.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
    if ('description' in metadata) this.entry.description = metadata.description ?? undefined;
    if ('rating' in metadata) this.entry.rating = metadata.rating ?? undefined;
    return true;
  }
  async delete(_type: PresetLevel, name: string): Promise<void> {
    this.events.push(`delete:${name}`);
    if (this.entry?.name.trim().toLowerCase() === name.trim().toLowerCase()) this.entry = null;
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
}

test('buildPresetSavePlan creates a canonical v1 entry without mutating input', () => {
  const data = { padOscAWave: 'sine' };
  const plan = buildPresetSavePlan(null, baseCommand({ data, tags: [' Warm ', 'warm'] }));

  assert.equal(plan.kind, 'create');
  assert.equal(plan.version, 1);
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.entry.tags, ['warm']);
  assert.deepEqual(data, { padOscAWave: 'sine' });
});

test('identical save is a no-op and does not mutate the loaded entry', () => {
  const first = buildPresetSavePlan(null, baseCommand()).entry;
  const plan = buildPresetSavePlan(first, baseCommand());

  assert.equal(plan.kind, 'noop');
  assert.equal(plan.version, 1);
  assert.notEqual(plan.entry, first);
  assert.deepEqual(first.versions, plan.entry.versions);
});

test('changed save appends an immutable version and preserves previous data', () => {
  const first = buildPresetSavePlan(null, baseCommand()).entry;
  const plan = buildPresetSavePlan(first, baseCommand({ name: 'command test', data: { padOscAWave: 'square' }, now: 200 }));

  assert.equal(plan.kind, 'update');
  assert.equal(plan.version, 2);
  assert.equal(plan.entry.name, 'Command Test');
  assert.equal(plan.entry.versions.length, 2);
  assert.equal(first.currentVersion, 1);
  assert.equal(first.versions[0]?.data.padOscAWave, 'sine');
  assert.equal(plan.entry.versions[1]?.data.padOscAWave, 'square');
});

test('identity-only save uses metadata CAS without appending a version', async () => {
  const store = new MemoryStore();
  store.entry = {
    ...buildPresetSavePlan(null, baseCommand()).entry,
    id: 'identity-only-id',
    updatedAtRevision: 'identity-revision',
  };
  const service = new PresetCommandService(store);
  const result = await service.save(baseCommand({
    identity: { description: 'Identity only' },
    now: 200,
  }));

  assert.equal(result.versionChanged, false);
  assert.equal(result.version, 1);
  assert.equal(result.entry.currentVersion, 1);
  assert.equal(result.entry.description, 'Identity only');
  assert.equal(store.saves, 0);
  assert.deepEqual(store.lastMetadataOptions, {
    targetId: 'identity-only-id',
    expectedUpdatedAt: 'identity-revision',
  });
});

test('a nonempty note creates a version even when payload content is unchanged', () => {
  const first = buildPresetSavePlan(null, baseCommand()).entry;
  const plan = buildPresetSavePlan(first, baseCommand({
    note: 'Documented no-op',
    now: 200,
  }));

  assert.equal(plan.versionChanged, true);
  assert.equal(plan.version, 2);
  assert.equal(plan.entry.versions[1]?.note, 'Documented no-op');
});

test('import collision appends current data under the existing stable identity', async () => {
  const store = new MemoryStore();
  store.entry = {
    ...buildPresetSavePlan(null, baseCommand({ name: 'Imported Collision' })).entry,
    id: 'existing-import-id',
  };
  const imported = buildPresetSavePlan(null, baseCommand({
    name: 'Imported Collision',
    data: { padOscAWave: 'triangle' },
    note: 'File current version',
    now: 200,
  })).entry;
  const service = new PresetCommandService(store);

  const result = await service.importEntry(imported);

  assert.equal(result.id, 'existing-import-id');
  assert.equal(result.currentVersion, 2);
  assert.equal(result.versions.length, 2);
  assert.equal(result.versions[1]?.data.padOscAWave, 'triangle');
  assert.equal(result.versions[1]?.note, 'File current version');
});

test('new-name import preserves validated history', async () => {
  const store = new MemoryStore();
  const first = buildPresetSavePlan(null, baseCommand({ name: 'Imported New Name' })).entry;
  const imported = buildPresetSavePlan(first, baseCommand({
    name: 'Imported New Name',
    data: { padOscAWave: 'square' },
    now: 200,
  })).entry;
  const service = new PresetCommandService(store);

  const result = await service.importEntry(imported);

  assert.equal(result.currentVersion, 2);
  assert.equal(result.versions.length, 2);
  assert.deepEqual(result.versions, imported.versions);
});

test('stale expected version is rejected before a write', () => {
  const first = buildPresetSavePlan(null, baseCommand()).entry;
  assert.throws(
    () => buildPresetSavePlan(first, baseCommand({ expectedVersion: 9 })),
    (error: unknown) => error instanceof PresetCommandConflictError,
  );
});

test('internal derived refs are removed at the command boundary', () => {
  const plan = buildPresetSavePlan(null, baseCommand({
    metadata: {
      refs: {
        publicChild: { name: 'Child', version: 1 },
        internalChild: { name: '__derived__/state/child', version: 'latest' },
      },
    },
  }));

  assert.deepEqual(plan.entry.versions[0]?.refs, {
    publicChild: { name: 'Child', version: 1 },
  });
});

test('forking a read-only preset creates a private user entry', async () => {
  const store = new MemoryStore();
  store.entry = {
    ...buildPresetSavePlan(null, baseCommand({ tags: ['factory'] })).entry,
    author: 'factory',
    library: 'stock',
    visibility: 'public',
  };
  const service = new PresetCommandService(store);
  const result = await service.save(baseCommand({
    forkReadOnly: true,
    data: { padOscAWave: 'triangle' },
    now: 200,
  }));

  assert.equal(result.kind, 'create');
  assert.equal(result.version, 1);
  assert.equal(result.entry.author, 'user');
  assert.equal(result.entry.library, 'user');
  assert.equal(result.entry.visibility, 'private');
  assert.deepEqual(result.entry.tags, ['factory']);
  assert.equal(store.saves, 1);
});

test('same logical key is serialized while unrelated keys may proceed', async () => {
  const store = new MemoryStore();
  const service = new PresetCommandService(store);
  const first = service.save(baseCommand({ now: 100 }));
  const second = service.save(baseCommand({ data: { padOscAWave: 'square' }, now: 200 }));
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.version, 1);
  assert.equal(secondResult.version, 2);
  assert.equal(store.saves, 2);
  assert.equal(store.entry?.currentVersion, 2);
});

test('save, metadata update, and remove share one mutation lane and preserve CAS options', async () => {
  const store = new MemoryStore();
  store.entry = {
    ...buildPresetSavePlan(null, baseCommand()).entry,
    id: 'stable-command-id',
  };
  const gate = deferred();
  store.saveGate = gate.promise;
  const service = new PresetCommandService(store);
  const expectedUpdatedAt = '2026-07-31T12:34:56.123456+00';

  const save = service.save(baseCommand({
    data: { padOscAWave: 'square' },
    now: 200,
  }));
  await new Promise<void>(resolve => setImmediate(resolve));
  const metadata = service.updateMetadata(
    'engine',
    'Command Test',
    { description: 'Queued metadata' },
    'pad1',
    { targetId: 'stable-command-id', expectedUpdatedAt },
  );
  const remove = service.remove('engine', 'Command Test', 'pad1');
  await new Promise<void>(resolve => setImmediate(resolve));

  assert.deepEqual(store.events, ['save:start:Command Test']);
  gate.resolve();
  await Promise.all([save, metadata, remove]);

  assert.deepEqual(store.events, [
    'save:start:Command Test',
    'save:end:Command Test',
    'metadata:Command Test',
    'delete:Command Test',
  ]);
  assert.deepEqual(store.lastMetadataOptions, {
    targetId: 'stable-command-id',
    expectedUpdatedAt,
  });
});

test('metadata false and CAS conflict outcomes propagate without poisoning the lane', async () => {
  const missingStore = new MemoryStore();
  const missingService = new PresetCommandService(missingStore);
  assert.equal(
    await missingService.updateMetadata('engine', 'Missing', { rating: 3 }, 'pad1'),
    false,
    'a missing metadata target must remain distinguishable from success',
  );

  const store = new MemoryStore();
  store.entry = buildPresetSavePlan(null, baseCommand()).entry;
  store.failNextMetadataConflict = true;
  const service = new PresetCommandService(store);
  await assert.rejects(
    () => service.updateMetadata('engine', 'Command Test', { rating: 4 }, 'pad1'),
    (error: unknown) => error instanceof PresetMetadataConflictError,
  );
  assert.equal(store.entry.rating, undefined, 'a rejected CAS edit must not be applied');

  const saved = await service.save(baseCommand({
    data: { padOscAWave: 'square' },
    now: 200,
  }));
  assert.equal(saved.version, 2, 'the next mutation should proceed after a CAS conflict');
});

test('rename reserves old and new keys so a save follows the stable identity', async () => {
  const store = new MemoryStore();
  store.entry = {
    ...buildPresetSavePlan(null, baseCommand({ name: 'Before Rename' })).entry,
    id: 'stable-rename-id',
  };
  const gate = deferred();
  store.renameGate = gate.promise;
  const service = new PresetCommandService(store);

  const rename = service.rename('engine', 'Before Rename', 'After Rename', 'pad1');
  await new Promise<void>(resolve => setImmediate(resolve));
  const save = service.save(baseCommand({
    name: 'After Rename',
    data: { padOscAWave: 'triangle' },
    now: 200,
  }));
  await new Promise<void>(resolve => setImmediate(resolve));

  assert.deepEqual(store.events, ['rename:start:Before Rename->After Rename']);
  gate.resolve();
  const [renamed, saved] = await Promise.all([rename, save]);

  assert.equal(renamed?.id, 'stable-rename-id');
  assert.equal(saved.entry.id, 'stable-rename-id');
  assert.equal(saved.entry.name, 'After Rename');
  assert.equal(saved.entry.currentVersion, 2);
  assert.deepEqual(store.events, [
    'rename:start:Before Rename->After Rename',
    'rename:end:Before Rename->After Rename',
    'save:start:After Rename',
    'save:end:After Rename',
  ]);
});

test('unrelated preset keys remain concurrent', async () => {
  const store = new MemoryStore();
  const gate = deferred();
  const service = new PresetCommandService(store);
  let unrelatedStarted = false;

  const blocked = service.runExclusive('engine', 'pad1', 'Blocked', async () => {
    await gate.promise;
  });
  const unrelated = service.runExclusive('engine', 'pad1', 'Unrelated', async () => {
    unrelatedStarted = true;
  });
  await unrelated;

  assert.equal(unrelatedStarted, true);
  gate.resolve();
  await blocked;
});

test('a failed mutation releases the lane for the next operation', async () => {
  const store = new MemoryStore();
  store.entry = buildPresetSavePlan(null, baseCommand()).entry;
  store.failNextMetadataUpdate = true;
  const service = new PresetCommandService(store);

  const failed = service.updateMetadata('engine', 'Command Test', { rating: 2 }, 'pad1');
  const save = service.save(baseCommand({
    data: { padOscAWave: 'square' },
    now: 200,
  }));

  await assert.rejects(failed, /metadata write failed/);
  const saved = await save;
  assert.equal(saved.version, 2);
  assert.deepEqual(store.events, [
    'metadata:Command Test',
    'save:start:Command Test',
    'save:end:Command Test',
  ]);
});

test('store-scoped command service is shared across UI consumers', () => {
  const firstStore = new MemoryStore();
  const secondStore = new MemoryStore();

  assert.equal(getPresetCommandService(firstStore), getPresetCommandService(firstStore));
  assert.notEqual(getPresetCommandService(firstStore), getPresetCommandService(secondStore));
});

test('lazy local compaction cannot overwrite a queued save', async () => {
  const store = new MemoryStore();
  const first = buildPresetSavePlan(null, baseCommand({ now: 100 })).entry;
  store.entry = buildPresetSavePlan(first, baseCommand({
    data: { padOscAWave: 'square' },
    now: 200,
  })).entry;
  const service = new PresetCommandService(store);

  await Promise.all([
    service.compactLocalVersions('engine', 'Command Test', 'pad1'),
    service.save(baseCommand({ data: { padOscAWave: 'triangle' }, now: 300 })),
  ]);

  assert.equal(store.entry?.currentVersion, 3);
  assert.equal(store.entry && store.entry.versions.length >= 2, true);
  assert.equal(
    store.entry && store.entry.versions[store.entry.versions.length - 1]?.data.padOscAWave,
    'triangle',
  );
});
