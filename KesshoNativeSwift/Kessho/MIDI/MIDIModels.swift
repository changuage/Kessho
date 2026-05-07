import Foundation

enum MIDIMessageKind: String, Codable, CaseIterable {
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

struct MIDIMessage: Identifiable, Codable, Equatable {
    var id = UUID()
    var timestamp: TimeInterval
    var kind: MIDIMessageKind
    var status: UInt8
    var channel: UInt8?
    var data1: UInt8?
    var data2: UInt8?
    var rawBytes: [UInt8]
    var endpointUniqueID: Int32?
    var endpointName: String?

    static func unknown(
        timestamp: TimeInterval,
        status: UInt8,
        rawBytes: [UInt8],
        endpointUniqueID: Int32? = nil,
        endpointName: String? = nil
    ) -> MIDIMessage {
        MIDIMessage(
            timestamp: timestamp,
            kind: .unknown,
            status: status,
            channel: nil,
            data1: rawBytes.dropFirst().first,
            data2: rawBytes.dropFirst(2).first,
            rawBytes: rawBytes,
            endpointUniqueID: endpointUniqueID,
            endpointName: endpointName
        )
    }
}

struct MIDIEndpointInfo: Identifiable, Codable, Equatable, Hashable {
    var id: Int32 { uniqueID }
    var uniqueID: Int32
    var name: String
    var manufacturer: String?
    var isConnected: Bool
}

struct MIDIControlSource: Codable, Hashable {
    var kind: MIDIMessageKind
    var channel: UInt8?
    var number: UInt8?
    var endpointUniqueID: Int32?
}

enum MIDIValueCurve: String, Codable, CaseIterable {
    case linear
    case exponential
    case logarithmic
    case stepped
}

enum MIDIMapTargetKind: String, Codable, CaseIterable {
    case parameter
    case action
    case transport
    case preset
    case macro
    case unknown
}

struct MIDIMapTarget: Codable, Hashable {
    var kind: MIDIMapTargetKind
    var identifier: String
    var displayName: String?
}

struct MIDIControlBinding: Identifiable, Codable, Hashable {
    var id = UUID()
    var source: MIDIControlSource
    var target: MIDIMapTarget
    var enabled: Bool = true
    var minimumValue: Double = 0
    var maximumValue: Double = 1
    var curve: MIDIValueCurve = .linear
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
}

struct MidiMapProfile: Codable, Identifiable, Hashable {
    var id = UUID()
    var name: String
    var description: String?
    var version: Int = 1
    var connectedInputIDs: [Int32] = []
    var bindings: [MIDIControlBinding]
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    static func `default`() -> MidiMapProfile {
        MidiMapProfile(
            name: "Default MIDI Map",
            description: "Starter MIDI mapping profile for Kessho.",
            bindings: []
        )
    }
}
