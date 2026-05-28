// src/presets/SupabasePresetStore.ts
// Cloud preset store backed by Supabase.
// Reads the V2 normalized schema when available, falls back to the legacy
// inline-json table during cutover, and keeps the existing IPresetStore API.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { compressVersions, getVersionData } from './codec';
import {
  buildDrumEuclideanStateFromPatternData,
  buildSynthEuclideanStateFromPatternData,
} from './euclideanPatternBank';
import type { IPresetStore } from './PresetStore';
import {
  extractPresetVersionMetadata,
  getPresetScope,
  normalizePresetEntry,
  normalizePresetSummary,
} from './presetUtils';
import { normalizeJourneyPresetPreview } from './journeyPresetPreview';
import {
  applyRecordPatch,
  buildMissingChildFallbackData,
  canonicalizeRecord,
  computeRecordPatch,
  getPresetChildSpecs,
  getResolvedVersionSnapshot,
  hashCanonicalJson,
  materializePresetVersion,
  normalizeResolvedVersionData,
  presetVersionStorageSignaturesEqual,
  type PresetPayloadKind,
  type PresetPayloadV2Row,
  type PresetV2Row,
  type PresetVersionRefV2Row,
  type PresetVersionStorageSignature,
  type PresetVersionV2Row,
  stripReferencedChildData,
  stableStringifyCanonical,
} from './presetStorageV2';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';
import type {
  PresetEntry,
  PresetLevel,
  PresetRecoveryWarning,
  PresetRef,
  PresetSummary,
  PresetVersionMetadata,
} from './types';

const LEGACY_DELAY_A_KEY_PATTERN = /"leadDelay(?:ReverbSend|Time|Feedback|Mix|Enabled|Spread|Filter|Send)"/;
const MAX_STORED_VERSIONS_V2 = 5;
const VERSION_CHECKPOINT_INTERVAL = 8;
const PATCH_TO_SNAPSHOT_RATIO = 0.65;
const INTERNAL_DERIVED_TAG = 'internal-derived';
const AUTO_CHILD_TAG = 'auto-child';

interface V2LookupOptions {
  includeDeleted?: boolean;
  deletedOnly?: boolean;
}

interface PendingVersionRefV2 {
  slot: string;
  target: PresetV2Row;
  overrideHash?: string | null;
}

interface StorablePayloadV2 {
  hash: string;
  payloadKind: PresetPayloadKind;
  payload: Record<string, unknown>;
}

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

function isActivePresetV2Row(row: Pick<PresetV2Row, 'deleted_at'>): boolean {
  return !row.deleted_at;
}

function isInternalDerivedTags(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INTERNAL_DERIVED_TAG);
}

function isInternalDerivedRow(row: Pick<PresetV2Row, 'name' | 'tags'>): boolean {
  return row.name.startsWith('__derived__/') || isInternalDerivedTags(row.tags);
}

function isInternalDerivedEntry(entry: Pick<PresetEntry, 'name' | 'tags'>): boolean {
  return entry.name.startsWith('__derived__/') || isInternalDerivedTags(entry.tags);
}

function makeDerivedPresetName(scope: string, resolvedHash: string): string {
  return `__derived__/${scope}/${resolvedHash.slice(0, 12)}`;
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

function fixedRefVersionLabel(versionNo: number | null | undefined): string {
  return versionNo == null ? 'latest' : String(versionNo);
}

function makeStoredRefKey(ref: PresetVersionRefV2Row): string {
  const versionLabel = ref.follow_latest ? 'latest' : fixedRefVersionLabel(ref.target_version_no);
  return [
    ref.ref_slot,
    ref.target_preset_id,
    versionLabel,
    ref.override_hash ?? '',
  ].join(':');
}

function makePendingRefKey(ref: PendingVersionRefV2): string {
  return [
    ref.slot,
    ref.target.id,
    'latest',
    ref.overrideHash ?? '',
  ].join(':');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class SupabasePresetStore implements IPresetStore {
  private client: SupabaseClient;
  private userId: string | null = null;
  private isAnonymous = false;
  private v2SchemaAvailable: boolean | null = null;
  private knownPayloadHashesV2 = new Set<string>();

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
    if (!PRESET_DELETE_ENABLED) {
      console.warn('Shared preset delete is disabled in testing mode:', type, scope ?? '', name);
      return;
    }

    const { data, error } = await this.client.rpc('kessho_soft_delete_legacy_preset', {
      target_type: type,
      target_name: name,
      target_scope: scope ?? null,
    });

    if (error) {
      throw new Error(`Legacy cloud preset delete failed: ${error.message}`);
    }

    if (data === false) {
      throw new Error(`Legacy cloud preset delete failed: "${name}" is not deletable or is already archived.`);
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

  private async queryPresetRowsV2(
    type: PresetLevel,
    name: string,
    scope?: string,
    options: V2LookupOptions = {},
  ): Promise<PresetV2Row[]> {
    let query = this.client
      .from('presets_v2')
      .select('*')
      .eq('type', type)
      .eq('name_key', normalizeNameKey(name));

    if (scope) query = query.eq('scope', scope);
    else query = query.is('scope', null);
    if (options.deletedOnly) query = query.not('deleted_at', 'is', null);
    else if (!options.includeDeleted) query = query.is('deleted_at', null);

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      throw new Error(`V2 preset lookup failed: ${error.message}`);
    }

    return dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId);
  }

  private async queryPresetRowsByNameV2(
    type: PresetLevel,
    name: string,
    options: V2LookupOptions = {},
  ): Promise<PresetV2Row[]> {
    let query = this.client
      .from('presets_v2')
      .select('*')
      .eq('type', type)
      .eq('name_key', normalizeNameKey(name));

    if (options.deletedOnly) query = query.not('deleted_at', 'is', null);
    else if (!options.includeDeleted) query = query.is('deleted_at', null);

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      throw new Error(`V2 preset lookup failed: ${error.message}`);
    }

    return dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId);
  }

  private async findPresetRowByIdV2(id: string): Promise<PresetV2Row | null> {
    if (!isUuid(id)) return null;

    const { data, error } = await this.client
      .from('presets_v2')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .limit(1);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return null;
      throw new Error(`V2 preset id lookup failed: ${error.message}`);
    }

    return ((data ?? []) as PresetV2Row[])[0] ?? null;
  }

  private getExplicitRefTargetType(parentType: PresetLevel): PresetLevel | null {
    if (parentType === 'journey') return 'state';
    return null;
  }

  private async resolveExplicitVersionRefsV2(
    parentType: PresetLevel,
    refs: Record<string, PresetRef> | undefined,
    excludePresetId?: string | null,
  ): Promise<PendingVersionRefV2[]> {
    const targetType = this.getExplicitRefTargetType(parentType);
    if (!targetType || !refs) return [];

    const resolvedRefs: PendingVersionRefV2[] = [];
    for (const [slot, ref] of Object.entries(refs).sort(([left], [right]) => left.localeCompare(right))) {
      let target: PresetV2Row | null = ref.id ? await this.findPresetRowByIdV2(ref.id) : null;
      if (target?.type !== targetType) target = null;
      if (excludePresetId && target?.id === excludePresetId) target = null;

      if (!target) {
        const targetScope = ref.scope ?? (targetType === 'state' ? 'global' : undefined);
        const targetRows = await this.queryPresetRowsV2(targetType, ref.name, targetScope);
        target = targetRows.find(row => row.id !== excludePresetId) ?? null;
        if (!target && targetScope) {
          const fallbackRows = await this.queryPresetRowsV2(targetType, ref.name);
          target = fallbackRows.find(row => row.id !== excludePresetId) ?? null;
        }
      }

      if (!target) {
        throw new Error(`V2 preset save failed: unresolved ${parentType} ref "${slot}" -> "${ref.name}". Preset refs must resolve before save.`);
      }

      resolvedRefs.push({
        slot,
        target,
        overrideHash: null,
      });
    }

    return resolvedRefs;
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
      .is('deleted_at', null)
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

    const rows = dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId)
      .sort((left, right) => {
        const leftDerived = isInternalDerivedRow(left);
        const rightDerived = isInternalDerivedRow(right);
        if (leftDerived !== rightDerived) return leftDerived ? 1 : -1;
        return comparePresetV2Priority(left, right, SHARED_PRESET_TEST_MODE ? null : this.userId);
      });
    return rows[0] ?? null;
  }

  private async ensureDerivedChildPresetV2(
    type: PresetLevel,
    scope: string,
    resolvedHash: string,
    data: Record<string, unknown>,
  ): Promise<PresetV2Row | null> {
    const existing = await this.findMatchingPresetV2(type, scope, resolvedHash);
    if (existing) {
      if (isInternalDerivedRow(existing) && !(await this.isPresetGraphCompleteV2(existing, data))) {
        return this.rewriteDerivedChildPresetV2(existing, data);
      }
      return existing;
    }

    const now = Date.now();
    const hashName = resolvedHash.slice(0, 12);
    const name = makeDerivedPresetName(scope, resolvedHash);
    const derivedEntry: PresetEntry = {
      type,
      scope,
      name,
      author: 'cloud',
      library: 'cloud',
      creator: 'Kessho Auto Child',
      description: `Hidden derived child preset for ${scope}. Reused by content hash.`,
      visibility: 'private',
      familyName: `__derived__/${scope}`,
      variantName: hashName,
      tags: [
        INTERNAL_DERIVED_TAG,
        AUTO_CHILD_TAG,
        `scope:${scope}`,
        `hash:${hashName}`,
      ],
      versions: [{
        v: 1,
        note: 'Auto-derived child preset',
        timestamp: now,
        data,
      }],
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.saveV2(derivedEntry);
    } catch (error) {
      if (!isConflictError(error)) throw error;
    }

    return this.findMatchingPresetV2(type, scope, resolvedHash);
  }

  private async getLatestRefTargetsV2(row: PresetV2Row): Promise<Map<string, PresetV2Row>> {
    if (!row.latest_version_id) return new Map();

    const { data: refData, error: refError } = await this.client
      .from('preset_version_refs_v2')
      .select('ref_slot,target_preset_id')
      .eq('version_id', row.latest_version_id);

    if (refError) {
      if (this.markV2UnavailableIfMissing(refError)) return new Map();
      throw new Error(`V2 graph ref lookup failed: ${refError.message}`);
    }

    const refRows = (refData ?? []) as Array<{ ref_slot: string; target_preset_id: string }>;
    if (!refRows.length) return new Map();

    const targetIds = [...new Set(refRows.map(ref => ref.target_preset_id))];
    const { data: targetData, error: targetError } = await this.client
      .from('presets_v2')
      .select('*')
      .in('id', targetIds);

    if (targetError) {
      if (this.markV2UnavailableIfMissing(targetError)) return new Map();
      throw new Error(`V2 graph target lookup failed: ${targetError.message}`);
    }

    const targetsById = new Map((targetData ?? []).map(candidate => [candidate.id, candidate as PresetV2Row]));
    const targetsBySlot = new Map<string, PresetV2Row>();
    for (const ref of refRows) {
      const target = targetsById.get(ref.target_preset_id);
      if (target) targetsBySlot.set(ref.ref_slot, target);
    }
    return targetsBySlot;
  }

  private async isPresetGraphCompleteV2(
    row: PresetV2Row,
    data: Record<string, unknown>,
    depth = 0,
  ): Promise<boolean> {
    if (depth > 4) return true;

    const specs = getPresetChildSpecs(row.type, row.scope ?? undefined);
    const expectedSpecs = specs.filter((spec) => Object.keys(spec.extract(data as unknown as never)).length > 0);
    if (!expectedSpecs.length) return true;

    const targetsBySlot = await this.getLatestRefTargetsV2(row);
    for (const spec of expectedSpecs) {
      const target = targetsBySlot.get(spec.slot);
      if (!target) return false;

      if (isInternalDerivedRow(target) && getPresetChildSpecs(target.type, target.scope ?? undefined).length > 0) {
        const childData = spec.extract(data as unknown as never);
        if (!(await this.isPresetGraphCompleteV2(target, childData, depth + 1))) {
          return false;
        }
      }
    }

    return true;
  }

  private async rewriteDerivedChildPresetV2(
    row: PresetV2Row,
    data: Record<string, unknown>,
  ): Promise<PresetV2Row | null> {
    const nextVersion = row.latest_version_no + 1;
    const timestamp = Date.now();
    const entry: PresetEntry = {
      id: row.id,
      type: row.type,
      scope: row.scope ?? undefined,
      name: row.name,
      author: row.author,
      library: row.library,
      creator: row.creator ?? 'Kessho Auto Child',
      description: row.description ?? `Hidden derived child preset for ${row.scope ?? row.type}. Reused by content hash.`,
      visibility: 'private',
      familyName: row.family_name ?? `__derived__/${row.scope ?? row.type}`,
      variantName: row.variant_name ?? row.latest_resolved_hash?.slice(0, 12) ?? row.name,
      variantRank: row.variant_rank ?? undefined,
      tags: row.tags ?? [INTERNAL_DERIVED_TAG, AUTO_CHILD_TAG],
      versions: [{
        v: nextVersion,
        note: 'Repair hidden derived child graph',
        timestamp,
        data,
      }],
      currentVersion: nextVersion,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: timestamp,
    };

    await this.saveV2(entry);
    return this.findMatchingPresetV2(row.type, row.scope ?? '', row.latest_resolved_hash ?? '');
  }

  private async hashStorablePayloadV2(payload: unknown): Promise<string | null> {
    if (payload === undefined || payload === null) return null;
    if (Array.isArray(payload) && payload.length === 0) return null;
    if (isPlainObject(payload) && Object.keys(payload).length === 0) return null;
    return hashCanonicalJson(canonicalizeRecord(payload as Record<string, unknown>));
  }

  private async makeStorablePayloadV2(
    kind: PresetPayloadKind,
    payload: unknown,
  ): Promise<StorablePayloadV2 | null> {
    if (payload === undefined || payload === null) return null;
    if (Array.isArray(payload) && payload.length === 0) return null;
    if (isPlainObject(payload) && Object.keys(payload).length === 0) return null;

    const normalized = canonicalizeRecord(payload as Record<string, unknown>);
    return {
      hash: await hashCanonicalJson(normalized),
      payloadKind: kind,
      payload: normalized,
    };
  }

  private async fetchVersionRefKeysV2(versionId: string | null | undefined): Promise<string[]> {
    if (!versionId) return [];

    const { data, error } = await this.client
      .from('preset_version_refs_v2')
      .select('*')
      .eq('version_id', versionId);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      throw new Error(`V2 version ref signature lookup failed: ${error.message}`);
    }

    return ((data ?? []) as PresetVersionRefV2Row[])
      .map(makeStoredRefKey)
      .sort();
  }

  private async pruneStoredVersionsV2(presetId: string): Promise<void> {
    const { data, error } = await this.client
      .from('preset_versions_v2')
      .select('id, version_no')
      .eq('preset_id', presetId)
      .order('version_no', { ascending: false });

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return;
      throw new Error(`V2 version prune lookup failed: ${error.message}`);
    }

    const staleIds = ((data ?? []) as Array<{ id: string; version_no: number }>)
      .slice(MAX_STORED_VERSIONS_V2)
      .map(row => row.id);

    if (!staleIds.length) return;

    const { error: deleteError } = await this.client
      .from('preset_versions_v2')
      .delete()
      .in('id', staleIds);

    if (deleteError && !this.markV2UnavailableIfMissing(deleteError)) {
      throw new Error(`V2 version prune failed: ${deleteError.message}`);
    }
  }

  private async savePresetVersionAtomicallyV2(
    identityPayload: Record<string, unknown>,
    versionPayload: Record<string, unknown>,
    payloads: StorablePayloadV2[],
    refsToInsert: PendingVersionRefV2[],
  ): Promise<{ preset: PresetV2Row; version: PresetVersionV2Row }> {
    const { data, error } = await this.client.rpc('kessho_save_preset_v2', {
      identity_payload: identityPayload,
      version_payload: versionPayload,
      payloads_payload: payloads.map((payload) => ({
        hash: payload.hash,
        payload_kind: payload.payloadKind,
        payload: payload.payload,
      })),
      refs_payload: refsToInsert.map((ref) => ({
        ref_slot: ref.slot,
        target_preset_id: ref.target.id,
        override_hash: ref.overrideHash ?? null,
        created_at: versionPayload.created_at,
      })),
    });

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) {
        throw error;
      }
      throw new Error(`V2 atomic save failed: ${error.message}`);
    }

    const result = data as { preset?: PresetV2Row; version?: PresetVersionV2Row } | null;
    if (!result?.preset || !result.version) {
      throw new Error('V2 atomic save failed: RPC returned no preset/version rows.');
    }

    for (const payload of payloads) {
      this.knownPayloadHashesV2.add(payload.hash);
    }

    return {
      preset: result.preset,
      version: result.version,
    };
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
    parentType: PresetLevel,
    parentScope: string | null,
    payloadMap: Map<string, unknown>,
    refsByVersionId: Map<string, PresetVersionRefV2Row[]>,
    targetPresetMap: Map<string, PresetV2Row>,
    previousResolved: Record<string, unknown> | null,
    recoveryWarnings?: PresetRecoveryWarning[],
  ): Promise<Record<string, unknown>> {
    if (row.resolved_hash) {
      const cached = payloadMap.get(row.resolved_hash);
      if (isPlainObject(cached)) return canonicalizeRecord(cached);
      recoveryWarnings?.push({
        slot: 'resolved',
        reason: cached === undefined ? 'missing_payload' : 'invalid_payload_shape',
        fallback: 'default',
        version: row.version_no,
      });
    } else {
      recoveryWarnings?.push({
        slot: 'resolved',
        reason: 'missing_payload',
        fallback: 'default',
        version: row.version_no,
      });
    }

    let mergedFromRefs: Record<string, unknown> = {};
    let recoveryFallbackData: Record<string, unknown> = {};
    const mergeableRefSlots = new Set(
      getPresetChildSpecs(parentType, parentScope ?? undefined).map(spec => spec.slot),
    );
    const refRows = refsByVersionId.get(row.id) ?? [];
    for (const refRow of refRows) {
      if (!mergeableRefSlots.has(refRow.ref_slot)) continue;
      const targetPreset = targetPresetMap.get(refRow.target_preset_id);
      if (!targetPreset) {
        recoveryWarnings?.push({
          slot: refRow.ref_slot,
          reason: 'missing_child_preset',
          fallback: parentType === 'state' || parentType === 'source' ? 'off' : 'empty',
          version: row.version_no,
        });
        recoveryFallbackData = canonicalizeRecord({
          ...recoveryFallbackData,
          ...buildMissingChildFallbackData(parentType, parentScope ?? undefined, refRow.ref_slot),
        });
        continue;
      }
      if (!targetPreset.latest_resolved_hash) {
        recoveryWarnings?.push({
          slot: refRow.ref_slot,
          reason: 'missing_payload',
          fallback: parentType === 'state' || parentType === 'source' ? 'off' : 'empty',
          version: row.version_no,
        });
        recoveryFallbackData = canonicalizeRecord({
          ...recoveryFallbackData,
          ...buildMissingChildFallbackData(parentType, parentScope ?? undefined, refRow.ref_slot),
        });
        continue;
      }
      const childData = payloadMap.get(targetPreset.latest_resolved_hash);
      if (!isPlainObject(childData)) {
        recoveryWarnings?.push({
          slot: refRow.ref_slot,
          reason: childData === undefined ? 'missing_payload' : 'invalid_payload_shape',
          fallback: parentType === 'state' || parentType === 'source' ? 'off' : 'empty',
          version: row.version_no,
        });
        recoveryFallbackData = canonicalizeRecord({
          ...recoveryFallbackData,
          ...buildMissingChildFallbackData(parentType, parentScope ?? undefined, refRow.ref_slot),
        });
        continue;
      }
      let mergedChild = canonicalizeRecord(childData);
      if (targetPreset.scope === 'euclideanPattern' && refRow.ref_slot === 'euclideanPattern') {
        if (parentType === 'source' && parentScope === 'synth') {
          mergedChild = canonicalizeRecord(buildSynthEuclideanStateFromPatternData(mergedChild));
        } else if (parentType === 'source' && parentScope === 'drums') {
          mergedChild = canonicalizeRecord(buildDrumEuclideanStateFromPatternData(mergedChild));
        }
      }
      if (refRow.override_hash) {
        const childOverride = payloadMap.get(refRow.override_hash);
        if (isPlainObject(childOverride)) {
          mergedChild = canonicalizeRecord({ ...mergedChild, ...childOverride });
        } else {
          recoveryWarnings?.push({
            slot: refRow.ref_slot,
            reason: childOverride === undefined ? 'missing_payload' : 'invalid_payload_shape',
            fallback: parentType === 'state' || parentType === 'source' ? 'off' : 'empty',
            version: row.version_no,
          });
        }
      }
      mergedFromRefs = canonicalizeRecord({ ...mergedFromRefs, ...mergedChild });
    }

    const overridePayload = row.override_hash ? payloadMap.get(row.override_hash) : null;
    const override = isPlainObject(overridePayload) ? canonicalizeRecord(overridePayload) : {};

    if (row.storage_mode === 'patch' && row.patch_from_prev_hash && previousResolved) {
      const patchPayload = payloadMap.get(row.patch_from_prev_hash);
      const patched = applyRecordPatch(previousResolved, isPlainObject(patchPayload) ? patchPayload as never : null);
      return canonicalizeRecord({ ...mergedFromRefs, ...patched, ...override, ...recoveryFallbackData });
    }

    return canonicalizeRecord({ ...mergedFromRefs, ...override, ...recoveryFallbackData });
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
    const targetVersionNo = version ?? row.latest_version_no;
    const recoveryWarnings: PresetRecoveryWarning[] = [];
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
        row.type,
        row.scope,
        payloadMap,
        refsByVersionId,
        targetPresetMap,
        previousResolved,
        versionRow.version_no === targetVersionNo ? recoveryWarnings : undefined,
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

    if (entry && recoveryWarnings.length > 0) {
      entry.recoveryWarnings = recoveryWarnings;
    }

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
    query = query.is('deleted_at', null);

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(300);

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      console.error('SupabasePresetStore.listV2 error:', error);
      return [];
    }

    const rows = dedupePreferredV2Rows((data ?? []) as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId)
      .filter(isActivePresetV2Row)
      .filter(row => !isInternalDerivedRow(row));
    const metadataHashes = type === 'journey'
      ? [...new Set(rows.map(row => row.latest_metadata_hash).filter((hash): hash is string => Boolean(hash)))]
      : [];
    const metadataMap = type === 'journey'
      ? await this.fetchPayloadMapV2(metadataHashes)
      : new Map<string, unknown>();
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
      journeyPreview: type === 'journey' && row.latest_metadata_hash
        ? normalizeJourneyPresetPreview(
          isPlainObject(metadataMap.get(row.latest_metadata_hash))
            ? (metadataMap.get(row.latest_metadata_hash) as Record<string, unknown>).journeyPreview
            : undefined,
        )
        : undefined,
      tags: row.tags ?? [],
      versionCount: row.latest_version_no,
      currentVersion: row.latest_version_no,
      updatedAt: new Date(row.updated_at).getTime(),
    }));

    return summaries
      .map(summary => {
        const placeholderVersions: PresetEntry['versions'] = Array.from({ length: summary.versionCount }, (_, index) => ({
          v: index + 1,
          note: '',
          timestamp: summary.updatedAt,
          data: {},
        }));
        if (summary.journeyPreview && placeholderVersions.length > 0) {
          placeholderVersions[placeholderVersions.length - 1]!.journeyPreview = summary.journeyPreview;
        }

        return normalizePresetSummary({
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
          versions: placeholderVersions,
          currentVersion: summary.currentVersion,
          createdAt: summary.updatedAt,
          updatedAt: summary.updatedAt,
        })!;
      })
      .filter(Boolean) as PresetSummary[];
  }

  private async deleteV2(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (!PRESET_DELETE_ENABLED) {
      console.warn('Shared preset delete is disabled in testing mode:', type, scope ?? '', name);
      return;
    }

    const rows = await this.queryPresetRowsV2(type, name, scope);
    const target = rows[0];
    if (!target) return;

    const { data, error } = await this.client.rpc('kessho_soft_delete_preset_v2', {
      target_preset_id: target.id,
    });

    if (error && !this.markV2UnavailableIfMissing(error)) {
      throw new Error(`Cloud preset delete failed: ${error.message}`);
    }

    if (data === false) {
      throw new Error(`Cloud preset delete failed: "${name}" is not deletable or is already recycled.`);
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
    const internalDerived = isInternalDerivedEntry(normalized);
    const identityPayload = {
      owner_key: this.getOwnerKey(),
      owner_user_id: this.userId,
      type: normalized.type,
      scope: scope ?? null,
      name: normalized.name,
      author: normalized.author || 'user',
      library: SHARED_PRESET_TEST_MODE && normalized.library !== 'stock'
        ? 'cloud'
        : normalized.library || 'cloud',
      creator: normalized.creator ?? 'Anonymous',
      description: normalized.description ?? null,
      tags: normalized.tags ?? [],
      visibility: internalDerived
        ? 'private'
        : SHARED_PRESET_TEST_MODE
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

    let storedVersionRows: PresetVersionV2Row[] = [];
    if (presetRow) {
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

      storedVersionRows = (storedVersionData ?? []) as PresetVersionV2Row[];
    }
    const storedVersionMap = new Map(storedVersionRows.map(candidate => [candidate.version_no, candidate]));
    let previousStoredVersionRow = storedVersionRows[storedVersionRows.length - 1] ?? null;

    let previousResolved = previousStoredVersionRow?.resolved_hash
      ? (await this.fetchPayloadMapV2([previousStoredVersionRow.resolved_hash])).get(previousStoredVersionRow.resolved_hash)
      : null;
    let previousResolvedRecord = isPlainObject(previousResolved) ? canonicalizeRecord(previousResolved) : null;
    let previousRefKeys = await this.fetchVersionRefKeysV2(previousStoredVersionRow?.id);

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
      const refsToInsert: PendingVersionRefV2[] = [];

      for (const childSpec of childSpecs) {
        const childData = childSpec.extract(resolvedData as unknown as never, metadata);
        if (!Object.keys(childData).length) continue;

        const childHash = await hashCanonicalJson(childData);
        let target = await this.findMatchingPresetV2(childSpec.type, childSpec.scope, childHash, presetRow?.id);
        if (target && isInternalDerivedRow(target) && !(await this.isPresetGraphCompleteV2(target, childData))) {
          target = await this.rewriteDerivedChildPresetV2(target, childData);
        }
        if (!target) {
          target = await this.ensureDerivedChildPresetV2(childSpec.type, childSpec.scope, childHash, childData);
        }
        if (!target) continue;

        childRefData[childSpec.slot] = childSpec.strip
          ? childSpec.strip(resolvedData as unknown as never)
          : childData;
        refsToInsert.push({
          slot: childSpec.slot,
          target,
          overrideHash: null,
        });
      }

      const existingRefSlots = new Set(refsToInsert.map(ref => ref.slot));
      for (const explicitRef of await this.resolveExplicitVersionRefsV2(normalized.type, version.refs, presetRow?.id)) {
        if (existingRefSlots.has(explicitRef.slot)) continue;
        refsToInsert.push(explicitRef);
        existingRefSlots.add(explicitRef.slot);
      }

      const overrideData = stripReferencedChildData(resolvedData, childRefData);
      const pendingRefKeys = refsToInsert.map(makePendingRefKey).sort();
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

      const [nextOverrideHash, nextMetadataHash, nextResolvedHash] = await Promise.all([
        this.hashStorablePayloadV2(overrideData),
        metadata ? this.hashStorablePayloadV2(metadata) : Promise.resolve(null),
        this.hashStorablePayloadV2(resolvedData),
      ]);

      const previousSignature: PresetVersionStorageSignature | null = previousStoredVersionRow
        ? {
            resolvedHash: previousStoredVersionRow.resolved_hash,
            overrideHash: previousStoredVersionRow.override_hash,
            metadataHash: previousStoredVersionRow.metadata_hash,
            refKeys: previousRefKeys,
          }
        : null;
      const nextSignature: PresetVersionStorageSignature = {
        resolvedHash: nextResolvedHash,
        overrideHash: nextOverrideHash,
        metadataHash: nextMetadataHash,
        refKeys: pendingRefKeys,
      };

      if (presetVersionStorageSignaturesEqual(previousSignature, nextSignature)) {
        previousResolvedRecord = resolvedData;
        continue;
      }

      const [overridePayload, metadataPayload, patchPayload, resolvedPayload] = await Promise.all([
        this.makeStorablePayloadV2('override', overrideData),
        metadata ? this.makeStorablePayloadV2('metadata', metadata) : Promise.resolve(null),
        storageMode === 'patch' && patch ? this.makeStorablePayloadV2('patch', patch) : Promise.resolve(null),
        this.makeStorablePayloadV2('resolved', resolvedData),
      ]);

      const { preset, version: versionRow } = await this.savePresetVersionAtomicallyV2(
        {
          ...identityPayload,
          id: presetRow?.id ?? null,
        },
        {
          version_no: version.v,
          created_by: this.userId,
          parent_version_id: previousStoredVersionRow?.id ?? null,
          storage_mode: storageMode,
          note: version.note ?? '',
          override_hash: overridePayload?.hash ?? null,
          metadata_hash: metadataPayload?.hash ?? null,
          patch_from_prev_hash: storageMode === 'patch' ? patchPayload?.hash ?? null : null,
          resolved_hash: resolvedPayload?.hash ?? null,
          is_checkpoint: storageMode !== 'patch',
          created_at: this.getVersionTimestamp(version),
        },
        [overridePayload, metadataPayload, patchPayload, resolvedPayload]
          .filter((payload): payload is StorablePayloadV2 => Boolean(payload)),
        refsToInsert,
      );
      presetRow = preset;
      previousStoredVersionRow = versionRow;
      previousResolvedRecord = resolvedData;
      previousRefKeys = pendingRefKeys;
    }

    if (presetRow) {
      await this.pruneStoredVersionsV2(presetRow.id);
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
      if (SHARED_PRESET_TEST_MODE) return null;
    }

    return this.loadLegacy(type, name, scope, version);
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const summaries: PresetSummary[] = [];

    if (await this.supportsV2()) {
      summaries.push(...await this.listV2(type, scope));
      if (SHARED_PRESET_TEST_MODE) return summaries;
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
      if (SHARED_PRESET_TEST_MODE) return false;
    }
    return this.existsLegacy(type, name, scope);
  }

  async findReferences(type: PresetLevel, name: string): Promise<string[]> {
    if (!(await this.supportsV2())) {
      return [];
    }

    const rows = await this.queryPresetRowsByNameV2(type, name);
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
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null),
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

    const v2Supported = await this.supportsV2();
    if (v2Supported) {
      const { data, error } = await this.client
        .from('presets_v2')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (!error) {
        for (const row of (data ?? []) as PresetV2Row[]) {
          const entry = await this.loadV2ByRow(row);
          if (entry) entries.push(entry);
        }
      }
    }

    if (v2Supported && SHARED_PRESET_TEST_MODE) {
      const payload = {
        kesshoBackup: true,
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        count: entries.length,
        entries,
      };
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
