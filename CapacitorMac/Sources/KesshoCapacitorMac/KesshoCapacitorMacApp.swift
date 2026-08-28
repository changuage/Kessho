import AppKit
import AVFoundation
import CoreMIDI
import CoreAudio
import Darwin
import Foundation
import KesshoNativeBridge
import KesshoProductCore
import Network
import Sparkle
import SwiftUI
import WebKit

@main
struct KesshoCapacitorMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var runtime = KesshoMacRuntime()
    private let updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    init() {
        if CommandLine.arguments.contains("--native-product-diagnostics-smoke") {
            KesshoMacNativeDiagnosticsSmoke.runAndExit()
        }
        if CommandLine.arguments.contains("--native-product-background-smoke") {
            KesshoMacNativeDiagnosticsSmoke.runBackgroundAndExit()
        }
        if CommandLine.arguments.contains("--webview-security-smoke") {
            KesshoMacWebViewSecuritySmoke.runAndExit()
        }
    }

    var body: some Scene {
        WindowGroup {
            KesshoWebView(runtime: runtime)
                .frame(minWidth: 1100, minHeight: 760)
                .ignoresSafeArea()
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") {
                    updaterController.checkForUpdates(nil)
                }
            }
            CommandGroup(after: .appInfo) {
                Button("Reload Kessho") {
                    runtime.reloadWebView()
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@MainActor
final class KesshoMacRuntime: ObservableObject {
    private let server: StaticWebServer
    private let midiRouter = MacMidiRouter()
    private let performanceActivity = MacPerformanceActivity()
    private let audioSessionHost = KesshoMacAudioSessionHost()
    private let audioOutputObserver = MacAudioOutputObserver()
    private weak var webView: WKWebView?

    init() {
        self.server = StaticWebServer(rootURL: Self.resolveWebRoot())
        midiRouter.onMessages = { [weak self] messages in
            guard let self, self.midiRouter.isStarted else { return }
            self.dispatchEvent(
                plugin: "KesshoMidiRouting",
                eventName: "midiMessages",
                data: ["messages": messages.map(\.dictionary)]
            )
        }
        midiRouter.onInputsChanged = { [weak self] inputs in
            Task { @MainActor in
                self?.dispatchEvent(
                    plugin: "KesshoMidiRouting",
                    eventName: "inputsChanged",
                    data: self?.inputSnapshot(inputs: inputs) ?? [:]
                )
            }
        }
        audioSessionHost.onAudioSessionEvent = { [weak self] event in
            Task { @MainActor in
                self?.dispatchEvent(plugin: "KesshoAudioSession", eventName: "audioSessionEvent", data: event)
            }
        }
        audioOutputObserver.onChange = { [weak self] status in
            Task { @MainActor in
                guard let self else { return }
                self.audioSessionHost.handleOutputDeviceChange()
                self.dispatchEvent(plugin: "KesshoMacShell", eventName: "audioOutputChanged", data: status)
            }
        }
        audioOutputObserver.start()
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    var trustedWebOrigin: KesshoWebOriginPolicy {
        server.originPolicy
    }

    func startWebApp(completion: @escaping (URL) -> Void) {
        do {
            try server.start { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let url):
                        completion(url)
                    case .failure(let error):
                        self.showFatalLoadError(error)
                    }
                }
            }
        } catch {
            showFatalLoadError(error)
        }
    }

    func reloadWebView() {
        webView?.reload()
    }

    func handleBridgeMessage(_ body: Any) {
        let request: KesshoNativeBridgeRequest
        do {
            request = try KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: body)
        } catch {
            if let payload = body as? [String: Any], let id = payload["id"] as? String {
                rejectBridgeCall(id: id, message: error.localizedDescription)
            }
            return
        }

        do {
            switch request.plugin {
            case "KesshoMidiRouting":
                let result = try handleMidiMethod(request.method, options: request.options)
                resolveBridgeCall(id: request.id, value: result)
            case "KesshoAudioSession":
                let result = try handleAudioSessionMethod(request.method, options: request.options)
                resolveBridgeCall(id: request.id, value: result)
            case "KesshoMacShell":
                let result = try handleShellMethod(request.method, options: request.options)
                resolveBridgeCall(id: request.id, value: result)
            default:
                throw BridgeError.unknownPlugin(request.plugin)
            }
        } catch {
            rejectBridgeCall(id: request.id, message: error.localizedDescription)
        }
    }

    private func handleAudioSessionMethod(_ method: String, options: [String: Any]) throws -> [String: Any] {
        switch method {
        case "getStatus":
            return audioSessionHost.statusPayload()
        case "syncState":
            return audioSessionHost.statusPayload()
        case "startPlayback":
            audioSessionHost.start()
            if let title = options["title"] as? String {
                performanceActivity.setPlaybackActive(true, title: title)
            }
            return audioSessionHost.statusPayload()
        case "stopPlayback":
            audioSessionHost.stop()
            performanceActivity.setPlaybackActive(false, title: nil)
            return audioSessionHost.statusPayload()
        case "startNativeRendererForDiagnostics":
            return try audioSessionHost.startNativeProductRendererForDiagnostics()
        case "stopNativeRendererForDiagnostics":
            return audioSessionHost.stopNativeProductRendererForDiagnostics()
        case "probeNativeRendererForDiagnostics":
            return try audioSessionHost.probeNativeProductRendererForDiagnostics()
        case "prepareNativeProductRuntime":
            return audioSessionHost.prepareNativeProductRuntime()
        case "loadNativeProductSnapshot":
            try audioSessionHost.loadNativeProductSnapshot(options)
            return audioSessionHost.statusPayload()
        case "enqueueNativeProductEvents":
            try audioSessionHost.enqueueNativeProductEvents(options)
            return audioSessionHost.statusPayload()
        case "registerNativeProductFileAsset":
            try audioSessionHost.registerNativeProductFileAsset(options)
            return audioSessionHost.statusPayload()
        case "registerNativeProductDecodedAsset":
            try audioSessionHost.registerNativeProductDecodedAsset(options)
            return audioSessionHost.statusPayload()
        case "unregisterNativeProductAsset":
            try audioSessionHost.unregisterNativeProductAsset(options)
            return audioSessionHost.statusPayload()
        case "resetNativeProductRuntime":
            try audioSessionHost.resetNativeProductRuntime()
            return audioSessionHost.statusPayload()
        case "startNativeProductRuntime":
            return try audioSessionHost.startNativeProductRuntime()
        case "stopNativeProductRuntime":
            return audioSessionHost.stopNativeProductRuntime()
        case "getNativeProductTelemetry":
            return try audioSessionHost.nativeProductTelemetry()
        case "setNativeProductInteractionDemand":
            try audioSessionHost.setNativeProductInteractionDemand(options)
            return audioSessionHost.statusPayload()
        case "setNowPlaying":
            return audioSessionHost.statusPayload()
        case "setPlaybackState":
            let isPlaying = options["isPlaying"] as? Bool ?? false
            if isPlaying {
                audioSessionHost.start()
            } else {
                audioSessionHost.stop()
            }
            performanceActivity.setPlaybackActive(isPlaying, title: options["title"] as? String)
            return audioSessionHost.statusPayload()
        default:
            throw BridgeError.unknownMethod(method)
        }
    }

    private func handleMidiMethod(_ method: String, options: [String: Any]) throws -> [String: Any] {
        switch method {
        case "getStatus":
            return statusPayload()
        case "start":
            try midiRouter.start()
            return statusPayload()
        case "stop":
            midiRouter.stop()
            return statusPayload()
        case "refreshInputs":
            try midiRouter.start()
            midiRouter.refreshAvailableInputs()
            return inputSnapshot(inputs: midiRouter.availableInputs)
        case "connectInput":
            let uniqueID = try uniqueID(from: options)
            try midiRouter.start()
            try midiRouter.connectInput(uniqueID: uniqueID)
            return inputSnapshot(inputs: midiRouter.availableInputs)
        case "disconnectInput":
            let uniqueID = try uniqueID(from: options)
            midiRouter.disconnectInput(uniqueID: uniqueID)
            return inputSnapshot(inputs: midiRouter.availableInputs)
        case "disconnectAllInputs":
            midiRouter.disconnectAllInputs()
            return inputSnapshot(inputs: midiRouter.availableInputs)
        case "setConnectedInputs":
            let uniqueIDsJson = options["uniqueIDsJson"] as? String ?? "[]"
            let data = Data(uniqueIDsJson.utf8)
            let decoded = try JSONDecoder().decode([Int32].self, from: data)
            try midiRouter.start()
            try midiRouter.setConnectedInputs(Set(decoded))
            return inputSnapshot(inputs: midiRouter.availableInputs)
        default:
            throw BridgeError.unknownMethod(method)
        }
    }

    private func handleShellMethod(_ method: String, options: [String: Any]) throws -> [String: Any] {
        switch method {
        case "getStatus":
            return shellStatusPayload()
        case "getAudioOutputStatus":
            return MacAudioOutputInspector.statusPayload()
        case "openSoundSettings":
            return ["opened": MacAudioOutputInspector.openSoundSettings()]
        case "setPlaybackState":
            guard let isPlaying = options["isPlaying"] as? Bool else {
                throw BridgeError.missingArgument("isPlaying")
            }
            performanceActivity.setPlaybackActive(isPlaying, title: options["title"] as? String)
            return shellStatusPayload()
        default:
            throw BridgeError.unknownMethod(method)
        }
    }

    private func shellStatusPayload() -> [String: Any] {
        [
            "available": true,
            "platform": "macos",
            "webRoot": server.rootURL.path,
            "isPlaybackActive": performanceActivity.isPlaybackActive,
            "performanceActivityActive": performanceActivity.isActivityActive,
            "nativeOptimizations": [
                "webViewShell": true,
                "loopbackStaticServer": true,
                "coreMidiRouting": true,
                "nativeProductCoreDiagnostics": true,
                "appNapSuppressionWhilePlaying": true,
                "idleSystemSleepPreventionWhilePlaying": true,
                "assetMemoryCache": false,
                "coreAudioOutputDiagnostics": true,
            ],
            "audioOutput": MacAudioOutputInspector.statusPayload(),
        ]
    }

    private func statusPayload() -> [String: Any] {
        [
            "available": true,
            "isStarted": midiRouter.isStarted,
            "inputCount": midiRouter.availableInputs.count,
            "connectedInputIDs": midiRouter.connectedInputIDs.map(Int.init),
            "lastErrorMessage": midiRouter.lastErrorMessage ?? NSNull(),
        ]
    }

    private func inputSnapshot(inputs: [MacMIDIEndpointInfo]) -> [String: Any] {
        [
            "inputs": inputs.map(\.dictionary),
            "connectedInputIDs": midiRouter.connectedInputIDs.map(Int.init),
        ]
    }

    private func uniqueID(from options: [String: Any]) throws -> Int32 {
        if let value = options["uniqueID"] as? Int {
            return Int32(value)
        }
        if let value = options["uniqueID"] as? Double, value.isFinite {
            return Int32(value)
        }
        throw BridgeError.missingArgument("uniqueID")
    }

    private func resolveBridgeCall(id: String, value: [String: Any]) {
        evaluateBridgeFunction("__kesshoCapacitorResolve", payload: [
            "id": id,
            "success": true,
            "value": value,
        ])
    }

    private func rejectBridgeCall(id: String, message: String) {
        evaluateBridgeFunction("__kesshoCapacitorResolve", payload: [
            "id": id,
            "success": false,
            "error": message,
        ])
    }

    private func dispatchEvent(plugin: String, eventName: String, data: [String: Any]) {
        evaluateBridgeFunction("__kesshoCapacitorDispatchEvent", payload: [
            "plugin": plugin,
            "eventName": eventName,
            "data": data,
        ])
    }

    private func evaluateBridgeFunction(_ functionName: String, payload: [String: Any]) {
        guard
            let webView,
            trustedWebOrigin.allows(webView.url),
            JSONSerialization.isValidJSONObject(payload),
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else {
            return
        }

        webView.evaluateJavaScript("window.\(functionName)(\(json));", completionHandler: nil)
    }

    private func showFatalLoadError(_ error: Error) {
        let alert = NSAlert()
        alert.messageText = "Kessho Capacitor could not start"
        alert.informativeText = error.localizedDescription
        alert.alertStyle = .critical
        alert.runModal()
    }

    private static func resolveWebRoot() -> URL {
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("WebApp", isDirectory: true),
           FileManager.default.fileExists(atPath: bundled.appendingPathComponent("index.html").path) {
            return bundled
        }

        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        return cwd.appendingPathComponent("dist", isDirectory: true)
    }
}

struct KesshoWebOriginPolicy: Equatable {
    let scheme: String
    let host: String
    let port: Int

    init(origin: URL) {
        let scheme = origin.scheme?.lowercased() ?? ""
        self.scheme = scheme
        self.host = origin.host?.lowercased() ?? ""
        self.port = origin.port ?? Self.defaultPort(for: scheme)
    }

    func allows(_ url: URL?) -> Bool {
        guard let url else { return false }
        return allows(
            scheme: url.scheme,
            host: url.host,
            port: url.port ?? Self.defaultPort(for: url.scheme)
        )
    }

    func allowsMainFrame(_ frameInfo: WKFrameInfo) -> Bool {
        let origin = frameInfo.securityOrigin
        return allowsMainFrame(
            isMainFrame: frameInfo.isMainFrame,
            scheme: origin.protocol,
            host: origin.host,
            port: origin.port
        )
    }

    func allowsMainFrame(isMainFrame: Bool, scheme: String?, host: String?, port: Int) -> Bool {
        isMainFrame && allows(scheme: scheme, host: host, port: port)
    }

    func shouldOpenExternalNavigation(targetIsMainFrame: Bool?) -> Bool {
        targetIsMainFrame ?? true
    }

    private func allows(scheme: String?, host: String?, port: Int) -> Bool {
        guard let scheme, let host else { return false }
        return self.scheme == scheme.lowercased()
            && self.host == host.lowercased()
            && self.port == port
    }

    private static func defaultPort(for scheme: String?) -> Int {
        switch scheme?.lowercased() {
        case "http": return 80
        case "https": return 443
        default: return -1
        }
    }
}

struct KesshoWebView: NSViewRepresentable {
    @ObservedObject var runtime: KesshoMacRuntime

    func makeCoordinator() -> Coordinator {
        Coordinator(runtime: runtime)
    }

    func makeNSView(context: Context) -> WKWebView {
        let userContentController = WKUserContentController()
        userContentController.addUserScript(WKUserScript(
            source: Self.capacitorRuntimeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        userContentController.add(context.coordinator, name: "kesshoCapacitor")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController
        configuration.websiteDataStore = .default()
        configuration.allowsAirPlayForMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.customUserAgent = KesshoMacUserAgent.value
        webView.pageZoom = 1.0
        #if DEBUG
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        #endif

        runtime.attach(webView)
        runtime.startWebApp { url in
            webView.load(URLRequest(url: url))
        }

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        private let runtime: KesshoMacRuntime
        private let originPolicy: KesshoWebOriginPolicy

        init(runtime: KesshoMacRuntime) {
            self.runtime = runtime
            self.originPolicy = runtime.trustedWebOrigin
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard originPolicy.allowsMainFrame(message.frameInfo) else { return }
            runtime.handleBridgeMessage(message.body)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if originPolicy.allows(url) {
                decisionHandler(.allow)
            } else {
                if originPolicy.shouldOpenExternalNavigation(targetIsMainFrame: navigationAction.targetFrame?.isMainFrame) {
                    openExternalLink(url)
                }
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            guard let url = navigationResponse.response.url else {
                decisionHandler(.cancel)
                return
            }

            if originPolicy.allows(url) {
                decisionHandler(.allow)
            } else {
                if originPolicy.shouldOpenExternalNavigation(targetIsMainFrame: navigationResponse.isForMainFrame) {
                    openExternalLink(url)
                }
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }

            if originPolicy.allows(url) {
                webView.load(navigationAction.request)
            } else {
                openExternalLink(url)
            }
            return nil
        }

        private func openExternalLink(_ url: URL) {
            guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return }
            _ = NSWorkspace.shared.open(url)
        }
    }

    private static let capacitorRuntimeScript = """
    (() => {
      if (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'macos') return;

      const pending = new Map();
      const listeners = new Map();
      let nextId = 1;

      function key(plugin, eventName) {
        return plugin + ':' + eventName;
      }

      function call(plugin, method, options) {
        return new Promise((resolve, reject) => {
          const id = String(nextId++);
          pending.set(id, { resolve, reject });
          window.webkit.messageHandlers.kesshoCapacitor.postMessage({
            id,
            plugin,
            method,
            options: options || {},
          });
        });
      }

      function addListener(plugin, eventName, callback) {
        const listenerKey = key(plugin, eventName);
        const bucket = listeners.get(listenerKey) || new Set();
        bucket.add(callback);
        listeners.set(listenerKey, bucket);
        return Promise.resolve({
          remove: () => {
            const current = listeners.get(listenerKey);
            if (current) current.delete(callback);
            return Promise.resolve();
          },
        });
      }

      window.__kesshoCapacitorResolve = (envelope) => {
        const entry = pending.get(envelope.id);
        if (!entry) return;
        pending.delete(envelope.id);
        if (envelope.success) {
          entry.resolve(envelope.value);
        } else {
          entry.reject(new Error(envelope.error || 'Native bridge call failed.'));
        }
      };

      window.__kesshoCapacitorDispatchEvent = (envelope) => {
        const bucket = listeners.get(key(envelope.plugin, envelope.eventName));
        if (!bucket) return;
        bucket.forEach((callback) => {
          try {
            callback(envelope.data);
          } catch (error) {
            console.error(error);
          }
        });
      };

      const KesshoMidiRouting = {
        getStatus: () => call('KesshoMidiRouting', 'getStatus'),
        start: () => call('KesshoMidiRouting', 'start'),
        stop: () => call('KesshoMidiRouting', 'stop'),
        refreshInputs: () => call('KesshoMidiRouting', 'refreshInputs'),
        connectInput: (options) => call('KesshoMidiRouting', 'connectInput', options),
        disconnectInput: (options) => call('KesshoMidiRouting', 'disconnectInput', options),
        disconnectAllInputs: () => call('KesshoMidiRouting', 'disconnectAllInputs'),
        setConnectedInputs: (options) => call('KesshoMidiRouting', 'setConnectedInputs', options),
        addListener: (eventName, callback) => addListener('KesshoMidiRouting', eventName, callback),
      };

      const KesshoMacShell = {
        getStatus: () => call('KesshoMacShell', 'getStatus'),
        getAudioOutputStatus: () => call('KesshoMacShell', 'getAudioOutputStatus'),
        openSoundSettings: () => call('KesshoMacShell', 'openSoundSettings'),
        setPlaybackState: (options) => call('KesshoMacShell', 'setPlaybackState', options),
        addListener: (eventName, callback) => addListener('KesshoMacShell', eventName, callback),
      };

      const KesshoAudioSession = {
        getStatus: () => call('KesshoAudioSession', 'getStatus'),
        syncState: (options) => call('KesshoAudioSession', 'syncState', options),
        startPlayback: (options) => call('KesshoAudioSession', 'startPlayback', options),
        stopPlayback: () => call('KesshoAudioSession', 'stopPlayback'),
        startNativeRendererForDiagnostics: () => call('KesshoAudioSession', 'startNativeRendererForDiagnostics'),
        stopNativeRendererForDiagnostics: () => call('KesshoAudioSession', 'stopNativeRendererForDiagnostics'),
        probeNativeRendererForDiagnostics: () => call('KesshoAudioSession', 'probeNativeRendererForDiagnostics'),
        prepareNativeProductRuntime: () => call('KesshoAudioSession', 'prepareNativeProductRuntime'),
        loadNativeProductSnapshot: (options) => call('KesshoAudioSession', 'loadNativeProductSnapshot', options),
        enqueueNativeProductEvents: (options) => call('KesshoAudioSession', 'enqueueNativeProductEvents', options),
        registerNativeProductFileAsset: (options) => call('KesshoAudioSession', 'registerNativeProductFileAsset', options),
        registerNativeProductDecodedAsset: (options) => call('KesshoAudioSession', 'registerNativeProductDecodedAsset', options),
        unregisterNativeProductAsset: (options) => call('KesshoAudioSession', 'unregisterNativeProductAsset', options),
        resetNativeProductRuntime: () => call('KesshoAudioSession', 'resetNativeProductRuntime'),
        startNativeProductRuntime: () => call('KesshoAudioSession', 'startNativeProductRuntime'),
        stopNativeProductRuntime: () => call('KesshoAudioSession', 'stopNativeProductRuntime'),
        getNativeProductTelemetry: () => call('KesshoAudioSession', 'getNativeProductTelemetry'),
        setNativeProductInteractionDemand: (options) => call('KesshoAudioSession', 'setNativeProductInteractionDemand', options),
        setNowPlaying: (options) => call('KesshoAudioSession', 'setNowPlaying', options),
        setPlaybackState: (options) => call('KesshoAudioSession', 'setPlaybackState', options),
        addListener: (eventName, callback) => addListener('KesshoAudioSession', eventName, callback),
      };

      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'macos',
        Plugins: {
          KesshoAudioSession,
          KesshoMidiRouting,
          KesshoMacShell,
        },
      };
    })();
    """
}

enum KesshoMacUserAgent {
    static let value = makeUserAgent(
        productName: Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String,
        version: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    )

    static func makeUserAgent(productName: String?, version: String?) -> String {
        "\(sanitize(productName, fallback: "KesshoCapacitorMac"))/\(sanitize(version, fallback: "1.0"))"
    }

    private static func sanitize(_ value: String?, fallback: String) -> String {
        let sanitized = (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[^A-Za-z0-9._-]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-._"))
        guard !sanitized.isEmpty else { return fallback }
        return String(sanitized.prefix(64))
    }
}

enum KesshoMacWebViewSecuritySmoke {
    static func runAndExit() -> Never {
        let policy = KesshoWebOriginPolicy(origin: StaticWebServer.originURL)
        let sameOrigin = URL(string: "http://127.0.0.1:\(StaticWebServer.port.rawValue)/presets?smoke=1")
        let metadataUserAgent = KesshoMacUserAgent.makeUserAgent(
            productName: "Kessho Capacitor / Preview",
            version: "2.4 beta"
        )
        let fallbackUserAgent = KesshoMacUserAgent.makeUserAgent(productName: nil, version: nil)
        let checks: [(String, Bool)] = [
            ("same-origin navigation", policy.allows(sameOrigin)),
            ("different host", !policy.allows(URL(string: "http://localhost:\(StaticWebServer.port.rawValue)/"))),
            ("different port", !policy.allows(URL(string: "http://127.0.0.1:80/"))),
            ("different scheme", !policy.allows(URL(string: "https://127.0.0.1:\(StaticWebServer.port.rawValue)/"))),
            ("trusted main frame", policy.allowsMainFrame(
                isMainFrame: true,
                scheme: "HTTP",
                host: "127.0.0.1",
                port: Int(StaticWebServer.port.rawValue)
            )),
            ("untrusted subframe", !policy.allowsMainFrame(
                isMainFrame: false,
                scheme: "http",
                host: "127.0.0.1",
                port: Int(StaticWebServer.port.rawValue)
            )),
            ("external main-frame handoff", policy.shouldOpenExternalNavigation(targetIsMainFrame: true)),
            ("external new-window handoff", policy.shouldOpenExternalNavigation(targetIsMainFrame: nil)),
            ("external subframe suppression", !policy.shouldOpenExternalNavigation(targetIsMainFrame: false)),
            ("sanitized metadata user agent", metadataUserAgent == "Kessho-Capacitor-Preview/2.4-beta"),
            ("user agent fallback", fallbackUserAgent == "KesshoCapacitorMac/1.0"),
        ]

        guard checks.allSatisfy({ $0.1 }) else {
            let failed = checks.filter { !$0.1 }.map { $0.0 }.joined(separator: ", ")
            fputs("Kessho Capacitor macOS WebView security smoke failed: \(failed)\n", stderr)
            Darwin.exit(1)
        }
        print("Kessho Capacitor macOS WebView security smoke passed")
        Darwin.exit(0)
    }
}

enum KesshoMacNativeDiagnosticsSmoke {
    static func runAndExit() -> Never {
        do {
            let engine = KesshoAppleProductAudioEngine(sampleRate: 48_000, maxBlockSize: 256)
            guard engine.renderer().isValid() else {
                throw BridgeError.runtime("macOS app native Product Core renderer is invalid")
            }
            let probe = try engine.runOfflineOutputProbe()
            let peak = probe["peak"]?.doubleValue ?? 0
            let rms = probe["rms"]?.doubleValue ?? 0
            guard peak > 0.00001, rms > 0.000001 else {
                throw BridgeError.runtime("macOS app native Product Core probe stayed silent")
            }
            try engine.primeDiagnosticOutput()
            try engine.start()
            guard engine.isRunning() else {
                throw BridgeError.runtime("macOS app native Product Core engine did not start")
            }
            engine.stop()
            print("Kessho Capacitor macOS native Product Core diagnostics smoke passed peak=\(peak) rms=\(rms)")
            Darwin.exit(0)
        } catch {
            fputs("Kessho Capacitor macOS native Product Core diagnostics smoke failed: \(error.localizedDescription)\n", stderr)
            Darwin.exit(1)
        }
    }

    @MainActor
    static func runBackgroundAndExit() -> Never {
        do {
            let host = KesshoMacAudioSessionHost(observeNotifications: false)
            _ = try host.startNativeProductRendererForDiagnostics()
            try assertStatus(host, key: "nativeProductRendererRunning", equals: true)
            let outputObserver = MacAudioOutputObserver()
            outputObserver.onChange = { _ in
                host.handleOutputDeviceChange()
            }
            outputObserver.start()
            outputObserver.emitCurrentStatusForDiagnostics()
            try assertStatus(host, key: "routeChangeCount", equals: 1)
            try assertStatus(host, key: "lastRouteChangeReason", equals: "outputDeviceChanged")
            try assertStatus(host, key: "nativeProductRendererRunning", equals: true)
            let framesBeforeHide = try host.nativeRenderedSampleTime()
            let application = NSApplication.shared
            application.setActivationPolicy(.accessory)
            application.hide(nil)
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.5))
            let framesAfterHide = try host.nativeRenderedSampleTime()
            guard application.isHidden, framesAfterHide > framesBeforeHide else {
                throw BridgeError.runtime("native Product Core did not advance while the app was hidden")
            }
            try assertStatus(host, key: "routeChangeCount", equals: 1)
            try assertStatus(host, key: "lastRouteChangeReason", equals: "outputDeviceChanged")
            host.recordSleepBeganForDiagnostics()
            try assertStatus(host, key: "interruptionBeginCount", equals: 1)
            try assertStatus(host, key: "lastInterruptionType", equals: "began")
            host.recordWakeEndedForDiagnostics()
            try assertStatus(host, key: "interruptionEndCount", equals: 1)
            try assertStatus(host, key: "mediaServicesResetCount", equals: 0)
            try assertStatus(host, key: "lastNativeProductRendererError", equals: "none")
            try assertStatus(host, key: "nativeProductRendererRunning", equals: true)
            _ = host.stopNativeProductRendererForDiagnostics()
            let probe = try host.probeNativeProductRendererForDiagnostics()
            let peak = probe["nativeProductRendererProbePeak"] as? Double ?? 0
            let rms = probe["nativeProductRendererProbeRms"] as? Double ?? 0
            guard peak > 0.00001, rms > 0.000001 else {
                throw BridgeError.runtime("macOS app native Product Core background probe stayed silent")
            }
            print("Kessho Capacitor macOS native Product Core background smoke passed peak=\(peak) rms=\(rms) hiddenFrames=\(framesAfterHide - framesBeforeHide)")
            Darwin.exit(0)
        } catch {
            fputs("Kessho Capacitor macOS native Product Core background smoke failed: \(error.localizedDescription)\n", stderr)
            Darwin.exit(1)
        }
    }

    @MainActor
    private static func assertStatus(_ host: KesshoMacAudioSessionHost, key: String, equals expected: Bool) throws {
        guard let actual = host.statusPayload()[key] as? Bool, actual == expected else {
            throw BridgeError.runtime("expected \(key)=\(expected)")
        }
    }

    @MainActor
    private static func assertStatus(_ host: KesshoMacAudioSessionHost, key: String, equals expected: Int) throws {
        guard let actual = host.statusPayload()[key] as? Int, actual == expected else {
            throw BridgeError.runtime("expected \(key)=\(expected)")
        }
    }

    @MainActor
    private static func assertStatus(_ host: KesshoMacAudioSessionHost, key: String, equals expected: String) throws {
        guard let actual = host.statusPayload()[key] as? String, actual == expected else {
            throw BridgeError.runtime("expected \(key)=\(expected)")
        }
    }
}

@MainActor
final class KesshoMacAudioSessionHost {
    private var nativeProductEngine: KesshoAppleProductAudioEngine?
    private var notificationObservers: [NSObjectProtocol] = []

    private(set) var isPlaying = false
    private(set) var nativeProductRendererPrepared = false
    private(set) var nativeProductRendererRunning = false
    private(set) var nativeProductRendererStartCount = 0
    private(set) var nativeProductRendererStopCount = 0
    private(set) var nativeProductRendererProbePeak = 0.0
    private(set) var nativeProductRendererProbeRms = 0.0
    private(set) var nativeProductRendererProbeRenderedFrames = 0
    private(set) var nativeProductRendererProbeSampleRate = 0.0
    private(set) var lastNativeProductRendererError = "none"
    private(set) var routeChangeCount = 0
    private(set) var interruptionBeginCount = 0
    private(set) var interruptionEndCount = 0
    private(set) var mediaServicesResetCount = 0
    private(set) var lastRouteChangeReason = "none"
    private(set) var lastInterruptionType = "none"

    var onAudioSessionEvent: (([String: Any]) -> Void)?

    init(observeNotifications: Bool = true) {
        if observeNotifications {
            observeSystemNotifications()
        }
    }

    deinit {
        for observer in notificationObservers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    func start() {
        isPlaying = true
    }

    func stop() {
        isPlaying = false
        _ = stopNativeProductRendererForDiagnostics()
    }

    func prepareNativeProductRuntime() -> [String: Any] {
        prepareNativeProductRenderer()
        return statusPayload()
    }

    func loadNativeProductSnapshot(_ options: [String: Any]) throws {
        prepareNativeProductRenderer()
        guard let encoded = options["snapshotBase64"] as? String,
              let data = Data(base64Encoded: encoded),
              let engine = nativeProductEngine else {
            throw BridgeError.runtime("invalid native Product Core snapshot")
        }
        try mutateNativeProductEngine(engine) { engine.loadSnapshotData(data) }
    }

    func enqueueNativeProductEvents(_ options: [String: Any]) throws {
        prepareNativeProductRenderer()
        guard let encoded = options["eventsBase64"] as? String,
              let data = Data(base64Encoded: encoded),
              let engine = nativeProductEngine,
              engine.enqueueEventsData(data) else {
            throw BridgeError.runtime("invalid native Product Core event batch")
        }
    }

    func registerNativeProductFileAsset(_ options: [String: Any]) throws {
        prepareNativeProductRenderer()
        guard let assetId = Self.uint32(options["assetId"]),
              let assetPath = options["assetPath"] as? String,
              let flags = Self.uint32(options["flags"]),
              let engine = nativeProductEngine else {
            throw BridgeError.runtime("invalid native Product Core file asset")
        }
        let root = Bundle.main.resourceURL!.appendingPathComponent("WebApp", isDirectory: true).standardizedFileURL
        let relativePath = (assetPath.removingPercentEncoding ?? assetPath).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let url = root.appendingPathComponent(relativePath).standardizedFileURL
        guard url.path.hasPrefix(root.path + "/"), FileManager.default.fileExists(atPath: url.path) else {
            throw BridgeError.runtime("native Product Core asset path is outside the app bundle")
        }
        try mutateNativeProductEngine(engine) {
            try engine.registerAudioFileAsset(withId: assetId, url: url, flags: flags)
            return true
        }
    }

    func registerNativeProductDecodedAsset(_ options: [String: Any]) throws {
        prepareNativeProductRenderer()
        guard let assetId = Self.uint32(options["assetId"]),
              let sampleRate = options["sampleRate"] as? Double,
              let flags = Self.uint32(options["flags"]),
              let encodedChannels = options["channelsBase64"] as? [String],
              let engine = nativeProductEngine else {
            throw BridgeError.runtime("invalid native Product Core decoded asset")
        }
        let channels = try encodedChannels.map { encoded -> Data in
            guard let data = Data(base64Encoded: encoded) else {
                throw BridgeError.runtime("invalid native Product Core decoded asset channel")
            }
            return data
        }
        try mutateNativeProductEngine(engine) {
            engine.registerDecodedAsset(withId: assetId, channels: channels, sampleRate: sampleRate, flags: flags)
        }
    }

    func unregisterNativeProductAsset(_ options: [String: Any]) throws {
        guard let assetId = Self.uint32(options["assetId"]),
              let engine = nativeProductEngine else {
            throw BridgeError.runtime("native Product Core asset release failed")
        }
        try mutateNativeProductEngine(engine) { engine.unregisterAsset(withId: assetId) }
    }

    func resetNativeProductRuntime() throws {
        guard let engine = nativeProductEngine else {
            throw BridgeError.runtime("native Product Core reset failed")
        }
        try mutateNativeProductEngine(engine) { engine.resetRenderer() }
    }

    func startNativeProductRuntime() throws -> [String: Any] {
        prepareNativeProductRenderer()
        guard let engine = nativeProductEngine else {
            throw BridgeError.runtime("native Product Core engine unavailable")
        }
        try engine.start()
        nativeProductRendererRunning = engine.isRunning()
        nativeProductRendererStartCount += 1
        isPlaying = true
        return statusPayload()
    }

    func stopNativeProductRuntime() -> [String: Any] {
        nativeProductEngine?.stop()
        nativeProductRendererRunning = false
        nativeProductRendererStopCount += 1
        isPlaying = false
        return statusPayload()
    }

    func nativeProductTelemetry() throws -> [String: Any] {
        guard let data = nativeProductEngine?.copyTelemetryData(),
              let interaction = nativeProductEngine?.copyInteractionSignalsData(),
              let engine = nativeProductEngine else {
            throw BridgeError.runtime("native Product Core telemetry unavailable")
        }
        let interactionEvents = engine.copyInteractionEventsData()
        return [
            "telemetryBase64": data.base64EncodedString(),
            "interactionBase64": interaction.base64EncodedString(),
            "interactionEventsBase64": interactionEvents.base64EncodedString(),
            "interactionEventOverflowCount": engine.interactionEventOverflowCount()
        ]
    }

    func setNativeProductInteractionDemand(_ options: [String: Any]) throws {
        guard let demandMask = Self.uint32(options["demandMask"]),
              let sourceMask = Self.uint32(options["sourceMask"]),
              let engine = nativeProductEngine,
              engine.setInteractionDemandMask(demandMask, sourceMask: sourceMask) else {
            throw BridgeError.runtime("native Product Core interaction demand failed")
        }
    }

    func nativeRenderedSampleTime() throws -> UInt64 {
        guard let data = nativeProductEngine?.copyTelemetryData(),
              data.count == MemoryLayout<KesshoProductTelemetry>.size else {
            throw BridgeError.runtime("native Product Core telemetry unavailable")
        }
        return data.withUnsafeBytes { rawBuffer in
            rawBuffer.loadUnaligned(as: KesshoProductTelemetry.self).absolute_sample_time
        }
    }

    private static func uint32(_ value: Any?) -> UInt32? {
        guard let number = value as? NSNumber else { return nil }
        let raw = number.int64Value
        return raw >= 0 && raw <= UInt32.max ? UInt32(raw) : nil
    }

    private func mutateNativeProductEngine(
        _ engine: KesshoAppleProductAudioEngine,
        operation: () throws -> Bool
    ) throws {
        let shouldResume = engine.isRunning()
        if shouldResume { engine.stop() }
        do {
            guard try operation() else {
                throw BridgeError.runtime("native Product Core mutation failed")
            }
            if shouldResume { try engine.start() }
            nativeProductRendererRunning = engine.isRunning()
        } catch {
            if shouldResume { try? engine.start() }
            nativeProductRendererRunning = engine.isRunning()
            throw error
        }
    }

    func statusPayload() -> [String: Any] {
        [
            "available": true,
            "mode": "capacitor-macos-product-core",
            "isPlaying": isPlaying,
            "supportsBackgroundAudio": true,
            "nativeProductRendererPrepared": nativeProductRendererPrepared,
            "nativeProductRendererRunning": nativeProductRendererRunning,
            "nativeProductRendererStartCount": nativeProductRendererStartCount,
            "nativeProductRendererStopCount": nativeProductRendererStopCount,
            "nativeProductRendererProbePeak": nativeProductRendererProbePeak,
            "nativeProductRendererProbeRms": nativeProductRendererProbeRms,
            "nativeProductRendererProbeRenderedFrames": nativeProductRendererProbeRenderedFrames,
            "nativeProductRendererProbeSampleRate": nativeProductRendererProbeSampleRate,
            "lastNativeProductRendererError": lastNativeProductRendererError,
            "routeChangeCount": routeChangeCount,
            "interruptionBeginCount": interruptionBeginCount,
            "interruptionEndCount": interruptionEndCount,
            "mediaServicesResetCount": mediaServicesResetCount,
            "lastRouteChangeReason": lastRouteChangeReason,
            "lastInterruptionType": lastInterruptionType,
        ]
    }

    func startNativeProductRendererForDiagnostics() throws -> [String: Any] {
        prepareNativeProductRenderer()
        guard let nativeProductEngine else {
            lastNativeProductRendererError = "native Product Core engine unavailable"
            throw BridgeError.runtime(lastNativeProductRendererError)
        }
        do {
            try nativeProductEngine.primeDiagnosticOutput()
            try nativeProductEngine.start()
            nativeProductRendererRunning = nativeProductEngine.isRunning()
            nativeProductRendererStartCount += 1
            isPlaying = true
            lastNativeProductRendererError = "none"
            return statusPayload()
        } catch {
            nativeProductRendererRunning = false
            lastNativeProductRendererError = "\(error)"
            throw error
        }
    }

    func stopNativeProductRendererForDiagnostics() -> [String: Any] {
        nativeProductEngine?.stop()
        nativeProductRendererRunning = false
        nativeProductRendererStopCount += 1
        return statusPayload()
    }

    func probeNativeProductRendererForDiagnostics() throws -> [String: Any] {
        if nativeProductRendererRunning {
            lastNativeProductRendererError = "stop native Product Core renderer before offline probe"
            throw BridgeError.runtime(lastNativeProductRendererError)
        }
        prepareNativeProductRenderer()
        guard let nativeProductEngine else {
            lastNativeProductRendererError = "native Product Core engine unavailable"
            throw BridgeError.runtime(lastNativeProductRendererError)
        }
        do {
            let result = try nativeProductEngine.runOfflineOutputProbe()
            nativeProductRendererProbePeak = result["peak"]?.doubleValue ?? 0
            nativeProductRendererProbeRms = result["rms"]?.doubleValue ?? 0
            nativeProductRendererProbeRenderedFrames = result["renderedFrames"]?.intValue ?? 0
            nativeProductRendererProbeSampleRate = result["sampleRate"]?.doubleValue ?? 0
            lastNativeProductRendererError = "none"
            return statusPayload()
        } catch {
            lastNativeProductRendererError = "\(error)"
            throw error
        }
    }

    private func prepareNativeProductRenderer(sampleRate: Double = 48_000, maxBlockSize: UInt32 = 1024) {
        if nativeProductEngine == nil {
            nativeProductEngine = KesshoAppleProductAudioEngine(sampleRate: sampleRate, maxBlockSize: maxBlockSize)
        }
        nativeProductRendererPrepared = nativeProductEngine != nil
    }

    private func observeSystemNotifications() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        notificationObservers.append(workspaceCenter.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleInterruptionBegan()
            }
        })
        notificationObservers.append(workspaceCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleInterruptionEnded()
            }
        })
    }

    func recordSleepBeganForDiagnostics() {
        handleInterruptionBegan()
    }

    func recordWakeEndedForDiagnostics() {
        handleInterruptionEnded()
    }

    func handleOutputDeviceChange() {
        handleRouteChange(reason: "outputDeviceChanged")
    }

    private func handleRouteChange(reason: String) {
        routeChangeCount += 1
        lastRouteChangeReason = reason
        do {
            try nativeProductEngine?.recoverAfterRouteChange()
            nativeProductRendererRunning = nativeProductEngine?.isRunning() ?? false
            lastNativeProductRendererError = "none"
        } catch {
            nativeProductRendererRunning = false
            lastNativeProductRendererError = "\(error)"
        }
        onAudioSessionEvent?([
            "type": "routeChange",
            "reason": lastRouteChangeReason,
            "routeChangeCount": routeChangeCount,
        ])
    }

    private func handleInterruptionBegan() {
        interruptionBeginCount += 1
        lastInterruptionType = "began"
        nativeProductEngine?.handleInterruptionBegan()
        nativeProductRendererRunning = nativeProductEngine?.isRunning() ?? false
        onAudioSessionEvent?([
            "type": "interruption",
            "interruptionType": lastInterruptionType,
            "interruptionBeginCount": interruptionBeginCount,
            "interruptionEndCount": interruptionEndCount,
        ])
    }

    private func handleInterruptionEnded() {
        interruptionEndCount += 1
        lastInterruptionType = "ended"
        do {
            try nativeProductEngine?.handleInterruptionEndedShouldResume(isPlaying)
            nativeProductRendererRunning = nativeProductEngine?.isRunning() ?? false
            lastNativeProductRendererError = "none"
        } catch {
            nativeProductRendererRunning = false
            lastNativeProductRendererError = "\(error)"
        }
        onAudioSessionEvent?([
            "type": "interruption",
            "interruptionType": lastInterruptionType,
            "interruptionBeginCount": interruptionBeginCount,
            "interruptionEndCount": interruptionEndCount,
            "mediaServicesResetCount": mediaServicesResetCount,
        ])
    }
}

@MainActor
final class MacPerformanceActivity {
    private var activityToken: NSObjectProtocol?
    private(set) var isPlaybackActive = false

    var isActivityActive: Bool {
        activityToken != nil
    }

    func setPlaybackActive(_ active: Bool, title: String?) {
        isPlaybackActive = active

        if active {
            begin(reason: "Kessho audio playback\(title.map { ": \($0)" } ?? "")")
        } else {
            end()
        }
    }

    private func begin(reason: String) {
        guard activityToken == nil else { return }
        activityToken = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiated, .latencyCritical, .idleSystemSleepDisabled],
            reason: reason
        )
        ProcessInfo.processInfo.disableAutomaticTermination(reason)
    }

    private func end() {
        if let activityToken {
            ProcessInfo.processInfo.endActivity(activityToken)
            self.activityToken = nil
        }
        ProcessInfo.processInfo.enableAutomaticTermination("Kessho audio playback stopped")
    }

    deinit {
        if let activityToken {
            ProcessInfo.processInfo.endActivity(activityToken)
        }
    }
}

enum MacAudioOutputInspector {
    static func statusPayload() -> [String: Any] {
        guard let deviceID = defaultOutputDeviceID() else {
            return [
                "available": false,
                "deviceID": 0,
                "outputName": "Unknown Output",
                "transportType": "unknown",
                "transportCode": 0,
                "isAirPlay": false,
                "sampleRate": NSNull(),
                "bufferFrameSize": NSNull(),
            ]
        }

        let transportCode = uint32Property(
            deviceID: deviceID,
            selector: kAudioDevicePropertyTransportType,
            scope: kAudioObjectPropertyScopeGlobal
        ) ?? 0
        let sampleRate = doubleProperty(
            deviceID: deviceID,
            selector: kAudioDevicePropertyNominalSampleRate,
            scope: kAudioObjectPropertyScopeGlobal
        )
        let bufferFrameSize = uint32Property(
            deviceID: deviceID,
            selector: kAudioDevicePropertyBufferFrameSize,
            scope: kAudioObjectPropertyScopeGlobal
        )

        return [
            "available": true,
            "deviceID": Int(deviceID),
            "outputName": stringProperty(deviceID: deviceID, selector: kAudioObjectPropertyName)
                ?? "Output \(deviceID)",
            "transportType": transportName(transportCode),
            "transportCode": Int(transportCode),
            "isAirPlay": transportCode == kAudioDeviceTransportTypeAirPlay,
            "sampleRate": sampleRate.map { NSNumber(value: $0) } ?? NSNull(),
            "bufferFrameSize": bufferFrameSize.map { NSNumber(value: $0) } ?? NSNull(),
        ]
    }

    @MainActor
    static func openSoundSettings() -> Bool {
        let candidates = [
            URL(string: "x-apple.systempreferences:com.apple.Sound-Settings.extension"),
            URL(fileURLWithPath: "/System/Applications/System Settings.app"),
            URL(fileURLWithPath: "/System/Applications/System Preferences.app"),
        ].compactMap { $0 }

        for url in candidates {
            if NSWorkspace.shared.open(url) {
                return true
            }
        }
        return false
    }

    static func defaultOutputDeviceID() -> AudioDeviceID? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceID = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &deviceID
        )
        guard status == noErr, deviceID != kAudioObjectUnknown else {
            return nil
        }
        return deviceID
    }

    private static func stringProperty(
        deviceID: AudioDeviceID,
        selector: AudioObjectPropertySelector
    ) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(deviceID, &address) else {
            return nil
        }
        let valuePointer = UnsafeMutablePointer<CFString?>.allocate(capacity: 1)
        valuePointer.initialize(to: nil)
        defer {
            valuePointer.deinitialize(count: 1)
            valuePointer.deallocate()
        }
        var size = UInt32(MemoryLayout<CFString?>.size)
        let status = AudioObjectGetPropertyData(
            deviceID,
            &address,
            0,
            nil,
            &size,
            UnsafeMutableRawPointer(valuePointer)
        )
        guard status == noErr else {
            return nil
        }
        return valuePointer.pointee as String?
    }

    private static func uint32Property(
        deviceID: AudioDeviceID,
        selector: AudioObjectPropertySelector,
        scope: AudioObjectPropertyScope
    ) -> UInt32? {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(deviceID, &address) else {
            return nil
        }
        var value = UInt32(0)
        var size = UInt32(MemoryLayout<UInt32>.size)
        let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &value)
        return status == noErr ? value : nil
    }

    private static func doubleProperty(
        deviceID: AudioDeviceID,
        selector: AudioObjectPropertySelector,
        scope: AudioObjectPropertyScope
    ) -> Double? {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(deviceID, &address) else {
            return nil
        }
        var value = Float64(0)
        var size = UInt32(MemoryLayout<Float64>.size)
        let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &value)
        return status == noErr ? Double(value) : nil
    }

    private static func transportName(_ transportCode: UInt32) -> String {
        switch transportCode {
        case kAudioDeviceTransportTypeAirPlay:
            return "airplay"
        case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE:
            return "bluetooth"
        case kAudioDeviceTransportTypeBuiltIn:
            return "built-in"
        case kAudioDeviceTransportTypeUSB:
            return "usb"
        case kAudioDeviceTransportTypeHDMI:
            return "hdmi"
        case kAudioDeviceTransportTypeDisplayPort:
            return "display-port"
        case kAudioDeviceTransportTypeAggregate:
            return "aggregate"
        case kAudioDeviceTransportTypeVirtual:
            return "virtual"
        default:
            return fourCharCodeString(transportCode) ?? "unknown"
        }
    }

    private static func fourCharCodeString(_ code: UInt32) -> String? {
        let bytes = [
            UInt8((code >> 24) & 0xff),
            UInt8((code >> 16) & 0xff),
            UInt8((code >> 8) & 0xff),
            UInt8(code & 0xff),
        ]
        guard bytes.allSatisfy({ $0 >= 32 && $0 <= 126 }) else {
            return nil
        }
        return String(bytes: bytes, encoding: .ascii)
    }
}

@MainActor
final class MacAudioOutputObserver {
    private let systemObject = AudioObjectID(kAudioObjectSystemObject)
    private var observedDeviceID: AudioDeviceID?
    private var lastPayloadData: Data?
    var onChange: (([String: Any]) -> Void)?

    private lazy var defaultDeviceListener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
        Task { @MainActor in
            self?.bindDefaultDevice()
            self?.emitIfChanged()
        }
    }
    private lazy var devicesListener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
        Task { @MainActor in
            self?.bindDefaultDevice()
            self?.emitIfChanged()
        }
    }
    private lazy var deviceListener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
        Task { @MainActor in
            self?.emitIfChanged()
        }
    }

    func start() {
        var address = Self.defaultDeviceAddress
        AudioObjectAddPropertyListenerBlock(systemObject, &address, .main, defaultDeviceListener)
        address = Self.devicesAddress
        AudioObjectAddPropertyListenerBlock(systemObject, &address, .main, devicesListener)
        bindDefaultDevice()
    }

    private func bindDefaultDevice() {
        let deviceID = MacAudioOutputInspector.defaultOutputDeviceID()
        guard deviceID != observedDeviceID else { return }
        unbindDevice()
        observedDeviceID = deviceID
        guard let deviceID else { return }
        for var address in Self.deviceAddresses {
            AudioObjectAddPropertyListenerBlock(deviceID, &address, .main, deviceListener)
        }
    }

    private func unbindDevice() {
        guard let deviceID = observedDeviceID else { return }
        for var address in Self.deviceAddresses {
            AudioObjectRemovePropertyListenerBlock(deviceID, &address, .main, deviceListener)
        }
        observedDeviceID = nil
    }

    private func emitIfChanged() {
        let payload = MacAudioOutputInspector.statusPayload()
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]), data != lastPayloadData else {
            return
        }
        lastPayloadData = data
        onChange?(payload)
    }

    func emitCurrentStatusForDiagnostics() {
        emitIfChanged()
    }

    private static let defaultDeviceAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    private static let devicesAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    private static let deviceAddresses = [
        kAudioObjectPropertyName,
        kAudioDevicePropertyTransportType,
        kAudioDevicePropertyNominalSampleRate,
        kAudioDevicePropertyBufferFrameSize,
    ].map {
        AudioObjectPropertyAddress(
            mSelector: $0,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }
}

final class StaticWebServer {
    static let port = NWEndpoint.Port(rawValue: 49_831)!
    static let originURL = URL(string: "http://127.0.0.1:\(port.rawValue)/")!

    let rootURL: URL
    let originPolicy: KesshoWebOriginPolicy

    private let queue = DispatchQueue(label: "app.kessho.capacitor.mac.webserver")
    private var listener: NWListener?
    private var readyURL: URL?
    private var completions: [(Result<URL, Error>) -> Void] = []

    init(rootURL: URL) {
        self.rootURL = rootURL
        self.originPolicy = KesshoWebOriginPolicy(origin: Self.originURL)
    }

    func start(completion: @escaping (Result<URL, Error>) -> Void) throws {
        if let readyURL {
            completion(.success(readyURL))
            return
        }

        completions.append(completion)
        guard listener == nil else { return }

        guard FileManager.default.fileExists(atPath: rootURL.appendingPathComponent("index.html").path) else {
            throw StaticWebServerError.missingWebBundle(rootURL.path)
        }

        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback

        let listener: NWListener
        do {
            listener = try NWListener(using: parameters, on: Self.port)
        } catch {
            throw StaticWebServerError.bindFailed(Self.port.rawValue, error.localizedDescription)
        }
        self.listener = listener

        listener.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                guard let port = listener.port, port == Self.port else {
                    self.fail(StaticWebServerError.bindFailed(Self.port.rawValue, "The listener did not bind the requested stable port."))
                    return
                }
                self.readyURL = Self.originURL
                let pending = self.completions
                self.completions.removeAll()
                pending.forEach { $0(.success(Self.originURL)) }
            case .failed(let error):
                self.fail(StaticWebServerError.bindFailed(Self.port.rawValue, error.localizedDescription))
            default:
                break
            }
        }

        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection)
        }

        listener.start(queue: queue)
    }

    private func fail(_ error: Error) {
        listener?.cancel()
        listener = nil
        let pending = completions
        completions.removeAll()
        pending.forEach { $0(.failure(error)) }
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, _, error in
            guard let self else {
                connection.cancel()
                return
            }

            if error != nil {
                connection.cancel()
                return
            }

            guard
                let data,
                let request = String(data: data, encoding: .utf8),
                let firstLine = request.split(separator: "\r\n").first
            else {
                self.send(status: 400, body: Data("Bad Request".utf8), mimeType: "text/plain", connection: connection)
                return
            }

            let parts = firstLine.split(separator: " ")
            guard parts.count >= 2 else {
                self.send(status: 400, body: Data("Bad Request".utf8), mimeType: "text/plain", connection: connection)
                return
            }

            let method = String(parts[0])
            let rawPath = String(parts[1])
            guard method == "GET" || method == "HEAD" else {
                self.send(status: 405, body: Data("Method Not Allowed".utf8), mimeType: "text/plain", connection: connection)
                return
            }

            self.serve(rawPath: rawPath, headOnly: method == "HEAD", connection: connection)
        }
    }

    private func serve(rawPath: String, headOnly: Bool, connection: NWConnection) {
        let pathOnly = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
        let decodedPath = pathOnly.removingPercentEncoding ?? pathOnly
        let relativePath = decodedPath == "/" ? "index.html" : String(decodedPath.drop(while: { $0 == "/" }))

        guard !relativePath.contains("..") else {
            send(status: 403, body: Data("Forbidden".utf8), mimeType: "text/plain", connection: connection)
            return
        }

        let fileURL = rootURL.appendingPathComponent(relativePath, isDirectory: false)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
            send(status: 404, body: Data("Not Found".utf8), mimeType: "text/plain", connection: connection)
            return
        }

        do {
            let length = try FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber
            let contentLength = length?.intValue ?? 0
            let mimeType = Self.mimeType(for: fileURL)
            let cacheControl = Self.cacheControl(for: fileURL)

            let body = headOnly ? Data() : try Data(contentsOf: fileURL)
            send(
                status: 200,
                body: body,
                mimeType: mimeType,
                cacheControl: cacheControl,
                contentLength: contentLength > 0 ? contentLength : body.count,
                connection: connection
            )
        } catch {
            send(status: 500, body: Data("Internal Server Error".utf8), mimeType: "text/plain", connection: connection)
        }
    }

    private func send(
        status: Int,
        body: Data,
        mimeType: String,
        cacheControl: String = "no-cache",
        contentLength: Int? = nil,
        connection: NWConnection
    ) {
        let reason: String
        switch status {
        case 200: reason = "OK"
        case 400: reason = "Bad Request"
        case 403: reason = "Forbidden"
        case 404: reason = "Not Found"
        case 405: reason = "Method Not Allowed"
        default: reason = "Internal Server Error"
        }

        let header = """
        HTTP/1.1 \(status) \(reason)\r
        Content-Length: \(contentLength ?? body.count)\r
        Content-Type: \(mimeType)\r
        Cache-Control: \(cacheControl)\r
        Access-Control-Allow-Origin: *\r
        Cross-Origin-Opener-Policy: same-origin\r
        Cross-Origin-Embedder-Policy: require-corp\r
        Connection: close\r
        \r

        """

        connection.send(content: Data(header.utf8), completion: .contentProcessed { error in
            guard error == nil, !body.isEmpty else {
                connection.cancel()
                return
            }
            connection.send(content: body, completion: .contentProcessed { _ in
                connection.cancel()
            })
        })
    }

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "ico": return "image/x-icon"
        case "ogg": return "audio/ogg"
        case "wav": return "audio/wav"
        case "mp3": return "audio/mpeg"
        case "map": return "application/json; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    private static func cacheControl(for url: URL) -> String {
        if url.lastPathComponent == "index.html" {
            return "no-cache"
        }
        return "public, max-age=31536000, immutable"
    }
}

enum StaticWebServerError: LocalizedError {
    case missingWebBundle(String)
    case bindFailed(UInt16, String)

    var errorDescription: String? {
        switch self {
        case .missingWebBundle(let path):
            return "Missing built web bundle at \(path). Run npm run cap:mac:build."
        case .bindFailed(let port, let reason):
            return "Could not bind the Kessho macOS loopback web app to stable port \(port). \(reason)"
        }
    }
}

enum BridgeError: LocalizedError {
    case unknownPlugin(String)
    case unknownMethod(String)
    case missingArgument(String)
    case runtime(String)
    case midiClientCreationFailed(OSStatus)
    case midiInputPortCreationFailed(OSStatus)
    case midiSourceNotFound(Int32)
    case midiSourceConnectionFailed(Int32, OSStatus)
    case midiNotStarted

    var errorDescription: String? {
        switch self {
        case .unknownPlugin(let plugin):
            return "Unknown native plugin \(plugin)."
        case .unknownMethod(let method):
            return "Unknown native method \(method)."
        case .missingArgument(let argument):
            return "Missing argument \(argument)."
        case .runtime(let message):
            return message
        case .midiClientCreationFailed(let status):
            return "Failed to create MIDI client (\(status))."
        case .midiInputPortCreationFailed(let status):
            return "Failed to create MIDI input port (\(status))."
        case .midiSourceNotFound(let uniqueID):
            return "MIDI source not found for unique ID \(uniqueID)."
        case .midiSourceConnectionFailed(let uniqueID, let status):
            return "Failed to connect MIDI source \(uniqueID) (\(status))."
        case .midiNotStarted:
            return "MIDI routing has not been started."
        }
    }
}

enum MacMIDIMessageKind: String {
    case noteOn
    case noteOff
    case controlChange
    case programChange
    case pitchBend
    case channelPressure
    case polyPressure
    case systemExclusive
    case unknown
}

struct MacMIDIEndpointInfo: Equatable {
    let uniqueID: Int32
    let name: String
    let manufacturer: String?
    let isConnected: Bool

    var dictionary: [String: Any] {
        var output: [String: Any] = [
            "uniqueID": Int(uniqueID),
            "name": name,
            "isConnected": isConnected,
        ]
        if let manufacturer {
            output["manufacturer"] = manufacturer
        }
        return output
    }
}

struct MacMIDIMessage {
    let timestamp: TimeInterval
    let timestampHostTime: UInt64
    let kind: MacMIDIMessageKind
    let status: UInt8
    let channel: UInt8?
    let data1: UInt8?
    let data2: UInt8?
    let rawBytes: [UInt8]
    let endpointUniqueID: Int32?
    let endpointName: String?

    var dictionary: [String: Any] {
        var output: [String: Any] = [
            "timestamp": timestamp,
            "timestampHostTime": Double(timestampHostTime),
            "kind": kind.rawValue,
            "status": Int(status),
            "rawBytes": rawBytes.map(Int.init),
        ]
        if let channel {
            output["channel"] = Int(channel)
        }
        if let data1 {
            output["data1"] = Int(data1)
        }
        if let data2 {
            output["data2"] = Int(data2)
        }
        if let endpointUniqueID {
            output["endpointUniqueID"] = Int(endpointUniqueID)
        }
        if let endpointName {
            output["endpointName"] = endpointName
        }
        return output
    }
}

private final class MacMIDIConnection {
    let uniqueID: Int32
    let name: String

    init(uniqueID: Int32, name: String) {
        self.uniqueID = uniqueID
        self.name = name
    }
}

final class MacMidiRouter {
    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var sourceRefsByID: [Int32: MIDIEndpointRef] = [:]
    private var endpointNamesByID: [Int32: String] = [:]
    private var rememberedInputIDs = Set<Int32>()
    private var connectionRefsByID: [Int32: MacMIDIConnection] = [:]

    private(set) var availableInputs: [MacMIDIEndpointInfo] = []
    private(set) var isStarted = false
    private(set) var lastErrorMessage: String?

    var connectedInputIDs: [Int32] {
        connectionRefsByID.keys.sorted()
    }

    var onMessages: (@MainActor ([MacMIDIMessage]) -> Void)?
    var onInputsChanged: (([MacMIDIEndpointInfo]) -> Void)?

    private var callbackRefCon: UnsafeMutableRawPointer {
        UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
    }

    deinit {
        stop()
    }

    func start() throws {
        guard !isStarted else {
            refreshAvailableInputs()
            return
        }

        var clientRef = MIDIClientRef()
        let clientStatus = MIDIClientCreate(
            "Kessho Capacitor Mac MIDI Client" as CFString,
            MacMidiRouter.notifyProc,
            callbackRefCon,
            &clientRef
        )
        guard clientStatus == noErr else {
            lastErrorMessage = BridgeError.midiClientCreationFailed(clientStatus).localizedDescription
            throw BridgeError.midiClientCreationFailed(clientStatus)
        }

        client = clientRef

        var inputPortRef = MIDIPortRef()
        let portStatus = MIDIInputPortCreate(
            client,
            "Kessho Capacitor Mac MIDI Input" as CFString,
            MacMidiRouter.readProc,
            callbackRefCon,
            &inputPortRef
        )
        guard portStatus == noErr else {
            MIDIClientDispose(client)
            client = MIDIClientRef()
            lastErrorMessage = BridgeError.midiInputPortCreationFailed(portStatus).localizedDescription
            throw BridgeError.midiInputPortCreationFailed(portStatus)
        }

        inputPort = inputPortRef
        isStarted = true
        lastErrorMessage = nil
        refreshAvailableInputs()
    }

    func stop() {
        disconnectAllInputs()

        if inputPort != 0 {
            MIDIPortDispose(inputPort)
            inputPort = MIDIPortRef()
        }

        if client != 0 {
            MIDIClientDispose(client)
            client = MIDIClientRef()
        }

        availableInputs = []
        sourceRefsByID.removeAll()
        endpointNamesByID.removeAll()
        rememberedInputIDs.removeAll()
        connectionRefsByID.removeAll()
        isStarted = false
    }

    func refreshAvailableInputs() {
        let previousInputs = availableInputs
        guard isStarted else {
            availableInputs = []
            if previousInputs != availableInputs {
                onInputsChanged?(availableInputs)
            }
            return
        }

        var discovered: [MacMIDIEndpointInfo] = []
        sourceRefsByID.removeAll()
        endpointNamesByID.removeAll()

        let sourceCount = MIDIGetNumberOfSources()
        if sourceCount > 0 {
            discovered.reserveCapacity(Int(sourceCount))
        }

        for index in 0..<sourceCount {
            let source = MIDIGetSource(index)
            guard source != 0 else { continue }

            let uniqueID = Self.endpointUniqueID(for: source)
            let name = Self.endpointName(for: source) ?? "MIDI Source \(index + 1)"
            let manufacturer = Self.endpointManufacturer(for: source)

            discovered.append(
                MacMIDIEndpointInfo(
                    uniqueID: uniqueID,
                    name: name,
                    manufacturer: manufacturer,
                    isConnected: connectionRefsByID[uniqueID] != nil
                )
            )

            sourceRefsByID[uniqueID] = source
            endpointNamesByID[uniqueID] = name
        }

        reconnectRememberedInputs()
        availableInputs = discovered.map { input in
            MacMIDIEndpointInfo(
                uniqueID: input.uniqueID,
                name: input.name,
                manufacturer: input.manufacturer,
                isConnected: connectionRefsByID[input.uniqueID] != nil
            )
        }.sorted { left, right in
            left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
        }
        if previousInputs != availableInputs {
            onInputsChanged?(availableInputs)
        }
    }

    func connectInput(uniqueID: Int32) throws {
        guard isStarted else {
            throw BridgeError.midiNotStarted
        }

        if connectionRefsByID[uniqueID] != nil {
            return
        }

        guard let source = sourceRefsByID[uniqueID] else {
            refreshAvailableInputs()
            guard let refreshed = sourceRefsByID[uniqueID] else {
                throw BridgeError.midiSourceNotFound(uniqueID)
            }
            try connect(source: refreshed, uniqueID: uniqueID)
            refreshAvailableInputs()
            return
        }

        try connect(source: source, uniqueID: uniqueID)
        refreshAvailableInputs()
    }

    func disconnectInput(uniqueID: Int32) {
        disconnect(uniqueID: uniqueID)
        refreshAvailableInputs()
    }

    func disconnectAllInputs() {
        guard inputPort != 0 else {
            connectionRefsByID.removeAll()
            refreshAvailableInputs()
            return
        }

        for uniqueID in connectedInputIDs {
            if let source = sourceRefsByID[uniqueID] {
                MIDIPortDisconnectSource(inputPort, source)
            }
        }

        connectionRefsByID.removeAll()
        rememberedInputIDs.removeAll()
        refreshAvailableInputs()
    }

    func setConnectedInputs(_ uniqueIDs: Set<Int32>) throws {
        refreshAvailableInputs()
        for connectedID in connectedInputIDs where !uniqueIDs.contains(connectedID) {
            disconnect(uniqueID: connectedID)
        }

        for uniqueID in uniqueIDs.sorted() where connectionRefsByID[uniqueID] == nil {
            guard let source = sourceRefsByID[uniqueID] else {
                throw BridgeError.midiSourceNotFound(uniqueID)
            }
            try connect(source: source, uniqueID: uniqueID)
        }

        rememberedInputIDs = uniqueIDs
        refreshAvailableInputs()
    }

    private func connect(source: MIDIEndpointRef, uniqueID: Int32) throws {
        let name = endpointNamesByID[uniqueID] ?? "MIDI Source"
        let connection = MacMIDIConnection(uniqueID: uniqueID, name: name)
        connectionRefsByID[uniqueID] = connection

        let status = MIDIPortConnectSource(
            inputPort,
            source,
            Unmanaged.passUnretained(connection).toOpaque()
        )
        guard status == noErr else {
            connectionRefsByID.removeValue(forKey: uniqueID)
            lastErrorMessage = BridgeError.midiSourceConnectionFailed(uniqueID, status).localizedDescription
            throw BridgeError.midiSourceConnectionFailed(uniqueID, status)
        }

        lastErrorMessage = nil
        rememberedInputIDs.insert(uniqueID)
    }

    private func disconnect(uniqueID: Int32) {
        if let source = sourceRefsByID[uniqueID], inputPort != 0 {
            MIDIPortDisconnectSource(inputPort, source)
        }
        rememberedInputIDs.remove(uniqueID)
        connectionRefsByID.removeValue(forKey: uniqueID)
    }

    private func reconnectRememberedInputs() {
        guard isStarted, inputPort != 0 else { return }
        for uniqueID in rememberedInputIDs.sorted() where connectionRefsByID[uniqueID] == nil {
            guard let source = sourceRefsByID[uniqueID] else { continue }
            do {
                try connect(source: source, uniqueID: uniqueID)
            } catch {
                lastErrorMessage = error.localizedDescription
            }
        }
    }

    private func receive(packetList: UnsafePointer<MIDIPacketList>, sourceConnection: MacMIDIConnection?) {
        var packet = packetList.pointee.packet
        let packetCount = packetList.pointee.numPackets
        var messages: [MacMIDIMessage] = []
        messages.reserveCapacity(Int(packetCount))

        for _ in 0..<packetCount {
            if let message = Self.message(
                timestamp: Self.hostTimeSeconds(packet.timeStamp),
                timestampHostTime: packet.timeStamp,
                rawBytes: Self.packetBytes(packet),
                endpointUniqueID: sourceConnection?.uniqueID,
                endpointName: sourceConnection?.name
            ) {
                messages.append(message)
            }
            packet = MIDIPacketNext(&packet).pointee
        }

        guard !messages.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isStarted else { return }
            self.onMessages?(messages)
        }
    }

    private static func message(
        timestamp: TimeInterval,
        timestampHostTime: UInt64,
        rawBytes: [UInt8],
        endpointUniqueID: Int32?,
        endpointName: String?
    ) -> MacMIDIMessage? {
        guard let status = rawBytes.first else { return nil }

        let kindNibble = status & 0xF0
        let isChannelVoiceMessage = status < 0xF0
        let channel = isChannelVoiceMessage ? status & 0x0F : nil
        let data1 = rawBytes.dropFirst().first
        let data2 = rawBytes.dropFirst(2).first

        let kind: MacMIDIMessageKind
        switch kindNibble {
        case 0x80:
            kind = .noteOff
        case 0x90:
            kind = (data2 ?? 0) == 0 ? .noteOff : .noteOn
        case 0xA0:
            kind = .polyPressure
        case 0xB0:
            kind = .controlChange
        case 0xC0:
            kind = .programChange
        case 0xD0:
            kind = .channelPressure
        case 0xE0:
            kind = .pitchBend
        default:
            kind = rawBytes.first == 0xF0 ? .systemExclusive : .unknown
        }

        return MacMIDIMessage(
            timestamp: timestamp,
            timestampHostTime: timestampHostTime,
            kind: kind,
            status: status,
            channel: channel,
            data1: data1,
            data2: data2,
            rawBytes: rawBytes,
            endpointUniqueID: endpointUniqueID,
            endpointName: endpointName
        )
    }

    private static func packetBytes(_ packet: MIDIPacket) -> [UInt8] {
        let count = Int(packet.length)
        return withUnsafeBytes(of: packet.data) { rawBuffer in
            Array(rawBuffer.prefix(count))
        }
    }

    private static func endpointUniqueID(for endpoint: MIDIObjectRef) -> Int32 {
        var uniqueID = Int32(0)
        let status = MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &uniqueID)
        return status == noErr ? uniqueID : Int32(endpoint)
    }

    private static func endpointName(for endpoint: MIDIObjectRef) -> String? {
        var name: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyName, &name)
        guard status == noErr, let cfName = name?.takeRetainedValue() else { return nil }
        return cfName as String
    }

    private static func endpointManufacturer(for endpoint: MIDIObjectRef) -> String? {
        var manufacturer: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyManufacturer, &manufacturer)
        guard status == noErr, let cfManufacturer = manufacturer?.takeRetainedValue() else { return nil }
        return cfManufacturer as String
    }

    private static func hostTimeSeconds(_ hostTime: MIDITimeStamp) -> TimeInterval {
        guard hostTime > 0 else { return Date().timeIntervalSince1970 }
        return Double(hostTime) * hostTimeToSeconds
    }

    private static let hostTimeToSeconds: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(info.denom) / 1_000_000_000.0
    }()

    private static let readProc: MIDIReadProc = { packetList, refCon, sourceConnectionRefCon in
        guard let refCon else { return }
        let router = Unmanaged<MacMidiRouter>.fromOpaque(refCon).takeUnretainedValue()
        let connection = sourceConnectionRefCon.map {
            Unmanaged<MacMIDIConnection>.fromOpaque($0).takeUnretainedValue()
        }
        router.receive(packetList: packetList, sourceConnection: connection)
    }

    private static let notifyProc: MIDINotifyProc = { _, refCon in
        guard let refCon else { return }
        let router = Unmanaged<MacMidiRouter>.fromOpaque(refCon).takeUnretainedValue()
        DispatchQueue.main.async {
            router.refreshAvailableInputs()
        }
    }
}
