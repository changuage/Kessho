import AVFoundation
import Capacitor
import Foundation
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
    private let commandCenter = MPRemoteCommandCenter.shared()
    private var remoteTargets: [(command: MPRemoteCommand, target: Any)] = []
    private var nowPlaying = KesshoNowPlayingMetadata.default

    private(set) var isPlaying = false

    var onRemoteCommand: ((String) -> Void)?

    init() {
        configureRemoteCommands()
    }

    deinit {
        for remoteTarget in remoteTargets {
            remoteTarget.command.removeTarget(remoteTarget.target)
        }
    }

    func syncWebState() {
        // The React/WebAudio engine owns sound generation; this bridge owns platform session state only.
    }

    func start(nowPlaying: KesshoNowPlayingMetadata?) throws {
        if let nowPlaying {
            self.nowPlaying = nowPlaying
        }

        try ensureSessionActive()
        isPlaying = true
        updateNowPlaying(isPlaying: true)
    }

    func stop() {
        isPlaying = false
        updateNowPlaying(isPlaying: false)

        do {
            try session.setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            print("KesshoCapacitorAudioSessionHost: failed to deactivate audio session: \(error)")
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
        try session.setCategory(.playback, mode: .default, options: [])
        try session.setPreferredSampleRate(44_100)
        try session.setPreferredIOBufferDuration(256.0 / 44_100.0)
        try session.setActive(true)
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
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "mode": "capacitor-platform-session",
            "isPlaying": host.isPlaying,
            "supportsBackgroundAudio": true
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
