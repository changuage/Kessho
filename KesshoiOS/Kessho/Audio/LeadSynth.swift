import AVFoundation

// Pre-computed sine lookup table for fast FM synthesis
private let SINE_TABLE_SIZE = 2048
private var sineTable: [Float] = {
    var table = [Float](repeating: 0, count: SINE_TABLE_SIZE)
    for i in 0..<SINE_TABLE_SIZE {
        table[i] = sin(Float(i) / Float(SINE_TABLE_SIZE) * 2 * .pi)
    }
    return table
}()

/// Fast sine approximation using lookup table with linear interpolation
@inline(__always)
private func fastSin(_ phase: Float) -> Float {
    // phase is 0-1, wrap to positive
    var p = phase
    if p < 0 { p += 1 }
    if p >= 1 { p -= 1 }
    let scaledPhase = p * Float(SINE_TABLE_SIZE)
    let index = Int(scaledPhase)
    let frac = scaledPhase - Float(index)
    let i0 = index & (SINE_TABLE_SIZE - 1)
    let i1 = (index + 1) & (SINE_TABLE_SIZE - 1)
    return sineTable[i0] + frac * (sineTable[i1] - sineTable[i0])
}

/// Lead melody synthesizer - monophonic with FM synthesis (Rhodes→Gamelan morph), glide, and stereo ping-pong delay
/// Matches web app: timbre 0 = soft Rhodes, timbre 1 = metallic gamelan
class LeadSynth {
    let node: AVAudioSourceNode
    
    private var enabled: Bool = false
    private var frequency: Float = 440
    private var targetFrequency: Float = 440
    private var velocity: Float = 0
    
    // FM oscillator phases - 2 carriers + 4 modulators (matching web app)
    private var carrier1Phase: Float = 0
    private var carrier2Phase: Float = 0  // Gamelan shimmer (only when timbre > 0.1)
    private var mod1Phase: Float = 0
    private var mod2Phase: Float = 0
    private var mod3Phase: Float = 0
    private var mod4Phase: Float = 0
    
    // Envelope
    private var envelope: Float = 0
    private var envelopeStage: EnvelopeStage = .off
    private var attack: Float = 0.1
    private var decay: Float = 0.3
    private var sustain: Float = 0.4
    private var hold: Float = 0.5      // How long to hold at sustain level
    private var holdCounter: Float = 0 // Counts down hold time in samples
    private var release: Float = 0.8
    
    // Glide (min/max for per-note randomization)
    private var glideRate: Float = 0.995  // Current portamento speed
    private var glideMin: Float = 0.2
    private var glideMax: Float = 0.4
    
    // Vibrato (min/max for per-note randomization)
    private var vibratoPhase: Float = 0
    private var vibratoDepth: Float = 0.1  // semitones (current value)
    private var vibratoRate: Float = 5     // Hz (current value)
    private var vibratoDepthMin: Float = 0.05
    private var vibratoDepthMax: Float = 0.15
    private var vibratoRateMin: Float = 4.0
    private var vibratoRateMax: Float = 6.0
    
    // Timbre: 0 = soft Rhodes, 1 = metallic gamelan
    private var timbreMin: Float = 0.2
    private var timbreMax: Float = 0.6
    private var currentTimbre: Float = 0.4
    
    // Stereo ping-pong delay (min/max for per-note randomization)
    private var delayBufferL: [Float] = []
    private var delayBufferR: [Float] = []
    private var delayWriteIndexL: Int = 0
    private var delayWriteIndexR: Int = 0
    private var delayTime: Float = 0.375     // seconds (current value)
    private var delayFeedback: Float = 0.4   // current value
    private var delayMix: Float = 0.35       // current value
    private var delayTimeMin: Float = 0.3
    private var delayTimeMax: Float = 0.45
    private var delayFeedbackMin: Float = 0.3
    private var delayFeedbackMax: Float = 0.5
    private var delayMixMin: Float = 0.25
    private var delayMixMax: Float = 0.45
    private let maxDelayTime: Float = 2.0    // 2 seconds max (matches web app)
    
    private let sampleRate: Float = 44100
    private let invSampleRate: Float = 1.0 / 44100  // Pre-computed to avoid division per sample
    
    enum EnvelopeStage {
        case off, attack, decay, sustain, release
    }
    
    init() {
        // Initialize stereo delay buffers
        let bufferSize = Int(44100 * maxDelayTime)
        delayBufferL = [Float](repeating: 0, count: bufferSize)
        delayBufferR = [Float](repeating: 0, count: bufferSize)
        
        node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self, self.enabled else {
                // Output silence if disabled
                let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
                for frame in 0..<Int(frameCount) {
                    for buffer in ablPointer {
                        buffer.mData?.assumingMemoryBound(to: Float.self)[frame] = 0
                    }
                }
                return noErr
            }
            
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard ablPointer.count >= 2,
                  let leftBuffer = ablPointer[0].mData?.assumingMemoryBound(to: Float.self),
                  let rightBuffer = ablPointer[1].mData?.assumingMemoryBound(to: Float.self)
            else { return noErr }
            
            for frame in 0..<Int(frameCount) {
                let (left, right) = self.generateStereoSample()
                leftBuffer[frame] = left
                rightBuffer[frame] = right
            }
            
            return noErr
        }
    }
    
    private func generateStereoSample() -> (Float, Float) {
        // Glide toward target frequency
        frequency += (targetFrequency - frequency) * (1 - glideRate)
        
        // Apply vibrato (use standard sin for vibrato - only 1 call per sample)
        vibratoPhase += vibratoRate * invSampleRate
        if vibratoPhase > 1 { vibratoPhase -= 1 }
        let vibrato = fastSin(vibratoPhase) * vibratoDepth
        let modulatedFreq = frequency * pow(2, vibrato / 12)
        
        let timbre = currentTimbre
        
        // === FM RATIOS (matching web app) ===
        // Timbre controls: 0 = soft Rhodes, 1 = gamelan metallophone
        let fmRatio1 = 1.0 + timbre * 1.4          // 1.0 → 2.4
        let fmRatio2 = 2.0 + timbre * 2.0          // 2.0 → 4.0
        let fmRatio3 = 3.0 + timbre * 2.5          // Only at timbre > 0.5
        let fmRatio4 = 0.5 + timbre * 0.15         // Sub-harmonic, timbre > 0.4
        
        // === FM MODULATION INDICES (matching web app) ===
        let baseIndex = 0.25 + timbre * 1.8
        let modIndex1 = modulatedFreq * baseIndex * velocity
        let modIndex2 = modulatedFreq * (0.08 + timbre * 0.35)
        let modIndex3 = timbre > 0.5 ? modulatedFreq * (timbre - 0.5) * 0.4 : 0
        let modIndex4 = timbre > 0.4 ? modulatedFreq * (timbre - 0.4) * 0.25 : 0
        
        // === MODULATORS (using fast sine lookup) ===
        let mod1 = fastSin(mod1Phase) * modIndex1 / modulatedFreq
        let mod2 = fastSin(mod2Phase) * modIndex2 / modulatedFreq
        let mod3 = fastSin(mod3Phase) * modIndex3 / modulatedFreq
        let mod4 = fastSin(mod4Phase) * modIndex4 / modulatedFreq
        
        // === CARRIER 1 (main tone - using fast sine) ===
        let fmAmount = mod1 + mod2 + mod3 + mod4
        var carrier1 = fastSin(carrier1Phase + fmAmount / (2 * .pi))
        
        // === CARRIER 2 (gamelan shimmer - only when timbre > 0.1) ===
        var carrier2: Float = 0
        if timbre > 0.1 {
            // Slight detuning for beating effect
            let beatDetune = timbre * 2.0 / 1200.0  // cents to ratio
            let carrier2Freq = modulatedFreq * pow(2, beatDetune)
            carrier2 = fastSin(carrier2Phase + fmAmount / (2 * .pi)) * timbre * 0.5
            carrier2Phase += carrier2Freq * invSampleRate
            if carrier2Phase >= 1 { carrier2Phase -= 1 }
        }
        
        // Update modulator phases (using pre-computed inverse for efficiency)
        let phaseInc = modulatedFreq * invSampleRate
        carrier1Phase += phaseInc
        mod1Phase += phaseInc * fmRatio1
        mod2Phase += phaseInc * fmRatio2
        mod3Phase += phaseInc * fmRatio3
        mod4Phase += phaseInc * fmRatio4
        
        // Wrap phases
        if carrier1Phase >= 1 { carrier1Phase -= 1 }
        if mod1Phase >= 1 { mod1Phase -= 1 }
        if mod2Phase >= 1 { mod2Phase -= 1 }
        if mod3Phase >= 1 { mod3Phase -= 1 }
        if mod4Phase >= 1 { mod4Phase -= 1 }
        
        // Combine carriers
        var osc = carrier1 + carrier2
        
        // Apply envelope
        updateEnvelope()
        
        // Volume compensation (louder at low timbre to match web app)
        let volumeCompensation = 1.0 - timbre * 0.15
        osc *= envelope * velocity * 0.3 * volumeCompensation
        
        // Apply stereo ping-pong delay
        let drySample = osc
        let (delayL, delayR) = processPingPongDelay(drySample)
        
        let left = drySample * (1 - delayMix) + delayL * delayMix
        let right = drySample * (1 - delayMix) + delayR * delayMix
        
        return (left, right)
    }
    
    private func processPingPongDelay(_ input: Float) -> (Float, Float) {
        let delaySamplesL = Int(delayTime * sampleRate)
        let delaySamplesR = Int(delayTime * sampleRate * 0.75)  // Right channel 0.75x for stereo spread
        let bufferSize = delayBufferL.count
        
        // Read from delay buffers (R uses shorter delay for stereo interest)
        var readIndexL = delayWriteIndexL - delaySamplesL
        if readIndexL < 0 { readIndexL += bufferSize }
        var readIndexR = delayWriteIndexR - delaySamplesR
        if readIndexR < 0 { readIndexR += bufferSize }
        
        let delayedL = delayBufferL[readIndexL]
        let delayedR = delayBufferR[readIndexR]
        
        // Ping-pong: L feeds R, R feeds L with feedback
        delayBufferL[delayWriteIndexL] = input + delayedR * delayFeedback
        delayBufferR[delayWriteIndexR] = delayedL * delayFeedback
        
        // Advance write positions
        delayWriteIndexL = (delayWriteIndexL + 1) % bufferSize
        delayWriteIndexR = (delayWriteIndexR + 1) % bufferSize
        
        return (delayedL, delayedR)
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
                holdCounter = hold * sampleRate  // Initialize hold countdown
                envelopeStage = .sustain
            }
            
        case .sustain:
            // Hold at sustain level for specified duration before auto-release
            holdCounter -= 1
            if holdCounter <= 0 {
                envelopeStage = .release
            }
            
        case .release:
            envelope -= envelope * releaseRate
            if envelope < 0.001 {
                envelope = 0
                envelopeStage = .off
            }
        }
    }
    
    // MARK: - Public Interface
    
    func playNote(midiNote: Int, velocity: Float) {
        let freq = midiToFreq(midiNote)
        self.targetFrequency = Float(freq)
        self.velocity = velocity
        self.envelopeStage = .attack
    }
    
    func release() {
        envelopeStage = .release
    }
    
    func setEnabled(_ enabled: Bool) {
        self.enabled = enabled
    }
    
    func setGlideRange(min: Float, max: Float) {
        self.glideMin = min
        self.glideMax = max
        // Set current to middle of range
        let mid = (min + max) / 2
        self.glideRate = 0.9 + mid * 0.099
    }
    
    func setVibratoRange(depthMin: Float, depthMax: Float, rateMin: Float, rateMax: Float) {
        self.vibratoDepthMin = depthMin
        self.vibratoDepthMax = depthMax
        self.vibratoRateMin = rateMin
        self.vibratoRateMax = rateMax
        // Set current to middle of ranges
        self.vibratoDepth = (depthMin + depthMax) / 2
        self.vibratoRate = (rateMin + rateMax) / 2
    }
    
    func setTimbreRange(min: Float, max: Float) {
        self.timbreMin = min
        self.timbreMax = max
        // Set current timbre to middle of range
        self.currentTimbre = (min + max) / 2
    }
    
    func setDelayRange(timeMin: Float, timeMax: Float, feedbackMin: Float, feedbackMax: Float, mixMin: Float, mixMax: Float) {
        self.delayTimeMin = Swift.min(timeMin, maxDelayTime)
        self.delayTimeMax = Swift.min(timeMax, maxDelayTime)
        self.delayFeedbackMin = Swift.min(feedbackMin, 0.95)
        self.delayFeedbackMax = Swift.min(feedbackMax, 0.95)
        self.delayMixMin = mixMin
        self.delayMixMax = mixMax
        // Set current to middle of ranges
        self.delayTime = (delayTimeMin + delayTimeMax) / 2
        self.delayFeedback = (delayFeedbackMin + delayFeedbackMax) / 2
        self.delayMix = (delayMixMin + delayMixMax) / 2
    }
    
    func setADSR(attack: Float, decay: Float, sustain: Float, hold: Float, release: Float) {
        self.attack = attack
        self.decay = decay
        self.sustain = sustain
        self.hold = hold
        self.release = release
    }
    
    /// Randomize timbre within range for each note (deterministic with seeded RNG)
    func randomizeTimbre(_ rng: () -> Double) {
        let range = timbreMax - timbreMin
        currentTimbre = timbreMin + Float(rng()) * range
    }
    
    /// Randomize expression params (vibrato + glide) within their ranges for each note (deterministic with seeded RNG)
    func randomizeExpression(_ rng: () -> Double) {
        // Randomize vibrato depth
        let depthRange = vibratoDepthMax - vibratoDepthMin
        vibratoDepth = vibratoDepthMin + Float(rng()) * depthRange
        
        // Randomize vibrato rate
        let rateRange = vibratoRateMax - vibratoRateMin
        vibratoRate = vibratoRateMin + Float(rng()) * rateRange
        
        // Randomize glide
        let glideRange = glideMax - glideMin
        let glideValue = glideMin + Float(rng()) * glideRange
        glideRate = 0.9 + glideValue * 0.099
    }
    
    /// Randomize delay params within their ranges for each note (deterministic with seeded RNG)
    func randomizeDelay(_ rng: () -> Double) {
        // Randomize delay time
        let timeRange = delayTimeMax - delayTimeMin
        delayTime = delayTimeMin + Float(rng()) * timeRange
        
        // Randomize delay feedback
        let feedbackRange = delayFeedbackMax - delayFeedbackMin
        delayFeedback = delayFeedbackMin + Float(rng()) * feedbackRange
        
        // Randomize delay mix
        let mixRange = delayMixMax - delayMixMin
        delayMix = delayMixMin + Float(rng()) * mixRange
    }
    
    /// Clear delay buffers
    func clearDelay() {
        delayBufferL = [Float](repeating: 0, count: delayBufferL.count)
        delayBufferR = [Float](repeating: 0, count: delayBufferR.count)
        delayWriteIndexL = 0
        delayWriteIndexR = 0
    }
}
