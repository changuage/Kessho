

````markdown
# Kessho Dynamics Engine Quality Pass

## Goal

Improve the sonic quality and usefulness of the Dynamics page engines:

1. Fix Character/Shallow “airplane filter pass” between 20–80% mix.
2. Prevent Character + Degrade backend motion/tone params from saturating too early.
3. Improve Degrade as a media/generation-loss engine instead of a generic bitcrush/lowpass.
4. Improve the compressor toward clearer studio compression without making OTT the default.
5. Allow moderate CPU increase only where it clearly improves audio quality.

## Current code facts to preserve

- `ProductDynamicsConfig.cpp` maps Dynamics UI to the Character worklet, including Character mix, Degrade mix, `base_wet`, `base_dry`, and the current `degrade_influence = sqrt(degrade_mix)`. Do not break that routing.
- `ProductDynamicsConstants.h` has the product-side Character worklet parameter enum ending at `kDynEndCompProgramRelease = 81`. Append new params only at the end. Do not insert in the middle.
- `wasm/dynamics-drift/kessho_dynamics_drift.cpp` has a matching worklet-side `ParamIndex` enum and fixed-size param arrays based on `KESSHO_DYNAMICS_DRIFT_PARAM_COUNT`. Keep product-side and worklet-side param order identical.
- Character currently clamps modulated delay to `0.00005f–0.105f` and reads the delay with `read_delay(...)`; this is the main source of short-delay dry/wet combing.
- Product config currently hard-disables the allpass diffusion path with `params[kDynAllpassActive] = 0.0f`, even though the worklet has an existing wet-only allpass processing block.
- The end compressor already has threshold, knee, ratio, attack, release, makeup, mix, detector HP, detector tilt, auto makeup, and program release. Build on this instead of replacing it.
- Standalone and integrated Degrade currently use sample-hold / quantization with `std::round(...)`; add dither rather than making it cleaner.

Sources: current repo files show the Dynamics config mappings, enum indices, Character delay clamps/read calls, allpass-off mapping, end-compressor detector path, and Degrade quantization path. :contentReference[oaicite:0]{index=0}

---

## Implementation rules

1. Work in small commits. Compile after each phase.
2. Do not change public parameter ordering except by appending new params at the end.
3. Do not change bypass behavior.
4. Do not allow NaN/Inf output.
5. Do not add full OTT as the default compressor behavior.
6. Do not remove existing Degrade dry/wet routing. `P_EROSION_MIX` currently behaves like “degrade ratio inside the wet path,” not necessarily the raw UI mix. Preserve that meaning.
7. New CPU-heavy behavior must be gated by amount/mode checks so inactive engines stay cheap.

---

# Phase 0 — Baseline and search

## 0.1 Create a branch

```bash
git checkout -b dynamics-quality-pass
````

## 0.2 Locate all param count definitions

Run:

```bash
grep -R "KESSHO_DYNAMICS_DRIFT_PARAM_COUNT" -n .
grep -R "DynamicsDriftParamIndex" -n .
grep -R "enum ParamIndex" -n wasm/dynamics-drift
grep -R "kDynEndCompProgramRelease" -n .
grep -R "P_END_COMP_PROGRAM_RELEASE" -n .
```

Record every file that needs updating when new params are appended.

## 0.3 Compile current project before edits

Run the project’s normal build/test command. If unknown, inspect existing README/package scripts/CMake files and run the closest project build. Do not start edits until the baseline build status is known.

---

# Phase 1 — Append hidden worklet params

This phase enables safer mapping and later quality upgrades without abusing existing params.

## 1.1 Update `cpp/KesshoCore/src/product/ProductDynamicsConstants.h`

Append these after `kDynEndCompProgramRelease = 81`:

```cpp
  kDynErosionUiMix = 82,
  kDynErosionColorInfluence = 83,
  kDynErosionMotionInfluence = 84,
  kDynErosionFailureInfluence = 85,
  kDynEndCompPeakBlend = 86,
  kDynEndCompClarity = 87,
  kDynEndCompTwoBand = 88,
```

Do not renumber existing params.

## 1.2 Update `wasm/dynamics-drift/kessho_dynamics_drift.cpp`

Append matching worklet params after `P_END_COMP_PROGRAM_RELEASE`:

```cpp
  P_EROSION_UI_MIX,
  P_EROSION_COLOR_INFLUENCE,
  P_EROSION_MOTION_INFLUENCE,
  P_EROSION_FAILURE_INFLUENCE,
  P_END_COMP_PEAK_BLEND,
  P_END_COMP_CLARITY,
  P_END_COMP_TWO_BAND,
```

The enum should still start at `P_ACTIVE = 0`. Do not assign explicit numbers unless the file already does.

## 1.3 Update param count

Update every definition of `KESSHO_DYNAMICS_DRIFT_PARAM_COUNT` from the old value to `89`.

If the count is generated, update the generation source and regenerate. Then verify:

```bash
grep -R "KESSHO_DYNAMICS_DRIFT_PARAM_COUNT" -n .
```

Expected final count: `89`.

## 1.4 Compile

Build now. Fix enum/count mismatches before continuing.

---

# Phase 2 — Product config influence split

File:

```text
cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp
```

The current config uses a single `sqrt(degrade_mix)` influence, which pushes backend behavior too hard early in the knob range. Replace it with color/motion/failure curves. The file currently computes `character_mix`, `degrade_mix`, `base_wet`, `degrade_influence`, and `base_dry` together. ([GitHub][1])

## 2.1 Add helper

Find existing helper functions such as `unit(...)` / `clampFloat(...)`. Add this nearby:

```cpp
static float smoothstep01(float x) {
  x = clampFloat(x, 0.0f, 1.0f);
  return x * x * (3.0f - 2.0f * x);
}
```

If `smoothstep01` already exists, reuse it.

## 2.2 Replace single Degrade influence

Replace:

```cpp
const float degrade_influence = std::sqrt(degrade_mix);
```

with:

```cpp
const float degrade_color_influence =
    std::sqrt(degrade_mix);

const float degrade_motion_influence =
    degrade_mix * (0.65f + 0.35f * degrade_mix);

const float degrade_failure_influence =
    smoothstep01((degrade_mix - 0.25f) / 0.75f);

// Keep this alias for existing color/tone paths.
// Do not use this for motion or failure/dropout paths.
const float degrade_influence = degrade_color_influence;
```

## 2.3 Use the split influences in obvious mappings

Make these targeted substitutions:

### Color / age / tone

Use `degrade_color_influence` for:

```cpp
degrade_age
degrade_generation
media_wear
tone
saturation color
head bump
lowpass color
```

Keep:

```cpp
const float degrade_age = raw_degrade_age * degrade_color_influence;
const float degrade_generation = raw_degrade_generation * degrade_color_influence;
```

### Alias / corrosion / dropout / damage

Use `degrade_failure_influence` for:

```cpp
alias damage
corrosion damage
dropout
jitter
damage_activity scaling
```

Change:

```cpp
const float contribution_alias_damage =
    unit((raw_degrade_alias * 0.9f + raw_corrosion * 0.42f) * degrade_influence);
```

to:

```cpp
const float contribution_alias_damage =
    unit((raw_degrade_alias * 0.9f + raw_corrosion * 0.42f) * degrade_failure_influence);
```

Change:

```cpp
const float corrosion =
    unit(raw_corrosion * degrade_influence * 0.72f + degrade_generation * 0.035f + shaped_alias * 0.025f);
```

to:

```cpp
const float corrosion =
    unit(raw_corrosion * degrade_failure_influence * 0.72f +
         degrade_generation * 0.035f +
         shaped_alias * 0.025f);
```

For dropout, change the leading `degrade_mix * (...)` to:

```cpp
degrade_failure_influence * (...)
```

Do not remove `mod_dropout`.

### Motion

Use `degrade_motion_influence` for:

```cpp
mod_sources[kDynamicsModSourceSlow]
mod_sources[kDynamicsModSourceFlutter]
mod_sources[kDynamicsModSourceRandom]
mod_sources[kDynamicsModSourceEnv]
raw_wow
raw_flutter
raw_drift
degrade_motion_weight
```

Change:

```cpp
const float raw_wow =
    unit(base_degrade_wow * degrade_influence * ...);
```

to:

```cpp
const float raw_wow =
    unit(base_degrade_wow * degrade_motion_influence * ...);
```

Change:

```cpp
const float raw_flutter =
    unit(base_degrade_flutter * degrade_influence * ...);
```

to:

```cpp
const float raw_flutter =
    unit(base_degrade_flutter * degrade_motion_influence * ...);
```

Change:

```cpp
const float raw_drift = base_degrade_drift * degrade_influence;
```

to:

```cpp
const float raw_drift = base_degrade_drift * degrade_motion_influence;
```

Change:

```cpp
const float degrade_motion_weight =
    degrade_enabled ? unit(degrade_wet_ratio * (0.65f + degrade_influence * 0.35f)) : 0.0f;
```

to:

```cpp
const float degrade_motion_weight =
    degrade_enabled ? unit(degrade_motion_influence * (0.65f + degrade_wet_ratio * 0.35f)) : 0.0f;
```

## 2.4 Set new hidden worklet params

Near the existing `params[kDyn...]` assignments, add:

```cpp
params[kDynErosionUiMix] = degrade_mix;
params[kDynErosionColorInfluence] = degrade_color_influence;
params[kDynErosionMotionInfluence] = degrade_motion_influence;
params[kDynErosionFailureInfluence] = degrade_failure_influence;
```

Set the new compressor helper params:

```cpp
const float end_detector_tilt = unit(fx.dynamics_end_comp_detector_tilt);

params[kDynEndCompPeakBlend] =
    end_comp_enabled ? clampFloat(0.18f + end_detector_tilt * 0.32f, 0.15f, 0.55f) : 0.0f;

params[kDynEndCompClarity] =
    end_comp_enabled ? clampFloat(end_wet * (0.10f + end_detector_tilt * 0.28f), 0.0f, 0.35f) : 0.0f;

// Leave off until Phase 7 unless a UI mode exists.
params[kDynEndCompTwoBand] = 0.0f;
```

## 2.5 Compile

Build now. Fix only compile errors from this phase.

---

# Phase 3 — Character anti-comb fixes

Main file:

```text
wasm/dynamics-drift/kessho_dynamics_drift.cpp
```

Config file:

```text
cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp
```

Current Character delay can clamp down to `0.00005f`, and current Shallow random delay depth can be large relative to the base delay. This creates the audible “airplane” pass when dry and wet are both present. ([GitHub][2])

## 3.1 Add Character delay constants

In `kessho_dynamics_drift.cpp`, near existing constants such as `kDelayMaxSamples` and `kMinFreq`, add:

```cpp
constexpr float kCharacterFullWetMinDelayS = 0.0030f;
constexpr float kCharacterMixedMinDelayS = 0.0105f;
constexpr float kCharacterMaxDelayS = 0.075f;
```

## 3.2 Compute comb-risk-sensitive minimum delay

In `dynamics_drift_process_block`, before `main_delay_s` and `spread_delay_s` are computed, add:

```cpp
const float dry_gain_for_comb = clamp01(p[P_DRY]);
const float wet_gain_for_comb = clamp01(p[P_WET]);

// Peaks near 50/50 dry/wet, where combing is most audible.
const float comb_risk =
    clamp01(4.0f * dry_gain_for_comb * wet_gain_for_comb);

const float min_delay_s =
    kCharacterFullWetMinDelayS +
    (kCharacterMixedMinDelayS - kCharacterFullWetMinDelayS) * comb_risk;
```

## 3.3 Replace both delay clamps

Replace both occurrences of:

```cpp
0.00005f,
0.105f
```

inside the `main_delay_s` and `spread_delay_s` clamps with:

```cpp
min_delay_s,
kCharacterMaxDelayS
```

Expected behavior:

```text
Full wet / nearly full wet: minimum delay can reach 3.0 ms.
20–80% dry/wet region: minimum delay approaches 10.5 ms.
Maximum delay: 75 ms.
```

## 3.4 Reduce Shallow random delay depth

In `ProductDynamicsConfig.cpp`, find the Shallow branch:

```cpp
? random_drift * (0.00095f + depth * 0.0104f + rate * 0.0009f + contribution_bbd_color * 0.0024f)
```

Replace it with:

```cpp
? random_drift * (0.00080f + depth * 0.0056f + rate * 0.00065f + contribution_bbd_color * 0.0014f)
```

Do not change the Clean or Abyss branches in this phase.

## 3.5 Compile and test

Acceptance checks:

```text
- Character Mix 0%: dry signal unchanged.
- Character Mix 20/50/80% in Shallow mode: no obvious jet/airplane sweep.
- Character Mix 100%: still has unstable vibrato/warble character.
- No clicks when mod depth/rate changes.
- No NaN/Inf output.
```

---

# Phase 4 — Character HQ delay interpolation and wet diffusion

This phase allows moderate CPU increase for better audio quality.

## 4.1 Add cubic delay read

In `kessho_dynamics_drift.cpp`, place this next to the existing `read_delay(...)` function:

```cpp
float read_delay_cubic(const float* delay, float delay_samples) {
  float read = static_cast<float>(g.write_pos) - delay_samples;

  while (read < 0.0f) read += static_cast<float>(g.delay_size);
  while (read >= static_cast<float>(g.delay_size)) read -= static_cast<float>(g.delay_size);

  const int i1 = static_cast<int>(read);
  const float t = read - static_cast<float>(i1);

  const int i0 = (i1 - 1 + g.delay_size) % g.delay_size;
  const int i2 = (i1 + 1) % g.delay_size;
  const int i3 = (i1 + 2) % g.delay_size;

  const float y0 = delay[i0];
  const float y1 = delay[i1];
  const float y2 = delay[i2];
  const float y3 = delay[i3];

  const float c0 = y1;
  const float c1 = 0.5f * (y2 - y0);
  const float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
  const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);

  return ((c3 * t + c2) * t + c1) * t + c0;
}
```

Replace:

```cpp
const float main = read_delay(g.main_delay, main_delay_s * g.sample_rate);
const float spread = read_delay(g.spread_delay, spread_delay_s * g.sample_rate);
```

with:

```cpp
const float main = read_delay_cubic(g.main_delay, main_delay_s * g.sample_rate);
const float spread = read_delay_cubic(g.spread_delay, spread_delay_s * g.sample_rate);
```

## 4.2 Enable existing allpass diffusion

The worklet already processes `ap_a` and `ap_b` when `P_ALLPASS_ACTIVE` is enabled, but product config currently sets it to `0.0f`. ([GitHub][2])

In `ProductDynamicsConfig.cpp`, replace:

```cpp
params[kDynAllpassActive] = 0.0f;
```

with:

```cpp
const float comb_risk_for_allpass =
    clampFloat(4.0f * dry * wet, 0.0f, 1.0f);

params[kDynAllpassActive] =
    (mode_active && comb_risk_for_allpass > 0.18f) ? 1.0f : 0.0f;
```

## 4.3 Retune allpass frequencies/Q for diffusion

Replace the existing allpass parameter assignments with these safer broad-diffusion values:

```cpp
params[kDynAllpassAFrequency] =
    420.0f + shallow_flavor * 480.0f + abyss_flavor * 620.0f + depth * 420.0f + age * 180.0f;

params[kDynAllpassAQ] =
    std::min(0.95f, 0.55f + shallow_flavor * 0.18f + abyss_flavor * 0.14f + depth * 0.18f);

params[kDynAllpassBFrequency] =
    1450.0f + shallow_flavor * 1850.0f + abyss_flavor * 1250.0f + depth * 950.0f + age * 360.0f;

params[kDynAllpassBQ] =
    std::min(0.85f, 0.48f + shallow_flavor * 0.16f + abyss_flavor * 0.12f + depth * 0.16f);
```

Current config already computes allpass frequency/Q values near the delay/filter assignments, so keep these assignments in the same location. ([GitHub][1])

## 4.4 Optional micro-tap decorrelation

Implement only after 4.1–4.3 compile and sound good.

After reading `main` and `spread`, add:

```cpp
float main_read = main;
float spread_read = spread;

const float decor_amount =
    comb_risk * clamp01(p[P_SHALLOW] + p[P_ABYSS] * 0.65f) * 0.16f;

if (decor_amount > 0.001f) {
  const float main_offset_s = 0.00145f + g.water_cv_spread * 0.00025f;
  const float spread_offset_s = -0.00110f + g.water_cv_main * 0.00020f;

  const float main_b = read_delay_cubic(
      g.main_delay,
      clampf(main_delay_s + main_offset_s, min_delay_s, kCharacterMaxDelayS) * g.sample_rate);

  const float spread_b = read_delay_cubic(
      g.spread_delay,
      clampf(spread_delay_s + spread_offset_s, min_delay_s, kCharacterMaxDelayS) * g.sample_rate);

  main_read = main_read + (main_b - main_read) * decor_amount;
  spread_read = spread_read + (spread_b - spread_read) * decor_amount;
}
```

Then use `main_read` and `spread_read` in the panning/summing code instead of `main` and `spread`.

Compile and A/B. If CPU increase is too high, keep cubic interpolation and allpass, but remove the micro-tap.

---

# Phase 5 — Character + Degrade motion budget fix

In `kessho_dynamics_drift.cpp`, replace the current tape/water blend section. The current code uses `P_EROSION_MIX` heavily in `tape_wow_blend`, `wow_blend`, and `flutter_blend`; that is risky because `P_EROSION_MIX` is the wet-path degrade ratio, not the raw UI amount. ([GitHub][2])

## 5.1 Add local influence aliases

Near the existing `tape_wow_blend` section, add:

```cpp
const float degrade_ui_mix = clamp01(p[P_EROSION_UI_MIX]);
const float degrade_color = clamp01(p[P_EROSION_COLOR_INFLUENCE]);
const float degrade_motion = clamp01(p[P_EROSION_MOTION_INFLUENCE]);
const float degrade_failure = clamp01(p[P_EROSION_FAILURE_INFLUENCE]);
```

## 5.2 Replace `tape_wow_blend`, `water_random_blend`, and `water_flutter_blend`

Replace the existing block with:

```cpp
const float tape_wow_blend = clamp01(
    degrade_motion * 0.58f +
    p[P_EROSION_WEAR] * degrade_color * 0.24f +
    p[P_EROSION_GENERATION] * degrade_color * 0.10f +
    p[P_EROSION_CORROSION] * degrade_failure * 0.08f);

const float water_random_blend =
    clamp01(p[P_SHALLOW] * 0.52f + p[P_ABYSS] * 0.62f);

const float water_flutter_blend =
    clamp01(p[P_SHALLOW] * 0.42f + p[P_ABYSS] * 0.46f);
```

## 5.3 Replace final wow/flutter blend caps

Replace:

```cpp
const float wow_blend = clampf(
  tape_wow_blend * 0.42f + p[P_EROSION_MIX] * 0.12f + water_random_blend,
  0.0f,
  0.93f
);
```

with:

```cpp
const float wow_blend = clampf(
    tape_wow_blend * 0.46f + degrade_motion * 0.04f + water_random_blend,
    0.0f,
    0.88f);
```

Replace:

```cpp
const float flutter_blend = clampf(tape_wow_blend * 0.78f + water_flutter_blend, 0.0f, 0.95f);
```

with:

```cpp
const float flutter_blend =
    clampf(tape_wow_blend * 0.60f + water_flutter_blend, 0.0f, 0.88f);
```

## 5.4 Compile and test

Acceptance checks:

```text
- Degrade-only low mix should not instantly enter maximum tape/wow behavior.
- Character + Degrade should still sound unstable, but not pinned at the same motion edge.
- Shallow mode should still feel random and organic.
```

---

# Phase 6 — Degrade quality upgrades

Files:

```text
wasm/dynamics-drift/kessho_dynamics_drift.cpp
wasm/dynamics-degrade/kessho_dynamics_degrade.cpp
```

## 6.1 Integrated Degrade: add dither to `erosion_sample`

Change signature from:

```cpp
float erosion_sample(float dry, int channel, float mix, float alias, float generation, float corrosion, float wear)
```

to:

```cpp
float erosion_sample(
    float dry,
    int channel,
    float mix,
    float alias,
    float generation,
    float corrosion,
    float wear,
    float dither_noise)
```

Replace:

```cpp
float wet = std::round(held * quant_steps) / quant_steps;
```

with:

```cpp
const float lsb = 1.0f / quant_steps;

const float dither_amt =
    lsb *
    (0.18f + generation * 0.42f + corrosion * 0.20f) *
    (1.0f - destructive * 0.35f);

const float dithered = held + dither_noise * dither_amt;

float wet = std::round(dithered * quant_steps) / quant_steps;
```

Update calls:

```cpp
wet_l = erosion_sample(
    wet_l,
    0,
    p[P_EROSION_MIX],
    p[P_EROSION_ALIAS] * degrade_failure,
    p[P_EROSION_GENERATION] * degrade_color,
    p[P_EROSION_CORROSION] * degrade_failure,
    p[P_EROSION_WEAR] * degrade_color,
    white_l);

wet_r = erosion_sample(
    wet_r,
    1,
    p[P_EROSION_MIX],
    p[P_EROSION_ALIAS] * degrade_failure,
    p[P_EROSION_GENERATION] * degrade_color,
    p[P_EROSION_CORROSION] * degrade_failure,
    p[P_EROSION_WEAR] * degrade_color,
    white_r);
```

## 6.2 Standalone Degrade: add TPDF dither

In `wasm/dynamics-degrade/kessho_dynamics_degrade.cpp`, add an RNG if the state does not already have one.

State field:

```cpp
unsigned int rng = 0x6d2b79f5u;
```

Helper:

```cpp
static float rand01(unsigned int& state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return static_cast<float>(state & 0x00ffffffu) / static_cast<float>(0x01000000u);
}
```

Before quantization, compute:

```cpp
const float tpdf = rand01(g_state.rng) + rand01(g_state.rng) - 1.0f;
const float lsb = 1.0f / quant_steps;

const float dither_amt =
    lsb *
    (0.18f + g_state.generation * 0.42f + g_state.corrosion * 0.20f) *
    (1.0f - destructive * 0.35f);
```

Replace:

```cpp
float wet = std::round(held * quant_steps) / quant_steps;
```

with:

```cpp
float wet = std::round((held + tpdf * dither_amt) * quant_steps) / quant_steps;
```

## 6.3 Add event-based media failures to integrated Degrade

Add these fields to `DynamicsDriftState`:

```cpp
float media_event_env = 0.0f;
float media_event_target = 0.0f;
float media_event_lp_l = 0.0f;
float media_event_lp_r = 0.0f;
int media_event_samples_left = 0;
```

Add this helper near other processing helpers:

```cpp
void process_media_event(float& wet_l, float& wet_r, const float* p) {
  const float event_amount = clamp01(
      p[P_EROSION_FAILURE_INFLUENCE] *
      (0.35f +
       p[P_EROSION_CORROSION] * 0.35f +
       p[P_EROSION_GENERATION] * 0.20f +
       p[P_EROSION_WEAR] * 0.10f));

  if (event_amount <= 0.0001f) {
    const float release = smooth_coeff(0.070f, g.sample_rate);
    g.media_event_env += (0.0f - g.media_event_env) * release;
    return;
  }

  const float event_rate_hz = 0.015f + event_amount * 1.15f;

  if (g.media_event_samples_left <= 0 &&
      rand01() < event_rate_hz / g.sample_rate) {
    const float dur_s = 0.035f + rand01() * 0.145f;
    g.media_event_samples_left = static_cast<int>(dur_s * g.sample_rate);
    g.media_event_target = 0.35f + rand01() * 0.65f;
  }

  if (g.media_event_samples_left > 0) {
    g.media_event_samples_left--;
    const float attack = smooth_coeff(0.004f, g.sample_rate);
    g.media_event_env += (g.media_event_target - g.media_event_env) * attack;
  } else {
    const float release = smooth_coeff(0.070f, g.sample_rate);
    g.media_event_env += (0.0f - g.media_event_env) * release;
  }

  const float e = clamp01(g.media_event_env);
  if (e <= 0.0001f) return;

  const float event_gain = db_to_gain(-e * (2.0f + event_amount * 10.0f));

  const float event_cutoff =
      650.0f + (1.0f - e) * 5200.0f + (1.0f - event_amount) * 2400.0f;

  const float event_alpha =
      one_pole_coeff(event_cutoff, g.sample_rate);

  g.media_event_lp_l += (wet_l - g.media_event_lp_l) * event_alpha;
  g.media_event_lp_r += (wet_r - g.media_event_lp_r) * event_alpha;

  const float filter_mix = e * (0.25f + event_amount * 0.50f);

  wet_l = (wet_l + (g.media_event_lp_l - wet_l) * filter_mix) * event_gain;
  wet_r = (wet_r + (g.media_event_lp_r - wet_r) * filter_mix) * event_gain;
}
```

Call it after `erosion_sample(...)` and before highpass/allpass filtering:

```cpp
process_media_event(wet_l, wet_r, p);
```

## 6.4 Add media profile EQ

Add state fields:

```cpp
Biquad media_body_l, media_body_r;
Biquad media_notch_l, media_notch_r;
```

Add helper:

```cpp
void update_media_profile_filters(const float* p) {
  const float media = clamp01(p[P_EROSION_COLOR_INFLUENCE]);
  const float failure = clamp01(p[P_EROSION_FAILURE_INFLUENCE]);
  const float gen = clamp01(p[P_EROSION_GENERATION]);
  const float wear = clamp01(p[P_EROSION_WEAR]);
  const float cor = clamp01(p[P_EROSION_CORROSION]);

  const float notch_freq = 2600.0f + gen * 1400.0f + cor * 900.0f;
  const float notch_q = 0.65f + wear * 1.25f;
  const float notch_gain_db = -media * (0.8f + gen * 2.4f + failure * cor * 1.6f);

  set_peaking(g.media_notch_l, notch_freq, notch_q, notch_gain_db, g.sample_rate);
  set_peaking(g.media_notch_r, notch_freq, notch_q, notch_gain_db, g.sample_rate);

  const float body_freq = 180.0f + wear * 120.0f;
  const float body_q = 0.55f + wear * 0.45f;
  const float body_gain_db = media * (0.4f + wear * 1.2f) - failure * cor * 0.8f;

  set_peaking(g.media_body_l, body_freq, body_q, body_gain_db, g.sample_rate);
  set_peaking(g.media_body_r, body_freq, body_q, body_gain_db, g.sample_rate);
}
```

Inside the sample loop, where `update_modulated_filters(p)` is called every 16 samples, also call:

```cpp
update_media_profile_filters(p);
```

Process after media event and before highpass:

```cpp
if (p[P_EROSION_COLOR_INFLUENCE] > 0.001f ||
    p[P_EROSION_FAILURE_INFLUENCE] > 0.001f) {
  wet_l = g.media_body_l.process(wet_l);
  wet_r = g.media_body_r.process(wet_r);

  wet_l = g.media_notch_l.process(wet_l);
  wet_r = g.media_notch_r.process(wet_r);
}
```

## 6.5 Compile and test

Acceptance checks:

```text
- Degrade low mix remains subtle.
- Degrade high failure settings produce occasional media-like dips/collapses, not constant hard mutes.
- No event clicks.
- Quantized Degrade sounds less static but not clean/hi-fi.
- Standalone Degrade still bypasses cleanly.
```

---

# Phase 7 — Compressor clarity upgrades

Main file:

```text
wasm/dynamics-drift/kessho_dynamics_drift.cpp
```

Config file:

```text
cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp
```

Do not add full OTT yet. First improve the existing end compressor.

## 7.1 Add RMS detector state

Add to `DynamicsDriftState`:

```cpp
float end_rms = 0.0f;
float end_hp_rms = 0.0f;
```

## 7.2 Modify `process_end_chain`

Current end compressor detector uses raw peak and highpass peak. Keep that path, but blend RMS and peak. ([GitHub][2])

Replace the detector-level section with:

```cpp
const float raw_peak = std::fmax(std::fabs(l), std::fabs(r));
g.telemetry[T_END_INPUT_PEAK] = std::fmax(g.telemetry[T_END_INPUT_PEAK], raw_peak);

const float hp_l = g.end_detector_hp_l.process(l);
const float hp_r = g.end_detector_hp_r.process(r);
const float hp_peak = std::fmax(std::fabs(hp_l), std::fabs(hp_r));

const float rms_coeff = smooth_coeff(0.010f, g.sample_rate);

g.end_rms += (raw_peak * raw_peak - g.end_rms) * rms_coeff;
g.end_hp_rms += (hp_peak * hp_peak - g.end_hp_rms) * rms_coeff;

const float raw_rms = std::sqrt(std::fmax(g.end_rms, 1.0e-12f));
const float hp_rms = std::sqrt(std::fmax(g.end_hp_rms, 1.0e-12f));

const float peak_blend = clamp01(p[P_END_COMP_PEAK_BLEND]);

const float raw_level = raw_rms + (raw_peak - raw_rms) * peak_blend;
const float hp_level = hp_rms + (hp_peak - hp_rms) * peak_blend;

const float detector_tilt = clamp01(p[P_END_COMP_DETECTOR_TILT]);

const float detector_level =
    raw_level * (1.0f - detector_tilt) + hp_level * detector_tilt;
```

Leave the existing gain-computation, attack/release, auto makeup, and mix code after this section.

## 7.3 Add clarity lift state

Add to `DynamicsDriftState`:

```cpp
Biquad clarity_hp_l, clarity_hp_r;
float clarity_gain = 1.0f;
float clarity_hp_cache = -1.0f;
```

Add helper:

```cpp
void update_clarity_filter() {
  const float clarity_hz = 2800.0f;
  if (std::fabs(clarity_hz - g.clarity_hp_cache) <= 0.05f) return;

  g.clarity_hp_cache = clarity_hz;
  set_highpass(g.clarity_hp_l, clarity_hz, 0.707f, g.sample_rate);
  set_highpass(g.clarity_hp_r, clarity_hz, 0.707f, g.sample_rate);
}
```

Add processor:

```cpp
void process_clarity_lift(float& l, float& r, const float* p) {
  const float amount = clamp01(p[P_END_COMP_CLARITY]);
  if (amount <= 0.0001f) return;

  update_clarity_filter();

  const float high_l = g.clarity_hp_l.process(l);
  const float high_r = g.clarity_hp_r.process(r);

  const float high_level = std::fmax(std::fabs(high_l), std::fabs(high_r));
  const float high_db = gain_to_db(high_level);

  // Avoid lifting silence/noise floor.
  const float gate = clamp01((high_db + 66.0f) / 18.0f);

  const float under_db = clampf(-34.0f - high_db, 0.0f, 24.0f);
  const float boost_db = std::min(5.0f, under_db * 0.32f) * amount * gate;

  const float target = db_to_gain(boost_db);

  const float attack = smooth_coeff(0.026f, g.sample_rate);
  const float release = smooth_coeff(0.160f, g.sample_rate);
  const float coeff = target > g.clarity_gain ? attack : release;

  g.clarity_gain += (target - g.clarity_gain) * coeff;

  const float add = (g.clarity_gain - 1.0f) * 0.58f;

  l += high_l * add;
  r += high_r * add;
}
```

## 7.4 Move generated noise after compression/clarity

Current output mixes generated noise before master saturation and end compression. That can cause generated hiss to get compressed/lifted. Current output section adds `g.noise_lp_* * noise_gain` directly into `out_l/out_r` before `process_master_saturation` and `process_end_chain`. ([GitHub][2])

Replace:

```cpp
const float noise_gain = p[P_NOISE_GAIN];

float out_l = in_l * p[P_DRY] + wet_l * wet_gain + g.noise_lp_l * noise_gain;
float out_r = in_r * p[P_DRY] + wet_r * wet_gain + g.noise_lp_r * noise_gain;

process_master_saturation(out_l, out_r, p);
process_end_chain(out_l, out_r, p, end_comp_attack_coeff);
```

with:

```cpp
const float noise_gain = p[P_NOISE_GAIN];
const float noise_l = g.noise_lp_l * noise_gain;
const float noise_r = g.noise_lp_r * noise_gain;

float out_l = in_l * p[P_DRY] + wet_l * wet_gain;
float out_r = in_r * p[P_DRY] + wet_r * wet_gain;

process_master_saturation(out_l, out_r, p);
process_end_chain(out_l, out_r, p, end_comp_attack_coeff);
process_clarity_lift(out_l, out_r, p);

// Add generated media noise after compressor/clarity so it is not pumped/lifted.
out_l += noise_l;
out_r += noise_r;
```

## 7.5 Recommended studio compressor mappings

In `ProductDynamicsConfig.cpp`, keep existing UI values when users set them. If there is a preset/mode system for the end compressor, add these preset constants.

### Studio Clear

```cpp
threshold = -22.0f;
knee = 8.0f;
ratio = 2.6f;
attack = 0.018f;
release = 0.160f;
makeup = 1.0f;
mix = 0.78f;
detector_hp_hz = 120.0f;
detector_tilt = 0.65f;
auto_makeup = 0.65f;
program_release = 0.70f;
peak_blend = 0.25f;
clarity = 0.22f;
```

### Clarity

```cpp
threshold = -26.0f;
knee = 10.0f;
ratio = 2.2f;
attack = 0.024f;
release = 0.120f;
makeup = 1.0f;
mix = 0.68f;
detector_hp_hz = 150.0f;
detector_tilt = 0.78f;
auto_makeup = 0.55f;
program_release = 0.80f;
peak_blend = 0.30f;
clarity = 0.30f;
```

### Glue

```cpp
threshold = -18.0f;
knee = 6.0f;
ratio = 1.8f;
attack = 0.030f;
release = 0.220f;
makeup = 1.0f;
mix = 0.85f;
detector_hp_hz = 95.0f;
detector_tilt = 0.45f;
auto_makeup = 0.45f;
program_release = 0.65f;
peak_blend = 0.15f;
clarity = 0.10f;
```

## 7.6 Compile and test

Acceptance checks:

```text
- Compressor no longer feels as grabby on transients.
- Detector is smoother than before.
- Generated hiss/noise is not obviously pumped or brightened by the compressor.
- Clarity lift should add presence without obvious hiss lift.
- Studio Clear should usually produce 1–4 dB gain reduction on full material.
```

---

# Phase 8 — Optional 2-band clarity compressor

Implement only after Phase 7 is stable.

Use `P_END_COMP_TWO_BAND > 0.5f` as the gate. Default remains `0.0f`.

## 8.1 Add state

Add to `DynamicsDriftState`:

```cpp
float two_band_low_l = 0.0f;
float two_band_low_r = 0.0f;
float two_band_low_gain = 1.0f;
float two_band_high_gain = 1.0f;
```

## 8.2 Add helper

```cpp
void process_two_band_clarity_comp(float& l, float& r, const float* p) {
  if (p[P_END_COMP_TWO_BAND] <= 0.5f) return;

  const float split_alpha = one_pole_coeff(170.0f, g.sample_rate);

  g.two_band_low_l += (l - g.two_band_low_l) * split_alpha;
  g.two_band_low_r += (r - g.two_band_low_r) * split_alpha;

  const float low_l = g.two_band_low_l;
  const float low_r = g.two_band_low_r;

  const float high_l = l - low_l;
  const float high_r = r - low_r;

  const float low_level = std::fmax(std::fabs(low_l), std::fabs(low_r));
  const float high_level = std::fmax(std::fabs(high_l), std::fabs(high_r));

  const float low_gr_db =
      compute_compressor_gain_db(gain_to_db(low_level), -24.0f, 6.0f, 2.6f);

  const float high_gr_db =
      compute_compressor_gain_db(gain_to_db(high_level), -28.0f, 8.0f, 1.45f);

  const float low_target = db_to_gain(low_gr_db);
  const float high_target = db_to_gain(high_gr_db);

  const float low_attack = smooth_coeff(0.032f, g.sample_rate);
  const float low_release = smooth_coeff(0.220f, g.sample_rate);
  const float high_attack = smooth_coeff(0.014f, g.sample_rate);
  const float high_release = smooth_coeff(0.120f, g.sample_rate);

  g.two_band_low_gain +=
      (low_target - g.two_band_low_gain) *
      (low_target < g.two_band_low_gain ? low_attack : low_release);

  g.two_band_high_gain +=
      (high_target - g.two_band_high_gain) *
      (high_target < g.two_band_high_gain ? high_attack : high_release);

  const float clarity_amount = clamp01(p[P_END_COMP_CLARITY]);
  const float high_makeup = db_to_gain(1.2f * clarity_amount);

  const float wet_l =
      low_l * g.two_band_low_gain +
      high_l * g.two_band_high_gain * high_makeup;

  const float wet_r =
      low_r * g.two_band_low_gain +
      high_r * g.two_band_high_gain * high_makeup;

  const float mix = clamp01(p[P_END_COMP_MIX]) * 0.78f;

  l = l + (wet_l - l) * mix;
  r = r + (wet_r - r) * mix;
}
```

Call it after `process_end_chain(...)` and before `process_clarity_lift(...)`.

## 8.3 Test

Acceptance checks:

```text
- Low end is controlled without the whole mix ducking.
- High band gets clearer but not harsh.
- Generated noise is not lifted because generated noise is added after this stage.
```

---

# Phase 9 — Master saturation anti-aliasing improvement

The master saturation already switches to a 2x/4x internal branch based on drive. Improve that branch with a simple oversampled-domain smoothing filter. Current branch chooses `factor = 4` above drive `0.66`, `factor = 2` above drive `0.18`, otherwise `1`. ([GitHub][2])

## 9.1 Add state

Add to `DynamicsDriftState`:

```cpp
float master_sat_os_lp_l = 0.0f;
float master_sat_os_lp_r = 0.0f;
```

## 9.2 Modify oversampled branch only

Inside `process_master_saturation(...)`, in the `factor > 1` branch, replace direct summing of shaped samples with filtered summing.

Current pattern:

```cpp
sum_l += process_master_saturation_sample(os_l, mode, drive, tone, bias);
sum_r += process_master_saturation_sample(os_r, mode, drive, tone, bias);
```

Replace with:

```cpp
const float os_alpha =
    1.0f - std::exp(
        -2.0f * static_cast<float>(M_PI) *
        (g.sample_rate * 0.42f / static_cast<float>(factor)) /
        (g.sample_rate * static_cast<float>(factor)));

const float shaped_l =
    process_master_saturation_sample(os_l, mode, drive, tone, bias);

const float shaped_r =
    process_master_saturation_sample(os_r, mode, drive, tone, bias);

g.master_sat_os_lp_l += (shaped_l - g.master_sat_os_lp_l) * os_alpha;
g.master_sat_os_lp_r += (shaped_r - g.master_sat_os_lp_r) * os_alpha;

sum_l += g.master_sat_os_lp_l;
sum_r += g.master_sat_os_lp_r;
```

Keep the final averaging:

```cpp
l = sum_l / static_cast<float>(factor);
r = sum_r / static_cast<float>(factor);
```

## 9.3 Test

Acceptance checks:

```text
- High drive sounds smoother.
- No obvious dulling at moderate drive.
- No DC buildup.
- CPU increase only happens when master saturation is active and drive crosses existing thresholds.
```

---

# Phase 10 — Do not implement full OTT yet

Do not add a full 3-band OTT in this pass.

After Phases 7–8, evaluate whether the compressor still lacks modern density. If yes, create a separate later ticket:

```text
Dynamics Compressor: OTT Lite creative mode
```

Recommended future OTT Lite values:

```text
Bands: 3
Crossovers: 120 Hz and 2.8 kHz
Depth: 0–35%, default 18%
Low upward: max +1 dB
Mid upward: max +3 dB
High upward: max +5 dB
Downward GR cap: 3–5 dB per band
Attack: 8–18 ms
Release: 90–180 ms
Noise gate: do not lift high band below roughly -62 dB
```

---

# Phase 11 — Validation checklist

## 11.1 Build

Run full project build.

## 11.2 Static checks

Run:

```bash
grep -R "kDynErosionUiMix" -n .
grep -R "P_EROSION_UI_MIX" -n .
grep -R "KESSHO_DYNAMICS_DRIFT_PARAM_COUNT" -n .
```

Confirm:

```text
- Product enum and worklet enum match.
- Param count is 89 everywhere.
- New params are assigned in ProductDynamicsConfig.cpp.
- New params are read in kessho_dynamics_drift.cpp.
```

## 11.3 Runtime safety

Test with:

```text
- silence
- DC offset
- full-scale sine
- white noise
- stereo drum loop
- guitar/pad loop
```

For every Dynamics engine:

```text
- bypass copies input cleanly
- no NaN/Inf
- no denormal runaway
- no clicks when changing mix/depth/rate/degrade/compressor params
- no output above expected safety range
```

## 11.4 Character acceptance

Use Shallow mode.

Test:

```text
Character Mix: 0%, 20%, 50%, 80%, 100%
Depth: default, 50%, 100%
Rate: default, 50%, 100%
Damp: default, low, high
```

Pass criteria:

```text
- 20–80% mix no longer has obvious airplane/flanger filter pass.
- Full wet still has unstable Shallow-style pitch movement.
- Motion remains random/organic, not static.
- Stereo spread remains usable.
```

## 11.5 Degrade acceptance

Test:

```text
Degrade Mix: 10%, 25%, 50%, 75%, 100%
Age/Generation/Alias/Corrosion/Wear: low, medium, high
Character off
Character Shallow on at 50%
```

Pass criteria:

```text
- Low Degrade mix does not immediately hit extreme wow/flutter.
- Damage/failure range is staged across the knob.
- Media events sound like brief generation-loss instability, not digital clicks.
- Dithered quantization has less static harshness.
- Character + Degrade does not collapse into one extreme motion state.
```

## 11.6 Compressor acceptance

Test:

```text
Studio Clear
Clarity
Glue
High input level
Low input level
Noise-heavy Degrade signal
```

Pass criteria:

```text
- Studio Clear: 1–4 dB typical gain reduction.
- Clarity: more presence without obvious hiss lift.
- Glue: smoother broadband control.
- Detector no longer feels peak-only/grabby.
- Generated Degrade noise is not pumped by the compressor.
```

## 11.7 CPU acceptance

Measure CPU before and after.

Expected CPU impact:

```text
- No/low CPU patches: near zero.
- Cubic delay: moderate increase when Character is active.
- Allpass diffusion: moderate increase only when active.
- Media profile EQ/events: low to moderate when Degrade active.
- RMS detector/clarity lift: low to moderate when end compressor active.
- 2-band clarity comp: moderate only when enabled.
- Saturation smoothing: only when existing saturation oversampling branch is active.
```

Pass criteria:

```text
- Idle/bypass CPU unchanged.
- Character active CPU increase acceptable.
- Degrade active CPU increase acceptable.
- End compressor active CPU increase acceptable.
- No unexpected CPU increase when engines are disabled.
```

---

# Recommended commit order

1. `dynamics: append hidden quality params`
2. `dynamics: split degrade color motion failure mappings`
3. `character: add comb-safe delay floor and reduce shallow delay depth`
4. `character: use cubic delay interpolation`
5. `character: enable wet allpass diffusion`
6. `character-degrade: prevent motion blend saturation`
7. `degrade: add dithered quantization`
8. `degrade: add media event failures`
9. `degrade: add media profile eq`
10. `compressor: add rms peak detector blend`
11. `compressor: add post-compressor clarity lift and move generated noise`
12. `compressor: add optional 2-band clarity mode`
13. `saturation: smooth oversampled master saturation path`
14. `dynamics: final tuning and validation`

---

# Final tuning constants to start with

Use these exact initial values:

```text
Character mixed dry/wet minimum delay: 10.5 ms
Character full-wet minimum delay:       3.0 ms
Character maximum delay:                75 ms

Shallow random delay depth:
  base:      0.00080
  depth:     0.00560
  rate:      0.00065
  BBD color: 0.00140

Allpass A:
  frequency: 420 + shallow*480 + abyss*620 + depth*420 + age*180
  Q cap:     0.95

Allpass B:
  frequency: 1450 + shallow*1850 + abyss*1250 + depth*950 + age*360
  Q cap:     0.85

Degrade event:
  rate:      0.015–1.165 Hz
  duration:  35–180 ms
  max dip:   about -12 dB
  event LP:  about 650 Hz to 8.25 kHz

Compressor RMS:
  RMS time:  10 ms

Clarity lift:
  HP:        2.8 kHz
  max boost: +5 dB
  attack:   26 ms
  release:  160 ms

2-band clarity comp:
  split:     170 Hz
  low:       -24 dB, 6 dB knee, 2.6:1, 32 ms attack, 220 ms release
  high:      -28 dB, 8 dB knee, 1.45:1, 14 ms attack, 120 ms release
```

# Kessho Dynamics Quality Pass — UI Exposure Addendum

This addendum updates the earlier Dynamics quality plan. It supersedes any instruction that says the new HQ, clarity, or 2-band behavior should stay hidden. The rule is now:

> Any behavior that changes sound because of a preset/mode choice or user-adjustable setting must be represented in `SliderState`, saved in presets, exposed in the Dynamics UI, and reflected in the visualizers where useful.

Pure corrective safety behavior may remain internal only if it has no user-facing tonal identity. For this pass, expose the Character anti-comb protection because it directly affects the Shallow/Character sound.

---

## Files to update

Primary UI/state files:

```text
src/ui/state.ts
src/ui/dynamics/DynamicsPage.tsx
src/ui/dynamics/dynamicsControlSchema.ts
src/ui/dynamics/dynamicsPresets.ts
src/ui/dynamics/DynamicsVisualizers.tsx
src/ui/dynamics/dynamics.css
src/ui/sliderHelpCatalog.ts
src/ui/buttonHelpCatalog.ts
src/audio/dynamicsModel.ts
src/audio/engineSharedTypes.ts
```

Primary Product Core / DSP files:

```text
cpp/KesshoCore/src/product/ProductDynamicsConstants.h
cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp
wasm/dynamics-drift/kessho_dynamics_drift.cpp
wasm/dynamics-drift/kessho_dynamics_drift.h
wasm/dynamics-degrade/kessho_dynamics_degrade.cpp
```

Also grep for generated/schema/state-sync paths before implementation:

```bash
grep -R "endCompProgramRelease" -n src cpp wasm public | head -100
grep -R "DynamicsWorkletVisualTelemetry" -n src cpp wasm public
grep -R "KESSHO_DYNAMICS_DRIFT_PARAM_COUNT" -n cpp wasm public
grep -R "KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT" -n cpp wasm public
grep -R "DYNAMICS_END_CHAIN_PRESET_KEYS" -n src
```

---

# Replacement Phase 1 — Add user-facing state, not hidden-only params

## 1.1 Add `SliderState` fields

In `src/ui/state.ts`, add these fields near the existing Dynamics section, close to `driftMode`, `erosionMix`, `endCompProgramRelease`, and `dynamicsSaturationMode`.

```ts
// Character quality / protection
driftQuality: 'eco' | 'balanced' | 'hq';
driftAntiComb: number;      // 0..1, default 1.0
driftDiffusion: number;     // 0..1, default 0.55

// Degrade quality / media behavior
erosionQuality: 'classic' | 'media' | 'hq';
erosionEventAmount: number;     // 0..1, default 0.45
erosionProfileAmount: number;   // 0..1, default 0.65
erosionDitherAmount: number;    // 0..1, default 0.55

// End compressor mode / clarity behavior
endCompMode: 'studioClear' | 'clarity' | 'glue' | 'punch' | 'twoBand';
endCompPeakBlend: number;       // 0..1, default 0.25. 0 = RMS, 1 = peak
endCompClarity: number;         // 0..1, default 0.22
endCompTwoBandAmount: number;   // 0..1, default 0.0. Used mostly by twoBand mode
endCompBandSplit: number;       // 0..1 log-mapped to 90..320 Hz, default 0.50 ≈ 170 Hz

// Saturation quality / antialias behavior
dynamicsSaturationQuality: 'eco' | 'smooth' | 'hq';
```

## 1.2 Add defaults

Add defaults to `DEFAULT_STATE` or the current equivalent default object.

```ts
driftQuality: 'balanced',
driftAntiComb: 1.0,
driftDiffusion: 0.55,

erosionQuality: 'media',
erosionEventAmount: 0.45,
erosionProfileAmount: 0.65,
erosionDitherAmount: 0.55,

endCompMode: 'studioClear',
endCompPeakBlend: 0.25,
endCompClarity: 0.22,
endCompTwoBandAmount: 0.0,
endCompBandSplit: 0.50,

dynamicsSaturationQuality: 'smooth',
```

## 1.3 Add preset/backward compatibility migration

In `src/audio/dynamicsModel.ts`, add a helper that fills missing fields when loading older presets.

```ts
export function normalizeDynamicsQualityFields<T extends Record<string, unknown>>(data: T): T {
  return {
    driftQuality: 'balanced',
    driftAntiComb: 1.0,
    driftDiffusion: 0.55,
    erosionQuality: 'media',
    erosionEventAmount: 0.45,
    erosionProfileAmount: 0.65,
    erosionDitherAmount: 0.55,
    endCompMode: 'studioClear',
    endCompPeakBlend: 0.25,
    endCompClarity: 0.22,
    endCompTwoBandAmount: 0.0,
    endCompBandSplit: 0.50,
    dynamicsSaturationQuality: 'smooth',
    ...data,
  } as T;
}
```

In `DynamicsPage.tsx`, where `makeSubsetPresetOptions(...)` already calls `normalizeDynamicsErosionAliases(data)`, wrap with the new helper:

```ts
const normalizedData = normalizeDynamicsQualityFields(
  normalizeDynamicsErosionAliases(data),
);
```

If there are full-preset restore paths outside `DynamicsPage.tsx`, grep for `normalizeDynamicsErosionAliases` and use the new quality migration there too.

---

# Replacement Phase 2 — Expose the new worklet params clearly

Do not call these hidden params in comments. They are low-level worklet params driven by user-visible UI state.

## 2.1 Replace the previous appended param list

In `cpp/KesshoCore/src/product/ProductDynamicsConstants.h`, append after `kDynEndCompProgramRelease = 81`:

```cpp
  kDynDriftQuality = 82,
  kDynDriftAntiComb = 83,
  kDynDriftDiffusion = 84,

  kDynErosionUiMix = 85,
  kDynErosionColorInfluence = 86,
  kDynErosionMotionInfluence = 87,
  kDynErosionFailureInfluence = 88,
  kDynErosionQuality = 89,
  kDynErosionEventAmount = 90,
  kDynErosionProfileAmount = 91,
  kDynErosionDitherAmount = 92,

  kDynEndCompMode = 93,
  kDynEndCompPeakBlend = 94,
  kDynEndCompClarity = 95,
  kDynEndCompTwoBandAmount = 96,
  kDynEndCompBandSplitHz = 97,

  kDynMasterSatQuality = 98,
```

Expected param count: `99` because indices are `0..98`.

## 2.2 Update the worklet enum

In `wasm/dynamics-drift/kessho_dynamics_drift.cpp`, append matching values after `P_END_COMP_PROGRAM_RELEASE`:

```cpp
  P_CHARACTER_QUALITY,
  P_CHARACTER_ANTI_COMB,
  P_CHARACTER_DIFFUSION,

  P_EROSION_UI_MIX,
  P_EROSION_COLOR_INFLUENCE,
  P_EROSION_MOTION_INFLUENCE,
  P_EROSION_FAILURE_INFLUENCE,
  P_EROSION_QUALITY,
  P_EROSION_EVENT_AMOUNT,
  P_EROSION_PROFILE_AMOUNT,
  P_EROSION_DITHER_AMOUNT,

  P_END_COMP_MODE,
  P_END_COMP_PEAK_BLEND,
  P_END_COMP_CLARITY,
  P_END_COMP_TWO_BAND_AMOUNT,
  P_END_COMP_BAND_SPLIT_HZ,

  P_MASTER_SAT_QUALITY,
```

Update every `KESSHO_DYNAMICS_DRIFT_PARAM_COUNT` definition to `99`.

## 2.3 Map UI state to params in `ProductDynamicsConfig.cpp`

Add these helpers if missing:

```cpp
static float smoothstep01(float x) {
  x = clampFloat(x, 0.0f, 1.0f);
  return x * x * (3.0f - 2.0f * x);
}

static float unitToLogFrequency(float unit, float min_hz, float max_hz) {
  const float u = clampFloat(unit, 0.0f, 1.0f);
  return std::exp(std::log(min_hz) + u * (std::log(max_hz) - std::log(min_hz)));
}
```

Map string/select state to numeric params:

```cpp
const float character_quality =
    fx.character_quality == CharacterQuality::Eco ? 0.0f :
    fx.character_quality == CharacterQuality::Hq ? 2.0f : 1.0f;

const float erosion_quality =
    fx.erosion_quality == DegradeQuality::Classic ? 0.0f :
    fx.erosion_quality == DegradeQuality::Hq ? 2.0f : 1.0f;

const float end_comp_mode =
    fx.end_comp_mode == EndCompMode::Clarity ? 1.0f :
    fx.end_comp_mode == EndCompMode::Glue ? 2.0f :
    fx.end_comp_mode == EndCompMode::Punch ? 3.0f :
    fx.end_comp_mode == EndCompMode::TwoBand ? 4.0f : 0.0f;

const float master_sat_quality =
    fx.dynamics_saturation_quality == DynamicsSaturationQuality::Eco ? 0.0f :
    fx.dynamics_saturation_quality == DynamicsSaturationQuality::Hq ? 2.0f : 1.0f;
```

Then assign:

```cpp
params[kDynDriftQuality] = character_quality;
params[kDynDriftAntiComb] = unit(fx.character_anti_comb);
params[kDynDriftDiffusion] = unit(fx.character_diffusion);

params[kDynErosionUiMix] = degrade_mix;
params[kDynErosionColorInfluence] = degrade_color_influence;
params[kDynErosionMotionInfluence] = degrade_motion_influence;
params[kDynErosionFailureInfluence] = degrade_failure_influence;
params[kDynErosionQuality] = erosion_quality;
params[kDynErosionEventAmount] = unit(fx.erosion_event_amount);
params[kDynErosionProfileAmount] = unit(fx.erosion_profile_amount);
params[kDynErosionDitherAmount] = unit(fx.erosion_dither_amount);

params[kDynEndCompMode] = end_comp_mode;
params[kDynEndCompPeakBlend] = unit(fx.end_comp_peak_blend);
params[kDynEndCompClarity] = unit(fx.end_comp_clarity);
params[kDynEndCompTwoBandAmount] =
    fx.end_comp_mode == EndCompMode::TwoBand ? unit(fx.end_comp_two_band_amount) : 0.0f;
params[kDynEndCompBandSplitHz] = unitToLogFrequency(fx.end_comp_band_split, 90.0f, 320.0f);

params[kDynMasterSatQuality] = master_sat_quality;
```

Important: mode buttons should apply preset values once in the UI. Do not make `ProductDynamicsConfig.cpp` silently overwrite threshold/ratio/attack/release on every render based only on `endCompMode`, because users must be able to tweak after selecting a mode.

---

# Phase 12 — UI exposure and visualizer implementation

Append this phase after the previous DSP phases.

## 12.1 Update control schema

File:

```text
src/ui/dynamics/dynamicsControlSchema.ts
```

Add separate control arrays so the page can group the new controls near the right engines.

```ts
export const DYNAMICS_DRIFT_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('driftAntiComb', 'Comb Protect'),
  dynamicsSlider('driftDiffusion', 'Diffusion'),
];

export const DYNAMICS_DEGRADE_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('erosionEventAmount', 'Events'),
  dynamicsSlider('erosionProfileAmount', 'Profile'),
  dynamicsSlider('erosionDitherAmount', 'Dither'),
];

export const DYNAMICS_END_CHAIN_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('endCompPeakBlend', 'Peak/RMS'),
  dynamicsSlider('endCompClarity', 'Clarity'),
  dynamicsSlider('endCompTwoBandAmount', '2-Band'),
  dynamicsSlider('endCompBandSplit', 'Band Split'),
];
```

Keep the existing arrays intact. Add these new arrays in addition to the existing `DYNAMICS_DRIFT_CONTROLS`, `DYNAMICS_DEGRADE_CONTROLS`, and `DYNAMICS_END_CHAIN_CONTROLS`.

## 12.2 Update Dynamics preset keys

File:

```text
src/ui/dynamics/dynamicsPresets.ts
```

Add the new state keys to the appropriate subset preset arrays.

```ts
// Character preset keys
'driftQuality',
'driftAntiComb',
'driftDiffusion',

// Degrade preset keys
'erosionQuality',
'erosionEventAmount',
'erosionProfileAmount',
'erosionDitherAmount',

// End-chain preset keys
'endCompMode',
'endCompPeakBlend',
'endCompClarity',
'endCompTwoBandAmount',
'endCompBandSplit',

// Saturation preset keys
'dynamicsSaturationQuality',
```

Acceptance requirement: saving/loading a Character-only preset must restore Character quality, Comb Protect, and Diffusion. Saving/loading an End Chain preset must restore Studio/Clarity/Glue/Punch/2-Band mode and all clarity/2-band values.

## 12.3 Add select/mode options to `DynamicsPage.tsx`

File:

```text
src/ui/dynamics/DynamicsPage.tsx
```

Add option arrays near the existing `CHARACTER_MODE_OPTIONS` and `SAT_MODE_OPTIONS`.

```ts
const CHARACTER_QUALITY_OPTIONS: Array<{ value: SliderState['driftQuality']; label: string }> = [
  { value: 'eco', label: 'Eco' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'hq', label: 'HQ' },
];

const EROSION_QUALITY_OPTIONS: Array<{ value: SliderState['erosionQuality']; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'media', label: 'Media' },
  { value: 'hq', label: 'HQ' },
];

const END_COMP_MODE_OPTIONS: Array<{ value: SliderState['endCompMode']; label: string }> = [
  { value: 'studioClear', label: 'Studio' },
  { value: 'clarity', label: 'Clarity' },
  { value: 'glue', label: 'Glue' },
  { value: 'punch', label: 'Punch' },
  { value: 'twoBand', label: '2-Band' },
];

const SAT_QUALITY_OPTIONS: Array<{ value: SliderState['dynamicsSaturationQuality']; label: string }> = [
  { value: 'eco', label: 'Eco' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'hq', label: 'HQ' },
];
```

## 12.4 Add mode preset application for compressor

Add this map in `DynamicsPage.tsx`:

```ts
const END_COMP_MODE_PRESETS: Record<SliderState['endCompMode'], Partial<SliderState>> = {
  studioClear: {
    endCompThreshold: -22,
    endCompKnee: 8,
    endCompRatio: 2.6,
    endCompAttackMs: 18,
    endCompReleaseMs: 160,
    endCompMakeup: 1,
    endCompMix: 0.78,
    endCompDetectorHp: 0.62,
    endCompDetectorTilt: 0.65,
    endCompAutoMakeup: 0.65,
    endCompProgramRelease: 0.70,
    endCompPeakBlend: 0.25,
    endCompClarity: 0.22,
    endCompTwoBandAmount: 0.0,
    endCompBandSplit: 0.50,
  },
  clarity: {
    endCompThreshold: -26,
    endCompKnee: 10,
    endCompRatio: 2.2,
    endCompAttackMs: 24,
    endCompReleaseMs: 120,
    endCompMakeup: 1,
    endCompMix: 0.68,
    endCompDetectorHp: 0.70,
    endCompDetectorTilt: 0.78,
    endCompAutoMakeup: 0.55,
    endCompProgramRelease: 0.80,
    endCompPeakBlend: 0.30,
    endCompClarity: 0.30,
    endCompTwoBandAmount: 0.0,
    endCompBandSplit: 0.50,
  },
  glue: {
    endCompThreshold: -18,
    endCompKnee: 6,
    endCompRatio: 1.8,
    endCompAttackMs: 30,
    endCompReleaseMs: 220,
    endCompMakeup: 1,
    endCompMix: 0.85,
    endCompDetectorHp: 0.54,
    endCompDetectorTilt: 0.45,
    endCompAutoMakeup: 0.45,
    endCompProgramRelease: 0.65,
    endCompPeakBlend: 0.15,
    endCompClarity: 0.10,
    endCompTwoBandAmount: 0.0,
    endCompBandSplit: 0.50,
  },
  punch: {
    endCompThreshold: -20,
    endCompKnee: 5,
    endCompRatio: 3.2,
    endCompAttackMs: 32,
    endCompReleaseMs: 95,
    endCompMakeup: 1,
    endCompMix: 0.72,
    endCompDetectorHp: 0.62,
    endCompDetectorTilt: 0.55,
    endCompAutoMakeup: 0.50,
    endCompProgramRelease: 0.45,
    endCompPeakBlend: 0.45,
    endCompClarity: 0.16,
    endCompTwoBandAmount: 0.0,
    endCompBandSplit: 0.50,
  },
  twoBand: {
    endCompThreshold: -24,
    endCompKnee: 8,
    endCompRatio: 2.2,
    endCompAttackMs: 24,
    endCompReleaseMs: 160,
    endCompMakeup: 1,
    endCompMix: 0.76,
    endCompDetectorHp: 0.62,
    endCompDetectorTilt: 0.65,
    endCompAutoMakeup: 0.50,
    endCompProgramRelease: 0.70,
    endCompPeakBlend: 0.25,
    endCompClarity: 0.24,
    endCompTwoBandAmount: 0.70,
    endCompBandSplit: 0.50,
  },
};
```

Add a handler:

```ts
const applyEndCompMode = useCallback((mode: SliderState['endCompMode']) => {
  const preset = END_COMP_MODE_PRESETS[mode];
  if (onStateChange) {
    onStateChange((current) => ({
      ...current,
      dynamicsEnabled: true,
      endCompEnabled: true,
      endCompMode: mode,
      ...preset,
    }));
    return;
  }

  onSelectChange('dynamicsEnabled', true);
  onSelectChange('endCompEnabled', true);
  onSelectChange('endCompMode', mode);
  for (const [key, value] of Object.entries(preset) as Array<[keyof SliderState, SliderState[keyof SliderState]]>) {
    if (typeof value === 'number') onParamChange(key, value);
    else onSelectChange(key, value);
  }
}, [onParamChange, onSelectChange, onStateChange]);
```

Important: after applying the preset, users must be able to freely edit threshold/ratio/attack/release/etc. Do not reapply the preset every render.

## 12.5 Render new UI rows

In the Character card, render quality buttons after the Clean/Abyss/Shallow mode row:

```tsx
<div className="dynamics-mode-row" aria-label="Character quality">
  {CHARACTER_QUALITY_OPTIONS.map((option) => (
    <button
      key={option.value}
      type="button"
      className={state.driftQuality === option.value ? 'active' : ''}
      onClick={() => onSelectChange('driftQuality', option.value)}
      {...bindHelp(`driftQuality_${option.value}`, { label: option.label, page: 'dynamics' })}
    >
      {option.label}
    </button>
  ))}
</div>

{DYNAMICS_DRIFT_QUALITY_CONTROLS.map(renderDynamicsSlider)}
```

In the Degrade card, render quality buttons before the existing Degrade sliders:

```tsx
<div className="dynamics-mode-row" aria-label="Degrade quality">
  {EROSION_QUALITY_OPTIONS.map((option) => (
    <button
      key={option.value}
      type="button"
      className={state.erosionQuality === option.value ? 'active' : ''}
      onClick={() => onSelectChange('erosionQuality', option.value)}
      {...bindHelp(`erosionQuality_${option.value}`, { label: option.label, page: 'dynamics' })}
    >
      {option.label}
    </button>
  ))}
</div>

{DYNAMICS_DEGRADE_QUALITY_CONTROLS.map(renderDynamicsSlider)}
{DYNAMICS_DEGRADE_CONTROLS.map(renderDynamicsSlider)}
```

In the End Chain card, render mode buttons before the existing compressor controls:

```tsx
<div className="dynamics-mode-row" aria-label="End compressor mode">
  {END_COMP_MODE_OPTIONS.map((option) => (
    <button
      key={option.value}
      type="button"
      className={state.endCompMode === option.value ? 'active' : ''}
      onClick={() => applyEndCompMode(option.value)}
      {...bindHelp(`endCompMode_${option.value}`, { label: option.label, page: 'dynamics' })}
    >
      {option.label}
    </button>
  ))}
</div>

{DYNAMICS_END_CHAIN_CONTROLS.map(renderDynamicsSlider)}
{DYNAMICS_END_CHAIN_QUALITY_CONTROLS.map((control) => {
  if (control.key === 'endCompTwoBandAmount' && state.endCompMode !== 'twoBand') return null;
  if (control.key === 'endCompBandSplit' && state.endCompMode !== 'twoBand') return null;
  return renderDynamicsSlider(control);
})}
```

In the Saturation card, render quality buttons after Tape/Tube/Diode/Fold:

```tsx
<div className="dynamics-mode-row" aria-label="Saturation quality">
  {SAT_QUALITY_OPTIONS.map((option) => (
    <button
      key={option.value}
      type="button"
      className={state.dynamicsSaturationQuality === option.value ? 'active' : ''}
      onClick={() => onSelectChange('dynamicsSaturationQuality', option.value)}
      {...bindHelp(`dynamicsSaturationQuality_${option.value}`, { label: option.label, page: 'dynamics' })}
    >
      {option.label}
    </button>
  ))}
</div>
```

## 12.6 Update help catalogs

Files:

```text
src/ui/sliderHelpCatalog.ts
src/ui/buttonHelpCatalog.ts
```

Add help copy:

```text
driftQuality: Eco uses the lightest Character processing, Balanced uses smoother delay reads and diffusion, HQ adds extra decorrelation for the smoothest motion.
driftAntiComb: Raises the mixed dry/wet delay floor to reduce flanger-like airplane sweeps.
driftDiffusion: Adds wet-path phase diffusion/decorrelation so chorus movement feels less like a comb filter.

erosionQuality: Classic keeps the old simpler damage behavior, Media adds generation-loss style events/profile/dither, HQ increases smoothing/detail.
erosionEventAmount: Controls brief media-style dips, tone collapses, and unstable failure events.
erosionProfileAmount: Controls the added media body/notch profile EQ.
erosionDitherAmount: Softens static quantization artifacts in the degrade engine.

endCompMode: Chooses the compressor behavior: Studio, Clarity, Glue, Punch, or 2-Band.
endCompPeakBlend: Blends RMS-style detection toward peak-style detection.
endCompClarity: Adds post-compressor high-band upward clarity without lifting silence.
endCompTwoBandAmount: Blends in the 2-band clarity compressor.
endCompBandSplit: Sets the low/high split for 2-band compression.

dynamicsSaturationQuality: Controls saturation antialias/smoothing quality.
```

## 12.7 Update visual telemetry types

File:

```text
src/audio/engineSharedTypes.ts
```

Extend `DynamicsWorkletVisualTelemetry`:

```ts
driftCombRisk: number;
driftMinDelayMs: number;
driftDiffusion: number;

degradeEventEnv: number;
degradeEventGainDb: number;
erosionProfileAmount: number;

endLowReductionDb: number;
endHighReductionDb: number;
endClarityBoostDb: number;
endBandSplitHz: number;
endCompMode: number;

masterSatOversamplingFactor: number;
```

Extend fallback values wherever `EMPTY_DYNAMICS_TELEMETRY` or worklet telemetry defaults are defined:

```ts
driftCombRisk: 0,
driftMinDelayMs: 0,
driftDiffusion: 0,
degradeEventEnv: 0,
degradeEventGainDb: 0,
erosionProfileAmount: 0,
endLowReductionDb: 0,
endHighReductionDb: 0,
endClarityBoostDb: 0,
endBandSplitHz: 170,
endCompMode: 0,
masterSatOversamplingFactor: 1,
```

## 12.8 Extend DSP telemetry enum/count

In `wasm/dynamics-drift/kessho_dynamics_drift.cpp`, append telemetry indices after `T_END_DETECTOR_DB`:

```cpp
  T_CHARACTER_COMB_RISK,
  T_CHARACTER_MIN_DELAY_MS,
  T_CHARACTER_DIFFUSION,

  T_EROSION_EVENT_ENV,
  T_EROSION_EVENT_GAIN_DB,
  T_EROSION_PROFILE_AMOUNT,

  T_END_LOW_GR_DB,
  T_END_HIGH_GR_DB,
  T_END_CLARITY_BOOST_DB,
  T_END_BAND_SPLIT_HZ,
  T_END_COMP_MODE,

  T_MASTER_SAT_OVERSAMPLING_FACTOR,
```

Current telemetry indices are `0..9`. New telemetry count should be `22` if exactly the 12 values above are appended.

Update every `KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT` definition to `22`.

Write telemetry during processing:

```cpp
g.telemetry[T_CHARACTER_COMB_RISK] = comb_risk;
g.telemetry[T_CHARACTER_MIN_DELAY_MS] = min_delay_s * 1000.0f;
g.telemetry[T_CHARACTER_DIFFUSION] = clamp01(p[P_CHARACTER_DIFFUSION]);

g.telemetry[T_EROSION_EVENT_ENV] = g.media_event_env;
g.telemetry[T_EROSION_EVENT_GAIN_DB] = media_event_gain_db;
g.telemetry[T_EROSION_PROFILE_AMOUNT] = clamp01(p[P_EROSION_PROFILE_AMOUNT]);

g.telemetry[T_END_LOW_GR_DB] = two_band_low_gr_db;
g.telemetry[T_END_HIGH_GR_DB] = two_band_high_gr_db;
g.telemetry[T_END_CLARITY_BOOST_DB] = clarity_boost_db;
g.telemetry[T_END_BAND_SPLIT_HZ] = p[P_END_COMP_BAND_SPLIT_HZ];
g.telemetry[T_END_COMP_MODE] = p[P_END_COMP_MODE];

g.telemetry[T_MASTER_SAT_OVERSAMPLING_FACTOR] = static_cast<float>(factor);
```

If a value is not active in the current mode, write `0.0f` except `T_END_BAND_SPLIT_HZ`, which should remain the mapped split frequency.

## 12.9 Wire telemetry into JS snapshot

Find the worklet telemetry unpacking code with:

```bash
grep -R "endDetectorDb" -n src public wasm cpp
grep -R "endReductionDb" -n src public wasm cpp
```

Add the new fields to the JS/TS object so `DynamicsVisualizers.tsx` can read them from:

```ts
const telemetry = getDynamicsTelemetry?.().worklet;
```

Acceptance requirement: `DynamicsVisualTelemetrySnapshot.worklet` contains the new values while the Character worklet is active, and defaults are safe when worklet telemetry is unavailable.

## 12.10 Update `DynamicsVisualizers.tsx`

File:

```text
src/ui/dynamics/DynamicsVisualizers.tsx
```

### Character visualizer

Add a compact quality/protection overlay:

```text
- Comb Protect meter: uses `worklet.driftCombRisk`.
- Min Delay label: uses `worklet.driftMinDelayMs`; fallback computes 3.0..10.5 ms from state.driftAntiComb and mix.
- Quality badge: Eco / Balanced / HQ.
- Diffusion ring/bar: uses state.driftDiffusion or telemetry.driftDiffusion.
```

Draw text labels:

```text
PROTECT 0–100%
MIN 3.0–10.5ms
HQ / BAL / ECO
```

Acceptance: at Character Mix 50%, Shallow mode, `Comb Protect` should visibly rise and Min Delay should read near 10.5 ms when `driftAntiComb = 1.0`.

### Degrade visualizer

Add media-event and profile panels:

```text
- Event envelope pulse: `worklet.degradeEventEnv`.
- Event gain dip meter: `worklet.degradeEventGainDb`.
- Profile EQ mini curve: low body bump around 180–300 Hz and notch around 2.6–4.9 kHz, scaled by `erosionProfileAmount`.
- Quality badge: Classic / Media / HQ.
- Dither indicator: state.erosionDitherAmount.
```

Acceptance: with Degrade Events high, visualizer should show occasional pulses matching audible media dips.

### Compressor visualizer

When `state.endCompMode !== 'twoBand'`, keep the existing broadband compressor display and add:

```text
- RMS/Peak blend indicator from state.endCompPeakBlend.
- Clarity lift meter from worklet.endClarityBoostDb.
- Mode badge: Studio / Clarity / Glue / Punch.
```

When `state.endCompMode === 'twoBand'`, add a 2-band view:

```text
- Vertical split marker labeled with `worklet.endBandSplitHz` or mapped fallback from `state.endCompBandSplit`.
- Low-band gain-reduction meter from `worklet.endLowReductionDb`.
- High-band gain-reduction meter from `worklet.endHighReductionDb`.
- Clarity boost overlay from `worklet.endClarityBoostDb`.
- 2-Band Amount indicator from `state.endCompTwoBandAmount`.
```

Fallback split mapping in TS:

```ts
const bandSplitHz = fromLogNorm(state.endCompBandSplit, 90, 320);
```

Draw labels:

```text
LOW GR
HIGH GR
SPLIT 170Hz
CLARITY +XdB
```

Acceptance: moving `Band Split` should move the vertical split marker; changing 2-Band Amount should visibly change the band overlay intensity.

### Saturation visualizer

Add a quality badge:

```text
ECO / SMOOTH / HQ
1x / 2x / 4x if telemetry.masterSatOversamplingFactor is available
```

Acceptance: increasing Drive past the current oversampling thresholds should update the factor display.

## 12.11 Update `dynamics.css`

Add or reuse existing button-row styles. If no generic row exists, add:

```css
.dynamics-mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.5rem 0 0.75rem;
}

.dynamics-mode-row button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 0.32rem 0.62rem;
  background: rgba(255, 255, 255, 0.045);
  color: rgba(235, 241, 248, 0.78);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}

.dynamics-mode-row button.active {
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.96);
  border-color: rgba(255, 255, 255, 0.32);
}

.dynamics-quality-note {
  font-size: 0.72rem;
  color: rgba(235, 241, 248, 0.58);
  margin-top: -0.3rem;
  margin-bottom: 0.55rem;
}
```

Do not introduce a new visual language. Match existing Dynamics styling.

---

# Replacement DSP behavior tied to UI controls

## Character

Use these mappings in `kessho_dynamics_drift.cpp`:

```cpp
const float quality = p[P_CHARACTER_QUALITY];
const float anti_comb = clamp01(p[P_CHARACTER_ANTI_COMB]);
const float diffusion = clamp01(p[P_CHARACTER_DIFFUSION]);

const bool use_cubic_delay = quality >= 1.0f;
const bool use_microtap = quality >= 2.0f && diffusion > 0.001f;
const bool use_allpass = diffusion > 0.001f && comb_risk > 0.18f;

const float min_delay_s =
    kCharacterFullWetMinDelayS +
    (kCharacterMixedMinDelayS - kCharacterFullWetMinDelayS) * comb_risk * anti_comb;
```

Apply the reduced Shallow random delay depth with anti-comb as a blend, not a hard replacement:

```cpp
const float shallow_depth_scale = 1.0f - anti_comb * 0.46f;
```

If this scale is easier to apply in `ProductDynamicsConfig.cpp`, apply it there when computing `random_delay_depth`.

## Degrade

Use these mappings:

```cpp
const float erosion_quality = p[P_EROSION_QUALITY];
const float erosion_events = clamp01(p[P_EROSION_EVENT_AMOUNT]);
const float erosion_profile = clamp01(p[P_EROSION_PROFILE_AMOUNT]);
const float erosion_dither = clamp01(p[P_EROSION_DITHER_AMOUNT]);

const bool use_media_events = erosion_quality >= 1.0f && erosion_events > 0.001f;
const bool use_profile_eq = erosion_quality >= 1.0f && erosion_profile > 0.001f;
const bool use_dither = erosion_quality >= 1.0f && erosion_dither > 0.001f;
```

Scale event amount:

```cpp
const float event_amount = clamp01(
    p[P_EROSION_FAILURE_INFLUENCE] * erosion_events *
    (0.35f +
     p[P_EROSION_CORROSION] * 0.35f +
     p[P_EROSION_GENERATION] * 0.20f +
     p[P_EROSION_WEAR] * 0.10f));
```

Scale dither:

```cpp
const float dither_amt =
    lsb * erosion_dither *
    (0.18f + generation * 0.42f + corrosion * 0.20f) *
    (1.0f - destructive * 0.35f);
```

Scale profile EQ gain by `erosion_profile`.

## Compressor

Use these mappings:

```cpp
const int mode = static_cast<int>(std::round(p[P_END_COMP_MODE]));
const float peak_blend = clamp01(p[P_END_COMP_PEAK_BLEND]);
const float clarity = clamp01(p[P_END_COMP_CLARITY]);
const float two_band_amount = clamp01(p[P_END_COMP_TWO_BAND_AMOUNT]);
const float split_hz = clampf(p[P_END_COMP_BAND_SPLIT_HZ], 90.0f, 320.0f);

const bool two_band_active = mode == 4 && two_band_amount > 0.001f;
```

`endCompMode` selects UI defaults and visual identity. Do not let the DSP override user threshold/ratio/attack/release after the UI has set them.

## Saturation

Use:

```cpp
const float sat_quality = p[P_MASTER_SAT_QUALITY];
const bool smooth_aa = sat_quality >= 1.0f;
const bool hq_aa = sat_quality >= 2.0f;
```

Mapping:

```text
Eco:    keep current factor thresholds and no extra smoothing.
Smooth: use the improved filtered oversampled branch when existing factor > 1.
HQ:     enter 2x filtered branch slightly earlier, e.g. drive > 0.12 instead of 0.18.
```

---

# UI validation checklist

## Preset/state validation

```text
- New fields exist in SliderState.
- New fields have DEFAULT_STATE values.
- Old presets load without undefined values.
- Full Dynamics preset save/restore includes all new fields.
- Character-only preset includes Character Quality, Comb Protect, Diffusion.
- Degrade-only preset includes Degrade Quality, Events, Profile, Dither.
- End Chain preset includes Mode, Peak/RMS, Clarity, 2-Band Amount, Band Split.
- Saturation preset includes Saturation Quality.
```

## UI validation

```text
- Character panel shows Eco/Balanced/HQ.
- Character panel shows Comb Protect and Diffusion sliders.
- Degrade panel shows Classic/Media/HQ.
- Degrade panel shows Events, Profile, Dither sliders.
- End Chain panel shows Studio/Clarity/Glue/Punch/2-Band.
- Selecting an End Chain mode applies the recommended compressor settings once.
- Users can tweak compressor sliders after selecting a mode.
- 2-Band Amount and Band Split only show when End Chain mode is 2-Band.
- Saturation panel shows Eco/Smooth/HQ.
```

## Visualizer validation

```text
- Character visualizer shows Comb Protect, min delay, quality, and diffusion.
- Degrade visualizer shows event pulses, profile curve, dither, and quality.
- Compressor visualizer shows RMS/Peak, Clarity, and mode.
- Compressor 2-band mode shows split marker, low GR, high GR, and 2-Band Amount.
- Saturation visualizer shows quality and oversampling factor.
```

## Audio validation

```text
- Character Balanced default removes the airplane/flanger pass at 20–80% mix.
- Character Eco is lighter CPU and may be closer to old behavior, but Comb Protect still defaults on.
- Character HQ sounds smoothest but costs more CPU.
- Degrade Classic preserves old-style behavior as much as practical.
- Degrade Media/HQ adds generation-loss event behavior without clicks.
- Compressor Studio/Clarity/Glue/Punch modes feel distinct.
- 2-Band mode visibly and audibly controls low/high dynamics separately.
- Saturation Smooth/HQ reduces harshness at higher drive.
```

---

# Updated commit order with UI work at the end

1. `dynamics: add ui state for quality modes and compressor modes`
2. `dynamics: append user-visible worklet params for quality controls`
3. `dynamics: migrate old presets for new quality fields`
4. `character: add ui-driven comb protect and quality modes`
5. `character: add cubic delay hq and diffusion amount`
6. `degrade: add ui-driven media quality, events, profile, dither`
7. `compressor: add ui-driven mode, rms peak blend, clarity, two-band amount`
8. `saturation: add ui-driven saturation quality mode`
9. `dynamics-ui: expose quality controls and compressor modes`
10. `dynamics-ui: add help copy for quality controls`
11. `dynamics-telemetry: expose character/degrade/compressor quality telemetry`
12. `dynamics-visualizers: show comb protect media events and 2-band compression`
13. `dynamics: final preset validation and cpu profiling`
