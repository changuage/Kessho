import Foundation

struct IOSRealtimeEventQueueEvent {
    let eventID: UInt64
    let kind: UInt8
    let note: UInt8
    let velocity: UInt8
    let channel: UInt8
    let receivedHostTime: UInt64
    let enqueuedHostTime: UInt64
    let targetSampleTime: UInt64

    static let empty = IOSRealtimeEventQueueEvent(
        eventID: 0,
        kind: 0,
        note: 0,
        velocity: 0,
        channel: 0,
        receivedHostTime: 0,
        enqueuedHostTime: 0,
        targetSampleTime: 0
    )
}

final class IOSRealtimeEventQueue {
    private var storage: [IOSRealtimeEventQueueEvent]
    private var readIndex = 0
    private var writeIndex = 0
    private let capacity: Int

    private(set) var droppedEventCount = 0
    private(set) var enqueuedEventCount = 0
    private(set) var drainedEventCount = 0

    init(capacity: Int = 512) {
        self.capacity = max(2, capacity)
        storage = Array(repeating: .empty, count: self.capacity)
    }

    func enqueue(_ event: IOSRealtimeEventQueueEvent) -> Bool {
        let nextWriteIndex = (writeIndex + 1) % capacity
        if nextWriteIndex == readIndex {
            droppedEventCount += 1
            return false
        }
        storage[writeIndex] = event
        writeIndex = nextWriteIndex
        enqueuedEventCount += 1
        return true
    }

    func drain(maxEvents: Int, into output: inout [IOSRealtimeEventQueueEvent]) -> Int {
        var count = 0
        while readIndex != writeIndex && count < maxEvents {
            output.append(storage[readIndex])
            storage[readIndex] = .empty
            readIndex = (readIndex + 1) % capacity
            count += 1
        }
        drainedEventCount += count
        return count
    }

    func telemetry() -> [String: Any] {
        [
            "capacity": capacity,
            "enqueuedEventCount": enqueuedEventCount,
            "drainedEventCount": drainedEventCount,
            "droppedEventCount": droppedEventCount
        ]
    }
}
