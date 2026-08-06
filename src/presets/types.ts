// src/presets/types.ts
// Phase 0 — Foundation types for the Kessho 5-level preset hierarchy.

import type {
  SerializedPitchSettings,
  SerializedEvolveConfig,
  SerializedStepOverrides,
  SerializedSubLaneState,
  SliderMode,
} from '../ui/state';
import type { RoutingMuteGroupsState } from '../ui/routing/routingMuteGroups';
import type { ClockDivision } from '../audio/drumSeqTypes';
import type { PitchBindingMode } from '../audio/drumSeqTypes';
import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import type { DiamondPosition } from '../audio/journeyTypes';
import type { SerializedSeqScatterState } from '../ui/drums/scatter/scatterTypes';

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

export type PresetRenameIdentity = Pick<
  PresetIdentityMetadata,
  'creator' | 'description' | 'visibility' | 'familyName' | 'variantName' | 'variantRank' | 'rating'
> & {
  tags?: string[];
};

export interface PresetMetadataPatch {
  creator?: string | null;
  description?: string | null;
  visibility?: PresetVisibility;
  familyName?: string | null;
  variantName?: string | null;
  variantRank?: number | null;
  rating?: number | null;
  tags?: string[];
}

/**
 * Identity and revision information captured with a preset list entry before
 * editing its metadata. `expectedUpdatedAt` is an opaque value: Supabase
 * callers must pass the raw PostgreSQL `updated_at` text through unchanged.
 */
export interface PresetMetadataUpdateOptions {
  targetId?: string;
  expectedUpdatedAt?: string;
}

/** Minimal identity returned by a current-version reverse-reference lookup. */
export interface PresetReferenceCandidate {
  id?: string;
  name: string;
  currentVersion: number;
  /** Opaque backend revision captured with the candidate. */
  updatedAtRevision?: string;
}

export interface JourneyPresetPreviewNode {
  position: DiamondPosition;
  filled: boolean;
}

export interface JourneyPresetPreviewConnection {
  from: DiamondPosition;
  to: DiamondPosition;
}

export interface JourneyPresetPreview {
  nodes: JourneyPresetPreviewNode[];
  connections: JourneyPresetPreviewConnection[];
}

export interface PresetPoolMetadata {
  version: 1;
  pools: Record<string, string[]>;
}

export interface PresetVersionMetadata {
  routingMuteGroups?: RoutingMuteGroupsState;
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
  /** Current Seq 1–4 Play configuration metadata. */
  synthPlayConfigs?: ProductPlayConfig[];
  drumPitchSettings?: SerializedPitchSettings[];
  synthPitchSettings?: SerializedPitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
  drumScatterState?: SerializedSeqScatterState;
  journeyPreview?: JourneyPresetPreview;
  presetPool?: PresetPoolMetadata;
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

export type PresetRecoveryWarningReason =
  | 'missing_child_preset'
  | 'missing_payload'
  | 'missing_ref'
  | 'hash_mismatch'
  | 'invalid_payload_shape';

export type PresetRecoveryFallback = 'off' | 'bypass' | 'empty' | 'default';

export interface PresetRecoveryWarning {
  slot: string;
  reason: PresetRecoveryWarningReason;
  fallback: PresetRecoveryFallback;
  version?: number;
}

export interface PresetLoadResult {
  entry: PresetEntry;
  recoveryWarnings: PresetRecoveryWarning[];
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
  /** Opaque backend revision; for Supabase this is the exact PostgreSQL `updated_at` value. */
  updatedAtRevision?: string;
  recoveryWarnings?: PresetRecoveryWarning[];
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
  journeyPreview?: JourneyPresetPreview;
  tags?: string[];
  versionCount: number;
  currentVersion: number;
  updatedAt: number;
  /** Opaque backend revision; for Supabase this is the exact PostgreSQL `updated_at` value. */
  updatedAtRevision?: string;
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
