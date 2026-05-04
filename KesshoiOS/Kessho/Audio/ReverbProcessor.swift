import AVFoundation

@inline(__always)
private func writeReverbStereoFrame(
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

/// Reverb presets used by the current iOS prototype.
enum ReverbType: String, CaseIterable {
    // Legacy web-aligned presets
    case plate = "plate"
    case hall = "hall"
    case cathedral = "cathedral"
    case darkHall = "darkHall"

    // Native Apple factory presets
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
    
    /// Whether this preset maps to a legacy web-aligned name.
    var isWebAppCompatible: Bool {
        switch self {
        case .plate, .hall, .cathedral, .darkHall:
            return true
        default:
            return false
        }
    }
    
    /// Legacy web-aligned presets only
    static var webAppPresets: [ReverbType] {
        [.plate, .hall, .cathedral, .darkHall]
    }

    /// Native-only presets
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
    
    /// FDN parameters for the custom algorithmic modes used in the prototype.
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
/// Algorithmic reverb for the native prototype, loosely aligned with the web flavor.
/// Features: 8-point FDN, 6 diffuser chains, interpolated delays, smooth modulation
class ReverbProcessor {
    private let stateLock = NSLock()
    private let inputLock = NSLock()
    private let nativeDSP = ReverbNativeDSP.shared

    // `node` is the post-parity return bus that the engine can tap for stems.
    let node: AVAudioMixerNode
    let customReturnMixer: AVAudioMixerNode
    let liteReturnMixer: AVAudioMixerNode
    let liteNode: AVAudioUnitReverb
    lazy var customNode: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(standardFormatWithSampleRate: Double(self?.sampleRate ?? 44100), channels: 2)!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let self else {
                for frame in 0..<Int(frameCount) {
                    writeReverbStereoFrame(0, 0, frame: frame, to: ablPointer)
                }
                return noErr
            }

            guard self.stateLock.try() else {
                for frame in 0..<Int(frameCount) {
                    writeReverbStereoFrame(0, 0, frame: frame, to: ablPointer)
                }
                return noErr
            }
            defer { self.stateLock.unlock() }

            let shouldRenderCustom = self.useCustomReverb
            self.dequeueInputBlock(frameCount: Int(frameCount))

            if shouldRenderCustom {
                if self.renderNativeDSPBlock(frameCount: Int(frameCount), to: ablPointer) {
                    return noErr
                }

                for frame in 0..<Int(frameCount) {
                    let inputL = frame < self.renderInputL.count ? self.renderInputL[frame] : 0
                    let inputR = frame < self.renderInputR.count ? self.renderInputR[frame] : 0
                    let (wetL, wetR) = self.processStereo(left: inputL, right: inputR)
                    writeReverbStereoFrame(wetL, wetR, frame: frame, to: ablPointer)
                }
            } else {
                for frame in 0..<Int(frameCount) {
                    writeReverbStereoFrame(0, 0, frame: frame, to: ablPointer)
                }
            }

            return noErr
        }
    }()

    // Sample rate (will be set from audio engine)
    private var sampleRate: Float = 44100
    private var srScale: Float = 1.0  // Scale factor for 48kHz reference
    private var nativeDSPReady = false

    // Quality mode
    private var quality: ReverbQuality = .balanced
    private var useCustomReverb: Bool = true

    // Current reverb type
    private var currentType: ReverbType = .cathedral

    // Parameters matching web app presets
    private var baseDecay: Float = 0.92   // Preset's base decay (set by setType)
    private var userDecay: Float = 0.9    // User slider decay (0-1)
    private var decay: Float = 0.8        // Effective decay (computed from baseDecay + userDecay)
    private var wetDryMix: Float = 30
    private var size: Float = 1.0
    private var diffusion: Float = 0.8
    private var modulation: Float = 0.3
    private var predelayMs: Float = 20  // in milliseconds
    private var width: Float = 0.8
    private var damping: Float = 0.5
    private var shimmer: Float = 0
    private var shimmerPitch: Float = 12
    private var shimmerFeedback: Float = 0
    private var warp: Float = 0
    private var crossFeed: Float = 0
    private var transientSmooth: Float = 0
    private var shimmerStateL: Float = 0
    private var shimmerStateR: Float = 0
    private var smoothStateL: Float = 0
    private var smoothStateR: Float = 0

    // Live input ring buffer fed from the shared reverb send mixer.
    private let inputBufferSize: Int
    private var inputBufferL: [Float]
    private var inputBufferR: [Float]
    private var inputReadIndex: Int = 0
    private var inputWriteIndex: Int = 0
    private var bufferedInputFrames: Int = 0
    private let maxRenderFrames = 4096
    private var renderInputL: [Float]
    private var renderInputR: [Float]

    // FDN preset configurations (internal - not to be confused with public ReverbType enum)
    enum FDNPresetConfig {
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
        [167, 229, 313, 421],            // midDiffuserL - 4 stages
        [173, 241, 331, 433],            // midDiffuserR - 4 stages
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

    // Pre-allocated arrays for audio thread (avoid allocations in processStereo)
    private var reads8: [Float] = [Float](repeating: 0, count: 8)
    private var damped8: [Float] = [Float](repeating: 0, count: 8)
    private var mixed8: [Float] = [Float](repeating: 0, count: 8)

    // Block processing optimization
    private var blockCounter: Int = 0
    private let blockSize: Int = 32
    private var currentModValues: [Float] = [0, 0, 0, 0]

    init(sampleRate: Float = 44100) {
        self.sampleRate = sampleRate
        self.srScale = sampleRate / 48000
        self.inputBufferSize = max(Int(sampleRate * 0.5), 4096)
        self.inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        self.inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        self.renderInputL = [Float](repeating: 0, count: maxRenderFrames)
        self.renderInputR = [Float](repeating: 0, count: maxRenderFrames)
        self.node = AVAudioMixerNode()
        self.customReturnMixer = AVAudioMixerNode()
        self.liteReturnMixer = AVAudioMixerNode()
        self.liteNode = AVAudioUnitReverb()
        self.nativeDSPReady = nativeDSP.initialize(sampleRate: sampleRate)

        let scaledDelayFactor = self.srScale
        let scaledDiffuserTimes = DIFFUSER_TIMES_BASE.map { delayGroup in
            delayGroup.map { Int(Float($0) * scaledDelayFactor) }
        }

        // Initialize FDN delays
        for i in 0..<8 {
            let baseTime = FDN_TIMES_MS[i] * scaledDelayFactor
            let maxSamples = Int(baseTime * sampleRate / 1000 * 4) + 100
            fdnDelays.append(SmoothDelay(maxSamples: maxSamples))
            fdnDelayTimes.append(baseTime * sampleRate / 1000)
            fdnDampers.append(OnePole())
        }

        // Initialize diffuser chains with scaled delay times
        preDiffuserL = DiffuserChain(delays: scaledDiffuserTimes[0], feedback: 0.65)
        preDiffuserR = DiffuserChain(delays: scaledDiffuserTimes[1], feedback: 0.65)
        midDiffuserL = DiffuserChain(delays: scaledDiffuserTimes[2], feedback: 0.55)
        midDiffuserR = DiffuserChain(delays: scaledDiffuserTimes[3], feedback: 0.55)
        postDiffuserL = DiffuserChain(delays: scaledDiffuserTimes[4], feedback: 0.5)
        postDiffuserR = DiffuserChain(delays: scaledDiffuserTimes[5], feedback: 0.5)

        // Initialize predelay (max 500ms for ambient music)
        let maxPredelaySamples = Int(0.5 * sampleRate) + 100
        predelayL = SmoothDelay(maxSamples: maxPredelaySamples)
        predelayR = SmoothDelay(maxSamples: maxPredelaySamples)

        // Configure base reverb as fallback.
        liteNode.loadFactoryPreset(.largeHall)
        liteNode.wetDryMix = 100

        // Apply default preset and route custom mode live by default.
        applyPreset(.hall)
        applyNativeDSPSettingsUnlocked()
        refreshRouting()
        setWetDryMix(wetDryMix)
    }

    private func refreshRouting() {
        customReturnMixer.outputVolume = useCustomReverb ? 1.0 : 0.0
        liteReturnMixer.outputVolume = useCustomReverb ? 0.0 : 1.0
        node.outputVolume = min(max(wetDryMix / 100, 0), 1)
        liteNode.wetDryMix = 100
        liteNode.bypass = useCustomReverb
    }

    private func renderNativeDSPBlock(
        frameCount: Int,
        to buffers: UnsafeMutableAudioBufferListPointer
    ) -> Bool {
        guard nativeDSPReady,
              let inputPtr = nativeDSP.inputPointer(),
              let outputPtr = nativeDSP.outputPointer() else {
            return false
        }

        var processedFrames = 0
        while processedFrames < frameCount {
            let chunkSize = min(ReverbNativeDSP.maxBlockSize, frameCount - processedFrames)

            for frameOffset in 0..<chunkSize {
                let frame = processedFrames + frameOffset
                inputPtr[frameOffset * 2] = frame < renderInputL.count ? renderInputL[frame] : 0
                inputPtr[frameOffset * 2 + 1] = frame < renderInputR.count ? renderInputR[frame] : 0
            }

            nativeDSP.process(blockSize: Int32(chunkSize))

            for frameOffset in 0..<chunkSize {
                writeReverbStereoFrame(
                    outputPtr[frameOffset * 2],
                    outputPtr[frameOffset * 2 + 1],
                    frame: processedFrames + frameOffset,
                    to: buffers
                )
            }

            processedFrames += chunkSize
        }

        return true
    }

    private func nativeType(for type: ReverbType) -> ReverbNativeType {
        switch type {
        case .plate, .smallRoom, .mediumRoom:
            return .plate
        case .hall, .largeRoom, .mediumHall, .largeHall, .mediumChamber, .largeRoom2, .mediumHall2:
            return .hall
        case .cathedral, .largeChamber, .largeHall2:
            return .cathedral
        case .darkHall, .mediumHall3:
            return .darkHall
        }
    }

    private func nativeQuality(for quality: ReverbQuality) -> ReverbNativeQuality {
        switch quality {
        case .ultra:
            return .ultra
        case .balanced:
            return .balanced
        case .lite:
            return .lite
        }
    }

    private func applyNativeDSPSettingsUnlocked() {
        guard nativeDSPReady else { return }
        nativeDSP.setType(nativeType(for: currentType))
        nativeDSP.setQuality(nativeQuality(for: quality))
        nativeDSP.setParameters(
            decay: userDecay,
            size: size,
            damping: damping,
            diffusion: diffusion,
            modulation: modulation,
            predelaySeconds: predelayMs / 1000,
            width: width
        )
        nativeDSP.setExtendedParameters(
            shimmer: shimmer,
            shimmerPitch: shimmerPitch,
            shimmerFeedback: shimmerFeedback,
            warp: warp,
            crossFeed: crossFeed,
            transientSmooth: transientSmooth
        )
    }

    private func resetNativeDSPUnlocked() {
        nativeDSPReady = nativeDSP.reset(sampleRate: sampleRate)
        applyNativeDSPSettingsUnlocked()
    }

    private func dequeueInputFrameUnlocked() -> (Float, Float) {
        guard bufferedInputFrames > 0 else { return (0, 0) }

        let left = inputBufferL[inputReadIndex]
        let right = inputBufferR[inputReadIndex]
        inputReadIndex = (inputReadIndex + 1) % inputBufferSize
        bufferedInputFrames -= 1
        return (left, right)
    }

    private func dequeueInputBlock(frameCount: Int) {
        let frames = min(frameCount, renderInputL.count, renderInputR.count)
        guard frames > 0 else { return }

        guard inputLock.try() else {
            for frame in 0..<frames {
                renderInputL[frame] = 0
                renderInputR[frame] = 0
            }
            return
        }
        defer { inputLock.unlock() }

        for frame in 0..<frames {
            let (left, right) = dequeueInputFrameUnlocked()
            renderInputL[frame] = left
            renderInputR[frame] = right
        }
    }

    private func clearInputBufferUnlocked() {
        for index in 0..<inputBufferSize {
            inputBufferL[index] = 0
            inputBufferR[index] = 0
        }
        inputReadIndex = 0
        inputWriteIndex = 0
        bufferedInputFrames = 0
    }

    private func clearInputBuffer() {
        inputLock.lock()
        defer { inputLock.unlock() }
        clearInputBufferUnlocked()
    }

    private func clearDSPState() {
        predelayL.clear()
        predelayR.clear()
        fdnDelays.forEach { $0.clear() }
        fdnDampers.forEach { $0.clear() }
        preDiffuserL.clear()
        preDiffuserR.clear()
        midDiffuserL.clear()
        midDiffuserR.clear()
        postDiffuserL.clear()
        postDiffuserR.clear()
        dcBlockerL.clear()
        dcBlockerR.clear()
        shimmerStateL = 0
        shimmerStateR = 0
        smoothStateL = 0
        smoothStateR = 0
        resetNativeDSPUnlocked()
        for index in 0..<8 {
            reads8[index] = 0
            damped8[index] = 0
            mixed8[index] = 0
        }
        blockCounter = 0
        for index in 0..<4 {
            currentModValues[index] = 0
        }
        modPhases = [0, 0.25, 0.5, 0.75]
    }

    func writeInput(buffer: AVAudioPCMBuffer) {
        guard useCustomReverb,
              let channelData = buffer.floatChannelData else { return }

        let frameCount = min(Int(buffer.frameLength), inputBufferSize)
        guard frameCount > 0 else { return }

        let left = channelData[0]
        let right = Int(buffer.format.channelCount) > 1 ? channelData[1] : channelData[0]

        guard inputLock.try() else { return }
        defer { inputLock.unlock() }

        if frameCount >= inputBufferSize {
            let startIndex = frameCount - inputBufferSize
            for frame in 0..<inputBufferSize {
                inputBufferL[frame] = left[startIndex + frame]
                inputBufferR[frame] = right[startIndex + frame]
            }
            inputReadIndex = 0
            inputWriteIndex = 0
            bufferedInputFrames = inputBufferSize
            return
        }

        let overflow = max(0, bufferedInputFrames + frameCount - inputBufferSize)
        if overflow > 0 {
            inputReadIndex = (inputReadIndex + overflow) % inputBufferSize
            bufferedInputFrames -= overflow
        }

        for frame in 0..<frameCount {
            inputBufferL[inputWriteIndex] = left[frame]
            inputBufferR[inputWriteIndex] = right[frame]
            inputWriteIndex = (inputWriteIndex + 1) % inputBufferSize
        }
        bufferedInputFrames += frameCount
    }

    func hardReset() {
        stateLock.lock()
        defer { stateLock.unlock() }
        clearInputBuffer()
        clearDSPState()
    }
    
    /// Apply a reverb preset
    func applyPreset(_ preset: FDNPresetConfig) {
        let p = preset.params
        self.baseDecay = p.decay  // Store preset's decay as baseDecay
        self.damping = p.damping
        self.diffusion = p.diffusion
        self.size = p.size
        self.modulation = p.modDepth
        updateEffectiveDecay()  // Recalculate effective decay
        updateDiffuserFeedback()
        applyNativeDSPSettingsUnlocked()
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
        if quality != .lite {
            diffInL = preDiffuserL.process(delayedL, stages: quality == .ultra ? 6 : 3)
            diffInR = preDiffuserR.process(delayedR, stages: quality == .ultra ? 6 : 3)
        }
        
        // Read from FDN delays with smooth modulation (using pre-allocated array)
        for i in 0..<8 {
            let modIndex = i / 2
            let tri = currentModValues[modIndex]
            let modAmount = (tri - 0.5) * modulation * 0.3
            let modOffset = modAmount * fdnDelayTimes[i] * 0.015
            let effectiveSize = max(0.5, size)
            let delayTime = max(1, fdnDelayTimes[i] * effectiveSize + modOffset)
            
            // Use interpolated read for smooth modulation (no zipper noise)
            reads8[i] = fdnDelays[i].readInterpolated(delayTime)
        }
        
        // Apply damping (one-pole lowpass per delay, using pre-allocated array)
        for i in 0..<8 {
            damped8[i] = fdnDampers[i].process(reads8[i], coeff: damping)
        }
        
        // Mid-diffusion (only in Ultra mode for CPU savings)
        if quality == .ultra {
            let midL = (damped8[0] + damped8[2] + damped8[4] + damped8[6]) * 0.5
            let midR = (damped8[1] + damped8[3] + damped8[5] + damped8[7]) * 0.5
            let diffMidL = midDiffuserL.process(midL)
            let diffMidR = midDiffuserR.process(midR)
            
            // Inject mid-diffused signal back
            damped8[0] = damped8[0] * 0.7 + diffMidL * 0.3
            damped8[2] = damped8[2] * 0.7 + diffMidL * 0.3
            damped8[1] = damped8[1] * 0.7 + diffMidR * 0.3
            damped8[3] = damped8[3] * 0.7 + diffMidR * 0.3
        }
        
        // Hadamard mixing (orthogonal 8x8 matrix, in-place to avoid allocation)
        mixFDNInPlace(damped8, out: &mixed8)
        
        // Calculate feedback gain with decay curve
        // Uses web formula: baseDecay + (1 - baseDecay) * userDecay * 0.9 (precomputed in self.decay)
        let feedbackGain = min(0.998, decay)
        
        // Soft clip and write back to delays
        let inputGain: Float = 0.18
        for i in 0..<8 {
            let inject = i < 4 ? diffInL * inputGain : diffInR * inputGain
            let value = softClip(mixed8[i] * feedbackGain + inject)
            fdnDelays[i].write(value)
        }
        
        // Collect stereo output with decorrelated taps
        var rawL = (reads8[0] * 1.0 + reads8[2] * 0.9 + reads8[4] * 0.8 + reads8[6] * 0.7 +
                    reads8[1] * 0.25 + reads8[3] * 0.2) * 0.4
        var rawR = (reads8[1] * 1.0 + reads8[3] * 0.9 + reads8[5] * 0.8 + reads8[7] * 0.7 +
                    reads8[0] * 0.25 + reads8[2] * 0.2) * 0.4
        
        // Post-diffusion (6 stages for Ultra, 3 for Balanced)
        if quality != .lite {
            rawL = postDiffuserL.process(rawL, stages: quality == .ultra ? 6 : 3)
            rawR = postDiffuserR.process(rawR, stages: quality == .ultra ? 6 : 3)
        }
        
        // Soft clip to prevent harshness
        rawL = softClip(rawL)
        rawR = softClip(rawR)

        if shimmer > 0.0001 {
            let pitchGain = max(0.25, min(4.0, pow(2, shimmerPitch / 24)))
            let shimmerCoeff = min(0.98, 0.35 + shimmerFeedback * 0.55)
            shimmerStateL = shimmerStateL * shimmerCoeff + rawR * (1 - shimmerCoeff) * pitchGain
            shimmerStateR = shimmerStateR * shimmerCoeff + rawL * (1 - shimmerCoeff) * pitchGain
            rawL += shimmerStateL * shimmer * 0.38
            rawR += shimmerStateR * shimmer * 0.38
        }

        if warp > 0.0001 {
            let warpAmount = min(max(warp, 0), 1)
            rawL = rawL * (1 - warpAmount) + sin(rawL * .pi) * warpAmount
            rawR = rawR * (1 - warpAmount) + sin(rawR * .pi) * warpAmount
        }

        if crossFeed > 0.0001 {
            let feed = min(max(crossFeed, 0), 1) * 0.5
            let left = rawL
            let right = rawR
            rawL = left * (1 - feed) + right * feed
            rawR = right * (1 - feed) + left * feed
        }

        if transientSmooth > 0.0001 {
            let coeff = min(max(transientSmooth, 0), 0.98)
            smoothStateL += (rawL - smoothStateL) * (1 - coeff)
            smoothStateR += (rawR - smoothStateR) * (1 - coeff)
            rawL = smoothStateL
            rawR = smoothStateR
        }

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
    
    /// Hadamard 8x8 mixing matrix (in-place version to avoid allocation in audio thread)
    private func mixFDNInPlace(_ state: [Float], out: inout [Float]) {
        let s = mixScale
        out[0] = s * (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + state[7])
        out[1] = s * (state[0] - state[1] + state[2] - state[3] + state[4] - state[5] + state[6] - state[7])
        out[2] = s * (state[0] + state[1] - state[2] - state[3] + state[4] + state[5] - state[6] - state[7])
        out[3] = s * (state[0] - state[1] - state[2] + state[3] + state[4] - state[5] - state[6] + state[7])
        out[4] = s * (state[0] + state[1] + state[2] + state[3] - state[4] - state[5] - state[6] - state[7])
        out[5] = s * (state[0] - state[1] + state[2] - state[3] - state[4] + state[5] - state[6] + state[7])
        out[6] = s * (state[0] + state[1] - state[2] - state[3] - state[4] - state[5] + state[6] + state[7])
        out[7] = s * (state[0] - state[1] - state[2] + state[3] - state[4] + state[5] + state[6] - state[7])
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
        stateLock.lock()
        defer { stateLock.unlock() }
        self.userDecay = min(max(decay, 0), 1)
        updateEffectiveDecay()
        applyNativeDSPSettingsUnlocked()
    }
    
    /// Calculate effective decay using web formula: baseDecay + (1 - baseDecay) * userDecay * 0.9
    private func updateEffectiveDecay() {
        self.decay = baseDecay + (1 - baseDecay) * userDecay * 0.9
    }
    
    func setWetDryMix(_ mix: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.wetDryMix = min(max(mix, 0), 100)
        refreshRouting()
    }

    func setSize(_ size: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.size = min(max(size, 0.5), 2.0)
        applyNativeDSPSettingsUnlocked()
    }

    func setDiffusion(_ diffusion: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.diffusion = min(max(diffusion, 0), 1)
        updateDiffuserFeedback()
        applyNativeDSPSettingsUnlocked()
    }

    func setModulation(_ modulation: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.modulation = min(max(modulation, 0), 1)
        applyNativeDSPSettingsUnlocked()
    }

    func setPredelay(_ predelayMs: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.predelayMs = min(max(predelayMs, 0), 500)
        self.predelaySamples = self.predelayMs * sampleRate / 1000
        applyNativeDSPSettingsUnlocked()
    }

    func setWidth(_ width: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.width = min(max(width, 0), 1)
        applyNativeDSPSettingsUnlocked()
    }

    func setDamping(_ damping: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.damping = min(max(damping, 0), 1)
        applyNativeDSPSettingsUnlocked()
    }

    func setSampleRate(_ sr: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.sampleRate = sr
        self.srScale = sr / 48000
        // Recalculate predelay
        self.predelaySamples = predelayMs * sampleRate / 1000
        resetNativeDSPUnlocked()
    }
    
    /// Set quality mode (affects CPU usage and sound quality)
    func setQuality(_ quality: ReverbQuality) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.quality = quality
        self.useCustomReverb = (quality != .lite)
        applyNativeDSPSettingsUnlocked()
        refreshRouting()

        // Update Apple reverb preset based on current parameters for lite mode.
        if quality == .lite {
            updateAppleReverbPreset()
            clearInputBuffer()
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
        liteNode.loadFactoryPreset(currentType.appleFactoryPreset)
    }

    /// Set the reverb type (preset)
    func setType(_ type: ReverbType) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.currentType = type

        // Apply FDN parameters for web-compatible presets
        if let params = type.fdnParams {
            self.baseDecay = params.decay  // Store preset's decay as baseDecay
            self.damping = params.damping
            self.diffusion = params.diffusion
            self.size = params.size
            self.modulation = params.modDepth
            updateEffectiveDecay()  // Recalculate effective decay
            updateDiffuserFeedback()
        }
        applyNativeDSPSettingsUnlocked()

        // Update Apple reverb for lite mode
        if quality == .lite {
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
                       predelay: Float, width: Float, damping: Float,
                       shimmer: Float = 0, shimmerPitch: Float = 12,
                       shimmerFeedback: Float = 0, warp: Float = 0,
                       crossFeed: Float = 0, transientSmooth: Float = 0) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.userDecay = min(max(decay, 0), 1)
        updateEffectiveDecay()
        self.wetDryMix = min(max(mix, 0), 100)
        self.size = min(max(size, 0.5), 2.0)
        self.diffusion = min(max(diffusion, 0), 1)
        self.modulation = min(max(modulation, 0), 1)
        self.predelayMs = min(max(predelay * 1000, 0), 500)
        self.predelaySamples = self.predelayMs * sampleRate / 1000
        self.width = min(max(width, 0), 1)
        self.damping = min(max(damping, 0), 1)
        self.shimmer = min(max(shimmer, 0), 1)
        self.shimmerPitch = min(max(shimmerPitch, -24), 24)
        self.shimmerFeedback = min(max(shimmerFeedback, 0), 1)
        self.warp = min(max(warp, 0), 1)
        self.crossFeed = min(max(crossFeed, 0), 1)
        self.transientSmooth = min(max(transientSmooth, 0), 1)
        updateDiffuserFeedback()
        applyNativeDSPSettingsUnlocked()
        refreshRouting()

        // Update Apple reverb for lite mode.
        if quality == .lite {
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
        for index in 0..<size {
            buffer[index] = 0
        }
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
