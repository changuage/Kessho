# iOS Port Documentation Index

## Quick Reference

| Document | Contents |
|----------|----------|
| [01-OVERVIEW.md](01-OVERVIEW.md) | Project summary, file mapping, porting phases |
| [02-AUDIO-ENGINE-ARCHITECTURE.md](02-AUDIO-ENGINE-ARCHITECTURE.md) | Signal flow, gain structure, voice chains |
| [03-HARMONY-AND-DEPENDENCIES.md](03-HARMONY-AND-DEPENDENCIES.md) | Root note, scales, Circle of Fifths drift |
| [04-PARAMETER-MAPPING.md](04-PARAMETER-MAPPING.md) | All 120+ parameters with ranges and targets |
| [05-DSP-WORKLET-PORTING.md](05-DSP-WORKLET-PORTING.md) | Granulator, FDN Reverb, Ocean algorithms |
| [06-LEAD-SYNTH-FM.md](06-LEAD-SYNTH-FM.md) | FM synthesis, Euclidean rhythms, delay |
| [07-UI-SWIFTUI-PORTING.md](07-UI-SWIFTUI-PORTING.md) | SnowflakeUI, CircleOfFifths, gestures |
| [08-PRESET-SYSTEM.md](08-PRESET-SYSTEM.md) | JSON format, iCloud sync, import/export |
| [09-IOS-PROJECT-SETUP.md](09-IOS-PROJECT-SETUP.md) | Xcode config, background audio, Now Playing |
| [10-COMPLETE-DEPENDENCY-MAP.md](10-COMPLETE-DEPENDENCY-MAP.md) | **All slider→node & node→node connections** |
| [11-AUDIO-TECH-PORTING-DETAILS.md](11-AUDIO-TECH-PORTING-DETAILS.md) | **Web Audio → iOS AVAudioEngine with code** |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    iOS APPLICATION                                       │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              PRESENTATION LAYER                                    │ │
│  │                                                                                    │ │
│  │   ┌──────────────────────┐    ┌──────────────────────┐    ┌───────────────────┐   │ │
│  │   │    SnowflakeView     │    │ AdvancedControlsView │    │  PresetPickerView │   │ │
│  │   │  (SwiftUI Canvas)    │    │   (120+ Sliders)     │    │   (List + Sheet)  │   │ │
│  │   └──────────┬───────────┘    └──────────┬───────────┘    └─────────┬─────────┘   │ │
│  │              │                           │                          │             │ │
│  │              └───────────────────────────┼──────────────────────────┘             │ │
│  │                                          ▼                                        │ │
│  │                            ┌─────────────────────────┐                            │ │
│  │                            │     AudioViewModel      │                            │ │
│  │                            │   @Published SliderState│                            │ │
│  │                            │   @Published isPlaying  │                            │ │
│  │                            └────────────┬────────────┘                            │ │
│  │                                         │                                         │ │
│  └─────────────────────────────────────────┼─────────────────────────────────────────┘ │
│                                            │                                           │
│  ┌─────────────────────────────────────────┼─────────────────────────────────────────┐ │
│  │                              AUDIO LAYER                                          │ │
│  │                                         ▼                                         │ │
│  │   ┌─────────────────────────────────────────────────────────────────────────────┐ │ │
│  │   │                            AudioEngine                                      │ │ │
│  │   │                         (AVAudioEngine)                                     │ │ │
│  │   │                                                                             │ │ │
│  │   │  ┌─────────────────────────────────────────────────────────────────────┐   │ │ │
│  │   │  │                         SIGNAL FLOW                                 │   │ │ │
│  │   │  │                                                                     │   │ │ │
│  │   │  │   PolySynth ──┬─► SynthBus ─► Granulator ─┬─► ReverbSend ─► FDN    │   │ │ │
│  │   │  │   (6 voices) │                           │                  │      │   │ │ │
│  │   │  │              │                           │                  ▼      │   │ │ │
│  │   │  │   LeadSynth ─┤                           └─► DryMix ──────► MainMix│   │ │ │
│  │   │  │   (FM + Delay)                                              │      │   │ │ │
│  │   │  │              │                                              ▼      │   │ │ │
│  │   │  │   OceanSynth ┘                                          Limiter    │   │ │ │
│  │   │  │                                                             │      │   │ │ │
│  │   │  │                                                             ▼      │   │ │ │
│  │   │  │                                                         Output     │   │ │ │
│  │   │  │                                                                     │   │ │ │
│  │   │  └─────────────────────────────────────────────────────────────────────┘   │ │ │
│  │   │                                                                             │ │ │
│  │   │  ┌────────────────────────────────────────────────────────────────────────┐│ │ │
│  │   │  │  HarmonyManager                                                        ││ │ │
│  │   │  │  • 16-second phrase boundaries                                         ││ │ │
│  │   │  │  • Circle of Fifths drift                                              ││ │ │
│  │   │  │  • Chord voicing generation                                            ││ │ │
│  │   │  │  • Scale-constrained note selection                                    ││ │ │
│  │   │  └────────────────────────────────────────────────────────────────────────┘│ │ │
│  │   │                                                                             │ │ │
│  │   │  ┌────────────────────────────────────────────────────────────────────────┐│ │ │
│  │   │  │  EuclideanSequencer                                                    ││ │ │
│  │   │  │  • Multi-lane rhythm patterns                                          ││ │ │
│  │   │  │  • Bjorklund's algorithm                                               ││ │ │
│  │   │  │  • Preset patterns (gamelan, Steve Reich, etc.)                        ││ │ │
│  │   │  └────────────────────────────────────────────────────────────────────────┘│ │ │
│  │   │                                                                             │ │ │
│  │   └─────────────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                                   │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              SERVICES LAYER                                       │  │
│  │                                                                                   │  │
│  │   ┌─────────────────┐   ┌─────────────────┐   ┌───────────────────────────────┐  │  │
│  │   │ AudioSession    │   │ NowPlaying      │   │ PresetManager                 │  │  │
│  │   │ Manager         │   │ Manager         │   │ • Load bundled presets        │  │  │
│  │   │ • Background    │   │ • Lock screen   │   │ • Save/delete user presets    │  │  │
│  │   │ • Interruptions │   │ • Remote cmds   │   │ • iCloud sync                 │  │  │
│  │   └─────────────────┘   └─────────────────┘   └───────────────────────────────┘  │  │
│  │                                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Technical Mappings

### Web Audio → AVAudioEngine

| Web Audio API | iOS Equivalent |
|---------------|----------------|
| `AudioContext` | `AVAudioEngine` |
| `AudioWorkletNode` | Custom `AUAudioUnit` |
| `OscillatorNode` | `AVAudioSourceNode` with waveform generation |
| `BiquadFilterNode` | `AVAudioUnitEQ` or `vDSP_deq22()` |
| `GainNode` | `AVAudioMixerNode` or `vDSP_vsmul()` |
| `WaveShaperNode` | Custom processing with lookup table |
| `ConvolverNode` | `AVAudioUnitReverb` or custom FDN |
| `AudioBufferSourceNode` | `AVAudioPlayerNode` |
| `setValueAtTime()` | Manual interpolation or `AUParameterTree` |
| `linearRampToValueAtTime()` | `AUParameter.setValue(_:originator:atHostTime:eventType:)` |

### React → SwiftUI

| React Pattern | SwiftUI Equivalent |
|---------------|-------------------|
| `useState` | `@State`, `@Published` |
| `useEffect` | `.onChange()`, `.onReceive()` |
| `useRef` | `@StateObject`, instance properties |
| `useCallback` | Closures, methods |
| Context | `@EnvironmentObject` |
| Props | View parameters |
| Conditional render | `if`, `switch`, `Group` |
| Lists | `ForEach`, `List` |
| Canvas | SwiftUI `Canvas` |
| Events | Gestures, `.onTapGesture`, etc. |

---

## Implementation Priority

### Phase 1: Core Audio (Week 1-2)
1. ✅ AudioSessionManager - background audio
2. ✅ NowPlayingManager - lock screen controls  
3. AudioEngine skeleton with AVAudioEngine
4. PolySynth with 6 voices
5. Basic parameter mapping

### Phase 2: DSP Processors (Week 3-4)
1. GranulatorNode (AUAudioUnit)
2. FDNReverbNode (AUAudioUnit)
3. LeadSynth with FM synthesis
4. PingPongDelay

### Phase 3: Harmony System (Week 5)
1. HarmonyManager with phrase boundaries
2. Circle of Fifths drift logic
3. Chord voicing generation
4. Scale definitions

### Phase 4: Rhythm & Lead (Week 6)
1. EuclideanSequencer
2. Pattern presets
3. Multi-lane configuration
4. Note selection algorithm

### Phase 5: UI (Week 7-8)
1. SnowflakeView with Canvas
2. Arm drawing with recursive branching
3. Gesture handling
4. AdvancedControlsView with all 120+ sliders
5. CircleOfFifthsView

### Phase 6: Presets (Week 9)
1. SliderState Codable model
2. PresetManager
3. PresetPickerView
4. iCloud sync (optional)

### Phase 7: Polish (Week 10)
1. Performance optimization
2. Battery testing
3. Background audio testing
4. App Store assets

---

## Critical Algorithms to Port Precisely

1. **Deterministic RNG** (`rng.ts`)
   - Must use identical xmur3 + mulberry32 for preset reproducibility
   
2. **Phrase Timing** (`engine.ts`)
   - 16-second boundaries: `Math.floor(audioContext.currentTime / 16) * 16`
   
3. **Circle of Fifths Drift** (`harmony.ts`)
   - COF sequence: `[0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]`
   
4. **Chord Voicing** (`harmony.ts`)
   - Root doubling, octave spreading, scale-constrained notes
   
5. **Euclidean Patterns** (`engine.ts`)
   - Bjorklund's algorithm, preset patterns, multi-lane config
   
6. **Granulator DSP** (`granulator.worklet.js`)
   - Grain spawning, Hann window, harmonic intervals, feedback
   
7. **FDN Reverb** (`reverb.worklet.js`)
   - 8-tap delay network, Hadamard matrix, diffusers

---

## Testing Checklist

### Audio Quality Parity
- [ ] Same chord voicings at same seed/tension
- [ ] Same note selection patterns
- [ ] Same reverb character
- [ ] Same granular texture
- [ ] Same FM lead sound
- [ ] Same Euclidean patterns

### Background Audio
- [ ] Plays with screen locked
- [ ] Survives phone calls
- [ ] Lock screen controls work
- [ ] Control Center shows correctly
- [ ] AirPods controls work

### Preset Compatibility
- [ ] Load web preset JSON
- [ ] All parameters apply correctly
- [ ] Save new preset
- [ ] Export preset (shareable)
- [ ] Import from AirDrop/Files

---

## Contact / Questions

This documentation was prepared for an iOS developer to port the Generative Ambient web application. The key goals are:

1. **Background audio** - Must work with screen off
2. **Preset compatibility** - Same JSON format, same audio output
3. **Audio quality parity** - Port DSP algorithms precisely

For questions about specific algorithms or edge cases, refer to the source TypeScript/JavaScript files in `src/audio/` and `public/worklets/`.
