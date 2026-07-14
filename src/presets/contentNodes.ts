import {
  canonicalizeContentRecord,
  hashCanonicalContentText,
  stableStringifyContent,
} from './contentCanonicalization';

export const PRESET_CONTENT_NODE_SCHEMA_VERSION = 1 as const;
export const PRESET_CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export const PRESET_CONTENT_NODE_TYPES = [
  'sequencerTrigger',
  'sequencerSubLane',
  'sequencerLaneControl',
  'granularVoice',
  'granularSelection',
  'padVoice',
  'sampleVoice',
  'dynamicsEq',
  'drumSubVoice',
  'drumKickVoice',
  'drumClickVoice',
  'drumBeepHiVoice',
  'drumBeepLoVoice',
  'drumNoiseVoice',
  'drumMembraneVoice',
  'insectsVoice',
  'harmonyChordBank',
  'harmonySequenceBank',
  'harmonyContext',
  'waterEndpoint',
  'sequencerArrangement',
  'mixRouting',
  'parameterBehaviorMap',
] as const;

export type PresetContentNodeType = (typeof PRESET_CONTENT_NODE_TYPES)[number];

export interface PresetContentNodeEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  contentType: PresetContentNodeType;
  schemaVersion: typeof PRESET_CONTENT_NODE_SCHEMA_VERSION;
  content: T;
}

export type PresetParameterBehaviorMode = 'single' | 'walk' | 'sampleHold';

export interface PresetParameterBehavior {
  mode: PresetParameterBehaviorMode;
  range?: { min: number; max: number };
}

export interface PresetContentCandidate {
  id: string;
  contentType: PresetContentNodeType;
  content: Record<string, unknown>;
}

export interface PreparedPresetContentNode {
  id: string;
  envelope: PresetContentNodeEnvelope;
  canonicalJson: string;
  hash: string;
}

export interface PreparedPresetContentBatch {
  byId: ReadonlyMap<string, PreparedPresetContentNode>;
  uniqueByHash: ReadonlyMap<string, PreparedPresetContentNode>;
}

export interface PresetContentComponentRef {
  componentSlot: string;
  contentType: PresetContentNodeType;
  contentHash: string;
}

export interface PresetContentRefGroupSignature {
  groupType: 'sequencer' | 'harmony';
  components: PresetContentComponentRef[];
  inline?: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertCanonicalJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item === undefined) throw new Error(`${path}[${index}] cannot be undefined`);
      assertCanonicalJsonValue(item, `${path}[${index}]`);
    });
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) assertCanonicalJsonValue(item, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} is not canonical JSON data`);
}

function assertContentNodeType(value: string): asserts value is PresetContentNodeType {
  if (!(PRESET_CONTENT_NODE_TYPES as readonly string[]).includes(value)) {
    throw new Error(`Unknown preset content type: ${value}`);
  }
}

function assertComponentSlot(value: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid content component slot: ${value}`);
  }
}

export function createPresetContentNode<T extends Record<string, unknown>>(
  contentType: PresetContentNodeType,
  content: T,
): PresetContentNodeEnvelope<T> {
  assertContentNodeType(contentType);
  if (!isPlainObject(content)) throw new Error(`${contentType} content must be a plain object`);
  assertCanonicalJsonValue(content, `${contentType}.content`);
  return {
    contentType,
    schemaVersion: PRESET_CONTENT_NODE_SCHEMA_VERSION,
    content: canonicalizeContentRecord(content) as T,
  };
}

export function normalizePresetParameterBehavior(
  value: Partial<PresetParameterBehavior> | null | undefined,
): PresetParameterBehavior {
  const mode: PresetParameterBehaviorMode = value?.mode === 'walk' || value?.mode === 'sampleHold'
    ? value.mode
    : 'single';
  if (mode === 'single' || !value?.range) return { mode };
  const rawMin = Number.isFinite(value.range.min) ? value.range.min : 0;
  const rawMax = Number.isFinite(value.range.max) ? value.range.max : rawMin;
  return {
    mode,
    range: {
      min: Math.min(rawMin, rawMax),
      max: Math.max(rawMin, rawMax),
    },
  };
}

export function normalizePresetContentComponentRefs(
  refs: readonly PresetContentComponentRef[],
): PresetContentComponentRef[] {
  const bySlot = new Map<string, PresetContentComponentRef>();
  for (const ref of refs) {
    assertComponentSlot(ref.componentSlot);
    assertContentNodeType(ref.contentType);
    if (!PRESET_CONTENT_HASH_PATTERN.test(ref.contentHash)) {
      throw new Error(`Invalid content hash for ${ref.componentSlot}`);
    }
    if (bySlot.has(ref.componentSlot)) {
      throw new Error(`Duplicate content component slot: ${ref.componentSlot}`);
    }
    bySlot.set(ref.componentSlot, { ...ref });
  }
  return [...bySlot.values()].sort((left, right) => left.componentSlot.localeCompare(right.componentSlot));
}

export function canonicalizePresetContentRefGroup(
  group: PresetContentRefGroupSignature,
): PresetContentRefGroupSignature {
  if (group.groupType !== 'sequencer' && group.groupType !== 'harmony') {
    throw new Error(`Unsupported content ref group: ${String(group.groupType)}`);
  }
  if (group.inline !== undefined) {
    if (!isPlainObject(group.inline)) throw new Error('Content ref group inline state must be a plain object');
    assertCanonicalJsonValue(group.inline, `${group.groupType}.inline`);
  }
  return {
    groupType: group.groupType,
    components: normalizePresetContentComponentRefs(group.components),
    ...(group.inline && Object.keys(group.inline).length > 0
      ? { inline: canonicalizeContentRecord(group.inline) }
      : {}),
  };
}

export async function hashPresetContentRefGroup(
  group: PresetContentRefGroupSignature,
): Promise<string> {
  return hashCanonicalContentText(stableStringifyContent({
    contentType: 'contentRefGroupSignature',
    schemaVersion: PRESET_CONTENT_NODE_SCHEMA_VERSION,
    content: canonicalizePresetContentRefGroup(group),
  }));
}

export function presetContentRefSlot(groupSlot: string, componentSlot: string): string {
  if (!/^[a-z][a-z0-9]*(?:\.[a-z0-9]+)*$/.test(groupSlot)) {
    throw new Error(`Invalid content ref group slot: ${groupSlot}`);
  }
  assertComponentSlot(componentSlot);
  return `${groupSlot}.${componentSlot}`;
}

export async function preparePresetContentBatch(
  candidates: readonly PresetContentCandidate[],
): Promise<PreparedPresetContentBatch> {
  const ids = new Set<string>();
  const preparedInputs = candidates.map((candidate) => {
    if (!candidate.id.trim()) throw new Error('Preset content candidate id is required');
    if (ids.has(candidate.id)) throw new Error(`Duplicate preset content candidate id: ${candidate.id}`);
    ids.add(candidate.id);
    const envelope = createPresetContentNode(candidate.contentType, candidate.content);
    return {
      id: candidate.id,
      envelope,
      canonicalJson: stableStringifyContent(envelope),
    };
  });

  const hashByCanonicalJson = new Map<string, Promise<string>>();
  for (const input of preparedInputs) {
    if (!hashByCanonicalJson.has(input.canonicalJson)) {
      hashByCanonicalJson.set(input.canonicalJson, hashCanonicalContentText(input.canonicalJson));
    }
  }
  await Promise.all(hashByCanonicalJson.values());

  const byId = new Map<string, PreparedPresetContentNode>();
  const uniqueByHash = new Map<string, PreparedPresetContentNode>();
  for (const input of preparedInputs) {
    const hash = await hashByCanonicalJson.get(input.canonicalJson);
    if (!hash) throw new Error(`Missing prepared hash for ${input.id}`);
    const prepared: PreparedPresetContentNode = { ...input, hash };
    const existing = uniqueByHash.get(hash);
    if (existing && existing.canonicalJson !== prepared.canonicalJson) {
      throw new Error(`Preset content hash collision: ${hash}`);
    }
    byId.set(input.id, prepared);
    if (!existing) uniqueByHash.set(hash, prepared);
  }

  return { byId, uniqueByHash };
}
