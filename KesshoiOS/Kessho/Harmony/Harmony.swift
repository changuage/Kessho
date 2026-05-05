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
    var progression: ChordProgressionState
}

/// Phrase-step chord sequencer, modeled after the web harmony progression.
struct ChordProgressionState {
    var enabled: Bool
    var pattern: [Int]
    var step: Int
    var stepEnabled: [Bool]
    var phraseMultiplier: Int
    var phraseCounter: Int
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

/// Get the next phrase boundary time (epoch seconds)
func getNextPhraseBoundary(phraseLength: Double = PHRASE_LENGTH) -> Double {
    let nowSec = Date().timeIntervalSince1970
    let length = max(0.001, phraseLength)
    return ceil(nowSec / length) * length
}

/// Get time until next phrase boundary in seconds
func getTimeUntilNextPhrase(phraseLength: Double = PHRASE_LENGTH) -> Double {
    let nowSec = Date().timeIntervalSince1970
    let length = max(0.001, phraseLength)
    let nextBoundary = ceil(nowSec / length) * length
    return nextBoundary - nowSec
}

/// Get current phrase index (for deterministic scheduling)
func getCurrentPhraseIndex(phraseLength: Double = PHRASE_LENGTH) -> Int {
    let nowSec = Date().timeIntervalSince1970
    return Int(floor(nowSec / max(0.001, phraseLength)))
}

func createDefaultChordProgression(
    enabled: Bool,
    pattern: [Int],
    steps: Int,
    stepEnabled: [Bool],
    phraseMultiplier: Int
) -> ChordProgressionState {
    let safeSteps = max(1, min(8, steps))
    let defaultPattern = pattern.isEmpty ? [0, 3, 4, 0] : pattern
    let normalizedPattern = (0..<safeSteps).map { index in
        defaultPattern[index % defaultPattern.count]
    }
    let normalizedEnabled = (0..<safeSteps).map { index in
        index < stepEnabled.count ? stepEnabled[index] : true
    }

    return ChordProgressionState(
        enabled: enabled,
        pattern: normalizedPattern,
        step: 0,
        stepEnabled: normalizedEnabled,
        phraseMultiplier: max(1, phraseMultiplier),
        phraseCounter: 0
    )
}

func rootForScaleDegree(rootNote: Int, scale: ScaleFamily, degree: Int) -> Int {
    guard !scale.intervals.isEmpty else { return ((rootNote % 12) + 12) % 12 }
    let count = scale.intervals.count
    let positiveDegree = max(0, degree)
    let index = positiveDegree % count
    let octaveOffset = (positiveDegree / count) * 12
    let semitone = scale.intervals[index] + octaveOffset
    return ((rootNote + semitone) % 12 + 12) % 12
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
    rootNote: Int = 4,
    phraseLength: Double = PHRASE_LENGTH,
    chordProgressionEnabled: Bool = false,
    chordProgressionPattern: [Int] = [0, 3, 4, 0],
    chordProgressionSteps: Int = 4,
    chordProgressionStepEnabled: [Bool] = [true, true, true, true],
    chordProgressionPhraseMultiplier: Int = 1
) -> HarmonyState {
    let rng = createRng(seedMaterial)
    let phraseSeconds = max(0.001, phraseLength)

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
    let phrasesPerChord = max(1, Int(round(chordRate / phraseSeconds)))

    return HarmonyState(
        scaleFamily: scaleFamily,
        currentChord: currentChord,
        nextPhraseTime: getNextPhraseBoundary(phraseLength: phraseSeconds),
        phrasesUntilChange: phrasesPerChord,
        chordDegrees: currentChord.midiNotes.map { $0 % 12 },
        progression: createDefaultChordProgression(
            enabled: chordProgressionEnabled,
            pattern: chordProgressionPattern,
            steps: chordProgressionSteps,
            stepEnabled: chordProgressionStepEnabled,
            phraseMultiplier: chordProgressionPhraseMultiplier
        )
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
    rootNote: Int = 4,
    phraseLength: Double = PHRASE_LENGTH,
    chordProgressionEnabled: Bool = false,
    chordProgressionPattern: [Int] = [0, 3, 4, 0],
    chordProgressionSteps: Int = 4,
    chordProgressionStepEnabled: [Bool] = [true, true, true, true],
    chordProgressionPhraseMultiplier: Int = 1,
    progressionPhraseIndex: Int? = nil,
    isPhraseBoundary: Bool = true
) -> HarmonyState {
    // Create RNG seeded with phrase index for determinism
    let rng = createRng("\(seedMaterial)|phrase:\(phraseIndex)")
    let phraseSeconds = max(0.001, phraseLength)

    let phrasesPerChord = max(1, Int(round(chordRate / phraseSeconds)))
    var progression = state.progression
    var progressionDegree: Int?
    var forceNewChord = false

    progression.enabled = chordProgressionEnabled
    if isPhraseBoundary && progression.enabled {
        let safeSteps = max(1, min(8, chordProgressionSteps))
        let fallbackPattern = chordProgressionPattern.isEmpty ? [0, 3, 4, 0] : chordProgressionPattern
        progression.pattern = (0..<safeSteps).map { index in
            fallbackPattern[index % fallbackPattern.count]
        }
        progression.stepEnabled = (0..<safeSteps).map { index in
            index < chordProgressionStepEnabled.count ? chordProgressionStepEnabled[index] : true
        }
        progression.phraseMultiplier = max(1, chordProgressionPhraseMultiplier)

        let sourcePhraseIndex = max(0, progressionPhraseIndex ?? phraseIndex)
        let nextStep = (sourcePhraseIndex / progression.phraseMultiplier) % safeSteps
        let stepChanged = nextStep != progression.step
        progression.step = nextStep
        progression.phraseCounter = sourcePhraseIndex % progression.phraseMultiplier

        if stepChanged && progression.stepEnabled[nextStep] {
            progressionDegree = progression.pattern[nextStep]
            forceNewChord = true
        }
    }

    // Check if we need a new chord
    if !isPhraseBoundary || forceNewChord || state.phrasesUntilChange <= 1 {
        // Select potentially new scale
        var scaleFamily: ScaleFamily
        if scaleMode == "manual" {
            scaleFamily = getScaleByName(manualScaleName) ?? state.scaleFamily
        } else {
            // In auto mode, always re-evaluate scale based on current tension
            scaleFamily = selectScaleFamily(rng: rng, tension: tension)
        }

        let chordRoot = progressionDegree.map {
            rootForScaleDegree(rootNote: rootNote, scale: scaleFamily, degree: $0)
        } ?? rootNote

        // Generate new chord
        let currentChord = generateChordVoicing(
            rng: rng,
            scale: scaleFamily,
            tension: tension,
            voicingSpread: voicingSpread,
            detuneCents: detuneCents,
            rootNote: chordRoot
        )

        return HarmonyState(
            scaleFamily: scaleFamily,
            currentChord: currentChord,
            nextPhraseTime: Double(phraseIndex + 1) * phraseSeconds,
            phrasesUntilChange: isPhraseBoundary ? phrasesPerChord : state.phrasesUntilChange,
            chordDegrees: currentChord.midiNotes.map { $0 % 12 },
            progression: progression
        )
    }

    // No chord change, just update countdown
    var newState = state
    newState.nextPhraseTime = Double(phraseIndex + 1) * phraseSeconds
    newState.phrasesUntilChange = isPhraseBoundary ? state.phrasesUntilChange - 1 : state.phrasesUntilChange
    newState.progression = progression
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
