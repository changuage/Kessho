# Preset System Documentation

## JSON Preset Format

The preset format is identical between web and iOS to ensure full interoperability.

### Structure

```typescript
interface SavedPreset {
    name: string;       // User-friendly preset name
    timestamp: number;  // Unix timestamp (ms) when saved
    state: SliderState; // All 120+ parameters
    dualRanges?: Record<string, { min: number; max: number }>;  // Optional dual slider ranges
    sliderModes?: Record<string, SliderMode>;  // Mode per parameter ('walk' | 'sampleHold'; absent = 'single')
}

type SliderMode = 'single' | 'walk' | 'sampleHold';

interface DualRange {
    min: number;  // Lower bound of walk/sampleHold range
    max: number;  // Upper bound of walk/sampleHold range
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
        "rootNote": 4,             // 0-11 (C=0, E=4, etc.)
        "scaleMode": "auto",       // "auto" | "manual"
        "manualScale": "Dorian",   // Generic scale name (no root prefix)
        "tension": 0.15,
        "chordRate": 32,
        "voicingSpread": 0.5,
        
        // ... 100+ more parameters
    }
}
```

### Scale Name Format Change

**Important:** Scale names are now **generic** (e.g., "Dorian" instead of "E Dorian"). The root note is stored separately in `rootNote` (0-11).

| Old Format | New Format |
|------------|------------|
| `"manualScale": "E Dorian"` | `"manualScale": "Dorian"` |
| `"manualScale": "E Major Pentatonic"` | `"manualScale": "Major Pentatonic"` |

### Dual Slider Ranges

Presets can optionally include `dualRanges` and `sliderModes` for parameters that use range-based automation:

```json
{
    "name": "Wave Out",
    "state": { ... },
    "dualRanges": {
        "synthReverbSend": { "min": 0.02, "max": 0.39 },
        "oceanDuration": { "min": 4, "max": 10 },
        "leadDelayTime": { "min": 200, "max": 500 }
    },
    "sliderModes": {
        "synthReverbSend": "walk",
        "oceanDuration": "walk",
        "leadDelayTime": "sampleHold"
    }
}
```

When `dualRanges` is present for a parameter, the corresponding `sliderModes` entry determines the automation behavior:
- `"walk"` — continuous random walk between min/max (blue UI: #a5c4d4)
- `"sampleHold"` — new random value per trigger event (gold UI: #D4A520)

> **Migration note (2026-02):** Old presets with `*Min/*Max` field pairs (e.g., `oceanDurationMin`, `oceanDurationMax`) are automatically migrated by `migratePreset()` to the new `dualRanges` + `sliderModes` format on load. See `PRESET_MIGRATION_MAP` in `state.ts`.

### Preset Morphing with Dual Sliders

When morphing between presets with different slider modes, the system interpolates intelligently:

| Scenario | Interpolation Behavior |
|----------|------------------------|
| Single A → Single B | Linear interpolation of state value |
| Single A → Dual B | Create dual at A's value, morph handles to B's min/max |
| Single A → Dual B | Create dual at A's value, morph handles to B's min/max |
| Dual A → Single B | Morph both A's min/max toward B's single value |
| Dual A → Dual B | Min→min, max→max independent interpolation |
| Walk A → S&H B | Mode interpolates based on morph position (mode from dominant side) |
| Dual A → Single B | Morph both A's min/max toward B's single value |
| Dual A → Dual B | Min→min, max→max independent interpolation |

### Circle of Fifths Key Transitions During Morph

When morphing between presets with different root notes, the key transition follows the **Circle of Fifths** for smooth, musical modulation rather than abrupt key changes.

#### Direction-Aware Morphing

The system must track the **direction** of the morph because the slider semantics (0=A, 100=B) don't change, but which preset is the "source" vs "target" depends on which way the user is moving:

| Direction | Slider Movement | Source Root | Target Root |
|-----------|-----------------|-------------|-------------|
| A → B | 0% → 100% | Preset A's current root (accounting for any active CoF drift) | Preset B's home root |
| B → A | 100% → 0% | Preset B's current root | Preset A's home root |

**Critical Implementation Detail:** Capture the source root **once** when leaving an endpoint, then use it consistently throughout the morph. The destination preset's `rootNote` may have been updated by CoF drift in the engine, so always use the **home** root from the preset state for the target.

#### CoF Path Calculation

```swift
func calculateCoFPath(from: Int, to: Int) -> (steps: Int, path: [Int]) {
    let cofSequence = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]
    let fromIndex = cofSequence.firstIndex(of: from % 12)!
    let toIndex = cofSequence.firstIndex(of: to % 12)!
    
    // Calculate CW and CCW distances
    let cwDistance = (toIndex - fromIndex + 12) % 12
    let ccwDistance = (fromIndex - toIndex + 12) % 12
    
    // Choose shortest path (prefer CW if equal)
    let useCW = cwDistance <= ccwDistance
    let steps = useCW ? cwDistance : -ccwDistance
    
    // Build path
    var path: [Int] = []
    let direction = useCW ? 1 : -1
    for i in 0...abs(steps) {
        let pathIndex = (fromIndex + i * direction + 12) % 12
        path.append(cofSequence[pathIndex])
    }
    
    return (steps, path)
}

// Example: E(4) → G(7)
// CW: E→B→F#→C#→G#→D#→A#→F→C→G = 9 steps
// CCW: E→A→D→G = 3 steps
// Result: CCW is shorter, path = [4, 9, 2, 7], steps = -3
```

#### Morph Position to Key Mapping

Key changes are evenly distributed across the morph:

```swift
func getMorphedRootNote(from: Int, to: Int, morphPosition: Double) -> Int {
    let (steps, path) = calculateCoFPath(from: from, to: to)
    let totalSteps = abs(steps)
    
    guard totalSteps > 0 else { return from }
    
    // For N steps, change at positions: 100/(N+1), 200/(N+1), ...
    let segmentSize = 100.0 / Double(totalSteps + 1)
    let pathIndex = min(Int((morphPosition + segmentSize / 2) / segmentSize), totalSteps)
    
    return path[pathIndex]
}

// Example: 3 steps (E→A→D→G)
// segmentSize = 100/4 = 25%
// At 0-12%: E, 13-37%: A, 38-62%: D, 63-100%: G
```

#### Smart CoF Toggle

When presets have different `cofDriftEnabled` values, the system ensures CoF is ON during the key walk:

```swift
func getCofEnabledDuringMorph(cofOnA: Bool, cofOnB: Bool, t: Double) -> Bool {
    let atEndpointA = t == 0
    let atEndpointB = t == 100
    
    if cofOnA && cofOnB {
        return true  // Both on: stay on
    } else if !cofOnA && !cofOnB {
        return false // Both off: stay off
    } else if !cofOnA && cofOnB {
        // Off → On: turn ON immediately when leaving A
        return !atEndpointA
    } else {
        // On → Off: stay ON until arriving at B
        return !atEndpointB
    }
}
```

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| **Off → On** | Turn ON immediately (t > 0) | Allow CoF walk during morph |
| **On → Off** | Stay ON until arrival (t == 100) | Complete CoF walk before disabling |

#### State Management for Morph

```swift
class MorphState {
    var capturedStartRoot: Int? = nil      // Captured when morph begins
    var direction: MorphDirection? = nil   // .toA or .toB
    var lastEndpoint: Int = 0              // 0 or 100
    
    func handlePositionChange(newPosition: Int, presetA: SavedPreset, presetB: SavedPreset, currentCofStep: Int) {
        let wasAtA = lastEndpoint == 0
        let wasAtB = lastEndpoint == 100
        let leavingA = wasAtA && newPosition > 0
        let leavingB = wasAtB && newPosition < 100
        
        // Update endpoint tracking
        if newPosition == 0 {
            lastEndpoint = 0
            direction = nil
            capturedStartRoot = nil
        } else if newPosition == 100 {
            lastEndpoint = 100
            direction = nil
            capturedStartRoot = nil
        }
        
        // Capture starting root when first leaving an endpoint
        if leavingA && capturedStartRoot == nil {
            direction = .toB
            let stateA = presetA.state
            capturedStartRoot = stateA.cofDriftEnabled
                ? calculateDriftedRoot(stateA.rootNote, currentCofStep)
                : stateA.rootNote
        } else if leavingB && capturedStartRoot == nil {
            direction = .toA
            let stateB = presetB.state
            capturedStartRoot = stateB.cofDriftEnabled
                ? calculateDriftedRoot(stateB.rootNote, currentCofStep)
                : stateB.rootNote
        }
    }
}
```

### Debugging Pitfalls (Lessons Learned)

During the web implementation, several subtle bugs were discovered that iOS developers should avoid:

#### 1. **Direction Not Tracked**
**Bug:** Always used preset A's root as "from" and B's root as "to", regardless of slider direction.
**Symptom:** When morphing B→A (100→0), the key path was calculated backwards, ending at A's key at 0% but progressing through the wrong intermediate keys.
**Fix:** Track direction based on which endpoint the user is leaving from.

#### 2. **Start Root Recalculated During Morph**
**Bug:** The "from" root was recalculated each frame using the current CoF step, which keeps incrementing.
**Symptom:** If CoF drift was active, the start root kept changing during the morph, causing the path to shift.
**Fix:** Capture the effective root **once** when leaving an endpoint, store in a ref/property, and use that consistently.

#### 3. **CoF Path Position vs Slider Position**
**Bug:** When morphing B→A (100→0), used the slider position directly (100→0) for CoF path calculation.
**Symptom:** The CoF path went backwards—arrived at the start key when reaching destination.
**Fix:** For B→A direction, use `cofMorphT = 100 - t` so the path progresses correctly (0→100 as slider goes 100→0).

#### 4. **homeRoot Changes During Morph**
**Bug:** The UI's Circle of Fifths visualization used `state.rootNote` for calculating current position.
**Symptom:** Since `state.rootNote` is updated during morph (via `result.rootNote = currentRoot`), the CoF index was calculated wrong, showing B instead of E.
**Fix:** Pass `morphStartRoot` as a separate prop and use it during morph instead of the changing `homeRoot`.

#### 5. **CoF Toggle Timing**
**Bug:** CoF was snapped at 50% like other boolean parameters.
**Symptom:** When morphing Off→On, CoF didn't turn on until 50%, so only half the key walk happened.
**Fix:** Special handling - turn ON immediately when leaving "off" preset, turn OFF only when arriving at "off" preset.

**iOS Implementation:**

```swift
struct MorphResult {
    let state: SliderState
    let dualRanges: [String: DualRange]
    let dualModes: Set<String>
    let morphCoFInfo: MorphCoFInfo?
}

struct MorphCoFInfo {
    let isMorphing: Bool
    let startRoot: Int      // Captured starting root
    let effectiveRoot: Int  // Current root during morph
    let targetRoot: Int     // Destination root
    let cofStep: Int        // Current step on path
    let totalSteps: Int     // Total steps in path
}

func lerpPresets(
    _ presetA: SavedPreset, 
    _ presetB: SavedPreset, 
    t: Double,
    capturedStartRoot: Int?,
    direction: MorphDirection
) -> MorphResult {
    let stateA = presetA.state
    let stateB = presetB.state
    let tNorm = t / 100.0
    
    // Determine CoF path based on direction
    let fromRoot: Int
    let toRoot: Int
    let cofMorphT: Double
    
    if direction == .toB {
        fromRoot = capturedStartRoot ?? stateA.rootNote
        toRoot = stateB.rootNote
        cofMorphT = t
    } else {
        fromRoot = capturedStartRoot ?? stateB.rootNote
        toRoot = stateA.rootNote
        cofMorphT = 100 - t  // Invert for B→A direction
    }
    
    // Get morphed root via CoF path
    let (cofStep, totalSteps, currentRoot) = getMorphedRootNote(from: fromRoot, to: toRoot, morphPosition: cofMorphT)
    
    var result = stateA
    result.rootNote = currentRoot
    
    // ... interpolate other values using tNorm ...
    
    // Smart CoF toggle
    result.cofDriftEnabled = getCofEnabledDuringMorph(
        cofOnA: stateA.cofDriftEnabled,
        cofOnB: stateB.cofDriftEnabled,
        t: t
    )
    
    let morphCoFInfo = fromRoot != toRoot ? MorphCoFInfo(
        isMorphing: true,
        startRoot: fromRoot,
        effectiveRoot: currentRoot,
        targetRoot: toRoot,
        cofStep: cofStep,
        totalSteps: totalSteps
    ) : nil
    
    return MorphResult(
        state: result,
        dualRanges: resultDualRanges,
        dualModes: resultDualModes,
        morphCoFInfo: morphCoFInfo
    )
}
```

**Valid scale names:**
- `Major Pentatonic`, `Major (Ionian)`, `Lydian`, `Mixolydian`
- `Minor Pentatonic`, `Dorian`, `Aeolian`
- `Harmonic Minor`, `Melodic Minor`
- `Octatonic Half-Whole`, `Phrygian Dominant`

**Backwards Compatibility:** When loading old presets with "E " prefix, strip the prefix before lookup.
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
    var rootNote: Int = 4              // 0-11 (C=0, E=4, etc.)
    var scaleMode: String = "auto"     // "auto" | "manual"
    var manualScale: String = "Dorian" // Generic scale name (no root prefix)
    var tension: Double = 0.3
    var chordRate: Double = 32
    var voicingSpread: Double = 0.5
    
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
// DualRange.swift
struct DualRange: Codable, Equatable {
    let min: Double
    let max: Double
}

// SavedPreset.swift
struct SavedPreset: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    let name: String
    let timestamp: Double  // Unix ms
    let state: SliderState
    let dualRanges: [String: DualRange]?  // Optional dual slider ranges
    
    enum CodingKeys: String, CodingKey {
        case name, timestamp, state, dualRanges
    }
    
    init(name: String, state: SliderState, dualRanges: [String: DualRange]? = nil) {
        self.name = name
        self.timestamp = Date().timeIntervalSince1970 * 1000
        self.state = state
        self.dualRanges = dualRanges
    }
    
    /// Returns true if this preset has any dual slider ranges
    var hasDualRanges: Bool {
        guard let ranges = dualRanges else { return false }
        return !ranges.isEmpty
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
