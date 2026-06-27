import AVFoundation
import Foundation
import KesshoProductCore
import UIKit

public enum KesshoIOSSimulatorSmokeRunner {
    public static func run(mode: String) -> Bool {
        do {
            let report = try runChecked(mode: mode)
            print(report.summaryLine)
            return true
        } catch {
            fputs("Kessho iOS simulator Product Core smoke failed mode=\(mode): \(error.localizedDescription)\n", stderr)
            return false
        }
    }

    private static func runChecked(mode: String) throws -> IOSSimulatorSmokeReport {
        let isBackgroundMode = mode == "background"
        let session = AVAudioSession.sharedInstance()
        let coordinator = IOSAudioSessionCoordinator(session: session)
        try coordinator.activateForMusicalPlayback()

        let sampleRate = coordinator.actualSampleRate > 0 ? coordinator.actualSampleRate : 48_000
        let bufferDuration = coordinator.actualBufferDuration > 0
            ? coordinator.actualBufferDuration
            : 128.0 / sampleRate

        let probeEngine = KesshoAppleProductAudioEngine(sampleRate: sampleRate, maxBlockSize: 256)
        let probe = try probeEngine.runOfflineOutputProbe()
        let peak = probe["peak"]?.doubleValue ?? 0
        let rms = probe["rms"]?.doubleValue ?? 0
        let renderedFrames = probe["renderedFrames"]?.intValue ?? 0
        guard peak > 0, rms > 0, renderedFrames > 0 else {
            throw SmokeError.runtime("native Product Core offline probe was silent")
        }

        let renderer = IOSProductAudioRenderer()
        try renderer.configure(sampleRate: sampleRate, preferredBufferDuration: bufferDuration)
        try renderer.start()
        guard renderer.isRunning() else {
            throw SmokeError.runtime("native Product Core renderer did not start")
        }

        renderer.handleRouteChange()
        renderer.handleInterruptionBegan()
        let runningAfterInterruptionBegan = renderer.isRunning()
        try renderer.handleInterruptionEnded(shouldResume: true)
        guard renderer.isRunning() else {
            throw SmokeError.runtime("native Product Core renderer did not resume after interruption")
        }

        if isBackgroundMode {
            let center = NotificationCenter.default
            center.post(name: UIApplication.didEnterBackgroundNotification, object: UIApplication.shared)
            center.post(name: UIApplication.protectedDataWillBecomeUnavailableNotification, object: UIApplication.shared)
            center.post(name: UIApplication.protectedDataDidBecomeAvailableNotification, object: UIApplication.shared)
            center.post(name: UIApplication.willEnterForegroundNotification, object: UIApplication.shared)
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }

        let telemetry = renderer.getTelemetry()
        let sessionTelemetry = coordinator.telemetry(audioIsPlaying: true)
        renderer.stop()
        try coordinator.deactivate()

        let backgroundCount = sessionTelemetry["backgroundCount"] as? Int ?? 0
        let foregroundCount = sessionTelemetry["foregroundCount"] as? Int ?? 0
        let protectedUnavailableCount = sessionTelemetry["protectedDataUnavailableCount"] as? Int ?? 0
        let protectedAvailableCount = sessionTelemetry["protectedDataAvailableCount"] as? Int ?? 0
        if isBackgroundMode {
            guard backgroundCount > 0 else {
                throw SmokeError.runtime("background lifecycle notification was not observed")
            }
            guard foregroundCount > 0 else {
                throw SmokeError.runtime("foreground lifecycle notification was not observed")
            }
            guard protectedUnavailableCount > 0, protectedAvailableCount > 0 else {
                throw SmokeError.runtime("protected-data lifecycle notifications were not observed")
            }
        }

        return IOSSimulatorSmokeReport(
            mode: mode,
            sampleRate: sampleRate,
            actualBufferDurationMs: (sessionTelemetry["actualBufferDurationMs"] as? Double) ?? 0,
            peak: peak,
            rms: rms,
            renderedFrames: renderedFrames,
            rendererStartCount: telemetry.startCount,
            rendererStopCount: telemetry.stopCount,
            routeChangeCount: 1,
            interruptionBeginCount: 1,
            interruptionEndCount: 1,
            runningAfterInterruptionBegan: runningAfterInterruptionBegan,
            backgroundCount: backgroundCount,
            foregroundCount: foregroundCount,
            protectedDataUnavailableCount: protectedUnavailableCount,
            protectedDataAvailableCount: protectedAvailableCount
        )
    }
}

private struct IOSSimulatorSmokeReport {
    let mode: String
    let sampleRate: Double
    let actualBufferDurationMs: Double
    let peak: Double
    let rms: Double
    let renderedFrames: Int
    let rendererStartCount: Int
    let rendererStopCount: Int
    let routeChangeCount: Int
    let interruptionBeginCount: Int
    let interruptionEndCount: Int
    let runningAfterInterruptionBegan: Bool
    let backgroundCount: Int
    let foregroundCount: Int
    let protectedDataUnavailableCount: Int
    let protectedDataAvailableCount: Int

    var summaryLine: String {
        [
            "Kessho iOS simulator Product Core smoke passed",
            "mode=\(mode)",
            "sampleRate=\(format(sampleRate))",
            "bufferMs=\(format(actualBufferDurationMs))",
            "peak=\(format(peak))",
            "rms=\(format(rms))",
            "renderedFrames=\(renderedFrames)",
            "rendererStartCount=\(rendererStartCount)",
            "rendererStopCount=\(rendererStopCount)",
            "routeChangeCount=\(routeChangeCount)",
            "interruptionBeginCount=\(interruptionBeginCount)",
            "interruptionEndCount=\(interruptionEndCount)",
            "runningAfterInterruptionBegan=\(runningAfterInterruptionBegan)",
            "backgroundCount=\(backgroundCount)",
            "foregroundCount=\(foregroundCount)",
            "protectedDataUnavailableCount=\(protectedDataUnavailableCount)",
            "protectedDataAvailableCount=\(protectedDataAvailableCount)"
        ].joined(separator: " ")
    }

    private func format(_ value: Double) -> String {
        String(format: "%.6f", value)
    }
}

private enum SmokeError: LocalizedError {
    case runtime(String)

    var errorDescription: String? {
        switch self {
        case .runtime(let message):
            return message
        }
    }
}
