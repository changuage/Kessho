import Foundation

/// Scale tension levels
enum TensionLevel: String, Codable {
    case consonant
    case color
    case high
}

/// Scale family definition
struct ScaleFamily {
    let name: String
    let intervals: [Int]
    let tensionLevel: TensionLevel
    let tensionValue: Double  // 0-1 for sorting/selection
}

/// All available scale families
let SCALE_FAMILIES: [ScaleFamily] = [
    // Consonant - Major/Bright (tension 0 - 0.25)
    ScaleFamily(
        name: "Major Pentatonic",
        intervals: [0, 2, 4, 7, 9],
        tensionLevel: .consonant,
        tensionValue: 0.0
    ),
    ScaleFamily(
        name: "Major (Ionian)",
        intervals: [0, 2, 4, 5, 7, 9, 11],
        tensionLevel: .consonant,
        tensionValue: 0.05
    ),
    ScaleFamily(
        name: "Lydian",
        intervals: [0, 2, 4, 6, 7, 9, 11],
        tensionLevel: .consonant,
        tensionValue: 0.10
    ),
    ScaleFamily(
        name: "Mixolydian",
        intervals: [0, 2, 4, 5, 7, 9, 10],
        tensionLevel: .consonant,
        tensionValue: 0.18
    ),
    ScaleFamily(
        name: "Minor Pentatonic",
        intervals: [0, 3, 5, 7, 10],
        tensionLevel: .consonant,
        tensionValue: 0.22
    ),
    ScaleFamily(
        name: "Dorian",
        intervals: [0, 2, 3, 5, 7, 9, 10],
        tensionLevel: .consonant,
        tensionValue: 0.25
    ),
    
    // Color/Tension (tension 0.25 - 0.55)
    ScaleFamily(
        name: "Aeolian",
        intervals: [0, 2, 3, 5, 7, 8, 10],
        tensionLevel: .color,
        tensionValue: 0.35
    ),
    ScaleFamily(
        name: "Harmonic Minor",
        intervals: [0, 2, 3, 5, 7, 8, 11],
        tensionLevel: .color,
        tensionValue: 0.5
    ),
    ScaleFamily(
        name: "Melodic Minor",
        intervals: [0, 2, 3, 5, 7, 9, 11],
        tensionLevel: .color,
        tensionValue: 0.55
    ),
    
    // High tension (tension 0.55 - 1.0)
    ScaleFamily(
        name: "Octatonic Half-Whole",
        intervals: [0, 1, 3, 4, 6, 7, 9, 10],
        tensionLevel: .high,
        tensionValue: 0.85
    ),
    ScaleFamily(
        name: "Phrygian Dominant",
        intervals: [0, 1, 4, 5, 7, 8, 10],
        tensionLevel: .high,
        tensionValue: 0.9
    )
]

/// Get scales within a tension band
func getScalesInTensionBand(tension: Double) -> [ScaleFamily] {
    if tension <= 0.25 {
        return SCALE_FAMILIES.filter { $0.tensionLevel == .consonant }
    } else if tension <= 0.55 {
        // Include some consonant for smooth transitions
        return SCALE_FAMILIES.filter { $0.tensionLevel == .consonant || $0.tensionLevel == .color }
    } else if tension <= 0.8 {
        return SCALE_FAMILIES.filter { $0.tensionLevel == .color || $0.tensionLevel == .high }
    } else {
        return SCALE_FAMILIES.filter { $0.tensionLevel == .high }
    }
}

/// Select a scale family based on tension using seeded RNG
func selectScaleFamily(rng: () -> Double, tension: Double) -> ScaleFamily {
    let candidates = getScalesInTensionBand(tension: tension)
    
    // Weight by proximity to tension value using power 1.5 for stronger falloff
    let weights = candidates.map { scale -> Double in
        let distance = abs(scale.tensionValue - tension)
        return pow(1 / (distance + 0.05), 1.5)
    }
    
    let totalWeight = weights.reduce(0, +)
    var random = rng() * totalWeight
    
    for (i, scale) in candidates.enumerated() {
        random -= weights[i]
        if random <= 0 { return scale }
    }
    
    return candidates[candidates.count - 1]
}

/// Get scale family by name
func getScaleByName(_ name: String) -> ScaleFamily? {
    return SCALE_FAMILIES.first { $0.name == name }
}

/// Convert scale interval to MIDI note
/// E2 = 40, E3 = 52
func intervalToMidi(_ interval: Int, octave: Int = 2) -> Int {
    let E_BASE = 40  // E2
    return E_BASE + (octave - 2) * 12 + interval
}

/// MIDI note to frequency
func midiToFreq(_ midi: Int) -> Double {
    return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
}

/// MIDI note to frequency (Double version)
func midiToFreq(_ midi: Double) -> Double {
    return 440.0 * pow(2.0, (midi - 69.0) / 12.0)
}

/// Get all MIDI notes in scale within a range
/// - Parameter rootNote: 0-11 semitone offset from C (E=4 by default)
func getScaleNotesInRange(
    scale: ScaleFamily,
    lowMidi: Int,
    highMidi: Int,
    rootNote: Int = 4  // E by default
) -> [Int] {
    var notes: [Int] = []
    // Root at octave 2: C2=36, so root2 = 36 + rootNote
    let ROOT_BASE = 36 + rootNote  // e.g. E2 = 40 when rootNote = 4
    
    for octave in 0..<8 {
        for interval in scale.intervals {
            let midi = ROOT_BASE + octave * 12 + interval
            if midi >= lowMidi && midi <= highMidi {
                notes.append(midi)
            }
        }
    }
    
    return notes.sorted()
}

/// Note names for display
let NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

/// Get note name from MIDI note
func midiToNoteName(_ midi: Int) -> String {
    let note = midi % 12
    let octave = (midi / 12) - 1
    return "\(NOTE_NAMES[note])\(octave)"
}

/// Get semitone offset from C for a note name
func noteNameToSemitone(_ name: String) -> Int? {
    let baseName = name.replacingOccurrences(of: "b", with: "")
                       .replacingOccurrences(of: "#", with: "")
                       .prefix(1)
    
    let baseValues: [String: Int] = [
        "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11
    ]
    
    guard var value = baseValues[String(baseName)] else { return nil }
    
    if name.contains("#") { value += 1 }
    if name.contains("b") { value -= 1 }
    
    return (value + 12) % 12
}
