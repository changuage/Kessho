import AVFoundation

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
    private var envelope2: Float = 0  // Second carrier envelope
    private var envelopeStage: EnvelopeStage = .off
    private var attack: Float = 0.1
    private var decay: Float = 0.3
    private var sustain: Float = 0.4
    private var release: Float = 0.8
    
    // Glide
    private var glideRate: Float = 0.995  // Portamento speed
    
    // Vibrato
    private var vibratoPhase: Float = 0
    private var vibratoDepth: Float = 0.1  // semitones
    private var vibratoRate: Float = 5     // Hz
    
    // Timbre: 0 = soft Rhodes, 1 = metallic gamelan
    private var timbreMin: Float = 0.2
    private var timbreMax: Float = 0.6
    private var currentTimbre: Float = 0.4
    
    // Stereo ping-pong delay
    private var delayBufferL: [Float] = []
    private var delayBufferR: [Float] = []
    private var delayWriteIndexL: Int = 0
    private var delayWriteIndexR: Int = 0
    private var delayTime: Float = 0.375     // seconds
    private var delayFeedback: Float = 0.4
    private var delayMix: Float = 0.35
    private let maxDelayTime: Float = 1.0    // 1 second max
    
    // Octave
    private var octaveShift: Int = 0
    private var octaveRange: Int = 2
    
    private let sampleRate: Float = 44100
    
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
        
        // Apply vibrato
        vibratoPhase += vibratoRate / sampleRate
        if vibratoPhase > 1 { vibratoPhase -= 1 }
        let vibrato = sin(vibratoPhase * 2 * .pi) * vibratoDepth
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
        
        // === MODULATORS ===
        let mod1 = sin(mod1Phase * 2 * .pi) * modIndex1 / modulatedFreq
        let mod2 = sin(mod2Phase * 2 * .pi) * modIndex2 / modulatedFreq
        let mod3 = sin(mod3Phase * 2 * .pi) * modIndex3 / modulatedFreq
        let mod4 = sin(mod4Phase * 2 * .pi) * modIndex4 / modulatedFreq
        
        // === CARRIER 1 (main tone) ===
        let fmAmount = mod1 + mod2 + mod3 + mod4
        var carrier1 = sin(carrier1Phase * 2 * .pi + fmAmount)
        
        // === CARRIER 2 (gamelan shimmer - only when timbre > 0.1) ===
        var carrier2: Float = 0
        if timbre > 0.1 {
            // Slight detuning for beating effect
            let beatDetune = timbre * 2.0 / 1200.0  // cents to ratio
            let carrier2Freq = modulatedFreq * pow(2, beatDetune)
            carrier2 = sin(carrier2Phase * 2 * .pi + fmAmount) * timbre * 0.5
            carrier2Phase += carrier2Freq / sampleRate
            if carrier2Phase >= 1 { carrier2Phase -= 1 }
        }
        
        // Update modulator phases
        let phaseInc = modulatedFreq / sampleRate
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
                envelopeStage = .sustain
            }
            
        case .sustain:
            // Auto-release after sustain for ambient feel
            envelopeStage = .release
            
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
    
    func setGlide(_ rate: Float) {
        // 0 = instant, 1 = very slow glide
        self.glideRate = 0.9 + rate * 0.099
    }
    
    func setVibrato(depth: Float, rate: Float) {
        self.vibratoDepth = depth
        self.vibratoRate = rate
    }
    
    func setTimbreRange(min: Float, max: Float) {
        self.timbreMin = min
        self.timbreMax = max
        // Set current timbre to middle of range
        self.currentTimbre = (min + max) / 2
    }
    
    func setDelay(time: Float, feedback: Float, mix: Float) {
        self.delayTime = min(time, maxDelayTime)
        self.delayFeedback = min(feedback, 0.95)  // Cap to prevent runaway
        self.delayMix = mix
    }
    
    func setADSR(attack: Float, decay: Float, sustain: Float, release: Float) {
        self.attack = attack
        self.decay = decay
        self.sustain = sustain
        self.release = release
    }
    
    func setOctave(shift: Int, range: Int) {
        self.octaveShift = shift
        self.octaveRange = range
    }
    
    /// Randomize timbre within range for each note
    func randomizeTimbre() {
        let range = timbreMax - timbreMin
        currentTimbre = timbreMin + Float.random(in: 0...1) * range
    }
    
    /// Clear delay buffers
    func clearDelay() {
        delayBufferL = [Float](repeating: 0, count: delayBufferL.count)
        delayBufferR = [Float](repeating: 0, count: delayBufferR.count)
        delayWriteIndexL = 0
        delayWriteIndexR = 0
    }
}
