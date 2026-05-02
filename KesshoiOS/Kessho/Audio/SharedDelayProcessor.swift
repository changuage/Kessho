import AVFoundation
import Foundation

@inline(__always)
private func writeSharedDelayStereoFrame(
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
private func clampSharedDelay(_ value: Float, _ lower: Float, _ upper: Float) -> Float {
    Swift.min(Swift.max(value, lower), upper)
}

/// Stereo shared-delay processor for lightweight Delay A/B style FX parity.
///
/// Allocate with `reset(sampleRate:)` before rendering. The `process` methods do
/// not allocate and are intended to be called from the audio render path.
final class SharedDelayProcessor {
    lazy var node: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(
            standardFormatWithSampleRate: Double(self?.sampleRate ?? 44_100),
            channels: 2
        )!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let self else {
                for frame in 0..<Int(frameCount) {
                    writeSharedDelayStereoFrame(0, 0, frame: frame, to: buffers)
                }
                return noErr
            }

            self.render(frameCount: Int(frameCount), to: buffers)
            return noErr
        }
    }()

    var enabled: Bool = false
    var wetOnly: Bool = false

    var timeMs: Float = 375
    var feedback: Float = 0.35
    var mix: Float = 0.25
    var spread: Float = 0.35
    var width: Float = 1
    var cutoff: Float = 8_000 {
        didSet { updateFilterCoefficient() }
    }
    var pingPong: Bool = false
    var modRate: Float = 0
    var modDepth: Float = 0
    var duck: Float = 0
    var crossFeed: Float = 0
    var sendA: Float = 1
    var sendB: Float = 1

    private var sampleRate: Float = 44_100
    private var invSampleRate: Float = 1 / 44_100
    private var maxDelaySamples: Int
    private var bufferL: [Float]
    private var bufferR: [Float]
    private var writeIndex: Int = 0
    private var filterCoeff: Float = 1
    private var filterStateL: Float = 0
    private var filterStateR: Float = 0
    private var modPhase: Float = 0
    private var duckEnvelope: Float = 0
    private let stateLock = NSLock()
    private var inputBufferL: [Float]
    private var inputBufferR: [Float]
    private var inputReadIndex: Int = 0
    private var inputWriteIndex: Int = 0
    private var bufferedInputFrames: Int = 0

    init(sampleRate: Float = 44_100, maxDelaySeconds: Float = 4) {
        self.sampleRate = max(sampleRate, 1_000)
        self.invSampleRate = 1 / self.sampleRate
        self.maxDelaySamples = max(Int(self.sampleRate * maxDelaySeconds), 2)
        self.bufferL = [Float](repeating: 0, count: maxDelaySamples)
        self.bufferR = [Float](repeating: 0, count: maxDelaySamples)
        let inputBufferSize = max(Int(self.sampleRate * 0.25), 4096)
        self.inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        self.inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        updateFilterCoefficient()
    }

    func reset(sampleRate newSampleRate: Float) {
        stateLock.lock()
        defer { stateLock.unlock() }
        sampleRate = max(newSampleRate, 1_000)
        invSampleRate = 1 / sampleRate
        maxDelaySamples = max(Int(sampleRate * 4), 2)
        bufferL = [Float](repeating: 0, count: maxDelaySamples)
        bufferR = [Float](repeating: 0, count: maxDelaySamples)
        let inputBufferSize = max(Int(sampleRate * 0.25), 4096)
        inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        inputReadIndex = 0
        inputWriteIndex = 0
        bufferedInputFrames = 0
        writeIndex = 0
        filterStateL = 0
        filterStateR = 0
        modPhase = 0
        duckEnvelope = 0
        updateFilterCoefficient()
    }

    func setParameters(
        enabled: Bool,
        timeMs: Float,
        feedback: Float,
        mix: Float,
        spread: Float,
        width: Float,
        cutoff: Float,
        pingPong: Bool,
        modRate: Float,
        modDepth: Float,
        duck: Float,
        crossFeed: Float,
        wetOnly: Bool = true
    ) {
        stateLock.lock()
        defer { stateLock.unlock() }
        self.enabled = enabled
        self.timeMs = clampSharedDelay(timeMs, 1, 3_950)
        self.feedback = clampSharedDelay(feedback, 0, 0.96)
        self.mix = clampSharedDelay(mix, 0, 1)
        self.spread = clampSharedDelay(spread, -2, 2)
        self.width = clampSharedDelay(width, 0, 2)
        self.cutoff = cutoff
        self.pingPong = pingPong
        self.modRate = clampSharedDelay(modRate, 0, 20)
        self.modDepth = clampSharedDelay(modDepth, 0, 1)
        self.duck = clampSharedDelay(duck, 0, 1)
        self.crossFeed = clampSharedDelay(crossFeed, 0, 1)
        self.wetOnly = wetOnly
    }

    func writeInput(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }
        stateLock.lock()
        defer { stateLock.unlock() }

        let incomingSampleRate = Float(buffer.format.sampleRate)
        if incomingSampleRate > 1_000 && abs(incomingSampleRate - sampleRate) > 1 {
            resetLocked(sampleRate: incomingSampleRate)
        }

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

    func writeInput(
        audioBufferList: UnsafePointer<AudioBufferList>,
        frameCount: Int,
        sampleRate incomingSampleRate: Float
    ) {
        stateLock.lock()
        defer { stateLock.unlock() }

        if incomingSampleRate > 1_000 && abs(incomingSampleRate - sampleRate) > 1 {
            resetLocked(sampleRate: incomingSampleRate)
        }

        let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: audioBufferList))
        let count = min(frameCount, inputBufferL.count)
        guard count > 0, !buffers.isEmpty else { return }

        let overflow = max(0, bufferedInputFrames + count - inputBufferL.count)
        if overflow > 0 {
            inputReadIndex = (inputReadIndex + overflow) % inputBufferL.count
            bufferedInputFrames -= overflow
        }

        if buffers.count == 1, let data = buffers[0].mData?.assumingMemoryBound(to: Float.self) {
            let channelCount = max(Int(buffers[0].mNumberChannels), 1)
            for frame in 0..<count {
                let base = frame * channelCount
                inputBufferL[inputWriteIndex] = data[base]
                inputBufferR[inputWriteIndex] = channelCount > 1 ? data[base + 1] : data[base]
                inputWriteIndex = (inputWriteIndex + 1) % inputBufferL.count
            }
        } else {
            guard let left = buffers[0].mData?.assumingMemoryBound(to: Float.self) else { return }
            let right = buffers.count > 1 ? buffers[1].mData?.assumingMemoryBound(to: Float.self) : left
            guard let right else { return }
            for frame in 0..<count {
                inputBufferL[inputWriteIndex] = left[frame]
                inputBufferR[inputWriteIndex] = right[frame]
                inputWriteIndex = (inputWriteIndex + 1) % inputBufferL.count
            }
        }

        bufferedInputFrames += count
    }

    private func render(frameCount: Int, to buffers: UnsafeMutableAudioBufferListPointer) {
        stateLock.lock()
        defer { stateLock.unlock() }

        guard enabled else {
            for frame in 0..<frameCount {
                _ = dequeueInputFrameLocked()
                writeSharedDelayStereoFrame(0, 0, frame: frame, to: buffers)
            }
            return
        }

        for frame in 0..<frameCount {
            let input = dequeueInputFrameLocked()
            let output = process(left: input.0, right: input.1)
            writeSharedDelayStereoFrame(output.left, output.right, frame: frame, to: buffers)
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
            return wetOnly ? (0, 0) : (inputL, inputR)
        }

        let safeMix = clampSharedDelay(mix, 0, 1)
        let safeFeedback = clampSharedDelay(feedback, 0, 0.96)
        let safeCrossFeed = clampSharedDelay(crossFeed, 0, 1)
        let safeSpread = clampSharedDelay(spread, -2, 2)
        let safeWidth = clampSharedDelay(width, 0, 2)
        let safeSendA = clampSharedDelay(sendA, 0, 2)
        let safeSendB = clampSharedDelay(sendB, 0, 2)

        let modSamples = modulatedDelaySamples()
        let baseDelay = clampSharedDelay(Float(max(1, modSamples)), 1, Float(maxDelaySamples - 2))
        let spreadSamples = safeSpread * sampleRate * 0.018
        let delayL = clampSharedDelay(baseDelay - spreadSamples, 1, Float(maxDelaySamples - 2))
        let delayR = clampSharedDelay(baseDelay + spreadSamples, 1, Float(maxDelaySamples - 2))

        let delayedL = readInterpolated(bufferL, delaySamples: delayL)
        let delayedR = readInterpolated(bufferR, delaySamples: delayR)

        let inputMagnitude = max(abs(inputL), abs(inputR))
        let duckTarget = inputMagnitude
        let duckCoeff: Float = duckTarget > duckEnvelope ? 0.02 : 0.002
        duckEnvelope += (duckTarget - duckEnvelope) * duckCoeff
        let duckGain = 1 / (1 + clampSharedDelay(duck, 0, 1) * duckEnvelope * 8)

        let wetMid = (delayedL + delayedR) * 0.5
        let wetSide = (delayedL - delayedR) * 0.5 * safeWidth
        let wetL = (wetMid + wetSide) * duckGain
        let wetR = (wetMid - wetSide) * duckGain

        let feedbackL: Float
        let feedbackR: Float
        if pingPong {
            feedbackL = delayedR * safeFeedback
            feedbackR = delayedL * safeFeedback
        } else {
            feedbackL = (delayedL * (1 - safeCrossFeed) + delayedR * safeCrossFeed) * safeFeedback
            feedbackR = (delayedR * (1 - safeCrossFeed) + delayedL * safeCrossFeed) * safeFeedback
        }

        filterStateL += filterCoeff * ((inputL * safeSendA + feedbackL) - filterStateL)
        filterStateR += filterCoeff * ((inputR * safeSendB + feedbackR) - filterStateR)

        bufferL[writeIndex] = clampSharedDelay(filterStateL, -8, 8)
        bufferR[writeIndex] = clampSharedDelay(filterStateR, -8, 8)
        advanceWriteIndex()

        if wetOnly {
            return (wetL * safeMix, wetR * safeMix)
        }

        return (
            inputL + (wetL - inputL) * safeMix,
            inputR + (wetR - inputR) * safeMix
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

    private func updateFilterCoefficient() {
        let hz = clampSharedDelay(cutoff, 80, min(20_000, sampleRate * 0.45))
        filterCoeff = 1 - exp(-2 * .pi * hz * invSampleRate)
    }

    private func resetLocked(sampleRate newSampleRate: Float) {
        sampleRate = max(newSampleRate, 1_000)
        invSampleRate = 1 / sampleRate
        maxDelaySamples = max(Int(sampleRate * 4), 2)
        bufferL = [Float](repeating: 0, count: maxDelaySamples)
        bufferR = [Float](repeating: 0, count: maxDelaySamples)
        let inputBufferSize = max(Int(sampleRate * 0.25), 4096)
        inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        inputReadIndex = 0
        inputWriteIndex = 0
        bufferedInputFrames = 0
        writeIndex = 0
        filterStateL = 0
        filterStateR = 0
        modPhase = 0
        duckEnvelope = 0
        updateFilterCoefficient()
    }

    @inline(__always)
    private func modulatedDelaySamples() -> Int {
        let base = clampSharedDelay(timeMs, 1, 3_950) * sampleRate * 0.001
        let depth = clampSharedDelay(modDepth, 0, 1) * sampleRate * 0.018
        let rate = clampSharedDelay(modRate, 0, 20)
        if rate > 0 && depth > 0 {
            modPhase += rate * invSampleRate
            if modPhase >= 1 { modPhase -= floor(modPhase) }
            return Int(base + sin(modPhase * 2 * .pi) * depth)
        }
        return Int(base)
    }

    @inline(__always)
    private func readInterpolated(_ buffer: [Float], delaySamples: Float) -> Float {
        var readPosition = Float(writeIndex) - delaySamples
        while readPosition < 0 {
            readPosition += Float(maxDelaySamples)
        }
        let indexA = Int(readPosition)
        let indexB = indexA + 1 == maxDelaySamples ? 0 : indexA + 1
        let frac = readPosition - Float(indexA)
        return buffer[indexA] + (buffer[indexB] - buffer[indexA]) * frac
    }

    @inline(__always)
    private func advanceWriteIndex() {
        writeIndex += 1
        if writeIndex >= maxDelaySamples {
            writeIndex = 0
        }
    }
}
