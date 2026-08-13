// src/presets/codec.ts
// Phase 0 — Codec functions for slicing and merging SliderState by level+scope.

import { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
export type { ParamLevel } from './ParamRegistry';
import type { PresetEntry } from './types';
import type { SliderState } from '../ui/state';
import { presetValuesEqual } from './presetUtils';
import { normalizeDynamicsErosionAliases, normalizeDynamicsQualityFields } from '../audio/dynamicsModel';
import { canonicalizePresetScope } from './presetScopeAliases';

const LEAD_PRESET_RUNTIME_DATA_KEYS = [
  'lead1PresetAData', 'lead1PresetBData', 'lead2PresetCData', 'lead2PresetDData',
] as const;

function applyRuntimePresetData(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of LEAD_PRESET_RUNTIME_DATA_KEYS) {
    if (key in source) target[key] = source[key];
  }
}

function getDirectKeys(level: ParamLevel, scope?: string): string[] {
  const normalizedScope = resolveRegistryScope(scope);
  if (level === 4) {
    return Object.keys(PARAM_REGISTRY);
  }
  return Object.entries(PARAM_REGISTRY)
    .filter(([, info]) => info.level === level && (!normalizedScope || info.scope === normalizedScope))
    .map(([key]) => key);
}

function resolveRegistryScope(scope?: string): string | undefined {
  if (!scope) return undefined;
  const hasDirectScope = Object.values(PARAM_REGISTRY).some(info => info.scope === scope);
  return hasDirectScope ? scope : canonicalizePresetScope(scope);
}

function migrateLegacyPadCutoffParams(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  const pairs = [
    ['filterCutoffMin', 'filterCutoffMax', 'filterCutoff'],
    ['pad2FilterCutoffMin', 'pad2FilterCutoffMax', 'pad2FilterCutoff'],
  ] as const;
  for (const [minKey, maxKey, cutoffKey] of pairs) {
    if (!(cutoffKey in normalized) && (minKey in normalized || maxKey in normalized)) {
      const min = typeof normalized[minKey] === 'number' ? normalized[minKey] : normalized[maxKey];
      const max = typeof normalized[maxKey] === 'number' ? normalized[maxKey] : min;
      if (typeof min === 'number' && typeof max === 'number') {
        normalized[cutoffKey] = (min + max) * 0.5;
      }
    }
    delete normalized[minKey];
    delete normalized[maxKey];
  }
  return normalized;
}

function migrateLegacySpectralFreezeParams(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  if (!('spectralFreezeMode' in normalized) && typeof normalized.spectralFreezeSlushy === 'boolean') {
    normalized.spectralFreezeMode = normalized.spectralFreezeSlushy ? 'slushy' : 'solid';
  }
  if (!('spectralFreezeRefresh' in normalized) && typeof normalized.spectralFreezeSpeed === 'number') {
    normalized.spectralFreezeRefresh = normalized.spectralFreezeSpeed;
  }
  if (!('spectralFreezeSustain' in normalized) && typeof normalized.spectralFreezeDecay === 'number') {
    normalized.spectralFreezeSustain = normalized.spectralFreezeDecay;
  }
  if (!('spectralFreezeDiffusion' in normalized) && typeof normalized.spectralFreezePhaseJitter === 'number') {
    normalized.spectralFreezeDiffusion = normalized.spectralFreezePhaseJitter;
  }
  normalized.spectralFreezeActive = false;
  delete normalized.spectralFreezeSlushy;
  delete normalized.spectralFreezeSpeed;
  delete normalized.spectralFreezeDecay;
  delete normalized.spectralFreezePhaseJitter;
  return normalized;
}

/** Extract only the params owned by a level+scope from full state */
export function extractParams(
  state: SliderState,
  level: ParamLevel,
  scope?: string,
): Record<string, unknown> {
  const normalizedScope = resolveRegistryScope(scope);
  const result: Record<string, unknown> = {};
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && (!normalizedScope || info.scope === normalizedScope)) {
      if (key in state) result[key] = (state as unknown as Record<string, unknown>)[key];
    }
  }
  return result;
}

/** Apply preset params into state, only touching keys at specified level+scope */
export function applyParams(
  state: SliderState,
  presetData: Record<string, unknown>,
  level: ParamLevel,
  scope?: string,
): SliderState {
  const normalizedScope = resolveRegistryScope(scope);
  const merged: Record<string, unknown> = { ...state };
  const normalizedData = migrateLegacySpectralFreezeParams(migrateLegacyPadCutoffParams(normalizeDynamicsQualityFields(
    normalizeDynamicsErosionAliases(presetData),
  )));
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && (!normalizedScope || info.scope === normalizedScope)) {
      if (key in normalizedData) merged[key] = normalizedData[key];
    }
  }
  applyRuntimePresetData(merged, normalizedData);
  return merged as unknown as SliderState;
}

/** Get all keys owned by a level+scope */
export function getKeysForScope(level: ParamLevel, scope: string): string[] {
  const normalizedScope = resolveRegistryScope(scope);
  return Object.entries(PARAM_REGISTRY)
    .filter(([, info]) => info.level === level && info.scope === normalizedScope)
    .map(([key]) => key);
}

/** Get all scopes at a given level */
export function getScopesForLevel(level: ParamLevel): string[] {
  const scopes = new Set<string>();
  for (const info of Object.values(PARAM_REGISTRY)) {
    if (info.level === level) scopes.add(info.scope);
  }
  return [...scopes];
}

/** Validate registry completeness against SliderState keys */
export function validateRegistry(stateKeys: string[]): {
  missing: string[];    // in registry but not in state
  unassigned: string[]; // in state but not in registry
} {
  const registryKeys = new Set(Object.keys(PARAM_REGISTRY));
  const stateSet = new Set(stateKeys);
  // Known intentionally-dropped keys (not in registry, not a bug)
  const dropped = new Set([
    'leadTimbre',
    'granularPreset',
    'granularVisualDetail',
    'sidechainDelayATarget',
    'sidechainDelayBTarget',
    'sidechainGranularTarget',
    'sidechainLead1Target',
    'sidechainLead2Target',
    'sidechainPad1Target',
    'sidechainPad2Target',
    'sidechainPianoTarget',
    'sidechainReverbTarget',
    // Stored as portable sequencer metadata/content, not duplicated in scalar
    // ParamRegistry extraction.
    'synthPlayConfigs',
    // Runtime gesture state. Presets own the authored freeze sound, not an
    // active capture or its edge-trigger serial.
    'spectralFreezeActive',
    'spectralFreezeCaptureSerial',
  ]);

  return {
    missing: [...registryKeys].filter(k => !stateSet.has(k)),
    unassigned: stateKeys.filter(k => !registryKeys.has(k) && !dropped.has(k)),
  };
}

// ─── Cascade hierarchy: child scopes for source and kit presets ─────────────

/** Maps a composite preset scope to the lower-level scopes it owns. */
const CASCADE_CHILDREN: Record<string, { level: ParamLevel; scope: string }[]> = {
  synth: [
    { level: 1, scope: 'synthEuclidean' },
    { level: 1, scope: 'leadDelay' },
    { level: 2, scope: 'pad1Kit' },
    { level: 2, scope: 'pad2Kit' },
    { level: 2, scope: 'lead1Kit' },
    { level: 2, scope: 'lead2Kit' },
  ],
  drums: [
    { level: 1, scope: 'drumEuclidean' },
    { level: 2, scope: 'drumKit' },
  ],
  delay: [
    { level: 2, scope: 'delayKit' },
  ],
  reverb: [
    { level: 2, scope: 'reverbKit' },
  ],
  granular: [
    { level: 2, scope: 'granularKit' },
  ],
  dynamicsBus: [
    { level: 1, scope: 'dynamicsEq1' },
    { level: 1, scope: 'dynamicsEq2' },
    { level: 1, scope: 'dynamicsSidechain' },
  ],
  degrade: [
    { level: 2, scope: 'degradeDrift' },
    { level: 2, scope: 'degradeErosion' },
  ],
  masterFx: [
    { level: 1, scope: 'masterSaturation' },
    { level: 1, scope: 'dynamicsEndChain' },
  ],
  pad1Kit: [
    { level: 1, scope: 'pad1' },
  ],
  pad2Kit: [
    { level: 1, scope: 'pad2' },
  ],
  lead1Kit: [
    { level: 1, scope: 'lead1' },
  ],
  lead2Kit: [
    { level: 1, scope: 'lead2' },
  ],
  drumKit: [
    { level: 1, scope: 'drumSub' },
    { level: 1, scope: 'drumKick' },
    { level: 1, scope: 'drumClick' },
    { level: 1, scope: 'drumBeepHi' },
    { level: 1, scope: 'drumBeepLo' },
    { level: 1, scope: 'drumNoise' },
    { level: 1, scope: 'drumMembrane' },
  ],
  delayKit: [
    { level: 1, scope: 'leadDelay' },
    { level: 1, scope: 'echoLine' },
    { level: 1, scope: 'clockedSpace' },
  ],
  reverbKit: [
    { level: 1, scope: 'reverbEngine' },
    { level: 1, scope: 'spectralFreeze' },
  ],
  granularKit: [
    { level: 1, scope: 'granularVoice1' },
    { level: 1, scope: 'granularVoice2' },
    { level: 1, scope: 'granularVoice3' },
    { level: 1, scope: 'granularVoice4' },
    { level: 1, scope: 'granularLegacy' },
    { level: 1, scope: 'legacyGranular' },
  ],
  earthKit: [
    { level: 1, scope: 'water' },
    { level: 1, scope: 'insects1' },
    { level: 1, scope: 'insects2' },
  ],
};

const SOURCE_EXTRA_KEYS: Partial<Record<string, string[]>> = {
  synth: ['drumDelayNoteL', 'drumDelayNoteR'],
  delay: ['drumDelayNoteL', 'drumDelayNoteR', 'granularSpaceMode'],
};

function collectCascadeKeys(
  keys: Set<string>,
  level: ParamLevel,
  scope: string | undefined,
  visited: Set<string>,
): void {
  const visitKey = `${level}:${scope ?? ''}`;
  if (visited.has(visitKey)) return;
  visited.add(visitKey);

  for (const key of getDirectKeys(level, scope)) {
    keys.add(key);
  }

  if (scope) {
    for (const child of CASCADE_CHILDREN[scope] ?? []) {
      collectCascadeKeys(keys, child.level, child.scope, visited);
    }
  }

  for (const key of SOURCE_EXTRA_KEYS[scope ?? ''] ?? []) {
    keys.add(key);
  }
}

/** Get all preset-owned keys for a level+scope, including source/state cascade children. */
export function getCascadeKeys(level: ParamLevel, scope?: string): string[] {
  if (level === 4) {
    return Object.keys(PARAM_REGISTRY);
  }

  const keys = new Set<string>();
  collectCascadeKeys(keys, level, scope, new Set());
  return [...keys];
}

/**
 * Extract all params at a level+scope AND all child scopes below it.
 * For L3 source presets this captures L1+L2 children; for L4 state it captures everything.
 */
export function extractCascade(
  state: SliderState,
  level: ParamLevel,
  scope?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const stateRecord = state as unknown as Record<string, unknown>;
  for (const key of getCascadeKeys(level, scope)) {
    const value = stateRecord[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Apply preset params into state, including source/state cascade children. */
export function applyCascade(
  state: SliderState,
  presetData: Record<string, unknown>,
  level: ParamLevel,
  scope?: string,
): SliderState {
  const merged: Record<string, unknown> = { ...state };
  const normalizedData = migrateLegacySpectralFreezeParams(migrateLegacyPadCutoffParams(normalizeDynamicsQualityFields(
    normalizeDynamicsErosionAliases(presetData),
  )));
  for (const key of getCascadeKeys(level, scope)) {
    if (key in normalizedData) {
      merged[key] = normalizedData[key];
    }
  }
  applyRuntimePresetData(merged, normalizedData);
  return merged as unknown as SliderState;
}

// ─── Version Delta Compression ──────────────────────────────────────────────
// v1 stores full snapshot. v2+ store only keys that differ from v1.
// On load, reconstitute by merging v1 base + delta.

const MAX_VERSIONS = 5;

/**
 * Given a full data snapshot and the base (v1) data, returns only the keys that differ.
 */
function computeDelta(base: Record<string, unknown>, full: Record<string, unknown>): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(full)) {
    if (!(key in base) || !presetValuesEqual(base[key], value)) {
      delta[key] = value;
    }
  }
  return delta;
}

/**
 * Reconstitute full data from base (v1) + delta.
 */
export function reconstitute(base: Record<string, unknown>, delta: Record<string, unknown>): Record<string, unknown> {
  return { ...base, ...delta };
}

/**
 * Compress an entry's versions array:
 * - Cap at MAX_VERSIONS (keep v1 + latest N-1)
 * - v1 stays full, v2+ become deltas against v1
 */
export function compressVersions(entry: PresetEntry): void {
  if (entry.versions.length <= 1) return;

  const v1 = entry.versions[0];
  if (!v1 || !v1.data) return;

  // Cap total versions: keep v1 + latest (MAX_VERSIONS - 1)
  if (entry.versions.length > MAX_VERSIONS) {
    const keepers = [v1, ...entry.versions.slice(-(MAX_VERSIONS - 1))];
    entry.versions = keepers;
    // Ensure currentVersion points to a kept version
    if (!entry.versions.some(v => v.v === entry.currentVersion)) {
      const latestKept = entry.versions[entry.versions.length - 1];
      if (latestKept) {
        entry.currentVersion = latestKept.v;
      }
    }
  }

  // Delta-compress v2+ against v1
  for (let i = 1; i < entry.versions.length; i++) {
    const ver = entry.versions[i];
    if (!ver?.data || ver._isDelta) continue;
    ver.data = computeDelta(v1.data, ver.data);
    ver._isDelta = true;
  }
}

/**
 * Get the full reconstituted data for a specific version.
 * If the version is a delta, merges it with v1 base.
 */
export function getVersionData(entry: PresetEntry, version?: number): Record<string, unknown> | null {
  const target = version !== undefined
    ? entry.versions.find(v => v.v === version)
    : entry.versions.find(v => v.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];

  if (!target?.data) return null;

  // If not a delta (v1 or uncompressed), return as-is
  if (!target._isDelta) return target.data;

  // Reconstitute from v1 base
  const v1 = entry.versions[0];
  if (!v1?.data) return target.data;
  return reconstitute(v1.data, target.data);
}
