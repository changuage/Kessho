# Web Audio → iOS Audio Technical Porting Guide

## Audio Quality Maximization Strategy

### Sample Rate & Bit Depth

| Aspect | Web Audio | iOS (Recommended) | Notes |
|--------|-----------|-------------------|-------|
| Sample Rate | 44.1kHz (browser default) | 48kHz | iOS native rate, avoids resampling |
| Bit Depth | 32-bit float | 32-bit float | Both use Float32 processing |
| Buffer Size | 128-1024 samples | 256-512 samples | Lower = less latency, more CPU |
| Channels | Stereo | Stereo | Match for preset compatibility |

```swift
// AudioSessionManager.swift - Optimal quality configuration
func configureForMaxQuality() throws {
    let session = AVAudioSession.sharedInstance()
    
    // Use 48kHz - iOS native, no resampling artifacts
    try session.setPreferredSampleRate(48000)
    
    // 256 samples @ 48kHz = 5.3ms latency (good balance)
    try session.setPreferredIOBufferDuration(256.0 / 48000.0)
    
    // Playback category with high-quality mixing
    try session.setCategory(.playback, mode: .default, options: [])
    
    try session.setActive(true)
    
    // Verify we got what we asked for
    print("Actual sample rate: \(session.sampleRate)")
    print("Actual buffer duration: \(session.ioBufferDuration)")
}
```

### iOS Audio Quality Features

```swift
// Enable iOS audio quality enhancements
class HighQualityAudioEngine {
    let engine = AVAudioEngine()
    
    func configureForQuality() {
        let mainMixer = engine.mainMixerNode
        let output = engine.outputNode
        
        // Get the hardware format (48kHz stereo on most iOS devices)
        let hwFormat = output.outputFormat(forBus: 0)
        
        // Use maximum quality format for internal processing
        let processingFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: hwFormat.sampleRate,
            channels: 2,
            interleaved: false
        )!
        
        // Configure engine for non-interleaved processing (better for SIMD)
        engine.connect(mainMixer, to: output, format: processingFormat)
    }
}
```

---

## Parameter Mapping: SliderState → iOS Audio

### Master Mixer Parameters

```swift
// MixerParameters.swift
struct MixerParameters {
    // Web: masterVolume (0-1) → iOS: AVAudioMixerNode.outputVolume
    var masterVolume: Float = 0.7
    
    // Web: synthLevel (0-1) → iOS: synthMixer.outputVolume
    var synthLevel: Float = 0.6
    
    // Web: granularLevel (0-4) → iOS: granularMixer.outputVolume
    // Note: iOS uses 0-1 range, so scale: iosValue = webValue / 4.0
    var granularLevel: Float = 0.4
    
    // Web: reverbLevel (0-2) → iOS: reverbMixer.outputVolume
    // Note: iOS uses 0-1 range, so scale: iosValue = webValue / 2.0
    var reverbLevel: Float = 1.0
    
    // etc.
}

class AudioMixerManager {
    let mainMixer: AVAudioMixerNode
    let synthMixer: AVAudioMixerNode
    let granularMixer: AVAudioMixerNode
    let reverbMixer: AVAudioMixerNode
    let leadMixer: AVAudioMixerNode
    let oceanMixer: AVAudioMixerNode
    
    func applyPreset(_ state: SliderState) {
        // Direct 1:1 mapping for 0-1 range parameters
        mainMixer.outputVolume = Float(state.masterVolume)
        synthMixer.outputVolume = Float(state.synthLevel)
        leadMixer.outputVolume = Float(state.leadEnabled ? state.leadLevel : 0)
        
        // Scaled mapping for extended range parameters
        granularMixer.outputVolume = Float(state.granularLevel / 4.0)
        reverbMixer.outputVolume = Float(state.reverbLevel / 2.0)
        oceanMixer.outputVolume = Float(state.oceanWaveSynthLevel)
    }
}
```

### Filter Parameters → AVAudioUnitEQ

```swift
// FilterProcessor.swift
class FilterProcessor {
    // Use AVAudioUnitEQ for high-quality filtering
    let filterUnit: AVAudioUnitEQ
    
    init() {
        // Single band EQ acts as filter
        filterUnit = AVAudioUnitEQ(numberOfBands: 1)
        
        let band = filterUnit.bands[0]
        band.bypass = false
    }
    
    /// Maps Web Audio BiquadFilterNode parameters to iOS
    /// Web: filterType, filterCutoffMin/Max, filterQ, filterResonance
    func applyPreset(_ state: SliderState) {
        let band = filterUnit.bands[0]
        
        // Map filter type
        switch state.filterType {
        case "lowpass":
            band.filterType = .lowPass
        case "highpass":
            band.filterType = .highPass
        case "bandpass":
            band.filterType = .bandPass
        default:
            band.filterType = .lowPass
        }
        
        // Calculate current cutoff from modulation
        // Web uses random walk between min/max, iOS must replicate
        let cutoff = calculateModulatedCutoff(
            min: state.filterCutoffMin,
            max: state.filterCutoffMax,
            modValue: currentFilterModValue
        )
        
        band.frequency = Float(cutoff)
        
        // Map Q and resonance
        // Web: effectiveQ = filterQ + resonance * 8 * (0.7 + hardness * 0.6)
        let resonanceBoost = state.filterResonance * (0.7 + state.hardness * 0.6)
        let effectiveQ = state.filterQ + resonanceBoost * 8.0
        
        // AVAudioUnitEQ bandwidth is different from Q
        // bandwidth = frequency / Q, so we convert
        band.bandwidth = Float(cutoff / effectiveQ)
    }
    
    private func calculateModulatedCutoff(min: Double, max: Double, modValue: Double) -> Double {
        // Logarithmic interpolation for natural frequency sweep
        let logMin = log(min)
        let logMax = log(max)
        return exp(logMin + (logMax - logMin) * modValue)
    }
}
```

### Alternative: Custom Biquad Filter (Higher Quality)

For maximum quality matching the web implementation, use a custom biquad:

```swift
// BiquadFilter.swift - Direct port of Web Audio BiquadFilterNode
class BiquadFilter {
    private var b0: Double = 1, b1: Double = 0, b2: Double = 0
    private var a1: Double = 0, a2: Double = 0
    
    // State variables for each channel
    private var x1L: Double = 0, x2L: Double = 0
    private var y1L: Double = 0, y2L: Double = 0
    private var x1R: Double = 0, x2R: Double = 0
    private var y1R: Double = 0, y2R: Double = 0
    
    var type: FilterType = .lowpass
    var frequency: Double = 1000 { didSet { recalculateCoefficients() } }
    var q: Double = 1.0 { didSet { recalculateCoefficients() } }
    var sampleRate: Double = 48000 { didSet { recalculateCoefficients() } }
    
    enum FilterType { case lowpass, highpass, bandpass }
    
    private func recalculateCoefficients() {
        let w0 = 2.0 * .pi * frequency / sampleRate
        let cosW0 = cos(w0)
        let sinW0 = sin(w0)
        let alpha = sinW0 / (2.0 * q)
        
        var a0: Double = 1
        
        switch type {
        case .lowpass:
            b0 = (1 - cosW0) / 2
            b1 = 1 - cosW0
            b2 = (1 - cosW0) / 2
            a0 = 1 + alpha
            a1 = -2 * cosW0
            a2 = 1 - alpha
            
        case .highpass:
            b0 = (1 + cosW0) / 2
            b1 = -(1 + cosW0)
            b2 = (1 + cosW0) / 2
            a0 = 1 + alpha
            a1 = -2 * cosW0
            a2 = 1 - alpha
            
        case .bandpass:
            b0 = alpha
            b1 = 0
            b2 = -alpha
            a0 = 1 + alpha
            a1 = -2 * cosW0
            a2 = 1 - alpha
        }
        
        // Normalize
        b0 /= a0; b1 /= a0; b2 /= a0
        a1 /= a0; a2 /= a0
    }
    
    /// Process stereo buffer - matches Web Audio exactly
    func process(_ buffer: AVAudioPCMBuffer) {
        guard let leftChannel = buffer.floatChannelData?[0],
              let rightChannel = buffer.floatChannelData?[1] else { return }
        
        let frameCount = Int(buffer.frameLength)
        
        for i in 0..<frameCount {
            // Left channel
            let xL = Double(leftChannel[i])
            let yL = b0 * xL + b1 * x1L + b2 * x2L - a1 * y1L - a2 * y2L
            x2L = x1L; x1L = xL
            y2L = y1L; y1L = yL
            leftChannel[i] = Float(yL)
            
            // Right channel
            let xR = Double(rightChannel[i])
            let yR = b0 * xR + b1 * x1R + b2 * x2R - a1 * y1R - a2 * y2R
            x2R = x1R; x1R = xR
            y2R = y1R; y1R = yR
            rightChannel[i] = Float(yR)
        }
    }
}
```

### Synth Voice Parameters → Oscillator Generation

```swift
// VoiceOscillator.swift
class VoiceOscillator {
    var sampleRate: Double = 48000
    var phase: Double = 0
    
    /// Web: oscBrightness (0-3) determines waveform mix
    /// iOS: Generate waveform samples directly
    func generateSample(frequency: Double, oscBrightness: Int, detune: Double) -> (Float, Float) {
        // Calculate detuned frequencies (matches web exactly)
        let freq1 = frequency  // sine/base
        let freq2 = frequency * pow(2.0, -detune / 1200.0)  // detuned down
        let freq3 = frequency * pow(2.0, detune / 1200.0)   // detuned up
        let freq4 = frequency  // saw base
        
        // Generate waveforms
        let sine = sin(phase * 2.0 * .pi * freq1 / sampleRate)
        let triangle = generateTriangle(phase * freq1 / sampleRate)
        let sawDetuned = generateSawtooth(phase * freq3 / sampleRate)
        let saw = generateSawtooth(phase * freq4 / sampleRate)
        
        // Mix based on brightness (matches web getOscillatorGains)
        var sample: Double
        switch oscBrightness {
        case 0:  // Sine only
            sample = sine
        case 1:  // Triangle dominant
            sample = 0.2 * sine + 0.8 * triangle
        case 2:  // Saw + Triangle mix
            sample = 0.4 * triangle + 0.3 * sawDetuned + 0.3 * saw
        case 3:  // Sawtooth
            sample = 0.5 * sawDetuned + 0.5 * saw
        default:
            sample = 0.4 * triangle + 0.3 * sawDetuned + 0.3 * saw
        }
        
        phase += 1.0
        if phase >= sampleRate { phase -= sampleRate }
        
        return (Float(sample), Float(sample))
    }
    
    private func generateTriangle(_ t: Double) -> Double {
        let t = t.truncatingRemainder(dividingBy: 1.0)
        if t < 0.25 { return 4.0 * t }
        else if t < 0.75 { return 2.0 - 4.0 * t }
        else { return -4.0 + 4.0 * t }
    }
    
    private func generateSawtooth(_ t: Double) -> Double {
        let t = t.truncatingRemainder(dividingBy: 1.0)
        return 2.0 * t - 1.0
    }
}
```

### ADSR Envelope → iOS Implementation

```swift
// ADSREnvelope.swift - Matches Web Audio setTargetAtTime behavior
class ADSREnvelope {
    enum State { case idle, attack, decay, sustain, release }
    
    private var state: State = .idle
    private var level: Double = 0
    private var sampleRate: Double = 48000
    
    // Preset parameters (from SliderState)
    var attack: Double = 0.1    // synthAttack
    var decay: Double = 0.3     // synthDecay  
    var sustain: Double = 0.5   // synthSustain
    var release: Double = 1.0   // synthRelease
    
    private var targetLevel: Double = 0
    private var timeConstant: Double = 0.1
    
    /// Trigger note on - matches web voice envelope behavior
    func noteOn() {
        state = .attack
        targetLevel = 1.0
        // Web uses setTargetAtTime with time constant = attack/3
        timeConstant = attack / 3.0
    }
    
    /// Trigger note off
    func noteOff() {
        state = .release
        targetLevel = 0.0
        timeConstant = release / 4.0  // Web uses release/4
    }
    
    /// Generate next envelope sample - exponential approach
    func nextSample() -> Double {
        switch state {
        case .idle:
            return 0
            
        case .attack:
            // Exponential approach to 1.0
            level += (targetLevel - level) * (1.0 / (timeConstant * sampleRate))
            if level >= 0.99 {
                state = .decay
                targetLevel = sustain
                timeConstant = decay / 3.0
            }
            
        case .decay:
            level += (targetLevel - level) * (1.0 / (timeConstant * sampleRate))
            if abs(level - sustain) < 0.001 {
                state = .sustain
                level = sustain
            }
            
        case .sustain:
            level = sustain
            
        case .release:
            level += (targetLevel - level) * (1.0 / (timeConstant * sampleRate))
            if level < 0.001 {
                state = .idle
                level = 0
            }
        }
        
        return level
    }
}
```

### Saturation/Hardness → Waveshaper

```swift
// Waveshaper.swift - Soft clip saturation matching web
class Waveshaper {
    private var curve: [Float] = []
    private var hardness: Double = 0.3
    
    init() {
        updateCurve(hardness: 0.3)
    }
    
    /// Web: hardness (0-1) creates saturation curve
    /// curve[i] = tanh(x * drive) / tanh(drive) where drive = 1 + hardness * 3
    func updateCurve(hardness: Double) {
        self.hardness = hardness
        let samples = 256
        curve = [Float](repeating: 0, count: samples)
        
        let drive = 1.0 + hardness * 3.0
        let tanhDrive = tanh(drive)
        
        for i in 0..<samples {
            let x = (Double(i) / Double(samples - 1)) * 2.0 - 1.0
            curve[i] = Float(tanh(x * drive) / tanhDrive)
        }
    }
    
    /// Apply saturation to buffer
    func process(_ buffer: AVAudioPCMBuffer) {
        guard !curve.isEmpty else { return }
        
        let frameCount = Int(buffer.frameLength)
        let channels = Int(buffer.format.channelCount)
        
        for ch in 0..<channels {
            guard let channelData = buffer.floatChannelData?[ch] else { continue }
            
            for i in 0..<frameCount {
                let input = channelData[i]
                // Map input [-1, 1] to curve index [0, 255]
                let normalized = (input + 1.0) * 0.5  // 0 to 1
                let index = min(255, max(0, Int(normalized * 255)))
                
                // Linear interpolation for smoother result
                let frac = (normalized * 255) - Float(index)
                let nextIndex = min(255, index + 1)
                channelData[i] = curve[index] * (1 - frac) + curve[nextIndex] * frac
            }
        }
    }
}
```

### Warmth & Presence → Shelf/Peaking EQ

```swift
// ToneShaping.swift
class ToneShaping {
    let warmthFilter: AVAudioUnitEQ  // Low shelf
    let presenceFilter: AVAudioUnitEQ  // Peaking
    
    init() {
        warmthFilter = AVAudioUnitEQ(numberOfBands: 1)
        presenceFilter = AVAudioUnitEQ(numberOfBands: 1)
        
        // Configure warmth (low shelf at 250Hz)
        let warmthBand = warmthFilter.bands[0]
        warmthBand.filterType = .lowShelf
        warmthBand.frequency = 250
        warmthBand.bypass = false
        
        // Configure presence (peaking at 3kHz)
        let presenceBand = presenceFilter.bands[0]
        presenceBand.filterType = .parametric
        presenceBand.frequency = 3000
        presenceBand.bandwidth = 1.25  // Q ≈ 0.8
        presenceBand.bypass = false
    }
    
    /// Web: warmth (0-1) → 0 to +8dB low shelf
    /// Web: presence (0-1) → -6dB to +6dB peaking (0.5 = neutral)
    func applyPreset(_ state: SliderState) {
        // Warmth: 0-1 maps to 0-8dB boost
        warmthFilter.bands[0].gain = Float(state.warmth * 8.0)
        
        // Presence: 0-1 maps to -6dB to +6dB
        presenceFilter.bands[0].gain = Float((state.presence - 0.5) * 12.0)
    }
}
```

---

## Granular Processor → Custom AUAudioUnit

```swift
// GranulatorAudioUnit.swift
class GranulatorAudioUnit: AUAudioUnit {
    // Parameter tree matching web worklet params
    private var _parameterTree: AUParameterTree!
    
    // Parameters mapped from SliderState
    private var grainSizeMin: Float = 0.05
    private var grainSizeMax: Float = 0.15
    private var density: Float = 10
    private var spray: Float = 0.5
    private var jitter: Float = 0.3
    private var probability: Float = 0.8
    private var pitchSpread: Float = 0.5
    private var stereoSpread: Float = 0.5
    private var feedback: Float = 0.3
    
    // Internal state (matches web worklet)
    private var buffer: [Float] = []  // 4-second circular buffer
    private var writeHead: Int = 0
    private var grains: [Grain] = []
    private var rngSequence: [Float] = []
    private var rngIndex: Int = 0
    
    struct Grain {
        var active: Bool = false
        var position: Float = 0
        var size: Float = 0.1
        var phase: Float = 0
        var pan: Float = 0.5
        var pitchRatio: Float = 1.0
    }
    
    override init(componentDescription: AudioComponentDescription,
                  options: AudioComponentInstantiationOptions = []) throws {
        try super.init(componentDescription: componentDescription, options: options)
        
        // Initialize 4-second stereo buffer at 48kHz
        let bufferSize = 48000 * 4 * 2
        buffer = [Float](repeating: 0, count: bufferSize)
        
        // Initialize grain pool (64 grains like web)
        grains = (0..<64).map { _ in Grain() }
        
        setupParameterTree()
    }
    
    private func setupParameterTree() {
        let params: [AUParameter] = [
            AUParameterTree.createParameter(
                withIdentifier: "grainSizeMin", name: "Grain Size Min",
                address: 0, min: 0.01, max: 0.5, unit: .seconds,
                unitName: nil, flags: .default, valueStrings: nil, dependentParameters: nil
            ),
            AUParameterTree.createParameter(
                withIdentifier: "grainSizeMax", name: "Grain Size Max",
                address: 1, min: 0.01, max: 0.5, unit: .seconds,
                unitName: nil, flags: .default, valueStrings: nil, dependentParameters: nil
            ),
            AUParameterTree.createParameter(
                withIdentifier: "density", name: "Density",
                address: 2, min: 1, max: 50, unit: .hertz,
                unitName: nil, flags: .default, valueStrings: nil, dependentParameters: nil
            ),
            // ... add all other parameters
        ]
        
        _parameterTree = AUParameterTree.createTree(withChildren: params)
    }
    
    /// Apply preset parameters from SliderState
    func applyPreset(_ state: SliderState) {
        grainSizeMin = Float(state.grainSizeMin)
        grainSizeMax = Float(state.grainSizeMax)
        density = Float(state.density)
        spray = Float(state.spray)
        jitter = Float(state.jitter)
        probability = Float(state.grainProbability)
        pitchSpread = Float(state.pitchSpread)
        stereoSpread = Float(state.stereoSpread)
        feedback = min(Float(state.feedback), 0.35)  // Clamp like web
    }
    
    /// Set random sequence (from RNG, matches web behavior)
    func setRandomSequence(_ sequence: [Float]) {
        rngSequence = sequence
        rngIndex = 0
    }
    
    private func nextRandom() -> Float {
        guard !rngSequence.isEmpty else { return Float.random(in: 0...1) }
        let value = rngSequence[rngIndex]
        rngIndex = (rngIndex + 1) % rngSequence.count
        return value
    }
    
    // Harmonic intervals (matches web granulator.worklet.js)
    private let harmonicIntervals: [Float] = [
        0.5,      // octave down
        0.667,    // fifth down  
        0.75,     // fourth down
        1.0,      // unison
        1.0,      // unison
        1.0,      // unison (weighted)
        1.333,    // fourth up
        1.5,      // fifth up
        2.0       // octave up
    ]
    
    // Hann window lookup (matches web)
    private lazy var hannWindow: [Float] = {
        (0..<256).map { i in
            let t = Float(i) / 255.0
            return 0.5 - 0.5 * cos(2.0 * .pi * t)
        }
    }()
}
```

---

## FDN Reverb → Custom AUAudioUnit

```swift
// FDNReverbAudioUnit.swift  
class FDNReverbAudioUnit: AUAudioUnit {
    // Match web reverb.worklet.js structure
    private var delayLines: [[Float]] = []  // 8 delay lines
    private var delayTimes: [Int] = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116]  // Prime-based
    private var writeHeads: [Int] = []
    
    // Diffuser chains (pre/mid/post)
    private var preDiffusers: [AllpassDiffuser] = []
    private var midDiffusers: [AllpassDiffuser] = []
    private var postDiffusers: [AllpassDiffuser] = []
    
    // Parameters from SliderState
    private var decay: Float = 4.0
    private var size: Float = 0.7
    private var diffusion: Float = 0.8
    private var modulation: Float = 0.3
    private var predelay: Float = 0.02
    private var damping: Float = 0.5
    private var width: Float = 0.8
    
    // Hadamard mixing matrix (8x8)
    // This is what creates the dense reverb tail
    private let hadamard: [[Float]] = [
        [ 1,  1,  1,  1,  1,  1,  1,  1],
        [ 1, -1,  1, -1,  1, -1,  1, -1],
        [ 1,  1, -1, -1,  1,  1, -1, -1],
        [ 1, -1, -1,  1,  1, -1, -1,  1],
        [ 1,  1,  1,  1, -1, -1, -1, -1],
        [ 1, -1,  1, -1, -1,  1, -1,  1],
        [ 1,  1, -1, -1, -1, -1,  1,  1],
        [ 1, -1, -1,  1, -1,  1,  1, -1]
    ].map { row in row.map { Float($0) / sqrt(8.0) } }  // Normalize
    
    /// Apply preset - maps SliderState to reverb params
    func applyPreset(_ state: SliderState) {
        decay = Float(state.reverbDecay)
        size = Float(state.reverbSize)
        diffusion = Float(state.reverbDiffusion)
        modulation = Float(state.reverbModulation)
        predelay = Float(state.predelay)
        damping = Float(state.damping)
        width = Float(state.width)
        
        // Update delay line sizes based on size parameter
        updateDelayLineSizes()
        
        // Update damping filters
        updateDampingFilters()
    }
    
    private func updateDelayLineSizes() {
        // Scale base delay times by size (0.5x to 1.5x)
        let sizeScale = 0.5 + size
        for i in 0..<8 {
            let newTime = Int(Float(delayTimes[i]) * sizeScale)
            // Resize delay line if needed
            if delayLines[i].count < newTime {
                delayLines[i] = [Float](repeating: 0, count: newTime)
                writeHeads[i] = 0
            }
        }
    }
}

// Allpass diffuser for reverb density
class AllpassDiffuser {
    private var buffer: [Float]
    private var writeHead: Int = 0
    private var delaySamples: Int
    private var coefficient: Float
    
    init(delaySamples: Int, coefficient: Float = 0.5) {
        self.delaySamples = delaySamples
        self.coefficient = coefficient
        self.buffer = [Float](repeating: 0, count: delaySamples)
    }
    
    func process(_ input: Float) -> Float {
        let readHead = (writeHead - delaySamples + buffer.count) % buffer.count
        let delayed = buffer[readHead]
        
        let output = -coefficient * input + delayed
        buffer[writeHead] = input + coefficient * output
        
        writeHead = (writeHead + 1) % buffer.count
        return output
    }
}
```

---

## Lead Synth FM → iOS Implementation

```swift
// FMLeadSynth.swift
class FMLeadSynth {
    let sampleRate: Double = 48000
    
    // Modulator configuration (matches web exactly)
    struct Modulator {
        var ratio: Double        // Frequency ratio to carrier
        var index: Double        // Modulation index (depth)
        var phase: Double = 0
    }
    
    // Web modulators: [1.0, 3.0, 5.04, 7.02]
    private var modulators: [Modulator] = [
        Modulator(ratio: 1.0, index: 0),   // Octave below feel
        Modulator(ratio: 3.0, index: 0),   // Octave + fifth
        Modulator(ratio: 5.04, index: 0),  // Inharmonic (gamelan)
        Modulator(ratio: 7.02, index: 0)   // Metallic overtone
    ]
    
    private var carrierPhase: Double = 0
    private var envelope = ADSREnvelope()
    
    /// Web: leadTimbre (0-1) controls which modulators are active
    /// 0 = Rhodes (mod 0,1), 0.5 = hybrid, 1 = Gamelan (mod 2,3)
    func applyPreset(_ state: SliderState) {
        let timbre = state.leadTimbre
        
        // Modulator 0: octave - fades in 0 to 0.5, out 0.5 to 1
        modulators[0].index = timbre < 0.5 
            ? timbre * 2.0 * 2.0  // 0→2
            : (1.0 - timbre) * 2.0 * 2.0  // 2→0
        
        // Modulator 1: fifth - similar bell tone
        modulators[1].index = timbre < 0.5
            ? timbre * 2.0 * 1.5
            : (1.0 - timbre) * 2.0 * 1.5
        
        // Modulator 2: inharmonic - fades in from 0.3
        modulators[2].index = max(0, (timbre - 0.3) / 0.7) * 3.0
        
        // Modulator 3: metallic - fades in from 0.5  
        modulators[3].index = max(0, (timbre - 0.5) / 0.5) * 2.5
        
        // Envelope from preset
        envelope.attack = state.leadAttack
        envelope.decay = state.leadDecay
        envelope.sustain = state.leadSustain
        envelope.release = state.leadRelease
    }
    
    /// Generate FM sample for given carrier frequency
    func generateSample(carrierFreq: Double) -> Float {
        var modSum: Double = 0
        
        // Sum all modulator contributions
        for i in 0..<modulators.count {
            let modFreq = carrierFreq * modulators[i].ratio
            let modPhaseInc = modFreq / sampleRate
            modulators[i].phase += modPhaseInc
            if modulators[i].phase >= 1.0 { modulators[i].phase -= 1.0 }
            
            modSum += sin(modulators[i].phase * 2.0 * .pi) * modulators[i].index
        }
        
        // Carrier with phase modulation
        let carrierPhaseInc = carrierFreq / sampleRate
        carrierPhase += carrierPhaseInc
        if carrierPhase >= 1.0 { carrierPhase -= 1.0 }
        
        let carrier = sin((carrierPhase + modSum) * 2.0 * .pi)
        
        // Apply envelope
        let env = envelope.nextSample()
        
        return Float(carrier * env)
    }
}
```

---

## Ping-Pong Delay → iOS

```swift
// PingPongDelay.swift
class PingPongDelay {
    private var leftBuffer: [Float] = []
    private var rightBuffer: [Float] = []
    private var writeHeadL: Int = 0
    private var writeHeadR: Int = 0
    
    private var delayTimeL: Int = 0  // In samples
    private var delayTimeR: Int = 0
    private var feedback: Float = 0.4
    private var mix: Float = 0.35
    
    let sampleRate: Int = 48000
    
    init() {
        // Max 2 second delay
        let maxSamples = sampleRate * 2
        leftBuffer = [Float](repeating: 0, count: maxSamples)
        rightBuffer = [Float](repeating: 0, count: maxSamples)
    }
    
    /// Apply preset - maps leadDelay* parameters
    func applyPreset(_ state: SliderState) {
        // Web: leadDelayTime in ms
        delayTimeL = Int(state.leadDelayTime / 1000.0 * Double(sampleRate))
        delayTimeR = Int(state.leadDelayTime * 0.75 / 1000.0 * Double(sampleRate))  // Offset
        
        feedback = Float(state.leadDelayFeedback)
        mix = Float(state.leadDelayMix)
    }
    
    /// Process stereo - matches web ping-pong routing
    func process(inputL: Float, inputR: Float) -> (Float, Float) {
        // Read from delay lines
        let readL = (writeHeadL - delayTimeL + leftBuffer.count) % leftBuffer.count
        let readR = (writeHeadR - delayTimeR + rightBuffer.count) % rightBuffer.count
        
        let delayedL = leftBuffer[readL]
        let delayedR = rightBuffer[readR]
        
        // Ping-pong: L feeds R, R feeds L (cross-feedback)
        leftBuffer[writeHeadL] = inputL + delayedR * feedback
        rightBuffer[writeHeadR] = inputR + delayedL * feedback
        
        writeHeadL = (writeHeadL + 1) % leftBuffer.count
        writeHeadR = (writeHeadR + 1) % rightBuffer.count
        
        // Mix dry and wet
        let outL = inputL * (1 - mix) + delayedL * mix
        let outR = inputR * (1 - mix) + delayedR * mix
        
        return (outL, outR)
    }
}
```

---

## Complete Parameter Compatibility Table

| SliderState Property | Web Audio Target | iOS Target | Value Mapping |
|---------------------|------------------|------------|---------------|
| `masterVolume` | `masterGain.gain` | `mainMixer.outputVolume` | 1:1 |
| `synthLevel` | `synthDirect.gain` | `synthMixer.outputVolume` | 1:1 |
| `granularLevel` | `granularDirect.gain` | `granularMixer.outputVolume` | ÷4 |
| `reverbLevel` | `reverbOutputGain.gain` | `reverbMixer.outputVolume` | ÷2 |
| `leadLevel` | `leadGain.gain` | `leadMixer.outputVolume` | 1:1 |
| `oscBrightness` | osc gain mix | waveform generator | 0-3 enum |
| `detune` | `osc.frequency` offset | phase increment offset | cents |
| `filterType` | `filter.type` | `filterBand.filterType` | enum map |
| `filterCutoffMin/Max` | modulated `filter.frequency` | modulated frequency | Hz (log interp) |
| `filterQ` | `filter.Q` | `filterBand.bandwidth` | Q → BW |
| `filterResonance` | Q boost | Q boost | × (0.7 + hardness×0.6) × 8 |
| `warmth` | `warmthFilter.gain` | `warmthBand.gain` | × 8 dB |
| `presence` | `presenceFilter.gain` | `presenceBand.gain` | (v-0.5) × 12 dB |
| `hardness` | saturation curve | waveshaper curve | tanh(x×drive) |
| `airNoise` | `noiseGain.gain` | noise level | × 0.1 |
| `synthAttack/Decay/Sustain/Release` | envelope timing | ADSR envelope | seconds |
| `grainSize*` | worklet param | AU param | seconds |
| `density` | worklet param | AU param | grains/sec |
| `spray/jitter` | worklet param | AU param | 0-1 |
| `feedback` | worklet param (clamped 0.35) | AU param | clamped |
| `reverbDecay` | worklet param | FDN decay | seconds |
| `reverbSize` | worklet param | delay line scale | 0.5-1.5× |
| `damping` | worklet param | LP filter cutoff | 0-1 |
| `leadTimbre` | FM mod indices | mod index array | 0-1 morphs |
| `leadDelayTime` | `delayL/R.delayTime` | delay samples | ms → samples |
| `leadDelayFeedback` | feedback gains | feedback | 0-0.9 |

---

## iOS Audio Graph Assembly

```swift
// AudioEngine.swift - Complete iOS audio graph matching web
class AudioEngine {
    let engine = AVAudioEngine()
    
    // Nodes
    let polySynth: PolySynthNode
    let granulator: GranulatorAudioUnit
    let reverb: FDNReverbAudioUnit
    let leadSynth: FMLeadSynth
    let pingPongDelay: PingPongDelay
    let oceanSynth: OceanSynthNode
    let limiter: AVAudioUnitDynamicsProcessor
    
    // Mixers (for level control)
    let synthMixer = AVAudioMixerNode()
    let granularMixer = AVAudioMixerNode()
    let reverbMixer = AVAudioMixerNode()
    let leadMixer = AVAudioMixerNode()
    let oceanMixer = AVAudioMixerNode()
    let mainMixer: AVAudioMixerNode  // engine.mainMixerNode
    
    // Send mixers (for reverb routing)
    let synthReverbSend = AVAudioMixerNode()
    let granularReverbSend = AVAudioMixerNode()
    let leadReverbSend = AVAudioMixerNode()
    
    init() throws {
        // Initialize custom audio units
        polySynth = try PolySynthNode()
        granulator = try GranulatorAudioUnit(...)
        reverb = try FDNReverbAudioUnit(...)
        leadSynth = FMLeadSynth()
        pingPongDelay = PingPongDelay()
        oceanSynth = try OceanSynthNode()
        
        limiter = AVAudioUnitDynamicsProcessor()
        limiter.threshold = -3
        limiter.headRoom = 0
        limiter.attackTime = 0.001
        limiter.releaseTime = 0.1
        
        mainMixer = engine.mainMixerNode
        
        // Attach all nodes
        attachNodes()
        
        // Connect graph (matches web topology)
        connectGraph()
    }
    
    private func attachNodes() {
        engine.attach(polySynth.node)
        engine.attach(granulator)
        engine.attach(reverb)
        engine.attach(leadSynth.node)
        engine.attach(oceanSynth.node)
        engine.attach(limiter)
        engine.attach(synthMixer)
        engine.attach(granularMixer)
        engine.attach(reverbMixer)
        engine.attach(leadMixer)
        engine.attach(oceanMixer)
        engine.attach(synthReverbSend)
        engine.attach(granularReverbSend)
        engine.attach(leadReverbSend)
    }
    
    private func connectGraph() {
        let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
        
        // Poly synth → granulator (and dry path)
        engine.connect(polySynth.node, to: granulator, format: format)
        engine.connect(polySynth.node, to: synthMixer, format: format)
        engine.connect(polySynth.node, to: synthReverbSend, format: format)
        
        // Granulator → granular mixer (and reverb send)
        engine.connect(granulator, to: granularMixer, format: format)
        engine.connect(granulator, to: granularReverbSend, format: format)
        
        // Lead synth → lead mixer (and reverb send)
        engine.connect(leadSynth.node, to: leadMixer, format: format)
        engine.connect(leadSynth.node, to: leadReverbSend, format: format)
        
        // Ocean → ocean mixer
        engine.connect(oceanSynth.node, to: oceanMixer, format: format)
        
        // All reverb sends → reverb
        engine.connect(synthReverbSend, to: reverb, format: format)
        engine.connect(granularReverbSend, to: reverb, format: format)
        engine.connect(leadReverbSend, to: reverb, format: format)
        
        // Reverb → reverb mixer
        engine.connect(reverb, to: reverbMixer, format: format)
        
        // All mixers → main mixer
        engine.connect(synthMixer, to: mainMixer, format: format)
        engine.connect(granularMixer, to: mainMixer, format: format)
        engine.connect(reverbMixer, to: mainMixer, format: format)
        engine.connect(leadMixer, to: mainMixer, format: format)
        engine.connect(oceanMixer, to: mainMixer, format: format)
        
        // Main mixer → limiter → output
        engine.connect(mainMixer, to: limiter, format: format)
        engine.connect(limiter, to: engine.outputNode, format: format)
    }
    
    /// Apply full preset - propagates to all components
    func applyPreset(_ state: SliderState) {
        // Mixer levels
        mainMixer.outputVolume = Float(state.masterVolume)
        synthMixer.outputVolume = Float(state.synthLevel)
        granularMixer.outputVolume = Float(state.granularLevel / 4.0)
        reverbMixer.outputVolume = Float(state.reverbLevel / 2.0)
        leadMixer.outputVolume = Float(state.leadEnabled ? state.leadLevel : 0)
        oceanMixer.outputVolume = Float(state.oceanWaveSynthLevel)
        
        // Reverb send levels
        synthReverbSend.outputVolume = Float(state.synthReverbSend)
        granularReverbSend.outputVolume = Float(state.granularReverbSend)
        leadReverbSend.outputVolume = Float(state.leadReverbSend)
        
        // Component-specific parameters
        polySynth.applyPreset(state)
        granulator.applyPreset(state)
        reverb.applyPreset(state)
        leadSynth.applyPreset(state)
        pingPongDelay.applyPreset(state)
        oceanSynth.applyPreset(state)
    }
}
```

This ensures **every preset parameter** maps identically between web and iOS, producing the same audio output for maximum compatibility and quality.
