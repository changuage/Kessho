/**
 * Granular preset data — Partial SliderState overrides for each reference preset.
 *
 * Based on the granular_update.md implementation plan's reference presets:
 *  - Loop Forest (ZOIA): 4 clean voices, slow LFOs, blur
 *  - Mood Slip (Chase Bliss): Granular micro-loop stretch
 *  - Mosaic A/B/C/D (Microcosm): octave-up, octave-down, shimmer, wide spread
 *  - Flux Cloud (Fors Opal): Always-recording, spray, blur
 *  - Self-Generating: Feedback drone, LFOs, evolving
 *  - Legacy Cloud: Replicates original granulator.worklet.ts
 */

// Partial state override — only granular-specific keys
export type GranularPresetData = Record<string, unknown>;

export interface GranularPresetOption {
  id: string;
  name: string;
  group: 'Utility' | 'Reference Targets' | 'Ambient & Experimental' | 'Rhythmic';
  description: string;
  tags: string[];
}

export const GRANULAR_DELAY_B_STATE_KEYS = [
  'granularDelayEnabled',
  'granularDelayActivity',
  'granularDelayRepeats',
  'granularDelayTime',
  'granularDelayFilter',
  'granularDelayVibrato',
  'granularDelayBSend',
  'granularDelayReverbSend',
] as const;

const GRANULAR_DELAY_B_KEY_SET = new Set<string>(GRANULAR_DELAY_B_STATE_KEYS);

export function isGranularDelayBStateKey(key: string): boolean {
  return GRANULAR_DELAY_B_KEY_SET.has(key);
}

export const GRANULAR_PRESET_OPTIONS: GranularPresetOption[] = [
  { id: 'init', name: 'Init', group: 'Utility', description: 'Neutral starting point with no preset coloration.', tags: ['neutral', 'edit from scratch'] },
  { id: 'legacy_cloud', name: 'Legacy Cloud (Legacy)', group: 'Utility', description: 'Original legacy granulator branch for direct A/B comparison.', tags: ['legacy', 'single voice', 'compare'] },
  { id: 'classic_cloud', name: 'Classic Cloud (Granular)', group: 'Reference Targets', description: 'Four-voice granular rebuild of the old legacy cloud, tuned for side-by-side comparison.', tags: ['granular', 'legacy replacement', 'four voices'] },
  { id: 'loop_forest', name: 'Loop Forest (ZOIA)', group: 'Reference Targets', description: 'Four clean looper heads drifting through one shared buffer with diffuse bloom.', tags: ['clean voices', 'diffuse', 'sequencer off'] },
  { id: 'mosaic_a', name: 'Mosaic A (Octave Up)', group: 'Reference Targets', description: 'Clocked micro-loops with fixed 1x and 2x varispeed layers for a soft octave-up halo.', tags: ['microcosm', 'clocked', 'octave up'] },
  { id: 'mosaic_b', name: 'Mosaic B (Octave Down)', group: 'Reference Targets', description: 'Clocked micro-loops with fixed 1x and 0.5x layers for weight, counterpoint, and dark bloom.', tags: ['microcosm', 'clocked', 'octave down'] },
  { id: 'mosaic_c', name: 'Mosaic C (Shimmer)', group: 'Reference Targets', description: 'All-double-speed micro-loop layering with a gentler rising grain contour for airy shimmer.', tags: ['microcosm', 'clocked', 'shimmer'] },
  { id: 'mosaic_d', name: 'Mosaic D (Wide)', group: 'Reference Targets', description: 'Half, normal, double, and quad varispeed layers spread across the stereo field.', tags: ['microcosm', 'clocked', 'wide'] },
  { id: 'tape_loop', name: 'Tape Bloom', group: 'Reference Targets', description: 'Dual clean loop heads with gentle movement and warm tape-like space.', tags: ['clean voices', 'tape feel', 'sequencer off'] },
  { id: 'microcosm', name: 'Microcosm Wash', group: 'Reference Targets', description: 'A darker, fully-wet ambient bed built from clean loopers, slow granular air, and diffuse bloom.', tags: ['ambient', 'hybrid', 'diffuse'] },
  { id: 'microcosm_pulse', name: 'Microcosm Pulse', group: 'Reference Targets', description: 'Clocked shimmer cascade with freer pulse motion instead of hard tempo-gated grains.', tags: ['clocked', 'shimmer', 'motion'] },
  { id: 'mood_slip', name: 'Mood Slip Stretch', group: 'Reference Targets', description: 'Micro-loop stretch and smear inspired by short looping texture processors.', tags: ['micro-loop', 'smear', 'granular'] },
  { id: 'ambient_wash', name: 'Ambient Pad', group: 'Ambient & Experimental', description: 'Soft full-buffer wash tuned for broad pads and gentle movement.', tags: ['pad', 'diffuse', 'sequencer off'] },
  { id: 'flux_cloud', name: 'Flux Drift', group: 'Ambient & Experimental', description: 'Evolving cloud with more motion and instability than the pad-oriented presets.', tags: ['experimental', 'cloud', 'motion'] },
  { id: 'self_generating', name: 'Self-Generating Bloom', group: 'Ambient & Experimental', description: 'Feedback-led autonomous texture that keeps evolving once seeded.', tags: ['feedback', 'autonomous', 'ambient'] },
  { id: 'glitch_chop', name: 'Glitch Chop', group: 'Rhythmic', description: 'Aggressive rhythmic stutter with tempo-synced granular chopping.', tags: ['clocked', 'chop', 'tempo sync'] },
  { id: 'polyrhythm', name: 'Polyrhythmic Cascade', group: 'Rhythmic', description: 'Four-voice pulse cloud for musical interlocking rhythmic motion.', tags: ['clocked', 'polyrhythm', 'tempo sync'] },
];

/**
 * Get partial state overrides for a granular preset.
 * Returns undefined for 'init' (no-op: leaves current state as-is).
 */
export function getGranularPresetData(presetId: string): GranularPresetData | undefined {
  const preset = GRANULAR_PRESET_MAP[presetId];
  if (!preset) return undefined;

  const normalized: GranularPresetData = { ...preset };
  delete normalized.granularDryWet;
  for (const key of Object.keys(normalized)) {
    if (key.startsWith('granularEuclid')) {
      delete normalized[key];
    }
  }
  for (const voice of [1, 2, 3, 4]) {
    const modeKey = `granularV${voice}Mode`;
    const scanRateKey = `granularV${voice}ScanRate`;
    const tempoSyncKey = `granularV${voice}TempoSync`;
    const tempoDivKey = `granularV${voice}TempoDiv`;
    if (normalized[modeKey] === 'clean' && normalized[scanRateKey] == null) {
      normalized[scanRateKey] = 1.0;
    }
    if (normalized[tempoSyncKey] == null) {
      normalized[tempoSyncKey] = false;
    }
    if (normalized[tempoDivKey] == null) {
      normalized[tempoDivKey] = '1/8';
    }
  }
  return normalized;
}

/**
 * Recommended SliderMode overrides per granular preset.
 * Returns a Record<string, 'single' | 'walk' | 'sampleHold'> for the 3-mode slider system.
 * Returns undefined if no modes are defined (e.g., init).
 */
export function getGranularPresetSliderModes(presetId: string): Record<string, string> | undefined {
  return GRANULAR_SLIDER_MODES[presetId];
}

export function getGranularPresetMeta(presetId: string): GranularPresetOption | undefined {
  return GRANULAR_PRESET_OPTIONS.find(option => option.id === presetId);
}

export function getGranularPresetSuggestedDelayBGranularSend(presetId: string): number | undefined {
  const preset = GRANULAR_PRESET_MAP[presetId];
  if (!preset) return undefined;

  const explicit = preset.linkedDelayBGranularSend;
  if (typeof explicit === 'number') {
    return Math.max(0, Math.min(1, explicit));
  }

  if (preset.granularDelayEnabled !== true) {
    return 0;
  }

  // Until dedicated Delay B preset files exist, infer a conservative return amount
  // from the preset's own multitap balance so linked loads feel musical without
  // forcing extreme granular re-circulation.
  const send = typeof preset.granularDelayBSend === 'number' ? preset.granularDelayBSend : 0.3;
  const repeats = typeof preset.granularDelayRepeats === 'number' ? preset.granularDelayRepeats : 0.3;
  const inferred = Math.max(0.08, Math.min(0.35, (send * 0.45) + (repeats * 0.15)));
  return Math.round(inferred * 100) / 100;
}

// Per-voice param suffixes that benefit from generative modes
const WALK_PARAMS = ['Blur', 'Pan', 'Gain', 'PosLFORate', 'PosLFODepth', 'PanLFORate', 'WriteFollow'];
const SH_PARAMS = ['Spray', 'Density', 'GrainSize', 'Pitch', 'GrainOct', 'Speed'];
const MUSICAL_LOOP_SH_PARAMS: string[] = [];
const GENTLE_GRANULAR_SH_PARAMS = ['Density', 'GrainSize'];

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
  classic_cloud: {
    granularV3Gain: 'walk',
    granularV4Gain: 'walk',
  },
  loop_forest: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, []), // Clean voices: walk only, no S&H grain params
  mood_slip: buildVoiceModes([1], WALK_PARAMS, ['Speed']),
  // Mosaic family: Pitch stays fixed per voice to preserve the harmonic identity.
  mosaic_a: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, MUSICAL_LOOP_SH_PARAMS),
  mosaic_b: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, MUSICAL_LOOP_SH_PARAMS),
  mosaic_c: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, MUSICAL_LOOP_SH_PARAMS),
  mosaic_d: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, MUSICAL_LOOP_SH_PARAMS),
  flux_cloud: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  self_generating: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  tape_loop: buildVoiceModes([1, 2], WALK_PARAMS, []),
  shimmer_pad: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  glitch_chop: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  ambient_wash: buildVoiceModes([1, 2], WALK_PARAMS, GENTLE_GRANULAR_SH_PARAMS),
  stutter: buildVoiceModes([1], ['Gain'], ['Density', 'GrainSize', 'Speed']),
  reverse_cloud: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  drone_freeze: buildVoiceModes([1, 2], WALK_PARAMS, []),
  polyrhythm: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, SH_PARAMS),
  scatter: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  warm_delay: buildVoiceModes([1], WALK_PARAMS, []),
  ice_crystals: buildVoiceModes([1, 2], WALK_PARAMS, SH_PARAMS),
  microcosm: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, []),
  microcosm_pulse: buildVoiceModes([1, 2, 3, 4], WALK_PARAMS, MUSICAL_LOOP_SH_PARAMS),
};

const GRANULAR_PRESET_MAP: Record<string, GranularPresetData> = {
  // ─── Legacy Cloud: Replicates original granulator.worklet.ts ───
  legacy_cloud: {
    granularEnabled: true,
    granularSpaceMode: 'clocked',
    granularPresetBehavior: 'pure',
    granularShape: 'triangle',
    granularFeedback: 0.1,
    granularFeedbackLPF: 8000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularDiffusion: 0.32,
    granularReverbSend: 0.0,
    granularReverbLPF: 8000,
    granularOutputLPF: 12000,
    granularChordBias: 0.0,
    granularMacroActivity: 0.28,
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
    // Delay: minimal
    granularDelayEnabled: false,
  },

  // ─── Classic Cloud: standard granular rebuild of the legacy feel ───
  // Four decorrelated granular voices approximate the softer, probabilistic
  // legacy cloud without relying on the legacy DSP branch:
  // - V1 stays close to the write head for the body
  // - V2 reaches farther back for the wider trailing-memory feel
  // - V3 adds a quiet octave-above sheen with gain walk
  // - V4 adds a brighter 2x / +12 companion for extra upper shimmer
  classic_cloud: {
    granularEnabled: true,
    granularSpaceMode: 'diffuse',
    granularPresetBehavior: 'pure',
    granularShape: 'sawUp',
    granularFeedback: 0.1,
    granularFeedbackLPF: 8000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularDiffusion: 0.22,
    granularReverbSend: 0.0,
    granularReverbLPF: 8000,
    granularOutputLPF: 12000,
    // Keep Activity at zero because the current macro model drives density hard.
    // The other macros are nudged up a bit to better match the softened,
    // slightly diffuse legacy feel without changing the cloud rate too much.
    granularMacroActivity: 0.0,
    granularMacroTexture: 0.05,
    granularMacroComplexity: 0.02,
    granularMacroDarkness: 0.06,
    granularMacroChaos: 0.02,
    granularChordBias: 0.0,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1ScanRate: 1.0,
    granularV1Pitch: 0, granularV1Attack: 0.010, granularV1Decay: 0.46,
    granularV1Blur: 0.07, granularV1GrainOct: 0.0, granularV1Spray: 0.40,
    granularV1Density: 8, granularV1TempoSync: false, granularV1TempoDiv: '1/8',
    granularV1GrainSize: 134, granularV1Pan: -0.10, granularV1Gain: 0.33,
    granularV1PosLFORate: 0.0, granularV1PosLFODepth: 0.0, granularV1PanLFORate: 0.0,
    granularV1StereoSpread: 0.32, granularV1ReverseLFORate: 0.0,
    granularV1WriteFollow: 0.98, granularV1RecordLFORate: 0.0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 0, granularV2Speed: 1, granularV2Reverse: false,
    granularV2ScanRate: 1.0,
    granularV2Pitch: 0, granularV2Attack: 0.018, granularV2Decay: 0.68,
    granularV2Blur: 0.10, granularV2GrainOct: 0.0, granularV2Spray: 0.78,
    granularV2Density: 5, granularV2TempoSync: false, granularV2TempoDiv: '1/8',
    granularV2GrainSize: 157, granularV2Pan: 0.12, granularV2Gain: 0.20,
    granularV2PosLFORate: 0.0, granularV2PosLFODepth: 0.0, granularV2PanLFORate: 0.0,
    granularV2StereoSpread: 0.56, granularV2ReverseLFORate: 0.0,
    granularV2WriteFollow: 0.82, granularV2RecordLFORate: 0.0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 0, granularV3Speed: 1, granularV3Reverse: false,
    granularV3ScanRate: 1.0,
    granularV3Pitch: 12, granularV3Attack: 0.014, granularV3Decay: 0.40,
    granularV3Blur: 0.08, granularV3GrainOct: 0.0, granularV3Spray: 0.34,
    granularV3Density: 4, granularV3TempoSync: false, granularV3TempoDiv: '1/8',
    granularV3GrainSize: 109, granularV3Pan: 0.02, granularV3Gain: 0.10,
    granularV3PosLFORate: 0.0, granularV3PosLFODepth: 0.0, granularV3PanLFORate: 0.0,
    granularV3StereoSpread: 0.44, granularV3ReverseLFORate: 0.0,
    granularV3WriteFollow: 0.90, granularV3RecordLFORate: 0.0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 0, granularV4Speed: 2, granularV4Reverse: false,
    granularV4ScanRate: 1.0,
    granularV4Pitch: 12, granularV4Attack: 0.012, granularV4Decay: 0.34,
    granularV4Blur: 0.09, granularV4GrainOct: 0.0, granularV4Spray: 0.28,
    granularV4Density: 4, granularV4TempoSync: false, granularV4TempoDiv: '1/8',
    granularV4GrainSize: 110, granularV4Pan: -0.04, granularV4Gain: 0.10,
    granularV4PosLFORate: 0.0, granularV4PosLFODepth: 0.0, granularV4PanLFORate: 0.0,
    granularV4StereoSpread: 0.38, granularV4ReverseLFORate: 0.0,
    granularV4WriteFollow: 0.88, granularV4RecordLFORate: 0.0,
    granularDelayEnabled: false,
  },

  // ─── Loop Forest: 4 clean voices, harmonic scan rates, no grains ───
  // Inspired by ZOIA Loop Forest: 4 unsynced loopers with independent record/reverse/start timing
  // and consonant playback-speed relationships above the dry reference voice.
  loop_forest: {
    granularEnabled: true,
    granularSpaceMode: 'diffuse',
    granularPresetBehavior: 'pure',
    granularDiffusion: 0.32,
    granularFeedback: 0.04,
    granularFeedbackLPF: 2600,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.58,
    granularReverbLPF: 2300,
    granularOutputLPF: 6200,
    granularMacroTexture: 0.08, granularMacroComplexity: 0.08,
    granularMacroDarkness: 0.18, granularMacroChaos: 0.04,
    // V1: ZOIA-style LFO scan — speed=0, sine LFO IS the playhead (18.5s cycle, 96% depth)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1ScanRate: 1.0,
    granularV1Pitch: 0, granularV1Attack: 0.5, granularV1Decay: 2.0,
    granularV1Blur: 0.3, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: -0.3, granularV1Gain: 0.35,
    granularV1PosLFORate: 0.36, granularV1PosLFODepth: 0.96,
    granularV1PanLFORate: 0.387, granularV1StereoSpread: 0.3,
    granularV1ReverseLFORate: 0.0328, granularV1WriteFollow: 0, granularV1RecordLFORate: 0.022,
    // V2: ZOIA-style LFO scan — speed=0, separate phase from V1
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2ScanRate: 1.5,
    granularV2Pitch: 0, granularV2Attack: 0.8, granularV2Decay: 2.5,
    granularV2Blur: 0.35, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.3, granularV2Gain: 0.35,
    granularV2PosLFORate: 0.36, granularV2PosLFODepth: 0.96,
    granularV2PanLFORate: 0.78, granularV2StereoSpread: 0.3,
    granularV2ReverseLFORate: 0.0639, granularV2WriteFollow: 0, granularV2RecordLFORate: 0.0409,
    // V3: ZOIA-style LFO scan — slower position sweep (63s cycle), quieter
    granularV3Enabled: true, granularV3Mode: 'clean',
    granularV3Slice: 0, granularV3Speed: 0, granularV3Reverse: false,
    granularV3ScanRate: 2.0,
    granularV3Pitch: 0, granularV3Attack: 1.0, granularV3Decay: 3.0,
    granularV3Blur: 0.4, granularV3GrainOct: 0, granularV3Spray: 0,
    granularV3Density: 20, granularV3GrainSize: 80, granularV3Pan: -0.5, granularV3Gain: 0.2,
    granularV3PosLFORate: 0.107, granularV3PosLFODepth: 0.96,
    granularV3PanLFORate: 0.66, granularV3StereoSpread: 0.4,
    granularV3ReverseLFORate: 0.0639, granularV3WriteFollow: 0, granularV3RecordLFORate: 0.0409,
    // V4: ZOIA-style LFO scan — medium sweep (35s cycle, 96% depth), quieter
    granularV4Enabled: true, granularV4Mode: 'clean',
    granularV4Slice: 0, granularV4Speed: 0, granularV4Reverse: false,
    granularV4ScanRate: 4.0,
    granularV4Pitch: 0, granularV4Attack: 0.6, granularV4Decay: 2.0,
    granularV4Blur: 0.25, granularV4GrainOct: 0, granularV4Spray: 0,
    granularV4Density: 20, granularV4GrainSize: 80, granularV4Pan: 0.31, granularV4Gain: 0.2,
    granularV4PosLFORate: 0.193, granularV4PosLFODepth: 0.96,
    granularV4PanLFORate: 0.707, granularV4StereoSpread: 0.3,
    granularV4ReverseLFORate: 0.0663, granularV4WriteFollow: 0, granularV4RecordLFORate: 0.1276,
    // Euclidean: OFF (continuous clean playback, drift-based)
    // Delay: ZOIA-style warm tape delay (high mix, high reverb send for diffusion)
    granularDelayEnabled: true, granularDelayActivity: 0.28,
    granularDelayRepeats: 0.52, granularDelayFilter: 0.38,
    granularDelayVibrato: 0.16, granularDelayBSend: 0.52, granularDelayReverbSend: 0.62,
  },

  // ─── Mood Slip: Granular micro-loop stretch (Chase Bliss Mood) ───
  mood_slip: {
    granularEnabled: true,
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
    // Delay: slap-back
    granularDelayEnabled: true, granularDelayActivity: 0.15,
    granularDelayRepeats: 0.5, granularDelayFilter: 0.45,
    granularDelayVibrato: 0.1, granularDelayBSend: 0.3, granularDelayReverbSend: 0.4,
  },

  // ─── Mosaic A: octave-up rhythmic doubling ───
  mosaic_a: {
    granularEnabled: true,
    granularSpaceMode: 'clocked',
    granularPresetBehavior: 'pure',
    granularShape: 'triangle',
    granularDiffusion: 0.62,
    granularMacroActivity: 0.10,
    granularFeedback: 0.05,
    granularFeedbackLPF: 4600,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.46,
    granularReverbLPF: 3200,
    granularOutputLPF: 7600,
    granularMacroTexture: 0.06, granularMacroComplexity: 0.06,
    granularMacroDarkness: 0.14, granularMacroChaos: 0.02,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.050, granularV1Decay: 0.95,
    granularV1Blur: 0.26, granularV1GrainOct: 0, granularV1Spray: 0.52,
    granularV1Density: 3, granularV1GrainSize: 220, granularV1Pan: -0.35, granularV1Gain: 0.34,
    granularV1TempoSync: false, granularV1TempoDiv: '1/8',
    granularV1PosLFORate: 0.050, granularV1PosLFODepth: 0.42, granularV1PanLFORate: 0.012, granularV1StereoSpread: 0.45,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.10, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 2, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.045, granularV2Decay: 0.82,
    granularV2Blur: 0.30, granularV2GrainOct: 0, granularV2Spray: 0.58,
    granularV2Density: 3, granularV2GrainSize: 180, granularV2Pan: 0.32, granularV2Gain: 0.25,
    granularV2TempoSync: false, granularV2TempoDiv: '1/8',
    granularV2PosLFORate: 0.061, granularV2PosLFODepth: 0.50, granularV2PanLFORate: 0.015, granularV2StereoSpread: 0.50,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.10, granularV2RecordLFORate: 0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 1, granularV3Reverse: false,
    granularV3Pitch: 0, granularV3Attack: 0.070, granularV3Decay: 1.20,
    granularV3Blur: 0.34, granularV3GrainOct: 0, granularV3Spray: 0.64,
    granularV3Density: 2, granularV3GrainSize: 280, granularV3Pan: -0.12, granularV3Gain: 0.20,
    granularV3TempoSync: false, granularV3TempoDiv: '1/4',
    granularV3PosLFORate: 0.037, granularV3PosLFODepth: 0.62, granularV3PanLFORate: 0.01, granularV3StereoSpread: 0.42,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.08, granularV3RecordLFORate: 0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 2, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.042, granularV4Decay: 0.74,
    granularV4Blur: 0.32, granularV4GrainOct: 0, granularV4Spray: 0.70,
    granularV4Density: 3, granularV4GrainSize: 170, granularV4Pan: 0.14, granularV4Gain: 0.16,
    granularV4TempoSync: false, granularV4TempoDiv: '1/16',
    granularV4PosLFORate: 0.083, granularV4PosLFODepth: 0.54, granularV4PanLFORate: 0.012, granularV4StereoSpread: 0.52,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.08, granularV4RecordLFORate: 0,
    granularDelayEnabled: false, granularDelayActivity: 0.42,
    granularDelayRepeats: 0.36, granularDelayFilter: 0.44,
    granularDelayVibrato: 0.07, granularDelayBSend: 0.28, granularDelayReverbSend: 0.5,
  },

  // ─── Mosaic B: octave-down foundation ───
  mosaic_b: {
    granularEnabled: true,
    granularSpaceMode: 'clocked',
    granularPresetBehavior: 'pure',
    granularShape: 'triangle',
    granularDiffusion: 0.66,
    granularMacroActivity: 0.10,
    granularFeedback: 0.06,
    granularFeedbackLPF: 3600,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.5,
    granularReverbLPF: 2800,
    granularOutputLPF: 6200,
    granularMacroTexture: 0.06, granularMacroComplexity: 0.05,
    granularMacroDarkness: 0.22, granularMacroChaos: 0.02,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.060, granularV1Decay: 1.05,
    granularV1Blur: 0.30, granularV1GrainOct: 0, granularV1Spray: 0.56,
    granularV1Density: 3, granularV1GrainSize: 260, granularV1Pan: -0.32, granularV1Gain: 0.32,
    granularV1TempoSync: false, granularV1TempoDiv: '1/8',
    granularV1PosLFORate: 0.043, granularV1PosLFODepth: 0.46, granularV1PanLFORate: 0.01, granularV1StereoSpread: 0.44,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.10, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 0.5, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.080, granularV2Decay: 1.45,
    granularV2Blur: 0.36, granularV2GrainOct: 0, granularV2Spray: 0.66,
    granularV2Density: 2, granularV2GrainSize: 340, granularV2Pan: 0.28, granularV2Gain: 0.30,
    granularV2TempoSync: false, granularV2TempoDiv: '1/4',
    granularV2PosLFORate: 0.030, granularV2PosLFODepth: 0.64, granularV2PanLFORate: 0.013, granularV2StereoSpread: 0.50,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.08, granularV2RecordLFORate: 0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 1, granularV3Reverse: false,
    granularV3Pitch: 0, granularV3Attack: 0.055, granularV3Decay: 0.95,
    granularV3Blur: 0.32, granularV3GrainOct: 0, granularV3Spray: 0.60,
    granularV3Density: 3, granularV3GrainSize: 240, granularV3Pan: -0.1, granularV3Gain: 0.21,
    granularV3TempoSync: false, granularV3TempoDiv: '1/8T',
    granularV3PosLFORate: 0.052, granularV3PosLFODepth: 0.50, granularV3PanLFORate: 0.01, granularV3StereoSpread: 0.40,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.08, granularV3RecordLFORate: 0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 0.5, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.075, granularV4Decay: 1.32,
    granularV4Blur: 0.34, granularV4GrainOct: 0, granularV4Spray: 0.72,
    granularV4Density: 2, granularV4GrainSize: 310, granularV4Pan: 0.12, granularV4Gain: 0.20,
    granularV4TempoSync: false, granularV4TempoDiv: '1/16',
    granularV4PosLFORate: 0.034, granularV4PosLFODepth: 0.58, granularV4PanLFORate: 0.012, granularV4StereoSpread: 0.44,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.08, granularV4RecordLFORate: 0,
    granularDelayEnabled: false, granularDelayActivity: 0.4,
    granularDelayRepeats: 0.4, granularDelayFilter: 0.38,
    granularDelayVibrato: 0.05, granularDelayBSend: 0.3, granularDelayReverbSend: 0.52,
  },

  // ─── Mosaic C: bright dense shimmer ───
  mosaic_c: {
    granularEnabled: true,
    granularSpaceMode: 'clocked',
    granularPresetBehavior: 'pure',
    granularShape: 'sawUp',
    granularDiffusion: 0.58,
    granularMacroActivity: 0.12,
    granularFeedback: 0.08,
    granularFeedbackLPF: 5200,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.44,
    granularReverbLPF: 4200,
    granularOutputLPF: 8400,
    granularMacroTexture: 0.08, granularMacroComplexity: 0.08,
    granularMacroDarkness: 0.08, granularMacroChaos: 0.03,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 2, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.040, granularV1Decay: 0.72,
    granularV1Blur: 0.36, granularV1GrainOct: 0, granularV1Spray: 0.54,
    granularV1Density: 4, granularV1GrainSize: 170, granularV1Pan: -0.32, granularV1Gain: 0.25,
    granularV1TempoSync: false, granularV1TempoDiv: '1/16',
    granularV1PosLFORate: 0.057, granularV1PosLFODepth: 0.48, granularV1PanLFORate: 0.016, granularV1StereoSpread: 0.50,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.10, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 2, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.036, granularV2Decay: 0.66,
    granularV2Blur: 0.40, granularV2GrainOct: 0, granularV2Spray: 0.62,
    granularV2Density: 4, granularV2GrainSize: 150, granularV2Pan: 0.18, granularV2Gain: 0.24,
    granularV2TempoSync: false, granularV2TempoDiv: '1/16',
    granularV2PosLFORate: 0.070, granularV2PosLFODepth: 0.54, granularV2PanLFORate: 0.018, granularV2StereoSpread: 0.56,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.10, granularV2RecordLFORate: 0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 2, granularV3Reverse: false,
    granularV3Pitch: 0, granularV3Attack: 0.032, granularV3Decay: 0.60,
    granularV3Blur: 0.44, granularV3GrainOct: 0, granularV3Spray: 0.68,
    granularV3Density: 4, granularV3GrainSize: 135, granularV3Pan: 0.36, granularV3Gain: 0.18,
    granularV3TempoSync: false, granularV3TempoDiv: '1/8T',
    granularV3PosLFORate: 0.047, granularV3PosLFODepth: 0.62, granularV3PanLFORate: 0.02, granularV3StereoSpread: 0.64,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.08, granularV3RecordLFORate: 0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 2, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.038, granularV4Decay: 0.68,
    granularV4Blur: 0.40, granularV4GrainOct: 0, granularV4Spray: 0.58,
    granularV4Density: 4, granularV4GrainSize: 155, granularV4Pan: -0.08, granularV4Gain: 0.22,
    granularV4TempoSync: false, granularV4TempoDiv: '1/8',
    granularV4PosLFORate: 0.066, granularV4PosLFODepth: 0.50, granularV4PanLFORate: 0.017, granularV4StereoSpread: 0.54,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.10, granularV4RecordLFORate: 0,
    granularDelayEnabled: false, granularDelayActivity: 0.48,
    granularDelayRepeats: 0.42, granularDelayFilter: 0.52,
    granularDelayVibrato: 0.12, granularDelayBSend: 0.34, granularDelayReverbSend: 0.54,
  },

  // ─── Mosaic D: wide harmonic spread ───
  mosaic_d: {
    granularEnabled: true,
    granularSpaceMode: 'clocked',
    granularPresetBehavior: 'pure',
    granularShape: 'triangle',
    granularDiffusion: 0.68,
    granularMacroActivity: 0.10,
    granularFeedback: 0.07,
    granularFeedbackLPF: 4200,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.52,
    granularReverbLPF: 3200,
    granularOutputLPF: 7200,
    granularMacroTexture: 0.06, granularMacroComplexity: 0.06,
    granularMacroDarkness: 0.16, granularMacroChaos: 0.02,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 0.5, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.090, granularV1Decay: 1.62,
    granularV1Blur: 0.34, granularV1GrainOct: 0, granularV1Spray: 0.68,
    granularV1Density: 2, granularV1GrainSize: 380, granularV1Pan: -0.42, granularV1Gain: 0.26,
    granularV1TempoSync: false, granularV1TempoDiv: '1/4',
    granularV1PosLFORate: 0.028, granularV1PosLFODepth: 0.72, granularV1PanLFORate: 0.012, granularV1StereoSpread: 0.56,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.08, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 1, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.060, granularV2Decay: 1.05,
    granularV2Blur: 0.32, granularV2GrainOct: 0, granularV2Spray: 0.60,
    granularV2Density: 3, granularV2GrainSize: 250, granularV2Pan: -0.12, granularV2Gain: 0.23,
    granularV2TempoSync: false, granularV2TempoDiv: '1/8',
    granularV2PosLFORate: 0.044, granularV2PosLFODepth: 0.56, granularV2PanLFORate: 0.01, granularV2StereoSpread: 0.46,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.08, granularV2RecordLFORate: 0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 2, granularV3Reverse: false,
    granularV3Pitch: 0, granularV3Attack: 0.044, granularV3Decay: 0.78,
    granularV3Blur: 0.36, granularV3GrainOct: 0, granularV3Spray: 0.62,
    granularV3Density: 4, granularV3GrainSize: 180, granularV3Pan: 0.2, granularV3Gain: 0.19,
    granularV3TempoSync: false, granularV3TempoDiv: '1/8T',
    granularV3PosLFORate: 0.063, granularV3PosLFODepth: 0.52, granularV3PanLFORate: 0.012, granularV3StereoSpread: 0.52,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.08, granularV3RecordLFORate: 0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 4, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.030, granularV4Decay: 0.55,
    granularV4Blur: 0.42, granularV4GrainOct: 0, granularV4Spray: 0.74,
    granularV4Density: 3, granularV4GrainSize: 120, granularV4Pan: 0.42, granularV4Gain: 0.13,
    granularV4TempoSync: false, granularV4TempoDiv: '1/16',
    granularV4PosLFORate: 0.086, granularV4PosLFODepth: 0.60, granularV4PanLFORate: 0.014, granularV4StereoSpread: 0.66,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.08, granularV4RecordLFORate: 0,
    granularDelayEnabled: false, granularDelayActivity: 0.44,
    granularDelayRepeats: 0.42, granularDelayFilter: 0.46,
    granularDelayVibrato: 0.08, granularDelayBSend: 0.34, granularDelayReverbSend: 0.58,
  },

  // ─── Flux Cloud: Fors Opal Flux-style always-recording spray ───
  flux_cloud: {
    granularEnabled: true,
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
    // Delay: minimal
    granularDelayEnabled: true, granularDelayActivity: 0.1,
    granularDelayRepeats: 0.25, granularDelayFilter: 0.5,
    granularDelayVibrato: 0.1, granularDelayBSend: 0.2, granularDelayReverbSend: 0.3,
  },

  // ─── Self-Generating: Feedback drone, high LFOs, evolving ───
  self_generating: {
    granularEnabled: true,
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
    // Delay: moderate, dark
    granularDelayEnabled: true, granularDelayActivity: 0.3,
    granularDelayRepeats: 0.6, granularDelayFilter: 0.3,
    granularDelayVibrato: 0.3, granularDelayBSend: 0.3, granularDelayReverbSend: 0.4,
  },

  // ─── Tape Loop: Clean dual-voice LFO scan — authentic tape warble through full buffer ───
  tape_loop: {
    granularEnabled: true,
    granularSpaceMode: 'diffuse',
    granularPresetBehavior: 'pure',
    granularFeedback: 0.06,
    granularFeedbackLPF: 3500,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.42,
    granularReverbLPF: 2600,
    granularOutputLPF: 6800,
    granularMacroTexture: 0.06, granularMacroComplexity: 0.05,
    granularMacroDarkness: 0.18, granularMacroChaos: 0,
    // V1: slow LFO scan through full buffer (long arc, ~45s cycle)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.3, granularV1Decay: 1.5,
    granularV1Blur: 0.15, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: -0.15, granularV1Gain: 0.4,
    granularV1PosLFORate: 0.147, granularV1PosLFODepth: 0.85,
    granularV1PanLFORate: 0.067, granularV1StereoSpread: 0.2,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.05, granularV1RecordLFORate: 0,
    // V2: offset scan phase, slightly different rate for evolving texture
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.5, granularV2Decay: 2.0,
    granularV2Blur: 0.2, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.15, granularV2Gain: 0.3,
    granularV2PosLFORate: 0.107, granularV2PosLFODepth: 0.85,
    granularV2PanLFORate: 0.05, granularV2StereoSpread: 0.2,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.05, granularV2RecordLFORate: 0,
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous tape delay)
    granularDelayEnabled: true, granularDelayActivity: 0.18,
    granularDelayRepeats: 0.38, granularDelayFilter: 0.42,
    granularDelayVibrato: 0.12, granularDelayBSend: 0.38, granularDelayReverbSend: 0.32,
  },

  // ─── Shimmer Pad: Dense grain clouds with octave shimmer ───
  shimmer_pad: {
    granularEnabled: true,
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
    granularDelayEnabled: true, granularDelayActivity: 0.3,
    granularDelayRepeats: 0.35, granularDelayFilter: 0.5,
    granularDelayVibrato: 0.2, granularDelayBSend: 0.3, granularDelayReverbSend: 0.4,
  },

  // ─── Glitch Chop: Aggressive stutter with high density bursts ───
  glitch_chop: {
    granularEnabled: true,
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
    granularV1TempoSync: true, granularV1TempoDiv: '1/16',
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0,
    granularV1PanLFORate: 0, granularV1StereoSpread: 0.3,
    granularV1ReverseLFORate: 0.133, granularV1WriteFollow: 0.7, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    granularDelayEnabled: false,
  },

  // ─── Ambient Wash: Soft diffused texture with full-buffer scan ───
  ambient_wash: {
    granularEnabled: true,
    granularSpaceMode: 'diffuse',
    granularPresetBehavior: 'pure',
    granularDiffusion: 0.78,
    granularMacroActivity: 0.68,
    granularFeedback: 0.1,
    granularFeedbackLPF: 3000,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.56,
    granularReverbLPF: 2100,
    granularOutputLPF: 5600,
    granularMacroTexture: 0.1, granularMacroComplexity: 0.08,
    granularMacroDarkness: 0.24, granularMacroChaos: 0.03,
    // V1: slow LFO scan — continuous wash through full buffer (~30s cycle)
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.5, granularV1Decay: 3.0,
    granularV1Blur: 0.35, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 20, granularV1GrainSize: 80, granularV1Pan: -0.2, granularV1Gain: 0.4,
    granularV1PosLFORate: 0.22, granularV1PosLFODepth: 0.9,
    granularV1PanLFORate: 0.05, granularV1StereoSpread: 0.4,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.06, granularV1RecordLFORate: 0,
    // V2: slower scan for depth, quieter
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.8, granularV2Decay: 4.0,
    granularV2Blur: 0.4, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 20, granularV2GrainSize: 80, granularV2Pan: 0.2, granularV2Gain: 0.25,
    granularV2PosLFORate: 0.107, granularV2PosLFODepth: 0.9,
    granularV2PanLFORate: 0.033, granularV2StereoSpread: 0.5,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.08, granularV2RecordLFORate: 0,
    granularV3Enabled: false, granularV4Enabled: false,
    // Euclidean: OFF (continuous ambient wash)
    granularDelayEnabled: true, granularDelayActivity: 0.22,
    granularDelayRepeats: 0.44, granularDelayFilter: 0.34,
    granularDelayVibrato: 0.12, granularDelayBSend: 0.34, granularDelayReverbSend: 0.58,
  },

  // ─── Stutter: Rapid micro-chop effect ───
  stutter: {
    granularEnabled: true,
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
    granularV1TempoSync: true, granularV1TempoDiv: '1/16',
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0,
    granularV1PanLFORate: 0, granularV1StereoSpread: 0.2,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.9, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    granularDelayEnabled: false,
  },

  // ─── Reverse Cloud: Reversed grain texture ───
  reverse_cloud: {
    granularEnabled: true,
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
    granularDelayEnabled: true, granularDelayActivity: 0.25,
    granularDelayRepeats: 0.3, granularDelayFilter: 0.5,
    granularDelayVibrato: 0.1, granularDelayBSend: 0.25, granularDelayReverbSend: 0.35,
  },

  // ─── Drone Freeze: Frozen buffer with feedback drone ───
  drone_freeze: {
    granularEnabled: true,
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
    granularDelayEnabled: true, granularDelayActivity: 0.2,
    granularDelayRepeats: 0.6, granularDelayFilter: 0.25,
    granularDelayVibrato: 0.3, granularDelayBSend: 0.25, granularDelayReverbSend: 0.5,
  },

  // ─── Polyrhythm: Euclidean-driven multi-voice pattern ───
  polyrhythm: {
    granularEnabled: true,
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
    granularV1TempoSync: false, granularV1TempoDiv: '1/8',
    granularV1PosLFORate: 0, granularV1PosLFODepth: 0,
    granularV1PanLFORate: 0, granularV1StereoSpread: 0.3,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.5, granularV1RecordLFORate: 0,
    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 1, granularV2Reverse: false,
    granularV2Pitch: 7, granularV2Attack: 0.01, granularV2Decay: 0.25,
    granularV2Blur: 0.15, granularV2GrainOct: 0.15, granularV2Spray: 0.1,
    granularV2Density: 6, granularV2GrainSize: 50, granularV2Pan: 0.4, granularV2Gain: 0.4,
    granularV2TempoSync: true, granularV2TempoDiv: '1/16',
    granularV2PosLFORate: 0, granularV2PosLFODepth: 0,
    granularV2PanLFORate: 0, granularV2StereoSpread: 0.3,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.5, granularV2RecordLFORate: 0,
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 1, granularV3Reverse: true,
    granularV3Pitch: -5, granularV3Attack: 0.01, granularV3Decay: 0.2,
    granularV3Blur: 0.1, granularV3GrainOct: 0.1, granularV3Spray: 0.15,
    granularV3Density: 5, granularV3GrainSize: 40, granularV3Pan: 0, granularV3Gain: 0.35,
    granularV3TempoSync: true, granularV3TempoDiv: '1/8T',
    granularV3PosLFORate: 0, granularV3PosLFODepth: 0,
    granularV3PanLFORate: 0, granularV3StereoSpread: 0.3,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.5, granularV3RecordLFORate: 0,
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 1, granularV4Reverse: false,
    granularV4Pitch: 7, granularV4Attack: 0.01, granularV4Decay: 0.15,
    granularV4Blur: 0.05, granularV4GrainOct: 0.05, granularV4Spray: 0.1,
    granularV4Density: 4, granularV4GrainSize: 35, granularV4Pan: 0.3, granularV4Gain: 0.3,
    granularV4TempoSync: true, granularV4TempoDiv: '1/4',
    granularV4PosLFORate: 0, granularV4PosLFODepth: 0,
    granularV4PanLFORate: 0, granularV4StereoSpread: 0.3,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.5, granularV4RecordLFORate: 0,
    granularDelayEnabled: true, granularDelayActivity: 0.35,
    granularDelayRepeats: 0.25, granularDelayFilter: 0.6,
    granularDelayVibrato: 0, granularDelayBSend: 0.25, granularDelayReverbSend: 0.25,
  },

  // ─── Scatter: Random spray with wide stereo ───
  scatter: {
    granularEnabled: true,
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
    granularV1TempoSync: false, granularV1TempoDiv: '1/8',
    granularV1PosLFORate: 0.033, granularV1PosLFODepth: 0.2,
    granularV1PanLFORate: 0.067, granularV1StereoSpread: 0.8,
    granularV1ReverseLFORate: 0.067, granularV1WriteFollow: 0.4, granularV1RecordLFORate: 0,
    granularV2Enabled: false, granularV3Enabled: false, granularV4Enabled: false,
    granularDelayEnabled: true, granularDelayActivity: 0.4,
    granularDelayRepeats: 0.3, granularDelayFilter: 0.55,
    granularDelayVibrato: 0.15, granularDelayBSend: 0.3, granularDelayReverbSend: 0.3,
  },

  // ─── Warm Delay: Full-buffer LFO scan with dark tape character ───
  warm_delay: {
    granularEnabled: true,
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
    granularDelayEnabled: true, granularDelayActivity: 0.15,
    granularDelayRepeats: 0.5, granularDelayFilter: 0.25,
    granularDelayVibrato: 0.25, granularDelayBSend: 0.4, granularDelayReverbSend: 0.35,
  },

  // ─── Ice Crystals: High shimmer with pitch-up fragmentation ───
  ice_crystals: {
    granularEnabled: true,
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
    granularDelayEnabled: true, granularDelayActivity: 0.5,
    granularDelayRepeats: 0.3, granularDelayFilter: 0.7,
    granularDelayVibrato: 0.1, granularDelayBSend: 0.3, granularDelayReverbSend: 0.3,
  },

  // ─── Microcosm: Full 4-voice multi-tap delay + granular cascade ───
  microcosm: {
    granularEnabled: true,
    granularSpaceMode: 'diffuse',
    granularPresetBehavior: 'pure',
    granularShape: 'triangle',
    granularDiffusion: 0.82,
    granularMacroActivity: 0.72,
    granularFeedback: 0.06,
    granularFeedbackLPF: 3400,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.68,
    granularReverbLPF: 2200,
    granularOutputLPF: 5600,
    granularMacroTexture: 0.08, granularMacroComplexity: 0.08,
    granularMacroDarkness: 0.26, granularMacroChaos: 0.02,
    // V1: Anchor looper voice
    granularV1Enabled: true, granularV1Mode: 'clean',
    granularV1Slice: 0, granularV1Speed: 0, granularV1Reverse: false,
    granularV1ScanRate: 1.0,
    granularV1Pitch: 0, granularV1Attack: 0.35, granularV1Decay: 2.4,
    granularV1Blur: 0.18, granularV1GrainOct: 0, granularV1Spray: 0,
    granularV1Density: 12, granularV1GrainSize: 80, granularV1Pan: -0.15, granularV1Gain: 0.42,
    granularV1PosLFORate: 0.095, granularV1PosLFODepth: 0.72,
    granularV1PanLFORate: 0.03, granularV1StereoSpread: 0.18,
    granularV1ReverseLFORate: 0, granularV1WriteFollow: 0.08, granularV1RecordLFORate: 0,
    // V2: Companion looper voice
    granularV2Enabled: true, granularV2Mode: 'clean',
    granularV2Slice: 0, granularV2Speed: 0, granularV2Reverse: false,
    granularV2ScanRate: 0.5,
    granularV2Pitch: 0, granularV2Attack: 0.5, granularV2Decay: 2.8,
    granularV2Blur: 0.22, granularV2GrainOct: 0, granularV2Spray: 0,
    granularV2Density: 10, granularV2GrainSize: 80, granularV2Pan: 0.18, granularV2Gain: 0.3,
    granularV2PosLFORate: 0.067, granularV2PosLFODepth: 0.74,
    granularV2PanLFORate: 0.024, granularV2StereoSpread: 0.2,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.1, granularV2RecordLFORate: 0,
    // V3: Body texture voice
    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 4, granularV3Speed: 1, granularV3Reverse: false,
    granularV3Pitch: 0, granularV3Attack: 0.16, granularV3Decay: 1.8,
    granularV3Blur: 0.48, granularV3GrainOct: 0, granularV3Spray: 0.02,
    granularV3Density: 4, granularV3GrainSize: 260, granularV3Pan: -0.3, granularV3Gain: 0.14,
    granularV3PosLFORate: 0.018, granularV3PosLFODepth: 0.08,
    granularV3PanLFORate: 0.02, granularV3StereoSpread: 0.35,
    granularV3ReverseLFORate: 0, granularV3WriteFollow: 0.18, granularV3RecordLFORate: 0,
    // V4: Air / shimmer detail
    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 8, granularV4Speed: 2, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.18, granularV4Decay: 1.7,
    granularV4Blur: 0.54, granularV4GrainOct: 0, granularV4Spray: 0.015,
    granularV4Density: 3, granularV4GrainSize: 210, granularV4Pan: 0.28, granularV4Gain: 0.1,
    granularV4PosLFORate: 0.014, granularV4PosLFODepth: 0.08,
    granularV4PanLFORate: 0.018, granularV4StereoSpread: 0.45,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.14, granularV4RecordLFORate: 0,
    // Euclidean: OFF by default — ambient first
    // Delay: diffuse, lush, and less grid-forward
    granularDelayEnabled: true, granularDelayActivity: 0.28,
    granularDelayRepeats: 0.5, granularDelayFilter: 0.38,
    granularDelayVibrato: 0.12, granularDelayBSend: 0.42, granularDelayReverbSend: 0.7,
  },

  // ─── Microcosm Pulse: clocked rhythmic shimmer variant ───
  microcosm_pulse: {
    granularEnabled: true,
    granularSpaceMode: 'clocked',
    granularPresetBehavior: 'pure',
    granularShape: 'sawDown',
    granularDiffusion: 0.38,
    granularMacroActivity: 0.36,
    granularFeedback: 0.08,
    granularFeedbackLPF: 4200,
    granularFreeze: false,
    granularBufferSeconds: 16,
    granularReverbSend: 0.42,
    granularReverbLPF: 3000,
    granularOutputLPF: 7000,
    granularMacroTexture: 0.08, granularMacroComplexity: 0.1,
    granularMacroDarkness: 0.16, granularMacroChaos: 0.03,
    granularV1Enabled: true, granularV1Mode: 'granular',
    granularV1Slice: 0, granularV1Speed: 1, granularV1Reverse: false,
    granularV1Pitch: 0, granularV1Attack: 0.022, granularV1Decay: 0.58,
    granularV1Blur: 0.24, granularV1GrainOct: 0, granularV1Spray: 0.03,
    granularV1Density: 8, granularV1GrainSize: 100, granularV1Pan: -0.25, granularV1Gain: 0.4,
    granularV1TempoSync: false, granularV1TempoDiv: '1/8',
    granularV1PosLFORate: 0.04, granularV1PosLFODepth: 0.16,
    granularV1PanLFORate: 0.03, granularV1StereoSpread: 0.35,
    granularV1ReverseLFORate: 0.012, granularV1WriteFollow: 0.35, granularV1RecordLFORate: 0.02,

    granularV2Enabled: true, granularV2Mode: 'granular',
    granularV2Slice: 4, granularV2Speed: 2, granularV2Reverse: false,
    granularV2Pitch: 0, granularV2Attack: 0.018, granularV2Decay: 0.46,
    granularV2Blur: 0.3, granularV2GrainOct: 0, granularV2Spray: 0.035,
    granularV2Density: 6, granularV2GrainSize: 84, granularV2Pan: 0.28, granularV2Gain: 0.26,
    granularV2TempoSync: false, granularV2TempoDiv: '1/8T',
    granularV2PosLFORate: 0.03, granularV2PosLFODepth: 0.18,
    granularV2PanLFORate: 0.024, granularV2StereoSpread: 0.45,
    granularV2ReverseLFORate: 0, granularV2WriteFollow: 0.35, granularV2RecordLFORate: 0.02,

    granularV3Enabled: true, granularV3Mode: 'granular',
    granularV3Slice: 8, granularV3Speed: 0.5, granularV3Reverse: true,
    granularV3Pitch: 0, granularV3Attack: 0.026, granularV3Decay: 0.68,
    granularV3Blur: 0.34, granularV3GrainOct: 0, granularV3Spray: 0.04,
    granularV3Density: 5, granularV3GrainSize: 124, granularV3Pan: 0, granularV3Gain: 0.22,
    granularV3TempoSync: false, granularV3TempoDiv: '1/4',
    granularV3PosLFORate: 0.02, granularV3PosLFODepth: 0.24,
    granularV3PanLFORate: 0.018, granularV3StereoSpread: 0.55,
    granularV3ReverseLFORate: 0.01, granularV3WriteFollow: 0.28, granularV3RecordLFORate: 0.018,

    granularV4Enabled: true, granularV4Mode: 'granular',
    granularV4Slice: 12, granularV4Speed: 2, granularV4Reverse: false,
    granularV4Pitch: 0, granularV4Attack: 0.014, granularV4Decay: 0.34,
    granularV4Blur: 0.22, granularV4GrainOct: 0, granularV4Spray: 0.03,
    granularV4Density: 4, granularV4GrainSize: 74, granularV4Pan: -0.1, granularV4Gain: 0.14,
    granularV4TempoSync: false, granularV4TempoDiv: '1/16',
    granularV4PosLFORate: 0.032, granularV4PosLFODepth: 0.12,
    granularV4PanLFORate: 0.03, granularV4StereoSpread: 0.62,
    granularV4ReverseLFORate: 0, granularV4WriteFollow: 0.42, granularV4RecordLFORate: 0.03,

    granularDelayEnabled: true, granularDelayActivity: 0.46,
    granularDelayRepeats: 0.4, granularDelayFilter: 0.44,
    granularDelayVibrato: 0.09, granularDelayBSend: 0.34, granularDelayReverbSend: 0.46,
  },
};
