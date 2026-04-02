# Granular Architecture Plan

> Working implementation guide for evolving the current granular engine toward
> two target sonic behaviors:
> 1. Microcosm-style lush ambient processing
> 2. ZOIA Loop Forest-style multi-looper ambient drift
>
> This document is written as guidance for an AI coder. It assumes the current
> implementation in:
> - `src/audio/engine.ts`
> - `wasm/granular-fx/kessho_granular.cpp`
> - `public/worklets/granular-fx-wasm.worklet.js`
> - `src/ui/granular/GranularPage.tsx`
> - `src/ui/granular/granularPresets.ts`
> - `src/ui/state.ts`

## Intent

Do not replace the granular engine with a second parallel engine.

Keep the existing core:
- one shared circular record buffer
- four independent voices
- per-voice playback mode: `clean`, `granular`, `legacy`

Refine the architecture so that:
- `clean` voices can behave like stable loop readers
- `granular` voices can behave like lush ambient processors
- rhythmic sequencing becomes optional, not assumed
- the space processor can be either diffuse/ambient or clocked/rhythmic
- presets are heard more faithfully instead of being heavily rewritten after load

## Prototype Decision: Delay Staging

For the prototype phase of this granular redesign:
- keep the current granular-engine-local 8-tap multitap delay in place
- use that existing delay path as the temporary implementation surface for
  `clocked` space behavior
- test whether the sonic direction is actually correct before promoting it to a
  shared delay system

Later, if the results are successful:
- migrate the proven 8-tap clocked behavior to shared `Delay Bus B` as described
  in `ENHANCEMENTS_2.md`
- optionally map the eventual diffuse/tape behavior to `Delay Bus A` or a
  shared ambient-space variant

This means:
- this document describes the **granular prototype architecture first**
- `ENHANCEMENTS_2.md` remains the intended **long-term bus extraction plan**
- no immediate delay-bus migration is required to validate the granular redesign

## Non-Goals

- Do not add a second buffer.
- Do not create a second standalone granular engine.
- Do not make the sequencer mandatory for the core ambient sound.
- Do not let hidden macro inflation silently override reference presets.

## Current Architecture Summary

The current engine already has:
- shared record buffer in WASM
- four voices reading from that buffer
- three voice modes:
  - `clean`
  - `granular`
  - `legacy`
- a Web Audio post-space section:
  - direct path
  - reverb send path
  - 8-tap multitap delay
- an optional Euclidean sequencer

However, all three voice modes currently live inside one global behavior system.
That system applies:
- macro inflation
- tension remapping
- shared delay assumptions
- shared saturation/filter philosophy
- optional sequencer logic that can still shape the sound path strongly

This makes the engine flexible, but it also makes reference presets difficult to
trust, especially for:
- Loop Forest-style looper scenes
- Microcosm-style ambient scenes

## Main Problems in the Current Architecture

### 1. Voice mode and scene behavior are mixed together

The current three modes (`clean`, `granular`, `legacy`) only describe how a
voice reads the buffer.

They do not describe how the whole scene should behave musically.

As a result:
- `clean` voices still inherit granular-oriented macro behavior
- looper-style presets still inherit the same global delay and transform logic
- ambient presets can become overly rhythmic, dense, or chaotic

### 2. Presets are not "pure"

The engine mutates many preset values after load by applying:
- texture
- complexity
- darkness
- chaos
- tension

This is useful for expressive control, but it is too aggressive for reference
presets that are trying to emulate known hardware/patch behavior.

### 3. Clean scan mode is not close enough to a true looper-reader model

Current clean scan behavior still has mismatches:
- `pitch` affects scan transport when `speed = 0`
- `record_lfo` continuously modulates write-follow instead of acting more like a
  gate/latch behavior

These are major reasons that the current clean looper sounds "wobbly" compared
to ZOIA Loop Forest.

### 4. The current delay is too grid-shaped to cover all use cases

The current multitap delay is explicitly clocked and subdivision-driven.

That is good for:
- BPM-linked rhythmic scenes
- Nightsky-like pulsing

But it is not ideal for:
- diffuse ambient space
- tape-like drift
- Loop Forest-like old-tape atmosphere
- smeared Microcosm-style lushness

### 5. Sequencer intent is too central

The sequencer was originally intended for:
- Nightsky-like rhythmic sequencing
- BPM-related predictability when desired

That is valid.

But the main goal of the engine is broader:
- ambient granular textures
- experimental looping
- lush pads and evolving washes

Therefore the sequencer should be treated as optional overlay behavior, not a
default defining feature of the whole engine.

## Target Architecture

The target architecture should be organized into four clear layers.

### Layer 1: Buffer Layer

Responsibility:
- record and maintain one shared circular audio buffer
- expose write head position
- provide consistent read access for all voices

Rules:
- keep the existing shared-buffer design
- do not duplicate the buffer per mode
- all voices read from the same recorded material

### Layer 2: Voice Layer

Responsibility:
- define how each voice reads from the shared buffer

Per-voice mode remains:
- `clean`
- `granular`
- `legacy`

Meaning:
- `clean`: looper-style read head / scan reader
- `granular`: grain-based cloud reader
- `legacy`: old behavior preserved for backward flavor

Each voice remains an independent reader with:
- enabled
- mode
- slice or base position
- speed
- pitch
- reverse
- attack
- decay
- blur
- spray
- density
- grainSize
- pan
- gain
- position LFO
- reverse LFO
- write-follow
- record-follow modulation

The four voices are kept.

Do not reduce to two voices globally. Instead, let presets decide how busy the
four voices are.

Recommended default role model:
- Voice 1: anchor/body
- Voice 2: companion/body
- Voice 3: texture/reverse/offset
- Voice 4: air/shimmer/light motion

### Layer 3: Space Layer

Responsibility:
- process the summed voice output after the voices have read from the buffer

For the prototype phase, this space layer stays inside the current granular
post-FX path in `src/audio/engine.ts`.

For the later architecture, this layer is a candidate for migration into the
shared delay-bus system defined in `ENHANCEMENTS_2.md`.

Add explicit space modes:
- `diffuse`
- `clocked`

Meaning:
- `diffuse`
  - ambient tape-like space
  - wandering or softly decorrelated taps
  - less note-grid identity
  - slower modulation
  - more suitable for lush pads, Microcosm-style wash, Loop Forest-like drift
- `clocked`
  - BPM-aware multitap space
  - explicit subdivisions
  - more rhythmic predictability
  - suitable for Nightsky-style pulsing and rhythmic granular scenes

This layer should live primarily in `src/audio/engine.ts`, not in the granular
WASM itself.

Important prototype note:
- `clocked` should initially use the existing granular 8-tap delay
- `diffuse` can initially be implemented as a second behavior of the current
  granular-local post-space section
- only after sonic validation should these behaviors be extracted into shared
  delay buses

### Layer 4: Sequencer Layer

Responsibility:
- optionally gate, retrigger, or modulate the voice layer in rhythmic ways

Rules:
- sequencer is optional
- sequencer is off by default for ambient and looper presets
- sequencer is only enabled when a preset explicitly wants rhythmic behavior

The sequencer should not define the identity of the engine.
It should define the identity of specific presets.

## Clear Difference From Existing Architecture

Current architecture:
- three voice modes
- one global behavior philosophy
- one dominant delay philosophy
- macros/tension reshape nearly everything
- sequencer often feels architecturally central

Target architecture:
- still three voice modes
- explicit separation between voice playback and scene/space behavior
- explicit space mode selection
- optional sequencer
- reference presets can bypass or tightly limit macro inflation

Prototype architecture:
- still uses the current granular-local post-space section
- keeps the existing 8-tap multitap inside granular for testing
- adds clearer behavioral separation before any delay-bus extraction

Important clarification:
This plan does not replace the current `clean / granular / legacy` modes.
It builds a cleaner system around them.

## Architectural Logic for the Main Target Sounds

### A. Loop Forest

Target identity:
- four loop readers
- shared recorded material
- slow scan movement
- reverse/gate behavior
- panning
- old-tape or diffuse delay
- hall-like ambience

Recommended architecture:
- all or most voices in `clean`
- space mode = `diffuse`
- sequencer off

What must change from the current system:
- clean scan must behave more like stable loop readers
- pitch must not drive transport in scan mode
- reverse/record motion must be more gate-like, less constant wobble
- delay must be less clock-grid-centric
- macro inflation must be minimal or bypassed

### B. Microcosm Ambient

Target identity:
- layered buffer readers
- lush, musical, harmonically stable processing
- strong contribution from multitap-style space
- not necessarily rhythmic by default

Recommended architecture:
- mix of `clean` and `granular` voices
- space mode = `diffuse` by default
- sequencer off by default

Optional preset variants:
- `Microcosm Ambient`
- `Microcosm Pulse`

Meaning:
- `Microcosm Ambient`: diffuse space, no Euclidean gating
- `Microcosm Pulse`: clocked space, sequencer on, rhythmic/predictable

### C. Rhythmic Granular / Nightsky-style

Target identity:
- pulse
- retrigger
- grid-aware motion
- predictable BPM-linked behavior

Recommended architecture:
- any voice-mode mix
- space mode = `clocked`
- sequencer on

This is important, but it should not be the baseline identity of the engine.

## Specific Logic Changes Required

### 1. Add explicit space mode state

Add a new top-level granular state field:

```ts
type GranularSpaceMode = 'diffuse' | 'clocked'
```

Suggested key:
- `granularSpaceMode`

Logic:
- `diffuse` uses ambient/tape-style post-space behavior
- `clocked` uses the existing BPM-linked multitap behavior

Prototype interpretation:
- this state initially selects between two behaviors inside the current
  granular-local delay/post-space path
- it does **not** require immediate shared-bus extraction

Long-term interpretation:
- once `ENHANCEMENTS_2.md` is implemented, this state can map to send/link
  behavior for shared Delay A / Delay B instead of private granular-local delay

### 2. Make sequencer explicitly optional

Do not remove the sequencer.

Instead:
- keep the existing Euclidean lane system
- gate its scheduling and UI by explicit enable state
- make ambient and looper presets load with sequencer disabled

Logic change from current behavior:
- sequencer should not be assumed to be part of the reference sound
- preset families should opt in

### 3. Add preset-pure behavior guardrails

Reference-style presets should not be heavily rewritten by macros.

Introduce a preset/engine policy concept such as:
- `granularPresetBehavior = 'pure' | 'expressive'`

Or equivalent internal logic, without necessarily exposing the label to users.

Rules:
- `pure`
  - strongly attenuated macro inflation
  - minimal tension remapping
  - preserve programmed values closely
- `expressive`
  - allow current macro/tension widening behavior

Prototype guidance:
- do not disable the macro sliders in `pure`
- instead attenuate them substantially so the UI remains live but the preset
  identity survives
- recommended initial scaling target:
  - `pure`: roughly `0.15x-0.30x` of current macro influence
  - `expressive`: current behavior or a lightly softened version

This is critical for:
- Loop Forest
- Clean looper scenes
- Microcosm-style reference presets

### 4. Fix clean voice scan logic

In `wasm/granular-fx/kessho_granular.cpp`, adjust clean scan mode so it behaves
like a stable loop reader rather than a disguised pitch-driven playback engine.

Required changes:
- when `speed == 0`, decouple pitch from scan head transport
- keep pitch as tonal transposition, not positional drift
- rework `record_lfo` so it behaves more like gated/latching capture behavior,
  especially for looper scenes
- keep reverse modulation square/latch-like when a preset wants looper behavior

Optional refinement:
- only revisit the current scan LFO curve if listening tests still show an
  audible motion issue after fixing pitch/transport coupling and record-LFO
  wobble

This is the most important DSP correction for Loop Forest and Clean Looper.

### 5. Split delay behavior by space mode

The current 8-tap delay should become the `clocked` space mode.

Add a `diffuse` mode with logic such as:
- fewer taps or decorrelated wandering taps
- no obvious rhythmic subdivision identity
- slower modulation
- softer filtering
- tape-like drift

Architecture rule:
- keep post-space in Web Audio in `src/audio/engine.ts`
- do not move general delay architecture into the granular WASM

Prototype rule:
- keep both `clocked` and `diffuse` inside the current granular-local delay /
  post-space section for now
- do not block granular sound-design progress on delay-bus extraction

Long-term rule:
- once the prototype proves out, migrate:
  - proven clocked multitap behavior -> shared `Delay Bus B`
  - proven diffuse/tape behavior -> shared `Delay Bus A` or another shared
    ambient-space bus design

Preset migration note:
- while the delay remains local to granular, existing `granularDelay*` preset
  fields remain the active prototype storage surface
- once the shared delay buses are introduced, migrate those fields according to
  the rules in `ENHANCEMENTS_2.md`

### 6. Refactor macro logic into explicit derivation functions

Current macro logic should be rewritten as named pure functions.

Example structure:

```ts
deriveGranularVoiceParams(state, voiceIndex, profile)
deriveGranularSpaceParams(state, profile)
shouldEnableGranularSequencer(state, presetProfile)
```

Profile examples:
- `ambient`
- `looper`
- `rhythm`

Important note:
These profiles do not replace voice mode or space mode.
They are implementation profiles that describe how strongly transforms are
allowed to act.

### 7. Reduce source harshness before reverb tuning

Before doing major reverb redesign:
- reduce preset inflation
- reduce unnecessary density inflation
- reduce octave randomness for ambient/looper profiles
- consider lowering direct output boost
- consider reducing or softening final saturation for ambient/clean behavior

Reason:
If the source is still too harsh, reverb changes only hide the problem.

### 8. Rebalance reverb feed by profile

Once source behavior is improved:
- ambient/looper profiles can feed a more open reverb path
- rhythmic profiles can keep tighter control if needed

Likely changes:
- ambient/looper:
  - higher reverb LPF ceiling
  - less compressor pressure before reverb
  - more bloom
- rhythm:
  - tighter, more controlled send is acceptable

## UI Implementation Guide

This section describes exactly how to build the redesigned Granular page so that
it matches the existing Kessho UI component system. All new controls must use
the same components, layout classes, state binding patterns, and dual-slider
infrastructure already in place.

### Component Reference (existing, reuse as-is)

| Component | File | Purpose |
|-----------|------|---------|
| `DualSlider` | `src/ui/DualSlider.tsx` | 3-mode slider: `single`, `walk`, `sampleHold` |
| `CollapsiblePanel` | `src/ui/CollapsiblePanel.tsx` | Click-to-expand section with chevron |
| `Slider` (wrapper) | `src/App.tsx` | Detects dual-mode props and delegates to `DualSlider` |
| `Select` | `src/App.tsx` | Styled dropdown for enum params |
| `DragNumber` | `src/ui/drums/DragNumber.tsx` | Drag-based number input (sequencer) |
| `PresetDropdown` | `src/presets/PresetDropdown.tsx` | Preset selector with save/export |

Do not create new slider or toggle components. Use the existing ones.

### State Binding Pattern (existing, follow exactly)

Every slider on the page must follow this pattern:

```tsx
<Slider
  label="Feedback"
  value={state.granularFeedback}
  paramKey="granularFeedback"
  unit="%"
  onChange={onParamChange}
  {...sliderProps('granularFeedback')}
/>
```

The `sliderProps(paramKey)` call returns `mode`, `dualRange`, `walkPosition`,
`isFlashing`, `onCycleMode`, and `onDualRangeChange` for that parameter.

Every new parameter must also have:
- a key in `SliderState` (`src/ui/state.ts`)
- a quantization entry in `QUANTIZATION` (`src/ui/state.ts`)
- a `ParamRegistry` entry with level and scope (`src/presets/ParamRegistry.ts`)

### Dual Slider / Random Walk / Sample & Hold Rules

All sliders support mode cycling via double-click (desktop) or 400ms long-press
(mobile):

```
single → walk → sampleHold → single
```

Mode behavior:
- **single**: standard range input with fill gradient
- **walk**: Brownian motion between a user-draggable min/max range — walks
  continuously. Speed controlled by global `randomWalkSpeed`. Color: `#a5c4d4`
- **sampleHold**: samples a random value within min/max range on each trigger
  event. Color: `#D4A520`. Shows flash animation on trigger (50ms expand,
  180ms collapse)

When entering walk or sampleHold mode for the first time, a default 20% range
around the current value is created:

```ts
const rangeSize = (info.max - info.min) * 0.2;
const min = Math.max(info.min, currentVal - rangeSize / 2);
const max = Math.min(info.max, currentVal + rangeSize / 2);
```

Dual-slider state (ranges and modes) is saved and restored with presets via
`savedPreset.dualRanges` and `savedPreset.sliderModes`.

Which parameters should default to which mode is a preset decision, not an
architecture decision. By default all parameters start in `single` mode.

### Layout Classes (existing CSS)

The granular page uses these grid classes defined in `granular.css`:

| Class | Layout |
|-------|--------|
| `.granular-grid-2` | 2-column flex row, gap 8px |
| `.granular-grid-3` | 3-column flex row, gap 8px |
| `.granular-grid-4` | 4-column flex row, gap 8px |

Mobile breakpoint (`< 900px`): `.granular-grid-4` collapses to 2-column,
`.granular-grid-3` stays 3-column.

Collapsible sections use these existing CSS patterns:

```css
.granular-root .section-header       /* clickable row with chevron */
.granular-root .section-header.collapsed
.granular-root .section-body
.granular-root .section-body.collapsed  /* display: none */
```

### Two-Panel Page Layout (preserve existing)

```
┌─────────────────────────────────────────────────────┐
│  Left Panel (flex: 0 0 460px)  │  Right Panel (flex: 1)  │
│  Sound controls                │  Sequencer              │
└─────────────────────────────────────────────────────┘
```

Mobile: stacks vertically. Right panel moves below left panel.

### Left Panel — Section Order (top to bottom)

#### Section 1: Global Controls Bar

Unchanged from current implementation:

```
┌──────────────────────────────────────────────┐
│  ⊞ Granular     [Enable] [Freeze]   Preset ▼ │
└──────────────────────────────────────────────┘
```

- Title: `⊞ Granular`
- `[Enable]`: toggle button, turns entire engine on/off
- `[Freeze]`: toggle button, freezes buffer (prevents write)
- `Preset ▼`: `<PresetDropdown level="engine" scope="granular" />`

#### Section 2: Global Sliders Row

Current: 7 sliders in a flex row.

New: add Space Mode selector and Behavior indicator. Keep existing sliders.

```
┌──────────────────────────────────────────────────────────┐
│  Space: [Diffuse ▼]    Behavior: [pure ▼]               │
├──────────────────────────────────────────────────────────┤
│  Level   Feedback   FB LPF   Rev Send   Out LPF   ...  │
└──────────────────────────────────────────────────────────┘
```

**Space Mode**: `<Select>` dropdown

```tsx
<Select
  label="Space"
  value={state.granularSpaceMode}
  options={[
    { value: 'diffuse', label: 'Diffuse' },
    { value: 'clocked', label: 'Clocked' },
  ]}
  onChange={(v) => onParamChange('granularSpaceMode', v)}
/>
```

State key: `granularSpaceMode: 'diffuse' | 'clocked'`

**Behavior**: `<Select>` dropdown

```tsx
<Select
  label="Behavior"
  value={state.granularPresetBehavior}
  options={[
    { value: 'pure', label: 'Pure' },
    { value: 'expressive', label: 'Expressive' },
  ]}
  onChange={(v) => onParamChange('granularPresetBehavior', v)}
/>
```

State key: `granularPresetBehavior: 'pure' | 'expressive'`

**Global sliders** (unchanged, `.granular-grid-4` wrapping to rows):

| Slider | paramKey | min | max | step | Unit | Walk/S&H |
|--------|----------|-----|-----|------|------|----------|
| Level | `granularLevel` | 0 | 1 | 0.01 | | yes |
| Feedback | `granularFeedback` | 0 | 1 | 0.01 | | yes |
| FB LPF | `granularFeedbackLPF` | 200 | 12000 | 10 | Hz | yes, log |
| Reverb Send | `granularReverbSend` | 0 | 1 | 0.01 | | yes |
| Reverb LPF | `granularReverbLPF` | 200 | 12000 | 10 | Hz | yes, log |
| Output LPF | `granularOutputLPF` | 200 | 12000 | 10 | Hz | yes, log |
| Direct | `granularDirect` | 0 | 1 | 0.01 | | yes |

#### Section 3: Input Sources

Unchanged. CollapsiblePanel or inline row of 6 send sliders:

| Slider | paramKey | min | max | step |
|--------|----------|-----|-----|------|
| Pad 1 | `granularPad1Send` | 0 | 1 | 0.01 |
| Pad 2 | `granularPad2Send` | 0 | 1 | 0.01 |
| Lead 1 | `granularLead1Send` | 0 | 1 | 0.01 |
| Lead 2 | `granularLead2Send` | 0 | 1 | 0.01 |
| Drums | `granularDrumSend` | 0 | 1 | 0.01 |
| Waves | `granularWavesSend` | 0 | 1 | 0.01 |

#### Section 4: Buffer Visualization

Unchanged. Shows:
- 16 colored slices with voice assignment dots
- write head position marker (animated, shows frozen state)
- per-voice read position markers (V1-V4, color-coded)
- time scale ticks (0s, 4s, 8s, 12s, 16s)

#### Section 5: Macros (collapsible)

Unchanged structure. Collapsible via `section-header` / `section-body` pattern.
CSS class: `.granular-macro-section`.

```
▾ Macros
┌──────────────────────────────────────┐
│  Texture    Complexity               │
│  Darkness   Chaos                    │
└──────────────────────────────────────┘
```

Layout: `.granular-grid-2`

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Texture | `granularMacroTexture` | 0 | 1 | 0.01 | yes |
| Complexity | `granularMacroComplexity` | 0 | 1 | 0.01 | yes |
| Darkness | `granularMacroDarkness` | 0 | 1 | 0.01 | yes |
| Chaos | `granularMacroChaos` | 0 | 1 | 0.01 | yes |

Implementation note: when `granularPresetBehavior == 'pure'`, the derivation
functions in engine.ts scale these macros by `0.15–0.30×` before applying.
The sliders remain fully interactive so the user sees movement, but the
engine receives attenuated values.

#### Section 6: Space Controls (collapsible)

This replaces the current "Delay" collapsible section.
CSS class: `.granular-space-section` (rename from `.granular-delay-section`).

The section renders **different controls** depending on `granularSpaceMode`:

```
▾ Space
┌──────────────────────────────────────┐
│  (content depends on mode)           │
└──────────────────────────────────────┘
```

##### When `granularSpaceMode == 'clocked'`

Shows the existing 8-tap multitap delay controls. Same layout as current delay
section, same params. No changes to controls, only the section title changes.

```
▾ Space: Clocked
┌──────────────────────────────────────┐
│  Time: [1/4 ▼]                       │
│  Activity   Repeats   Filter         │
│  Vibrato    Mix       Rev Send       │
└──────────────────────────────────────┘
```

**Time selector**: `<Select>` dropdown with note divisions

```tsx
<Select
  label="Time"
  value={state.granularDelayTime}
  options={[
    { value: '1/1', label: '1/1' },
    { value: '1/2', label: '1/2' },
    { value: '1/2d', label: '1/2d' },
    { value: '1/4', label: '1/4' },
    { value: '1/4d', label: '1/4d' },
    { value: '1/4t', label: '1/4t' },
    { value: '1/8', label: '1/8' },
    { value: '1/8d', label: '1/8d' },
    { value: '1/8t', label: '1/8t' },
    { value: '1/16', label: '1/16' },
    { value: '1/16d', label: '1/16d' },
    { value: '1/16t', label: '1/16t' },
    { value: '1/32', label: '1/32' },
  ]}
  onChange={(v) => onParamChange('granularDelayTime', v)}
/>
```

**Clocked sliders** (`.granular-grid-3`):

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Activity | `granularDelayActivity` | 0 | 1 | 0.01 | yes |
| Repeats | `granularDelayRepeats` | 0 | 0.85 | 0.01 | yes |
| Filter | `granularDelayFilter` | 0 | 1 | 0.01 | yes |
| Vibrato | `granularDelayVibrato` | 0 | 1 | 0.01 | yes |
| Mix | `granularDelayMix` | 0 | 1 | 0.01 | yes |
| Rev Send | `granularDelayReverbSend` | 0 | 1 | 0.01 | yes |

##### When `granularSpaceMode == 'diffuse'`

Shows the new diffuse space controls. Different parameter set — no Time
selector, no Activity, no note divisions.

```
▾ Space: Diffuse
┌──────────────────────────────────────┐
│  Drift     Repeats   Tone           │
│  Smear     Mix       Rev Send       │
└──────────────────────────────────────┘
```

**Diffuse sliders** (`.granular-grid-3`):

| Slider | paramKey | min | max | step | Unit | Walk/S&H | Purpose |
|--------|----------|-----|-----|------|------|----------|---------|
| Drift | `granularDiffuseDrift` | 0 | 1 | 0.01 | | yes | Tap time wander amount |
| Repeats | `granularDiffuseRepeats` | 0 | 0.85 | 0.01 | | yes | Feedback gain |
| Tone | `granularDiffuseTone` | 0 | 1 | 0.01 | | yes | LPF on feedback (dark↔bright) |
| Smear | `granularDiffuseSmear` | 0 | 1 | 0.01 | | yes | Allpass diffusion / decorrelation amount |
| Mix | `granularDiffuseMix` | 0 | 1 | 0.01 | | yes | Dry/wet blend |
| Rev Send | `granularDiffuseReverbSend` | 0 | 1 | 0.01 | | yes | Delay → reverb send level |

State keys: 6 new params in `SliderState`. Quantization: all 0–1, step 0.01
except Repeats 0–0.85.

Note: Drift, Smear, and Tone are strong candidates for walk mode in ambient
presets. Reference presets can set their `sliderModes` to `walk` for these
params with narrow ranges.

#### Section 7: Voice Cards (4 expandable cards)

Unchanged layout from current implementation. Each voice card:

**Header** (always visible):

```
┌──────────────────────────────────────────────────────┐
│ ● V1  [clean]  Slice 3  Speed 0  Pitch 0  Rev ◻  [ON] │
└──────────────────────────────────────────────────────┘
```

- Colored dot (V1=#6fa, V2=#6af, V3=#fa6, V4=#f6a)
- Voice name
- Mode badge (`clean` / `granular` / `legacy`)
- Summary text: slice, speed, pitch, reverse state
- ON/OFF toggle button
- Click header to expand/collapse body

**Body** (expanded):

Sub-sections use `.granular-section-label` for headers and grid classes for
layout. Existing structure preserved exactly:

**Mode Selection**:
Three mode buttons in a row:
```tsx
<button className={mode === 'clean' ? 'active' : ''}>clean</button>
<button className={mode === 'granular' ? 'active' : ''}>granular</button>
<button className={mode === 'legacy' ? 'active' : ''}>legacy</button>
```

**Slice & Playback** (`.granular-grid-4`):

| Slider/Control | paramKey | min | max | step | Walk/S&H |
|----------------|----------|-----|-----|------|----------|
| Slice | `granularV{n}Slice` | 0 | 15 | 1 | yes |
| Speed | `granularV{n}Speed` | 0 | 4 | 0.01 | yes |
| Pitch | `granularV{n}Pitch` | -24 | 24 | 1 | yes (S&H good for shimmer) |
| Reverse | button | 0/1 | — | — | (toggle, not slider) |

Where `{n}` = 1, 2, 3, or 4.

**Grain Controls** (`.granular-grid-4`, shown for `granular` and `legacy` modes
only, hidden for `clean`):

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Density | `granularV{n}Density` | 1 | 64 | 1 | yes |
| Size | `granularV{n}GrainSize` | 10 | 500 | 1 | yes |
| Spray | `granularV{n}Spray` | 0 | 1 | 0.01 | yes |
| Shimmer | `granularV{n}GrainOct` | 0 | 1 | 0.01 | yes (S&H good for sparkle) |

**Envelope & Texture** (`.granular-grid-4`):

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Attack | `granularV{n}Attack` | 0.003 | 1 | 0.001 | yes |
| Decay | `granularV{n}Decay` | 0.01 | 4 | 0.01 | yes |
| Blur | `granularV{n}Blur` | 0 | 1 | 0.01 | yes |
| Gain | `granularV{n}Gain` | 0 | 1 | 0.01 | yes |

**Pan & Stereo** (`.granular-grid-3`):

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Pan | `granularV{n}Pan` | -1 | 1 | 0.01 | yes (walk good for drift) |
| Spread | `granularV{n}Spread` | 0 | 1 | 0.01 | yes |
| Pan LFO | `granularV{n}PanLFORate` | 0 | 1 | 0.01 | yes |

**Position LFO** (`.granular-grid-2`):

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Rate | `granularV{n}PosLFORate` | 0 | 1 | 0.01 | yes |
| Depth | `granularV{n}PosLFODepth` | 0 | 1 | 0.01 | yes |

**Modulation** (`.granular-grid-2`):

| Slider | paramKey | min | max | step | Walk/S&H |
|--------|----------|-----|-----|------|----------|
| Rev LFO | `granularV{n}ReverseLFORate` | 0 | 1 | 0.01 | yes |
| Write Follow | `granularV{n}WriteFollow` | 0 | 1 | 0.01 | yes |

**Legacy Panel** (`.granular-legacy-section`, shown only for voice 0 when mode
is `legacy`):

| Slider | paramKey | min | max | step |
|--------|----------|-----|-----|------|
| Jitter | `granularV1Jitter` | 0 | 100 | 1 |
| Probability | `granularV1Probability` | 0 | 1 | 0.01 |
| Max Grains | `granularV1MaxGrains` | 1 | 64 | 1 |
| Pitch Spread | `granularV1PitchSpread` | 0 | 24 | 1 |
| Shadow FB | `granularV1ShadowFB` | 0 | 1 | 0.01 |

Auto-expand behavior: when switching sequencer tabs (lane 1-4), the
corresponding voice card auto-expands to show matching voice params.

### Right Panel — Sequencer

#### Reframe as Optional

The sequencer panel should be presented as an advanced, optional overlay. It is
not the identity of the granular engine.

**Key change**: add a master `Sequencer Enable` toggle at the top of the right
panel. When disabled, the entire sequencer panel collapses to a single row:

```
┌──────────────────────────────────────────────┐
│  Sequencer [OFF]                              │
└──────────────────────────────────────────────┘
```

When enabled:

```
┌──────────────────────────────────────────────┐
│  Sequencer [ON]  ▶ / ■  BPM: 72             │
├──────────────────────────────────────────────┤
│  [Seq 1] [Seq 2] [Seq 3] [Seq 4]            │
├──────────────────────────────────────────────┤
│  Clock: [1/8 ▼]  Swing: ───○───  [Link] [Ev]│
├──────────────────────────────────────────────┤
│  ▾ Evolution                                 │
│    Every X bars, Evolution %, Advanced...     │
├──────────────────────────────────────────────┤
│  Trigger: Steps ── Hits ── Rotation ──       │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┐                  │
│  │  │●●│  │●●│  │  │●●│  │  (SeqLane)       │
│  └──┴──┴──┴──┴──┴──┴──┴──┘                  │
├──────────────────────────────────────────────┤
│  Sub-lanes: Slice │ Pitch │ Reverse │ Expr   │
│  (SeqSparkline mini visualizers)             │
├──────────────────────────────────────────────┤
│  Mini Overview (all 4 lanes w/ playheads)    │
└──────────────────────────────────────────────┘
```

State key: `granularSequencerEnabled: boolean`

Implementation: gate the entire sequencer scheduler and UI body behind this
boolean. When the sequencer is off:
- no Euclidean triggers fire
- no evolution happens
- lane sub-overrides are inactive
- the sequencer panel shows only the single collapsed row

Presets control this value. Ambient and looper presets set it to `false`.
Rhythmic presets set it to `true`.

#### Sequencer Components (reuse existing)

All sequencer components are already implemented. Reuse as-is:

| Component | Purpose |
|-----------|---------|
| `SeqLane` | Single lane trigger editor (grid, probabilities, ratchets) |
| `SeqSparkline` | Mini sparkline for sub-lanes (Slice, Pitch, Reverse, Expr) |
| `SeqMiniOverview` | Compact view of all 4 lanes with playheads |
| `DragNumber` | Steps, Hits, Rotation inputs |

#### Sequencer Per-Lane Controls

| Control | Type | Range |
|---------|------|-------|
| Steps | `DragNumber` | 1–16 |
| Hits | `DragNumber` | 0–16 |
| Rotation | `DragNumber` | 0–15 |
| Clock | `<Select>` | note divisions |
| Swing | `Slider` | 0–1 |
| Link | toggle button | on/off |
| Evolve | toggle button | on/off |

Evolution panel: `CollapsiblePanel` containing Every X Bars, Evolution %,
method indicators, Advanced toggle.

### Mobile Responsive Behavior

Follow existing mobile patterns:

- `< 900px` breakpoint: two-panel layout stacks vertically (left above right)
- `.granular-grid-4` collapses to 2 columns
- `.granular-grid-3` stays 3 columns
- voice card bodies get tighter padding
- sequencer panel gets `overflow-x: auto` for horizontal scroll if needed
- slider labels shrink: `fontSize: 0.75rem`
- slider height increases: `height: 20px` for touch targets
- `CollapsiblePanel` uses `isMobile` prop for touch-optimized interaction
- mode cycling on sliders uses 400ms long-press with haptic feedback instead
  of double-click

### New State Keys Summary

| Key | Type | Default | Level | Scope |
|-----|------|---------|-------|-------|
| `granularSpaceMode` | `'diffuse' \| 'clocked'` | `'clocked'` | L3 | `granular` |
| `granularPresetBehavior` | `'pure' \| 'expressive'` | `'expressive'` | L3 | `granular` |
| `granularSequencerEnabled` | `boolean` | `true` | L3 | `granular` |
| `granularDiffuseDrift` | `number` | 0.3 | L3 | `granular` |
| `granularDiffuseRepeats` | `number` | 0.4 | L3 | `granular` |
| `granularDiffuseTone` | `number` | 0.5 | L3 | `granular` |
| `granularDiffuseSmear` | `number` | 0.3 | L3 | `granular` |
| `granularDiffuseMix` | `number` | 0.3 | L3 | `granular` |
| `granularDiffuseReverbSend` | `number` | 0.3 | L3 | `granular` |

Quantization entries to add to `QUANTIZATION` in `state.ts`:

```ts
granularDiffuseDrift:      { min: 0, max: 1, step: 0.01 },
granularDiffuseRepeats:    { min: 0, max: 0.85, step: 0.01 },
granularDiffuseTone:       { min: 0, max: 1, step: 0.01 },
granularDiffuseSmear:      { min: 0, max: 1, step: 0.01 },
granularDiffuseMix:        { min: 0, max: 1, step: 0.01 },
granularDiffuseReverbSend: { min: 0, max: 1, step: 0.01 },
```

### Visual Continuity Rules

- Section backgrounds: `rgba(255, 255, 255, 0.05)`
- Borders: `1px solid rgba(255, 255, 255, 0.1)`
- Border radius: `12px`
- Section padding: `15px`
- Collapsible headers: use `.section-header` / `.section-body` classes
- Accent colors: macros use `var(--accent-purple)`, space uses
  `var(--accent-amber)`, voices use per-voice colors
- Fill gradient on sliders: `rgba(160, 200, 220, 0.5)` (theme default)
- Walk mode slider accent: `#a5c4d4`
- S&H mode slider accent: `#D4A520`

### What NOT to Change in UI

- Do not change the buffer visualization
- Do not change the voice card expand/collapse interaction
- Do not change the per-voice color coding
- Do not change the two-panel layout or relative sizing
- Do not change the sequencer lane editor or sparkline components
- Do not add new UI component types — use existing DualSlider, Select,
  CollapsiblePanel, DragNumber
- Do not change the double-click / long-press mode cycling gesture

## Preset Guidance

Presets should be organized by behavior intent, not only by DSP voice mode.

Recommended families:
- Ambient
- Looper
- Pulse
- Experimental

Examples:
- `Loop Forest`
  - mostly clean voices
  - diffuse space
  - sequencer off
  - pure behavior

- `Microcosm Ambient`
  - clean + granular voices
  - diffuse space
  - sequencer off
  - pure or lightly expressive behavior

- `Microcosm Pulse`
  - clean + granular voices
  - clocked space
  - sequencer on
  - expressive behavior allowed

- `Legacy Cloud`
  - legacy voices
  - either space mode
  - expressive behavior allowed

## CPU Expectations

### Keep 4 voices

Keep four voices.

This is the right tradeoff because:
- Loop Forest literally wants four readers
- layered ambient scenes benefit from four roles
- rhythmic scenes map well to four lanes

### CPU costs by voice mode

- `clean`
  - generally cheaper than dense granular
  - best choice for looper-like scenes

- `granular`
  - highest CPU cost when density, spray, and active grain count are high
  - best reserved for textures and clouds

- `legacy`
  - depends on implementation, but should remain bounded and optional

### CPU costs by space mode

- `diffuse`
  - prototype goal: cheaper than or comparable to the current 8-tap delay
  - preferred first implementation: 2-4 softer or decorrelated taps
  - avoid inventing a full extra reverb topology here; this is still delay-space,
    not a second reverb engine

- `clocked`
  - current 8-tap BPM-linked mode is acceptable
  - keep it as the more structured, more CPU-explicit option

### CPU costs by sequencer

- sequencer off:
  - lower scheduler activity
  - fewer retrigger bursts
  - better for ambient defaults

- sequencer on:
  - retain only for presets that actually need it

## Migration From Existing Architecture

This work should be done incrementally.

### Phase 1: Clarify logic without major UI changes

Files:
- `src/audio/engine.ts`
- `src/ui/state.ts`
- `src/ui/granular/granularPresets.ts`

Tasks:
- add `granularSpaceMode`
- make sequencer explicitly optional by preset
- add profile-aware derivation functions
- reduce hidden macro contamination for reference presets

Goal:
- preserve current engine shape
- improve preset trustworthiness

### Phase 2: Fix clean scan DSP

Files:
- `wasm/granular-fx/kessho_granular.cpp`
- `public/worklets/granular-fx-wasm.worklet.js`
- any glue in `src/audio/engine.ts`

Tasks:
- true sine scan
- decouple pitch from transport when `speed = 0`
- rework record/reverse modulation behavior for looper scenes

Goal:
- make clean looper scenes fundamentally stable and musical

### Phase 3: Add prototype diffuse space mode inside granular

Files:
- `src/audio/engine.ts`
- `src/ui/granular/GranularPage.tsx`
- `src/ui/state.ts`

Tasks:
- preserve current multitap as `clocked`
- add `diffuse` mode
- expose mode in UI

Goal:
- support Loop Forest and Microcosm ambient behavior without deleting rhythmic mode

Important:
- this is intentionally still granular-local for the prototype
- do not migrate to shared Delay Bus A/B yet

### Phase 4: Retune preset families

Files:
- `src/ui/granular/granularPresets.ts`

Tasks:
- split current reference targets into clearer families
- create distinct:
  - `Loop Forest`
  - `Microcosm Ambient`
  - `Microcosm Pulse`

Goal:
- make presets describe actual sonic intent

### Phase 5: Validate sonic direction before delay-bus extraction

Decision gate:
- if the prototype-local `clocked` and `diffuse` behaviors are successful,
  proceed to shared delay-bus extraction
- if not, keep iterating inside granular until the sound is correct

### Phase 6: Migrate proven post-space behavior into shared Delay buses

Dependency:
- this phase should align with `ENHANCEMENTS_2.md`

Migration target:
- internal granular multitap -> shared `Delay Bus B`
- diffuse/tape behavior -> shared `Delay Bus A` or another approved shared-space
  design

Migration rules:
- preserve sonic behavior first
- do not change preset sound while moving routing ownership
- migrate old `granularDelay*` fields according to the mapping already described
  in `ENHANCEMENTS_2.md`

### Phase 7: UI cleanup

Files:
- `src/ui/granular/GranularPage.tsx`

Tasks:
- reframe sequencer as advanced/optional
- highlight voice mode + space mode clearly
- keep 4-voice model front and center

Goal:
- align UI with architecture

## Acceptance Criteria

The architecture is successful when:

- a clean looper preset does not exhibit unwanted pitch wobble
- Loop Forest presets feel like four drifting loop readers, not grain spray
- Microcosm ambient presets feel lush without requiring sequencer activity
- rhythmic presets can still use the sequencer and clocked delay on demand
- reference presets are not audibly destroyed by hidden macro inflation
- the engine remains one shared-buffer, 4-voice system

## Final Guidance for an AI Coder

- Do not solve this by adding more parallel systems.
- Preserve the current good foundation:
  - shared buffer
  - four voices
  - per-voice mode
- Separate voice playback from scene/space behavior.
- Treat the sequencer as optional overlay behavior.
- Prioritize clean scan correctness before reverb fine-tuning.
- Make preset behavior explicit, bounded, and bypassable.

If there is a conflict between:
- adding another feature
- or making Loop Forest / Microcosm reference scenes more faithful

prefer fidelity and simplicity first.
