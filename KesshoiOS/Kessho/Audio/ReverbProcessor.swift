import AVFoundation

/// Quality modes for reverb processing
enum ReverbQuality: String, CaseIterable {
    case ultra = "Ultra"        // 32 stages - best sound, most battery
    case balanced = "Balanced"  // 16 stages - good sound, moderate battery  
    case lite = "Lite"          // AVAudioUnitReverb - decent sound, best battery
    
    var description: String {
        switch self {
        case .ultra: return "Ultra (32 stages)"
        case .balanced: return "Balanced (16 stages)"
        case .lite: return "Lite (Apple Reverb)"
        }
    }
}

/// Reverb type presets - web app compatible and iOS-only options
enum ReverbType: String, CaseIterable {
    // Web app compatible presets (cross-platform)
    case plate = "plate"
    case hall = "hall"
    case cathedral = "cathedral"
    case darkHall = "darkHall"
    
    // iOS-only Apple factory presets (not cross-platform compatible)
    case smallRoom = "smallRoom"
    case mediumRoom = "mediumRoom"
    case largeRoom = "largeRoom"
    case mediumHall = "mediumHall"
    case largeHall = "largeHall"
    case mediumChamber = "mediumChamber"
    case largeChamber = "largeChamber"
    case largeRoom2 = "largeRoom2"
    case mediumHall2 = "mediumHall2"
    case mediumHall3 = "mediumHall3"
    case largeHall2 = "largeHall2"
    
    /// Display name for UI
    var displayName: String {
        switch self {
        case .plate: return "Plate"
        case .hall: return "Hall"
        case .cathedral: return "Cathedral"
        case .darkHall: return "Dark Hall"
        case .smallRoom: return "Small Room ⚠️"
        case .mediumRoom: return "Medium Room ⚠️"
        case .largeRoom: return "Large Room ⚠️"
        case .mediumHall: return "Medium Hall ⚠️"
        case .largeHall: return "Large Hall ⚠️"
        case .mediumChamber: return "Medium Chamber ⚠️"
        case .largeChamber: return "Large Chamber ⚠️"
        case .largeRoom2: return "Large Room 2 ⚠️"
        case .mediumHall2: return "Medium Hall 2 ⚠️"
        case .mediumHall3: return "Medium Hall 3 ⚠️"
        case .largeHall2: return "Large Hall 2 ⚠️"
        }
    }
    
    /// Whether this preset is compatible with the web app
    var isWebAppCompatible: Bool {
        switch self {
        case .plate, .hall, .cathedral, .darkHall:
            return true
        default:
            return false
        }
    }
    
    /// Web app compatible presets only
    static var webAppPresets: [ReverbType] {
        [.plate, .hall, .cathedral, .darkHall]
    }
    
    /// iOS-only presets
    static var iOSOnlyPresets: [ReverbType] {
        [.smallRoom, .mediumRoom, .largeRoom, .mediumHall, .largeHall,
         .mediumChamber, .largeChamber, .largeRoom2, .mediumHall2, .mediumHall3, .largeHall2]
    }
    
    /// Mapping to AVAudioUnitReverb factory preset for Eco mode
    var appleFactoryPreset: AVAudioUnitReverbPreset {
        switch self {
        case .plate: return .plate
        case .hall: return .largeHall
        case .cathedral: return .cathedral
        case .darkHall: return .mediumHall  // Closest match for dark/damped
        case .smallRoom: return .smallRoom
        case .mediumRoom: return .mediumRoom
        case .largeRoom: return .largeRoom
        case .mediumHall: return .mediumHall
        case .largeHall: return .largeHall
        case .mediumChamber: return .mediumChamber
        case .largeChamber: return .largeChamber
        case .largeRoom2: return .largeRoom2
        case .mediumHall2: return .mediumHall2
        case .mediumHall3: return .mediumHall3
        case .largeHall2: return .largeHall2
        }
    }
    
    /// FDN parameters for custom reverb modes (matching web app exactly)
    var fdnParams: (decay: Float, damping: Float, diffusion: Float, size: Float, modDepth: Float)? {
        switch self {
        case .plate:     return (0.88, 0.25, 0.8, 0.8, 0.25)
        case .hall:      return (0.92, 0.2, 0.85, 1.0, 0.3)
        case .cathedral: return (0.96, 0.12, 0.95, 1.5, 0.4)
        case .darkHall:  return (0.94, 0.45, 0.9, 1.3, 0.3)
        default:
            // iOS-only presets use Apple reverb, return approximate FDN params
            return approximateFDNParams
        }
    }
    
    /// Approximate FDN parameters for iOS-only presets
    private var approximateFDNParams: (decay: Float, damping: Float, diffusion: Float, size: Float, modDepth: Float) {
        switch self {
        case .smallRoom:     return (0.75, 0.4, 0.6, 0.5, 0.15)
        case .mediumRoom:    return (0.82, 0.35, 0.7, 0.7, 0.2)
        case .largeRoom:     return (0.86, 0.3, 0.75, 0.9, 0.25)
        case .mediumHall:    return (0.9, 0.25, 0.8, 1.0, 0.28)
        case .largeHall:     return (0.93, 0.2, 0.85, 1.2, 0.32)
        case .mediumChamber: return (0.85, 0.3, 0.75, 0.8, 0.22)
        case .largeChamber:  return (0.88, 0.28, 0.78, 1.0, 0.26)
        case .largeRoom2:    return (0.87, 0.32, 0.76, 0.95, 0.24)
        case .mediumHall2:   return (0.91, 0.24, 0.82, 1.05, 0.29)
        case .mediumHall3:   return (0.9, 0.26, 0.81, 1.0, 0.27)
        case .largeHall2:    return (0.94, 0.18, 0.86, 1.25, 0.34)
        default:             return (0.9, 0.25, 0.8, 1.0, 0.3)
        }
    }
}

/// Premium Ambient FDN Reverb for iOS
/// Matches web app's reverb.worklet.js with enhancements for ambient music
/// Features: 8-point FDN, 6 diffuser chains, interpolated delays, smooth modulation
class ReverbProcessor {
    let node: AVAudioUnitReverb
    let effectNode: AVAudioMixerNode
    
    // Sample rate (will be set from audio engine)
    private var sampleRate: Float = 44100
    private var srScale: Float = 1.0  // Scale factor for 48kHz reference
    
    // Quality mode
    private var quality: ReverbQuality = .balanced
    private var useCustomReverb: Bool = true
    
    // Current reverb type
    private var currentType: ReverbType = .cathedral
    
    // Parameters matching web app presets
    private var decay: Float = 0.8
    private var wetDryMix: Float = 30
    private var size: Float = 1.0
    private var diffusion: Float = 0.8
    private var modulation: Float = 0.3
    private var predelayMs: Float = 20  // in milliseconds
    private var width: Float = 0.8
    private var damping: Float = 0.5
    
    // Preset definitions matching web app
    enum ReverbPreset {
        case plate, hall, cathedral, darkHall, ambient
        
        var params: (decay: Float, damping: Float, diffusion: Float, size: Float, modDepth: Float) {
            switch self {
            case .plate:     return (0.88, 0.25, 0.8, 0.8, 0.25)
            case .hall:      return (0.92, 0.2, 0.85, 1.0, 0.3)
            case .cathedral: return (0.96, 0.12, 0.95, 1.5, 0.4)
            case .darkHall:  return (0.94, 0.45, 0.9, 1.3, 0.3)
            case .ambient:   return (0.95, 0.15, 0.92, 1.4, 0.35)
            }
        }
    }
    
    // FDN delay times in ms (matching web app exactly)
    private let FDN_TIMES_MS: [Float] = [37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3]
    
    // Diffuser delay times (matching web app exactly)
    private let DIFFUSER_TIMES_BASE: [[Int]] = [
        [89, 127, 179, 233, 307, 401],   // preDiffuserL - 6 stages
        [97, 137, 191, 251, 317, 419],   // preDiffuserR - 6 stages
        [167, 229, 313, 421],             // midDiffuserL - 4 stages
        [173, 241, 331, 433],             // midDiffuserR - 4 stages
        [211, 283, 367, 457, 547, 641],  // postDiffuserL - 6 stages
        [223, 293, 379, 467, 557, 653]   // postDiffuserR - 6 stages
    ]
    
    // FDN components
    private var fdnDelays: [SmoothDelay] = []
    private var fdnDelayTimes: [Float] = []
    private var fdnDampers: [OnePole] = []
    
    // 6 Diffuser chains (pre/mid/post for L/R)
    private var preDiffuserL: DiffuserChain!
    private var preDiffuserR: DiffuserChain!
    private var midDiffuserL: DiffuserChain!
    private var midDiffuserR: DiffuserChain!
    private var postDiffuserL: DiffuserChain!
    private var postDiffuserR: DiffuserChain!
    
    // Predelay buffers
    private var predelayL: SmoothDelay!
    private var predelayR: SmoothDelay!
    private var predelaySamples: Float = 0
    
    // Modulation (4 phases for 8 delays, paired)
    private var modPhases: [Float] = [0, 0.25, 0.5, 0.75]
    private let modRates: [Float] = [0.023, 0.031, 0.041, 0.053]
    
    // DC blockers
    private var dcBlockerL = DCBlocker()
    private var dcBlockerR = DCBlocker()
    
    // Hadamard mixing scale (1/sqrt(8))
    private let mixScale: Float = 0.3535533905932738
    
    // Block processing optimization
    private var blockCounter: Int = 0
    private let blockSize: Int = 32
    private var currentModValues: [Float] = [0, 0, 0, 0]
    
    init(sampleRate: Float = 44100) {
        self.sampleRate = sampleRate
        self.srScale = sampleRate / 48000
        
        // Initialize FDN delays
        for i in 0..<8 {
            let baseTime = FDN_TIMES_MS[i] * srScale
            let maxSamples = Int(baseTime * sampleRate / 1000 * 4) + 100
            fdnDelays.append(SmoothDelay(maxSamples: maxSamples))
            fdnDelayTimes.append(baseTime * sampleRate / 1000)
            fdnDampers.append(OnePole())
        }
        
        // Initialize diffuser chains with scaled delay times
        preDiffuserL = DiffuserChain(delays: DIFFUSER_TIMES_BASE[0].map { Int(Float($0) * srScale) }, feedback: 0.65)
        preDiffuserR = DiffuserChain(delays: DIFFUSER_TIMES_BASE[1].map { Int(Float($0) * srScale) }, feedback: 0.65)
        midDiffuserL = DiffuserChain(delays: DIFFUSER_TIMES_BASE[2].map { Int(Float($0) * srScale) }, feedback: 0.55)
        midDiffuserR = DiffuserChain(delays: DIFFUSER_TIMES_BASE[3].map { Int(Float($0) * srScale) }, feedback: 0.55)
        postDiffuserL = DiffuserChain(delays: DIFFUSER_TIMES_BASE[4].map { Int(Float($0) * srScale) }, feedback: 0.5)
        postDiffuserR = DiffuserChain(delays: DIFFUSER_TIMES_BASE[5].map { Int(Float($0) * srScale) }, feedback: 0.5)
        
        // Initialize predelay (max 500ms for ambient music)
        let maxPredelaySamples = Int(0.5 * sampleRate) + 100
        predelayL = SmoothDelay(maxSamples: maxPredelaySamples)
        predelayR = SmoothDelay(maxSamples: maxPredelaySamples)
        
        // Create audio nodes
        node = AVAudioUnitReverb()
        effectNode = AVAudioMixerNode()
        
        // Configure base reverb as fallback
        node.loadFactoryPreset(.largeHall)
        node.wetDryMix = wetDryMix
        
        // Apply default preset
        applyPreset(.hall)
    }
    
    /// Apply a reverb preset
    func applyPreset(_ preset: ReverbPreset) {
        let p = preset.params
        self.decay = p.decay
        self.damping = p.damping
        self.diffusion = p.diffusion
        self.size = p.size
        self.modulation = p.modDepth
        updateDiffuserFeedback()
    }
    
    /// Process a stereo sample through the FDN reverb
    func processStereo(left: Float, right: Float) -> (Float, Float) {
        // Block-rate modulation update (optimization from web app)
        if blockCounter == 0 {
            for i in 0..<4 {
                // Triangle wave modulation
                currentModValues[i] = 1 - abs(2 * modPhases[i] - 1)
                modPhases[i] += modRates[i] * Float(blockSize) / sampleRate
                if modPhases[i] > 1 { modPhases[i] -= 1 }
            }
        }
        blockCounter = (blockCounter + 1) % blockSize
        
        // Write to predelay and read with interpolation
        predelayL.write(left)
        predelayR.write(right)
        let delayedL = predelaySamples > 1 ? predelayL.readInterpolated(predelaySamples) : left
        let delayedR = predelaySamples > 1 ? predelayR.readInterpolated(predelaySamples) : right
        
        // Pre-diffusion (6 stages for Ultra, 3 for Balanced)
        var diffInL = delayedL
        var diffInR = delayedR
        if quality != .eco {
            diffInL = preDiffuserL.process(delayedL, stages: quality == .ultra ? 6 : 3)
            diffInR = preDiffuserR.process(delayedR, stages: quality == .ultra ? 6 : 3)
        }
        
        // Read from FDN delays with smooth modulation
        var reads: [Float] = []
        for i in 0..<8 {
            let modIndex = i / 2
            let tri = currentModValues[modIndex]
            let modAmount = (tri - 0.5) * modulation * 0.3
            let modOffset = modAmount * fdnDelayTimes[i] * 0.015
            let effectiveSize = max(0.5, size)
            let delayTime = max(1, fdnDelayTimes[i] * effectiveSize + modOffset)
            
            // Use interpolated read for smooth modulation (no zipper noise)
            reads.append(fdnDelays[i].readInterpolated(delayTime))
        }
        
        // Apply damping (one-pole lowpass per delay)
        var damped: [Float] = []
        for i in 0..<8 {
            damped.append(fdnDampers[i].process(reads[i], coeff: damping))
        }
        
        // Mid-diffusion (only in Ultra mode for CPU savings)
        if quality == .ultra {
            let midL = (damped[0] + damped[2] + damped[4] + damped[6]) * 0.5
            let midR = (damped[1] + damped[3] + damped[5] + damped[7]) * 0.5
            let diffMidL = midDiffuserL.process(midL)
            let diffMidR = midDiffuserR.process(midR)
            
            // Inject mid-diffused signal back
            damped[0] = damped[0] * 0.7 + diffMidL * 0.3
            damped[2] = damped[2] * 0.7 + diffMidL * 0.3
            damped[1] = damped[1] * 0.7 + diffMidR * 0.3
            damped[3] = damped[3] * 0.7 + diffMidR * 0.3
        }
        
        // Hadamard mixing (orthogonal 8x8 matrix)
        let mixed = mixFDN(damped)
        
        // Calculate feedback gain with decay curve
        // Longer decays for ambient music
        let effectiveDecay = 0.85 + decay * 0.14  // Range 0.85 to 0.99
        let feedbackGain = min(0.998, effectiveDecay)
        
        // Soft clip and write back to delays
        let inputGain: Float = 0.18
        for i in 0..<8 {
            let inject = i < 4 ? diffInL * inputGain : diffInR * inputGain
            let value = softClip(mixed[i] * feedbackGain + inject)
            fdnDelays[i].write(value)
        }
        
        // Collect stereo output with decorrelated taps
        var rawL = (reads[0] * 1.0 + reads[2] * 0.9 + reads[4] * 0.8 + reads[6] * 0.7 +
                    reads[1] * 0.25 + reads[3] * 0.2) * 0.4
        var rawR = (reads[1] * 1.0 + reads[3] * 0.9 + reads[5] * 0.8 + reads[7] * 0.7 +
                    reads[0] * 0.25 + reads[2] * 0.2) * 0.4
        
        // Post-diffusion (6 stages for Ultra, 3 for Balanced)
        if quality != .eco {
            rawL = postDiffuserL.process(rawL, stages: quality == .ultra ? 6 : 3)
            rawR = postDiffuserR.process(rawR, stages: quality == .ultra ? 6 : 3)
        }
        
        // Soft clip to prevent harshness
        rawL = softClip(rawL)
        rawR = softClip(rawR)
        
        // DC blocking (essential for long reverb tails)
        rawL = dcBlockerL.process(rawL)
        rawR = dcBlockerR.process(rawR)
        
        // Width control (mid-side processing)
        let mid = (rawL + rawR) * 0.5
        let side = (rawL - rawR) * 0.5
        let wetL = mid + side * width
        let wetR = mid - side * width
        
        return (wetL, wetR)
    }
    
    /// Hadamard 8x8 mixing matrix
    private func mixFDN(_ state: [Float]) -> [Float] {
        let s = mixScale
        return [
            s * (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + state[7]),
            s * (state[0] - state[1] + state[2] - state[3] + state[4] - state[5] + state[6] - state[7]),
            s * (state[0] + state[1] - state[2] - state[3] + state[4] + state[5] - state[6] - state[7]),
            s * (state[0] - state[1] - state[2] + state[3] + state[4] - state[5] - state[6] + state[7]),
            s * (state[0] + state[1] + state[2] + state[3] - state[4] - state[5] - state[6] - state[7]),
            s * (state[0] - state[1] + state[2] - state[3] - state[4] + state[5] - state[6] + state[7]),
            s * (state[0] + state[1] - state[2] - state[3] - state[4] - state[5] + state[6] + state[7]),
            s * (state[0] - state[1] - state[2] + state[3] - state[4] + state[5] + state[6] - state[7])
        ]
    }
    
    /// Asymmetric soft clipper (matches web app)
    private func softClip(_ x: Float) -> Float {
        if x > 1 { return 1 - 1 / (x + 1) }
        if x < -1 { return -1 + 1 / (-x + 1) }
        return x
    }
    
    private func updateDiffuserFeedback() {
        let effectiveDiff = 0.5 + diffusion * 0.45
        let preFb = effectiveDiff
        let midFb = effectiveDiff * 0.85
        let postFb = effectiveDiff * 0.75
        
        preDiffuserL.setFeedback(preFb)
        preDiffuserR.setFeedback(preFb)
        midDiffuserL.setFeedback(midFb)
        midDiffuserR.setFeedback(midFb)
        postDiffuserL.setFeedback(postFb)
        postDiffuserR.setFeedback(postFb)
    }
    
    // MARK: - Parameter Setters
    
    func setDecay(_ decay: Float) {
        self.decay = min(max(decay, 0), 1)
    }
    
    func setWetDryMix(_ mix: Float) {
        self.wetDryMix = min(max(mix, 0), 100)
        node.wetDryMix = wetDryMix
    }
    
    func setSize(_ size: Float) {
        self.size = min(max(size, 0.5), 2.0)
    }
    
    func setDiffusion(_ diffusion: Float) {
        self.diffusion = min(max(diffusion, 0), 1)
        updateDiffuserFeedback()
    }
    
    func setModulation(_ modulation: Float) {
        self.modulation = min(max(modulation, 0), 1)
    }
    
    func setPredelay(_ predelayMs: Float) {
        self.predelayMs = min(max(predelayMs, 0), 500)
        self.predelaySamples = predelayMs * sampleRate / 1000
    }
    
    func setWidth(_ width: Float) {
        self.width = min(max(width, 0), 1)
    }
    
    func setDamping(_ damping: Float) {
        self.damping = min(max(damping, 0), 1)
    }
    
    func setSampleRate(_ sr: Float) {
        self.sampleRate = sr
        self.srScale = sr / 48000
        // Recalculate predelay
        self.predelaySamples = predelayMs * sampleRate / 1000
    }
    
    /// Set quality mode (affects CPU usage and sound quality)
    func setQuality(_ quality: ReverbQuality) {
        self.quality = quality
        self.useCustomReverb = (quality != .eco)
        
        // Update Apple reverb preset based on current parameters for eco mode
        if quality == .eco {
            updateAppleReverbPreset()
        }
    }
    
    /// Get current quality mode
    func getQuality() -> ReverbQuality {
        return quality
    }
    
    /// Check if using custom FDN reverb
    func isUsingCustomReverb() -> Bool {
        return useCustomReverb
    }
    
    /// Update Apple reverb preset based on current type
    private func updateAppleReverbPreset() {
        // Use the direct mapping from ReverbType to Apple factory preset
        node.loadFactoryPreset(currentType.appleFactoryPreset)
    }
    
    /// Set the reverb type (preset)
    func setType(_ type: ReverbType) {
        self.currentType = type
        
        // Apply FDN parameters for web-compatible presets
        if let params = type.fdnParams {
            self.decay = params.decay
            self.damping = params.damping
            self.diffusion = params.diffusion
            self.size = params.size
            self.modulation = params.modDepth
            updateDiffuserFeedback()
        }
        
        // Update Apple reverb for eco mode
        if quality == .eco {
            updateAppleReverbPreset()
        }
    }
    
    /// Set the reverb type by string name
    func setType(_ typeName: String) {
        if let type = ReverbType(rawValue: typeName) {
            setType(type)
        }
    }
    
    /// Get current reverb type
    func getType() -> ReverbType {
        return currentType
    }
    
    /// Check if current type is compatible with web app
    func isCurrentTypeWebAppCompatible() -> Bool {
        return currentType.isWebAppCompatible
    }
    
    /// Set all parameters at once
    func setParameters(decay: Float, mix: Float, size: Float,
                       diffusion: Float, modulation: Float,
                       predelay: Float, width: Float, damping: Float) {
        setDecay(decay)
        setWetDryMix(mix)
        setSize(size)
        setDiffusion(diffusion)
        setModulation(modulation)
        setPredelay(predelay * 1000)  // Convert seconds to ms
        setWidth(width)
        setDamping(damping)
        
        // Update Apple reverb for eco mode
        if quality == .eco {
            updateAppleReverbPreset()
        }
    }
}

// MARK: - DSP Components

/// Interpolated delay line for smooth modulation (no zipper noise)
class SmoothDelay {
    private var buffer: [Float]
    private var writeIndex: Int = 0
    private let size: Int
    
    init(maxSamples: Int) {
        self.size = maxSamples
        self.buffer = [Float](repeating: 0, count: maxSamples)
    }
    
    func write(_ sample: Float) {
        buffer[writeIndex] = sample
        writeIndex = (writeIndex + 1) % size
    }
    
    /// Linear interpolation read for smooth modulation
    func readInterpolated(_ delaySamples: Float) -> Float {
        let readPos = Float(writeIndex) - delaySamples
        var readIndex = readPos.truncatingRemainder(dividingBy: Float(size))
        if readIndex < 0 { readIndex += Float(size) }
        
        let i0 = Int(readIndex)
        let frac = readIndex - Float(i0)
        let i1 = (i0 + 1) % size
        
        return buffer[i0] * (1 - frac) + buffer[i1] * frac
    }
    
    /// Non-interpolated read
    func read(_ delaySamples: Int) -> Float {
        var readPos = writeIndex - delaySamples
        if readPos < 0 { readPos += size }
        return buffer[readPos % size]
    }
    
    func clear() {
        buffer = [Float](repeating: 0, count: size)
        writeIndex = 0
    }
}

/// Cascaded allpass diffuser chain
class DiffuserChain {
    private var stages: [(delay: SmoothDelay, feedback: Float, delaySamples: Int)]
    
    init(delays: [Int], feedback: Float) {
        stages = []
        for samples in delays {
            stages.append((
                delay: SmoothDelay(maxSamples: samples + 50),
                feedback: feedback,
                delaySamples: samples
            ))
        }
    }
    
    func process(_ input: Float, stages stageCount: Int? = nil) -> Float {
        var x = input
        let count = min(stageCount ?? stages.count, stages.count)
        for i in 0..<count {
            let delayed = stages[i].delay.read(stages[i].delaySamples)
            let v = x - delayed * stages[i].feedback
            stages[i].delay.write(v)
            x = delayed + v * stages[i].feedback
        }
        return x
    }
    
    func setFeedback(_ fb: Float) {
        for i in 0..<stages.count {
            stages[i].feedback = fb
        }
    }
    
    func clear() {
        for i in 0..<stages.count {
            stages[i].delay.clear()
        }
    }
}

/// One-pole lowpass filter for damping
class OnePole {
    private var z1: Float = 0
    
    func process(_ input: Float, coeff: Float) -> Float {
        z1 = input * (1 - coeff) + z1 * coeff
        return z1
    }
    
    func clear() {
        z1 = 0
    }
}

/// DC blocker to prevent low-frequency buildup
class DCBlocker {
    private var x1: Float = 0
    private var y1: Float = 0
    
    func process(_ input: Float) -> Float {
        let y = input - x1 + 0.9975 * y1
        x1 = input
        y1 = y
        return y
    }
    
    func clear() {
        x1 = 0
        y1 = 0
    }
}
