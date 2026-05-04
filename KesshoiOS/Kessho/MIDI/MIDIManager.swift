import Foundation
import CoreMIDI
import Combine

enum MIDIManagerError: LocalizedError {
    case clientCreationFailed(OSStatus)
    case inputPortCreationFailed(OSStatus)
    case sourceNotFound(Int32)
    case notStarted

    var errorDescription: String? {
        switch self {
        case .clientCreationFailed(let status):
            return "Failed to create MIDI client (\(status))."
        case .inputPortCreationFailed(let status):
            return "Failed to create MIDI input port (\(status))."
        case .sourceNotFound(let uniqueID):
            return "MIDI source not found for unique ID \(uniqueID)."
        case .notStarted:
            return "MIDI manager has not been started."
        }
    }
}

private struct MIDIPacketSnapshot {
    let timestamp: TimeInterval
    let rawBytes: [UInt8]
}

final class MIDIManager: ObservableObject {
    @Published private(set) var availableInputs: [MIDIEndpointInfo] = []
    @Published private(set) var connectedInputIDs: Set<Int32> = []
    @Published private(set) var latestMessage: MIDIMessage?
    @Published private(set) var isStarted: Bool = false
    @Published private(set) var lastErrorMessage: String?

    let events = PassthroughSubject<MIDIMessage, Never>()

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var sourceRefsByID: [Int32: MIDIEndpointRef] = [:]
    private var endpointNamesByID: [Int32: String] = [:]

    private var callbackRefCon: UnsafeMutableRawPointer {
        UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
    }

    init(autoStart: Bool = true) {
        if autoStart {
            try? start()
        }
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
            "Kessho MIDI Client" as CFString,
            nil,
            nil,
            &clientRef
        )
        guard clientStatus == noErr else {
            lastErrorMessage = MIDIManagerError.clientCreationFailed(clientStatus).localizedDescription
            throw MIDIManagerError.clientCreationFailed(clientStatus)
        }

        client = clientRef

        var inputPortRef = MIDIPortRef()
        let portStatus = MIDIInputPortCreate(
            client,
            "Kessho Input Port" as CFString,
            MIDIManager.readProc,
            callbackRefCon,
            &inputPortRef
        )
        guard portStatus == noErr else {
            MIDIClientDispose(client)
            client = MIDIClientRef()
            lastErrorMessage = MIDIManagerError.inputPortCreationFailed(portStatus).localizedDescription
            throw MIDIManagerError.inputPortCreationFailed(portStatus)
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

        sourceRefsByID.removeAll()
        endpointNamesByID.removeAll()
        connectedInputIDs.removeAll()
        isStarted = false
    }

    func refreshAvailableInputs() {
        guard isStarted else {
            availableInputs = []
            return
        }

        var discovered: [MIDIEndpointInfo] = []
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
                MIDIEndpointInfo(
                    uniqueID: uniqueID,
                    name: name,
                    manufacturer: manufacturer,
                    isConnected: connectedInputIDs.contains(uniqueID)
                )
            )

            sourceRefsByID[uniqueID] = source
            endpointNamesByID[uniqueID] = name
        }

        availableInputs = discovered.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    func connectInput(uniqueID: Int32) throws {
        guard isStarted else {
            throw MIDIManagerError.notStarted
        }

        if connectedInputIDs.contains(uniqueID) {
            return
        }

        guard let source = sourceRefsByID[uniqueID] else {
            refreshAvailableInputs()
            guard let refreshed = sourceRefsByID[uniqueID] else {
                throw MIDIManagerError.sourceNotFound(uniqueID)
            }
            let status = MIDIPortConnectSource(inputPort, refreshed, nil)
            guard status == noErr else {
                lastErrorMessage = "Failed to connect MIDI source \(uniqueID) (\(status))."
                throw MIDIManagerError.sourceNotFound(uniqueID)
            }
            connectedInputIDs.insert(uniqueID)
            refreshAvailableInputs()
            return
        }

        let status = MIDIPortConnectSource(inputPort, source, nil)
        guard status == noErr else {
            lastErrorMessage = "Failed to connect MIDI source \(uniqueID) (\(status))."
            throw MIDIManagerError.sourceNotFound(uniqueID)
        }

        connectedInputIDs.insert(uniqueID)
        refreshAvailableInputs()
    }

    func disconnectInput(uniqueID: Int32) {
        guard let source = sourceRefsByID[uniqueID], inputPort != 0 else { return }
        MIDIPortDisconnectSource(inputPort, source)
        connectedInputIDs.remove(uniqueID)
        refreshAvailableInputs()
    }

    func disconnectAllInputs() {
        guard inputPort != 0 else {
            connectedInputIDs.removeAll()
            return
        }

        for uniqueID in connectedInputIDs {
            if let source = sourceRefsByID[uniqueID] {
                MIDIPortDisconnectSource(inputPort, source)
            }
        }

        connectedInputIDs.removeAll()
        refreshAvailableInputs()
    }

    func setConnectedInputs(_ uniqueIDs: Set<Int32>) {
        disconnectAllInputs()
        for uniqueID in uniqueIDs {
            try? connectInput(uniqueID: uniqueID)
        }
    }

    private func receive(packetList: UnsafePointer<MIDIPacketList>) {
        var packet = packetList.pointee.packet
        let packetCount = packetList.pointee.numPackets
        var snapshots: [MIDIPacketSnapshot] = []
        snapshots.reserveCapacity(Int(packetCount))

        for _ in 0..<packetCount {
            snapshots.append(
                MIDIPacketSnapshot(
                    timestamp: Double(packet.timeStamp) / 1_000_000_000.0,
                    rawBytes: Self.packetBytes(packet)
                )
            )
            packet = MIDIPacketNext(&packet).pointee
        }

        DispatchQueue.main.async { [weak self] in
            self?.receive(snapshots)
        }
    }

    private func receive(_ snapshots: [MIDIPacketSnapshot]) {
        guard isStarted else { return }

        for snapshot in snapshots {
            let endpointID = Self.firstConnectedEndpointID(connectedIDs: connectedInputIDs)
            let endpointName = endpointID.flatMap { endpointNamesByID[$0] }

            if let message = Self.message(
                timestamp: snapshot.timestamp,
                rawBytes: snapshot.rawBytes,
                endpointUniqueID: endpointID,
                endpointName: endpointName
            ) {
                publish(message)
            } else {
                publish(
                    MIDIMessage.unknown(
                        timestamp: snapshot.timestamp,
                        status: snapshot.rawBytes.first ?? 0,
                        rawBytes: snapshot.rawBytes,
                        endpointUniqueID: endpointID,
                        endpointName: endpointName
                    )
                )
            }
        }
    }

    private func publish(_ message: MIDIMessage) {
        if Thread.isMainThread {
            latestMessage = message
            events.send(message)
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.latestMessage = message
            self.events.send(message)
        }
    }

    private static func message(
        timestamp: TimeInterval,
        rawBytes: [UInt8],
        endpointUniqueID: Int32?,
        endpointName: String?
    ) -> MIDIMessage? {
        guard let status = rawBytes.first else { return nil }

        let channel = status & 0x0F
        let kindNibble = status & 0xF0
        let data1 = rawBytes.dropFirst().first
        let data2 = rawBytes.dropFirst(2).first

        switch kindNibble {
        case 0x80:
            return MIDIMessage(
                timestamp: timestamp,
                kind: .noteOff,
                status: status,
                channel: channel,
                data1: data1,
                data2: data2,
                rawBytes: rawBytes,
                endpointUniqueID: endpointUniqueID,
                endpointName: endpointName
            )
        case 0x90:
            let kind: MIDIMessageKind = (data2 ?? 0) == 0 ? .noteOff : .noteOn
            return MIDIMessage(
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
        case 0xB0:
            return MIDIMessage(
                timestamp: timestamp,
                kind: .controlChange,
                status: status,
                channel: channel,
                data1: data1,
                data2: data2,
                rawBytes: rawBytes,
                endpointUniqueID: endpointUniqueID,
                endpointName: endpointName
            )
        case 0xC0:
            return MIDIMessage(
                timestamp: timestamp,
                kind: .programChange,
                status: status,
                channel: channel,
                data1: data1,
                data2: nil,
                rawBytes: rawBytes,
                endpointUniqueID: endpointUniqueID,
                endpointName: endpointName
            )
        case 0xD0:
            return MIDIMessage(
                timestamp: timestamp,
                kind: .channelPressure,
                status: status,
                channel: channel,
                data1: data1,
                data2: nil,
                rawBytes: rawBytes,
                endpointUniqueID: endpointUniqueID,
                endpointName: endpointName
            )
        case 0xE0:
            return MIDIMessage(
                timestamp: timestamp,
                kind: .pitchBend,
                status: status,
                channel: channel,
                data1: data1,
                data2: data2,
                rawBytes: rawBytes,
                endpointUniqueID: endpointUniqueID,
                endpointName: endpointName
            )
        default:
            return MIDIMessage(
                timestamp: timestamp,
                kind: rawBytes.first == 0xF0 ? .systemExclusive : .unknown,
                status: status,
                channel: channel,
                data1: data1,
                data2: data2,
                rawBytes: rawBytes,
                endpointUniqueID: endpointUniqueID,
                endpointName: endpointName
            )
        }
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

    private static func firstConnectedEndpointID(connectedIDs: Set<Int32>) -> Int32? {
        connectedIDs.sorted().first
    }

    private static let readProc: MIDIReadProc = { packetList, refCon, _ in
        guard let refCon else { return }
        let manager = Unmanaged<MIDIManager>.fromOpaque(refCon).takeUnretainedValue()
        manager.receive(packetList: packetList)
    }
}
