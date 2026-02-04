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
    
    // Callback for morph trigger visualization (per-trigger random position)
    var onMorphTrigger: ((DrumVoiceType, Double) -> Void)?
    
    // Morph ranges for per-trigger randomization (like delay/expression)
    private var morphRanges: [DrumVoiceType: (min: Double, max: Double)?] = [
        .sub: nil, .kick: nil, .click: nil, .beepHi: nil, .beepLo: nil, .noise: nil
    ]
    
    // Morph manager for auto-morph (exposed for external access)
    let morphManager = DrumMorphManager()
    
    // Per-voice delay send levels (used for output mixing)
    private var delaySendLevels: [DrumVoiceType: Float] = [
        .sub: 0, .kick: 0.2, .click: 0.5, .beepHi: 0.6, .beepLo: 0.4, .noise: 0.7
    ]
    
    // Separate delay output buffer for stereo ping-pong delay
    private var delayOutputBuffer: [Float] = []
    private var delayBufferWriteIndex: Int = 0
    private let delayBufferSize = 4410  // ~100ms at 44.1kHz
    
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
        var filterState2: Float = 0 // For second filter stage
        var pluckBuffer: [Float] = []  // For Karplus-Strong
        var pluckIndex: Int = 0
        var shimmerPhase: Float = 0  // For shimmer LFO
        var delaySend: Float = 0     // Per-voice delay send level
        
        struct VoiceParams {
            // Sub
            var subFreq: Float = 50
            var subDecay: Float = 0.15
            var subTone: Float = 0.1
            var subShape: Float = 0           // 0=sine, 0.5=triangle, 1=saw
            var subPitchEnv: Float = 0        // semitones
            var subPitchDecay: Float = 0.05   // seconds
            var subDrive: Float = 0           // saturation
            var subSub: Float = 0             // sub-octave mix
            
            // Kick
            var kickFreq: Float = 55
            var kickPitchEnv: Float = 24
            var kickPitchDecay: Float = 0.03
            var kickDecay: Float = 0.2
            var kickClick: Float = 0.3
            var kickBody: Float = 0.3         // boomy resonance
            var kickPunch: Float = 0.8        // transient sharpness
            var kickTail: Float = 0           // reverberant tail
            var kickTone: Float = 0           // harmonic content
            
            // Click
            var clickDecay: Float = 0.005
            var clickFilter: Float = 4000
            var clickTone: Float = 0.3
            var clickResonance: Float = 0.4
            var clickPitch: Float = 2000      // tonal mode pitch
            var clickPitchEnv: Float = 0      // pitch sweep
            var clickMode: String = "impulse" // impulse, noise, tonal, granular
            var clickGrainCount: Int = 1
            var clickGrainSpread: Float = 0
            var clickStereoWidth: Float = 0
            
            // BeepHi
            var beepHiFreq: Float = 4000
            var beepHiAttack: Float = 0.001
            var beepHiDecay: Float = 0.08
            var beepHiTone: Float = 0.2
            var beepHiInharmonic: Float = 0   // partial detune
            var beepHiPartials: Int = 1       // number of partials
            var beepHiShimmer: Float = 0      // vibrato/chorus
            var beepHiShimmerRate: Float = 4  // LFO rate Hz
            var beepHiBrightness: Float = 0.5 // spectral tilt
            
            // BeepLo
            var beepLoFreq: Float = 400
            var beepLoAttack: Float = 0.002
            var beepLoDecay: Float = 0.1
            var beepLoTone: Float = 0.1
            var beepLoPitchEnv: Float = 0     // semitones
            var beepLoPitchDecay: Float = 0.05 // seconds
            var beepLoBody: Float = 0.3       // resonance
            var beepLoPluck: Float = 0        // Karplus-Strong amount
            var beepLoPluckDamp: Float = 0.5  // pluck damping
            
            // Noise
            var noiseFilterFreq: Float = 8000
            var noiseFilterQ: Float = 1
            var noiseFilterType: String = "highpass"
            var noiseAttack: Float = 0
            var noiseDecay: Float = 0.03
            var noiseFormant: Float = 0       // vowel formant morph
            var noiseBreath: Float = 0        // breathiness
            var noiseFilterEnv: Float = 0     // filter envelope direction
            var noiseFilterEnvDecay: Float = 0.1 // seconds
            var noiseDensity: Float = 1       // 0=sparse, 1=dense
            var noiseColorLFO: Float = 0      // filter mod rate Hz
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
                let (mainSample, _) = self.generateSampleWithDelay()
                leftBuffer[frame] = mainSample * self.masterLevel
                rightBuffer[frame] = mainSample * self.masterLevel
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
    /// Returns (mainOutput, delayOutput) for routing to delay send
    private func generateSampleWithDelay() -> (main: Float, delay: Float) {
        voiceLock.lock()
        defer { voiceLock.unlock() }
        
        var output: Float = 0
        var delayOutput: Float = 0
        var newActiveVoices: [ActiveVoice] = []
        
        for var voice in activeVoices {
            let (sample, finished) = processVoice(&voice)
            if !finished {
                newActiveVoices.append(voice)
            }
            output += sample
            // Route sample to delay based on per-voice send level
            delayOutput += sample * voice.delaySend
        }
        
        activeVoices = newActiveVoices
        
        // Soft clip both outputs
        return (tanh(output), tanh(delayOutput))
    }
    
    /// Get current delay output level for routing
    func getDelayOutputLevel() -> Float {
        return params.drumDelayEnabled ? Float(params.drumDelayMix) : 0
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
        
        // Pitch envelope
        var freq = p.subFreq
        if abs(p.subPitchEnv) > 0.1 {
            let pitchMult = pow(2, p.subPitchEnv / 12)
            let pitchEnvVal = exp(-voice.time / (p.subPitchDecay * 0.3))
            freq = p.subFreq + (p.subFreq * (pitchMult - 1)) * pitchEnvVal
        }
        
        // Main oscillator with shape morphing
        voice.phase += freq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        
        var osc: Float
        if p.subShape < 0.33 {
            // Sine to triangle blend
            let blend = p.subShape / 0.33
            let sine = sin(voice.phase * 2 * .pi)
            let tri = 4 * abs(voice.phase - 0.5) - 1
            osc = sine * (1 - blend) + tri * blend
        } else if p.subShape < 0.66 {
            // Triangle to saw blend
            let blend = (p.subShape - 0.33) / 0.33
            let tri = 4 * abs(voice.phase - 0.5) - 1
            let saw = 2 * voice.phase - 1
            osc = tri * (1 - blend) + saw * blend
        } else {
            // Mostly saw
            osc = 2 * voice.phase - 1
        }
        
        // Sub-octave
        if p.subSub > 0.05 {
            voice.phase2 += (freq * 0.5) * invSampleRate
            if voice.phase2 >= 1 { voice.phase2 -= 1 }
            let subOsc = sin(voice.phase2 * 2 * .pi)
            osc = osc * (1 - p.subSub) + subOsc * p.subSub
        }
        
        // Optional overtone
        if p.subTone > 0.05 {
            voice.modPhase += freq * 2 * invSampleRate
            if voice.modPhase >= 1 { voice.modPhase -= 1 }
            osc += sin(voice.modPhase * 2 * .pi) * p.subTone * 0.3
        }
        
        // Drive/saturation
        if p.subDrive > 0.05 {
            osc = tanh(osc * (1 + p.subDrive * 3))
        }
        
        return (osc * voice.envelope, false)
    }
    
    private func processKickVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let ampDecay = p.kickDecay * (1 + p.kickBody * 2)  // Body extends decay
        
        if voice.time >= ampDecay * 3 { return (0, true) }
        
        // Pitch envelope
        let pitchDecay = p.kickPitchDecay * (1 - p.kickPunch * 0.5)  // Punch shortens pitch decay
        let startFreq = p.kickFreq * pow(2, p.kickPitchEnv / 12)
        let currentFreq = p.kickFreq + (startFreq - p.kickFreq) * exp(-voice.time / (pitchDecay * 0.3))
        
        // Amplitude envelope with tail
        var env = exp(-voice.time / (ampDecay * 0.3))
        if p.kickTail > 0.1 {
            let tailEnv = exp(-voice.time / (ampDecay * 2))
            env = env * (1 - p.kickTail) + tailEnv * p.kickTail
        }
        voice.envelope = env
        
        // Main oscillator
        voice.phase += currentFreq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        var osc = sin(voice.phase * 2 * .pi)
        
        // Harmonic content (tone)
        if p.kickTone > 0.1 {
            voice.modPhase += currentFreq * 2 * invSampleRate
            if voice.modPhase >= 1 { voice.modPhase -= 1 }
            osc += sin(voice.modPhase * 2 * .pi) * p.kickTone * 0.3
        }
        
        // Click transient with punch control
        if p.kickClick > 0.05 && voice.time < 0.015 {
            let clickDecay: Float = 0.002 / (1 + p.kickPunch)
            voice.phase2 += 3000 * invSampleRate
            if voice.phase2 >= 1 { voice.phase2 -= 1 }
            let clickEnv = exp(-voice.time / clickDecay)
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
        
        var sample: Float = 0
        
        if p.clickMode == "tonal" {
            // Tonal click with pitch envelope
            var freq = p.clickPitch
            if abs(p.clickPitchEnv) > 0.1 {
                let pitchMult = pow(2, p.clickPitchEnv / 12)
                let pitchEnvVal = exp(-voice.time / (decay * 0.5))
                freq = p.clickPitch + (p.clickPitch * (pitchMult - 1)) * pitchEnvVal
            }
            voice.phase += freq * invSampleRate
            if voice.phase >= 1 { voice.phase -= 1 }
            sample = sin(voice.phase * 2 * .pi)
        } else {
            // Noise-based (impulse, noise, granular)
            let noiseIdx = (voice.noiseIndex + 1) % noiseBufferSize
            voice.noiseIndex = noiseIdx
            var noise = noiseBuffer[noiseIdx]
            
            // Density modulation for granular
            if p.clickMode == "granular" || p.clickTone > 0.5 {
                // Add some tonal content
                voice.phase += p.clickPitch * invSampleRate
                if voice.phase >= 1 { voice.phase -= 1 }
                noise = noise * (1 - p.clickTone) + sin(voice.phase * 2 * .pi) * p.clickTone
            }
            
            // Highpass filter
            let hpCoeff = exp(-2 * .pi * p.clickFilter * invSampleRate)
            let hpOut = noise - voice.filterState
            voice.filterState = noise * (1 - hpCoeff) + voice.filterState * hpCoeff
            
            // Add resonance
            sample = hpOut + voice.filterState * p.clickResonance
        }
        
        return (sample * voice.envelope, false)
    }
    
    private func processBeepHiVoice(_ voice: inout ActiveVoice) -> (Float, Bool) {
        let p = voice.params
        let attack = p.beepHiAttack
        let decay = p.beepHiDecay
        let totalTime = attack + decay
        
        if voice.time >= totalTime * 3 { return (0, true) }
        
        // Attack/decay envelope
        if voice.time < attack {
            voice.envelope = attack > 0 ? voice.time / attack : 1.0
        } else {
            voice.envelope = exp(-(voice.time - attack) / (decay * 0.3))
        }
        
        // Shimmer LFO
        var freqMod: Float = 0
        if p.beepHiShimmer > 0.01 {
            voice.shimmerPhase += p.beepHiShimmerRate * invSampleRate
            if voice.shimmerPhase >= 1 { voice.shimmerPhase -= 1 }
            freqMod = sin(voice.shimmerPhase * 2 * .pi) * p.beepHiShimmer * 0.02
        }
        
        // Main oscillator with partials
        let baseFreq = p.beepHiFreq * (1 + freqMod)
        voice.phase += baseFreq * invSampleRate
        if voice.phase >= 1 { voice.phase -= 1 }
        
        var osc = sin(voice.phase * 2 * .pi) * (1 - p.beepHiBrightness * 0.3)
        
        // Add partials
        for i in 2...p.beepHiPartials {
            let partialRatio = Float(i) * (1 + p.beepHiInharmonic * 0.03 * Float(i - 1))
            let partialAmp = 1.0 / Float(i) * p.beepHiBrightness
            voice.modPhase += baseFreq * partialRatio * invSampleRate
            if voice.modPhase >= 1 { voice.modPhase -= 1 }
            osc += sin(voice.modPhase * 2 * .pi) * partialAmp
        }
        
        // FM modulation for metallic character
        if p.beepHiTone > 0.1 {
            let modFreq = baseFreq * 2.01
            voice.phase2 += modFreq * invSampleRate
            if voice.phase2 >= 1 { voice.phase2 -= 1 }
            let modDepth = p.beepHiTone * baseFreq * 0.3
            let fm = sin(voice.phase2 * 2 * .pi) * modDepth / baseFreq
            osc = osc * 0.7 + sin((voice.phase + fm) * 2 * .pi) * 0.3
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
            voice.envelope = attack > 0 ? voice.time / attack : 1.0
        } else {
            voice.envelope = exp(-(voice.time - attack) / (decay * 0.3))
        }
        
        // Pitch envelope (negative = pitch rises, like a droplet)
        var freq = p.beepLoFreq
        if abs(p.beepLoPitchEnv) > 0.1 {
            let pitchMult = pow(2, p.beepLoPitchEnv / 12)
            let pitchEnvVal = exp(-voice.time / (p.beepLoPitchDecay * 0.3))
            freq = p.beepLoFreq + (p.beepLoFreq * (pitchMult - 1)) * pitchEnvVal
        }
        
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
        
        // Body resonance (2-pole filter for warmth)
        if p.beepLoBody > 0.1 {
            let bodyFreq = freq * 1.5
            let bodyCoeff = exp(-2 * .pi * bodyFreq * invSampleRate)
            voice.filterState2 = voice.filterState2 * bodyCoeff + osc * (1 - bodyCoeff) * p.beepLoBody
            osc += voice.filterState2 * 0.3
        }
        
        // Karplus-Strong pluck simulation (simplified)
        if p.beepLoPluck > 0.1 && voice.pluckBuffer.isEmpty {
            // Initialize pluck buffer on first sample
            let bufferSize = Int(sampleRate / freq)
            voice.pluckBuffer = (0..<bufferSize).map { _ in Float.random(in: -1...1) }
        }
        if p.beepLoPluck > 0.1 && !voice.pluckBuffer.isEmpty {
            let bufSize = voice.pluckBuffer.count
            let idx = voice.pluckIndex % bufSize
            let nextIdx = (idx + 1) % bufSize
            let pluckSample = (voice.pluckBuffer[idx] + voice.pluckBuffer[nextIdx]) * 0.5 * (1 - p.beepLoPluckDamp * 0.3)
            voice.pluckBuffer[idx] = pluckSample
            voice.pluckIndex += 1
            osc = osc * (1 - p.beepLoPluck) + pluckSample * p.beepLoPluck
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
        
        // Filter envelope
        var filterFreq = p.noiseFilterFreq
        if abs(p.noiseFilterEnv) > 0.01 {
            let filterEnvVal = exp(-voice.time / (p.noiseFilterEnvDecay * 0.3))
            filterFreq = p.noiseFilterFreq * (1 + p.noiseFilterEnv * filterEnvVal)
            filterFreq = max(200, min(15000, filterFreq))
        }
        
        // Filter color LFO
        if p.noiseColorLFO > 0.1 {
            voice.shimmerPhase += p.noiseColorLFO * invSampleRate
            if voice.shimmerPhase >= 1 { voice.shimmerPhase -= 1 }
            let lfoMod = sin(voice.shimmerPhase * 2 * .pi) * 0.3
            filterFreq = filterFreq * (1 + lfoMod)
        }
        
        // Noise source with density
        let noiseIdx = (voice.noiseIndex + 1) % noiseBufferSize
        voice.noiseIndex = noiseIdx
        var noise = noiseBuffer[noiseIdx]
        
        // Sparse noise for dust-like sounds
        if p.noiseDensity < 0.9 {
            let threshold = 1 - p.noiseDensity
            if abs(noise) < threshold {
                noise = 0
            }
        }
        
        // Breath/breathiness (add formant-like character)
        if p.noiseBreath > 0.1 {
            // Simple resonant filter for breath
            let breathFreq: Float = 1500 + p.noiseFormant * 1500
            let breathCoeff = exp(-2 * .pi * breathFreq * invSampleRate)
            voice.filterState2 = voice.filterState2 * breathCoeff * 0.9 + noise * (1 - breathCoeff)
            noise = noise * (1 - p.noiseBreath) + voice.filterState2 * p.noiseBreath
        }
        
        // Main filter
        let coeff = exp(-2 * .pi * filterFreq * invSampleRate)
        
        var filtered: Float
        if p.noiseFilterType == "highpass" {
            filtered = noise - voice.filterState
            voice.filterState = noise * (1 - coeff) + voice.filterState * coeff
        } else if p.noiseFilterType == "bandpass" {
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
    
    // MARK: - Morph System
    
    /// Set morph range for per-trigger randomization
    func setMorphRange(_ voice: DrumVoiceType, range: (min: Double, max: Double)?) {
        morphRanges[voice] = range
    }
    
    /// Get morphed parameter value, respecting morph range for per-trigger randomization
    private func getMorphedParamValue(
        for type: DrumVoiceType,
        morphedParams: [String: Any],
        sliderValue: Double,
        key: String
    ) -> Double {
        if let morphed = morphedParams[key] as? Double {
            return morphed
        }
        return sliderValue
    }
    
    // MARK: - Voice Triggering
    
    func triggerVoice(_ type: DrumVoiceType, velocity: Float = 0.8) {
        voiceLock.lock()
        defer { voiceLock.unlock() }
        
        // Limit active voices
        if activeVoices.count >= maxActiveVoices {
            activeVoices.removeFirst()
        }
        
        // Get random morph value within range if range is set (per-trigger randomization)
        let range = morphRanges[type] ?? nil
        var morphValue: Double? = nil
        if let r = range {
            morphValue = r.min + Double.random(in: 0...1) * (r.max - r.min)
            // Notify UI of triggered morph position (normalized 0-1 within range)
            let normalizedPos = r.max > r.min
                ? (morphValue! - r.min) / (r.max - r.min)
                : 0.5
            DispatchQueue.main.async { [weak self] in
                self?.onMorphTrigger?(type, normalizedPos)
            }
        }
        
        // Only use morphed params when per-trigger randomization is active
        // Otherwise use slider values directly (which already have morph applied in UI)
        let morphedParams = range != nil ? getMorphedParams(state: params, voice: type, morphOverride: morphValue) : [:]
        
        var voiceParams = ActiveVoice.VoiceParams()
        var level: Float = 1.0
        var delaySend: Float = 0
        
        switch type {
        case .sub:
            voiceParams.subFreq = Float(morphedParams["drumSubFreq"] as? Double ?? params.drumSubFreq)
            voiceParams.subDecay = Float(morphedParams["drumSubDecay"] as? Double ?? params.drumSubDecay) / 1000
            voiceParams.subTone = Float(morphedParams["drumSubTone"] as? Double ?? params.drumSubTone)
            voiceParams.subShape = Float(morphedParams["drumSubShape"] as? Double ?? params.drumSubShape)
            voiceParams.subPitchEnv = Float(morphedParams["drumSubPitchEnv"] as? Double ?? params.drumSubPitchEnv)
            voiceParams.subPitchDecay = Float(morphedParams["drumSubPitchDecay"] as? Double ?? params.drumSubPitchDecay) / 1000
            voiceParams.subDrive = Float(morphedParams["drumSubDrive"] as? Double ?? params.drumSubDrive)
            voiceParams.subSub = Float(morphedParams["drumSubSub"] as? Double ?? params.drumSubSub)
            level = Float(morphedParams["drumSubLevel"] as? Double ?? params.drumSubLevel)
            delaySend = Float(params.drumSubDelaySend)
            
        case .kick:
            voiceParams.kickFreq = Float(morphedParams["drumKickFreq"] as? Double ?? params.drumKickFreq)
            voiceParams.kickPitchEnv = Float(morphedParams["drumKickPitchEnv"] as? Double ?? params.drumKickPitchEnv)
            voiceParams.kickPitchDecay = Float(morphedParams["drumKickPitchDecay"] as? Double ?? params.drumKickPitchDecay) / 1000
            voiceParams.kickDecay = Float(morphedParams["drumKickDecay"] as? Double ?? params.drumKickDecay) / 1000
            voiceParams.kickClick = Float(morphedParams["drumKickClick"] as? Double ?? params.drumKickClick)
            voiceParams.kickBody = Float(morphedParams["drumKickBody"] as? Double ?? params.drumKickBody)
            voiceParams.kickPunch = Float(morphedParams["drumKickPunch"] as? Double ?? params.drumKickPunch)
            voiceParams.kickTail = Float(morphedParams["drumKickTail"] as? Double ?? params.drumKickTail)
            voiceParams.kickTone = Float(morphedParams["drumKickTone"] as? Double ?? params.drumKickTone)
            level = Float(morphedParams["drumKickLevel"] as? Double ?? params.drumKickLevel)
            delaySend = Float(params.drumKickDelaySend)
            
        case .click:
            voiceParams.clickDecay = Float(morphedParams["drumClickDecay"] as? Double ?? params.drumClickDecay) / 1000
            voiceParams.clickFilter = Float(morphedParams["drumClickFilter"] as? Double ?? params.drumClickFilter)
            voiceParams.clickTone = Float(morphedParams["drumClickTone"] as? Double ?? params.drumClickTone)
            voiceParams.clickResonance = Float(morphedParams["drumClickResonance"] as? Double ?? params.drumClickResonance)
            voiceParams.clickPitch = Float(morphedParams["drumClickPitch"] as? Double ?? params.drumClickPitch)
            voiceParams.clickPitchEnv = Float(morphedParams["drumClickPitchEnv"] as? Double ?? params.drumClickPitchEnv)
            voiceParams.clickMode = morphedParams["drumClickMode"] as? String ?? params.drumClickMode
            voiceParams.clickGrainCount = morphedParams["drumClickGrainCount"] as? Int ?? params.drumClickGrainCount
            voiceParams.clickGrainSpread = Float(morphedParams["drumClickGrainSpread"] as? Double ?? params.drumClickGrainSpread)
            voiceParams.clickStereoWidth = Float(morphedParams["drumClickStereoWidth"] as? Double ?? params.drumClickStereoWidth)
            level = Float(morphedParams["drumClickLevel"] as? Double ?? params.drumClickLevel)
            delaySend = Float(params.drumClickDelaySend)
            
        case .beepHi:
            voiceParams.beepHiFreq = Float(morphedParams["drumBeepHiFreq"] as? Double ?? params.drumBeepHiFreq)
            voiceParams.beepHiAttack = Float(morphedParams["drumBeepHiAttack"] as? Double ?? params.drumBeepHiAttack) / 1000
            voiceParams.beepHiDecay = Float(morphedParams["drumBeepHiDecay"] as? Double ?? params.drumBeepHiDecay) / 1000
            voiceParams.beepHiTone = Float(morphedParams["drumBeepHiTone"] as? Double ?? params.drumBeepHiTone)
            voiceParams.beepHiInharmonic = Float(morphedParams["drumBeepHiInharmonic"] as? Double ?? params.drumBeepHiInharmonic)
            voiceParams.beepHiPartials = morphedParams["drumBeepHiPartials"] as? Int ?? params.drumBeepHiPartials
            voiceParams.beepHiShimmer = Float(morphedParams["drumBeepHiShimmer"] as? Double ?? params.drumBeepHiShimmer)
            voiceParams.beepHiShimmerRate = Float(morphedParams["drumBeepHiShimmerRate"] as? Double ?? params.drumBeepHiShimmerRate)
            voiceParams.beepHiBrightness = Float(morphedParams["drumBeepHiBrightness"] as? Double ?? params.drumBeepHiBrightness)
            level = Float(morphedParams["drumBeepHiLevel"] as? Double ?? params.drumBeepHiLevel)
            delaySend = Float(params.drumBeepHiDelaySend)
            
        case .beepLo:
            voiceParams.beepLoFreq = Float(morphedParams["drumBeepLoFreq"] as? Double ?? params.drumBeepLoFreq)
            voiceParams.beepLoAttack = Float(morphedParams["drumBeepLoAttack"] as? Double ?? params.drumBeepLoAttack) / 1000
            voiceParams.beepLoDecay = Float(morphedParams["drumBeepLoDecay"] as? Double ?? params.drumBeepLoDecay) / 1000
            voiceParams.beepLoTone = Float(morphedParams["drumBeepLoTone"] as? Double ?? params.drumBeepLoTone)
            voiceParams.beepLoPitchEnv = Float(morphedParams["drumBeepLoPitchEnv"] as? Double ?? params.drumBeepLoPitchEnv)
            voiceParams.beepLoPitchDecay = Float(morphedParams["drumBeepLoPitchDecay"] as? Double ?? params.drumBeepLoPitchDecay) / 1000
            voiceParams.beepLoBody = Float(morphedParams["drumBeepLoBody"] as? Double ?? params.drumBeepLoBody)
            voiceParams.beepLoPluck = Float(morphedParams["drumBeepLoPluck"] as? Double ?? params.drumBeepLoPluck)
            voiceParams.beepLoPluckDamp = Float(morphedParams["drumBeepLoPluckDamp"] as? Double ?? params.drumBeepLoPluckDamp)
            level = Float(morphedParams["drumBeepLoLevel"] as? Double ?? params.drumBeepLoLevel)
            delaySend = Float(params.drumBeepLoDelaySend)
            
        case .noise:
            voiceParams.noiseFilterFreq = Float(morphedParams["drumNoiseFilterFreq"] as? Double ?? params.drumNoiseFilterFreq)
            voiceParams.noiseFilterQ = Float(morphedParams["drumNoiseFilterQ"] as? Double ?? params.drumNoiseFilterQ)
            voiceParams.noiseFilterType = morphedParams["drumNoiseFilterType"] as? String ?? params.drumNoiseFilterType
            voiceParams.noiseAttack = Float(morphedParams["drumNoiseAttack"] as? Double ?? params.drumNoiseAttack) / 1000
            voiceParams.noiseDecay = Float(morphedParams["drumNoiseDecay"] as? Double ?? params.drumNoiseDecay) / 1000
            voiceParams.noiseFormant = Float(morphedParams["drumNoiseFormant"] as? Double ?? params.drumNoiseFormant)
            voiceParams.noiseBreath = Float(morphedParams["drumNoiseBreath"] as? Double ?? params.drumNoiseBreath)
            voiceParams.noiseFilterEnv = Float(morphedParams["drumNoiseFilterEnv"] as? Double ?? params.drumNoiseFilterEnv)
            voiceParams.noiseFilterEnvDecay = Float(morphedParams["drumNoiseFilterEnvDecay"] as? Double ?? params.drumNoiseFilterEnvDecay) / 1000
            voiceParams.noiseDensity = Float(morphedParams["drumNoiseDensity"] as? Double ?? params.drumNoiseDensity)
            voiceParams.noiseColorLFO = Float(morphedParams["drumNoiseColorLFO"] as? Double ?? params.drumNoiseColorLFO)
            level = Float(morphedParams["drumNoiseLevel"] as? Double ?? params.drumNoiseLevel)
            delaySend = Float(params.drumNoiseDelaySend)
        }
        
        // Store delay send level for this voice
        delaySendLevels[type] = delaySend
        
        let voice = ActiveVoice(
            type: type,
            velocity: velocity,
            level: level,
            params: voiceParams,
            noiseIndex: Int.random(in: 0..<noiseBufferSize),
            delaySend: delaySend
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
        
        // Update per-voice delay send levels
        delaySendLevels[.sub] = Float(params.drumSubDelaySend)
        delaySendLevels[.kick] = Float(params.drumKickDelaySend)
        delaySendLevels[.click] = Float(params.drumClickDelaySend)
        delaySendLevels[.beepHi] = Float(params.drumBeepHiDelaySend)
        delaySendLevels[.beepLo] = Float(params.drumBeepLoDelaySend)
        delaySendLevels[.noise] = Float(params.drumNoiseDelaySend)
        
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
