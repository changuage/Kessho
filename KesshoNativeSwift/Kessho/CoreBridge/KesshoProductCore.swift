import Foundation

#if canImport(KesshoProductCoreBridge)
import KesshoProductCoreBridge
#endif

#if canImport(KesshoProductSchema)
import KesshoProductSchema
#endif

public enum KesshoProductCoreError: Error {
    case createFailed
    case invalidAssetBuffer
}

public struct KesshoProductCoreEvent {
    public var sampleOffset: UInt32
    public var kind: UInt32
    public var targetId: UInt32
    public var index: UInt32
    public var paramId: UInt32
    public var value: Float
    public var value2: Float
    public var value3: Float
    public var value4: Float
    public var flags: UInt32

    public init(
        sampleOffset: UInt32 = 0,
        kind: UInt32,
        targetId: UInt32 = 0,
        index: UInt32 = 0,
        paramId: UInt32 = 0,
        value: Float = 0,
        value2: Float = 0,
        value3: Float = 0,
        value4: Float = 0,
        flags: UInt32 = 0
    ) {
        self.sampleOffset = sampleOffset
        self.kind = kind
        self.targetId = targetId
        self.index = index
        self.paramId = paramId
        self.value = value
        self.value2 = value2
        self.value3 = value3
        self.value4 = value4
        self.flags = flags
    }
}

public final class KesshoProductCore {
    private let handle: KesshoNativeProductCoreHandle

    public static var abiVersion: Int32 {
        kessho_native_product_get_abi_version()
    }

    public static var capabilityReport: KesshoNativeProductCapabilityReport {
        kessho_native_product_get_capability_report()
    }

    public static var schemaHash: UInt32 {
        #if canImport(KesshoProductSchema)
        return KesshoProductSchema.hash
        #else
        return kessho_native_product_get_capability_report().schema_hash
        #endif
    }

    public init(sampleRate: Double, maxBlockSize: UInt32 = 128, flags: UInt32 = 0) throws {
        guard let created = kessho_native_product_create(sampleRate, maxBlockSize, flags) else {
            throw KesshoProductCoreError.createFailed
        }
        handle = created
    }

    deinit {
        kessho_native_product_destroy(handle)
    }

    public func reset() {
        kessho_native_product_reset(handle)
    }

    @discardableResult
    public func loadSnapshot(_ snapshotBytes: Data) -> Int32 {
        snapshotBytes.withUnsafeBytes { rawBuffer in
            guard let baseAddress = rawBuffer.baseAddress else {
                return Int32(-2)
            }
            return kessho_native_product_load_snapshot(
                handle,
                baseAddress,
                UInt32(rawBuffer.count)
            )
        }
    }

    @discardableResult
    public func enqueue(_ event: KesshoProductCoreEvent) -> Int32 {
        kessho_native_product_enqueue_event(
            handle,
            event.sampleOffset,
            event.kind,
            event.targetId,
            event.index,
            event.paramId,
            event.value,
            event.value2,
            event.value3,
            event.value4,
            event.flags
        )
    }

    @discardableResult
    public func start(sampleOffset: UInt32 = 0) -> Int32 {
        enqueue(KesshoProductCoreEvent(sampleOffset: sampleOffset, kind: Self.eventStart))
    }

    @discardableResult
    public func stop(sampleOffset: UInt32 = 0) -> Int32 {
        enqueue(KesshoProductCoreEvent(sampleOffset: sampleOffset, kind: Self.eventStop))
    }

    @discardableResult
    public func setParam(
        _ paramId: UInt32,
        value: Float,
        targetId: UInt32 = 0,
        index: UInt32 = 0,
        sampleOffset: UInt32 = 0
    ) -> Int32 {
        enqueue(
            KesshoProductCoreEvent(
                sampleOffset: sampleOffset,
                kind: Self.eventSetParam,
                targetId: targetId,
                index: index,
                paramId: paramId,
                value: value
            )
        )
    }

    @discardableResult
    public func manualNoteOn(
        sourceId: UInt32,
        midiNote: Float,
        velocity: Float = 0.85,
        holdSeconds: Float = 0.2,
        sampleOffset: UInt32 = 0
    ) -> Int32 {
        enqueue(
            KesshoProductCoreEvent(
                sampleOffset: sampleOffset,
                kind: Self.eventManualNoteOn,
                targetId: sourceId,
                value: midiNote,
                value2: velocity,
                value3: holdSeconds
            )
        )
    }

    @discardableResult
    public func manualNoteOff(sourceId: UInt32, sampleOffset: UInt32 = 0) -> Int32 {
        enqueue(
            KesshoProductCoreEvent(
                sampleOffset: sampleOffset,
                kind: Self.eventManualNoteOff,
                targetId: sourceId
            )
        )
    }

    @discardableResult
    public func render(
        left: UnsafeMutableBufferPointer<Float>,
        right: UnsafeMutableBufferPointer<Float>,
        frames: Int
    ) -> Int32 {
        precondition(frames >= 0)
        precondition(frames <= left.count)
        precondition(frames <= right.count)
        guard let leftBase = left.baseAddress, let rightBase = right.baseAddress else {
            return Int32(-1)
        }
        return kessho_native_product_render(handle, leftBase, rightBase, UInt32(frames))
    }

    @discardableResult
    public func getStem(
        stemId: UInt32,
        left: UnsafeMutableBufferPointer<Float>,
        right: UnsafeMutableBufferPointer<Float>,
        frames: Int
    ) -> Int32 {
        precondition(frames >= 0)
        precondition(frames <= left.count)
        precondition(frames <= right.count)
        guard let leftBase = left.baseAddress, let rightBase = right.baseAddress else {
            return Int32(-1)
        }
        return kessho_native_product_get_stem(handle, stemId, leftBase, rightBase, UInt32(frames))
    }

    public func telemetry() -> KesshoNativeProductTelemetry {
        kessho_native_product_get_telemetry(handle)
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
        guard channelCount > 0, channelCount <= 2 else {
            throw KesshoProductCoreError.invalidAssetBuffer
        }
        guard pcm.count >= Int(frameCount * channelCount) else {
            throw KesshoProductCoreError.invalidAssetBuffer
        }
        return pcm.withUnsafeBufferPointer { buffer in
            guard let baseAddress = buffer.baseAddress else {
                return Int32(-13)
            }
            return kessho_native_product_register_interleaved_asset(
                handle,
                assetId,
                baseAddress,
                frameCount,
                channelCount,
                sampleRate,
                flags
            )
        }
    }

    @discardableResult
    public func unregisterAsset(id assetId: UInt32) -> Int32 {
        kessho_native_product_unregister_asset(handle, assetId)
    }

    private static var eventSetParam: UInt32 {
        #if canImport(KesshoProductSchema)
        return KesshoProductEventId.setParam.rawValue
        #else
        return 1
        #endif
    }

    private static var eventStart: UInt32 {
        #if canImport(KesshoProductSchema)
        return KesshoProductEventId.start.rawValue
        #else
        return 3
        #endif
    }

    private static var eventStop: UInt32 {
        #if canImport(KesshoProductSchema)
        return KesshoProductEventId.stop.rawValue
        #else
        return 4
        #endif
    }

    private static var eventManualNoteOn: UInt32 {
        #if canImport(KesshoProductSchema)
        return KesshoProductEventId.manualNoteOn.rawValue
        #else
        return 14
        #endif
    }

    private static var eventManualNoteOff: UInt32 {
        #if canImport(KesshoProductSchema)
        return KesshoProductEventId.manualNoteOff.rawValue
        #else
        return 15
        #endif
    }
}
