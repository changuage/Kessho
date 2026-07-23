import { extractCascade, extractParams, getVersionData } from './codec';
import {
  buildDrumEuclideanStateFromPatternData,
  buildSynthEuclideanStateFromPatternData,
  EUCLIDEAN_PATTERN_SOURCE_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY,
  extractEuclideanPatternDataFromDrumState,
  extractEuclideanPatternDataFromSynthState,
} from './euclideanPatternBank';
import { extractPresetVersionMetadata, presetValuesEqual } from './presetUtils';
import { hydrateOptimizedStatePresetData } from './statePresetOptimization';
import { canonicalizePresetScope } from './presetScopeAliases';
import type { PresetEntry, PresetLevel, PresetRef, PresetVersion, PresetVersionMetadata } from './types';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import {
  canonicalizeContentJson,
  canonicalizeContentRecord,
  contentUtf8ByteLength,
  hashCanonicalContent,
  hashCanonicalContentText,
  stableStringifyContent,
} from './contentCanonicalization';
import {
  DYNAMICS_DRIFT_PRESET_KEYS,
  DYNAMICS_EQ1_PRESET_KEYS,
  DYNAMICS_EQ2_PRESET_KEYS,
  DYNAMICS_EROSION_PRESET_KEYS,
  DYNAMICS_END_CHAIN_PRESET_KEYS,
  DYNAMICS_SATURATION_PRESET_KEYS,
  DYNAMICS_SIDECHAIN_PRESET_KEYS,
} from '../ui/dynamics/dynamicsPresets';
import { stripSequencerStateFromSoundContent } from './sequencerContent';

export type PresetPayloadKind = 'override' | 'metadata' | 'resolved' | 'patch' | 'refs_override' | 'content';

export interface PresetV2Row {
  id: string;
  owner_key: string;
  owner_user_id: string | null;
  type: PresetLevel;
  scope: string | null;
  name: string;
  author: 'factory' | 'user' | 'cloud';
  library: 'stock' | 'user' | 'cloud';
  creator: string | null;
  description: string | null;
  tags: string[] | null;
  visibility: 'private' | 'public' | 'featured';
  family_name: string | null;
  variant_name: string | null;
  variant_rank: number | null;
  forked_from: string | null;
  latest_version_no: number;
  latest_version_id: string | null;
  latest_resolved_hash: string | null;
  latest_metadata_hash: string | null;
  play_count: number | null;
  rating: number | null;
  archived: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresetVersionV2Row {
  id: string;
  preset_id: string;
  version_no: number;
  created_by: string | null;
  parent_version_id: string | null;
  storage_mode: 'snapshot' | 'patch' | 'checkpoint';
  note: string;
  override_hash: string | null;
  metadata_hash: string | null;
  patch_from_prev_hash: string | null;
  resolved_hash: string | null;
  is_checkpoint: boolean;
  created_at: string;
}

export interface PresetVersionRefV2Row {
  version_id: string;
  ref_slot: string;
  target_preset_id: string;
  target_version_no: number | null;
  follow_latest: boolean;
  override_hash: string | null;
  created_at: string;
}

export interface PresetVersionContentRefV2Row {
  version_id: string;
  ref_slot: string;
  content_hash: string;
  content_type: string;
  created_at: string;
}

export interface PresetPayloadV2Row {
  hash: string;
  payload_kind: PresetPayloadKind;
  payload: unknown;
  payload_bytes: number;
  created_at: string;
  last_seen_at: string;
}

interface RecordPatch {
  set: Record<string, unknown>;
  unset: string[];
}

export interface PresetVersionStorageSignature {
  resolvedHash: string | null;
  overrideHash: string | null;
  metadataHash: string | null;
  refKeys: readonly string[];
}

export interface PresetChildSpec {
  slot: string;
  type: PresetLevel;
  scope: string;
  extract: (state: SliderState, metadata?: PresetVersionMetadata) => Record<string, unknown>;
  strip?: (state: SliderState) => Record<string, unknown>;
}

// Existing V2 payload rows use SHA-256 over canonical JSON bytes only.
// Bump this marker and migration self-tests before changing the hash input.
export const PRESET_HASH_ALGORITHM = 'kessho-preset-json-sha256-v1';
export const PRESET_PAYLOAD_CACHE_KEY_PREFIX = 'kessho:presetPayload:v2:';
const PRESET_PAYLOAD_CACHE_MAX_BYTES = 5 * 1024 * 1024;
const PRESET_PAYLOAD_CACHE_MAX_ENTRIES = 256;
const PRESET_PAYLOAD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PRESET_PAYLOAD_CACHE_TOUCH_THROTTLE_MS = 5 * 60_000;
const PRESET_PAYLOAD_CACHE_PRUNE_THROTTLE_MS = 60_000;
const PRESET_PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;

type CachedPresetPayloadMemoryEntry = {
  payload: unknown;
  bytes: number;
  lastAccess: number;
};

type CachedPresetPayloadStorageEntry = CachedPresetPayloadMemoryEntry & {
  version: 1;
  hash: string;
  createdAt: number;
};

interface PresetPayloadCacheWriteOptions {
  verifiedCanonicalJson?: string;
}

const presetPayloadMemoryCache = new Map<string, CachedPresetPayloadMemoryEntry>();
const presetPayloadSessionVerifiedHashes = new Set<string>();
let presetPayloadPersistentCacheLastPrunedAt = 0;
const presetPayloadCacheDiagnostics = { hits: 0, misses: 0, writes: 0, evictions: 0 };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalizeJson(value: unknown): unknown {
  return canonicalizeContentJson(value);
}

export function canonicalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  return canonicalizeContentRecord(record);
}

export function stableStringifyCanonical(value: unknown): string {
  return stableStringifyContent(value);
}

export async function hashCanonicalJsonText(canonicalJson: string): Promise<string> {
  return hashCanonicalContentText(canonicalJson);
}

export async function hashCanonicalJson(value: unknown): Promise<string> {
  return hashCanonicalContent(value);
}

function isPresetPayloadCacheHash(hash: string): boolean {
  return PRESET_PAYLOAD_HASH_PATTERN.test(hash);
}

export function collectPresetPayloadHashesV2(hashes: readonly unknown[], maxHashes = 100): string[] {
  const unique = new Set<string>();
  for (const hash of hashes) {
    if (typeof hash !== 'string' || !PRESET_PAYLOAD_HASH_PATTERN.test(hash)) continue;
    unique.add(hash);
    if (unique.size >= maxHashes) break;
  }
  return [...unique];
}

function canUsePresetPayloadPersistentCache(): boolean {
  return typeof localStorage !== 'undefined';
}

function getPresetPayloadCacheStorageKey(hash: string): string {
  return `${PRESET_PAYLOAD_CACHE_KEY_PREFIX}${hash}`;
}

function getPayloadCacheBytes(payloadJson: string): number {
  return contentUtf8ByteLength(payloadJson);
}

function prunePresetPayloadMemoryCache(now = Date.now()): void {
  for (const [hash, entry] of presetPayloadMemoryCache) {
    if (entry.lastAccess + PRESET_PAYLOAD_CACHE_MAX_AGE_MS <= now) {
      presetPayloadMemoryCache.delete(hash);
    }
  }

  let totalBytes = 0;
  for (const entry of presetPayloadMemoryCache.values()) totalBytes += entry.bytes;
  if (totalBytes <= PRESET_PAYLOAD_CACHE_MAX_BYTES && presetPayloadMemoryCache.size <= PRESET_PAYLOAD_CACHE_MAX_ENTRIES) {
    return;
  }

  const oldestEntries = [...presetPayloadMemoryCache.entries()]
    .sort(([, left], [, right]) => left.lastAccess - right.lastAccess);
  for (const [hash, entry] of oldestEntries) {
    if (totalBytes <= PRESET_PAYLOAD_CACHE_MAX_BYTES && presetPayloadMemoryCache.size <= PRESET_PAYLOAD_CACHE_MAX_ENTRIES) break;
    presetPayloadMemoryCache.delete(hash);
    totalBytes -= entry.bytes;
  }
}

function prunePresetPayloadPersistentCache(now = Date.now(), force = false): void {
  if (!canUsePresetPayloadPersistentCache()) return;
  if (!force && presetPayloadPersistentCacheLastPrunedAt + PRESET_PAYLOAD_CACHE_PRUNE_THROTTLE_MS > now) return;

  try {
    presetPayloadPersistentCacheLastPrunedAt = now;
    const activeEntries: Array<{ key: string; bytes: number; lastAccess: number }> = [];
    let totalBytes = 0;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PRESET_PAYLOAD_CACHE_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) {
        localStorage.removeItem(key);
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<CachedPresetPayloadStorageEntry> | null;
        const bytes = typeof parsed?.bytes === 'number' ? parsed.bytes : getPayloadCacheBytes(raw);
        const lastAccess = typeof parsed?.lastAccess === 'number' ? parsed.lastAccess : 0;
        if (lastAccess + PRESET_PAYLOAD_CACHE_MAX_AGE_MS <= now) {
          localStorage.removeItem(key);
          continue;
        }
        activeEntries.push({ key, bytes, lastAccess });
        totalBytes += bytes;
      } catch {
        localStorage.removeItem(key);
      }
    }

    activeEntries.sort((left, right) => left.lastAccess - right.lastAccess);
    let activeCount = activeEntries.length;
    for (const entry of activeEntries) {
      if (activeCount <= PRESET_PAYLOAD_CACHE_MAX_ENTRIES && totalBytes <= PRESET_PAYLOAD_CACHE_MAX_BYTES) break;
      localStorage.removeItem(entry.key);
      totalBytes -= entry.bytes;
      activeCount -= 1;
    }
  } catch {
    // Persistent payload caching is best-effort.
  }
}

export function readPresetPayloadCacheV2(hash: string): unknown | undefined {
  if (!isPresetPayloadCacheHash(hash)) return undefined;
  const now = Date.now();
  const memory = presetPayloadMemoryCache.get(hash);
  if (
    memory
    && presetPayloadSessionVerifiedHashes.has(hash)
    && memory.lastAccess + PRESET_PAYLOAD_CACHE_MAX_AGE_MS > now
  ) {
    memory.lastAccess = now;
    return memory.payload;
  }
  if (memory) presetPayloadMemoryCache.delete(hash);

  return undefined;
}

export async function readVerifiedPresetPayloadCacheV2(hash: string): Promise<unknown | undefined> {
  const memory = readPresetPayloadCacheV2(hash);
  if (memory !== undefined) {
    presetPayloadCacheDiagnostics.hits += 1;
    return memory;
  }
  if (!isPresetPayloadCacheHash(hash) || !canUsePresetPayloadPersistentCache()) {
    presetPayloadCacheDiagnostics.misses += 1;
    return undefined;
  }

  const now = Date.now();
  const storageKey = getPresetPayloadCacheStorageKey(hash);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      presetPayloadCacheDiagnostics.misses += 1;
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<CachedPresetPayloadStorageEntry> | null;
    if (
      !parsed
      || parsed.version !== 1
      || parsed.hash !== hash
      || !('payload' in parsed)
      || typeof parsed.bytes !== 'number'
      || typeof parsed.lastAccess !== 'number'
      || parsed.lastAccess + PRESET_PAYLOAD_CACHE_MAX_AGE_MS <= now
    ) {
      localStorage.removeItem(storageKey);
      presetPayloadCacheDiagnostics.misses += 1;
      return undefined;
    }

    const canonicalJson = stableStringifyCanonical(parsed.payload);
    const computedHash = await hashCanonicalJsonText(canonicalJson);
    if (computedHash !== hash) {
      localStorage.removeItem(storageKey);
      presetPayloadMemoryCache.delete(hash);
      presetPayloadSessionVerifiedHashes.delete(hash);
      presetPayloadCacheDiagnostics.misses += 1;
      return undefined;
    }

    const entry: CachedPresetPayloadStorageEntry = {
      version: 1,
      hash,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : now,
      lastAccess: now,
      bytes: parsed.bytes,
      payload: parsed.payload,
    };
    presetPayloadSessionVerifiedHashes.add(hash);
    presetPayloadMemoryCache.set(hash, {
      payload: entry.payload,
      bytes: entry.bytes,
      lastAccess: now,
    });
    if (parsed.lastAccess + PRESET_PAYLOAD_CACHE_TOUCH_THROTTLE_MS > now) {
      prunePresetPayloadMemoryCache(now);
      presetPayloadCacheDiagnostics.hits += 1;
      return entry.payload;
    }
    localStorage.setItem(storageKey, JSON.stringify(entry));
    prunePresetPayloadMemoryCache(now);
    presetPayloadCacheDiagnostics.hits += 1;
    return entry.payload;
  } catch {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
    presetPayloadMemoryCache.delete(hash);
    presetPayloadSessionVerifiedHashes.delete(hash);
    presetPayloadCacheDiagnostics.misses += 1;
    return undefined;
  }
}

export async function writePresetPayloadCacheV2(
  hash: string,
  payload: unknown,
  options?: PresetPayloadCacheWriteOptions,
): Promise<void> {
  if (!isPresetPayloadCacheHash(hash) || payload === undefined) return;
  const payloadJson = options?.verifiedCanonicalJson ?? stableStringifyCanonical(payload);
  if (options?.verifiedCanonicalJson === undefined) {
    const computedHash = await hashCanonicalJsonText(payloadJson);
    if (computedHash !== hash) return;
  }

  const now = Date.now();
  const bytes = getPayloadCacheBytes(payloadJson);
  const memoryEntry = { payload, bytes, lastAccess: now };
  presetPayloadSessionVerifiedHashes.add(hash);
  presetPayloadCacheDiagnostics.writes += 1;
  presetPayloadMemoryCache.set(hash, memoryEntry);
  prunePresetPayloadMemoryCache(now);

  if (!canUsePresetPayloadPersistentCache()) return;
  try {
    if (bytes > PRESET_PAYLOAD_CACHE_MAX_BYTES) return;
    const storageEntry: CachedPresetPayloadStorageEntry = {
      version: 1,
      hash,
      payload,
      bytes,
      createdAt: now,
      lastAccess: now,
    };
    localStorage.setItem(getPresetPayloadCacheStorageKey(hash), JSON.stringify(storageEntry));
    prunePresetPayloadPersistentCache(now);
  } catch {
    // Persistent payload caching is best-effort.
  }
}

export function evictPresetPayloadCacheV2(hash?: string): void {
  const hashes = hash ? [hash] : [...presetPayloadMemoryCache.keys()];
  for (const candidate of hashes) {
    if (presetPayloadMemoryCache.has(candidate) || presetPayloadSessionVerifiedHashes.has(candidate)) {
      presetPayloadCacheDiagnostics.evictions += 1;
    }
    presetPayloadMemoryCache.delete(candidate);
    presetPayloadSessionVerifiedHashes.delete(candidate);
    if (canUsePresetPayloadPersistentCache()) {
      try {
        localStorage.removeItem(getPresetPayloadCacheStorageKey(candidate));
      } catch {
        // Cache eviction remains best-effort when storage is unavailable.
      }
    }
  }
}

export function getPresetPayloadCacheDiagnosticsV2(): {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  hitRate: number;
} {
  const reads = presetPayloadCacheDiagnostics.hits + presetPayloadCacheDiagnostics.misses;
  return {
    ...presetPayloadCacheDiagnostics,
    hitRate: reads > 0 ? presetPayloadCacheDiagnostics.hits / reads : 0,
  };
}

export function presetVersionStorageSignaturesEqual(
  left: PresetVersionStorageSignature | null | undefined,
  right: PresetVersionStorageSignature | null | undefined,
): boolean {
  if (!left || !right) return false;
  if (left.resolvedHash !== right.resolvedHash) return false;
  if (left.overrideHash !== right.overrideHash) return false;
  if (left.metadataHash !== right.metadataHash) return false;
  if (left.refKeys.length !== right.refKeys.length) return false;
  const leftRefs = [...left.refKeys].sort();
  const rightRefs = [...right.refKeys].sort();
  return leftRefs.every((key, index) => key === rightRefs[index]);
}

export function computeRecordPatch(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): RecordPatch | null {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  for (const key of keys) {
    if (!(key in next)) {
      unset.push(key);
      continue;
    }
    if (!(key in previous) || !presetValuesEqual(previous[key], next[key])) {
      set[key] = next[key];
    }
  }

  if (!unset.length && !Object.keys(set).length) return null;
  return {
    set: canonicalizeRecord(set),
    unset: [...unset].sort(),
  };
}

export function applyRecordPatch(
  previous: Record<string, unknown>,
  patch: RecordPatch | null | undefined,
): Record<string, unknown> {
  if (!patch) return canonicalizeRecord(previous);

  const next: Record<string, unknown> = { ...previous };
  for (const key of patch.unset) {
    delete next[key];
  }
  for (const [key, value] of Object.entries(patch.set)) {
    next[key] = value;
  }
  return canonicalizeRecord(next);
}

function engineChild(slot: string, scope: string): PresetChildSpec {
  return {
    slot,
    type: 'engine',
    scope,
    extract: (state) => canonicalizeRecord(extractParams(state, 1, scope)),
  };
}

function kitChild(slot: string, scope: string): PresetChildSpec {
  return {
    slot,
    type: 'kit',
    scope,
    extract: (state) => canonicalizeRecord(extractCascade(state, 2, scope)),
  };
}

function engineSubsetChild(slot: string, scope: string, keys: readonly (keyof SliderState)[]): PresetChildSpec {
  return {
    slot,
    type: 'engine',
    scope,
    extract: (state) => {
      const data: Record<string, unknown> = {};
      for (const key of keys) {
        data[key] = state[key];
      }
      return canonicalizeRecord(data);
    },
  };
}

function kitSubsetChild(slot: string, scope: string, keys: readonly (keyof SliderState)[]): PresetChildSpec {
  return {
    slot,
    type: 'kit',
    scope,
    extract: (state) => {
      const data: Record<string, unknown> = {};
      for (const key of keys) {
        data[key] = state[key];
      }
      return canonicalizeRecord(data);
    },
  };
}

function withStepOverrides(
  data: Record<string, unknown>,
  stepOverrides: unknown,
): Record<string, unknown> {
  if (!stepOverrides || typeof stepOverrides !== 'object' || !Object.keys(stepOverrides).length) {
    return data;
  }
  return canonicalizeRecord({
    ...data,
    [EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY]: stepOverrides,
  });
}

function hasObjectContent(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

function hasArrayContent(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function extractEuclideanSourceSequenceState(
  metadata: PresetVersionMetadata | undefined,
  source: 'drums' | 'synth',
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const state: Record<string, unknown> = source === 'synth'
    ? {
        clockDivs: metadata.synthClockDivs,
        swings: metadata.synthSwings,
        linked: metadata.synthLinked,
        evolveConfigs: metadata.synthEvolveConfigs,
        subLaneStates: metadata.synthSubLaneStates,
        playConfigs: metadata.synthPlayConfigs ?? metadata.synthArpConfigs,
        pitchSettings: metadata.synthPitchSettings,
        pitchBindingModes: metadata.synthPitchBindingModes,
      }
    : {
        clockDivs: metadata.drumClockDivs,
        swings: metadata.drumSwings,
        linked: metadata.drumLinked,
        evolveConfigs: metadata.drumEvolveConfigs,
        subLaneStates: metadata.drumSubLaneStates,
        pitchSettings: metadata.drumPitchSettings,
      };
  const picked = Object.fromEntries(
    Object.entries(state).filter(([, value]) => hasArrayContent(value) || hasObjectContent(value)),
  );
  return Object.keys(picked).length ? picked : undefined;
}

function withEuclideanSequencerMetadata(
  data: Record<string, unknown>,
  metadata: PresetVersionMetadata | undefined,
  source: 'drums' | 'synth',
): Record<string, unknown> {
  const stepOverrides = source === 'synth' ? metadata?.synthStepOverrides : metadata?.drumStepOverrides;
  const sourceSequenceState = extractEuclideanSourceSequenceState(metadata, source);
  const next = withStepOverrides(data, stepOverrides);
  if (!sourceSequenceState) return next;
  return canonicalizeRecord({
    ...next,
    [EUCLIDEAN_PATTERN_SOURCE_SEQUENCE_STATE_KEY]: sourceSequenceState,
  });
}

export function getPresetChildSpecs(type: PresetLevel, scope?: string): PresetChildSpec[] {
  const normalizedScope = canonicalizePresetScope(scope);
  if (type === 'state') {
    return [
      {
        slot: 'synth',
        type: 'source',
        scope: 'synth',
        extract: (state) => canonicalizeRecord(stripSequencerStateFromSoundContent(extractCascade(state, 3, 'synth'))),
      },
      {
        slot: 'drums',
        type: 'source',
        scope: 'drums',
        extract: (state) => canonicalizeRecord(stripSequencerStateFromSoundContent(extractCascade(state, 3, 'drums'))),
      },
      { slot: 'granular', type: 'source', scope: 'granular', extract: (state) => canonicalizeRecord(extractCascade(state, 3, 'granular')) },
      { slot: 'delay', type: 'source', scope: 'delay', extract: (state) => canonicalizeRecord(extractCascade(state, 3, 'delay')) },
      { slot: 'reverb', type: 'source', scope: 'reverb', extract: (state) => canonicalizeRecord(extractCascade(state, 3, 'reverb')) },
      { slot: 'degrade', type: 'source', scope: 'degrade', extract: (state) => canonicalizeRecord(extractCascade(state, 3, 'degrade')) },
      { slot: 'dynamicsBus', type: 'source', scope: 'dynamicsBus', extract: (state) => canonicalizeRecord(extractCascade(state, 3, 'dynamicsBus')) },
      { slot: 'masterFx', type: 'source', scope: 'masterFx', extract: (state) => canonicalizeRecord(extractCascade(state, 3, 'masterFx')) },
      { slot: 'earth', type: 'kit', scope: 'earthKit', extract: (state) => canonicalizeRecord(extractCascade(state, 2, 'earthKit')) },
    ];
  }

  if (type === 'source' && normalizedScope === 'synth') {
    return [
      {
        slot: 'euclideanPattern',
        type: 'engine',
        scope: 'euclideanPattern',
        extract: (state, metadata) => withEuclideanSequencerMetadata(
          canonicalizeRecord(extractEuclideanPatternDataFromSynthState(state)),
          metadata,
          'synth',
        ),
        strip: (state) => canonicalizeRecord(buildSynthEuclideanStateFromPatternData(extractEuclideanPatternDataFromSynthState(state))),
      },
      engineChild('leadDelay', 'leadDelay'),
      kitChild('pad1Kit', 'pad1Kit'),
      kitChild('pad2Kit', 'pad2Kit'),
      kitChild('lead1Kit', 'lead1Kit'),
      kitChild('lead2Kit', 'lead2Kit'),
    ];
  }

  if (type === 'source' && normalizedScope === 'drums') {
    return [
      {
        slot: 'euclideanPattern',
        type: 'engine',
        scope: 'euclideanPattern',
        extract: (state, metadata) => withEuclideanSequencerMetadata(
          canonicalizeRecord(extractEuclideanPatternDataFromDrumState(state)),
          metadata,
          'drums',
        ),
        strip: (state) => canonicalizeRecord(buildDrumEuclideanStateFromPatternData(extractEuclideanPatternDataFromDrumState(state))),
      },
      kitChild('drumKit', 'drumKit'),
    ];
  }

  if (type === 'source' && normalizedScope === 'granular') {
    return [
      kitChild('granularKit', 'granularKit'),
    ];
  }

  if (type === 'source' && normalizedScope === 'delay') {
    return [
      kitChild('delayKit', 'delayKit'),
    ];
  }

  if (type === 'source' && normalizedScope === 'dynamicsBus') {
    return [
      engineSubsetChild('eq1', 'dynamicsEq1', DYNAMICS_EQ1_PRESET_KEYS),
      engineSubsetChild('eq2', 'dynamicsEq2', DYNAMICS_EQ2_PRESET_KEYS),
      engineSubsetChild('sidechain', 'dynamicsSidechain', DYNAMICS_SIDECHAIN_PRESET_KEYS),
    ];
  }

  if (type === 'source' && normalizedScope === 'degrade') {
    return [
      kitSubsetChild('drift', 'degradeDrift', DYNAMICS_DRIFT_PRESET_KEYS),
      kitSubsetChild('erosion', 'degradeErosion', DYNAMICS_EROSION_PRESET_KEYS),
    ];
  }

  if (type === 'source' && normalizedScope === 'masterFx') {
    return [
      engineSubsetChild('saturation', 'dynamicsSaturation', DYNAMICS_SATURATION_PRESET_KEYS),
      engineSubsetChild('endChain', 'dynamicsEndChain', DYNAMICS_END_CHAIN_PRESET_KEYS),
    ];
  }

  if (type === 'kit' && normalizedScope === 'pad1Kit') {
    return [engineChild('pad1', 'pad1')];
  }

  if (type === 'kit' && normalizedScope === 'pad2Kit') {
    return [engineChild('pad2', 'pad2')];
  }

  if (type === 'kit' && normalizedScope === 'lead1Kit') {
    return [engineChild('lead1', 'lead1')];
  }

  if (type === 'kit' && normalizedScope === 'lead2Kit') {
    return [engineChild('lead2', 'lead2')];
  }

  if (type === 'kit' && normalizedScope === 'drumKit') {
    return [
      engineChild('drumSub', 'drumSub'),
      engineChild('drumKick', 'drumKick'),
      engineChild('drumClick', 'drumClick'),
      engineChild('drumBeepHi', 'drumBeepHi'),
      engineChild('drumBeepLo', 'drumBeepLo'),
      engineChild('drumNoise', 'drumNoise'),
      engineChild('drumMembrane', 'drumMembrane'),
    ];
  }

  if (type === 'kit' && normalizedScope === 'granularKit') {
    return [
      engineChild('granularVoice1', 'granularVoice1'),
      engineChild('granularVoice2', 'granularVoice2'),
      engineChild('granularVoice3', 'granularVoice3'),
      engineChild('granularVoice4', 'granularVoice4'),
      engineChild('granularLegacy', 'granularLegacy'),
      engineChild('legacyGranular', 'legacyGranular'),
    ];
  }

  if (type === 'kit' && normalizedScope === 'delayKit') {
    return [
      engineChild('leadDelay', 'leadDelay'),
      engineChild('echoLine', 'echoLine'),
      engineChild('clockedSpace', 'clockedSpace'),
    ];
  }

  if (type === 'kit' && normalizedScope === 'earthKit') {
    return [
      engineChild('water', 'water'),
      engineChild('insects1', 'insects1'),
      engineChild('insects2', 'insects2'),
    ];
  }

  return [];
}

function getPresetParamLevel(type: PresetLevel): 1 | 2 | 3 | 4 | null {
  switch (type) {
    case 'engine':
      return 1;
    case 'kit':
      return 2;
    case 'source':
      return 3;
    case 'state':
      return 4;
    case 'journey':
      return null;
  }
}

function getDefaultPresetData(type: PresetLevel, scope?: string): Record<string, unknown> {
  const level = getPresetParamLevel(type);
  if (level === null) return {};
  if (level === 4) return DEFAULT_STATE as unknown as Record<string, unknown>;
  if (level === 1) return extractParams(DEFAULT_STATE, level, scope);
  return extractCascade(DEFAULT_STATE, level, scope);
}

function withGenericSilentFallbacks(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };

  for (const [key, value] of Object.entries(next)) {
    if (
      /(?:Enabled|Active|Auto|Freeze)$/.test(key)
    ) {
      next[key] = false;
      continue;
    }
    if (
      typeof value === 'number'
      && /(?:Level|Gain|Mix|Send|Feedback|Probability|Density|Activity|Intensity|Drive|Depth|Amount|Repeats)$/.test(key)
    ) {
      next[key] = 0;
      continue;
    }
    if (key.endsWith('TensionMode')) {
      next[key] = 'bypass';
    }
  }

  return next;
}

function sourceSlotFallbackOverrides(slot: string): Record<string, unknown> {
  switch (slot) {
    case 'synth':
      return {
        synthLevel: 0,
        pad2Level: 0,
        leadLevel: 0,
        lead1Level: 0,
        lead2Level: 0,
        pianoLevel: 0,
        leadEnabled: false,
        leadRandomEnabled: false,
        pianoEnabled: false,
        synthEuclideanMasterEnabled: false,
        synthChordSequencerEnabled: false,
        padEnabled: false,
        pad2Enabled: false,
        lead2Enabled: false,
      };
    case 'drums':
      return {
        drumLevel: 0,
        drumEnabled: false,
        drumDelayEnabled: false,
        drumEuclidMasterEnabled: false,
      };
    case 'granular':
      return {
        granularLevel: 0,
        granularEnabled: false,
        granularFreeze: false,
        granularV1Enabled: false,
        granularV2Enabled: false,
        granularV3Enabled: false,
        granularV4Enabled: false,
      };
    case 'delay':
      return {
        delayAEnabled: false,
        delayAMix: 0,
        delayAFeedback: 0,
        drumDelayEnabled: false,
        drumDelayMix: 0,
        drumDelayFeedback: 0,
        granularDelayEnabled: false,
        granularDelayMix: 0,
        granularDelayRepeats: 0,
      };
    case 'reverb':
      return {
        reverbLevel: 0,
        reverbEnabled: false,
        spectralFreezeEnabled: false,
        spectralFreezeActive: false,
        spectralFreezeMix: 0,
      };
    case 'dynamicsBus':
      return {
        dynamicsBusEnabled: false,
        dynamicsEq1Enabled: false,
        dynamicsEq2Enabled: false,
        sidechainEnabled: false,
        sidechainMix: 0,
        sidechainAmount: 0,
      };
    case 'degrade':
      return {
        degradeEnabled: false,
        driftEnabled: false,
        driftMix: 0,
        erosionEnabled: false,
        erosionMix: 0,
      };
    case 'masterFx':
      return {
        dynamicsSaturationEnabled: false,
        dynamicsSaturationDrive: 0,
        endCompEnabled: false,
        endCompMix: 0,
      };
    case 'sidechain':
      return { sidechainMix: 0, sidechainAmount: 0 };
    case 'saturation':
      return { dynamicsSaturationDrive: 0 };
    case 'endChain':
      return { endCompMix: 0 };
    case 'earth':
      return {
        earthLevel: 0,
        natureLevel: 0,
        waterLevel: 0,
        insectsLevel: 0,
        insectsSharedLevel: 0,
        insects2Level: 0,
        oceanSampleLevel: 0,
        birdsLevel: 0,
        birds2Level: 0,
        frogsLevel: 0,
        waterEnabled: false,
        insectsEnabled: false,
        insects2Enabled: false,
        oceanSampleEnabled: false,
        birdsEnabled: false,
        birds2Enabled: false,
        frogsEnabled: false,
      };
    default:
      return {};
  }
}

function kitOrEngineSlotFallbackOverrides(slot: string): Record<string, unknown> {
  switch (slot) {
    case 'pad1':
    case 'pad1Kit':
      return { padEnabled: false, synthLevel: 0 };
    case 'pad2':
    case 'pad2Kit':
      return { pad2Enabled: false, pad2Level: 0 };
    case 'lead1':
    case 'lead1Kit':
      return { leadEnabled: false, lead1Level: 0, leadLevel: 0 };
    case 'lead2':
    case 'lead2Kit':
      return { lead2Enabled: false, lead2Level: 0 };
    case 'leadDelay':
    case 'delayKit':
      return { delayAEnabled: false, delayAMix: 0, delayAFeedback: 0 };
    case 'drumKit':
      return { drumEnabled: false, drumLevel: 0 };
    case 'drumSub':
    case 'drumKick':
    case 'drumClick':
    case 'drumBeepHi':
    case 'drumBeepLo':
    case 'drumNoise':
    case 'drumMembrane':
      return { [`${slot}Level`]: 0 };
    case 'euclideanPattern':
      return {
        synthEuclideanMasterEnabled: false,
        drumEuclidMasterEnabled: false,
        euclideanPatternEnabled: false,
      };
    case 'granularKit':
      return {
        granularEnabled: false,
        granularLevel: 0,
        granularV1Enabled: false,
        granularV2Enabled: false,
        granularV3Enabled: false,
        granularV4Enabled: false,
      };
    case 'earthKit':
      return sourceSlotFallbackOverrides('earth');
    case 'dynamicsBus':
      return sourceSlotFallbackOverrides('dynamicsBus');
    case 'masterFx':
      return sourceSlotFallbackOverrides('masterFx');
    case 'eq1':
      return {
        dynamicsEq1InputGain: 0,
        dynamicsEq1OutputGain: 0,
        dynamicsEq1LowGain: 0,
        dynamicsEq1MidGain: 0,
        dynamicsEq1HighGain: 0,
      };
    case 'eq2':
      return {
        dynamicsEq2InputGain: 0,
        dynamicsEq2OutputGain: 0,
        dynamicsEq2LowGain: 0,
        dynamicsEq2MidGain: 0,
        dynamicsEq2HighGain: 0,
      };
    case 'sidechain':
      return { sidechainMix: 0, sidechainAmount: 0 };
    case 'drift':
      return { driftMix: 0 };
    case 'degrade':
      return { degradeEnabled: false, driftEnabled: false, driftMix: 0, erosionEnabled: false, erosionMix: 0 };
    case 'erosion':
      return { erosionMix: 0 };
    case 'saturation':
      return { dynamicsSaturationDrive: 0 };
    case 'endChain':
      return { endCompMix: 0 };
    default:
      return {};
  }
}

export function buildMissingChildFallbackData(
  parentType: PresetLevel,
  parentScope: string | undefined,
  slot: string,
): Record<string, unknown> {
  const childSpec = getPresetChildSpecs(parentType, parentScope).find(spec => spec.slot === slot);
  if (!childSpec) return {};

  const defaultChildData = childSpec.extract(DEFAULT_STATE);
  const silentData = withGenericSilentFallbacks(defaultChildData);
  const slotOverrides = parentType === 'state'
    ? sourceSlotFallbackOverrides(slot)
    : kitOrEngineSlotFallbackOverrides(slot);

  return canonicalizeRecord({
    ...silentData,
    ...slotOverrides,
  });
}

export function normalizeResolvedVersionData(
  type: PresetLevel,
  scope: string | undefined,
  versionData: Record<string, unknown>,
): Record<string, unknown> {
  const defaultData = getDefaultPresetData(type, scope);
  if (type === 'state') {
    return canonicalizeRecord(
      {
        ...defaultData,
        ...hydrateOptimizedStatePresetData(versionData as unknown as Record<string, unknown>),
      },
    );
  }

  return canonicalizeRecord({
    ...defaultData,
    ...versionData,
  });
}

export function stripReferencedChildData(
  resolvedData: Record<string, unknown>,
  referencedChildData: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const override: Record<string, unknown> = { ...resolvedData };

  for (const childData of Object.values(referencedChildData)) {
    for (const [key, value] of Object.entries(childData)) {
      if (key in override && presetValuesEqual(override[key], value)) {
        delete override[key];
      }
    }
  }

  return canonicalizeRecord(override);
}

export function materializePresetVersion(
  row: PresetVersionV2Row,
  resolvedData: Record<string, unknown>,
  metadata?: PresetVersionMetadata,
  refs?: Record<string, PresetRef>,
): PresetVersion {
  const version: PresetVersion = {
    id: row.id,
    v: row.version_no,
    note: row.note,
    timestamp: new Date(row.created_at).getTime(),
    data: canonicalizeRecord(resolvedData),
  };

  if (refs && Object.keys(refs).length > 0) {
    version.refs = refs;
  }

  if (metadata) {
    Object.assign(version, metadata);
  }

  return version;
}

export function getResolvedVersionSnapshot(
  entry: PresetEntry,
  versionNo?: number,
): { data: Record<string, unknown>; metadata?: PresetVersionMetadata } | null {
  const data = getVersionData(entry, versionNo);
  if (!data) return null;

  const version = versionNo !== undefined
    ? entry.versions.find(candidate => candidate.v === versionNo)
    : (entry.versions.find(candidate => candidate.v === entry.currentVersion)
      ?? entry.versions[entry.versions.length - 1]);

  return {
    data: canonicalizeRecord(data),
    metadata: extractPresetVersionMetadata(version),
  };
}
