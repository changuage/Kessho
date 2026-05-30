# Kessho Product-Core Harmony Update Delivery Plan

## Purpose

Build a product-core-first harmony architecture that keeps Kessho's current generative harmony baseline, while adding:

1. manual voicing audition and live harmony control,
2. 8 saved symbolic chord slots,
3. an 8-step chord sequence,
4. deterministic slot/sequence generation,
5. preset-morph-aware harmony behavior,
6. current and next harmony note-pool reporting for the UI.

This is **not** a note-performance sequencer. The new system controls the **resolved harmony note pool** that the rest of Kessho uses to produce notes.

Implement the product-core architecture first, then pause before UI implementation so a separate UI implementation pass can build against the contract in this document.

---

## Non-negotiable product decisions

### 1. Product-core first

Implement this for Product Core, not as a React-only or host-only feature.

The UI should not directly trigger pad, lead, piano, drum, or texture notes. All manual voicing, slot, sequence, and generation behavior must resolve into product-core harmony state/events.

Correct flow:

```text
Manual Voicing / Chord Lab UI
        ↓
L4 harmony state / product-core snapshot intent
        ↓
Product-core harmony resolver
        ↓
Resolved harmony frame
        ↓
Current and next harmony note pools
        ↓
Existing engines/layers use the pool
```

Avoid this:

```text
Manual Voicing UI
        ↓
direct note commands to pad/lead/piano/drum engines
```

### 2. Keep the generative baseline

The existing tension-based generative harmony remains the default baseline. Manual control, slots, and sequences do not replace the baseline; they bias or force the harmony resolver.

Priority stack:

```text
1. Audition preview       preview only, never mutates engine
2. Manual live control    highest priority when available and active
3. Slot trigger           live reharmonization from saved slot
4. Chord sequence         8-step sequence authority when enabled
5. Generative baseline    default fallback
6. Preset morph context   modifies root/scale/tension context used by all layers
```

### 3. Bias by default, force when requested

Use two control strengths:

```ts
type HarmonyControlStrength = 'bias' | 'force';
```

Default: `bias`.

Meaning:

```text
Bias:
The selected root/degree/chord quality guides the Harmony Engine, but the current root, scale, Circle-of-Fifths movement, tension, and voicing logic can still influence the final note pool.

Force:
The selected harmonic intent is used directly.
```

UI labels should be:

```text
[Bias] [Force]
```

Do not use `override` as the primary user-facing label.

### 4. Saved chords are hybrid, but default to symbolic

Saved chords must support symbolic and captured forms, but default usage is symbolic so saved chords can adapt to:

```text
current root
Circle-of-Fifths root movement
preset morph root
user-defined root
current scale
```

Default saved chord behavior:

```text
rootMode: degree
strength: bias
preserveCapturedVoicing: false
```

Only preserve exact captured notes when the user explicitly enables `Save Exact Voicing` / `Preserve Captured Voicing`.

### 5. 8 fixed chord slots

Use exactly 8 fixed chord slots for this delivery.

Slot trigger keyboard mapping:

```text
z x c v b n m ,
= slots 1-8
```

Number keys are reserved for page changes and must not be used for slot triggers.

### 6. 8 sequence steps

Use exactly 8 chord sequence steps for this delivery.

Sequence steps define the active harmony note pool. They do not define velocity, delay, strum, gate, ratchets, or per-voice playback timing.

### 7. Generation commits into editable structures

Generation must write deterministic symbolic harmony intents into slots and/or sequence steps.

Supported generation actions:

```text
Generate Slots
Generate Sequence
Generate Both
Regenerate Unlocked
Commit Baseline Map
```

Generated material must be stable on playback. It should change only when the user explicitly regenerates it.

Use the project seed for deterministic generation.

### 8. `quality: 'auto'` means use the tension engine

A sequence step may be generative while still repeatable in position/degree.

Example:

```ts
{
  mode: 'auto',
  degree: 4,
  quality: 'auto'
}
```

Meaning:

```text
Use degree V here, but let the existing tension system choose the chord color.
```

### 9. Preset morph behavior

Root and scale behavior:

```text
Root walks the Circle of Fifths using the current preset morph slider percentage.
Scale should walk the nearest musical path using the same morph percentage principle.
This is not phrase-quantized.
The slider position 0-100 directly determines the current morph root/scale location.
```

Slot and sequence behavior:

```text
0% through <50%: use Preset A slot bank and chord sequence.
>=50%: schedule/use Preset B slot bank and chord sequence at the relevant preset phase boundary.
```

Implementation note:

```text
If the codebase already has a preset phase boundary event/hook, use that.
If not, apply at the nearest existing morph-safe boundary used by the product-core preset morph system. Do not invent UI timing behavior.
```

Manual live control during preset morph:

```text
Manual live control is available only at morph 0% or 100%.
At morph values 1-99%, live control and slot-trigger reharmonization are disabled.
```

Audition behavior during morph:

```text
Audition may be allowed as preview-only.
It must not mutate product-core harmony state.
```

Capture during morph:

```text
Capture is endpoint-only for this delivery.
At 1-99% morph, capture is disabled.
```

### 10. No external product names in code or UI

Do not use names from external hardware/software products in code identifiers, comments, UI labels, state keys, docs, tests, or filenames.

Use neutral names:

```text
Manual Voicing
ManualHarmonyControl
HarmonyControlPopup
ChordLab
ChordMemory
ChordSequence
HarmonyIntent
ResolvedHarmonyFrame
```

Avoid names like external product references.

### 11. State/preset storage

Store chord slots and chord sequence in the **L4 harmony state**.

Locate the actual L4 harmony state objects/types in the codebase before implementing. Do not invent a parallel state tree if the L4 harmony state already exists.

No old-preset migration is required because existing presets do not have these new fields.

---

## Product-core architecture deliverables

### Phase A — Locate the actual product-core/L4 harmony state

Before coding, inspect and document:

```text
src/audio/coreProductSnapshotTypes.ts
src/audio/coreProductSnapshot.ts
src/audio/coreProductSnapshotState.ts
src/audio/coreProductSnapshotEncoder.ts
src/audio/coreProductEvents.ts
src/audio/CoreProductRuntimeAdapter.ts
src/audio/product/** if applicable
src/audio/generated/** schema files if harmony params/events are generated
```

Find the exact existing location for:

```text
Product harmony snapshot
Product preset state
L4 harmony state
Product-core parameter IDs
Product-core event IDs
Runtime adapter diffing
Telemetry harmony reporting
```

Expected current limitation:

```text
ProductHarmonySnapshot currently appears to be small: root, scale, tension, chordMode, voicingMode.
Runtime adapter currently appears to diff root, scale, and tension only.
```

Verify this in the local code before editing.

### Phase B — Add neutral harmony types

Create product-core harmony-control types in the appropriate product-core location.

Recommended constants:

```ts
export const HARMONY_SLOT_COUNT = 8 as const;
export const HARMONY_SEQUENCE_STEP_COUNT = 8 as const;
export const HARMONY_POOL_MAX_NOTES = 8 as const;
```

Recommended enums:

```ts
export type HarmonyIntentSource =
  | 'baseline'
  | 'sequence'
  | 'slot'
  | 'manualControl'
  | 'audition'
  | 'presetMorph';

export type HarmonyControlStrength = 'bias' | 'force';

export type HarmonyRootMode = 'degree' | 'absolute' | 'captured';

export type HarmonyChordQuality =
  | 'auto'
  | 'dim'
  | 'min'
  | 'maj'
  | 'sus'
  | 'maj7'
  | 'min7'
  | 'dom7'
  | 'add9'
  | 'six'
  | 'sixNine'
  | 'nine'
  | 'quartal'
  | 'cluster'
  | 'custom';

export type HarmonyBassMode = 'off' | 'root' | 'fifth' | 'captured';
```

Recommended intent type:

```ts
export interface HarmonyIntent {
  source: HarmonyIntentSource;
  strength: HarmonyControlStrength;

  rootMode: HarmonyRootMode;
  degree: number;        // 0-6 when rootMode is degree
  rootNote: number;      // 0-11 when absolute/captured; fallback-safe

  quality: HarmonyChordQuality;
  extensions: string[];

  inversion: number;
  spread: number;
  octave: number;

  bassMode: HarmonyBassMode;
  bassNote: number | null;

  capturedMidiNotes: number[];
  preserveCapturedVoicing: boolean;
}
```

Recommended slot type:

```ts
export interface HarmonyChordSlot {
  id: number; // 0-7
  name: string;
  intent: HarmonyIntent;
  locked: boolean;
}
```

Recommended sequence step type:

```ts
export type HarmonySequenceStepMode =
  | 'auto'
  | 'intent'
  | 'slotCopy'
  | 'slotFollow';

export interface HarmonySequenceStep {
  id: number; // 0-7
  enabled: boolean;
  locked: boolean;

  mode: HarmonySequenceStepMode;

  degree: number;
  quality: HarmonyChordQuality;

  intent: HarmonyIntent | null;
  slotId: number | null;

  probability: number;
}
```

Recommended control state:

```ts
export type ManualHarmonyControlMode = 'audition' | 'control' | 'capture';

export interface ManualHarmonyControlState {
  enabled: boolean;
  mode: ManualHarmonyControlMode;
  strength: HarmonyControlStrength;

  selectedRootNote: number;
  selectedDegree: number;
  selectedQuality: HarmonyChordQuality;
  selectedExtensions: string[];
  selectedOctave: number;
  selectedInversion: number;
  selectedSpread: number;
  selectedBassMode: HarmonyBassMode;

  activeIntent: HarmonyIntent | null;
  auditionIntent: HarmonyIntent | null;

  slotTriggerMode: boolean;
  activeSlotId: number | null;
}
```

Recommended resolved frame:

```ts
export interface ResolvedHarmonyFrame {
  activeSource: HarmonyIntentSource;
  activeStepIndex: number | null;
  activeSlotId: number | null;

  rootMidi: number;
  scaleId: number;
  degree: number;
  quality: HarmonyChordQuality;

  currentNotePool: number[];
  bassNote: number | null;

  nextNotePool: number[];
  nextSource: HarmonyIntentSource | null;
  nextStepIndex: number | null;

  morphPercent: number;
  manualControlAvailable: boolean;
}
```

### Phase C — Extend L4 harmony state

Add L4 harmony fields:

```ts
interface L4HarmonyStateExtension {
  manualControl: ManualHarmonyControlState;
  chordSlots: HarmonyChordSlot[];       // length 8
  chordSequence: HarmonySequenceStep[]; // length 8
  chordSequenceEnabled: boolean;
  chordSequenceStepIndex: number;
  resolvedHarmonyFrame: ResolvedHarmonyFrame;
}
```

Implementation notes:

```text
Use actual local L4 harmony state shape/path.
Do not create duplicate state if a product-core preset/state module already exists.
Provide safe defaults for all fields.
No old preset migration required.
```

### Phase D — Product-core resolver

Add resolver functions in product-core harmony code.

Required resolver pipeline:

```ts
resolvePresetMorphContext(...)
buildBaselineHarmonyIntent(...)
resolveSequenceIntent(...)
resolveSlotTriggerIntent(...)
resolveManualControlIntent(...)
chooseActiveHarmonyIntent(...)
resolveHarmonyIntentToNotePool(...)
resolveNextHarmonyFrame(...)
```

Required behavior:

```text
1. Baseline remains current tension-driven generator.
2. Manual control is ignored/disabled when morphPercent is 1-99.
3. Slot trigger is ignored/disabled when morphPercent is 1-99.
4. Capture is disabled when morphPercent is 1-99.
5. Audition never mutates resolvedHarmonyFrame.
6. Sequence uses 8 steps.
7. Generated slot/sequence material is deterministic from project seed.
8. quality:auto routes through current tension logic.
9. Current and next note pools are available for UI display and product-core consumers.
```

Priority selection:

```ts
function chooseActiveHarmonyIntent(args: {
  baselineIntent: HarmonyIntent;
  sequenceIntent: HarmonyIntent | null;
  slotTriggerIntent: HarmonyIntent | null;
  manualControlIntent: HarmonyIntent | null;
  morphPercent: number;
}): HarmonyIntent {
  const manualAllowed = args.morphPercent === 0 || args.morphPercent === 100;

  if (manualAllowed && args.manualControlIntent) return args.manualControlIntent;
  if (manualAllowed && args.slotTriggerIntent) return args.slotTriggerIntent;
  if (args.sequenceIntent) return args.sequenceIntent;
  return args.baselineIntent;
}
```

Audition must be resolved separately:

```ts
resolveAuditionPreview(...)
```

It may return a preview note pool for UI display, but must not change product-core active harmony.

### Phase E — Product-core snapshot and event contract

Extend Product Core with CPU-efficient numeric/fixed-size data. Avoid sending nested object graphs at runtime.

Recommended approach:

```text
1. Store rich slot/sequence state in L4 state/preset data.
2. Runtime events use numeric enums and fixed-size arrays.
3. Send diffs only.
4. Do not resend the entire sequence or slot bank on every change.
```

Suggested fixed-size frame fields:

```ts
interface ProductHarmonySnapshotExtension {
  controlMode: number;          // baseline, sequence, manual, slot
  controlStrength: number;      // bias, force

  activeSource: number;
  activeSlotId: number;
  activeStepIndex: number;

  manualControlAvailable: boolean;

  notePoolCount: number;
  notePoolMidi: number[];       // fixed max HARMONY_POOL_MAX_NOTES
  bassMidi: number;

  nextNotePoolCount: number;
  nextNotePoolMidi: number[];   // fixed max HARMONY_POOL_MAX_NOTES
  nextSource: number;
  nextStepIndex: number;
}
```

Suggested event categories:

```text
HarmonyControlSetMode
HarmonyControlSetStrength
HarmonyControlSetManualIntent
HarmonyControlClearManualIntent
HarmonySlotSet
HarmonySlotTrigger
HarmonySlotClear
HarmonySequenceSetStep
HarmonySequenceSetEnabled
HarmonySequenceSetActiveStep
HarmonyGenerateSlots
HarmonyGenerateSequence
HarmonyGenerateBoth
HarmonyRegenerateUnlocked
HarmonyCommitBaselineMap
```

Event efficiency rules:

```text
Editing one slot: send only that slot.
Editing one sequence step: send only that step.
Triggering a slot: send only a slot-trigger event.
Manual voicing changes: send packed intent only when intent changes.
Preset morph slider: send morph context/root/scale/tension changes according to existing product-core morph behavior.
Resolved harmony frame: publish only when current or next pool changes.
```

Fit this into the existing generated schema/event pipeline if Product Core event IDs/param IDs are generated.

### Phase F — Preset morph integration

Implement root/scale morph rules:

```text
Root:
Use current Circle-of-Fifths percentage-based behavior.
Divide shortest musical path evenly across morph percent 0-100.

Scale:
Walk nearest musical path using morph percentage.
If a robust scale-distance graph does not exist, implement a minimal deterministic scale path helper and document it.

Slots/sequence:
Use Preset A slots/sequence below 50%.
Switch to Preset B slots/sequence at or after 50% on the relevant preset phase boundary.

Manual control:
Available only at exactly 0% or 100% morph.
```

### Phase G — Deterministic generators

Implement pure generator helpers:

```ts
generateHarmonySlots(seed, params, existingSlots): HarmonyChordSlot[]
generateHarmonySequence(seed, params, existingSequence, slots): HarmonySequenceStep[]
generateHarmonySlotsAndSequence(seed, params, existingSlots, existingSequence): {
  slots: HarmonyChordSlot[];
  sequence: HarmonySequenceStep[];
}
```

Rules:

```text
Use project seed.
Respect locked slots.
Respect locked sequence steps.
Output symbolic intents by default.
Use quality:auto when appropriate to preserve the tension engine.
Do not generate velocity, delay, strum, repeat, or timing fields.
```

### Phase H — Commit Baseline Map

Implement `Commit Baseline Map` as a harmony-only capture.

Meaning:

```text
Capture the current baseline harmonic map into the 8-step chord sequence.
Each captured step should become a symbolic sequence step where possible.
Use quality:auto when the step should continue following the tension engine.
```

This is not an audio/MIDI capture.

### Phase I — Telemetry/current-next reporting

Expose current and next harmony note pools for the Global snapshot and UI.

Required display data:

```text
active source
current chord label
current note pool
next chord label
next note pool
active sequence step
active slot if any
manual control available/locked
morph percentage/root/scale context
```

### Phase J — Tests and acceptance criteria

Architecture tests:

```text
1. Existing baseline generation works unchanged when sequence/manual/slots are disabled.
2. quality:auto routes through the tension-based baseline chord builder.
3. Manual control works at morph 0% and 100%.
4. Manual control is disabled at morph 1-99%.
5. Slot trigger works at morph 0% and 100%.
6. Slot trigger is disabled at morph 1-99%.
7. Audition never mutates active resolved harmony.
8. Capture is disabled at morph 1-99%.
9. 8 slots are initialized with safe defaults.
10. 8 sequence steps are initialized with safe defaults.
11. Generation uses project seed and is repeatable.
12. Locked slots are not changed by regeneration.
13. Locked sequence steps are not changed by regeneration.
14. Sequence and slot bank switch from Preset A to B after the 50% morph rule at the relevant boundary.
15. Current and next harmony pools are exposed.
16. Product-core events are diffed and do not resend full banks unnecessarily.
```

Performance acceptance:

```text
No per-animation-frame full slot/sequence serialization.
No direct UI-to-audio-engine note triggering.
No large object payloads through real-time event paths.
No unnecessary recomputation of note pools when intent/morph/sequence has not changed.
```

---

## Pause point for implementation

After completing the product-core architecture, resolver, L4 state, product-core events/snapshot, generators, and tests:

```text
STOP.
Do not build the final UI.
Do not create the Manual Voicing popup.
Do not create the Chord Lab popup.
Do not redesign the Harmony Engine panel.
```

Instead, hand off:

```text
1. Type definitions and exported UI contract.
2. Event/state APIs for Manual Voicing.
3. Event/state APIs for Chord Lab.
4. Current/next harmony frame selectors.
5. Keyboard mapping constants.
6. Product-core acceptance test results.
```

The separate UI implementation pass will build the interface using the contract below.

---

# UI contract for separate UI implementation

The UI implementation should not alter the product-core resolver. It should consume and write product-core harmony state/events exposed by the product-core architecture.

## UI surfaces

Use three surfaces:

```text
1. Harmony Engine panel
   Compact final-state display only.

2. Manual Voicing popup
   Collapsible performance/control popup.

3. Chord Lab popup
   Collapsible slot + sequence + generation editor.
```

## Harmony Engine panel

Purpose:

```text
Show what the Harmony Engine is currently resolving.
Do not place the full chord editor here.
```

Recommended structure:

```text
Harmony Engine

Source: Sequence / Baseline / Manual / Slot
Current: Emaj9
Pool: E F# G# B D#
Next: Aadd9
Next Pool: A B C# E G#
Morph: 42% | Root path C → G → D
Manual Control: Available / Locked during morph

[Manual Voicing]
[Chord Lab]
[Generate]
```

Interaction:

```text
Manual Voicing button opens/collapses Manual Voicing popup.
Chord Lab button opens/collapses Chord Lab popup.
Generate button may open Chord Lab directly to generation controls.
```

## Manual Voicing popup

User-facing name:

```text
Manual Voicing
```

Do not use external product names.

Purpose:

```text
Audition, control, and capture symbolic harmony intents.
```

Layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Manual Voicing        [Audition] [Control] [Capture]        │
├──────────────────────────────┬──────────────────────────────┤
│ Notes / Roots                │ Modifiers                    │
│                              │                              │
│ [C] [C#] [D] [D#] [E] [F]    │ Type                         │
│ [F#] [G] [G#] [A] [A#] [B]   │ [Dim] [Min] [Maj] [Sus]      │
│                              │                              │
│ Keyboard                     │ Extensions                   │
│ A W S E D F T G Y H U J      │ [6] [m7] [M7] [9]            │
│                              │                              │
│ Slots                        │ Control                      │
│ [1] [2] [3] [4]              │ [Bias] [Force]               │
│ [5] [6] [7] [8]              │                              │
│                              │ Octave                       │
│                              │ [. down] [/ up]              │
└──────────────────────────────┴──────────────────────────────┘
```

### Manual Voicing modes

Audition:

```text
Preview selected chord/note pool.
Does not mutate active product-core harmony.
Can show preview label/pool.
```

Control:

```text
Controls live harmony note pool.
Available only when morph percent is exactly 0 or 100.
Disabled and visibly locked from 1-99% morph.
```

Capture:

```text
Saves current symbolic intent to a selected slot or sequence step.
Available only when morph percent is exactly 0 or 100.
Disabled from 1-99% morph.
```

### Keyboard mappings

Notes / roots:

```text
A W S E D F T G Y H U J
= C C# D D# E F F# G G# A A# B
```

Chord types:

```text
I O P [
= Dim Min Maj Sus
```

Extensions:

```text
K L ; '
= 6 m7 M7 9
```

Octave:

```text
. /
= octave down / octave up
```

Slot trigger mode:

```text
Z X C V B N M ,
= slots 1-8
```

Keyboard capture should be active only when Manual Voicing is focused or explicitly armed.

### Manual Voicing visual states

Required visible states:

```text
Audition only — engine unchanged.
Live control active.
Capture target selected.
Manual control locked during morph.
Slot trigger mode active.
Bias or Force selected.
```

## Chord Lab popup

Purpose:

```text
Manage 8 chord slots, 8 sequence steps, deterministic generation, and baseline map commit.
```

Recommended structure:

```text
Chord Lab

Slots
[1 Imaj9] [2 IVadd9] [3 V7sus] [4 vi7]
[5 ii9]  [6 bVII]   [7 V]     [8 empty]

Sequence
S1 Auto I        quality:auto
S2 Slot Copy 2   IVadd9
S3 Auto V        quality:auto
S4 Intent vi     min7
S5 ...
S6 ...
S7 ...
S8 ...

Actions
[Generate Slots]
[Generate Sequence]
[Generate Both]
[Regenerate Unlocked]
[Commit Baseline Map]
```

### Slot interactions

```text
Click slot in Audition mode: preview only.
Click/hold slot in Control mode: live harmony control when morph is 0 or 100.
Click slot in Capture mode: save current symbolic intent to that slot.
Drag/copy slot to sequence step: default is Slot Copy.
Optional menu action: Follow Slot.
Lock/unlock slot.
Rename slot.
Clear slot.
```

### Sequence interactions

Step modes:

```text
Auto
Intent
Slot Copy
Slot Follow
```

Step card should show:

```text
step index
mode
chord label
source slot if any
lock state
enabled state
probability if included
```

Step inspector MVP fields:

```text
Enabled
Locked
Mode
Degree / Root
Quality
Extensions
Bias / Force
Inversion
Spread
Bass mode
Probability
```

Do not include in MVP:

```text
Velocity
Gate
Delay
Strum
Repeat
Per-voice timing
MIDI channel
```

### Generation actions

Generate Slots:

```text
Fills unlocked slots with deterministic symbolic intents.
```

Generate Sequence:

```text
Fills unlocked sequence steps with deterministic symbolic steps.
```

Generate Both:

```text
Generates slots and sequence together.
```

Regenerate Unlocked:

```text
Regenerates only unlocked slots/steps.
```

Commit Baseline Map:

```text
Maps current baseline harmony behavior into the 8-step sequence.
Prefer symbolic steps and quality:auto where appropriate.
```

## Global page snapshot

Preset morph already lives on the Global page and should stay there.

The UI should show harmony effects of morphing in the Global snapshot:

```text
Current harmony source
Current chord / pool
Next chord / pool
Morph percentage
Root path
Scale path/status
Manual control available/locked
Pending slot/sequence bank after 50% rule
```

Do not move preset morph controls into Chord Lab.

---

## Final implementation warnings

1. Do not reference external product names in code, UI, comments, docs, tests, or filenames.
2. Do not build UI before the product-core architecture is complete.
3. Do not make the chord system trigger audio notes directly.
4. Do not implement velocity/delay/strum/repeat in this harmony delivery.
5. Do not use number keys 1-5 for slot triggers; they are reserved for page changes.
6. Do not allow live manual control or capture while preset morph is between 1% and 99%.
7. Do not send full slot banks or full sequences through runtime events on every UI change.
8. Do not break the existing tension-based generative baseline.
