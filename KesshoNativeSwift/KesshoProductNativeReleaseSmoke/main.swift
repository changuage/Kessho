import Foundation
import KesshoNativeCore

private struct RenderFingerprint: Equatable {
    var hash: UInt64
    var peak: Float
    var rms: Float
    var stemPeak: Float
    var firstAudibleMasterBlock: Int
    var firstAudibleStemBlock: Int
}

private let frameCount = 128
private let blockCount = 96
private let sourcePad1: UInt32 = 1
private let stemPad1: UInt32 = 1
private let audibleThreshold: Float = 0.00001
private let expectedHash: UInt64 = 1_579_872_048_537_521_951
private let expectedPeak: Float = 0.008_101_273
private let expectedRms: Float = 0.003_727_890_3
private let expectedStemPeak: Float = 0.009_092_237

private func fail(_ message: String, code: Int32) -> Never {
    fputs("Kessho Product native release smoke failed: \(message)\n", stderr)
    exit(code)
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String, code: Int32) {
    if !condition() {
        fail(message, code: code)
    }
}

private func hashFloat(_ value: Float, into hash: inout UInt64) {
    hash ^= UInt64(value.bitPattern)
    hash &*= 1_099_511_628_211
}

private func renderScenario() throws -> RenderFingerprint {
    let snapshot = KesshoProductCoreSnapshotEncoder.encode(.defaultState, running: true)
    require(KesshoProductCoreSnapshotEncoder.validateEncodedSnapshot(snapshot), "snapshot validation failed", code: 2)

    let core = try KesshoProductCore(sampleRate: 48_000, maxBlockSize: UInt32(frameCount))
    require(core.loadSnapshot(snapshot) == 1, "snapshot load failed", code: 3)
    require(core.start() == 1, "start event was rejected", code: 4)
    require(
        core.manualNoteOn(sourceId: sourcePad1, midiNote: 60, velocity: 0.72, holdSeconds: 0.45) == 1,
        "manual Pad1 note was rejected",
        code: 5
    )

    var hash: UInt64 = 14_695_981_039_346_656_037
    var peak: Float = 0
    var sumSquares = Double(0)
    var sampleCount = 0
    var stemPeak: Float = 0
    var firstAudibleMasterBlock = -1
    var firstAudibleStemBlock = -1

    var left = [Float](repeating: 0, count: frameCount)
    var right = [Float](repeating: 0, count: frameCount)
    var stemLeft = [Float](repeating: 0, count: frameCount)
    var stemRight = [Float](repeating: 0, count: frameCount)

    for block in 0..<blockCount {
        let renderStatus = left.withUnsafeMutableBufferPointer { leftBuffer in
            right.withUnsafeMutableBufferPointer { rightBuffer in
                core.render(left: leftBuffer, right: rightBuffer, frames: frameCount)
            }
        }
        require(renderStatus == 1, "render failed at block \(block)", code: 6)

        let stemStatus = stemLeft.withUnsafeMutableBufferPointer { leftBuffer in
            stemRight.withUnsafeMutableBufferPointer { rightBuffer in
                core.getStem(stemId: stemPad1, left: leftBuffer, right: rightBuffer, frames: frameCount)
            }
        }
        require(stemStatus == 1, "stem read failed at block \(block)", code: 7)

        var blockPeak: Float = 0
        var blockStemPeak: Float = 0
        for frame in 0..<frameCount {
            let l = left[frame]
            let r = right[frame]
            let sl = stemLeft[frame]
            let sr = stemRight[frame]
            require(l.isFinite && r.isFinite && sl.isFinite && sr.isFinite, "non-finite native render sample", code: 8)
            hashFloat(l, into: &hash)
            hashFloat(r, into: &hash)
            blockPeak = max(blockPeak, abs(l), abs(r))
            blockStemPeak = max(blockStemPeak, abs(sl), abs(sr))
            sumSquares += Double(l * l + r * r)
            sampleCount += 2
        }

        if firstAudibleMasterBlock < 0 && blockPeak > audibleThreshold {
            firstAudibleMasterBlock = block
        }
        if firstAudibleStemBlock < 0 && blockStemPeak > audibleThreshold {
            firstAudibleStemBlock = block
        }
        peak = max(peak, blockPeak)
        stemPeak = max(stemPeak, blockStemPeak)
    }

    return RenderFingerprint(
        hash: hash,
        peak: peak,
        rms: Float(sqrt(sumSquares / Double(sampleCount))),
        stemPeak: stemPeak,
        firstAudibleMasterBlock: firstAudibleMasterBlock,
        firstAudibleStemBlock: firstAudibleStemBlock
    )
}

private func nearlyEqual(_ lhs: Float, _ rhs: Float, tolerance: Float) -> Bool {
    abs(lhs - rhs) <= tolerance
}

do {
    let first = try renderScenario()
    let second = try renderScenario()
    require(first == second, "native offline render is not deterministic: \(first) vs \(second)", code: 9)
    require(first.peak > audibleThreshold, "native offline render stayed silent", code: 10)
    require(first.stemPeak > audibleThreshold, "native Pad1 stem stayed silent", code: 11)
    require(
        first.firstAudibleMasterBlock == first.firstAudibleStemBlock,
        "master/stem timing diverged: master block \(first.firstAudibleMasterBlock), stem block \(first.firstAudibleStemBlock)",
        code: 12
    )
    require(first.hash == expectedHash, "native offline golden hash changed: \(first)", code: 13)
    require(nearlyEqual(first.peak, expectedPeak, tolerance: 0.000_001), "native offline peak changed: \(first)", code: 14)
    require(nearlyEqual(first.rms, expectedRms, tolerance: 0.000_001), "native offline RMS changed: \(first)", code: 15)
    require(
        nearlyEqual(first.stemPeak, expectedStemPeak, tolerance: 0.000_001),
        "native offline stem peak changed: \(first)",
        code: 16
    )
    print(
        "Kessho Product native release smoke passed: hash=\(first.hash) peak=\(first.peak) rms=\(first.rms) stemPeak=\(first.stemPeak) firstAudibleBlock=\(first.firstAudibleMasterBlock)"
    )
} catch {
    fail("threw \(error)", code: 17)
}
