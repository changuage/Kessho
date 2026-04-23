// src/presets/SupabasePresetStore.ts
// Cloud preset store backed by Supabase.
// Reads the V2 normalized schema when available, falls back to the legacy
// inline-json table during cutover, and keeps the existing IPresetStore API.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { compressVersions, getVersionData } from './codec';
import type { IPresetStore } from './PresetStore';
import {
  extractPresetVersionMetadata,
  getPresetScope,
  normalizePresetEntry,
  normalizePresetSummary,
} from './presetUtils';
import {
  applyRecordPatch,
  canonicalizeRecord,
  computeRecordPatch,
  getPresetChildSpecs,
  getResolvedVersionSnapshot,
  hashCanonicalJson,
  materializePresetVersion,
  normalizeResolvedVersionData,
  type PresetPayloadKind,
  type PresetPayloadV2Row,
  type PresetV2Row,
  type PresetVersionRefV2Row,
  type PresetVersionV2Row,
  stripReferencedChildData,
  stableStringifyCanonical,
} from './presetStorageV2';
import { SHARED_PRESET_TEST_MODE } from './sharedMode';
import type {
  PresetEntry,
  PresetLevel,
  PresetRef,
  PresetSummary,
  PresetVersionMetadata,
} from './types';

const LEGACY_DELAY_A_KEY_PATTERN = /"leadDelay(?:ReverbSend|Time|Feedback|Mix|Enabled|Spread|Filter|Send)"/;
const VERSION_CHECKPOINT_INTERVAL = 8;
const PATCH_TO_SNAPSHOT_RATIO = 0.65;

/** Row shape returned from the legacy Supabase `presets` table */
interface PresetRow {
  id: string;
  user_id: string | null;
  type: string;
  scope: string | null;
  name: string;
  author: string;
  library: string;
  creator: string | null;
  description: string | null;
  tags: string[] | null;
  visibility: string;
  family_name: string | null;
  variant_name: string | null;
  variant_rank: number | null;
  forked_from: string | null;
  plays: number;
  versions: unknown;
  current_version: number;
  created_at: string;
  updated_at: string;
  rating: number | null;
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function getLegacyLogicalKey(row: PresetRow): string {
  return `${row.type}:${row.scope ?? ''}:${normalizeNameKey(row.name)}`;
}

function compareLegacyPresetRowPriority(left: PresetRow, right: PresetRow, userId: string | null): number {
  const leftVersionCount = Array.isArray(left.versions) ? left.versions.length : 0;
  const rightVersionCount = Array.isArray(right.versions) ? right.versions.length : 0;

  if (SHARED_PRESET_TEST_MODE) {
    if (leftVersionCount !== rightVersionCount) return rightVersionCount - leftVersionCount;

    const leftUpdated = new Date(left.updated_at).getTime();
    const rightUpdated = new Date(right.updated_at).getTime();
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

    const leftCreated = new Date(left.created_at).getTime();
    const rightCreated = new Date(right.created_at).getTime();
    return rightCreated - leftCreated;
  }

  const leftOwn = !!userId && left.user_id === userId;
  const rightOwn = !!userId && right.user_id === userId;
  if (leftOwn !== rightOwn) return leftOwn ? -1 : 1;

  const leftVisibilityRank = left.visibility === 'featured' ? 1 : 0;
  const rightVisibilityRank = right.visibility === 'featured' ? 1 : 0;
  if (leftVisibilityRank !== rightVisibilityRank) return rightVisibilityRank - leftVisibilityRank;

  const leftUpdated = new Date(left.updated_at).getTime();
  const rightUpdated = new Date(right.updated_at).getTime();
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  if (leftVersionCount !== rightVersionCount) return rightVersionCount - leftVersionCount;

  const leftCreated = new Date(left.created_at).getTime();
  const rightCreated = new Date(right.created_at).getTime();
  return rightCreated - leftCreated;
}

function dedupePreferredLegacyRows(rows: PresetRow[], userId: string | null): PresetRow[] {
  const preferred = new Map<string, PresetRow>();
  for (const row of rows) {
    const key = getLegacyLogicalKey(row);
    const existing = preferred.get(key);
    if (!existing || compareLegacyPresetRowPriority(row, existing, userId) < 0) {
      preferred.set(key, row);
    }
  }
  return Array.from(preferred.values()).sort((left, right) => compareLegacyPresetRowPriority(left, right, userId));
}

function legacyRowToEntry(row: PresetRow): PresetEntry {
  return normalizePresetEntry({
    id: row.id,
    type: row.type as PresetLevel,
    scope: row.scope ?? undefined,
    engine: row.type === 'engine' ? (row.scope ?? undefined) : undefined,
    source: row.type !== 'engine' ? (row.scope ?? undefined) : undefined,
    name: row.name,
    author: row.author as PresetEntry['author'],
    library: row.library as 'stock' | 'user' | 'cloud',
    creator: row.creator ?? undefined,
    description: row.description ?? undefined,
    visibility: (row.visibility ?? 'private') as 'private' | 'public' | 'featured',
    familyName: row.family_name ?? row.name,
    variantName: row.variant_name ?? row.name,
    variantRank: row.variant_rank ?? undefined,
    tags: row.tags ?? [],
    versions: Array.isArray(row.versions) ? row.versions as PresetEntry['versions'] : [],
    currentVersion: row.current_version,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    remoteId: row.id,
    playCount: row.plays,
    rating: row.rating ?? undefined,
  })!;
}

function entryToLegacyRow(entry: PresetEntry, userId: string | null): Record<string, unknown> {
  return {
    user_id: userId,
    type: entry.type,
    scope: getPresetScope(entry, entry.type) ?? null,
    name: entry.name,
    author: entry.author || 'user',
    library: entry.library || 'cloud',
    creator: entry.creator ?? 'Anonymous',
    description: entry.description ?? null,
    tags: entry.tags ?? [],
    visibility: entry.visibility ?? 'private',
    family_name: entry.familyName ?? entry.name,
    variant_name: entry.variantName ?? entry.name,
    variant_rank: entry.variantRank ?? null,
    versions: entry.versions,
    current_version: entry.currentVersion,
    rating: entry.rating ?? null,
  };
}

function getV2LogicalKey(row: Pick<PresetV2Row, 'type' | 'scope' | 'name'>): string {
  return `${row.type}:${row.scope ?? ''}:${normalizeNameKey(row.name)}`;
}

function comparePresetV2Priority(left: PresetV2Row, right: PresetV2Row, userId: string | null): number {
  if (SHARED_PRESET_TEST_MODE) {
    if (left.latest_version_no !== right.latest_version_no) {
      return right.latest_version_no - left.latest_version_no;
    }

    const leftUpdated = new Date(left.updated_at).getTime();
    const rightUpdated = new Date(right.updated_at).getTime();
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

    const leftCreated = new Date(left.created_at).getTime();
    const rightCreated = new Date(right.created_at).getTime();
    return rightCreated - leftCreated;
  }

  const leftOwn = !!userId && left.owner_user_id === userId;
  const rightOwn = !!userId && right.owner_user_id === userId;
  if (leftOwn !== rightOwn) return leftOwn ? -1 : 1;

  const leftVisibilityRank = left.visibility === 'featured' ? 1 : 0;
  const rightVisibilityRank = right.visibility === 'featured' ? 1 : 0;
  if (leftVisibilityRank !== rightVisibilityRank) return rightVisibilityRank - leftVisibilityRank;

  const leftUpdated = new Date(left.updated_at).getTime();
  const rightUpdated = new Date(right.updated_at).getTime();
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  if (left.latest_version_no !== right.latest_version_no) {
    return right.latest_version_no - left.latest_version_no;
  }

  const leftCreated = new Date(left.created_at).getTime();
  const rightCreated = new Date(right.created_at).getTime();
  return rightCreated - leftCreated;
}

function dedupePreferredV2Rows(rows: PresetV2Row[], userId: string | null): PresetV2Row[] {
  const preferred = new Map<string, PresetV2Row>();
  for (const row of rows) {
    const key = getV2LogicalKey(row);
    const existing = preferred.get(key);
    if (!existing || comparePresetV2Priority(row, existing, userId) < 0) {
      preferred.set(key, row);
    }
  }
  return Array.from(preferred.values()).sort((left, right) => comparePresetV2Priority(left, right, userId));
}

function mergeEntriesByLogicalKey(entries: PresetEntry[]): PresetEntry[] {
  const merged = new Map<string, PresetEntry>();
  for (const entry of entries) {
    const key = `${entry.type}:${getPresetScope(entry, entry.type) ?? ''}:${normalizeNameKey(entry.name)}`;
    const existing = merged.get(key);
    if (!existing || (existing.updatedAt ?? 0) < (entry.updatedAt ?? 0)) {
      merged.set(key, entry);
    }
  }
  return [...merged.values()];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [record.code, record.message, record.details, record.hint].filter(Boolean).join(' ').toLowerCase();
  return text.includes('does not exist') || (text.includes('relation') && text.includes('_v2'));
}

function isConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; message?: string };
  return record.code === '23505' || record.message?.toLowerCase().includes('duplicate key') === true;
}

export class SupabasePresetStore implements IPresetStore {
  private client: SupabaseClient;
  private userId: string | null = null;
  private isAnonymous = false;
  private v2SchemaAvailable: boolean | null = null;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** Set the authenticated user ID. Call after auth state changes. */
  setUserId(userId: string | null, anonymous = false): void {
    this.userId = userId;
    this.isAnonymous = anonymous;
  }

  private getOwnerKey(): string {
    if (SHARED_PRESET_TEST_MODE) return 'public';
    return this.userId ? `user:${this.userId}` : 'anonymous';
  }

  private getVersionTimestamp(version: PresetEntry['versions'][number]): string {
    return new Date(version.timestamp || Date.now()).toISOString();
  }

  private markV2UnavailableIfMissing(error: unknown): boolean {
    if (isMissingRelationError(error)) {
      this.v2SchemaAvailable = false;
      return true;
    }
    return false;
  }

  private async supportsV2(): Promise<boolean> {
    if (this.v2SchemaAvailable !== null) return this.v2SchemaAvailable;

    const { error } = await this.client
      .from('presets_v2')
      .select('id')
      .limit(1);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return false;
      this.v2SchemaAvailable = true;
      return true;
    }

    this.v2SchemaAvailable = true;
    return true;
  }

  private async rewriteLegacyDelayAKeysIfOwned(row: PresetRow, entry: PresetEntry): Promise<void> {
    if (!this.userId || row.user_id !== this.userId) return;
    if (!LEGACY_DELAY_A_KEY_PATTERN.test(JSON.stringify(row.versions ?? null))) return;

    const payload = entryToLegacyRow(entry, row.user_id);
    delete payload.user_id;

    const { error } = await this.client
      .from('presets')
      .update(payload)
      .eq('id', row.id)
      .eq('user_id', this.userId);

    if (error) {
      console.warn('Cloud legacy Delay A rewrite failed:', row.id, error.message);
    }
  }

  private async saveLegacy(entry: PresetEntry): Promise<void> {
    const normalized = normalizePresetEntry(entry);
    if (!normalized) throw new Error('Invalid preset entry');

    compressVersions(normalized);
    const scope = getPresetScope(normalized, normalized.type);
    const row = entryToLegacyRow(normalized, this.userId);
    if (SHARED_PRESET_TEST_MODE) {
      row.visibility = 'public';
    } else if (this.isAnonymous && !normalized.visibility) {
      row.visibility = 'public';
    }

    let existingQuery = this.client
      .from('presets')
      .select('*')
      .eq('type', normalized.type)
      .eq('name', normalized.name);

    if (!SHARED_PRESET_TEST_MODE) {
      if (this.userId) existingQuery = existingQuery.eq('user_id', this.userId);
      else existingQuery = existingQuery.is('user_id', null);
    }

    if (scope) existingQuery = existingQuery.eq('scope', scope);
    else existingQuery = existingQuery.is('scope', null);

    const { data: existingRows, error: existingLookupError } = await existingQuery
      .order('updated_at', { ascending: false })
      .limit(20);

    if (existingLookupError) {
      console.error('SupabasePresetStore.save lookup error:', existingLookupError);
      throw new Error(`Cloud lookup failed: ${existingLookupError.message}`);
    }

    const existing = existingRows?.length
      ? dedupePreferredLegacyRows(existingRows as PresetRow[], SHARED_PRESET_TEST_MODE ? null : this.userId)[0]
      : null;

    let error: PostgrestError | null = null;
    if (existing) {
      delete row.user_id;
      const res = await this.client.from('presets').update(row).eq('id', existing.id);
      error = res.error;
    } else {
      const res = await this.client.from('presets').insert(row);
      error = res.error;
    }

    if (error) {
      console.error('SupabasePresetStore.save error:', error);
      throw new Error(`Cloud save failed: ${error.message}`);
    }
  }

  private async loadLegacy(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    let query = this.client
      .from('presets')
      .select('*')
      .eq('type', type)
      .eq('name', name);

    if (scope) query = query.eq('scope', scope);
    else query = query.is('scope', null);

    if (!SHARED_PRESET_TEST_MODE) {
      if (this.userId) {
        query = query.or(`user_id.eq.${this.userId},visibility.in.(public,featured)`);
      } else {
        query = query.in('visibility', ['public', 'featured']);
      }
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    const rows = dedupePreferredLegacyRows(data as PresetRow[], SHARED_PRESET_TEST_MODE ? null : this.userId);
    const row = rows[0];
    if (!row) return null;
    const entry = legacyRowToEntry(row);
    await this.rewriteLegacyDelayAKeysIfOwned(row, entry);
    if (version !== undefined) {
      const selected = entry.versions.find(v => v.v === version);
      if (!selected) return null;
      return { ...entry, currentVersion: selected.v };
    }
    return entry;
  }

  private async listLegacy(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    let query = this.client
      .from('presets')
      .select('*')
      .eq('type', type);

    if (scope) query = query.eq('scope', scope);

    if (!SHARED_PRESET_TEST_MODE) {
      if (this.userId) {
        query = query.or(`user_id.eq.${this.userId},visibility.in.(public,featured)`);
      } else {
        query = query.in('visibility', ['public', 'featured']);
      }
    }

    query = query.order('updated_at', { ascending: false }).limit(200);

    const { data, error } = await query;
    if (error) {
      console.error('SupabasePresetStore.list error:', error);
      return [];
    }

    const rows = dedupePreferredLegacyRows(data as PresetRow[], SHARED_PRESET_TEST_MODE ? null : this.userId);
    const entries = rows.map(row => legacyRowToEntry(row));
    await Promise.allSettled(entries.map((entry, index) => this.rewriteLegacyDelayAKeysIfOwned(rows[index]!, entry)));

    return entries
      .map(entry => normalizePresetSummary(entry))
      .filter(Boolean) as PresetSummary[];
  }

  private async deleteLegacy(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (SHARED_PRESET_TEST_MODE) {
      console.warn('Shared preset delete is disabled in testing mode:', type, scope ?? '', name);
      return;
    }

    if (!this.userId) return;

    let query = this.client
      .from('presets')
      .delete()
      .eq('type', type)
      .eq('name', name)
      .eq('user_id', this.userId);

    if (scope) query = query.eq('scope', scope);

    const { error } = await query;
    if (error) {
      console.error('SupabasePresetStore.delete error:', error);
    }
  }

  private async existsLegacy(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    let query = this.client
      .from('presets')
      .select('id')
      .eq('type', type)
      .eq('name', name);

    if (scope) query = query.eq('scope', scope);
    if (!SHARED_PRESET_TEST_MODE && this.userId) query = query.eq('user_id', this.userId);

    const { data } = await query.limit(1);
    return !!data && data.length > 0;
  }

  private async queryPresetRowsV2(type: PresetLevel, name: string, scope?: string): Promise<PresetV2Row[]> {
    let query = this.client
      .from('presets_v2')
      .select('*')
      .eq('type', type)
      .eq('name', name);

    if (scope) query = query.eq('scope', scope);
    else query = query.is('scope', null);

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      throw new Error(`V2 preset lookup failed: ${error.message}`);
    }

    return dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId);
  }

  private async findMatchingPresetV2(
    type: PresetLevel,
    scope: string,
    resolvedHash: string,
    excludePresetId?: string,
  ): Promise<PresetV2Row | null> {
    let query = this.client
      .from('presets_v2')
      .select('*')
      .eq('type', type)
      .eq('scope', scope)
      .eq('latest_resolved_hash', resolvedHash)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (excludePresetId) {
      query = query.neq('id', excludePresetId);
    }

    const { data, error } = await query;
    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return null;
      throw new Error(`V2 ref lookup failed: ${error.message}`);
    }

    const rows = dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId);
    return rows[0] ?? null;
  }

  private async ensurePayloadV2(kind: PresetPayloadKind, payload: unknown): Promise<string | null> {
    if (payload === undefined || payload === null) return null;
    if (Array.isArray(payload) && payload.length === 0) return null;
    if (isPlainObject(payload) && Object.keys(payload).length === 0) return null;

    const normalized = canonicalizeRecord(payload as Record<string, unknown>);
    const hash = await hashCanonicalJson(normalized);

    const { data: existing, error: existingError } = await this.client
      .from('preset_payloads_v2')
      .select('hash')
      .eq('hash', hash)
      .limit(1);

    if (existingError) {
      if (this.markV2UnavailableIfMissing(existingError)) return null;
      throw new Error(`V2 payload lookup failed: ${existingError.message}`);
    }

    if (existing && existing.length > 0) return hash;

    const { error: insertError } = await this.client
      .from('preset_payloads_v2')
      .insert({
        hash,
        payload_kind: kind,
        payload: normalized,
      });

    if (insertError && !isConflictError(insertError)) {
      if (this.markV2UnavailableIfMissing(insertError)) return null;
      throw new Error(`V2 payload insert failed: ${insertError.message}`);
    }

    return hash;
  }

  private async fetchPayloadMapV2(hashes: string[]): Promise<Map<string, unknown>> {
    const uniqueHashes = [...new Set(hashes.filter(Boolean))];
    const payloadMap = new Map<string, unknown>();
    if (!uniqueHashes.length) return payloadMap;

    const { data, error } = await this.client
      .from('preset_payloads_v2')
      .select('*')
      .in('hash', uniqueHashes);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return payloadMap;
      throw new Error(`V2 payload fetch failed: ${error.message}`);
    }

    for (const row of (data ?? []) as PresetPayloadV2Row[]) {
      payloadMap.set(row.hash, row.payload);
    }

    return payloadMap;
  }

  private async loadResolvedSnapshotByVersionRowV2(
    row: PresetVersionV2Row,
    payloadMap: Map<string, unknown>,
    refsByVersionId: Map<string, PresetVersionRefV2Row[]>,
    targetPresetMap: Map<string, PresetV2Row>,
    previousResolved: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    if (row.resolved_hash) {
      const cached = payloadMap.get(row.resolved_hash);
      if (isPlainObject(cached)) return canonicalizeRecord(cached);
    }

    let mergedFromRefs: Record<string, unknown> = {};
    const refRows = refsByVersionId.get(row.id) ?? [];
    for (const refRow of refRows) {
      const targetPreset = targetPresetMap.get(refRow.target_preset_id);
      if (!targetPreset?.latest_resolved_hash) continue;
      const childData = payloadMap.get(targetPreset.latest_resolved_hash);
      if (!isPlainObject(childData)) continue;
      let mergedChild = canonicalizeRecord(childData);
      if (refRow.override_hash) {
        const childOverride = payloadMap.get(refRow.override_hash);
        if (isPlainObject(childOverride)) {
          mergedChild = canonicalizeRecord({ ...mergedChild, ...childOverride });
        }
      }
      mergedFromRefs = canonicalizeRecord({ ...mergedFromRefs, ...mergedChild });
    }

    const overridePayload = row.override_hash ? payloadMap.get(row.override_hash) : null;
    const override = isPlainObject(overridePayload) ? canonicalizeRecord(overridePayload) : {};

    if (row.storage_mode === 'patch' && row.patch_from_prev_hash && previousResolved) {
      const patchPayload = payloadMap.get(row.patch_from_prev_hash);
      const patched = applyRecordPatch(previousResolved, isPlainObject(patchPayload) ? patchPayload as never : null);
      return canonicalizeRecord({ ...mergedFromRefs, ...patched, ...override });
    }

    return canonicalizeRecord({ ...mergedFromRefs, ...override });
  }

  private async loadV2ByRow(row: PresetV2Row, version?: number): Promise<PresetEntry | null> {
    const { data: versionData, error: versionError } = await this.client
      .from('preset_versions_v2')
      .select('*')
      .eq('preset_id', row.id)
      .order('version_no', { ascending: true });

    if (versionError) {
      if (this.markV2UnavailableIfMissing(versionError)) return null;
      throw new Error(`V2 version load failed: ${versionError.message}`);
    }

    const versionRows = (versionData ?? []) as PresetVersionV2Row[];
    if (!versionRows.length) return null;

    const versionIds = versionRows.map(candidate => candidate.id);
    const { data: refData, error: refError } = await this.client
      .from('preset_version_refs_v2')
      .select('*')
      .in('version_id', versionIds);

    if (refError) {
      if (this.markV2UnavailableIfMissing(refError)) return null;
      throw new Error(`V2 ref load failed: ${refError.message}`);
    }

    const refRows = (refData ?? []) as PresetVersionRefV2Row[];
    const targetPresetIds = [...new Set(refRows.map(candidate => candidate.target_preset_id))];
    let targetPresetMap = new Map<string, PresetV2Row>();
    if (targetPresetIds.length > 0) {
      const { data: targetData, error: targetError } = await this.client
        .from('presets_v2')
        .select('*')
        .in('id', targetPresetIds);

      if (targetError) {
        if (this.markV2UnavailableIfMissing(targetError)) return null;
        throw new Error(`V2 ref target load failed: ${targetError.message}`);
      }

      targetPresetMap = new Map((targetData ?? []).map(candidate => [candidate.id, candidate as PresetV2Row]));
    }

    const payloadHashes = new Set<string>();
    for (const versionRow of versionRows) {
      if (versionRow.override_hash) payloadHashes.add(versionRow.override_hash);
      if (versionRow.metadata_hash) payloadHashes.add(versionRow.metadata_hash);
      if (versionRow.patch_from_prev_hash) payloadHashes.add(versionRow.patch_from_prev_hash);
      if (versionRow.resolved_hash) payloadHashes.add(versionRow.resolved_hash);
    }
    for (const refRow of refRows) {
      if (refRow.override_hash) payloadHashes.add(refRow.override_hash);
    }
    for (const targetRow of targetPresetMap.values()) {
      if (targetRow.latest_resolved_hash) payloadHashes.add(targetRow.latest_resolved_hash);
    }

    const payloadMap = await this.fetchPayloadMapV2([...payloadHashes]);
    const refsByVersionId = new Map<string, PresetVersionRefV2Row[]>();
    for (const refRow of refRows) {
      const bucket = refsByVersionId.get(refRow.version_id) ?? [];
      bucket.push(refRow);
      refsByVersionId.set(refRow.version_id, bucket);
    }

    const materializedVersions: PresetEntry['versions'] = [];
    let previousResolved: Record<string, unknown> | null = null;
    for (const versionRow of versionRows) {
      const versionRefs = refsByVersionId.get(versionRow.id) ?? [];
      const refMap: Record<string, PresetRef> = {};
      for (const versionRef of versionRefs) {
        const targetPreset = targetPresetMap.get(versionRef.target_preset_id);
        if (!targetPreset) continue;
        refMap[versionRef.ref_slot] = {
          id: targetPreset.id,
          name: targetPreset.name,
          version: versionRef.follow_latest ? 'latest' : (versionRef.target_version_no ?? targetPreset.latest_version_no),
          scope: targetPreset.scope ?? undefined,
        };
      }

      const resolvedData = await this.loadResolvedSnapshotByVersionRowV2(
        versionRow,
        payloadMap,
        refsByVersionId,
        targetPresetMap,
        previousResolved,
      );
      previousResolved = resolvedData;

      const metadataPayload = versionRow.metadata_hash ? payloadMap.get(versionRow.metadata_hash) : undefined;
      const metadata = isPlainObject(metadataPayload) ? metadataPayload as PresetVersionMetadata : undefined;
      materializedVersions.push(
        materializePresetVersion(
          versionRow,
          resolvedData,
          metadata,
          Object.keys(refMap).length > 0 ? refMap : undefined,
        ),
      );
    }

    const entry = normalizePresetEntry({
      id: row.id,
      remoteId: row.id,
      type: row.type,
      scope: row.scope ?? undefined,
      engine: row.type === 'engine' ? (row.scope ?? undefined) : undefined,
      source: row.type !== 'engine' ? (row.scope ?? undefined) : undefined,
      name: row.name,
      author: row.author,
      library: row.library,
      creator: row.creator ?? undefined,
      description: row.description ?? undefined,
      visibility: row.visibility,
      familyName: row.family_name ?? row.name,
      variantName: row.variant_name ?? row.name,
      variantRank: row.variant_rank ?? undefined,
      tags: row.tags ?? [],
      playCount: row.play_count ?? undefined,
      rating: row.rating ?? undefined,
      versions: materializedVersions,
      currentVersion: version ?? row.latest_version_no,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    });

    return entry;
  }

  private async loadV2(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    const rows = await this.queryPresetRowsV2(type, name, scope);
    const row = rows[0];
    if (!row) return null;
    return this.loadV2ByRow(row, version);
  }

  private async listV2(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    let query = this.client
      .from('presets_v2')
      .select('*')
      .eq('type', type);

    if (scope) query = query.eq('scope', scope);

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(300);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      console.error('SupabasePresetStore.listV2 error:', error);
      return [];
    }

    const rows = dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId);
    const summaries: PresetSummary[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      scope: row.scope ?? undefined,
      engine: row.type === 'engine' ? (row.scope ?? undefined) : undefined,
      source: row.type !== 'engine' ? (row.scope ?? undefined) : undefined,
      name: row.name,
      author: row.author,
      library: row.library,
      creator: row.creator ?? undefined,
      description: row.description ?? undefined,
      visibility: row.visibility,
      familyId: `${row.type}:${row.scope ?? 'global'}:${normalizeNameKey(row.family_name ?? row.name)}`,
      familyName: row.family_name ?? row.name,
      variantId: `${row.type}:${row.scope ?? 'global'}:${normalizeNameKey(row.family_name ?? row.name)}:${normalizeNameKey(row.variant_name ?? row.name)}`,
      variantName: row.variant_name ?? row.name,
      variantRank: row.variant_rank ?? undefined,
      remoteId: row.id,
      playCount: row.play_count ?? undefined,
      rating: row.rating ?? undefined,
      tags: row.tags ?? [],
      versionCount: row.latest_version_no,
      currentVersion: row.latest_version_no,
      updatedAt: new Date(row.updated_at).getTime(),
    }));

    return summaries
      .map(summary => normalizePresetSummary({
        id: summary.id,
        remoteId: summary.remoteId,
        type: summary.type,
        scope: summary.scope,
        engine: summary.engine,
        source: summary.source,
        name: summary.name,
        author: summary.author,
        library: summary.library,
        creator: summary.creator,
        description: summary.description,
        visibility: summary.visibility,
        familyId: summary.familyId,
        familyName: summary.familyName,
        variantId: summary.variantId,
        variantName: summary.variantName,
        variantRank: summary.variantRank,
        playCount: summary.playCount,
        rating: summary.rating,
        tags: summary.tags,
        versions: Array.from({ length: summary.versionCount }, (_, index) => ({
          v: index + 1,
          note: '',
          timestamp: summary.updatedAt,
          data: {},
        })),
        currentVersion: summary.currentVersion,
        createdAt: summary.updatedAt,
        updatedAt: summary.updatedAt,
      })!)
      .filter(Boolean) as PresetSummary[];
  }

  private async deleteV2(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (SHARED_PRESET_TEST_MODE) {
      console.warn('Shared preset delete is disabled in testing mode:', type, scope ?? '', name);
      return;
    }

    const rows = await this.queryPresetRowsV2(type, name, scope);
    const target = rows[0];
    if (!target) return;

    const { error } = await this.client
      .from('presets_v2')
      .delete()
      .eq('id', target.id);

    if (error && !this.markV2UnavailableIfMissing(error)) {
      console.error('SupabasePresetStore.deleteV2 error:', error);
    }
  }

  private async existsV2(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    const rows = await this.queryPresetRowsV2(type, name, scope);
    return rows.length > 0;
  }

  private async saveV2(entry: PresetEntry): Promise<void> {
    const normalized = normalizePresetEntry(entry);
    if (!normalized) throw new Error('Invalid preset entry');

    const scope = getPresetScope(normalized, normalized.type);
    const identityPayload = {
      owner_key: this.getOwnerKey(),
      owner_user_id: this.userId,
      type: normalized.type,
      scope: scope ?? null,
      name: normalized.name,
      author: normalized.author || 'user',
      library: normalized.library || 'cloud',
      creator: normalized.creator ?? 'Anonymous',
      description: normalized.description ?? null,
      tags: normalized.tags ?? [],
      visibility: SHARED_PRESET_TEST_MODE
        ? 'public'
        : (this.isAnonymous && !normalized.visibility ? 'public' : (normalized.visibility ?? 'private')),
      family_name: normalized.familyName ?? normalized.name,
      variant_name: normalized.variantName ?? normalized.name,
      variant_rank: normalized.variantRank ?? null,
      forked_from: null,
      rating: normalized.rating ?? null,
    };

    const existingRows = await this.queryPresetRowsV2(normalized.type, normalized.name, scope);
    let presetRow = existingRows[0] ?? null;

    if (!presetRow) {
      const { data, error } = await this.client
        .from('presets_v2')
        .insert(identityPayload)
        .select('*')
        .single();

      if (error) {
        if (this.markV2UnavailableIfMissing(error)) {
          await this.saveLegacy(normalized);
          return;
        }
        throw new Error(`V2 preset insert failed: ${error.message}`);
      }

      presetRow = data as PresetV2Row;
    } else {
      const { data, error } = await this.client
        .from('presets_v2')
        .update(identityPayload)
        .eq('id', presetRow.id)
        .select('*')
        .single();

      if (error) {
        if (this.markV2UnavailableIfMissing(error)) {
          await this.saveLegacy(normalized);
          return;
        }
        throw new Error(`V2 preset update failed: ${error.message}`);
      }

      presetRow = data as PresetV2Row;
    }

    const { data: storedVersionData, error: storedVersionError } = await this.client
      .from('preset_versions_v2')
      .select('*')
      .eq('preset_id', presetRow.id)
      .order('version_no', { ascending: true });

    if (storedVersionError) {
      if (this.markV2UnavailableIfMissing(storedVersionError)) {
        await this.saveLegacy(normalized);
        return;
      }
      throw new Error(`V2 stored version lookup failed: ${storedVersionError.message}`);
    }

    const storedVersionRows = (storedVersionData ?? []) as PresetVersionV2Row[];
    const storedVersionMap = new Map(storedVersionRows.map(candidate => [candidate.version_no, candidate]));
    let previousStoredVersionRow = storedVersionRows[storedVersionRows.length - 1] ?? null;

    let previousResolved = previousStoredVersionRow?.resolved_hash
      ? (await this.fetchPayloadMapV2([previousStoredVersionRow.resolved_hash])).get(previousStoredVersionRow.resolved_hash)
      : null;
    let previousResolvedRecord = isPlainObject(previousResolved) ? canonicalizeRecord(previousResolved) : null;

    const versionsToPersist = normalized.versions
      .filter(version => !storedVersionMap.has(version.v))
      .sort((left, right) => left.v - right.v);

    for (const version of versionsToPersist) {
      const snapshot = getResolvedVersionSnapshot(normalized, version.v);
      const rawResolvedData = snapshot?.data ?? getVersionData(normalized, version.v) ?? version.data;
      const resolvedData = normalizeResolvedVersionData(normalized.type, scope, rawResolvedData);
      const metadata = snapshot?.metadata ?? extractPresetVersionMetadata(version);

      const childSpecs = getPresetChildSpecs(normalized.type, scope);
      const childRefData: Record<string, Record<string, unknown>> = {};
      const refsToInsert: Array<{
        slot: string;
        target: PresetV2Row;
        childData: Record<string, unknown>;
      }> = [];

      for (const childSpec of childSpecs) {
        const childData = childSpec.extract(resolvedData as unknown as never);
        if (!Object.keys(childData).length) continue;

        const childHash = await hashCanonicalJson(childData);
        const target = await this.findMatchingPresetV2(childSpec.type, childSpec.scope, childHash, presetRow.id);
        if (!target) continue;

        childRefData[childSpec.slot] = childData;
        refsToInsert.push({
          slot: childSpec.slot,
          target,
          childData,
        });
      }

      const overrideData = stripReferencedChildData(resolvedData, childRefData);
      const patch = previousResolvedRecord ? computeRecordPatch(previousResolvedRecord, resolvedData) : null;
      const patchBytes = patch ? stableStringifyCanonical(patch).length : 0;
      const snapshotBytes = stableStringifyCanonical(resolvedData).length;
      const forceCheckpoint =
        version.v === 1
        || version.v % VERSION_CHECKPOINT_INTERVAL === 0
        || !patch
        || patchBytes >= snapshotBytes * PATCH_TO_SNAPSHOT_RATIO;
      const storageMode = version.v === 1
        ? 'snapshot'
        : (forceCheckpoint ? 'checkpoint' : 'patch');

      const [overrideHash, metadataHash, patchHash, resolvedHash] = await Promise.all([
        this.ensurePayloadV2('override', overrideData),
        metadata ? this.ensurePayloadV2('metadata', metadata) : Promise.resolve(null),
        storageMode === 'patch' && patch ? this.ensurePayloadV2('patch', patch) : Promise.resolve(null),
        this.ensurePayloadV2('resolved', resolvedData),
      ]);

      const { data: insertedVersion, error: insertVersionError } = await this.client
        .from('preset_versions_v2')
        .insert({
          preset_id: presetRow.id,
          version_no: version.v,
          created_by: this.userId,
          parent_version_id: previousStoredVersionRow?.id ?? null,
          storage_mode: storageMode,
          note: version.note ?? '',
          override_hash: overrideHash,
          metadata_hash: metadataHash,
          patch_from_prev_hash: storageMode === 'patch' ? patchHash : null,
          resolved_hash: resolvedHash,
          is_checkpoint: storageMode !== 'patch',
          created_at: this.getVersionTimestamp(version),
        })
        .select('*')
        .single();

      if (insertVersionError) {
        if (this.markV2UnavailableIfMissing(insertVersionError)) {
          await this.saveLegacy(normalized);
          return;
        }
        throw new Error(`V2 version insert failed: ${insertVersionError.message}`);
      }

      const versionRow = insertedVersion as PresetVersionV2Row;
      previousStoredVersionRow = versionRow;
      previousResolvedRecord = resolvedData;

      if (refsToInsert.length > 0) {
        const refRows = refsToInsert.map((refInfo) => ({
          version_id: versionRow.id,
          ref_slot: refInfo.slot,
          target_preset_id: refInfo.target.id,
          target_version_no: refInfo.target.latest_version_no,
          follow_latest: false,
          override_hash: null,
          created_at: this.getVersionTimestamp(version),
        }));

        const { error: refInsertError } = await this.client
          .from('preset_version_refs_v2')
          .insert(refRows);

        if (refInsertError && !this.markV2UnavailableIfMissing(refInsertError)) {
          throw new Error(`V2 ref insert failed: ${refInsertError.message}`);
        }
      }
    }
  }

  async save(entry: PresetEntry): Promise<void> {
    if (await this.supportsV2()) {
      await this.saveV2(entry);
      return;
    }
    await this.saveLegacy(entry);
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    if (await this.supportsV2()) {
      const v2Entry = await this.loadV2(type, name, scope, version);
      if (v2Entry) return v2Entry;
    }

    return this.loadLegacy(type, name, scope, version);
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const summaries: PresetSummary[] = [];

    if (await this.supportsV2()) {
      summaries.push(...await this.listV2(type, scope));
    }

    const legacySummaries = await this.listLegacy(type, scope);
    const byKey = new Map<string, PresetSummary>();

    for (const summary of [...summaries, ...legacySummaries]) {
      const key = `${summary.type}:${summary.scope ?? ''}:${normalizeNameKey(summary.name)}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, summary);
        continue;
      }
      const existingIsV2 = Boolean(existing.remoteId);
      const summaryIsV2 = Boolean(summary.remoteId);
      if (summaryIsV2 && !existingIsV2) {
        byKey.set(key, summary);
        continue;
      }
      if ((summary.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        byKey.set(key, summary);
      }
    }

    return [...byKey.values()];
  }

  async delete(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (await this.supportsV2()) {
      await this.deleteV2(type, name, scope);
      return;
    }
    await this.deleteLegacy(type, name, scope);
  }

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    if (await this.supportsV2()) {
      if (await this.existsV2(type, name, scope)) return true;
    }
    return this.existsLegacy(type, name, scope);
  }

  async findReferences(type: PresetLevel, name: string): Promise<string[]> {
    if (!(await this.supportsV2())) {
      return [];
    }

    const rows = await this.queryPresetRowsV2(type, name);
    const targetIds = rows.map(row => row.id);
    if (!targetIds.length) return [];

    const { data: refData, error: refError } = await this.client
      .from('preset_version_refs_v2')
      .select('version_id,target_preset_id')
      .in('target_preset_id', targetIds);

    if (refError) {
      if (this.markV2UnavailableIfMissing(refError)) return [];
      console.error('SupabasePresetStore.findReferences error:', refError);
      return [];
    }

    const versionIds = [...new Set((refData ?? []).map((row) => row.version_id as string))];
    if (!versionIds.length) return [];

    const { data: versionRows, error: versionError } = await this.client
      .from('preset_versions_v2')
      .select('id,preset_id')
      .in('id', versionIds);

    if (versionError) {
      if (this.markV2UnavailableIfMissing(versionError)) return [];
      console.error('SupabasePresetStore.findReferences version lookup error:', versionError);
      return [];
    }

    const presetIds = [...new Set((versionRows ?? []).map((row) => row.preset_id as string))];
    if (!presetIds.length) return [];

    const { data: presetRows, error: presetError } = await this.client
      .from('presets_v2')
      .select('id,name')
      .in('id', presetIds);

    if (presetError) {
      if (this.markV2UnavailableIfMissing(presetError)) return [];
      console.error('SupabasePresetStore.findReferences preset lookup error:', presetError);
      return [];
    }

    return [...new Set((presetRows ?? []).map((row) => row.name as string))];
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    if (await this.supportsV2()) {
      const [{ count }, { data }] = await Promise.all([
        this.client
          .from('presets_v2')
          .select('*', { count: 'exact', head: true }),
        this.client
          .from('preset_payloads_v2')
          .select('payload_bytes'),
      ]);

      const bytes = ((data ?? []) as Array<{ payload_bytes?: number }>).reduce(
        (sum, row) => sum + (row.payload_bytes ?? 0),
        0,
      );
      return {
        bytes,
        count: count ?? 0,
      };
    }

    if (!this.userId) return { bytes: 0, count: 0 };

    const { count, error } = await this.client
      .from('presets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId);

    if (error) return { bytes: 0, count: 0 };
    return { bytes: 0, count: count ?? 0 };
  }

  async exportAll(): Promise<Blob> {
    const entries: PresetEntry[] = [];

    if (await this.supportsV2()) {
      const { data, error } = await this.client
        .from('presets_v2')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error) {
        for (const row of (data ?? []) as PresetV2Row[]) {
          const entry = await this.loadV2ByRow(row);
          if (entry) entries.push(entry);
        }
      }
    }

    let legacyQuery = this.client
      .from('presets')
      .select('*');
    if (this.userId) legacyQuery = legacyQuery.eq('user_id', this.userId);
    const { data: legacyRows } = await legacyQuery;
    if (legacyRows) {
      for (const row of legacyRows as PresetRow[]) {
        entries.push(legacyRowToEntry(row));
      }
    }

    const mergedEntries = mergeEntriesByLogicalKey(entries);
    const payload = {
      kesshoBackup: true,
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      count: mergedEntries.length,
      entries: mergedEntries,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  async importAll(json: string): Promise<number> {
    const parsed = JSON.parse(json);
    if (!parsed.kesshoBackup || !Array.isArray(parsed.entries)) {
      throw new Error('Invalid backup format');
    }

    let count = 0;
    for (const entry of parsed.entries) {
      const normalized = normalizePresetEntry(entry);
      if (!normalized) continue;
      await this.save(normalized);
      count += 1;
    }
    return count;
  }
}
