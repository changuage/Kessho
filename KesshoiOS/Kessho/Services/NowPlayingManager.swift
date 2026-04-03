import Foundation
import MediaPlayer

/// Owns lock-screen metadata and remote command center integration.
///
/// This service is intentionally lightweight so the UI can adopt it later
/// without pulling playback logic into view code.
final class NowPlayingManager {
    static let shared = NowPlayingManager()

    private let commandTarget = RemoteCommandTarget()
    private var remoteCommandsConfigured = false

    private init() {}

    /// Configure the metadata shown in Control Center and on the lock screen.
    func updateNowPlayingInfo(
        title: String,
        artist: String = "Kessho",
        album: String = "Generative Ambient",
        isLiveStream: Bool = true,
        isPlaying: Bool = false,
        elapsedTime: TimeInterval = 0
    ) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPMediaItemPropertyAlbumTitle: album,
            MPNowPlayingInfoPropertyIsLiveStream: isLiveStream,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedTime
        ]

        if !isLiveStream {
            info[MPMediaItemPropertyPlaybackDuration] = elapsedTime
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        NotificationCenter.default.post(name: AudioServiceNotification.nowPlayingChanged, object: self)
    }

    /// Update only the current playback state.
    func setPlaybackState(isPlaying: Bool) {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
            ]
            NotificationCenter.default.post(name: AudioServiceNotification.nowPlayingChanged, object: self)
            return
        }

        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        NotificationCenter.default.post(name: AudioServiceNotification.nowPlayingChanged, object: self)
    }

    /// Clear lock-screen metadata and disable playback state.
    func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        NotificationCenter.default.post(name: AudioServiceNotification.nowPlayingChanged, object: self)
    }

    /// Configure the remote command center for basic transport controls.
    ///
    /// The caller supplies closures so this manager stays decoupled from the
    /// audio engine or app state layer.
    func configureRemoteCommands(
        onPlay: @escaping () -> Void,
        onPause: @escaping () -> Void,
        onTogglePlayPause: @escaping () -> Void
    ) {
        commandTarget.onPlay = onPlay
        commandTarget.onPause = onPause
        commandTarget.onTogglePlayPause = onTogglePlayPause

        let center = MPRemoteCommandCenter.shared()

        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true

        center.playCommand.removeTarget(nil)
        center.pauseCommand.removeTarget(nil)
        center.togglePlayPauseCommand.removeTarget(nil)

        center.playCommand.addTarget(commandTarget, action: #selector(RemoteCommandTarget.handlePlayCommand(_:)))
        center.pauseCommand.addTarget(commandTarget, action: #selector(RemoteCommandTarget.handlePauseCommand(_:)))
        center.togglePlayPauseCommand.addTarget(commandTarget, action: #selector(RemoteCommandTarget.handleToggleCommand(_:)))

        center.nextTrackCommand.isEnabled = false
        center.previousTrackCommand.isEnabled = false
        center.skipForwardCommand.isEnabled = false
        center.skipBackwardCommand.isEnabled = false

        remoteCommandsConfigured = true
    }

    /// Remove all remote command handlers.
    func resetRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.removeTarget(nil)
        center.pauseCommand.removeTarget(nil)
        center.togglePlayPauseCommand.removeTarget(nil)
        remoteCommandsConfigured = false
    }

    var hasConfiguredRemoteCommands: Bool {
        remoteCommandsConfigured
    }
}

private final class RemoteCommandTarget: NSObject {
    var onPlay: (() -> Void)?
    var onPause: (() -> Void)?
    var onTogglePlayPause: (() -> Void)?

    @objc func handlePlayCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        onPlay?()
        return .success
    }

    @objc func handlePauseCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        onPause?()
        return .success
    }

    @objc func handleToggleCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        onTogglePlayPause?()
        return .success
    }
}

