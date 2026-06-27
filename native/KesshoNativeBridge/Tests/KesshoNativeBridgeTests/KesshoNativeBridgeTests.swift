import XCTest
@testable import KesshoNativeBridge

final class KesshoNativeBridgeTests: XCTestCase {
    func testAllowsKnownPluginMethod() throws {
        let request = try KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: [
            "id": "1",
            "plugin": "KesshoMidiRouting",
            "method": "connectInput",
            "options": ["uniqueID": 42],
        ])

        XCTAssertEqual(request.id, "1")
        XCTAssertEqual(request.plugin, "KesshoMidiRouting")
        XCTAssertEqual(request.method, "connectInput")
        XCTAssertEqual(request.options["uniqueID"] as? Int, 42)
    }

    func testRejectsUnknownPlugin() {
        XCTAssertThrowsError(try KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: [
            "id": "1",
            "plugin": "FileSystem",
            "method": "readFile",
            "options": [:],
        ])) { error in
            XCTAssertEqual(error as? KesshoNativeBridgeValidationError, .unknownPlugin("FileSystem"))
        }
    }

    func testRejectsUnknownMethod() {
        XCTAssertThrowsError(try KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: [
            "id": "1",
            "plugin": "KesshoAudioSession",
            "method": "debugDumpEverything",
            "options": [:],
        ])) { error in
            XCTAssertEqual(
                error as? KesshoNativeBridgeValidationError,
                .unknownMethod(plugin: "KesshoAudioSession", method: "debugDumpEverything")
            )
        }
    }

    func testRejectsOversizedOptions() {
        XCTAssertThrowsError(try KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: [
            "id": "1",
            "plugin": "KesshoMidiRouting",
            "method": "connectInput",
            "options": ["payload": String(repeating: "x", count: 2048)],
        ])) { error in
            guard case .optionsPayloadTooLarge(let plugin, let method, _, let maxBytes) = error as? KesshoNativeBridgeValidationError else {
                return XCTFail("Expected oversized payload error, got \(error)")
            }
            XCTAssertEqual(plugin, "KesshoMidiRouting")
            XCTAssertEqual(method, "connectInput")
            XCTAssertEqual(maxBytes, 1024)
        }
    }

    func testRejectsNonObjectOptions() {
        XCTAssertThrowsError(try KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: [
            "id": "1",
            "plugin": "KesshoMidiRouting",
            "method": "start",
            "options": ["not", "an", "object"],
        ])) { error in
            XCTAssertEqual(error as? KesshoNativeBridgeValidationError, .invalidOptions)
        }
    }

    func testBackgroundLifecycleThrottlesVisualTelemetry() {
        let playing = KesshoNativeLifecyclePolicy.policy(for: .didEnterBackground, audioIsPlaying: true)
        XCTAssertTrue(playing.audioMayContinue)
        XCTAssertTrue(playing.throttleVisualTelemetry)
        XCTAssertFalse(playing.requestSuspendAfterGracePeriod)

        let idle = KesshoNativeLifecyclePolicy.policy(for: .didEnterBackground, audioIsPlaying: false)
        XCTAssertFalse(idle.audioMayContinue)
        XCTAssertTrue(idle.throttleVisualTelemetry)
        XCTAssertTrue(idle.requestSuspendAfterGracePeriod)
    }

    func testInterruptionEndedLifecycleCanRequestPrewarm() {
        let shouldResume = KesshoNativeLifecyclePolicy.policy(for: .audioInterruptionEnded, shouldResume: true)
        XCTAssertTrue(shouldResume.audioMayContinue)
        XCTAssertTrue(shouldResume.requestPrewarm)
        XCTAssertFalse(shouldResume.requestSuspendAfterGracePeriod)

        let shouldStaySuspended = KesshoNativeLifecyclePolicy.policy(for: .audioInterruptionEnded, shouldResume: false)
        XCTAssertFalse(shouldStaySuspended.audioMayContinue)
        XCTAssertFalse(shouldStaySuspended.requestPrewarm)
        XCTAssertTrue(shouldStaySuspended.requestSuspendAfterGracePeriod)
    }
}
