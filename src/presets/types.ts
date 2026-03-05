// src/presets/types.ts
// Phase 0 — Foundation types for the Kessho 5-level preset hierarchy.

export type PresetLevel = 'engine' | 'kit' | 'source' | 'state' | 'journey';

export interface PresetVersion {
  v: number;
  note: string;
  timestamp: number;
  data: Record<string, unknown>;
  refs?: Record<string, PresetRef>;
}

export interface PresetRef {
  name: string;
  version: number | 'latest';
}

export interface PresetEntry {
  type: PresetLevel;
  engine?: string;        // L1: 'pad1', 'drumKick', 'lead1', etc.
  source?: string;        // L2/L3: 'synth', 'drums', 'granular', 'earth'
  name: string;
  author: 'factory' | 'user';
  tags?: string[];
  versions: PresetVersion[];
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

/** File export/import envelope */
export interface PresetFile {
  kesshoPreset: true;
  formatVersion: 1;
  type: PresetLevel;
  engine?: string;
  source?: string;
  name: string;
  exportedAt: string;
  appVersion: string;
  entry: PresetEntry;
}

/** Minimal preset summary for browser lists */
export interface PresetSummary {
  type: PresetLevel;
  engine?: string;
  source?: string;
  name: string;
  author: 'factory' | 'user';
  tags?: string[];
  versionCount: number;
  currentVersion: number;
  updatedAt: number;
}
