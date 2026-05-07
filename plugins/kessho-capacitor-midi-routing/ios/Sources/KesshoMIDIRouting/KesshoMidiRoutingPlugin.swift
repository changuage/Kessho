import Capacitor
import CoreMIDI
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
    let isConnected: Bool

    var dictionary: JSObject {
        var output: JSObject = [
            "uniqueID": Int(uniqueID),
            "name": name,
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

    init(uniqueID: Int32, name: String) {
        self.uniqueID = uniqueID
        self.name = name
    }
}

private final class KesshoMIDIRouter {
    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var sourceRefsByID: [Int32: MIDIEndpointRef] = [:]
    private var endpointNamesByID: [Int32: String] = [:]
    private var connectionRefsByID: [Int32: KesshoMIDIConnection] = [:]

    private(set) var availableInputs: [KesshoMIDIEndpointInfo] = []
    private(set) var isStarted = false
    private(set) var lastErrorMessage: String?

    var connectedInputIDs: [Int32] {
        connectionRefsByID.keys.sorted()
    }

    var onMessage: ((KesshoMIDIMessage) -> Void)?
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
        connectionRefsByID.removeAll()
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

            discovered.append(
                KesshoMIDIEndpointInfo(
                    uniqueID: uniqueID,
                    name: name,
                    manufacturer: manufacturer,
                    isConnected: connectionRefsByID[uniqueID] != nil
                )
            )

            sourceRefsByID[uniqueID] = source
            endpointNamesByID[uniqueID] = name
        }

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
        if let source = sourceRefsByID[uniqueID], inputPort != 0 {
            MIDIPortDisconnectSource(inputPort, source)
        }
        connectionRefsByID.removeValue(forKey: uniqueID)
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
        refreshAvailableInputs()
    }

    func setConnectedInputs(_ uniqueIDs: Set<Int32>) throws {
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
        let connection = KesshoMIDIConnection(uniqueID: uniqueID, name: name)
        connectionRefsByID[uniqueID] = connection

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
                timestamp: Double(packet.timeStamp) / 1_000_000_000.0,
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
                self.onMessage?(message)
            }
        }
    }

    private static func message(
        timestamp: TimeInterval,
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
            timestamp: timestamp,
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
