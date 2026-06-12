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
import { LEGACY_PRESET_SUMMARY_SELECT } from './presetSelects';

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

// Supabase client singleton
let supabase: SupabaseClient | null = null;
type CloudSessionUser = { id: string; isAnonymous: boolean };
let cloudAnonymousSessionInFlight: Promise<CloudSessionUser | null> | null = null;
let legacyPresetDetailRpcAvailable: boolean | null = null;
const CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000;
const CLOUD_PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000;
const CLOUD_PRESET_LIST_SESSION_CACHE_PREFIX = 'kessho:legacyCloudPresetList:v1:';

type CachedCloudPresetSummaryList = {
  expiresAt: number;
  summaries: CloudPresetSummary[];
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

function readCloudPresetListCache(key: string): CloudPresetSummary[] | null {
  const now = Date.now();
  const memory = cloudPresetListCache.get(key);
  if (memory && memory.expiresAt > now) return cloneCloudPresetSummaries(memory.summaries);

  const sessionCached = readCloudPresetSessionCache(key, now);
  if (!sessionCached) return null;
  cloudPresetListCache.set(key, {
    expiresAt: Math.min(sessionCached.expiresAt, now + CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS),
    summaries: cloneCloudPresetSummaries(sessionCached.summaries),
  });
  return cloneCloudPresetSummaries(sessionCached.summaries);
}

function writeCloudPresetListCache(key: string, summaries: CloudPresetSummary[]): void {
  const cloned = cloneCloudPresetSummaries(summaries);
  cloudPresetListCache.set(key, {
    expiresAt: Date.now() + CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS,
    summaries: cloned,
  });
  if (!canUseCloudPresetSessionCache()) return;
  try {
    sessionStorage.setItem(
      `${CLOUD_PRESET_LIST_SESSION_CACHE_PREFIX}${key}`,
      JSON.stringify({
        expiresAt: Date.now() + CLOUD_PRESET_LIST_SESSION_CACHE_TTL_MS,
        summaries: cloned,
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
 * Fetch all public presets (newest first)
 */
export async function fetchCloudPresets(limit = 50): Promise<CloudPresetSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  const cacheKey = `browse:${limit}`;
  const cached = readCloudPresetListCache(cacheKey);
  if (cached) return cached;
  if (isSupabaseEgressListRefreshPaused()) return [];

  const { data, error } = await client
    .from('legacy_preset_summaries')
    .select(LEGACY_PRESET_SUMMARY_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching presets:', error);
    return [];
  }

  const summaries = ((data ?? []) as unknown as LegacyCloudPresetSummaryRow[]).map(legacySummaryToCloudPresetSummary);
  writeCloudPresetListCache(cacheKey, summaries);
  return cloneCloudPresetSummaries(summaries);
}

/**
 * Fetch featured presets
 */
export async function fetchFeaturedPresets(): Promise<CloudPresetSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  const cacheKey = 'featured:10';
  const cached = readCloudPresetListCache(cacheKey);
  if (cached) return cached;
  if (isSupabaseEgressListRefreshPaused()) return [];

  const { data, error } = await client
    .from('legacy_preset_summaries')
    .select(LEGACY_PRESET_SUMMARY_SELECT)
    .eq('visibility', 'featured')
    .order('plays', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching featured presets:', error);
    return [];
  }

  const summaries = ((data ?? []) as unknown as LegacyCloudPresetSummaryRow[]).map(legacySummaryToCloudPresetSummary);
  writeCloudPresetListCache(cacheKey, summaries);
  return cloneCloudPresetSummaries(summaries);
}

/**
 * Search presets by name or author
 */
export async function searchCloudPresets(query: string): Promise<CloudPresetSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  const searchTerm = sanitizePostgrestSearchTerm(query);
  if (!searchTerm) return fetchCloudPresets(30);
  const cacheKey = `search:${searchTerm}`;
  const cached = readCloudPresetListCache(cacheKey);
  if (cached) return cached;
  if (isSupabaseEgressListRefreshPaused()) return [];

  const { data, error } = await client
    .from('legacy_preset_summaries')
    .select(LEGACY_PRESET_SUMMARY_SELECT)
    .or(`name.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
    .order('plays', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error searching presets:', error);
    return [];
  }

  const summaries = ((data ?? []) as unknown as LegacyCloudPresetSummaryRow[]).map(legacySummaryToCloudPresetSummary);
  writeCloudPresetListCache(cacheKey, summaries);
  return cloneCloudPresetSummaries(summaries);
}

/**
 * Save a new preset to the cloud
 */
export async function saveCloudPreset(preset: CloudPresetInsert): Promise<CloudPreset | null> {
  const client = getSupabase();
  if (!client) return null;
  await ensureCloudAnonymousSession(client);

  const { data, error } = await client.rpc('kessho_save_legacy_preset', {
    preset_payload: {
      name: preset.name.trim(),
      author: preset.author.trim() || 'Anonymous',
      description: preset.description?.trim() || '',
      plays: 0,
      visibility: 'public',
      library: 'cloud',
      creator: 'Anonymous',
      tags: [],
      versions: [{
        v: 1,
        note: '',
        timestamp: Date.now(),
        data: preset.data,
      }],
      current_version: 1,
    },
  });

  if (error) {
    console.error('Error saving preset:', error);
    throw new Error(error.message);
  }

  clearCloudPresetListCache();
  return data ? legacyDetailToCloudPreset(data as unknown as LegacyCloudPresetDetailRow) : null;
}

/**
 * Increment play count when a preset is loaded
 */
export async function incrementPresetPlays(presetId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;

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
  const rpcPreset = await fetchPresetByIdRpc(client, id);
  if (rpcPreset !== undefined) return rpcPreset;
  return null;
}
