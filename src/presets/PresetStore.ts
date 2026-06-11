// src/presets/PresetStore.ts
// Phase 1 — PresetStore abstraction with localStorage backend.
// The async interface allows transparent swap to IndexedDB (Phase 12).

import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import { compressVersions } from './codec';
import {
  buildPresetKeyCandidates,
  getPresetScope,
  isPresetCompatibleWithSlot,
  makePresetKey,
  normalizePresetEntry,
  normalizePresetSummary,
  parsePresetKey,
} from './presetUtils';

const PREFIX = 'preset:';
const LIBRARY_SORT_ORDER = {
  stock: 0,
  user: 1,
  cloud: 2,
} as const;

const LEGACY_DELAY_A_KEY_PATTERN = /"leadDelay(?:ReverbSend|Time|Feedback|Mix|Enabled|Spread|Filter|Send)"/;

function getBrowserPresetStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

// ─── Interface ──────────────────────────────────────────────────────────────

export interface IPresetStore {
  save(entry: PresetEntry): Promise<void>;
  load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null>;
  list(type: PresetLevel, scope?: string): Promise<PresetSummary[]>;
  delete(type: PresetLevel, name: string, scope?: string): Promise<void>;
  exists(type: PresetLevel, name: string, scope?: string): Promise<boolean>;
  /** Find higher-level presets that reference this preset by name */
  findReferences(type: PresetLevel, name: string): Promise<string[]>;
  getStorageUsed(): Promise<{ bytes: number; count: number }>;
  /** Export all presets as a single JSON blob */
  exportAll(): Promise<Blob>;
  /** Import all presets from a JSON string; returns count of imported entries */
  importAll(json: string): Promise<number>;
}

// ─── Key helpers ────────────────────────────────────────────────────────────

function readNormalizedEntry(raw: string): PresetEntry | null {
  try {
    return normalizePresetEntry(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getLogicalKey(entry: PresetEntry): string {
  return makePresetKey(entry.type, entry.name, getPresetScope(entry, entry.type));
}

function compareEntriesByFreshness(left: PresetEntry, right: PresetEntry): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  if (left.currentVersion !== right.currentVersion) return left.currentVersion - right.currentVersion;
  return left.versions.length - right.versions.length;
}

function containsReferenceValue(value: unknown, needle: string): boolean {
  if (value === needle) return true;
  if (Array.isArray(value)) return value.some(item => containsReferenceValue(item, needle));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(item => containsReferenceValue(item, needle));
  }
  return false;
}

// ─── localStorage backend ───────────────────────────────────────────────────

export class LocalStoragePresetStore implements IPresetStore {
  async save(entry: PresetEntry): Promise<void> {
    const storage = getBrowserPresetStorage();
    if (!storage) {
      throw new Error('Preset localStorage backend is unavailable');
    }
    const normalized = normalizePresetEntry(entry);
    if (!normalized) {
      throw new Error('Invalid preset entry');
    }

    // Authoritative version retention/compression lives at the store boundary.
    compressVersions(normalized);
    normalized.updatedAt = Date.now();

    const key = getLogicalKey(normalized);
    for (const candidate of buildPresetKeyCandidates(normalized.type, normalized.name, getPresetScope(normalized, normalized.type))) {
      if (candidate !== key) {
        storage.removeItem(candidate);
      }
    }

    storage.setItem(key, JSON.stringify(normalized));
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    const storage = getBrowserPresetStorage();
    if (!storage) return null;
    for (const key of buildPresetKeyCandidates(type, name, scope)) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const entry = readNormalizedEntry(raw);
      if (!entry || entry.type !== type) continue;
      if (!isPresetCompatibleWithSlot(entry, type, scope)) continue;
      if (LEGACY_DELAY_A_KEY_PATTERN.test(raw)) {
        storage.setItem(key, JSON.stringify(entry));
      }
      if (version !== undefined) {
        const selected = entry.versions.find(v => v.v === version);
        if (!selected) continue;
        return {
          ...entry,
          currentVersion: selected.v,
        };
      }
      return entry;
    }
    return null;
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const storage = getBrowserPresetStorage();
    if (!storage) return [];
    const results = new Map<string, PresetEntry>();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const parsed = parsePresetKey(key);
      if (!parsed) continue;
      if (parsed.type !== type) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const entry = readNormalizedEntry(raw);
      if (!entry) continue;
      if (LEGACY_DELAY_A_KEY_PATTERN.test(raw)) {
        storage.setItem(key, JSON.stringify(entry));
      }
      if (!isPresetCompatibleWithSlot(entry, type, scope)) continue;
      const logicalKey = getLogicalKey(entry);
      const existing = results.get(logicalKey);
      if (!existing || compareEntriesByFreshness(existing, entry) < 0) {
        results.set(logicalKey, entry);
      }
    }
    const summaries = [...results.values()].map(normalizePresetSummary);
    // Sort: stock first, then local user, then cloud mirrors.
    summaries.sort((a, b) => {
      if (a.library !== b.library) return LIBRARY_SORT_ORDER[a.library] - LIBRARY_SORT_ORDER[b.library];
      if (a.familyName !== b.familyName) return a.familyName.localeCompare(b.familyName);
      if ((a.variantRank ?? Number.POSITIVE_INFINITY) !== (b.variantRank ?? Number.POSITIVE_INFINITY)) {
        return (a.variantRank ?? Number.POSITIVE_INFINITY) - (b.variantRank ?? Number.POSITIVE_INFINITY);
      }
      if (a.variantName !== b.variantName) return a.variantName.localeCompare(b.variantName);
      return a.name.localeCompare(b.name);
    });
    return summaries;
  }

  async delete(type: PresetLevel, name: string, scope?: string): Promise<void> {
    const storage = getBrowserPresetStorage();
    if (!storage) return;
    for (const key of buildPresetKeyCandidates(type, name, scope)) {
      storage.removeItem(key);
    }
  }

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    const storage = getBrowserPresetStorage();
    if (!storage) return false;
    for (const key of buildPresetKeyCandidates(type, name, scope)) {
      if (storage.getItem(key) !== null) return true;
    }
    return false;
  }

  async findReferences(_type: PresetLevel, name: string): Promise<string[]> {
    const storage = getBrowserPresetStorage();
    if (!storage) return [];
    const refs: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const entry = readNormalizedEntry(raw);
      if (!entry) continue;
      for (const version of entry.versions) {
        const versionRefs = version.refs ? Object.values(version.refs) : [];
        if (versionRefs.some(ref => ref.name === name || ref.id === name)) {
          refs.push(entry.name);
          break;
        }
        if (containsReferenceValue(version.data, name)) {
          refs.push(entry.name);
          break;
        }
      }
    }
    return [...new Set(refs)];
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    const storage = getBrowserPresetStorage();
    if (!storage) return { bytes: 0, count: 0 };
    let bytes = 0;
    let count = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = storage.getItem(key);
      if (raw) {
        bytes += key.length * 2 + raw.length * 2; // UTF-16
        count++;
      }
    }
    return { bytes, count };
  }

  async exportAll(): Promise<Blob> {
    const storage = getBrowserPresetStorage();
    const entries = new Map<string, PresetEntry>();
    if (storage) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        // Skip system flags
        if (key.includes('factory-loaded') || key.includes('migration-version') || key.includes('storage-backend')) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;
        const entry = readNormalizedEntry(raw);
        if (!entry) continue;
        const logicalKey = getLogicalKey(entry);
        const existing = entries.get(logicalKey);
        if (!existing || compareEntriesByFreshness(existing, entry) < 0) {
          entries.set(logicalKey, entry);
        }
      }
    }
    const payload = {
      kesshoBackup: true,
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      count: entries.size,
      entries: [...entries.values()],
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

// ─── Singleton ──────────────────────────────────────────────────────────────

let _store: IPresetStore | null = null;
const _storeListeners = new Set<() => void>();

export function getPresetStore(): IPresetStore {
  if (!_store) {
    _store = new LocalStoragePresetStore();
  }
  return _store;
}

export function subscribePresetStore(listener: () => void): () => void {
  _storeListeners.add(listener);
  return () => {
    _storeListeners.delete(listener);
  };
}

/**
 * Replace the singleton preset store (e.g. to inject a HybridPresetStore).
 * Called once from App init when Supabase is configured.
 */
export function setPresetStore(store: IPresetStore): void {
  _store = store;
  for (const listener of _storeListeners) {
    listener();
  }
}
