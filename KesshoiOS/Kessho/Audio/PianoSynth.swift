import AVFoundation

@inline(__always)
private func clampPiano(_ value: Float, _ minValue: Float, _ maxValue: Float) -> Float {
    return min(max(value, minValue), maxValue)
}

@inline(__always)
private func pianoMidiToFrequency(_ midiNote: Int) -> Float {
    return 440.0 * pow(2.0, Float(midiNote - 69) / 12.0)
}

@inline(__always)
private func writePianoStereoFrame(
    _ left: Float,
    _ right: Float,
    frame: Int,
    to buffers: UnsafeMutableAudioBufferListPointer,
    accumulate: Bool
) {
    if buffers.count == 1, let data = buffers[0].mData?.assumingMemoryBound(to: Float.self) {
        let channelCount = max(Int(buffers[0].mNumberChannels), 1)
        let baseIndex = frame * channelCount
        if channelCount >= 2 {
            if accumulate {
                data[baseIndex] += left
                data[baseIndex + 1] += right
            } else {
                data[baseIndex] = left
                data[baseIndex + 1] = right
            }
            if channelCount > 2 {
                let mono = (left + right) * 0.5
                for channel in 2..<channelCount {
                    if accumulate {
                        data[baseIndex + channel] += mono
                    } else {
                        data[baseIndex + channel] = mono
                    }
                }
            }
        } else {
            let mono = (left + right) * 0.5
            if accumulate {
                data[frame] += mono
            } else {
                data[frame] = mono
            }
        }
        return
    }

    for (index, buffer) in buffers.enumerated() {
        guard let data = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
        let sample = index == 0 ? left : (index == 1 ? right : (left + right) * 0.5)
        if accumulate {
            data[frame] += sample
        } else {
            data[frame] = sample
        }
    }
}

/// Lightweight polyphonic piano approximation for mobile render threads.
///
/// The sound is procedural: a short hammer noise burst, a detuned harmonic stack,
/// and a damped body resonator. It is intentionally fixed-size and allocation-free
/// after initialization so AudioEngine can drive it from harmony events.
final class PianoSynth {
    lazy var node: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(
            standardFormatWithSampleRate: Double(self?.sampleRate ?? 44_100),
            channels: 2
        )!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            self.render(frameCount: Int(frameCount), to: buffers, accumulate: false)
            return noErr
        }
    }()

    private enum EnvelopeStage {
        case off, attack, decay, sustain, hold, release
    }

    private struct Voice {
        var active: Bool = false
        var midiNote: Int = -1
        var frequency: Float = 440
        var velocity: Float = 0
        var ageSamples: Int = 0
        var holdSamplesRemaining: Int = 0
        var env: Float = 0
        var stage: EnvelopeStage = .off
        var releaseStart: Float = 0
        var phase1: Float = 0
        var phase2: Float = 0
        var phase3: Float = 0
        var phase4: Float = 0
        var bodyL: Float = 0
        var bodyR: Float = 0
        var noiseState: UInt32 = 1
        var pan: Float = 0
    }

    private let sampleRate: Float
    private let invSampleRate: Float
    private let maxVoices: Int
    private var voices: [Voice]
    private var noteCounter: UInt32 = 0x1234ABCD

    private var enabled: Bool = true
    private var level: Float = 0.55
    private var postLPF: Float = 0.72
    private var stereoWidth: Float = 0.75
    private var reverbSendGain: Float = 0.22
    private var diffuseSendGain: Float = 0.0

    private var attack: Float = 0.006
    private var decay: Float = 1.35
    private var sustain: Float = 0.18
    private var hold: Float = 0.0
    private var release: Float = 1.2

    private var postLpfL: Float = 0
    private var postLpfR: Float = 0
    private var dcL: Float = 0
    private var dcR: Float = 0

    init(sampleRate: Float = 44_100, maxVoices: Int = 16) {
        self.sampleRate = max(sampleRate, 1_000)
        self.invSampleRate = 1.0 / self.sampleRate
        self.maxVoices = max(1, maxVoices)
        self.voices = [Voice](repeating: Voice(), count: self.maxVoices)
    }

    func render(
        frameCount: Int,
        to buffers: UnsafeMutableAudioBufferListPointer,
        reverbSendBuffers: UnsafeMutableAudioBufferListPointer? = nil,
        diffuseSendBuffers: UnsafeMutableAudioBufferListPointer? = nil,
        accumulate: Bool = false
    ) {
        guard enabled else {
            for frame in 0..<frameCount {
                writePianoStereoFrame(0, 0, frame: frame, to: buffers, accumulate: accumulate)
                if let reverbSendBuffers {
                    writePianoStereoFrame(0, 0, frame: frame, to: reverbSendBuffers, accumulate: accumulate)
                }
                if let diffuseSendBuffers {
                    writePianoStereoFrame(0, 0, frame: frame, to: diffuseSendBuffers, accumulate: accumulate)
                }
            }
            return
        }

        for frame in 0..<frameCount {
            let (left, right) = generateStereoSample()
            writePianoStereoFrame(left, right, frame: frame, to: buffers, accumulate: accumulate)
            if let reverbSendBuffers {
                writePianoStereoFrame(left * reverbSendGain, right * reverbSendGain, frame: frame, to: reverbSendBuffers, accumulate: accumulate)
            }
            if let diffuseSendBuffers {
                writePianoStereoFrame(left * diffuseSendGain, right * diffuseSendGain, frame: frame, to: diffuseSendBuffers, accumulate: accumulate)
            }
        }
    }

    func render(
        frameCount: Int,
        to buffers: UnsafeMutableAudioBufferListPointer,
        sendBuffers: UnsafeMutableAudioBufferListPointer,
        accumulate: Bool = false
    ) {
        render(
            frameCount: frameCount,
            to: buffers,
            reverbSendBuffers: sendBuffers,
            diffuseSendBuffers: nil,
            accumulate: accumulate
        )
    }

    private func generateStereoSample() -> (Float, Float) {
        var left: Float = 0
        var right: Float = 0

        for index in 0..<voices.count where voices[index].active {
            let voiceSample = renderVoice(index)
            left += voiceSample.0
            right += voiceSample.1
        }

        let mono = (left + right) * 0.5
        left = mono + (left - mono) * stereoWidth
        right = mono + (right - mono) * stereoWidth

        let cutoff = 550.0 + postLPF * postLPF * 11_000.0
        let alpha = clampPiano(2.0 * Float.pi * cutoff * invSampleRate, 0.002, 0.92)
        postLpfL += (left - postLpfL) * alpha
        postLpfR += (right - postLpfR) * alpha

        dcL += (postLpfL - dcL) * 0.00025
        dcR += (postLpfR - dcR) * 0.00025

        return (tanh((postLpfL - dcL) * level), tanh((postLpfR - dcR) * level))
    }

    private func renderVoice(_ index: Int) -> (Float, Float) {
        updateEnvelope(index)
        guard voices[index].active else { return (0, 0) }

        let frequency = voices[index].frequency
        let velocity = voices[index].velocity
        let env = voices[index].env
        let brightness = clampPiano((frequency - 90.0) / 1_600.0, 0, 1)

        let p1 = voices[index].phase1
        let p2 = voices[index].phase2
        let p3 = voices[index].phase3
        let p4 = voices[index].phase4

        let hammerSamples = max(1.0, sampleRate * 0.022)
        let hammerEnv = max(0, 1.0 - Float(voices[index].ageSamples) / hammerSamples)
        let hammer = nextVoiceNoise(index) * hammerEnv * hammerEnv * (0.06 + brightness * 0.08)

        let tone =
            sin(2.0 * Float.pi * p1) * 1.0 +
            sin(2.0 * Float.pi * p2) * (0.42 - brightness * 0.12) +
            sin(2.0 * Float.pi * p3) * (0.24 + brightness * 0.08) +
            sin(2.0 * Float.pi * p4) * (0.12 + brightness * 0.08)

        let bodyInput = tone * 0.45 + hammer
        let bodyAlphaL = 0.035 + brightness * 0.02
        let bodyAlphaR = 0.029 + brightness * 0.018
        voices[index].bodyL += (bodyInput - voices[index].bodyL) * bodyAlphaL
        voices[index].bodyR += (bodyInput - voices[index].bodyR) * bodyAlphaR

        let sample = (bodyInput * 0.56 + voices[index].bodyL * 0.36 + hammer * 0.65) * env * velocity
        let pan = voices[index].pan
        let leftGain = clampPiano(0.74 - pan * 0.28, 0.2, 1.0)
        let rightGain = clampPiano(0.74 + pan * 0.28, 0.2, 1.0)

        advancePhases(index, frequency: frequency)
        voices[index].ageSamples += 1

        return (sample * leftGain, (sample + voices[index].bodyR * env * velocity * 0.18) * rightGain)
    }

    private func updateEnvelope(_ index: Int) {
        switch voices[index].stage {
        case .off:
            voices[index].env = 0
            voices[index].active = false

        case .attack:
            let rate = 1.0 / max(1.0, attack * sampleRate)
            voices[index].env += rate
            if voices[index].env >= 1 {
                voices[index].env = 1
                voices[index].stage = .decay
            }

        case .decay:
            let coeff = 1.0 - exp(-invSampleRate / max(decay, 0.001))
            voices[index].env += (sustain - voices[index].env) * coeff
            if voices[index].env <= sustain + 0.002 {
                voices[index].env = sustain
                voices[index].holdSamplesRemaining = Int(hold * sampleRate)
                voices[index].stage = hold > 0 ? .hold : .sustain
            }

        case .hold:
            voices[index].holdSamplesRemaining -= 1
            if voices[index].holdSamplesRemaining <= 0 {
                voices[index].stage = .sustain
            }

        case .sustain:
            voices[index].env = sustain

        case .release:
            let coeff = 1.0 - exp(-invSampleRate / max(release, 0.001))
            voices[index].env += (0 - voices[index].env) * coeff
            if voices[index].env < 0.0005 {
                voices[index].env = 0
                voices[index].stage = .off
                voices[index].active = false
            }
        }
    }

    private func advancePhases(_ index: Int, frequency: Float) {
        let stretch = clampPiano((frequency - 80.0) / 2_500.0, 0, 0.018)
        voices[index].phase1 += frequency * invSampleRate
        voices[index].phase2 += frequency * (2.006 + stretch) * invSampleRate
        voices[index].phase3 += frequency * (3.012 + stretch * 1.7) * invSampleRate
        voices[index].phase4 += frequency * (4.018 + stretch * 2.1) * invSampleRate

        if voices[index].phase1 >= 1 { voices[index].phase1 -= floor(voices[index].phase1) }
        if voices[index].phase2 >= 1 { voices[index].phase2 -= floor(voices[index].phase2) }
        if voices[index].phase3 >= 1 { voices[index].phase3 -= floor(voices[index].phase3) }
        if voices[index].phase4 >= 1 { voices[index].phase4 -= floor(voices[index].phase4) }
    }

    private func nextVoiceNoise(_ index: Int) -> Float {
        voices[index].noiseState = voices[index].noiseState &* 1664525 &+ 1013904223
        return Float(Int32(bitPattern: voices[index].noiseState)) / Float(Int32.max)
    }

    private func findVoiceToSteal() -> Int {
        var bestIndex = 0
        var bestScore = Float.greatestFiniteMagnitude
        for index in 0..<voices.count {
            if !voices[index].active { return index }
            let releaseBias: Float = voices[index].stage == .release ? -2.0 : 0.0
            let score = voices[index].env + releaseBias + Float(voices[index].ageSamples) * 0.0000001
            if score < bestScore {
                bestScore = score
                bestIndex = index
            }
        }
        return bestIndex
    }

    private func startVoice(_ index: Int, midiNote: Int, frequency: Float, velocity: Float) {
        noteCounter = noteCounter &* 747796405 &+ 2891336453
        let seed = noteCounter ^ UInt32(max(midiNote, 0) &* 1103515245)
        let keyPan = clampPiano((Float(midiNote) - 60.0) / 36.0, -1.0, 1.0)

        voices[index] = Voice(
            active: true,
            midiNote: midiNote,
            frequency: clampPiano(frequency, 8, sampleRate * 0.45),
            velocity: clampPiano(velocity, 0, 1),
            ageSamples: 0,
            holdSamplesRemaining: 0,
            env: 0,
            stage: .attack,
            releaseStart: 0,
            phase1: Float(seed & 0xFF) / 255.0,
            phase2: Float((seed >> 8) & 0xFF) / 255.0,
            phase3: Float((seed >> 16) & 0xFF) / 255.0,
            phase4: Float((seed >> 24) & 0xFF) / 255.0,
            bodyL: 0,
            bodyR: 0,
            noiseState: seed == 0 ? 1 : seed,
            pan: keyPan
        )
    }

    // MARK: - Public Interface

    func trigger(midiNote: Int, velocity: Float) {
        trigger(frequency: pianoMidiToFrequency(midiNote), midiNote: midiNote, velocity: velocity)
    }

    func playNote(midiNote: Int, velocity: Float) {
        trigger(midiNote: midiNote, velocity: velocity)
    }

    func trigger(frequency: Float, velocity: Float) {
        trigger(frequency: frequency, midiNote: -1, velocity: velocity)
    }

    func trigger(frequency: Float, midiNote: Int, velocity: Float) {
        guard velocity > 0 else { return }
        startVoice(findVoiceToSteal(), midiNote: midiNote, frequency: frequency, velocity: velocity)
    }

    func releaseNote(midiNote: Int) {
        for index in 0..<voices.count where voices[index].active && voices[index].midiNote == midiNote {
            voices[index].releaseStart = voices[index].env
            voices[index].stage = .release
        }
    }

    func releaseNote() {
        for index in 0..<voices.count where voices[index].active {
            voices[index].releaseStart = voices[index].env
            voices[index].stage = .release
        }
    }

    func allNotesOff() {
        releaseNote()
    }

    func setEnabled(_ enabled: Bool) {
        self.enabled = enabled
    }

    func setLevel(_ level: Float) {
        self.level = clampPiano(level, 0, 1.5)
    }

    func setPostLPF(_ value: Float) {
        self.postLPF = clampPiano(value, 0, 1)
    }

    func setStereoWidth(_ width: Float) {
        self.stereoWidth = clampPiano(width, 0, 1.5)
    }

    func setSendGains(reverb: Float, diffuse: Float) {
        self.reverbSendGain = clampPiano(reverb, 0, 1)
        self.diffuseSendGain = clampPiano(diffuse, 0, 1)
    }

    func setADSR(attack: Float, decay: Float, sustain: Float, hold: Float, release: Float) {
        self.attack = max(0.001, attack)
        self.decay = max(0.01, decay)
        self.sustain = clampPiano(sustain, 0, 1)
        self.hold = max(0, hold)
        self.release = max(0.01, release)
    }

    func hardReset() {
        for index in 0..<voices.count {
            voices[index] = Voice()
        }
        postLpfL = 0
        postLpfR = 0
        dcL = 0
        dcR = 0
    }
}
