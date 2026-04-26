# Kessho — Deep CPU Usage Assessment

**Date:** 2025-03-03  
**Target:** 48 kHz stereo, 128-sample blocks (375 blocks/sec, 2.67 ms/block)  
**Reference machine:** Desktop — single-core ~3 GHz, V8/SpiderMonkey JIT  
**Files audited:** `engine.ts` (4,696 lines), `drumSynth.ts` (2,972 lines), `lead4opfm.ts` (930 lines), `granular-fx-wasm.worklet.ts` (1,405 lines), `granulator.worklet.ts` (459 lines), `reverb.worklet.ts` (517 lines), `ocean.worklet.ts` (378 lines)

---

## 1. Thread Model

| Thread | Language | Scheduling | What Runs Here |
|--------|----------|-----------|----------------|
| **Main thread** | JS | `requestAnimationFrame` (~60 Hz) + `setTimeout` (50 ms scheduler ticks) | `applyParams()`, 3 Euclidean schedulers, chord sequencer, lead random melody, transient node cleanup (2 s interval) |
| **Web Audio render thread** | Native C++ | Per-sample (48 kHz) | All `OscillatorNode`, `GainNode`, `BiquadFilterNode`, `DelayNode`, `WaveShaperNode`, `DynamicsCompressorNode`, `StereoPannerNode`, `ChannelMergerNode`, `AnalyserNode` processing; `AudioParam` automation |
| **AudioWorklet thread** | JS (JIT) | Per-block (128 samples) | `GranulatorProcessor`, `BelgianReverbProcessor`, `GranularFxProcessor`, `OceanProcessor` |

> Note: In most browsers the AudioWorklet thread IS the render thread. Worklet JS and native node processing share the same real-time deadline.

---

## 2. Full AudioNode Census

### 2.1 Persistent Nodes (always allocated while engine is running)

| Subsystem | Osc | Gain | BiquadFilter | Delay | WaveShaper | Panner | Merger | Compressor | Analyser | Worklet | BufferSrc | Subtotal |
|-----------|-----|------|-------------|-------|-----------|--------|--------|-----------|----------|---------|-----------|----------|
| **Pad Synth** (6 voices) | 24 | 66 | 24 | — | 6 | — | — | — | — | — | 6 | **126** |
| **Lead signal chain** | — | 7 | 1 | 2 | — | — | 1 | — | — | — | — | **11** |
| **DrumSynth persistent** | — | 18 | 2 | 2 | — | — | 1 | — | 7 | — | — | **30** |
| **Granular chain** | — | 4 | 2 | — | — | — | — | — | — | 1 | — | **7** |
| **Granular FX chain** | — | 10 | — | — | — | — | — | — | — | 1 | — | **11** |
| **Looper multi-tap delay** | 8 | 21 | 1 | 8 | — | 8 | — | — | — | — | — | **46** |
| **Ocean** | — | 2 | 1 | — | — | — | — | — | — | 1 | — | **4** |
| **Bus / routing** | — | 10 | — | — | — | — | — | — | — | — | — | **10** |
| **Reverb** | — | 1 | — | — | — | — | — | — | — | 1 | — | **2** |
| **Master** | — | 1 | — | — | — | — | — | 1 | — | — | — | **2** |
| **TOTAL PERSISTENT** | **32** | **140** | **31** | **12** | **6** | **8** | **2** | **1** | **7** | **4** | **6** | **249** |

**Pad voice breakdown (per voice × 6):** 4 Osc (A×2, B, Sub/B2) + 4 OscGain + 1 NoiseGain + 1 BufferSource(noise) + 2 BiquadFilter (A, B) + 1 Lowshelf(warmth) + 1 Peaking(presence) + 1 WaveShaper(2× oversample) + 1 Gain + 1 ModEnvGain + 1 Envelope + 1 MixerGain = 21 nodes × 6 = 126.

### 2.2 Transient Nodes (created per trigger, short-lived)

| Voice / Event | Min Nodes | Typical Nodes | Max Nodes | Lifetime |
|--------------|-----------|---------------|-----------|----------|
| **Lead FM note** (per unison voice) | ~28 | ~35 | ~42 | Note duration + 300 ms |
| **Lead FM note** (4 unison) | ~112 | ~140 | ~168 | Note duration + 300 ms |
| Drum **Sub** | 2 | 4 | 7 | Attack + decay + 500 ms |
| Drum **Kick** | 2 | 6 | 12 | Attack + decay + 500 ms |
| Drum **Click** (granular sub-mode) | 3 | 12 | 4 × grainCount (36+) | Attack + decay + 500 ms |
| Drum **BeepHi** | 6 | 15 | 30+ | Attack + decay + 500 ms |
| Drum **BeepLo** (osc) | 2 | 5 | 8 | Attack + decay + 500 ms |
| Drum **BeepLo** (modal) | 14 | 14 | 14 | Decay + 500 ms |
| Drum **BeepLo** (pluck) | 7 | 7 | 7 | Decay + 500 ms |
| Drum **Noise** (continuous) | 3 | 8 | 12 | Attack + decay + 500 ms |
| Drum **Noise** (particle) | 3 | 20 | 80+ (density × grains) | Attack + decay + 500 ms |
| Drum **Noise** (+ ratchets) | per ratchet: 3 | per ratchet: 3 | ratchetCount × 3 extra | Ratchet window |
| Drum **Membrane** | 10 | 18 | 30+ (overtones + wire) | Attack + decay + 500 ms |

**Peak transient node count** (all subsystems simultaneously active):
- 2 overlapping lead FM notes at 4 unison: ~280 nodes
- 4 drum lanes triggering simultaneously (worst case): ~80 nodes
- **Peak transient total: ~360 nodes**
- **Peak total (persistent + transient): ~609 AudioNodes**

### 2.3 Node Cleanup

- **DrumSynth:** `trackTransientNodes()` records node groups with TTL. `setInterval` every 2 s calls `cleanupTransientNodes()` to `disconnect()` expired groups. Voice pool limits: sub:2, kick:2, click:4, beepHi:3, beepLo:3, noise:2, membrane:2. Oldest-voice stealing on overflow.
- **Lead FM:** `setTimeout` after `stopTime + 300ms` calls manual `disconnect()` on all per-note nodes.
- **Worklets:** No transient nodes — all DSP is in-process.

---

## 3. Per-Subsystem CPU Cost Breakdown

### 3.1 AudioWorklet Thread (JS — per-sample costs)

All worklets share the render thread deadline. Costs are in **floating-point operations per sample** (ops/s).

#### 3.1.1 Reverb (`BelgianReverbProcessor`) — **HOTSPOT #1**

| Stage | Operations | Ops/Sample |
|-------|-----------|-----------|
| Predelay (2ch write+read) | 2 write, 2 read, 2 index | 8 |
| Pre-diffusion (2 × 6-stage DiffuserChain) | 12 allpass: each = 1 read + 1 write + 3 mul + 2 add | 84 |
| FDN delay reads (8 × interpolated) | 8 × (modulo + floor + frac + 2 reads + lerp) | 80 |
| FDN damping (8 × OnePole) | 8 × 3 | 24 |
| FDN high-pass (8 × OnePoleHP) | 8 × 4 | 32 |
| Hadamard 8×8 mix | 8 outputs × 8 adds + 8 muls (Float64) | 72 |
| Mid-diffusion (2 × 4-stage DiffuserChain) | 8 allpass × 7 | 56 |
| FDN write-back + softClip | 8 × (softClip 5 ops + mul + add) | 56 |
| Output taps (12 reads + blend) | 12 reads + 12 muls + 6 adds | 30 |
| Post-diffusion (2 × 6-stage DiffuserChain) | 12 allpass × 7 | 84 |
| DC blocking (2 ch) | 2 × 3 | 6 |
| Stereo width | 4 adds + 2 muls | 6 |
| **Quality mode: ultra** | | **538** |
| **Quality mode: balanced** (halved diffusers) | | ~340 |
| **Quality mode: lite** (quartered) | | ~210 |
| LFO + smoothing (per block) | 4 LFO + damping smooth | ~20/block |

**Per block (128 samples, ultra):** 538 × 128 = **68,864 ops**  
**Total allpass stages: 32** (6+6 pre, 4+4 mid, 6+6 post)  
**Memory:** 8 FDN delay lines (37–109 ms × size × sampleRate) + 32 allpass internal buffers ≈ **~1 MB**

#### 3.1.2 Granular FX (`GranularFxProcessor`) — **HOTSPOT #2** (when granular)

| Processing Path | Operations | Ops/Sample/Voice |
|----------------|-----------|-----------------|
| Buffer write + silence detect | 2 writes + 2 abs + cmp | 10 |
| **Clean voice** (cubic Hermite) | 2 × (4 reads + 10 muls + 6 adds) + 2 × anti-alias biquad (9 ops) + pan lookup + 4 muls + 2 adds | ~65 |
| **Clean + blur** (4-stage allpass L+R) | Clean + 8 × (3 reads + 2 writes + 4 muls + 2 adds) | ~153 |
| **LFO Scan voice** (speed=0, dual head) | 2 × cubic Hermite × 2 heads + crossfade table lookup + constant-power blend | ~120 |
| **Granular voice** (per active grain) | 2 × cubic Hermite + Hann window lookup + pan lookup + 6 muls + 2 adds | ~40/grain |
| Granular voice overhead | Grain scheduling, spawn, density check | ~30 |
| Feedback path (HPF+LPF+RMS+autoGain+softClip) | 2 × HPF(4) + 2 × LPF(3) + RMS(5) + autoGain(3) + 2 × fastTanh(9) + 2 writes | ~44 |
| Output limiting | 2 × fastTanh + 2 × multiply | ~14 |

**Scenario costs (per block of 128 samples):**

| Scenario | Voices Active | Ops/Sample | Ops/Block |
|----------|--------------|-----------|----------|
| 4 clean voices | 4 × 65 | 328 | 41,984 |
| 2 clean + 1 LFO scan + 1 granular (20 grains) | 2×65 + 120 + 830 | 1,148 | 146,944 |
| 4 granular voices (20 grains each) | 4 × 830 | 3,388 | 433,664 |
| Idle (buffer write only, all voices off) | 10 + 44 + 14 | 68 | 8,704 |

**Memory:** 16 s stereo buffer at 48 kHz = 2 × 768,000 × 4 bytes = **~6.1 MB**  
Grain pools: 4 × 64 pre-allocated grain objects. Lookup tables: Hann (4 KB), pan (2 KB), crossfade (8 KB), gainComp (260 B).

#### 3.1.3 Granulator (legacy `GranulatorProcessor`)

| Component | Ops/Sample |
|-----------|-----------|
| Buffer write | 2 |
| Grain scheduling check | ~5 |
| Per active grain (linear interp + Hann + pan + blend) | ~25/grain |
| Pink noise generator (7-state) | ~22 |
| Feedback (2 × Math.tanh + blend) | ~14 |
| Output mix | 2 |
| **64 grains typical** | **1,645** |
| **Max 128 grains** | **3,245** |

**Per block (64 grains):** 1,645 × 128 = **210,560 ops**  
**Memory:** 4 s stereo = 2 × 192,000 × 4 = **~1.5 MB**

> **Warning:** If both Granulator and Granular FX are enabled simultaneously in granular mode, their combined per-block cost can reach ~640K ops — the single highest JS workload.

#### 3.1.4 Ocean (`OceanProcessor`)

| Component | Ops/Sample |
|-----------|-----------|
| Per active wave generator (2 max) | ~30 each |
| Rumble layer (2 × RNG + 2 × LPF) | 8 |
| Foam filter (2 × one-pole) | 4 |
| Master smoothing (2 × LPF + 2 × HPF) | 8 |
| Output (2 × fastTanh) | 18 |
| **Both generators active** | **~98** |
| **Idle (between waves)** | **~38** |

**Per block:** 98 × 128 = **12,544 ops**  
**Memory:** Negligible (no delay lines). ~7 RNG calls/sample using `mulberry32` (seeded PRNG, ~6 ops/call).  
**Wave events:** Every 3–20 s. Per-event cost negligible (counter reset + postMessage to UI).

### 3.2 Native Render Thread (C++ — per-sample costs)

Estimated ops/sample for each node type (browser-internal, approximate):

| Node Type | Typical Ops/Sample | Count (Persistent) | Total Ops/Sample |
|-----------|-------------------|-------------------|-----------------|
| OscillatorNode | ~12 (wavetable + phase) | 32 | 384 |
| GainNode | ~2 (multiply + automation) | 140 | 280 |
| BiquadFilterNode | ~12 (biquad diff eq) | 31 | 372 |
| DelayNode | ~6 (circular buffer R/W) | 12 | 72 |
| WaveShaperNode (2× oversample) | ~15 (upsample + lookup + downsample) | 6 | 90 |
| StereoPannerNode | ~4 | 8 | 32 |
| ChannelMergerNode | ~2 | 2 | 4 |
| DynamicsCompressorNode | ~25 (RMS + gain + smoothing) | 1 | 25 |
| AnalyserNode | ~2 (accumulate time-domain) | 7 | 14 |
| AudioBufferSourceNode | ~4 (buffer read + interp) | 6 | 24 |
| AudioWorkletNode (pass-through) | ~2 (buffer copy) | 4 | 8 |
| **Persistent native total** | | **249** | **~1,305** |

**Transient native cost (peak activity):**

| Source | Peak Concurrent Nodes | Est. Ops/Sample |
|--------|----------------------|----------------|
| 2 overlapping FM lead notes (4 unison each) | ~280 | ~1,200 |
| 4 simultaneous drum triggers | ~60 | ~350 |
| **Peak transient native** | **~340** | **~1,550** |

**Total native render: ~1,305 + 1,550 = ~2,855 ops/sample (peak)**  
**Per block: ~365,440 native ops** (but these are compiled C++ — effectively ~5× cheaper than JS ops in wall-clock time)

### 3.3 Main Thread (~60 Hz)

#### 3.3.1 `applyParams()` — called every `requestAnimationFrame`

| Section | Ops/Call | Notes |
|---------|---------|-------|
| S&H dual-range sampling (10 Hz) | ~50 | Only fires every 100 ms |
| LFO computation (4 LFOs) | ~120 | `computeLfoValue()` × 4 (pad1 LFO1/2, pad2 LFO1/2) |
| Mod envelope simulation (2 pads) | ~40 | Cyclic phase → ADS envelope |
| Pad parameter derivation (p1, p2 structs) | ~200 | Crossfade, clamping, NaN guards |
| Voice re-routing (on pad2Assign change) | ~30 | disconnect + connect (rare) |
| Voice loop (6 voices) | ~230 | Per voice: 8 waveform sets, ~12 `setTargetAtTime` calls |
| Saturation curve (on hardness change) | ~3,000 | 256-sample `Math.tanh` curve; **rare** |
| Granulator `postMessage` | ~20 | 13-param object serialization |
| Granular FX parameter build | ~400 | 4-voice × 15 shv() reads, macro computation, 4-iteration loop with ~60 math ops |
| Granular FX `postMessage` | ~40 | ~50-param object serialization |
| Looper multi-tap delay | ~100 | 8 × `setTargetAtTime` × 3 params |
| Reverb `postMessage` | ~10 | 9-param object |
| Lead/Ocean/Master params | ~60 | ~15 `setTargetAtTime` calls |
| **Typical total per call** | **~1,300** | **Excluding saturation recalc** |

**At 60 Hz: ~78,000 ops/second.** This is negligible CPU but **blocks the main thread** for ~0.02 ms per frame. The concern is not throughput but jank potential from:
- Object allocation in `postMessage` serialization (GC pressure)
- `cancelScheduledValues` / `setTargetAtTime` scheduling overhead in the Web Audio API

#### 3.3.2 Euclidean Schedulers (3 independent, each at ~20 Hz via `setTimeout(50)`)

| Scheduler | Per-Tick Cost | Notes |
|-----------|-------------|-------|
| **Drum** (`startEuclidScheduler`) | ~800 ops | 4 lanes × pattern lookup, probability, voice selection, trig conditions, morph/distance override, ratchet |
| **Synth/Lead** (`startSynthEuclidScheduler`) | ~1,600 ops | 4 lanes × pattern + scale note lookup + morph + FM note creation via `setTimeout` |
| **Looper** (`startLooperEuclidScheduler`) | ~800 ops | 4 lanes × pattern + slice/pitch/reverse sub-lane + `postMessage` trigger |
| **Total at 20 Hz** | ~64,000 ops/s | Negligible CPU |

**Per-event costs** (triggered by schedulers):
- **Drum trigger:** `computeVariation()` + `computeDistance()` + `resolveMorph()` ≈ 50 ops + node creation (1–5 `createOscillator`/`createGain`/`createBiquadFilter` calls). Browser node creation is ~5–20 μs each.
- **Lead FM note:** `morphPresets()` (~50 ops) + `playLead4opFMNote()` creates 30–40 nodes × 4 unison = ~120–160 `create*Node()` calls + `setValueAtTime` / `linearRampToValueAtTime` scheduling. **Each note: ~50–100 μs of main-thread time.**
- **Looper Euclidean trigger:** Single `postMessage` to worklet ≈ 5 μs.

#### 3.3.3 Other Main-Thread Timers

| Timer | Interval | Cost |
|-------|---------|------|
| Transient node cleanup (`drumSynth`) | 2,000 ms | Iterates tracked nodes, `disconnect()` expired groups. ~20 μs typical. |
| Chord progression | Phrase-aligned (~8–16 s) | `applyChord()` sets 6 voice frequencies. ~10 μs. |
| Lead random melody | Phrase-aligned (~8–16 s) | Schedules 1–5 `setTimeout` note triggers. ~5 μs. |
| Morph random walk | 100 ms (in LFO state) | ~10 ops per walk update. Negligible. |

---

## 4. Estimated CPU Budget (48 kHz, Typical Desktop)

**Available budget per block (2.67 ms):**
A single core at ~3 GHz with ~2 FLOP/cycle ≈ 6 GFLOP/s.
Usable budget (excluding OS/browser overhead, ~40%): **~16M ops/block.**
JS JIT penalty for tight numerical loops: **~3× native.** Effectively ~5.3M JS ops/block.

### 4.1 CPU Percentage by Subsystem

| Subsystem | Thread | Language | Ops/Block (raw) | Effective Cost¹ | % of Budget | Severity |
|-----------|--------|---------|-----------------|----------------|-------------|----------|
| **FDN Reverb (ultra)** | Worklet | JS | 68,864 | 206,592 | **3.9%** | Medium |
| **FDN Reverb (balanced)** | Worklet | JS | 43,520 | 130,560 | 2.4% | Low |
| **Granular FX (2 clean + 1 gran + 1 scan)** | Worklet | JS | 146,944 | 440,832 | **8.3%** | **High** |
| **Granular FX (4 granular, 20 grains each)** | Worklet | JS | 433,664 | 1,300,992 | **24.5%** | **Critical** |
| **Granulator legacy (64 grains)** | Worklet | JS | 210,560 | 631,680 | **11.9%** | **High** |
| **Granulator + Looper both granular** | Worklet | JS | 644,224 | 1,932,672 | **36.4%** | **Critical** |
| **Ocean (both generators)** | Worklet | JS | 12,544 | 37,632 | 0.7% | Negligible |
| **Pad Synth (6 voices, persistent)** | Render | Native | ~78,720 | 78,720 | 1.5% | Low |
| **Lead FM (2 notes × 4 unison)** | Render | Native | ~153,600 | 153,600 | 2.9% | Medium |
| **DrumSynth persistent** | Render | Native | ~20,480 | 20,480 | 0.4% | Negligible |
| **DrumSynth transients (4 lanes firing)** | Render | Native | ~44,800 | 44,800 | 0.8% | Low |
| **Looper multi-tap delay (8 taps)** | Render | Native | ~30,720 | 30,720 | 0.6% | Negligible |
| **Bus routing / master** | Render | Native | ~10,240 | 10,240 | 0.2% | Negligible |
| **Main thread (applyParams @ 60 Hz)** | Main | JS | ~1,300/frame | ~4,120/frame | <0.01% | Negligible CPU² |
| **Euclidean schedulers (3 × 20 Hz)** | Main | JS | ~3,200/tick | ~10,000/tick | <0.01% | Negligible CPU² |

¹ Effective Cost = raw ops × 3 for JS (JIT penalty), × 1 for native C++.  
² Main-thread costs are negligible for CPU throughput but can cause **UI jank** if GC pressure or long synchronous work blocks the frame.

### 4.2 Worst-Case Combined Load

| Configuration | Est. Total % | Notes |
|--------------|-------------|-------|
| **Minimal** (pad only, reverb lite, no looper/granular) | ~4% | Just pad voices + lite reverb |
| **Typical** (pad + lead + drums + reverb balanced + looper 2 clean) | ~12% | Comfortable headroom |
| **Heavy** (all above + looper 1 granular + granulator 64 grains) | ~28% | Approaching caution zone on mobile |
| **Maximum** (looper 4×gran + granulator 128 + reverb ultra + all) | **~52%** | Desktop-only territory |
| **Pathological** (above + 4-unison FM notes overlapping) | **~55%** | Sustained ceiling |

### 4.3 Mobile Budget Adjustment

Mobile SoCs (A15, Snapdragon 8 Gen 2) deliver roughly **30–50%** of desktop single-core throughput, and audio threads have stricter power constraints. Multiply desktop percentages by **~2–3×** for mobile.

| Configuration | Desktop | Mobile (est.) |
|--------------|---------|--------------|
| Typical | ~12% | ~24–36% |
| Heavy | ~28% | ~56–84% |
| Maximum | ~52% | ðŸ”´ >100% (glitches) |

---

## 5. Memory Allocation Analysis

### 5.1 Persistent Audio Memory

| Buffer | Size | Notes |
|--------|------|-------|
| Granular FX circular buffer | **6.1 MB** | 16 s × 48 kHz × 2 ch × 4 B. Pre-allocated in worklet constructor |
| Granulator circular buffer | **1.5 MB** | 4 s × 48 kHz × 2 ch × 4 B. Pre-allocated |
| Reverb FDN delay lines (8×) | **~0.9 MB** | 37–109 ms × size(up to 3×) × 48 kHz × 8 B(Float64). Pre-allocated |
| Reverb diffuser buffers (32 allpass) | **~0.05 MB** | Short delay lines, ~200 samples avg |
| DrumSynth noise buffer | **0.19 MB** | 1 s × 48 kHz × 4 B. Shared across all noise-based voices |
| Pad noise AudioBuffer | **0.19 MB** | Shared across 6 voices |
| Ocean sample (OGG decoded) | **~2–4 MB** | Ghetary field recording, loaded async |
| Saturation curves (WaveShaper) | **~0.001 MB** | 256 × Float32, recreated on hardness change |
| **Total persistent** | **~10.9–12.9 MB** | |

### 5.2 Lookup Tables (Pre-computed, No Runtime Allocation)

| Table | Size | Location |
|-------|------|----------|
| Hann window | 1,024 × 4 B = 4 KB | Granulator + Granular FX |
| Pan tables (L/R) | 2 × 256 × 4 B = 2 KB | Granulator + Granular FX |
| Crossfade tables (sin/cos) | 2 × 1,025 × 4 B = 8 KB | Granular FX |
| GainComp table | 65 × 4 B = 260 B | Granular FX |
| Hadamard temp arrays | 3 × 8 × 8 B = 192 B | Reverb (Float64Array) |

### 5.3 Runtime Allocation Patterns

| Source | Frequency | What | GC Pressure |
|--------|-----------|------|-------------|
| `applyParams()` → `postMessage` | 60 Hz | Serialized param objects (granulator: ~13 fields, looper: ~50 fields, reverb: ~9 fields) | **Medium** — 3 objects/frame, structured clone |
| `applyParams()` → Looper voice arrays | 60 Hz | 13 × `number[]` (length 4) for macro-modulated params | **Medium** — `push()` into fresh arrays each frame |
| Drum trigger → `createOscillator()` etc. | Per trigger (~1–8 Hz) | Native node objects | **Low** — browser-managed |
| Lead FM note → node creation | Per note (~0.5–4 Hz) | 120–160 native nodes per note | **Medium** — burst allocation |
| Euclidean pattern cache | On param change | `Map<string, boolean[]>`, max 256 entries | **Low** |
| WaveShaper curve cache | On param change | `Map<string, Float32Array>`, max 64 entries | **Low** |
| Looper grain pools | Pre-allocated | 4 × 64 grain objects, recycled | **None** |

### 5.4 Allocation Hotspot: `applyParams()` Array Construction

Every frame (60 Hz), `applyParams()` builds 13 fresh arrays to compute macro-modulated per-voice looper params:
```typescript
const voiceBlur: number[] = [];     // pushed to in loop
const voiceSpray: number[] = [];    // ...
// × 13 arrays, each length 4
```
Then passes them to `postMessage()` which performs structured clone serialization.  
**Estimated allocation: ~2 KB/frame × 60 = ~120 KB/s of short-lived arrays → Minor GC pressure.**

**Recommendation:** Pre-allocate these arrays as class fields and reuse them. Also consider using `Float32Array` for `postMessage` transferable optimization.

---

## 6. Identified CPU Hotspots (Ranked)

### ðŸ”´ CRITICAL

**1. Dual Granular Processing (Granulator + Granular FX in granular mode)**  
When both the legacy Granulator and the Granular FX operate in granular mode simultaneously, their combined worklet cost reaches **~36% of desktop budget** (~1.9M effective ops/block). On mobile this exceeds the real-time deadline.

*Mitigation:* These are mutually exclusive by design intent (the Granular FX supersedes the legacy Granulator). **Enforce mutual exclusion** — when looper is enabled, bypass granulator completely. Currently both can be active.

**2. Granular FX with 4 granular voices at high grain density**  
4 voices × 20 grains = 80 concurrent grain calculations per sample. At **24.5% desktop budget**, this is the single heaviest subsystem.

*Mitigation:*
- Cap total active grains across all voices (e.g., 64 total, not per-voice)
- Reduce cubic Hermite to linear interpolation for grains (saves ~40% per grain read)
- Consider SIMD-style batch processing of grains with identical pitch

### ðŸŸ¡ HIGH

**3. Legacy Granulator at 64+ grains**  
**11.9% budget** with 64 grains. The `Math.tanh` in the feedback path and per-grain computation dominate.

*Mitigation:* Already uses `fastTanh` approximation in Granular FX — backport to granulator (it still uses `Math.tanh`). Consider deprecating entirely in favor of Granular FX.

**4. FDN Reverb in "ultra" quality mode**  
32 allpass diffusion stages at **3.9% budget** (ultra). Not critical alone, but additive with granular workloads.

*Mitigation:* The quality mode system is already implemented and working. Default to "balanced" on mobile.

### ðŸŸ¢ LOW

**5. `applyParams()` object allocation at 60 Hz**  
Not a CPU cost issue but a **GC pressure** issue. 3 `postMessage` calls/frame with freshly allocated objects.

*Mitigation:* Pre-allocate param objects and reuse. Use `Float32Array` with `Transferable` for bulk numeric data.

**6. Lead FM node burst creation**  
120–160 `create*Node()` calls per note with 4 unison. Each call is ~5–20 μs = ~0.6–3.2 ms of main-thread time per note.

*Mitigation:* Pre-allocate a voice pool with recyclable nodes (similar to drum synth's voice pool pattern). Oscillator nodes can't be restarted, but Gain/Filter/Panner nodes can be reused.

**7. 7 × AnalyserNode in DrumSynth**  
Each AnalyserNode (fftSize=256) has per-sample cost and memory overhead. The time-domain data accumulation continues even when not being read by UI.

*Mitigation:* Only create AnalyserNodes when the drum visualizer UI is visible. Disconnect when hidden.

---

## 7. Native vs JS Processing Summary

| Processing Type | Implementation | Approximate Share of DSP |
|----------------|---------------|------------------------|
| Oscillator generation | Native (C++) | ~15% |
| Gain/mixing/panning | Native (C++) | ~12% |
| Biquad filtering | Native (C++) | ~15% |
| AudioParam automation | Native (C++) | ~5% |
| Delay lines (lead, drum, looper multi-tap) | Native (C++) | ~4% |
| Wave shaping (saturation, drive) | Native (C++) | ~4% |
| Dynamics compression (limiter) | Native (C++) | ~1% |
| **FDN Reverb (allpass + Hadamard)** | **JS (Worklet)** | **~12%** |
| **Granular synthesis** | **JS (Worklet)** | **~30%** |
| **Granular FX (clean/scan/granular)** | **JS (Worklet)** | **~18%** |
| **Ocean wave synthesis** | **JS (Worklet)** | **~2%** |
| Parameter routing (applyParams) | JS (Main) | <1% |
| Euclidean scheduling | JS (Main) | <1% |

**JS Worklet total: ~62% of all audio DSP.** This is the source of all CPU risk — native nodes are highly optimized and essentially free by comparison.

---

## 8. Architecture Diagram (Signal Flow)

```
MAIN THREAD (60Hz RAF)
│
├─ applyParams() ──► setTargetAtTime() ──► [AudioParam automation queue]
├─ Drum Euclid Scheduler (50ms) ──► drumSynth.triggerVoice()
├─ Synth Euclid Scheduler (50ms) ──► playLeadNote() / triggerSynthVoice()
└─ Looper Euclid Scheduler (50ms) ──► postMessage('euclidTrigger')

RENDER THREAD (shared native + worklet)
│
├─ Pad Synth ── 6×(4 Osc → 4 Gain → FilterA → FilterB → Warmth → Presence
│               → Saturation → Gain → ModEnv → Envelope → MixerGain)
│              └──► Pad1Bus / Pad2Bus ──► SynthBus ──┬──► DryBus ──┬──► SynthDirect ──► Master
│                                                     │             └──► SynthReverbSend ──► Reverb
│                                                     └──► GranulatorInput ──► [Granulator Worklet]
│                                                                              └──► WetHPF → WetLPF ──┬──► GranDirect ──► Master
│                                                                                                      └──► GranReverbSend ──► Reverb
│
├─ Pad PreFader ── Envelope ──► Pad1PreFaderBus ──► LooperPad1Send ──┐
│                                                                     │
├─ Lead FM ── playLead4opFMNote() ──► Lead1Bus / Lead2Bus            │
│             └──► LeadGain → LeadFilter ──┬──► LeadDry ──► Master   ├──► GranularFxInput
│                                          ├──► PingPong Delay ──► Master   │
│                                          └──► LeadReverbSend ──► Reverb   │
│                                                                     │
├─ DrumSynth ── trigger*() ──► VoiceBus → PreFaderBus → MasterGain   │
│              └──► DelaySends → StereoDelay → DelayWet ──► Master   ├──► LooperDrumSend
│              └──► ReverbSend ──► Reverb                             │
│                                                                     │
├─ [Granular FX Worklet] ◄── GranularFxInput ◄────────────────────────────┘
│   └──► GranularFxDirect ──► Master
│   └──► GranularFxReverbSend ──► Reverb
│   └──► LooperDelaySend ──► 8-Tap Delay (8×Delay+Gain+Panner+Vibrato)
│                             └──► DelayDirect ──► Master
│                             └──► DelayReverbSend ──► Reverb
│
├─ [Ocean Worklet] ──► OceanGain ──┐
│  OceanSample ──► OceanSampleGain ┴──► OceanFilter ──► Master
│                                                  └──► LooperWavesSend
│
├─ [Reverb Worklet] ◄── All reverb sends
│   └──► ReverbOutputGain ──► Master
│
└─ Master ──► Limiter (DynamicsCompressor) ──► destination / MediaStreamDest
```

---

## 9. Recommendations Summary

| Priority | Action | Estimated Savings | Effort |
|----------|--------|------------------|--------|
| ðŸ”´ P0 | Enforce granulator/looper mutual exclusion | Up to 12% CPU | Low |
| ðŸ”´ P0 | Cap total grain count across all looper voices | Up to 15% CPU at peak | Low |
| ðŸŸ¡ P1 | Default reverb to "balanced" on mobile | ~1.5% CPU saved | Trivial |
| ðŸŸ¡ P1 | Pre-allocate `applyParams()` arrays as class fields | Reduces GC pressure | Low |
| ðŸŸ¡ P1 | Backport `fastTanh` to legacy granulator | ~1% CPU saved | Trivial |
| ðŸŸ¢ P2 | Lazy-create AnalyserNodes only when drum viz is visible | 7 fewer persistent nodes | Medium |
| ðŸŸ¢ P2 | Consider linear interp for looper grains (from cubic Hermite) | ~40% per-grain savings | Low |
| ðŸŸ¢ P2 | Lead FM voice pool (reuse Gain/Filter/Panner nodes) | Reduces node creation overhead | Medium |
| ðŸŸ¢ P3 | Use `Transferable` Float32Array for worklet `postMessage` | Eliminates structured clone overhead | Medium |
| ðŸŸ¢ P3 | Deprecate legacy Granulator in favor of Granular FX | Removes 459 lines + 1.5 MB buffer | Low effort, UX concern |
