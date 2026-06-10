# Kessho Granular Engine Quality + CPU Optimization Plan

## Scope

This plan is for a coding agent with low reasoning. Follow the phases in order and compile after each phase.

The legacy granular engine is being dropped. The only remaining voice modes should be:

```cpp
KESSHO_MODE_CLEAN    // looper / loop heads
KESSHO_MODE_GRANULAR // grain cloud engine
```

Do not remove the Clean looper concept. Do not remove the Granular grain engine. Remove the Legacy UI, preset, macro, DSP branch, and legacy parameter mappings in a staged way so the app can compile after every batch.

This pass has four goals:

1. Reduce CPU where the current implementation spends work unnecessarily.
2. Add moderate-CPU audio-quality features that clearly improve the Clean and Granular engines.
3. Fix macro math so parameters do not get pinned high/low across combinations.
4. Improve the Granular page and visualizer so users can understand spray, lookback, timing spread, pitch clouds, bloom/ghost grains, and active grain load.

Inspirational targets:

- ZOIA Loop Forest: multi-head clean looper drift.
- Microcosm Mosaic: layered pitched micro-loop / granular cloud behavior.
- Celestine: realtime rolling-buffer granular pedal, spray, density, pitch spread, reverse chance, stereo spread, smooth output, Mosaic/Bloom/Tide/Stars/Orbit style behaviors.
- Arturia Fragments: macros, buffer/playhead visualizer, grain capture/release distinction, grain quantize, transient/grid options, visible max-grains/CPU behavior.

---

## Code facts from current repo

Current important files:

```text
wasm/granular-fx/kessho_granular.cpp
wasm/granular-fx/kessho_granular.h
cpp/KesshoCore/src/product/fx/ProductFxModules.cpp
cpp/KesshoCore/src/product/fx/ProductGranular.cpp
cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp
src/audio/granularMacroCore.ts
src/audio/granularMacroModel.ts
src/ui/granular/GranularPage.tsx
src/ui/granular/GranularBufferCanvas.tsx
src/ui/granular/granularPresets.ts
src/ui/granular/granularSourcePresets.ts
src/ui/state.ts
```

Current constants in `kessho_granular.h`:

```cpp
#define KESSHO_NUM_VOICES 4
#define KESSHO_NUM_SLICES 16
#define KESSHO_MAX_GRAINS 64          // per voice
#define KESSHO_MAX_TOTAL_GRAINS 64    // global cap
#define KESSHO_SINC_TAPS 8
#define KESSHO_SINC_OVERSAMPLING 256
#define KESSHO_MODE_CLEAN 0
#define KESSHO_MODE_GRANULAR 1
#define KESSHO_MODE_LEGACY 2
```

Current per-voice worklet params are mapped in `ProductFxModules.cpp` like this:

```cpp
base + 0  enabled
base + 1  mode
base + 2  slice
base + 3  speed
base + 4  scan_rate
base + 5  reverse
base + 6  pitch
base + 7  write_follow
base + 8  density
base + 9  grain_size_ms
base + 10 spray
base + 11 grain_octave_probability
base + 12 attack_seconds
base + 13 decay_seconds
base + 14 gain
base + 15 pan
base + 16 blur
base + 17 stereo_spread
base + 18 position_lfo_rate
base + 19 position_lfo_depth
base + 20 pan_lfo_rate
base + 21 reverse_lfo_rate
base + 22 record_lfo_rate
base + 23 euclid_gated
base + 24 euclid_muted
```

The current global granular params are mapped as:

```cpp
params[0] = granular_enabled
params[1] = granular_freeze
params[2] = granular_freeze_with_feedback
params[3] = dry_wet, currently hard-set to 1.0
params[4] = feedback
params[5] = feedback_lpf_hz
params[6] = buffer_seconds
params[7] = grain_shape
params[8] = bus_diffusion
params[9] = timing_randomness
```

Current known issues:

1. Legacy is still a first-class mode in the header, UI, presets, ProductCore mapping, and grain-spawn branch.
2. `compute_next_grain_interval()` always adds timing randomization even when timing randomness is zero:

```cpp
float jitter = clampf(s->timing_randomness, 0.0f, 1.0f);
float spread = 0.08f + jitter * 0.92f;
float rand = (next_random(s) - 0.5f) * 2.0f;
float interval_scale = 1.0f + rand * spread;
if (interval_scale < 0.12f) interval_scale = 0.12f;
```

This means `timing_randomness = 0` still produces ±8% scheduling spread. At maximum it allows extremely short 0.12× intervals, causing clumping and unstable density.

3. Granular position LFO is unipolar:

```cpp
float pos_lfo_val = lfo_tick(&s->pos_lfo[voice_idx], sr);
float lfo_offset = pos_lfo_val * lfo_depth * (float)s->buffer_size;
```

This only pushes grain positions forward through the buffer instead of moving around the base position. This can bias read position and macro math.

4. Position spray and lookback are coupled. Current code uses `vp->spray` for the read-position spread and also attenuates write-follow when spray rises:

```cpp
float local_window = fmaxf((float)grain_samples * 4.0f, (float)slice_len * 0.75f);
float history_window = buffer_size_f * 0.92f;
float spray_range = local_window * spray + (history_window - local_window) * spray3;
float spray_offset = spray_range * (next_random(s) - 0.5f);

int min_lookback = (int)fmaxf((float)grain_samples * 2.0f, sr * 0.08f);
int wh_pos = wrap_index_any(s->write_pos - min_lookback, s->buffer_size);
float spread_aware_write_follow = write_follow * (1.0f - spray2 * 0.72f);
base_pos = circular_blend_position((float)slice_start, (float)wh_pos, spread_aware_write_follow, buffer_size_f);
```

This is likely related to past “lookback stuck low” behavior. Lookback must become explicit and separate from position spray.

5. Read-head protection is hardwired:

```cpp
const float min_read_age = fmaxf((float)grain_samples * 1.5f, sr * 0.045f);
```

This is safe but can force positions away from the requested lookback/playhead behavior. Make it user-visible as an advanced Write Guard or at least split it from Lookback.

6. Grain pitch variation is too limited. Standard granular only has base pitch plus occasional +12 semitones:

```cpp
float pitch_semi = quantize_pitch(s, vp->pitch);
if (vp->grain_oct > 0.0f && next_random(s) < vp->grain_oct * 0.6f) {
  pitch_semi += 12.0f;
}
grain->playback_rate = powf(2.0f, pitch_semi / 12.0f) * speed * direction;
```

Add cloud-grain pitch modes: octaves, fifths, chord, scale, free spread, and micro-jitter.

7. ProductCore smoothing currently computes `std::exp()` inside `smoothedGranularControl(...)`, which is called from per-frame send/return smoothing. Cache the coefficient instead.

---

# Phase 0 — Baseline and inventory

## 0.1 Create branch

```bash
git checkout -b granular-quality-cpu-pass
```

## 0.2 Baseline build

Run the normal project build/test command before editing.

If there is no documented build command, inspect:

```bash
ls
find . -maxdepth 3 -iname '*cmake*' -o -name 'package.json' -o -name 'Makefile'
```

Record current build status.

## 0.3 Grep important symbols

```bash
grep -R "KESSHO_MODE_LEGACY\|granular_legacy\|Legacy Cloud\|legacy_cloud" -n \
  wasm cpp src | tee /tmp/granular_legacy_refs.txt

grep -R "granular_timing_randomness\|timingRandomness\|compute_next_grain_interval" -n \
  wasm cpp src | tee /tmp/granular_timing_refs.txt

grep -R "granularMacro" -n src/audio src/ui | tee /tmp/granular_macro_refs.txt

grep -R "GranularBufferCanvas\|getVoicePositions\|getActiveGrainCount\|getBufferWaveform" -n \
  src cpp wasm | tee /tmp/granular_visual_refs.txt
```

Do not proceed until the agent knows all files that mention legacy and granular macros.

---

# Phase 1 — Drop Legacy mode safely

Goal: users should only see Clean and Granular. The code should stop choosing the legacy branch. Keep compatibility stubs until the final cleanup phase.

## 1.1 UI: remove Legacy from visible mode choices

File:

```text
src/ui/granular/GranularPage.tsx
```

Change:

```ts
type VoiceMode = 'clean' | 'granular' | 'legacy';
```

to:

```ts
type VoiceMode = 'clean' | 'granular';
```

Remove any UI option, chip, badge, dropdown item, or branch that allows selecting `legacy`.

For migration, sanitize state before rendering:

```ts
const sanitizeVoiceMode = (mode: unknown): VoiceMode => (
  mode === 'clean' ? 'clean' : 'granular'
);
```

Use `sanitizeVoiceMode(state[keys.mode])` wherever a voice mode is read.

## 1.2 UI visualizer: remove legacy branch

File:

```text
src/ui/granular/GranularBufferCanvas.tsx
```

Change Canvas voice type:

```ts
mode: 'clean' | 'granular' | 'legacy';
```

to:

```ts
mode: 'clean' | 'granular';
```

Remove the legacy rendering branch that treats grains as trailing behind write head. Use the granular branch for migrated legacy presets.

## 1.3 Presets: remove Legacy Cloud

File:

```text
src/ui/granular/granularPresets.ts
```

Remove or rename:

```ts
legacy_cloud
Legacy Cloud (Legacy)
```

If existing user presets may contain `legacy`, add migration during preset apply:

```ts
if (key.endsWith('Mode') && value === 'legacy') value = 'granular';
```

Keep `classic_cloud` as the replacement.

## 1.4 ProductCore mapping: clamp modes to Clean/Granular

File:

```text
cpp/KesshoCore/src/product/fx/ProductFxModules.cpp
```

Current mapping:

```cpp
params[base + 1] = static_cast<float>(clampU32(voice.mode, 0u, 2u));
```

Replace with:

```cpp
const uint32_t sanitized_mode = voice.mode == 0u ? 0u : 1u;
params[base + 1] = static_cast<float>(sanitized_mode);
```

Keep legacy param writes for now if removing them would break param count. They will become unused.

## 1.5 DSP: make legacy branch unreachable

File:

```text
wasm/granular-fx/kessho_granular.cpp
```

In `spawn_grain(...)`, replace:

```cpp
const int max_total_grains = (vp->mode == KESSHO_MODE_LEGACY)
  ? clampi(s->legacy.max_grains, 0, KESSHO_MAX_TOTAL_GRAINS)
  : KESSHO_MAX_TOTAL_GRAINS;
```

with:

```cpp
const int max_total_grains = clampi(s->max_total_grains_user, 1, KESSHO_MAX_TOTAL_GRAINS);
```

If `max_total_grains_user` does not exist yet, temporarily use:

```cpp
const int max_total_grains = KESSHO_MAX_TOTAL_GRAINS;
```

Then replace:

```cpp
if (vp->mode == KESSHO_MODE_LEGACY) {
  ... legacy branch ...
} else {
  ... standard granular branch ...
}
```

with:

```cpp
if (vp->mode == KESSHO_MODE_CLEAN) {
  return;
}

// Standard granular branch only.
```

Do not delete legacy structs/functions in this phase. Just make the branch unreachable.

## 1.6 Compile

Build now. Fix compile errors before continuing.

Acceptance:

```text
- UI no longer exposes Legacy.
- Existing presets with legacy mode load as Granular.
- No code path spawns legacy grains.
- Clean still loops.
- Granular still spawns grains.
```

---

# Phase 2 — Add exposed user controls and param extension block

Goal: any behavior that changes sound and is preset/user-definable must be exposed in state/UI/presets and mapped to DSP.

Use an extension block after the existing granular params. Do not insert into the existing 25-param voice block until all offsets are updated.

## 2.1 Add state fields

File:

```text
src/ui/state.ts
```

Add global fields to `SliderState` and defaults:

```ts
granularQuality: 'eco' | 'balanced' | 'hq';
granularMaxGrains: number;          // 8..64, default 48 or 64
granularSprayMacro: number;         // 0..1
granularCloudMacro: number;         // 0..1
granularPitchMacro: number;         // 0..1
granularVisualDetail: 'basic' | 'full';
```

Add per-voice fields for voices 1–4:

```ts
granularVnPositionSpray: number;    // 0..1. Migration source: old granularVnSpray
granularVnTimingSpray: number;      // 0..1
granularVnLookback: number;         // 0..1 maps 60ms..8s
granularVnWriteGuard: number;       // 0..1 maps 15ms..120ms
granularVnPitchMode: 'fixed' | 'octaves' | 'fifths' | 'chord' | 'scale' | 'free';
granularVnPitchSpread: number;      // 0..24 semitones
granularVnPitchJitter: number;      // 0..50 cents
granularVnPitchQuantize: number;    // 0..1
granularVnReverseChance: number;    // 0..1
granularVnBloom: number;            // 0..1 ghost grain amount
granularVnGlide: number;            // 0..1 pitch glide amount
granularVnCloudStyle: 'classic' | 'mosaic' | 'bloom' | 'tide' | 'orbit' | 'stars';
granularVnAnchorPattern: 'forward' | 'reverse' | 'pendulum' | 'random';
granularVnLoopCrossfade: number;    // Clean mode only: 4..80 ms
```

Replace old `granularVnSpray` usage with `granularVnPositionSpray`. Keep migration alias:

```ts
if (snapshot.granularV1PositionSpray == null) {
  snapshot.granularV1PositionSpray = Number(snapshot.granularV1Spray ?? 0);
}
```

Do this for all voices.

## 2.2 Add parameter metadata

Wherever slider metadata is defined in `state.ts`, add param info:

```ts
granularMaxGrains:       { min: 8, max: 64, step: 1 }
granularSprayMacro:      { min: 0, max: 1, step: 0.01 }
granularCloudMacro:      { min: 0, max: 1, step: 0.01 }
granularPitchMacro:      { min: 0, max: 1, step: 0.01 }
granularVnPositionSpray: { min: 0, max: 1, step: 0.01 }
granularVnTimingSpray:   { min: 0, max: 1, step: 0.01 }
granularVnLookback:      { min: 0, max: 1, step: 0.01 }
granularVnWriteGuard:    { min: 0, max: 1, step: 0.01 }
granularVnPitchSpread:   { min: 0, max: 24, step: 1 }
granularVnPitchJitter:   { min: 0, max: 50, step: 1 }
granularVnPitchQuantize: { min: 0, max: 1, step: 0.01 }
granularVnReverseChance: { min: 0, max: 1, step: 0.01 }
granularVnBloom:         { min: 0, max: 1, step: 0.01 }
granularVnGlide:         { min: 0, max: 1, step: 0.01 }
granularVnLoopCrossfade: { min: 4, max: 80, step: 1 }
```

## 2.3 Add product state fields

Find C++ `FxState` / granular state struct. Grep:

```bash
grep -R "granular_timing_randomness\|granular_voices\|GranularVoiceState" -n cpp
```

Add matching fields globally and in `GranularVoiceState`.

Use these defaults:

```cpp
granular_quality = 1;       // 0 eco, 1 balanced, 2 hq
granular_max_grains = 48;   // default lower than hard 64 for CPU safety
```

Per voice defaults:

```cpp
position_spray = old spray default or 0.25f;
timing_spray = 0.0f;
lookback = 0.35f;
write_guard = 0.30f;
pitch_mode = 0;             // fixed
pitch_spread = 0.0f;
pitch_jitter_cents = 4.0f;
pitch_quantize = 1.0f;
reverse_chance = 0.0f;
bloom = 0.0f;
glide = 0.0f;
cloud_style = 0;            // classic
anchor_pattern = 0;         // forward
loop_crossfade_ms = 12.0f;
```

## 2.4 Add extension params in ProductGranular constants

Find granular param constants. Grep:

```bash
grep -R "kGranularGlobalParamCount\|kGranularVoiceParamCount\|kGranularLegacyParamStart\|kGranularParamCount" -n cpp wasm src
```

Do not reuse legacy param slots yet. Define:

```cpp
constexpr uint32_t kGranularExtGlobalParamStart = kGranularLegacyParamStart + kGranularLegacyParamCount;
constexpr uint32_t kGranularExtGlobalParamCount = 5;

constexpr uint32_t kGranularExtVoiceParamCount = 14;
constexpr uint32_t kGranularExtVoiceParamStart = kGranularExtGlobalParamStart + kGranularExtGlobalParamCount;

constexpr uint32_t kGranularParamCount =
  kGranularExtVoiceParamStart + kGranularVoiceCount * kGranularExtVoiceParamCount;
```

If these constants are macros rather than `constexpr`, follow the existing style.

Global extension param layout:

```cpp
ext global + 0 = granular_quality             // 0 eco, 1 balanced, 2 hq
ext global + 1 = granular_max_grains          // 8..64
ext global + 2 = granular_spray_macro         // 0..1
ext global + 3 = granular_cloud_macro         // 0..1
ext global + 4 = granular_pitch_macro         // 0..1
```

Per-voice extension layout:

```cpp
ext voice + 0  = position_spray
ext voice + 1  = timing_spray
ext voice + 2  = lookback
ext voice + 3  = write_guard
ext voice + 4  = pitch_mode
ext voice + 5  = pitch_spread
ext voice + 6  = pitch_jitter_cents
ext voice + 7  = pitch_quantize
ext voice + 8  = reverse_chance
ext voice + 9  = bloom
ext voice + 10 = glide
ext voice + 11 = cloud_style
ext voice + 12 = anchor_pattern
ext voice + 13 = loop_crossfade_ms
```

## 2.5 Map extension params in `ProductFxModules.cpp`

After existing legacy param writes, write extension globals:

```cpp
const uint32_t ext_global = kGranularExtGlobalParamStart;
params[ext_global + 0] = static_cast<float>(clampU32(fx.granular_quality, 0u, 2u));
params[ext_global + 1] = static_cast<float>(clampU32(fx.granular_max_grains, 8u, 64u));
params[ext_global + 2] = clampFloat(fx.granular_spray_macro, 0.0f, 1.0f);
params[ext_global + 3] = clampFloat(fx.granular_cloud_macro, 0.0f, 1.0f);
params[ext_global + 4] = clampFloat(fx.granular_pitch_macro, 0.0f, 1.0f);
```

For each voice:

```cpp
const uint32_t ext = kGranularExtVoiceParamStart + voice_index * kGranularExtVoiceParamCount;
params[ext + 0]  = clampFloat(voice.position_spray, 0.0f, 1.0f);
params[ext + 1]  = clampFloat(voice.timing_spray, 0.0f, 1.0f);
params[ext + 2]  = clampFloat(voice.lookback, 0.0f, 1.0f);
params[ext + 3]  = clampFloat(voice.write_guard, 0.0f, 1.0f);
params[ext + 4]  = static_cast<float>(clampU32(voice.pitch_mode, 0u, 5u));
params[ext + 5]  = clampFloat(voice.pitch_spread, 0.0f, 24.0f);
params[ext + 6]  = clampFloat(voice.pitch_jitter_cents, 0.0f, 50.0f);
params[ext + 7]  = clampFloat(voice.pitch_quantize, 0.0f, 1.0f);
params[ext + 8]  = clampFloat(voice.reverse_chance, 0.0f, 1.0f);
params[ext + 9]  = clampFloat(voice.bloom, 0.0f, 1.0f);
params[ext + 10] = clampFloat(voice.glide, 0.0f, 1.0f);
params[ext + 11] = static_cast<float>(clampU32(voice.cloud_style, 0u, 5u));
params[ext + 12] = static_cast<float>(clampU32(voice.anchor_pattern, 0u, 3u));
params[ext + 13] = clampFloat(voice.loop_crossfade_ms, 4.0f, 80.0f);
```

## 2.6 Read extension params in WASM

In `VoiceParams`, add fields:

```cpp
float position_spray;
float timing_spray;
float lookback;
float write_guard;
int pitch_mode;
float pitch_spread;
float pitch_jitter_cents;
float pitch_quantize;
float reverse_chance;
float bloom;
float glide;
int cloud_style;
int anchor_pattern;
float loop_crossfade_ms;
```

In `GranularState`, add:

```cpp
int quality;
int max_total_grains_user;
float spray_macro;
float cloud_macro;
float pitch_macro;
```

In param commit/apply code, read the extension params into these fields.

## 2.7 Compile

Acceptance:

```text
- App compiles.
- Old presets load.
- New params exist in UI state and ProductCore.
- New params reach WASM state.
- Audio should still sound unchanged except Legacy is not selectable.
```

---

# Phase 3 — CPU optimizations with minimal sonic change

## 3.1 Cache granular smoothing coefficient

File:

```text
cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp
```

Current `smoothedGranularControl(...)` calculates `std::exp()` each call. Replace with cached coefficient.

Add engine field:

```cpp
float granular_control_smooth_coeff = 0.999f;
double granular_control_smooth_coeff_sample_rate = 0.0;
```

Add helper:

```cpp
void KesshoProductEngine::updateGranularControlSmoothCoeff() {
  if (sample_rate == granular_control_smooth_coeff_sample_rate) return;
  granular_control_smooth_coeff_sample_rate = sample_rate;
  granular_control_smooth_coeff = std::exp(
      -1.0f / std::max(1.0f, 0.05f * static_cast<float>(sample_rate)));
}
```

Change smoothing function to accept coeff:

```cpp
static inline float smoothedGranularControlCached(float current, float target, float coeff) {
  if (!std::isfinite(target)) return 0.0f;
  const float next = target + (current - target) * coeff;
  return std::abs(next - target) < 0.000001f ? target : next;
}
```

Call `updateGranularControlSmoothCoeff()` once per render block, not per frame.

Replace all per-frame calls to `smoothedGranularControl(..., sample_rate)` with `smoothedGranularControlCached(..., granular_control_smooth_coeff)`.

## 3.2 Cache ProductGranular reverb compressor coefficients

File:

```text
cpp/KesshoCore/src/product/fx/ProductGranular.cpp
```

Current render block computes:

```cpp
const float attack_coeff = std::exp(-1.0f / std::max(1.0f, 0.003f * static_cast<float>(sample_rate)));
const float release_coeff = std::exp(-1.0f / std::max(1.0f, 0.25f * static_cast<float>(sample_rate)));
```

Move to cached engine fields updated when sample rate changes:

```cpp
float granular_reverb_comp_attack_coeff;
float granular_reverb_comp_release_coeff;
double granular_reverb_comp_coeff_sample_rate;
```

This is small CPU savings, but safe.

## 3.3 Add adaptive interpolation quality

Current engine has 8-point sinc read. Keep it for HQ. Add cheaper paths for Eco/Balanced.

Add helpers near `read_buffer_sinc(...)`:

```cpp
static inline float read_buffer_linear(const float* buf, int size, float position) {
  float pos = wrap_position(position, (float)size);
  int i0 = (int)pos;
  int i1 = i0 + 1;
  if (i1 >= size) i1 -= size;
  float frac = pos - (float)i0;
  return buf[i0] + (buf[i1] - buf[i0]) * frac;
}

static inline float read_buffer_cubic(const float* buf, int size, float position) {
  float pos = wrap_position(position, (float)size);
  int i1 = (int)pos;
  float t = pos - (float)i1;
  int i0 = i1 - 1; if (i0 < 0) i0 += size;
  int i2 = i1 + 1; if (i2 >= size) i2 -= size;
  int i3 = i1 + 2; if (i3 >= size) i3 -= size;
  const float y0 = buf[i0];
  const float y1 = buf[i1];
  const float y2 = buf[i2];
  const float y3 = buf[i3];
  const float c0 = y1;
  const float c1 = 0.5f * (y2 - y0);
  const float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
  const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

static inline float read_buffer_quality(
    const GranularState* s,
    const float* buf,
    int size,
    float position,
    float abs_rate) {
  if (s->quality <= 0) {
    // Eco: linear near normal speed, cubic for bigger pitch/rate movement.
    return abs_rate < 1.20f ? read_buffer_linear(buf, size, position)
                            : read_buffer_cubic(buf, size, position);
  }
  if (s->quality == 1) {
    // Balanced: cubic for most musical cases, sinc only for strong pitch shift.
    return abs_rate < 1.70f ? read_buffer_cubic(buf, size, position)
                            : read_buffer_sinc(s, buf, size, position);
  }
  // HQ: current behavior.
  return read_buffer_sinc(s, buf, size, position);
}
```

Replace grain and clean read calls with `read_buffer_quality(...)`.

Use `abs_rate = fabsf(grain->playback_rate)` for grains and `fabsf(effective_rate)` for Clean.

## 3.4 Adaptive anti-aliasing by quality

Find anti-alias filter code. Grep:

```bash
grep -n "anti_alias" wasm/granular-fx/kessho_granular.cpp
```

Current behavior appears to maintain multiple anti-alias biquad stages for high playback rates. Keep HQ as current. Add stage selection:

```cpp
static inline int anti_alias_stage_count_for_rate(const GranularState* s, float abs_rate) {
  if (s->quality <= 0) {
    return abs_rate > 1.70f ? 1 : 0;
  }
  if (s->quality == 1) {
    if (abs_rate <= 1.10f) return 0;
    return abs_rate <= 1.85f ? 1 : 2;
  }
  if (abs_rate <= 1.05f) return 0;
  return abs_rate <= 1.60f ? 2 : 3;
}
```

Do not run three cascaded stages in Eco/Balanced unless rate is high.

## 3.5 Faster free grain lookup

Current `spawn_grain(...)` scans from index 0 to 63 every spawn:

```cpp
for (int i = 0; i < KESSHO_MAX_GRAINS; i++) {
  if (!pool[i].active) { grain = &pool[i]; break; }
}
```

Add state:

```cpp
int next_free_hint[KESSHO_NUM_VOICES];
```

Replace scan with:

```cpp
Grain* grain = nullptr;
int grain_index = -1;
const int start = s->next_free_hint[voice_idx] & (KESSHO_MAX_GRAINS - 1);
for (int n = 0; n < KESSHO_MAX_GRAINS; ++n) {
  const int i = (start + n) & (KESSHO_MAX_GRAINS - 1);
  if (!pool[i].active) {
    grain = &pool[i];
    grain_index = i;
    s->next_free_hint[voice_idx] = (i + 1) & (KESSHO_MAX_GRAINS - 1);
    break;
  }
}
if (!grain) return;
```

Then remove later recomputation:

```cpp
int grain_index = (int)(grain - pool);
```

because `grain_index` already exists.

## 3.6 Visualizer CPU gates

File:

```text
src/ui/granular/GranularBufferCanvas.tsx
```

Current visualizer already caps animation at 30 FPS, limits particles to 40, and uses visibility gating. Add `visualDetail` prop:

```ts
visualDetail: 'basic' | 'full';
```

Rules:

```ts
const maxParticles = visualDetail === 'full' ? 80 : 32;
const targetFrameMs = visualDetail === 'full' ? 1000 / 30 : 1000 / 20;
```

Do not render pitch labels or detailed event trails in `basic` mode.

## 3.7 Compile and profile

Acceptance:

```text
- Eco quality uses less CPU than current.
- Balanced is near current quality with lower CPU.
- HQ preserves current sinc quality.
- Inactive granular CPU unchanged or lower.
- Visualizer does not drive audio CPU and stays bounded on mobile.
```

---

# Phase 4 — Fix macro math and expose Spray/Cloud/Pitch macros

Files:

```text
src/audio/granularMacroCore.ts
src/audio/granularMacroModel.ts
src/ui/granular/GranularPage.tsx
cpp/KesshoCore/src/product/fx/ProductFxModules.cpp
wasm/granular-fx/kessho_granular.cpp
```

## 4.1 Rename old concepts in UI

In the UI:

```text
old “Spray” slider -> “Position Spray”
new “Timing Spray” slider -> grain trigger spread
new “Lookback” slider -> where the cloud reads behind the write head
```

Keep old state key migration, but show the new labels.

## 4.2 Replace timing randomness formula in DSP

In `compute_next_grain_interval(...)`, replace current formula:

```cpp
float jitter = clampf(s->timing_randomness, 0.0f, 1.0f);
float spread = 0.08f + jitter * 0.92f;
float rand = (next_random(s) - 0.5f) * 2.0f;
float interval_scale = 1.0f + rand * spread;
if (interval_scale < 0.12f) interval_scale = 0.12f;
```

with:

```cpp
const VoiceParams* vp = &s->voice[voice_idx];
const float global_spray = clampf(s->timing_randomness, 0.0f, 1.0f);
const float voice_spray = clampf(vp->timing_spray, 0.0f, 1.0f);
const float macro_spray = clampf(s->spray_macro, 0.0f, 1.0f);

// Keep all controls useful. No hidden minimum. 0 must mean exact timing.
const float timing_spray = clampf(
    voice_spray * 0.70f + global_spray * 0.45f + macro_spray * 0.35f,
    0.0f,
    1.0f);

float interval_scale = 1.0f;
if (timing_spray > 0.001f) {
  const float rand = (next_random(s) - 0.5f) * 2.0f;
  const float spread = powf(timing_spray, 1.45f) * 0.78f;
  interval_scale = 1.0f + rand * spread;
  interval_scale = clampf(interval_scale, 0.35f, 2.20f);
}
```

Acceptance math:

```text
timing_spray = 0.00 -> interval_scale always 1.00
timing_spray = 0.50 -> spread approx 0.286 -> interval_scale 0.714..1.286
timing_spray = 1.00 -> interval_scale 0.35..1.78 before max clamp; no 0.12 micro-bursts
```

## 4.3 Fix position LFO from unipolar to bipolar

In `spawn_grain(...)`, replace:

```cpp
float pos_lfo_val = lfo_tick(&s->pos_lfo[voice_idx], sr);
float lfo_offset = pos_lfo_val * lfo_depth * (float)s->buffer_size;
```

with:

```cpp
const float pos_lfo_val = (lfo_tick(&s->pos_lfo[voice_idx], sr) - 0.5f) * 2.0f;
const float lfo_offset = pos_lfo_val * lfo_depth * (float)s->buffer_size * 0.50f;
```

Reason:

```text
Old: 0..+1 buffer offset.
New: -0.5..+0.5 buffer offset at full depth.
```

This removes forward-only bias.

## 4.4 Split Position Spray and Lookback in DSP

Replace current spray/lookback block with:

```cpp
const float position_spray = clampf(vp->position_spray, 0.0f, 1.0f);
const float spray2 = position_spray * position_spray;
const float spray_smooth = spray2 * (3.0f - 2.0f * position_spray);

const float local_window = fmaxf((float)grain_samples * 3.0f, (float)slice_len * 0.35f);
const float history_window = buffer_size_f * 0.92f;

// 0 = exactly base/playhead; 1 = wide history window.
float spray_range = position_spray * (local_window + spray_smooth * (history_window - local_window));
if (spray_range > history_window) spray_range = history_window;

const float spray_offset = spray_range * (next_random(s) - 0.5f);

const float lookback_norm = clampf(vp->lookback, 0.0f, 1.0f);
const float min_lookback_s = 0.060f;
const float max_lookback_s = fminf(8.0f, (float)s->buffer_size / sr * 0.92f);
const float lookback_s = expf(logf(min_lookback_s) + lookback_norm * logf(max_lookback_s / min_lookback_s));
const int lookback_samples = clampi((int)(lookback_s * sr), 1, (int)(buffer_size_f * 0.92f));

float base_pos;
if (write_follow > 0.01f) {
  const int wh_pos = wrap_index_any(s->write_pos - lookback_samples, s->buffer_size);
  base_pos = circular_blend_position((float)slice_start, (float)wh_pos, write_follow, buffer_size_f);
} else {
  base_pos = (float)slice_start;
}
```

Do not attenuate write-follow by spray. Remove this line:

```cpp
float spread_aware_write_follow = write_follow * (1.0f - spray2 * 0.72f);
```

## 4.5 Make Write Guard user-definable

Replace:

```cpp
const float min_read_age = fmaxf((float)grain_samples * 1.5f, sr * 0.045f);
```

with:

```cpp
const float guard_norm = clampf(vp->write_guard, 0.0f, 1.0f);
const float guard_ms = 15.0f + guard_norm * 105.0f; // 15..120 ms
const float min_read_age = fmaxf((float)grain_samples * 0.75f, sr * guard_ms * 0.001f);
```

Default `write_guard = 0.30` gives:

```text
15 + 0.30 * 105 = 46.5 ms
```

which preserves the current safe behavior. Users can lower it toward 15ms for tighter live looping.

## 4.6 Rewrite `computeGranularMacroCore.ts`

Current macro model tends to use floors and `Math.max(...)` heavily. Replace with staged curves so macros do not pin values early.

Add helpers:

```ts
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
```

Replace global timing randomness computation:

```ts
const timingRandomness = clamp(
  0.12 + smearMacro * 0.34 + chaosIntent * 0.32 + (spaceMode === 'diffuse' ? 0.08 : 0),
  0,
  0.95,
);
```

with:

```ts
const timingRandomness = clamp(
  (state.granularTimingSpray ?? 0) * 0.62 +
  (state.granularSprayMacro ?? 0) * 0.28 +
  chaosIntent * 0.22 +
  smearMacro * (spaceMode === 'diffuse' ? 0.14 : 0.06),
  0,
  1,
);
```

No hidden minimum.

For activity/density, replace any target-to-64 behavior that occurs too early. Use:

```ts
const activityReach = smoothstep(0.18, 1.0, activityMacro);
const activityEndPush = smoothstep(0.82, 1.0, activityMacro);
const densityTarget = 38 + activityEndPush * 26; // 38..64 only at the top
const densityBlend = 0.20 + activityReach * 0.45 + activityEndPush * 0.25;
voiceDensity[voiceIndex] = clamp(
  lerp(rawDensityValue, densityTarget, densityBlend) + spread * activityMacro * 2.0,
  1,
  64,
);
```

For grain size, use texture primarily and activity secondarily:

```ts
const sizeTarget = 90 + mTexture * 230 + mActivity * 90;
const densityTrim = smoothstep(36, 64, voiceDensity[voiceIndex] ?? rawDensityValue) * 70;
voiceGrainSize[voiceIndex] = clamp(
  lerp(rawGrainSizeValue, sizeTarget - densityTrim, smoothstep(0.10, 1.0, mTexture + mActivity * 0.35)),
  10,
  500,
);
```

For blur/diffusion, avoid pinning to 1 early:

```ts
voiceBlur[voiceIndex] = clamp(
  rawBlurValue + mTexture * 0.32 + smearMacro * 0.24 + activityEndPush * 0.10,
  0,
  0.92,
);
```

Remove all legacy-specific branches:

```ts
voiceMode === 'legacy'
```

Use only:

```ts
voiceMode === 'clean'
voiceMode === 'granular'
```

## 4.7 Compile and test macro math

Create a small unit test if the repo has tests. Otherwise add a dev script or temporary console test that sweeps:

```text
activity: 0, .25, .5, .75, 1
spray:    0, .25, .5, .75, 1
chaos:    0, .25, .5, .75, 1
smear:    0, .25, .5, .75, 1
```

Acceptance:

```text
- Timing spread can be exactly zero.
- Lookback changes are audible/visible across the whole control range.
- Position spray no longer changes write-follow strength.
- Density does not hit 64 until high activity/top-end settings.
- Grain size does not always end up at 300–500ms in diffuse presets.
- Position LFO average offset is centered around 0 over time.
```

---

# Phase 5 — Cloud pitch and Mosaic behavior

This phase adds musical pitch variation inspired by Mosaic/Celestine and Microcosm-like pitch-cloud behavior.

## 5.1 Add pitch interval palettes

In `kessho_granular.cpp`, near pitch helpers, add:

```cpp
enum CloudPitchMode {
  CLOUD_PITCH_FIXED = 0,
  CLOUD_PITCH_OCTAVES = 1,
  CLOUD_PITCH_FIFTHS = 2,
  CLOUD_PITCH_CHORD = 3,
  CLOUD_PITCH_SCALE = 4,
  CLOUD_PITCH_FREE = 5,
};

static constexpr int kOctavePalette[] = { 0, 12, -12, 24 };
static constexpr int kFifthsPalette[] = { 0, 7, 12, -5, 19 };
static constexpr int kMosaicMajor[] = { 0, 4, 7, 12 };
static constexpr int kMosaicMinor[] = { 0, 3, 7, 12 };
static constexpr int kMosaicOpen[] = { 0, 5, 7, 16 };
static constexpr int kMosaicConsonant[] = { 0, 7, 12, 19 };
```

## 5.2 Add pitch helper

```cpp
static float choose_cloud_pitch(GranularState* s, const VoiceParams* vp, float base_pitch) {
  const float pitch_macro = clampf(s->pitch_macro, 0.0f, 1.0f);
  const float spread = clampf(vp->pitch_spread + pitch_macro * 12.0f, 0.0f, 24.0f);
  const float jitter_cents = clampf(vp->pitch_jitter_cents + pitch_macro * 8.0f, 0.0f, 50.0f);
  const float jitter_st = ((next_random(s) - 0.5f) * 2.0f) * (jitter_cents / 100.0f);

  float offset = 0.0f;

  switch (vp->pitch_mode) {
    case CLOUD_PITCH_OCTAVES: {
      const int count = spread >= 18.0f ? 4 : (spread >= 9.0f ? 3 : 2);
      offset = (float)kOctavePalette[(int)(next_random(s) * count) % count];
      break;
    }
    case CLOUD_PITCH_FIFTHS: {
      const int count = spread >= 16.0f ? 5 : (spread >= 8.0f ? 4 : 2);
      offset = (float)kFifthsPalette[(int)(next_random(s) * count) % count];
      break;
    }
    case CLOUD_PITCH_CHORD: {
      if (s->chord_pitch_count > 0) {
        const int idx = (int)(next_random(s) * (float)s->chord_pitch_count) % s->chord_pitch_count;
        offset = (float)s->chord_pitches[idx];
      }
      break;
    }
    case CLOUD_PITCH_SCALE: {
      if (s->scale_interval_count > 0) {
        const int idx = (int)(next_random(s) * (float)s->scale_interval_count) % s->scale_interval_count;
        offset = (float)s->scale_intervals[idx];
        if (next_random(s) < spread / 24.0f) offset += next_random(s) < 0.5f ? 12.0f : -12.0f;
      }
      break;
    }
    case CLOUD_PITCH_FREE: {
      offset = ((next_random(s) - 0.5f) * 2.0f) * spread;
      break;
    }
    case CLOUD_PITCH_FIXED:
    default:
      break;
  }

  const float quantize_amount = clampf(vp->pitch_quantize, 0.0f, 1.0f);
  const float raw = base_pitch + offset + jitter_st;
  const float quantized = quantize_pitch(s, raw);
  return raw + (quantized - raw) * quantize_amount;
}
```

Adjust struct names if actual state fields differ.

## 5.3 Replace current +12-only grain octave behavior

Replace:

```cpp
if (vp->grain_oct > 0.0f && next_random(s) < vp->grain_oct * 0.6f) {
  pitch_semi += 12.0f;
}
```

with:

```cpp
pitch_semi = choose_cloud_pitch(s, vp, pitch_semi);

// Backward compatibility: old Grain Oct knob still adds octave tendency.
if (vp->grain_oct > 0.0f && next_random(s) < vp->grain_oct * 0.45f) {
  pitch_semi += next_random(s) < 0.72f ? 12.0f : -12.0f;
}
```

## 5.4 Cloud Style: Mosaic defaults

In ProductCore/UI, when `cloud_style === 'mosaic'`, map suggested defaults unless the user has explicitly edited advanced pitch controls:

```text
pitch_mode:      chord or fifths
pitch_spread:    12 semitones
pitch_jitter:    4–9 cents
pitch_quantize:  0.85–1.0
bloom:           0.10–0.25
reverse_chance:  0.05–0.12
grain_size:      old value * 1.20, cap 500ms
```

Do not hide these values. Show them as editable controls with ghost values when macro/preset behavior modifies them.

## 5.5 Compile and test

Acceptance:

```text
- Fixed pitch mode behaves like current base pitch.
- Octaves gives octave-up/down clouds.
- Fifths gives musical fifth/octave clusters.
- Chord mode follows the current harmony chord pitches.
- Scale mode follows the current scale intervals.
- Free mode can become atonal only when user chooses it.
- Pitch jitter is subtle at 0–10 cents and audible at 30–50 cents.
```

---

# Phase 6 — Bloom, Tide, Orbit, Stars, and optional Glide

These are all inside the Granular engine. They are not separate engines.

## 6.1 Add visual/event flags and grain fields

In `Grain`, add:

```cpp
float pitch_semi_start;
float pitch_semi_end;
float playback_rate_step;
float tide_phase;
float tide_depth;
int is_ghost;
int cloud_style;
int visual_flags;
```

Initialize all fields in `spawn_grain(...)`.

## 6.2 Bloom ghost grains

Add helper:

```cpp
static void spawn_bloom_ghost_from_grain(GranularState* s, int voice_idx, const Grain* source, const VoiceParams* vp) {
  const float bloom = clampf(vp->bloom + s->cloud_macro * 0.20f, 0.0f, 1.0f);
  if (bloom <= 0.001f) return;
  if (next_random(s) > bloom) return;
  if (s->total_active_grains >= clampi(s->max_total_grains_user, 1, KESSHO_MAX_TOTAL_GRAINS)) return;

  Grain* ghost = find_free_grain_using_hint(s, voice_idx);
  if (!ghost) return;

  *ghost = *source;
  ghost->is_ghost = 1;
  ghost->start_sample = -(int)((float)source->length * 0.25f); // starts 1/4 grain later
  ghost->position = wrap_position(source->position + (float)source->length * 0.25f, (float)s->buffer_size);
  ghost->playback_rate *= powf(2.0f, ((next_random(s) - 0.5f) * 0.18f) / 12.0f); // ±9 cents
  ghost->gain *= 0.36f + bloom * 0.18f;
  ghost->pan = clampf(-source->pan + (next_random(s) - 0.5f) * 0.35f, -1.0f, 1.0f);
  get_pan_lr(s, ghost->pan, &ghost->pan_l, &ghost->pan_r);
  activate_grain(s, voice_idx, ghost);
}
```

Do not recursively bloom ghost grains.

Call it after the source grain is activated:

```cpp
if (!grain->is_ghost && (vp->cloud_style == CLOUD_STYLE_BLOOM || vp->bloom > 0.001f)) {
  spawn_bloom_ghost_from_grain(s, voice_idx, grain, vp);
}
```

## 6.3 Tide amplitude modulation

At spawn:

```cpp
grain->tide_phase = next_random(s);
grain->tide_depth = (vp->cloud_style == CLOUD_STYLE_TIDE)
  ? clampf(0.15f + vp->stereo_spread * 0.45f + s->cloud_macro * 0.20f, 0.0f, 0.80f)
  : 0.0f;
```

In grain processing, multiply envelope by:

```cpp
if (grain->tide_depth > 0.001f) {
  const float phase = (float)grain->start_sample / fmaxf(1.0f, (float)grain->length);
  const float tide = 0.5f + 0.5f * sinf(6.2831853f * (phase + grain->tide_phase));
  env *= 1.0f - grain->tide_depth + tide * grain->tide_depth;
}
```

This costs one `sinf` per active grain sample only in Tide mode. If CPU is too high, replace with a small sine LUT.

## 6.4 Orbit panning

At spawn for Orbit style:

```cpp
if (vp->cloud_style == CLOUD_STYLE_ORBIT) {
  const float orbit = next_random(s);
  const float radius = clampf(vp->stereo_spread + s->cloud_macro * 0.20f, 0.0f, 1.0f);
  grain->pan = clampf(vp->pan + sinf(orbit * 6.2831853f) * radius, -1.0f, 1.0f);
}
```

Optional Doppler-like pitch drift:

```cpp
pitch_semi += cosf(orbit * 6.2831853f) * radius * 0.20f;
```

Keep this very subtle.

## 6.5 Stars / anchor positions

Add per-voice state:

```cpp
int anchor_step[KESSHO_NUM_VOICES];
```

Use anchors:

```cpp
static constexpr float kStarsAnchors[5] = {0.10f, 0.30f, 0.50f, 0.70f, 0.90f};
```

In `spawn_grain(...)`, if cloud style is Stars, replace base slice position with selected anchor:

```cpp
int idx = s->anchor_step[voice_idx] % 5;
if (vp->anchor_pattern == 1) idx = 4 - idx; // reverse
else if (vp->anchor_pattern == 2) { // pendulum
  const int p = s->anchor_step[voice_idx] % 8;
  idx = p < 5 ? p : 8 - p;
} else if (vp->anchor_pattern == 3) {
  idx = (int)(next_random(s) * 5.0f) % 5;
}

base_pos = kStarsAnchors[idx] * buffer_size_f;
s->anchor_step[voice_idx]++;
```

Then apply position spray around the anchor.

## 6.6 Optional Glide

Glide is moderate CPU because playback rate changes inside the grain. Implement only in Balanced/HQ or when `vp->glide > 0.001`.

At spawn:

```cpp
const float glide = clampf(vp->glide, 0.0f, 1.0f);
grain->pitch_semi_start = pitch_semi;
grain->pitch_semi_end = pitch_semi + ((next_random(s) - 0.5f) * 2.0f) * glide * 12.0f;
grain->playback_rate = powf(2.0f, grain->pitch_semi_start / 12.0f) * speed * direction;
const float end_rate = powf(2.0f, grain->pitch_semi_end / 12.0f) * speed * direction;
grain->playback_rate_step = (end_rate - grain->playback_rate) / fmaxf(1.0f, (float)grain->length);
```

In grain processing after reading:

```cpp
if (fabsf(grain->playback_rate_step) > 0.0000001f) {
  grain->playback_rate += grain->playback_rate_step;
}
```

Acceptance:

```text
- Bloom sounds like delayed ghost grains, not just more density.
- Tide gives breathing/lapping amplitude motion.
- Orbit gives stereo movement without seasick pitch.
- Stars reads from 10/30/50/70/90% anchors and is visible.
- Glide bends within grains only when user enables it.
```

---

# Phase 7 — Clean looper refinements

Clean is the looper. Make it more Loop Forest-like and avoid clicks at wraps.

## 7.1 Add loop crossfade

Use `vp->loop_crossfade_ms`, mapped 4–80ms.

In Clean processing, when reading within a slice, crossfade near wrap boundaries:

```cpp
const int xfade_samples = clampi((int)(vp->loop_crossfade_ms * 0.001f * sr), 32, slice_len / 4);
```

When forward and read position is within `xfade_samples` of slice end:

```cpp
float fade = (slice_end - read_pos) / (float)xfade_samples;
float a = read_current_head;
float b = read_from_slice_start_offset;
sample = b * (1.0f - fade) + a * fade;
```

When reverse and read position is within `xfade_samples` of slice start, crossfade with slice end.

Use `read_buffer_quality(...)` for both reads.

## 7.2 Add Clean lookback

Clean mode should also respect `vp->lookback` when write-follow is enabled.

Use the same mapping:

```cpp
lookback_s = exp(log(0.060) + lookback * log(maxLookback / 0.060))
```

When `write_follow > 0.01`, target the clean loop head to `write_pos - lookback_samples`, not the old minimum-only behavior.

## 7.3 Control-rate Clean LFOs

Add cached LFO values for Clean voices:

```cpp
float clean_pan_lfo_value[KESSHO_NUM_VOICES];
float clean_pos_lfo_value[KESSHO_NUM_VOICES];
int clean_lfo_counter[KESSHO_NUM_VOICES];
```

Update every 16 samples:

```cpp
if ((s->clean_lfo_counter[v]++ & 15) == 0) {
  s->clean_pan_lfo_value[v] = (lfo_tick(&s->pan_lfo[v], sr) - 0.5f) * 2.0f;
  s->clean_pos_lfo_value[v] = (lfo_tick(&s->pos_lfo[v], sr) - 0.5f) * 2.0f;
}
```

Keep reverse LFO at musical/event rate, not per-sample if it causes clicks.

Acceptance:

```text
- Clean loops do not click at wrap points.
- Four Clean voices can create Loop Forest-style drift.
- Lookback control has full range and is visible in the buffer.
- CPU is lower in Eco/Balanced quality.
```

---

# Phase 8 — Visualizer telemetry and UI updates

## 8.1 Extend visual event data

Current visualizer infers grain particles from voice position changes. This misses multiple grains between UI polls. Add a small DSP event ring.

In `GranularState`:

```cpp
struct GrainVisualEvent {
  float position_norm;
  float pan;
  float pitch_semi;
  float gain;
  float length_ms;
  int voice;
  int flags;       // bit 0 ghost, bit 1 reverse, bit 2 anchor, bit 3 glide
  int cloud_style;
};

GrainVisualEvent visual_events[128];
uint32_t visual_event_write;
uint32_t visual_event_read_shadow;
```

At spawn:

```cpp
static inline void push_visual_event(GranularState* s, int voice, const Grain* g, float pitch_semi) {
  GrainVisualEvent* e = &s->visual_events[s->visual_event_write & 127u];
  e->position_norm = wrap_position(g->position, (float)s->buffer_size) / (float)s->buffer_size;
  e->pan = g->pan;
  e->pitch_semi = pitch_semi;
  e->gain = g->gain;
  e->length_ms = (float)g->length * 1000.0f / s->sample_rate;
  e->voice = voice;
  e->flags = (g->is_ghost ? 1 : 0) | (g->playback_rate < 0.0f ? 2 : 0);
  e->cloud_style = g->cloud_style;
  s->visual_event_write++;
}
```

Expose a C API function or ProductCore snapshot function:

```cpp
int granular_get_visual_events(GrainVisualEvent* out_events, int max_events);
```

Return only new events since last UI read or the last N events if easier.

## 8.2 Extend `CanvasVoiceVisual`

File:

```text
src/ui/granular/GranularBufferCanvas.tsx
```

Add fields:

```ts
cloudStyle: 'classic' | 'mosaic' | 'bloom' | 'tide' | 'orbit' | 'stars';
positionSpray: number;
timingSpray: number;
lookback: number;
writeGuard: number;
pitchMode: string;
pitchSpread: number;
pitchJitter: number;
pitchQuantize: number;
bloom: number;
glide: number;
quality: 'eco' | 'balanced' | 'hq';
```

Add optional grain event prop:

```ts
grainEvents?: readonly GranularVisualEvent[];
visualDetail: 'basic' | 'full';
```

## 8.3 Draw new overlays

Update Canvas drawing in this order:

1. Waveform.
2. Slice grid.
3. Write head + write guard halo.
4. Voice range bands.
5. Lookback target marker.
6. Position Spray window.
7. Timing Spray tick fan.
8. Active grain particles from `grainEvents`.
9. Pitch color/labels.
10. Grain count sparkline and max grain line.

Detailed rules:

```text
Position Spray: horizontal translucent band width = same formula as DSP.
Timing Spray: small vertical tick fan above lane. Width/opacity follows timingSpray.
Lookback: small marker behind write head. Label as “LB”.
Write Guard: red/amber protected region behind write head.
Pitch: color/shape particles by interval; ghost grains are hollow particles.
Bloom: draw ghost grain particles with ring outline.
Stars: draw 5 anchor ticks at 10/30/50/70/90%.
Orbit: draw curved/arc pan indicator in the lane.
Tide: draw subtle sine ribbon in lane.
Glide: draw particle with short diagonal pitch tail.
Quality: badge “Eco/Bal/HQ”; show active grains/max grains.
```

## 8.4 UI layout

File:

```text
src/ui/granular/GranularPage.tsx
```

Add global sections:

```text
Engine
- Enable
- Freeze
- Mix/Return
- Feedback
- Buffer Length
- Quality: Eco / Balanced / HQ
- Max Grains

Macros
- Spray Macro
- Cloud Macro
- Pitch Macro
- Diffusion / Space

Visualizer
- Visual Detail: Basic / Full
```

Each voice card should show:

```text
Mode: Clean / Granular
Slice
Gain
Pan
Stereo Spread
```

Clean controls:

```text
Speed
Pitch
Reverse
Scan Rate
Lookback
Write Follow
Loop Crossfade
Blur / Smooth
Position LFO Rate/Depth
Pan LFO Rate
```

Granular controls:

```text
Cloud Style: Classic / Mosaic / Bloom / Tide / Orbit / Stars
Density
Grain Size
Position Spray
Timing Spray
Lookback
Write Guard
Pitch
Pitch Mode
Pitch Spread
Pitch Jitter
Pitch Quantize
Reverse Chance
Bloom
Glide
Attack
Decay
Blur / Smooth
Stereo Spread
Position LFO Rate/Depth
Pan LFO Rate
Record LFO Rate
```

Show controls conditionally but do not hide user-definable sound changes completely. If a control is advanced, put it behind an expanded “Advanced Cloud” section, not absent.

## 8.5 Compile and test

Acceptance:

```text
- Visualizer no longer references Legacy.
- Spray, lookback, timing spray, pitch, bloom, stars anchors, and active grains are visible.
- Visualizer does not exceed Basic CPU budget on mobile/low detail.
- Visualizer uses actual event data instead of only voice position deltas.
```

---

# Phase 9 — Macro UX and preset updates

## 9.1 Granular macro semantics

Expose three macros in UI and preset system:

```text
Spray Macro:
  position_spray + timing_spray + small pitch_jitter + stereo_spread

Cloud Macro:
  density + grain_size + blur + diffusion + bloom

Pitch Macro:
  pitch_mode intensity + pitch_spread + pitch_jitter + old grain_oct tendency
```

All affected parameters must still be exposed in voice cards with ghost values.

## 9.2 Safe macro math

Use these contribution limits:

```ts
const sprayMacro = clamp(state.granularSprayMacro ?? 0, 0, 1);
const cloudMacro = clamp(state.granularCloudMacro ?? 0, 0, 1);
const pitchMacro = clamp(state.granularPitchMacro ?? 0, 0, 1);

const macroBudget = Math.max(1, Math.sqrt(sprayMacro * sprayMacro + cloudMacro * cloudMacro + pitchMacro * pitchMacro));
const sprayShare = sprayMacro / macroBudget;
const cloudShare = cloudMacro / macroBudget;
const pitchShare = pitchMacro / macroBudget;
```

Do not allow every macro to push the same hidden params to max simultaneously. Use the shares to scale additive effects.

Example effective values:

```ts
effectivePositionSpray = clamp(rawPositionSpray + sprayShare * 0.45, 0, 1);
effectiveTimingSpray = clamp(rawTimingSpray + sprayShare * 0.55, 0, 1);
effectivePitchJitter = clamp(rawPitchJitter + pitchShare * 14, 0, 50);
effectiveBloom = clamp(rawBloom + cloudShare * 0.35, 0, 1);
```

## 9.3 Preset update plan

File:

```text
src/ui/granular/granularPresets.ts
```

Remove `legacy_cloud`.

Update or add:

```text
Loop Forest:
  four Clean voices
  quality balanced
  loop crossfade 18–30ms
  lookback spread: V1 .25, V2 .35, V3 .50, V4 .65
  pan: -0.45, 0.45, -0.20, 0.20
  blur: .18–.34
  position LFO slow and bipolar

Mosaic A Octave Up:
  Granular style Mosaic
  pitch mode octaves
  pitch spread 12
  pitch quantize 1
  bloom .16
  density 18–32
  timing spray .12

Mosaic B Octave Down:
  pitch mode octaves
  base pitch -12 or octave palette weighted down
  lower output LPF

Mosaic C Shimmer:
  pitch mode fifths/octaves
  pitch spread 19
  pitch jitter 6 cents
  bloom .22

Mosaic D Wide:
  pitch mode fifths/chord
  stereo spread .85
  orbit style optional

Flux Cloud:
  position spray .45
  timing spray .30
  cloud macro .35
  pitch macro .20

Stars Pattern:
  style stars
  anchor pattern pendulum or random
  grid/clocked timing
```

Acceptance:

```text
- Presets use only Clean/Granular.
- Presets expose macro ghost values.
- Presets do not rely on hidden legacy params.
```

---

# Phase 10 — Moderate CPU quality additions worth keeping

These are worth the extra CPU if performance remains acceptable.

## 10.1 HQ sinc stays, but adaptive interpolation saves CPU

Keep HQ 8-point sinc for polished pitch-shifted grains. Balanced should use cubic for normal rates and sinc only for larger pitch shifts. Eco should use linear/cubic.

This is the best CPU-quality tradeoff because interpolation runs for every active grain sample.

## 10.2 Bloom ghost grains

Worth it. Bloom adds a perceptually large stereo/halo improvement with bounded CPU because it spawns at most one ghost per source grain and respects `max_total_grains_user`.

Hard limits:

```text
max_total_grains_user default: 48
absolute cap: 64
Bloom ghost probability: bloom amount
Ghost gain: 0.36 + bloom * 0.18
Ghost delay: 25% of grain length
Ghost detune: ±9 cents
```

## 10.3 Pitch palettes

Worth it. Pitch palette selection is mostly spawn-time CPU and improves Mosaic/Microcosm-style musicality.

Keep mode defaults musical:

```text
Fixed: no random interval
Octaves: 0, +12, -12, +24
Fifths: 0, +7, +12, -5, +19
Chord: current chord offsets
Scale: current scale intervals + optional octave
Free: random semitone spread
```

## 10.4 Stars anchors

Worth it. Stars has almost no audio CPU cost and improves usability/visual feedback.

## 10.5 Glide

Worth adding but keep gated. It changes playback rate per sample, so only apply when `glide > 0.001`.

## 10.6 Tide

Worth adding if using sine LUT or only when Tide style is selected. Avoid per-grain `sinf` in Eco mode.

## 10.7 Transient quantize

Do not implement in this pass unless everything above is stable. Create a later ticket:

```text
Granular Capture Quantize: Off / Grid / Transient
```

Transient quantize requires buffer peak/transient analysis and new UI/visualizer behavior. It is valuable but larger than the first quality pass.

---

# Phase 11 — Final legacy cleanup

Only do this after all previous phases compile and presets migrate.

## 11.1 Remove legacy constants

In `kessho_granular.h`, delete or deprecate:

```cpp
#define KESSHO_MODE_LEGACY 2
#define KESSHO_PITCH_RANDOM 0
#define KESSHO_PITCH_HARMONIC 1
```

If public ABI requires stable values, keep the defines but comment:

```cpp
#define KESSHO_MODE_LEGACY 2 // deprecated: sanitized to KESSHO_MODE_GRANULAR
```

## 11.2 Remove legacy structs and fields

Delete:

```cpp
struct LegacyParams
GranularState::legacy
legacy-specific harmonic pitch branch
legacy max grains branch
```

Remove `granular_legacy_*` fields from UI state and ProductCore state after preset migration is confirmed.

## 11.3 Remove legacy preset scopes

In `GranularPage.tsx`, remove:

```ts
{ level: 1, scope: 'granularLegacy' }
```

from composite preset scopes.

## 11.4 Compile and grep

```bash
grep -R "legacy\|Legacy\|KESSHO_MODE_LEGACY\|granular_legacy" -n \
  wasm cpp src | tee /tmp/legacy_after_cleanup.txt
```

Expected: only migration comments or deprecated compatibility stubs remain.

---

# Phase 12 — Validation checklist

## 12.1 Build and runtime

```text
- Full build passes.
- No NaN/Inf output.
- Bypass cleanly stops processing.
- Freeze/unfreeze has no click.
- All four voices can run Clean.
- All four voices can run Granular.
- Mixed Clean + Granular works.
```

## 12.2 CPU tests

Test at 48kHz and 128-sample block if possible:

```text
A. Granular disabled
B. One Clean voice
C. Four Clean voices
D. One Granular voice, 16 grains/s, 120ms grains
E. Four Granular voices, 32 grains/s, 200ms grains
F. Four Granular voices, max density, HQ quality
G. Bloom on/off
H. Visualizer Basic/Full/off
```

Pass criteria:

```text
- Disabled CPU unchanged or lower.
- Eco lower than current.
- Balanced not higher than current by more than the added feature budget.
- HQ allowed moderate increase but no spikes/dropouts.
- Bloom respects max grain cap.
- Visualizer Full is UI-thread only and bounded.
```

## 12.3 Macro math tests

Sweep macros and confirm no pinned params:

```text
Spray Macro 0 -> timing spray can be exactly zero.
Spray Macro 1 -> timing interval min does not drop below 0.35x.
Cloud Macro 0.5 -> density not automatically 64.
Cloud Macro 1 -> density may approach 64 only near the top.
Pitch Macro 1 -> pitch variation musical in Octaves/Fifths/Chord/Scale modes.
Lookback 0 -> about 60ms unless buffer shorter.
Lookback 1 -> about 8s or 92% buffer cap.
Position LFO depth 1 -> bipolar ±50% buffer, not 0..100% forward.
```

## 12.4 Sonic tests

Use these sources:

```text
- sparse piano
- sustained pad
- vocal phrase
- drum loop
- guitar/keys loop
- silence
- full-scale sine
```

Listen for:

```text
- no clicks at grain start/end
- no clicks at Clean loop wrap
- no “stuck low lookback” behavior
- position spray and timing spray feel different
- pitch clouds remain musical when quantized
- Bloom adds halo without only becoming louder
- Stars anchors are visible and audible
- no excessive density clumping
```

## 12.5 Visualizer tests

```text
- Freeze shows ghost waveform.
- Write head visible.
- Lookback marker follows control.
- Write Guard halo follows control.
- Position Spray band matches control.
- Timing Spray tick fan appears only when timing spray > 0.
- Pitch events show interval identity.
- Bloom ghosts appear as hollow particles.
- Stars anchor ticks appear at 10/30/50/70/90%.
- Grain count sparkline and max-grain line work.
```

---

# Recommended commit order

1. `granular: remove legacy mode from ui and sanitize presets`
2. `granular: clamp product voice modes to clean granular`
3. `granular: append quality extension params`
4. `granular: cache smoothing coefficients`
5. `granular: add adaptive interpolation quality`
6. `granular: optimize grain free-slot lookup`
7. `granular: split position spray timing spray and lookback`
8. `granular: fix bipolar position lfo`
9. `granular: revise macro math and ghost values`
10. `granular: add cloud pitch palettes`
11. `granular: add bloom ghost grains`
12. `granular: add tide orbit stars styles`
13. `granular: add clean looper crossfade and lookback`
14. `granular: add visual event telemetry`
15. `granular-ui: update buffer visualizer overlays`
16. `granular-ui: add exposed controls and presets`
17. `granular: remove legacy internals after migration`
18. `granular: final tuning and validation`

---

# Hard initial tuning constants

```text
Global max grains default:       48
Global max grains hard cap:      64
Eco interpolation:               linear <1.20x, cubic otherwise
Balanced interpolation:          cubic <1.70x, sinc otherwise
HQ interpolation:                sinc always
Timing spray min interval:       0.35x
Timing spray max interval:       2.20x
Lookback min:                    60 ms
Lookback max:                    min(8s, 92% buffer)
Write Guard:                     15–120 ms, default ~46.5 ms
Position LFO:                    bipolar ±50% buffer at full depth
Position Spray local window:     max(3x grain length, 35% slice)
Position Spray history cap:      92% buffer
Pitch jitter:                    0–50 cents
Bloom ghost delay:               25% grain length
Bloom ghost detune:              ±9 cents
Bloom ghost gain:                0.36 + bloom * 0.18
Clean loop crossfade:            4–80 ms, default 12–24 ms
Stars anchors:                   10%, 30%, 50%, 70%, 90%
Orbit pitch wobble:              max ±0.20 semitones
Tide depth:                      max 0.80
Visualizer Basic FPS:            20
Visualizer Full FPS:             30
Visualizer Basic particles:      32
Visualizer Full particles:       80
```
