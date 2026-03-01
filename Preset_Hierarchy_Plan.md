# Preset Hierarchy Plan — v2

> **v2 revision** — Updated to reflect the actual codebase as of February 2026.
> Changes from v1: 7 drum voices (not 8 — no freeze), Pad 1/Pad 2 added, Lead 2 added,
> Ocean synth added, Granular synth added, 8 Euclidean lanes (4 drum + 4 synth),
> diamond-graph journey topology (not linear 4-slot), accurate parameter prefixes throughout.

## Overview

A layered preset system where each level composes the levels below it. Users save and load at the level they're working at — from a single kick sound up to a full generative composition.

---

## Hierarchy Structure

```
Journey (diamond-graph: 2–4 nodes + connections)
├── Node 1 (= State preset)
│   ├── Mix parameters (levels, sends, FX, master)
│   ├── Drum Sequencer (4 Euclidean lanes, BPM, swing, division)
│   ├── Synth Sequencer (4 Euclidean lanes, tempo, source routing)
│   ├── Drum Kit (7 voices × A/B morph config)
│   ├── Pad 1 Preset (6-voice poly, A/B morph)
│   ├── Pad 2 Preset (6-voice poly, A/B morph)
│   ├── Lead 1 Preset (4op FM, A/B morph, custom ADSR)
│   ├── Lead 2 Preset (4op FM, C/D morph, custom ADSR)
│   ├── Ocean Preset (wave synth + sample layer)
│   └── Granular Preset (grain engine params)
├── Node 2
├── Node 3 (optional)
├── Node 4 (optional)
├── Phrase lengths (per node, in bars)
├── Morph durations (per connection, in bars)
├── Connection map (source → target, probability weights)
└── Diamond positions (center, top, right, bottom, left)
```

---

## Level 1: Voice Presets

### Scope
Parameters for a single synthesis engine. Covers **all** voice types in the app.

### Voice Inventory (actual codebase)

| # | Type | Engine | Prefix | Param Count | Factory Presets |
|---|------|--------|--------|-------------|-----------------|
| 1 | Drum | Sub | `drumSub*` | 12 | 16 |
| 2 | Drum | Kick | `drumKick*` | 14 | 17 |
| 3 | Drum | Click | `drumClick*` | 16 | 23 |
| 4 | Drum | BeepHi | `drumBeepHi*` | 21 | 28 |
| 5 | Drum | BeepLo | `drumBeepLo*` | 20 | 26 |
| 6 | Drum | Noise | `drumNoise*` | 20 | 31 |
| 7 | Drum | Membrane | `drumMembrane*` | 24 | 20 |
| 8 | Pad | Pad 1 | `pad*` (no number) | ~60 | A/B morph from Lead4opFM pool |
| 9 | Pad | Pad 2 | `pad2*` | ~60 | A/B morph from Lead4opFM pool |
| 10 | Lead | Lead 1 (4op FM) | `lead1*` | ~20 | 17 (Lead4opFM/) |
| 11 | Lead | Lead 2 (4op FM) | `lead2*` | ~18 | same pool as Lead 1 |
| 12 | Ocean | Wave + Sample | `ocean*` | ~12 | none (parametric only) |
| 13 | Granular | Grain engine | `granular*` / standalone | ~15 | none (parametric only) |

> **Note**: v1 plan listed 8 drum voices including "freeze". Freeze has an orphaned preset
> file (`DrumSynth/freeze.json`) but **no `drumFreeze*` params exist in `SliderState`**.
> The actual count is **7 drum voices**.

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
    }
  ],
  "currentVersion": 1
}
```

For non-drum voices, the same format applies with appropriate type discriminators:
```
type: "pad-voice"    engine: "pad1" | "pad2"
type: "lead-voice"   engine: "lead1" | "lead2"
type: "ocean-voice"  engine: "ocean"
type: "granular-voice" engine: "granular"
```

### Storage Key
```
preset:drum-voice:sub:Subterranean
preset:drum-voice:kick:808 Boom
preset:pad-voice:pad1:Warm Wash
preset:lead-voice:lead1:Glass Bell
preset:ocean-voice:ocean:Deep Swell
preset:granular-voice:granular:Shimmer Cloud
```

### Param Extraction (implementation helper)
Each voice type needs an `extract` and `inject` function pair:
```typescript
// Extract voice params from flat SliderState → VoicePreset.params
function extractDrumVoiceParams(state: SliderState, voice: DrumVoiceName): Record<string, number>;

// Inject VoicePreset.params back into SliderState
function injectDrumVoiceParams(state: SliderState, voice: DrumVoiceName, params: Record<string, number>): SliderState;

// Similarly for pad, lead, ocean, granular
function extractPadParams(state: SliderState, pad: 1 | 2): Record<string, number | string | boolean>;
function extractLeadParams(state: SliderState, lead: 1 | 2): Record<string, number | string | boolean>;
function extractOceanParams(state: SliderState): Record<string, number | boolean>;
function extractGranularParams(state: SliderState): Record<string, number | boolean>;
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

## Level 2: Drum Kit Preset (all 7 voices together)

### Scope
All 7 voice parameter sets + per-voice morph configuration (A/B preset selection, morph slider position, morph mode).

### Current State
Each drum voice already has A/B morph keys in `SliderState`:
- `drum{Voice}PresetA`, `drum{Voice}PresetB` — factory preset names
- `drum{Voice}Morph` — morph slider 0..1
- `drum{Voice}MorphAuto` — boolean auto-morph toggle
- `drum{Voice}MorphSpeed` — auto-morph speed
- `drum{Voice}MorphMode` — `'linear' | 'pingpong' | 'random'`
- `drumMorphSliderAnimate` — global animate toggle

A drum kit preset bundles **all 7 voices** + their morph config into one saveable unit.

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
        "membrane": { "preset": "Snare Tight", "version": 1, "params": { "..." } }
      },
      "morphConfig": {
        "sub": { "presetA": "Subterranean", "presetB": "Deep Pulse", "morph": 0.5, "morphMode": "linear" },
        "kick": { "..." },
        "...all 7 voices..."
      },
      "drumMorphSliderAnimate": true
    }
  ],
  "currentVersion": 1
}
```

### Storage Key
```
preset:drum-kit:Ambient Kit
```

### Param Extraction
```typescript
const DRUM_VOICES = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'] as const;

function extractDrumKit(state: SliderState): DrumKitPreset;
function injectDrumKit(state: SliderState, kit: DrumKitPreset): SliderState;
```

### UI Placement
Top of the drum synth panel, above the voice tabs:
```
┌─ DRUM SYNTH ───────────────────────────────────┐
│ Drum: [Ambient Kit ▾]  v1  [◀ ▶]  [Save] [As] │
│                                                 │
│ [Sub] [Kick] [Click] [BpHi] [BpLo] [Noi] [Mem] │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a drum kit overwrites all 7 voices at once
- Confirmation dialog if any voice has unsaved changes
- Dot indicator on dropdown when current state differs from saved version

---

## Level 3: Sequencer Pattern Preset

### Scope
**Two separate sub-presets**, saveable independently or together:

1. **Drum Sequencer** — 4 Euclidean lanes (prefix `drumEuclid1..4*`)
   - Per-lane: Enabled, Preset, Steps, Hits, Rotation, voice routing (7 boolean targets: Sub/Kick/Click/BeepHi/BeepLo/Noise/Membrane), Probability, VelocityMin, VelocityMax, Level
   - Shared: `drumEuclidMasterEnabled`, `drumEuclidBaseBPM`, `drumEuclidTempo`, `drumEuclidSwing`, `drumEuclidDivision`

2. **Synth Sequencer** — 4 Euclidean lanes (prefix `synthEuclid1..4*`)
   - Per-lane: Enabled, Preset, Steps, Hits, Rotation, NoteMin, NoteMax, Level, Probability, Source
   - Source options: `'lead' | 'lead1' | 'lead2' | 'synth1'..'synth6'` (pad voice routing)
   - Shared: `synthEuclideanMasterEnabled`, `synthEuclideanTempo`, `synthChordSequencerEnabled`

### Data Format — Combined
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
      "drumSequencer": {
        "masterEnabled": true,
        "baseBPM": 120,
        "tempo": 1,
        "swing": 0.1,
        "division": 1,
        "lanes": [
          {
            "enabled": true,
            "preset": "four-on-floor",
            "steps": 16, "hits": 4, "rotation": 0,
            "targetSub": false, "targetKick": true, "targetClick": false,
            "targetBeepHi": false, "targetBeepLo": false,
            "targetNoise": false, "targetMembrane": false,
            "probability": 1.0, "velocityMin": 0.7, "velocityMax": 1.0,
            "level": 0.8
          },
          "...3 more lanes..."
        ]
      },
      "synthSequencer": {
        "masterEnabled": true,
        "tempo": 120,
        "chordSequencerEnabled": false,
        "lanes": [
          {
            "enabled": true,
            "preset": "arpeggio",
            "steps": 8, "hits": 5, "rotation": 2,
            "noteMin": 48, "noteMax": 84,
            "level": 0.6, "probability": 0.9,
            "source": "lead1"
          },
          "...3 more lanes..."
        ]
      }
    }
  ],
  "currentVersion": 1
}
```

### Storage Key
```
preset:seq-pattern:Polyrhythm Drift
preset:drum-seq:Four Floor         (drum-only sub-preset)
preset:synth-seq:Lead Arpeggios    (synth-only sub-preset)
```

### Param Extraction
```typescript
function extractDrumSequencer(state: SliderState): DrumSequencerPreset;
function extractSynthSequencer(state: SliderState): SynthSequencerPreset;
function extractFullSequencer(state: SliderState): SeqPatternPreset; // both combined

function injectDrumSequencer(state: SliderState, preset: DrumSequencerPreset): SliderState;
function injectSynthSequencer(state: SliderState, preset: SynthSequencerPreset): SliderState;
```

### UI Placement
Top of the sequencer panel:
```
┌─ SEQUENCER ────────────────────────────────────┐
│ Pattern: [Poly Drift ▾]  v1  [◀ ▶]  [Save] [As]│
│                                                 │
│ [Drum Seq] [Synth Seq]  [Overview]              │
│ [Lane1] [Lane2] [Lane3] [Lane4]                 │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a sequencer preset does NOT change drum/lead/pad sounds
- Only changes patterns and sequencer structure
- Can load drum-only or synth-only sub-presets independently
- Allows swapping rhythms independently of sounds

---

## Level 4: State Preset

### Scope
Everything for one journey node: Mix + Drum Kit + Synth Sequencer + Drum Sequencer + Pad 1 + Pad 2 + Lead 1 + Lead 2 + Ocean + Granular.

### Current State
The existing `SavedPreset` type is a flat dump of the entire `SliderState` (~500+ keys). A State preset is a structured decomposition of that same data into typed sub-sections, enabling partial load/save and clean embedding in journeys.

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
        "delayFilter": 2000,
        "reverbDecay": 3.5,
        "masterLimiterThreshold": -3,
        "masterVolume": 0.8,
        "leadLevel": 0.6,
        "leadReverbSend": 0.4,
        "granularLevel": 0.3,
        "oceanSampleLevel": 0.5,
        "...all mixer/FX keys..."
      },
      "drumKit": {
        "name": "Ambient Kit",
        "version": 1,
        "data": { "...embedded drum-kit preset..." }
      },
      "pad1": {
        "name": "Warm Wash",
        "version": 1,
        "data": { "...embedded pad-voice preset (pad* keys)..." }
      },
      "pad2": {
        "name": "Crystal Shimmer",
        "version": 1,
        "data": { "...embedded pad-voice preset (pad2* keys)..." }
      },
      "lead1": {
        "name": "Glass Bell",
        "version": 1,
        "data": { "...lead1* keys including ADSR..." }
      },
      "lead2": {
        "name": "Ethereal FM",
        "version": 1,
        "data": { "...lead2* keys including custom ADSR..." }
      },
      "ocean": {
        "data": { "...ocean* keys..." }
      },
      "granular": {
        "data": { "...granular*/grain* keys..." }
      },
      "drumSequencer": {
        "name": "Four Floor",
        "version": 1,
        "data": { "...embedded drum-seq preset..." }
      },
      "synthSequencer": {
        "name": "Lead Arpeggios",
        "version": 1,
        "data": { "...embedded synth-seq preset..." }
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

### Param Extraction
```typescript
// Full round-trip: SliderState ↔ StatePreset
function extractStatePreset(state: SliderState): StatePresetData;
function injectStatePreset(state: SliderState, preset: StatePresetData): SliderState;

// Internally decomposes into:
//   extractDrumKit + extractPadParams(1) + extractPadParams(2) +
//   extractLeadParams(1) + extractLeadParams(2) +
//   extractOceanParams + extractGranularParams +
//   extractDrumSequencer + extractSynthSequencer + extractMixParams
```

### UI Placement
In the journey node inspector or state bar:
```
┌─ STATE ────────────────────────────────────────┐
│ Node 1: [Desert Night ▾]  v1  [◀ ▶]  [Save]   │
│ Contains: Ambient Kit · Poly Drift · Glass Bell │
└─────────────────────────────────────────────────┘
```

### Interaction
- Loading a state preset replaces everything for the current journey node
- Other nodes are unaffected
- Modified indicator (●) when state differs from last saved version
- Can also be loaded outside of journey mode as a "full preset"

---

## Level 5: Journey Preset

### Scope
2–4 state nodes + phrase lengths + morph durations + connection map + diamond layout positions. The full generative composition.

### Current State
The journey system already exists using a diamond-graph architecture:
- Types: `JourneyConfig` (nodes[], connections[]), `JourneyNode` (presetId, phraseLength, position), `JourneyConnection` (morphDuration, probability)
- Topology: `DiamondPosition = 'center' | 'top' | 'right' | 'bottom' | 'left'` — center is START/END, 4 cardinal positions hold presets
- Phases: `'idle' | 'playing' | 'morphing' | 'self-loop' | 'ending' | 'ended'`
- Hook: `useJourney()` manages config and playback state
- Morph: `handleJourneyMorphTo` interpolates between state presets over N phrases

The current implementation stores journey nodes as references to `SavedPreset` objects. A journey preset formalizes this into a versioned, exportable format.

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
Top-level app bar, integrated with existing diamond journey UI:
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
┌─────────────────────────────────────────────────┐
│ JOURNEY: [Midnight Caravan ▾] v1 [◀▶] [💾] [As] │  ← Level 5
├─────────────────────────────────────────────────┤
│ Node: [Desert Night ▾]  v1  [◀▶] [💾]           │  ← Level 4
├──────────────────┬──────────────────────────────┤
│ Drum Seq: [...▾] │ Synth Seq: [...▾]            │  ← Level 3
│ [L1][L2][L3][L4] │ [L1][L2][L3][L4]            │
├──────────────────┴──────────────────────────────┤
│ Drum: [Ambient Kit ▾] v1 [◀▶] [💾]              │  ← Level 2
│ [Sub] [Kick] [Click] [BpHi] [BpLo] [Noi] [Mem] │
│ ┌───────────────────────────────────────────┐    │
│ │ [Subterranean ▾] v2 [◀▶] [💾]            │    │  ← Level 1 (drum)
│ │ Freq [===] Decay [===] Drive [===]        │    │
│ └───────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│ Pad 1: [Warm Wash ▾]   Pad 2: [Crystal ▾]      │  ← Level 1 (pad)
├─────────────────────────────────────────────────┤
│ Lead 1: [Glass Bell ▾]  Lead 2: [Ethereal ▾]   │  ← Level 1 (lead)
├─────────────────────────────────────────────────┤
│ Ocean: [Deep Swell ▾]  Granular: [Shimmer ▾]   │  ← Level 1 (env)
└─────────────────────────────────────────────────┘
```

---

## Loading Rules

| Action | What changes | What stays |
|--------|-------------|------------|
| Load voice preset (drum) | That one drum voice | Other voices, kit, seq, mix, pads, leads |
| Load voice preset (pad/lead) | That pad or lead engine | Everything else |
| Load voice preset (ocean/granular) | That engine | Everything else |
| Load drum kit | All 7 drum voices + morph config | Sequencer, mix, pads, leads, ocean, granular |
| Load drum seq pattern | 4 drum Euclidean lanes + clock | Sounds, synth seq, mix |
| Load synth seq pattern | 4 synth Euclidean lanes + clock | Sounds, drum seq, mix |
| Load full seq pattern | All 8 lanes + both clocks | Sounds, mix |
| Load state preset | Everything in that node | Other journey nodes |
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
- Factory drum presets: loaded from `/presets/DrumSynth/*.json` via fetch (7 voice manifest)
- Factory lead presets: loaded from `/presets/Lead4opFM/*.json` via fetch (17 presets)
- Factory full presets: loaded from `/presets/*.json` (5 presets: Gamelantest, Lasers, Static_frequencies, StringWavesR, ZoneOut1)
- User presets: stored in localStorage/IndexedDB
- Cloud presets: Supabase-backed via `CloudPresets.tsx` (already implemented)
- All sources appear in the same dropdown, separated by dividers
- Factory presets show a lock icon and cannot be overwritten or deleted

### Export / Import
- **Export**: Downloads a `.json` file containing the full preset (with all versions embedded)
- **Import**: File input reads `.json`, validates structure, writes to storage
- Export/Import works at any level — export a single voice, a kit, or an entire journey

---

## Implementation Order

| Phase | What | Effort | Notes |
|-------|------|--------|-------|
| 0 | Define TypeScript types for all preset levels | 1h | `PresetType`, `DrumVoicePreset`, `PadPreset`, `LeadPreset`, `OceanPreset`, `GranularPreset`, `DrumKitPreset`, `DrumSeqPreset`, `SynthSeqPreset`, `SeqPatternPreset`, `StatePreset`, `JourneyPreset` |
| 1 | Extract/inject helper functions | 2h | One pair per voice type + kit + seq + state. Pure functions, easy to unit test. Map `SliderState` keys to/from structured preset objects |
| 2 | PresetStore abstraction layer (localStorage backend) | 1h | Async `save/load/list/delete/export/import` interface |
| 3 | Level 1: Drum voice preset save/load/versioning UI | 3h | 7 voices, existing factory presets as baseline |
| 4 | Level 1: Pad 1/2 + Lead 1/2 voice preset UI | 2h | Reuse same preset dropdown/version component |
| 5 | Level 1: Ocean + Granular voice preset UI | 1h | Simpler — fewer params, no factory presets yet |
| 6 | Level 2: Drum kit preset save/load | 2h | Bundles all 7 voices via `extractDrumKit` |
| 7 | Level 3: Sequencer pattern preset (drum + synth) | 2h | Can save drum-only, synth-only, or combined |
| 8 | JSON export/import at all levels | 1h | Download/upload `.json` files |
| 9 | Modified indicator (dirty flag per level) | 1h | Compare current params against loaded version |
| 10 | Version diff highlighting | 1h | Inline colored dots on changed sliders |
| 11 | Level 4: State preset | 2h | Composes all sub-presets. Replaces current flat `SavedPreset` dump |
| 12 | Level 5: Journey preset | 2h | Wraps diamond topology + state references. Integrates with existing `useJourney()` |
| 13 | Migrate existing `SavedPreset` → structured format | 1h | Migration function for localStorage data |
| 14 | IndexedDB migration | 2h | Swap PresetStore backend |
| 15 | Cloud sync enhancement (Supabase) | 4h | Already partially exists via CloudPresets.tsx |

### Critical Path
Phases 0→1→2 must be done first (foundation). Then Levels can be built in any order.
Recommended: 0→1→2→3→6→7→11→12 (depth-first through the hierarchy).
Phases 4/5 (pad/lead/ocean/granular voice presets) can be done in parallel with drum kit work.

### Migration from Current System
The existing `SavedPreset` type stores a flat `SliderState` dump. To transition:
1. Build extract/inject helpers (Phase 1)
2. Keep `SavedPreset` as the internal transport format for journey morphing
3. Add structured preset types alongside — `SavedPreset` becomes "Level 4 State" internally
4. Migration function in Phase 13 converts old localStorage presets to new structured format
5. Cloud presets (Supabase) need schema update to support type-discriminated presets

Phases 0–7 cover the drum synth + sequencer prototype. Phases 11–12 depend on the structured preset types being solid. Phase 15 is independent and can happen anytime after Phase 2.

---

## Appendix A: Parameter Key Groups (for extract/inject implementation)

### Drum Voices (7)
```
sub:       drumSub{Freq,Decay,Drive,Distance,Variation,Level,Shape,Tone,Sub,PitchEnv,PitchDecay,Attack}
kick:      drumKick{Freq,Decay,Click,ClickDecay,Drive,Level,Shape,Tone,Sub,TuneRange,PitchDecay,ClickFilter,Attack,PitchEnv}
click:     drumClick{Freq,Decay,HPF,BPF,BPFResonance,Drive,Level,Shape,Tone,Noise,NoiseDecay,NoiseFilter,Body,BodyDecay,Attack,Variation}
beepHi:    drumBeepHi{Freq,Decay,ModIndex,ModRatio,FMDecay,Harmonics,Drive,Level,Shape,Tone,FMFeedback,...}
beepLo:    drumBeepLo{Freq,Decay,ModIndex,ModRatio,FMDecay,Drive,Level,Shape,Tone,...}
noise:     drumNoise{Decay,HPF,LPF,BPF,BPFResonance,Drive,Level,Shape,Tone,Body,BodyDecay,Attack,...}
membrane:  drumMembrane{Freq,Decay,Tension,Damping,NonLinearity,Size,Position,Drive,Level,Shape,...}
```

### Drum Morph (per voice)
```
drum{Voice}PresetA, drum{Voice}PresetB, drum{Voice}Morph,
drum{Voice}MorphAuto, drum{Voice}MorphSpeed, drum{Voice}MorphMode
```

### Pad 1 (prefix: pad*)
```
padEnabled, padOscAWave, padOscBWave, padOscMix, padSubEnabled, padNoiseType,
padFilterBEnabled, padLfo1{Rate,Depth,...}, padLfo2{...}, padModEnv{...},
padPresetA, padPresetB, padMorph, padMorphAuto, padMorphSpeed, ...
```

### Pad 2 (prefix: pad2*)
```
pad2Enabled, pad2VoiceAssign, pad2Attack, pad2OscAWave, pad2OscBWave,
pad2SubEnabled, pad2NoiseType, pad2FilterBEnabled, pad2Lfo1{...}, pad2Lfo2{...},
pad2ModEnv{...}, pad2PresetA, pad2PresetB, pad2Morph, pad2MorphAuto, pad2MorphSpeed, ...
```

### Lead 1 (prefix: lead1*)
```
lead1UseCustomAdsr, lead1Attack, lead1Decay, lead1Sustain, lead1Hold, lead1Release,
lead1Density, lead1Octave, lead1OctaveRange, lead1PresetA, lead1PresetB,
lead1Morph, lead1MorphAuto, lead1MorphSpeed, lead1MorphMode, lead1AlgorithmMode, lead1Level
```

### Lead 2 (prefix: lead2*)
```
lead2Enabled, lead2UseCustomAdsr, lead2Attack, lead2Decay, lead2Sustain, lead2Hold, lead2Release,
lead2PresetC, lead2PresetD, lead2Morph, lead2MorphAuto, lead2MorphSpeed,
lead2MorphMode, lead2AlgorithmMode, lead2Level
```

### Shared Lead
```
leadEnabled, leadRandomEnabled, leadLevel, leadReverbSend,
leadDelayTime, leadDelayFeedback, leadDelayMix,
leadVibratoDepth, leadVibratoRate, leadGlide, leadTimbre
```

### Ocean
```
oceanSampleEnabled, oceanSampleLevel, oceanWaveSynthEnabled, oceanWaveSynthLevel,
oceanFilterType, oceanFilterCutoff, oceanFilterResonance,
oceanDuration, oceanInterval, oceanFoam, oceanDepth
```

### Granular
```
granularEnabled, granularLevel, granularReverbSend,
maxGrains, grainProbability, grainSize, density, spray, jitter,
grainPitchMode, pitchSpread, stereoSpread, feedback, wetHPF, wetLPF
```

### Drum Euclidean (4 lanes)
```
drumEuclidMasterEnabled, drumEuclidBaseBPM, drumEuclidTempo, drumEuclidSwing, drumEuclidDivision
drumEuclid{1..4}Enabled, drumEuclid{1..4}Preset, drumEuclid{1..4}Steps,
drumEuclid{1..4}Hits, drumEuclid{1..4}Rotation,
drumEuclid{1..4}Target{Sub,Kick,Click,BeepHi,BeepLo,Noise,Membrane},
drumEuclid{1..4}Probability, drumEuclid{1..4}VelocityMin, drumEuclid{1..4}VelocityMax,
drumEuclid{1..4}Level
```

### Synth Euclidean (4 lanes)
```
synthEuclideanMasterEnabled, synthEuclideanTempo, synthChordSequencerEnabled
synthEuclid{1..4}Enabled, synthEuclid{1..4}Preset, synthEuclid{1..4}Steps,
synthEuclid{1..4}Hits, synthEuclid{1..4}Rotation,
synthEuclid{1..4}NoteMin, synthEuclid{1..4}NoteMax,
synthEuclid{1..4}Level, synthEuclid{1..4}Probability, synthEuclid{1..4}Source
```
