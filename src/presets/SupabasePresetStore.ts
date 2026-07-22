// src/presets/SupabasePresetStore.ts
// Cloud preset store backed by Supabase.
// Reads the current V2 normalized schema only. Legacy row helpers remain isolated
// for explicit maintenance tooling; normal store operations never decode legacy rows.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isSupabaseEgressListRefreshPaused,
  isSupabaseEgressQuotaCircuitOpen,
} from '../cloud/supabaseEgressDiagnostics';
import { PRESET_V2_SUMMARY_SELECT } from '../cloud/presetSelects';
import { getVersionData } from './codec';
import {
  buildDrumEuclideanStateFromPatternData,
  buildSynthEuclideanStateFromPatternData,
} from './euclideanPatternBank';
import type { IPresetStore } from './PresetStore';
import {
  extractPresetVersionMetadata,
  getPresetScope,
  normalizePresetSummary,
} from './presetUtils';
import { decodeCurrentPresetEntry, UnsupportedPresetVersionError } from './currentPresetSchema';
import {
  canonicalizePresetScope,
  getPresetScopeReadCandidates,
} from './presetScopeAliases';
import {
  isRoutingMuteGroupSceneRefSlotName,
  planRoutingMuteGroupMetadataStorage,
  reconstructRoutingMuteGroupMetadata,
  ROUTING_MUTE_GROUP_SCENE_DERIVED_SCOPE,
  ROUTING_MUTE_GROUP_SCENE_DERIVED_TYPE,
} from './routingMuteGroupPresetStorage';
import {
  applyRecordPatch,
  buildMissingChildFallbackData,
  canonicalizeRecord,
  collectPresetPayloadHashesV2,
  computeRecordPatch,
  getPresetChildSpecs,
  getResolvedVersionSnapshot,
  hashCanonicalJson,
  hashCanonicalJsonText,
  materializePresetVersion,
  normalizeResolvedVersionData,
  presetVersionStorageSignaturesEqual,
  readVerifiedPresetPayloadCacheV2,
  type PresetPayloadKind,
  type PresetPayloadV2Row,
  type PresetV2Row,
  type PresetVersionRefV2Row,
  type PresetVersionContentRefV2Row,
  type PresetVersionStorageSignature,
  type PresetVersionV2Row,
  writePresetPayloadCacheV2,
  stripReferencedChildData,
  stableStringifyCanonical,
} from './presetStorageV2';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';
import { preparePresetContentBatch, presetContentRefSlot } from './contentNodes';
import {
  applySequencerContentComponents,
  buildSequencerContentGroup,
  sequencerContentCandidates,
  stripSequencerMetadataFromSoundContent,
  stripPortableSequencerContentFromL4Override,
  stripSequencerStateFromSoundContent,
  type SequencerContentComponent,
  type SequencerPageKind,
} from './sequencerContent';
import { DRUM_EUCLIDEAN_LANE_COUNT, SYNTH_EUCLIDEAN_LANE_COUNT } from '../audio/sequencerLaneCounts';
import {
  buildDynamicsEqPoolInstance,
  buildGranularVoicePoolInstance,
  buildSampleVoicePoolInstance,
  buildPadVoicePoolInstance,
  hydrateSharedComponentRef,
  sharedComponentPoolCandidates,
  stripSharedComponentContentFromParent,
} from './sharedComponentPools';
import {
  buildHarmonyContentInstances,
  harmonyContentCandidates,
  hydrateHarmonyContentRef,
  stripHarmonyContentFromL4Override,
} from './harmonyContent';
import {
  buildPadDerivedEndpointInstances,
  buildDrumDerivedEndpointInstances,
  buildGranularAndWaterDerivedEndpointInstances,
  derivedEndpointCandidates,
  hydratePadDerivedEndpointRefs,
  hydrateDrumDerivedEndpointRefs,
  hydrateGranularAndWaterDerivedEndpointRefs,
  findMissingDerivedEndpointSlots,
} from './derivedEndpointContent';
import {
  buildParameterBehaviorInstances,
  hydrateParameterBehaviorRefs,
  parameterBehaviorCandidates,
  stripParameterBehaviorsFromV2Metadata,
} from './parameterBehaviorContent';
import type {
  PresetEntry,
  PresetLevel,
  PresetRenameIdentity,
  PresetRecoveryWarning,
  PresetRef,
  PresetSummary,
  PresetVersionMetadata,
} from './types';
import { preparePresetVersionMetadataForV2Storage } from './versionMetadataHelpers';
import { hydrateOptimizedStatePresetData } from './statePresetOptimization';
import { recordPresetLegacyContentRead } from './presetLegacyContentTelemetry';

const VERSION_CHECKPOINT_INTERVAL = 8;
const PATCH_TO_SNAPSHOT_RATIO = 0.65;
const INTERNAL_DERIVED_TAG = 'internal-derived';
const AUTO_CHILD_TAG = 'auto-child';
const PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000;
const PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000;
const PRESET_LIST_SESSION_CACHE_PREFIX = 'kessho:supabasePresetList:v1:';
const PRESET_LIST_ERROR_CIRCUIT_MS = 120_000;
const PRESET_LIBRARY_INITIAL_PAGE_SIZE = 24;
export const PRESET_LIBRARY_MANAGEMENT_PAGE_SIZE = 50;

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

interface PendingVersionContentRefV2 {
  slot: string;
  contentHash: string;
  contentType: string;
}

interface StorablePayloadV2 {
  hash: string;
  payloadKind: PresetPayloadKind;
  payload: Record<string, unknown>;
}

interface PreparedVersionContentV2 {
  payloads: StorablePayloadV2[];
  refs: PendingVersionContentRefV2[];
}

interface CachedPresetList {
  expiresAt: number;
  summaries: PresetSummary[];
}

interface PresetV2DetailBundle {
  preset: PresetV2Row;
  versions: PresetVersionV2Row[];
  refs: PresetVersionRefV2Row[];
  contentRefs: PresetVersionContentRefV2Row[];
  targetPresets: PresetV2Row[];
  payloads: PresetPayloadV2Row[];
}

interface PresetV2RefTargetResult {
  ref_slot: string;
  target: PresetV2Row;
}

interface PresetV2LatestManifest {
  preset: PresetV2Row;
  latest_version: PresetVersionV2Row;
  refs: PresetVersionRefV2Row[];
  content_refs: PresetVersionContentRefV2Row[];
  target_presets?: PresetV2Row[];
  targetPresets?: PresetV2Row[];
  required_hashes: string[];
}

interface PresetStorageStats {
  bytes: number;
  count: number;
}

const PAYLOAD_KIND_INSERT_PRIORITY: Record<PresetPayloadKind, number> = {
  content: 6,
  resolved: 5,
  metadata: 4,
  patch: 3,
  override: 2,
  refs_override: 1,
};

function dedupeStorablePayloadsByHashV2(payloads: StorablePayloadV2[]): StorablePayloadV2[] {
  const byHash = new Map<string, StorablePayloadV2>();
  for (const payload of payloads) {
    const existing = byHash.get(payload.hash);
    if (
      !existing
      || PAYLOAD_KIND_INSERT_PRIORITY[payload.payloadKind] > PAYLOAD_KIND_INSERT_PRIORITY[existing.payloadKind]
    ) {
      byHash.set(payload.hash, payload);
    }
  }
  return [...byHash.values()];
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

export function entryToLegacyRow(entry: PresetEntry, userId: string | null): Record<string, unknown> {
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

function isInternalDerivedRef(ref: Pick<PresetRef, 'name'>): boolean {
  return ref.name.startsWith('__derived__/');
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

function getPayloadKindConflictHash(error: unknown): string | null {
  const match = /payload hash ([0-9a-f]{64}) already exists with a different payload_kind/.exec(getSupabaseErrorText(error));
  return match?.[1] ?? null;
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
    || (text.includes('unsupported fake rpc') && text.includes(functionName.toLowerCase()))
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
let sharedLatestManifestRpcAvailable: boolean | null = null;
let sharedMissingPayloadRpcAvailable: boolean | null = null;
let sharedRuntimeReadRpcAvailable: boolean | null = null;

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

  private buildRenamePayload(
    nextName: string,
    identity?: PresetRenameIdentity,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = { name: nextName };
    if (!identity) return payload;
    if ('creator' in identity) payload.creator = identity.creator ?? null;
    if ('description' in identity) payload.description = identity.description ?? null;
    if ('visibility' in identity) payload.visibility = identity.visibility ?? 'private';
    if ('familyName' in identity) payload.family_name = identity.familyName ?? null;
    if ('variantName' in identity) payload.variant_name = identity.variantName ?? null;
    if ('variantRank' in identity) payload.variant_rank = identity.variantRank ?? null;
    if ('rating' in identity) payload.rating = identity.rating ?? null;
    if ('tags' in identity) payload.tags = identity.tags ?? [];
    return payload;
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
    // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: logical-key lookup with type/name/scope filters.
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

    // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: id lookup, max_rows=1.
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

  private async lookupPresetIdV2(
    type: PresetLevel,
    name: string,
    scope?: string,
  ): Promise<string | null | undefined> {
    const scopes = scope ? getPresetScopeReadCandidates(scope) : [null];
    for (const targetScope of scopes) {
      const { data, error } = await this.client.rpc('kessho_lookup_preset_id_v2', {
        target_type: type,
        target_name: name,
        target_scope: targetScope,
        target_resolved_hash: null,
      });

      if (error) {
        if (isMissingRpcError(error, 'kessho_lookup_preset_id_v2')) return undefined;
        if (this.markV2UnavailableIfMissing(error) || isPermissionDeniedError(error)) return undefined;
        throw new Error(`V2 preset id lookup RPC failed: ${error.message}`);
      }

      if (typeof data === 'string' && data) return data;
    }
    return null;
  }

  private async existsLogicalKeyV2(
    type: PresetLevel,
    name: string,
    scope?: string,
  ): Promise<boolean | undefined> {
    const scopes = scope ? getPresetScopeReadCandidates(scope) : [null];
    for (const targetScope of scopes) {
      const { data, error } = await this.client.rpc('kessho_exists_preset_logical_key_v2', {
        target_type: type,
        target_name: name,
        target_scope: targetScope,
      });

      if (error) {
        if (isMissingRpcError(error, 'kessho_exists_preset_logical_key_v2')) return undefined;
        if (this.markV2UnavailableIfMissing(error) || isPermissionDeniedError(error)) return undefined;
        throw new Error(`V2 preset existence RPC failed: ${error.message}`);
      }

      if (data === true) return true;
    }
    return false;
  }

  private async renameV2(
    type: PresetLevel,
    name: string,
    nextName: string,
    scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    const targetId = await this.lookupPresetIdV2(type, name, scope);
    let target: PresetV2Row | null = null;
    if (targetId === undefined) {
      const targetRows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
      target = targetRows[0] ?? null;
    } else if (targetId) {
      target = { id: targetId } as PresetV2Row;
    }
    if (!target) return null;

    const { data, error } = await this.client.rpc('kessho_rename_preset_v2', {
      target_preset_id: target.id,
      rename_payload: this.buildRenamePayload(nextName, identity),
    });

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
    computedRefsBySlot?: ReadonlyMap<string, PendingVersionRefV2>,
  ): Promise<PendingVersionRefV2[]> {
    if (!refs) return [];

    const resolvedRefs: PendingVersionRefV2[] = [];
    for (const [slot, ref] of Object.entries(refs).sort(([left], [right]) => left.localeCompare(right))) {
      const targetSpec = this.getExplicitRefTargetSpec(parentType, parentScope, slot);
      if (!targetSpec) continue;
      if (isInternalDerivedRef(ref) && computedRefsBySlot?.has(slot)) continue;
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
    // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: hash lookup for ref deduplication with scope and hash filters.
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
    const normalized = canonicalizeRecord(payload as Record<string, unknown>);
    return hashCanonicalJsonText(JSON.stringify(normalized));
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
      hash: await hashCanonicalJsonText(JSON.stringify(normalized)),
      payloadKind: kind,
      payload: normalized,
    };
  }

  private async prepareVersionContentV2(
    type: PresetLevel,
    scope: string | undefined,
    state: Record<string, unknown>,
    metadata: PresetVersionMetadata | undefined,
  ): Promise<PreparedVersionContentV2> {
    const groups = type === 'state' ? [
      ...Array.from({ length: SYNTH_EUCLIDEAN_LANE_COUNT }, (_, laneIndex) =>
        buildSequencerContentGroup({ state, metadata, kind: 'synth', laneIndex })),
      ...Array.from({ length: DRUM_EUCLIDEAN_LANE_COUNT }, (_, laneIndex) =>
        buildSequencerContentGroup({ state, metadata, kind: 'drum', laneIndex })),
    ] : [];
    const sharedInstances = type === 'kit' && scope === 'granularKit'
      ? Array.from({ length: 4 }, (_, laneIndex) => buildGranularVoicePoolInstance(state, laneIndex))
      : type === 'source' && scope === 'dynamicsBus'
        ? Array.from({ length: 2 }, (_, laneIndex) => buildDynamicsEqPoolInstance(state, laneIndex))
        : type === 'source' && scope === 'synth'
          ? Array.from({ length: 2 }, (_, laneIndex) => buildSampleVoicePoolInstance(state, laneIndex))
          : type === 'kit' && scope === 'pad1Kit'
            ? [buildPadVoicePoolInstance(state, 0)]
            : type === 'kit' && scope === 'pad2Kit'
              ? [buildPadVoicePoolInstance(state, 1)]
              : [];
    const harmonyInstances = type === 'state' ? buildHarmonyContentInstances(state) : [];
    const derivedEndpointInstances = type === 'state'
      ? [
          ...buildPadDerivedEndpointInstances(state),
          ...buildDrumDerivedEndpointInstances(state),
          ...buildGranularAndWaterDerivedEndpointInstances(state),
        ]
      : [];
    const behaviorInstances = buildParameterBehaviorInstances(metadata);
    const candidates = [
      ...groups.flatMap(sequencerContentCandidates),
      ...sharedComponentPoolCandidates(sharedInstances),
      ...harmonyContentCandidates(harmonyInstances),
      ...derivedEndpointCandidates(derivedEndpointInstances),
      ...parameterBehaviorCandidates(behaviorInstances),
    ];
    if (candidates.length === 0) return { payloads: [], refs: [] };
    const batch = await preparePresetContentBatch(candidates);
    const refs: PendingVersionContentRefV2[] = [];
    for (const group of groups) {
      const groupSlot = `sequencer.${group.kind}.${group.laneIndex + 1}`;
      for (const component of group.components) {
        const candidate = batch.byId.get(`${group.kind}.${group.laneIndex}.${component.componentSlot}`);
        if (!candidate) throw new Error(`Missing prepared sequencer component ${groupSlot}.${component.componentSlot}`);
        refs.push({
          slot: presetContentRefSlot(groupSlot, component.componentSlot),
          contentHash: candidate.hash,
          contentType: candidate.envelope.contentType,
        });
      }
    }
    for (const instance of sharedInstances) {
      const candidate = batch.byId.get(instance.id);
      if (!candidate) throw new Error(`Missing prepared shared component ${instance.refSlot}`);
      refs.push({ slot: instance.refSlot, contentHash: candidate.hash, contentType: candidate.envelope.contentType });
    }
    if (type === 'state') {
      for (const instance of harmonyInstances) {
        const candidate = batch.byId.get(instance.id);
        if (!candidate) throw new Error(`Missing prepared harmony component ${instance.refSlot}`);
        refs.push({ slot: instance.refSlot, contentHash: candidate.hash, contentType: candidate.envelope.contentType });
      }
      for (const instance of derivedEndpointInstances) {
        const candidate = batch.byId.get(instance.id);
        if (!candidate) throw new Error(`Missing prepared derived endpoint ${instance.refSlot}`);
        refs.push({ slot: instance.refSlot, contentHash: candidate.hash, contentType: candidate.envelope.contentType });
      }
    }
    for (const instance of behaviorInstances) {
      const candidate = batch.byId.get(instance.id);
      if (!candidate) throw new Error(`Missing prepared parameter behavior ${instance.refSlot}`);
      refs.push({ slot: instance.refSlot, contentHash: candidate.hash, contentType: candidate.envelope.contentType });
    }
    return {
      payloads: [...batch.uniqueByHash.values()].map(node => ({
        hash: node.hash,
        payloadKind: 'content',
        payload: { ...node.envelope },
      })),
      refs,
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
    contentRefsToInsert: PendingVersionContentRefV2[] = [],
  ): Promise<{ preset: PresetV2Row; version: PresetVersionV2Row }> {
    const uniquePayloads = dedupeStorablePayloadsByHashV2(payloads);
    const legacyPayloads = uniquePayloads.filter(payload => payload.payloadKind !== 'content');
    const contentPayloads = uniquePayloads.filter(payload => payload.payloadKind === 'content');
    const existingHashes = await this.fetchExistingPayloadHashesForInsertV2(
      legacyPayloads.map(payload => payload.hash),
    );
    for (const hash of existingHashes) this.knownPayloadHashesV2.add(hash);

    let payloadsToInsert = [
      ...legacyPayloads.filter(payload => !this.knownPayloadHashesV2.has(payload.hash)),
      ...contentPayloads,
    ];
    const skippedConflictHashes = new Set<string>();
    let useDirectContentRefs = contentRefsToInsert.length > 0;

    while (true) {
      const { data, error } = await this.client.rpc('kessho_save_preset_v2', {
        identity_payload: identityPayload,
        version_payload: versionPayload,
        payloads_payload: payloadsToInsert
          .filter(payload => useDirectContentRefs || payload.payloadKind !== 'content')
          .map((payload) => ({
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
        ...(useDirectContentRefs ? {
          content_refs_payload: contentRefsToInsert.map(ref => ({
            ref_slot: ref.slot,
            content_hash: ref.contentHash,
            content_type: ref.contentType,
            created_at: versionPayload.created_at,
          })),
        } : {}),
      });

      if (error) {
        if (useDirectContentRefs && isMissingRpcError(error, 'kessho_save_preset_v2')) {
          useDirectContentRefs = false;
          continue;
        }
        const conflictHash = getPayloadKindConflictHash(error);
        if (
          conflictHash
          && !skippedConflictHashes.has(conflictHash)
          && payloadsToInsert.some(payload => payload.hash === conflictHash)
        ) {
          skippedConflictHashes.add(conflictHash);
          this.knownPayloadHashesV2.add(conflictHash);
          payloadsToInsert = payloadsToInsert.filter(payload => payload.hash !== conflictHash);
          continue;
        }

        if (this.markV2UnavailableIfMissing(error)) {
          throw error;
        }
        throw new Error(`V2 atomic save failed: ${error.message}`);
      }

      const result = data as { preset?: PresetV2Row; version?: PresetVersionV2Row } | null;
      if (!result?.preset || !result.version) {
        throw new Error('V2 atomic save failed: RPC returned no preset/version rows.');
      }

      for (const payload of uniquePayloads) {
        this.knownPayloadHashesV2.add(payload.hash);
      }

      return {
        preset: result.preset,
        version: result.version,
      };
    }
  }

  private async fetchExistingPayloadHashesForInsertV2(hashes: string[]): Promise<Set<string>> {
    const uniqueHashes = collectPresetPayloadHashesV2(hashes);
    const missingKnownHashes = uniqueHashes.filter(hash => !this.knownPayloadHashesV2.has(hash));
    const existingHashes = new Set(uniqueHashes.filter(hash => this.knownPayloadHashesV2.has(hash)));
    if (!missingKnownHashes.length) return existingHashes;

    const functionName = sharedMissingPayloadRpcAvailable === false
      ? 'kessho_get_preset_payloads_v2'
      : 'kessho_get_missing_preset_payloads_v2';
    const { data, error } = await this.client.rpc(functionName, {
      target_hashes: missingKnownHashes,
    });
    if (error) {
      if (functionName === 'kessho_get_missing_preset_payloads_v2' && isMissingRpcError(error, functionName)) {
        sharedMissingPayloadRpcAvailable = false;
        return this.fetchExistingPayloadHashesForInsertV2(missingKnownHashes);
      }
      if (isMissingRpcError(error, functionName)) {
        sharedRuntimeReadRpcAvailable = false;
        return existingHashes;
      }
      if (this.markV2UnavailableIfMissing(error) || isPermissionDeniedError(error)) return existingHashes;
      throw new Error(`V2 existing payload probe failed: ${error.message}`);
    }
    if (functionName === 'kessho_get_missing_preset_payloads_v2') {
      sharedMissingPayloadRpcAvailable = true;
    }

    for (const row of (data ?? []) as unknown[]) {
      if (isPlainObject(row) && typeof row.hash === 'string') {
        existingHashes.add(row.hash);
        if ('payload' in row) {
          await writePresetPayloadCacheV2(row.hash, row.payload);
        }
      }
    }

    return existingHashes;
  }

  private async fetchPayloadMapV2(hashes: string[]): Promise<Map<string, unknown>> {
    const uniqueHashes = collectPresetPayloadHashesV2(hashes);
    const payloadMap = new Map<string, unknown>();
    if (!uniqueHashes.length) return payloadMap;

    const missingHashes: string[] = [];
    for (const hash of uniqueHashes) {
      const cached = await readVerifiedPresetPayloadCacheV2(hash);
      if (cached !== undefined) {
        payloadMap.set(hash, cached);
      } else {
        missingHashes.push(hash);
      }
    }
    if (!missingHashes.length) return payloadMap;

    const functionName = sharedMissingPayloadRpcAvailable === false
      ? 'kessho_get_preset_payloads_v2'
      : 'kessho_get_missing_preset_payloads_v2';
    const { data, error } = await this.client.rpc(functionName, {
      target_hashes: missingHashes,
    });
    if (error) {
      if (functionName === 'kessho_get_missing_preset_payloads_v2' && isMissingRpcError(error, functionName)) {
        sharedMissingPayloadRpcAvailable = false;
        return this.fetchPayloadMapV2(missingHashes);
      }
      if (isMissingRpcError(error, functionName)) {
        sharedRuntimeReadRpcAvailable = false;
        return payloadMap;
      }
      if (this.markV2UnavailableIfMissing(error) || isPermissionDeniedError(error)) return payloadMap;
      throw new Error(`V2 payload fetch RPC failed: ${error.message}`);
    }
    if (functionName === 'kessho_get_missing_preset_payloads_v2') {
      sharedMissingPayloadRpcAvailable = true;
    }

    for (const row of (data ?? []) as unknown[]) {
      if (isPlainObject(row) && typeof row.hash === 'string' && 'payload' in row) {
        payloadMap.set(row.hash, row.payload);
        await writePresetPayloadCacheV2(row.hash, row.payload);
        continue;
      }
      if (isPlainObject(row)) {
        const payload = canonicalizeRecord(row);
        const payloadJson = JSON.stringify(payload);
        const hash = await hashCanonicalJsonText(payloadJson);
        payloadMap.set(hash, payload);
        await writePresetPayloadCacheV2(hash, payload, { verifiedCanonicalJson: payloadJson });
      }
    }

    return payloadMap;
  }

  private async payloadRowsToMapV2(rows: unknown[]): Promise<Map<string, unknown>> {
    const payloadMap = new Map<string, unknown>();
    for (const row of rows) {
      if (isPlainObject(row) && typeof row.hash === 'string' && 'payload' in row) {
        payloadMap.set(row.hash, row.payload);
        await writePresetPayloadCacheV2(row.hash, row.payload);
        continue;
      }
      if (isPlainObject(row)) {
        const payload = canonicalizeRecord(row);
        const payloadJson = JSON.stringify(payload);
        const hash = await hashCanonicalJsonText(payloadJson);
        payloadMap.set(hash, payload);
        await writePresetPayloadCacheV2(hash, payload, { verifiedCanonicalJson: payloadJson });
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
    // ALLOW_WIDE_LOOKUP_FOR_EXPORT: explicit backup/export flow, not a hot play/list path.
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
      contentRefs: Array.isArray(data.contentRefs)
        ? data.contentRefs as unknown as PresetVersionContentRefV2Row[]
        : Array.isArray(data.content_refs)
          ? data.content_refs as unknown as PresetVersionContentRefV2Row[]
          : [],
      targetPresets: Array.isArray(data.targetPresets)
        ? data.targetPresets as unknown as PresetV2Row[]
        : Array.isArray(data.target_presets)
          ? data.target_presets as unknown as PresetV2Row[]
          : [],
      payloads: Array.isArray(data.payloads) ? data.payloads as unknown as PresetPayloadV2Row[] : [],
    };
  }

  private normalizeLatestManifestV2(data: unknown): PresetV2LatestManifest | null {
    if (!isPlainObject(data) || !isPlainObject(data.preset) || !isPlainObject(data.latest_version)) return null;
    return {
      preset: data.preset as unknown as PresetV2Row,
      latest_version: data.latest_version as unknown as PresetVersionV2Row,
      refs: Array.isArray(data.refs) ? data.refs as unknown as PresetVersionRefV2Row[] : [],
      content_refs: Array.isArray(data.content_refs)
        ? data.content_refs as unknown as PresetVersionContentRefV2Row[]
        : Array.isArray(data.contentRefs)
          ? data.contentRefs as unknown as PresetVersionContentRefV2Row[]
          : [],
      targetPresets: Array.isArray(data.targetPresets)
        ? data.targetPresets as unknown as PresetV2Row[]
        : Array.isArray(data.target_presets)
          ? data.target_presets as unknown as PresetV2Row[]
          : [],
      required_hashes: Array.isArray(data.required_hashes)
        ? data.required_hashes.filter((hash): hash is string => typeof hash === 'string')
        : [],
    };
  }

  private async fetchLatestManifestRpcV2(id: string): Promise<PresetV2LatestManifest | null | undefined> {
    if (sharedLatestManifestRpcAvailable === false) return undefined;

    const functionName = 'kessho_get_preset_latest_manifest_v2';
    const { data, error } = await this.client.rpc(functionName, {
      target_preset_id: id,
    });

    if (error) {
      if (isMissingRpcError(error, functionName)) {
        sharedLatestManifestRpcAvailable = false;
        return undefined;
      }
      if (this.markV2UnavailableIfMissing(error)) return null;
      if (isPermissionDeniedError(error)) return undefined;
      throw new Error(`V2 latest preset manifest RPC failed: ${error.message}`);
    }

    sharedLatestManifestRpcAvailable = true;
    return data === null ? null : this.normalizeLatestManifestV2(data);
  }

  private async materializeLatestManifestV2(manifest: PresetV2LatestManifest): Promise<PresetEntry | null> {
    const latestVersion = manifest.latest_version;
    const requiredHashes = [
      ...manifest.required_hashes,
      latestVersion.resolved_hash,
      latestVersion.metadata_hash,
      latestVersion.override_hash,
      latestVersion.patch_from_prev_hash,
    ].filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);
    const payloadMap = await this.fetchPayloadMapV2(requiredHashes);
    return this.materializeDetailBundleV2({
      preset: manifest.preset,
      versions: [latestVersion],
      refs: manifest.refs,
      contentRefs: manifest.content_refs,
      targetPresets: manifest.targetPresets ?? [],
      payloads: [],
    }, undefined, payloadMap);
  }

  private hydrateSequencerContentRefsV2(
    state: Record<string, unknown>,
    metadata: PresetVersionMetadata | undefined,
    refs: readonly PresetVersionContentRefV2Row[],
    payloadMap: Map<string, unknown>,
    recoveryWarnings?: PresetRecoveryWarning[],
  ): { state: Record<string, unknown>; metadata: PresetVersionMetadata | undefined } {
    if (refs.length === 0) return { state, metadata };
    const grouped = new Map<string, {
      kind: SequencerPageKind;
      laneIndex: number;
      components: SequencerContentComponent[];
    }>();
    for (const ref of refs) {
      const match = /^sequencer\.(synth|drum)\.([1-9][0-9]*)\.([a-z][a-z0-9-]*)$/.exec(ref.ref_slot);
      if (!match) continue;
      const payload = payloadMap.get(ref.content_hash);
      if (!isPlainObject(payload)
          || payload.schemaVersion !== 1
          || payload.contentType !== ref.content_type
          || !isPlainObject(payload.content)) {
        recoveryWarnings?.push({
          slot: ref.ref_slot,
          reason: payload === undefined ? 'missing_payload' : 'invalid_payload_shape',
          fallback: 'default',
        });
        continue;
      }
      const kind = match[1] as SequencerPageKind;
      const laneIndex = Number(match[2]) - 1;
      const key = `${kind}.${laneIndex}`;
      const group = grouped.get(key) ?? { kind, laneIndex, components: [] };
      group.components.push({
        componentSlot: match[3] as SequencerContentComponent['componentSlot'],
        contentType: ref.content_type as SequencerContentComponent['contentType'],
        content: payload.content,
      });
      grouped.set(key, group);
    }

    let nextState = { ...state };
    let nextMetadata = metadata;
    for (const group of grouped.values()) {
      const hydrated = applySequencerContentComponents({
        state: nextState,
        metadata: nextMetadata,
        kind: group.kind,
        laneIndex: group.laneIndex,
        components: group.components,
      });
      nextState = { ...nextState, ...hydrated.statePatch };
      nextMetadata = hydrated.metadata;
    }
    return { state: nextState, metadata: nextMetadata };
  }

  private hydrateSharedContentRefsV2(
    state: Record<string, unknown>,
    refs: readonly PresetVersionContentRefV2Row[],
    payloadMap: Map<string, unknown>,
  ): Record<string, unknown> {
    let next = state;
    for (const ref of refs) {
      const payload = payloadMap.get(ref.content_hash);
      if (!isPlainObject(payload) || !isPlainObject(payload.content)) continue;
      const patch = hydrateSharedComponentRef(ref.ref_slot, ref.content_type, payload.content);
      const harmonyPatch = hydrateHarmonyContentRef(ref.ref_slot, ref.content_type, payload.content);
      if (patch || harmonyPatch) next = { ...next, ...(patch ?? harmonyPatch) };
    }
    return next;
  }

  private async loadLatestManifestV2(id: string): Promise<PresetEntry | null | undefined> {
    const manifest = await this.fetchLatestManifestRpcV2(id);
    if (manifest === undefined) return undefined;
    return manifest ? this.materializeLatestManifestV2(manifest) : null;
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
    preloadedPayloadMap?: Map<string, unknown>,
  ): Promise<PresetEntry | null> {
    const row = bundle.preset;
    const rowScope = canonicalizePresetScope(row.scope);
    const versionRows = bundle.versions;
    if (!versionRows.length) return null;

    const targetPresetMap = new Map(bundle.targetPresets.map(candidate => [candidate.id, candidate]));
    const payloadMap = preloadedPayloadMap ?? await this.payloadRowsToMapV2(bundle.payloads);
    const refsByVersionId = new Map<string, PresetVersionRefV2Row[]>();
    for (const refRow of bundle.refs) {
      const bucket = refsByVersionId.get(refRow.version_id) ?? [];
      bucket.push(refRow);
      refsByVersionId.set(refRow.version_id, bucket);
    }
    const contentRefsByVersionId = new Map<string, PresetVersionContentRefV2Row[]>();
    for (const refRow of bundle.contentRefs) {
      const bucket = contentRefsByVersionId.get(refRow.version_id) ?? [];
      bucket.push(refRow);
      contentRefsByVersionId.set(refRow.version_id, bucket);
    }

    const materializedVersions: PresetEntry['versions'] = [];
    const targetVersionNo = version ?? row.latest_version_no;
    const recoveryWarnings: PresetRecoveryWarning[] = [];
    let previousResolved: Record<string, unknown> | null = null;
    for (const versionRow of versionRows) {
      const versionRefs = refsByVersionId.get(versionRow.id) ?? [];
      const refMap: Record<string, PresetRef> = {};
      for (const versionRef of versionRefs) {
        if (isRoutingMuteGroupSceneRefSlotName(versionRef.ref_slot)) continue;
        const targetPreset = targetPresetMap.get(versionRef.target_preset_id);
        if (!targetPreset) continue;
        refMap[versionRef.ref_slot] = {
          id: targetPreset.id,
          name: targetPreset.name,
          version: versionRef.follow_latest ? 'latest' : (versionRef.target_version_no ?? targetPreset.latest_version_no),
          scope: canonicalizePresetScope(targetPreset.scope),
        };
      }

      let resolvedData = await this.loadResolvedSnapshotByVersionRowV2(
        versionRow,
        row.type,
        rowScope ?? null,
        payloadMap,
        refsByVersionId,
        targetPresetMap,
        previousResolved,
        versionRow.version_no === targetVersionNo ? recoveryWarnings : undefined,
      );
      if (row.type === 'state') {
        for (const slot of findMissingDerivedEndpointSlots(
          contentRefsByVersionId.get(versionRow.id) ?? [],
          payloadMap,
        )) {
          if (versionRow.version_no === targetVersionNo) recoveryWarnings.push({
            slot,
            reason: 'missing_payload',
            fallback: 'default',
            version: versionRow.version_no,
          });
        }
        resolvedData = hydratePadDerivedEndpointRefs(
          resolvedData,
          contentRefsByVersionId.get(versionRow.id) ?? [],
          payloadMap,
        );
        resolvedData = hydrateDrumDerivedEndpointRefs(
          resolvedData,
          contentRefsByVersionId.get(versionRow.id) ?? [],
          payloadMap,
        );
        resolvedData = hydrateGranularAndWaterDerivedEndpointRefs(
          resolvedData,
          contentRefsByVersionId.get(versionRow.id) ?? [],
          payloadMap,
        );
        resolvedData = canonicalizeRecord(hydrateOptimizedStatePresetData(resolvedData));
      }
      const metadataPayload = versionRow.metadata_hash ? payloadMap.get(versionRow.metadata_hash) : undefined;
      const metadata = isPlainObject(metadataPayload) ? metadataPayload as PresetVersionMetadata : undefined;
      recordPresetLegacyContentRead({
        type: row.type,
        resolvedHash: versionRow.resolved_hash,
        metadata,
        refs: versionRefs,
        contentRefs: contentRefsByVersionId.get(versionRow.id) ?? [],
      });
      let reconstructedMetadata = reconstructRoutingMuteGroupMetadata(
        metadata,
        (refSlot) => {
          const refRow = versionRefs.find(candidate => candidate.ref_slot === refSlot);
          if (!refRow) return { targetFound: false, payload: undefined };
          const targetPreset = targetPresetMap.get(refRow.target_preset_id);
          if (!targetPreset) return { targetFound: false, payload: undefined };
          return {
            targetFound: true,
            payload: targetPreset.latest_resolved_hash
              ? payloadMap.get(targetPreset.latest_resolved_hash)
              : undefined,
          };
        },
        {
          recoveryWarnings: versionRow.version_no === targetVersionNo ? recoveryWarnings : undefined,
          version: versionRow.version_no,
        },
      );
      const hydratedSequencers = this.hydrateSequencerContentRefsV2(
        resolvedData,
        reconstructedMetadata,
        contentRefsByVersionId.get(versionRow.id) ?? [],
        payloadMap,
        versionRow.version_no === targetVersionNo ? recoveryWarnings : undefined,
      );
      resolvedData = hydratedSequencers.state;
      reconstructedMetadata = hydratedSequencers.metadata;
      reconstructedMetadata = hydrateParameterBehaviorRefs(
        reconstructedMetadata,
        contentRefsByVersionId.get(versionRow.id) ?? [],
        payloadMap,
      );
      resolvedData = this.hydrateSharedContentRefsV2(
        resolvedData,
        contentRefsByVersionId.get(versionRow.id) ?? [],
        payloadMap,
      );
      previousResolved = resolvedData;
      materializedVersions.push(
        materializePresetVersion(
          versionRow,
          resolvedData,
          reconstructedMetadata,
          Object.keys(refMap).length > 0 ? refMap : undefined,
        ),
      );
    }

    const entry = decodeCurrentPresetEntry({
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

    if (recoveryWarnings.length > 0) {
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
    } else if (parentType !== 'state') {
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
    if (version === undefined && tryRpc) {
      const latest = await this.loadLatestManifestV2(row.id);
      if (latest !== undefined) return latest;
    }

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
    if (version === undefined) {
      const rows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
      const row = rows[0];
      if (!row) return null;
      return this.loadV2ByRow(row);
    }

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

      return query.order('updated_at', { ascending: false }).limit(PRESET_LIBRARY_INITIAL_PAGE_SIZE);
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
    const exists = await this.existsLogicalKeyV2(type, name, scope);
    if (exists !== undefined) return exists;

    const rows = await this.queryPresetRowsV2(type, name, scope, { scopeAliases: true });
    return rows.length > 0;
  }

  private async saveV2(entry: PresetEntry): Promise<void> {
    const normalized = decodeCurrentPresetEntry(entry);

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
      const normalizedResolvedData = normalized.type === 'state' || internalDerived
        ? canonicalizeRecord(rawResolvedData)
        : normalizeResolvedVersionData(normalized.type, scope, rawResolvedData);
      const isSoundOnlySource = normalized.type === 'source' && (scope === 'synth' || scope === 'drums');
      const resolvedData = isSoundOnlySource
        ? stripSequencerStateFromSoundContent(normalizedResolvedData)
        : normalizedResolvedData;
      const storageResolvedData = normalized.type === 'state'
        ? canonicalizeRecord(rawResolvedData)
        : resolvedData;
      const rawMetadata = snapshot?.metadata ?? extractPresetVersionMetadata(version);
      const metadata = isSoundOnlySource
        ? stripSequencerMetadataFromSoundContent(rawMetadata)
        : rawMetadata;
      const muteGroupStoragePlan = await planRoutingMuteGroupMetadataStorage(metadata);
      const preparedVersionContent = await this.prepareVersionContentV2(
        normalized.type,
        scope,
        resolvedData,
        muteGroupStoragePlan.metadata,
      );
      const metadataForStorage = normalized.type === 'state'
        ? stripSequencerMetadataFromSoundContent(muteGroupStoragePlan.metadata)
        : muteGroupStoragePlan.metadata;
      const v2MetadataForStorage = preparePresetVersionMetadataForV2Storage(
        stripParameterBehaviorsFromV2Metadata(metadataForStorage),
        normalized.type === 'state',
      );

      const childSpecs = getPresetChildSpecs(normalized.type, scope)
        .filter((childSpec) => {
          if (isSoundOnlySource && childSpec.slot === 'euclideanPattern') return false;
          if (normalized.type === 'kit' && scope === 'granularKit' && /^granularVoice[1-4]$/.test(childSpec.slot)) return false;
          if (normalized.type === 'source' && scope === 'dynamicsBus' && (childSpec.slot === 'eq1' || childSpec.slot === 'eq2')) return false;
          if (normalized.type === 'kit' && scope === 'pad1Kit' && childSpec.slot === 'pad1') return false;
          if (normalized.type === 'kit' && scope === 'pad2Kit' && childSpec.slot === 'pad2') return false;
          return true;
        });
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

      for (const scene of muteGroupStoragePlan.scenes) {
        let target = await this.findMatchingPresetV2(
          ROUTING_MUTE_GROUP_SCENE_DERIVED_TYPE,
          ROUTING_MUTE_GROUP_SCENE_DERIVED_SCOPE,
          scene.hash,
          presetRow?.id,
          { internalDerivedOnly: true },
        );
        if (!target) {
          target = await this.ensureDerivedChildPresetV2(
            ROUTING_MUTE_GROUP_SCENE_DERIVED_TYPE,
            ROUTING_MUTE_GROUP_SCENE_DERIVED_SCOPE,
            scene.hash,
            scene.scene as unknown as Record<string, unknown>,
          );
        }
        if (!target) continue;

        refsToInsert.push({
          slot: scene.refSlot,
          target,
          overrideHash: null,
        });
      }

      const computedRefsBySlot = version.refs
        ? new Map(refsToInsert.map(ref => [ref.slot, ref]))
        : undefined;
      for (const explicitRef of await this.resolveExplicitVersionRefsV2(
        normalized.type,
        scope,
        version.refs,
        presetRow?.id,
        computedRefsBySlot,
      )) {
        const existingIndex = refsToInsert.findIndex(ref => ref.slot === explicitRef.slot);
        if (existingIndex >= 0) {
          refsToInsert[existingIndex] = explicitRef;
          continue;
        }
        refsToInsert.push(explicitRef);
      }

      const childStrippedOverrideData = stripSharedComponentContentFromParent(
        stripReferencedChildData(resolvedData, childRefData),
        normalized.type,
        scope,
      );
      const overrideData = normalized.type === 'state'
        ? stripHarmonyContentFromL4Override(stripPortableSequencerContentFromL4Override(childStrippedOverrideData))
        : childStrippedOverrideData;
      const pendingRefKeys = [
        ...refsToInsert.map(makePendingRefKey),
        ...preparedVersionContent.refs.map(ref => [
          'content', ref.slot, ref.contentType, ref.contentHash,
        ].join(':')),
      ].sort();
      const patch = previousResolvedRecord ? computeRecordPatch(previousResolvedRecord, storageResolvedData) : null;
      const patchBytes = patch ? stableStringifyCanonical(patch).length : 0;
      const snapshotBytes = stableStringifyCanonical(storageResolvedData).length;
      const forceCheckpoint =
        normalized.type === 'state'
        ||
        version.v === 1
        || version.v % VERSION_CHECKPOINT_INTERVAL === 0
        || !patch
        || patchBytes >= snapshotBytes * PATCH_TO_SNAPSHOT_RATIO;
      const storageMode = version.v === 1
        ? 'snapshot'
        : (forceCheckpoint ? 'checkpoint' : 'patch');

      const [nextOverrideHash, nextMetadataHash, nextResolvedHash] = await Promise.all([
        this.hashStorablePayloadV2(overrideData),
        v2MetadataForStorage ? this.hashStorablePayloadV2(v2MetadataForStorage) : Promise.resolve(null),
        normalized.type === 'state' ? Promise.resolve(null) : this.hashStorablePayloadV2(storageResolvedData),
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
        previousResolvedRecord = storageResolvedData;
        continue;
      }

      const [overridePayload, metadataPayload, patchPayload, resolvedPayload] = await Promise.all([
        this.makeStorablePayloadV2('override', overrideData),
        v2MetadataForStorage ? this.makeStorablePayloadV2('metadata', v2MetadataForStorage) : Promise.resolve(null),
        normalized.type !== 'state' && storageMode === 'patch' && patch
          ? this.makeStorablePayloadV2('patch', patch)
          : Promise.resolve(null),
        normalized.type === 'state'
          ? Promise.resolve(null)
          : this.makeStorablePayloadV2('resolved', storageResolvedData),
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
        [overridePayload, metadataPayload, patchPayload, resolvedPayload, ...preparedVersionContent.payloads]
          .filter((payload): payload is StorablePayloadV2 => Boolean(payload)),
        refsToInsert,
        preparedVersionContent.refs,
      );
      presetRow = preset;
      previousStoredVersionRow = versionRow;
      previousResolvedRecord = storageResolvedData;
      previousRefKeys = pendingRefKeys;
    }

  }

  async save(entry: PresetEntry): Promise<void> {
    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
    await this.saveV2(entry);
    this.clearListCache();
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    if (this.shouldSkipReadForCircuit()) return null;

    try {
      if (!(await this.supportsV2())) {
        throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
      }
      if (this.shouldSkipReadForCircuit()) return null;
      return this.loadV2(type, name, scope, version);
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
      if (!(await this.supportsV2())) {
        throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
      }
      if (this.shouldSkipReadForCircuit()) return null;
      const row = await this.findPresetRowByIdV2(targetId);
      return row ? this.loadV2ByRow(row, version) : null;
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

    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
    const renamed = await this.renameV2(type, name, trimmedName, scope, identity);
    this.clearListCache();
    return renamed;
  }

  private async listUncached(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const summaries: PresetSummary[] = [];

    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
    if (this.shouldSkipReadForCircuit()) return summaries;
    return this.listV2(type, scope);
  }

  async delete(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
    await this.deleteV2(type, name, scope);
    this.clearListCache();
  }

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    if (this.shouldSkipReadForCircuit()) return false;
    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
    if (this.shouldSkipReadForCircuit()) return false;
    return this.existsV2(type, name, scope);
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
    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
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

    if (!(await this.supportsV2())) {
      throw new UnsupportedPresetVersionError('Current preset storage is unavailable; legacy cloud preset storage is disabled.');
    }
    if (!this.shouldSkipReadForCircuit()) {
      for (const row of await this.fetchExportRowsV2()) {
        const entry = await this.loadV2ByRow(row);
        if (entry) entries.push(entry);
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
      await this.save(decodeCurrentPresetEntry(entry));
      count += 1;
    }
    return count;
  }
}
