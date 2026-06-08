/**
 * Supabase Client Configuration
 * 
 * To use cloud presets:
 * 1. Create a free Supabase project at https://supabase.com
 * 2. Copy your project URL and anon key from Settings > API
 * 3. Create a .env file with:
 *    VITE_SUPABASE_URL=your-project-url
 *    VITE_SUPABASE_ANON_KEY=your-anon-key
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SliderState } from '../ui/state';
import { getPublicSupabaseConfig } from './config';
import {
  isSupabaseEgressListRefreshPaused,
  supabaseEgressDiagnosticFetch,
} from './supabaseEgressDiagnostics';

const CLOUD_PRESET_SUMMARY_SELECT = [
  'id',
  'name',
  'author',
  'description',
  'created_at',
  'plays',
  'is_featured',
].join(',');

const CLOUD_PRESET_DETAIL_SELECT = [
  ...CLOUD_PRESET_SUMMARY_SELECT.split(','),
  'data',
].join(',');

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

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;

  const { url, anonKey } = getPublicSupabaseConfig();

  if (!url || !anonKey) {
    console.warn('Supabase not configured. Cloud presets disabled.');
    return null;
  }

  if (!/^https?:\/\//i.test(url)) {
    console.warn('Supabase config invalid. VITE_SUPABASE_URL must be only the bare https://... project URL.');
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
  if (isSupabaseEgressListRefreshPaused()) return [];

  const { data, error } = await client
    .from('presets')
    .select(CLOUD_PRESET_SUMMARY_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching presets:', error);
    return [];
  }

  return (data ?? []) as unknown as CloudPresetSummary[];
}

/**
 * Fetch featured presets
 */
export async function fetchFeaturedPresets(): Promise<CloudPresetSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  if (isSupabaseEgressListRefreshPaused()) return [];

  const { data, error } = await client
    .from('presets')
    .select(CLOUD_PRESET_SUMMARY_SELECT)
    .eq('is_featured', true)
    .order('plays', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching featured presets:', error);
    return [];
  }

  return (data ?? []) as unknown as CloudPresetSummary[];
}

/**
 * Search presets by name or author
 */
export async function searchCloudPresets(query: string): Promise<CloudPresetSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  if (isSupabaseEgressListRefreshPaused()) return [];
  const searchTerm = sanitizePostgrestSearchTerm(query);
  if (!searchTerm) return fetchCloudPresets(30);

  const { data, error } = await client
    .from('presets')
    .select(CLOUD_PRESET_SUMMARY_SELECT)
    .or(`name.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
    .order('plays', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error searching presets:', error);
    return [];
  }

  return (data ?? []) as unknown as CloudPresetSummary[];
}

/**
 * Save a new preset to the cloud
 */
export async function saveCloudPreset(preset: CloudPresetInsert): Promise<CloudPreset | null> {
  const client = getSupabase();
  if (!client) return null;
  await ensureCloudAnonymousSession(client);

  const { data, error } = await client
    .from('presets')
    .insert({
      name: preset.name.trim(),
      author: preset.author.trim() || 'Anonymous',
      description: preset.description?.trim() || '',
      data: preset.data,
      plays: 0,
      is_featured: false,
    })
    .select(CLOUD_PRESET_DETAIL_SELECT)
    .single();

  if (error) {
    console.error('Error saving preset:', error);
    throw new Error(error.message);
  }

  return data as unknown as CloudPreset;
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

  const { data, error } = await client
    .from('presets')
    .select(CLOUD_PRESET_DETAIL_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching preset:', error);
    return null;
  }

  return data as unknown as CloudPreset;
}
