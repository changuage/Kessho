import AudioToolbox
import AVFoundation
import Foundation

#if canImport(KesshoProductCoreBridge)
import KesshoProductCoreBridge
#endif

#if canImport(KesshoProductSchema)
import KesshoProductSchema
#endif

public final class KesshoProductCoreAudioEngine {
    private final class StemRenderState {
        let stemIds: [UInt32]
        let left: UnsafeMutablePointer<Float>
        let right: UnsafeMutablePointer<Float>
        let scratchLeft: UnsafeMutablePointer<Float>
        let scratchRight: UnsafeMutablePointer<Float>
        let capacity: Int

        init(stemIds: [UInt32], capacity: Int) {
            self.stemIds = stemIds
            self.capacity = capacity
            left = UnsafeMutablePointer<Float>.allocate(capacity: capacity)
            right = UnsafeMutablePointer<Float>.allocate(capacity: capacity)
            scratchLeft = UnsafeMutablePointer<Float>.allocate(capacity: capacity)
            scratchRight = UnsafeMutablePointer<Float>.allocate(capacity: capacity)
            left.initialize(repeating: 0, count: capacity)
            right.initialize(repeating: 0, count: capacity)
            scratchLeft.initialize(repeating: 0, count: capacity)
            scratchRight.initialize(repeating: 0, count: capacity)
        }

        deinit {
            left.deinitialize(count: capacity)
            right.deinitialize(count: capacity)
            scratchLeft.deinitialize(count: capacity)
            scratchRight.deinitialize(count: capacity)
            left.deallocate()
            right.deallocate()
            scratchLeft.deallocate()
            scratchRight.deallocate()
        }
    }

    private let engine = AVAudioEngine()
    let productCore: KesshoProductCore
    private let sourceNode: AVAudioSourceNode
    private let renderFormat: AVAudioFormat
    private let maxBlockSize: UInt32
    private let leftBuffer: UnsafeMutablePointer<Float>
    private let rightBuffer: UnsafeMutablePointer<Float>
    private var registeredAssetIds = Set<UInt32>()
    private var recordingStemNodes: [RecordingStem: AVAudioSourceNode] = [:]
    private var recordingStemMixers: [RecordingStem: AVAudioMixerNode] = [:]
    private var recordingStemStates: [RecordingStem: StemRenderState] = [:]

    public private(set) var isRunning = false

    public init(sampleRate: Double = 48_000, maxBlockSize: UInt32 = 512) throws {
        self.maxBlockSize = maxBlockSize
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 2,
            interleaved: false
        ) else {
            throw KesshoProductCoreError.createFailed
        }
        renderFormat = format
        productCore = try KesshoProductCore(sampleRate: sampleRate, maxBlockSize: maxBlockSize)
        leftBuffer = UnsafeMutablePointer<Float>.allocate(capacity: Int(maxBlockSize))
        rightBuffer = UnsafeMutablePointer<Float>.allocate(capacity: Int(maxBlockSize))
        leftBuffer.initialize(repeating: 0, count: Int(maxBlockSize))
        rightBuffer.initialize(repeating: 0, count: Int(maxBlockSize))

        let localProductCore = productCore
        let localMaxBlockSize = maxBlockSize
        let localLeftBuffer = leftBuffer
        let localRightBuffer = rightBuffer
        sourceNode = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList in
            guard frameCount <= localMaxBlockSize else {
                return kAudioUnitErr_TooManyFramesToProcess
            }

            let frames = Int(frameCount)
            let left = UnsafeMutableBufferPointer(start: localLeftBuffer, count: frames)
            let right = UnsafeMutableBufferPointer(start: localRightBuffer, count: frames)
            let renderStatus = localProductCore.render(left: left, right: right, frames: frames)
            guard renderStatus == 1 else {
                return kAudioUnitErr_CannotDoInCurrentContext
            }

            let outputBuffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            if outputBuffers.count >= 2 {
                if let leftOut = outputBuffers[0].mData?.assumingMemoryBound(to: Float.self) {
                    leftOut.update(from: localLeftBuffer, count: frames)
                }
                if let rightOut = outputBuffers[1].mData?.assumingMemoryBound(to: Float.self) {
                    rightOut.update(from: localRightBuffer, count: frames)
                }
            } else if outputBuffers.count == 1,
                      outputBuffers[0].mNumberChannels == 2,
                      let interleaved = outputBuffers[0].mData?.assumingMemoryBound(to: Float.self) {
                for frame in 0..<frames {
                    interleaved[frame * 2] = localLeftBuffer[frame]
                    interleaved[frame * 2 + 1] = localRightBuffer[frame]
                }
            } else {
                return kAudioUnitErr_FormatNotSupported
            }

            return noErr
        }

        engine.attach(sourceNode)
        engine.connect(sourceNode, to: engine.mainMixerNode, format: format)
        Self.recordingStemMap().forEach { stem, stemIds in
            let stemState = StemRenderState(stemIds: stemIds, capacity: Int(maxBlockSize))
            let stemNode = Self.makeStemSourceNode(
                format: format,
                productCore: productCore,
                maxBlockSize: maxBlockSize,
                state: stemState
            )
            let stemMixer = AVAudioMixerNode()
            stemMixer.outputVolume = 0
            recordingStemStates[stem] = stemState
            recordingStemNodes[stem] = stemNode
            recordingStemMixers[stem] = stemMixer
            engine.attach(stemNode)
            engine.attach(stemMixer)
            engine.connect(stemNode, to: stemMixer, format: format)
            engine.connect(stemMixer, to: engine.mainMixerNode, format: format)
        }
        engine.connect(engine.mainMixerNode, to: engine.outputNode, format: format)
    }

    deinit {
        stop()
        leftBuffer.deinitialize(count: Int(maxBlockSize))
        rightBuffer.deinitialize(count: Int(maxBlockSize))
        leftBuffer.deallocate()
        rightBuffer.deallocate()
    }

    public func start(snapshotBytes: Data? = nil) throws {
        if let snapshotBytes {
            let result = productCore.loadSnapshot(snapshotBytes)
            guard result == 1 else {
                throw KesshoProductCoreAudioEngineError.snapshotLoadFailed(result)
            }
        }
        try AudioSessionManager.shared.configureForPlayback(
            preferredSampleRate: renderFormat.sampleRate,
            preferredIOBufferDuration: Double(maxBlockSize) / renderFormat.sampleRate
        )
        try AudioSessionManager.shared.activate()
        productCore.start()
        try engine.start()
        isRunning = true
    }

    public func stop() {
        productCore.stop()
        engine.stop()
        engine.reset()
        isRunning = false
    }

    @discardableResult
    public func loadSnapshot(_ snapshotBytes: Data) -> Int32 {
        productCore.loadSnapshot(snapshotBytes)
    }

    @discardableResult
    public func enqueue(_ event: KesshoProductCoreEvent) -> Int32 {
        productCore.enqueue(event)
    }

    @discardableResult
    public func manualNoteOn(
        sourceId: UInt32,
        midiNote: Float,
        velocity: Float = 0.85,
        holdSeconds: Float = 0.2,
        sampleOffset: UInt32 = 0
    ) -> Int32 {
        productCore.manualNoteOn(
            sourceId: sourceId,
            midiNote: midiNote,
            velocity: velocity,
            holdSeconds: holdSeconds,
            sampleOffset: sampleOffset
        )
    }

    @discardableResult
    public func registerInterleavedAsset(
        id assetId: UInt32,
        pcm: [Float],
        frameCount: UInt32,
        channelCount: UInt32,
        sampleRate: Double,
        flags: UInt32
    ) throws -> Int32 {
        try productCore.registerInterleavedAsset(
            id: assetId,
            pcm: pcm,
            frameCount: frameCount,
            channelCount: channelCount,
            sampleRate: sampleRate,
            flags: flags
        )
    }

    public func telemetry() -> KesshoNativeProductTelemetry {
        productCore.telemetry()
    }

    public func avAudioEngine() -> AVAudioEngine {
        engine
    }

    func isAssetRegistered(_ assetId: UInt32) -> Bool {
        registeredAssetIds.contains(assetId)
    }

    func markAssetRegistered(_ assetId: UInt32) {
        registeredAssetIds.insert(assetId)
    }

    func configureRecorder(_ recorder: AudioRecorder) {
        recorder.configureProductCore(
            engine: engine,
            masterNode: engine.mainMixerNode,
            stemNodes: recordingStemNodes.mapValues { $0 as AVAudioNode }
        )
    }

    private static func makeStemSourceNode(
        format: AVAudioFormat,
        productCore: KesshoProductCore,
        maxBlockSize: UInt32,
        state: StemRenderState
    ) -> AVAudioSourceNode {
        AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList in
            guard frameCount <= maxBlockSize else {
                return kAudioUnitErr_TooManyFramesToProcess
            }

            let frames = Int(frameCount)
            for frame in 0..<frames {
                state.left[frame] = 0
                state.right[frame] = 0
            }

            for stemId in state.stemIds {
                let left = UnsafeMutableBufferPointer(start: state.scratchLeft, count: frames)
                let right = UnsafeMutableBufferPointer(start: state.scratchRight, count: frames)
                let result = productCore.getStem(stemId: stemId, left: left, right: right, frames: frames)
                guard result == 1 else {
                    return kAudioUnitErr_CannotDoInCurrentContext
                }
                for frame in 0..<frames {
                    state.left[frame] += state.scratchLeft[frame]
                    state.right[frame] += state.scratchRight[frame]
                }
            }

            let outputBuffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            if outputBuffers.count >= 2 {
                if let leftOut = outputBuffers[0].mData?.assumingMemoryBound(to: Float.self) {
                    leftOut.update(from: state.left, count: frames)
                }
                if let rightOut = outputBuffers[1].mData?.assumingMemoryBound(to: Float.self) {
                    rightOut.update(from: state.right, count: frames)
                }
            } else if outputBuffers.count == 1,
                      outputBuffers[0].mNumberChannels == 2,
                      let interleaved = outputBuffers[0].mData?.assumingMemoryBound(to: Float.self) {
                for frame in 0..<frames {
                    interleaved[frame * 2] = state.left[frame]
                    interleaved[frame * 2 + 1] = state.right[frame]
                }
            } else {
                return kAudioUnitErr_FormatNotSupported
            }

            return noErr
        }
    }

    private static func recordingStemMap() -> [RecordingStem: [UInt32]] {
        [
            .synth: [1, 2],
            .lead: [3, 4, 6],
            .drums: [5],
            .waves: [7],
            .granular: [8],
            .reverb: [8],
        ]
    }

    @discardableResult
    public func manualNoteOn(
        sourceName: String,
        midiNote: Float,
        velocity: Float = 0.85,
        holdSeconds: Float = 0.2,
        sampleOffset: UInt32 = 0
    ) -> Int32 {
        manualNoteOn(
            sourceId: Self.sourceId(for: sourceName),
            midiNote: midiNote,
            velocity: velocity,
            holdSeconds: holdSeconds,
            sampleOffset: sampleOffset
        )
    }

    public static func sourceId(for sourceName: String) -> UInt32 {
        #if canImport(KesshoProductSchema)
        let pad1 = KesshoProductSourceId.pad1.rawValue
        let pad2 = KesshoProductSourceId.pad2.rawValue
        let lead1 = KesshoProductSourceId.lead1.rawValue
        let lead2 = KesshoProductSourceId.lead2.rawValue
        let drum = KesshoProductSourceId.drum.rawValue
        let piano = KesshoProductSourceId.piano.rawValue
        let soundscape = KesshoProductSourceId.soundscape.rawValue
        #else
        let pad1: UInt32 = 1
        let pad2: UInt32 = 2
        let lead1: UInt32 = 3
        let lead2: UInt32 = 4
        let drum: UInt32 = 5
        let piano: UInt32 = 6
        let soundscape: UInt32 = 7
        #endif

        switch sourceName.lowercased() {
        case "pad1", "synth", "synth1", "synth2", "synth3":
            return pad1
        case "pad2", "synth4", "synth5", "synth6":
            return pad2
        case "lead", "lead1":
            return lead1
        case "lead2":
            return lead2
        case "drum":
            return drum
        case "piano":
            return piano
        case "soundscape", "nature", "earth", "ocean":
            return soundscape
        default:
            return lead1
        }
    }
}

public enum KesshoProductCoreAudioEngineError: Error {
    case snapshotLoadFailed(Int32)
}
