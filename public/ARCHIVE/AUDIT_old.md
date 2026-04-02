# Kessho iOS/Web Parity Audit Checklist

This document provides a comprehensive checklist for auditing iOS/Web feature parity.
Use this document systematically when making changes to either platform.

---

## Table of Contents
1. [Slider State Properties](#1-slider-state-properties)
2. [Audio Sources](#2-audio-sources)
3. [Audio Processors](#3-audio-processors)
4. [RNG Usage Points](#4-rng-usage-points)
5. [UI Controls](#5-ui-controls)
6. [Inter-System Dependencies](#6-inter-system-dependencies)
7. [Preset & State Management](#7-preset--state-management)
8. [Timing & Scheduling](#8-timing--scheduling)

---

## 1. Slider State Properties

Reference files:
- Web: `src/ui/state.ts` (SliderState interface, QUANTIZATION object)
- iOS: `KesshoiOS/Kessho/State/SliderState.swift`

### 1.1 Master Mixer

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `masterVolume` | Float | 0 | 1 | 0.01 | 0.7 | ☐ |
| `synthLevel` | Float | 0 | 1 | 0.01 | 0.6 | ☐ |
| `granularLevel` | Float | 0 | 2 | 0.01 | 0.4 | ☐ |
| `synthReverbSend` | Float | 0 | 1 | 0.01 | 0.7 | ☐ |
| `granularReverbSend` | Float | 0 | 1 | 0.01 | 0.8 | ☐ |
| `leadReverbSend` | Float | 0 | 1 | 0.01 | 0.5 | ☐ |
| `leadDelayReverbSend` | Float | 0 | 1 | 0.01 | 0.4 | ☐ |
| `reverbLevel` | Float | 0 | 2 | 0.01 | 1.0 | ☐ |

### 1.2 Global Settings

| Property | Type | Values/Range | Default | iOS ✓ |
|----------|------|--------------|---------|-------|
| `seedWindow` | String | 'hour', 'day' | 'hour' | ☐ |
| `randomness` | Float | 0-1 | 0.5 | ☐ |
| `rootNote` | Int | 0-11 (C=0...B=11) | 4 (E) | ☐ |

### 1.3 Circle of Fifths Drift

| Property | Type | Values/Range | Default | iOS ✓ |
|----------|------|--------------|---------|-------|
| `cofDriftEnabled` | Bool | true/false | false | ☐ |
| `cofDriftRate` | Int | 1-8 phrases | 2 | ☐ |
| `cofDriftDirection` | String | 'cw', 'ccw', 'random' | 'cw' | ☐ |
| `cofDriftRange` | Int | 1-6 steps | 3 | ☐ |

### 1.4 Harmony

| Property | Type | Values/Range | Default | iOS ✓ |
|----------|------|--------------|---------|-------|
| `scaleMode` | String | 'auto', 'manual' | 'auto' | ☐ |
| `manualScale` | String | Scale family name | 'Major (Ionian)' | ☐ |
| `tension` | Float | 0-1 | 0.3 | ☐ |
| `chordRate` | Int | 8-64 bars | 32 | ☐ |
| `voicingSpread` | Float | 0-1 | 0.5 | ☐ |

### 1.5 Synth Pad

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `waveSpread` | Float | 0 | 30 | 0.5 | 4 | ☐ |
| `detune` | Float | 0 | 25 | 1 | 8 | ☐ |
| `synthAttack` | Float | 0.01 | 16 | 0.01 | 6.0 | ☐ |
| `synthDecay` | Float | 0.01 | 8 | 0.01 | 1.0 | ☐ |
| `synthSustain` | Float | 0 | 1 | 0.01 | 0.8 | ☐ |
| `synthRelease` | Float | 0.01 | 30 | 0.01 | 12.0 | ☐ |
| `synthVoiceMask` | Int | 1 | 63 | 1 | 63 | ☐ |
| `synthOctave` | Int | -2 | 2 | 1 | 0 | ☐ |

### 1.6 Timbre

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `hardness` | Float | 0 | 1 | 0.01 | 0.3 | ☐ |
| `oscBrightness` | Int | 0 | 3 | 1 | 2 | ☐ |
| `filterType` | String | lowpass/band/high/notch | 'lowpass' | ☐ |
| `filterCutoffMin` | Float | 40 | 8000 | 10 | 400 | ☐ |
| `filterCutoffMax` | Float | 40 | 8000 | 10 | 3000 | ☐ |
| `filterModSpeed` | Float | 0 | 16 | 0.5 | 2 | ☐ |
| `filterResonance` | Float | 0 | 1 | 0.01 | 0.2 | ☐ |
| `filterQ` | Float | 0.1 | 12 | 0.1 | 1.0 | ☐ |
| `warmth` | Float | 0 | 1 | 0.01 | 0.4 | ☐ |
| `presence` | Float | 0 | 1 | 0.01 | 0.3 | ☐ |
| `airNoise` | Float | 0 | 1 | 0.01 | 0.15 | ☐ |

### 1.7 Reverb

| Property | Type | Values/Range | Default | iOS ✓ |
|----------|------|--------------|---------|-------|
| `reverbEngine` | String | 'algorithmic', 'convolution' | 'algorithmic' | ☐ |
| `reverbType` | String | 'plate', 'hall', 'cathedral', 'darkHall' | 'cathedral' | ☐ |
| `reverbDecay` | Float | 0-1 | 0.9 | ☐ |
| `reverbSize` | Float | 0.5-3 | 2.0 | ☐ |
| `reverbDiffusion` | Float | 0-1 | 1.0 | ☐ |
| `reverbModulation` | Float | 0-1 | 0.4 | ☐ |
| `predelay` | Float | 0-100 | 60 | ☐ |
| `damping` | Float | 0-1 | 0.2 | ☐ |
| `width` | Float | 0-1 | 0.85 | ☐ |

### 1.8 Granular

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `granularEnabled` | Bool | - | - | - | true | ☐ |
| `grainProbability` | Float | 0 | 1 | 0.01 | 0.8 | ☐ |
| `maxGrains` | Int | 0 | 128 | 1 | 64 | ☐ |
| `grainSizeMin` | Int | 5 | 60 | 1 | 20 | ☐ |
| `grainSizeMax` | Int | 20 | 200 | 1 | 80 | ☐ |
| `density` | Int | 5 | 80 | 1 | 25 | ☐ |
| `spray` | Int | 0 | 600 | 5 | 200 | ☐ |
| `jitter` | Int | 0 | 30 | 1 | 10 | ☐ |
| `pitchSpread` | Int | 0 | 12 | 1 | 3 | ☐ |
| `stereoSpread` | Float | 0 | 1 | 0.01 | 0.6 | ☐ |
| `feedback` | Float | 0 | 0.35 | 0.01 | 0.1 | ☐ |
| `wetHPF` | Float | 200 | 3000 | 50 | 500 | ☐ |
| `wetLPF` | Float | 3000 | 12000 | 200 | 8000 | ☐ |
| `grainPitchMode` | String | 'random', 'harmonic' | 'harmonic' | ☐ |

### 1.9 Lead Synth

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `leadEnabled` | Bool | - | - | - | false | ☐ |
| `leadLevel` | Float | 0 | 1 | 0.01 | 0.4 | ☐ |
| `leadAttack` | Float | 0.001 | 2 | 0.001 | 0.01 | ☐ |
| `leadDecay` | Float | 0.01 | 4 | 0.01 | 0.8 | ☐ |
| `leadSustain` | Float | 0 | 1 | 0.01 | 0.3 | ☐ |
| `leadRelease` | Float | 0.01 | 8 | 0.01 | 2.0 | ☐ |
| `leadDensity` | Float | 0.1 | 12 | 0.1 | 0.5 | ☐ |
| `leadOctave` | Int | -1 | 2 | 1 | 1 | ☐ |
| `leadOctaveRange` | Int | 1 | 4 | 1 | 2 | ☐ |

### 1.10 Lead Expression (Min/Max Ranges)

| Property | Min | Max | Step | Default Min | Default Max | iOS ✓ |
|----------|-----|-----|------|-------------|-------------|-------|
| `leadDelayTime` | 0 | 1000 | 10 | 375 | 375 | ☐ |
| `leadDelayFeedback` | 0 | 0.8 | 0.01 | 0.4 | 0.4 | ☐ |
| `leadDelayMix` | 0 | 1 | 0.01 | 0.35 | 0.35 | ☐ |
| `leadTimbre` | 0 | 1 | 0.01 | 0.2 | 0.6 | ☐ |
| `leadVibratoDepth` | 0 | 1 | 0.01 | 0 | 0 | ☐ |
| `leadVibratoRate` | 0 | 1 | 0.01 | 0 | 0 | ☐ |
| `leadGlide` | 0 | 1 | 0.01 | 0 | 0 | ☐ |

### 1.11 Euclidean Sequencer

| Property | Type | Min | Max | Default | iOS ✓ |
|----------|------|-----|-----|---------|-------|
| `synthEuclideanMasterEnabled` | Bool | - | - | false | ☐ |
| `synthEuclideanTempo` | Float | 0.25 | 12 | 1 | ☐ |

**Per Lane (lanes 1-4):**

| Property | Type | Min | Max | Default (L1) | iOS ✓ |
|----------|------|-----|-----|--------------|-------|
| `synthEuclid[N]Enabled` | Bool | - | - | L1: true, L2-4: false | ☐ |
| `synthEuclid[N]Preset` | String | - | - | L1: 'lancaran', L2: 'kotekan', etc | ☐ |
| `synthEuclid[N]Steps` | Int | 4 | 32 | L1: 16 | ☐ |
| `synthEuclid[N]Hits` | Int | 1 | 16 | L1: 4 | ☐ |
| `synthEuclid[N]Rotation` | Int | 0 | 31 | L1: 0 | ☐ |
| `synthEuclid[N]NoteMin` | Int | 36 | 96 | L1: 64 | ☐ |
| `synthEuclid[N]NoteMax` | Int | 36 | 96 | L1: 76 | ☐ |
| `synthEuclid[N]Level` | Float | 0 | 1 | L1: 0.8 | ☐ |

### 1.12 Ocean Waves

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `oceanSampleEnabled` | Bool | - | - | - | false | ☐ |
| `oceanSampleLevel` | Float | 0 | 1 | 0.01 | 0.5 | ☐ |
| `oceanWaveSynthEnabled` | Bool | - | - | - | false | ☐ |
| `oceanWaveSynthLevel` | Float | 0 | 1 | 0.01 | 0.4 | ☐ |
| `oceanFilterType` | String | - | - | - | 'lowpass' | ☐ |
| `oceanFilterCutoff` | Float | 40 | 12000 | 10 | 8000 | ☐ |
| `oceanFilterResonance` | Float | 0 | 1 | 0.01 | 0.1 | ☐ |
| `oceanDurationMin` | Float | 2 | 15 | 0.5 | 4 | ☐ |
| `oceanDurationMax` | Float | 2 | 15 | 0.5 | 10 | ☐ |
| `oceanIntervalMin` | Float | 3 | 20 | 0.5 | 5 | ☐ |
| `oceanIntervalMax` | Float | 3 | 20 | 0.5 | 12 | ☐ |
| `oceanFoamMin` | Float | 0 | 1 | 0.01 | 0.2 | ☐ |
| `oceanFoamMax` | Float | 0 | 1 | 0.01 | 0.5 | ☐ |
| `oceanDepthMin` | Float | 0 | 1 | 0.01 | 0.3 | ☐ |
| `oceanDepthMax` | Float | 0 | 1 | 0.01 | 0.7 | ☐ |

### 1.13 Random Walk

| Property | Type | Min | Max | Step | Default | iOS ✓ |
|----------|------|-----|-----|------|---------|-------|
| `randomWalkSpeed` | Float | 0.1 | 5 | 0.1 | 1.0 | ☐ |

---

## 2. Audio Sources

### 2.1 Synth Pad Voices

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Voice count | 6 polyphonic | - | ☐ |
| Oscillator types | sine, triangle, 2x saw | - | ☐ |
| Noise generator | White noise (optional) | - | ☐ |
| Filter per voice | BiquadFilter | - | ☐ |
| Warmth filter | Low shelf | - | ☐ |
| Presence filter | Peaking EQ | - | ☐ |
| Saturation | WaveShaper | - | ☐ |
| Voice masking | Binary mask (1-63) | - | ☐ |
| Octave offset | -2 to +2 | - | ☐ |

### 2.2 Lead Synth

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Timbre control | Bell/Rhodes blend | - | ☐ |
| Vibrato | Depth + Rate | - | ☐ |
| Glide | Portamento | - | ☐ |
| Ping-pong delay | L/R stereo | - | ☐ |
| Euclidean sequencer | 4 lanes | - | ☐ |
| Note scheduling | Deterministic RNG | - | ☐ |

### 2.3 Granular Processor

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Max grains | 0-128 | - | ☐ |
| Grain size range | 5-200ms | - | ☐ |
| Spray/Jitter | Random position scatter | - | ☐ |
| Pitch modes | Random / Harmonic | - | ☐ |
| Feedback | 0-0.35 | - | ☐ |
| Deterministic RNG | Pre-seeded sequence | - | ☐ |

### 2.4 Ocean Synth

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Wave duration | Min/Max range | Min/Max methods | ☐ |
| Wave interval | Min/Max range | Min/Max methods | ☐ |
| Foam intensity | Min/Max range | Min/Max methods | ☐ |
| Depth parameter | Min/Max range | Min/Max methods | ☐ |
| Filter | Shared lowpass | - | ☐ |

### 2.5 Ocean Sample Player

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Sample loading | Async buffer | - | ☐ |
| Looping | Seamless loop | - | ☐ |
| Level control | Gain node | - | ☐ |

---

## 3. Audio Processors

### 3.1 Reverb (Algorithmic / FDN)

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Engine type toggle | algorithmic/convolution | - | ☐ |
| Presets | plate, hall, cathedral, darkHall | + iOS-only types | ☐ |
| Decay | 0-1 | - | ☐ |
| Size | 0.5-3 | - | ☐ |
| Diffusion | 0-1 | - | ☐ |
| Modulation | 0-1 | - | ☐ |
| Predelay | 0-100ms | - | ☐ |
| Damping | 0-1 | - | ☐ |
| Width | 0-1 (stereo) | - | ☐ |

### 3.2 Filter (Per Voice)

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Type | lowpass/bandpass/highpass/notch | - | ☐ |
| Cutoff range | Min/Max with modulation | - | ☐ |
| Mod speed | 0-16 Hz | - | ☐ |
| Resonance | 0-1 | - | ☐ |
| Q | 0.1-12 | - | ☐ |
| Random walk modulation | System random (intentional) | System random | ☐ |

### 3.3 Ping-Pong Delay (Lead)

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Time range | Min/Max per note | - | ☐ |
| Feedback range | Min/Max per note | - | ☐ |
| Mix range | Min/Max per note | - | ☐ |
| Stereo separation | L/R channels | - | ☐ |

### 3.4 Granular Worklet

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Worklet-based | AudioWorkletProcessor | AVAudioSourceNode | ☐ |
| HPF on wet | 200-3000 Hz | - | ☐ |
| LPF on wet | 3000-12000 Hz | - | ☐ |
| Deterministic grains | Pre-seeded RNG | Pre-seeded sequence | ☐ |

---

## 4. RNG Usage Points

### 4.1 Seeded RNG (Deterministic)

These MUST use seeded random for reproducibility:

| Usage | Seed Source | Web Function | iOS Function | Parity ✓ |
|-------|-------------|--------------|--------------|----------|
| Phrase selection | UTC bucket + state hash | `createRng()` | `Mulberry32` | ☐ |
| Chord generation | Phrase seed | `rngFloat()` | `rngFloat()` | ☐ |
| Lead note scheduling | Lead-specific seed | `createRng('lead')` | `Mulberry32` | ☐ |
| Granular processor | Per-phrase sequence | `generateRandomSequence()` | `setRandomSequence()` | ☐ |
| Euclidean lane notes | Lane seed | `createRng('euclidN')` | - | ☐ |

### 4.2 System RNG (Continuous Evolution)

These intentionally use system random for organic variation:

| Usage | Purpose | Web | iOS | Parity ✓ |
|-------|---------|-----|-----|----------|
| Filter modulation | Random walk for cutoff | `Math.random()` | `Float.random()` | ☐ |
| Ocean wave timing | Natural variation | `Math.random()` | `Float.random()` | ☐ |
| Lead expression per-note | Vibrato/glide variation | Seeded range | Seeded range | ☐ |

### 4.3 Seed Computation

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| UTC bucket | `getUtcBucket(window)` | `getUtcBucket(window)` | ☐ |
| State hash | `xmur3(stateJson)` | `xmur3(stateJson)` | ☐ |
| Combined seed | `xmur3(bucket + stateHash)` | Same formula | ☐ |
| Per-purpose suffix | `createRng('lead')`, etc. | Same pattern | ☐ |

---

## 5. UI Controls

### 5.1 Main Controls

| Control | Web Component | iOS Component | Parity ✓ |
|---------|--------------|---------------|----------|
| Master Volume | Slider | Slider | ☐ |
| Play/Stop | Button | Button | ☐ |
| Seed Lock | Toggle | Toggle | ☐ |
| Dice (Randomize) | Button | Button | ☐ |

### 5.2 Circle of Fifths

| Control | Web Component | iOS Component | Parity ✓ |
|---------|--------------|---------------|----------|
| Interactive wheel | `CircleOfFifths.tsx` | `CircleOfFifthsView` | ☐ |
| Root note selection | Click segment | Tap segment | ☐ |
| Drift enabled toggle | Checkbox | Toggle | ☐ |
| Drift rate slider | Slider | Slider | ☐ |
| Drift direction | Radio buttons | Picker | ☐ |
| Drift range slider | Slider | Slider | ☐ |
| Current step indicator | Visual highlight | Visual highlight | ☐ |

### 5.3 Harmony Controls

| Control | Web Component | iOS Component | Parity ✓ |
|---------|--------------|---------------|----------|
| Root Note picker | CircleOfFifths | Picker (C-B) | ☐ |
| Scale Mode | Radio (Auto/Manual) | Picker | ☐ |
| Scale Family | Dropdown | Picker | ☐ |
| Tension slider | Slider | Slider | ☐ |
| Chord Rate slider | Slider | Slider | ☐ |
| Voicing Spread slider | Slider | Slider | ☐ |

### 5.4 Preset System

| Control | Web Component | iOS Component | Parity ✓ |
|---------|--------------|---------------|----------|
| Preset list | Dropdown/List | List view | ☐ |
| Load preset | Button | Tap row | ☐ |
| Save preset | Button | Button | ☐ |
| Delete preset | Button | Swipe delete | ☐ |
| Share (URL) | Button | Share sheet | ☐ |
| Preset groups | Factory/User | Factory/User | ☐ |

### 5.5 Morph System

| Control | Web Component | iOS Component | Parity ✓ |
|---------|--------------|---------------|----------|
| Morph slider | 0-100% | 0-100% | ☐ |
| Manual/Auto toggle | Toggle | Segmented control | ☐ |
| Play phrases (A/B) | Slider (4-64) | Slider (4-64) | ☐ |
| Transition phrases | Slider (2-32) | Slider (2-32) | ☐ |
| Phase indicator | Text/Visual | Phase + countdown | ☐ |
| Auto-cycle state | Phase enum | `AutoMorphPhase` | ☐ |

---

## 6. Inter-System Dependencies

### 6.1 Circle of Fifths ↔ Root Note

| Dependency | Description | Web | iOS | Parity ✓ |
|------------|-------------|-----|-----|----------|
| CoF → rootNote | Clicking CoF updates rootNote | ✓ | - | ☐ |
| rootNote → CoF | rootNote slider updates CoF highlight | ✓ | - | ☐ |
| CoF drift → effectiveRoot | Drift modifies effective root | ✓ | - | ☐ |
| rootNote picker | Alternative to CoF for root selection | - | Picker | ☐ |

### 6.2 Scale System

| Dependency | Description | Web | iOS | Parity ✓ |
|------------|-------------|-----|-----|----------|
| scaleMode='auto' | Tension controls scale selection | ✓ | - | ☐ |
| scaleMode='manual' | manualScale directly used | ✓ | - | ☐ |
| Scale → Harmony | Scale notes determine chord pool | ✓ | - | ☐ |
| Scale → Lead | Lead notes constrained to scale | ✓ | - | ☐ |
| Scale → Granular | Harmonic mode uses scale | ✓ | - | ☐ |

### 6.3 Morph System Dependencies

| Dependency | Description | Web | iOS | Parity ✓ |
|------------|-------------|-----|-----|----------|
| Morph → Seed lock | Morphing locks seed | ✓ | - | ☐ |
| Morph → State interpolation | All params interpolated | ✓ | - | ☐ |
| Morph → CoF reset | Morph complete resets CoF step | ✓ | - | ☐ |
| Auto-cycle → Phase tracking | playingA/morphToB/playingB/morphToA | ✓ | ✓ | ☐ |
| Phrase boundary → Phase transition | Transitions happen at phrase end | ✓ | - | ☐ |

### 6.4 Phrase System Dependencies

| Dependency | Description | Web | iOS | Parity ✓ |
|------------|-------------|-----|-----|----------|
| PHRASE_LENGTH | 16 seconds | ✓ | ✓ | ☐ |
| Phrase → Chord | Chords update at phrase boundaries | ✓ | - | ☐ |
| Phrase → CoF drift | Drift ticks at phrase boundaries | ✓ | - | ☐ |
| Phrase → Lead scheduling | Lead reseeds per phrase | ✓ | - | ☐ |
| Phrase → Granular reseed | Granular RNG reseeds per phrase | ✓ | - | ☐ |
| Phrase → Morph phase | Auto-morph counts phrases | ✓ | - | ☐ |

---

## 7. Preset & State Management

### 7.1 State Serialization

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| JSON serialization | `serializeState()` | `Codable` | ☐ |
| URL encoding | `encodeStateToUrl()` | URL encoding | ☐ |
| URL decoding | `decodeStateFromUrl()` | URL parsing | ☐ |
| iOS-only reverb mapping | Maps to web types | Accepts iOS types | ☐ |

### 7.2 Preset File Format

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Format | JSON | JSON | ☐ |
| Version field | Optional | Optional | ☐ |
| Name field | Required | Required | ☐ |
| State object | Full SliderState | Full SliderState | ☐ |
| Factory presets | `public/presets/` | Bundled | ☐ |
| User presets | LocalStorage | App Documents | ☐ |

### 7.3 State Quantization

| Feature | Web Implementation | iOS Implementation | Parity ✓ |
|---------|-------------------|-------------------|----------|
| Quantization table | `QUANTIZATION` object | Swift equivalent | ☐ |
| `quantize()` function | Step-based rounding | Same logic | ☐ |
| `quantizeState()` | Full state quantization | Same logic | ☐ |

---

## 8. Timing & Scheduling

### 8.1 Phrase Timing

| Constant | Value | Purpose | iOS ✓ |
|----------|-------|---------|-------|
| PHRASE_LENGTH | 16 seconds | Duration of one phrase | ☐ |
| Bars per phrase | 4 | Musical structure | ☐ |
| Beats per bar | 4 | Musical structure | ☐ |
| Seconds per beat | 1 | Tempo (60 BPM) | ☐ |

### 8.2 Lead Euclidean Timing

| Constant | Calculation | Purpose | iOS ✓ |
|----------|-------------|---------|-------|
| Step duration | PHRASE_LENGTH / tempo / steps | Per-step timing | ☐ |
| Lane independence | 4 concurrent lanes | Polyrhythm | ☐ |

### 8.3 Scheduled Events

| Event | Trigger | Web Implementation | iOS Implementation | Parity ✓ |
|-------|---------|-------------------|-------------------|----------|
| Phrase update | Every 16s | `setTimeout` | Timer | ☐ |
| Chord change | chordRate bars | Within phrase handler | - | ☐ |
| Lead note | Euclidean pattern | `setTimeout` | Timer | ☐ |
| Filter mod | 60Hz | `setInterval` | Timer | ☐ |
| CoF drift | driftRate phrases | Phrase counter | - | ☐ |
| Morph auto-cycle | Phrase boundaries | Phrase handler | Timer | ☐ |

---

## Audit Procedure

### Before Making Changes

1. **Identify affected systems**: Which sliders, audio sources, or inter-dependencies are affected?
2. **Check both platforms**: Read relevant code in both web and iOS
3. **Note current behavior**: Document what currently exists

### During Implementation

4. **Match ranges exactly**: Use QUANTIZATION values from web as source of truth
5. **Match RNG usage**: Ensure seeded vs system random is consistent
6. **Match timing**: Use same constants (PHRASE_LENGTH, etc.)
7. **Test UI controls**: Ensure all exposed parameters have matching UI

### After Implementation

8. **Cross-reference this checklist**: Mark off verified items
9. **Test with same seed**: Verify deterministic behavior matches
10. **Test morph/preset**: Load same preset on both platforms

---

## 9. Known Issues & Discrepancies

### 9.1 Critical Parity Issues (Must Fix)

| Issue | File | Line | Description | Status |
|-------|------|------|-------------|--------|
| ~~Harmonic pitchSpread ignored~~ | ~~GranularProcessor.swift~~ | ~~~285~~ | ~~iOS ignores `pitchSpread` in harmonic mode~~ Fixed: Now limits intervals by `(pitchSpread/12) * intervals.length` | ☑ FIXED |
| ~~Ocean RNG not seeded~~ | ~~OceanSynth.swift~~ | ~~95~~ | ~~iOS uses `Float.random()`~~ Fixed: Added `setSeed()` with `mulberry32` RNG, called from AudioEngine with `currentSeed` | ☑ FIXED |
| ~~`.eco` quality undefined~~ | ~~ReverbProcessor.swift~~ | ~~295,357,462,501,537~~ | ~~Code uses `.eco` but enum only has `.lite` - compile error~~ | ✅ FIXED |
| ~~`rngState` never declared~~ | ~~OceanSynth.swift~~ | ~~281~~ | ~~`setSeed()` references `self.rngState` but property doesn't exist~~ | ✅ FIXED |
| ~~Feedback lacks soft-clip~~ | ~~GranularProcessor.swift~~ | ~~~235~~ | ~~iOS uses raw `feedback * mono`~~ Fixed: Now uses `tanh(feedbackMono * feedback)` saturation | ☑ FIXED |
| ~~Jitter applied differently~~ | ~~GranularProcessor.swift~~ | ~~~180~~ | ~~iOS applies jitter as amplitude~~ Fixed: Now applies jitter as position offset | ☑ FIXED |

### 9.2 Medium Parity Issues (Should Fix)

| Issue | File | Line | Description | Status |
|-------|------|------|-------------|--------|
| LeadSynth sustain zero-duration | LeadSynth.swift | 234-235 | ~~Sustain stage immediately transitions to release.~~ Fixed: added `hold` property with countdown timer. Both platforms now use configurable `leadHold` parameter (default 0.5s) | ☑ FIXED |
| ~~Reverb decay ignores preset~~ | ~~ReverbProcessor.swift~~ | ~~339~~ | ~~iOS: `0.85 + decay * 0.14`~~ Fixed: Added `baseDecay`/`userDecay` separation with web formula `baseDecay + (1-baseDecay) * userDecay * 0.9` | ☑ FIXED |
| Lite mode uses AVAudioUnitReverb | ReverbProcessor.swift | - | **INTENTIONAL**: Lite mode uses Apple's built-in reverb for battery efficiency. Web uses custom FDN; iOS Ultra/Balanced modes use matching FDN. | ☐ WON'T FIX |

### 9.3 Dead/Unused Code (Should Remove)

| Code | File | Line | Type | Priority |
|------|------|------|------|----------|
| ~~`pitchVariation` property~~ | ~~GranularProcessor.swift~~ | ~~51~~ | ~~Unused property~~ | ✅ REMOVED |
| ~~`positionSpread` property~~ | ~~GranularProcessor.swift~~ | ~~52~~ | ~~Unused property~~ | ✅ REMOVED |
| ~~`onEuclideanTick()`~~ | ~~AudioEngine.swift~~ | ~~872~~ | ~~Empty legacy method~~ | ✅ REMOVED |
| ~~`tick()` methods~~ | ~~EuclideanRhythm.swift~~ | ~~187,226~~ | ~~Replaced by pre-scheduling~~ | ✅ REMOVED |
| ~~`updateFromState()`~~ | ~~EuclideanRhythm.swift~~ | ~~136~~ | ~~Never called~~ | ✅ REMOVED |
| ~~`updateCircleOfFifthsDrift()`~~ | ~~Harmony.swift~~ | ~~58~~ | ~~Duplicate of class method~~ | ✅ REMOVED |
| ~~`getCurrentPhraseBoundary()`~~ | ~~Harmony.swift~~ | ~~109~~ | ~~Never called~~ | ✅ REMOVED |
| ~~`shortestPath()`~~ | ~~CircleOfFifths.swift~~ | ~~109~~ | ~~Never called~~ | ✅ REMOVED |
| ~~`cofPositionToAngle()`~~ | ~~CircleOfFifths.swift~~ | ~~139~~ | ~~Never called~~ | ✅ REMOVED |
| ~~`semitoneToNoteName()`~~ | ~~CircleOfFifths.swift~~ | ~~144~~ | ~~Never called~~ | ✅ REMOVED |
| ~~Backwards compat methods~~ | ~~OceanSynth.swift~~ | ~~290-299~~ | ~~6 unused methods~~ | ✅ REMOVED |
| ~~`envelope2` property~~ | ~~LeadSynth.swift~~ | ~~23~~ | ~~Never read~~ | ✅ REMOVED |
| ~~`octaveShift`/`octaveRange`~~ | ~~LeadSynth.swift~~ | - | ~~Set but never read~~ | ✅ REMOVED |
| ~~Duplicate `ReverbPreset` enum~~ | ~~ReverbProcessor.swift~~ | ~~163-175~~ | ~~Redundant with `ReverbType`~~ Renamed to `FDNPresetConfig` for clarity | ✅ RENAMED |

### 9.4 Performance Issues (Audio Thread Safety)

| Issue | File | Severity | Description | Fix |
|-------|------|----------|-------------|-----|
| ~~Array mutation in audio~~ | ~~GranularProcessor.swift~~ | ~~🔴 HIGH~~ | ~~`grains.append()` / `remove(at:)` allocates memory~~ | ✅ FIXED: Pool-based allocation |
| ~~Array allocation in callback~~ | ~~AudioEngine.swift~~ | ~~🔴 HIGH~~ | ~~Creates `[Float]` array every ~100ms in tap~~ | ✅ FIXED: Pre-allocated buffer |
| ~~Float.random() on audio thread~~ | ~~SynthVoice.swift~~ | ~~🔴 HIGH~~ | ~~System random may lock~~ | ✅ FIXED: Inline LCG PRNG |
| ~~Struct copying in loop~~ | ~~GranularProcessor.swift~~ | ~~🟡 MED~~ | ~~Copies Grain struct per sample per grain~~ | ✅ FIXED: `withUnsafeMutableBufferPointer` |
| ~~Redundant filter calc~~ | ~~SynthVoice.swift~~ | ~~🟡 MED~~ | ~~Computes coefficients every sample~~ | ✅ FIXED: Cached when params change |
| ~~Timer on main thread~~ | ~~AudioEngine.swift~~ | ~~🟡 MED~~ | ~~Note scheduling jitter from UI blocking~~ | ✅ FIXED: Dedicated `DispatchSourceTimer` queue |
| ~~Multiple sin() calls~~ | ~~LeadSynth.swift~~ | ~~🟡 MED~~ | ~~6 sin() calls per sample~~ | ✅ FIXED: Sine lookup table |
| ~~Division per sample~~ | ~~All synths~~ | ~~🟢 LOW~~ | ~~`freq / sampleRate` computed per sample~~ | ✅ FIXED: Pre-computed `invSampleRate` |

---

## 10. Comprehensive Parity Audit (February 2026)

### 10.1 SynthVoice Parity

| Feature | Web | iOS | Status |
|---------|-----|-----|--------|
| 4 oscillators (sine/tri/saw/saw) | ✓ | ✓ | ✅ Match |
| Oscillator mix by brightness | ✓ | ✓ | ✅ Match |
| Detune calculation (cents→ratio) | ✓ | ✓ | ✅ Match |
| Filter (BiquadFilter vs SVF) | BiquadFilter | Custom SVF | ⚠️ Different impl |
| Warmth (low shelf) | Low shelf 250Hz | 1-pole approx | ⚠️ Minor |
| Presence (peaking EQ) | Peaking 3kHz | Bandpass approx | ⚠️ Minor |
| Saturation (tanh) | ✓ | ✓ | ✅ Match |
| Oversample on saturation | 2x | None | ⚠️ Minor aliasing |
| ~~Envelope attack~~ | ~~Exponential~~ | ~~Linear~~ | ✅ FIXED: Exponential |
| Air noise | Pre-computed buffer | Inline LCG | ⚠️ Minor |

### 10.2 GranularProcessor Parity

| Feature | Web | iOS | Status |
|---------|-----|-----|--------|
| Grain pool allocation | ✓ | ✓ | ✅ Match |
| Density/probability | ✓ | ✓ | ✅ Match |
| Pitch modes (random/harmonic) | ✓ | ✓ | ✅ Match |
| pitchSpread limits intervals | ✓ | ✓ | ✅ Match |
| Hann window lookup | ✓ | ✓ | ✅ Match |
| Pan lookup table | ✓ | ✓ | ✅ Match |
| tanh feedback saturation | ✓ | ✓ | ✅ Match |
| Pre-seeded RNG | ✓ | ✓ | ✅ Match |
| ~~**Spray**~~ | ~~Position offset~~ | ~~**Timing offset**~~ | ✅ FIXED: Position offset |
| ~~**Jitter**~~ | ~~One-time at spawn~~ | ~~**Per-sample recalc**~~ | ✅ FIXED: One-time at spawn |
| ~~**Feedback architecture**~~ | ~~Into input buffer~~ | ~~**Separate buffer**~~ | ✅ FIXED: Into same buffer |
| Wet HPF/LPF | None | Has filters | ⚠️ Minor (extra) |

### 10.3 LeadSynth Parity

| Feature | Web | iOS | Status |
|---------|-----|-----|--------|
| FM architecture (2 carriers, 4 mods) | ✓ | ✓ | ✅ Match |
| FM ratios by timbre | ✓ | ✓ | ✅ Match |
| FM modulation indices | ✓ | ✓ | ✅ Match |
| Carrier 2 gamelan shimmer | ✓ | ✓ | ✅ Match |
| Ping-pong delay | ✓ | ✓ | ✅ Match |
| Output level (0.6) | ✓ | ✓ | ✅ Match |
| Vibrato scaling | 0-0.5 semitones, 2-8Hz | 0.05-0.15 st, 4-6Hz | ⚠️ Minor |
| Glide curve | Scheduled ramp | Per-sample smooth | ⚠️ Minor |
| ~~ADSR attack shortening by timbre~~ | ~~Yes~~ | ~~**Missing**~~ | ✅ FIXED |
| Per-note randomization | Auto in playNote | Requires explicit call | ⚠️ Minor |

### 10.4 ReverbProcessor Parity

| Feature | Web | iOS | Status |
|---------|-----|-----|--------|
| 8-ch FDN with Hadamard | ✓ | ✓ | ✅ Match |
| FDN delay times | ✓ | ✓ | ✅ Match |
| Diffuser chains (pre/mid/post) | ✓ | ✓ | ✅ Match |
| Diffuser times | ✓ | ✓ | ✅ Match |
| Modulation phases/rates | ✓ | ✓ | ✅ Match |
| Damping (OnePole) | ✓ | ✓ | ✅ Match |
| DC blocker | ✓ | ✓ | ✅ Match |
| Soft clip | ✓ | ✓ | ✅ Match |
| Presets (plate/hall/cathedral/darkHall) | ✓ | ✓ | ✅ Match |
| Decay formula | `base + (1-base)*user*0.9` | ✓ | ✅ Match |
| Max decay clamp | 0.995 | 0.998 | ⚠️ Minor |
| Predelay max | 300ms | 500ms | ⚠️ Minor |
| Stereo tap weights | Uniform | Graduated | ⚠️ Minor |
| Diffuser stage control | Always all | By quality mode | ⚠️ Minor |
| **Lite mode** | 4-ch FDN | **AVAudioUnitReverb** | ⚠️ Intentional |

### 10.5 OceanSynth Parity

| Feature | Web | iOS | Status |
|---------|-----|-----|--------|
| 2 wave generators | ✓ | ✓ | ✅ Match |
| Wave envelope shape | ✓ | ✓ | ✅ Match |
| Foam envelope | ✓ | ✓ | ✅ Match |
| Duration/interval ranges | ✓ | ✓ | ✅ Match |
| Pan offset | ✓ | ✓ | ✅ Match |
| Noise filtering (LPF coeffs) | ✓ | ✓ | ✅ Match |
| Rumble layer | ✓ | ✓ | ✅ Match |
| Master HPF/LPF | ✓ | ✓ | ✅ Match |
| tanh soft clip | ✓ | ✓ | ✅ Match |
| RNG default seed | Always 12345 | Falls back to system | ⚠️ Minor |

### 10.6 Harmony/Scales Parity

| Feature | Web | iOS | Status |
|---------|-----|-----|--------|
| 11 scales with intervals | ✓ | ✓ | ✅ Match |
| Tension values | ✓ | ✓ | ✅ Match |
| Tension bands | ✓ | ✓ | ✅ Match |
| Weighting formula | `1/(d+0.05)^1.5` | ✓ | ✅ Match |
| Chord generation | ✓ | ✓ | ✅ Match |
| Voicing spread | ✓ | ✓ | ✅ Match |
| Root note handling | ✓ | ✓ | ✅ Match |
| Circle of Fifths semitones | ✓ | ✓ | ✅ Match |
| CoF drift logic | ✓ | ✓ | ✅ Match |
| mulberry32 PRNG | ✓ | ✓ | ✅ Match |
| ~~**CoF labels**~~ | ~~Sharps (G#, D#, A#)~~ | ~~**Flats (Ab, Eb, Bb)**~~ | ✅ FIXED: Uses sharps |
| xmur3 hash | charCodeAt (UTF-16) | UTF-8 | ⚠️ Minor (ASCII same) |

---

### Summary of Critical Issues

All major issues have been fixed:

| Issue | File | Status |
|-------|------|--------|
| ~~Spray as timing not position~~ | GranularProcessor.swift | ✅ FIXED |
| ~~Jitter per-sample not spawn~~ | GranularProcessor.swift | ✅ FIXED |
| ~~Feedback separate buffer~~ | GranularProcessor.swift | ✅ FIXED |
| ~~CoF labels flats vs sharps~~ | CircleOfFifths.swift | ✅ FIXED |
| ~~SynthVoice envelope linear~~ | SynthVoice.swift | ✅ FIXED |
| ~~LeadSynth attack shortening~~ | LeadSynth.swift | ✅ FIXED |

### Summary Counts

| Status | Count |
|--------|-------|
| ✅ Match | ~55 |
| ✅ Fixed | 6 |
| ⚠️ Minor Diff | ~17 |
| ❌ Major Diff | 0 |

---

## Version History

| Date | Changes | Author |
|------|---------|--------|
| 2025-02-03 | Fixed all major parity issues: GranularProcessor spray/jitter/feedback architecture, CoF labels sharps, SynthVoice exponential envelope, LeadSynth timbre-based attack | Audit |
| 2025-02-03 | Comprehensive parity audit: Found 4 major issues (granular spray/jitter/feedback, CoF labels) | Audit |
| 2025-02-03 | Added Known Issues section with parity, dead code, and performance findings | Audit |
| 2025-02-02 | Fixed 8 parity issues, changed default scale to Major (Ionian) | - |
| 2024-XX-XX | Initial comprehensive checklist | - |

---

## Notes

- Web is the source of truth for all parameter ranges and defaults
- iOS may have additional reverb presets that map to web equivalents
- Filter modulation uses system random on both platforms (intentional)
- **Ocean synth**: Web uses SEEDED RNG; iOS incorrectly uses system random (see issue 9.1)
- All other random sources must be seeded for reproducibility
