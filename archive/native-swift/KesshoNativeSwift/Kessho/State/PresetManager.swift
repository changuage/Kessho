import Foundation

/// Manages loading and saving presets
class PresetManager {
    static let bundledPresetNames = [
        "Bright_Bells",
        "Dark_Textures",
        "Ethereal_Ambient",
        "Gamelantest",
        "StringWaves",
        "WaveOut",
        "ZoneOut1",
        "ZoneOutTest",
        "ZoneOutTest2"
    ]

    private let documentsDirectory: URL = {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }()

    private let iso8601Formatter = ISO8601DateFormatter()

    private let userPresetsFile = "user_presets.json"
    
    // MARK: - Bundled Presets
    
    /// Load all presets bundled with the app
    func loadBundledPresets() -> [SavedPreset] {
        var presets: [SavedPreset] = []
        
        // Load from Presets folder in bundle
        guard let presetsURL = Bundle.main.url(forResource: "Presets", withExtension: nil) else {
            print("Presets folder not found in bundle")
            return loadFallbackBundledPresets()
        }
        
        do {
            let fileURLs = try FileManager.default.contentsOfDirectory(
                at: presetsURL,
                includingPropertiesForKeys: nil,
                options: .skipsHiddenFiles
            )
            
            for fileURL in fileURLs where fileURL.pathExtension == "json" {
                if let preset = loadPreset(from: fileURL) {
                    presets.append(preset)
                }
            }
        } catch {
            print("Error loading bundled presets: \(error)")
        }
        
        return presets.sorted { $0.name < $1.name }
    }
    
    /// Fallback: Load presets individually by known names
    private func loadFallbackBundledPresets() -> [SavedPreset] {
        var presets: [SavedPreset] = []

        for name in Self.bundledPresetNames {
            if let url = Bundle.main.url(forResource: name, withExtension: "json"),
               let preset = loadPreset(from: url) {
                presets.append(preset)
            }
        }
        
        return presets
    }
    
    /// Load a single preset from a file URL
    func loadPreset(from url: URL) -> SavedPreset? {
        do {
            let data = try Data(contentsOf: url)
            return try decodePreset(from: data, fallbackName: url.deletingPathExtension().lastPathComponent)
        } catch {
            print("Error loading preset from \(url.lastPathComponent): \(error)")
            return nil
        }
    }
    
    // MARK: - User Presets
    
    /// Load user-saved presets from documents directory
    func loadUserPresets() -> [SavedPreset] {
        let fileURL = documentsDirectory.appendingPathComponent(userPresetsFile)

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return []
        }

        do {
            let data = try Data(contentsOf: fileURL)
            return try decodePresetArray(from: data, fallbackNamePrefix: "User Preset")
        } catch {
            print("Error loading user presets: \(error)")
            return []
        }
    }
    
    /// Save a preset to user documents
    func savePreset(_ preset: SavedPreset) {
        var userPresets = loadUserPresets()
        
        // Replace if exists, otherwise append
        if let index = userPresets.firstIndex(where: { $0.name == preset.name }) {
            userPresets[index] = preset
        } else {
            userPresets.append(preset)
        }
        
        saveUserPresets(userPresets)
    }
    
    /// Delete a user preset
    func deletePreset(named name: String) {
        var userPresets = loadUserPresets()
        userPresets.removeAll { $0.name == name }
        saveUserPresets(userPresets)
    }
    
    private func saveUserPresets(_ presets: [SavedPreset]) {
        let fileURL = documentsDirectory.appendingPathComponent(userPresetsFile)
        
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let data = try encoder.encode(presets)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("Error saving user presets: \(error)")
        }
    }
    
    // MARK: - Export/Import
    
    /// Export preset to JSON data (for sharing)
    func exportPreset(_ preset: SavedPreset) -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        return try? encoder.encode(preset)
    }
    
    /// Import preset from JSON data
    func importPreset(from data: Data) -> SavedPreset? {
        return try? decodePreset(from: data, fallbackName: "Imported Preset")
    }
    
    /// Import preset from URL (file picker)
    func importPreset(from url: URL) -> SavedPreset? {
        guard url.startAccessingSecurityScopedResource() else {
            return nil
        }
        defer { url.stopAccessingSecurityScopedResource() }

        return loadPreset(from: url)
    }

    private func decodePreset(from data: Data, fallbackName: String) throws -> SavedPreset {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let record = object as? [String: Any] else {
            throw CocoaError(.coderReadCorrupt)
        }

        let name = (record["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let timestamp = (record["timestamp"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

        let stateRecord = (record["state"] as? [String: Any]) ?? record
        let state = try SliderState.decodeStateRecord(stateRecord)

        return SavedPreset(
            name: name?.isEmpty == false ? name! : fallbackName,
            timestamp: timestamp?.isEmpty == false ? timestamp! : iso8601Formatter.string(from: Date()),
            state: state,
            dualRanges: decodeDualRanges(from: record["dualRanges"])
        )
    }

    private func decodePresetArray(from data: Data, fallbackNamePrefix: String) throws -> [SavedPreset] {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let records = object as? [[String: Any]] else {
            throw CocoaError(.coderReadCorrupt)
        }

        return try records.enumerated().map { index, record in
            let recordData = try JSONSerialization.data(withJSONObject: record, options: [])
            return try decodePreset(
                from: recordData,
                fallbackName: "\(fallbackNamePrefix) \(index + 1)"
            )
        }
    }

    private func decodeDualRanges(from value: Any?) -> [String: DualRange]? {
        guard let rawRanges = value as? [String: Any] else {
            return nil
        }

        var decoded: [String: DualRange] = [:]
        for (key, rawValue) in rawRanges {
            guard let rangeRecord = rawValue as? [String: Any],
                  let min = jsonNumber(rangeRecord["min"]),
                  let max = jsonNumber(rangeRecord["max"]) else {
                continue
            }
            decoded[key] = DualRange(min: min, max: max)
        }

        return decoded.isEmpty ? nil : decoded
    }

    private func jsonNumber(_ value: Any?) -> Double? {
        switch value {
        case let number as Double:
            return number
        case let number as Float:
            return Double(number)
        case let number as Int:
            return Double(number)
        case let number as NSNumber where !(number is Bool):
            return number.doubleValue
        default:
            return nil
        }
    }
}
