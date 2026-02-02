import Foundation

/// Phrase length in seconds - chord changes align to this
let PHRASE_LENGTH: Double = 16

/// Voice count for the poly synth
let VOICE_COUNT = 6

/// Circle of Fifths sequence: each step is +7 semitones mod 12
/// Starting from C (0): C, G, D, A, E, B, F#, C#, G#, D#, A#, F
let COF_SEQUENCE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]

/// Chord voicing with MIDI notes and frequencies
struct ChordVoicing {
    var midiNotes: [Int]
    var frequencies: [Double]
}

/// Current harmony state
struct HarmonyState {
    var scaleFamily: ScaleFamily
    var currentChord: ChordVoicing
    var nextPhraseTime: Double
    var phrasesUntilChange: Int
    var chordDegrees: [Int]
}

/// Circle of Fifths configuration
struct CircleOfFifthsConfig {
    var enabled: Bool = true
    var driftRate: Int = 4         // 1..8 phrases between key changes
    var direction: String = "cw"   // "cw", "ccw", "random"
    var range: Int = 2             // 1..6 max steps from home
    var currentStep: Int = 0       // -6..6 current position
    var phraseCounter: Int = 0     // Counter for drift rate timing
}

/// Find the index in the circle for a given semitone value
func semitoneToCoFIndex(_ semitone: Int) -> Int {
    return COF_SEQUENCE.firstIndex(of: semitone % 12) ?? 0
}

/// Calculate the effective root note based on home key and step offset
func calculateDriftedRoot(homeRoot: Int, stepOffset: Int) -> Int {
    let homeIndex = semitoneToCoFIndex(homeRoot)
    let driftedIndex = ((homeIndex + stepOffset) % 12 + 12) % 12
    return COF_SEQUENCE[driftedIndex]
}

/// Result of Circle of Fifths drift update
struct DriftResult {
    var newStep: Int
    var newCounter: Int
    var didDrift: Bool
}

/// Update Circle of Fifths drift state at phrase boundary
func updateCircleOfFifthsDrift(
    config: CircleOfFifthsConfig,
    rng: () -> Double
) -> DriftResult {
    if !config.enabled {
        return DriftResult(newStep: 0, newCounter: 0, didDrift: false)
    }
    
    // Increment phrase counter
    var newCounter = config.phraseCounter + 1
    
    // Check if it's time to drift
    if newCounter < config.driftRate {
        return DriftResult(newStep: config.currentStep, newCounter: newCounter, didDrift: false)
    }
    
    // Time to drift - reset counter
    newCounter = 0
    
    // Determine drift direction
    var driftDir: Int
    if config.direction == "random" {
        driftDir = rng() < 0.5 ? 1 : -1
    } else {
        driftDir = config.direction == "cw" ? 1 : -1
    }
    
    // Calculate potential new step
    var newStep = config.currentStep + driftDir
    
    // Boundary behavior: bounce back if at range limit
    if abs(newStep) > config.range {
        // Reverse direction and head back toward home
        newStep = config.currentStep - driftDir
        // If still out of range (edge case), just stay at current
        if abs(newStep) > config.range {
            newStep = config.currentStep
        }
    }
    
    let didDrift = newStep != config.currentStep
    return DriftResult(newStep: newStep, newCounter: newCounter, didDrift: didDrift)
}

/// Get the next phrase boundary time (epoch seconds)
func getNextPhraseBoundary() -> Double {
    let nowSec = Date().timeIntervalSince1970
    return ceil(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH
}

/// Get current phrase boundary time
func getCurrentPhraseBoundary() -> Double {
    let nowSec = Date().timeIntervalSince1970
    return floor(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH
}

/// Get time until next phrase boundary in seconds
func getTimeUntilNextPhrase() -> Double {
    let nowSec = Date().timeIntervalSince1970
    let nextBoundary = ceil(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH
    return nextBoundary - nowSec
}

/// Get current phrase index (for deterministic scheduling)
func getCurrentPhraseIndex() -> Int {
    let nowSec = Date().timeIntervalSince1970
    return Int(floor(nowSec / PHRASE_LENGTH))
}

/// Generate a chord voicing from a scale
/// - Parameter rootNote: 0-11 semitone offset from C (E=4 by default)
func generateChordVoicing(
    rng: () -> Double,
    scale: ScaleFamily,
    tension: Double,
    voicingSpread: Double,
    detuneCents: Double,
    rootNote: Int = 4
) -> ChordVoicing {
    // Root at octave 2: C2=36, so root2 = 36 + rootNote
    let rootBase = 36 + rootNote
    
    // Get available notes in playable range (root2 to root5)
    let availableNotes = getScaleNotesInRange(
        scale: scale,
        lowMidi: rootBase,
        highMidi: rootBase + 36,
        rootNote: rootNote
    )
    
    // Number of notes in chord based on tension
    let noteCount = tension < 0.5 ? rngInt(rng, min: 3, max: 4) : rngInt(rng, min: 4, max: 5)
    
    // Select chord tones
    // Prefer root and fifth for stability
    let baseRoot = rootBase + (rngInt(rng, min: 0, max: 1) * 12)  // root2 or root3
    var selectedNotes: [Int] = [baseRoot]
    
    // Add fifth if in scale
    let fifthInterval = 7
    if scale.intervals.contains(fifthInterval) {
        let fifthNote = baseRoot + fifthInterval
        if !selectedNotes.contains(fifthNote) {
            selectedNotes.append(fifthNote)
        }
    }
    
    // Fill remaining voices from scale
    let remainingNotes = availableNotes.filter { !selectedNotes.contains($0) }
    var shuffled = rngShuffle(rng, remainingNotes)
    
    while selectedNotes.count < noteCount && !shuffled.isEmpty {
        let note = shuffled.removeLast()
        
        // Apply voicing spread - higher spread = more octave displacement
        if voicingSpread > 0.5 && rng() < voicingSpread {
            // Possibly shift octave up or down
            let shift = rngPick(rng, [-12, 12])
            let shiftedNote = note + shift
            if shiftedNote >= 36 && shiftedNote <= 84 && !selectedNotes.contains(shiftedNote) {
                selectedNotes.append(shiftedNote)
            } else if !selectedNotes.contains(note) {
                selectedNotes.append(note)
            }
        } else if !selectedNotes.contains(note) {
            selectedNotes.append(note)
        }
    }
    
    // Sort and limit to voice count
    let finalNotes = Array(selectedNotes.sorted().prefix(VOICE_COUNT))
    
    // Convert to frequencies with optional detune
    let frequencies = finalNotes.map { midi -> Double in
        let detuneOffset = rngFloat(rng, min: -detuneCents, max: detuneCents)
        return midiToFreq(Double(midi) + detuneOffset / 100.0)
    }
    
    return ChordVoicing(midiNotes: finalNotes, frequencies: frequencies)
}

/// Create initial harmony state
func createHarmonyState(
    seedMaterial: String,
    tension: Double,
    chordRate: Double,
    voicingSpread: Double,
    detuneCents: Double,
    scaleMode: String,
    manualScaleName: String,
    rootNote: Int = 4
) -> HarmonyState {
    let rng = createRng(seedMaterial)
    
    // Select scale
    var scaleFamily: ScaleFamily
    if scaleMode == "manual" {
        scaleFamily = getScaleByName(manualScaleName) ?? selectScaleFamily(rng: rng, tension: tension)
    } else {
        scaleFamily = selectScaleFamily(rng: rng, tension: tension)
    }
    
    // Generate initial chord
    let currentChord = generateChordVoicing(
        rng: rng,
        scale: scaleFamily,
        tension: tension,
        voicingSpread: voicingSpread,
        detuneCents: detuneCents,
        rootNote: rootNote
    )
    
    // Calculate phrases per chord change
    let phrasesPerChord = max(1, Int(round(chordRate / PHRASE_LENGTH)))
    
    return HarmonyState(
        scaleFamily: scaleFamily,
        currentChord: currentChord,
        nextPhraseTime: getNextPhraseBoundary(),
        phrasesUntilChange: phrasesPerChord,
        chordDegrees: currentChord.midiNotes.map { $0 % 12 }
    )
}

/// Update harmony state at phrase boundary
func updateHarmonyState(
    state: HarmonyState,
    seedMaterial: String,
    phraseIndex: Int,
    tension: Double,
    chordRate: Double,
    voicingSpread: Double,
    detuneCents: Double,
    scaleMode: String,
    manualScaleName: String,
    rootNote: Int = 4
) -> HarmonyState {
    // Create RNG seeded with phrase index for determinism
    let rng = createRng("\(seedMaterial)|phrase:\(phraseIndex)")
    
    let phrasesPerChord = max(1, Int(round(chordRate / PHRASE_LENGTH)))
    
    // Check if we need a new chord
    if state.phrasesUntilChange <= 1 {
        // Select potentially new scale
        var scaleFamily: ScaleFamily
        if scaleMode == "manual" {
            scaleFamily = getScaleByName(manualScaleName) ?? state.scaleFamily
        } else {
            // In auto mode, always re-evaluate scale based on current tension
            scaleFamily = selectScaleFamily(rng: rng, tension: tension)
        }
        
        // Generate new chord
        let currentChord = generateChordVoicing(
            rng: rng,
            scale: scaleFamily,
            tension: tension,
            voicingSpread: voicingSpread,
            detuneCents: detuneCents,
            rootNote: rootNote
        )
        
        return HarmonyState(
            scaleFamily: scaleFamily,
            currentChord: currentChord,
            nextPhraseTime: getNextPhraseBoundary(),
            phrasesUntilChange: phrasesPerChord,
            chordDegrees: currentChord.midiNotes.map { $0 % 12 }
        )
    }
    
    // No chord change, just update countdown
    var newState = state
    newState.nextPhraseTime = getNextPhraseBoundary()
    newState.phrasesUntilChange = state.phrasesUntilChange - 1
    return newState
}

/// Format chord degrees for display
func formatChordDegrees(_ midiNotes: [Int]) -> String {
    return midiNotes.map { midi in
        let noteName = NOTE_NAMES[midi % 12]
        let octave = (midi / 12) - 1
        return "\(noteName)\(octave)"
    }.joined(separator: " ")
}
