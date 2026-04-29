// src/presets/types.ts
// Phase 0 — Foundation types for the Kessho 5-level preset hierarchy.

import type {
  SerializedPitchSettings,
  SerializedEvolveConfig,
  SerializedStepOverrides,
  SerializedSubLaneState,
  SliderMode,
} from '../ui/state';
import type { ClockDivision } from '../audio/drumSeqTypes';
import type { PitchBindingMode } from '../audio/drumSeqTypes';

export type PresetLevel = 'engine' | 'kit' | 'source' | 'state' | 'journey';
export type PresetLibrary = 'stock' | 'user' | 'cloud';
export type PresetVisibility = 'private' | 'public' | 'featured';

export interface PresetIdentityMetadata {
  library?: PresetLibrary;
  creator?: string;
  description?: string;
  visibility?: PresetVisibility;
  familyId?: string;
  familyName?: string;
  variantId?: string;
  variantName?: string;
  variantRank?: number;
  remoteId?: string;
  playCount?: number;
  featured?: boolean;
  rating?: number;
}

export interface PresetSaveIdentity extends PresetIdentityMetadata {}

export interface PresetVersionMetadata {
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
  drumEvolveConfigs?: SerializedEvolveConfig[];
  synthEvolveConfigs?: SerializedEvolveConfig[];
  drumStepOverrides?: SerializedStepOverrides;
  synthStepOverrides?: SerializedStepOverrides;
  drumClockDivs?: ClockDivision[];
  synthClockDivs?: ClockDivision[];
  drumSwings?: number[];
  synthSwings?: number[];
  drumLinked?: boolean[];
  synthLinked?: boolean[];
  drumSubLaneStates?: Record<string, SerializedSubLaneState>[];
  synthSubLaneStates?: Record<string, SerializedSubLaneState>[];
  synthPitchSettings?: SerializedPitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
  refs?: Record<string, PresetRef>;
}

export interface PresetVersion extends PresetVersionMetadata {
  v: number;
  note: string;
  timestamp: number;
  data: Record<string, unknown>;
  _isDelta?: boolean;
  id?: string;
  refs?: Record<string, PresetRef>;
}

export interface PresetRef {
  id?: string;
  name: string;
  version: number | 'latest';
  scope?: string;
}

export interface PresetEntry extends PresetIdentityMetadata {
  id?: string;         // Normalized on save/load; stable across versions
  type: PresetLevel;
  scope?: string;      // Optional normalized slot scope (engine/source/kit/etc.)
  engine?: string;        // L1: 'pad1', 'drumKick', 'lead1', etc.
  source?: string;        // L2/L3: 'synth', 'drums', 'granular', 'earth'
  name: string;
  author: 'factory' | 'user' | 'cloud';
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
  id?: string;
  type: PresetLevel;
  scope?: string;
  engine?: string;
  source?: string;
  name: string;
  exportedAt: string;
  appVersion: string;
  entry: PresetEntry;
}

/** Minimal preset summary for browser lists */
export interface PresetSummary {
  id?: string;
  type: PresetLevel;
  scope?: string;
  engine?: string;
  source?: string;
  name: string;
  author: 'factory' | 'user' | 'cloud';
  library: PresetLibrary;
  creator?: string;
  description?: string;
  visibility?: PresetVisibility;
  familyId: string;
  familyName: string;
  variantId: string;
  variantName: string;
  variantRank?: number;
  remoteId?: string;
  playCount?: number;
  featured?: boolean;
  rating?: number;
  tags?: string[];
  versionCount: number;
  currentVersion: number;
  updatedAt: number;
}

export interface PresetVariantSummary extends PresetSummary {}

export interface PresetFamilySummary {
  familyId: string;
  familyName: string;
  type: PresetLevel;
  scope?: string;
  engine?: string;
  source?: string;
  libraries: PresetLibrary[];
  variantCount: number;
  updatedAt: number;
  variants: PresetVariantSummary[];
}
