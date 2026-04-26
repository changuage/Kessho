/**
 * Pad Synth Preset System
 *
 * Each preset captures timbre/synthesis parameters for the pad synth.
 * Performance params (chord rate, voicing spread, wave spread, voice mask, octave,
 * synth level, reverb send) are NOT part of presets — they're controlled independently.
 *
 * Presets can be morphed between A/B using linear interpolation for numeric params
 * and threshold snapping for discrete params.
 */

import type { PresetLibrary } from '../presets/types';

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
  'filterType', 'filterCutoffMin', 'filterCutoffMax', 'filterResonance', 'filterQ', 'filterSlope', 'filterKeyTracking',
  // Filter B
  'padFilterBEnabled', 'padFilterBType', 'padFilterBCutoff', 'padFilterBResonance', 'padFilterBQ', 'padFilterRouting',
  // ADSR
  'synthAttack', 'synthDecay', 'synthSustain', 'synthRelease',
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
  filterType: 'pad2FilterType', filterCutoffMin: 'pad2FilterCutoffMin', filterCutoffMax: 'pad2FilterCutoffMax',
  filterResonance: 'pad2FilterResonance', filterQ: 'pad2FilterQ', filterSlope: 'pad2FilterSlope', filterKeyTracking: 'pad2FilterKeyTracking',
  padFilterBEnabled: 'pad2FilterBEnabled', padFilterBType: 'pad2FilterBType', padFilterBCutoff: 'pad2FilterBCutoff',
  padFilterBResonance: 'pad2FilterBResonance', padFilterBQ: 'pad2FilterBQ', padFilterRouting: 'pad2FilterRouting',
  synthAttack: 'pad2Attack', synthDecay: 'pad2Decay', synthSustain: 'pad2Sustain', synthRelease: 'pad2Release',
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

export interface PadPreset {
  name: string;
  tags: string[];
  params: Record<string, number | string | boolean>;
}

export interface PadPresetOption {
  id: string;
  name: string;
  library: PresetLibrary;
  scope?: 'pad1' | 'pad2';
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
  filterType: 'lowpass', filterCutoffMin: 400, filterCutoffMax: 3000,
  filterResonance: 0.2, filterQ: 1.0, filterSlope: 12, filterKeyTracking: 0,
  padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 200,
  padFilterBResonance: 0.2, padFilterBQ: 1, padFilterRouting: 'series',
  synthAttack: 6, synthDecay: 1, synthSustain: 0.8, synthRelease: 12,
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
    filterType: 'lowpass', filterCutoffMin: 40, filterCutoffMax: 1690,
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
    filterType: 'lowpass', filterCutoffMin: 80, filterCutoffMax: 800,
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
    filterType: 'highpass', filterCutoffMin: 800, filterCutoffMax: 4000,
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
    filterType: 'lowpass', filterCutoffMin: 200, filterCutoffMax: 2000,
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
    filterType: 'bandpass', filterCutoffMin: 600, filterCutoffMax: 5000,
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
    filterType: 'bandpass', filterCutoffMin: 300, filterCutoffMax: 3000,
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
    filterType: 'lowpass', filterCutoffMin: 300, filterCutoffMax: 2500,
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
    filterType: 'lowpass', filterCutoffMin: 1200, filterCutoffMax: 6000,
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
    filterType: 'lowpass', filterCutoffMin: 600, filterCutoffMax: 2200,
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
    filterType: 'lowpass', filterCutoffMin: 800, filterCutoffMax: 7000,
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
    filterType: 'lowpass', filterCutoffMin: 2000, filterCutoffMax: 5000,
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
    filterType: 'lowpass', filterCutoffMin: 1500, filterCutoffMax: 4500,
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
    filterType: 'lowpass', filterCutoffMin: 200, filterCutoffMax: 6000,
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
    filterType: 'lowpass', filterCutoffMin: 400, filterCutoffMax: 1800,
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
    filterType: 'lowpass', filterCutoffMin: 3000, filterCutoffMax: 7000,
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
    filterType: 'lowpass', filterCutoffMin: 300, filterCutoffMax: 2000,
    filterResonance: 0.2, filterQ: 1.0,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 40,
    padFilterBResonance: 0.1, padFilterBQ: 0.5, padFilterRouting: 'series',
    synthAttack: 0.01, synthDecay: 0.5, synthSustain: 0.1, synthRelease: 1.0,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.01, padModEnvDecay: 0.3,
    padModEnvSustain: 0, padModEnvRelease: 0.5, padModEnvDepth: 0.6, padModEnvDest: 'filterCutoff',
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
    filterType: 'lowpass', filterCutoffMin: 2000, filterCutoffMax: 6500,
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

/** Buchla Pluck — short percussive with triangle foldback, great for A/B morphing */
const BUCHLA_PLUCK: PadPreset = {
  name: 'Buchla Pluck',
  tags: ['pluck', 'fold', 'buchla', 'percussive'],
  params: {
    padOscAWave: 'triangle', padOscAOctave: 0, padOscADetune: 0, padOscALevel: 0.6,
    padOscBWave: 'sine', padOscBOctave: 1, padOscBDetune: 0, padOscBLevel: 0.3,
    padSubEnabled: false, padSubOctave: -1, padSubWave: 'sine', padSubLevel: 0.2,
    padNoiseType: 'white', padNoiseLevel: 0.02,
    hardness: 0.1, warmth: 0.3, presence: 0.5, padFoldAmount: 0.45, padFoldMode: 0, detune: 0,
    filterType: 'lowpass', filterCutoffMin: 800, filterCutoffMax: 5000,
    filterResonance: 0.15, filterQ: 1.2,
    padFilterBEnabled: false, padFilterBType: 'highpass', padFilterBCutoff: 100,
    padFilterBResonance: 0.1, padFilterBQ: 0.7, padFilterRouting: 'series',
    synthAttack: 0.005, synthDecay: 0.35, synthSustain: 0.05, synthRelease: 0.6,
    padLfo1Rate: 0.5, padLfo1Depth: 0, padLfo1Wave: 'sine', padLfo1Dest: 'none',
    padModEnvEnabled: true, padModEnvAttack: 0.005, padModEnvDecay: 0.2,
    padModEnvSustain: 0, padModEnvRelease: 0.3, padModEnvDepth: 0.4, padModEnvDest: 'filterCutoff',
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
    filterType: 'lowpass', filterCutoffMin: 600, filterCutoffMax: 4000,
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
    filterType: 'lowpass', filterCutoffMin: 1000, filterCutoffMax: 6000,
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
    filterType: 'lowpass', filterCutoffMin: 200, filterCutoffMax: 2500,
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
    filterType: 'lowpass', filterCutoffMin: 300, filterCutoffMax: 5000,
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
    filterType: 'lowpass', filterCutoffMin: 150, filterCutoffMax: 1800,
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
    });
  }

  for (const entry of USER_PAD_PRESETS.values()) {
    if (!scope || entry.scope === scope) {
      mergeOption({
        id: entry.id,
        name: entry.name,
        library: entry.library,
        scope: entry.scope,
      });
    }
  }

  return [...optionsById.values()];
}

export function setUserPadPresets(
  scope: 'pad1' | 'pad2',
  presets: Array<{ id: string; name: string; library: Exclude<PresetLibrary, 'stock'>; preset: PadPreset }>,
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
  preset: { id: string; name: string; library: Exclude<PresetLibrary, 'stock'>; preset: PadPreset },
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
      result[key] = a + (b - a) * morph;
    } else {
      // Discrete params: snap at 0.5
      result[key] = morph < 0.5 ? a : b;
    }
  }

  return result;
}
