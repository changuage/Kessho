import { DEFAULT_STATE, getParamInfo, type SliderState } from '../../ui/state';
import {
  applyMidiCurve,
  createMidiID,
  formatMidiSourceLabel,
  isMidiMessageKind,
  normalizeMidiMessageValue,
  sameMidiControlSource,
  sourceFromMidiMessage,
  type KesshoMidiControlSource,
  type KesshoMidiMessage,
  type KesshoMidiMessageKind,
  type KesshoMidiValueCurve,
} from './midiTypes';
import {
  getMidiMappableParam,
  inferMidiParamGroup,
  type MidiMappableParam,
  type MidiMappableParamGroup,
} from './midiMappableParams';

export const MIDI_ROUTING_PROFILE_V1_KEY = 'kessho.capacitorMidiRouting.v1';
export const MIDI_ROUTING_PROFILE_V2_KEY = 'kessho.capacitorMidiRouting.v2';

export type MidiPickupMode = 'none' | 'soft-takeover';

export type KesshoMidiBindingV2 = {
  id: string;
  enabled: boolean;
  source: {
    kind: KesshoMidiMessageKind;
    channel: number | null;
    number: number | null;
    endpointUniqueID: number | null;
    endpointName?: string | null;
  };
  target: {
    key: keyof SliderState;
    label: string;
    group: MidiMappableParamGroup;
  };
  transform: {
    minimumValue: number;
    maximumValue: number;
    curve: KesshoMidiValueCurve;
    invert: boolean;
    pickupMode: MidiPickupMode;
    smoothingMs: number;
  };
  learn: {
    createdFromMessageLabel: string;
    learnedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type KesshoMidiRoutingProfileV2 = {
  version: 2;
  profileID: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  connectedInputIDs: number[];
  bindings: KesshoMidiBindingV2[];
};

export type KesshoMidiBindingV1 = {
  id: string;
  enabled: boolean;
  source: KesshoMidiControlSource;
  targetKey: keyof SliderState;
  targetLabel: string;
  minimumValue: number;
  maximumValue: number;
  curve: KesshoMidiValueCurve;
  createdAt: string;
  updatedAt: string;
};

export type KesshoMidiRoutingProfileV1 = {
  version: 1;
  connectedInputIDs: number[];
  bindings: KesshoMidiBindingV1[];
};

export type KesshoMidiRoutingImportResult =
  | { ok: true; profile: KesshoMidiRoutingProfileV2 }
  | { ok: false; error: string };

export function createEmptyMidiRoutingProfileV2(name = 'Default MIDI Profile'): KesshoMidiRoutingProfileV2 {
  const now = new Date().toISOString();
  return {
    version: 2,
    profileID: createMidiID('midi-profile'),
    name,
    createdAt: now,
    updatedAt: now,
    connectedInputIDs: [],
    bindings: [],
  };
}

export function createMidiBindingFromMessage(
  message: KesshoMidiMessage,
  targetKey: keyof SliderState,
): KesshoMidiBindingV2 | null {
  const target = getMidiMappableParam(targetKey);
  if (!target || message.kind !== 'controlChange') return null;
  return createMidiBindingFromCapturedSource(message, target);
}

export function createMidiBindingFromCapturedSource(
  message: KesshoMidiMessage,
  target: MidiMappableParam,
): KesshoMidiBindingV2 | null {
  if (message.kind !== 'controlChange') return null;
  const now = new Date().toISOString();
  const source = sourceFromMidiMessage(message);
  return {
    id: createMidiID('midi-binding'),
    enabled: true,
    source: {
      kind: source.kind,
      channel: source.channel ?? null,
      number: source.number ?? null,
      endpointUniqueID: source.endpointUniqueID ?? null,
      endpointName: source.endpointName ?? null,
    },
    target: {
      key: target.key,
      label: target.label,
      group: target.group,
    },
    transform: {
      minimumValue: target.min,
      maximumValue: target.max,
      curve: target.defaultCurve,
      invert: false,
      pickupMode: 'soft-takeover',
      smoothingMs: 10,
    },
    learn: {
      createdFromMessageLabel: formatMidiSourceLabel(source),
      learnedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function routeMidiMessageToParameter(
  message: KesshoMidiMessage,
  binding: KesshoMidiBindingV2,
): { key: keyof SliderState; value: number } | null {
  if (!binding.enabled || !bindingMatchesMessage(binding, message)) return null;
  const target = getMidiMappableParam(binding.target.key);
  if (!target) return null;
  const rawNormalized = normalizeMidiMessageValue(message);
  const normalized = binding.transform.invert ? 1 - rawNormalized : rawNormalized;
  const curved = applyMidiCurve(normalized, binding.transform.curve);
  const minimumValue = finiteOr(binding.transform.minimumValue, target.min);
  const maximumValue = finiteOr(binding.transform.maximumValue, target.max);
  const rawValue = minimumValue + curved * (maximumValue - minimumValue);
  const info = getParamInfo(binding.target.key);
  if (!info) return null;
  const stepSize = Math.max(info.step, 1e-9);
  const clamped = Math.max(info.min, Math.min(info.max, rawValue));
  const quantized = info.min + Math.round((clamped - info.min) / stepSize) * stepSize;
  return { key: binding.target.key, value: quantized };
}

export function bindingMatchesMessage(binding: KesshoMidiBindingV2, message: KesshoMidiMessage): boolean {
  return sameMidiControlSource(binding.source, sourceFromMidiMessage(message));
}

export function migrateMidiRoutingProfileV1ToV2(profile: KesshoMidiRoutingProfileV1): KesshoMidiRoutingProfileV2 {
  const now = new Date().toISOString();
  return {
    version: 2,
    profileID: createMidiID('midi-profile'),
    name: 'Migrated MIDI Profile',
    createdAt: now,
    updatedAt: now,
    connectedInputIDs: profile.connectedInputIDs.filter((id) => Number.isFinite(id)),
    bindings: profile.bindings.map((binding) => migrateBindingV1ToV2(binding)).filter((binding): binding is KesshoMidiBindingV2 => !!binding),
  };
}

export function parseMidiRoutingProfileV2(value: unknown): KesshoMidiRoutingProfileV2 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiRoutingProfileV2>;
  if (record.version !== 2) return null;
  const now = new Date().toISOString();
  return {
    version: 2,
    profileID: typeof record.profileID === 'string' && record.profileID ? record.profileID : createMidiID('midi-profile'),
    name: typeof record.name === 'string' && record.name ? record.name : 'Default MIDI Profile',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
    connectedInputIDs: Array.isArray(record.connectedInputIDs)
      ? record.connectedInputIDs.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      : [],
    bindings: Array.isArray(record.bindings)
      ? record.bindings.map(parseMidiBindingV2).filter((binding): binding is KesshoMidiBindingV2 => !!binding)
      : [],
  };
}

export function parseMidiRoutingProfileV1(value: unknown): KesshoMidiRoutingProfileV1 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiRoutingProfileV1>;
  const bindings = Array.isArray(record.bindings)
    ? record.bindings.map(parseMidiBindingV1).filter((binding): binding is KesshoMidiBindingV1 => !!binding)
    : [];
  return {
    version: 1,
    connectedInputIDs: Array.isArray(record.connectedInputIDs)
      ? record.connectedInputIDs.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      : [],
    bindings,
  };
}

export function exportMidiRoutingProfile(profile: KesshoMidiRoutingProfileV2): string {
  return JSON.stringify(profile, null, 2);
}

export function importMidiRoutingProfile(raw: string): KesshoMidiRoutingImportResult {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const v2 = parseMidiRoutingProfileV2(parsed);
    if (v2) return { ok: true, profile: { ...v2, updatedAt: new Date().toISOString() } };
    const v1 = parseMidiRoutingProfileV1(parsed);
    if (v1) return { ok: true, profile: migrateMidiRoutingProfileV1ToV2(v1) };
    return { ok: false, error: 'Unsupported MIDI routing profile.' };
  } catch {
    return { ok: false, error: 'Invalid MIDI routing profile JSON.' };
  }
}

function migrateBindingV1ToV2(binding: KesshoMidiBindingV1): KesshoMidiBindingV2 | null {
  const target = getMidiMappableParam(binding.targetKey);
  if (!target) return null;
  const now = new Date().toISOString();
  return {
    id: binding.id || createMidiID('midi-binding'),
    enabled: binding.enabled !== false,
    source: {
      kind: binding.source.kind,
      channel: binding.source.channel ?? null,
      number: binding.source.number ?? null,
      endpointUniqueID: binding.source.endpointUniqueID ?? null,
      endpointName: binding.source.endpointName ?? null,
    },
    target: {
      key: target.key,
      label: binding.targetLabel || target.label,
      group: target.group,
    },
    transform: {
      minimumValue: finiteOr(binding.minimumValue, target.min),
      maximumValue: finiteOr(binding.maximumValue, target.max),
      curve: parseMidiCurve(binding.curve),
      invert: false,
      pickupMode: 'soft-takeover',
      smoothingMs: 10,
    },
    learn: {
      createdFromMessageLabel: formatMidiSourceLabel(binding.source),
      learnedAt: binding.createdAt || now,
    },
    createdAt: binding.createdAt || now,
    updatedAt: binding.updatedAt || now,
  };
}

function parseMidiBindingV2(value: unknown): KesshoMidiBindingV2 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiBindingV2>;
  const key = record.target?.key;
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(DEFAULT_STATE, key)) return null;
  const target = getMidiMappableParam(key as keyof SliderState);
  if (!target) return null;
  const source = parseMidiSource(record.source);
  if (!source) return null;
  const now = new Date().toISOString();
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createMidiID('midi-binding'),
    enabled: record.enabled !== false,
    source,
    target: {
      key: target.key,
      label: typeof record.target?.label === 'string' && record.target.label ? record.target.label : target.label,
      group: record.target?.group ?? inferMidiParamGroup(target.key),
    },
    transform: {
      minimumValue: finiteOr(record.transform?.minimumValue, target.min),
      maximumValue: finiteOr(record.transform?.maximumValue, target.max),
      curve: parseMidiCurve(record.transform?.curve),
      invert: record.transform?.invert === true,
      pickupMode: record.transform?.pickupMode === 'none' ? 'none' : 'soft-takeover',
      smoothingMs: Math.max(0, finiteOr(record.transform?.smoothingMs, 10)),
    },
    learn: {
      createdFromMessageLabel: typeof record.learn?.createdFromMessageLabel === 'string'
        ? record.learn.createdFromMessageLabel
        : formatMidiSourceLabel(source),
      learnedAt: typeof record.learn?.learnedAt === 'string' ? record.learn.learnedAt : now,
    },
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

function parseMidiBindingV1(value: unknown): KesshoMidiBindingV1 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiBindingV1>;
  const targetKey = record.targetKey;
  if (typeof targetKey !== 'string' || !Object.prototype.hasOwnProperty.call(DEFAULT_STATE, targetKey)) return null;
  const typedTargetKey = targetKey as keyof SliderState;
  const target = getMidiMappableParam(typedTargetKey);
  if (!target) return null;
  const source = parseMidiSource(record.source);
  if (!source) return null;
  const now = new Date().toISOString();
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createMidiID('midi-binding'),
    enabled: record.enabled !== false,
    source,
    targetKey: typedTargetKey,
    targetLabel: typeof record.targetLabel === 'string' && record.targetLabel ? record.targetLabel : target.label,
    minimumValue: finiteOr(record.minimumValue, target.min),
    maximumValue: finiteOr(record.maximumValue, target.max),
    curve: parseMidiCurve(record.curve),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

function parseMidiSource(value: unknown): KesshoMidiBindingV2['source'] | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiBindingV2['source']>;
  if (!isMidiMessageKind(record.kind)) return null;
  return {
    kind: record.kind,
    channel: typeof record.channel === 'number' && Number.isFinite(record.channel) ? record.channel : null,
    number: typeof record.number === 'number' && Number.isFinite(record.number) ? record.number : null,
    endpointUniqueID: typeof record.endpointUniqueID === 'number' && Number.isFinite(record.endpointUniqueID)
      ? record.endpointUniqueID
      : null,
    endpointName: typeof record.endpointName === 'string' ? record.endpointName : null,
  };
}

function parseMidiCurve(value: unknown): KesshoMidiValueCurve {
  return value === 'exponential' || value === 'logarithmic' || value === 'stepped' || value === 'linear'
    ? value
    : 'linear';
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
