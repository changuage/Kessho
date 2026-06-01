# Kessho Product Core Reverb Update Handoff

## Scope

Implement the full Product Core / WASM reverb update plan and add a new Reverb UI/control parameter named **Bloom** that push Kessho closer to lush Valhalla Supermassive / Eventide Blackhole territory: smoother late tails, larger ambient washes, stronger reverse/inverse-tail behavior, and less room-like early reflection character.

The goal is **no sonic-quality degradation** and **no CPU increase**. Sonic changes are allowed and desired, but they must be intentional, smoother, and better for ambient tails.

## Naming decision

Use this user-facing name:

```text
Bloom
```

Use these internal names:

```text
TypeScript/UI state: reverbBloom
Product Core generated/C++ field: reverb_bloom
C/WASM state field: bloom
```

Do **not** call the UI control “Gravity.” Avoid “Crystallization.” The control should fit the snowflake journey theme and imply movement of the reverb tail.

Recommended display semantics:

```text
-1.00  Inward / reverse-swell pull
 0.00  Suspended cloud
+1.00  Forward / outward bloom
```

Recommended tooltip / help copy:

```text
Tail direction through the space: left pulls the wash into reverse swells; center suspends the cloud; right blooms forward.
```

## Functional behavior

`reverbBloom` is a signed macro for tail bloom direction and cosmic motion.

```text
Range:   -1.0 .. +1.0
Step:     0.01
Default:  0.0
```

Meaning:

```text
reverbBloom < 0:
  Blackhole-style inward / inverse tail.
  More reverse swell, softer forward attack, fewer early reflections, denser late smear, darker horizon.

reverbBloom == 0:
  Neutral. Existing behavior should remain unchanged unless other DSP refactors are intentionally enabled.

reverbBloom > 0:
  Forward/outward bloom.
  Less reverse emphasis, smoother forward wash, slightly softened onset, still not room-like.
```


## Hard constraints

1. Default value must be `0.0` for backwards-compatible state and minimal surprise.
2. No extra CPU at default.
3. Negative Bloom may enable reverse behavior, but should pay for that by reducing/skipping early reflections and by optimizing reverse/LFO paths.
4. Do not increase default shimmer use. Shimmer is beautiful but not CPU-free.
5. Do not increase `reverbQuality` automatically.
6. Do not add another FDN, convolution, oversampling, or extra delay network.
7. Preserve Product Core architecture: React/TypeScript owns UI/state; production DSP and CPU-critical behavior stay in Product Core / WASM.


---

# UI impact assessment and implementation decision

## Current decision

Most of the reverb improvements do **not** require UI changes. However, this handoff intentionally adds **one** new user-facing control:

```text
Bloom
```

Bloom replaces the earlier working concept of a “Gravity” slider. The implementation should **not** expose a control named Gravity. Use Bloom everywhere user-facing and use the internal field names defined above.

No additional design questions are blocking implementation. Proceed with these defaults:

```text
UI label:             Bloom
TypeScript key:       reverbBloom
Product Core field:   reverb_bloom
C/WASM field:         bloom
Range:                -1.0 .. +1.0
Default:              0.0
Step:                 0.01
Placement:            Reverb page, Shimmer & Effects card, near Reverse controls
```

## Existing UI context

Kessho already has a dedicated Reverb page and existing visible controls for the important territory: engine, type, quality, decay, size, diffusion, modulation, pre-delay, damping, width, shimmer, slow mod, reverse, spectral freeze, plus preset recall/save. The Reverb page also already defines character presets such as `blackhole`, `reverseWash`, `cosmicDrift`, `supermassive`, `gravityWell`, and `eventHorizon`.

Source references for implementation:

```text
Reverb UI page:
https://raw.githubusercontent.com/changuage/Kessho/main/src/ui/reverb/ReverbPage.tsx

Repo / Product Core architecture:
https://github.com/changuage/Kessho
```

Architecture rule: React/TypeScript own UI/state, while production DSP and CPU-critical behavior stay behind Product Core / WASM.

## No UI update needed for these changes

These can be implemented entirely inside Product Core / WASM / preset mapping and should not require any new visible controls beyond Bloom.

| Change | UI needed? | Why |
|---|---:|---|
| Dirty-param commit cache | No | Pure CPU/architecture optimization. |
| Remove redundant zero-fill | No | Render-path cleanup only. |
| Native planar reverb API | No | Buffer-layout optimization. |
| Precompute golden-hash constants | No | Internal CPU optimization. |
| Replace per-sample sine/fmod LFOs with oscillators/block-rate modulation | No | Same visible controls, cheaper implementation. |
| Reverse buffer indexing/envelope optimization | No | Existing `reverbReverse`, `reverbReverseLength`, and new `reverbBloom` controls can drive it. |
| Static delay-spread warp | No, if mapped from existing `reverbWarp` | The UI already exposes `reverbWarp`; Bloom can bias it internally. |
| Raise late-diffusion cap in cosmic modes | No | Internal mode/preset tuning. |
| Retune multitap gains for smoother wash | No | Internal sonic tuning. |
| Reduce or disable early reflections in space presets | No | Existing `reverbEarlyReflections` param already exists. |
| Sample-rate scaling fix | No | Correctness fix, not a user-facing feature. |

## Minimal preset updates only

Most “more Supermassive / Blackhole” improvements should be achieved through preset retuning and internal macro mapping rather than a larger UI surface.

Good low-risk preset-only changes:

```text
Supermassive:
  lower early reflections
  lower or remove shimmer if CPU budget matters
  higher static warp behavior
  more cross-feed
  darker high damping
  longer reverse length only if reverse or negative Bloom is enabled
  modest negative Bloom, roughly -0.20

Blackhole / Event Horizon:
  early reflections = 0
  stronger reverse
  longer reverse length
  high diffusion
  large size
  very dark damping
  more air absorption
  slower modulation
  strong negative Bloom, roughly -0.72 to -0.90
```

Existing character presets such as `blackhole`, `reverseWash`, `cosmicDrift`, `supermassive`, `gravityWell`, and `eventHorizon` should be retuned as preset-data changes. Keep legacy preset keys where compatibility requires them, but update visible labels where needed; for example, keep the internal `gravityWell` key but display **Glacial Pull**.

## UI update needed only if exposing more new concepts

Bloom is the one selected new UI concept. Do not add the other concepts below unless a later product decision explicitly requests them.

| New concept | UI needed? | Preferred implementation now |
|---|---:|---|
| `Bloom` knob | Yes | Add now. Signed macro: reverse/inward swell → suspended cloud → forward bloom. |
| Former `Gravity` concept | Do not expose | Implement as Bloom; avoid the word “Gravity” in UI. |
| `Density` knob | Yes | Do not add. Map density internally from `reverbDiffusion`, `reverbSize`, `reverbType`, `reverbWarp`, and Bloom. |
| `Space Mode` / `Cosmic Mode` selector | Yes | Do not add. Infer from selected preset, large `reverbSize`, high `reverbWarp`, and nonzero Bloom. |
| `Static Warp` vs `Dynamic Warp` split | Yes | Do not add. Keep one visible `reverbWarp` and split internally. |
| `Reverse Mode`: additive / inverse / two-head | Yes | Do not add. Use `reverbReverse` plus negative `reverbBloom` to progressively enter inverse/two-head behavior. |
| `Late Diffusion` slider | Yes | Do not add. Tie it internally to `reverbDiffusion`, `reverbSize`, cosmic presets, and Bloom. |
| `Blackhole Gravity` preset family | Maybe | Do not use the word Gravity in UI. Use names like `Blackhole`, `Event Horizon`, `Glacial Pull`, or similar. |

## Internal mapping using existing controls plus Bloom

Use existing controls like this:

```text
reverbBloom:
  -1.00 .. -0.20 = inverse/reverse Blackhole-style swell and inward pull
  -0.20 .. +0.20 = suspended ambient cloud
  +0.20 .. +1.00 = forward/outward bloom with minimal reverse emphasis

reverbWarp:
  becomes a macro that controls both static delay spreading and small dynamic modulation

reverbReverse:
  0.00 - 0.20 = subtle reverse tail
  0.20 - 0.50 = Blackhole-style inverse blend when Bloom is negative
  0.50 - 1.00 = strong two-head reverse wash, only if CPU budget allows

reverbDiffusion:
  controls existing diffusion plus late-blend amount in cosmic modes

reverbSize:
  controls actual delay size plus static spread amount at very large values

reverbType:
  cathedral / darkHall can automatically select the smoother cosmic tuning path

reverbEarlyReflections:
  keep visible, but presets can set it near zero for non-room cosmic verbs
```

This gives better sound without turning the Reverb page into a dense expert-only panel.

## Selected UI addition: Bloom

Use Bloom semantics consistently:

```text
Bloom:
  -1.0 = reverse/inward bloom
   0.0 = suspended wash
  +1.0 = forward/outward bloom
```

Recommended visible helper text:

```text
Reverse swell ← suspended cloud → forward bloom
```

Recommended longer tooltip:

```text
Shapes how the tail moves through the space. Pull left for inward reverse swells, center for a suspended wash, or push right for a forward bloom.
```

## Implementation impact of the new visible control

Adding Bloom should touch the full UI-to-DSP control path:

```text
src/ui/state.ts
DEFAULT_STATE
URL/state serialization
preset save/load typing
ReverbPage.tsx
slider help catalog
Product param sync
Product Core schema / generated bindings
C++ Product snapshot or FX config
ProductFxModules.cpp reverb param block
KesshoReverbModule.cpp param count and commit path
WASM/C reverb parameter API
benchmark/parity fixtures
reverb preset fixtures and tests
```

Because Product Core is the production DSP boundary and UI state is owned in React/TypeScript, Bloom needs to cross that whole boundary cleanly. Do not implement Bloom as UI-only state.

## Practical recommendation for this pass

For this implementation pass, treat Bloom as one control inside the larger reverb work, not as a UI-only change:

1. Add the Bloom UI/control path end-to-end.
2. Retune existing `blackhole`, `supermassive`, `eventHorizon`, and `reverseWash` presets around Bloom.
3. Keep `gravityWell` as an internal compatibility key if needed, but rename the visible preset label to **Glacial Pull**.
4. Make `reverbWarp` internally do static delay spreading.
5. Make `reverbReverse` plus negative Bloom move from additive reverse into inverse/reverse-swell behavior.
6. Disable or greatly reduce early reflections in cosmic presets.
7. Optimize LFO/reverse internals to pay for the smoother reverse wash.
8. Keep all other suggested concepts internal rather than adding more controls.

## Open questions before implementation

None. Proceed with the Bloom naming and defaults above.


---

# Implementation plan

## 0. Full reverb implementation order and technical scope

Bloom is only one part of this implementation. The broader change is a Product Core / WASM reverb update that moves the sound away from room/hall realism and toward a modulated cosmic delay-network wash, while staying CPU-neutral or CPU-lower.

Core thesis:

```text
Reduce early-reflection/room work, optimize modulation/interpolation, and spend the saved budget on smoother late diffusion, static delay spreading, and inverse/reverse Bloom behavior.
```

Do **not** add another reverb engine, convolution stage, oversampling path, second FDN, or high-cost pitch/shimmer layer as part of this work. The existing FDN, reverse buffer, warp, cross-feed, damping, diffusion, allpass, and preset infrastructure should be reshaped and optimized.

### Mandatory implementation order

Follow this order so CPU budget is freed before richer reverse/Blackhole-style behavior is enabled:

1. **Add a `spaceMode` / Bloom macro.**
   - User-facing control is **Bloom**, not Gravity.
   - Internal macro may be named `bloom`, `inward`, `outward`, and `spaceMode`.
   - Negative Bloom means reverse/inward swell; positive Bloom means forward/outward tail bloom.

2. **Set early reflections to zero in space/blackhole modes.**
   - Effective ER should approach zero when Bloom is negative or when a preset is explicitly cosmic/blackhole.
   - This removes room-wall cues and frees CPU for reverse/inverse tail behavior.

3. **Optimize tap modulation and chorus modulation to avoid per-sample trig/fmod.**
   - Precompute hash constants.
   - Replace repeated `fast_sinf()`/`floorf()`/`fmodf()` modulation work with recursive oscillators, block-rate values, or linear interpolation where appropriate.

4. **Optimize reverse ring indexing and envelope.**
   - Remove `%` modulo from inner-loop reverse read/write paths.
   - Replace per-sample sine envelope with a lookup table or cheap smooth polynomial envelope.

5. **Use two-head reverse only after ER is disabled.**
   - Two-head reverse is allowed only when effective early reflections are zero/near-zero and benchmark CPU does not increase.
   - It should smooth Blackhole-style reverse wash, not become a mandatory cost for all presets.

6. **Add static warp delay spreading in `updatePreset()`.**
   - Make `reverbWarp` more Supermassive-like by changing delay-line distribution at control/update time.
   - Keep dynamic warp/modulation smaller to avoid seasick pitch motion.

7. **Raise `lateBlend` cap and in-loop allpass feedback only for cosmic modes.**
   - This increases density and smoothness without adding stages.
   - Keep allpass feedback safely capped to avoid metallic ringing.

8. **Retune multitap gains for denser cloud behavior.**
   - Use the same number of delay reads but redistribute energy away from the main tap.
   - This should reduce obvious periodic echoes at huge sizes.

9. **Fix ms-vs-sample sample-rate scaling.**
   - If `FDN_TIMES_MS` are truly milliseconds, use `FDN_TIMES_MS[i] * sampleRate * 0.001f * userSize`.
   - Keep 48 kHz scale factors only for constants that are documented as 48 kHz sample counts.

10. **Benchmark CPU with RMS/LUFS-matched output and graph taps disabled.**
    - Compare with matched seed, params, level, visualizer state, and routing.
    - Use scoped Product Core timings, not browser aggregate CPU alone.

### Space/Bloom macro design

At block/control scope, compute:

```cpp
const float bloom = clamp(g_reverb.bloom, -1.0f, 1.0f);
const float inward = fmaxf(0.0f, -bloom);
const float outward = fmaxf(0.0f, bloom);
const bool bloomActive = fabsf(bloom) > 0.0001f;

const bool spaceMode =
    bloomActive ||
    g_reverb.warp > 0.25f ||
    g_reverb.size > 4.0f ||
    g_reverb.type == REVERB_TYPE_CATHEDRAL ||
    g_reverb.type == REVERB_TYPE_DARK_HALL;
```

If type enum names differ, use the actual project constants. For preset-driven behavior, also allow the preset layer to tag `blackhole`, `eventHorizon`, `supermassive`, `reverseWash`, `cosmicDrift`, and `gravityWell`/`Glacial Pull` as cosmic modes.

### Early reflections: remove room cues and free CPU

For Supermassive/Blackhole territory, early reflections should not dominate. They make the result feel like a room with walls instead of a self-sustaining cosmic cloud.

Effective ER mapping:

```cpp
float erAmount = g_reverb.earlyReflections;
erAmount *= (1.0f - inward * 0.98f);   // inverse Bloom nearly kills ER
erAmount *= (1.0f - outward * 0.35f);  // forward Bloom also reduces room cues

if (spaceMode && inward > 0.15f) {
  erAmount = 0.0f;
}

if (erAmount < 0.0001f) {
  erAmount = 0.0f;
}
```

All early-reflection work must be gated on the **effective** `erAmount`, not the raw UI parameter. If `erAmount == 0`, skip ER tap reads and ER low-pass state updates.

Preset guidance:

```cpp
earlyReflections = 0.0f;      // strict CPU save for Blackhole/Event Horizon
// or
earlyReflections = 0.03f;     // faint onset for gentler cosmic presets
erLpFreq = 900.0f;            // if ER is nonzero
```

### Bloom reverse/inverse tail morph

The existing reverse branch should evolve from a purely additive layer into a wet-tail morph for negative Bloom.

Existing additive concept:

```cpp
rawL += reverseBufL[readIdx] * env * reverseAmount;
rawR += reverseBufR[readIdx] * env * reverseAmount;
```

Target behavior:

```cpp
float reverseAmount = g_reverb.reverseAmount;
reverseAmount = fmaxf(reverseAmount, inward * 0.38f);
reverseAmount = fminf(1.0f, reverseAmount + inward * (1.0f - reverseAmount) * 0.22f);
reverseAmount *= (1.0f - outward * 0.85f);

if (reverseAmount < 0.0001f) {
  reverseAmount = 0.0f;
}

const float reverseMorph = inward * reverseAmount;
const float forwardKeep = 1.0f - reverseMorph * 0.45f;

rawL = rawL * forwardKeep + reverseL * reverseEnv * reverseAmount;
rawR = rawR * forwardKeep + reverseR * reverseEnv * reverseAmount;
```

This should create an inward/reverse Bloom similar to Blackhole-style inverse decay without adding a new algorithm.

Positive Bloom should not enable reverse. It should use CPU-free/control-rate shaping only:

```cpp
lateBlend += outward * 0.035f;
// Reduce ER modestly as above.
// Do not auto-enable transientSmooth.
```

### Reverse optimization details

Replace per-sample modulo and sine envelope:

```cpp
int readIdx = (reverseWriteIdx - (int)reverseReadPhase + rCycleLen) % rCycleLen;
float env = fast_sinf(envPos * M_PI);
reverseWriteIdx = (reverseWriteIdx + 1) % rCycleLen;
```

with integer heads and branch wrapping:

```cpp
// State:
int reverseReadIdxA;
int reverseReadIdxB;
int reverseWriteIdx;
int reversePhase;

// Per sample:
if (--reverseReadIdxA < 0) reverseReadIdxA += rCycleLen;
if (++reverseWriteIdx >= rCycleLen) reverseWriteIdx = 0;
```

Envelope options:

```cpp
// p is 0..1
float env = 4.0f * p * (1.0f - p); // cheap smooth parabolic window
```

or a small table:

```cpp
static constexpr int kReverseEnvSize = 256;
float env = reverseEnvTable[envIdx];
```

Two-head reverse is optional and must be CPU-gated:

```cpp
if (reverseAmount > 0.0001f && inward > 0.15f && erAmount == 0.0f) {
  // read head A and B 180 degrees apart with complementary windows
  // rev = revA * envA + revB * envB
}
```

CPU rule:

```text
Two-head reverse is allowed only if effective ER is zero or near-zero and benchmark CPU does not increase.
```

### Modulation and hash optimization

Precompute all hash-based constants. Do not call `goldenHash()` / `fmodf()` in per-sample or per-line inner loops.

Use arrays such as:

```cpp
static constexpr float kLineHash[16] = { /* precomputed 0..1 */ };
static constexpr float kLineDepthScale[16] = { /* 0.7 + 0.6 * hash */ };
static constexpr float kTapPhaseOffset[16] = { /* decorrelated offsets */ };
static constexpr float kWarpSign[16] = { /* -1..+1 */ };
```

For slow LFOs, replace repeated `fast_sinf()` with recursive oscillator state:

```cpp
struct LineLfo {
  float s, c;
  float sinInc, cosInc;
};

inline float tick(LineLfo& lfo) {
  const float out = lfo.s;
  const float s2 = lfo.s * lfo.cosInc + lfo.c * lfo.sinInc;
  const float c2 = lfo.c * lfo.cosInc - lfo.s * lfo.sinInc;
  lfo.s = s2;
  lfo.c = c2;
  return out;
}
```

Compute `sinInc/cosInc` only when rates change. For output tap modulation at rates around `0.01–0.05 Hz`, update once per block or linearly interpolate across the block.

### Optional cheaper interpolation for space mode

`SmoothDelay::readInterpolated()` is heavily used. In Ultra mode, the non-Lite path can read multiple interpolated taps per FDN line. For cosmic modes, test a simpler linear read that can slightly soften modulation artifacts and reduce cost:

```cpp
inline float readLinear(float delaySamples) const {
  if (delaySamples >= (float)(size - 1)) delaySamples = (float)(size - 2);
  if (delaySamples < 1.0f) delaySamples = 1.0f;

  float readPos = (float)writeIdx - delaySamples;
  if (readPos < 0.0f) readPos += (float)size;

  int i0 = (int)readPos;
  int i1 = i0 + 1;
  if (i1 >= size) i1 = 0;

  float frac = readPos - (float)i0;
  return buffer[i0] + (buffer[i1] - buffer[i0]) * frac;
}
```

Guardrail: keep the existing interpolation for neutral/clean modes if the linear version changes the non-cosmic sound too much. For `supermassive` / `blackhole` / Bloom-active modes, a slightly darker and smoother interpolation character is acceptable if it improves tails and does not raise CPU.

### Static warp delay spreading in `updatePreset()`

Make `reverbWarp` reshape the delay network at update/control time, not only as a dynamic pitch/modulation offset.

Also fix FDN milliseconds scaling if `FDN_TIMES_MS` are truly milliseconds:

```cpp
float baseSamples = FDN_TIMES_MS[i] * sr * 0.001f * userSize;
```

Static spread:

```cpp
const float warp = clamp01(g_reverb.warp);
const float staticWarp = fminf(1.0f, warp + inward * 0.30f);

for (int i = 0; i < maxChannels; ++i) {
  const float h = kLineHash[i];
  const float centered = h * 2.0f - 1.0f;
  const float spread = 1.0f + centered * 0.32f * staticWarp;
  const float longLineBias = 1.0f + 0.12f * staticWarp * kLineHash2[i];
  g_reverb.fdnDelayTimes[i] = baseSamples * spread * longLineBias;
}
```

Keep Dattorro plate size behavior separate; its tank topology may intentionally cap or scale size differently.

### Late-tail density and in-loop allpass smear

Raise late diffusion only where it serves the cosmic/Bloom sound:

```cpp
float lateBlendCap = 0.42f + inward * 0.18f + outward * 0.06f;
lateBlendCap = fminf(0.62f, lateBlendCap);

lateBlend += inward * 0.075f + outward * 0.030f;
if (lateBlend > lateBlendCap) lateBlend = lateBlendCap;
```

Suggested audition targets:

```text
Supermassive cloud:  lateBlend 0.48 - 0.58
Blackhole inverse:   lateBlend 0.55 - 0.62
```

Raise in-loop allpass feedback carefully:

```cpp
float apFb = 0.40f + inward * 0.07f + outward * 0.03f + g_reverb.diffusion * 0.02f;
apFb = fmaxf(0.35f, fminf(0.56f, apFb));
```

Do not exceed roughly `0.56`; higher values can ring or become metallic.

### Multitap density retune

Use the same number of reads, but shift energy toward the secondary taps in space mode:

```cpp
const float mt0 = spaceMode ? 0.50f : 0.60f;
const float mt1 = spaceMode ? 0.31f : 0.25f;
const float mt2 = spaceMode ? 0.19f : 0.15f;
```

Optionally vary secondary tap ratios per line at preset/update time:

```cpp
tapRatio1[j] = 0.55f + 0.12f * kLineHashA[j];
tapRatio2[j] = 0.33f + 0.10f * kLineHashB[j];
```

This should make huge sizes less periodically echo-like without more reads.

### Darker Blackhole horizon without new filters

Bias existing damping/air-absorption coefficients instead of adding new filters:

```cpp
blockDampHigh = fminf(1.0f, blockDampHigh + inward * 0.06f);
blockDampLow  = fminf(1.0f, blockDampLow  + inward * 0.015f);
```

Do not auto-enable `tube` saturation. Tube mode uses expensive nonlinear work; use `clean` or `tape` for CPU-neutral warmth.

### Preset target additions

Add or retune these as either new character presets or internal target profiles for existing presets.

#### Supercloud

```text
type:              cathedral
quality:           ultra, but do not auto-upgrade existing user quality
decay:             0.94 - 0.985
size:              4.0 - 7.5
diffusion:         0.95 - 1.0
predelay:          45 - 85 ms
width:             1.0
chorusRate:        0.05 - 0.12 Hz
chorusDepth:       8 - 18 samples
modCharacter:      hybrid or drift
slowModRate:       0.015 - 0.04 Hz
slowModDepth:      0.10 - 0.25
warp:              0.25 - 0.55, mostly static delay spread
crossFeed:         0.20 - 0.45
earlyReflections:  0.00 - 0.05
airAbsorption:     0.25 - 0.40
dampLow:           0.04 - 0.12
dampHigh:          0.24 - 0.42
crossover:         700 - 1200 Hz
lateBlend cap:     0.55 - 0.58
reverbBloom:             -0.15 to -0.30
reverseAmount:     0.0
shimmerAmount:     0.0 unless CPU has been freed
```

#### Event Horizon

```text
type:              darkHall
quality:           ultra, but do not auto-upgrade existing user quality
decay:             0.965 - 0.995
size:              6.0 - 10.0
diffusion:         1.0
predelay:          70 - 120 ms
width:             1.0
chorusRate:        0.035 - 0.08 Hz
chorusDepth:       6 - 14 samples
modCharacter:      drift or hybrid
slowModRate:       0.01 - 0.025 Hz
slowModDepth:      0.15 - 0.30
warp:              0.45 - 0.75, mostly static spread
crossFeed:         0.35 - 0.60
earlyReflections:  0.0
airAbsorption:     0.45 - 0.65
dampLow:           0.08 - 0.18
dampHigh:          0.38 - 0.62
crossover:         600 - 1000 Hz
lateBlend cap:     0.58 - 0.62
reverbBloom:             -0.75 to -0.90
reverseAmount:     0.12 - 0.35
reverseLength:     5 - 12 s
shimmerAmount:     0.0 or tiny only after CPU savings
```

#### Great Annihilator-style sustained space

```text
type:              cathedral
decay:             0.985 - 0.998
size:              7.0 - 10.0
diffusion:         1.0
warp:              0.60 - 0.85
crossFeed:         0.45 - 0.65
lateBlend cap:     0.62
earlyReflections:  0.0
airAbsorption:     0.35 - 0.55
reverbBloom:             -0.20 to -0.50
reverseAmount:     0.04 - 0.12 optional
reverseLength:     8 - 16 s
```

Use careful output limiting and tail-level normalization for very long decay presets.

### What not to do

Do not simply turn on every pretty feature:

```text
shimmerAmount high
reverseAmount high
transientSmooth high
earlyReflections high
tube saturation
full Ultra multi-tap without offsetting CPU savings
```

This will sound lush in isolation, but it violates the no-extra-CPU constraint. Shimmer and reverse are gated by amount; shimmer is not free. Tube saturation is especially discouraged for this pass because it uses expensive nonlinear math.

### Benchmark/parity rules for this implementation

Before treating a CPU delta as real, match:

```text
same seed/snapshot
same FX params including reverbBloom
same RMS or LUFS within ±0.25 dB
same visualizer / graph tap state
same viewport/GPU state for browser aggregate tests
```

Run at least 10 captures and compare median and p95. Always include graph taps disabled first, then repeat with graph taps enabled if needed.

## 1. Add `reverbBloom` to UI state

### Files to update

```text
src/ui/state.ts
src/ui/reverb/ReverbPage.tsx
src/ui/reverb/reverb.css                    # only if layout needs minor spacing
src/presets/* or preset metadata helpers    # if preset save/load schemas are separate
src/audio/generated/*                       # generated after schema changes; do not hand-edit unless repo convention requires
```

### `src/ui/state.ts`

Add the field near the existing reverse / warp reverb parameters, preferably after `reverbReverseLength`:

```ts
reverbBloom: number; // -1..+1 step 0.01 - tail direction: reverse swell .. suspended .. forward bloom
```

Add default:

```ts
reverbBloom: 0,
```

Add it to every range/slider metadata map that contains adjacent reverb params. Search adjacent keys such as:

```text
reverbReverse
reverbReverseLength
reverbWarp
reverbEarlyReflections
```

Recommended range metadata:

```ts
reverbBloom: { min: -1, max: 1, step: 0.01 }
```

Add URL/state serialization, preset serialization, migration defaults, randomization/automation eligibility, MIDI mappable lists, and patch bridge coverage if those are maintained in `state.ts` or generated metadata.

### `src/ui/reverb/ReverbPage.tsx`

Add a visible slider labeled **Bloom** in the **Shimmer & Effects** card, near the existing `Reverse` controls.

Recommended placement:

```tsx
<Slider
  label="Bloom"
  value={state.reverbBloom ?? DEFAULT_STATE.reverbBloom}
  paramKey="reverbBloom"
  onChange={onParamChange}
  {...sp('reverbBloom')}
/>
```

If the UI has helper copy/sub-label support, use:

```text
Reverse swell ← suspended cloud → forward bloom
```

Update the conditional display for `reverbReverseLength` so it appears when either reverse is active or Bloom is pulling inward:

```tsx
{(state.reverbReverse > 0 || state.reverbBloom < 0) && (
  <Slider ... paramKey="reverbReverseLength" ... />
)}
```

### Presets in `REVERB_CHARACTER_PRESETS`

Add `reverbBloom` to every preset param object.

Conservative defaults:

```text
default:         0.00
shimmerPad:      0.00
nightsky:       -0.10
lossyFreeze:    -0.20
reverseWash:    -0.65
cosmicDrift:    -0.35
supermassive:   -0.20
blackhole:      -0.72
eventHorizon:   -0.90
silkCloud:       0.10
velvetFog:      -0.15
```

The existing `gravityWell` preset key may stay for backwards compatibility, but change the visible label to avoid the word “Gravity.” Recommended:

```ts
gravityWell: {
  label: 'Glacial Pull',
  description: 'Maximum warp — the tail folds inward through a dark, slow-moving bloom current',
  params: {
    reverbBloom: -0.80,
    ...
  }
}
```

Do not remove the old key unless a migration alias is added.

---

## 2. Add Product Core schema / generated param

### Files likely involved

```text
cpp/KesshoCore/schema/kessho_product_params.schema.json
cpp/KesshoCore/schema/kessho_product.schema.json          # if snapshot/schema includes FX fields here
cpp/KesshoCore/generated/*                                # generated
src/audio/generated/kesshoProductParams.ts                # generated
src/audio/generated/kesshoProductSchema.ts                # generated
src/audio/generated/kesshoProductEvents.ts                # only if generator touches it
src/audio/product/* or host bridge files                  # wherever UI state maps to Product params
```

Add a Product param equivalent to:

```json
{
  "name": "reverb_bloom",
  "type": "float",
  "default": 0.0,
  "min": -1.0,
  "max": 1.0,
  "description": "Tail direction macro: negative=inverse/reverse swell, zero=suspended, positive=forward bloom"
}
```

Run generation after schema edit:

```bash
npm run core:product:generate
npm run core:product:schema
```

Then fix any generated compile/type errors rather than manually papering over missing mappings.

---

## 3. Wire Product Core FX params to the reverb module

### `cpp/KesshoCore/src/product/fx/ProductFxModules.cpp`

The current reverb module uses a 30-float parameter block. Increase to 31.

Change the guard:

```cpp
if (params == nullptr || reverb_module->paramCount() < 31) {
  return;
}
```

Append:

```cpp
params[30] = clampFloat(fx.reverb_bloom, -1.0f, 1.0f);
```

Keep the existing 0..29 indexes unchanged to avoid accidental parameter reordering.

### Add exact dirty-param caching

This is both a CPU optimization and a safety improvement. `configureReverbModule()` currently writes all params and commits each time it is called. Add a cached last-committed param block and only call `commitParams()` when the exact clamped float block changes.

In the Product engine internal state/header, add something equivalent to:

```cpp
std::array<float, 31> reverb_last_params{};
bool reverb_last_params_valid = false;
```

After filling the param array:

```cpp
constexpr size_t kReverbParamBytes = sizeof(float) * 31;

if (!reverb_last_params_valid ||
    std::memcmp(params, reverb_last_params.data(), kReverbParamBytes) != 0) {
  reverb_module->commitParams();
  std::memcpy(reverb_last_params.data(), params, kReverbParamBytes);
  reverb_last_params_valid = true;
}
```

Use exact comparison, not epsilon, so the cache never suppresses intentional tiny automation changes.

Reset `reverb_last_params_valid = false` when the reverb module is recreated, reset, or sample rate changes.

---

## 4. Extend `KesshoReverbModule`

### `cpp/KesshoCore/src/modules/KesshoReverbModule.cpp`

Current constants show:

```cpp
constexpr int kParamCount = 30;
constexpr int kParamErLpFreq = 29;
```

Change to:

```cpp
constexpr int kParamCount = 31;
constexpr int kParamErLpFreq = 29;
constexpr int kParamBloom = 30;
```

Add commit call:

```cpp
reverb_instance_set_bloom(instance_, params_[kParamBloom]);
```

Add default value at the end of `params_`:

```cpp
2500.0f, // early-reflection low-pass
0.0f    // bloom: -1 reverse swell, 0 suspended, +1 forward bloom
```

While here, consider adding a native planar API path later. The current wrapper packs planar L/R into interleaved input, processes, then unpacks output. That can be optimized separately without changing sound.

---

## 5. Extend C/WASM reverb API

### `wasm/reverb/kessho_reverb.h`

Add global and instance-owned setters:

```c
/** Bloom: tail direction macro. -1=reverse/inward swell, 0=suspended, +1=forward bloom */
void reverb_set_bloom(float amount);

void reverb_instance_set_bloom(KesshoReverbInstance* instance, float amount);
```

### `wasm/reverb/kessho_reverb.cpp`

Add to `ReverbState`:

```cpp
float bloom; // -1..+1 tail direction macro
```

Initialize default in `reverb_init()`:

```cpp
g_reverb.bloom = 0.0f;
```

Add setter:

```cpp
void reverb_set_bloom(float amount) {
  g_reverb.bloom = fmaxf(-1.0f, fminf(1.0f, amount));
}
```

Add instance wrapper:

```cpp
void reverb_instance_set_bloom(KesshoReverbInstance* instance, float amount) {
  if (instance == nullptr) {
    return;
  }
  ScopedReverbState scoped(instance->state);
  reverb_set_bloom(amount);
}
```

---

# DSP changes

## 6. Bloom macro inside FDN processing

At the top of `reverb_process_block()` after loading existing block parameters, compute:

```cpp
const float bloom = fmaxf(-1.0f, fminf(1.0f, g_reverb.bloom));
const float inward = fmaxf(0.0f, -bloom);
const float outward = fmaxf(0.0f, bloom);
const bool bloomActive = fabsf(bloom) > 0.0001f;
```

### Early reflection reduction

Use Bloom to make cosmic / reverse sounds less room-like and to free CPU for reverse behavior:

```cpp
float erAmount = g_reverb.earlyReflections;
erAmount *= (1.0f - inward * 0.98f);   // inverse bloom nearly kills ER
erAmount *= (1.0f - outward * 0.35f);  // forward cosmic bloom also reduces room cues

if (erAmount < 0.0001f) {
  erAmount = 0.0f;
}
```

All ER work must be gated on the effective `erAmount`, not the raw parameter. If `erAmount == 0`, skip ER tap reads and ER low-pass state updates.

### Reverse amount derived from Bloom

Bloom should work even if `reverbReverse` is low, but should respect the existing Reverse control.

```cpp
float reverseAmount = g_reverb.reverseAmount;
reverseAmount = fmaxf(reverseAmount, inward * 0.38f);
reverseAmount = fminf(1.0f, reverseAmount + inward * (1.0f - reverseAmount) * 0.22f);
reverseAmount *= (1.0f - outward * 0.85f);

if (reverseAmount < 0.0001f) {
  reverseAmount = 0.0f;
}
```

### Inverse tail morph

Where the reverse buffer is mixed back into the wet tail, change the behavior from a purely additive reverse layer to a morph that softens the immediate forward tail when Bloom is negative.

Concept:

```cpp
const float reverseMorph = inward * reverseAmount;
const float forwardKeep = 1.0f - reverseMorph * 0.45f;

rawL = rawL * forwardKeep + reverseL * reverseEnv * reverseAmount;
rawR = rawR * forwardKeep + reverseR * reverseEnv * reverseAmount;
```

Keep gain staging conservative. Do not let inverse tails clip or pump. Use existing DC blocking and soft limiting after this path.

### Positive Bloom

For `outward > 0`, do not activate reverse. Use only CPU-free/control-rate changes:

```cpp
lateBlend += outward * 0.035f;
// Optionally soften ER as above.
// Optionally reduce transient edge by slightly biasing diffusion/tone, but do not enable transientSmooth automatically.
```

Do **not** use `transientSmooth` automatically for forward flow; that branch has real per-sample work.

---

## 7. Reverse path optimization

If Bloom negative activates reverse more often, optimize reverse first.

Replace per-sample modulo and sine-envelope work with cheaper state:

- integer read/write heads with branch wrapping,
- no `%` in the inner loop,
- no `fast_sinf()` envelope per sample,
- either a small envelope table or a cheap parabolic/Hann-like window.

Cheap envelope option:

```cpp
// p is 0..1
float env = 4.0f * p * (1.0f - p);
```

This is smoother enough for ambient reverse tails and cheaper than sine wrapping.

### Optional two-head reverse

Target: smoother Blackhole-like continuous reverse horizon.

Add two reverse read heads 180 degrees apart only when CPU budget remains stable:

```cpp
if (reverseAmount > 0.0001f && inward > 0.15f) {
  // read head A and B with complementary windows
  // rev = revA * envA + revB * envB
}
```

CPU budget rule:

```text
Two-head reverse is allowed only if effective ER is zero or near-zero and benchmark CPU does not increase.
```

If the two-head path causes any CPU regression, keep one optimized reverse head and leave two-head behind a compile-time or runtime flag.

---

## 8. Static warp delay spreading

The existing `reverbWarp` should become more Supermassive-like without adding per-sample work. Apply a static delay spread in `updatePreset()` when setting `fdnDelayTimes`.

Also fix the FDN milliseconds scaling. `FDN_TIMES_MS` are named and documented as milliseconds, so use:

```cpp
float baseSamples = FDN_TIMES_MS[i] * sr * 0.001f * userSize;
```

not:

```cpp
FDN_TIMES_MS[i] * scale * sr / 1000.0f * userSize
```

The latter double-scales with sample rate if the constants are truly milliseconds.

Recommended static spread:

```cpp
const float warp = fmaxf(0.0f, fminf(1.0f, g_reverb.warp));
const float inward = fmaxf(0.0f, -g_reverb.bloom);
const float staticWarp = fminf(1.0f, warp + inward * 0.30f);

for (int i = 0; i < maxChannels; ++i) {
  const float h = kLineHash[i];              // precomputed 0..1
  const float centered = h * 2.0f - 1.0f;    // -1..1
  const float spread = 1.0f + centered * 0.32f * staticWarp;
  g_reverb.fdnDelayTimes[i] = baseSamples * spread;
}
```

Precompute `kLineHash` constants once. Do not call `fmodf()` in inner loops.

Keep Dattorro plate size behavior separate; its tank topology intentionally caps size differently.

---

## 9. Late-tail density / smear

Current FDN processing computes `lateBlend` and caps it around `0.42`. For Bloom and cosmic presets, raise the cap without adding new stages.

Concept:

```cpp
float spaceAmt = fminf(1.0f, fmaxf(g_reverb.warp, fabsf(g_reverb.bloom)) + g_reverb.diffusion * 0.25f);
float lateBlendCap = 0.42f + inward * 0.18f + outward * 0.06f;
lateBlendCap = fminf(0.62f, lateBlendCap);

lateBlend += inward * 0.075f + outward * 0.030f;
if (lateBlend > lateBlendCap) lateBlend = lateBlendCap;
```

This should cost nothing if the late diffuser is already in the path.

---

## 10. Multitap density retune

The current FDN multi-tap gains are:

```cpp
{ 0.60f, 0.25f, 0.15f }
```

For Bloom / cosmic mode, use the same number of reads but distribute energy more evenly:

```cpp
const float mt0 = spaceMode ? 0.50f : 0.60f;
const float mt1 = spaceMode ? 0.31f : 0.25f;
const float mt2 = spaceMode ? 0.19f : 0.15f;
```

`spaceMode` can be block-level:

```cpp
const bool spaceMode = fabsf(g_reverb.bloom) > 0.001f || g_reverb.warp > 0.25f || g_reverb.size > 4.0f;
```

Do not branch inside every tap read if avoidable; compute gains once per block.

---

## 11. In-loop allpass smear

Raise in-loop allpass feedback slightly in cosmic/Bloom modes, at control rate only.

Current base is around `0.40`. Target:

```cpp
float apFb = 0.40f + inward * 0.07f + outward * 0.03f + g_reverb.diffusion * 0.02f;
apFb = fmaxf(0.35f, fminf(0.56f, apFb));
```

Set `fdnInLoopAP[j].fb` outside the sample loop, ideally in `updatePreset()` or once per block. Avoid values above `0.56`; higher values can ring or become metallic.

---

## 12. Darker horizon, no added filters

For negative Bloom, bias existing damping/air absorption slightly darker using already-existing coefficients:

```cpp
blockDampHigh = fminf(1.0f, blockDampHigh + inward * 0.06f);
blockDampLow  = fminf(1.0f, blockDampLow  + inward * 0.015f);
```

Avoid enabling `tube` saturation automatically. Tube mode uses `powf`; prefer `clean` or `tape` for CPU-neutral warmth.

---

# CPU optimizations to include in the same pass

## A. Remove redundant zero-fill in `renderReverb()`

`renderReverb()` currently clears `module_l/module_r`, runs the preconditioner and optional pre-freeze, then clears `module_l/module_r` again before `processPlanarStereo()`.

Move the first clear inside the pre-freeze branch so the common non-pre-freeze path only clears once.

Concept:

```cpp
processReverbPreconditioner(start, frames, reverb_input_peak);

if (spectral_freeze_active && fx.spectral_freeze_routing == 0u) {
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  // existing pre-freeze path
}

std::fill(module_l, module_l + frames, 0.0f);
std::fill(module_r, module_r + frames, 0.0f);
reverb_module->processPlanarStereo(...);
```

## B. Precompute hash constants

Replace runtime `goldenHash()` / `fmodf()` use with static arrays:

```cpp
static constexpr float kLineHash[16] = { ... };
static constexpr float kLineDepthScale[16] = { ... };
static constexpr float kTapPhaseOffset[16] = { ... };
```

Use these for chorus-rate variation, static warp, output tap offsets, and allpass modulation offsets.

## C. Replace per-sample slow sine with oscillators or block-rate updates

`fast_sinf()` is cheaper than `sinf()` but still uses range reduction/flooring. Slow modulation, output tap motion, and predelay modulation do not need per-sample trig.

Preferred order:

1. Keep existing sound at `reverbBloom=0` where feasible.
2. Convert very slow tap modulation to block-rate or linear-interpolated block values.
3. Use recursive oscillator state for chorus if it still appears in profiles.
4. Avoid per-sample `floorf()` for low-frequency LFOs.

## D. Preconditioner constants and bypass

Cache these when sample rate or FX params change:

```text
attack_coeff
release_coeff
ratio
knee
lower_gain
native_auto_makeup
input_makeup
```

Add a safe bypass only when output would be identical:

```cpp
ratio == 1.0f
input_makeup == 1.0f
reverb_pre_comp_gain == 1.0f
input_peak <= 1.047f
```

Then skip the per-sample `log10` / `pow` path.

## E. Native planar API path

Optional but valuable: add a C API function that processes planar stereo directly:

```c
void reverb_instance_process_planar(
  KesshoReverbInstance* instance,
  const float* in_l,
  const float* in_r,
  float* out_l,
  float* out_r,
  int frames);
```

Then `KesshoReverbModule::processPlanarStereo()` can avoid packing/unpacking interleaved buffers. This should be bit-equivalent if the processing order is preserved.

---

# Preset retuning guidance

The following are starting points. Final values should be auditioned and measured.

## Blackhole

```text
reverbType:              darkHall or cathedral
reverbDecay:             0.985 - 0.995
reverbSize:              8.0 - 10.0
reverbDiffusion:         1.0
reverbBloom:             -0.72
reverbReverse:           0.20 - 0.35
reverbReverseLength:     7.0 - 12.0
reverbWarp:              0.65 - 0.85
reverbCrossFeed:         0.45 - 0.65
reverbEarlyReflections:  0.0
reverbAirAbsorption:     0.50 - 0.70
reverbDampHigh:          0.35 - 0.60
reverbShimmer:           0.0 - 0.08, not higher unless CPU is clearly below budget
reverbSaturationMode:    tape or clean, avoid tube for CPU
```

## Event Horizon

```text
reverbBloom:             -0.90
reverbReverse:           0.30 - 0.45
reverbReverseLength:     10.0 - 16.0
reverbEarlyReflections:  0.0
reverbWarp:              0.75 - 0.90
reverbCrossFeed:         0.55 - 0.70
reverbShimmer:           0.0 - 0.05
```

## Supermassive

```text
reverbBloom:             -0.20
reverbReverse:           0.00 - 0.10
reverbReverseLength:     6.0 - 10.0 if reverse is nonzero
reverbEarlyReflections:  0.0 - 0.03
reverbWarp:              0.65 - 0.85
reverbCrossFeed:         0.35 - 0.55
reverbShimmer:           0.0 - 0.05 for CPU-neutral behavior
```

## Reverse Wash

```text
reverbBloom:             -0.65
reverbReverse:           0.55 - 0.75
reverbReverseLength:     4.0 - 8.0
reverbEarlyReflections:  0.0
reverbWarp:              0.25 - 0.45
```

## Glacial Pull

Keep the preset key `gravityWell` for compatibility if needed, but change visible label.

```text
label:                   Glacial Pull
reverbBloom:             -0.80
reverbWarp:              0.80 - 0.90
reverbEarlyReflections:  0.0
reverbShimmer:           reduce from current value if CPU matters
```

---

# Verification and acceptance gates

Run at minimum:

```bash
npm run type-check
npm run core:product:generate
npm run core:product:schema
npm run core:product:wasm
npm run core:product:reverb-tail-quality
npm run core:product:cpu
npm run core:product:web-cpu-comparison
npm run core:product:ci
```

If generated files change, commit both schema and generated outputs.

## Audio quality gates

1. `reverbBloom = 0` with default preset should not audibly regress.
2. With default/neutral params, output should be bit-identical or extremely close unless a deliberate optimization changes interpolation/LFO behavior.
3. Negative Bloom should sound smoother, not grainier.
4. Reverse swell must not thump, pump, click, or collapse stereo width.
5. Blackhole/Event Horizon presets should have fewer room-wall cues and a more continuous late wash.
6. No NaN/Inf output. No runaway feedback at max decay/size/negative Bloom.
7. Tail loudness must be level-matched before subjective comparison.

## CPU gates

1. No missed quantums.
2. Product internal avg must not increase versus current baseline for matched RMS/LUFS.
3. Browser aggregate CPU alone is not sufficient to prove a DSP regression.
4. Compare with graph taps/visual overlays disabled, then again with them enabled.
5. Run at least 10 captures and compare median and p95.
6. Capture scoped timings for:

```text
processReverbPreconditioner()
reverb_module->processPlanarStereo()
processSpectralFreezeBranch()
graph tap copies
mixFxBuffer() / return mix
```

## Scenario parity gate

Before treating a CPU delta as real, match:

```text
same seed/snapshot
same FX params including reverbBloom
same RMS or LUFS within ±0.25 dB
same visualizer / graph tap state
same viewport/GPU state for browser aggregate tests
```

---

# Risks and mitigations

## Risk: parameter index mismatch

Mitigation: append Bloom at index 30. Do not insert in the middle of the 0..29 block.

## Risk: generated Product Core schema mismatch

Mitigation: update schema first, run generator, then update manual ProductFxModules/ReverbModule glue.

## Risk: CPU increase from reverse

Mitigation: make negative Bloom reduce effective ER to near zero, optimize reverse index/envelope, and only enable two-head reverse after measurements.

## Risk: too-dark tail

Mitigation: keep negative Bloom damping biases small and rely on preset tuning. Do not over-damp highs globally.

## Risk: metallic allpass ringing

Mitigation: cap in-loop AP feedback at `0.56` and audition max decay/size cases.

## Risk: UI wording feels too technical

Mitigation: show “Bloom,” not “Gravity,” and use plain sub-labels: `reverse swell`, `suspended`, `forward bloom`.

---

# Source context reviewed

These repo locations were used to shape this handoff:

```text
README.md
  Product Core architecture and verification command family.

src/ui/state.ts
  Existing Reverb state fields include reverbReverse, reverbReverseLength, reverbWarp,
  early reflections, damping, shimmer, quality, spectral freeze, and pre-comp params.

src/ui/reverb/ReverbPage.tsx
  Existing Reverb page, Shimmer & Effects card, reverse controls, and character presets
  including blackhole, reverseWash, cosmicDrift, supermassive, gravityWell, eventHorizon.

cpp/KesshoCore/src/product/fx/ProductFxModules.cpp
  Current 30-float reverb param block and Product Core -> module commit path.

cpp/KesshoCore/src/modules/KesshoReverbModule.cpp
  Current kParamCount=30, param indexes, interleaved process path, planar packing/unpacking,
  and commit calls into the C reverb instance API.

cpp/KesshoCore/src/product/fx/ProductReverb.cpp
  Reverb render path, preconditioner, spectral freeze routing, redundant module buffer clear,
  and harmony boost commit behavior.

wasm/reverb/kessho_reverb.h
  C API and instance-owned API.

wasm/reverb/kessho_reverb.cpp
  16-channel FDN, delay times, diffusion, slow modulation, reverse buffer, early reflections,
  lateBlend cap, fast_sinf, goldenHash, Dattorro fallback path, setters.

package.json
  Generation, schema, wasm, CPU, reverb-tail-quality, and Product Core CI scripts.
```

---

# Recommended commit structure

1. `schema: add reverb bloom parameter`
2. `ui: expose Bloom on Reverb page and presets`
3. `core: wire Bloom through Product reverb module`
4. `dsp: add CPU-neutral Bloom tail morph`
5. `perf: reduce reverb commit/copy/LFO/reverse overhead`
6. `presets: retune blackhole/supermassive/event horizon`
7. `tests: add Bloom reverb quality and CPU coverage`
