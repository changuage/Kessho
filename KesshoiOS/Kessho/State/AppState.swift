import Foundation
import Combine

/// Main application state - observable for SwiftUI
@MainActor
class AppState: ObservableObject {
    // MARK: - Published State
    @Published var state: SliderState = .default
    @Published var isPlaying: Bool = false
    @Published var savedPresets: [SavedPreset] = []
    @Published var showPresetList: Bool = false
    
    // Dual slider ranges - matches web app's dualRanges object
    // Key: parameter name, Value: (min, max) range
    @Published var dualRanges: [String: DualRange] = [:]
    
    // Current random walk values (interpolated between min/max)
    @Published var randomWalkValues: [String: Double] = [:]
    
    // Random walk animation phases (0-2π for each dual slider)
    private var walkPhases: [String: Double] = [:]
    
    // Engine state
    @Published var currentSeed: Int = 0
    @Published var currentBucket: String = ""
    @Published var cofCurrentStep: Int = 0
    @Published var currentFilterFreq: Double = 1000
    
    // Harmony state (from engine)
    @Published var currentChordDegrees: [Int] = []
    @Published var currentScaleName: String = ""
    
    // Morph state
    @Published var morphPresetA: SavedPreset?
    @Published var morphPresetB: SavedPreset?
    @Published var morphPosition: Double = 0  // 0-100
    @Published var morphMode: String = "manual"  // "manual", "auto"
    @Published var autoMorphEnabled: Bool = false
    @Published var autoMorphPhrasesRemaining: Int = 0
    
    // Auto-morph timer
    private var autoMorphTimer: Timer?
    private var autoMorphDuration: Int = 4  // phrases between morphs
    
    // Random walk timer for dual sliders
    private var randomWalkTimer: Timer?
    
    // MARK: - Audio Engine
    let audioEngine = AudioEngine()
    
    // MARK: - Preset Manager
    let presetManager = PresetManager()
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupBindings()
        loadPresets()
        startRandomWalkTimer()
    }
    
    private func setupBindings() {
        // Sync state changes to audio engine
        $state
            .dropFirst()
            .sink { [weak self] newState in
                self?.audioEngine.updateParams(newState)
            }
            .store(in: &cancellables)
        
        // Listen to engine state updates
        audioEngine.onStateChange = { [weak self] engineState in
            Task { @MainActor in
                self?.cofCurrentStep = engineState.cofCurrentStep
                self?.currentSeed = engineState.currentSeed
                self?.currentBucket = engineState.currentBucket
                self?.currentFilterFreq = engineState.currentFilterFreq
                if let harmony = engineState.harmonyState {
                    self?.currentChordDegrees = harmony.chordDegrees
                    self?.currentScaleName = harmony.scaleName
                }
            }
        }
    }
    
    // MARK: - Random Walk Timer
    
    /// Start the random walk timer that animates dual slider values
    private func startRandomWalkTimer() {
        randomWalkTimer?.invalidate()
        randomWalkTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tickRandomWalk()
            }
        }
    }
    
    /// Tick the random walk - update values for all active dual sliders
    private func tickRandomWalk() {
        guard !dualRanges.isEmpty else { return }
        
        // Use randomWalkSpeed from state (0.1 to 5.0)
        let walkSpeed = state.randomWalkSpeed * 0.02  // Base speed ~2% per tick
        
        for (key, range) in dualRanges {
            let rangeWidth = range.max - range.min
            guard rangeWidth > 0.001 else {
                randomWalkValues[key] = range.min
                continue
            }
            
            // Get or initialize phase for this slider
            var phase = walkPhases[key] ?? Double.random(in: 0...(.pi * 2))
            phase += walkSpeed
            if phase > .pi * 2 { phase -= .pi * 2 }
            walkPhases[key] = phase
            
            // Use sine wave for smooth oscillation
            let normalized = (sin(phase) + 1) / 2  // 0 to 1
            randomWalkValues[key] = range.min + normalized * rangeWidth
        }
    }
    
    // MARK: - Dual Slider Management
    
    /// Enable dual mode for a parameter
    func enableDualMode(for key: String, currentValue: Double, rangeMin: Double, rangeMax: Double) {
        // Initialize with 20% spread around current value
        let spread = (rangeMax - rangeMin) * 0.2
        let min = Swift.max(rangeMin, currentValue - spread)
        let max = Swift.min(rangeMax, currentValue + spread)
        dualRanges[key] = DualRange(min: min, max: max)
        randomWalkValues[key] = currentValue
        walkPhases[key] = 0
    }
    
    /// Disable dual mode for a parameter
    func disableDualMode(for key: String) {
        dualRanges.removeValue(forKey: key)
        randomWalkValues.removeValue(forKey: key)
        walkPhases.removeValue(forKey: key)
    }
    
    /// Toggle dual mode for a parameter
    func toggleDualMode(for key: String, currentValue: Double, rangeMin: Double, rangeMax: Double) {
        if dualRanges[key] != nil {
            disableDualMode(for: key)
        } else {
            enableDualMode(for: key, currentValue: currentValue, rangeMin: rangeMin, rangeMax: rangeMax)
        }
    }
    
    /// Update dual range min/max
    func updateDualRange(for key: String, min: Double, max: Double) {
        dualRanges[key] = DualRange(min: min, max: max)
    }
    
    private func loadPresets() {
        savedPresets = presetManager.loadBundledPresets()
    }
    
    // MARK: - Playback Control
    
    func start() {
        audioEngine.start(with: state)
        isPlaying = true
    }
    
    func stop() {
        audioEngine.stop()
        isPlaying = false
    }
    
    func togglePlayback() {
        if isPlaying {
            stop()
        } else {
            start()
        }
    }
    
    // MARK: - Preset Management
    
    func loadPreset(_ preset: SavedPreset) {
        state = preset.state
        audioEngine.resetCofDrift()
        morphPresetA = preset
        morphPosition = 0
        
        // Load dual ranges from preset (if any)
        dualRanges = preset.dualRanges ?? [:]
        randomWalkValues.removeAll()
        
        // Initialize walk values for loaded dual ranges
        for (key, range) in dualRanges {
            randomWalkValues[key] = (range.min + range.max) / 2
        }
    }
    
    func saveCurrentAsPreset(name: String) {
        let preset = SavedPreset(
            name: name,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            state: state,
            dualRanges: dualRanges.isEmpty ? nil : dualRanges
        )
        savedPresets.append(preset)
        presetManager.savePreset(preset)
    }
    
    // MARK: - Morph
    
    func setMorphPosition(_ position: Double) {
        morphPosition = position
        
        guard let presetA = morphPresetA, let presetB = morphPresetB else { return }
        
        let t = position / 100.0
        let morphedState = lerpPresets(presetA.state, presetB.state, t: t)
        state = morphedState
        
        // Morph dual ranges between presets
        dualRanges = lerpDualRanges(
            presetA.dualRanges ?? [:],
            presetB.dualRanges ?? [:],
            stateA: presetA.state,
            stateB: presetB.state,
            t: t
        )
    }
    
    /// Lerp dual ranges between presets - handles all cases:
    /// - Single → Single: No dual range needed
    /// - Single → Dual: Creates dual slider with values converging from single to range
    /// - Dual → Single: Range converges to single value
    /// - Dual → Dual: Both min and max lerp independently
    private func lerpDualRanges(
        _ a: [String: DualRange],
        _ b: [String: DualRange],
        stateA: SliderState,
        stateB: SliderState,
        t: Double
    ) -> [String: DualRange] {
        var result: [String: DualRange] = [:]
        
        // Get all keys that have dual ranges in either preset
        let allKeys = Set(a.keys).union(Set(b.keys))
        
        for key in allKeys {
            let rangeA = a[key]
            let rangeB = b[key]
            
            switch (rangeA, rangeB) {
            case let (aRange?, bRange?):
                // Dual → Dual: Lerp min and max independently
                result[key] = DualRange(
                    min: lerp(aRange.min, bRange.min, t),
                    max: lerp(aRange.max, bRange.max, t)
                )
                
            case let (aRange?, nil):
                // Dual → Single: Converge range to single value
                // Get single value from B's state (we'd need to reflect on the key)
                let singleValue = aRange.min + (aRange.max - aRange.min) / 2  // Fallback to center
                if t < 1.0 {
                    result[key] = DualRange(
                        min: lerp(aRange.min, singleValue, t),
                        max: lerp(aRange.max, singleValue, t)
                    )
                }
                // At t=1.0, don't include (becomes single slider)
                
            case let (nil, bRange?):
                // Single → Dual: Expand from single value to range
                let singleValue = bRange.min + (bRange.max - bRange.min) / 2  // Fallback to center
                result[key] = DualRange(
                    min: lerp(singleValue, bRange.min, t),
                    max: lerp(singleValue, bRange.max, t)
                )
                
            case (nil, nil):
                break // Neither has dual range
            }
        }
        
        return result
    }
    
    private func lerpPresets(_ a: SliderState, _ b: SliderState, t: Double) -> SliderState {
        var result = a
        
        // Lerp numeric values
        result.masterVolume = lerp(a.masterVolume, b.masterVolume, t)
        result.synthLevel = lerp(a.synthLevel, b.synthLevel, t)
        result.granularLevel = lerp(a.granularLevel, b.granularLevel, t)
        result.synthReverbSend = lerp(a.synthReverbSend, b.synthReverbSend, t)
        result.granularReverbSend = lerp(a.granularReverbSend, b.granularReverbSend, t)
        result.leadReverbSend = lerp(a.leadReverbSend, b.leadReverbSend, t)
        result.reverbLevel = lerp(a.reverbLevel, b.reverbLevel, t)
        result.tension = lerp(a.tension, b.tension, t)
        result.randomness = lerp(a.randomness, b.randomness, t)
        result.waveSpread = lerp(a.waveSpread, b.waveSpread, t)
        result.detune = lerp(a.detune, b.detune, t)
        result.synthAttack = lerp(a.synthAttack, b.synthAttack, t)
        result.synthDecay = lerp(a.synthDecay, b.synthDecay, t)
        result.synthSustain = lerp(a.synthSustain, b.synthSustain, t)
        result.synthRelease = lerp(a.synthRelease, b.synthRelease, t)
        result.hardness = lerp(a.hardness, b.hardness, t)
        result.filterCutoffMin = lerp(a.filterCutoffMin, b.filterCutoffMin, t)
        result.filterCutoffMax = lerp(a.filterCutoffMax, b.filterCutoffMax, t)
        result.reverbDecay = lerp(a.reverbDecay, b.reverbDecay, t)
        result.reverbSize = lerp(a.reverbSize, b.reverbSize, t)
        result.grainSizeMin = lerp(a.grainSizeMin, b.grainSizeMin, t)
        result.grainSizeMax = lerp(a.grainSizeMax, b.grainSizeMax, t)
        result.density = lerp(a.density, b.density, t)
        result.leadLevel = lerp(a.leadLevel, b.leadLevel, t)
        
        // Snap discrete values at 50%
        if t >= 0.5 {
            result.scaleMode = b.scaleMode
            result.manualScale = b.manualScale
            result.seedWindow = b.seedWindow
            result.filterType = b.filterType
            result.reverbType = b.reverbType
            result.grainPitchMode = b.grainPitchMode
            result.leadEnabled = b.leadEnabled
            result.granularEnabled = b.granularEnabled
        }
        
        // Handle root note via Circle of Fifths path walking
        // Walk from A to B through the CoF (shortest path)
        result.rootNote = interpolateRootNoteViaCoF(from: a.rootNote, to: b.rootNote, t: t)
        
        return result
    }
    
    /// Interpolate root note by walking the Circle of Fifths
    /// This finds the shortest path on the CoF and walks through intermediate keys
    private func interpolateRootNoteViaCoF(from aNote: Int, to bNote: Int, t: Double) -> Int {
        // Find positions on Circle of Fifths
        guard let aIndex = COF_SEMITONES.firstIndex(of: aNote),
              let bIndex = COF_SEMITONES.firstIndex(of: bNote) else {
            // Fallback to snap at 50% if notes aren't in CoF (shouldn't happen)
            return t < 0.5 ? aNote : bNote
        }
        
        if aIndex == bIndex {
            return aNote
        }
        
        // Calculate clockwise and counter-clockwise distances
        let cwDistance = (bIndex - aIndex + 12) % 12
        let ccwDistance = (aIndex - bIndex + 12) % 12
        
        // Choose shorter path (prefer clockwise on tie)
        let (direction, distance): (Int, Int) = cwDistance <= ccwDistance ? (1, cwDistance) : (-1, ccwDistance)
        
        // Calculate current step along the path
        let steps = Double(distance) * t
        let currentStep = Int(steps.rounded())
        
        // Get the intermediate position on CoF
        let intermediateIndex = ((aIndex + direction * currentStep) % 12 + 12) % 12
        
        // Return the semitone value at that position
        return COF_SEMITONES[intermediateIndex]
    }
    
    private func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        return a + (b - a) * t
    }
    
    // MARK: - Auto-Morph Cycle (matching web app)
    
    /// Start automatic morphing cycle between presets
    func startAutoMorph(phraseDuration: Int = 4) {
        guard savedPresets.count >= 2 else { return }
        
        autoMorphEnabled = true
        autoMorphDuration = phraseDuration
        autoMorphPhrasesRemaining = phraseDuration
        
        // Pick initial presets
        if morphPresetA == nil {
            morphPresetA = savedPresets.randomElement()
        }
        morphPresetB = savedPresets.filter { $0.id != morphPresetA?.id }.randomElement()
        
        // Start timer (16 seconds per phrase)
        autoMorphTimer?.invalidate()
        autoMorphTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.tickAutoMorph()
        }
    }
    
    /// Stop automatic morphing
    func stopAutoMorph() {
        autoMorphEnabled = false
        autoMorphTimer?.invalidate()
        autoMorphTimer = nil
    }
    
    private func tickAutoMorph() {
        guard autoMorphEnabled, let presetA = morphPresetA, let presetB = morphPresetB else { return }
        
        // Increment morph position smoothly
        let step = 100.0 / Double(autoMorphDuration * 16)  // 16 ticks per phrase
        morphPosition = min(100, morphPosition + step)
        
        // Apply morphed state
        let morphedState = lerpPresets(presetA.state, presetB.state, t: morphPosition / 100.0)
        state = morphedState
        
        // Check if we've completed this morph
        if morphPosition >= 100 {
            // Move to next pair
            morphPresetA = morphPresetB
            morphPresetB = savedPresets.filter { $0.id != morphPresetA?.id }.randomElement()
            morphPosition = 0
            autoMorphPhrasesRemaining = autoMorphDuration
        }
    }
    
    /// Toggle auto-morph on/off
    func toggleAutoMorph() {
        if autoMorphEnabled {
            stopAutoMorph()
        } else {
            startAutoMorph()
        }
    }
}