# Audio Technology Architecture

This document describes the audio engine architecture, signal flow, and underlying technology used in the generative music system.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Web Audio API | Real-time audio graph |
| **DSP Processing** | AudioWorklet | Low-latency, dedicated audio thread |
| **Physical Modeling** | WASM (Plaits) | Mutable Instruments synthesis |
| **Language** | TypeScript | Main application logic |
| **Build** | Vite | Development server + bundling |

---

## Signal Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SOUND SOURCES                                  │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│  Poly Synth  │  Lead Synth  │  Drum Synth  │ Ocean Waves  │   Plaits    │
│  (6 voices)  │ (Rhodes/FM)  │  (Ikeda)     │  (Worklet)   │   (WASM)    │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬──────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EFFECTS & PROCESSING                              │
├──────────────────────┬──────────────────────┬───────────────────────────┤
│   Granular Synth     │   Stereo Delay       │   FDN Reverb              │
│   (AudioWorklet)     │   (Ping-Pong)        │   (AudioWorklet)          │
└──────────┬───────────┴──────────┬───────────┴──────────────┬────────────┘
           │                      │                          │
           └──────────────────────┼──────────────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │    Master Limiter       │
                    │  (DynamicsCompressor)   │
                    └────────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   AudioContext.dest     │
                    │   + MediaStreamDest     │
                    │   (iOS background)      │
                    └─────────────────────────┘
```

---

## Sound Sources

### 1. Polyphonic Pad Synth (6 voices)

Each voice contains:

```
┌────────────────────────────────────────────────────────┐
│                    VOICE STRUCTURE                      │
├─────────────┬─────────────┬─────────────┬──────────────┤
│ Osc1 (sine) │ Osc2 (tri)  │ Osc3 (saw)  │ Osc4 (saw)   │
│             │             │ (detuned)   │              │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬───────┘
       │             │             │             │
       ▼             ▼             ▼             ▼
   ┌───────┐     ┌───────┐     ┌───────┐     ┌───────┐
   │ Gain  │     │ Gain  │     │ Gain  │     │ Gain  │
   └───┬───┘     └───┬───┘     └───┬───┘     └───┬───┘
       └─────────────┴──────┬──────┴─────────────┘
                            ▼
              ┌──────────────────────────┐
              │      Noise Generator     │
              │    (AudioBufferSource)   │
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │   Low-Pass Filter (12dB) │
              │   + Warmth (LowShelf)    │
              │   + Presence (Peaking)   │
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │   Saturation (Waveshaper)│
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │      Envelope Gain       │
              └────────────┬─────────────┘
                           ▼
                      To Synth Bus
```

**Parameters:**
- Filter cutoff (random walk modulation)
- Warmth (low shelf boost)
- Saturation (soft clipping)
- Attack/release envelopes

### 2. Lead Synth (Rhodes/Bell FM)

FM synthesis with stereo ping-pong delay:

```
┌──────────────────────────────┐
│   Carrier + 2 Modulators     │
│   (FM ratio from preset)     │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│   Vibrato LFO (expression)   │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│   Band-pass Filter           │
└──────────────┬───────────────┘
               ▼
        ┌──────┴──────┐
        ▼             ▼
   ┌─────────┐   ┌─────────────────────┐
   │  Dry    │   │   Stereo Delay      │
   │  Path   │   │   L ←→ R Ping-Pong  │
   └────┬────┘   │   + Feedback        │
        │        │   + LPF on feedback │
        │        └─────────┬───────────┘
        └──────────────────┼───────────────► To Reverb Send
```

**Expression parameters (randomized per-note):**
- Vibrato depth & rate
- Glide time
- Delay time & feedback

### 3. Drum Synth (Ikeda-style)

6 voice types with morphable parameters:

| Voice | Synthesis | Character |
|-------|-----------|-----------|
| **Sub** | Sine/Triangle + sub-octave | Deep bass pulse |
| **Kick** | Sine + pitch envelope | Body, punch, tail |
| **Click** | Impulse/noise/tonal/granular | Sharp transient |
| **Beep Hi** | Inharmonic partials + shimmer | Metallic high |
| **Beep Lo** | Pitched + Karplus-Strong | Pluck/blip |
| **Noise** | Filtered + formant | Breath, texture |

**Scheduling modes:**
- Random (probability-based)
- Euclidean rhythms (per-lane patterns)

**Morph system:** Real-time interpolation between preset parameters.

### 4. Ocean Waves (AudioWorklet)

Procedural wave synthesis:

```javascript
// ocean.worklet.js
- 2 independent wave generators (overlapping)
- Foam layer (high-frequency noise)
- Deep rumble layer (low-frequency)
- Master LPF/HPF filtering
- Seeded RNG for deterministic variation
```

### 5. Plaits WASM (Mutable Instruments)

WebAssembly port of MI Plaits macro-oscillator:

```javascript
// @vectorsize/woscillators
- 16 synthesis engines
- Engine 12 = Modal resonator (Rings-like)
- Engine 11 = String model
- Internal LPG (Low-Pass Gate)
- ~370KB WASM bundle
```

**Key parameters:**
- `engine` (0-15): Synthesis algorithm
- `harmonics` (0-1): Engine-dependent
- `timbre` (0-1): Brightness/filter
- `morph` (0-1): Waveshape variation
- `decay` (0-1): LPG decay time
- `modTrigger`: Note trigger

---

## Effects Processing

### Granulator (AudioWorklet)

```javascript
// granulator.worklet.js
class GranulatorProcessor {
  // 4-second circular buffer (stereo)
  buffer: Float32Array[2] @ 48kHz
  
  // 64-grain pool
  grains: {
    startSample, position, length,
    playbackRate, panIndex, active
  }[]
  
  // Lookup tables (pre-computed)
  - Pan table (256 entries, equal-power)
  - Hann window (1024 entries)
  
  // Harmonic pitch transposition
  HARMONIC_INTERVALS: [0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24]
}
```

**Parameters:**
- Grain size
- Spray (position randomization)
- Density (grains per second)
- Pitch shift
- Feedback

### Reverb (AudioWorklet)

```javascript
// reverb.worklet.js
class ReverbProcessor {
  // Feedback Delay Network (FDN)
  - 8 delay lines (prime lengths)
  - Hadamard mixing matrix
  - Cascaded allpass diffusers
  - Per-delay modulation (chorus)
  - Frequency-dependent damping
  
  // Smoothed delay with interpolation
  class SmoothDelay {
    readInterpolated(samples) // Linear interp
  }
  
  // Diffuser chain
  class DiffuserChain {
    stages: Array<{delay, feedback}>
  }
}
```

**Parameters:**
- Decay time
- Damping (high-frequency rolloff)
- Modulation depth
- Pre-delay
- Wet/dry mix

---

## Harmony System

### Deterministic RNG

All randomness is seeded for reproducibility:

```typescript
// rng.ts
xmur3(str)      // String → hash seed
mulberry32(n)   // Seed → PRNG function

// Never use Math.random()!
// All randomness flows through createRng(seedMaterial)
```

**Seed sources:**
- UTC time bucket (hour/day)
- Slider parameter positions
- User journey count

### Scale System

```typescript
// scales.ts
SCALE_FAMILIES: [
  // Consonant (tension 0-0.25)
  'Major Pentatonic', 'Lydian', 'Mixolydian', 'Dorian'
  
  // Color (tension 0.25-0.55)
  'Aeolian', 'Harmonic Minor', 'Melodic Minor'
  
  // High tension (0.55-1.0)
  'Octatonic', 'Whole Tone', 'Chromatic'
]
```

### Circle of Fifths Drift

```typescript
// harmony.ts
COF_SEQUENCE = [C, G, D, A, E, B, F#, C#, G#, D#, A#, F]

// Modulates root key over time
updateCircleOfFifthsDrift(config, rng) {
  - driftRate: phrases between changes
  - direction: cw | ccw | random
  - range: max steps from home key
}
```

### Chord Voicing

- 6-voice poly synth
- Phrase-aligned changes (16 seconds default)
- Voice-leading optimization
- Tension-based scale selection

---

## Demo Pages

| File | Purpose | Synthesis |
|------|---------|-----------|
| `plaits-modal-demo.html` | WASM Plaits testing | 16 engines, physical modeling |
| `rings-modal-demo.html` | Simple modal synth | Decaying oscillators |
| `euclid-arp-demo.html` | Euclidean patterns | Arpeggiator + sequencer |

---

## AudioWorklet Architecture

```
┌─────────────────────────────────────────────────┐
│                 MAIN THREAD                      │
│  (TypeScript / React)                           │
├─────────────────────────────────────────────────┤
│  AudioContext                                   │
│  ├── AudioWorkletNode (granulator)              │
│  ├── AudioWorkletNode (reverb)                  │
│  ├── AudioWorkletNode (ocean)                   │
│  └── Standard nodes (oscillators, gains, etc)   │
└─────────────────────────────────────────────────┘
                      │
         postMessage / MessagePort
                      ▼
┌─────────────────────────────────────────────────┐
│              AUDIO WORKLET THREAD               │
│  (Dedicated real-time thread)                   │
├─────────────────────────────────────────────────┤
│  GranulatorProcessor.process()                  │
│  ReverbProcessor.process()                      │
│  OceanProcessor.process()                       │
│                                                 │
│  - 128-sample render quantum                    │
│  - ~2.67ms at 48kHz                            │
│  - No garbage collection pauses                 │
└─────────────────────────────────────────────────┘
```

**Worklet loading:**
```typescript
const workletUrl = `${base}/worklets/${filename}`;
await ctx.audioWorklet.addModule(workletUrl);
const node = new AudioWorkletNode(ctx, 'processor-name');
```

---

## iOS/Safari Considerations

1. **AudioContext resume:** Must be triggered by user gesture
2. **MediaStreamDestination:** Required for background audio
3. **Worklet URLs:** Use absolute paths for Safari compatibility
4. **Silent buffer unlock:** Play silent buffer to activate audio

```typescript
// iOS unlock
const buffer = ctx.createBuffer(1, 1, 22050);
const source = ctx.createBufferSource();
source.buffer = buffer;
source.connect(ctx.destination);
source.start(0);
```

---

## Performance Optimizations

| Optimization | Location | Impact |
|--------------|----------|--------|
| Lookup tables (pan, Hann) | Granulator worklet | Avoid trig per-sample |
| Block-rate modulation | Reverb worklet | Reduce param updates |
| Linear interpolation | Delay reads | vs. cubic Hermite |
| Grain pool (64 max) | Granulator | Bounded allocation |
| Pre-computed saturation curves | Poly synth | Waveshaper |

---

## Future Enhancements

### Planned
- [ ] Clouds-style granular (WASM port)
- [ ] Sample-based transient excitation
- [ ] Convolution reverb option
- [ ] MIDI input support

### Potential WASM Ports
| Module | Status | Benefit |
|--------|--------|---------|
| Plaits | ✅ Available | Physical modeling |
| Clouds | ❌ Not ported | Granular textures |
| Rings | ❌ Not ported | Modal resonance |
| Elements | ❌ Not ported | Full voice |

---

## File Structure

```
src/audio/
├── engine.ts          # Main audio graph management
├── harmony.ts         # Chord/scale generation
├── scales.ts          # Scale definitions
├── rng.ts             # Deterministic RNG
├── drumSynth.ts       # Ikeda-style drums
├── drumMorph.ts       # Drum preset morphing
├── drumPresets.ts     # Drum sound presets
└── worklets/
    ├── granulator.worklet.ts
    └── reverb.worklet.ts

public/worklets/
├── granulator.worklet.js   # Compiled worklet
├── reverb.worklet.js       # Compiled worklet
├── ocean.worklet.js        # Ocean synthesis
└── woscillators.js         # Plaits WASM bundle

public/
├── plaits-modal-demo.html  # Plaits testing
├── rings-modal-demo.html   # Modal synth demo
└── euclid-arp-demo.html    # Euclidean demo
```
