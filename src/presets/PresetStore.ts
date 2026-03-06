// src/presets/PresetStore.ts
// Phase 1 — PresetStore abstraction with localStorage backend.
// The async interface allows transparent swap to IndexedDB (Phase 12).

import type { PresetEntry, PresetLevel, PresetSummary } from './types';

// ─── Interface ──────────────────────────────────────────────────────────────

export interface IPresetStore {
  save(entry: PresetEntry): Promise<void>;
  load(type: PresetLevel, name: string, engine?: string): Promise<PresetEntry | null>;
  list(type: PresetLevel, engine?: string): Promise<PresetSummary[]>;
  delete(type: PresetLevel, name: string, engine?: string): Promise<void>;
  exists(type: PresetLevel, name: string, engine?: string): Promise<boolean>;
  /** Find higher-level presets that reference this preset by name */
  findReferences(type: PresetLevel, name: string): Promise<string[]>;
  getStorageUsed(): Promise<{ bytes: number; count: number }>;
  /** Export all presets as a single JSON blob */
  exportAll(): Promise<Blob>;
  /** Import all presets from a JSON string; returns count of imported entries */
  importAll(json: string): Promise<number>;
}

// ─── Key helpers ────────────────────────────────────────────────────────────

const PREFIX = 'preset:';

function makeKey(type: PresetLevel, name: string, engine?: string): string {
  if (engine) return `${PREFIX}${type}:${engine}:${name}`;
  return `${PREFIX}${type}:${name}`;
}

function parseKey(key: string): { type: PresetLevel; engine?: string; name: string } | null {
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const parts = rest.split(':');
  if (parts.length === 2) {
    return { type: parts[0] as PresetLevel, name: parts[1] };
  }
  if (parts.length === 3) {
    return { type: parts[0] as PresetLevel, engine: parts[1], name: parts[2] };
  }
  return null;
}

function toSummary(entry: PresetEntry): PresetSummary {
  return {
    type: entry.type,
    engine: entry.engine,
    source: entry.source,
    name: entry.name,
    author: entry.author,
    tags: entry.tags,
    versionCount: entry.versions.length,
    currentVersion: entry.currentVersion,
    updatedAt: entry.updatedAt,
  };
}

// ─── localStorage backend ───────────────────────────────────────────────────

export class LocalStoragePresetStore implements IPresetStore {
  async save(entry: PresetEntry): Promise<void> {
    const key = makeKey(entry.type, entry.name, entry.engine);
    // Enforce max 20 versions (FIFO eviction)
    if (entry.versions.length > 20) {
      entry.versions = entry.versions.slice(-20);
    }
    entry.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(entry));
  }

  async load(type: PresetLevel, name: string, engine?: string): Promise<PresetEntry | null> {
    const key = makeKey(type, name, engine);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PresetEntry;
    } catch {
      return null;
    }
  }

  async list(type: PresetLevel, engine?: string): Promise<PresetSummary[]> {
    const results: PresetSummary[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const parsed = parseKey(key);
      if (!parsed) continue;
      if (parsed.type !== type) continue;
      if (engine !== undefined && parsed.engine !== engine) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as PresetEntry;
        results.push(toSummary(entry));
      } catch {
        // Skip corrupt entries
      }
    }
    // Sort: factory first (alpha), then user (alpha)
    results.sort((a, b) => {
      if (a.author !== b.author) return a.author === 'factory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return results;
  }

  async delete(type: PresetLevel, name: string, engine?: string): Promise<void> {
    const key = makeKey(type, name, engine);
    localStorage.removeItem(key);
  }

  async exists(type: PresetLevel, name: string, engine?: string): Promise<boolean> {
    const key = makeKey(type, name, engine);
    return localStorage.getItem(key) !== null;
  }

  async findReferences(_type: PresetLevel, name: string): Promise<string[]> {
    const refs: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as PresetEntry;
        // Check if any version references the target by name
        for (const version of entry.versions) {
          if (version.refs) {
            for (const ref of Object.values(version.refs)) {
              if (ref.name === name) {
                refs.push(entry.name);
                break;
              }
            }
          }
        }
      } catch {
        // Skip
      }
    }
    return [...new Set(refs)];
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    let bytes = 0;
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw) {
        bytes += key.length * 2 + raw.length * 2; // UTF-16
        count++;
      }
    }
    return { bytes, count };
  }

  async exportAll(): Promise<Blob> {
    const entries: PresetEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      // Skip system flags
      if (key.includes('factory-loaded') || key.includes('migration-version') || key.includes('storage-backend')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        entries.push(JSON.parse(raw) as PresetEntry);
      } catch {
        // Skip
      }
    }
    const payload = {
      kesshoBackup: true,
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries,
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
      if (entry.type && entry.name && entry.versions) {
        await this.save(entry as PresetEntry);
        count++;
      }
    }
    return count;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _store: IPresetStore | null = null;

export function getPresetStore(): IPresetStore {
  if (!_store) {
    // Phase 12 will check localStorage.getItem('preset:storage-backend')
    // and return IndexedDBPresetStore if 'indexeddb'
    _store = new LocalStoragePresetStore();
  }
  return _store;
}
