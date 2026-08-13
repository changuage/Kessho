// src/presets/PresetStore.ts
// Phase 1 — PresetStore abstraction with localStorage backend.
// The async interface allows transparent swap to IndexedDB (Phase 12).

import type {
  PresetEntry,
  PresetLevel,
  PresetMetadataPatch,
  PresetMetadataUpdateOptions,
  PresetReferenceCandidate,
  PresetRenameIdentity,
  PresetSummary,
} from './types';
import { compressVersions, getVersionData } from './codec';
import {
  getPresetScope,
  buildPresetKeyCandidates,
  isPresetCompatibleWithSlot,
  makePresetKey,
  normalizePresetSummary,
  parsePresetKey,
} from './presetUtils';
import { decodeCurrentPresetEntry } from './currentPresetSchema';

const PREFIX = 'preset:';
const LIBRARY_SORT_ORDER = {
  stock: 0,
  user: 1,
  cloud: 2,
} as const;

/** A metadata edit lost its compare-and-set race and must be refreshed before retrying. */
export class PresetMetadataConflictError extends Error {
  readonly code = 'PRESET_METADATA_CONFLICT';

  constructor(message = 'This preset was changed elsewhere. Refresh it before editing metadata again.') {
    super(message);
    this.name = 'PresetMetadataConflictError';
  }
}

function getBrowserPresetStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

// ─── Interface ──────────────────────────────────────────────────────────────

export interface IPresetStore {
  save(entry: PresetEntry): Promise<void>;
  load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null>;
  loadById(id: string, version?: number): Promise<PresetEntry | null>;
  list(type: PresetLevel, scope?: string): Promise<PresetSummary[]>;
  /** Rename a preset in place, preserving its stable id/versions */
  rename(type: PresetLevel, name: string, nextName: string, scope?: string, identity?: PresetRenameIdentity): Promise<PresetEntry | null>;
  /** Update identity metadata without creating a preset version. */
  updateMetadata(
    type: PresetLevel,
    name: string,
    metadata: PresetMetadataPatch,
    scope?: string,
    options?: PresetMetadataUpdateOptions,
  ): Promise<boolean>;
  delete(type: PresetLevel, name: string, scope?: string): Promise<void>;
  exists(type: PresetLevel, name: string, scope?: string): Promise<boolean>;
  /** Find higher-level presets that reference this preset by name */
  findReferences(type: PresetLevel, name: string): Promise<string[]>;
  /** Find presets whose current version references a stable target identity. */
  findCurrentReferenceCandidates(
    type: PresetLevel,
    targetId: string | undefined,
    targetName: string,
  ): Promise<PresetReferenceCandidate[]>;
  getStorageUsed(): Promise<{ bytes: number; count: number }>;
  /** Export all presets as a single JSON blob */
  exportAll(): Promise<Blob>;
  /**
   * Administrative bulk restore. It rejects active logical-key collisions;
   * interactive file import uses PresetCommandService.importEntry instead.
   */
  importAll(json: string): Promise<number>;
}

// ─── Key helpers ────────────────────────────────────────────────────────────

function readCurrentEntry(raw: string): PresetEntry | null {
  try {
    return decodeCurrentPresetEntry(JSON.parse(raw));
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

function getLocalMetadataRevision(entry: Pick<PresetEntry, 'updatedAt' | 'updatedAtRevision'>): string {
  return entry.updatedAtRevision ?? String(entry.updatedAt);
}

function stampLocalUpdate(entry: PresetEntry): void {
  entry.updatedAt = Math.max(Date.now(), entry.updatedAt + 1);
  entry.updatedAtRevision = String(entry.updatedAt);
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
    const normalized = decodeCurrentPresetEntry(entry);

    // Authoritative version retention/compression lives at the store boundary.
    compressVersions(normalized);
    stampLocalUpdate(normalized);

    const key = getLogicalKey(normalized);
    storage.setItem(key, JSON.stringify(normalized));
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    const storage = getBrowserPresetStorage();
    if (!storage) return null;
    const raw = buildPresetKeyCandidates(type, name, scope)
      .map(key => storage.getItem(key))
      .find((candidate): candidate is string => candidate !== null);
    if (!raw) return null;
    const entry = readCurrentEntry(raw);
    if (!entry || entry.type !== type || !isPresetCompatibleWithSlot(entry, type, scope)) return null;
    if (version !== undefined) {
      const selected = entry.versions.find(v => v.v === version);
      if (!selected) return null;
      return { ...entry, currentVersion: selected.v };
    }
    return entry;
  }

  async loadById(id: string, version?: number): Promise<PresetEntry | null> {
    const storage = getBrowserPresetStorage();
    const targetId = id.trim();
    if (!storage || !targetId) return null;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const entry = readCurrentEntry(raw);
      if (!entry) continue;
      if (entry.id !== targetId && entry.remoteId !== targetId) continue;
      if (version !== undefined) {
        const selected = entry.versions.find(v => v.v === version);
        if (!selected) return null;
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
      const entry = readCurrentEntry(raw);
      if (!entry) continue;
      if (!isPresetCompatibleWithSlot(entry, type, scope)) continue;
      const logicalKey = getLogicalKey(entry);
      const existing = results.get(logicalKey);
      if (!existing || compareEntriesByFreshness(existing, entry) < 0) {
        results.set(logicalKey, entry);
      }
    }
    const summaries = [...results.values()].map(entry => ({
      ...normalizePresetSummary(entry),
      updatedAtRevision: getLocalMetadataRevision(entry),
    }));
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
    for (const key of buildPresetKeyCandidates(type, name, scope)) storage.removeItem(key);
  }

  async rename(
    type: PresetLevel,
    name: string,
    nextName: string,
    scope?: string,
    identity?: PresetRenameIdentity,
  ): Promise<PresetEntry | null> {
    const storage = getBrowserPresetStorage();
    const trimmedName = nextName.trim();
    if (!storage || !trimmedName) return null;

    const entry = await this.load(type, name, scope);
    if (!entry) return null;

    const existing = await this.load(type, trimmedName, scope);
    if (existing && existing.id !== entry.id) {
      throw new Error(`A preset named "${trimmedName}" already exists.`);
    }

    const previousScope = getPresetScope(entry, type);
    const renamed = decodeCurrentPresetEntry({
      ...entry,
      ...identity,
      name: trimmedName,
      tags: identity?.tags ?? entry.tags,
      remoteId: entry.remoteId,
    });

    compressVersions(renamed);
    stampLocalUpdate(renamed);

    const nextScope = getPresetScope(renamed, type);
    const nextKey = getLogicalKey(renamed);
    for (const key of buildPresetKeyCandidates(type, name, previousScope)) storage.removeItem(key);
    for (const key of buildPresetKeyCandidates(type, trimmedName, nextScope)) storage.removeItem(key);
    storage.setItem(nextKey, JSON.stringify(renamed));
    return renamed;
  }

  async updateMetadata(
    type: PresetLevel,
    name: string,
    metadata: PresetMetadataPatch,
    scope?: string,
    options?: PresetMetadataUpdateOptions,
  ): Promise<boolean> {
    const entry = await this.load(type, name, scope);
    if (!entry) return false;
    const targetId = options?.targetId?.trim();
    if (targetId && targetId !== entry.id && targetId !== entry.remoteId) return false;
    if (
      options?.expectedUpdatedAt !== undefined
      && options.expectedUpdatedAt !== getLocalMetadataRevision(entry)
    ) {
      throw new PresetMetadataConflictError();
    }

    if ('creator' in metadata) entry.creator = metadata.creator ?? undefined;
    if ('description' in metadata) entry.description = metadata.description ?? undefined;
    if (metadata.visibility !== undefined) entry.visibility = metadata.visibility;
    if ('familyName' in metadata) entry.familyName = metadata.familyName ?? undefined;
    if ('variantName' in metadata) entry.variantName = metadata.variantName ?? undefined;
    if ('variantRank' in metadata) entry.variantRank = metadata.variantRank ?? undefined;
    if ('rating' in metadata) entry.rating = metadata.rating ?? undefined;
    if (metadata.tags !== undefined) entry.tags = metadata.tags;
    await this.save(entry);
    return true;
  }

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    const storage = getBrowserPresetStorage();
    if (!storage) return false;
    return buildPresetKeyCandidates(type, name, scope).some(key => storage.getItem(key) !== null);
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
      const entry = readCurrentEntry(raw);
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

  async findCurrentReferenceCandidates(
    type: PresetLevel,
    targetId: string | undefined,
    targetName: string,
  ): Promise<PresetReferenceCandidate[]> {
    const storage = getBrowserPresetStorage();
    if (!storage) return [];
    const candidates = new Map<string, PresetReferenceCandidate>();
    const needles = [targetId, targetName].filter((value): value is string => Boolean(value?.trim()));

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const entry = readCurrentEntry(raw);
      if (!entry || (type === 'state' && entry.type !== 'journey')) continue;
      const version = entry.versions.find(candidate => candidate.v === entry.currentVersion)
        ?? entry.versions[entry.versions.length - 1];
      if (!version) continue;
      const refs = version.refs ? Object.values(version.refs) : [];
      const data = getVersionData(entry, version.v) ?? version.data;
      const referencesTarget = refs.some(ref =>
        needles.some(needle => ref.id === needle || ref.name === needle))
        || needles.some(needle => containsReferenceValue(data, needle));
      if (!referencesTarget) continue;

      const identity = entry.id ?? `${entry.type}:${getPresetScope(entry, entry.type) ?? ''}:${entry.name.toLowerCase()}`;
      candidates.set(identity, {
        id: entry.id,
        name: entry.name,
        currentVersion: entry.currentVersion,
        updatedAtRevision: getLocalMetadataRevision(entry),
      });
    }

    return [...candidates.values()];
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
        const entry = readCurrentEntry(raw);
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
    const entries = parsed.entries.map((entry: unknown) => decodeCurrentPresetEntry(entry));
    const logicalKeys = new Set<string>();
    for (const entry of entries) {
      const key = getLogicalKey(entry);
      if (logicalKeys.has(key)) {
        throw new Error(`Backup contains duplicate preset "${entry.name}".`);
      }
      logicalKeys.add(key);
      if (await this.load(entry.type, entry.name, getPresetScope(entry, entry.type))) {
        throw new Error(`Backup restore would overwrite existing preset "${entry.name}". Rename or remove it first.`);
      }
    }

    let count = 0;
    for (const entry of entries) {
      await this.save(entry);
      count++;
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
