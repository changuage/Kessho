import AVFoundation
import Foundation
#if canImport(UIKit)
import UIKit
#endif

final class IOSAudioSessionCoordinator {
    private let session: AVAudioSession

    private(set) var preferredSampleRate: Double = 48_000
    private(set) var preferredBufferDuration: TimeInterval = 128.0 / 48_000.0
    private(set) var actualSampleRate: Double = 0
    private(set) var actualBufferDuration: TimeInterval = 0
    private(set) var foregroundCount = 0
    private(set) var backgroundCount = 0
    private(set) var protectedDataUnavailableCount = 0
    private(set) var protectedDataAvailableCount = 0
    private(set) var lastAppLifecycleEvent = "none"

    private var notificationObservers: [NSObjectProtocol] = []

    init(session: AVAudioSession = .sharedInstance()) {
        self.session = session
        observeAppLifecycle()
    }

    deinit {
        for observer in notificationObservers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    func activateForMusicalPlayback(
        preferredSampleRate: Double = 48_000,
        preferredBufferDuration: TimeInterval = 128.0 / 48_000.0
    ) throws {
        self.preferredSampleRate = preferredSampleRate
        self.preferredBufferDuration = preferredBufferDuration

        try session.setCategory(.playback, mode: .default, options: [])
        try session.setPreferredSampleRate(preferredSampleRate)
        try session.setPreferredIOBufferDuration(preferredBufferDuration)
        try session.setActive(true)
        captureActualValues()
    }

    func deactivate() throws {
        try session.setActive(false, options: [.notifyOthersOnDeactivation])
        captureActualValues()
    }

    func captureActualValues() {
        actualSampleRate = session.sampleRate
        actualBufferDuration = session.ioBufferDuration
    }

    func routeSummary() -> String {
        let outputs = session.currentRoute.outputs.map { output in
            "\(output.portType.rawValue):\(output.portName)"
        }
        return outputs.isEmpty ? "none" : outputs.joined(separator: ", ")
    }

    func telemetry() -> [String: Any] {
        captureActualValues()
        return [
            "preferredSampleRate": preferredSampleRate,
            "preferredBufferDurationMs": preferredBufferDuration * 1_000,
            "actualSampleRate": actualSampleRate,
            "actualBufferDurationMs": actualBufferDuration * 1_000,
            "actualBufferSizeFrames": actualSampleRate > 0 ? Int((actualBufferDuration * actualSampleRate).rounded()) : 0,
            "routeSummary": routeSummary(),
            "silentSwitchPolicy": "AVAudioSessionCategoryPlayback",
            "foregroundCount": foregroundCount,
            "backgroundCount": backgroundCount,
            "protectedDataUnavailableCount": protectedDataUnavailableCount,
            "protectedDataAvailableCount": protectedDataAvailableCount,
            "lastAppLifecycleEvent": lastAppLifecycleEvent
        ]
    }

    private func observeAppLifecycle() {
#if canImport(UIKit)
        let center = NotificationCenter.default
        notificationObservers.append(center.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.foregroundCount += 1
            self?.lastAppLifecycleEvent = "willEnterForeground"
            self?.captureActualValues()
        })
        notificationObservers.append(center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.backgroundCount += 1
            self?.lastAppLifecycleEvent = "didEnterBackground"
            self?.captureActualValues()
        })
        notificationObservers.append(center.addObserver(
            forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.protectedDataUnavailableCount += 1
            self?.lastAppLifecycleEvent = "protectedDataWillBecomeUnavailable"
        })
        notificationObservers.append(center.addObserver(
            forName: UIApplication.protectedDataDidBecomeAvailableNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.protectedDataAvailableCount += 1
            self?.lastAppLifecycleEvent = "protectedDataDidBecomeAvailable"
        })
#else
        lastAppLifecycleEvent = "unavailable"
#endif
    }
}
