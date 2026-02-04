import Foundation

/// SliderState - Cross-platform preset format
/// Must match the web app's SliderState interface exactly for preset compatibility
struct SliderState: Codable, Equatable {
    // Master
    var masterVolume: Double = 0.7
    var synthLevel: Double = 0.6
    var granularLevel: Double = 0.4
    var synthReverbSend: Double = 0.7
    var granularReverbSend: Double = 0.8
    var leadReverbSend: Double = 0.5
    var leadDelayReverbSend: Double = 0.4
    var reverbLevel: Double = 1.0
    
    // Seed
    var seedWindow: String = "hour"  // "hour", "day" (matching web app)
    var randomness: Double = 0.5
    
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
    var chordRate: Int = 32
    var voicingSpread: Double = 0.5
    
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
    
    // Euclidean Rhythms
    var leadEuclideanMasterEnabled: Bool = false
    var leadEuclideanTempo: Double = 1.0
    
    var leadEuclid1Enabled: Bool = true
    var leadEuclid1Preset: String = "lancaran"
    var leadEuclid1Steps: Int = 16
    var leadEuclid1Hits: Int = 4
    var leadEuclid1Rotation: Int = 0
    var leadEuclid1NoteMin: Int = 64
    var leadEuclid1NoteMax: Int = 76
    var leadEuclid1Level: Double = 0.8
    
    var leadEuclid2Enabled: Bool = false
    var leadEuclid2Preset: String = "kotekan"
    var leadEuclid2Steps: Int = 8
    var leadEuclid2Hits: Int = 3
    var leadEuclid2Rotation: Int = 1
    var leadEuclid2NoteMin: Int = 76
    var leadEuclid2NoteMax: Int = 88
    var leadEuclid2Level: Double = 0.6
    
    var leadEuclid3Enabled: Bool = false
    var leadEuclid3Preset: String = "ketawang"
    var leadEuclid3Steps: Int = 16
    var leadEuclid3Hits: Int = 2
    var leadEuclid3Rotation: Int = 0
    var leadEuclid3NoteMin: Int = 52
    var leadEuclid3NoteMax: Int = 64
    var leadEuclid3Level: Double = 0.9
    
    var leadEuclid4Enabled: Bool = false
    var leadEuclid4Preset: String = "srepegan"
    var leadEuclid4Steps: Int = 16
    var leadEuclid4Hits: Int = 6
    var leadEuclid4Rotation: Int = 2
    var leadEuclid4NoteMin: Int = 88
    var leadEuclid4NoteMax: Int = 96
    var leadEuclid4Level: Double = 0.5
    
    // Euclidean Probability & Source (per lane)
    var leadEuclid1Probability: Double = 1.0
    var leadEuclid1Source: String = "lead"  // "lead", "synth1"..."synth6"
    var leadEuclid2Probability: Double = 1.0
    var leadEuclid2Source: String = "lead"
    var leadEuclid3Probability: Double = 1.0
    var leadEuclid3Source: String = "lead"
    var leadEuclid4Probability: Double = 1.0
    var leadEuclid4Source: String = "lead"
    
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
    
    // Random Walk
    var randomWalkSpeed: Double = 1.0
    
    // Legacy fields (for backward compatibility with older presets)
    var oceanMix: Double?
    var oceanWave2OffsetMin: Double?
    var oceanWave2OffsetMax: Double?
    var oceanPebblesMin: Double?
    var oceanPebblesMax: Double?
    var oceanPebbleSizeMin: Double?
    var oceanPebbleSizeMax: Double?
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

/// Saved preset format - matches web app exactly
struct SavedPreset: Codable, Identifiable {
    var id: String { name }
    let name: String
    let timestamp: String
    let state: SliderState
    let dualRanges: [String: DualRange]?
}

// MARK: - Default State
extension SliderState {
    static let `default` = SliderState()
}
