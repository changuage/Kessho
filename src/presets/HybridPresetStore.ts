// src/presets/HybridPresetStore.ts
// Combines local stock presets with cloud-backed user presets.
// - in shared mode, Supabase is authoritative for every preset, including stock
// - outside shared mode, stock/factory presets stay local-only
// - non-stock presets use cloud as the source of truth when cloud is available
// - list() merges local stock with cloud presets, deduplicating by name
// - load() prefers cloud, then falls back to local stock

import type {
  PresetEntry,
  PresetLevel,
  PresetMetadataPatch,
  PresetMetadataUpdateOptions,
  PresetReferenceCandidate,
  PresetRenameIdentity,
  PresetSummary,
} from './types';
import type { IPresetStore } from './PresetStore';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';

function comparePresetSummaryPriority(left: PresetSummary, right: PresetSummary): number {
  const rank = (preset: PresetSummary) => {
    switch (preset.library) {
      case 'cloud': return 3;
      case 'user': return 2;
      case 'stock':
      default: return 1;
    }
  };
  const rankDiff = rank(left) - rank(right);
  if (rankDiff !== 0) return rankDiff;
  if (
    left.remoteId
    && right.remoteId
    && left.updatedAtRevision
    && right.updatedAtRevision
    && left.updatedAtRevision !== right.updatedAtRevision
  ) {
    return left.updatedAtRevision.localeCompare(right.updatedAtRevision);
  }
  return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
}

function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

function dedupePresetSummariesByName(presets: PresetSummary[]): PresetSummary[] {
  const byName = new Map<string, PresetSummary>();
  for (const preset of presets) {
    const key = normalizePresetName(preset.name);
    const existing = byName.get(key);
    if (!existing || comparePresetSummaryPriority(existing, preset) < 0) {
      byName.set(key, preset);
    }
  }
  return Array.from(byName.values());
}

export class HybridPresetStore implements IPresetStore {
  constructor(
    private local: IPresetStore,
    private cloud: IPresetStore | null,
  ) {}

  /** Replace the cloud store (e.g. when auth state changes) */
  setCloudStore(cloud: IPresetStore | null): void {
    this.cloud = cloud;
  }

  private isCloudManagedEntry(entry: PresetEntry): boolean {
    if (SHARED_PRESET_TEST_MODE) return !!this.cloud;
    return !!this.cloud && entry.author !== 'factory' && entry.library !== 'stock';
  }

  private cloudBackedSummary(summary: PresetSummary): PresetSummary {
    return {
      ...summary,
      library: summary.library === 'stock' ? 'stock' : 'cloud',
    };
  }

  private async deleteLocalMutableMirror(
    type: PresetLevel,
    name: string,
    scope?: string,
  ): Promise<void> {
    const localEntry = await this.local.load(type, name, scope);
    if (!localEntry || localEntry.author === 'factory' || localEntry.library === 'stock') return;
    await this.local.delete(type, name, scope);
  }

  async save(entry: PresetEntry): Promise<void> {
    if (this.isCloudManagedEntry(entry)) {
      await this.cloud!.save(entry);
      await this.deleteLocalMutableMirror(
        entry.type,
        entry.name,
        entry.scope ?? entry.engine ?? entry.source,
      );
      return;
    }

    await this.local.save(entry);
  }

  async load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null> {
    if (this.cloud) {
      try {
        const cloudEntry = await this.cloud.load(type, name, scope, version);
        if (cloudEntry) return cloudEntry;
        if (SHARED_PRESET_TEST_MODE) return null;
      } catch (e) {
        console.warn('Cloud load failed:', e);
        if (SHARED_PRESET_TEST_MODE) return null;
      }
    }

    const local = await this.local.load(type, name, scope, version);
    if (local && (local.library === 'stock' || local.author === 'factory')) return local;
    return this.cloud ? null : local;
  }

  async loadById(id: string, version?: number): Promise<PresetEntry | null> {
    if (this.cloud) {
      try {
        const cloudEntry = await this.cloud.loadById(id, version);
        if (cloudEntry) return cloudEntry;
        if (SHARED_PRESET_TEST_MODE) return null;
      } catch (e) {
        console.warn('Cloud id load failed:', e);
        if (SHARED_PRESET_TEST_MODE) return null;
      }
    }

    const local = await this.local.loadById(id, version);
    if (local && (local.library === 'stock' || local.author === 'factory')) return local;
    return this.cloud ? null : local;
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const localList = await this.local.list(type, scope);
    if (!this.cloud) return localList;

    let cloudList: PresetSummary[] = [];
    try {
      cloudList = await this.cloud.list(type, scope);
    } catch (e) {
      console.warn('Cloud list failed:', e);
      if (SHARED_PRESET_TEST_MODE) return [];
      return dedupePresetSummariesByName(localList.filter(p => p.library === 'stock'));
    }

    if (SHARED_PRESET_TEST_MODE) {
      return dedupePresetSummariesByName(cloudList.map(summary => this.cloudBackedSummary(summary)))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const merged: PresetSummary[] = [
      ...cloudList.map(cp => this.cloudBackedSummary(cp)),
      ...localList.filter(p => p.library === 'stock'),
    ];

    return dedupePresetSummariesByName(merged).sort((a, b) => {
      if (a.library !== b.library) {
        if (a.library === 'cloud') return -1;
        if (b.library === 'cloud') return 1;
        if (a.library === 'user') return -1;
        if (b.library === 'user') return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async delete(type: PresetLevel, name: string, scope?: string): Promise<void> {
    if (!PRESET_DELETE_ENABLED) {
      console.warn('Shared preset delete is disabled in testing mode:', type, scope ?? '', name);
      return;
    }

    if (SHARED_PRESET_TEST_MODE) {
      if (!this.cloud) {
        throw new Error('Cloud preset delete is unavailable in shared preset mode.');
      }
      await this.cloud.delete(type, name, scope);
      await this.deleteLocalMutableMirror(type, name, scope);
      return;
    }

    if (this.cloud) {
      await this.cloud.delete(type, name, scope);
      await this.deleteLocalMutableMirror(type, name, scope);
      return;
    }
    await this.local.delete(type, name, scope);
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

    if (this.cloud) {
      const cloudEntry = await this.cloud.load(type, name, scope);
      if (cloudEntry) {
        const renamed = await this.cloud.rename(type, name, trimmedName, scope, identity);
        await this.deleteLocalMutableMirror(type, name, scope);
        return renamed;
      }
      if (SHARED_PRESET_TEST_MODE) return null;
    }

    return this.local.rename(type, name, trimmedName, scope, identity);
  }

  async updateMetadata(
    type: PresetLevel,
    name: string,
    metadata: PresetMetadataPatch,
    scope?: string,
    options?: PresetMetadataUpdateOptions,
  ): Promise<boolean> {
    if (this.cloud) {
      const updated = await this.cloud.updateMetadata(type, name, metadata, scope, options);
      if (updated) {
        await this.deleteLocalMutableMirror(type, name, scope);
        return true;
      }
      if (SHARED_PRESET_TEST_MODE) return false;
    }

    return this.local.updateMetadata(type, name, metadata, scope, options);
  }

  async exists(type: PresetLevel, name: string, scope?: string): Promise<boolean> {
    if (this.cloud) {
      try {
        if (await this.cloud.exists(type, name, scope)) return true;
        if (SHARED_PRESET_TEST_MODE) return false;
      } catch {
        if (SHARED_PRESET_TEST_MODE) return false;
        const local = await this.local.load(type, name, scope);
        return !!local && (local.library === 'stock' || local.author === 'factory');
      }
    }

    const local = await this.local.load(type, name, scope);
    return !!local && (local.library === 'stock' || local.author === 'factory');
  }

  async findReferences(type: PresetLevel, name: string): Promise<string[]> {
    const [local, cloud] = await Promise.all([
      this.local.findReferences(type, name),
      this.cloud?.findReferences(type, name) ?? Promise.resolve([]),
    ]);
    return [...new Set([...local, ...cloud])];
  }

  async findCurrentReferenceCandidates(
    type: PresetLevel,
    targetId: string | undefined,
    targetName: string,
  ): Promise<PresetReferenceCandidate[]> {
    const [local, cloud] = await Promise.all([
      this.local.findCurrentReferenceCandidates(type, targetId, targetName),
      this.cloud?.findCurrentReferenceCandidates(type, targetId, targetName) ?? Promise.resolve([]),
    ]);
    const candidates = new Map<string, PresetReferenceCandidate>();
    for (const candidate of [...local, ...cloud]) {
      const key = candidate.id ?? candidate.name.trim().toLowerCase();
      const existing = candidates.get(key);
      if (!existing || (
        candidate.updatedAtRevision
        && (!existing.updatedAtRevision || candidate.updatedAtRevision > existing.updatedAtRevision)
      )) {
        candidates.set(key, candidate);
      }
    }
    return [...candidates.values()];
  }

  async getStorageUsed(): Promise<{ bytes: number; count: number }> {
    if (this.cloud) return this.cloud.getStorageUsed();
    return this.local.getStorageUsed();
  }

  async exportAll(): Promise<Blob> {
    if (this.cloud) return this.cloud.exportAll();
    return this.local.exportAll();
  }

  async importAll(json: string): Promise<number> {
    if (this.cloud) return this.cloud.importAll(json);
    return this.local.importAll(json);
  }
}
