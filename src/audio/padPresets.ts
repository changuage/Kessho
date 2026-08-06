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
  'padOscAWave', 'padOscAOctave', 'padOscADetune', 'padOscALevel',
  'padOscBWave', 'padOscBOctave', 'padOscBDetune', 'padOscBLevel',
  'padOscMix',
  'padSubEnabled', 'padSubOctave', 'padSubWave', 'padSubLevel',
  'padNoiseType', 'padNoiseLevel',
  // Character
  'hardness', 'warmth', 'presence', 'padFoldAmount', 'padFoldMode', 'detune',
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
  padOscAWave: 'pad2OscAWave', padOscAOctave: 'pad2OscAOctave', padOscADetune: 'pad2OscADetune', padOscALevel: 'pad2OscALevel',
  padOscBWave: 'pad2OscBWave', padOscBOctave: 'pad2OscBOctave', padOscBDetune: 'pad2OscBDetune', padOscBLevel: 'pad2OscBLevel',
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
  padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.6,
  padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 8, padOscBLevel: 0.4,
  padOscMix: 0.5,
  padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
  padNoiseType: 'white', padNoiseLevel: 0.15,
  hardness: 0.3, warmth: 0.4, presence: 0.3, padFoldAmount: 0, padFoldMode: 0, detune: 8,
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
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.6,
    padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 8, padOscBLevel: 0.4,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
    padNoiseType: 'white', padNoiseLevel: 0.36,
    hardness: 0.56, warmth: 0.4, presence: 0.47, detune: 8,
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
  name: 'Deep Sub Drone',
  tags: ['deep', 'dark', 'sub', 'drone'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.4,
    padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 3, padOscBLevel: 0.3,
    padSubEnabled: true, padSubOctave: -2, padSubWave: 'sine', padSubLevel: 0.7,
    padNoiseType: 'pink', padNoiseLevel: 0.05,
    hardness: 0.1, warmth: 0.8, presence: 0.1, detune: 3,
    filterType: 'lowpass', filterCutoff: 440,
    filterResonance: 0.15, filterQ: 0.8,
    padFilterBEnabled: false, padFilterBType: 'lowpass', padFilterBCutoff: 400,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 8, synthDecay: 2, synthSustain: 0.9, synthRelease: 16,
    padLfo1Rate: 0.15, padLfo1Depth: 0.2, padLfo1Wave: 'sine', padLfo1Dest: 'amplitude',
    padModEnvEnabled: false, padModEnvAttack: 2, padModEnvDecay: 4,
    padModEnvSustain: 0.3, padModEnvRelease: 8, padModEnvDepth: 0.3, padModEnvDest: 'filterCutoff',
  },
};

const GLASS_SHIMMER: PadPreset = {
  name: 'Glass Shimmer',
  tags: ['bright', 'crystal', 'shimmery'],
  params: {
    padOscAWave: 'triangle', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'sine', padOscBOctave: 1, padOscBDetune: 15, padOscBLevel: 0.5,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.1,
    padNoiseType: 'white', padNoiseLevel: 0.08,
    hardness: 0.05, warmth: 0, presence: 0.7, detune: 15,
    filterType: 'highpass', filterCutoff: 2400,
    filterResonance: 0.25, filterQ: 1.5,
    padFilterBEnabled: true, padFilterBType: 'lowpass', padFilterBCutoff: 6000,
    padFilterBResonance: 0.1, padFilterBQ: 0.8, padFilterRouting: 'series',
    synthAttack: 3, synthDecay: 0.5, synthSustain: 0.7, synthRelease: 8,
    padLfo1Rate: 2, padLfo1Depth: 0.1, padLfo1Wave: 'triangle', padLfo1Dest: 'pitch',
    padModEnvEnabled: true, padModEnvAttack: 0.1, padModEnvDecay: 1.5,
    padModEnvSustain: 0, padModEnvRelease: 3, padModEnvDepth: 0.6, padModEnvDest: 'filterCutoff',
  },
};

const WARM_ANALOG: PadPreset = {
  name: 'Warm Analog',
  tags: ['warm', 'analog', 'classic'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'square', padOscBOctave: 0, padOscBDetune: 5, padOscBLevel: 0.3,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.4,
    padNoiseType: 'pink', padNoiseLevel: 0.1,
    hardness: 0.15, warmth: 0.7, presence: 0.2, detune: 5,
    filterType: 'lowpass', filterCutoff: 1100,
    filterResonance: 0.3, filterQ: 1.2,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 80,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 4, synthDecay: 1.5, synthSustain: 0.75, synthRelease: 10,
    padLfo1Rate: 0.4, padLfo1Depth: 0.08, padLfo1Wave: 'triangle', padLfo1Dest: 'filterCutoff',
    padModEnvEnabled: true, padModEnvAttack: 0.3, padModEnvDecay: 2,
    padModEnvSustain: 0.1, padModEnvRelease: 5, padModEnvDepth: 0.4, padModEnvDest: 'filterCutoff',
  },
};

const DIGITAL_ICE: PadPreset = {
  name: 'Digital Ice',
  tags: ['cold', 'metallic', 'digital'],
  params: {
    padOscAWave: 'square', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'sawtooth', padOscBOctave: 0, padOscBDetune: 20, padOscBLevel: 0.4,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'white', padNoiseLevel: 0.12,
    hardness: 0.7, warmth: 0, presence: 0.6, detune: 20,
    filterType: 'bandpass', filterCutoff: 2800,
    filterResonance: 0.5, filterQ: 3,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 300,
    padFilterBResonance: 0.3, padFilterBQ: 2, padFilterRouting: 'series',
    synthAttack: 2, synthDecay: 0.3, synthSustain: 0.5, synthRelease: 6,
    padLfo1Rate: 3, padLfo1Depth: 0.15, padLfo1Wave: 'square', padLfo1Dest: 'pitch',
    padModEnvEnabled: true, padModEnvAttack: 0.05, padModEnvDecay: 0.8,
    padModEnvSustain: 0, padModEnvRelease: 2, padModEnvDepth: 0.7, padModEnvDest: 'filterCutoff',
  },
};

const BREATH: PadPreset = {
  name: 'Breath',
  tags: ['noise', 'ethereal', 'textural'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.15,
    padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 6, padOscBLevel: 0.1,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.1,
    padNoiseType: 'pink', padNoiseLevel: 0.6,
    hardness: 0, warmth: 0.5, presence: 0.4, detune: 6,
    filterType: 'bandpass', filterCutoff: 1650,
    filterResonance: 0.15, filterQ: 0.8,
    padFilterBEnabled: false, padFilterBType: 'lowpass', padFilterBCutoff: 5000,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 5, synthDecay: 2, synthSustain: 0.6, synthRelease: 14,
    padLfo1Rate: 0.2, padLfo1Depth: 0.25, padLfo1Wave: 'sine', padLfo1Dest: 'filterCutoff',
    padModEnvEnabled: false, padModEnvAttack: 1, padModEnvDecay: 3,
    padModEnvSustain: 0.2, padModEnvRelease: 6, padModEnvDepth: 0.3, padModEnvDest: 'filterCutoff',
  },
};

const CATHEDRAL_ORGAN: PadPreset = {
  name: 'Cathedral Organ',
  tags: ['big', 'organ', 'sustained'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'triangle', padOscBOctave: 1, padOscBDetune: 2, padOscBLevel: 0.3,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.5,
    padNoiseType: 'pink', padNoiseLevel: 0.03,
    hardness: 0.2, warmth: 0.6, presence: 0.35, detune: 2,
    filterType: 'lowpass', filterCutoff: 1400,
    filterResonance: 0.1, filterQ: 0.6,
    padFilterBEnabled: false, padFilterBType: 'lowpass', padFilterBCutoff: 3000,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 8, synthDecay: 3, synthSustain: 0.9, synthRelease: 20,
    padLfo1Rate: 0.1, padLfo1Depth: 0.05, padLfo1Wave: 'sine', padLfo1Dest: 'amplitude',
    padModEnvEnabled: false, padModEnvAttack: 2, padModEnvDecay: 5,
    padModEnvSustain: 0.4, padModEnvRelease: 10, padModEnvDepth: 0.2, padModEnvDest: 'filterCutoff',
  },
};

// ─── Short Attack / Short Decay Presets (Plucks & Leads) ───

/** Bright percussive bell pluck — triangle + sine octave up, fast mod env on filter */
const PLUCK_BELL: PadPreset = {
  name: 'Pluck Bell',
  tags: ['pluck', 'bell', 'percussive', 'bright'],
  params: {
    padOscAWave: 'triangle', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.55,
    padOscBWave: 'sine', padOscBOctave: 1, padOscBDetune: 3, padOscBLevel: 0.35,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.15,
    padNoiseType: 'white', padNoiseLevel: 0.04,
    hardness: 0.1, warmth: 0.2, presence: 0.6, detune: 3,
    filterType: 'lowpass', filterCutoff: 3600,
    filterResonance: 0.15, filterQ: 1.0,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 200,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.6, synthSustain: 0.0, synthRelease: 1.5,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.4,
    padModEnvSustain: 0, padModEnvRelease: 0.8, padModEnvDepth: 0.8, padModEnvDest: 'filterCutoff',
  },
};

/** Gentle rounded pluck — soft saw + triangle, warm filter, medium decay */
const SOFT_PLUCK: PadPreset = {
  name: 'Soft Pluck',
  tags: ['pluck', 'soft', 'warm', 'mellow'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.4,
    padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 6, padOscBLevel: 0.35,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.25,
    padNoiseType: 'pink', padNoiseLevel: 0.03,
    hardness: 0.05, warmth: 0.6, presence: 0.25, detune: 6,
    filterType: 'lowpass', filterCutoff: 1400,
    filterResonance: 0.1, filterQ: 0.8,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 80,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.8, synthSustain: 0.05, synthRelease: 2.0,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.6,
    padModEnvSustain: 0, padModEnvRelease: 1.2, padModEnvDepth: 0.5, padModEnvDest: 'filterCutoff',
  },
};

/** Aggressive attack pluck — distorted saws with snap transient */
const HARSH_PLUCK: PadPreset = {
  name: 'Harsh Pluck',
  tags: ['pluck', 'aggressive', 'distorted', 'snappy'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.6,
    padOscBWave: 'sawtooth', padOscBOctave: 0, padOscBDetune: 15, padOscBLevel: 0.45,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'white', padNoiseLevel: 0.15,
    hardness: 0.65, warmth: 0.1, presence: 0.55, detune: 15,
    filterType: 'lowpass', filterCutoff: 3900,
    filterResonance: 0.35, filterQ: 2.0,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.3, synthSustain: 0.0, synthRelease: 0.8,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.2,
    padModEnvSustain: 0, padModEnvRelease: 0.5, padModEnvDepth: 1.0, padModEnvDest: 'filterCutoff',
  },
};

/** Electric piano / tine sound — sine + detuned triangle, medium decay, bright presence */
const METAL_TINE: PadPreset = {
  name: 'Metal Tine',
  tags: ['pluck', 'keys', 'electric piano', 'tine'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'triangle', padOscBOctave: 1, padOscBDetune: 2, padOscBLevel: 0.25,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.15,
    padNoiseType: 'white', padNoiseLevel: 0.02,
    hardness: 0.2, warmth: 0.35, presence: 0.55, detune: 2,
    filterType: 'lowpass', filterCutoff: 3500,
    filterResonance: 0.1, filterQ: 0.7,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 150,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 1.2, synthSustain: 0.1, synthRelease: 2.5,
    padLfo1Rate: 4, padLfo1Depth: 0.03, padLfo1Wave: 'sine', padLfo1Dest: 'amplitude',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.8,
    padModEnvSustain: 0, padModEnvRelease: 1.5, padModEnvDepth: 0.4, padModEnvDest: 'filterCutoff',
  },
};

/** Polyphonic lead — classic saw lead with sustain, vibrato, and presence */
const POLY_LEAD: PadPreset = {
  name: 'Poly Lead',
  tags: ['lead', 'poly', 'bright', 'sustained'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.55,
    padOscBWave: 'sawtooth', padOscBOctave: 0, padOscBDetune: 10, padOscBLevel: 0.4,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
    padNoiseType: 'pink', padNoiseLevel: 0.02,
    hardness: 0.25, warmth: 0.3, presence: 0.5, detune: 10,
    filterType: 'lowpass', filterCutoff: 3000,
    filterResonance: 0.2, filterQ: 1.2,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 80,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.02, synthDecay: 0.3, synthSustain: 0.7, synthRelease: 0.6,
    padLfo1Rate: 5, padLfo1Depth: 0.06, padLfo1Wave: 'sine', padLfo1Dest: 'pitch',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.15,
    padModEnvSustain: 0, padModEnvRelease: 0.3, padModEnvDepth: 0.3, padModEnvDest: 'filterCutoff',
  },
};

/** Acid stab — resonant squelch, square + saw, very fast decay */
const ACID_STAB: PadPreset = {
  name: 'Acid Stab',
  tags: ['lead', 'acid', 'resonant', 'stab'],
  params: {
    padOscAWave: 'square', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'sawtooth', padOscBOctave: 0, padOscBDetune: 0, padOscBLevel: 0.35,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'square', padSubLevel: 0.3,
    padNoiseType: 'white', padNoiseLevel: 0.0,
    hardness: 0.4, warmth: 0.15, presence: 0.4, detune: 0,
    filterType: 'lowpass', filterCutoff: 3100,
    filterResonance: 0.7, filterQ: 6,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 80,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.2, synthSustain: 0.0, synthRelease: 0.4,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.15,
    padModEnvSustain: 0, padModEnvRelease: 0.3, padModEnvDepth: 1.0, padModEnvDest: 'filterCutoff',
  },
};

/** Muted keyboard — dark, quick, low-passed pluck like a clavinet or muted piano */
const MUTED_KEY: PadPreset = {
  name: 'Muted Key',
  tags: ['pluck', 'keys', 'dark', 'muted'],
  params: {
    padOscAWave: 'triangle', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'square', padOscBOctave: 0, padOscBDetune: 4, padOscBLevel: 0.2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.35,
    padNoiseType: 'pink', padNoiseLevel: 0.06,
    hardness: 0.15, warmth: 0.7, presence: 0.15, detune: 4,
    filterType: 'lowpass', filterCutoff: 1100,
    filterResonance: 0.15, filterQ: 0.8,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 60,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.5, synthSustain: 0.05, synthRelease: 1.0,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.3,
    padModEnvSustain: 0, padModEnvRelease: 0.6, padModEnvDepth: 0.5, padModEnvDest: 'filterCutoff',
  },
};

/** Glass marimba — pure tones an octave apart, very fast attack, bright decay */
const GLASS_MARIMBA: PadPreset = {
  name: 'Glass Marimba',
  tags: ['pluck', 'percussive', 'marimba', 'crystal'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.6,
    padOscBWave: 'sine', padOscBOctave: 1, padOscBDetune: 0, padOscBLevel: 0.3,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.15,
    padNoiseType: 'white', padNoiseLevel: 0.02,
    hardness: 0.05, warmth: 0.15, presence: 0.65, detune: 0,
    filterType: 'lowpass', filterCutoff: 5000,
    filterResonance: 0.08, filterQ: 0.6,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 250,
    padFilterBResonance: 0.05, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.4, synthSustain: 0.0, synthRelease: 1.2,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.25,
    padModEnvSustain: 0, padModEnvRelease: 0.5, padModEnvDepth: 0.3, padModEnvDest: 'filterCutoff',
  },
};

/** Deep sub pluck — heavy sub with fast attack, punchy low-end */
const SUB_PLUCK: PadPreset = {
  name: 'Sub Pluck',
  tags: ['pluck', 'sub', 'deep', 'bass'],
  params: {
    padOscAWave: 'sine', padOscAOctave: -1, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 4, padOscBLevel: 0.25,
    padSubEnabled: true, padSubOctave: -2, padSubWave: 'sine', padSubLevel: 0.6,
    padNoiseType: 'pink', padNoiseLevel: 0.02,
    hardness: 0.2, warmth: 0.8, presence: 0.1, detune: 4,
    filterType: 'lowpass', filterCutoff: 1150,
    filterResonance: 0.2, filterQ: 1.0,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 40,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.5, synthSustain: 0.1, synthRelease: 1.0,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.3,
    padModEnvSustain: 0, padModEnvRelease: 0.5, padModEnvDepth: 0.6, padModEnvDest: 'filterCutoff',
  },
};

/** Fat Minimoog-style bass: low triangle fundamental with an upper saw driving the ladder. */
const CLASSIC_MOOG_BASS: PadPreset = {
  name: 'Classic Moog Bass',
  tags: ['bass', 'analog', 'classic', 'moog', 'ladder', 'fat', 'growl'],
  params: {
    padOscAWave: 'triangle', padOscAOctave: -1, padOscADetune: 0, padOscALevel: 0.72,
    padOscBWave: 'sawtooth', padOscBOctave: 0, padOscBDetune: 1, padOscBLevel: 0.48,
    padOscMix: 0.45,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.14,
    padNoiseType: 'white', padNoiseLevel: 0,
    hardness: 0.38, warmth: 0.8, presence: 0.18,
    padFoldAmount: 0, padFoldMode: 0, detune: 1,
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

/** Aggressive sync-style lead — detuned saws, high presence, sustained with fast attack */
const SYNC_LEAD: PadPreset = {
  name: 'Sync Lead',
  tags: ['lead', 'aggressive', 'bright', 'sync'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.55,
    padOscBWave: 'square', padOscBOctave: 1, padOscBDetune: 5, padOscBLevel: 0.3,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'square', padSubLevel: 0.25,
    padNoiseType: 'white', padNoiseLevel: 0.03,
    hardness: 0.5, warmth: 0.1, presence: 0.7, detune: 5,
    filterType: 'lowpass', filterCutoff: 4250,
    filterResonance: 0.25, filterQ: 1.5,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 120,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.15, synthSustain: 0.75, synthRelease: 0.4,
    padLfo1Rate: 5.5, padLfo1Depth: 0.05, padLfo1Wave: 'sine', padLfo1Dest: 'pitch',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.1,
    padModEnvSustain: 0, padModEnvRelease: 0.2, padModEnvDepth: 0.5, padModEnvDest: 'filterCutoff',
  },
};

// ─── Fold Showcase Presets ───

/** Buchla Pluck — rounded LPG-style triangle fold pluck with slow modular drift */
const BUCHLA_PLUCK: PadPreset = {
  name: 'Buchla Pluck',
  tags: ['pluck', 'fold', 'buchla', 'percussive', 'floating'],
  params: {
    padOscAWave: 'triangle', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.58,
    padOscBWave: 'sine', padOscBOctave: 1, padOscBDetune: 0, padOscBLevel: 0.22,
    padOscMix: 0.42,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'pink', padNoiseLevel: 0.01,
    hardness: 0.12, warmth: 0.66, presence: 0.32, padFoldAmount: 0.28, padFoldMode: 0, detune: 1,
    filterType: 'lowpass', filterCutoff: 1310,
    filterResonance: 0.08, filterQ: 0.85, filterSlope: 12, filterKeyTracking: 0.35,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.003, synthDecay: 0.55, synthSustain: 0, synthHold: 0, synthRelease: 0.18,
    padLfo1Rate: 0.06, padLfo1Depth: 0.1, padLfo1Wave: 'randomWalk', padLfo1Dest: 'filterCutoff',
    padLfo2Rate: 0.04, padLfo2Depth: 0.06, padLfo2Wave: 'randomWalk', padLfo2Dest: 'foldAmount',
    padModEnvEnabled: true, padModEnvAttack: 0.003, padModEnvDecay: 0.22,
    padModEnvSustain: 0, padModEnvRelease: 0.1, padModEnvDepth: 0.6, padModEnvDest: 'filterCutoff',
  },
};

/** Sine Fold Key — warm, slightly folded sine for electric piano-like tones */
const SINE_FOLD_KEY: PadPreset = {
  name: 'Sine Fold Key',
  tags: ['keys', 'fold', 'warm', 'electric piano'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.7,
    padOscBWave: 'sine', padOscBOctave: 1, padOscBDetune: 2, padOscBLevel: 0.2,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
    padNoiseType: 'white', padNoiseLevel: 0.01,
    hardness: 0.05, warmth: 0.6, presence: 0.3, padFoldAmount: 0.28, padFoldMode: 1, detune: 2,
    filterType: 'lowpass', filterCutoff: 2300,
    filterResonance: 0.1, filterQ: 0.8,
    padFilterBEnabled: false, padFilterBType: 'lowpass', padFilterBCutoff: 3000,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.4, synthSustain: 0.3, synthRelease: 1.0,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.3,
    padModEnvSustain: 0, padModEnvRelease: 0.5, padModEnvDepth: 0.3, padModEnvDest: 'filterCutoff',
  },
};

/** Serge Stab — aggressive short stab with 3-stage tanh cascade */
const SERGE_STAB: PadPreset = {
  name: 'Serge Stab',
  tags: ['stab', 'fold', 'serge', 'aggressive'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.55,
    padOscBWave: 'square', padOscBOctave: 0, padOscBDetune: 6, padOscBLevel: 0.35,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.1,
    padNoiseType: 'white', padNoiseLevel: 0.04,
    hardness: 0.3, warmth: 0.2, presence: 0.6, padFoldAmount: 0.6, padFoldMode: 2, detune: 6,
    filterType: 'lowpass', filterCutoff: 3500,
    filterResonance: 0.3, filterQ: 1.5,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 80,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.005, synthDecay: 0.15, synthSustain: 0.0, synthRelease: 0.3,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.005, padModEnvDecay: 0.12,
    padModEnvSustain: 0, padModEnvRelease: 0.2, padModEnvDepth: 0.6, padModEnvDest: 'filterCutoff',
  },
};

/** Folded Drift — slow-evolving Buchla-folded pad, ideal for A/B morph with a clean preset */
const FOLDED_DRIFT: PadPreset = {
  name: 'Folded Drift',
  tags: ['pad', 'fold', 'buchla', 'evolving', 'ambient'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'triangle', padOscBOctave: 0, padOscBDetune: 10, padOscBLevel: 0.4,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.3,
    padNoiseType: 'pink', padNoiseLevel: 0.08,
    hardness: 0.15, warmth: 0.55, presence: 0.35, padFoldAmount: 0.45, padFoldMode: 0, detune: 10,
    filterType: 'lowpass', filterCutoff: 1350,
    filterResonance: 0.2, filterQ: 1.0,
    padFilterBEnabled: false, padFilterBType: 'lowpass', padFilterBCutoff: 3000,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 8, synthDecay: 2, synthSustain: 0.75, synthRelease: 14,
    padLfo1Rate: 0.07, padLfo1Depth: 0.8, padLfo1Wave: 'randomWalk', padLfo1Dest: 'filterCutoff',
    padLfo2Rate: 0.05, padLfo2Depth: 0.9, padLfo2Wave: 'randomWalk', padLfo2Dest: 'foldAmount',
    padModEnvEnabled: false, padModEnvAttack: 1, padModEnvDecay: 3,
    padModEnvSustain: 0.2, padModEnvRelease: 6, padModEnvDepth: 0.4, padModEnvDest: 'filterCutoff',
  },
};

/** Harmonic Bloom — sine-folded pad that slowly opens, great in A slot with Buchla Pluck in B */
const HARMONIC_BLOOM: PadPreset = {
  name: 'Harmonic Bloom',
  tags: ['pad', 'fold', 'sine', 'evolving', 'bright'],
  params: {
    padOscAWave: 'sine', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.6,
    padOscBWave: 'triangle', padOscBOctave: 1, padOscBDetune: 7, padOscBLevel: 0.3,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.25,
    padNoiseType: 'white', padNoiseLevel: 0.05,
    hardness: 0.05, warmth: 0.4, presence: 0.5, padFoldAmount: 0.38, padFoldMode: 1, detune: 7,
    filterType: 'lowpass', filterCutoff: 2650,
    filterResonance: 0.15, filterQ: 1.2,
    padFilterBEnabled: true, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 6, synthDecay: 3, synthSustain: 0.7, synthRelease: 12,
    padLfo1Rate: 0.12, padLfo1Depth: 0.6, padLfo1Wave: 'sine', padLfo1Dest: 'filterCutoff',
    padLfo2Rate: 0.08, padLfo2Depth: 0.7, padLfo2Wave: 'randomWalk', padLfo2Dest: 'foldAmount',
    padModEnvEnabled: false, padModEnvAttack: 2, padModEnvDecay: 5,
    padModEnvSustain: 0.3, padModEnvRelease: 8, padModEnvDepth: 0.4, padModEnvDest: 'filterCutoff',
  },
};

/** Serge Swarm — thick evolving Serge-folded pad with slow random filter movement */
const SERGE_SWARM: PadPreset = {
  name: 'Serge Swarm',
  tags: ['pad', 'fold', 'serge', 'evolving', 'dark', 'thick'],
  params: {
    padOscAWave: 'sawtooth', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.5,
    padOscBWave: 'sawtooth', padOscBOctave: 0, padOscBDetune: 12, padOscBLevel: 0.45,
    padSubEnabled: true, padSubOctave: -1, padSubWave: 'triangle', padSubLevel: 0.35,
    padNoiseType: 'pink', padNoiseLevel: 0.1,
    hardness: 0.2, warmth: 0.7, presence: 0.2, padFoldAmount: 0.55, padFoldMode: 2, detune: 12,
    filterType: 'lowpass', filterCutoff: 975,
    filterResonance: 0.25, filterQ: 1.0,
    padFilterBEnabled: false, padFilterBType: 'lowpass', padFilterBCutoff: 2000,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 10, synthDecay: 3, synthSustain: 0.8, synthRelease: 16,
    padLfo1Rate: 0.05, padLfo1Depth: 1.0, padLfo1Wave: 'randomWalk', padLfo1Dest: 'foldAmount',
    padLfo2Rate: 0.04, padLfo2Depth: 0.8, padLfo2Wave: 'randomWalk', padLfo2Dest: 'filterCutoff',
    padModEnvEnabled: false, padModEnvAttack: 3, padModEnvDecay: 6,
    padModEnvSustain: 0.4, padModEnvRelease: 10, padModEnvDepth: 0.3, padModEnvDest: 'filterCutoff',
  },
};

// ─── Registry ───

export const PAD_PRESETS: Record<string, PadPreset> = {
  init: INIT,
  saturated_drift: SATURATED_DRIFT,
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
