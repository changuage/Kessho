/**
 * Lead4opFM — 4-operator FM synthesis engine with preset morphing
 * 
 * Replaces the old timbre-interpolated Rhodes/Gamelan lead synth with a
 * full 4-op FM engine driven by loadable JSON presets.
 * 
 * Key design:
 * - Lead 1 morphs between Preset A ↔ B
 * - Lead 2 morphs between Preset C ↔ D
 * - ADSR, mod params, XY routing, filter, transient, gain all come from presets
 * - Placement and expression response are part of the preset
 * - Effect routing sends are separate from presets
 * - Algorithm is discrete: either snap at 50% morph or always use first preset's
 */

import { getPresetStore } from '../presets/PresetStore';
import { getPresetCommandService } from '../presets/presetCommands';
import type { IPresetStore } from '../presets/PresetStore';
import type { PresetEntry, PresetLibrary, PresetSummary, PresetVersionMetadata } from '../presets/types';
import {
  createLead4opFMPresetData,
  LEAD4OPFM_PRESET_SCOPE,
  readLead4opFMPresetData,
  sanitizeLead4opFMPresetJson,
} from '../presets/lead4opPresetPayload';
import { SHARED_PRESET_TEST_MODE } from '../presets/sharedMode';
import { clampMorphPosition } from './morphUtils';
import lead4opfmV2PresetBank from './lead4opfmV2PresetBank.json';

// ─── Active note tracking for CPU overlay ───
let activeLeadNoteCount = 0;

/** Get the number of currently-sounding lead notes (for CPU monitoring). */
export function getActiveLeadNoteCount(): number {
  return activeLeadNoteCount;
}

// ─── Preset Data Types ───

export interface Lead4opFMPresetXY {
  xLevel: number;
  xPan: number;
  yLevel: number;
  yPan: number;
}

export type Lead4opFMWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface Lead4opFMModulator {
  ratio: number;
  index: number;
  decay: number;
  sustain?: number; // only mod1 has sustain in some presets
  level?: number;   // per-operator output level 0..1 (default 1)
  feedback?: number; // per-operator self-feedback 0..1 (default 0)
  detune?: number;  // per-operator detune in cents -50..+50 (default 0)
  envRate?: number;  // envelope rate multiplier 0.1..8 (default 1) — scales global ADSR per operator
  modAttack?: number;  // operator mod envelope attack in seconds (default 0 = instant)
  modDelay?: number;   // operator mod envelope delay in seconds (default 0 = no delay)
  waveform?: Lead4opFMWaveform;
  fixedHz?: number;
  keyTrack?: number;
  velocityToIndex?: number;
  velocityToLevel?: number;
  modRelease?: number;
}

export interface Lead4opFMEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  hold?: number;
}

export interface Lead4opFMFilter {
  freq: number;
  q: number;
  type?: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking'; // default 'lowpass'
  envAttack?: number;   // filter envelope attack in seconds (default 0)
  envDecay?: number;    // filter envelope decay in seconds (default 0)
  envSustain?: number;  // filter envelope sustain 0..1 (default 1 = no sweep)
  envRelease?: number;  // filter envelope release in seconds (default 0)
  envDepth?: number;    // filter envelope depth in Hz (-8000..+8000, default 0)
}

export interface Lead4opFMTransient {
  click: number;
  noise: number;
  duration: number;
  decay: number;
  filter: number;
  type: 'white' | 'pink' | 'brown' | 'filtered';
}

export interface Lead4opFMLFO {
  rate?: number;    // LFO rate in Hz (0.05..20, default 0)
  depth?: number;   // LFO depth 0..1 — modulates FM index (default 0)
  target?: 'all' | 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'filter' | 'pitch' | 'detune' | 'amp' | 'pan' | 'none'; // modulation destination
}

export interface Lead4opFMPitchEnv {
  depthCents?: number;
  attack?: number;
  decay?: number;
  target?: 'carriers' | 'carrier1' | 'carrier2' | 'all';
  velocityDepth?: number;
}

export interface Lead4opFMParams {
  beatDetune: number;
  carrier2Mix: number;
  mod1: Lead4opFMModulator;
  mod2: Lead4opFMModulator;
  mod3: Lead4opFMModulator;
  mod4: Lead4opFMModulator;
  envelope: Lead4opFMEnvelope;
  filter: Lead4opFMFilter;
  transient: Lead4opFMTransient;
  gain: number;
  lfo?: Lead4opFMLFO;
  unisonVoices?: number;   // 1..4 unison voice count (default 1)
  unisonDetune?: number;   // unison spread in cents 0..50 (default 0)
  drive?: number;           // drive/saturation amount 0..1 (default 0, no drive)
  carrier1Waveform?: Lead4opFMWaveform;
  carrier2Waveform?: Lead4opFMWaveform;
  stereoSpread?: number;
  pitchEnv?: Lead4opFMPitchEnv;
  distance?: number;
  postLpfHz?: number;
  postLpfKeyTracking?: number;
  stereoWidth?: number;
  diffuseSend?: number;
  vibratoDepth?: number;
  vibratoRate?: number;
  glide?: number;
}

export interface Lead4opFMPreset {
  id: string;
  name: string;
  engine: string;
  method?: string;
  operators?: number;
  algorithm: 'parallel' | 'stack' | 'split' | 'cross' | 'dx17';
  source?: string;
  xy: Lead4opFMPresetXY;
  params: Lead4opFMParams;
  /** Runtime copy of version metadata; persisted beside, not inside, the audio payload. */
  dualRanges?: PresetVersionMetadata['dualRanges'];
  sliderModes?: PresetVersionMetadata['sliderModes'];
}

export type Lead4opFMAlgorithm = 'parallel' | 'stack' | 'split' | 'cross' | 'dx17';

// ─── Manifest Type ───

export interface Lead4opFMManifestEntry {
  id: string;
  name: string;
  file: string;
  algorithm: string;
}

export interface Lead4opFMManifest {
  engine: string;
  version: number;
  presets: Lead4opFMManifestEntry[];
}

// ─── Morphed Params (fully interpolated, ready for synthesis) ───

export interface Lead4opFMMorphedParams {
  algorithm: Lead4opFMAlgorithm;
  beatDetune: number;
  carrier2Mix: number;
  carrier1Waveform: Lead4opFMWaveform;
  carrier2Waveform: Lead4opFMWaveform;
  stereoSpread: number;
  pitchEnvDepthCents: number;
  pitchEnvAttack: number;
  pitchEnvDecay: number;
  pitchEnvTarget: 'carriers' | 'carrier1' | 'carrier2' | 'all';
  pitchEnvVelocityDepth: number;
  mod1Ratio: number;
  mod1Index: number;
  mod1Decay: number;
  mod1Sustain: number;
  mod1Level: number;
  mod1Feedback: number;
  mod1Detune: number;
  mod1EnvRate: number;
  mod1ModAttack: number;
  mod1ModDelay: number;
  mod1Waveform: Lead4opFMWaveform;
  mod1FixedHz: number;
  mod1KeyTrack: number;
  mod1VelocityToIndex: number;
  mod1VelocityToLevel: number;
  mod1ModRelease: number;
  mod2Ratio: number;
  mod2Index: number;
  mod2Decay: number;
  mod2Sustain: number;
  mod2Level: number;
  mod2Feedback: number;
  mod2Detune: number;
  mod2EnvRate: number;
  mod2ModAttack: number;
  mod2ModDelay: number;
  mod2Waveform: Lead4opFMWaveform;
  mod2FixedHz: number;
  mod2KeyTrack: number;
  mod2VelocityToIndex: number;
  mod2VelocityToLevel: number;
  mod2ModRelease: number;
  mod3Ratio: number;
  mod3Index: number;
  mod3Decay: number;
  mod3Sustain: number;
  mod3Level: number;
  mod3Feedback: number;
  mod3Detune: number;
  mod3EnvRate: number;
  mod3ModAttack: number;
  mod3ModDelay: number;
  mod3Waveform: Lead4opFMWaveform;
  mod3FixedHz: number;
  mod3KeyTrack: number;
  mod3VelocityToIndex: number;
  mod3VelocityToLevel: number;
  mod3ModRelease: number;
  mod4Ratio: number;
  mod4Index: number;
  mod4Decay: number;
  mod4Sustain: number;
  mod4Level: number;
  mod4Feedback: number;
  mod4Detune: number;
  mod4EnvRate: number;
  mod4ModAttack: number;
  mod4ModDelay: number;
  mod4Waveform: Lead4opFMWaveform;
  mod4FixedHz: number;
  mod4KeyTrack: number;
  mod4VelocityToIndex: number;
  mod4VelocityToLevel: number;
  mod4ModRelease: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  hold: number;
  distance: number;
  postLpfHz: number;
  postLpfKeyTracking: number;
  stereoWidth: number;
  diffuseSend: number;
  vibratoDepth: number;
  vibratoRate: number;
  glide: number;
  filterFreq: number;
  filterQ: number;
  filterType: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';
  filterEnvAttack: number;
  filterEnvDecay: number;
  filterEnvSustain: number;
  filterEnvRelease: number;
  filterEnvDepth: number;
  drive: number;
  transientClick: number;
  transientNoise: number;
  transientDuration: number;
  transientDecay: number;
  transientFilter: number;
  transientType: 'white' | 'pink' | 'brown' | 'filtered';
  gain: number;
  xLevel: number;
  xPan: number;
  yLevel: number;
  yPan: number;
  lfoRate: number;
  lfoDepth: number;
  lfoTarget: 'all' | 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'filter' | 'pitch' | 'detune' | 'amp' | 'pan' | 'none';
  unisonVoices: number;
  unisonDetune: number;
}

// ─── Interpolation ───

const LEAD4OP_WAVEFORMS: Lead4opFMWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
const DEFAULT_WAVEFORM: Lead4opFMWaveform = 'sine';
const DEFAULT_PITCH_ENV: Required<Lead4opFMPitchEnv> = {
  depthCents: 0,
  attack: 0,
  decay: 0.08,
  target: 'carriers',
  velocityDepth: 0,
};

export const LEAD4OP_PRESET_OWNED_DEFAULTS = {
  hold: 0.5,
  distance: 0,
  postLpfHz: 18000,
  postLpfKeyTracking: 0,
  stereoWidth: 1,
  diffuseSend: 0,
  vibratoDepth: 0,
  vibratoRate: 0,
  glide: 0,
} as const;

export type Lead4opPresetOwnedParamKey = keyof typeof LEAD4OP_PRESET_OWNED_DEFAULTS;
export type Lead4opPresetScope = 'lead1' | 'lead2';

const LEAD4OP_PRESET_STATE_KEYS: Record<Lead4opPresetScope, Record<Lead4opPresetOwnedParamKey, string>> = {
  lead1: {
    hold: 'lead1Hold',
    distance: 'lead1Distance',
    postLpfHz: 'lead1PostLPF',
    postLpfKeyTracking: 'lead1PostLPFKeyTracking',
    stereoWidth: 'lead1StereoWidth',
    diffuseSend: 'lead1DiffuseSend',
    vibratoDepth: 'lead1VibratoDepth',
    vibratoRate: 'lead1VibratoRate',
    glide: 'lead1Glide',
  },
  lead2: {
    hold: 'lead2Hold',
    distance: 'lead2Distance',
    postLpfHz: 'lead2PostLPF',
    postLpfKeyTracking: 'lead2PostLPFKeyTracking',
    stereoWidth: 'lead2StereoWidth',
    diffuseSend: 'lead2DiffuseSend',
    vibratoDepth: 'lead2VibratoDepth',
    vibratoRate: 'lead2VibratoRate',
    glide: 'lead2Glide',
  },
};

function leadPresetOwnedValue(params: Lead4opFMParams, key: Lead4opPresetOwnedParamKey): number {
  const value = key === 'hold' ? params.envelope.hold : params[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : LEAD4OP_PRESET_OWNED_DEFAULTS[key];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function validWaveform(value: unknown): Lead4opFMWaveform {
  return LEAD4OP_WAVEFORMS.includes(value as Lead4opFMWaveform)
    ? value as Lead4opFMWaveform
    : DEFAULT_WAVEFORM;
}

function snapWaveform(a: unknown, b: unknown, t: number): Lead4opFMWaveform {
  return t < 0.5 ? validWaveform(a) : validWaveform(b);
}

function validPitchEnvTarget(value: unknown): Required<Lead4opFMPitchEnv>['target'] {
  return value === 'carrier1' || value === 'carrier2' || value === 'all' || value === 'carriers'
    ? value
    : DEFAULT_PITCH_ENV.target;
}

function getPitchEnv(params: Lead4opFMParams): Required<Lead4opFMPitchEnv> {
  const env = params.pitchEnv ?? {};
  return {
    depthCents: Number.isFinite(env.depthCents) ? env.depthCents! : DEFAULT_PITCH_ENV.depthCents,
    attack: Math.max(0, env.attack ?? DEFAULT_PITCH_ENV.attack),
    decay: Math.max(0.001, env.decay ?? DEFAULT_PITCH_ENV.decay),
    target: validPitchEnvTarget(env.target),
    velocityDepth: clamp(env.velocityDepth ?? DEFAULT_PITCH_ENV.velocityDepth, 0, 1),
  };
}

function operatorFrequency(noteHz: number, op: Pick<Lead4opFMModulator, 'fixedHz' | 'keyTrack'>, ratio: number, centsDetune: number): number {
  const detuneMul = Math.pow(2, centsDetune / 1200);
  const fixedHz = Math.max(0, op.fixedHz ?? 0);
  const keyTrack = clamp(op.keyTrack ?? 1, 0, 1);
  const trackedHz = noteHz * ratio;
  const baseHz = fixedHz > 0 ? lerp(fixedHz, trackedHz, keyTrack) : trackedHz;
  return Math.max(0.001, baseHz * detuneMul);
}

function velocityScale(velocity: number, amount: number | undefined): number {
  return lerp(1, velocity, clamp(amount ?? 0, 0, 1));
}

function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

function applyPitchEnvToFrequency(
  param: AudioParam,
  baseHz: number,
  env: Pick<Lead4opFMMorphedParams, 'pitchEnvDepthCents' | 'pitchEnvAttack' | 'pitchEnvDecay' | 'pitchEnvVelocityDepth'>,
  now: number,
  velocity: number,
): void {
  if (Math.abs(env.pitchEnvDepthCents) <= 0.001) return;
  const depth = env.pitchEnvDepthCents * (1 + clamp(env.pitchEnvVelocityDepth, 0, 1) * velocity);
  const startHz = Math.max(0.001, baseHz * centsToRatio(depth));
  const attack = Math.max(0, env.pitchEnvAttack);
  const decay = Math.max(0.001, env.pitchEnvDecay);
  param.cancelScheduledValues(now);
  param.setValueAtTime(startHz, now);
  if (attack > 0) {
    param.linearRampToValueAtTime(startHz, now + attack);
  }
  param.exponentialRampToValueAtTime(Math.max(0.001, baseHz), now + attack + decay);
}

function computeAttackTransientScale(attackSeconds: number): number {
  const attack = Math.max(0, attackSeconds);
  const fullTransientAttack = 0.012;
  const nearMutedAttack = 0.18;

  if (attack <= fullTransientAttack) return 1;
  if (attack >= nearMutedAttack) return 0.04;

  const normalized = (attack - fullTransientAttack) / (nearMutedAttack - fullTransientAttack);
  const eased = normalized * normalized * (3 - 2 * normalized);
  return 1 - eased * 0.96;
}

/**
 * Interpolate between two Lead4opFM presets at morph position t (0..1).
 * Algorithm is handled discretely based on algorithmMode.
 */
export function morphPresets(
  presetA: Lead4opFMPreset,
  presetB: Lead4opFMPreset,
  t: number,
  algorithmMode: 'snap' | 'presetA' = 'snap'
): Lead4opFMMorphedParams {
  const morphPosition = clampMorphPosition(t);
  const a = presetA.params;
  const b = presetB.params;
  const aXY = presetA.xy;
  const bXY = presetB.xy;

  // Algorithm: snap at 50% or always use preset A's
  let algorithm: Lead4opFMAlgorithm;
  if (algorithmMode === 'presetA') {
    algorithm = presetA.algorithm;
  } else {
    algorithm = morphPosition < 0.5 ? presetA.algorithm : presetB.algorithm;
  }

  // Transient type: snap at 50% (discrete, can't interpolate)
  const transientType = morphPosition < 0.5
    ? (a.transient?.type ?? 'white')
    : (b.transient?.type ?? 'white');

  // LFO target: snap at 50% (discrete)
  const lfoTargetA = a.lfo?.target ?? 'all';
  const lfoTargetB = b.lfo?.target ?? 'all';
  const lfoTarget = morphPosition < 0.5 ? lfoTargetA : lfoTargetB;
  const pitchEnvA = getPitchEnv(a);
  const pitchEnvB = getPitchEnv(b);
  const morphMod = (
    left: Lead4opFMModulator,
    right: Lead4opFMModulator,
    ratioDefault: number,
    sustainDefault: number,
  ) => ({
    ratio: lerp(left.ratio ?? ratioDefault, right.ratio ?? ratioDefault, morphPosition),
    index: lerp(left.index ?? 0, right.index ?? 0, morphPosition),
    decay: lerp(left.decay ?? 0.5, right.decay ?? 0.5, morphPosition),
    sustain: lerp(left.sustain ?? sustainDefault, right.sustain ?? sustainDefault, morphPosition),
    level: lerp(left.level ?? 1, right.level ?? 1, morphPosition),
    feedback: lerp(left.feedback ?? 0, right.feedback ?? 0, morphPosition),
    detune: lerp(left.detune ?? 0, right.detune ?? 0, morphPosition),
    envRate: lerp(left.envRate ?? 1, right.envRate ?? 1, morphPosition),
    modAttack: lerp(left.modAttack ?? 0, right.modAttack ?? 0, morphPosition),
    modDelay: lerp(left.modDelay ?? 0, right.modDelay ?? 0, morphPosition),
    waveform: snapWaveform(left.waveform, right.waveform, morphPosition),
    fixedHz: lerp(left.fixedHz ?? 0, right.fixedHz ?? 0, morphPosition),
    keyTrack: lerp(left.keyTrack ?? 1, right.keyTrack ?? 1, morphPosition),
    velocityToIndex: lerp(left.velocityToIndex ?? 0, right.velocityToIndex ?? 0, morphPosition),
    velocityToLevel: lerp(left.velocityToLevel ?? 0, right.velocityToLevel ?? 0, morphPosition),
    modRelease: lerp(left.modRelease ?? 0, right.modRelease ?? 0, morphPosition),
  });
  const mod1 = morphMod(a.mod1, b.mod1, 1, 0.1);
  const mod2 = morphMod(a.mod2, b.mod2, 2, 0.05);
  const mod3 = morphMod(a.mod3, b.mod3, 3, 0.02);
  const mod4 = morphMod(a.mod4, b.mod4, 4, 0.1);

  return {
    algorithm,
    beatDetune: lerp(a.beatDetune, b.beatDetune, morphPosition),
    carrier2Mix: lerp(a.carrier2Mix, b.carrier2Mix, morphPosition),
    carrier1Waveform: snapWaveform(a.carrier1Waveform, b.carrier1Waveform, morphPosition),
    carrier2Waveform: snapWaveform(a.carrier2Waveform, b.carrier2Waveform, morphPosition),
    stereoSpread: lerp(a.stereoSpread ?? 0, b.stereoSpread ?? 0, morphPosition),
    pitchEnvDepthCents: lerp(pitchEnvA.depthCents, pitchEnvB.depthCents, morphPosition),
    pitchEnvAttack: lerp(pitchEnvA.attack, pitchEnvB.attack, morphPosition),
    pitchEnvDecay: lerp(pitchEnvA.decay, pitchEnvB.decay, morphPosition),
    pitchEnvTarget: morphPosition < 0.5 ? pitchEnvA.target : pitchEnvB.target,
    pitchEnvVelocityDepth: lerp(pitchEnvA.velocityDepth, pitchEnvB.velocityDepth, morphPosition),

    mod1Ratio: mod1.ratio,
    mod1Index: mod1.index,
    mod1Decay: mod1.decay,
    mod1Sustain: mod1.sustain,
    mod1Level: mod1.level,
    mod1Feedback: mod1.feedback,
    mod1Detune: mod1.detune,
    mod1EnvRate: mod1.envRate,
    mod1ModAttack: mod1.modAttack,
    mod1ModDelay: mod1.modDelay,
    mod1Waveform: mod1.waveform,
    mod1FixedHz: mod1.fixedHz,
    mod1KeyTrack: mod1.keyTrack,
    mod1VelocityToIndex: mod1.velocityToIndex,
    mod1VelocityToLevel: mod1.velocityToLevel,
    mod1ModRelease: mod1.modRelease,

    mod2Ratio: mod2.ratio,
    mod2Index: mod2.index,
    mod2Decay: mod2.decay,
    mod2Sustain: mod2.sustain,
    mod2Level: mod2.level,
    mod2Feedback: mod2.feedback,
    mod2Detune: mod2.detune,
    mod2EnvRate: mod2.envRate,
    mod2ModAttack: mod2.modAttack,
    mod2ModDelay: mod2.modDelay,
    mod2Waveform: mod2.waveform,
    mod2FixedHz: mod2.fixedHz,
    mod2KeyTrack: mod2.keyTrack,
    mod2VelocityToIndex: mod2.velocityToIndex,
    mod2VelocityToLevel: mod2.velocityToLevel,
    mod2ModRelease: mod2.modRelease,

    mod3Ratio: mod3.ratio,
    mod3Index: mod3.index,
    mod3Decay: mod3.decay,
    mod3Sustain: mod3.sustain,
    mod3Level: mod3.level,
    mod3Feedback: mod3.feedback,
    mod3Detune: mod3.detune,
    mod3EnvRate: mod3.envRate,
    mod3ModAttack: mod3.modAttack,
    mod3ModDelay: mod3.modDelay,
    mod3Waveform: mod3.waveform,
    mod3FixedHz: mod3.fixedHz,
    mod3KeyTrack: mod3.keyTrack,
    mod3VelocityToIndex: mod3.velocityToIndex,
    mod3VelocityToLevel: mod3.velocityToLevel,
    mod3ModRelease: mod3.modRelease,

    mod4Ratio: mod4.ratio,
    mod4Index: mod4.index,
    mod4Decay: mod4.decay,
    mod4Sustain: mod4.sustain,
    mod4Level: mod4.level,
    mod4Feedback: mod4.feedback,
    mod4Detune: mod4.detune,
    mod4EnvRate: mod4.envRate,
    mod4ModAttack: mod4.modAttack,
    mod4ModDelay: mod4.modDelay,
    mod4Waveform: mod4.waveform,
    mod4FixedHz: mod4.fixedHz,
    mod4KeyTrack: mod4.keyTrack,
    mod4VelocityToIndex: mod4.velocityToIndex,
    mod4VelocityToLevel: mod4.velocityToLevel,
    mod4ModRelease: mod4.modRelease,

    attack: lerp(a.envelope.attack, b.envelope.attack, morphPosition),
    decay: lerp(a.envelope.decay, b.envelope.decay, morphPosition),
    sustain: lerp(a.envelope.sustain, b.envelope.sustain, morphPosition),
    release: lerp(a.envelope.release, b.envelope.release, morphPosition),
    hold: lerp(leadPresetOwnedValue(a, 'hold'), leadPresetOwnedValue(b, 'hold'), morphPosition),
    distance: lerp(leadPresetOwnedValue(a, 'distance'), leadPresetOwnedValue(b, 'distance'), morphPosition),
    postLpfHz: lerp(leadPresetOwnedValue(a, 'postLpfHz'), leadPresetOwnedValue(b, 'postLpfHz'), morphPosition),
    postLpfKeyTracking: lerp(leadPresetOwnedValue(a, 'postLpfKeyTracking'), leadPresetOwnedValue(b, 'postLpfKeyTracking'), morphPosition),
    stereoWidth: lerp(leadPresetOwnedValue(a, 'stereoWidth'), leadPresetOwnedValue(b, 'stereoWidth'), morphPosition),
    diffuseSend: lerp(leadPresetOwnedValue(a, 'diffuseSend'), leadPresetOwnedValue(b, 'diffuseSend'), morphPosition),
    vibratoDepth: lerp(leadPresetOwnedValue(a, 'vibratoDepth'), leadPresetOwnedValue(b, 'vibratoDepth'), morphPosition),
    vibratoRate: lerp(leadPresetOwnedValue(a, 'vibratoRate'), leadPresetOwnedValue(b, 'vibratoRate'), morphPosition),
    glide: lerp(leadPresetOwnedValue(a, 'glide'), leadPresetOwnedValue(b, 'glide'), morphPosition),

    filterFreq: lerp(a.filter.freq, b.filter.freq, morphPosition),
    filterQ: lerp(a.filter.q, b.filter.q, morphPosition),
    filterType: morphPosition < 0.5 ? (a.filter.type ?? 'lowpass') : (b.filter.type ?? 'lowpass'),
    filterEnvAttack: lerp(a.filter.envAttack ?? 0, b.filter.envAttack ?? 0, morphPosition),
    filterEnvDecay: lerp(a.filter.envDecay ?? 0, b.filter.envDecay ?? 0, morphPosition),
    filterEnvSustain: lerp(a.filter.envSustain ?? 1, b.filter.envSustain ?? 1, morphPosition),
    filterEnvRelease: lerp(a.filter.envRelease ?? 0, b.filter.envRelease ?? 0, morphPosition),
    filterEnvDepth: lerp(a.filter.envDepth ?? 0, b.filter.envDepth ?? 0, morphPosition),
    drive: lerp(a.drive ?? 0, b.drive ?? 0, morphPosition),

    transientClick: lerp(a.transient?.click ?? 0, b.transient?.click ?? 0, morphPosition),
    transientNoise: lerp(a.transient?.noise ?? 0, b.transient?.noise ?? 0, morphPosition),
    transientDuration: lerp(a.transient?.duration ?? 20, b.transient?.duration ?? 20, morphPosition),
    transientDecay: lerp(a.transient?.decay ?? 50, b.transient?.decay ?? 50, morphPosition),
    transientFilter: lerp(a.transient?.filter ?? 4000, b.transient?.filter ?? 4000, morphPosition),
    transientType,

    gain: lerp(a.gain, b.gain, morphPosition),

    xLevel: lerp(aXY.xLevel, bXY.xLevel, morphPosition),
    xPan: lerp(aXY.xPan, bXY.xPan, morphPosition),
    yLevel: lerp(aXY.yLevel, bXY.yLevel, morphPosition),
    yPan: lerp(aXY.yPan, bXY.yPan, morphPosition),

    lfoRate: lerp(a.lfo?.rate ?? 0, b.lfo?.rate ?? 0, morphPosition),
    lfoDepth: lerp(a.lfo?.depth ?? 0, b.lfo?.depth ?? 0, morphPosition),
    lfoTarget,
    unisonVoices: Math.round(lerp(a.unisonVoices ?? 1, b.unisonVoices ?? 1, morphPosition)),
    unisonDetune: lerp(a.unisonDetune ?? 0, b.unisonDetune ?? 0, morphPosition),
  };
}

export function applyLead4opPresetOwnedParamsToState<T extends object>(
  state: T,
  scope: Lead4opPresetScope,
  presetA: Lead4opFMPreset,
  presetB: Lead4opFMPreset,
  morph: number,
): T {
  const next = { ...state } as Record<string, unknown>;
  const morphed = morphPresets(presetA, presetB, morph);
  for (const [presetKey, stateKey] of Object.entries(LEAD4OP_PRESET_STATE_KEYS[scope])) {
    next[stateKey] = morphed[presetKey as Lead4opPresetOwnedParamKey];
  }
  return next as T;
}

export function resolveLead4opPresetDualState(
  scope: Lead4opPresetScope,
  presetA: Lead4opFMPreset,
  presetB: Lead4opFMPreset,
  morph: number,
): {
  relevantKeys: string[];
  dualRanges: NonNullable<PresetVersionMetadata['dualRanges']>;
  sliderModes: NonNullable<PresetVersionMetadata['sliderModes']>;
} {
  const stateKeys = LEAD4OP_PRESET_STATE_KEYS[scope];
  const relevantKeys = Object.values(stateKeys);
  const dualRanges: NonNullable<PresetVersionMetadata['dualRanges']> = {};
  const sliderModes: NonNullable<PresetVersionMetadata['sliderModes']> = {};
  const position = clampMorphPosition(morph);
  const dualKeys = new Set([
    ...Object.keys(presetA.dualRanges ?? {}),
    ...Object.keys(presetB.dualRanges ?? {}),
  ]);

  for (const key of dualKeys) {
    if (!(key in LEAD4OP_PRESET_OWNED_DEFAULTS)) continue;
    const presetKey = key as Lead4opPresetOwnedParamKey;
    const rangeA = presetA.dualRanges?.[presetKey];
    const rangeB = presetB.dualRanges?.[presetKey];
    const valueA = leadPresetOwnedValue(presetA.params, presetKey);
    const valueB = leadPresetOwnedValue(presetB.params, presetKey);
    const min = lerp(rangeA?.min ?? valueA, rangeB?.min ?? valueB, position);
    const max = lerp(rangeA?.max ?? valueA, rangeB?.max ?? valueB, position);
    if (Math.abs(max - min) <= 0.001) continue;

    const modeA = presetA.sliderModes?.[presetKey] ?? (rangeA ? 'walk' : undefined);
    const modeB = presetB.sliderModes?.[presetKey] ?? (rangeB ? 'walk' : undefined);
    const stateKey = stateKeys[presetKey];
    dualRanges[stateKey] = { min, max };
    sliderModes[stateKey] = position < 0.5
      ? modeA ?? modeB ?? 'walk'
      : modeB ?? modeA ?? 'walk';
  }

  return { relevantKeys, dualRanges, sliderModes };
}

export function withLead4opPresetOwnedState(
  preset: Lead4opFMPreset,
  scope: Lead4opPresetScope,
  state: object,
  dualRanges: Record<string, { min: number; max: number }> = {},
  sliderModes: NonNullable<PresetVersionMetadata['sliderModes']> = {},
): Lead4opFMPreset {
  const stateKeys = LEAD4OP_PRESET_STATE_KEYS[scope];
  const stateRecord = state as Record<string, unknown>;
  const ownedValues = Object.fromEntries(
    Object.entries(stateKeys).map(([presetKey, stateKey]) => {
      const value = stateRecord[stateKey];
      return [
        presetKey,
        typeof value === 'number' && Number.isFinite(value)
          ? value
          : leadPresetOwnedValue(preset.params, presetKey as Lead4opPresetOwnedParamKey),
      ];
    }),
  ) as Record<Lead4opPresetOwnedParamKey, number>;
  const presetDualRanges: NonNullable<PresetVersionMetadata['dualRanges']> = {};
  const presetSliderModes: NonNullable<PresetVersionMetadata['sliderModes']> = {};

  for (const [presetKey, stateKey] of Object.entries(stateKeys)) {
    const range = dualRanges[stateKey];
    if (!range) continue;
    presetDualRanges[presetKey] = range;
    presetSliderModes[presetKey] = sliderModes[stateKey] ?? 'walk';
  }

  const { hold, ...ownedParams } = ownedValues;

  return {
    ...preset,
    params: {
      ...preset.params,
      ...ownedParams,
      envelope: {
        ...preset.params.envelope,
        hold,
      },
    },
    dualRanges: Object.keys(presetDualRanges).length > 0 ? presetDualRanges : undefined,
    sliderModes: Object.keys(presetSliderModes).length > 0 ? presetSliderModes : undefined,
  };
}

// ─── Default Presets (embedded fallbacks if JSON fetch fails) ───

export const DEFAULT_SOFT_RHODES: Lead4opFMPreset = {
  id: 'soft_rhodes',
  name: 'Soft Rhodes',
  engine: 'Lead4opFM',
  method: 'new',
  operators: 4,
  algorithm: 'parallel',
  xy: { xLevel: 0.96, xPan: -0.26, yLevel: 0.7, yPan: 0.26 },
  params: {
    beatDetune: 1.25,
    carrier2Mix: 0.2,
    mod1: { ratio: 1, index: 0.42, decay: 1.2, sustain: 0.28, level: 0.82, feedback: 0.015, envRate: 1.1, waveform: 'sine', keyTrack: 1, velocityToIndex: 0.55, velocityToLevel: 0.18, modRelease: 1.9 },
    mod2: { ratio: 2.01, index: 0.62, decay: 0.28, sustain: 0.02, level: 0.75, detune: 3, envRate: 1.25, waveform: 'triangle', keyTrack: 1, velocityToIndex: 0.9, velocityToLevel: 0.12, modRelease: 0.48 },
    mod3: { ratio: 0.5, index: 0.1, decay: 1.8, sustain: 0.18, level: 0.42, detune: -4, envRate: 0.85, waveform: 'sine', fixedHz: 2100, keyTrack: 0.22, velocityToIndex: 0.5, velocityToLevel: 0.05, modRelease: 0.24 },
    mod4: { ratio: 3, index: 0.06, decay: 0.5, sustain: 0, level: 0.35, detune: 5, envRate: 1.3, waveform: 'triangle', fixedHz: 122, keyTrack: 0, velocityToIndex: 0.04, velocityToLevel: 0, modRelease: 2.2 },
    envelope: { attack: 0.018, decay: 0.95, sustain: 0.32, release: 2.3 },
    filter: { freq: 3050, q: 0.68, type: 'lowpass', envDepth: 600, envAttack: 0.01, envDecay: 0.35, envSustain: 0.45, envRelease: 0.9 },
    transient: { click: 0.055, noise: 0.018, duration: 12, decay: 125, filter: 3600, type: 'filtered' },
    gain: 0.36,
    lfo: { rate: 4.1, depth: 0.035, target: 'amp' },
    unisonVoices: 2,
    unisonDetune: 2.4,
    drive: 0.025,
    carrier1Waveform: 'sine',
    carrier2Waveform: 'triangle',
    stereoSpread: 0.24,
    pitchEnv: { depthCents: 10, attack: 0, decay: 0.16, target: 'carriers', velocityDepth: 0.1 },
  },
};

export const DEFAULT_GAMELAN: Lead4opFMPreset = {
  id: 'gamelan',
  name: 'Gamelan',
  engine: 'Lead4opFM',
  method: 'new',
  operators: 4,
  algorithm: 'cross',
  xy: { xLevel: 0.95, xPan: -0.35, yLevel: 1.05, yPan: 0.35 },
  params: {
    beatDetune: 25,
    carrier2Mix: 0.65,
    mod1: { ratio: 2.4, index: 2, decay: 0.45, sustain: 0.08, level: 1, feedback: 0, detune: 0, envRate: 1, waveform: 'sine', keyTrack: 1, velocityToIndex: 0, velocityToLevel: 0, modRelease: 0 },
    mod2: { ratio: 4, index: 0.8, decay: 0.35, sustain: 0.1, level: 1, feedback: 0, detune: 0, envRate: 1, waveform: 'sine', keyTrack: 1, velocityToIndex: 0, velocityToLevel: 0, modRelease: 0 },
    mod3: { ratio: 5.5, index: 0.5, decay: 0.2, sustain: 0.1, level: 1, feedback: 0, detune: 0, envRate: 1, waveform: 'sine', keyTrack: 1, velocityToIndex: 0, velocityToLevel: 0, modRelease: 0 },
    mod4: { ratio: 0.65, index: 0.3, decay: 0.6, sustain: 0.1, level: 1, feedback: 0, detune: 0, envRate: 1, waveform: 'sine', keyTrack: 1, velocityToIndex: 0, velocityToLevel: 0, modRelease: 0 },
    envelope: { attack: 0.002, decay: 0.35, sustain: 0.3, release: 6 },
    filter: { freq: 7000, q: 1 },
    transient: { click: 0.5, noise: 0.15, duration: 25, decay: 80, filter: 5000, type: 'filtered' },
    gain: 0.7,
    carrier1Waveform: 'sine',
    carrier2Waveform: 'sine',
    stereoSpread: 0,
    pitchEnv: { depthCents: 0, attack: 0, decay: 0.001, target: 'carriers', velocityDepth: 0 },
  },
};

// ─── Preset Cache & Loader ───

const presetCache: Map<string, Lead4opFMPreset> = new Map();
const USER_LEAD4OP_SCOPE = LEAD4OPFM_PRESET_SCOPE;
const USER_LEAD4OP_PRESETS = new Map<string, { preset: Lead4opFMPreset; library: PresetLibrary }>();
const USER_LEAD4OP_PRESET_CACHE_KEYS = new Set<string>();
const lead4opEntryLoadsByStore = new WeakMap<object, Map<string, Promise<PresetEntry | null>>>();
const lead4opSummaryNameByLookup = new Map<string, string>();
const FALLBACK_LEAD4OP_PRESETS = [DEFAULT_SOFT_RHODES, DEFAULT_GAMELAN, ...(lead4opfmV2PresetBank as Lead4opFMPreset[])];
const FALLBACK_LEAD4OP_PRESET_MAP = new Map<string, Lead4opFMPreset>();
for (const preset of FALLBACK_LEAD4OP_PRESETS) {
  FALLBACK_LEAD4OP_PRESET_MAP.set(normalizeLead4opPresetLookup(preset.id), preset);
  FALLBACK_LEAD4OP_PRESET_MAP.set(normalizeLead4opPresetLookup(preset.name), preset);
}
const FALLBACK_LEAD4OP_MANIFEST: Lead4opFMManifest = {
  engine: 'Lead4opFM',
  version: 2,
  presets: Array.from(FALLBACK_LEAD4OP_PRESET_MAP.values())
    .filter((preset, index, presets) => presets.findIndex((candidate) => candidate.id === preset.id) === index)
    .map((preset) => ({ id: preset.id, name: preset.name, file: '', algorithm: preset.algorithm })),
};

function cloneLead4opPreset(preset: Lead4opFMPreset, id = preset.id, name = preset.name): Lead4opFMPreset {
  const next = { ...preset, id, name } as Lead4opFMPreset;
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(next);
    } catch {
      // Fall through for values that crossed a different realm.
    }
  }
  return JSON.parse(JSON.stringify(next)) as Lead4opFMPreset;
}

function isLead4opFMPresetCandidate(value: unknown): value is Lead4opFMPreset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Lead4opFMPreset>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.algorithm === 'string'
    && !!candidate.xy
    && typeof candidate.xy === 'object'
    && !!candidate.params
    && typeof candidate.params === 'object';
}

export function normalizeLead4opPresetLookup(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeLeadPresetLookup(value: string): string {
  return normalizeLead4opPresetLookup(value);
}

function getLead4opPresetCandidateFromEntry(entry: PresetEntry): Lead4opFMPreset | null {
  const version = entry.versions.find(v => v.v === entry.currentVersion)
    || entry.versions[entry.versions.length - 1];
  if (!version) return null;

  const data = version.data as Record<string, unknown>;
  const currentPayload = readLead4opFMPresetData(data);
  return currentPayload && isLead4opFMPresetCandidate(currentPayload.preset)
    ? currentPayload.preset as Lead4opFMPreset
    : isLead4opFMPresetCandidate(version.data)
    ? version.data
    : isLead4opFMPresetCandidate(data.preset)
      ? data.preset
      : null;
}

function parseLead4opPresetFromEntry(entry: PresetEntry, lookupName: string): Lead4opFMPreset | null {
  const rawPreset = getLead4opPresetCandidateFromEntry(entry);
  if (!rawPreset) return null;
  const version = entry.versions.find(candidate => candidate.v === entry.currentVersion)
    || entry.versions[entry.versions.length - 1];
  return cloneLead4opPreset({
    ...rawPreset,
    dualRanges: version?.dualRanges,
    sliderModes: version?.sliderModes,
  }, lookupName, entry.name);
}

function leadSummaryMatchesLookup(
  summary: Pick<PresetSummary, 'id' | 'name' | 'remoteId'>,
  presetId: string,
): boolean {
  const lookup = normalizeLeadPresetLookup(presetId);
  return [
    summary.id,
    summary.name,
    summary.remoteId,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some(value => normalizeLeadPresetLookup(value) === lookup);
}

function lead4opLookupKey(value: unknown): string {
  return normalizeLeadPresetLookup(String(value ?? ''));
}

function rememberLead4opSummary(summary: Pick<PresetSummary, 'id' | 'name' | 'remoteId'>): void {
  for (const value of [summary.id, summary.remoteId, summary.name]) {
    const key = lead4opLookupKey(value);
    if (key) lead4opSummaryNameByLookup.set(key, summary.name);
  }
}

function getRememberedLead4opSummaryName(presetId: string): string | undefined {
  return lead4opSummaryNameByLookup.get(lead4opLookupKey(presetId));
}

function isCanonicalCloudPresetId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isLead4opPresetEntry(entry: PresetEntry | null): entry is PresetEntry {
  return !!entry && entry.type === 'engine' && !!getLead4opPresetCandidateFromEntry(entry);
}

async function loadLead4opPresetEntryUncached(
  store: IPresetStore,
  presetId: string,
): Promise<PresetEntry | null> {
  const requestedId = presetId.trim();
  if (!requestedId) return null;

  const rememberedName = getRememberedLead4opSummaryName(requestedId);
  if (rememberedName && lead4opLookupKey(rememberedName) !== lead4opLookupKey(requestedId)) {
    const remembered = await store.load('engine', rememberedName, USER_LEAD4OP_SCOPE);
    if (isLead4opPresetEntry(remembered)) return remembered;
  }

  if (isCanonicalCloudPresetId(requestedId)) {
    const byId = await store.loadById(requestedId);
    if (isLead4opPresetEntry(byId)) return byId;
  }

  const direct = await store.load('engine', requestedId, USER_LEAD4OP_SCOPE);
  if (isLead4opPresetEntry(direct)) return direct;

  const summaries = await store.list('engine', USER_LEAD4OP_SCOPE);
  for (const summary of summaries) rememberLead4opSummary(summary);
  const matchedSummary = summaries.find(summary => leadSummaryMatchesLookup(summary, requestedId));
  if (!matchedSummary) return null;

  // The original direct request has already supplied this exact detail. Avoid
  // immediately re-fetching it; verified loads retain their bounded retry for
  // genuinely transient misses.
  if (lead4opLookupKey(matchedSummary.name) === lead4opLookupKey(requestedId)) return null;

  const matched = await store.load('engine', matchedSummary.name, USER_LEAD4OP_SCOPE);
  return isLead4opPresetEntry(matched) ? matched : null;
}

async function loadLead4opPresetEntryFromStore(presetId: string): Promise<PresetEntry | null> {
  const store = getPresetStore();
  const key = lead4opLookupKey(presetId);
  if (!key) return null;

  const storeKey = store as object;
  let loads = lead4opEntryLoadsByStore.get(storeKey);
  if (!loads) {
    loads = new Map();
    lead4opEntryLoadsByStore.set(storeKey, loads);
  }

  const inFlight = loads.get(key);
  if (inFlight) return inFlight;

  const load = loadLead4opPresetEntryUncached(store, presetId);
  loads.set(key, load);
  try {
    return await load;
  } finally {
    if (loads.get(key) === load) loads.delete(key);
  }
}

async function listLead4opStorePresets(): Promise<{ id: string; name: string }[]> {
  const store = getPresetStore();
  const summaries = await store.list('engine', USER_LEAD4OP_SCOPE);
  const presets: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const summary of summaries) {
    rememberLead4opSummary(summary);
    const id = summary.remoteId?.trim() || summary.id?.trim() || summary.name;
    const key = normalizeLeadPresetLookup(id);
    if (seen.has(key)) continue;

    seen.add(key);
    presets.push({ id, name: summary.name });
  }

  return presets;
}

function clearUserLead4opPresetCache(): void {
  for (const key of USER_LEAD4OP_PRESET_CACHE_KEYS) {
    presetCache.delete(key);
  }
  USER_LEAD4OP_PRESET_CACHE_KEYS.clear();
}

function cacheUserLead4opPreset(
  preset: { id: string; name: string; library: PresetLibrary; preset: Lead4opFMPreset },
  aliases: Iterable<unknown> = [],
): void {
  const keys = new Set<string>();
  for (const candidate of [preset.id, preset.name, preset.preset.id, preset.preset.name, ...aliases]) {
    const key = String(candidate ?? '').trim();
    if (key) keys.add(key);
  }

  const cached = cloneLead4opPreset(preset.preset, preset.id, preset.name);
  for (const key of keys) {
    USER_LEAD4OP_PRESETS.set(key, { preset: cached, library: preset.library });
  }
  presetCache.set(preset.id, cached);
  USER_LEAD4OP_PRESET_CACHE_KEYS.add(preset.id);
}

async function loadUserLead4opPresetFromStore(presetId: string): Promise<{ preset: Lead4opFMPreset; library: PresetLibrary } | null> {
  const runtime = USER_LEAD4OP_PRESETS.get(presetId);
  if (runtime) {
    const preset = cloneLead4opPreset(runtime.preset, presetId, runtime.preset.name);
    presetCache.set(presetId, preset);
    USER_LEAD4OP_PRESET_CACHE_KEYS.add(presetId);
    return {
      preset,
      library: runtime.library,
    };
  }

  const entry = await loadLead4opPresetEntryFromStore(presetId);
  if (!entry) return null;

  const preset = parseLead4opPresetFromEntry(entry, presetId);
  if (!preset) return null;

  const library = entry.library ?? 'user';
  const rawPreset = getLead4opPresetCandidateFromEntry(entry);
  cacheUserLead4opPreset(
    { id: presetId, name: preset.name, library, preset },
    [entry.id, entry.remoteId, entry.name, rawPreset?.id, rawPreset?.name],
  );
  return { preset: cloneLead4opPreset(preset, presetId, preset.name), library };
}

export function setUserLead4opFMPresets(
  presets: Array<{ id: string; name: string; library: PresetLibrary; preset: Lead4opFMPreset }>,
): void {
  USER_LEAD4OP_PRESETS.clear();
  clearUserLead4opPresetCache();
  for (const preset of presets) cacheUserLead4opPreset(preset);
}

export function upsertUserLead4opFMPreset(
  preset: { id: string; name: string; library: PresetLibrary; preset: Lead4opFMPreset },
): void {
  cacheUserLead4opPreset(preset);
}

function createLead4opPresetSaveData(
  preset: Lead4opFMPreset,
  name: string,
): Record<string, unknown> {
  // The command service takes the one defensive payload clone it needs before
  // persistence. Keep this construction shallow so no-op saves avoid another
  // full FM-patch traversal.
  const sanitized = sanitizeLead4opFMPresetJson({
    id: name,
    name,
    engine: preset.engine,
    method: preset.method,
    operators: preset.operators,
    algorithm: preset.algorithm,
    source: preset.source,
    xy: preset.xy,
    params: preset.params,
  });
  if (!sanitized) throw new Error('Lead4opFM preset does not match the current persistence contract.');
  return createLead4opFMPresetData(sanitized);
}

function lead4opPresetBehaviorMetadata(preset: Lead4opFMPreset): PresetVersionMetadata | undefined {
  if (!preset.dualRanges && !preset.sliderModes) return undefined;
  return {
    dualRanges: preset.dualRanges,
    sliderModes: preset.sliderModes,
  };
}

function canUpdateLead4opUserPreset(entry: PresetEntry | null): boolean {
  return !!entry && (SHARED_PRESET_TEST_MODE || (entry.author === 'user' && entry.library === 'user'));
}

function cachePersistedLead4opPreset(
  name: string,
  preset: Lead4opFMPreset,
  library: PresetLibrary,
  aliases: Iterable<unknown> = [],
): void {
  const finalPreset = cloneLead4opPreset(preset, name, name);
  cacheUserLead4opPreset({ id: name, name, library, preset: finalPreset }, aliases);
}

export async function saveUserLead4opFMPreset(
  name: string,
  preset: Lead4opFMPreset,
  note = '',
): Promise<string> {
  const requestedName = name.trim();
  const store = getPresetStore();
  const commands = getPresetCommandService(store);
  const existing = await store.load('engine', requestedName, USER_LEAD4OP_SCOPE);
  const targetName = existing && !canUpdateLead4opUserPreset(existing)
    ? `${requestedName} (Custom)`
    : requestedName;
  const result = await commands.save({
    type: 'engine',
    scope: USER_LEAD4OP_SCOPE,
    name: targetName,
    data: createLead4opPresetSaveData(preset, targetName),
    note,
    metadata: lead4opPresetBehaviorMetadata(preset),
    identity: SHARED_PRESET_TEST_MODE ? { visibility: 'public' } : undefined,
  });

  cachePersistedLead4opPreset(result.entry.name, preset, 'user', [
    requestedName,
    result.entry.id,
    result.entry.remoteId,
  ]);
  return result.entry.name;
}

export async function overwriteLead4opFMPreset(
  name: string,
  preset: Lead4opFMPreset,
  note = 'Updated from lead editor',
): Promise<string> {
  const requestedName = name.trim();
  const store = getPresetStore();
  const commands = getPresetCommandService(store);
  const existing = await loadLead4opPresetEntryFromStore(requestedName);
  if (existing && (existing.author === 'factory' || existing.library === 'stock')) {
    throw new Error(`Cannot overwrite stock Lead4opFM preset: ${name}`);
  }
  if (!existing) return saveUserLead4opFMPreset(requestedName, preset, note);

  const result = await commands.save({
    type: 'engine',
    scope: USER_LEAD4OP_SCOPE,
    name: existing.name,
    data: createLead4opPresetSaveData(preset, existing.name),
    note,
    metadata: lead4opPresetBehaviorMetadata(preset),
    identity: SHARED_PRESET_TEST_MODE ? { visibility: 'public' } : undefined,
  });
  const library = existing.library ?? (existing.author === 'cloud' ? 'cloud' : 'user');
  cachePersistedLead4opPreset(result.entry.name, preset, library, [
    requestedName,
    existing.id,
    existing.remoteId,
    result.entry.id,
    result.entry.remoteId,
  ]);
  return result.entry.name;
}

/**
 * Load the minimal emergency Lead4opFM manifest.
 * The editable preset library lives in Supabase under engine:lead4opfm.
 */
export async function loadLead4opFMManifest(): Promise<Lead4opFMManifest> {
  return FALLBACK_LEAD4OP_MANIFEST;
}

async function resolveLead4opFMPreset(presetId: string, warnOnFallback: boolean): Promise<Lead4opFMPreset> {
  // Check cache
  const cached = presetCache.get(presetId);
  if (cached) return cached;

  const userPreset = await loadUserLead4opPresetFromStore(presetId);
  if (userPreset) {
    return userPreset.preset;
  }

  const stockLookup = normalizeLeadPresetLookup(presetId);
  const fallbackPreset = FALLBACK_LEAD4OP_PRESET_MAP.get(stockLookup);
  if (fallbackPreset) {
    presetCache.set(presetId, fallbackPreset);
    presetCache.set(fallbackPreset.id, fallbackPreset);
    return fallbackPreset;
  }

  if (warnOnFallback) {
    console.warn(`Lead4opFM preset not found in cloud: ${presetId}, falling back to soft_rhodes`);
  }
  return DEFAULT_SOFT_RHODES;
}

/**
 * Load a preset by ID (cached after first fetch). Falls back to embedded defaults.
 */
export async function loadLead4opFMPreset(presetId: string): Promise<Lead4opFMPreset> {
  return resolveLead4opFMPreset(presetId, true);
}

const LEAD4OP_PRESET_RETRY_DELAYS_MS = [80, 160, 320, 640, 1280] as const;

function waitForLead4opPresetRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function lead4opPresetMatchesLookup(
  preset: unknown,
  presetId: string,
  fallbackId = 'soft_rhodes',
): boolean {
  const requested = normalizeLead4opPresetLookup(presetId);
  if (!requested || requested === normalizeLead4opPresetLookup(fallbackId)) {
    return true;
  }
  if (!preset || typeof preset !== 'object') return false;
  const record = preset as Record<string, unknown>;
  return [record.id, record.name]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some((value) => normalizeLead4opPresetLookup(value) === requested);
}

/**
 * Load a Lead 4op FM preset without caching a transient store miss as the active sound.
 */
export async function loadLead4opFMPresetVerified(
  presetId: string,
  fallbackId = 'soft_rhodes',
): Promise<Lead4opFMPreset> {
  for (let attempt = 0; attempt <= LEAD4OP_PRESET_RETRY_DELAYS_MS.length; attempt++) {
    const isFinalAttempt = attempt === LEAD4OP_PRESET_RETRY_DELAYS_MS.length;
    const preset = await resolveLead4opFMPreset(presetId, isFinalAttempt);
    if (lead4opPresetMatchesLookup(preset, presetId, fallbackId) || isFinalAttempt) {
      return preset;
    }

    await waitForLead4opPresetRetry(LEAD4OP_PRESET_RETRY_DELAYS_MS[attempt]!);
  }

  return resolveLead4opFMPreset(presetId, true);
}

/**
 * Get all available preset IDs and names from the cloud preset store.
 */
export async function getLead4opFMPresetList(): Promise<{ id: string; name: string }[]> {
  const presets = [...FALLBACK_LEAD4OP_MANIFEST.presets.map(p => ({ id: p.id, name: p.name }))];
  const seenIds = new Set(presets.map(p => normalizeLeadPresetLookup(p.id)));
  const seenNames = new Set(presets.map(p => normalizeLeadPresetLookup(p.name)));

  try {
    const cloudPresets = await listLead4opStorePresets();
    for (const preset of cloudPresets) {
      const idKey = normalizeLeadPresetLookup(preset.id);
      const nameKey = normalizeLeadPresetLookup(preset.name);
      if (seenIds.has(idKey) || seenNames.has(nameKey)) continue;
      seenIds.add(idKey);
      seenNames.add(nameKey);
      presets.push(preset);
    }
  } catch (error) {
    console.warn('Failed to list cloud Lead4opFM presets:', error);
  }

  return presets;
}

/**
 * Play a single 4op FM note into an AudioContext.
 * 
 * This is the core synthesis function with full Digitone-style features:
 * - Per-operator level, feedback, detune, envelope rate
 * - LFO → FM depth modulation
 * - Unison voice stacking
 * - XY stereo panning, transient layer, and envelope shaping
 * 
 * @param ctx - AudioContext
 * @param destination - GainNode to connect output to (the shared lead bus)
 * @param frequency - Note frequency in Hz
 * @param velocity - Note timbre velocity 0..1
 * @param morphed - Pre-computed morphed params from morphPresets()
 * @param hold - Hold time in seconds (from shared leadHold param)
 * @returns stopTime (seconds) for cleanup scheduling
 */
export function playLead4opFMNote(
  ctx: AudioContext,
  destination: GainNode,
  frequency: number,
  velocity: number,
  morphed: Lead4opFMMorphedParams,
  hold: number,
): number {
  const now = ctx.currentTime;
  const unisonCount = Math.max(1, Math.min(4, morphed.unisonVoices || 1));
  const unisonSpread = morphed.unisonDetune || 0; // cents

  // Scale gain by 1/sqrt(unisonCount) to avoid volume increase
  const unisonGainScale = 1 / Math.sqrt(unisonCount);

  // ─── Output ───
  const output = ctx.createGain();
  output.gain.value = velocity * morphed.gain * unisonGainScale;

  // ─── Transient Layer (shared across unison voices) ───
  let transientGain: GainNode | null = null;
  let noiseBufferSource: AudioBufferSourceNode | null = null;
  let transientFilter: BiquadFilterNode | null = null;

  if (morphed.transientClick > 0 || morphed.transientNoise > 0) {
    transientGain = ctx.createGain();
    transientGain.gain.value = 0;

    transientFilter = ctx.createBiquadFilter();
    transientFilter.type = morphed.transientType === 'filtered' ? 'bandpass' : 'lowpass';
    transientFilter.frequency.value = morphed.transientFilter;
    transientFilter.Q.value = morphed.transientType === 'filtered' ? 2.0 : 0.7;

    const noiseDur = morphed.transientDuration / 1000;
    const bufferSize = Math.ceil(ctx.sampleRate * Math.max(0.1, noiseDur + 0.05));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brown = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      let sample = 0;
      switch (morphed.transientType) {
        case 'pink':
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
          break;
        case 'brown':
          brown = (brown + 0.02 * white) / 1.02;
          sample = brown * 3.5;
          break;
        case 'filtered':
          sample = white;
          break;
        default:
          sample = white;
      }
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * morphed.transientDecay);
      noiseData[i] = sample * env;
    }

    noiseBufferSource = ctx.createBufferSource();
    noiseBufferSource.buffer = noiseBuffer;
    noiseBufferSource.connect(transientFilter);
    transientFilter.connect(transientGain);
    transientGain.connect(output);
  }

  // ─── Per-operator params ───
  type OperatorParams = {
    ratio: number;
    index: number;
    decay: number;
    sustain: number;
    level: number;
    feedback: number;
    detune: number;
    envRate: number;
    modAttack: number;
    modDelay: number;
    waveform: Lead4opFMWaveform;
    fixedHz: number;
    keyTrack: number;
    velocityToIndex: number;
    velocityToLevel: number;
    modRelease: number;
  };
  const opParams: [OperatorParams, OperatorParams, OperatorParams, OperatorParams] = [
    { ratio: morphed.mod1Ratio, index: morphed.mod1Index, decay: morphed.mod1Decay, sustain: morphed.mod1Sustain, level: morphed.mod1Level, feedback: morphed.mod1Feedback, detune: morphed.mod1Detune, envRate: morphed.mod1EnvRate, modAttack: morphed.mod1ModAttack, modDelay: morphed.mod1ModDelay, waveform: morphed.mod1Waveform, fixedHz: morphed.mod1FixedHz, keyTrack: morphed.mod1KeyTrack, velocityToIndex: morphed.mod1VelocityToIndex, velocityToLevel: morphed.mod1VelocityToLevel, modRelease: morphed.mod1ModRelease },
    { ratio: morphed.mod2Ratio, index: morphed.mod2Index, decay: morphed.mod2Decay, sustain: morphed.mod2Sustain, level: morphed.mod2Level, feedback: morphed.mod2Feedback, detune: morphed.mod2Detune, envRate: morphed.mod2EnvRate, modAttack: morphed.mod2ModAttack, modDelay: morphed.mod2ModDelay, waveform: morphed.mod2Waveform, fixedHz: morphed.mod2FixedHz, keyTrack: morphed.mod2KeyTrack, velocityToIndex: morphed.mod2VelocityToIndex, velocityToLevel: morphed.mod2VelocityToLevel, modRelease: morphed.mod2ModRelease },
    { ratio: morphed.mod3Ratio, index: morphed.mod3Index, decay: morphed.mod3Decay, sustain: morphed.mod3Sustain, level: morphed.mod3Level, feedback: morphed.mod3Feedback, detune: morphed.mod3Detune, envRate: morphed.mod3EnvRate, modAttack: morphed.mod3ModAttack, modDelay: morphed.mod3ModDelay, waveform: morphed.mod3Waveform, fixedHz: morphed.mod3FixedHz, keyTrack: morphed.mod3KeyTrack, velocityToIndex: morphed.mod3VelocityToIndex, velocityToLevel: morphed.mod3VelocityToLevel, modRelease: morphed.mod3ModRelease },
    { ratio: morphed.mod4Ratio, index: morphed.mod4Index, decay: morphed.mod4Decay, sustain: morphed.mod4Sustain, level: morphed.mod4Level, feedback: morphed.mod4Feedback, detune: morphed.mod4Detune, envRate: morphed.mod4EnvRate, modAttack: morphed.mod4ModAttack, modDelay: morphed.mod4ModDelay, waveform: morphed.mod4Waveform, fixedHz: morphed.mod4FixedHz, keyTrack: morphed.mod4KeyTrack, velocityToIndex: morphed.mod4VelocityToIndex, velocityToLevel: morphed.mod4VelocityToLevel, modRelease: morphed.mod4ModRelease },
  ];

  // Track active notes for CPU overlay
  activeLeadNoteCount++;

  // Collect all nodes for cleanup
  const allNodes: AudioNode[] = [output];
  const allOscillators: OscillatorNode[] = [];

  // ─── Global ADSR (base values, scaled per-op by envRate) ───
  const baseAttack = morphed.attack;
  const baseDecay = morphed.decay;
  const baseSustain = morphed.sustain;
  const baseRelease = morphed.release;

  // Track longest release for stop time
  let maxStopTime = 0;

  // ─── Unison Loop ───
  for (let u = 0; u < unisonCount; u++) {
    // Compute unison detune offset: spread voices symmetrically
    let unisonCents = 0;
    if (unisonCount > 1) {
      unisonCents = unisonSpread * ((u / (unisonCount - 1)) * 2 - 1); // -spread..+spread
    }
    const unisonFreq = frequency * Math.pow(2, unisonCents / 1200);
    const carrier1BaseHz = unisonFreq;
    const carrier2BaseHz = unisonFreq * Math.pow(2, morphed.beatDetune / 1200);

    // ─── Carriers ───
    const carrier1 = ctx.createOscillator();
    carrier1.type = validWaveform(morphed.carrier1Waveform);
    carrier1.frequency.value = carrier1BaseHz;

    const carrier2 = ctx.createOscillator();
    carrier2.type = validWaveform(morphed.carrier2Waveform);
    carrier2.frequency.value = carrier2BaseHz;

    const carrier2GainNode = ctx.createGain();
    carrier2GainNode.gain.value = morphed.carrier2Mix;

    // ─── Modulators with per-op detune, level, feedback ───
    const modulators: OscillatorNode[] = [];
    const modGains: GainNode[] = [];
    const modLevelGains: GainNode[] = []; // per-op output level
    const fbGains: GainNode[] = []; // per-op self-feedback

    for (const [opIdx, op] of opParams.entries()) {
      const opFreq = operatorFrequency(unisonFreq, op, op.ratio, op.detune);
      const legacyVelocityMultiplier = opIdx === 0 ? velocity : 1;
      const modIdxVal = unisonFreq * op.index * legacyVelocityMultiplier * velocityScale(velocity, op.velocityToIndex);
      const opLevel = op.level * velocityScale(velocity, op.velocityToLevel);

      const modulator = ctx.createOscillator();
      modulator.type = validWaveform(op.waveform);
      modulator.frequency.value = opFreq;

      const modGain = ctx.createGain();
      modGain.gain.value = modIdxVal;

      // Per-operator level gain
      const levelGain = ctx.createGain();
      levelGain.gain.value = opLevel;

      // Connect: modulator → levelGain → modGain
      modulator.connect(levelGain);
      levelGain.connect(modGain);

      // Self-feedback: modulator → feedbackGain → modulator.frequency
      let fbGain: GainNode | null = null;
      if (op.feedback > 0) {
        fbGain = ctx.createGain();
        fbGain.gain.value = unisonFreq * op.feedback * 0.5; // scale feedback to audible range
        modulator.connect(fbGain);
        fbGain.connect(modulator.frequency);
        allNodes.push(fbGain);
      }

      modulators.push(modulator);
      modGains.push(modGain);
      modLevelGains.push(levelGain);
      fbGains.push(fbGain!);
      allOscillators.push(modulator);
      allNodes.push(modGain, levelGain);
    }

    const pitchEnv = {
      pitchEnvDepthCents: morphed.pitchEnvDepthCents,
      pitchEnvAttack: morphed.pitchEnvAttack,
      pitchEnvDecay: morphed.pitchEnvDecay,
      pitchEnvVelocityDepth: morphed.pitchEnvVelocityDepth,
    };
    if (morphed.pitchEnvTarget === 'carriers' || morphed.pitchEnvTarget === 'carrier1' || morphed.pitchEnvTarget === 'all') {
      applyPitchEnvToFrequency(carrier1.frequency, carrier1BaseHz, pitchEnv, now, velocity);
    }
    if (morphed.pitchEnvTarget === 'carriers' || morphed.pitchEnvTarget === 'carrier2' || morphed.pitchEnvTarget === 'all') {
      applyPitchEnvToFrequency(carrier2.frequency, carrier2BaseHz, pitchEnv, now, velocity);
    }
    if (morphed.pitchEnvTarget === 'all') {
      for (const [opIdx, modulator] of modulators.entries()) {
        const op = opParams[opIdx];
        if (!op) continue;
        applyPitchEnvToFrequency(modulator.frequency, operatorFrequency(unisonFreq, op, op.ratio, op.detune), pitchEnv, now, velocity);
      }
    }

    // ─── LFO → Modulation (target-dependent routing) ───
    let lfo: OscillatorNode | null = null;
    const lfoModGains: GainNode[] = [];
    const lfoTarget = morphed.lfoTarget || 'all';

    if (morphed.lfoDepth > 0 && morphed.lfoRate > 0 && lfoTarget !== 'none') {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = morphed.lfoRate;

      if (lfoTarget === 'all' || lfoTarget === 'mod1' || lfoTarget === 'mod2' ||
          lfoTarget === 'mod3' || lfoTarget === 'mod4') {
        // FM depth modulation (original behavior)
        for (let opIdx = 0; opIdx < 4; opIdx++) {
          const shouldModulate = lfoTarget === 'all' ||
            (lfoTarget === 'mod1' && opIdx === 0) ||
            (lfoTarget === 'mod2' && opIdx === 1) ||
            (lfoTarget === 'mod3' && opIdx === 2) ||
            (lfoTarget === 'mod4' && opIdx === 3);

          if (shouldModulate) {
            const targetOp = opParams[opIdx];
            const modGain = modGains[opIdx];
            if (!targetOp || !modGain) continue;
            const lfoGain = ctx.createGain();
            const legacyVelocityMultiplier = opIdx === 0 ? velocity : 1;
            lfoGain.gain.value = unisonFreq
              * targetOp.index
              * legacyVelocityMultiplier
              * velocityScale(velocity, targetOp.velocityToIndex)
              * morphed.lfoDepth;
            lfo.connect(lfoGain);
            lfoGain.connect(modGain.gain);
            lfoModGains.push(lfoGain);
            allNodes.push(lfoGain);
          }
        }
      } else if (lfoTarget === 'pitch') {
        // LFO → carrier pitch (vibrato)
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = unisonFreq * morphed.lfoDepth * 0.02; // ±2% pitch = subtle vibrato
        lfo.connect(lfoGain);
        lfoGain.connect(carrier1.frequency);
        lfoGain.connect(carrier2.frequency);
        lfoModGains.push(lfoGain);
        allNodes.push(lfoGain);
      } else if (lfoTarget === 'detune') {
        // LFO → carrier2 detune (movement/chorus effect)
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = unisonFreq * morphed.lfoDepth * 0.01; // subtle detuning
        lfo.connect(lfoGain);
        lfoGain.connect(carrier2.frequency);
        lfoModGains.push(lfoGain);
        allNodes.push(lfoGain);
      }
      // 'filter' target is connected later after filter nodes are created

      lfo.start(now);
      allOscillators.push(lfo);
      allNodes.push(lfo);
    }

    // ─── Envelopes (per-carrier, modulated by operator envRate) ───
    const envelope1 = ctx.createGain();
    envelope1.gain.value = 0;
    const envelope2 = ctx.createGain();
    envelope2.gain.value = 0;

    // ─── FM Algorithm Routing ───
    const connectToCarriers = (gainNode: GainNode, left: boolean = true, right: boolean = true) => {
      if (left) gainNode.connect(carrier1.frequency);
      if (right) gainNode.connect(carrier2.frequency);
    };

    const [modGain1, modGain2, modGain3, modGain4] = modGains;
    const [modulator1, modulator2, modulator3, modulator4] = modulators;
    if (!modGain1 || !modGain2 || !modGain3 || !modGain4 || !modulator1 || !modulator2 || !modulator3 || !modulator4) {
      throw new Error('FM operator graph incomplete');
    }

    if (morphed.algorithm === 'stack') {
      modGain4.connect(modulator3.frequency);
      modGain3.connect(modulator2.frequency);
      modGain2.connect(modulator1.frequency);
      connectToCarriers(modGain1, true, true);
    } else if (morphed.algorithm === 'split') {
      modGain1.connect(carrier1.frequency);
      modGain2.connect(carrier2.frequency);
      modGain3.connect(carrier1.frequency);
      modGain4.connect(carrier2.frequency);
    } else if (morphed.algorithm === 'cross') {
      connectToCarriers(modGain1, true, false);
      connectToCarriers(modGain2, true, false);
      connectToCarriers(modGain3, false, true);
      connectToCarriers(modGain4, false, true);
    } else if (morphed.algorithm === 'dx17') {
      carrier2GainNode.gain.value = 0;
      connectToCarriers(modGain3, true, false);
      modGain4.connect(modulator3.frequency);
      modGain2.connect(modulator3.frequency);
      connectToCarriers(modGain1, true, false);
    } else {
      // parallel: all → both carriers
      connectToCarriers(modGain1, true, true);
      connectToCarriers(modGain2, true, true);
      connectToCarriers(modGain3, true, true);
      connectToCarriers(modGain4, true, true);
    }

    carrier1.connect(envelope1);
    carrier2.connect(carrier2GainNode);
    carrier2GainNode.connect(envelope2);

    // ─── Drive / Waveshaper ───
    let driveNodeX: WaveShaperNode | null = null;
    let driveNodeY: WaveShaperNode | null = null;
    if (morphed.drive > 0.01) {
      // Pre-compute tanh soft-clip curve, drive 0..1 maps to gain 1..20
      const driveAmount = 1 + morphed.drive * 19;
      const nSamples = 1024;
      const curve = new Float32Array(nSamples);
      for (let i = 0; i < nSamples; i++) {
        const x = (i * 2) / nSamples - 1;
        curve[i] = Math.tanh(x * driveAmount);
      }
      driveNodeX = ctx.createWaveShaper();
      driveNodeX.curve = curve;
      driveNodeX.oversample = '2x';
      driveNodeY = ctx.createWaveShaper();
      driveNodeY.curve = curve;
      driveNodeY.oversample = '2x';
      allNodes.push(driveNodeX, driveNodeY);
    }

    // ─── XY Stereo Routing with Filter ───
    const filterX = ctx.createBiquadFilter();
    filterX.type = morphed.filterType;
    filterX.frequency.value = morphed.filterFreq;
    filterX.Q.value = morphed.filterQ;

    const filterY = ctx.createBiquadFilter();
    filterY.type = morphed.filterType;
    filterY.frequency.value = morphed.filterFreq;
    filterY.Q.value = morphed.filterQ;

    // ─── Filter Envelope ───
    if (Math.abs(morphed.filterEnvDepth) > 1) {
      const fBase = morphed.filterFreq;
      const fPeak = Math.max(20, Math.min(20000, fBase + morphed.filterEnvDepth));
      const fSustain = Math.max(20, Math.min(20000, fBase + morphed.filterEnvDepth * morphed.filterEnvSustain));
      const fEnvAtt = Math.max(0.001, morphed.filterEnvAttack);
      const fEnvDec = Math.max(0.001, morphed.filterEnvDecay);
      // fEnvRel reserved for future release-phase filter envelope
      // const fEnvRel = Math.max(0.001, morphed.filterEnvRelease);

      // Attack: base → peak
      filterX.frequency.setValueAtTime(fBase, now);
      filterX.frequency.linearRampToValueAtTime(fPeak, now + fEnvAtt);
      // Decay: peak → sustain
      filterX.frequency.linearRampToValueAtTime(fSustain, now + fEnvAtt + fEnvDec);

      filterY.frequency.setValueAtTime(fBase, now);
      filterY.frequency.linearRampToValueAtTime(fPeak, now + fEnvAtt);
      filterY.frequency.linearRampToValueAtTime(fSustain, now + fEnvAtt + fEnvDec);
    }

    // ─── LFO → Filter Frequency (connected here after filter nodes exist) ───
    if (lfo && lfoTarget === 'filter') {
      const lfoFilterGain = ctx.createGain();
      // LFO depth modulates filter cutoff: ±depth * baseFreq * 0.5
      lfoFilterGain.gain.value = morphed.filterFreq * morphed.lfoDepth * 0.5;
      lfo.connect(lfoFilterGain);
      lfoFilterGain.connect(filterX.frequency);
      lfoFilterGain.connect(filterY.frequency);
      lfoModGains.push(lfoFilterGain);
      allNodes.push(lfoFilterGain);
    }

    const xGainNode = ctx.createGain();
    xGainNode.gain.value = morphed.xLevel;
    const yGainNode = ctx.createGain();
    yGainNode.gain.value = morphed.yLevel;

    const xPanNode = ctx.createStereoPanner();
    const yPanNode = ctx.createStereoPanner();
    const spread = clamp(morphed.stereoSpread ?? 0, 0, 1);
    const spreadPos = unisonCount > 1 ? (u / (unisonCount - 1)) * 2 - 1 : 0;
    const panOffset = spreadPos * spread * 0.65;
    xPanNode.pan.value = clamp(morphed.xPan + panOffset, -1, 1);
    yPanNode.pan.value = clamp(morphed.yPan - panOffset, -1, 1);

    const voiceOutput = lfo && lfoTarget === 'amp' ? ctx.createGain() : null;
    if (voiceOutput) {
      voiceOutput.gain.setValueAtTime(1, now);
    }

    if (lfo && lfoTarget === 'pan') {
      const panDepthX = ctx.createGain();
      const panDepthY = ctx.createGain();
      const panDepth = clamp(morphed.lfoDepth, 0, 1) * 0.65;
      panDepthX.gain.setValueAtTime(panDepth, now);
      panDepthY.gain.setValueAtTime(-panDepth, now);
      lfo.connect(panDepthX).connect(xPanNode.pan);
      lfo.connect(panDepthY).connect(yPanNode.pan);
      lfoModGains.push(panDepthX, panDepthY);
      allNodes.push(panDepthX, panDepthY);
    }

    if (lfo && lfoTarget === 'amp' && voiceOutput) {
      const ampDepth = ctx.createGain();
      ampDepth.gain.setValueAtTime(clamp(morphed.lfoDepth, 0, 1) * 0.35, now);
      lfo.connect(ampDepth).connect(voiceOutput.gain);
      lfoModGains.push(ampDepth);
      allNodes.push(ampDepth);
    }

    // Signal chain: envelope → [drive] → filter → gain → pan → output
    if (driveNodeX && driveNodeY) {
      envelope1.connect(driveNodeX);
      driveNodeX.connect(filterX);
      envelope2.connect(driveNodeY);
      driveNodeY.connect(filterY);
    } else {
      envelope1.connect(filterX);
      envelope2.connect(filterY);
    }
    filterX.connect(xGainNode);
    xGainNode.connect(xPanNode);
    xPanNode.connect(voiceOutput ?? output);

    filterY.connect(yGainNode);
    yGainNode.connect(yPanNode);
    yPanNode.connect(voiceOutput ?? output);
    if (voiceOutput) {
      voiceOutput.connect(output);
    }

    // ─── Start Oscillators ───
    carrier1.start(now);
    carrier2.start(now);
    for (const mod of modulators) mod.start(now);
    allOscillators.push(carrier1, carrier2);
    allNodes.push(carrier1, carrier2, carrier2GainNode, envelope1, envelope2,
      filterX, filterY, xGainNode, yGainNode, xPanNode, yPanNode);
    if (voiceOutput) allNodes.push(voiceOutput);

    // ─── Amplitude Envelopes (per-op envRate on carrier envelopes) ───
    // Carrier 1 uses mod1's envRate, carrier 2 uses mod2's envRate (as primary modulators)
    const env1Rate = opParams[0].envRate;
    const env2Rate = opParams[1].envRate;
    const att1 = baseAttack * env1Rate;
    const dec1 = baseDecay * env1Rate;
    const rel1 = baseRelease * env1Rate;
    const att2 = baseAttack * env2Rate;
    const dec2 = baseDecay * env2Rate;
    const rel2 = baseRelease * env2Rate;

    envelope1.gain.setValueAtTime(0, now);
    envelope1.gain.linearRampToValueAtTime(1.0, now + att1);
    envelope1.gain.linearRampToValueAtTime(baseSustain, now + att1 + dec1);

    envelope2.gain.setValueAtTime(0, now);
    envelope2.gain.linearRampToValueAtTime(0.8, now + att2 * 1.2);
    envelope2.gain.linearRampToValueAtTime(baseSustain * 0.8, now + att2 + dec2);

    // ─── Modulation Envelopes: Digitone-style ADE (Delay → Attack → Decay → End) ───
    for (const [opIdx, op] of opParams.entries()) {
      const modGain = modGains[opIdx];
      if (!modGain) continue;
      const legacyVelocityMultiplier = opIdx === 0 ? velocity : 1;
      const modPeakVal = unisonFreq
        * op.index
        * legacyVelocityMultiplier
        * velocityScale(velocity, op.velocityToIndex);
      const modEndVal = Math.max(0.001, modPeakVal * op.sustain);
      const modDelay = op.modDelay || 0;  // delay before attack starts
      const modAttack = op.modAttack || 0;  // attack ramp time

      if (modDelay > 0 || modAttack > 0) {
        // Digitone ADE: start silent → delay → ramp up → decay to end level
        modGain.gain.setValueAtTime(0.001, now);
        if (modDelay > 0) {
          modGain.gain.setValueAtTime(0.001, now + modDelay);
        }
        modGain.gain.exponentialRampToValueAtTime(
          Math.max(0.001, modPeakVal),
          now + modDelay + Math.max(0.001, modAttack)
        );
        modGain.gain.exponentialRampToValueAtTime(
          modEndVal,
          now + modDelay + modAttack + op.decay
        );
      } else {
        // Legacy behavior: instant peak → decay to end (for presets without modAttack)
        modGain.gain.setValueAtTime(Math.max(0.001, modPeakVal), now);
        modGain.gain.exponentialRampToValueAtTime(
          modEndVal,
          now + op.decay
        );
      }
    }

    // ─── Hold & Release ───
    const longestAtt = Math.max(att1, att2);
    const longestDec = Math.max(dec1, dec2);
    const noteEnd = now + longestAtt + longestDec + hold;
    const longestRel = Math.max(rel1, rel2);
    const voiceStopTime = noteEnd + longestRel;

    envelope1.gain.setValueAtTime(baseSustain, noteEnd);
    envelope1.gain.exponentialRampToValueAtTime(0.001, noteEnd + rel1);

    envelope2.gain.setValueAtTime(baseSustain * 0.8, noteEnd);
    envelope2.gain.exponentialRampToValueAtTime(0.001, noteEnd + rel2);

    for (const [opIdx, op] of opParams.entries()) {
      const modRelease = Math.max(0, op.modRelease ?? 0);
      if (modRelease <= 0) continue;
      const modGain = modGains[opIdx];
      if (!modGain) continue;
      const legacyVelocityMultiplier = opIdx === 0 ? velocity : 1;
      const modPeakVal = unisonFreq
        * op.index
        * legacyVelocityMultiplier
        * velocityScale(velocity, op.velocityToIndex);
      const modEndVal = Math.max(0.001, modPeakVal * op.sustain);
      modGain.gain.cancelScheduledValues(noteEnd);
      modGain.gain.setValueAtTime(modEndVal, noteEnd);
      modGain.gain.exponentialRampToValueAtTime(0.001, noteEnd + Math.max(0.001, modRelease));
    }

    // ─── Filter Envelope Release ───
    if (Math.abs(morphed.filterEnvDepth) > 1) {
      const fBase = morphed.filterFreq;
      const fSustain = Math.max(20, Math.min(20000, fBase + morphed.filterEnvDepth * morphed.filterEnvSustain));
      const fEnvRel = Math.max(0.001, morphed.filterEnvRelease);
      filterX.frequency.setValueAtTime(fSustain, noteEnd);
      filterX.frequency.linearRampToValueAtTime(fBase, noteEnd + fEnvRel);
      filterY.frequency.setValueAtTime(fSustain, noteEnd);
      filterY.frequency.linearRampToValueAtTime(fBase, noteEnd + fEnvRel);
    }

    // ─── Stop Oscillators ───
    const cleanupTime = voiceStopTime + 0.1;
    for (const osc of allOscillators) {
      try { osc.stop(cleanupTime); } catch { /* already stopped */ }
    }

    if (voiceStopTime > maxStopTime) maxStopTime = voiceStopTime;
  }

  output.connect(destination);

  // ─── Start transient (shared) ───
  if (noiseBufferSource) noiseBufferSource.start(now);
  if (transientGain) {
    const noiseDur = morphed.transientDuration / 1000;
    const transientAttackScale = computeAttackTransientScale(baseAttack);
    const totalTransient = (morphed.transientClick + morphed.transientNoise) * velocity * 0.8 * transientAttackScale;
    transientGain.gain.setValueAtTime(totalTransient, now);
    transientGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur + 0.01);
    allNodes.push(transientGain);
    if (transientFilter) allNodes.push(transientFilter);
    if (noiseBufferSource) allNodes.push(noiseBufferSource);
  }

  const stopTime = maxStopTime;

  // ─── Cleanup ───
  setTimeout(() => {
    try {
      for (const node of allNodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    } catch {
      // Ignore cleanup errors
    }
    activeLeadNoteCount = Math.max(0, activeLeadNoteCount - 1);
  }, (stopTime - now + 0.3) * 1000);

  return stopTime;
}
