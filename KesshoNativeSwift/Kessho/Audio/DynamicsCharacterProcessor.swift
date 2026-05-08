import AVFoundation
import Foundation

@inline(__always)
private func writeDynamicsCharacterStereoFrame(
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

final class DynamicsCharacterProcessor {
    private enum ParamIndex: Int {
        case active = 0
        case allpassActive
        case dry
        case wet
        case degradeMix
        case workletAlias
        case rawDegradeGeneration
        case rawCorrosion
        case rawMediaWear
        case noiseGain
        case jitterDepth
        case randomDriftFilterHz
        case randomDriftDepth
        case baseDelay
        case spreadBaseDelay
        case randomDrift
        case randomHoldRateHz
        case randomHoldLag
        case randomDelayDepth
        case randomSpreadDelayDepth
        case randomFilterDepth
        case randomSpreadFilterDepth
        case depth
        case rate
        case shallowFlavor
        case abyssFlavor
        case stereo
        case damage
        case mainPan
        case spreadPan
        case mainDelayGain
        case spreadDelayGain
        case wowFrequency
        case flutterFrequency
        case flutterRandomDepth
        case wowDepth
        case flutterDepth
        case highpassHz
        case highpassQ
        case allpassAFrequency
        case allpassAQ
        case allpassBFrequency
        case allpassBQ
        case headBumpFrequency
        case headBumpQ
        case headBumpGain
        case dropoutFilterHz
        case dropoutDepth
        case dropoutGain
        case envFilterHz
        case envToLowpassGain
        case envToResonanceGain
        case envToWetGain
        case lowpassHz
        case lowpassQ
        case lowpassStage2Hz
        case lowpassStage2Q
        case compressorThreshold
        case compressorKnee
        case compressorRatio
        case compressorAttack
        case compressorRelease
        case compressorMakeup
        case saturation
        case corrosion
        case masterSatActive
        case masterSatMode
        case masterSatDrive
        case masterSatTone
        case masterSatBias
        case endCompActive
        case endCompThreshold
        case endCompKnee
        case endCompRatio
        case endCompAttack
        case endCompRelease
        case endCompMakeup
        case endCompMix
        case endCompDetectorHpHz
        case endCompDetectorTilt
        case endCompAutoMakeup
        case endCompProgramRelease
    }

    private static let paramCount = 82
    private static let maxBlockSize = 128

    lazy var node: AVAudioSourceNode = { [weak self] in
        let renderFormat = AVAudioFormat(
            standardFormatWithSampleRate: Double(self?.sampleRate ?? 44_100),
            channels: 2
        )!
        return AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let self else {
                for frame in 0..<Int(frameCount) {
                    writeDynamicsCharacterStereoFrame(0, 0, frame: frame, to: ablPointer)
                }
                return noErr
            }

            self.render(frameCount: Int(frameCount), to: ablPointer)
            return noErr
        }
    }()

    private let stateLock = NSLock()
    private let dsp = DynamicsCharacterNativeDSP()
    private let sampleRate: Float
    private let inputBufferSize: Int
    private var inputBufferL: [Float]
    private var inputBufferR: [Float]
    private var inputReadIndex = 0
    private var inputWriteIndex = 0
    private var bufferedInputFrames = 0
    private var outputEnabled = false
    private var inputCaptureEnabled = false
    private var currentParams = [Float](repeating: 0, count: paramCount)
    private var pendingParams = [Float](repeating: 0, count: paramCount)

    init(sampleRate: Float = 44_100) {
        self.sampleRate = sampleRate
        self.inputBufferSize = max(Int(sampleRate * 0.25), 4096)
        self.inputBufferL = [Float](repeating: 0, count: inputBufferSize)
        self.inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        _ = dsp.initialize(sampleRate: sampleRate)
        setParameters(from: .default)
    }

    deinit {
        dsp.destroy()
    }

    var isAvailable: Bool {
        dsp.isAvailable
    }

    var isAudible: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return outputEnabled
    }

    func setParameters(from state: SliderState) {
        Self.fillParams(from: state, sampleRate: sampleRate, into: &pendingParams)
        let shouldEnable = pendingParams[ParamIndex.active.rawValue] > 0.5

        stateLock.lock()
        defer { stateLock.unlock() }

        outputEnabled = shouldEnable
        inputCaptureEnabled = shouldEnable

        guard let paramsPtr = dsp.paramsPointer() else { return }
        for index in 0..<Self.paramCount {
            let value = pendingParams[index]
            currentParams[index] = value
            paramsPtr[index] = value
        }
        dsp.commitParams()
    }

    func writeInput(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }

        guard stateLock.try() else { return }
        defer { stateLock.unlock() }

        guard inputCaptureEnabled else { return }

        let frameCount = min(Int(buffer.frameLength), inputBufferSize)
        guard frameCount > 0 else { return }

        let left = channelData[0]
        let right = Int(buffer.format.channelCount) > 1 ? channelData[1] : channelData[0]

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
        clearInputBufferLocked()
        _ = dsp.initialize(sampleRate: sampleRate)
        if let paramsPtr = dsp.paramsPointer() {
            for index in 0..<Self.paramCount {
                paramsPtr[index] = currentParams[index]
            }
            dsp.commitParams()
        }
    }

    private func render(frameCount: Int, to buffers: UnsafeMutableAudioBufferListPointer) {
        guard stateLock.try() else {
            for frame in 0..<frameCount {
                writeDynamicsCharacterStereoFrame(0, 0, frame: frame, to: buffers)
            }
            return
        }
        defer { stateLock.unlock() }

        guard outputEnabled,
              let inputPtr = dsp.inputPointer(),
              let outputPtr = dsp.outputPointer() else {
            for frame in 0..<frameCount {
                _ = dequeueInputFrameLocked()
                writeDynamicsCharacterStereoFrame(0, 0, frame: frame, to: buffers)
            }
            return
        }

        var frameOffset = 0
        while frameOffset < frameCount {
            let chunkSize = min(Self.maxBlockSize, frameCount - frameOffset)
            for frame in 0..<chunkSize {
                let sample = dequeueInputFrameLocked()
                inputPtr[frame * 2] = sample.0
                inputPtr[frame * 2 + 1] = sample.1
            }

            dsp.process(blockSize: Int32(chunkSize))

            for frame in 0..<chunkSize {
                writeDynamicsCharacterStereoFrame(
                    outputPtr[frame * 2],
                    outputPtr[frame * 2 + 1],
                    frame: frameOffset + frame,
                    to: buffers
                )
            }
            frameOffset += chunkSize
        }
    }

    private func dequeueInputFrameLocked() -> (Float, Float) {
        guard bufferedInputFrames > 0 else { return (0, 0) }
        let left = inputBufferL[inputReadIndex]
        let right = inputBufferR[inputReadIndex]
        inputReadIndex = (inputReadIndex + 1) % inputBufferSize
        bufferedInputFrames -= 1
        return (left, right)
    }

    private func clearInputBufferLocked() {
        if !inputBufferL.isEmpty {
            inputBufferL = [Float](repeating: 0, count: inputBufferSize)
            inputBufferR = [Float](repeating: 0, count: inputBufferSize)
        }
        inputReadIndex = 0
        inputWriteIndex = 0
        bufferedInputFrames = 0
    }

    private static func fillParams(from state: SliderState, sampleRate: Float, into params: inout [Float]) {
        if params.count != paramCount {
            params = [Float](repeating: 0, count: paramCount)
        } else {
            for index in 0..<paramCount {
                params[index] = 0
            }
        }

        let characterEnabled = state.dynamicsEnabled && state.characterEnabled
        let degradeEnabled = state.dynamicsEnabled && state.degradeEnabled
        let rawMode = state.characterMode
        let mode = characterEnabled && (rawMode == "abyssWater" || rawMode == "shallowWater") ? rawMode : "clean"
        let modeActive = mode != "clean"
        let cleanFlavor = mode == "clean" ? 1.0 : 0.0
        let shallowFlavor = mode == "shallowWater" ? 1.0 : 0.0
        let abyssFlavor = mode == "abyssWater" ? 1.0 : 0.0
        let defaults = characterDefaults(for: mode)

        let characterMix = characterEnabled ? clamp01(state.characterMix) : 0
        let degradeMix = degradeEnabled ? clamp01(state.degradeMix) : 0
        let wet = clamp01(1 - (1 - characterMix) * (1 - degradeMix))
        let degradeWetRatio = wet > 0.0001 ? clamp01(degradeMix / wet) : 0
        let degradeInfluence = sqrt(degradeMix)
        let dry = 1 - wet
        let characterAge = characterEnabled ? max(clamp01(state.characterAge), modeActive ? defaults.age : 0) : 0
        let rawDegradeAge = degradeEnabled ? clamp01(state.degradeAge) : 0
        let rawDegradeGeneration = degradeEnabled ? clamp01(state.degradeGeneration) : 0
        let rawDegradeAlias = degradeEnabled ? clamp01(state.degradeAlias) : 0
        let baseDegradeWow = degradeEnabled ? clamp01(state.degradeWow) : 0
        let baseDegradeFlutter = degradeEnabled ? clamp01(state.degradeFlutter) : 0
        let baseDegradeDrift = degradeEnabled ? clamp01(state.degradeDrift) : 0
        let degradeWobbleSpeed = degradeEnabled ? clamp01(state.degradeWobbleSpeed) : 0.35
        let degradeAge = rawDegradeAge * degradeInfluence
        let degradeGeneration = rawDegradeGeneration * degradeInfluence
        let degradeAlias = rawDegradeAlias * degradeInfluence
        let rawMediaWear = clamp01(rawDegradeAge + rawDegradeGeneration * 0.42)
        let mediaWear = clamp01(degradeAge + degradeGeneration * 0.42)
        let rawCorrosion = degradeEnabled ? clamp01(state.degradeCorrosion) : 0

        let contribution = contributionMatrix(
            mode: mode,
            characterEnabled: characterEnabled,
            degradeEnabled: degradeEnabled,
            characterMix: characterMix,
            degradeMix: degradeMix,
            degradeAge: rawDegradeAge,
            degradeGeneration: rawDegradeGeneration,
            degradeAlias: rawDegradeAlias,
            corrosion: rawCorrosion
        )

        let modSlow = degradeEnabled
            ? degradeInfluence * clamp01(baseDegradeWow * 0.22 + baseDegradeDrift * 0.34 + rawDegradeAge * 0.2 + rawDegradeGeneration * 0.18 + contribution.smoothDrift * 0.18)
            : 0
        let modFlutterSource = degradeEnabled
            ? degradeInfluence * clamp01(baseDegradeFlutter * 0.55 + contribution.flutterJitter * 0.24 + rawDegradeGeneration * 0.08)
            : 0
        let modRandom = degradeEnabled
            ? degradeInfluence * clamp01(baseDegradeDrift * 0.3 + contribution.randomHold * 0.44 + rawMediaWear * 0.22)
            : 0
        let modEnv = degradeEnabled ? degradeInfluence * clamp01(state.characterEnvFollow) : 0
        let modNoise = degradeEnabled
            ? degradeInfluence * clamp01(state.degradeNoise * 0.64 + rawCorrosion * 0.18 + rawDegradeAlias * 0.12)
            : 0
        func modRoute(slow: Double, flutter: Double, random: Double, env: Double, noise: Double) -> Double {
            clamp01(
                modSlow * clamp01(slow) +
                modFlutterSource * clamp01(flutter) +
                modRandom * clamp01(random) +
                modEnv * clamp01(env) +
                modNoise * clamp01(noise)
            )
        }

        let modWow = modRoute(slow: state.degradeModSlowWow, flutter: state.degradeModFlutterWow, random: state.degradeModRandomWow, env: state.degradeModEnvWow, noise: state.degradeModNoiseWow)
        let modFlutter = modRoute(slow: state.degradeModSlowFlutter, flutter: state.degradeModFlutterFlutter, random: state.degradeModRandomFlutter, env: state.degradeModEnvFlutter, noise: state.degradeModNoiseFlutter)
        let modLp = modRoute(slow: state.degradeModSlowLp, flutter: state.degradeModFlutterLp, random: state.degradeModRandomLp, env: state.degradeModEnvLp, noise: state.degradeModNoiseLp)
        let modWet = modRoute(slow: state.degradeModSlowWet, flutter: state.degradeModFlutterWet, random: state.degradeModRandomWet, env: state.degradeModEnvWet, noise: state.degradeModNoiseWet)
        let modDropout = modRoute(slow: state.degradeModSlowDropout, flutter: state.degradeModFlutterDropout, random: state.degradeModRandomDropout, env: state.degradeModEnvDropout, noise: state.degradeModNoiseDropout)
        let modAlias = modRoute(slow: state.degradeModSlowAlias, flutter: state.degradeModFlutterAlias, random: state.degradeModRandomAlias, env: state.degradeModEnvAlias, noise: state.degradeModNoiseAlias)

        let workletAlias = clamp01(rawDegradeAlias + modAlias * 0.18)
        let shapedAlias = clamp01(degradeAlias + modAlias * 0.08)
        let digitalDamage = clamp01(shapedAlias * 0.46 + degradeGeneration * 0.22)
        let damage = clamp01(degradeMix * (0.1 + degradeAge * 0.32 + degradeGeneration * 0.18 + shapedAlias * 0.08))
        let age = clamp01(max(characterAge, mediaWear * (0.38 + degradeMix * 0.52)))
        let depth = characterEnabled ? max(clamp01(state.characterDepth), modeActive ? defaults.depth : 0) : 0
        let rawWow = clamp01(baseDegradeWow * degradeInfluence * (0.54 + contribution.crossPatch * 0.22) + modWow * 0.18)
        let rawFlutter = clamp01(baseDegradeFlutter * degradeInfluence * (0.38 + contribution.crossPatch * 0.18) + modFlutter * 0.08)
        let rawDrift = baseDegradeDrift * degradeInfluence
        let waterCyclicBias = cleanFlavor > 0 ? 0.08 : shallowFlavor > 0 ? 0.012 : abyssFlavor > 0 ? 0.006 : 0.08
        let waterSineScale = cleanFlavor > 0 ? 0.5 : 0.12
        let modeWow = depth * (waterCyclicBias + contribution.sineWow * waterSineScale)
        let modeFlutter = depth * (0.02 + contribution.flutterJitter * 0.12)
        let flutterDamage = contribution.materialWear * 0.014 + contribution.aliasDamage * (0.018 + contribution.crossPatch * 0.074)
        let cyclicModeScale = cleanFlavor > 0
            ? 1
            : shallowFlavor > 0
                ? 0.16 + degradeMix * 0.05
                : abyssFlavor > 0
                    ? 0.1 + degradeMix * 0.04
                    : modeActive
                        ? 0.38 + degradeMix * 0.12
                        : 1
        let cyclicFlutterScale = cleanFlavor > 0
            ? 1
            : shallowFlavor > 0
                ? 0.34 + degradeMix * 0.07
                : abyssFlavor > 0
                    ? 0.26 + degradeMix * 0.05
                    : modeActive
                        ? 0.55 + degradeMix * 0.1
                        : 1
        let cyclicWow = clamp01(rawWow + modeWow * cyclicModeScale)
        let flutter = clamp01(rawFlutter + modeFlutter + flutterDamage)
        let cyclicFlutter = clamp01(rawFlutter + modeFlutter * cyclicFlutterScale)
        let abyssPitchMotionTrim = abyssFlavor > 0 ? 0.08 : 1
        let drift = clamp01(rawDrift + depth * (0.06 + contribution.smoothDrift * 0.32) + contribution.materialWear * 0.22 + contribution.crossPatch * 0.12 + modWow * 0.06)
        let tapeWanderDepth = degradeEnabled
            ? rawDrift * 0.0021 + contribution.materialWear * 0.0011 + contribution.aliasDamage * 0.00032 + modWow * 0.00085
            : 0
        let tapeFlutterDepth = degradeEnabled
            ? rawFlutter * 0.00022 + contribution.materialWear * 0.00009 + contribution.aliasDamage * 0.0001 + modFlutter * 0.0002
            : 0
        let corrosion = clamp01(rawCorrosion * degradeInfluence * 0.72 + damage * 0.09 + degradeGeneration * 0.035)
        let degradeHp = (degradeEnabled ? clamp01(state.degradeHp) : 0) * degradeInfluence
        let degradeLp = 1 - (1 - (degradeEnabled ? clamp01(state.degradeLp) : 1)) * degradeInfluence
        let hp = max(degradeHp, modeActive ? defaults.hp : 0, damage * 0.08 + corrosion * 0.03)
        let lpCeiling = max(0.08, 1 - damage * 0.2 - corrosion * 0.1 - mediaWear * degradeMix * 0.08 - digitalDamage * 0.05 - modLp * 0.08)
        let lp = max(0.08, min(degradeLp, modeActive ? defaults.lp : 1, lpCeiling))
        let rate = characterEnabled ? max(clamp01(state.characterRate), modeActive ? defaults.rate : 0) : 0
        let damp = characterEnabled ? max(clamp01(state.characterDamp), modeActive ? defaults.damp : 0.5) : 0.5
        let stereo = characterEnabled ? clamp01(state.characterStereo) : 0
        let envFollow = characterEnabled ? clamp01(state.characterEnvFollow) : 0
        let resonance = characterEnabled ? max(clamp01(state.characterResonance), modeActive ? defaults.resonance : 0.2) : 0.2
        let noise = degradeEnabled ? clamp01(clamp01(state.degradeNoise) * degradeInfluence * 0.55 + degradeMix * (mediaWear * 0.025 + digitalDamage * 0.012)) : 0
        let characterDrive = characterEnabled
            ? characterMix * (shallowFlavor * 0.07 + abyssFlavor * (0.06 + envFollow * 0.04) + characterAge * 0.06)
            : 0
        let saturation = clamp01((degradeEnabled ? clamp01(state.degradeSaturation) * degradeInfluence * 0.55 + damage * 0.06 + degradeGeneration * 0.015 : 0) + characterDrive)
        let tone = 0.5 + ((degradeEnabled ? clamp01(state.degradeTone) : 0.5) - 0.5) * degradeInfluence
        let dropout = clamp01(degradeMix * (mediaWear * 0.25 + corrosion * 0.28 + degradeGeneration * 0.06 + noise * 0.08 + rawDegradeAlias * 0.035) + modDropout * 0.16)
        let waterRandomDrive = shallowFlavor * 0.18 + abyssFlavor * 0.24
        let randomDrift = clamp01(
            contribution.randomHold * (0.42 + stereo * 0.24) +
            contribution.smoothDrift * 0.18 +
            envFollow * contribution.envelopeBloom * 0.12 +
            contribution.crossPatch * 0.16 +
            modFlutter * 0.24 +
            waterRandomDrive
        )

        let characterHoldRateHz: Double
        if mode == "shallowWater" {
            characterHoldRateHz = 0.11 + rate * 1.18 + depth * 0.22
        } else if mode == "abyssWater" {
            characterHoldRateHz = 0.035 + rate * 0.34 + envFollow * 0.03
        } else {
            characterHoldRateHz = 0.025 + rate * 0.14
        }
        let degradeMotionWeight = degradeEnabled ? clamp01(degradeWetRatio * (0.65 + degradeInfluence * 0.35)) : 0
        let degradeHoldRateHz = 0.02 + degradeWobbleSpeed * 0.58 + rawDrift * 0.11 + contribution.materialWear * 0.075 + contribution.aliasDamage * 0.035
        let randomHoldRateHz = characterHoldRateHz + (degradeHoldRateHz - characterHoldRateHz) * degradeMotionWeight

        let characterHoldLag: Double
        if mode == "shallowWater" {
            characterHoldLag = 0.18 + damp * 1.15
        } else if mode == "abyssWater" {
            characterHoldLag = 0.42 + damp * 1.8
        } else {
            characterHoldLag = 0.75 + damp * 2.1
        }
        let degradeHoldLag = max(0.18, 1.3 - degradeWobbleSpeed * 0.98 + rawMediaWear * (0.2 + (1 - degradeWobbleSpeed) * 0.16))
        let randomHoldLag = characterHoldLag + (degradeHoldLag - characterHoldLag) * degradeMotionWeight
        let degradeLevelTrim = degradeEnabled
            ? max(0.7, 1 - degradeWetRatio * (0.12 + rawMediaWear * 0.12 + rawCorrosion * 0.16 + rawDegradeAlias * 0.1))
            : 1

        let cleanCombTame = cleanFlavor * clamp01(degradeMix * (0.85 + contribution.materialWear * 0.35 + contribution.aliasDamage * 0.18))
        let cleanBaseDelay = 0.00035 + age * 0.0012 + drift * 0.0006
        let cleanTamedBaseDelay = 0.00014 + age * 0.00045 + drift * 0.00024
        let baseDelay = cleanFlavor > 0
            ? cleanBaseDelay + (cleanTamedBaseDelay - cleanBaseDelay) * cleanCombTame
            : 0.0025 + shallowFlavor * 0.0038 + abyssFlavor * 0.0012 + age * 0.009 + drift * 0.004 + contribution.bbdColor * 0.0018
        let cleanSpreadDelay = min(0.012, baseDelay + stereo * (0.0012 + depth * 0.0012) + drift * 0.0004)
        let cleanTamedSpreadDelay = min(0.006, baseDelay + stereo * (0.00055 + depth * 0.00065) + drift * 0.00016)
        let spreadBaseDelay = cleanFlavor > 0
            ? cleanSpreadDelay + (cleanTamedSpreadDelay - cleanSpreadDelay) * cleanCombTame
            : min(0.095, baseDelay + 0.0012 + stereo * (0.006 + shallowFlavor * 0.006) + drift * 0.0015)
        let randomDelayDepth = cleanFlavor > 0
            ? randomDrift * (0.000035 + depth * 0.00016 + modFlutter * 0.00014 + contribution.materialWear * 0.00024 + contribution.aliasDamage * 0.00011)
            : shallowFlavor > 0
                ? randomDrift * (0.00072 + depth * 0.0086 + contribution.bbdColor * 0.0021)
                : 0
        let randomSpreadDelayDepth = randomDelayDepth * (0.62 + stereo * 0.52 + shallowFlavor * 0.28)
        let randomFilterDepth = abyssFlavor > 0
            ? modLp * 45
            : shallowFlavor > 0
                ? randomDrift * (38 + depth * 340) + modLp * 105
                : randomDrift * (8 + depth * 42) + modLp * 55
        let randomSpreadFilterDepth = randomFilterDepth * (0.55 + stereo * 0.32)
        let nyquistSafeLp = Double(sampleRate) * 0.45
        let lowpassHz = min(
            20_000,
            nyquistSafeLp,
            mapUnitToLogFrequency(lp, minHz: 700, maxHz: 20_000) *
            (0.72 + tone * 0.56) *
            (1 - damp * 0.12) *
            (1 - contribution.bbdColor * 0.18) *
            (1 - modLp * 0.08)
        )
        let characterWowFrequency = 0.03 + rate * 0.45 + drift * 0.18
        let degradeWowFrequency = 0.018 + degradeWobbleSpeed * 0.36 + drift * 0.12 + contribution.materialWear * 0.05 + modWow * 0.04
        let wowFrequency = characterWowFrequency + (degradeWowFrequency - characterWowFrequency) * degradeMotionWeight
        let endEnabled = state.dynamicsEnabled && state.endCompEnabled
        let endWet = endEnabled ? clamp01(state.endCompMix) : 0
        let endActive = endWet > 0.0001
        let endMakeup = endEnabled ? min(max(state.endCompMakeup, 0.05), 8) : 1
        let endThreshold = state.endCompThreshold
        let endKnee = max(0, state.endCompKnee)
        let endRatio = max(1, state.endCompRatio)
        let endAttack = max(0.0001, state.endCompAttackMs / 1000)
        let endRelease = max(0.02, state.endCompReleaseMs / 1000)
        let endDetectorHpHz = mapUnitToLogFrequency(state.endCompDetectorHp, minHz: 20, maxHz: 360)
        let endDetectorTilt = clamp01(state.endCompDetectorTilt)
        let endAutoMakeup = clamp01(state.endCompAutoMakeup)
        let endProgramRelease = clamp01(state.endCompProgramRelease)
        let masterSatActive = state.dynamicsEnabled && state.dynamicsSaturationEnabled
        let masterSatDrive = masterSatActive ? clamp01(state.dynamicsSaturationDrive) : 0
        let masterSatTone = clamp01(state.dynamicsSaturationTone)
        let masterSatBias = clamp01(state.dynamicsSaturationBias)
        let masterSatMode: Double
        switch state.dynamicsSaturationMode {
        case "tape":
            masterSatMode = 1
        case "tube":
            masterSatMode = 2
        case "diode":
            masterSatMode = 3
        case "fold":
            masterSatMode = 4
        default:
            masterSatMode = 0
        }

        func set(_ index: ParamIndex, _ value: Double) {
            params[index.rawValue] = Float(value.isFinite ? value : 0)
        }

        set(.active, wet > 0.0001 || masterSatDrive > 0.0001 || endActive ? 1 : 0)
        set(.allpassActive, wet > 0.0001 && mode == "shallowWater" ? 1 : 0)
        set(.dry, dry)
        set(.wet, wet)
        set(.degradeMix, degradeWetRatio)
        set(.workletAlias, workletAlias)
        set(.rawDegradeGeneration, rawDegradeGeneration)
        set(.rawCorrosion, rawCorrosion)
        set(.rawMediaWear, rawMediaWear)
        set(.noiseGain, min(0.018, wet * noise * (0.006 + age * 0.014 + corrosion * 0.012)) * degradeLevelTrim)
        set(.jitterDepth, degradeMix * (0.000014 + contribution.flutterJitter * 0.00008 + corrosion * 0.00006 + contribution.materialWear * 0.00005 + clamp01(contribution.aliasDamage * 0.46 + contribution.crossPatch * 0.4) * 0.00004 + modFlutter * 0.00011))
        set(.randomDriftFilterHz, randomHoldRateHz * (0.6 + damp * 0.32))
        set(.randomDriftDepth, randomDrift * (0.00016 + drift * 0.00225 + contribution.materialWear * 0.00215 + contribution.aliasDamage * 0.00075 + contribution.crossPatch * 0.00105 + modWow * 0.00095) * abyssPitchMotionTrim)
        set(.baseDelay, baseDelay)
        set(.spreadBaseDelay, spreadBaseDelay)
        set(.randomDrift, randomDrift)
        set(.randomHoldRateHz, randomHoldRateHz)
        set(.randomHoldLag, randomHoldLag)
        set(.randomDelayDepth, randomDelayDepth)
        set(.randomSpreadDelayDepth, randomSpreadDelayDepth)
        set(.randomFilterDepth, randomFilterDepth)
        set(.randomSpreadFilterDepth, randomSpreadFilterDepth)
        set(.depth, depth)
        set(.rate, rate)
        set(.shallowFlavor, shallowFlavor)
        set(.abyssFlavor, abyssFlavor)
        set(.stereo, stereo)
        set(.damage, damage)
        set(.mainPan, -stereo * (0.25 + shallowFlavor * 0.18))
        set(.spreadPan, stereo * (0.58 + shallowFlavor * 0.24))
        set(.mainDelayGain, (1 - stereo * (0.14 + shallowFlavor * 0.12)) * (1 - cleanCombTame * 0.08) * degradeLevelTrim)
        set(.spreadDelayGain, stereo * (cleanFlavor > 0 ? (0.05 + depth * 0.12) * (1 - cleanCombTame * 0.34) : 0.16 + depth * (0.4 + shallowFlavor * 0.18)) * degradeLevelTrim)
        set(.wowFrequency, wowFrequency)
        set(.flutterFrequency, 2.2 + rate * (5.4 + shallowFlavor * 3.2 + abyssFlavor * 1.2) + flutter * (4.2 + corrosion * 2.8))
        set(.flutterRandomDepth, degradeMix * clamp01(0.2 + modFlutter * 1.8 + contribution.flutterJitter * 0.5 + corrosion * 0.25) * (0.00004 + flutter * 0.00082 + modFlutter * 0.00048))
        let cyclicWowDepthScale = cleanFlavor > 0 ? 0.0062 : 0.0019 + degradeMix * 0.0007
        set(.wowDepth, (cyclicWow * cyclicWowDepthScale + tapeWanderDepth) * (0.38 + depth * (0.78 + shallowFlavor * 0.18 + abyssFlavor * 0.06) + contribution.crossPatch * 0.34) * abyssPitchMotionTrim)
        set(.flutterDepth, (cyclicFlutter * 0.00072 + tapeFlutterDepth) * (0.24 + depth * (0.34 + shallowFlavor * 0.1) + contribution.crossPatch * 0.44) * abyssPitchMotionTrim)
        set(.highpassHz, mapUnitToLogFrequency(hp, minHz: 20, maxHz: 2400))
        set(.highpassQ, 0.7 + resonance * 1.5)
        set(.allpassAFrequency, 260 + shallowFlavor * 520 + depth * 380 + age * 240)
        set(.allpassAQ, 0.25 + contribution.bbdColor * 1.4 + shallowFlavor * 0.1 + resonance * (abyssFlavor > 0 ? 0.18 : 1.1))
        set(.allpassBFrequency, 900 + shallowFlavor * 2100 + depth * 680 + age * 420 + contribution.bbdColor * 320)
        set(.allpassBQ, 0.25 + contribution.bbdColor * 1.8 + shallowFlavor * 0.1 + resonance * (abyssFlavor > 0 ? 0.14 : 0.85))
        set(.headBumpFrequency, 80 + mediaWear * 45 + corrosion * 20)
        set(.headBumpQ, 0.55 + mediaWear * 0.55)
        set(.headBumpGain, degradeMix * 1.1 * (0.2 + mediaWear * 0.65) * degradeLevelTrim + characterMix * (abyssFlavor * 0.28 + shallowFlavor * 0.22))
        set(.dropoutFilterHz, 0.25 + mediaWear * 1.8 + corrosion * 4.5 + digitalDamage * 1.2 + modDropout * 2.2)
        set(.dropoutDepth, dropout * 0.16)
        set(.dropoutGain, 1 - dropout * 0.14)
        set(.envFilterHz, 2.5 + envFollow * 26 + rate * 12)
        set(.envToLowpassGain, envFollow * contribution.envelopeBloom * (abyssFlavor > 0 ? 720 + depth * 2800 + resonance * 1300 : shallowFlavor > 0 ? 170 + depth * 820 : 120 + depth * 420) + modLp * 180)
        set(.envToResonanceGain, envFollow * contribution.envelopeBloom * (abyssFlavor > 0 ? 0.24 + resonance * 0.74 : shallowFlavor > 0 ? 0.08 + resonance * 0.2 : 0.025))
        set(.envToWetGain, envFollow * contribution.envelopeBloom * characterMix * (abyssFlavor > 0 ? 0.15 : shallowFlavor > 0 ? 0.045 : 0.015) + modWet * degradeMix * 0.04)
        set(.lowpassHz, lowpassHz)
        set(.lowpassQ, 0.7 + resonance * (cleanFlavor > 0 ? 0.45 + contribution.cascadedFilter * 0.25 : abyssFlavor > 0 ? 1.1 + contribution.cascadedFilter * 0.75 : 3.2 + contribution.cascadedFilter * 2.6))
        set(.lowpassStage2Hz, lowpassHz * (cleanFlavor > 0 || abyssFlavor > 0 ? 1 : 0.92 - contribution.materialWear * 0.08 + shallowFlavor * 0.04))
        set(.lowpassStage2Q, 0.7 + resonance * (cleanFlavor > 0 ? 0.2 : abyssFlavor > 0 ? 0.45 + contribution.cascadedFilter * 0.45 : 1.1 + contribution.cascadedFilter * 1.7))
        set(.compressorThreshold, characterEnabled ? -16 - characterMix * (shallowFlavor * 10 + abyssFlavor * 7) : -4)
        set(.compressorKnee, 10 + shallowFlavor * 10 + abyssFlavor * 8)
        set(.compressorRatio, 1.2 + shallowFlavor * 0.8 + abyssFlavor * 0.9 + envFollow * abyssFlavor * 0.35)
        set(.compressorAttack, 0.004 + shallowFlavor * 0.014 + abyssFlavor * 0.003)
        set(.compressorRelease, 0.12 + shallowFlavor * 0.1 + abyssFlavor * 0.18 + damp * 0.08)
        set(.compressorMakeup, 1 + characterMix * (shallowFlavor * 0.05 + abyssFlavor * 0.16))
        set(.saturation, saturation)
        set(.corrosion, corrosion)
        set(.masterSatActive, masterSatActive ? 1 : 0)
        set(.masterSatMode, masterSatMode)
        set(.masterSatDrive, masterSatDrive)
        set(.masterSatTone, masterSatTone)
        set(.masterSatBias, masterSatBias)
        set(.endCompActive, endActive ? 1 : 0)
        set(.endCompThreshold, endThreshold)
        set(.endCompKnee, endKnee)
        set(.endCompRatio, endRatio)
        set(.endCompAttack, endAttack)
        set(.endCompRelease, endRelease)
        set(.endCompMakeup, endMakeup)
        set(.endCompMix, endWet)
        set(.endCompDetectorHpHz, endDetectorHpHz)
        set(.endCompDetectorTilt, endDetectorTilt)
        set(.endCompAutoMakeup, endAutoMakeup)
        set(.endCompProgramRelease, endProgramRelease)

    }

    private static func characterDefaults(for mode: String) -> (
        mix: Double,
        age: Double,
        hp: Double,
        lp: Double,
        resonance: Double,
        depth: Double,
        rate: Double,
        damp: Double
    ) {
        switch mode {
        case "abyssWater":
            return (0.36, 0.06, 0.01, 1, 0.3, 0.33, 0.08, 0.33)
        case "shallowWater":
            return (0.42, 0.18, 0.02, 0.78, 0.48, 0.82, 0.16, 0.65)
        default:
            return (0, 0, 0, 1, 0.2, 0.12, 0.2, 0.5)
        }
    }

    private static func contributionMatrix(
        mode: String,
        characterEnabled: Bool,
        degradeEnabled: Bool,
        characterMix: Double,
        degradeMix: Double,
        degradeAge: Double,
        degradeGeneration: Double,
        degradeAlias: Double,
        corrosion: Double
    ) -> (
        randomHold: Double,
        smoothDrift: Double,
        sineWow: Double,
        flutterJitter: Double,
        envelopeBloom: Double,
        cascadedFilter: Double,
        bbdColor: Double,
        materialWear: Double,
        aliasDamage: Double,
        crossPatch: Double
    ) {
        let character = characterEnabled ? clamp01(characterMix) : 0
        let degrade = degradeEnabled ? sqrt(clamp01(degradeMix)) : 0
        let abyss = mode == "abyssWater" ? character : 0
        let shallow = mode == "shallowWater" ? character : 0
        let clean = mode == "clean" ? character : 0
        let materialWear = clamp01((degradeAge * 0.72 + degradeGeneration * 0.58) * degrade)
        let aliasDamage = clamp01((degradeAlias * 0.9 + corrosion * 0.42) * degrade)
        let crossPatch = clamp01(aliasDamage * (0.4 + corrosion * 0.8))

        return (
            randomHold: clamp01(abyss * 0.72 + shallow * 0.66 + clean * 0.08 + materialWear * 0.08 + crossPatch * 0.28),
            smoothDrift: clamp01(abyss * 0.42 + shallow * 0.62 + clean * 0.12 + materialWear * 0.44 + crossPatch * 0.24),
            sineWow: clamp01(clean * 0.06 + materialWear * 0.08 + crossPatch * 0.08),
            flutterJitter: clamp01(abyss * 0.08 + shallow * 0.24 + materialWear * 0.12 + aliasDamage * (0.22 + crossPatch * 0.58)),
            envelopeBloom: clamp01(abyss * 0.68 + shallow * 0.16 + clean * 0.04),
            cascadedFilter: clamp01(abyss * 0.42 + shallow * 0.44 + clean * 0.08 + materialWear * 0.18),
            bbdColor: clamp01(shallow * 0.58 + materialWear * 0.1 + aliasDamage * 0.12),
            materialWear: materialWear,
            aliasDamage: aliasDamage,
            crossPatch: crossPatch
        )
    }

    private static func clamp01(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), 1)
    }

    private static func mapUnitToLogFrequency(_ value: Double, minHz: Double, maxHz: Double) -> Double {
        let t = clamp01(value)
        return minHz * pow(maxHz / minHz, t)
    }
}
