import Foundation

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/// Morph mode for auto-morphing
enum MorphMode: String {
    case linear = "linear"
    case pingpong = "pingpong"
    case random = "random"
}

/// State for a single voice's morph system
struct MorphState {
    var presetA: DrumVoicePreset?
    var presetB: DrumVoicePreset?
    var morph: Double = 0        // 0-1, where 0 = A, 1 = B
    var autoMorph: Bool = false
    var speed: Double = 8        // cycles per minute
    var mode: MorphMode = .linear
    // Internal state for auto-morph
    var direction: Double = 1    // 1 or -1 for pingpong
    var phase: Double = 0        // 0-1 for linear/pingpong cycle position
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERPOLATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/// Linear interpolation between two numbers
func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
    return a + (b - a) * t
}

/// Exponential interpolation for frequency/time values
/// Better for parameters that are perceived logarithmically
func expLerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
    if a <= 0 || b <= 0 { return lerp(a, b, t) }
    return a * pow(b / a, t)
}

/// Smoothstep interpolation for more pleasing transitions
func smoothstep(_ t: Double) -> Double {
    return t * t * (3 - 2 * t)
}

/// Determine if a parameter should use exponential interpolation
private func shouldUseExpLerp(_ paramName: String) -> Bool {
    let expParams = ["Freq", "Decay", "Attack", "Filter", "Rate", "Speed"]
    return expParams.contains { paramName.contains($0) }
}

/// Interpolate between two parameter values
func interpolateParam(
    key: String,
    valueA: Any,
    valueB: Any,
    t: Double
) -> Any {
    // String values (like mode) - use A until t > 0.5, then B
    if let strA = valueA as? String, let _ = valueB as? String {
        return t < 0.5 ? strA : valueB
    }
    
    // Numeric values - interpolate
    guard let numA = valueA as? Double, let numB = valueB as? Double else {
        // Try Int conversion
        if let intA = valueA as? Int, let intB = valueB as? Int {
            let smoothT = smoothstep(t)
            return Int(round(lerp(Double(intA), Double(intB), smoothT)))
        }
        return valueA
    }
    
    let smoothT = smoothstep(t)
    
    if shouldUseExpLerp(key) {
        return expLerp(numA, numB, smoothT)
    }
    
    return lerp(numA, numB, smoothT)
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET INTERPOLATION
// ═══════════════════════════════════════════════════════════════════════════

/// Get all unique parameter keys from two presets
private func getParamKeys(_ presetA: DrumVoicePreset, _ presetB: DrumVoicePreset) -> [String] {
    var keys = Set<String>()
    presetA.params.keys.forEach { keys.insert($0) }
    presetB.params.keys.forEach { keys.insert($0) }
    return Array(keys)
}

/// Interpolate between two presets and return the parameter values
func interpolatePresets(
    _ presetA: DrumVoicePreset,
    _ presetB: DrumVoicePreset,
    morph: Double
) -> [String: Any] {
    var result: [String: Any] = [:]
    let keys = getParamKeys(presetA, presetB)
    
    for key in keys {
        let valueA = presetA.params[key]
        let valueB = presetB.params[key]
        
        // If one preset doesn't have the param, use the other's value
        if valueA == nil {
            result[key] = valueB
        } else if valueB == nil {
            result[key] = valueA
        } else {
            result[key] = interpolateParam(key: key, valueA: valueA!, valueB: valueB!, t: morph)
        }
    }
    
    return result
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-MORPH SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/// Update auto-morph phase based on elapsed time
/// Returns new phase and morph value
func updateAutoMorph(
    phase: Double,
    direction: Double,
    mode: MorphMode,
    speed: Double,
    deltaTime: Double
) -> (phase: Double, direction: Double, morph: Double) {
    // Speed is in cycles per minute
    let cyclesPerSecond = speed / 60.0
    let phaseDelta = cyclesPerSecond * deltaTime
    
    var newPhase = phase
    var newDirection = direction
    var morph: Double = 0
    
    switch mode {
    case .linear:
        // Continuous 0 → 1 → 0 → 1...
        newPhase = (phase + phaseDelta).truncatingRemainder(dividingBy: 1.0)
        morph = newPhase
        
    case .pingpong:
        // 0 → 1 → 0 → 1 with smooth reversals
        newPhase = phase + phaseDelta * direction
        if newPhase >= 1 {
            newPhase = 1 - (newPhase - 1)
            newDirection = -1
        } else if newPhase <= 0 {
            newPhase = -newPhase
            newDirection = 1
        }
        morph = newPhase
        
    case .random:
        // Random jumps at interval
        newPhase = phase + phaseDelta
        if newPhase >= 1 {
            newPhase = 0
            morph = Double.random(in: 0...1)
        } else {
            morph = phase
        }
    }
    
    return (newPhase, newDirection, morph)
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

/// Get the current morph state from SliderState for a voice
func getMorphStateFromSliders(state: SliderState, voice: DrumVoiceType) -> MorphState {
    var morphState = MorphState()
    
    switch voice {
    case .sub:
        morphState.presetA = getPreset(voice: .sub, name: state.drumSubPresetA)
        morphState.presetB = getPreset(voice: .sub, name: state.drumSubPresetB)
        morphState.morph = state.drumSubMorph
        morphState.autoMorph = state.drumSubMorphAuto
        morphState.speed = state.drumSubMorphSpeed
        morphState.mode = MorphMode(rawValue: state.drumSubMorphMode) ?? .linear
        
    case .kick:
        morphState.presetA = getPreset(voice: .kick, name: state.drumKickPresetA)
        morphState.presetB = getPreset(voice: .kick, name: state.drumKickPresetB)
        morphState.morph = state.drumKickMorph
        morphState.autoMorph = state.drumKickMorphAuto
        morphState.speed = state.drumKickMorphSpeed
        morphState.mode = MorphMode(rawValue: state.drumKickMorphMode) ?? .linear
        
    case .click:
        morphState.presetA = getPreset(voice: .click, name: state.drumClickPresetA)
        morphState.presetB = getPreset(voice: .click, name: state.drumClickPresetB)
        morphState.morph = state.drumClickMorph
        morphState.autoMorph = state.drumClickMorphAuto
        morphState.speed = state.drumClickMorphSpeed
        morphState.mode = MorphMode(rawValue: state.drumClickMorphMode) ?? .linear
        
    case .beepHi:
        morphState.presetA = getPreset(voice: .beepHi, name: state.drumBeepHiPresetA)
        morphState.presetB = getPreset(voice: .beepHi, name: state.drumBeepHiPresetB)
        morphState.morph = state.drumBeepHiMorph
        morphState.autoMorph = state.drumBeepHiMorphAuto
        morphState.speed = state.drumBeepHiMorphSpeed
        morphState.mode = MorphMode(rawValue: state.drumBeepHiMorphMode) ?? .linear
        
    case .beepLo:
        morphState.presetA = getPreset(voice: .beepLo, name: state.drumBeepLoPresetA)
        morphState.presetB = getPreset(voice: .beepLo, name: state.drumBeepLoPresetB)
        morphState.morph = state.drumBeepLoMorph
        morphState.autoMorph = state.drumBeepLoMorphAuto
        morphState.speed = state.drumBeepLoMorphSpeed
        morphState.mode = MorphMode(rawValue: state.drumBeepLoMorphMode) ?? .linear
        
    case .noise:
        morphState.presetA = getPreset(voice: .noise, name: state.drumNoisePresetA)
        morphState.presetB = getPreset(voice: .noise, name: state.drumNoisePresetB)
        morphState.morph = state.drumNoiseMorph
        morphState.autoMorph = state.drumNoiseMorphAuto
        morphState.speed = state.drumNoiseMorphSpeed
        morphState.mode = MorphMode(rawValue: state.drumNoiseMorphMode) ?? .linear
    }
    
    return morphState
}

/// Get morphed parameters for a voice, ready to apply to synthesis
/// Returns interpolated values between preset A and B based on morph position
/// - Parameter morphOverride: Optional morph value to use instead of state value (for per-trigger randomization)
func getMorphedParams(
    state: SliderState,
    voice: DrumVoiceType,
    morphOverride: Double? = nil
) -> [String: Any] {
    let morphState = getMorphStateFromSliders(state: state, voice: voice)
    
    // If no presets loaded, return empty
    guard let presetA = morphState.presetA, let presetB = morphState.presetB else {
        return [:]
    }
    
    // Use override morph value if provided, otherwise use state value
    let morphValue = morphOverride ?? morphState.morph
    
    return interpolatePresets(presetA, presetB, morph: morphValue)
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/// All preset arrays by voice type
private let DRUM_VOICE_PRESETS: [DrumVoiceType: [DrumVoicePreset]] = [
    .sub: SUB_PRESETS,
    .kick: KICK_PRESETS,
    .click: CLICK_PRESETS,
    .beepHi: BEEP_HI_PRESETS,
    .beepLo: BEEP_LO_PRESETS,
    .noise: NOISE_PRESETS
]

/// Get a preset by name and voice type
func getPreset(voice: DrumVoiceType, name: String) -> DrumVoicePreset? {
    return DRUM_VOICE_PRESETS[voice]?.first { $0.name == name }
}

/// Get all preset names for a voice type
func getPresetNames(voice: DrumVoiceType) -> [String] {
    return DRUM_VOICE_PRESETS[voice]?.map { $0.name } ?? []
}

/// Get presets by tag
func getPresetsByTag(voice: DrumVoiceType, tag: String) -> [DrumVoicePreset] {
    return DRUM_VOICE_PRESETS[voice]?.filter { $0.tags.contains(tag) } ?? []
}

// ═══════════════════════════════════════════════════════════════════════════
// DRUM MORPH MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/// Internal state for each voice
private struct VoiceMorphState {
    var phase: Double = 0
    var direction: Double = 1
    var lastMorph: Double = 0
}

/// Manages auto-morph state for all voices
/// Call update() on each animation frame to progress auto-morphs
class DrumMorphManager {
    private var voiceStates: [DrumVoiceType: VoiceMorphState] = [:]
    private var lastUpdateTime: TimeInterval = 0
    
    init() {
        let voices: [DrumVoiceType] = [.sub, .kick, .click, .beepHi, .beepLo, .noise]
        for voice in voices {
            voiceStates[voice] = VoiceMorphState()
        }
    }
    
    /// Update auto-morph for all voices
    /// Returns new morph values for voices with auto-morph enabled
    func update(state: SliderState, currentTime: TimeInterval) -> [DrumVoiceType: Double] {
        let deltaTime = lastUpdateTime == 0 ? 0 : currentTime - lastUpdateTime
        lastUpdateTime = currentTime
        
        var newMorphValues: [DrumVoiceType: Double] = [:]
        
        let voices: [DrumVoiceType] = [.sub, .kick, .click, .beepHi, .beepLo, .noise]
        
        for voice in voices {
            let morphState = getMorphStateFromSliders(state: state, voice: voice)
            
            guard morphState.autoMorph else { continue }
            guard var voiceState = voiceStates[voice] else { continue }
            
            let result = updateAutoMorph(
                phase: voiceState.phase,
                direction: voiceState.direction,
                mode: morphState.mode,
                speed: morphState.speed,
                deltaTime: deltaTime
            )
            
            voiceState.phase = result.phase
            voiceState.direction = result.direction
            
            // For random mode, only update on phase reset
            if morphState.mode == .random {
                if result.phase < voiceState.phase {
                    voiceState.lastMorph = result.morph
                }
                newMorphValues[voice] = voiceState.lastMorph
            } else {
                newMorphValues[voice] = result.morph
            }
            
            voiceStates[voice] = voiceState
        }
        
        return newMorphValues
    }
    
    /// Reset phase for a specific voice
    func resetVoice(_ voice: DrumVoiceType) {
        voiceStates[voice] = VoiceMorphState()
    }
    
    /// Reset all voices
    func reset() {
        let voices: [DrumVoiceType] = [.sub, .kick, .click, .beepHi, .beepLo, .noise]
        for voice in voices {
            resetVoice(voice)
        }
        lastUpdateTime = 0
    }
}
