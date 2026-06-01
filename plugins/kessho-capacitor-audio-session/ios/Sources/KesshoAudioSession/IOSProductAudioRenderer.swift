import Foundation
import KesshoProductCore

struct NativeRendererTelemetry {
    let sampleRate: Double
    let maxBlockSize: UInt32
    let isPrepared: Bool
    let isRunning: Bool
    let startCount: Int
    let stopCount: Int
    let underrunCount: Int
    let droppedMidiEventCount: Int

    var dictionary: [String: Any] {
        [
            "sampleRate": sampleRate,
            "maxBlockSize": Int(maxBlockSize),
            "isPrepared": isPrepared,
            "isRunning": isRunning,
            "startCount": startCount,
            "stopCount": stopCount,
            "underrunCount": underrunCount,
            "droppedMidiEventCount": droppedMidiEventCount
        ]
    }
}

final class IOSProductAudioRenderer {
    private var engine: KesshoAppleProductAudioEngine?
    private var sampleRate: Double = 48_000
    private var maxBlockSize: UInt32 = 128

    private(set) var isPrepared = false
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var underrunCount = 0
    private(set) var droppedMidiEventCount = 0
    private(set) var lastErrorMessage = "none"

    func configure(sampleRate: Double, preferredBufferDuration: TimeInterval) throws {
        self.sampleRate = sampleRate > 0 ? sampleRate : 48_000
        let frames = UInt32(max(64, min(1_024, Int((preferredBufferDuration * self.sampleRate).rounded()))))
        maxBlockSize = frames
        engine = KesshoAppleProductAudioEngine(sampleRate: self.sampleRate, maxBlockSize: maxBlockSize)
        isPrepared = engine != nil
    }

    func loadSnapshot(_ snapshotData: Data) throws {
        if snapshotData.isEmpty {
            lastErrorMessage = "snapshotData is empty; native render prep keeps snapshot loading gated"
            return
        }
        lastErrorMessage = "snapshot loading requires shared Product snapshot contract"
    }

    func enqueueProductEvent(_ eventData: Data) throws {
        if eventData.isEmpty {
            droppedMidiEventCount += 1
            lastErrorMessage = "empty eventData dropped"
        }
    }

    func start() throws {
        guard let engine else {
            lastErrorMessage = "renderer not configured"
            throw NSError(domain: "IOSProductAudioRenderer", code: 1, userInfo: [NSLocalizedDescriptionKey: lastErrorMessage])
        }
        try engine.start()
        startCount += 1
        lastErrorMessage = "none"
    }

    func stop() {
        engine?.stop()
        stopCount += 1
    }

    func isRunning() -> Bool {
        engine?.isRunning() ?? false
    }

    func handleInterruptionBegan() {
        engine?.handleInterruptionBegan()
    }

    func handleInterruptionEnded(shouldResume: Bool) throws {
        try engine?.handleInterruptionEndedShouldResume(shouldResume)
    }

    func handleRouteChange() {
        engine?.handleRouteChange()
    }

    func getTelemetry() -> NativeRendererTelemetry {
        NativeRendererTelemetry(
            sampleRate: sampleRate,
            maxBlockSize: maxBlockSize,
            isPrepared: isPrepared,
            isRunning: isRunning(),
            startCount: startCount,
            stopCount: stopCount,
            underrunCount: underrunCount,
            droppedMidiEventCount: droppedMidiEventCount
        )
    }
}
