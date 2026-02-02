import AVFoundation

// Pre-computed pan lookup tables (matching web app for performance)
private let PAN_TABLE_SIZE = 256
private var panTableL: [Float] = {
    var table = [Float](repeating: 0, count: PAN_TABLE_SIZE)
    for i in 0..<PAN_TABLE_SIZE {
        let pan = Float(i) / Float(PAN_TABLE_SIZE - 1) * 2 - 1  // -1 to +1
        let angle = (pan + 1) * 0.25 * .pi
        table[i] = cos(angle)
    }
    return table
}()

private var panTableR: [Float] = {
    var table = [Float](repeating: 0, count: PAN_TABLE_SIZE)
    for i in 0..<PAN_TABLE_SIZE {
        let pan = Float(i) / Float(PAN_TABLE_SIZE - 1) * 2 - 1  // -1 to +1
        let angle = (pan + 1) * 0.25 * .pi
        table[i] = sin(angle)
    }
    return table
}()

// Pre-computed Hann window lookup table (matching web app)
private let HANN_TABLE_SIZE = 1024
private var hannTable: [Float] = {
    var table = [Float](repeating: 0, count: HANN_TABLE_SIZE)
    for i in 0..<HANN_TABLE_SIZE {
        let phase = Float(i) / Float(HANN_TABLE_SIZE)
        table[i] = 0.5 * (1 - cos(2 * .pi * phase))
    }
    return table
}()

// Helper to clamp Int to range
private extension Int {
    func clamped(to range: ClosedRange<Int>) -> Int {
        return min(max(self, range.lowerBound), range.upperBound)
    }
}

/// Granular synthesis processor with spray, jitter, feedback, and harmonic pitch modes
class GranularProcessor {
    let node: AVAudioSourceNode
    
    // Grain parameters
    private var density: Float = 0.5          // 0-1, grains per second
    private var grainSizeMin: Float = 0.05    // seconds
    private var grainSizeMax: Float = 0.2     // seconds
    private var pitchVariation: Float = 0.1   // semitones variation (legacy)
    private var positionSpread: Float = 0.5   // how much to vary playback position
    
    // New granular params matching web app
    private var probability: Float = 0.8      // 0-1, chance of triggering each grain
    private var stereoSpread: Float = 0.6     // 0-1, stereo width
    private var pitchSpread: Float = 3.0      // semitones, pitch variation range
    
    // Additional grain params from web app
    private var spray: Float = 0.3            // timing randomization
    private var jitter: Float = 0.2           // pitch micro-variations
    private var feedback: Float = 0.0         // grain feedback amount
    private var pitchMode: Int = 0            // 0=random, 1=harmonic
    
    // Wet signal filters (stereo)
    private var wetHPFFreq: Float = 20        // High-pass filter on wet
    private var wetLPFFreq: Float = 20000     // Low-pass filter on wet
    
    // Sample buffer
    private var sampleBuffer: [Float] = []
    private var sampleRate: Float = 44100
    
    // Feedback buffer for grain recycling
    private var feedbackBuffer: [Float] = []
    private var feedbackWriteIndex: Int = 0
    private let feedbackBufferSize: Int = 44100  // 1 second
    
    // Active grains
    private var grains: [Grain] = []
    private var maxGrains: Int = 64
    
    // Timing
    private var samplesSinceLastGrain: Int = 0
    private var samplesPerGrain: Int = 4410  // ~10 grains/sec at density 0.5
    private var baseSamplesPerGrain: Int = 4410
    
    // Harmonic intervals in semitones (matching web app exactly)
    // Web app: [0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24]
    private let harmonicIntervals: [Float] = [
        0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24
    ]
    
    struct Grain {
        var position: Int        // Current position in source
        var startPosition: Int   // Where this grain started
        var length: Int          // Total grain length in samples
        var elapsed: Int         // Samples elapsed
        var pitch: Float         // Pitch ratio
        var amplitude: Float     // Envelope amplitude
        var panL: Float          // Left channel gain
        var panR: Float          // Right channel gain
        var usesFeedback: Bool   // Whether to read from feedback buffer
    }
    
    init() {
        feedbackBuffer = [Float](repeating: 0, count: feedbackBufferSize)
        
        node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            
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
        
        // Generate initial noise buffer for texture
        generateNoiseBuffer()
    }
    
    private func generateNoiseBuffer() {
        // Generate pink-ish noise as source material
        let bufferLength = Int(sampleRate * 4)  // 4 seconds
        sampleBuffer = [Float](repeating: 0, count: bufferLength)
        
        var b0: Float = 0, b1: Float = 0, b2: Float = 0
        var b3: Float = 0, b4: Float = 0, b5: Float = 0, b6: Float = 0
        
        for i in 0..<bufferLength {
            let white = Float.random(in: -1...1)
            
            // Pink noise filter
            b0 = 0.99886 * b0 + white * 0.0555179
            b1 = 0.99332 * b1 + white * 0.0750759
            b2 = 0.96900 * b2 + white * 0.1538520
            b3 = 0.86650 * b3 + white * 0.3104856
            b4 = 0.55000 * b4 + white * 0.5329522
            b5 = -0.7616 * b5 - white * 0.0168980
            
            let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
            b6 = white * 0.115926
            
            sampleBuffer[i] = pink * 0.2
        }
    }
    
    private func generateStereoSample() -> (Float, Float) {
        // Apply spray - randomize timing between grains
        let sprayOffset = Int(Float.random(in: -spray...spray) * Float(baseSamplesPerGrain) * 0.5)
        let adjustedSamplesPerGrain = max(100, samplesPerGrain + sprayOffset)
        
        // Check if we should spawn a new grain (with probability check)
        samplesSinceLastGrain += 1
        if samplesSinceLastGrain >= adjustedSamplesPerGrain && grains.count < maxGrains {
            // Probability gate - only spawn if random check passes
            if Float.random(in: 0...1) <= probability {
                spawnGrain()
            }
            samplesSinceLastGrain = 0
        }
        
        var left: Float = 0
        var right: Float = 0
        
        // Process active grains
        var i = 0
        while i < grains.count {
            var grain = grains[i]
            
            // Get sample from appropriate buffer
            let sample: Float
            if grain.usesFeedback {
                sample = getSampleFromFeedback(position: grain.position, pitch: grain.pitch)
            } else {
                sample = getSampleAt(position: grain.position, pitch: grain.pitch)
            }
            
            // Apply jitter - micro pitch variations during grain
            let jitterAmount = Float.random(in: -jitter...jitter) * 0.01
            let jitteredSample = sample * (1 + jitterAmount)
            
            // Apply envelope using Hann window lookup table (matching web app)
            let t = Float(grain.elapsed) / Float(grain.length)
            let hannIndex = Int(t * Float(HANN_TABLE_SIZE - 1)).clamped(to: 0...(HANN_TABLE_SIZE - 1))
            let env = hannTable[hannIndex]
            
            let output = jitteredSample * env * grain.amplitude
            
            // Apply stereo spread using pre-computed pan gains
            left += output * grain.panL
            right += output * grain.panR
            
            // Advance grain
            grain.position += Int(grain.pitch)
            grain.elapsed += 1
            grains[i] = grain
            
            // Remove finished grains
            if grain.elapsed >= grain.length {
                grains.remove(at: i)
            } else {
                i += 1
            }
        }
        
        // Apply wet filters in stereo (matching web app - don't collapse to mono!)
        let filteredL = applyWetFiltersL(left)
        let filteredR = applyWetFiltersR(right)
        
        // Write to feedback buffer (mono sum for feedback is OK)
        let feedbackMono = (filteredL + filteredR) * 0.5
        feedbackBuffer[feedbackWriteIndex] = feedbackMono * feedback
        feedbackWriteIndex = (feedbackWriteIndex + 1) % feedbackBufferSize
        
        return (filteredL * 0.3, filteredR * 0.3)
    }
    
    // Stereo wet filter states
    private var hpfStateL: Float = 0
    private var hpfStateR: Float = 0
    private var lpfStateL: Float = 0
    private var lpfStateR: Float = 0
    
    private func applyWetFiltersL(_ input: Float) -> Float {
        // High-pass filter (first-order)
        let hpfAlpha = 1.0 - exp(-2.0 * .pi * wetHPFFreq / sampleRate)
        hpfStateL += hpfAlpha * (input - hpfStateL)
        let highPassed = input - hpfStateL
        
        // Low-pass filter (first-order)  
        let lpfAlpha = 1.0 - exp(-2.0 * .pi * wetLPFFreq / sampleRate)
        lpfStateL += lpfAlpha * (highPassed - lpfStateL)
        
        return lpfStateL
    }
    
    private func applyWetFiltersR(_ input: Float) -> Float {
        // High-pass filter (first-order)
        let hpfAlpha = 1.0 - exp(-2.0 * .pi * wetHPFFreq / sampleRate)
        hpfStateR += hpfAlpha * (input - hpfStateR)
        let highPassed = input - hpfStateR
        
        // Low-pass filter (first-order)  
        let lpfAlpha = 1.0 - exp(-2.0 * .pi * wetLPFFreq / sampleRate)
        lpfStateR += lpfAlpha * (highPassed - lpfStateR)
        
        return lpfStateR
    }
    
    private func spawnGrain() {
        let grainLength = Int(Float.random(in: grainSizeMin...grainSizeMax) * sampleRate)
        let startPos = Int.random(in: 0..<max(1, sampleBuffer.count - grainLength))
        
        // Pitch based on mode using pitchSpread in semitones
        let pitch: Float
        if pitchMode == 1 {
            // Harmonic mode - use semitone intervals (matching web app)
            let interval = harmonicIntervals.randomElement() ?? 0
            pitch = pow(2, interval / 12)  // Convert semitones to frequency ratio
        } else {
            // Random mode - use pitchSpread parameter (semitones)
            pitch = pow(2, Float.random(in: -pitchSpread...pitchSpread) / 12)
        }
        
        // Decide whether to use feedback buffer
        let usesFeedback = feedback > 0 && Float.random(in: 0...1) < feedback * 0.5
        
        // Calculate stereo position using stereoSpread and lookup table (matching web)
        let panPosition = Float.random(in: -1...1) * stereoSpread
        let panIndex = Int((panPosition + 1) * 0.5 * Float(PAN_TABLE_SIZE - 1)).clamped(to: 0...(PAN_TABLE_SIZE - 1))
        let panL = panTableL[panIndex]
        let panR = panTableR[panIndex]
        
        let grain = Grain(
            position: usesFeedback ? feedbackWriteIndex : startPos,
            startPosition: usesFeedback ? feedbackWriteIndex : startPos,
            length: grainLength,
            elapsed: 0,
            pitch: pitch,
            amplitude: Float.random(in: 0.3...0.8),
            panL: panL,
            panR: panR,
            usesFeedback: usesFeedback
        )
        
        grains.append(grain)
    }
    
    private func getSampleAt(position: Int, pitch: Float) -> Float {
        guard !sampleBuffer.isEmpty else { return 0 }
        let pos = position % sampleBuffer.count
        return sampleBuffer[pos]
    }
    
    private func getSampleFromFeedback(position: Int, pitch: Float) -> Float {
        let pos = position % feedbackBufferSize
        return feedbackBuffer[pos]
    }
    
    // MARK: - Public Interface
    
    func setDensity(_ density: Float) {
        self.density = density
        // Convert density to samples between grains
        // density 0 = very sparse, density 1 = dense
        let grainsPerSecond = 2 + density * 18  // 2-20 grains/sec
        samplesPerGrain = Int(sampleRate / grainsPerSecond)
        baseSamplesPerGrain = samplesPerGrain
    }
    
    func setGrainSize(min: Float, max: Float) {
        self.grainSizeMin = min
        self.grainSizeMax = Swift.max(min, max)
    }
    
    func setPitchVariation(_ semitones: Float) {
        self.pitchVariation = semitones
    }
    
    func setPositionSpread(_ spread: Float) {
        self.positionSpread = spread
    }
    
    func setMaxGrains(_ count: Int) {
        maxGrains = max(0, min(128, count))
        // Trim active grains if needed
        while grains.count > maxGrains {
            grains.removeLast()
        }
    }
    
    func setProbability(_ probability: Float) {
        self.probability = min(max(probability, 0), 1)
    }
    
    func setStereoSpread(_ spread: Float) {
        self.stereoSpread = min(max(spread, 0), 1)
    }
    
    func setPitchSpread(_ semitones: Float) {
        self.pitchSpread = max(0, semitones)
    }
    
    func setSpray(_ spray: Float) {
        self.spray = spray
    }
    
    func setJitter(_ jitter: Float) {
        self.jitter = jitter
    }
    
    func setFeedback(_ feedback: Float) {
        self.feedback = min(feedback, 0.95)  // Cap to prevent runaway
    }
    
    func setPitchMode(_ mode: Int) {
        // 0 = random, 1 = harmonic
        self.pitchMode = mode
    }
    
    func setWetFilters(hpf: Float, lpf: Float) {
        self.wetHPFFreq = max(20, min(hpf, 20000))
        self.wetLPFFreq = max(20, min(lpf, 20000))
    }
    
    /// Load a sample buffer for granular processing
    func loadSample(_ samples: [Float], sampleRate: Float) {
        self.sampleBuffer = samples
        self.sampleRate = sampleRate
    }
    
    /// Clear feedback buffer
    func clearFeedback() {
        feedbackBuffer = [Float](repeating: 0, count: feedbackBufferSize)
        feedbackWriteIndex = 0
    }
}
