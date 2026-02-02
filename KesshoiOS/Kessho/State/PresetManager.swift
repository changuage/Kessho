import Foundation

/// Manages loading and saving presets
class PresetManager {
    
    private let documentsDirectory: URL = {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }()
    
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
        let presetNames = [
            "Bright_Bells",
            "Dark_Textures",
            "Ethereal_Ambient",
            "Gamelantest",
            "StringWaves",
            "ZoneOut1",
            "WaveformFlow",
            "CosmicStrings",
            "CrystalCaves"
        ]
        
        var presets: [SavedPreset] = []
        
        for name in presetNames {
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
            let decoder = JSONDecoder()
            let preset = try decoder.decode(SavedPreset.self, from: data)
            return preset
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
            let decoder = JSONDecoder()
            return try decoder.decode([SavedPreset].self, from: data)
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
        let decoder = JSONDecoder()
        return try? decoder.decode(SavedPreset.self, from: data)
    }
    
    /// Import preset from URL (file picker)
    func importPreset(from url: URL) -> SavedPreset? {
        guard url.startAccessingSecurityScopedResource() else {
            return nil
        }
        defer { url.stopAccessingSecurityScopedResource() }
        
        return loadPreset(from: url)
    }
}
