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
    var seedWindow: String = "hour"  // "minute", "hour", "day"
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
    var manualScale: String = "Dorian"
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
    var oscBrightness: Double = 2.0
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
