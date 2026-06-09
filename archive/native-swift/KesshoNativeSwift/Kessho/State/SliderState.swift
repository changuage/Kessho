import Foundation

/// Native SliderState kept in lockstep with the web app's public state surface.
/// Native-only fields remain explicit so preset and Supabase codecs can bridge
/// them without hiding platform differences.
public struct SliderState: Codable, Equatable {
    public init() {}

    // Master
    var masterVolume: Double = 0.85
    var synthLevel: Double = 0.6
    var granularLevel: Double = 0.4
    var synthReverbSend: Double = 0.7
    var granularReverbSend: Double = 0.8
    var granularDelayASend: Double = 0
    var granularDelayBSend: Double = 0
    var leadReverbSend: Double = 0.5
    var lead2Level: Double = 0.6
    var lead2ReverbSend: Double = 0.5
    var pianoLevel: Double = 0.75
    var pianoReverbSend: Double = 0.35
    var leadDelayReverbSend: Double = 0.4
    var delayAReverbSend: Double = 0.4
    var reverbLevel: Double = 1.0
    var earthLevel: Double = 1.0
    var pad1DelayASend: Double = 0
    var pad1DelayBSend: Double = 0
    var pad2DelayASend: Double = 0
    var pad2DelayBSend: Double = 0
    var lead1DelayASend: Double = 1
    var lead1DelayBSend: Double = 0
    var lead2DelayASend: Double = 1
    var lead2DelayBSend: Double = 0
    var pianoDelayASend: Double = 0
    var pianoDelayBSend: Double = 0
    var drumDelayASend: Double = 1
    var drumDelayBSend: Double = 0

    // Seed
    var seedWindow: String = "hour"  // "hour", "day" (matching web app)
    var randomness: Double = 0.5
    var rngSeed: UInt32 = 0
    var rngState: UInt32 = 0

    // Root Note & CoF Drift
    var rootNote: Int = 4  // 0-11 (C=0, C#=1, ..., B=11), default E=4
    var cofDriftEnabled: Bool = false
    var cofDriftRate: Int = 2
    var cofDriftDirection: String = "cw"  // "cw", "ccw", "random"
    var cofDriftRange: Int = 3
    var cofCurrentStep: Int = 0

    // Harmony
    var scaleMode: String = "auto"  // "auto", "manual"
    var manualScale: String = "Major (Ionian)"
    var tension: Double = 0.3
    var phraseLength: Double = 16
    var transportPrimaryClock: String = "seconds"
    var transportBarsPerPhrase: Int = 4
    var transportBeatsPerBar: Int = 4
    var harmonyClockSource: String = "globalPhrase"
    var sequencerMasterBPM: Double = 120
    var chordRate: Int = 32
    var voicingSpread: Double = 0.5
    var chordProgressionEnabled: Bool = false
    var chordProgressionPattern: [Int] = [0, 3, 4, 0]
    var chordProgressionSteps: Int = 4
    var chordProgressionStepEnabled: [Bool] = [true, true, true, true]
    var chordProgressionPhraseMultiplier: Int = 1
    var chordProgressionClockSource: String = "harmony"
    var journeyEnabled: Bool = false
    var journeyMorphPhase: Double = 0
    var journeyMorphRateBars: Double = 8

    // Synth Oscillator
    var waveSpread: Double = 4.0
    var detune: Double = 8.0
    var synthAttack: Double = 6.0
    var synthDecay: Double = 1.0
    var synthSustain: Double = 0.8
    var synthRelease: Double = 12.0
    var synthVoiceMask: Int = 63  // Bitmask for 6 voices
    var synthOctave: Int = 0

    // Synth Timbre
    var hardness: Double = 0.3
    var oscBrightness: Int = 2  // 0=sine, 1=triangle, 2=saw+tri, 3=sawtooth
    var filterType: String = "lowpass"
    var filterCutoffMin: Double = 400
    var filterCutoffMax: Double = 3000
    var filterModSpeed: Double = 2.0
    var filterResonance: Double = 0.2
    var filterQ: Double = 1.0
    var warmth: Double = 0.4
    var presence: Double = 0.3
    var airNoise: Double = 0.15

    // Reverb
    var reverbEnabled: Bool = true
    var reverbEngine: String = "algorithmic"
    var reverbType: String = "cathedral"
    var reverbQuality: String = "balanced"  // ultra, balanced, lite
    var reverbDecay: Double = 0.9
    var reverbSize: Double = 2.0
    var reverbDiffusion: Double = 1.0
    var reverbModulation: Double = 0.4
    var predelay: Double = 60
    var damping: Double = 0.2
    var width: Double = 0.85
    var reverbShimmer: Double = 0
    var reverbShimmerPitch: Double = 12
    var reverbSlowModRate: Double = 0.05
    var reverbSlowModDepth: Double = 0
    var reverbReverse: Double = 0
    var reverbReverseLength: Double = 2
    var reverbChorusRate: Double = 0.5
    var reverbChorusDepth: Double = 12
    var reverbModCharacter: String = "hybrid"
    var reverbDampLow: Double = 0.1
    var reverbDampHigh: Double = 0.3
    var reverbCrossoverFreq: Double = 800
    var reverbInputTone: Double = 0
    var reverbShimmerFeedback: Double = 0
    var reverbWarp: Double = 0
    var reverbCrossFeed: Double = 0
    var reverbEarlyReflections: Double = 0.3
    var reverbAirAbsorption: Double = 0.2
    var reverbSaturationMode: String = "clean"
    var reverbTransientSmooth: Double = 0
    var reverbErLpFreq: Double = 2500

    // Spectral Freeze
    var spectralFreezeEnabled: Bool = false
    var spectralFreezeActive: Bool = false
    var spectralFreezeSlushy: Bool = false
    var spectralFreezeSpeed: Double = 0.3
    var spectralFreezeMix: Double = 1.0
    var spectralFreezeDecay: Double = 1.0
    var spectralFreezePhaseJitter: Double = 0
    var spectralFreezeRouting: String = "pre"
    var spectralFreezeReverbCrossfade: Double = 1.0

    // Dynamics Character (shared C++ core with web/WASM)
    var dynamicsEnabled: Bool = false
    var dynamicsSaturationEnabled: Bool = false
    var dynamicsSaturationMode: String = "clean"
    var dynamicsSaturationDrive: Double = 0
    var dynamicsSaturationTone: Double = 0.5
    var dynamicsSaturationBias: Double = 0.5
    var characterEnabled: Bool = false
    var characterMode: String = "shallowWater"  // clean, shallowWater, abyssWater
    var characterMix: Double = 0.35
    var characterAge: Double = 0.16
    var characterDepth: Double = 0.72
    var characterRate: Double = 0.12
    var characterDamp: Double = 0.6
    var characterEnvFollow: Double = 0.12
    var characterStereo: Double = 0.72
    var characterResonance: Double = 0.28
    var erosionEnabled: Bool = false
    var erosionMix: Double = 0
    var erosionAge: Double = 0
    var erosionGeneration: Double = 0
    var erosionAlias: Double = 0
    var erosionWow: Double = 0
    var erosionFlutter: Double = 0
    var erosionDrift: Double = 0
    var erosionWobbleSpeed: Double = 0.35
    var erosionTone: Double = 0.5
    var degradeHp: Double = 0
    var degradeLp: Double = 1
    var erosionNoise: Double = 0
    var erosionSaturation: Double = 0
    var erosionCorrosion: Double = 0
    var erosionModSlowWow: Double = 0.18
    var erosionModSlowFlutter: Double = 0.02
    var erosionModSlowLp: Double = 0.12
    var erosionModSlowWet: Double = 0.03
    var erosionModSlowDropout: Double = 0.04
    var erosionModSlowAlias: Double = 0
    var erosionModFlutterWow: Double = 0
    var erosionModFlutterFlutter: Double = 0.12
    var erosionModFlutterLp: Double = 0.02
    var erosionModFlutterWet: Double = 0
    var erosionModFlutterDropout: Double = 0.02
    var erosionModFlutterAlias: Double = 0
    var erosionModRandomWow: Double = 0.04
    var erosionModRandomFlutter: Double = 0.03
    var erosionModRandomLp: Double = 0.14
    var erosionModRandomWet: Double = 0.02
    var erosionModRandomDropout: Double = 0.1
    var erosionModRandomAlias: Double = 0.02
    var erosionModEnvWow: Double = 0
    var erosionModEnvFlutter: Double = 0
    var erosionModEnvLp: Double = 0.08
    var erosionModEnvWet: Double = 0.04
    var erosionModEnvDropout: Double = 0
    var erosionModEnvAlias: Double = 0
    var erosionModNoiseWow: Double = 0
    var erosionModNoiseFlutter: Double = 0.06
    var erosionModNoiseLp: Double = 0.02
    var erosionModNoiseWet: Double = 0
    var erosionModNoiseDropout: Double = 0.06
    var erosionModNoiseAlias: Double = 0.02
    var endCompEnabled: Bool = false
    var endCompThreshold: Double = -18
    var endCompKnee: Double = 12
    var endCompRatio: Double = 2
    var endCompAttackMs: Double = 10
    var endCompReleaseMs: Double = 180
    var endCompMakeup: Double = 1
    var endCompMix: Double = 1
    var endCompDetectorHp: Double = 0.25
    var endCompDetectorTilt: Double = 0.5
    var endCompAutoMakeup: Double = 0.7
    var endCompProgramRelease: Double = 0.65

    // Granular
    var granularEnabled: Bool = true
    var maxGrains: Double = 64
    var grainProbability: Double = 0.8
    var grainSizeMin: Double = 20
    var grainSizeMax: Double = 80
    var density: Double = 25
    var spray: Double = 200
    var jitter: Double = 10
    var grainPitchMode: String = "harmonic"
    var pitchSpread: Double = 3
    var stereoSpread: Double = 0.6
    var feedback: Double = 0.1
    var granularFeedbackLPF: Double = 6000
    var granularFreeze: Bool = false
    var granularBufferSeconds: Double = 4
    var wetHPF: Double = 500
    var wetLPF: Double = 8000

    // Lead Synth
    var leadEnabled: Bool = false
    var leadLevel: Double = 0.4
    var leadAttack: Double = 0.01
    var leadDecay: Double = 0.8
    var leadSustain: Double = 0.3
    var leadHold: Double = 0.5     // How long to hold at sustain level
    var leadRelease: Double = 2.0
    var leadDelayTimeMin: Double = 375   // Delay time in ms (min=max for single mode)
    var leadDelayTimeMax: Double = 375
    var leadDelayFeedbackMin: Double = 0.4
    var leadDelayFeedbackMax: Double = 0.4
    var leadDelayMixMin: Double = 0.35
    var leadDelayMixMax: Double = 0.35
    var leadDensity: Double = 0.5
    var leadOctave: Int = 1
    var leadOctaveRange: Int = 2
    var leadTimbreMin: Double = 0.2
    var leadTimbreMax: Double = 0.6
    var leadVibratoDepthMin: Double = 0  // 0-1, maps to 0-0.5 semitones (min=max for single mode)
    var leadVibratoDepthMax: Double = 0
    var leadVibratoRateMin: Double = 0   // 0-1, maps to 2-8 Hz (min=max for single mode)
    var leadVibratoRateMax: Double = 0
    var leadGlideMin: Double = 0         // 0-1, portamento speed (min=max for single mode)
    var leadGlideMax: Double = 0

    // Lead 2 mirrors the web app's second FM lead, rendered as a separate native voice.
    var lead2Enabled: Bool = false
    var lead2PresetC: String = "soft_rhodes"
    var lead2PresetD: String = "gamelan"
    var lead2Morph: Double = 0
    var lead2MorphAuto: Bool = false
    var lead2MorphSpeed: Double = 8
    var lead2MorphMode: String = "pingpong"
    var lead2AlgorithmMode: String = "snap"
    var lead2UseCustomAdsr: Bool = false
    var lead2Attack: Double = 0.01
    var lead2Decay: Double = 0.8
    var lead2Sustain: Double = 0.3
    var lead2Hold: Double = 0.5
    var lead2Release: Double = 2.0
    var lead2Distance: Double = 0
    var lead2PostLPF: Double = 18000
    var lead2PostLPFKeyTracking: Double = 0
    var lead2StereoWidth: Double = 1
    var lead2DiffuseSend: Double = 0
    var lead2Density: Double = 0.5
    var lead2Octave: Int = 1
    var lead2OctaveRange: Int = 2

    // Piano source
    var pianoEnabled: Bool = false
    var pianoAttack: Double = 0.005
    var pianoDecay: Double = 0.65
    var pianoSustain: Double = 0.72
    var pianoHold: Double = 0.2
    var pianoRelease: Double = 1.4
    var pianoDistance: Double = 0
    var pianoPostLPF: Double = 16000
    var pianoStereoWidth: Double = 0.85
    var pianoDiffuseSend: Double = 0

    // Shared web-style Delay A / Delay B buses.
    var delayAEnabled: Bool = true
    var delayATime: Double = 375
    var delayAFeedback: Double = 0.4
    var delayAMix: Double = 0.35
    var delayASpread: Double = 1.5
    var delayAFilter: Double = 2000
    var delayASend: Double = 0.5
    var delayAToBSend: Double = 0
    var delayAGranularSend: Double = 0
    var delayBGranularSend: Double = 0
    var delayAPingPong: Bool = false
    var delayAModRate: Double = 0
    var delayAModDepth: Double = 0
    var delayADuck: Double = 0
    var delayAFilterType: String = "lowpass"
    var delayAWidth: Double = 0.5
    var delayBPattern: String = "cascade"
    var delayBWarp: String = "clean"
    var delayBWarpIntensity: Double = 0.5
    var delayBSpread: Double = 0.5
    var delayBToASend: Double = 0
    var delayACrossFeedFilter: Double = 1
    var granularDelayEnabled: Bool = false
    var granularDelayActivity: Double = 0.3
    var granularDelayRepeats: Double = 0.3
    var granularDelayTime: String = "1/4"
    var granularDelayFilter: Double = 0.5
    var granularDelayVibrato: Double = 0
    var granularDelayMix: Double = 1.0
    var granularDelayReverbSend: Double = 0.4

    // Euclidean Rhythms
    var synthEuclideanMasterEnabled: Bool = false
    var synthEuclideanTempo: Double = 1.0

    var synthEuclid1Enabled: Bool = true
    var synthEuclid1Preset: String = "lancaran"
    var synthEuclid1Steps: Int = 16
    var synthEuclid1Hits: Int = 4
    var synthEuclid1Rotation: Int = 0
    var synthEuclid1NoteMin: Int = 64
    var synthEuclid1NoteMax: Int = 76
    var synthEuclid1Level: Double = 0.8

    var synthEuclid2Enabled: Bool = false
    var synthEuclid2Preset: String = "kotekan"
    var synthEuclid2Steps: Int = 8
    var synthEuclid2Hits: Int = 3
    var synthEuclid2Rotation: Int = 1
    var synthEuclid2NoteMin: Int = 76
    var synthEuclid2NoteMax: Int = 88
    var synthEuclid2Level: Double = 0.6

    var synthEuclid3Enabled: Bool = false
    var synthEuclid3Preset: String = "ketawang"
    var synthEuclid3Steps: Int = 16
    var synthEuclid3Hits: Int = 2
    var synthEuclid3Rotation: Int = 0
    var synthEuclid3NoteMin: Int = 52
    var synthEuclid3NoteMax: Int = 64
    var synthEuclid3Level: Double = 0.9

    var synthEuclid4Enabled: Bool = false
    var synthEuclid4Preset: String = "srepegan"
    var synthEuclid4Steps: Int = 16
    var synthEuclid4Hits: Int = 6
    var synthEuclid4Rotation: Int = 2
    var synthEuclid4NoteMin: Int = 88
    var synthEuclid4NoteMax: Int = 96
    var synthEuclid4Level: Double = 0.5

    // Euclidean Probability & Source (per lane)
    var synthEuclid1Probability: Double = 1.0
    var synthEuclid1Source: String = "lead"  // "lead", "lead1", "lead2", "piano", "synth1"..."synth6"
    var synthEuclid2Probability: Double = 1.0
    var synthEuclid2Source: String = "lead"
    var synthEuclid3Probability: Double = 1.0
    var synthEuclid3Source: String = "lead"
    var synthEuclid4Probability: Double = 1.0
    var synthEuclid4Source: String = "lead"

    // Synth Chord Sequencer Toggle
    var synthChordSequencerEnabled: Bool = true

    // ─── Ikeda-Style Drum Synth ───
    var drumEnabled: Bool = false
    var drumLevel: Double = 0.7
    var drumReverbSend: Double = 0.06

    // ─── Drum Stereo Ping-Pong Delay ───
    var drumDelayEnabled: Bool = false
    var drumDelayNoteL: String = "1/8d"       // Note division for left: 1/4, 1/8, 1/8d, 1/16, etc.
    var drumDelayNoteR: String = "1/4"        // Note division for right
    var drumDelayFeedback: Double = 0.4       // 0..0.95 feedback amount
    var drumDelayMix: Double = 0.3            // 0..1 wet/dry mix
    var drumDelayFilter: Double = 0.5         // 0..1 lowpass (0=dark, 1=bright)
    // Per-voice delay sends
    var drumSubDelaySend: Double = 0.0
    var drumKickDelaySend: Double = 0.2
    var drumClickDelaySend: Double = 0.5
    var drumBeepHiDelaySend: Double = 0.6
    var drumBeepLoDelaySend: Double = 0.4
    var drumNoiseDelaySend: Double = 0.7

    // Voice 1: Sub (deep sine pulse)
    var drumSubFreq: Double = 50
    var drumSubDecay: Double = 150
    var drumSubLevel: Double = 0.8
    var drumSubTone: Double = 0.1
    var drumSubShape: Double = 0            // 0..1 (0=sine, 0.5=triangle, 1=saw)
    var drumSubPitchEnv: Double = 0         // -48..+48 semitones pitch sweep
    var drumSubPitchDecay: Double = 50      // 5..500 ms pitch envelope decay
    var drumSubDrive: Double = 0            // 0..1 soft saturation
    var drumSubSub: Double = 0              // 0..1 sub-octave mix

    // Voice 2: Kick (sine with pitch sweep)
    var drumKickFreq: Double = 55
    var drumKickPitchEnv: Double = 24
    var drumKickPitchDecay: Double = 30
    var drumKickDecay: Double = 200
    var drumKickLevel: Double = 0.7
    var drumKickClick: Double = 0.3
    var drumKickBody: Double = 0.3          // 0..1 (0=tight, 1=boomy)
    var drumKickPunch: Double = 0.8         // 0..1 transient sharpness
    var drumKickTail: Double = 0            // 0..1 reverberant tail
    var drumKickTone: Double = 0            // 0..1 harmonic content

    // Voice 3: Click (the signature Ikeda "data" sound)
    var drumClickDecay: Double = 5
    var drumClickFilter: Double = 4000
    var drumClickTone: Double = 0.3
    var drumClickLevel: Double = 0.6
    var drumClickResonance: Double = 0.4
    var drumClickPitch: Double = 2000       // 200..8000 Hz tonal mode pitch
    var drumClickPitchEnv: Double = 0       // -48..+48 semitones pitch sweep
    var drumClickMode: String = "impulse"   // impulse, noise, tonal, granular
    var drumClickGrainCount: Int = 1        // 1..8 micro-grains per trigger
    var drumClickGrainSpread: Double = 0    // 0..50 ms grain timing spread
    var drumClickStereoWidth: Double = 0    // 0..1 stereo spread

    // Voice 4: Beep Hi (high pitched notification ping)
    var drumBeepHiFreq: Double = 4000
    var drumBeepHiAttack: Double = 1
    var drumBeepHiDecay: Double = 80
    var drumBeepHiLevel: Double = 0.5
    var drumBeepHiTone: Double = 0.2
    var drumBeepHiInharmonic: Double = 0    // 0..1 inharmonic partial detune
    var drumBeepHiPartials: Int = 1         // 1..6 number of partials
    var drumBeepHiShimmer: Double = 0       // 0..1 vibrato/chorus amount
    var drumBeepHiShimmerRate: Double = 4   // 0.5..12 Hz shimmer LFO rate
    var drumBeepHiBrightness: Double = 0.5  // 0..1 spectral tilt

    // Voice 5: Beep Lo (lower blip, Morse-code feel)
    var drumBeepLoFreq: Double = 400
    var drumBeepLoAttack: Double = 2
    var drumBeepLoDecay: Double = 100
    var drumBeepLoLevel: Double = 0.5
    var drumBeepLoTone: Double = 0.1
    var drumBeepLoPitchEnv: Double = 0      // -48..+48 semitones (neg=rise for droplet)
    var drumBeepLoPitchDecay: Double = 50   // 5..500 ms pitch env decay
    var drumBeepLoBody: Double = 0.3        // 0..1 resonance/body warmth
    var drumBeepLoPluck: Double = 0         // 0..1 Karplus-Strong pluck amount
    var drumBeepLoPluckDamp: Double = 0.5   // 0..1 pluck damping (0=bright, 1=muted)

    // Voice 6: Noise (hi-hat/texture)
    var drumNoiseFilterFreq: Double = 8000
    var drumNoiseFilterQ: Double = 1
    var drumNoiseFilterType: String = "highpass"
    var drumNoiseDecay: Double = 30
    var drumNoiseLevel: Double = 0.4
    var drumNoiseAttack: Double = 0
    var drumNoiseFormant: Double = 0        // 0..1 vowel formant morph
    var drumNoiseBreath: Double = 0         // 0..1 breathiness/air
    var drumNoiseFilterEnv: Double = 0      // -1..+1 filter envelope direction
    var drumNoiseFilterEnvDecay: Double = 100  // 5..2000 ms filter env decay
    var drumNoiseDensity: Double = 1        // 0..1 (0=sparse dust, 1=dense)
    var drumNoiseColorLFO: Double = 0       // 0..10 Hz filter modulation rate

    // Per-trigger morph update option
    var drumRandomMorphUpdate: Bool = false  // Update sliders on random morph trigger

    // ─── Drum Voice Morph System ───
    // Sub morph
    var drumSubPresetA: String = "Classic Sub"
    var drumSubPresetB: String = "Deep Thump"
    var drumSubMorph: Double = 0
    var drumSubMorphAuto: Bool = false
    var drumSubMorphSpeed: Double = 8
    var drumSubMorphMode: String = "linear"  // linear, pingpong, random

    // Kick morph
    var drumKickPresetA: String = "Ikeda Kick"
    var drumKickPresetB: String = "Ambient Boom"
    var drumKickMorph: Double = 0
    var drumKickMorphAuto: Bool = false
    var drumKickMorphSpeed: Double = 8
    var drumKickMorphMode: String = "linear"

    // Click morph
    var drumClickPresetA: String = "Data Point"
    var drumClickPresetB: String = "Crinkle"
    var drumClickMorph: Double = 0
    var drumClickMorphAuto: Bool = false
    var drumClickMorphSpeed: Double = 8
    var drumClickMorphMode: String = "linear"

    // BeepHi morph
    var drumBeepHiPresetA: String = "Data Ping"
    var drumBeepHiPresetB: String = "Glass"
    var drumBeepHiMorph: Double = 0
    var drumBeepHiMorphAuto: Bool = false
    var drumBeepHiMorphSpeed: Double = 8
    var drumBeepHiMorphMode: String = "linear"

    // BeepLo morph
    var drumBeepLoPresetA: String = "Blip"
    var drumBeepLoPresetB: String = "Droplet"
    var drumBeepLoMorph: Double = 0
    var drumBeepLoMorphAuto: Bool = false
    var drumBeepLoMorphSpeed: Double = 8
    var drumBeepLoMorphMode: String = "linear"

    // Noise morph
    var drumNoisePresetA: String = "Hi-Hat"
    var drumNoisePresetB: String = "Breath"
    var drumNoiseMorph: Double = 0
    var drumNoiseMorphAuto: Bool = false
    var drumNoiseMorphSpeed: Double = 8
    var drumNoiseMorphMode: String = "linear"

    // Random trigger mode
    var drumRandomEnabled: Bool = false
    var drumRandomDensity: Double = 0.3
    var drumRandomSubProb: Double = 0.1
    var drumRandomKickProb: Double = 0.15
    var drumRandomClickProb: Double = 0.4
    var drumRandomBeepHiProb: Double = 0.2
    var drumRandomBeepLoProb: Double = 0.15
    var drumRandomNoiseProb: Double = 0.25
    var drumRandomMinInterval: Double = 80
    var drumRandomMaxInterval: Double = 400

    // Euclidean sequencer (4 lanes)
    var drumEuclidMasterEnabled: Bool = false
    var drumEuclidBaseBPM: Double = 120
    var drumEuclidTempo: Double = 1
    var drumEuclidSwing: Double = 0
    var drumEuclidDivision: Int = 16

    // Lane 1 - Click pattern (primary rhythm)
    var drumEuclid1Enabled: Bool = true
    var drumEuclid1Preset: String = "lancaran"
    var drumEuclid1Steps: Int = 16
    var drumEuclid1Hits: Int = 5
    var drumEuclid1Rotation: Int = 0
    var drumEuclid1TargetSub: Bool = false
    var drumEuclid1TargetKick: Bool = false
    var drumEuclid1TargetClick: Bool = true
    var drumEuclid1TargetBeepHi: Bool = false
    var drumEuclid1TargetBeepLo: Bool = false
    var drumEuclid1TargetNoise: Bool = false
    var drumEuclid1Probability: Double = 1.0
    var drumEuclid1VelocityMin: Double = 0.8
    var drumEuclid1VelocityMax: Double = 0.8
    var drumEuclid1Level: Double = 0.8

    // Lane 2 - Sub pattern (bass pulse)
    var drumEuclid2Enabled: Bool = true
    var drumEuclid2Preset: String = "gangsaran"
    var drumEuclid2Steps: Int = 16
    var drumEuclid2Hits: Int = 4
    var drumEuclid2Rotation: Int = 0
    var drumEuclid2TargetSub: Bool = true
    var drumEuclid2TargetKick: Bool = false
    var drumEuclid2TargetClick: Bool = false
    var drumEuclid2TargetBeepHi: Bool = false
    var drumEuclid2TargetBeepLo: Bool = false
    var drumEuclid2TargetNoise: Bool = false
    var drumEuclid2Probability: Double = 1.0
    var drumEuclid2VelocityMin: Double = 0.8
    var drumEuclid2VelocityMax: Double = 0.8
    var drumEuclid2Level: Double = 0.9

    // Lane 3 - Beep Hi (sparse accents)
    var drumEuclid3Enabled: Bool = false
    var drumEuclid3Preset: String = "sparse"
    var drumEuclid3Steps: Int = 8
    var drumEuclid3Hits: Int = 2
    var drumEuclid3Rotation: Int = 1
    var drumEuclid3TargetSub: Bool = false
    var drumEuclid3TargetKick: Bool = false
    var drumEuclid3TargetClick: Bool = false
    var drumEuclid3TargetBeepHi: Bool = true
    var drumEuclid3TargetBeepLo: Bool = false
    var drumEuclid3TargetNoise: Bool = false
    var drumEuclid3Probability: Double = 0.8
    var drumEuclid3VelocityMin: Double = 0.8
    var drumEuclid3VelocityMax: Double = 0.8
    var drumEuclid3Level: Double = 0.6

    // Lane 4 - Noise (hi-hat texture)
    var drumEuclid4Enabled: Bool = false
    var drumEuclid4Preset: String = "dense"
    var drumEuclid4Steps: Int = 16
    var drumEuclid4Hits: Int = 8
    var drumEuclid4Rotation: Int = 0
    var drumEuclid4TargetSub: Bool = false
    var drumEuclid4TargetKick: Bool = false
    var drumEuclid4TargetClick: Bool = false
    var drumEuclid4TargetBeepHi: Bool = false
    var drumEuclid4TargetBeepLo: Bool = false
    var drumEuclid4TargetNoise: Bool = true
    var drumEuclid4Probability: Double = 0.7
    var drumEuclid4VelocityMin: Double = 0.8
    var drumEuclid4VelocityMax: Double = 0.8
    var drumEuclid4Level: Double = 0.5

    // Ocean
    var oceanSampleEnabled: Bool = false
    var oceanSampleLevel: Double = 0.5
    var oceanReverbSend: Double = 0.2
    var oceanDelayASend: Double = 0
    var oceanDelayBSend: Double = 0
    var oceanSliceDuration: Double = 22
    var oceanSliceDensity: Double = 0.38
    var oceanWaveSynthEnabled: Bool = false
    var oceanWaveSynthLevel: Double = 0.4
    var oceanFilterType: String = "lowpass"
    var oceanFilterCutoff: Double = 8000
    var oceanFilterResonance: Double = 0.1
    var oceanDurationMin: Double = 4
    var oceanDurationMax: Double = 10
    var oceanIntervalMin: Double = 5
    var oceanIntervalMax: Double = 12
    var oceanFoamMin: Double = 0.2
    var oceanFoamMax: Double = 0.5
    var oceanDepthMin: Double = 0.3
    var oceanDepthMax: Double = 0.7

    // Lightweight native Earth approximations for web soundscape fields.
    var birdsEnabled: Bool = false
    var birdsLevel: Double = 0.6
    var birdsReverbSend: Double = 0.15
    var birdsDelayASend: Double = 0
    var birdsDelayBSend: Double = 0
    var birdsSliceDuration: Double = 20
    var birdsSliceDensity: Double = 0.45
    var birds2Enabled: Bool = false
    var birds2Level: Double = 0.52
    var birds2ReverbSend: Double = 0.16
    var birds2DelayASend: Double = 0
    var birds2DelayBSend: Double = 0
    var birds2SliceDuration: Double = 20
    var birds2SliceDensity: Double = 0.48
    var frogsEnabled: Bool = false
    var frogsLevel: Double = 0.5
    var frogsReverbSend: Double = 0.2
    var frogsDelayASend: Double = 0
    var frogsDelayBSend: Double = 0
    var frogsSliceDuration: Double = 18
    var frogsSliceDensity: Double = 0.52
    var natureLevel: Double = 1.0
    var natureReverbSend: Double = 0.18
    var natureDelayASend: Double = 0
    var natureDelayBSend: Double = 0

    var waterEnabled: Bool = false
    var waterPreset: Int = 1
    var waterMorphA: Int = 0
    var waterMorphB: Int = 2
    var waterMorph: Double = 0
    var waterIntensity: Double = 0.7
    var waterDistance: Double = 0.3
    var waterBaseFreq: Double = 2300
    var waterDropSize: Double = 0.5
    var waterHardness: Double = 0.5
    var waterGlassThickness: Double = 0.5
    var waterReverbSend: Double = 0.3
    var waterDelayASend: Double = 0
    var waterDelayBSend: Double = 0
    var waterLevel: Double = 0.8
    var waterLayerHardDrops: Double = 0.08
    var waterLayerWaterDrops: Double = 0.82
    var waterLayerTurbulence: Double = 0.56
    var waterLayerBubbling: Double = 0.92
    var waterLayerSurf: Double = 0
    var waterLayerChannels: Double = 0
    var waterHardDropBaseFreq: Double = 2300
    var waterHardDropRate: Double = 1.0
    var waterHardDropLPF: Double = 12000
    var waterHardDropTone: Double = 1.0
    var waterWaterDropBaseFreq: Double = 2300
    var waterWaterDropRate: Double = 1.0
    var waterWaterDropLPF: Double = 16000
    var waterBubblingRate: Double = 1.0
    var waterBubblingLPF: Double = 1500
    var waterSurfDuration: Double = 8.0
    var waterSurfInterval: Double = 9.5
    var waterSurfFoam: Double = 0.35
    var waterSurfFoamBright: Double = 0.4
    var waterSurfProximity: Double = 0.7
    var waterSurfDepth: Double = 0.5
    var waterSurfBody: Double = 300
    var waterSurfSpray: Double = 4000
    var waterDensityHardSend: Double = 0.28
    var waterDensityWaterSend: Double = 0.46
    var waterDensityBubbleSend: Double = 0.62
    var waterDensityFeedback: Double = 0.74
    var waterDensityTone: Double = 900
    var waterDensityRing: Double = 1.0
    var waterDensityWet: Double = 0.48
    var waterChannelsMorph: Double = 0
    var waterChannelsSpeed: Double = 0.5

    var insectsEnabled: Bool = false
    var insectsEngine: Int = 0
    var insectsDensity: Double = 0.5
    var insectsTemperature: Double = 0.5
    var insectsDistance: Double = 0.3
    var insectsProximity: Double = 0.5
    var insectsAntiphony: Double = 0.3
    var insectsClickRate: Double = 0.3
    var insectsMotion: Double = 0.5
    var insectsLevel: Double = 0.7
    var insectsSharedLevel: Double = 1.0
    var insectsReverbSend: Double = 0.15
    var insDelayASend: Double = 0
    var insDelayBSend: Double = 0
    var insects2Enabled: Bool = false
    var insects2Engine: Int = 1
    var insects2Density: Double = 0.5
    var insects2Temperature: Double = 0.5
    var insects2Distance: Double = 0.3
    var insects2Proximity: Double = 0.5
    var insects2Antiphony: Double = 0.3
    var insects2ClickRate: Double = 0.3
    var insects2Motion: Double = 0.5
    var insects2Level: Double = 0.5

    var granularPad1Send: Double = 1.0
    var granularPad2Send: Double = 0
    var granularLead1Send: Double = 0
    var granularLead2Send: Double = 0
    var granularPianoSend: Double = 0
    var granularDrumSend: Double = 0
    var granularWavesSend: Double = 0
    var granularNatureSend: Double = 0
    var granularWaterSend: Double = 0
    var granularInsectsSend: Double = 0

    // Web app compatibility surface. These fields preserve current web preset/state payloads even
    // where the native renderer still maps them onto an existing Swift DSP approximation.
    var pad2Level: Double = 0.6
    var pad1ReverbSend: Double = 0.7
    var pad2ReverbSend: Double = 0.7
    var masterSatDrive: Double = 0
    var masterSatMode: String = "clean"
    var masterSatTone: Double = 0.5
    var sidechainEnabled: Bool = false
    var sidechainKeyA: String = "kick"
    var sidechainKeyB: String = "off"
    var sidechainKeyAWeight: Double = 1
    var sidechainKeyBWeight: Double = 0.7
    var sidechainAmount: Double = 0.5
    var sidechainThreshold: Double = -24
    var sidechainRatio: Double = 4
    var sidechainKnee: Double = 6
    var sidechainAttackMs: Double = 5
    var sidechainHoldMs: Double = 20
    var sidechainReleaseMs: Double = 180
    var sidechainMakeup: Double = 1
    var sidechainMix: Double = 1
    var sidechainCurve: Double = 0.5
    var sidechainDetectorHp: Double = 0
    var sidechainDetectorLp: Double = 1
    var sidechainPad1Target: Double = 0
    var sidechainPad2Target: Double = 0
    var sidechainLead1Target: Double = 0
    var sidechainLead2Target: Double = 0
    var sidechainPianoTarget: Double = 0
    var sidechainGranularTarget: Double = 0
    var sidechainDelayATarget: Double = 0
    var sidechainDelayBTarget: Double = 0
    var sidechainReverbTarget: Double = 0
    var characterWow: Double = 0
    var characterFlutter: Double = 0
    var characterDrift: Double = 0
    var characterTone: Double = 0.5
    var characterHp: Double = 0
    var characterLp: Double = 1
    var characterNoise: Double = 0
    var characterSaturation: Double = 0
    var characterCorrosion: Double = 0
    var chordProgressionHits: Double = 4
    var chordProgressionRotation: Double = 0
    var padTensionMode: String = "follow"
    var padTensionValue: Double = 0
    var leadTensionMode: String = "follow"
    var leadTensionValue: Double = 0
    var synthEuclidTensionMode: String = "follow"
    var synthEuclidTensionValue: Double = 0
    var granularTensionMode: String = "bypass"
    var granularTensionValue: Double = 0
    var reverbTensionMode: String = "bypass"
    var reverbTensionValue: Double = 0
    var drumTensionMode: String = "bypass"
    var drumTensionValue: Double = 0
    var harmonySyncPolicy: String = "nextPhrase"
    var leadRandomClockSource: String = "globalPhrase"
    var leadRandomSyncPolicy: String = "nextPhrase"
    var synthEuclidClockSource: String = "localBeat"
    var synthEuclidJoinPolicy: String = "bar"
    var drumEuclidClockSource: String = "localBeat"
    var drumEuclidJoinPolicy: String = "bar"
    var randomWalkMode: String = "localBrownian"
    var filterSlope: Double = 12
    var filterKeyTracking: Double = 0
    var padFoldAmount: Double = 0
    var padFoldMode: Double = 0
    var padPresetA: String = "init"
    var padPresetB: String = "init"
    var padMorph: Double = 0
    var padOscAWave: String = "sawtooth"
    var padOscAOctave: Double = 0
    var padOscADetune: Double = 0
    var padOscALevel: Double = 0.6
    var padOscBWave: String = "triangle"
    var padOscBOctave: Double = 0
    var padOscBDetune: Double = 8
    var padOscBLevel: Double = 0.4
    var padSubEnabled: Bool = false
    var padSubOctave: Double = -1
    var padSubWave: String = "sine"
    var padSubLevel: Double = 0.3
    var padNoiseType: String = "white"
    var padNoiseLevel: Double = 0.15
    var padFilterBEnabled: Bool = false
    var padFilterBType: String = "highpass"
    var padFilterBCutoff: Double = 200
    var padFilterBResonance: Double = 0.2
    var padFilterBQ: Double = 1
    var padFilterRouting: String = "series"
    var padLfo1Rate: Double = 0.5
    var padLfo1Depth: Double = 0
    var padLfo1Wave: String = "sine"
    var padLfo1Dest: String = "none"
    var padLfo2Rate: Double = 0.5
    var padLfo2Depth: Double = 0
    var padLfo2Wave: String = "sine"
    var padLfo2Dest: String = "none"
    var padModEnvEnabled: Bool = false
    var padModEnvAttack: Double = 0.5
    var padModEnvDecay: Double = 2
    var padModEnvSustain: Double = 0
    var padModEnvRelease: Double = 4
    var padModEnvDepth: Double = 0.5
    var padModEnvDest: String = "filterCutoff"
    var padMorphAuto: Bool = false
    var padMorphSpeed: Double = 8
    var padOscMix: Double = 0.5
    var padDistance: Double = 0
    var padPostLPF: Double = 18000
    var padStereoWidth: Double = 1
    var padDiffuseSend: Double = 0
    var pad2Enabled: Bool = false
    var pad2VoiceAssign: Double = 0
    var pad2Attack: Double = 6.0
    var pad2Decay: Double = 1.0
    var pad2Sustain: Double = 0.8
    var pad2Release: Double = 12.0
    var pad2Octave: Double = 0
    var pad2Hardness: Double = 0.3
    var pad2Warmth: Double = 0.4
    var pad2Presence: Double = 0.3
    var pad2FoldAmount: Double = 0
    var pad2FoldMode: Double = 0
    var pad2OscMix: Double = 0.5
    var pad2FilterType: String = "lowpass"
    var pad2FilterCutoffMin: Double = 400
    var pad2FilterCutoffMax: Double = 3000
    var pad2FilterResonance: Double = 0.2
    var pad2FilterQ: Double = 1.0
    var pad2FilterSlope: Double = 12
    var pad2FilterKeyTracking: Double = 0
    var pad2OscAWave: String = "sawtooth"
    var pad2OscAOctave: Double = 0
    var pad2OscADetune: Double = 0
    var pad2OscALevel: Double = 0.6
    var pad2OscBWave: String = "triangle"
    var pad2OscBOctave: Double = 0
    var pad2OscBDetune: Double = 8
    var pad2OscBLevel: Double = 0.4
    var pad2SubEnabled: Bool = false
    var pad2SubOctave: Double = -1
    var pad2SubWave: String = "sine"
    var pad2SubLevel: Double = 0.3
    var pad2NoiseType: String = "white"
    var pad2NoiseLevel: Double = 0.15
    var pad2FilterBEnabled: Bool = false
    var pad2FilterBType: String = "highpass"
    var pad2FilterBCutoff: Double = 200
    var pad2FilterBResonance: Double = 0.2
    var pad2FilterBQ: Double = 1
    var pad2FilterRouting: String = "series"
    var pad2Lfo1Rate: Double = 0.5
    var pad2Lfo1Depth: Double = 0
    var pad2Lfo1Wave: String = "sine"
    var pad2Lfo1Dest: String = "none"
    var pad2Lfo2Rate: Double = 0.5
    var pad2Lfo2Depth: Double = 0
    var pad2Lfo2Wave: String = "sine"
    var pad2Lfo2Dest: String = "none"
    var pad2ModEnvEnabled: Bool = false
    var pad2ModEnvAttack: Double = 0.5
    var pad2ModEnvDecay: Double = 2
    var pad2ModEnvSustain: Double = 0
    var pad2ModEnvRelease: Double = 4
    var pad2ModEnvDepth: Double = 0.5
    var pad2ModEnvDest: String = "filterCutoff"
    var pad2PresetA: String = "init"
    var pad2PresetB: String = "init"
    var pad2Morph: Double = 0
    var pad2MorphAuto: Bool = false
    var pad2MorphSpeed: Double = 8
    var pad2Distance: Double = 0
    var pad2PostLPF: Double = 18000
    var pad2StereoWidth: Double = 1
    var pad2DiffuseSend: Double = 0
    var reverbPreCompThreshold: Double = -18
    var reverbPreCompKnee: Double = 12
    var reverbPreCompRatio: Double = 2
    var reverbPreCompAttackMs: Double = 10
    var reverbPreCompReleaseMs: Double = 160
    var reverbPreCompMakeup: Double = 1
    var reverbScaleShimmer: Bool = false
    var reverbChordWash: Bool = false
    var reverbResolutionBloom: Bool = false
    var grainSize: Double = 50
    var padEnabled: Bool = true
    var leadRandomEnabled: Bool = false
    var leadRandomSource: String = "lead1"
    var lead1UseCustomAdsr: Bool = false
    var lead1Attack: Double = 0.01
    var lead1Decay: Double = 0.8
    var lead1Sustain: Double = 0.3
    var lead1Hold: Double = 0.5
    var lead1Release: Double = 2.0
    var lead1Density: Double = 0.5
    var lead1Octave: Double = 1
    var lead1OctaveRange: Double = 2
    var leadTimbre: Double = 0.4
    var lead1PresetA: String = "soft_rhodes"
    var lead1PresetB: String = "gamelan"
    var lead1Morph: Double = 0
    var lead1MorphAuto: Bool = false
    var lead1MorphSpeed: Double = 8
    var lead1MorphMode: String = "pingpong"
    var lead1AlgorithmMode: String = "snap"
    var lead1Level: Double = 0.8
    var lead1ReverbSend: Double = 0.5
    var lead1Distance: Double = 0
    var lead1PostLPF: Double = 18000
    var lead1PostLPFKeyTracking: Double = 0
    var lead1StereoWidth: Double = 1
    var lead1DiffuseSend: Double = 0
    var synthEuclidBaseBPM: Double = 120
    var drumSubAttack: Double = 0
    var drumSubVariation: Double = 0
    var drumSubDistance: Double = 0.5
    var drumKickAttack: Double = 0
    var drumKickVariation: Double = 0
    var drumKickDistance: Double = 0.5
    var drumClickExciterColor: Double = 0
    var drumClickAttack: Double = 0
    var drumClickVariation: Double = 0
    var drumClickDistance: Double = 0.5
    var drumBeepHiFeedback: Double = 0
    var drumBeepHiModEnvDecay: Double = 0
    var drumBeepHiNoiseInMod: Double = 0
    var drumBeepHiModRatio: Double = 2
    var drumBeepHiModRatioFine: Double = 0.01
    var drumBeepHiModPhase: Double = 0
    var drumBeepHiModEnvEnd: Double = 0.2
    var drumBeepHiNoiseDecay: Double = 0
    var drumBeepHiVariation: Double = 0
    var drumBeepHiDistance: Double = 0.5
    var drumBeepLoModal: Double = 0
    var drumBeepLoModalQ: Double = 10
    var drumBeepLoModalInharmonic: Double = 0
    var drumBeepLoModalSpread: Double = 0
    var drumBeepLoModalCut: Double = 0
    var drumBeepLoOscGain: Double = 1
    var drumBeepLoModalGain: Double = 1
    var drumBeepLoVariation: Double = 0
    var drumBeepLoDistance: Double = 0.5
    var drumNoiseParticleSize: Double = 5
    var drumNoiseParticleRandom: Double = 0
    var drumNoiseParticleRandomRate: Double = 0.5
    var drumNoiseRatchetCount: Double = 0
    var drumNoiseRatchetTime: Double = 30
    var drumNoiseVariation: Double = 0
    var drumNoiseDistance: Double = 0.5
    var drumMembraneExciter: String = "impulse"
    var drumMembraneExcPos: Double = 0.3
    var drumMembraneExcBright: Double = 0.5
    var drumMembraneExcDur: Double = 3
    var drumMembraneSize: Double = 180
    var drumMembraneStiffness: Double = 0.5
    var drumMembraneDamping: Double = 0.3
    var drumMembraneMaterial: String = "skin"
    var drumMembraneNonlin: Double = 0
    var drumMembraneWireMix: Double = 0
    var drumMembraneWireDensity: Double = 0.5
    var drumMembraneWireTone: Double = 0.5
    var drumMembraneWireDecay: Double = 0.5
    var drumMembraneBody: Double = 0.5
    var drumMembraneRing: Double = 0.2
    var drumMembraneOvertones: Double = 4
    var drumMembranePitchEnv: Double = 3
    var drumMembranePitchDecay: Double = 40
    var drumMembraneAttack: Double = 0
    var drumMembraneDecay: Double = 250
    var drumMembraneLevel: Double = 0.6
    var drumMembraneVariation: Double = 0
    var drumMembraneDistance: Double = 0.5
    var drumMembraneScaleBlend: Double = 0.3
    var drumMorphSliderAnimate: Bool = false
    var drumMembranePresetA: String = "Snare Classic"
    var drumMembranePresetB: String = "Snare Classic"
    var drumMembraneMorph: Double = 0
    var drumMembraneMorphAuto: Bool = false
    var drumMembraneMorphSpeed: Double = 4
    var drumMembraneMorphMode: String = "pingpong"
    var drumMembraneDelaySend: Double = 0.2
    var drumEuclid1TargetMembrane: Bool = false
    var drumEuclid2TargetMembrane: Bool = false
    var drumEuclid3TargetMembrane: Bool = false
    var drumEuclid4TargetMembrane: Bool = false
    var granularFeedback: Double = 0.1
    var granularPreset: String = "init"
    var granularSpaceMode: String = "clocked"
    var granularPresetBehavior: String = "expressive"
    var delayBGranularLinked: Bool = true
    var granularShape: String = "triangle"
    var granularDiffusion: Double = 0.5
    var granularReverbLPF: Double = 4000
    var granularOutputLPF: Double = 12000
    var granularV1Enabled: Bool = true
    var granularV1Mode: String = "granular"
    var granularV1Slice: Double = 0
    var granularV1Speed: Double = 1
    var granularV1ScanRate: Double = 1
    var granularV1Reverse: Bool = false
    var granularV1Pitch: Double = 0
    var granularV1Attack: Double = 0.003
    var granularV1Decay: Double = 0.5
    var granularV1Blur: Double = 0
    var granularV1GrainOct: Double = 0
    var granularV1Spray: Double = 0.3
    var granularV1Density: Double = 20
    var granularV1TempoSync: Bool = false
    var granularV1TempoDiv: String = "1/8"
    var granularV1GrainSize: Double = 80
    var granularV1Pan: Double = 0
    var granularV1Gain: Double = 0.5
    var granularV1PosLFORate: Double = 0
    var granularV1PosLFODepth: Double = 0
    var granularV1PanLFORate: Double = 0
    var granularV1StereoSpread: Double = 0.5
    var granularV1ReverseLFORate: Double = 0
    var granularV1WriteFollow: Double = 0
    var granularV1RecordLFORate: Double = 0
    var granularV2Enabled: Bool = false
    var granularV2Mode: String = "granular"
    var granularV2Slice: Double = 4
    var granularV2Speed: Double = 1
    var granularV2ScanRate: Double = 1
    var granularV2Reverse: Bool = false
    var granularV2Pitch: Double = 0
    var granularV2Attack: Double = 0.003
    var granularV2Decay: Double = 0.5
    var granularV2Blur: Double = 0
    var granularV2GrainOct: Double = 0
    var granularV2Spray: Double = 0.3
    var granularV2Density: Double = 20
    var granularV2TempoSync: Bool = false
    var granularV2TempoDiv: String = "1/8"
    var granularV2GrainSize: Double = 80
    var granularV2Pan: Double = 0
    var granularV2Gain: Double = 0.5
    var granularV2PosLFORate: Double = 0
    var granularV2PosLFODepth: Double = 0
    var granularV2PanLFORate: Double = 0
    var granularV2StereoSpread: Double = 0.5
    var granularV2ReverseLFORate: Double = 0
    var granularV2WriteFollow: Double = 0
    var granularV2RecordLFORate: Double = 0
    var granularV3Enabled: Bool = false
    var granularV3Mode: String = "granular"
    var granularV3Slice: Double = 8
    var granularV3Speed: Double = 1
    var granularV3ScanRate: Double = 1
    var granularV3Reverse: Bool = false
    var granularV3Pitch: Double = 0
    var granularV3Attack: Double = 0.003
    var granularV3Decay: Double = 0.5
    var granularV3Blur: Double = 0
    var granularV3GrainOct: Double = 0
    var granularV3Spray: Double = 0.3
    var granularV3Density: Double = 20
    var granularV3TempoSync: Bool = false
    var granularV3TempoDiv: String = "1/8"
    var granularV3GrainSize: Double = 80
    var granularV3Pan: Double = 0
    var granularV3Gain: Double = 0.5
    var granularV3PosLFORate: Double = 0
    var granularV3PosLFODepth: Double = 0
    var granularV3PanLFORate: Double = 0
    var granularV3StereoSpread: Double = 0.5
    var granularV3ReverseLFORate: Double = 0
    var granularV3WriteFollow: Double = 0
    var granularV3RecordLFORate: Double = 0
    var granularV4Enabled: Bool = false
    var granularV4Mode: String = "granular"
    var granularV4Slice: Double = 12
    var granularV4Speed: Double = 1
    var granularV4ScanRate: Double = 1
    var granularV4Reverse: Bool = false
    var granularV4Pitch: Double = 0
    var granularV4Attack: Double = 0.003
    var granularV4Decay: Double = 0.5
    var granularV4Blur: Double = 0
    var granularV4GrainOct: Double = 0
    var granularV4Spray: Double = 0.3
    var granularV4Density: Double = 20
    var granularV4TempoSync: Bool = false
    var granularV4TempoDiv: String = "1/8"
    var granularV4GrainSize: Double = 80
    var granularV4Pan: Double = 0
    var granularV4Gain: Double = 0.5
    var granularV4PosLFORate: Double = 0
    var granularV4PosLFODepth: Double = 0
    var granularV4PanLFORate: Double = 0
    var granularV4StereoSpread: Double = 0.5
    var granularV4ReverseLFORate: Double = 0
    var granularV4WriteFollow: Double = 0
    var granularV4RecordLFORate: Double = 0
    var granularLegacyJitter: Double = 10
    var granularLegacyProbability: Double = 0.8
    var granularLegacyPitchMode: String = "harmonic"
    var granularLegacyPitchSpread: Double = 2
    var granularLegacyMaxGrains: Double = 64
    var granularLegacyFeedback: Double = 0.1
    var granularChordBias: Double = 0
    var granularMacroActivity: Double = 0.35
    var granularMacroTexture: Double = 0.3
    var granularMacroComplexity: Double = 0.2
    var granularMacroDarkness: Double = 0.3
    var granularMacroChaos: Double = 0.1

    // Random Walk
    var randomWalkSpeed: Double = 1.0

    // Legacy fields (for backward compatibility with older presets)
    var oceanMix: Double?
    var oceanWave2OffsetMin: Double?
    var oceanWave2OffsetMax: Double?
    var filterCutoff: Double?  // Old single-value filter cutoff
    var brightness: Double?  // Old brightness param
    var reverbMix: Double?  // Old reverb mix
    var leadDelayTime: Double?  // Old single-value delay time
    var leadDelayFeedback: Double?  // Old single-value delay feedback
    var leadDelayMix: Double?  // Old single-value delay mix
    var leadVibratoDepth: Double?  // Old single-value vibrato depth
    var leadVibratoRate: Double?  // Old single-value vibrato rate
    var leadGlide: Double?  // Old single-value glide
}

/// Dual range for sliders in range mode - matches web app
struct DualRange: Codable, Equatable {
    var min: Double
    var max: Double

    init(min: Double, max: Double) {
        self.min = min
        self.max = max
    }
}

/// Saved preset format shared by native local storage and Supabase-backed cloud presets.
struct SavedPreset: Codable, Identifiable {
    var id: String { remoteID ?? name }
    let name: String
    let timestamp: String
    let state: SliderState
    let dualRanges: [String: DualRange]?
    let remoteID: String?
    let library: String?

    init(
        name: String,
        timestamp: String,
        state: SliderState,
        dualRanges: [String: DualRange]? = nil,
        remoteID: String? = nil,
        library: String? = nil
    ) {
        self.name = name
        self.timestamp = timestamp
        self.state = state
        self.dualRanges = dualRanges
        self.remoteID = remoteID
        self.library = library
    }
}

typealias SliderStateJSONRecord = [String: Any]

private enum SliderStatePayloadError: Error {
    case invalidJSONObject
}

private enum LeadNamespace: String {
    case lead1
    case lead2
}

private enum PadNamespace: String {
    case pad1
    case pad2
}

private extension SliderState {
    static func defaultJSONRecord() -> SliderStateJSONRecord {
        guard let data = try? JSONEncoder().encode(SliderState()),
              let object = try? JSONSerialization.jsonObject(with: data),
              let record = object as? SliderStateJSONRecord else {
            return [:]
        }
        return record
    }

    static func numberValue(_ value: Any?) -> Double? {
        switch value {
        case let number as Double:
            return number
        case let number as Float:
            return Double(number)
        case let number as Int:
            return Double(number)
        case let number as NSNumber where !(number is Bool):
            return number.doubleValue
        default:
            return nil
        }
    }

    static func boolValue(_ value: Any?) -> Bool? {
        switch value {
        case let bool as Bool:
            return bool
        case let number as NSNumber where number is Bool:
            return number.boolValue
        default:
            return nil
        }
    }

    static func stringValue(_ value: Any?) -> String? {
        value as? String
    }

    static func assignNumberIfMissing(
        _ targetKey: String,
        from sourceKeys: [String],
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        guard source[targetKey] == nil else { return }
        for key in sourceKeys {
            guard let value = numberValue(source[key]) else { continue }
            target[targetKey] = value
            return
        }
    }

    static func assignStringIfMissing(
        _ targetKey: String,
        from sourceKeys: [String],
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        guard source[targetKey] == nil else { return }
        for key in sourceKeys {
            guard let value = stringValue(source[key]) else { continue }
            target[targetKey] = value
            return
        }
    }

    static func assignBoolIfMissing(
        _ targetKey: String,
        from sourceKeys: [String],
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        guard source[targetKey] == nil else { return }
        for key in sourceKeys {
            guard let value = boolValue(source[key]) else { continue }
            target[targetKey] = value
            return
        }
    }

    static func assignConstantIfMissing(
        _ targetKey: String,
        value: Any,
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        guard source[targetKey] == nil else { return }
        target[targetKey] = value
    }

    static func normalizedSynthEuclidSource(_ rawValue: String) -> String {
        switch rawValue {
        case "lead1":
            return "lead"
        case "lead", "lead2", "piano":
            return rawValue
        default:
            return rawValue
        }
    }

    static func primaryLeadNamespace(in source: SliderStateJSONRecord) -> LeadNamespace? {
        let lead1Level = numberValue(source["lead1Level"]) ?? numberValue(source["leadLevel"]) ?? 0
        let lead2Level = numberValue(source["lead2Level"]) ?? 0
        let lead1Active = (boolValue(source["leadEnabled"]) ?? false) || lead1Level > 0.0001
        let lead2Active = (boolValue(source["lead2Enabled"]) ?? false) || lead2Level > 0.0001

        if lead2Active && (!lead1Active || lead2Level > lead1Level) {
            return .lead2
        }
        if lead1Active || source["lead1Level"] != nil || source["leadLevel"] != nil {
            return .lead1
        }
        return nil
    }

    static func primaryPadNamespace(in source: SliderStateJSONRecord) -> PadNamespace? {
        let pad1Level = numberValue(source["synthLevel"]) ?? 0
        let pad2Level = numberValue(source["pad2Level"]) ?? 0
        let pad1Active = (boolValue(source["padEnabled"]) ?? false) || pad1Level > 0.0001
        let pad2Active = (boolValue(source["pad2Enabled"]) ?? false) || pad2Level > 0.0001

        if pad2Active && (!pad1Active || pad2Level > pad1Level) {
            return .pad2
        }
        if pad1Active || source["synthLevel"] != nil {
            return .pad1
        }
        return nil
    }

    static func applyLeadCompatibilityMappings(
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        assignNumberIfMissing("delayAReverbSend", from: ["delayAReverbSend", "leadDelayReverbSend"], source: source, target: &target)
        assignNumberIfMissing("leadDelayReverbSend", from: ["delayAReverbSend"], source: source, target: &target)
        assignNumberIfMissing("leadDelayTimeMin", from: ["delayATime", "leadDelayTime"], source: source, target: &target)
        assignNumberIfMissing("leadDelayTimeMax", from: ["delayATime", "leadDelayTime"], source: source, target: &target)
        assignNumberIfMissing("leadDelayFeedbackMin", from: ["delayAFeedback", "leadDelayFeedback"], source: source, target: &target)
        assignNumberIfMissing("leadDelayFeedbackMax", from: ["delayAFeedback", "leadDelayFeedback"], source: source, target: &target)
        assignNumberIfMissing("leadDelayMixMin", from: ["delayAMix", "leadDelayMix"], source: source, target: &target)
        assignNumberIfMissing("leadDelayMixMax", from: ["delayAMix", "leadDelayMix"], source: source, target: &target)
        assignNumberIfMissing("delayATime", from: ["delayATime", "leadDelayTime"], source: source, target: &target)
        assignNumberIfMissing("delayAFeedback", from: ["delayAFeedback", "leadDelayFeedback"], source: source, target: &target)
        assignNumberIfMissing("delayAMix", from: ["delayAMix", "leadDelayMix"], source: source, target: &target)
        assignNumberIfMissing("leadVibratoDepthMin", from: ["leadVibratoDepth"], source: source, target: &target)
        assignNumberIfMissing("leadVibratoDepthMax", from: ["leadVibratoDepth"], source: source, target: &target)
        assignNumberIfMissing("leadVibratoRateMin", from: ["leadVibratoRate"], source: source, target: &target)
        assignNumberIfMissing("leadVibratoRateMax", from: ["leadVibratoRate"], source: source, target: &target)
        assignNumberIfMissing("leadGlideMin", from: ["leadGlide"], source: source, target: &target)
        assignNumberIfMissing("leadGlideMax", from: ["leadGlide"], source: source, target: &target)

        assignBoolIfMissing("lead2Enabled", from: ["lead2Enabled"], source: source, target: &target)
        assignNumberIfMissing("lead2Level", from: ["lead2Level"], source: source, target: &target)
        assignNumberIfMissing("lead2ReverbSend", from: ["lead2ReverbSend"], source: source, target: &target)
        assignNumberIfMissing("lead2DelayASend", from: ["lead2DelayASend"], source: source, target: &target)
        assignNumberIfMissing("lead2DelayBSend", from: ["lead2DelayBSend"], source: source, target: &target)
        assignNumberIfMissing("lead2Attack", from: ["lead2Attack"], source: source, target: &target)
        assignNumberIfMissing("lead2Decay", from: ["lead2Decay"], source: source, target: &target)
        assignNumberIfMissing("lead2Sustain", from: ["lead2Sustain"], source: source, target: &target)
        assignNumberIfMissing("lead2Hold", from: ["lead2Hold"], source: source, target: &target)
        assignNumberIfMissing("lead2Release", from: ["lead2Release"], source: source, target: &target)
        assignNumberIfMissing("lead2Density", from: ["lead2Density", "lead1Density", "leadDensity"], source: source, target: &target)
        assignNumberIfMissing("lead2Octave", from: ["lead2Octave", "lead1Octave", "leadOctave"], source: source, target: &target)
        assignNumberIfMissing("lead2OctaveRange", from: ["lead2OctaveRange", "lead1OctaveRange", "leadOctaveRange"], source: source, target: &target)
        assignStringIfMissing("lead2PresetC", from: ["lead2PresetC"], source: source, target: &target)
        assignStringIfMissing("lead2PresetD", from: ["lead2PresetD"], source: source, target: &target)
        assignNumberIfMissing("lead2Morph", from: ["lead2Morph"], source: source, target: &target)
        assignBoolIfMissing("pianoEnabled", from: ["pianoEnabled"], source: source, target: &target)
        assignNumberIfMissing("pianoLevel", from: ["pianoLevel"], source: source, target: &target)
        assignNumberIfMissing("pianoReverbSend", from: ["pianoReverbSend"], source: source, target: &target)
        assignNumberIfMissing("pianoDelayASend", from: ["pianoDelayASend"], source: source, target: &target)
        assignNumberIfMissing("pianoDelayBSend", from: ["pianoDelayBSend"], source: source, target: &target)
        assignNumberIfMissing("pianoAttack", from: ["pianoAttack"], source: source, target: &target)
        assignNumberIfMissing("pianoDecay", from: ["pianoDecay"], source: source, target: &target)
        assignNumberIfMissing("pianoSustain", from: ["pianoSustain"], source: source, target: &target)
        assignNumberIfMissing("pianoHold", from: ["pianoHold"], source: source, target: &target)
        assignNumberIfMissing("pianoRelease", from: ["pianoRelease"], source: source, target: &target)
        assignNumberIfMissing("pianoPostLPF", from: ["pianoPostLPF"], source: source, target: &target)
        assignNumberIfMissing("pianoStereoWidth", from: ["pianoStereoWidth"], source: source, target: &target)

        guard let namespace = primaryLeadNamespace(in: source) else { return }

        let attackKey = namespace == .lead2 ? "lead2Attack" : "lead1Attack"
        let decayKey = namespace == .lead2 ? "lead2Decay" : "lead1Decay"
        let sustainKey = namespace == .lead2 ? "lead2Sustain" : "lead1Sustain"
        let holdKey = namespace == .lead2 ? "lead2Hold" : "lead1Hold"
        let releaseKey = namespace == .lead2 ? "lead2Release" : "lead1Release"
        let levelKeys = namespace == .lead2 ? ["lead2Level", "leadLevel"] : ["lead1Level", "leadLevel"]
        let reverbKeys = namespace == .lead2 ? ["lead2ReverbSend", "leadReverbSend"] : ["lead1ReverbSend", "leadReverbSend"]

        assignConstantIfMissing("leadEnabled", value: true, source: source, target: &target)
        assignNumberIfMissing("leadLevel", from: levelKeys, source: source, target: &target)
        assignNumberIfMissing("leadReverbSend", from: reverbKeys, source: source, target: &target)
        assignNumberIfMissing("leadAttack", from: [attackKey, "leadAttack"], source: source, target: &target)
        assignNumberIfMissing("leadDecay", from: [decayKey, "leadDecay"], source: source, target: &target)
        assignNumberIfMissing("leadSustain", from: [sustainKey, "leadSustain"], source: source, target: &target)
        assignNumberIfMissing("leadHold", from: [holdKey, "leadHold"], source: source, target: &target)
        assignNumberIfMissing("leadRelease", from: [releaseKey, "leadRelease"], source: source, target: &target)
        assignNumberIfMissing("leadDensity", from: [namespace == .lead2 ? "lead2Density" : "lead1Density", "leadDensity"], source: source, target: &target)
        assignNumberIfMissing("leadOctave", from: [namespace == .lead2 ? "lead2Octave" : "lead1Octave", "leadOctave"], source: source, target: &target)
        assignNumberIfMissing("leadOctaveRange", from: [namespace == .lead2 ? "lead2OctaveRange" : "lead1OctaveRange", "leadOctaveRange"], source: source, target: &target)
        assignNumberIfMissing("leadTimbreMin", from: ["leadTimbre", "leadTimbreMin"], source: source, target: &target)
        assignNumberIfMissing("leadTimbreMax", from: ["leadTimbre", "leadTimbreMax"], source: source, target: &target)
    }

    static func applyPadCompatibilityMappings(
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        let primaryPad = primaryPadNamespace(in: source)
        let synthLevelKeys = primaryPad == .pad2 ? ["pad2Level", "synthLevel"] : ["synthLevel", "pad2Level"]
        let synthReverbKeys = primaryPad == .pad2 ? ["pad2ReverbSend", "pad1ReverbSend"] : ["pad1ReverbSend", "pad2ReverbSend"]

        assignNumberIfMissing("synthLevel", from: synthLevelKeys, source: source, target: &target)
        assignNumberIfMissing("synthReverbSend", from: synthReverbKeys, source: source, target: &target)

        guard primaryPad == .pad2 else { return }

        assignNumberIfMissing("synthAttack", from: ["pad2Attack"], source: source, target: &target)
        assignNumberIfMissing("synthDecay", from: ["pad2Decay"], source: source, target: &target)
        assignNumberIfMissing("synthSustain", from: ["pad2Sustain"], source: source, target: &target)
        assignNumberIfMissing("synthRelease", from: ["pad2Release"], source: source, target: &target)
        assignNumberIfMissing("synthOctave", from: ["pad2Octave"], source: source, target: &target)
        assignNumberIfMissing("hardness", from: ["pad2Hardness"], source: source, target: &target)
        assignNumberIfMissing("warmth", from: ["pad2Warmth"], source: source, target: &target)
        assignNumberIfMissing("presence", from: ["pad2Presence"], source: source, target: &target)
        assignStringIfMissing("filterType", from: ["pad2FilterType"], source: source, target: &target)
        assignNumberIfMissing("filterCutoffMin", from: ["pad2FilterCutoffMin"], source: source, target: &target)
        assignNumberIfMissing("filterCutoffMax", from: ["pad2FilterCutoffMax"], source: source, target: &target)
        assignNumberIfMissing("filterResonance", from: ["pad2FilterResonance"], source: source, target: &target)
        assignNumberIfMissing("filterQ", from: ["pad2FilterQ"], source: source, target: &target)
        assignNumberIfMissing("synthVoiceMask", from: ["pad2VoiceAssign"], source: source, target: &target)
    }

    static func applyOceanCompatibilityMappings(
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        assignNumberIfMissing("earthLevel", from: ["earthLevel"], source: source, target: &target)
        assignNumberIfMissing("oceanReverbSend", from: ["oceanReverbSend", "waterReverbSend"], source: source, target: &target)
        assignNumberIfMissing("oceanDelayASend", from: ["oceanDelayASend"], source: source, target: &target)
        assignNumberIfMissing("oceanDelayBSend", from: ["oceanDelayBSend"], source: source, target: &target)
        assignBoolIfMissing("oceanWaveSynthEnabled", from: ["waterEnabled"], source: source, target: &target)
        assignNumberIfMissing("oceanWaveSynthLevel", from: ["waterLevel", "oceanMix"], source: source, target: &target)
        assignNumberIfMissing("oceanDurationMin", from: ["waterSurfDuration"], source: source, target: &target)
        assignNumberIfMissing("oceanDurationMax", from: ["waterSurfDuration"], source: source, target: &target)
        assignNumberIfMissing("oceanIntervalMin", from: ["waterSurfInterval"], source: source, target: &target)
        assignNumberIfMissing("oceanIntervalMax", from: ["waterSurfInterval"], source: source, target: &target)
        assignNumberIfMissing("oceanFoamMin", from: ["waterSurfFoam"], source: source, target: &target)
        assignNumberIfMissing("oceanFoamMax", from: ["waterSurfFoam"], source: source, target: &target)
        assignNumberIfMissing("oceanDepthMin", from: ["waterSurfDepth"], source: source, target: &target)
        assignNumberIfMissing("oceanDepthMax", from: ["waterSurfDepth"], source: source, target: &target)
        assignBoolIfMissing("waterEnabled", from: ["waterEnabled"], source: source, target: &target)
        assignNumberIfMissing("waterLevel", from: ["waterLevel"], source: source, target: &target)
        assignNumberIfMissing("waterReverbSend", from: ["waterReverbSend"], source: source, target: &target)
        assignNumberIfMissing("waterDelayASend", from: ["waterDelayASend"], source: source, target: &target)
        assignNumberIfMissing("waterDelayBSend", from: ["waterDelayBSend"], source: source, target: &target)
        assignNumberIfMissing("waterIntensity", from: ["waterIntensity"], source: source, target: &target)
        assignNumberIfMissing("waterLayerHardDrops", from: ["waterLayerHardDrops"], source: source, target: &target)
        assignNumberIfMissing("waterLayerWaterDrops", from: ["waterLayerWaterDrops"], source: source, target: &target)
        assignNumberIfMissing("waterLayerTurbulence", from: ["waterLayerTurbulence"], source: source, target: &target)
        assignNumberIfMissing("waterLayerBubbling", from: ["waterLayerBubbling"], source: source, target: &target)
        assignNumberIfMissing("waterLayerSurf", from: ["waterLayerSurf"], source: source, target: &target)
        assignBoolIfMissing("birdsEnabled", from: ["birdsEnabled"], source: source, target: &target)
        assignBoolIfMissing("birds2Enabled", from: ["birds2Enabled"], source: source, target: &target)
        assignBoolIfMissing("frogsEnabled", from: ["frogsEnabled"], source: source, target: &target)
        assignNumberIfMissing("birdsLevel", from: ["birdsLevel"], source: source, target: &target)
        assignNumberIfMissing("birds2Level", from: ["birds2Level"], source: source, target: &target)
        assignNumberIfMissing("frogsLevel", from: ["frogsLevel"], source: source, target: &target)
        assignNumberIfMissing("natureLevel", from: ["natureLevel"], source: source, target: &target)
        assignNumberIfMissing("natureReverbSend", from: ["natureReverbSend"], source: source, target: &target)
        assignNumberIfMissing("natureDelayASend", from: ["natureDelayASend"], source: source, target: &target)
        assignNumberIfMissing("natureDelayBSend", from: ["natureDelayBSend"], source: source, target: &target)
        assignBoolIfMissing("insectsEnabled", from: ["insectsEnabled"], source: source, target: &target)
        assignBoolIfMissing("insects2Enabled", from: ["insects2Enabled"], source: source, target: &target)
        assignNumberIfMissing("insectsLevel", from: ["insectsLevel"], source: source, target: &target)
        assignNumberIfMissing("insects2Level", from: ["insects2Level"], source: source, target: &target)
        assignNumberIfMissing("insectsSharedLevel", from: ["insectsSharedLevel"], source: source, target: &target)
        assignNumberIfMissing("insectsDensity", from: ["insectsDensity"], source: source, target: &target)
        assignNumberIfMissing("insects2Density", from: ["insects2Density"], source: source, target: &target)
        assignNumberIfMissing("insectsReverbSend", from: ["insectsReverbSend"], source: source, target: &target)
    }

    static func applyLegacyCompatibilityMappings(
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        assignNumberIfMissing("filterCutoffMin", from: ["filterCutoff"], source: source, target: &target)
        assignNumberIfMissing("filterCutoffMax", from: ["filterCutoff"], source: source, target: &target)
        assignNumberIfMissing("reverbLevel", from: ["reverbMix"], source: source, target: &target)
        assignNumberIfMissing("drumEuclidBaseBPM", from: ["sequencerMasterBPM"], source: source, target: &target)
        assignNumberIfMissing("erosionWow", from: ["characterWow"], source: source, target: &target)
        assignNumberIfMissing("erosionFlutter", from: ["characterFlutter"], source: source, target: &target)
        assignNumberIfMissing("erosionDrift", from: ["characterDrift"], source: source, target: &target)
        assignNumberIfMissing("erosionTone", from: ["characterTone"], source: source, target: &target)
        assignNumberIfMissing("degradeHp", from: ["characterHp", "characterWetHp"], source: source, target: &target)
        assignNumberIfMissing("degradeLp", from: ["characterLp"], source: source, target: &target)
        assignNumberIfMissing("erosionNoise", from: ["characterNoise"], source: source, target: &target)
        assignNumberIfMissing("erosionSaturation", from: ["characterSaturation"], source: source, target: &target)
        assignNumberIfMissing("erosionCorrosion", from: ["characterCorrosion"], source: source, target: &target)
    }

    static func normalizeSynthEuclidSources(
        source: SliderStateJSONRecord,
        target: inout SliderStateJSONRecord
    ) {
        for lane in 1...4 {
            let key = "synthEuclid\(lane)Source"
            guard let rawValue = stringValue(source[key]) ?? stringValue(target[key]) else { continue }
            target[key] = normalizedSynthEuclidSource(rawValue)
        }
    }
}

extension SliderState {
    public static func decodeStatePayload(from data: Data) throws -> SliderState {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let record = object as? SliderStateJSONRecord else {
            throw SliderStatePayloadError.invalidJSONObject
        }
        return try decodeStateRecord(record)
    }

    static func decodeStateRecord(_ source: SliderStateJSONRecord) throws -> SliderState {
        var normalized = defaultJSONRecord()
        for (key, value) in source {
            normalized[key] = value
        }

        applyLegacyCompatibilityMappings(source: source, target: &normalized)
        applyPadCompatibilityMappings(source: source, target: &normalized)
        applyLeadCompatibilityMappings(source: source, target: &normalized)
        applyOceanCompatibilityMappings(source: source, target: &normalized)
        normalizeSynthEuclidSources(source: source, target: &normalized)

        let normalizedData = try JSONSerialization.data(withJSONObject: normalized, options: [])
        return try JSONDecoder().decode(SliderState.self, from: normalizedData)
    }

    func jsonRecord() throws -> SliderStateJSONRecord {
        let data = try JSONEncoder().encode(self)
        guard let record = try JSONSerialization.jsonObject(with: data) as? SliderStateJSONRecord else {
            throw SliderStatePayloadError.invalidJSONObject
        }
        return record
    }
}

extension SliderState {
    var phraseDurationFromBeatClock: Double {
        let bpm = max(1, sequencerMasterBPM)
        let beats = max(1, transportBeatsPerBar)
        let bars = max(1, transportBarsPerPhrase)
        return (60.0 / bpm) * Double(beats * bars)
    }

    var equivalentBPMFromPhraseClock: Double {
        let phraseSeconds = max(0.001, phraseLength)
        return Double(max(1, transportBarsPerPhrase) * max(1, transportBeatsPerBar)) * 60.0 / phraseSeconds
    }

    var effectivePhraseLength: Double {
        transportPrimaryClock == "bpm" ? phraseDurationFromBeatClock : max(0.001, phraseLength)
    }
}

// MARK: - Default State
extension SliderState {
    static let `default` = SliderState()
    public static let defaultState = SliderState()
}
