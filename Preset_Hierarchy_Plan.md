# Preset Hierarchy Plan

## Overview

A layered preset system where each level composes the levels below it. Users save and load at the level they're working at — from a single kick sound up to a full generative composition.

---

## Hierarchy Structure

```
Journey
├── State 1
│   ├── Mix parameters (levels, sends, FX)
│   ├── Sequencer parameters (4× seq config, evolve, clock)
│   ├── Drum Preset A (per-voice sound params)
│   ├── Drum Preset B (per-voice sound params)
│   ├── Lead Preset A (synth sound params)
│   ├── Lead Preset B (synth sound params)
│   └── Synth Preset (future)
├── State 2
├── State 3
├── State 4
├── Phrase lengths (per state, in bars)
├── Morph lengths (between states, in bars)
└── Connection map (which states transition to which)
```

---

## Level 1: Voice Presets (Drum / Lead / Synth)

### Scope
Parameters for a single synthesis engine (e.g., Sub, Kick, BeepHi).

### Data Format
```json
{
  "type": "drum-voice",
  "engine": "sub",
  "name": "Subterranean",
  "author": "factory|user",
  "versions": [
    {
      "v": 1,
      "note": "initial",
      "timestamp": 1740000000,
      "params": {
        "drumSubFreq": 45,
        "drumSubDecay": 1200,
        "drumSubDrive": 0.3,
        "drumSubDistance": 0.5,
        "drumSubVariation": 0.15,
        "drumSubLevel": 0.8,
        "drumSubShape": 0,
        "drumSubTone": 0.1,
        "drumSubSub": 0,
        "drumSubPitchEnv": 0,
        "drumSubPitchDecay": 50,
        "drumSubAttack": 0
      }
    },
    {
      "v": 2,
      "note": "more drive",
      "timestamp": 1740001000,
      "params": { "...same keys, different values..." }
    }
  ],
  "currentVersion": 2
}
```

### Storage Key
```
preset:drum-voice:sub:Subterranean
preset:drum-voice:kick:808 Boom
preset:lead-voice:fm:Glass Bell
```

### UI Placement
Inside each voice's parameter panel, top row:
```
┌─ SUB ──────────────────────────────────────────┐
│ [Subterranean ▾]  v2  [◀ ▶]  [Save] [Save As] │
│                                                 │
│  Freq [====]  Decay [====]  Drive [====]  ...  │
└─────────────────────────────────────────────────┘
```

### Interaction
- **Dropdown**: Shows factory presets (read-only, lock icon) + user presets, separated by divider
- **◀ ▶ arrows**: Step through version history (instant load, no dialog)
- **Save**: Pushes a new version onto the current preset's version stack
- **Save As**: Creates a new preset name with v1
- **Right-click/long-press** on user preset in dropdown: shows Delete option
- Factory presets: Save creates a user copy automatically

---

## Level 2: Drum Kit Preset (all 8 voices together)

### Scope
All 8 voice parameter sets + morph configuration (A/B preset selection, morph slider position).

### Data Format
```json
{
  "type": "drum-kit",
  "name": "Ambient Kit",
  "author": "user",
  "versions": [
    {
      "v": 1,
      "note": "initial mix",
      "timestamp": 1740000000,
      "voices": {
        "sub": { "preset": "Subterranean", "version": 2, "params": { "..." } },
        "kick": { "preset": "808 Boom", "version": 1, "params": { "..." } },
        "click": { "preset": "Rimshot", "version": 1, "params": { "..." } },
        "beepHi": { "preset": "Glass Bell", "version": 3, "params": { "..." } },
        "beepLo": { "preset": "Warm Pad", "version": 1, "params": { "..." } },
        "noise": { "preset": "White Wash", "version": 1, "params": { "..." } },
        "membrane": { "preset": "Snare Tight", "version": 1, "params": { "..." } },
        "freeze": { "preset": "Shimmer", "version": 1, "params": { "..." } }
      },
      "morphPosition": 0.5,
      "presetA": "Ambient Kit",
      "presetB": "Industrial Kit"
    }
  ],
  "currentVersion": 1
}
```

### Storage Key
```
preset:drum-kit:Ambient Kit
```

### UI Placement
Top of the drum synth panel, above the voice tabs:
```
┌─ DRUM SYNTH ───────────────────────────────────┐
│ Drum: [Ambient Kit ▾]  v1  [◀ ▶]  [Save] [As] │
│                                                 │
│ [Sub] [Kick] [Click] [BeepHi] [BeepLo] ...     │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a drum kit overwrites all 8 voices at once
- Confirmation dialog if any voice has unsaved changes
- Dot indicator on dropdown when current state differs from saved version

---

## Level 3: Sequencer Pattern Preset

### Scope
All 4 sequencer configs — trigger patterns, probability, ratchet, pitch lane, expression lane, morph lane, clock divisions, swing, evolve settings, source assignments.

### Data Format
```json
{
  "type": "seq-pattern",
  "name": "Polyrhythm Drift",
  "author": "user",
  "versions": [
    {
      "v": 1,
      "note": "initial",
      "timestamp": 1740000000,
      "bpm": 120,
      "sequencers": [
        {
          "clockDiv": "1/8",
          "swing": 0.1,
          "sources": { "sub": true, "kick": false, "..." },
          "trigger": {
            "steps": 16, "hits": 4, "rotation": 2,
            "pattern": [true, false, "..."],
            "overrides": [3, 7],
            "probability": [1.0, 0.8, "..."],
            "ratchet": [1, 1, 2, "..."],
            "ghostVelocity": { "5": 0.3 },
            "ghostDecay": { "5": 0.7 }
          },
          "pitch": {
            "enabled": true, "steps": 8, "mode": "semitones",
            "offsets": [0, 4, 7, 12, 7, 4, 0, -5],
            "root": 60, "scale": "Major"
          },
          "expression": {
            "enabled": true, "steps": 5,
            "velocities": [1.0, 0.8, 0.9, 0.7, 0.85]
          },
          "morph": {
            "enabled": false, "steps": 4,
            "values": [1.0, 0.75, 0.5, 0.25]
          },
          "evolve": {
            "enabled": true,
            "everyBars": 4,
            "intensity": 25,
            "methods": {
              "rotateDrift": true,
              "velocityBreath": true,
              "swingDrift": true,
              "probDrift": false,
              "morphDrift": false,
              "ghostNotes": false,
              "hitDrift": false,
              "ratchetSpray": false,
              "pitchWalk": false
            }
          },
          "linked": false
        }
      ]
    }
  ],
  "currentVersion": 1
}
```

### Storage Key
```
preset:seq-pattern:Polyrhythm Drift
```

### UI Placement
Top of the sequencer panel:
```
┌─ SEQUENCER ────────────────────────────────────┐
│ Pattern: [Poly Drift ▾]  v1  [◀ ▶]  [Save] [As]│
│                                                 │
│ [Seq1] [Seq2] [Seq3] [Seq4]  [Overview]        │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a sequencer preset does NOT change drum/lead sounds
- Only changes patterns and sequencer structure
- Allows swapping rhythms independently of sounds

---

## Level 4: State Preset

### Scope
Everything for one state slot: Mix + Sequencer + Drum Kit + Lead Preset.

### Data Format
```json
{
  "type": "state",
  "name": "Desert Night",
  "author": "user",
  "versions": [
    {
      "v": 1,
      "note": "initial composition",
      "timestamp": 1740000000,
      "mix": {
        "drumLevel": 0.8,
        "drumReverbSend": 0.3,
        "delayTime": 375,
        "delayFeedback": 0.3,
        "delayMix": 0.15,
        "delayFilter": 2000
      },
      "drumKit": {
        "name": "Ambient Kit",
        "version": 1,
        "data": { "...embedded drum-kit object..." }
      },
      "leadPreset": {
        "name": "Ethereal Pad",
        "version": 1,
        "data": { "...embedded lead-voice object..." }
      },
      "seqPattern": {
        "name": "Polyrhythm Drift",
        "version": 1,
        "data": { "...embedded seq-pattern object..." }
      }
    }
  ],
  "currentVersion": 1
}
```

### Storage Key
```
preset:state:Desert Night
```

### UI Placement
In the state bar at the top of the app:
```
┌─ STATE ────────────────────────────────────────┐
│ [1●] [2] [3] [4]                               │
│ State 1: [Desert Night ▾]  v1  [◀ ▶]  [Save]  │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a state preset replaces everything in that state slot
- Other state slots are unaffected
- Modified indicator (●) when state differs from last saved version

---

## Level 5: Journey Preset

### Scope
All 4 states + phrase lengths + morph lengths + connection map. The full generative composition.

### Data Format
```json
{
  "type": "journey",
  "name": "Midnight Caravan",
  "author": "user",
  "versions": [
    {
      "v": 1,
      "note": "first draft",
      "timestamp": 1740000000,
      "states": [
        { "name": "Desert Night", "version": 1, "data": { "..." } },
        { "name": "Oasis", "version": 1, "data": { "..." } },
        { "name": "Sandstorm", "version": 2, "data": { "..." } },
        { "name": "Starlight", "version": 1, "data": { "..." } }
      ],
      "phraseBars": [8, 12, 8, 16],
      "morphBars": [4, 6, 4, 8],
      "connections": [[0,1], [1,2], [2,3], [3,0]]
    }
  ],
  "currentVersion": 1
}
```

### Storage Key
```
preset:journey:Midnight Caravan
```

### UI Placement
Top-level app bar, above the state selector:
```
┌─ JOURNEY ──────────────────────────────────────┐
│ [Midnight Caravan ▾]  v1  [◀ ▶]  [Save] [As]  │
│                                                 │
│ Flow: [1] ──▶ [2] ──▶ [3] ──▶ [4] ──▶ [1]     │
│ Phrase:  8b    12b     8b     16b               │
│ Morph:    4b     6b     4b      8b              │
└─────────────────────────────────────────────────┘
```

---

## Visual Summary (Full UI Stack)

```
┌─────────────────────────────────────────────────┐
│ JOURNEY: [Midnight Caravan ▾] v1 [◀▶] [💾] [As] │  ← Level 5
├─────────────────────────────────────────────────┤
│ [1●] [2] [3] [4]  State: [Desert Night ▾] [💾]  │  ← Level 4
├─────────────────────────────────────────────────┤
│ Pattern: [Polyrhythm ▾] v1 [◀▶] [💾]            │  ← Level 3
│ ┌────┬────┬────┬────┐                            │
│ │Seq1│Seq2│Seq3│Seq4│                            │
│ └────┴────┴────┴────┘                            │
├─────────────────────────────────────────────────┤
│ Drum: [Ambient Kit ▾] v1 [◀▶] [💾]              │  ← Level 2
│ [Sub] [Kick] [Click] [BpH] [BpL] [Noi] [Mem]   │
│ ┌───────────────────────────────────────────┐    │
│ │ [Subterranean ▾] v2 [◀▶] [💾]            │    │  ← Level 1
│ │ Freq [===] Decay [===] Drive [===]        │    │
│ └───────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Loading Rules

| Action | What changes | What stays |
|--------|-------------|------------|
| Load voice preset | That one voice | Everything else |
| Load drum kit | All 8 voices + morph | Sequencer, mix, lead |
| Load seq pattern | All 4 seqs + evolve | Sounds, mix |
| Load state | Everything in that slot | Other states, journey config |
| Load journey | Everything | Nothing |

---

## Embedding vs Referencing

### Phase 1 (MVP): Embedded
- State preset contains a **full copy** of all child parameters
- Editing a voice preset after saving a state does NOT retroactively change the state
- Simple, no dependency tracking, no breakage

### Phase 2 (Future): Referenced
- State stores references: `"drumKit": { "name": "Ambient Kit", "version": 2 }`
- Editing the drum kit updates all states that reference it
- Requires dependency graph UI and conflict resolution
- Only add this when users ask for it

---

## Versioning

### How It Works
Each preset maintains a linear **version stack**. Every save creates a new version rather than overwriting.

```
"Dusty Boom" (Kick)
├── v3 (current) — "added more tail"
├── v2 — "less click, longer decay"
└── v1 — "initial"
```

### Version Navigation UI
```
[Dusty Boom ▾]  v3  [◀ ▶]  [Save]  [Save As]
```
- ◀ ▶ arrows step through versions with instant parameter load
- No confirmation dialogs — stepping is non-destructive (versions persist)

### Version Limit
- **20 versions max** per preset (FIFO eviction of oldest)
- Factory presets always have exactly 1 version and are read-only
- Saving a factory preset auto-creates a user copy with v1

### Diff Indicator
When stepping between versions, parameter rows that changed show a brief highlight (colored dot on the slider label). No modal, no popup — inline visual hints only.

### Version Stack at Higher Levels
State and Journey versions capture references to the specific version numbers of their children:
```json
{
  "drumKit": { "name": "Ambient Kit", "version": 2 },
  "seqPattern": { "name": "Polyrhythm", "version": 1 }
}
```
Restoring State v1 restores the exact child versions it was saved with.

---

## Modified Indicator

Every level shows a dot when the current parameter state differs from the last saved/loaded version:

```
Drum: [Ambient Kit ● ▾]     ← modified, unsaved changes
Drum: [Ambient Kit ▾]       ← clean, matches saved version
```

Implementation: On any parameter change, compare current `state` values against the loaded version's `params`. Set a dirty flag per level. Clear on save or load.

---

## Storage Architecture

### Layered Approach

| Phase | Storage | Covers |
|-------|---------|--------|
| **Prototype** | localStorage | Quick, zero setup, ~5-10MB |
| **Production** | IndexedDB | Full hierarchy, versioning, hundreds of presets, 50MB+ |
| **Multi-device** | Vercel KV / Supabase | Cloud sync, sharing, community presets |
| **Samples** | Vercel Blob / S3 | Audio sample storage for sample-based engines |

### Key Scheme
```
preset:drum-voice:sub:Subterranean
preset:drum-voice:kick:808 Boom
preset:drum-kit:Ambient Kit
preset:seq-pattern:Polyrhythm Drift
preset:state:Desert Night
preset:journey:Midnight Caravan
```

### Abstraction Layer
All preset operations go through a thin async interface so the storage backend can be swapped without touching UI code:

```javascript
const PresetStore = {
  async save(key, data) { ... },
  async load(key) { ... },
  async list(prefix) { ... },
  async delete(key) { ... },
  async exportJSON(key) { ... },
  async importJSON(file) { ... },
};
```

**Critical**: Use `async` from day one, even for localStorage. Zero refactoring when migrating to cloud.

### Factory vs User Presets
- Factory presets: loaded from `/presets/DrumSynth/*.json` via fetch (as currently implemented)
- User presets: stored in localStorage/IndexedDB
- Both appear in the same dropdown, separated by a divider
- Factory presets show a lock icon and cannot be overwritten or deleted

### Export / Import
- **Export**: Downloads a `.json` file containing the full preset (with all versions embedded)
- **Import**: File input reads `.json`, validates structure, writes to storage
- Export/Import works at any level — export a single voice, a kit, or an entire journey

---

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| 1 | PresetStore abstraction layer (localStorage backend) | 1h |
| 2 | Level 1: Voice preset save/load/versioning UI | 3h |
| 3 | Level 2: Drum kit preset save/load | 2h |
| 4 | Level 3: Sequencer pattern preset save/load | 2h |
| 5 | JSON export/import at all levels | 1h |
| 6 | Modified indicator (dirty flag per level) | 1h |
| 7 | Version diff highlighting | 1h |
| 8 | Level 4: State preset (requires state system build-out) | 3h |
| 9 | Level 5: Journey preset (requires journey system build-out) | 3h |
| 10 | IndexedDB migration | 2h |
| 11 | Cloud sync (Vercel KV / Supabase) | 4h |

Phases 1-5 cover the drum synth prototype. Phases 8-9 depend on the state/journey UI being built. Phase 11 is independent and can happen anytime after Phase 1.
