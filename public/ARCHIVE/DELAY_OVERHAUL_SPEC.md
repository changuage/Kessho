Delay Overhaul Spec — Echo Line + Clocked Space

> Complete developer spec for DSP updates, UI aesthetic alignment, and all four visualizations (A/B/C/D).

### Implementation Status

| Section | Status | Notes |
|---------|--------|-------|
| 1. Naming | **Done** | Echo Line / Clocked Space labels in DelayPage.tsx |
| 2. Echo Line DSP | **Done** | Ping-pong, mod, duck, filter type, width, A→B cross-feed filter wired in `delayBuses.ts` |
| 3. Clocked Space DSP | **Done (partial)** | Patterns, spread, tone macro, B→A send, warp modes wired. **`pitchDrift` and `grainCrossfade` are first-pass node-native approximations** — not full dedicated pitch/grain worklets yet |
| 4. Master Bus Saturation | **Done** | 3 params (`masterSatDrive`, `masterSatMode`, `masterSatTone`) wired in `engine.ts` master chain |
| 5. Cross-Feed Enhancements | **Done** | B→A send + cross-feed filter wired; RoutingMatrix B→A unblocked |
| 6. New Parameters | **Done** | All 14 params added to `state.ts` (defaults, ranges, serialization, URL decode) |
| 7. UI Aesthetic Overhaul | **Done** | delay.css rewritten with shared design tokens, card pattern, two-panel layout |
| 8. UI Layout Restructure | **Done** | Two-panel layout, expand/collapse cards, feed badges, all 14 new controls exposed |
| 9. Viz A — Rhythm Map | **Done** | `DelayRhythmMap.tsx` — animated canvas, 30fps, Echo Line + Clocked Space taps, cross-feed arcs, playhead |
| 10. Viz B — Algorithm Card | **Done** | `DelayAlgorithmCard.tsx` — 260×60 static canvas, pattern shape + warp overlay |
| 11. Viz C — Live Delay Scope | **Done** | `DelayScope.tsx` — accepts AnalyserNode props (null until wired), ring buffer, dual-lane scrolling bars |
| 12. Viz D — Preset Thumbnails | **Done** | `DelayThumbnail.tsx` — 40×24 tiny canvases inline in pattern/warp mode buttons |

**Key files modified (DSP):**
- `src/ui/state.ts` — lines 84, 1052, 1701, 3364
- `src/audio/delayBuses.ts` — lines 151 (Delay A), 369 (Delay B)
- `src/audio/engine.ts` — lines 272, 701, 841, 965, 4965

**Build status:** `vite build` passes. No new TS errors from delay/master DSP.

---

## Table of Contents

1. [Naming](#1-naming)
2. [DSP Updates — Echo Line (Delay A)](#2-dsp-updates--echo-line-delay-a)
3. [DSP Updates — Clocked Space (Delay B)](#3-dsp-updates--clocked-space-delay-b)
4. [DSP Updates — Master Bus Saturation](#4-dsp-updates--master-bus-saturation)
5. [DSP Updates — Cross-Feed Enhancements](#5-dsp-updates--cross-feed-enhancements)
6. [New Parameters Summary](#6-new-parameters-summary)
7. [UI Aesthetic Overhaul](#7-ui-aesthetic-overhaul)
8. [UI Layout Restructure](#8-ui-layout-restructure)
9. [Visualization A — Rhythm Map](#9-visualization-a--rhythm-map)
10. [Visualization B — Algorithm Card](#10-visualization-b--algorithm-card)
11. [Visualization C — Live Delay Scope](#11-visualization-c--live-delay-scope)
12. [Visualization D — Preset Signature Thumbnails](#12-visualization-d--preset-signature-thumbnails)

---

## 1. Naming

| Current | New Name | Rationale |
|---------|----------|-----------|
| Delay A / Simple Delay | **Echo Line** | Evokes single-line tape delay. Clean, direct, linear. |
| Delay B / Shared Multi-Tap Bus | **Clocked Space** | Already used internally. Captures BPM-synced spatial character. |

Update labels in:
- `DelayPage.tsx` — card titles, kicker text, hero copy
- `sliderHelpCatalog.ts` — all delay help entries
- `RoutingMatrix.tsx` — column labels for `delayA`/`delayB`
- Delay preset display names

---

## 2. DSP Updates — Echo Line (Delay A)

### Current signal chain (reference)

```
input ──┬──→ delayL → filterL → feedbackL → delayR (cross-feed for ping-pong)
        └──→ delayR → filterR → feedbackR → delayL
                       │              │
                filterL → merger[0]   │
                filterR → merger[1]   │
                              │
                           limiter → directGain → masterOut
                                   → reverbSendGain → reverbIn
                                   → delayBSendGain → delayB.input
                                   → granularSendGain → granularIn

modOsc → modDepthL → delayL.delayTime
modOsc → modDepthR → delayR.delayTime
```

### 2.1 Ping-Pong Toggle

**What:** Alternates L→R on each repeat instead of parallel independent L/R taps.

**Current state:** The cross-feedback path (`filterL → feedbackL → delayR` and vice versa`) already exists but runs
at the same gain as the direct feedback. True ping-pong requires:
1. Setting direct feedback (L→L, R→R) to 0
2. Routing only cross-feedback (L→R, R→L) at the feedback level

**Implementation:**
- New param: `delayAPingPong: boolean` (default `false`)
- In `SharedDelayBusA.update()`:
  - When `pingPong = false` (current behavior): `feedbackL.gain = feedback`, `feedbackR.gain = feedback`, cross-feedback = 0
  - When `pingPong = true`: `feedbackL.gain = 0`, `feedbackR.gain = 0`, cross-feedback L→R and R→L = `feedback`
- Requires 2 additional `GainNode`s for the cross-feedback path if not already wired — check if the current `feedbackL → delayR` connection exists. If so, just gate the existing nodes.

**Nodes added:** 0–2 `GainNode` (cross-feedback gating), depending on current wiring.

### 2.2 Modulation Exposure

**What:** Expose the already-built LFO→delayTime path in the UI.

**Current state:** `modOsc`, `modDepthL`, `modDepthR` nodes exist in `SharedDelayBusA`. The `modRateHz` and `modDepthMs` params exist in `DelayBusAParams` but are hardcoded to 0 in `getSharedDelayAState()`.

**Implementation:**
- New params: `delayAModRate: number` (0–1 mapped to 0.05–5 Hz), `delayAModDepth: number` (0–1 mapped to 0–50ms)
- In `getSharedDelayAState()`: map `state.delayAModRate` → Hz, `state.delayAModDepth` → Ms
- No new audio nodes — just wire existing state keys to existing params

**Nodes added:** 0.

### 2.3 Duck / Sidechain

**What:** Wet signal dips when dry input is present, swells in gaps. Creates a pumping effect where
echoes bloom between notes.

**Implementation:**
- New params: `delayADuck: number` (0–1, 0 = off, 1 = full ducking)
- Add an `AnalyserNode` on the input to detect envelope level (or use a follower: `input → abs → follower GainNode`)
- Simpler alternative: use a `DynamicsCompressorNode` as a ducker:
  1. Create `duckCompressor` after `limiter`, before `directGain`
  2. Feed `input` as the sidechain key input (use `DynamicsCompressorNode` with the input signal as the analysis source)
  3. Web Audio doesn't support external sidechain — so use the **gain modulation** approach instead:
     - In `update()`, read `input.gain` (or track whether input is active via source send levels)
     - When input is loud: `directGain.gain → directGain * (1 - duckAmount)`
     - When input is quiet: `directGain.gain → directGain * 1.0`
     - Use `setTargetAtTime` with a fast attack (~0.01s) and slow release (~0.3s)
- Best approach: **ScriptProcessorNode / AudioWorkletNode** envelope follower that modulates `directGain`:
  ```
  input ──→ envelopeFollower (worklet) ──→ duckGain.gain (inverted)
  limiter ──→ duckGain ──→ directGain
  ```
  The worklet outputs a control signal: `1.0 - (envelope * duckAmount)`

**Nodes added:** 1 `GainNode` (duckGain) + envelope follower (worklet or JS-side polling of AnalyserNode in `update()` loop).

**Simpler JS-side approach (recommended for v1):**
- In `update()`, already called every animation frame:
  1. Read the input signal level from an `AnalyserNode` attached to `input`
  2. Compute envelope: `env = Math.max(env * 0.95, currentPeak)` (fast attack, slow decay)
  3. Set `directGain.gain = mix * (1 - env * duckAmount)` via `setTargetAtTime`
- Add one `AnalyserNode` on `input`. Costs: 1 FFT per frame (128-bin, cheap).

### 2.4 Filter Type Selector

**What:** Expose LP/BP/HP selection for the feedback filter. Currently hardcoded to `lowpass`.

**Current state:** `filterL` and `filterR` are `BiquadFilterNode` with `type = 'lowpass'`.

**Implementation:**
- New param: `delayAFilterType: 'lowpass' | 'bandpass' | 'highpass'` (default `'lowpass'`)
- In `update()`:
  ```ts
  if (this.filterL.type !== params.filterType) {
    this.filterL.type = params.filterType;
    this.filterR.type = params.filterType;
  }
  ```
- Adjust Q for each type: lowpass Q=0.7 (current), bandpass Q=2.0, highpass Q=0.7

**Nodes added:** 0.

### 2.5 Stereo Width

**What:** Control the stereo spread of repeats from mono-summed through natural to exaggerated Haas widening.

**Implementation:**
- New param: `delayAWidth: number` (0–1, 0 = mono, 0.5 = natural, 1 = hyper-wide)
- After the merger (which combines L/R to stereo), add a mid-side processor:
  1. Create `widthGain` node that cross-blends L/R channels
  2. Simpler: use the existing `delayL` and `delayR` time offset. At width=0, both times are identical (mono). At width=0.5, use the set L/R times. At width=1.0, add a Haas offset (0.5–15ms) to one channel.
  3. In `update()`:
     ```ts
     const haasOffset = (width - 0.5) * 2 * 0.015; // 0-15ms extra offset
     const timeL = baseTimeL;
     const timeR = baseTimeR + (width > 0.5 ? haasOffset : 0);
     // At width < 0.5, blend toward mono by averaging times
     const monoBlend = Math.max(0, 1 - width * 2);
     const avg = (timeL + timeR) / 2;
     const finalL = timeL * (1 - monoBlend) + avg * monoBlend;
     const finalR = timeR * (1 - monoBlend) + avg * monoBlend;
     ```

**Nodes added:** 0 (reuses existing delay time modulation).

### Echo Line — Updated Signal Chain

```
input ──┬──→ delayL → filterL(LP/BP/HP) ─→ feedbackL ──→ delayR ← (ping-pong)
        │                                    │               OR
        │                                    └───────────→ delayL ← (normal)
        └──→ delayR → filterR(LP/BP/HP) ─→ feedbackR ──→ delayL ← (ping-pong)
                                             │               OR
                                             └───────────→ delayR ← (normal)
              │              │
        filterL → merger[0]  │
        filterR → merger[1]  │
                     │
                  limiter → duckGain → directGain → masterOut
                                     → reverbSendGain → reverbIn
                                     → delayBSendGain → delayB.input
                                     → granularSendGain → granularIn

envelopeAnalyser ← input  (duck control signal, JS-side)
modOsc → modDepthL → delayL.delayTime  (+ width offset)
modOsc → modDepthR → delayR.delayTime  (+ width offset)
```

---

## 3. DSP Updates — Clocked Space (Delay B)

### 3.1 Pattern Presets

**Concept:** Named rhythmic arrangements of the 8 tap timing subdivisions, gains, and pan positions.
The user selects a Pattern; internally it reconfigures all 8 taps simultaneously. The `Activity` slider
still progressively enables taps 1→8 within whatever pattern is active.

**New param:** `delayBPattern: 'cascade' | 'golden' | 'mirror' | 'dotted'` (default `'cascade'`)

**Pattern data table:**

```ts
interface PatternPreset {
  subdivisions: [number, number, number, number, number, number, number, number];
  gains: [number, number, number, number, number, number, number, number];
  pans: [number, number, number, number, number, number, number, number];
}

const PATTERN_PRESETS: Record<string, PatternPreset> = {
  cascade: {
    // Current default — progressive subdivision ramp
    subdivisions: [1.0, 0.5, 0.75, 0.25, 1/3, 1/6, 0.375, 0.125],
    gains: [1.0, 0.85, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
    pans: [-0.7, 0.7, -0.5, 0.5, -0.8, 0.8, -0.3, 0.3],
  },
  golden: {
    // φ-ratio intervals — organic, non-repeating spacing
    // Each tap at baseTime × φ^n where φ = 1.618
    subdivisions: [1.0, 0.618, 0.382, 0.236, 0.146, 0.090, 0.056, 0.034],
    gains: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
    pans: [-0.3, 0.5, -0.7, 0.2, -0.5, 0.8, -0.2, 0.6],
  },
  mirror: {
    // Symmetric L/R — call-and-response between speakers
    subdivisions: [0.5, 0.5, 0.75, 0.75, 1.0, 1.0, 0.25, 0.25],
    gains: [1.0, 1.0, 0.8, 0.8, 0.65, 0.65, 0.5, 0.5],
    pans: [-0.8, 0.8, -0.6, 0.6, -0.4, 0.4, -0.9, 0.9],
  },
  dotted: {
    // All dotted subdivisions — behind-the-beat, rolling dub feel
    subdivisions: [1.5, 0.75, 0.375, 1.125, 0.5625, 0.28125, 0.1875, 0.09375],
    gains: [1.0, 0.88, 0.76, 0.68, 0.58, 0.48, 0.4, 0.32],
    pans: [-0.6, 0.6, -0.4, 0.4, -0.7, 0.7, -0.5, 0.5],
  },
};
```

**Implementation in `SharedDelayBusB.update()`:**
1. Look up `PATTERN_PRESETS[params.pattern]` (or fall back to `cascade`)
2. When mode is `standard` (not `diffuse`), use pattern subdivisions instead of `TAP_SUBDIVISIONS`
3. When mode is `diffuse`, continue using `DIFFUSE_TAP_FACTORS` (patterns don't apply in diffuse mode)
4. Apply pattern gains as the `maxGain` multiplier in `computeTapGain()`:
   `tapGain = computeTapGain(i, activity) * patternPreset.gains[i]`
5. Set `tapPanners[i].pan = patternPreset.pans[i]` (smoothed via `setTargetAtTime`)

**No new audio nodes.** Just reconfiguring existing tap DelayNode times, GainNode gains, and StereoPannerNode pans.

### 3.2 Warp Modes

**Concept:** Per-tap processing character applied as named algorithms, not individual knobs.
Each Warp mode optionally adds processing nodes after each tap's delay output. A single `Intensity` slider
controls the wet amount of the warp processing.

**New params:**
- `delayBWarp: 'clean' | 'filterSweep' | 'pitchDrift' | 'grainCrossfade'` (default `'clean'`)
- `delayBWarpIntensity: number` (0–1, default 0.5)

#### 3.2.1 Warp: Clean

No per-tap processing. Current behavior. No new nodes.

#### 3.2.2 Warp: Filter Sweep

Each tap gets a resonant bandpass filter at a different center frequency. Tap 1 = low, tap 8 = high. Creates a
spectrum cascade where repeats shift in tonal color through the frequency range.

**Nodes per tap:** 1 `BiquadFilterNode` (bandpass, Q=3)

```
tapDelay[i] → tapGain[i] → warpFilter[i] → warpDryWet → tapPanner[i]
```

**Filter frequency distribution:**
```ts
// Spread 8 filters across 200Hz–6kHz, spaced logarithmically
const WARP_FILTER_FREQS = [200, 380, 720, 1360, 2580, 3800, 4900, 6000];
```

**Intensity control:** Dry/wet crossfade between the unfiltered tap output and the filtered output.
- At intensity=0: bypass (all signal goes through dry path)
- At intensity=1: full filter sweep (100% filtered)
- Implement as two `GainNode`s per tap: `warpDry` (gain = 1-intensity) and `warpWet` (gain = intensity)

**Total new nodes:** 8 `BiquadFilterNode` + 16 `GainNode` (dry/wet per tap) = 24 nodes.

#### 3.2.3 Warp: Pitch Drift

Later taps are detuned upward. Taps 1–4: original pitch. Taps 5–6: +5 semitones. Taps 7–8: +12 semitones (octave up). Creates a shimmer effect where echoes rise in pitch as they decay.

**Implementation approach:** Web Audio `DelayNode` doesn't natively pitch-shift. Two options:

**Option A (recommended): Playback rate trick via short buffer grains**
- For taps 5–8, create a ScriptProcessorNode or AudioWorkletNode that:
  1. Captures small chunks (50–100ms) of the tap output
  2. Plays them back at a higher rate (1.335× for +5st, 2.0× for +12st)
  3. Crossfades overlapping grains to avoid clicks
- This is essentially a mini pitch shifter per tap

**Option B: Reuse granular GrainProcessor**
- Route taps 5–8 output through a simplified version of the existing granular voice processor
- Set grain size small (~50ms), pitch offset to target semitones
- More complex wiring but reuses proven code

**Pitch map:**
```ts
const WARP_PITCH_SEMITONES = [0, 0, 0, 0, 5, 5, 12, 12];
const PITCH_RATE = (st: number) => Math.pow(2, st / 12);
// Tap 5,6: rate = 1.3348
// Tap 7,8: rate = 2.0
```

**Intensity:** crossfade between original and pitched output per tap (same dry/wet approach as Filter Sweep, but only taps 5–8 have wet content).

**New nodes:** 4 pitch-shift worklets (taps 5–8 only) + 8 dry/wet GainNode pairs.

#### 3.2.4 Warp: Grain Crossfade

Later taps crossfade from clean delay into double-speed granular playback. Taps 1–4 are pure delay.
Taps 5–8 blend in a short grain cloud at 2× speed from the same source material.

**Implementation:**
- Create a mini grain player that receives the Delay B input signal
- The grain player runs at 2× playback rate with small grains (~30–80ms), random spray, triangle envelope
- Route taps 5–8 output through a crossfade: `(1-blend) × tapOutput + blend × grainOutput`
- Blend = `warpIntensity` (taps 1–4 always dry)

**New nodes:**
- 1 AudioWorkletNode (mini grain processor) receiving `input`
- 4 dry/wet GainNode pairs for taps 5–8

**Key point:** This grain player is **internal to Delay B** — it does NOT route through the full 4-voice granular engine.
The routing matrix `Delay B → Granular` send remains independent and feeds the main granular engine. Both can be active simultaneously.

#### Warp Mode Switching

When warp mode changes, the processing nodes for the previous mode should be **disconnected** (not destroyed — keep them allocated for fast switching):

```ts
// Pseudo-code
switchWarp(newMode: WarpMode) {
  disconnectCurrentWarpNodes();
  if (newMode === 'filterSweep') connectFilterSweepNodes();
  if (newMode === 'pitchDrift') connectPitchDriftNodes();
  if (newMode === 'grainCrossfade') connectGrainCrossfadeNodes();
  // 'clean' = no warp nodes connected
}
```

All warp nodes are created at `SharedDelayBusB` construction time but only connected when their mode is active. This avoids allocation hitches on mode switch.

### 3.3 Spread

**What:** Stereo width control beyond fixed pan positions.

**New param:** `delayBSpread: number` (0–1, default 0.5)

**Implementation:** Scale the pattern's pan values by the spread amount:
```ts
const spreadPan = patternPans[i] * spread * 2; // 0 = mono (all center), 0.5 = pattern default, 1 = exaggerated
tapPanners[i].pan.setTargetAtTime(clamp(spreadPan, -1, 1), now, smoothTime);
```

**Nodes added:** 0 (reuses existing StereoPannerNodes).

### 3.4 Feedback Tone Macro

**What:** Replace the raw filter frequency knob with a musical Tone macro that sweeps from warm → dark → bright.

**Current state:** Single `toneFilter` (BiquadFilterNode, lowpass) in feedback path. Frequency mapped from `granularDelayFilter` (0–1) → 200–8000 Hz.

**New behavior:** The `Tone` param (0–1) now controls a **two-filter pair** in the feedback path:

```
feedbackGain → highCutFilter (lowpass) → lowCutFilter (highpass) → input
```

| Tone Value | highCut Freq | lowCut Freq | Character |
|------------|-------------|-------------|-----------|
| 0 (warm) | 1200 Hz | 60 Hz | Dark, muffled repeats |
| 0.5 (neutral) | 6000 Hz | 60 Hz | Natural, full range |
| 1.0 (bright) | 12000 Hz | 400 Hz | Thin, airy, top-heavy |

Mapping:
```ts
const highCutHz = 600 + tone * 11400;  // 600–12000 Hz
const lowCutHz = 60 + Math.max(0, tone - 0.5) * 680;  // 60–400 Hz (only kicks in above 0.5)
```

**Nodes added:** 1 `BiquadFilterNode` (highpass) — the existing lowpass `toneFilter` is reused. Q stays at 0.7 for both.

**Param rename:** `granularDelayFilter` remains the state key but the UI label changes from "Filter" → "Tone".

### Clocked Space — Updated Signal Chain

```
input ──→ tapDelay[i] → tapGain[i] ──→ [warp processing] ──→ tapPanner[i] ──→ outputGain  (×8)
                                                                                    │
                                                                              ┌─────┤
                                                                         feedbackGain
                                                                              │
                                                                     highCutFilter (LP)
                                                                              │
                                                                     lowCutFilter (HP)
                                                                              │
                                                                            input

outputGain → limiter ──┬── directGain → masterOut
                       ├── reverbSendGain → reverbIn
                       └── granularSendGain → granularIn (routing matrix send, independent)

vibratoOsc[i] → vibratoDepth[i] → tapDelay[i].delayTime  (×8)
```

**[warp processing] per mode:**
- Clean: passthrough (tapGain[i] → tapPanner[i] direct)
- Filter Sweep: tapGain[i] → warpBPF[i] → warpWet[i] → tapPanner[i], tapGain[i] → warpDry[i] → tapPanner[i]
- Pitch Drift: same structure, warpWet uses pitch worklet (taps 5–8 only)
- Grain Crossfade: same structure, warpWet uses mini grain player (taps 5–8 only)

---

## 4. DSP Updates — Master Bus Saturation

**Concept:** Insert a waveshaper between `masterGain` and `limiter` to color the entire output.

### Current master chain

```ts
// engine.ts line ~1480
this.masterGain.connect(this.limiter);
this.limiter.connect(this.ctx.destination);
```

### New master chain

```
masterGain → satPreGain → satWaveshaper → satPostToneFilter → limiter → destination
```

### New params

| Param | Key | Type | Default | Range | Description |
|-------|-----|------|---------|-------|-------------|
| Drive | `masterSatDrive` | number | 0 | 0–1 | Input gain into waveshaper. 0 = bypass (linear curve). |
| Mode | `masterSatMode` | string | `'clean'` | `'clean' \| 'tape' \| 'tube'` | Waveshaper curve shape. |
| Tone | `masterSatTone` | number | 0.5 | 0–1 | Post-saturation tilt EQ. 0 = darker, 1 = brighter. |

### Waveshaper curves

```ts
function makeDistortionCurve(mode: string, samples = 8192): Float32Array {
  const curve = new Float32Array(samples);
  const half = (samples - 1) / 2;

  for (let i = 0; i < samples; i++) {
    const x = (i - half) / half; // -1 to +1

    switch (mode) {
      case 'tape':
        // Soft asymmetric saturation — warm, even harmonics
        curve[i] = Math.tanh(x * 1.5) * 0.9 + x * 0.1;
        break;
      case 'tube':
        // Symmetric harmonic richness — odd harmonics
        curve[i] = (3 + 10) * x * 20 * (Math.PI / 180) /
                   (Math.PI + 10 * Math.abs(x));
        // Simpler: curve[i] = x / (1 + Math.abs(x));
        break;
      case 'clean':
      default:
        // Linear — no coloring
        curve[i] = x;
        break;
    }
  }
  return curve;
}
```

### Implementation

```ts
// In engine constructor, after masterGain and limiter creation:
this.satPreGain = ctx.createGain();
this.satPreGain.gain.value = 1;

this.satWaveshaper = ctx.createWaveShaper();
this.satWaveshaper.curve = makeDistortionCurve('clean');
this.satWaveshaper.oversample = '2x'; // anti-alias

this.satPostTone = ctx.createBiquadFilter();
this.satPostTone.type = 'peaking';
this.satPostTone.frequency.value = 3000;
this.satPostTone.Q.value = 0.5;
this.satPostTone.gain.value = 0; // neutral

// Reconnect:
this.masterGain.disconnect(this.limiter);
this.masterGain.connect(this.satPreGain);
this.satPreGain.connect(this.satWaveshaper);
this.satWaveshaper.connect(this.satPostTone);
this.satPostTone.connect(this.limiter);
```

### Update logic

```ts
// In update loop:
const drive = state.masterSatDrive ?? 0;
const mode = state.masterSatMode ?? 'clean';
const tone = state.masterSatTone ?? 0.5;

// Drive: boost input into waveshaper (1.0 at 0 drive, up to 4.0 at full drive)
const preGainValue = 1 + drive * 3;
this.satPreGain.gain.setTargetAtTime(preGainValue, now, 0.05);

// Post-gain compensation: reduce output to maintain perceived loudness
const postCompensation = 1 / (1 + drive * 1.5);
// Apply to satPostTone or add a satPostGain node

// Curve: only regenerate if mode changed
if (mode !== this._lastSatMode) {
  this.satWaveshaper.curve = makeDistortionCurve(mode);
  this._lastSatMode = mode;
}

// Tone tilt: negative dB = darker, positive = brighter
const tiltDb = (tone - 0.5) * 12; // -6 to +6 dB
this.satPostTone.gain.setTargetAtTime(tiltDb, now, 0.05);
```

### Bypass behavior

When `masterSatDrive = 0`: the waveshaper curve is linear (`clean`), pre-gain = 1, post-tone = 0 dB. Signal passes through uncolored. **No need for a bypass switch** — drive=0 IS bypass.

### CPU note

`oversample: '2x'` adds ~1ms latency and moderate CPU. For mobile/low-power, consider:
- Only enable oversampling when `drive > 0.1`
- Alternative: `oversample: 'none'` with a higher-sample-count curve to reduce aliasing

---

## 5. DSP Updates — Cross-Feed Enhancements

### 5.1 B → A Feedback (currently blocked)

**What:** Allow Delay B output to feed back into Delay A, enabling true dual-delay interplay.

**Current state:** `delayBOut` row in `RoutingMatrix.tsx` has `delayA: { kind: 'blocked' }`.

**Implementation:**
- New param: `delayBToASend: number` (0–1, default 0)
- In `SharedDelayBusB`:
  1. Add a `delayASendGain: GainNode` (like the existing `granularSendGain`)
  2. Wire `limiter → delayASendGain → delayA.input`
  3. Add `connectDelayAInput(node: AudioNode)` method
- In `engine.ts`: call `delayB.connectDelayAInput(delayA.input)`
- In `RoutingMatrix.tsx`: change `delayA: { kind: 'blocked' }` → `delayA: { kind: 'editable', route: { key: 'delayBToASend', label: 'Delay B → Delay A' } }`

**Safety:** The B→A + A→B loop creates potential for runaway. Add a safety limiter:
- Cap combined cross-feed: `if (delayAToBSend * delayBToASend > 0.4) scale both down proportionally`
- Or: add a `DynamicsCompressorNode` in the B→A path with aggressive ratio

### 5.2 Cross-Feed Filter

**What:** Filter in the A→B path so only certain frequencies bleed across.

**New param:** `delayACrossFeedFilter: number` (0–1, mapped to 200–8000 Hz lowpass)

**Implementation:**
- In `SharedDelayBusA`, insert a `BiquadFilterNode` (lowpass) between `delayBSendGain` and `delayB.input`:
  ```
  limiter → delayBSendGain → crossFeedFilter → delayB.input
  ```

**Nodes added:** 1 `BiquadFilterNode`.

---

## 6. New Parameters Summary

### Echo Line (Delay A) — 5 new params

| Key | Type | Default | Range | UI Label |
|-----|------|---------|-------|----------|
| `delayAPingPong` | boolean | false | — | Ping-Pong |
| `delayAModRate` | number | 0 | 0–1 | Mod Rate |
| `delayAModDepth` | number | 0 | 0–1 | Mod Depth |
| `delayADuck` | number | 0 | 0–1 | Duck |
| `delayAFilterType` | string | `'lowpass'` | `'lowpass' \| 'bandpass' \| 'highpass'` | Filter Type |
| `delayAWidth` | number | 0.5 | 0–1 | Width |

### Clocked Space (Delay B) — 4 new params

| Key | Type | Default | Range | UI Label |
|-----|------|---------|-------|----------|
| `delayBPattern` | string | `'cascade'` | `'cascade' \| 'golden' \| 'mirror' \| 'dotted'` | Pattern |
| `delayBWarp` | string | `'clean'` | `'clean' \| 'filterSweep' \| 'pitchDrift' \| 'grainCrossfade'` | Warp |
| `delayBWarpIntensity` | number | 0.5 | 0–1 | Intensity |
| `delayBSpread` | number | 0.5 | 0–1 | Spread |

### Master Bus — 3 new params

| Key | Type | Default | Range | UI Label |
|-----|------|---------|-------|----------|
| `masterSatDrive` | number | 0 | 0–1 | Drive |
| `masterSatMode` | string | `'clean'` | `'clean' \| 'tape' \| 'tube'` | Character |
| `masterSatTone` | number | 0.5 | 0–1 | Tone |

### Cross-Feed — 2 new params

| Key | Type | Default | Range | UI Label |
|-----|------|---------|-------|----------|
| `delayBToASend` | number | 0 | 0–1 | B → A |
| `delayACrossFeedFilter` | number | 1 | 0–1 | X-Feed Filter |

### Renamed

| Old UI Label | New UI Label | State Key (unchanged) |
|---|---|---|
| Filter (Delay B) | Tone | `granularDelayFilter` |
| Vibrato (Delay B) | Vibrato (keep or fold into warp) | `granularDelayVibrato` |

**Total new params: 14** (6 Echo Line + 4 Clocked Space + 3 Master + 2 Cross-Feed - 1 rename)

---

## 7. UI Aesthetic Overhaul

The delay page currently uses a completely different design system from all other pages (synth, granular, reverb, drums). This section specifies the exact CSS tokens and patterns to adopt.

### 7.1 Design Token Adoption

**Replace ALL hardcoded values in `delay.css` with the shared token block.**

Add this at the top of `delay.css`:

```css
.delay-root {
  /* ─── Shared Design Tokens (match synth.css / reverb.css) ─── */
  --bg-base: #1a1a2e;
  --bg-input: rgba(0, 0, 0, 0.3);
  --bg-surface: rgba(15, 25, 40, 0.95);
  --bg-elevated: rgba(255, 255, 255, 0.05);
  --bg-control: rgba(255, 255, 255, 0.08);
  --bg-control-hover: rgba(255, 255, 255, 0.15);
  --border-subtle: rgba(255, 255, 255, 0.1);
  --border-medium: rgba(255, 255, 255, 0.2);
  --border-accent: rgba(100, 150, 200, 0.3);
  --text-primary: #e0e0e0;
  --text-secondary: #9ca3af;
  --text-muted: #666;
  --text-dim: #555;
  --accent-primary: #a5c4d4;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --font-xs: 0.55rem;
  --font-sm: 0.65rem;
  --font-md: 0.75rem;
  --font-lg: 0.85rem;

  /* ─── Delay-specific accents ─── */
  --accent-echo: #b9c9ff;    /* Echo Line accent (matches Delay A Out row in routing matrix) */
  --accent-clocked: #9fe5f0; /* Clocked Space accent (matches Delay B Out row) */
  --accent-master: #a5c4d4;  /* Master bus accent */
  --accent-cross: #c4a8e0;   /* Cross-feed accent */
}
```

### 7.2 Token Mapping — what changes where

| Old hardcoded value | New token | Where used |
|---|---|---|
| `#e7edf7` | `var(--text-primary)` = `#e0e0e0` | `.delay-root color` |
| `rgba(220,228,240,0.78)` | `var(--text-secondary)` = `#9ca3af` | Body copy, notes |
| `#86b9cb` | `var(--accent-primary)` = `#a5c4d4` | Kicker labels |
| `rgba(138,189,207,0.76)` | `var(--text-secondary)` | Subcopy labels |
| `#f5fbff` | `var(--text-primary)` | Subtitles, status card text |
| `rgba(143,165,196,0.2)` | `var(--border-accent)` = `rgba(100,150,200,0.3)` | Card/panel borders |
| `rgba(130,167,198,0.28)` | `var(--border-accent)` | Hero border → remove hero |
| `rgba(145,172,206,0.25)` | `var(--border-subtle)` | Button borders |

### 7.3 Card Pattern — exact CSS

Every card on the delay page MUST match this pattern (same as synth + reverb cards):

```css
.delay-card {
  background: var(--bg-surface);                        /* FLAT — no gradient */
  border: 1px solid var(--border-accent);               /* rgba(100,150,200,0.3) */
  border-left: 3px solid var(--sc, var(--accent-echo)); /* SIGNATURE LEFT ACCENT */
  border-radius: var(--radius-md);                      /* 8px — not 18px */
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.2s;
  box-shadow: none;                                     /* NO always-on shadow */
}

/* Only show shadow on hover/active */
.delay-card:hover,
.delay-card.active {
  box-shadow: 0 0 12px rgba(165, 196, 212, 0.08);
}
```

**`--sc` per card:**
- Echo Line card: `--sc: var(--accent-echo)` → `#b9c9ff`
- Clocked Space card: `--sc: var(--accent-clocked)` → `#9fe5f0`
- Cross-Feeds card: `--sc: var(--accent-cross)` → `#c4a8e0`
- Master Saturation card: `--sc: var(--accent-master)` → `#a5c4d4`

### 7.4 Card Header — exact CSS

Match the collapsible accordion pattern used in synth/granular/reverb:

```css
.delay-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: background 0.15s;
}

.delay-card-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.delay-card-title {
  font-size: var(--font-lg);   /* 0.85rem — not 1.35rem */
  font-weight: 700;
  color: var(--sc, var(--accent-primary));
}

.delay-card-subtitle {
  font-size: var(--font-sm);   /* 0.65rem */
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

### 7.5 Specific elements to remove

| Element | Why |
|---------|-----|
| `.delay-hero` section | No other page has a hero. Remove the entire `<section className="delay-hero">` and its CSS. |
| `.delay-status-grid` (3 status cards) | Replace with minimal inline indicators inside card headers (colored dot or a small feed count badge). |
| `.delay-ownership-pill` | Replace with a compact badge: `font-size: var(--font-xs); padding: 2px 6px; border-radius: var(--radius-sm)` |
| `.delay-footer-note` | Remove. Footer notes aren't used on other pages. |
| `border-radius: 999px` on buttons | Use `var(--radius-sm)` (6px) for toggle/mode buttons to match other pages. |
| `linear-gradient(135deg, ...)` on active buttons | Use flat `var(--bg-control)` / `var(--bg-control-hover)` with `border-color: var(--sc)` to indicate active state. |

### 7.6 Mode/Toggle Button Pattern

Match the pattern used in granular/reverb for mode buttons:

```css
.delay-mode-btn {
  appearance: none;
  padding: 5px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);              /* 6px — not 999px */
  background: var(--bg-control);                /* rgba(255,255,255,0.08) — not gradient */
  color: var(--text-secondary);
  font-size: var(--font-sm);
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.delay-mode-btn:hover {
  background: var(--bg-control-hover);
}

.delay-mode-btn.active {
  border-color: var(--sc, var(--accent-primary));
  background: color-mix(in srgb, var(--sc, var(--accent-primary)) 15%, transparent);
  color: var(--text-primary);
}
```

### 7.7 Select/Dropdown Pattern

```css
.delay-select-field select {
  padding: 5px 8px;
  border-radius: var(--radius-sm);              /* 6px — not 10px */
  border: 1px solid var(--border-subtle);
  background: var(--bg-input);                  /* rgba(0,0,0,0.3) */
  color: var(--text-primary);
  font-size: var(--font-sm);
}
```

### 7.8 Typography Scale

| Element | Old size | New size (token) |
|---------|----------|-----------------|
| Card title (h3) | 1.35rem | `var(--font-lg)` = 0.85rem |
| Kicker label | 0.68rem | `var(--font-sm)` = 0.65rem |
| Body copy | ~1rem implicit | `var(--font-md)` = 0.75rem |
| Subtitle | 0.98rem | `var(--font-md)` = 0.75rem |
| Status/subcopy | 0.66rem | `var(--font-xs)` = 0.55rem |
| Button text | 0.82rem | `var(--font-sm)` = 0.65rem |
| Status card strong | 1.02rem | `var(--font-md)` = 0.75rem |

---

## 8. UI Layout Restructure

### Current layout (single column)

```
┌──────────────────────────────────────────────┐
│ Hero (to remove)                             │
├──────────────────────────────────────────────┤
│ Status Grid (3 cards) (to remove)            │
├──────────────────────────────────────────────┤
│ Card Grid (auto-fit columns)                 │
│   [Echo Line]  [Clocked Space]  [Cross-Feed] │
├──────────────────────────────────────────────┤
│ Footer note (to remove)                      │
└──────────────────────────────────────────────┘
```

### New layout (two-panel, matches synth/reverb)

```css
.delay-root {
  display: flex;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
  color: var(--text-primary);
}

.delay-left {
  width: 460px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.delay-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Mobile: single column */
.delay-root.mobile {
  flex-direction: column;
}

.delay-root.mobile .delay-left {
  width: 100%;
}
```

### Desktop panel assignment

**Left panel (460px)** — delay voicing controls:
1. **Echo Line** card (collapsible) — `--sc: var(--accent-echo)`
   - Ping-Pong toggle
   - L/R Time selectors
   - Feedback, Mix, Filter (with LP/BP/HP selector), Width, Mod Rate, Mod Depth, Duck, Reverb Send
2. **Clocked Space** card (collapsible) — `--sc: var(--accent-clocked)`
   - Mode: [Diffuse] [Clocked]
   - Pattern: [Cascade] [Golden] [Mirror] [Dotted]
   - Warp: [Clean] [Filter] [Pitch] [Grain]
   - Time, Activity, Repeats, Tone, Intensity, Spread, Vibrato (if kept), Mix, Reverb Send

**Right panel (flex)** — visualization + routing + master:
1. **Delay Visualizer** canvas area (Viz A/B/C/D)
2. **Cross-Feeds** card (collapsible) — `--sc: var(--accent-cross)`
   - A → B, B → A, X-Feed Filter, A → Granular, B → Granular
3. **Preset Linkage** card (collapsible) — `--sc: var(--accent-clocked)`
   - Linked/Free toggle, granular preset linkage info
4. **Master Saturation** card (collapsible) — `--sc: var(--accent-master)`
   - Drive, Character [Clean] [Tape] [Tube], Tone

### Feed indicator (replaces status cards)

Instead of the three status cards, add a compact inline indicator inside each card header:

```tsx
<span className="delay-feed-badge" title={feedList.join(', ')}>
  <span className="delay-feed-dot" style={{ background: feedActive ? '#48c4a0' : '#444' }} />
  <span>{feedCount} {feedCount === 1 ? 'feed' : 'feeds'}</span>
</span>
```

```css
.delay-feed-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-control);
  font-size: var(--font-xs);
  color: var(--text-secondary);
}

.delay-feed-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
```

---

## 9. Visualization A — Rhythm Map

### Purpose

Shows the live tap pattern and warp character for both delays. The primary visualization — gives instant
feedback when adjusting timing, activity, pattern, warp, and stereo spread.

### Location

Right panel, top area. Canvas element ~full-width × 160px (desktop), ~full-width × 120px (mobile).

### Canvas layout

```
┌─ Rhythm Map ─────────────────────────────────────────────────────────┐
│                                                                       │
│  ECHO LINE                                                            │
│  ─────┬────────┬────────┬────────┬────────                            │
│       ██       ██       ▓▓       ▒▒                                  │
│       L    R       L        R         ← ping-pong alternation        │
│                                                                       │
│  CLOCKED SPACE (Golden + Filter Sweep)                                │
│  ──┬─┬──┬───┬─┬────┬──┬─┬──────                                     │
│   ██ █ ██  ██ ▓▓    ▒▒ ▒ ░░     ← taps at pattern intervals         │
│   ↑  ↑  ↑   ↑  ↑     ↑  ↑  ↑                                       │
│  200 380 720 1.3k 2.6k 3.8k 4.9k 6k  ← filter sweep freqs (color)  │
│                                                                       │
│  ▸ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▸  ← playhead (animated, synced)     │
│                                                                       │
│  [A → B arc]                      ← cross-feed indicator              │
└───────────────────────────────────────────────────────────────────────┘
```

### Drawing spec

**Time axis:** X = 0 is "now" (left edge), X = full width is one full cycle (4 beats at BPM).
Scale: `pxPerBeat = canvasWidth / 4`.

**Echo Line taps (top half):**
- Two bars per repeat (L, R if ping-pong; or overlaid if mono)
- Bar X position: `timeL * pxPerBeat` for left, `timeR * pxPerBeat` for right
- Bar height: `maxBarHeight * feedbackDecay^repeatIndex` (geometric decay, `maxBarHeight = 40px`)
- Bar width: `4px` base, scale by `width` param (2px at width=0, 8px at width=1)
- Bar Y: L = `topHalfCenter - barHeight/2 - panOffset`, R = `topHalfCenter - barHeight/2 + panOffset` (`panOffset = 8px`)
- Bar color: `--accent-echo` (#b9c9ff) with alpha = `1/repeatIndex`
- Draw up to `ceil(1/feedback)` repeats (infinite at feedback=0.95 → cap at 12)

**Clocked Space taps (bottom half):**
- 8 bars positioned at pattern subdivision intervals
- Bar X position: `pattern.subdivisions[i] * baseTimeSec * pxPerBeat`
- Bar height: `maxBarHeight * computeTapGain(i, activity) * pattern.gains[i]`
- Bar width: proportional to `spread` (2px at spread=0, 6px at spread=1)
- Bar Y: offset by `pattern.pans[i] * panScaleY` for stereo position visualization
- Bar color:

| Warp Mode | Color behavior |
|-----------|---------------|
| Clean | Uniform `--accent-clocked` (#9fe5f0) |
| Filter Sweep | Gradient: tap 1 = warm red-orange (#ff8866), tap 8 = cool blue (#66bbff), interpolated via HSL |
| Pitch Drift | Taps 1–4 = `--accent-clocked`, taps 5–6 = lighter (+20% white), taps 7–8 = bright white-teal with ↑ arrow overlay |
| Grain Crossfade | Taps 1–4 = solid bars, taps 5–8 = dashed/dotted fill (use `ctx.setLineDash([2, 2])` for the bar outline) |

**Playhead:**
- A vertical line (1px, white, alpha 0.3) that sweeps left-to-right at BPM
- On crossing a tap position: briefly flash that tap bar to alpha 1.0 (200ms decay)
- Speed: `canvasWidth / (240 / bpm * 1000)` px/ms

**Cross-feed arc:**
- When `delayAToBSend > 0.01`: draw a curved dashed line from Echo Line area to Clocked Space area
- Line alpha = `delayAToBSend`
- When `delayBToASend > 0.01`: same but opposite direction
- `ctx.setLineDash([4, 4])`, animate `lineDashOffset` for flow direction

**Duck indicator (Echo Line only):**
- When `delayADuck > 0`: draw a faint pulsing background rect behind Echo Line taps
- Pulse alpha keyed to the duck envelope value (from the AnalyserNode used for ducking)

### Implementation

```tsx
// DelayRhythmMap.tsx
interface DelayRhythmMapProps {
  bpm: number;
  // Echo Line
  echoTimeL: number;  // seconds
  echoTimeR: number;
  echoFeedback: number;
  echoPingPong: boolean;
  echoWidth: number;
  echoDuck: number;
  echoDuckEnvelope: number; // 0-1, from AnalyserNode
  // Clocked Space
  clockedPattern: string;
  clockedWarp: string;
  clockedActivity: number;
  clockedBaseTime: number; // seconds
  clockedSpread: number;
  clockedSpaceMode: string; // 'standard' | 'diffuse'
  // Cross-feeds
  aToBSend: number;
  bToASend: number;
  // Colors
  echoAccent: string;
  clockedAccent: string;
}

// Use requestAnimationFrame loop, canvas 2D context
// Target 30fps cap (draw every other frame) to save CPU
// Canvas resolution: multiply dimensions by devicePixelRatio for Retina
```

### CSS

```css
.delay-rhythm-map {
  width: 100%;
  height: 160px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.delay-rhythm-map canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Mobile */
.delay-root.mobile .delay-rhythm-map {
  height: 120px;
}
```

---

## 10. Visualization B — Algorithm Card

### Purpose

Small inline illustration (200×60px) inside the Clocked Space card header that visually identifies the
selected Pattern + Warp combination. Not a data visualization — a decorative identity illustration.

### Location

Inside the Clocked Space card, between the Pattern/Warp selectors and the sliders.

### Visual spec per pattern

Draw 8 circles (or small rounded rects) at positions determined by the pattern's subdivisions:

```
tiny canvas (200 × 60)

Cascade:     ●    ●   ●  ● ●●●●        ← evenly descending staircase
Golden:      ●       ●     ●    ● ● ●● ← organic, non-linear spacing
Mirror:      ● ●   ● ●  ● ● ● ●       ← symmetric butterfly
Dotted:       ●    ●   ●  ●  ● ● ● ●  ← offset right of grid lines
```

- Circle X: `subdivisions[i] * scaleX` (normalize largest subdivision to 180px)
- Circle Y: `centerY + pans[i] * 20` (pan offset shows stereo position)
- Circle radius: `4px * gains[i]` (gain = size)
- Circle color: base = `--accent-clocked`, modified by warp:

### Visual spec per warp

| Warp | Overlay on top of pattern circles |
|------|-----------------------------------|
| Clean | No overlay. Plain circles. |
| Filter Sweep | Draw a subtle rainbow gradient arc behind the circles. Use `createLinearGradient` horizontal, warm→cool. |
| Pitch Drift | Circles 5–8 are drawn 8px higher than their pan position. Add tiny "↑" text above them. |
| Grain Crossfade | Circles 5–8 have dashed outlines instead of solid fill. Add tiny scatter dots around them. |

### Implementation

```tsx
// DelayAlgorithmCard.tsx
interface AlgorithmCardProps {
  pattern: string;
  warp: string;
  accent: string;
}

// Static pre-rendered canvas (redraw only on pattern/warp change, not per-frame)
// Use React.useEffect with deps [pattern, warp] to redraw
```

### CSS

```css
.delay-algorithm-card {
  width: 100%;
  max-width: 260px;
  height: 60px;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-subtle);
  margin: 4px 0 8px;
}

.delay-algorithm-card canvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

---

## 11. Visualization C — Live Delay Scope

### Purpose

Scrolling time-domain amplitude display showing actual delay output over the last ~4 seconds.
Lets the user see the echo pattern, decay, ducking behavior, and warp effects in real time.

### Location

Right panel, can be tab-toggled with Rhythm Map (A), or stacked below it if space allows.

### Data source

Attach an `AnalyserNode` to each delay bus output:

```ts
// In SharedDelayBusA:
this.scopeAnalyser = ctx.createAnalyser();
this.scopeAnalyser.fftSize = 256; // 128 frequency bins, but we use time-domain
this.scopeAnalyser.smoothingTimeConstant = 0;
this.limiter.connect(this.scopeAnalyser);

// In SharedDelayBusB: same
```

Read `getByteTimeDomainData()` every frame. Store a rolling buffer of ~240 samples (4 seconds at 60fps).

### Canvas layout

```
┌─ Live Scope ─────────────────────────────────────────────────────────┐
│                                                                       │
│  ECHO LINE                                                            │
│  ▁▂▃▅▇█▇▅▃▂▁▁▁▁▁▂▃▅▇█▇▅▃▂▁▁▁▁▁▁▁▂▃▅▇█▇▅▃▂▁▁▁▁▁▁▁▁▁▂▃▅▇█▇▅▃      │
│  ← older                                              newer →        │
│                                                                       │
│  CLOCKED SPACE                                                        │
│  ▁▂▃▅▃▁▂▅▇▅▃▁▂▃▁▂▅▇▃▁▂▃▅▃▁▁▁▂▃▅▃▁▂▅▇▅▃▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁      │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Drawing spec

**Buffer:** Ring buffer of `bufferSize = 240` entries. Each entry: `{ peakL: number, peakR: number }`.

**Per frame:**
1. Read `AnalyserNode.getByteTimeDomainData(dataArray)` (128 uint8 samples)
2. Compute peak: `max(|sample - 128|) / 128` for each channel
3. Push to ring buffer, advance write index

**Drawing:**
- Two horizontal lanes (Echo Line top, Clocked Space bottom), each ~60px tall
- Each buffer entry → one vertical bar at `x = entryIndex * barWidth`
- Bar height: `peak * laneHeight`
- Bar color: `--accent-echo` / `--accent-clocked` with alpha = `0.3 + peak * 0.7`

**Ping-pong visualization (Echo Line):**
- Split each bar into L/R: draw L peak above center, R peak below center
- When ping-pong is on, alternating bars appear L/R, creating a zigzag pattern

**Warp visualization (Clocked Space):**
- Filter Sweep: tint bars with HSL hue based on dominant frequency (cheap approximation: use `getByteFrequencyData` center-of-mass)
- Pitch Drift: shift bar brightness for higher-frequency content
- Grain Crossfade: render every 3rd bar as dots instead of solid

**Duck visualization (Echo Line):**
- When `delayADuck > 0`: overlay a faint inverse envelope (the dry input level) as a translucent backdrop
- When the duck is attenuating, the bar heights visibly dip while the backdrop peaks — shows the pumping

### Implementation

```tsx
// DelayScope.tsx
interface DelayScopeProps {
  echoAnalyser: AnalyserNode | null;
  clockedAnalyser: AnalyserNode | null;
  echoPingPong: boolean;
  clockedWarp: string;
  duckEnvelope: number;
  echoAccent: string;
  clockedAccent: string;
}

// requestAnimationFrame loop, 30fps cap
// Canvas: full-width × 140px (desktop), full-width × 100px (mobile)
```

### CSS

```css
.delay-scope {
  width: 100%;
  height: 140px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.delay-scope canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.delay-root.mobile .delay-scope {
  height: 100px;
}
```

### Viz selector tabs (if showing A and C together)

```tsx
<div className="delay-viz-tabs">
  <button className={vizMode === 'rhythm' ? 'active' : ''} onClick={() => setVizMode('rhythm')}>Rhythm</button>
  <button className={vizMode === 'scope' ? 'active' : ''} onClick={() => setVizMode('scope')}>Scope</button>
</div>
```

```css
.delay-viz-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.delay-viz-tabs button {
  padding: 3px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-control);
  color: var(--text-secondary);
  font-size: var(--font-xs);
  font-weight: 700;
  cursor: pointer;
}

.delay-viz-tabs button.active {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
  color: var(--text-primary);
}
```

---

## 12. Visualization D — Preset Signature Thumbnails

### Purpose

Static visual identity icons for each Pattern + Warp combination. Appear in the pattern/warp selector
buttons so the user can visually recognize the selected algorithm at a glance.

### Location

Inside each pattern/warp mode button, next to the text label.

### Size

40 × 24px per thumbnail. Drawn on a tiny canvas or generated as SVG.

### Visual spec

**Pattern thumbnails (8 dots showing tap positions):**

```
Cascade:  ● ● ● ● ● ● ● ●    (evenly spaced descending staircase)
           ↘ ↘ ↘ ↘ ↘ ↘ ↘ ↘

Golden:   ●    ●   ●  ● ●● ●● (compressed toward right — φ spacing)

Mirror:   ● ●  ● ● ● ● ● ●   (symmetric — matching pairs equidistant from center)

Dotted:    ● ●  ●  ● ● ● ● ●  (shifted right of grid — behind the beat)
```

- 8 circles, radius 2px
- X: `subdivision[i] * scaleX` (normalize to 36px width, 2px margin each side)
- Y: `12 + pans[i] * 8` (center with pan offset)
- Color: `--accent-clocked` at alpha 0.7

**Warp thumbnails:**

```
Clean:    ● ● ● ● ● ● ● ●     (plain dots, uniform color)

Filter:   ● ● ● ● ● ● ● ●     (rainbow gradient: warm → cool left to right)
          ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔

Pitch:    ● ● ● ●               (first 4 normal, last 4 shifted up)
                    ↑● ↑● ↑● ↑●

Grain:    ● ● ● ● ⊙ ⊙ ⊙ ⊙     (first 4 solid, last 4 dashed outline with scatter dots)
```

### Implementation

Two approaches:

**Option A: Canvas (recommended)**
```tsx
// DelayThumbnail.tsx
function DelayThumbnail({ type, variant, accent }: { type: 'pattern' | 'warp'; variant: string; accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 40, 24);

    if (type === 'pattern') {
      const preset = PATTERN_PRESETS[variant];
      const maxSub = Math.max(...preset.subdivisions);
      preset.subdivisions.forEach((sub, i) => {
        const x = 4 + (sub / maxSub) * 32;
        const y = 12 + preset.pans[i] * 8;
        const r = 2 * preset.gains[i];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.7;
        ctx.fill();
      });
    }
    // ... warp thumbnails similarly
  }, [type, variant, accent]);

  return <canvas ref={canvasRef} width={40} height={24} className="delay-thumbnail" />;
}
```

**Option B: SVG (even cheaper)**
Pre-generate 8 SVG strings (4 patterns × no warp). Warp overlay added as additional elements.

### CSS

```css
.delay-thumbnail {
  width: 40px;
  height: 24px;
  flex-shrink: 0;
  display: block;
}

/* In mode button with thumbnail */
.delay-mode-btn-with-thumb {
  display: flex;
  align-items: center;
  gap: 6px;
}
```

### Integration with mode buttons

```tsx
<button className={`delay-mode-btn${pattern === 'golden' ? ' active' : ''}`}
        onClick={() => onSelectChange('delayBPattern', 'golden')}>
  <DelayThumbnail type="pattern" variant="golden" accent="var(--accent-clocked)" />
  <span>Golden</span>
</button>
```

---

## Implementation Order (Recommended)

1. ~~**UI aesthetic overhaul** (Section 7) — bring delay page inline with token system. No DSP changes.~~
2. ~~**Layout restructure** (Section 8) — two-panel layout. No DSP changes.~~
3. ~~**Echo Line DSP** (Section 2) — ping-pong, mod, filter type, width, duck. Add new params to state.ts.~~ **✅ Done**
4. ~~**Clocked Space DSP** (Section 3) — patterns, warp modes, spread, tone macro. Add new params.~~ **✅ Done** (pitchDrift/grainCrossfade = node-native approx)
5. ~~**Master saturation** (Section 4) — 3 new params, engine.ts change.~~ **✅ Done**
6. ~~**Cross-feed enhancements** (Section 5) — B→A, cross-feed filter.~~ **✅ Done**
7. **Naming update** (Section 1) — rename labels in UI files.
8. **UI aesthetic overhaul** (Section 7) — bring delay.css inline with token system.
9. **Layout restructure** (Section 8) — two-panel layout, new controls, feed badges.
10. **Viz D: Thumbnails** (Section 12) — cheap, immediate payoff.
11. **Viz B: Algorithm Card** (Section 10) — small, static, low cost.
12. **Viz A: Rhythm Map** (Section 9) — primary viz, requires DSP data piped to UI.
13. **Viz C: Scope** (Section 11) — requires AnalyserNode plumbing, build last.
14. **pitchDrift / grainCrossfade worklet upgrade** — replace node-native approximations with dedicated AudioWorklet pitch shifter and mini grain player.

### Remaining Work — Priority Order

| # | Task | Effort | Depends on |
|---|------|--------|------------|
| 7 | Naming: rename labels to Echo Line / Clocked Space | Small | — |
| 8 | CSS overhaul: adopt design tokens, remove hero/status/footer/gradients | Medium | — |
| 9 | Layout: two-panel, new slider controls for 14 new params, mode buttons, feed badges | Large | 7, 8 |
| 10 | Viz D: pattern/warp thumbnails (40×24 canvas/SVG in mode buttons) | Small | 9 |
| 11 | Viz B: algorithm card (200×60 inline canvas in Clocked Space card) | Small | 9 |
| 12 | Viz A: rhythm map (primary canvas, tap timeline + playhead + cross-feed arcs) | Medium | 9 |
| 13 | Viz C: scope (scrolling AnalyserNode amplitude display) | Medium | 9, engine AnalyserNode exposure |
| 14 | Worklet upgrade: proper pitch/grain worklets for pitchDrift + grainCrossfade | Large | — |

---

## File Checklist

| File | Changes |
|------|---------|
| `src/ui/delay/delay.css` | Full rewrite: adopt design tokens, remove hero/status/footer, card pattern, two-panel layout |
| `src/ui/delay/DelayPage.tsx` | Full rewrite: two-panel structure, new controls, remove hero/status grid, feed badges, viz components |
| `src/ui/delay/DelayRhythmMap.tsx` | **New file**: Viz A canvas component |
| `src/ui/delay/DelayAlgorithmCard.tsx` | **New file**: Viz B inline canvas |
| `src/ui/delay/DelayScope.tsx` | **New file**: Viz C scrolling scope canvas |
| `src/ui/delay/DelayThumbnail.tsx` | **New file**: Viz D pattern/warp thumbnail renderer |
| `src/ui/state.ts` | ~~Add 14 new params with defaults, ranges, ParamInfo~~ **✅ Done** |
| `src/audio/delayBuses.ts` | ~~Echo Line: ping-pong wiring, duck analyser, filter type, width. Clocked Space: pattern presets, warp node graph, spread, tone macro, low cut filter. B→A send, cross-feed filter~~ **✅ Done** (pitchDrift/grainCrossfade = approx) |
| `src/audio/engine.ts` | ~~Master saturation chain, B→A connection~~ **✅ Done** — still need: expose AnalyserNodes for viz |
| `src/ui/global/RoutingMatrix.tsx` | Change `delayBOut → delayA` from `blocked` to `editable` |
| `src/ui/sliderHelpCatalog.ts` | Add entries for all new params, update "Simple Delay" → "Echo Line", "Multi-Tap" → "Clocked Space" |
| `src/App.tsx` | Wire new delay props (viz data, AnalyserNodes), add master saturation controls |
