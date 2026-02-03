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
  reverbEnabled: boolean;     // on/off toggle for reverb (saves CPU when off)
  reverbEngine: 'algorithmic' | 'convolution';
  reverbType: 'plate' | 'hall' | 'cathedral' | 'darkHall';
  reverbQuality: 'ultra' | 'balanced' | 'lite';  // ultra=8-channel FDN, balanced=8-ch optimized, lite=4-channel FDN
  reverbDecay: number;        // 0..1 step 0.01 (longer tail)
  reverbSize: number;         // 0.5..3.0 step 0.1 (room size)
  reverbDiffusion: number;    // 0..1 step 0.01 (smear amount)
  reverbModulation: number;   // 0..1 step 0.01 (chorus-like shimmer)
  predelay: number;           // 0..100ms step 1
  damping: number;            // 0..1 step 0.01
  width: number;              // 0..1 step 0.01

  // Granular
  granularEnabled: boolean;    // on/off toggle for granular processing
  maxGrains: number;           // 0..128 step 1 - maximum concurrent grains
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
  leadHold: number;           // 0..4 seconds - how long to hold at sustain level
  leadRelease: number;        // 0.01..8 seconds
  leadDelayTimeMin: number;      // 0..1000 ms step 10
  leadDelayTimeMax: number;      // 0..1000 ms step 10
  leadDelayFeedbackMin: number;  // 0..0.8 step 0.01
  leadDelayFeedbackMax: number;  // 0..0.8 step 0.01
  leadDelayMixMin: number;       // 0..1 step 0.01
  leadDelayMixMax: number;       // 0..1 step 0.01
  leadDensity: number;        // 0.1..2 notes per phrase (sparseness)
  leadOctave: number;         // -1, 0, 1, 2 octave offset
  leadOctaveRange: number;    // 1..4 - how many octaves to span for random notes
  leadTimbreMin: number;      // 0..1 - min timbre (0=soft rhodes, 1=bell)
  leadTimbreMax: number;      // 0..1 - max timbre (0=soft rhodes, 1=bell)
  leadVibratoDepthMin: number;  // 0..1 - min vibrato depth (0=none, 1=0.5 semitones)
  leadVibratoDepthMax: number;  // 0..1 - max vibrato depth
  leadVibratoRateMin: number;   // 0..1 - min vibrato rate (maps to 2-8 Hz)
  leadVibratoRateMax: number;   // 0..1 - max vibrato rate
  leadGlideMin: number;         // 0..1 - min portamento/glide speed
  leadGlideMax: number;         // 0..1 - max portamento/glide speed
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
  leadEuclid1Probability: number; // 0..1 probability of triggering each hit
  leadEuclid1Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  // Lane 2
  leadEuclid2Enabled: boolean;
  leadEuclid2Preset: string;
  leadEuclid2Steps: number;
  leadEuclid2Hits: number;
  leadEuclid2Rotation: number;
  leadEuclid2NoteMin: number;
  leadEuclid2NoteMax: number;
  leadEuclid2Level: number;
  leadEuclid2Probability: number;
  leadEuclid2Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  // Lane 3
  leadEuclid3Enabled: boolean;
  leadEuclid3Preset: string;
  leadEuclid3Steps: number;
  leadEuclid3Hits: number;
  leadEuclid3Rotation: number;
  leadEuclid3NoteMin: number;
  leadEuclid3NoteMax: number;
  leadEuclid3Level: number;
  leadEuclid3Probability: number;
  leadEuclid3Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  // Lane 4
  leadEuclid4Enabled: boolean;
  leadEuclid4Preset: string;
  leadEuclid4Steps: number;
  leadEuclid4Hits: number;
  leadEuclid4Rotation: number;
  leadEuclid4NoteMin: number;
  leadEuclid4NoteMax: number;
  leadEuclid4Level: number;
  leadEuclid4Probability: number;
  leadEuclid4Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  
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
  
  // Voice 2: Kick (sine with pitch envelope)
  drumKickFreq: number;                    // 40..150 Hz (end frequency)
  drumKickPitchEnv: number;                // 0..48 semitones (pitch sweep amount)
  drumKickPitchDecay: number;              // 5..100 ms (pitch envelope decay)
  drumKickDecay: number;                   // 30..500 ms (amplitude decay)
  drumKickLevel: number;                   // 0..1
  drumKickClick: number;                   // 0..1 (transient click amount)
  
  // Voice 3: Click (impulse/noise burst - the "data" sound)
  drumClickDecay: number;                  // 1..80 ms
  drumClickFilter: number;                 // 500..15000 Hz highpass
  drumClickTone: number;                   // 0..1 (0=pure impulse, 1=noise burst)
  drumClickLevel: number;                  // 0..1
  drumClickResonance: number;              // 0..1 (filter resonance for metallic tone)
  
  // Voice 4: Beep Hi (high frequency sine ping)
  drumBeepHiFreq: number;                  // 2000..12000 Hz
  drumBeepHiAttack: number;                // 0..20 ms
  drumBeepHiDecay: number;                 // 10..500 ms
  drumBeepHiLevel: number;                 // 0..1
  drumBeepHiTone: number;                  // 0..1 (0=pure, 1=FM modulated)
  
  // Voice 5: Beep Lo (lower pitched ping/blip)
  drumBeepLoFreq: number;                  // 150..2000 Hz
  drumBeepLoAttack: number;                // 0..30 ms
  drumBeepLoDecay: number;                 // 10..500 ms
  drumBeepLoLevel: number;                 // 0..1
  drumBeepLoTone: number;                  // 0..1 (0=sine, 1=square-ish)
  
  // Voice 6: Noise (filtered noise burst - hi-hat/texture)
  drumNoiseFilterFreq: number;             // 500..15000 Hz (center/cutoff)
  drumNoiseFilterQ: number;                // 0.5..15 resonance
  drumNoiseFilterType: 'lowpass' | 'bandpass' | 'highpass';
  drumNoiseDecay: number;                  // 5..300 ms
  drumNoiseLevel: number;                  // 0..1
  drumNoiseAttack: number;                 // 0..10 ms
  
  // Drum Random Trigger Mode (probability-based like lead random)
  drumRandomEnabled: boolean;              // Master random enable
  drumRandomDensity: number;               // 0..1 global probability scale
  drumRandomSubProb: number;               // 0..1 per-voice probability
  drumRandomKickProb: number;
  drumRandomClickProb: number;
  drumRandomBeepHiProb: number;
  drumRandomBeepLoProb: number;
  drumRandomNoiseProb: number;
  drumRandomMinInterval: number;           // 30..500 ms
  drumRandomMaxInterval: number;           // 50..2000 ms
  
  // Drum Euclidean Sequencer (4 lanes, separate from lead Euclidean)
  drumEuclidMasterEnabled: boolean;        // Master enable
  drumEuclidBaseBPM: number;               // Base BPM (40-240)
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
  drumEuclid4Probability: number;
  drumEuclid4VelocityMin: number;
  drumEuclid4VelocityMax: number;
  drumEuclid4Level: number;

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
  'reverbQuality',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'granularEnabled',
  'maxGrains',
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
  'leadDelayTimeMin',
  'leadDelayTimeMax',
  'leadDelayFeedbackMin',
  'leadDelayFeedbackMax',
  'leadDelayMixMin',
  'leadDelayMixMax',
  'leadDensity',
  'leadOctave',
  'leadOctaveRange',
  'leadTimbreMin',
  'leadTimbreMax',
  'leadVibratoDepthMin',
  'leadVibratoDepthMax',
  'leadVibratoRateMin',
  'leadVibratoRateMax',
  'leadGlideMin',
  'leadGlideMax',
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
  'leadEuclid1Probability',
  'leadEuclid1Source',
  'leadEuclid2Enabled',
  'leadEuclid2Preset',
  'leadEuclid2Steps',
  'leadEuclid2Hits',
  'leadEuclid2Rotation',
  'leadEuclid2NoteMin',
  'leadEuclid2NoteMax',
  'leadEuclid2Level',
  'leadEuclid2Probability',
  'leadEuclid2Source',
  'leadEuclid3Enabled',
  'leadEuclid3Preset',
  'leadEuclid3Steps',
  'leadEuclid3Hits',
  'leadEuclid3Rotation',
  'leadEuclid3NoteMin',
  'leadEuclid3NoteMax',
  'leadEuclid3Level',
  'leadEuclid3Probability',
  'leadEuclid3Source',
  'leadEuclid4Enabled',
  'leadEuclid4Preset',
  'leadEuclid4Steps',
  'leadEuclid4Hits',
  'leadEuclid4Rotation',
  'leadEuclid4NoteMin',
  'leadEuclid4NoteMax',
  'leadEuclid4Level',
  'leadEuclid4Probability',
  'leadEuclid4Source',
  'synthChordSequencerEnabled',
  // Drum Synth
  'drumEnabled',
  'drumLevel',
  'drumReverbSend',
  'drumSubFreq',
  'drumSubDecay',
  'drumSubLevel',
  'drumSubTone',
  'drumKickFreq',
  'drumKickPitchEnv',
  'drumKickPitchDecay',
  'drumKickDecay',
  'drumKickLevel',
  'drumKickClick',
  'drumClickDecay',
  'drumClickFilter',
  'drumClickTone',
  'drumClickLevel',
  'drumClickResonance',
  'drumBeepHiFreq',
  'drumBeepHiAttack',
  'drumBeepHiDecay',
  'drumBeepHiLevel',
  'drumBeepHiTone',
  'drumBeepLoFreq',
  'drumBeepLoAttack',
  'drumBeepLoDecay',
  'drumBeepLoLevel',
  'drumBeepLoTone',
  'drumNoiseFilterFreq',
  'drumNoiseFilterQ',
  'drumNoiseFilterType',
  'drumNoiseDecay',
  'drumNoiseLevel',
  'drumNoiseAttack',
  'drumRandomEnabled',
  'drumRandomDensity',
  'drumRandomSubProb',
  'drumRandomKickProb',
  'drumRandomClickProb',
  'drumRandomBeepHiProb',
  'drumRandomBeepLoProb',
  'drumRandomNoiseProb',
  'drumRandomMinInterval',
  'drumRandomMaxInterval',
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
  'drumEuclid4Probability',
  'drumEuclid4VelocityMin',
  'drumEuclid4VelocityMax',
  'drumEuclid4Level',
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
  manualScale: 'Major (Ionian)',
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

  // Granular
  granularEnabled: true,
  maxGrains: 64,
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
  leadHold: 0.5,
  leadRelease: 2.0,
  leadDelayTimeMin: 375,
  leadDelayTimeMax: 375,
  leadDelayFeedbackMin: 0.4,
  leadDelayFeedbackMax: 0.4,
  leadDelayMixMin: 0.35,
  leadDelayMixMax: 0.35,
  leadDensity: 0.5,
  leadOctave: 1,
  leadOctaveRange: 2,
  leadTimbreMin: 0.2,
  leadTimbreMax: 0.6,
  leadVibratoDepthMin: 0,
  leadVibratoDepthMax: 0,
  leadVibratoRateMin: 0,
  leadVibratoRateMax: 0,
  leadGlideMin: 0,
  leadGlideMax: 0,
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
  leadEuclid1Probability: 1.0,
  leadEuclid1Source: 'lead' as const,
  // Lane 2 - interlocking (kotekan) - higher register
  leadEuclid2Enabled: false,
  leadEuclid2Preset: 'kotekan',
  leadEuclid2Steps: 8,
  leadEuclid2Hits: 3,
  leadEuclid2Rotation: 1,
  leadEuclid2NoteMin: 76,  // E5 (root octave 3)
  leadEuclid2NoteMax: 88,  // E6 (root octave 4)
  leadEuclid2Level: 0.6,
  leadEuclid2Probability: 1.0,
  leadEuclid2Source: 'lead' as const,
  // Lane 3 - sparse accent - bass register
  leadEuclid3Enabled: false,
  leadEuclid3Preset: 'ketawang',
  leadEuclid3Steps: 16,
  leadEuclid3Hits: 2,
  leadEuclid3Rotation: 0,
  leadEuclid3NoteMin: 52,  // E3 (root octave 1)
  leadEuclid3NoteMax: 64,  // E4 (root octave 2)
  leadEuclid3Level: 0.9,
  leadEuclid3Probability: 1.0,
  leadEuclid3Source: 'lead' as const,
  // Lane 4 - fill/texture - sparkle register
  leadEuclid4Enabled: false,
  leadEuclid4Preset: 'srepegan',
  leadEuclid4Steps: 16,
  leadEuclid4Hits: 6,
  leadEuclid4Rotation: 2,
  leadEuclid4NoteMin: 88,  // E6 (root octave 4)
  leadEuclid4NoteMax: 96,  // C7
  leadEuclid4Level: 0.5,
  leadEuclid4Probability: 1.0,
  leadEuclid4Source: 'lead' as const,
  
  // Synth chord sequencer toggle
  synthChordSequencerEnabled: true,

  // ─── Ikeda-Style Drum Synth ───
  drumEnabled: false,
  drumLevel: 0.7,
  drumReverbSend: 0.3,
  
  // Voice 1: Sub (deep sine pulse)
  drumSubFreq: 50,
  drumSubDecay: 150,
  drumSubLevel: 0.8,
  drumSubTone: 0.1,
  
  // Voice 2: Kick (sine with pitch sweep)
  drumKickFreq: 55,
  drumKickPitchEnv: 24,     // Start 2 octaves higher
  drumKickPitchDecay: 30,   // Fast pitch drop
  drumKickDecay: 200,
  drumKickLevel: 0.7,
  drumKickClick: 0.3,       // Subtle click transient
  
  // Voice 3: Click (the signature Ikeda "data" sound)
  drumClickDecay: 5,
  drumClickFilter: 4000,    // Highpass filter
  drumClickTone: 0.3,       // Mostly impulse
  drumClickLevel: 0.6,
  drumClickResonance: 0.4,  // Slight metallic ring
  
  // Voice 4: Beep Hi (high pitched notification ping)
  drumBeepHiFreq: 4000,
  drumBeepHiAttack: 1,
  drumBeepHiDecay: 80,
  drumBeepHiLevel: 0.5,
  drumBeepHiTone: 0.2,
  
  // Voice 5: Beep Lo (lower blip, Morse-code feel)
  drumBeepLoFreq: 400,
  drumBeepLoAttack: 2,
  drumBeepLoDecay: 100,
  drumBeepLoLevel: 0.5,
  drumBeepLoTone: 0.1,
  
  // Voice 6: Noise (hi-hat/texture)
  drumNoiseFilterFreq: 8000,
  drumNoiseFilterQ: 1,
  drumNoiseFilterType: 'highpass' as const,
  drumNoiseDecay: 30,
  drumNoiseLevel: 0.4,
  drumNoiseAttack: 0,
  
  // Random trigger mode
  drumRandomEnabled: false,
  drumRandomDensity: 0.3,
  drumRandomSubProb: 0.1,
  drumRandomKickProb: 0.15,
  drumRandomClickProb: 0.4,
  drumRandomBeepHiProb: 0.2,
  drumRandomBeepLoProb: 0.15,
  drumRandomNoiseProb: 0.25,
  drumRandomMinInterval: 80,
  drumRandomMaxInterval: 400,
  
  // Euclidean sequencer (4 lanes)
  drumEuclidMasterEnabled: false,
  drumEuclidBaseBPM: 120,
  drumEuclidTempo: 1,
  drumEuclidSwing: 0,
  drumEuclidDivision: 16,
  
  // Lane 1 - Click pattern (primary rhythm)
  drumEuclid1Enabled: true,
  drumEuclid1Preset: 'lancaran',
  drumEuclid1Steps: 16,
  drumEuclid1Hits: 5,
  drumEuclid1Rotation: 0,
  drumEuclid1TargetSub: false,
  drumEuclid1TargetKick: false,
  drumEuclid1TargetClick: true,
  drumEuclid1TargetBeepHi: false,
  drumEuclid1TargetBeepLo: false,
  drumEuclid1TargetNoise: false,
  drumEuclid1Probability: 1.0,
  drumEuclid1VelocityMin: 0.8,
  drumEuclid1VelocityMax: 0.8,
  drumEuclid1Level: 0.8,
  
  // Lane 2 - Sub pattern (bass pulse)
  drumEuclid2Enabled: true,
  drumEuclid2Preset: 'gangsaran',
  drumEuclid2Steps: 16,
  drumEuclid2Hits: 4,
  drumEuclid2Rotation: 0,
  drumEuclid2TargetSub: true,
  drumEuclid2TargetKick: false,
  drumEuclid2TargetClick: false,
  drumEuclid2TargetBeepHi: false,
  drumEuclid2TargetBeepLo: false,
  drumEuclid2TargetNoise: false,
  drumEuclid2Probability: 1.0,
  drumEuclid2VelocityMin: 0.8,
  drumEuclid2VelocityMax: 0.8,
  drumEuclid2Level: 0.9,
  
  // Lane 3 - Beep Hi (sparse accents)
  drumEuclid3Enabled: false,
  drumEuclid3Preset: 'sparse',
  drumEuclid3Steps: 8,
  drumEuclid3Hits: 2,
  drumEuclid3Rotation: 1,
  drumEuclid3TargetSub: false,
  drumEuclid3TargetKick: false,
  drumEuclid3TargetClick: false,
  drumEuclid3TargetBeepHi: true,
  drumEuclid3TargetBeepLo: false,
  drumEuclid3TargetNoise: false,
  drumEuclid3Probability: 0.8,
  drumEuclid3VelocityMin: 0.8,
  drumEuclid3VelocityMax: 0.8,
  drumEuclid3Level: 0.6,
  
  // Lane 4 - Noise (hi-hat texture)
  drumEuclid4Enabled: false,
  drumEuclid4Preset: 'dense',
  drumEuclid4Steps: 16,
  drumEuclid4Hits: 8,
  drumEuclid4Rotation: 0,
  drumEuclid4TargetSub: false,
  drumEuclid4TargetKick: false,
  drumEuclid4TargetClick: false,
  drumEuclid4TargetBeepHi: false,
  drumEuclid4TargetBeepLo: false,
  drumEuclid4TargetNoise: true,
  drumEuclid4Probability: 0.7,
  drumEuclid4VelocityMin: 0.8,
  drumEuclid4VelocityMax: 0.8,
  drumEuclid4Level: 0.5,

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
  maxGrains: { min: 0, max: 128, step: 1 },
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
  drumLevel: { min: 0, max: 1, step: 0.01 },
  drumReverbSend: { min: 0, max: 1, step: 0.01 },
  leadAttack: { min: 0.001, max: 2, step: 0.001 },
  leadDecay: { min: 0.01, max: 4, step: 0.01 },
  leadSustain: { min: 0, max: 1, step: 0.01 },
  leadHold: { min: 0, max: 4, step: 0.01 },
  leadRelease: { min: 0.01, max: 8, step: 0.01 },
  leadDelayTimeMin: { min: 0, max: 1000, step: 10 },
  leadDelayTimeMax: { min: 0, max: 1000, step: 10 },
  leadDelayFeedbackMin: { min: 0, max: 0.8, step: 0.01 },
  leadDelayFeedbackMax: { min: 0, max: 0.8, step: 0.01 },
  leadDelayMixMin: { min: 0, max: 1, step: 0.01 },
  leadDelayMixMax: { min: 0, max: 1, step: 0.01 },
  leadDensity: { min: 0.1, max: 12, step: 0.1 },
  leadOctave: { min: -1, max: 2, step: 1 },
  leadOctaveRange: { min: 1, max: 4, step: 1 },
  leadTimbreMin: { min: 0, max: 1, step: 0.01 },
  leadTimbreMax: { min: 0, max: 1, step: 0.01 },
  leadVibratoDepthMin: { min: 0, max: 1, step: 0.01 },
  leadVibratoDepthMax: { min: 0, max: 1, step: 0.01 },
  leadVibratoRateMin: { min: 0, max: 1, step: 0.01 },
  leadVibratoRateMax: { min: 0, max: 1, step: 0.01 },
  leadGlideMin: { min: 0, max: 1, step: 0.01 },
  leadGlideMax: { min: 0, max: 1, step: 0.01 },
  // Euclidean sequencer - shared for all lanes
  leadEuclideanTempo: { min: 0.25, max: 12, step: 0.25 },
  leadEuclid1Steps: { min: 4, max: 32, step: 1 },
  leadEuclid1Hits: { min: 1, max: 16, step: 1 },
  leadEuclid1Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid1NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid1NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid1Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid1Probability: { min: 0, max: 1, step: 0.01 },
  leadEuclid2Steps: { min: 4, max: 32, step: 1 },
  leadEuclid2Hits: { min: 1, max: 16, step: 1 },
  leadEuclid2Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid2NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid2NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid2Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid2Probability: { min: 0, max: 1, step: 0.01 },
  leadEuclid3Steps: { min: 4, max: 32, step: 1 },
  leadEuclid3Hits: { min: 1, max: 16, step: 1 },
  leadEuclid3Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid3NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid3NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid3Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid3Probability: { min: 0, max: 1, step: 0.01 },
  leadEuclid4Steps: { min: 4, max: 32, step: 1 },
  leadEuclid4Hits: { min: 1, max: 16, step: 1 },
  leadEuclid4Rotation: { min: 0, max: 31, step: 1 },
  leadEuclid4NoteMin: { min: 36, max: 96, step: 1 },
  leadEuclid4NoteMax: { min: 36, max: 96, step: 1 },
  leadEuclid4Level: { min: 0, max: 1, step: 0.01 },
  leadEuclid4Probability: { min: 0, max: 1, step: 0.01 },
  // Drum Euclidean sequencer
  drumEuclidBaseBPM: { min: 40, max: 240, step: 1 },
  drumEuclidTempo: { min: 0.25, max: 4, step: 0.25 },
  drumEuclidSwing: { min: 0, max: 100, step: 1 },
  drumEuclid1Steps: { min: 4, max: 32, step: 1 },
  drumEuclid1Hits: { min: 1, max: 16, step: 1 },
  drumEuclid1Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid1Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid1VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid1VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid1Level: { min: 0, max: 1, step: 0.01 },
  drumEuclid2Steps: { min: 4, max: 32, step: 1 },
  drumEuclid2Hits: { min: 1, max: 16, step: 1 },
  drumEuclid2Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid2Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid2VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid2VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid2Level: { min: 0, max: 1, step: 0.01 },
  drumEuclid3Steps: { min: 4, max: 32, step: 1 },
  drumEuclid3Hits: { min: 1, max: 16, step: 1 },
  drumEuclid3Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid3Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid3VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid3VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid3Level: { min: 0, max: 1, step: 0.01 },
  drumEuclid4Steps: { min: 4, max: 32, step: 1 },
  drumEuclid4Hits: { min: 1, max: 16, step: 1 },
  drumEuclid4Rotation: { min: 0, max: 31, step: 1 },
  drumEuclid4Probability: { min: 0, max: 1, step: 0.01 },
  drumEuclid4VelocityMin: { min: 0, max: 1, step: 0.01 },
  drumEuclid4VelocityMax: { min: 0, max: 1, step: 0.01 },
  drumEuclid4Level: { min: 0, max: 1, step: 0.01 },
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
