import Foundation
import KesshoNativeCore

let snapshot = KesshoProductCoreSnapshotEncoder.encode(.defaultState, running: true)
guard KesshoProductCoreSnapshotEncoder.validateEncodedSnapshot(snapshot) else {
    fputs("Kessho Product Swift snapshot validation failed\n", stderr)
    exit(2)
}

do {
    let core = try KesshoProductCore(sampleRate: 48_000, maxBlockSize: 128)
    guard core.loadSnapshot(snapshot) == 1 else {
        fputs("Kessho Product Swift snapshot load failed\n", stderr)
        exit(3)
    }

    var left = [Float](repeating: 0, count: 128)
    var right = [Float](repeating: 0, count: 128)
    let renderStatus = left.withUnsafeMutableBufferPointer { leftBuffer in
        right.withUnsafeMutableBufferPointer { rightBuffer in
            core.render(left: leftBuffer, right: rightBuffer, frames: 128)
        }
    }
    guard renderStatus == 1 else {
        fputs("Kessho Product Swift snapshot render failed\n", stderr)
        exit(4)
    }
} catch {
    fputs("Kessho Product Swift snapshot smoke threw: \(error)\n", stderr)
    exit(5)
}

print("Kessho Product Swift snapshot smoke passed")
