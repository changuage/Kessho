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
    
    // Recording state
    @Published var recordingState: RecordingState = .idle
    @Published var recordingDuration: TimeInterval = 0
    @Published var recordMain: Bool = true
    @Published var recordingEnabledStems: Set<RecordingStem> = []
    @Published var showRecordingSettings: Bool = false
    @Published var lastRecordedFiles: [URL] = []
    
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
    
    // Track last state for detecting changes at morph endpoints
    private var lastStateSnapshot: SliderState?
    
    // Track manual overrides during mid-morph (key -> (value, morphPosition))
    private var morphManualOverrides: [String: (value: Double, morphPosition: Double)] = [:]
    private var morphDirection: String = "toB"  // "toA" or "toB"
    private var lastMorphEndpoint: Double = 0  // 0 or 100
    
    // MARK: - Audio Engine
    let audioEngine = AudioEngine()
    
    // MARK: - Audio Recorder
    let audioRecorder = AudioRecorder()
    
    // MARK: - Preset Manager
    let presetManager = PresetManager()
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupBindings()
        setupRecorder()
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
        
        // Check if this is a drum parameter
        if getDrumVoice(for: key) != nil {
            handleDrumDualSliderChange(
                key: key,
                isDualMode: true,
                value: currentValue,
                range: (min: min, max: max)
            )
        } else {
            // Update morph preset dualRanges at endpoints (Rule 2)
            updateMorphPresetDualRange(key: key, range: DualRange(min: min, max: max))
        }
    }
    
    /// Disable dual mode for a parameter
    func disableDualMode(for key: String) {
        dualRanges.removeValue(forKey: key)
        randomWalkValues.removeValue(forKey: key)
        walkPhases.removeValue(forKey: key)
        
        // Check if this is a drum parameter
        if getDrumVoice(for: key) != nil {
            handleDrumDualSliderChange(
                key: key,
                isDualMode: false,
                value: 0,
                range: nil
            )
        } else {
            // Update morph preset dualRanges at endpoints (Rule 2)
            removeMorphPresetDualRange(key: key)
        }
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
        
        // Check if this is a drum parameter
        if getDrumVoice(for: key) != nil {
            handleDrumDualSliderChange(
                key: key,
                isDualMode: true,
                value: (min + max) / 2,
                range: (min: min, max: max)
            )
        } else {
            // Update morph preset dualRanges at endpoints (Rule 2)
            updateMorphPresetDualRange(key: key, range: DualRange(min: min, max: max))
        }
    }
    
    /// Update morph preset's dualRanges at endpoints
    private func updateMorphPresetDualRange(key: String, range: DualRange) {
        let isMorphActive = morphPresetA != nil || morphPresetB != nil
        guard isMorphActive else { return }
        
        if morphPosition == 0, let presetA = morphPresetA {
            var dualRanges = presetA.dualRanges ?? [:]
            dualRanges[key] = range
            morphPresetA = SavedPreset(
                name: presetA.name,
                timestamp: presetA.timestamp,
                state: presetA.state,
                dualRanges: dualRanges
            )
        } else if morphPosition == 100, let presetB = morphPresetB {
            var dualRanges = presetB.dualRanges ?? [:]
            dualRanges[key] = range
            morphPresetB = SavedPreset(
                name: presetB.name,
                timestamp: presetB.timestamp,
                state: presetB.state,
                dualRanges: dualRanges
            )
        }
    }
    
    /// Remove key from morph preset's dualRanges at endpoints
    private func removeMorphPresetDualRange(key: String) {
        let isMorphActive = morphPresetA != nil || morphPresetB != nil
        guard isMorphActive else { return }
        
        if morphPosition == 0, let presetA = morphPresetA {
            var dualRanges = presetA.dualRanges ?? [:]
            dualRanges.removeValue(forKey: key)
            morphPresetA = SavedPreset(
                name: presetA.name,
                timestamp: presetA.timestamp,
                state: presetA.state,
                dualRanges: dualRanges.isEmpty ? nil : dualRanges
            )
        } else if morphPosition == 100, let presetB = morphPresetB {
            var dualRanges = presetB.dualRanges ?? [:]
            dualRanges.removeValue(forKey: key)
            morphPresetB = SavedPreset(
                name: presetB.name,
                timestamp: presetB.timestamp,
                state: presetB.state,
                dualRanges: dualRanges.isEmpty ? nil : dualRanges
            )
        }
    }
    
    // MARK: - Slider Change Handling for Morph
    
    /// Call this when a slider value changes to handle morph preset updates
    /// Rule 1: Mid-morph changes are temporary overrides
    /// Rule 2: Endpoint changes (0% or 100%) update the respective preset permanently
    func handleSliderChange(key: String, value: Double) {
        // Check if this is a drum parameter and handle with drum morph system
        if getDrumVoice(for: key) != nil {
            handleDrumSliderChange(key: key, value: value)
            return
        }
        
        let isMorphActive = morphPresetA != nil || morphPresetB != nil
        guard isMorphActive else { return }
        
        if morphPosition == 0, let presetA = morphPresetA {
            // At endpoint A: update preset A permanently
            var newState = presetA.state
            updateSliderStateValue(&newState, key: key, value: value)
            morphPresetA = SavedPreset(
                name: presetA.name,
                timestamp: presetA.timestamp,
                state: newState,
                dualRanges: presetA.dualRanges
            )
        } else if morphPosition == 100, let presetB = morphPresetB {
            // At endpoint B: update preset B permanently
            var newState = presetB.state
            updateSliderStateValue(&newState, key: key, value: value)
            morphPresetB = SavedPreset(
                name: presetB.name,
                timestamp: presetB.timestamp,
                state: newState,
                dualRanges: presetB.dualRanges
            )
        } else {
            // Mid-morph: store as temporary override
            morphManualOverrides[key] = (value: value, morphPosition: morphPosition)
        }
    }
    
    // MARK: - Drum Morph Override Handling
    
    /// Map of drum param prefix to voice type
    private static let drumParamPrefixes: [String: DrumVoiceType] = [
        "drumSub": .sub, "drumKick": .kick, "drumClick": .click,
        "drumBeepHi": .beepHi, "drumBeepLo": .beepLo, "drumNoise": .noise
    ]
    
    /// Map of drum preset keys to voice type
    private static let drumPresetVoiceMap: [String: DrumVoiceType] = [
        "drumSubPresetA": .sub, "drumSubPresetB": .sub,
        "drumKickPresetA": .kick, "drumKickPresetB": .kick,
        "drumClickPresetA": .click, "drumClickPresetB": .click,
        "drumBeepHiPresetA": .beepHi, "drumBeepHiPresetB": .beepHi,
        "drumBeepLoPresetA": .beepLo, "drumBeepLoPresetB": .beepLo,
        "drumNoisePresetA": .noise, "drumNoisePresetB": .noise
    ]
    
    /// Get the voice type for a drum parameter key
    private func getDrumVoice(for key: String) -> DrumVoiceType? {
        for (prefix, voice) in Self.drumParamPrefixes {
            if key.hasPrefix(prefix) && !key.contains("Morph") && !key.contains("Preset") {
                return voice
            }
        }
        return nil
    }
    
    /// Get the morph position for a drum voice
    private func getDrumMorphPosition(for voice: DrumVoiceType) -> Double {
        switch voice {
        case .sub: return state.drumSubMorph
        case .kick: return state.drumKickMorph
        case .click: return state.drumClickMorph
        case .beepHi: return state.drumBeepHiMorph
        case .beepLo: return state.drumBeepLoMorph
        case .noise: return state.drumNoiseMorph
        }
    }
    
    /// Handle drum synth slider changes for morph override tracking
    func handleDrumSliderChange(key: String, value: Double) {
        guard let voice = getDrumVoice(for: key) else { return }
        
        let morphPosition = getDrumMorphPosition(for: voice)
        setDrumMorphOverride(voice: voice, param: key, value: value, morphPosition: morphPosition)
    }
    
    /// Handle drum preset changes - clear appropriate endpoint overrides
    func handleDrumPresetChange(key: String) {
        guard let voice = Self.drumPresetVoiceMap[key] else { return }
        
        let isPresetA = key.contains("PresetA")
        let morphPosition = getDrumMorphPosition(for: voice)
        
        // Only reset dual modes if the preset change affects current position
        let atEndpoint0 = morphPosition < 0.01
        let atEndpoint1 = morphPosition > 0.99
        
        if isPresetA {
            // Clear endpoint 0 overrides
            clearDrumMorphEndpointOverrides(voice: voice, endpoint: 0)
            
            // Only reset dual modes if not at endpoint 1
            if !atEndpoint1 {
                clearDrumDualModesForVoice(voice)
            }
        } else {
            // Clear endpoint 1 overrides
            clearDrumMorphEndpointOverrides(voice: voice, endpoint: 1)
            
            // Only reset dual modes if not at endpoint 0
            if !atEndpoint0 {
                clearDrumDualModesForVoice(voice)
            }
        }
    }
    
    /// Handle drum morph position changes - clear mid-morph overrides at endpoints
    func handleDrumMorphChange(voice: DrumVoiceType, morphValue: Double) {
        let atEndpoint = morphValue < 0.01 || morphValue > 0.99
        if atEndpoint {
            clearMidMorphOverrides(voice: voice)
        }
    }
    
    /// Clear dual modes for a drum voice's parameters
    private func clearDrumDualModesForVoice(_ voice: DrumVoiceType) {
        let prefix: String
        switch voice {
        case .sub: prefix = "drumSub"
        case .kick: prefix = "drumKick"
        case .click: prefix = "drumClick"
        case .beepHi: prefix = "drumBeepHi"
        case .beepLo: prefix = "drumBeepLo"
        case .noise: prefix = "drumNoise"
        }
        
        // Remove dual ranges for this voice
        dualRanges = dualRanges.filter { key, _ in
            !(key.hasPrefix(prefix) && !key.contains("Morph") && !key.contains("Preset"))
        }
    }
    
    /// Handle dual slider changes for drum morph
    func handleDrumDualSliderChange(
        key: String,
        isDualMode: Bool,
        value: Double,
        range: (min: Double, max: Double)?
    ) {
        guard let voice = getDrumVoice(for: key) else { return }
        
        let morphPosition = getDrumMorphPosition(for: voice)
        setDrumMorphDualRangeOverride(
            voice: voice,
            param: key,
            isDualMode: isDualMode,
            value: value,
            range: range,
            morphPosition: morphPosition
        )
    }
    
    /// Helper to update a SliderState property by key
    private func updateSliderStateValue(_ state: inout SliderState, key: String, value: Double) {
        switch key {
        case "masterVolume": state.masterVolume = value
        case "synthLevel": state.synthLevel = value
        case "granularLevel": state.granularLevel = value
        case "synthReverbSend": state.synthReverbSend = value
        case "granularReverbSend": state.granularReverbSend = value
        case "leadReverbSend": state.leadReverbSend = value
        case "leadDelayReverbSend": state.leadDelayReverbSend = value
        case "reverbLevel": state.reverbLevel = value
        case "randomness": state.randomness = value
        case "tension": state.tension = value
        case "chordRate": state.chordRate = value
        case "voicingSpread": state.voicingSpread = value
        case "waveSpread": state.waveSpread = value
        case "detune": state.detune = value
        case "synthOctave": state.synthOctave = Int(value)
        case "synthAttack": state.synthAttack = value
        case "synthDecay": state.synthDecay = value
        case "synthSustain": state.synthSustain = value
        case "synthRelease": state.synthRelease = value
        case "hardness": state.hardness = value
        case "brightness": state.brightness = value
        case "filterCutoffMin": state.filterCutoffMin = value
        case "filterCutoffMax": state.filterCutoffMax = value
        case "filterModSpeed": state.filterModSpeed = value
        case "filterResonance": state.filterResonance = value
        case "filterQ": state.filterQ = value
        case "warmth": state.warmth = value
        case "presence": state.presence = value
        case "air": state.air = value
        case "reverbDecay": state.reverbDecay = value
        case "reverbSize": state.reverbSize = value
        case "reverbDiffusion": state.reverbDiffusion = value
        case "reverbModulation": state.reverbModulation = value
        case "reverbPredelay": state.reverbPredelay = value
        case "reverbDamping": state.reverbDamping = value
        case "reverbWidth": state.reverbWidth = value
        case "granularProbability": state.granularProbability = value
        case "granularSizeMin": state.granularSizeMin = value
        case "granularSizeMax": state.granularSizeMax = value
        case "granularDensity": state.granularDensity = value
        case "granularSpray": state.granularSpray = value
        case "granularJitter": state.granularJitter = value
        case "granularPitchSpread": state.granularPitchSpread = value
        case "granularStereoSpread": state.granularStereoSpread = value
        case "granularFeedback": state.granularFeedback = value
        case "granularWetHPF": state.granularWetHPF = value
        case "granularWetLPF": state.granularWetLPF = value
        case "leadLevel": state.leadLevel = value
        case "leadAttack": state.leadAttack = value
        case "leadDecay": state.leadDecay = value
        case "leadSustain": state.leadSustain = value
        case "leadRelease": state.leadRelease = value
        case "leadDensity": state.leadDensity = value
        case "leadOctave": state.leadOctave = Int(value)
        case "leadOctaveRange": state.leadOctaveRange = Int(value)
        case "leadTimbreMin": state.leadTimbreMin = value
        case "leadTimbreMax": state.leadTimbreMax = value
        case "leadDelayTime": state.leadDelayTime = value
        case "leadDelayFeedback": state.leadDelayFeedback = value
        case "leadDelayMix": state.leadDelayMix = value
        case "oceanSampleLevel": state.oceanSampleLevel = value
        case "oceanSynthLevel": state.oceanSynthLevel = value
        case "oceanFilterCutoff": state.oceanFilterCutoff = value
        case "oceanFilterResonance": state.oceanFilterResonance = value
        case "oceanDurationMin": state.oceanDurationMin = value
        case "oceanDurationMax": state.oceanDurationMax = value
        case "oceanIntervalMin": state.oceanIntervalMin = value
        case "oceanIntervalMax": state.oceanIntervalMax = value
        case "oceanFoamMin": state.oceanFoamMin = value
        case "oceanFoamMax": state.oceanFoamMax = value
        case "oceanDepthMin": state.oceanDepthMin = value
        case "oceanDepthMax": state.oceanDepthMax = value
        case "drumLevel": state.drumLevel = value
        case "drumSubMorph": state.drumSubMorph = value
        case "drumKickMorph": state.drumKickMorph = value
        case "drumClickMorph": state.drumClickMorph = value
        case "drumBeepHiMorph": state.drumBeepHiMorph = value
        case "drumBeepLoMorph": state.drumBeepLoMorph = value
        case "drumNoiseMorph": state.drumNoiseMorph = value
        case "randomWalkSpeed": state.randomWalkSpeed = value
        default: break
        }
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
    
    // MARK: - Recording Control
    
    /// Set up the audio recorder with engine nodes
    private func setupRecorder() {
        audioEngine.configureRecorder(audioRecorder)
        
        audioRecorder.onStateChange = { [weak self] state in
            Task { @MainActor in
                self?.recordingState = state
            }
        }
        
        audioRecorder.onDurationUpdate = { [weak self] duration in
            Task { @MainActor in
                self?.recordingDuration = duration
            }
        }
    }
    
    /// Arm recording - prepares to record on next play
    func armRecording() {
        audioRecorder.enabledStems = recordingEnabledStems
        audioRecorder.recordMain = recordMain
        audioRecorder.arm()
    }
    
    /// Disarm recording
    func disarmRecording() {
        audioRecorder.disarm()
    }
    
    /// Start recording immediately
    func startRecording() {
        audioRecorder.enabledStems = recordingEnabledStems
        audioRecorder.recordMain = recordMain
        _ = audioRecorder.startRecording()
    }
    
    /// Stop recording and save files
    func stopRecording() {
        lastRecordedFiles = audioRecorder.stopRecording()
    }
    
    /// Toggle recording state
    func toggleRecording() {
        switch recordingState {
        case .idle:
            startRecording()
        case .armed:
            startRecording()
        case .recording:
            stopRecording()
        }
    }
    
    /// Toggle stem enabled for recording
    func toggleStemRecording(_ stem: RecordingStem) {
        if recordingEnabledStems.contains(stem) {
            recordingEnabledStems.remove(stem)
        } else {
            recordingEnabledStems.insert(stem)
        }
    }
    
    /// Get formatted recording duration string
    var formattedRecordingDuration: String {
        AudioRecorder.formatDuration(recordingDuration)
    }
    
    /// Get list of saved recordings
    var savedRecordings: [URL] {
        audioRecorder.getSavedRecordings()
    }
    
    // MARK: - Preset Management
    
    func loadPreset(_ preset: SavedPreset) {
        // Check if we should apply preset A values directly:
        // - Only apply if we're at endpoint 0 (near position 0)
        // - OR if no preset B is loaded yet (not in morph mode)
        // At endpoint 1 (position ~100), we should keep the current B values
        let atEndpoint0 = morphPosition <= 1
        let shouldApplyPresetA = atEndpoint0 || morphPresetB == nil
        
        // Always update the morph slot
        morphPresetA = preset
        
        if shouldApplyPresetA {
            state = preset.state
            audioEngine.resetCofDrift()
            morphPosition = 0
            
            // Load dual ranges from preset (if any)
            dualRanges = preset.dualRanges ?? [:]
            randomWalkValues.removeAll()
            
            // Initialize walk values for loaded dual ranges
            for (key, range) in dualRanges {
                randomWalkValues[key] = (range.min + range.max) / 2
            }
        }
        // If at endpoint B or mid-morph, just update morphPresetA
        // The setMorphPosition will recalculate if user moves the slider
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
        
        // === Drum System ===
        result.drumLevel = lerp(a.drumLevel, b.drumLevel, t)
        result.drumReverbSend = lerp(a.drumReverbSend, b.drumReverbSend, t)
        result.drumDelayFeedback = lerp(a.drumDelayFeedback, b.drumDelayFeedback, t)
        result.drumDelayMix = lerp(a.drumDelayMix, b.drumDelayMix, t)
        result.drumDelayFilter = lerp(a.drumDelayFilter, b.drumDelayFilter, t)
        // Delay sends
        result.drumSubDelaySend = lerp(a.drumSubDelaySend, b.drumSubDelaySend, t)
        result.drumKickDelaySend = lerp(a.drumKickDelaySend, b.drumKickDelaySend, t)
        result.drumClickDelaySend = lerp(a.drumClickDelaySend, b.drumClickDelaySend, t)
        result.drumBeepHiDelaySend = lerp(a.drumBeepHiDelaySend, b.drumBeepHiDelaySend, t)
        result.drumBeepLoDelaySend = lerp(a.drumBeepLoDelaySend, b.drumBeepLoDelaySend, t)
        result.drumNoiseDelaySend = lerp(a.drumNoiseDelaySend, b.drumNoiseDelaySend, t)
        
        // Drum voice morph positions (interpolate during master morph)
        result.drumSubMorph = lerp(a.drumSubMorph, b.drumSubMorph, t)
        result.drumKickMorph = lerp(a.drumKickMorph, b.drumKickMorph, t)
        result.drumClickMorph = lerp(a.drumClickMorph, b.drumClickMorph, t)
        result.drumBeepHiMorph = lerp(a.drumBeepHiMorph, b.drumBeepHiMorph, t)
        result.drumBeepLoMorph = lerp(a.drumBeepLoMorph, b.drumBeepLoMorph, t)
        result.drumNoiseMorph = lerp(a.drumNoiseMorph, b.drumNoiseMorph, t)
        result.drumSubMorphSpeed = lerp(a.drumSubMorphSpeed, b.drumSubMorphSpeed, t)
        result.drumKickMorphSpeed = lerp(a.drumKickMorphSpeed, b.drumKickMorphSpeed, t)
        result.drumClickMorphSpeed = lerp(a.drumClickMorphSpeed, b.drumClickMorphSpeed, t)
        result.drumBeepHiMorphSpeed = lerp(a.drumBeepHiMorphSpeed, b.drumBeepHiMorphSpeed, t)
        result.drumBeepLoMorphSpeed = lerp(a.drumBeepLoMorphSpeed, b.drumBeepLoMorphSpeed, t)
        result.drumNoiseMorphSpeed = lerp(a.drumNoiseMorphSpeed, b.drumNoiseMorphSpeed, t)
        
        // Drum voice params (Sub)
        result.drumSubFreq = lerp(a.drumSubFreq, b.drumSubFreq, t)
        result.drumSubDecay = lerp(a.drumSubDecay, b.drumSubDecay, t)
        result.drumSubLevel = lerp(a.drumSubLevel, b.drumSubLevel, t)
        result.drumSubTone = lerp(a.drumSubTone, b.drumSubTone, t)
        result.drumSubShape = lerp(a.drumSubShape, b.drumSubShape, t)
        result.drumSubPitchEnv = lerp(a.drumSubPitchEnv, b.drumSubPitchEnv, t)
        result.drumSubPitchDecay = lerp(a.drumSubPitchDecay, b.drumSubPitchDecay, t)
        result.drumSubDrive = lerp(a.drumSubDrive, b.drumSubDrive, t)
        result.drumSubSub = lerp(a.drumSubSub, b.drumSubSub, t)
        
        // Drum voice params (Kick)
        result.drumKickFreq = lerp(a.drumKickFreq, b.drumKickFreq, t)
        result.drumKickPitchEnv = lerp(a.drumKickPitchEnv, b.drumKickPitchEnv, t)
        result.drumKickPitchDecay = lerp(a.drumKickPitchDecay, b.drumKickPitchDecay, t)
        result.drumKickDecay = lerp(a.drumKickDecay, b.drumKickDecay, t)
        result.drumKickLevel = lerp(a.drumKickLevel, b.drumKickLevel, t)
        result.drumKickClick = lerp(a.drumKickClick, b.drumKickClick, t)
        result.drumKickBody = lerp(a.drumKickBody, b.drumKickBody, t)
        result.drumKickPunch = lerp(a.drumKickPunch, b.drumKickPunch, t)
        result.drumKickTail = lerp(a.drumKickTail, b.drumKickTail, t)
        result.drumKickTone = lerp(a.drumKickTone, b.drumKickTone, t)
        
        // Drum voice params (Click)
        result.drumClickDecay = lerp(a.drumClickDecay, b.drumClickDecay, t)
        result.drumClickFilter = lerp(a.drumClickFilter, b.drumClickFilter, t)
        result.drumClickTone = lerp(a.drumClickTone, b.drumClickTone, t)
        result.drumClickLevel = lerp(a.drumClickLevel, b.drumClickLevel, t)
        result.drumClickResonance = lerp(a.drumClickResonance, b.drumClickResonance, t)
        result.drumClickPitch = lerp(a.drumClickPitch, b.drumClickPitch, t)
        result.drumClickPitchEnv = lerp(a.drumClickPitchEnv, b.drumClickPitchEnv, t)
        result.drumClickGrainCount = lerpInt(a.drumClickGrainCount, b.drumClickGrainCount, t)
        result.drumClickGrainSpread = lerp(a.drumClickGrainSpread, b.drumClickGrainSpread, t)
        result.drumClickStereoWidth = lerp(a.drumClickStereoWidth, b.drumClickStereoWidth, t)
        
        // Drum voice params (BeepHi)
        result.drumBeepHiFreq = lerp(a.drumBeepHiFreq, b.drumBeepHiFreq, t)
        result.drumBeepHiAttack = lerp(a.drumBeepHiAttack, b.drumBeepHiAttack, t)
        result.drumBeepHiDecay = lerp(a.drumBeepHiDecay, b.drumBeepHiDecay, t)
        result.drumBeepHiLevel = lerp(a.drumBeepHiLevel, b.drumBeepHiLevel, t)
        result.drumBeepHiTone = lerp(a.drumBeepHiTone, b.drumBeepHiTone, t)
        result.drumBeepHiInharmonic = lerp(a.drumBeepHiInharmonic, b.drumBeepHiInharmonic, t)
        result.drumBeepHiPartials = lerpInt(a.drumBeepHiPartials, b.drumBeepHiPartials, t)
        result.drumBeepHiShimmer = lerp(a.drumBeepHiShimmer, b.drumBeepHiShimmer, t)
        result.drumBeepHiShimmerRate = lerp(a.drumBeepHiShimmerRate, b.drumBeepHiShimmerRate, t)
        result.drumBeepHiBrightness = lerp(a.drumBeepHiBrightness, b.drumBeepHiBrightness, t)
        
        // Drum voice params (BeepLo)
        result.drumBeepLoFreq = lerp(a.drumBeepLoFreq, b.drumBeepLoFreq, t)
        result.drumBeepLoAttack = lerp(a.drumBeepLoAttack, b.drumBeepLoAttack, t)
        result.drumBeepLoDecay = lerp(a.drumBeepLoDecay, b.drumBeepLoDecay, t)
        result.drumBeepLoLevel = lerp(a.drumBeepLoLevel, b.drumBeepLoLevel, t)
        result.drumBeepLoTone = lerp(a.drumBeepLoTone, b.drumBeepLoTone, t)
        result.drumBeepLoPitchEnv = lerp(a.drumBeepLoPitchEnv, b.drumBeepLoPitchEnv, t)
        result.drumBeepLoPitchDecay = lerp(a.drumBeepLoPitchDecay, b.drumBeepLoPitchDecay, t)
        result.drumBeepLoBody = lerp(a.drumBeepLoBody, b.drumBeepLoBody, t)
        result.drumBeepLoPluck = lerp(a.drumBeepLoPluck, b.drumBeepLoPluck, t)
        result.drumBeepLoPluckDamp = lerp(a.drumBeepLoPluckDamp, b.drumBeepLoPluckDamp, t)
        
        // Drum voice params (Noise)
        result.drumNoiseFilterFreq = lerp(a.drumNoiseFilterFreq, b.drumNoiseFilterFreq, t)
        result.drumNoiseFilterQ = lerp(a.drumNoiseFilterQ, b.drumNoiseFilterQ, t)
        result.drumNoiseDecay = lerp(a.drumNoiseDecay, b.drumNoiseDecay, t)
        result.drumNoiseLevel = lerp(a.drumNoiseLevel, b.drumNoiseLevel, t)
        result.drumNoiseAttack = lerp(a.drumNoiseAttack, b.drumNoiseAttack, t)
        result.drumNoiseFormant = lerp(a.drumNoiseFormant, b.drumNoiseFormant, t)
        result.drumNoiseBreath = lerp(a.drumNoiseBreath, b.drumNoiseBreath, t)
        result.drumNoiseFilterEnv = lerp(a.drumNoiseFilterEnv, b.drumNoiseFilterEnv, t)
        result.drumNoiseFilterEnvDecay = lerp(a.drumNoiseFilterEnvDecay, b.drumNoiseFilterEnvDecay, t)
        result.drumNoiseDensity = lerp(a.drumNoiseDensity, b.drumNoiseDensity, t)
        result.drumNoiseColorLFO = lerp(a.drumNoiseColorLFO, b.drumNoiseColorLFO, t)
        
        // Random trigger probabilities
        result.drumRandomDensity = lerp(a.drumRandomDensity, b.drumRandomDensity, t)
        result.drumRandomSubProb = lerp(a.drumRandomSubProb, b.drumRandomSubProb, t)
        result.drumRandomKickProb = lerp(a.drumRandomKickProb, b.drumRandomKickProb, t)
        result.drumRandomClickProb = lerp(a.drumRandomClickProb, b.drumRandomClickProb, t)
        result.drumRandomBeepHiProb = lerp(a.drumRandomBeepHiProb, b.drumRandomBeepHiProb, t)
        result.drumRandomBeepLoProb = lerp(a.drumRandomBeepLoProb, b.drumRandomBeepLoProb, t)
        result.drumRandomNoiseProb = lerp(a.drumRandomNoiseProb, b.drumRandomNoiseProb, t)
        
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
            result.reverbEnabled = b.reverbEnabled
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
            // Drum (booleans)
            result.drumEnabled = b.drumEnabled
            result.drumDelayEnabled = b.drumDelayEnabled
            result.drumRandomEnabled = b.drumRandomEnabled
            result.drumRandomMorphUpdate = b.drumRandomMorphUpdate
            result.drumSubMorphAuto = b.drumSubMorphAuto
            result.drumKickMorphAuto = b.drumKickMorphAuto
            result.drumClickMorphAuto = b.drumClickMorphAuto
            result.drumBeepHiMorphAuto = b.drumBeepHiMorphAuto
            result.drumBeepLoMorphAuto = b.drumBeepLoMorphAuto
            result.drumNoiseMorphAuto = b.drumNoiseMorphAuto
            // Drum (preset names)
            result.drumSubPresetA = b.drumSubPresetA
            result.drumSubPresetB = b.drumSubPresetB
            result.drumKickPresetA = b.drumKickPresetA
            result.drumKickPresetB = b.drumKickPresetB
            result.drumClickPresetA = b.drumClickPresetA
            result.drumClickPresetB = b.drumClickPresetB
            result.drumBeepHiPresetA = b.drumBeepHiPresetA
            result.drumBeepHiPresetB = b.drumBeepHiPresetB
            result.drumBeepLoPresetA = b.drumBeepLoPresetA
            result.drumBeepLoPresetB = b.drumBeepLoPresetB
            result.drumNoisePresetA = b.drumNoisePresetA
            result.drumNoisePresetB = b.drumNoisePresetB
            // Drum (other discrete)
            result.drumDelayNoteL = b.drumDelayNoteL
            result.drumDelayNoteR = b.drumDelayNoteR
            result.drumSubMorphMode = b.drumSubMorphMode
            result.drumKickMorphMode = b.drumKickMorphMode
            result.drumClickMorphMode = b.drumClickMorphMode
            result.drumBeepHiMorphMode = b.drumBeepHiMorphMode
            result.drumBeepLoMorphMode = b.drumBeepLoMorphMode
            result.drumNoiseMorphMode = b.drumNoiseMorphMode
            result.drumClickMode = b.drumClickMode
            result.drumNoiseFilterType = b.drumNoiseFilterType
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