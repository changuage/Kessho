# iOS Port Audit Checklist

**Generated:** February 2, 2026  
**Scope:** Web App (TypeScript) → iOS App (Swift) parity verification

---

## 1. SLIDER STATE PROPERTIES

Comparing [src/ui/state.ts](src/ui/state.ts) with [KesshoiOS/Kessho/State/SliderState.swift](KesshoiOS/Kessho/State/SliderState.swift)

### 1.1 Master Mixer
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `masterVolume` | `number` | 0.7 | 0..1 step 0.01 | `Double` | 0.7 | [ ] Match |
| `synthLevel` | `number` | 0.6 | 0..1 step 0.01 | `Double` | 0.6 | [ ] Match |
| `granularLevel` | `number` | 0.4 | 0..2 step 0.01 | `Double` | 0.4 | [ ] Match |
| `synthReverbSend` | `number` | 0.7 | 0..1 step 0.01 | `Double` | 0.7 | [ ] Match |
| `granularReverbSend` | `number` | 0.8 | 0..1 step 0.01 | `Double` | 0.8 | [ ] Match |
| `leadReverbSend` | `number` | 0.5 | 0..1 step 0.01 | `Double` | 0.5 | [ ] Match |
| `leadDelayReverbSend` | `number` | 0.4 | 0..1 step 0.01 | `Double` | 0.4 | [ ] Match |
| `reverbLevel` | `number` | 1.0 | 0..2 step 0.01 | `Double` | 1.0 | [ ] Match |

### 1.2 Global/Seed
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `seedWindow` | `'hour' \| 'day'` | 'hour' | enum | `String` | "hour" | [ ] ⚠️ iOS allows "minute" but web doesn't |
| `randomness` | `number` | 0.5 | 0..1 step 0.01 | `Double` | 0.5 | [ ] Match |
| `rootNote` | `number` | 4 (E) | 0..11 | `Int` | 4 | [ ] Match |

### 1.3 Circle of Fifths Drift
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `cofDriftEnabled` | `boolean` | false | - | `Bool` | false | [ ] Match |
| `cofDriftRate` | `number` | 2 | 1..8 step 1 | `Int` | 2 | [ ] Match |
| `cofDriftDirection` | `'cw' \| 'ccw' \| 'random'` | 'cw' | enum | `String` | "cw" | [ ] Match |
| `cofDriftRange` | `number` | 3 | 1..6 step 1 | `Int` | 3 | [ ] Match |
| `cofCurrentStep` | `number` | 0 | -6..6 | `Int` | 0 | [ ] Match |

### 1.4 Harmony/Pitch
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `scaleMode` | `'auto' \| 'manual'` | 'auto' | enum | `String` | "auto" | [ ] Match |
| `manualScale` | `string` | 'Dorian' | scale names | `String` | "Dorian" | [ ] Match |
| `tension` | `number` | 0.3 | 0..1 step 0.01 | `Double` | 0.3 | [ ] Match |
| `chordRate` | `number` | 32 | 8..64 step 1 | `Int` | 32 | [ ] Match |
| `voicingSpread` | `number` | 0.5 | 0..1 step 0.01 | `Double` | 0.5 | [ ] Match |
| `waveSpread` | `number` | 4 | 0..30 step 0.5 | `Double` | 4.0 | [ ] Match |
| `detune` | `number` | 8 | 0..25 step 1 | `Double` | 8.0 | [ ] Match |

### 1.5 Synth ADSR
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `synthAttack` | `number` | 6.0 | 0.01..16 sec | `Double` | 6.0 | [ ] Match |
| `synthDecay` | `number` | 1.0 | 0.01..8 sec | `Double` | 1.0 | [ ] Match |
| `synthSustain` | `number` | 0.8 | 0..1 | `Double` | 0.8 | [ ] Match |
| `synthRelease` | `number` | 12.0 | 0.01..30 sec | `Double` | 12.0 | [ ] Match |
| `synthVoiceMask` | `number` | 63 | 1..63 | `Int` | 63 | [ ] Match |
| `synthOctave` | `number` | 0 | -2..+2 | `Int` | 0 | [ ] Match |

### 1.6 Timbre
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `hardness` | `number` | 0.3 | 0..1 step 0.01 | `Double` | 0.3 | [ ] Match |
| `oscBrightness` | `number` | 2 | 0..3 step 1 | `Double` | 2.0 | [ ] Match |
| `filterType` | `'lowpass' \| 'bandpass' \| 'highpass' \| 'notch'` | 'lowpass' | enum | `String` | "lowpass" | [ ] Match |
| `filterCutoffMin` | `number` | 400 | 40..8000 Hz | `Double` | 400 | [ ] Match |
| `filterCutoffMax` | `number` | 3000 | 40..8000 Hz | `Double` | 3000 | [ ] Match |
| `filterModSpeed` | `number` | 2 | 0..16 step 0.5 | `Double` | 2.0 | [ ] Match |
| `filterResonance` | `number` | 0.2 | 0..1 step 0.01 | `Double` | 0.2 | [ ] Match |
| `filterQ` | `number` | 1.0 | 0.1..12 step 0.1 | `Double` | 1.0 | [ ] Match |
| `warmth` | `number` | 0.4 | 0..1 step 0.01 | `Double` | 0.4 | [ ] Match |
| `presence` | `number` | 0.3 | 0..1 step 0.01 | `Double` | 0.3 | [ ] Match |
| `airNoise` | `number` | 0.15 | 0..1 step 0.01 | `Double` | 0.15 | [ ] Match |

### 1.7 Reverb
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `reverbEngine` | `'algorithmic' \| 'convolution'` | 'algorithmic' | enum | `String` | "algorithmic" | [ ] Match |
| `reverbType` | `'plate' \| 'hall' \| 'cathedral' \| 'darkHall'` | 'cathedral' | enum | `String` | "cathedral" | [ ] ⚠️ iOS has 11 extra Apple presets |
| `reverbQuality` | `'ultra' \| 'balanced' \| 'lite'` | 'balanced' | enum | `String` | "balanced" | [ ] Match |
| `reverbDecay` | `number` | 0.9 | 0..1 step 0.01 | `Double` | 0.9 | [ ] Match |
| `reverbSize` | `number` | 2.0 | 0.5..3 step 0.1 | `Double` | 2.0 | [ ] Match |
| `reverbDiffusion` | `number` | 1.0 | 0..1 step 0.01 | `Double` | 1.0 | [ ] Match |
| `reverbModulation` | `number` | 0.4 | 0..1 step 0.01 | `Double` | 0.4 | [ ] Match |
| `predelay` | `number` | 60 | 0..100 ms step 1 | `Double` | 60 | [ ] Match |
| `damping` | `number` | 0.2 | 0..1 step 0.01 | `Double` | 0.2 | [ ] Match |
| `width` | `number` | 0.85 | 0..1 step 0.01 | `Double` | 0.85 | [ ] Match |

### 1.8 Granular
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `granularEnabled` | `boolean` | true | - | `Bool` | true | [ ] Match |
| `maxGrains` | `number` | 64 | 0..128 step 1 | `Double` | 64 | [ ] Match |
| `grainProbability` | `number` | 0.8 | 0..1 step 0.01 | `Double` | 0.8 | [ ] Match |
| `grainSizeMin` | `number` | 20 | 5..60 ms step 1 | `Double` | 20 | [ ] Match |
| `grainSizeMax` | `number` | 80 | 20..200 ms step 1 | `Double` | 80 | [ ] Match |
| `density` | `number` | 25 | 5..80 grains/sec | `Double` | 25 | [ ] Match |
| `spray` | `number` | 200 | 0..600 ms step 5 | `Double` | 200 | [ ] Match |
| `jitter` | `number` | 10 | 0..30 ms step 1 | `Double` | 10 | [ ] Match |
| `grainPitchMode` | `'random' \| 'harmonic'` | 'harmonic' | enum | `String` | "harmonic" | [ ] Match |
| `pitchSpread` | `number` | 3 | 0..12 semitones | `Double` | 3 | [ ] Match |
| `stereoSpread` | `number` | 0.6 | 0..1 step 0.01 | `Double` | 0.6 | [ ] Match |
| `feedback` | `number` | 0.1 | 0..0.35 step 0.01 | `Double` | 0.1 | [ ] Match |
| `wetHPF` | `number` | 500 | 200..3000 Hz | `Double` | 500 | [ ] Match |
| `wetLPF` | `number` | 8000 | 3000..12000 Hz | `Double` | 8000 | [ ] Match |

### 1.9 Lead Synth
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `leadEnabled` | `boolean` | false | - | `Bool` | false | [ ] Match |
| `leadLevel` | `number` | 0.4 | 0..1 step 0.01 | `Double` | 0.4 | [ ] Match |
| `leadAttack` | `number` | 0.01 | 0.001..2 sec | `Double` | 0.01 | [ ] Match |
| `leadDecay` | `number` | 0.8 | 0.01..4 sec | `Double` | 0.8 | [ ] Match |
| `leadSustain` | `number` | 0.3 | 0..1 | `Double` | 0.3 | [ ] Match |
| `leadRelease` | `number` | 2.0 | 0.01..8 sec | `Double` | 2.0 | [ ] Match |
| `leadDelayTimeMin` | `number` | 375 | 0..1000 ms | `Double` | 375 | [ ] Match |
| `leadDelayTimeMax` | `number` | 375 | 0..1000 ms | `Double` | 375 | [ ] Match |
| `leadDelayFeedbackMin` | `number` | 0.4 | 0..0.8 | `Double` | 0.4 | [ ] Match |
| `leadDelayFeedbackMax` | `number` | 0.4 | 0..0.8 | `Double` | 0.4 | [ ] Match |
| `leadDelayMixMin` | `number` | 0.35 | 0..1 | `Double` | 0.35 | [ ] Match |
| `leadDelayMixMax` | `number` | 0.35 | 0..1 | `Double` | 0.35 | [ ] Match |
| `leadDensity` | `number` | 0.5 | 0.1..12 | `Double` | 0.5 | [ ] Match |
| `leadOctave` | `number` | 1 | -1..2 | `Int` | 1 | [ ] Match |
| `leadOctaveRange` | `number` | 2 | 1..4 | `Int` | 2 | [ ] Match |
| `leadTimbreMin` | `number` | 0.2 | 0..1 | `Double` | 0.2 | [ ] Match |
| `leadTimbreMax` | `number` | 0.6 | 0..1 | `Double` | 0.6 | [ ] Match |
| `leadVibratoDepthMin` | `number` | 0 | 0..1 | `Double` | 0 | [ ] Match |
| `leadVibratoDepthMax` | `number` | 0 | 0..1 | `Double` | 0 | [ ] Match |
| `leadVibratoRateMin` | `number` | 0 | 0..1 (maps to 2-8 Hz) | `Double` | 0 | [ ] Match |
| `leadVibratoRateMax` | `number` | 0 | 0..1 (maps to 2-8 Hz) | `Double` | 0 | [ ] Match |
| `leadGlideMin` | `number` | 0 | 0..1 | `Double` | 0 | [ ] Match |
| `leadGlideMax` | `number` | 0 | 0..1 | `Double` | 0 | [ ] Match |

### 1.10 Euclidean Sequencer (4 Lanes)
| Property | Web Type | Web Default | iOS Type | iOS Default | Status |
|----------|----------|-------------|----------|-------------|--------|
| `leadEuclideanMasterEnabled` | `boolean` | false | `Bool` | false | [ ] Match |
| `leadEuclideanTempo` | `number` | 1 (0.25..12) | `Double` | 1.0 | [ ] Match |
| Lane 1-4: `Enabled` | `boolean` | varies | `Bool` | varies | [ ] Match |
| Lane 1-4: `Preset` | `string` | varies | `String` | varies | [ ] Match |
| Lane 1-4: `Steps` | `number` | varies (4..32) | `Int` | varies | [ ] Match |
| Lane 1-4: `Hits` | `number` | varies (1..16) | `Int` | varies | [ ] Match |
| Lane 1-4: `Rotation` | `number` | varies (0..31) | `Int` | varies | [ ] Match |
| Lane 1-4: `NoteMin` | `number` | varies (36..96) | `Int` | varies | [ ] Match |
| Lane 1-4: `NoteMax` | `number` | varies (36..96) | `Int` | varies | [ ] Match |
| Lane 1-4: `Level` | `number` | varies (0..1) | `Double` | varies | [ ] Match |

### 1.11 Ocean Waves
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `oceanSampleEnabled` | `boolean` | false | - | `Bool` | false | [ ] Match |
| `oceanSampleLevel` | `number` | 0.5 | 0..1 step 0.01 | `Double` | 0.5 | [ ] Match |
| `oceanWaveSynthEnabled` | `boolean` | false | - | `Bool` | false | [ ] Match |
| `oceanWaveSynthLevel` | `number` | 0.4 | 0..1 step 0.01 | `Double` | 0.4 | [ ] Match |
| `oceanFilterType` | filter enum | 'lowpass' | enum | `String` | "lowpass" | [ ] Match |
| `oceanFilterCutoff` | `number` | 8000 | 40..12000 Hz | `Double` | 8000 | [ ] Match |
| `oceanFilterResonance` | `number` | 0.1 | 0..1 step 0.01 | `Double` | 0.1 | [ ] Match |
| `oceanDurationMin` | `number` | 4 | 2..15 sec | `Double` | 4 | [ ] Match |
| `oceanDurationMax` | `number` | 10 | 2..15 sec | `Double` | 10 | [ ] Match |
| `oceanIntervalMin` | `number` | 5 | 3..20 sec | `Double` | 5 | [ ] Match |
| `oceanIntervalMax` | `number` | 12 | 3..20 sec | `Double` | 12 | [ ] Match |
| `oceanFoamMin` | `number` | 0.2 | 0..1 | `Double` | 0.2 | [ ] Match |
| `oceanFoamMax` | `number` | 0.5 | 0..1 | `Double` | 0.5 | [ ] Match |
| `oceanDepthMin` | `number` | 0.3 | 0..1 | `Double` | 0.3 | [ ] Match |
| `oceanDepthMax` | `number` | 0.7 | 0..1 | `Double` | 0.7 | [ ] Match |

### 1.12 Random Walk
| Property | Web Type | Web Default | Web Range | iOS Type | iOS Default | Status |
|----------|----------|-------------|-----------|----------|-------------|--------|
| `randomWalkSpeed` | `number` | 1.0 | 0.1..5 step 0.1 | `Double` | 1.0 | [ ] Match |

### 1.13 Legacy Fields (iOS only - backward compatibility)
- [ ] `oceanMix`, `oceanWave2OffsetMin/Max` - iOS has these as optionals
- [ ] `filterCutoff` (old single-value), `brightness`, `reverbMix` - iOS has as optionals
- [ ] `leadDelayTime/Feedback/Mix` (old single-value), `leadVibratoDepth/Rate`, `leadGlide` - iOS optionals

---

## 2. AUDIO SOURCES

### 2.1 Web Audio Sources ([src/audio/engine.ts](src/audio/engine.ts))
| Source | File | Parameters | RNG Usage | Output |
|--------|------|------------|-----------|--------|
| [ ] Poly Synth (6 voices) | engine.ts L41-57 | osc1-4, filter, warmth, presence, saturation, envelope | Seeded for noise buffer | Stereo via synthBus |
| [ ] Granular Processor | [public/worklets/granulator.worklet.js](public/worklets/granulator.worklet.js) | density, spray, jitter, pitch, stereo, feedback | Pre-seeded 10K sequence | Stereo worklet |
| [ ] Lead Synth FM | engine.ts L1340-1630 | 2 carriers + 4 modulators, ADSR, vibrato, glide, delay | Per-phrase seeded for note selection | Stereo with ping-pong delay |
| [ ] Ocean Wave Synth | [public/worklets/ocean.worklet.js](public/worklets/ocean.worklet.js) | 2 wave generators, foam, depth, duration, interval | Seed via postMessage | Stereo worklet |
| [ ] Ocean Sample Player | engine.ts L1250-1280 | Sample buffer, loop, crossfade | None (deterministic loop) | Stereo |
| [ ] Algorithmic Reverb | [public/worklets/reverb.worklet.js](public/worklets/reverb.worklet.js) | 8-point FDN, 6 diffuser chains, predelay, modulation | None (deterministic) | Stereo worklet |

### 2.2 iOS Audio Sources ([KesshoiOS/Kessho/Audio/](KesshoiOS/Kessho/Audio/))
| Source | File | Parameters | RNG Usage | Output |
|--------|------|------------|-----------|--------|
| [ ] SynthVoice | [SynthVoice.swift](KesshoiOS/Kessho/Audio/SynthVoice.swift) | 4 oscillators, SVF filter, warmth/presence EQ, saturation | System random for air noise | Mono via AVAudioSourceNode |
| [ ] GranularProcessor | [GranularProcessor.swift](KesshoiOS/Kessho/Audio/GranularProcessor.swift) | density, spray, jitter, pitch modes, feedback | Pre-seeded sequence (10K) | Stereo via AVAudioSourceNode |
| [ ] LeadSynth | [LeadSynth.swift](KesshoiOS/Kessho/Audio/LeadSynth.swift) | 2 carriers + 4 modulators FM, ADSR, vibrato, glide, stereo delay | Per-note RNG for timbre/expression/delay | Stereo via AVAudioSourceNode |
| [ ] OceanSynth | [OceanSynth.swift](KesshoiOS/Kessho/Audio/OceanSynth.swift) | 2 wave generators, foam, depth layers | Internal mulberry32 PRNG | Stereo via AVAudioSourceNode |
| [ ] OceanSamplePlayer | [OceanSamplePlayer.swift](KesshoiOS/Kessho/Audio/OceanSamplePlayer.swift) | Sample buffer, loop playback | None | Stereo |
| [ ] ReverbProcessor | [ReverbProcessor.swift](KesshoiOS/Kessho/Audio/ReverbProcessor.swift) | 8-point FDN, 6 diffuser chains, quality modes | None (deterministic) | AVAudioUnitReverb + custom |

---

## 3. AUDIO PROCESSORS

### 3.1 Reverb Processor
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Engine type | AudioWorklet (reverb.worklet.js) | AVAudioUnitReverb + custom FDN | Functional match |
| [ ] FDN delay times | `[37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3]` ms | Same values in ReverbProcessor.swift | [ ] Verify |
| [ ] Diffuser stages | 6 pre, 4 mid, 6 post per channel | Same architecture | [ ] Verify |
| [ ] Quality modes | ultra/balanced/lite | Ultra (32 stages), Balanced (16), Lite (Apple) | [ ] Verify |
| [ ] Preset params (cathedral) | decay=0.96, damping=0.12, diffusion=0.95, size=1.5, mod=0.4 | Same values | [ ] Verify |

### 3.2 Filter Modulation
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Update interval | 100ms | 100ms | [ ] Match |
| [ ] Random walk momentum | velocity *= 0.92 | Same damping | [ ] Verify |
| [ ] Log interpolation | `exp(logMin + (logMax - logMin) * t)` | Same formula | [ ] Verify |
| [ ] Q boost at low cutoff | +4 when cutoff < 200Hz | Same logic | [ ] Verify |

### 3.3 Granular Processing
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Max grains | 64 (pool pre-allocated) | 64 | [ ] Match |
| [ ] Harmonic intervals | `[0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24]` | Same array | [ ] Verify |
| [ ] Pan lookup tables | 256 entries, cos/sin | Same tables | [ ] Verify |
| [ ] Hann window table | 1024 entries | Same | [ ] Verify |
| [ ] Pink noise generator | Paul Kellet's method | Same algorithm | [ ] Verify |

### 3.4 Lead Synth Delay
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Delay type | Stereo ping-pong | Stereo ping-pong | [ ] Match |
| [ ] Max delay time | 2 seconds | 2 seconds | [ ] Match |
| [ ] R channel offset | 0.75x L time | 0.75x L time | [ ] Match |
| [ ] Per-note randomization | Time, feedback, mix randomized | Same | [ ] Verify |

---

## 4. RNG USAGE POINTS

### 4.1 Seeded (Deterministic) RNG
| Location | Seed Material | Algorithm | Purpose |
|----------|---------------|-----------|---------|
| [ ] [src/audio/rng.ts](src/audio/rng.ts) L1-50 | xmur3 hash → mulberry32 | Deterministic PRNG | All musical decisions |
| [ ] [KesshoiOS/Kessho/Harmony/RNG.swift](KesshoiOS/Kessho/Harmony/RNG.swift) L1-50 | Same xmur3 → mulberry32 | Same algorithms | Must produce identical sequences |
| [ ] Granulator seed | `{bucket}|{seed}|granular` | 10,000 float sequence | Grain timing/pitch |
| [ ] Harmony decisions | `{bucket}|{sliderStateJson}|E_ROOT` | Per-phrase RNG | Scale/chord selection |
| [ ] Lead note scheduling | `{bucket}|{seed}|lead|{phraseIndex}` | Per-phrase RNG | Note timing/velocity |
| [ ] Euclidean notes | `{bucket}|{seed}|euclid|{phraseIndex}|{noteIndex}` | Per-note RNG | Timbre/expression/delay |
| [ ] CoF drift | `{bucket}|{seed}|cof` | Per-phrase RNG | Drift direction |

### 4.2 System Random (Non-deterministic)
| Location | Web | iOS | Purpose | Status |
|----------|-----|-----|---------|--------|
| [ ] Air noise | `Math.random()` in noise buffer | `Float.random(in:)` | Texture variation | ⚠️ Non-deterministic |
| [ ] Granular initial buffer | Uses seeded RNG | `Float.random(in:)` | Initial texture | ⚠️ iOS uses system random |
| [ ] Ocean wave timing | Internal mulberry32 | Internal mulberry32 | Wave intervals | [ ] Match |
| [ ] Dual slider walk phases | `Double.random(in:)` | `Double.random(in:)` | UI animation | Expected difference |

### 4.3 RNG Parity Verification
- [ ] Verify `xmur3("test")()` produces identical values on web and iOS
- [ ] Verify `mulberry32(12345)()` sequence matches
- [ ] Verify `createRng("2026-02-02T14")` produces same 100 values
- [ ] Test: Same bucket + state → same chord voicings

---

## 5. UI CONTROLS

### 5.1 Web UI Controls ([src/App.tsx](src/App.tsx))
| Panel | Controls | Location |
|-------|----------|----------|
| [ ] Transport | Play/Stop button, Auto-Morph toggle | L3000+ |
| [ ] Master Mixer | Volume, SynthLevel, GranularLevel, sends | Panel component |
| [ ] Global | SeedWindow picker, Randomness slider, RootNote selector | Panel |
| [ ] Circle of Fifths | CoF visualization, drift controls | [CircleOfFifths.tsx](src/ui/CircleOfFifths.tsx) |
| [ ] Harmony | ScaleMode picker, ManualScale picker, Tension slider | Panel |
| [ ] Synth Voicing | WaveSpread, Detune, ADSR, VoiceMask, Octave | Panel |
| [ ] Timbre | Hardness, OscBrightness, FilterType, Cutoff range, Q, Warmth, Presence, Air | Panel |
| [ ] Reverb | Engine, Type, Quality, Decay, Size, Diffusion, Mod, Predelay, Damping, Width | Panel |
| [ ] Granular | Enable, MaxGrains, Probability, GrainSize range, Density, Spray, Jitter, Mode, Spread, Feedback, Filters | Panel |
| [ ] Lead Synth | Enable, Level, ADSR, Delay range, Density, Octave, Timbre range, Vibrato range, Glide range | Panel |
| [ ] Euclidean | Master enable, Tempo, 4 lanes with presets/steps/hits/rotation/range/level | Collapsible |
| [ ] Ocean | Sample enable/level, Synth enable/level, Filter, Duration range, Interval range, Foam range, Depth range | Panel |
| [ ] Dual Sliders | Toggle to range mode, min/max thumbs, walk indicator | DualSlider component |
| [ ] Presets | Load/Save/Delete, Morph A/B slots, position slider | Preset panel |
| [ ] Snowflake | Visualization toggle | [SnowflakeUI.tsx](src/ui/SnowflakeUI.tsx) |

### 5.2 iOS UI Controls ([KesshoiOS/Kessho/Views/](KesshoiOS/Kessho/Views/))
| View | Controls | File |
|------|----------|------|
| [ ] MainView | Tab navigation, header, transport bar | [MainView.swift](KesshoiOS/Kessho/Views/MainView.swift) |
| [ ] TransportBar | Play/Stop, Auto-Morph, Scale info, Master volume | MainView.swift L84-140 |
| [ ] SnowflakeView | Visualization | SnowflakeView.swift |
| [ ] CircleOfFifthsView | CoF display, drift controls | [CircleOfFifthsView.swift](KesshoiOS/Kessho/Views/CircleOfFifthsView.swift) |
| [ ] SliderControlsView | All parameter sliders | [SliderControlsView.swift](KesshoiOS/Kessho/Views/SliderControlsView.swift) |
| [ ] SettingsView | Seed, Scale, CoF drift settings | MainView.swift L152-200 |
| [ ] PresetListView | Preset loading, saving | [PresetListView.swift](KesshoiOS/Kessho/Views/PresetListView.swift) |

### 5.3 Control Parity Checklist
- [ ] All numeric sliders have matching min/max/step on iOS
- [ ] All picker options match between platforms
- [ ] Dual slider mode implemented on iOS
- [ ] Random walk visualization on iOS sliders
- [ ] Morph position slider functional on iOS
- [ ] Euclidean preset picker matches web presets

---

## 6. INTER-SYSTEM DEPENDENCIES

### 6.1 Circle of Fifths ↔ Root Note ↔ Scale Selection
```
Web Flow:
1. sliderState.rootNote (0-11) = home key
2. cofConfig.currentStep (-6..6) = drift offset
3. calculateDriftedRoot(home, step) = effective root
4. Harmony uses effective root for scale note generation
5. Lead synth uses effective root for note selection

iOS Flow:
1. state.rootNote = home key
2. cofState.currentStep = drift offset  
3. calculateDriftedRoot(homeRoot:, stepOffset:) = effective root
4. harmonyState uses effective root
5. leadSynth uses effectiveRoot
```
- [ ] Verify `calculateDriftedRoot` produces identical results
- [ ] Verify CoF drift direction (cw/ccw/random) logic matches
- [ ] Verify bounce-back at range limits is identical

### 6.2 Morph System ↔ Preset State ↔ CoF Drift
```
Web Flow:
1. morphPresetA/B slots store SavedPreset
2. morphPosition (0-100) controls lerp
3. lerpPresets() interpolates all SliderState values
4. lerpDualRanges() handles single↔dual transitions
5. On morph complete: resetCofDrift()

iOS Flow:
1. morphPresetA/B in AppState
2. setMorphPosition() calls lerpPresets()
3. lerpDualRanges() with same logic
4. loadPreset() calls audioEngine.resetCofDrift()
```
- [ ] Verify lerp interpolation is identical (linear vs log for frequencies)
- [ ] Verify dual range expansion/contraction during morph
- [ ] Verify CoF reset timing

### 6.3 Phrase Boundaries ↔ Harmony Updates ↔ Note Scheduling
```
PHRASE_LENGTH = 16 seconds

Web Flow:
1. getTimeUntilNextPhrase() calculates delay
2. phraseTimer schedules onPhraseBoundary()
3. onPhraseBoundary():
   - updateCircleOfFifthsDrift()
   - updateHarmonyState()
   - applyChord() with crossfade
   - sendGranulatorRandomSequence()
   - scheduleLeadMelody() (pre-schedules all notes)

iOS Flow:
1. getTimeUntilNextPhrase() same calculation
2. phraseTimer → onPhraseBoundary()
3. Same sequence of operations
4. scheduleEuclideanPhrase() or scheduleRandomLeadPhrase()
```
- [ ] Verify phrase boundary calculation is identical
- [ ] Verify chord crossfade timing (0.5 * release before pitch change)
- [ ] Verify pre-scheduled note timing precision

### 6.4 Filter Modulation ↔ Random Walk ↔ Cutoff Min/Max
```
Web Flow (engine.ts):
1. filterModTimer runs every 100ms
2. Random acceleration: (Math.random() - 0.5) * speedFactor * 2
3. Velocity damping: *= 0.92
4. Position update with velocity
5. Log interpolation between filterCutoffMin and filterCutoffMax
6. Q boost when cutoff < 200Hz

iOS Flow (AudioEngine.swift):
1. Timer every 0.1 seconds
2. Same random acceleration formula
3. Same velocity damping
4. Same position update
5. Same log interpolation
6. Same Q boost logic
```
- [ ] Verify random walk produces similar (not identical) movement
- [ ] Verify log interpolation formula is identical
- [ ] Verify Q boost calculation

---

## 7. PRESET/STATE MANAGEMENT

### 7.1 Preset Format
```json
{
  "name": "Preset Name",
  "timestamp": "ISO8601 date string",
  "state": { /* SliderState */ },
  "dualRanges": { "paramKey": { "min": 0.3, "max": 0.7 } }  // optional
}
```
- [ ] iOS `SavedPreset` struct matches web format
- [ ] Legacy field handling (iOS has optionals for old fields)
- [ ] `dualRanges` serialization/deserialization

### 7.2 Morph A/B Slots
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Slot storage | `morphPresetA/B: SavedPreset \| null` | `morphPresetA/B: SavedPreset?` | Match |
| [ ] Position range | 0-100 | 0-100 | Match |
| [ ] Lerp function | `lerpPresets(a, b, t)` | `lerpPresets(_:_:t:)` | [ ] Verify logic |

### 7.3 Auto-Morph Cycle
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Phases | playingA → morphingToB → playingB → morphingToA | Same enum | Match |
| [ ] Play duration | `morphPlayPhrases` (default 16) | Same | Match |
| [ ] Transition duration | `morphTransitionPhrases` (default 8) | Same | Match |
| [ ] Timer interval | Per-phrase | Per-phrase | Match |

### 7.4 Dual Slider Modes
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Storage | `dualRanges: Record<string, DualRange>` | `dualRanges: [String: DualRange]` | Match |
| [ ] Toggle action | `toggleDualMode(key, currentValue, min, max)` | Same function | [ ] Verify |
| [ ] Initial spread | ±20% of range around current value | Same | [ ] Verify |
| [ ] Walk animation | Sine wave oscillation | Same | [ ] Verify |

---

## 8. TIMING/SCHEDULING

### 8.1 Phrase Length and Boundaries
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] PHRASE_LENGTH | 16 seconds | 16.0 seconds | Match |
| [ ] Boundary calculation | `ceil(now / 16) * 16` | Same | Match |
| [ ] Current phrase index | `floor(now / 16)` | Same | Match |

### 8.2 Note Scheduling Precision
| Aspect | Web | iOS | Status |
|--------|-----|-----|--------|
| [ ] Lead note scheduling | `setTimeout()` with ms precision | `DispatchQueue.asyncAfter()` | Similar precision |
| [ ] Euclidean scheduling | Pre-calculated at phrase start | Pre-calculated at phrase start | Match |
| [ ] Cancel on settings change | Clear timeout array | Cancel DispatchWorkItem array | Match |

### 8.3 Timer Intervals
| Timer | Web | iOS | Status |
|-------|-----|-----|--------|
| [ ] Phrase timer | `setTimeout()` to next boundary | `Timer.scheduledTimer()` | Match |
| [ ] Filter mod timer | 100ms `setInterval()` | 0.1s `Timer` | Match |
| [ ] Random walk timer | 100ms in App component | 0.1s in AppState | Match |
| [ ] Note event timer | 500ms for occasional retriggers | Same | [ ] Verify |

---

## 9. KNOWN DIFFERENCES & WARNINGS

### 9.1 Platform-Specific Features
- [ ] **Reverb Types**: iOS has 11 additional Apple reverb presets not on web
- [ ] **Seed Window**: iOS allows "minute" option, web only has "hour"/"day"
- [ ] **Background Audio**: iOS uses AVAudioSession, web uses MediaSession API
- [ ] **Worklets vs Native**: Web uses AudioWorklet, iOS uses AVAudioSourceNode

### 9.2 Potential Parity Issues
- [ ] **Air Noise RNG**: iOS uses system random, may affect texture consistency
- [ ] **Granular Initial Buffer**: iOS uses system random for pink noise fill
- [ ] **Float Precision**: Swift Double vs JavaScript number may cause drift
- [ ] **Timer Drift**: Native timers may have different jitter characteristics

### 9.3 Missing on iOS
- [ ] Convolution reverb engine (only algorithmic available)
- [ ] Snowflake worker thread (if applicable)
- [ ] URL state encoding/decoding
- [ ] Cloud preset sync (if Supabase integration)

### 9.4 Missing on Web
- [ ] "minute" seed window option
- [ ] iOS-only reverb presets (Apple factory)
- [ ] Legacy field compatibility
- [ ] Native limiter (uses DynamicsCompressor as limiter)

---

## 10. VERIFICATION TESTS

### 10.1 RNG Determinism Tests
- [ ] Same seed produces same first 1000 random values
- [ ] Same bucket + state produces same chord voicings
- [ ] Same phrase index produces same lead note schedule

### 10.2 Audio Parity Tests
- [ ] Same preset plays "similar" on both platforms
- [ ] Granular texture is comparable
- [ ] Reverb character is comparable
- [ ] Lead synth timbre range matches

### 10.3 State Serialization Tests
- [ ] Web-saved preset loads correctly on iOS
- [ ] iOS-saved preset loads correctly on web
- [ ] Dual ranges serialize/deserialize correctly
- [ ] Legacy presets upgrade gracefully

### 10.4 Timing Tests
- [ ] Phrase boundaries align across devices
- [ ] CoF drift timing matches
- [ ] Euclidean patterns hit at same relative times

---

## SUMMARY

**Total Checklist Items:** ~250

**Categories:**
1. Slider State Properties: ~100 properties
2. Audio Sources: 12 components
3. Audio Processors: 8 processors
4. RNG Usage Points: 15 locations
5. UI Controls: 25+ panels/views
6. Inter-System Dependencies: 4 major flows
7. Preset/State Management: 10 aspects
8. Timing/Scheduling: 8 timers

**Critical Paths to Verify:**
1. RNG algorithm parity (xmur3 + mulberry32)
2. Phrase boundary calculation
3. Circle of Fifths drift logic
4. Preset lerping during morph
5. Filter modulation random walk
6. Lead synth FM synthesis parameters
