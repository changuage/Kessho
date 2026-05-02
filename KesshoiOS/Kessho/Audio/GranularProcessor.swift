import AVFoundation

@inline(__always)
private func writeGranularStereoFrame(
    _ left: Float,
    _ right: Float,
    frame: Int,
    to buffers: UnsafeMutableAudioBufferListPointer
) {
    if buffers.count == 1, let data = buffers[0].mData?.assumingMemoryBound(to: Float.self) {
        let channelCount = max(Int(buffers[0].mNumberChannels), 1)
        let baseIndex = frame * channelCount
        if channelCount >= 2 {
            data[baseIndex] = left
            data[baseIndex + 1] = right
            if channelCount > 2 {
                let mono = (left + right) * 0.5
                for channel in 2..<channelCount {
                    data[baseIndex + channel] = mono
                }
            }
        } else {
            data[frame] = (left + right) * 0.5
        }
        return
    }

    for (index, buffer) in buffers.enumerated() {
        guard let data = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
        data[frame] = index == 0 ? left : (index == 1 ? right : (left + right) * 0.5)
    }
}

// Pre-computed pan lookup tables used by the native granular engine.
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

// Pre-computed Hann window lookup table.
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
        return Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}

/// Granular synthesis processor with spray, jitter, feedback, and harmonic pitch modes
class GranularProcessor {
    private let stateLock = NSLock()
    private let randomSequenceCapacity = 10_000
    lazy var node: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(standardFormatWithSampleRate: Double(self?.sampleRate ?? 44_100), channels: 2)!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }

            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)

            self.stateLock.lock()
            defer { self.stateLock.unlock() }

            for frame in 0..<Int(frameCount) {
                let (left, right) = self.generateStereoSample()
                writeGranularStereoFrame(left, right, frame: frame, to: ablPointer)
            }

            return noErr
        }
    }()
    
    // Grain parameters
    private var density: Float = 0.5          // 0-1, grains per second
    private var grainSizeMin: Float = 0.05    // seconds
    private var grainSizeMax: Float = 0.2     // seconds
    
    // Granular params matching web app
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
    private var wetHPFAlpha: Float = 0
    private var wetLPFAlpha: Float = 0
    
    // Sample buffer (for loading external samples)
    private var sampleRate: Float
    private var invSampleRate: Float  // Pre-computed to avoid division per sample
    
    // Circular buffer for input (stereo) - feedback writes back to same buffer like web app
    private var inputBufferL: [Float] = []
    private var inputBufferR: [Float] = []
    private var inputWriteIndex: Int = 0
    private let inputBufferSize: Int  // 4 seconds matching sampleBuffer
    
    // Pre-seeded random sequence (matching web app for determinism)
    private var randomSequence: [Float] = []
    private var randomIndex: Int = 0
    private var randomSequenceLength: Int = 0
    
    // Active grains
    private var grains: [Grain] = []
    private var maxGrains: Int = 64
    private var activeGrainCount: Int = 0
    
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
        var position: Int        // Start position in buffer (set at spawn, includes spray+jitter)
        var startSample: Int     // Current sample within grain (0 to length)
        var length: Int          // Total grain length in samples
        var playbackRate: Float  // Pitch as playback rate multiplier
        var panL: Float          // Left channel gain
        var panR: Float          // Right channel gain
        var active: Bool         // Whether this grain slot is in use (for pool-based allocation)
    }
    
    init(sampleRate: Float = 44_100) {
        self.sampleRate = max(sampleRate, 1_000)
        self.invSampleRate = 1.0 / self.sampleRate
        self.inputBufferSize = Int(self.sampleRate * 4)
        inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        randomSequence = [Float](repeating: 0.5, count: randomSequenceCapacity)

        // Pre-allocate grain pool (matching web app pattern - avoids allocation on audio thread)
        grains = (0..<128).map { _ in
            Grain(position: 0, startSample: 0, length: 0, playbackRate: 1.0,
                  panL: 0.5, panR: 0.5, active: false)
        }
        
        // Generate initial noise buffer for texture
        updateWetFilterCoefficients()
        generateNoiseBuffer()
    }
    
    /// Get next value from pre-seeded random sequence (matching web app)
    private func nextRandom() -> Float {
        if randomSequenceLength == 0 { return 0.5 }
        let value = randomSequence[randomIndex]
        randomIndex = (randomIndex + 1) % randomSequenceLength
        return value
    }
    
    private func generateNoiseBuffer() {
        // Generate pink-ish noise as initial source material (uses system random - this is just for initial texture)
        // Write to both L and R input buffers (matching stereo architecture)
        var b0: Float = 0, b1: Float = 0, b2: Float = 0
        var b3: Float = 0, b4: Float = 0, b5: Float = 0, b6: Float = 0
        
        for i in 0..<inputBufferSize {
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
            
            let sample = pink * 0.2
            inputBufferL[i] = sample
            inputBufferR[i] = sample
        }
    }
    
    private func generateStereoSample() -> (Float, Float) {
        // Check if we should spawn a new grain
        samplesSinceLastGrain += 1
        if samplesSinceLastGrain >= samplesPerGrain && activeGrainCount < maxGrains {
            spawnGrain()
            samplesSinceLastGrain = 0
        }
        
        var wetL: Float = 0
        var wetR: Float = 0
        var deactivatedGrains = 0
        
        // Process active grains (pool-based with direct pointer access to avoid struct copying)
        grains.withUnsafeMutableBufferPointer { buffer in
            for i in 0..<buffer.count {
                guard buffer[i].active else { continue }
                
                // Read from buffer with pitch shift (matching web: position + startSample * playbackRate)
                let readPos = Float(buffer[i].position) + Float(buffer[i].startSample) * buffer[i].playbackRate
                let sampleL = readInputBufferL(position: readPos)
                let sampleR = readInputBufferR(position: readPos)
                
                // Apply envelope using Hann window lookup table (matching web app)
                let phase = Float(buffer[i].startSample) / Float(buffer[i].length)
                let hannIndex = Int(phase * Float(HANN_TABLE_SIZE - 1)).clamped(to: 0...(HANN_TABLE_SIZE - 1))
                let env = hannTable[hannIndex]
                
                // Apply stereo spread using pre-computed pan gains
                wetL += sampleL * env * buffer[i].panL
                wetR += sampleR * env * buffer[i].panR
                
                // Advance grain
                buffer[i].startSample += 1
                
                // Deactivate finished grains (no array removal - just mark inactive)
                if buffer[i].startSample >= buffer[i].length {
                    buffer[i].active = false
                    deactivatedGrains += 1
                }
            }
        }
        if deactivatedGrains > 0 {
            activeGrainCount = max(0, activeGrainCount - deactivatedGrains)
        }
        
        // Apply wet filters in stereo
        let filteredL = applyWetFiltersL(wetL)
        let filteredR = applyWetFiltersR(wetR)
        
        // Soft clip feedback to prevent runaway (matching web app)
        let feedbackL = tanh(filteredL * feedback)
        let feedbackR = tanh(filteredR * feedback)
        
        // Add feedback to input buffer (matching web app - writes back to same buffer)
        inputBufferL[inputWriteIndex] += feedbackL
        inputBufferR[inputWriteIndex] += feedbackR
        
        // Advance write position
        inputWriteIndex = (inputWriteIndex + 1) % inputBufferSize
        
        return (filteredL * 0.3, filteredR * 0.3)
    }
    
    // Stereo wet filter states
    private var hpfStateL: Float = 0
    private var hpfStateR: Float = 0
    private var lpfStateL: Float = 0
    private var lpfStateR: Float = 0
    
    private func applyWetFiltersL(_ input: Float) -> Float {
        // High-pass filter (first-order)
        hpfStateL += wetHPFAlpha * (input - hpfStateL)
        let highPassed = input - hpfStateL

        // Low-pass filter (first-order)
        lpfStateL += wetLPFAlpha * (highPassed - lpfStateL)

        return lpfStateL
    }

    private func applyWetFiltersR(_ input: Float) -> Float {
        // High-pass filter (first-order)
        hpfStateR += wetHPFAlpha * (input - hpfStateR)
        let highPassed = input - hpfStateR

        // Low-pass filter (first-order)
        lpfStateR += wetLPFAlpha * (highPassed - lpfStateR)

        return lpfStateR
    }

    private func updateWetFilterCoefficients() {
        wetHPFAlpha = 1.0 - exp(-2.0 * .pi * wetHPFFreq / sampleRate)
        wetLPFAlpha = 1.0 - exp(-2.0 * .pi * wetLPFFreq / sampleRate)
    }
    
    /// Linear interpolation for buffer read (matching web app's readBuffer)
    private func readInputBufferL(position: Float) -> Float {
        let pos = ((Int(position) % inputBufferSize) + inputBufferSize) % inputBufferSize
        let frac = position - Float(Int(position))
        let next = (pos + 1) % inputBufferSize
        return inputBufferL[pos] * (1 - frac) + inputBufferL[next] * frac
    }

    private func readInputBufferR(position: Float) -> Float {
        let pos = ((Int(position) % inputBufferSize) + inputBufferSize) % inputBufferSize
        let frac = position - Float(Int(position))
        let next = (pos + 1) % inputBufferSize
        return inputBufferR[pos] * (1 - frac) + inputBufferR[next] * frac
    }
    
    private func spawnGrain() {
        // Probability check - skip grain based on probability (matching web app)
        if nextRandom() > probability {
            return
        }
        
        // Find an inactive grain slot (pool-based allocation)
        guard let slotIndex = grains.firstIndex(where: { !$0.active }) else {
            return  // No free slots
        }
        
        // Grain size using seeded random (matching web: randomSize in ms converted to samples)
        let sizeRange = grainSizeMax - grainSizeMin
        let randomSize = grainSizeMin + nextRandom() * sizeRange
        let grainSamples = Int(randomSize * sampleRate)
        
        // Convert spray and jitter from ms to samples (matching web app)
        let spraySamples = Int((spray / 1000.0) * sampleRate)
        let jitterSamples = Int((jitter / 1000.0) * sampleRate)
        
        // Random position in buffer with spray (matching web app)
        let basePos = ((inputWriteIndex - spraySamples) + inputBufferSize) % inputBufferSize
        let sprayOffset = Int(nextRandom() * Float(spraySamples))
        let jitterOffset = Int((nextRandom() - 0.5) * 2 * Float(jitterSamples))
        let startPos = ((basePos - sprayOffset + jitterOffset) + inputBufferSize) % inputBufferSize
        
        // Pitch based on mode using pitchSpread in semitones (matching web app)
        let pitchOffset: Float
        if pitchMode == 1 {
            // Harmonic mode - limit intervals by pitchSpread (matching web app)
            // Web: maxIntervalIndex = Math.floor((pitchSpread / 12) * HARMONIC_INTERVALS.length)
            let maxIntervalIndex = max(1, Int((pitchSpread / 12.0) * Float(harmonicIntervals.count)))
            let availableCount = min(maxIntervalIndex, harmonicIntervals.count)
            let intervalIndex = Int(nextRandom() * Float(availableCount))
            pitchOffset = harmonicIntervals[min(intervalIndex, availableCount - 1)]
        } else {
            // Random mode - use pitchSpread parameter (semitones)
            pitchOffset = (nextRandom() - 0.5) * 2 * pitchSpread
        }
        let playbackRate = pow(2, pitchOffset / 12)
        
        // Stereo spread (matching web app)
        let pan = (nextRandom() - 0.5) * 2 * stereoSpread
        let panIndex = Int((pan + 1) * 0.5 * Float(PAN_TABLE_SIZE - 1)).clamped(to: 0...(PAN_TABLE_SIZE - 1))
        let panL = panTableL[panIndex]
        let panR = panTableR[panIndex]
        
        // Activate grain in pre-allocated slot (no allocation)
        grains[slotIndex] = Grain(
            position: startPos,
            startSample: 0,
            length: grainSamples,
            playbackRate: playbackRate,
            panL: panL,
            panR: panR,
            active: true
        )
        activeGrainCount += 1
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
    
    func setMaxGrains(_ count: Int) {
        maxGrains = max(0, min(128, count))
        // Deactivate excess grains if needed (pool-based - no array mutation)
        var activeCount = 0
        for i in 0..<grains.count {
            if grains[i].active {
                activeCount += 1
                if activeCount > maxGrains {
                    grains[i].active = false
                    activeGrainCount = max(0, activeGrainCount - 1)
                }
            }
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
        updateWetFilterCoefficients()
    }
    
    /// Set pre-seeded random sequence for deterministic granular synthesis (matching web app)
    func setRandomSequence(_ sequence: [Float]) {
        stateLock.lock()
        defer { stateLock.unlock() }

        let copyCount = min(sequence.count, randomSequenceCapacity)
        if copyCount > 0 {
            for index in 0..<copyCount {
                randomSequence[index] = sequence[index]
            }
        }
        if copyCount < randomSequenceCapacity {
            for index in copyCount..<randomSequenceCapacity {
                randomSequence[index] = 0.5
            }
        }
        randomSequenceLength = copyCount
        randomIndex = 0
    }
    
    /// Load a mono sample buffer for granular processing (copies to both L and R)
    func loadSample(_ samples: [Float], sampleRate: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }

        self.sampleRate = sampleRate
        self.invSampleRate = 1.0 / sampleRate
        updateWetFilterCoefficients()
        // Copy samples to input buffers (mono to stereo)
        let copyLength = min(samples.count, inputBufferSize)
        for i in 0..<copyLength {
            inputBufferL[i] = samples[i]
            inputBufferR[i] = samples[i]
        }
        if copyLength < inputBufferSize {
            for i in copyLength..<inputBufferSize {
                inputBufferL[i] = 0
                inputBufferR[i] = 0
            }
        }
    }
    
    /// Clear input/feedback buffers
    func clearFeedback() {
        stateLock.lock()
        defer { stateLock.unlock() }

        for i in 0..<inputBufferSize {
            inputBufferL[i] = 0
            inputBufferR[i] = 0
        }
        inputWriteIndex = 0
    }

    func hardReset() {
        stateLock.lock()
        defer { stateLock.unlock() }

        for i in 0..<inputBufferSize {
            inputBufferL[i] = 0
            inputBufferR[i] = 0
        }
        inputWriteIndex = 0
        samplesSinceLastGrain = 0
        randomIndex = 0
        activeGrainCount = 0
        for i in 0..<grains.count {
            grains[i].active = false
            grains[i].startSample = 0
        }
    }

    /// Pre-fill the upcoming live write positions with captured synth audio.
    /// The render callback advances `inputWriteIndex`, so we only stage samples here.
    func writeInput(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }

        let frameCount = min(Int(buffer.frameLength), inputBufferSize)
        guard frameCount > 0 else { return }

        let left = channelData[0]
        let right = Int(buffer.format.channelCount) > 1 ? channelData[1] : channelData[0]
        let sampleRate = Float(buffer.format.sampleRate)

        stateLock.lock()
        defer { stateLock.unlock() }

        if sampleRate > 0 {
            self.sampleRate = sampleRate
            self.invSampleRate = 1.0 / sampleRate
            updateWetFilterCoefficients()
        }

        let baseIndex = inputWriteIndex
        for frame in 0..<frameCount {
            let writeIndex = (baseIndex + frame) % inputBufferSize
            inputBufferL[writeIndex] = left[frame]
            inputBufferR[writeIndex] = right[frame]
        }
    }

    /// Add auxiliary capture sources, such as shared delay returns, into the
    /// same upcoming live input window without replacing the primary pad input.
    func mixInput(buffer: AVAudioPCMBuffer, gain: Float) {
        guard gain > 0.0001, let channelData = buffer.floatChannelData else { return }

        let frameCount = min(Int(buffer.frameLength), inputBufferSize)
        guard frameCount > 0 else { return }

        let left = channelData[0]
        let right = Int(buffer.format.channelCount) > 1 ? channelData[1] : channelData[0]
        let safeGain = min(max(gain, 0), 1.5)

        stateLock.lock()
        defer { stateLock.unlock() }

        let baseIndex = inputWriteIndex
        for frame in 0..<frameCount {
            let writeIndex = (baseIndex + frame) % inputBufferSize
            inputBufferL[writeIndex] = min(max(inputBufferL[writeIndex] + left[frame] * safeGain, -2), 2)
            inputBufferR[writeIndex] = min(max(inputBufferR[writeIndex] + right[frame] * safeGain, -2), 2)
        }
    }

    /// Write input samples to buffer (call from audio callback with live audio)
    func writeInput(left: Float, right: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }

        inputBufferL[inputWriteIndex] = left
        inputBufferR[inputWriteIndex] = right
        // Note: inputWriteIndex is advanced in generateStereoSample after processing
    }
}
