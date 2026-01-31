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

export interface SliderState {
  // Master Mixer
  masterVolume: number;       // 0..1 step 0.01
  synthLevel: number;         // 0..1 step 0.01 - dry synth level
  granularLevel: number;      // 0..1 step 0.01 - granular output level
  synthReverbSend: number;    // 0..1 step 0.01 - how much synth goes to reverb
  granularReverbSend: number; // 0..1 step 0.01 - how much granular goes to reverb
  leadReverbSend: number;     // 0..1 step 0.01 - how much lead goes to reverb
  leadDelayReverbSend: number; // 0..1 step 0.01 - how much lead delay goes to reverb
  reverbLevel: number;        // 0..1 step 0.01 - reverb output level

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

  // Harmony/Pitch
  scaleMode: 'auto' | 'manual';
  manualScale: string;        // Scale family name
  tension: number;            // 0..1 step 0.01
  chordRate: number;          // 8..64 seconds step 1
  voicingSpread: number;      // 0..1 step 0.01
  waveSpread: number;         // 0..4 seconds - stagger time between voice entries
  detune: number;             // 0..25 cents step 1
  // Synth voice ADSR
  synthAttack: number;        // 0.01..8 seconds
  synthDecay: number;         // 0.01..8 seconds
  synthSustain: number;       // 0..1 level
  synthRelease: number;       // 0.01..16 seconds
  synthVoiceMask: number;     // 1..63 binary mask for which voices play (1=voice1, 2=voice2, 4=voice3, etc)
  synthOctave: number;        // -2..+2 octave shift

  // Timbre
  hardness: number;           // 0..1 step 0.01
  oscBrightness: number;      // 0..3 step 1 (0=sine, 1=triangle, 2=saw+tri, 3=sawtooth)
  filterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  filterCutoffMin: number;    // 40..8000 Hz - lower bound of filter sweep
  filterCutoffMax: number;    // 40..8000 Hz - upper bound of filter sweep
  filterModSpeed: number;     // 0..8 phrases - how many phrases per full cycle (0 = no modulation)
  filterResonance: number;    // 0..1 step 0.01 (resonance peak)
  filterQ: number;            // 0.1..12 step 0.1 (filter bandwidth/angle)
  warmth: number;             // 0..1 step 0.01 (low shelf boost)
  presence: number;           // 0..1 step 0.01 (high-mid presence)
  airNoise: number;           // 0..1 step 0.01

  // Space
  reverbEngine: 'algorithmic' | 'convolution';
  reverbType: 'plate' | 'hall' | 'cathedral' | 'darkHall';
  reverbDecay: number;        // 0..1 step 0.01 (longer tail)
  reverbSize: number;         // 0.5..3.0 step 0.1 (room size)
  reverbDiffusion: number;    // 0..1 step 0.01 (smear amount)
  reverbModulation: number;   // 0..1 step 0.01 (chorus-like shimmer)
  predelay: number;           // 0..100ms step 1
  damping: number;            // 0..1 step 0.01
  width: number;              // 0..1 step 0.01

  // Granular
  granularEnabled: boolean;    // on/off toggle for granular processing
  grainProbability: number;   // 0..1 step 0.01 - chance each grain triggers
  grainSizeMin: number;       // 5..60 ms step 1 - minimum grain size
  grainSizeMax: number;       // 20..200 ms step 1 - maximum grain size
  density: number;            // 5..80 grains/sec step 1
  spray: number;              // 0..600 ms step 5
  jitter: number;             // 0..30 ms step 1
  grainPitchMode: 'random' | 'harmonic'; // pitch mode
  pitchSpread: number;        // 0..12 semitones step 1
  stereoSpread: number;       // 0..1 step 0.01
  feedback: number;           // 0..0.35 step 0.01
  wetHPF: number;             // 200..3000 Hz step 50
  wetLPF: number;             // 3000..12000 Hz step 200

  // Lead Synth (Rhodes/Bell)
  leadEnabled: boolean;       // on/off toggle
  leadLevel: number;          // 0..1 step 0.01
  leadAttack: number;         // 0.001..2 seconds
  leadDecay: number;          // 0.01..4 seconds
  leadSustain: number;        // 0..1 level
  leadRelease: number;        // 0.01..8 seconds
  leadDelayTime: number;      // 0..1000 ms step 10
  leadDelayFeedback: number;  // 0..0.8 step 0.01
  leadDelayMix: number;       // 0..1 step 0.01
  leadDensity: number;        // 0.1..2 notes per phrase (sparseness)
  leadOctave: number;         // -1, 0, 1, 2 octave offset
  leadOctaveRange: number;    // 1..4 - how many octaves to span for random notes
  leadTimbreMin: number;      // 0..1 - min timbre (0=soft rhodes, 1=bell)
  leadTimbreMax: number;      // 0..1 - max timbre (0=soft rhodes, 1=bell)
  // Euclidean sequencer for lead - 4 independent lanes for polyrhythmic patterns
  leadEuclideanMasterEnabled: boolean;  // master on/off (off = random mode)
  leadEuclideanTempo: number;           // 0.25..12 - tempo multiplier for all lanes
  // Lane 1
  leadEuclid1Enabled: boolean;
  leadEuclid1Preset: string;
  leadEuclid1Steps: number;
  leadEuclid1Hits: number;
  leadEuclid1Rotation: number;
  leadEuclid1NoteMin: number;    // 36..96 MIDI note - low end of note range
  leadEuclid1NoteMax: number;    // 36..96 MIDI note - high end of note range
  leadEuclid1Level: number;      // 0..1 velocity/level for this lane
  // Lane 2
  leadEuclid2Enabled: boolean;
  leadEuclid2Preset: string;
  leadEuclid2Steps: number;
  leadEuclid2Hits: number;
  leadEuclid2Rotation: number;
  leadEuclid2NoteMin: number;
  leadEuclid2NoteMax: number;
  leadEuclid2Level: number;
  // Lane 3
  leadEuclid3Enabled: boolean;
  leadEuclid3Preset: string;
  leadEuclid3Steps: number;
  leadEuclid3Hits: number;
  leadEuclid3Rotation: number;
  leadEuclid3NoteMin: number;
  leadEuclid3NoteMax: number;
  leadEuclid3Level: number;
  // Lane 4
  leadEuclid4Enabled: boolean;
  leadEuclid4Preset: string;
  leadEuclid4Steps: number;
  leadEuclid4Hits: number;
  leadEuclid4Rotation: number;
  leadEuclid4NoteMin: number;
  leadEuclid4NoteMax: number;
  leadEuclid4Level: number;

  // Ocean Waves
  oceanSampleEnabled: boolean;   // on/off toggle for real sample
  oceanSampleLevel: number;      // 0..1 step 0.01 - sample volume
  oceanWaveSynthEnabled: boolean; // on/off toggle for wave synthesis
  oceanWaveSynthLevel: number;   // 0..1 step 0.01 - wave synth volume
  oceanFilterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch'; // filter type
  oceanFilterCutoff: number;     // 40..12000 Hz
  oceanFilterResonance: number;  // 0..1 step 0.01
  oceanDurationMin: number;   // 2..15 seconds - wave duration min
  oceanDurationMax: number;   // 2..15 seconds - wave duration max
  oceanIntervalMin: number;   // 3..20 seconds - time between waves min
  oceanIntervalMax: number;   // 3..20 seconds - time between waves max
  oceanFoamMin: number;       // 0..1 - foam intensity min
  oceanFoamMax: number;       // 0..1 - foam intensity max
  oceanDepthMin: number;      // 0..1 - low rumble min
  oceanDepthMax: number;      // 0..1 - low rumble max
  
  // Random Walk (for dual sliders)
  randomWalkSpeed: number;    // 0.1..5 - speed of random walk between dual slider values
}

// Sorted keys for stable serialization
const STATE_KEYS: (keyof SliderState)[] = [
  'masterVolume',
  'synthLevel',
  'granularLevel',
  'synthReverbSend',
  'granularReverbSend',
  'leadReverbSend',
  'leadDelayReverbSend',
  'reverbLevel',
  'seedWindow',
  'randomness',
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
  'oscBrightness',
  'filterType',
  'filterCutoffMin',
  'filterCutoffMax',
  'filterModSpeed',
  'filterResonance',
  'filterQ',
  'warmth',
  'presence',
  'airNoise',
  'reverbEngine',
  'reverbType',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'granularEnabled',
  'grainProbability',
  'grainSizeMin',
  'grainSizeMax',
  'density',
  'spray',
  'jitter',
  'grainPitchMode',
  'pitchSpread',
  'stereoSpread',
  'feedback',
  'wetHPF',
  'wetLPF',
  'leadEnabled',
  'leadLevel',
  'leadAttack',
  'leadDecay',
  'leadSustain',
  'leadRelease',
  'leadDelayTime',
  'leadDelayFeedback',
  'leadDelayMix',
  'leadDensity',
  'leadOctave',
  'leadOctaveRange',
  'leadTimbreMin',
  'leadTimbreMax',
  'leadEuclideanMasterEnabled',
  'leadEuclideanTempo',
  'leadEuclid1Enabled',
  'leadEuclid1Preset',
  'leadEuclid1Steps',
  'leadEuclid1Hits',
  'leadEuclid1Rotation',
  'leadEuclid1NoteMin',
  'leadEuclid1NoteMax',
  'leadEuclid1Level',
  'leadEuclid2Enabled',
  'leadEuclid2Preset',
  'leadEuclid2Steps',
  'leadEuclid2Hits',
  'leadEuclid2Rotation',
  'leadEuclid2NoteMin',
  'leadEuclid2NoteMax',
  'leadEuclid2Level',
  'leadEuclid3Enabled',
  'leadEuclid3Preset',
  'leadEuclid3Steps',
  'leadEuclid3Hits',
  'leadEuclid3Rotation',
  'leadEuclid3NoteMin',
  'leadEuclid3NoteMax',
  'leadEuclid3Level',
  'leadEuclid4Enabled',
  'leadEuclid4Preset',
  'leadEuclid4Steps',
  'leadEuclid4Hits',
  'leadEuclid4Rotation',
  'leadEuclid4NoteMin',
  'leadEuclid4NoteMax',
  'leadEuclid4Level',
  // Ocean
  'oceanSampleEnabled',
  'oceanSampleLevel',
  'oceanWaveSynthEnabled',
  'oceanWaveSynthLevel',
  'oceanFilterType',
  'oceanFilterCutoff',
  'oceanFilterResonance',
  'oceanDurationMin',
  'oceanDurationMax',
  'oceanIntervalMin',
  'oceanIntervalMax',
  'oceanFoamMin',
  'oceanFoamMax',
  'oceanDepthMin',
  'oceanDepthMax',
  'randomWalkSpeed',
];

/**
 * Default slider state with conservative values for performance
 */
export const DEFAULT_STATE: SliderState = {
  // Master Mixer
  masterVolume: 0.7,
  synthLevel: 0.6,
  granularLevel: 0.4,
  synthReverbSend: 0.7,
  granularReverbSend: 0.8,
  leadReverbSend: 0.5,
  leadDelayReverbSend: 0.4,
  reverbLevel: 1.0,

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

  // Harmony/Pitch
  scaleMode: 'auto',
  manualScale: 'E Dorian',
  tension: 0.3,
  chordRate: 32,
  voicingSpread: 0.5,
  waveSpread: 4,
  detune: 8,
  synthAttack: 6.0,
  synthDecay: 1.0,
  synthSustain: 0.8,
  synthRelease: 12.0,
  synthVoiceMask: 63,  // All 6 voices (binary 111111)
  synthOctave: 0,      // No octave shift

  // Timbre
  hardness: 0.3,
  oscBrightness: 2,  // Default to saw+triangle mix
  filterType: 'lowpass' as const,
  filterCutoffMin: 400,
  filterCutoffMax: 3000,
  filterModSpeed: 2,  // 2 phrases per cycle
  filterResonance: 0.2,
  filterQ: 1.0,
  warmth: 0.4,
  presence: 0.3,
  airNoise: 0.15,

  // Space
  reverbEngine: 'algorithmic',
  reverbType: 'cathedral',
  reverbDecay: 0.9,
  reverbSize: 2.0,
  reverbDiffusion: 1.0,
  reverbModulation: 0.4,
  predelay: 60,
  damping: 0.2,
  width: 0.85,

  // Granular
  granularEnabled: true,
  grainProbability: 0.8,
  grainSizeMin: 20,
  grainSizeMax: 80,
  density: 25,
  spray: 200,
  jitter: 10,
  grainPitchMode: 'harmonic' as const,
  pitchSpread: 3,
  stereoSpread: 0.6,
  feedback: 0.1,
  wetHPF: 500,
  wetLPF: 8000,

  // Lead Synth (Rhodes/Bell)
  leadEnabled: false,
  leadLevel: 0.4,
  leadAttack: 0.01,
  leadDecay: 0.8,
  leadSustain: 0.3,
  leadRelease: 2.0,
  leadDelayTime: 375,
  leadDelayFeedback: 0.4,
  leadDelayMix: 0.35,
  leadDensity: 0.5,
  leadOctave: 1,
  leadOctaveRange: 2,
  leadTimbreMin: 0.2,
  leadTimbreMax: 0.6,
  // Euclidean sequencer for lead - 4 lanes for polyrhythms
  leadEuclideanMasterEnabled: false,
  leadEuclideanTempo: 1,
  // Lane 1 - main pulse (lancaran) - mid register
  leadEuclid1Enabled: true,
  leadEuclid1Preset: 'lancaran',
  leadEuclid1Steps: 16,
  leadEuclid1Hits: 4,
  leadEuclid1Rotation: 0,
  leadEuclid1NoteMin: 64,  // E4 (root octave 2)
  leadEuclid1NoteMax: 76,  // E5 (root octave 3)
  leadEuclid1Level: 0.8,
  // Lane 2 - interlocking (kotekan) - higher register
  leadEuclid2Enabled: false,
  leadEuclid2Preset: 'kotekan',
  leadEuclid2Steps: 8,
  leadEuclid2Hits: 3,
  leadEuclid2Rotation: 1,
  leadEuclid2NoteMin: 76,  // E5 (root octave 3)
  leadEuclid2NoteMax: 88,  // E6 (root octave 4)
  leadEuclid2Level: 0.6,
  // Lane 3 - sparse accent - bass register
  leadEuclid3Enabled: false,
  leadEuclid3Preset: 'ketawang',
  leadEuclid3Steps: 16,
  leadEuclid3Hits: 2,
  leadEuclid3Rotation: 0,
  leadEuclid3NoteMin: 52,  // E3 (root octave 1)
  leadEuclid3NoteMax: 64,  // E4 (root octave 2)
  leadEuclid3Level: 0.9,
  // Lane 4 - fill/texture - sparkle register
  leadEuclid4Enabled: false,
  leadEuclid4Preset: 'srepegan',
  leadEuclid4Steps: 16,
  leadEuclid4Hits: 6,
  leadEuclid4Rotation: 2,
  leadEuclid4NoteMin: 88,  // E6 (root octave 4)
  leadEuclid4NoteMax: 96,  // C7
  leadEuclid4Level: 0.5,

  // Ocean Waves
  oceanSampleEnabled: false,
  oceanSampleLevel: 0.5,
  oceanWaveSynthEnabled: false,
  oceanWaveSynthLevel: 0.4,
  oceanFilterType: 'lowpass' as const,
  oceanFilterCutoff: 8000,
  oceanFilterResonance: 0.1,
  oceanDurationMin: 4,
  oceanDurationMax: 10,
  oceanIntervalMin: 5,
  oceanIntervalMax: 12,
  oceanFoamMin: 0.2,
  oceanFoamMax: 0.5,
  oceanDepthMin: 0.3,
  oceanDepthMax: 0.7,
  
  // Random Walk
  randomWalkSpeed: 1.0,
};

/**
 * Mobile-optimized preset with lower CPU usage
 */
export const MOBILE_STATE: SliderState = {
  ...DEFAULT_STATE,
  granularLevel: 0.1,
  density: 15,
  reverbLevel: 0.3,
};

/**
 * Quantization definitions for each parameter
 */
interface QuantizationDef {
  min: number;
  max: number;
  step: number;
}

const QUANTIZATION: Partial<Record<keyof SliderState, QuantizationDef>> = {
  masterVolume: { min: 0, max: 1, step: 0.01 },
  synthLevel: { min: 0, max: 1, step: 0.01 },
  granularLevel: { min: 0, max: 2, step: 0.01 },
  synthReverbSend: { min: 0, max: 1, step: 0.01 },
  granularReverbSend: { min: 0, max: 1, step: 0.01 },
  leadReverbSend: { min: 0, max: 1, step: 0.01 },
  leadDelayReverbSend: { min: 0, max: 1, step: 0.01 },
  randomness: { min: 0, max: 1, step: 0.01 },
  tension: { min: 0, max: 1, step: 0.01 },
  chordRate: { min: 8, max: 64, step: 1 },
  voicingSpread: { min: 0, max: 1, step: 0.01 },
  waveSpread: { min: 0, max: 30, step: 0.5 },
  detune: { min: 0, max: 25, step: 1 },
  synthAttack: { min: 0.01, max: 16, step: 0.01 },
  synthDecay: { min: 0.01, max: 8, step: 0.01 },
  synthSustain: { min: 0, max: 1, step: 0.01 },
  synthRelease: { min: 0.01, max: 30, step: 0.01 },
  synthVoiceMask: { min: 1, max: 63, step: 1 },
  synthOctave: { min: -2, max: 2, step: 1 },
  hardness: { min: 0, max: 1, step: 0.01 },
  oscBrightness: { min: 0, max: 3, step: 1 },
  filterCutoffMin: { min: 40, max: 8000, step: 10 },
  filterCutoffMax: { min: 40, max: 8000, step: 10 },
  filterModSpeed: { min: 0, max: 16, step: 0.5 },
  filterResonance: { min: 0, max: 1, step: 0.01 },
  filterQ: { min: 0.1, max: 12, step: 0.1 },
  warmth: { min: 0, max: 1, step: 0.01 },
  presence: { min: 0, max: 1, step: 0.01 },
  airNoise: { min: 0, max: 1, step: 0.01 },
  reverbLevel: { min: 0, max: 2, step: 0.01 },
  reverbDecay: { min: 0, max: 1, step: 0.01 },
  reverbSize: { min: 0.5, max: 3, step: 0.1 },
  reverbDiffusion: { min: 0, max: 1, step: 0.01 },
  reverbModulation: { min: 0, max: 1, step: 0.01 },
  predelay: { min: 0, max: 100, step: 1 },
  damping: { min: 0, max: 1, step: 0.01 },
  width: { min: 0, max: 1, step: 0.01 },
  grainProbability: { min: 0, max: 1, step: 0.01 },
  grainSizeMin: { min: 5, max: 60, step: 1 },
  grainSizeMax: { min: 20, max: 200, step: 1 },
  density: { min: 5, max: 80, step: 1 },
  spray: { min: 0, max: 600, step: 5 },
  jitter: { min: 0, max: 30, step: 1 },
  pitchSpread: { min: 0, max: 12, step: 1 },
  stereoSpread: { min: 0, max: 1, step: 0.01 },
  feedback: { min: 0, max: 0.35, step: 0.01 },
  wetHPF: { min: 200, max: 3000, step: 50 },
  wetLPF: { min: 3000, max: 12000, step: 200 },
  leadLevel: { min: 0, max: 1, step: 0.01 },
  leadAttack: { min: 0.001, max: 2, step: 0.001 },
  leadDecay: { min: 0.01, max: 4, step: 0.01 },
  leadSustain: { min: 0, max: 1, step: 0.01 },
  leadRelease: { min: 0.01, max: 8, step: 0.01 },
  leadDelayTime: { min: 0, max: 1000, step: 10 },
  leadDelayFeedback: { min: 0, max: 0.8, step: 0.01 },
  leadDelayMix: { min: 0, max: 1, step: 0.01 },
  leadDensity: { min: 0.1, max: 12, step: 0.1 },
  leadOctave: { min: -1, max: 2, step: 1 },
  leadOctaveRange: { min: 1, max: 4, step: 1 },
  leadTimbreMin: { min: 0, max: 1, step: 0.01 },
  leadTimbreMax: { min: 0, max: 1, step: 0.01 },
  // Euclidean sequencer - shared for all lanes
  leadEuclideanTempo: { min: 0.25, max: 12, step: 0.25 },
  leadEuclid1Steps: { min: 4, max: 32, step: 1 },
  leadEuclid1Hits: { min: 1, max: 16, step: 1 },
  leadEuclid1Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid1NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid1NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid1Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid2Steps: { min: 4, max: 32, step: 1 },
  leadEuclid2Hits: { min: 1, max: 16, step: 1 },
  leadEuclid2Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid2NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid2NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid2Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid3Steps: { min: 4, max: 32, step: 1 },
  leadEuclid3Hits: { min: 1, max: 16, step: 1 },
  leadEuclid3Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid3NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid3NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid3Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid4Steps: { min: 4, max: 32, step: 1 },
  leadEuclid4Hits: { min: 1, max: 16, step: 1 },
  leadEuclid4Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid4NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid4NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid4Level: { min: 0, max: 1, step: 0.01 },
  // Ocean
  oceanSampleLevel: { min: 0, max: 1, step: 0.01 },
  oceanWaveSynthLevel: { min: 0, max: 1, step: 0.01 },
  oceanFilterCutoff: { min: 40, max: 12000, step: 10 },
  oceanFilterResonance: { min: 0, max: 1, step: 0.01 },
  oceanDurationMin: { min: 2, max: 15, step: 0.5 },
  oceanDurationMax: { min: 2, max: 15, step: 0.5 },
  oceanIntervalMin: { min: 3, max: 20, step: 0.5 },
  oceanIntervalMax: { min: 3, max: 20, step: 0.5 },
  oceanFoamMin: { min: 0, max: 1, step: 0.01 },
  oceanFoamMax: { min: 0, max: 1, step: 0.01 },
  oceanDepthMin: { min: 0, max: 1, step: 0.01 },
  oceanDepthMax: { min: 0, max: 1, step: 0.01 },
  // Random Walk
  randomWalkSpeed: { min: 0.1, max: 5, step: 0.1 },
  // Circle of Fifths Drift
  cofDriftRate: { min: 1, max: 8, step: 1 },
  cofDriftRange: { min: 1, max: 6, step: 1 },
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
      const value = params.get(key);
      if (value === null) continue;

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
        } else if (key === 'scaleMode' && (value === 'auto' || value === 'manual')) {
          state.scaleMode = value;
        } else if (key === 'manualScale' && SCALE_FAMILIES.some((s) => s.name === value)) {
          state.manualScale = value;
        } else if (key === 'reverbEngine' && (value === 'algorithmic' || value === 'convolution')) {
          state.reverbEngine = value;
        } else if (
          key === 'reverbType' &&
          ['plate', 'hall', 'cathedral', 'darkHall'].includes(value)
        ) {
          state.reverbType = value as SliderState['reverbType'];
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
          key === 'grainPitchMode' &&
          ['random', 'harmonic'].includes(value)
        ) {
          state.grainPitchMode = value as SliderState['grainPitchMode'];
        } else if (key === 'leadEnabled') {
          state.leadEnabled = value === 'true';
        } else if (key === 'leadEuclideanMasterEnabled') {
          state.leadEuclideanMasterEnabled = value === 'true';
        } else if (key === 'leadEuclid1Enabled') {
          state.leadEuclid1Enabled = value === 'true';
        } else if (key === 'leadEuclid2Enabled') {
          state.leadEuclid2Enabled = value === 'true';
        } else if (key === 'leadEuclid3Enabled') {
          state.leadEuclid3Enabled = value === 'true';
        } else if (key === 'leadEuclid4Enabled') {
          state.leadEuclid4Enabled = value === 'true';
        } else if (key === 'leadEuclid1Preset') {
          state.leadEuclid1Preset = value;
        } else if (key === 'leadEuclid2Preset') {
          state.leadEuclid2Preset = value;
        } else if (key === 'leadEuclid3Preset') {
          state.leadEuclid3Preset = value;
        } else if (key === 'leadEuclid4Preset') {
          state.leadEuclid4Preset = value;
        } else if (key === 'oceanSampleEnabled') {
          state.oceanSampleEnabled = value === 'true';
        } else if (key === 'oceanWaveSynthEnabled') {
          state.oceanWaveSynthEnabled = value === 'true';
        }
      }
    }

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
