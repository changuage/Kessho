# Kessho Pad Synth Upgrade — UI Implementation Plan

Status: implementation-ready specification  
Scope: Pad oscillator controls, shared controls, visualization, accessibility, and UI tests  
DSP companion: `docs/product-core/kessho-pad-synth-upgrade-implementation-plan.md`

## 1. Locked UI model

Show exactly two symmetric oscillator panels.

```text
OSC A                         OSC B
Wave                          Wave
Wave Position                 Wave Position
Phase Distortion              Phase Distortion
Pitch                         Pitch
Linear Hz Offset              Linear Hz Offset
Level                         Level
```

Shared controls:

```text
Mix
Drift
Phase Reset: Off / On / Random
```

Do not show:

- A1 or A2
- separate Octave and Detune controls
- Phase Modulation
- Interaction or Interaction Amount
- Ring, Ring Fixed, or Hard Sync placeholders
- user-facing wavetable bank terminology

The post-filter Folder remains a shared voice effect. It must not appear inside either oscillator panel.

## 2. Control behavior and display

### Wave

Each oscillator uses the same choices:

```text
Sine
Triangle
Saw
Square
Harmonic
Complex - Sine
Complex - Triangle
```

Preserve existing Sine/Triangle/Saw/Square values and labels. Use the Product schema enum; do not duplicate an independent UI enum.

### Wave Position

Range `0…100%`, stored as `0…1`.

- Harmonic: travels through the harmonic trajectory.
- Complex sources: travels through increasing precomputed fold complexity.
- Classic waves: no DSP meaning in this release, so keep the control visible for panel symmetry but disabled/dimmed with an accessible explanation such as “Available for Harmonic and Complex waves.”

### Phase Distortion

Range `-100%…0…+100%`, stored as `-1…+1`. Zero is centered and easy to reset. A changes only A; B changes only B.

### Pitch

One continuous control per oscillator:

```text
-24.00 … +24.00 semitones
0.01-semitone fine resolution
```

Input behavior:

- normal drag or keyboard step: 1 semitone
- fine drag/modifier or fine arrow step: 0.01 semitone
- double-click/reset action: 0
- do not globally snap to octaves; fifths and fine values must remain reachable

Formatting:

```text
+12.00 → +12 st
+7.00  → +7 st
+0.08  → +8 ct
+12.08 → +12 st +8 ct
-12.14 → -12 st -14 ct
```

Use one shared formatter. The component edits the real `padOscAPitch` or `padOscBPitch` parameter directly.

### Linear Hz Offset

Range `-50.0…+50.0 Hz`, step `0.1 Hz`, default `0.0 Hz`. Label it `Hz Offset` in a narrow layout and expose `Linear Hz Offset` in help/accessible text.

### Level, Mix, Drift, and Phase Reset

- Level keeps the existing range and behavior.
- Mix keeps the existing both-full-center audio law.
- Drift is one shared `0…100%` control; there are no A/B Drift knobs.
- Phase Reset is one compact segmented/select control with `Off`, `On`, and `Random`; default `Random`.

### Modulation destinations

The existing LFO and Mod Envelope destination selectors gain:

```text
Osc A Position
Osc B Position
Osc A Phase Distortion
Osc B Phase Distortion
Osc B Hz Offset
Filter Resonance
```

Use the existing one-destination-per-modulator UI. Do not add a matrix.

## 3. Layout

Retain the existing two-column oscillator layout at desktop/tablet widths. Each column has the same control order so A and B can be compared vertically.

Recommended order:

```text
[ shared canvas: accurate Osc A trace + accurate Osc B trace ]

[ OSC A card ] [ OSC B card ]

[ Mix ] [ Drift ] [ Phase Reset ]

... existing Sub / Noise / Filters ...

[ POST-FILTER FOLD: Amount / Mode / transfer visualizer ]
```

On narrow screens, stack A then B while retaining the same order. Do not compress the six controls into an unreadable single row. Use existing responsive breakpoints and control components.

Move or relabel the existing Fold controls so their combined post-filter position is clear. `POST-FILTER FOLD` is preferred; `FOLD (POST FILTER)` is acceptable if space is tight.

## 4. State and compatibility boundary

Add canonical `padOscAPitch` / `padOscBPitch` state keys and Pad 2 equivalents. Remove Octave/Detune from current state, preset definitions, randomization, control metadata, help text, and runtime mapping.

Add one decode-only compatibility function in the existing stored-preset compatibility boundary:

```ts
pitch = oldOctave * 12 + oldDetune / 100;
```

Run it before strict current-schema validation, then delete the old keys. Do not let compatibility names leak into current UI components or Product Core mappings.

Use one shared `formatPadPitch(pitchSemitones)` helper for both oscillators and both Pad panels. Clamp current Pitch to `-24…+24` and preserve 0.01-semitone precision.

Update randomization so it mutates one Pitch value per oscillator. Factory presets should be mechanically converted to canonical Pitch values rather than translated on every load.

## 5. Visualizer goal

Replace the dominant-oscillator-only behavior in `src/ui/synth/WaveFoldViz.tsx` with one compact shared dual-oscillator preview:

```text
┌────────────────────────────────────┐
│ A  COMPLEX-SIN      B  HARM        │
│                                    │
│ A ━━━╲╱╲╱━━━━╲╱╲╱━━━━              │
│ B ···~~~~····~~~~····              │
└────────────────────────────────────┘
```

Both oscillator-stage traces share the same axes and remain visible. The visualizer is a deterministic parameter illustration, not an oscilloscope and not a claim about a currently sounding voice.

Target `128–140 × 64` CSS pixels, responsive within the existing panel. Retain Canvas2D.

Evolve the component to:

```text
src/ui/synth/PadOscillatorViz.tsx
src/ui/synth/PadPostFilterFoldViz.tsx
src/ui/synth/padOscillatorVizMath.ts
src/ui/synth/generated/padSynthPreviewTables.generated.ts
```

The shared oscillator canvas contains two complete, independently computed visualizations: one for A and one for B. It must never select only the dominant oscillator or derive one trace from the other.

Replace the old `WaveFoldViz` oscillator-preview role with `PadOscillatorViz`. Reuse only its useful Canvas lifecycle and Fold math when building the separate post-filter transfer visualizer; remove the obsolete component afterward.

## 6. What the oscillator visualizer represents

Each A/B trace includes only:

```text
Wave source
Wave Position
Phase Distortion
Pitch
Linear Hz Offset
Level/Mix prominence
illustrative phase progression
```

It does not include:

```text
Sub
Noise
Filters
Warmth/Presence
post-filter Fold
VCA/envelopes
effects
polyphonic audio
instantaneous DSP Drift state
```

Do not apply the real Fold algorithm separately to A and B traces. That would contradict the DSP, where Fold processes the combined post-filter voice.

Keep Fold Amount and Mode under a clearly labelled `POST-FILTER FOLD` heading with a separate transfer-function visualizer. It shows the selected Fold mode's input-to-output transfer curve at the current amount. It does not show an oscillator waveform and does not claim to reconstruct the filtered polyphonic output.

The same offline generator that emits the DSP Fold transfer grid must emit lightweight UI Fold preview data into `padSynthPreviewTables.generated.ts`. Do not duplicate the transfer equations in React.

## 7. Persistent A/B traces and Mix prominence

Use stable existing design-system identities for A and B. If no A/B colors already exist, distinguish them minimally:

- A: solid, slightly stronger line
- B: softer or subtly dashed line

Always draw the less prominent trace first.

Visual prominence must follow the actual Pad mix law multiplied by oscillator Level:

```ts
const aGain = Math.min(1, 2 * (1 - mix)) * oscALevel;
const bGain = Math.min(1, 2 * mix) * oscBLevel;
```

Normalize these values only for opacity/line emphasis. Do not scale waveform height. Keep a minimum opacity near `0.10` so the quieter oscillator remains visible.

At center, both traces should be fully/equally relevant because the real mixer keeps both at full gain. Do not use the old equal-power cosine/sine preview law.

There is no interaction relevance override because no interaction system exists.

## 8. Waveform and table preview math

For classic waves, use lightweight recognizable shapes. They do not need to reproduce every audio PolyBLEP sample.

For Harmonic and Complex sources, consume only the generated preview tables emitted by the canonical DSP table generator. Do not recreate those trajectories in React or hand-maintain sample arrays.

Position linearly interpolates adjacent generated frames. PD applies the same midpoint warp as DSP before sampling the wave. Square must visibly behave like variable duty.

Each oscillator trace follows this preview path independently:

```text
fixed reference phase/frequency
→ that oscillator's Pitch and Linear Hz Offset
→ that oscillator's Phase Distortion
→ that oscillator's selected Wave and Position interpolation
→ normalized trace shape
→ Mix × Level visual prominence
```

For Harmonic and Complex waves, the trace samples the canonical generated trajectory. It must not use a generic sine/fold approximation. Mix and Level change prominence only, never waveform geometry or normalized height.

Keep all math pure and outside React:

```ts
sampleBasicWave(...)
sampleGeneratedPreview(...)
applyPreviewPhaseDistortion(...)
resolvePadPitchSemitones(...)
resolvePreviewFrequency(...)
resolveVisualizerCycleCount(...)
resolveMixProminence(...)
sampleGeneratedFoldTransfer(...)
wrap01(...)
```

Do not add an abstraction layer beyond these concrete helpers.

## 9. Pitch and phase animation

Use a fixed reference note, recommended `110 Hz`, so previews are stable and comparable. Resolve each illustrative frequency using the same order as DSP:

```ts
trackedHz = referenceHz * 2 ** (pitchSemitones / 12);
effectiveHz = Math.max(minHz, trackedHz + hzOffsetHz);
```

Map frequency to a compressed visible cycle count, approximately `0.75…3` cycles across the canvas. Preserve ordering—higher Pitch shows more cycles—but do not draw literal audio-rate cycles.

Independent slow visual phases show relative beating from Pitch and Hz Offset. They use a deliberately slowed visual time scale and never claim sample accuracy.

Do not fabricate random Drift motion. The UI does not receive per-voice drift state. Drift remains visible as a control but is excluded from preview frequency math.

Do not pretend to show actual Phase Reset note starts without note-trigger telemetry. Phase Reset remains a control; the preview uses deterministic illustrative phases.

## 10. Rendering and CPU rules

Preserve the useful behavior of the current Canvas implementation and improve it where needed:

- use `ResizeObserver` for size changes
- cap device pixel ratio using the existing policy
- preallocate/reuse A and B sample buffers
- use roughly 128–256 samples per trace
- cap animated drawing at 30 fps
- pause when off-screen or the document is hidden
- honor `prefers-reduced-motion`; render a static frame and schedule no animation loop
- cancel animation frames and observers on cleanup
- avoid React state updates per animation frame
- redraw static content only when relevant props or dimensions change

Oscillator-canvas draw order per frame:

```text
1. resolve dimensions and DPR
2. resolve A and B preview frequencies/phases
3. sample A and B through their independent Wave/Position/PD paths
4. resolve Mix × Level prominence
5. clear and draw the center guide
6. draw the less prominent trace
7. draw the more prominent trace
8. draw short A/B source labels
```

Static redraw inputs are Wave, Position, PD, Pitch, Hz Offset, Level, Mix, dimensions, and reduced-motion state. Animated redraw is used only for the slowed relative-phase display and stops when hidden or reduced motion is enabled.

Do not add WebGL, an analyser node, FFT, worker, audio-buffer transfer, or a second visualization library.

## 11. Accessibility

The canvas must have a concise accessible description derived from parameters, for example:

```text
Oscillator preview. A: Complex Sine, pitch zero semitones,
phase distortion 20 percent. B: Harmonic, pitch 12 semitones.
Mix centered.
```

The Fold transfer canvas has its own description, for example:

```text
Post-filter Fold transfer. Buchla mode, amount 45 percent.
```

Do not attempt to narrate the animated phase. Controls retain keyboard operation, visible focus, value text, and existing touch targets. Disabled Position controls must expose why they are unavailable.

Reduced motion is a requirement, not an optional enhancement.

## 12. Component contract

Use real state types, but the visualizer boundary should conceptually receive:

```ts
interface PadOscillatorVizProps {
  oscAWave: PadWaveSource;
  oscAPosition: number;
  oscAPhaseDistortion: number;
  oscAPitchSemitones: number;
  oscAHzOffset: number;
  oscALevel: number;

  oscBWave: PadWaveSource;
  oscBPosition: number;
  oscBPhaseDistortion: number;
  oscBPitchSemitones: number;
  oscBHzOffset: number;
  oscBLevel: number;

  oscMix: number;
  referencePitchHz?: number;
}

interface PadPostFilterFoldVizProps {
  foldAmount: number;
  foldMode: PadFoldMode;
}
```

Do not pass Drift animation state, interaction modes, removed oscillator state, Fold/filter state, or live audio buffers.

## 13. Implementation stages and gates

### UI Stage 1 — canonical Pitch control and compatibility

- add canonical Pitch state/metadata and the shared formatter
- add one decode-only old Octave/Detune conversion and tests
- replace Octave/Detune controls with one Pitch control for Pad 1 and Pad 2
- update randomization and parameter labels/ranges
- mechanically convert factory presets and remove current-runtime use of old keys

Gate: old presets convert once, +7 semitones and ±1-cent edits are reachable, Pad 1/2 work, no current runtime reads old keys, and keyboard/touch behavior passes.

### UI Stage 2 — dual classic-wave visualizer

- extract current preview math from React
- draw A and B on one shared canvas
- use real both-full Mix/Level prominence
- add fixed reference Pitch/Hz Offset mapping
- add ResizeObserver, 30 fps cap, and reduced-motion behavior

Gate: classic wave shapes, center mix, hard-left/right mix, Pitch relationships, Hz beating, visibility pause, and accessibility description pass.

### UI Stage 3 — generated sources and PD

- connect generated Harmonic/Complex preview tables
- add independent Position and PD preview math
- disable Position for classic sources

Gate: A changes do not alter B, B changes do not alter A, both traces use their own canonical table trajectory, Position interpolation is smooth, PD zero is transparent, Square looks like PWM, and generated data is current.

### UI Stage 4 — post-filter Fold truthfulness and cleanup

- stop applying Fold to either oscillator trace
- add the generated post-filter Fold transfer visualizer beside its controls
- remove the old dominant-oscillator implementation
- verify narrow layouts and both Pad panels

Gate: the UI never implies per-oscillator folding, the Fold transfer changes accurately with Mode/Amount, no duplicate Fold equations or obsolete visualizer code remain, and current Fold controls still work.

## 14. Automated tests

Add focused tests for pure behavior:

- old Octave/Detune conversion at negative, zero, fine-detuned, interval, and octave values
- Pitch formatting in semitones/cents
- restored B Hz Offset and Filter Resonance destination enum/state routing
- actual Mix/Level prominence at `0`, `0.5`, and `1`
- minimum trace visibility and draw order
- cycle count ordering and clamp
- Hz Offset creates relative phase change over illustrative time
- generated tables are finite and Position interpolation stays bounded
- PD zero identity and independent A/B behavior
- Square duty changes with PD
- each oscillator samples its own selected generated table and Position
- Fold transfer preview matches generated transfer samples for every mode
- animation does not start under reduced motion or invisibility
- canvas/DPR resize cleanup where existing test tools support it

Do not add screenshot tests unless the repository already has a stable canvas snapshot path.

## 15. Manual validation matrix

```text
Analog
  A Saw, Pitch 0
  B Saw, Pitch 0, Hz Offset +2
  Mix center
  → equally prominent traces with slow relative motion

Interval
  A Saw, Pitch 0
  B Sine, Pitch +7 then +12
  → B cycle density increases predictably

Harmonic
  A Harmonic, B Sine
  → A Position changes only A

Complex
  A Complex-Sine, B Complex-Triangle
  → each Position independently increases fold complexity

Phase Distortion
  A Square, PD sweep -100%…+100%
  B Sine, PD 0
  → A duty changes; B is unchanged

Mix and Levels
  test hard left, center, hard right, and zero oscillator Level
  → prominence follows actual gain but neither trace disappears

Reduced motion
  → stable static preview, no animation loop

Post-filter Fold
  sweep every Mode and Amount
  → transfer curve changes accurately and is never shown as A-only or B-only
```

## 16. Visualization non-goals

Do not add side-by-side canvases, waveform tabs, spectrum or spectrogram views, a live oscilloscope, MIDI history, Sub/Noise traces, filter-response drawing inside the oscillator canvas, stereo waveforms, or user-selectable visualization modes. A and B remain independent traces on one shared canvas; Fold remains one separate post-filter transfer display.

## 17. Definition of done

- A and B have identical six-control panels
- Pitch replaces separate Octave and Detune in both Pad UIs
- Pitch supports semitone and cent precision with correct formatting
- one shared Drift and one shared Phase Reset are present
- no A2, PM, or Interaction language/control remains
- both traces are always present on one shared canvas
- Mix prominence follows the actual both-full-center DSP law and oscillator Levels
- Harmonic and Complex previews come from generated canonical data
- A and B are independently sampled through their own Wave/Position/PD paths
- A/B Position and PD display independently
- Hz Offset communicates slow relative beating without literal audio-rate drawing
- no fake DSP Drift or Phase Reset telemetry is shown
- Fold controls and generated transfer visualizer are clearly labelled as combined and post-filter
- reduced motion, visibility pausing, DPR handling, cleanup, and accessible text pass
- no live audio analysis or heavy rendering infrastructure is introduced
- Pad 1, Pad 2, presets, morphing, randomization, and saved state remain functional
