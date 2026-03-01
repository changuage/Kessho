# Granular FX Update Plan: Looper-Chopper with Mosaic Layers

## Overview

A 16-second live-capture looper-chopper with granular playback, 4 frozen layers, Mosaic-style crossfading, per-chop envelopes/pitch/filter, and Euclidean sequencer integration. Replaces the need for a dedicated pad synth — at full wet with long envelopes and feedback, the system generates ambient pads from its own output.

Inspired by: Hologram Microcosm (Mosaic algorithm), Chase Bliss Mood (looper-chopper), existing granular worklet architecture.

---

## Architecture

```
Live audio in → [16s Circular Buffer] → [RECORD / FREEZE]
                                              ↓
                                    ┌─── Layer 1 (frozen snapshot)
                                    ├─── Layer 2 (frozen snapshot)
                                    ├─── Layer 3 (frozen snapshot)
                                    └─── Layer 4 (frozen snapshot)
                                              ↓
                                    [Slice Grid per layer]
                                              ↓
                    Euclidean Hit triggers a BURST of N grains
                              ↓
                ┌─── Per-grain: pitch shift, envelope, filter ───┐
                │     Grain 1 (10-200ms, Hann + attack/decay)    │
                │     Grain 2 (pitch shifted, windowed)           │
                │     ...                                         │
                │     Grain N (density-controlled count)          │
                └─────────────────────────────────────────────────┘
                              ↓
                    [Layer Crossfader / Mix]
                              ↓
                    [Feedback → HPF 30Hz → LPF (user) → Buffer]
                              ↓
                           Output → Existing Reverb (space/diffusion)
```

---

## Memory Budget

| Component | Size | Notes |
|-----------|------|-------|
| Capture buffer (16s mono 48kHz) | 3 MB | `Float32Array(768000)` |
| Layer 1 (frozen copy) | 3 MB | `Float32Array.set()` on freeze |
| Layer 2 | 3 MB | |
| Layer 3 | 3 MB | |
| Layer 4 | 3 MB | |
| **Total** | **~15 MB** | Fine on desktop and mobile |

---

## CPU Budget

| Component | Est. CPU | Notes |
|-----------|----------|-------|
| Capture buffer write | Negligible | Copy 128 samples/process() |
| Grain scheduling + spawn | ~1% | Per Euclidean hit |
| 4 layers × slice playback (sequential) | 4-5% | Non-overlapping reads |
| Per-grain pitch shift (cubic interp) | 1-2% | 4 multiplies/sample |
| Per-grain envelope (attack/decay) | <1% | Conditional per sample |
| Per-grain biquad filter + envelope | 1-2% | Coefficient interp every 64 samples |
| Density gain compensation (1/√N) | Negligible | Per grain spawn/death |
| Layer crossfade mixing | Negligible | 4 multiply-adds/sample |
| Feedback path (HPF + LPF + soft limiter) | <1% | 3 one-pole/biquad filters |
| **Typical (slice mode, 1-2 layers)** | **~5-7%** | |
| **Heavy (4 layers, granular, density 24)** | **~12-15%** | Worst case |

Combined with existing reverb (~6%): **~18-21% peak**, well within budget.

---

## Per-Chop Parameter System

Each Euclidean hit spawns a grain burst. Every grain in the burst gets resolved parameters:

### Parameter Structure

```typescript
interface ChopParams {
  // Amplitude envelope
  attack: number;          // 0.001 - 0.5s
  decay: number;           // 0.01 - 2.0s

  // Pitch
  pitch: number;           // Semitones: -24 to +24
  pitchFine: number;       // Cents: -100 to +100
  reverse: boolean;

  // Filter
  filterFreq: number;      // 200 - 12000 Hz
  filterQ: number;         // 0.5 - 15
  filterType: BiquadFilterType;

  // Filter envelope (per-chop modulation)
  filterEnvDepth: number;  // -8000 to +8000 Hz (bipolar)
  filterEnvAttack: number; // 0.001 - 1.0s
  filterEnvDecay: number;  // 0.01 - 4.0s

  // Swell
  swellAmount: number;     // 0-1
  swellMode: 'up' | 'down' | 'breathe' | 'random';
  swellCurve: number;      // 0.1-4.0

  gain: number;            // 0-1
}
```

### Per-Parameter Modes (reuses existing SliderMode system)

```typescript
interface ChopParamConfig {
  mode: 'fixed' | 'walk' | 'sampleHold';
  value: number;
  min: number;
  max: number;
  scaleAware?: boolean;      // For pitch: quantize to current scale
  tensionLinked?: boolean;   // Modulate by tension slider
}
```

---

## Grain Density System

### Two Layers of Density

**Layer 1: Euclidean Pattern = Macro Rhythm**
- How often grain bursts trigger (e.g., 3-in-16 = sparse, 13-in-16 = near-continuous)

**Layer 2: Grain Density per Burst = Micro Texture**
- Each hit spawns 1-32 grains with staggered start times
- This is the Microcosm "Activity" knob equivalent

### Density × Grain Size = Overlap

| Grain Size | Low Density (2-4) | High Density (16-32) |
|------------|-------------------|----------------------|
| Small (10-30ms) | Sparse glitch fragments | Shimmer (Mosaic C) |
| Large (100-200ms) | Distinct chops | Thick ambient pad |

### Grain Spread Window

Grains within a burst don't all start simultaneously — they're spread across a configurable window:
- **Tight (5-20ms)**: Percussive, defined attack
- **Wide (50-200ms)**: Washy, pad-like onset

---

## Mosaic Algorithm Variations (Preset Configs)

These are NOT separate algorithms — they're preset configurations of the same chop engine:

| Variation | Lane Pitch Settings | Character |
|-----------|-------------------|-----------|
| **A (Octave Up)** | Lane 1: +0, Lane 2: +12 | Clean rhythmic octaves |
| **B (Octave Down)** | Lane 1: +0, Lane 2: -12 | Heavy sub-octave foundation |
| **C (Shimmer)** | All lanes: +12 or +24 | Dense octave-up texture |
| **D (Wide Range)** | Lanes: -12, 0, +12, +24 | Cloud-like harmonic spread |

Each variation: slice length 10-80ms, attack/decay 1-3ms.

---

## Layer System

### Layer Operations

```typescript
interface Layer {
  buffer: Float32Array;          // Copy of capture buffer at freeze time
  length: number;
  slices: Slice[];               // Independent slice grid per layer
  playbackMode: 'sequential' | 'random' | 'euclidean' | 'granular';
  gain: number;
  rate: number;
  reverse: boolean;
  active: boolean;
}
```

### Crossfade Modes

| Mode | Behavior |
|------|----------|
| **Stack** | All active layers play simultaneously, mixed by gain |
| **Cycle** | Round-robin per slice trigger |
| **Crossfade** | Equal-power smooth fade between layers (1-30s) |
| **Euclidean** | Each Euclidean lane triggers a different layer |

---

## Euclidean Integration

4 Euclidean lanes → 4 layers maps naturally:

```
Lane 1: Layer 1 at pitch -12, density 20, pattern 3/16  → bass pad breathing
Lane 2: Layer 2 at pitch 0,   density 4,  pattern 7/16  → mid-range chops
Lane 3: Layer 3 at pitch +12, density 16, pattern 5/16  → shimmer pulses
Lane 4: Layer 4 at pitch +24, density 2,  pattern 11/16 → sparse sparkles
```

Per-lane density control: each lane has its own grain density, size, spread, pitch settings.

---

## Tension Integration

| Tension | Attack | Decay | Filter | Pitch Range | Density | Character |
|---------|--------|-------|--------|-------------|---------|-----------|
| 0.0 | 2s | 4s | 600Hz LP | Pentatonic | 16-24 | Warm continuous pad |
| 0.3 | 800ms | 2s | 1200Hz LP | -12 to +7 | 8-16 | Gentle texture |
| 0.5 | 200ms | 1s | 3000Hz LP | -12 to +12 | 4-8 | Rhythmic but smooth |
| 0.7 | 20ms | 500ms | 6000Hz LP | -24 to +24 | 2-4 | Choppy glitch |
| 1.0 | 3ms | 50ms | Full | Dissonant | 1-2 | Aggressive stutter |

---

## Anti-Artifact Measures

### Mandatory Signal Chain

```
Grain output
  → Mandatory 2-3ms micro-fade (non-negotiable, 96-144 samples at 48kHz)
  → Per-chop attack/decay envelope
  → Per-chop biquad filter (coefficient interpolation every 64 samples)
  → Gain compensation: 1/√(activeGrainCount) with smoothing ramp
  → Layer sum with equal-power crossfade
  → Output soft limiter (tanh saturation)
  → Dry/wet mix
  → Master out

Feedback path (post-limiter):
  → Feedback gain (user-controlled, 0-0.85 max, never 1.0)
  → HPF 30Hz (remove subsonic buildup from pitch-down accumulation)
  → LPF (user-controlled, auto-darkens each pass)
  → RMS monitor (auto-reduce gain if runaway detected)
  → Back into capture buffer write
```

### Specific Protections

| Artifact | Source | Prevention |
|----------|--------|------------|
| Grain boundary clicks | Hard start/stop | Mandatory 2-3ms Hann micro-fade on every grain |
| Feedback runaway | Energy accumulation | tanh soft limiter + RMS auto-gain reduction |
| Pitch aliasing | 2x/4x playback | Pre-filter at (sr/2)/N before pitch-up |
| Buffer loop click | Freeze discontinuity | 5-10ms crossfade zone at buffer boundaries |
| Slice boundary click | Mid-waveform cut | Zero-crossing snap + mandatory micro-fade |
| Layer crossfade clip | Sum > 1.0 | Equal-power crossfade (cos/sin) |
| Density clipping | 24+ grains summing | Gain = 1/√(N) per grain |
| Filter zipper noise | Coefficient stepping | One-pole smoothing on frequency, interp coefficients |
| Subsonic buildup | Pitch-down feedback | HPF 30Hz in feedback return |
| Interpolation artifacts | Linear resampling | Cubic Hermite interpolation (4 muls/sample) |

---

## Ambient Pad Generation (Fully Wet)

No dedicated pad synth needed. The looper-chopper generates ambient pads via:

### Three Pad Modes

**1. Frozen Drone**
- One frozen layer, full 16s buffer as single slice
- Playback rate 0.25-0.5x, high feedback, low filter
- Result: infinite evolving drone from one captured moment

**2. Breathing Texture**
- 2-3 frozen layers with crossfade at 6-12s
- Swell: "breathe" mode, scale-locked pitch at -12, -7, 0 semitones
- Result: organic swell between captured harmonies

**3. Self-Generating Ambient**
- Record enabled (not frozen), feedback 50-70%
- Each feedback pass: pitch drops, filter darkens
- Result: self-evolving texture that erases source material over 3-4 passes

### Feedback Loop Creates the Pad

```
Pass 1: Original captured audio (clear)
Pass 2: Filtered + pitch-shifted (darker, lower)
Pass 3: Even darker, losing definition
Pass 4: Almost pure tone (filter resonance)
Pass 5+: Steady-state hum or silence
```

---

## Reverb Assessment

### Current Reverb Capability (from code audit)

The existing FDN reverb (488 lines, `reverb.worklet.ts`) is **already pad-smear capable**:
- 8-channel FDN with Hadamard mixing matrix
- **32 allpass diffuser stages** (6 pre + 4 mid + 6 post, × 2 channels)
- Feedback up to 0.995 (RT60 ≈ 15-20s at max settings)
- 4 ultra-slow LFOs (19-43s cycles) for evolving tail
- DC blocker + soft clipper for safety
- Predelay up to 300ms
- ~6% CPU

### Reverb Gaps for Pad Smear

| Gap | Impact | Fix |
|-----|--------|-----|
| **Shared reverb bus** | Pad reverb settings affect drums/lead | Looper's own feedback loop provides sustain; reverb just adds space |
| **No HPF in FDN feedback** | Low frequency accumulation on long decays | Add one-pole HPF at 30-40Hz (~2 lines of code) |
| **No freeze/infinite mode** | Max feedback 0.995, always decays | Add `infinite` boolean: feedback = 1.0, disable input (~5 lines) |
| **Size range limited** | Max 3.0 → longest line ~328ms | Extend to 5.0 or add "ambient" preset |

### Recommendation

**Do NOT add a second reverb instance.** The looper-chopper's internal feedback loop handles sustain/smear. The shared reverb handles spatial diffusion only. This saves ~6% CPU and avoids the shared-bus problem entirely.

---

## Implementation Phases

### Phase 1: Record + Chop (6 days)
- New `LooperFXWorkletProcessor` with 16s circular capture buffer
- Record / freeze / overdub controls
- Auto-slice into equal divisions (4-16 slices)
- Basic slice playback with mandatory micro-fade envelope
- Wire into audio graph: master output → looper → output
- UI: Record button, Freeze button, dry/wet mix slider
- **Deliverable**: Record → freeze → auto-slice → play back slices

### Phase 2: Per-Chop DSP (5 days)
- Per-chop attack/decay envelope (2-3ms minimum fade enforced)
- Per-chop pitch shifting with cubic interpolation
- Scale-aware pitch quantization
- Per-chop biquad filter with filter envelope modulation
- Coefficient interpolation (every 64 samples) to prevent zipper noise
- Anti-aliasing pre-filter for pitch-up playback
- UI: Attack, Decay, Pitch, Filter, FilterEnv sliders
- **Deliverable**: Expressive chops with pitch/filter/envelope per hit

### Phase 3: Layers + Crossfade + Euclidean (5 days)
- 4 layer slots with copy-on-freeze
- Stack / Cycle / Crossfade / Euclidean crossfade modes
- Equal-power crossfade implementation
- Euclidean lane → layer mapping (4 lanes → 4 layers)
- Per-lane density control (1-32 grains per hit)
- Grain spread window (5-200ms)
- Gain compensation: 1/√(activeGrainCount)
- UI: Layer buttons (1-4), crossfade mode selector, crossfade time slider
- **Deliverable**: Multi-layer Mosaic-style granular with Euclidean control

### Phase 4: Swell + Feedback + Polish (4 days)
- Swell modes: up, down, breathe, random
- Feedback routing with HPF 30Hz + LPF (user-controlled)
- tanh soft limiter on output
- RMS-based auto-gain on feedback path
- Tension → chop parameter modulation
- SliderMode integration (fixed/walk/sampleHold per chop param)
- Mosaic variation presets (A/B/C/D as preset configurations)
- Buffer silence detection (gate freeze when RMS < threshold)
- **Deliverable**: Self-generating ambient pads, tension-linked, anti-artifact complete

### Phase 5: Waveform UI (4 days) — Optional
- Canvas-based waveform display of capture buffer
- Slice markers (draggable)
- Layer indicators (which layer is active, frozen indicator)
- Grain activity visualization (sparkles at active grain positions)
- **Deliverable**: Visual feedback for the looper

---

## Total Effort: ~20-24 days

Phase 1-4 = ~20 days for full functionality without waveform UI.
Phase 5 = +4 days for visual feedback.

Phase 1 alone (6 days) delivers a usable instrument. Each subsequent phase adds a dimension of expression without breaking what came before.

---

## Files to Create/Modify

### New Files
- `src/audio/worklets/looper-fx.worklet.ts` — Core worklet (capture, grains, layers, feedback)
- `src/audio/looperFX.ts` — Main-thread controller (param management, Euclidean integration)
- `src/ui/LooperFXPanel.tsx` — UI component

### Modified Files
- `src/audio/engine.ts` — Wire looper into audio graph, add to `createAudioGraph()` and `applyParams()`
- `src/ui/state.ts` — Add looper state fields (`looperEnabled`, `looperDryWet`, `looperDensity`, `looperGrainSize`, `looperAttack`, `looperDecay`, `looperPitch`, `looperFilterFreq`, `looperFilterEnvDepth`, `looperCrossfadeMode`, `looperCrossfadeTime`, `looperFeedback`, `looperSwellMode`, etc.)
- `src/App.tsx` — Add LooperFXPanel to UI, wire slider handlers
- `src/audio/worklets/reverb.worklet.ts` — Add HPF in FDN feedback, optional infinite mode, extend size range (minor, ~10 lines)

### Build Config
- `vite.config.ts` — Add looper worklet to build targets (same pattern as granulator/reverb/ocean worklets)
