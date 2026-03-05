/**
 * Looper preset data — Partial SliderState overrides for each reference preset.
 *
 * Based on the granular_update.md implementation plan's reference presets:
 *  - Loop Forest (ZOIA): 4 clean voices, slow LFOs, blur
 *  - Mood Slip (Chase Bliss): Granular micro-loop stretch
 *  - Mosaic Shimmer (Microcosm): Grain oct shimmer, high density
 *  - Flux Cloud (Fors Opal): Always-recording, spray, blur
 *  - Self-Generating: Feedback drone, LFOs, evolving
 *  - Legacy Cloud: Replicates original granulator.worklet.ts
 */

import type { ClockDivision, LaneDirection } from '../../audio/drumSeqTypes';
import type { SubLaneKind, SubLaneState, StepOverrides } from '../sequencer/useEuclideanSequencer';

// Partial state override — only looper-specific keys
export type LooperPresetData = Record<string, unknown>;

/** Sequencer configuration for a preset (sub-lanes, clock divs, step overrides) */
export interface LooperPresetSeqConfig {
  stepOverrides: StepOverrides;
  subLaneStates: Record<SubLaneKind, SubLaneState>[];
  clockDivs: ClockDivision[];
}

/**
 * Get partial state overrides for a looper preset.
 * Returns undefined for 'init' (no-op: leaves current state as-is).
 */
export function getLooperPresetData(presetId: string): LooperPresetData | undefined {
  return LOOPER_PRESET_MAP[presetId];
}

/**
 * Get sequencer configuration for a looper preset (sub-lane overrides, clock divs).
 * Returns undefined for presets without Euclidean configuration.
 */
export function getLooperPresetSeqConfig(presetId: string): LooperPresetSeqConfig | undefined {
  return LOOPER_SEQ_CONFIG_MAP[presetId];
}

/**
 * Recommended SliderMode overrides per looper preset.
 * Returns a Record<string, 'single' | 'walk' | 'sampleHold'> for the 3-mode slider system.
 * Returns undefined if no modes are defined (e.g., init).
 */
export function getLooperPresetSliderModes(presetId: string): Record<string, string> | undefined {
  return LOOPER_SLIDER_MODES[presetId];
}

// Per-voice param suffixes that benefit from generative modes
const WALK_PARAMS = ['Blur', 'Pan', 'Gain', 'PosLFORate', 'PosLFODepth', 'PanLFORate', 'WriteFollow'];
const SH_PARAMS = ['Spray', 'Density', 'GrainSize', 'Pitch', 'GrainOct', 'Speed'];

function buildVoiceModes(
  voices: number[],
  walkParams: string[] = WALK_PARAMS,
  shParams: string[] = SH_PARAMS,
): Record<string, string> {
  const modes: Record<string, string> = {};
  for (const v of voices) {
    for (const p of walkParams) modes[`looperV${v}${p}`] = 'walk';
    for (const p of shParams) modes[`looperV${v}${p}`] = 'sampleHold';
  }
  return modes;
}

const LOOPER_SLIDER_MODES: Record<string, Record<string, string>> = {
  legacy_cloud: {},   // Legacy mode: all fixed, no generative variation
  loop_forest: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, []), // Clean voices: walk only, no S&H grain params
  mood_slip: buildVoiceModes([1], WALK_PARAMS, ['Speed']),
  mosaic_shimmer: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  flux_cloud: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  self_generating: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  tape_loop: buildVoiceModes([1, 2], WALK_PARAMS, []),
  shimmer_pad: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  glitch_chop: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  ambient_wash: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  stutter: buildVoiceModes([1], ['Gain'], ['Density', 'GrainSize', 'Speed']),
  reverse_cloud: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  drone_freeze: buildVoiceModes([1, 2], WALK_PARAMS, []),
  polyrhythm: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, SH_PARAMS),
  scatter: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  warm_delay: buildVoiceModes([1], WALK_PARAMS, []),
  ice_crystals: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  microcosm: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
};

const LOOPER_PRESET_MAP: Record<string, LooperPresetData> = {
  // ─── Legacy Cloud: Replicates original granulator.worklet.ts ───
  legacy_cloud: {
    looperEnabled: true,
    looperDryWet: 0.3,
    looperFeedback: 0.1,
    looperFeedbackLPF: 8000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0, looperMacroComplexity: 0,
    looperMacroDarkness: 0, looperMacroChaos: 0,
    // V1: legacy mode
    looperV1Enabled: true, looperV1Mode: 'legacy',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.003, looperV1Decay: 0.5,
    looperV1Blur: 0, looperV1GrainOct: 0, looperV1Spray: 0.3,
    looperV1Density: 20, looperV1GrainSize: 80, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0, looperV1PosLFODepth: 0, looperV1PanLFORate: 0,
    looperV1StereoSpread: 0.5, looperV1ReverseLFORate: 0,
    looperV1WriteFollow: 0, looperV1RecordLFORate: 0,
    // V2-V4: off
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Legacy params
    looperLegacyJitter: 10, looperLegacyProbability: 0.8,
    looperLegacyPitchMode: 'harmonic', looperLegacyPitchSpread: 2,
    looperLegacyMaxGrains: 64, looperLegacyFeedback: 0.1,
    // Euclidean: OFF (continuous playback)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    // Delay: minimal
    looperDelayEnabled: false,
  },

  // ─── Loop Forest: 4 clean voices, slow LFOs, blur, no grains ───
  // Inspired by ZOIA Loop Forest: 4 parallel loopers, slow position scanning
  loop_forest: {
    looperEnabled: true,
    looperDryWet: 0.45,
    looperFeedback: 0,
    looperFeedbackLPF: 3000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperReverbSend: 0.5,
    looperMacroTexture: 0.4, looperMacroComplexity: 0.5,
    looperMacroDarkness: 0.4, looperMacroChaos: 0.1,
    // V1: ZOIA-style LFO scan — speed=0, sine LFO IS the playhead (18.5s cycle, 96% depth)
    looperV1Enabled: true, looperV1Mode: 'clean',
    looperV1Slice: 0, looperV1Speed: 0, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.5, looperV1Decay: 2.0,
    looperV1Blur: 0.3, looperV1GrainOct: 0, looperV1Spray: 0,
    looperV1Density: 20, looperV1GrainSize: 80, looperV1Pan: -0.3, looperV1Gain: 0.35,
    looperV1PosLFORate: 0.36, looperV1PosLFODepth: 0.96,
    looperV1PanLFORate: 0.387, looperV1StereoSpread: 0.3,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0, looperV1RecordLFORate: 0.147,
    // V2: ZOIA-style LFO scan — speed=0, separate phase from V1
    looperV2Enabled: true, looperV2Mode: 'clean',
    looperV2Slice: 0, looperV2Speed: 0, looperV2Reverse: false,
    looperV2Pitch: 0, looperV2Attack: 0.8, looperV2Decay: 2.5,
    looperV2Blur: 0.35, looperV2GrainOct: 0, looperV2Spray: 0,
    looperV2Density: 20, looperV2GrainSize: 80, looperV2Pan: 0.3, looperV2Gain: 0.35,
    looperV2PosLFORate: 0.36, looperV2PosLFODepth: 0.96,
    looperV2PanLFORate: 0.78, looperV2StereoSpread: 0.3,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0, looperV2RecordLFORate: 0.273,
    // V3: ZOIA-style LFO scan — slower position sweep (63s cycle), quieter
    looperV3Enabled: true, looperV3Mode: 'clean',
    looperV3Slice: 0, looperV3Speed: 0, looperV3Reverse: false,
    looperV3Pitch: 0, looperV3Attack: 1.0, looperV3Decay: 3.0,
    looperV3Blur: 0.4, looperV3GrainOct: 0, looperV3Spray: 0,
    looperV3Density: 20, looperV3GrainSize: 80, looperV3Pan: -0.5, looperV3Gain: 0.2,
    looperV3PosLFORate: 0.107, looperV3PosLFODepth: 0.96,
    looperV3PanLFORate: 0.66, looperV3StereoSpread: 0.4,
    looperV3ReverseLFORate: 0, looperV3WriteFollow: 0, looperV3RecordLFORate: 0.273,
    // V4: ZOIA-style LFO scan — medium sweep (35s cycle, 96% depth), quieter
    looperV4Enabled: true, looperV4Mode: 'clean',
    looperV4Slice: 0, looperV4Speed: 0, looperV4Reverse: false,
    looperV4Pitch: 0, looperV4Attack: 0.6, looperV4Decay: 2.0,
    looperV4Blur: 0.25, looperV4GrainOct: 0, looperV4Spray: 0,
    looperV4Density: 20, looperV4GrainSize: 80, looperV4Pan: 0.31, looperV4Gain: 0.2,
    looperV4PosLFORate: 0.193, looperV4PosLFODepth: 0.96,
    looperV4PanLFORate: 0.707, looperV4StereoSpread: 0.3,
    looperV4ReverseLFORate: 0, looperV4WriteFollow: 0, looperV4RecordLFORate: 0.853,
    // Euclidean: OFF (continuous clean playback, drift-based)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    // Delay: ZOIA-style warm tape delay (high mix, high reverb send for diffusion)
    looperDelayEnabled: true, looperDelayActivity: 0.35,
    looperDelayRepeats: 0.45, looperDelayFilter: 0.3,
    looperDelayVibrato: 0.25, looperDelayMix: 0.45, looperDelayReverbSend: 0.55,
  },

  // ─── Mood Slip: Granular micro-loop stretch (Chase Bliss Mood) ───
  mood_slip: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.2,
    looperFeedbackLPF: 6000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.3, looperMacroComplexity: 0.3,
    looperMacroDarkness: 0.2, looperMacroChaos: 0.15,
    // V1: granular, slow grains, moderate density
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 0.5, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.05, looperV1Decay: 1.0,
    looperV1Blur: 0.3, looperV1GrainOct: 0, looperV1Spray: 0.15,
    looperV1Density: 12, looperV1GrainSize: 200, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0.067, looperV1PosLFODepth: 0.3,
    looperV1PanLFORate: 0.033, looperV1StereoSpread: 0.4,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0.6, looperV1RecordLFORate: 0,
    // V2: off
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous micro-loop stretch)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    // Delay: slap-back
    looperDelayEnabled: true, looperDelayActivity: 0.15,
    looperDelayRepeats: 0.5, looperDelayFilter: 0.45,
    looperDelayVibrato: 0.1, looperDelayMix: 0.3, looperDelayReverbSend: 0.4,
  },

  // ─── Mosaic Shimmer: Microcosm-style +12st shimmer clouds ───
  mosaic_shimmer: {
    looperEnabled: true,
    looperDryWet: 0.45,
    looperFeedback: 0.15,
    looperFeedbackLPF: 5000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.6, looperMacroComplexity: 0.4,
    looperMacroDarkness: 0.15, looperMacroChaos: 0.2,
    // V1: granular, high density + grain oct shimmer
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.01, looperV1Decay: 0.8,
    looperV1Blur: 0.4, looperV1GrainOct: 0.6, looperV1Spray: 0.25,
    looperV1Density: 24, looperV1GrainSize: 60, looperV1Pan: -0.2, looperV1Gain: 0.45,
    looperV1PosLFORate: 0.05, looperV1PosLFODepth: 0.2,
    looperV1PanLFORate: 0.04, looperV1StereoSpread: 0.5,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0.3, looperV1RecordLFORate: 0,
    // V2: granular, octave up shimmer
    looperV2Enabled: true, looperV2Mode: 'granular',
    looperV2Slice: 4, looperV2Speed: 1, looperV2Reverse: false,
    looperV2Pitch: 12, looperV2Attack: 0.015, looperV2Decay: 0.6,
    looperV2Blur: 0.5, looperV2GrainOct: 0.8, looperV2Spray: 0.3,
    looperV2Density: 20, looperV2GrainSize: 50, looperV2Pan: 0.2, looperV2Gain: 0.35,
    looperV2PosLFORate: 0.033, looperV2PosLFODepth: 0.25,
    looperV2PanLFORate: 0.033, looperV2StereoSpread: 0.6,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0.3, looperV2RecordLFORate: 0,
    // V3-V4: off
    looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: ON — rhythmic shimmer bursts (Microcosm Mosaic)
    looperEuclidMasterEnabled: true,
    looperEuclid1Enabled: true, looperEuclid1Steps: 16, looperEuclid1Hits: 5, looperEuclid1Rotation: 0,
    looperEuclid1Probability: 1.0, looperEuclid1VelocityMin: 0.6, looperEuclid1VelocityMax: 1.0, looperEuclid1Level: 0.8,
    looperEuclid2Enabled: true, looperEuclid2Steps: 16, looperEuclid2Hits: 7, looperEuclid2Rotation: 2,
    looperEuclid2Probability: 0.9, looperEuclid2VelocityMin: 0.5, looperEuclid2VelocityMax: 0.9, looperEuclid2Level: 0.6,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    // Delay: moderate activity for rhythmic shimmer
    looperDelayEnabled: true, looperDelayActivity: 0.45,
    looperDelayRepeats: 0.4, looperDelayFilter: 0.55,
    looperDelayVibrato: 0.25, looperDelayMix: 0.35, looperDelayReverbSend: 0.35,
  },

  // ─── Flux Cloud: Fors Opal Flux-style always-recording spray ───
  flux_cloud: {
    looperEnabled: true,
    looperDryWet: 0.45,
    looperFeedback: 0.1,
    looperFeedbackLPF: 6000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.5, looperMacroComplexity: 0.3,
    looperMacroDarkness: 0.25, looperMacroChaos: 0.1,
    // V1: granular, spray-focused
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.02, looperV1Decay: 0.6,
    looperV1Blur: 0.6, looperV1GrainOct: 0.3, looperV1Spray: 0.5,
    looperV1Density: 16, looperV1GrainSize: 100, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0.067, looperV1PosLFODepth: 0.4,
    looperV1PanLFORate: 0.05, looperV1StereoSpread: 0.5,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0.5, looperV1RecordLFORate: 0.067,
    // V2: off
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous cloud)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    // Delay: minimal
    looperDelayEnabled: true, looperDelayActivity: 0.1,
    looperDelayRepeats: 0.25, looperDelayFilter: 0.5,
    looperDelayVibrato: 0.1, looperDelayMix: 0.2, looperDelayReverbSend: 0.3,
  },

  // ─── Self-Generating: Feedback drone, high LFOs, evolving ───
  self_generating: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.65,
    looperFeedbackLPF: 3000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.7, looperMacroComplexity: 0.7,
    looperMacroDarkness: 0.5, looperMacroChaos: 0.3,
    // V1: granular, high feedback + LFOs
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 0.5, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.1, looperV1Decay: 2.0,
    looperV1Blur: 0.7, looperV1GrainOct: 0.3, looperV1Spray: 0.4,
    looperV1Density: 8, looperV1GrainSize: 250, looperV1Pan: -0.3, looperV1Gain: 0.4,
    looperV1PosLFORate: 0.167, looperV1PosLFODepth: 0.6,
    looperV1PanLFORate: 0.1, looperV1StereoSpread: 0.5,
    looperV1ReverseLFORate: 0.067, looperV1WriteFollow: 0.4, looperV1RecordLFORate: 0.1,
    // V2: clean, slow reverse
    looperV2Enabled: true, looperV2Mode: 'clean',
    looperV2Slice: 8, looperV2Speed: 0.3, looperV2Reverse: true,
    looperV2Pitch: -12, looperV2Attack: 1.0, looperV2Decay: 3.0,
    looperV2Blur: 0.8, looperV2GrainOct: 0, looperV2Spray: 0,
    looperV2Density: 20, looperV2GrainSize: 80, looperV2Pan: 0.3, looperV2Gain: 0.3,
    looperV2PosLFORate: 0.133, looperV2PosLFODepth: 0.7,
    looperV2PanLFORate: 0.067, looperV2StereoSpread: 0.4,
    looperV2ReverseLFORate: 0.05, looperV2WriteFollow: 0.3, looperV2RecordLFORate: 0.083,
    // V3-V4: off
    looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous feedback drone)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    // Delay: moderate, dark
    looperDelayEnabled: true, looperDelayActivity: 0.3,
    looperDelayRepeats: 0.6, looperDelayFilter: 0.3,
    looperDelayVibrato: 0.3, looperDelayMix: 0.3, looperDelayReverbSend: 0.4,
  },

  // ─── Tape Loop: Clean dual-voice LFO scan — authentic tape warble through full buffer ───
  tape_loop: {
    looperEnabled: true,
    looperDryWet: 0.45,
    looperFeedback: 0.1,
    looperFeedbackLPF: 3500,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperReverbSend: 0.35,
    looperMacroTexture: 0.2, looperMacroComplexity: 0.1,
    looperMacroDarkness: 0.4, looperMacroChaos: 0,
    // V1: slow LFO scan through full buffer (long arc, ~45s cycle)
    looperV1Enabled: true, looperV1Mode: 'clean',
    looperV1Slice: 0, looperV1Speed: 0, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.3, looperV1Decay: 1.5,
    looperV1Blur: 0.15, looperV1GrainOct: 0, looperV1Spray: 0,
    looperV1Density: 20, looperV1GrainSize: 80, looperV1Pan: -0.15, looperV1Gain: 0.4,
    looperV1PosLFORate: 0.147, looperV1PosLFODepth: 0.85,
    looperV1PanLFORate: 0.067, looperV1StereoSpread: 0.2,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0, looperV1RecordLFORate: 0.1,
    // V2: offset scan phase, slightly different rate for evolving texture
    looperV2Enabled: true, looperV2Mode: 'clean',
    looperV2Slice: 0, looperV2Speed: 0, looperV2Reverse: false,
    looperV2Pitch: 0, looperV2Attack: 0.5, looperV2Decay: 2.0,
    looperV2Blur: 0.2, looperV2GrainOct: 0, looperV2Spray: 0,
    looperV2Density: 20, looperV2GrainSize: 80, looperV2Pan: 0.15, looperV2Gain: 0.3,
    looperV2PosLFORate: 0.107, looperV2PosLFODepth: 0.85,
    looperV2PanLFORate: 0.05, looperV2StereoSpread: 0.2,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0, looperV2RecordLFORate: 0.067,
    looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous tape delay)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.15,
    looperDelayRepeats: 0.35, looperDelayFilter: 0.35,
    looperDelayVibrato: 0.2, looperDelayMix: 0.35, looperDelayReverbSend: 0.3,
  },

  // ─── Shimmer Pad: Dense grain clouds with octave shimmer ───
  shimmer_pad: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.15,
    looperFeedbackLPF: 6000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.7, looperMacroComplexity: 0.3,
    looperMacroDarkness: 0.1, looperMacroChaos: 0.15,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.05, looperV1Decay: 1.5,
    looperV1Blur: 0.5, looperV1GrainOct: 0.7, looperV1Spray: 0.3,
    looperV1Density: 24, looperV1GrainSize: 100, looperV1Pan: 0, looperV1Gain: 0.45,
    looperV1PosLFORate: 0.05, looperV1PosLFODepth: 0.3,
    looperV1PanLFORate: 0.04, looperV1StereoSpread: 0.6,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0.2, looperV1RecordLFORate: 0,
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous shimmer cloud)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.3,
    looperDelayRepeats: 0.35, looperDelayFilter: 0.5,
    looperDelayVibrato: 0.2, looperDelayMix: 0.3, looperDelayReverbSend: 0.4,
  },

  // ─── Glitch Chop: Aggressive stutter with high density bursts ───
  glitch_chop: {
    looperEnabled: true,
    looperDryWet: 0.55,
    looperFeedback: 0.05,
    looperFeedbackLPF: 8000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.1, looperMacroComplexity: 0.2,
    looperMacroDarkness: 0, looperMacroChaos: 0.6,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.003, looperV1Decay: 0.05,
    looperV1Blur: 0, looperV1GrainOct: 0.1, looperV1Spray: 0.1,
    looperV1Density: 4, looperV1GrainSize: 30, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0, looperV1PosLFODepth: 0,
    looperV1PanLFORate: 0, looperV1StereoSpread: 0.3,
    looperV1ReverseLFORate: 0.133, looperV1WriteFollow: 0.7, looperV1RecordLFORate: 0,
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: ON — aggressive chop patterns
    looperEuclidMasterEnabled: true,
    looperEuclid1Enabled: true, looperEuclid1Steps: 16, looperEuclid1Hits: 3, looperEuclid1Rotation: 0,
    looperEuclid1Probability: 0.85, looperEuclid1VelocityMin: 0.7, looperEuclid1VelocityMax: 1.0, looperEuclid1Level: 0.9,
    looperEuclid2Enabled: false, looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: false,
  },

  // ─── Ambient Wash: Soft diffused texture with full-buffer scan ───
  ambient_wash: {
    looperEnabled: true,
    looperDryWet: 0.4,
    looperFeedback: 0.15,
    looperFeedbackLPF: 3000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperReverbSend: 0.5,
    looperMacroTexture: 0.6, looperMacroComplexity: 0.4,
    looperMacroDarkness: 0.5, looperMacroChaos: 0.05,
    // V1: slow LFO scan — continuous wash through full buffer (~30s cycle)
    looperV1Enabled: true, looperV1Mode: 'clean',
    looperV1Slice: 0, looperV1Speed: 0, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.5, looperV1Decay: 3.0,
    looperV1Blur: 0.35, looperV1GrainOct: 0, looperV1Spray: 0,
    looperV1Density: 20, looperV1GrainSize: 80, looperV1Pan: -0.2, looperV1Gain: 0.4,
    looperV1PosLFORate: 0.22, looperV1PosLFODepth: 0.9,
    looperV1PanLFORate: 0.05, looperV1StereoSpread: 0.4,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0, looperV1RecordLFORate: 0.1,
    // V2: slower scan for depth, quieter
    looperV2Enabled: true, looperV2Mode: 'clean',
    looperV2Slice: 0, looperV2Speed: 0, looperV2Reverse: false,
    looperV2Pitch: 0, looperV2Attack: 0.8, looperV2Decay: 4.0,
    looperV2Blur: 0.4, looperV2GrainOct: 0, looperV2Spray: 0,
    looperV2Density: 20, looperV2GrainSize: 80, looperV2Pan: 0.2, looperV2Gain: 0.25,
    looperV2PosLFORate: 0.107, looperV2PosLFODepth: 0.9,
    looperV2PanLFORate: 0.033, looperV2StereoSpread: 0.5,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0, looperV2RecordLFORate: 0.067,
    looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous ambient wash)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.2,
    looperDelayRepeats: 0.4, looperDelayFilter: 0.3,
    looperDelayVibrato: 0.2, looperDelayMix: 0.3, looperDelayReverbSend: 0.5,
  },

  // ─── Stutter: Rapid micro-chop effect ───
  stutter: {
    looperEnabled: true,
    looperDryWet: 0.6,
    looperFeedback: 0,
    looperFeedbackLPF: 8000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0, looperMacroComplexity: 0,
    looperMacroDarkness: 0, looperMacroChaos: 0.3,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.003, looperV1Decay: 0.03,
    looperV1Blur: 0, looperV1GrainOct: 0, looperV1Spray: 0.05,
    looperV1Density: 2, looperV1GrainSize: 20, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0, looperV1PosLFODepth: 0,
    looperV1PanLFORate: 0, looperV1StereoSpread: 0.2,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0.9, looperV1RecordLFORate: 0,
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: ON — rapid-fire micro stutter
    looperEuclidMasterEnabled: true,
    looperEuclid1Enabled: true, looperEuclid1Steps: 16, looperEuclid1Hits: 8, looperEuclid1Rotation: 0,
    looperEuclid1Probability: 1.0, looperEuclid1VelocityMin: 0.8, looperEuclid1VelocityMax: 1.0, looperEuclid1Level: 0.9,
    looperEuclid2Enabled: false, looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: false,
  },

  // ─── Reverse Cloud: Reversed grain texture ───
  reverse_cloud: {
    looperEnabled: true,
    looperDryWet: 0.45,
    looperFeedback: 0.15,
    looperFeedbackLPF: 5000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.45, looperMacroComplexity: 0.3,
    looperMacroDarkness: 0.2, looperMacroChaos: 0.2,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: true,
    looperV1Pitch: 0, looperV1Attack: 0.05, looperV1Decay: 1.0,
    looperV1Blur: 0.4, looperV1GrainOct: 0.2, looperV1Spray: 0.35,
    looperV1Density: 14, looperV1GrainSize: 120, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0.067, looperV1PosLFODepth: 0.3,
    looperV1PanLFORate: 0.05, looperV1StereoSpread: 0.5,
    looperV1ReverseLFORate: 0.017, looperV1WriteFollow: 0.3, looperV1RecordLFORate: 0,
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous reverse cloud)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.25,
    looperDelayRepeats: 0.3, looperDelayFilter: 0.5,
    looperDelayVibrato: 0.1, looperDelayMix: 0.25, looperDelayReverbSend: 0.35,
  },

  // ─── Drone Freeze: Frozen buffer with feedback drone ───
  drone_freeze: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.7,
    looperFeedbackLPF: 2000,
    looperFreeze: true,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.8, looperMacroComplexity: 0.6,
    looperMacroDarkness: 0.6, looperMacroChaos: 0.1,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 0.25, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.5, looperV1Decay: 3.0,
    looperV1Blur: 0.9, looperV1GrainOct: 0.2, looperV1Spray: 0.5,
    looperV1Density: 10, looperV1GrainSize: 350, looperV1Pan: 0, looperV1Gain: 0.45,
    looperV1PosLFORate: 0.133, looperV1PosLFODepth: 0.7,
    looperV1PanLFORate: 0.067, looperV1StereoSpread: 0.5,
    looperV1ReverseLFORate: 0.027, looperV1WriteFollow: 0, looperV1RecordLFORate: 0,
    // V2: clean, LFO scan through full frozen buffer (entire landscape)
    looperV2Enabled: true, looperV2Mode: 'clean',
    looperV2Slice: 0, looperV2Speed: 0, looperV2Reverse: false,
    looperV2Pitch: -12, looperV2Attack: 1.0, looperV2Decay: 4.0,
    looperV2Blur: 0.5, looperV2GrainOct: 0, looperV2Spray: 0,
    looperV2Density: 20, looperV2GrainSize: 80, looperV2Pan: 0, looperV2Gain: 0.3,
    looperV2PosLFORate: 0.1, looperV2PosLFODepth: 0.9,
    looperV2PanLFORate: 0.05, looperV2StereoSpread: 0.4,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0, looperV2RecordLFORate: 0,
    looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous frozen drone)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.2,
    looperDelayRepeats: 0.6, looperDelayFilter: 0.25,
    looperDelayVibrato: 0.3, looperDelayMix: 0.25, looperDelayReverbSend: 0.5,
  },

  // ─── Polyrhythm: Euclidean-driven multi-voice pattern ───
  polyrhythm: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.1,
    looperFeedbackLPF: 6000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.3, looperMacroComplexity: 0.5,
    looperMacroDarkness: 0.15, looperMacroChaos: 0.2,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.01, looperV1Decay: 0.3,
    looperV1Blur: 0.2, looperV1GrainOct: 0.2, looperV1Spray: 0.1,
    looperV1Density: 8, looperV1GrainSize: 60, looperV1Pan: -0.4, looperV1Gain: 0.5,
    looperV1PosLFORate: 0, looperV1PosLFODepth: 0,
    looperV1PanLFORate: 0, looperV1StereoSpread: 0.3,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0.5, looperV1RecordLFORate: 0,
    looperV2Enabled: true, looperV2Mode: 'granular',
    looperV2Slice: 4, looperV2Speed: 1, looperV2Reverse: false,
    looperV2Pitch: 7, looperV2Attack: 0.01, looperV2Decay: 0.25,
    looperV2Blur: 0.15, looperV2GrainOct: 0.15, looperV2Spray: 0.1,
    looperV2Density: 6, looperV2GrainSize: 50, looperV2Pan: 0.4, looperV2Gain: 0.4,
    looperV2PosLFORate: 0, looperV2PosLFODepth: 0,
    looperV2PanLFORate: 0, looperV2StereoSpread: 0.3,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0.5, looperV2RecordLFORate: 0,
    looperV3Enabled: true, looperV3Mode: 'granular',
    looperV3Slice: 8, looperV3Speed: 1, looperV3Reverse: true,
    looperV3Pitch: -5, looperV3Attack: 0.01, looperV3Decay: 0.2,
    looperV3Blur: 0.1, looperV3GrainOct: 0.1, looperV3Spray: 0.15,
    looperV3Density: 5, looperV3GrainSize: 40, looperV3Pan: 0, looperV3Gain: 0.35,
    looperV3PosLFORate: 0, looperV3PosLFODepth: 0,
    looperV3PanLFORate: 0, looperV3StereoSpread: 0.3,
    looperV3ReverseLFORate: 0, looperV3WriteFollow: 0.5, looperV3RecordLFORate: 0,
    looperV4Enabled: true, looperV4Mode: 'granular',
    looperV4Slice: 12, looperV4Speed: 1, looperV4Reverse: false,
    looperV4Pitch: 7, looperV4Attack: 0.01, looperV4Decay: 0.15,
    looperV4Blur: 0.05, looperV4GrainOct: 0.05, looperV4Spray: 0.1,
    looperV4Density: 4, looperV4GrainSize: 35, looperV4Pan: 0.3, looperV4Gain: 0.3,
    looperV4PosLFORate: 0, looperV4PosLFODepth: 0,
    looperV4PanLFORate: 0, looperV4StereoSpread: 0.3,
    looperV4ReverseLFORate: 0, looperV4WriteFollow: 0.5, looperV4RecordLFORate: 0,
    // Euclidean: ON — 4-voice polyrhythm, each lane at a different step count
    looperEuclidMasterEnabled: true,
    looperEuclid1Enabled: true, looperEuclid1Steps: 16, looperEuclid1Hits: 5, looperEuclid1Rotation: 0,
    looperEuclid1Probability: 1.0, looperEuclid1VelocityMin: 0.6, looperEuclid1VelocityMax: 1.0, looperEuclid1Level: 0.8,
    looperEuclid2Enabled: true, looperEuclid2Steps: 12, looperEuclid2Hits: 7, looperEuclid2Rotation: 1,
    looperEuclid2Probability: 1.0, looperEuclid2VelocityMin: 0.5, looperEuclid2VelocityMax: 0.9, looperEuclid2Level: 0.6,
    looperEuclid3Enabled: true, looperEuclid3Steps: 8, looperEuclid3Hits: 3, looperEuclid3Rotation: 0,
    looperEuclid3Probability: 0.9, looperEuclid3VelocityMin: 0.7, looperEuclid3VelocityMax: 1.0, looperEuclid3Level: 0.7,
    looperEuclid4Enabled: true, looperEuclid4Steps: 16, looperEuclid4Hits: 11, looperEuclid4Rotation: 3,
    looperEuclid4Probability: 0.85, looperEuclid4VelocityMin: 0.4, looperEuclid4VelocityMax: 0.8, looperEuclid4Level: 0.5,
    looperDelayEnabled: true, looperDelayActivity: 0.35,
    looperDelayRepeats: 0.25, looperDelayFilter: 0.6,
    looperDelayVibrato: 0, looperDelayMix: 0.25, looperDelayReverbSend: 0.25,
  },

  // ─── Scatter: Random spray with wide stereo ───
  scatter: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.1,
    looperFeedbackLPF: 7000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.4, looperMacroComplexity: 0.3,
    looperMacroDarkness: 0.1, looperMacroChaos: 0.5,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.01, looperV1Decay: 0.4,
    looperV1Blur: 0.2, looperV1GrainOct: 0.25, looperV1Spray: 0.7,
    looperV1Density: 10, looperV1GrainSize: 70, looperV1Pan: 0, looperV1Gain: 0.5,
    looperV1PosLFORate: 0.033, looperV1PosLFODepth: 0.2,
    looperV1PanLFORate: 0.067, looperV1StereoSpread: 0.8,
    looperV1ReverseLFORate: 0.067, looperV1WriteFollow: 0.4, looperV1RecordLFORate: 0,
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: ON — sparse random scatter
    looperEuclidMasterEnabled: true,
    looperEuclid1Enabled: true, looperEuclid1Steps: 16, looperEuclid1Hits: 6, looperEuclid1Rotation: 0,
    looperEuclid1Probability: 0.7, looperEuclid1VelocityMin: 0.4, looperEuclid1VelocityMax: 1.0, looperEuclid1Level: 0.8,
    looperEuclid2Enabled: false, looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.4,
    looperDelayRepeats: 0.3, looperDelayFilter: 0.55,
    looperDelayVibrato: 0.15, looperDelayMix: 0.3, looperDelayReverbSend: 0.3,
  },

  // ─── Warm Delay: Full-buffer LFO scan with dark tape character ───
  warm_delay: {
    looperEnabled: true,
    looperDryWet: 0.4,
    looperFeedback: 0.1,
    looperFeedbackLPF: 2500,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperReverbSend: 0.35,
    looperMacroTexture: 0.15, looperMacroComplexity: 0.1,
    looperMacroDarkness: 0.6, looperMacroChaos: 0,
    // V1: slow LFO scan — evolving warm tape echo (~55s cycle)
    looperV1Enabled: true, looperV1Mode: 'clean',
    looperV1Slice: 0, looperV1Speed: 0, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.3, looperV1Decay: 2.0,
    looperV1Blur: 0.1, looperV1GrainOct: 0, looperV1Spray: 0,
    looperV1Density: 20, looperV1GrainSize: 80, looperV1Pan: 0, looperV1Gain: 0.45,
    looperV1PosLFORate: 0.12, looperV1PosLFODepth: 0.8,
    looperV1PanLFORate: 0.033, looperV1StereoSpread: 0.2,
    looperV1ReverseLFORate: 0, looperV1WriteFollow: 0, looperV1RecordLFORate: 0.067,
    looperV2Enabled: false, looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous warm delay)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.15,
    looperDelayRepeats: 0.5, looperDelayFilter: 0.25,
    looperDelayVibrato: 0.25, looperDelayMix: 0.4, looperDelayReverbSend: 0.35,
  },

  // ─── Ice Crystals: High shimmer with pitch-up fragmentation ───
  ice_crystals: {
    looperEnabled: true,
    looperDryWet: 0.45,
    looperFeedback: 0.1,
    looperFeedbackLPF: 8000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.5, looperMacroComplexity: 0.35,
    looperMacroDarkness: 0, looperMacroChaos: 0.25,
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 2, looperV1Reverse: false,
    looperV1Pitch: 12, looperV1Attack: 0.005, looperV1Decay: 0.3,
    looperV1Blur: 0.3, looperV1GrainOct: 0.9, looperV1Spray: 0.2,
    looperV1Density: 20, looperV1GrainSize: 40, looperV1Pan: -0.3, looperV1Gain: 0.4,
    looperV1PosLFORate: 0.067, looperV1PosLFODepth: 0.2,
    looperV1PanLFORate: 0.05, looperV1StereoSpread: 0.7,
    looperV1ReverseLFORate: 0.033, looperV1WriteFollow: 0.3, looperV1RecordLFORate: 0,
    looperV2Enabled: true, looperV2Mode: 'granular',
    looperV2Slice: 4, looperV2Speed: 1.5, looperV2Reverse: false,
    looperV2Pitch: 24, looperV2Attack: 0.003, looperV2Decay: 0.15,
    looperV2Blur: 0.2, looperV2GrainOct: 1.0, looperV2Spray: 0.25,
    looperV2Density: 16, looperV2GrainSize: 30, looperV2Pan: 0.3, looperV2Gain: 0.25,
    looperV2PosLFORate: 0.05, looperV2PosLFODepth: 0.15,
    looperV2PanLFORate: 0.033, looperV2StereoSpread: 0.6,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0.3, looperV2RecordLFORate: 0,
    looperV3Enabled: false, looperV4Enabled: false,
    // Euclidean: OFF (continuous shimmer cloud)
    looperEuclidMasterEnabled: false,
    looperEuclid1Enabled: false, looperEuclid2Enabled: false,
    looperEuclid3Enabled: false, looperEuclid4Enabled: false,
    looperDelayEnabled: true, looperDelayActivity: 0.5,
    looperDelayRepeats: 0.3, looperDelayFilter: 0.7,
    looperDelayVibrato: 0.1, looperDelayMix: 0.3, looperDelayReverbSend: 0.3,
  },

  // ─── Microcosm: Full 4-voice multi-tap delay + granular cascade ───
  microcosm: {
    looperEnabled: true,
    looperDryWet: 0.5,
    looperFeedback: 0.12,
    looperFeedbackLPF: 5000,
    looperFreeze: false,
    looperBufferSeconds: 16,
    looperMacroTexture: 0.4, looperMacroComplexity: 0.5,
    looperMacroDarkness: 0.2, looperMacroChaos: 0.2,
    // V1: Root — rhythmic granular at original pitch, anchors the sound
    looperV1Enabled: true, looperV1Mode: 'granular',
    looperV1Slice: 0, looperV1Speed: 1, looperV1Reverse: false,
    looperV1Pitch: 0, looperV1Attack: 0.01, looperV1Decay: 0.5,
    looperV1Blur: 0.25, looperV1GrainOct: 0.3, looperV1Spray: 0.15,
    looperV1Density: 14, looperV1GrainSize: 80, looperV1Pan: -0.3, looperV1Gain: 0.5,
    looperV1PosLFORate: 0.05, looperV1PosLFODepth: 0.2,
    looperV1PanLFORate: 0.033, looperV1StereoSpread: 0.4,
    looperV1ReverseLFORate: 0.017, looperV1WriteFollow: 0.4, looperV1RecordLFORate: 0.033,
    // V2: Shimmer — octave-up sparkle layer
    looperV2Enabled: true, looperV2Mode: 'granular',
    looperV2Slice: 4, looperV2Speed: 1, looperV2Reverse: false,
    looperV2Pitch: 12, looperV2Attack: 0.015, looperV2Decay: 0.4,
    looperV2Blur: 0.35, looperV2GrainOct: 0.4, looperV2Spray: 0.2,
    looperV2Density: 10, looperV2GrainSize: 65, looperV2Pan: 0.3, looperV2Gain: 0.3,
    looperV2PosLFORate: 0.033, looperV2PosLFODepth: 0.2,
    looperV2PanLFORate: 0.027, looperV2StereoSpread: 0.5,
    looperV2ReverseLFORate: 0, looperV2WriteFollow: 0.4, looperV2RecordLFORate: 0.033,
    // V3: Sub-harmony — fifth below, reversed grains for ethereal wash
    looperV3Enabled: true, looperV3Mode: 'granular',
    looperV3Slice: 8, looperV3Speed: 1, looperV3Reverse: true,
    looperV3Pitch: -5, looperV3Attack: 0.02, looperV3Decay: 0.6,
    looperV3Blur: 0.4, looperV3GrainOct: 0.15, looperV3Spray: 0.25,
    looperV3Density: 8, looperV3GrainSize: 100, looperV3Pan: 0, looperV3Gain: 0.25,
    looperV3PosLFORate: 0.025, looperV3PosLFODepth: 0.3,
    looperV3PanLFORate: 0.02, looperV3StereoSpread: 0.6,
    looperV3ReverseLFORate: 0.012, looperV3WriteFollow: 0.3, looperV3RecordLFORate: 0.025,
    // V4: Texture — sparse high-pitch micro-grains for air/shimmer detail
    looperV4Enabled: true, looperV4Mode: 'granular',
    looperV4Slice: 12, looperV4Speed: 1, looperV4Reverse: false,
    looperV4Pitch: 7, looperV4Attack: 0.005, looperV4Decay: 0.2,
    looperV4Blur: 0.2, looperV4GrainOct: 0.6, looperV4Spray: 0.3,
    looperV4Density: 6, looperV4GrainSize: 45, looperV4Pan: -0.1, looperV4Gain: 0.2,
    looperV4PosLFORate: 0.04, looperV4PosLFODepth: 0.15,
    looperV4PanLFORate: 0.035, looperV4StereoSpread: 0.7,
    looperV4ReverseLFORate: 0, looperV4WriteFollow: 0.5, looperV4RecordLFORate: 0.04,
    // Euclidean: 4 lanes — interlocking polyrhythms, each voice gated independently
    looperEuclidMasterEnabled: true,
    looperEuclid1Enabled: true, looperEuclid1Steps: 16, looperEuclid1Hits: 5, looperEuclid1Rotation: 0,
    looperEuclid1Probability: 1.0, looperEuclid1VelocityMin: 0.6, looperEuclid1VelocityMax: 1.0, looperEuclid1Level: 0.8,
    looperEuclid2Enabled: true, looperEuclid2Steps: 16, looperEuclid2Hits: 3, looperEuclid2Rotation: 1,
    looperEuclid2Probability: 0.9, looperEuclid2VelocityMin: 0.5, looperEuclid2VelocityMax: 0.85, looperEuclid2Level: 0.6,
    looperEuclid3Enabled: true, looperEuclid3Steps: 12, looperEuclid3Hits: 4, looperEuclid3Rotation: 2,
    looperEuclid3Probability: 0.85, looperEuclid3VelocityMin: 0.5, looperEuclid3VelocityMax: 0.9, looperEuclid3Level: 0.65,
    looperEuclid4Enabled: true, looperEuclid4Steps: 8, looperEuclid4Hits: 3, looperEuclid4Rotation: 0,
    looperEuclid4Probability: 0.8, looperEuclid4VelocityMin: 0.4, looperEuclid4VelocityMax: 0.8, looperEuclid4Level: 0.5,
    // Delay: moderate activity (feedback now normalized, safe at higher values)
    looperDelayEnabled: true, looperDelayActivity: 0.55,
    looperDelayRepeats: 0.4, looperDelayFilter: 0.45,
    looperDelayVibrato: 0.12, looperDelayMix: 0.35, looperDelayReverbSend: 0.35,
  },
};

// ═══════════════════════════════════════════════════════════════
// Sequencer Preset Configs — sub-lane step overrides, clock divs
// ═══════════════════════════════════════════════════════════════

/** Build a default empty sub-lane state for one lane. */
function defaultSubLane(): Record<SubLaneKind, SubLaneState> {
  return {
    pitch: { enabled: false, steps: 5, direction: 'forward' as LaneDirection },
    expression: { enabled: false, steps: 5, direction: 'forward' as LaneDirection },
    morph: { enabled: false, steps: 4, direction: 'forward' as LaneDirection },
    distance: { enabled: false, steps: 4, direction: 'forward' as LaneDirection },
    slice: { enabled: false, steps: 4, direction: 'forward' as LaneDirection },
    reverse: { enabled: false, steps: 4, direction: 'forward' as LaneDirection },
  };
}

/** Build a 4-lane empty StepOverrides. */
function emptyStepOverrides(): StepOverrides {
  return {
    triggerToggles: [new Map(), new Map(), new Map(), new Map()],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
    expression: [null, null, null, null],
    pitch: [null, null, null, null],
    morph: [null, null, null, null],
    distance: [null, null, null, null],
    slice: [null, null, null, null],
    reverse: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    morphDirection: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    pitchDirection: [null, null, null, null],
    sliceDirection: [null, null, null, null],
    reverseDirection: [null, null, null, null],
  };
}

/**
 * Per-preset sequencer configuration map.
 * Only rhythmic presets have entries; non-rhythmic presets return undefined from getLooperPresetSeqConfig.
 */
const LOOPER_SEQ_CONFIG_MAP: Record<string, LooperPresetSeqConfig> = {

  // ── Mosaic Shimmer: Shimmer bursts cycling through slices with pitch intervals ──
  mosaic_shimmer: (() => {
    const so = emptyStepOverrides();
    const sl = [defaultSubLane(), defaultSubLane(), defaultSubLane(), defaultSubLane()];
    // Lane 1: cycle 4 slices + pitch shimmer intervals
    so.slice[0] = [0, 4, 8, 12];
    sl[0].slice = { enabled: true, steps: 4, direction: 'forward' };
    so.pitch[0] = [0, 7, 12, 5, 0];
    so.pitchDirection[0] = 'forward';
    sl[0].pitch = { enabled: true, steps: 5, direction: 'forward' };
    // Lane 2: offset slices + octave ping-pong
    so.slice[1] = [2, 6, 10, 14];
    sl[1].slice = { enabled: true, steps: 4, direction: 'forward' };
    so.pitch[1] = [0, 12, 0, -12];
    so.pitchDirection[1] = 'pingpong';
    sl[1].pitch = { enabled: true, steps: 4, direction: 'pingpong' };
    return { stepOverrides: so, subLaneStates: sl, clockDivs: ['1/8', '1/16', '1/8T', '1/4'] as ClockDivision[] };
  })(),

  // ── Glitch Chop: Sparse chops jumping through slices with occasional reverse ──
  glitch_chop: (() => {
    const so = emptyStepOverrides();
    const sl = [defaultSubLane(), defaultSubLane(), defaultSubLane(), defaultSubLane()];
    // Lane 1: wide slice jumps + reverse pattern
    so.slice[0] = [0, 4, 8, 12, 2, 10];
    sl[0].slice = { enabled: true, steps: 6, direction: 'forward' };
    so.reverse[0] = [0, 0, 1, 0, 1, 0];
    so.reverseDirection[0] = 'forward';
    sl[0].reverse = { enabled: true, steps: 6, direction: 'forward' };
    return { stepOverrides: so, subLaneStates: sl, clockDivs: ['1/16', '1/16', '1/8T', '1/4'] as ClockDivision[] };
  })(),

  // ── Stutter: Dense stutter with subtle slice shifts ──
  stutter: (() => {
    const so = emptyStepOverrides();
    const sl = [defaultSubLane(), defaultSubLane(), defaultSubLane(), defaultSubLane()];
    // Lane 1: mostly same slice with occasional shift
    so.slice[0] = [0, 0, 0, 1, 0, 0, 2, 0];
    sl[0].slice = { enabled: true, steps: 8, direction: 'forward' };
    return { stepOverrides: so, subLaneStates: sl, clockDivs: ['1/16', '1/16', '1/8T', '1/4'] as ClockDivision[] };
  })(),

  // ── Polyrhythm: 4-voice polyrhythm with varied slice/pitch/reverse per lane ──
  polyrhythm: (() => {
    const so = emptyStepOverrides();
    const sl = [defaultSubLane(), defaultSubLane(), defaultSubLane(), defaultSubLane()];
    // Lane 1: 4 slices forward + pitch root-fifth pattern
    so.slice[0] = [0, 4, 8, 12];
    sl[0].slice = { enabled: true, steps: 4, direction: 'forward' };
    so.pitch[0] = [0, 7, 0, 5, 0];
    so.pitchDirection[0] = 'forward';
    sl[0].pitch = { enabled: true, steps: 5, direction: 'forward' };
    // Lane 2: 3 offset slices + octave up/down
    so.slice[1] = [2, 6, 10];
    sl[1].slice = { enabled: true, steps: 3, direction: 'forward' };
    so.pitch[1] = [0, 12, -12];
    so.pitchDirection[1] = 'pingpong';
    sl[1].pitch = { enabled: true, steps: 3, direction: 'pingpong' };
    // Lane 3: 2 slices with reverse alternation
    so.slice[2] = [1, 9];
    sl[2].slice = { enabled: true, steps: 2, direction: 'forward' };
    so.reverse[2] = [0, 1];
    so.reverseDirection[2] = 'forward';
    sl[2].reverse = { enabled: true, steps: 2, direction: 'forward' };
    // Lane 4: dense cascade through many slices
    so.slice[3] = [0, 2, 4, 6, 8, 10];
    sl[3].slice = { enabled: true, steps: 6, direction: 'pingpong' };
    return {
      stepOverrides: so, subLaneStates: sl,
      clockDivs: ['1/8', '1/16', '1/8T', '1/4'] as ClockDivision[],
    };
  })(),

  // ── Scatter: Sparse random-feel scatter with wide slice jumps ──
  scatter: (() => {
    const so = emptyStepOverrides();
    const sl = [defaultSubLane(), defaultSubLane(), defaultSubLane(), defaultSubLane()];
    // Lane 1: wide non-sequential slice jumps + occasional reverse
    so.slice[0] = [0, 7, 3, 11, 5, 14];
    sl[0].slice = { enabled: true, steps: 6, direction: 'forward' };
    so.reverse[0] = [0, 0, 1, 0, 0, 1];
    so.reverseDirection[0] = 'forward';
    sl[0].reverse = { enabled: true, steps: 6, direction: 'forward' };
    return { stepOverrides: so, subLaneStates: sl, clockDivs: ['1/8', '1/16', '1/8T', '1/4'] as ClockDivision[] };
  })(),

  // ── Microcosm: 4-voice polyrhythmic cascade with complementary sub-lanes ──
  microcosm: (() => {
    const so = emptyStepOverrides();
    const sl = [defaultSubLane(), defaultSubLane(), defaultSubLane(), defaultSubLane()];
    // Lane 1 (Root): slice cycle + melodic pitch intervals
    so.slice[0] = [0, 4, 8, 12];
    sl[0].slice = { enabled: true, steps: 4, direction: 'forward' };
    so.pitch[0] = [0, 7, 12, 5, 0];
    so.pitchDirection[0] = 'forward';
    sl[0].pitch = { enabled: true, steps: 5, direction: 'forward' };
    // Lane 2 (Shimmer): offset slices + high pitch intervals + occasional reverse
    so.slice[1] = [2, 6, 10];
    sl[1].slice = { enabled: true, steps: 3, direction: 'forward' };
    so.pitch[1] = [0, 7, 12];
    so.pitchDirection[1] = 'forward';
    sl[1].pitch = { enabled: true, steps: 3, direction: 'forward' };
    so.reverse[1] = [0, 0, 1];
    so.reverseDirection[1] = 'forward';
    sl[1].reverse = { enabled: true, steps: 3, direction: 'forward' };
    // Lane 3 (Sub-harmony): slow slice walk + reverse cycling
    so.slice[2] = [0, 8, 4, 12];
    sl[2].slice = { enabled: true, steps: 4, direction: 'forward' };
    so.reverse[2] = [1, 0, 0, 1];
    so.reverseDirection[2] = 'forward';
    sl[2].reverse = { enabled: true, steps: 4, direction: 'forward' };
    // Lane 4 (Texture): scattered slices + wide pitch variation
    so.slice[3] = [3, 9, 6];
    sl[3].slice = { enabled: true, steps: 3, direction: 'pingpong' };
    so.pitch[3] = [0, 5, 12, -5];
    so.pitchDirection[3] = 'forward';
    sl[3].pitch = { enabled: true, steps: 4, direction: 'forward' };
    return { stepOverrides: so, subLaneStates: sl, clockDivs: ['1/8', '1/8T', '1/4', '1/16'] as ClockDivision[] };
  })(),
};
