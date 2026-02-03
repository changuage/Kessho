import AVFoundation

/// Drum voice types matching web app
enum DrumVoiceType: String, CaseIterable {
    case sub = "sub"
    case kick = "kick"
    case click = "click"
    case beepHi = "beepHi"
    case beepLo = "beepLo"
    case noise = "noise"
}

/// Ikeda-Style Drum Synthesizer for iOS
/// Minimalist percussion synthesizer inspired by Ryoji Ikeda's aesthetic:
/// - Sharp digital impulses and clicks
/// - Pure sine beeps at frequency extremes
/// - Sub-bass pulses
/// - Filtered noise bursts
/// - Mathematical precision with probability-based triggering
class DrumSynth {
    let node: AVAudioSourceNode
    
    // Parameters
    private var params: SliderState = .default
    private var enabled: Bool = false
    private var masterLevel: Float = 0.7
    private var reverbSendLevel: Float = 0.3
    
    // Noise buffer for click and noise voices
    private var noiseBuffer: [Float] = []
    private let noiseBufferSize = 44100  // 1 second at 44.1kHz
    
    // Active voice state for per-sample processing
    private var activeVoices: [ActiveVoice] = []
    private let maxActiveVoices = 32
    private let voiceLock = NSLock()
    
    // RNG for deterministic randomness
    private var rngFn: (() -> Double)?
    
    // Sample rate
    private let sampleRate: Float = 44100
    private let invSampleRate: Float = 1.0 / 44100
    
    // Callback for UI visualization
    var onDrumTrigger: ((DrumVoiceType, Float) -> Void)?
    
    // Euclidean scheduling
    private var euclidCurrentStep: [Int] = [0, 0, 0, 0]
    private var lastScheduleTime: TimeInterval = 0
    private var euclidScheduleTimer: Timer?
    
    // Random scheduling
    private var randomScheduleTimer: Timer?
    private var lastRandomTimes: [DrumVoiceType: TimeInterval] = [
        .sub: 0, .kick: 0, .click: 0, .beepHi: 0, .beepLo: 0, .noise: 0
    ]
    
    // Euclidean preset data (matching web app)
    private let presetData: [String: (steps: Int, hits: Int, rotation: Int)] = [
        "sparse": (16, 1, 0),
        "dense": (8, 7, 0),
        "longSparse": (32, 3, 0),
        "poly3v4": (12, 3, 0),
        "poly4v3": (12, 4, 0),
        "poly5v4": (20, 5, 0),
        "lancaran": (16, 4, 0),
        "ketawang": (16, 2, 0),
        "ladrang": (32, 8, 0),
        "gangsaran": (8, 4, 0),
        "kotekan": (8, 3, 1),
        "kotekan2": (8, 3, 4),
        "srepegan": (16, 6, 2),
        "sampak": (8, 5, 0),
        "ayak": (16, 3, 4),
        "bonang": (12, 5, 2),
        "tresillo": (8, 3, 0),
        "cinquillo": (8, 5, 0),
        "rumba": (16, 5, 0),
        "bossa": (16, 5, 3),
        "son": (16, 7, 0),
        "shiko": (16, 5, 0),
        "soukous": (12, 7, 0),
        "gahu": (16, 7, 0),
        "bembe": (12, 7, 0),
        "clapping": (12, 8, 0),
        "clappingB": (12, 8, 5),
        "additive7": (7, 4, 0),
        "additive11": (11, 5, 0),
        "additive13": (13, 5, 0),
        "reich18": (12, 7, 3),
        "drumming": (8, 6, 1)
    ]
    
    /// Active voice structure for per-sample processing
    private struct ActiveVoice {
        let type: DrumVoiceType
        var phase: Float = 0
        var phase2: Float = 0  // For secondary oscillator (kick click, beepLo square)
        var modPhase: Float = 0  // For FM modulation
        var envelope: Float = 0
        var time: Float = 0  // Time since trigger in seconds
        let velocity: Float
        let level: Float
        let params: VoiceParams
        var noiseIndex: Int = 0
        var filterState: Float = 0  // For single-pole filter
        
        struct VoiceParams {
            // Sub
            var subFreq: Float = 50
            var subDecay: Float = 0.15
            var subTone: Float = 0.1
            
            // Kick
            var kickFreq: Float = 55
            var kickPitchEnv: Float = 24
            var kickPitchDecay: Float = 0.03
            var kickDecay: Float = 0.2
            var kickClick: Float = 0.3
            
            // Click
            var clickDecay: Float = 0.005
            var clickFilter: Float = 4000
            var clickTone: Float = 0.3
            var clickResonance: Float = 0.4
            
            // BeepHi
            var beepHiFreq: Float = 4000
            var beepHiAttack: Float = 0.001
            var beepHiDecay: Float = 0.08
            var beepHiTone: Float = 0.2
            
            // BeepLo
            var beepLoFreq: Float = 400
            var beepLoAttack: Float = 0.002
            var beepLoDecay: Float = 0.1
            var beepLoTone: Float = 0.1
            
            // Noise
            var noiseFilterFreq: Float = 8000
            var noiseFilterQ: Float = 1
            var noiseFilterType: String = "highpass"
            var noiseAttack: Float = 0
            var noiseDecay: Float = 0.03
        }
    }
    
    init() {
        // Pre-generate noise buffer
        noiseBuffer = [Float](repeating: 0, count: noiseBufferSize)
        for i in 0..<noiseBufferSize {
            noiseBuffer[i] = Float.random(in: -1...1)
        }
        
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
                let sample = self.generateSample()
                leftBuffer[frame] = sample * self.masterLevel
                rightBuffer[frame] = sample * self.masterLevel
            }
            
            return noErr
        }
    }
    
    /// Set seeded RNG for deterministic randomness
    func setRng(_ rng: @escaping () -> Double) {
        self.rngFn = rng
    }
    
    private func rng() -> Float {
        if let fn = rngFn {
            return Float(fn())
        }
        return Float.random(in: 0...1)
    }
    
    /// Generate one audio sample by summing all active voices
    private func generateSample() -> Float {
        voiceLock.lock()
        defer { voiceLock.unlock() }
        
        var output: Float = 0
        var newActiveVoices: [ActiveVoice] = []
        
        for var voice in activeVoices {
            let (sample, finished) = processVoice(&voice)
            if !finished {
                newActiveVoices.append(voice)
            }
            output += sample
        }
        
        activeVoices = newActiveVoices
        
        // Soft clip to prevent harsh distortion
        return tanh(output)
    }
    
    /// Process a single voice and return (sample, isFinished)
    private func processVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let dt = invSampleRate
        voice.time += dt
        
        var sample: Float = 0
        var finished = false
        
        switch voice.type {
        case .sub:
            (sample, finished) = processSubVoice(&voice)
        case .kick:
            (sample, finished) = processKickVoice(&voice)
        case .click:
            (sample, finished) = processClickVoice(&voice)
        case .beepHi:
            (sample, finished) = processBeepHiVoice(&voice)
        case .beepLo:
            (sample, finished) = processBeepLoVoice(&voice)
        case .noise:
            (sample, finished) = processNoiseVoice(&voice)
        }
        
        return (sample * voice.velocity * voice.level, finished)
    }
    
    // MARK: - Voice Processing
    
    private func processSubVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let decay = p.subDecay
        
        // Exponential decay envelope
        if voice.time >= decay * 3 { return (0, true) }
        
        voice.envelope = exp(-voice.time / (decay * 0.3))
        
        // Main oscillator
        let freq = p.subFreq
        voice.phase += freq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        var osc = sin(voice.phase * 2 * .pi)
        
        // Optional overtone
        if p.subTone > 0.05 {
            voice.phase2 += freq * 2 * invSampleRate
            if voice.phase2 >= 1 { voice.phase2 -= 1 }
            osc += sin(voice.phase2 * 2 * .pi) * p.subTone * 0.3
        }
        
        return (osc * voice.envelope, false)
    }
    
    private func processKickVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let ampDecay = p.kickDecay
        
        if voice.time >= ampDecay * 3 { return (0, true) }
        
        // Pitch envelope
        let pitchDecay = p.kickPitchDecay
        let startFreq = p.kickFreq * pow(2, p.kickPitchEnv / 12)
        let currentFreq = p.kickFreq + (startFreq - p.kickFreq) * exp(-voice.time / (pitchDecay * 0.3))
        
        // Amplitude envelope
        voice.envelope = exp(-voice.time / (ampDecay * 0.3))
        
        // Main oscillator
        voice.phase += currentFreq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        var osc = sin(voice.phase * 2 * .pi)
        
        // Click transient
        if p.kickClick > 0.05 && voice.time < 0.01 {
            voice.phase2 += 3000 * invSampleRate
            if voice.phase2 >= 1 { voice.phase2 -= 1 }
            let clickEnv = exp(-voice.time / 0.002)
            osc += sin(voice.phase2 * 2 * .pi) * p.kickClick * clickEnv * 0.5
        }
        
        return (osc * voice.envelope, false)
    }
    
    private func processClickVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let decay = p.clickDecay
        
        if voice.time >= decay * 3 { return (0, true) }
        
        // Envelope
        voice.envelope = exp(-voice.time / (decay * 0.3))
        
        // Noise with highpass filter
        let noiseIdx = (voice.noiseIndex + 1) % noiseBufferSize
        voice.noiseIndex = noiseIdx
        let noise = noiseBuffer[noiseIdx]
        
        // Simple 1-pole highpass filter
        let hpCoeff = exp(-2 * .pi * p.clickFilter * invSampleRate)
        let hpOut = noise - voice.filterState
        voice.filterState = noise * (1 - hpCoeff) + voice.filterState * hpCoeff
        
        // Add resonance (feedback)
        let resonantNoise = hpOut + voice.filterState * p.clickResonance
        
        return (resonantNoise * voice.envelope, false)
    }
    
    private func processBeepHiVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let attack = p.beepHiAttack
        let decay = p.beepHiDecay
        let totalTime = attack + decay
        
        if voice.time >= totalTime * 3 { return (0, true) }
        
        // Attack/decay envelope
        if voice.time < attack {
            voice.envelope = voice.time / attack
        } else {
            voice.envelope = exp(-(voice.time - attack) / (decay * 0.3))
        }
        
        // Main oscillator
        let freq = p.beepHiFreq
        voice.phase += freq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        var osc = sin(voice.phase * 2 * .pi)
        
        // FM modulation for metallic character
        if p.beepHiTone > 0.1 {
            let modFreq = freq * 2.01
            voice.modPhase += modFreq * invSampleRate
            if voice.modPhase >= 1 { voice.modPhase -= 1 }
            let modDepth = p.beepHiTone * freq * 0.3
            let fm = sin(voice.modPhase * 2 * .pi) * modDepth / freq
            osc = sin((voice.phase + fm) * 2 * .pi)
        }
        
        return (osc * voice.envelope, false)
    }
    
    private func processBeepLoVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let attack = p.beepLoAttack
        let decay = p.beepLoDecay
        let totalTime = attack + decay
        
        if voice.time >= totalTime * 3 { return (0, true) }
        
        // Attack/decay envelope
        if voice.time < attack {
            voice.envelope = voice.time / attack
        } else {
            voice.envelope = exp(-(voice.time - attack) / (decay * 0.3))
        }
        
        // Blend between sine and square based on tone
        let freq = p.beepLoFreq
        voice.phase += freq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        
        var osc: Float
        if p.beepLoTone > 0.5 {
            // Square-ish (filtered square)
            osc = voice.phase < 0.5 ? 1.0 : -1.0
            // Simple lowpass for anti-aliasing
            voice.filterState = voice.filterState * 0.9 + osc * 0.1
            osc = voice.filterState
        } else {
            osc = sin(voice.phase * 2 * .pi)
        }
        
        return (osc * voice.envelope, false)
    }
    
    private func processNoiseVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let attack = p.noiseAttack
        let decay = p.noiseDecay
        let totalTime = attack + decay
        
        if voice.time >= totalTime * 3 { return (0, true) }
        
        // Attack/decay envelope
        if voice.time < attack {
            voice.envelope = attack > 0 ? voice.time / attack : 1.0
        } else {
            voice.envelope = exp(-(voice.time - attack) / (decay * 0.3))
        }
        
        // Noise source
        let noiseIdx = (voice.noiseIndex + 1) % noiseBufferSize
        voice.noiseIndex = noiseIdx
        let noise = noiseBuffer[noiseIdx]
        
        // Filter
        let filterFreq = p.noiseFilterFreq
        let coeff = exp(-2 * .pi * filterFreq * invSampleRate)
        
        var filtered: Float
        if p.noiseFilterType == "highpass" {
            filtered = noise - voice.filterState
            voice.filterState = noise * (1 - coeff) + voice.filterState * coeff
        } else if p.noiseFilterType == "bandpass" {
            // Simple bandpass (lowpass then highpass)
            let lp = voice.filterState * coeff + noise * (1 - coeff)
            filtered = noise - lp
            voice.filterState = lp
        } else {
            // Lowpass
            filtered = voice.filterState * coeff + noise * (1 - coeff)
            voice.filterState = filtered
        }
        
        return (filtered * voice.envelope, false)
    }
    
    // MARK: - Voice Triggering
    
    func triggerVoice(_ type: DrumVoiceType, velocity: Float = 0.8) {
        voiceLock.lock()
        defer { voiceLock.unlock() }
        
        // Limit active voices
        if activeVoices.count >= maxActiveVoices {
            activeVoices.removeFirst()
        }
        
        var voiceParams = ActiveVoice.VoiceParams()
        var level: Float = 1.0
        
        switch type {
        case .sub:
            voiceParams.subFreq = Float(params.drumSubFreq)
            voiceParams.subDecay = Float(params.drumSubDecay) / 1000
            voiceParams.subTone = Float(params.drumSubTone)
            level = Float(params.drumSubLevel)
            
        case .kick:
            voiceParams.kickFreq = Float(params.drumKickFreq)
            voiceParams.kickPitchEnv = Float(params.drumKickPitchEnv)
            voiceParams.kickPitchDecay = Float(params.drumKickPitchDecay) / 1000
            voiceParams.kickDecay = Float(params.drumKickDecay) / 1000
            voiceParams.kickClick = Float(params.drumKickClick)
            level = Float(params.drumKickLevel)
            
        case .click:
            voiceParams.clickDecay = Float(params.drumClickDecay) / 1000
            voiceParams.clickFilter = Float(params.drumClickFilter)
            voiceParams.clickTone = Float(params.drumClickTone)
            voiceParams.clickResonance = Float(params.drumClickResonance)
            level = Float(params.drumClickLevel)
            
        case .beepHi:
            voiceParams.beepHiFreq = Float(params.drumBeepHiFreq)
            voiceParams.beepHiAttack = Float(params.drumBeepHiAttack) / 1000
            voiceParams.beepHiDecay = Float(params.drumBeepHiDecay) / 1000
            voiceParams.beepHiTone = Float(params.drumBeepHiTone)
            level = Float(params.drumBeepHiLevel)
            
        case .beepLo:
            voiceParams.beepLoFreq = Float(params.drumBeepLoFreq)
            voiceParams.beepLoAttack = Float(params.drumBeepLoAttack) / 1000
            voiceParams.beepLoDecay = Float(params.drumBeepLoDecay) / 1000
            voiceParams.beepLoTone = Float(params.drumBeepLoTone)
            level = Float(params.drumBeepLoLevel)
            
        case .noise:
            voiceParams.noiseFilterFreq = Float(params.drumNoiseFilterFreq)
            voiceParams.noiseFilterQ = Float(params.drumNoiseFilterQ)
            voiceParams.noiseFilterType = params.drumNoiseFilterType
            voiceParams.noiseAttack = Float(params.drumNoiseAttack) / 1000
            voiceParams.noiseDecay = Float(params.drumNoiseDecay) / 1000
            level = Float(params.drumNoiseLevel)
        }
        
        let voice = ActiveVoice(
            type: type,
            velocity: velocity,
            level: level,
            params: voiceParams,
            noiseIndex: Int.random(in: 0..<noiseBufferSize)
        )
        
        activeVoices.append(voice)
        
        // Notify UI
        DispatchQueue.main.async { [weak self] in
            self?.onDrumTrigger?(type, velocity)
        }
    }
    
    // MARK: - Parameter Updates
    
    func updateParams(_ params: SliderState) {
        self.params = params
        self.enabled = params.drumEnabled
        self.masterLevel = Float(params.drumLevel)
        self.reverbSendLevel = Float(params.drumReverbSend)
        
        // Start/stop schedulers based on enabled state
        if params.drumEnabled {
            if params.drumRandomEnabled && randomScheduleTimer == nil {
                startRandomScheduler()
            } else if !params.drumRandomEnabled {
                stopRandomScheduler()
            }
            
            if params.drumEuclidMasterEnabled && euclidScheduleTimer == nil {
                startEuclidScheduler()
            } else if !params.drumEuclidMasterEnabled {
                stopEuclidScheduler()
            }
        } else {
            stopRandomScheduler()
            stopEuclidScheduler()
        }
    }
    
    func start() {
        if !params.drumEnabled { return }
        
        if params.drumRandomEnabled {
            startRandomScheduler()
        }
        if params.drumEuclidMasterEnabled {
            startEuclidScheduler()
        }
    }
    
    func stop() {
        stopRandomScheduler()
        stopEuclidScheduler()
    }
    
    // MARK: - Random Scheduler
    
    private func startRandomScheduler() {
        guard randomScheduleTimer == nil else { return }
        
        randomScheduleTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.scheduleRandomTriggers()
        }
    }
    
    private func stopRandomScheduler() {
        randomScheduleTimer?.invalidate()
        randomScheduleTimer = nil
    }
    
    private func scheduleRandomTriggers() {
        guard enabled, params.drumRandomEnabled else { return }
        
        let now = Date().timeIntervalSince1970
        let density = params.drumRandomDensity
        let minInterval = params.drumRandomMinInterval / 1000
        
        let voices: [(type: DrumVoiceType, prob: Double)] = [
            (.sub, params.drumRandomSubProb),
            (.kick, params.drumRandomKickProb),
            (.click, params.drumRandomClickProb),
            (.beepHi, params.drumRandomBeepHiProb),
            (.beepLo, params.drumRandomBeepLoProb),
            (.noise, params.drumRandomNoiseProb)
        ]
        
        for v in voices {
            let effectiveProb = v.prob * density
            let lastTime = lastRandomTimes[v.type] ?? 0
            let timeSinceLast = now - lastTime
            
            if timeSinceLast >= minInterval && Double(rng()) < effectiveProb {
                let velocity = 0.5 + Float(rng()) * 0.5
                triggerVoice(v.type, velocity: velocity)
                lastRandomTimes[v.type] = now
            }
        }
    }
    
    // MARK: - Euclidean Scheduler
    
    private func startEuclidScheduler() {
        guard euclidScheduleTimer == nil else { return }
        
        euclidCurrentStep = [0, 0, 0, 0]
        lastScheduleTime = Date().timeIntervalSince1970
        
        euclidScheduleTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.scheduleEuclideanTriggers()
        }
    }
    
    private func stopEuclidScheduler() {
        euclidScheduleTimer?.invalidate()
        euclidScheduleTimer = nil
    }
    
    private func scheduleEuclideanTriggers() {
        guard enabled, params.drumEuclidMasterEnabled else { return }
        
        let now = Date().timeIntervalSince1970
        let baseBPM = params.drumEuclidBaseBPM
        let tempo = params.drumEuclidTempo
        let division = params.drumEuclidDivision
        let swing = params.drumEuclidSwing / 100
        
        // Calculate step duration
        let beatDuration = 60.0 / (baseBPM * tempo)
        let stepDuration = (beatDuration * 4) / Double(division)
        
        // Get lane configurations
        let lanes = [
            getLaneConfig(1),
            getLaneConfig(2),
            getLaneConfig(3),
            getLaneConfig(4)
        ]
        
        // Schedule while we're behind
        while lastScheduleTime < now {
            let stepTime = lastScheduleTime
            
            // Apply swing (delay offbeats)
            let stepIndex = Int(stepTime / stepDuration)
            let isOffbeat = stepIndex % 2 == 1
            let actualTime = isOffbeat && swing > 0 ? 
                stepTime + stepDuration * swing * 0.5 : stepTime
            
            // Only trigger if not too far in the past
            if actualTime >= now - 0.1 {
                for (laneIndex, lane) in lanes.enumerated() {
                    guard lane.enabled else { continue }
                    
                    let voices = lane.enabledVoices
                    guard !voices.isEmpty else { continue }
                    
                    let pattern = generateEuclideanPattern(
                        steps: lane.steps,
                        hits: lane.hits,
                        rotation: lane.rotation
                    )
                    
                    let currentStep = euclidCurrentStep[laneIndex] % lane.steps
                    
                    if pattern[currentStep] {
                        // Probability check
                        if Double(rng()) <= lane.probability {
                            let velocity = Float(lane.velocityMin + rng() * Float(lane.velocityMax - lane.velocityMin))
                            // Pick random voice from enabled voices
                            let selectedVoice = voices[Int(rng() * Float(voices.count)) % voices.count]
                            triggerVoice(selectedVoice, velocity: velocity * Float(lane.level))
                        }
                    }
                    
                    euclidCurrentStep[laneIndex] = (euclidCurrentStep[laneIndex] + 1) % lane.steps
                }
            }
            
            lastScheduleTime += stepDuration
        }
    }
    
    private struct LaneConfig {
        var enabled: Bool
        var steps: Int
        var hits: Int
        var rotation: Int
        var enabledVoices: [DrumVoiceType]
        var probability: Double
        var velocityMin: Double
        var velocityMax: Double
        var level: Double
    }
    
    private func getLaneConfig(_ lane: Int) -> LaneConfig {
        var config = LaneConfig(
            enabled: false,
            steps: 16,
            hits: 4,
            rotation: 0,
            enabledVoices: [],
            probability: 1.0,
            velocityMin: 0.8,
            velocityMax: 0.8,
            level: 0.8
        )
        
        switch lane {
        case 1:
            config.enabled = params.drumEuclid1Enabled
            let preset = params.drumEuclid1Preset
            if let p = presetData[preset] {
                config.steps = p.steps
                config.hits = p.hits
                config.rotation = (p.rotation + params.drumEuclid1Rotation) % p.steps
            } else {
                config.steps = params.drumEuclid1Steps
                config.hits = params.drumEuclid1Hits
                config.rotation = params.drumEuclid1Rotation
            }
            if params.drumEuclid1TargetSub { config.enabledVoices.append(.sub) }
            if params.drumEuclid1TargetKick { config.enabledVoices.append(.kick) }
            if params.drumEuclid1TargetClick { config.enabledVoices.append(.click) }
            if params.drumEuclid1TargetBeepHi { config.enabledVoices.append(.beepHi) }
            if params.drumEuclid1TargetBeepLo { config.enabledVoices.append(.beepLo) }
            if params.drumEuclid1TargetNoise { config.enabledVoices.append(.noise) }
            config.probability = params.drumEuclid1Probability
            config.velocityMin = params.drumEuclid1VelocityMin
            config.velocityMax = params.drumEuclid1VelocityMax
            config.level = params.drumEuclid1Level
            
        case 2:
            config.enabled = params.drumEuclid2Enabled
            let preset = params.drumEuclid2Preset
            if let p = presetData[preset] {
                config.steps = p.steps
                config.hits = p.hits
                config.rotation = (p.rotation + params.drumEuclid2Rotation) % p.steps
            } else {
                config.steps = params.drumEuclid2Steps
                config.hits = params.drumEuclid2Hits
                config.rotation = params.drumEuclid2Rotation
            }
            if params.drumEuclid2TargetSub { config.enabledVoices.append(.sub) }
            if params.drumEuclid2TargetKick { config.enabledVoices.append(.kick) }
            if params.drumEuclid2TargetClick { config.enabledVoices.append(.click) }
            if params.drumEuclid2TargetBeepHi { config.enabledVoices.append(.beepHi) }
            if params.drumEuclid2TargetBeepLo { config.enabledVoices.append(.beepLo) }
            if params.drumEuclid2TargetNoise { config.enabledVoices.append(.noise) }
            config.probability = params.drumEuclid2Probability
            config.velocityMin = params.drumEuclid2VelocityMin
            config.velocityMax = params.drumEuclid2VelocityMax
            config.level = params.drumEuclid2Level
            
        case 3:
            config.enabled = params.drumEuclid3Enabled
            let preset = params.drumEuclid3Preset
            if let p = presetData[preset] {
                config.steps = p.steps
                config.hits = p.hits
                config.rotation = (p.rotation + params.drumEuclid3Rotation) % p.steps
            } else {
                config.steps = params.drumEuclid3Steps
                config.hits = params.drumEuclid3Hits
                config.rotation = params.drumEuclid3Rotation
            }
            if params.drumEuclid3TargetSub { config.enabledVoices.append(.sub) }
            if params.drumEuclid3TargetKick { config.enabledVoices.append(.kick) }
            if params.drumEuclid3TargetClick { config.enabledVoices.append(.click) }
            if params.drumEuclid3TargetBeepHi { config.enabledVoices.append(.beepHi) }
            if params.drumEuclid3TargetBeepLo { config.enabledVoices.append(.beepLo) }
            if params.drumEuclid3TargetNoise { config.enabledVoices.append(.noise) }
            config.probability = params.drumEuclid3Probability
            config.velocityMin = params.drumEuclid3VelocityMin
            config.velocityMax = params.drumEuclid3VelocityMax
            config.level = params.drumEuclid3Level
            
        case 4:
            config.enabled = params.drumEuclid4Enabled
            let preset = params.drumEuclid4Preset
            if let p = presetData[preset] {
                config.steps = p.steps
                config.hits = p.hits
                config.rotation = (p.rotation + params.drumEuclid4Rotation) % p.steps
            } else {
                config.steps = params.drumEuclid4Steps
                config.hits = params.drumEuclid4Hits
                config.rotation = params.drumEuclid4Rotation
            }
            if params.drumEuclid4TargetSub { config.enabledVoices.append(.sub) }
            if params.drumEuclid4TargetKick { config.enabledVoices.append(.kick) }
            if params.drumEuclid4TargetClick { config.enabledVoices.append(.click) }
            if params.drumEuclid4TargetBeepHi { config.enabledVoices.append(.beepHi) }
            if params.drumEuclid4TargetBeepLo { config.enabledVoices.append(.beepLo) }
            if params.drumEuclid4TargetNoise { config.enabledVoices.append(.noise) }
            config.probability = params.drumEuclid4Probability
            config.velocityMin = params.drumEuclid4VelocityMin
            config.velocityMax = params.drumEuclid4VelocityMax
            config.level = params.drumEuclid4Level
            
        default:
            break
        }
        
        return config
    }
    
    /// Generate Euclidean rhythm pattern using Bresenham's algorithm
    private func generateEuclideanPattern(steps: Int, hits: Int, rotation: Int) -> [Bool] {
        guard steps > 0 else { return [] }
        let clampedHits = max(0, min(hits, steps))
        
        if clampedHits >= steps { return [Bool](repeating: true, count: steps) }
        if clampedHits <= 0 { return [Bool](repeating: false, count: steps) }
        
        // Bresenham's line algorithm for even distribution
        var pattern = [Bool](repeating: false, count: steps)
        for i in 0..<clampedHits {
            let pos = (i * steps) / clampedHits
            pattern[pos] = true
        }
        
        // Apply rotation
        var rotated = [Bool](repeating: false, count: steps)
        for i in 0..<steps {
            rotated[i] = pattern[(i + rotation) % steps]
        }
        
        return rotated
    }
}
