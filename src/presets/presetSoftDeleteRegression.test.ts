import assert from 'node:assert/strict';
import fs from 'node:fs';

import { extractCascade, extractParams, getVersionData } from './codec';
import { HybridPresetStore } from './HybridPresetStore';
import type { IPresetStore } from './PresetStore';
import { SupabasePresetStore } from './SupabasePresetStore';
import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import { DEFAULT_STATE } from '../ui/state';
import { createDiamondJourney } from '../audio/journeyTypes';
import { encodeJourneyPresetData, getJourneyNodeRefSlot } from './journeyPresetCodec';

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
    preset_payloads_v2: [] as FakePayloadV2Row[],
    presets: [] as FakeRow[],
  };
  presetsV2HardDeleteAttempts = 0;
  presetDetailRpcCalls = 0;
  legacyDetailRpcCalls = 0;
  failNextAtomicRefInsert = false;
  compactDetailPayloads = false;
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

    if (functionName === 'kessho_get_legacy_preset_detail') {
      return this.getLegacyPresetDetail(args);
    }

    if (functionName === 'kessho_lookup_preset_rows_v2') {
      return this.lookupPresetRowsV2(args);
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

    if (functionName === 'kessho_find_preset_references_v2') {
      return this.findPresetReferencesV2(String(args.target_type), String(args.target_name));
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

      for (const payload of payloads) {
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
        targetPresets,
        payloads: this.compactDetailPayloads ? payloads.map(row => row.payload) : payloads,
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
      data: this.tables.preset_version_refs_v2
        .filter(row => row.version_id === targetVersionId)
        .map(row => [
          row.ref_slot,
          row.target_preset_id,
          row.target_version_no ?? 'latest',
          row.override_hash ?? '',
        ].join(':'))
        .sort(),
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
    const protectedIds = this.activeVisibleGraphPresetIds();
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

  private activeVisibleGraphPresetIds(): Set<string> {
    const protectedIds = new Set<string>();
    const queue = this.tables.presets_v2.filter(row => (
      !row.deleted_at
      && row.latest_version_id
      && !this.isInternalDerived(row)
    ));
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (protectedIds.has(current.id)) continue;
      protectedIds.add(current.id);
      for (const ref of this.tables.preset_version_refs_v2.filter(candidate => candidate.version_id === current.latest_version_id)) {
        const child = this.tables.presets_v2.find(candidate => (
          candidate.id === ref.target_preset_id
          && !candidate.deleted_at
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
  assert.ok(await store.load('engine', presetName, 'pad1'), 'V2 detail load should work before recycle');
  assert.ok(client.presetDetailRpcCalls > 0, 'V2 detail loads should prefer the narrow detail RPC');

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

  const loaded = await store.load('engine', presetName, 'pad1');
  const loadedData = loaded ? getVersionData(loaded) : null;

  assert.ok(loaded, 'V2 detail load should accept compact payload objects from the RPC');
  assert.ok(client.presetDetailRpcCalls > 0, 'test should exercise the V2 detail RPC');
  assert.equal(loaded?.recoveryWarnings?.length ?? 0, 0, 'compact payload rows should not trigger recovery fallbacks');
  assert.equal(loadedData?.synthAttack, 0.003, 'loaded data should come from the compact resolved payload');
  assert.equal(loadedData?.padFoldAmount, 0.28, 'content-hashed compact payload should populate the resolved map');
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

async function testDeletingStatePrunesUnreferencedInternalDerivedGraph(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '15151515-1515-4151-8151-151515151515';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'State With Derived Graph';
  await store.save(makePresetEntry('state', 'global', stateName, DEFAULT_STATE as unknown as Record<string, unknown>));

  const state = findPresetRow(client, 'state', 'global', stateName);
  assert.ok(latestRefTarget(client, state, 'synth'), 'state save should create source-derived children');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'source'), 'state save should create active L3 internal-derived rows');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'kit'), 'state save should create active L2 internal-derived rows');
  assert.ok(activeInternalDerivedRows(client).some(row => row.type === 'engine'), 'state save should create active L1 internal-derived rows');

  await store.delete('state', stateName, 'global');

  assert.equal(
    activeInternalDerivedRows(client).length,
    0,
    'deleting the only visible root should recycle the entire unreferenced internal-derived graph',
  );
}

async function testSharedDerivedChildSurvivesUntilLastVisibleRootDeletes(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '16161616-1616-4161-8161-161616161616';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateAName = 'Shared Derived State A';
  const stateBName = 'Shared Derived State B';
  await store.save(makePresetEntry('state', 'global', stateAName, DEFAULT_STATE as unknown as Record<string, unknown>));
  await store.save(makePresetEntry('state', 'global', stateBName, DEFAULT_STATE as unknown as Record<string, unknown>));

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
  assert.equal(
    activeInternalDerivedRows(client).length,
    0,
    'shared internal-derived graph should recycle after the last visible root is deleted',
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

async function testLegacyCaseFoldedNameSemanticsStayConsistent(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '19191919-1919-4191-8191-191919191919';
  client.authUserId = userId;
  store.setUserId(userId);
  store['v2SchemaAvailable'] = false;

  const data = extractParams(DEFAULT_STATE, 1, 'pad1');
  await store.save(makePresetEntry('engine', 'pad1', 'Foo', data));
  await store.save(makePresetEntry('engine', 'pad1', 'foo', mutateFirstNumber(data)));
  await store.save(makePresetEntry('engine', 'pad1', 'Foo', mutateFirstNumber(mutateFirstNumber(data))));

  const activeLegacyRows = client.tables.presets.filter(row => row.deleted_at == null);
  assert.equal(activeLegacyRows.length, 1, 'legacy saves should treat Foo/foo/Foo as one logical row');
  assert.equal((await store.list('engine', 'pad1')).filter(summary => summary.name.toLowerCase() === 'foo').length, 1);
  assert.ok(await store.load('engine', 'foo', 'pad1'), 'legacy load should use the same case-folded identity as save');
  assert.ok(client.legacyDetailRpcCalls > 0, 'legacy detail loads should prefer the narrow legacy detail RPC');
  assert.equal(await store.exists('engine', 'FOO', 'pad1'), true, 'legacy exists should use the same case-folded identity as save');

  await store.delete('engine', 'fOo', 'pad1');

  assert.equal(await store.exists('engine', 'foo', 'pad1'), false, 'legacy delete should remove the case-folded logical row from exists');
  assert.equal(await store.load('engine', 'Foo', 'pad1'), null, 'legacy delete should remove the case-folded logical row from load');
  assert.equal(
    (await store.list('engine', 'pad1')).some(summary => summary.name.toLowerCase() === 'foo'),
    false,
    'legacy delete should remove the case-folded logical row from list',
  );
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

async function testJourneyRefsPersistAsSupabaseV2GraphEdges(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '77777777-7777-4777-8777-777777777777';
  client.authUserId = userId;
  store.setUserId(userId);

  const stateName = 'State Used By Journey';
  const journeyName = 'Journey Active Dependency';
  await store.save(makePresetEntry('state', 'global', stateName, DEFAULT_STATE as unknown as Record<string, unknown>));
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
  await store.save(makePresetEntry('state', 'global', stateName, DEFAULT_STATE as unknown as Record<string, unknown>));

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

async function testLegacyDeleteUsesSoftDeleteRpc(): Promise<void> {
  const client = new FakeSupabaseClient();
  const store = new SupabasePresetStore(client as never);
  const userId = '99999999-9999-4999-8999-999999999999';
  client.authUserId = userId;
  store.setUserId(userId);
  store['v2SchemaAvailable'] = false;

  client.insert('presets', {
    user_id: userId,
    type: 'engine',
    scope: 'pad1',
    name: 'Legacy Soft Delete',
    author: 'user',
    library: 'cloud',
    creator: 'Legacy',
    description: null,
    tags: [],
    visibility: 'public',
    family_name: 'Legacy Soft Delete',
    variant_name: 'Legacy Soft Delete',
    variant_rank: null,
    versions: [{
      v: 1,
      note: 'legacy row should soft delete',
      timestamp: Date.parse('2026-05-19T12:00:00.000Z'),
      data: extractParams(DEFAULT_STATE, 1, 'pad1'),
    }],
    current_version: 1,
    rating: null,
    plays: 0,
    created_at: client.now(),
    updated_at: client.now(),
    deleted_at: null,
    deleted_by: null,
    archived: false,
  });

  await store.delete('engine', 'Legacy Soft Delete', 'pad1');

  const row = client.tables.presets.find(candidate => candidate.name === 'Legacy Soft Delete');
  assert.ok(row, 'legacy soft delete should keep the legacy row');
  assert.equal(typeof row.deleted_at, 'string', 'legacy soft delete should set deleted_at');
  assert.equal(row.deleted_by, userId, 'legacy soft delete should set deleted_by');
  assert.equal(row.archived, true, 'legacy soft delete should archive the row');
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
await testCompactDetailPayloadBundleLoadsByContentHash();
await testActiveDependencyBlocksSoftDeleteAcrossL1ToL4();
await testDeletingStatePrunesUnreferencedInternalDerivedGraph();
await testSharedDerivedChildSurvivesUntilLastVisibleRootDeletes();
await testOrphanInternalDerivedChainPrunesAllLevels();
await testConcurrentSameIdentitySaveKeepsOneActiveV2Row();
await testLegacyCaseFoldedNameSemanticsStayConsistent();
await testAutoDerivedParentDoesNotBindVisibleSameHashChild();
await testJourneyRefsPersistAsSupabaseV2GraphEdges();
await testUnresolvedJourneyRefFailsClosed();
await testAtomicSaveRollsBackWhenRefInsertFails();
await testHistoricalOnlyReferenceAllowsSoftDelete();
await testLatestVersionRollupClearsStaleMetadata();
await testLoadReportsRecoveryWarningForMissingSelectedCache();
await testMissingChildPayloadLoadsSilentFallback();
await testLegacyDeleteUsesSoftDeleteRpc();
testRecycleBinSqlContainsGraphGuards();
await testHybridSharedDeletePropagatesCloudFailure();
await testSharedV2DoesNotLeakLegacyRows();
