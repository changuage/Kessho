/**
 * Current, storage-safe payload contract for Lead4opFM engine presets.
 *
 * This module deliberately owns a structural JSON shape rather than importing
 * audio-layer types. The audio runtime can evolve independently, while the
 * preset boundary remains explicit and rejects unrecognised persisted fields.
 */

export const LEAD4OPFM_PRESET_SCOPE = 'lead4opfm' as const;
export const LEAD4OPFM_PRESET_FORMAT = 'kessho-lead4opfm-preset' as const;
export const LEAD4OPFM_PRESET_FORMAT_VERSION = 1 as const;

const PRESET_KEYS = new Set([
  'id',
  'name',
  'engine',
  'method',
  'operators',
  'algorithm',
  'source',
  'xy',
  'params',
]);
const LEGACY_PRESET_KEYS = new Set([
  ...PRESET_KEYS,
  // Bundled v2 assets carried editorial annotations alongside the audio
  // payload. They are accepted only while reading the old raw form and are
  // stripped whenever the canonical envelope is written.
  '_notes',
  '_engineSchemaVersion',
  '_notes_v2',
]);
const XY_KEYS = new Set(['xLevel', 'xPan', 'yLevel', 'yPan']);
const PARAM_KEYS = new Set([
  'beatDetune',
  'carrier2Mix',
  'mod1',
  'mod2',
  'mod3',
  'mod4',
  'envelope',
  'filter',
  'transient',
  'gain',
  'lfo',
  'unisonVoices',
  'unisonDetune',
  'drive',
  'carrier1Waveform',
  'carrier2Waveform',
  'stereoSpread',
  'pitchEnv',
  'distance',
  'postLpfHz',
  'postLpfKeyTracking',
  'stereoWidth',
  'diffuseSend',
  'vibratoDepth',
  'vibratoRate',
  'glide',
]);
const MODULATOR_KEYS = new Set([
  'ratio',
  'index',
  'decay',
  'sustain',
  'level',
  'feedback',
  'detune',
  'envRate',
  'modAttack',
  'modDelay',
  'waveform',
  'fixedHz',
  'keyTrack',
  'velocityToIndex',
  'velocityToLevel',
  'modRelease',
]);
const ENVELOPE_KEYS = new Set(['attack', 'decay', 'sustain', 'release', 'hold']);
const FILTER_KEYS = new Set([
  'freq',
  'q',
  'type',
  'envAttack',
  'envDecay',
  'envSustain',
  'envRelease',
  'envDepth',
]);
const TRANSIENT_KEYS = new Set(['click', 'noise', 'duration', 'decay', 'filter', 'type']);
const LFO_KEYS = new Set(['rate', 'depth', 'target']);
const PITCH_ENV_KEYS = new Set(['depthCents', 'attack', 'decay', 'target', 'velocityDepth']);

const ALGORITHMS = new Set(['parallel', 'stack', 'split', 'cross', 'dx17']);
const WAVEFORMS = new Set(['sine', 'triangle', 'sawtooth', 'square']);
const FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass', 'notch', 'peaking']);
const TRANSIENT_TYPES = new Set(['white', 'pink', 'brown', 'filtered']);
const LFO_TARGETS = new Set(['all', 'mod1', 'mod2', 'mod3', 'mod4', 'filter', 'pitch', 'detune', 'amp', 'pan', 'none']);
const PITCH_ENV_TARGETS = new Set(['carriers', 'carrier1', 'carrier2', 'all']);

export interface Lead4opFMPresetJson {
  id: string;
  name: string;
  engine: string;
  method?: string;
  operators?: number;
  algorithm: 'parallel' | 'stack' | 'split' | 'cross' | 'dx17';
  source?: string;
  xy: {
    xLevel: number;
    xPan: number;
    yLevel: number;
    yPan: number;
  };
  params: {
    beatDetune: number;
    carrier2Mix: number;
    mod1: Lead4opFMModulatorJson;
    mod2: Lead4opFMModulatorJson;
    mod3: Lead4opFMModulatorJson;
    mod4: Lead4opFMModulatorJson;
    envelope: Lead4opFMEnvelopeJson;
    filter: Lead4opFMFilterJson;
    transient: Lead4opFMTransientJson;
    gain: number;
    lfo?: Lead4opFMLfoJson;
    unisonVoices?: number;
    unisonDetune?: number;
    drive?: number;
    carrier1Waveform?: Lead4opFMWaveform;
    carrier2Waveform?: Lead4opFMWaveform;
    stereoSpread?: number;
    pitchEnv?: Lead4opFMPitchEnvJson;
    distance?: number;
    postLpfHz?: number;
    postLpfKeyTracking?: number;
    stereoWidth?: number;
    diffuseSend?: number;
    vibratoDepth?: number;
    vibratoRate?: number;
    glide?: number;
  };
}

export type Lead4opFMWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface Lead4opFMModulatorJson {
  ratio: number;
  index: number;
  decay: number;
  sustain?: number;
  level?: number;
  feedback?: number;
  detune?: number;
  envRate?: number;
  modAttack?: number;
  modDelay?: number;
  waveform?: Lead4opFMWaveform;
  fixedHz?: number;
  keyTrack?: number;
  velocityToIndex?: number;
  velocityToLevel?: number;
  modRelease?: number;
}

export interface Lead4opFMEnvelopeJson {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  hold?: number;
}

export interface Lead4opFMFilterJson {
  freq: number;
  q: number;
  type?: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';
  envAttack?: number;
  envDecay?: number;
  envSustain?: number;
  envRelease?: number;
  envDepth?: number;
}

export interface Lead4opFMTransientJson {
  click: number;
  noise: number;
  duration: number;
  decay: number;
  filter: number;
  type: 'white' | 'pink' | 'brown' | 'filtered';
}

export interface Lead4opFMLfoJson {
  rate?: number;
  depth?: number;
  target?: 'all' | 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'filter' | 'pitch' | 'detune' | 'amp' | 'pan' | 'none';
}

export interface Lead4opFMPitchEnvJson {
  depthCents?: number;
  attack?: number;
  decay?: number;
  target?: 'carriers' | 'carrier1' | 'carrier2' | 'all';
  velocityDepth?: number;
}

export interface Lead4opFMPresetEnvelope<TPreset extends object = Lead4opFMPresetJson> {
  format: typeof LEAD4OPFM_PRESET_FORMAT;
  formatVersion: typeof LEAD4OPFM_PRESET_FORMAT_VERSION;
  preset: TPreset;
}

export type Lead4opFMPresetData<TPreset extends object = Lead4opFMPresetJson> =
  Lead4opFMPresetEnvelope<TPreset> & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

function hasRequiredKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every(key => key in value);
}

function isOneOf(value: unknown, values: Set<string>): value is string {
  return typeof value === 'string' && values.has(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isLead4opModulator(value: unknown): value is Lead4opFMModulatorJson {
  if (!isRecord(value) || !hasOnlyKeys(value, MODULATOR_KEYS) || !hasRequiredKeys(value, ['ratio', 'index', 'decay'])) {
    return false;
  }
  for (const key of ['ratio', 'index', 'decay', 'sustain', 'level', 'feedback', 'detune', 'envRate', 'modAttack', 'modDelay', 'fixedHz', 'keyTrack', 'velocityToIndex', 'velocityToLevel', 'modRelease']) {
    if (!isOptionalFiniteNumber(value[key])) return false;
  }
  return value.waveform === undefined || isOneOf(value.waveform, WAVEFORMS);
}

function isLead4opEnvelope(value: unknown): value is Lead4opFMEnvelopeJson {
  if (!isRecord(value) || !hasOnlyKeys(value, ENVELOPE_KEYS) || !hasRequiredKeys(value, ['attack', 'decay', 'sustain', 'release'])) {
    return false;
  }
  return Object.values(value).every(isFiniteNumber);
}

function isLead4opFilter(value: unknown): value is Lead4opFMFilterJson {
  if (!isRecord(value) || !hasOnlyKeys(value, FILTER_KEYS) || !hasRequiredKeys(value, ['freq', 'q'])) return false;
  for (const key of ['freq', 'q', 'envAttack', 'envDecay', 'envSustain', 'envRelease', 'envDepth']) {
    if (!isOptionalFiniteNumber(value[key])) return false;
  }
  return value.type === undefined || isOneOf(value.type, FILTER_TYPES);
}

function isLead4opTransient(value: unknown): value is Lead4opFMTransientJson {
  if (!isRecord(value) || !hasOnlyKeys(value, TRANSIENT_KEYS) || !hasRequiredKeys(value, ['click', 'noise', 'duration', 'decay', 'filter', 'type'])) {
    return false;
  }
  return isFiniteNumber(value.click)
    && isFiniteNumber(value.noise)
    && isFiniteNumber(value.duration)
    && isFiniteNumber(value.decay)
    && isFiniteNumber(value.filter)
    && isOneOf(value.type, TRANSIENT_TYPES);
}

function isLead4opLfo(value: unknown): value is Lead4opFMLfoJson {
  if (!isRecord(value) || !hasOnlyKeys(value, LFO_KEYS)) return false;
  return isOptionalFiniteNumber(value.rate)
    && isOptionalFiniteNumber(value.depth)
    && (value.target === undefined || isOneOf(value.target, LFO_TARGETS));
}

function isLead4opPitchEnv(value: unknown): value is Lead4opFMPitchEnvJson {
  if (!isRecord(value) || !hasOnlyKeys(value, PITCH_ENV_KEYS)) return false;
  return isOptionalFiniteNumber(value.depthCents)
    && isOptionalFiniteNumber(value.attack)
    && isOptionalFiniteNumber(value.decay)
    && isOptionalFiniteNumber(value.velocityDepth)
    && (value.target === undefined || isOneOf(value.target, PITCH_ENV_TARGETS));
}

function isLead4opFMPresetJsonWithKeys(
  value: unknown,
  allowedPresetKeys: Set<string>,
): value is Lead4opFMPresetJson {
  if (!isRecord(value) || !hasOnlyKeys(value, allowedPresetKeys)) return false;
  if (
    typeof value.id !== 'string'
    || !value.id.trim()
    || typeof value.name !== 'string'
    || !value.name.trim()
    || typeof value.engine !== 'string'
    || !value.engine.trim()
    || !isOneOf(value.algorithm, ALGORITHMS)
    || !isRecord(value.xy)
    || !hasOnlyKeys(value.xy, XY_KEYS)
    || !hasRequiredKeys(value.xy, ['xLevel', 'xPan', 'yLevel', 'yPan'])
    || !isRecord(value.params)
    || !hasOnlyKeys(value.params, PARAM_KEYS)
    || !hasRequiredKeys(value.params, [
      'beatDetune', 'carrier2Mix', 'mod1', 'mod2', 'mod3', 'mod4', 'envelope', 'filter', 'transient', 'gain',
    ])
  ) {
    return false;
  }

  if (value.method !== undefined && typeof value.method !== 'string') return false;
  if (value.source !== undefined && typeof value.source !== 'string') return false;
  if (value.operators !== undefined && !isFiniteInteger(value.operators)) return false;
  if (!Object.values(value.xy).every(isFiniteNumber)) return false;

  const params = value.params;
  if (!isFiniteNumber(params.beatDetune) || !isFiniteNumber(params.carrier2Mix) || !isFiniteNumber(params.gain)) {
    return false;
  }
  if (!isLead4opModulator(params.mod1) || !isLead4opModulator(params.mod2)
    || !isLead4opModulator(params.mod3) || !isLead4opModulator(params.mod4)
    || !isLead4opEnvelope(params.envelope) || !isLead4opFilter(params.filter)
    || !isLead4opTransient(params.transient)) {
    return false;
  }

  if (!isOptionalFiniteNumber(params.unisonVoices) || !isOptionalFiniteNumber(params.unisonDetune)
    || !isOptionalFiniteNumber(params.drive) || !isOptionalFiniteNumber(params.stereoSpread)
    || !isOptionalFiniteNumber(params.distance) || !isOptionalFiniteNumber(params.postLpfHz)
    || !isOptionalFiniteNumber(params.postLpfKeyTracking) || !isOptionalFiniteNumber(params.stereoWidth)
    || !isOptionalFiniteNumber(params.diffuseSend) || !isOptionalFiniteNumber(params.vibratoDepth)
    || !isOptionalFiniteNumber(params.vibratoRate) || !isOptionalFiniteNumber(params.glide)) {
    return false;
  }
  if (params.carrier1Waveform !== undefined && !isOneOf(params.carrier1Waveform, WAVEFORMS)) return false;
  if (params.carrier2Waveform !== undefined && !isOneOf(params.carrier2Waveform, WAVEFORMS)) return false;
  if (params.lfo !== undefined && !isLead4opLfo(params.lfo)) return false;
  if (params.pitchEnv !== undefined && !isLead4opPitchEnv(params.pitchEnv)) return false;
  return true;
}

export function isLead4opFMPresetJson(value: unknown): value is Lead4opFMPresetJson {
  return isLead4opFMPresetJsonWithKeys(value, PRESET_KEYS);
}

/**
 * Old Lead4op writes stored the patch directly (or under `preset`) and some
 * bundled v2 sources retained editorial annotation fields. Keep this narrow
 * read-only bridge until an edit naturally rewrites the canonical envelope.
 */
export function isLegacyLead4opFMPresetData(value: unknown): boolean {
  if (isLead4opFMPresetJsonWithKeys(value, LEGACY_PRESET_KEYS)) return true;
  return isRecord(value)
    && Object.keys(value).length === 1
    && isLead4opFMPresetJsonWithKeys(value.preset, LEGACY_PRESET_KEYS);
}

function pickDefinedKeys(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

/**
 * Copies only current, persisted Lead4op fields. This removes legacy editorial
 * annotations and prevents arbitrary runtime properties from becoming storage
 * schema. It intentionally does not coerce values: invalid patches fail at the
 * command/schema boundary instead of being silently repaired.
 */
export function sanitizeLead4opFMPresetJson(value: unknown): Lead4opFMPresetJson | null {
  if (!isLead4opFMPresetJsonWithKeys(value, LEGACY_PRESET_KEYS)) return null;

  const preset = value;
  const params = preset.params as Record<string, unknown>;
  const copyModulator = (candidate: unknown) => pickDefinedKeys(
    candidate as Record<string, unknown>,
    [...MODULATOR_KEYS],
  ) as unknown as Lead4opFMModulatorJson;
  const copyParams = {
    ...pickDefinedKeys(params, [
      'beatDetune', 'carrier2Mix', 'gain', 'unisonVoices', 'unisonDetune', 'drive',
      'carrier1Waveform', 'carrier2Waveform', 'stereoSpread', 'distance', 'postLpfHz',
      'postLpfKeyTracking', 'stereoWidth', 'diffuseSend', 'vibratoDepth', 'vibratoRate', 'glide',
    ]),
    mod1: copyModulator(params.mod1),
    mod2: copyModulator(params.mod2),
    mod3: copyModulator(params.mod3),
    mod4: copyModulator(params.mod4),
    envelope: pickDefinedKeys(preset.params.envelope as unknown as Record<string, unknown>, [...ENVELOPE_KEYS]),
    filter: pickDefinedKeys(preset.params.filter as unknown as Record<string, unknown>, [...FILTER_KEYS]),
    transient: pickDefinedKeys(preset.params.transient as unknown as Record<string, unknown>, [...TRANSIENT_KEYS]),
    ...(params.lfo === undefined ? {} : { lfo: pickDefinedKeys(params.lfo as Record<string, unknown>, [...LFO_KEYS]) }),
    ...(params.pitchEnv === undefined ? {} : { pitchEnv: pickDefinedKeys(params.pitchEnv as Record<string, unknown>, [...PITCH_ENV_KEYS]) }),
  } as unknown as Lead4opFMPresetJson['params'];

  return {
    ...pickDefinedKeys(preset as unknown as Record<string, unknown>, ['id', 'name', 'engine', 'method', 'operators', 'algorithm', 'source']),
    xy: pickDefinedKeys(preset.xy as unknown as Record<string, unknown>, [...XY_KEYS]),
    params: copyParams,
  } as unknown as Lead4opFMPresetJson;
}

/** Construct the canonical envelope without cloning the audio payload. */
export function createLead4opFMPresetData<TPreset extends object>(
  preset: TPreset,
): Lead4opFMPresetData<TPreset> {
  return {
    format: LEAD4OPFM_PRESET_FORMAT,
    formatVersion: LEAD4OPFM_PRESET_FORMAT_VERSION,
    preset,
  } as Lead4opFMPresetData<TPreset>;
}

/** Returns the typed payload only when it fully satisfies the current contract. */
export function readLead4opFMPresetData(
  value: unknown,
): Lead4opFMPresetEnvelope | null {
  if (!isRecord(value)
    || Object.keys(value).length !== 3
    || value.format !== LEAD4OPFM_PRESET_FORMAT
    || value.formatVersion !== LEAD4OPFM_PRESET_FORMAT_VERSION
    || !isLead4opFMPresetJson(value.preset)) {
    return null;
  }
  return value as unknown as Lead4opFMPresetEnvelope;
}

export function isLead4opFMPresetData(value: unknown): value is Lead4opFMPresetData {
  return readLead4opFMPresetData(value) !== null;
}
