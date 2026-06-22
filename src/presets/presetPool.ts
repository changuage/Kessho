import type { PresetLibrary, PresetLevel, PresetPoolMetadata } from './types';
import { canonicalizePresetScope } from './presetScopeAliases';

export interface PresetPoolCandidate {
  id: string;
  name: string;
  library?: PresetLibrary;
  tags?: string[];
  aliases?: string[];
  subtitle?: string;
  updatedAt?: number;
  rating?: number;
}

export const PRESET_POOL_ICON = '⧉' as const;
export const PRESET_POOL_METADATA_VERSION = 1 as const;

const PAD_POOL_KEY = 'pad';
const LEAD_POOL_KEY = 'lead4opfm';

const DRUM_POOL_KEYS = new Set([
  'drumSub',
  'drumKick',
  'drumClick',
  'drumBeepHi',
  'drumBeepLo',
  'drumNoise',
  'drumMembrane',
]);

const POOL_LABELS: Record<string, string> = {
  [PAD_POOL_KEY]: 'Pad Synths',
  [LEAD_POOL_KEY]: 'Lead Synths',
  drumSub: 'Drum Sub',
  drumKick: 'Drum Kick',
  drumClick: 'Drum Click',
  drumBeepHi: 'Drum Beep Hi',
  drumBeepLo: 'Drum Beep Lo',
  drumNoise: 'Drum Noise',
  drumMembrane: 'Drum Membrane',
};

const DEFAULT_POOL_HINTS: Record<string, string[]> = {
  [PAD_POOL_KEY]: ['saturated_drift', 'buchla_pluck', 'soft_pluck', 'Saturated Drift', 'Buchla Pluck', 'Soft Pluck'],
  [LEAD_POOL_KEY]: ['soft_rhodes', 'gamelan', 'Soft Rhodes', 'Gamelan'],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizePresetTag(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const normalized = tag.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePresetTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const next = normalizePresetTag(tag);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

export function normalizePresetPoolId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const normalized = id.trim();
  return normalized.length > 0 ? normalized : null;
}

function poolMatchKey(value: unknown): string | null {
  const normalized = normalizePresetPoolId(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizePoolIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rawId of value) {
    const id = normalizePresetPoolId(rawId);
    const key = poolMatchKey(id);
    if (!id || !key || seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

export function createEmptyPresetPool(): PresetPoolMetadata {
  return { version: PRESET_POOL_METADATA_VERSION, pools: {} };
}

export function normalizePresetPoolMetadata(value: unknown): PresetPoolMetadata | undefined {
  if (!isPlainObject(value)) return undefined;
  const rawPools = isPlainObject(value.pools) ? value.pools : {};
  const pools: Record<string, string[]> = {};

  for (const [rawKey, rawIds] of Object.entries(rawPools)) {
    const key = normalizePresetPoolId(rawKey);
    if (!key || !Array.isArray(rawIds)) continue;
    const ids = normalizePoolIds(rawIds);
    pools[key] = ids;
  }

  return {
    version: PRESET_POOL_METADATA_VERSION,
    pools,
  };
}

export function resolvePresetPoolKey(level: PresetLevel, scope?: string): string | null {
  if (level !== 'engine') return null;
  const normalizedScope = canonicalizePresetScope(scope) ?? scope;
  if (!normalizedScope) return null;
  if (normalizedScope === 'pad1' || normalizedScope === 'pad2') return PAD_POOL_KEY;
  if (normalizedScope === 'lead4opfm' || normalizedScope === 'lead1' || normalizedScope === 'lead2') return LEAD_POOL_KEY;
  if (DRUM_POOL_KEYS.has(normalizedScope)) return normalizedScope;
  return null;
}

export function getPresetPoolLabel(poolKey: string): string {
  return POOL_LABELS[poolKey] ?? poolKey;
}

function candidateKeys(candidate: PresetPoolCandidate): string[] {
  return [
    candidate.id,
    candidate.name,
    ...(candidate.aliases ?? []),
  ].map(poolMatchKey).filter((key): key is string => Boolean(key));
}

export function presetPoolCandidateMatches(candidate: PresetPoolCandidate, ids: readonly string[]): boolean {
  if (ids.length === 0) return false;
  const idSet = new Set(ids.map(poolMatchKey).filter((key): key is string => Boolean(key)));
  return candidateKeys(candidate).some(key => idSet.has(key));
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getDefaultPresetPoolIds(poolKey: string, candidates: readonly PresetPoolCandidate[]): string[] {
  const hints = DEFAULT_POOL_HINTS[poolKey];
  if (hints) {
    const byKey = new Map<string, PresetPoolCandidate>();
    for (const candidate of candidates) {
      for (const key of candidateKeys(candidate)) {
        if (!byKey.has(key)) byKey.set(key, candidate);
      }
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const hint of hints) {
      const candidate = byKey.get(hint.toLowerCase());
      const id = candidate?.id ?? normalizePresetPoolId(hint);
      const key = poolMatchKey(id);
      if (!id || !key || seen.has(key)) continue;
      seen.add(key);
      ids.push(id);
    }
    return ids;
  }

  if (DRUM_POOL_KEYS.has(poolKey)) {
    return [...candidates]
      .sort((left, right) => {
        const rank = hashText(`${poolKey}:${left.id}:${left.name}`) - hashText(`${poolKey}:${right.id}:${right.name}`);
        return rank !== 0 ? rank : left.name.localeCompare(right.name);
      })
      .slice(0, 3)
      .map(candidate => candidate.id);
  }

  return candidates.slice(0, 8).map(candidate => candidate.id);
}

export function filterPresetPoolCandidates(
  candidates: readonly PresetPoolCandidate[],
  ids: readonly string[],
  keepIds: readonly string[] = [],
): PresetPoolCandidate[] {
  if (ids.length === 0 && keepIds.length === 0) return [];
  const keepSet = new Set(keepIds.map(poolMatchKey).filter((key): key is string => Boolean(key)));
  return candidates.filter(candidate => {
    if (presetPoolCandidateMatches(candidate, ids)) return true;
    return candidateKeys(candidate).some(key => keepSet.has(key));
  });
}

export function collectPresetPoolTags(candidates: readonly PresetPoolCandidate[]): string[] {
  const tags = new Set<string>();
  for (const candidate of candidates) {
    for (const tag of normalizePresetTags(candidate.tags)) {
      tags.add(tag);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}
