import Foundation
import Combine

@MainActor
final class MidiMapStore: ObservableObject {
    @Published private(set) var profile: MidiMapProfile
    @Published private(set) var lastSavedAt: Date?
    @Published private(set) var lastLoadedAt: Date?
    @Published private(set) var lastErrorMessage: String?

    private let fileURL: URL

    init(fileURL: URL? = nil) {
        let resolvedURL = fileURL ?? MidiMapStore.defaultFileURL()
        self.fileURL = resolvedURL

        if let loaded = Self.loadProfile(from: resolvedURL) {
            self.profile = loaded
            self.lastLoadedAt = Date()
        } else {
            self.profile = .default()
        }
    }

    func resetToDefault() {
        profile = .default()
        lastErrorMessage = nil
    }

    func replaceProfile(_ newProfile: MidiMapProfile) {
        profile = newProfile
        profile.updatedAt = Date()
    }

    func upsertBinding(_ binding: MIDIControlBinding) {
        var updated = profile
        let timestamped = MIDIControlBinding(
            id: binding.id,
            source: binding.source,
            target: binding.target,
            enabled: binding.enabled,
            minimumValue: binding.minimumValue,
            maximumValue: binding.maximumValue,
            curve: binding.curve,
            createdAt: binding.createdAt,
            updatedAt: Date()
        )

        if let index = updated.bindings.firstIndex(where: { $0.id == binding.id }) {
            updated.bindings[index] = timestamped
        } else {
            updated.bindings.append(timestamped)
        }

        updated.updatedAt = Date()
        profile = updated
    }

    func setConnectedInputIDs(_ uniqueIDs: [Int32]) {
        profile.connectedInputIDs = uniqueIDs.sorted()
        profile.updatedAt = Date()
    }

    func removeBinding(id: UUID) {
        profile.bindings.removeAll { $0.id == id }
        profile.updatedAt = Date()
    }

    func bindings(matching source: MIDIControlSource) -> [MIDIControlBinding] {
        profile.bindings.filter { binding in
            binding.enabled &&
            binding.source.kind == source.kind &&
            (binding.source.channel == nil || binding.source.channel == source.channel) &&
            (binding.source.number == nil || binding.source.number == source.number) &&
            (binding.source.endpointUniqueID == nil || binding.source.endpointUniqueID == source.endpointUniqueID)
        }
    }

    func binding(matching message: MIDIMessage) -> MIDIControlBinding? {
        let source = MIDIControlSource(
            kind: message.kind,
            channel: message.channel,
            number: message.data1,
            endpointUniqueID: message.endpointUniqueID
        )
        return bindings(matching: source).first
    }

    func save() {
        do {
            var snapshot = profile
            snapshot.updatedAt = Date()
            let data = try JSONEncoder.prettyPrinted.encode(snapshot)
            try data.write(to: fileURL, options: .atomic)
            profile = snapshot
            lastSavedAt = Date()
            lastErrorMessage = nil
        } catch {
            lastErrorMessage = error.localizedDescription
        }
    }

    func load() {
        guard let loaded = Self.loadProfile(from: fileURL) else {
            lastErrorMessage = "Could not load MIDI map profile."
            return
        }
        profile = loaded
        lastLoadedAt = Date()
        lastErrorMessage = nil
    }

    private static func loadProfile(from fileURL: URL) -> MidiMapProfile? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: fileURL)
            return try JSONDecoder.midiStore.decode(MidiMapProfile.self, from: data)
        } catch {
            return nil
        }
    }

    private static func defaultFileURL() -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        let fallback = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = documents ?? fallback
        return directory.appendingPathComponent("midi_map_profile.json")
    }
}

private extension JSONEncoder {
    static var prettyPrinted: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var midiStore: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
