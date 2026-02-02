import Foundation

/// Euclidean rhythm generator for polyrhythmic patterns
/// Based on Bjorklund's algorithm for distributing hits evenly across steps

struct EuclideanLane {
    var enabled: Bool = false
    var preset: String = ""
    var steps: Int = 16
    var hits: Int = 4
    var rotation: Int = 0
    var noteMin: Int = 64
    var noteMax: Int = 76
    var level: Float = 0.8
    
    /// The generated pattern (true = hit, false = rest)
    var pattern: [Bool] = []
    
    /// Current step position in the pattern
    var currentStep: Int = 0
    
    mutating func generatePattern() {
        pattern = euclidean(hits: hits, steps: steps)
        
        // Apply rotation
        if rotation > 0 && !pattern.isEmpty {
            let rot = rotation % pattern.count
            pattern = Array(pattern.suffix(pattern.count - rot) + pattern.prefix(rot))
        }
    }
    
    /// Regenerate pattern (convenience method)
    mutating func regeneratePattern() {
        generatePattern()
    }
    
    /// Advance to next step, returns true if this step is a hit
    mutating func advance() -> Bool {
        guard enabled && !pattern.isEmpty else { return false }
        let isHit = pattern[currentStep]
        currentStep = (currentStep + 1) % pattern.count
        return isHit
    }
    
    /// Reset to beginning of pattern
    mutating func reset() {
        currentStep = 0
    }
}

/// Bjorklund's algorithm for Euclidean rhythm generation
func euclidean(hits: Int, steps: Int) -> [Bool] {
    guard steps > 0 else { return [] }
    guard hits > 0 else { return Array(repeating: false, count: steps) }
    guard hits <= steps else { return Array(repeating: true, count: steps) }
    
    // Initialize groups
    var groups: [[Bool]] = []
    for i in 0..<steps {
        groups.append([i < hits])
    }
    
    // Bjorklund's algorithm
    func bjorklund(_ groups: [[Bool]]) -> [[Bool]] {
        let pattern = groups
        var firstGroup: [[Bool]] = []
        var secondGroup: [[Bool]] = []
        
        // Find the pivot point where groups change from true-starting to false-starting
        var pivotIndex = 0
        for (i, group) in pattern.enumerated() {
            if group.first == false {
                pivotIndex = i
                break
            }
            if i == pattern.count - 1 {
                pivotIndex = pattern.count
            }
        }
        
        firstGroup = Array(pattern.prefix(pivotIndex))
        secondGroup = Array(pattern.suffix(pattern.count - pivotIndex))
        
        // Base cases
        if secondGroup.count <= 1 || firstGroup.isEmpty {
            return pattern
        }
        
        // Interleave
        var newGroups: [[Bool]] = []
        let minCount = min(firstGroup.count, secondGroup.count)
        
        for i in 0..<minCount {
            newGroups.append(firstGroup[i] + secondGroup[i])
        }
        
        // Add remaining groups
        if firstGroup.count > secondGroup.count {
            newGroups.append(contentsOf: firstGroup.suffix(firstGroup.count - minCount))
        } else if secondGroup.count > firstGroup.count {
            newGroups.append(contentsOf: secondGroup.suffix(secondGroup.count - minCount))
        }
        
        return bjorklund(newGroups)
    }
    
    let result = bjorklund(groups)
    return result.flatMap { $0 }
}

/// Euclidean sequencer with 4 lanes
class EuclideanSequencer {
    var lane1 = EuclideanLane()
    var lane2 = EuclideanLane()
    var lane3 = EuclideanLane()
    var lane4 = EuclideanLane()
    
    /// Array accessor for lanes (for easier iteration)
    var lanes: [EuclideanLane] {
        get { [lane1, lane2, lane3, lane4] }
        set {
            if newValue.count > 0 { lane1 = newValue[0] }
            if newValue.count > 1 { lane2 = newValue[1] }
            if newValue.count > 2 { lane3 = newValue[2] }
            if newValue.count > 3 { lane4 = newValue[3] }
        }
    }
    
    var masterEnabled: Bool = false
    var tempo: Double = 1.0  // Tempo multiplier
    
    // Timing
    private var tickCounter: Int = 0
    
    /// Update sequencer from SliderState
    func updateFromState(_ state: SliderState) {
        masterEnabled = state.leadEuclideanMasterEnabled
        tempo = state.leadEuclideanTempo
        
        // Lane 1
        lane1.enabled = state.leadEuclid1Enabled
        lane1.preset = state.leadEuclid1Preset
        lane1.steps = state.leadEuclid1Steps
        lane1.hits = state.leadEuclid1Hits
        lane1.rotation = state.leadEuclid1Rotation
        lane1.noteMin = state.leadEuclid1NoteMin
        lane1.noteMax = state.leadEuclid1NoteMax
        lane1.level = Float(state.leadEuclid1Level)
        lane1.generatePattern()
        
        // Lane 2
        lane2.enabled = state.leadEuclid2Enabled
        lane2.preset = state.leadEuclid2Preset
        lane2.steps = state.leadEuclid2Steps
        lane2.hits = state.leadEuclid2Hits
        lane2.rotation = state.leadEuclid2Rotation
        lane2.noteMin = state.leadEuclid2NoteMin
        lane2.noteMax = state.leadEuclid2NoteMax
        lane2.level = Float(state.leadEuclid2Level)
        lane2.generatePattern()
        
        // Lane 3
        lane3.enabled = state.leadEuclid3Enabled
        lane3.preset = state.leadEuclid3Preset
        lane3.steps = state.leadEuclid3Steps
        lane3.hits = state.leadEuclid3Hits
        lane3.rotation = state.leadEuclid3Rotation
        lane3.noteMin = state.leadEuclid3NoteMin
        lane3.noteMax = state.leadEuclid3NoteMax
        lane3.level = Float(state.leadEuclid3Level)
        lane3.generatePattern()
        
        // Lane 4
        lane4.enabled = state.leadEuclid4Enabled
        lane4.preset = state.leadEuclid4Preset
        lane4.steps = state.leadEuclid4Steps
        lane4.hits = state.leadEuclid4Hits
        lane4.rotation = state.leadEuclid4Rotation
        lane4.noteMin = state.leadEuclid4NoteMin
        lane4.noteMax = state.leadEuclid4NoteMax
        lane4.level = Float(state.leadEuclid4Level)
        lane4.generatePattern()
    }
    
    /// Process a time tick, returns notes to play (MIDI note, velocity)
    /// Called at regular intervals from AudioEngine
    func tick(scale: ScaleFamily, rootNote: Int, rng: () -> Double) -> [(midiNote: Int, velocity: Float)] {
        guard masterEnabled else { return [] }
        
        tickCounter += 1
        
        var notes: [(midiNote: Int, velocity: Float)] = []
        
        // Get scale notes for quantization
        let scaleNotes = getScaleNotesInRange(scale: scale, lowMidi: 36, highMidi: 108, rootNote: rootNote)
        
        // Process each lane
        if lane1.advance() {
            if let note = pickNote(from: scaleNotes, min: lane1.noteMin, max: lane1.noteMax, rng: rng) {
                notes.append((note, lane1.level))
            }
        }
        
        if lane2.advance() {
            if let note = pickNote(from: scaleNotes, min: lane2.noteMin, max: lane2.noteMax, rng: rng) {
                notes.append((note, lane2.level))
            }
        }
        
        if lane3.advance() {
            if let note = pickNote(from: scaleNotes, min: lane3.noteMin, max: lane3.noteMax, rng: rng) {
                notes.append((note, lane3.level))
            }
        }
        
        if lane4.advance() {
            if let note = pickNote(from: scaleNotes, min: lane4.noteMin, max: lane4.noteMax, rng: rng) {
                notes.append((note, lane4.level))
            }
        }
        
        return notes
    }
    
    /// Old tick method for backward compatibility
    func tick(currentTime: TimeInterval, scaleNotes: [Int], rng: () -> Double) -> [(note: Int, velocity: Float)] {
        guard masterEnabled else { return [] }
        
        var notes: [(note: Int, velocity: Float)] = []
        
        // Process each lane
        if lane1.advance() {
            if let note = pickNote(from: scaleNotes, min: lane1.noteMin, max: lane1.noteMax, rng: rng) {
                notes.append((note, lane1.level))
            }
        }
        
        if lane2.advance() {
            if let note = pickNote(from: scaleNotes, min: lane2.noteMin, max: lane2.noteMax, rng: rng) {
                notes.append((note, lane2.level))
            }
        }
        
        if lane3.advance() {
            if let note = pickNote(from: scaleNotes, min: lane3.noteMin, max: lane3.noteMax, rng: rng) {
                notes.append((note, lane3.level))
            }
        }
        
        if lane4.advance() {
            if let note = pickNote(from: scaleNotes, min: lane4.noteMin, max: lane4.noteMax, rng: rng) {
                notes.append((note, lane4.level))
            }
        }
        
        return notes
    }
    
    /// Pick a note from scale within the given MIDI range (deterministic with seeded RNG)
    private func pickNote(from scaleNotes: [Int], min: Int, max: Int, rng: () -> Double) -> Int? {
        let inRange = scaleNotes.filter { $0 >= min && $0 <= max }
        guard !inRange.isEmpty else {
            // Fallback: just use the range midpoint
            return (min + max) / 2
        }
        // Use seeded RNG instead of .randomElement() for cross-platform determinism
        let index = Int(rng() * Double(inRange.count)) % inRange.count
        return inRange[index]
    }
    
    /// Reset all lanes
    func reset() {
        lane1.reset()
        lane2.reset()
        lane3.reset()
        lane4.reset()
        tickCounter = 0
    }
}

/// Preset patterns for Euclidean rhythms - matching web app exactly
struct EuclideanPreset {
    let steps: Int
    let hits: Int
    let rotation: Int
    let name: String
}

let EUCLIDEAN_PRESETS: [String: EuclideanPreset] = [
    // === GAMELAN PATTERNS ===
    // Lancaran - 16-beat cycle, gong on beat 16, kenong on 8, kempul on 4, 12
    "lancaran": EuclideanPreset(steps: 16, hits: 4, rotation: 0, name: "Lancaran (16-beat)"),
    // Ketawang - 16-beat with 2 kenong, sparser
    "ketawang": EuclideanPreset(steps: 16, hits: 2, rotation: 0, name: "Ketawang (sparse)"),
    // Ladrang - 32-beat cycle with specific accents
    "ladrang": EuclideanPreset(steps: 32, hits: 8, rotation: 0, name: "Ladrang (32-beat)"),
    // Gangsaran - fast, dense 8-beat pattern
    "gangsaran": EuclideanPreset(steps: 8, hits: 4, rotation: 0, name: "Gangsaran (fast)"),
    // Kotekan-style interlocking - 8 steps, 3 hits (common pattern)
    "kotekan": EuclideanPreset(steps: 8, hits: 3, rotation: 1, name: "Kotekan (interlocking)"),
    // Kotekan counterpart - interlocks with kotekan when offset
    "kotekan2": EuclideanPreset(steps: 8, hits: 3, rotation: 4, name: "Kotekan B (counter)"),
    // Srepegan - medium tempo 16-beat
    "srepegan": EuclideanPreset(steps: 16, hits: 6, rotation: 2, name: "Srepegan (medium)"),
    // Sampak - fast 8-beat with 5 hits
    "sampak": EuclideanPreset(steps: 8, hits: 5, rotation: 0, name: "Sampak (dense)"),
    // Ayak-ayakan - 16-beat with 3 hits, sparse and flowing
    "ayak": EuclideanPreset(steps: 16, hits: 3, rotation: 4, name: "Ayak-ayakan (flowing)"),
    // Bonang panerus - high density interlocking
    "bonang": EuclideanPreset(steps: 12, hits: 5, rotation: 2, name: "Bonang (12-beat)"),
    
    // === STEVE REICH / MINIMALIST PATTERNS ===
    // Classic phasing pattern from "Clapping Music"
    "clapping": EuclideanPreset(steps: 12, hits: 8, rotation: 0, name: "Clapping Music (12/8)"),
    // Phase shifted version for polyrhythmic layering
    "clappingB": EuclideanPreset(steps: 12, hits: 8, rotation: 5, name: "Clapping B (phase)"),
    // 3 against 4 polyrhythm base
    "poly3v4": EuclideanPreset(steps: 12, hits: 3, rotation: 0, name: "3 vs 4 (triplet)"),
    // 4 against 3 counterpart
    "poly4v3": EuclideanPreset(steps: 12, hits: 4, rotation: 0, name: "4 vs 3 (quarter)"),
    // 5 against 4 - quintuplet feel
    "poly5v4": EuclideanPreset(steps: 20, hits: 5, rotation: 0, name: "5 vs 4 (quint)"),
    // 7 beat additive pattern
    "additive7": EuclideanPreset(steps: 7, hits: 4, rotation: 0, name: "Additive 7"),
    // 11 beat additive - prime number creates long cycle
    "additive11": EuclideanPreset(steps: 11, hits: 5, rotation: 0, name: "Additive 11"),
    // 13 beat additive - longer prime cycle
    "additive13": EuclideanPreset(steps: 13, hits: 5, rotation: 0, name: "Additive 13"),
    // Music for 18 Musicians inspired - 12 beat with 7 hits
    "reich18": EuclideanPreset(steps: 12, hits: 7, rotation: 3, name: "Reich 18 (12/7)"),
    // Drumming-inspired pattern
    "drumming": EuclideanPreset(steps: 8, hits: 6, rotation: 1, name: "Drumming (8/6)"),
    
    // === POLYRHYTHMIC COMBINATIONS ===
    // Very sparse - creates space
    "sparse": EuclideanPreset(steps: 16, hits: 1, rotation: 0, name: "Sparse (16/1)"),
    // Ultra-dense - machine gun
    "dense": EuclideanPreset(steps: 8, hits: 7, rotation: 0, name: "Dense (8/7)"),
    // Long cycle sparse
    "longSparse": EuclideanPreset(steps: 32, hits: 3, rotation: 0, name: "Long Sparse (32/3)"),
    
    // Custom - uses slider values
    "custom": EuclideanPreset(steps: 16, hits: 4, rotation: 0, name: "Custom"),
]
