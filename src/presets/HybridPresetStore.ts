// src/presets/HybridPresetStore.ts
// Combines local stock presets with cloud-backed user presets.
// - stock/factory presets stay local-only
// - non-stock presets use cloud as the source of truth when cloud is available
// - list() merges local stock with cloud presets, deduplicating by name
// - load() prefers cloud, then falls back to local stock

import type { PresetEntry, PresetLevel, PresetSummary } from './types';
import type { IPresetStore } from './PresetStore';

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
      } catch (e) {
        console.warn('Cloud load failed:', e);
      }
    }

    const local = await this.local.load(type, name, scope, version);
    if (local && (local.library === 'stock' || local.author === 'factory')) return local;
    return this.cloud ? null : local;
  }

  async list(type: PresetLevel, scope?: string): Promise<PresetSummary[]> {
    const localList = await this.local.list(type, scope);
    if (!this.cloud) return localList;

    const localStock = localList.filter(p => p.library === 'stock');

    let cloudList: PresetSummary[] = [];
    try {
      cloudList = await this.cloud.list(type, scope);
    } catch (e) {
      console.warn('Cloud list failed:', e);
      return localStock;
    }

    const merged: PresetSummary[] = cloudList.map(cp => ({
      ...cp,
      library: cp.library === 'stock' ? 'stock' : 'cloud',
    }));
    const seen = new Set(merged.map(p => p.name));
    for (const local of localStock) {
      if (!seen.has(local.name)) {
        merged.push(local);
        seen.add(local.name);
      }
    }
    return merged;
  }

  async delete(type: PresetLevel, name: string, scope?: string): Promise<void> {
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
      } catch {
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
