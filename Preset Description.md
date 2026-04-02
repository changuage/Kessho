# Kessho Reverb — Preset Description Guide

All reverb character presets with full parameter listings. Presets are organized into three categories: **Core**, **Extreme/Effect**, and **Experimental (Pleasant)**.

---

## Parameter Reference

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Engine Type** | plate / hall / cathedral / darkHall / dattorroPlate / dattorroShimmer | FDN topology or Dattorro plate algorithm |
| **Decay** | 0–1 | Feedback gain (1.0 = infinite) |
| **Size** | 0.5–10.0 | Delay line length scaling |
| **Diffusion** | 0–1 | Pre/post allpass diffuser density |
| **Modulation** | 0–1 | Per-line chorus depth multiplier |
| **Pre-delay** | 0–500 ms | Gap before reverb onset |
| **Damping** | 0–1 | Legacy high-frequency damping |
| **Width** | 0–1 | Stereo width (mid-side balance) |
| **Shimmer** | 0–1 | Pitch-shifted grain injection level |
| **Shimmer Pitch** | -24–+24 st | Shimmer pitch shift in semitones |
| **Shimmer Feedback** | 0–1 | Shimmer signal fed back into FDN (compound shifting) |
| **Slow Mod Rate** | Hz | Breathing modulation rate |
| **Slow Mod Depth** | 0–1 | Breathing modulation amount |
| **Chorus Rate** | 0.1–2 Hz | Per-delay-line chorus LFO rate |
| **Chorus Depth** | 0–40 smp | Per-delay-line chorus depth |
| **Mod Character** | sine / drift / hybrid | Modulation waveform type |
| **Damp Low** | 0–1 | Low-frequency damping |
| **Damp High** | 0–1 | High-frequency damping |
| **Crossover Freq** | 200–4000 Hz | Low/high damping crossover |
| **Input Tone** | -1–+1 | Pre-filter tilt (-1=dark, +1=bright) |
| **Warp** | 0–1 | Pitch-bend DC offset in feedback |
| **Cross-Feed** | 0–1 | Stereo cross-injection |
| **Early Reflections** | 0–1 | 10-tap sparse ER network level |
| **Air Absorption** | 0–1 | Spectral tilt per recirculation (treble loss) |
| **Saturation Mode** | clean / tape / tube | Nonlinearity character |
| **Freeze** | on/off | Infinite sustain (input muted) |
| **Reverse** | 0–1 | Reverse tail mix |
| **Reverse Length** | s | Reverse grain cycle length |

### Saturation Modes

- **Clean** — Symmetric tanh approximation. Odd harmonics only (3rd, 5th, 7th). Transparent at low levels.
- **Tape** — Asymmetric: tanh base + 2nd harmonic bias (even harmonics). Warm, musical coloration like analog tape.
- **Tube** — Symmetric soft knee: `x / (1+|x|)^0.7`. Gentler onset than tanh, more headroom, odd harmonics only.

---

## Core Presets

### 1. Default
> *Clean ambient cathedral*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.90 |
| Size | 2.0 |
| Diffusion | 1.0 |
| Modulation | 0.40 |
| Pre-delay | 60 ms |
| Damping | 0.20 |
| Width | 0.85 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.05 Hz / 0 depth |
| Chorus | 0.5 Hz / 12 smp |
| Mod Character | Hybrid |
| Damp Low / High | 0.10 / 0.30 |
| Crossover | 800 Hz |
| Input Tone | 0 (flat) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0 |
| Early Reflections | 0.30 |
| Air Absorption | 0.20 |
| Saturation | Clean |

**Design notes:** Neutral starting point. Cathedral topology with full diffusion, moderate decay, no effects. Clean saturation keeps the signal transparent.

---

### 2. Shimmer Pad
> *Octave-up shimmer with long decay and compound feedback*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.95 |
| Size | 2.5 |
| Diffusion | 0.95 |
| Modulation | 0.50 |
| Pre-delay | 40 ms |
| Damping | 0.15 |
| Width | 0.95 |
| Shimmer | 0.45 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.03 Hz / 0.20 depth |
| Chorus | 0.7 Hz / 18 smp |
| Mod Character | Sine |
| Damp Low / High | 0.05 / 0.20 |
| Crossover | 1200 Hz |
| Input Tone | +0.2 (bright) |
| Shimmer Feedback | 0.35 |
| Warp | 0 |
| Cross-Feed | 0.15 |
| Early Reflections | 0.20 |
| Air Absorption | 0.15 |
| Saturation | Clean |

**Design notes:** Octave-up shimmer at 45% with compound feedback (35%) creates cascading pitch layers. Sine modulation keeps chorus smooth. Bright input tone feeds shimmer harmonics.

---

### 3. Tight Plate
> *Short bright plate — no effects*

| Parameter | Value |
|-----------|-------|
| Engine | Plate |
| Decay | 0.50 |
| Size | 0.7 |
| Diffusion | 0.70 |
| Modulation | 0.15 |
| Pre-delay | 10 ms |
| Damping | 0.40 |
| Width | 0.60 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.05 Hz / 0 depth |
| Chorus | 1.2 Hz / 5 smp |
| Mod Character | Sine |
| Damp Low / High | 0.20 / 0.50 |
| Crossover | 2000 Hz |
| Input Tone | +0.3 (bright) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0 |
| Early Reflections | 0.50 |
| Air Absorption | 0.10 |
| Saturation | Clean |

**Design notes:** Short, defined plate with strong early reflections (0.50) for room presence. High damping rolls off treble quickly for a natural decay. No shimmer, warp, or effects — pure acoustic plate.

---

### 4. Dattorro Plate
> *Classic Dattorro plate reverb — smooth, defined, musical*

| Parameter | Value |
|-----------|-------|
| Engine | Dattorro Plate |
| Decay | 0.85 |
| Size | 1.0 |
| Diffusion | 0.80 |
| Modulation | 0.30 |
| Pre-delay | 15 ms |
| Damping | 0.30 |
| Width | 0.90 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.05 Hz / 0 depth |
| Chorus | 0.5 Hz / 12 smp |
| Mod Character | Sine |
| Damp Low / High | 0.10 / 0.35 |
| Crossover | 1200 Hz |
| Input Tone | +0.1 (slightly bright) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0 |
| Early Reflections | 0.40 |
| Air Absorption | 0.15 |
| Saturation | Clean |

**Design notes:** Jon Dattorro's classic 1997 plate algorithm. Two cross-coupled tank loops with modulated allpass filters. Clean saturation preserves the defined, musical character. Strong ERs (0.40) give spatial definition.

---

### 5. Dattorro Shimmer
> *Dattorro engine with high diffusion + detuning modulation*

| Parameter | Value |
|-----------|-------|
| Engine | Dattorro Shimmer |
| Decay | 0.92 |
| Size | 1.5 |
| Diffusion | 0.95 |
| Modulation | 0.60 |
| Pre-delay | 30 ms |
| Damping | 0.15 |
| Width | 1.00 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.04 Hz / 0.30 depth |
| Chorus | 0.4 Hz / 20 smp |
| Mod Character | Hybrid |
| Damp Low / High | 0.05 / 0.20 |
| Crossover | 900 Hz |
| Input Tone | 0 (flat) |
| Shimmer Feedback | 0 |
| Warp | 0.30 |
| Cross-Feed | 0.15 |
| Early Reflections | 0.20 |
| Air Absorption | 0.20 |
| Saturation | Clean |

**Design notes:** Dattorro engine variant with higher input diffusion coefficients (0.85/0.75 vs 0.75/0.625) for more smearing and detuning. Warp at 0.30 adds subtle pitch drift. No shimmer effect — the "shimmer" name refers to the engine's built-in detuning quality.

---

### 6. Nightsky
> *Warm drifting reverb with organic modulation and subtle shimmer*

| Parameter | Value |
|-----------|-------|
| Engine | Dark Hall |
| Decay | 0.92 |
| Size | 2.0 |
| Diffusion | 0.85 |
| Modulation | 0.55 |
| Pre-delay | 50 ms |
| Damping | 0.35 |
| Width | 0.90 |
| Shimmer | 0.20 |
| Shimmer Pitch | 7 st (fifth) |
| Slow Mod | 0.04 Hz / 0.60 depth |
| Chorus | 0.4 Hz / 20 smp |
| Mod Character | Hybrid |
| Damp Low / High | 0.15 / 0.45 |
| Crossover | 700 Hz |
| Input Tone | -0.3 (dark) |
| Shimmer Feedback | 0.20 |
| Warp | 0.10 |
| Cross-Feed | 0.20 |
| Early Reflections | 0.25 |
| Air Absorption | 0.35 |
| Saturation | Tape |

**Design notes:** Inspired by Strymon NightSky. Dark Hall engine with heavy high damping (0.45) and dark input tone. Tape saturation adds even-harmonic warmth. Shimmer pitched to a fifth (7 st) for modal harmony. Strong slow modulation (0.60) creates organic breathing.

---

### 7. Frozen Cathedral
> *Infinite sustain with wide stereo and gentle chorus*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 1.00 (infinite) |
| Size | 3.0 |
| Diffusion | 1.00 |
| Modulation | 0.30 |
| Pre-delay | 100 ms |
| Damping | 0.05 |
| Width | 1.00 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.05 Hz / 0 depth |
| Chorus | 0.8 Hz / 15 smp |
| Mod Character | Sine |
| Damp Low / High | 0.00 / 0.05 |
| Crossover | 1000 Hz |
| Input Tone | +0.1 (slight bright) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0 |
| Early Reflections | 0.40 |
| Air Absorption | 0.10 |
| Saturation | Clean |
| **Freeze** | **ON** |

**Design notes:** Freeze mode engaged — input is muted, tail sustains infinitely. Near-zero damping preserves full spectrum. v4 freeze evolution slowly modulates in-loop allpass coefficients (0.05 Hz LFO) so the frozen tail subtly evolves rather than becoming static.

---

## Extreme / Effect Presets

### 8. Blackhole
> *Massive infinite-like space with warp drift + dark tone*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.98 |
| Size | 6.0 |
| Diffusion | 1.00 |
| Modulation | 0.65 |
| Pre-delay | 80 ms |
| Damping | 0.08 |
| Width | 1.00 |
| Shimmer | 0.30 |
| Shimmer Pitch | 5 st (major third) |
| Slow Mod | 0.02 Hz / 0.70 depth |
| Chorus | 0.3 Hz / 30 smp |
| Mod Character | Drift |
| Damp Low / High | 0.05 / 0.15 |
| Crossover | 600 Hz |
| Input Tone | -0.4 (dark) |
| Shimmer Feedback | 0.50 |
| Warp | 0.40 |
| Cross-Feed | 0.30 |
| Reverse | 0.40 / 3.5 s |
| Early Reflections | 0.10 |
| Air Absorption | 0.40 |
| Saturation | Tape |

**Design notes:** Massive 6x size with near-infinite decay (0.98). Warp at 0.40 creates compounding pitch drift. Shimmer at a major third (5 st) with 50% feedback builds harmonic towers. Tape saturation adds warm even harmonics. Drift modulation for organic movement. Heavy air absorption darkens the tail progressively.

---

### 9. Reverse Wash
> *Heavy reverse tail with drift modulation for swell effects*

| Parameter | Value |
|-----------|-------|
| Engine | Hall |
| Decay | 0.88 |
| Size | 1.8 |
| Diffusion | 0.90 |
| Modulation | 0.40 |
| Pre-delay | 30 ms |
| Damping | 0.25 |
| Width | 0.85 |
| Shimmer | 0.15 |
| Shimmer Pitch | -12 st (octave down) |
| Slow Mod | 0.06 Hz / 0.30 depth |
| Chorus | 0.6 Hz / 25 smp |
| Mod Character | Drift |
| Damp Low / High | 0.10 / 0.35 |
| Crossover | 900 Hz |
| Input Tone | -0.2 (slightly dark) |
| Shimmer Feedback | 0.15 |
| Warp | 0.15 |
| Cross-Feed | 0.10 |
| Reverse | 0.70 / 2.0 s |
| Early Reflections | 0.15 |
| Air Absorption | 0.20 |
| Saturation | Clean |

**Design notes:** Reverse mix at 70% dominates — windowed reverse grains create crescendo swells into each note. Octave-down shimmer (-12 st) adds sub-bass weight. Clean saturation keeps the reverse artifacts sharp.

---

### 10. Cosmic Drift
> *Deep slow-breathing space with compound shimmer and dark tone*

| Parameter | Value |
|-----------|-------|
| Engine | Hall |
| Decay | 0.94 |
| Size | 2.8 |
| Diffusion | 0.92 |
| Modulation | 0.70 |
| Pre-delay | 70 ms |
| Damping | 0.12 |
| Width | 1.00 |
| Shimmer | 0.35 |
| Shimmer Pitch | 19 st (octave + fifth) |
| Slow Mod | 0.015 Hz / 0.85 depth |
| Chorus | 0.25 Hz / 35 smp |
| Mod Character | Drift |
| Damp Low / High | 0.08 / 0.20 |
| Crossover | 500 Hz |
| Input Tone | -0.5 (very dark) |
| Shimmer Feedback | 0.60 |
| Reverse | 0.25 / 3.0 s |
| Early Reflections | 0.10 |
| Air Absorption | 0.35 |
| Saturation | Tube |
| Warp | 0.25 |
| Cross-Feed | 0.35 |

**Design notes:** Very slow breathing (0.015 Hz, depth 0.85) creates tidal-like modulation. Shimmer at 19 st (octave + fifth) with 60% feedback builds compound harmonic stacks. Tube saturation provides gentle soft-knee compression. Very dark input tone (-0.5) filters out harshness before entering the FDN.

---

### 11. Supermassive
> *Extreme warp + massive size — Valhalla Supermassive inspired*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.97 |
| Size | 8.0 |
| Diffusion | 1.00 |
| Modulation | 0.60 |
| Pre-delay | 60 ms |
| Damping | 0.10 |
| Width | 1.00 |
| Shimmer | 0.20 |
| Shimmer Pitch | 7 st (fifth) |
| Slow Mod | 0.025 Hz / 0.50 depth |
| Chorus | 0.2 Hz / 35 smp |
| Mod Character | Hybrid |
| Damp Low / High | 0.05 / 0.12 |
| Crossover | 500 Hz |
| Input Tone | -0.3 (dark) |
| Shimmer Feedback | 0.40 |
| Warp | 0.60 |
| Cross-Feed | 0.40 |
| Reverse | 0.20 / 4.0 s |
| Early Reflections | 0.05 |
| Air Absorption | 0.30 |
| Saturation | Tape |

**Design notes:** Inspired by Valhalla Supermassive. Size 8.0 creates enormous delay lines. Warp at 0.60 introduces strong pitch drift per recirculation — each echo bends further. Tape saturation keeps it warm. Minimal ERs (0.05) — the effect is all about the massive tail.

---

### 12. Gravity Well
> *Maximum warp — pitch cascades create swirling vortex*

| Parameter | Value |
|-----------|-------|
| Engine | Hall |
| Decay | 0.96 |
| Size | 5.0 |
| Diffusion | 0.95 |
| Modulation | 0.80 |
| Pre-delay | 40 ms |
| Damping | 0.06 |
| Width | 1.00 |
| Shimmer | 0.15 |
| Shimmer Pitch | -5 st (down a fourth) |
| Slow Mod | 0.03 Hz / 0.60 depth |
| Chorus | 0.35 Hz / 40 smp |
| Mod Character | Drift |
| Damp Low / High | 0.04 / 0.10 |
| Crossover | 400 Hz |
| Input Tone | -0.6 (very dark) |
| Shimmer Feedback | 0.30 |
| Warp | 0.85 |
| Cross-Feed | 0.50 |
| Reverse | 0.10 / 2.5 s |
| Early Reflections | 0 |
| Air Absorption | 0.50 |
| Saturation | Tube |

**Design notes:** Warp at 0.85 — maximum pitch cascade effect. Each recirculation compounds the DC pitch offset, creating swirling detuned vortex. Downward shimmer (-5 st) pulls pitch lower. Tube saturation softly compresses the dense, churning signal. Zero ERs — pure tail effect. Very dark input tone and heavy air absorption create an oppressive, gravitational character.

---

### 13. Event Horizon
> *Edge of infinite — extreme cross-feed + allpass smearing*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.995 |
| Size | 10.0 |
| Diffusion | 1.00 |
| Modulation | 0.50 |
| Pre-delay | 120 ms |
| Damping | 0.03 |
| Width | 1.00 |
| Shimmer | 0.40 |
| Shimmer Pitch | 12 st (octave) |
| Slow Mod | 0.01 Hz / 0.90 depth |
| Chorus | 0.15 Hz / 38 smp |
| Mod Character | Drift |
| Damp Low / High | 0.02 / 0.08 |
| Crossover | 350 Hz |
| Input Tone | -0.7 (extremely dark) |
| Shimmer Feedback | 0.70 |
| Warp | 0.50 |
| Cross-Feed | 0.60 |
| Reverse | 0.50 / 5.0 s |
| Early Reflections | 0 |
| Air Absorption | 0.60 |
| Saturation | Tube |

**Design notes:** At the edge of stability. Decay 0.995 with size 10.0 — near-infinite tail in a cavernous space. Cross-feed at 0.60 collapses stereo separation into a dense mono-ish blur. Shimmer octave with 70% feedback builds infinite pitch stacks. Very slow modulation (0.01 Hz). Extremely dark input tone (-0.7) means only low frequencies survive entry.

---

## Experimental — Pleasant / Even-Harmonic

These presets are designed to avoid harsh odd-harmonic saturation. They use **Tape** mode (2nd harmonic warmth) or **Clean** at low drive levels where saturation barely engages.

### 14. Warm Tape Room
> *Intimate room through tape — 2nd harmonic warmth, rich early reflections*

| Parameter | Value |
|-----------|-------|
| Engine | Plate |
| Decay | 0.72 |
| Size | 0.9 |
| Diffusion | 0.75 |
| Modulation | 0.20 |
| Pre-delay | 12 ms |
| Damping | 0.15 |
| Width | 0.70 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.08 Hz / 0.15 depth |
| Chorus | 0.9 Hz / 6 smp |
| Mod Character | Sine |
| Damp Low / High | 0.08 / 0.25 |
| Crossover | 1800 Hz |
| Input Tone | -0.1 (slightly dark) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0.08 |
| Early Reflections | 0.70 |
| Air Absorption | 0.25 |
| Saturation | Tape |

**Design notes:** Short, intimate room. Very strong early reflections (0.70) give clear spatial definition — you hear the "room shape." Tape saturation at low level adds only 2nd harmonic warmth (even harmonics). No shimmer, warp, or reverse — pure acoustic room character through warm tape.

---

### 15. Silk Cloud
> *Ultra-smooth wash — heavy air absorption absorbs all harshness*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.93 |
| Size | 3.5 |
| Diffusion | 1.00 |
| Modulation | 0.25 |
| Pre-delay | 90 ms |
| Damping | 0.05 |
| Width | 1.00 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.02 Hz / 0.40 depth |
| Chorus | 0.3 Hz / 14 smp |
| Mod Character | Drift |
| Damp Low / High | 0.00 / 0.08 |
| Crossover | 600 Hz |
| Input Tone | -0.3 (dark) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0.20 |
| Early Reflections | 0.15 |
| Air Absorption | 0.70 |
| Saturation | Clean |

**Design notes:** The key is **air absorption at 0.70** — each recirculation through the FDN loses significant treble, so by the time you hear the tail it's pure silk. Clean saturation at these low levels barely engages (signal stays well below the nonlinearity threshold), so effectively zero harmonic distortion. The result is an impossibly smooth wash.

---

### 16. Amber Hall
> *Golden wooden hall — tape warmth with defined early reflections*

| Parameter | Value |
|-----------|-------|
| Engine | Hall |
| Decay | 0.87 |
| Size | 1.6 |
| Diffusion | 0.82 |
| Modulation | 0.35 |
| Pre-delay | 25 ms |
| Damping | 0.20 |
| Width | 0.85 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.04 Hz / 0.25 depth |
| Chorus | 0.6 Hz / 10 smp |
| Mod Character | Hybrid |
| Damp Low / High | 0.12 / 0.35 |
| Crossover | 1400 Hz |
| Input Tone | -0.15 (slightly dark) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0.12 |
| Early Reflections | 0.55 |
| Air Absorption | 0.30 |
| Saturation | Tape |

**Design notes:** Evokes a mid-sized wooden concert hall. Strong early reflections (0.55) with tape warmth — the combination of ER spatial definition and even-harmonic coloration creates a "golden" quality. Moderate diffusion (0.82) preserves some transient definition. Natural, warm, and musical.

---

### 17. Velvet Fog
> *Dense enveloping fog — extreme diffusion + air absorption, no edges*

| Parameter | Value |
|-----------|-------|
| Engine | Dark Hall |
| Decay | 0.95 |
| Size | 4.0 |
| Diffusion | 1.00 |
| Modulation | 0.45 |
| Pre-delay | 65 ms |
| Damping | 0.03 |
| Width | 1.00 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.015 Hz / 0.50 depth |
| Chorus | 0.2 Hz / 22 smp |
| Mod Character | Drift |
| Damp Low / High | 0.05 / 0.12 |
| Crossover | 450 Hz |
| Input Tone | -0.5 (very dark) |
| Shimmer Feedback | 0 |
| Warp | 0.05 |
| Cross-Feed | 0.35 |
| Reverse | 0.10 / 3.0 s |
| Early Reflections | 0.05 |
| Air Absorption | 0.80 |
| Saturation | Tape |

**Design notes:** **Air absorption at 0.80** — the highest of any preset. Every recirculation loses massive treble. Combined with full diffusion, very dark input tone (-0.5), and Dark Hall engine, the result is a sound with absolutely no edges or transients. Tape saturation adds gentle even-harmonic warmth to the fog. Minimal ERs (0.05) — no sense of room shape, just enveloping cloud.

---

### 18. Glass Cathedral
> *Crystalline Dattorro — strong early reflections, zero saturation*

| Parameter | Value |
|-----------|-------|
| Engine | Dattorro Plate |
| Decay | 0.88 |
| Size | 1.8 |
| Diffusion | 0.90 |
| Modulation | 0.40 |
| Pre-delay | 35 ms |
| Damping | 0.18 |
| Width | 0.95 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.05 Hz / 0.10 depth |
| Chorus | 0.7 Hz / 8 smp |
| Mod Character | Sine |
| Damp Low / High | 0.05 / 0.22 |
| Crossover | 1600 Hz |
| Input Tone | +0.15 (slightly bright) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0.05 |
| Early Reflections | 0.65 |
| Air Absorption | 0.12 |
| Saturation | Clean |

**Design notes:** Dattorro plate engine for its naturally musical quality. Very strong early reflections (0.65) create a defined cathedral space — you hear the walls. Clean saturation at low levels means effectively linear — no harmonic distortion at all. Slightly bright input tone allows the crystalline character to shine. Low air absorption preserves treble.

---

### 19. Honey Drip
> *Sweet slow bloom — long predelay into tape-warm decay*

| Parameter | Value |
|-----------|-------|
| Engine | Hall |
| Decay | 0.91 |
| Size | 2.2 |
| Diffusion | 0.88 |
| Modulation | 0.30 |
| Pre-delay | 140 ms |
| Damping | 0.10 |
| Width | 0.90 |
| Shimmer | 0.10 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.025 Hz / 0.35 depth |
| Chorus | 0.35 Hz / 16 smp |
| Mod Character | Hybrid |
| Damp Low / High | 0.06 / 0.18 |
| Crossover | 900 Hz |
| Input Tone | -0.2 (slightly dark) |
| Shimmer Feedback | 0.10 |
| Warp | 0 |
| Cross-Feed | 0.18 |
| Early Reflections | 0.35 |
| Air Absorption | 0.40 |
| Saturation | Tape |

**Design notes:** The defining feature is the **140 ms predelay** — the longest of any preset. This creates a clear gap between the dry signal and the reverb bloom, giving a "dripping" quality. v4 predelay modulation adds ±2ms sine at 0.1 Hz with L/R decorrelation, so the bloom gently shifts in stereo. Tape saturation warms each drip. Subtle shimmer (10%) adds a hint of octave sparkle.

---

### 20. Moonlit Lake
> *Wide contemplative space — gentle reverse ripples, natural air*

| Parameter | Value |
|-----------|-------|
| Engine | Cathedral |
| Decay | 0.90 |
| Size | 2.5 |
| Diffusion | 0.85 |
| Modulation | 0.35 |
| Pre-delay | 55 ms |
| Damping | 0.15 |
| Width | 1.00 |
| Shimmer | 0 |
| Shimmer Pitch | 12 st |
| Slow Mod | 0.03 Hz / 0.45 depth |
| Chorus | 0.4 Hz / 18 smp |
| Mod Character | Drift |
| Damp Low / High | 0.08 / 0.28 |
| Crossover | 750 Hz |
| Input Tone | -0.15 (slightly dark) |
| Shimmer Feedback | 0 |
| Warp | 0 |
| Cross-Feed | 0.25 |
| Reverse | 0.20 / 2.5 s |
| Early Reflections | 0.40 |
| Air Absorption | 0.45 |
| Saturation | Tape |

**Design notes:** Contemplative and wide. The gentle reverse (20%) creates subtle backward ripples — like stones skipping on water. Drift modulation with medium slow mod creates organic, unpredictable movement. Tape saturation adds warmth. Strong ERs (0.40) with air absorption (0.45) — you hear the space, but the tail is warm and receding. Full width and cross-feed (0.25) for immersive stereo.

---

## Engine Architecture Summary

### FDN Engine (Types: plate, hall, cathedral, darkHall)
- 16-channel (Ultra) / 8-channel (Balanced) / 4-channel (Lite) Feedback Delay Network
- Golden-ratio-spaced prime delay line lengths
- Hadamard mixing matrices (16×16 / 8×8 / 4×4)
- Per-line chorus with configurable sine/drift/hybrid modulation
- Multi-band damping (2-band: low + high with crossover)
- 3 cascaded allpass diffuser pairs (pre/mid/post)
- v4: Multi-tap read (3 golden-ratio taps), velvet noise injection, rotating matrix, freeze evolution

### Dattorro Engine (Types: dattorroPlate, dattorroShimmer)
- Jon Dattorro's 1997 JAES plate algorithm
- 4× input allpass diffusion → 2 cross-coupled tank loops
- Each tank: ModAP → Delay → LP Damp → DecayAP → Delay × decay
- 14-tap stereo output from tank delays
- Shimmer variant uses higher diffusion coefficients

### v4 Features (all engines)
- **Allpass interpolation** — transparent modulation (replaces linear interp)
- **Early reflections** — 10-tap sparse network with L/R decorrelation (7–83 ms)
- **Air absorption** — per-channel OnePole lowpass in feedback loop
- **Multi-tap FDN** — 3 golden-ratio-spaced taps per delay line
- **Velvet noise** — sparse random impulses at high decay for density
- **Saturation modes** — Clean (tanh/odd), Tape (even harmonics), Tube (soft knee/odd)
- **Matrix rotation** — slow Hadamard sign flips (~25s period)
- **Modulated predelay** — ±2ms at 0.1 Hz with stereo decorrelation
- **Freeze evolution** — 0.05 Hz LFO on in-loop allpass during freeze
- **True stereo diffusion** — decorrelated L/R predelay modulation phase
