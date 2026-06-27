import Foundation

public enum KesshoNativeLifecycleEvent: String, CaseIterable {
    case none
    case willEnterForeground
    case didEnterBackground
    case protectedDataWillBecomeUnavailable
    case protectedDataDidBecomeAvailable
    case routeChange
    case audioInterruptionBegan
    case audioInterruptionEnded
    case mediaServicesReset
    case unavailable
}

public struct KesshoNativeLifecyclePolicy: Equatable {
    public let event: KesshoNativeLifecycleEvent
    public let audioMayContinue: Bool
    public let throttleVisualTelemetry: Bool
    public let requestPrewarm: Bool
    public let requestSuspendAfterGracePeriod: Bool
    public let shouldResume: Bool

    public var dictionary: [String: Any] {
        [
            "event": event.rawValue,
            "audioMayContinue": audioMayContinue,
            "throttleVisualTelemetry": throttleVisualTelemetry,
            "requestPrewarm": requestPrewarm,
            "requestSuspendAfterGracePeriod": requestSuspendAfterGracePeriod,
            "shouldResume": shouldResume,
        ]
    }

    public static func policy(
        for event: KesshoNativeLifecycleEvent,
        audioIsPlaying: Bool = true,
        shouldResume: Bool = false
    ) -> KesshoNativeLifecyclePolicy {
        switch event {
        case .willEnterForeground, .protectedDataDidBecomeAvailable:
            return KesshoNativeLifecyclePolicy(
                event: event,
                audioMayContinue: true,
                throttleVisualTelemetry: false,
                requestPrewarm: true,
                requestSuspendAfterGracePeriod: false,
                shouldResume: shouldResume
            )
        case .didEnterBackground, .protectedDataWillBecomeUnavailable:
            return KesshoNativeLifecyclePolicy(
                event: event,
                audioMayContinue: audioIsPlaying,
                throttleVisualTelemetry: true,
                requestPrewarm: false,
                requestSuspendAfterGracePeriod: !audioIsPlaying,
                shouldResume: false
            )
        case .audioInterruptionBegan:
            return KesshoNativeLifecyclePolicy(
                event: event,
                audioMayContinue: false,
                throttleVisualTelemetry: true,
                requestPrewarm: false,
                requestSuspendAfterGracePeriod: true,
                shouldResume: false
            )
        case .audioInterruptionEnded:
            return KesshoNativeLifecyclePolicy(
                event: event,
                audioMayContinue: shouldResume,
                throttleVisualTelemetry: false,
                requestPrewarm: shouldResume,
                requestSuspendAfterGracePeriod: !shouldResume,
                shouldResume: shouldResume
            )
        case .routeChange, .mediaServicesReset:
            return KesshoNativeLifecyclePolicy(
                event: event,
                audioMayContinue: audioIsPlaying,
                throttleVisualTelemetry: false,
                requestPrewarm: audioIsPlaying,
                requestSuspendAfterGracePeriod: !audioIsPlaying,
                shouldResume: shouldResume
            )
        case .none, .unavailable:
            return KesshoNativeLifecyclePolicy(
                event: event,
                audioMayContinue: audioIsPlaying,
                throttleVisualTelemetry: false,
                requestPrewarm: false,
                requestSuspendAfterGracePeriod: false,
                shouldResume: shouldResume
            )
        }
    }

    public static func policy(
        forRawValue rawValue: String,
        audioIsPlaying: Bool = true,
        shouldResume: Bool = false
    ) -> KesshoNativeLifecyclePolicy {
        policy(
            for: KesshoNativeLifecycleEvent(rawValue: rawValue) ?? .unavailable,
            audioIsPlaying: audioIsPlaying,
            shouldResume: shouldResume
        )
    }
}

public struct KesshoNativeBridgeRequest {
    public let id: String
    public let plugin: String
    public let method: String
    public let options: [String: Any]
}

public struct KesshoNativeBridgeMethodPolicy {
    public let method: String
    public let maxOptionsBytes: Int

    public init(method: String, maxOptionsBytes: Int = 32 * 1024) {
        self.method = method
        self.maxOptionsBytes = maxOptionsBytes
    }
}

public enum KesshoNativeBridgeValidationError: LocalizedError, Equatable {
    case malformedRequest
    case invalidId
    case unknownPlugin(String)
    case unknownMethod(plugin: String, method: String)
    case invalidOptions
    case optionsPayloadTooLarge(plugin: String, method: String, byteCount: Int, maxBytes: Int)

    public var errorDescription: String? {
        switch self {
        case .malformedRequest:
            return "Malformed native bridge request."
        case .invalidId:
            return "Invalid native bridge request id."
        case .unknownPlugin(let plugin):
            return "Unknown native plugin \(plugin)."
        case .unknownMethod(let plugin, let method):
            return "Unknown native method \(plugin).\(method)."
        case .invalidOptions:
            return "Native bridge options must be a JSON object."
        case .optionsPayloadTooLarge(let plugin, let method, let byteCount, let maxBytes):
            return "Native bridge options for \(plugin).\(method) are \(byteCount) bytes; maximum is \(maxBytes) bytes."
        }
    }
}

public struct KesshoNativeBridgePolicy {
    private let methodsByPlugin: [String: [String: KesshoNativeBridgeMethodPolicy]]
    private let maxIdLength: Int

    public init(methodsByPlugin: [String: [KesshoNativeBridgeMethodPolicy]], maxIdLength: Int = 80) {
        self.methodsByPlugin = methodsByPlugin.mapValues { policies in
            Dictionary(uniqueKeysWithValues: policies.map { ($0.method, $0) })
        }
        self.maxIdLength = maxIdLength
    }

    public func validate(body: Any) throws -> KesshoNativeBridgeRequest {
        guard
            let payload = body as? [String: Any],
            let id = payload["id"] as? String,
            let plugin = payload["plugin"] as? String,
            let method = payload["method"] as? String
        else {
            throw KesshoNativeBridgeValidationError.malformedRequest
        }
        guard !id.isEmpty && id.count <= maxIdLength else {
            throw KesshoNativeBridgeValidationError.invalidId
        }
        guard let methods = methodsByPlugin[plugin] else {
            throw KesshoNativeBridgeValidationError.unknownPlugin(plugin)
        }
        guard let methodPolicy = methods[method] else {
            throw KesshoNativeBridgeValidationError.unknownMethod(plugin: plugin, method: method)
        }

        let options: [String: Any]
        if let rawOptions = payload["options"] {
            guard let dictionary = rawOptions as? [String: Any] else {
                throw KesshoNativeBridgeValidationError.invalidOptions
            }
            options = dictionary
        } else {
            options = [:]
        }

        guard JSONSerialization.isValidJSONObject(options),
              let encoded = try? JSONSerialization.data(withJSONObject: options)
        else {
            throw KesshoNativeBridgeValidationError.invalidOptions
        }
        if encoded.count > methodPolicy.maxOptionsBytes {
            throw KesshoNativeBridgeValidationError.optionsPayloadTooLarge(
                plugin: plugin,
                method: method,
                byteCount: encoded.count,
                maxBytes: methodPolicy.maxOptionsBytes
            )
        }

        return KesshoNativeBridgeRequest(id: id, plugin: plugin, method: method, options: options)
    }
}

public extension KesshoNativeBridgePolicy {
    static let defaultKesshoPolicy = KesshoNativeBridgePolicy(methodsByPlugin: [
        "KesshoMidiRouting": [
            KesshoNativeBridgeMethodPolicy(method: "getStatus", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "start", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "stop", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "refreshInputs", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "connectInput", maxOptionsBytes: 1024),
            KesshoNativeBridgeMethodPolicy(method: "disconnectInput", maxOptionsBytes: 1024),
            KesshoNativeBridgeMethodPolicy(method: "disconnectAllInputs", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "setConnectedInputs", maxOptionsBytes: 8 * 1024),
        ],
        "KesshoAudioSession": [
            KesshoNativeBridgeMethodPolicy(method: "getStatus", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "syncState", maxOptionsBytes: 8 * 1024),
            KesshoNativeBridgeMethodPolicy(method: "startPlayback", maxOptionsBytes: 8 * 1024),
            KesshoNativeBridgeMethodPolicy(method: "stopPlayback", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "startNativeRendererForDiagnostics", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "stopNativeRendererForDiagnostics", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "probeNativeRendererForDiagnostics", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "setNowPlaying", maxOptionsBytes: 16 * 1024),
            KesshoNativeBridgeMethodPolicy(method: "setPlaybackState", maxOptionsBytes: 4 * 1024),
        ],
        "KesshoMacShell": [
            KesshoNativeBridgeMethodPolicy(method: "getStatus", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "getAudioOutputStatus", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "openSoundSettings", maxOptionsBytes: 256),
            KesshoNativeBridgeMethodPolicy(method: "setPlaybackState", maxOptionsBytes: 4 * 1024),
        ],
    ])
}
