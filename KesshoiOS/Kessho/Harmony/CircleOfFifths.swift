import Foundation

/// Circle of Fifths logic for key drift and display

/// Circle of Fifths order (by semitone): C, G, D, A, E, B, F#, C#, G#, D#, A#, F
/// Uses sharps consistently (matching web app) - enharmonically equivalent to flats
let COF_ORDER = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"]

/// Semitone values for each CoF position
let COF_SEMITONES = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]

/// Circle of Fifths state for drift tracking
class CircleOfFifthsState: ObservableObject {
    @Published var homeRoot: Int = 4  // E by default
    @Published var currentStep: Int = 0
    @Published var driftEnabled: Bool = true
    @Published var driftRate: Int = 4
    @Published var driftDirection: String = "cw"  // "cw", "ccw", "random"
    @Published var driftRange: Int = 2
    
    private var phraseCounter: Int = 0
    
    /// Get the current effective root note (after drift)
    var effectiveRoot: Int {
        return calculateDriftedRoot(homeRoot: homeRoot, stepOffset: currentStep)
    }
    
    /// Get the current position on the circle (0-11)
    var currentPosition: Int {
        let homeIndex = semitoneToCoFIndex(homeRoot)
        return ((homeIndex + currentStep) % 12 + 12) % 12
    }
    
    /// Get the note name for current position
    var currentNoteName: String {
        return COF_ORDER[currentPosition]
    }
    
    /// Reset drift to home position
    func resetDrift() {
        currentStep = 0
        phraseCounter = 0
    }
    
    /// Update drift at phrase boundary
    /// Returns true if a drift occurred
    @discardableResult
    func updateAtPhraseBoundary(rng: () -> Double) -> Bool {
        guard driftEnabled else {
            currentStep = 0
            return false
        }
        
        phraseCounter += 1
        
        // Check if it's time to drift
        guard phraseCounter >= driftRate else {
            return false
        }
        
        // Time to drift - reset counter
        phraseCounter = 0
        
        // Determine drift direction
        let driftDir: Int
        if driftDirection == "random" {
            driftDir = rng() < 0.5 ? 1 : -1
        } else {
            driftDir = driftDirection == "cw" ? 1 : -1
        }
        
        // Calculate potential new step
        var newStep = currentStep + driftDir
        
        // Boundary behavior: bounce back if at range limit
        if abs(newStep) > driftRange {
            newStep = currentStep - driftDir
            if abs(newStep) > driftRange {
                newStep = currentStep
            }
        }
        
        let didDrift = newStep != currentStep
        currentStep = newStep
        return didDrift
    }
    
    /// Set home root from note name
    func setHomeRoot(noteName: String) {
        if let index = COF_ORDER.firstIndex(of: noteName) {
            homeRoot = COF_SEMITONES[index]
            resetDrift()
        }
    }
    
    /// Get all 12 positions with their angles for UI rendering
    func getAllPositions() -> [(name: String, angle: Double, isHome: Bool, isCurrent: Bool)] {
        let homeIndex = semitoneToCoFIndex(homeRoot)
        let currentPos = currentPosition
        
        return (0..<12).map { i in
            let angle = Double(i) * (360.0 / 12.0) - 90  // Start at top (-90°)
            let isHome = i == homeIndex
            let isCurrent = i == currentPos
            return (name: COF_ORDER[i], angle: angle, isHome: isHome, isCurrent: isCurrent)
        }
    }
}
