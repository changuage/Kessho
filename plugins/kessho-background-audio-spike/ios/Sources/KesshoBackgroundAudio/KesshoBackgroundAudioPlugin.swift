import Capacitor
import Foundation
import KesshoNativeCore
import UIKit

private struct KesshoDualRange: Decodable {
    let min: Double
    let max: Double
}

private struct KesshoNowPlayingMetadata {
    var title: String
    var artist: String
    var album: String
    var elapsedTime: TimeInterval
    var isLiveStream: Bool

    static let `default` = KesshoNowPlayingMetadata(
        title: "Generative Ambient",
        artist: "Kessho",
        album: "Kessho Native",
        elapsedTime: 0,
        isLiveStream: true
    )
}

private final class KesshoNativeAudioHost {
    private let audioEngine = AudioEngine()
    private let audioSessionManager = AudioSessionManager.shared
    private let nowPlayingManager = NowPlayingManager.shared

    private(set) var isPlaying = false
    private var currentState: SliderState?
    private var currentDualRanges: [String: KesshoDualRange] = [:]
    private var nowPlaying = KesshoNowPlayingMetadata.default

    var onRemoteCommand: ((String) -> Void)?

    init() {
        nowPlayingManager.configureRemoteCommands(
            onPlay: { [weak self] in
                self?.handleRemotePlay()
            },
            onPause: { [weak self] in
                self?.handleRemotePause()
            },
            onTogglePlayPause: { [weak self] in
                self?.handleRemoteToggle()
            }
        )
    }

    func syncState(_ state: SliderState, dualRanges: [String: KesshoDualRange]) {
        currentState = state
        currentDualRanges = dualRanges
        audioEngine.updateParams(state)
    }

    func start(
        state: SliderState,
        dualRanges: [String: KesshoDualRange],
        nowPlaying: KesshoNowPlayingMetadata?
    ) throws {
        syncState(state, dualRanges: dualRanges)
        if let nowPlaying {
            self.nowPlaying = nowPlaying
        }

        try ensureSessionActive()
        audioEngine.start(with: state)
        isPlaying = true
        updateNowPlaying(isPlaying: true)
    }

    func stop() {
        audioEngine.stop(fadeOut: false)
        isPlaying = false
        nowPlayingManager.setPlaybackState(isPlaying: false)

        do {
            if audioSessionManager.isActive {
                try audioSessionManager.deactivate(options: [.notifyOthersOnDeactivation])
            }
        } catch {
            print("KesshoNativeAudioHost: failed to deactivate audio session: \(error)")
        }
    }

    func updateNowPlaying(_ metadata: KesshoNowPlayingMetadata, isPlaying: Bool? = nil) {
        nowPlaying = metadata
        updateNowPlaying(isPlaying: isPlaying ?? self.isPlaying)
    }

    func setPlaybackState(isPlaying: Bool) {
        self.isPlaying = isPlaying
        nowPlayingManager.setPlaybackState(isPlaying: isPlaying)
    }

    private func ensureSessionActive() throws {
        try audioSessionManager.reconfigureForPlayback(
            preferredSampleRate: 44_100,
            preferredIOBufferDuration: 256.0 / 44_100.0,
            mixWithOthers: false
        )

        if !audioSessionManager.isActive {
            try audioSessionManager.activate()
        }
    }

    private func updateNowPlaying(isPlaying: Bool) {
        nowPlayingManager.updateNowPlayingInfo(
            title: nowPlaying.title,
            artist: nowPlaying.artist,
            album: nowPlaying.album,
            isLiveStream: nowPlaying.isLiveStream,
            isPlaying: isPlaying,
            elapsedTime: nowPlaying.elapsedTime
        )
    }

    private func handleRemotePlay() {
        guard let currentState else { return }

        do {
            try ensureSessionActive()
            audioEngine.updateParams(currentState)
            audioEngine.start(with: currentState)
            isPlaying = true
            updateNowPlaying(isPlaying: true)
            onRemoteCommand?("play")
        } catch {
            print("KesshoNativeAudioHost: remote play failed: \(error)")
        }
    }

    private func handleRemotePause() {
        stop()
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

@objc(KesshoBackgroundAudioPlugin)
public final class KesshoBackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KesshoBackgroundAudioPlugin"
    public let jsName = "KesshoBackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlaybackState", returnType: CAPPluginReturnPromise)
    ]

    private let host = KesshoNativeAudioHost()

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
            "mode": "native-engine-controller",
            "isPlaying": host.isPlaying,
            "supportsBackgroundAudio": true
        ])
    }

    @objc func syncState(_ call: CAPPluginCall) {
        do {
            let (state, dualRanges) = try decodePayload(call)
            host.syncState(state, dualRanges: dualRanges)
            call.resolve()
        } catch {
            call.reject("Failed to sync state", nil, error)
        }
    }

    @objc func startPlayback(_ call: CAPPluginCall) {
        do {
            let (state, dualRanges) = try decodePayload(call)
            try host.start(
                state: state,
                dualRanges: dualRanges,
                nowPlaying: extractNowPlayingMetadata(from: call)
            )
            call.resolve()
        } catch {
            call.reject("Failed to start native playback", nil, error)
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
            album: call.getString("album")?.isEmpty == false ? call.getString("album")! : "Kessho Native",
            elapsedTime: call.getDouble("elapsedTime") ?? 0,
            isLiveStream: call.getBool("isLiveStream") ?? true
        )
    }

    private func decodePayload(_ call: CAPPluginCall) throws -> (SliderState, [String: KesshoDualRange]) {
        let decoder = JSONDecoder()
        let stateJson = call.getString("stateJson") ?? "{}"
        let state = try SliderState.decodeStatePayload(from: Data(stateJson.utf8))

        guard let dualRangesJson = call.getString("dualRangesJson"), !dualRangesJson.isEmpty else {
            return (state, [:])
        }

        let dualRanges = try decoder.decode([String: KesshoDualRange].self, from: Data(dualRangesJson.utf8))
        return (state, dualRanges)
    }
}
