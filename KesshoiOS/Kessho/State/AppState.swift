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
    
    // Morph state (matching web app)
    @Published var morphPresetA: SavedPreset?
    @Published var morphPresetB: SavedPreset?
    @Published var morphPosition: Double = 0  // 0-100
    @Published var morphMode: String = "manual"  // "manual", "auto"
    @Published var autoMorphEnabled: Bool = false
    @Published var autoMorphPhrasesRemaining: Int = 0
    @Published var morphPlayPhrases: Int = 16     // How long to stay at each preset
    @Published var morphTransitionPhrases: Int = 8  // How long the transition takes
    @Published var morphPhase: String = ""        // "Playing A", "Morphing to B", etc.
    
    // Auto-morph timer
    private var autoMorphTimer: Timer?
    private var autoMorphCurrentPhase: AutoMorphPhase = .playingA
    private var phrasesInCurrentPhase: Int = 0
    
    private enum AutoMorphPhase {
        case playingA
        case morphingToB
        case playingB
        case morphingToA
    }
    
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
        
        // === Master Mixer ===
        result.masterVolume = lerp(a.masterVolume, b.masterVolume, t)
        result.synthLevel = lerp(a.synthLevel, b.synthLevel, t)
        result.granularLevel = lerp(a.granularLevel, b.granularLevel, t)
        result.synthReverbSend = lerp(a.synthReverbSend, b.synthReverbSend, t)
        result.granularReverbSend = lerp(a.granularReverbSend, b.granularReverbSend, t)
        result.leadReverbSend = lerp(a.leadReverbSend, b.leadReverbSend, t)
        result.leadDelayReverbSend = lerp(a.leadDelayReverbSend, b.leadDelayReverbSend, t)
        result.reverbLevel = lerp(a.reverbLevel, b.reverbLevel, t)
        
        // === Global ===
        result.randomness = lerp(a.randomness, b.randomness, t)
        
        // === Circle of Fifths Drift ===
        result.cofDriftRate = lerpInt(a.cofDriftRate, b.cofDriftRate, t)
        result.cofDriftRange = lerpInt(a.cofDriftRange, b.cofDriftRange, t)
        
        // === Harmony ===
        result.tension = lerp(a.tension, b.tension, t)
        result.chordRate = lerpInt(a.chordRate, b.chordRate, t)
        result.voicingSpread = lerp(a.voicingSpread, b.voicingSpread, t)
        
        // === Synth Oscillator ===
        result.waveSpread = lerp(a.waveSpread, b.waveSpread, t)
        result.detune = lerp(a.detune, b.detune, t)
        result.synthAttack = lerp(a.synthAttack, b.synthAttack, t)
        result.synthDecay = lerp(a.synthDecay, b.synthDecay, t)
        result.synthSustain = lerp(a.synthSustain, b.synthSustain, t)
        result.synthRelease = lerp(a.synthRelease, b.synthRelease, t)
        result.synthVoiceMask = lerpInt(a.synthVoiceMask, b.synthVoiceMask, t)
        result.synthOctave = lerpInt(a.synthOctave, b.synthOctave, t)
        
        // === Synth Timbre ===
        result.hardness = lerp(a.hardness, b.hardness, t)
        result.oscBrightness = lerpInt(a.oscBrightness, b.oscBrightness, t)
        result.filterCutoffMin = lerp(a.filterCutoffMin, b.filterCutoffMin, t)
        result.filterCutoffMax = lerp(a.filterCutoffMax, b.filterCutoffMax, t)
        result.filterModSpeed = lerp(a.filterModSpeed, b.filterModSpeed, t)
        result.filterResonance = lerp(a.filterResonance, b.filterResonance, t)
        result.filterQ = lerp(a.filterQ, b.filterQ, t)
        result.warmth = lerp(a.warmth, b.warmth, t)
        result.presence = lerp(a.presence, b.presence, t)
        result.airNoise = lerp(a.airNoise, b.airNoise, t)
        
        // === Reverb ===
        result.reverbDecay = lerp(a.reverbDecay, b.reverbDecay, t)
        result.reverbSize = lerp(a.reverbSize, b.reverbSize, t)
        result.reverbDiffusion = lerp(a.reverbDiffusion, b.reverbDiffusion, t)
        result.reverbModulation = lerp(a.reverbModulation, b.reverbModulation, t)
        result.predelay = lerp(a.predelay, b.predelay, t)
        result.damping = lerp(a.damping, b.damping, t)
        result.width = lerp(a.width, b.width, t)
        
        // === Granular ===
        result.maxGrains = lerp(a.maxGrains, b.maxGrains, t)
        result.grainProbability = lerp(a.grainProbability, b.grainProbability, t)
        result.grainSizeMin = lerp(a.grainSizeMin, b.grainSizeMin, t)
        result.grainSizeMax = lerp(a.grainSizeMax, b.grainSizeMax, t)
        result.density = lerp(a.density, b.density, t)
        result.spray = lerp(a.spray, b.spray, t)
        result.jitter = lerp(a.jitter, b.jitter, t)
        result.pitchSpread = lerp(a.pitchSpread, b.pitchSpread, t)
        result.stereoSpread = lerp(a.stereoSpread, b.stereoSpread, t)
        result.feedback = lerp(a.feedback, b.feedback, t)
        result.wetHPF = lerp(a.wetHPF, b.wetHPF, t)
        result.wetLPF = lerp(a.wetLPF, b.wetLPF, t)
        
        // === Lead Synth ===
        result.leadLevel = lerp(a.leadLevel, b.leadLevel, t)
        result.leadAttack = lerp(a.leadAttack, b.leadAttack, t)
        result.leadDecay = lerp(a.leadDecay, b.leadDecay, t)
        result.leadSustain = lerp(a.leadSustain, b.leadSustain, t)
        result.leadRelease = lerp(a.leadRelease, b.leadRelease, t)
        result.leadDelayTimeMin = lerp(a.leadDelayTimeMin, b.leadDelayTimeMin, t)
        result.leadDelayTimeMax = lerp(a.leadDelayTimeMax, b.leadDelayTimeMax, t)
        result.leadDelayFeedbackMin = lerp(a.leadDelayFeedbackMin, b.leadDelayFeedbackMin, t)
        result.leadDelayFeedbackMax = lerp(a.leadDelayFeedbackMax, b.leadDelayFeedbackMax, t)
        result.leadDelayMixMin = lerp(a.leadDelayMixMin, b.leadDelayMixMin, t)
        result.leadDelayMixMax = lerp(a.leadDelayMixMax, b.leadDelayMixMax, t)
        result.leadDensity = lerp(a.leadDensity, b.leadDensity, t)
        result.leadOctave = lerpInt(a.leadOctave, b.leadOctave, t)
        result.leadOctaveRange = lerpInt(a.leadOctaveRange, b.leadOctaveRange, t)
        result.leadTimbreMin = lerp(a.leadTimbreMin, b.leadTimbreMin, t)
        result.leadTimbreMax = lerp(a.leadTimbreMax, b.leadTimbreMax, t)
        result.leadVibratoDepthMin = lerp(a.leadVibratoDepthMin, b.leadVibratoDepthMin, t)
        result.leadVibratoDepthMax = lerp(a.leadVibratoDepthMax, b.leadVibratoDepthMax, t)
        result.leadVibratoRateMin = lerp(a.leadVibratoRateMin, b.leadVibratoRateMin, t)
        result.leadVibratoRateMax = lerp(a.leadVibratoRateMax, b.leadVibratoRateMax, t)
        result.leadGlideMin = lerp(a.leadGlideMin, b.leadGlideMin, t)
        result.leadGlideMax = lerp(a.leadGlideMax, b.leadGlideMax, t)
        
        // === Euclidean Sequencer ===
        result.leadEuclideanTempo = lerp(a.leadEuclideanTempo, b.leadEuclideanTempo, t)
        // Lane 1
        result.leadEuclid1Steps = lerpInt(a.leadEuclid1Steps, b.leadEuclid1Steps, t)
        result.leadEuclid1Hits = lerpInt(a.leadEuclid1Hits, b.leadEuclid1Hits, t)
        result.leadEuclid1Rotation = lerpInt(a.leadEuclid1Rotation, b.leadEuclid1Rotation, t)
        result.leadEuclid1NoteMin = lerpInt(a.leadEuclid1NoteMin, b.leadEuclid1NoteMin, t)
        result.leadEuclid1NoteMax = lerpInt(a.leadEuclid1NoteMax, b.leadEuclid1NoteMax, t)
        result.leadEuclid1Level = lerp(a.leadEuclid1Level, b.leadEuclid1Level, t)
        // Lane 2
        result.leadEuclid2Steps = lerpInt(a.leadEuclid2Steps, b.leadEuclid2Steps, t)
        result.leadEuclid2Hits = lerpInt(a.leadEuclid2Hits, b.leadEuclid2Hits, t)
        result.leadEuclid2Rotation = lerpInt(a.leadEuclid2Rotation, b.leadEuclid2Rotation, t)
        result.leadEuclid2NoteMin = lerpInt(a.leadEuclid2NoteMin, b.leadEuclid2NoteMin, t)
        result.leadEuclid2NoteMax = lerpInt(a.leadEuclid2NoteMax, b.leadEuclid2NoteMax, t)
        result.leadEuclid2Level = lerp(a.leadEuclid2Level, b.leadEuclid2Level, t)
        // Lane 3
        result.leadEuclid3Steps = lerpInt(a.leadEuclid3Steps, b.leadEuclid3Steps, t)
        result.leadEuclid3Hits = lerpInt(a.leadEuclid3Hits, b.leadEuclid3Hits, t)
        result.leadEuclid3Rotation = lerpInt(a.leadEuclid3Rotation, b.leadEuclid3Rotation, t)
        result.leadEuclid3NoteMin = lerpInt(a.leadEuclid3NoteMin, b.leadEuclid3NoteMin, t)
        result.leadEuclid3NoteMax = lerpInt(a.leadEuclid3NoteMax, b.leadEuclid3NoteMax, t)
        result.leadEuclid3Level = lerp(a.leadEuclid3Level, b.leadEuclid3Level, t)
        // Lane 4
        result.leadEuclid4Steps = lerpInt(a.leadEuclid4Steps, b.leadEuclid4Steps, t)
        result.leadEuclid4Hits = lerpInt(a.leadEuclid4Hits, b.leadEuclid4Hits, t)
        result.leadEuclid4Rotation = lerpInt(a.leadEuclid4Rotation, b.leadEuclid4Rotation, t)
        result.leadEuclid4NoteMin = lerpInt(a.leadEuclid4NoteMin, b.leadEuclid4NoteMin, t)
        result.leadEuclid4NoteMax = lerpInt(a.leadEuclid4NoteMax, b.leadEuclid4NoteMax, t)
        result.leadEuclid4Level = lerp(a.leadEuclid4Level, b.leadEuclid4Level, t)
        
        // Euclidean probability (lerp)
        result.leadEuclid1Probability = lerp(a.leadEuclid1Probability, b.leadEuclid1Probability, t)
        result.leadEuclid2Probability = lerp(a.leadEuclid2Probability, b.leadEuclid2Probability, t)
        result.leadEuclid3Probability = lerp(a.leadEuclid3Probability, b.leadEuclid3Probability, t)
        result.leadEuclid4Probability = lerp(a.leadEuclid4Probability, b.leadEuclid4Probability, t)
        
        // === Ocean ===
        result.oceanSampleLevel = lerp(a.oceanSampleLevel, b.oceanSampleLevel, t)
        result.oceanWaveSynthLevel = lerp(a.oceanWaveSynthLevel, b.oceanWaveSynthLevel, t)
        result.oceanFilterCutoff = lerp(a.oceanFilterCutoff, b.oceanFilterCutoff, t)
        result.oceanFilterResonance = lerp(a.oceanFilterResonance, b.oceanFilterResonance, t)
        result.oceanDurationMin = lerp(a.oceanDurationMin, b.oceanDurationMin, t)
        result.oceanDurationMax = lerp(a.oceanDurationMax, b.oceanDurationMax, t)
        result.oceanIntervalMin = lerp(a.oceanIntervalMin, b.oceanIntervalMin, t)
        result.oceanIntervalMax = lerp(a.oceanIntervalMax, b.oceanIntervalMax, t)
        result.oceanFoamMin = lerp(a.oceanFoamMin, b.oceanFoamMin, t)
        result.oceanFoamMax = lerp(a.oceanFoamMax, b.oceanFoamMax, t)
        result.oceanDepthMin = lerp(a.oceanDepthMin, b.oceanDepthMin, t)
        result.oceanDepthMax = lerp(a.oceanDepthMax, b.oceanDepthMax, t)
        
        // === Random Walk ===
        result.randomWalkSpeed = lerp(a.randomWalkSpeed, b.randomWalkSpeed, t)
        
        // === Snap discrete values at 50% (Issue 7 fix: include all discrete params) ===
        if t >= 0.5 {
            // Global
            result.seedWindow = b.seedWindow
            // Circle of Fifths
            result.cofDriftEnabled = b.cofDriftEnabled
            result.cofDriftDirection = b.cofDriftDirection
            // Harmony
            result.scaleMode = b.scaleMode
            result.manualScale = b.manualScale
            // Synth
            result.filterType = b.filterType
            // Reverb
            result.reverbEngine = b.reverbEngine
            result.reverbType = b.reverbType
            result.reverbQuality = b.reverbQuality
            // Granular
            result.granularEnabled = b.granularEnabled
            result.grainPitchMode = b.grainPitchMode
            // Lead
            result.leadEnabled = b.leadEnabled
            result.leadEuclideanMasterEnabled = b.leadEuclideanMasterEnabled
            result.leadEuclid1Enabled = b.leadEuclid1Enabled
            result.leadEuclid1Preset = b.leadEuclid1Preset
            result.leadEuclid2Enabled = b.leadEuclid2Enabled
            result.leadEuclid2Preset = b.leadEuclid2Preset
            result.leadEuclid3Enabled = b.leadEuclid3Enabled
            result.leadEuclid3Preset = b.leadEuclid3Preset
            result.leadEuclid4Enabled = b.leadEuclid4Enabled
            result.leadEuclid4Preset = b.leadEuclid4Preset
            // Euclidean sources (discrete)
            result.leadEuclid1Source = b.leadEuclid1Source
            result.leadEuclid2Source = b.leadEuclid2Source
            result.leadEuclid3Source = b.leadEuclid3Source
            result.leadEuclid4Source = b.leadEuclid4Source
            // Synth chord sequencer
            result.synthChordSequencerEnabled = b.synthChordSequencerEnabled
            // Ocean
            result.oceanSampleEnabled = b.oceanSampleEnabled
            result.oceanWaveSynthEnabled = b.oceanWaveSynthEnabled
            result.oceanFilterType = b.oceanFilterType
        }
        
        // Handle root note via Circle of Fifths path walking
        // Walk from A to B through the CoF (shortest path)
        result.rootNote = interpolateRootNoteViaCoF(from: a.rootNote, to: b.rootNote, t: t)
        
        return result
    }
    
    /// Lerp helper for Int values
    private func lerpInt(_ a: Int, _ b: Int, _ t: Double) -> Int {
        return Int(round(Double(a) + Double(b - a) * t))
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
    
    // MARK: - Auto-Morph Cycle (matching web app's play/morph cycle)
    
    /// Start automatic morphing cycle between presets
    func startAutoMorph() {
        guard savedPresets.count >= 2 else { return }
        
        autoMorphEnabled = true
        autoMorphCurrentPhase = .playingA
        phrasesInCurrentPhase = 0
        autoMorphPhrasesRemaining = morphPlayPhrases
        morphPhase = "Playing \(morphPresetA?.name ?? "A")"
        
        // Pick initial presets if not set
        if morphPresetA == nil {
            morphPresetA = savedPresets.randomElement()
        }
        if morphPresetB == nil {
            morphPresetB = savedPresets.filter { $0.id != morphPresetA?.id }.randomElement()
        }
        
        // Start timer - tick every phrase (PHRASE_LENGTH seconds)
        autoMorphTimer?.invalidate()
        autoMorphTimer = Timer.scheduledTimer(withTimeInterval: PHRASE_LENGTH, repeats: true) { [weak self] _ in
            self?.tickAutoMorphPhrase()
        }
    }
    
    /// Stop automatic morphing
    func stopAutoMorph() {
        autoMorphEnabled = false
        autoMorphTimer?.invalidate()
        autoMorphTimer = nil
        morphPhase = ""
    }
    
    private func tickAutoMorphPhrase() {
        guard autoMorphEnabled else { return }
        
        phrasesInCurrentPhase += 1
        
        switch autoMorphCurrentPhase {
        case .playingA:
            autoMorphPhrasesRemaining = morphPlayPhrases - phrasesInCurrentPhase
            if phrasesInCurrentPhase >= morphPlayPhrases {
                // Start morphing to B
                autoMorphCurrentPhase = .morphingToB
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphTransitionPhrases
                morphPhase = "Morphing to \(morphPresetB?.name ?? "B")"
            }
            
        case .morphingToB:
            autoMorphPhrasesRemaining = morphTransitionPhrases - phrasesInCurrentPhase
            // Smoothly increase morph position
            let progress = Double(phrasesInCurrentPhase) / Double(morphTransitionPhrases)
            morphPosition = progress * 100.0
            applyMorphedState()
            
            if phrasesInCurrentPhase >= morphTransitionPhrases {
                morphPosition = 100.0
                autoMorphCurrentPhase = .playingB
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphPlayPhrases
                morphPhase = "Playing \(morphPresetB?.name ?? "B")"
            }
            
        case .playingB:
            autoMorphPhrasesRemaining = morphPlayPhrases - phrasesInCurrentPhase
            if phrasesInCurrentPhase >= morphPlayPhrases {
                // Pick new target preset and start morphing back
                morphPresetA = morphPresetB
                morphPresetB = savedPresets.filter { $0.id != morphPresetA?.id }.randomElement()
                autoMorphCurrentPhase = .morphingToA
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphTransitionPhrases
                morphPhase = "Morphing to \(morphPresetB?.name ?? "next")"
            }
            
        case .morphingToA:
            autoMorphPhrasesRemaining = morphTransitionPhrases - phrasesInCurrentPhase
            // Smoothly increase morph position (now going 0 → 100 to new B)
            let progress = Double(phrasesInCurrentPhase) / Double(morphTransitionPhrases)
            morphPosition = progress * 100.0
            applyMorphedState()
            
            if phrasesInCurrentPhase >= morphTransitionPhrases {
                morphPosition = 100.0
                autoMorphCurrentPhase = .playingB
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphPlayPhrases
                morphPhase = "Playing \(morphPresetB?.name ?? "B")"
                // Swap A and B for next cycle
                morphPresetA = morphPresetB
            }
        }
    }
    
    private func applyMorphedState() {
        guard let presetA = morphPresetA, let presetB = morphPresetB else { return }
        let morphedState = lerpPresets(presetA.state, presetB.state, t: morphPosition / 100.0)
        state = morphedState
        audioEngine.updateParams(state)
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