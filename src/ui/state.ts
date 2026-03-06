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

/**
 * Slider mode for unified 3-mode slider system
 * - 'single': normal single-value slider
 * - 'walk': random walk (Brownian motion) between min/max
 * - 'sampleHold': per-trigger random sample between min/max
 */
export type SliderMode = 'single' | 'walk' | 'sampleHold';

/**
 * Saved preset structure
 */
export interface SavedPreset {
  name: string;
  timestamp: string;
  state: SliderState;
  dualRanges?: Record<string, { min: number; max: number }>;  // Range values for walk/sampleHold sliders
  sliderModes?: Record<string, SliderMode>;  // Mode per parameter key
}

export interface SliderState {
  // Master Mixer
  masterVolume: number;       // 0..1 step 0.01
  synthLevel: number;         // 0..1 step 0.01 - pad 1 dry level
  pad2Level: number;           // 0..1 step 0.01 - pad 2 dry level
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

  // Timbre / Drive
  hardness: number;           // 0..1 step 0.01 — saturation drive + resonance boost
  filterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  filterCutoffMin: number;    // 40..8000 Hz - lower bound of filter sweep
  filterCutoffMax: number;    // 40..8000 Hz - upper bound of filter sweep
  filterResonance: number;    // 0..1 step 0.01 (resonance peak)
  filterQ: number;            // 0.1..12 step 0.1 (filter bandwidth/angle)
  warmth: number;             // 0..1 step 0.01 (low shelf boost)
  presence: number;           // 0..1 step 0.01 (high-mid presence)

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
  padLfo1Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel';

  // LFO 2
  padLfo2Rate: number;          // 0.05..20 Hz
  padLfo2Depth: number;         // 0..1
  padLfo2Wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  padLfo2Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel';

  // Mod Envelope
  padModEnvEnabled: boolean;
  padModEnvAttack: number;      // 0.01..8s
  padModEnvDecay: number;       // 0.01..8s
  padModEnvSustain: number;     // 0..1
  padModEnvRelease: number;     // 0.01..16s
  padModEnvDepth: number;       // -1..+1
  padModEnvDest: 'filterCutoff' | 'pitch' | 'oscBLevel';

  // Pad morph auto
  padMorphAuto: boolean;
  padMorphSpeed: number;        // 1..32 phrases per morph cycle

  // Osc Mix — crossfade between Osc A and Osc B levels
  padOscMix: number;            // 0..1 (0=A only, 0.5=both full, 1=B only)

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
  pad2OscMix: number;
  // Filter A
  pad2FilterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch';
  pad2FilterCutoffMin: number;
  pad2FilterCutoffMax: number;
  pad2FilterResonance: number;
  pad2FilterQ: number;
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
  pad2Lfo1Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel';
  // LFO 2
  pad2Lfo2Rate: number;
  pad2Lfo2Depth: number;
  pad2Lfo2Wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  pad2Lfo2Dest: 'none' | 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel';
  // Mod Envelope
  pad2ModEnvEnabled: boolean;
  pad2ModEnvAttack: number;
  pad2ModEnvDecay: number;
  pad2ModEnvSustain: number;
  pad2ModEnvRelease: number;
  pad2ModEnvDepth: number;
  pad2ModEnvDest: 'filterCutoff' | 'pitch' | 'oscBLevel';
  // Presets / Morph
  pad2PresetA: string;
  pad2PresetB: string;
  pad2Morph: number;
  pad2MorphAuto: boolean;
  pad2MorphSpeed: number;

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
  reverbFreeze: boolean;      // infinite sustain mode (freeze reverb tail)
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

  // Granular
  granularEnabled: boolean;    // on/off toggle for granular processing
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
  leadLevel: number;          // 0..1 step 0.01
  lead1UseCustomAdsr: boolean; // when true, use lead ADSR sliders instead of preset ADSR
  lead1Attack: number;         // 0.001..2 seconds
  lead1Decay: number;          // 0.01..4 seconds
  lead1Sustain: number;        // 0..1 level
  lead1Hold: number;           // 0..4 seconds - how long to hold at sustain level
  lead1Release: number;        // 0.01..8 seconds
  leadDelayTime: number;         // 0..1000 ms step 10 (range in dualSliderRanges)
  leadDelayFeedback: number;     // 0..0.8 step 0.01 (range in dualSliderRanges)
  leadDelayMix: number;          // 0..1 step 0.01 (range in dualSliderRanges)
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
  lead2UseCustomAdsr: boolean; // when true, use lead2 ADSR sliders instead of preset ADSR
  lead2Attack: number;         // 0.001..2 seconds
  lead2Decay: number;          // 0.01..4 seconds
  lead2Sustain: number;        // 0..1 level
  lead2Hold: number;           // 0..4 seconds - how long to hold at sustain level
  lead2Release: number;        // 0.01..8 seconds

  leadVibratoDepth: number;     // 0..1 - vibrato depth (range in dualSliderRanges)
  leadVibratoRate: number;      // 0..1 - vibrato rate (range in dualSliderRanges)
  leadGlide: number;            // 0..1 - portamento/glide speed (range in dualSliderRanges)
  // Euclidean sequencer for lead - 4 independent lanes for polyrhythmic patterns
  synthEuclideanMasterEnabled: boolean;  // master on/off (off = random mode)
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
  synthEuclid1Source: 'lead' | 'lead1' | 'lead2' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
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
  synthEuclid2Source: 'lead' | 'lead1' | 'lead2' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
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
  synthEuclid3Source: 'lead' | 'lead1' | 'lead2' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
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
  synthEuclid4Source: 'lead' | 'lead1' | 'lead2' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  
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
  drumMembraneTension: number;             // 0..1
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

  // Ocean Waves
  oceanSampleEnabled: boolean;   // on/off toggle for real sample
  oceanSampleLevel: number;      // 0..1 step 0.01 - sample volume
  oceanWaveSynthEnabled: boolean; // on/off toggle for wave synthesis
  oceanWaveSynthLevel: number;   // 0..1 step 0.01 - wave synth volume
  oceanReverbSend: number;       // 0..1 reverb send for ocean (wave synth + sample, post-filter)
  oceanFilterType: 'lowpass' | 'bandpass' | 'highpass' | 'notch'; // filter type
  oceanFilterCutoff: number;     // 40..12000 Hz
  oceanFilterResonance: number;  // 0..1 step 0.01
  oceanDuration: number;      // 2..15 seconds - wave duration (range in dualSliderRanges)
  oceanInterval: number;      // 3..20 seconds - time between waves (range in dualSliderRanges)
  oceanFoam: number;          // 0..1 - foam intensity (range in dualSliderRanges)
  oceanDepth: number;         // 0..1 - low rumble (range in dualSliderRanges)

  // ─── Soundscapes (Water + Insects) ───
  waterEnabled: boolean;        // master on/off for water engine
  waterPreset: number;          // 0..3 (Tap Drips, Stream, Waterfall, Rain Window)
  waterMorphA: number;          // 0..3 morph source preset
  waterMorphB: number;          // 0..3 morph target preset
  waterMorph: number;           // 0..1 morph position
  waterIntensity: number;       // 0..1
  waterRate: number;            // 0..1
  waterDistance: number;        // 0..1
  waterBaseFreq: number;        // 100..8000 Hz
  waterDropSize: number;        // 0..1
  waterHardness: number;        // 0..1
  waterGlassThickness: number;  // 0..1
  waterSpace: number;           // 0..1 reverb send
  waterLevel: number;           // 0..1 output volume
  // Water layer levels (0 = disabled, >0 = enabled at that level)
  waterLayerHardDrops: number;  // 0..1
  waterLayerWaterDrops: number; // 0..1
  waterLayerTurbulence: number; // 0..1
  waterLayerBubbling: number;   // 0..1
  waterLayerRoar: number;       // 0..1
  waterLayerRivulets: number;   // 0..1
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
  insectsReverbSend: number;    // 0..1 reverb send for insects
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

  // ─── Looper FX (Unified Granular Engine) ───
  looperEnabled: boolean;           // Master on/off
  looperDryWet: number;             // 0..1 output wet level
  looperFreeze: boolean;            // Stop write head
  looperFeedback: number;           // 0..0.85 global feedback
  looperFeedbackLPF: number;        // 200..12000 Hz feedback darkening
  looperBufferSeconds: number;      // 4 or 16
  looperPreset: string;             // preset id
  looperReverbSend: number;         // 0..1 send to reverb
  looperPad1Send: number;           // 0..1 pad 1 send to looper
  looperPad2Send: number;           // 0..1 pad 2 send to looper
  looperLead1Send: number;          // 0..1 lead 1 send to looper
  looperLead2Send: number;          // 0..1 lead 2 send to looper
  looperDrumSend: number;           // 0..1 drum engines send to looper
  looperWavesSend: number;          // 0..1 waves send to looper

  // Voice 1
  looperV1Enabled: boolean;
  looperV1Mode: 'clean' | 'granular' | 'legacy';
  looperV1Slice: number;            // 0..15
  looperV1Speed: number;            // 0..4 (0 = LFO scan mode)
  looperV1Reverse: boolean;
  looperV1Pitch: number;            // -24..+24 semitones
  looperV1Attack: number;           // 0.001..0.5 seconds
  looperV1Decay: number;            // 0.01..4 seconds
  looperV1Blur: number;             // 0..1 allpass diffusion
  looperV1GrainOct: number;         // 0..1 shimmer probability
  looperV1Spray: number;            // 0..1 position randomization
  looperV1Density: number;          // 1..64 grains/sec
  looperV1GrainSize: number;        // 10..500 ms
  looperV1Pan: number;              // -1..+1
  looperV1Gain: number;             // 0..1
  looperV1PosLFORate: number;       // 0..1
  looperV1PosLFODepth: number;      // 0..1
  looperV1PanLFORate: number;       // 0..1
  looperV1StereoSpread: number;     // 0..1
  looperV1ReverseLFORate: number;   // 0..1 periodic direction flip
  looperV1WriteFollow: number;      // 0..1 blend slice vs write head
  looperV1RecordLFORate: number;    // 0..1 oscillating write-follow modulation

  // Voice 2
  looperV2Enabled: boolean;
  looperV2Mode: 'clean' | 'granular' | 'legacy';
  looperV2Slice: number;
  looperV2Speed: number;
  looperV2Reverse: boolean;
  looperV2Pitch: number;
  looperV2Attack: number;
  looperV2Decay: number;
  looperV2Blur: number;
  looperV2GrainOct: number;
  looperV2Spray: number;
  looperV2Density: number;
  looperV2GrainSize: number;
  looperV2Pan: number;
  looperV2Gain: number;
  looperV2PosLFORate: number;
  looperV2PosLFODepth: number;
  looperV2PanLFORate: number;
  looperV2StereoSpread: number;
  looperV2ReverseLFORate: number;
  looperV2WriteFollow: number;
  looperV2RecordLFORate: number;

  // Voice 3
  looperV3Enabled: boolean;
  looperV3Mode: 'clean' | 'granular' | 'legacy';
  looperV3Slice: number;
  looperV3Speed: number;
  looperV3Reverse: boolean;
  looperV3Pitch: number;
  looperV3Attack: number;
  looperV3Decay: number;
  looperV3Blur: number;
  looperV3GrainOct: number;
  looperV3Spray: number;
  looperV3Density: number;
  looperV3GrainSize: number;
  looperV3Pan: number;
  looperV3Gain: number;
  looperV3PosLFORate: number;
  looperV3PosLFODepth: number;
  looperV3PanLFORate: number;
  looperV3StereoSpread: number;
  looperV3ReverseLFORate: number;
  looperV3WriteFollow: number;
  looperV3RecordLFORate: number;

  // Voice 4
  looperV4Enabled: boolean;
  looperV4Mode: 'clean' | 'granular' | 'legacy';
  looperV4Slice: number;
  looperV4Speed: number;
  looperV4Reverse: boolean;
  looperV4Pitch: number;
  looperV4Attack: number;
  looperV4Decay: number;
  looperV4Blur: number;
  looperV4GrainOct: number;
  looperV4Spray: number;
  looperV4Density: number;
  looperV4GrainSize: number;
  looperV4Pan: number;
  looperV4Gain: number;
  looperV4PosLFORate: number;
  looperV4PosLFODepth: number;
  looperV4PanLFORate: number;
  looperV4StereoSpread: number;
  looperV4ReverseLFORate: number;
  looperV4WriteFollow: number;
  looperV4RecordLFORate: number;

  // Legacy granular params (for legacy mode compatibility)
  looperLegacyJitter: number;       // 0..30 ms
  looperLegacyProbability: number;   // 0..1
  looperLegacyPitchMode: 'random' | 'harmonic';
  looperLegacyPitchSpread: number;   // 0..12
  looperLegacyMaxGrains: number;     // 0..128
  looperLegacyFeedback: number;      // 0..0.35

  // ─── Looper Multi-Tap Delay ───
  looperDelayEnabled: boolean;        // Delay on/off
  looperDelayActivity: number;        // 0..1 macro: tap count + syncopation
  looperDelayRepeats: number;         // 0..0.85 feedback cycles
  looperDelayTime: string;            // note division base (1/4, 1/8, etc.)
  looperDelayFilter: number;          // 0..1 maps to 200-8000Hz tone LPF
  looperDelayVibrato: number;         // 0..1 per-tap delay time modulation
  looperDelayMix: number;             // 0..1 delay wet level to master
  looperDelayReverbSend: number;      // 0..1 delay output to reverb

  // ─── Looper Macros ───
  looperMacroTexture: number;         // 0..1 blur/spray/grainSize/grainOct/decay
  looperMacroComplexity: number;      // 0..1 LFO rates/density/delayActivity
  looperMacroDarkness: number;        // 0..1 speed/pitch/filter/repeats
  looperMacroChaos: number;           // 0..1 reverseLFO/spray/grainOct/vibrato

  // ─── Looper Euclidean Sequencer (4 lanes → 4 voices) ───
  looperEuclidMasterEnabled: boolean;      // Master on/off
  looperEuclidBaseBPM: number;             // Base BPM (40-240)
  looperEuclidTempo: number;               // 0.25..4 tempo multiplier
  looperEuclidSwing: number;               // 0..100% swing
  looperEuclidDivision: number;            // 4, 8, 16, 32

  // Looper Euclidean Lane 1 → Voice 1
  looperEuclid1Enabled: boolean;
  looperEuclid1Preset: string;
  looperEuclid1Steps: number;
  looperEuclid1Hits: number;
  looperEuclid1Rotation: number;
  looperEuclid1Probability: number;
  looperEuclid1VelocityMin: number;
  looperEuclid1VelocityMax: number;
  looperEuclid1Level: number;

  // Looper Euclidean Lane 2 → Voice 2
  looperEuclid2Enabled: boolean;
  looperEuclid2Preset: string;
  looperEuclid2Steps: number;
  looperEuclid2Hits: number;
  looperEuclid2Rotation: number;
  looperEuclid2Probability: number;
  looperEuclid2VelocityMin: number;
  looperEuclid2VelocityMax: number;
  looperEuclid2Level: number;

  // Looper Euclidean Lane 3 → Voice 3
  looperEuclid3Enabled: boolean;
  looperEuclid3Preset: string;
  looperEuclid3Steps: number;
  looperEuclid3Hits: number;
  looperEuclid3Rotation: number;
  looperEuclid3Probability: number;
  looperEuclid3VelocityMin: number;
  looperEuclid3VelocityMax: number;
  looperEuclid3Level: number;

  // Looper Euclidean Lane 4 → Voice 4
  looperEuclid4Enabled: boolean;
  looperEuclid4Preset: string;
  looperEuclid4Steps: number;
  looperEuclid4Hits: number;
  looperEuclid4Rotation: number;
  looperEuclid4Probability: number;
  looperEuclid4VelocityMin: number;
  looperEuclid4VelocityMax: number;
  looperEuclid4Level: number;

  // Random Walk (for dual sliders)
  randomWalkSpeed: number;    // 0.1..5 - speed of random walk between dual slider values
}

// Sorted keys for stable serialization
const STATE_KEYS: (keyof SliderState)[] = [
  'masterVolume',
  'synthLevel',
  'pad2Level',
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
  'filterType',
  'filterCutoffMin',
  'filterCutoffMax',
  'filterResonance',
  'filterQ',
  'warmth',
  'presence',
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
  'pad2OscMix',
  'pad2FilterType',
  'pad2FilterCutoffMin',
  'pad2FilterCutoffMax',
  'pad2FilterResonance',
  'pad2FilterQ',
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
  'granularEnabled',
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
  'leadLevel',
  'lead1UseCustomAdsr',
  'lead1Attack',
  'lead1Decay',
  'lead1Sustain',
  'lead1Release',
  'leadDelayTime',
  'leadDelayFeedback',
  'leadDelayMix',
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
  'lead2UseCustomAdsr',
  'lead2Attack',
  'lead2Decay',
  'lead2Sustain',
  'lead2Release',
  'leadVibratoDepth',
  'leadVibratoRate',
  'leadGlide',
  'synthEuclideanMasterEnabled',
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
  'drumMembraneTension',
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
  'oceanSampleEnabled',
  'oceanSampleLevel', 'oceanReverbSend',
  'oceanWaveSynthEnabled',
  'oceanWaveSynthLevel',
  'oceanFilterType',
  'oceanFilterCutoff',
  'oceanFilterResonance',
  'oceanDuration',
  'oceanInterval',
  'oceanFoam',
  'oceanDepth',
  // Soundscapes (Water + Insects)
  'waterEnabled',
  'waterPreset', 'waterMorphA', 'waterMorphB', 'waterMorph',
  'waterIntensity', 'waterRate', 'waterDistance', 'waterBaseFreq',
  'waterDropSize', 'waterHardness', 'waterGlassThickness',
  'waterSpace', 'waterLevel',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerRoar', 'waterLayerRivulets',
  'insectsEnabled', 'insectsEngine',
  'insectsDensity', 'insectsTemperature', 'insectsDistance', 'insectsProximity',
  'insectsAntiphony', 'insectsClickRate', 'insectsMotion', 'insectsLevel', 'insectsReverbSend',
  'insects2Enabled', 'insects2Engine',
  'insects2Density', 'insects2Temperature', 'insects2Distance', 'insects2Proximity',
  'insects2Antiphony', 'insects2ClickRate', 'insects2Motion', 'insects2Level',
  'randomWalkSpeed',
  // Looper FX
  'looperEnabled',
  'looperDryWet',
  'looperFreeze',
  'looperFeedback',
  'looperFeedbackLPF',
  'looperBufferSeconds',
  'looperPreset',
  'looperReverbSend',
  'looperPad1Send', 'looperPad2Send', 'looperLead1Send', 'looperLead2Send', 'looperDrumSend', 'looperWavesSend',
  'looperV1Enabled', 'looperV1Mode', 'looperV1Slice', 'looperV1Speed', 'looperV1Reverse',
  'looperV1Pitch', 'looperV1Attack', 'looperV1Decay', 'looperV1Blur', 'looperV1GrainOct',
  'looperV1Spray', 'looperV1Density', 'looperV1GrainSize', 'looperV1Pan', 'looperV1Gain',
  'looperV1PosLFORate', 'looperV1PosLFODepth', 'looperV1PanLFORate', 'looperV1StereoSpread',
  'looperV1ReverseLFORate', 'looperV1WriteFollow', 'looperV1RecordLFORate',
  'looperV2Enabled', 'looperV2Mode', 'looperV2Slice', 'looperV2Speed', 'looperV2Reverse',
  'looperV2Pitch', 'looperV2Attack', 'looperV2Decay', 'looperV2Blur', 'looperV2GrainOct',
  'looperV2Spray', 'looperV2Density', 'looperV2GrainSize', 'looperV2Pan', 'looperV2Gain',
  'looperV2PosLFORate', 'looperV2PosLFODepth', 'looperV2PanLFORate', 'looperV2StereoSpread',
  'looperV2ReverseLFORate', 'looperV2WriteFollow', 'looperV2RecordLFORate',
  'looperV3Enabled', 'looperV3Mode', 'looperV3Slice', 'looperV3Speed', 'looperV3Reverse',
  'looperV3Pitch', 'looperV3Attack', 'looperV3Decay', 'looperV3Blur', 'looperV3GrainOct',
  'looperV3Spray', 'looperV3Density', 'looperV3GrainSize', 'looperV3Pan', 'looperV3Gain',
  'looperV3PosLFORate', 'looperV3PosLFODepth', 'looperV3PanLFORate', 'looperV3StereoSpread',
  'looperV3ReverseLFORate', 'looperV3WriteFollow', 'looperV3RecordLFORate',
  'looperV4Enabled', 'looperV4Mode', 'looperV4Slice', 'looperV4Speed', 'looperV4Reverse',
  'looperV4Pitch', 'looperV4Attack', 'looperV4Decay', 'looperV4Blur', 'looperV4GrainOct',
  'looperV4Spray', 'looperV4Density', 'looperV4GrainSize', 'looperV4Pan', 'looperV4Gain',
  'looperV4PosLFORate', 'looperV4PosLFODepth', 'looperV4PanLFORate', 'looperV4StereoSpread',
  'looperV4ReverseLFORate', 'looperV4WriteFollow', 'looperV4RecordLFORate',
  'looperLegacyJitter', 'looperLegacyProbability', 'looperLegacyPitchMode',
  'looperLegacyPitchSpread', 'looperLegacyMaxGrains', 'looperLegacyFeedback',
  // Delay
  'looperDelayEnabled', 'looperDelayActivity', 'looperDelayRepeats', 'looperDelayTime',
  'looperDelayFilter', 'looperDelayVibrato', 'looperDelayMix', 'looperDelayReverbSend',
  // Macros
  'looperMacroTexture', 'looperMacroComplexity', 'looperMacroDarkness', 'looperMacroChaos',
  // Looper Euclidean
  'looperEuclidMasterEnabled', 'looperEuclidBaseBPM', 'looperEuclidTempo', 'looperEuclidSwing', 'looperEuclidDivision',
  'looperEuclid1Enabled', 'looperEuclid1Preset', 'looperEuclid1Steps', 'looperEuclid1Hits', 'looperEuclid1Rotation',
  'looperEuclid1Probability', 'looperEuclid1VelocityMin', 'looperEuclid1VelocityMax', 'looperEuclid1Level',
  'looperEuclid2Enabled', 'looperEuclid2Preset', 'looperEuclid2Steps', 'looperEuclid2Hits', 'looperEuclid2Rotation',
  'looperEuclid2Probability', 'looperEuclid2VelocityMin', 'looperEuclid2VelocityMax', 'looperEuclid2Level',
  'looperEuclid3Enabled', 'looperEuclid3Preset', 'looperEuclid3Steps', 'looperEuclid3Hits', 'looperEuclid3Rotation',
  'looperEuclid3Probability', 'looperEuclid3VelocityMin', 'looperEuclid3VelocityMax', 'looperEuclid3Level',
  'looperEuclid4Enabled', 'looperEuclid4Preset', 'looperEuclid4Steps', 'looperEuclid4Hits', 'looperEuclid4Rotation',
  'looperEuclid4Probability', 'looperEuclid4VelocityMin', 'looperEuclid4VelocityMax', 'looperEuclid4Level',
];

/**
 * Default slider state with conservative values for performance
 */
export const DEFAULT_STATE: SliderState = {
  // Master Mixer
  masterVolume: 0.7,
  synthLevel: 0.6,
  pad2Level: 0.6,
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

  // Timbre / Drive
  hardness: 0.3,
  filterType: 'lowpass' as const,
  filterCutoffMin: 400,
  filterCutoffMax: 3000,
  filterResonance: 0.2,
  filterQ: 1.0,
  warmth: 0.4,
  presence: 0.3,

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
  pad2OscMix: 0.5,
  pad2FilterType: 'lowpass' as const,
  pad2FilterCutoffMin: 400,
  pad2FilterCutoffMax: 3000,
  pad2FilterResonance: 0.2,
  pad2FilterQ: 1.0,
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
  reverbFreeze: false,
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

  // Granular
  granularEnabled: true,
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
  leadLevel: 0,
  lead1UseCustomAdsr: false,
  lead1Attack: 0.01,
  lead1Decay: 0.8,
  lead1Sustain: 0.3,
  lead1Hold: 0.5,
  lead1Release: 2.0,
  leadDelayTime: 375,
  leadDelayFeedback: 0.4,
  leadDelayMix: 0.35,
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
  lead2UseCustomAdsr: false,
  lead2Attack: 0.01,
  lead2Decay: 0.8,
  lead2Sustain: 0.3,
  lead2Hold: 0.5,
  lead2Release: 2.0,
  leadVibratoDepth: 0,
  leadVibratoRate: 0,
  leadGlide: 0,
  // Euclidean sequencer for lead - 4 lanes for polyrhythms
  synthEuclideanMasterEnabled: false,
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
  drumMembraneTension: 0.5,
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

  // Ocean Waves
  oceanSampleEnabled: false,
  oceanSampleLevel: 0,
  oceanWaveSynthEnabled: false,
  oceanWaveSynthLevel: 0,
  oceanReverbSend: 0.2,
  oceanFilterType: 'lowpass' as const,
  oceanFilterCutoff: 8000,
  oceanFilterResonance: 0.1,
  oceanDuration: 7,
  oceanInterval: 8.5,
  oceanFoam: 0.35,
  oceanDepth: 0.5,

  // ─── Soundscapes (Water + Insects) ───
  waterEnabled: false,
  waterPreset: 1,
  waterMorphA: 0,
  waterMorphB: 2,
  waterMorph: 0,
  waterIntensity: 0.7,
  waterRate: 0.5,
  waterDistance: 0.3,
  waterBaseFreq: 2300,
  waterDropSize: 0.5,
  waterHardness: 0.5,
  waterGlassThickness: 0.5,
  waterSpace: 0.3,
  waterLevel: 0.8,
  waterLayerHardDrops: 0.08,
  waterLayerWaterDrops: 0.82,
  waterLayerTurbulence: 0.56,
  waterLayerBubbling: 0.92,
  waterLayerRoar: 0.0,
  waterLayerRivulets: 0.0,
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
  insectsReverbSend: 0.15,
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

  // ─── Looper FX ───
  looperEnabled: false,
  looperDryWet: 0.3,
  looperFreeze: false,
  looperFeedback: 0.1,
  looperFeedbackLPF: 8000,
  looperBufferSeconds: 16,
  looperPreset: 'init',
  looperReverbSend: 0.3,
  looperPad1Send: 1.0,
  looperPad2Send: 0.0,
  looperLead1Send: 0.0,
  looperLead2Send: 0.0,
  looperDrumSend: 0.0,
  looperWavesSend: 0.0,

  // Voice 1 (default: granular, active)
  looperV1Enabled: true,
  looperV1Mode: 'granular' as const,
  looperV1Slice: 0,
  looperV1Speed: 1,
  looperV1Reverse: false,
  looperV1Pitch: 0,
  looperV1Attack: 0.003,
  looperV1Decay: 0.5,
  looperV1Blur: 0,
  looperV1GrainOct: 0,
  looperV1Spray: 0.3,
  looperV1Density: 20,
  looperV1GrainSize: 80,
  looperV1Pan: 0,
  looperV1Gain: 0.5,
  looperV1PosLFORate: 0,
  looperV1PosLFODepth: 0,
  looperV1PanLFORate: 0,
  looperV1StereoSpread: 0.5,
  looperV1ReverseLFORate: 0,
  looperV1WriteFollow: 0,
  looperV1RecordLFORate: 0,

  // Voice 2 (default: off)
  looperV2Enabled: false,
  looperV2Mode: 'granular' as const,
  looperV2Slice: 4,
  looperV2Speed: 1,
  looperV2Reverse: false,
  looperV2Pitch: 0,
  looperV2Attack: 0.003,
  looperV2Decay: 0.5,
  looperV2Blur: 0,
  looperV2GrainOct: 0,
  looperV2Spray: 0.3,
  looperV2Density: 20,
  looperV2GrainSize: 80,
  looperV2Pan: 0,
  looperV2Gain: 0.5,
  looperV2PosLFORate: 0,
  looperV2PosLFODepth: 0,
  looperV2PanLFORate: 0,
  looperV2StereoSpread: 0.5,
  looperV2ReverseLFORate: 0,
  looperV2WriteFollow: 0,
  looperV2RecordLFORate: 0,

  // Voice 3 (default: off)
  looperV3Enabled: false,
  looperV3Mode: 'granular' as const,
  looperV3Slice: 8,
  looperV3Speed: 1,
  looperV3Reverse: false,
  looperV3Pitch: 0,
  looperV3Attack: 0.003,
  looperV3Decay: 0.5,
  looperV3Blur: 0,
  looperV3GrainOct: 0,
  looperV3Spray: 0.3,
  looperV3Density: 20,
  looperV3GrainSize: 80,
  looperV3Pan: 0,
  looperV3Gain: 0.5,
  looperV3PosLFORate: 0,
  looperV3PosLFODepth: 0,
  looperV3PanLFORate: 0,
  looperV3StereoSpread: 0.5,
  looperV3ReverseLFORate: 0,
  looperV3WriteFollow: 0,
  looperV3RecordLFORate: 0,

  // Voice 4 (default: off)
  looperV4Enabled: false,
  looperV4Mode: 'granular' as const,
  looperV4Slice: 12,
  looperV4Speed: 1,
  looperV4Reverse: false,
  looperV4Pitch: 0,
  looperV4Attack: 0.003,
  looperV4Decay: 0.5,
  looperV4Blur: 0,
  looperV4GrainOct: 0,
  looperV4Spray: 0.3,
  looperV4Density: 20,
  looperV4GrainSize: 80,
  looperV4Pan: 0,
  looperV4Gain: 0.5,
  looperV4PosLFORate: 0,
  looperV4PosLFODepth: 0,
  looperV4PanLFORate: 0,
  looperV4StereoSpread: 0.5,
  looperV4ReverseLFORate: 0,
  looperV4WriteFollow: 0,
  looperV4RecordLFORate: 0,

  // Legacy compatibility
  looperLegacyJitter: 10,
  looperLegacyProbability: 0.8,
  looperLegacyPitchMode: 'harmonic' as const,
  looperLegacyPitchSpread: 2,
  looperLegacyMaxGrains: 64,
  looperLegacyFeedback: 0.1,

  // Looper Delay
  looperDelayEnabled: false,
  looperDelayActivity: 0.3,
  looperDelayRepeats: 0.3,
  looperDelayTime: '1/4' as string,
  looperDelayFilter: 0.5,
  looperDelayVibrato: 0,
  looperDelayMix: 0.3,
  looperDelayReverbSend: 0.4,

  // Looper Macros
  looperMacroTexture: 0.3,
  looperMacroComplexity: 0.2,
  looperMacroDarkness: 0.3,
  looperMacroChaos: 0.1,

  // Looper Euclidean Sequencer
  looperEuclidMasterEnabled: false,
  looperEuclidBaseBPM: 120,
  looperEuclidTempo: 1,
  looperEuclidSwing: 0,
  looperEuclidDivision: 16,
  // Lane 1 → Voice 1 (main pulse)
  looperEuclid1Enabled: false,
  looperEuclid1Preset: 'lancaran',
  looperEuclid1Steps: 16,
  looperEuclid1Hits: 4,
  looperEuclid1Rotation: 0,
  looperEuclid1Probability: 1.0,
  looperEuclid1VelocityMin: 0.6,
  looperEuclid1VelocityMax: 1.0,
  looperEuclid1Level: 0.8,
  // Lane 2 → Voice 2 (interlocking)
  looperEuclid2Enabled: false,
  looperEuclid2Preset: 'kotekan',
  looperEuclid2Steps: 8,
  looperEuclid2Hits: 3,
  looperEuclid2Rotation: 1,
  looperEuclid2Probability: 1.0,
  looperEuclid2VelocityMin: 0.5,
  looperEuclid2VelocityMax: 0.9,
  looperEuclid2Level: 0.6,
  // Lane 3 → Voice 3 (sparse accent)
  looperEuclid3Enabled: false,
  looperEuclid3Preset: 'ketawang',
  looperEuclid3Steps: 16,
  looperEuclid3Hits: 2,
  looperEuclid3Rotation: 0,
  looperEuclid3Probability: 1.0,
  looperEuclid3VelocityMin: 0.7,
  looperEuclid3VelocityMax: 1.0,
  looperEuclid3Level: 0.9,
  // Lane 4 → Voice 4 (fill/texture)
  looperEuclid4Enabled: false,
  looperEuclid4Preset: 'srepegan',
  looperEuclid4Steps: 16,
  looperEuclid4Hits: 6,
  looperEuclid4Rotation: 2,
  looperEuclid4Probability: 1.0,
  looperEuclid4VelocityMin: 0.4,
  looperEuclid4VelocityMax: 0.8,
  looperEuclid4Level: 0.5,

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

export const QUANTIZATION: Partial<Record<keyof SliderState, QuantizationDef>> = {
  masterVolume: { min: 0, max: 1, step: 0.01 },
  synthLevel: { min: 0, max: 1, step: 0.01 },
  pad2Level: { min: 0, max: 1, step: 0.01 },
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
  hardness: { min: 0, max: 2, step: 0.01 },
  filterCutoffMin: { min: 40, max: 8000, step: 10 },
  filterCutoffMax: { min: 40, max: 8000, step: 10 },
  filterResonance: { min: 0, max: 1, step: 0.01 },
  filterQ: { min: 0.1, max: 12, step: 0.1 },
  warmth: { min: 0, max: 1, step: 0.01 },
  presence: { min: 0, max: 1, step: 0.01 },
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
  pad2OscMix: { min: 0, max: 1, step: 0.01 },
  pad2FilterCutoffMin: { min: 40, max: 8000, step: 10 },
  pad2FilterCutoffMax: { min: 40, max: 8000, step: 10 },
  pad2FilterResonance: { min: 0, max: 1, step: 0.01 },
  pad2FilterQ: { min: 0.1, max: 12, step: 0.1 },
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
  reverbLevel: { min: 0, max: 2, step: 0.01 },
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
  drumMembraneTension: { min: 0, max: 1, step: 0.01 },
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
  leadDelayTime: { min: 0, max: 1000, step: 10 },
  leadDelayFeedback: { min: 0, max: 0.8, step: 0.01 },
  leadDelayMix: { min: 0, max: 1, step: 0.01 },
  lead1Density: { min: 0.1, max: 12, step: 0.1 },
  lead1Octave: { min: -1, max: 2, step: 1 },
  lead1OctaveRange: { min: 1, max: 4, step: 1 },
  leadTimbre: { min: 0, max: 1, step: 0.01 },
  // Lead 1/2 morph
  lead1Morph: { min: 0, max: 1, step: 0.01 },
  lead1MorphSpeed: { min: 1, max: 32, step: 1 },
  lead1Level: { min: 0, max: 1, step: 0.01 },
  lead2Morph: { min: 0, max: 1, step: 0.01 },
  lead2MorphSpeed: { min: 1, max: 32, step: 1 },
  lead2Level: { min: 0, max: 1, step: 0.01 },
  lead2Attack: { min: 0.001, max: 2, step: 0.001 },
  lead2Decay: { min: 0.01, max: 4, step: 0.01 },
  lead2Sustain: { min: 0, max: 1, step: 0.01 },
  lead2Hold: { min: 0, max: 4, step: 0.01 },
  lead2Release: { min: 0.01, max: 8, step: 0.01 },
  leadVibratoDepth: { min: 0, max: 1, step: 0.01 },
  leadVibratoRate: { min: 0, max: 1, step: 0.01 },
  leadGlide: { min: 0, max: 1, step: 0.01 },
  // Euclidean sequencer - shared for all lanes
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
  drumEuclidBaseBPM: { min: 40, max: 240, step: 1 },
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
  // Ocean
  oceanSampleLevel: { min: 0, max: 1, step: 0.01 },
  oceanWaveSynthLevel: { min: 0, max: 1, step: 0.01 },
  oceanReverbSend: { min: 0, max: 1, step: 0.01 },
  oceanFilterCutoff: { min: 40, max: 12000, step: 10 },
  oceanFilterResonance: { min: 0, max: 1, step: 0.01 },
  oceanDuration: { min: 2, max: 15, step: 0.5 },
  oceanInterval: { min: 3, max: 20, step: 0.5 },
  oceanFoam: { min: 0, max: 1, step: 0.01 },
  oceanDepth: { min: 0, max: 1, step: 0.01 },
  // Soundscapes (Water + Insects)
  waterMorph: { min: 0, max: 1, step: 0.01 },
  waterIntensity: { min: 0, max: 1, step: 0.01 },
  waterRate: { min: 0, max: 1, step: 0.01 },
  waterDistance: { min: 0, max: 1, step: 0.01 },
  waterBaseFreq: { min: 100, max: 8000, step: 10 },
  waterDropSize: { min: 0, max: 1, step: 0.01 },
  waterHardness: { min: 0, max: 1, step: 0.01 },
  waterGlassThickness: { min: 0, max: 1, step: 0.01 },
  waterSpace: { min: 0, max: 1, step: 0.01 },
  waterLevel: { min: 0, max: 1, step: 0.01 },
  waterLayerHardDrops: { min: 0, max: 1, step: 0.01 },
  waterLayerWaterDrops: { min: 0, max: 1, step: 0.01 },
  waterLayerTurbulence: { min: 0, max: 1, step: 0.01 },
  waterLayerBubbling: { min: 0, max: 1, step: 0.01 },
  waterLayerRoar: { min: 0, max: 1, step: 0.01 },
  waterLayerRivulets: { min: 0, max: 1, step: 0.01 },
  insectsDensity: { min: 0, max: 1, step: 0.01 },
  insectsTemperature: { min: 0, max: 1, step: 0.01 },
  insectsDistance: { min: 0, max: 1, step: 0.01 },
  insectsProximity: { min: 0, max: 1, step: 0.01 },
  insectsAntiphony: { min: 0, max: 1, step: 0.01 },
  insectsClickRate: { min: 0, max: 1, step: 0.01 },
  insectsMotion: { min: 0, max: 1, step: 0.01 },
  insectsLevel: { min: 0, max: 1, step: 0.01 },
  insectsReverbSend: { min: 0, max: 1, step: 0.01 },
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

  // ─── Looper FX ───
  looperDryWet: { min: 0, max: 1, step: 0.01 },
  looperFeedback: { min: 0, max: 0.85, step: 0.01 },
  looperFeedbackLPF: { min: 200, max: 12000, step: 50 },
  looperBufferSeconds: { min: 4, max: 16, step: 12 },
  looperReverbSend: { min: 0, max: 1, step: 0.01 },
  looperPad1Send: { min: 0, max: 1, step: 0.01 },
  looperPad2Send: { min: 0, max: 1, step: 0.01 },
  looperLead1Send: { min: 0, max: 1, step: 0.01 },
  looperLead2Send: { min: 0, max: 1, step: 0.01 },
  looperDrumSend: { min: 0, max: 1, step: 0.01 },
  looperWavesSend: { min: 0, max: 1, step: 0.01 },
  // Per-voice shared quantization (all 4 voices)
  looperV1Slice: { min: 0, max: 15, step: 1 },
  looperV1Speed: { min: 0, max: 4, step: 0.05 },
  looperV1Pitch: { min: -24, max: 24, step: 1 },
  looperV1Attack: { min: 0.001, max: 0.5, step: 0.001 },
  looperV1Decay: { min: 0.01, max: 4, step: 0.01 },
  looperV1Blur: { min: 0, max: 1, step: 0.01 },
  looperV1GrainOct: { min: 0, max: 1, step: 0.01 },
  looperV1Spray: { min: 0, max: 1, step: 0.01 },
  looperV1Density: { min: 1, max: 64, step: 1 },
  looperV1GrainSize: { min: 10, max: 500, step: 5 },
  looperV1Pan: { min: -1, max: 1, step: 0.01 },
  looperV1Gain: { min: 0, max: 1, step: 0.01 },
  looperV1PosLFORate: { min: 0, max: 1, step: 0.01 },
  looperV1PosLFODepth: { min: 0, max: 1, step: 0.01 },
  looperV1PanLFORate: { min: 0, max: 1, step: 0.01 },
  looperV1StereoSpread: { min: 0, max: 1, step: 0.01 },
  looperV1ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  looperV1WriteFollow: { min: 0, max: 1, step: 0.01 },
  looperV1RecordLFORate: { min: 0, max: 1, step: 0.01 },
  looperV2Slice: { min: 0, max: 15, step: 1 },
  looperV2Speed: { min: 0.25, max: 4, step: 0.05 },
  looperV2Pitch: { min: -24, max: 24, step: 1 },
  looperV2Attack: { min: 0.001, max: 0.5, step: 0.001 },
  looperV2Decay: { min: 0.01, max: 4, step: 0.01 },
  looperV2Blur: { min: 0, max: 1, step: 0.01 },
  looperV2GrainOct: { min: 0, max: 1, step: 0.01 },
  looperV2Spray: { min: 0, max: 1, step: 0.01 },
  looperV2Density: { min: 1, max: 64, step: 1 },
  looperV2GrainSize: { min: 10, max: 500, step: 5 },
  looperV2Pan: { min: -1, max: 1, step: 0.01 },
  looperV2Gain: { min: 0, max: 1, step: 0.01 },
  looperV2PosLFORate: { min: 0, max: 1, step: 0.01 },
  looperV2PosLFODepth: { min: 0, max: 1, step: 0.01 },
  looperV2PanLFORate: { min: 0, max: 1, step: 0.01 },
  looperV2StereoSpread: { min: 0, max: 1, step: 0.01 },
  looperV2ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  looperV2WriteFollow: { min: 0, max: 1, step: 0.01 },
  looperV2RecordLFORate: { min: 0, max: 1, step: 0.01 },
  looperV3Slice: { min: 0, max: 15, step: 1 },
  looperV3Speed: { min: 0.25, max: 4, step: 0.05 },
  looperV3Pitch: { min: -24, max: 24, step: 1 },
  looperV3Attack: { min: 0.001, max: 0.5, step: 0.001 },
  looperV3Decay: { min: 0.01, max: 4, step: 0.01 },
  looperV3Blur: { min: 0, max: 1, step: 0.01 },
  looperV3GrainOct: { min: 0, max: 1, step: 0.01 },
  looperV3Spray: { min: 0, max: 1, step: 0.01 },
  looperV3Density: { min: 1, max: 64, step: 1 },
  looperV3GrainSize: { min: 10, max: 500, step: 5 },
  looperV3Pan: { min: -1, max: 1, step: 0.01 },
  looperV3Gain: { min: 0, max: 1, step: 0.01 },
  looperV3PosLFORate: { min: 0, max: 1, step: 0.01 },
  looperV3PosLFODepth: { min: 0, max: 1, step: 0.01 },
  looperV3PanLFORate: { min: 0, max: 1, step: 0.01 },
  looperV3StereoSpread: { min: 0, max: 1, step: 0.01 },
  looperV3ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  looperV3WriteFollow: { min: 0, max: 1, step: 0.01 },
  looperV3RecordLFORate: { min: 0, max: 1, step: 0.01 },
  looperV4Slice: { min: 0, max: 15, step: 1 },
  looperV4Speed: { min: 0.25, max: 4, step: 0.05 },
  looperV4Pitch: { min: -24, max: 24, step: 1 },
  looperV4Attack: { min: 0.001, max: 0.5, step: 0.001 },
  looperV4Decay: { min: 0.01, max: 4, step: 0.01 },
  looperV4Blur: { min: 0, max: 1, step: 0.01 },
  looperV4GrainOct: { min: 0, max: 1, step: 0.01 },
  looperV4Spray: { min: 0, max: 1, step: 0.01 },
  looperV4Density: { min: 1, max: 64, step: 1 },
  looperV4GrainSize: { min: 10, max: 500, step: 5 },
  looperV4Pan: { min: -1, max: 1, step: 0.01 },
  looperV4Gain: { min: 0, max: 1, step: 0.01 },
  looperV4PosLFORate: { min: 0, max: 1, step: 0.01 },
  looperV4PosLFODepth: { min: 0, max: 1, step: 0.01 },
  looperV4PanLFORate: { min: 0, max: 1, step: 0.01 },
  looperV4StereoSpread: { min: 0, max: 1, step: 0.01 },
  looperV4ReverseLFORate: { min: 0, max: 1, step: 0.01 },
  looperV4WriteFollow: { min: 0, max: 1, step: 0.01 },
  looperV4RecordLFORate: { min: 0, max: 1, step: 0.01 },
  // Legacy
  looperLegacyJitter: { min: 0, max: 30, step: 1 },
  looperLegacyProbability: { min: 0, max: 1, step: 0.01 },
  looperLegacyPitchSpread: { min: 0, max: 12, step: 1 },
  looperLegacyMaxGrains: { min: 0, max: 128, step: 1 },
  looperLegacyFeedback: { min: 0, max: 0.35, step: 0.01 },
  // Delay
  looperDelayActivity: { min: 0, max: 1, step: 0.01 },
  looperDelayRepeats: { min: 0, max: 0.85, step: 0.01 },
  looperDelayFilter: { min: 0, max: 1, step: 0.01 },
  looperDelayVibrato: { min: 0, max: 1, step: 0.01 },
  looperDelayMix: { min: 0, max: 1, step: 0.01 },
  looperDelayReverbSend: { min: 0, max: 1, step: 0.01 },
  // Macros
  looperMacroTexture: { min: 0, max: 1, step: 0.01 },
  looperMacroComplexity: { min: 0, max: 1, step: 0.01 },
  looperMacroDarkness: { min: 0, max: 1, step: 0.01 },
  looperMacroChaos: { min: 0, max: 1, step: 0.01 },
  // Looper Euclidean
  looperEuclidBaseBPM: { min: 40, max: 240, step: 1 },
  looperEuclidTempo: { min: 0.25, max: 4, step: 0.25 },
  looperEuclidSwing: { min: 0, max: 100, step: 1 },
  looperEuclid1Steps: { min: 2, max: 32, step: 1 },
  looperEuclid1Hits: { min: 0, max: 32, step: 1 },
  looperEuclid1Rotation: { min: 0, max: 31, step: 1 },
  looperEuclid1Probability: { min: 0, max: 1, step: 0.01 },
  looperEuclid1VelocityMin: { min: 0, max: 1, step: 0.01 },
  looperEuclid1VelocityMax: { min: 0, max: 1, step: 0.01 },
  looperEuclid1Level: { min: 0, max: 1, step: 0.01 },
  looperEuclid2Steps: { min: 2, max: 32, step: 1 },
  looperEuclid2Hits: { min: 0, max: 32, step: 1 },
  looperEuclid2Rotation: { min: 0, max: 31, step: 1 },
  looperEuclid2Probability: { min: 0, max: 1, step: 0.01 },
  looperEuclid2VelocityMin: { min: 0, max: 1, step: 0.01 },
  looperEuclid2VelocityMax: { min: 0, max: 1, step: 0.01 },
  looperEuclid2Level: { min: 0, max: 1, step: 0.01 },
  looperEuclid3Steps: { min: 2, max: 32, step: 1 },
  looperEuclid3Hits: { min: 0, max: 32, step: 1 },
  looperEuclid3Rotation: { min: 0, max: 31, step: 1 },
  looperEuclid3Probability: { min: 0, max: 1, step: 0.01 },
  looperEuclid3VelocityMin: { min: 0, max: 1, step: 0.01 },
  looperEuclid3VelocityMax: { min: 0, max: 1, step: 0.01 },
  looperEuclid3Level: { min: 0, max: 1, step: 0.01 },
  looperEuclid4Steps: { min: 2, max: 32, step: 1 },
  looperEuclid4Hits: { min: 0, max: 32, step: 1 },
  looperEuclid4Rotation: { min: 0, max: 31, step: 1 },
  looperEuclid4Probability: { min: 0, max: 1, step: 0.01 },
  looperEuclid4VelocityMin: { min: 0, max: 1, step: 0.01 },
  looperEuclid4VelocityMax: { min: 0, max: 1, step: 0.01 },
  looperEuclid4Level: { min: 0, max: 1, step: 0.01 },
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
        } else if (key === 'padEnabled') {
          state.padEnabled = value === 'true';
        } else if (key === 'leadEnabled') {
          state.leadEnabled = value === 'true';
        } else if (key === 'leadRandomEnabled') {
          state.leadRandomEnabled = value === 'true';
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
  { minKey: 'leadDelayTimeMin', maxKey: 'leadDelayTimeMax', newKey: 'leadDelayTime', defaultMode: 'sampleHold', threshold: 0.1 },
  { minKey: 'leadDelayFeedbackMin', maxKey: 'leadDelayFeedbackMax', newKey: 'leadDelayFeedback', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'leadDelayMixMin', maxKey: 'leadDelayMixMax', newKey: 'leadDelayMix', defaultMode: 'sampleHold', threshold: 0.001 },
  { minKey: 'oceanDurationMin', maxKey: 'oceanDurationMax', newKey: 'oceanDuration', defaultMode: 'walk', threshold: 0.01 },
  { minKey: 'oceanIntervalMin', maxKey: 'oceanIntervalMax', newKey: 'oceanInterval', defaultMode: 'walk', threshold: 0.01 },
  { minKey: 'oceanFoamMin', maxKey: 'oceanFoamMax', newKey: 'oceanFoam', defaultMode: 'walk', threshold: 0.001 },
  { minKey: 'oceanDepthMin', maxKey: 'oceanDepthMax', newKey: 'oceanDepth', defaultMode: 'walk', threshold: 0.001 },
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

  // ═══ Legacy Granular → Unified Looper migration ═══
  // If preset has old granular params but no looper params, map them to the unified engine
  if (('granularEnabled' in state || 'density' in state || 'spray' in state) && !('looperEnabled' in state)) {
    // Map old granular params → Voice 1 of unified looper in legacy mode
    if (state.granularEnabled !== undefined) {
      state.looperEnabled = state.granularEnabled;
    }
    if (state.density !== undefined) {
      state.looperV1Density = state.density;
    }
    if (state.spray !== undefined) {
      // Old spray was 0-600ms, new spray is 0-1 normalized
      state.looperV1Spray = Math.min(1, (state.spray as number) / 600);
    }
    if (state.grainSize !== undefined) {
      state.looperV1GrainSize = state.grainSize;
    }
    if (state.jitter !== undefined) {
      state.looperLegacyJitter = state.jitter;
    }
    if (state.grainProbability !== undefined) {
      state.looperLegacyProbability = state.grainProbability;
    }
    if (state.grainPitchMode !== undefined) {
      state.looperLegacyPitchMode = state.grainPitchMode;
    }
    if (state.pitchSpread !== undefined) {
      state.looperLegacyPitchSpread = state.pitchSpread;
    }
    if (state.maxGrains !== undefined) {
      state.looperLegacyMaxGrains = state.maxGrains;
    }
    if (state.stereoSpread !== undefined) {
      state.looperV1StereoSpread = state.stereoSpread;
    }
    if (state.feedback !== undefined) {
      state.looperLegacyFeedback = Math.min(0.35, state.feedback as number);
    }
    if (state.granularLevel !== undefined) {
      state.looperDryWet = state.granularLevel;
    }
    if (state.granularReverbSend !== undefined) {
      state.looperReverbSend = state.granularReverbSend;
    }
    // Set Voice 1 to legacy mode
    state.looperV1Mode = 'legacy';
    state.looperV1Enabled = true;
    state.looperPreset = 'legacy_cloud';
  }

  return {
    name: preset.name || 'Untitled',
    timestamp: preset.timestamp || new Date().toISOString(),
    state: state as SliderState,
    dualRanges: Object.keys(dualRanges).length > 0 ? dualRanges : undefined,
    sliderModes: Object.keys(sliderModes).length > 0 ? sliderModes : undefined,
  };
}
