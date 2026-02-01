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

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SliderState } from '../ui/state';

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

export interface CloudPresetInsert {
  name: string;
  author: string;
  description?: string;
  data: SliderState;
}

// Supabase client singleton
let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.warn('Supabase not configured. Cloud presets disabled.');
    return null;
  }

  supabase = createClient(url, anonKey);
  return supabase;
}

export function isCloudEnabled(): boolean {
  return !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
}

/**
 * Fetch all public presets (newest first)
 */
export async function fetchCloudPresets(limit = 50): Promise<CloudPreset[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from('presets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching presets:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch featured presets
 */
export async function fetchFeaturedPresets(): Promise<CloudPreset[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from('presets')
    .select('*')
    .eq('is_featured', true)
    .order('plays', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching featured presets:', error);
    return [];
  }

  return data || [];
}

/**
 * Search presets by name or author
 */
export async function searchCloudPresets(query: string): Promise<CloudPreset[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from('presets')
    .select('*')
    .or(`name.ilike.%${query}%,author.ilike.%${query}%,description.ilike.%${query}%`)
    .order('plays', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error searching presets:', error);
    return [];
  }

  return data || [];
}

/**
 * Save a new preset to the cloud
 */
export async function saveCloudPreset(preset: CloudPresetInsert): Promise<CloudPreset | null> {
  const client = getSupabase();
  if (!client) return null;

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
    .select()
    .single();

  if (error) {
    console.error('Error saving preset:', error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Increment play count when a preset is loaded
 */
export async function incrementPresetPlays(presetId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;

  await client.rpc('increment_plays', { preset_id: presetId });
}

/**
 * Get a single preset by ID (for sharing links)
 */
export async function fetchPresetById(id: string): Promise<CloudPreset | null> {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('presets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching preset:', error);
    return null;
  }

  return data;
}
