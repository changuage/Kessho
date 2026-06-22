// src/presets/SupabasePresetStore.ts
// Cloud preset store backed by Supabase.
// Reads the V2 normalized schema when available, falls back to the legacy
// inline-json table during cutover, and keeps the existing IPresetStore API.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isSupabaseEgressListRefreshPaused,
  isSupabaseEgressQuotaCircuitOpen,
} from '../cloud/supabaseEgressDiagnostics';
import {
  LEGACY_PRESET_SUMMARY_SELECT,
  PRESET_V2_SUMMARY_SELECT,
} from '../cloud/presetSelects';
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
import {
  canonicalizePresetScope,
  getPresetScopeReadCandidates,
} from './presetScopeAliases';
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
  PresetRenameIdentity,
  PresetRecoveryWarning,
  PresetRef,
  PresetSummary,
  PresetVersionMetadata,
} from './types';

const VERSION_CHECKPOINT_INTERVAL = 8;
const PATCH_TO_SNAPSHOT_RATIO = 0.65;
const INTERNAL_DERIVED_TAG = 'internal-derived';
const AUTO_CHILD_TAG = 'auto-child';
const PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000;
const PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000;
const PRESET_LIST_SESSION_CACHE_PREFIX = 'kessho:supabasePresetList:v1:';
const PRESET_LIST_ERROR_CIRCUIT_MS = 120_000;

interface V2LookupOptions {
  includeDeleted?: boolean;
  deletedOnly?: boolean;
  scopeAliases?: boolean;
}

interface V2HashLookupOptions {
  internalDerivedOnly?: boolean;
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

interface CachedPresetList {
  expiresAt: number;
  summaries: PresetSummary[];
}

interface PresetV2DetailBundle {
  preset: PresetV2Row;
  versions: PresetVersionV2Row[];
  refs: PresetVersionRefV2Row[];
  targetPresets: PresetV2Row[];
  payloads: PresetPayloadV2Row[];
}

interface PresetV2RefTargetResult {
  ref_slot: string;
  target: PresetV2Row;
}

interface PresetStorageStats {
  bytes: number;
  count: number;
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

interface LegacyPresetSummaryRow {
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
  plays: number | null;
  current_version: number;
  created_at: string;
  updated_at: string;
  rating: number | null;
}

type PresetV2ComparableRow = Pick<
  PresetV2Row,
  'type' | 'scope' | 'name' | 'owner_user_id' | 'visibility' | 'latest_version_no' | 'created_at' | 'updated_at'
>;

type PresetV2SummaryRow = Pick<
  PresetV2Row,
  | 'id'
  | 'owner_user_id'
  | 'type'
  | 'scope'
  | 'name'
  | 'author'
  | 'library'
  | 'creator'
  | 'description'
  | 'tags'
  | 'visibility'
  | 'family_name'
  | 'variant_name'
  | 'variant_rank'
  | 'latest_version_no'
  | 'latest_metadata_hash'
  | 'play_count'
  | 'rating'
  | 'deleted_at'
  | 'created_at'
  | 'updated_at'
>;

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

type LegacyComparableRow = Pick<PresetRow, 'type' | 'scope' | 'name' | 'user_id' | 'visibility' | 'created_at' | 'updated_at'> & {
  current_version?: number;
  versions?: unknown;
};

function getLegacyLogicalKey(row: Pick<PresetRow, 'type' | 'scope' | 'name'>): string {
  return `${row.type}:${canonicalizePresetScope(row.scope) ?? ''}:${normalizeNameKey(row.name)}`;
}

function getLegacyVersionCount(row: Pick<LegacyComparableRow, 'current_version' | 'versions'>): number {
  if (Array.isArray(row.versions)) return row.versions.length;
  return Math.max(row.current_version ?? 0, 0);
}

function compareLegacyPresetRowPriority<T extends LegacyComparableRow>(left: T, right: T, userId: string | null): number {
  const leftVersionCount = getLegacyVersionCount(left);
  const rightVersionCount = getLegacyVersionCount(right);

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

function dedupePreferredLegacyRows<T extends LegacyComparableRow>(rows: T[], userId: string | null): T[] {
  const preferred = new Map<string, T>();
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
    scope: canonicalizePresetScope(row.scope),
    engine: row.type === 'engine' ? canonicalizePresetScope(row.scope) : undefined,
    source: row.type !== 'engine' ? canonicalizePresetScope(row.scope) : undefined,
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

function legacySummaryRowToSummary(row: LegacyPresetSummaryRow): PresetSummary {
  const type = row.type as PresetLevel;
  const scope = canonicalizePresetScope(row.scope);
  const familyName = row.family_name ?? row.name;
  const variantName = row.variant_name ?? row.name;
  const versionCount = Math.max(row.current_version ?? 1, 1);
  const visibility = (row.visibility ?? 'private') as PresetSummary['visibility'];
  return {
    id: row.id,
    type,
    scope,
    engine: type === 'engine' ? scope : undefined,
    source: type !== 'engine' ? scope : undefined,
    name: row.name,
    author: row.author as PresetSummary['author'],
    library: row.library as PresetSummary['library'],
    creator: row.creator ?? undefined,
    description: row.description ?? undefined,
    visibility,
    familyId: `${type}:${scope ?? 'global'}:${normalizeNameKey(familyName)}`,
    familyName,
    variantId: `${type}:${scope ?? 'global'}:${normalizeNameKey(familyName)}:${normalizeNameKey(variantName)}`,
    variantName,
    variantRank: row.variant_rank ?? undefined,
    remoteId: row.id,
    playCount: row.plays ?? undefined,
    featured: visibility === 'featured',
    rating: row.rating ?? undefined,
    tags: row.tags ?? [],
    versionCount,
    currentVersion: versionCount,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function clonePresetSummaries(summaries: PresetSummary[]): PresetSummary[] {
  return summaries.map(summary => ({
    ...summary,
    tags: summary.tags ? [...summary.tags] : summary.tags,
  }));
}

function canUsePresetListSessionCache(): boolean {
  return typeof sessionStorage !== 'undefined';
}

function isPresetListSessionCacheable(key: string): boolean {
  return key.startsWith('public:') || key.startsWith('anonymous:');
}

function readPresetListSessionCache(key: string, now: number): CachedPresetList | null {
  if (!isPresetListSessionCacheable(key) || !canUsePresetListSessionCache()) return null;
  const storageKey = `${PRESET_LIST_SESSION_CACHE_PREFIX}${key}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPresetList> | null;
    if (!parsed || typeof parsed.expiresAt !== 'number' || !Array.isArray(parsed.summaries)) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    if (parsed.expiresAt <= now) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    return {
      expiresAt: parsed.expiresAt,
      summaries: clonePresetSummaries(parsed.summaries as PresetSummary[]),
    };
  } catch {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

function writePresetListSessionCache(key: string, summaries: PresetSummary[]): void {
  if (!isPresetListSessionCacheable(key) || !canUsePresetListSessionCache()) return;
  try {
    sessionStorage.setItem(
      `${PRESET_LIST_SESSION_CACHE_PREFIX}${key}`,
      JSON.stringify({
        expiresAt: Date.now() + PRESET_LIST_SESSION_CACHE_TTL_MS,
        summaries: clonePresetSummaries(summaries),
      }),
    );
  } catch {
    // Storage quota or privacy mode failures should not break cloud reads.
  }
}

function clearPresetListSessionCache(): void {
  if (!canUsePresetListSessionCache()) return;
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PRESET_LIST_SESSION_CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage cleanup is best-effort.
  }
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

function getV2LogicalKey(row: Pick<PresetV2ComparableRow, 'type' | 'scope' | 'name'>): string {
  return `${row.type}:${canonicalizePresetScope(row.scope) ?? ''}:${normalizeNameKey(row.name)}`;
}

function comparePresetV2Priority<T extends PresetV2ComparableRow>(left: T, right: T, userId: string | null): number {
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

function dedupePreferredV2Rows<T extends PresetV2ComparableRow>(rows: T[], userId: string | null): T[] {
  const preferred = new Map<string, T>();
  for (const row of rows) {
    const key = getV2LogicalKey(row);
    const existing = preferred.get(key);
    if (!existing || comparePresetV2Priority(row, existing, userId) < 0) {
      preferred.set(key, row);
    }
  }
  return Array.from(preferred.values()).sort((left, right) => comparePresetV2Priority(left, right, userId));
}

function isActivePresetV2Row(row: Pick<PresetV2SummaryRow, 'deleted_at'>): boolean {
  return !row.deleted_at;
}

function isInternalDerivedTags(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INTERNAL_DERIVED_TAG);
}

function isInternalDerivedRow(row: Pick<PresetV2SummaryRow, 'name' | 'tags'>): boolean {
  return row.name.startsWith('__derived__/') || isInternalDerivedTags(row.tags);
}

function isInternalDerivedEntry(entry: Pick<PresetEntry, 'name' | 'tags'>): boolean {
  return entry.name.startsWith('__derived__/') || isInternalDerivedTags(entry.tags);
}

function makeDerivedPresetName(scope: string, resolvedHash: string): string {
  return `__derived__/${canonicalizePresetScope(scope) ?? scope}/${resolvedHash.slice(0, 12)}`;
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

function getSupabaseErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const record = error as { code?: string; status?: number; statusCode?: number; message?: string; details?: string; hint?: string };
  return [
    record.code,
    record.status,
    record.statusCode,
    record.message,
    record.details,
    record.hint,
  ]
    .filter(value => value !== undefined && value !== null)
    .map(String)
    .join(' ')
    .toLowerCase();
}

function isTerminalSupabaseListError(error: unknown): boolean {
  const text = getSupabaseErrorText(error);
  return text.includes('402')
    || text.includes('payment required')
    || text.includes('quota')
    || text.includes('egress');
}

function isPermissionDeniedError(error: unknown): boolean {
  const text = getSupabaseErrorText(error);
  return text.includes('42501') || text.includes('permission denied');
}

function isMissingRpcError(error: unknown, functionName: string): boolean {
  const text = getSupabaseErrorText(error);
  return text.includes('pgrst202')
    || text.includes('schema cache')
    || text.includes(`could not find the function public.${functionName}`.toLowerCase())
    || text.includes(`function public.${functionName}`)
    || (text.includes('function') && text.includes(functionName.toLowerCase()) && text.includes('does not exist'));
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

let sharedV2SchemaAvailable: boolean | null = null;
let sharedV2ProbeInFlight: Promise<boolean> | null = null;
let sharedReadCircuitOpenUntil = 0;
let sharedDetailRpcAvailable: boolean | null = null;
let sharedLegacyDetailRpcAvailable: boolean | null = null;
let sharedRuntimeReadRpcAvailable: boolean | null = null;
let sharedLegacySaveRpcAvailable: boolean | null = null;

function isSharedReadCircuitOpen(now = Date.now()): boolean {
  return sharedReadCircuitOpenUntil > now || isSupabaseEgressQuotaCircuitOpen(now);
}

function openSharedReadCircuitIfTerminal(error: unknown): void {
  if (!isTerminalSupabaseListError(error)) return;
  sharedReadCircuitOpenUntil = Math.max(sharedReadCircuitOpenUntil, Date.now() + PRESET_LIST_ERROR_CIRCUIT_MS);
}

export class SupabasePresetStore implements IPresetStore {
  private client: SupabaseClient;
  private userId: string | null = null;
  private isAnonymous = false;
  private v2SchemaAvailable: boolean | null = null;
  private knownPayloadHashesV2 = new Set<string>();
  private listCache = new Map<string, CachedPresetList>();
  private listInFlight = new Map<string, Promise<PresetSummary[]>>();
  private listCircuitOpenUntil = 0;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** Set the authenticated user ID. Call after auth state changes. */
  setUserId(userId: string | null, anonymous = false): void {
    const ownerChanged = this.userId !== userId || this.isAnonymous !== anonymous;
    this.userId = userId;
    this.isAnonymous = anonymous;
    if (ownerChanged) this.clearListCache();
  }

  private getOwnerKey(): string {
    if (SHARED_PRESET_TEST_MODE) return 'public';
    return this.userId ? `user:${this.userId}` : 'anonymous';
  }

  private getListCacheKey(type: PresetLevel, scope?: string): string {
    return `${this.getOwnerKey()}:${type}:${canonicalizePresetScope(scope) ?? ''}`;
  }

  private clearListCache(): void {
    this.listCache.clear();
    this.listInFlight.clear();
    clearPresetListSessionCache();
  }

  private openListCircuitIfTerminal(error: unknown): void {
    if (!isTerminalSupabaseListError(error)) return;
    openSharedReadCircuitIfTerminal(error);
    this.listCircuitOpenUntil = Math.max(this.listCircuitOpenUntil, Date.now() + PRESET_LIST_ERROR_CIRCUIT_MS);
  }

  private async callRuntimeReadRpc<T>(
    functionName: string,
    args: Record<string, unknown>,
    label: string,
  ): Promise<T | undefined> {
    if (sharedRuntimeReadRpcAvailable === false) return undefined;

    const { data, error } = await this.client.rpc(functionName, args);
    if (error) {
      if (isMissingRpcError(error, functionName)) {
        sharedRuntimeReadRpcAvailable = false;
        return undefined;
      }
      if (this.markV2UnavailableIfMissing(error)) return undefined;
      if (isPermissionDeniedError(error)) return undefined;
      throw new Error(`${label} failed: ${error.message}`);
    }

    sharedRuntimeReadRpcAvailable = true;
    return data as T;
  }

  private async callLegacySaveRpc<T>(
    functionName: string,
    args: Record<string, unknown>,
    label: string,
  ): Promise<T | undefined> {
    if (sharedLegacySaveRpcAvailable === false) return undefined;

    const { data, error } = await this.client.rpc(functionName, args);
    if (error) {
      if (isMissingRpcError(error, functionName)) {
        sharedLegacySaveRpcAvailable = false;
        return undefined;
      }
      if (isPermissionDeniedError(error)) return undefined;
      throw new Error(`${label} failed: ${error.message}`);
    }

    sharedLegacySaveRpcAvailable = true;
    return data as T;
  }

  private getVersionTimestamp(version: PresetEntry['versions'][number]): string {
    return new Date(version.timestamp || Date.now()).toISOString();
  }

  private markV2UnavailableIfMissing(error: unknown): boolean {
    if (isMissingRelationError(error)) {
      this.v2SchemaAvailable = false;
      sharedV2SchemaAvailable = false;
      return true;
    }
    return false;
  }

  private async supportsV2(): Promise<boolean> {
    if (this.v2SchemaAvailable !== null) return this.v2SchemaAvailable;
    if (sharedV2SchemaAvailable !== null) {
      this.v2SchemaAvailable = sharedV2SchemaAvailable;
      return sharedV2SchemaAvailable;
    }
    if (isSharedReadCircuitOpen()) {
      return true;
    }
    if (sharedV2ProbeInFlight) {
      const supported = await sharedV2ProbeInFlight;
      this.v2SchemaAvailable = supported;
      return supported;
    }

    sharedV2ProbeInFlight = (async () => {
      const { error } = await this.client
        .from('preset_summaries_v2')
        .select('id')
        .limit(1);

      if (error) {
        if (this.markV2UnavailableIfMissing(error)) return false;
        openSharedReadCircuitIfTerminal(error);
        sharedV2SchemaAvailable = true;
        return true;
      }

      sharedV2SchemaAvailable = true;
      return true;
    })().finally(() => {
      sharedV2ProbeInFlight = null;
    });

    const supported = await sharedV2ProbeInFlight;
    this.v2SchemaAvailable = supported;
    return supported;
  }

  private shouldSkipReadForCircuit(): boolean {
    return isSharedReadCircuitOpen();
  }

  private async rewriteLegacyDelayAKeysIfOwned(row: PresetRow, entry: PresetEntry): Promise<void> {
    void row;
    void entry;
  }

  private async fetchLegacyDetailRpc(
    type?: PresetLevel,
    name?: string,
    scope?: string,
    id?: string,
  ): Promise<PresetRow | null | undefined> {
    if (sharedLegacyDetailRpcAvailable === false) return undefined;

    const functionName = 'kessho_get_legacy_preset_detail';
    const targetScopes = scope ? getPresetScopeReadCandidates(scope) : null;
    const { data, error } = await this.client.rpc(functionName, {
      target_preset_id: id ?? null,
      target_type: type ?? null,
      target_name: name ?? null,
      target_scopes: targetScopes,
    });

    if (error) {
      if (isMissingRpcError(error, functionName)) {
        sharedLegacyDetailRpcAvailable = false;
        return undefined;
      }
      if (isPermissionDeniedError(error)) return undefined;
      throw new Error(`Legacy preset detail RPC failed: ${error.message}`);
    }

    sharedLegacyDetailRpcAvailable = true;
    return data === null ? null : data as unknown as PresetRow;
  }

  private async saveLegacy(entry: PresetEntry): Promise<void> {
    const normalized = normalizePresetEntry(entry);
    if (!normalized) throw new Error('Invalid preset entry');

    compressVersions(normalized);
    const row = entryToLegacyRow(normalized, this.userId);
    if (SHARED_PRESET_TEST_MODE) {
      row.visibility = 'public';
    } else if (this.isAnonymous && !normalized.visibility) {
      row.visibility = 'public';
    }

    const saved = await this.callLegacySaveRpc<PresetRow | null>(
      'kessho_save_legacy_preset',
      { preset_payload: row },
      'Legacy cloud save RPC',
    );
    if (saved === undefined) {
      throw new Error('Cloud save failed: legacy save RPC is unavailable.');
    }
  }

  private async loadLegacy(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    const rpcRow = await this.fetchLegacyDetailRpc(type, name, scope);
    if (rpcRow !== undefined) {
      if (!rpcRow) return null;
      const entry = legacyRowToEntry(rpcRow);
      await this.rewriteLegacyDelayAKeysIfOwned(rpcRow, entry);
      if (version !== undefined) {
        const selected = entry.versions.find(v => v.v === version);
        if (!selected) return null;
        return { ...entry, currentVersion: selected.v };
      }
      return entry;
    }
    return null;
  }

  private async listLegacy(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const buildQuery = () => {
      let query = this.client
        .from('legacy_preset_summaries')
        .select(LEGACY_PRESET_SUMMARY_SELECT)
        .eq('type', type);

      if (scope) {
        const scopes = getPresetScopeReadCandidates(scope);
        if (scopes.length > 1) query = query.in('scope', scopes);
        else query = query.eq('scope', scopes[0] ?? scope);
      }

      if (!SHARED_PRESET_TEST_MODE) {
        if (this.userId) {
          query = query.or(`user_id.eq.${this.userId},visibility.in.(public,featured)`);
        } else {
          query = query.in('visibility', ['public', 'featured']);
        }
      }

      return query.order('updated_at', { ascending: false }).limit(200);
    };

    const { data, error } = await buildQuery();
    if (error) {
      this.openListCircuitIfTerminal(error);
      console.error('SupabasePresetStore.list error:', error);
      return [];
    }

    return dedupePreferredLegacyRows(
      (data ?? []) as unknown as LegacyPresetSummaryRow[],
      SHARED_PRESET_TEST_MODE ? null : this.userId,
    ).map(legacySummaryRowToSummary);
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
      .from('legacy_preset_summaries')
      .select('id')
      .eq('type', type)
      .ilike('name', name.trim());

    if (scope) {
      const scopes = getPresetScopeReadCandidates(scope);
      if (scopes.length > 1) query = query.in('scope', scopes);
      else query = query.eq('scope', scopes[0] ?? scope);
    }
    if (!SHARED_PRESET_TEST_MODE && this.userId) query = query.eq('user_id', this.userId);

    const { data, error } = await query.limit(1);
    if (error) return false;
    return !!data && data.length > 0;
  }

  private buildRenamePayloadFromRow(
    row: {
      name: string;
      creator?: string | null;
      description?: string | null;
      visibility?: string | null;
      family_name?: string | null;
      variant_name?: string | null;
      variant_rank?: number | null;
      rating?: number | null;
      tags?: string[] | null;
    },
    nextName: string,
    identity?: PresetRenameIdentity,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: nextName,
      creator: identity && 'creator' in identity ? identity.creator ?? null : row.creator ?? null,
      description: identity && 'description' in identity ? identity.description ?? null : row.description ?? null,
      visibility: identity && 'visibility' in identity ? identity.visibility ?? 'private' : row.visibility ?? 'private',
      family_name: identity && 'familyName' in identity ? identity.familyName ?? null : row.family_name ?? null,
      variant_name: identity && 'variantName' in identity ? identity.variantName ?? null : row.variant_name ?? null,
      variant_rank: identity && 'variantRank' in identity ? identity.variantRank ?? null : row.variant_rank ?? null,
      rating: identity && 'rating' in identity ? identity.rating ?? null : row.rating ?? null,
    };
    if (identity && 'tags' in identity) {
      payload.tags = identity.tags ?? [];
    } else if (row.tags) {
      payload.tags = row.tags;
    }
    return payload;
  }

  private async renameLegacy(
    type: PresetLevel,
    name: string,
    nextName: string,
    scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    const target = await this.fetchLegacyDetailRpc(type, name, scope);
    if (!target) return null;

    const conflict = await this.fetchLegacyDetailRpc(type, nextName, scope);
    if (conflict && conflict.id !== target.id) {
      throw new Error(`A preset named "${nextName}" already exists.`);
    }

    const { data, error } = await this.client
      .from('presets')
      .update(this.buildRenamePayloadFromRow(target, nextName, identity))
      .eq('id', target.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Legacy cloud preset rename failed: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Legacy cloud preset rename failed: "${name}" was not updated.`);
    }

    return legacyRowToEntry(data as PresetRow);
  }

  private async queryPresetRowsV2(
    type: PresetLevel,
    name: string,
    scope?: string,
    options: V2LookupOptions = {},
  ): Promise<PresetV2Row[]> {
    const scopes = scope
      ? (options.scopeAliases
        ? getPresetScopeReadCandidates(scope)
        : [canonicalizePresetScope(scope) ?? scope])
      : null;
    const data = await this.callRuntimeReadRpc<PresetV2Row[] | null>(
      'kessho_lookup_preset_rows_v2',
      {
        target_preset_id: null,
        target_type: type,
        target_name: name,
        target_scopes: scopes,
        target_scope_is_null: !scope,
        target_resolved_hash: null,
        exclude_preset_id: null,
        include_deleted: options.includeDeleted ?? false,
        deleted_only: options.deletedOnly ?? false,
        include_internal_derived: true,
        internal_derived_only: false,
        max_rows: 20,
      },
      'V2 preset lookup RPC',
    );

    return dedupePreferredV2Rows((data ?? []) as unknown as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId);
  }

  private async findPresetRowByIdV2(id: string): Promise<PresetV2Row | null> {
    if (!isUuid(id)) return null;

    const data = await this.callRuntimeReadRpc<PresetV2Row[] | null>(
      'kessho_lookup_preset_rows_v2',
      {
        target_preset_id: id,
        target_type: null,
        target_name: null,
        target_scopes: null,
        target_scope_is_null: false,
        target_resolved_hash: null,
        exclude_preset_id: null,
        include_deleted: false,
        deleted_only: false,
        include_internal_derived: true,
        internal_derived_only: false,
        max_rows: 1,
      },
      'V2 preset id lookup RPC',
    );

    return ((data ?? []) as unknown as PresetV2Row[])[0] ?? null;
  }

  private async renameV2(
    type: PresetLevel,
    name: string,
    nextName: string,
    scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    const targetRows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
    const target = targetRows[0] ?? null;
    if (!target) return null;

    const conflictRows = await this.queryPresetRowsV2(type, nextName, scope, { scopeAliases: true });
    const conflict = conflictRows.find(row => row.id !== target.id);
    if (conflict) {
      throw new Error(`A preset named "${nextName}" already exists.`);
    }

    const { data, error } = await this.client
      .from('presets_v2')
      .update(this.buildRenamePayloadFromRow(target, nextName, identity))
      .eq('id', target.id)
      .select('*')
      .single();

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) throw error;
      throw new Error(`Cloud preset rename failed: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Cloud preset rename failed: "${name}" was not updated.`);
    }

    return this.loadV2ByRow(data as PresetV2Row);
  }

  private getExplicitRefTargetSpec(
    parentType: PresetLevel,
    parentScope: string | undefined,
    slot: string,
  ): { type: PresetLevel; scope?: string } | null {
    if (parentType === 'journey') return { type: 'state', scope: 'global' };
    const childSpec = getPresetChildSpecs(parentType, parentScope).find(spec => spec.slot === slot);
    if (!childSpec) return null;
    return {
      type: childSpec.type,
      scope: childSpec.scope,
    };
  }

  private async resolveExplicitVersionRefsV2(
    parentType: PresetLevel,
    parentScope: string | undefined,
    refs: Record<string, PresetRef> | undefined,
    excludePresetId?: string | null,
  ): Promise<PendingVersionRefV2[]> {
    if (!refs) return [];

    const resolvedRefs: PendingVersionRefV2[] = [];
    for (const [slot, ref] of Object.entries(refs).sort(([left], [right]) => left.localeCompare(right))) {
      const targetSpec = this.getExplicitRefTargetSpec(parentType, parentScope, slot);
      if (!targetSpec) continue;
      const targetType = targetSpec.type;
      let target: PresetV2Row | null = ref.id ? await this.findPresetRowByIdV2(ref.id) : null;
      if (target?.type !== targetType) target = null;
      if (excludePresetId && target?.id === excludePresetId) target = null;

      if (!target) {
        const targetScope = ref.scope ?? targetSpec.scope ?? (targetType === 'state' ? 'global' : undefined);
        const targetRows = await this.queryPresetRowsV2(targetType, ref.name, targetScope, { scopeAliases: true });
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
    options: V2HashLookupOptions = {},
  ): Promise<PresetV2Row | null> {
    const data = await this.callRuntimeReadRpc<PresetV2Row[] | null>(
      'kessho_lookup_preset_rows_v2',
      {
        target_preset_id: null,
        target_type: type,
        target_name: null,
        target_scopes: [canonicalizePresetScope(scope) ?? scope],
        target_scope_is_null: false,
        target_resolved_hash: resolvedHash,
        exclude_preset_id: excludePresetId ?? null,
        include_deleted: false,
        deleted_only: false,
        include_internal_derived: true,
        internal_derived_only: options.internalDerivedOnly ?? false,
        max_rows: 20,
      },
      'V2 ref lookup RPC',
    );
    const rows = dedupePreferredV2Rows((data ?? []) as unknown as PresetV2Row[], SHARED_PRESET_TEST_MODE ? null : this.userId)
      .filter(row => !options.internalDerivedOnly || isInternalDerivedRow(row))
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
    const existing = await this.findMatchingPresetV2(type, scope, resolvedHash, undefined, { internalDerivedOnly: true });
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

    return this.findMatchingPresetV2(type, scope, resolvedHash, undefined, { internalDerivedOnly: true });
  }

  private async getLatestRefTargetsV2(row: PresetV2Row): Promise<Map<string, PresetV2Row>> {
    if (!row.latest_version_id) return new Map();

    const data = await this.callRuntimeReadRpc<PresetV2RefTargetResult[] | null>(
      'kessho_get_latest_ref_targets_v2',
      { target_version_id: row.latest_version_id },
      'V2 graph ref lookup RPC',
    );
    const targetsBySlot = new Map<string, PresetV2Row>();
    for (const ref of data ?? []) {
      if (ref?.target) targetsBySlot.set(ref.ref_slot, ref.target);
    }
    return targetsBySlot;
  }

  private async isPresetGraphCompleteV2(
    row: PresetV2Row,
    data: Record<string, unknown>,
    depth = 0,
  ): Promise<boolean> {
    if (depth > 4) return true;

    const rowScope = canonicalizePresetScope(row.scope);
    const specs = getPresetChildSpecs(row.type, rowScope);
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
      scope: canonicalizePresetScope(row.scope),
      name: row.name,
      author: row.author,
      library: row.library,
      creator: row.creator ?? 'Kessho Auto Child',
      description: row.description ?? `Hidden derived child preset for ${canonicalizePresetScope(row.scope) ?? row.type}. Reused by content hash.`,
      visibility: 'private',
      familyName: row.family_name ?? `__derived__/${canonicalizePresetScope(row.scope) ?? row.type}`,
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
    return this.findMatchingPresetV2(
      row.type,
      canonicalizePresetScope(row.scope) ?? '',
      row.latest_resolved_hash ?? '',
      undefined,
      { internalDerivedOnly: true },
    );
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

    const data = await this.callRuntimeReadRpc<string[] | null>(
      'kessho_get_preset_version_ref_keys_v2',
      { target_version_id: versionId },
      'V2 version ref signature lookup RPC',
    );

    return [...(data ?? [])].sort();
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

    const data = await this.callRuntimeReadRpc<PresetPayloadV2Row[] | null>(
      'kessho_get_preset_payloads_v2',
      { target_hashes: uniqueHashes },
      'V2 payload fetch RPC',
    );

    for (const row of (data ?? []) as unknown[]) {
      if (isPlainObject(row) && typeof row.hash === 'string' && 'payload' in row) {
        payloadMap.set(row.hash, row.payload);
        continue;
      }
      if (isPlainObject(row)) {
        const payload = canonicalizeRecord(row);
        payloadMap.set(await hashCanonicalJson(payload), payload);
      }
    }

    return payloadMap;
  }

  private async payloadRowsToMapV2(rows: unknown[]): Promise<Map<string, unknown>> {
    const payloadMap = new Map<string, unknown>();
    for (const row of rows) {
      if (isPlainObject(row) && typeof row.hash === 'string' && 'payload' in row) {
        payloadMap.set(row.hash, row.payload);
        continue;
      }
      if (isPlainObject(row)) {
        const payload = canonicalizeRecord(row);
        payloadMap.set(await hashCanonicalJson(payload), payload);
      }
    }
    return payloadMap;
  }

  private async fetchPresetVersionsV2(presetId: string): Promise<PresetVersionV2Row[]> {
    const data = await this.callRuntimeReadRpc<PresetVersionV2Row[] | null>(
      'kessho_get_preset_versions_v2',
      { target_preset_id: presetId },
      'V2 stored version lookup RPC',
    );
    return (data ?? []) as unknown as PresetVersionV2Row[];
  }

  private async fetchExportRowsV2(): Promise<PresetV2Row[]> {
    const data = await this.callRuntimeReadRpc<PresetV2Row[] | null>(
      'kessho_lookup_preset_rows_v2',
      {
        target_preset_id: null,
        target_type: null,
        target_name: null,
        target_scopes: null,
        target_scope_is_null: false,
        target_resolved_hash: null,
        exclude_preset_id: null,
        include_deleted: false,
        deleted_only: false,
        include_internal_derived: false,
        internal_derived_only: false,
        max_rows: 1000,
      },
      'V2 export lookup RPC',
    );
    return (data ?? []) as unknown as PresetV2Row[];
  }

  private normalizeDetailBundleV2(data: unknown): PresetV2DetailBundle | null {
    if (!isPlainObject(data) || !isPlainObject(data.preset)) return null;
    return {
      preset: data.preset as unknown as PresetV2Row,
      versions: Array.isArray(data.versions) ? data.versions as unknown as PresetVersionV2Row[] : [],
      refs: Array.isArray(data.refs) ? data.refs as unknown as PresetVersionRefV2Row[] : [],
      targetPresets: Array.isArray(data.targetPresets)
        ? data.targetPresets as unknown as PresetV2Row[]
        : Array.isArray(data.target_presets)
          ? data.target_presets as unknown as PresetV2Row[]
          : [],
      payloads: Array.isArray(data.payloads) ? data.payloads as unknown as PresetPayloadV2Row[] : [],
    };
  }

  private async fetchDetailBundleRpcV2(options: {
    id?: string;
    type?: PresetLevel;
    name?: string;
    scope?: string;
    version?: number;
  }): Promise<PresetV2DetailBundle | null | undefined> {
    if (sharedDetailRpcAvailable === false) return undefined;

    const functionName = 'kessho_get_preset_detail_v2';
    const targetScopes = options.scope
      ? getPresetScopeReadCandidates(options.scope)
      : null;
    const { data, error } = await this.client.rpc(functionName, {
      target_preset_id: options.id ?? null,
      target_type: options.type ?? null,
      target_name: options.name ?? null,
      target_scopes: targetScopes,
      target_version_no: options.version ?? null,
    });

    if (error) {
      if (isMissingRpcError(error, functionName)) {
        sharedDetailRpcAvailable = false;
        return undefined;
      }
      if (this.markV2UnavailableIfMissing(error)) return null;
      if (isPermissionDeniedError(error)) return undefined;
      throw new Error(`V2 preset detail RPC failed: ${error.message}`);
    }

    sharedDetailRpcAvailable = true;
    return data === null ? null : this.normalizeDetailBundleV2(data);
  }

  private async fetchDirectDetailBundleV2(row: PresetV2Row): Promise<PresetV2DetailBundle | null> {
    void row;
    return null;
  }

  private async materializeDetailBundleV2(
    bundle: PresetV2DetailBundle,
    version?: number,
  ): Promise<PresetEntry | null> {
    const row = bundle.preset;
    const rowScope = canonicalizePresetScope(row.scope);
    const versionRows = bundle.versions;
    if (!versionRows.length) return null;

    const targetPresetMap = new Map(bundle.targetPresets.map(candidate => [candidate.id, candidate]));
    const payloadMap = await this.payloadRowsToMapV2(bundle.payloads);
    const refsByVersionId = new Map<string, PresetVersionRefV2Row[]>();
    for (const refRow of bundle.refs) {
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
          scope: canonicalizePresetScope(targetPreset.scope),
        };
      }

      const resolvedData = await this.loadResolvedSnapshotByVersionRowV2(
        versionRow,
        row.type,
        rowScope ?? null,
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
      scope: rowScope,
      engine: row.type === 'engine' ? rowScope : undefined,
      source: row.type !== 'engine' ? rowScope : undefined,
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

  private async loadV2ByRow(row: PresetV2Row, version?: number, tryRpc = true): Promise<PresetEntry | null> {
    if (tryRpc) {
      const rpcBundle = await this.fetchDetailBundleRpcV2({ id: row.id, version });
      if (rpcBundle !== undefined) {
        return rpcBundle ? this.materializeDetailBundleV2(rpcBundle, version) : null;
      }
    }

    const directBundle = await this.fetchDirectDetailBundleV2(row);
    return directBundle ? this.materializeDetailBundleV2(directBundle, version) : null;
  }

  private async loadV2(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    const rpcBundle = await this.fetchDetailBundleRpcV2({ type, name, scope, version });
    if (rpcBundle !== undefined) {
      return rpcBundle ? this.materializeDetailBundleV2(rpcBundle, version) : null;
    }

    const rows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
    const row = rows[0];
    if (!row) return null;
    return this.loadV2ByRow(row, version, false);
  }

  private async listV2(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const buildQuery = () => {
      let query = this.client
        .from('preset_summaries_v2')
        .select(PRESET_V2_SUMMARY_SELECT)
        .eq('type', type);

      if (scope) {
        const scopes = getPresetScopeReadCandidates(scope);
        if (scopes.length > 1) query = query.in('scope', scopes);
        else query = query.eq('scope', scopes[0] ?? scope);
      }
      query = query.is('deleted_at', null);

      return query.order('updated_at', { ascending: false }).limit(200);
    };

    const { data, error } = await buildQuery();

    if (error) {
      if (this.markV2UnavailableIfMissing(error)) return [];
      this.openListCircuitIfTerminal(error);
      console.error('SupabasePresetStore.listV2 error:', error);
      return [];
    }

    const rows = dedupePreferredV2Rows((data ?? []) as unknown as PresetV2SummaryRow[], SHARED_PRESET_TEST_MODE ? null : this.userId)
      .filter(isActivePresetV2Row)
      .filter(row => !isInternalDerivedRow(row));
    const summaries: PresetSummary[] = rows.map((row) => {
      const rowScope = canonicalizePresetScope(row.scope);
      const familyScope = rowScope ?? 'global';
      return {
        id: row.id,
        type: row.type,
        scope: rowScope,
        engine: row.type === 'engine' ? rowScope : undefined,
        source: row.type !== 'engine' ? rowScope : undefined,
        name: row.name,
        author: row.author,
        library: row.library,
        creator: row.creator ?? undefined,
        description: row.description ?? undefined,
        visibility: row.visibility,
        familyId: `${row.type}:${familyScope}:${normalizeNameKey(row.family_name ?? row.name)}`,
        familyName: row.family_name ?? row.name,
        variantId: `${row.type}:${familyScope}:${normalizeNameKey(row.family_name ?? row.name)}:${normalizeNameKey(row.variant_name ?? row.name)}`,
        variantName: row.variant_name ?? row.name,
        variantRank: row.variant_rank ?? undefined,
        remoteId: row.id,
        playCount: row.play_count ?? undefined,
        rating: row.rating ?? undefined,
        tags: row.tags ?? [],
        versionCount: row.latest_version_no,
        currentVersion: row.latest_version_no,
        updatedAt: new Date(row.updated_at).getTime(),
      };
    });

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

    const rows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
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
    const rows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
    return rows.length > 0;
  }

  private async saveV2(entry: PresetEntry): Promise<void> {
    const normalized = normalizePresetEntry(entry);
    if (!normalized) throw new Error('Invalid preset entry');

    const scope = getPresetScope(normalized, normalized.type);
    const internalDerived = isInternalDerivedEntry(normalized);
    const identityPayload = {
      owner_key: this.getOwnerKey(),
      owner_user_id: SHARED_PRESET_TEST_MODE ? null : this.userId,
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
      storedVersionRows = await this.fetchPresetVersionsV2(presetRow.id);
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
        let target = await this.findMatchingPresetV2(
          childSpec.type,
          childSpec.scope,
          childHash,
          presetRow?.id,
          { internalDerivedOnly: true },
        );
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

      for (const explicitRef of await this.resolveExplicitVersionRefsV2(normalized.type, scope, version.refs, presetRow?.id)) {
        const existingIndex = refsToInsert.findIndex(ref => ref.slot === explicitRef.slot);
        if (existingIndex >= 0) {
          refsToInsert[existingIndex] = explicitRef;
          continue;
        }
        refsToInsert.push(explicitRef);
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

  }

  async save(entry: PresetEntry): Promise<void> {
    if (await this.supportsV2()) {
      await this.saveV2(entry);
      this.clearListCache();
      return;
    }
    await this.saveLegacy(entry);
    this.clearListCache();
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    if (this.shouldSkipReadForCircuit()) return null;

    try {
      if (await this.supportsV2()) {
        if (this.shouldSkipReadForCircuit()) return null;
        const v2Entry = await this.loadV2(type, name, scope, version);
        if (v2Entry) return v2Entry;
        if (SHARED_PRESET_TEST_MODE) return null;
      }

      if (this.shouldSkipReadForCircuit()) return null;
      return this.loadLegacy(type, name, scope, version);
    } catch (error) {
      if (isTerminalSupabaseListError(error)) {
        this.openListCircuitIfTerminal(error);
        return null;
      }
      throw error;
    }
  }

  async loadById(id: string, version?: number): Promise<PresetEntry | null> {
    const targetId = id.trim();
    if (!targetId || this.shouldSkipReadForCircuit()) return null;

    try {
      if (await this.supportsV2()) {
        if (this.shouldSkipReadForCircuit()) return null;
        const row = await this.findPresetRowByIdV2(targetId);
        if (row) return this.loadV2ByRow(row, version);
        if (SHARED_PRESET_TEST_MODE) return null;
      }

      if (this.shouldSkipReadForCircuit()) return null;
      const rpcRow = await this.fetchLegacyDetailRpc(undefined, undefined, undefined, targetId);
      if (!rpcRow) return null;
      const entry = legacyRowToEntry(rpcRow);
      await this.rewriteLegacyDelayAKeysIfOwned(rpcRow, entry);
      if (version !== undefined) {
        const selected = entry.versions.find(v => v.v === version);
        return selected ? { ...entry, currentVersion: selected.v } : null;
      }
      return entry;
    } catch (error) {
      if (isTerminalSupabaseListError(error)) {
        this.openListCircuitIfTerminal(error);
        return null;
      }
      throw error;
    }
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const key = this.getListCacheKey(type, scope);
    const now = Date.now();
    let cached = this.listCache.get(key);
    if (cached && cached.expiresAt > now) {
      return clonePresetSummaries(cached.summaries);
    }
    const sessionCached = readPresetListSessionCache(key, now);
    if (sessionCached) {
      this.listCache.set(key, {
        expiresAt: Math.min(sessionCached.expiresAt, now + PRESET_LIST_MEMORY_CACHE_TTL_MS),
        summaries: clonePresetSummaries(sessionCached.summaries),
      });
      return clonePresetSummaries(sessionCached.summaries);
    }
    if (this.listCircuitOpenUntil > now || isSharedReadCircuitOpen(now) || isSupabaseEgressListRefreshPaused()) {
      cached = this.listCache.get(key);
      return cached ? clonePresetSummaries(cached.summaries) : [];
    }

    const inFlight = this.listInFlight.get(key);
    if (inFlight) {
      return clonePresetSummaries(await inFlight);
    }

    const request = this.listUncached(type, scope)
      .then((summaries) => {
        this.listCache.set(key, {
          expiresAt: Date.now() + PRESET_LIST_MEMORY_CACHE_TTL_MS,
          summaries: clonePresetSummaries(summaries),
        });
        writePresetListSessionCache(key, summaries);
        return summaries;
      })
      .catch((error) => {
        this.openListCircuitIfTerminal(error);
        const fallback = this.listCache.get(key);
        if (fallback) return clonePresetSummaries(fallback.summaries);
        throw error;
      })
      .finally(() => {
        this.listInFlight.delete(key);
      });
    this.listInFlight.set(key, request);
    return clonePresetSummaries(await request);
  }

  async rename(
    type: PresetLevel,
    name: string,
    nextName: string,
    scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    const trimmedName = nextName.trim();
    if (!trimmedName) return null;

    if (await this.supportsV2()) {
      const renamed = await this.renameV2(type, name, trimmedName, scope, identity);
      this.clearListCache();
      if (renamed || SHARED_PRESET_TEST_MODE) return renamed;
    }

    const renamed = await this.renameLegacy(type, name, trimmedName, scope, identity);
    this.clearListCache();
    return renamed;
  }

  private async listUncached(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const summaries: PresetSummary[] = [];

    if (await this.supportsV2()) {
      if (this.shouldSkipReadForCircuit()) return summaries;
      summaries.push(...await this.listV2(type, scope));
      if (SHARED_PRESET_TEST_MODE) return summaries;
    }

    if (this.shouldSkipReadForCircuit()) return summaries;
    const legacySummaries = await this.listLegacy(type, scope);
    const byKey = new Map<string, PresetSummary>();

    for (const summary of [...summaries, ...legacySummaries]) {
      const key = `${summary.type}:${canonicalizePresetScope(summary.scope) ?? ''}:${normalizeNameKey(summary.name)}`;
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
      this.clearListCache();
      return;
    }
    await this.deleteLegacy(type, name, scope);
    this.clearListCache();
  }

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    if (this.shouldSkipReadForCircuit()) return false;
    if (await this.supportsV2()) {
      if (this.shouldSkipReadForCircuit()) return false;
      if (await this.existsV2(type, name, scope)) return true;
      if (SHARED_PRESET_TEST_MODE) return false;
    }
    if (this.shouldSkipReadForCircuit()) return false;
    return this.existsLegacy(type, name, scope);
  }

  async findReferences(type: PresetLevel, name: string): Promise<string[]> {
    if (this.shouldSkipReadForCircuit()) return [];
    if (!(await this.supportsV2())) {
      return [];
    }
    if (this.shouldSkipReadForCircuit()) return [];

    const data = await this.callRuntimeReadRpc<string[] | null>(
      'kessho_find_preset_references_v2',
      {
        target_type: type,
        target_name: name,
      },
      'V2 reference lookup RPC',
    );
    return [...new Set(data ?? [])];
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    if (this.shouldSkipReadForCircuit()) return { bytes: 0, count: 0 };
    if (await this.supportsV2()) {
      if (this.shouldSkipReadForCircuit()) return { bytes: 0, count: 0 };
      const stats = await this.callRuntimeReadRpc<PresetStorageStats | null>(
        'kessho_get_preset_storage_stats_v2',
        {},
        'V2 storage stats RPC',
      );
      return {
        bytes: stats?.bytes ?? 0,
        count: stats?.count ?? 0,
      };
    }

    if (!this.userId) return { bytes: 0, count: 0 };

    const { count, error } = await this.client
      .from('legacy_preset_summaries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', this.userId);

    if (error) return { bytes: 0, count: 0 };
    return { bytes: 0, count: count ?? 0 };
  }

  async exportAll(): Promise<Blob> {
    const entries: PresetEntry[] = [];

    if (this.shouldSkipReadForCircuit()) {
      const payload = {
        kesshoBackup: true,
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        count: 0,
        entries,
      };
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    }

    const v2Supported = await this.supportsV2();
    if (v2Supported) {
      if (this.shouldSkipReadForCircuit()) {
        const payload = {
          kesshoBackup: true,
          formatVersion: 2,
          exportedAt: new Date().toISOString(),
          count: 0,
          entries,
        };
        return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      }
      for (const row of await this.fetchExportRowsV2()) {
        const entry = await this.loadV2ByRow(row);
        if (entry) entries.push(entry);
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
      .from('legacy_preset_summaries')
      .select('id');
    if (this.userId) legacyQuery = legacyQuery.eq('user_id', this.userId);
    const { data: legacyRows } = await legacyQuery;
    if (legacyRows) {
      for (const row of legacyRows as Array<{ id: string }>) {
        const detail = await this.fetchLegacyDetailRpc(undefined, undefined, undefined, row.id);
        if (detail) entries.push(legacyRowToEntry(detail));
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
