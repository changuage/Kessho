// src/presets/HybridPresetStore.ts
// Combines local stock presets with cloud-backed user presets.
// - stock/factory presets stay local-only
// - non-stock presets use cloud as the source of truth when cloud is available
// - list() merges local stock with cloud presets, deduplicating by name
// - load() prefers cloud, then falls back to local stock

import type { PresetEntry, PresetLevel, PresetLibrary, PresetSummary } from './types';
import type { IPresetStore } from './PresetStore';
import { SHARED_PRESET_TEST_MODE } from './sharedMode';

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

  async save(entry: PresetEntry): Promise<void> {
    if (this.isCloudManagedEntry(entry)) {
      await this.cloud!.save(entry);
      await this.local.delete(entry.type, entry.name, entry.scope ?? entry.engine ?? entry.source);
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
      return dedupePresetSummariesByName(cloudList).sort((a, b) => a.name.localeCompare(b.name));
    }

    const merged: PresetSummary[] = [
      ...cloudList.map(cp => {
        const library: PresetLibrary = cp.library === 'stock' ? 'stock' : 'cloud';
        return {
          ...cp,
          library,
        };
      }),
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
    if (SHARED_PRESET_TEST_MODE && this.cloud) {
      console.warn('Shared preset delete is disabled in testing mode:', type, scope ?? '', name);
      return;
    }

    await this.local.delete(type, name, scope);
    if (this.cloud) {
      try {
        await this.cloud.delete(type, name, scope);
      } catch (e) {
        console.warn('Cloud delete failed:', e);
      }
    }
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
    return this.local.findReferences(type, name);
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
