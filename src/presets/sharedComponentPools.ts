import { PARAM_REGISTRY } from './ParamRegistry';
import type { PresetContentCandidate, PresetContentNodeType } from './contentNodes';
import { PAD1_TO_PAD2_KEY, PAD_PRESET_PARAM_KEYS } from '../audio/padPresets';

export type SharedComponentPoolKind = 'granularVoice' | 'dynamicsEq' | 'sampleVoice';

export interface SharedComponentPoolInstance {
  id: string;
  refSlot: string;
  contentType: PresetContentNodeType;
  content: Record<string, unknown>;
  hydrate: (content: Record<string, unknown>) => Record<string, unknown>;
}

function canonicalizePrefixedScope(
  state: Record<string, unknown>,
  scope: string,
  prefix: string,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(PARAM_REGISTRY)
    .filter(([, entry]) => entry.scope === scope)
    .map(([key]) => [key.slice(prefix.length), state[key]])
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function hydratePrefixedContent(prefix: string, content: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(content).map(([key, value]) => [`${prefix}${key}`, value]));
}

export function buildGranularVoicePoolInstance(
  state: Record<string, unknown>,
  laneIndex: number,
): SharedComponentPoolInstance {
  if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex > 3) {
    throw new Error(`Invalid granular voice index: ${laneIndex}`);
  }
  const lane = laneIndex + 1;
  const prefix = `granularV${lane}`;
  return {
    id: `granular.${laneIndex}`,
    refSlot: `granular.voice.${lane}.content`,
    contentType: 'granularVoice',
    content: canonicalizePrefixedScope(state, `granularVoice${lane}`, prefix),
    hydrate: content => hydratePrefixedContent(prefix, content),
  };
}

export function buildDynamicsEqPoolInstance(
  state: Record<string, unknown>,
  laneIndex: number,
): SharedComponentPoolInstance {
  if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex > 1) {
    throw new Error(`Invalid dynamics EQ index: ${laneIndex}`);
  }
  const lane = laneIndex + 1;
  const prefix = `dynamicsEq${lane}`;
  return {
    id: `dynamics.eq.${laneIndex}`,
    refSlot: `dynamics.eq.${lane}.content`,
    contentType: 'dynamicsEq',
    content: canonicalizePrefixedScope(state, `dynamicsEq${lane}`, prefix),
    hydrate: content => hydratePrefixedContent(prefix, content),
  };
}

const SAMPLE_BINDING_SUFFIXES = new Set([
  'Enabled', 'Level', 'DelayASend', 'DelayBSend', 'DiffuseSend', 'ReverbSend',
]);

export function buildSampleVoicePoolInstance(
  state: Record<string, unknown>,
  laneIndex: number,
): SharedComponentPoolInstance {
  if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex > 1) {
    throw new Error(`Invalid sample voice index: ${laneIndex}`);
  }
  const lane = laneIndex + 1;
  const prefix = `sample${lane}`;
  const content = Object.fromEntries(Object.entries(state)
    .filter(([key, value]) => key.startsWith(prefix) && value !== undefined)
    .map(([key, value]) => [key.slice(prefix.length), value])
    .filter(([suffix]) => !SAMPLE_BINDING_SUFFIXES.has(String(suffix)))
    .sort(([left], [right]) => String(left).localeCompare(String(right))));
  return {
    id: `sample.${laneIndex}`,
    refSlot: `sample.voice.${lane}.content`,
    contentType: 'sampleVoice',
    content,
    hydrate: value => hydratePrefixedContent(prefix, value),
  };
}

export function buildPadVoicePoolInstance(
  state: Record<string, unknown>,
  laneIndex: number,
): SharedComponentPoolInstance {
  if (laneIndex !== 0 && laneIndex !== 1) throw new Error(`Invalid pad voice index: ${laneIndex}`);
  const content: Record<string, unknown> = {};
  for (const canonicalKey of PAD_PRESET_PARAM_KEYS) {
    const runtimeKey = laneIndex === 0 ? canonicalKey : PAD1_TO_PAD2_KEY[canonicalKey];
    if (runtimeKey && state[runtimeKey] !== undefined) content[canonicalKey] = state[runtimeKey];
  }
  const lane = laneIndex + 1;
  return {
    id: `pad.${laneIndex}`,
    refSlot: `pad.voice.${lane}.content`,
    contentType: 'padVoice',
    content,
    hydrate: value => hydratePadContent(laneIndex, value),
  };
}

function hydratePadContent(laneIndex: number, content: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [canonicalKey, value] of Object.entries(content)) {
    if (canonicalKey === 'extensions') continue;
    const runtimeKey = laneIndex === 0
      ? canonicalKey
      : PAD1_TO_PAD2_KEY[canonicalKey as keyof typeof PAD1_TO_PAD2_KEY];
    if (runtimeKey) patch[runtimeKey] = value;
  }
  return patch;
}

export function sharedComponentPoolCandidates(
  instances: readonly SharedComponentPoolInstance[],
): PresetContentCandidate[] {
  return instances.map(instance => ({
    id: instance.id,
    contentType: instance.contentType,
    content: instance.content,
  }));
}

export function hydrateSharedComponentRef(
  refSlot: string,
  contentType: string,
  content: Record<string, unknown>,
): Record<string, unknown> | null {
  let match = /^granular\.voice\.([1-4])\.content$/.exec(refSlot);
  if (match && contentType === 'granularVoice') {
    return hydratePrefixedContent(`granularV${match[1]}`, content);
  }
  match = /^dynamics\.eq\.([1-2])\.content$/.exec(refSlot);
  if (match && contentType === 'dynamicsEq') {
    return hydratePrefixedContent(`dynamicsEq${match[1]}`, content);
  }
  match = /^sample\.voice\.([1-2])\.content$/.exec(refSlot);
  if (match && contentType === 'sampleVoice') {
    return hydratePrefixedContent(`sample${match[1]}`, content);
  }
  match = /^pad\.voice\.([1-2])\.content$/.exec(refSlot);
  if (match && contentType === 'padVoice') {
    return hydratePadContent(Number(match[1]) - 1, content);
  }
  return null;
}

export function stripSharedComponentContentFromParent(
  data: Record<string, unknown>,
  parentType: string,
  parentScope: string | undefined,
): Record<string, unknown> {
  const removedScopes = parentType === 'kit' && parentScope === 'granularKit'
    ? new Set(['granularVoice1', 'granularVoice2', 'granularVoice3', 'granularVoice4'])
    : parentType === 'source' && parentScope === 'dynamicsBus'
      ? new Set(['dynamicsEq1', 'dynamicsEq2'])
      : null;
  return Object.fromEntries(Object.entries(data).filter(([key]) => {
    if (removedScopes?.has(PARAM_REGISTRY[key]?.scope ?? '')) return false;
    if (parentType === 'source' && parentScope === 'synth') {
      const match = /^sample[12](.+)$/.exec(key);
      if (match && !SAMPLE_BINDING_SUFFIXES.has(match[1] ?? '')) return false;
    }
    if (parentType === 'kit' && (parentScope === 'pad1Kit' || parentScope === 'pad2Kit')) {
      const targetScope = parentScope === 'pad1Kit' ? 'pad1' : 'pad2';
      if (PARAM_REGISTRY[key]?.scope === targetScope && !/(?:DiffuseSend)$/.test(key)) return false;
    }
    return true;
  }));
}
