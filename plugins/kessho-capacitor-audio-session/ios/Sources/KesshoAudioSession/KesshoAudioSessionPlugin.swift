import AVFoundation
import Capacitor
import Foundation
import KesshoNativeBridge
import KesshoProductCore
import MediaPlayer
import UIKit

private struct KesshoNowPlayingMetadata {
    var title: String
    var artist: String
    var album: String
    var elapsedTime: TimeInterval
    var isLiveStream: Bool

    static let `default` = KesshoNowPlayingMetadata(
        title: "Generative Ambient",
        artist: "Kessho",
        album: "Kessho Capacitor",
        elapsedTime: 0,
        isLiveStream: true
    )
}

private final class KesshoCapacitorAudioSessionHost {
    private let session = AVAudioSession.sharedInstance()
    private let iosAudioSessionCoordinator = IOSAudioSessionCoordinator()
    private let commandCenter = MPRemoteCommandCenter.shared()
    private var remoteTargets: [(command: MPRemoteCommand, target: Any)] = []
    private var notificationObservers: [NSObjectProtocol] = []
    private var nowPlaying = KesshoNowPlayingMetadata.default
    private var nativeProductEngine: KesshoAppleProductAudioEngine?
    private var iosProductAudioRendererPrep = IOSProductAudioRenderer()

    private(set) var isPlaying = false
    private(set) var nativeProductRendererPrepared = false
    private(set) var nativeProductRendererRunning = false
    private(set) var nativeProductRendererStartCount = 0
    private(set) var nativeProductRendererStopCount = 0
    private(set) var nativeProductRendererProbePeak = 0.0
    private(set) var nativeProductRendererProbeRms = 0.0
    private(set) var nativeProductRendererProbeRenderedFrames = 0
    private(set) var lastNativeProductRendererError = "none"
    private(set) var routeChangeCount = 0
    private(set) var interruptionBeginCount = 0
    private(set) var interruptionEndCount = 0
    private(set) var mediaServicesResetCount = 0
    private(set) var lastRouteChangeReason = "none"
    private(set) var lastInterruptionType = "none"

    var onRemoteCommand: ((String) -> Void)?
    var onAudioSessionEvent: (([String: Any]) -> Void)?

    init() {
        configureRemoteCommands()
        observeAudioSessionNotifications()
    }

    deinit {
        for remoteTarget in remoteTargets {
            remoteTarget.command.removeTarget(remoteTarget.target)
        }
        for observer in notificationObservers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    func syncWebState() {
        // The React/WebAudio engine owns sound generation; this bridge owns platform session state only.
    }

    func prepareNativeProductRenderer(sampleRate: Double = 44_100, maxBlockSize: UInt32 = 256) {
        if nativeProductEngine == nil {
            nativeProductEngine = KesshoAppleProductAudioEngine(sampleRate: sampleRate, maxBlockSize: maxBlockSize)
        }
        do {
            try iosProductAudioRendererPrep.configure(
                sampleRate: sampleRate,
                preferredBufferDuration: TimeInterval(maxBlockSize) / max(sampleRate, 1)
            )
        } catch {
            lastNativeProductRendererError = "\(error)"
        }
        nativeProductRendererPrepared = nativeProductEngine != nil
    }

    func start(nowPlaying: KesshoNowPlayingMetadata?) throws {
        if let nowPlaying {
            self.nowPlaying = nowPlaying
        }

        try ensureSessionActive()
        isPlaying = true
        updateNowPlaying(isPlaying: true)
    }

    func startNativeProductRendererForDiagnostics() throws {
        prepareNativeProductRenderer(sampleRate: session.sampleRate > 0 ? session.sampleRate : 44_100, maxBlockSize: 256)
        guard let nativeProductEngine else {
            lastNativeProductRendererError = "native Product Core engine unavailable"
            throw NSError(
                domain: "KesshoCapacitorAudioSessionHost",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: lastNativeProductRendererError]
            )
        }
        try ensureSessionActive()
        do {
            try nativeProductEngine.primeDiagnosticOutput()
            try nativeProductEngine.start()
            nativeProductRendererRunning = nativeProductEngine.isRunning()
            nativeProductRendererStartCount += 1
            lastNativeProductRendererError = "none"
        } catch {
            nativeProductRendererRunning = false
            lastNativeProductRendererError = "\(error)"
            throw error
        }
    }

    func stop() {
        isPlaying = false
        stopNativeProductRendererForDiagnostics()
        updateNowPlaying(isPlaying: false)

        do {
            try iosAudioSessionCoordinator.deactivate()
        } catch {
            print("KesshoCapacitorAudioSessionHost: failed to deactivate audio session: \(error)")
        }
    }

    func stopNativeProductRendererForDiagnostics() {
        nativeProductEngine?.stop()
        nativeProductRendererRunning = false
        nativeProductRendererStopCount += 1
    }

    func probeNativeProductRendererForDiagnostics() throws -> [String: Any] {
        if nativeProductRendererRunning {
            lastNativeProductRendererError = "stop native Product Core renderer before offline probe"
            throw NSError(
                domain: "KesshoCapacitorAudioSessionHost",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: lastNativeProductRendererError]
            )
        }
        prepareNativeProductRenderer(sampleRate: session.sampleRate > 0 ? session.sampleRate : 44_100, maxBlockSize: 256)
        guard let nativeProductEngine else {
            lastNativeProductRendererError = "native Product Core engine unavailable"
            throw NSError(
                domain: "KesshoCapacitorAudioSessionHost",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: lastNativeProductRendererError]
            )
        }
        do {
            let result = try nativeProductEngine.runOfflineOutputProbe()
            nativeProductRendererProbePeak = result["peak"]?.doubleValue ?? 0
            nativeProductRendererProbeRms = result["rms"]?.doubleValue ?? 0
            nativeProductRendererProbeRenderedFrames = result["renderedFrames"]?.intValue ?? 0
            lastNativeProductRendererError = "none"
            return [
                "nativeProductRendererPrepared": nativeProductRendererPrepared,
                "nativeProductRendererRunning": nativeProductRendererRunning,
                "nativeProductRendererProbePeak": nativeProductRendererProbePeak,
                "nativeProductRendererProbeRms": nativeProductRendererProbeRms,
                "nativeProductRendererProbeRenderedFrames": nativeProductRendererProbeRenderedFrames,
                "nativeProductRendererProbeSampleRate": result["sampleRate"]?.doubleValue ?? 0
            ]
        } catch {
            lastNativeProductRendererError = "\(error)"
            throw error
        }
    }

    func updateNowPlaying(_ metadata: KesshoNowPlayingMetadata, isPlaying: Bool? = nil) {
        nowPlaying = metadata
        updateNowPlaying(isPlaying: isPlaying ?? self.isPlaying)
    }

    func setPlaybackState(isPlaying: Bool) {
        self.isPlaying = isPlaying
        if isPlaying {
            do {
                try ensureSessionActive()
            } catch {
                print("KesshoCapacitorAudioSessionHost: failed to activate audio session: \(error)")
            }
        }
        updateNowPlaying(isPlaying: isPlaying)
    }

    private func ensureSessionActive() throws {
        try iosAudioSessionCoordinator.activateForMusicalPlayback(
            preferredSampleRate: 48_000,
            preferredBufferDuration: 128.0 / 48_000.0
        )
    }

    private func updateNowPlaying(isPlaying: Bool) {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: nowPlaying.title,
            MPMediaItemPropertyArtist: nowPlaying.artist,
            MPMediaItemPropertyAlbumTitle: nowPlaying.album,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: nowPlaying.elapsedTime,
            MPNowPlayingInfoPropertyIsLiveStream: nowPlaying.isLiveStream,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
    }

    private func configureRemoteCommands() {
        addRemoteTarget(commandCenter.playCommand) { [weak self] _ in
            self?.handleRemotePlay()
            return .success
        }
        addRemoteTarget(commandCenter.pauseCommand) { [weak self] _ in
            self?.handleRemotePause()
            return .success
        }
        addRemoteTarget(commandCenter.togglePlayPauseCommand) { [weak self] _ in
            self?.handleRemoteToggle()
            return .success
        }
    }

    private func addRemoteTarget(
        _ command: MPRemoteCommand,
        handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
        command.isEnabled = true
        let target = command.addTarget(handler: handler)
        remoteTargets.append((command: command, target: target))
    }

    private func handleRemotePlay() {
        setPlaybackState(isPlaying: true)
        onRemoteCommand?("play")
    }

    private func handleRemotePause() {
        setPlaybackState(isPlaying: false)
        onRemoteCommand?("pause")
    }

    private func handleRemoteToggle() {
        if isPlaying {
            handleRemotePause()
        } else {
            handleRemotePlay()
        }
    }

    private func observeAudioSessionNotifications() {
        let center = NotificationCenter.default
        notificationObservers.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            self?.handleRouteChange(notification)
        })
        notificationObservers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            self?.handleInterruption(notification)
        })
        notificationObservers.append(center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: session,
            queue: .main
        ) { [weak self] _ in
            self?.handleMediaServicesReset()
        })
    }

    private func handleRouteChange(_ notification: Notification) {
        routeChangeCount += 1
        let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        lastRouteChangeReason = routeChangeReasonName(rawReason)
        nativeProductEngine?.handleRouteChange()
        iosProductAudioRendererPrep.handleRouteChange()
        iosAudioSessionCoordinator.captureActualValues()
        onAudioSessionEvent?([
            "type": "routeChange",
            "reason": lastRouteChangeReason,
            "routeChangeCount": routeChangeCount,
            "nativeLifecyclePolicy": KesshoNativeLifecyclePolicy.policy(
                for: .routeChange,
                audioIsPlaying: isPlaying || nativeProductRendererRunning
            ).dictionary,
            "audioSession": iosAudioSessionTelemetry()
        ])
    }

    private func handleInterruption(_ notification: Notification) {
        guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            return
        }
        var lifecycleEvent = KesshoNativeLifecycleEvent.audioInterruptionBegan
        var shouldResume = false
        switch type {
        case .began:
            interruptionBeginCount += 1
            lastInterruptionType = "began"
            nativeProductEngine?.handleInterruptionBegan()
            iosProductAudioRendererPrep.handleInterruptionBegan()
            nativeProductRendererRunning = nativeProductEngine?.isRunning() ?? false
            setPlaybackState(isPlaying: false)
        case .ended:
            interruptionEndCount += 1
            lastInterruptionType = "ended"
            lifecycleEvent = .audioInterruptionEnded
            if let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
                if options.contains(.shouldResume) {
                    shouldResume = true
                    do {
                        try ensureSessionActive()
                    } catch {
                        print("KesshoCapacitorAudioSessionHost: failed to reactivate after interruption: \(error)")
                    }
                }
            }
            do {
                try nativeProductEngine?.handleInterruptionEndedShouldResume(shouldResume)
                try iosProductAudioRendererPrep.handleInterruptionEnded(shouldResume: shouldResume)
                nativeProductRendererRunning = nativeProductEngine?.isRunning() ?? false
            } catch {
                lastNativeProductRendererError = "\(error)"
            }
        @unknown default:
            lastInterruptionType = "unknown"
        }
        onAudioSessionEvent?([
            "type": "interruption",
            "interruptionType": lastInterruptionType,
            "interruptionBeginCount": interruptionBeginCount,
            "interruptionEndCount": interruptionEndCount,
            "nativeLifecyclePolicy": KesshoNativeLifecyclePolicy.policy(
                for: lifecycleEvent,
                audioIsPlaying: isPlaying || nativeProductRendererRunning,
                shouldResume: shouldResume
            ).dictionary,
            "audioSession": iosAudioSessionTelemetry()
        ])
    }

    private func handleMediaServicesReset() {
        mediaServicesResetCount += 1
        do {
            if isPlaying {
                try ensureSessionActive()
            }
            try nativeProductEngine?.handleMediaServicesReset()
            try iosProductAudioRendererPrep.configure(
                sampleRate: session.sampleRate > 0 ? session.sampleRate : 48_000,
                preferredBufferDuration: session.ioBufferDuration > 0 ? session.ioBufferDuration : 128.0 / 48_000.0
            )
            nativeProductRendererRunning = nativeProductEngine?.isRunning() ?? false
        } catch {
            print("KesshoCapacitorAudioSessionHost: failed to recover after media services reset: \(error)")
            lastNativeProductRendererError = "\(error)"
        }
        updateNowPlaying(isPlaying: isPlaying)
        onAudioSessionEvent?([
            "type": "mediaServicesReset",
            "mediaServicesResetCount": mediaServicesResetCount,
            "nativeLifecyclePolicy": KesshoNativeLifecyclePolicy.policy(
                for: .mediaServicesReset,
                audioIsPlaying: isPlaying || nativeProductRendererRunning
            ).dictionary,
            "audioSession": iosAudioSessionTelemetry()
        ])
    }

    func iosAudioSessionTelemetry() -> [String: Any] {
        var telemetry = iosAudioSessionCoordinator.telemetry(audioIsPlaying: isPlaying || nativeProductRendererRunning)
        telemetry["routeChangeCount"] = routeChangeCount
        telemetry["interruptionBeginCount"] = interruptionBeginCount
        telemetry["interruptionEndCount"] = interruptionEndCount
        telemetry["mediaServicesResetCount"] = mediaServicesResetCount
        telemetry["lastRouteChangeReason"] = lastRouteChangeReason
        telemetry["lastInterruptionType"] = lastInterruptionType
        telemetry["nativeRendererPrep"] = iosProductAudioRendererPrep.getTelemetry().dictionary
        telemetry["lastNativeProductRendererError"] = lastNativeProductRendererError
        return telemetry
    }

    private func routeChangeReasonName(_ rawValue: UInt) -> String {
        guard let reason = AVAudioSession.RouteChangeReason(rawValue: rawValue) else {
            return "unknown"
        }
        switch reason {
        case .newDeviceAvailable: return "newDeviceAvailable"
        case .oldDeviceUnavailable: return "oldDeviceUnavailable"
        case .categoryChange: return "categoryChange"
        case .override: return "override"
        case .wakeFromSleep: return "wakeFromSleep"
        case .noSuitableRouteForCategory: return "noSuitableRouteForCategory"
        case .routeConfigurationChange: return "routeConfigurationChange"
        @unknown default: return "unknown"
        }
    }
}

@objc(KesshoAudioSessionPlugin)
public final class KesshoAudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KesshoAudioSessionPlugin"
    public let jsName = "KesshoAudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeRendererForDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeRendererForDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probeNativeRendererForDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getIOSAudioSessionTelemetry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlaybackState", returnType: CAPPluginReturnPromise)
    ]

    private let host = KesshoCapacitorAudioSessionHost()

    public override func load() {
        super.load()

        DispatchQueue.main.async {
            UIApplication.shared.beginReceivingRemoteControlEvents()
        }

        host.onRemoteCommand = { [weak self] command in
            self?.notifyListeners("remoteCommand", data: ["command": command])
        }
        host.onAudioSessionEvent = { [weak self] event in
            self?.notifyListeners("audioSessionEvent", data: event)
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "mode": "capacitor-platform-session",
            "isPlaying": host.isPlaying,
            "supportsBackgroundAudio": true,
            "nativeProductRendererPrepared": host.nativeProductRendererPrepared,
            "nativeProductRendererRunning": host.nativeProductRendererRunning,
            "nativeProductRendererStartCount": host.nativeProductRendererStartCount,
            "nativeProductRendererStopCount": host.nativeProductRendererStopCount,
            "nativeProductRendererProbePeak": host.nativeProductRendererProbePeak,
            "nativeProductRendererProbeRms": host.nativeProductRendererProbeRms,
            "nativeProductRendererProbeRenderedFrames": host.nativeProductRendererProbeRenderedFrames,
            "lastNativeProductRendererError": host.lastNativeProductRendererError,
            "routeChangeCount": host.routeChangeCount,
            "interruptionBeginCount": host.interruptionBeginCount,
            "interruptionEndCount": host.interruptionEndCount,
            "mediaServicesResetCount": host.mediaServicesResetCount,
            "lastRouteChangeReason": host.lastRouteChangeReason,
            "lastInterruptionType": host.lastInterruptionType,
            "iosAudioSession": host.iosAudioSessionTelemetry()
        ])
    }

    @objc func syncState(_ call: CAPPluginCall) {
        host.syncWebState()
        call.resolve()
    }

    @objc func startPlayback(_ call: CAPPluginCall) {
        do {
            try host.start(nowPlaying: extractNowPlayingMetadata(from: call))
            call.resolve()
        } catch {
            call.reject("Failed to start Capacitor audio session", nil, error)
        }
    }

    @objc func stopPlayback(_ call: CAPPluginCall) {
        host.stop()
        call.resolve()
    }

    @objc func startNativeRendererForDiagnostics(_ call: CAPPluginCall) {
        do {
            try host.startNativeProductRendererForDiagnostics()
            call.resolve([
                "nativeProductRendererPrepared": host.nativeProductRendererPrepared,
                "nativeProductRendererRunning": host.nativeProductRendererRunning,
                "nativeProductRendererStartCount": host.nativeProductRendererStartCount
            ])
        } catch {
            call.reject("Failed to start native Product Core renderer", nil, error)
        }
    }

    @objc func stopNativeRendererForDiagnostics(_ call: CAPPluginCall) {
        host.stopNativeProductRendererForDiagnostics()
        call.resolve([
            "nativeProductRendererRunning": host.nativeProductRendererRunning,
            "nativeProductRendererStopCount": host.nativeProductRendererStopCount
        ])
    }

    @objc func probeNativeRendererForDiagnostics(_ call: CAPPluginCall) {
        do {
            call.resolve(try host.probeNativeProductRendererForDiagnostics())
        } catch {
            call.reject("Failed to probe native Product Core renderer output", nil, error)
        }
    }

    @objc func getIOSAudioSessionTelemetry(_ call: CAPPluginCall) {
        call.resolve(host.iosAudioSessionTelemetry())
    }

    @objc func setNowPlaying(_ call: CAPPluginCall) {
        let metadata = extractNowPlayingMetadata(from: call)
        host.updateNowPlaying(metadata, isPlaying: call.getBool("isPlaying"))
        call.resolve()
    }

    @objc func setPlaybackState(_ call: CAPPluginCall) {
        host.setPlaybackState(isPlaying: call.getBool("isPlaying") ?? host.isPlaying)
        call.resolve()
    }

    private func extractNowPlayingMetadata(from call: CAPPluginCall) -> KesshoNowPlayingMetadata {
        KesshoNowPlayingMetadata(
            title: call.getString("title")?.isEmpty == false ? call.getString("title")! : "Generative Ambient",
            artist: call.getString("artist")?.isEmpty == false ? call.getString("artist")! : "Kessho",
            album: call.getString("album")?.isEmpty == false ? call.getString("album")! : "Kessho Capacitor",
            elapsedTime: call.getDouble("elapsedTime") ?? 0,
            isLiveStream: call.getBool("isLiveStream") ?? true
        )
    }
}
