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
// DRUM MORPH OVERRIDES
// ═══════════════════════════════════════════════════════════════════════════

/// Override for a single parameter value at a morph position
struct DrumMorphOverride {
    let value: Double
    let morphPosition: Double
    let isEndpoint: Bool  // True if set at position 0 or 1
}

/// State at a single endpoint for a dual-capable parameter
struct DrumMorphEndpointState {
    var isDualMode: Bool
    var value: Double
    var range: (min: Double, max: Double)?
}

/// Dual range override that stores state at BOTH endpoints for interpolation
struct DrumMorphDualRangeOverride {
    var endpoint0: DrumMorphEndpointState?
    var endpoint1: DrumMorphEndpointState?
}

/// Result of dual range interpolation
struct DrumInterpolatedDualRange {
    var isDualMode: Bool
    var range: (min: Double, max: Double)?
}

/// Storage for drum morph overrides - voice -> param -> override
private var drumMorphOverrides: [DrumVoiceType: [String: DrumMorphOverride]] = [
    .sub: [:], .kick: [:], .click: [:],
    .beepHi: [:], .beepLo: [:], .noise: [:]
]

/// Storage for drum morph dual range overrides - voice -> param -> dual range override
private var drumMorphDualRangeOverrides: [DrumVoiceType: [String: DrumMorphDualRangeOverride]] = [
    .sub: [:], .kick: [:], .click: [:],
    .beepHi: [:], .beepLo: [:], .noise: [:]
]

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/// Check if morph position is at endpoint 0 (with tolerance)
func isAtDrumEndpoint0(_ position: Double) -> Bool {
    return position < 0.01
}

/// Check if morph position is at endpoint 1 (with tolerance)
func isAtDrumEndpoint1(_ position: Double) -> Bool {
    return position > 0.99
}

/// Check if morph position is in mid-morph (not at either endpoint)
func isInDrumMidMorph(_ position: Double) -> Bool {
    return !isAtDrumEndpoint0(position) && !isAtDrumEndpoint1(position)
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERRIDE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/// Set a drum morph override for a parameter
func setDrumMorphOverride(voice: DrumVoiceType, param: String, value: Double, morphPosition: Double) {
    let isEndpoint = isAtDrumEndpoint0(morphPosition) || isAtDrumEndpoint1(morphPosition)
    drumMorphOverrides[voice]?[param] = DrumMorphOverride(
        value: value,
        morphPosition: morphPosition,
        isEndpoint: isEndpoint
    )
}

/// Set a drum morph dual range override
func setDrumMorphDualRangeOverride(
    voice: DrumVoiceType,
    param: String,
    isDualMode: Bool,
    value: Double,
    range: (min: Double, max: Double)?,
    morphPosition: Double
) {
    var current = drumMorphDualRangeOverrides[voice]?[param] ?? DrumMorphDualRangeOverride()
    
    let endpointState = DrumMorphEndpointState(
        isDualMode: isDualMode,
        value: value,
        range: range
    )
    
    if isAtDrumEndpoint0(morphPosition) {
        current.endpoint0 = endpointState
    } else if isAtDrumEndpoint1(morphPosition) {
        current.endpoint1 = endpointState
    }
    // Mid-morph changes don't update endpoint states
    
    drumMorphDualRangeOverrides[voice]?[param] = current
}

/// Get drum morph overrides for a voice
func getDrumMorphOverrides(voice: DrumVoiceType) -> [String: DrumMorphOverride] {
    return drumMorphOverrides[voice] ?? [:]
}

/// Get drum morph dual range overrides for a voice
func getDrumMorphDualRangeOverrides(voice: DrumVoiceType) -> [String: DrumMorphDualRangeOverride] {
    return drumMorphDualRangeOverrides[voice] ?? [:]
}

/// Clear all overrides for a voice
func clearDrumMorphOverrides(voice: DrumVoiceType) {
    drumMorphOverrides[voice] = [:]
    drumMorphDualRangeOverrides[voice] = [:]
}

/// Clear only endpoint-specific overrides for a voice
/// Used when a preset changes - only clear overrides for that endpoint
func clearDrumMorphEndpointOverrides(voice: DrumVoiceType, endpoint: Int) {
    // Clear value overrides for this endpoint
    if var overrides = drumMorphOverrides[voice] {
        for (param, override) in overrides {
            if override.isEndpoint {
                if (endpoint == 0 && override.morphPosition < 0.01) ||
                   (endpoint == 1 && override.morphPosition > 0.99) {
                    overrides.removeValue(forKey: param)
                }
            }
        }
        drumMorphOverrides[voice] = overrides
    }
    
    // Clear dual range overrides for this endpoint
    if var dualOverrides = drumMorphDualRangeOverrides[voice] {
        for (param, var dualOverride) in dualOverrides {
            if endpoint == 0 {
                dualOverride.endpoint0 = nil
                if dualOverride.endpoint1 == nil {
                    dualOverrides.removeValue(forKey: param)
                } else {
                    dualOverrides[param] = dualOverride
                }
            } else {
                dualOverride.endpoint1 = nil
                if dualOverride.endpoint0 == nil {
                    dualOverrides.removeValue(forKey: param)
                } else {
                    dualOverrides[param] = dualOverride
                }
            }
        }
        drumMorphDualRangeOverrides[voice] = dualOverrides
    }
}

/// Clear mid-morph overrides when reaching an endpoint
func clearMidMorphOverrides(voice: DrumVoiceType) {
    if var overrides = drumMorphOverrides[voice] {
        for (param, override) in overrides {
            if !override.isEndpoint {
                overrides.removeValue(forKey: param)
            }
        }
        drumMorphOverrides[voice] = overrides
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DUAL RANGE INTERPOLATION
// ═══════════════════════════════════════════════════════════════════════════

/// Interpolate dual range between two endpoint states
func interpolateDrumDualRange(
    _ override: DrumMorphDualRangeOverride,
    morphPosition: Double,
    currentValue: Double
) -> DrumInterpolatedDualRange {
    let ep0 = override.endpoint0
    let ep1 = override.endpoint1
    let t = smoothstep(morphPosition)
    
    switch (ep0, ep1) {
    case let (state0?, state1?):
        // Both endpoints defined
        if state0.isDualMode && state1.isDualMode {
            // Dual → Dual: interpolate both min and max
            guard let range0 = state0.range, let range1 = state1.range else {
                return DrumInterpolatedDualRange(isDualMode: true, range: nil)
            }
            return DrumInterpolatedDualRange(
                isDualMode: true,
                range: (
                    min: lerp(range0.min, range1.min, t),
                    max: lerp(range0.max, range1.max, t)
                )
            )
        } else if state0.isDualMode && !state1.isDualMode {
            // Dual → Single: converge to single value
            guard let range0 = state0.range else {
                return DrumInterpolatedDualRange(isDualMode: false, range: nil)
            }
            let targetValue = state1.value
            let minVal = lerp(range0.min, targetValue, t)
            let maxVal = lerp(range0.max, targetValue, t)
            let collapsed = abs(maxVal - minVal) < 0.001
            return DrumInterpolatedDualRange(
                isDualMode: !collapsed,
                range: collapsed ? nil : (min: minVal, max: maxVal)
            )
        } else if !state0.isDualMode && state1.isDualMode {
            // Single → Dual: expand from single value
            guard let range1 = state1.range else {
                return DrumInterpolatedDualRange(isDualMode: true, range: nil)
            }
            let startValue = state0.value
            let minVal = lerp(startValue, range1.min, t)
            let maxVal = lerp(startValue, range1.max, t)
            return DrumInterpolatedDualRange(
                isDualMode: true,
                range: (min: minVal, max: maxVal)
            )
        } else {
            // Single → Single: no dual mode
            return DrumInterpolatedDualRange(isDualMode: false, range: nil)
        }
        
    case let (state0?, nil):
        // Only endpoint 0 defined - use its state
        return DrumInterpolatedDualRange(
            isDualMode: state0.isDualMode,
            range: state0.range
        )
        
    case let (nil, state1?):
        // Only endpoint 1 defined - use its state
        return DrumInterpolatedDualRange(
            isDualMode: state1.isDualMode,
            range: state1.range
        )
        
    case (nil, nil):
        // No overrides - use current value as single
        return DrumInterpolatedDualRange(isDualMode: false, range: nil)
    }
}

/// Interpolate all dual ranges for a voice
func interpolateDrumMorphDualRanges(
    voice: DrumVoiceType,
    morphPosition: Double,
    currentValues: [String: Double]
) -> [String: DrumInterpolatedDualRange] {
    guard let overrides = drumMorphDualRangeOverrides[voice] else { return [:] }
    
    var result: [String: DrumInterpolatedDualRange] = [:]
    for (param, override) in overrides {
        let currentValue = currentValues[param] ?? 0
        result[param] = interpolateDrumDualRange(override, morphPosition: morphPosition, currentValue: currentValue)
    }
    return result
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
/// Applies user overrides - endpoint overrides replace preset values,
/// mid-morph overrides blend toward destination
func interpolatePresets(
    _ presetA: DrumVoicePreset,
    _ presetB: DrumVoicePreset,
    morph: Double,
    overrides: [String: DrumMorphOverride]? = nil
) -> [String: Any] {
    var result: [String: Any] = [:]
    let keys = getParamKeys(presetA, presetB)
    
    for key in keys {
        var valueA = presetA.params[key]
        var valueB = presetB.params[key]
        
        // Check for override
        if let override = overrides?[key] {
            if override.isEndpoint {
                // Endpoint override: replace the appropriate preset value
                if override.morphPosition < 0.01 {
                    valueA = override.value
                } else {
                    valueB = override.value
                }
            } else {
                // Mid-morph override: blend from override value toward destination
                if let numA = valueA as? Double, let numB = valueB as? Double {
                    let overridePos = override.morphPosition
                    
                    if morph >= overridePos {
                        // Moving toward B: blend from override to valueB
                        let destValue = numB
                        let totalDistance = 1 - overridePos
                        let currentDistance = morph - overridePos
                        let blendFactor = totalDistance > 0 ? currentDistance / totalDistance : 1
                        result[key] = override.value + (destValue - override.value) * blendFactor
                    } else {
                        // Moving toward A: blend from override to valueA
                        let destValue = numA
                        let totalDistance = overridePos
                        let currentDistance = overridePos - morph
                        let blendFactor = totalDistance > 0 ? currentDistance / totalDistance : 1
                        result[key] = override.value + (destValue - override.value) * blendFactor
                    }
                    continue
                }
            }
        }
        
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
/// Applies user overrides at endpoints when available
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
    
    // Get user overrides for this voice
    let overrides = getDrumMorphOverrides(voice: voice)
    
    return interpolatePresets(
        presetA,
        presetB,
        morph: morphValue,
        overrides: overrides.isEmpty ? nil : overrides
    )
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
