import AVFoundation
import Accelerate

@inline(__always)
private func writeSynthVoiceFrame(
    _ sample: Float,
    frame: Int,
    to buffers: UnsafeMutableAudioBufferListPointer
) {
    if buffers.count == 1, let data = buffers[0].mData?.assumingMemoryBound(to: Float.self) {
        let channelCount = max(Int(buffers[0].mNumberChannels), 1)
        let baseIndex = frame * channelCount
        for channel in 0..<channelCount {
            data[baseIndex + channel] = sample
        }
        return
    }

    for buffer in buffers {
        let data = buffer.mData?.assumingMemoryBound(to: Float.self)
        data?[frame] = sample
    }
}

/// Polyphonic synthesizer voice with 4 oscillators, filter, saturation, and envelope.
/// This native implementation follows the same broad sound design as the web synth.
class SynthVoice {
    lazy var node: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(standardFormatWithSampleRate: Double(self?.sampleRate ?? 44_100), channels: 2)!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }

            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)

            for frame in 0..<Int(frameCount) {
                let sample = self.generateSample()
                writeSynthVoiceFrame(sample, frame: frame, to: ablPointer)
            }

            return noErr
        }
    }()
    
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
    private var detuneDownMultiplier: Float = 1
    private var detuneUpMultiplier: Float = 1
    private var velocity: Float = 0
    
    // Envelope state
    private var envelope: Float = 0
    private var envelopeStage: EnvelopeStage = .off
    private var attack: Float = 0.3
    private var decay: Float = 0.5
    private var sustain: Float = 0.6
    private var release: Float = 1.0
    private var attackCoeff: Float = 0
    private var decayCoeff: Float = 0
    private var releaseCoeff: Float = 0
    
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
    private var saturationDrive: Float = 1.9
    private var saturationNormalizer: Float = tanh(1.9)
    
    // Brightness mode (controls oscillator mix)
    private var oscBrightness: Int = 2  // 0=sine, 1=triangle, 2=saw+tri, 3=sawtooth
    
    // EQ/Tone shaping
    private var warmth: Float = 0.4      // Low shelf boost at 250Hz
    private var presence: Float = 0.3    // Peaking EQ at 3kHz
    private var airNoise: Float = 0.15   // Breath/air noise
    private var warmthAlpha: Float = 0
    private var warmthBoostLinear: Float = 0
    private var presenceAlpha: Float = 0
    private var presenceBoostLinear: Float = 0
    
    // Filter states for EQ
    private var warmthState: Float = 0
    private var presenceState: Float = 0
    private var presenceBandState: Float = 0  // For peaking filter
    
    // Octave shift
    private var octaveShift: Int = 0
    private var octaveMultiplier: Float = 1
    
    // Inline LCG for noise generation (avoids Float.random() on audio thread)
    private var noiseSeed: UInt32 = 12345
    
    // Voice enabled (for voice mask)
    var isEnabled: Bool = true
    
    private let sampleRate: Float
    private let invSampleRate: Float  // Pre-computed to avoid division per sample
    
    enum EnvelopeStage {
        case off, attack, decay, sustain, release
    }
    
    init(sampleRate: Float = 44_100) {
        self.sampleRate = max(sampleRate, 1_000)
        self.invSampleRate = 1.0 / self.sampleRate
        // Set initial oscillator gains for oscBrightness=2
        updateOscillatorGains()
        updateDetuneMultipliers()
        updateEnvelopeCoefficients()
        updateSaturationCache()
        updateToneShapingCache()

    }
    
    private func generateSample() -> Float {
        // Skip if voice is disabled
        guard isEnabled else { return 0 }

        // Frequency glide with octave shift
        let shiftedFreq = targetFrequency * octaveMultiplier
        frequency += (shiftedFreq - frequency) * 0.001

        // Calculate detuned frequencies (matching web app: osc2 down, osc3 up)
        let freq1 = frequency                                      // sine - base
        let freq2 = frequency * detuneDownMultiplier               // triangle - detuned down
        let freq3 = frequency * detuneUpMultiplier                 // saw - detuned up
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
        
        guard saturationNormalizer > 0.001 else { return input }

        return tanh(input * saturationDrive) / saturationNormalizer
    }

    private func updateEnvelope() {
        switch envelopeStage {
        case .off:
            envelope = 0
            
        case .attack:
            // Exponential approach to 1.0 (matching web's setTargetAtTime)
            envelope += (1.0 - envelope) * attackCoeff
            if envelope >= 0.99 {
                envelope = 1
                envelopeStage = .decay
            }
            
        case .decay:
            // Exponential approach to sustain
            envelope += (sustain - envelope) * decayCoeff
            if abs(envelope - sustain) < 0.001 {
                envelope = sustain
                envelopeStage = .sustain
            }
            
        case .sustain:
            envelope = sustain
            
        case .release:
            // Exponential approach to 0
            envelope += (0 - envelope) * releaseCoeff
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

        warmthState += warmthAlpha * (input - warmthState)

        let lowBoost = warmthState * warmthBoostLinear
        return input + lowBoost
    }
    
    private func applyPresence(_ input: Float) -> Float {
        // Peaking EQ at 3kHz with Q=0.8 (matching web app)
        guard presence > 0.01 else { return input }

        let q: Float = 0.8

        // Two-pole bandpass extraction
        presenceState += presenceAlpha * (input - presenceState)
        presenceBandState += presenceAlpha * q * (presenceState - presenceBandState)
        
        // The bandpass output
        let bandpass = presenceState - presenceBandState
        
        // Boost/cut (±6dB range like web app)
        return input + bandpass * presenceBoostLinear
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

    private func updateDetuneMultipliers() {
        detuneDownMultiplier = pow(2.0, -detune / 1200.0)
        detuneUpMultiplier = pow(2.0, detune / 1200.0)
    }

    private func updateEnvelopeCoefficients() {
        // Matches web setTargetAtTime-style constants while avoiding exp() in render.
        let attackTimeConstant = attack / 3
        let decayTimeConstant = decay / 3
        let releaseTimeConstant = release / 4

        attackCoeff = 1.0 - exp(-invSampleRate / attackTimeConstant)
        decayCoeff = 1.0 - exp(-invSampleRate / decayTimeConstant)
        releaseCoeff = 1.0 - exp(-invSampleRate / releaseTimeConstant)
    }

    private func updateSaturationCache() {
        saturationDrive = 1.0 + hardness * 3.0
        saturationNormalizer = tanh(saturationDrive)
    }

    private func updateToneShapingCache() {
        warmthAlpha = 250 * invSampleRate
        warmthBoostLinear = pow(10.0, (warmth * 8.0) / 20.0) - 1.0
        presenceAlpha = 3000 * invSampleRate
        presenceBoostLinear = pow(10.0, ((presence - 0.5) * 12.0) / 20.0) - 1.0
    }
    
    // MARK: - Public Interface
    
    func trigger(frequency: Float, velocity: Float) {
        self.targetFrequency = frequency
        self.velocity = velocity
        self.envelopeStage = .attack
    }
    
    func releaseNote() {
        envelopeStage = .release
    }
    
    func setADSR(attack: Float, decay: Float, sustain: Float, release: Float) {
        self.attack = max(0.01, attack)
        self.decay = max(0.01, decay)
        self.sustain = sustain
        self.release = max(0.01, release)
        updateEnvelopeCoefficients()
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
        updateSaturationCache()
    }
    
    func setOscBrightness(_ brightness: Int) {
        self.oscBrightness = min(max(brightness, 0), 3)
        updateOscillatorGains()
    }
    
    func setDetune(_ cents: Float) {
        self.detune = min(max(cents, 0), 100)
        updateDetuneMultipliers()
    }

    func setToneShaping(warmth: Float, presence: Float, airNoise: Float) {
        self.warmth = min(max(warmth, 0), 1)
        self.presence = min(max(presence, 0), 1)
        self.airNoise = min(max(airNoise, 0), 1)
        updateToneShapingCache()
    }

    func setOctaveShift(_ octave: Int) {
        self.octaveShift = min(max(octave, -2), 2)
        octaveMultiplier = pow(2.0, Float(octaveShift))
    }

    func hardReset() {
        envelope = 0
        envelopeStage = .off
        velocity = 0
        phase1 = 0
        phase2 = 0
        phase3 = 0
        phase4 = 0
        filterState = [0, 0]
        warmthState = 0
        presenceState = 0
        presenceBandState = 0
    }
}
