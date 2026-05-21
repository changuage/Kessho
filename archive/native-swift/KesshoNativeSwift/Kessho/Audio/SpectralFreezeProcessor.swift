import AVFoundation
import Foundation

@inline(__always)
private func writeSpectralFreezeStereoFrame(
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

@inline(__always)
private func clampSpectralFreeze(_ value: Float, _ lower: Float, _ upper: Float) -> Float {
    Swift.min(Swift.max(value, lower), upper)
}

/// Mobile-friendly spectral-freeze approximation.
///
/// This intentionally avoids FFT allocation/work in the render path. It uses a
/// captured stereo loop, slow multi-head reading, jitter, crossfade smoothing,
/// and damped feedback to approximate a smeared freeze texture.
final class SpectralFreezeProcessor {
    lazy var node: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(
            standardFormatWithSampleRate: Double(self?.sampleRate ?? 44_100),
            channels: 2
        )!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let self else {
                for frame in 0..<Int(frameCount) {
                    writeSpectralFreezeStereoFrame(0, 0, frame: frame, to: buffers)
                }
                return noErr
            }

            self.render(frameCount: Int(frameCount), to: buffers)
            return noErr
        }
    }()

    var enabled: Bool = false
    var active: Bool = false

    var slushy: Float = 0.45
    var speed: Float = 0
    var mix: Float = 0.35
    var decay: Float = 0.985
    var phaseJitter: Float = 0.15
    var routing: Float = 1
    var crossfade: Float = 0.08
    var inputToFreeze: Float = 0
    var stereoSpread: Float = 1

    private var sampleRate: Float = 44_100
    private var invSampleRate: Float = 1 / 44_100
    private var bufferSize: Int
    private var captureL: [Float]
    private var captureR: [Float]
    private var writeIndex: Int = 0
    private var headA: Float = 0
    private var headB: Float = 0
    private var headC: Float = 0
    private var headD: Float = 0
    private var wetLevel: Float = 0
    private var frozenEnergy: Float = 0
    private var jitterState: Float = 0.318_309_9
    private var smearL1: Float = 0
    private var smearR1: Float = 0
    private var smearL2: Float = 0
    private var smearR2: Float = 0
    private var wasActive: Bool = false
    private let stateLock = NSLock()
    private var inputBufferL: [Float]
    private var inputBufferR: [Float]
    private var inputReadIndex: Int = 0
    private var inputWriteIndex: Int = 0
    private var bufferedInputFrames: Int = 0
    private var inputCaptureEnabled: Bool = false

    init(sampleRate: Float = 44_100, maxFreezeSeconds: Float = 2.5) {
        self.sampleRate = max(sampleRate, 1_000)
        self.invSampleRate = 1 / self.sampleRate
        self.bufferSize = max(Int(self.sampleRate * maxFreezeSeconds), 2_048)
        self.captureL = [Float](repeating: 0, count: bufferSize)
        self.captureR = [Float](repeating: 0, count: bufferSize)
        let inputBufferSize = max(Int(self.sampleRate * 0.25), 4096)
        self.inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        self.inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        seedHeads()
    }

    func reset(sampleRate newSampleRate: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        sampleRate = max(newSampleRate, 1_000)
        invSampleRate = 1 / sampleRate
        bufferSize = max(Int(sampleRate * 2.5), 2_048)
        captureL = [Float](repeating: 0, count: bufferSize)
        captureR = [Float](repeating: 0, count: bufferSize)
        let inputBufferSize = max(Int(sampleRate * 0.25), 4096)
        inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        inputReadIndex = 0
        inputWriteIndex = 0
        bufferedInputFrames = 0
        writeIndex = 0
        wetLevel = 0
        frozenEnergy = 0
        jitterState = 0.318_309_9
        smearL1 = 0
        smearR1 = 0
        smearL2 = 0
        smearR2 = 0
        wasActive = false
        seedHeads()
    }

    var isAudible: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return enabled && active && mix > 0.0001
    }

    func setParameters(from state: SliderState) {
        stateLock.lock()
        defer { stateLock.unlock() }
        enabled = state.spectralFreezeEnabled
        active = state.spectralFreezeActive
        slushy = state.spectralFreezeSlushy ? 0.75 : 0.2
        speed = Float(state.spectralFreezeSpeed * 2 - 1)
        mix = Float(state.spectralFreezeMix)
        decay = Float(0.92 + min(max(state.spectralFreezeDecay, 0), 1) * 0.079)
        phaseJitter = Float(state.spectralFreezePhaseJitter)
        routing = state.spectralFreezeRouting == "post" ? 1 : 0.75
        crossfade = Float(max(0.01, 0.02 + (1 - state.spectralFreezeReverbCrossfade) * 0.18))
        inputToFreeze = Float(1 - min(max(state.spectralFreezeReverbCrossfade, 0), 1))
        inputCaptureEnabled = enabled
    }

    func writeInput(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }
        guard stateLock.try() else { return }
        defer { stateLock.unlock() }
        guard inputCaptureEnabled else { return }

        let frameCount = min(Int(buffer.frameLength), inputBufferL.count)
        guard frameCount > 0 else { return }
        let left = channelData[0]
        let right = Int(buffer.format.channelCount) > 1 ? channelData[1] : channelData[0]

        let overflow = max(0, bufferedInputFrames + frameCount - inputBufferL.count)
        if overflow > 0 {
            inputReadIndex = (inputReadIndex + overflow) % inputBufferL.count
            bufferedInputFrames -= overflow
        }

        for frame in 0..<frameCount {
            inputBufferL[inputWriteIndex] = left[frame]
            inputBufferR[inputWriteIndex] = right[frame]
            inputWriteIndex = (inputWriteIndex + 1) % inputBufferL.count
        }
        bufferedInputFrames += frameCount
    }

    func hardReset() {
        reset(sampleRate: sampleRate)
    }

    private func render(frameCount: Int, to buffers: UnsafeMutableAudioBufferListPointer) {
        guard stateLock.try() else {
            for frame in 0..<frameCount {
                writeSpectralFreezeStereoFrame(0, 0, frame: frame, to: buffers)
            }
            return
        }
        defer { stateLock.unlock() }

        guard enabled else {
            for frame in 0..<frameCount {
                _ = dequeueInputFrameLocked()
                writeSpectralFreezeStereoFrame(0, 0, frame: frame, to: buffers)
            }
            return
        }

        for frame in 0..<frameCount {
            let input = dequeueInputFrameLocked()
            let output = process(left: input.0, right: input.1)
            writeSpectralFreezeStereoFrame(output.left, output.right, frame: frame, to: buffers)
        }
    }

    private func dequeueInputFrameLocked() -> (Float, Float) {
        guard bufferedInputFrames > 0 else { return (0, 0) }
        let left = inputBufferL[inputReadIndex]
        let right = inputBufferR[inputReadIndex]
        inputReadIndex = (inputReadIndex + 1) % inputBufferL.count
        bufferedInputFrames -= 1
        return (left, right)
    }

    @inline(__always)
    func process(left inputL: Float, right inputR: Float) -> (left: Float, right: Float) {
        guard enabled else {
            capture(inputL, inputR)
            wetLevel = 0
            wasActive = false
            return (inputL, inputR)
        }

        if active && !wasActive {
            seedHeads(around: writeIndex)
        }
        wasActive = active

        let targetWet: Float = active ? 1 : 0
        let fadeSamples = max(crossfade * sampleRate, 1)
        wetLevel += (targetWet - wetLevel) * min(1, 1 / fadeSamples)

        let feed = active ? clampSpectralFreeze(inputToFreeze, 0, 1) : 1
        if feed > 0 {
            capture(inputL * feed, inputR * feed)
        } else if !active {
            capture(inputL, inputR)
        }

        let wet = renderFrozenFrame()
        let safeMix = clampSpectralFreeze(mix, 0, 1) * wetLevel
        let route = clampSpectralFreeze(routing, 0, 1)
        let dryGain = 1 - safeMix * route
        return (
            inputL * dryGain + wet.left * safeMix,
            inputR * dryGain + wet.right * safeMix
        )
    }

    func process(
        inputLeft: UnsafePointer<Float>,
        inputRight: UnsafePointer<Float>,
        outputLeft: UnsafeMutablePointer<Float>,
        outputRight: UnsafeMutablePointer<Float>,
        frameCount: Int
    ) {
        guard frameCount > 0 else { return }
        for frame in 0..<frameCount {
            let frameOut = process(left: inputLeft[frame], right: inputRight[frame])
            outputLeft[frame] = frameOut.left
            outputRight[frame] = frameOut.right
        }
    }

    func processInPlace(
        left: UnsafeMutablePointer<Float>,
        right: UnsafeMutablePointer<Float>,
        frameCount: Int
    ) {
        guard frameCount > 0 else { return }
        for frame in 0..<frameCount {
            let frameOut = process(left: left[frame], right: right[frame])
            left[frame] = frameOut.left
            right[frame] = frameOut.right
        }
    }

    @inline(__always)
    private func capture(_ left: Float, _ right: Float) {
        let keep = active ? clampSpectralFreeze(decay, 0.9, 0.9999) : 0
        captureL[writeIndex] = captureL[writeIndex] * keep + left * (1 - keep)
        captureR[writeIndex] = captureR[writeIndex] * keep + right * (1 - keep)
        writeIndex += 1
        if writeIndex >= bufferSize {
            writeIndex = 0
        }
    }

    @inline(__always)
    private func renderFrozenFrame() -> (left: Float, right: Float) {
        let jitter = (nextRandom() * 2 - 1) * clampSpectralFreeze(phaseJitter, 0, 1)
        let drift = clampSpectralFreeze(speed, -1, 1) * 0.35 + jitter * 0.08
        let slush = clampSpectralFreeze(slushy, 0, 1)

        let aL = read(captureL, position: headA)
        let aR = read(captureR, position: headA)
        let bL = read(captureL, position: headB)
        let bR = read(captureR, position: headB)
        let cL = read(captureL, position: headC)
        let cR = read(captureR, position: headC)
        let dL = read(captureL, position: headD)
        let dR = read(captureR, position: headD)

        var wetL = (aL + bL + cL + dL) * 0.25
        var wetR = (aR + bR + cR + dR) * 0.25

        smearL1 += (wetL - smearL1) * (0.02 + slush * 0.16)
        smearR1 += (wetR - smearR1) * (0.02 + slush * 0.16)
        smearL2 += (smearL1 - smearL2) * (0.01 + slush * 0.08)
        smearR2 += (smearR1 - smearR2) * (0.01 + slush * 0.08)
        wetL = wetL * (1 - slush) + smearL2 * slush
        wetR = wetR * (1 - slush) + smearR2 * slush

        let mid = (wetL + wetR) * 0.5
        let side = (wetL - wetR) * 0.5 * clampSpectralFreeze(stereoSpread, 0, 2)
        wetL = mid + side
        wetR = mid - side

        frozenEnergy = frozenEnergy * clampSpectralFreeze(decay, 0.9, 0.9999) + 0.000_02
        let gain = clampSpectralFreeze(frozenEnergy, 0.2, 1.2)

        advance(&headA, by: 0.07 + drift)
        advance(&headB, by: -0.05 + drift * 0.7)
        advance(&headC, by: 0.11 - drift * 0.5)
        advance(&headD, by: -0.09 - drift * 0.25)

        return (wetL * gain, wetR * gain)
    }

    @inline(__always)
    private func read(_ buffer: [Float], position: Float) -> Float {
        var pos = position
        while pos < 0 { pos += Float(bufferSize) }
        while pos >= Float(bufferSize) { pos -= Float(bufferSize) }
        let indexA = Int(pos)
        let indexB = indexA + 1 == bufferSize ? 0 : indexA + 1
        let frac = pos - Float(indexA)
        return buffer[indexA] + (buffer[indexB] - buffer[indexA]) * frac
    }

    @inline(__always)
    private func advance(_ head: inout Float, by amount: Float) {
        head += amount
        while head < 0 { head += Float(bufferSize) }
        while head >= Float(bufferSize) { head -= Float(bufferSize) }
    }

    @inline(__always)
    private func nextRandom() -> Float {
        jitterState = fract(sin(jitterState * 12_989.0 + 78.233) * 43_758.547)
        return jitterState
    }

    @inline(__always)
    private func fract(_ value: Float) -> Float {
        value - floor(value)
    }

    private func seedHeads(around index: Int? = nil) {
        let base = Float(index ?? writeIndex)
        headA = wrap(base - Float(bufferSize) * 0.18)
        headB = wrap(base - Float(bufferSize) * 0.37)
        headC = wrap(base - Float(bufferSize) * 0.61)
        headD = wrap(base - Float(bufferSize) * 0.83)
        frozenEnergy = 1
    }

    private func wrap(_ value: Float) -> Float {
        var wrapped = value
        while wrapped < 0 { wrapped += Float(bufferSize) }
        while wrapped >= Float(bufferSize) { wrapped -= Float(bufferSize) }
        return wrapped
    }
}
