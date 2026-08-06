import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiamondJourney, type JourneyConfig } from '../audio/journeyTypes';
import { getVersionData } from './codec';
import { getPresetCommandService } from './presetCommands';
import { PresetMetadataConflictError } from './PresetStore';
import {
  canRenameJourneyPreset,
  JourneyPresetNameConflictError,
  persistJourneyPreset,
} from './useJourneyPresets';
import { resolveJourneyPresetAction } from '../ui/JourneyModeView';
import type {
  PresetEntry,
  PresetLevel,
  PresetMetadataPatch,
  PresetMetadataUpdateOptions,
  PresetRenameIdentity,
  PresetSummary,
} from './types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function journeyConfig(name: string, autoAdvance: boolean, loopEnabled = true): JourneyConfig {
  const config = createDiamondJourney([]);
  config.name = name;
  config.autoAdvance = autoAdvance;
  config.loopEnabled = loopEnabled;
  return config;
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

class MemoryJourneySaveStore {
  private readonly entries = new Map<string, PresetEntry>();
  private nextId = 1;
  contentSaveCalls = 0;
  metadataSaveCalls = 0;
  renameCalls = 0;
  lastMetadataOptions: PresetMetadataUpdateOptions | undefined;
  onRename?: () => void | Promise<void>;

  private key(name: string): string {
    return name.trim().toLowerCase();
  }

  async load(type: PresetLevel, name: string): Promise<PresetEntry | null> {
    if (type !== 'journey') return null;
    const entry = this.entries.get(this.key(name));
    return entry ? clone(entry) : null;
  }

  async save(entry: PresetEntry): Promise<void> {
    this.contentSaveCalls += 1;
    const persisted = clone(entry);
    persisted.id ??= `journey-${this.nextId++}`;
    this.entries.set(this.key(entry.name), persisted);
  }

  replace(entry: PresetEntry): void {
    this.entries.set(this.key(entry.name), clone(entry));
  }

  async updateMetadata(
    type: PresetLevel,
    name: string,
    metadata: PresetMetadataPatch,
    _scope?: string,
    options?: PresetMetadataUpdateOptions,
  ): Promise<boolean> {
    if (type !== 'journey') return false;
    const entry = this.entries.get(this.key(name));
    if (!entry) return false;
    this.metadataSaveCalls += 1;
    this.lastMetadataOptions = options;
    if ('description' in metadata) entry.description = metadata.description ?? undefined;
    return true;
  }

  async rename(
    type: PresetLevel,
    name: string,
    nextName: string,
    _scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    this.renameCalls += 1;
    if (type !== 'journey') return null;
    const entry = this.entries.get(this.key(name));
    if (!entry) return null;
    await this.onRename?.();
    const renamed = {
      ...entry,
      name: nextName,
      ...(identity?.description === undefined ? {} : { description: identity.description }),
    };
    this.entries.delete(this.key(name));
    this.entries.set(this.key(nextName), renamed);
    return clone(renamed);
  }

  async delete(type: PresetLevel, name: string): Promise<void> {
    if (type === 'journey') this.entries.delete(this.key(name));
  }

  snapshot(name?: string): PresetEntry {
    const entry = name
      ? this.entries.get(this.key(name))
      : this.entries.values().next().value;
    if (!entry) throw new Error('Expected a saved Journey preset.');
    return clone(entry);
  }
}

test('a lost-response retry keeps the prior Journey graph as the undo backup', async () => {
  const store = new MemoryJourneySaveStore();
  const name = 'Retry-safe Journey';
  const graphA = journeyConfig(name, true);
  const graphB = journeyConfig(name, false);

  assert.equal((await persistJourneyPreset(store, name, graphA))?.kind, 'content');
  assert.equal((await persistJourneyPreset(store, name, graphB, { sourceName: name }))?.kind, 'content');
  const retry = await persistJourneyPreset(store, name, graphB, { sourceName: name });

  assert.equal(retry?.kind, 'noop');
  assert.equal(store.contentSaveCalls, 2, 'the retry must not append a duplicate content version');
  const stored = store.snapshot();
  assert.deepStrictEqual(stored.versions.map((version) => version.v), [1, 2]);
  assert.equal(getVersionData(stored, 1)?.autoAdvance, true, 'A remains the undo backup');
  assert.equal(getVersionData(stored, 2)?.autoAdvance, false, 'B remains the current graph');
});

test('a unique Journey Save As creates a new preset and preserves its source', async () => {
  const store = new MemoryJourneySaveStore();
  const sourceName = 'Save As source';
  const targetName = 'Save As copy';
  await persistJourneyPreset(store, sourceName, journeyConfig(sourceName, true));
  const source = store.snapshot(sourceName);

  const saved = await persistJourneyPreset(
    store,
    targetName,
    journeyConfig(sourceName, false),
    { sourceName },
  );

  assert.equal(saved?.kind, 'content');
  assert.equal(store.contentSaveCalls, 2);
  assert.equal(store.snapshot(sourceName).id, source.id, 'Save As must leave the source identity intact');
  assert.equal(getVersionData(store.snapshot(sourceName))?.autoAdvance, true);
  const copy = store.snapshot(targetName);
  assert.notEqual(copy.id, source.id, 'Save As creates a distinct Journey identity');
  assert.equal(getVersionData(copy)?.autoAdvance, false);
});

test('an unconfirmed duplicate Journey Save As fails without writing either preset', async () => {
  const store = new MemoryJourneySaveStore();
  const sourceName = 'Duplicate source';
  const targetName = 'Occupied Journey';
  await persistJourneyPreset(store, sourceName, journeyConfig(sourceName, true));
  await persistJourneyPreset(store, targetName, journeyConfig(targetName, false));
  const sourceBefore = store.snapshot(sourceName);
  const targetBefore = store.snapshot(targetName);

  await assert.rejects(
    () => persistJourneyPreset(
      store,
      targetName,
      journeyConfig(sourceName, false),
      { sourceName },
    ),
    (error: unknown) => {
      assert.ok(error instanceof JourneyPresetNameConflictError);
      assert.equal(error.code, 'JOURNEY_PRESET_NAME_CONFLICT');
      return true;
    },
  );

  assert.equal(store.contentSaveCalls, 2, 'an unconfirmed collision must not write content');
  assert.deepStrictEqual(store.snapshot(sourceName), sourceBefore);
  assert.deepStrictEqual(store.snapshot(targetName), targetBefore);
});

test('a Journey config label alone cannot authorize replacement of an existing preset', async () => {
  const store = new MemoryJourneySaveStore();
  const name = 'Unverified source';
  await persistJourneyPreset(store, name, journeyConfig(name, true));
  const before = store.snapshot(name);

  await assert.rejects(
    () => persistJourneyPreset(store, name, journeyConfig(name, false)),
    JourneyPresetNameConflictError,
  );

  assert.deepStrictEqual(store.snapshot(name), before);
  assert.equal(store.contentSaveCalls, 1);
});

test('an explicitly confirmed Journey Save As overwrites only the target identity', async () => {
  const store = new MemoryJourneySaveStore();
  const sourceName = 'Confirmed source';
  const targetName = 'Confirmed target';
  await persistJourneyPreset(store, sourceName, journeyConfig(sourceName, true));
  await persistJourneyPreset(store, targetName, journeyConfig(targetName, true));
  const sourceBefore = store.snapshot(sourceName);
  const targetBefore = store.snapshot(targetName);

  const saved = await persistJourneyPreset(
    store,
    targetName,
    journeyConfig(sourceName, false),
    { sourceName, overwriteExisting: true },
  );

  assert.equal(saved?.kind, 'content');
  const target = store.snapshot(targetName);
  assert.equal(target.id, targetBefore.id, 'confirmed overwrite preserves target stable identity');
  assert.equal(target.currentVersion, targetBefore.currentVersion + 1);
  assert.equal(getVersionData(target)?.autoAdvance, false);
  assert.deepStrictEqual(store.snapshot(sourceName), sourceBefore, 'confirmed overwrite never mutates the source');
});

test('a case-folded Journey Save As collision requires explicit overwrite intent', async () => {
  const store = new MemoryJourneySaveStore();
  const sourceName = 'Case source';
  await persistJourneyPreset(store, sourceName, journeyConfig(sourceName, true));
  await persistJourneyPreset(store, 'Taken Journey', journeyConfig('Taken Journey', true));

  await assert.rejects(
    () => persistJourneyPreset(
      store,
      'taken journey',
      journeyConfig(sourceName, false),
      { sourceName },
    ),
    JourneyPresetNameConflictError,
  );

  assert.equal(store.contentSaveCalls, 2);
  assert.equal(getVersionData(store.snapshot('Taken Journey'))?.autoAdvance, true);
});

test('Journey action outcomes treat resolved null and false as failures', async () => {
  const nullOutcome = await resolveJourneyPresetAction(
    async () => null as PresetEntry | null,
    (entry) => entry !== null,
    'Journey preset was not saved.',
  );
  const falseOutcome = await resolveJourneyPresetAction(
    async () => false,
    (deleted) => deleted,
    'Journey preset was not deleted.',
  );

  assert.deepStrictEqual(nullOutcome, { succeeded: false, error: 'Journey preset was not saved.' });
  assert.deepStrictEqual(falseOutcome, { succeeded: false, error: 'Journey preset was not deleted.' });
});

test('Journey metadata action outcomes reject false results and CAS conflicts', async () => {
  const falseOutcome = await resolveJourneyPresetAction(
    async () => false,
    (updated) => updated,
    'Journey rating was not saved.',
  );
  const conflictOutcome = await resolveJourneyPresetAction(
    async () => {
      throw new PresetMetadataConflictError('Journey metadata changed concurrently.');
    },
    (updated) => updated,
    'Journey rating was not saved.',
  );

  assert.deepStrictEqual(falseOutcome, { succeeded: false, error: 'Journey rating was not saved.' });
  assert.deepStrictEqual(conflictOutcome, {
    succeeded: false,
    error: 'Journey metadata changed concurrently.',
  });
});

test('a Journey description-only save uses metadata CAS without creating a version', async () => {
  const store = new MemoryJourneySaveStore();
  const name = 'Metadata-only Journey';
  const graph = journeyConfig(name, true);
  const summary = {
    id: 'summary-id',
    remoteId: 'remote-journey-id',
    updatedAtRevision: '2026-07-31 12:34:56.123456+00',
  } satisfies Pick<PresetSummary, 'id' | 'remoteId' | 'updatedAtRevision'>;

  assert.equal((await persistJourneyPreset(store, name, graph))?.kind, 'content');
  const result = await persistJourneyPreset(
    store,
    name,
    graph,
    { sourceName: name, description: '  Night route  ' },
    summary,
  );

  assert.equal(result?.kind, 'metadata');
  assert.equal(store.contentSaveCalls, 1, 'metadata must not write a graph version');
  assert.equal(store.metadataSaveCalls, 1);
  assert.equal(store.snapshot().versions.length, 1, 'metadata leaves version count untouched');
  assert.equal(store.snapshot().description, 'Night route');
  assert.deepStrictEqual(store.lastMetadataOptions, {
    targetId: 'remote-journey-id',
    expectedUpdatedAt: '2026-07-31 12:34:56.123456+00',
  });
});

test('a real Journey graph change still appends and keeps only the one-step undo pair', async () => {
  const store = new MemoryJourneySaveStore();
  const name = 'Capped Journey';
  const graphA = journeyConfig(name, true);
  const graphB = journeyConfig(name, false);
  const graphC = journeyConfig(name, true, false);

  await persistJourneyPreset(store, name, graphA);
  await persistJourneyPreset(store, name, graphB, { sourceName: name });
  const result = await persistJourneyPreset(store, name, graphC, { sourceName: name });

  assert.equal(result?.kind, 'content');
  assert.equal(store.contentSaveCalls, 3);
  const stored = store.snapshot();
  assert.deepStrictEqual(stored.versions.map((version) => version.v), [2, 3]);
  assert.equal(stored.currentVersion, 3);
  assert.equal(getVersionData(stored, 2)?.autoAdvance, false, 'B remains the undo backup');
  assert.equal(getVersionData(stored, 3)?.loopEnabled, false, 'C is the appended current graph');
});

test('a Journey rename reserves the destination key before a concurrent target save', async () => {
  const store = new MemoryJourneySaveStore();
  const sourceName = 'Rename source';
  const targetName = 'Rename target';
  await persistJourneyPreset(store, sourceName, journeyConfig(sourceName, true));
  const source = store.snapshot();
  const commandService = getPresetCommandService(store);
  const renameStarted = deferred();
  const releaseRename = deferred();
  const events: string[] = [];
  store.onRename = async () => {
    events.push('rename:start');
    renameStarted.resolve();
    await releaseRename.promise;
    events.push('rename:end');
  };

  const rename = commandService.rename('journey', sourceName, targetName);
  await renameStarted.promise;
  let targetSaveRan = false;
  const targetSave = commandService.runExclusive('journey', undefined, targetName, async () => {
    targetSaveRan = true;
    events.push('target-save');
    assert.equal(store.snapshot().name, targetName, 'the target action must observe the completed rename');
  });

  await Promise.resolve();
  assert.equal(targetSaveRan, false, 'the target key is reserved while rename is in flight');
  releaseRename.resolve();
  const [renamed] = await Promise.all([rename, targetSave]);

  assert.ok(renamed);
  assert.equal(renamed.id, source.id, 'rename preserves the stable preset id');
  assert.equal(renamed.currentVersion, source.currentVersion, 'rename preserves the current graph version');
  assert.deepStrictEqual(events, ['rename:start', 'rename:end', 'target-save']);
});

test('queued Journey rename blocks factory and stock entries before any store write', async () => {
  const store = new MemoryJourneySaveStore();
  const commandService = getPresetCommandService(store);
  const factoryName = 'Factory Journey';
  const stockName = 'Stock Journey';
  const userName = 'Mutable Journey';

  await persistJourneyPreset(store, factoryName, journeyConfig(factoryName, true));
  await persistJourneyPreset(store, stockName, journeyConfig(stockName, true));
  await persistJourneyPreset(store, userName, journeyConfig(userName, true));

  store.replace({ ...store.snapshot(factoryName), author: 'factory', library: 'user' });
  store.replace({ ...store.snapshot(stockName), author: 'user', library: 'stock' });
  const savesBefore = store.contentSaveCalls;

  const factoryRename = await commandService.rename(
    'journey',
    factoryName,
    'Factory Journey renamed',
    undefined,
    undefined,
    () => canRenameJourneyPreset(store, factoryName),
  );
  const stockRename = await commandService.rename(
    'journey',
    stockName,
    'Stock Journey renamed',
    undefined,
    undefined,
    () => canRenameJourneyPreset(store, stockName),
  );

  assert.equal(factoryRename, null);
  assert.equal(stockRename, null);
  assert.equal(store.renameCalls, 0, 'read-only preflight must stop the store rename itself');
  assert.equal(store.contentSaveCalls, savesBefore, 'a blocked rename must not save a replacement');
  assert.equal(store.snapshot(factoryName).name, factoryName);
  assert.equal(store.snapshot(stockName).name, stockName);

  const userBefore = store.snapshot(userName);
  const userRename = await commandService.rename(
    'journey',
    userName,
    'Mutable Journey renamed',
    undefined,
    undefined,
    () => canRenameJourneyPreset(store, userName),
  );

  assert.ok(userRename, 'a user-owned Journey remains renameable');
  assert.equal(store.renameCalls, 1);
  assert.equal(userRename.id, userBefore.id, 'a permitted rename preserves stable identity');
  assert.equal(store.snapshot('Mutable Journey renamed').id, userBefore.id);
});
