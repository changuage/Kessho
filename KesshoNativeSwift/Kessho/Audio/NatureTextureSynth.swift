import AVFoundation

@inline(__always)
private func clampNature(_ value: Float, _ minValue: Float, _ maxValue: Float) -> Float {
    return min(max(value, minValue), maxValue)
}

@inline(__always)
private func writeNatureStereoFrame(
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

/// CPU-light procedural nature bed covering web parity gaps: birds, frogs,
/// insects, drops, bubbles, and surf-like water texture.
final class NatureTextureSynth {
    enum Layer: Int, CaseIterable {
        case birds = 0
        case frogs = 1
        case insects1 = 2
        case insects2 = 3
        case waterDrops = 4
        case bubbles = 5
        case surf = 6
    }

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

    private struct LayerControl {
        var enabled: Bool = false
        var level: Float = 0.5
        var density: Float = 0.45
        var tone: Float = 0.5
        var tonalDensity: Float = 0.5
        var waterTurbulence: Float = 0.35
        var waterLowPass: Float = 1.0
        var waterHardDrop: Float = 0.5
        var surfFoamBright: Float = 0.4
        var surfProximity: Float = 0.7
        var surfDepth: Float = 0.5
        var surfBody: Float = 0.35
        var surfSpray: Float = 0.5
        var insectProximity: Float = 0.5
        var insectClickRate: Float = 0.3
        var insectMotion: Float = 0.5
        var insectAntiphony: Float = 0.3
    }

    private struct ChirpEvent {
        var active: Bool = false
        var age: Int = 0
        var duration: Int = 1
        var phase: Float = 0
        var startFreq: Float = 1_800
        var endFreq: Float = 3_200
        var amp: Float = 0
        var pan: Float = 0
    }

    private struct PulseEvent {
        var active: Bool = false
        var age: Int = 0
        var duration: Int = 1
        var phase: Float = 0
        var freq: Float = 140
        var amp: Float = 0
        var pan: Float = 0
        var filter: Float = 0
    }

    private struct DropEvent {
        var active: Bool = false
        var age: Int = 0
        var duration: Int = 1
        var phase: Float = 0
        var freq: Float = 800
        var amp: Float = 0
        var pan: Float = 0
        var filter: Float = 0
    }

    private let sampleRate: Float
    private let invSampleRate: Float
    private var controls: [LayerControl]
    private var enabled: Bool = true
    private var masterLevel: Float = 0.6
    private var seed: UInt32

    private var bird1 = ChirpEvent()
    private var bird2 = ChirpEvent()
    private var frog1 = PulseEvent()
    private var frog2 = PulseEvent()
    private var drop1 = DropEvent()
    private var drop2 = DropEvent()
    private var bubble1 = DropEvent()
    private var bubble2 = DropEvent()

    private var insectPhase1: Float = 0
    private var insectPhase2: Float = 0
    private var insectPhase3: Float = 0
    private var insectGate1: Float = 0
    private var insectGate2: Float = 0
    private var insectNoise1: Float = 0
    private var insectNoise2: Float = 0
    private var insectPan1: Float = -0.25
    private var insectPan2: Float = 0.25

    private var surfL: Float = 0
    private var surfR: Float = 0
    private var surfSlowL: Float = 0
    private var surfSlowR: Float = 0
    private var surfBodyL: Float = 0
    private var surfBodyR: Float = 0
    private var surfSprayL: Float = 0
    private var surfSprayR: Float = 0
    private var dcL: Float = 0
    private var dcR: Float = 0

    init(sampleRate: Float = 44_100, seed: UInt32 = 0xC0FFEE) {
        self.sampleRate = max(sampleRate, 1_000)
        self.invSampleRate = 1.0 / self.sampleRate
        self.seed = seed == 0 ? 1 : seed
        self.controls = [LayerControl](repeating: LayerControl(), count: Layer.allCases.count)
    }

    func render(
        frameCount: Int,
        to buffers: UnsafeMutableAudioBufferListPointer,
        accumulate: Bool = false
    ) {
        guard enabled else {
            for frame in 0..<frameCount {
                writeNatureStereoFrame(0, 0, frame: frame, to: buffers, accumulate: accumulate)
            }
            return
        }

        for frame in 0..<frameCount {
            let (left, right) = generateStereoSample()
            writeNatureStereoFrame(left, right, frame: frame, to: buffers, accumulate: accumulate)
        }
    }

    private func generateStereoSample() -> (Float, Float) {
        var left: Float = 0
        var right: Float = 0

        add(&left, &right, renderBirds())
        add(&left, &right, renderFrogs())
        add(&left, &right, renderInsects1())
        add(&left, &right, renderInsects2())
        add(&left, &right, renderWaterDrops())
        add(&left, &right, renderBubbles())
        add(&left, &right, renderSurf())

        dcL += (left - dcL) * 0.0002
        dcR += (right - dcR) * 0.0002

        return (tanh((left - dcL) * masterLevel), tanh((right - dcR) * masterLevel))
    }

    private func add(_ left: inout Float, _ right: inout Float, _ sample: (Float, Float)) {
        left += sample.0
        right += sample.1
    }

    private func renderBirds() -> (Float, Float) {
        let control = controls[Layer.birds.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        let chance = (0.000006 + control.density * 0.00012) * (0.75 + control.tonalDensity * 0.65)
        if !bird1.active && randomUnit() < chance { startBird(&bird1, control: control) }
        if !bird2.active && randomUnit() < chance * 0.45 { startBird(&bird2, control: control) }
        let a = renderChirp(&bird1, control: control)
        let b = renderChirp(&bird2, control: control)
        return ((a.0 + b.0) * control.level, (a.1 + b.1) * control.level)
    }

    private func renderFrogs() -> (Float, Float) {
        let control = controls[Layer.frogs.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        let chance = (0.000003 + control.density * 0.00008) * (0.75 + control.tonalDensity * 0.7)
        if !frog1.active && randomUnit() < chance { startFrog(&frog1, control: control) }
        if !frog2.active && randomUnit() < chance * 0.32 { startFrog(&frog2, control: control) }
        let a = renderPulse(&frog1, control: control)
        let b = renderPulse(&frog2, control: control)
        return ((a.0 + b.0) * control.level, (a.1 + b.1) * control.level)
    }

    private func renderInsects1() -> (Float, Float) {
        let control = controls[Layer.insects1.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        let motionNoise = whiteNoise() * control.insectMotion * 0.018
        insectPan1 = clampNature(insectPan1 + motionNoise, -0.85, 0.85)
        let rate = (42.0 + control.tone * 85.0) * (0.75 + control.insectClickRate * 1.35)
        insectPhase1 += rate * invSampleRate
        if insectPhase1 >= 1 { insectPhase1 -= floor(insectPhase1) }
        let duty = 0.24 + control.density * 0.22 + control.insectClickRate * 0.16
        insectGate1 += ((insectPhase1 < duty ? 1.0 : 0.0) - insectGate1) * (0.07 + control.insectClickRate * 0.12)
        insectNoise1 += (whiteNoise() - insectNoise1) * (0.22 + control.tone * 0.22)
        let carrier = sin(2.0 * Float.pi * insectPhase1 * (16.0 + control.tone * 8.0))
        let click = whiteNoise() * insectGate1 * control.insectClickRate * 0.028
        let sample = (carrier * 0.055 + insectNoise1 * 0.035 + click) *
            insectGate1 *
            control.density *
            control.level *
            (0.75 + control.insectProximity * 0.6)
        let panAmount = insectPan1 * (0.25 + control.insectMotion * 0.75)
        let antiphony = sin(2.0 * Float.pi * insectPhase1) * control.insectAntiphony * sample * 0.55
        let panned = pan(sample, panAmount)
        return (panned.0 + antiphony, panned.1 - antiphony)
    }

    private func renderInsects2() -> (Float, Float) {
        let control = controls[Layer.insects2.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        insectPan2 = clampNature(insectPan2 - whiteNoise() * control.insectMotion * 0.014, -0.9, 0.9)
        insectPhase2 += (7.0 + control.density * 22.0 + control.insectClickRate * 28.0) * invSampleRate
        insectPhase3 += (1_900.0 + control.tone * 3_100.0) * invSampleRate
        if insectPhase2 >= 1 { insectPhase2 -= floor(insectPhase2) }
        if insectPhase3 >= 1 { insectPhase3 -= floor(insectPhase3) }
        let targetGate: Float = insectPhase2 < (0.06 + control.density * 0.16 + control.insectClickRate * 0.1) ? 1.0 : 0.0
        insectGate2 += (targetGate - insectGate2) * (0.14 + control.insectClickRate * 0.12)
        insectNoise2 += (whiteNoise() - insectNoise2) * 0.35
        let carrier = sin(2.0 * Float.pi * insectPhase3)
        let click = whiteNoise() * insectGate2 * control.insectClickRate * 0.024
        let sample = (carrier * 0.04 + insectNoise2 * 0.025 + click) *
            insectGate2 *
            control.level *
            (0.72 + control.insectProximity * 0.55)
        let panAmount = insectPan2 * (0.25 + control.insectMotion * 0.75)
        let antiphony = sin(2.0 * Float.pi * insectPhase2) * control.insectAntiphony * sample * 0.6
        let panned = pan(sample, panAmount)
        return (panned.0 - antiphony, panned.1 + antiphony)
    }

    private func renderWaterDrops() -> (Float, Float) {
        let control = controls[Layer.waterDrops.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        let chance = (0.000012 + control.density * 0.00032) * (0.75 + control.waterHardDrop * 0.55)
        if !drop1.active && randomUnit() < chance { startDrop(&drop1, control: control, bubble: false) }
        if !drop2.active && randomUnit() < chance * 0.5 { startDrop(&drop2, control: control, bubble: false) }
        let a = renderDrop(&drop1, pitchBend: -0.64, control: control, bubble: false)
        let b = renderDrop(&drop2, pitchBend: -0.48, control: control, bubble: false)
        let turbulence = whiteNoise() * control.waterTurbulence * control.density * 0.018
        return (
            (a.0 + b.0 + turbulence * 0.7) * control.level,
            (a.1 + b.1 + turbulence * 0.55) * control.level
        )
    }

    private func renderBubbles() -> (Float, Float) {
        let control = controls[Layer.bubbles.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        let chance = (0.00002 + control.density * 0.00038) * (0.8 + control.waterTurbulence * 0.45)
        if !bubble1.active && randomUnit() < chance { startDrop(&bubble1, control: control, bubble: true) }
        if !bubble2.active && randomUnit() < chance * 0.55 { startDrop(&bubble2, control: control, bubble: true) }
        let a = renderDrop(&bubble1, pitchBend: 0.85, control: control, bubble: true)
        let b = renderDrop(&bubble2, pitchBend: 0.55, control: control, bubble: true)
        return ((a.0 + b.0) * control.level, (a.1 + b.1) * control.level)
    }

    private func renderSurf() -> (Float, Float) {
        let control = controls[Layer.surf.rawValue]
        guard control.enabled && control.level > 0 else { return (0, 0) }
        let nL = whiteNoise()
        let nR = whiteNoise()
        let fast = 0.012 + control.surfSpray * 0.05 + control.surfFoamBright * 0.024
        let slow = 0.0004 + control.density * 0.001 + control.surfDepth * 0.0008
        let bodyCoeff = 0.0008 + control.surfBody * 0.0045
        let sprayCoeff = 0.06 + control.surfFoamBright * 0.18
        surfL += (nL - surfL) * fast
        surfR += (nR - surfR) * fast
        surfSlowL += (abs(nL) - surfSlowL) * slow
        surfSlowR += (abs(nR) - surfSlowR) * slow
        surfBodyL += (nL - surfBodyL) * bodyCoeff
        surfBodyR += (nR - surfBodyR) * bodyCoeff
        surfSprayL += ((nL - surfL) - surfSprayL) * sprayCoeff
        surfSprayR += ((nR - surfR) - surfSprayR) * sprayCoeff

        let swellL = 0.35 + surfSlowL * (0.7 + control.surfProximity * 0.7)
        let swellR = 0.35 + surfSlowR * (0.7 + control.surfProximity * 0.7)
        let bodyLevel = control.surfDepth * 0.18
        let sprayLevel = (0.04 + control.surfFoamBright * 0.18) * (0.5 + control.surfProximity * 0.7)
        let turbulence = control.waterTurbulence * 0.05
        let level = control.level * (0.09 + control.density * 0.24)
        return (
            (surfL * swellL + surfBodyL * bodyLevel + surfSprayL * sprayLevel + nL * turbulence) * level,
            (surfR * swellR + surfBodyR * bodyLevel + surfSprayR * sprayLevel + nR * turbulence) * level
        )
    }

    private func startBird(_ event: inout ChirpEvent, control: LayerControl) {
        let high = 2_000.0 + control.tone * 3_200.0
        event.active = true
        event.age = 0
        event.duration = Int(sampleRate * randomRange(0.07, 0.22))
        event.phase = randomUnit()
        event.startFreq = randomRange(1_200, high)
        event.endFreq = event.startFreq * randomRange(1.15, 1.85)
        event.amp = randomRange(0.05, 0.13)
        event.pan = randomRange(-0.9, 0.9)
    }

    private func renderChirp(_ event: inout ChirpEvent, control: LayerControl) -> (Float, Float) {
        guard event.active else { return (0, 0) }
        let t = Float(event.age) / Float(max(event.duration, 1))
        if t >= 1 {
            event.active = false
            return (0, 0)
        }
        let env = sin(Float.pi * t) * (1.0 - t * 0.25)
        let wobble = sin(2.0 * Float.pi * t * 8.0) * 80.0
        let freq = event.startFreq + (event.endFreq - event.startFreq) * t + wobble
        event.phase += freq * invSampleRate
        if event.phase >= 1 { event.phase -= floor(event.phase) }
        let fundamental = sin(2.0 * Float.pi * event.phase)
        let harmonic = sin(4.0 * Float.pi * event.phase) * control.tonalDensity * 0.18
        let sample = (fundamental + harmonic) * env * event.amp
        event.age += 1
        return pan(sample, event.pan)
    }

    private func startFrog(_ event: inout PulseEvent, control: LayerControl) {
        event.active = true
        event.age = 0
        event.duration = Int(sampleRate * randomRange(0.18, 0.55))
        event.phase = randomUnit()
        event.freq = randomRange(65, 150 + control.tone * 130)
        event.amp = randomRange(0.08, 0.18)
        event.pan = randomRange(-0.75, 0.75)
        event.filter = 0
    }

    private func renderPulse(_ event: inout PulseEvent, control: LayerControl) -> (Float, Float) {
        guard event.active else { return (0, 0) }
        let t = Float(event.age) / Float(max(event.duration, 1))
        if t >= 1 {
            event.active = false
            return (0, 0)
        }
        let env = sin(Float.pi * t)
        let throat = 1.0 + 0.035 * sin(2.0 * Float.pi * t * 24.0)
        event.phase += event.freq * throat * invSampleRate
        if event.phase >= 1 { event.phase -= floor(event.phase) }
        let raw = sin(2.0 * Float.pi * event.phase) +
            sin(4.0 * Float.pi * event.phase) * (0.22 + control.tonalDensity * 0.26) +
            sin(6.0 * Float.pi * event.phase) * control.tonalDensity * 0.1
        event.filter += (raw - event.filter) * (0.09 + control.tonalDensity * 0.07)
        event.age += 1
        return pan(event.filter * env * event.amp, event.pan)
    }

    private func startDrop(_ event: inout DropEvent, control: LayerControl, bubble: Bool) {
        event.active = true
        event.age = 0
        let hard = bubble ? 0.0 : control.waterHardDrop
        let minDuration = bubble ? 0.08 : (0.045 - hard * 0.018)
        let maxDuration = bubble ? 0.2 : (0.16 - hard * 0.035)
        event.duration = Int(sampleRate * randomRange(minDuration, maxDuration))
        event.phase = randomUnit()
        event.freq = bubble ?
            randomRange(180, 520 + control.tone * 700) :
            randomRange(620 + hard * 360, 1_800 + control.tone * 1_200 + hard * 1_100)
        event.amp = randomRange(bubble ? 0.05 : 0.045 + hard * 0.02, bubble ? 0.12 : 0.15 + hard * 0.05)
        event.pan = randomRange(-1.0, 1.0)
        event.filter = 0
    }

    private func renderDrop(_ event: inout DropEvent, pitchBend: Float, control: LayerControl, bubble: Bool) -> (Float, Float) {
        guard event.active else { return (0, 0) }
        let t = Float(event.age) / Float(max(event.duration, 1))
        if t >= 1 {
            event.active = false
            return (0, 0)
        }
        let hard = bubble ? 0.0 : control.waterHardDrop
        let env = exp(-t * (bubble ? 7.0 : 7.0 + hard * 5.0))
        let freq = event.freq * (1.0 + pitchBend * t * (0.75 + control.tone * 0.5))
        event.phase += max(30, freq) * invSampleRate
        if event.phase >= 1 { event.phase -= floor(event.phase) }
        let clickLength = Int(10 + hard * 18 + control.waterTurbulence * 10)
        let clickEnv = event.age < clickLength ? 1.0 - Float(event.age) / Float(max(clickLength, 1)) : 0
        let click = whiteNoise() * clickEnv * (0.11 + hard * 0.3 + control.waterTurbulence * 0.1)
        let ring = sin(2.0 * Float.pi * event.phase) +
            sin(4.0 * Float.pi * event.phase) * (bubble ? 0.08 : control.tone * 0.16)
        let raw = (ring + click) * env * event.amp
        let lowPass = clampNature(0.04 + control.waterLowPass * 0.42, 0.02, 0.6)
        event.filter += (raw - event.filter) * lowPass
        event.age += 1
        return pan(event.filter, event.pan)
    }

    private func pan(_ sample: Float, _ pan: Float) -> (Float, Float) {
        let left = sample * clampNature(0.72 - pan * 0.32, 0.12, 1.0)
        let right = sample * clampNature(0.72 + pan * 0.32, 0.12, 1.0)
        return (left, right)
    }

    private func nextUInt() -> UInt32 {
        seed = seed &* 1664525 &+ 1013904223
        return seed
    }

    private func randomUnit() -> Float {
        return Float(nextUInt()) / Float(UInt32.max)
    }

    private func whiteNoise() -> Float {
        return randomUnit() * 2.0 - 1.0
    }

    private func randomRange(_ minValue: Float, _ maxValue: Float) -> Float {
        return minValue + randomUnit() * (maxValue - minValue)
    }

    // MARK: - Public Interface

    func setEnabled(_ enabled: Bool) {
        self.enabled = enabled
    }

    func setSeed(_ seed: UInt32) {
        self.seed = seed == 0 ? 1 : seed
    }

    func setMasterLevel(_ level: Float) {
        self.masterLevel = clampNature(level, 0, 1.5)
    }

    func setLayerEnabled(_ layer: Layer, _ enabled: Bool) {
        controls[layer.rawValue].enabled = enabled
    }

    func setLayerLevel(_ layer: Layer, _ level: Float) {
        controls[layer.rawValue].level = clampNature(level, 0, 1)
    }

    func setLayerDensity(_ layer: Layer, _ density: Float) {
        controls[layer.rawValue].density = clampNature(density, 0, 1)
    }

    func setLayerTone(_ layer: Layer, _ tone: Float) {
        controls[layer.rawValue].tone = clampNature(tone, 0, 1)
    }

    func setLayerTonalDensity(_ layer: Layer, _ tonalDensity: Float) {
        controls[layer.rawValue].tonalDensity = clampNature(tonalDensity, 0, 1)
    }

    func setWaterDropCharacteristics(
        turbulence: Float? = nil,
        tone: Float? = nil,
        lowPass: Float? = nil,
        hardDrop: Float? = nil
    ) {
        updateWaterCharacteristics(.waterDrops, turbulence: turbulence, tone: tone, lowPass: lowPass, hardDrop: hardDrop)
    }

    func setBubbleCharacteristics(
        turbulence: Float? = nil,
        tone: Float? = nil,
        lowPass: Float? = nil
    ) {
        updateWaterCharacteristics(.bubbles, turbulence: turbulence, tone: tone, lowPass: lowPass, hardDrop: nil)
    }

    func setSurfCharacteristics(
        turbulence: Float? = nil,
        foamBright: Float? = nil,
        proximity: Float? = nil,
        depth: Float? = nil,
        body: Float? = nil,
        spray: Float? = nil
    ) {
        let index = Layer.surf.rawValue
        if let turbulence = turbulence {
            controls[index].waterTurbulence = clampNature(turbulence, 0, 1)
        }
        if let foamBright = foamBright {
            controls[index].surfFoamBright = clampNature(foamBright, 0, 1)
        }
        if let proximity = proximity {
            controls[index].surfProximity = clampNature(proximity, 0, 1)
        }
        if let depth = depth {
            controls[index].surfDepth = clampNature(depth, 0, 1)
        }
        if let body = body {
            controls[index].surfBody = clampNature(body, 0, 1)
        }
        if let spray = spray {
            controls[index].surfSpray = clampNature(spray, 0, 1)
        }
    }

    func setInsectCharacteristics(
        _ layer: Layer,
        proximity: Float? = nil,
        clickRate: Float? = nil,
        motion: Float? = nil,
        antiphony: Float? = nil
    ) {
        guard layer == .insects1 || layer == .insects2 else { return }
        let index = layer.rawValue
        if let proximity = proximity {
            controls[index].insectProximity = clampNature(proximity, 0, 1)
        }
        if let clickRate = clickRate {
            controls[index].insectClickRate = clampNature(clickRate, 0, 1)
        }
        if let motion = motion {
            controls[index].insectMotion = clampNature(motion, 0, 1)
        }
        if let antiphony = antiphony {
            controls[index].insectAntiphony = clampNature(antiphony, 0, 1)
        }
    }

    func setLayerControls(
        _ layer: Layer,
        enabled: Bool,
        level: Float,
        density: Float,
        tone: Float,
        tonalDensity: Float? = nil,
        waterTurbulence: Float? = nil,
        waterLowPass: Float? = nil,
        waterHardDrop: Float? = nil,
        surfFoamBright: Float? = nil,
        surfProximity: Float? = nil,
        surfDepth: Float? = nil,
        surfBody: Float? = nil,
        surfSpray: Float? = nil,
        insectProximity: Float? = nil,
        insectClickRate: Float? = nil,
        insectMotion: Float? = nil,
        insectAntiphony: Float? = nil
    ) {
        let existing = controls[layer.rawValue]
        controls[layer.rawValue] = LayerControl(
            enabled: enabled,
            level: clampNature(level, 0, 1),
            density: clampNature(density, 0, 1),
            tone: clampNature(tone, 0, 1),
            tonalDensity: clampNature(tonalDensity ?? existing.tonalDensity, 0, 1),
            waterTurbulence: clampNature(waterTurbulence ?? existing.waterTurbulence, 0, 1),
            waterLowPass: clampNature(waterLowPass ?? existing.waterLowPass, 0, 1),
            waterHardDrop: clampNature(waterHardDrop ?? existing.waterHardDrop, 0, 1),
            surfFoamBright: clampNature(surfFoamBright ?? existing.surfFoamBright, 0, 1),
            surfProximity: clampNature(surfProximity ?? existing.surfProximity, 0, 1),
            surfDepth: clampNature(surfDepth ?? existing.surfDepth, 0, 1),
            surfBody: clampNature(surfBody ?? existing.surfBody, 0, 1),
            surfSpray: clampNature(surfSpray ?? existing.surfSpray, 0, 1),
            insectProximity: clampNature(insectProximity ?? existing.insectProximity, 0, 1),
            insectClickRate: clampNature(insectClickRate ?? existing.insectClickRate, 0, 1),
            insectMotion: clampNature(insectMotion ?? existing.insectMotion, 0, 1),
            insectAntiphony: clampNature(insectAntiphony ?? existing.insectAntiphony, 0, 1)
        )
    }

    private func updateWaterCharacteristics(
        _ layer: Layer,
        turbulence: Float?,
        tone: Float?,
        lowPass: Float?,
        hardDrop: Float?
    ) {
        guard layer == .waterDrops || layer == .bubbles else { return }
        let index = layer.rawValue
        if let turbulence = turbulence {
            controls[index].waterTurbulence = clampNature(turbulence, 0, 1)
        }
        if let tone = tone {
            controls[index].tone = clampNature(tone, 0, 1)
        }
        if let lowPass = lowPass {
            controls[index].waterLowPass = clampNature(lowPass, 0, 1)
        }
        if let hardDrop = hardDrop {
            controls[index].waterHardDrop = clampNature(hardDrop, 0, 1)
        }
    }

    func hardReset() {
        bird1 = ChirpEvent()
        bird2 = ChirpEvent()
        frog1 = PulseEvent()
        frog2 = PulseEvent()
        drop1 = DropEvent()
        drop2 = DropEvent()
        bubble1 = DropEvent()
        bubble2 = DropEvent()
        insectPhase1 = 0
        insectPhase2 = 0
        insectPhase3 = 0
        insectGate1 = 0
        insectGate2 = 0
        insectNoise1 = 0
        insectNoise2 = 0
        insectPan1 = -0.25
        insectPan2 = 0.25
        surfL = 0
        surfR = 0
        surfSlowL = 0
        surfSlowR = 0
        surfBodyL = 0
        surfBodyR = 0
        surfSprayL = 0
        surfSprayR = 0
        dcL = 0
        dcR = 0
    }
}
