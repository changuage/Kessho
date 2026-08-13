import { PARAM_REGISTRY } from './ParamRegistry';
import type { PresetContentCandidate, PresetContentNodeType } from './contentNodes';
import { PAD1_TO_PAD2_KEY, PAD_PRESET_PARAM_KEYS } from '../audio/padPresets';

export type SharedComponentPoolKind = 'granularVoice' | 'dynamicsEq' | 'saturator' | 'sampleVoice';

export type SaturatorTarget = 'dynamics' | 'master' | 'neutral';

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

function lowerFirst(value: string): string {
  return value ? `${value[0]!.toLowerCase()}${value.slice(1)}` : value;
}

function canonicalizeProcessorContent(
  state: Record<string, unknown>,
  runtimePrefixes: readonly string[],
  suffixes: readonly string[],
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const suffix of suffixes) {
    const canonicalKey = lowerFirst(suffix);
    const value = state[canonicalKey]
      ?? state[suffix]
      ?? runtimePrefixes.map(prefix => state[`${prefix}${suffix}`]).find(candidate => candidate !== undefined);
    if (value !== undefined) content[canonicalKey] = value;
  }
  return Object.fromEntries(Object.entries(content).sort(([left], [right]) => left.localeCompare(right)));
}

function hydrateProcessorContent(
  runtimePrefix: string,
  content: Record<string, unknown>,
  suffixes: readonly string[],
): Record<string, unknown> {
  const canonical = canonicalizeProcessorContent(content, ['dynamicsEq1', 'dynamicsEq2', 'dynamicsSaturation', 'masterSaturation'], suffixes);
  return Object.fromEntries(Object.entries(canonical).map(([key, value]) => [
    `${runtimePrefix}${key[0]!.toUpperCase()}${key.slice(1)}`,
    value,
  ]));
}

const DYNAMICS_EQ_SUFFIXES = [
  'InputGain', 'OutputGain', 'Mix',
  'LowType', 'LowFreq', 'LowGain', 'LowQ', 'LowSlope',
  'MidFreq', 'MidGain', 'MidQ',
  'HighType', 'HighFreq', 'HighGain', 'HighQ', 'HighSlope',
] as const;

const SATURATOR_SUFFIXES = ['Mode', 'Quality', 'Drive', 'Tone', 'Bias'] as const;

export const EQUALIZER_CONTENT_KEYS = DYNAMICS_EQ_SUFFIXES.map(lowerFirst);
export const SATURATOR_CONTENT_KEYS = SATURATOR_SUFFIXES.map(lowerFirst);

export function extractDynamicsEqContent(
  state: Record<string, unknown>,
  laneIndex: 0 | 1,
): Record<string, unknown> {
  return canonicalizeProcessorContent(state, [`dynamicsEq${laneIndex + 1}`], DYNAMICS_EQ_SUFFIXES);
}

export function hydrateDynamicsEqContent(
  content: Record<string, unknown>,
  laneIndex: 0 | 1,
): Record<string, unknown> {
  return hydrateProcessorContent(`dynamicsEq${laneIndex + 1}`, content, DYNAMICS_EQ_SUFFIXES);
}

export function extractSaturatorContent(
  state: Record<string, unknown>,
  target: SaturatorTarget,
): Record<string, unknown> {
  const prefixes = target === 'neutral'
    ? ['dynamicsSaturation', 'masterSaturation']
    : [target === 'master' ? 'masterSaturation' : 'dynamicsSaturation'];
  return canonicalizeProcessorContent(state, prefixes, SATURATOR_SUFFIXES);
}

export function hydrateSaturatorContent(
  content: Record<string, unknown>,
  target: SaturatorTarget,
): Record<string, unknown> {
  const canonical = canonicalizeProcessorContent(
    content,
    ['dynamicsSaturation', 'masterSaturation'],
    SATURATOR_SUFFIXES,
  );
  if (target === 'neutral') return canonical;
  return hydrateProcessorContent(
    target === 'master' ? 'masterSaturation' : 'dynamicsSaturation',
    canonical,
    SATURATOR_SUFFIXES,
  );
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
  return {
    id: `dynamics.eq.${laneIndex}`,
    refSlot: `dynamics.eq.${lane}.content`,
    contentType: 'dynamicsEq',
    content: extractDynamicsEqContent(state, laneIndex as 0 | 1),
    hydrate: content => hydrateDynamicsEqContent(content, laneIndex as 0 | 1),
  };
}

export function buildEqualizerPresetPoolInstance(
  content: Record<string, unknown>,
): SharedComponentPoolInstance {
  return {
    id: 'equalizer',
    refSlot: 'equalizer.content',
    contentType: 'dynamicsEq',
    content: canonicalizeProcessorContent(content, ['dynamicsEq1', 'dynamicsEq2'], DYNAMICS_EQ_SUFFIXES),
    hydrate: value => canonicalizeProcessorContent(value, ['dynamicsEq1', 'dynamicsEq2'], DYNAMICS_EQ_SUFFIXES),
  };
}

export function buildSaturatorPoolInstance(
  state: Record<string, unknown>,
  target: SaturatorTarget,
): SharedComponentPoolInstance {
  return {
    id: `${target}.saturator`,
    refSlot: target === 'neutral' ? 'saturator.content' : `${target}.saturator.content`,
    contentType: 'saturator',
    content: extractSaturatorContent(state, target),
    hydrate: content => hydrateSaturatorContent(content, target),
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
    return hydrateDynamicsEqContent(content, (Number(match[1]) - 1) as 0 | 1);
  }
  if (refSlot === 'equalizer.content' && contentType === 'dynamicsEq') {
    return canonicalizeProcessorContent(content, ['dynamicsEq1', 'dynamicsEq2'], DYNAMICS_EQ_SUFFIXES);
  }
  match = /^(dynamics|master)\.saturator\.content$/.exec(refSlot);
  if (match && contentType === 'saturator') {
    return hydrateSaturatorContent(content, match[1] as 'dynamics' | 'master');
  }
  if (refSlot === 'saturator.content' && contentType === 'saturator') {
    return hydrateSaturatorContent(content, 'neutral');
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
    if (parentType === 'source' && parentScope === 'masterFx' && /^masterSaturation(?!Enabled$)/.test(key)) {
      return false;
    }
    if (parentType === 'engine' && parentScope === 'equalizer' && DYNAMICS_EQ_SUFFIXES.some(suffix => lowerFirst(suffix) === key)) {
      return false;
    }
    if (parentType === 'engine' && parentScope === 'saturator' && SATURATOR_SUFFIXES.some(suffix => lowerFirst(suffix) === key)) {
      return false;
    }
    return true;
  }));
}
