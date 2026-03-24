# Granular FX Update Plan: Unified Looper-Chopper-Granular Engine

## Overview

A **unified granular engine** that replaces the existing `granulator.worklet.ts` with a superset worklet: 16-second always-recording buffer, 4 voices, clean/granular modes, Mosaic-style pitch voices, Flux-style blur/shimmer, Loop Forest LFO scanning, multi-tap delay, and Euclidean integration. The existing granular cloud sound is preserved as a **"Legacy Cloud" preset** that configures the new engine to match the original algorithm (harmonic intervals, spray-based positioning, continuous write, no freeze).

Inspired by: Hologram Microcosm (Mosaic algorithm + multi-tap delay), Chase Bliss Mood (looper-chopper), Empress ZOIA Loop Forest (slow LFO-modulated loopers), Fors Opal Flux (always-recording auto-sampler with clean/granular toggle), existing granular worklet architecture.

### Unified Approach Rationale

The existing `granulator.worklet.ts` and the new looper-chopper share **identical DSP primitives**: circular buffer + write head, grain spawning (density/spray), Hann-windowed envelopes, pitch-shifted buffer reads, per-grain stereo pan, and feedback to buffer with tanh clipping. The existing granular cloud sound is a **configuration** of the new engine:
- `freeze = false` (always recording, like current granulator)
- 1 voice, granular mode
- `pitchMode = 'harmonic'` using `HARMONIC_INTERVALS`
- Spray-based position (no slicing)
- High density, variable grain size → cloud texture
- 4s effective buffer (position LFO range limited to last 4s)

Running two separate worklets with near-identical DSP would waste CPU and create maintenance burden. A single unified worklet with a Legacy Cloud preset gives us side-by-side A/B testing during development.

---

## Architecture

```
Live audio in → [16s Always-Recording Buffer] → [AUTO-SLICE into 16 equal slices]
                  │     (Flux-style: always capturing, no manual record step)
                  │                                       ↓
                  │  [FREEZE] ← toggle stops write head, buffer becomes fixed 16s loop
                  │                                       ↓
                                    ┌─── Voice 1 (position + LFO scan)
                                    ├─── Voice 2 (position + LFO scan)
                                    ├─── Voice 3 (position + LFO scan)
                                    └─── Voice 4 (position + LFO scan)
                                              ↓
                              [Clean / Granular Toggle per voice]
                                              ↓
                    ┌─── Clean: direct slice playback with envelope ───┐
                    │     (Loop Forest style: position scanning, speed, reverse)
                    │                                                   │
                    ├─── Granular: burst of N grains with spray ────────┤
                    │     (Mosaic style: density, spread, pitch shift)   │
                    └───────────────────────────────────────────────────┘
                              ↓
                    [Per-voice: Blur (4-stage allpass diffusion)]
                    [Per-voice: Grain Oct (probabilistic +12st shimmer)]
                    [Per-voice: Decay envelope]
                              ↓
                    [Voice Mix → Pan (manual + LFO)]
                              ↓
                    [Internal Feedback → HPF 30Hz → LPF (user) → Buffer]
                              ↓
          ┌─── Looper Direct ──────────────────────────────────────→ Master
          ├─── Looper Delay Send → MultiTap Delay (8 taps) ──┬──→ Master
          │         Activity macro controls tap count/rhythm   │
          │         Tone filter in feedback, vibrato modulation └──→ Reverb
          └─── Looper Reverb Send ────────────────────────────────→ Reverb
```

> **Note:** The delay send between looper and reverb is critical. Both the Microcosm and Mood use
> `granular → delay → reverb` as the fundamental signal topology. Without delay, Mosaic shimmer
> and Mood ambient glitch textures lose the rhythmic echo/smear that defines their character.
>
> The Microcosm's delay is a **multi-tap** design, not a simple ping-pong. Its Activity knob
> progressively enables more taps with syncopated timing, moving from simple echoes to dense
> rhythmic cascades. Our implementation mirrors this with 8 delay taps and an Activity macro.

---

## Freeze: Buffer Snapshot Mode

Freeze stops the always-recording write head, turning the buffer into a fixed 16s loop. This bridges the Flux always-recording workflow with the Mood/Microcosm freeze behavior.

### How It Works

```
Always-Recording (normal):  write head continuously overwrites → voices read live-evolving content
Freeze (toggled ON):        write head stops → buffer is a fixed 16s loop → voices read frozen content
Unfreeze (toggled OFF):     write head resumes → new audio starts overwriting from current position
```

**Implementation:** A single boolean flag (`freeze`) on the write head inside the worklet. When `true`, the `process()` method skips writing input samples to the buffer. The buffer retains whatever was in it at the moment of freeze. No copy, no extra memory, no latency.

### Why Freeze Matters

| Without Freeze | With Freeze |
|----------------|-------------|
| Buffer content always changing | Buffer locked to a captured moment |
| Good for evolving textures (Loop Forest) | Good for drones, controlled manipulation |
| Position LFOs scan through new material | Position LFOs scan the same 16s loop forever |
| Feedback re-records processed output | Feedback accumulates on frozen material |
| Live performance: input always affects output | Live performance: input is silenced, only buffer plays |

### Freeze + Feedback = Self-Generating Drone

When freeze is active and feedback is enabled:
1. Voices read from frozen buffer
2. Output feeds back through HPF → LPF → back into buffer write (feedback bypasses freeze)
3. Each pass: filter darkens, pitch shifts accumulate, blur smears
4. The frozen moment transforms into an evolving drone
5. Set feedback to 0 to keep the original frozen moment pristine

### Freeze + Reverb Infinite = Permanent Drone

Combine buffer freeze with the reverb's infinite mode for permanent frozen ambience:
- Buffer freeze → voices read same material → delay cascade → reverb (infinite) → never decays
- The entire signal chain becomes a static, eternal texture

### State

| Parameter | Type | Description |
|-----------|------|-------------|
| `looperFreeze` | boolean | When true, write head stops. Buffer becomes fixed 16s loop |
| `looperFreezeWithFeedback` | boolean | When true, feedback can still write to frozen buffer (self-generating drone) |

---

## Reference Hardware Analysis

### ZOIA Loop Forest (Decoded from `002_zoia_loop_forest.bin`)

The ZOIA "Loop Forest" preset was fully decoded using a custom binary parser (`Zoia/parse_zoia.py`). **Key finding: it uses NO granular synthesis at all.** The entire patch is:

- **4 parallel 16s loopers** with independent record/playback
- **16 slow LFOs** (0.01–0.1 Hz) modulating position, record enable, reverse probability, and pan
- **1 old_tape delay module** → **1 Hall Reverb** at the output
- Total: 32 modules, 48 connections, ~40.5% ZOIA CPU

#### Signal Flow (from decoded preset)
```
Audio In → Looper 1 (16s) ──┐
         → Looper 2 (16s) ──┤
         → Looper 3 (16s) ──┼→ Mixer → Old Tape Delay → Hall Reverb → Audio Out
         → Looper 4 (16s) ──┘

Each looper has:
  - Position LFO (very slow triangle, 20-40s cycle) → scanning through buffer
  - Record LFO → probabilistically enables/disables recording
  - Reverse LFO → flips playback direction periodically
  - Pan LFO → slow stereo movement
```

#### Key Design Insight: "Modulation > Complexity"

Loop Forest creates rich, evolving ambient textures from **extremely simple building blocks**. The "granular" character comes not from grain bursts, but from slow position-scanning LFOs that cause the playback head to drift through the buffer. This produces organic, non-repeating textures at a fraction of the CPU cost of true granular synthesis.

**What we borrow:**
- Slow LFO on playback position (the dominant texture-generator)
- Slow LFO on record enable (self-evolving content)
- Slow LFO on reverse (organic variation)
- Slow LFO on pan (spatial movement)
- Simple topology: loopers → delay → reverb (validates our signal chain)

### Fors Opal Flux

Flux is an always-recording auto-sampler with a clean/granular toggle. Its brilliance is in workflow simplification.

#### Core Concept: Always Recording

Flux eliminates the "record/freeze" workflow entirely. The buffer is always capturing, and 16 equal-length slices are always available. The musician never has to think about _when_ to press record — they just play, and the material is always there.

#### Control Set

| Control | Function |
|---------|----------|
| **Rate** | Playback speed (0.25×–4×) |
| **Spray** | Randomizes grain start position within slice (0 = exact, 1 = anywhere in buffer) |
| **Blur** | Per-slice micro-diffusion via 4-stage allpass chain. NOT reverb — it's a short smearing effect that softens slice edges |
| **Grain Oct** | Probabilistic octave-up (+12st) on grains. At 0 = no shimmer, at 1 = every grain shifts up. This is the simplest possible shimmer implementation |
| **Decay** | Amplitude envelope per slice (how quickly each slice fades after trigger) |
| **Clean/Granular toggle** | Binary switch: Clean = direct buffer playback, Granular = grain cloud from slice. No in-between |

#### Key Design Insights

**1. Always-recording eliminates friction.** No record button, no freeze button, no "did I capture it?" anxiety. The buffer is always full of the last 16 seconds.

**2. 16 equal auto-slices.** No draggable slice markers, no zero-crossing detection. Just divide the buffer into 16 equal segments. Simple, predictable, fast.

**3. Clean/Granular binary toggle.** Rather than a continuous blend between clean playback and granular clouds, Flux uses a hard switch. This is more musically useful — you're either chopping (clean) or cloud-generating (granular). The toggle can be per-voice.

**4. Blur ≠ Reverb.** Blur is a 4-stage allpass micro-diffusion (like the first few ms of a reverb's diffuser section). It smears slice edges and softens transients without the tail of a reverb. CPU cost: ~4 multiplies per sample. This belongs _inside_ the worklet, not as an external effect.

**5. Grain Oct = simplest shimmer.** Instead of pitch-shifted feedback or complex spectral processing, Flux just probabilistically shifts individual grains up one octave. At low values, occasional grains sparkle; at high values, everything shimmers. ~1 conditional per grain spawn.

**What we borrow:**
- Always-recording buffer (replaces manual record/freeze workflow)
- 16 equal auto-slices (replaces complex slice grid)
- Clean/Granular toggle per voice (replaces continuous grain density as the mode switch)
- Blur: 4-stage allpass micro-diffusion per voice (new, inside worklet)
- Grain Oct: probabilistic +12st shimmer (new, per grain spawn)
- Decay envelope per voice

### How References Reshape the Plan

Combining Loop Forest + Flux + Microcosm + Mood reveals a **simpler, more elegant design** than the original plan:

| Original Plan | Revised (from references) | Why |
|--------------|--------------------------|-----|
| Manual Record / Freeze buttons | Always-recording buffer (Flux) | Eliminates workflow friction |
| Draggable slice grid markers | 16 equal auto-slices (Flux) | Simpler, more predictable |
| Grain density 1-32 as main control | Clean/Granular binary toggle (Flux) | Clearer musical intent |
| Complex grain scheduler (burst of N) | Clean mode uses position-scanning LFOs (Loop Forest) | Rich texture from simple modulation |
| Per-grain biquad filter + envelope | Blur: 4-stage allpass diffusion (Flux) | Cheaper, more musical smearing |
| No shimmer in grain engine | Grain Oct: probabilistic +12st (Flux) | Trivial shimmer implementation |
| Swell modes (up/down/breathe/random) | Slow LFOs on position/record/reverse/pan (Loop Forest) | More organic, self-generating |
| No delay in path | Multi-tap delay with Activity macro (Microcosm) | Rhythmic cascade, core identity |

#### Preset Configurations (One Engine, Many Sounds)

The unified engine covers all reference pedals via preset parameter configs. Each preset configures the 4 voices, freeze state, delay, and blur/shimmer differently:

##### Microcosm Mosaic Presets

| Preset | Mode | Freeze | Pitch (V1/V2/V3/V4) | Grain Oct | Density | Activity | Repeats | Blur | Speed | Pos LFO | Character |
|--------|------|--------|---------------------|-----------|---------|----------|---------|------|-------|---------|-----------|
| **Mosaic A (Octave Up)** | Granular | Off | 0/+12/0/+12 | 0 | 4-8 | 0.5 | 0.4 | 0.1 | 1× | Off | Clean rhythmic octave doubling |
| **Mosaic B (Octave Down)** | Granular | Off | 0/-12/0/-12 | 0 | 4-8 | 0.5 | 0.4 | 0.1 | 1× | Off | Heavy sub-octave foundation |
| **Mosaic C (Shimmer)** | Granular | Off | +12/+12/+24/+12 | 0.7 | 16-24 | 0.7 | 0.6 | 0.4 | 1× | Off | Dense octave-up shimmer cascade |
| **Mosaic D (Wide)** | Granular | Off | -12/0/+12/+24 | 0.3 | 8-16 | 0.6 | 0.5 | 0.3 | 1× | Off | Cloud-like harmonic spread |

##### Chase Bliss Mood Presets

| Preset | Mode | Freeze | Pitch | Grain Oct | Density | Activity | Repeats | Blur | Speed | Pos LFO | Character |
|--------|------|--------|-------|-----------|---------|----------|---------|------|-------|---------|-----------|
| **Mood Ambient** | Clean | On | 0/0/-12/+12 | 0 | — | 0.3 | 0.5 | 0.5 | 0.5× | Slow (30s) | Frozen loop with gentle drift, warm pad |
| **Mood Glitch** | Granular | Off | 0/+7/0/-5 | 0 | 2-4 | 0.6 | 0.3 | 0 | 1-2× | Off | Choppy micro-loop stutter fragments |
| **Mood Slip** | Clean | Off | 0/0/0/0 | 0 | — | 0.4 | 0.5 | 0.2 | 0.25-2× | Off (manual) | Lo-fi speed-warped micro-loop chopper |

##### Fors Opal Flux Presets

| Preset | Mode | Freeze | Pitch | Grain Oct | Density | Activity | Repeats | Blur | Speed | Spray | Character |
|--------|------|--------|-------|-----------|---------|----------|---------|------|-------|-------|-----------|
| **Flux Cloud** | Granular | Off | 0/0/+12/0 | 0.3 | 8-16 | 0.3 | 0.3 | 0.8 | 0.5-2× | 0.5 | Soft blurred grain cloud with gentle shimmer |
| **Flux Stutter** | Granular | Off | 0/0/0/0 | 0 | 2-4 | 0.2 | 0.2 | 0.1 | 1-4× | 0.1 | Tight rhythmic grain repeats, percussive |

##### ZOIA Loop Forest Presets

| Preset | Mode | Freeze | Pitch | Grain Oct | Density | Activity | Repeats | Blur | Speed | Pos LFO | Record LFO | Character |
|--------|------|--------|-------|-----------|---------|----------|---------|------|-------|---------|------------|-----------|
| **Loop Forest** | Clean | Off | 0/0/0/0 | 0 | — | 0.2 | 0.3 | 0 | 0.5-1× | Slow (20-40s) | On | Drifting ambient loops, always evolving |
| **Loop Forest Dark** | Clean | Off | -12/-12/0/0 | 0 | — | 0.2 | 0.4 | 0.3 | 0.25× | Slow (30-50s) | On | Deep sub drone with slow movement |

##### Self-Generating / Drone Presets

| Preset | Mode | Freeze | Pitch | Grain Oct | Feedback | Activity | Repeats | Blur | Speed | Pos LFO | Character |
|--------|------|--------|-------|-----------|----------|----------|---------|------|-------|---------|-----------|
| **Self-Generating** | Granular | Off | 0/-7/+12/+5 | 0.5 | 0.6 | 0.5 | 0.7 | 0.6 | 0.5× | Slow (30s) | Auto-evolving ambient bed, erases source over time |
| **Frozen Drone** | Clean | On | 0/0/0/0 | 0 | 0 | 0.1 | 0.2 | 0.7 | 0.25× | Slow (40s) | Pristine frozen moment, blurred and eternal |
| **Frozen Shimmer** | Granular | On | 0/+12/+12/+24 | 0.8 | 0.3 | 0.6 | 0.5 | 0.5 | 0.5× | Slow (25s) | Frozen content with cascading octave shimmer |
| **Feedback Drone** | Clean | On (w/ feedback) | 0/-12/+12/0 | 0.2 | 0.7 | 0.3 | 0.6 | 0.8 | 0.25× | Slow (35s) | Self-transforming frozen drone, darkens over time |

##### Legacy Preset (Existing Granular Cloud)

| Preset | Legacy | Voices | Pitch Mode | Density | Spray | Grain Size | Feedback | Blur | Grain Oct | Activity | Character |
|--------|--------|--------|------------|---------|-------|------------|----------|------|-----------|----------|-----------|
| **Legacy Cloud** | ✅ On | 1 (V1 only) | Harmonic (HARMONIC_INTERVALS) | 20 g/s | 100ms | 30-150ms | 0.1 (cap 0.35) | 0 | 0 | 0 | Exact match of current `granulator.worklet.ts` — the "string waves" sound |

> **Testing:** Load Legacy Cloud preset on the unified engine, play string waves sound, compare with the original `granulator.worklet.ts` running simultaneously. When they match, the original worklet can be retired.

---

## Memory Budget

| Component | Size | Notes |
|-----------|------|-------|
| Always-recording buffer (16s stereo 48kHz) | 6 MB | `Float32Array(768000) × 2 channels` |
| Blur allpass state (× 4 voices × 4 stages) | <1 KB | 16 delay lines, ~5ms max each |
| Grain pool (granular mode) | <1 KB | Grain metadata structs |
| **Total** | **~6 MB** | Significantly less than 4-layer frozen copy approach |

> **Note:** The always-recording approach (Flux-style) eliminates the need for frozen layer copies.
> The original 4-layer plan needed ~15 MB (capture + 4 frozen copies). Now we just have one
> always-recording buffer shared by all 4 voices, reading from different positions.

---

## CPU Budget

| Component | Est. CPU | Notes |
|-----------|----------|-------|
| Always-recording buffer write | Negligible | Copy 128 samples/process() |
| 4 voices × clean slice playback | ~2-3% | Direct buffer reads with interpolation |
| Position/Record/Reverse/Pan LFOs | <1% | 4 voices × 4 LFOs = 16 slow LFOs |
| Blur (4-stage allpass × 4 voices) | ~1% | 16 allpass stages total |
| Grain scheduling + spawn (granular mode) | ~1% | Per Euclidean hit |
| Per-grain pitch shift (cubic interp) | 1-2% | 4 multiplies/sample |
| Per-grain envelope (attack/decay) | <1% | Conditional per sample |
| Grain Oct (+12st probability) | Negligible | 1 conditional per grain spawn |
| Density gain compensation (1/√N) | Negligible | Per grain spawn/death |
| Voice mix + pan | Negligible | 4 multiply-adds/sample |
| Feedback path (HPF + LPF + soft limiter) | <1% | 3 one-pole/biquad filters |
| **Typical (clean mode, 2 voices, LFOs)** | **~4-6%** | Loop Forest equivalent |
| **Heavy (4 voices, granular, density 24)** | **~10-14%** | Mosaic shimmer equivalent |

Combined with existing reverb (~6%) + multi-tap delay (<1%): **~11-21% peak**, well within budget.

---

## Per-Voice Parameter System

Each of the 4 voices has independently configurable parameters. In Granular mode, Euclidean hits spawn grain bursts; in Clean mode, slices play back directly with LFO modulation.

### Parameter Structure

```typescript
interface VoiceParams {
  // Mode (Flux-inspired)
  mode: 'clean' | 'granular';    // Binary toggle, not continuous
  legacyMode: boolean;            // When true: 4s buffer range, HARMONIC_INTERVALS, spray-only positioning, jitter/probability

  // Position (Loop Forest-inspired)
  sliceSelect: number;            // 0-15 (which of 16 auto-slices)
  positionLFORate: number;        // 0-1 (0 = off, 1 = ~20s cycle) — slow scanning
  positionLFODepth: number;       // 0-1 (how far the LFO scans through buffer)

  // Playback
  speed: number;                  // 0.25-4× playback rate
  reverse: boolean;               // Playback direction
  reverseLFORate: number;         // 0-1 (Loop Forest: periodic direction flip)

  // Amplitude envelope
  attack: number;                 // 0.001 - 0.5s
  decay: number;                  // 0.01 - 2.0s (Flux "Decay" control)

  // Pitch
  pitch: number;                  // Semitones: -12 to +12
  grainOct: number;               // 0-1 probability of +12st shimmer (Flux)

  // Blur (Flux-inspired: per-voice allpass micro-diffusion)
  blur: number;                   // 0-1 (4-stage allpass diffusion amount)

  // Granular-only params (active when mode = 'granular')
  spray: number;                  // 0-1 position randomization (Flux)
  density: number;                // 1-32 grains per burst
  grainSize: number;              // 10-200ms
  grainSpread: number;            // 5-200ms (burst onset window)

  // Spatial (Loop Forest-inspired)
  pan: number;                    // -1 to +1
  panLFORate: number;             // 0-1 (slow stereo movement)

  // Recording (Loop Forest-inspired)
  recordLFORate: number;          // 0-1 (probabilistic record enable/disable)

  gain: number;                   // 0-1
}
```

### Per-Parameter Modes (reuses existing SliderMode system)

```typescript
interface VoiceParamConfig {
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

### Clean vs Granular Mode (Flux-Inspired)

**Clean mode:** Direct buffer playback — no grains, no density. The voice reads the buffer at a position determined by slice select + position LFO. This is the Loop Forest approach: slow scanning through a 16s buffer creates evolving textures without any granular processing.

**Granular mode:** Euclidean hits spawn grain bursts with density, spray, and grain size. This is the Mosaic/Microcosm approach for shimmer, glitch, and cloud textures.

The Clean/Granular toggle (from Flux) replaces using grain density as a continuous dial to switch between modes. Clean at density=1 and granular at density=32 are musically very different intentions — making it an explicit toggle clarifies the design.

### Two Layers of Density (Granular Mode Only)

**Layer 1: Euclidean Pattern = Macro Rhythm**
- How often grain bursts trigger (e.g., 3-in-16 = sparse, 13-in-16 = near-continuous)

**Layer 2: Grain Density per Burst = Micro Texture**
- Each hit spawns 1-32 grains with staggered start times
- Combined with Spray (Flux): position randomization within slice bounds

### Density × Grain Size = Overlap

| Grain Size | Low Density (2-4) | High Density (16-32) |
|------------|-------------------|----------------------|
| Small (10-30ms) | Sparse glitch fragments | Shimmer (Mosaic C) |
| Large (100-200ms) | Distinct chops | Thick ambient pad |

### Grain Spread Window

Grains within a burst don't all start simultaneously — they're spread across a configurable window:
- **Tight (5-20ms)**: Percussive, defined attack
- **Wide (50-200ms)**: Washy, pad-like onset

### Blur: Per-Voice Allpass Micro-Diffusion (from Flux)

Blur is a 4-stage allpass chain applied per-voice _inside_ the worklet. It's not reverb — it's the first few milliseconds of a diffuser, smearing transients and softening slice edges without adding a reverb tail.

```
Voice output → AP1 → AP2 → AP3 → AP4 → blurred output
                (each: y[n] = -g*x[n] + x[n-d] + g*y[n-d])
                delay times: ~1.5ms, ~2.3ms, ~3.7ms, ~5.1ms
                g (allpass coefficient) = blur amount (0-0.7)
```

- At blur=0: bypass (clean transients)
- At blur=0.3: slight softening, good for clean mode slice edges
- At blur=0.7: heavily smeared, pad-like even from clean playback
- CPU: ~4 multiply-adds per sample per voice = negligible

### Grain Oct: Probabilistic Shimmer (from Flux)

When spawning a grain, roll against `grainOct` probability:
- If roll < grainOct: play grain at +12 semitones (one octave up)
- Otherwise: play at the voice's pitch setting

This is the simplest possible shimmer. No pitch-shifted feedback, no spectral processing — just occasional octave-up grains that sparkle above the texture.

- At grainOct=0: no shimmer, pure pitch
- At grainOct=0.2: occasional sparkle (subtle)
- At grainOct=0.5: half grains shimmer (Mosaic C territory)
- At grainOct=1.0: full octave-up cloud

---

## Mosaic Algorithm Variations (Preset Configs)

These are NOT separate algorithms — they're preset configurations of the same engine (see full preset table above):

| Variation | Voice Pitch Settings | Grain Oct | Density | Character |
|-----------|---------------------|-----------|---------|-----------|
| **A (Octave Up)** | V1: +0, V2: +12, V3: +0, V4: +12 | 0 | 4-8 | Clean rhythmic octave doubling |
| **B (Octave Down)** | V1: +0, V2: -12, V3: +0, V4: -12 | 0 | 4-8 | Heavy sub-octave foundation |
| **C (Shimmer)** | V1: +12, V2: +12, V3: +24, V4: +12 | 0.7 | 16-24 | Dense octave-up shimmer cascade |
| **D (Wide Range)** | V1: -12, V2: +0, V3: +12, V4: +24 | 0.3 | 8-16 | Cloud-like harmonic spread |

Each variation uses granular mode, grain size 10-80ms, attack/decay 1-3ms. The multi-tap delay's Activity and Repeats shape the rhythmic character on top.

---

## Voice System (Replaces Layer System)

### 4 Voices, 1 Shared Buffer

Instead of 4 frozen layer copies of the buffer, we have **4 voices reading from the same always-recording buffer** at different positions. This is inspired by Loop Forest (4 independent loopers reading the same input) and Flux (16 slices from one continuous buffer).

```typescript
interface Voice {
  mode: 'clean' | 'granular';     // Flux-style toggle
  sliceSelect: number;             // 0-15 (which auto-slice to read from)
  positionOffset: number;          // Fine position within slice
  positionLFO: LFO;               // Slow scanning through buffer (Loop Forest)
  speed: number;                   // Playback rate
  reverse: boolean;
  reverseLFO: LFO;                // Periodic direction flip (Loop Forest)
  pan: number;
  panLFO: LFO;                    // Slow stereo movement (Loop Forest)
  recordLFO: LFO;                 // Probabilistic record enable (Loop Forest)
  blur: number;                    // Allpass diffusion amount (Flux)
  grainOct: number;               // Shimmer probability (Flux)
  attack: number;
  decay: number;
  pitch: number;
  gain: number;
  active: boolean;
  // Granular-only
  spray: number;
  density: number;
  grainSize: number;
  grainSpread: number;
}
```

### Voice Mix Modes

| Mode | Behavior |
|------|----------|
| **Stack** | All active voices play simultaneously, mixed by per-voice gain |
| **Cycle** | Round-robin per Euclidean trigger |
| **Euclidean** | Each Euclidean lane triggers a different voice |

---

## Euclidean Integration

4 Euclidean lanes → 4 voices maps naturally:

```
Lane 1: Voice 1 (clean)    pitch -12, pos LFO slow,  pattern 3/16  → bass drone drift
Lane 2: Voice 2 (clean)    pitch 0,   pos LFO med,   pattern 7/16  → mid-range scanning
Lane 3: Voice 3 (granular) pitch +12, grain oct 0.5,  pattern 5/16  → shimmer bursts
Lane 4: Voice 4 (granular) pitch 0,   spray 0.8,      pattern 11/16 → sparse glitch sparkle
```

Per-lane control: each lane triggers its assigned voice with the voice's own mode (clean or granular), blur, grain oct, pitch, and LFO settings.

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
Voice output (clean or granular)
  → Mandatory 2-3ms micro-fade (non-negotiable, 96-144 samples at 48kHz)
  → Per-voice attack/decay envelope
  → Blur: 4-stage allpass micro-diffusion (Flux-style, softens edges)
  → Grain Oct: probabilistic +12st shimmer (Flux-style, granular mode)
  → Gain compensation: 1/√(activeGrainCount) with smoothing ramp (granular mode)
  → Voice pan (manual + LFO)
  → Voice sum with gain control
  → Output soft limiter (tanh saturation)
  → Dry/wet mix
  → Master out / Delay send / Reverb send

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
| Buffer loop click | Always-record wrap | Crossfade write head at buffer boundary (5-10ms) |
| Slice boundary click | Mid-waveform cut | Zero-crossing snap + mandatory micro-fade |
| Voice sum clip | 4 voices summing | Per-voice gain + master soft limiter |
| Density clipping | 24+ grains summing | Gain = 1/√(N) per grain (granular mode only) |
| Blur instability | High allpass coefficient | Cap g at 0.7, prime delay lengths to avoid resonance |
| Subsonic buildup | Pitch-down feedback | HPF 30Hz in feedback return |
| Interpolation artifacts | Linear resampling | Cubic Hermite interpolation (4 muls/sample) |

---

## Ambient Pad Generation (Fully Wet)

No dedicated pad synth needed. The looper-chopper generates ambient pads via:

### Four Pad Modes

**1. Loop Forest Drift** (from ZOIA analysis)
- Clean mode, 4 voices, position LFOs at different slow rates (20-40s)
- Always-recording buffer continuously refreshes content
- Record LFOs probabilistically update buffer regions
- Result: self-evolving, drifting ambient landscape — no user interaction needed

**2. Flux Cloud** (from Flux analysis)
- Granular mode, high blur, moderate grain oct
- 16 auto-slices with spray randomization
- Decay envelope shapes each grain cloud
- Result: soft, diffused grain cloud with occasional shimmer sparkle

**3. Frozen Drone** (using Freeze)
- Freeze the always-recording buffer (stops write head)
- Clean mode, full 16s buffer as single slice, playback rate 0.25-0.5x
- High blur, position LFOs scanning slowly through frozen content
- Feedback disabled (preserve original material) or enabled (evolving drone)
- Result: infinite evolving drone from one captured moment — no new input needed

**4. Self-Generating Ambient** (Loop Forest + Flux hybrid)
- Always-recording enabled, feedback 50-70%
- Position LFOs scanning, grain oct providing shimmer
- Each feedback pass: filter darkens, blur smears further
- Result: self-evolving texture that erases source material over 3-4 passes

### Feedback Loop Creates the Pad

```
Pass 1: Original captured audio (clear)
Pass 2: Filtered + pitch-shifted (darker, lower)
Pass 3: Even darker, losing definition + blur smears boundaries
Pass 4: Almost pure tone (filter resonance + grain oct shimmer)
Pass 5+: Steady-state hum or evolving drone
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

## Codebase Audit: Current Engine State

### Existing Audio Graph (from engine.ts)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CURRENT AUDIO GRAPH                              │
│                                                                          │
│  PAD SYNTH (6 voices):                                                   │
│    Voice[0..5] → mixerGain → synthBus ─┬→ [UNIFIED LOOPER-GRANULAR]      │
│                                        │     → GranularFX Worklet          │
│                                        │       (replaces granulator)     │
│                                        │       → wetHPF → wetLPF         │
│                                        │         ├→ looperDirect ────→ M │
│                                        │         ├→ looperDelaySend → D  │
│                                        │         └→ looperReverbSend→ R  │
│                                        │   [Legacy: granulator.worklet   │
│                                        │    runs in parallel until       │
│                                        │    Phase 4 validation]          │
│                                        │                                 │
│                                        └→ dryBus ─┬→ synthDirect ──→ M  │
│                                                    └→ synthReverbSend→ R │
│                                                                          │
│  LEAD SYNTH (4op FM):                                                    │
│    leadGain → leadFilter                                                 │
│      ├→ leadDry ──────────────────────────────────────────────────→ M     │
│      ├→ leadDelayL ↔ leadDelayR (ping-pong) → merger → leadDelayMix → M  │
│      │    └→ leadDelayReverbSend ─────────────────────────────────→ R     │
│      └→ leadReverbSend ──────────────────────────────────────────→ R     │
│                                                                          │
│  DRUM SYNTH (DrumSynth class):                                           │
│    7 voices → voiceBusGains → drumMasterGain ────────────────────→ M     │
│    7 voices → delaySends → drumDelayL ↔ drumDelayR → drumDelayMix→ M    │
│    drumMasterGain → drumReverbSend ──────────────────────────────→ R     │
│                                                                          │
│  OCEAN SYNTH (worklet):                                                  │
│    oceanNode → oceanGain → oceanFilter ──────────────────────────→ M     │
│                                                                          │
│  R = REVERB:                                                             │
│    reverbNode (AudioWorklet "reverb") → reverbOutputGain ────────→ M     │
│                                                                          │
│  M = MASTER:                                                             │
│    masterGain → limiter (compressor) → destination/MediaStream           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Existing Effects Inventory

| Effect | Location | Type |
|--------|----------|------|
| **Algorithmic Reverb** | `reverb.worklet.ts` (420 lines) | AudioWorklet — 8-channel FDN |
| **Granular Synthesis** | `granulator.worklet.ts` (398 lines) | AudioWorklet — Hann-windowed grains, 4s buffer |
| **Lead Stereo Ping-Pong Delay** | `engine.ts` | Native `DelayNode` pair |
| **Drum Stereo Ping-Pong Delay** | `drumSynth.ts` | Native `DelayNode` pair with tone filter |
| **Granular Wet Filters** | `engine.ts` | HPF + LPF on granular output |
| **Per-Voice Dual Filters** | `engine.ts` | Filter A + Filter B in series/aOnly/bOnly routing |
| **Warmth / Presence EQ** | Per-voice | Low shelf + peaking EQ |
| **Saturation/Drive** | Per-voice | WaveShaper node |
| **Master Limiter** | `engine.ts` | DynamicsCompressor configured as limiter |

### Existing Granulator → Unified Replacement

The existing `granulator.worklet.ts` is a **subset** of the new engine. Every feature it has is reproduced (and improved) in the unified worklet:

| Capability | Existing Granulator | Unified Engine | Legacy Cloud Preset |
|------------|--------------------|-----------------|-----------------------|
| Buffer size | 4 seconds | 16 seconds | Position constrained to last 4s |
| Buffer write | Always (circular) | Always-recording + freeze | `freeze = false` (always writing) |
| Grain spawning | Density/spray/jitter | Density/spray + slice-aware | Spray-based (no slicing) |
| Pitch mode | Harmonic intervals (11 intervals) | Continuous ± semitones + harmonic mode | `pitchMode = 'harmonic'` |
| Grain envelope | Hann window | Hann window (same) | Same |
| Stereo | Per-grain pan spread | Per-voice pan + LFO | Spread mode |
| Feedback | 0–0.35, tanh clip | 0–0.85, HPF+LPF+RMS+tanh | 0–0.35 |
| Interpolation | Linear | Cubic Hermite (upgrade) | Cubic Hermite |
| Voices | 1 (implicit) | 4 independent | 1 active |
| Freeze | Not possible | Core feature | Available but off by default |
| Blur/Grain Oct | Not available | Per-voice | Off |
| LFO modulation | None | Position/record/reverse/pan | None |

**The existing `granulator.worklet.ts` is retired** once the unified engine is validated. The Legacy Cloud preset ensures the string waves sound is preserved and A/B testable.

### Legacy Cloud Mode

The unified worklet includes a `legacyMode` flag that configures the engine to exactly replicate the existing granulator's behavior:

```typescript
interface LegacyModeConfig {
  enabled: boolean;           // When true, engine uses legacy algorithm
  // Legacy-specific behavior:
  // - Buffer write range limited to 4s (circular within 16s buffer)
  // - Pitch uses HARMONIC_INTERVALS array instead of continuous semitones
  // - Grain position uses spray (ms) instead of slice + position offset
  // - Jitter and probability control grain triggering
  // - Single voice only (V1), V2-V4 disabled
  // - Blur = 0, grainOct = 0 (not in original)
  // - Feedback capped at 0.35
  // - No freeze, no LFOs, no slicing
}
```

**Purpose:** Side-by-side A/B testing during development. Load Legacy Cloud preset → compare with original `granulator.worklet.ts` output → validate that the unified engine reproduces the same sound quality. Once validated, the old worklet file and its routing in `engine.ts` can be removed.

#### Migration Path

```
Phase 1:  New unified worklet created, wired in parallel with existing granulator
          Both active — Legacy Cloud preset on new engine vs original granulator
          User can A/B test with the "string waves" sound

Phase 4:  After validation, existing granulator routing removed from engine.ts
          All granular state params (granularEnabled, maxGrains, density, spray,
          jitter, grainPitchMode, pitchSpread, stereoSpread, feedback, wetHPF,
          wetLPF) mapped to unified engine equivalents
          granulator.worklet.ts archived (not deleted, kept for reference)
```

#### State Param Mapping (Legacy → Unified)

| Existing Param | Unified Equivalent | Notes |
|----------------|-------------------|-------|
| `granularEnabled` | `looperEnabled` + Legacy Cloud preset | Enables unified engine in legacy config |
| `granularLevel` | `looperDryWet` | Output level |
| `granularReverbSend` | `looperReverbSend` | Reverb send amount |
| `maxGrains` | Voice 1 `density` × `grainSize` | Grain pool derived from density |
| `density` | Voice 1 `density` | Direct 1:1 |
| `spray` | Voice 1 `spray` | Direct 1:1 |
| `jitter` | Voice 1 jitter (legacy mode only) | Grain timing randomization |
| `grainProbability` | Voice 1 probability (legacy mode only) | Grain trigger chance |
| `grainSize` | Voice 1 `grainSize` | Direct 1:1 |
| `grainPitchMode` | Voice 1 `pitchMode` | `'harmonic'` uses HARMONIC_INTERVALS |
| `pitchSpread` | Voice 1 pitch range | For random mode |
| `stereoSpread` | Voice 1 pan spread | Direct 1:1 |
| `feedback` | Voice 1 feedback (capped 0.35) | Legacy cap preserved |
| `wetHPF` / `wetLPF` | Post-worklet filter nodes | Same external filter chain |

---

## Critical Gap: No Delay Send for Pad/Looper Path

### The Problem

Both the Microcosm and Mood use **delay before reverb** as a fundamental part of their sound:

- **Microcosm**: Granular engine → Delay (tempo-synced or free) → Reverb → Output
- **Mood**: Loop/granular channel → Delay channel (independent) → shared reverb → Output

The current pad synth path has **no delay anywhere**:

```
Pad voices → synthBus → Granulator → WetHPF → WetLPF → [direct + reverb send]
                      → DryBus → [direct + reverb send]
```

The lead synth and drum synth each have their own isolated ping-pong delays, but these are per-instrument — the looper output cannot reach them.

### Why This Matters for Mosaic/Mood Sounds

| Sound | Role of Delay |
|-------|---------------|
| **Mosaic C (Shimmer)** | Delay feedback + pitch-shift accumulation smears grain boundaries into continuous tones |
| **Mood Ambient Glitch** | >50% of the character is the delay tail interacting with glitched fragments |
| **Mosaic A/B (Octave)** | Tempo-synced delay creates rhythmic doubling of pitch-shifted grains |
| **Mood Slip Mode** | Delay stretches micro-loops into ambient textures |

**Without delay between looper and reverb:** you get dry glitch fragments → washed reverb. You miss the rhythmic echo/smear middle ground that defines both pedals.

### Required: Looper Multi-Tap Delay (Microcosm-Style)

The Microcosm uses a **multi-tap delay with an Activity macro**, not a simple ping-pong. The Activity knob progressively enables more delay taps at musically-related subdivisions, introducing syncopation and density. The Repeats knob controls feedback duration. This is the core of the Microcosm's rhythmic character.

Our implementation uses **8 native `DelayNode` taps** with per-tap gain control driven by a single Activity macro:

```
LooperNode → LooperDelaySend ─┬→ Tap1 (1/4 note)     gain: always on           pan: L
                               ├→ Tap2 (1/8 note)     gain: Activity > 0.15     pan: R
                               ├→ Tap3 (1/8 dotted)   gain: Activity > 0.3      pan: L
                               ├→ Tap4 (1/16 note)    gain: Activity > 0.4      pan: R
                               ├→ Tap5 (1/8 triplet)  gain: Activity > 0.55     pan: L  ← syncopation
                               ├→ Tap6 (1/16 triplet) gain: Activity > 0.65     pan: R
                               ├→ Tap7 (3/16 note)    gain: Activity > 0.8      pan: L  ← shuffle
                               └→ Tap8 (1/32 note)    gain: Activity > 0.9      pan: R  ← dense wall
                                       ↓ all taps
                               Feedback sum → Tone LPF → back to input
                               ↓
                               Stereo tap mix → DelayMix → Master
                                              → DelayReverbSend → Reverb
```

#### Activity Macro Behavior (Microcosm-Style)

As Activity increases, the delay passes through these stages:

| Activity Range | Behavior | Character |
|---------------|----------|----------|
| 0.0–0.15 | 1 tap (1/4 note) | Clean, simple echo |
| 0.15–0.3 | 2 taps (1/4 + 1/8) | Classic ping-pong feel |
| 0.3–0.5 | 3-4 taps (add dotted + 1/16) | Rhythmic pattern emerges |
| 0.5–0.7 | 5-6 taps (add triplets) | Syncopation, groove/shuffle |
| 0.7–0.9 | 7 taps (add 3/16 shuffle) | Dense overlapping rhythms |
| 0.9–1.0 | All 8 taps active | Wall of sound, taps blur together |

Secondary tap gains also scale with Activity — at low values, secondary taps are quieter; at high values they approach the primary tap's volume, increasing the perceived intensity.

#### Repeats (Feedback) Behavior

The Repeats knob controls how many times the entire tap pattern cycles:
- **Low (0–0.3):** Pattern plays once or twice then fades — clean rhythmic echo
- **Mid (0.3–0.6):** 3-5 cycles — patterns develop and evolve
- **High (0.6–0.85):** Old cycles bleed into new ones — dense, shimmering walls where individual taps become less distinct
- Each feedback pass goes through the tone filter, so repeats darken progressively

#### Vibrato (Shift+Repeats Equivalent)

Optional pitch modulation applied to tap outputs via slow LFO:
- At 0: no modulation (clean taps)
- At 0.3: subtle chorus-like shimmer
- At 0.7+: unstable, pitch-warped taps (Microcosm "Warp" character)
- Implementation: per-tap LFO modulates `delayTime` by ±2-8ms at 0.5-3Hz

#### State Params

| Parameter | Range | Description |
|-----------|-------|-------------|
| `looperDelayActivity` | 0–1 | Macro: tap count + syncopation + secondary tap intensity |
| `looperDelayRepeats` | 0–0.85 | Feedback: how many full pattern cycles before fade |
| `looperDelayTime` | Note division or ms | Base time grid (1/4 note default). All 8 taps derive subdivisions from this |
| `looperDelayFilter` | 0–1 (maps to Hz) | Tone LPF cutoff in feedback path — darkens each repeat cycle |
| `looperDelayVibrato` | 0–1 | Pitch modulation depth on taps (LFO-modulated delay time) |
| `looperDelayMix` | 0–1 | Wet/dry blend for entire delay output |
| `looperDelayReverbSend` | 0–1 | How much delay output feeds into reverb |

#### CPU Cost

8 native `DelayNode`s + 8 `GainNode`s + 1 `BiquadFilterNode` + feedback routing = **<1% CPU**. Web Audio native nodes are extremely efficient. The multi-tap design adds negligible cost over the original 2-tap ping-pong.

**Effort:** ~3 days (1 day more than ping-pong, for Activity macro logic and tap scheduling).

---

## Reverb Audit: Detailed Findings

### What the Reverb Has (reverb.worklet.ts — 420 lines)

- 8-channel FDN with Hadamard orthogonal mixing matrix
- 32 allpass diffuser stages (6 pre + 4 mid + 6 post, × 2 channels)
- 4 ultra-slow triangle LFOs (0.023–0.053 Hz, 19–43s cycles) modulating delay times ±1.5%
- One-pole lowpass dampers per FDN channel (cuts highs only)
- DC blockers per channel
- Rational soft clipper in feedback: `x > 1 → 1 - 1/(x+1)`
- Predelay up to 300ms
- Presets: plate, hall, cathedral, darkHall
- Quality modes: ultra, balanced, lite
- FDN delay times (ms): `[37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3]` × size multiplier

### What the Reverb is Missing

| Feature | Status | Impact | Fix Effort |
|---------|--------|--------|------------|
| **HPF in FDN feedback** | MISSING | Low-end mud accumulates on long decays, especially with pitch-down looper feedback | ~10 lines: add one-pole HPF at 30–40Hz per FDN channel alongside existing lowpass damper |
| **Infinite/freeze mode** | MISSING — capped at 0.995 | Cannot hold reverb tail indefinitely for drone pad mode | ~5 lines: add `infinite` boolean, feedback = 1.0, optionally mute input |
| **Low-frequency damping** | MISSING | `damping` param only controls high-end rolloff (lowpass) | Could share HPF coefficient with a user-facing param |
| **Shimmer (pitch-shifted feedback)** | MISSING | No octave-up in FDN feedback — looper handles this via grain pitch instead | Not needed if looper delay provides the pitch-shift accumulation |
| **Input HPF** | MISSING | No filtering before diffusers | Minor — looper's own output filters handle this |

### Reverb Fixes Required Before Looper

**1. FDN Feedback HPF (Required)**

Add a one-pole highpass at 30–40Hz per FDN channel. Without this, the looper's pitch-down grains feeding back through reverb will create subsonic mud on long decays. Implementation: add `hpState[8]` array, apply `y = x - hpState + 0.995 * hpState` per sample alongside the existing lowpass damper.

**2. Infinite/Freeze Mode (Recommended)**

For "frozen drone" pad mode: when `infinite = true`, set feedback gain to 1.0 and optionally zero the input. The reverb tail becomes a static, slowly evolving texture. Add a new `AudioParam` or message-based toggle.

---

## Worklet Build Pattern (Important)

Worklets are **NOT** compiled by Vite from TypeScript sources. They are served as pre-built JS files from `public/ARCHIVE/worklets/`:

```typescript
// engine.ts — worklet loading pattern
const getWorkletUrl = (filename: string): string => {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/ARCHIVE/worklets/${filename}`;
};
const granulatorWorkletUrl = getWorkletUrl('granulator.worklet.js');
const reverbWorkletUrl = getWorkletUrl('reverb.worklet.js');
const oceanWorkletUrl = getWorkletUrl('ocean.worklet.js');
```

**To add the looper worklet:**
1. Create `src/audio/worklets/granular-fx.worklet.ts` (TypeScript source)
2. Compile to `public/ARCHIVE/worklets/granular-fx.worklet.js`
3. Add `const looperWorkletUrl = getWorkletUrl('granular-fx.worklet.js');` in engine.ts
4. Register with `await this.ctx.audioWorklet.addModule(looperWorkletUrl);`
5. Instantiate with `new AudioWorkletNode(ctx, 'granular-fx-processor', { ... })`

---

## Prerequisite Work Order

These must be completed **before** starting the looper worklet, or integrated into Phase 1:

### Prereq 1: Reverb HPF in FDN Feedback (~1 hour)
- Add one-pole HPF at 30–40Hz per FDN channel in `reverb.worklet.ts`
- Prevents low-end mud when looper pitch-down grains feed long reverb decays
- ~10 lines of code

### Prereq 2: Reverb Infinite/Freeze Mode (~1 hour)
- Add `infinite` boolean parameter to `reverb.worklet.ts`
- When true: feedback = 1.0, optionally mute input
- ~5 lines of code

### Prereq 3: Looper Multi-Tap Delay Routing (~3 days)
- Add Microcosm-style 8-tap delay for looper output in `engine.ts`
- 8 native `DelayNode` taps at musically-related subdivisions (1/4, 1/8, 1/8d, 1/16, 1/8t, 1/16t, 3/16, 1/32)
- Activity macro controls per-tap gain enabling (progressive density + syncopation)
- Repeats knob controls feedback (sum of taps → tone LPF → back to input)
- Vibrato: per-tap LFO on delay time for shimmer/warp effect
- Stereo pan alternates taps L/R for spatial width
- Route: `looperOutput → delaySend → 8 taps → stereo mix → delayMix → master` + `→ delayReverbSend → reverb`
- Add state params to `state.ts`: `looperDelayActivity`, `looperDelayRepeats`, `looperDelayTime`, `looperDelayFilter`, `looperDelayVibrato`, `looperDelayMix`, `looperDelayReverbSend`
- This must be wired in Phase 1 or the looper will sound nothing like Microcosm/Mood

### Prereq Summary

| Prereq | Effort | Blocks |
|--------|--------|--------|
| Reverb HPF | ~1 hour | Phase 4 (feedback routing) |
| Reverb freeze | ~1 hour | Phase 4 (frozen drone mode) |
| Looper multi-tap delay | ~3 days | Phase 1 (core sound identity) |
| **Total prereq work** | **~3.5 days** | |

---

## Updated CPU Budget (with Multi-Tap Delay + Blur + Grain Oct)

| Component | Est. CPU | Notes |
|-----------|----------|-------|
| Looper worklet — clean mode (4 voices, LFOs, blur) | ~4-6% | Loop Forest equivalent |
| Looper worklet — granular mode (4 voices, density 24) | ~10-14% | Mosaic shimmer equivalent |
| Blur (4-stage allpass × 4 voices) | ~1% | Included in above, broken out for reference |
| Grain Oct (probabilistic +12st) | Negligible | 1 conditional per grain spawn |
| Multi-tap delay (8 native DelayNodes) | <1% | Web Audio native nodes |
| Reverb | ~6% | Existing, plus HPF adds negligible cost |
| **Typical total (clean + delay + reverb)** | **~11-13%** | Loop Forest mode |
| **Heavy total (granular + delay + reverb)** | **~17-21%** | Mosaic shimmer mode, well within budget |

---

## Implementation Phases

### Phase 0: Prerequisites (3.5 days)
- Add one-pole HPF at 30–40Hz in reverb FDN feedback loop (`reverb.worklet.ts`, ~10 lines)
- Add infinite/freeze mode to reverb (`reverb.worklet.ts`, ~5 lines)
- Recompile reverb worklet to `public/ARCHIVE/worklets/reverb.worklet.js`
- Build Microcosm-style 8-tap delay in `engine.ts`:
  - 8 `DelayNode` taps at note subdivisions (1/4, 1/8, 1/8d, 1/16, 1/8t, 1/16t, 3/16, 1/32)
  - Per-tap `GainNode` controlled by Activity macro (progressive enable + intensity)
  - Alternating L/R stereo panning per tap
  - Feedback sum → tone `BiquadFilterNode` (lowpass, darkens per cycle) → back to tap inputs
  - Vibrato: per-tap LFO modulating `delayTime` ±2-8ms at 0.5-3Hz
  - Output: stereo merge → `delayMix` → master + `delayReverbSend` → reverb
- Add delay state params to `state.ts`: `looperDelayActivity`, `looperDelayRepeats`, `looperDelayTime`, `looperDelayFilter`, `looperDelayVibrato`, `looperDelayMix`, `looperDelayReverbSend`
- **Deliverable**: Reverb ready for long granular decays; multi-tap delay fully wired and testable standalone

### Phase 1: Always-Recording Buffer + Clean Playback + Delay (7 days)
- New `GranularFXWorkletProcessor` with 16s **always-recording** circular buffer (Flux-style)
- Auto-slice into 16 equal divisions (Flux-style, no draggable markers)
- 4 voices with slice select, speed, reverse, basic envelope
- **Legacy mode** flag: when enabled, constrains buffer to 4s range, uses `HARMONIC_INTERVALS`, spray-only position, jitter/probability params
- Position LFO per voice for slow buffer scanning (Loop Forest-style)
- Clean mode playback with mandatory micro-fade envelope
- Blur: 4-stage allpass diffusion per voice (Flux-style, inside worklet)
- Wire into audio graph with **three output paths**: direct, multi-tap delay send, reverb send
- **Wire in parallel** with existing `granulator.worklet.ts` for A/B testing (both receive synthBus)
- Connect looper output to multi-tap delay (built in Phase 0)
- Compile worklet to `public/ARCHIVE/worklets/granular-fx.worklet.js`
- UI: Freeze toggle (pauses always-record), dry/wet mix, Activity knob, Repeats knob, speed, blur
- Legacy Cloud preset: matches existing granulator params (density 20, spray 100, harmonic pitch, feedback 0.1)
- **Deliverable**: Always-recording → auto-slice → 4-voice clean playback with position LFOs → blur → multi-tap delay cascade → reverb. Legacy Cloud preset reproducible for A/B comparison. This alone achieves Loop Forest textures.

### Phase 2: Granular Mode + Shimmer (5 days)
- Clean/Granular toggle per voice (Flux-style binary switch)
- Granular mode: grain burst spawning with density, grain size, spread
- Spray: position randomization within slice bounds (Flux)
- Grain Oct: probabilistic +12st shimmer per grain spawn (Flux)
- Per-voice pitch shifting with cubic interpolation (±12 semitones)
- Scale-aware pitch quantization for grain oct and manual pitch
- Per-voice attack/decay envelope (2-3ms minimum fade enforced)
- Anti-aliasing pre-filter for pitch-up playback
- Gain compensation: 1/√(activeGrainCount)
- UI: Clean/Granular toggle, Spray, Grain Oct, Density, Pitch, Attack, Decay sliders
- **Deliverable**: Full Clean + Granular engine with Flux-style shimmer and Mosaic grain clouds

### Phase 3: LFO Modulation + Euclidean (5 days)
- Position LFO depth and rate per voice (Loop Forest-style buffer scanning)
- Record LFO: probabilistic record enable/disable per voice (Loop Forest)
- Reverse LFO: periodic direction flip per voice (Loop Forest)
- Pan LFO: slow stereo movement per voice (Loop Forest)
- Euclidean lane → voice mapping (4 lanes → 4 voices)
- Per-lane density control (1-32 grains per hit, granular mode only)
- Mosaic variation presets (A/B/C/D as preset configurations)
- UI: LFO rate/depth controls, Euclidean integration, preset selector
- **Deliverable**: Self-modulating Loop Forest textures with Euclidean sequencing

### Phase 4: Feedback + Tension + Legacy Validation + Polish (5 days)
- Feedback routing with HPF 30Hz + LPF (user-controlled)
- tanh soft limiter on output
- RMS-based auto-gain on feedback path
- Tension → voice parameter modulation (pitch, blur, grain oct, density, decay)
- SliderMode integration (fixed/walk/sampleHold per voice param)
- Reference presets: Loop Forest, Mood Slip, Mosaic Shimmer, Flux Cloud, Self-Generating
- Buffer silence detection (gate freeze when RMS < threshold)
- **Legacy Cloud A/B validation**: compare unified engine (Legacy Cloud preset) with original `granulator.worklet.ts` output side-by-side
- **Legacy migration**: once validated, map existing granular state params (`granularEnabled`, `density`, `spray`, `jitter`, `grainPitchMode`, `pitchSpread`, `stereoSpread`, `feedback`, `granularLevel`, `granularReverbSend`, `wetHPF`, `wetLPF`) to unified engine equivalents
- **Retire old granulator**: remove `granulatorNode`, `granulatorInputGain`, `granularWetHPF/LPF`, `granularReverbSend`, `granularDirect` from engine.ts graph; archive `granulator.worklet.ts`
- **Deliverable**: Self-generating ambient pads, tension-linked, preset-configurable, anti-artifact complete. Legacy Cloud validated and original granulator retired.

### Phase 5: Waveform UI (4 days) — Optional
- Canvas-based waveform display of capture buffer
- Slice markers (draggable)
- Layer indicators (which layer is active, frozen indicator)
- Grain activity visualization (sparkles at active grain positions)
- **Deliverable**: Visual feedback for the looper

---

## Total Effort: ~25-29 days

Phase 0 (prereqs) = ~3.5 days.
Phase 1-4 = ~22 days for full functionality including legacy validation.
Phase 5 = +4 days for visual feedback.

Phase 0 + Phase 1 (~10.5 days) delivers a usable Microcosm/Mood/Loop Forest-like instrument with always-recording buffer, clean playback with position LFOs, blur diffusion, multi-tap delay cascade, and Legacy Cloud preset for A/B testing against the original granulator.

> **Note:** Phase 0's multi-tap delay is testable standalone — feed any audio through it
> and sweep Activity from simple echo to dense rhythmic cascade. Phase 1 alone achieves
> Loop Forest-quality ambient textures (clean mode + position LFOs + blur + delay).
> Phase 2 adds Mosaic/Flux granular clouds and shimmer. Phase 3 adds self-modulating LFOs.
> Phase 4 validates Legacy Cloud and retires the old granulator — until then, both run in parallel.

---

## Files to Create/Modify

### New Files
- `src/audio/worklets/granular-fx.worklet.ts` — Core worklet (always-recording buffer, 16 auto-slices, 4 voices, clean/granular modes, blur allpass, grain oct shimmer, position/record/reverse/pan LFOs, feedback)
- `src/audio/granularFX.ts` — Main-thread controller (param management, Euclidean integration)
- `src/ui/GranularFXPanel.tsx` — UI component

### Modified Files
- `src/audio/engine.ts` — Wire looper into audio graph with **three output paths** (direct, multi-tap delay send, reverb send), add Microcosm-style 8-tap delay (8 `DelayNode`s + per-tap `GainNode`s + tone filter feedback + vibrato LFOs + Activity macro logic), add to `createAudioGraph()` and `applyParams()`
- `src/ui/state.ts` — Add looper state fields: **per-voice** (`looperVoiceMode`, `looperSliceSelect`, `looperSpeed`, `looperReverse`, `looperAttack`, `looperDecay`, `looperPitch`, `looperGrainOct`, `looperBlur`, `looperSpray`, `looperDensity`, `looperGrainSize`, `looperPan`, `looperPositionLFORate`, `looperPositionLFODepth`, `looperReverseLFORate`, `looperPanLFORate`, `looperRecordLFORate`), **global** (`looperEnabled`, `looperDryWet`, `looperFeedback`, `looperFreeze`, `looperFreezeWithFeedback`), **multi-tap delay** (`looperDelayActivity`, `looperDelayRepeats`, `looperDelayTime`, `looperDelayFilter`, `looperDelayVibrato`, `looperDelayMix`, `looperDelayReverbSend`)
- `src/App.tsx` — Add GranularFXPanel to UI, wire slider handlers
- `src/audio/worklets/reverb.worklet.ts` — Add HPF in FDN feedback (one-pole 30–40Hz per channel), add infinite/freeze mode (feedback = 1.0, optional input mute), extend size range (minor, ~15 lines total)

### Retired Files (Phase 4, after Legacy Cloud validation)
- `src/audio/worklets/granulator.worklet.ts` — Archived (moved to `src/audio/worklets/ARCHIVE/`), replaced by unified `granular-fx.worklet.ts`
- `public/ARCHIVE/worklets/granulator.worklet.js` — Archived, no longer loaded
- Engine.ts routing removed: `granulatorNode`, `granulatorInputGain`, `granularWetHPF`, `granularWetLPF`, `granularReverbSend`, `granularDirect`
- State.ts params remapped: `granularEnabled` → `looperEnabled` + Legacy Cloud preset, `density`/`spray`/`jitter` etc. → unified voice params

### Build Process (Not Vite — Manual Compile)
- Worklets are served as pre-built JS from `public/ARCHIVE/worklets/`, NOT compiled by Vite
- Create `.worklet.ts` source → compile to `.js` → place in `public/ARCHIVE/worklets/`
- Add URL constant in `engine.ts`: `const looperWorkletUrl = getWorkletUrl('granular-fx.worklet.js');`
- Register: `await this.ctx.audioWorklet.addModule(looperWorkletUrl);`
