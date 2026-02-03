import AVFoundation
import Accelerate

/// Polyphonic synthesizer voice with 4 oscillators, filter, saturation, and envelope
/// Matches web app's architecture: sine + triangle + sawDetuned + saw with morphing
class SynthVoice {
    let node: AVAudioSourceNode
    
    // 4 oscillator phases (matching web app)
    private var phase1: Float = 0  // sine
    private var phase2: Float = 0  // triangle (detuned down)
    private var phase3: Float = 0  // saw (detuned up)
    private var phase4: Float = 0  // saw (base)
    
    // Oscillator gains based on oscBrightness
    private var osc1Gain: Float = 0.0  // sine
    private var osc2Gain: Float = 0.4  // triangle
    private var osc3Gain: Float = 0.3  // saw detuned
    private var osc4Gain: Float = 0.3  // saw
    
    // Frequency and detune
    private var frequency: Float = 440
    private var targetFrequency: Float = 440
    private var detune: Float = 15  // cents for osc2/osc3
    private var velocity: Float = 0
    
    // Envelope state
    private var envelope: Float = 0
    private var envelopeStage: EnvelopeStage = .off
    private var attack: Float = 0.3
    private var decay: Float = 0.5
    private var sustain: Float = 0.6
    private var release: Float = 1.0
    
    // Filter state (SVF with type selection)
    private var filterCutoff: Float = 2000
    private var filterResonance: Float = 0.5
    private var filterQ: Float = 1.0
    private var filterType: Int = 0  // 0=lowpass, 1=highpass, 2=bandpass, 3=notch
    private var filterState: [Float] = [0, 0]
    
    // Cached filter coefficients (avoid computing tan() every sample)
    private var cachedFilterCutoff: Float = 0
    private var cachedFilterQ: Float = 0
    private var filterG: Float = 0
    private var filterA1: Float = 0
    private var filterA2: Float = 0
    private var filterA3: Float = 0
    
    // Saturation (tanh waveshaper matching web app)
    private var hardness: Float = 0.3
    
    // Brightness mode (controls oscillator mix)
    private var oscBrightness: Int = 2  // 0=sine, 1=triangle, 2=saw+tri, 3=sawtooth
    
    // EQ/Tone shaping
    private var warmth: Float = 0.4      // Low shelf boost at 250Hz
    private var presence: Float = 0.3    // Peaking EQ at 3kHz
    private var airNoise: Float = 0.15   // Breath/air noise
    
    // Filter states for EQ
    private var warmthState: Float = 0
    private var presenceState: Float = 0
    private var presenceBandState: Float = 0  // For peaking filter
    
    // Octave shift
    private var octaveShift: Int = 0
    
    // Inline LCG for noise generation (avoids Float.random() on audio thread)
    private var noiseSeed: UInt32 = 12345
    
    // Voice enabled (for voice mask)
    var isEnabled: Bool = true
    
    private let sampleRate: Float = 44100
    private let invSampleRate: Float = 1.0 / 44100  // Pre-computed to avoid division per sample
    
    enum EnvelopeStage {
        case off, attack, decay, sustain, release
    }
    
    init() {
        // Set initial oscillator gains for oscBrightness=2
        updateOscillatorGains()
        
        node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            
            for frame in 0..<Int(frameCount) {
                let sample = self.generateSample()
                
                for buffer in ablPointer {
                    let buf = buffer.mData?.assumingMemoryBound(to: Float.self)
                    buf?[frame] = sample
                }
            }
            
            return noErr
        }
    }
    
    private func generateSample() -> Float {
        // Skip if voice is disabled
        guard isEnabled else { return 0 }
        
        // Frequency glide with octave shift
        let shiftedFreq = targetFrequency * pow(2.0, Float(octaveShift))
        frequency += (shiftedFreq - frequency) * 0.001
        
        // Calculate detuned frequencies (matching web app: osc2 down, osc3 up)
        let freq1 = frequency                                      // sine - base
        let freq2 = frequency * pow(2.0, -detune / 1200.0)         // triangle - detuned down
        let freq3 = frequency * pow(2.0, detune / 1200.0)          // saw - detuned up
        let freq4 = frequency                                      // saw - base
        
        // Generate 4 oscillators
        let osc1 = sin(phase1 * 2 * .pi)                           // sine
        let osc2 = 2 * abs(2 * (phase2 - floor(phase2 + 0.5))) - 1 // triangle
        let osc3 = 2 * (phase3 - floor(phase3 + 0.5))              // saw (detuned)
        let osc4 = 2 * (phase4 - floor(phase4 + 0.5))              // saw
        
        // Mix oscillators based on oscBrightness gains
        var osc = osc1 * osc1Gain + osc2 * osc2Gain + osc3 * osc3Gain + osc4 * osc4Gain
        
        // Add air noise (uses inline LCG to avoid Float.random() on audio thread)
        if airNoise > 0 {
            // Inline LCG: fast deterministic noise
            noiseSeed = noiseSeed &* 1664525 &+ 1013904223
            let noise = (Float(noiseSeed) / Float(UInt32.max)) * 2 - 1
            osc += noise * airNoise * 0.1
        }
        
        // Update phases (using pre-computed inverse for efficiency)
        phase1 += freq1 * invSampleRate
        phase2 += freq2 * invSampleRate
        phase3 += freq3 * invSampleRate
        phase4 += freq4 * invSampleRate
        
        // Wrap phases
        if phase1 >= 1 { phase1 -= 1 }
        if phase2 >= 1 { phase2 -= 1 }
        if phase3 >= 1 { phase3 -= 1 }
        if phase4 >= 1 { phase4 -= 1 }
        
        // Apply envelope
        updateEnvelope()
        osc *= envelope * velocity
        
        // Apply filter
        osc = applyFilter(osc)
        
        // Apply warmth (low shelf at 250Hz)
        osc = applyWarmth(osc)
        
        // Apply presence (peaking EQ at 3kHz)
        osc = applyPresence(osc)
        
        // Apply saturation (tanh waveshaper)
        osc = applySaturation(osc)
        
        return osc * 0.15  // Scale down for mixing
    }
    
    /// Tanh saturation waveshaper (matching web app's createSaturationCurve)
    private func applySaturation(_ input: Float) -> Float {
        guard hardness > 0.01 else { return input }
        
        let drive = 1.0 + hardness * 3.0
        // Soft clip: tanh(x * drive) / tanh(drive)
        let tanhDrive = tanh(drive)
        guard tanhDrive > 0.001 else { return input }
        
        return tanh(input * drive) / tanhDrive
    }
    
    private func updateEnvelope() {
        let attackRate = 1.0 / (attack * sampleRate + 1)
        let decayRate = 1.0 / (decay * sampleRate + 1)
        let releaseRate = 1.0 / (release * sampleRate + 1)
        
        switch envelopeStage {
        case .off:
            envelope = 0
            
        case .attack:
            envelope += attackRate
            if envelope >= 1 {
                envelope = 1
                envelopeStage = .decay
            }
            
        case .decay:
            envelope -= (envelope - sustain) * decayRate
            if envelope <= sustain + 0.001 {
                envelope = sustain
                envelopeStage = .sustain
            }
            
        case .sustain:
            envelope = sustain
            
        case .release:
            envelope -= envelope * releaseRate
            if envelope < 0.001 {
                envelope = 0
                envelopeStage = .off
            }
        }
    }
    
    private func applyFilter(_ input: Float) -> Float {
        // SVF (State Variable Filter) with selectable output
        // Recalculate coefficients only when filter params change
        if filterCutoff != cachedFilterCutoff || filterQ != cachedFilterQ {
            cachedFilterCutoff = filterCutoff
            cachedFilterQ = filterQ
            let omega = 2 * Float.pi * filterCutoff / sampleRate
            filterG = tan(omega / 2)
            let k = 1 / max(filterQ, 0.5)
            filterA1 = 1 / (1 + filterG * (filterG + k))
            filterA2 = filterG * filterA1
            filterA3 = filterG * filterA2
        }
        
        let resonanceBoost = 1 + filterResonance * 3
        let k = 1 / max(filterQ, 0.5)
        
        let v3 = input - filterState[1]
        let v1 = filterA1 * filterState[0] + filterA2 * v3
        let v2 = filterState[1] + filterA2 * filterState[0] + filterA3 * v3
        
        filterState[0] = 2 * v1 - filterState[0]
        filterState[1] = 2 * v2 - filterState[1]
        
        // Select output based on filter type
        switch filterType {
        case 0:  // Lowpass
            return v2 * resonanceBoost
        case 1:  // Highpass
            return (input - k * v1 - v2) * resonanceBoost
        case 2:  // Bandpass
            return v1 * resonanceBoost
        case 3:  // Notch (band reject = lowpass + highpass)
            return (input - k * v1) * resonanceBoost
        default:
            return v2 * resonanceBoost
        }
    }
    
    private func applyWarmth(_ input: Float) -> Float {
        // Low shelf filter at 250Hz (matching web app)
        guard warmth > 0.01 else { return input }
        
        let cutoff: Float = 250
        let alpha = cutoff / sampleRate
        warmthState += alpha * (input - warmthState)
        
        // Boost lows based on warmth (0-8dB range like web app)
        let boostDb = warmth * 8.0
        let boostLinear = pow(10.0, boostDb / 20.0) - 1.0
        let lowBoost = warmthState * boostLinear
        return input + lowBoost
    }
    
    private func applyPresence(_ input: Float) -> Float {
        // Peaking EQ at 3kHz with Q=0.8 (matching web app)
        guard presence > 0.01 else { return input }
        
        let cutoff: Float = 3000
        let q: Float = 0.8
        let alpha = cutoff / sampleRate
        
        // Two-pole bandpass extraction
        presenceState += alpha * (input - presenceState)
        presenceBandState += alpha * q * (presenceState - presenceBandState)
        
        // The bandpass output
        let bandpass = presenceState - presenceBandState
        
        // Boost/cut (±6dB range like web app)
        let boostDb = (presence - 0.5) * 12.0  // -6 to +6 dB
        let boostLinear = pow(10.0, boostDb / 20.0) - 1.0
        return input + bandpass * boostLinear
    }
    
    /// Update oscillator gains based on oscBrightness (matching web app exactly)
    private func updateOscillatorGains() {
        switch oscBrightness {
        case 0:  // Sine - pure, soft
            osc1Gain = 1.0
            osc2Gain = 0.0
            osc3Gain = 0.0
            osc4Gain = 0.0
        case 1:  // Triangle - soft harmonics
            osc1Gain = 0.2
            osc2Gain = 0.8
            osc3Gain = 0.0
            osc4Gain = 0.0
        case 2:  // Saw + Triangle mix - balanced ambient
            osc1Gain = 0.0
            osc2Gain = 0.4
            osc3Gain = 0.3
            osc4Gain = 0.3
        case 3:  // Sawtooth - bright, full harmonics
            osc1Gain = 0.0
            osc2Gain = 0.0
            osc3Gain = 0.5
            osc4Gain = 0.5
        default:
            osc1Gain = 0.0
            osc2Gain = 0.4
            osc3Gain = 0.3
            osc4Gain = 0.3
        }
    }
    
    // MARK: - Public Interface
    
    func trigger(frequency: Float, velocity: Float) {
        self.targetFrequency = frequency
        self.velocity = velocity
        self.envelopeStage = .attack
    }
    
    func release() {
        envelopeStage = .release
    }
    
    func setADSR(attack: Float, decay: Float, sustain: Float, release: Float) {
        self.attack = max(0.01, attack)
        self.decay = max(0.01, decay)
        self.sustain = sustain
        self.release = max(0.01, release)
    }
    
    func setFilterCutoff(_ cutoff: Float) {
        self.filterCutoff = min(max(cutoff, 20), 20000)
    }
    
    func setFilterParams(cutoff: Float, resonance: Float, q: Float) {
        self.filterCutoff = min(max(cutoff, 20), 20000)
        self.filterResonance = min(max(resonance, 0), 1)
        self.filterQ = min(max(q, 0.1), 12)
    }
    
    func setFilterParams(resonance: Float, q: Float) {
        self.filterResonance = min(max(resonance, 0), 1)
        self.filterQ = min(max(q, 0.1), 12)
    }
    
    func setFilterType(_ type: Int) {
        // 0=lowpass, 1=highpass, 2=bandpass, 3=notch
        self.filterType = min(max(type, 0), 3)
    }
    
    func setEnabled(_ enabled: Bool) {
        self.isEnabled = enabled
    }
    
    func setHardness(_ hardness: Float) {
        self.hardness = min(max(hardness, 0), 1)
    }
    
    func setOscBrightness(_ brightness: Int) {
        self.oscBrightness = min(max(brightness, 0), 3)
        updateOscillatorGains()
    }
    
    func setDetune(_ cents: Float) {
        self.detune = min(max(cents, 0), 100)
    }
    
    func setToneShaping(warmth: Float, presence: Float, airNoise: Float) {
        self.warmth = min(max(warmth, 0), 1)
        self.presence = min(max(presence, 0), 1)
        self.airNoise = min(max(airNoise, 0), 1)
    }
    
    func setOctaveShift(_ octave: Int) {
        self.octaveShift = min(max(octave, -2), 2)
    }
}
