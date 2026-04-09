// src/presets/SupabasePresetStore.ts
// Cloud preset store backed by Supabase.
// Implements IPresetStore so it plugs directly into PresetDropdown/usePresets.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import type { IPresetStore } from './PresetStore';
import { compressVersions } from './codec';
import { normalizePresetEntry, normalizePresetSummary, getPresetScope } from './presetUtils';

const LEGACY_DELAY_A_KEY_PATTERN = /"leadDelay(?:ReverbSend|Time|Feedback|Mix|Enabled|Spread|Filter|Send)"/;

/** Row shape returned from the Supabase `presets` table */
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
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function getRowLogicalKey(row: PresetRow): string {
  return `${row.type}:${row.scope ?? ''}:${normalizeNameKey(row.name)}`;
}

function comparePresetRowPriority(left: PresetRow, right: PresetRow, userId: string | null): number {
  const leftOwn = !!userId && left.user_id === userId;
  const rightOwn = !!userId && right.user_id === userId;
  if (leftOwn !== rightOwn) return leftOwn ? -1 : 1;

  const leftVisibilityRank = left.visibility === 'featured' ? 1 : 0;
  const rightVisibilityRank = right.visibility === 'featured' ? 1 : 0;
  if (leftVisibilityRank !== rightVisibilityRank) return rightVisibilityRank - leftVisibilityRank;

  const leftUpdated = new Date(left.updated_at).getTime();
  const rightUpdated = new Date(right.updated_at).getTime();
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  const leftCreated = new Date(left.created_at).getTime();
  const rightCreated = new Date(right.created_at).getTime();
  return rightCreated - leftCreated;
}

function dedupePreferredRows(rows: PresetRow[], userId: string | null): PresetRow[] {
  const preferred = new Map<string, PresetRow>();
  for (const row of rows) {
    const key = getRowLogicalKey(row);
    const existing = preferred.get(key);
    if (!existing || comparePresetRowPriority(row, existing, userId) < 0) {
      preferred.set(key, row);
    }
  }
  return Array.from(preferred.values()).sort((left, right) => comparePresetRowPriority(left, right, userId));
}

function rowToEntry(row: PresetRow): PresetEntry {
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
  })!;
}

function entryToRow(entry: PresetEntry, userId: string | null): Record<string, unknown> {
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
  };
}

export class SupabasePresetStore implements IPresetStore {
  private client: SupabaseClient;
  private userId: string | null = null;
  private isAnonymous = false;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** Set the authenticated user ID. Call after auth state changes. */
  setUserId(userId: string | null, anonymous = false): void {
    this.userId = userId;
    this.isAnonymous = anonymous;
  }

  private async rewriteLegacyDelayAKeysIfOwned(row: PresetRow, entry: PresetEntry): Promise<void> {
    if (!this.userId || row.user_id !== this.userId) return;
    if (!LEGACY_DELAY_A_KEY_PATTERN.test(JSON.stringify(row.versions ?? null))) return;

    const payload = entryToRow(entry, row.user_id);
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

  async save(entry: PresetEntry): Promise<void> {
    const normalized = normalizePresetEntry(entry);
    if (!normalized) throw new Error('Invalid preset entry');

    // Authoritative version retention/compression lives at the store boundary.
    compressVersions(normalized);

    const scope = getPresetScope(normalized, normalized.type);
    const row = entryToRow(normalized, this.userId);    // Anonymous users default to public so presets work cross-device
    if (this.isAnonymous && !normalized.visibility) {
      row.visibility = 'public';
    }
    // Select-then-insert/update because PostgREST upsert doesn't support
    // functional unique indexes (COALESCE(scope, '')).
    let existingQuery = this.client
      .from('presets')
      .select('id')
      .eq('type', normalized.type)
      .eq('name', normalized.name);
    
    if (this.userId) existingQuery = existingQuery.eq('user_id', this.userId);
    else existingQuery = existingQuery.is('user_id', null);
    
    if (scope) existingQuery = existingQuery.eq('scope', scope);
    else existingQuery = existingQuery.is('scope', null);

    const { data: existing } = await existingQuery.limit(1).maybeSingle();

    let error;
    if (existing) {
      // Don't overwrite user_id on update
      delete row.user_id;
      const res = await this.client.from('presets').update(row).eq('id', existing.id);
      error = res.error;
      console.log('Cloud update:', existing.id, error ? `FAILED: ${error.message}` : 'OK');
    } else {
      const res = await this.client.from('presets').insert(row);
      error = res.error;
      console.log('Cloud insert:', normalized.name, error ? `FAILED: ${error.message}` : 'OK');
    }

    if (error) {
      console.error('SupabasePresetStore.save error:', error);
      throw new Error(`Cloud save failed: ${error.message}`);
    }
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    let query = this.client
      .from('presets')
      .select('*')
      .eq('type', type)
      .eq('name', name);

    if (scope) query = query.eq('scope', scope);
    else query = query.is('scope', null);

    // Prefer own presets, then public
    if (this.userId) {
      query = query.or(`user_id.eq.${this.userId},visibility.in.(public,featured)`);
    } else {
      query = query.in('visibility', ['public', 'featured']);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    const rows = dedupePreferredRows(data as PresetRow[], this.userId);
    const row = rows[0];
    if (!row) return null;
    const entry = rowToEntry(row);
    await this.rewriteLegacyDelayAKeysIfOwned(row, entry);
    if (version !== undefined) {
      const selected = entry.versions.find(v => v.v === version);
      if (!selected) return null;
      return { ...entry, currentVersion: selected.v };
    }
    return entry;
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    let query = this.client
      .from('presets')
      .select('*')
      .eq('type', type);

    if (scope) query = query.eq('scope', scope);

    // Show own presets + public presets
    if (this.userId) {
      query = query.or(`user_id.eq.${this.userId},visibility.in.(public,featured)`);
    } else {
      query = query.in('visibility', ['public', 'featured']);
    }

    query = query.order('updated_at', { ascending: false }).limit(200);

    const { data, error } = await query;
    if (error) {
      console.error('SupabasePresetStore.list error:', error);
      return [];
    }

    const rows = dedupePreferredRows(data as PresetRow[], this.userId);
    const entries = rows.map(row => rowToEntry(row));
    await Promise.allSettled(entries.map((entry, index) => this.rewriteLegacyDelayAKeysIfOwned(rows[index]!, entry)));

    return entries
      .map(entry => normalizePresetSummary(entry))
      .filter(Boolean) as PresetSummary[];
  }

  async delete(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (!this.userId) return; // Can't delete without auth

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

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    let query = this.client
      .from('presets')
      .select('id')
      .eq('type', type)
      .eq('name', name);

    if (scope) query = query.eq('scope', scope);
    if (this.userId) query = query.eq('user_id', this.userId);

    const { data } = await query.limit(1);
    return !!data && data.length > 0;
  }

  async findReferences(_type: PresetLevel, _name: string): Promise<string[]> {
    // Not implemented for cloud — references are local-only for now
    return [];
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    if (!this.userId) return { bytes: 0, count: 0 };

    const { count, error } = await this.client
      .from('presets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId);

    if (error) return { bytes: 0, count: 0 };
    return { bytes: 0, count: count ?? 0 }; // Can't easily get byte count from Supabase
  }

  async exportAll(): Promise<Blob> {
    const allEntries: PresetEntry[] = [];
    let query = this.client
      .from('presets')
      .select('*');

    if (this.userId) query = query.eq('user_id', this.userId);

    const { data } = await query;
    if (data) {
      for (const row of data as PresetRow[]) {
        allEntries.push(rowToEntry(row));
      }
    }

    const payload = {
      kesshoBackup: true,
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      count: allEntries.length,
      entries: allEntries,
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
      if (normalized) {
        await this.save(normalized);
        count++;
      }
    }
    return count;
  }
}
