/**
 * Granular preset data — Partial SliderState overrides for each reference preset.
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

// Partial state override — only granular-specific keys
export type GranularPresetData = Record<string, unknown>;

/** Sequencer configuration for a preset (sub-lanes, clock divs, step overrides) */
export interface GranularPresetSeqConfig {
  stepOverrides: StepOverrides;
  subLaneStates: Record<SubLaneKind, SubLaneState>[];
  clockDivs: ClockDivision[];
}

/**
 * Get partial state overrides for a granular preset.
 * Returns undefined for 'init' (no-op: leaves current state as-is).
 */
export function getGranularPresetData(presetId: string): GranularPresetData | undefined {
  return GRANULAR_PRESET_MAP[presetId];
}

/**
 * Get sequencer configuration for a granular preset (sub-lane overrides, clock divs).
 * Returns undefined for presets without Euclidean configuration.
 */
export function getGranularPresetSeqConfig(presetId: string): GranularPresetSeqConfig | undefined {
  return GRANULAR_SEQ_CONFIG_MAP[presetId];
}

/**
 * Recommended SliderMode overrides per granular preset.
 * Returns a Record<string, 'single' | 'walk' | 'sampleHold'> for the 3-mode slider system.
 * Returns undefined if no modes are defined (e.g., init).
 */
export function getGranularPresetSliderModes(presetId: string): Record<string, string> | undefined {
  return GRANULAR_SLIDER_MODES[presetId];
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
    for (const p of walkParams) modes[`granularV${v}${p}`] = 'walk';
    for (const p of shParams) modes[`granularV${v}${p}`] = 'sampleHold';
  }
  return modes;
}

const GRANULAR_SLIDER_MODES: Record<string, Record<string, string>> = {
  legacy_cloud: {},   // Legacy mode: all fixed, no generative variation
  loop_forest: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, []), // Clean voices: walk only, no S&H grain params
  mood_slip: buildVoiceModes([1], WALK_PARAMS, ['Speed']),
  // Mosaic: Pitch is fixed per voice (0 / +12 octave intervals like Microcosm speed ratios)
  mosaic_shimmer: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS.filter(p => p !== 'Pitch')),
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

const GRANULAR_PRESET_MAP: Record<string, GranularPresetData> = {
  // ─── Legacy Cloud: Replicates original granulator.worklet.ts ───
  legacy_cloud: {
    granularEnabled: true,
    granularDryWet: 0.3,
    granularFeedback: 0.1,
    granularFeedbackLPF: 8000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0, granularMacroComplexity: 0,
    granularMacroDarkness: 0, granularMacroChaos: 0,
    // V1: legacy mode
    granularV1Enabled: true, granularV1Mode: 'legacy',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.003, granularV1Decay: 0.5,
    granularV1Blur: 0, granularV1GrainOct: 0, granularV1Spray: 0.3,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0, granularV1PanLFORate: 0,
    granularV1StereoSpread: 0.5, granularV1ReverseLFORate: 0,
    granularV1WriteFollow: 0, granularV1RecordLFORate: 0,
    // V2-V4: off
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Legacy params
    granularLegacyJitter: 10, granularLegacyProbability: 0.8,
    granularLegacyPitchMode: 'harmonic', granularLegacyPitchSpread: 2,
    granularLegacyMaxGrains: 64, granularLegacyFeedback: 0.1,
    // Euclidean: OFF (continuous playback)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    // Delay: minimal
    granularDelayEnabled: false,
  },

  // ─── Loop Forest: 4 clean voices, slow LFOs, blur, no grains ───
  // Inspired by ZOIA Loop Forest: 4 parallel granulators, slow position scanning
  loop_forest: {
    granularEnabled: true,
    granularDryWet: 0.45,
    granularFeedback: 0,
    granularFeedbackLPF: 3000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.5,
    granularMacroTexture: 0.4, granularMacroComplexity: 0.5,
    granularMacroDarkness: 0.4, granularMacroChaos: 0.1,
    // V1: ZOIA-style LFO scan — speed=0, sine LFO IS the playhead (18.5s cycle, 96% depth)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.5, granularV1Decay: 2.0,
    granularV1Blur: 0.3, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: -0.3, granularV1Gain: 0.35,
    granularV1PosLFORate: 0.36, granularV1PosLFODepth: 0.96,
    granularV1PanLFORate: 0.387, granularV1StereoSpread: 0.3,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0, granularV1RecordLFORate: 0.147,
    // V2: ZOIA-style LFO scan — speed=0, separate phase from V1
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.8, granularV2Decay: 2.5,
    granularV2Blur: 0.35, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.3, granularV2Gain: 0.35,
    granularV2PosLFORate: 0.36, granularV2PosLFODepth: 0.96,
    granularV2PanLFORate: 0.78, granularV2StereoSpread: 0.3,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0, granularV2RecordLFORate: 0.273,
    // V3: ZOIA-style LFO scan — slower position sweep (63s cycle), quieter
    granularV3Enabled: true, granularV3Mode: 'clean',
    granularV3Slice: 0, granularV3Speed: 0, granularV3Reverse: false,
    granularV3Pitch: 0, granularV3Attack: 1.0, granularV3Decay: 3.0,
    granularV3Blur: 0.4, granularV3GrainOct: 0, granularV3Spray: 0,
    granularV3Density: 20, granularV3GrainSize: 80, granularV3Pan: -0.5, granularV3Gain: 0.2,
    granularV3PosLFORate: 0.107, granularV3PosLFODepth: 0.96,
    granularV3PanLFORate: 0.66, granularV3StereoSpread: 0.4,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0, granularV3RecordLFORate: 0.273,
    // V4: ZOIA-style LFO scan — medium sweep (35s cycle, 96% depth), quieter
    granularV4Enabled: true, granularV4Mode: 'clean',
    granularV4Slice: 0, granularV4Speed: 0, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.6, granularV4Decay: 2.0,
    granularV4Blur: 0.25, granularV4GrainOct: 0, granularV4Spray: 0,
    granularV4Density: 20, granularV4GrainSize: 80, granularV4Pan: 0.31, granularV4Gain: 0.2,
    granularV4PosLFORate: 0.193, granularV4PosLFODepth: 0.96,
    granularV4PanLFORate: 0.707, granularV4StereoSpread: 0.3,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0, granularV4RecordLFORate: 0.853,
    // Euclidean: OFF (continuous clean playback, drift-based)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    // Delay: ZOIA-style warm tape delay (high mix, high reverb send for diffusion)
    granularDelayEnabled: true, granularDelayActivity: 0.35,
    granularDelayRepeats: 0.45, granularDelayFilter: 0.3,
    granularDelayVibrato: 0.25, granularDelayMix: 0.45, granularDelayReverbSend: 0.55,
  },

  // ─── Mood Slip: Granular micro-loop stretch (Chase Bliss Mood) ───
  mood_slip: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.2,
    granularFeedbackLPF: 6000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.3, granularMacroComplexity: 0.3,
    granularMacroDarkness: 0.2, granularMacroChaos: 0.15,
    // V1: granular, slow grains, moderate density
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 0.5, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.05, granularV1Decay: 1.0,
    granularV1Blur: 0.3, granularV1GrainOct: 0, granularV1Spray: 0.15,
    granularV1Density: 12, granularV1GrainSize: 200, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0.067, granularV1PosLFODepth: 0.3,
    granularV1PanLFORate: 0.033, granularV1StereoSpread: 0.4,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.6, granularV1RecordLFORate: 0,
    // V2: off
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous micro-loop stretch)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    // Delay: slap-back
    granularDelayEnabled: true, granularDelayActivity: 0.15,
    granularDelayRepeats: 0.5, granularDelayFilter: 0.45,
    granularDelayVibrato: 0.1, granularDelayMix: 0.3, granularDelayReverbSend: 0.4,
  },

  // ─── Mosaic Shimmer: Microcosm-style +12st shimmer clouds ───
  mosaic_shimmer: {
    granularEnabled: true,
    granularDryWet: 0.45,
    granularFeedback: 0.15,
    granularFeedbackLPF: 5000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.6, granularMacroComplexity: 0.4,
    granularMacroDarkness: 0.15, granularMacroChaos: 0.2,
    // V1: granular, high density + grain oct shimmer
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.01, granularV1Decay: 0.8,
    granularV1Blur: 0.4, granularV1GrainOct: 0.6, granularV1Spray: 0.25,
    granularV1Density: 24, granularV1GrainSize: 60, granularV1Pan: -0.2, granularV1Gain: 0.45,
    granularV1PosLFORate: 0.05, granularV1PosLFODepth: 0.2,
    granularV1PanLFORate: 0.04, granularV1StereoSpread: 0.5,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.3, granularV1RecordLFORate: 0,
    // V2: granular, octave up shimmer
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 1, granularV2Reverse: false,
    granularV2Pitch: 12, granularV2Attack: 0.015, granularV2Decay: 0.6,
    granularV2Blur: 0.5, granularV2GrainOct: 0.8, granularV2Spray: 0.3,
    granularV2Density: 20, granularV2GrainSize: 50, granularV2Pan: 0.2, granularV2Gain: 0.35,
    granularV2PosLFORate: 0.033, granularV2PosLFODepth: 0.25,
    granularV2PanLFORate: 0.033, granularV2StereoSpread: 0.6,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.3, granularV2RecordLFORate: 0,
    // V3-V4: off
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: ON — rhythmic shimmer bursts (Microcosm Mosaic)
    granularEuclidMasterEnabled: true,
    granularEuclid1Enabled: true, granularEuclid1Steps: 16, granularEuclid1Hits: 5, granularEuclid1Rotation: 0,
    granularEuclid1Probability: 1.0, granularEuclid1VelocityMin: 0.6, granularEuclid1VelocityMax: 1.0, granularEuclid1Level: 0.8,
    granularEuclid2Enabled: true, granularEuclid2Steps: 16, granularEuclid2Hits: 7, granularEuclid2Rotation: 2,
    granularEuclid2Probability: 0.9, granularEuclid2VelocityMin: 0.5, granularEuclid2VelocityMax: 0.9, granularEuclid2Level: 0.6,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    // Delay: moderate activity for rhythmic shimmer
    granularDelayEnabled: true, granularDelayActivity: 0.45,
    granularDelayRepeats: 0.4, granularDelayFilter: 0.55,
    granularDelayVibrato: 0.25, granularDelayMix: 0.35, granularDelayReverbSend: 0.35,
  },

  // ─── Flux Cloud: Fors Opal Flux-style always-recording spray ───
  flux_cloud: {
    granularEnabled: true,
    granularDryWet: 0.45,
    granularFeedback: 0.1,
    granularFeedbackLPF: 6000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.5, granularMacroComplexity: 0.3,
    granularMacroDarkness: 0.25, granularMacroChaos: 0.1,
    // V1: granular, spray-focused
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.02, granularV1Decay: 0.6,
    granularV1Blur: 0.6, granularV1GrainOct: 0.3, granularV1Spray: 0.5,
    granularV1Density: 16, granularV1GrainSize: 100, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0.067, granularV1PosLFODepth: 0.4,
    granularV1PanLFORate: 0.05, granularV1StereoSpread: 0.5,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.5, granularV1RecordLFORate: 0.067,
    // V2: off
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous cloud)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    // Delay: minimal
    granularDelayEnabled: true, granularDelayActivity: 0.1,
    granularDelayRepeats: 0.25, granularDelayFilter: 0.5,
    granularDelayVibrato: 0.1, granularDelayMix: 0.2, granularDelayReverbSend: 0.3,
  },

  // ─── Self-Generating: Feedback drone, high LFOs, evolving ───
  self_generating: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.65,
    granularFeedbackLPF: 3000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.7, granularMacroComplexity: 0.7,
    granularMacroDarkness: 0.5, granularMacroChaos: 0.3,
    // V1: granular, high feedback + LFOs
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 0.5, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.1, granularV1Decay: 2.0,
    granularV1Blur: 0.7, granularV1GrainOct: 0.3, granularV1Spray: 0.4,
    granularV1Density: 8, granularV1GrainSize: 250, granularV1Pan: -0.3, granularV1Gain: 0.4,
    granularV1PosLFORate: 0.167, granularV1PosLFODepth: 0.6,
    granularV1PanLFORate: 0.1, granularV1StereoSpread: 0.5,
    granularV1ReverseLFORate: 0.067, granularV1WriteFollow: 0.4, granularV1RecordLFORate: 0.1,
    // V2: clean, slow reverse
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 8, granularV2Speed: 0.3, granularV2Reverse: true,
    granularV2Pitch: -12, granularV2Attack: 1.0, granularV2Decay: 3.0,
    granularV2Blur: 0.8, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.3, granularV2Gain: 0.3,
    granularV2PosLFORate: 0.133, granularV2PosLFODepth: 0.7,
    granularV2PanLFORate: 0.067, granularV2StereoSpread: 0.4,
    granularV2ReverseLFORate: 0.05, granularV2WriteFollow: 0.3, granularV2RecordLFORate: 0.083,
    // V3-V4: off
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous feedback drone)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    // Delay: moderate, dark
    granularDelayEnabled: true, granularDelayActivity: 0.3,
    granularDelayRepeats: 0.6, granularDelayFilter: 0.3,
    granularDelayVibrato: 0.3, granularDelayMix: 0.3, granularDelayReverbSend: 0.4,
  },

  // ─── Tape Loop: Clean dual-voice LFO scan — authentic tape warble through full buffer ───
  tape_loop: {
    granularEnabled: true,
    granularDryWet: 0.45,
    granularFeedback: 0.1,
    granularFeedbackLPF: 3500,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.35,
    granularMacroTexture: 0.2, granularMacroComplexity: 0.1,
    granularMacroDarkness: 0.4, granularMacroChaos: 0,
    // V1: slow LFO scan through full buffer (long arc, ~45s cycle)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.3, granularV1Decay: 1.5,
    granularV1Blur: 0.15, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: -0.15, granularV1Gain: 0.4,
    granularV1PosLFORate: 0.147, granularV1PosLFODepth: 0.85,
    granularV1PanLFORate: 0.067, granularV1StereoSpread: 0.2,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0, granularV1RecordLFORate: 0.1,
    // V2: offset scan phase, slightly different rate for evolving texture
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.5, granularV2Decay: 2.0,
    granularV2Blur: 0.2, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.15, granularV2Gain: 0.3,
    granularV2PosLFORate: 0.107, granularV2PosLFODepth: 0.85,
    granularV2PanLFORate: 0.05, granularV2StereoSpread: 0.2,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0, granularV2RecordLFORate: 0.067,
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous tape delay)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.15,
    granularDelayRepeats: 0.35, granularDelayFilter: 0.35,
    granularDelayVibrato: 0.2, granularDelayMix: 0.35, granularDelayReverbSend: 0.3,
  },

  // ─── Shimmer Pad: Dense grain clouds with octave shimmer ───
  shimmer_pad: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.15,
    granularFeedbackLPF: 6000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.7, granularMacroComplexity: 0.3,
    granularMacroDarkness: 0.1, granularMacroChaos: 0.15,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.05, granularV1Decay: 1.5,
    granularV1Blur: 0.5, granularV1GrainOct: 0.7, granularV1Spray: 0.3,
    granularV1Density: 24, granularV1GrainSize: 100, granularV1Pan: 0, granularV1Gain: 0.45,
    granularV1PosLFORate: 0.05, granularV1PosLFODepth: 0.3,
    granularV1PanLFORate: 0.04, granularV1StereoSpread: 0.6,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.2, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous shimmer cloud)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.3,
    granularDelayRepeats: 0.35, granularDelayFilter: 0.5,
    granularDelayVibrato: 0.2, granularDelayMix: 0.3, granularDelayReverbSend: 0.4,
  },

  // ─── Glitch Chop: Aggressive stutter with high density bursts ───
  glitch_chop: {
    granularEnabled: true,
    granularDryWet: 0.55,
    granularFeedback: 0.05,
    granularFeedbackLPF: 8000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.1, granularMacroComplexity: 0.2,
    granularMacroDarkness: 0, granularMacroChaos: 0.6,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.003, granularV1Decay: 0.05,
    granularV1Blur: 0, granularV1GrainOct: 0.1, granularV1Spray: 0.1,
    granularV1Density: 4, granularV1GrainSize: 30, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0,
    granularV1PanLFORate: 0, granularV1StereoSpread: 0.3,
    granularV1ReverseLFORate: 0.133, granularV1WriteFollow: 0.7, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: ON — aggressive chop patterns
    granularEuclidMasterEnabled: true,
    granularEuclid1Enabled: true, granularEuclid1Steps: 16, granularEuclid1Hits: 3, granularEuclid1Rotation: 0,
    granularEuclid1Probability: 0.85, granularEuclid1VelocityMin: 0.7, granularEuclid1VelocityMax: 1.0, granularEuclid1Level: 0.9,
    granularEuclid2Enabled: false, granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: false,
  },

  // ─── Ambient Wash: Soft diffused texture with full-buffer scan ───
  ambient_wash: {
    granularEnabled: true,
    granularDryWet: 0.4,
    granularFeedback: 0.15,
    granularFeedbackLPF: 3000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.5,
    granularMacroTexture: 0.6, granularMacroComplexity: 0.4,
    granularMacroDarkness: 0.5, granularMacroChaos: 0.05,
    // V1: slow LFO scan — continuous wash through full buffer (~30s cycle)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.5, granularV1Decay: 3.0,
    granularV1Blur: 0.35, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: -0.2, granularV1Gain: 0.4,
    granularV1PosLFORate: 0.22, granularV1PosLFODepth: 0.9,
    granularV1PanLFORate: 0.05, granularV1StereoSpread: 0.4,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0, granularV1RecordLFORate: 0.1,
    // V2: slower scan for depth, quieter
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.8, granularV2Decay: 4.0,
    granularV2Blur: 0.4, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.2, granularV2Gain: 0.25,
    granularV2PosLFORate: 0.107, granularV2PosLFODepth: 0.9,
    granularV2PanLFORate: 0.033, granularV2StereoSpread: 0.5,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0, granularV2RecordLFORate: 0.067,
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous ambient wash)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.2,
    granularDelayRepeats: 0.4, granularDelayFilter: 0.3,
    granularDelayVibrato: 0.2, granularDelayMix: 0.3, granularDelayReverbSend: 0.5,
  },

  // ─── Stutter: Rapid micro-chop effect ───
  stutter: {
    granularEnabled: true,
    granularDryWet: 0.6,
    granularFeedback: 0,
    granularFeedbackLPF: 8000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0, granularMacroComplexity: 0,
    granularMacroDarkness: 0, granularMacroChaos: 0.3,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.003, granularV1Decay: 0.03,
    granularV1Blur: 0, granularV1GrainOct: 0, granularV1Spray: 0.05,
    granularV1Density: 2, granularV1GrainSize: 20, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0,
    granularV1PanLFORate: 0, granularV1StereoSpread: 0.2,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.9, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: ON — rapid-fire micro stutter
    granularEuclidMasterEnabled: true,
    granularEuclid1Enabled: true, granularEuclid1Steps: 16, granularEuclid1Hits: 8, granularEuclid1Rotation: 0,
    granularEuclid1Probability: 1.0, granularEuclid1VelocityMin: 0.8, granularEuclid1VelocityMax: 1.0, granularEuclid1Level: 0.9,
    granularEuclid2Enabled: false, granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: false,
  },

  // ─── Reverse Cloud: Reversed grain texture ───
  reverse_cloud: {
    granularEnabled: true,
    granularDryWet: 0.45,
    granularFeedback: 0.15,
    granularFeedbackLPF: 5000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.45, granularMacroComplexity: 0.3,
    granularMacroDarkness: 0.2, granularMacroChaos: 0.2,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: true,
    granularV1Pitch: 0, granularV1Attack: 0.05, granularV1Decay: 1.0,
    granularV1Blur: 0.4, granularV1GrainOct: 0.2, granularV1Spray: 0.35,
    granularV1Density: 14, granularV1GrainSize: 120, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0.067, granularV1PosLFODepth: 0.3,
    granularV1PanLFORate: 0.05, granularV1StereoSpread: 0.5,
    granularV1ReverseLFORate: 0.017, granularV1WriteFollow: 0.3, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous reverse cloud)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.25,
    granularDelayRepeats: 0.3, granularDelayFilter: 0.5,
    granularDelayVibrato: 0.1, granularDelayMix: 0.25, granularDelayReverbSend: 0.35,
  },

  // ─── Drone Freeze: Frozen buffer with feedback drone ───
  drone_freeze: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.7,
    granularFeedbackLPF: 2000,
    granularFreeze: true,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.8, granularMacroComplexity: 0.6,
    granularMacroDarkness: 0.6, granularMacroChaos: 0.1,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 0.25, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.5, granularV1Decay: 3.0,
    granularV1Blur: 0.9, granularV1GrainOct: 0.2, granularV1Spray: 0.5,
    granularV1Density: 10, granularV1GrainSize: 350, granularV1Pan: 0, granularV1Gain: 0.45,
    granularV1PosLFORate: 0.133, granularV1PosLFODepth: 0.7,
    granularV1PanLFORate: 0.067, granularV1StereoSpread: 0.5,
    granularV1ReverseLFORate: 0.027, granularV1WriteFollow: 0, granularV1RecordLFORate: 0,
    // V2: clean, LFO scan through full frozen buffer (entire landscape)
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2Pitch: -12, granularV2Attack: 1.0, granularV2Decay: 4.0,
    granularV2Blur: 0.5, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0, granularV2Gain: 0.3,
    granularV2PosLFORate: 0.1, granularV2PosLFODepth: 0.9,
    granularV2PanLFORate: 0.05, granularV2StereoSpread: 0.4,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0, granularV2RecordLFORate: 0,
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous frozen drone)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.2,
    granularDelayRepeats: 0.6, granularDelayFilter: 0.25,
    granularDelayVibrato: 0.3, granularDelayMix: 0.25, granularDelayReverbSend: 0.5,
  },

  // ─── Polyrhythm: Euclidean-driven multi-voice pattern ───
  polyrhythm: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.1,
    granularFeedbackLPF: 6000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.3, granularMacroComplexity: 0.5,
    granularMacroDarkness: 0.15, granularMacroChaos: 0.2,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.01, granularV1Decay: 0.3,
    granularV1Blur: 0.2, granularV1GrainOct: 0.2, granularV1Spray: 0.1,
    granularV1Density: 8, granularV1GrainSize: 60, granularV1Pan: -0.4, granularV1Gain: 0.5,
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0,
    granularV1PanLFORate: 0, granularV1StereoSpread: 0.3,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.5, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 1, granularV2Reverse: false,
    granularV2Pitch: 7, granularV2Attack: 0.01, granularV2Decay: 0.25,
    granularV2Blur: 0.15, granularV2GrainOct: 0.15, granularV2Spray: 0.1,
    granularV2Density: 6, granularV2GrainSize: 50, granularV2Pan: 0.4, granularV2Gain: 0.4,
    granularV2PosLFORate: 0, granularV2PosLFODepth: 0,
    granularV2PanLFORate: 0, granularV2StereoSpread: 0.3,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.5, granularV2RecordLFORate: 0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 1, granularV3Reverse: true,
    granularV3Pitch: -5, granularV3Attack: 0.01, granularV3Decay: 0.2,
    granularV3Blur: 0.1, granularV3GrainOct: 0.1, granularV3Spray: 0.15,
    granularV3Density: 5, granularV3GrainSize: 40, granularV3Pan: 0, granularV3Gain: 0.35,
    granularV3PosLFORate: 0, granularV3PosLFODepth: 0,
    granularV3PanLFORate: 0, granularV3StereoSpread: 0.3,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.5, granularV3RecordLFORate: 0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 1, granularV4Reverse: false,
    granularV4Pitch: 7, granularV4Attack: 0.01, granularV4Decay: 0.15,
    granularV4Blur: 0.05, granularV4GrainOct: 0.05, granularV4Spray: 0.1,
    granularV4Density: 4, granularV4GrainSize: 35, granularV4Pan: 0.3, granularV4Gain: 0.3,
    granularV4PosLFORate: 0, granularV4PosLFODepth: 0,
    granularV4PanLFORate: 0, granularV4StereoSpread: 0.3,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.5, granularV4RecordLFORate: 0,
    // Euclidean: ON — 4-voice polyrhythm, each lane at a different step count
    granularEuclidMasterEnabled: true,
    granularEuclid1Enabled: true, granularEuclid1Steps: 16, granularEuclid1Hits: 5, granularEuclid1Rotation: 0,
    granularEuclid1Probability: 1.0, granularEuclid1VelocityMin: 0.6, granularEuclid1VelocityMax: 1.0, granularEuclid1Level: 0.8,
    granularEuclid2Enabled: true, granularEuclid2Steps: 12, granularEuclid2Hits: 7, granularEuclid2Rotation: 1,
    granularEuclid2Probability: 1.0, granularEuclid2VelocityMin: 0.5, granularEuclid2VelocityMax: 0.9, granularEuclid2Level: 0.6,
    granularEuclid3Enabled: true, granularEuclid3Steps: 8, granularEuclid3Hits: 3, granularEuclid3Rotation: 0,
    granularEuclid3Probability: 0.9, granularEuclid3VelocityMin: 0.7, granularEuclid3VelocityMax: 1.0, granularEuclid3Level: 0.7,
    granularEuclid4Enabled: true, granularEuclid4Steps: 16, granularEuclid4Hits: 11, granularEuclid4Rotation: 3,
    granularEuclid4Probability: 0.85, granularEuclid4VelocityMin: 0.4, granularEuclid4VelocityMax: 0.8, granularEuclid4Level: 0.5,
    granularDelayEnabled: true, granularDelayActivity: 0.35,
    granularDelayRepeats: 0.25, granularDelayFilter: 0.6,
    granularDelayVibrato: 0, granularDelayMix: 0.25, granularDelayReverbSend: 0.25,
  },

  // ─── Scatter: Random spray with wide stereo ───
  scatter: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.1,
    granularFeedbackLPF: 7000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.4, granularMacroComplexity: 0.3,
    granularMacroDarkness: 0.1, granularMacroChaos: 0.5,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.01, granularV1Decay: 0.4,
    granularV1Blur: 0.2, granularV1GrainOct: 0.25, granularV1Spray: 0.7,
    granularV1Density: 10, granularV1GrainSize: 70, granularV1Pan: 0, granularV1Gain: 0.5,
    granularV1PosLFORate: 0.033, granularV1PosLFODepth: 0.2,
    granularV1PanLFORate: 0.067, granularV1StereoSpread: 0.8,
    granularV1ReverseLFORate: 0.067, granularV1WriteFollow: 0.4, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: ON — sparse random scatter
    granularEuclidMasterEnabled: true,
    granularEuclid1Enabled: true, granularEuclid1Steps: 16, granularEuclid1Hits: 6, granularEuclid1Rotation: 0,
    granularEuclid1Probability: 0.7, granularEuclid1VelocityMin: 0.4, granularEuclid1VelocityMax: 1.0, granularEuclid1Level: 0.8,
    granularEuclid2Enabled: false, granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.4,
    granularDelayRepeats: 0.3, granularDelayFilter: 0.55,
    granularDelayVibrato: 0.15, granularDelayMix: 0.3, granularDelayReverbSend: 0.3,
  },

  // ─── Warm Delay: Full-buffer LFO scan with dark tape character ───
  warm_delay: {
    granularEnabled: true,
    granularDryWet: 0.4,
    granularFeedback: 0.1,
    granularFeedbackLPF: 2500,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.35,
    granularMacroTexture: 0.15, granularMacroComplexity: 0.1,
    granularMacroDarkness: 0.6, granularMacroChaos: 0,
    // V1: slow LFO scan — evolving warm tape echo (~55s cycle)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.3, granularV1Decay: 2.0,
    granularV1Blur: 0.1, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: 0, granularV1Gain: 0.45,
    granularV1PosLFORate: 0.12, granularV1PosLFODepth: 0.8,
    granularV1PanLFORate: 0.033, granularV1StereoSpread: 0.2,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0, granularV1RecordLFORate: 0.067,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous warm delay)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.15,
    granularDelayRepeats: 0.5, granularDelayFilter: 0.25,
    granularDelayVibrato: 0.25, granularDelayMix: 0.4, granularDelayReverbSend: 0.35,
  },

  // ─── Ice Crystals: High shimmer with pitch-up fragmentation ───
  ice_crystals: {
    granularEnabled: true,
    granularDryWet: 0.45,
    granularFeedback: 0.1,
    granularFeedbackLPF: 8000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.5, granularMacroComplexity: 0.35,
    granularMacroDarkness: 0, granularMacroChaos: 0.25,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 2, granularV1Reverse: false,
    granularV1Pitch: 12, granularV1Attack: 0.005, granularV1Decay: 0.3,
    granularV1Blur: 0.3, granularV1GrainOct: 0.9, granularV1Spray: 0.2,
    granularV1Density: 20, granularV1GrainSize: 40, granularV1Pan: -0.3, granularV1Gain: 0.4,
    granularV1PosLFORate: 0.067, granularV1PosLFODepth: 0.2,
    granularV1PanLFORate: 0.05, granularV1StereoSpread: 0.7,
    granularV1ReverseLFORate: 0.033, granularV1WriteFollow: 0.3, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 1.5, granularV2Reverse: false,
    granularV2Pitch: 24, granularV2Attack: 0.003, granularV2Decay: 0.15,
    granularV2Blur: 0.2, granularV2GrainOct: 1.0, granularV2Spray: 0.25,
    granularV2Density: 16, granularV2GrainSize: 30, granularV2Pan: 0.3, granularV2Gain: 0.25,
    granularV2PosLFORate: 0.05, granularV2PosLFODepth: 0.15,
    granularV2PanLFORate: 0.033, granularV2StereoSpread: 0.6,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.3, granularV2RecordLFORate: 0,
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous shimmer cloud)
    granularEuclidMasterEnabled: false,
    granularEuclid1Enabled: false, granularEuclid2Enabled: false,
    granularEuclid3Enabled: false, granularEuclid4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.5,
    granularDelayRepeats: 0.3, granularDelayFilter: 0.7,
    granularDelayVibrato: 0.1, granularDelayMix: 0.3, granularDelayReverbSend: 0.3,
  },

  // ─── Microcosm: Full 4-voice multi-tap delay + granular cascade ───
  microcosm: {
    granularEnabled: true,
    granularDryWet: 0.5,
    granularFeedback: 0.12,
    granularFeedbackLPF: 5000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularMacroTexture: 0.4, granularMacroComplexity: 0.5,
    granularMacroDarkness: 0.2, granularMacroChaos: 0.2,
    // V1: Root — rhythmic granular at original pitch, anchors the sound
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.01, granularV1Decay: 0.5,
    granularV1Blur: 0.25, granularV1GrainOct: 0.3, granularV1Spray: 0.15,
    granularV1Density: 14, granularV1GrainSize: 80, granularV1Pan: -0.3, granularV1Gain: 0.5,
    granularV1PosLFORate: 0.05, granularV1PosLFODepth: 0.2,
    granularV1PanLFORate: 0.033, granularV1StereoSpread: 0.4,
    granularV1ReverseLFORate: 0.017, granularV1WriteFollow: 0.4, granularV1RecordLFORate: 0.033,
    // V2: Shimmer — octave-up sparkle layer
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 1, granularV2Reverse: false,
    granularV2Pitch: 12, granularV2Attack: 0.015, granularV2Decay: 0.4,
    granularV2Blur: 0.35, granularV2GrainOct: 0.4, granularV2Spray: 0.2,
    granularV2Density: 10, granularV2GrainSize: 65, granularV2Pan: 0.3, granularV2Gain: 0.3,
    granularV2PosLFORate: 0.033, granularV2PosLFODepth: 0.2,
    granularV2PanLFORate: 0.027, granularV2StereoSpread: 0.5,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.4, granularV2RecordLFORate: 0.033,
    // V3: Sub-harmony — fifth below, reversed grains for ethereal wash
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 1, granularV3Reverse: true,
    granularV3Pitch: -5, granularV3Attack: 0.02, granularV3Decay: 0.6,
    granularV3Blur: 0.4, granularV3GrainOct: 0.15, granularV3Spray: 0.25,
    granularV3Density: 8, granularV3GrainSize: 100, granularV3Pan: 0, granularV3Gain: 0.25,
    granularV3PosLFORate: 0.025, granularV3PosLFODepth: 0.3,
    granularV3PanLFORate: 0.02, granularV3StereoSpread: 0.6,
    granularV3ReverseLFORate: 0.012, granularV3WriteFollow: 0.3, granularV3RecordLFORate: 0.025,
    // V4: Texture — sparse high-pitch micro-grains for air/shimmer detail
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 1, granularV4Reverse: false,
    granularV4Pitch: 7, granularV4Attack: 0.005, granularV4Decay: 0.2,
    granularV4Blur: 0.2, granularV4GrainOct: 0.6, granularV4Spray: 0.3,
    granularV4Density: 6, granularV4GrainSize: 45, granularV4Pan: -0.1, granularV4Gain: 0.2,
    granularV4PosLFORate: 0.04, granularV4PosLFODepth: 0.15,
    granularV4PanLFORate: 0.035, granularV4StereoSpread: 0.7,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.5, granularV4RecordLFORate: 0.04,
    // Euclidean: 4 lanes — interlocking polyrhythms, each voice gated independently
    granularEuclidMasterEnabled: true,
    granularEuclid1Enabled: true, granularEuclid1Steps: 16, granularEuclid1Hits: 5, granularEuclid1Rotation: 0,
    granularEuclid1Probability: 1.0, granularEuclid1VelocityMin: 0.6, granularEuclid1VelocityMax: 1.0, granularEuclid1Level: 0.8,
    granularEuclid2Enabled: true, granularEuclid2Steps: 16, granularEuclid2Hits: 3, granularEuclid2Rotation: 1,
    granularEuclid2Probability: 0.9, granularEuclid2VelocityMin: 0.5, granularEuclid2VelocityMax: 0.85, granularEuclid2Level: 0.6,
    granularEuclid3Enabled: true, granularEuclid3Steps: 12, granularEuclid3Hits: 4, granularEuclid3Rotation: 2,
    granularEuclid3Probability: 0.85, granularEuclid3VelocityMin: 0.5, granularEuclid3VelocityMax: 0.9, granularEuclid3Level: 0.65,
    granularEuclid4Enabled: true, granularEuclid4Steps: 8, granularEuclid4Hits: 3, granularEuclid4Rotation: 0,
    granularEuclid4Probability: 0.8, granularEuclid4VelocityMin: 0.4, granularEuclid4VelocityMax: 0.8, granularEuclid4Level: 0.5,
    // Delay: moderate activity (feedback now normalized, safe at higher values)
    granularDelayEnabled: true, granularDelayActivity: 0.55,
    granularDelayRepeats: 0.4, granularDelayFilter: 0.45,
    granularDelayVibrato: 0.12, granularDelayMix: 0.35, granularDelayReverbSend: 0.35,
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
 * Only rhythmic presets have entries; non-rhythmic presets return undefined from getGranularPresetSeqConfig.
 */
const GRANULAR_SEQ_CONFIG_MAP: Record<string, GranularPresetSeqConfig> = {

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
