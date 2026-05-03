/**
 * UI State Management
 * 
 * Slider state model with:
 * - Type definitions
 * - Quantization helpers
 * - URL encode/decode for sharing
 * - Stable serialization
 */

import { SCALE_FAMILIES } from '../audio/scales';
import type { ClockDivision, LaneDirection, PitchBindingMode, PitchMode, ScaleName, TrigCondition } from '../audio/drumSeqTypes';
import { hydrateOptimizedStatePresetData } from '../presets/statePresetOptimization';

export type GranularTempoDivision = '1/4' | '1/8' | '1/16' | '1/32' | '1/64' | '1/8T';
export type IndexedDelayDivisionKey = 'drumDelayNoteL' | 'drumDelayNoteR' | 'granularDelayTime';

export const DELAY_A_NOTE_DIVISION_OPTIONS = [
  { value: '1/1', label: '1/1' },
  { value: '1/2', label: '1/2' },
  { value: '1/2d', label: '1/2 dotted' },
  { value: '1/4', label: '1/4' },
  { value: '1/4d', label: '1/4 dotted' },
  { value: '1/4t', label: '1/4 triplet' },
  { value: '1/8', label: '1/8' },
  { value: '1/8d', label: '1/8 dotted' },
  { value: '1/8t', label: '1/8 triplet' },
  { value: '1/16', label: '1/16' },
  { value: '1/16d', label: '1/16 dotted' },
  { value: '1/16t', label: '1/16 triplet' },
  { value: '1/32', label: '1/32' },
] as const;

export const DELAY_B_NOTE_DIVISION_OPTIONS = [
  { value: '1/1', label: '1/1' },
  { value: '1/2', label: '1/2' },
  { value: '1/2d', label: '1/2 dotted' },
  { value: '1/4', label: '1/4' },
  { value: '1/4d', label: '1/4 dotted' },
  { value: '1/4t', label: '1/4 triplet' },
  { value: '1/8', label: '1/8' },
  { value: '1/8d', label: '1/8 dotted' },
  { value: '1/8t', label: '1/8 triplet' },
  { value: '1/16', label: '1/16' },
  { value: '1/16d', label: '1/16 dotted' },
  { value: '1/16t', label: '1/16 triplet' },
  { value: '1/32', label: '1/32' },
] as const;

export const DEFAULT_REVERB_PRE_COMP = {
  threshold: -36,
  knee: 20,
  ratio: 5,
  attackMs: 0.7,
  releaseMs: 700,
  makeup: 2.9,
} as const;

const INDEXED_DELAY_DIVISION_ALIASES: Record<string, string> = {
  '3/8': '1/4d',
  '3/16': '1/16d',
};

const INDEXED_DELAY_DIVISION_OPTIONS: Record<IndexedDelayDivisionKey, readonly { value: string; label: string }[]> = {
  drumDelayNoteL: DELAY_A_NOTE_DIVISION_OPTIONS,
  drumDelayNoteR: DELAY_A_NOTE_DIVISION_OPTIONS,
  granularDelayTime: DELAY_B_NOTE_DIVISION_OPTIONS,
};

function normalizeIndexedDelayDivisionValue(value: string): string {
  return INDEXED_DELAY_DIVISION_ALIASES[value] ?? value;
}

export function isIndexedDelayDivisionKey(key: keyof SliderState | string): key is IndexedDelayDivisionKey {
  return key === 'drumDelayNoteL' || key === 'drumDelayNoteR' || key === 'granularDelayTime';
}

export function getIndexedDelayDivisionOptions(key: IndexedDelayDivisionKey): readonly { value: string; label: string }[] {
  return INDEXED_DELAY_DIVISION_OPTIONS[key];
}

export function getIndexedDelayDivisionIndex(
  key: IndexedDelayDivisionKey,
  value: string | number | null | undefined,
): number {
  const options = getIndexedDelayDivisionOptions(key);
  const info = {
    min: 0,
    max: options.length - 1,
    step: 1,
  };

  if (typeof value === 'number' && Number.isFinite(value)) {
    const clamped = Math.max(info.min, Math.min(info.max, value));
    return info.min + Math.round((clamped - info.min) / info.step) * info.step;
  }

  const normalizedValue = normalizeIndexedDelayDivisionValue(String(value ?? ''));
  const index = options.findIndex((option) => option.value === normalizedValue);
  return index >= 0 ? index : 0;
}

export function getIndexedDelayDivisionValue<K extends IndexedDelayDivisionKey>(
  key: K,
  value: number,
): SliderState[K] {
  const options = getIndexedDelayDivisionOptions(key);
  const index = getIndexedDelayDivisionIndex(key, value);
  return (options[index] ?? options[0] ?? { value: '1/4' }).value as SliderState[K];
}

export function formatIndexedDelayDivision(key: IndexedDelayDivisionKey, value: number): string {
  const options = getIndexedDelayDivisionOptions(key);
  const index = getIndexedDelayDivisionIndex(key, value);
  return options[index]?.label ?? options[0]?.label ?? '1/4';
}

export function getSliderNumericValue<K extends keyof SliderState>(
  key: K,
  value: SliderState[K] | number | null | undefined,
): number | null {
  if (isIndexedDelayDivisionKey(key)) {
    return getIndexedDelayDivisionIndex(key, value as string | number | null | undefined);
  }
  return typeof value === 'number' ? value : null;
}

export function getStateValueFromSliderNumber<K extends keyof SliderState>(
  key: K,
  value: number,
): SliderState[K] | number {
  if (isIndexedDelayDivisionKey(key)) {
    return getIndexedDelayDivisionValue(key, value);
  }
  return value;
}

/**
 * Slider mode for unified 3-mode slider system
 * - 'single': normal single-value slider
 * - 'walk': random walk (Brownian motion) between min/max
 * - 'sampleHold': per-trigger random sample between min/max
 */
export type SliderMode = 'single' | 'walk' | 'sampleHold';
export type PhraseClockSource = 'localPhrase' | 'globalPhrase' | 'localBeat' | 'globalBeat';
export type BeatClockSource = 'localBeat' | 'globalBeat';
export type HarmonySyncPolicy = 'free' | 'nextPhrase' | 'restartNow';
export type SequencerJoinPolicy = 'grid' | 'bar';
export type RandomWalkMode = 'localBrownian' | 'globalWalk';
export type ProgressionClockSource = 'harmony' | 'localPhrase' | 'globalPhrase';
export type TransportPrimaryClock = 'seconds' | 'bpm' | 'decoupled';
export type LeadRandomSource = 'lead1' | 'lead2' | 'piano';
export type SynthEuclidSource = 'lead' | 'lead1' | 'lead2' | 'piano' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';

/**
 * Serialized evolve config for preset save/load.
 * Mirrors EvolveConfig from useEuclideanSequencer but defined here to avoid circular deps.
 */
export interface SerializedEvolveConfig {
  enabled: boolean;
  everyBars: number;
  evolution: number;
  writeOffset: number | 'auto';
  mutationMode: 'strict' | 'biased';
  methods: Record<string, boolean>;
  enabledSubLanes?: string[];
}

/**
 * Serialized sub-lane state per sub-lane kind
 */
export interface SerializedSubLaneState {
  enabled: boolean;
  steps: number;
  direction: 'forward' | 'reverse' | 'pingpong';
  scaleQuantize?: boolean;
  valueMode?: 'sequence' | 'range';
  rangeMin?: number;
  rangeMax?: number;
}

export interface SerializedStepToggle {
  step: number;
  value: boolean;
}

/**
 * JSON-safe version of StepOverrides. Runtime StepOverrides contain Maps, so
 * presets must store trigger toggles as sorted arrays to survive DB/file JSON.
 */
export interface SerializedStepOverrides {
  triggerToggles?: SerializedStepToggle[][];
  probability?: (number[] | null)[];
  ratchet?: (number[] | null)[];
  trigCondition?: (TrigCondition[] | null)[];
  expression?: (number[] | null)[];
  pitch?: (number[] | null)[];
  morph?: (number[] | null)[];
  distance?: (number[] | null)[];
  slice?: (number[] | null)[];
  reverse?: (number[] | null)[];
  expressionDirection?: (LaneDirection | null)[];
  morphDirection?: (LaneDirection | null)[];
  distanceDirection?: (LaneDirection | null)[];
  pitchDirection?: (LaneDirection | null)[];
  sliceDirection?: (LaneDirection | null)[];
  reverseDirection?: (LaneDirection | null)[];
  expressionRanges?: ({ min: number; max: number } | null)[];
  morphRanges?: ({ min: number; max: number } | null)[];
  distanceRanges?: ({ min: number; max: number } | null)[];
}

export interface SerializedPitchSettings {
  mode: PitchMode;
  root: number;
  scale: ScaleName;
}

/**
 * Saved preset structure
 */
export interface SavedPreset {
  name: string;
  timestamp: string;
  state: SliderState;
  dualRanges?: Record<string, { min: number; max: number }>;  // Range values for walk/sampleHold sliders
  sliderModes?: Record<string, SliderMode>;  // Mode per parameter key
  drumEvolveConfigs?: SerializedEvolveConfig[];
  synthEvolveConfigs?: SerializedEvolveConfig[];
  drumStepOverrides?: SerializedStepOverrides;
  synthStepOverrides?: SerializedStepOverrides;
  drumClockDivs?: ClockDivision[];
  synthClockDivs?: ClockDivision[];
  drumSwings?: number[];
  synthSwings?: number[];
  drumLinked?: boolean[];
  synthLinked?: boolean[];
  drumSubLaneStates?: Record<string, SerializedSubLaneState>[];
  synthSubLaneStates?: Record<string, SerializedSubLaneState>[];
  synthPitchSettings?: SerializedPitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
}

export interface SliderState {
  // Master Mixer
  masterVolume: number;       // 0..1 step 0.01
  synthLevel: number;         // 0..1 step 0.01 - pad 1 dry level (ENGINE_TRIMS.pad applied in engine)
  pad2Level: number;           // 0..1 step 0.01 - pad 2 dry level (ENGINE_TRIMS.pad applied in engine)
  granularLevel: number;      // 0..1 step 0.01 - granular output level (ENGINE_TRIMS.granular applied in engine)
  pad1ReverbSend: number;     // 0..1 step 0.01 - Pad 1 send into shared reverb
  pad2ReverbSend: number;     // 0..1 step 0.01 - Pad 2 send into shared reverb
  pad1DelayASend: number;     // 0..1 - pad 1 send into shared Delay A
  pad1DelayBSend: number;     // 0..1 - pad 1 send into shared Delay B
  pad2DelayASend: number;     // 0..1 - pad 2 send into shared Delay A
  pad2DelayBSend: number;     // 0..1 - pad 2 send into shared Delay B
  leadReverbSend: number;     // 0..1 step 0.01 - how much lead goes to reverb
  lead1DelayASend: number;    // 0..1 - Lead 1 trim into shared Delay A
  lead1DelayBSend: number;    // 0..1 - Lead 1 send into shared Delay B
  lead2DelayASend: number;    // 0..1 - Lead 2 trim into shared Delay A
  lead2DelayBSend: number;    // 0..1 - Lead 2 send into shared Delay B
  pianoLevel: number;         // 0..1 step 0.01 - piano dry level
  pianoDelayASend: number;    // 0..1 - Piano send into shared Delay A
  pianoDelayBSend: number;    // 0..1 - Piano send into shared Delay B
  delayAReverbSend: number;   // 0..1 step 0.01 - how much shared Delay A goes to reverb
  drumDelayASend: number;     // 0..1 - whole drum bus send into shared Delay A
  delayAToBSend: number;      // 0..1 - shared Delay A output cross-feed into Delay B
  delayAGranularSend: number; // 0..1 - shared Delay A output into granular input
  delayBGranularSend: number; // 0..1 - shared Delay B output into granular input
  delayAPingPong: boolean;    // false = dual-line echo, true = ping-pong feedback
  delayAModRate: number;      // 0..1 mapped to ~0.05..5 Hz
  delayAModDepth: number;     // 0..1 mapped to 0..50 ms
  delayADuck: number;         // 0..1 wet duck amount
  delayAFilterType: 'lowpass' | 'bandpass' | 'highpass'; // feedback filter mode
  delayAWidth: number;        // 0..1 width / Haas spread
  delayBPattern: 'cascade' | 'golden' | 'mirror' | 'dotted'; // tap timing preset
  delayBWarp: 'clean' | 'filterSweep' | 'pitchDrift' | 'grainCrossfade'; // tap warp mode
  delayBWarpIntensity: number; // 0..1 warp dry/wet amount
  delayBSpread: number;       // 0..1 stereo spread scaling
  delayBToASend: number;      // 0..1 shared Delay B output cross-feed into Delay A
  delayACrossFeedFilter: number; // 0..1 mapped to 200..8000 Hz LPF on A→B
  drumDelayBSend: number;     // 0..1 - whole drum bus send into shared Delay B
  reverbLevel: number;        // 0..1 step 0.01 - reverb output level
  masterSatDrive: number;     // 0..1 input drive into master saturation
  masterSatMode: 'clean' | 'tape' | 'tube'; // master saturation character
  masterSatTone: number;      // 0..1 post-saturation tone tilt
  dynamicsEnabled: boolean;    // master enable for Dynamics page processing
  dynamicsSaturationEnabled: boolean; // dynamics-page master saturation on/off
  dynamicsSaturationMode: 'clean' | 'tape' | 'tube' | 'diode' | 'fold';
  dynamicsSaturationDrive: number;
  dynamicsSaturationTone: number;
  dynamicsSaturationBias: number;
  sidechainEnabled: boolean;   // trigger-derived ducking for selected target sources
  sidechainKeyA: 'off' | 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise' | 'membrane';
  sidechainKeyB: 'off' | 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise' | 'membrane';
  sidechainKeyAWeight: number;
  sidechainKeyBWeight: number;
  sidechainAmount: number;
  sidechainThreshold: number;
  sidechainRatio: number;
  sidechainKnee: number;
  sidechainAttackMs: number;
  sidechainHoldMs: number;
  sidechainReleaseMs: number;
  sidechainMakeup: number;
  sidechainMix: number;
  sidechainCurve: number;
  sidechainDetectorHp: number;
  sidechainDetectorLp: number;
  sidechainPad1Target: number;
  sidechainPad2Target: number;
  sidechainLead1Target: number;
  sidechainLead2Target: number;
  sidechainPianoTarget: number;
  sidechainGranularTarget: number;
  sidechainDelayATarget: number;
  sidechainDelayBTarget: number;
  sidechainReverbTarget: number;
  characterEnabled: boolean;
  characterMode: 'clean' | 'abyssWater' | 'shallowWater';
  characterMix: number;
  characterAge: number;
  degradeEnabled: boolean;
  degradeMix: number;
  degradeAge: number;
  degradeGeneration: number;
  degradeAlias: number;
  degradeWow: number;
  degradeFlutter: number;
  degradeDrift: number;
  degradeWobbleSpeed: number;
  degradeTone: number;
  degradeHp: number;
  degradeLp: number;
  characterResonance: number;
  degradeNoise: number;
  degradeSaturation: number;
  degradeCorrosion: number;
  degradeModSlowWow: number;
  degradeModSlowFlutter: number;
  degradeModSlowLp: number;
  degradeModSlowWet: number;
  degradeModSlowDropout: number;
  degradeModSlowAlias: number;
  degradeModFlutterWow: number;
  degradeModFlutterFlutter: number;
  degradeModFlutterLp: number;
  degradeModFlutterWet: number;
  degradeModFlutterDropout: number;
  degradeModFlutterAlias: number;
  degradeModRandomWow: number;
  degradeModRandomFlutter: number;
  degradeModRandomLp: number;
  degradeModRandomWet: number;
  degradeModRandomDropout: number;
  degradeModRandomAlias: number;
  degradeModEnvWow: number;
  degradeModEnvFlutter: number;
  degradeModEnvLp: number;
  degradeModEnvWet: number;
  degradeModEnvDropout: number;
  degradeModEnvAlias: number;
  degradeModNoiseWow: number;
  degradeModNoiseFlutter: number;
  degradeModNoiseLp: number;
  degradeModNoiseWet: number;
  degradeModNoiseDropout: number;
  degradeModNoiseAlias: number;
  characterWow: number;
  characterFlutter: number;
  characterDrift: number;
  characterTone: number;
  characterHp: number;
  characterLp: number;
  characterNoise: number;
  characterSaturation: number;
  characterCorrosion: number;
  characterStereo: number;
  characterEnvFollow: number;
  characterDepth: number;
  characterRate: number;
  characterDamp: number;
  endCompEnabled: boolean;
  endCompThreshold: number;
  endCompKnee: number;
  endCompRatio: number;
  endCompAttackMs: number;
  endCompReleaseMs: number;
  endCompMakeup: number;
  endCompMix: number;
  endCompDetectorHp: number;
  endCompDetectorTilt: number;
  endCompAutoMakeup: number;
  endCompProgramRelease: number;

  // Global
  seedWindow: 'hour' | 'day';
  randomness: number;         // 0..1 step 0.01
  rootNote: number;           // 0..11 (C=0, C#=1, ..., B=11) - master root note

  // Circle of Fifths Drift
  cofDriftEnabled: boolean;   // Enable automatic key drift around circle of fifths
  cofDriftRate: number;       // 1..8 phrases between key changes (1=every phrase, 8=rarely)
  cofDriftDirection: 'cw' | 'ccw' | 'random';  // Clockwise, counter-clockwise, or random
  cofDriftRange: number;      // 1..6 - max steps away from home key before returning
  cofCurrentStep: number;     // -6..6 - current position relative to home key on circle

  // Chord Progression Sequencer
  chordProgressionEnabled: boolean;      // false = random weighted selection
  chordProgressionPattern: number[];     // chord degrees (0-6), e.g. [0,3,4,0] = I,IV,V,I
  chordProgressionSteps: number;         // 2..8 pattern length
  chordProgressionHits: number;          // Euclidean hits (which steps trigger chord change)
  chordProgressionRotation: number;      // Euclidean rotation (0..steps-1)
  chordProgressionStepEnabled: boolean[]; // explicit on/off per progression step
  chordProgressionPhraseMultiplier: 1 | 2 | 4 | 8;  // phrases per step
  chordProgressionClockSource: ProgressionClockSource; // Which phrase clock advances the progression

  // Per-engine tension overrides (6 engines × mode + value)
  padTensionMode: 'follow' | 'locked' | 'bypass';
  padTensionValue: number;         // follow: offset ±0.5 (default 0); locked: absolute 0..1; bypass: tension disabled
  leadTensionMode: 'follow' | 'locked' | 'bypass';
  leadTensionValue: number;
  synthEuclidTensionMode: 'follow' | 'locked' | 'bypass';
  synthEuclidTensionValue: number;
  granularTensionMode: 'follow' | 'locked' | 'bypass';
  granularTensionValue: number;
  reverbTensionMode: 'follow' | 'locked' | 'bypass';
  reverbTensionValue: number;
  drumTensionMode: 'follow' | 'locked' | 'bypass';
  drumTensionValue: number;

  // Harmony/Pitch
  scaleMode: 'auto' | 'manual';
  manualScale: string;        // Scale family name
  tension: number;            // 0..1 step 0.01
  chordRate: number;          // 8..64 seconds step 1
  phraseLength: number;       // 4..128 seconds step 1 - harmony phrase length
  voicingSpread: number;      // 0..1 step 0.01
  waveSpread: number;         // 0..1 fraction of chordRate - stagger time between voice entries
  detune: number;             // 0..25 cents step 1
  // Synth voice ADSR
  synthAttack: number;        // 0.01..8 seconds
  synthDecay: number;         // 0.01..8 seconds
  synthSustain: number;       // 0..1 level
  synthRelease: number;       // 0.01..16 seconds
  // Shared transport / timing infrastructure
  transportPrimaryClock: TransportPrimaryClock; // Which transport domain is authoritative, or whether phrase seconds and BPM are independent
  transportBarsPerPhrase: number;     // 1..16 bars per phrase when using beat-derived phrase clocks
  transportBeatsPerBar: number;       // 2..12 beats per bar
  harmonyClockSource: PhraseClockSource;
  harmonySyncPolicy: HarmonySyncPolicy;
  leadRandomClockSource: PhraseClockSource;
  leadRandomSyncPolicy: HarmonySyncPolicy;
  synthEuclidClockSource: BeatClockSource;
  synthEuclidJoinPolicy: SequencerJoinPolicy;
  drumEuclidClockSource: BeatClockSource;
  drumEuclidJoinPolicy: SequencerJoinPolicy;
  randomWalkMode: RandomWalkMode;
  synthVoiceMask: number;     // 1..63 binary mask for which voices play (1=voice1, 2=voice2, 4=voice3, etc)
  synthOctave: number;        // -2..+2 octave shift

  // Timbre / Drive
  hardness: number;           // 0..1 step 0.01 — saturation drive + resonance boost
  filterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  filterCutoffMin: number;    // 40..8000 Hz - lower bound of filter sweep
  filterCutoffMax: number;    // 40..8000 Hz - upper bound of filter sweep
  filterResonance: number;    // 0..1 step 0.01 (resonance peak)
  filterQ: number;            // 0.1..12 step 0.1 (filter bandwidth/angle)
  filterSlope: number;        // 12..48 dB/oct - stop-band rolloff steepness
  filterKeyTracking: number;  // 0..1 - cutoff follows played note pitch
  warmth: number;             // 0..1 step 0.01 (low shelf boost)
  presence: number;           // 0..1 step 0.01 (high-mid presence)
  padFoldAmount: number;      // 0..1 wave fold amount
  padFoldMode: number;        // 0=Buchla, 1=Sine, 2=Serge

  // ─── Pad Synth Extended (Phase 1 + 2) ───
  // Preset system
  padPresetA: string;           // Preset id for morph position 0
  padPresetB: string;           // Preset id for morph position 1
  padMorph: number;             // 0..1 morph position between A and B

  // Oscillator A (primary)
  padOscAWave: 'sine' | 'triangle' | 'sawtooth' | 'square';
  padOscAOctave: number;        // -2..+2
  padOscADetune: number;        // -100..+100 cents
  padOscALevel: number;         // 0..1

  // Oscillator B (secondary)
  padOscBWave: 'sine' | 'triangle' | 'sawtooth' | 'square';
  padOscBOctave: number;        // -2..+2
  padOscBDetune: number;        // -100..+100 cents
  padOscBLevel: number;         // 0..1

  // Sub Oscillator
  padSubEnabled: boolean;
  padSubOctave: number;         // -1 or -2
  padSubWave: 'sine' | 'triangle';
  padSubLevel: number;          // 0..1

  // Noise Layer
  padNoiseType: 'white' | 'pink';
  padNoiseLevel: number;        // 0..1

  // Filter B (second filter in series)
  padFilterBEnabled: boolean;
  padFilterBType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  padFilterBCutoff: number;     // 40..8000 Hz
  padFilterBResonance: number;  // 0..1
  padFilterBQ: number;          // 0.1..12
  padFilterRouting: 'series' | 'aOnly' | 'bOnly';

  // LFO 1
  padLfo1Rate: number;          // 0.05..20 Hz
  padLfo1Depth: number;         // 0..1
  padLfo1Wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  padLfo1Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel' | 'foldAmount';

  // LFO 2
  padLfo2Rate: number;          // 0.05..20 Hz
  padLfo2Depth: number;         // 0..1
  padLfo2Wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  padLfo2Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel' | 'foldAmount';

  // Mod Envelope
  padModEnvEnabled: boolean;
  padModEnvAttack: number;      // 0.01..8s
  padModEnvDecay: number;       // 0.01..8s
  padModEnvSustain: number;     // 0..1
  padModEnvRelease: number;     // 0.01..16s
  padModEnvDepth: number;       // -1..+1
  padModEnvDest: 'filterCutoff' | 'pitch' | 'oscBLevel' | 'foldAmount';

  // Pad morph auto
  padMorphAuto: boolean;
  padMorphSpeed: number;        // 1..32 phrases per morph cycle

  // Osc Mix — crossfade between Osc A and Osc B levels
  padOscMix: number;            // 0..1 (0=A only, 0.5=both full, 1=B only)
  padDistance: number;          // 0..1 expressive placement macro
  padPostLPF: number;           // 40..8000 Hz post-voice LPF
  padStereoWidth: number;       // 0..1 post-voice stereo width
  padDiffuseSend: number;       // 0..1 diffuse room send

  // ─── Pad Synth 2 ───
  pad2Enabled: boolean;
  pad2VoiceAssign: number;      // bitmask 0..63: which voices belong to Pad 2 (default 0 = none)
  // ADSR
  pad2Attack: number;
  pad2Decay: number;
  pad2Sustain: number;
  pad2Release: number;
  pad2Octave: number;
  // Drive / Character
  pad2Hardness: number;
  pad2Warmth: number;
  pad2Presence: number;
  pad2FoldAmount: number;
  pad2FoldMode: number;
  pad2OscMix: number;
  // Filter A
  pad2FilterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  pad2FilterCutoffMin: number;
  pad2FilterCutoffMax: number;
  pad2FilterResonance: number;
  pad2FilterQ: number;
  pad2FilterSlope: number;
  pad2FilterKeyTracking: number;
  // Oscillators
  pad2OscAWave: 'sine' | 'triangle' | 'sawtooth' | 'square';
  pad2OscAOctave: number;
  pad2OscADetune: number;
  pad2OscALevel: number;
  pad2OscBWave: 'sine' | 'triangle' | 'sawtooth' | 'square';
  pad2OscBOctave: number;
  pad2OscBDetune: number;
  pad2OscBLevel: number;
  // Sub
  pad2SubEnabled: boolean;
  pad2SubOctave: number;
  pad2SubWave: 'sine' | 'triangle';
  pad2SubLevel: number;
  // Noise
  pad2NoiseType: 'white' | 'pink';
  pad2NoiseLevel: number;
  // Filter B
  pad2FilterBEnabled: boolean;
  pad2FilterBType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  pad2FilterBCutoff: number;
  pad2FilterBResonance: number;
  pad2FilterBQ: number;
  pad2FilterRouting: 'series' | 'aOnly' | 'bOnly';
  // LFO 1
  pad2Lfo1Rate: number;
  pad2Lfo1Depth: number;
  pad2Lfo1Wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  pad2Lfo1Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel' | 'foldAmount';
  // LFO 2
  pad2Lfo2Rate: number;
  pad2Lfo2Depth: number;
  pad2Lfo2Wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  pad2Lfo2Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel' | 'foldAmount';
  // Mod Envelope
  pad2ModEnvEnabled: boolean;
  pad2ModEnvAttack: number;
  pad2ModEnvDecay: number;
  pad2ModEnvSustain: number;
  pad2ModEnvRelease: number;
  pad2ModEnvDepth: number;
  pad2ModEnvDest: 'filterCutoff' | 'pitch' | 'oscBLevel' | 'foldAmount';
  // Presets / Morph
  pad2PresetA: string;
  pad2PresetB: string;
  pad2Morph: number;
  pad2MorphAuto: boolean;
  pad2MorphSpeed: number;
  pad2Distance: number;
  pad2PostLPF: number;          // 40..8000 Hz post-voice LPF
  pad2StereoWidth: number;
  pad2DiffuseSend: number;

  // Space
  reverbEnabled: boolean;     // on/off toggle for reverb (saves CPU when off)
  reverbEngine: 'algorithmic' | 'convolution';
  reverbType: 'plate' | 'hall' | 'cathedral' | 'darkHall' | 'dattorroPlate' | 'dattorroShimmer';
  reverbQuality: 'ultra' | 'balanced' | 'lite';  // ultra=16-ch + mid diffusion, balanced=8-ch, lite=4-ch FDN
  reverbDecay: number;        // 0..1 step 0.01 (longer tail)
  reverbSize: number;         // 0.5..10.0 step 0.1 (room size — extended for massive spaces)
  reverbDiffusion: number;    // 0..1 step 0.01 (smear amount)
  reverbModulation: number;   // 0..1 step 0.01 (chorus-like shimmer)
  predelay: number;           // 0..100ms step 1
  damping: number;            // 0..1 step 0.01
  width: number;              // 0..1 step 0.01
  reverbShimmer: number;      // 0..1 step 0.01 - pitch-shifted feedback amount
  reverbShimmerPitch: number; // -24..24 semitones step 1 - shimmer pitch shift
  reverbSlowModRate: number;  // 0.01..0.2 Hz step 0.001 - slow character drift speed
  reverbSlowModDepth: number; // 0..1 step 0.01 - how much character drifts
  reverbReverse: number;      // 0..1 step 0.01 - reverse tail blend
  reverbReverseLength: number; // 0.5..16.0 seconds step 0.1 - reverse buffer length

  // Reverb v2 params
  reverbChorusRate: number;    // 0.05..2.0 Hz step 0.01 - per-line chorus rate
  reverbChorusDepth: number;   // 0..40 samples step 0.5 - per-line chorus depth
  reverbModCharacter: 'sine' | 'drift' | 'hybrid'; // mod waveform character
  reverbDampLow: number;      // 0..1 step 0.01 - low-band damping
  reverbDampHigh: number;     // 0..1 step 0.01 - high-band damping
  reverbCrossoverFreq: number; // 100..6000 Hz step 10 - damping crossover frequency
  reverbInputTone: number;    // -1..+1 step 0.01 - input tilt EQ (-1=dark, +1=bright)
  reverbShimmerFeedback: number; // 0..1 step 0.01 - compound pitch shifting feedback

  // Reverb v3 params
  reverbWarp: number;            // 0..1 step 0.01 - pitch warp/bend in feedback path
  reverbCrossFeed: number;       // 0..1 step 0.01 - stereo cross-injection
  // v4 parameters
  reverbEarlyReflections: number; // 0..1 step 0.01 - early reflections level
  reverbAirAbsorption: number;   // 0..1 step 0.01 - spectral tilt in feedback
  reverbSaturationMode: 'clean' | 'tape' | 'tube'; // saturation character

  // v5 parameters
  reverbTransientSmooth: number;  // 0..1 step 0.01 - pre-tank transient conditioning
  reverbErLpFreq: number;          // 200-12000 Hz - LP cutoff for early reflections
  reverbPreCompThreshold: number;  // -60..0 dB - onset of pre-tank leveling
  reverbPreCompKnee: number;       // 0..40 dB - softness of compression onset
  reverbPreCompRatio: number;      // 1..20 - amount of peak control
  reverbPreCompAttackMs: number;   // 0.1..30 ms - how quickly peaks are caught
  reverbPreCompReleaseMs: number;  // 20..1000 ms - how long the bloom stays glued
  reverbPreCompMakeup: number;     // 0.5..4x - gain restored before the tank

  // ─── Reverb Harmony Coupling ───
  reverbScaleShimmer: boolean;     // snap shimmer pitch to nearest scale interval
  reverbChordWash: boolean;        // boost wet on chord changes
  reverbResolutionBloom: boolean;  // bloom shimmer/decay on tension resolution

  // Spectral Freeze (STFT-based, separate WASM module)
  spectralFreezeEnabled: boolean;        // master enable
  spectralFreezeActive: boolean;         // freeze engaged
  spectralFreezeSlushy: boolean;         // false=solid, true=slushy
  spectralFreezeSpeed: number;           // 0..1 slushy refresh rate
  spectralFreezeMix: number;             // 0..1 wet/dry
  spectralFreezeDecay: number;            // 0..1 sustain (0=fast melt, 1=infinite hold)
  spectralFreezePhaseJitter: number;      // 0..1 phase randomization
  spectralFreezeRouting: 'pre' | 'post'; // pre-reverb or post-reverb
  spectralFreezeReverbCrossfade: number;  // 0..1 freeze isolation (1=frozen only, 0=full live bleed)

  // Granular (legacy — params kept for migration compatibility)
  maxGrains: number;           // 0..128 step 1 - maximum concurrent grains
  grainProbability: number;   // 0..1 step 0.01 - chance each grain triggers
  grainSize: number;          // 5..800 ms step 1 - grain size (dual-mode: S&H per grain)
  density: number;            // 5..80 grains/sec step 1
  spray: number;              // 0..600 ms step 5
  jitter: number;             // 0..30 ms step 1
  grainPitchMode: 'random' | 'harmonic'; // pitch mode
  pitchSpread: number;        // 0..12 semitones step 1
  stereoSpread: number;       // 0..1 step 0.01
  feedback: number;           // 0..0.35 step 0.01
  wetHPF: number;             // 200..3000 Hz step 50
  wetLPF: number;             // 3000..12000 Hz step 200

  // Pad Synth
  padEnabled: boolean;        // on/off toggle for pad synth voices

  // Lead Synth (Rhodes/Bell)
  leadEnabled: boolean;       // on/off toggle (master: mutes gain + gates playLeadNote)
  leadRandomEnabled: boolean; // on/off toggle for random timing mode
  leadRandomSource: LeadRandomSource;
  leadLevel: number;          // 0..1 step 0.01
  lead1UseCustomAdsr: boolean; // when true, use lead ADSR sliders instead of preset ADSR
  lead1Attack: number;         // 0.001..2 seconds
  lead1Decay: number;          // 0.01..4 seconds
  lead1Sustain: number;        // 0..1 level
  lead1Hold: number;           // 0..4 seconds - how long to hold at sustain level
  lead1Release: number;        // 0.01..8 seconds
  delayATime: number;            // legacy ms timing value for the old lead-owned delay path
  delayAFeedback: number;        // shared Delay A feedback amount (range in dualSliderRanges)
  delayAMix: number;             // shared Delay A wet level (range in dualSliderRanges)
  delayAEnabled: boolean;        // legacy enable flag for the old lead-owned delay path
  delayASpread: number;          // legacy L/R spread multiplier for the old lead-owned delay path
  delayAFilter: number;          // shared Delay A lowpass cutoff in Hz
  delayASend: number;            // legacy send level for the old lead-owned delay path
  lead1Density: number;       // 0.1..2 notes per phrase (sparseness)
  lead1Octave: number;        // -1, 0, 1, 2 octave offset
  lead1OctaveRange: number;   // 1..4 - how many octaves to span for random notes
  leadTimbre: number;         // 0..1 - timbre (LEGACY, ignored by 4op FM engine)

  // Lead 1 — 4op FM preset morph (A ↔ B)
  lead1PresetA: string;       // Lead4opFM preset id (default: soft_rhodes)
  lead1PresetB: string;       // Lead4opFM preset id (default: gamelan)
  lead1Morph: number;         // 0..1 morph position (range in dualSliderRanges)
  lead1MorphAuto: boolean;    // Auto-morph enabled
  lead1MorphSpeed: number;    // Phrases per morph cycle (1..32)
  lead1MorphMode: 'linear' | 'pingpong' | 'random';
  lead1AlgorithmMode: 'snap' | 'presetA'; // snap=switch at 50%, presetA=always use A's
  lead1Level: number;         // 0..1 level for lead 1
  lead1ReverbSend: number;    // 0..1 step 0.01 - how much lead 1 goes to reverb
  lead1Distance: number;      // 0..1 expressive placement macro
  lead1PostLPF: number;       // 40..8000 Hz post-voice LPF
  lead1PostLPFKeyTracking: number; // 0..1 - post LPF follows most recent note
  lead1StereoWidth: number;   // 0..1 post-voice stereo width
  lead1DiffuseSend: number;   // 0..1 diffuse room send

  // Lead 2 — 4op FM preset morph (C ↔ D)
  lead2Enabled: boolean;      // on/off (default off)
  lead2PresetC: string;       // Lead4opFM preset id (default: soft_rhodes)
  lead2PresetD: string;       // Lead4opFM preset id (default: gamelan)
  lead2Morph: number;         // 0..1 morph position (range in dualSliderRanges)
  lead2MorphAuto: boolean;    // Auto-morph enabled
  lead2MorphSpeed: number;    // Phrases per morph cycle (1..32)
  lead2MorphMode: 'linear' | 'pingpong' | 'random';
  lead2AlgorithmMode: 'snap' | 'presetA'; // snap=switch at 50%, presetA=always use C's
  lead2Level: number;         // 0..1 level for lead 2
  lead2ReverbSend: number;    // 0..1 step 0.01 - how much lead 2 goes to reverb
  lead2UseCustomAdsr: boolean; // when true, use lead2 ADSR sliders instead of preset ADSR
  lead2Attack: number;         // 0.001..2 seconds
  lead2Decay: number;          // 0.01..4 seconds
  lead2Sustain: number;        // 0..1 level
  lead2Hold: number;           // 0..4 seconds - how long to hold at sustain level
  lead2Release: number;        // 0.01..8 seconds
  lead2Distance: number;
  lead2PostLPF: number;       // 40..8000 Hz post-voice LPF
  lead2PostLPFKeyTracking: number;
  lead2StereoWidth: number;
  lead2DiffuseSend: number;

  // Piano sampler
  pianoEnabled: boolean;
  pianoAttack: number;
  pianoDecay: number;
  pianoSustain: number;
  pianoHold: number;
  pianoRelease: number;
  pianoReverbSend: number;
  pianoDistance: number;
  pianoPostLPF: number;       // 40..8000 Hz post-voice LPF
  pianoStereoWidth: number;
  pianoDiffuseSend: number;

  leadVibratoDepth: number;     // 0..1 - vibrato depth (range in dualSliderRanges)
  leadVibratoRate: number;      // 0..1 - vibrato rate (range in dualSliderRanges)
  leadGlide: number;            // 0..1 - portamento/glide speed (range in dualSliderRanges)
  // Shared sequencer transport for synth / drums / granular Euclidean timing
  sequencerMasterBPM: number;          // Shared BPM (40-300)
  // Euclidean sequencer for lead - 4 independent lanes for polyrhythmic patterns
  synthEuclideanMasterEnabled: boolean;  // master on/off (off = random mode)
  synthEuclidBaseBPM: number;            // Base BPM mirror for synth Euclidean (40-300)
  synthEuclideanTempo: number;           // 0.25..12 - tempo multiplier for all lanes
  // Lane 1
  synthEuclid1Enabled: boolean;
  synthEuclid1Preset: string;
  synthEuclid1Steps: number;
  synthEuclid1Hits: number;
  synthEuclid1Rotation: number;
  synthEuclid1NoteMin: number;    // 36..96 MIDI note - low end of note range
  synthEuclid1NoteMax: number;    // 36..96 MIDI note - high end of note range
  synthEuclid1Level: number;      // 0..1 velocity/level for this lane
  synthEuclid1Probability: number; // 0..1 probability of triggering each hit
  synthEuclid1Source: SynthEuclidSource;
  // Lane 2
  synthEuclid2Enabled: boolean;
  synthEuclid2Preset: string;
  synthEuclid2Steps: number;
  synthEuclid2Hits: number;
  synthEuclid2Rotation: number;
  synthEuclid2NoteMin: number;
  synthEuclid2NoteMax: number;
  synthEuclid2Level: number;
  synthEuclid2Probability: number;
  synthEuclid2Source: SynthEuclidSource;
  // Lane 3
  synthEuclid3Enabled: boolean;
  synthEuclid3Preset: string;
  synthEuclid3Steps: number;
  synthEuclid3Hits: number;
  synthEuclid3Rotation: number;
  synthEuclid3NoteMin: number;
  synthEuclid3NoteMax: number;
  synthEuclid3Level: number;
  synthEuclid3Probability: number;
  synthEuclid3Source: SynthEuclidSource;
  // Lane 4
  synthEuclid4Enabled: boolean;
  synthEuclid4Preset: string;
  synthEuclid4Steps: number;
  synthEuclid4Hits: number;
  synthEuclid4Rotation: number;
  synthEuclid4NoteMin: number;
  synthEuclid4NoteMax: number;
  synthEuclid4Level: number;
  synthEuclid4Probability: number;
  synthEuclid4Source: SynthEuclidSource;
  
  // Synth chord sequencer toggle (when false, synth only plays from Euclidean triggers)
  synthChordSequencerEnabled: boolean;

  // ─── Ikeda-Style Drum Synth ───
  drumEnabled: boolean;                    // Master on/off
  drumLevel: number;                       // 0..1 master volume
  drumReverbSend: number;                  // 0..1 send to main reverb
  
  // Voice 1: Sub (low sine pulse, felt more than heard)
  drumSubFreq: number;                     // 30..100 Hz
  drumSubDecay: number;                    // 20..500 ms
  drumSubLevel: number;                    // 0..1
  drumSubTone: number;                     // 0..1 (0=pure sine, 1=add harmonics)
  drumSubShape: number;                    // 0..1 (0=sine, 0.5=triangle, 1=saw)
  drumSubPitchEnv: number;                 // -48..+48 semitones pitch sweep
  drumSubPitchDecay: number;               // 5..500 ms pitch envelope decay
  drumSubDrive: number;                    // 0..1 soft saturation
  drumSubSub: number;                      // 0..1 sub-octave mix
  drumSubAttack: number;                   // 0..5000 ms attack time
  drumSubVariation: number;                // 0..1 per-hit micro-randomness amount
  drumSubDistance: number;                 // 0..1 strike position (0=center, 0.5=neutral, 1=edge)

  // Voice 2: Kick (sine with pitch envelope)
  drumKickFreq: number;                    // 40..150 Hz (end frequency)
  drumKickPitchEnv: number;                // 0..48 semitones (pitch sweep amount)
  drumKickPitchDecay: number;              // 5..100 ms (pitch envelope decay)
  drumKickDecay: number;                   // 30..500 ms (amplitude decay)
  drumKickLevel: number;                   // 0..1
  drumKickClick: number;                   // 0..1 (transient click amount)
  drumKickBody: number;                    // 0..1 (0=tight, 1=boomy)
  drumKickPunch: number;                   // 0..1 transient sharpness
  drumKickTail: number;                    // 0..1 reverberant tail
  drumKickTone: number;                    // 0..1 harmonic content
  drumKickAttack: number;                  // 0..5000 ms attack time
  drumKickVariation: number;               // 0..1 per-hit micro-randomness amount
  drumKickDistance: number;                // 0..1 strike position (0=center, 0.5=neutral, 1=edge)

  // Voice 3: Click (impulse/noise burst - the "data" sound)
  drumClickDecay: number;                  // 1..80 ms
  drumClickFilter: number;                 // 500..15000 Hz highpass
  drumClickTone: number;                   // 0..1 (0=pure impulse, 1=noise burst)
  drumClickLevel: number;                  // 0..1
  drumClickResonance: number;              // 0..1 (filter resonance for metallic tone)
  drumClickPitch: number;                  // 200..8000 Hz tonal mode pitch
  drumClickPitchEnv: number;               // -48..+48 semitones pitch sweep
  drumClickMode: 'impulse' | 'noise' | 'tonal' | 'granular';
  drumClickGrainCount: number;             // 1..8 micro-grains per trigger
  drumClickGrainSpread: number;            // 0..50 ms grain timing spread
  drumClickStereoWidth: number;            // 0..1 stereo spread of grains
  drumClickExciterColor: number;           // -1..1 continuous exciter color tilt
  drumClickAttack: number;                 // 0..5000 ms attack time
  drumClickVariation: number;              // 0..1 per-hit micro-randomness amount
  drumClickDistance: number;               // 0..1 strike position (0=center, 0.5=neutral, 1=edge)

  // Voice 4: Beep Hi (high frequency sine ping)
  drumBeepHiFreq: number;                  // 2000..12000 Hz
  drumBeepHiAttack: number;                // 0..20 ms
  drumBeepHiDecay: number;                 // 10..500 ms
  drumBeepHiLevel: number;                 // 0..1
  drumBeepHiTone: number;                  // 0..1 (0=pure, 1=FM modulated)
  drumBeepHiInharmonic: number;            // 0..1 inharmonic partial detune
  drumBeepHiPartials: number;              // 1..6 number of partials
  drumBeepHiShimmer: number;               // 0..1 vibrato/chorus amount
  drumBeepHiShimmerRate: number;           // 0.5..12 Hz shimmer LFO rate
  drumBeepHiBrightness: number;            // 0..1 spectral tilt
  drumBeepHiFeedback: number;              // 0..1 FM operator feedback
  drumBeepHiModEnvDecay: number;           // 0..1 mod index envelope decay (0=static, 1=fast decay)
  drumBeepHiNoiseInMod: number;            // 0..1 noise injection into FM modulator
  drumBeepHiModRatio: number;              // 1..12 FM mod:carrier ratio (coarse integer)
  drumBeepHiModRatioFine: number;          // -0.5..0.5 fine detune of ratio (inharmonicity)
  drumBeepHiModPhase: number;              // 0..1 modulator start phase (0=sine start, 0.5=inverted)
  drumBeepHiModEnvEnd: number;             // 0..1 mod envelope sustain/end level (ADE contour)
  drumBeepHiNoiseDecay: number;            // 0..1 noise injection envelope decay (0=instant, 1=slow)
  drumBeepHiVariation: number;             // 0..1 per-hit micro-randomness amount
  drumBeepHiDistance: number;              // 0..1 strike position (0=center, 0.5=neutral, 1=edge)

  // Voice 5: Beep Lo (lower pitched ping/blip)
  drumBeepLoFreq: number;                  // 150..2000 Hz
  drumBeepLoAttack: number;                // 0..30 ms
  drumBeepLoDecay: number;                 // 10..500 ms
  drumBeepLoLevel: number;                 // 0..1
  drumBeepLoTone: number;                  // 0..1 (0=sine, 1=square-ish)
  drumBeepLoPitchEnv: number;              // -48..+48 semitones (neg=rise for droplet)
  drumBeepLoPitchDecay: number;            // 5..500 ms pitch env decay
  drumBeepLoBody: number;                  // 0..1 resonance/body warmth
  drumBeepLoPluck: number;                 // 0..1 Karplus-Strong pluck amount
  drumBeepLoPluckDamp: number;             // 0..1 pluck damping (0=bright, 1=muted)
  drumBeepLoModal: number;                 // 0..1 modal resonator bank amount (>0.3 activates)
  drumBeepLoModalQ: number;                // 1..50 resonator Q (decay/ring time)
  drumBeepLoModalInharmonic: number;       // 0..1 inharmonic partial spread
  drumBeepLoModalSpread: number;           // -1..1 partial frequency distribution warp
  drumBeepLoModalCut: number;              // -1..1 partial cut/tilt (-1=cut highs, +1=cut lows)
  drumBeepLoOscGain: number;               // 0..2 oscillator/pluck engine gain trim
  drumBeepLoModalGain: number;             // 0..2 modal resonator engine gain trim
  drumBeepLoVariation: number;             // 0..1 per-hit micro-randomness amount
  drumBeepLoDistance: number;              // 0..1 strike position (0=center, 0.5=neutral, 1=edge)

  // Voice 6: Noise (filtered noise burst - hi-hat/texture)
  drumNoiseFilterFreq: number;             // 500..15000 Hz (center/cutoff)
  drumNoiseFilterQ: number;                // 0.5..15 resonance
  drumNoiseFilterType: 'lowpass' | 'bandpass' | 'highpass';
  drumNoiseDecay: number;                  // 5..300 ms
  drumNoiseLevel: number;                  // 0..1
  drumNoiseAttack: number;                 // 0..10 ms
  drumNoiseFormant: number;                // 0..1 vowel formant morph
  drumNoiseBreath: number;                 // 0..1 breathiness/air
  drumNoiseFilterEnv: number;              // -1..+1 filter envelope direction
  drumNoiseFilterEnvDecay: number;         // 5..2000 ms filter env decay
  drumNoiseDensity: number;                // 0..1 (0=sparse dust, 1=dense)
  drumNoiseColorLFO: number;               // 0..10 Hz filter modulation rate
  drumNoiseParticleSize: number;           // 0.5..20 ms individual particle duration
  drumNoiseParticleRandom: number;         // 0..1 grain pitch/time randomization amount
  drumNoiseParticleRandomRate: number;     // 0..1 randomization rate (0=per-grain, 1=continuous)
  drumNoiseRatchetCount: number;           // 0..8 clap-style ratchet repeat count (0=off)
  drumNoiseRatchetTime: number;            // 5..100 ms per-ratchet decay time
  drumNoiseVariation: number;              // 0..1 per-hit micro-randomness amount
  drumNoiseDistance: number;               // 0..1 strike position (0=center, 0.5=neutral, 1=edge)

  // Voice 7: Membrane (physical modeled head + wire buzz)
  drumMembraneExciter: 'impulse' | 'noise' | 'stick' | 'brush' | 'mallet';
  drumMembraneExcPos: number;              // 0..1 strike position
  drumMembraneExcBright: number;           // 0..1.5 exciter brightness
  drumMembraneExcDur: number;              // 0.5..50 ms
  drumMembraneSize: number;                // 40..600 Hz base size/fundamental
  drumMembraneStiffness: number;             // 0..1
  drumMembraneDamping: number;             // 0..1
  drumMembraneMaterial: 'skin' | 'metal' | 'wood' | 'glass' | 'plastic';
  drumMembraneNonlin: number;              // 0..1 nonlinearity/distortion
  drumMembraneWireMix: number;             // 0..1 snare-wire mix
  drumMembraneWireDensity: number;         // 0..1 wire rattle density
  drumMembraneWireTone: number;            // 0..1 wire brightness
  drumMembraneWireDecay: number;           // 0..1 wire decay factor
  drumMembraneBody: number;                // 0..1 body fundamental amount
  drumMembraneRing: number;                // 0..1 ring amount
  drumMembraneOvertones: number;           // 1..8 mode count
  drumMembranePitchEnv: number;            // 0..24 semitones
  drumMembranePitchDecay: number;          // 1..500 ms
  drumMembraneAttack: number;              // 0..5000 ms
  drumMembraneDecay: number;               // 10..7000 ms
  drumMembraneLevel: number;               // 0..1
  drumMembraneVariation: number;           // 0..1
  drumMembraneDistance: number;            // 0..1
  drumMembraneScaleBlend: number;          // 0..1 membrane partial alignment to scale
  
  // Per-trigger per-parameter update option
  drumMorphSliderAnimate: boolean;         // Update individual parameter sliders on morph trigger

  // ─── Drum Voice Morph System ───
  // Sub morph
  drumSubPresetA: string;                  // Preset name for morph position 0
  drumSubPresetB: string;                  // Preset name for morph position 1
  drumSubMorph: number;                    // 0..1 interpolation position
  drumSubMorphAuto: boolean;               // Auto-morph enabled
  drumSubMorphSpeed: number;               // Phrases per morph cycle
  drumSubMorphMode: 'linear' | 'pingpong' | 'random';

  // Kick morph
  drumKickPresetA: string;
  drumKickPresetB: string;
  drumKickMorph: number;
  drumKickMorphAuto: boolean;
  drumKickMorphSpeed: number;
  drumKickMorphMode: 'linear' | 'pingpong' | 'random';

  // Click morph
  drumClickPresetA: string;
  drumClickPresetB: string;
  drumClickMorph: number;
  drumClickMorphAuto: boolean;
  drumClickMorphSpeed: number;
  drumClickMorphMode: 'linear' | 'pingpong' | 'random';

  // BeepHi morph
  drumBeepHiPresetA: string;
  drumBeepHiPresetB: string;
  drumBeepHiMorph: number;
  drumBeepHiMorphAuto: boolean;
  drumBeepHiMorphSpeed: number;
  drumBeepHiMorphMode: 'linear' | 'pingpong' | 'random';

  // BeepLo morph
  drumBeepLoPresetA: string;
  drumBeepLoPresetB: string;
  drumBeepLoMorph: number;
  drumBeepLoMorphAuto: boolean;
  drumBeepLoMorphSpeed: number;
  drumBeepLoMorphMode: 'linear' | 'pingpong' | 'random';

  // Noise morph
  drumNoisePresetA: string;
  drumNoisePresetB: string;
  drumNoiseMorph: number;
  drumNoiseMorphAuto: boolean;
  drumNoiseMorphSpeed: number;
  drumNoiseMorphMode: 'linear' | 'pingpong' | 'random';

  // Membrane morph
  drumMembranePresetA: string;
  drumMembranePresetB: string;
  drumMembraneMorph: number;
  drumMembraneMorphAuto: boolean;
  drumMembraneMorphSpeed: number;
  drumMembraneMorphMode: 'linear' | 'pingpong' | 'random';

  // ─── Drum Stereo Ping-Pong Delay ───
  drumDelayEnabled: boolean;               // Master delay on/off
  drumDelayNoteL: string;                  // Note division for left: '1/4', '1/8', '1/8d', '1/16', etc.
  drumDelayNoteR: string;                  // Note division for right
  drumDelayFeedback: number;               // 0..0.9 feedback amount
  drumDelayMix: number;                    // 0..1 wet/dry mix
  drumDelayFilter: number;                 // 0..1 lowpass (0=dark, 1=bright)
  // Per-voice delay sends
  drumSubDelaySend: number;                // 0..1 send amount
  drumKickDelaySend: number;
  drumClickDelaySend: number;
  drumBeepHiDelaySend: number;
  drumBeepLoDelaySend: number;
  drumNoiseDelaySend: number;
  drumMembraneDelaySend: number;
  
  // Drum Euclidean Sequencer (4 lanes, separate from lead Euclidean)
  drumEuclidMasterEnabled: boolean;        // Master enable
  drumEuclidBaseBPM: number;               // Base BPM mirror (40-300)
  drumEuclidTempo: number;                 // 0.25..4 tempo multiplier
  drumEuclidSwing: number;                 // 0..100% swing
  drumEuclidDivision: number;              // 4, 8, 16, 32
  
  // Drum Euclidean Lane 1
  drumEuclid1Enabled: boolean;
  drumEuclid1Preset: string;
  drumEuclid1Steps: number;
  drumEuclid1Hits: number;
  drumEuclid1Rotation: number;
  drumEuclid1TargetSub: boolean;
  drumEuclid1TargetKick: boolean;
  drumEuclid1TargetClick: boolean;
  drumEuclid1TargetBeepHi: boolean;
  drumEuclid1TargetBeepLo: boolean;
  drumEuclid1TargetNoise: boolean;
  drumEuclid1TargetMembrane: boolean;
  drumEuclid1Probability: number;
  drumEuclid1VelocityMin: number;          // 0..1 velocity range
  drumEuclid1VelocityMax: number;
  drumEuclid1Level: number;
  
  // Drum Euclidean Lane 2
  drumEuclid2Enabled: boolean;
  drumEuclid2Preset: string;
  drumEuclid2Steps: number;
  drumEuclid2Hits: number;
  drumEuclid2Rotation: number;
  drumEuclid2TargetSub: boolean;
  drumEuclid2TargetKick: boolean;
  drumEuclid2TargetClick: boolean;
  drumEuclid2TargetBeepHi: boolean;
  drumEuclid2TargetBeepLo: boolean;
  drumEuclid2TargetNoise: boolean;
  drumEuclid2TargetMembrane: boolean;
  drumEuclid2Probability: number;
  drumEuclid2VelocityMin: number;
  drumEuclid2VelocityMax: number;
  drumEuclid2Level: number;
  
  // Drum Euclidean Lane 3
  drumEuclid3Enabled: boolean;
  drumEuclid3Preset: string;
  drumEuclid3Steps: number;
  drumEuclid3Hits: number;
  drumEuclid3Rotation: number;
  drumEuclid3TargetSub: boolean;
  drumEuclid3TargetKick: boolean;
  drumEuclid3TargetClick: boolean;
  drumEuclid3TargetBeepHi: boolean;
  drumEuclid3TargetBeepLo: boolean;
  drumEuclid3TargetNoise: boolean;
  drumEuclid3TargetMembrane: boolean;
  drumEuclid3Probability: number;
  drumEuclid3VelocityMin: number;
  drumEuclid3VelocityMax: number;
  drumEuclid3Level: number;
  
  // Drum Euclidean Lane 4
  drumEuclid4Enabled: boolean;
  drumEuclid4Preset: string;
  drumEuclid4Steps: number;
  drumEuclid4Hits: number;
  drumEuclid4Rotation: number;
  drumEuclid4TargetSub: boolean;
  drumEuclid4TargetKick: boolean;
  drumEuclid4TargetClick: boolean;
  drumEuclid4TargetBeepHi: boolean;
  drumEuclid4TargetBeepLo: boolean;
  drumEuclid4TargetNoise: boolean;
  drumEuclid4TargetMembrane: boolean;
  drumEuclid4Probability: number;
  drumEuclid4VelocityMin: number;
  drumEuclid4VelocityMax: number;
  drumEuclid4Level: number;

  // Waves sample
  earthLevel: number;            // 0..1 master Earth bus level (waves + water + insects)
  oceanSampleEnabled: boolean;   // on/off toggle for real sample
  oceanSampleLevel: number;      // 0..1 step 0.01 - sample volume
  oceanReverbSend: number;       // 0..1 reverb send for waves sample, post-filter
  oceanDelayASend: number;       // 0..1 waves send into shared Delay A
  oceanDelayBSend: number;       // 0..1 waves send into shared Delay B
  oceanSliceDuration: number;    // seconds of each waves texture slice
  oceanSliceDensity: number;     // 0..1 overlap density
  oceanFilterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch'; // filter type
  oceanFilterCutoff: number;     // 40..12000 Hz
  oceanFilterResonance: number;  // 0..1 step 0.01
  birdsEnabled: boolean;         // Alps birds texture
  birdsLevel: number;            // 0..1
  birdsReverbSend: number;       // legacy per-source field (shared Nature send now used)
  birdsDelayASend: number;       // legacy per-source field (shared Nature send now used)
  birdsDelayBSend: number;       // legacy per-source field (shared Nature send now used)
  birdsSliceDuration: number;    // seconds of each birds texture slice
  birdsSliceDensity: number;     // 0..1 overlap density
  birds2Enabled: boolean;        // Fujian birds texture
  birds2Level: number;           // 0..1
  birds2ReverbSend: number;      // legacy per-source field (shared Nature send now used)
  birds2DelayASend: number;      // legacy per-source field (shared Nature send now used)
  birds2DelayBSend: number;      // legacy per-source field (shared Nature send now used)
  birds2SliceDuration: number;   // seconds of each birds 2 texture slice
  birds2SliceDensity: number;    // 0..1 overlap density
  frogsEnabled: boolean;         // Fujian frogs texture
  frogsLevel: number;            // 0..1
  frogsReverbSend: number;       // legacy per-source field (shared Nature send now used)
  frogsDelayASend: number;       // legacy per-source field (shared Nature send now used)
  frogsDelayBSend: number;       // legacy per-source field (shared Nature send now used)
  frogsSliceDuration: number;    // seconds of each frogs texture slice
  frogsSliceDensity: number;     // 0..1 overlap density
  natureLevel: number;           // 0..1 shared dry master for birds + birds2 + frogs
  natureReverbSend: number;      // 0..1 shared reverb send for birds + birds2 + frogs
  natureDelayASend: number;      // 0..1 shared Nature send into shared Delay A
  natureDelayBSend: number;      // 0..1 shared Nature send into shared Delay B

  // ─── Soundscapes (Water + Insects) ───
  waterEnabled: boolean;        // master on/off for water engine
  waterPreset: number;          // 0..3 (Tap Drips, Stream, Waterfall, Rain Window)
  waterMorphA: number;          // 0..3 morph source preset
  waterMorphB: number;          // 0..3 morph target preset
  waterMorph: number;           // 0..1 morph position
  waterIntensity: number;       // 0..1
  waterDistance: number;        // 0..1
  waterBaseFreq: number;        // legacy shared base frequency fallback
  waterDropSize: number;        // 0..1
  waterHardness: number;        // 0..1
  waterGlassThickness: number;  // 0..1
  waterReverbSend: number;      // 0..1 reverb send
  waterDelayASend: number;      // 0..1 water send into shared Delay A
  waterDelayBSend: number;      // 0..1 water send into shared Delay B
  waterLevel: number;           // 0..1 output volume
  // Water layer levels (0 = disabled, >0 = enabled at that level)
  waterLayerHardDrops: number;  // 0..1
  waterLayerWaterDrops: number; // 0..1
  waterLayerTurbulence: number; // 0..1
  waterLayerBubbling: number;   // 0..1
  waterLayerSurf: number;       // 0..1
  waterLayerChannels: number;   // 0..1
  // Per-layer event controls for the three discrete water event layers
  waterHardDropBaseFreq: number;  // 100..8000 Hz hard-drop resonant activity
  waterHardDropRate: number;      // 0..2 source-local event-rate multiplier
  waterHardDropLPF: number;       // 50..16000 Hz resonant LPF cutoff
  waterHardDropTone: number;      // 0..1 tonal -> short rupture morph
  waterWaterDropBaseFreq: number; // 100..8000 Hz water-drop pitch/brightness
  waterWaterDropRate: number;     // 0..2 source-local event-rate multiplier
  waterWaterDropLPF: number;      // 50..16000 Hz resonant LPF cutoff
  waterBubblingRate: number;      // 0..2 source-local event-rate multiplier
  waterBubblingLPF: number;       // 50..8000 Hz resonant LPF cutoff
  // Surf layer params (wave-envelope driven 3-band noise)
  waterSurfDuration: number;    // 2..20 seconds — wave event length
  waterSurfInterval: number;    // 3..25 seconds — time between waves
  waterSurfFoam: number;        // 0..1 — spray/foam intensity
  waterSurfFoamBright: number;  // 0..1 — unfiltered foam sparkle (high-end shimmer)
  waterSurfProximity: number;   // 0..1 — 0=far wave, 1=close wave
  waterSurfDepth: number;       // 0..1 — deep rumble amount
  waterSurfBody: number;        // 150..800 Hz — body band center freq
  waterSurfSpray: number;       // 2000..8000 Hz — spray band center freq
  // Shared density loop (fed only by hard drops, water drops, and bubbling)
  waterDensityHardSend: number;  // 0..2.5 hard-drop contribution into density loop
  waterDensityWaterSend: number; // 0..2.5 water-drop contribution into density loop
  waterDensityBubbleSend: number;// 0..2.5 bubbling contribution into density loop
  waterDensityFeedback: number;  // 0..0.92 feedback amount
  waterDensityTone: number;      // 250..4000 Hz feedback tone lowpass
  waterDensityRing: number;      // 0..1 ring-mod intensity
  waterDensityWet: number;       // 0..1.5 return level
  // Channels layer params (stream↔wind morph)
  waterChannelsMorph: number;   // 0..1 — 0=stream, 1=wind
  waterChannelsSpeed: number;   // 0..1 — LFO speed
  // Insects Layer 1
  insectsEnabled: boolean;
  insectsEngine: number;        // 0..6 (Cricket..Fly/Bee)
  insectsDensity: number;       // 0..1
  insectsTemperature: number;   // 0..1
  insectsDistance: number;      // 0..1
  insectsProximity: number;     // 0..1
  insectsAntiphony: number;     // 0..1
  insectsClickRate: number;     // 0..1
  insectsMotion: number;        // 0..1
  insectsLevel: number;         // 0..1
  insectsSharedLevel: number;   // 0..1 shared dry master for both insect layers
  insectsReverbSend: number;    // 0..1 reverb send for insects
  insDelayASend: number;        // 0..1 insects bus send into shared Delay A
  insDelayBSend: number;        // 0..1 insects bus send into shared Delay B
  // Insects Layer 2
  insects2Enabled: boolean;
  insects2Engine: number;       // 0..6
  insects2Density: number;      // 0..1
  insects2Temperature: number;  // 0..1
  insects2Distance: number;     // 0..1
  insects2Proximity: number;    // 0..1
  insects2Antiphony: number;    // 0..1
  insects2ClickRate: number;    // 0..1
  insects2Motion: number;       // 0..1
  insects2Level: number;        // 0..1

  // ─── Granular FX (Unified Granular Engine) ───
  granularEnabled: boolean;           // Master on/off
  granularFreeze: boolean;            // Stop write head
  granularFeedback: number;           // 0..0.85 global feedback
  granularFeedbackLPF: number;        // 200..12000 Hz feedback darkening
  granularBufferSeconds: number;      // 4 or 16
  granularPreset: string;             // preset id
  granularSpaceMode: 'diffuse' | 'clocked'; // prototype post-space behavior
  granularPresetBehavior: 'pure' | 'expressive'; // macro sensitivity profile
  delayBGranularLinked: boolean;      // when true, granular preset loads also carry shared Delay B voicing
  granularShape: 'triangle' | 'sawUp' | 'sawDown' | 'square'; // discrete grain envelope contour
  granularDiffusion: number;          // musical macro: bus smear + timing randomness + darker glue
  granularReverbSend: number;         // 0..1 send to reverb
  granularReverbLPF: number;          // 200..12000 Hz pre-reverb lowpass (darkens reverb trail)
  granularOutputLPF: number;          // 200..12000 Hz output lowpass (tames overall brightness)
  granularDelayASend: number;         // 0..1 granular output send to shared Delay A
  granularDelayBSend: number;         // 0..1 granular output send to shared Delay B
  granularPad1Send: number;           // 0..1 pad 1 send to granular
  granularPad2Send: number;           // 0..1 pad 2 send to granular
  granularLead1Send: number;          // 0..1 lead 1 send to granular
  granularLead2Send: number;          // 0..1 lead 2 send to granular
  granularPianoSend: number;          // 0..1 piano send to granular
  granularDrumSend: number;           // 0..1 drum engines send to granular
  granularWavesSend: number;          // 0..1 waves send to granular
  granularNatureSend: number;         // 0..1 nature samples send to granular
  granularWaterSend: number;          // 0..1 water send to granular
  granularInsectsSend: number;        // 0..1 insects send to granular

  // Voice 1
  granularV1Enabled: boolean;
  granularV1Mode: 'clean' | 'granular' | 'legacy';
  granularV1Slice: number;            // 0..15
  granularV1Speed: number;            // 0..4 (0 = LFO scan mode)
  granularV1ScanRate: number;         // 0.25..4 clean scan playback rate
  granularV1Reverse: boolean;
  granularV1Pitch: number;            // -24..+24 semitones
  granularV1Attack: number;           // 0.001..0.5 seconds
  granularV1Decay: number;            // 0.01..4 seconds
  granularV1Blur: number;             // 0..1 allpass diffusion
  granularV1GrainOct: number;         // 0..1 shimmer probability
  granularV1Spray: number;            // 0..1 position randomization
  granularV1Density: number;          // 1..64 grains/sec
  granularV1TempoSync: boolean;       // sync grain trigger pulses to BPM grid
  granularV1TempoDiv: GranularTempoDivision; // note division for grain trigger pulses
  granularV1GrainSize: number;        // 10..500 ms
  granularV1Pan: number;              // -1..+1
  granularV1Gain: number;             // 0..1
  granularV1PosLFORate: number;       // 0..1
  granularV1PosLFODepth: number;      // 0..1
  granularV1PanLFORate: number;       // 0..1
  granularV1StereoSpread: number;     // 0..1
  granularV1ReverseLFORate: number;   // 0..1 periodic direction flip
  granularV1WriteFollow: number;      // 0..1 blend slice vs write head
  granularV1RecordLFORate: number;    // 0..1 oscillating write-follow modulation

  // Voice 2
  granularV2Enabled: boolean;
  granularV2Mode: 'clean' | 'granular' | 'legacy';
  granularV2Slice: number;
  granularV2Speed: number;
  granularV2ScanRate: number;
  granularV2Reverse: boolean;
  granularV2Pitch: number;
  granularV2Attack: number;
  granularV2Decay: number;
  granularV2Blur: number;
  granularV2GrainOct: number;
  granularV2Spray: number;
  granularV2Density: number;
  granularV2TempoSync: boolean;
  granularV2TempoDiv: GranularTempoDivision;
  granularV2GrainSize: number;
  granularV2Pan: number;
  granularV2Gain: number;
  granularV2PosLFORate: number;
  granularV2PosLFODepth: number;
  granularV2PanLFORate: number;
  granularV2StereoSpread: number;
  granularV2ReverseLFORate: number;
  granularV2WriteFollow: number;
  granularV2RecordLFORate: number;

  // Voice 3
  granularV3Enabled: boolean;
  granularV3Mode: 'clean' | 'granular' | 'legacy';
  granularV3Slice: number;
  granularV3Speed: number;
  granularV3ScanRate: number;
  granularV3Reverse: boolean;
  granularV3Pitch: number;
  granularV3Attack: number;
  granularV3Decay: number;
  granularV3Blur: number;
  granularV3GrainOct: number;
  granularV3Spray: number;
  granularV3Density: number;
  granularV3TempoSync: boolean;
  granularV3TempoDiv: GranularTempoDivision;
  granularV3GrainSize: number;
  granularV3Pan: number;
  granularV3Gain: number;
  granularV3PosLFORate: number;
  granularV3PosLFODepth: number;
  granularV3PanLFORate: number;
  granularV3StereoSpread: number;
  granularV3ReverseLFORate: number;
  granularV3WriteFollow: number;
  granularV3RecordLFORate: number;

  // Voice 4
  granularV4Enabled: boolean;
  granularV4Mode: 'clean' | 'granular' | 'legacy';
  granularV4Slice: number;
  granularV4Speed: number;
  granularV4ScanRate: number;
  granularV4Reverse: boolean;
  granularV4Pitch: number;
  granularV4Attack: number;
  granularV4Decay: number;
  granularV4Blur: number;
  granularV4GrainOct: number;
  granularV4Spray: number;
  granularV4Density: number;
  granularV4TempoSync: boolean;
  granularV4TempoDiv: GranularTempoDivision;
  granularV4GrainSize: number;
  granularV4Pan: number;
  granularV4Gain: number;
  granularV4PosLFORate: number;
  granularV4PosLFODepth: number;
  granularV4PanLFORate: number;
  granularV4StereoSpread: number;
  granularV4ReverseLFORate: number;
  granularV4WriteFollow: number;
  granularV4RecordLFORate: number;

  // Legacy granular params (for legacy mode compatibility)
  granularLegacyJitter: number;       // 0..30 ms
  granularLegacyProbability: number;   // 0..1
  granularLegacyPitchMode: 'random' | 'harmonic';
  granularLegacyPitchSpread: number;   // 0..12
  granularLegacyMaxGrains: number;     // 0..128
  granularLegacyFeedback: number;      // 0..0.35

  // ─── Granular Harmony ───
  granularChordBias: number;            // 0..1 — blend grain pitch toward chord tones

  // ─── Granular Multi-Tap Delay ───
  granularDelayEnabled: boolean;        // Delay on/off
  granularDelayActivity: number;        // 0..1 macro: tap count + syncopation
  granularDelayRepeats: number;         // 0..0.85 feedback cycles
  granularDelayTime: string;            // note division base (1/4, 1/8, etc.)
  granularDelayFilter: number;          // 0..1 maps to 200-8000Hz tone LPF
  granularDelayVibrato: number;         // 0..1 per-tap delay time modulation
  granularDelayMix: number;             // 0..1 Delay B output level
  granularDelayReverbSend: number;      // 0..1 delay output to reverb

  // ─── Granular Macros ───
  granularMacroActivity: number;        // 0..1 density/overlap/size macro
  granularMacroTexture: number;         // 0..1 blur/spray/grainSize/grainOct/decay
  granularMacroComplexity: number;      // 0..1 LFO rates/motion/pan activity
  granularMacroDarkness: number;        // 0..1 speed/pitch/filter/repeats
  granularMacroChaos: number;           // 0..1 reverseLFO/spray/grainOct/vibrato

  // Random Walk (for dual sliders)
  randomWalkSpeed: number;    // 0.1..5 - speed of random walk between dual slider values
}

// Sorted keys for stable serialization
const STATE_KEYS: (keyof SliderState)[] = [
  'masterVolume',
  'synthLevel',
  'pad2Level',
  'granularLevel',
  'pad1ReverbSend',
  'pad2ReverbSend',
  'pad1DelayASend',
  'pad1DelayBSend',
  'pad2DelayASend',
  'pad2DelayBSend',
  'leadReverbSend',
  'lead1DelayASend',
  'lead1DelayBSend',
  'lead2DelayASend',
  'lead2DelayBSend',
  'pianoLevel',
  'pianoDelayASend',
  'pianoDelayBSend',
  'delayAReverbSend',
  'drumDelayASend',
  'delayAToBSend',
  'delayAGranularSend',
  'delayBGranularSend',
  'delayAPingPong',
  'delayAModRate',
  'delayAModDepth',
  'delayADuck',
  'delayAFilterType',
  'delayAWidth',
  'delayBPattern',
  'delayBWarp',
  'delayBWarpIntensity',
  'delayBSpread',
  'delayBToASend',
  'delayACrossFeedFilter',
  'drumDelayBSend',
  'granularDelayMix',
  'reverbLevel',
  'masterSatDrive',
  'masterSatMode',
  'masterSatTone',
  'dynamicsEnabled',
  'dynamicsSaturationEnabled',
  'dynamicsSaturationMode',
  'dynamicsSaturationDrive',
  'dynamicsSaturationTone',
  'dynamicsSaturationBias',
  'sidechainEnabled',
  'sidechainKeyA',
  'sidechainKeyB',
  'sidechainKeyAWeight',
  'sidechainKeyBWeight',
  'sidechainAmount',
  'sidechainThreshold',
  'sidechainRatio',
  'sidechainKnee',
  'sidechainAttackMs',
  'sidechainHoldMs',
  'sidechainReleaseMs',
  'sidechainMakeup',
  'sidechainMix',
  'sidechainCurve',
  'sidechainDetectorHp',
  'sidechainDetectorLp',
  'sidechainPad1Target',
  'sidechainPad2Target',
  'sidechainLead1Target',
  'sidechainLead2Target',
  'sidechainPianoTarget',
  'sidechainGranularTarget',
  'sidechainDelayATarget',
  'sidechainDelayBTarget',
  'sidechainReverbTarget',
  'characterEnabled',
  'characterMode',
  'characterMix',
  'characterAge',
  'degradeEnabled',
  'degradeMix',
  'degradeAge',
  'degradeGeneration',
  'degradeAlias',
  'degradeWow',
  'degradeFlutter',
  'degradeDrift',
  'degradeWobbleSpeed',
  'degradeTone',
  'degradeHp',
  'degradeLp',
  'characterResonance',
  'degradeNoise',
  'degradeSaturation',
  'degradeCorrosion',
  'degradeModSlowWow',
  'degradeModSlowFlutter',
  'degradeModSlowLp',
  'degradeModSlowWet',
  'degradeModSlowDropout',
  'degradeModSlowAlias',
  'degradeModFlutterWow',
  'degradeModFlutterFlutter',
  'degradeModFlutterLp',
  'degradeModFlutterWet',
  'degradeModFlutterDropout',
  'degradeModFlutterAlias',
  'degradeModRandomWow',
  'degradeModRandomFlutter',
  'degradeModRandomLp',
  'degradeModRandomWet',
  'degradeModRandomDropout',
  'degradeModRandomAlias',
  'degradeModEnvWow',
  'degradeModEnvFlutter',
  'degradeModEnvLp',
  'degradeModEnvWet',
  'degradeModEnvDropout',
  'degradeModEnvAlias',
  'degradeModNoiseWow',
  'degradeModNoiseFlutter',
  'degradeModNoiseLp',
  'degradeModNoiseWet',
  'degradeModNoiseDropout',
  'degradeModNoiseAlias',
  'characterStereo',
  'characterEnvFollow',
  'characterDepth',
  'characterRate',
  'characterDamp',
  'endCompEnabled',
  'endCompThreshold',
  'endCompKnee',
  'endCompRatio',
  'endCompAttackMs',
  'endCompReleaseMs',
  'endCompMakeup',
  'endCompMix',
  'endCompDetectorHp',
  'endCompDetectorTilt',
  'endCompAutoMakeup',
  'endCompProgramRelease',
  'seedWindow',
  'randomness',
  'randomWalkSpeed',
  'randomWalkMode',
  'rootNote',
  'cofDriftEnabled',
  'cofDriftRate',
  'cofDriftDirection',
  'cofDriftRange',
  'transportPrimaryClock',
  'transportBarsPerPhrase',
  'transportBeatsPerBar',
  'harmonyClockSource',
  'harmonySyncPolicy',
  'leadRandomClockSource',
  'leadRandomSyncPolicy',
  'leadRandomSource',
  'synthEuclidClockSource',
  'synthEuclidJoinPolicy',
  'drumEuclidClockSource',
  'drumEuclidJoinPolicy',
  'chordProgressionEnabled',
  'chordProgressionPattern',
  'chordProgressionSteps',
  'chordProgressionStepEnabled',
  'chordProgressionPhraseMultiplier',
  'chordProgressionClockSource',
  'scaleMode',
  'manualScale',
  'tension',
  'chordRate',
  'voicingSpread',
  'waveSpread',
  'detune',
  'synthAttack',
  'synthDecay',
  'synthSustain',
  'synthRelease',
  'hardness',
  'filterType',
  'filterCutoffMin',
  'filterCutoffMax',
  'filterResonance',
  'filterQ',
  'filterSlope',
  'filterKeyTracking',
  'warmth',
  'presence',
  'padFoldAmount',
  'padFoldMode',
  // Pad Synth Extended
  'padPresetA',
  'padPresetB',
  'padMorph',
  'padOscAWave',
  'padOscAOctave',
  'padOscADetune',
  'padOscALevel',
  'padOscBWave',
  'padOscBOctave',
  'padOscBDetune',
  'padOscBLevel',
  'padSubEnabled',
  'padSubOctave',
  'padSubWave',
  'padSubLevel',
  'padNoiseType',
  'padNoiseLevel',
  'padFilterBEnabled',
  'padFilterBType',
  'padFilterBCutoff',
  'padFilterBResonance',
  'padFilterBQ',
  'padFilterRouting',
  'padLfo1Rate',
  'padLfo1Depth',
  'padLfo1Wave',
  'padLfo1Dest',
  'padLfo2Rate',
  'padLfo2Depth',
  'padLfo2Wave',
  'padLfo2Dest',
  'padModEnvEnabled',
  'padModEnvAttack',
  'padModEnvDecay',
  'padModEnvSustain',
  'padModEnvRelease',
  'padModEnvDepth',
  'padModEnvDest',
  'padMorphAuto',
  'padMorphSpeed',
  'padOscMix',
  'padDistance',
  'padPostLPF',
  'padStereoWidth',
  'padDiffuseSend',
  // Pad Synth 2
  'pad2Enabled',
  'pad2VoiceAssign',
  'pad2Attack',
  'pad2Decay',
  'pad2Sustain',
  'pad2Release',
  'pad2Octave',
  'pad2Hardness',
  'pad2Warmth',
  'pad2Presence',
  'pad2FoldAmount',
  'pad2FoldMode',
  'pad2OscMix',
  'pad2FilterType',
  'pad2FilterCutoffMin',
  'pad2FilterCutoffMax',
  'pad2FilterResonance',
  'pad2FilterQ',
  'pad2FilterSlope',
  'pad2FilterKeyTracking',
  'pad2OscAWave',
  'pad2OscAOctave',
  'pad2OscADetune',
  'pad2OscALevel',
  'pad2OscBWave',
  'pad2OscBOctave',
  'pad2OscBDetune',
  'pad2OscBLevel',
  'pad2SubEnabled',
  'pad2SubOctave',
  'pad2SubWave',
  'pad2SubLevel',
  'pad2NoiseType',
  'pad2NoiseLevel',
  'pad2FilterBEnabled',
  'pad2FilterBType',
  'pad2FilterBCutoff',
  'pad2FilterBResonance',
  'pad2FilterBQ',
  'pad2FilterRouting',
  'pad2Lfo1Rate',
  'pad2Lfo1Depth',
  'pad2Lfo1Wave',
  'pad2Lfo1Dest',
  'pad2Lfo2Rate',
  'pad2Lfo2Depth',
  'pad2Lfo2Wave',
  'pad2Lfo2Dest',
  'pad2ModEnvEnabled',
  'pad2ModEnvAttack',
  'pad2ModEnvDecay',
  'pad2ModEnvSustain',
  'pad2ModEnvRelease',
  'pad2ModEnvDepth',
  'pad2ModEnvDest',
  'pad2PresetA',
  'pad2PresetB',
  'pad2Morph',
  'pad2MorphAuto',
  'pad2MorphSpeed',
  'pad2Distance',
  'pad2PostLPF',
  'pad2StereoWidth',
  'pad2DiffuseSend',
  'reverbEngine',
  'reverbType',
  'reverbQuality',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'reverbShimmer',
  'reverbShimmerPitch',
  'reverbSlowModRate',
  'reverbSlowModDepth',
  'reverbReverse',
  'reverbReverseLength',
  // v2 params
  'reverbChorusRate',
  'reverbChorusDepth',
  'reverbModCharacter',
  'reverbDampLow',
  'reverbDampHigh',
  'reverbCrossoverFreq',
  'reverbInputTone',
  'reverbShimmerFeedback',
  // v3 params
  'reverbWarp',
  'reverbCrossFeed',
  // v4 params
  'reverbEarlyReflections',
  'reverbAirAbsorption',
  'reverbSaturationMode',
  // v5/v6 params
  'reverbTransientSmooth',
  'reverbErLpFreq',
  'reverbPreCompThreshold',
  'reverbPreCompKnee',
  'reverbPreCompRatio',
  'reverbPreCompAttackMs',
  'reverbPreCompReleaseMs',
  'reverbPreCompMakeup',
  'reverbScaleShimmer',
  'reverbChordWash',
  'reverbResolutionBloom',
  'reverbEnabled',
  // Spectral Freeze
  'spectralFreezeEnabled',
  'spectralFreezeActive',
  'spectralFreezeSlushy',
  'spectralFreezeSpeed',
  'spectralFreezeMix',
  'spectralFreezeDecay',
  'spectralFreezePhaseJitter',
  'spectralFreezeRouting',
  'spectralFreezeReverbCrossfade',
  'maxGrains',
  'grainProbability',
  'grainSize',
  'density',
  'spray',
  'jitter',
  'grainPitchMode',
  'pitchSpread',
  'stereoSpread',
  'feedback',
  'wetHPF',
  'wetLPF',
  'padEnabled',
  'leadEnabled',
  'leadRandomEnabled',
  'leadRandomSource',
  'leadLevel',
  'lead1UseCustomAdsr',
  'lead1Attack',
  'lead1Decay',
  'lead1Sustain',
  'lead1Release',
  'delayATime',
  'delayAFeedback',
  'delayAMix',
  'delayAEnabled',
  'delayASpread',
  'delayAFilter',
  'delayASend',
  'lead1Density',
  'lead1Octave',
  'lead1OctaveRange',
  'leadTimbre',
  // Lead 1 morph
  'lead1PresetA',
  'lead1PresetB',
  'lead1Morph',
  'lead1MorphAuto',
  'lead1MorphSpeed',
  'lead1MorphMode',
  'lead1AlgorithmMode',
  'lead1Level',
  'lead1ReverbSend',
  'lead1Distance',
  'lead1PostLPF',
  'lead1PostLPFKeyTracking',
  'lead1StereoWidth',
  'lead1DiffuseSend',
  // Lead 2 morph
  'lead2Enabled',
  'lead2PresetC',
  'lead2PresetD',
  'lead2Morph',
  'lead2MorphAuto',
  'lead2MorphSpeed',
  'lead2MorphMode',
  'lead2AlgorithmMode',
  'lead2Level',
  'lead2ReverbSend',
  'lead2UseCustomAdsr',
  'lead2Attack',
  'lead2Decay',
  'lead2Sustain',
  'lead2Release',
  'lead2Distance',
  'lead2PostLPF',
  'lead2PostLPFKeyTracking',
  'lead2StereoWidth',
  'lead2DiffuseSend',
  'pianoEnabled',
  'pianoAttack',
  'pianoDecay',
  'pianoSustain',
  'pianoHold',
  'pianoRelease',
  'pianoReverbSend',
  'pianoDistance',
  'pianoPostLPF',
  'pianoStereoWidth',
  'pianoDiffuseSend',
  'pianoLevel',
  'pianoDelayASend',
  'pianoDelayBSend',
  'leadVibratoDepth',
  'leadVibratoRate',
  'leadGlide',
  'sequencerMasterBPM',
  'synthEuclideanMasterEnabled',
  'synthEuclidBaseBPM',
  'synthEuclideanTempo',
  'synthEuclid1Enabled',
  'synthEuclid1Preset',
  'synthEuclid1Steps',
  'synthEuclid1Hits',
  'synthEuclid1Rotation',
  'synthEuclid1NoteMin',
  'synthEuclid1NoteMax',
  'synthEuclid1Level',
  'synthEuclid1Probability',
  'synthEuclid1Source',
  'synthEuclid2Enabled',
  'synthEuclid2Preset',
  'synthEuclid2Steps',
  'synthEuclid2Hits',
  'synthEuclid2Rotation',
  'synthEuclid2NoteMin',
  'synthEuclid2NoteMax',
  'synthEuclid2Level',
  'synthEuclid2Probability',
  'synthEuclid2Source',
  'synthEuclid3Enabled',
  'synthEuclid3Preset',
  'synthEuclid3Steps',
  'synthEuclid3Hits',
  'synthEuclid3Rotation',
  'synthEuclid3NoteMin',
  'synthEuclid3NoteMax',
  'synthEuclid3Level',
  'synthEuclid3Probability',
  'synthEuclid3Source',
  'synthEuclid4Enabled',
  'synthEuclid4Preset',
  'synthEuclid4Steps',
  'synthEuclid4Hits',
  'synthEuclid4Rotation',
  'synthEuclid4NoteMin',
  'synthEuclid4NoteMax',
  'synthEuclid4Level',
  'synthEuclid4Probability',
  'synthEuclid4Source',
  'synthChordSequencerEnabled',
  // Drum Synth
  'drumEnabled',
  'drumLevel',
  'drumReverbSend',
  'drumSubFreq',
  'drumSubDecay',
  'drumSubLevel',
  'drumSubTone',
  'drumSubShape',
  'drumSubPitchEnv',
  'drumSubPitchDecay',
  'drumSubDrive',
  'drumSubSub',
  'drumSubAttack',
  'drumSubVariation',
  'drumSubDistance',
  'drumKickFreq',
  'drumKickPitchEnv',
  'drumKickPitchDecay',
  'drumKickDecay',
  'drumKickLevel',
  'drumKickClick',
  'drumKickBody',
  'drumKickPunch',
  'drumKickTail',
  'drumKickTone',
  'drumKickAttack',
  'drumKickVariation',
  'drumKickDistance',
  'drumClickDecay',
  'drumClickFilter',
  'drumClickTone',
  'drumClickLevel',
  'drumClickResonance',
  'drumClickPitch',
  'drumClickPitchEnv',
  'drumClickMode',
  'drumClickGrainCount',
  'drumClickGrainSpread',
  'drumClickStereoWidth',
  'drumClickAttack',
  'drumClickVariation',
  'drumClickDistance',
  'drumBeepHiFreq',
  'drumBeepHiAttack',
  'drumBeepHiDecay',
  'drumBeepHiLevel',
  'drumBeepHiTone',
  'drumBeepHiInharmonic',
  'drumBeepHiPartials',
  'drumBeepHiShimmer',
  'drumBeepHiShimmerRate',
  'drumBeepHiBrightness',
  'drumBeepHiFeedback',
  'drumBeepHiModEnvDecay',
  'drumBeepHiNoiseInMod',
  'drumBeepHiModRatio',
  'drumBeepHiModRatioFine',
  'drumBeepHiModPhase',
  'drumBeepHiModEnvEnd',
  'drumBeepHiNoiseDecay',
  'drumBeepHiVariation',
  'drumBeepHiDistance',
  'drumBeepLoFreq',
  'drumBeepLoAttack',
  'drumBeepLoDecay',
  'drumBeepLoLevel',
  'drumBeepLoTone',
  'drumBeepLoPitchEnv',
  'drumBeepLoPitchDecay',
  'drumBeepLoBody',
  'drumBeepLoPluck',
  'drumBeepLoPluckDamp',
  'drumBeepLoModal',
  'drumBeepLoModalQ',
  'drumBeepLoModalInharmonic',
  'drumBeepLoModalSpread',
  'drumBeepLoModalCut',
  'drumBeepLoOscGain',
  'drumBeepLoModalGain',
  'drumBeepLoVariation',
  'drumBeepLoDistance',
  'drumNoiseFilterFreq',
  'drumNoiseFilterQ',
  'drumNoiseFilterType',
  'drumNoiseDecay',
  'drumNoiseLevel',
  'drumNoiseAttack',
  'drumNoiseFormant',
  'drumNoiseBreath',
  'drumNoiseFilterEnv',
  'drumNoiseFilterEnvDecay',
  'drumNoiseDensity',
  'drumNoiseColorLFO',
  'drumNoiseParticleSize',
  'drumNoiseParticleRandom',
  'drumNoiseParticleRandomRate',
  'drumNoiseRatchetCount',
  'drumNoiseRatchetTime',
  'drumNoiseVariation',
  'drumNoiseDistance',
  'drumMembraneExciter',
  'drumMembraneExcPos',
  'drumMembraneExcBright',
  'drumMembraneExcDur',
  'drumMembraneSize',
  'drumMembraneStiffness',
  'drumMembraneDamping',
  'drumMembraneMaterial',
  'drumMembraneNonlin',
  'drumMembraneWireMix',
  'drumMembraneWireDensity',
  'drumMembraneWireTone',
  'drumMembraneWireDecay',
  'drumMembraneBody',
  'drumMembraneRing',
  'drumMembraneOvertones',
  'drumMembranePitchEnv',
  'drumMembranePitchDecay',
  'drumMembraneAttack',
  'drumMembraneDecay',
  'drumMembraneLevel',
  'drumMembraneVariation',
  'drumMembraneDistance',
  'drumMorphSliderAnimate',
  // Drum Voice Morph System
  'drumSubPresetA',
  'drumSubPresetB',
  'drumSubMorph',
  'drumSubMorphAuto',
  'drumSubMorphSpeed',
  'drumSubMorphMode',
  'drumKickPresetA',
  'drumKickPresetB',
  'drumKickMorph',
  'drumKickMorphAuto',
  'drumKickMorphSpeed',
  'drumKickMorphMode',
  'drumClickPresetA',
  'drumClickPresetB',
  'drumClickMorph',
  'drumClickMorphAuto',
  'drumClickMorphSpeed',
  'drumClickMorphMode',
  'drumBeepHiPresetA',
  'drumBeepHiPresetB',
  'drumBeepHiMorph',
  'drumBeepHiMorphAuto',
  'drumBeepHiMorphSpeed',
  'drumBeepHiMorphMode',
  'drumBeepLoPresetA',
  'drumBeepLoPresetB',
  'drumBeepLoMorph',
  'drumBeepLoMorphAuto',
  'drumBeepLoMorphSpeed',
  'drumBeepLoMorphMode',
  'drumNoisePresetA',
  'drumNoisePresetB',
  'drumNoiseMorph',
  'drumNoiseMorphAuto',
  'drumNoiseMorphSpeed',
  'drumNoiseMorphMode',
  'drumMembranePresetA',
  'drumMembranePresetB',
  'drumMembraneMorph',
  'drumMembraneMorphAuto',
  'drumMembraneMorphSpeed',
  'drumMembraneMorphMode',
  'drumDelayEnabled',
  'drumDelayNoteL',
  'drumDelayNoteR',
  'drumDelayFeedback',
  'drumDelayMix',
  'drumDelayFilter',
  'drumSubDelaySend',
  'drumKickDelaySend',
  'drumClickDelaySend',
  'drumBeepHiDelaySend',
  'drumBeepLoDelaySend',
  'drumNoiseDelaySend',
  'drumMembraneDelaySend',
  'drumEuclidMasterEnabled',
  'drumEuclidBaseBPM',
  'drumEuclidTempo',
  'drumEuclidSwing',
  'drumEuclidDivision',
  'drumEuclid1Enabled',
  'drumEuclid1Preset',
  'drumEuclid1Steps',
  'drumEuclid1Hits',
  'drumEuclid1Rotation',
  'drumEuclid1TargetSub',
  'drumEuclid1TargetKick',
  'drumEuclid1TargetClick',
  'drumEuclid1TargetBeepHi',
  'drumEuclid1TargetBeepLo',
  'drumEuclid1TargetNoise',
  'drumEuclid1TargetMembrane',
  'drumEuclid1Probability',
  'drumEuclid1VelocityMin',
  'drumEuclid1VelocityMax',
  'drumEuclid1Level',
  'drumEuclid2Enabled',
  'drumEuclid2Preset',
  'drumEuclid2Steps',
  'drumEuclid2Hits',
  'drumEuclid2Rotation',
  'drumEuclid2TargetSub',
  'drumEuclid2TargetKick',
  'drumEuclid2TargetClick',
  'drumEuclid2TargetBeepHi',
  'drumEuclid2TargetBeepLo',
  'drumEuclid2TargetNoise',
  'drumEuclid2TargetMembrane',
  'drumEuclid2Probability',
  'drumEuclid2VelocityMin',
  'drumEuclid2VelocityMax',
  'drumEuclid2Level',
  'drumEuclid3Enabled',
  'drumEuclid3Preset',
  'drumEuclid3Steps',
  'drumEuclid3Hits',
  'drumEuclid3Rotation',
  'drumEuclid3TargetSub',
  'drumEuclid3TargetKick',
  'drumEuclid3TargetClick',
  'drumEuclid3TargetBeepHi',
  'drumEuclid3TargetBeepLo',
  'drumEuclid3TargetNoise',
  'drumEuclid3TargetMembrane',
  'drumEuclid3Probability',
  'drumEuclid3VelocityMin',
  'drumEuclid3VelocityMax',
  'drumEuclid3Level',
  'drumEuclid4Enabled',
  'drumEuclid4Preset',
  'drumEuclid4Steps',
  'drumEuclid4Hits',
  'drumEuclid4Rotation',
  'drumEuclid4TargetSub',
  'drumEuclid4TargetKick',
  'drumEuclid4TargetClick',
  'drumEuclid4TargetBeepHi',
  'drumEuclid4TargetBeepLo',
  'drumEuclid4TargetNoise',
  'drumEuclid4TargetMembrane',
  'drumEuclid4Probability',
  'drumEuclid4VelocityMin',
  'drumEuclid4VelocityMax',
  'drumEuclid4Level',
  // Ocean
  'earthLevel',
  'oceanSampleEnabled',
  'oceanSampleLevel', 'oceanReverbSend', 'oceanDelayASend', 'oceanDelayBSend',
  'oceanSliceDuration', 'oceanSliceDensity',
  'oceanFilterType',
  'oceanFilterCutoff',
  'oceanFilterResonance',
  'birdsEnabled', 'birdsLevel', 'birdsReverbSend', 'birdsDelayASend', 'birdsDelayBSend', 'birdsSliceDuration', 'birdsSliceDensity',
  'birds2Enabled', 'birds2Level', 'birds2ReverbSend', 'birds2DelayASend', 'birds2DelayBSend', 'birds2SliceDuration', 'birds2SliceDensity',
  'frogsEnabled', 'frogsLevel', 'frogsReverbSend', 'frogsDelayASend', 'frogsDelayBSend', 'frogsSliceDuration', 'frogsSliceDensity',
  'natureLevel', 'natureReverbSend', 'natureDelayASend', 'natureDelayBSend',
  // Soundscapes (Water + Insects)
  'waterEnabled',
  'waterPreset', 'waterMorphA', 'waterMorphB', 'waterMorph',
  'waterIntensity', 'waterDistance', 'waterBaseFreq',
  'waterDropSize', 'waterHardness', 'waterGlassThickness',
  'waterReverbSend', 'waterDelayASend', 'waterDelayBSend', 'waterLevel',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerSurf', 'waterLayerChannels',
  'waterHardDropBaseFreq', 'waterHardDropRate', 'waterHardDropLPF', 'waterHardDropTone',
  'waterWaterDropBaseFreq', 'waterWaterDropRate', 'waterWaterDropLPF',
  'waterBubblingRate', 'waterBubblingLPF',
  'waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfFoamBright', 'waterSurfProximity', 'waterSurfDepth',
  'waterSurfBody', 'waterSurfSpray',
  'waterDensityHardSend', 'waterDensityWaterSend', 'waterDensityBubbleSend',
  'waterDensityFeedback', 'waterDensityTone', 'waterDensityRing', 'waterDensityWet',
  'waterChannelsMorph', 'waterChannelsSpeed',
  'insectsEnabled', 'insectsEngine',
  'insectsDensity', 'insectsTemperature', 'insectsDistance', 'insectsProximity',
  'insectsAntiphony', 'insectsClickRate', 'insectsMotion', 'insectsLevel', 'insectsSharedLevel', 'insectsReverbSend', 'insDelayASend', 'insDelayBSend',
  'insects2Enabled', 'insects2Engine',
  'insects2Density', 'insects2Temperature', 'insects2Distance', 'insects2Proximity',
  'insects2Antiphony', 'insects2ClickRate', 'insects2Motion', 'insects2Level',
  'randomWalkSpeed',
  // Granular FX
  'granularEnabled',
  'granularFreeze',
  'granularFeedback',
  'granularFeedbackLPF',
  'granularBufferSeconds',
  'granularPreset',
  'granularSpaceMode',
  'granularPresetBehavior',
  'delayBGranularLinked',
  'granularShape',
  'granularDiffusion',
  'granularReverbSend',
  'granularReverbLPF',
  'granularOutputLPF',
  'granularDelayASend', 'granularDelayBSend',
  'granularPad1Send', 'granularPad2Send', 'granularLead1Send', 'granularLead2Send', 'granularPianoSend', 'granularDrumSend', 'granularWavesSend', 'granularNatureSend', 'granularWaterSend', 'granularInsectsSend',
  'granularV1Enabled', 'granularV1Mode', 'granularV1Slice', 'granularV1Speed', 'granularV1Reverse',
  'granularV1ScanRate',
  'granularV1Pitch', 'granularV1Attack', 'granularV1Decay', 'granularV1Blur', 'granularV1GrainOct',
  'granularV1Spray', 'granularV1Density', 'granularV1TempoSync', 'granularV1TempoDiv', 'granularV1GrainSize', 'granularV1Pan', 'granularV1Gain',
  'granularV1PosLFORate', 'granularV1PosLFODepth', 'granularV1PanLFORate', 'granularV1StereoSpread',
  'granularV1ReverseLFORate', 'granularV1WriteFollow', 'granularV1RecordLFORate',
  'granularV2Enabled', 'granularV2Mode', 'granularV2Slice', 'granularV2Speed', 'granularV2Reverse',
  'granularV2ScanRate',
  'granularV2Pitch', 'granularV2Attack', 'granularV2Decay', 'granularV2Blur', 'granularV2GrainOct',
  'granularV2Spray', 'granularV2Density', 'granularV2TempoSync', 'granularV2TempoDiv', 'granularV2GrainSize', 'granularV2Pan', 'granularV2Gain',
  'granularV2PosLFORate', 'granularV2PosLFODepth', 'granularV2PanLFORate', 'granularV2StereoSpread',
  'granularV2ReverseLFORate', 'granularV2WriteFollow', 'granularV2RecordLFORate',
  'granularV3Enabled', 'granularV3Mode', 'granularV3Slice', 'granularV3Speed', 'granularV3Reverse',
  'granularV3ScanRate',
  'granularV3Pitch', 'granularV3Attack', 'granularV3Decay', 'granularV3Blur', 'granularV3GrainOct',
  'granularV3Spray', 'granularV3Density', 'granularV3TempoSync', 'granularV3TempoDiv', 'granularV3GrainSize', 'granularV3Pan', 'granularV3Gain',
  'granularV3PosLFORate', 'granularV3PosLFODepth', 'granularV3PanLFORate', 'granularV3StereoSpread',
  'granularV3ReverseLFORate', 'granularV3WriteFollow', 'granularV3RecordLFORate',
  'granularV4Enabled', 'granularV4Mode', 'granularV4Slice', 'granularV4Speed', 'granularV4Reverse',
  'granularV4ScanRate',
  'granularV4Pitch', 'granularV4Attack', 'granularV4Decay', 'granularV4Blur', 'granularV4GrainOct',
  'granularV4Spray', 'granularV4Density', 'granularV4TempoSync', 'granularV4TempoDiv', 'granularV4GrainSize', 'granularV4Pan', 'granularV4Gain',
  'granularV4PosLFORate', 'granularV4PosLFODepth', 'granularV4PanLFORate', 'granularV4StereoSpread',
  'granularV4ReverseLFORate', 'granularV4WriteFollow', 'granularV4RecordLFORate',
  'granularLegacyJitter', 'granularLegacyProbability', 'granularLegacyPitchMode',
  'granularLegacyPitchSpread', 'granularLegacyMaxGrains', 'granularLegacyFeedback',
  'granularChordBias',
  // Delay
  'granularDelayEnabled', 'granularDelayActivity', 'granularDelayRepeats', 'granularDelayTime',
  'granularDelayFilter', 'granularDelayVibrato', 'granularDelayMix', 'granularDelayReverbSend',
  // Macros
  'granularMacroActivity', 'granularMacroTexture', 'granularMacroComplexity', 'granularMacroDarkness', 'granularMacroChaos',
];

/**
 * Default slider state with conservative values for performance
 */
export const DEFAULT_STATE: SliderState = {
  // Master Mixer
  masterVolume: 0.7,
  synthLevel: 0.6,
  pad2Level: 0.6,
  granularLevel: 0.5,
  pad1ReverbSend: 0.7,
  pad2ReverbSend: 0.7,
  pad1DelayASend: 0,
  pad1DelayBSend: 0,
  pad2DelayASend: 0,
  pad2DelayBSend: 0,
  leadReverbSend: 0.5,
  lead1DelayASend: 1,
  lead1DelayBSend: 0,
  lead2DelayASend: 1,
  lead2DelayBSend: 0,
  pianoLevel: 0.75,
  pianoDelayASend: 0,
  pianoDelayBSend: 0,
  delayAReverbSend: 0.4,
  drumDelayASend: 1,
  delayAToBSend: 0,
  delayAGranularSend: 0,
  delayBGranularSend: 0,
  delayAPingPong: false,
  delayAModRate: 0,
  delayAModDepth: 0,
  delayADuck: 0,
  delayAFilterType: 'lowpass' as const,
  delayAWidth: 0.5,
  delayBPattern: 'cascade' as const,
  delayBWarp: 'clean' as const,
  delayBWarpIntensity: 0.5,
  delayBSpread: 0.5,
  delayBToASend: 0,
  delayACrossFeedFilter: 1,
  drumDelayBSend: 0,
  reverbLevel: 0.5,
  masterSatDrive: 0,
  masterSatMode: 'clean' as const,
  masterSatTone: 0.5,
  dynamicsEnabled: false,
  dynamicsSaturationEnabled: false,
  dynamicsSaturationMode: 'clean' as const,
  dynamicsSaturationDrive: 0,
  dynamicsSaturationTone: 0.5,
  dynamicsSaturationBias: 0.5,
  sidechainEnabled: false,
  sidechainKeyA: 'kick' as const,
  sidechainKeyB: 'off' as const,
  sidechainKeyAWeight: 1,
  sidechainKeyBWeight: 0.7,
  sidechainAmount: 0.5,
  sidechainThreshold: -24,
  sidechainRatio: 4,
  sidechainKnee: 6,
  sidechainAttackMs: 5,
  sidechainHoldMs: 20,
  sidechainReleaseMs: 180,
  sidechainMakeup: 1,
  sidechainMix: 1,
  sidechainCurve: 0.5,
  sidechainDetectorHp: 0,
  sidechainDetectorLp: 1,
  sidechainPad1Target: 0,
  sidechainPad2Target: 0,
  sidechainLead1Target: 0,
  sidechainLead2Target: 0,
  sidechainPianoTarget: 0,
  sidechainGranularTarget: 0,
  sidechainDelayATarget: 0,
  sidechainDelayBTarget: 0,
  sidechainReverbTarget: 0,
  characterEnabled: false,
  characterMode: 'clean' as const,
  characterMix: 0,
  characterAge: 0,
  degradeEnabled: false,
  degradeMix: 0,
  degradeAge: 0,
  degradeGeneration: 0,
  degradeAlias: 0,
  degradeWow: 0,
  degradeFlutter: 0,
  degradeDrift: 0,
  degradeWobbleSpeed: 0.35,
  degradeTone: 0.5,
  degradeHp: 0,
  degradeLp: 1,
  characterResonance: 0.2,
  degradeNoise: 0,
  degradeSaturation: 0,
  degradeCorrosion: 0,
  degradeModSlowWow: 0.18,
  degradeModSlowFlutter: 0.02,
  degradeModSlowLp: 0.12,
  degradeModSlowWet: 0.03,
  degradeModSlowDropout: 0.04,
  degradeModSlowAlias: 0,
  degradeModFlutterWow: 0,
  degradeModFlutterFlutter: 0.12,
  degradeModFlutterLp: 0.02,
  degradeModFlutterWet: 0,
  degradeModFlutterDropout: 0.02,
  degradeModFlutterAlias: 0,
  degradeModRandomWow: 0.04,
  degradeModRandomFlutter: 0.03,
  degradeModRandomLp: 0.14,
  degradeModRandomWet: 0.02,
  degradeModRandomDropout: 0.1,
  degradeModRandomAlias: 0.02,
  degradeModEnvWow: 0,
  degradeModEnvFlutter: 0,
  degradeModEnvLp: 0.08,
  degradeModEnvWet: 0.04,
  degradeModEnvDropout: 0,
  degradeModEnvAlias: 0,
  degradeModNoiseWow: 0,
  degradeModNoiseFlutter: 0.06,
  degradeModNoiseLp: 0.02,
  degradeModNoiseWet: 0,
  degradeModNoiseDropout: 0.06,
  degradeModNoiseAlias: 0.02,
  characterWow: 0,
  characterFlutter: 0,
  characterDrift: 0,
  characterTone: 0.5,
  characterHp: 0,
  characterLp: 1,
  characterNoise: 0,
  characterSaturation: 0,
  characterCorrosion: 0,
  characterStereo: 0.5,
  characterEnvFollow: 0,
  characterDepth: 0,
  characterRate: 0.3,
  characterDamp: 0.5,
  endCompEnabled: false,
  endCompThreshold: -18,
  endCompKnee: 12,
  endCompRatio: 2,
  endCompAttackMs: 10,
  endCompReleaseMs: 180,
  endCompMakeup: 1,
  endCompMix: 1,
  endCompDetectorHp: 0.25,
  endCompDetectorTilt: 0.5,
  endCompAutoMakeup: 0.7,
  endCompProgramRelease: 0.65,

  // Global
  seedWindow: 'hour',
  randomness: 0.5,
  rootNote: 4, // E (C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11)

  // Circle of Fifths Drift
  cofDriftEnabled: false,
  cofDriftRate: 2,        // Every 2 phrases by default
  cofDriftDirection: 'cw',
  cofDriftRange: 3,       // Max 3 steps away from home
  cofCurrentStep: 0,      // Start at home key

  // Chord Progression Sequencer
  chordProgressionEnabled: false,
  chordProgressionPattern: [0, 3, 4, 0],  // I, IV, V, I
  chordProgressionSteps: 4,
  chordProgressionHits: 4,
  chordProgressionRotation: 0,
  chordProgressionStepEnabled: [true, true, true, true],
  chordProgressionPhraseMultiplier: 1 as const,
  chordProgressionClockSource: 'harmony',

  // Per-engine tension overrides
  padTensionMode: 'follow' as const,
  padTensionValue: 0,
  leadTensionMode: 'follow' as const,
  leadTensionValue: 0,
  synthEuclidTensionMode: 'follow' as const,
  synthEuclidTensionValue: 0,
  granularTensionMode: 'bypass' as const,
  granularTensionValue: 0,
  reverbTensionMode: 'bypass' as const,
  reverbTensionValue: 0,
  drumTensionMode: 'bypass' as const,
  drumTensionValue: 0,

  // Harmony/Pitch
  scaleMode: 'auto',
  manualScale: 'Major (Ionian)',
  tension: 0.3,
  chordRate: 32,
  phraseLength: 16,
  voicingSpread: 0.5,
  waveSpread: 0.125,
  detune: 8,
  synthAttack: 6.0,
  synthDecay: 1.0,
  synthSustain: 0.8,
  synthRelease: 12.0,
  transportPrimaryClock: 'seconds',
  transportBarsPerPhrase: 4,
  transportBeatsPerBar: 4,
  harmonyClockSource: 'globalPhrase',
  harmonySyncPolicy: 'nextPhrase',
  leadRandomClockSource: 'globalPhrase',
  leadRandomSyncPolicy: 'nextPhrase',
  synthEuclidClockSource: 'localBeat',
  synthEuclidJoinPolicy: 'bar',
  drumEuclidClockSource: 'localBeat',
  drumEuclidJoinPolicy: 'bar',
  randomWalkMode: 'localBrownian',
  synthVoiceMask: 63,  // All 6 voices (binary 111111)
  synthOctave: 0,      // No octave shift

  // Timbre / Drive
  hardness: 0.3,
  filterType: 'lowpass' as const,
  filterCutoffMin: 400,
  filterCutoffMax: 3000,
  filterResonance: 0.2,
  filterQ: 1.0,
  filterSlope: 12,
  filterKeyTracking: 0,
  warmth: 0.4,
  presence: 0.3,
  padFoldAmount: 0,
  padFoldMode: 0,

  // Pad Synth Extended
  padPresetA: 'init',
  padPresetB: 'init',
  padMorph: 0,
  padOscAWave: 'sawtooth' as const,
  padOscAOctave: 0,
  padOscADetune: 0,
  padOscALevel: 0.6,
  padOscBWave: 'triangle' as const,
  padOscBOctave: 0,
  padOscBDetune: 8,
  padOscBLevel: 0.4,
  padSubEnabled: false,
  padSubOctave: -1,
  padSubWave: 'sine' as const,
  padSubLevel: 0.3,
  padNoiseType: 'white' as const,
  padNoiseLevel: 0.15,
  padFilterBEnabled: false,
  padFilterBType: 'highpass' as const,
  padFilterBCutoff: 200,
  padFilterBResonance: 0.2,
  padFilterBQ: 1,
  padFilterRouting: 'series' as const,
  padLfo1Rate: 0.5,
  padLfo1Depth: 0,
  padLfo1Wave: 'sine' as const,
  padLfo1Dest: 'none' as const,
  padLfo2Rate: 0.5,
  padLfo2Depth: 0,
  padLfo2Wave: 'sine' as const,
  padLfo2Dest: 'none' as const,
  padModEnvEnabled: false,
  padModEnvAttack: 0.5,
  padModEnvDecay: 2,
  padModEnvSustain: 0,
  padModEnvRelease: 4,
  padModEnvDepth: 0.5,
  padModEnvDest: 'filterCutoff' as const,
  padMorphAuto: false,
  padMorphSpeed: 8,
  padOscMix: 0.5,  // Center = both at full level
  padDistance: 0,
  padPostLPF: 18000,
  padStereoWidth: 1,
  padDiffuseSend: 0,

  // Pad Synth 2
  pad2Enabled: false,
  pad2VoiceAssign: 0,  // No voices assigned to Pad 2
  pad2Attack: 6.0,
  pad2Decay: 1.0,
  pad2Sustain: 0.8,
  pad2Release: 12.0,
  pad2Octave: 0,
  pad2Hardness: 0.3,
  pad2Warmth: 0.4,
  pad2Presence: 0.3,
  pad2FoldAmount: 0,
  pad2FoldMode: 0,
  pad2OscMix: 0.5,
  pad2FilterType: 'lowpass' as const,
  pad2FilterCutoffMin: 400,
  pad2FilterCutoffMax: 3000,
  pad2FilterResonance: 0.2,
  pad2FilterQ: 1.0,
  pad2FilterSlope: 12,
  pad2FilterKeyTracking: 0,
  pad2OscAWave: 'sawtooth' as const,
  pad2OscAOctave: 0,
  pad2OscADetune: 0,
  pad2OscALevel: 0.6,
  pad2OscBWave: 'triangle' as const,
  pad2OscBOctave: 0,
  pad2OscBDetune: 8,
  pad2OscBLevel: 0.4,
  pad2SubEnabled: false,
  pad2SubOctave: -1,
  pad2SubWave: 'sine' as const,
  pad2SubLevel: 0.3,
  pad2NoiseType: 'white' as const,
  pad2NoiseLevel: 0.15,
  pad2FilterBEnabled: false,
  pad2FilterBType: 'highpass' as const,
  pad2FilterBCutoff: 200,
  pad2FilterBResonance: 0.2,
  pad2FilterBQ: 1,
  pad2FilterRouting: 'series' as const,
  pad2Lfo1Rate: 0.5,
  pad2Lfo1Depth: 0,
  pad2Lfo1Wave: 'sine' as const,
  pad2Lfo1Dest: 'none' as const,
  pad2Lfo2Rate: 0.5,
  pad2Lfo2Depth: 0,
  pad2Lfo2Wave: 'sine' as const,
  pad2Lfo2Dest: 'none' as const,
  pad2ModEnvEnabled: false,
  pad2ModEnvAttack: 0.5,
  pad2ModEnvDecay: 2,
  pad2ModEnvSustain: 0,
  pad2ModEnvRelease: 4,
  pad2ModEnvDepth: 0.5,
  pad2ModEnvDest: 'filterCutoff' as const,
  pad2PresetA: 'init',
  pad2PresetB: 'init',
  pad2Morph: 0,
  pad2MorphAuto: false,
  pad2MorphSpeed: 8,
  pad2Distance: 0,
  pad2PostLPF: 18000,
  pad2StereoWidth: 1,
  pad2DiffuseSend: 0,

  // Space
  reverbEnabled: true,
  reverbEngine: 'algorithmic',
  reverbType: 'cathedral',
  reverbQuality: 'balanced',  // ultra, balanced, lite
  reverbDecay: 0.9,
  reverbSize: 2.0,
  reverbDiffusion: 1.0,
  reverbModulation: 0.4,
  predelay: 60,
  damping: 0.2,
  width: 0.85,
  reverbShimmer: 0,
  reverbShimmerPitch: 12,
  reverbSlowModRate: 0.05,
  reverbSlowModDepth: 0,
  reverbReverse: 0,
  reverbReverseLength: 2,

  // Reverb v2 params
  reverbChorusRate: 0.5,
  reverbChorusDepth: 12,
  reverbModCharacter: 'hybrid' as const,
  reverbDampLow: 0.1,
  reverbDampHigh: 0.3,
  reverbCrossoverFreq: 800,
  reverbInputTone: 0,
  reverbShimmerFeedback: 0,

  // Reverb v3 params
  reverbWarp: 0,
  reverbCrossFeed: 0,
  // v4 defaults
  reverbEarlyReflections: 0.3,
  reverbAirAbsorption: 0.2,
  reverbSaturationMode: 'clean' as const,

  // v5 defaults
  reverbTransientSmooth: 0,
  reverbErLpFreq: 2500,
  reverbPreCompThreshold: DEFAULT_REVERB_PRE_COMP.threshold,
  reverbPreCompKnee: DEFAULT_REVERB_PRE_COMP.knee,
  reverbPreCompRatio: DEFAULT_REVERB_PRE_COMP.ratio,
  reverbPreCompAttackMs: DEFAULT_REVERB_PRE_COMP.attackMs,
  reverbPreCompReleaseMs: DEFAULT_REVERB_PRE_COMP.releaseMs,
  reverbPreCompMakeup: DEFAULT_REVERB_PRE_COMP.makeup,

  // Reverb Harmony
  reverbScaleShimmer: false,
  reverbChordWash: false,
  reverbResolutionBloom: false,

  // Spectral Freeze
  spectralFreezeEnabled: false,
  spectralFreezeActive: false,
  spectralFreezeSlushy: false,
  spectralFreezeSpeed: 0.3,
  spectralFreezeMix: 1.0,
  spectralFreezeDecay: 1.0,
  spectralFreezePhaseJitter: 0.0,
  spectralFreezeRouting: 'pre' as const,
  spectralFreezeReverbCrossfade: 1.0,

  // Granular (legacy defaults)
  maxGrains: 64,
  grainProbability: 0.8,
  grainSize: 50,
  density: 25,
  spray: 200,
  jitter: 10,
  grainPitchMode: 'harmonic' as const,
  pitchSpread: 3,
  stereoSpread: 0.6,
  feedback: 0.1,
  wetHPF: 500,
  wetLPF: 8000,

  // Pad Synth
  padEnabled: true,

  // Lead Synth (Rhodes/Bell)
  leadEnabled: false,
  leadRandomEnabled: false,
  leadRandomSource: 'lead1',
  leadLevel: 0,
  lead1UseCustomAdsr: false,
  lead1Attack: 0.01,
  lead1Decay: 0.8,
  lead1Sustain: 0.3,
  lead1Hold: 0.5,
  lead1Release: 2.0,
  delayATime: 375,
  delayAFeedback: 0.4,
  delayAMix: 0.35,
  delayAEnabled: true,
  delayASpread: 1.5,
  delayAFilter: 2000,
  delayASend: 0.5,
  lead1Density: 0.5,
  lead1Octave: 1,
  lead1OctaveRange: 2,
  leadTimbre: 0.4,
  // Lead 1 — 4op FM preset morph
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1Morph: 0,
  lead1MorphAuto: false,
  lead1MorphSpeed: 8,
  lead1MorphMode: 'pingpong' as const,
  lead1AlgorithmMode: 'snap' as const,
  lead1Level: 0.8,
  lead1ReverbSend: 0.5,
  lead1Distance: 0,
  lead1PostLPF: 18000,
  lead1PostLPFKeyTracking: 0,
  lead1StereoWidth: 1,
  lead1DiffuseSend: 0,
  // Lead 2 — 4op FM preset morph
  lead2Enabled: false,
  lead2PresetC: 'soft_rhodes',
  lead2PresetD: 'gamelan',
  lead2Morph: 0,
  lead2MorphAuto: false,
  lead2MorphSpeed: 8,
  lead2MorphMode: 'pingpong' as const,
  lead2AlgorithmMode: 'snap' as const,
  lead2Level: 0.6,
  lead2ReverbSend: 0.5,
  lead2UseCustomAdsr: false,
  lead2Attack: 0.01,
  lead2Decay: 0.8,
  lead2Sustain: 0.3,
  lead2Hold: 0.5,
  lead2Release: 2.0,
  lead2Distance: 0,
  lead2PostLPF: 18000,
  lead2PostLPFKeyTracking: 0,
  lead2StereoWidth: 1,
  lead2DiffuseSend: 0,
  pianoEnabled: false,
  pianoAttack: 0.005,
  pianoDecay: 0.65,
  pianoSustain: 0.72,
  pianoHold: 0.2,
  pianoRelease: 1.4,
  pianoReverbSend: 0.35,
  pianoDistance: 0,
  pianoPostLPF: 16000,
  pianoStereoWidth: 0.85,
  pianoDiffuseSend: 0,
  leadVibratoDepth: 0,
  leadVibratoRate: 0,
  leadGlide: 0,
  // Shared sequencer transport
  sequencerMasterBPM: 120,
  // Euclidean sequencer for lead - 4 lanes for polyrhythms
  synthEuclideanMasterEnabled: false,
  synthEuclidBaseBPM: 120,
  synthEuclideanTempo: 1,
  // Lane 1 - main pulse (lancaran) - mid register
  synthEuclid1Enabled: true,
  synthEuclid1Preset: 'lancaran',
  synthEuclid1Steps: 16,
  synthEuclid1Hits: 4,
  synthEuclid1Rotation: 0,
  synthEuclid1NoteMin: 64,  // E4 (root octave 2)
  synthEuclid1NoteMax: 76,  // E5 (root octave 3)
  synthEuclid1Level: 0.8,
  synthEuclid1Probability: 1.0,
  synthEuclid1Source: 'lead' as const,
  // Lane 2 - interlocking (kotekan) - higher register
  synthEuclid2Enabled: false,
  synthEuclid2Preset: 'kotekan',
  synthEuclid2Steps: 8,
  synthEuclid2Hits: 3,
  synthEuclid2Rotation: 1,
  synthEuclid2NoteMin: 76,  // E5 (root octave 3)
  synthEuclid2NoteMax: 88,  // E6 (root octave 4)
  synthEuclid2Level: 0.6,
  synthEuclid2Probability: 1.0,
  synthEuclid2Source: 'lead' as const,
  // Lane 3 - sparse accent - bass register
  synthEuclid3Enabled: false,
  synthEuclid3Preset: 'ketawang',
  synthEuclid3Steps: 16,
  synthEuclid3Hits: 2,
  synthEuclid3Rotation: 0,
  synthEuclid3NoteMin: 52,  // E3 (root octave 1)
  synthEuclid3NoteMax: 64,  // E4 (root octave 2)
  synthEuclid3Level: 0.9,
  synthEuclid3Probability: 1.0,
  synthEuclid3Source: 'lead' as const,
  // Lane 4 - fill/texture - sparkle register
  synthEuclid4Enabled: false,
  synthEuclid4Preset: 'srepegan',
  synthEuclid4Steps: 16,
  synthEuclid4Hits: 6,
  synthEuclid4Rotation: 2,
  synthEuclid4NoteMin: 88,  // E6 (root octave 4)
  synthEuclid4NoteMax: 96,  // C7
  synthEuclid4Level: 0.5,
  synthEuclid4Probability: 1.0,
  synthEuclid4Source: 'lead' as const,
  
  // Synth chord sequencer toggle
  synthChordSequencerEnabled: true,

  // ─── Ikeda-Style Drum Synth ───
  drumEnabled: false,
  drumLevel: 0,
  drumReverbSend: 0.06,
  
  // Voice 1: Sub (deep sine pulse)
  drumSubFreq: 50,
  drumSubDecay: 150,
  drumSubLevel: 0.8,
  drumSubTone: 0.1,
  drumSubShape: 0,            // Pure sine
  drumSubPitchEnv: 0,         // No pitch sweep
  drumSubPitchDecay: 50,
  drumSubDrive: 0,            // No saturation
  drumSubSub: 0,              // No sub-octave
  drumSubAttack: 0,           // Instant attack
  drumSubVariation: 0,        // No per-hit variation
  drumSubDistance: 0.5,       // Neutral strike position (bipolar: 0=center, 0.5=neutral, 1=edge)

  // Voice 2: Kick (sine with pitch sweep)
  drumKickFreq: 55,
  drumKickPitchEnv: 24,     // Start 2 octaves higher
  drumKickPitchDecay: 30,   // Fast pitch drop
  drumKickDecay: 200,
  drumKickLevel: 0.7,
  drumKickClick: 0.3,       // Subtle click transient
  drumKickBody: 0.5,        // Medium body
  drumKickPunch: 0.5,       // Medium punch
  drumKickTail: 0,          // No tail
  drumKickTone: 0,          // Pure sine
  drumKickAttack: 0,        // Instant attack
  drumKickVariation: 0,     // No per-hit variation
  drumKickDistance: 0.5,    // Neutral strike position

  // Voice 3: Click (the signature Ikeda "data" sound)
  drumClickDecay: 5,
  drumClickFilter: 4000,    // Highpass filter
  drumClickTone: 0.3,       // Mostly impulse
  drumClickLevel: 0.6,
  drumClickResonance: 0.4,  // Slight metallic ring
  drumClickPitch: 2000,     // Tonal mode pitch
  drumClickPitchEnv: 0,     // No pitch sweep
  drumClickMode: 'impulse' as const,
  drumClickGrainCount: 1,   // Single hit
  drumClickGrainSpread: 0,  // No spread
  drumClickStereoWidth: 0,  // Mono
  drumClickExciterColor: 0, // Pure impulse
  drumClickAttack: 0,       // Instant attack
  drumClickVariation: 0,    // No per-hit variation
  drumClickDistance: 0.5,   // Neutral strike position

  // Voice 4: Beep Hi (high pitched notification ping)
  drumBeepHiFreq: 4000,
  drumBeepHiAttack: 1,
  drumBeepHiDecay: 80,
  drumBeepHiLevel: 0.5,
  drumBeepHiTone: 0.2,
  drumBeepHiInharmonic: 0,  // Pure harmonic
  drumBeepHiPartials: 1,    // Single partial
  drumBeepHiShimmer: 0,     // No shimmer
  drumBeepHiShimmerRate: 4, // Default rate
  drumBeepHiBrightness: 0.5, // Neutral brightness
  drumBeepHiFeedback: 0,    // No FM feedback
  drumBeepHiModEnvDecay: 0, // Static mod index (no envelope)
  drumBeepHiNoiseInMod: 0,  // No noise in FM modulator
  drumBeepHiModRatio: 2,    // Default 2:1 ratio (octave)
  drumBeepHiModRatioFine: 0.01, // Slight detune for metallic character
  drumBeepHiModPhase: 0,    // Sine start phase
  drumBeepHiModEnvEnd: 0.2, // Default sustain level
  drumBeepHiNoiseDecay: 0,  // No separate noise decay
  drumBeepHiVariation: 0,   // No per-hit variation
  drumBeepHiDistance: 0.5,  // Neutral strike position

  // Voice 5: Beep Lo (lower blip, Morse-code feel)
  drumBeepLoFreq: 400,
  drumBeepLoAttack: 2,
  drumBeepLoDecay: 100,
  drumBeepLoLevel: 0.5,
  drumBeepLoTone: 0.1,
  drumBeepLoPitchEnv: 0,    // No pitch envelope
  drumBeepLoPitchDecay: 50,
  drumBeepLoBody: 0.3,      // Light body
  drumBeepLoPluck: 0,       // No pluck
  drumBeepLoPluckDamp: 0.5, // Medium damping
  drumBeepLoModal: 0,       // No modal resonators
  drumBeepLoModalQ: 10,     // Medium resonator Q
  drumBeepLoModalInharmonic: 0, // Harmonic partials
  drumBeepLoModalSpread: 0,  // Linear distribution (no warp)
  drumBeepLoModalCut: 0,     // No partial cut
  drumBeepLoOscGain: 1,      // Unity gain for oscillator/pluck engine
  drumBeepLoModalGain: 1,    // Unity gain for modal resonator engine
  drumBeepLoVariation: 0,    // No per-hit variation
  drumBeepLoDistance: 0.5,   // Neutral strike position

  // Voice 6: Noise (hi-hat/texture)
  drumNoiseFilterFreq: 8000,
  drumNoiseFilterQ: 1,
  drumNoiseFilterType: 'highpass' as const,
  drumNoiseDecay: 30,
  drumNoiseLevel: 0.4,
  drumNoiseAttack: 0,
  drumNoiseFormant: 0,      // No formant
  drumNoiseBreath: 0,       // No breath
  drumNoiseFilterEnv: 0,    // No filter envelope
  drumNoiseFilterEnvDecay: 100,
  drumNoiseDensity: 1,      // Dense
  drumNoiseColorLFO: 0,     // No color modulation
  drumNoiseParticleSize: 5,  // 5ms default particle duration
  drumNoiseParticleRandom: 0,  // No grain randomization
  drumNoiseParticleRandomRate: 0.5, // Mid-rate
  drumNoiseRatchetCount: 0,  // No ratcheting (0=off)
  drumNoiseRatchetTime: 30,  // 30ms default ratchet time
  drumNoiseVariation: 0,     // No per-hit variation
  drumNoiseDistance: 0.5,    // Neutral strike position
  // Voice 7: Membrane
  drumMembraneExciter: 'impulse' as const,
  drumMembraneExcPos: 0.3,
  drumMembraneExcBright: 0.5,
  drumMembraneExcDur: 3,
  drumMembraneSize: 180,
  drumMembraneStiffness: 0.5,
  drumMembraneDamping: 0.3,
  drumMembraneMaterial: 'skin' as const,
  drumMembraneNonlin: 0,
  drumMembraneWireMix: 0,
  drumMembraneWireDensity: 0.5,
  drumMembraneWireTone: 0.5,
  drumMembraneWireDecay: 0.5,
  drumMembraneBody: 0.5,
  drumMembraneRing: 0.2,
  drumMembraneOvertones: 4,
  drumMembranePitchEnv: 3,
  drumMembranePitchDecay: 40,
  drumMembraneAttack: 0,
  drumMembraneDecay: 250,
  drumMembraneLevel: 0.6,
  drumMembraneVariation: 0,
  drumMembraneDistance: 0.5,
  drumMembraneScaleBlend: 0.3,
  drumMorphSliderAnimate: false, // Don't update sliders by default (saves performance)

  // ─── Drum Voice Morph System ───
  drumSubPresetA: 'Classic Sub',
  drumSubPresetB: 'Classic Sub',
  drumSubMorph: 0,
  drumSubMorphAuto: false,
  drumSubMorphSpeed: 4,
  drumSubMorphMode: 'pingpong' as const,

  drumKickPresetA: 'Ikeda Kick',
  drumKickPresetB: 'Ikeda Kick',
  drumKickMorph: 0,
  drumKickMorphAuto: false,
  drumKickMorphSpeed: 4,
  drumKickMorphMode: 'pingpong' as const,

  drumClickPresetA: 'Data Point',
  drumClickPresetB: 'Data Point',
  drumClickMorph: 0,
  drumClickMorphAuto: false,
  drumClickMorphSpeed: 4,
  drumClickMorphMode: 'pingpong' as const,

  drumBeepHiPresetA: 'Data Ping',
  drumBeepHiPresetB: 'Data Ping',
  drumBeepHiMorph: 0,
  drumBeepHiMorphAuto: false,
  drumBeepHiMorphSpeed: 4,
  drumBeepHiMorphMode: 'pingpong' as const,

  drumBeepLoPresetA: 'Blip',
  drumBeepLoPresetB: 'Blip',
  drumBeepLoMorph: 0,
  drumBeepLoMorphAuto: false,
  drumBeepLoMorphSpeed: 4,
  drumBeepLoMorphMode: 'pingpong' as const,

  drumNoisePresetA: 'Hi-Hat',
  drumNoisePresetB: 'Hi-Hat',
  drumNoiseMorph: 0,
  drumNoiseMorphAuto: false,
  drumNoiseMorphSpeed: 4,
  drumNoiseMorphMode: 'pingpong' as const,

  drumMembranePresetA: 'Snare Classic',
  drumMembranePresetB: 'Snare Classic',
  drumMembraneMorph: 0,
  drumMembraneMorphAuto: false,
  drumMembraneMorphSpeed: 4,
  drumMembraneMorphMode: 'pingpong' as const,

  // Drum delay effect
  drumDelayEnabled: false,
  drumDelayNoteL: '1/8d' as const,   // Dotted 8th (classic ping-pong)
  drumDelayNoteR: '1/4' as const,    // Quarter note
  drumDelayFeedback: 0.4,            // 0-0.95
  drumDelayMix: 0.3,                 // Wet/dry mix
  drumDelayFilter: 0.5,              // Low-pass filter cutoff (0=dark, 1=bright)
  // Per-voice delay sends
  drumSubDelaySend: 0.0,
  drumKickDelaySend: 0.2,
  drumClickDelaySend: 0.5,
  drumBeepHiDelaySend: 0.6,
  drumBeepLoDelaySend: 0.4,
  drumNoiseDelaySend: 0.7,
  drumMembraneDelaySend: 0.2,

  // Euclidean sequencer (4 lanes)
  drumEuclidMasterEnabled: false,
  drumEuclidBaseBPM: 120,
  drumEuclidTempo: 1,
  drumEuclidSwing: 0,
  drumEuclidDivision: 8,
  
  // Lane 1 - Kick (primary rhythm)
  drumEuclid1Enabled: false,
  drumEuclid1Preset: 'custom',
  drumEuclid1Steps: 8,
  drumEuclid1Hits: 5,
  drumEuclid1Rotation: 0,
  drumEuclid1TargetSub: false,
  drumEuclid1TargetKick: true,
  drumEuclid1TargetClick: false,
  drumEuclid1TargetBeepHi: false,
  drumEuclid1TargetBeepLo: false,
  drumEuclid1TargetNoise: false,
  drumEuclid1TargetMembrane: false,
  drumEuclid1Probability: 1.0,
  drumEuclid1VelocityMin: 1.0,
  drumEuclid1VelocityMax: 1.0,
  drumEuclid1Level: 0.8,
  
  // Lane 2 - BeepHi pattern
  drumEuclid2Enabled: false,
  drumEuclid2Preset: 'custom',
  drumEuclid2Steps: 16,
  drumEuclid2Hits: 3,
  drumEuclid2Rotation: 0,
  drumEuclid2TargetSub: false,
  drumEuclid2TargetKick: false,
  drumEuclid2TargetClick: false,
  drumEuclid2TargetBeepHi: true,
  drumEuclid2TargetBeepLo: false,
  drumEuclid2TargetNoise: false,
  drumEuclid2TargetMembrane: false,
  drumEuclid2Probability: 1.0,
  drumEuclid2VelocityMin: 1.0,
  drumEuclid2VelocityMax: 1.0,
  drumEuclid2Level: 0.8,
  
  // Lane 3 - Click (sparse accents)
  drumEuclid3Enabled: false,
  drumEuclid3Preset: 'custom',
  drumEuclid3Steps: 12,
  drumEuclid3Hits: 5,
  drumEuclid3Rotation: 0,
  drumEuclid3TargetSub: false,
  drumEuclid3TargetKick: false,
  drumEuclid3TargetClick: true,
  drumEuclid3TargetBeepHi: false,
  drumEuclid3TargetBeepLo: false,
  drumEuclid3TargetNoise: false,
  drumEuclid3TargetMembrane: false,
  drumEuclid3Probability: 1.0,
  drumEuclid3VelocityMin: 1.0,
  drumEuclid3VelocityMax: 1.0,
  drumEuclid3Level: 0.8,
  
  // Lane 4 - Noise
  drumEuclid4Enabled: false,
  drumEuclid4Preset: 'custom',
  drumEuclid4Steps: 8,
  drumEuclid4Hits: 3,
  drumEuclid4Rotation: 0,
  drumEuclid4TargetSub: false,
  drumEuclid4TargetKick: false,
  drumEuclid4TargetClick: false,
  drumEuclid4TargetBeepHi: false,
  drumEuclid4TargetBeepLo: false,
  drumEuclid4TargetNoise: true,
  drumEuclid4TargetMembrane: false,
  drumEuclid4Probability: 1.0,
  drumEuclid4VelocityMin: 1.0,
  drumEuclid4VelocityMax: 1.0,
  drumEuclid4Level: 0.8,

  // Waves sample
  earthLevel: 1.0,
  oceanSampleEnabled: false,
  oceanSampleLevel: 0,
  oceanReverbSend: 0.2,
  oceanDelayASend: 0,
  oceanDelayBSend: 0,
  oceanSliceDuration: 22,
  oceanSliceDensity: 0.38,
  oceanFilterType: 'lowpass' as const,
  oceanFilterCutoff: 8000,
  oceanFilterResonance: 0.1,
  birdsEnabled: false,
  birdsLevel: 0.6,
  birdsReverbSend: 0.15,
  birdsDelayASend: 0,
  birdsDelayBSend: 0,
  birdsSliceDuration: 20,
  birdsSliceDensity: 0.45,
  birds2Enabled: false,
  birds2Level: 0.52,
  birds2ReverbSend: 0.16,
  birds2DelayASend: 0,
  birds2DelayBSend: 0,
  birds2SliceDuration: 20,
  birds2SliceDensity: 0.48,
  frogsEnabled: false,
  frogsLevel: 0.5,
  frogsReverbSend: 0.2,
  frogsDelayASend: 0,
  frogsDelayBSend: 0,
  frogsSliceDuration: 18,
  frogsSliceDensity: 0.52,
  natureLevel: 1.0,
  natureReverbSend: 0.18,
  natureDelayASend: 0,
  natureDelayBSend: 0,

  // ─── Soundscapes (Water + Insects) ───
  waterEnabled: false,
  waterPreset: 1,
  waterMorphA: 0,
  waterMorphB: 2,
  waterMorph: 0,
  waterIntensity: 0.7,
  waterDistance: 0.3,
  waterBaseFreq: 2300,
  waterDropSize: 0.5,
  waterHardness: 0.5,
  waterGlassThickness: 0.5,
  waterReverbSend: 0.3,
  waterDelayASend: 0,
  waterDelayBSend: 0,
  waterLevel: 0.8,
  waterLayerHardDrops: 0.08,
  waterLayerWaterDrops: 0.82,
  waterLayerTurbulence: 0.56,
  waterLayerBubbling: 0.92,
  waterLayerSurf: 0.0,
  waterLayerChannels: 0.0,
  waterHardDropBaseFreq: 2300,
  waterHardDropRate: 1.0,
  waterHardDropLPF: 12000,
  waterHardDropTone: 1.0,
  waterWaterDropBaseFreq: 2300,
  waterWaterDropRate: 1.0,
  waterWaterDropLPF: 16000,
  waterBubblingRate: 1.0,
  waterBubblingLPF: 1500,
  waterSurfDuration: 8.0,
  waterSurfInterval: 9.5,
  waterSurfFoam: 0.35,
  waterSurfFoamBright: 0.4,
  waterSurfProximity: 0.7,
  waterSurfDepth: 0.5,
  waterSurfBody: 300,
  waterSurfSpray: 4000,
  waterDensityHardSend: 0.28,
  waterDensityWaterSend: 0.46,
  waterDensityBubbleSend: 0.62,
  waterDensityFeedback: 0.74,
  waterDensityTone: 900,
  waterDensityRing: 1.0,
  waterDensityWet: 0.48,
  waterChannelsMorph: 0.0,
  waterChannelsSpeed: 0.5,
  insectsEnabled: false,
  insectsEngine: 0,
  insectsDensity: 0.5,
  insectsTemperature: 0.5,
  insectsDistance: 0.3,
  insectsProximity: 0.5,
  insectsAntiphony: 0.3,
  insectsClickRate: 0.3,
  insectsMotion: 0.5,
  insectsLevel: 0.7,
  insectsSharedLevel: 1.0,
  insectsReverbSend: 0.15,
  insDelayASend: 0,
  insDelayBSend: 0,
  insects2Enabled: false,
  insects2Engine: 1,
  insects2Density: 0.5,
  insects2Temperature: 0.5,
  insects2Distance: 0.3,
  insects2Proximity: 0.5,
  insects2Antiphony: 0.3,
  insects2ClickRate: 0.3,
  insects2Motion: 0.5,
  insects2Level: 0.5,

  // ─── Granular FX ───
  granularEnabled: false,
  granularFreeze: false,
  granularFeedback: 0.1,
  granularFeedbackLPF: 8000,
  granularBufferSeconds: 16,
  granularPreset: 'init',
  granularSpaceMode: 'clocked' as const,
  granularPresetBehavior: 'expressive' as const,
  delayBGranularLinked: true,
  granularShape: 'triangle' as const,
  granularDiffusion: 0.5,
  granularReverbSend: 0.3,
  granularReverbLPF: 4000,
  granularOutputLPF: 12000,
  granularDelayASend: 0,
  granularDelayBSend: 0,
  granularPad1Send: 1.0,
  granularPad2Send: 0.0,
  granularLead1Send: 0.0,
  granularLead2Send: 0.0,
  granularPianoSend: 0.0,
  granularDrumSend: 0.0,
  granularWavesSend: 0.0,
  granularNatureSend: 0.0,
  granularWaterSend: 0.0,
  granularInsectsSend: 0.0,

  // Voice 1 (default: granular, active)
  granularV1Enabled: true,
  granularV1Mode: 'granular' as const,
  granularV1Slice: 0,
  granularV1Speed: 1,
  granularV1ScanRate: 1,
  granularV1Reverse: false,
  granularV1Pitch: 0,
  granularV1Attack: 0.003,
  granularV1Decay: 0.5,
  granularV1Blur: 0,
  granularV1GrainOct: 0,
  granularV1Spray: 0.3,
  granularV1Density: 20,
  granularV1TempoSync: false,
  granularV1TempoDiv: '1/8',
  granularV1GrainSize: 80,
  granularV1Pan: 0,
  granularV1Gain: 0.5,
  granularV1PosLFORate: 0,
  granularV1PosLFODepth: 0,
  granularV1PanLFORate: 0,
  granularV1StereoSpread: 0.5,
  granularV1ReverseLFORate: 0,
  granularV1WriteFollow: 0,
  granularV1RecordLFORate: 0,

  // Voice 2 (default: off)
  granularV2Enabled: false,
  granularV2Mode: 'granular' as const,
  granularV2Slice: 4,
  granularV2Speed: 1,
  granularV2ScanRate: 1,
  granularV2Reverse: false,
  granularV2Pitch: 0,
  granularV2Attack: 0.003,
  granularV2Decay: 0.5,
  granularV2Blur: 0,
  granularV2GrainOct: 0,
  granularV2Spray: 0.3,
  granularV2Density: 20,
  granularV2TempoSync: false,
  granularV2TempoDiv: '1/8',
  granularV2GrainSize: 80,
  granularV2Pan: 0,
  granularV2Gain: 0.5,
  granularV2PosLFORate: 0,
  granularV2PosLFODepth: 0,
  granularV2PanLFORate: 0,
  granularV2StereoSpread: 0.5,
  granularV2ReverseLFORate: 0,
  granularV2WriteFollow: 0,
  granularV2RecordLFORate: 0,

  // Voice 3 (default: off)
  granularV3Enabled: false,
  granularV3Mode: 'granular' as const,
  granularV3Slice: 8,
  granularV3Speed: 1,
  granularV3ScanRate: 1,
  granularV3Reverse: false,
  granularV3Pitch: 0,
  granularV3Attack: 0.003,
  granularV3Decay: 0.5,
  granularV3Blur: 0,
  granularV3GrainOct: 0,
  granularV3Spray: 0.3,
  granularV3Density: 20,
  granularV3TempoSync: false,
  granularV3TempoDiv: '1/8',
  granularV3GrainSize: 80,
  granularV3Pan: 0,
  granularV3Gain: 0.5,
  granularV3PosLFORate: 0,
  granularV3PosLFODepth: 0,
  granularV3PanLFORate: 0,
  granularV3StereoSpread: 0.5,
  granularV3ReverseLFORate: 0,
  granularV3WriteFollow: 0,
  granularV3RecordLFORate: 0,

  // Voice 4 (default: off)
  granularV4Enabled: false,
  granularV4Mode: 'granular' as const,
  granularV4Slice: 12,
  granularV4Speed: 1,
  granularV4ScanRate: 1,
  granularV4Reverse: false,
  granularV4Pitch: 0,
  granularV4Attack: 0.003,
  granularV4Decay: 0.5,
  granularV4Blur: 0,
  granularV4GrainOct: 0,
  granularV4Spray: 0.3,
  granularV4Density: 20,
  granularV4TempoSync: false,
  granularV4TempoDiv: '1/8',
  granularV4GrainSize: 80,
  granularV4Pan: 0,
  granularV4Gain: 0.5,
  granularV4PosLFORate: 0,
  granularV4PosLFODepth: 0,
  granularV4PanLFORate: 0,
  granularV4StereoSpread: 0.5,
  granularV4ReverseLFORate: 0,
  granularV4WriteFollow: 0,
  granularV4RecordLFORate: 0,

  // Legacy compatibility
  granularLegacyJitter: 10,
  granularLegacyProbability: 0.8,
  granularLegacyPitchMode: 'harmonic' as const,
  granularLegacyPitchSpread: 2,
  granularLegacyMaxGrains: 64,
  granularLegacyFeedback: 0.1,

  // Granular Harmony
  granularChordBias: 0,

  // Granular Delay
  granularDelayEnabled: false,
  granularDelayActivity: 0.3,
  granularDelayRepeats: 0.3,
  granularDelayTime: '1/4' as string,
  granularDelayFilter: 0.5,
  granularDelayVibrato: 0,
  granularDelayMix: 1.0,
  granularDelayReverbSend: 0.4,

  // Granular Macros
  granularMacroActivity: 0.35,
  granularMacroTexture: 0.3,
  granularMacroComplexity: 0.2,
  granularMacroDarkness: 0.3,
  granularMacroChaos: 0.1,

  // Random Walk
  randomWalkSpeed: 1.0,
};

/**
 * Mobile-optimized preset with lower CPU usage
 */
export const MOBILE_STATE: SliderState = {
  ...DEFAULT_STATE,
  granularLevel: 0.07,
  density: 15,
  reverbLevel: 0.15,
};

/**
 * Quantization definitions for each parameter
 */
interface QuantizationDef {
  min: number;
  max: number;
  step: number;
}

export const QUANTIZATION: Partial<Record<keyof SliderState, QuantizationDef>> = {
  masterVolume: { min: 0, max: 1, step: 0.01 },
  synthLevel: { min: 0, max: 1, step: 0.01 },
  pad2Level: { min: 0, max: 1, step: 0.01 },
  granularLevel: { min: 0, max: 1, step: 0.01 },
  pad1ReverbSend: { min: 0, max: 1, step: 0.01 },
  pad2ReverbSend: { min: 0, max: 1, step: 0.01 },
  pad1DelayASend: { min: 0, max: 1, step: 0.01 },
  pad1DelayBSend: { min: 0, max: 1, step: 0.01 },
  pad2DelayASend: { min: 0, max: 1, step: 0.01 },
  pad2DelayBSend: { min: 0, max: 1, step: 0.01 },
  leadReverbSend: { min: 0, max: 1, step: 0.01 },
  lead1DelayASend: { min: 0, max: 1, step: 0.01 },
  lead1DelayBSend: { min: 0, max: 1, step: 0.01 },
  lead2DelayASend: { min: 0, max: 1, step: 0.01 },
  lead2DelayBSend: { min: 0, max: 1, step: 0.01 },
  delayAReverbSend: { min: 0, max: 1, step: 0.01 },
  drumDelayASend: { min: 0, max: 1, step: 0.01 },
  delayAToBSend: { min: 0, max: 1, step: 0.01 },
  delayAGranularSend: { min: 0, max: 1, step: 0.01 },
  delayBGranularSend: { min: 0, max: 1, step: 0.01 },
  delayAModRate: { min: 0, max: 1, step: 0.01 },
  delayAModDepth: { min: 0, max: 1, step: 0.01 },
  drumDelayNoteL: { min: 0, max: DELAY_A_NOTE_DIVISION_OPTIONS.length - 1, step: 1 },
  drumDelayNoteR: { min: 0, max: DELAY_A_NOTE_DIVISION_OPTIONS.length - 1, step: 1 },
  delayADuck: { min: 0, max: 1, step: 0.01 },
  delayAWidth: { min: 0, max: 1, step: 0.01 },
  delayBWarpIntensity: { min: 0, max: 1, step: 0.01 },
  delayBSpread: { min: 0, max: 1, step: 0.01 },
  delayBToASend: { min: 0, max: 1, step: 0.01 },
  delayACrossFeedFilter: { min: 0, max: 1, step: 0.01 },
  drumDelayBSend: { min: 0, max: 1, step: 0.01 },
  masterSatDrive: { min: 0, max: 1, step: 0.01 },
  masterSatTone: { min: 0, max: 1, step: 0.01 },
  dynamicsSaturationDrive: { min: 0, max: 1, step: 0.01 },
  dynamicsSaturationTone: { min: 0, max: 1, step: 0.01 },
  dynamicsSaturationBias: { min: 0, max: 1, step: 0.01 },
  sidechainKeyAWeight: { min: 0, max: 1, step: 0.01 },
  sidechainKeyBWeight: { min: 0, max: 1, step: 0.01 },
  sidechainAmount: { min: 0, max: 1, step: 0.01 },
  sidechainThreshold: { min: -60, max: 0, step: 1 },
  sidechainRatio: { min: 1, max: 20, step: 0.1 },
  sidechainKnee: { min: 0, max: 40, step: 1 },
  sidechainAttackMs: { min: 0.1, max: 100, step: 0.1 },
  sidechainHoldMs: { min: 0, max: 250, step: 1 },
  sidechainReleaseMs: { min: 20, max: 1500, step: 5 },
  sidechainMakeup: { min: 0.25, max: 4, step: 0.05 },
  sidechainMix: { min: 0, max: 1, step: 0.01 },
  sidechainCurve: { min: 0, max: 1, step: 0.01 },
  sidechainDetectorHp: { min: 0, max: 1, step: 0.01 },
  sidechainDetectorLp: { min: 0, max: 1, step: 0.01 },
  sidechainPad1Target: { min: 0, max: 1, step: 0.01 },
  sidechainPad2Target: { min: 0, max: 1, step: 0.01 },
  sidechainLead1Target: { min: 0, max: 1, step: 0.01 },
  sidechainLead2Target: { min: 0, max: 1, step: 0.01 },
  sidechainPianoTarget: { min: 0, max: 1, step: 0.01 },
  sidechainGranularTarget: { min: 0, max: 1, step: 0.01 },
  sidechainDelayATarget: { min: 0, max: 1, step: 0.01 },
  sidechainDelayBTarget: { min: 0, max: 1, step: 0.01 },
  sidechainReverbTarget: { min: 0, max: 1, step: 0.01 },
  characterMix: { min: 0, max: 1, step: 0.01 },
  characterAge: { min: 0, max: 1, step: 0.01 },
  degradeMix: { min: 0, max: 1, step: 0.01 },
  degradeAge: { min: 0, max: 1, step: 0.01 },
  degradeGeneration: { min: 0, max: 1, step: 0.01 },
  degradeAlias: { min: 0, max: 1, step: 0.01 },
  degradeWow: { min: 0, max: 1, step: 0.01 },
  degradeFlutter: { min: 0, max: 1, step: 0.01 },
  degradeDrift: { min: 0, max: 1, step: 0.01 },
  degradeWobbleSpeed: { min: 0, max: 1, step: 0.01 },
  degradeTone: { min: 0, max: 1, step: 0.01 },
  degradeHp: { min: 0, max: 1, step: 0.01 },
  degradeLp: { min: 0, max: 1, step: 0.01 },
  characterResonance: { min: 0, max: 1, step: 0.01 },
  degradeNoise: { min: 0, max: 1, step: 0.01 },
  degradeSaturation: { min: 0, max: 1, step: 0.01 },
  degradeCorrosion: { min: 0, max: 1, step: 0.01 },
  degradeModSlowWow: { min: 0, max: 1, step: 0.01 },
  degradeModSlowFlutter: { min: 0, max: 1, step: 0.01 },
  degradeModSlowLp: { min: 0, max: 1, step: 0.01 },
  degradeModSlowWet: { min: 0, max: 1, step: 0.01 },
  degradeModSlowDropout: { min: 0, max: 1, step: 0.01 },
  degradeModSlowAlias: { min: 0, max: 1, step: 0.01 },
  degradeModFlutterWow: { min: 0, max: 1, step: 0.01 },
  degradeModFlutterFlutter: { min: 0, max: 1, step: 0.01 },
  degradeModFlutterLp: { min: 0, max: 1, step: 0.01 },
  degradeModFlutterWet: { min: 0, max: 1, step: 0.01 },
  degradeModFlutterDropout: { min: 0, max: 1, step: 0.01 },
  degradeModFlutterAlias: { min: 0, max: 1, step: 0.01 },
  degradeModRandomWow: { min: 0, max: 1, step: 0.01 },
  degradeModRandomFlutter: { min: 0, max: 1, step: 0.01 },
  degradeModRandomLp: { min: 0, max: 1, step: 0.01 },
  degradeModRandomWet: { min: 0, max: 1, step: 0.01 },
  degradeModRandomDropout: { min: 0, max: 1, step: 0.01 },
  degradeModRandomAlias: { min: 0, max: 1, step: 0.01 },
  degradeModEnvWow: { min: 0, max: 1, step: 0.01 },
  degradeModEnvFlutter: { min: 0, max: 1, step: 0.01 },
  degradeModEnvLp: { min: 0, max: 1, step: 0.01 },
  degradeModEnvWet: { min: 0, max: 1, step: 0.01 },
  degradeModEnvDropout: { min: 0, max: 1, step: 0.01 },
  degradeModEnvAlias: { min: 0, max: 1, step: 0.01 },
  degradeModNoiseWow: { min: 0, max: 1, step: 0.01 },
  degradeModNoiseFlutter: { min: 0, max: 1, step: 0.01 },
  degradeModNoiseLp: { min: 0, max: 1, step: 0.01 },
  degradeModNoiseWet: { min: 0, max: 1, step: 0.01 },
  degradeModNoiseDropout: { min: 0, max: 1, step: 0.01 },
  degradeModNoiseAlias: { min: 0, max: 1, step: 0.01 },
  characterStereo: { min: 0, max: 1, step: 0.01 },
  characterEnvFollow: { min: 0, max: 1, step: 0.01 },
  characterDepth: { min: 0, max: 1, step: 0.01 },
  characterRate: { min: 0, max: 1, step: 0.01 },
  characterDamp: { min: 0, max: 1, step: 0.01 },
  endCompThreshold: { min: -60, max: 0, step: 1 },
  endCompKnee: { min: 0, max: 40, step: 1 },
  endCompRatio: { min: 1, max: 20, step: 0.1 },
  endCompAttackMs: { min: 0.1, max: 100, step: 0.1 },
  endCompReleaseMs: { min: 20, max: 1500, step: 5 },
  endCompMakeup: { min: 0.25, max: 4, step: 0.05 },
  endCompMix: { min: 0, max: 1, step: 0.01 },
  endCompDetectorHp: { min: 0, max: 1, step: 0.01 },
  endCompDetectorTilt: { min: 0, max: 1, step: 0.01 },
  endCompAutoMakeup: { min: 0, max: 1, step: 0.01 },
  endCompProgramRelease: { min: 0, max: 1, step: 0.01 },
  randomness: { min: 0, max: 1, step: 0.01 },
  tension: { min: 0, max: 1, step: 0.01 },
  chordRate: { min: 8, max: 64, step: 1 },
  phraseLength: { min: 4, max: 128, step: 1 },
  voicingSpread: { min: 0, max: 1, step: 0.01 },
  waveSpread: { min: 0, max: 1, step: 0.01 },
  detune: { min: 0, max: 25, step: 1 },
  synthAttack: { min: 0.01, max: 16, step: 0.01 },
  synthDecay: { min: 0.01, max: 8, step: 0.01 },
  synthSustain: { min: 0, max: 1, step: 0.01 },
  synthRelease: { min: 0.01, max: 30, step: 0.01 },
  synthVoiceMask: { min: 1, max: 63, step: 1 },
  synthOctave: { min: -2, max: 2, step: 1 },
  hardness: { min: 0, max: 2, step: 0.01 },
  filterCutoffMin: { min: 40, max: 8000, step: 10 },
  filterCutoffMax: { min: 40, max: 8000, step: 10 },
  filterResonance: { min: 0, max: 1, step: 0.01 },
  filterQ: { min: 0.1, max: 12, step: 0.1 },
  filterSlope: { min: 12, max: 48, step: 12 },
  filterKeyTracking: { min: 0, max: 1, step: 0.01 },
  warmth: { min: 0, max: 1, step: 0.01 },
  presence: { min: 0, max: 1, step: 0.01 },
  padFoldAmount: { min: 0, max: 1, step: 0.01 },
  padFoldMode: { min: 0, max: 2, step: 1 },
  // Pad Synth Extended
  padMorph: { min: 0, max: 1, step: 0.01 },
  padOscAOctave: { min: -2, max: 2, step: 1 },
  padOscADetune: { min: -100, max: 100, step: 1 },
  padOscALevel: { min: 0, max: 1, step: 0.01 },
  padOscBOctave: { min: -2, max: 2, step: 1 },
  padOscBDetune: { min: -100, max: 100, step: 1 },
  padOscBLevel: { min: 0, max: 1, step: 0.01 },
  padSubOctave: { min: -2, max: -1, step: 1 },
  padSubLevel: { min: 0, max: 1, step: 0.01 },
  padNoiseLevel: { min: 0, max: 1, step: 0.01 },
  padFilterBCutoff: { min: 40, max: 8000, step: 10 },
  padFilterBResonance: { min: 0, max: 1, step: 0.01 },
  padFilterBQ: { min: 0.1, max: 12, step: 0.1 },
  padLfo1Rate: { min: 0.01, max: 20, step: 0.01 },
  padLfo1Depth: { min: 0, max: 1, step: 0.01 },
  padLfo2Rate: { min: 0.01, max: 20, step: 0.01 },
  padLfo2Depth: { min: 0, max: 1, step: 0.01 },
  padModEnvAttack: { min: 0.01, max: 8, step: 0.01 },
  padModEnvDecay: { min: 0.01, max: 8, step: 0.01 },
  padModEnvSustain: { min: 0, max: 1, step: 0.01 },
  padModEnvRelease: { min: 0.01, max: 16, step: 0.01 },
  padModEnvDepth: { min: -1, max: 1, step: 0.01 },
  padMorphSpeed: { min: 1, max: 32, step: 1 },
  padOscMix: { min: 0, max: 1, step: 0.01 },
  padDistance: { min: 0, max: 1, step: 0.01 },
  padPostLPF: { min: 40, max: 8000, step: 10 },
  padStereoWidth: { min: 0, max: 1, step: 0.01 },
  padDiffuseSend: { min: 0, max: 1, step: 0.01 },
  // Pad Synth 2
  pad2VoiceAssign: { min: 0, max: 63, step: 1 },
  pad2Attack: { min: 0.01, max: 16, step: 0.01 },
  pad2Decay: { min: 0.01, max: 8, step: 0.01 },
  pad2Sustain: { min: 0, max: 1, step: 0.01 },
  pad2Release: { min: 0.01, max: 30, step: 0.01 },
  pad2Octave: { min: -2, max: 2, step: 1 },
  pad2Hardness: { min: 0, max: 2, step: 0.01 },
  pad2Warmth: { min: 0, max: 1, step: 0.01 },
  pad2Presence: { min: 0, max: 1, step: 0.01 },
  pad2FoldAmount: { min: 0, max: 1, step: 0.01 },
  pad2FoldMode: { min: 0, max: 2, step: 1 },
  pad2OscMix: { min: 0, max: 1, step: 0.01 },
  pad2FilterCutoffMin: { min: 40, max: 8000, step: 10 },
  pad2FilterCutoffMax: { min: 40, max: 8000, step: 10 },
  pad2FilterResonance: { min: 0, max: 1, step: 0.01 },
  pad2FilterQ: { min: 0.1, max: 12, step: 0.1 },
  pad2FilterSlope: { min: 12, max: 48, step: 12 },
  pad2FilterKeyTracking: { min: 0, max: 1, step: 0.01 },
  pad2OscAOctave: { min: -2, max: 2, step: 1 },
  pad2OscADetune: { min: -100, max: 100, step: 1 },
  pad2OscALevel: { min: 0, max: 1, step: 0.01 },
  pad2OscBOctave: { min: -2, max: 2, step: 1 },
  pad2OscBDetune: { min: -100, max: 100, step: 1 },
  pad2OscBLevel: { min: 0, max: 1, step: 0.01 },
  pad2SubOctave: { min: -2, max: -1, step: 1 },
  pad2SubLevel: { min: 0, max: 1, step: 0.01 },
  pad2NoiseLevel: { min: 0, max: 1, step: 0.01 },
  pad2FilterBCutoff: { min: 40, max: 8000, step: 10 },
  pad2FilterBResonance: { min: 0, max: 1, step: 0.01 },
  pad2FilterBQ: { min: 0.1, max: 12, step: 0.1 },
  pad2Lfo1Rate: { min: 0.01, max: 20, step: 0.01 },
  pad2Lfo1Depth: { min: 0, max: 1, step: 0.01 },
  pad2Lfo2Rate: { min: 0.01, max: 20, step: 0.01 },
  pad2Lfo2Depth: { min: 0, max: 1, step: 0.01 },
  pad2ModEnvAttack: { min: 0.01, max: 8, step: 0.01 },
  pad2ModEnvDecay: { min: 0.01, max: 8, step: 0.01 },
  pad2ModEnvSustain: { min: 0, max: 1, step: 0.01 },
  pad2ModEnvRelease: { min: 0.01, max: 16, step: 0.01 },
  pad2ModEnvDepth: { min: -1, max: 1, step: 0.01 },
  pad2Morph: { min: 0, max: 1, step: 0.01 },
  pad2MorphSpeed: { min: 1, max: 32, step: 1 },
  pad2Distance: { min: 0, max: 1, step: 0.01 },
  pad2PostLPF: { min: 40, max: 8000, step: 10 },
  pad2StereoWidth: { min: 0, max: 1, step: 0.01 },
  pad2DiffuseSend: { min: 0, max: 1, step: 0.01 },
  reverbLevel: { min: 0, max: 1, step: 0.01 },
  reverbDecay: { min: 0, max: 1, step: 0.01 },
  reverbSize: { min: 0.5, max: 10, step: 0.1 },
  reverbDiffusion: { min: 0, max: 1, step: 0.01 },
  reverbModulation: { min: 0, max: 1, step: 0.01 },
  predelay: { min: 0, max: 100, step: 1 },
  damping: { min: 0, max: 1, step: 0.01 },
  width: { min: 0, max: 1, step: 0.01 },
  reverbShimmer: { min: 0, max: 1, step: 0.01 },
  reverbShimmerPitch: { min: -24, max: 24, step: 1 },
  reverbSlowModRate: { min: 0.01, max: 0.2, step: 0.001 },
  reverbSlowModDepth: { min: 0, max: 1, step: 0.01 },
  reverbReverse: { min: 0, max: 1, step: 0.01 },
  reverbReverseLength: { min: 0.5, max: 16, step: 0.1 },
  // v2 reverb params
  reverbChorusRate: { min: 0.05, max: 2.0, step: 0.01 },
  reverbChorusDepth: { min: 0, max: 40, step: 0.5 },
  reverbDampLow: { min: 0, max: 1, step: 0.01 },
  reverbDampHigh: { min: 0, max: 1, step: 0.01 },
  reverbCrossoverFreq: { min: 100, max: 6000, step: 10 },
  reverbInputTone: { min: -1, max: 1, step: 0.01 },
  reverbShimmerFeedback: { min: 0, max: 1, step: 0.01 },
  // v3 reverb params
  reverbWarp: { min: 0, max: 1, step: 0.01 },
  reverbCrossFeed: { min: 0, max: 1, step: 0.01 },
  reverbEarlyReflections: { min: 0, max: 1, step: 0.01 },
  reverbAirAbsorption: { min: 0, max: 1, step: 0.01 },
  reverbTransientSmooth: { min: 0, max: 1, step: 0.01 },
  reverbErLpFreq: { min: 200, max: 12000, step: 10 },
  reverbPreCompThreshold: { min: -60, max: 0, step: 1 },
  reverbPreCompKnee: { min: 0, max: 40, step: 1 },
  reverbPreCompRatio: { min: 1, max: 20, step: 0.1 },
  reverbPreCompAttackMs: { min: 0.1, max: 30, step: 0.1 },
  reverbPreCompReleaseMs: { min: 20, max: 1000, step: 5 },
  reverbPreCompMakeup: { min: 0.5, max: 4, step: 0.05 },
  // Spectral Freeze
  spectralFreezeSpeed: { min: 0, max: 1, step: 0.01 },
  spectralFreezeMix: { min: 0, max: 1, step: 0.01 },
  spectralFreezeDecay: { min: 0, max: 1, step: 0.01 },
  spectralFreezePhaseJitter: { min: 0, max: 1, step: 0.01 },
  spectralFreezeReverbCrossfade: { min: 0, max: 1, step: 0.01 },
  grainProbability: { min: 0, max: 1, step: 0.01 },
  maxGrains: { min: 0, max: 128, step: 1 },
  grainSize: { min: 5, max: 800, step: 1 },
  density: { min: 5, max: 80, step: 1 },
  spray: { min: 0, max: 600, step: 5 },
  jitter: { min: 0, max: 30, step: 1 },
  pitchSpread: { min: 0, max: 12, step: 1 },
  stereoSpread: { min: 0, max: 1, step: 0.01 },
  feedback: { min: 0, max: 0.35, step: 0.01 },
  wetHPF: { min: 200, max: 3000, step: 50 },
  wetLPF: { min: 3000, max: 12000, step: 200 },
  leadLevel: { min: 0, max: 1, step: 0.01 },
  drumLevel: { min: 0, max: 1, step: 0.01 },
  drumReverbSend: { min: 0, max: 1, step: 0.01 },
  // Drum Synth Voice Parameters
  // Voice 1: Sub
  drumSubFreq: { min: 30, max: 100, step: 1 },
  drumSubDecay: { min: 20, max: 15000, step: 1 },
  drumSubLevel: { min: 0, max: 1, step: 0.01 },
  drumSubTone: { min: 0, max: 1, step: 0.01 },
  drumSubShape: { min: 0, max: 1, step: 0.01 },
  drumSubPitchEnv: { min: -48, max: 48, step: 1 },
  drumSubPitchDecay: { min: 5, max: 500, step: 1 },
  drumSubDrive: { min: 0, max: 1, step: 0.01 },
  drumSubSub: { min: 0, max: 1, step: 0.01 },
  drumSubAttack: { min: 0, max: 5000, step: 1 },
  drumSubVariation: { min: 0, max: 1, step: 0.01 },
  drumSubDistance: { min: 0, max: 1, step: 0.01 },
  // Voice 2: Kick
  drumKickFreq: { min: 40, max: 150, step: 1 },
  drumKickPitchEnv: { min: 0, max: 48, step: 1 },
  drumKickPitchDecay: { min: 5, max: 1000, step: 1 },
  drumKickDecay: { min: 30, max: 15000, step: 1 },
  drumKickLevel: { min: 0, max: 1, step: 0.01 },
  drumKickClick: { min: 0, max: 1, step: 0.01 },
  drumKickBody: { min: 0, max: 1, step: 0.01 },
  drumKickPunch: { min: 0, max: 1, step: 0.01 },
  drumKickTail: { min: 0, max: 1, step: 0.01 },
  drumKickTone: { min: 0, max: 1, step: 0.01 },
  drumKickAttack: { min: 0, max: 5000, step: 1 },
  drumKickVariation: { min: 0, max: 1, step: 0.01 },
  drumKickDistance: { min: 0, max: 1, step: 0.01 },
  // Voice 3: Click
  drumClickDecay: { min: 1, max: 15000, step: 1 },
  drumClickFilter: { min: 500, max: 15000, step: 100 },
  drumClickTone: { min: 0, max: 1, step: 0.01 },
  drumClickLevel: { min: 0, max: 1, step: 0.01 },
  drumClickResonance: { min: 0, max: 1, step: 0.01 },
  drumClickPitch: { min: 200, max: 8000, step: 10 },
  drumClickPitchEnv: { min: -48, max: 48, step: 1 },
  drumClickExciterColor: { min: -1, max: 1, step: 0.01 },
  drumClickGrainCount: { min: 1, max: 8, step: 1 },
  drumClickGrainSpread: { min: 0, max: 50, step: 1 },
  drumClickStereoWidth: { min: 0, max: 1, step: 0.01 },
  drumClickAttack: { min: 0, max: 5000, step: 1 },
  drumClickVariation: { min: 0, max: 1, step: 0.01 },
  drumClickDistance: { min: 0, max: 1, step: 0.01 },
  // Voice 4: Beep Hi
  drumBeepHiFreq: { min: 2000, max: 12000, step: 100 },
  drumBeepHiAttack: { min: 0.1, max: 5000, step: 1 },
  drumBeepHiDecay: { min: 10, max: 15000, step: 1 },
  drumBeepHiLevel: { min: 0, max: 1, step: 0.01 },
  drumBeepHiTone: { min: 0, max: 1, step: 0.01 },
  drumBeepHiInharmonic: { min: 0, max: 1, step: 0.01 },
  drumBeepHiPartials: { min: 1, max: 6, step: 1 },
  drumBeepHiShimmer: { min: 0, max: 1, step: 0.01 },
  drumBeepHiShimmerRate: { min: 0.5, max: 12, step: 0.1 },
  drumBeepHiBrightness: { min: 0, max: 1, step: 0.01 },
  drumBeepHiFeedback: { min: -1, max: 1, step: 0.01 },
  drumBeepHiModEnvDecay: { min: 0, max: 1, step: 0.01 },
  drumBeepHiNoiseInMod: { min: 0, max: 1, step: 0.01 },
  drumBeepHiModRatio: { min: 0.5, max: 12, step: 0.5 },
  drumBeepHiModRatioFine: { min: -0.5, max: 0.5, step: 0.01 },
  drumBeepHiModPhase: { min: 0, max: 1, step: 0.01 },
  drumBeepHiModEnvEnd: { min: 0, max: 1, step: 0.01 },
  drumBeepHiNoiseDecay: { min: 0, max: 1, step: 0.01 },
  drumBeepHiVariation: { min: 0, max: 1, step: 0.01 },
  drumBeepHiDistance: { min: 0, max: 1, step: 0.01 },
  // Voice 5: Beep Lo
  drumBeepLoFreq: { min: 150, max: 2000, step: 10 },
  drumBeepLoAttack: { min: 0.1, max: 5000, step: 1 },
  drumBeepLoDecay: { min: 10, max: 15000, step: 1 },
  drumBeepLoLevel: { min: 0, max: 1, step: 0.01 },
  drumBeepLoTone: { min: 0, max: 1, step: 0.01 },
  drumBeepLoPitchEnv: { min: -48, max: 48, step: 1 },
  drumBeepLoPitchDecay: { min: 5, max: 500, step: 1 },
  drumBeepLoBody: { min: 0, max: 1, step: 0.01 },
  drumBeepLoPluck: { min: 0, max: 1, step: 0.01 },
  drumBeepLoPluckDamp: { min: 0, max: 1, step: 0.01 },
  drumBeepLoModal: { min: 0, max: 1, step: 0.01 },
  drumBeepLoModalQ: { min: 1, max: 60, step: 1 },
  drumBeepLoModalInharmonic: { min: 0, max: 1, step: 0.01 },
  drumBeepLoModalSpread: { min: -1, max: 1, step: 0.01 },
  drumBeepLoModalCut: { min: -1, max: 1, step: 0.01 },
  drumBeepLoOscGain: { min: 0, max: 2, step: 0.01 },
  drumBeepLoModalGain: { min: 0, max: 2, step: 0.01 },
  drumBeepLoVariation: { min: 0, max: 1, step: 0.01 },
  drumBeepLoDistance: { min: 0, max: 1, step: 0.01 },
  // Voice 6: Noise
  drumNoiseFilterFreq: { min: 500, max: 15000, step: 100 },
  drumNoiseFilterQ: { min: 0.5, max: 15, step: 0.1 },
  drumNoiseDecay: { min: 5, max: 15000, step: 1 },
  drumNoiseLevel: { min: 0, max: 1, step: 0.01 },
  drumNoiseAttack: { min: 0.1, max: 5000, step: 1 },
  drumNoiseFormant: { min: 0, max: 1, step: 0.01 },
  drumNoiseBreath: { min: 0, max: 1, step: 0.01 },
  drumNoiseFilterEnv: { min: -1, max: 1, step: 0.01 },
  drumNoiseFilterEnvDecay: { min: 5, max: 2000, step: 1 },
  drumNoiseDensity: { min: 0, max: 1, step: 0.01 },
  drumNoiseColorLFO: { min: 0, max: 10, step: 0.1 },
  drumNoiseParticleSize: { min: 1, max: 50, step: 1 },
  drumNoiseParticleRandom: { min: 0, max: 1, step: 0.01 },
  drumNoiseParticleRandomRate: { min: 0, max: 1, step: 0.01 },
  drumNoiseRatchetCount: { min: 0, max: 8, step: 1 },
  drumNoiseRatchetTime: { min: 5, max: 100, step: 1 },
  drumNoiseVariation: { min: 0, max: 1, step: 0.01 },
  drumNoiseDistance: { min: 0, max: 1, step: 0.01 },
  // Voice 7: Membrane
  drumMembraneExcPos: { min: 0, max: 1, step: 0.01 },
  drumMembraneExcBright: { min: 0, max: 1.5, step: 0.01 },
  drumMembraneExcDur: { min: 0.5, max: 50, step: 0.5 },
  drumMembraneSize: { min: 40, max: 600, step: 1 },
  drumMembraneStiffness: { min: 0, max: 1, step: 0.01 },
  drumMembraneDamping: { min: 0, max: 1, step: 0.01 },
  drumMembraneNonlin: { min: 0, max: 1, step: 0.01 },
  drumMembraneWireMix: { min: 0, max: 1, step: 0.01 },
  drumMembraneWireDensity: { min: 0, max: 1, step: 0.01 },
  drumMembraneWireTone: { min: 0, max: 1, step: 0.01 },
  drumMembraneWireDecay: { min: 0, max: 1, step: 0.01 },
  drumMembraneBody: { min: 0, max: 1, step: 0.01 },
  drumMembraneRing: { min: 0, max: 1, step: 0.01 },
  drumMembraneOvertones: { min: 1, max: 8, step: 1 },
  drumMembranePitchEnv: { min: 0, max: 24, step: 1 },
  drumMembranePitchDecay: { min: 1, max: 500, step: 1 },
  drumMembraneAttack: { min: 0, max: 5000, step: 1 },
  drumMembraneDecay: { min: 10, max: 7000, step: 1 },
  drumMembraneLevel: { min: 0, max: 1, step: 0.01 },
  drumMembraneVariation: { min: 0, max: 1, step: 0.01 },
  drumMembraneDistance: { min: 0, max: 1, step: 0.01 },
  drumMembraneScaleBlend: { min: 0, max: 1, step: 0.01 },
  // Drum Voice Morph
  drumSubMorph: { min: 0, max: 1, step: 0.01 },
  drumSubMorphSpeed: { min: 1, max: 32, step: 1 },
  drumKickMorph: { min: 0, max: 1, step: 0.01 },
  drumKickMorphSpeed: { min: 1, max: 32, step: 1 },
  drumClickMorph: { min: 0, max: 1, step: 0.01 },
  drumClickMorphSpeed: { min: 1, max: 32, step: 1 },
  drumBeepHiMorph: { min: 0, max: 1, step: 0.01 },
  drumBeepHiMorphSpeed: { min: 1, max: 32, step: 1 },
  drumBeepLoMorph: { min: 0, max: 1, step: 0.01 },
  drumBeepLoMorphSpeed: { min: 1, max: 32, step: 1 },
  drumNoiseMorph: { min: 0, max: 1, step: 0.01 },
  drumNoiseMorphSpeed: { min: 1, max: 32, step: 1 },
  drumMembraneMorph: { min: 0, max: 1, step: 0.01 },
  drumMembraneMorphSpeed: { min: 1, max: 32, step: 1 },
  // Drum Delay Effect
  drumDelayFeedback: { min: 0, max: 0.95, step: 0.01 },
  drumDelayMix: { min: 0, max: 1, step: 0.01 },
  drumDelayFilter: { min: 0, max: 1, step: 0.01 },
  // Per-voice delay sends
  drumSubDelaySend: { min: 0, max: 1, step: 0.01 },
  drumKickDelaySend: { min: 0, max: 1, step: 0.01 },
  drumClickDelaySend: { min: 0, max: 1, step: 0.01 },
  drumBeepHiDelaySend: { min: 0, max: 1, step: 0.01 },
  drumBeepLoDelaySend: { min: 0, max: 1, step: 0.01 },
  drumNoiseDelaySend: { min: 0, max: 1, step: 0.01 },
  drumMembraneDelaySend: { min: 0, max: 1, step: 0.01 },
  lead1Attack: { min: 0.001, max: 2, step: 0.001 },
  lead1Decay: { min: 0.01, max: 4, step: 0.01 },
  lead1Sustain: { min: 0, max: 1, step: 0.01 },
  lead1Hold: { min: 0, max: 4, step: 0.01 },
  lead1Release: { min: 0.01, max: 8, step: 0.01 },
  delayATime: { min: 0, max: 1000, step: 10 },
  delayAFeedback: { min: 0, max: 0.8, step: 0.01 },
  delayAMix: { min: 0, max: 1, step: 0.01 },
  delayASpread: { min: 1, max: 2, step: 0.01 },
  delayAFilter: { min: 200, max: 8000, step: 10 },
  delayASend: { min: 0, max: 1, step: 0.01 },
  lead1Density: { min: 0.1, max: 12, step: 0.1 },
  lead1Octave: { min: -1, max: 2, step: 1 },
  lead1OctaveRange: { min: 1, max: 4, step: 1 },
  leadTimbre: { min: 0, max: 1, step: 0.01 },
  // Lead 1/2 morph
  lead1Morph: { min: 0, max: 1, step: 0.01 },
  lead1MorphSpeed: { min: 1, max: 32, step: 1 },
  lead1Level: { min: 0, max: 1, step: 0.01 },
  lead1ReverbSend: { min: 0, max: 1, step: 0.01 },
  lead1Distance: { min: 0, max: 1, step: 0.01 },
  lead1PostLPF: { min: 40, max: 8000, step: 10 },
  lead1PostLPFKeyTracking: { min: 0, max: 1, step: 0.01 },
  lead1StereoWidth: { min: 0, max: 1, step: 0.01 },
  lead1DiffuseSend: { min: 0, max: 1, step: 0.01 },
  lead2Morph: { min: 0, max: 1, step: 0.01 },
  lead2MorphSpeed: { min: 1, max: 32, step: 1 },
  lead2Level: { min: 0, max: 1, step: 0.01 },
  lead2ReverbSend: { min: 0, max: 1, step: 0.01 },
  lead2Attack: { min: 0.001, max: 2, step: 0.001 },
  lead2Decay: { min: 0.01, max: 4, step: 0.01 },
  lead2Sustain: { min: 0, max: 1, step: 0.01 },
  lead2Hold: { min: 0, max: 4, step: 0.01 },
  lead2Release: { min: 0.01, max: 8, step: 0.01 },
  lead2Distance: { min: 0, max: 1, step: 0.01 },
  lead2PostLPF: { min: 40, max: 8000, step: 10 },
  lead2PostLPFKeyTracking: { min: 0, max: 1, step: 0.01 },
  lead2StereoWidth: { min: 0, max: 1, step: 0.01 },
  lead2DiffuseSend: { min: 0, max: 1, step: 0.01 },
  pianoLevel: { min: 0, max: 1, step: 0.01 },
  pianoAttack: { min: 0.001, max: 2, step: 0.001 },
  pianoDecay: { min: 0.01, max: 4, step: 0.01 },
  pianoSustain: { min: 0, max: 1, step: 0.01 },
  pianoHold: { min: 0, max: 4, step: 0.01 },
  pianoRelease: { min: 0.01, max: 8, step: 0.01 },
  pianoReverbSend: { min: 0, max: 1, step: 0.01 },
  pianoDistance: { min: 0, max: 1, step: 0.01 },
  pianoPostLPF: { min: 40, max: 8000, step: 10 },
  pianoStereoWidth: { min: 0, max: 1, step: 0.01 },
  pianoDiffuseSend: { min: 0, max: 1, step: 0.01 },
  pianoDelayASend: { min: 0, max: 1, step: 0.01 },
  pianoDelayBSend: { min: 0, max: 1, step: 0.01 },
  leadVibratoDepth: { min: 0, max: 1, step: 0.01 },
  leadVibratoRate: { min: 0, max: 1, step: 0.01 },
  leadGlide: { min: 0, max: 1, step: 0.01 },
  // Shared sequencer transport
  sequencerMasterBPM: { min: 40, max: 300, step: 1 },
  // Euclidean sequencer - shared for all lanes
  synthEuclidBaseBPM: { min: 40, max: 300, step: 1 },
  synthEuclideanTempo: { min: 0.25, max: 12, step: 0.25 },
  synthEuclid1Steps: { min: 4, max: 32, step: 1 },
  synthEuclid1Hits: { min: 1, max: 16, step: 1 },
  synthEuclid1Rotation: { min: 0, max: 31, step: 1 },
  synthEuclid1NoteMin: { min: 36, max: 96, step: 1 },
  synthEuclid1NoteMax: { min: 36, max: 96, step: 1 },
  synthEuclid1Level: { min: 0, max: 1, step: 0.01 },
  synthEuclid1Probability: { min: 0, max: 1, step: 0.01 },
  synthEuclid2Steps: { min: 4, max: 32, step: 1 },
  synthEuclid2Hits: { min: 1, max: 16, step: 1 },
  synthEuclid2Rotation: { min: 0, max: 31, step: 1 },
  synthEuclid2NoteMin: { min: 36, max: 96, step: 1 },
  synthEuclid2NoteMax: { min: 36, max: 96, step: 1 },
  synthEuclid2Level: { min: 0, max: 1, step: 0.01 },
  synthEuclid2Probability: { min: 0, max: 1, step: 0.01 },
  synthEuclid3Steps: { min: 4, max: 32, step: 1 },
  synthEuclid3Hits: { min: 1, max: 16, step: 1 },
  synthEuclid3Rotation: { min: 0, max: 31, step: 1 },
  synthEuclid3NoteMin: { min: 36, max: 96, step: 1 },
  synthEuclid3NoteMax: { min: 36, max: 96, step: 1 },
  synthEuclid3Level: { min: 0, max: 1, step: 0.01 },
  synthEuclid3Probability: { min: 0, max: 1, step: 0.01 },
  synthEuclid4Steps: { min: 4, max: 32, step: 1 },
  synthEuclid4Hits: { min: 1, max: 16, step: 1 },
  synthEuclid4Rotation: { min: 0, max: 31, step: 1 },
  synthEuclid4NoteMin: { min: 36, max: 96, step: 1 },
  synthEuclid4NoteMax: { min: 36, max: 96, step: 1 },
  synthEuclid4Level: { min: 0, max: 1, step: 0.01 },
  synthEuclid4Probability: { min: 0, max: 1, step: 0.01 },
  // Drum Euclidean sequencer
  drumEuclidBaseBPM: { min: 40, max: 300, step: 1 },
  drumEuclidTempo: { min: 0.25, max: 4, step: 0.25 },
  drumEuclidSwing: { min: 0, max: 100, step: 1 },
  drumEuclid1Steps: { min: 2, max: 32, step: 1 },
  drumEuclid1Hits: { min: 0, max: 32, step: 1 },
  drumEuclid1Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid1Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid1VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid1VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid1Level: { min: 0, max: 1, step: 0.01 },
  drumEuclid2Steps: { min: 2, max: 32, step: 1 },
  drumEuclid2Hits: { min: 0, max: 32, step: 1 },
  drumEuclid2Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid2Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid2VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid2VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid2Level: { min: 0, max: 1, step: 0.01 },
  drumEuclid3Steps: { min: 2, max: 32, step: 1 },
  drumEuclid3Hits: { min: 0, max: 32, step: 1 },
  drumEuclid3Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid3Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid3VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid3VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid3Level: { min: 0, max: 1, step: 0.01 },
  drumEuclid4Steps: { min: 2, max: 32, step: 1 },
  drumEuclid4Hits: { min: 0, max: 32, step: 1 },
  drumEuclid4Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid4Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid4VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid4VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid4Level: { min: 0, max: 1, step: 0.01 },
  // Ocean / Earth
  earthLevel: { min: 0, max: 1, step: 0.01 },
  oceanSampleLevel: { min: 0, max: 1, step: 0.01 },
  oceanReverbSend: { min: 0, max: 1, step: 0.01 },
  oceanDelayASend: { min: 0, max: 1, step: 0.01 },
  oceanDelayBSend: { min: 0, max: 1, step: 0.01 },
  oceanSliceDuration: { min: 4, max: 40, step: 0.1 },
  oceanSliceDensity: { min: 0, max: 1, step: 0.01 },
  oceanFilterCutoff: { min: 40, max: 12000, step: 10 },
  oceanFilterResonance: { min: 0, max: 1, step: 0.01 },
  birdsLevel: { min: 0, max: 1, step: 0.01 },
  birdsReverbSend: { min: 0, max: 1, step: 0.01 },
  birdsDelayASend: { min: 0, max: 1, step: 0.01 },
  birdsDelayBSend: { min: 0, max: 1, step: 0.01 },
  birdsSliceDuration: { min: 2, max: 20, step: 0.1 },
  birdsSliceDensity: { min: 0, max: 1, step: 0.01 },
  birds2Level: { min: 0, max: 1, step: 0.01 },
  birds2ReverbSend: { min: 0, max: 1, step: 0.01 },
  birds2DelayASend: { min: 0, max: 1, step: 0.01 },
  birds2DelayBSend: { min: 0, max: 1, step: 0.01 },
  birds2SliceDuration: { min: 2, max: 20, step: 0.1 },
  birds2SliceDensity: { min: 0, max: 1, step: 0.01 },
  frogsLevel: { min: 0, max: 1, step: 0.01 },
  frogsReverbSend: { min: 0, max: 1, step: 0.01 },
  frogsDelayASend: { min: 0, max: 1, step: 0.01 },
  frogsDelayBSend: { min: 0, max: 1, step: 0.01 },
  frogsSliceDuration: { min: 2, max: 18, step: 0.1 },
  frogsSliceDensity: { min: 0, max: 1, step: 0.01 },
  natureLevel: { min: 0, max: 1, step: 0.01 },
  natureReverbSend: { min: 0, max: 1, step: 0.01 },
  natureDelayASend: { min: 0, max: 1, step: 0.01 },
  natureDelayBSend: { min: 0, max: 1, step: 0.01 },
  // Soundscapes (Water + Insects)
  waterMorph: { min: 0, max: 1, step: 0.01 },
  waterIntensity: { min: 0, max: 1, step: 0.01 },
  waterDistance: { min: 0, max: 1, step: 0.01 },
  waterBaseFreq: { min: 100, max: 8000, step: 10 },
  waterDropSize: { min: 0, max: 1, step: 0.01 },
  waterHardness: { min: 0, max: 1, step: 0.01 },
  waterGlassThickness: { min: 0, max: 1, step: 0.01 },
  waterReverbSend: { min: 0, max: 1, step: 0.01 },
  waterDelayASend: { min: 0, max: 1, step: 0.01 },
  waterDelayBSend: { min: 0, max: 1, step: 0.01 },
  waterLevel: { min: 0, max: 1, step: 0.01 },
  waterLayerHardDrops: { min: 0, max: 1, step: 0.01 },
  waterLayerWaterDrops: { min: 0, max: 1, step: 0.01 },
  waterLayerTurbulence: { min: 0, max: 1, step: 0.01 },
  waterLayerBubbling: { min: 0, max: 1, step: 0.01 },
  waterLayerSurf: { min: 0, max: 1, step: 0.01 },
  waterLayerChannels: { min: 0, max: 1, step: 0.01 },
  waterHardDropBaseFreq: { min: 100, max: 8000, step: 10 },
  waterHardDropRate: { min: 0, max: 2, step: 0.01 },
  waterHardDropLPF: { min: 50, max: 16000, step: 1 },
  waterHardDropTone: { min: 0, max: 1, step: 0.01 },
  waterWaterDropBaseFreq: { min: 100, max: 8000, step: 10 },
  waterWaterDropRate: { min: 0, max: 2, step: 0.01 },
  waterWaterDropLPF: { min: 50, max: 16000, step: 1 },
  waterBubblingRate: { min: 0, max: 2, step: 0.01 },
  waterBubblingLPF: { min: 50, max: 8000, step: 1 },
  waterSurfDuration: { min: 2, max: 20, step: 0.5 },
  waterSurfInterval: { min: 3, max: 25, step: 0.5 },
  waterSurfFoam: { min: 0, max: 1, step: 0.01 },
  waterSurfFoamBright: { min: 0, max: 1, step: 0.01 },
  waterSurfProximity: { min: 0, max: 1, step: 0.01 },
  waterSurfDepth: { min: 0, max: 1, step: 0.01 },
  waterSurfBody: { min: 150, max: 800, step: 5 },
  waterSurfSpray: { min: 2000, max: 8000, step: 50 },
  waterDensityHardSend: { min: 0, max: 2.5, step: 0.01 },
  waterDensityWaterSend: { min: 0, max: 2.5, step: 0.01 },
  waterDensityBubbleSend: { min: 0, max: 2.5, step: 0.01 },
  waterDensityFeedback: { min: 0, max: 0.92, step: 0.01 },
  waterDensityTone: { min: 250, max: 4000, step: 10 },
  waterDensityRing: { min: 0, max: 1, step: 0.01 },
  waterDensityWet: { min: 0, max: 1.5, step: 0.01 },
  waterChannelsMorph: { min: 0, max: 1, step: 0.01 },
  waterChannelsSpeed: { min: 0, max: 1, step: 0.01 },
  insectsDensity: { min: 0, max: 1, step: 0.01 },
  insectsTemperature: { min: 0, max: 1, step: 0.01 },
  insectsDistance: { min: 0, max: 1, step: 0.01 },
  insectsProximity: { min: 0, max: 1, step: 0.01 },
  insectsAntiphony: { min: 0, max: 1, step: 0.01 },
  insectsClickRate: { min: 0, max: 1, step: 0.01 },
  insectsMotion: { min: 0, max: 1, step: 0.01 },
  insectsLevel: { min: 0, max: 1, step: 0.01 },
  insectsSharedLevel: { min: 0, max: 1, step: 0.01 },
  insectsReverbSend: { min: 0, max: 1, step: 0.01 },
  insDelayASend: { min: 0, max: 1, step: 0.01 },
  insDelayBSend: { min: 0, max: 1, step: 0.01 },
  insects2Density: { min: 0, max: 1, step: 0.01 },
  insects2Temperature: { min: 0, max: 1, step: 0.01 },
  insects2Distance: { min: 0, max: 1, step: 0.01 },
  insects2Proximity: { min: 0, max: 1, step: 0.01 },
  insects2Antiphony: { min: 0, max: 1, step: 0.01 },
  insects2ClickRate: { min: 0, max: 1, step: 0.01 },
  insects2Motion: { min: 0, max: 1, step: 0.01 },
  insects2Level: { min: 0, max: 1, step: 0.01 },
  // Random Walk
  randomWalkSpeed: { min: 0.1, max: 5, step: 0.1 },
  // Circle of Fifths Drift
  cofDriftRate: { min: 1, max: 8, step: 1 },
  cofDriftRange: { min: 1, max: 6, step: 1 },
  chordProgressionSteps: { min: 2, max: 8, step: 1 },
  chordProgressionHits: { min: 1, max: 8, step: 1 },
  chordProgressionRotation: { min: 0, max: 7, step: 1 },
  transportBarsPerPhrase: { min: 1, max: 16, step: 1 },
  transportBeatsPerBar: { min: 2, max: 12, step: 1 },

  // Per-engine tension overrides (value range depends on mode: follow = ±0.5 offset, locked = 0..1 absolute)
  padTensionValue: { min: -0.5, max: 0.5, step: 0.01 },
  leadTensionValue: { min: -0.5, max: 0.5, step: 0.01 },
  synthEuclidTensionValue: { min: -0.5, max: 0.5, step: 0.01 },
  granularTensionValue: { min: -0.5, max: 0.5, step: 0.01 },
  reverbTensionValue: { min: -0.5, max: 0.5, step: 0.01 },
  drumTensionValue: { min: -0.5, max: 0.5, step: 0.01 },

  // ─── Granular FX ───
  granularFeedback: { min: 0, max: 0.85, step: 0.01 },
  granularFeedbackLPF: { min: 200, max: 12000, step: 50 },
  granularBufferSeconds: { min: 4, max: 16, step: 12 },
  granularReverbSend: { min: 0, max: 1, step: 0.01 },
  granularDiffusion: { min: 0, max: 1, step: 0.01 },
  granularReverbLPF: { min: 200, max: 12000, step: 50 },
  granularOutputLPF: { min: 200, max: 12000, step: 50 },
  granularDelayASend: { min: 0, max: 1, step: 0.01 },
  granularDelayBSend: { min: 0, max: 1, step: 0.01 },
  granularPad1Send: { min: 0, max: 1, step: 0.01 },
  granularPad2Send: { min: 0, max: 1, step: 0.01 },
  granularLead1Send: { min: 0, max: 1, step: 0.01 },
  granularLead2Send: { min: 0, max: 1, step: 0.01 },
  granularPianoSend: { min: 0, max: 1, step: 0.01 },
  granularDrumSend: { min: 0, max: 1, step: 0.01 },
  granularWavesSend: { min: 0, max: 1, step: 0.01 },
  granularNatureSend: { min: 0, max: 1, step: 0.01 },
  granularWaterSend: { min: 0, max: 1, step: 0.01 },
  granularInsectsSend: { min: 0, max: 1, step: 0.01 },
  // Per-voice shared quantization (all 4 voices)
  granularV1Slice: { min: 0, max: 15, step: 1 },
  granularV1Speed: { min: 0, max: 4, step: 0.05 },
  granularV1ScanRate: { min: 0.25, max: 4, step: 0.05 },
  granularV1Pitch: { min: -24, max: 24, step: 1 },
  granularV1Attack: { min: 0.001, max: 0.5, step: 0.001 },
  granularV1Decay: { min: 0.01, max: 4, step: 0.01 },
  granularV1Blur: { min: 0, max: 1, step: 0.01 },
  granularV1GrainOct: { min: 0, max: 1, step: 0.01 },
  granularV1Spray: { min: 0, max: 1, step: 0.01 },
  granularV1Density: { min: 1, max: 64, step: 1 },
  granularV1GrainSize: { min: 10, max: 500, step: 5 },
  granularV1Pan: { min: -1, max: 1, step: 0.01 },
  granularV1Gain: { min: 0, max: 1, step: 0.01 },
  granularV1PosLFORate: { min: 0, max: 1, step: 0.01 },
  granularV1PosLFODepth: { min: 0, max: 1, step: 0.01 },
  granularV1PanLFORate: { min: 0, max: 1, step: 0.01 },
  granularV1StereoSpread: { min: 0, max: 1, step: 0.01 },
  granularV1ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  granularV1WriteFollow: { min: 0, max: 1, step: 0.01 },
  granularV1RecordLFORate: { min: 0, max: 1, step: 0.01 },
  granularV2Slice: { min: 0, max: 15, step: 1 },
  granularV2Speed: { min: 0, max: 4, step: 0.05 },
  granularV2ScanRate: { min: 0.25, max: 4, step: 0.05 },
  granularV2Pitch: { min: -24, max: 24, step: 1 },
  granularV2Attack: { min: 0.001, max: 0.5, step: 0.001 },
  granularV2Decay: { min: 0.01, max: 4, step: 0.01 },
  granularV2Blur: { min: 0, max: 1, step: 0.01 },
  granularV2GrainOct: { min: 0, max: 1, step: 0.01 },
  granularV2Spray: { min: 0, max: 1, step: 0.01 },
  granularV2Density: { min: 1, max: 64, step: 1 },
  granularV2GrainSize: { min: 10, max: 500, step: 5 },
  granularV2Pan: { min: -1, max: 1, step: 0.01 },
  granularV2Gain: { min: 0, max: 1, step: 0.01 },
  granularV2PosLFORate: { min: 0, max: 1, step: 0.01 },
  granularV2PosLFODepth: { min: 0, max: 1, step: 0.01 },
  granularV2PanLFORate: { min: 0, max: 1, step: 0.01 },
  granularV2StereoSpread: { min: 0, max: 1, step: 0.01 },
  granularV2ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  granularV2WriteFollow: { min: 0, max: 1, step: 0.01 },
  granularV2RecordLFORate: { min: 0, max: 1, step: 0.01 },
  granularV3Slice: { min: 0, max: 15, step: 1 },
  granularV3Speed: { min: 0, max: 4, step: 0.05 },
  granularV3ScanRate: { min: 0.25, max: 4, step: 0.05 },
  granularV3Pitch: { min: -24, max: 24, step: 1 },
  granularV3Attack: { min: 0.001, max: 0.5, step: 0.001 },
  granularV3Decay: { min: 0.01, max: 4, step: 0.01 },
  granularV3Blur: { min: 0, max: 1, step: 0.01 },
  granularV3GrainOct: { min: 0, max: 1, step: 0.01 },
  granularV3Spray: { min: 0, max: 1, step: 0.01 },
  granularV3Density: { min: 1, max: 64, step: 1 },
  granularV3GrainSize: { min: 10, max: 500, step: 5 },
  granularV3Pan: { min: -1, max: 1, step: 0.01 },
  granularV3Gain: { min: 0, max: 1, step: 0.01 },
  granularV3PosLFORate: { min: 0, max: 1, step: 0.01 },
  granularV3PosLFODepth: { min: 0, max: 1, step: 0.01 },
  granularV3PanLFORate: { min: 0, max: 1, step: 0.01 },
  granularV3StereoSpread: { min: 0, max: 1, step: 0.01 },
  granularV3ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  granularV3WriteFollow: { min: 0, max: 1, step: 0.01 },
  granularV3RecordLFORate: { min: 0, max: 1, step: 0.01 },
  granularV4Slice: { min: 0, max: 15, step: 1 },
  granularV4Speed: { min: 0, max: 4, step: 0.05 },
  granularV4ScanRate: { min: 0.25, max: 4, step: 0.05 },
  granularV4Pitch: { min: -24, max: 24, step: 1 },
  granularV4Attack: { min: 0.001, max: 0.5, step: 0.001 },
  granularV4Decay: { min: 0.01, max: 4, step: 0.01 },
  granularV4Blur: { min: 0, max: 1, step: 0.01 },
  granularV4GrainOct: { min: 0, max: 1, step: 0.01 },
  granularV4Spray: { min: 0, max: 1, step: 0.01 },
  granularV4Density: { min: 1, max: 64, step: 1 },
  granularV4GrainSize: { min: 10, max: 500, step: 5 },
  granularV4Pan: { min: -1, max: 1, step: 0.01 },
  granularV4Gain: { min: 0, max: 1, step: 0.01 },
  granularV4PosLFORate: { min: 0, max: 1, step: 0.01 },
  granularV4PosLFODepth: { min: 0, max: 1, step: 0.01 },
  granularV4PanLFORate: { min: 0, max: 1, step: 0.01 },
  granularV4StereoSpread: { min: 0, max: 1, step: 0.01 },
  granularV4ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  granularV4WriteFollow: { min: 0, max: 1, step: 0.01 },
  granularV4RecordLFORate: { min: 0, max: 1, step: 0.01 },
  // Legacy
  granularLegacyJitter: { min: 0, max: 30, step: 1 },
  granularLegacyProbability: { min: 0, max: 1, step: 0.01 },
  granularLegacyPitchSpread: { min: 0, max: 12, step: 1 },
  granularLegacyMaxGrains: { min: 0, max: 128, step: 1 },
  granularLegacyFeedback: { min: 0, max: 0.35, step: 0.01 },
  // Harmony
  granularChordBias: { min: 0, max: 1, step: 0.01 },
  // Delay
  granularDelayActivity: { min: 0, max: 1, step: 0.01 },
  granularDelayRepeats: { min: 0, max: 0.85, step: 0.01 },
  granularDelayTime: { min: 0, max: DELAY_B_NOTE_DIVISION_OPTIONS.length - 1, step: 1 },
  granularDelayFilter: { min: 0, max: 1, step: 0.01 },
  granularDelayVibrato: { min: 0, max: 1, step: 0.01 },
  granularDelayMix: { min: 0, max: 1, step: 0.01 },
  granularDelayReverbSend: { min: 0, max: 1, step: 0.01 },
  // Macros
  granularMacroActivity: { min: 0, max: 1, step: 0.01 },
  granularMacroTexture: { min: 0, max: 1, step: 0.01 },
  granularMacroComplexity: { min: 0, max: 1, step: 0.01 },
  granularMacroDarkness: { min: 0, max: 1, step: 0.01 },
  granularMacroChaos: { min: 0, max: 1, step: 0.01 },
};

/**
 * Quantize a value to its step
 */
export function quantize(key: keyof SliderState, value: number): number {
  const def = QUANTIZATION[key];
  if (!def) return value;

  const clamped = Math.max(def.min, Math.min(def.max, value));
  const steps = Math.round((clamped - def.min) / def.step);
  return def.min + steps * def.step;
}

const LEGACY_STATE_KEY_ALIASES = {
  leadDelayReverbSend: 'delayAReverbSend',
  leadDelayTime: 'delayATime',
  leadDelayFeedback: 'delayAFeedback',
  leadDelayMix: 'delayAMix',
  leadDelayEnabled: 'delayAEnabled',
  leadDelaySpread: 'delayASpread',
  leadDelayFilter: 'delayAFilter',
  leadDelaySend: 'delayASend',
  characterWow: 'degradeWow',
  characterFlutter: 'degradeFlutter',
  characterDrift: 'degradeDrift',
  characterTone: 'degradeTone',
  characterHp: 'degradeHp',
  characterLp: 'degradeLp',
  characterNoise: 'degradeNoise',
  characterSaturation: 'degradeSaturation',
  characterCorrosion: 'degradeCorrosion',
} as const satisfies Record<string, keyof SliderState>;

const LEGACY_STATE_KEY_FALLBACKS = Object.fromEntries(
  Object.entries(LEGACY_STATE_KEY_ALIASES).map(([legacyKey, currentKey]) => [currentKey, legacyKey]),
) as Partial<Record<keyof SliderState, string>>;

function applyLegacyStateKeyAliases(record: Record<string, unknown>): void {
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_STATE_KEY_ALIASES)) {
    if (!(currentKey in record) && legacyKey in record) {
      record[currentKey] = record[legacyKey];
    }
    delete record[legacyKey];
  }
}

/**
 * Quantize entire state
 */
export function quantizeState(state: SliderState): SliderState {
  const result = { ...state };

  for (const key of Object.keys(QUANTIZATION) as (keyof SliderState)[]) {
    const value = state[key];
    if (typeof value === 'number') {
      (result as Record<string, unknown>)[key] = quantize(key, value);
    }
  }

  return result;
}

/**
 * Serialize state to stable JSON string (sorted keys)
 */
export function serializeState(state: SliderState): string {
  const ordered: Record<string, unknown> = {};
  for (const key of STATE_KEYS) {
    ordered[key] = state[key];
  }
  return JSON.stringify(ordered);
}

/**
 * Encode state to URL query string
 */
export function encodeStateToUrl(state: SliderState): string {
  const params = new URLSearchParams();

  for (const key of STATE_KEYS) {
    const value = state[key];
    params.set(key, String(value));
  }

  return params.toString();
}

/**
 * Decode state from URL query string
 */
export function decodeStateFromUrl(search: string): SliderState | null {
  if (!search) return null;

  const params = new URLSearchParams(search);
  const state = { ...DEFAULT_STATE };

  try {
    for (const key of STATE_KEYS) {
      const value = params.get(key) ?? params.get(LEGACY_STATE_KEY_FALLBACKS[key] ?? '');
      if (value === null) continue;

      if (isIndexedDelayDivisionKey(key)) {
        const normalized = normalizeIndexedDelayDivisionValue(value);
        if (getIndexedDelayDivisionOptions(key).some((option) => option.value === normalized)) {
          (state as Record<string, unknown>)[key] = normalized;
        }
        continue;
      }

      const def = QUANTIZATION[key];
      if (def) {
        // Numeric parameter
        const num = parseFloat(value);
        if (!isNaN(num)) {
          (state as Record<string, unknown>)[key] = quantize(key, num);
        }
      } else {
        // String parameter - validate
        if (key === 'seedWindow' && (value === 'hour' || value === 'day')) {
          state.seedWindow = value;
        } else if (key === 'randomWalkMode' && (value === 'localBrownian' || value === 'globalWalk')) {
          state.randomWalkMode = value;
        } else if (key === 'scaleMode' && (value === 'auto' || value === 'manual')) {
          state.scaleMode = value;
        } else if (key === 'transportPrimaryClock' && (value === 'seconds' || value === 'bpm' || value === 'decoupled')) {
          state.transportPrimaryClock = value;
        } else if (
          key === 'harmonyClockSource' &&
          (value === 'localPhrase' || value === 'globalPhrase' || value === 'localBeat' || value === 'globalBeat')
        ) {
          state.harmonyClockSource = value;
        } else if (
          key === 'leadRandomClockSource' &&
          (value === 'localPhrase' || value === 'globalPhrase' || value === 'localBeat' || value === 'globalBeat')
        ) {
          state.leadRandomClockSource = value;
        } else if (
          key === 'synthEuclidClockSource' &&
          (value === 'localBeat' || value === 'globalBeat')
        ) {
          state.synthEuclidClockSource = value;
        } else if (
          key === 'drumEuclidClockSource' &&
          (value === 'localBeat' || value === 'globalBeat')
        ) {
          state.drumEuclidClockSource = value;
        } else if (key === 'harmonySyncPolicy' && (value === 'free' || value === 'nextPhrase' || value === 'restartNow')) {
          state.harmonySyncPolicy = value;
        } else if (key === 'leadRandomSyncPolicy' && (value === 'free' || value === 'nextPhrase' || value === 'restartNow')) {
          state.leadRandomSyncPolicy = value;
        } else if (key === 'leadRandomSource' && (value === 'lead1' || value === 'lead2' || value === 'piano')) {
          state.leadRandomSource = value;
        } else if (key === 'synthEuclidJoinPolicy' && (value === 'grid' || value === 'bar')) {
          state.synthEuclidJoinPolicy = value;
        } else if (key === 'drumEuclidJoinPolicy' && (value === 'grid' || value === 'bar')) {
          state.drumEuclidJoinPolicy = value;
        } else if (
          /^synthEuclid[1-4]Source$/.test(key) &&
          (value === 'lead' || value === 'lead1' || value === 'lead2' || value === 'piano' || value === 'synth1' || value === 'synth2' || value === 'synth3' || value === 'synth4' || value === 'synth5' || value === 'synth6')
        ) {
          (state as Record<string, unknown>)[key] = value;
        } else if (
          key === 'chordProgressionClockSource' &&
          (value === 'harmony' || value === 'localPhrase' || value === 'globalPhrase')
        ) {
          state.chordProgressionClockSource = value;
        } else if (key === 'manualScale' && SCALE_FAMILIES.some((s) => s.name === value)) {
          state.manualScale = value;
        } else if (key === 'reverbEngine' && (value === 'algorithmic' || value === 'convolution')) {
          state.reverbEngine = value;
        } else if (key === 'reverbType') {
          // Handle iOS-only reverb presets by mapping to closest web-compatible preset
          const webCompatibleTypes = ['plate', 'hall', 'cathedral', 'darkHall'];
          const iOSOnlyMapping: Record<string, SliderState['reverbType']> = {
            smallRoom: 'plate',
            mediumRoom: 'plate',
            largeRoom: 'hall',
            mediumHall: 'hall',
            largeHall: 'hall',
            mediumChamber: 'hall',
            largeChamber: 'cathedral',
            largeRoom2: 'hall',
            mediumHall2: 'hall',
            mediumHall3: 'darkHall',
            largeHall2: 'cathedral',
          };
          
          if (webCompatibleTypes.includes(value)) {
            state.reverbType = value as SliderState['reverbType'];
          } else if (iOSOnlyMapping[value]) {
            // iOS-only preset detected - use mapped fallback
            state.reverbType = iOSOnlyMapping[value];
            console.log(`iOS-only reverb type "${value}" mapped to "${iOSOnlyMapping[value]}"`);
          } else {
            // Unknown reverb type - default to cathedral
            state.reverbType = 'cathedral';
            console.warn(`Unknown reverb type "${value}" - defaulting to cathedral`);
          }
        } else if (
          key === 'filterType' &&
          ['lowpass', 'bandpass', 'highpass', 'notch'].includes(value)
        ) {
          state.filterType = value as SliderState['filterType'];
        } else if (
          key === 'oceanFilterType' &&
          ['lowpass', 'bandpass', 'highpass', 'notch'].includes(value)
        ) {
          state.oceanFilterType = value as SliderState['oceanFilterType'];
        } else if (
          key === 'granularSpaceMode' &&
          (value === 'diffuse' || value === 'clocked')
        ) {
          state.granularSpaceMode = value as SliderState['granularSpaceMode'];
        } else if (key === 'delayAPingPong') {
          state.delayAPingPong = value === 'true';
        } else if (
          key === 'delayAFilterType' &&
          ['lowpass', 'bandpass', 'highpass'].includes(value)
        ) {
          state.delayAFilterType = value as SliderState['delayAFilterType'];
        } else if (
          key === 'delayBPattern' &&
          ['cascade', 'golden', 'mirror', 'dotted'].includes(value)
        ) {
          state.delayBPattern = value as SliderState['delayBPattern'];
        } else if (
          key === 'delayBWarp' &&
          ['clean', 'filterSweep', 'pitchDrift', 'grainCrossfade'].includes(value)
        ) {
          state.delayBWarp = value as SliderState['delayBWarp'];
        } else if (
          key === 'granularPresetBehavior' &&
          (value === 'pure' || value === 'expressive')
        ) {
          state.granularPresetBehavior = value as SliderState['granularPresetBehavior'];
        } else if (key === 'delayBGranularLinked') {
          state.delayBGranularLinked = value === 'true';
        } else if (
          key === 'masterSatMode' &&
          ['clean', 'tape', 'tube'].includes(value)
        ) {
          state.masterSatMode = value as SliderState['masterSatMode'];
        } else if (key === 'dynamicsEnabled') {
          state.dynamicsEnabled = value === 'true';
        } else if (key === 'dynamicsSaturationEnabled') {
          state.dynamicsSaturationEnabled = value === 'true';
        } else if (
          key === 'dynamicsSaturationMode' &&
          ['clean', 'tape', 'tube', 'diode', 'fold'].includes(value)
        ) {
          state.dynamicsSaturationMode = value as SliderState['dynamicsSaturationMode'];
        } else if (key === 'sidechainEnabled') {
          state.sidechainEnabled = value === 'true';
        } else if (key === 'characterEnabled') {
          state.characterEnabled = value === 'true';
        } else if (key === 'degradeEnabled') {
          state.degradeEnabled = value === 'true';
        } else if (
          (key === 'sidechainKeyA' || key === 'sidechainKeyB') &&
          ['off', 'sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'].includes(value)
        ) {
          (state as Record<string, unknown>)[key] = value;
        } else if (key === 'characterMode') {
          if (['clean', 'abyssWater', 'shallowWater'].includes(value)) {
            state.characterMode = value as SliderState['characterMode'];
          } else if (['degenerateGain', 'generationLoss', 'wornVhs'].includes(value)) {
            state.characterMode = 'clean';
          }
        } else if (key === 'endCompEnabled') {
          state.endCompEnabled = value === 'true';
        } else if (
          key === 'granularShape' &&
          ['triangle', 'sawUp', 'sawDown', 'square'].includes(value)
        ) {
          state.granularShape = value as SliderState['granularShape'];
        } else if (
          ['granularV1TempoDiv', 'granularV2TempoDiv', 'granularV3TempoDiv', 'granularV4TempoDiv'].includes(key) &&
          ['1/4', '1/8', '1/16', '1/32', '1/64', '1/8T'].includes(value)
        ) {
          (state as Record<string, unknown>)[key] = value;
        } else if (
          key === 'grainPitchMode' &&
          ['random', 'harmonic'].includes(value)
        ) {
          state.grainPitchMode = value as SliderState['grainPitchMode'];
        } else if (
          key === 'granularLegacyPitchMode' &&
          ['random', 'harmonic'].includes(value)
        ) {
          state.granularLegacyPitchMode = value as SliderState['granularLegacyPitchMode'];
        } else if (key === 'padEnabled') {
          state.padEnabled = value === 'true';
        } else if (key === 'leadEnabled') {
          state.leadEnabled = value === 'true';
        } else if (key === 'leadRandomEnabled') {
          state.leadRandomEnabled = value === 'true';
        } else if (key === 'pianoEnabled') {
          state.pianoEnabled = value === 'true';
        } else if (
          key === 'granularV1TempoSync' ||
          key === 'granularV2TempoSync' ||
          key === 'granularV3TempoSync' ||
          key === 'granularV4TempoSync'
        ) {
          (state as Record<string, unknown>)[key] = value === 'true';
        // Lead 1/2 morph params
        } else if (key === 'lead1PresetA') {
          state.lead1PresetA = value;
        } else if (key === 'lead1PresetB') {
          state.lead1PresetB = value;
        } else if (key === 'lead1MorphAuto') {
          state.lead1MorphAuto = value === 'true';
        } else if (key === 'lead1MorphMode' && ['linear', 'pingpong', 'random'].includes(value)) {
          state.lead1MorphMode = value as 'linear' | 'pingpong' | 'random';
        } else if (key === 'lead1AlgorithmMode' && ['snap', 'presetA'].includes(value)) {
          state.lead1AlgorithmMode = value as 'snap' | 'presetA';
        } else if (key === 'lead2Enabled') {
          state.lead2Enabled = value === 'true';
        } else if (key === 'lead2PresetC') {
          state.lead2PresetC = value;
        } else if (key === 'lead2PresetD') {
          state.lead2PresetD = value;
        } else if (key === 'lead2MorphAuto') {
          state.lead2MorphAuto = value === 'true';
        } else if (key === 'lead2MorphMode' && ['linear', 'pingpong', 'random'].includes(value)) {
          state.lead2MorphMode = value as 'linear' | 'pingpong' | 'random';
        } else if (key === 'lead2AlgorithmMode' && ['snap', 'presetA'].includes(value)) {
          state.lead2AlgorithmMode = value as 'snap' | 'presetA';
        } else if (key === 'lead2UseCustomAdsr') {
          state.lead2UseCustomAdsr = value === 'true';
        } else if (key === 'synthEuclideanMasterEnabled') {
          state.synthEuclideanMasterEnabled = value === 'true';
        } else if (key === 'synthEuclid1Enabled') {
          state.synthEuclid1Enabled = value === 'true';
        } else if (key === 'synthEuclid2Enabled') {
          state.synthEuclid2Enabled = value === 'true';
        } else if (key === 'synthEuclid3Enabled') {
          state.synthEuclid3Enabled = value === 'true';
        } else if (key === 'synthEuclid4Enabled') {
          state.synthEuclid4Enabled = value === 'true';
        } else if (key === 'synthEuclid1Preset') {
          state.synthEuclid1Preset = value;
        } else if (key === 'synthEuclid2Preset') {
          state.synthEuclid2Preset = value;
        } else if (key === 'synthEuclid3Preset') {
          state.synthEuclid3Preset = value;
        } else if (key === 'synthEuclid4Preset') {
          state.synthEuclid4Preset = value;
        } else if (key === 'oceanSampleEnabled') {
          state.oceanSampleEnabled = value === 'true';
        } else if (key === 'birdsEnabled') {
          state.birdsEnabled = value === 'true';
        } else if (key === 'birds2Enabled') {
          state.birds2Enabled = value === 'true';
        } else if (key === 'frogsEnabled') {
          state.frogsEnabled = value === 'true';
        }
      }
    }

    const legacyPadDelayA = params.get('padDelayASend');
    if (legacyPadDelayA !== null) {
      const parsed = parseFloat(legacyPadDelayA);
      if (!Number.isNaN(parsed)) {
        const next = quantize('pad1DelayASend', parsed);
        if (params.get('pad1DelayASend') === null) state.pad1DelayASend = next;
        if (params.get('pad2DelayASend') === null) state.pad2DelayASend = next;
      }
    }

    const legacyPadDelayB = params.get('padDelayBSend');
    if (legacyPadDelayB !== null) {
      const parsed = parseFloat(legacyPadDelayB);
      if (!Number.isNaN(parsed)) {
        const next = quantize('pad1DelayBSend', parsed);
        if (params.get('pad1DelayBSend') === null) state.pad1DelayBSend = next;
        if (params.get('pad2DelayBSend') === null) state.pad2DelayBSend = next;
      }
    }

    const legacyPadReverb = params.get('synthReverbSend');
    if (legacyPadReverb !== null) {
      const parsed = parseFloat(legacyPadReverb);
      if (!Number.isNaN(parsed)) {
        const pad1Next = quantize('pad1ReverbSend', parsed);
        const pad2Next = quantize('pad2ReverbSend', parsed);
        if (params.get('pad1ReverbSend') === null) state.pad1ReverbSend = pad1Next;
        if (params.get('pad2ReverbSend') === null) state.pad2ReverbSend = pad2Next;
      }
    }

    const sharedSequencerBpm =
      typeof state.sequencerMasterBPM === 'number' ? state.sequencerMasterBPM :
      typeof state.synthEuclidBaseBPM === 'number' ? state.synthEuclidBaseBPM :
      typeof state.drumEuclidBaseBPM === 'number' ? state.drumEuclidBaseBPM :
      DEFAULT_STATE.sequencerMasterBPM;

    state.sequencerMasterBPM = quantize('sequencerMasterBPM', sharedSequencerBpm);
    state.synthEuclidBaseBPM = state.sequencerMasterBPM;
    state.drumEuclidBaseBPM = state.sequencerMasterBPM;

    return state;
  } catch {
    return null;
  }
}

/**
 * Generate share URL
 */
export function generateShareUrl(state: SliderState): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?${encodeStateToUrl(state)}`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}

/**
 * Get parameter info for UI
 */
export function getParamInfo(key: keyof SliderState): QuantizationDef | null {
  return QUANTIZATION[key] || null;
}

/**
 * Drum morph keys that default to sampleHold mode
 */
export const DRUM_MORPH_KEYS = new Set<keyof SliderState>([
  'drumSubMorph', 'drumKickMorph', 'drumClickMorph',
  'drumBeepHiMorph', 'drumBeepLoMorph', 'drumNoiseMorph', 'drumMembraneMorph'
] as (keyof SliderState)[]);

/**
 * Migration map for converting old *Min/*Max preset fields to unified single-value + dualRanges format.
 */
const PRESET_MIGRATION_MAP: Array<{
  minKey: string; maxKey: string;
  newKey: keyof SliderState; defaultMode: SliderMode;
  threshold: number;
}> = [
  { minKey: 'leadVibratoDepthMin', maxKey: 'leadVibratoDepthMax', newKey: 'leadVibratoDepth', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'leadVibratoRateMin', maxKey: 'leadVibratoRateMax', newKey: 'leadVibratoRate', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'leadGlideMin', maxKey: 'leadGlideMax', newKey: 'leadGlide', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'leadDelayTimeMin', maxKey: 'leadDelayTimeMax', newKey: 'delayATime', defaultMode: 'sampleHold', threshold: 0.1 },
  { minKey: 'leadDelayFeedbackMin', maxKey: 'leadDelayFeedbackMax', newKey: 'delayAFeedback', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'leadDelayMixMin', maxKey: 'leadDelayMixMax', newKey: 'delayAMix', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'lead1MorphMin', maxKey: 'lead1MorphMax', newKey: 'lead1Morph', defaultMode: 'sampleHold', threshold: 0.0001 },
  { minKey: 'lead2MorphMin', maxKey: 'lead2MorphMax', newKey: 'lead2Morph', defaultMode: 'sampleHold', threshold: 0.0001 },
  { minKey: 'leadTimbreMin', maxKey: 'leadTimbreMax', newKey: 'leadTimbre', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'grainSizeMin', maxKey: 'grainSizeMax', newKey: 'grainSize', defaultMode: 'sampleHold', threshold: 0.5 },
];

/**
 * Migrate a preset from old *Min/*Max format to unified format.
 * Safe to call on already-migrated presets (no-op if old fields absent).
 */
export function migratePreset(preset: any): SavedPreset {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: Record<string, any> = { ...preset.state };
  const dualRanges: Record<string, { min: number; max: number }> = { ...(preset.dualRanges || {}) };
  const sliderModes: Record<string, SliderMode> = { ...(preset.sliderModes || {}) };

  applyLegacyStateKeyAliases(state as Record<string, unknown>);
  applyLegacyStateKeyAliases(dualRanges as Record<string, unknown>);
  applyLegacyStateKeyAliases(sliderModes as Record<string, unknown>);

  // Migrate *Min/*Max pairs → single value + dualRanges + sliderModes
  for (const { minKey, maxKey, newKey, defaultMode, threshold } of PRESET_MIGRATION_MAP) {
    if (minKey in state) {
      const min = state[minKey] as number;
      const max = (state[maxKey] ?? min) as number;
      const isDual = Math.abs(max - min) > threshold;

      // Set single value to midpoint (or min if single)
      state[newKey] = isDual ? (min + max) / 2 : min;

      if (isDual) {
        dualRanges[newKey] = { min, max };
        sliderModes[newKey] = defaultMode;
      }

      delete state[minKey];
      delete state[maxKey];
    }
  }

  // Infer modes for existing dualRanges keys from old format (no sliderModes field)
  if (!preset.sliderModes) {
    for (const key of Object.keys(dualRanges)) {
      if (!(key in sliderModes)) {
        sliderModes[key] = (DRUM_MORPH_KEYS as Set<string>).has(key) ? 'sampleHold' : 'walk';
      }
    }
  }

  // ═══ Legacy looper* → granular* key rename ═══
  for (const key of Object.keys(state)) {
    if (key.startsWith('looper')) {
      const newKey = 'granular' + key.slice(6);
      if (!(newKey in state)) {
        state[newKey] = state[key];
      }
      delete state[key];
    }
  }
  for (const key of Object.keys(dualRanges)) {
    if (key.startsWith('looper')) {
      const newKey = 'granular' + key.slice(6);
      const range = dualRanges[key];
      if (!(newKey in dualRanges) && range) {
        dualRanges[newKey] = range;
      }
      delete dualRanges[key];
    }
  }
  for (const key of Object.keys(sliderModes)) {
    if (key.startsWith('looper')) {
      const newKey = 'granular' + key.slice(6);
      const mode = sliderModes[key];
      if (!(newKey in sliderModes) && mode) {
        sliderModes[newKey] = mode;
      }
      delete sliderModes[key];
    }
  }

  // ═══ Legacy combined pad delay sends → split pad sends ═══
  if (typeof state.padDelayASend === 'number') {
    if (typeof state.pad1DelayASend !== 'number') state.pad1DelayASend = state.padDelayASend;
    if (typeof state.pad2DelayASend !== 'number') state.pad2DelayASend = state.padDelayASend;
    delete state.padDelayASend;
  }
  if (typeof state.padDelayBSend === 'number') {
    if (typeof state.pad1DelayBSend !== 'number') state.pad1DelayBSend = state.padDelayBSend;
    if (typeof state.pad2DelayBSend !== 'number') state.pad2DelayBSend = state.padDelayBSend;
    delete state.padDelayBSend;
  }
  if (dualRanges.padDelayASend) {
    if (!dualRanges.pad1DelayASend) dualRanges.pad1DelayASend = { ...dualRanges.padDelayASend };
    if (!dualRanges.pad2DelayASend) dualRanges.pad2DelayASend = { ...dualRanges.padDelayASend };
    delete dualRanges.padDelayASend;
  }
  if (dualRanges.padDelayBSend) {
    if (!dualRanges.pad1DelayBSend) dualRanges.pad1DelayBSend = { ...dualRanges.padDelayBSend };
    if (!dualRanges.pad2DelayBSend) dualRanges.pad2DelayBSend = { ...dualRanges.padDelayBSend };
    delete dualRanges.padDelayBSend;
  }
  if (sliderModes.padDelayASend) {
    if (!sliderModes.pad1DelayASend) sliderModes.pad1DelayASend = sliderModes.padDelayASend;
    if (!sliderModes.pad2DelayASend) sliderModes.pad2DelayASend = sliderModes.padDelayASend;
    delete sliderModes.padDelayASend;
  }
  if (sliderModes.padDelayBSend) {
    if (!sliderModes.pad1DelayBSend) sliderModes.pad1DelayBSend = sliderModes.padDelayBSend;
    if (!sliderModes.pad2DelayBSend) sliderModes.pad2DelayBSend = sliderModes.padDelayBSend;
    delete sliderModes.padDelayBSend;
  }

  // ═══ Legacy shared pad reverb send → split pad reverb sends ═══
  if (typeof state.synthReverbSend === 'number') {
    if (typeof state.pad1ReverbSend !== 'number') state.pad1ReverbSend = state.synthReverbSend;
    if (typeof state.pad2ReverbSend !== 'number') state.pad2ReverbSend = state.synthReverbSend;
    delete state.synthReverbSend;
  }
  if (dualRanges.synthReverbSend) {
    if (!dualRanges.pad1ReverbSend) dualRanges.pad1ReverbSend = { ...dualRanges.synthReverbSend };
    if (!dualRanges.pad2ReverbSend) dualRanges.pad2ReverbSend = { ...dualRanges.synthReverbSend };
    delete dualRanges.synthReverbSend;
  }
  if (sliderModes.synthReverbSend) {
    if (!sliderModes.pad1ReverbSend) sliderModes.pad1ReverbSend = sliderModes.synthReverbSend;
    if (!sliderModes.pad2ReverbSend) sliderModes.pad2ReverbSend = sliderModes.synthReverbSend;
    delete sliderModes.synthReverbSend;
  }

  // ═══ Normalize legacy reverbLevel from old 0–2 range to 0–1 ═══
  // granularLevel now natively supports 0–2 again, so only reverb remains scaled here.
  if (typeof state.reverbLevel === 'number' && state.reverbLevel > 1) {
    state.reverbLevel = Math.min(1, state.reverbLevel / 2);
  }
  // Also migrate dualRanges for reverb
  if (dualRanges.reverbLevel) {
    const dr = dualRanges.reverbLevel;
    if (typeof dr.min === 'number' && dr.min > 1) dr.min = Math.min(1, dr.min / 2);
    if (typeof dr.max === 'number' && dr.max > 1) dr.max = Math.min(1, dr.max / 2);
  }

  // ═══ Legacy Granular → Unified Granular migration ═══
  // If preset has old standalone granular params but no unified engine params, map them
  if (('density' in state || 'spray' in state || 'grainSize' in state) && !('granularEnabled' in state)) {
    // Map old granular params → Voice 1 of unified granular in legacy mode
    if (state.density !== undefined) {
      state.granularV1Density = state.density;
    }
    if (state.spray !== undefined) {
      // Old spray was 0-600ms, new spray is 0-1 normalized
      state.granularV1Spray = Math.min(1, (state.spray as number) / 600);
    }
    if (state.grainSize !== undefined) {
      state.granularV1GrainSize = state.grainSize;
    }
    if (state.jitter !== undefined) {
      state.granularLegacyJitter = state.jitter;
    }
    if (state.grainProbability !== undefined) {
      state.granularLegacyProbability = state.grainProbability;
    }
    if (state.grainPitchMode !== undefined) {
      state.granularLegacyPitchMode = state.grainPitchMode;
    }
    if (state.pitchSpread !== undefined) {
      state.granularLegacyPitchSpread = state.pitchSpread;
    }
    if (state.maxGrains !== undefined) {
      state.granularLegacyMaxGrains = state.maxGrains;
    }
    if (state.stereoSpread !== undefined) {
      state.granularV1StereoSpread = state.stereoSpread;
    }
    if (state.feedback !== undefined) {
      state.granularLegacyFeedback = Math.min(0.35, state.feedback as number);
    }
    // granularReverbSend carries over as-is (same key name in unified engine)
    // Set Voice 1 to legacy mode
    state.granularV1Mode = 'legacy';
    state.granularV1Enabled = true;
    state.granularPreset = 'legacy_cloud';
  }

  // ═══ Legacy drumMembraneTension → drumMembraneStiffness rename ═══
  if ('drumMembraneTension' in state && !('drumMembraneStiffness' in state)) {
    state.drumMembraneStiffness = state.drumMembraneTension;
    delete state.drumMembraneTension;
  }

  // ═══ Legacy waveSpread: seconds → fraction of chordRate ═══
  if (typeof state.waveSpread === 'number' && state.waveSpread > 1) {
    const cr = typeof state.chordRate === 'number' ? state.chordRate : 32;
    state.waveSpread = Math.min(1, state.waveSpread / cr);
  }

  // ═══ Shared sequencer BPM: collapse legacy per-engine BPMs onto one master ═══
  const sharedSequencerBpm =
    typeof state.sequencerMasterBPM === 'number' ? state.sequencerMasterBPM :
    typeof state.synthEuclidBaseBPM === 'number' ? state.synthEuclidBaseBPM :
    typeof state.drumEuclidBaseBPM === 'number' ? state.drumEuclidBaseBPM :
    typeof (state as Record<string, unknown>).granularEuclidBaseBPM === 'number'
      ? ((state as Record<string, unknown>).granularEuclidBaseBPM as number)
      :
    DEFAULT_STATE.sequencerMasterBPM;

  state.sequencerMasterBPM = Math.max(40, Math.min(300, sharedSequencerBpm));
  state.synthEuclidBaseBPM = state.sequencerMasterBPM;
  state.drumEuclidBaseBPM = state.sequencerMasterBPM;

  for (const key of Object.keys(state)) {
    if (key.startsWith('granularEuclid')) {
      delete state[key];
    }
  }

  // ═══ Migrate older chord progression transport fields ═══
  if (typeof (preset as Record<string, unknown>).chordProgressionBarsPerStep === 'number'
      && typeof state.chordProgressionPhraseMultiplier !== 'number') {
    const barsPerStep = Number((preset as Record<string, unknown>).chordProgressionBarsPerStep);
    state.chordProgressionPhraseMultiplier = (barsPerStep <= 1 ? 1 : barsPerStep <= 2 ? 2 : barsPerStep <= 4 ? 4 : 8) as 1 | 2 | 4 | 8;
  }
  const progressionStepCountRaw = Number(state.chordProgressionSteps ?? DEFAULT_STATE.chordProgressionSteps);
  const progressionStepCount = Number.isFinite(progressionStepCountRaw)
    ? Math.max(2, Math.min(8, Math.round(progressionStepCountRaw)))
    : DEFAULT_STATE.chordProgressionSteps;
  state.chordProgressionSteps = progressionStepCount;

  const progressionPattern = Array.isArray(state.chordProgressionPattern)
    ? state.chordProgressionPattern
        .map((value: unknown) => {
          const numericValue = Number(value);
          return Number.isFinite(numericValue)
            ? Math.max(0, Math.min(6, Math.round(numericValue)))
            : 0;
        })
        .slice(0, progressionStepCount)
    : [];
  state.chordProgressionPattern = progressionPattern.concat(
    DEFAULT_STATE.chordProgressionPattern.slice(progressionPattern.length, progressionStepCount),
  );

  if (!Array.isArray((state as Record<string, unknown>).chordProgressionStepEnabled)) {
    const hitsRaw = Number((preset as Record<string, unknown>).chordProgressionHits ?? state.chordProgressionHits ?? DEFAULT_STATE.chordProgressionHits);
    const rotationRaw = Number((preset as Record<string, unknown>).chordProgressionRotation ?? state.chordProgressionRotation ?? DEFAULT_STATE.chordProgressionRotation);
    const hits = Number.isFinite(hitsRaw) ? Math.max(0, Math.min(progressionStepCount, Math.round(hitsRaw))) : DEFAULT_STATE.chordProgressionHits;
    const rotation = Number.isFinite(rotationRaw) ? Math.max(0, Math.round(rotationRaw)) : DEFAULT_STATE.chordProgressionRotation;
    const enabled = new Array(progressionStepCount).fill(false);
    if (hits >= progressionStepCount) {
      enabled.fill(true);
    } else if (hits > 0) {
      const step = progressionStepCount / hits;
      for (let i = 0; i < hits; i++) {
        const index = ((Math.floor(i * step) + rotation) % progressionStepCount + progressionStepCount) % progressionStepCount;
        enabled[index] = true;
      }
    }
    state.chordProgressionStepEnabled = enabled;
  } else {
    state.chordProgressionStepEnabled = state.chordProgressionStepEnabled
      .map((value: unknown) => Boolean(value))
      .slice(0, progressionStepCount)
      .concat(
        new Array(Math.max(0, progressionStepCount - state.chordProgressionStepEnabled.length)).fill(true),
      );
  }

  const hydratedState = hydrateOptimizedStatePresetData(state);
  for (const [key, value] of Object.entries(hydratedState)) {
    if (!(key in state)) {
      state[key] = value;
    }
  }

  // ═══ Evolve configs: migrate intensity → evolution if present ═══
  let drumEvolveConfigs = preset.drumEvolveConfigs as SerializedEvolveConfig[] | undefined;
  let synthEvolveConfigs = preset.synthEvolveConfigs as SerializedEvolveConfig[] | undefined;

  // Migrate legacy 'intensity' field → 'evolution' in saved evolve configs
  const migrateEvolveArray = (arr?: any[]): SerializedEvolveConfig[] | undefined => {
    if (!arr) return undefined;
    return arr.map((c: any) => {
      if (c && 'intensity' in c && !('evolution' in c)) {
        const { intensity, ...rest } = c;
        return { ...rest, evolution: intensity };
      }
      return c;
    });
  };
  drumEvolveConfigs = migrateEvolveArray(drumEvolveConfigs);
  synthEvolveConfigs = migrateEvolveArray(synthEvolveConfigs);

  return {
    name: preset.name || 'Untitled',
    timestamp: preset.timestamp || new Date().toISOString(),
    state: state as SliderState,
    dualRanges: Object.keys(dualRanges).length > 0 ? dualRanges : undefined,
    sliderModes: Object.keys(sliderModes).length > 0 ? sliderModes : undefined,
    drumEvolveConfigs,
    synthEvolveConfigs,
    drumStepOverrides: preset.drumStepOverrides,
    synthStepOverrides: preset.synthStepOverrides,
    drumClockDivs: preset.drumClockDivs,
    synthClockDivs: preset.synthClockDivs,
    drumSwings: preset.drumSwings,
    synthSwings: preset.synthSwings,
    drumLinked: preset.drumLinked,
    synthLinked: preset.synthLinked,
    drumSubLaneStates: preset.drumSubLaneStates,
    synthSubLaneStates: preset.synthSubLaneStates,
    synthPitchSettings: preset.synthPitchSettings,
    synthPitchBindingModes: preset.synthPitchBindingModes,
  };
}
