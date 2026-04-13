import AVFoundation
import Foundation

/// Owns the app's audio session policy and forwards session lifecycle events.
///
/// This service is intentionally separate from the audio engine so the iOS
/// app can evolve background playback, interruption handling, and route-change
/// behavior without coupling that logic to DSP code.
public final class AudioSessionManager {
    public static let shared = AudioSessionManager()

    private let session = AVAudioSession.sharedInstance()
    private var observers: [NSObjectProtocol] = []

    public private(set) var isConfigured = false
    public private(set) var isActive = false

    private init() {}

    deinit {
        removeObservers()
    }

    /// Configure the session for long-running ambient playback.
    ///
    /// The default policy is playback + mixWithOthers so the app can continue
    /// under lock screen and coexist with other audio where appropriate.
    public func configureForPlayback(
        preferredSampleRate: Double? = nil,
        preferredIOBufferDuration: TimeInterval? = nil,
        mixWithOthers: Bool = true
    ) throws {
        let options: AVAudioSession.CategoryOptions = mixWithOthers ? [.mixWithOthers] : []
        try session.setCategory(.playback, mode: .default, options: options)

        if let preferredSampleRate {
            try session.setPreferredSampleRate(preferredSampleRate)
        }

        if let preferredIOBufferDuration {
            try session.setPreferredIOBufferDuration(preferredIOBufferDuration)
        }

        installObserversIfNeeded()
        isConfigured = true
    }

    /// Activate the shared audio session.
    public func activate() throws {
        if !isConfigured {
            try configureForPlayback()
        }

        try session.setActive(true)
        isActive = true
        let outputs = session.currentRoute.outputs.map { output in
            "\(output.portType.rawValue):\(output.portName)"
        }.joined(separator: ", ")
        print(
            "AudioSession route:",
            outputs.isEmpty ? "none" : outputs,
            "sampleRate=\(session.sampleRate)",
            "ioBuffer=\(session.ioBufferDuration)",
            "outputVolume=\(session.outputVolume)"
        )
        NotificationCenter.default.post(name: AudioServiceNotification.didActivate, object: self)
    }

    /// Deactivate the shared audio session.
    public func deactivate(options: AVAudioSession.SetActiveOptions = []) throws {
        try session.setActive(false, options: options)
        isActive = false
        NotificationCenter.default.post(name: AudioServiceNotification.didDeactivate, object: self)
    }

    /// Re-run the standard playback configuration after route or app state changes.
    public func reconfigureForPlayback(
        preferredSampleRate: Double? = nil,
        preferredIOBufferDuration: TimeInterval? = nil,
        mixWithOthers: Bool = true
    ) throws {
        isConfigured = false
        try configureForPlayback(
            preferredSampleRate: preferredSampleRate,
            preferredIOBufferDuration: preferredIOBufferDuration,
            mixWithOthers: mixWithOthers
        )
    }

    /// Return the current shared audio session for diagnostics.
    public func currentSession() -> AVAudioSession {
        session
    }

    private func installObserversIfNeeded() {
        guard observers.isEmpty else { return }

        let center = NotificationCenter.default
        observers.append(
            center.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: session,
                queue: .main
            ) { [weak self] notification in
                self?.handleInterruption(notification)
            }
        )

        observers.append(
            center.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: session,
                queue: .main
            ) { [weak self] notification in
                self?.handleRouteChange(notification)
            }
        )
    }

    private func removeObservers() {
        let center = NotificationCenter.default
        for observer in observers {
            center.removeObserver(observer)
        }
        observers.removeAll()
    }

    private func handleInterruption(_ notification: Notification) {
        guard
            let userInfo = notification.userInfo,
            let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let interruptionType = AVAudioSession.InterruptionType(rawValue: typeValue)
        else {
            return
        }

        switch interruptionType {
        case .began:
            NotificationCenter.default.post(
                name: AudioServiceNotification.interruptionBegan,
                object: self,
                userInfo: [
                    AudioServiceUserInfoKey.interruptionType: interruptionType.rawValue
                ]
            )
            isActive = false

        case .ended:
            let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)

            NotificationCenter.default.post(
                name: AudioServiceNotification.interruptionEnded,
                object: self,
                userInfo: [
                    AudioServiceUserInfoKey.interruptionType: interruptionType.rawValue,
                    AudioServiceUserInfoKey.interruptionOptions: options.rawValue
                ]
            )

            if options.contains(.shouldResume) {
                do {
                    try session.setActive(true)
                    isActive = true
                } catch {
                    print("AudioSessionManager: failed to resume after interruption: \(error)")
                }
            }

        @unknown default:
            break
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard
            let userInfo = notification.userInfo,
            let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        else {
            return
        }

        NotificationCenter.default.post(
            name: AudioServiceNotification.routeChanged,
            object: self,
            userInfo: [
                AudioServiceUserInfoKey.routeChangeReason: reason.rawValue
            ]
        )
    }
}
