# Kessho Harmony UI Redesign Spec

## Goal

Replace the current dense Harmony dashboard with a clean, modern VST-style workflow that surfaces the simplest information first and hides advanced editing behind focused popups.

The Harmony feature is not a note-performance sequencer. It is a harmony-note-pool controller for Product Core. The UI should make that clear: users are shaping the current and next harmonic context that other Kessho sources follow.

## Current UI Problems

1. **Too much is visible at once.** Manual Voicing, slots, sequence, generation, probability, status, and endpoint state are all competing on the same canvas.
2. **Everything has similar visual weight.** The current chord, next chord, keyboard, slots, and step controls all feel equally important.
3. **The keyboard does not read as an instrument.** The current one-octave keyboard is a row of buttons, not a piano-like input surface.
4. **Notes, degrees, slots, and sequence editing are visually mixed.** These are different mental models and should not all be active at once.
5. **Sequence cards are too control-heavy.** Every step exposes dropdowns and probability controls at once, making the sequence feel like a settings table.
6. **Slots expose too many actions all the time.** `Open`, `Audition`, and `Reset` buttons repeated eight times make the bank feel noisy.
7. **Manual Voicing and Chord Lab are stacked vertically.** They should be separate focused workflows, not sections of a dashboard.

## UX Principle

Use progressive disclosure:

```text
Simple status first
→ focused performance popup
→ focused chord-memory/sequence popup
→ selected-item inspector
→ advanced controls only when opened
```

The user should be able to understand the Harmony Engine in three seconds:

```text
What key am I in?
What chord/pool is active?
What is controlling it?
What happens next?
```

Everything else should require intentional engagement.

---

# Top-Level Harmony Engine Card

## Purpose

The Harmony Engine panel should be a compact status card, not an editor.

## Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ HARMONY ENGINE                                 [Voicing] [Lab] │
│ E Mixolydian · Bank A · Morph 0% · Manual available           │
├──────────────────────┬──────────────────────┬────────────────┤
│ NOW                  │ NEXT                 │ CONTROL        │
│ I Auto               │ IV add9              │ Sequence       │
│ E G# B E             │ A C# E B             │ Step 2 / 8     │
└──────────────────────┴──────────────────────┴────────────────┘
```

## Rules

- Show only resolved state and launch buttons.
- Do not show the Manual Voicing keyboard inline.
- Do not show the full chord slot bank inline.
- Do not show all sequence step controls inline.
- Show manual-control lock state when morph is between endpoints.

## Fields

Use Product Core data:

```ts
resolvedHarmonyFrame.activeSource
resolvedHarmonyFrame.activeStepIndex
resolvedHarmonyFrame.activeSlotId
resolvedHarmonyFrame.currentNotePool
resolvedHarmonyFrame.nextNotePool
resolvedHarmonyFrame.nextSource
resolvedHarmonyFrame.nextStepIndex
resolvedHarmonyFrame.manualControlAvailable
resolvedHarmonyFrame.morphPercent
```

## Interaction

- `Voicing` opens Manual Voicing popup.
- `Lab` opens Chord Lab popup.
- Clicking `NOW` can open a lightweight note-pool detail tooltip.
- Clicking `NEXT` can open the sequence focused on the next step.

---

# Manual Voicing Popup

## Purpose

A playable harmony-control surface for auditioning, live control, and capture.

This should feel like an instrument, not a form.

## Layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ MANUAL VOICING                                   E Mixolydian       │
│ [Audition] [Control] [Capture]       Strength: [Bias] [Force]      │
│ Preview: I Auto · E G# B E                     [Clear]             │
├────────────────────────────────────┬───────────────────────────────┤
│ ROOT / DEGREE                      │ CHORD MODIFIERS              │
│                                    │                               │
│        black keys: W E   T Y U     │ Type                          │
│      ┌──┐┌──┐    ┌──┐┌──┐┌──┐      │ [Dim] [Min] [Maj] [Sus]       │
│      │C#││D#│    │F#││G#││A#│      │                               │
│ ┌──┐ └┬─┘└┬─┘ ┌──┐└┬─┘└┬─┘└┬─┘ ┌──┐│ Extensions                   │
│ │C │  │D │  │E │F │  │G │  │A │  │B ││ [6] [m7] [M7] [9]           │
│ │A │  │S │  │D │F │  │G │  │H │  │J ││                               │
│ └──┘  └──┘  └──┘└──┘  └──┘  └──┘  └──┘│ Voicing                       │
│                                    │ [Oct -] [Oct +]  Inv 0        │
│ Mode: [Root] [Degree]             │ Spread 50                     │
│                                    │                               │
│ Slots: [S1] [S2] [S3] [S4]        │ Bass: [Off] [Root] [Fifth]    │
│        [S5] [S6] [S7] [S8]        │                               │
└────────────────────────────────────┴───────────────────────────────┘
```

## Important Visual Changes

### Make the keyboard look like a keyboard

- White keys are tall rectangular keys.
- Black keys sit above and between white keys.
- Computer-key labels are secondary text at the bottom of each key.
- Active note keys should light up.
- Chord notes should receive a softer highlight.

### Do not show chromatic notes and roman degrees as two competing keyboards

Use a mode toggle:

```text
[Root] [Degree]
```

In Root mode, the left input is a piano keyboard.
In Degree mode, the left input becomes seven large degree pads.

### Keep the right-hand modifiers stable

Chord type and extension controls should always stay on the right. They are the harmonic modifiers.

## Keyboard Shortcuts

```text
Notes:
A W S E D F T G Y H U J = C C# D D# E F F# G G# A A# B

Chord Type:
I O P [ = Dim Min Maj Sus

Extensions:
K L ; ' = 6 m7 M7 9

Octave:
. / = octave down / octave up

Slots when slot-trigger mode is active:
Z X C V B N M , = S1-S8
```

## Modes

### Audition

- Updates preview only.
- Does not change Product Core live harmony.
- Safe during playback.
- Safe during morph.

### Control

- Sends live manual harmony control to Product Core.
- Disabled when morph is between 1% and 99%.
- If disabled, show a clear lock message:

```text
Manual control is locked during preset morph. Move morph to A or B endpoint.
```

### Capture

- Saves the current symbolic chord to a slot or selected sequence step.
- Disabled during morph range 1%-99%.
- Default capture is symbolic, not exact MIDI notes.
- Exact captured voicing should be behind an advanced toggle.

## Advanced Controls

Hide these behind a compact `Voicing` disclosure:

```text
Inversion
Spread
Octave
Bass mode
Preserve exact voicing
```

Do not put deep per-voice, delay, velocity, repeat, strum, or MIDI-output controls in this popup. This feature is a harmony-pool controller.

---

# Chord Lab Popup

## Purpose

Chord memory, generation, and sequence editing.

This should not be visible together with Manual Voicing by default.

## Top Structure

Use tabs:

```text
[Slots] [Sequence] [Generate]
```

Do not show all three workflows fully expanded at once.

---

## Chord Lab: Slots Tab

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ CHORD LAB · Bank A                           [Slots][Sequence][Generate] │
├──────────────────────────────────────────────────────────────┤
│ SLOT BANK                                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ S1       │ │ S2       │ │ S3       │ │ S4       │          │
│ │ I Auto   │ │ IV add9  │ │ V7sus   │ │ vi min7  │          │
│ │ unlocked │ │ locked   │ │         │ │          │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ S5       │ │ S6       │ │ S7       │ │ S8       │          │
│ │ ii min   │ │ bVII     │ │ V Auto   │ │ empty    │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├──────────────────────────────────────────────────────────────┤
│ Selected Slot Inspector                                      │
│ Name · Degree · Quality · Extensions · Strength · Lock        │
└──────────────────────────────────────────────────────────────┘
```

### Slot Card Rules

Each slot card should show only:

- Slot number
- Chord label
- Degree/root
- Lock state
- Small status color

Do not permanently show repeated buttons like `Open`, `Audition`, and `Reset` on every card.

### Slot Interactions

- Click: select slot and audition it if audition is enabled.
- Double click: trigger/control if in slot-trigger mode and manual control is available.
- Right click / overflow button: Rename, Lock, Clear, Copy, Place in Sequence.
- Drag slot to sequence: place copy by default.
- Modifier-drag or menu action: follow slot.

---

## Chord Lab: Sequence Tab

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ CHORD LAB · Sequence ON                      [Slots][Sequence][Generate] │
├──────────────────────────────────────────────────────────────┤
│ 8-STEP HARMONY SEQUENCE                                      │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│ │ 1   │ │ 2   │ │ 3   │ │ 4   │ │ 5   │ │ 6   │ │ 7   │ │ 8   │ │
│ │ I   │ │ IV  │ │ S3  │ │ vi  │ │ ii  │ │ V   │ │ VII │ │ S8  │ │
│ │Auto │ │Auto │ │Copy │ │Maj  │ │Maj  │ │Maj  │ │Maj  │ │Copy │ │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │
├──────────────────────────────────────────────────────────────┤
│ Selected Step Inspector                                      │
│ Mode: Auto / Intent / Slot Copy / Slot Follow                │
│ Degree · Quality · Slot · Probability · Lock                 │
└──────────────────────────────────────────────────────────────┘
```

### Step Card Rules

A sequence card should not be a mini form. It should be a musical object.

Show:

- Step number
- Chord label
- Source badge: Auto / Slot / Intent
- Lock status
- Probability as tiny indicator, not a full slider unless selected

All editing goes into the selected-step inspector.

### Selected Step Inspector

Fields:

```text
Enabled
Locked
Mode: Auto / Intent / Slot Copy / Slot Follow
Degree / Root
Quality
Extensions
Strength: Bias / Force
Slot selector, if slot mode
Probability
```

No velocity, gate, delay, strum, repeat, or per-voice timing controls.

---

## Chord Lab: Generate Tab

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ CHORD LAB · Generate                         [Slots][Sequence][Generate] │
├──────────────────────────────────────────────────────────────┤
│ Target                                                       │
│ [Slots] [Sequence] [Both]                                    │
│                                                              │
│ Style                                                        │
│ [Baseline Map] [Ambient] [Functional] [Modal] [Dark] [Bright]│
│                                                              │
│ Complexity                                                   │
│ Auto ←──────────→ Extended                                   │
│                                                              │
│ Motion                                                       │
│ Stable ←────────→ Active                                     │
│                                                              │
│ [Respect Locks] [Generate] [Regenerate Unlocked]             │
└──────────────────────────────────────────────────────────────┘
```

### Generation Rules

- Generate into slots and/or sequence.
- Generated material becomes editable symbolic HarmonyIntent data.
- Respect locks.
- Use project seed.
- Default to stable playback; no hidden retrigger mutation during playback.

---

# Component Structure for UI Implementation

```text
HarmonySummaryCard
  HarmonyStatusTile
  HarmonyNotePoolPills
  HarmonySourceBadge
  HarmonyActionButtons

ManualVoicingPopup
  ManualVoicingHeader
  ManualVoicingModeSwitch
  VoicingPianoKeyboard
  DegreePadRow
  ChordModifierPanel
  VoicingAdvancedDisclosure
  SlotTriggerStrip
  ManualVoicingPreview

ChordLabPopup
  ChordLabHeader
  ChordLabTabs
  ChordSlotBank
  ChordSlotInspector
  ChordSequenceStrip
  ChordStepInspector
  ChordGeneratePanel
```

---

# Product-Core Data Contract

The UI should read from and write to the Product Core harmony-control state, not directly trigger individual audio sources.

Use these conceptual fields:

```ts
manualControl
chordSlots
chordSequence
chordSequenceEnabled
chordSequenceStepIndex
resolvedHarmonyFrame
```

The most important display source is:

```ts
resolvedHarmonyFrame
```

The top-level Harmony UI should display final resolved results, not raw configuration sprawl.

---

# Visual Design Direction

## Visual hierarchy

Use three visual levels:

1. **Primary**: current chord, active source, playable keyboard.
2. **Secondary**: next chord, slot bank, selected step.
3. **Tertiary**: probability, lock, strength, root mode, advanced voicing.

## Spacing

- More empty space.
- Fewer borders.
- Bigger musical objects.
- Less repeated text.
- One selected inspector instead of many repeated controls.

## Color

- Use color for state, not decoration.
- Blue/cyan: audition/preview.
- Warm/red: live control.
- Green: capture/save/generate.
- Muted grey: disabled/locked during morph.
- One accent at a time.

## Typography

- Chord name should be large and readable.
- Technical labels should be small and muted.
- Avoid all-caps for every label; reserve all-caps for section headers only.

---

# Acceptance Criteria

1. The default Harmony Engine card fits above the fold and does not look like a control dashboard.
2. Manual Voicing is opened intentionally and feels like a playable instrument.
3. The left-hand keyboard visually reads as a one-octave piano.
4. Chord type and extension controls are clearly separated from note/root input.
5. Chord Lab uses tabs; slots, sequence, and generation are not all fully expanded at once.
6. Sequence cards are musical objects, not mini forms.
7. A selected slot or step opens an inspector for editing.
8. Manual control is visibly locked during morph values 1%-99%.
9. Slots use z/x/c/v/b/n/m/, keyboard mapping only in slot-trigger mode.
10. No UI element directly triggers pad, lead, piano, or drum notes; it only edits or controls Product Core harmony state.
