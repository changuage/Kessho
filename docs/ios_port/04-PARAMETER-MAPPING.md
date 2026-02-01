# Parameter Mapping: SliderState to Audio Components

## Complete Parameter Reference

The `SliderState` interface contains **120+ parameters** organized into sections. This document maps each parameter to its audio destination(s) and UI exposure.

## Parameter Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        SliderState                                               │
│                                   (src/ui/state.ts)                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│     SNOWFLAKE UI        │   │      ADVANCED UI        │   │     AUDIO ENGINE        │
│   (6 Macro Sliders)     │   │   (Full Control Panel)  │   │  (engine.ts)            │
│                         │   │                         │   │                         │
│ • reverbLevel           │   │ All 120+ parameters     │   │ updateParams()          │
│ • synthLevel            │   │ exposed in sections:    │   │ applyParams()           │
│ • granularLevel         │   │ • Mixer                 │   │ applyChord()            │
│ • leadLevel             │   │ • Harmony               │   │ playLeadNote()          │
│ • synthReverbSend       │   │ • Timbre                │   │                         │
│ • granularReverbSend    │   │ • Space                 │   │                         │
│                         │   │ • Granular              │   │                         │
│ + Tension (hexagon)     │   │ • Lead                  │   │                         │
│ + Master Vol (ring)     │   │ • Ocean                 │   │                         │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

## Section 1: Master Mixer

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `masterVolume` | number | 0-1 | 0.7 | `masterGain.gain` | Snowflake outer ring |
| `synthLevel` | number | 0-1 | 0.6 | `synthDirect.gain` | Snowflake arm 2 |
| `granularLevel` | number | 0-4 | 0.4 | `granularDirect.gain` | Snowflake arm 3 |
| `synthReverbSend` | number | 0-1 | 0.7 | `synthReverbSend.gain` | Snowflake arm 5 |
| `granularReverbSend` | number | 0-1 | 0.8 | `granularReverbSend.gain` | Snowflake arm 6 |
| `leadReverbSend` | number | 0-1 | 0.5 | `leadReverbSend.gain` | Advanced → Lead |
| `leadDelayReverbSend` | number | 0-1 | 0.4 | `leadDelayReverbSend.gain` | Advanced → Lead |
| `reverbLevel` | number | 0-2 | 1.0 | `reverbOutputGain.gain` | Snowflake arm 1 |

### Snowflake UI Arm Mapping (with logarithmic scaling)

```
                        Arm 0: reverbLevel (0-2)
                               │
                              ╱╲
              Arm 5 ─────────╱  ╲───────── Arm 1
        synthReverbSend     ╱    ╲     synthLevel
              (0-1)        ╱      ╲      (0-1)
                          ╱   ◇    ╲
                         ╱ tension  ╲
            Arm 4 ──────╱     ○      ╲────── Arm 2
      granularReverbSend    master     granularLevel
            (0-1)          volume         (0-4)
                          ╲          ╱
                           ╲        ╱
                            ╲      ╱
               Arm 3 ────────╲    ╱──────── Arm 3
                  leadLevel   ╲  ╱
                    (0-1)      ╲╱
```

**Log Scaling**: Lower values get more slider space:
- `position = value^(1/2.5)` for display
- `value = position^2.5` for control

## Section 2: Global / Seed

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `seedWindow` | enum | 'hour'\|'day' | 'hour' | RNG seed generation | Advanced → Global |
| `randomness` | number | 0-1 | 0.5 | *Reserved for future use* | Advanced → Global |
| `rootNote` | number | 0-11 | 4 (E) | Harmony root calculation | Advanced → Harmony |

## Section 3: Circle of Fifths Drift

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `cofDriftEnabled` | boolean | - | false | `cofConfig.enabled` | Advanced → CoF |
| `cofDriftRate` | number | 1-8 | 2 | `cofConfig.driftRate` (phrases) | Advanced → CoF |
| `cofDriftDirection` | enum | 'cw'\|'ccw'\|'random' | 'cw' | `cofConfig.direction` | Advanced → CoF |
| `cofDriftRange` | number | 1-6 | 3 | `cofConfig.range` (max steps) | Advanced → CoF |
| `cofCurrentStep` | number | -6 to 6 | 0 | Display only (engine-controlled) | CoF Visualization |

## Section 4: Harmony / Pitch

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `scaleMode` | enum | 'auto'\|'manual' | 'auto' | Scale selection logic | Advanced → Harmony |
| `manualScale` | string | scale name | 'E Dorian' | `getScaleByName()` | Advanced → Harmony |
| `tension` | number | 0-1 | 0.3 | Scale selection weights, chord size | Snowflake hexagon |
| `chordRate` | number | 8-64 | 32 | Seconds between chord changes | Advanced → Harmony |
| `voicingSpread` | number | 0-1 | 0.5 | Octave displacement probability | Advanced → Harmony |
| `waveSpread` | number | 0-30 | 4 | Stagger time for voice entries (sec) | Advanced → Harmony |
| `detune` | number | 0-25 | 8 | Random detune in cents | Advanced → Harmony |

## Section 5: Synth ADSR

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `synthAttack` | number | 0.01-16 | 6.0 | Voice envelope attack | Advanced → Synth |
| `synthDecay` | number | 0.01-8 | 1.0 | Voice envelope decay | Advanced → Synth |
| `synthSustain` | number | 0-1 | 0.8 | Voice envelope sustain | Advanced → Synth |
| `synthRelease` | number | 0.01-30 | 12.0 | Voice envelope release | Advanced → Synth |
| `synthVoiceMask` | number | 1-63 | 63 | Binary mask for voice enable | Advanced → Synth |
| `synthOctave` | number | -2 to +2 | 0 | Frequency multiplier (×0.25 to ×4) | Advanced → Synth |

**Voice Mask Bits**:
```
Bit 0 (1):  Voice 1
Bit 1 (2):  Voice 2
Bit 2 (4):  Voice 3
Bit 3 (8):  Voice 4
Bit 4 (16): Voice 5
Bit 5 (32): Voice 6

63 = 0b111111 = all voices
21 = 0b010101 = voices 1, 3, 5
42 = 0b101010 = voices 2, 4, 6
```

## Section 6: Timbre

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `hardness` | number | 0-1 | 0.3 | Saturation curve drive | Advanced → Timbre |
| `oscBrightness` | number | 0-3 | 2 | Oscillator mix weights | Advanced → Timbre |
| `filterType` | enum | 'lowpass'\|'bandpass'\|'highpass'\|'notch' | 'lowpass' | `voice.filter.type` | Advanced → Timbre |
| `filterCutoffMin` | number | 40-8000 | 400 | Filter modulation lower bound | Advanced → Timbre |
| `filterCutoffMax` | number | 40-8000 | 3000 | Filter modulation upper bound | Advanced → Timbre |
| `filterModSpeed` | number | 0-16 | 2 | Phrases per filter sweep cycle | Advanced → Timbre |
| `filterResonance` | number | 0-1 | 0.2 | Filter peak boost | Advanced → Timbre |
| `filterQ` | number | 0.1-12 | 1.0 | Filter bandwidth | Advanced → Timbre |
| `warmth` | number | 0-1 | 0.4 | Low shelf boost (0-8dB) | Advanced → Timbre |
| `presence` | number | 0-1 | 0.3 | Mid-high EQ (-6 to +6dB) | Advanced → Timbre |
| `airNoise` | number | 0-1 | 0.15 | Noise generator level | Advanced → Timbre |

## Section 7: Space (Reverb)

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `reverbEngine` | enum | 'algorithmic'\|'convolution' | 'algorithmic' | Reverb type selection | Advanced → Space |
| `reverbType` | enum | 'plate'\|'hall'\|'cathedral'\|'darkHall' | 'cathedral' | Reverb preset | Advanced → Space |
| `reverbDecay` | number | 0-1 | 0.9 | FDN feedback amount | Advanced → Space |
| `reverbSize` | number | 0.5-3 | 2.0 | Delay line multiplier | Advanced → Space |
| `reverbDiffusion` | number | 0-1 | 1.0 | Allpass feedback | Advanced → Space |
| `reverbModulation` | number | 0-1 | 0.4 | Delay modulation depth | Advanced → Space |
| `predelay` | number | 0-100 | 60 | ms before reverb onset | Advanced → Space |
| `damping` | number | 0-1 | 0.2 | High frequency absorption | Advanced → Space |
| `width` | number | 0-1 | 0.85 | Stereo width | Advanced → Space |

## Section 8: Granular

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `granularEnabled` | boolean | - | true | Granular output mute | Advanced → Granular |
| `grainProbability` | number | 0-1 | 0.8 | Grain trigger chance | Advanced → Granular |
| `grainSizeMin` | number | 5-60 | 20 | Min grain ms | Advanced → Granular |
| `grainSizeMax` | number | 20-200 | 80 | Max grain ms | Advanced → Granular |
| `density` | number | 5-80 | 25 | Grains per second | Advanced → Granular |
| `spray` | number | 0-600 | 200 | Buffer read offset ms | Advanced → Granular |
| `jitter` | number | 0-30 | 10 | Random position offset ms | Advanced → Granular |
| `grainPitchMode` | enum | 'random'\|'harmonic' | 'harmonic' | Pitch selection method | Advanced → Granular |
| `pitchSpread` | number | 0-12 | 3 | Semitones spread | Advanced → Granular |
| `stereoSpread` | number | 0-1 | 0.6 | Pan width | Advanced → Granular |
| `feedback` | number | 0-0.35 | 0.1 | Grain feedback (capped) | Advanced → Granular |
| `wetHPF` | number | 200-3000 | 500 | Wet high-pass Hz | Advanced → Granular |
| `wetLPF` | number | 3000-12000 | 8000 | Wet low-pass Hz | Advanced → Granular |

## Section 9: Lead Synth

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `leadEnabled` | boolean | - | false | Lead output enable | Snowflake arm 4 level |
| `leadLevel` | number | 0-1 | 0.4 | `leadGain.gain` | Snowflake arm 4 |
| `leadAttack` | number | 0.001-2 | 0.01 | Note attack time | Advanced → Lead |
| `leadDecay` | number | 0.01-4 | 0.8 | Note decay time | Advanced → Lead |
| `leadSustain` | number | 0-1 | 0.3 | Note sustain level | Advanced → Lead |
| `leadRelease` | number | 0.01-8 | 2.0 | Note release time | Advanced → Lead |
| `leadDelayTime` | number | 0-1000 | 375 | Delay ms | Advanced → Lead |
| `leadDelayFeedback` | number | 0-0.8 | 0.4 | Delay feedback | Advanced → Lead |
| `leadDelayMix` | number | 0-1 | 0.35 | Delay wet/dry | Advanced → Lead |
| `leadDensity` | number | 0.1-12 | 0.5 | Notes per phrase (random mode) | Advanced → Lead |
| `leadOctave` | number | -1 to 2 | 1 | Base octave offset | Advanced → Lead |
| `leadOctaveRange` | number | 1-4 | 2 | Octaves to span | Advanced → Lead |
| `leadTimbreMin` | number | 0-1 | 0.2 | Min timbre (Rhodes) | Advanced → Lead |
| `leadTimbreMax` | number | 0-1 | 0.6 | Max timbre (Gamelan) | Advanced → Lead |

## Section 10: Euclidean Sequencer (Lead)

| Parameter | Type | Range | Default | Audio Target |
|-----------|------|-------|---------|--------------|
| `leadEuclideanMasterEnabled` | boolean | - | false | Euclidean vs random mode |
| `leadEuclideanTempo` | number | 0.25-12 | 1 | Pattern cycles per phrase |

**Per-Lane Parameters** (×4 lanes):

| Parameter | Type | Range | Default | Purpose |
|-----------|------|-------|---------|---------|
| `leadEuclid{N}Enabled` | boolean | - | varies | Lane enable |
| `leadEuclid{N}Preset` | string | preset name | varies | Pattern preset |
| `leadEuclid{N}Steps` | number | 4-32 | varies | Pattern length |
| `leadEuclid{N}Hits` | number | 1-16 | varies | Notes in pattern |
| `leadEuclid{N}Rotation` | number | 0-31 | varies | Pattern rotation |
| `leadEuclid{N}NoteMin` | number | 36-96 | varies | MIDI note low |
| `leadEuclid{N}NoteMax` | number | 36-96 | varies | MIDI note high |
| `leadEuclid{N}Level` | number | 0-1 | varies | Lane velocity |

## Section 11: Ocean Waves

| Parameter | Type | Range | Default | Audio Target | UI Location |
|-----------|------|-------|---------|--------------|-------------|
| `oceanSampleEnabled` | boolean | - | false | Sample playback enable | Advanced → Ocean |
| `oceanSampleLevel` | number | 0-1 | 0.5 | `oceanSampleGain.gain` | Advanced → Ocean |
| `oceanWaveSynthEnabled` | boolean | - | false | Wave synth enable | Advanced → Ocean |
| `oceanWaveSynthLevel` | number | 0-1 | 0.4 | `oceanGain.gain` | Advanced → Ocean |
| `oceanFilterType` | enum | 'lowpass'\|etc | 'lowpass' | `oceanFilter.type` | Advanced → Ocean |
| `oceanFilterCutoff` | number | 40-12000 | 8000 | `oceanFilter.frequency` | Advanced → Ocean |
| `oceanFilterResonance` | number | 0-1 | 0.1 | `oceanFilter.Q` | Advanced → Ocean |
| `oceanDurationMin` | number | 2-15 | 4 | Wave min seconds | Advanced → Ocean |
| `oceanDurationMax` | number | 2-15 | 10 | Wave max seconds | Advanced → Ocean |
| `oceanIntervalMin` | number | 3-20 | 5 | Gap min seconds | Advanced → Ocean |
| `oceanIntervalMax` | number | 3-20 | 12 | Gap max seconds | Advanced → Ocean |
| `oceanFoamMin` | number | 0-1 | 0.2 | Foam intensity min | Advanced → Ocean |
| `oceanFoamMax` | number | 0-1 | 0.5 | Foam intensity max | Advanced → Ocean |
| `oceanDepthMin` | number | 0-1 | 0.3 | Deep rumble min | Advanced → Ocean |
| `oceanDepthMax` | number | 0-1 | 0.7 | Deep rumble max | Advanced → Ocean |

## Section 12: Random Walk

| Parameter | Type | Range | Default | Purpose |
|-----------|------|-------|---------|---------|
| `randomWalkSpeed` | number | 0.1-5 | 1.0 | Speed of parameter automation |

## iOS SwiftUI Binding Structure

```swift
// SliderState.swift - Complete Codable struct
struct SliderState: Codable {
    // Master Mixer
    var masterVolume: Double = 0.7
    var synthLevel: Double = 0.6
    var granularLevel: Double = 0.4
    var synthReverbSend: Double = 0.7
    var granularReverbSend: Double = 0.8
    var leadReverbSend: Double = 0.5
    var leadDelayReverbSend: Double = 0.4
    var reverbLevel: Double = 1.0
    
    // Global
    var seedWindow: SeedWindow = .hour
    var randomness: Double = 0.5
    var rootNote: Int = 4
    
    // Circle of Fifths
    var cofDriftEnabled: Bool = false
    var cofDriftRate: Int = 2
    var cofDriftDirection: DriftDirection = .clockwise
    var cofDriftRange: Int = 3
    var cofCurrentStep: Int = 0
    
    // ... all other parameters
    
    enum SeedWindow: String, Codable {
        case hour, day
    }
    
    enum DriftDirection: String, Codable {
        case clockwise = "cw"
        case counterClockwise = "ccw"
        case random
    }
}

// ViewModel for UI binding
class AudioViewModel: ObservableObject {
    @Published var state: SliderState = SliderState()
    
    private var engine: AudioEngine
    
    func updateParameter<T>(_ keyPath: WritableKeyPath<SliderState, T>, value: T) {
        state[keyPath: keyPath] = value
        engine.updateParams(state)
    }
}
```

## Parameter Quantization

All parameters have defined step sizes for UI precision:

```swift
struct ParameterInfo {
    let min: Double
    let max: Double
    let step: Double
}

let PARAM_INFO: [String: ParameterInfo] = [
    "masterVolume": ParameterInfo(min: 0, max: 1, step: 0.01),
    "synthLevel": ParameterInfo(min: 0, max: 1, step: 0.01),
    "granularLevel": ParameterInfo(min: 0, max: 2, step: 0.01),
    "chordRate": ParameterInfo(min: 8, max: 64, step: 1),
    "filterCutoffMin": ParameterInfo(min: 40, max: 8000, step: 10),
    // ... etc
]

func quantize(key: String, value: Double) -> Double {
    guard let info = PARAM_INFO[key] else { return value }
    let clamped = max(info.min, min(info.max, value))
    let steps = round((clamped - info.min) / info.step)
    return info.min + steps * info.step
}
```
