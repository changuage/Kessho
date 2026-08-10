/**
 * Pad Synth Preset System
 *
 * Each preset captures timbre/synthesis parameters for the pad synth.
 * Performance params (chords per phrase, voicing spread, wave spread, voice mask, octave,
 * synth level, reverb send) are NOT part of presets — they're controlled independently.
 *
 * Presets can be morphed between A/B using linear interpolation for numeric params
 * and threshold snapping for discrete params.
 */

import type { PresetLibrary } from '../presets/types';
import type { SliderMode } from '../ui/state';
import { clampMorphPosition } from './morphUtils';

/** Keys that a pad preset controls (timbre + oscillator + filter + envelope) */
export const PAD_PRESET_PARAM_KEYS = [
  // Oscillators
  'padOscAWave', 'padOscAWavePosition', 'padOscAPhaseDistortion', 'padOscAPitch', 'padOscALinearHzOffset', 'padOscALevel',
  'padOscBWave', 'padOscBWavePosition', 'padOscBPhaseDistortion', 'padOscBPitch', 'padOscBLinearHzOffset', 'padOscBLevel',
  'padDrift', 'padPhaseReset',
  'padOscMix',
  'padSubEnabled', 'padSubOctave', 'padSubWave', 'padSubLevel',
  'padNoiseType', 'padNoiseLevel',
  // Character
  'hardness', 'warmth', 'presence', 'padFoldAmount', 'padFoldMode',
  // Filter A
  'filterType', 'filterCutoff', 'filterResonance', 'filterQ', 'filterSlope', 'filterKeyTracking',
  // Filter B
  'padFilterBEnabled', 'padFilterBType', 'padFilterBCutoff', 'padFilterBResonance', 'padFilterBQ', 'padFilterRouting',
  // ADSR
  'synthAttack', 'synthDecay', 'synthSustain', 'synthHold', 'synthRelease',
  // LFO
  'padLfo1Rate', 'padLfo1Depth', 'padLfo1Wave', 'padLfo1Dest',
  'padLfo2Rate', 'padLfo2Depth', 'padLfo2Wave', 'padLfo2Dest',
  // Mod Envelope
  'padModEnvEnabled', 'padModEnvAttack', 'padModEnvDecay', 'padModEnvSustain', 'padModEnvRelease',
  'padModEnvDepth', 'padModEnvDest',
] as const;

export type PadPresetParamKey = typeof PAD_PRESET_PARAM_KEYS[number];

/** Map pad1 preset param keys → pad2 equivalents */
export const PAD1_TO_PAD2_KEY: Record<string, string> = {
  padOscAWave: 'pad2OscAWave', padOscAWavePosition: 'pad2OscAWavePosition', padOscAPhaseDistortion: 'pad2OscAPhaseDistortion', padOscAPitch: 'pad2OscAPitch', padOscALinearHzOffset: 'pad2OscALinearHzOffset', padOscALevel: 'pad2OscALevel',
  padOscBWave: 'pad2OscBWave', padOscBWavePosition: 'pad2OscBWavePosition', padOscBPhaseDistortion: 'pad2OscBPhaseDistortion', padOscBPitch: 'pad2OscBPitch', padOscBLinearHzOffset: 'pad2OscBLinearHzOffset', padOscBLevel: 'pad2OscBLevel',
  padDrift: 'pad2Drift', padPhaseReset: 'pad2PhaseReset',
  padOscMix: 'pad2OscMix',
  padSubEnabled: 'pad2SubEnabled', padSubOctave: 'pad2SubOctave', padSubWave: 'pad2SubWave', padSubLevel: 'pad2SubLevel',
  padNoiseType: 'pad2NoiseType', padNoiseLevel: 'pad2NoiseLevel',
  hardness: 'pad2Hardness', warmth: 'pad2Warmth', presence: 'pad2Presence',
  padFoldAmount: 'pad2FoldAmount', padFoldMode: 'pad2FoldMode',
  filterType: 'pad2FilterType', filterCutoff: 'pad2FilterCutoff',
  filterResonance: 'pad2FilterResonance', filterQ: 'pad2FilterQ', filterSlope: 'pad2FilterSlope', filterKeyTracking: 'pad2FilterKeyTracking',
  padFilterBEnabled: 'pad2FilterBEnabled', padFilterBType: 'pad2FilterBType', padFilterBCutoff: 'pad2FilterBCutoff',
  padFilterBResonance: 'pad2FilterBResonance', padFilterBQ: 'pad2FilterBQ', padFilterRouting: 'pad2FilterRouting',
  synthAttack: 'pad2Attack', synthDecay: 'pad2Decay', synthSustain: 'pad2Sustain', synthHold: 'pad2Hold', synthRelease: 'pad2Release',
  padLfo1Rate: 'pad2Lfo1Rate', padLfo1Depth: 'pad2Lfo1Depth', padLfo1Wave: 'pad2Lfo1Wave', padLfo1Dest: 'pad2Lfo1Dest',
  padLfo2Rate: 'pad2Lfo2Rate', padLfo2Depth: 'pad2Lfo2Depth', padLfo2Wave: 'pad2Lfo2Wave', padLfo2Dest: 'pad2Lfo2Dest',
  padModEnvEnabled: 'pad2ModEnvEnabled', padModEnvAttack: 'pad2ModEnvAttack', padModEnvDecay: 'pad2ModEnvDecay',
  padModEnvSustain: 'pad2ModEnvSustain', padModEnvRelease: 'pad2ModEnvRelease',
  padModEnvDepth: 'pad2ModEnvDepth', padModEnvDest: 'pad2ModEnvDest',
};

/** All pad-morph-derived keys (pad1 + pad2) — recomputed on load, not meaningful in diffs */
export const DERIVED_PAD_KEYS = new Set<string>([
  ...PAD_PRESET_PARAM_KEYS,
  ...Object.values(PAD1_TO_PAD2_KEY),
]);

const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, string>;

export interface PadPreset {
  name: string;
  tags: string[];
  params: Record<string, number | string | boolean>;
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
}

export interface PadPresetOption {
  id: string;
  name: string;
  library: PresetLibrary;
  scope?: 'pad1' | 'pad2';
  tags?: string[];
  updatedAt?: number;
  rating?: number;
}

export function createRuntimePadPreset(
  scope: 'pad1' | 'pad2',
  name: string,
  data: Record<string, unknown>,
  tags: string[] = [],
  dualRanges?: Record<string, { min: number; max: number }>,
  sliderModes?: Record<string, SliderMode>,
): PadPreset {
  const params: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    const targetKey = scope === 'pad1' ? key : PAD2_TO_PAD1_KEY[key];
    if (targetKey && (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')) {
      params[targetKey] = value;
    }
  }

  const canonicalDualRanges: Record<string, { min: number; max: number }> = {};
  const canonicalSliderModes: Record<string, SliderMode> = {};
  for (const [key, range] of Object.entries(dualRanges ?? {})) {
    const targetKey = scope === 'pad1' ? key : PAD2_TO_PAD1_KEY[key];
    if (!targetKey) continue;
    canonicalDualRanges[targetKey] = range;
    const mode = sliderModes?.[key];
    if (mode === 'walk' || mode === 'sampleHold') canonicalSliderModes[targetKey] = mode;
  }

  return {
    name,
    tags,
    params,
    ...(Object.keys(canonicalDualRanges).length > 0 ? { dualRanges: canonicalDualRanges } : {}),
    ...(Object.keys(canonicalSliderModes).length > 0 ? { sliderModes: canonicalSliderModes } : {}),
  };
}

interface RuntimePadPresetEntry extends PadPresetOption {
  preset: PadPreset;
}

// ─── Preset Definitions ───

export const PAD_PRESET_DEFAULT_PARAMS: Record<string, number | string | boolean> = {
  padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.6,
  padOscBWave: 'triangle', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 0.08, padOscBLinearHzOffset: 0, padOscBLevel: 0.4,
  padDrift: 0.42, padPhaseReset: 2,
  padOscMix: 0.5,
  padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
  padNoiseType: 'white', padNoiseLevel: 0.15,
  hardness: 0.3, warmth: 0.4, presence: 0.3, padFoldAmount: 0, padFoldMode: 0,
  filterType: 'lowpass', filterCutoff: 1700,
  filterResonance: 0.2, filterQ: 1.0, filterSlope: 12, filterKeyTracking: 0,
  padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 200,
  padFilterBResonance: 0.2, padFilterBQ: 1, padFilterRouting: 'series',
  synthAttack: 6, synthDecay: 1, synthSustain: 0.8, synthHold: 1, synthRelease: 12,
  padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
  padLfo2Rate: 0.5, padLfo2Depth: 0, padLfo2Wave: 'sine', padLfo2Dest: 'none',
  padModEnvEnabled: false, padModEnvAttack: 0.5, padModEnvDecay: 2,
  padModEnvSustain: 0, padModEnvRelease: 4, padModEnvDepth: 0.5, padModEnvDest: 'filterCutoff',
};

const INIT: PadPreset = {
  name: 'Init',
  tags: ['basic', 'neutral'],
  params: { ...PAD_PRESET_DEFAULT_PARAMS },
};

/** Captures the "String Waves" pad sound — saturated detuned saws through dark filter */
const SATURATED_DRIFT: PadPreset = {
  name: 'Saturated Drift',
  tags: ['dark', 'warm', 'drifting'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.6,
    padOscBWave: 'triangle', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 0.08, padOscBLinearHzOffset: 0, padOscBLevel: 0.4,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
    padNoiseType: 'white', padNoiseLevel: 0.36,
    hardness: 0.56, warmth: 0.4, presence: 0.47,
    filterType: 'lowpass', filterCutoff: 865,
    filterResonance: 0.2, filterQ: 1.0,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 200,
    padFilterBResonance: 0.2, padFilterBQ: 1, padFilterRouting: 'series',
    synthAttack: 6, synthDecay: 1, synthSustain: 0.8, synthRelease: 12,
    padLfo1Rate: 0.09, padLfo1Depth: 1.0, padLfo1Wave: 'randomWalk', padLfo1Dest: 'filterCutoff',
    padModEnvEnabled: false, padModEnvAttack: 0.5, padModEnvDecay: 2,
    padModEnvSustain: 0, padModEnvRelease: 4, padModEnvDepth: 0.5, padModEnvDest: 'filterCutoff',
  },
};

const DEEP_SUB_DRONE: PadPreset = {
  name: 'Taurus Underworld',
  tags: ['bass', 'analog', 'taurus', 'drone', 'dark'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: -12, padOscALinearHzOffset: 0, padOscALevel: 0.64,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: -0.22, padOscBPitch: -12.01, padOscBLinearHzOffset: 0, padOscBLevel: 0.42,
    padOscMix: 0.46, padDrift: 0.12, padPhaseReset: 1,
    padSubEnabled: true, padSubOctave: -2, padSubWave: 'sine', padSubLevel: 0.55,
    padNoiseType: 'pink', padNoiseLevel: 0.015,
    hardness: 0.3, warmth: 0.82, presence: 0.08, padFoldAmount: 0, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 135,
    filterResonance: 0.32, filterQ: 0.8, filterSlope: 24, filterKeyTracking: 0.18,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 32,
    padFilterBResonance: 0.05, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.005, synthDecay: 0.25, synthSustain: 0.72, synthRelease: 0.14,
    padLfo1Rate: 0.12, padLfo1Depth: 0.05, padLfo1Wave: 'triangle', padLfo1Dest: 'filterResonance',
    padModEnvEnabled: true, padModEnvAttack: 0.004, padModEnvDecay: 0.42,
    padModEnvSustain: 0.08, padModEnvRelease: 0.1, padModEnvDepth: 0.72, padModEnvDest: 'filterCutoff',
  },
};

/** A modern companion to the original, voiced around the new complex oscillators. */
const SATURATED_DRIFT_II: PadPreset = {
  name: 'Saturated Drift II',
  tags: ['pad', 'dark', 'warm', 'complex', 'evolving', 'showcase'],
  params: {
    padOscAWave: 'complexTriangle', padOscAWavePosition: 0.28, padOscAPhaseDistortion: -0.08, padOscAPitch: 0, padOscALinearHzOffset: -0.15, padOscALevel: 0.58,
    padOscBWave: 'harmonic', padOscBWavePosition: 0.38, padOscBPhaseDistortion: 0.12, padOscBPitch: 0.07, padOscBLinearHzOffset: 0.35, padOscBLevel: 0.45,
    padOscMix: 0.48, padDrift: 0.68, padPhaseReset: 2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.14,
    padNoiseType: 'pink', padNoiseLevel: 0.12,
    hardness: 0.35, warmth: 0.72, presence: 0.3, padFoldAmount: 0.22, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 920,
    filterResonance: 0.24, filterQ: 1, filterSlope: 24, filterKeyTracking: 0.22,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 75,
    padFilterBResonance: 0.05, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 5.5, synthDecay: 2, synthSustain: 0.82, synthHold: 1, synthRelease: 14,
    padLfo1Rate: 0.055, padLfo1Depth: 0.28, padLfo1Wave: 'randomSmooth', padLfo1Dest: 'oscAPosition',
    padLfo2Rate: 0.037, padLfo2Depth: 0.18, padLfo2Wave: 'randomWalk', padLfo2Dest: 'oscBPhaseDistortion',
    padModEnvEnabled: false,
  },
};

const GLASS_SHIMMER: PadPreset = {
  name: 'Complex Aurora',
  tags: ['pad', 'complex', 'crystal', 'evolving', 'showcase'],
  params: {
    padOscAWave: 'complexSine', padOscAWavePosition: 0.45, padOscAPhaseDistortion: 0.18, padOscAPitch: 0, padOscALinearHzOffset: -0.2, padOscALevel: 0.56,
    padOscBWave: 'complexTriangle', padOscBWavePosition: 0.62, padOscBPhaseDistortion: -0.15, padOscBPitch: 12.04, padOscBLinearHzOffset: 0.6, padOscBLevel: 0.36,
    padOscMix: 0.47, padDrift: 0.5, padPhaseReset: 0,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.1,
    padNoiseType: 'white', padNoiseLevel: 0.025,
    hardness: 0.12, warmth: 0.28, presence: 0.62, padFoldAmount: 0.18, padFoldMode: 1,
    filterType: 'lowpass', filterCutoff: 2800,
    filterResonance: 0.18, filterQ: 1.2, filterSlope: 12, filterKeyTracking: 0.38,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 120,
    padFilterBResonance: 0.08, padFilterBQ: 0.8, padFilterRouting: 'series',
    synthAttack: 4.5, synthDecay: 2, synthSustain: 0.78, synthRelease: 13,
    padLfo1Rate: 0.07, padLfo1Depth: 0.25, padLfo1Wave: 'sine', padLfo1Dest: 'oscAPosition',
    padLfo2Rate: 0.043, padLfo2Depth: 0.22, padLfo2Wave: 'randomSmooth', padLfo2Dest: 'oscBPosition',
    padModEnvEnabled: true, padModEnvAttack: 3, padModEnvDecay: 8,
    padModEnvSustain: 0.4, padModEnvRelease: 10, padModEnvDepth: 0.2, padModEnvDest: 'oscAPhaseDistortion',
  },
};

const WARM_ANALOG: PadPreset = {
  name: 'Juno Silk',
  tags: ['pad', 'analog', 'juno', 'pwm', 'warm'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: -0.1, padOscALevel: 0.55,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: 0.18, padOscBPitch: 0.06, padOscBLinearHzOffset: 0.2, padOscBLevel: 0.42,
    padOscMix: 0.48, padDrift: 0.35, padPhaseReset: 2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.18,
    padNoiseType: 'pink', padNoiseLevel: 0.045,
    hardness: 0.14, warmth: 0.76, presence: 0.26, padFoldAmount: 0.04, padFoldMode: 1,
    filterType: 'ladderLp', filterCutoff: 1250,
    filterResonance: 0.18, filterQ: 1, filterSlope: 24, filterKeyTracking: 0.32,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 90,
    padFilterBResonance: 0.05, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 2.2, synthDecay: 1.2, synthSustain: 0.82, synthRelease: 8,
    padLfo1Rate: 0.18, padLfo1Depth: 0.18, padLfo1Wave: 'triangle', padLfo1Dest: 'oscBPhaseDistortion',
    padLfo2Rate: 5.1, padLfo2Depth: 0.012, padLfo2Wave: 'sine', padLfo2Dest: 'pitch',
    padModEnvEnabled: false,
  },
};

const DIGITAL_ICE: PadPreset = {
  name: 'PPG Ice Bells',
  tags: ['80s', 'digital', 'bell', 'ear candy', 'showcase'],
  params: {
    padOscAWave: 'harmonic', padOscAWavePosition: 0.75, padOscAPhaseDistortion: 0.22, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.52,
    padOscBWave: 'complexSine', padOscBWavePosition: 0.82, padOscBPhaseDistortion: -0.28, padOscBPitch: 19, padOscBLinearHzOffset: 2, padOscBLevel: 0.3,
    padOscMix: 0.44, padDrift: 0.08, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'white', padNoiseLevel: 0.018,
    hardness: 0.42, warmth: 0.05, presence: 0.76, padFoldAmount: 0.14, padFoldMode: 1,
    filterType: 'bandpass', filterCutoff: 3400,
    filterResonance: 0.38, filterQ: 2.5, filterSlope: 12, filterKeyTracking: 0.55,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 300,
    padFilterBResonance: 0.08, padFilterBQ: 1.1, padFilterRouting: 'series',
    synthAttack: 0.005, synthDecay: 0.65, synthSustain: 0, synthRelease: 0.9,
    padLfo1Rate: 0.13, padLfo1Depth: 0.06, padLfo1Wave: 'randomSmooth', padLfo1Dest: 'oscBLinearHzOffset',
    padLfo2Rate: 0.21, padLfo2Depth: 0.12, padLfo2Wave: 'sampleHold', padLfo2Dest: 'oscAPosition',
    padModEnvEnabled: true, padModEnvAttack: 0.004, padModEnvDecay: 0.4,
    padModEnvSustain: 0, padModEnvRelease: 0.5, padModEnvDepth: 0.45, padModEnvDest: 'oscBPhaseDistortion',
  },
};

const BREATH: PadPreset = {
  name: 'Tape Choir',
  tags: ['pad', 'choir', 'tape', 'ethereal', 'analog'],
  params: {
    padOscAWave: 'harmonic', padOscAWavePosition: 0.22, padOscAPhaseDistortion: -0.08, padOscAPitch: 0, padOscALinearHzOffset: -0.25, padOscALevel: 0.42,
    padOscBWave: 'complexSine', padOscBWavePosition: 0.15, padOscBPhaseDistortion: 0.06, padOscBPitch: 12.02, padOscBLinearHzOffset: 0.35, padOscBLevel: 0.28,
    padOscMix: 0.43, padDrift: 0.55, padPhaseReset: 0,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.1,
    padNoiseType: 'pink', padNoiseLevel: 0.28,
    hardness: 0.08, warmth: 0.68, presence: 0.34, padFoldAmount: 0.06, padFoldMode: 0,
    filterType: 'lowpass', filterCutoff: 1350,
    filterResonance: 0.12, filterQ: 0.8, filterSlope: 12, filterKeyTracking: 0.22,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 180,
    padFilterBResonance: 0.05, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 5, synthDecay: 2, synthSustain: 0.72, synthRelease: 12,
    padLfo1Rate: 0.08, padLfo1Depth: 0.18, padLfo1Wave: 'randomSmooth', padLfo1Dest: 'oscAPosition',
    padLfo2Rate: 0.16, padLfo2Depth: 0.08, padLfo2Wave: 'sine', padLfo2Dest: 'amplitude',
    padModEnvEnabled: false,
  },
};

const CATHEDRAL_ORGAN: PadPreset = {
  name: 'Prophet Strings',
  tags: ['strings', 'analog', 'prophet', 'pad', 'lush'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: -0.15, padOscALevel: 0.54,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: 0.2, padOscBPitch: 12.04, padOscBLinearHzOffset: 0.25, padOscBLevel: 0.34,
    padOscMix: 0.44, padDrift: 0.34, padPhaseReset: 2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.15,
    padNoiseType: 'pink', padNoiseLevel: 0.03,
    hardness: 0.12, warmth: 0.7, presence: 0.32, padFoldAmount: 0.03, padFoldMode: 1,
    filterType: 'ladderLp', filterCutoff: 1900,
    filterResonance: 0.14, filterQ: 0.8, filterSlope: 24, filterKeyTracking: 0.35,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 120,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 1.8, synthDecay: 1.2, synthSustain: 0.84, synthRelease: 7,
    padLfo1Rate: 0.22, padLfo1Depth: 0.18, padLfo1Wave: 'triangle', padLfo1Dest: 'oscBPhaseDistortion',
    padLfo2Rate: 5.3, padLfo2Depth: 0.01, padLfo2Wave: 'sine', padLfo2Dest: 'pitch',
    padModEnvEnabled: false,
  },
};

// ─── Short Attack / Short Decay Presets (Plucks & Leads) ───

/** Bright 1980s polysynth pluck with a PWM octave sparkle. */
const PLUCK_BELL: PadPreset = {
  name: '80s Polysix Pluck',
  tags: ['pluck', '80s', 'analog', 'pwm', 'ear candy'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: -0.1, padOscALevel: 0.55,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: 0.24, padOscBPitch: 12.03, padOscBLinearHzOffset: 0.3, padOscBLevel: 0.34,
    padOscMix: 0.45, padDrift: 0.12, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.15,
    padNoiseType: 'white', padNoiseLevel: 0.025,
    hardness: 0.18, warmth: 0.42, presence: 0.58, padFoldAmount: 0.03, padFoldMode: 1,
    filterType: 'ladderLp', filterCutoff: 2200,
    filterResonance: 0.28, filterQ: 1.2, filterSlope: 24, filterKeyTracking: 0.45,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 140,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.004, synthDecay: 0.38, synthSustain: 0, synthRelease: 0.85,
    padLfo1Rate: 0.24, padLfo1Depth: 0.08, padLfo1Wave: 'triangle', padLfo1Dest: 'oscBPhaseDistortion',
    padModEnvEnabled: true, padModEnvAttack: 0.004, padModEnvDecay: 0.32,
    padModEnvSustain: 0, padModEnvRelease: 0.45, padModEnvDepth: 0.72, padModEnvDest: 'filterCutoff',
  },
};

/** Gentle rounded pluck with a moving complex-wave attack. */
const SOFT_PLUCK: PadPreset = {
  name: 'Soft Pluck',
  tags: ['pluck', 'soft', 'warm', 'complex', 'mellow'],
  params: {
    padOscAWave: 'complexTriangle', padOscAWavePosition: 0.18, padOscAPhaseDistortion: -0.12, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.5,
    padOscBWave: 'triangle', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 7.02, padOscBLinearHzOffset: 0.2, padOscBLevel: 0.27,
    padOscMix: 0.4, padDrift: 0.16, padPhaseReset: 1,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.16,
    padNoiseType: 'pink', padNoiseLevel: 0.025,
    hardness: 0.07, warmth: 0.68, presence: 0.24, padFoldAmount: 0.12, padFoldMode: 0,
    filterType: 'lowpass', filterCutoff: 1500,
    filterResonance: 0.12, filterQ: 0.9, filterSlope: 12, filterKeyTracking: 0.35,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 75,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.006, synthDecay: 0.72, synthSustain: 0.04, synthRelease: 1.8,
    padLfo1Rate: 0.09, padLfo1Depth: 0.04, padLfo1Wave: 'randomSmooth', padLfo1Dest: 'oscBLinearHzOffset',
    padModEnvEnabled: true, padModEnvAttack: 0.004, padModEnvDecay: 0.5,
    padModEnvSustain: 0, padModEnvRelease: 0.8, padModEnvDepth: 0.32, padModEnvDest: 'oscAPosition',
  },
};

/** Odyssey-inspired square/saw snap with a sharp ladder transient. */
const HARSH_PLUCK: PadPreset = {
  name: 'Odyssey Snap',
  tags: ['pluck', 'analog', 'odyssey', 'aggressive', 'snappy'],
  params: {
    padOscAWave: 'square', padOscAWavePosition: 0, padOscAPhaseDistortion: -0.35, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.6,
    padOscBWave: 'sawtooth', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 7.05, padOscBLinearHzOffset: 0.25, padOscBLevel: 0.4,
    padOscMix: 0.42, padDrift: 0.08, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'white', padNoiseLevel: 0.08,
    hardness: 0.58, warmth: 0.14, presence: 0.62, padFoldAmount: 0.25, padFoldMode: 2,
    filterType: 'ladderLp', filterCutoff: 3100,
    filterResonance: 0.4, filterQ: 2, filterSlope: 24, filterKeyTracking: 0.4,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 120,
    padFilterBResonance: 0.06, padFilterBQ: 0.8, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.24, synthSustain: 0, synthRelease: 0.55,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.16,
    padModEnvSustain: 0, padModEnvRelease: 0.3, padModEnvDepth: 0.9, padModEnvDest: 'filterCutoff',
  },
};

/** Glossy digital tine with a slowly shifting complex overtone. */
const METAL_TINE: PadPreset = {
  name: 'Neon Tines',
  tags: ['pluck', 'keys', '80s', 'tine', 'ear candy'],
  params: {
    padOscAWave: 'sine', padOscAWavePosition: 0, padOscAPhaseDistortion: 0.08, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.56,
    padOscBWave: 'complexSine', padOscBWavePosition: 0.78, padOscBPhaseDistortion: -0.18, padOscBPitch: 12.01, padOscBLinearHzOffset: 1.2, padOscBLevel: 0.28,
    padOscMix: 0.39, padDrift: 0.06, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.15,
    padNoiseType: 'white', padNoiseLevel: 0.012,
    hardness: 0.22, warmth: 0.3, presence: 0.66, padFoldAmount: 0.25, padFoldMode: 1,
    filterType: 'lowpass', filterCutoff: 4200,
    filterResonance: 0.12, filterQ: 0.8, filterSlope: 12, filterKeyTracking: 0.52,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 220,
    padFilterBResonance: 0.05, padFilterBQ: 0.8, padFilterRouting: 'series',
    synthAttack: 0.004, synthDecay: 1.1, synthSustain: 0.08, synthRelease: 2.2,
    padLfo1Rate: 0.16, padLfo1Depth: 0.09, padLfo1Wave: 'triangle', padLfo1Dest: 'oscBPosition',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.72,
    padModEnvSustain: 0, padModEnvRelease: 1, padModEnvDepth: 0.48, padModEnvDest: 'foldAmount',
  },
};

/** Prophet-style dual-saw lead with restrained drift and vibrato. */
const POLY_LEAD: PadPreset = {
  name: 'Prophet Poly Lead',
  tags: ['lead', 'poly', 'analog', 'prophet', 'sustained'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: -0.18, padOscALevel: 0.56,
    padOscBWave: 'sawtooth', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 0.07, padOscBLinearHzOffset: 0.22, padOscBLevel: 0.43,
    padOscMix: 0.47, padDrift: 0.22, padPhaseReset: 2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.14,
    padNoiseType: 'pink', padNoiseLevel: 0.018,
    hardness: 0.24, warmth: 0.52, presence: 0.48, padFoldAmount: 0.04, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 3200,
    filterResonance: 0.2, filterQ: 1.2, filterSlope: 24, filterKeyTracking: 0.45,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 95,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.015, synthDecay: 0.32, synthSustain: 0.72, synthRelease: 0.7,
    padLfo1Rate: 5.1, padLfo1Depth: 0.012, padLfo1Wave: 'sine', padLfo1Dest: 'pitch',
    padLfo2Rate: 0.19, padLfo2Depth: 0.04, padLfo2Wave: 'randomSmooth', padLfo2Dest: 'filterResonance',
    padModEnvEnabled: true, padModEnvAttack: 0.008, padModEnvDecay: 0.22,
    padModEnvSustain: 0, padModEnvRelease: 0.35, padModEnvDepth: 0.38, padModEnvDest: 'filterCutoff',
  },
};

/** Resonant ladder squelch with pulse-width and resonance movement. */
const ACID_STAB: PadPreset = {
  name: 'Acid Ladder Stab',
  tags: ['lead', 'acid', 'analog', 'ladder', 'stab'],
  params: {
    padOscAWave: 'square', padOscAWavePosition: 0, padOscAPhaseDistortion: -0.18, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.54,
    padOscBWave: 'sawtooth', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: -12, padOscBLinearHzOffset: 0, padOscBLevel: 0.34,
    padOscMix: 0.42, padDrift: 0.05, padPhaseReset: 1,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'square', padSubLevel: 0.2,
    padNoiseType: 'white', padNoiseLevel: 0,
    hardness: 0.44, warmth: 0.2, presence: 0.42, padFoldAmount: 0.08, padFoldMode: 2,
    filterType: 'ladderLp', filterCutoff: 420,
    filterResonance: 0.74, filterQ: 6, filterSlope: 24, filterKeyTracking: 0.34,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 55,
    padFilterBResonance: 0.03, padFilterBQ: 0.6, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.22, synthSustain: 0, synthRelease: 0.32,
    padLfo1Rate: 0.31, padLfo1Depth: 0.08, padLfo1Wave: 'triangle', padLfo1Dest: 'oscAPhaseDistortion',
    padLfo2Rate: 0.14, padLfo2Depth: 0.1, padLfo2Wave: 'randomSmooth', padLfo2Dest: 'filterResonance',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.18,
    padModEnvSustain: 0, padModEnvRelease: 0.25, padModEnvDepth: 0.9, padModEnvDest: 'filterCutoff',
  },
};

/** Rounded, rubbery analog key with a short pulse transient. */
const MUTED_KEY: PadPreset = {
  name: 'Rubber Key',
  tags: ['pluck', 'keys', 'analog', 'rubber', 'muted'],
  params: {
    padOscAWave: 'triangle', padOscAWavePosition: 0, padOscAPhaseDistortion: -0.08, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.54,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: 0.35, padOscBPitch: 0.03, padOscBLinearHzOffset: 0.1, padOscBLevel: 0.24,
    padOscMix: 0.38, padDrift: 0.12, padPhaseReset: 1,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.24,
    padNoiseType: 'pink', padNoiseLevel: 0.04,
    hardness: 0.12, warmth: 0.72, presence: 0.16, padFoldAmount: 0.04, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 780,
    filterResonance: 0.2, filterQ: 0.9, filterSlope: 24, filterKeyTracking: 0.28,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 60,
    padFilterBResonance: 0.03, padFilterBQ: 0.6, padFilterRouting: 'series',
    synthAttack: 0.004, synthDecay: 0.48, synthSustain: 0.04, synthRelease: 0.85,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.28,
    padModEnvSustain: 0, padModEnvRelease: 0.45, padModEnvDepth: 0.58, padModEnvDest: 'filterCutoff',
  },
};

/** Glass marimba using two table positions for an inharmonic strike. */
const GLASS_MARIMBA: PadPreset = {
  name: 'Glass Marimba',
  tags: ['pluck', 'percussive', 'marimba', 'complex', 'crystal'],
  params: {
    padOscAWave: 'complexSine', padOscAWavePosition: 0.65, padOscAPhaseDistortion: 0.16, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.58,
    padOscBWave: 'harmonic', padOscBWavePosition: 0.78, padOscBPhaseDistortion: -0.1, padOscBPitch: 12, padOscBLinearHzOffset: 1.8, padOscBLevel: 0.28,
    padOscMix: 0.38, padDrift: 0.04, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.15,
    padNoiseType: 'white', padNoiseLevel: 0.015,
    hardness: 0.1, warmth: 0.16, presence: 0.72, padFoldAmount: 0.09, padFoldMode: 1,
    filterType: 'bandpass', filterCutoff: 4100,
    filterResonance: 0.22, filterQ: 1.8, filterSlope: 12, filterKeyTracking: 0.62,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 250,
    padFilterBResonance: 0.05, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.42, synthSustain: 0, synthRelease: 1.15,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.002, padModEnvDecay: 0.2,
    padModEnvSustain: 0, padModEnvRelease: 0.4, padModEnvDepth: 0.42, padModEnvDest: 'oscBPosition',
  },
};

/** SH-101-style rubber bass with a compact envelope and pulse body. */
const SUB_PLUCK: PadPreset = {
  name: 'SH-101 Rubber Bass',
  tags: ['bass', 'analog', 'sh-101', 'rubber', 'pluck'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: -12, padOscALinearHzOffset: 0, padOscALevel: 0.56,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: 0.2, padOscBPitch: -12.02, padOscBLinearHzOffset: 0, padOscBLevel: 0.34,
    padOscMix: 0.43, padDrift: 0.08, padPhaseReset: 1,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'square', padSubLevel: 0.3,
    padNoiseType: 'pink', padNoiseLevel: 0.012,
    hardness: 0.24, warmth: 0.76, presence: 0.12, padFoldAmount: 0.03, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 180,
    filterResonance: 0.34, filterQ: 1.1, filterSlope: 24, filterKeyTracking: 0.26,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 34,
    padFilterBResonance: 0.02, padFilterBQ: 0.6, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.38, synthSustain: 0.12, synthRelease: 0.45,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.3,
    padModEnvSustain: 0.04, padModEnvRelease: 0.3, padModEnvDepth: 0.74, padModEnvDest: 'filterCutoff',
  },
};

/** Fat Minimoog-style bass: low triangle fundamental with an upper saw driving the ladder. */
const CLASSIC_MOOG_BASS: PadPreset = {
  name: 'Classic Moog Bass',
  tags: ['bass', 'analog', 'classic', 'moog', 'ladder', 'fat', 'growl'],
  params: {
    padOscAWave: 'triangle', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: -12, padOscALinearHzOffset: 0, padOscALevel: 0.72,
    padOscBWave: 'sawtooth', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 0.01, padOscBLinearHzOffset: 0, padOscBLevel: 0.48,
    padOscMix: 0.45,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.14,
    padNoiseType: 'white', padNoiseLevel: 0,
    hardness: 0.38, warmth: 0.8, presence: 0.18,
    padFoldAmount: 0, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 170,
    filterResonance: 0.22, filterQ: 0.8, filterSlope: 24, filterKeyTracking: 0.3,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 40,
    padFilterBResonance: 0, padFilterBQ: 0.7, padFilterRouting: 'aOnly',
    synthAttack: 0.008, synthDecay: 0.3, synthSustain: 0.84, synthRelease: 0.08,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padLfo2Rate: 0.5, padLfo2Depth: 0, padLfo2Wave: 'sine', padLfo2Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.008, padModEnvDecay: 0.55,
    padModEnvSustain: 0.08, padModEnvRelease: 0.08, padModEnvDepth: 0.65, padModEnvDest: 'filterCutoff',
  },
};

/** Wide PWM lead with animated duty cycle and a bright fifth. */
const SYNC_LEAD: PadPreset = {
  name: 'PWM Hero',
  tags: ['lead', 'analog', 'pwm', 'bright', 'hero'],
  params: {
    padOscAWave: 'square', padOscAWavePosition: 0, padOscAPhaseDistortion: 0.28, padOscAPitch: 0, padOscALinearHzOffset: -0.15, padOscALevel: 0.56,
    padOscBWave: 'sawtooth', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 7.04, padOscBLinearHzOffset: 0.3, padOscBLevel: 0.38,
    padOscMix: 0.44, padDrift: 0.18, padPhaseReset: 2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'square', padSubLevel: 0.16,
    padNoiseType: 'white', padNoiseLevel: 0.02,
    hardness: 0.42, warmth: 0.3, presence: 0.68, padFoldAmount: 0.08, padFoldMode: 1,
    filterType: 'ladderLp', filterCutoff: 2600,
    filterResonance: 0.27, filterQ: 1.5, filterSlope: 24, filterKeyTracking: 0.48,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 120,
    padFilterBResonance: 0.05, padFilterBQ: 0.8, padFilterRouting: 'series',
    synthAttack: 0.008, synthDecay: 0.2, synthSustain: 0.76, synthRelease: 0.5,
    padLfo1Rate: 0.34, padLfo1Depth: 0.24, padLfo1Wave: 'triangle', padLfo1Dest: 'oscAPhaseDistortion',
    padLfo2Rate: 5.4, padLfo2Depth: 0.014, padLfo2Wave: 'sine', padLfo2Dest: 'pitch',
    padModEnvEnabled: true, padModEnvAttack: 0.006, padModEnvDecay: 0.16,
    padModEnvSustain: 0, padModEnvRelease: 0.25, padModEnvDepth: 0.48, padModEnvDest: 'filterCutoff',
  },
};

// ─── Fold Showcase Presets ───

/** Buchla Pluck — rounded LPG-style triangle fold pluck with slow modular drift */
const BUCHLA_PLUCK: PadPreset = {
  name: 'Buchla Pluck',
  tags: ['pluck', 'fold', 'buchla', 'complex', 'floating'],
  params: {
    padOscAWave: 'complexTriangle', padOscAWavePosition: 0.38, padOscAPhaseDistortion: -0.15, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.58,
    padOscBWave: 'complexSine', padOscBWavePosition: 0.52, padOscBPhaseDistortion: 0.1, padOscBPitch: 12, padOscBLinearHzOffset: 0.5, padOscBLevel: 0.24,
    padOscMix: 0.41, padDrift: 0.18, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'pink', padNoiseLevel: 0.01,
    hardness: 0.12, warmth: 0.66, presence: 0.36, padFoldAmount: 0.32, padFoldMode: 0,
    filterType: 'lowpass', filterCutoff: 1450,
    filterResonance: 0.08, filterQ: 0.85, filterSlope: 12, filterKeyTracking: 0.35,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.55, synthSustain: 0, synthHold: 0, synthRelease: 0.18,
    padLfo1Rate: 0.06, padLfo1Depth: 0.1, padLfo1Wave: 'randomWalk', padLfo1Dest: 'oscBPosition',
    padLfo2Rate: 0.04, padLfo2Depth: 0.06, padLfo2Wave: 'randomWalk', padLfo2Dest: 'foldAmount',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.22,
    padModEnvSustain: 0, padModEnvRelease: 0.1, padModEnvDepth: 0.6, padModEnvDest: 'oscAPosition',
  },
};

/** Electric-piano-like sine fold with a harmonic octave transient. */
const SINE_FOLD_KEY: PadPreset = {
  name: 'Sine Fold EP',
  tags: ['keys', 'fold', 'warm', 'electric piano', 'ear candy'],
  params: {
    padOscAWave: 'sine', padOscAWavePosition: 0, padOscAPhaseDistortion: 0.06, padOscAPitch: 0, padOscALinearHzOffset: 0, padOscALevel: 0.66,
    padOscBWave: 'harmonic', padOscBWavePosition: 0.22, padOscBPhaseDistortion: -0.08, padOscBPitch: 12.02, padOscBLinearHzOffset: 0.25, padOscBLevel: 0.24,
    padOscMix: 0.37, padDrift: 0.1, padPhaseReset: 1,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.18,
    padNoiseType: 'white', padNoiseLevel: 0.01,
    hardness: 0.06, warmth: 0.62, presence: 0.38, padFoldAmount: 0.35, padFoldMode: 1,
    filterType: 'lowpass', filterCutoff: 2500,
    filterResonance: 0.1, filterQ: 0.8, filterSlope: 12, filterKeyTracking: 0.48,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 110,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.006, synthDecay: 0.6, synthSustain: 0.24, synthRelease: 1.4,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.004, padModEnvDecay: 0.38,
    padModEnvSustain: 0, padModEnvRelease: 0.65, padModEnvDepth: 0.5, padModEnvDest: 'foldAmount',
  },
};

/** Serge Stab — aggressive short stab with 3-stage tanh cascade */
const SERGE_STAB: PadPreset = {
  name: 'Serge Stab',
  tags: ['stab', 'fold', 'serge', 'complex', 'aggressive'],
  params: {
    padOscAWave: 'complexTriangle', padOscAWavePosition: 0.55, padOscAPhaseDistortion: 0.25, padOscAPitch: 0, padOscALinearHzOffset: -0.2, padOscALevel: 0.55,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: -0.2, padOscBPitch: 7.03, padOscBLinearHzOffset: 0.4, padOscBLevel: 0.35,
    padOscMix: 0.44, padDrift: 0.1, padPhaseReset: 1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.1,
    padNoiseType: 'white', padNoiseLevel: 0.04,
    hardness: 0.32, warmth: 0.2, presence: 0.64, padFoldAmount: 0.55, padFoldMode: 2,
    filterType: 'bandpass', filterCutoff: 2400,
    filterResonance: 0.36, filterQ: 2.2, filterSlope: 12, filterKeyTracking: 0.45,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.04, padFilterBQ: 0.8, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.17, synthSustain: 0, synthRelease: 0.34,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.002, padModEnvDecay: 0.13,
    padModEnvSustain: 0, padModEnvRelease: 0.22, padModEnvDepth: 0.62, padModEnvDest: 'oscBPhaseDistortion',
  },
};

/** Oberheim-style brass pad with a rising ladder-filter envelope. */
const FOLDED_DRIFT: PadPreset = {
  name: 'OB Brass Pad',
  tags: ['pad', 'brass', 'analog', 'oberheim', 'warm'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: -0.18, padOscALevel: 0.55,
    padOscBWave: 'square', padOscBWavePosition: 0, padOscBPhaseDistortion: 0.16, padOscBPitch: 0.04, padOscBLinearHzOffset: 0.2, padOscBLevel: 0.42,
    padOscMix: 0.47, padDrift: 0.38, padPhaseReset: 2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.16,
    padNoiseType: 'pink', padNoiseLevel: 0.04,
    hardness: 0.18, warmth: 0.68, presence: 0.38, padFoldAmount: 0.05, padFoldMode: 0,
    filterType: 'ladderLp', filterCutoff: 1100,
    filterResonance: 0.28, filterQ: 1, filterSlope: 24, filterKeyTracking: 0.36,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 90,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.12, synthDecay: 0.8, synthSustain: 0.72, synthRelease: 3.5,
    padLfo1Rate: 0.16, padLfo1Depth: 0.17, padLfo1Wave: 'triangle', padLfo1Dest: 'oscBPhaseDistortion',
    padLfo2Rate: 0.09, padLfo2Depth: 0.05, padLfo2Wave: 'randomSmooth', padLfo2Dest: 'filterResonance',
    padModEnvEnabled: true, padModEnvAttack: 0.04, padModEnvDecay: 1.1,
    padModEnvSustain: 0.35, padModEnvRelease: 2.5, padModEnvDepth: 0.55, padModEnvDest: 'filterCutoff',
  },
};

/** Harmonic Bloom — sine-folded pad that slowly opens, great in A slot with Buchla Pluck in B */
const HARMONIC_BLOOM: PadPreset = {
  name: 'Harmonic Bloom',
  tags: ['pad', 'harmonic', 'complex', 'evolving', 'bright'],
  params: {
    padOscAWave: 'harmonic', padOscAWavePosition: 0.32, padOscAPhaseDistortion: 0.1, padOscAPitch: 0, padOscALinearHzOffset: -0.2, padOscALevel: 0.58,
    padOscBWave: 'complexSine', padOscBWavePosition: 0.58, padOscBPhaseDistortion: -0.12, padOscBPitch: 12.05, padOscBLinearHzOffset: 0.45, padOscBLevel: 0.32,
    padOscMix: 0.43, padDrift: 0.45, padPhaseReset: 0,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.12,
    padNoiseType: 'white', padNoiseLevel: 0.035,
    hardness: 0.08, warmth: 0.42, presence: 0.54, padFoldAmount: 0.2, padFoldMode: 1,
    filterType: 'lowpass', filterCutoff: 2650,
    filterResonance: 0.15, filterQ: 1.2, filterSlope: 12, filterKeyTracking: 0.42,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.06, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 4.8, synthDecay: 3, synthSustain: 0.74, synthRelease: 12,
    padLfo1Rate: 0.08, padLfo1Depth: 0.3, padLfo1Wave: 'sine', padLfo1Dest: 'oscAPosition',
    padLfo2Rate: 0.053, padLfo2Depth: 0.26, padLfo2Wave: 'randomSmooth', padLfo2Dest: 'oscBPosition',
    padModEnvEnabled: true, padModEnvAttack: 2.5, padModEnvDecay: 6,
    padModEnvSustain: 0.35, padModEnvRelease: 8, padModEnvDepth: 0.2, padModEnvDest: 'oscAPhaseDistortion',
  },
};

/** Ensemble-string swarm with free-running oscillators and slow movement. */
const SERGE_SWARM: PadPreset = {
  name: 'Solina Swarm',
  tags: ['strings', 'pad', 'analog', 'solina', 'ensemble'],
  params: {
    padOscAWave: 'sawtooth', padOscAWavePosition: 0, padOscAPhaseDistortion: 0, padOscAPitch: 0, padOscALinearHzOffset: -0.3, padOscALevel: 0.52,
    padOscBWave: 'sawtooth', padOscBWavePosition: 0, padOscBPhaseDistortion: 0, padOscBPitch: 12.06, padOscBLinearHzOffset: 0.45, padOscBLevel: 0.4,
    padOscMix: 0.45, padDrift: 0.48, padPhaseReset: 0,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.12,
    padNoiseType: 'pink', padNoiseLevel: 0.045,
    hardness: 0.12, warmth: 0.72, presence: 0.25, padFoldAmount: 0.03, padFoldMode: 2,
    filterType: 'lowpass', filterCutoff: 2400,
    filterResonance: 0.14, filterQ: 0.8, filterSlope: 12, filterKeyTracking: 0.3,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 150,
    padFilterBResonance: 0.04, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 1, synthDecay: 1.4, synthSustain: 0.86, synthRelease: 6,
    padLfo1Rate: 0.26, padLfo1Depth: 0.07, padLfo1Wave: 'triangle', padLfo1Dest: 'amplitude',
    padLfo2Rate: 5.7, padLfo2Depth: 0.008, padLfo2Wave: 'sine', padLfo2Dest: 'pitch',
    padModEnvEnabled: false,
  },
};

// ─── Registry ───

export const PAD_PRESETS: Record<string, PadPreset> = {
  init: INIT,
  saturated_drift: SATURATED_DRIFT,
  saturated_drift_ii: SATURATED_DRIFT_II,
  deep_sub_drone: DEEP_SUB_DRONE,
  glass_shimmer: GLASS_SHIMMER,
  warm_analog: WARM_ANALOG,
  digital_ice: DIGITAL_ICE,
  breath: BREATH,
  cathedral_organ: CATHEDRAL_ORGAN,
  pluck_bell: PLUCK_BELL,
  soft_pluck: SOFT_PLUCK,
  harsh_pluck: HARSH_PLUCK,
  metal_tine: METAL_TINE,
  poly_lead: POLY_LEAD,
  acid_stab: ACID_STAB,
  muted_key: MUTED_KEY,
  glass_marimba: GLASS_MARIMBA,
  sub_pluck: SUB_PLUCK,
  classic_moog_bass: CLASSIC_MOOG_BASS,
  sync_lead: SYNC_LEAD,
  buchla_pluck: BUCHLA_PLUCK,
  sine_fold_key: SINE_FOLD_KEY,
  serge_stab: SERGE_STAB,
  folded_drift: FOLDED_DRIFT,
  harmonic_bloom: HARMONIC_BLOOM,
  serge_swarm: SERGE_SWARM,
};

const USER_PAD_PRESETS = new Map<string, RuntimePadPresetEntry>();

function normalizePadPresetName(name: string): string {
  return name.trim().toLowerCase();
}

function makeRuntimePadPresetKey(scope: 'pad1' | 'pad2', id: string): string {
  return `${scope}:${id}`;
}

function getPadPresetOptionPriority(option: Pick<PadPresetOption, 'library'>): number {
  switch (option.library) {
    case 'cloud':
      return 3;
    case 'user':
      return 2;
    case 'stock':
    default:
      return 1;
  }
}

export function getFactoryPadPresetIds(): string[] {
  return Object.keys(PAD_PRESETS);
}

export function getFactoryPadPresetIdByName(name: string): string | null {
  const normalizedName = normalizePadPresetName(name);
  for (const id of getFactoryPadPresetIds()) {
    if (normalizePadPresetName(PAD_PRESETS[id]?.name ?? id) === normalizedName) {
      return id;
    }
  }
  return null;
}

export function getPadPresetDisplayName(id: string, scope?: 'pad1' | 'pad2'): string {
  if (scope) {
    return USER_PAD_PRESETS.get(makeRuntimePadPresetKey(scope, id))?.name ?? PAD_PRESETS[id]?.name ?? id;
  }
  return [...USER_PAD_PRESETS.values()].find((entry) => entry.id === id)?.name ?? PAD_PRESETS[id]?.name ?? id;
}

export function getPadPresetOptions(scope?: 'pad1' | 'pad2'): PadPresetOption[] {
  const optionsById = new Map<string, PadPresetOption>();
  const optionIdByName = new Map<string, string>();

  const mergeOption = (option: PadPresetOption) => {
    const normalizedName = normalizePadPresetName(option.name);
    const existingById = optionsById.get(option.id);
    if (existingById && getPadPresetOptionPriority(existingById) >= getPadPresetOptionPriority(option)) {
      optionIdByName.set(normalizedName, existingById.id);
      return;
    }

    const existingIdByName = optionIdByName.get(normalizedName);
    if (existingIdByName) {
      const existingByName = optionsById.get(existingIdByName);
      if (existingByName && getPadPresetOptionPriority(existingByName) > getPadPresetOptionPriority(option)) {
        return;
      }
      optionsById.delete(existingIdByName);
    }

    optionsById.set(option.id, option);
    optionIdByName.set(normalizedName, option.id);
  };

  for (const id of getFactoryPadPresetIds()) {
    mergeOption({
      id,
      name: PAD_PRESETS[id]?.name ?? id,
      library: 'stock',
      tags: PAD_PRESETS[id]?.tags,
    });
  }

  for (const entry of USER_PAD_PRESETS.values()) {
    if (!scope || entry.scope === scope) {
      mergeOption({
        id: entry.id,
        name: entry.name,
        library: entry.library,
        scope: entry.scope,
        tags: entry.preset.tags,
        updatedAt: entry.updatedAt,
        rating: entry.rating,
      });
    }
  }

  return [...optionsById.values()];
}

export function setUserPadPresets(
  scope: 'pad1' | 'pad2',
  presets: Array<{ id: string; name: string; library: Exclude<PresetLibrary, 'stock'>; preset: PadPreset; updatedAt?: number; rating?: number }>,
): void {
  for (const [runtimeKey, entry] of USER_PAD_PRESETS.entries()) {
    if (entry.scope === scope) {
      USER_PAD_PRESETS.delete(runtimeKey);
    }
  }
  for (const preset of presets) {
    USER_PAD_PRESETS.set(makeRuntimePadPresetKey(scope, preset.id), {
      ...preset,
      scope,
    });
  }
}

export function upsertUserPadPreset(
  scope: 'pad1' | 'pad2',
  preset: { id: string; name: string; library: Exclude<PresetLibrary, 'stock'>; preset: PadPreset; updatedAt?: number; rating?: number },
): void {
  USER_PAD_PRESETS.set(makeRuntimePadPresetKey(scope, preset.id), {
    ...preset,
    scope,
  });
}

export function getPadPresetNames(scope?: 'pad1' | 'pad2'): string[] {
  return getPadPresetOptions(scope).map(option => option.id);
}

function normalizePadPreset(preset: PadPreset | undefined): PadPreset | undefined {
  if (!preset) return undefined;
  return {
    ...preset,
    params: {
      ...PAD_PRESET_DEFAULT_PARAMS,
      ...preset.params,
    },
  };
}

export function getPadPreset(id: string, scope?: 'pad1' | 'pad2'): PadPreset | undefined {
  const scopedPreset = scope
    ? USER_PAD_PRESETS.get(makeRuntimePadPresetKey(scope, id))?.preset
    : [...USER_PAD_PRESETS.values()].find((entry) => entry.id === id)?.preset;
  return normalizePadPreset(scopedPreset ?? PAD_PRESETS[id]);
}

// ─── Morphing ───

/**
 * Morph between two pad presets.
 * Numeric values are linearly interpolated.
 * Strings/booleans snap at morph = 0.5.
 */
export function morphPadPresets(
  presetA: PadPreset,
  presetB: PadPreset,
  morph: number,
): Record<string, number | string | boolean> {
  const normalizedA = normalizePadPreset(presetA);
  const normalizedB = normalizePadPreset(presetB);
  if (!normalizedA || !normalizedB) return {};
  const morphPosition = clampMorphPosition(morph);

  const result: Record<string, number | string | boolean> = {};
  const allKeys = new Set([
    ...Object.keys(normalizedA.params),
    ...Object.keys(normalizedB.params),
  ]);

  for (const key of allKeys) {
    const a = normalizedA.params[key];
    const b = normalizedB.params[key];

    if (a === undefined) {
      result[key] = b ?? 0;
    } else if (b === undefined) {
      result[key] = a;
    } else if (typeof a === 'number' && typeof b === 'number') {
      result[key] = a + (b - a) * morphPosition;
    } else {
      // Discrete params: snap at 0.5
      result[key] = morphPosition < 0.5 ? a : b;
    }
  }

  return result;
}

export function resolvePadPresetDualState(
  scope: 'pad1' | 'pad2',
  presetAId: string,
  presetBId: string,
  morph: number,
): {
  relevantKeys: string[];
  dualRanges: Record<string, { min: number; max: number }>;
  sliderModes: Record<string, SliderMode>;
} {
  const presetA = getPadPreset(presetAId, scope);
  const presetB = getPadPreset(presetBId, scope);
  const relevantKeys = PAD_PRESET_PARAM_KEYS
    .map((key) => scope === 'pad2' ? PAD1_TO_PAD2_KEY[key] : key)
    .filter((key): key is string => Boolean(key));
  const dualRanges: Record<string, { min: number; max: number }> = {};
  const sliderModes: Record<string, SliderMode> = {};
  if (!presetA || !presetB) return { relevantKeys, dualRanges, sliderModes };

  const position = clampMorphPosition(morph);
  const allDualKeys = new Set([
    ...Object.keys(presetA.dualRanges ?? {}),
    ...Object.keys(presetB.dualRanges ?? {}),
  ]);

  for (const key of allDualKeys) {
    const targetKey = scope === 'pad2' ? PAD1_TO_PAD2_KEY[key] : key;
    if (!targetKey) continue;
    const rangeA = presetA.dualRanges?.[key];
    const rangeB = presetB.dualRanges?.[key];
    const valueA = presetA.params[key];
    const valueB = presetB.params[key];
    if ((!rangeA && typeof valueA !== 'number') || (!rangeB && typeof valueB !== 'number')) continue;

    const minA = rangeA?.min ?? valueA as number;
    const maxA = rangeA?.max ?? valueA as number;
    const minB = rangeB?.min ?? valueB as number;
    const maxB = rangeB?.max ?? valueB as number;
    const min = minA + (minB - minA) * position;
    const max = maxA + (maxB - maxA) * position;
    if (Math.abs(max - min) <= 0.001) continue;

    const modeA = presetA.sliderModes?.[key] ?? (rangeA ? 'walk' : undefined);
    const modeB = presetB.sliderModes?.[key] ?? (rangeB ? 'walk' : undefined);
    dualRanges[targetKey] = { min, max };
    sliderModes[targetKey] = position < 0.5
      ? modeA ?? modeB ?? 'walk'
      : modeB ?? modeA ?? 'walk';
  }

  return { relevantKeys, dualRanges, sliderModes };
}

export function applyPadPresetMorphParamsToState<T extends Record<string, unknown>>(
  state: T,
  rawOverrides: Record<string, unknown> = state,
): T {
  const next = { ...state } as Record<string, unknown>;
  const hasRawOverride = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(rawOverrides, key);

  const applyScope = (scope: 'pad1' | 'pad2'): void => {
    const presetAKey = scope === 'pad2' ? 'pad2PresetA' : 'padPresetA';
    const presetBKey = scope === 'pad2' ? 'pad2PresetB' : 'padPresetB';
    const morphKey = scope === 'pad2' ? 'pad2Morph' : 'padMorph';
    const presetAId = String(next[presetAKey] ?? 'init');
    const presetBId = String(next[presetBKey] ?? next[presetAKey] ?? 'init');
    const presetA = getPadPreset(presetAId, scope);
    const presetB = getPadPreset(presetBId, scope);
    if (!presetA || !presetB) return;

    const morph = typeof next[morphKey] === 'number' && Number.isFinite(next[morphKey])
      ? next[morphKey]
      : 0;
    const morphed = morphPadPresets(presetA, presetB, morph);
    for (const key of PAD_PRESET_PARAM_KEYS) {
      if (!(key in morphed)) continue;
      const targetKey = scope === 'pad2' ? PAD1_TO_PAD2_KEY[key] : key;
      if (!targetKey || hasRawOverride(targetKey)) continue;
      next[targetKey] = morphed[key];
    }
  };

  applyScope('pad1');
  applyScope('pad2');
  return next as T;
}
