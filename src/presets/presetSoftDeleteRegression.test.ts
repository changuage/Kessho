import assert from 'node:assert/strict';
import fs from 'node:fs';

import { extractCascade, extractParams, getVersionData } from './codec';
import { HybridPresetStore } from './HybridPresetStore';
import { LocalStoragePresetStore, PresetMetadataConflictError, type IPresetStore } from './PresetStore';
import { evictPresetPayloadCacheV2, hashCanonicalJson } from './presetStorageV2';
import { SupabasePresetStore } from './SupabasePresetStore';
import { PresetCommandService } from './presetCommands';
import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import { DEFAULT_STATE } from '../ui/state';
import { createDiamondJourney } from '../audio/journeyTypes';
import { encodeJourneyPresetData, getJourneyNodeRefSlot } from './journeyPresetCodec';
import { extractOptimizedStatePresetData } from './statePresetOptimization';
import { DEFAULT_SOFT_RHODES } from '../audio/lead4opfm';
import { createLead4opFMPresetData } from './lead4opPresetPayload';

type Filter =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'ilike'; column: string; value: string }
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

  ilike(column: string, value: string): this {
    this.filters.push({ kind: 'ilike', column, value });
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
    preset_version_content_refs_v2: [] as FakeRow[],
    preset_payloads_v2: [] as FakePayloadV2Row[],
    presets: [] as FakeRow[],
  };
  presetsV2HardDeleteAttempts = 0;
  presetDetailRpcCalls = 0;
  presetLatestManifestRpcCalls = 0;
  presetPayloadRpcCalls = 0;
  journeyReferrerRpcCalls = 0;
  legacyDetailRpcCalls = 0;
  rpcCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
  failNextAtomicRefInsert = false;
  compactDetailPayloads = false;
  authUserId: string | null = null;
  hiddenPayloadKindConflictHashes = new Set<string>();
  private nextId = 1;
  private clock = Date.parse('2026-05-19T12:00:00.000Z');

  from(tableName: string): FakeSupabaseQuery {
    return new FakeSupabaseQuery(this, tableName);
  }

  async rpc(functionName: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
    this.rpcCalls.push({ functionName, args });

    if (functionName === 'kessho_soft_delete_preset_v2') {
      return this.softDeletePreset(String(args.target_preset_id));
    }

    if (functionName === 'kessho_restore_preset_v2') {
      return this.restorePreset(String(args.target_preset_id));
    }

    if (functionName === 'kessho_soft_delete_legacy_preset') {
      return this.softDeleteLegacyPreset(
        String(args.target_type),
        String(args.target_name),
        (args.target_scope as string | null | undefined) ?? null,
      );
    }

    if (functionName === 'kessho_prune_internal_derived_v2') {
      return this.pruneInternalDerived();
    }

    if (functionName === 'kessho_save_preset_v2') {
      return this.atomicSavePresetV2(args);
    }

    if (functionName === 'kessho_get_preset_detail_v2') {
      return this.getPresetDetailV2(args);
    }

    if (functionName === 'kessho_get_preset_latest_manifest_v2') {
      return this.getPresetLatestManifestV2(String(args.target_preset_id));
    }

    if (functionName === 'kessho_get_legacy_preset_detail') {
      return this.getLegacyPresetDetail(args);
    }

    if (functionName === 'kessho_lookup_preset_rows_v2') {
      return this.lookupPresetRowsV2(args);
    }

    if (functionName === 'kessho_lookup_preset_id_v2') {
      return this.lookupPresetIdV2(args);
    }

    if (functionName === 'kessho_exists_preset_logical_key_v2') {
      return this.existsPresetLogicalKeyV2(args);
    }

    if (functionName === 'kessho_get_preset_versions_v2') {
      return this.getPresetVersionsV2(String(args.target_preset_id));
    }

    if (functionName === 'kessho_get_preset_version_ref_keys_v2') {
      return this.getPresetVersionRefKeysV2(String(args.target_version_id));
    }

    if (functionName === 'kessho_get_latest_ref_targets_v2') {
      return this.getLatestRefTargetsV2(String(args.target_version_id));
    }

    if (functionName === 'kessho_get_preset_payloads_v2') {
      return this.getPresetPayloadsV2((args.target_hashes as string[] | null | undefined) ?? []);
    }

    if (functionName === 'kessho_get_missing_preset_payloads_v2') {
      return this.getPresetPayloadsV2((args.target_hashes as string[] | null | undefined) ?? []);
    }

    if (functionName === 'kessho_rename_preset_v2') {
      return this.renamePresetV2(String(args.target_preset_id), (args.rename_payload as FakeRow | null | undefined) ?? {});
    }

    if (functionName === 'kessho_update_preset_metadata_v2') {
      return this.updatePresetMetadataV2(
        String(args.target_preset_id),
        (args.metadata_payload as FakeRow | null | undefined) ?? {},
        args.expected_updated_at as string | null | undefined,
      );
    }

    if (functionName === 'kessho_rename_legacy_preset') {
      return this.renameLegacyPreset(String(args.target_preset_id), (args.rename_payload as FakeRow | null | undefined) ?? {});
    }

    if (functionName === 'kessho_find_preset_references_v2') {
      return this.findPresetReferencesV2(String(args.target_type), String(args.target_name));
    }

    if (functionName === 'kessho_find_journey_state_referrers_v2') {
      return this.findJourneyStateReferrersV2(String(args.target_preset_id));
    }

    if (functionName === 'kessho_get_preset_storage_stats_v2') {
      return this.getPresetStorageStatsV2();
    }

    if (functionName === 'kessho_save_legacy_preset') {
      return this.saveLegacyPreset((args.preset_payload as FakeRow | null | undefined) ?? {});
    }

    return {
      data: null,
      error: { message: `unsupported fake rpc: ${functionName}` },
    };
  }

  private findJourneyStateReferrersV2(targetPresetId: string): { data: unknown; error: { message: string } | null } {
    this.journeyReferrerRpcCalls += 1;
    if (!this.authUserId) {
      return {
        data: null,
        error: { message: 'Authentication is required to inspect journey references' },
      };
    }
    const target = this.tables.presets_v2.find(row => (
      row.id === targetPresetId
      && row.type === 'state'
      && !row.deleted_at
      && this.canReadPresetV2(row)
    ));
    if (!target) return { data: [], error: null };

    const candidates = new Map<string, FakePresetV2Row>();
    for (const ref of this.tables.preset_version_refs_v2) {
      if (ref.target_preset_id !== targetPresetId) continue;
      const version = this.tables.preset_versions_v2.find(row => row.id === ref.version_id);
      if (!version) continue;
      const parent = this.tables.presets_v2.find(row => (
        row.id === version.preset_id
        && row.type === 'journey'
        && row.latest_version_id === version.id
        && !row.deleted_at
        && this.canReadPresetV2(row)
      ));
      if (parent) candidates.set(parent.id, parent);
    }

    return {
      data: [...candidates.values()]
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
        .map(parent => ({
          id: parent.id,
          name: parent.name,
          currentVersion: parent.latest_version_no,
          updatedAtRevision: parent.updated_at,
        })),
      error: null,
    };
  }

  rows(tableName: string): FakeRow[] {
    if (tableName === 'preset_summaries_v2') {
      return this.tables.presets_v2.filter(row => (
        row.deleted_at == null
        && !this.isInternalDerived(row)
      )) as unknown as FakeRow[];
    }
    if (tableName === 'legacy_preset_summaries') {
      return this.tables.presets.filter(row => row.deleted_at == null) as FakeRow[];
    }
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
      const contentRefRows = this.rows('preset_version_content_refs_v2');
      const keptContentRefs = contentRefRows.filter(row => !ids.has(row.version_id));
      contentRefRows.splice(0, contentRefRows.length, ...keptContentRefs);
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
    this.pruneInternalDerived();
    return { data: true, error: null };
  }

  private restorePreset(targetPresetId: string): { data: boolean | null; error: { message: string } | null } {
    const target = this.tables.presets_v2.find(row => row.id === targetPresetId && !!row.deleted_at);
    if (!target || !this.authUserId || (target.owner_key !== 'public' && target.owner_user_id !== this.authUserId)) {
      return { data: false, error: null };
    }

    const graph: FakePresetV2Row[] = [];
    const visited = new Set<string>();
    const queue = [target];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      graph.push(current);
      for (const ref of this.tables.preset_version_refs_v2.filter(candidate => candidate.version_id === current.latest_version_id)) {
        const child = this.tables.presets_v2.find(candidate => candidate.id === ref.target_preset_id);
        if (child) queue.push(child);
      }
    }

    const blocked = graph.filter(row => row.id !== target.id && !!row.deleted_at && !this.isInternalDerived(row));
    if (blocked.length > 0) {
      return {
        data: null,
        error: {
          message: `Cannot restore preset "${target.name}": restore visible dependencies first (${blocked.map(row => row.name).join(', ')})`,
        },
      };
    }

    for (const row of graph) {
      if (row.id !== target.id && !this.isInternalDerived(row)) continue;
      row.deleted_at = null;
      row.deleted_by = null;
      row.archived = false;
      row.updated_at = this.now();
    }
    return { data: true, error: null };
  }

  private softDeleteLegacyPreset(
    targetType: string,
    targetName: string,
    targetScope: string | null,
  ): { data: boolean | null; error: { message: string } | null } {
    const normalizedName = targetName.trim().toLowerCase();
    const target = this.tables.presets.find(row => (
      row.type === targetType
      && String(row.name).trim().toLowerCase() === normalizedName
      && (row.scope ?? null) === targetScope
      && row.deleted_at == null
      && (row.user_id === this.authUserId || row.user_id == null)
    ));
    if (!target || !this.authUserId) return { data: false, error: null };

    target.deleted_at = this.now();
    target.deleted_by = this.authUserId;
    target.archived = true;
    target.updated_at = this.now();
    return { data: true, error: null };
  }

  private atomicSavePresetV2(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    const snapshot = {
      presets_v2: structuredClone(this.tables.presets_v2),
      preset_versions_v2: structuredClone(this.tables.preset_versions_v2),
      preset_version_refs_v2: structuredClone(this.tables.preset_version_refs_v2),
      preset_version_content_refs_v2: structuredClone(this.tables.preset_version_content_refs_v2),
      preset_payloads_v2: structuredClone(this.tables.preset_payloads_v2),
      nextId: this.nextId,
      clock: this.clock,
      failNextAtomicRefInsert: this.failNextAtomicRefInsert,
    };

    try {
      const identity = args.identity_payload as FakeRow;
      const version = args.version_payload as FakeRow;
      const payloads = (args.payloads_payload as FakeRow[] | undefined) ?? [];
      const refs = (args.refs_payload as FakeRow[] | undefined) ?? [];
      const contentRefs = (args.content_refs_payload as FakeRow[] | undefined) ?? [];

      for (const payload of payloads) {
        const hash = String(payload.hash);
        if (this.hiddenPayloadKindConflictHashes.has(hash)) {
          this.hiddenPayloadKindConflictHashes.delete(hash);
          throw new Error(`payload hash ${hash} already exists with a different payload_kind`);
        }
        this.upsert('preset_payloads_v2', {
          hash: payload.hash,
          payload_kind: payload.payload_kind,
          payload: payload.payload,
        });
      }

      const scope = (identity.scope as string | null | undefined) ?? null;
      const nameKey = String(identity.name).trim().toLowerCase();
      let preset = identity.id
        ? this.tables.presets_v2.find(row => row.id === identity.id && !row.deleted_at)
        : this.tables.presets_v2.find(row => (
          !row.deleted_at
          && row.owner_key === identity.owner_key
          && row.type === identity.type
          && (row.scope ?? null) === scope
          && row.name.trim().toLowerCase() === nameKey
        ));

      if (
        preset
        && (
          preset.owner_key !== identity.owner_key
          || preset.owner_user_id !== (identity.owner_user_id ?? null)
        )
      ) {
        throw new Error('owner-scoped save cannot update a visible cross-owner preset');
      }

      if (preset) {
        Object.assign(preset, {
          owner_key: identity.owner_key,
          owner_user_id: identity.owner_user_id ?? preset.owner_user_id,
          type: identity.type,
          scope,
          name: identity.name,
          author: identity.author,
          library: identity.library,
          creator: identity.creator,
          description: identity.description,
          tags: identity.tags ?? [],
          visibility: identity.visibility,
          family_name: identity.family_name,
          variant_name: identity.variant_name,
          variant_rank: identity.variant_rank,
          forked_from: identity.forked_from,
          rating: identity.rating,
          updated_at: this.now(),
        });
      } else {
        preset = this.insertPreset(identity) as unknown as FakePresetV2Row;
      }

      const versionRow = this.insertPresetVersion({
        ...version,
        preset_id: preset.id,
      }) as unknown as FakePresetVersionV2Row;

      if (this.failNextAtomicRefInsert) {
        this.failNextAtomicRefInsert = false;
        throw new Error('simulated atomic ref insert failure');
      }

      for (const ref of refs) {
        const target = this.tables.presets_v2.find(row => row.id === ref.target_preset_id && !row.deleted_at);
        if (!target) throw new Error(`missing ref target ${String(ref.target_preset_id)}`);
        this.tables.preset_version_refs_v2.push({
          version_id: versionRow.id,
          ref_slot: ref.ref_slot,
          target_preset_id: ref.target_preset_id,
          target_version_no: null,
          follow_latest: true,
          override_hash: ref.override_hash ?? null,
          created_at: ref.created_at ?? versionRow.created_at,
        });
      }
      for (const ref of contentRefs) {
        this.tables.preset_version_content_refs_v2.push({
          version_id: versionRow.id,
          ref_slot: ref.ref_slot,
          content_hash: ref.content_hash,
          content_type: ref.content_type,
          created_at: ref.created_at ?? versionRow.created_at,
        });
      }

      return {
        data: {
          preset,
          version: versionRow,
        },
        error: null,
      };
    } catch (error) {
      this.tables.presets_v2.splice(0, this.tables.presets_v2.length, ...snapshot.presets_v2);
      this.tables.preset_versions_v2.splice(0, this.tables.preset_versions_v2.length, ...snapshot.preset_versions_v2);
      this.tables.preset_version_refs_v2.splice(0, this.tables.preset_version_refs_v2.length, ...snapshot.preset_version_refs_v2);
      this.tables.preset_version_content_refs_v2.splice(0, this.tables.preset_version_content_refs_v2.length, ...snapshot.preset_version_content_refs_v2);
      this.tables.preset_payloads_v2.splice(0, this.tables.preset_payloads_v2.length, ...snapshot.preset_payloads_v2);
      this.nextId = snapshot.nextId;
      this.clock = snapshot.clock;
      this.failNextAtomicRefInsert = false;
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private getPresetDetailV2(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    this.presetDetailRpcCalls += 1;
    if (!this.authUserId) {
      return {
        data: null,
        error: { message: 'Authentication is required to load preset details' },
      };
    }

    const targetPresetId = (args.target_preset_id as string | null | undefined) ?? null;
    const targetType = (args.target_type as string | null | undefined) ?? null;
    const targetName = (args.target_name as string | null | undefined) ?? null;
    const targetScopes = (args.target_scopes as string[] | null | undefined) ?? null;
    const targetVersionNo = (args.target_version_no as number | null | undefined) ?? null;
    const normalizedName = targetName?.trim().toLowerCase() ?? null;
    const candidates = this.tables.presets_v2
      .filter(row => (
        !row.deleted_at
        && this.canReadPresetV2(row)
        && (
          targetPresetId
            ? row.id === targetPresetId
            : (
              row.type === targetType
              && row.name.trim().toLowerCase() === normalizedName
              && (
                targetScopes === null
                  ? row.scope === null
                  : targetScopes.includes(row.scope ?? '')
              )
            )
        )
      ))
      .sort((left, right) => {
        const leftOwn = left.owner_user_id === this.authUserId ? 0 : 1;
        const rightOwn = right.owner_user_id === this.authUserId ? 0 : 1;
        if (leftOwn !== rightOwn) return leftOwn - rightOwn;
        const leftFeatured = left.visibility === 'featured' ? 0 : 1;
        const rightFeatured = right.visibility === 'featured' ? 0 : 1;
        if (leftFeatured !== rightFeatured) return leftFeatured - rightFeatured;
        return right.updated_at.localeCompare(left.updated_at)
          || right.latest_version_no - left.latest_version_no
          || right.created_at.localeCompare(left.created_at);
      });
    const preset = candidates[0] ?? null;
    if (!preset) return { data: null, error: null };

    const versions = this.tables.preset_versions_v2
      .filter(row => (
        row.preset_id === preset.id
        && (targetVersionNo === null || row.version_no <= targetVersionNo)
      ))
      .sort((left, right) => left.version_no - right.version_no);
    const versionIds = new Set(versions.map(row => row.id));
    const refs = this.tables.preset_version_refs_v2
      .filter(row => versionIds.has(String(row.version_id)))
      .sort((left, right) => String(left.version_id).localeCompare(String(right.version_id))
        || String(left.ref_slot).localeCompare(String(right.ref_slot)));
    const contentRefs = this.tables.preset_version_content_refs_v2
      .filter(row => versionIds.has(String(row.version_id)))
      .sort((left, right) => String(left.version_id).localeCompare(String(right.version_id))
        || String(left.ref_slot).localeCompare(String(right.ref_slot)));
    const targetIds = new Set(refs.map(row => String(row.target_preset_id)));
    const targetPresets = this.tables.presets_v2
      .filter(row => targetIds.has(row.id) && !row.deleted_at && this.canReadPresetV2(row))
      .sort((left, right) => left.id.localeCompare(right.id));
    const payloadHashes = new Set<string>();
    for (const version of versions) {
      if (version.override_hash) payloadHashes.add(version.override_hash);
      if (version.metadata_hash) payloadHashes.add(version.metadata_hash);
      if (version.patch_from_prev_hash) payloadHashes.add(version.patch_from_prev_hash);
      if (version.resolved_hash) payloadHashes.add(version.resolved_hash);
    }
    for (const ref of refs) {
      if (ref.override_hash) payloadHashes.add(String(ref.override_hash));
    }
    for (const ref of contentRefs) payloadHashes.add(String(ref.content_hash));
    for (const target of targetPresets) {
      if (target.latest_resolved_hash) payloadHashes.add(target.latest_resolved_hash);
    }
    const payloads = this.tables.preset_payloads_v2
      .filter(row => payloadHashes.has(row.hash))
      .sort((left, right) => left.hash.localeCompare(right.hash));

    return {
      data: {
        preset,
        versions,
        refs,
        contentRefs,
        targetPresets,
        payloads: this.compactDetailPayloads ? payloads.map(row => row.payload) : payloads,
      },
      error: null,
    };
  }

  private getPresetLatestManifestV2(targetPresetId: string): { data: unknown; error: { message: string } | null } {
    this.presetLatestManifestRpcCalls += 1;
    if (!this.authUserId) {
      return {
        data: null,
        error: { message: 'Authentication is required to load preset manifests' },
      };
    }

    const preset = this.tables.presets_v2.find(row => (
      row.id === targetPresetId
      && !row.deleted_at
      && this.canReadPresetV2(row)
    ));
    if (!preset) return { data: null, error: null };

    const latestVersion = this.tables.preset_versions_v2
      .filter(row => row.preset_id === preset.id)
      .sort((left, right) => right.version_no - left.version_no || right.created_at.localeCompare(left.created_at))[0] ?? null;
    if (!latestVersion) return { data: null, error: null };

    const refs = this.tables.preset_version_refs_v2
      .filter(row => row.version_id === latestVersion.id)
      .sort((left, right) => String(left.ref_slot).localeCompare(String(right.ref_slot)));
    const contentRefs = this.tables.preset_version_content_refs_v2
      .filter(row => row.version_id === latestVersion.id)
      .sort((left, right) => String(left.ref_slot).localeCompare(String(right.ref_slot)));
    const targetIds = new Set(refs.map(row => String(row.target_preset_id)));
    const targetPresets = this.tables.presets_v2
      .filter(row => targetIds.has(row.id) && !row.deleted_at && this.canReadPresetV2(row))
      .sort((left, right) => left.id.localeCompare(right.id));
    const requiredHashes = new Set<string>();
    if (latestVersion.override_hash) requiredHashes.add(latestVersion.override_hash);
    if (latestVersion.metadata_hash) requiredHashes.add(latestVersion.metadata_hash);
    if (latestVersion.patch_from_prev_hash) requiredHashes.add(latestVersion.patch_from_prev_hash);
    if (latestVersion.resolved_hash) requiredHashes.add(latestVersion.resolved_hash);
    if (preset.latest_resolved_hash) requiredHashes.add(preset.latest_resolved_hash);
    if (preset.latest_metadata_hash) requiredHashes.add(preset.latest_metadata_hash);
    for (const ref of refs) {
      if (ref.override_hash) requiredHashes.add(String(ref.override_hash));
    }
    for (const ref of contentRefs) requiredHashes.add(String(ref.content_hash));
    for (const target of targetPresets) {
      if (target.latest_resolved_hash) requiredHashes.add(target.latest_resolved_hash);
    }

    return {
      data: {
        preset,
        latest_version: latestVersion,
        refs,
        content_refs: contentRefs,
        target_presets: targetPresets,
        required_hashes: [...requiredHashes].sort(),
      },
      error: null,
    };
  }

  private getLegacyPresetDetail(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    this.legacyDetailRpcCalls += 1;
    if (!this.authUserId) {
      return {
        data: null,
        error: { message: 'Authentication is required to load legacy preset details' },
      };
    }

    const targetPresetId = (args.target_preset_id as string | null | undefined) ?? null;
    const targetType = (args.target_type as string | null | undefined) ?? null;
    const targetName = (args.target_name as string | null | undefined) ?? null;
    const targetScopes = (args.target_scopes as string[] | null | undefined) ?? null;
    const normalizedName = targetName?.trim().toLowerCase() ?? null;
    const candidates = this.tables.presets
      .filter(row => (
        row.deleted_at == null
        && (
          targetPresetId
            ? row.id === targetPresetId
            : (
              row.type === targetType
              && String(row.name).trim().toLowerCase() === normalizedName
              && (
                targetScopes === null
                  ? (row.scope ?? null) === null
                  : targetScopes.includes(String(row.scope ?? ''))
              )
            )
        )
        && (
          row.visibility === 'public'
          || row.visibility === 'featured'
          || row.user_id === this.authUserId
        )
      ))
      .sort((left, right) => {
        const leftOwn = left.user_id === this.authUserId ? 0 : 1;
        const rightOwn = right.user_id === this.authUserId ? 0 : 1;
        if (leftOwn !== rightOwn) return leftOwn - rightOwn;
        const leftFeatured = left.visibility === 'featured' ? 0 : 1;
        const rightFeatured = right.visibility === 'featured' ? 0 : 1;
        if (leftFeatured !== rightFeatured) return leftFeatured - rightFeatured;
        return String(right.updated_at).localeCompare(String(left.updated_at))
          || Number(right.current_version ?? 0) - Number(left.current_version ?? 0)
          || String(right.created_at).localeCompare(String(left.created_at));
      });

    return {
      data: candidates[0] ?? null,
      error: null,
    };
  }

  private lookupPresetRowsV2(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    if (!this.authUserId) return { data: null, error: { message: 'Authentication is required to look up preset rows' } };

    const targetPresetId = (args.target_preset_id as string | null | undefined) ?? null;
    const targetType = (args.target_type as string | null | undefined) ?? null;
    const targetName = (args.target_name as string | null | undefined) ?? null;
    const targetScopes = (args.target_scopes as string[] | null | undefined) ?? null;
    const targetScopeIsNull = Boolean(args.target_scope_is_null);
    const targetResolvedHash = (args.target_resolved_hash as string | null | undefined) ?? null;
    const excludePresetId = (args.exclude_preset_id as string | null | undefined) ?? null;
    const includeDeleted = Boolean(args.include_deleted);
    const deletedOnly = Boolean(args.deleted_only);
    const includeInternalDerived = args.include_internal_derived !== false;
    const internalDerivedOnly = Boolean(args.internal_derived_only);
    const maxRows = Math.max(1, Math.min(Number(args.max_rows ?? 20), 1000));
    const normalizedName = targetName?.trim().toLowerCase() ?? null;

    const rows = this.tables.presets_v2
      .filter(row => (
        this.canReadPresetV2(row)
        && (!targetPresetId || row.id === targetPresetId)
        && (!targetType || row.type === targetType)
        && (!normalizedName || row.name.trim().toLowerCase() === normalizedName)
        && (
          (targetScopes === null && !targetScopeIsNull)
          || (targetScopeIsNull && row.scope === null)
          || (targetScopes !== null && targetScopes.includes(row.scope ?? ''))
        )
        && (!targetResolvedHash || row.latest_resolved_hash === targetResolvedHash)
        && (!excludePresetId || row.id !== excludePresetId)
        && (
          (deletedOnly && row.deleted_at !== null)
          || (!deletedOnly && (includeDeleted || row.deleted_at === null))
        )
        && (includeInternalDerived || !this.isInternalDerived(row))
        && (!internalDerivedOnly || this.isInternalDerived(row))
      ))
      .sort((left, right) => {
        const leftOwn = left.owner_user_id === this.authUserId ? 0 : 1;
        const rightOwn = right.owner_user_id === this.authUserId ? 0 : 1;
        if (leftOwn !== rightOwn) return leftOwn - rightOwn;
        const leftFeatured = left.visibility === 'featured' ? 0 : 1;
        const rightFeatured = right.visibility === 'featured' ? 0 : 1;
        if (leftFeatured !== rightFeatured) return leftFeatured - rightFeatured;
        return right.updated_at.localeCompare(left.updated_at)
          || right.latest_version_no - left.latest_version_no
          || right.created_at.localeCompare(left.created_at);
      })
      .slice(0, maxRows);

    return { data: rows, error: null };
  }

  private lookupPresetIdV2(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    if (!this.authUserId) return { data: null, error: { message: 'Authentication is required to look up preset ids' } };

    const targetType = (args.target_type as string | null | undefined) ?? null;
    const targetName = (args.target_name as string | null | undefined) ?? null;
    const targetScope = (args.target_scope as string | null | undefined) ?? null;
    const targetResolvedHash = (args.target_resolved_hash as string | null | undefined) ?? null;
    const normalizedName = targetName?.trim().toLowerCase() ?? null;

    const row = this.tables.presets_v2
      .filter(candidate => (
        this.canReadPresetV2(candidate)
        && candidate.deleted_at === null
        && (!targetType || candidate.type === targetType)
        && (!normalizedName || candidate.name.trim().toLowerCase() === normalizedName)
        && ((targetScope === null && candidate.scope === null) || candidate.scope === targetScope)
        && (!targetResolvedHash || candidate.latest_resolved_hash === targetResolvedHash)
      ))
      .sort((left, right) => {
        const leftOwn = left.owner_user_id === this.authUserId ? 0 : 1;
        const rightOwn = right.owner_user_id === this.authUserId ? 0 : 1;
        if (leftOwn !== rightOwn) return leftOwn - rightOwn;
        return right.latest_version_no - left.latest_version_no
          || right.updated_at.localeCompare(left.updated_at)
          || right.id.localeCompare(left.id);
      })[0] ?? null;

    return { data: row?.id ?? null, error: null };
  }

  private existsPresetLogicalKeyV2(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    if (!this.authUserId) return { data: null, error: { message: 'Authentication is required to check preset existence' } };

    const targetType = (args.target_type as string | null | undefined) ?? null;
    const targetName = (args.target_name as string | null | undefined) ?? null;
    const targetScope = (args.target_scope as string | null | undefined) ?? null;
    const normalizedName = targetName?.trim().toLowerCase() ?? null;

    const exists = this.tables.presets_v2.some(candidate => (
      this.canReadPresetV2(candidate)
      && candidate.deleted_at === null
      && (!targetType || candidate.type === targetType)
      && (!normalizedName || candidate.name.trim().toLowerCase() === normalizedName)
      && ((targetScope === null && candidate.scope === null) || candidate.scope === targetScope)
    ));

    return { data: exists, error: null };
  }

  private getPresetVersionsV2(targetPresetId: string): { data: unknown; error: { message: string } | null } {
    const preset = this.tables.presets_v2.find(row => row.id === targetPresetId && !row.deleted_at && this.canReadPresetV2(row));
    if (!preset) return { data: [], error: null };
    return {
      data: this.tables.preset_versions_v2
        .filter(row => row.preset_id === targetPresetId)
        .sort((left, right) => left.version_no - right.version_no),
      error: null,
    };
  }

  private getPresetVersionRefKeysV2(targetVersionId: string): { data: unknown; error: { message: string } | null } {
    if (!this.canReadVersion(targetVersionId)) return { data: [], error: null };
    return {
      data: [
        ...this.tables.preset_version_refs_v2
        .filter(row => row.version_id === targetVersionId)
        .map(row => [
          row.ref_slot,
          row.target_preset_id,
          row.target_version_no ?? 'latest',
          row.override_hash ?? '',
        ].join(':')),
        ...this.tables.preset_version_content_refs_v2
          .filter(row => row.version_id === targetVersionId)
          .map(row => ['content', row.ref_slot, row.content_type, row.content_hash].join(':')),
      ].sort(),
      error: null,
    };
  }

  private getLatestRefTargetsV2(targetVersionId: string): { data: unknown; error: { message: string } | null } {
    if (!this.canReadVersion(targetVersionId)) return { data: [], error: null };
    const rows = this.tables.preset_version_refs_v2
      .filter(row => row.version_id === targetVersionId)
      .map(row => ({
        ref_slot: row.ref_slot,
        target: this.tables.presets_v2.find(target => target.id === row.target_preset_id && !target.deleted_at && this.canReadPresetV2(target)),
      }))
      .filter(row => row.target);
    return { data: rows, error: null };
  }

  private getPresetPayloadsV2(targetHashes: string[]): { data: unknown; error: { message: string } | null } {
    this.presetPayloadRpcCalls += 1;
    const hashSet = new Set(targetHashes);
    return {
      data: this.tables.preset_payloads_v2.filter(row => hashSet.has(row.hash)).sort((left, right) => left.hash.localeCompare(right.hash)),
      error: null,
    };
  }

  private findPresetReferencesV2(targetType: string, targetName: string): { data: unknown; error: { message: string } | null } {
    const normalizedName = targetName.trim().toLowerCase();
    const targets = this.tables.presets_v2.filter(row => (
      row.type === targetType
      && row.name.trim().toLowerCase() === normalizedName
      && !row.deleted_at
      && this.canReadPresetV2(row)
    ));
    const targetIds = new Set(targets.map(row => row.id));
    const parentVersionIds = new Set(this.tables.preset_version_refs_v2
      .filter(row => targetIds.has(String(row.target_preset_id)))
      .map(row => String(row.version_id)));
    const parentIds = new Set(this.tables.preset_versions_v2
      .filter(row => parentVersionIds.has(row.id))
      .map(row => row.preset_id));
    const names = this.tables.presets_v2
      .filter(row => parentIds.has(row.id) && !row.deleted_at && this.canReadPresetV2(row))
      .map(row => row.name)
      .sort();
    return { data: [...new Set(names)], error: null };
  }

  private getPresetStorageStatsV2(): { data: unknown; error: { message: string } | null } {
    const presets = this.tables.presets_v2.filter(row => !row.deleted_at && !this.isInternalDerived(row) && this.canReadPresetV2(row));
    const presetIds = new Set(presets.map(row => row.id));
    const hashes = new Set<string>();
    for (const version of this.tables.preset_versions_v2.filter(row => presetIds.has(row.preset_id))) {
      if (version.override_hash) hashes.add(version.override_hash);
      if (version.metadata_hash) hashes.add(version.metadata_hash);
      if (version.patch_from_prev_hash) hashes.add(version.patch_from_prev_hash);
      if (version.resolved_hash) hashes.add(version.resolved_hash);
      for (const ref of this.tables.preset_version_refs_v2.filter(row => row.version_id === version.id)) {
        if (ref.override_hash) hashes.add(String(ref.override_hash));
      }
    }
    const bytes = this.tables.preset_payloads_v2
      .filter(row => hashes.has(row.hash))
      .reduce((sum, row) => sum + row.payload_bytes, 0);
    return { data: { bytes, count: presets.length }, error: null };
  }

  private saveLegacyPreset(payload: FakeRow): { data: unknown; error: { message: string } | null } {
    if (!this.authUserId) return { data: null, error: { message: 'Authentication is required to save legacy presets' } };
    const type = String(payload.type ?? '');
    const name = String(payload.name ?? '');
    if (!type) return { data: null, error: { message: 'Legacy preset type is required' } };
    if (!name) return { data: null, error: { message: 'Legacy preset name is required' } };
    const scope = (payload.scope as string | null | undefined) ?? null;
    const existing = this.tables.presets.find(row => (
      row.deleted_at == null
      && row.type === type
      && String(row.name).trim().toLowerCase() === name.trim().toLowerCase()
      && (row.scope ?? null) === scope
      && (row.user_id === this.authUserId || row.user_id == null)
    ));
    const row = {
      ...existing,
      ...payload,
      id: String(existing?.id ?? this.id('legacy')),
      user_id: this.authUserId,
      type,
      scope,
      name,
      visibility: payload.visibility ?? 'public',
      created_at: String(existing?.created_at ?? this.now()),
      updated_at: this.now(),
      deleted_at: null,
      archived: false,
    };
    if (existing) Object.assign(existing, row);
    else this.tables.presets.push(row);
    return { data: row, error: null };
  }

  private renamePresetV2(targetPresetId: string, payload: FakeRow): { data: unknown; error: { message: string } | null } {
    if (!this.authUserId) return { data: null, error: { message: 'Authentication is required to rename presets' } };
    const target = this.tables.presets_v2.find(row => (
      row.id === targetPresetId
      && !row.deleted_at
      && (row.owner_key === 'public' || row.owner_user_id === this.authUserId)
    ));
    if (!target) return { data: null, error: null };

    const nextName = String(payload.name ?? '').trim();
    if (!nextName) return { data: null, error: { message: 'Preset name is required' } };
    const conflict = this.tables.presets_v2.find(row => (
      row.id !== target.id
      && !row.deleted_at
      && row.owner_key === target.owner_key
      && row.type === target.type
      && (row.scope ?? null) === (target.scope ?? null)
      && row.name.trim().toLowerCase() === nextName.toLowerCase()
    ));
    if (conflict) return { data: null, error: { message: `A preset named "${nextName}" already exists` } };

    Object.assign(target, {
      name: nextName,
      creator: payload.creator ?? target.creator,
      description: payload.description ?? target.description,
      visibility: payload.visibility ?? target.visibility,
      family_name: payload.family_name ?? target.family_name,
      variant_name: payload.variant_name ?? target.variant_name,
      variant_rank: payload.variant_rank ?? target.variant_rank,
      rating: payload.rating ?? target.rating,
      tags: payload.tags ?? target.tags,
      updated_at: this.now(),
    });
    return { data: target, error: null };
  }

  private updatePresetMetadataV2(
    targetPresetId: string,
    payload: FakeRow,
    expectedUpdatedAt: string | null | undefined,
  ): { data: unknown; error: { message: string; code?: string } | null } {
    if (!this.authUserId) {
      return { data: null, error: { message: 'Authentication is required to update preset metadata' } };
    }
    const target = this.tables.presets_v2.find(row => (
      row.id === targetPresetId
      && !row.deleted_at
      && (row.owner_key === 'public' || row.owner_user_id === this.authUserId)
    ));
    if (!target) return { data: null, error: null };
    if (expectedUpdatedAt != null && target.updated_at !== expectedUpdatedAt) {
      return {
        data: null,
        error: {
          code: '40001',
          message: `Preset metadata changed concurrently (expected ${expectedUpdatedAt}, found ${target.updated_at})`,
        },
      };
    }

    const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
    const nullableText = (value: unknown) => typeof value === 'string' && value !== '' ? value : null;
    if (has('creator')) target.creator = nullableText(payload.creator);
    if (has('description')) target.description = nullableText(payload.description);
    if (has('visibility') && payload.visibility !== null) target.visibility = String(payload.visibility);
    if (has('family_name')) target.family_name = nullableText(payload.family_name);
    if (has('variant_name')) target.variant_name = nullableText(payload.variant_name);
    if (has('variant_rank')) target.variant_rank = payload.variant_rank == null ? null : Number(payload.variant_rank);
    if (has('rating')) target.rating = payload.rating == null ? null : Number(payload.rating);
    if (has('tags')) target.tags = Array.isArray(payload.tags) ? payload.tags.map(String) : [];
    target.updated_at = this.now();
    return { data: target, error: null };
  }

  private renameLegacyPreset(targetPresetId: string, payload: FakeRow): { data: unknown; error: { message: string } | null } {
    if (!this.authUserId) return { data: null, error: { message: 'Authentication is required to rename legacy presets' } };
    const target = this.tables.presets.find(row => (
      row.id === targetPresetId
      && row.deleted_at == null
      && (row.user_id === this.authUserId || row.user_id == null)
    ));
    if (!target) return { data: null, error: null };

    const nextName = String(payload.name ?? '').trim();
    if (!nextName) return { data: null, error: { message: 'Preset name is required' } };
    const conflict = this.tables.presets.find(row => (
      row.id !== target.id
      && row.deleted_at == null
      && row.type === target.type
      && (row.scope ?? null) === (target.scope ?? null)
      && String(row.name).trim().toLowerCase() === nextName.toLowerCase()
      && (row.user_id === this.authUserId || row.user_id == null)
    ));
    if (conflict) return { data: null, error: { message: `A preset named "${nextName}" already exists` } };

    Object.assign(target, {
      name: nextName,
      creator: payload.creator ?? target.creator,
      description: payload.description ?? target.description,
      visibility: payload.visibility ?? target.visibility,
      family_name: payload.family_name ?? target.family_name,
      variant_name: payload.variant_name ?? target.variant_name,
      variant_rank: payload.variant_rank ?? target.variant_rank,
      rating: payload.rating ?? target.rating,
      tags: payload.tags ?? target.tags,
      updated_at: this.now(),
    });
    return { data: target, error: null };
  }

  private canReadVersion(versionId: string): boolean {
    const version = this.tables.preset_versions_v2.find(row => row.id === versionId);
    const preset = version ? this.tables.presets_v2.find(row => row.id === version.preset_id) : null;
    return !!preset && !preset.deleted_at && this.canReadPresetV2(preset);
  }

  private canReadPresetV2(row: FakePresetV2Row): boolean {
    return row.visibility === 'public'
      || row.visibility === 'featured'
      || row.owner_key === 'public'
      || row.owner_user_id === this.authUserId;
  }

  private activeRootsReferencing(targetPresetId: string): FakePresetV2Row[] {
    const roots = this.tables.presets_v2.filter(row => (
      !row.deleted_at
      && row.latest_version_id
      && !this.isInternalDerived(row)
    ));
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

  private pruneInternalDerived(): { data: number; error: null } {
    const protectedIds = this.retainedVisibleGraphPresetIds();
    let deletedCount = 0;
    for (const row of this.tables.presets_v2) {
      if (row.deleted_at || !this.isInternalDerived(row) || protectedIds.has(row.id)) continue;
      row.deleted_at = this.now();
      row.deleted_by = null;
      row.archived = true;
      row.updated_at = this.now();
      deletedCount += 1;
    }
    return { data: deletedCount, error: null };
  }

  private retainedVisibleGraphPresetIds(): Set<string> {
    const protectedIds = new Set<string>();
    const queue = this.tables.presets_v2.filter(row => (
      row.latest_version_id
      && !this.isInternalDerived(row)
    ));
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (protectedIds.has(current.id)) continue;
      protectedIds.add(current.id);
      for (const ref of this.tables.preset_version_refs_v2.filter(candidate => candidate.version_id === current.latest_version_id)) {
        const child = this.tables.presets_v2.find(candidate => (
          candidate.id === ref.target_preset_id
          && candidate.latest_version_id
        ));
        if (child) queue.push(child);
      }
    }
    return protectedIds;
  }

  private isInternalDerived(row: Pick<FakePresetV2Row, 'name' | 'tags'>): boolean {
    return row.name.startsWith('__derived__/') || row.tags.includes('internal-derived');
  }
}

function matchesFilter(row: FakeRow, filter: Filter): boolean {
  const value = filter.column === 'name_key'
    ? String(row.name ?? '').trim().toLowerCase()
    : row[filter.column];
  switch (filter.kind) {
    case 'eq':
      return value === filter.value;
    case 'ilike':
      return String(value ?? '').trim().toLowerCase() === filter.value.trim().toLowerCase();
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
  scope: string | null,
  name: string,
): FakePresetV2Row {
  const row = client.tables.presets_v2.find(candidate => (
    candidate.type === type
    && candidate.scope === scope
    && candidate.name === name
  ));
  assert.ok(row, `expected ${type}:${scope ?? ''}:${name} to exist`);
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

function isInternalDerivedPresetRow(row: Pick<FakePresetV2Row, 'name' | 'tags'>): boolean {
  return row.name.startsWith('__derived__/') || row.tags.includes('internal-derived');
}

function activeInternalDerivedRows(client: FakeSupabaseClient): FakePresetV2Row[] {
  return client.tables.presets_v2.filter(row => row.deleted_at == null && isInternalDerivedPresetRow(row));
}

function hardPurgeFakePreset(client: FakeSupabaseClient, presetId: string): void {
  const versionIds = new Set(client.tables.preset_versions_v2
    .filter(version => version.preset_id === presetId)
    .map(version => version.id));
  client.tables.preset_version_refs_v2.splice(
    0,
    client.tables.preset_version_refs_v2.length,
    ...client.tables.preset_version_refs_v2.filter(ref => !versionIds.has(String(ref.version_id))),
  );
  client.tables.preset_version_content_refs_v2.splice(
    0,
    client.tables.preset_version_content_refs_v2.length,
    ...client.tables.preset_version_content_refs_v2.filter(ref => !versionIds.has(String(ref.version_id))),
  );
  client.tables.preset_versions_v2.splice(
    0,
    client.tables.preset_versions_v2.length,
    ...client.tables.preset_versions_v2.filter(version => version.preset_id !== presetId),
  );
  client.tables.presets_v2.splice(
    0,
    client.tables.presets_v2.length,
    ...client.tables.presets_v2.filter(preset => preset.id !== presetId),
  );
}

function activeLogicalRows(
  client: FakeSupabaseClient,
  type: PresetLevel,
  scope: string | null,
  name: string,
): FakePresetV2Row[] {
  const nameKey = name.trim().toLowerCase();
  return client.tables.presets_v2.filter(row => (
    row.deleted_at == null
    && row.type === type
    && row.scope === scope
    && row.name.trim().toLowerCase() === nameKey
  ));
}

function makeInternalDerivedEntry(
  type: PresetLevel,
  scope: string,
  name: string,
  data: Record<string, unknown>,
): PresetEntry {
  return {
    ...makePresetEntry(type, scope, name, data),
    author: 'cloud',
    creator: 'Soft Delete Internal Derived Regression',
    description: `Hidden derived child preset for ${scope}.`,
    familyName: `__derived__/${scope}`,
    library: 'cloud',
    tags: ['internal-derived', 'auto-child', `scope:${scope}`],
    visibility: 'private',
  };
}

class NoopPresetStore implements IPresetStore {
  async save(_entry: PresetEntry): Promise<void> {}
  async load(_type: PresetLevel, _name: string, _scope?: string, _version?: number): Promise<PresetEntry | null> { return null; }
  async loadById(_id: string, _version?: number): Promise<PresetEntry | null> { return null; }
  async list(_type: PresetLevel, _scope?: string): Promise<PresetSummary[]> { return []; }
  async rename(_type: PresetLevel, _name: string, _nextName: string, _scope?: string): Promise<PresetEntry | null> { return null; }
  async updateMetadata(): Promise<boolean> { return false; }
  async delete(_type: PresetLevel, _name: string, _scope?: string): Promise<void> {}
  async exists(_type: PresetLevel, _name: string, _scope?: string): Promise<boolean> { return false; }
  async findReferences(_type: PresetLevel, _name: string): Promise<string[]> { return []; }
  async findCurrentReferenceCandidates(): Promise<[]> { return []; }
  async getStorageUsed(): Promise<{ bytes: number; count: number }> { return { bytes: 0, count: 0 }; }
  async exportAll(): Promise<Blob> { return new Blob(); }
  async importAll(_json: string): Promise<number> { return 0; }
}

class FailingDeleteStore extends NoopPresetStore {
  async delete(_type: PresetLevel, name: string, _scope?: string): Promise<void> {
    throw new Error(`blocked delete for ${name}`);
  }
}

function installMemoryLocalStorage(): () => void {
  const values = new Map<string, string>();
  const storage = {
    get length(): number { return values.size; },
    clear(): void { values.clear(); },
    getItem(key: string): string | null { return values.get(key) ?? null; },
    key(index: number): string | null { return [...values.keys()][index] ?? null; },
    removeItem(key: string): void { values.delete(key); },
    setItem(key: string, value: string): void { values.set(key, String(value)); },
  } as Storage;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  };
}

async function testSupabaseMetadataUpdateUsesExactTimestampCas(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '58585858-5858-4858-8858-585858585858';
  const name = 'Metadata CAS';
  client.authUserId = userId;
  store.setUserId(userId);
  await store.save(makePresetEntry('engine', 'pad1', name, extractParams(DEFAULT_STATE, 1, 'pad1')));

  const row = findPresetRow(client, 'engine', 'pad1', name);
  const rawRevision = '2026-07-30T22:50:32.123456+00';
  row.updated_at = rawRevision;
  const [summary] = await store.list('engine', 'pad1');
  assert.ok(summary, 'saved cloud preset should be listed');
  assert.equal(summary.updatedAtRevision, rawRevision, 'list must retain PostgreSQL microseconds verbatim');
  const loaded = await store.load('engine', name, 'pad1');
  assert.equal(loaded?.updatedAtRevision, rawRevision, 'detail loads must retain the same opaque revision');

  const lookupCallsBefore = client.rpcCalls.filter(call => call.functionName === 'kessho_lookup_preset_rows_v2').length;
  assert.equal(
    await store.updateMetadata('engine', name, { description: 'Updated with exact CAS' }, 'pad1', {
      targetId: summary.remoteId,
      expectedUpdatedAt: summary.updatedAtRevision,
    }),
    true,
  );
  const updateCalls = client.rpcCalls.filter(call => call.functionName === 'kessho_update_preset_metadata_v2');
  const updateCall = updateCalls[updateCalls.length - 1];
  assert.equal(updateCall?.args.expected_updated_at, rawRevision, 'RPC must receive the unrounded PostgreSQL timestamp');
  assert.equal(
    client.rpcCalls.filter(call => call.functionName === 'kessho_lookup_preset_rows_v2').length,
    lookupCallsBefore,
    'summary identity and revision should avoid a metadata-update preflight query',
  );

  row.updated_at = '2026-07-30T22:50:33.654321+00';
  const descriptionBeforeConflict = row.description;
  await assert.rejects(
    () => store.updateMetadata('engine', name, { description: 'Stale edit must not win' }, 'pad1', {
      targetId: summary.remoteId,
      expectedUpdatedAt: rawRevision,
    }),
    (error: unknown) => error instanceof PresetMetadataConflictError,
    'a stale metadata edit should surface as a typed conflict',
  );
  assert.equal(row.description, descriptionBeforeConflict, 'a conflict must not clobber concurrent metadata');

  const directRevision = '2026-07-30T22:50:34.654321+00';
  row.updated_at = directRevision;
  assert.equal(await store.updateMetadata('engine', name, { rating: 4 }, 'pad1'), true);
  const directUpdateCalls = client.rpcCalls.filter(call => call.functionName === 'kessho_update_preset_metadata_v2');
  const directUpdateCall = directUpdateCalls[directUpdateCalls.length - 1];
  assert.equal(
    directUpdateCall?.args.expected_updated_at,
    directRevision,
    'callers without a list revision should fetch one before updating instead of sending null',
  );
}

async function testSignatureEqualIdentityUsesCasAndNoteCreatesVersion(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '59595959-5959-4959-8959-595959595958';
  const name = 'Signature Equal Identity';
  client.authUserId = userId;
  store.setUserId(userId);
  const entry = makePresetEntry('engine', 'pad1', name, extractParams(DEFAULT_STATE, 1, 'pad1'));
  await store.save(entry);

  const preset = findPresetRow(client, 'engine', 'pad1', name);
  const originalRevision = preset.updated_at;
  const originalVersionCount = client.tables.preset_versions_v2.filter(row => row.preset_id === preset.id).length;
  const originalPayloadCount = client.tables.preset_payloads_v2.length;
  const originalAtomicCalls = client.rpcCalls.filter(call => call.functionName === 'kessho_save_preset_v2').length;
  const originalMetadataCalls = client.rpcCalls.filter(call => call.functionName === 'kessho_update_preset_metadata_v2').length;
  entry.description = 'CAS-persisted root metadata';
  entry.tags = ['identity-only'];
  entry.versions.push({
    v: 2,
    note: '',
    timestamp: entry.updatedAt + 1,
    data: structuredClone(entry.versions[0]!.data),
  });
  entry.currentVersion = 2;
  await store.save(entry);

  assert.equal(
    client.tables.preset_versions_v2.filter(row => row.preset_id === preset.id).length,
    originalVersionCount,
    'identity/tag-only save should not create a content version',
  );
  assert.equal(client.tables.preset_payloads_v2.length, originalPayloadCount, 'identity/tag-only save should not upload payloads');
  assert.equal(
    client.rpcCalls.filter(call => call.functionName === 'kessho_save_preset_v2').length,
    originalAtomicCalls,
    'identity/tag-only save should use metadata CAS instead of the version RPC',
  );
  const metadataCalls = client.rpcCalls.filter(call => call.functionName === 'kessho_update_preset_metadata_v2');
  assert.equal(metadataCalls.length, originalMetadataCalls + 1);
  assert.equal(
    metadataCalls[metadataCalls.length - 1]?.args.expected_updated_at,
    originalRevision,
    'identity fallback must preserve the raw CAS revision',
  );
  const identityReload = await store.load('engine', name, 'pad1');
  assert.equal(identityReload?.currentVersion, 1, 'reload should reflect the unchanged server version');
  assert.equal(identityReload?.description, entry.description);
  assert.deepEqual(identityReload?.tags, entry.tags);

  entry.versions[1]!.note = 'Documented semantic no-op';
  await store.save(entry);
  const storedVersions = client.tables.preset_versions_v2.filter(row => row.preset_id === preset.id);
  assert.equal(storedVersions.length, originalVersionCount + 1, 'a nonempty note must create a real version');
  assert.equal(storedVersions[storedVersions.length - 1]?.note, 'Documented semantic no-op');
  assert.equal(client.tables.preset_payloads_v2.length, originalPayloadCount, 'note-only version should reuse existing payload hashes');
  const noteReload = await store.load('engine', name, 'pad1');
  assert.equal(noteReload?.currentVersion, 2);
  assert.equal(noteReload?.versions[noteReload.versions.length - 1]?.note, 'Documented semantic no-op');
}

async function testQueuedImportMatchesCloudCollisionAndNewNameSemantics(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '59595959-5959-4959-8959-595959595957';
  client.authUserId = userId;
  store.setUserId(userId);
  const service = new PresetCommandService(store);
  const name = 'Cloud Import Collision';
  await store.save(makePresetEntry('engine', 'pad1', name, { padOscAWave: 'sine' }));
  const original = findPresetRow(client, 'engine', 'pad1', name);
  const imported = makePresetEntry('engine', 'pad1', name, { padOscAWave: 'triangle' }, [{
    v: 1,
    data: { padOscAWave: 'triangle' },
    note: 'Imported current',
  }]);

  const collisionResult = await service.importEntry(imported);
  const collisionReload = await store.load('engine', name, 'pad1');
  assert.equal(collisionResult.remoteId, original.id, 'collision import should preserve the existing cloud identity');
  assert.equal(collisionReload?.currentVersion, 2, 'collision import should append instead of silently reusing version 1');
  assert.equal(getVersionData(collisionReload!)?.padOscAWave, 'triangle', 'cloud reload should expose imported current data');

  const newName = 'Cloud Import New Name';
  const newNameImport = makePresetEntry('engine', 'pad1', newName, { padOscAWave: 'sine' }, [
    { v: 1, data: { padOscAWave: 'sine' }, note: 'Imported v1' },
    { v: 2, data: { padOscAWave: 'square' }, note: 'Imported v2' },
  ]);
  newNameImport.currentVersion = 2;
  const newNameResult = await service.importEntry(newNameImport);
  const newNameRow = findPresetRow(client, 'engine', 'pad1', newName);
  const newNameStoredVersions = client.tables.preset_versions_v2.filter(row => row.preset_id === newNameRow.id);
  const newNameReload = await store.load('engine', newName, 'pad1', 2);
  assert.equal(newNameResult.currentVersion, 2);
  assert.equal(newNameStoredVersions.length, 2, 'new-name cloud import should preserve validated history');
  assert.equal(newNameReload?.versions.length, 2, 'explicit historical load should materialize imported history');
  assert.equal(getVersionData(newNameReload!)?.padOscAWave, 'square');
}

async function testProductionWritesForkVisibleCrossOwnerRows(): Promise<void> {
  const client = new FakeSupabaseClient();
  const userId = '59595959-5959-4959-8959-595959595956';
  client.authUserId = userId;

  const sharedStore = new SupabasePresetStore(client as never, { sharedPresetTestMode: true });
  sharedStore.setUserId(userId);
  const publicName = 'Visible Stock Fork';
  const publicEntry = makePresetEntry('engine', 'pad1', publicName, { padOscAWave: 'sine' });
  publicEntry.author = 'factory';
  publicEntry.library = 'stock';
  publicEntry.visibility = 'public';
  await sharedStore.save(publicEntry);
  const publicRow = findPresetRow(client, 'engine', 'pad1', publicName);
  const publicSnapshot = structuredClone(publicRow);

  const store = new SupabasePresetStore(client as never, { sharedPresetTestMode: false });
  store.setUserId(userId);
  const service = new PresetCommandService(store);
  await service.save({
    type: 'engine',
    scope: 'pad1',
    name: publicName,
    data: { padOscAWave: 'triangle' },
    note: 'Fork visible stock preset',
    forkReadOnly: true,
  });

  let logicalRows = client.tables.presets_v2.filter(row => (
    row.type === 'engine' && row.scope === 'pad1' && row.name === publicName
  ));
  assert.equal(logicalRows.length, 2, 'production save should create a user row beside the visible public row');
  assert.deepEqual(publicRow, publicSnapshot, 'forking must not mutate the visible public row');
  const ownRow = logicalRows.find(row => row.owner_user_id === userId);
  assert.ok(ownRow, 'the fork should have a stable current-owner row');
  assert.equal(ownRow.owner_key, `user:${userId}`);
  assert.equal(ownRow.latest_version_no, 1);

  await service.save({
    type: 'engine',
    scope: 'pad1',
    name: publicName,
    data: { padOscAWave: 'square' },
    note: 'Update owned fork',
    forkReadOnly: true,
  });
  logicalRows = client.tables.presets_v2.filter(row => (
    row.type === 'engine' && row.scope === 'pad1' && row.name === publicName
  ));
  assert.equal(logicalRows.length, 2, 'subsequent saves should reuse the owned fork row');
  assert.equal(logicalRows.find(row => row.owner_user_id === userId)?.id, ownRow.id);
  assert.equal(logicalRows.find(row => row.owner_user_id === userId)?.latest_version_no, 2);
  assert.deepEqual(publicRow, publicSnapshot, 'updating the fork must leave the public source unchanged');
  const ownedReload = await store.load('engine', publicName, 'pad1');
  assert.equal(ownedReload?.remoteId, ownRow.id, 'production reload should prefer the current-owner row');
  assert.equal(getVersionData(ownedReload!)?.padOscAWave, 'square');

  const importName = 'Visible Stock Import';
  const publicImportEntry = makePresetEntry('engine', 'pad1', importName, { padOscAWave: 'sine' });
  publicImportEntry.author = 'factory';
  publicImportEntry.library = 'stock';
  publicImportEntry.visibility = 'public';
  await sharedStore.save(publicImportEntry);
  const publicImportRow = findPresetRow(client, 'engine', 'pad1', importName);
  const publicImportSnapshot = structuredClone(publicImportRow);
  const imported = makePresetEntry('engine', 'pad1', importName, { padOscAWave: 'triangle' }, [{
    v: 1,
    data: { padOscAWave: 'triangle' },
    note: 'Imported visible-name collision',
  }]);
  await service.importEntry(imported);

  const importRows = client.tables.presets_v2.filter(row => (
    row.type === 'engine' && row.scope === 'pad1' && row.name === importName
  ));
  assert.equal(importRows.length, 2, 'import collision should fork rather than target the visible public row');
  assert.ok(importRows.some(row => row.owner_user_id === userId), 'import should create a current-owner row');
  assert.deepEqual(publicImportRow, publicImportSnapshot, 'import must not mutate the visible public row');
}

async function testJourneySummariesHydratePreviewsInOnePayloadBatch(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '59595959-5959-4959-8959-595959595959';
  client.authUserId = userId;
  store.setUserId(userId);

  const journeyData = encodeJourneyPresetData(createDiamondJourney([])) as unknown as Record<string, unknown>;
  const sharedMalformedPreview = {
    nodes: [
      { position: 'left', filled: true },
      { position: 'center', filled: 'yes' },
      { position: 'invalid', filled: true },
      { position: 'left', filled: false },
      null,
    ],
    connections: [
      { from: 'left', to: 'center' },
      { from: 'invalid', to: 'left' },
      { from: 'left', to: 'invalid' },
      null,
    ],
  };
  const rightPreview = {
    nodes: [{ position: 'right', filled: true }],
    connections: [],
  };
  await store.save(makePresetEntry('journey', 'global', 'Journey Summary Preview A', journeyData, [{
    v: 1,
    data: journeyData,
    metadata: { journeyPreview: sharedMalformedPreview },
  }]));
  await store.save(makePresetEntry('journey', 'global', 'Journey Summary Preview B', journeyData, [{
    v: 1,
    data: journeyData,
    metadata: { journeyPreview: rightPreview },
  }]));
  await store.save(makePresetEntry('journey', 'global', 'Journey Summary Preview C', journeyData, [{
    v: 1,
    data: journeyData,
    metadata: { journeyPreview: sharedMalformedPreview },
  }]));

  const metadataHashes = client.tables.presets_v2
    .filter(row => row.type === 'journey')
    .map(row => row.latest_metadata_hash)
    .filter((hash): hash is string => typeof hash === 'string');
  assert.equal(new Set(metadataHashes).size, 2, 'fixture should share one metadata payload across two summaries');
  for (const hash of metadataHashes) evictPresetPayloadCacheV2(hash);

  const payloadCallsBeforeList = client.presetPayloadRpcCalls;
  const detailCallsBeforeList = client.presetDetailRpcCalls;
  const manifestCallsBeforeList = client.presetLatestManifestRpcCalls;
  const rpcCallCountBeforeList = client.rpcCalls.length;
  const summaries = await store.list('journey');
  const listRpcCalls = client.rpcCalls.slice(rpcCallCountBeforeList);
  const payloadCalls = listRpcCalls.filter(call => (
    call.functionName === 'kessho_get_missing_preset_payloads_v2'
    || call.functionName === 'kessho_get_preset_payloads_v2'
  ));

  assert.equal(client.presetPayloadRpcCalls - payloadCallsBeforeList, 1, 'journey summaries should fetch their metadata in one bounded batch');
  assert.equal(payloadCalls.length, 1, 'listing must issue one payload RPC rather than one request per journey');
  const requestedHashes = payloadCalls[0]?.args.target_hashes as string[] | undefined;
  assert.deepEqual(new Set(requestedHashes), new Set(metadataHashes), 'the payload batch should contain each unique metadata hash once');
  assert.equal(client.presetDetailRpcCalls, detailCallsBeforeList, 'summary hydration must not fetch per-entry detail bundles');
  assert.equal(client.presetLatestManifestRpcCalls, manifestCallsBeforeList, 'summary hydration must not fetch per-entry manifests');

  const malformedSummary = summaries.find(summary => summary.name === 'Journey Summary Preview A');
  assert.deepEqual(malformedSummary?.journeyPreview, {
    nodes: [
      { position: 'center', filled: true },
      { position: 'left', filled: true },
    ],
    connections: [{ from: 'left', to: 'center' }],
  }, 'summary hydration should sanitize the metadata preview before exposing it');
  assert.deepEqual(
    summaries.find(summary => summary.name === 'Journey Summary Preview B')?.journeyPreview,
    rightPreview,
    'each journey summary should expose its latest metadata preview',
  );
}

async function testLocalMetadataUpdateUsesSameCasContract(): Promise<void> {
  const restoreLocalStorage = installMemoryLocalStorage();
  try {
    const store = new LocalStoragePresetStore();
    const name = 'Local Metadata CAS';
    await store.save(makePresetEntry('engine', 'pad1', name, extractParams(DEFAULT_STATE, 1, 'pad1')));
    const [summary] = await store.list('engine', 'pad1');
    assert.ok(summary?.updatedAtRevision, 'local summaries should expose an opaque metadata revision');
    const initialRevision = summary.updatedAtRevision!;

    assert.equal(
      await store.updateMetadata('engine', name, { rating: 3 }, 'pad1', {
        expectedUpdatedAt: initialRevision,
      }),
      true,
    );
    const [updatedSummary] = await store.list('engine', 'pad1');
    assert.notEqual(updatedSummary?.updatedAtRevision, initialRevision, 'a local metadata write should advance its revision');
    await assert.rejects(
      () => store.updateMetadata('engine', name, { rating: 1 }, 'pad1', {
        expectedUpdatedAt: initialRevision,
      }),
      (error: unknown) => error instanceof PresetMetadataConflictError,
      'local metadata updates should reject stale revisions like cloud updates',
    );
  } finally {
    restoreLocalStorage();
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
  assert.ok(await store.load('engine', presetName, 'pad1'), 'V2 detail load should work before recycle');
  assert.ok(client.presetLatestManifestRpcCalls > 0, 'V2 detail loads should prefer the latest-manifest RPC');
  assert.equal(client.presetDetailRpcCalls, 0, 'default V2 loads should not fetch full detail history');

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

async function testCompactDetailPayloadBundleLoadsByContentHash(): Promise<void> {
  const client = new FakeSupabaseClient();
  client.compactDetailPayloads = true;
  const store = new SupabasePresetStore(client as never);
  const userId = '12121212-1212-4121-8121-121212121212';
  const presetName = 'Compact Detail Payload';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = {
    ...extractParams(DEFAULT_STATE, 1, 'pad1'),
    synthAttack: 0.003,
    synthDecay: 0.55,
    synthRelease: 0.18,
    padFoldAmount: 0.28,
  };
  await store.save(makePresetEntry('engine', 'pad1', presetName, data));

  const loaded = await store.load('engine', presetName, 'pad1', 1);
  const loadedData = loaded ? getVersionData(loaded) : null;

  assert.ok(loaded, 'V2 detail load should accept compact payload objects from the RPC');
  assert.ok(client.presetDetailRpcCalls > 0, 'test should exercise the V2 detail RPC');
  assert.equal(loaded?.recoveryWarnings?.length ?? 0, 0, 'compact payload rows should not trigger recovery fallbacks');
  assert.equal(loadedData?.synthAttack, 0.003, 'loaded data should come from the compact resolved payload');
  assert.equal(loadedData?.padFoldAmount, 0.28, 'content-hashed compact payload should populate the resolved map');
}

async function testLatestManifestPayloadCacheAvoidsRepeatPayloadRpc(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '34343434-3434-4343-8343-343434343434';
  const presetName = 'Latest Manifest Payload Cache';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = {
    ...extractParams(DEFAULT_STATE, 1, 'pad1'),
    synthAttack: 0.034343,
    synthDecay: 0.434343,
    synthRelease: 0.234343,
    padFoldAmount: 0.134343,
  };
  await store.save(makePresetEntry('engine', 'pad1', presetName, data));

  client.presetDetailRpcCalls = 0;
  client.presetLatestManifestRpcCalls = 0;
  client.presetPayloadRpcCalls = 0;

  const first = await store.load('engine', presetName, 'pad1');
  assert.ok(first, 'first default V2 load should materialize from the latest manifest');
  assert.equal(client.presetDetailRpcCalls, 0, 'default V2 load should not fetch full detail history');
  assert.equal(client.presetPayloadRpcCalls, 1, 'first latest-manifest load should fetch missing payload hashes once');

  const payloadCallsAfterFirstLoad = client.presetPayloadRpcCalls;
  const second = await store.load('engine', presetName, 'pad1');
  assert.ok(second, 'second default V2 load should still materialize from the latest manifest');
  assert.equal(client.presetDetailRpcCalls, 0, 'repeat default V2 load should not fetch full detail history');
  assert.equal(client.presetPayloadRpcCalls, payloadCallsAfterFirstLoad, 'repeat latest-manifest load should reuse cached payload bodies');
  assert.ok(client.presetLatestManifestRpcCalls >= 2, 'repeat default V2 load should still refresh the lightweight latest manifest');
}

async function testAtomicSaveDedupesIdenticalPayloadHashes(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '34343434-3434-4343-8343-343434343435';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = extractParams(DEFAULT_STATE, 1, 'pad1');
  await store.save(makePresetEntry('engine', 'pad1', 'Deduped Payload Hashes', data));

  const saveCall = client.rpcCalls.find(call => call.functionName === 'kessho_save_preset_v2');
  assert.ok(saveCall, 'save should call the V2 atomic save RPC');
  const payloads = (saveCall.args.payloads_payload as FakeRow[] | undefined) ?? [];
  const version = saveCall.args.version_payload as FakeRow;
  assert.equal(
    version.override_hash,
    version.resolved_hash,
    'leaf presets can legitimately use the same content hash for override and resolved data',
  );
  assert.equal(
    payloads.filter(payload => payload.hash === version.resolved_hash).length,
    1,
    'atomic save should send one insert row per content hash even when multiple version fields reference it',
  );
  assert.equal(new Set(payloads.map(payload => String(payload.hash))).size, payloads.length);
}

async function testAtomicSaveSkipsVisibleExistingPayloadHashes(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '34343434-3434-4343-8343-343434343436';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = extractParams(DEFAULT_STATE, 1, 'pad1');
  const hash = await hashCanonicalJson(data);
  client.tables.preset_payloads_v2.push({
    hash,
    payload_kind: 'override',
    payload: data,
    payload_bytes: JSON.stringify(data).length,
    created_at: client.now(),
    last_seen_at: client.now(),
  });

  await store.save(makePresetEntry('engine', 'pad1', 'Skipped Existing Payload Hash', data));

  const saveCall = client.rpcCalls.find(call => call.functionName === 'kessho_save_preset_v2');
  assert.ok(saveCall, 'save should call the V2 atomic save RPC');
  const payloads = (saveCall.args.payloads_payload as FakeRow[] | undefined) ?? [];
  const version = saveCall.args.version_payload as FakeRow;
  assert.equal(version.resolved_hash, hash);
  assert.equal(
    payloads.some(payload => payload.hash === hash),
    false,
    'atomic save should not upload payload rows that already exist remotely',
  );
}

async function testAtomicSaveRetriesPayloadKindConflictHashes(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '34343434-3434-4343-8343-343434343437';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = extractParams(DEFAULT_STATE, 1, 'pad1');
  const hash = await hashCanonicalJson(data);
  client.hiddenPayloadKindConflictHashes.add(hash);

  await store.save(makePresetEntry('engine', 'pad1', 'Retried Payload Hash Conflict', data));

  const saveCalls = client.rpcCalls.filter(call => call.functionName === 'kessho_save_preset_v2');
  assert.equal(saveCalls.length, 2, 'payload-kind conflict should retry the atomic save once');
  const firstPayloads = (saveCalls[0]?.args.payloads_payload as FakeRow[] | undefined) ?? [];
  const secondPayloads = (saveCalls[1]?.args.payloads_payload as FakeRow[] | undefined) ?? [];
  assert.equal(firstPayloads.some(payload => payload.hash === hash), true);
  assert.equal(
    secondPayloads.some(payload => payload.hash === hash),
    false,
    'retry should omit the already-existing conflicting payload hash',
  );
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
  const stateData = extractCascade(DEFAULT_STATE, 4, 'global');
  const padKitEntry = makePresetEntry('kit', 'pad1Kit', 'Pad Kit Active Dependency', padKitData);
  padKitEntry.versions[0]!.refs = {
    pad1: { name: 'Pad Engine Active Dependency', scope: 'pad1', version: 'latest' },
  };
  const synthEntry = makePresetEntry('source', 'synth', 'Synth Active Dependency', synthData);
  synthEntry.versions[0]!.refs = {
    pad1Kit: { name: 'Pad Kit Active Dependency', scope: 'pad1Kit', version: 'latest' },
  };
  const stateEntry = makePresetEntry('state', 'global', 'State Active Dependency', stateData);
  stateEntry.versions[0]!.refs = {
    synth: { name: 'Synth Active Dependency', scope: 'synth', version: 'latest' },
  };

  await store.save(makePresetEntry('engine', 'pad1', 'Pad Engine Active Dependency', padEngineData));
  await store.save(padKitEntry);
  const padEngine = findPresetRow(client, 'engine', 'pad1', 'Pad Engine Active Dependency');
  const padKit = findPresetRow(client, 'kit', 'pad1Kit', 'Pad Kit Active Dependency');
  assert.equal(latestRefTarget(client, padKit, 'pad1')?.id, padEngine.id, 'L2 latest version should reference the matching L1 preset');
  await assert.rejects(
    () => store.delete('engine', 'Pad Engine Active Dependency', 'pad1'),
    /active latest presets still reference it/,
    'active L2 -> L1 refs should block deleting the L1 preset',
  );
  assert.equal(padEngine.deleted_at, null, 'blocked L1 delete should leave the row active');

  await store.save(synthEntry);
  const synth = findPresetRow(client, 'source', 'synth', 'Synth Active Dependency');
  assert.equal(latestRefTarget(client, synth, 'pad1Kit')?.id, padKit.id, 'L3 latest version should reference the matching L2 preset');
  await assert.rejects(
    () => store.delete('kit', 'Pad Kit Active Dependency', 'pad1Kit'),
    /active latest presets still reference it/,
    'active L3 -> L2 refs should block deleting the L2 preset',
  );
  assert.equal(padKit.deleted_at, null, 'blocked L2 delete should leave the row active');

  await store.save(stateEntry);
  const state = findPresetRow(client, 'state', 'global', 'State Active Dependency');
  assert.equal(latestRefTarget(client, state, 'synth')?.id, synth.id, 'L4 latest version should reference the matching L3 preset');
  await assert.rejects(
    () => store.delete('source', 'Synth Active Dependency', 'synth'),
    /active latest presets still reference it/,
    'active L4 -> L3 refs should block deleting the L3 preset',
  );
  assert.equal(synth.deleted_at, null, 'blocked L3 delete should leave the row active');
}

async function testDeletingStateRetainsInternalGraphForRestore(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '15151515-1515-4151-8151-151515151515';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'State With Derived Graph';
  await store.save(makePresetEntry('state', 'global', stateName, extractCascade(DEFAULT_STATE, 4, 'global')));

  const state = findPresetRow(client, 'state', 'global', stateName);
  assert.ok(latestRefTarget(client, state, 'synth'), 'state save should create source-derived children');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'source'), 'state save should create active L3 internal-derived rows');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'kit'), 'state save should create active L2 internal-derived rows');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'engine'), 'state save should create active L1 internal-derived rows');

  await store.delete('state', stateName, 'global');

  assert.ok(
    activeInternalDerivedRows(client).length > 0,
    'a retained recycled root should keep its internal-derived graph available for restore',
  );

  const synth = latestRefTarget(client, state, 'synth');
  assert.ok(synth, 'state should retain its synth child edge while recycled');
  synth.deleted_at = client.now();
  synth.archived = true;
  const { data, error } = await client.rpc('kessho_restore_preset_v2', { target_preset_id: state.id });
  assert.equal(error, null, 'restore should complete when only hidden descendants are recycled');
  assert.equal(data, true, 'restore should report a restored graph');
  assert.equal(state.deleted_at, null, 'restore should reactivate the visible root');
  assert.equal(synth.deleted_at, null, 'restore should reactivate recycled hidden descendants');
}

async function testSharedDerivedChildSurvivesUntilLastRetainedRootPurges(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '16161616-1616-4161-8161-161616161616';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateAName = 'Shared Derived State A';
  const stateBName = 'Shared Derived State B';
  await store.save(makePresetEntry('state', 'global', stateAName, extractCascade(DEFAULT_STATE, 4, 'global')));
  await store.save(makePresetEntry('state', 'global', stateBName, extractCascade(DEFAULT_STATE, 4, 'global')));

  const stateA = findPresetRow(client, 'state', 'global', stateAName);
  const stateB = findPresetRow(client, 'state', 'global', stateBName);
  const sharedSynthA = latestRefTarget(client, stateA, 'synth');
  const sharedSynthB = latestRefTarget(client, stateB, 'synth');
  assert.ok(sharedSynthA, 'first state should reference a derived synth source');
  assert.ok(sharedSynthB, 'second state should reference a derived synth source');
  assert.equal(sharedSynthA.id, sharedSynthB.id, 'identical states should share the same internal-derived source child');

  await store.delete('state', stateAName, 'global');
  assert.equal(sharedSynthA.deleted_at, null, 'shared child should stay active while another visible root still reaches it');
  assert.ok(activeInternalDerivedRows(client).length > 0, 'shared internal-derived graph should remain while one state is active');

  await store.delete('state', stateBName, 'global');
  assert.ok(
    activeInternalDerivedRows(client).length > 0,
    'recycled visible roots should retain the shared graph until their histories are hard-purged',
  );

  hardPurgeFakePreset(client, stateA.id);
  hardPurgeFakePreset(client, stateB.id);
  await client.rpc('kessho_prune_internal_derived_v2', {});
  assert.equal(
    activeInternalDerivedRows(client).length,
    0,
    'shared internal-derived graph should recycle after the last retained root is hard-purged',
  );
}

async function testOrphanInternalDerivedChainPrunesAllLevels(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '17171717-1717-4171-8171-171717171717';
  client.authUserId = userId;
  store.setUserId(userId);

  await store.save(makeInternalDerivedEntry(
    'source',
    'synth',
    '__derived__/synth/manual-orphan-source',
    extractCascade(DEFAULT_STATE, 3, 'synth'),
  ));

  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'source'), 'orphan setup should include an active L3 source');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'kit'), 'orphan setup should include active L2 kits');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'engine'), 'orphan setup should include active L1 engines');

  const { data, error } = await client.rpc('kessho_prune_internal_derived_v2', {});
  assert.equal(error, null, 'fake internal-derived GC should complete');
  assert.equal(typeof data, 'number', 'fake internal-derived GC should report a recycled count');
  assert.ok((data as number) > 0, 'orphan internal-derived GC should recycle at least one row');
  assert.equal(activeInternalDerivedRows(client).length, 0, 'orphan source -> kit -> engine chain should fully recycle');
}

async function testConcurrentSameIdentitySaveKeepsOneActiveV2Row(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '18181818-1818-4181-8181-181818181818';
  client.authUserId = userId;
  store.setUserId(userId);

  const entry = makePresetEntry(
    'engine',
    'pad1',
    'Concurrent Same Identity',
    extractParams(DEFAULT_STATE, 1, 'pad1'),
  );

  await Promise.all([
    store.save(entry),
    store.save(structuredClone(entry)),
  ]);

  assert.equal(
    activeLogicalRows(client, 'engine', 'pad1', 'Concurrent Same Identity').length,
    1,
    'atomic V2 save should keep one active row for concurrent same type/scope/name saves',
  );
}

async function testLegacyWritesFailClosedWhenV2IsUnavailable(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '19191919-1919-4191-8191-191919191919';
  client.authUserId = userId;
  store.setUserId(userId);
  store['v2SchemaAvailable'] = false;

  const data = extractParams(DEFAULT_STATE, 1, 'pad1');
  await assert.rejects(
    () => store.save(makePresetEntry('engine', 'pad1', 'Foo', data)),
    /Current preset storage is unavailable; legacy cloud preset storage is disabled/,
    'writes must fail closed instead of reviving the retired legacy storage path',
  );
  assert.equal(client.tables.presets.length, 0, 'failed-closed writes must not create a legacy row');
}

async function testAutoDerivedParentDoesNotBindVisibleSameHashChild(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '20202020-2020-4202-8202-202020202020';
  client.authUserId = userId;
  store.setUserId(userId);

  const visibleKitName = 'Visible Same Hash Pad Kit';
  await store.save(makePresetEntry('kit', 'pad1Kit', visibleKitName, extractCascade(DEFAULT_STATE, 2, 'pad1Kit')));
  const visibleKit = findPresetRow(client, 'kit', 'pad1Kit', visibleKitName);
  assert.equal(isInternalDerivedPresetRow(visibleKit), false, 'setup should create a user-visible kit child');

  const parentName = 'Parent Should Use Hidden Pad Kit';
  await store.save(makePresetEntry('source', 'synth', parentName, extractCascade(DEFAULT_STATE, 3, 'synth')));
  const parent = findPresetRow(client, 'source', 'synth', parentName);
  const target = latestRefTarget(client, parent, 'pad1Kit');

  assert.ok(target, 'source parent should store a pad1Kit graph ref');
  assert.notEqual(target.id, visibleKit.id, 'automatic graph refs must not bind to mutable visible same-hash children');
  assert.equal(isInternalDerivedPresetRow(target), true, 'automatic graph refs should bind to a hidden internal-derived child');
  assert.equal(visibleKit.deleted_at, null, 'visible same-hash child should remain visible and independent');
}

async function testStaleInternalDerivedRefDoesNotBlockOverwriteSave(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '14141414-1414-4141-8141-141414141414';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'State Stale Derived Ref Overwrite';
  await store.save(makePresetEntry('state', 'global', stateName, extractCascade(DEFAULT_STATE, 4, 'global')));

  const loaded = await store.load('state', stateName, 'global');
  assert.ok(loaded, 'setup should load the saved state preset with graph refs');
  const loadedVersion = loaded.versions.find(version => version.v === loaded.currentVersion);
  assert.ok(loadedVersion?.refs?.delay, 'setup should materialize a hidden delay graph ref');
  assert.equal(
    loadedVersion.refs.delay.name.startsWith('__derived__/delay/'),
    true,
    'setup delay ref should be an internal derived implementation ref',
  );

  const currentData = getVersionData(loaded) ?? loadedVersion.data;
  const nextVersion = loaded.currentVersion + 1;
  const nextData = {
    ...currentData,
    delayATime: Number(currentData.delayATime ?? 0) + 1,
  };
  const staleRefs = structuredClone(loadedVersion.refs);
  const staleDelayRef = staleRefs.delay;
  assert.ok(staleDelayRef, 'setup should provide a delay ref to make stale');
  staleRefs.delay = {
    ...staleDelayRef,
    name: '__derived__/delay/stale-missing-child',
  };
  loaded.versions.push({
    v: nextVersion,
    note: 'stale internal derived ref should be ignored',
    timestamp: Date.parse('2026-05-19T12:30:00.000Z'),
    data: nextData,
    refs: staleRefs,
  });
  loaded.currentVersion = nextVersion;
  loaded.updatedAt = Date.parse('2026-05-19T12:30:00.000Z');

  await store.save(loaded);

  const state = findPresetRow(client, 'state', 'global', stateName);
  const target = latestRefTarget(client, state, 'delay');
  assert.ok(target, 'latest state version should keep a delay graph ref');
  assert.equal(isInternalDerivedPresetRow(target), true, 'delay graph ref should still target an internal-derived child');
  assert.notEqual(
    target.name,
    '__derived__/delay/stale-missing-child',
    'stale internal-derived ref names should not replace the recomputed child ref',
  );
}

async function testJourneyRefsPersistAsSupabaseV2GraphEdges(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '77777777-7777-4777-8777-777777777777';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'State Used By Journey';
  const journeyName = 'Journey Active Dependency';
  await store.save(makePresetEntry('state', 'global', stateName, extractCascade(DEFAULT_STATE, 4, 'global')));
  const state = findPresetRow(client, 'state', 'global', stateName);

  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  left.presetId = stateName;
  left.presetName = stateName;
  config.name = journeyName;
  const slot = getJourneyNodeRefSlot('left');
  const timestamp = Date.parse('2026-05-19T12:00:00.000Z');
  const journeyEntry: PresetEntry = {
    type: 'journey',
    name: journeyName,
    author: 'user',
    library: 'cloud',
    creator: 'Soft Delete Regression',
    visibility: 'public',
    familyName: journeyName,
    variantName: journeyName,
    tags: ['journey'],
    versions: [{
      v: 1,
      note: 'state refs should persist as graph edges',
      timestamp,
      data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
      refs: {
        [slot]: { name: stateName, version: 'latest', scope: 'global' },
      },
    }],
    currentVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await store.save(journeyEntry);

  const journey = findPresetRow(client, 'journey', null, journeyName);
  const ref = client.tables.preset_version_refs_v2.find(candidate => (
    candidate.version_id === journey.latest_version_id
    && candidate.ref_slot === slot
  ));
  assert.ok(ref, 'Journey latest version should store its state preset ref as a V2 graph edge');
  assert.equal(ref.target_preset_id, state.id, 'Journey ref should target the saved state preset');
  assert.equal(ref.follow_latest, true, 'Journey state refs should follow the latest state version');
  assert.equal(ref.target_version_no, null, 'follow-latest refs should not store a fixed version number');

  const loaded = await store.load('journey', journeyName);
  const loadedVersion = loaded?.versions.find(version => version.v === loaded.currentVersion);
  assert.ok(loadedVersion, 'Journey should load back from V2 storage');
  assert.equal(loadedVersion.refs?.[slot]?.name, stateName, 'loaded Journey version should preserve ref names');
  assert.equal(loadedVersion.refs?.[slot]?.version, 'latest', 'loaded Journey version should preserve follow-latest semantics');
  assert.equal('masterVolume' in loadedVersion.data, false, 'Journey load must not merge L4 state payload data into graph data');
  assert.deepStrictEqual(await store.findReferences('state', stateName), [journeyName], 'cross-scope ref lookup should report Journey users of the state');

  await assert.rejects(
    () => store.delete('state', stateName, 'global'),
    /active latest presets still reference it/,
    'active Journey -> State refs should participate in Supabase graph guards',
  );
  assert.equal(state.deleted_at, null, 'blocked state delete should leave the row active until Journey cleanup runs');
}

async function testJourneyReferrerCandidatesUseStableIdAndLatestVersionOnly(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '78787878-7878-4878-8878-787878787878';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'Stable Referrer Target';
  await store.save(makePresetEntry('state', 'global', stateName, extractCascade(DEFAULT_STATE, 4, 'global')));
  const state = findPresetRow(client, 'state', 'global', stateName);
  const generatedStateId = state.id;
  state.id = '79797979-7979-4979-8979-797979797979';
  for (const version of client.tables.preset_versions_v2) {
    if (version.preset_id === generatedStateId) version.preset_id = state.id;
  }
  const slot = getJourneyNodeRefSlot('left');
  const makeJourney = (name: string): PresetEntry => {
    const config = createDiamondJourney([]);
    config.name = name;
    const left = config.nodes.find(node => node.position === 'left')!;
    left.presetId = state.id;
    left.presetName = stateName;
    const timestamp = Date.parse('2026-05-19T12:00:00.000Z');
    return {
      type: 'journey',
      name,
      author: 'user',
      library: 'cloud',
      visibility: 'public',
      familyName: name,
      variantName: name,
      versions: [{
        v: 1,
        note: 'references state',
        timestamp,
        data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
        refs: {
          [slot]: { id: state.id, name: stateName, version: 'latest', scope: 'global' },
        },
      }],
      currentVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const activeName = 'Current State Referrer';
  const historicalName = 'Historical State Referrer';
  await store.save(makeJourney(activeName));
  await store.save(makeJourney(historicalName));

  const historical = await store.load('journey', historicalName);
  assert.ok(historical);
  const noRefConfig = createDiamondJourney([]);
  noRefConfig.name = historicalName;
  historical.versions.push({
    v: 2,
    note: 'reference removed',
    timestamp: historical.updatedAt + 1,
    data: encodeJourneyPresetData(noRefConfig) as unknown as Record<string, unknown>,
  });
  historical.currentVersion = 2;
  historical.updatedAt += 1;
  await store.save(historical);

  const candidates = await store.findCurrentReferenceCandidates('state', state.id, 'wrong-name-does-not-drive-the-rpc');
  assert.deepEqual(candidates.map(candidate => candidate.name), [activeName]);
  assert.equal(candidates[0]?.currentVersion, 1);
  assert.ok(candidates[0]?.updatedAtRevision, 'candidate should carry an opaque revision token');
  assert.equal(client.journeyReferrerRpcCalls, 1, 'candidate discovery should be one ID-addressed RPC');
  assert.equal(
    client.tables.preset_version_refs_v2.some(ref => {
      const version = client.tables.preset_versions_v2.find(candidate => candidate.id === ref.version_id);
      const parent = version && client.tables.presets_v2.find(candidate => candidate.id === version.preset_id);
      return parent?.name === historicalName;
    }),
    true,
    'fixture must retain a historical ref so latest-version filtering is exercised',
  );
}

async function testUnresolvedJourneyRefFailsClosed(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '88888888-8888-4888-8888-888888888888';
  client.authUserId = userId;
  store.setUserId(userId);

  const journeyName = 'Journey Missing State';
  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  left.presetId = 'Missing State Ref';
  left.presetName = 'Missing State Ref';
  config.name = journeyName;
  const slot = getJourneyNodeRefSlot('left');
  const timestamp = Date.parse('2026-05-19T12:00:00.000Z');

  await assert.rejects(
    () => store.save({
      type: 'journey',
      name: journeyName,
      author: 'user',
      library: 'cloud',
      creator: 'Soft Delete Regression',
      visibility: 'public',
      familyName: journeyName,
      variantName: journeyName,
      tags: ['journey'],
      versions: [{
        v: 1,
        note: 'missing explicit ref should fail',
        timestamp,
        data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
        refs: {
          [slot]: { name: 'Missing State Ref', version: 'latest', scope: 'global' },
        },
      }],
      currentVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    /unresolved journey ref/,
    'journey saves must fail closed when an explicit state ref cannot be resolved',
  );

  const journey = client.tables.presets_v2.find(row => row.type === 'journey' && row.name === journeyName);
  assert.equal(journey, undefined, 'failed explicit ref save must not create a logical row');
  assert.equal(
    client.tables.preset_versions_v2.length,
    0,
    'failed explicit ref save must not commit a version row',
  );
}

async function testAtomicSaveRollsBackWhenRefInsertFails(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '13131313-1313-4131-8131-131313131313';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'Atomic State Target';
  const journeyName = 'Atomic Journey Rollback';
  await store.save(makePresetEntry('state', 'global', stateName, extractCascade(DEFAULT_STATE, 4, 'global')));

  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  left.presetId = stateName;
  left.presetName = stateName;
  config.name = journeyName;
  const slot = getJourneyNodeRefSlot('left');
  const timestamp = Date.parse('2026-05-19T12:00:00.000Z');

  const presetCountBefore = client.tables.presets_v2.length;
  const versionCountBefore = client.tables.preset_versions_v2.length;
  const refCountBefore = client.tables.preset_version_refs_v2.length;
  client.failNextAtomicRefInsert = true;

  await assert.rejects(
    () => store.save({
      type: 'journey',
      name: journeyName,
      author: 'user',
      library: 'cloud',
      creator: 'Soft Delete Regression',
      visibility: 'public',
      familyName: journeyName,
      variantName: journeyName,
      tags: ['journey'],
      versions: [{
        v: 1,
        note: 'atomic ref insert failure',
        timestamp,
        data: encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
        refs: {
          [slot]: { name: stateName, version: 'latest', scope: 'global' },
        },
      }],
      currentVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    /simulated atomic ref insert failure/,
    'atomic V2 save should surface ref insert failures',
  );

  assert.equal(client.tables.presets_v2.length, presetCountBefore, 'atomic ref failure must roll back the logical preset row');
  assert.equal(client.tables.preset_versions_v2.length, versionCountBefore, 'atomic ref failure must roll back the version row');
  assert.equal(client.tables.preset_version_refs_v2.length, refCountBefore, 'atomic ref failure must not leave partial refs');
  assert.equal(
    client.tables.presets_v2.some(row => row.type === 'journey' && row.name === journeyName),
    false,
    'failed atomic save must not publish the journey preset',
  );
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
      {
        v: 1,
        data: leadKitA,
        note: 'references visible L1',
        metadata: {
          refs: {
            lead1: { name: 'Lead Engine Historical Only', scope: 'lead1', version: 'latest' },
          },
        },
      },
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

async function testLoadReportsRecoveryWarningForMissingSelectedCache(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '12121212-1212-4121-8121-121212121212';
  client.authUserId = userId;
  store.setUserId(userId);

  const padData = extractParams(DEFAULT_STATE, 1, 'pad1');
  await store.save(makePresetEntry('engine', 'pad1', 'Recovered Missing Cache', padData));

  const row = findPresetRow(client, 'engine', 'pad1', 'Recovered Missing Cache');
  const latest = client.tables.preset_versions_v2.find(version => version.id === row.latest_version_id);
  assert.ok(latest, 'expected latest version to exist');
  latest.resolved_hash = null;

  const loaded = await store.load('engine', 'Recovered Missing Cache', 'pad1');
  assert.ok(loaded, 'preset with a missing selected resolved cache should still load');
  assert.equal(
    loaded.recoveryWarnings?.some(warning => (
      warning.slot === 'resolved'
      && warning.reason === 'missing_payload'
      && warning.version === latest.version_no
    )),
    true,
    'load should report a recovery warning for the missing selected resolved cache',
  );
}

async function testMissingChildPayloadLoadsSilentFallback(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '34343434-3434-4343-8343-343434343434';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateData = extractCascade({
    ...DEFAULT_STATE,
    reverbEnabled: true,
    reverbLevel: 0.8,
  }, 4, 'global');
  await store.save(makePresetEntry('state', 'global', 'Recovered Missing Reverb', stateData));

  const stateRow = findPresetRow(client, 'state', 'global', 'Recovered Missing Reverb');
  const version = client.tables.preset_versions_v2.find(candidate => candidate.id === stateRow.latest_version_id);
  assert.ok(version, 'expected saved state version');
  version.resolved_hash = null;

  const reverbTarget = latestRefTarget(client, stateRow, 'reverb');
  assert.ok(reverbTarget, 'expected state preset to reference a reverb child');
  reverbTarget.latest_resolved_hash = null;

  const loaded = await store.load('state', 'Recovered Missing Reverb', 'global');
  assert.ok(loaded, 'state with missing reverb child payload should still load');
  const loadedData = getVersionData(loaded);
  assert.ok(loadedData, 'loaded state should expose materialized data');
  assert.equal(loadedData.reverbEnabled, false, 'missing reverb should load disabled');
  assert.equal(loadedData.reverbLevel, 0, 'missing reverb should not keep an audible output level');
  assert.equal(
    loaded.recoveryWarnings?.some(warning => warning.slot === 'reverb' && warning.fallback === 'off'),
    true,
    'missing reverb child should report an off fallback warning',
  );
}

async function testLegacyDeleteFailsClosedWhenV2IsUnavailable(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '99999999-9999-4999-8999-999999999999';
  client.authUserId = userId;
  store.setUserId(userId);
  store['v2SchemaAvailable'] = false;

  await assert.rejects(
    () => store.delete('engine', 'Legacy Soft Delete', 'pad1'),
    /Current preset storage is unavailable; legacy cloud preset storage is disabled/,
    'deletes must fail closed instead of mutating the retired legacy storage path',
  );
}

function testRecycleBinSqlContainsGraphGuards(): void {
  const sql = fs.readFileSync('supabase/migrations/20260713205616_preset_graph_lifecycle_integrity_v2.sql', 'utf8');
  assert.match(sql, /retained_visible_graph/, 'hidden GC should retain descendants needed by recycled visible roots');
  assert.doesNotMatch(sql, /historical_versions_to_prune/, 'purge must not delete historical owner versions to break refs');
  assert.match(sql, /restore visible dependencies first/, 'restore should fail closed on independently visible recycled dependencies');
  assert.match(sql, /preset_version_content_refs_v2/, 'maintenance should treat direct content refs as reachability roots');
}

function testJourneyReferrerSqlIsCurrentVersionAndLeastPrivilege(): void {
  const sql = fs.readFileSync(
    'supabase/migrations/20260731000415_journey_state_referrer_candidates_v2.sql',
    'utf8',
  );
  assert.match(sql, /parent\.latest_version_id\s*=\s*parent_version\.id/i);
  assert.match(sql, /requested_state_preset_id\s+UUID\s*:=\s*\$1/i);
  assert.match(sql, /ref\.target_preset_id\s*=\s*requested_state_preset_id/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.kessho_find_journey_state_referrers_v2\(UUID\)\s+FROM PUBLIC, anon/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.kessho_find_journey_state_referrers_v2\(UUID\)\s+TO authenticated/i,
  );
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

async function testSupabaseRenamePreservesPresetId(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '55555555-5555-4555-8555-555555555555';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = extractParams(DEFAULT_STATE, 1, 'pad1');
  await store.save(makePresetEntry('engine', 'pad1', 'Rename In Place', data));
  const originalRow = findPresetRow(client, 'engine', 'pad1', 'Rename In Place');
  const originalVersionCount = client.tables.preset_versions_v2.filter(version => version.preset_id === originalRow.id).length;
  const existsLookupRowsBefore = client.rpcCalls.filter(call => call.functionName === 'kessho_lookup_preset_rows_v2').length;

  assert.equal(
    await store.exists('engine', 'Rename In Place', 'pad1'),
    true,
    'saved V2 preset should exist before rename',
  );
  assert.equal(
    client.rpcCalls.filter(call => call.functionName === 'kessho_lookup_preset_rows_v2').length,
    existsLookupRowsBefore,
    'V2 exists should use the narrow logical-key RPC and avoid broad row lookup',
  );

  const lookupRowsBefore = client.rpcCalls.filter(call => call.functionName === 'kessho_lookup_preset_rows_v2').length;

  const renamed = await store.rename('engine', 'Rename In Place', 'Renamed In Place', 'pad1');
  const lookupRowsAfter = client.rpcCalls.filter(call => call.functionName === 'kessho_lookup_preset_rows_v2').length;

  assert.ok(renamed, 'rename should return the updated preset entry');
  assert.equal(renamed.id, originalRow.id, 'rename should preserve the Supabase preset id');
  assert.equal(renamed.remoteId, originalRow.id, 'rename should preserve the remote id');
  assert.equal(
    lookupRowsAfter,
    lookupRowsBefore,
    'V2 rename should use the narrow id lookup and avoid broad row lookup preflight',
  );
  assert.equal(findPresetRow(client, 'engine', 'pad1', 'Renamed In Place').id, originalRow.id, 'renamed row should reuse the original row');
  assert.equal(await store.load('engine', 'Rename In Place', 'pad1'), null, 'old name should no longer load');
  assert.equal((await store.load('engine', 'Renamed In Place', 'pad1'))?.id, originalRow.id, 'new name should load the same row id');
  assert.equal(
    client.tables.preset_versions_v2.filter(version => version.preset_id === originalRow.id).length,
    originalVersionCount,
    'rename should not create an extra preset version',
  );
}

async function testDirectContentRefsReplaceResolvedSampleCopies(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '56565656-5656-4656-8656-565656565655';
  const name = 'Content-addressed synth source';
  client.authUserId = userId;
  store.setUserId(userId);

  const data = {
    ...extractCascade(DEFAULT_STATE, 3, 'synth'),
    sample1Articulation: 'marcato',
    sample1AttackMs: 321,
  } as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('sample1')) data[key.replace('sample1', 'sample2')] = value;
  }
  await store.save(makePresetEntry('source', 'synth', name, data));

  const preset = findPresetRow(client, 'source', 'synth', name);
  const version = client.tables.preset_versions_v2.find(row => row.id === preset.latest_version_id);
  assert.ok(version?.resolved_hash, 'source preset should retain a compact resolved snapshot');
  const storedResolved = client.tables.preset_payloads_v2.find(row => row.hash === version?.resolved_hash)?.payload as FakeRow;
  assert.equal('sample1Articulation' in storedResolved, false, 'sample voice content must not be copied into resolved snapshots');
  assert.equal(storedResolved.sample1Enabled, data.sample1Enabled, 'slot bindings stay with the source snapshot');
  const sampleRefs = client.tables.preset_version_content_refs_v2.filter(ref => (
    ref.version_id === version?.id && ref.content_type === 'sampleVoice'
  ));
  assert.equal(sampleRefs.length, 2, 'both sample slots should point at content nodes');
  assert.equal(
    new Set(sampleRefs.map(ref => ref.content_hash)).size,
    1,
    'identical sample slots should share one physical content payload',
  );

  const loaded = await store.load('source', name, 'synth');
  const restored = loaded ? getVersionData(loaded) : null;
  assert.equal(loaded?.recoveryWarnings?.length ?? 0, 0, 'content refs should restore without fallbacks');
  assert.deepEqual(restored?.sample1Articulation, data.sample1Articulation);
  assert.deepEqual(restored?.sample1AttackMs, data.sample1AttackMs);
  assert.deepEqual(restored?.sample2Articulation, data.sample2Articulation);
  assert.deepEqual(restored?.sample2AttackMs, data.sample2AttackMs);

  const internalName = '__derived__/synth/content-snapshot';
  const internalEntry = makePresetEntry('source', 'synth', internalName, data);
  internalEntry.tags = ['internal-derived', 'auto-child'];
  internalEntry.visibility = 'private';
  await store.save(internalEntry);
  const internalPreset = findPresetRow(client, 'source', 'synth', internalName);
  const internalVersion = client.tables.preset_versions_v2.find(row => row.id === internalPreset.latest_version_id);
  assert.equal(
    client.tables.preset_version_content_refs_v2.filter(ref => ref.version_id === internalVersion?.id).length,
    0,
    'hidden derived presets retain complete resolved snapshots and must not create unused direct content refs',
  );
  const internalResolved = client.tables.preset_payloads_v2.find(row => row.hash === internalVersion?.resolved_hash)?.payload as FakeRow;
  assert.deepEqual(internalResolved.sample1Articulation, data.sample1Articulation);
}

async function testGraphOnlyStateLoadWithoutResolvedPayload(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '56565656-5656-4656-8656-565656565656';
  client.authUserId = userId;
  store.setUserId(userId);
  const state = {
    ...DEFAULT_STATE,
    synthEuclid1Steps: 13,
    synthEuclid1Hits: 8,
    synthEuclid1Source: 'pad2',
    synthEuclid1VoiceMask: 45,
    synthEuclid1Level: 0.37,
    rootNote: 9,
    tension: 0.61,
  } as unknown as Record<string, unknown>;
  const name = 'Graph Only State';
  const optimizedState = extractOptimizedStatePresetData(state as never);
  assert.ok(Object.keys(optimizedState).length < Object.keys(state).length, 'fixture should omit derived runtime values');
  await store.save(makePresetEntry('state', 'global', name, optimizedState));

  const preset = findPresetRow(client, 'state', 'global', name);
  const version = client.tables.preset_versions_v2.find(row => row.id === preset.latest_version_id);
  assert.equal(version?.resolved_hash, null, 'new L4 versions should not store an expanded resolved payload');
  assert.equal(preset.latest_resolved_hash, null, 'new L4 rollups should remain graph-authoritative');
  assert.ok(
    client.tables.preset_version_content_refs_v2.some(ref => (
      ref.version_id === version?.id && ref.ref_slot === 'harmony.program.chord-bank-active'
    )),
    'the active chord bank should be content-addressed instead of embedded in the L4 override',
  );
  assert.equal(
    client.tables.preset_version_content_refs_v2.filter(ref => (
      ref.version_id === version?.id && ref.content_type === 'lead4opfmPatch'
    )).length,
    4,
    'all four Lead endpoints should be content-addressed',
  );
  const override = client.tables.preset_payloads_v2.find(row => row.hash === version?.override_hash)?.payload as FakeRow;
  assert.equal('harmonyChordSlots' in override, false, 'L4 overrides should omit the active chord-bank payload');
  client.presetLatestManifestRpcCalls = 0;
  client.presetPayloadRpcCalls = 0;
  const loaded = await store.load('state', name, 'global');
  const restored = loaded ? getVersionData(loaded) : null;
  assert.ok(restored, 'graph-only state should load without a resolved payload');
  for (const key of [
    'synthEuclid1Steps', 'synthEuclid1Hits', 'synthEuclid1Source', 'synthEuclid1VoiceMask',
    'synthEuclid1Level', 'rootNote', 'tension', 'harmonyChordSlots', 'sample1LibraryKey', 'granularV1Mode',
    'dynamicsEq1LowFreq', 'padOscAWave', 'drumKickFreq', 'waterIntensity',
  ]) {
    assert.deepEqual(restored[key], state[key], `graph-only load should restore ${key}`);
  }
  assert.equal((restored.lead1PresetAData as FakeRow).id, state.lead1PresetA);
  assert.equal((restored.lead2PresetDData as FakeRow).id, state.lead2PresetD);
  assert.equal(client.presetLatestManifestRpcCalls, 1, 'cold graph load should use one manifest request');
  assert.equal(client.presetPayloadRpcCalls, 1, 'cold graph load should batch all unique payloads into one request');
  await store.load('state', name, 'global');
  assert.equal(client.presetPayloadRpcCalls, 1, 'warm graph load should reuse the verified hash cache');
}

async function testDeletedLeadLibraryPresetKeepsPinnedKitSound(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '59595959-5959-4959-8959-595959595959';
  client.authUserId = userId;
  store.setUserId(userId);

  const customPreset = structuredClone(DEFAULT_SOFT_RHODES);
  customPreset.id = 'pinned_custom_lead';
  customPreset.name = 'Pinned Custom Lead';
  customPreset.params.gain = 0.314;
  const engineEntry = makePresetEntry(
    'engine',
    'lead4opfm',
    customPreset.name,
    createLead4opFMPresetData(customPreset),
  );
  engineEntry.versions[0]!.dualRanges = { distance: { min: 0.2, max: 0.8 } };
  engineEntry.versions[0]!.sliderModes = { distance: 'sampleHold' };
  await store.save(engineEntry);
  const enginePreset = findPresetRow(client, 'engine', 'lead4opfm', customPreset.name);

  const kitData = {
    ...extractCascade(DEFAULT_STATE, 2, 'lead1Kit'),
    lead1PresetA: customPreset.name,
  };
  const kitName = 'Pinned Lead Kit';
  await store.save(makePresetEntry('kit', 'lead1Kit', kitName, kitData));
  const kitPreset = findPresetRow(client, 'kit', 'lead1Kit', kitName);
  const endpointRef = client.tables.preset_version_content_refs_v2.find(ref => (
    ref.version_id === kitPreset.latest_version_id
    && ref.ref_slot === 'derived.lead.1.endpoint-a'
    && ref.content_type === 'lead4opfmPatch'
  ));
  assert.ok(endpointRef, 'the L2 kit should pin its custom Lead endpoint by content hash');

  await store.delete('engine', customPreset.name, 'lead4opfm');
  assert.equal(typeof enginePreset.deleted_at, 'string', 'content pinning should allow the library entry to be recycled');
  const loaded = await store.load('kit', kitName, 'lead1Kit');
  const restored = loaded ? getVersionData(loaded) : null;
  const restoredEndpoint = restored?.lead1PresetAData as FakeRow | undefined;
  assert.equal(restoredEndpoint?.id, customPreset.name, 'the pinned patch should retain the selected lookup identity');
  assert.equal((restoredEndpoint?.params as FakeRow | undefined)?.gain, 0.314, 'the pinned patch should retain exact FM data');
  assert.deepEqual(restoredEndpoint?.dualRanges, { distance: { min: 0.2, max: 0.8 } });
  assert.deepEqual(restoredEndpoint?.sliderModes, { distance: 'sampleHold' });
}

async function testGraphSemanticNoOpAndBindingIsolation(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '57575757-5757-4757-8757-575757575757';
  client.authUserId = userId;
  store.setUserId(userId);
  const optimized = extractOptimizedStatePresetData(DEFAULT_STATE);
  const entry = makePresetEntry('state', 'global', 'Graph Signature State', optimized);
  entry.versions.push({ v: 2, note: 'semantic no-op', timestamp: entry.updatedAt + 1, data: structuredClone(optimized) });
  entry.currentVersion = 2;
  await store.save(entry);
  const preset = findPresetRow(client, 'state', 'global', entry.name);
  let versions = client.tables.preset_versions_v2.filter(row => row.preset_id === preset.id);
  assert.equal(versions.length, 2, 'a documented semantic no-op should retain its version note');
  assert.equal(versions[1]?.note, 'semantic no-op');

  const bindingChanged = { ...optimized, synthEuclid1Source: 'pad2', synthEuclid1Level: 0.31 };
  entry.versions.push({ v: 3, note: 'binding change', timestamp: entry.updatedAt + 2, data: bindingChanged });
  entry.currentVersion = 3;
  await store.save(entry);
  versions = client.tables.preset_versions_v2.filter(row => row.preset_id === preset.id);
  assert.equal(versions.length, 3, 'binding change should store a new graph version');
  const hashesFor = (versionId: string) => client.tables.preset_version_content_refs_v2
    .filter(ref => ref.version_id === versionId && String(ref.ref_slot).startsWith('sequencer.synth.1.'))
    .map(ref => `${ref.ref_slot}:${ref.content_hash}`).sort();
  assert.deepEqual(hashesFor(versions[0]!.id), hashesFor(versions[2]!.id), 'binding changes must reuse sequencer content hashes');
}

async function testMissingDerivedEndpointFallsBackWithWarning(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '58585858-5858-4858-8858-585858585858';
  client.authUserId = userId;
  store.setUserId(userId);
  const name = 'Missing Endpoint State';
  await store.save(makePresetEntry(
    'state',
    'global',
    name,
    extractOptimizedStatePresetData(DEFAULT_STATE),
  ));
  const preset = findPresetRow(client, 'state', 'global', name);
  const endpointRef = client.tables.preset_version_content_refs_v2.find(ref => (
    ref.version_id === preset.latest_version_id && ref.ref_slot === 'derived.pad.1.endpoint-a'
  ));
  assert.ok(endpointRef);
  const index = client.tables.preset_payloads_v2.findIndex(row => row.hash === endpointRef.content_hash);
  client.tables.preset_payloads_v2.splice(index, 1);
  evictPresetPayloadCacheV2(String(endpointRef.content_hash));

  const loaded = await store.load('state', name, 'global');
  const restored = loaded ? getVersionData(loaded) : null;
  assert.equal(restored?.padOscAWave, DEFAULT_STATE.padOscAWave, 'legacy selector fallback should restore missing endpoint data');
  assert.ok(loaded?.recoveryWarnings?.some(warning => (
    warning.slot === 'derived.pad.1.endpoint-a' && warning.reason === 'missing_payload'
  )));
}

await testSupabaseDeleteMovesPresetToRecycleBin();
await testSupabaseMetadataUpdateUsesExactTimestampCas();
await testSignatureEqualIdentityUsesCasAndNoteCreatesVersion();
await testQueuedImportMatchesCloudCollisionAndNewNameSemantics();
await testProductionWritesForkVisibleCrossOwnerRows();
await testJourneySummariesHydratePreviewsInOnePayloadBatch();
await testLocalMetadataUpdateUsesSameCasContract();
await testCompactDetailPayloadBundleLoadsByContentHash();
await testLatestManifestPayloadCacheAvoidsRepeatPayloadRpc();
await testAtomicSaveDedupesIdenticalPayloadHashes();
await testAtomicSaveSkipsVisibleExistingPayloadHashes();
await testAtomicSaveRetriesPayloadKindConflictHashes();
await testActiveDependencyBlocksSoftDeleteAcrossL1ToL4();
await testDeletingStateRetainsInternalGraphForRestore();
await testSharedDerivedChildSurvivesUntilLastRetainedRootPurges();
await testOrphanInternalDerivedChainPrunesAllLevels();
await testConcurrentSameIdentitySaveKeepsOneActiveV2Row();
await testLegacyWritesFailClosedWhenV2IsUnavailable();
await testAutoDerivedParentDoesNotBindVisibleSameHashChild();
await testStaleInternalDerivedRefDoesNotBlockOverwriteSave();
await testJourneyRefsPersistAsSupabaseV2GraphEdges();
await testJourneyReferrerCandidatesUseStableIdAndLatestVersionOnly();
await testUnresolvedJourneyRefFailsClosed();
await testAtomicSaveRollsBackWhenRefInsertFails();
await testHistoricalOnlyReferenceAllowsSoftDelete();
await testLatestVersionRollupClearsStaleMetadata();
await testLoadReportsRecoveryWarningForMissingSelectedCache();
await testMissingChildPayloadLoadsSilentFallback();
await testLegacyDeleteFailsClosedWhenV2IsUnavailable();
testRecycleBinSqlContainsGraphGuards();
testJourneyReferrerSqlIsCurrentVersionAndLeastPrivilege();
await testHybridSharedDeletePropagatesCloudFailure();
await testSharedV2DoesNotLeakLegacyRows();
await testSupabaseRenamePreservesPresetId();
await testDirectContentRefsReplaceResolvedSampleCopies();
await testGraphOnlyStateLoadWithoutResolvedPayload();
await testDeletedLeadLibraryPresetKeepsPinnedKitSound();
await testGraphSemanticNoOpAndBindingIsolation();
await testMissingDerivedEndpointFallsBackWithWarning();
