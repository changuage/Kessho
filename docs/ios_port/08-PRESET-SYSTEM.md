# Preset System Documentation

## JSON Preset Format

The preset format is identical between web and iOS to ensure full interoperability.

### Structure

```typescript
interface SavedPreset {
    name: string;       // User-friendly preset name
    timestamp: number;  // Unix timestamp (ms) when saved
    state: SliderState; // All 120+ parameters
}
```

### Example Preset (Bright_Bells.json)

```json
{
    "name": "Bright Bells",
    "timestamp": 1749027765000,
    "state": {
        // === Master Mixer ===
        "masterVolume": 0.5,
        "synthLevel": 0.31,
        "synthReverbSend": 0.42,
        "granularLevel": 0.53,
        "granularReverbSend": 0.55,
        "reverbLevel": 0.29,
        "leadLevel": 0.07,
        "oceanLevel": 0.21,
        
        // === Global ===
        "tempo": 90,
        "seed": 42,
        "tension": 0.15,
        
        // === Circle of Fifths ===
        "cofEnabled": true,
        "cofHomeRoot": 0,          // C
        "cofDriftRange": 3,
        "cofDriftProbability": 0.3,
        "cofDriftDirection": "random",
        "cofPreferRelative": true,
        
        // === Harmony ===
        "chordComplexity": 0.4,
        "voicingWidth": 1.5,
        "rootNote": 60,            // C4
        "scaleFamily": "major",
        "scaleMode": 0,
        
        // ... 100+ more parameters
    }
}
```

## Bundled Presets

| Preset Name | Character | Key Parameters |
|-------------|-----------|----------------|
| Bright Bells | Sparkling, crystalline | High synth brightness, bell-like attack |
| Dark Textures | Moody, atmospheric | Low filter, high reverb, slow attack |
| Ethereal Ambient | Floating, spacious | Maximum reverb, wide voicing |
| Gamelantest | Rhythmic, metallic | Euclidean patterns, FM harmonics |
| StringWaves | Orchestral, warm | String-like timbre, slow evolving |
| ZoneOut1 | Minimal, meditative | Low tension, sparse changes |

## Swift Implementation

### SliderState Codable Model

```swift
// SliderState.swift
struct SliderState: Codable, Equatable {
    // === Master Mixer ===
    var masterVolume: Double = 0.5
    var synthLevel: Double = 0.5
    var synthReverbSend: Double = 0.4
    var granularLevel: Double = 0.4
    var granularReverbSend: Double = 0.5
    var reverbLevel: Double = 0.3
    var leadLevel: Double = 0.3
    var oceanLevel: Double = 0.3
    
    // === Global/Seed ===
    var tempo: Double = 72
    var seed: Int = 42
    var tension: Double = 0.5
    
    // === Circle of Fifths ===
    var cofEnabled: Bool = true
    var cofHomeRoot: Int = 0
    var cofDriftRange: Int = 3
    var cofDriftProbability: Double = 0.3
    var cofDriftDirection: String = "random"  // "cw", "ccw", "random"
    var cofPreferRelative: Bool = true
    
    // === Harmony ===
    var chordComplexity: Double = 0.5
    var voicingWidth: Double = 1.5
    var rootNote: Int = 60
    var scaleFamily: String = "major"
    var scaleMode: Int = 0
    
    // === Synth ADSR ===
    var synthAttack: Double = 0.1
    var synthDecay: Double = 0.3
    var synthSustain: Double = 0.5
    var synthRelease: Double = 1.0
    
    // === Synth Timbre ===
    var synthWaveform: String = "triangle"  // "sine", "triangle", "square", "sawtooth"
    var synthDetune: Double = 5
    var synthSubLevel: Double = 0.3
    var synthNoiseLevel: Double = 0.02
    var synthFilterFreq: Double = 2000
    var synthFilterQ: Double = 1
    var synthFilterEnvAmount: Double = 0
    
    // === Space (Reverb) ===
    var reverbDecay: Double = 4.0
    var reverbDamping: Double = 0.5
    var reverbModulation: Double = 0.3
    var reverbPreDelay: Double = 0.02
    var reverbHighCut: Double = 8000
    var reverbLowCut: Double = 100
    var reverbDiffusion: Double = 0.8
    var reverbDensity: Double = 0.7
    
    // === Granular ===
    var granularGrainSize: Double = 0.1
    var granularDensity: Double = 10
    var granularPitchSpread: Double = 0.5
    var granularPanSpread: Double = 0.5
    var granularHarmonicity: Double = 0.5
    var granularFeedback: Double = 0.3
    var granularHiCut: Double = 6000
    var granularLoCut: Double = 200
    var granularWet: Double = 0.5
    
    // === Lead Synth ===
    var leadEnabled: Bool = true
    var leadTimbre: Double = 0.5
    var leadAttack: Double = 0.01
    var leadDecay: Double = 0.2
    var leadSustain: Double = 0.3
    var leadRelease: Double = 0.5
    var leadVibrato: Double = 0.1
    var leadVibratoRate: Double = 5
    var leadOctave: Int = 0
    var leadReverbSend: Double = 0.5
    var leadDelayWet: Double = 0.3
    var leadDelayTime: Double = 0.25
    var leadDelayFeedback: Double = 0.4
    
    // === Euclidean Rhythms ===
    var euclideanEnabled: Bool = true
    var euclideanPattern: String = "gamelan"
    var euclideanDensity: Double = 0.5
    var euclideanSwing: Double = 0
    var euclideanLanes: Int = 3
    
    // === Ocean ===
    var oceanEnabled: Bool = true
    var oceanWaveSpeed: Double = 0.5
    var oceanWaveIntensity: Double = 0.5
    var oceanFoamLevel: Double = 0.3
    var oceanRumbleLevel: Double = 0.2
    var oceanFilterFreq: Double = 4000
    var oceanReverbSend: Double = 0.4
    
    // === Quantization Helpers ===
    mutating func quantize() {
        // Apply parameter quantization to match web behavior
        masterVolume = (masterVolume * 100).rounded() / 100
        synthLevel = (synthLevel * 100).rounded() / 100
        // ... etc
    }
}
```

### SavedPreset Model

```swift
// SavedPreset.swift
struct SavedPreset: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    let name: String
    let timestamp: Double  // Unix ms
    let state: SliderState
    
    enum CodingKeys: String, CodingKey {
        case name, timestamp, state
    }
    
    init(name: String, state: SliderState) {
        self.name = name
        self.timestamp = Date().timeIntervalSince1970 * 1000
        self.state = state
    }
}
```

### PresetManager

```swift
// PresetManager.swift
import Foundation
import Combine

class PresetManager: ObservableObject {
    @Published private(set) var bundledPresets: [SavedPreset] = []
    @Published private(set) var userPresets: [SavedPreset] = []
    
    var allPresets: [SavedPreset] {
        bundledPresets + userPresets
    }
    
    private let fileManager = FileManager.default
    
    private var userPresetsDirectory: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Presets", isDirectory: true)
    }
    
    init() {
        createUserPresetsDirectory()
        loadBundledPresets()
        loadUserPresets()
    }
    
    // MARK: - Directory Setup
    
    private func createUserPresetsDirectory() {
        try? fileManager.createDirectory(
            at: userPresetsDirectory,
            withIntermediateDirectories: true
        )
    }
    
    // MARK: - Load Bundled Presets
    
    private func loadBundledPresets() {
        guard let presetsPath = Bundle.main.resourcePath?.appending("/Presets") else {
            print("Presets folder not found in bundle")
            return
        }
        
        let presetsURL = URL(fileURLWithPath: presetsPath)
        
        do {
            let files = try fileManager.contentsOfDirectory(
                at: presetsURL,
                includingPropertiesForKeys: nil
            )
            
            bundledPresets = files
                .filter { $0.pathExtension == "json" }
                .compactMap { loadPreset(from: $0) }
                .sorted { $0.name < $1.name }
            
            print("Loaded \(bundledPresets.count) bundled presets")
        } catch {
            print("Error loading bundled presets: \(error)")
        }
    }
    
    // MARK: - Load User Presets
    
    private func loadUserPresets() {
        do {
            let files = try fileManager.contentsOfDirectory(
                at: userPresetsDirectory,
                includingPropertiesForKeys: nil
            )
            
            userPresets = files
                .filter { $0.pathExtension == "json" }
                .compactMap { loadPreset(from: $0) }
                .sorted { $0.timestamp > $1.timestamp }  // Newest first
            
            print("Loaded \(userPresets.count) user presets")
        } catch {
            print("Error loading user presets: \(error)")
        }
    }
    
    // MARK: - Load Individual Preset
    
    private func loadPreset(from url: URL) -> SavedPreset? {
        do {
            let data = try Data(contentsOf: url)
            let preset = try JSONDecoder().decode(SavedPreset.self, from: data)
            return preset
        } catch {
            print("Error loading preset from \(url.lastPathComponent): \(error)")
            return nil
        }
    }
    
    // MARK: - Save User Preset
    
    func savePreset(name: String, state: SliderState) throws -> SavedPreset {
        let preset = SavedPreset(name: name, state: state)
        
        // Generate filename
        let sanitized = name
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "/", with: "-")
        let filename = "\(sanitized)_\(Int(preset.timestamp)).json"
        let url = userPresetsDirectory.appendingPathComponent(filename)
        
        // Encode and save
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(preset)
        try data.write(to: url)
        
        // Update published array
        userPresets.insert(preset, at: 0)
        
        return preset
    }
    
    // MARK: - Delete User Preset
    
    func deletePreset(_ preset: SavedPreset) throws {
        guard let index = userPresets.firstIndex(of: preset) else {
            throw PresetError.notFound
        }
        
        // Find and delete file
        let files = try fileManager.contentsOfDirectory(
            at: userPresetsDirectory,
            includingPropertiesForKeys: nil
        )
        
        for file in files where file.pathExtension == "json" {
            if let filePreset = loadPreset(from: file), filePreset == preset {
                try fileManager.removeItem(at: file)
                break
            }
        }
        
        userPresets.remove(at: index)
    }
    
    // MARK: - Export Preset
    
    func exportPresetData(_ preset: SavedPreset) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(preset)
    }
    
    // MARK: - Import Preset
    
    func importPreset(from data: Data) throws -> SavedPreset {
        let preset = try JSONDecoder().decode(SavedPreset.self, from: data)
        return try savePreset(name: preset.name, state: preset.state)
    }
    
    // MARK: - Import from URL (AirDrop, Files, etc.)
    
    func importPreset(from url: URL) throws -> SavedPreset {
        let data = try Data(contentsOf: url)
        return try importPreset(from: data)
    }
    
    enum PresetError: Error {
        case notFound
        case invalidFormat
    }
}
```

## iCloud Sync

### Enable iCloud Documents

1. Add iCloud capability in Xcode
2. Select "iCloud Documents" 
3. Add container identifier

### CloudPresetManager

```swift
// CloudPresetManager.swift
import Foundation
import Combine

class CloudPresetManager: ObservableObject {
    @Published private(set) var cloudPresets: [SavedPreset] = []
    @Published var syncStatus: SyncStatus = .idle
    
    enum SyncStatus {
        case idle
        case syncing
        case error(Error)
    }
    
    private let fileManager = FileManager.default
    private var metadataQuery: NSMetadataQuery?
    
    private var cloudPresetsDirectory: URL? {
        fileManager.url(forUbiquityContainerIdentifier: nil)?
            .appendingPathComponent("Documents/Presets", isDirectory: true)
    }
    
    init() {
        setupCloudDirectory()
        startMetadataQuery()
    }
    
    deinit {
        metadataQuery?.stop()
    }
    
    // MARK: - Setup
    
    private func setupCloudDirectory() {
        guard let cloudURL = cloudPresetsDirectory else {
            print("iCloud not available")
            return
        }
        
        if !fileManager.fileExists(atPath: cloudURL.path) {
            try? fileManager.createDirectory(at: cloudURL, withIntermediateDirectories: true)
        }
    }
    
    // MARK: - Metadata Query (Watch for changes)
    
    private func startMetadataQuery() {
        guard cloudPresetsDirectory != nil else { return }
        
        metadataQuery = NSMetadataQuery()
        metadataQuery?.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
        metadataQuery?.predicate = NSPredicate(format: "%K LIKE '*.json'", NSMetadataItemFSNameKey)
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(metadataQueryDidUpdate),
            name: .NSMetadataQueryDidUpdate,
            object: metadataQuery
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(metadataQueryDidFinishGathering),
            name: .NSMetadataQueryDidFinishGathering,
            object: metadataQuery
        )
        
        metadataQuery?.start()
    }
    
    @objc private func metadataQueryDidFinishGathering() {
        processQueryResults()
    }
    
    @objc private func metadataQueryDidUpdate() {
        processQueryResults()
    }
    
    private func processQueryResults() {
        guard let query = metadataQuery else { return }
        
        query.disableUpdates()
        defer { query.enableUpdates() }
        
        syncStatus = .syncing
        
        var presets: [SavedPreset] = []
        
        for item in query.results as! [NSMetadataItem] {
            guard let url = item.value(forAttribute: NSMetadataItemURLKey) as? URL else {
                continue
            }
            
            // Check download status
            if let downloadStatus = item.value(forAttribute: NSMetadataUbiquitousItemDownloadingStatusKey) as? String,
               downloadStatus == NSMetadataUbiquitousItemDownloadingStatusNotDownloaded {
                // Trigger download
                try? fileManager.startDownloadingUbiquitousItem(at: url)
                continue
            }
            
            // Load preset
            if let preset = loadPreset(from: url) {
                presets.append(preset)
            }
        }
        
        cloudPresets = presets.sorted { $0.timestamp > $1.timestamp }
        syncStatus = .idle
    }
    
    // MARK: - Save to Cloud
    
    func saveToCloud(_ preset: SavedPreset) throws {
        guard let cloudURL = cloudPresetsDirectory else {
            throw CloudError.iCloudUnavailable
        }
        
        let sanitized = preset.name
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "/", with: "-")
        let filename = "\(sanitized)_\(Int(preset.timestamp)).json"
        let url = cloudURL.appendingPathComponent(filename)
        
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(preset)
        try data.write(to: url)
    }
    
    private func loadPreset(from url: URL) -> SavedPreset? {
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(SavedPreset.self, from: data)
        } catch {
            return nil
        }
    }
    
    enum CloudError: Error {
        case iCloudUnavailable
    }
}
```

## Preset Validation

When loading presets (especially from web), validate and provide defaults:

```swift
extension SliderState {
    mutating func validate() {
        // Clamp values to valid ranges
        masterVolume = masterVolume.clamped(to: 0...1)
        synthLevel = synthLevel.clamped(to: 0...1)
        granularLevel = granularLevel.clamped(to: 0...4)
        reverbLevel = reverbLevel.clamped(to: 0...2)
        leadLevel = leadLevel.clamped(to: 0...1)
        oceanLevel = oceanLevel.clamped(to: 0...1)
        
        tempo = tempo.clamped(to: 20...200)
        tension = tension.clamped(to: 0...1)
        
        chordComplexity = chordComplexity.clamped(to: 0...1)
        voicingWidth = voicingWidth.clamped(to: 0...3)
        
        rootNote = rootNote.clamped(to: 24...96)
        cofHomeRoot = ((cofHomeRoot % 12) + 12) % 12
        cofDriftRange = cofDriftRange.clamped(to: 0...6)
        
        // Ensure valid enum values
        if !["sine", "triangle", "square", "sawtooth"].contains(synthWaveform) {
            synthWaveform = "triangle"
        }
        
        if !["cw", "ccw", "random"].contains(cofDriftDirection) {
            cofDriftDirection = "random"
        }
        
        if !ScaleFamily.allCases.map({ $0.rawValue }).contains(scaleFamily) {
            scaleFamily = "major"
        }
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        return min(max(self, range.lowerBound), range.upperBound)
    }
}
```

## UI Integration

### PresetPickerView

```swift
// PresetPickerView.swift
import SwiftUI

struct PresetPickerView: View {
    @EnvironmentObject var viewModel: AudioViewModel
    @ObservedObject var presetManager: PresetManager
    @State private var showingSaveDialog = false
    @State private var newPresetName = ""
    @State private var selectedPreset: SavedPreset?
    
    var body: some View {
        NavigationView {
            List {
                // Bundled presets
                Section("Factory Presets") {
                    ForEach(presetManager.bundledPresets) { preset in
                        PresetRow(preset: preset, isSelected: selectedPreset?.id == preset.id)
                            .onTapGesture {
                                loadPreset(preset)
                            }
                    }
                }
                
                // User presets
                if !presetManager.userPresets.isEmpty {
                    Section("My Presets") {
                        ForEach(presetManager.userPresets) { preset in
                            PresetRow(preset: preset, isSelected: selectedPreset?.id == preset.id)
                                .onTapGesture {
                                    loadPreset(preset)
                                }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        deletePreset(preset)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                    
                                    Button {
                                        sharePreset(preset)
                                    } label: {
                                        Label("Share", systemImage: "square.and.arrow.up")
                                    }
                                    .tint(.blue)
                                }
                        }
                    }
                }
            }
            .navigationTitle("Presets")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingSaveDialog = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .alert("Save Preset", isPresented: $showingSaveDialog) {
                TextField("Preset Name", text: $newPresetName)
                Button("Cancel", role: .cancel) { }
                Button("Save") {
                    saveCurrentPreset()
                }
            }
        }
    }
    
    private func loadPreset(_ preset: SavedPreset) {
        var state = preset.state
        state.validate()
        viewModel.state = state
        selectedPreset = preset
    }
    
    private func saveCurrentPreset() {
        guard !newPresetName.isEmpty else { return }
        
        do {
            let preset = try presetManager.savePreset(name: newPresetName, state: viewModel.state)
            selectedPreset = preset
            newPresetName = ""
        } catch {
            print("Error saving preset: \(error)")
        }
    }
    
    private func deletePreset(_ preset: SavedPreset) {
        try? presetManager.deletePreset(preset)
        if selectedPreset?.id == preset.id {
            selectedPreset = nil
        }
    }
    
    private func sharePreset(_ preset: SavedPreset) {
        // Use UIActivityViewController for sharing
    }
}

struct PresetRow: View {
    let preset: SavedPreset
    let isSelected: Bool
    
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(preset.name)
                    .font(.headline)
                Text(formatDate(preset.timestamp))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            if isSelected {
                Image(systemName: "checkmark")
                    .foregroundColor(.accentColor)
            }
        }
        .contentShape(Rectangle())
    }
    
    func formatDate(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
```

## File Sharing Integration

### Document Types (Info.plist)

```xml
<key>CFBundleDocumentTypes</key>
<array>
    <dict>
        <key>CFBundleTypeName</key>
        <string>Generative Ambient Preset</string>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>LSHandlerRank</key>
        <string>Owner</string>
        <key>LSItemContentTypes</key>
        <array>
            <string>com.yourcompany.generativeambient.preset</string>
        </array>
    </dict>
</array>

<key>UTExportedTypeDeclarations</key>
<array>
    <dict>
        <key>UTTypeConformsTo</key>
        <array>
            <string>public.json</string>
        </array>
        <key>UTTypeDescription</key>
        <string>Generative Ambient Preset</string>
        <key>UTTypeIdentifier</key>
        <string>com.yourcompany.generativeambient.preset</string>
        <key>UTTypeTagSpecification</key>
        <dict>
            <key>public.filename-extension</key>
            <array>
                <string>json</string>
            </array>
        </dict>
    </dict>
</array>
```

### Handle Incoming Files

```swift
// In SceneDelegate or App
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
        handleIncomingFile(context.url)
    }
}

private func handleIncomingFile(_ url: URL) {
    guard url.pathExtension == "json" else { return }
    
    let shouldAccess = url.startAccessingSecurityScopedResource()
    defer {
        if shouldAccess {
            url.stopAccessingSecurityScopedResource()
        }
    }
    
    do {
        let preset = try presetManager.importPreset(from: url)
        // Show confirmation, load preset
    } catch {
        // Show error
    }
}
```
