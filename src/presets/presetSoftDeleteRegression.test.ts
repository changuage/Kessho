import assert from 'node:assert/strict';
import fs from 'node:fs';

import { extractCascade, extractParams } from './codec';
import { HybridPresetStore } from './HybridPresetStore';
import type { IPresetStore } from './PresetStore';
import { SupabasePresetStore } from './SupabasePresetStore';
import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import { DEFAULT_STATE } from '../ui/state';

type Filter =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'neq'; column: string; value: unknown }
  | { kind: 'is'; column: string; value: unknown }
  | { kind: 'notIs'; column: string; value: unknown }
  | { kind: 'in'; column: string; values: unknown[] };

interface FakePresetV2Row {
  id: string;
  owner_key: string;
  owner_user_id: string | null;
  type: string;
  scope: string | null;
  name: string;
  author: string;
  library: string;
  creator: string | null;
  description: string | null;
  tags: string[];
  visibility: string;
  family_name: string | null;
  variant_name: string | null;
  variant_rank: number | null;
  forked_from: string | null;
  latest_version_no: number;
  latest_version_id: string | null;
  latest_resolved_hash: string | null;
  latest_metadata_hash: string | null;
  play_count: number;
  rating: number | null;
  archived: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

interface FakePresetVersionV2Row {
  id: string;
  preset_id: string;
  version_no: number;
  created_by: string | null;
  parent_version_id: string | null;
  storage_mode: string;
  note: string;
  override_hash: string | null;
  metadata_hash: string | null;
  patch_from_prev_hash: string | null;
  resolved_hash: string | null;
  is_checkpoint: boolean;
  created_at: string;
}

interface FakePayloadV2Row {
  hash: string;
  payload_kind: string;
  payload: unknown;
  payload_bytes: number;
  created_at: string;
  last_seen_at: string;
}

type FakeRow = Record<string, unknown>;

class FakeSupabaseQuery {
  private filters: Filter[] = [];
  private orderColumn: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private mutation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: unknown;
  private wantsSingle = false;
  private wantsSelect = false;
  private selectOptions: { count?: 'exact'; head?: boolean } | undefined;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly tableName: string,
  ) {}

  select(_columns = '*', options?: { count?: 'exact'; head?: boolean }): this {
    this.wantsSelect = true;
    this.selectOptions = options;
    return this;
  }

  insert(payload: unknown): this {
    this.mutation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.mutation = 'update';
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown): this {
    this.mutation = 'upsert';
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.mutation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ kind: 'neq', column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: 'is', column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    assert.equal(operator, 'is');
    this.filters.push({ kind: 'notIs', column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ kind: 'in', column, values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.wantsSingle = true;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): unknown {
    if (this.mutation === 'insert') return this.executeInsert();
    if (this.mutation === 'update') return this.executeUpdate();
    if (this.mutation === 'upsert') return this.executeUpsert();
    if (this.mutation === 'delete') return this.executeDelete();
    return this.executeSelect();
  }

  private executeSelect(): unknown {
    const rows = this.selectedRows();
    if (this.selectOptions?.head) {
      return { data: null, error: null, count: rows.length };
    }
    return {
      data: this.wantsSingle ? (rows[0] ?? null) : rows,
      error: null,
      count: this.selectOptions?.count === 'exact' ? rows.length : null,
    };
  }

  private executeInsert(): unknown {
    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    const rows = payloads.map(payload => this.client.insert(this.tableName, payload as FakeRow));
    return {
      data: this.wantsSingle ? rows[0] : (this.wantsSelect ? rows : null),
      error: null,
    };
  }

  private executeUpdate(): unknown {
    const rows = this.selectedRows();
    for (const row of rows) {
      Object.assign(row, this.payload, { updated_at: this.client.now() });
    }
    return {
      data: this.wantsSingle ? (rows[0] ?? null) : (this.wantsSelect ? rows : null),
      error: null,
    };
  }

  private executeUpsert(): unknown {
    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    const rows = payloads.map(payload => this.client.upsert(this.tableName, payload as FakeRow));
    return {
      data: this.wantsSingle ? rows[0] : (this.wantsSelect ? rows : null),
      error: null,
    };
  }

  private executeDelete(): unknown {
    if (this.tableName === 'presets_v2') {
      this.client.presetsV2HardDeleteAttempts += 1;
      throw new Error('presets_v2 hard delete should not be used by app delete');
    }

    const rows = this.selectedRows();
    this.client.deleteRows(this.tableName, new Set(rows.map(row => row.id)));
    return { data: null, error: null };
  }

  private selectedRows(): FakeRow[] {
    let rows = [...this.client.rows(this.tableName)];
    rows = rows.filter(row => this.filters.every(filter => matchesFilter(row, filter)));
    if (this.orderColumn) {
      const column = this.orderColumn;
      const direction = this.orderAscending ? 1 : -1;
      rows.sort((left, right) => compareValues(left[column], right[column]) * direction);
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }
}

class FakeSupabaseClient {
  readonly tables = {
    presets_v2: [] as FakePresetV2Row[],
    preset_versions_v2: [] as FakePresetVersionV2Row[],
    preset_version_refs_v2: [] as FakeRow[],
    preset_payloads_v2: [] as FakePayloadV2Row[],
    presets: [] as FakeRow[],
  };
  presetsV2HardDeleteAttempts = 0;
  authUserId: string | null = null;
  private nextId = 1;
  private clock = Date.parse('2026-05-19T12:00:00.000Z');

  from(tableName: string): FakeSupabaseQuery {
    return new FakeSupabaseQuery(this, tableName);
  }

  async rpc(functionName: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
    if (functionName === 'kessho_soft_delete_preset_v2') {
      return this.softDeletePreset(String(args.target_preset_id));
    }

    return {
      data: null,
      error: { message: `unsupported fake rpc: ${functionName}` },
    };
  }

  rows(tableName: string): FakeRow[] {
    return (this.tables as unknown as Record<string, FakeRow[]>)[tableName] ?? [];
  }

  insert(tableName: string, payload: FakeRow): FakeRow {
    if (tableName === 'presets_v2') return this.insertPreset(payload);
    if (tableName === 'preset_versions_v2') return this.insertPresetVersion(payload);
    if (tableName === 'preset_payloads_v2') return this.upsert(tableName, payload);

    const row = { id: this.id(tableName), ...payload };
    this.rows(tableName).push(row);
    return row;
  }

  upsert(tableName: string, payload: FakeRow): FakeRow {
    if (tableName === 'preset_payloads_v2') {
      const existing = this.tables.preset_payloads_v2.find(row => row.hash === payload.hash);
      if (existing) {
        existing.last_seen_at = this.now();
        return existing as unknown as FakeRow;
      }
      const row: FakePayloadV2Row = {
        hash: String(payload.hash),
        payload_kind: String(payload.payload_kind),
        payload: payload.payload,
        payload_bytes: JSON.stringify(payload.payload ?? {}).length,
        created_at: this.now(),
        last_seen_at: this.now(),
      };
      this.tables.preset_payloads_v2.push(row);
      return row as unknown as FakeRow;
    }

    return this.insert(tableName, payload);
  }

  deleteRows(tableName: string, ids: Set<unknown>): void {
    const rows = this.rows(tableName);
    const kept = rows.filter(row => !ids.has(row.id));
    rows.splice(0, rows.length, ...kept);
    if (tableName === 'preset_versions_v2') {
      const refRows = this.rows('preset_version_refs_v2');
      const keptRefs = refRows.filter(row => !ids.has(row.version_id));
      refRows.splice(0, refRows.length, ...keptRefs);
    }
  }

  now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private insertPreset(payload: FakeRow): FakeRow {
    const timestamp = this.now();
    const row: FakePresetV2Row = {
      id: this.id('preset'),
      owner_key: String(payload.owner_key ?? 'public'),
      owner_user_id: (payload.owner_user_id as string | null | undefined) ?? null,
      type: String(payload.type),
      scope: (payload.scope as string | null | undefined) ?? null,
      name: String(payload.name),
      author: String(payload.author ?? 'user'),
      library: String(payload.library ?? 'cloud'),
      creator: (payload.creator as string | null | undefined) ?? null,
      description: (payload.description as string | null | undefined) ?? null,
      tags: (payload.tags as string[] | null | undefined) ?? [],
      visibility: String(payload.visibility ?? 'public'),
      family_name: (payload.family_name as string | null | undefined) ?? null,
      variant_name: (payload.variant_name as string | null | undefined) ?? null,
      variant_rank: (payload.variant_rank as number | null | undefined) ?? null,
      forked_from: (payload.forked_from as string | null | undefined) ?? null,
      latest_version_no: 0,
      latest_version_id: null,
      latest_resolved_hash: null,
      latest_metadata_hash: null,
      play_count: 0,
      rating: (payload.rating as number | null | undefined) ?? null,
      archived: false,
      deleted_at: null,
      deleted_by: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.tables.presets_v2.push(row);
    return row as unknown as FakeRow;
  }

  private insertPresetVersion(payload: FakeRow): FakeRow {
    const row: FakePresetVersionV2Row = {
      id: this.id('version'),
      preset_id: String(payload.preset_id),
      version_no: Number(payload.version_no),
      created_by: (payload.created_by as string | null | undefined) ?? null,
      parent_version_id: (payload.parent_version_id as string | null | undefined) ?? null,
      storage_mode: String(payload.storage_mode ?? 'snapshot'),
      note: String(payload.note ?? ''),
      override_hash: (payload.override_hash as string | null | undefined) ?? null,
      metadata_hash: (payload.metadata_hash as string | null | undefined) ?? null,
      patch_from_prev_hash: (payload.patch_from_prev_hash as string | null | undefined) ?? null,
      resolved_hash: (payload.resolved_hash as string | null | undefined) ?? null,
      is_checkpoint: Boolean(payload.is_checkpoint),
      created_at: String(payload.created_at ?? this.now()),
    };
    this.tables.preset_versions_v2.push(row);

    const preset = this.tables.presets_v2.find(candidate => candidate.id === row.preset_id);
    if (preset && preset.latest_version_no <= row.version_no) {
      preset.latest_version_no = row.version_no;
      preset.latest_version_id = row.id;
      preset.latest_resolved_hash = row.resolved_hash;
      preset.latest_metadata_hash = row.metadata_hash;
      preset.updated_at = this.now();
    }

    return row as unknown as FakeRow;
  }

  private id(prefix: string): string {
    const next = this.nextId++;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  private softDeletePreset(targetPresetId: string): { data: boolean | null; error: { message: string } | null } {
    const target = this.tables.presets_v2.find(row => row.id === targetPresetId && !row.deleted_at);
    if (!target || !this.authUserId || (target.owner_key !== 'public' && target.owner_user_id !== this.authUserId)) {
      return { data: false, error: null };
    }

    const blockers = this.activeRootsReferencing(target.id);

    if (blockers.length > 0) {
      return {
        data: null,
        error: {
          message: `Cannot recycle preset "${target.name}": active latest presets still reference it (${blockers.map(row => row.name).join(', ')})`,
        },
      };
    }

    target.deleted_at = this.now();
    target.deleted_by = this.authUserId;
    target.archived = true;
    target.updated_at = this.now();
    return { data: true, error: null };
  }

  private activeRootsReferencing(targetPresetId: string): FakePresetV2Row[] {
    const roots = this.tables.presets_v2.filter(row => !row.deleted_at && row.latest_version_id);
    const blockers: FakePresetV2Row[] = [];
    for (const root of roots) {
      const visited = new Set<string>();
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        if (current.id === targetPresetId && root.id !== targetPresetId) {
          blockers.push(root);
          break;
        }
        for (const ref of this.tables.preset_version_refs_v2.filter(candidate => candidate.version_id === current.latest_version_id)) {
          const child = this.tables.presets_v2.find(candidate => candidate.id === ref.target_preset_id);
          if (child) queue.push(child);
        }
      }
    }
    return blockers;
  }
}

function matchesFilter(row: FakeRow, filter: Filter): boolean {
  const value = row[filter.column];
  switch (filter.kind) {
    case 'eq':
      return value === filter.value;
    case 'neq':
      return value !== filter.value;
    case 'is':
      return filter.value === null ? value == null : value === filter.value;
    case 'notIs':
      return filter.value === null ? value != null : value !== filter.value;
    case 'in':
      return filter.values.includes(value);
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  return String(left).localeCompare(String(right));
}

function makePresetEntry(
  type: PresetLevel,
  scope: string,
  name: string,
  data: Record<string, unknown>,
  versions: Array<{ v: number; data: Record<string, unknown>; note?: string; metadata?: Record<string, unknown> }> = [{ v: 1, data }],
): PresetEntry {
  const now = Date.parse('2026-05-19T12:00:00.000Z');
  return {
    type,
    scope,
    engine: type === 'engine' ? scope : undefined,
    source: type !== 'engine' ? scope : undefined,
    name,
    author: 'user',
    library: 'cloud',
    creator: 'Soft Delete Regression',
    visibility: 'public',
    versions: versions.map(version => ({
      v: version.v,
      note: version.note ?? '',
      timestamp: now + version.v,
      data: version.data,
      ...(version.metadata ?? {}),
    })),
    currentVersion: Math.max(...versions.map(version => version.v)),
    createdAt: now,
    updatedAt: now + versions.length,
  };
}

function findPresetRow(
  client: FakeSupabaseClient,
  type: PresetLevel,
  scope: string,
  name: string,
): FakePresetV2Row {
  const row = client.tables.presets_v2.find(candidate => (
    candidate.type === type
    && candidate.scope === scope
    && candidate.name === name
  ));
  assert.ok(row, `expected ${type}:${scope}:${name} to exist`);
  return row;
}

function latestRefTarget(client: FakeSupabaseClient, parent: FakePresetV2Row, slot: string): FakePresetV2Row | null {
  const ref = client.tables.preset_version_refs_v2.find(candidate => (
    candidate.version_id === parent.latest_version_id
    && candidate.ref_slot === slot
  ));
  if (!ref) return null;
  return client.tables.presets_v2.find(candidate => candidate.id === ref.target_preset_id) ?? null;
}

function mutateFirstNumber(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  const key = Object.keys(next).find(candidate => typeof next[candidate] === 'number');
  assert.ok(key, 'expected preset data to include a numeric key to mutate');
  next[key] = Number(next[key]) + 0.123456;
  return next;
}

class NoopPresetStore implements IPresetStore {
  async save(_entry: PresetEntry): Promise<void> {}
  async load(_type: PresetLevel, _name: string, _scope?: string, _version?: number): Promise<PresetEntry | null> { return null; }
  async list(_type: PresetLevel, _scope?: string): Promise<PresetSummary[]> { return []; }
  async delete(_type: PresetLevel, _name: string, _scope?: string): Promise<void> {}
  async exists(_type: PresetLevel, _name: string, _scope?: string): Promise<boolean> { return false; }
  async findReferences(_type: PresetLevel, _name: string): Promise<string[]> { return []; }
  async getStorageUsed(): Promise<{ bytes: number; count: number }> { return { bytes: 0, count: 0 }; }
  async exportAll(): Promise<Blob> { return new Blob(); }
  async importAll(_json: string): Promise<number> { return 0; }
}

class FailingDeleteStore extends NoopPresetStore {
  async delete(_type: PresetLevel, name: string, _scope?: string): Promise<void> {
    throw new Error(`blocked delete for ${name}`);
  }
}

async function testSupabaseDeleteMovesPresetToRecycleBin(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '11111111-1111-4111-8111-111111111111';
  const presetName = 'Soft Delete Smoke';
  client.authUserId = userId;
  store.setUserId(userId);

  const entry: PresetEntry = {
    type: 'engine',
    scope: 'pad1',
    name: presetName,
    author: 'user',
    library: 'cloud',
    creator: 'Soft Delete Regression',
    visibility: 'public',
    versions: [{
      v: 1,
      note: 'create before soft delete',
      timestamp: Date.parse('2026-05-19T12:00:00.000Z'),
      data: {
        synthAttack: DEFAULT_STATE.synthAttack,
        synthRelease: DEFAULT_STATE.synthRelease,
      },
    }],
    currentVersion: 1,
    createdAt: Date.parse('2026-05-19T12:00:00.000Z'),
    updatedAt: Date.parse('2026-05-19T12:00:00.000Z'),
  };

  await store.save(entry);

  assert.equal(client.tables.presets_v2.length, 1, 'save should create a V2 preset row');
  assert.equal(client.tables.preset_versions_v2.length, 1, 'save should create a version row');
  assert.ok(client.tables.preset_payloads_v2.length > 0, 'save should store content-addressed payloads');
  assert.equal((await store.list('engine', 'pad1')).some(preset => preset.name === presetName), true);

  await store.delete('engine', presetName, 'pad1');

  const recycled = client.tables.presets_v2[0];
  assert.ok(recycled, 'soft delete should keep the preset row');
  assert.equal(client.presetsV2HardDeleteAttempts, 0, 'app delete must not hard-delete from presets_v2');
  assert.equal(client.tables.presets_v2.length, 1, 'soft delete should not remove the V2 preset row');
  assert.equal(client.tables.preset_versions_v2.length, 1, 'soft delete should keep version history for restore/purge');
  assert.equal(recycled.archived, true, 'soft delete should mark the row archived');
  assert.equal(recycled.deleted_by, userId, 'soft delete should record the deleting user');
  assert.equal(typeof recycled.deleted_at, 'string', 'soft delete should set deleted_at');
  assert.equal(await store.load('engine', presetName, 'pad1'), null, 'normal load should hide recycled presets');
  assert.equal((await store.list('engine', 'pad1')).some(preset => preset.name === presetName), false, 'normal list should hide recycled presets');
  assert.equal(await store.exists('engine', presetName, 'pad1'), false, 'normal existence checks should ignore recycled presets');
}

async function testActiveDependencyBlocksSoftDeleteAcrossL1ToL4(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '22222222-2222-4222-8222-222222222222';
  client.authUserId = userId;
  store.setUserId(userId);

  const padEngineData = extractParams(DEFAULT_STATE, 1, 'pad1');
  const padKitData = extractCascade(DEFAULT_STATE, 2, 'pad1Kit');
  const synthData = extractCascade(DEFAULT_STATE, 3, 'synth');
  const stateData = DEFAULT_STATE as unknown as Record<string, unknown>;

  await store.save(makePresetEntry('engine', 'pad1', 'Pad Engine Active Dependency', padEngineData));
  await store.save(makePresetEntry('kit', 'pad1Kit', 'Pad Kit Active Dependency', padKitData));
  const padEngine = findPresetRow(client, 'engine', 'pad1', 'Pad Engine Active Dependency');
  const padKit = findPresetRow(client, 'kit', 'pad1Kit', 'Pad Kit Active Dependency');
  assert.equal(latestRefTarget(client, padKit, 'pad1')?.id, padEngine.id, 'L2 latest version should reference the matching L1 preset');
  await assert.rejects(
    () => store.delete('engine', 'Pad Engine Active Dependency', 'pad1'),
    /active latest presets still reference it/,
    'active L2 -> L1 refs should block deleting the L1 preset',
  );
  assert.equal(padEngine.deleted_at, null, 'blocked L1 delete should leave the row active');

  await store.save(makePresetEntry('source', 'synth', 'Synth Active Dependency', synthData));
  const synth = findPresetRow(client, 'source', 'synth', 'Synth Active Dependency');
  assert.equal(latestRefTarget(client, synth, 'pad1Kit')?.id, padKit.id, 'L3 latest version should reference the matching L2 preset');
  await assert.rejects(
    () => store.delete('kit', 'Pad Kit Active Dependency', 'pad1Kit'),
    /active latest presets still reference it/,
    'active L3 -> L2 refs should block deleting the L2 preset',
  );
  assert.equal(padKit.deleted_at, null, 'blocked L2 delete should leave the row active');

  await store.save(makePresetEntry('state', 'global', 'State Active Dependency', stateData));
  const state = findPresetRow(client, 'state', 'global', 'State Active Dependency');
  assert.equal(latestRefTarget(client, state, 'synth')?.id, synth.id, 'L4 latest version should reference the matching L3 preset');
  await assert.rejects(
    () => store.delete('source', 'Synth Active Dependency', 'synth'),
    /active latest presets still reference it/,
    'active L4 -> L3 refs should block deleting the L3 preset',
  );
  assert.equal(synth.deleted_at, null, 'blocked L3 delete should leave the row active');
}

async function testHistoricalOnlyReferenceAllowsSoftDelete(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '33333333-3333-4333-8333-333333333333';
  client.authUserId = userId;
  store.setUserId(userId);

  const leadEngineA = extractParams(DEFAULT_STATE, 1, 'lead1');
  const leadEngineB = mutateFirstNumber(leadEngineA);
  const leadKitA = extractCascade(DEFAULT_STATE, 2, 'lead1Kit');
  const leadKitB = { ...leadKitA, ...leadEngineB };

  await store.save(makePresetEntry('engine', 'lead1', 'Lead Engine Historical Only', leadEngineA));
  await store.save(makePresetEntry(
    'kit',
    'lead1Kit',
    'Lead Kit Historical Parent',
    leadKitA,
    [
      { v: 1, data: leadKitA, note: 'references visible L1' },
      { v: 2, data: leadKitB, note: 'moves latest ref away from visible L1' },
    ],
  ));

  const leadEngine = findPresetRow(client, 'engine', 'lead1', 'Lead Engine Historical Only');
  const leadKit = findPresetRow(client, 'kit', 'lead1Kit', 'Lead Kit Historical Parent');
  assert.notEqual(latestRefTarget(client, leadKit, 'lead1')?.id, leadEngine.id, 'latest L2 version should no longer reference the historical L1');
  assert.equal(
    client.tables.preset_version_refs_v2.some(ref => ref.target_preset_id === leadEngine.id),
    true,
    'an older L2 version should still reference the L1',
  );

  await store.delete('engine', 'Lead Engine Historical Only', 'lead1');
  assert.equal(typeof leadEngine.deleted_at, 'string', 'historical-only refs should allow moving the L1 preset to recycle bin');
}

async function testLatestVersionRollupClearsStaleMetadata(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '55555555-5555-4555-8555-555555555555';
  client.authUserId = userId;
  store.setUserId(userId);

  const padDataV1 = extractParams(DEFAULT_STATE, 1, 'pad2');
  const padDataV2 = mutateFirstNumber(padDataV1);
  await store.save(makePresetEntry(
    'engine',
    'pad2',
    'Metadata Rollup Clears',
    padDataV1,
    [
      {
        v: 1,
        data: padDataV1,
        note: 'metadata version',
        metadata: {
          sliderModes: {
            synthAttack: 'walk',
          },
        },
      },
      {
        v: 2,
        data: padDataV2,
        note: 'no metadata version',
      },
    ],
  ));

  const row = findPresetRow(client, 'engine', 'pad2', 'Metadata Rollup Clears');
  const versions = client.tables.preset_versions_v2.filter(version => version.preset_id === row.id);
  const v1 = versions.find(version => version.version_no === 1);
  const v2 = versions.find(version => version.version_no === 2);
  assert.ok(v1, 'expected v1 to be stored');
  assert.ok(v2, 'expected v2 to be stored');
  assert.equal(row.latest_version_no, 2, 'latest version should roll up to v2');
  assert.equal(row.latest_version_id, v2.id, 'latest version id should point to v2');
  assert.equal(row.latest_metadata_hash, v2.metadata_hash, 'preset metadata rollup should exactly match latest version metadata');
}

function testRecycleBinSqlContainsGraphGuards(): void {
  const sql = fs.readFileSync('docs/preset_storage_v2_recycle_bin.sql', 'utf8');
  assert.match(sql, /kessho_guard_preset_recycle_update_v2/, 'SQL patch should guard direct deleted_at edits');
  assert.match(sql, /active_graph\(preset_id, version_id\)/, 'purge should compute active latest reachability');
  assert.match(sql, /historical_versions_to_prune/, 'purge should prune historical versions that only reference expired recycled rows');
  assert.match(sql, /active latest presets still reference it/, 'soft delete should block active parent dependencies');
}

async function testHybridSharedDeletePropagatesCloudFailure(): Promise<void> {
  const store = new HybridPresetStore(new NoopPresetStore(), new FailingDeleteStore());
  await assert.rejects(
    () => store.delete('state', 'Blocked State', 'global'),
    /blocked delete for Blocked State/,
    'hybrid shared-mode delete should not swallow cloud delete failures',
  );
}

async function testSharedV2DoesNotLeakLegacyRows(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '44444444-4444-4444-8444-444444444444';
  client.authUserId = userId;
  store.setUserId(userId);

  client.insert('presets', {
    user_id: userId,
    type: 'state',
    scope: 'global',
    name: 'Legacy Ghost State',
    author: 'user',
    library: 'cloud',
    creator: 'Legacy',
    description: null,
    tags: [],
    visibility: 'public',
    family_name: 'Legacy Ghost State',
    variant_name: 'Legacy Ghost State',
    variant_rank: null,
    versions: [{
      v: 1,
      note: 'legacy row should not leak into shared V2 list',
      timestamp: Date.parse('2026-05-19T12:00:00.000Z'),
      data: DEFAULT_STATE,
    }],
    current_version: 1,
    rating: null,
    plays: 0,
    created_at: client.now(),
    updated_at: client.now(),
  });

  assert.equal(
    (await store.list('state', 'global')).some(preset => preset.name === 'Legacy Ghost State'),
    false,
    'shared V2 list should not include legacy presets table rows',
  );
  assert.equal(
    await store.load('state', 'Legacy Ghost State', 'global'),
    null,
    'shared V2 load should not fall back to the legacy presets table',
  );
  assert.equal(
    await store.exists('state', 'Legacy Ghost State', 'global'),
    false,
    'shared V2 exists should not fall back to the legacy presets table',
  );
}

await testSupabaseDeleteMovesPresetToRecycleBin();
await testActiveDependencyBlocksSoftDeleteAcrossL1ToL4();
await testHistoricalOnlyReferenceAllowsSoftDelete();
await testLatestVersionRollupClearsStaleMetadata();
testRecycleBinSqlContainsGraphGuards();
await testHybridSharedDeletePropagatesCloudFailure();
await testSharedV2DoesNotLeakLegacyRows();
