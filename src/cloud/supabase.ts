/**
 * Supabase Client Configuration
 * 
 * To use cloud presets:
 * 1. Create a free Supabase project at https://supabase.com
 * 2. Copy your project URL and anon key from Settings > API
 * 3. Create a .env file with:
 *    VITE_SUPABASE_URL=your-project-url
 *    VITE_SUPABASE_ANON_KEY=your-anon-key
 *    Vercel builds may also use NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SliderState } from '../ui/state';
import { getPublicSupabaseConfig } from './config';
import {
  isSupabaseEgressListRefreshPaused,
  supabaseEgressDiagnosticFetch,
} from './supabaseEgressDiagnostics';
import { LEGACY_CLOUD_CARD_SELECT } from './presetSelects';
import {
  canonicalizeRecord,
  collectPresetPayloadHashesV2,
  hashCanonicalJsonText,
  readPresetPayloadCacheV2,
  writePresetPayloadCacheV2,
  type PresetPayloadV2Row,
} from '../presets/presetStorageV2';

// Types for cloud presets
export interface CloudPreset {
  id: string;
  name: string;
  author: string;
  description: string;
  data: SliderState;
  created_at: string;
  plays: number;
  is_featured: boolean;
}

export type CloudPresetSummary = Omit<CloudPreset, 'data'>;

type LegacyCloudPresetSummaryRow = {
  id: string;
  name: string;
  author?: string | null;
  description?: string | null;
  created_at: string;
  plays?: number | null;
  visibility?: string | null;
};

type LegacyCloudPresetDetailRow = LegacyCloudPresetSummaryRow & {
  versions?: Array<{ v?: number; data?: SliderState }> | null;
  current_version?: number | null;
};

export interface CloudPresetInsert {
  name: string;
  author: string;
  description?: string;
  data: SliderState;
}

export interface CloudPresetPage {
  items: CloudPresetSummary[];
  nextCursor: string | null;
}

interface CloudPresetPageOptions {
  limit?: number;
  cursor?: string | null;
}

export const CLOUD_PRESET_PAGE_SIZE = 24;
export const CLOUD_SEARCH_PAGE_SIZE = 20;
export const CLOUD_FEATURED_PAGE_SIZE = 10;
const CLOUD_PRESET_MAX_PAGE_SIZE = 50;

// Supabase client singleton
let supabase: SupabaseClient | null = null;
type CloudSessionUser = { id: string; isAnonymous: boolean };
let cloudAnonymousSessionInFlight: Promise<CloudSessionUser | null> | null = null;
let legacyPresetDetailRpcAvailable: boolean | null = null;
let latestPresetManifestRpcAvailable: boolean | null = null;
let missingPresetPayloadRpcAvailable: boolean | null = null;
const CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000;
const CLOUD_PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000;
const CLOUD_PRESET_LIST_SESSION_CACHE_PREFIX = 'kessho:legacyCloudPresetList:v1:';
const PLAY_INCREMENT_SESSION_PREFIX = 'kessho:presetPlayIncrement:v1:';
const PLAY_INCREMENT_TTL_MS = 24 * 60 * 60 * 1000;

type LegacyCloudPresetCursor = {
  id: string;
  created_at?: string;
  plays?: number | null;
};

type PresetLatestManifestV2 = {
  preset?: {
    id?: string;
    name?: string;
    author?: string | null;
    creator?: string | null;
    description?: string | null;
    visibility?: string | null;
    play_count?: number | null;
    created_at?: string;
    updated_at?: string;
  };
  latest_version?: {
    resolved_hash?: string | null;
    metadata_hash?: string | null;
    override_hash?: string | null;
    patch_from_prev_hash?: string | null;
  };
  required_hashes?: string[];
};

type CachedCloudPresetSummaryList = {
  expiresAt: number;
  summaries: CloudPresetSummary[];
  nextCursor: string | null;
};
const cloudPresetListCache = new Map<string, CachedCloudPresetSummaryList>();

function cloneCloudPresetSummaries(summaries: CloudPresetSummary[]): CloudPresetSummary[] {
  return summaries.map(summary => ({ ...summary }));
}

function legacySummaryToCloudPresetSummary(row: LegacyCloudPresetSummaryRow): CloudPresetSummary {
  return {
    id: row.id,
    name: row.name,
    author: row.author || 'Anonymous',
    description: row.description || '',
    created_at: row.created_at,
    plays: row.plays ?? 0,
    is_featured: row.visibility === 'featured',
  };
}

function legacyDetailToCloudPreset(row: LegacyCloudPresetDetailRow): CloudPreset {
  const versions = Array.isArray(row.versions) ? row.versions : [];
  const current = versions.find(version => version.v === row.current_version) ?? versions[versions.length - 1];
  return {
    ...legacySummaryToCloudPresetSummary(row),
    data: (current?.data ?? {}) as SliderState,
  };
}

function canUseCloudPresetSessionCache(): boolean {
  return typeof sessionStorage !== 'undefined';
}

function readCloudPresetSessionCache(key: string, now: number): CachedCloudPresetSummaryList | null {
  if (!canUseCloudPresetSessionCache()) return null;
  const storageKey = `${CLOUD_PRESET_LIST_SESSION_CACHE_PREFIX}${key}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCloudPresetSummaryList> | null;
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
      summaries: cloneCloudPresetSummaries(parsed.summaries as CloudPresetSummary[]),
      nextCursor: typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null,
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

function readCloudPresetListCache(key: string): CloudPresetPage | null {
  const now = Date.now();
  const memory = cloudPresetListCache.get(key);
  if (memory && memory.expiresAt > now) {
    return {
      items: cloneCloudPresetSummaries(memory.summaries),
      nextCursor: memory.nextCursor,
    };
  }

  const sessionCached = readCloudPresetSessionCache(key, now);
  if (!sessionCached) return null;
  cloudPresetListCache.set(key, {
    expiresAt: Math.min(sessionCached.expiresAt, now + CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS),
    summaries: cloneCloudPresetSummaries(sessionCached.summaries),
    nextCursor: sessionCached.nextCursor,
  });
  return {
    items: cloneCloudPresetSummaries(sessionCached.summaries),
    nextCursor: sessionCached.nextCursor,
  };
}

function writeCloudPresetListCache(key: string, page: CloudPresetPage): void {
  const cloned = cloneCloudPresetSummaries(page.items);
  cloudPresetListCache.set(key, {
    expiresAt: Date.now() + CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS,
    summaries: cloned,
    nextCursor: page.nextCursor,
  });
  if (!canUseCloudPresetSessionCache()) return;
  try {
    sessionStorage.setItem(
      `${CLOUD_PRESET_LIST_SESSION_CACHE_PREFIX}${key}`,
      JSON.stringify({
        expiresAt: Date.now() + CLOUD_PRESET_LIST_SESSION_CACHE_TTL_MS,
        summaries: cloned,
        nextCursor: page.nextCursor,
      }),
    );
  } catch {
    // Storage quota or privacy mode failures should not break cloud reads.
  }
}

function clearCloudPresetListCache(): void {
  cloudPresetListCache.clear();
  if (!canUseCloudPresetSessionCache()) return;
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(CLOUD_PRESET_LIST_SESSION_CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage cleanup is best-effort.
  }
}

function clampCloudPresetLimit(limit: number | undefined, fallback: number): number {
  if (!Number.isFinite(limit ?? fallback)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit ?? fallback), CLOUD_PRESET_MAX_PAGE_SIZE));
}

function encodeCloudPresetCursor(cursor: LegacyCloudPresetCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodeCloudPresetCursor(cursor: string | null | undefined): LegacyCloudPresetCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor)) as Partial<LegacyCloudPresetCursor> | null;
    if (!parsed || typeof parsed.id !== 'string') return null;
    return {
      id: parsed.id,
      created_at: typeof parsed.created_at === 'string' ? parsed.created_at : undefined,
      plays: typeof parsed.plays === 'number' || parsed.plays === null ? parsed.plays : undefined,
    };
  } catch {
    return null;
  }
}

function getCloudPresetPlaysCursorFilter(cursor: LegacyCloudPresetCursor): string | null {
  if (cursor.plays === null) return `and(plays.is.null,id.lt.${cursor.id})`;
  if (typeof cursor.plays !== 'number') return null;
  return `plays.lt.${cursor.plays},plays.is.null,and(plays.eq.${cursor.plays},id.lt.${cursor.id})`;
}

function getCloudPresetPageResult(
  rows: LegacyCloudPresetSummaryRow[],
  limit: number,
  cursorMode: 'created_at' | 'plays',
): CloudPresetPage {
  const summaries = rows.map(legacySummaryToCloudPresetSummary);
  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last
    ? encodeCloudPresetCursor(cursorMode === 'created_at' ? {
        id: last.id,
        created_at: last.created_at,
      } : {
        id: last.id,
        plays: last.plays ?? null,
      })
    : null;
  return {
    items: cloneCloudPresetSummaries(summaries),
    nextCursor,
  };
}

function canUsePlayIncrementSessionCache(): boolean {
  return typeof sessionStorage !== 'undefined';
}

function shouldIncrementPresetPlayThisSession(presetId: string, now = Date.now()): boolean {
  if (!canUsePlayIncrementSessionCache()) return true;
  const storageKey = `${PLAY_INCREMENT_SESSION_PREFIX}${presetId}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    const previous = raw ? Number(raw) : 0;
    if (Number.isFinite(previous) && previous + PLAY_INCREMENT_TTL_MS > now) return false;
    sessionStorage.setItem(storageKey, String(now));
    return true;
  } catch {
    return true;
  }
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

function isMissingRpcError(error: unknown, functionName: string): boolean {
  const text = getSupabaseErrorText(error);
  return text.includes('pgrst202')
    || text.includes('schema cache')
    || text.includes(`could not find the function public.${functionName}`.toLowerCase())
    || text.includes(`function public.${functionName}`)
    || (text.includes('unsupported fake rpc') && text.includes(functionName.toLowerCase()))
    || (text.includes('function') && text.includes(functionName.toLowerCase()) && text.includes('does not exist'));
}

async function fetchPresetByIdRpc(client: SupabaseClient, id: string): Promise<CloudPreset | null | undefined> {
  if (legacyPresetDetailRpcAvailable === false) return undefined;

  const functionName = 'kessho_get_legacy_preset_detail';
  const { data, error } = await client.rpc(functionName, {
    target_preset_id: id,
    target_type: null,
    target_name: null,
    target_scopes: null,
  });

  if (error) {
    if (isMissingRpcError(error, functionName)) {
      legacyPresetDetailRpcAvailable = false;
      return undefined;
    }
    console.error('Error fetching preset through detail RPC:', error);
    return null;
  }

  legacyPresetDetailRpcAvailable = true;
  return data ? legacyDetailToCloudPreset(data as unknown as LegacyCloudPresetDetailRow) : null;
}

async function fetchMissingPresetPayloadsV2(
  client: SupabaseClient,
  hashes: string[],
): Promise<Map<string, unknown>> {
  const uniqueHashes = collectPresetPayloadHashesV2(hashes);
  const payloadMap = new Map<string, unknown>();
  const missingHashes: string[] = [];

  for (const hash of uniqueHashes) {
    const cached = readPresetPayloadCacheV2(hash);
    if (cached !== undefined) {
      payloadMap.set(hash, cached);
    } else {
      missingHashes.push(hash);
    }
  }

  if (!missingHashes.length) return payloadMap;

  const functionName = missingPresetPayloadRpcAvailable === false
    ? 'kessho_get_preset_payloads_v2'
    : 'kessho_get_missing_preset_payloads_v2';
  const { data, error } = await client.rpc(functionName, {
    target_hashes: missingHashes,
  });

  if (error) {
    if (functionName === 'kessho_get_missing_preset_payloads_v2' && isMissingRpcError(error, functionName)) {
      missingPresetPayloadRpcAvailable = false;
      return fetchMissingPresetPayloadsV2(client, missingHashes);
    }
    throw new Error(`V2 preset payload fetch failed: ${error.message}`);
  }

  if (functionName === 'kessho_get_missing_preset_payloads_v2') {
    missingPresetPayloadRpcAvailable = true;
  }

  for (const row of (data ?? []) as unknown as PresetPayloadV2Row[]) {
    if (!row || typeof row.hash !== 'string' || !('payload' in row)) continue;
    payloadMap.set(row.hash, row.payload);
    await writePresetPayloadCacheV2(row.hash, row.payload);
  }

  return payloadMap;
}

async function fetchPresetByIdLatestV2Rpc(client: SupabaseClient, id: string): Promise<CloudPreset | null | undefined> {
  if (latestPresetManifestRpcAvailable === false) return undefined;

  const functionName = 'kessho_get_preset_latest_manifest_v2';
  const { data, error } = await client.rpc(functionName, {
    target_preset_id: id,
  });

  if (error) {
    if (isMissingRpcError(error, functionName)) {
      latestPresetManifestRpcAvailable = false;
      return undefined;
    }
    throw new Error(`V2 preset manifest fetch failed: ${error.message}`);
  }

  latestPresetManifestRpcAvailable = true;
  const manifest = data as PresetLatestManifestV2 | null;
  const preset = manifest?.preset;
  const latestVersion = manifest?.latest_version;
  const resolvedHash = latestVersion?.resolved_hash ?? null;
  if (!preset?.id || !resolvedHash) return null;

  const requiredHashes = Array.isArray(manifest?.required_hashes)
    ? manifest.required_hashes
    : [resolvedHash, latestVersion?.metadata_hash, latestVersion?.override_hash, latestVersion?.patch_from_prev_hash]
        .filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);
  const payloadMap = await fetchMissingPresetPayloadsV2(client, requiredHashes);
  const resolvedPayload = payloadMap.get(resolvedHash);
  if (!resolvedPayload || typeof resolvedPayload !== 'object' || Array.isArray(resolvedPayload)) {
    return null;
  }

  return {
    id: preset.id,
    name: preset.name || 'Untitled Preset',
    author: preset.creator || preset.author || 'Anonymous',
    description: preset.description || '',
    data: resolvedPayload as SliderState,
    created_at: preset.created_at || new Date().toISOString(),
    plays: preset.play_count ?? 0,
    is_featured: preset.visibility === 'featured',
  };
}

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;

  const { url, anonKey } = getPublicSupabaseConfig();

  if (!url || !anonKey) {
    console.warn(
      'Supabase not configured. Cloud presets disabled. Set VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
    return null;
  }

  if (!/^https?:\/\//i.test(url)) {
    console.warn('Supabase config invalid. The Supabase URL must be only the bare https://... project URL.');
    return null;
  }

  supabase = createClient(url, anonKey, {
    global: {
      fetch: supabaseEgressDiagnosticFetch,
    },
  });
  return supabase;
}

export { isCloudEnabled } from './config';

export async function ensureCloudAnonymousSession(client = getSupabase()): Promise<CloudSessionUser | null> {
  if (!client) return null;

  const { data: { session } } = await client.auth.getSession();
  if (session?.user) {
    return {
      id: session.user.id,
      isAnonymous: session.user.is_anonymous ?? false,
    };
  }

  if (!cloudAnonymousSessionInFlight) {
    cloudAnonymousSessionInFlight = client.auth.signInAnonymously()
      .then(({ data, error }) => {
        if (error) throw new Error(`Anonymous auth failed: ${error.message}`);
        return data.user
          ? { id: data.user.id, isAnonymous: true }
          : null;
      })
      .finally(() => {
        cloudAnonymousSessionInFlight = null;
      });
  }

  return cloudAnonymousSessionInFlight;
}

function sanitizePostgrestSearchTerm(query: string): string {
  return query
    .trim()
    .slice(0, 80)
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch one page of public presets (newest first)
 */
export async function fetchCloudPresetPage(options?: CloudPresetPageOptions): Promise<CloudPresetPage> {
  const pageOptions = options ?? {};
  const client = getSupabase();
  if (!client) return { items: [], nextCursor: null };
  const limit = clampCloudPresetLimit(pageOptions.limit, CLOUD_PRESET_PAGE_SIZE);
  const cursor = decodeCloudPresetCursor(pageOptions.cursor);
  const cacheKey = `browse:created_at:${limit}:${pageOptions.cursor ?? 'first'}`;
  const cached = readCloudPresetListCache(cacheKey);
  if (cached) return cached;
  if (isSupabaseEgressListRefreshPaused()) return { items: [], nextCursor: null };

  let query = client
    .from('legacy_preset_summaries')
    .select(LEGACY_CLOUD_CARD_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (cursor?.created_at) {
    query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  }
  const { data, error } = await query;

  if (error) {
    console.error('Error fetching presets:', error);
    return { items: [], nextCursor: null };
  }

  const rows = (data ?? []) as unknown as LegacyCloudPresetSummaryRow[];
  const page = getCloudPresetPageResult(rows, limit, 'created_at');
  writeCloudPresetListCache(cacheKey, page);
  return page;
}

/**
 * Fetch all public presets for compatibility with older callers.
 */
export async function fetchCloudPresets(limit = CLOUD_PRESET_PAGE_SIZE): Promise<CloudPresetSummary[]> {
  return (await fetchCloudPresetPage({ limit })).items;
}

/**
 * Fetch featured presets
 */
export async function fetchFeaturedPresetPage(options?: CloudPresetPageOptions): Promise<CloudPresetPage> {
  const pageOptions = options ?? {};
  const client = getSupabase();
  if (!client) return { items: [], nextCursor: null };
  const limit = clampCloudPresetLimit(pageOptions.limit, CLOUD_FEATURED_PAGE_SIZE);
  const cursor = decodeCloudPresetCursor(pageOptions.cursor);
  const cacheKey = `featured:plays:${limit}:${pageOptions.cursor ?? 'first'}`;
  const cached = readCloudPresetListCache(cacheKey);
  if (cached) return cached;
  if (isSupabaseEgressListRefreshPaused()) return { items: [], nextCursor: null };

  let query = client
    .from('legacy_preset_summaries')
    .select(LEGACY_CLOUD_CARD_SELECT)
    .eq('visibility', 'featured')
    .order('plays', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit);
  const cursorFilter = cursor ? getCloudPresetPlaysCursorFilter(cursor) : null;
  if (cursorFilter) {
    query = query.or(cursorFilter);
  }
  const { data, error } = await query;

  if (error) {
    console.error('Error fetching featured presets:', error);
    return { items: [], nextCursor: null };
  }

  const rows = (data ?? []) as unknown as LegacyCloudPresetSummaryRow[];
  const page = getCloudPresetPageResult(rows, limit, 'plays');
  writeCloudPresetListCache(cacheKey, page);
  return page;
}

export async function fetchFeaturedPresets(): Promise<CloudPresetSummary[]> {
  return (await fetchFeaturedPresetPage()).items;
}

/**
 * Search presets by name or author
 */
export async function searchCloudPresetPage(query: string, options?: CloudPresetPageOptions): Promise<CloudPresetPage> {
  const pageOptions = options ?? {};
  const client = getSupabase();
  if (!client) return { items: [], nextCursor: null };
  const searchTerm = sanitizePostgrestSearchTerm(query);
  if (!searchTerm) return fetchCloudPresetPage({ limit: pageOptions.limit ?? CLOUD_PRESET_PAGE_SIZE, cursor: pageOptions.cursor });
  const limit = clampCloudPresetLimit(pageOptions.limit, CLOUD_SEARCH_PAGE_SIZE);
  const cursor = decodeCloudPresetCursor(pageOptions.cursor);
  const cacheKey = `search:${searchTerm}:plays:${limit}:${pageOptions.cursor ?? 'first'}`;
  const cached = readCloudPresetListCache(cacheKey);
  if (cached) return cached;
  if (isSupabaseEgressListRefreshPaused()) return { items: [], nextCursor: null };

  let search = client
    .from('legacy_preset_summaries')
    .select(LEGACY_CLOUD_CARD_SELECT)
    .or(`name.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
    .order('plays', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit);
  const cursorFilter = cursor ? getCloudPresetPlaysCursorFilter(cursor) : null;
  if (cursorFilter) {
    search = search.or(cursorFilter);
  }
  const { data, error } = await search;

  if (error) {
    console.error('Error searching presets:', error);
    return { items: [], nextCursor: null };
  }

  const rows = (data ?? []) as unknown as LegacyCloudPresetSummaryRow[];
  const page = getCloudPresetPageResult(rows, limit, 'plays');
  writeCloudPresetListCache(cacheKey, page);
  return page;
}

export async function searchCloudPresets(query: string): Promise<CloudPresetSummary[]> {
  return (await searchCloudPresetPage(query)).items;
}

async function findExistingCloudPresetV2(
  client: SupabaseClient,
  name: string,
): Promise<{ id: string; latest_version_no: number } | null> {
  const { data: presetId, error: idError } = await client.rpc('kessho_lookup_preset_id_v2', {
    target_type: 'state',
    target_name: name,
    target_scope: 'global',
    target_resolved_hash: null,
  });

  if (idError) {
    // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: temporary compatibility fallback for hosted databases before the narrow id/card RPC migration is applied.
    if (isMissingRpcError(idError, 'kessho_lookup_preset_id_v2')) return findExistingCloudPresetV2ViaRows(client, name);
    throw new Error(`V2 cloud preset id lookup failed: ${idError.message}`);
  }

  if (typeof presetId !== 'string' || !presetId) return null;

  const { data: card, error: cardError } = await client.rpc('kessho_get_preset_card_v2', {
    target_preset_id: presetId,
  });

  if (cardError) {
    // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: temporary compatibility fallback for hosted databases before the narrow card RPC migration is applied.
    if (isMissingRpcError(cardError, 'kessho_get_preset_card_v2')) return findExistingCloudPresetV2ViaRows(client, name);
    throw new Error(`V2 cloud preset card lookup failed: ${cardError.message}`);
  }

  const row = card as { id?: unknown; latest_version_no?: unknown } | null;
  if (!row || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    latest_version_no: typeof row.latest_version_no === 'number' ? row.latest_version_no : 0,
  };
}

async function findExistingCloudPresetV2ViaRows(
  client: SupabaseClient,
  name: string,
): Promise<{ id: string; latest_version_no: number } | null> {
  // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: pre-migration fallback only; save preflight normally uses kessho_lookup_preset_id_v2 + kessho_get_preset_card_v2.
  const { data, error } = await client.rpc('kessho_lookup_preset_rows_v2', {
    target_preset_id: null,
    target_type: 'state',
    target_name: name,
    target_scopes: ['global'],
    target_scope_is_null: false,
    target_resolved_hash: null,
    exclude_preset_id: null,
    include_deleted: false,
    deleted_only: false,
    include_internal_derived: false,
    internal_derived_only: false,
    max_rows: 1,
    page_offset: 0,
  });

  if (error) {
    // ALLOW_CONSTRAINED_RUNTIME_LOOKUP: checking optional constrained lookup RPC availability.
    if (isMissingRpcError(error, 'kessho_lookup_preset_rows_v2')) return null;
    throw new Error(`V2 cloud preset lookup failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] as { id?: unknown; latest_version_no?: unknown } | undefined : undefined;
  if (!row || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    latest_version_no: typeof row.latest_version_no === 'number' ? row.latest_version_no : 0,
  };
}

/**
 * Save a new preset to the cloud
 */
export async function saveCloudPreset(preset: CloudPresetInsert): Promise<CloudPreset | null> {
  const client = getSupabase();
  if (!client) return null;
  const session = await ensureCloudAnonymousSession(client);
  if (!session) throw new Error('Anonymous cloud session required');

  const now = new Date().toISOString();
  const name = preset.name.trim();
  const displayAuthor = preset.author.trim() || 'Anonymous';
  const description = preset.description?.trim() || '';
  const savedData = preset.data;
  const resolvedPayload = canonicalizeRecord(savedData as unknown as Record<string, unknown>);
  const metadataPayload = canonicalizeRecord({
    name,
    author: displayAuthor,
    description,
  });
  const resolvedPayloadJson = JSON.stringify(resolvedPayload);
  const metadataPayloadJson = JSON.stringify(metadataPayload);
  const [resolvedHash, metadataHash, existing] = await Promise.all([
    hashCanonicalJsonText(resolvedPayloadJson),
    hashCanonicalJsonText(metadataPayloadJson),
    findExistingCloudPresetV2(client, name),
  ]);

  const identity_payload = {
    id: existing?.id ?? null,
    type: 'state',
    scope: 'global',
    name,
    author: 'cloud',
    library: 'cloud',
    creator: displayAuthor,
    description,
    tags: [],
    visibility: 'public',
    owner_key: 'public',
    owner_user_id: session.id,
    family_name: name,
    variant_name: name,
    variant_rank: null,
    forked_from: null,
    rating: null,
  };

  const version_payload = {
    version_no: (existing?.latest_version_no ?? 0) + 1,
    storage_mode: 'snapshot',
    note: '',
    override_hash: null,
    metadata_hash: metadataHash,
    patch_from_prev_hash: null,
    resolved_hash: resolvedHash,
    is_checkpoint: true,
    created_at: now,
  };

  const payloads_payload = [
    { hash: resolvedHash, payload_kind: 'resolved', payload: resolvedPayload },
    { hash: metadataHash, payload_kind: 'metadata', payload: metadataPayload },
  ];

  const { data, error } = await client.rpc('kessho_save_preset_v2', {
    identity_payload,
    version_payload,
    payloads_payload,
    refs_payload: [],
  });

  if (error) {
    console.error('Error saving preset:', error);
    throw new Error(error.message);
  }

  const result = data as { preset?: { id?: string; created_at?: string } } | null;
  const id = result?.preset?.id;
  if (!id) {
    throw new Error('V2 cloud preset save failed: missing preset id.');
  }

  await Promise.all([
    writePresetPayloadCacheV2(resolvedHash, resolvedPayload, { verifiedCanonicalJson: resolvedPayloadJson }),
    writePresetPayloadCacheV2(metadataHash, metadataPayload, { verifiedCanonicalJson: metadataPayloadJson }),
  ]);

  clearCloudPresetListCache();
  return {
    id,
    name,
    author: displayAuthor,
    description,
    data: savedData,
    created_at: result?.preset?.created_at ?? now,
    plays: 0,
    is_featured: false,
  };
}

/**
 * Increment play count when a preset is loaded
 */
export async function incrementPresetPlays(presetId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  if (!shouldIncrementPresetPlayThisSession(presetId)) return;

  try {
    await ensureCloudAnonymousSession(client);
    await client.rpc('increment_plays', { preset_id: presetId });
  } catch (error) {
    console.warn('Could not increment preset plays:', error);
  }
}

/**
 * Get a single preset by ID (for sharing links)
 */
export async function fetchPresetById(id: string): Promise<CloudPreset | null> {
  const client = getSupabase();
  if (!client) return null;

  await ensureCloudAnonymousSession(client);
  const v2Preset = await fetchPresetByIdLatestV2Rpc(client, id);
  if (v2Preset) return v2Preset;
  const rpcPreset = await fetchPresetByIdRpc(client, id);
  if (rpcPreset !== undefined) return rpcPreset;
  return null;
}
