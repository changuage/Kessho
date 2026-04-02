# Preset Hierarchy Plan — v3.6

> **v3.6 sync revision** — March 30, 2026. Clocked Space (Delay B) is owned by the
> **L2 Delay Kit** in the normal Delay preset chain. L2 Granular Kit stores
> `granularDelayBSend`, `granularDelayReverbSend`, `delayBGranularLinked`, plus a
> **ref** to a companion L1 Clocked Space preset. When `delayBGranularLinked = true`
> and a Granular Kit is loaded, the Granular Kit's companion Clocked Space preset
> **overrides** the one that the Delay Kit would normally load. When linked = false,
> the Delay Kit's own Clocked Space preset is used. `granularDelayMix` removed
> (mix hardcoded to 1.0). Bidirectional mutual exclusion between Granular → Delay B
> and Delay B → Granular enforced in engine, UI, and routing matrix.

## Overview

A layered preset system where each level composes the levels below it. The hierarchy
mirrors the app's tab structure: each Source Page (Synth, Drums, Delay, Reverb,
Granular, Earth) has its own preset level containing sound engine presets, slider
values, and sequencer config.

## March 2026 Sync Update

- `granular*` is the canonical naming now. Older `looper*` language in this doc is historical and should not be used for new implementation.
- The live preset stack is **snapshot-first**. Higher-level presets may carry `refs` metadata, but load/apply should assume pinned snapshot behavior unless explicit "follow latest child preset" logic is added later.
- Presets should carry immutable `id` values and normalized slot `scope` metadata. Display names are labels, not stable identifiers.
- `dualRanges`, `sliderModes`, evolve configs, sub-lane state, `stepOverrides`, and `clockDivs` are part of the preset payload. They belong to the lowest level that owns the affected params. Sequencer behavior belongs with the matching Euclidean preset. For the current built-in granular scenes, this metadata should stay at **L3 granular source** level.
- Granular is now modeled as:
  L1 `granularVoice1..4`, `granularLegacy`, `granularEuclidean`
  L2 `granularKit` (16 params: 13 voice/macro + 3 Clocked Space routing/linkage)
  L3 `granular` source preset (10 params)
  Granular factory presets live in `granularPresets.ts` as full-scene snapshots
  (L1+L2+L3 combined). The redundant `granularSourcePresets.ts` thin presets
  have been removed.
- Delay is now modeled as:
  L1 `echoLine` (6 params), L1 `clockedSpace` (10 params)
  L2 `delayKit` (8 params — cross-feeds + master saturation + refs to both L1 engines)
  L3 `delay` source preset (1 param)
- Cross-page mix/routing lives at **L4 State**. That includes page/engine levels, reverb sends, and granular send amounts.
- Ownership corrections already reflected in the live registry: `padFold*` / `pad2Fold*` are L1 pad params, `synthEuclidBaseBPM` is L1, and the lead delay family has its own L1 `leadDelay` scope.
- `granularPreset` and `leadTimbre` remain intentional non-registry/UI-only shortcuts.
- Earth remains an exception. It behaves more like a scene/mixer wrapper around Water, Ocean, and Insects than a clean parallel source tree, so its hierarchy should stay conservative until the Earth page/audio cleanup is done. Earth Kit has 7 live registry params (not 12 as originally planned — 5 ocean behavior params are not yet registered).

---

## Hierarchy Structure

```
Journey (L5)
├── Topology, phrase lengths, morph durations, connections
│
├── Node 1 → State Preset (L4 snapshot)
│   ├── Global / Mixer params (master, harmony, cross-page levels/sends, etc.)
│   │
│   ├── Synth Source preset (L3)
│   │   ├── Shared synth behavior (lead enable/random/vibrato/glide)
│   │   ├── Pad 1 Kit Preset (L2)
│   │   │   ├── presetA/B, morph, enabled, voiceMask, spread, octave
│   │   │   └── Pad 1 Engine preset (L1) — e.g. "Saturated Drift"
│   │   ├── Pad 2 Kit Preset (L2)
│   │   │   ├── presetA/B, morph, enabled, voiceAssign, octave
│   │   │   └── Pad 2 Engine preset (L1)
│   │   ├── Lead 1 Kit Preset (L2)
│   │   │   ├── presetA/B, morph, algorithm + morph config
│   │   │   └── Lead 1 Engine preset (L1) — e.g. "Glass Bell"
│   │   ├── Lead 2 Kit Preset (L2)
│   │   │   ├── presetC/D, morph, enabled, algorithm + morph config
│   │   │   └── Lead 2 Engine preset (L1)
│   │   ├── Lead Delay preset (L1) — e.g. "Wide Sync Echo"
│   │   └── Synth Euclidean preset (L1) — e.g. "Arpeggio Weave"
│   │
│   ├── Drums Source preset (L3)
│   │   ├── Drum page behavior + delay sends (15 owned)
│   │   ├── Drum Kit preset (L2) — e.g. "Ambient Kit"
│   │   │   ├── 7× distance/variation + morph config (56 owned)
│   │   │   └── 7× Voice Engine presets (L1) — e.g. "Ikeda Kick"
│   │   └── Drum Euclidean preset (L1) — e.g. "Four On Floor"
│   │
│   ├── Delay Source preset (L3)
│   │   ├── Delay routing mode (granularSpaceMode)
│   │   ├── Delay Kit Preset (L2) — e.g. "Dual Feedback"
│   │   │   ├── Cross-feeds, master saturation (8 owned)
│   │   │   ├── Echo Line Engine preset (L1) — e.g. "Tape Slapback"
│   │   │   └── Clocked Space Engine preset (L1) — e.g. "Dotted Eighth"
│   │   └── (no Euclidean sub-preset — delay is continuous)
│   │
│   ├── Reverb Source (L3 — no L2, 44 owned params)
│   │
│   ├── Granular Source preset (L3)
│   │   ├── Source behavior + scene metadata (10 params)
│   │   ├── Granular Kit Preset (L2) — e.g. "Ambient Wash"
│   │   │   ├── 4× voice enabled/gain + macros (13 params)
│   │   │   ├── Send, reverb send, linkage (3 params)
│   │   │   ├── Override ref to L1 Clocked Space — e.g. "Microcosm Delay"
│   │   │   │   (overrides Delay Kit's Clocked Space when linked = true)
│   │   │   ├── 4× Granular Voice Engine presets (L1)
│   │   │   └── Granular Legacy preset (L1)
│   │   └── Granular Euclidean preset (L1) — e.g. "Scattered Grains"
│   │
│   └── Earth Source placeholder (L3)
│       ├── Thin scene/mixer wrapper (kept intentionally exceptional)
│       └── Earth children remain under audit
│           ├── Water Engine preset (L1)
│           ├── Insects 1 Engine preset (L1)
│           ├── Insects 2 Engine preset (L1)
│           └── Ocean behavior currently remains tied to Earth config
│
├── Node 2 → State Preset (L4 snapshot)
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
| 8 | Synth | Pad 1 | `pad*` (no number) | 51 engine params | A/B morph from Lead4opFM pool |
| 9 | Synth | Pad 2 | `pad2*` | 50 engine params | A/B morph from Lead4opFM pool |
| 10 | Synth | Lead 1 | `lead1*` | 9 pure synth | 17 (Lead4opFM/) |
| 11 | Synth | Lead 2 | `lead2*` | 6 pure synth | same pool as Lead 1 |
| 12 | Synth | Lead Delay | `leadDelay*` | 7 delay params | user-saved only |
| 13 | Earth | Water | `water*` | water engine params | 8 built-ins |
| 14 | Earth | Insects 1 | `insects*` | 8 pure synth | — (user-saved only) |
| 15 | Earth | Insects 2 | `insects2*` | 8 pure synth | — (user-saved only) |
| 16 | Granular | Granular Voice | `granularV{n}*` | 20 per voice (×4 voices) | user-saved only |
| 17 | Granular | Granular Legacy | `granularLegacy*` | 6 pure synth | user-saved only |
| 18 | Synth | Synth Euclidean | `synthEuclidean*` | sequencer params | user-saved only |
| 19 | Drums | Drum Euclidean | `drumEuclidean*` | sequencer params | user-saved only |
| 20 | Granular | Granular Euclidean | `granularEuclid*` | sequencer params | user-saved only |
| 21 | Delay | Echo Line | `delayA*` | 6 engine params | 8 factory |
| 22 | Delay | Clocked Space | `delayB*` / `granularDelay*` | 10 engine params | 8 factory + granular companions |

> **Note:** L1 stores engine-level sound/behavior params. Kit-level morph/config
> params live at **L2**, source-level page behavior lives at **L3**, and cross-page
> mix/routing lives at **L4**.

> **Note:** Ocean wave synth parameters are currently part of Earth-level config and
> do not yet have their own stable L1 engine preset family.

### Data Format
```json
{
  "type": "engine",
  "scope": "drumKick",
  "engine": "drumKick",
  "name": "808 Boom",
  "author": "factory",
  "versions": [
    {
      "v": 1,
      "note": "initial",
      "timestamp": 1740000000,
      "data": {
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
type: "engine"
engine: "drumSub" | "drumKick" | "drumClick" | "drumBeepHi" | "drumBeepLo" |
        "drumNoise" | "drumMembrane" | "pad1" | "pad2" | "lead1" | "lead2" |
        "leadDelay" | "water" | "insects1" | "insects2" |
        "granularVoice1" | "granularVoice2" | "granularVoice3" | "granularVoice4" |
        "granularLegacy" | "synthEuclidean" | "drumEuclidean" | "granularEuclidean" |
        "echoLine" | "clockedSpace"
```

### Storage Key
```
preset:engine:drumSub:Subterranean
preset:engine:drumKick:808 Boom
preset:engine:pad1:Warm Wash
preset:engine:lead1:Glass Bell
preset:engine:leadDelay:Wide Sync Echo
preset:engine:water:Rain Window
preset:engine:insects1:Summer Night
preset:engine:insects2:Cicada Chorus
preset:engine:granularVoice1:Granular Scatter
preset:engine:granularLegacy:Sparse Grains
preset:engine:synthEuclidean:Arpeggio Weave
preset:engine:drumEuclidean:Four On Floor
preset:engine:granularEuclidean:Scattered Grains
preset:engine:echoLine:Tape Slapback
preset:engine:clockedSpace:Dotted Eighth
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

**L3-owned params (5 live registry params):**
- Shared lead behavior: `leadEnabled`, `leadRandomEnabled` (2)
- Shared lead performance: `leadVibratoDepth`, `leadVibratoRate`, `leadGlide` (3)

> `leadLevel` now lives at **L4 State**, and the lead delay family now lives in
> its own **L1 `leadDelay`** preset scope.

**References (by name):**
- L2 Pad 1 Kit Preset ref (→ L1 Pad 1 Engine)
- L2 Pad 2 Kit Preset ref (→ L1 Pad 2 Engine)
- L2 Lead 1 Kit Preset ref (→ L1 Lead 1 Engine)
- L2 Lead 2 Kit Preset ref (→ L1 Lead 2 Engine)
- L1 Lead Delay preset ref (7 params)
- L1 Synth Euclidean engine ref (44 params)

**Data Format:**
```json
{
  "type": "source",
  "source": "synth",
  "scope": "synth",
  "name": "Ambient Pads + Arpeggios",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "data": {
      "leadEnabled": true,
      "leadRandomEnabled": false,
      "leadVibratoDepth": 0.3,
      "leadVibratoRate": 5.5,
      "leadGlide": 0.1
    },
    "refs": {
      "pad1Kit": { "name": "Warm Wash Morph", "version": 1, "scope": "pad1Kit" },
      "pad2Kit": { "name": "Crystal Layer", "version": 1, "scope": "pad2Kit" },
      "lead1Kit": { "name": "Glass Bell Setup", "version": 1, "scope": "lead1Kit" },
      "lead2Kit": { "name": "Ethereal FM Setup", "version": 1, "scope": "lead2Kit" },
      "leadDelay": { "name": "Wide Sync Echo", "version": 1, "scope": "leadDelay" },
      "sequencer": { "name": "Arpeggio Weave", "version": 1, "scope": "synthEuclidean" }
    }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:synth:Ambient Pads + Arpeggios`

---

### Level 2 Kit Presets — Synth Page

#### L2 Pad 1 Kit Preset (9 owned params)
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
| 9 | `synthOctave` | Octave offset |

Data: `{ "type": "kit", "source": "synth", "scope": "pad1Kit", "name": "Warm Wash Morph", "refs": { "pad1": { "name": "Saturated Drift", "version": 1, "scope": "pad1" } }, "data": { ... } }`

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

#### L2 Lead 1 Kit Preset (7 owned params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead1PresetA` | L1 FM preset A name |
| 2 | `lead1PresetB` | L1 FM preset B name |
| 3 | `lead1Morph` | 0–1 morph position |
| 4 | `lead1MorphAuto` | Auto-morph on/off |
| 5 | `lead1MorphSpeed` | Phrases per morph cycle |
| 6 | `lead1MorphMode` | linear / pingpong / random |
| 7 | `lead1AlgorithmMode` | snap / presetA |

#### L2 Lead 2 Kit Preset (8 owned params)

| # | Key | Notes |
|---|-----|-------|
| 1 | `lead2PresetC` | L1 FM preset C name |
| 2 | `lead2PresetD` | L1 FM preset D name |
| 3 | `lead2Morph` | 0–1 morph position |
| 4 | `lead2MorphAuto` | Auto-morph on/off |
| 5 | `lead2MorphSpeed` | Phrases per morph cycle |
| 6 | `lead2MorphMode` | linear / pingpong / random |
| 7 | `lead2AlgorithmMode` | snap / presetA |
| 8 | `lead2Enabled` | Lead 2 on/off |

---

### 2b. Drums Source Preset

**L3-owned params (15):**
- Drum page behavior: `drumEnabled`, `drumMorphSliderAnimate` (2)
- Drum stereo ping-pong delay: `drumDelayEnabled`, `drumDelayNoteL/R`, `drumDelayFeedback`, `drumDelayMix`, `drumDelayFilter` (6)
- Per-voice delay sends: `drumSubDelaySend` … `drumMembraneDelaySend` (7)

> `drumLevel` and `drumReverbSend` now live at **L4 State**.

**References (by name):**
- L2 Drum Kit preset (→ which in turn references 7 × L1 voice presets)
- L1 Drum Euclidean engine preset (69 params)

**Data Format:**
```json
{
  "type": "source",
  "source": "drums",
  "scope": "drums",
  "name": "Ambient Drums",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "data": {
      "drumEnabled": true,
      "drumMorphSliderAnimate": true,
      "drumDelayEnabled": true,
      "drumDelayNoteL": "1/8",
      "drumDelayNoteR": "1/8d",
      "drumDelayFeedback": 0.3,
      "drumDelayMix": 0.15,
      "drumDelayFilter": 2000,
      "drumKickDelaySend": 0.3
    },
    "refs": {
      "kit": { "name": "Ambient Kit", "version": 1, "scope": "drumKit" },
      "sequencer": { "name": "Four On Floor", "version": 1, "scope": "drumEuclidean" }
    }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:drums:Ambient Drums`

---

### 2c. Reverb Source Preset (44 live registry params)

**Contains:**
- Core: `reverbEngine`, `reverbType`, `reverbQuality`, `reverbDecay`, `reverbSize`, `reverbDiffusion`
- Mod: `reverbModulation`, `predelay`, `damping`, `width`, chorus, warp, crossfeed, early reflections
- Shimmer / tonal shaping: `reverbShimmer`, `reverbShimmerPitch`, `reverbScaleShimmer`, `reverbChordWash`, damping crossover/tone controls
- Slow Mod / reverse: `reverbSlowModRate`, `reverbSlowModDepth`, `reverbReverse`, `reverbReverseLength`
- Spectral freeze block: `spectralFreeze*` controls and routing
- Config: `reverbEnabled` plus all other source-owned behavior toggles in the live registry

**Data Format:**
```json
{
  "type": "source",
  "source": "reverb",
  "scope": "reverb",
  "name": "Blackhole",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "data": {
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
      "reverbReverse": 0.4,
      "reverbReverseLength": 3.5,
      "reverbWarp": 0.1,
      "spectralFreezeEnabled": false
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

**L3-owned registry params (10):**
- `granularEnabled`
- `granularFreeze`
- `granularFeedback`
- `granularFeedbackLPF`
- `granularBufferSeconds`
- `granularShape`
- `granularDiffusion`
- `granularReverbLPF`
- `granularOutputLPF`
- `granularChordBias`

> **Note:** Granular no longer owns any Delay B DSP/voicing params. The 6 voicing
> params (`granularDelayEnabled/Activity/Repeats/Time/Filter/Vibrato`) belong to
> L1 Clocked Space. The L2 Granular Kit stores a **ref** to an L1 Clocked Space
> preset, the send amount (`granularDelayBSend`), reverb send
> (`granularDelayReverbSend`), and the linkage toggle (`delayBGranularLinked`).
> `granularDryWet` is intentionally excluded from the registry — it is a UI-only
> shortcut.

**Additional L3 scene metadata for built-in granular presets:**
- `dualRanges`
- `sliderModes`
- `granularEvolveConfigs`
- `granularSubLaneStates`
- sequencer metadata such as `stepOverrides` / `clockDivs`

**Child composition:**
- L2 `granularKit` preset (includes Clocked Space ref + send + linkage)
- L1 `granularEuclidean` preset
- Optional metadata refs to the selected child voice/legacy presets

**Data Format:**
```json
{
  "type": "source",
  "source": "granular",
  "scope": "granular",
  "name": "Shimmer Cloud",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "data": {
      "granularEnabled": true,
      "granularDryWet": 0.5,
      "granularFeedback": 0.6,
      "granularBufferSeconds": 4
    },
    "refs": {
      "kit": { "name": "Ambient Wash", "version": 1, "scope": "granularKit" },
      "sequencer": { "name": "Scattered Grains", "version": 1, "scope": "granularEuclidean" }
    },
    "sliderModes": { "granularMorph": "sampleHold" },
    "dualRanges": { "granularDelayTime": { "min": 0.2, "max": 0.45 } }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:granular:Shimmer Cloud`

---

### Level 2 Kit Preset — Granular Page

#### L2 Granular Kit Preset (16 owned params)
The kit layer controls which granular voices are active, their gains, the
five macro knobs, and the Clocked Space (Delay B) routing/linkage.

| # | Key | Notes |
|---|-----|-------|
| 1 | `granularV1Enabled` | Voice 1 on/off |
| 2 | `granularV1Gain` | Voice 1 output level |
| 3 | `granularV2Enabled` | Voice 2 on/off |
| 4 | `granularV2Gain` | Voice 2 output level |
| 5 | `granularV3Enabled` | Voice 3 on/off |
| 6 | `granularV3Gain` | Voice 3 output level |
| 7 | `granularV4Enabled` | Voice 4 on/off |
| 8 | `granularV4Gain` | Voice 4 output level |
| 9 | `granularMacroActivity` | Macro: overall activity/density |
| 10 | `granularMacroTexture` | Macro: blur/spray/grainSize |
| 11 | `granularMacroComplexity` | Macro: LFO rates/density |
| 12 | `granularMacroDarkness` | Macro: speed/pitch/filter |
| 13 | `granularMacroChaos` | Macro: reverse/spray/grainOct |
| 14 | `granularDelayBSend` | Routing: Granular → Delay B send |
| 15 | `granularDelayReverbSend` | Routing: Delay B → Reverb send |
| 16 | `delayBGranularLinked` | Whether Clocked Space is linked to this kit |

**References:**
- 4 × L1 `granularVoice1..4` engine refs
- Optional L1 `granularLegacy` ref
- L1 `clockedSpace` override ref (applied only when `delayBGranularLinked = true`)

> **Override behavior:** When `delayBGranularLinked = true` and this Granular Kit
> is loaded, the companion L1 Clocked Space preset referenced here **overrides**
> whichever L1 Clocked Space the Delay Kit currently has loaded. When linked = false,
> the Delay Kit's own Clocked Space preset remains active. This lets Granular scene
> presets ship with tuned Delay B settings without permanently owning the Delay chain.

> **Important:** the live registry still contains a separate historical
> `legacyGranular` scope used by the old generic granular FX path. Do not
> confuse that with the page-specific `granularLegacy` child preset.

Data: `{ "type": "kit", "source": "granular", "scope": "granularKit", "name": "Ambient Wash", "refs": { "voice1": { ... }, "voice2": { ... }, "legacy": { ... }, "clockedSpace": { "name": "Microcosm Delay", "scope": "clockedSpace" } }, "data": { "granularDelayBSend": 0.34, "granularDelayReverbSend": 0.4, "delayBGranularLinked": true, ... } }`

---

### 2f. Delay Source Preset

The Delay page has its own three-tier hierarchy. Unlike other source pages,
Delay has no Euclidean sub-preset — delay processing is continuous.

**L3-owned params (1):**
- `granularSpaceMode` — controls how Delay B routes to the Granular engine

**References (by name):**
- L2 Delay Kit preset (→ cross-feeds + saturation)
- L1 Echo Line engine preset (6 params)

**Data Format:**
```json
{
  "type": "source",
  "source": "delay",
  "scope": "delay",
  "name": "Clocked Linked",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "refs": {
      "kit": { "name": "Dual Feedback", "version": 1, "scope": "delayKit" }
    }
  }],
  "currentVersion": 1
}
```

**Storage Key:** `preset:source:delay:Clocked Linked`

---

### Level 2 Kit Preset — Delay Page

#### L2 Delay Kit Preset (8 owned params)
The kit layer controls cross-feed routing between delay engines and the master
saturation stage.

| # | Key | Notes |
|---|-----|-------|
| 1 | `delayAToBSend` | Echo Line → Clocked Space send |
| 2 | `delayBToASend` | Clocked Space → Echo Line send |
| 3 | `delayACrossFeedFilter` | Cross-feed filter frequency |
| 4 | `delayAGranularSend` | Echo Line → Granular send |
| 5 | `delayBGranularSend` | Clocked Space → Granular send |
| 6 | `masterSatDrive` | Master saturation drive |
| 7 | `masterSatMode` | Saturation algorithm |
| 8 | `masterSatTone` | Post-saturation tone |

**References:**
- L1 `echoLine`
- L1 `clockedSpace`

> **Note:** The Delay Kit owns the default L1 Clocked Space preset. However, when
> `delayBGranularLinked = true` in the active Granular Kit, the Granular Kit's
> companion Clocked Space preset **overrides** the one loaded here.

Data: `{ "type": "kit", "source": "delay", "scope": "delayKit", "name": "Dual Feedback", "refs": { "echoLine": { "name": "Tape Slapback" }, "clockedSpace": { "name": "Dotted Eighth" } }, "data": { ... } }`

---

### Level 1 Engine Presets — Delay Page

#### L1 Echo Line Preset (6 owned params)
Echo Line is a modulated ping-pong style delay (Delay A).

| # | Key | Notes |
|---|-----|-------|
| 1 | `delayAPingPong` | Ping-pong on/off |
| 2 | `delayAModRate` | Modulation rate |
| 3 | `delayAModDepth` | Modulation depth |
| 4 | `delayADuck` | Ducking amount |
| 5 | `delayAFilterType` | Filter type |
| 6 | `delayAWidth` | Stereo width |

#### L1 Clocked Space Preset (10 owned params)
Clocked Space is a rhythmic pattern-based delay (Delay B). It owns all its own
DSP parameters. The default L1 Clocked Space preset is referenced from the **L2
Delay Kit**. When `delayBGranularLinked = true`, the L2 Granular Kit's companion
Clocked Space preset overrides the Delay Kit's version.

| # | Key | Notes |
|---|-----|-------|
| 1 | `granularDelayEnabled` | Delay on/off |
| 2 | `granularDelayActivity` | Tap count + syncopation macro |
| 3 | `granularDelayRepeats` | Feedback cycles |
| 4 | `granularDelayTime` | Note division base |
| 5 | `granularDelayFilter` | Tone LPF (200–8000 Hz) |
| 6 | `granularDelayVibrato` | Per-tap time modulation |
| 7 | `delayBPattern` | Rhythm pattern |
| 8 | `delayBWarp` | Warp mode |
| 9 | `delayBWarpIntensity` | Warp intensity |
| 10 | `delayBSpread` | Stereo spread |

> **Note:** Params 1–6 currently carry `granularDelay*` prefix from the old
> internal delay architecture. A future rename to `delayB*` prefix would unify
> naming but is not required for correctness — the engine reads both sets in
> `sharedDelayB.update()`.

> **Companion naming convention:** `"{GranularPresetName} Delay"`. For example,
> the granular preset "Microcosm" has a companion L1 Clocked Space preset named
> "Microcosm Delay".

> **Linked save/load rules:**
>
> 1. **Load (linked):** Loading granular preset "Microcosm" also loads the L1
>    Clocked Space preset named in its ref ("Microcosm Delay"). The ref points
>    by name only — always loads the latest version.
>
> 2. **Save Delay B (linked):** When `delayBGranularLinked = true` and the active
>    granular preset is "Microcosm", saving Delay B targets the companion name
>    "Microcosm Delay" — pushes a new version onto that L1 preset. The granular
>    ref does not need updating since it already points by name.
>
> 3. **Save As Delay B (linked):** Creates a new L1 Clocked Space preset with a
>    user-chosen name. Also updates the active granular preset's `clockedSpace`
>    ref to point to the new name.
>
> 4. **Save Delay B (unlinked):** Saves as a standalone L1 Clocked Space preset.
>    No granular ref is touched.
>
> 5. **Factory companion presets:** Read-only. If the user saves over one, it
>    creates a user copy (same as other factory presets). The granular preset's
>    ref updates to point to the user copy.
>
> 6. **Modified indicator:** When Delay B params differ from the companion preset,
>    show (●) on the Delay B preset selector to warn of unsaved changes.
>
> 7. **Dangling ref:** If the referenced L1 preset is deleted, fall back to a
>    default Clocked Space preset and log a warning.

---

### 2e. Earth Source Preset

Earth remains intentionally exceptional. There is **no stable L3 Earth source
scope in the live registry yet**. For now, Earth should be treated as a thin
wrapper/placeholder so the broader hierarchy can still model five source pages.

**Current child composition:**
- L2 `earthKit` config for on/off + ocean behavior
- L1 `water`
- L1 `insects1`
- L1 `insects2`

**Data Format:**
```json
{
  "type": "source",
  "source": "earth",
  "scope": "earth",
  "name": "Rainforest Night",
  "versions": [{
    "v": 1,
    "timestamp": 1740000000,
    "refs": {
      "kit": { "name": "Rainforest Night", "version": 1, "scope": "earthKit" }
    }
  }],
  "currentVersion": 1
}
```

> **Note:** Earth should not be over-normalized yet. It is still under separate
> audit because Water/Ocean/Insects do not behave like the cleaner Synth/Drums split.

**Storage Key:** `preset:source:earth:Rainforest Night`

---

### Level 2 Kit Preset — Earth Page

#### L2 Earth Kit Preset (7 live registry params)
The current live registry keeps Earth conservative: engine on/off plus Ocean
sample filter config. Levels and sends have moved to **L4 State**.

| # | Key | Sub-group | Notes |
|---|-----|-----------|-------|
| 1 | `waterEnabled` | Water config | Water engine on/off |
| 2 | `insectsEnabled` | Insects 1 config | Insects 1 on/off |
| 3 | `insects2Enabled` | Insects 2 config | Insects 2 on/off |
| 4 | `oceanSampleEnabled` | Ocean config | Sample on/off |
| 5 | `oceanFilterType` | Ocean engine | Filter type |
| 6 | `oceanFilterCutoff` | Ocean engine | Filter cutoff |
| 7 | `oceanFilterResonance` | Ocean engine | Filter resonance |

> **Note:** `oceanWaveSynthEnabled`, `oceanDuration`, `oceanInterval`,
> `oceanFoam`, and `oceanDepth` are not yet registered in the live
> ParamRegistry. They should be added when the Earth page cleanup is done.

**References:**
- L1 `water`
- L1 `insects1`
- L1 `insects2`

> Ocean still has **no stable L1 preset family**. Its behavior is currently
> configured directly from `earthKit`.

Data: `{ "type": "kit", "source": "earth", "scope": "earthKit", "name": "Rainforest Night", "refs": { "water": { "name": "Tap Drips" }, "insects1": { "name": "Cricket Chorus" }, "insects2": { "name": "Cicada Dusk" } }, "data": { ... } }`

---

## Level 4: State Preset

### Scope
Everything for one journey node: L4-owned global/state/mix params plus optional
child source refs or embedded snapshots. This is the complete snapshot of the
entire app state at a single point in time.

### Contents

| Section | Keys | Description |
|---------|------|-------------|
| **L4 data** | 48 live registry keys | Master, harmony, randomization, cross-page levels, reverb sends, granular sends, Earth levels/sends |
| **Child refs** | optional metadata | Slot-aware refs to saved source/kit/engine presets when useful |
| **Embedded snapshots** | optional | Allowed for file export, migration, and snapshot-first restore paths |

### L4 Key Groups
- Master / harmony / CoF / scale / randomization
- Cross-page dry levels
- Cross-page reverb sends
- Granular input send amounts
- Earth/Water/Ocean/Insects level and send routing

> The live registry currently owns **48** L4 keys under `scope: 'global'`.
> For exact membership, trust `src/presets/ParamRegistry.ts`.

### Data Format
```json
{
  "type": "state",
  "name": "Desert Night",
  "author": "user",
  "versions": [{
    "v": 1,
    "note": "initial composition",
    "timestamp": 1740000000,
    "data": {
      "masterVolume": 0.8,
      "rootNote": 0,
      "scaleMode": "auto",
      "tension": 0.5,
      "chordRate": 8,
      "synthLevel": 0.7,
      "lead1ReverbSend": 0.5,
      "granularWaterSend": 0.2,
      "earthLevel": 0.9
    },
    "refs": {
      "synth": { "name": "Ambient Pads + Arpeggios", "version": 2, "scope": "synth" },
      "drums": { "name": "Ambient Drums", "version": 1, "scope": "drums" },
      "reverb": { "name": "Blackhole", "version": 1, "scope": "reverb" },
      "granular": { "name": "Shimmer Cloud", "version": 1, "scope": "granular" },
      "earth": { "name": "Rainforest Night", "version": 1, "scope": "earth" }
    }
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
  "type": "journey",
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
│ [Global] [Synth] [Drums] [Delay] [Reverb] [Granular] [Earth] │ ← Tabs
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
| Load delay engine (echo line) | Echo Line engine params only | Clocked Space, kit, other tabs |
| Load delay engine (clocked space) | Clocked Space engine params only | Echo Line, kit, other tabs |
| Load delay kit | Cross-feeds + saturation + both engines | Source routing, other tabs |
| Load Delay source preset | All Delay tab params (source + kit + engines) | Synth, Drums, Reverb, Granular, Earth, Global |
| Load Reverb source preset | All Reverb tab params | Synth, Drums, Delay, Granular, Earth, Global |
| Load Granular source preset | All Granular tab params (source + kit + child voices + seq metadata) | Synth, Drums, Delay, Reverb, Earth, Global |
| Load Earth source preset | All Earth tab params (water, ocean, insects) | Synth, Drums, Delay, Reverb, Granular, Global |
| Load state preset | Everything (all 6 sources + global) | Other journey nodes |
| Load journey | Everything | Nothing |

---

## Snapshot-First Composition Model

The live system is **snapshot-first**. Presets save their owned data directly.
Optional `refs` metadata may point at child presets for UI, migration, or future
composition features, but load/apply should not assume live child resolution.

| Level | What it saves directly | What it references |
|-------|----------------------|-------------------|
| L1 | Engine sound params (own keys only) | — |
| L2 | Kit assembly/performance params | Optional child engine refs metadata |
| L3 | Source/page behavior + scene metadata | Optional kit/engine refs metadata |
| L4 | Global/state/mix params | Optional source refs metadata |
| L5 | Topology, phrase lengths, morph durations | Optional state refs metadata or embedded node snapshots |

### Loading: Current Rule
When loading a preset, apply the saved snapshot data for that level. If refs are
present, treat them as metadata unless that specific load path explicitly opts
into resolving them.

### Editing Upstream Presets
- Editing an L1 voice preset does **not** automatically rewrite existing higher-level
  snapshots.
- Version numbers in refs are still useful as metadata and for explicit restore flows.
- If a future "follow latest child preset" mode is added, it should be explicit and opt-in.

### Orphan Protection
- Deleting a preset that is still mentioned in saved metadata should show a warning.
- Snapshots remain loadable even if a referenced child preset is later removed.
- "Used by:" analysis should scan both explicit refs metadata and embedded preset names in saved data.

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
State versions may capture child version numbers in metadata:
```json
{
  "synth": { "name": "Ambient Pads", "version": 2 },
  "drums": { "name": "Ambient Kit", "version": 3 },
  "reverb": { "name": "Blackhole", "version": 1 },
  "granular": { "name": "Shimmer Cloud", "version": 1 },
  "earth": { "name": "Rainforest Night", "version": 1 }
}
```
Restoring a state version restores the exact saved snapshot. Child version refs
are useful for provenance and explicit re-linking, not mandatory live resolution.

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
preset:engine:drumKick:808 Boom
preset:kit:drumKit:Ambient Kit
preset:source:synth:Ambient Pads
preset:source:drums:Ambient Drums
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
| **L1 Engine** | ✅ drum, pad, lead, water, and other engine factory data exist in mixed hardcoded/JSON form | Partial | Partial |
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
| **L1 Engine** | A single engine's sound params (e.g. 51 pad1 params, 11 kick params) | Slice current `SliderState` by scope | `{ "type": "engine", "scope": "pad1", "data": { ... } }` |
| **L2 Kit Preset** | One kit's performance params (e.g. 9 pad1 kit params, 56 drum kit params) | Slice current `SliderState` by L2 keys | `{ "type": "kit", "scope": "pad1Kit", "data": { ... } }` |
| **L3 Source** | All params for one tab/page (e.g. full Synth page = L3 + optional child refs/metadata) | Slice current `SliderState` by source page | `{ "type": "source", "scope": "synth", "data": { ... } }` |
| **L4 State** | ✅ Already works — full `SliderState` | Entire `SliderState` | Existing `SavedPreset` format |
| **L5 Journey** | Journey topology + node preset names | `JourneyConfig` from `useJourney` hook | `{ "type": "journey", "config": { nodes, connections, ... } }` |

#### Interim File Format

```json
{
  "kesshoPreset": true,
  "version": 1,
  "type": "engine | kit | source | state | journey",
  "scope": "pad1 | drumKit | synth | state | journey",
  "engine": "pad1 | drumKick | lead1 | water | ...",
  "source": "synth | drums | reverb | granular | earth",
  "name": "My Cool Pad Sound",
  "exportedAt": "2026-03-05T12:00:00Z",
  "appVersion": "1.0.0",
  "data": { "padOscAWave": "sine", "padOscAOctave": 0, "..." : "..." }
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
- **No optional ref metadata yet** — exports are snapshot-first and do not try to preserve child preset relationships
- **No live child resolution** — importing L1 data does not mutate any higher-level snapshots
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

## Cloud Storage Design (Supabase)

### Audit Summary

Registry integrity verified: **783 params, 43 scopes, zero overlaps**. Every
param belongs to exactly one (level, scope) pair. The reference chain has no
circular dependencies:

```
L4 State → L3 Source → L2 Kit → L1 Engine
               │                    ▲
               └────────────────────┘  (direct L1 refs from L3, e.g. Euclidean)
```

The only cross-tree link is the **Granular Kit override**: L2 `granularKit` can
override L2 `delayKit`'s L1 `clockedSpace` ref when `delayBGranularLinked = true`.
This is safe because only one L1 Clocked Space preset is ever active at a time.

---

### Database Schema (replaces flat `presets` table)

```sql
CREATE TABLE presets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id),      -- NULL = anonymous/factory
  type        TEXT NOT NULL,                         -- 'engine' | 'kit' | 'source' | 'state'
  scope       TEXT NOT NULL,                         -- 'drumKick' | 'granularKit' | 'granular' | 'state' etc.
  name        TEXT NOT NULL,
  author      TEXT DEFAULT 'Anonymous',
  description TEXT,
  version     INT NOT NULL DEFAULT 1,
  is_base     BOOLEAN NOT NULL DEFAULT false,        -- true for v1 (full snapshot)
  parent_id   UUID REFERENCES presets(id),           -- v1 row for this preset (NULL if is_base)
  data        JSONB NOT NULL,                        -- v1: full snapshot; v2+: delta from v1
  refs        JSONB,                                 -- child preset references
  metadata    JSONB,                                 -- sliderModes, dualRanges, evolveConfigs etc.
  is_factory  BOOLEAN DEFAULT false,
  visibility  TEXT DEFAULT 'private',                -- 'private' | 'public' | 'featured'
  family      TEXT,                                  -- variant group name (NULL = standalone)
  forked_from UUID REFERENCES presets(id),           -- lineage: which preset this was derived from
  plays       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, type, scope, name, version)        -- no duplicate name+version per user
);

CREATE INDEX idx_presets_scope ON presets(type, scope);
CREATE INDEX idx_presets_user ON presets(user_id, type, scope);
CREATE INDEX idx_presets_name ON presets USING gin(to_tsvector('english', name));
CREATE INDEX idx_presets_parent ON presets(parent_id);
CREATE INDEX idx_presets_family ON presets(user_id, family) WHERE family IS NOT NULL;
```

### Version Storage: Delta-from-Base

Versions use a **delta-from-base** strategy. Version 1 (the base) stores a full
parameter snapshot. Every subsequent version stores only the params that differ
from v1.

**Storage format:**

```
v1 (is_base=true):   data = { "drumKickFreq": 52, "drumKickDecay": 0.9, ... all 10 params }
v2 (is_base=false):  data = { "drumKickFreq": 60, "drumKickDecay": 0.7 }   ← 2 changed
v3 (is_base=false):  data = { "drumKickFreq": 65 }                          ← 1 changed
```

**Reconstruction:** To load version N, fetch v1 (base) + vN in a single query,
then merge client-side:

```ts
const full = { ...base.data, ...version.data };
```

One merge, no chaining. Deleting any non-base version is always safe. The delta
can never exceed the size of a full snapshot (worst case = every param changed).

**When delta > 50% of base size:** The system may optionally promote the version
to a new base (store full snapshot, set `is_base = true`). This is a storage
optimization, not a correctness requirement.

**Rebase on Save As:** When the user does "Save As" (new preset name), v1 of the
new preset is always a full snapshot (new base). No dependency on the original
preset's base.

**Query pattern:**

```sql
-- Fetch version N of a preset (returns 1-2 rows: base + requested version)
SELECT * FROM presets
WHERE user_id = $1 AND type = $2 AND scope = $3 AND name = $4
  AND (is_base = true OR version = $5)
ORDER BY is_base DESC;
```

### Storage Key Convention

```
{user_id}:{type}:{scope}:{name}:{version}
```

Examples:
```
factory:engine:drumKick:808 Boom:1
user_abc:kit:granularKit:Ambient Wash:3
user_abc:source:granular:Shimmer Cloud:1
user_abc:state:state:Desert Night:2
```

---

### What Each Level Stores

| Level | `type` | `data` contains | `refs` contains |
|-------|--------|-----------------|-----------------|
| L1 | `engine` | Own params only (e.g. 10 kick params) | — |
| L2 | `kit` | Own params only (e.g. 16 granularKit params) | Named refs to L1 presets |
| L3 | `source` | Own params only (e.g. 10 granular params) | Named refs to L2 kit + L1 presets |
| L4 | `state` | 48 global/mixer params | Named refs to L3 sources |

**Critical rule:** A preset's `data` field only contains params owned at that
level. It never embeds child param values. Child presets are always referenced
by `{ name, scope, version }` in `refs`.

---

### Cascade Save Rules

When the user saves at a given level, the system must handle children that have
been modified since they were last saved.

#### Save L1 (Engine)

Simplest case. Saves only the L1 params. No children.

- **Save**: pushes a new version onto the existing preset (version increments)
- **Save As**: creates a new preset name at version 1

#### Save L2 (Kit)

Saves L2-owned params + checks each referenced L1 child.

1. For each L1 ref in the kit:
   - If the L1 has **unsaved changes** (live params ≠ saved preset):
     - **Auto-save** the L1 as a new version of the existing L1 preset
     - Update the kit's ref to point to the new version
   - If the L1 is **unchanged**: ref stays as-is
2. Save the L2 kit's own params + updated refs

> **Example:** Granular Kit "Ambient Wash" refs Voice 1 = "Scatter v2".
> The user tweaked Voice 1 params. Saving the kit auto-saves Voice 1 as
> "Scatter v3" and the kit's ref updates to `{ name: "Scatter", version: 3 }`.

#### Save L3 (Source)

Saves L3-owned params + checks each L2 and L1 child.

1. For each L2 kit ref:
   - Apply the L2 cascade rules above (which may auto-save L1s)
   - If the L2 kit itself has unsaved changes, auto-save it as a new version
2. For each direct L1 ref (e.g. Euclidean):
   - Same as L1 save rules above
3. Save the L3 source's own params + updated refs

#### Save L4 (State)

Saves L4-owned params + cascades through all L3 sources.

1. For each L3 source ref:
   - Apply the L3 cascade rules above
2. Save the L4 state's 48 global params + updated refs

---

### Naming Convention for Cascade-Saved Children

When a higher-level save auto-saves a modified child, the child keeps its
**existing name** and gets a new **version number**. The name never changes
during cascade saves.

```
Save L3 "Shimmer Cloud"
  ├── L2 kit "Ambient Wash" modified? → save as "Ambient Wash" v4
  │   ├── L1 voice1 "Scatter" modified? → save as "Scatter" v3
  │   ├── L1 voice2 "Shimmer" unchanged → keep ref v2
  │   └── L1 clockedSpace "Microcosm Delay" modified? → save as "Microcosm Delay" v5
  └── L1 euclidean "Scattered Grains" unchanged → keep ref v1
```

**The child preset name never changes.** Only the version increments. The
parent's ref updates to point to the new version.

---

### What Happens When L1 Diverges From Saved State

**Scenario:** User loads L3 "Shimmer Cloud" (which refs L1 voice "Scatter v2"),
then manually changes Voice 1 params. Now the live Voice 1 ≠ "Scatter v2".

| User action | What happens |
|-------------|-------------|
| **Save L1** | Saves Voice 1 as "Scatter v3". Kit ref auto-updates. |
| **Save L1 As "New Voice"** | Creates "New Voice v1". Kit ref updates to "New Voice v1". |
| **Save L2 Kit** | Cascade: auto-saves Voice 1 as "Scatter v3", then saves kit. |
| **Save L3 Source** | Cascade: auto-saves Voice 1 → kit → source. |
| **Save L4 State** | Cascade: auto-saves all dirty children top-down. |
| **Load different L1** | Discards unsaved Voice 1 changes. Warning if modified. |
| **Load different L3** | Discards all unsaved changes. Warning if any modified. |

---

### The Clocked Space Override During Save

When `delayBGranularLinked = true`:

| User action | What happens |
|-------------|-------------|
| **Save Delay Kit** | Saves delayKit params + refs (including its clockedSpace ref). The override is NOT active during regular delay saves — it saves the Delay Kit's own clockedSpace ref. |
| **Save Granular Kit** | Cascade: saves the companion clockedSpace L1 preset (auto-version), saves granularKit with updated clockedSpace ref. |
| **Toggle linked → false** | Delay Kit's own clockedSpace becomes active again. No preset is modified. |
| **Toggle linked → true** | Granular Kit's companion clockedSpace overrides. The Delay Kit's ref is not modified — it still points to its own L1 preset. |

**Key insight:** The override is a **runtime** behavior. Both the Delay Kit and
the Granular Kit always maintain their own separate clockedSpace refs in storage.
The override only affects which L1 preset gets loaded into the engine.

---

### Modified (Dirty) Detection

A preset is "dirty" (●) when live slider values differ from the last saved
version's `data` values. Detection is per-level:

```
L1 dirty = any owned param ≠ saved L1 preset data
L2 dirty = any L2 param ≠ saved kit data, OR any child L1 is dirty
L3 dirty = any L3 param ≠ saved source data, OR any child L2/L1 is dirty
L4 dirty = any L4 param ≠ saved state data, OR any child L3 is dirty
```

Dirty state bubbles up but NOT down. If L3 is dirty because an L3-owned param
changed, the children are not affected. If L1 is dirty, the parent L2/L3/L4
are also shown as dirty (because their saved refs point to an older version).

---

### Cloud Sharing

When sharing a preset publicly:

1. **Share L4 State** — shares the full composition. All child presets are
   resolved and stored as concrete refs (name + version). Recipients get the
   exact same sound.

2. **Share L3 Source** — shares one page's sound. Useful for sharing a granular
   scene or drum setup without affecting the recipient's other pages.

3. **Share L2 Kit** — shares a voice configuration. Useful for sharing a drum
   kit or granular voice setup.

4. **Share L1 Engine** — shares a single sound. Most granular sharing unit.

Shared presets are **immutable snapshots**. The recipient gets a copy — editing
it does not affect the original sharer's preset.

---

### L4 Variant Families

State presets often come in families — a base composition plus variations that
differ in small but sonically important ways. For example:

```
String Waves (family)
├── String Waves Base        — fully generative, drums off
├── String Waves Drum        — adds drum sequencing
├── String Waves Dark        — darker reverb + lower granular filter
└── String Waves Minimal     — pads only, leads off
```

These are **not versions** of the same preset (that's the v1→v2→v3 history).
They are **sibling variants** — different creative takes that share most of
their structure.

#### Schema support

Add two fields to the `presets` table:

```sql
ALTER TABLE presets ADD COLUMN family    TEXT;           -- family group name (NULL = standalone)
ALTER TABLE presets ADD COLUMN forked_from UUID REFERENCES presets(id);  -- which preset this was derived from

CREATE INDEX idx_presets_family ON presets(user_id, family) WHERE family IS NOT NULL;
```

#### How variants work

A variant stores its **own full L4 data + refs**, not a delta from the base
variant. This is deliberate — variants need to be independently loadable and
shareable without requiring the base variant to exist.

However, the `forked_from` field tracks lineage for UI purposes (showing the
family tree, offering "compare with base", etc.).

**Example: creating "String Waves Drum" from "String Waves Base":**

```
String Waves Base (L4):
  data: { masterVolume: 0.8, drumLevel: 0, synthLevel: 0.7, ... }
  refs: {
    synth:    { name: "Ethereal Pads", scope: "synth" },
    drums:    { name: "Silent", scope: "drums" },         ← drums disabled
    reverb:   { name: "Blackhole", scope: "reverb" },
    granular: { name: "Shimmer Cloud", scope: "granular" },
    delay:    { name: "Clocked Linked", scope: "delay" }
  }

String Waves Drum (L4):
  family: "String Waves"
  forked_from: <uuid of String Waves Base>
  data: { masterVolume: 0.8, drumLevel: 0.6, synthLevel: 0.7, ... }  ← drumLevel changed
  refs: {
    synth:    { name: "Ethereal Pads", scope: "synth" },              ← shared
    drums:    { name: "String Waves Perc", scope: "drums" },          ← different L3
    reverb:   { name: "Blackhole", scope: "reverb" },                 ← shared
    granular: { name: "Shimmer Cloud", scope: "granular" },           ← shared
    delay:    { name: "Clocked Linked", scope: "delay" }              ← shared
  }
```

**Shared children are free.** Synth, reverb, granular, and delay all point to
the same L3 presets by name. No duplication at any level. Only the drums L3
ref differs, and only that L3 (plus its L2/L1 children) are separate presets.

#### What about the minor diffs down the chain?

When a variant changes something deep (e.g., "String Waves Dark" uses a darker
reverb filter), a new child preset is created only for the level that actually
differs:

```
String Waves Dark (L4):
  refs: {
    synth:    { name: "Ethereal Pads" },         ← shared with Base
    drums:    { name: "Silent" },                ← shared with Base
    reverb:   { name: "Blackhole Dark" },        ← new L3, forked from "Blackhole"
    granular: { name: "Shimmer Cloud" },         ← shared
    delay:    { name: "Clocked Linked" }         ← shared
  }

"Blackhole Dark" (L3 reverb):
  forked_from: <uuid of "Blackhole">
  data: { ...same as Blackhole but reverbDamping: 0.4, reverbSize: 2.0 }
```

The fork chain only goes as deep as needed. If "Blackhole Dark" uses the same
reverb quality and shimmer settings, those values are still in its data (it's
a full L3 snapshot, not a delta from Blackhole). The `forked_from` is metadata
for UI lineage only.

#### Variant naming convention

```
{FamilyName}                      — the base variant
{FamilyName} {Modifier}           — a variant
```

Examples:
- "String Waves", "String Waves Drum", "String Waves Dark"
- "Desert Night", "Desert Night Rain", "Desert Night Minimal"
- "Microcosm", "Microcosm Bright", "Microcosm No Drums"

The `family` field groups them: all presets with `family = "String Waves"` appear
together in the UI.

#### UI presentation

```
┌─ STATE ────────────────────────────────────────────────┐
│ String Waves ▾                                         │
│ ┌──────────────────┐                                   │
│ │ ● Base           │  ← current                        │
│ │   Drum           │                                   │
│ │   Dark           │                                   │
│ │   Minimal        │                                   │
│ │ ─────────────────│                                   │
│ │ + New Variant    │                                   │
│ └──────────────────┘                                   │
└────────────────────────────────────────────────────────┘
```

---

### Additional Storage Optimizations

#### 1. Content-Addressable L1 Deduplication

Many users will end up with identical L1 engine presets (factory presets,
popular community sounds). Instead of storing N copies:

```sql
ALTER TABLE presets ADD COLUMN data_hash TEXT GENERATED ALWAYS AS
  (encode(digest(data::text, 'sha256'), 'hex')) STORED;

CREATE INDEX idx_presets_hash ON presets(data_hash) WHERE type = 'engine';
```

When saving an L1, check if `data_hash` already exists. If so, the new preset
row can reference the existing data (or the server deduplicates at the storage
layer). This matters most for L1 engines where users typically tweak small
variations — many factory presets will hash identically across users.

#### 2. Lazy Child Resolution

When loading an L4 state, don't fetch all L1s immediately. Load in two passes:

1. **Immediate:** L4 data + L3 refs (small — just names)
2. **On-demand:** Resolve L3 → L2 → L1 as the user navigates to each page

This means opening the app loads ~100 params (L4 data) instantly. The Drums
page's 247 params only load when the user taps the Drums tab.

#### 3. Ref Sharing Across Variants (Zero-Cost Branching)

The ref-based architecture means variant creation is essentially free:

| What's created | Storage cost |
|----------------|-------------|
| New L4 variant | 1 row: 48 params + 5-6 refs (~2 KB) |
| Shared L3 synth | 0 — reuses existing ref |
| Shared L2 drum kit | 0 — reuses existing ref |
| Shared L1 engines | 0 — reuses existing refs |
| New L3 drums | 1 row: 15 params + 2 refs (~1 KB) |
| New L1 drum sequence | 1 row: 69 params (~1.5 KB) |
| **Total for "add drums" variant** | **~4.5 KB** |

Compared to flat snapshot storage where each L4 would store all 783 params:
~15 KB per variant. The ref architecture saves ~70% per variant.

#### 4. Batch Loading for Cloud Browse

When browsing community presets, only send L4 metadata (name, author,
description, family, plays, tags) — not the full data. The full preset tree
is only fetched on "Load".

```sql
CREATE VIEW preset_browse AS
SELECT id, name, author, description, family, plays, visibility,
       created_at, jsonb_object_keys(refs) as source_pages
FROM presets
WHERE type = 'state' AND visibility IN ('public', 'featured');
```

---

## Appendix A: Parameter Counts by Source Page

| Source Page | Sound Engine | Config/Routing | Total |
|------------|------------:|---------------:|------:|
| Global/Mixer | 0 | 48 | **48** |
| Synth | 167 | 37 | **204** |
| Drums | 176 | 71 | **247** |
| Reverb | 0 | 44 | **44** |
| Granular | 139 | 28 | **167** |
| Earth | 41 | 12 | **53** |
| **Total** | **523** | **240** | **763** |

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
> snapshot data for what they own, and may optionally carry refs metadata for
> child presets. This table is the
> canonical source of truth for which level owns each parameter.
>
> **Legend**: L1 = Sound Engine, L2 = Kit Preset (assembly/performance),
> L3 = Source Preset (mixer/routing/delay), L4 = Global/State.

### Live Registry Totals

The current live preset registry in `src/presets/ParamRegistry.ts` owns **763**
registry-backed keys:

| Level | Count |
|-------|------:|
| **L4** | 48 |
| **L3** | 80 |
| **L2** | 112 |
| **L1** | 523 |
| **Total** | **763** |

These counts exclude non-registry preset metadata such as `dualRanges`,
`sliderModes`, evolve configs, sub-lane state, `stepOverrides`, and
`clockDivs`. Those still belong to the same owning level as the params they
control.

### L4 — Global / State (48)

`scope: 'global'` now owns all cross-page mix and routing:

- master and harmony controls
- page dry levels
- reverb sends
- granular input sends
- Earth / Water / Ocean / Insects levels and sends
- randomization / circle-of-fifths / scale controls

Representative keys:
`masterVolume`, `synthLevel`, `lead1Level`, `lead2Level`, `drumLevel`,
`granularLevel`, `earthLevel`, `lead1ReverbSend`, `lead2ReverbSend`,
`granularWaterSend`, `granularInsectsSend`, `rootNote`, `tension`,
`cofDriftRate`, `randomWalkSpeed`.

### L3 — Source Presets (80)

| Scope | Count | Notes |
|-------|------:|-------|
| `synth` | 5 | Shared lead enable/random/vibrato/glide only |
| `drums` | 15 | Drum page behavior + stereo delay + per-voice delay sends |
| `reverb` | 44 | Entire reverb + spectral freeze surface |
| `granular` | 16 | Granular source routing/delay behavior |

There is still **no stable L3 Earth source scope** in the live registry. Earth
remains a deliberate exception until the Earth page is normalized.

### L2 — Kit Presets (112)

| Scope | Count | Notes |
|-------|------:|-------|
| `pad1Kit` | 9 | Morph, enable, voice mask, spread, octave |
| `pad2Kit` | 8 | Morph, enable, voice assign, octave |
| `lead1Kit` | 7 | Morph + algorithm mode |
| `lead2Kit` | 8 | Morph + algorithm mode + enable |
| `drumKit` | 56 | Distance/variation + morph config for all drum voices |
| `granularKit` | 12 | Voice enabled/gain + 4 macros |
| `earthKit` | 12 | Water/Insects toggles + Ocean behavior/filter config |

### L1 — Engine Presets (523)

| Scope | Count |
|-------|------:|
| `pad1` | 51 |
| `pad2` | 50 |
| `lead1` | 9 |
| `lead2` | 6 |
| `leadDelay` | 7 |
| `synthEuclidean` | 44 |
| `drumSub` | 10 |
| `drumKick` | 11 |
| `drumClick` | 13 |
| `drumBeepHi` | 18 |
| `drumBeepLo` | 17 |
| `drumNoise` | 17 |
| `drumMembrane` | 21 |
| `drumEuclidean` | 69 |
| `water` | 25 |
| `insects1` | 8 |
| `insects2` | 8 |
| `legacyGranular` | 12 |
| `granularVoice1` | 20 |
| `granularVoice2` | 20 |
| `granularVoice3` | 20 |
| `granularVoice4` | 20 |
| `granularLegacy` | 6 |
| `granularEuclidean` | 41 |

### Key Ownership Calls

These are the placements that were debated and are now locked in for the live
registry:

| Key / family | Final owner | Why |
|--------------|-------------|-----|
| `padFold*`, `pad2Fold*` | **L1 pad engines** | Part of the engine's sound identity |
| `detune` | **L1 `pad1`** | Sound design, not kit assembly |
| `synthVoiceMask`, `waveSpread`, `synthOctave` | **L2 `pad1Kit`** | Performance / routing around the engine |
| `pad2VoiceAssign`, `pad2Octave` | **L2 `pad2Kit`** | Same pattern as Pad 1 kit |
| `lead1Level`, `lead2Level` | **L4 global** | Cross-page mix, not lead kit identity |
| `leadDelay*` | **L1 `leadDelay`** | Separate child preset family for consistency with sequencers |
| `synthEuclidBaseBPM` | **L1 `synthEuclidean`** | Sequencer-owned timing behavior |
| `drumLevel`, `drumReverbSend` | **L4 global** | Cross-page mix/routing |
| `granularWaterSend`, `granularInsectsSend` | **L4 global** | Cross-page routing into granular |
| `granular` scene metadata | **L3 granular source** | Built-in scenes need source+kit+seq behavior together |
| Earth mix levels / sends | **L4 global** | Earth is acting like a mixer wrapper today |

### Earth Exception

Earth is intentionally incomplete as a clean preset tree:

- `earthKit` currently owns only 12 conservative keys
- `water`, `insects1`, and `insects2` are true L1 scopes
- Ocean behavior is still configured out of `earthKit`
- there is no finalized `earth` L3 registry scope yet

Treat Earth as a thin scene wrapper for now, not as proof that every source page
already has a clean L1/L2/L3 symmetry.

### Intentional Exclusions

These keys are intentionally **not** registry-backed today:

| Key | Status | Reason |
|-----|--------|--------|
| `leadTimbre` | Dropped | Dead legacy param ignored by the 4-op FM engine |
| `granularPreset` | UI-only | Shortcut for built-in granular scenes, not a stable preset scope |

### No Double-Saves Verification

- Registry-backed params have a single owner in `PARAM_REGISTRY`.
- Higher levels are **snapshot-first** today. They may carry `refs` metadata,
  but loading should not assume live child resolution.
- Metadata such as `dualRanges`, `sliderModes`, evolve configs, sub-lane states,
  `stepOverrides`, and `clockDivs` must travel with the owning level instead of
  being dropped at the store boundary.
- Live totals: `48 + 80 + 112 + 523 = 763` registry-backed keys.
