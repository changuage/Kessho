import Foundation

/// Shared notification names for iOS service backbones.
enum AudioServiceNotification {
    /// Posted when the audio session is activated.
    static let didActivate = Notification.Name("AudioServiceNotification.didActivate")

    /// Posted when the audio session is deactivated.
    static let didDeactivate = Notification.Name("AudioServiceNotification.didDeactivate")

    /// Posted when an audio interruption begins.
    static let interruptionBegan = Notification.Name("AudioServiceNotification.interruptionBegan")

    /// Posted when an audio interruption ends.
    static let interruptionEnded = Notification.Name("AudioServiceNotification.interruptionEnded")

    /// Posted when the audio route changes.
    static let routeChanged = Notification.Name("AudioServiceNotification.routeChanged")

    /// Posted when the now playing info changes.
    static let nowPlayingChanged = Notification.Name("AudioServiceNotification.nowPlayingChanged")
}

/// UserInfo keys used by the audio session notifications.
enum AudioServiceUserInfoKey {
    static let interruptionType = "AudioServiceUserInfoKey.interruptionType"
    static let interruptionOptions = "AudioServiceUserInfoKey.interruptionOptions"
    static let routeChangeReason = "AudioServiceUserInfoKey.routeChangeReason"
}

