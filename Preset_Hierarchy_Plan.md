# Preset Hierarchy Plan — v3

> **v3 revision** — March 2026. Restructured around Source Page presets matching
> the 5-tab UI (Synth, Drums, Reverb, Granular, Earth). Added reverb engine
> (shimmer, slow mod, freeze, reverse), looper Euclidean sequencer, Earth mixer
> with per-source reverb sends, and accurate parameter inventories throughout.

## Overview

A layered preset system where each level composes the levels below it. The hierarchy
mirrors the app's tab structure: each Source Page (Synth, Drums, Reverb, Granular, Earth)
has its own preset level containing sound engine presets, slider values, and sequencer config.

---

## Hierarchy Structure

```
Journey (L5)
├── Topology, phrase lengths, morph durations, connections
│
├── Node 1 → State Preset ref (L4)
│   ├── Global / Mixer params (23 owned: master vol, harmony, CoF, tension, etc.)
│   │
│   ├── Synth Source ref (L3)
│   │   ├── Shared lead delay/vibrato/glide + master (9 owned)
│   │   ├── Pad 1 Kit Preset ref (L2)
│   │   │   ├── presetA/B, morph, enabled, voiceMask, waveSpread, detune (10 owned)
│   │   │   └── Pad 1 Engine ref (L1) — e.g. "Saturated Drift"
│   │   ├── Pad 2 Kit Preset ref (L2)
│   │   │   ├── presetA/B, morph, enabled, voiceAssign (8 owned)
│   │   │   └── Pad 2 Engine ref (L1)
│   │   ├── Lead 1 Kit Preset ref (L2)
│   │   │   ├── presetA/B, morph, level, config (8 owned)
│   │   │   └── Lead 1 Engine ref (L1) — e.g. "Glass Bell"
│   │   ├── Lead 2 Kit Preset ref (L2)
│   │   │   ├── presetC/D, morph, enabled, level, config (9 owned)
│   │   │   └── Lead 2 Engine ref (L1)
│   │   └── Synth Euclidean ref (L1) — e.g. "Arpeggio Weave"
│   │
│   ├── Drums Source ref (L3)
│   │   ├── Drum mixer + delay + sends (17 owned)
│   │   ├── Drum Kit ref (L2) — e.g. "Ambient Kit"
│   │   │   ├── 7× distance/variation + morph config (56 owned)
│   │   │   └── 7× Voice Engine refs (L1) — e.g. "Ikeda Kick"
│   │   └── Drum Euclidean ref (L1) — e.g. "Four On Floor"
│   │
│   ├── Reverb Source (L3 — no L2, 18 owned params)
│   │
│   ├── Granular Source ref (L3)
│   │   ├── Master mixer/sends + delay (22 owned)
│   │   ├── Looper Kit Preset ref (L2) — e.g. "Ambient Wash"
│   │   │   ├── 4× voice enabled/gain + macros (12 owned)
│   │   │   ├── 4× Looper Voice Engine refs (L1)
│   │   │   ├── Legacy Granular ref (L1)
│   │   │   └── Looper Legacy ref (L1)
│   │   └── Looper Euclidean ref (L1) — e.g. "Scattered Grains"
│   │
│   └── Earth Source ref (L3)
│       ├── Earth mixer (0 owned — just a ref to L2)
│       └── Earth Kit Preset ref (L2) — e.g. "Rainforest Night"
│           ├── enabled/level/sends for each engine + ocean config (19 owned)
│           ├── Water Engine ref (L1) — e.g. "Tap Drips"
│           ├── Insects 1 Engine ref (L1) — e.g. "Cricket Chorus"
│           └── Insects 2 Engine ref (L1) — e.g. "Cicada Dusk"
│
├── Node 2 → State Preset ref (L4)
├── Node 3 (optional)
└── Node 4 (optional)
```

---

## Level 1: Sound Engine Presets

### Scope
Parameters for a single synthesis engine voice. The atomic unit of sound design.
These are the "loaded sound engine presets" — factory or user-saved parameter sets
for individual voices like a kick drum or an FM lead.

### Engine Inventory

| # | Source Page | Engine | Prefix | Param Count | Factory Presets |
|---|-----------|--------|--------|-------------|-----------------|
| 1 | Drums | Sub | `drumSub*` | 10 pure synth | 16 |
| 2 | Drums | Kick | `drumKick*` | 11 pure synth | 17 |
| 3 | Drums | Click | `drumClick*` | 13 pure synth | 23 |
| 4 | Drums | BeepHi | `drumBeepHi*` | 18 pure synth | 28 |
| 5 | Drums | BeepLo | `drumBeepLo*` | 17 pure synth | 26 |
| 6 | Drums | Noise | `drumNoise*` | 17 pure synth | 31 |
| 7 | Drums | Membrane | `drumMembrane*` | 21 pure synth | 20 |
| 8 | Synth | Pad 1 | `pad*` (no number) | 48 pure synth | A/B morph from Lead4opFM pool |
| 9 | Synth | Pad 2 | `pad2*` | 48 pure synth | A/B morph from Lead4opFM pool |
| 10 | Synth | Lead 1 | `lead1*` | 9 pure synth | 17 (Lead4opFM/) |
| 11 | Synth | Lead 2 | `lead2*` | 6 pure synth | same pool as Lead 1 |
| 12 | Earth | Water | `water*` | 18 pure synth | 4 (Tap Drips, Stream, Waterfall, Rain Window) |
| 13 | Earth | Insects 1 | `insects*` | 8 pure synth | — (user-saved only) |
| 14 | Earth | Insects 2 | `insects2*` | 8 pure synth | — (user-saved only) |
| 15 | Granular | Legacy Granular | `grain*/density/spray/…` | 12 pure synth | — (user-saved only) |
| 16 | Granular | Looper Voice | `looperV{n}*` | 20 pure synth (×4 voices) | — (user-saved only) |
| 17 | Granular | Looper Legacy | `looperLegacy*` | 6 pure synth | — (user-saved only) |
| 18 | Synth | Synth Euclidean | `synthEuclidean*` | 43 params (3 global + 4 lanes × 10) | — (user-saved only) |
| 19 | Drums | Drum Euclidean | `drumEuclidean*` | 69 params (5 global + 4 lanes × 16) | — (user-saved only) |
| 20 | Granular | Looper Euclidean | `looperEuclidean*` | 41 params (5 global + 4 lanes × 9) | — (user-saved only) |

> **Note:** L1 stores only pure sound/synthesis params. Performance params (distance,
> variation, morph config, enabled, gain, etc.) live at **L2 (Kit Preset)** level.

> **Note:** Ocean wave synth parameters are stored as raw slider values within the
> Earth Source Preset and do not have their own engine preset level.

### Data Format
```json
{
  "type": "voice-preset",
  "engine": "drumKick",
  "name": "808 Boom",
  "author": "factory",
  "versions": [
    {
      "v": 1,
      "note": "initial",
      "timestamp": 1740000000,
      "params": {
        "drumKickFreq": 52,
        "drumKickPitchEnv": 0.6,
        "drumKickPitchDecay": 80,
        "drumKickDecay": 0.9,
        "drumKickClick": 0.2,
        "drumKickBody": 0.7,
        "drumKickPunch": 0.5,
        "drumKickTail": 0.4,
        "drumKickTone": 0.3,
        "drumKickAttack": 0
      }
    }
  ],
  "currentVersion": 1
}
```

### Engine Type Discriminators
```
type: "voice-preset"
engine: "drumSub" | "drumKick" | "drumClick" | "drumBeepHi" | "drumBeepLo" |
        "drumNoise" | "drumMembrane" | "pad1" | "pad2" | "lead1" | "lead2" |
        "water" | "insects1" | "insects2" |
        "legacyGranular" | "looperVoice" | "looperLegacy" |
        "synthEuclidean" | "drumEuclidean" | "looperEuclidean"
```

### Storage Key
```
preset:voice:drumSub:Subterranean
preset:voice:drumKick:808 Boom
preset:voice:pad1:Warm Wash
preset:voice:lead1:Glass Bell
preset:voice:water:Rain Window
preset:voice:insects1:Summer Night
preset:voice:insects2:Cicada Chorus
preset:voice:legacyGranular:Cloud Texture
preset:voice:looperVoice:Granular Scatter
preset:voice:looperLegacy:Sparse Grains
preset:voice:synthEuclidean:Arpeggio Weave
preset:voice:drumEuclidean:Four On Floor
preset:voice:looperEuclidean:Scattered Grains
```

### UI Placement
Inside each voice's parameter panel:
```
┌─ KICK ─────────────────────────────────────────┐
│ [808 Boom ▾]  v2  [◀ ▶]  [Save] [Save As]     │
│                                                 │
│  Freq [====]  Decay [====]  Click [====]  ...   │
└─────────────────────────────────────────────────┘
```

### Interaction
- **Dropdown**: Factory presets (lock icon) + user presets, separated by divider
- **◀ ▶ arrows**: Step through version history (instant load)
- **Save**: Pushes a new version onto the current preset's version stack
- **Save As**: Creates a new preset name with v1
- Factory presets: Save auto-creates a user copy

---

## Level 2: Drum Kit Preset

### Scope
The "kit" — bundles 7 L1 voice preset references + per-voice performance
params (distance, variation) + morph configuration. Sits between individual voice
presets (Level 1) and the Drums Source Preset (Level 3).
Loading a kit replaces all 7 voices at once without affecting the sequencer, delay, or mixer.

### Contents
A Drum Kit references 7 voice engine presets (by name) plus owns 56 unique params:
- 7 × L1 engine preset references (by name + version)
- 7 × `distance` — strike position / spatial placement (0–1)
- 7 × `variation` — per-hit micro-randomness (0–1)
- 7 × morph config (presetA, presetB, morph, morphAuto, morphSpeed, morphMode) = 42 params
- **Total L2-owned params: 56** (14 performance + 42 morph config)

### Data Format
```json
{
  "type": "drum-kit",
  "name": "Ambient Kit",
  "author": "user",
  "versions": [{
    "v": 1,
    "note": "warm ambient set",
    "timestamp": 1740000000,
    "voices": {
      "sub": {
        "enginePreset": "Subterranean", "engineVersion": 2,
        "distance": 0.5, "variation": 0.1,
        "morphPresetA": "Subterranean", "morphPresetB": "Deep Pulse",
        "morph": 0.3, "morphAuto": true, "morphSpeed": 4, "morphMode": "pingpong"
      },
      "kick": {
        "enginePreset": "808 Boom", "engineVersion": 1,
        "distance": 0.5, "variation": 0.15,
        "morphPresetA": "808 Boom", "morphPresetB": "Ikeda Kick",
        "morph": 0.0, "morphAuto": false, "morphSpeed": 8, "morphMode": "linear"
      },
      "click": { "enginePreset": "Rimshot", "engineVersion": 1, "distance": 0.5, "variation": 0.1, "...morph..." },
      "beepHi": { "enginePreset": "Glass Bell", "engineVersion": 1, "distance": 0.5, "variation": 0.1, "...morph..." },
      "beepLo": { "enginePreset": "Warm Pad", "engineVersion": 1, "distance": 0.5, "variation": 0.1, "...morph..." },
      "noise": { "enginePreset": "White Wash", "engineVersion": 1, "distance": 0.5, "variation": 0.1, "...morph..." },
      "membrane": { "enginePreset": "Snare Tight", "engineVersion": 1, "distance": 0.5, "variation": 0.1, "...morph..." }
    }
  }],
  "currentVersion": 1
}
```

### Storage Key
```
preset:kit:Ambient Kit
preset:kit:Glitch Percussion
preset:kit:808 Classic
```

### UI Placement
Above individual voice panels on the Drums tab:
```
┌─ DRUM KIT ─────────────────────────────────────┐
│ [Ambient Kit ▾]  v1  [◀ ▶]  [Save] [Save As]  │
├────────────────────────────────────────────────-┤
│ ┌─ KICK ──────────┐  ┌─ SUB ──────────┐  ...   │
│ │ [808 Boom ▾] v2  │  │ [Subterranean] │        │
│ │ Freq [====] ...  │  │ Freq [====]    │        │
│ └──────────────────┘  └────────────────┘        │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a kit replaces all 7 voice engine presets + per-voice distance/variation/morph
- Individual voices can still be changed independently after loading a kit
- Changing any voice, distance, variation, or morph marks the kit as modified (●)
- Kit does NOT include sequencer, delay, mixer, or per-voice delay sends — those stay at L3

---

## Level 3: Source Presets

### Scope
All parameters belonging to one Source Page tab. Bundles sound engine presets +
slider values not covered by engine presets (like ocean wave synth params) +
mixer/routing config + sequencer configuration.

Each Source Page maps 1:1 to a UI tab.

---

### 2a. Synth Source Preset

**L3-owned params (9):**
- Shared lead delay: `leadDelayTime`, `leadDelayFeedback`, `leadDelayMix` (3)
- Shared lead performance: `leadVibratoDepth`, `leadVibratoRate`, `leadGlide` (3)
- Master lead controls: `leadEnabled`, `leadRandomEnabled`, `leadLevel` (3)

**References (by name):**
- L2 Pad 1 Kit Preset ref (→ L1 Pad 1 Engine)
- L2 Pad 2 Kit Preset ref (→ L1 Pad 2 Engine)
- L2 Lead 1 Kit Preset ref (→ L1 Lead 1 Engine)
- L2 Lead 2 Kit Preset ref (→ L1 Lead 2 Engine)
- L1 Synth Euclidean engine ref (43 params)

**Data Format:**
```json
{
  "type": "source-preset",
  "source": "synth",
  "name": "Ambient Pads + Arpeggios",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "pad1Ref": { "name": "Warm Wash Morph", "version": 1 },
    "pad2Ref": { "name": "Crystal Layer", "version": 1 },
    "lead1Ref": { "name": "Glass Bell Setup", "version": 1 },
    "lead2Ref": { "name": "Ethereal FM Setup", "version": 1 },
    "sequencerRef": { "name": "Arpeggio Weave", "version": 1 },
    "sharedLead": {
      "leadVibratoDepth": 0.3, "leadVibratoRate": 5.5,
      "leadGlide": 0.1, "leadDelayTime": 375,
      "leadDelayFeedback": 0.3, "leadDelayMix": 0.15
    }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:synth:Ambient Pads + Arpeggios`

---

### Level 2 Kit Presets — Synth Page

#### L2 Pad 1 Kit Preset (10 owned params)
The "kit" layer around a Pad 1 engine sound. Stores which L1 preset(s)
to morph between, morph settings, and performance params.

| # | Key | Notes |
|---|-----|-------|
| 1 | `padPresetA` | L1 engine preset A name |
| 2 | `padPresetB` | L1 engine preset B name |
| 3 | `padMorph` | 0–1 morph position |
| 4 | `padMorphAuto` | Auto-morph on/off |
| 5 | `padMorphSpeed` | Phrases per morph cycle |
| 6 | `padEnabled` | Master on/off |
| 7 | `synthVoiceMask` | Which voices this pad uses |
| 8 | `waveSpread` | Voice stagger timing |
| 9 | `detune` | Voice detuning |
| 10 | `synthOctave` | Octave offset |

Data: `{ "type": "kit-preset", "source": "pad1", "name": "Warm Wash Morph", "engineRef": { "name": "Saturated Drift", "version": 1 }, "params": { ... } }`

#### L2 Pad 2 Kit Preset (8 owned params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `pad2PresetA` | L1 engine preset A name |
| 2 | `pad2PresetB` | L1 engine preset B name |
| 3 | `pad2Morph` | 0–1 morph position |
| 4 | `pad2MorphAuto` | Auto-morph on/off |
| 5 | `pad2MorphSpeed` | Phrases per morph cycle |
| 6 | `pad2Enabled` | Master on/off |
| 7 | `pad2VoiceAssign` | Which voices this pad uses |
| 8 | `pad2Octave` | Octave offset |

#### L2 Lead 1 Kit Preset (8 owned params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead1PresetA` | L1 FM preset A name |
| 2 | `lead1PresetB` | L1 FM preset B name |
| 3 | `lead1Morph` | 0–1 morph position |
| 4 | `lead1MorphAuto` | Auto-morph on/off |
| 5 | `lead1MorphSpeed` | Phrases per morph cycle |
| 6 | `lead1MorphMode` | linear / pingpong / random |
| 7 | `lead1AlgorithmMode` | snap / presetA |
| 8 | `lead1Level` | Lead 1 output level |

#### L2 Lead 2 Kit Preset (9 owned params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead2PresetC` | L1 FM preset C name |
| 2 | `lead2PresetD` | L1 FM preset D name |
| 3 | `lead2Morph` | 0–1 morph position |
| 4 | `lead2MorphAuto` | Auto-morph on/off |
| 5 | `lead2MorphSpeed` | Phrases per morph cycle |
| 6 | `lead2MorphMode` | linear / pingpong / random |
| 7 | `lead2AlgorithmMode` | snap / presetA |
| 8 | `lead2Level` | Lead 2 output level |
| 9 | `lead2Enabled` | Lead 2 on/off |

---

### 2b. Drums Source Preset

**L3-owned params (17):**
- Drum mixer: `drumEnabled`, `drumLevel`, `drumReverbSend`, `drumMorphSliderAnimate` (4)
- Drum stereo ping-pong delay: `drumDelayEnabled`, `drumDelayNoteL/R`, `drumDelayFeedback`, `drumDelayMix`, `drumDelayFilter` (6)
- Per-voice delay sends: `drumSubDelaySend` … `drumMembraneDelaySend` (7)

**References (by name):**
- L2 Drum Kit preset (→ which in turn references 7 × L1 voice presets)
- L1 Drum Euclidean engine preset (69 params)

**Data Format:**
```json
{
  "type": "source-preset",
  "source": "drums",
  "name": "Ambient Drums",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "kitRef": { "name": "Ambient Kit", "version": 1 },
    "sequencerRef": { "name": "Four On Floor", "version": 1 },
    "mixer": {
      "drumEnabled": true, "drumLevel": 0.8,
      "drumReverbSend": 0.3, "drumMorphSliderAnimate": true
    },
    "delay": {
      "drumDelayEnabled": true, "drumDelayNoteL": "1/8",
      "drumDelayNoteR": "1/8d", "drumDelayFeedback": 0.3,
      "drumDelayMix": 0.15, "drumDelayFilter": 2000
    },
    "delaySends": {
      "drumSubDelaySend": 0.0, "drumKickDelaySend": 0.3,
      "drumClickDelaySend": 0.5, "drumBeepHiDelaySend": 0.2,
      "drumBeepLoDelaySend": 0.1, "drumNoiseDelaySend": 0.4,
      "drumMembraneDelaySend": 0.2
    }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:drums:Ambient Drums`

---

### 2c. Reverb Source Preset (18 params)

**Contains:**
- Core: `reverbEngine`, `reverbType`, `reverbQuality`, `reverbDecay`, `reverbSize`, `reverbDiffusion`
- Mod: `reverbModulation`, `predelay`, `damping`, `width`
- Shimmer: `reverbShimmer`, `reverbShimmerPitch`
- Slow Mod: `reverbSlowModRate`, `reverbSlowModDepth`
- Reverse: `reverbReverse`, `reverbReverseLength`
- Config: `reverbEnabled`, `reverbFreeze`

**Data Format:**
```json
{
  "type": "source-preset",
  "source": "reverb",
  "name": "Blackhole",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "params": {
      "reverbEnabled": true,
      "reverbEngine": "algorithmic",
      "reverbType": "cathedral",
      "reverbQuality": "ultra",
      "reverbDecay": 0.98,
      "reverbSize": 3.0,
      "reverbDiffusion": 1.0,
      "reverbModulation": 0.65,
      "predelay": 80,
      "damping": 0.08,
      "width": 1.0,
      "reverbShimmer": 0.3,
      "reverbShimmerPitch": 5,
      "reverbSlowModRate": 0.02,
      "reverbSlowModDepth": 0.7,
      "reverbFreeze": false,
      "reverbReverse": 0.4,
      "reverbReverseLength": 3.5
    }
  }],
  "currentVersion": 1
}
```

> **Note:** The 8 existing character presets (Default, Shimmer Pad, Blackhole, Nightsky,
> Frozen Cathedral, Reverse Wash, Cosmic Drift, Tight Plate) defined in `ReverbPage.tsx`
> become factory reverb source presets.

**Storage Key:** `preset:source:reverb:Blackhole`

---

### 2d. Granular Source Preset

**L3-owned params (22):**
- `granularEnabled` (1)
- Looper master: `looperEnabled`, `looperDryWet`, `looperFreeze`, `looperFeedback`, `looperFeedbackLPF`, `looperBufferSeconds`, `looperReverbSend` (7)
- Looper sends: `looperPad1Send`, `looperPad2Send`, `looperLead1Send`, `looperLead2Send`, `looperDrumSend`, `looperWavesSend` (6)
- Looper delay: `looperDelayEnabled/Activity/Repeats/Time/Filter/Vibrato/Mix/ReverbSend` (8)

**References (by name):**
- L2 Looper Kit Preset ref (→ L1 voices + legacy)
- L1 Looper Euclidean engine ref (41 params)

**Data Format:**
```json
{
  "type": "source-preset",
  "source": "granular",
  "name": "Shimmer Cloud",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "looperKitRef": { "name": "Ambient Wash", "version": 1 },
    "sequencerRef": { "name": "Scattered Grains", "version": 1 },
    "config": { "granularEnabled": true },
    "looperMaster": {
      "looperEnabled": true, "looperDryWet": 0.5, "looperFreeze": false,
      "looperFeedback": 0.6, "looperFeedbackLPF": 6000,
      "looperBufferSeconds": 4, "looperReverbSend": 0.3
    },
    "sends": {
      "looperPad1Send": 1, "looperPad2Send": 0, "looperLead1Send": 1,
      "looperLead2Send": 0, "looperDrumSend": 0, "looperWavesSend": 0
    },
    "delay": {
      "looperDelayEnabled": false, "looperDelayActivity": 0.3,
      "looperDelayRepeats": 3, "looperDelayTime": "1/8",
      "looperDelayFilter": 4000, "looperDelayVibrato": 0.1,
      "looperDelayMix": 0.2, "looperDelayReverbSend": 0.15
    }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:granular:Shimmer Cloud`

---

### Level 2 Kit Preset — Granular Page

#### L2 Looper Kit Preset (12 owned params)
The "kit" layer — which looper voices are active, their gains,
and macro knobs. Named presets like "Ambient Wash", "Rhythmic Chop",
"Glitch Scatter" etc. are L2 Looper Kit Presets.

| # | Key | Notes |
|---|-----|-------|
| 1 | `looperV1Enabled` | Voice 1 on/off |
| 2 | `looperV1Gain` | Voice 1 output level |
| 3 | `looperV2Enabled` | Voice 2 on/off |
| 4 | `looperV2Gain` | Voice 2 output level |
| 5 | `looperV3Enabled` | Voice 3 on/off |
| 6 | `looperV3Gain` | Voice 3 output level |
| 7 | `looperV4Enabled` | Voice 4 on/off |
| 8 | `looperV4Gain` | Voice 4 output level |
| 9 | `looperMacroTexture` | Macro: blur/spray/grainSize |
| 10 | `looperMacroComplexity` | Macro: LFO rates/density |
| 11 | `looperMacroDarkness` | Macro: speed/pitch/filter |
| 12 | `looperMacroChaos` | Macro: reverse/spray/grainOct |

**References:**
- 4 × L1 Looper Voice engine refs (by name)
- L1 Legacy Granular engine ref (by name)
- L1 Looper Legacy engine ref (by name)

Data: `{ "type": "kit-preset", "source": "looper", "name": "Ambient Wash", "voiceRefs": [ { "name": "Slow Scan V1", "version": 1 }, ... ], "legacyRef": { ... }, "params": { ... } }`

---

### 2e. Earth Source Preset

**L3-owned params (0):**
Just a reference to the L2 Earth Kit Preset. All Earth mixer/config params
live at L2 (enabled, levels, sends, ocean config).

**References (by name):**
- L2 Earth Kit Preset ref (→ L1 Water, Insects1, Insects2 engines)

**Data Format:**
```json
{
  "type": "source-preset",
  "source": "earth",
  "name": "Rainforest Night",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "earthKitRef": { "name": "Rainforest Night", "version": 1 }
  }],
  "currentVersion": 1
}
```

> **Note:** Earth L3 is a thin wrapper — it exists so L4 State can reference all 5
> source pages uniformly. In practice, most Earth config lives at L2.

**Storage Key:** `preset:source:earth:Rainforest Night`

---

### Level 2 Kit Preset — Earth Page

#### L2 Earth Kit Preset (19 owned params)
Which L1 engines are on/off, their levels and sends, plus ocean synth config
(ocean has no L1 preset system — its params live at L2). Named presets like
"Rainforest Night", "Desert Dusk", "Coastal Dawn" are L2 Earth Kit Presets.

| # | Key | Sub-group | Notes |
|---|-----|-----------|-------|
| 1 | `waterEnabled` | Water config | Water engine on/off |
| 2 | `waterLevel` | Water config | Water output volume |
| 3 | `insectsEnabled` | Insects 1 config | Insects 1 on/off |
| 4 | `insectsLevel` | Insects 1 config | Insects 1 volume |
| 5 | `insectsReverbSend` | Insects 1 config | Insects 1 → reverb |
| 6 | `insects2Enabled` | Insects 2 config | Insects 2 on/off |
| 7 | `insects2Level` | Insects 2 config | Insects 2 volume |
| 8 | `oceanSampleEnabled` | Ocean config | Sample on/off |
| 9 | `oceanSampleLevel` | Ocean config | Sample volume |
| 10 | `oceanWaveSynthEnabled` | Ocean config | Wave synth on/off |
| 11 | `oceanWaveSynthLevel` | Ocean config | Wave synth volume |
| 12 | `oceanReverbSend` | Ocean config | Ocean → reverb |
| 13 | `oceanFilterType` | Ocean engine | Filter type |
| 14 | `oceanFilterCutoff` | Ocean engine | Filter cutoff |
| 15 | `oceanFilterResonance` | Ocean engine | Filter resonance |
| 16 | `oceanDuration` | Ocean engine | Wave duration |
| 17 | `oceanInterval` | Ocean engine | Time between waves |
| 18 | `oceanFoam` | Ocean engine | Foam intensity |
| 19 | `oceanDepth` | Ocean engine | Low rumble |

**References:**
- L1 Water engine ref (by name) — e.g. "Tap Drips"
- L1 Insects 1 engine ref (by name) — e.g. "Cricket Chorus"
- L1 Insects 2 engine ref (by name) — e.g. "Cicada Dusk"

Data: `{ "type": "kit-preset", "source": "earth", "name": "Rainforest Night", "waterRef": { "name": "Tap Drips" }, "insects1Ref": { "name": "Cricket Chorus" }, "insects2Ref": { "name": "Cicada Dusk" }, "params": { ... } }`

---

## Level 4: State Preset

### Scope
Everything for one journey node: Global/Mixer params + all 5 Source Presets.
This is the complete snapshot of the entire app state at a single point in time.

### Contents

| Section | Keys | Description |
|---------|------|-------------|
| **Global/Mixer** | 23 | Master volume, harmony, CoF drift, tension, scale, chord rate, random walk, seed, mixer levels/sends |
| **Synth Source** | ref | Pointer to L3 Synth source preset |
| **Drums Source** | ref | Pointer to L3 Drums source preset |
| **Reverb Source** | ref | Pointer to L3 Reverb source preset |
| **Granular Source** | ref | Pointer to L3 Granular source preset |
| **Earth Source** | ref | Pointer to L3 Earth source preset |
| **Total L4-owned** | **23** | Global params only; sources are references |

### Global / Mixer Keys (23)
```
masterVolume, synthLevel, pad2Level, granularLevel,
synthReverbSend, granularReverbSend, leadReverbSend, leadDelayReverbSend,
reverbLevel, rootNote, scaleMode, manualScale, tension,
chordRate, cofDriftEnabled, cofDriftRate, cofDriftDirection, cofDriftRange,
cofCurrentStep, randomness, randomWalkSpeed, seedWindow, voicingSpread
```

### Data Format
```json
{
  "type": "state-preset",
  "name": "Desert Night",
  "author": "user",
  "versions": [{
    "v": 1,
    "note": "initial composition",
    "timestamp": 1740000000,
    "global": {
      "masterVolume": 0.8,
      "rootNote": 0,
      "scaleMode": "auto",
      "tension": 0.5,
      "chordRate": 8,
      "cofDriftEnabled": true,
      "cofDriftRate": 4,
      "cofDriftDirection": "random",
      "cofDriftRange": 2,
      "synthLevel": 0.7,
      "pad2Level": 0.6,
      "granularLevel": 0.3,
      "synthReverbSend": 0.4,
      "granularReverbSend": 0.3,
      "leadReverbSend": 0.5,
      "leadDelayReverbSend": 0.2,
      "reverbLevel": 0.8,
      "randomness": 0.5,
      "randomWalkSpeed": 0.5,
      "seedWindow": "hour",
      "voicingSpread": 0.5,
      "manualScale": "major",
      "cofCurrentStep": 0
    },
    "synthRef": { "name": "Ambient Pads + Arpeggios", "version": 2 },
    "drumsRef": { "name": "Ambient Drums", "version": 1 },
    "reverbRef": { "name": "Blackhole", "version": 1 },
    "granularRef": { "name": "Shimmer Cloud", "version": 1 },
    "earthRef": { "name": "Rainforest Night", "version": 1 }
  }],
  "currentVersion": 1
}
```

### Storage Key
```
preset:state:Desert Night
```

### UI Placement
Top-level state bar or journey node inspector:
```
┌─ STATE ────────────────────────────────────────┐
│ [Desert Night ▾]  v1  [◀ ▶]  [Save] [Save As] │
│ Contains: Ambient Kit · Blackhole · Shimmer Cloud │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a state preset replaces all 5 source presets + global params
- Within journey mode, only affects the current node
- Modified indicator (●) when state differs from last saved version
- Can also be loaded outside journey as a "full preset"

---

## Level 5: Journey Preset

### Scope
2–4 State Preset nodes + phrase lengths + morph durations + connection map + diamond positions.
The complete generative composition.

### Data Format
```json
{
  "type": "journey-preset",
  "name": "Midnight Caravan",
  "author": "user",
  "versions": [{
    "v": 1,
    "note": "first draft",
    "timestamp": 1740000000,
    "topology": "diamond",
    "nodes": [
      {
        "position": "top",
        "state": { "name": "Desert Night", "version": 1, "data": { "..." } },
        "phraseLength": 8
      },
      {
        "position": "right",
        "state": { "name": "Oasis", "version": 1, "data": { "..." } },
        "phraseLength": 12
      },
      {
        "position": "bottom",
        "state": { "name": "Sandstorm", "version": 2, "data": { "..." } },
        "phraseLength": 8
      },
      {
        "position": "left",
        "state": { "name": "Starlight", "version": 1, "data": { "..." } },
        "phraseLength": 16
      }
    ],
    "connections": [
      { "from": "top", "to": "right", "morphDuration": 4, "probability": 1.0 },
      { "from": "right", "to": "bottom", "morphDuration": 6, "probability": 0.8 },
      { "from": "right", "to": "left", "morphDuration": 4, "probability": 0.2 },
      { "from": "bottom", "to": "left", "morphDuration": 4, "probability": 1.0 },
      { "from": "left", "to": "top", "morphDuration": 8, "probability": 1.0 }
    ]
  }],
  "currentVersion": 1
}
```

### Storage Key
```
preset:journey:Midnight Caravan
```

### UI Placement
```
┌─ JOURNEY ──────────────────────────────────────┐
│ [Midnight Caravan ▾]  v1  [◀ ▶]  [Save] [As]  │
│                                                 │
│         [Top]                                   │
│        ╱    ╲                                   │
│  [Left]──────[Right]                            │
│        ╲    ╱                                   │
│        [Bottom]                                 │
│  Morph: 4b   6b   4b   8b                      │
└─────────────────────────────────────────────────┘
```

---

## Visual Summary (Full UI Stack)

```
┌──────────────────────────────────────────────────────┐
│ JOURNEY: [Midnight Caravan ▾] v1 [◀▶] [💾] [As]      │ ← Level 5
├──────────────────────────────────────────────────────┤
│ STATE: [Desert Night ▾] v1 [◀▶] [💾]                  │ ← Level 4
├──────────────────────────────────────────────────────┤
│ [Global] [Synth] [Drums] [Reverb] [Granular] [Earth] │ ← Tabs
├──────────────────────────────────────────────────────┤
│ SOURCE: [Ambient Drums ▾] v1 [◀▶] [💾] [As]          │ ← Level 3
│                                                       │   (per tab)
│ KIT: [Ambient Kit ▾] v1 [◀▶] [💾] [As]               │ ← Level 2
│                                                       │   (drums only)
│ ┌─ KICK ───────────────────────────────────────────┐  │
│ │ [808 Boom ▾]  v2  [◀ ▶]  [💾]                   │  │ ← Level 1
│ │ Freq [====]  Decay [====]  Click [====]  ...     │  │   (per voice)
│ └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Loading Rules

| Action | What changes | What stays |
|--------|-------------|------------|
| Load voice preset (e.g. kick) | That one voice | Other voices, kit, other tabs, mixer, sequencer |
| Load drum kit | All 7 drum voices | Sequencer, delay, mixer, other tabs |
| Load Synth source preset | All Synth tab params (pads, leads, synth seq) | Drums, Reverb, Granular, Earth, Global |
| Load Drums source preset | All Drums tab params (kit + drum seq + delay) | Synth, Reverb, Granular, Earth, Global |
| Load Reverb source preset | All Reverb tab params | Synth, Drums, Granular, Earth, Global |
| Load Granular source preset | All Granular tab params (looper, grain, looper seq) | Synth, Drums, Reverb, Earth, Global |
| Load Earth source preset | All Earth tab params (water, ocean, insects) | Synth, Drums, Reverb, Granular, Global |
| Load state preset | Everything (all 5 sources + global) | Other journey nodes |
| Load journey | Everything | Nothing |

---

## Reference-Based Architecture

Higher levels store **pointers** (preset name + version) to lower levels, not embedded
copies. Each level only saves its own params + references to child presets.

| Level | What it saves directly | What it references |
|-------|----------------------|-------------------|
| L1 | Engine sound params (own keys only) | — |
| L2 | Distance, variation, morph config (56 params) | 7 × L1 voice preset refs (by name) |
| L3 | Mixer, delay, sends + L3-owned config | L2 kit ref + L1 engine refs (euclidean, looper, etc.) |
| L4 | Global/Mixer params (23) | 5 × L3 source preset refs (by name) |
| L5 | Topology, phrase lengths, morph durations | 2–4 × L4 state preset refs (by name) |

### Loading: Reference Resolution
When loading a state preset (L4), the system:
1. Reads L4's 23 global params → applies directly
2. For each L3 source ref → looks up source preset by name/version from store
3. Each L3 source → reads its L1/L2 refs → looks those up too
4. Applies all resolved params to SliderState

### Editing Upstream Presets
- Editing an L1 voice preset (e.g. "808 Boom") affects ALL kits/sources/states
  that reference it by name (they resolve at load time, not at save time)
- To pin a specific version: references include version number
- To always get latest: omit version (or use `"version": "latest"`)

### Orphan Protection
- Deleting a preset that is referenced elsewhere shows a warning
- "Used by: Ambient Kit (L2), Ambient Drums (L3), Desert Night (L4)"
- Force-delete converts downstream references to inline snapshots

---

## Versioning

### How It Works
Every save pushes a new version onto a linear stack. No destructive overwrites.

```
"Ambient Kit" (Drums Source)
├── v3 (current) — "swapped membrane for tabla"
├── v2 — "new kick sound"
└── v1 — "initial"
```

### Version Navigation
```
[Ambient Kit ▾]  v3  [◀ ▶]  [Save]  [Save As]
```
- ◀ ▶ steps through versions with instant load
- Stepping is non-destructive (all versions persist)

### Version Limit
- **20 versions max** per preset (FIFO eviction of oldest)
- Factory presets: exactly 1 version, read-only
- Saving a factory preset auto-creates a user copy

### Diff Indicator
When stepping between versions, changed parameter rows flash briefly. No modal, inline only.

### Version Stack at Higher Levels
State versions capture specific child version numbers:
```json
{
  "synth": { "name": "Ambient Pads", "version": 2 },
  "drums": { "name": "Ambient Kit", "version": 3 },
  "reverb": { "name": "Blackhole", "version": 1 },
  "granular": { "name": "Shimmer Cloud", "version": 1 },
  "earth": { "name": "Rainforest Night", "version": 1 }
}
```
Restoring a state version restores the exact child versions it was saved with.

---

## Modified Indicator

Every level shows a dot when current params differ from last saved version:

```
Drums: [Ambient Kit ● ▾]     ← modified
Drums: [Ambient Kit ▾]       ← clean
```

---

## Storage Architecture

### Layered Approach

| Phase | Storage | Capacity |
|-------|---------|----------|
| **Prototype** | localStorage | ~5-10MB |
| **Production** | IndexedDB | 50MB+ |
| **Multi-device** | Supabase / Vercel KV | Cloud sync |
| **Samples** | Vercel Blob / S3 | Sample audio files |

### Key Scheme
```
preset:voice:drumKick:808 Boom
preset:kit:Ambient Kit
preset:source:synth:Ambient Pads
preset:source:drums:Ambient Kit
preset:source:reverb:Blackhole
preset:source:granular:Shimmer Cloud
preset:source:earth:Rainforest Night
preset:state:Desert Night
preset:journey:Midnight Caravan
```

### Abstraction Layer
```typescript
const PresetStore = {
  async save(key: string, data: unknown): Promise<void>,
  async load(key: string): Promise<unknown | null>,
  async list(prefix: string): Promise<string[]>,
  async delete(key: string): Promise<void>,
  async exportJSON(key: string): Promise<Blob>,
  async importJSON(file: File): Promise<void>,
};
```

**Critical**: Use `async` from day one, even for localStorage.

### Factory vs User Presets
- Factory drum presets: `/presets/DrumSynth/*.json` (7 voice manifests)
- Factory lead presets: `/presets/Lead4opFM/*.json` (17 presets)
- Factory full presets: `/presets/*.json` (5: Gamelantest, Lasers, Static_frequencies, StringWavesR, ZoneOut1)
- Factory reverb presets: 8 character presets from `REVERB_CHARACTER_PRESETS` in ReverbPage.tsx
- User presets: localStorage → IndexedDB
- Cloud presets: Supabase (already implemented via CloudPresets.tsx)
- Lock icon on factory presets; cannot overwrite/delete

### Export / Import
- Downloads `.json` with full preset + all versions embedded
- Works at any level (single voice, source page, state, journey)

---

## Interim: File-Based Export / Import (Before Full Hierarchy)

> **Context:** The full 5-level preset system doesn't exist yet. Today the app
> only has L4 State save/load (full `SliderState` → `.json` file). This section
> defines a **temporary** file-based export/import layer that works with
> the current codebase — no localStorage, no IndexedDB, no new stores needed.
> Just "download `.json`" and "upload `.json`" buttons alongside existing presets.

### What Exists Today (Current Implementation)

| Level | Factory Presets | User Save/Load | Export/Import |
|-------|----------------|---------------|---------------|
| **L1 Engine** | ✅ 161 drum, 18 pad, 17 FM lead, 4 water, 20 LFO, 18 looper (hardcoded/JSON) | ❌ None | ❌ None |
| **L2 Kit Preset** | ❌ None (kit config lives as flat keys in SliderState) | ❌ None | ❌ None |
| **L3 Source** | ❌ None | ❌ None | ❌ None |
| **L4 State** | ✅ 5 factory (Gamelantest, Lasers, Static_frequencies, StringWavesR, ZoneOut1) | ✅ **Full** — `handleSavePreset` / `handleLoadPreset` in App.tsx | ✅ File download + file upload + URL share + Supabase cloud |
| **L5 Journey** | ❌ None | ❌ None (runtime-only via `useJourney` hook) | ❌ None |

**Key findings:**
- **No localStorage** is used anywhere — the `savedPresets` list exists only in
  volatile React state (lost on page refresh unless re-loaded from file/cloud)
- L4 export uses `showSaveFilePicker()` with `<a download>` fallback
- L4 import uses `<input type="file" accept=".json">` with `migratePreset()` +
  `normalizePresetForWeb()` migration pipeline
- Cloud sharing via Supabase uploads the full `SliderState` JSONB

### Interim Export/Import Plan

Add "Download" + "Upload" button pairs to extract/inject **subsets** of the
current `SliderState` at each level, using the same `.json` file mechanism
that L4 already uses. No new stores — just slice the current state.

#### What Can Be Exported/Imported Per Level

| Level | What Gets Exported | Source of Params | Format |
|-------|-------------------|-----------------|--------|
| **L1 Engine** | A single engine's sound params (e.g. 48 pad1 params, 11 kick params) | Slice current `SliderState` by prefix | `{ "type": "engine", "engine": "pad1", "params": { ... } }` |
| **L2 Kit Preset** | One kit's performance params (e.g. 10 pad1 kit params, 56 drum kit params) | Slice current `SliderState` by L2 keys | `{ "type": "kit-preset", "source": "pad1", "params": { ... } }` |
| **L3 Source** | All params for one tab/page (e.g. full Synth page = L3 + L2 refs + L1 refs) | Slice current `SliderState` by source page | `{ "type": "source", "source": "synth", "params": { ... } }` |
| **L4 State** | ✅ Already works — full `SliderState` | Entire `SliderState` | Existing `SavedPreset` format |
| **L5 Journey** | Journey topology + node preset names | `JourneyConfig` from `useJourney` hook | `{ "type": "journey", "config": { nodes, connections, ... } }` |

#### Interim File Format

```json
{
  "kesshoPreset": true,
  "version": 1,
  "type": "engine | kit-preset | source | state | journey",
  "engine": "pad1 | drumKick | lead1 | water | ...",
  "source": "synth | drums | reverb | granular | earth",
  "name": "My Cool Pad Sound",
  "exportedAt": "2026-03-05T12:00:00Z",
  "appVersion": "1.0.0",
  "params": { "padOscAWave": "sine", "padOscAOctave": 0, "..." : "..." }
}
```

The `kesshoPreset: true` marker lets the import function distinguish these
from legacy `SavedPreset` files (which have `{ name, timestamp, state }`).

#### Implementation: Extract/Inject Per Level

```typescript
// Uses PARAM_REGISTRY (Appendix C) to know which keys belong to which level

function exportLevel(
  state: SliderState, level: PresetLevel, scope: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && info.scope === scope) {
      result[key] = state[key];
    }
  }
  return result;
}

function importLevel(
  state: SliderState, presetData: Record<string, unknown>,
  level: PresetLevel, scope: string
): SliderState {
  const merged = { ...state };
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && info.scope === scope && key in presetData) {
      merged[key] = presetData[key];
    }
  }
  return merged;
}
```

#### UI Placement

| Level | Where in UI | Export Button | Import Button |
|-------|------------|--------------|--------------|
| **L1** | Next to each engine preset dropdown (Pad 1, Drum Kick, Lead 1, etc.) | "↓ Export Sound" | "↑ Import Sound" |
| **L2** | In kit preset area (Drum Kit header, Synth page kit section) | "↓ Export Kit" | "↑ Import Kit" |
| **L3** | Per source page tab header (Synth, Drums, Reverb, Granular, Earth) | "↓ Export Page" | "↑ Import Page" |
| **L4** | Already exists in preset bar | ✅ Already exists | ✅ Already exists |
| **L5** | Journey panel header | "↓ Export Journey" | "↑ Import Journey" |

#### Priority Order

| Priority | Level | Why |
|----------|-------|-----|
| 1 | **L4 State** | ✅ Already done |
| 2 | **L3 Source (per-page)** | Highest value — share a complete Drums page or Synth page setup without overwriting everything |
| 3 | **L1 Engine** | Share individual pad/drum sounds — the creative building blocks |
| 4 | **L2 Kit Preset** | Share a drum kit configuration (which voices, morph settings) |
| 5 | **L5 Journey** | Share journey topology — least urgent, depends on journey save/load |

#### What This Buys Us (Before Full Hierarchy)

- Users can **back up** individual sounds, kits, and pages as `.json` files
- Users can **share** page-level presets with each other (send a Drums page file)
- Files are forward-compatible — when the full hierarchy ships, the same
  `PARAM_REGISTRY` slicing logic becomes the encoder for PresetStore
- No new storage mechanism needed — purely file download/upload
- Migration path: files exported now will load into the full system later
  (same `type` + `params` structure, just needs a name + version wrapper)

#### Limitations (Honest)

- **No preset browser** — no saved list, no dropdown, no search; just files
- **No versioning** — each export is a standalone snapshot
- **No references** — L3 exports embed all L2+L1 params inline (not by name ref)
- **No back-reference resolution** — importing L1 doesn't update any L2/L3 that
  referenced the old values
- **Lost on page refresh** — the in-memory preset list is volatile (this is already
  true for L4 today unless saved to file/cloud)

These limitations are acceptable for an interim solution. The full hierarchy
(PresetStore + PARAM_REGISTRY + reference resolution) replaces all of this.

---

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| 0 | TypeScript types for all preset levels | 1h |
| 1 | Extract/inject helpers per source page | 3h |
| 2 | PresetStore abstraction (localStorage backend) | 1h |
| 3 | Level 1: Drum voice preset save/load/versioning UI | 3h |
| 3.5 | Level 1.5: Drum kit preset save/load UI | 2h |
| 4 | Level 1: Pad 1/2 + Lead 1/2 voice preset UI | 2h |
| 5 | Level 2: Drums source preset (kit + seq + delay + mixer) | 2h |
| 6 | Level 2: Synth source preset | 2h |
| 7 | Level 2: Reverb source preset (migrate character presets to storage) | 1h |
| 8 | Level 2: Granular source preset | 2h |
| 9 | Level 2: Earth source preset | 1h |
| 10 | JSON export/import at all levels | 1h |
| 11 | Modified indicator (dirty flag) | 1h |
| 12 | Version diff highlighting | 1h |
| 13 | Level 3: State preset (composes 5 sources + global) | 2h |
| 14 | Level 4: Journey preset | 2h |
| 15 | Migrate existing `SavedPreset` → structured format | 1h |
| 16 | IndexedDB migration | 2h |
| 17 | Cloud sync enhancement (Supabase) | 4h |

### Critical Path
0 → 1 → 2 → 3 → 3.5 → 5 → 13 → 14 (depth-first through hierarchy).
Phases 4, 6–9 can be parallelized.

---

## Appendix A: Parameter Counts by Source Page

| Source Page | Sound Engine | Config/Routing | Total |
|------------|------------:|---------------:|------:|
| Global/Mixer | 0 | 23 | **23** |
| Synth | 163 | 36 | **199** |
| Drums | 180 | 69 | **249** |
| Reverb | 16 | 2 | **18** |
| Granular (Looper) | 139 | 35 | **174** |
| Earth | 34 | 19 | **53** |
| **Total** | **532** | **184** | **~716** |

---

## Appendix B: Source Page → Tab Mapping

| Source Preset | UI Tab | Tab Icon |
|-------------|--------|----------|
| Global/Mixer | Global | ⋯ |
| Synth | Synth | ♪ |
| Drums | Drums | ⋮⋮ |
| Reverb | Reverb | ◈ |
| Granular | Granular | ∿ |
| Earth | Earth | ◉ |

Each Source Preset maps 1:1 to a tab. Loading a source preset replaces everything
visible on that tab. This makes the preset system intuitive — "save what I see,
load what I see."

---

## Appendix C: Complete Parameter Ownership Audit

> **Rule**: Every SliderState key lives at exactly ONE level. Higher levels store
> **name references** to lower levels — they don't duplicate params. This table is the
> canonical source of truth for which level owns each parameter.
>
> **Legend**: L1 = Sound Engine, L2 = Kit Preset (assembly/performance),
> L3 = Source Preset (mixer/routing/delay), L4 = Global/State.

### Level 4 — Global / State (23 params)

These are cross-cutting params not belonging to any single source tab.

| # | Key | Notes |
|---|-----|-------|
| 1 | `masterVolume` | Master output |
| 2 | `synthLevel` | Pad 1 dry level |
| 3 | `pad2Level` | Pad 2 dry level |
| 4 | `granularLevel` | Granular output level |
| 5 | `synthReverbSend` | Pad 1 → reverb |
| 6 | `granularReverbSend` | Granular → reverb |
| 7 | `leadReverbSend` | Lead → reverb |
| 8 | `leadDelayReverbSend` | Lead delay → reverb |
| 9 | `reverbLevel` | Reverb output level |
| 10 | `seedWindow` | 'hour' / 'day' |
| 11 | `randomness` | Global randomness |
| 12 | `rootNote` | Master root note (0–11) |
| 13 | `cofDriftEnabled` | Circle-of-fifths drift on/off |
| 14 | `cofDriftRate` | Phrases between key changes |
| 15 | `cofDriftDirection` | 'cw' / 'ccw' / 'random' |
| 16 | `cofDriftRange` | Max steps from home key |
| 17 | `cofCurrentStep` | Current CoF position |
| 18 | `scaleMode` | 'auto' / 'manual' |
| 19 | `manualScale` | Scale family name |
| 20 | `tension` | Harmonic tension |
| 21 | `chordRate` | Seconds between chord changes |
| 22 | `voicingSpread` | Voicing spread width |
| 23 | `randomWalkSpeed` | Speed of random walk for dual sliders |

---

### Level 3 — Synth Source (9 params)

Shared lead controls and master lead settings that live at L3 (not part of any L2 kit preset).

| # | Key | Sub-group | Notes |
|---|-----|-----------|-------|
| 1 | `leadEnabled` | Lead master | Master lead on/off |
| 2 | `leadRandomEnabled` | Lead master | Random timing mode |
| 3 | `leadLevel` | Lead master | Master lead output level |
| 4 | `leadDelayTime` | Shared lead delay | Delay time (ms) |
| 5 | `leadDelayFeedback` | Shared lead delay | Feedback amount |
| 6 | `leadDelayMix` | Shared lead delay | Wet/dry mix |
| 7 | `leadVibratoDepth` | Shared lead perf | Vibrato depth |
| 8 | `leadVibratoRate` | Shared lead perf | Vibrato rate |
| 9 | `leadGlide` | Shared lead perf | Portamento speed |

---

### Level 2 — Pad 1 Kit Preset (10 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `padEnabled` | Master on/off for pad 1 |
| 2 | `padPresetA` | Morph source preset name |
| 3 | `padPresetB` | Morph target preset name |
| 4 | `padMorph` | 0–1 morph position |
| 5 | `padMorphAuto` | Auto-morph on/off |
| 6 | `padMorphSpeed` | Phrases per morph cycle |
| 7 | `synthVoiceMask` | Voice bitmask — which voices pad 1 uses |
| 8 | `waveSpread` | Voice stagger timing |
| 9 | `detune` | Voice detuning |
| 10 | `synthOctave` | Octave offset |

### Level 2 — Pad 2 Kit Preset (8 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `pad2Enabled` | Master on/off for pad 2 |
| 2 | `pad2PresetA` | Morph source preset name |
| 3 | `pad2PresetB` | Morph target preset name |
| 4 | `pad2Morph` | 0–1 morph position |
| 5 | `pad2MorphAuto` | Auto-morph on/off |
| 6 | `pad2MorphSpeed` | Phrases per morph cycle |
| 7 | `pad2VoiceAssign` | Voice routing bitmask |
| 8 | `pad2Octave` | Octave offset |

### Level 2 — Lead 1 Kit Preset (8 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead1PresetA` | FM preset A name |
| 2 | `lead1PresetB` | FM preset B name |
| 3 | `lead1Morph` | 0–1 morph position |
| 4 | `lead1MorphAuto` | Auto-morph on/off |
| 5 | `lead1MorphSpeed` | Phrases per morph cycle |
| 6 | `lead1MorphMode` | linear / pingpong / random |
| 7 | `lead1AlgorithmMode` | snap / presetA |
| 8 | `lead1Level` | Lead 1 output level |

### Level 2 — Lead 2 Kit Preset (9 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead2Enabled` | Lead 2 on/off |
| 2 | `lead2PresetC` | FM preset C name |
| 3 | `lead2PresetD` | FM preset D name |
| 4 | `lead2Morph` | 0–1 morph position |
| 5 | `lead2MorphAuto` | Auto-morph on/off |
| 6 | `lead2MorphSpeed` | Phrases per morph cycle |
| 7 | `lead2MorphMode` | linear / pingpong / random |
| 8 | `lead2AlgorithmMode` | snap / presetA |
| 9 | `lead2Level` | Lead 2 output level |

---

### Level 1 — Pad 1 Engine (48 params)

| # | Key | Sub-group |
|---|-----|-----------|
| 1 | `padOscAWave` | Osc A |
| 2 | `padOscAOctave` | Osc A |
| 3 | `padOscADetune` | Osc A |
| 4 | `padOscALevel` | Osc A |
| 5 | `padOscBWave` | Osc B |
| 6 | `padOscBOctave` | Osc B |
| 7 | `padOscBDetune` | Osc B |
| 8 | `padOscBLevel` | Osc B |
| 9 | `padSubEnabled` | Sub osc |
| 10 | `padSubOctave` | Sub osc |
| 11 | `padSubWave` | Sub osc |
| 12 | `padSubLevel` | Sub osc |
| 13 | `padNoiseType` | Noise |
| 14 | `padNoiseLevel` | Noise |
| 15 | `filterType` | Filter A |
| 16 | `filterCutoffMin` | Filter A |
| 17 | `filterCutoffMax` | Filter A |
| 18 | `filterResonance` | Filter A |
| 19 | `filterQ` | Filter A |
| 20 | `padFilterBEnabled` | Filter B |
| 21 | `padFilterBType` | Filter B |
| 22 | `padFilterBCutoff` | Filter B |
| 23 | `padFilterBResonance` | Filter B |
| 24 | `padFilterBQ` | Filter B |
| 25 | `padFilterRouting` | Filter routing |
| 26 | `hardness` | Drive/Character |
| 27 | `warmth` | Drive/Character |
| 28 | `presence` | Drive/Character |
| 29 | `synthAttack` | ADSR |
| 30 | `synthDecay` | ADSR |
| 31 | `synthSustain` | ADSR |
| 32 | `synthRelease` | ADSR |
| 33 | `padLfo1Rate` | LFO 1 |
| 34 | `padLfo1Depth` | LFO 1 |
| 35 | `padLfo1Wave` | LFO 1 |
| 36 | `padLfo1Dest` | LFO 1 |
| 37 | `padLfo2Rate` | LFO 2 |
| 38 | `padLfo2Depth` | LFO 2 |
| 39 | `padLfo2Wave` | LFO 2 |
| 40 | `padLfo2Dest` | LFO 2 |
| 41 | `padModEnvEnabled` | Mod Envelope |
| 42 | `padModEnvAttack` | Mod Envelope |
| 43 | `padModEnvDecay` | Mod Envelope |
| 44 | `padModEnvSustain` | Mod Envelope |
| 45 | `padModEnvRelease` | Mod Envelope |
| 46 | `padModEnvDepth` | Mod Envelope |
| 47 | `padModEnvDest` | Mod Envelope |
| 48 | `padOscMix` | Osc crossfade |

> `synthOctave`, `waveSpread`, `detune` moved to **L2 Pad 1 Kit Preset**.

---

### Level 1 — Pad 2 Engine (48 params)

| # | Key | Sub-group |
|---|-----|-----------|
| 1 | `pad2Attack` | ADSR |
| 2 | `pad2Decay` | ADSR |
| 3 | `pad2Sustain` | ADSR |
| 4 | `pad2Release` | ADSR |
| 5 | `pad2Hardness` | Drive/Character |
| 6 | `pad2Warmth` | Drive/Character |
| 7 | `pad2Presence` | Drive/Character |
| 8 | `pad2OscMix` | Osc crossfade |
| 9 | `pad2FilterType` | Filter A |
| 10 | `pad2FilterCutoffMin` | Filter A |
| 11 | `pad2FilterCutoffMax` | Filter A |
| 12 | `pad2FilterResonance` | Filter A |
| 13 | `pad2FilterQ` | Filter A |
| 14 | `pad2OscAWave` | Osc A |
| 15 | `pad2OscAOctave` | Osc A |
| 16 | `pad2OscADetune` | Osc A |
| 17 | `pad2OscALevel` | Osc A |
| 18 | `pad2OscBWave` | Osc B |
| 19 | `pad2OscBOctave` | Osc B |
| 20 | `pad2OscBDetune` | Osc B |
| 21 | `pad2OscBLevel` | Osc B |
| 22 | `pad2SubEnabled` | Sub osc |
| 23 | `pad2SubOctave` | Sub osc |
| 24 | `pad2SubWave` | Sub osc |
| 25 | `pad2SubLevel` | Sub osc |
| 26 | `pad2NoiseType` | Noise |
| 27 | `pad2NoiseLevel` | Noise |
| 28 | `pad2FilterBEnabled` | Filter B |
| 29 | `pad2FilterBType` | Filter B |
| 30 | `pad2FilterBCutoff` | Filter B |
| 31 | `pad2FilterBResonance` | Filter B |
| 32 | `pad2FilterBQ` | Filter B |
| 33 | `pad2FilterRouting` | Filter routing |
| 34 | `pad2Lfo1Rate` | LFO 1 |
| 35 | `pad2Lfo1Depth` | LFO 1 |
| 36 | `pad2Lfo1Wave` | LFO 1 |
| 37 | `pad2Lfo1Dest` | LFO 1 |
| 38 | `pad2Lfo2Rate` | LFO 2 |
| 39 | `pad2Lfo2Depth` | LFO 2 |
| 40 | `pad2Lfo2Wave` | LFO 2 |
| 41 | `pad2Lfo2Dest` | LFO 2 |
| 42 | `pad2ModEnvEnabled` | Mod Envelope |
| 43 | `pad2ModEnvAttack` | Mod Envelope |
| 44 | `pad2ModEnvDecay` | Mod Envelope |
| 45 | `pad2ModEnvSustain` | Mod Envelope |
| 46 | `pad2ModEnvRelease` | Mod Envelope |
| 47 | `pad2ModEnvDepth` | Mod Envelope |
| 48 | `pad2ModEnvDest` | Mod Envelope |

> `pad2Octave` moved to **L2 Pad 2 Kit Preset**.

---

### Level 1 — Lead 1 Engine (9 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead1UseCustomAdsr` | Use custom ADSR vs preset ADSR |
| 2 | `lead1Attack` | Attack time |
| 3 | `lead1Decay` | Decay time |
| 4 | `lead1Sustain` | Sustain level |
| 5 | `lead1Hold` | Hold time |
| 6 | `lead1Release` | Release time |
| 7 | `lead1Density` | Notes per phrase (sparseness) |
| 8 | `lead1Octave` | Octave offset |
| 9 | `lead1OctaveRange` | Octave span for random notes |

> `leadTimbre` dropped (legacy param ignored by 4op FM engine).

---

### Level 1 — Lead 2 Engine (6 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead2UseCustomAdsr` | Use custom ADSR vs preset ADSR |
| 2 | `lead2Attack` | Attack time |
| 3 | `lead2Decay` | Decay time |
| 4 | `lead2Sustain` | Sustain level |
| 5 | `lead2Hold` | Hold time |
| 6 | `lead2Release` | Release time |

---

### Level 1 — Synth Euclidean Engine (43 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `synthEuclideanMasterEnabled` | Master on/off |
| 2 | `synthEuclideanTempo` | Tempo multiplier |
| 3 | `synthChordSequencerEnabled` | Chord seq toggle |
| 4–13 | `synthEuclid1Enabled/Preset/Steps/Hits/Rotation/NoteMin/NoteMax/Level/Probability/Source` | Lane 1 (10 params) |
| 14–23 | `synthEuclid2*` | Lane 2 (10 params) |
| 24–33 | `synthEuclid3*` | Lane 3 (10 params) |
| 34–43 | `synthEuclid4*` | Lane 4 (10 params) |

---

### Level 3 — Drums Source Config (17 params)

| # | Key | Sub-group | Notes |
|---|-----|-----------|-------|
| 1 | `drumEnabled` | Drum mixer | Master on/off |
| 2 | `drumLevel` | Drum mixer | Master volume |
| 3 | `drumReverbSend` | Drum mixer | Master reverb send |
| 4 | `drumMorphSliderAnimate` | Drum mixer | UI: animate sliders on morph |
| 5 | `drumDelayEnabled` | Drum delay | Delay on/off |
| 6 | `drumDelayNoteL` | Drum delay | Left note division |
| 7 | `drumDelayNoteR` | Drum delay | Right note division |
| 8 | `drumDelayFeedback` | Drum delay | Feedback amount |
| 9 | `drumDelayMix` | Drum delay | Wet/dry mix |
| 10 | `drumDelayFilter` | Drum delay | Tone filter cutoff |
| 11 | `drumSubDelaySend` | Per-voice delay send | Sub → delay |
| 12 | `drumKickDelaySend` | Per-voice delay send | Kick → delay |
| 13 | `drumClickDelaySend` | Per-voice delay send | Click → delay |
| 14 | `drumBeepHiDelaySend` | Per-voice delay send | BeepHi → delay |
| 15 | `drumBeepLoDelaySend` | Per-voice delay send | BeepLo → delay |
| 16 | `drumNoiseDelaySend` | Per-voice delay send | Noise → delay |
| 17 | `drumMembraneDelaySend` | Per-voice delay send | Membrane → delay |

> Morph config (7×6 = 42 params) + distance/variation (7×2 = 14 params) moved to **L2 Drum Kit**.

---

### Level 1 — Drum Sub Engine (10 params)

| # | Key |
|---|-----|
| 1 | `drumSubFreq` |
| 2 | `drumSubDecay` |
| 3 | `drumSubLevel` |
| 4 | `drumSubTone` |
| 5 | `drumSubShape` |
| 6 | `drumSubPitchEnv` |
| 7 | `drumSubPitchDecay` |
| 8 | `drumSubDrive` |
| 9 | `drumSubSub` |
| 10 | `drumSubAttack` |

> `drumSubVariation`, `drumSubDistance` moved to **L2 Drum Kit**.

### Level 1 — Drum Kick Engine (11 params)

| # | Key |
|---|-----|
| 1 | `drumKickFreq` |
| 2 | `drumKickPitchEnv` |
| 3 | `drumKickPitchDecay` |
| 4 | `drumKickDecay` |
| 5 | `drumKickLevel` |
| 6 | `drumKickClick` |
| 7 | `drumKickBody` |
| 8 | `drumKickPunch` |
| 9 | `drumKickTail` |
| 10 | `drumKickTone` |
| 11 | `drumKickAttack` |

> `drumKickVariation`, `drumKickDistance` moved to **L2 Drum Kit**.

### Level 1 — Drum Click Engine (13 params)

| # | Key |
|---|-----|
| 1 | `drumClickDecay` |
| 2 | `drumClickFilter` |
| 3 | `drumClickTone` |
| 4 | `drumClickLevel` |
| 5 | `drumClickResonance` |
| 6 | `drumClickPitch` |
| 7 | `drumClickPitchEnv` |
| 8 | `drumClickMode` |
| 9 | `drumClickGrainCount` |
| 10 | `drumClickGrainSpread` |
| 11 | `drumClickStereoWidth` |
| 12 | `drumClickExciterColor` |
| 13 | `drumClickAttack` |

> `drumClickVariation`, `drumClickDistance` moved to **L2 Drum Kit**.

### Level 1 — Drum BeepHi Engine (18 params)

| # | Key |
|---|-----|
| 1 | `drumBeepHiFreq` |
| 2 | `drumBeepHiAttack` |
| 3 | `drumBeepHiDecay` |
| 4 | `drumBeepHiLevel` |
| 5 | `drumBeepHiTone` |
| 6 | `drumBeepHiInharmonic` |
| 7 | `drumBeepHiPartials` |
| 8 | `drumBeepHiShimmer` |
| 9 | `drumBeepHiShimmerRate` |
| 10 | `drumBeepHiBrightness` |
| 11 | `drumBeepHiFeedback` |
| 12 | `drumBeepHiModEnvDecay` |
| 13 | `drumBeepHiNoiseInMod` |
| 14 | `drumBeepHiModRatio` |
| 15 | `drumBeepHiModRatioFine` |
| 16 | `drumBeepHiModPhase` |
| 17 | `drumBeepHiModEnvEnd` |
| 18 | `drumBeepHiNoiseDecay` |

> `drumBeepHiVariation`, `drumBeepHiDistance` moved to **L2 Drum Kit**.

### Level 1 — Drum BeepLo Engine (17 params)

| # | Key |
|---|-----|
| 1 | `drumBeepLoFreq` |
| 2 | `drumBeepLoAttack` |
| 3 | `drumBeepLoDecay` |
| 4 | `drumBeepLoLevel` |
| 5 | `drumBeepLoTone` |
| 6 | `drumBeepLoPitchEnv` |
| 7 | `drumBeepLoPitchDecay` |
| 8 | `drumBeepLoBody` |
| 9 | `drumBeepLoPluck` |
| 10 | `drumBeepLoPluckDamp` |
| 11 | `drumBeepLoModal` |
| 12 | `drumBeepLoModalQ` |
| 13 | `drumBeepLoModalInharmonic` |
| 14 | `drumBeepLoModalSpread` |
| 15 | `drumBeepLoModalCut` |
| 16 | `drumBeepLoOscGain` |
| 17 | `drumBeepLoModalGain` |

> `drumBeepLoVariation`, `drumBeepLoDistance` moved to **L2 Drum Kit**.

### Level 1 — Drum Noise Engine (17 params)

| # | Key |
|---|-----|
| 1 | `drumNoiseFilterFreq` |
| 2 | `drumNoiseFilterQ` |
| 3 | `drumNoiseFilterType` |
| 4 | `drumNoiseDecay` |
| 5 | `drumNoiseLevel` |
| 6 | `drumNoiseAttack` |
| 7 | `drumNoiseFormant` |
| 8 | `drumNoiseBreath` |
| 9 | `drumNoiseFilterEnv` |
| 10 | `drumNoiseFilterEnvDecay` |
| 11 | `drumNoiseDensity` |
| 12 | `drumNoiseColorLFO` |
| 13 | `drumNoiseParticleSize` |
| 14 | `drumNoiseParticleRandom` |
| 15 | `drumNoiseParticleRandomRate` |
| 16 | `drumNoiseRatchetCount` |
| 17 | `drumNoiseRatchetTime` |

> `drumNoiseVariation`, `drumNoiseDistance` moved to **L2 Drum Kit**.

### Level 1 — Drum Membrane Engine (21 params)

| # | Key |
|---|-----|
| 1 | `drumMembraneExciter` |
| 2 | `drumMembraneExcPos` |
| 3 | `drumMembraneExcBright` |
| 4 | `drumMembraneExcDur` |
| 5 | `drumMembraneSize` |
| 6 | `drumMembraneTension` |
| 7 | `drumMembraneDamping` |
| 8 | `drumMembraneMaterial` |
| 9 | `drumMembraneNonlin` |
| 10 | `drumMembraneWireMix` |
| 11 | `drumMembraneWireDensity` |
| 12 | `drumMembraneWireTone` |
| 13 | `drumMembraneWireDecay` |
| 14 | `drumMembraneBody` |
| 15 | `drumMembraneRing` |
| 16 | `drumMembraneOvertones` |
| 17 | `drumMembranePitchEnv` |
| 18 | `drumMembranePitchDecay` |
| 19 | `drumMembraneAttack` |
| 20 | `drumMembraneDecay` |
| 21 | `drumMembraneLevel` |

> `drumMembraneVariation`, `drumMembraneDistance` moved to **L2 Drum Kit**.

---

### Level 1 — Drum Euclidean Engine (69 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `drumEuclidMasterEnabled` | Master on/off |
| 2 | `drumEuclidBaseBPM` | Base BPM |
| 3 | `drumEuclidTempo` | Tempo multiplier |
| 4 | `drumEuclidSwing` | Swing % |
| 5 | `drumEuclidDivision` | Division (4/8/16/32) |
| 6–21 | `drumEuclid1Enabled/Preset/Steps/Hits/Rotation/TargetSub/TargetKick/TargetClick/TargetBeepHi/TargetBeepLo/TargetNoise/TargetMembrane/Probability/VelocityMin/VelocityMax/Level` | Lane 1 (16 params) |
| 22–37 | `drumEuclid2*` | Lane 2 (16 params) |
| 38–53 | `drumEuclid3*` | Lane 3 (16 params) |
| 54–69 | `drumEuclid4*` | Lane 4 (16 params) |

---

### Level 3 — Reverb Source (18 params)

All reverb params are source-level (no separate engine preset for reverb).

| # | Key | Sub-group |
|---|-----|-----------|
| 1 | `reverbEnabled` | Config |
| 2 | `reverbEngine` | Core |
| 3 | `reverbType` | Core |
| 4 | `reverbQuality` | Core |
| 5 | `reverbDecay` | Core |
| 6 | `reverbSize` | Core |
| 7 | `reverbDiffusion` | Core |
| 8 | `reverbModulation` | Mod |
| 9 | `predelay` | Mod |
| 10 | `damping` | Mod |
| 11 | `width` | Mod |
| 12 | `reverbShimmer` | Shimmer |
| 13 | `reverbShimmerPitch` | Shimmer |
| 14 | `reverbSlowModRate` | Slow Mod |
| 15 | `reverbSlowModDepth` | Slow Mod |
| 16 | `reverbFreeze` | Config |
| 17 | `reverbReverse` | Reverse |
| 18 | `reverbReverseLength` | Reverse |

---

### Level 3 — Granular Source Config (22 params)

| # | Key | Sub-group | Notes |
|---|-----|-----------|-------|
| 1 | `granularEnabled` | Config | Legacy granular on/off |
| 2 | `looperEnabled` | Looper master | Looper on/off |
| 3 | `looperDryWet` | Looper master | Output wet level |
| 4 | `looperFreeze` | Looper master | Stop write head |
| 5 | `looperFeedback` | Looper master | Global feedback |
| 6 | `looperFeedbackLPF` | Looper master | Feedback darkening |
| 7 | `looperBufferSeconds` | Looper master | Buffer length |
| 8 | `looperReverbSend` | Looper master | Reverb send |
| 9 | `looperPad1Send` | Looper sends | Pad 1 → looper |
| 10 | `looperPad2Send` | Looper sends | Pad 2 → looper |
| 11 | `looperLead1Send` | Looper sends | Lead 1 → looper |
| 12 | `looperLead2Send` | Looper sends | Lead 2 → looper |
| 13 | `looperDrumSend` | Looper sends | Drums → looper |
| 14 | `looperWavesSend` | Looper sends | Waves → looper |
| 15 | `looperDelayEnabled` | Looper delay | Delay on/off |
| 16 | `looperDelayActivity` | Looper delay | Tap count + syncopation |
| 17 | `looperDelayRepeats` | Looper delay | Feedback cycles |
| 18 | `looperDelayTime` | Looper delay | Note division |
| 19 | `looperDelayFilter` | Looper delay | Tone LPF |
| 20 | `looperDelayVibrato` | Looper delay | Per-tap modulation |
| 21 | `looperDelayMix` | Looper delay | Wet level |
| 22 | `looperDelayReverbSend` | Looper delay | Delay → reverb |

> Voice enabled/gain (8) + macros (4) moved to **L2 Looper Kit Preset**.
> `looperPreset` dropped (UI-only shortcut, not saved).

---

### Level 2 — Looper Kit Preset (12 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `looperV1Enabled` | Voice 1 on/off |
| 2 | `looperV1Gain` | Voice 1 output level |
| 3 | `looperV2Enabled` | Voice 2 on/off |
| 4 | `looperV2Gain` | Voice 2 output level |
| 5 | `looperV3Enabled` | Voice 3 on/off |
| 6 | `looperV3Gain` | Voice 3 output level |
| 7 | `looperV4Enabled` | Voice 4 on/off |
| 8 | `looperV4Gain` | Voice 4 output level |
| 9 | `looperMacroTexture` | Macro: blur/spray/grainSize |
| 10 | `looperMacroComplexity` | Macro: LFO rates/density |
| 11 | `looperMacroDarkness` | Macro: speed/pitch/filter |
| 12 | `looperMacroChaos` | Macro: reverse/spray/grainOct |

---

### Level 1 — Legacy Granular Engine (12 params)

| # | Key |
|---|-----|
| 1 | `maxGrains` |
| 2 | `grainProbability` |
| 3 | `grainSize` |
| 4 | `density` |
| 5 | `spray` |
| 6 | `jitter` |
| 7 | `grainPitchMode` |
| 8 | `pitchSpread` |
| 9 | `stereoSpread` |
| 10 | `feedback` |
| 11 | `wetHPF` |
| 12 | `wetLPF` |

### Level 1 — Looper Voice Engines (20 params × 4 voices = 80 params)

Each voice (V1–V4) has the same 20 engine params:

| # | Key pattern (replace N with 1–4) |
|---|-----------------------------------|
| 1 | `looperV{N}Mode` |
| 2 | `looperV{N}Slice` |
| 3 | `looperV{N}Speed` |
| 4 | `looperV{N}Reverse` |
| 5 | `looperV{N}Pitch` |
| 6 | `looperV{N}Attack` |
| 7 | `looperV{N}Decay` |
| 8 | `looperV{N}Blur` |
| 9 | `looperV{N}GrainOct` |
| 10 | `looperV{N}Spray` |
| 11 | `looperV{N}Density` |
| 12 | `looperV{N}GrainSize` |
| 13 | `looperV{N}Pan` |
| 14 | `looperV{N}PosLFORate` |
| 15 | `looperV{N}PosLFODepth` |
| 16 | `looperV{N}PanLFORate` |
| 17 | `looperV{N}StereoSpread` |
| 18 | `looperV{N}ReverseLFORate` |
| 19 | `looperV{N}WriteFollow` |
| 20 | `looperV{N}RecordLFORate` |

### Level 1 — Looper Legacy Engine (6 params)

| # | Key |
|---|-----|
| 1 | `looperLegacyJitter` |
| 2 | `looperLegacyProbability` |
| 3 | `looperLegacyPitchMode` |
| 4 | `looperLegacyPitchSpread` |
| 5 | `looperLegacyMaxGrains` |
| 6 | `looperLegacyFeedback` |

### Level 1 — Looper Euclidean Engine (41 params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `looperEuclidMasterEnabled` | Master on/off |
| 2 | `looperEuclidBaseBPM` | Base BPM |
| 3 | `looperEuclidTempo` | Tempo multiplier |
| 4 | `looperEuclidSwing` | Swing % |
| 5 | `looperEuclidDivision` | Division |
| 6–14 | `looperEuclid1Enabled/Preset/Steps/Hits/Rotation/Probability/VelocityMin/VelocityMax/Level` | Lane 1 (9 params) |
| 15–23 | `looperEuclid2*` | Lane 2 (9 params) |
| 24–32 | `looperEuclid3*` | Lane 3 (9 params) |
| 33–41 | `looperEuclid4*` | Lane 4 (9 params) |

---

### Level 2 — Earth Kit Preset (19 params)

All Earth config lives at L2 (L3 Earth Source is just a reference wrapper).

| # | Key | Sub-group | Notes |
|---|-----|-----------|-------|
| 1 | `waterEnabled` | Water config | Water engine on/off |
| 2 | `waterLevel` | Water config | Water output volume |
| 3 | `oceanSampleEnabled` | Ocean config | Sample on/off |
| 4 | `oceanSampleLevel` | Ocean config | Sample volume |
| 5 | `oceanWaveSynthEnabled` | Ocean config | Wave synth on/off |
| 6 | `oceanWaveSynthLevel` | Ocean config | Wave synth volume |
| 7 | `oceanReverbSend` | Ocean config | Ocean → reverb |
| 8 | `oceanFilterType` | Ocean engine | Filter type |
| 9 | `oceanFilterCutoff` | Ocean engine | Filter cutoff |
| 10 | `oceanFilterResonance` | Ocean engine | Filter resonance |
| 11 | `oceanDuration` | Ocean engine | Wave duration |
| 12 | `oceanInterval` | Ocean engine | Time between waves |
| 13 | `oceanFoam` | Ocean engine | Foam intensity |
| 14 | `oceanDepth` | Ocean engine | Low rumble |
| 15 | `insectsEnabled` | Insects 1 config | Insects 1 on/off |
| 16 | `insectsLevel` | Insects 1 config | Insects 1 volume |
| 17 | `insectsReverbSend` | Insects 1 config | Insects 1 → reverb |
| 18 | `insects2Enabled` | Insects 2 config | Insects 2 on/off |
| 19 | `insects2Level` | Insects 2 config | Insects 2 volume |

---

### Level 1 — Water Engine (18 params)

| # | Key |
|---|-----|
| 1 | `waterPreset` |
| 2 | `waterMorphA` |
| 3 | `waterMorphB` |
| 4 | `waterMorph` |
| 5 | `waterIntensity` |
| 6 | `waterRate` |
| 7 | `waterDistance` |
| 8 | `waterBaseFreq` |
| 9 | `waterDropSize` |
| 10 | `waterHardness` |
| 11 | `waterGlassThickness` |
| 12 | `waterSpace` |
| 13 | `waterLayerHardDrops` |
| 14 | `waterLayerWaterDrops` |
| 15 | `waterLayerTurbulence` |
| 16 | `waterLayerBubbling` |
| 17 | `waterLayerRoar` |
| 18 | `waterLayerRivulets` |

### Level 1 — Insects 1 Engine (8 params)

| # | Key |
|---|-----|
| 1 | `insectsEngine` |
| 2 | `insectsDensity` |
| 3 | `insectsTemperature` |
| 4 | `insectsDistance` |
| 5 | `insectsProximity` |
| 6 | `insectsAntiphony` |
| 7 | `insectsClickRate` |
| 8 | `insectsMotion` |

### Level 1 — Insects 2 Engine (8 params)

| # | Key |
|---|-----|
| 1 | `insects2Engine` |
| 2 | `insects2Density` |
| 3 | `insects2Temperature` |
| 4 | `insects2Distance` |
| 5 | `insects2Proximity` |
| 6 | `insects2Antiphony` |
| 7 | `insects2ClickRate` |
| 8 | `insects2Motion` |

---

### Ownership Totals

| Level | Scope | Param Count |
|-------|-------|-------------|
| **L4** | Global / State | **23** |
| **L3** | Synth Source | **9** |
| **L3** | Drums Source | **17** |
| **L3** | Reverb Source | **18** |
| **L3** | Granular Source | **22** |
| **L3** | Earth Source | **0** (ref to L2 only) |
| **L3 total** | | **66** |
| **L2** | Pad 1 Kit Preset | **10** |
| **L2** | Pad 2 Kit Preset | **8** |
| **L2** | Lead 1 Kit Preset | **8** |
| **L2** | Lead 2 Kit Preset | **9** |
| **L2** | Drum Kit | **56** (14 dist/var + 42 morph config) |
| **L2** | Looper Kit Preset | **12** (8 voice + 4 macros) |
| **L2** | Earth Kit Preset | **19** |
| **L2 total** | | **122** |
| **L1** | Pad 1 engine | **48** |
| **L1** | Pad 2 engine | **48** |
| **L1** | Lead 1 engine | **9** |
| **L1** | Lead 2 engine | **6** |
| **L1** | Synth Euclidean engine | **43** |
| **L1** | Drum Sub engine | **10** |
| **L1** | Drum Kick engine | **11** |
| **L1** | Drum Click engine | **13** |
| **L1** | Drum BeepHi engine | **18** |
| **L1** | Drum BeepLo engine | **17** |
| **L1** | Drum Noise engine | **17** |
| **L1** | Drum Membrane engine | **21** |
| **L1** | Drum Euclidean engine | **69** |
| **L1** | Water engine | **18** |
| **L1** | Insects 1 engine | **8** |
| **L1** | Insects 2 engine | **8** |
| **L1** | Legacy Granular engine | **12** |
| **L1** | Looper Voice × 4 | **80** |
| **L1** | Looper Legacy engine | **6** |
| **L1** | Looper Euclidean engine | **41** |
| **L1 total** | | **503** |
| | **Grand Total** | **714** |

> 716 original SliderState keys − `leadTimbre` (dropped, dead legacy) − `looperPreset` (UI-only shortcut) = **714**

### Resolved Assignments

All formerly-uncertain params now have definite owners:

| Key | Final Level | Rationale |
|-----|------------|-----------|
| `synthVoiceMask` | **L2 Pad 1 Kit Preset** | Defines which voices this pad uses — part of kit assembly |
| `pad2VoiceAssign` | **L2 Pad 2 Kit Preset** | Same — complementary to synthVoiceMask |
| `waveSpread` | **L2 Pad 1 Kit Preset** | Voice stagger timing — performance param, not sound engine |
| `detune` | **L2 Pad 1 Kit Preset** | Voice detuning — performance param |
| `synthOctave` | **L2 Pad 1 Kit Preset** | Octave offset — performance param |
| `pad2Octave` | **L2 Pad 2 Kit Preset** | Same as above for Pad 2 |
| `leadTimbre` | **DROPPED** | Dead legacy param ignored by 4op FM engine |
| `synthChordSequencerEnabled` | **L1 Synth Euclidean** | Tightly coupled to sequencer behavior |
| `looperPreset` | **DROPPED** | UI-only shortcut that bulk-sets L1+L2 params — not saved |

### No Double-Saves Verification

Every parameter appears in **exactly one** section above. The hierarchy is fully
reference-based — higher levels store **preset name pointers** to lower levels,
never embedded copies. When loading:
- L4 State resolves its L3 refs → each L3 resolves its L2 refs → each L2 resolves its L1 refs
- The canonical "owner" of each parameter is the level listed here
- L4 total: 23 + L3 total: 66 + L2 total: 122 + L1 total: 503 = **714 params**
- 716 original SliderState keys − `leadTimbre` (dropped) − `looperPreset` (UI-only) = **714** ✓