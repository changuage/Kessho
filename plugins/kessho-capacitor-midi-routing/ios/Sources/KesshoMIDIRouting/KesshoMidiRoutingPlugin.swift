import Capacitor
import CoreMIDI
import Darwin
import Foundation

private enum KesshoMIDIError: LocalizedError {
    case clientCreationFailed(OSStatus)
    case inputPortCreationFailed(OSStatus)
    case sourceNotFound(Int32)
    case sourceConnectionFailed(Int32, OSStatus)
    case notStarted

    var errorDescription: String? {
        switch self {
        case .clientCreationFailed(let status):
            return "Failed to create MIDI client (\(status))."
        case .inputPortCreationFailed(let status):
            return "Failed to create MIDI input port (\(status))."
        case .sourceNotFound(let uniqueID):
            return "MIDI source not found for unique ID \(uniqueID)."
        case .sourceConnectionFailed(let uniqueID, let status):
            return "Failed to connect MIDI source \(uniqueID) (\(status))."
        case .notStarted:
            return "MIDI routing has not been started."
        }
    }
}

private enum KesshoMIDIMessageKind: String {
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

private struct KesshoMIDIEndpointInfo {
    let uniqueID: Int32
    let name: String
    let manufacturer: String?
    let displayName: String
    let transport: String
    let isBluetooth: Bool
    let isNetworkSession: Bool
    let persistentIdentity: String
    let isConnected: Bool

    var dictionary: JSObject {
        var output: JSObject = [
            "uniqueID": Int(uniqueID),
            "name": name,
            "displayName": displayName,
            "transport": transport,
            "isBluetooth": isBluetooth,
            "isNetworkSession": isNetworkSession,
            "persistentIdentity": persistentIdentity,
            "isConnected": isConnected
        ]
        if let manufacturer {
            output["manufacturer"] = manufacturer
        }
        return output
    }
}

private struct KesshoMIDIMessage {
    let timestamp: TimeInterval
    let timestampMs: Double
    let timestampHostTime: UInt64
    let kind: KesshoMIDIMessageKind
    let status: UInt8
    let channel: UInt8?
    let data1: UInt8?
    let data2: UInt8?
    let rawBytes: [UInt8]
    let endpointUniqueID: Int32?
    let endpointName: String?

    var dictionary: JSObject {
        var output: JSObject = [
            "timestamp": timestamp,
            "timestampMs": timestampMs,
            "timestampHostTime": Double(timestampHostTime),
            "kind": kind.rawValue,
            "status": Int(status),
            "rawBytes": rawBytes.map(Int.init)
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

private final class KesshoMIDIConnection {
    let uniqueID: Int32
    let name: String
    let manufacturer: String?
    let persistentIdentity: String

    init(uniqueID: Int32, name: String, manufacturer: String?, persistentIdentity: String) {
        self.uniqueID = uniqueID
        self.name = name
        self.manufacturer = manufacturer
        self.persistentIdentity = persistentIdentity
    }
}

private struct KesshoMIDIDesiredConnection {
    let uniqueID: Int32
    let name: String?
    let manufacturer: String?
    let persistentIdentity: String?
}

private enum KesshoMIDITime {
    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    static func seconds(fromHostTime hostTime: UInt64) -> TimeInterval {
        if hostTime == 0 { return Date().timeIntervalSince1970 }
        let nanos = Double(hostTime) * Double(timebase.numer) / Double(timebase.denom)
        return nanos / 1_000_000_000.0
    }

    static func milliseconds(fromHostTime hostTime: UInt64) -> Double {
        seconds(fromHostTime: hostTime) * 1_000
    }
}

private final class KesshoMIDIRouter {
    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var sourceRefsByID: [Int32: MIDIEndpointRef] = [:]
    private var endpointNamesByID: [Int32: String] = [:]
    private var endpointManufacturersByID: [Int32: String?] = [:]
    private var endpointPersistentIdentitiesByID: [Int32: String] = [:]
    private var connectionRefsByID: [Int32: KesshoMIDIConnection] = [:]
    private var desiredConnectionsByID: [Int32: KesshoMIDIDesiredConnection] = [:]
    private var lastActivityPublishTime: TimeInterval = 0

    private(set) var availableInputs: [KesshoMIDIEndpointInfo] = []
    private(set) var isStarted = false
    private(set) var lastErrorMessage: String?
    private(set) var hotplugEventCount = 0
    private(set) var reconnectAttemptCount = 0
    private(set) var reconnectSuccessCount = 0
    private(set) var receivedMessageCount = 0
    private(set) var droppedActivityEventCount = 0

    var connectedInputIDs: [Int32] {
        connectionRefsByID.keys.sorted()
    }

    var onMessage: ((KesshoMIDIMessage) -> Void)?
    var onActivityMessage: ((KesshoMIDIMessage) -> Void)?
    var onInputsChanged: (([KesshoMIDIEndpointInfo]) -> Void)?

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
            "Kessho Capacitor MIDI Client" as CFString,
            KesshoMIDIRouter.notifyProc,
            callbackRefCon,
            &clientRef
        )
        guard clientStatus == noErr else {
            lastErrorMessage = KesshoMIDIError.clientCreationFailed(clientStatus).localizedDescription
            throw KesshoMIDIError.clientCreationFailed(clientStatus)
        }

        client = clientRef

        var inputPortRef = MIDIPortRef()
        let portStatus = MIDIInputPortCreate(
            client,
            "Kessho Capacitor MIDI Input" as CFString,
            KesshoMIDIRouter.readProc,
            callbackRefCon,
            &inputPortRef
        )
        guard portStatus == noErr else {
            MIDIClientDispose(client)
            client = MIDIClientRef()
            lastErrorMessage = KesshoMIDIError.inputPortCreationFailed(portStatus).localizedDescription
            throw KesshoMIDIError.inputPortCreationFailed(portStatus)
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
        endpointManufacturersByID.removeAll()
        endpointPersistentIdentitiesByID.removeAll()
        connectionRefsByID.removeAll()
        desiredConnectionsByID.removeAll()
        isStarted = false
    }

    func refreshAvailableInputs() {
        guard isStarted else {
            availableInputs = []
            onInputsChanged?(availableInputs)
            return
        }

        var discovered: [KesshoMIDIEndpointInfo] = []
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
            let displayName = Self.endpointDisplayName(for: source, fallback: name)
            let transport = Self.endpointTransportName(for: source)
            let persistentIdentity = Self.endpointPersistentIdentity(
                uniqueID: uniqueID,
                name: name,
                manufacturer: manufacturer,
                transport: transport
            )

            discovered.append(
                KesshoMIDIEndpointInfo(
                    uniqueID: uniqueID,
                    name: name,
                    manufacturer: manufacturer,
                    displayName: displayName,
                    transport: transport,
                    isBluetooth: transport == "bluetooth",
                    isNetworkSession: transport == "network",
                    persistentIdentity: persistentIdentity,
                    isConnected: connectionRefsByID[uniqueID] != nil
                )
            )

            sourceRefsByID[uniqueID] = source
            endpointNamesByID[uniqueID] = name
            endpointManufacturersByID[uniqueID] = manufacturer
            endpointPersistentIdentitiesByID[uniqueID] = persistentIdentity
        }

        reconcileConnectionsAfterRefresh()
        availableInputs = discovered.sorted { left, right in
            left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
        }
        onInputsChanged?(availableInputs)
    }

    func connectInput(uniqueID: Int32) throws {
        guard isStarted else {
            throw KesshoMIDIError.notStarted
        }

        if connectionRefsByID[uniqueID] != nil {
            rememberDesiredConnection(uniqueID: uniqueID)
            refreshAvailableInputs()
            return
        }

        guard let source = sourceRefsByID[uniqueID] else {
            refreshAvailableInputs()
            guard let refreshed = sourceRefsByID[uniqueID] else {
                throw KesshoMIDIError.sourceNotFound(uniqueID)
            }
            try connect(source: refreshed, uniqueID: uniqueID)
            return
        }

        try connect(source: source, uniqueID: uniqueID)
    }

    func disconnectInput(uniqueID: Int32) {
        desiredConnectionsByID.removeValue(forKey: uniqueID)
        if let source = sourceRefsByID[uniqueID], inputPort != 0 {
            MIDIPortDisconnectSource(inputPort, source)
        }
        connectionRefsByID.removeValue(forKey: uniqueID)
        refreshAvailableInputs()
    }

    func disconnectAllInputs() {
        guard inputPort != 0 else {
            connectionRefsByID.removeAll()
            desiredConnectionsByID.removeAll()
            refreshAvailableInputs()
            return
        }

        for uniqueID in connectedInputIDs {
            if let source = sourceRefsByID[uniqueID] {
                MIDIPortDisconnectSource(inputPort, source)
            }
        }

        connectionRefsByID.removeAll()
        desiredConnectionsByID.removeAll()
        refreshAvailableInputs()
    }

    func setConnectedInputs(_ uniqueIDs: Set<Int32>) throws {
        desiredConnectionsByID = Dictionary(
            uniqueIDs.map { uniqueID in
                (uniqueID, desiredConnection(uniqueID: uniqueID))
            },
            uniquingKeysWith: { first, _ in first }
        )

        for connectedID in connectedInputIDs where !uniqueIDs.contains(connectedID) {
            disconnectInput(uniqueID: connectedID)
        }

        for uniqueID in uniqueIDs.sorted() {
            try connectInput(uniqueID: uniqueID)
        }

        refreshAvailableInputs()
    }

    private func connect(source: MIDIEndpointRef, uniqueID: Int32) throws {
        let name = endpointNamesByID[uniqueID] ?? "MIDI Source"
        let manufacturer = endpointManufacturersByID[uniqueID] ?? nil
        let persistentIdentity = endpointPersistentIdentitiesByID[uniqueID] ?? Self.endpointPersistentIdentity(
            uniqueID: uniqueID,
            name: name,
            manufacturer: manufacturer,
            transport: Self.endpointTransportName(for: source)
        )
        let connection = KesshoMIDIConnection(
            uniqueID: uniqueID,
            name: name,
            manufacturer: manufacturer,
            persistentIdentity: persistentIdentity
        )
        connectionRefsByID[uniqueID] = connection
        desiredConnectionsByID[uniqueID] = KesshoMIDIDesiredConnection(
            uniqueID: uniqueID,
            name: name,
            manufacturer: manufacturer,
            persistentIdentity: persistentIdentity
        )

        let status = MIDIPortConnectSource(
            inputPort,
            source,
            Unmanaged.passUnretained(connection).toOpaque()
        )
        guard status == noErr else {
            connectionRefsByID.removeValue(forKey: uniqueID)
            lastErrorMessage = KesshoMIDIError.sourceConnectionFailed(uniqueID, status).localizedDescription
            throw KesshoMIDIError.sourceConnectionFailed(uniqueID, status)
        }

        lastErrorMessage = nil
        refreshAvailableInputs()
    }

    private func receive(packetList: UnsafePointer<MIDIPacketList>, sourceConnection: KesshoMIDIConnection?) {
        var packet = packetList.pointee.packet
        let packetCount = packetList.pointee.numPackets
        var messages: [KesshoMIDIMessage] = []
        messages.reserveCapacity(Int(packetCount))

        for _ in 0..<packetCount {
            if let message = Self.message(
                timestampHostTime: packet.timeStamp,
                rawBytes: Self.packetBytes(packet),
                endpointUniqueID: sourceConnection?.uniqueID,
                endpointName: sourceConnection?.name
            ) {
                messages.append(message)
            }
            packet = MIDIPacketNext(&packet).pointee
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, self.isStarted else { return }
            for message in messages {
                self.receivedMessageCount += 1
                self.onMessage?(message)
                self.publishThrottledActivity(message)
            }
        }
    }

    private static func message(
        timestampHostTime: UInt64,
        rawBytes: [UInt8],
        endpointUniqueID: Int32?,
        endpointName: String?
    ) -> KesshoMIDIMessage? {
        guard let status = rawBytes.first else { return nil }

        let kindNibble = status & 0xF0
        let isChannelVoiceMessage = status < 0xF0
        let channel = isChannelVoiceMessage ? status & 0x0F : nil
        let data1 = rawBytes.dropFirst().first
        let data2 = rawBytes.dropFirst(2).first

        let kind: KesshoMIDIMessageKind
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

        return KesshoMIDIMessage(
            timestamp: KesshoMIDITime.seconds(fromHostTime: timestampHostTime),
            timestampMs: KesshoMIDITime.milliseconds(fromHostTime: timestampHostTime),
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

    private static func endpointDisplayName(for endpoint: MIDIObjectRef, fallback: String) -> String {
        if let displayName = endpointStringProperty(endpoint, property: kMIDIPropertyDisplayName), !displayName.isEmpty {
            return displayName
        }
        return fallback
    }

    private static func endpointTransportName(for endpoint: MIDIObjectRef) -> String {
        let hints = [
            endpointStringProperty(endpoint, property: kMIDIPropertyDisplayName),
            endpointStringProperty(endpoint, property: kMIDIPropertyName),
            endpointStringProperty(endpoint, property: kMIDIPropertyManufacturer)
        ]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")

        if hints.contains("bluetooth") || hints.contains("ble") {
            return "bluetooth"
        }
        if hints.contains("usb") {
            return "usb"
        }
        if hints.contains("network") || hints.contains("rtp") {
            return "network"
        }
        if hints.contains("virtual") || hints.contains("session") {
            return "virtual"
        }
        return "unknown"
    }

    private static func endpointStringProperty(_ endpoint: MIDIObjectRef, property: CFString) -> String? {
        var value: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, property, &value)
        guard status == noErr, let cfValue = value?.takeRetainedValue() else { return nil }
        return cfValue as String
    }

    private static func endpointPersistentIdentity(
        uniqueID: Int32,
        name: String,
        manufacturer: String?,
        transport: String
    ) -> String {
        let normalizedManufacturer = (manufacturer ?? "unknown")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return "\(transport)|\(normalizedManufacturer)|\(normalizedName)|\(uniqueID)"
    }

    private func rememberDesiredConnection(uniqueID: Int32) {
        desiredConnectionsByID[uniqueID] = desiredConnection(uniqueID: uniqueID)
    }

    private func desiredConnection(uniqueID: Int32) -> KesshoMIDIDesiredConnection {
        KesshoMIDIDesiredConnection(
            uniqueID: uniqueID,
            name: endpointNamesByID[uniqueID],
            manufacturer: endpointManufacturersByID[uniqueID] ?? nil,
            persistentIdentity: endpointPersistentIdentitiesByID[uniqueID]
        )
    }

    private func reconcileConnectionsAfterRefresh() {
        guard inputPort != 0 else { return }

        for uniqueID in connectedInputIDs where sourceRefsByID[uniqueID] == nil {
            connectionRefsByID.removeValue(forKey: uniqueID)
        }

        for desired in Array(desiredConnectionsByID.values) where connectionRefsByID[desired.uniqueID] == nil {
            if let source = sourceRefsByID[desired.uniqueID] {
                reconnectAttemptCount += 1
                do {
                    try connect(source: source, uniqueID: desired.uniqueID)
                    reconnectSuccessCount += 1
                } catch {
                    lastErrorMessage = "\(error)"
                }
                continue
            }

            guard let fallbackID = fallbackEndpointID(for: desired), let source = sourceRefsByID[fallbackID] else {
                continue
            }
            reconnectAttemptCount += 1
            do {
                try connect(source: source, uniqueID: fallbackID)
                reconnectSuccessCount += 1
            } catch {
                lastErrorMessage = "\(error)"
            }
        }
    }

    private func fallbackEndpointID(for desired: KesshoMIDIDesiredConnection) -> Int32? {
        for (uniqueID, persistentIdentity) in endpointPersistentIdentitiesByID {
            if desired.persistentIdentity == persistentIdentity {
                return uniqueID
            }
        }
        guard let desiredName = desired.name?.lowercased() else { return nil }
        let desiredManufacturer = desired.manufacturer?.lowercased()
        for (uniqueID, name) in endpointNamesByID {
            guard name.lowercased() == desiredName else { continue }
            let manufacturer = endpointManufacturersByID[uniqueID] ?? nil
            if desiredManufacturer == nil || manufacturer?.lowercased() == desiredManufacturer {
                return uniqueID
            }
        }
        return nil
    }

    private func publishThrottledActivity(_ message: KesshoMIDIMessage) {
        let now = Date().timeIntervalSinceReferenceDate
        if now - lastActivityPublishTime < 1.0 / 30.0 {
            droppedActivityEventCount += 1
            return
        }
        lastActivityPublishTime = now
        onActivityMessage?(message)
    }

    private static let readProc: MIDIReadProc = { packetList, refCon, sourceConnectionRefCon in
        guard let refCon else { return }
        let router = Unmanaged<KesshoMIDIRouter>.fromOpaque(refCon).takeUnretainedValue()
        let connection = sourceConnectionRefCon.map {
            Unmanaged<KesshoMIDIConnection>.fromOpaque($0).takeUnretainedValue()
        }
        router.receive(packetList: packetList, sourceConnection: connection)
    }

    private static let notifyProc: MIDINotifyProc = { _, refCon in
        guard let refCon else { return }
        let router = Unmanaged<KesshoMIDIRouter>.fromOpaque(refCon).takeUnretainedValue()
        DispatchQueue.main.async {
            router.hotplugEventCount += 1
            router.refreshAvailableInputs()
        }
    }
}

@objc(KesshoMidiRoutingPlugin)
public final class KesshoMidiRoutingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KesshoMidiRoutingPlugin"
    public let jsName = "KesshoMidiRouting"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshInputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectInput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnectInput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnectAllInputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setConnectedInputs", returnType: CAPPluginReturnPromise)
    ]

    private let router = KesshoMIDIRouter()

    public override func load() {
        super.load()
        router.onMessage = { [weak self] message in
            self?.notifyListeners("midiMessage", data: message.dictionary)
        }
        router.onActivityMessage = { [weak self] message in
            self?.notifyListeners("midiActivity", data: message.dictionary)
        }
        router.onInputsChanged = { [weak self] inputs in
            self?.notifyListeners("inputsChanged", data: self?.inputSnapshot(inputs: inputs) ?? [:])
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(statusPayload())
    }

    @objc func start(_ call: CAPPluginCall) {
        do {
            try router.start()
            call.resolve(statusPayload())
        } catch {
            call.reject("Failed to start MIDI routing", nil, error)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        router.stop()
        call.resolve(statusPayload())
    }

    @objc func refreshInputs(_ call: CAPPluginCall) {
        do {
            try router.start()
            router.refreshAvailableInputs()
            call.resolve(inputSnapshot(inputs: router.availableInputs))
        } catch {
            call.reject("Failed to refresh MIDI inputs", nil, error)
        }
    }

    @objc func connectInput(_ call: CAPPluginCall) {
        guard let uniqueID = int32Value(from: call, key: "uniqueID") else {
            call.reject("Missing MIDI input uniqueID")
            return
        }

        do {
            try router.start()
            try router.connectInput(uniqueID: uniqueID)
            call.resolve(inputSnapshot(inputs: router.availableInputs))
        } catch {
            call.reject("Failed to connect MIDI input", nil, error)
        }
    }

    @objc func disconnectInput(_ call: CAPPluginCall) {
        guard let uniqueID = int32Value(from: call, key: "uniqueID") else {
            call.reject("Missing MIDI input uniqueID")
            return
        }

        router.disconnectInput(uniqueID: uniqueID)
        call.resolve(inputSnapshot(inputs: router.availableInputs))
    }

    @objc func disconnectAllInputs(_ call: CAPPluginCall) {
        router.disconnectAllInputs()
        call.resolve(inputSnapshot(inputs: router.availableInputs))
    }

    @objc func setConnectedInputs(_ call: CAPPluginCall) {
        let uniqueIDsJson = call.getString("uniqueIDsJson") ?? "[]"
        do {
            let data = Data(uniqueIDsJson.utf8)
            let decoded = try JSONDecoder().decode([Int32].self, from: data)
            try router.start()
            try router.setConnectedInputs(Set(decoded))
            call.resolve(inputSnapshot(inputs: router.availableInputs))
        } catch {
            call.reject("Failed to set MIDI inputs", nil, error)
        }
    }

    private func statusPayload() -> JSObject {
        [
            "available": true,
            "isStarted": router.isStarted,
            "inputCount": router.availableInputs.count,
            "connectedInputIDs": router.connectedInputIDs.map(Int.init),
            "hotplugEventCount": router.hotplugEventCount,
            "reconnectAttemptCount": router.reconnectAttemptCount,
            "reconnectSuccessCount": router.reconnectSuccessCount,
            "receivedMessageCount": router.receivedMessageCount,
            "droppedActivityEventCount": router.droppedActivityEventCount,
            "lastErrorMessage": router.lastErrorMessage ?? NSNull()
        ]
    }

    private func inputSnapshot(inputs: [KesshoMIDIEndpointInfo]) -> JSObject {
        [
            "inputs": inputs.map(\.dictionary),
            "connectedInputIDs": router.connectedInputIDs.map(Int.init)
        ]
    }

    private func int32Value(from call: CAPPluginCall, key: String) -> Int32? {
        if let intValue = call.getInt(key) {
            return Int32(intValue)
        }
        if let doubleValue = call.getDouble(key), doubleValue.isFinite {
            return Int32(doubleValue)
        }
        return nil
    }
}
