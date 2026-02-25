# Drum Synth — Generative Evolution System

## Overview

The Generative Evolution system adds bar-quantized, musically-safe pattern mutations to keep drum sequences interesting over long playback without requiring manual intervention. Mutations are applied at bar boundaries, respect the original pattern structure, and include automatic "home gravity" that prevents drift from going too far.

---

## UI Location

The **Evolve** button sits in the per-sequencer controls row alongside Clock, Swing, and Link:

```
┌─ Per-Seq Controls ──────────────────────────────────────────┐
│ Clock [1/8▾]  Swing [====]  Link [On]  Evolve [On]         │
└─────────────────────────────────────────────────────────────┘
```

When Evolve is toggled **On**, a purple-tinted panel slides open below:

```
┌─ Evolve Panel ──────────────────────────────────────────────┐
│ Every [4] bars   Intensity [====25%]           [Reset]      │
│                                                              │
│ [■] Rotate  [■] Velocity  [■] Swing  [□] Probability       │
│ [□] Morph   [□] Ghosts    [□] Ratchet  [□] Density         │
│ [□] Pitch                                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Controls

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| **Evolve** (button) | On/Off | Off | Master toggle for evolution on this sequencer |
| **Every N Bars** | 1–32 | 4 | How often evolution mutations are applied |
| **Intensity** | 0–100% | 25% | Scales mutation strength and auto-enables methods |
| **Reset** (button) | — | — | Reverts all parameters to the home pattern snapshot |
| **Method checkboxes** | On/Off each | See tiers | Fine-grained control over which mutations run |

### Intensity Auto-Mapping

The Intensity slider automatically enables/disables evolution methods in tiers:

| Intensity Range | Methods Enabled |
|----------------|-----------------|
| 0–30% | Rotate Drift, Velocity Breath, Swing Drift |
| 30–60% | + Probability Drift, Morph Drift |
| 60–80% | + Ghost Notes, Ratchet Spray |
| 80–100% | + Hit Count Drift, Pitch Walk |

Users can override individual checkboxes after the intensity sets them.

---

## Evolution Methods

### Tier 1: Nearly Invisible (always safe)

#### 1. Rotate Drift
- **What:** Shifts Euclidean rotation by ±1
- **Probability:** 25% × intensity per cycle
- **Safety:** Pattern DNA (steps, hits) unchanged — only phase shifts
- **Musical effect:** The "downbeat" moves one step, creating subtle groove variations

#### 2. Velocity Breath
- **What:** Random walk on expression/velocity values ±8%
- **Requires:** Expression lane enabled
- **Clamp:** 0.2–1.0 (never silent, never clips)
- **Musical effect:** Natural dynamic swells like a human drummer's varying force

#### 3. Swing Drift
- **What:** Random walk on swing value ±3%
- **Clamp:** 0.0–0.75
- **Musical effect:** Groove feel subtly tightens or loosens

### Tier 2: Noticeable but Controlled

#### 4. Probability Drift
- **What:** Nudges probability on active steps ±8%
- **Floor:** 30% (steps never fully disappear)
- **Only affects:** Steps that are already active in the Euclidean pattern
- **Musical effect:** Some hits become more/less likely, creating evolving density

#### 5. Morph Drift
- **What:** Random walk on morph lane values ±5%
- **Requires:** Morph lane enabled
- **Clamp:** 0.0–1.0
- **Musical effect:** Timbral evolution between Preset A and B

### Tier 3: Structural (use sparingly)

#### 6. Ghost Note Injection
- **Probability:** 30% × intensity per cycle
- **What:** Enables 1–2 previously inactive steps at 15–35% probability
- **Musical effect:** Subtle ghost hits appear and disappear, adding organic fill

#### 7. Ratchet Spray
- **Probability:** 20% × intensity per cycle
- **What:** Toggles ratchet between 1× and 2× on active steps
- **Musical effect:** Occasional double-hits (flams) appear briefly

#### 8. Hit Count Drift
- **Probability:** 15% × intensity per cycle
- **What:** Changes Euclidean hit count by ±1
- **Clamp:** 1 to (steps - 1)
- **Clears overrides** (ghost notes) on change
- **Musical effect:** Pattern becomes slightly denser or sparser

#### 9. Pitch Walk
- **Probability:** 25% × intensity per cycle
- **What:** Drifts one pitch offset by ±1 scale degree (±2 semitones in semitone mode)
- **Requires:** Pitch lane enabled
- **Max drift:** ±3 from home value (never wanders far)
- **Musical effect:** Melodic line slowly evolves while staying near the original

---

## Home Pattern & Gravity

### Snapshot
When Evolve is enabled (or playback starts with Evolve on), the current state is saved as the **Home Pattern**:
- Rotation, hit count, pattern array
- All probability values
- All ratchet values
- All expression velocities
- All morph values
- Swing value
- All pitch offsets

### Gravity (Return Bias)
Every evolution cycle has a **15%** chance (scaled inversely with intensity) to pull one parameter back toward its home value:

- **Rotation:** Steps back by 1 toward home rotation
- **Swing:** Blends 30% toward home swing
- **Probability:** All values blend 20% toward home probabilities
- **Velocities:** All values blend 20% toward home velocities

This creates a natural **breathing pattern**: drift out → settle back → drift again. Higher intensity = less gravity = more adventurous drift.

### Reset Button
Instantly restores all parameters to the home pattern snapshot. Evolution state (`lastEvolveBar`) is also reset so the next evolution cycle starts fresh.

---

## Scheduler Integration

Evolution is triggered in `seqMasterScheduler()` when `stepIndex` wraps to 0 (bar boundary):

```
for each sequencer tick:
  schedule step
  advance stepIndex (wraps at trigger.steps)
  increment totalStepCount (never wraps)
  if stepIndex === 0 AND evolve.enabled:
    seqEvolveStep(s)  // checks everyBars, applies mutations
```

Bar number is derived from `totalStepCount / trigger.steps`. Evolution only fires when `bar % everyBars === 0`.

---

## Visual Feedback

When a mutation is applied to the currently visible sequencer, the sequencer body briefly flashes with a purple glow (`seq-evolve-flash` animation, 0.4s ease-out). The UI is then re-rendered to show updated values (rotation indicator, probability bars, velocity bars, etc.).

---

## Per-Sequencer Independence

Each of the 4 sequencers has its own independent Evolve state:
- Own enabled/disabled toggle
- Own everyBars and intensity
- Own method checkboxes
- Own home pattern snapshot
- Own bar counter (`totalStepCount`)

This means Seq 1 (kick) can evolve slowly (every 8 bars, 15% intensity) while Seq 2 (hi-hat) evolves faster (every 2 bars, 50% intensity).

---

## Design Principles

1. **Bar-quantized only** — no mid-bar mutations
2. **One mutation per method per cycle** — never overwhelm
3. **Never mutate what the user can't see** — disabled lanes are skipped
4. **Home gravity prevents unbounded drift** — patterns breathe rather than wander
5. **Intensity = single knob for complexity** — power users get per-method checkboxes
6. **Per-sequencer** — different voices evolve at different rates
7. **Reset = safety net** — instant revert to starting pattern

---

## Implementation Files

| File | Changes |
|------|---------|
| `drum-synth-ui-prototype.html` | CSS styles (`.seq-evolve-btn`, `.seq-evolve-panel`, `.seq-evolve-flash`), `createSequencer()` evolve state, evolution engine functions (`seqSnapshotHome`, `seqEvolveIntensityToMethods`, `seqEvolveStep`, `seqToggleEvolve`, `seqResetEvolve`), scheduler integration (`totalStepCount`, bar-boundary trigger), UI panel HTML + event listeners |

---

## Recommended Default Settings

For ambient/generative use:
- **Every:** 4 bars
- **Intensity:** 25%
- **Methods:** Rotate + Velocity + Swing (auto-enabled at 25%)

For more active evolution:
- **Every:** 2 bars
- **Intensity:** 50%
- **Methods:** Rotate + Velocity + Swing + Probability + Morph

For experimental/maximal:
- **Every:** 1 bar
- **Intensity:** 80%+
- **Methods:** All enabled
