// src/presets/presetUtils.ts
// Shared helpers for preset identity, normalization, compatibility checks, and diffing.

import type {
  PresetEntry,
  PresetLibrary,
  PresetLevel,
  PresetRef,
  PresetSummary,
  PresetVisibility,
  PresetVersion,
  PresetVersionMetadata,
} from './types';
import { normalizeJourneyPresetPreview } from './journeyPresetPreview';
import { normalizePresetPoolMetadata, normalizePresetTags } from './presetPool';
import {
  arePresetScopesCompatible,
  canonicalizePresetScope,
  getPresetScopeReadCandidates,
} from './presetScopeAliases';

const PREFIX = 'preset:';
export const PRESET_VERSION_METADATA_FIELDS = [
  'routingMuteGroups',
  'dualRanges',
  'sliderModes',
  'drumEvolveConfigs',
  'synthEvolveConfigs',
  'drumStepOverrides',
  'synthStepOverrides',
  'drumClockDivs',
  'synthClockDivs',
  'drumSwings',
  'synthSwings',
  'drumLinked',
  'synthLinked',
  'drumSubLaneStates',
  'synthSubLaneStates',
  'synthPlayConfigs',
  'drumPitchSettings',
  'synthPitchSettings',
  'synthPitchBindingModes',
  'drumScatterState',
  'journeyPreview',
  'presetPool',
] as const;

const LEGACY_DELAY_A_KEY_ALIASES = {
  leadDelayReverbSend: 'delayAReverbSend',
  leadDelayTime: 'delayATime',
  leadDelayFeedback: 'delayAFeedback',
  leadDelayMix: 'delayAMix',
  leadDelayEnabled: 'delayAEnabled',
  leadDelaySpread: 'delayASpread',
  leadDelayFilter: 'delayAFilter',
  leadDelaySend: 'delayASend',
} as const;

type MetadataField = (typeof PRESET_VERSION_METADATA_FIELDS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function coerceNumber(value: unknown, fallback: number): number {
  const candidate = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(candidate) ? candidate : fallback;
}

function slugifyPresetToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'preset';
}

function cloneJson<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON cloning.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function presetValuesEqual(left: unknown, right: unknown, epsilon = 1e-6): boolean {
  if (left === right) return true;

  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) <= epsilon;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!presetValuesEqual(left[i], right[i], epsilon)) return false;
    }
    return true;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    const keys = new Set([...leftKeys, ...rightKeys]);
    for (const key of keys) {
      if (!presetValuesEqual(left[key], right[key], epsilon)) return false;
    }
    return true;
  }

  return stableStringify(left) === stableStringify(right);
}

function isPresetLevel(value: unknown): value is PresetLevel {
  return value === 'engine' || value === 'kit' || value === 'source' || value === 'state' || value === 'journey';
}

function isPresetLibrary(value: unknown): value is PresetLibrary {
  return value === 'stock' || value === 'user' || value === 'cloud';
}

function isPresetVisibility(value: unknown): value is PresetVisibility {
  return value === 'private' || value === 'public' || value === 'featured';
}

function isImplicitFactorySeed(
  input: Record<string, unknown>,
  versions: PresetVersion[],
): boolean {
  if (input.author === 'factory' || input.library === 'stock') return true;
  if (input.author === 'cloud' || input.library === 'cloud') return false;
  if (versions.length !== 1) return false;
  const creator = coerceString(input.creator);
  const firstVersion = versions[0];
  return creator === 'Kessho' && firstVersion?.note.trim().toLowerCase() === 'factory preset';
}

function normalizeTags(value: unknown): string[] | undefined {
  const tags = normalizePresetTags(value);
  return tags.length ? tags : undefined;
}

function normalizePresetRef(value: unknown): PresetRef | null {
  if (!isPlainObject(value)) return null;
  const name = coerceString(value.name);
  if (!name) return null;
  const version = value.version === 'latest' || typeof value.version === 'number' ? value.version : 'latest';
  const ref: PresetRef = { name, version };
  const id = coerceString(value.id);
  if (id) ref.id = id;
  const scope = coerceString(value.scope);
  if (scope) ref.scope = canonicalizePresetScope(scope);
  return ref;
}

function normalizePresetRefs(value: unknown): Record<string, PresetRef> | undefined {
  if (!isPlainObject(value)) return undefined;
  const refs: Record<string, PresetRef> = {};
  for (const [key, refValue] of Object.entries(value)) {
    const ref = normalizePresetRef(refValue);
    if (ref) refs[key] = ref;
  }
  return Object.keys(refs).length ? refs : undefined;
}

function normalizeMetadataField(value: unknown): PresetVersionMetadata[MetadataField] | undefined {
  if (value === undefined) return undefined;
  return cloneJson(value) as PresetVersionMetadata[MetadataField];
}

function migrateLegacyDelayAKeys(record: Record<string, unknown>): void {
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_DELAY_A_KEY_ALIASES)) {
    if (!(currentKey in record) && legacyKey in record) {
      record[currentKey] = record[legacyKey];
    }
    delete record[legacyKey];
  }
}

function normalizePresetData(value: unknown): Record<string, unknown> {
  const data = isPlainObject(value) ? cloneJson(value) : {};
  migrateLegacyDelayAKeys(data);
  return data;
}

export function generatePresetId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeDerivedFamilyId(type: PresetLevel, scope: string | undefined, familyName: string): string {
  return `${type}:${scope ?? 'global'}:${slugifyPresetToken(familyName)}`;
}

function makeDerivedVariantId(type: PresetLevel, scope: string | undefined, familyName: string, variantName: string): string {
  return `${makeDerivedFamilyId(type, scope, familyName)}:${slugifyPresetToken(variantName)}`;
}

export function makePresetKey(type: PresetLevel, name: string, scope?: string): string {
  const normalizedScope = canonicalizePresetScope(scope);
  if (normalizedScope && type !== 'state' && type !== 'journey') {
    return `${PREFIX}${type}:${normalizedScope}:${name}`;
  }
  return `${PREFIX}${type}:${name}`;
}

export function parsePresetKey(key: string): { type: PresetLevel; scope?: string; name: string } | null {
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const parts = rest.split(':');
  const type = parts[0];
  if (parts.length === 2 && type && isPresetLevel(type)) {
    return { type, name: parts[1] ?? '' };
  }
  if (parts.length === 3 && type && isPresetLevel(type)) {
    return { type, scope: parts[1], name: parts[2] ?? '' };
  }
  return null;
}

export function getPresetScope(
  entry: Pick<PresetEntry, 'engine' | 'source' | 'scope'> | null | undefined,
  type?: PresetLevel,
): string | undefined {
  if (!entry) return undefined;
  const normalizedScope = coerceString(entry.scope);
  if (normalizedScope) return canonicalizePresetScope(normalizedScope);
  if (type === 'engine') return canonicalizePresetScope(coerceString(entry.engine));
  if (type === 'kit' || type === 'source') return canonicalizePresetScope(coerceString(entry.source));
  return canonicalizePresetScope(coerceString(entry.engine) ?? coerceString(entry.source));
}

export function buildPresetKeyCandidates(
  type: PresetLevel,
  name: string,
  scope?: string,
): string[] {
  const candidates: string[] = [];
  const legacyKey = makePresetKey(type, name);

  if (scope && type !== 'state' && type !== 'journey') {
    for (const candidateScope of getPresetScopeReadCandidates(scope)) {
      const scopedKey = `${PREFIX}${type}:${candidateScope}:${name}`;
      if (scopedKey !== legacyKey) candidates.push(scopedKey);
    }
  }
  candidates.push(legacyKey);

  // Legacy engine entries were already stored with a scoped key, but keep the
  // set unique so callers can safely iterate candidates in order.
  return [...new Set(candidates)];
}

export function normalizePresetVersion(input: unknown): PresetVersion | null {
  if (!isPlainObject(input)) return null;
  const version: PresetVersion = {
    v: coerceNumber(input.v, 1),
    note: coerceString(input.note) ?? '',
    timestamp: coerceNumber(input.timestamp, Date.now()),
    data: normalizePresetData(input.data),
  };

  const id = coerceString(input.id);
  if (id) version.id = id;

  const refs = normalizePresetRefs(input.refs);
  if (refs) version.refs = refs;

  if (input._isDelta === true) {
    (version as unknown as Record<string, unknown>)._isDelta = true;
  }

  for (const field of PRESET_VERSION_METADATA_FIELDS) {
    const normalized = field === 'journeyPreview'
      ? normalizeJourneyPresetPreview(input[field])
      : field === 'presetPool'
        ? normalizePresetPoolMetadata(input[field])
        : normalizeMetadataField(input[field]);
    if (normalized !== undefined) {
      if ((field === 'dualRanges' || field === 'sliderModes') && isPlainObject(normalized)) {
        migrateLegacyDelayAKeys(normalized as Record<string, unknown>);
      }
      (version as unknown as Record<string, unknown>)[field] = normalized;
    }
  }

  // Legacy Pad presets stored the cutoff's autonomous range as two audio
  // parameters. Preserve that intent as generic slider behavior while the
  // resolved data migrates to one audible base cutoff in codec.ts.
  if (isPlainObject(input.data)) {
    const legacyPairs = [
      ['filterCutoffMin', 'filterCutoffMax', 'filterCutoff'],
      ['pad2FilterCutoffMin', 'pad2FilterCutoffMax', 'pad2FilterCutoff'],
    ] as const;
    for (const [minKey, maxKey, cutoffKey] of legacyPairs) {
      const min = input.data[minKey];
      const max = input.data[maxKey];
      if (typeof min !== 'number' || typeof max !== 'number' || Math.abs(max - min) <= 1) continue;
      version.dualRanges = {
        ...(version.dualRanges ?? {}),
        [cutoffKey]: version.dualRanges?.[cutoffKey] ?? { min: Math.min(min, max), max: Math.max(min, max) },
      };
      version.sliderModes = {
        ...(version.sliderModes ?? {}),
        [cutoffKey]: version.sliderModes?.[cutoffKey] ?? 'walk',
      };
    }
  }

  // Decode-only compatibility: old versions called the canonical Play
  // metadata `synthArpConfigs`. Never copy that legacy key to a new version.
  if (version.synthPlayConfigs === undefined && input.synthArpConfigs !== undefined) {
    const legacyPlayConfigs = normalizeMetadataField(input.synthArpConfigs);
    if (legacyPlayConfigs !== undefined) version.synthPlayConfigs = legacyPlayConfigs as PresetVersion['synthPlayConfigs'];
  }

  return version;
}

export function extractPresetVersionMetadata(version: PresetVersion | null | undefined): PresetVersionMetadata | undefined {
  if (!version) return undefined;
  const metadata: PresetVersionMetadata = {};
  let hasMetadata = false;

  for (const field of PRESET_VERSION_METADATA_FIELDS) {
    const value = version[field];
    if (value !== undefined) {
      (metadata as Record<string, unknown>)[field] = cloneJson(value);
      hasMetadata = true;
    }
  }

  // Decode the pre-Milestone-3 key into the canonical Play metadata shape.
  const legacyPlayConfigs = (version as unknown as Record<string, unknown>).synthArpConfigs;
  if (metadata.synthPlayConfigs === undefined && legacyPlayConfigs !== undefined) {
    metadata.synthPlayConfigs = cloneJson(legacyPlayConfigs) as PresetVersionMetadata['synthPlayConfigs'];
  }

  if (version.refs) {
    metadata.refs = cloneJson(version.refs);
    hasMetadata = true;
  }

  return hasMetadata ? metadata : undefined;
}

export function normalizePresetEntry(input: unknown): PresetEntry | null {
  if (!isPlainObject(input)) return null;

  const type = isPresetLevel(input.type) ? input.type : undefined;
  const name = coerceString(input.name);
  if (!type || !name) return null;

  const versionMap = new Map<number, PresetVersion>();
  if (Array.isArray(input.versions)) {
    for (const rawVersion of input.versions) {
      const normalized = normalizePresetVersion(rawVersion);
      if (normalized) versionMap.set(normalized.v, normalized);
    }
  }
  const versions = [...versionMap.values()].sort((a, b) => a.v - b.v);
  if (!versions.length) return null;

  const rawScope = coerceString(input.scope)
    ?? (type === 'engine' ? coerceString(input.engine) : undefined)
    ?? ((type === 'kit' || type === 'source') ? coerceString(input.source) : undefined);
  const normalizedScope = canonicalizePresetScope(rawScope);

  const engine = canonicalizePresetScope(coerceString(input.engine) ?? (type === 'engine' ? normalizedScope : undefined));
  const source = canonicalizePresetScope(coerceString(input.source) ?? ((type === 'kit' || type === 'source') ? normalizedScope : undefined));
  const id = coerceString(input.id) ?? generatePresetId();
  const familyName = coerceString(input.familyName) ?? name;
  const variantName = coerceString(input.variantName) ?? name;
  const familyId = coerceString(input.familyId) ?? makeDerivedFamilyId(type, normalizedScope, familyName);
  const variantId = coerceString(input.variantId) ?? makeDerivedVariantId(type, normalizedScope, familyName, variantName);
  const variantRank = input.variantRank === undefined ? undefined : coerceNumber(input.variantRank, 0);
  const implicitFactorySeed = isImplicitFactorySeed(input, versions);
  const library = isPresetLibrary(input.library)
    ? input.library
    : input.author === 'factory' || implicitFactorySeed
      ? 'stock'
      : input.author === 'cloud'
        ? 'cloud'
        : 'user';
  const visibility = isPresetVisibility(input.visibility)
    ? input.visibility
    : library === 'cloud'
      ? 'public'
      : library === 'stock'
        ? 'featured'
        : 'private';
  const firstVersion = versions[0]!;
  const lastVersion = versions[versions.length - 1]!;

  const currentVersionCandidate = coerceNumber(input.currentVersion, lastVersion.v);
  const currentVersion = versions.some(version => version.v === currentVersionCandidate)
    ? currentVersionCandidate
    : lastVersion.v;

  const createdAt = coerceNumber(input.createdAt, firstVersion.timestamp);
  const updatedAt = coerceNumber(input.updatedAt, lastVersion.timestamp);

  return {
    id,
    type,
    scope: normalizedScope,
    engine,
    source,
    name,
    author: input.author === 'factory' || implicitFactorySeed ? 'factory' : input.author === 'cloud' ? 'cloud' : 'user',
    library,
    creator: coerceString(input.creator),
    description: coerceString(input.description),
    visibility,
    familyId,
    familyName,
    variantId,
    variantName,
    variantRank,
    remoteId: coerceString(input.remoteId),
    playCount: input.playCount === undefined ? undefined : coerceNumber(input.playCount, 0),
    featured: typeof input.featured === 'boolean'
      ? input.featured
      : visibility === 'featured',
    tags: normalizeTags(input.tags),
    versions,
    currentVersion,
    createdAt,
    updatedAt,
  };
}

export function normalizePresetSummary(entry: PresetEntry): PresetSummary {
  const familyName = entry.familyName ?? entry.name;
  const variantName = entry.variantName ?? entry.name;
  const scope = getPresetScope(entry, entry.type);
  const engine = canonicalizePresetScope(entry.engine);
  const source = canonicalizePresetScope(entry.source);
  const familyId = entry.familyId ?? makeDerivedFamilyId(entry.type, scope, familyName);
  const variantId = entry.variantId ?? makeDerivedVariantId(entry.type, scope, familyName, variantName);
  const currentVersion = entry.versions.find(version => version.v === entry.currentVersion)
    ?? entry.versions[entry.versions.length - 1];
  const journeyPreview = entry.type === 'journey'
    ? normalizeJourneyPresetPreview(currentVersion?.journeyPreview)
    : undefined;
  return {
    id: entry.id,
    type: entry.type,
    scope,
    engine,
    source,
    name: entry.name,
    author: entry.author,
    library: entry.library ?? (entry.author === 'factory' ? 'stock' : entry.author === 'cloud' ? 'cloud' : 'user'),
    creator: entry.creator,
    description: entry.description,
    visibility: entry.visibility ?? (entry.library === 'cloud' ? 'public' : entry.library === 'stock' ? 'featured' : 'private'),
    familyId,
    familyName,
    variantId,
    variantName,
    variantRank: entry.variantRank,
    remoteId: entry.remoteId,
    playCount: entry.playCount,
    featured: entry.featured,
    rating: entry.rating,
    journeyPreview,
    tags: entry.tags,
    versionCount: entry.versions.length,
    currentVersion: entry.currentVersion,
    updatedAt: entry.updatedAt,
  };
}

export function isPresetCompatibleWithSlot(
  entry: Pick<PresetEntry, 'type' | 'engine' | 'source' | 'scope'> | null | undefined,
  level: PresetLevel,
  scope?: string,
): boolean {
  if (!entry || entry.type !== level) return false;
  const entryScope = getPresetScope(entry, entry.type);
  if (scope) return arePresetScopesCompatible(entryScope, scope);
  if (level === 'engine' || level === 'kit' || level === 'source') return Boolean(entryScope);
  return true;
}

function diffValues(prefix: string, left: unknown, right: unknown, changed: Set<string>): void {
  if (presetValuesEqual(left, right)) return;

  if (Array.isArray(left) && Array.isArray(right)) {
    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index++) {
      diffValues(`${prefix}[${index}]`, left[index], right[index], changed);
    }
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      diffValues(childPrefix, left[key], right[key], changed);
    }
    return;
  }

  changed.add(prefix);
}

export function comparePresetVersions(
  current: PresetVersion | null | undefined,
  other: PresetVersion | null | undefined,
): string[] {
  if (!current || !other) return [];

  const changed = new Set<string>();
  const allDataKeys = new Set([...Object.keys(current.data), ...Object.keys(other.data)]);
  for (const key of allDataKeys) {
    diffValues(key, current.data[key], other.data[key], changed);
  }

  for (const field of PRESET_VERSION_METADATA_FIELDS) {
    diffValues(field, current[field], other[field], changed);
  }

  diffValues('refs', current.refs, other.refs, changed);

  return [...changed].sort();
}
