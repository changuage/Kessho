# Kessho Pad Synth Upgrade — DSP and Architecture Implementation Plan

Status: implementation-ready specification  
Scope: Pad DSP, Product Core integration, presets, and CPU validation  
Companion UI plan: `docs/ui/kessho-pad-synth-upgrade-ui-plan.md`

## 1. Locked product decisions

The upgraded Pad remains one synth engine with exactly two user-facing and internal main oscillators:

```text
Oscillator A
Oscillator B
```

There is no hidden A2 oscillator. Remove `osc_a2` and every A1/A2 assumption from the Pad implementation, tests, comments, presets, and visualizer.

Each main oscillator exposes:

```text
Wave
Wave Position
Phase Distortion
Pitch
Linear Hz Offset
Level
```

Shared oscillator controls are:

```text
Mix
Drift
Phase Reset: Off / On / Random
```

There is no oscillator-to-oscillator phase modulation and no Interaction or Interaction Amount control. Ring modulation, Ring Fixed, and Hard Sync are future work and must not be scaffolded in this change.

The existing real wavefolder remains in its current location: after Filter A/B and Warmth/Presence, before final saturation and the VCA. Do not move it into either oscillator.

## 2. Sonic goals

The engine must cover three related sound families without separate modes:

- Wavetone-inspired digital sounds through Harmonic tables, Wave Position, per-oscillator Phase Distortion, Pitch, Linear Hz Offset, Drift, and Phase Reset.
- West Coast sounds through `Complex - Sine`, `Complex - Triangle`, position modulation, Phase Distortion, and the existing post-filter wavefolder.
- Moog-style subtractive sounds through two classic oscillators, Pitch, Linear Hz Offset, Drift, Sub, and the improved existing Ladder LP.

Only `Saturated Drift` needs deliberate preservation of its approximate musical identity. `Buchla Pluck` may be rebuilt around Complex position modulation plus the existing wavefolder; it must not depend on phase modulation.

## 3. Explicit non-goals

Do not add:

- A2 or any other hidden unison oscillator
- oscillator phase modulation or frequency modulation
- an interaction enum or amount parameter
- a generic modulation matrix
- user wavetable import
- separate Wavetone, Buchla, or Moog engines/modes
- whole-voice oversampling
- 4x/8x quality modes
- a second ladder filter type
- live wavetable generation, FFT work, allocation, or locks in the audio callback
- new DSP inside `KesshoPadModule.cpp`; it remains an integration wrapper

## 4. Current implementation facts that must be corrected

The real Pad DSP is `wasm/pad/kessho_pad.cpp`. The Product Core wrapper is `cpp/KesshoCore/src/modules/KesshoPadModule.cpp`.

Before feature work, account for these current behaviors:

- `osc_a2` is a hidden detuned copy of A. It must be deleted.
- A Detune currently tunes only hidden A2, not A.
- B Detune is stored but does not affect B frequency.
- the mixer is both-full at center, not equal-power
- Filter B Resonance is stored but ignored
- Warmth and Presence coefficients are recalculated inside the sample loop
- `WaveFolder::set_fold()` can regenerate a 256-sample transfer table from the sample loop
- Hardness can drive the ladder and then drive a second post-filter waveshaper
- the current folder is post-filter/post-EQ on the combined voice
- note-on currently randomizes A, A2, B, and Sub phases independently

Capture these facts in regression tests before changing them. Do not preserve the A2/B-detune bugs as new behavior.

## 5. Final signal path

```text
note frequency
   │
   ├── Osc A: Pitch → Drift A → Hz Offset A → phase → PD A → source/position → Level A
   │
   └── Osc B: Pitch → Drift B → Hz Offset B → phase → PD B → source/position → Level B
                         │
                         ▼
                 existing both-full Mix
                         +
                       Sub
                         +
                       Noise
                         │
             Filter A / Filter B routing
                         │
                 Warmth / Presence
                         │
              existing real Wavefolder
                         │
                  final saturation
                         │
                       VCA
```

For Ladder LP, Hardness drives the ladder input and the second Hardness-driven post-ladder saturation is bypassed. For the other filter types, Hardness continues to drive the existing post-filter saturation. This prevents the same control from saturating the ladder path twice.

## 6. Pitch is one DSP and UI concept

Pitch is a continuous bipolar semitone value:

```text
range: -24.00 … +24.00 semitones
resolution: 0.01 semitone = 1 cent
default A: 0.00
default B: +0.08
```

Examples:

```text
-12.00 = one octave down
+7.00  = one fifth up
+0.07  = seven cents sharp
```

There is no separate Detune DSP parameter. Fine detuning is the fractional part of Pitch.

Frequency order is:

```cpp
trackedHz = noteHz * exp2f((pitchSemitones + pitchModSemitones
                           + driftCents * 0.01f) / 12.0f);
finalHz = clamp(trackedHz + linearOffsetHz,
                kMinOscillatorHz,
                kMaxSafeOscillatorHz);
```

The fixed-Hz offset is added after all musical/cents-domain pitch terms. Test negative offsets on low notes. Never allow zero, negative, non-finite, or unsafe near-Nyquist oscillator frequency.

### 6.1 Narrow compatibility conversion

Use real `padOscAPitch` and `padOscBPitch` parameters throughout the new schema, state, presets, UI, Product Core, and DSP. Do not keep hidden Octave/Detune storage in the new architecture.

At the old-preset decode boundary only:

```text
new A Pitch = old A Octave × 12 + old A Detune / 100
new B Pitch = old B Octave × 12 + old B Detune / 100
```

After conversion, remove the four old keys before current-schema validation. This is one small, version-specific compatibility function with a focused test—not a generic migration framework.

`KesshoPadModule.cpp` and the Pad C API receive one float Pitch value per oscillator. Remove the old octave/detune setters once every in-repository caller has moved.

## 7. Public parameter layout

Keep unchanged controls at their existing indices where possible. Reuse the two obsolete Detune slots for Position and change the two old Octave slots to Pitch. The old 52-value layout is distinguishable by parameter count and is converted before use.

```text
0      Osc A Wave               existing enum, extended to 0…6
1      Osc A Pitch             -24…+24 semitones, default 0
2      Osc A Wave Position      0…1, default 0
3      Osc A Level              existing behavior
4      Osc B Wave               existing enum, extended to 0…6
5      Osc B Pitch             -24…+24 semitones, default +0.08
6      Osc B Wave Position      0…1, default 0
7…50   existing parameters, unchanged
51     Osc A Phase Distortion  -1…1, default 0
52     Osc B Phase Distortion  -1…1, default 0
53     Osc A Linear Hz Offset  -50…+50 Hz, default 0, step 0.1
54     Osc B Linear Hz Offset  -50…+50 Hz, default 0, step 0.1
55     Drift                    0…1, default 0.42
56     Phase Reset              Off=0, On=1, Random=2; default Random
57     Output Trim              existing behavior/default
```

Final per-Pad parameter count: `58`.

With two Pad parameter blocks plus Reverb Send and Output Select, the Pad module's total parameter count becomes:

```text
58 × 2 + 2 = 118
```

Phase Reset is discrete and must be included in preset snap indices. Wave enums and existing enum values remain stable:

```text
Sine               0
Triangle           1
Saw                 2
Square              3
Harmonic            4
Complex - Sine      5
Complex - Triangle  6
```

Convert an old 52-value exact Pad patch as follows:

```text
new[0]     = old[0]
new[1]     = old[1] × 12 + old[2] / 100
new[2]     = 0
new[3…4]   = old[3…4]
new[5]     = old[5] × 12 + old[6] / 100
new[6]     = 0
new[7…50]  = old[7…50]
new[51…54] = 0
new[55]    = clamp(0.20 + old[16] × 0.55 + old[2] × 0.0025, 0, 1)
new[56]    = Random
new[57]    = old[51]
```

Apply this conversion in both stored-state decoding and Product snapshot/exact-patch decoding before current-count validation. This preserves the old authored pitch intent, approximates the old implicit Drift amount, and moves output trim to the final slot. Exact old sound is still not promised because the old oscillator wiring was incorrect.

## 8. Oscillator source implementation

Both oscillators use the same source function and state shape. Keep normalized phase in `[0, 1)`.

```cpp
struct PadOscillatorParams {
    PadWaveSource wave;
    float position;
    float phaseDistortion;
    float pitchSemitones;
    float linearOffsetHz;
    float level;
};

struct PadOscillatorState {
    float phase;
    float lastFrequencyHz;
    uint64_t lastPhaseFrame;
    float staticDriftUnit;
    float driftPhase;
    float driftRateHz;
};
```

Keep the processing helper local to `kessho_pad.cpp` initially. Do not create a framework or a new compiled `.cpp` merely for one oscillator implementation. Generated immutable table data belongs in:

```text
wasm/pad/generated/pad_synth_tables.generated.h
```

Include that header from `kessho_pad.cpp`, avoiding new source-file build-list divergence.

## 9. Wave sources and generated tables

Classic Sine, Triangle, Saw, and Square retain the existing band-limited/native source path. Wave Position is neutral for these four choices and the UI disables the Position control while they are selected.

Generate three original Kessho table trajectories:

- Harmonic: deterministic fundamental-to-richer harmonic frames
- Complex - Sine: sine passed through progressively deeper Buchla-inspired folding
- Complex - Triangle: triangle passed through the same fold family

Do not copy proprietary source tables.

Use one deterministic offline generator:

```text
scripts/generate-pad-synth-tables.mjs
  ├── wasm/pad/generated/pad_synth_tables.generated.h
  └── src/ui/synth/generated/padSynthPreviewTables.generated.ts
```

The generator must support `--check` and be run by the generated-file CI check. Do not hand-edit either output.

Initial bounded format:

```text
audio oscillators: 3 trajectories × 32 frames × 8 mip levels × 257 samples
audio Fold grid:   3 modes × 33 amount frames × 257 input samples
UI oscillators:    3 trajectories × 32 frames × 129 samples
UI Fold grid:      3 modes × 33 amount frames × 65 input samples
```

Targets:

```text
audio decoded table data < 0.85 MiB
UI decoded preview data < 96 KiB
combined fold transfer grid + audio tables < 1.0 MiB
```

Use direct harmonic synthesis for known spectra and a deterministic offline real-DFT analysis for folded sources; no new runtime dependency is required. For every frame: remove DC, preserve a stable phase convention, bound adjacent-frame RMS/peak changes, discard harmonics above each mip limit, and add the guard sample.

Do not space Complex frames blindly by linear physical Fold drive. Allocate more frames around the first folding thresholds, where the spectrum changes fastest, and validate that equal Position movements feel reasonably even across the trajectory.

At runtime: select a mip from final oscillator frequency, linearly interpolate adjacent position frames, and linearly interpolate adjacent phase samples. No generation or spectral analysis occurs during rendering.

## 10. Phase Distortion

Phase Distortion is independent inside A and B. It never reads the other oscillator.

Internal range is `-1…+1`; UI display is `-100%…+100%`. Zero is transparent.

Use this exact phase mapping before source lookup:

```cpp
midpoint = clamp(0.5f + pd * 0.45f, 0.05f, 0.95f);

warpedPhase = phase < midpoint
    ? 0.5f * phase / midpoint
    : 0.5f + 0.5f * (phase - midpoint) / (1.0f - midpoint);
```

PD is available for all seven wave choices. For Square, the displaced midpoint is the pulse-width transition and both discontinuities require the existing PolyBLEP-style correction. Do not phase-warp a naive square.

Mipmaps alone do not prevent all PD aliasing. Compare high-note/extreme-PD renders with an offline 4x reference. Add a local 2x oscillator-only path only if the measured foldback gate fails. Never oversample the whole voice.

Smooth Pitch, Position, PD, and Linear Hz Offset with an 8 ms parameter ramp. Smooth Drift over 100 ms. Wave and Phase Reset enums snap.

## 11. Shared Drift

Drift remains part of the engine as one user-facing `0…1` amount controlling independent A and B variations. It does not add another oscillator and it does not affect Sub.

Refactor the existing drift rather than layering a second system:

```text
A static note offset: triangular random × 0.7 cent × Drift
B static note offset: triangular random × 0.8 cent × Drift
A slow motion:         ±0.25 cent × Drift, 0.025–0.060 Hz
B slow motion:         ±0.25 cent × Drift, 0.035–0.090 Hz
```

Store the full-scale random coefficient and multiply by the current Drift value during rendering so `Drift=0` is immediately and exactly neutral. A and B use independent deterministic seeded values. Do not generate fresh randomness per sample.

Default `0.42` approximates the current default behavior while removing the accidental coupling to Warmth and A Detune. Smooth live Drift changes. At zero, take a cheap branch that skips drift calculation.

## 12. Shared Phase Reset

One enum controls A and B at note-on:

```text
Off
  A and B genuinely continue from free-running phase.

On
  A phase = 0
  B phase = 0

Random
  A and B receive independent random phases.
```

`Random` is the compatibility default. Independent random phases are a Kessho decision.

For `Off`, retaining a stale phase is not sufficient. Seed independent A/B phases at engine initialization. Maintain an engine sample counter plus each oscillator's last phase-update frame/frequency. On voice reuse, lazily advance its phase across inactive time using its last rendered frequency, then apply the new note frequency. Do not render inactive voices merely to advance phase.

Phase Reset does not reset or otherwise alter Sub, Noise, LFOs, or envelopes. Sub keeps its existing independent note-trigger phase behavior.

## 13. Mix, folder, and filter corrections

Preserve the current both-full-center mix law:

```cpp
aGain = min(1.0f, 2.0f * (1.0f - mix));
bGain = min(1.0f, 2.0f * mix);
```

After deleting A2:

```cpp
sample = a * aGain + b * bGain + sub + noise;
```

Retune calibration/voice compensation only from measured output; do not silently halve A to mimic the removed A2 average.

Keep the real folder post-filter and post-Warmth/Presence. Replace per-voice, render-time table regeneration with one immutable generated transfer grid:

```text
3 fold modes × 33 amount frames × 257 input samples
```

Use bilinear interpolation over input and Fold Amount. This preserves sample-rate Fold modulation without rebuilding tables in the callback.

Move Warmth and Presence coefficient updates out of the sample loop. Update once per block or only when their parameters/sample rate change. Hoist any unchanged waveshaper drive setter out of the sample loop as well.

Improve the existing `PadLadderLP`; do not add a second ladder enum. Map controls intentionally:

- Filter Resonance controls ladder feedback independently of Hardness.
- Hardness controls ladder input drive.
- Ladder mode does not receive the second Hardness-driven post waveshaper.
- Other filter modes retain post-filter Hardness saturation.
- Filter B Resonance must affect Filter B or the redundant control must be removed; for this scope, wire it into the existing Filter B Q/resonance mapping and test it.

## 14. Modulation destinations

Reuse the existing one-destination-per-modulator model. Append enum values without renumbering existing destinations.

Required new destinations:

```text
Osc A Position
Osc B Position
Osc A Phase Distortion
Osc B Phase Distortion
Osc B Linear Hz Offset
Filter Resonance
```

Retain existing Pitch, Fold Amount, Filter Cutoff, and other destinations. The existing shared Pitch destination continues to modulate A and B in the cents/semitone domain.

`Osc B Linear Hz Offset` provides controllable beating without duplicating the shared Pitch destination. `Filter Resonance` targets the main Filter A resonance parameter. Do not add PM Amount.

Clamp modulation after summing and before DSP use. Position is `0…1`; PD is `-1…1`; B Hz Offset is `-50…+50 Hz`; Filter Resonance uses its existing safe range.

## 15. Parameter-unit authority

Define physical-unit conversion once at the Product Core/Pad DSP boundary. The render loop receives named units and must not reinterpret normalized UI values.

```text
Pitch                 semitones
Linear Hz Offset      Hz
Drift                 normalized 0…1, converted to cents in Drift DSP
Wave Position         normalized 0…1
Phase Distortion      bipolar -1…1
Filter Resonance      existing normalized resonance range
```

Use small concrete helpers such as `pitchSemitonesToRatio`, `clampLinearOffsetHz`, and `applyPhaseDistortion`. Do not duplicate conversion formulas across the UI, host bridge, and sample loop. UI code formats values but does not define DSP scaling.

## 16. Product and build integration

Every public control must be completed through the full path:

```text
canonical schema
→ generated bindings
→ parameter indices/counts
→ KesshoPadModule
→ Pad C API
→ kessho_pad.cpp
→ host mapping
→ Pad 1 / Pad 2 state
→ preset ownership and sparse overrides
→ morph/snap behavior
→ snapshot/save/load
→ UI
→ tests
```

Update all hard-coded Pad counts, including `KesshoPadModule.cpp`, `KesshoModule.h`, `scripts/test-kessho-core.mjs` (`118` total module parameters), behavior harnesses, and parameter-accounting tests. Regenerate generated files; do not hand-edit them.

Because the old Octave/Detune C API is replaced, update the complete export surface in the same stage:

```text
wasm/pad/kessho_pad.h
wasm/pad/build.sh
wasm/pad/build_pad.ps1
Package.swift
KesshoPadModule.cpp
standalone Pad worklet bindings
native/WASM ABI and export tests
```

`public/worklets/pad-synth-wasm.worklet.js` contains duplicate Pad parameter routing. Treat it as supported unless a reachability check proves it dead. Either update it in the same slices or remove it with evidence; do not leave stale mappings.

The generated Pad synth-table header is included by `kessho_pad.cpp`, so the existing explicit build source lists do not need another `.cpp`. Confirm native and WASM builds consume the same generated data.

## 17. Ladder implementation contract

Improve the existing `PadLadderLP` in place as a stable nonlinear four-pole TPT/ZDF-style ladder:

```text
input → Hardness drive → pole 1 → pole 2 → pole 3 → pole 4 → output
                           ↑                              │
                           └──── resonance feedback ─────┘
```

Required behavior:

- input level changes saturation character
- Resonance and Hardness interact musically but remain separate controls
- cutoff sweeps remain stable at every supported sample rate
- high resonance remains bounded and produces no NaN/DC runaway
- low notes retain useful bass weight
- the implementation is not four unrelated biquads plus feedback

Use existing public `PAD_FILTER_LADDER_LP` and `Hardness`; do not add Filter Drive or another ladder enum.

Reference Moog-style validation patch:

```text
Osc A: Saw, Pitch 0, PD 0
Osc B: Saw, Pitch -12, Hz Offset +1.5 Hz, PD 0
Sub: small
Drift: small
Wave Position: neutral
Post-filter Fold: off
Filter: Ladder LP, moderate Resonance and Hardness, filter envelope active
```

This patch must work without a global Moog mode.

## 18. Implementation stages and gates

### Stage 1 — baseline and CPU cleanup

Before synthesis changes:

- deterministic renders for Init, Saturated Drift, and Buchla Pluck diagnostic
- direct Pad benchmark at 1, 8, and 16 active voices
- p50, p95, p99, maximum block time, realtime-budget percentage, and underruns
- fixed seed, compiler/build mode, sample rate, block size, and machine metadata

Then, without changing intended sound:

- cache Warmth/Presence coefficients
- remove render-time folder table regeneration
- hoist redundant setters
- verify Filter B Resonance behavior and establish the intended mapping

Gate: deterministic checks pass; normal patch CPU improves or is unchanged outside noise.

### Stage 2 — remove A2 and unify Pitch

- delete A2 state, rendering, drift, reset, comments, and tests
- replace current Octave/Detune schema/state/API fields with one Pitch per oscillator
- add the narrow old-state and old-exact-patch conversions
- make both A and B Pitch values audible
- preserve the existing Mix law
- add old-patch Pitch conversion and loading tests

Gate: exactly two main oscillator evaluations per active voice; Pitch is a single continuous parameter and remains click-free during morphs; no stale A2/Octave/Detune runtime references remain.

### Stage 3 — generated tables and Wave Position

- add deterministic generator and both outputs
- add `--check`
- integrate Harmonic and Complex sources
- add A/B Position full vertical slices and modulation destinations

Gate: table integrity, memory budget, Pad 1/2, save/reload, native/WASM parity, and CPU checks pass.

### Stage 4 — Phase Distortion

- add A/B PD vertical slices
- implement Square as band-limited variable duty
- run alias comparison and add local 2x only if required

Gate: PD zero transparency, independent A/B behavior, smooth automation, numerical safety, alias gate, and CPU gate.

### Stage 5 — Hz Offset, Drift, and Phase Reset

- add A/B Hz offsets
- expose/refactor shared Drift
- implement Off/On/Random reset semantics including lazy free-run

Gate: fixed-Hz beat tests, zero-drift transparency, deterministic random mode, and phase-mode tests pass.

### Stage 6 — ladder correction and sound design

- improve existing Ladder LP
- remove double Hardness saturation in ladder mode
- wire Filter B Resonance
- revoice Saturated Drift
- rebuild Buchla Pluck using Complex Position/PD and optional post-filter Fold

Gate: sine/saw/noise inputs pass cutoff, Resonance, Hardness, and input-level sweeps; frequency response, RMS, harmonic distortion, DC, stability, bass retention, preset identity, and the 16-voice CPU gate pass.

### Stage 7 — UI integration and cleanup

Implement the companion UI plan. Remove the obsolete visualizer path and all separate Octave/Detune controls only after replacement tests pass.

## 19. Validation requirements

Automate:

- finite output and bounded peaks across every new parameter range
- 44.1, 48, and 96 kHz
- irregular, one-frame where supported, normal, and maximum block sizes
- 1, 8, and 16 voices, retrigger, release, and voice stealing
- two simultaneous Pad instances with no shared mutable voice state
- old 52-value patch conversion and new 58-value round trip
- output trim remains `paramCount - 1`
- Pad 1/Pad 2 mapping, morph, snapshot, sparse overrides, and defaults
- native/WASM control and render parity within existing tolerances
- generated files are current and table memory stays within budget
- Linear Hz Offset stays linear: `110→112 Hz` and `440→442 Hz` both measure a `2 Hz` difference

For Harmonic, Complex, PD, the real folder, and Ladder nonlinearity, compare selected production renders against offline high-rate references. Measure foldback/error energy; do not judge aliasing only from screenshots.

Benchmark these named cases at 1, 8, and 16 active voices:

```text
BASELINE CURRENT
  captured before cleanup

CLEAN BASIC
  Saw + Saw, no PD, no Position modulation, normal filter

HARMONIC
  two Harmonic oscillators with Position modulation

COMPLEX
  Complex-Triangle + Complex-Sine with Position and moderate PD

MOOG
  the reference Moog patch above

WORST NORMAL USE
  two Complex oscillators, Position modulation, PD,
  post-filter Fold, Ladder LP, 16 voices
```

Record mean, p50, p95, p99, maximum block time, realtime-budget percentage, baseline ratio, and underruns. CPU gates at 48 kHz/128 frames on the recorded baseline machine:

```text
basic two-oscillator patch: no slower than 1.30x cleaned baseline
normal 16-voice patch:      p99 < 50% of realtime block deadline
heavy 16-voice patch:       p99 < 75% of realtime block deadline
all cases:                  zero underruns and no callback allocation/locks
```

If a gate fails, profile the direct Pad benchmark before adding more DSP.

### Hard real-time rules

The render path performs:

```text
NO heap allocation
NO locks
NO filesystem access
NO FFT or table generation
NO logging from the sample loop
NO dynamic container growth
NO exceptions
```

All immutable tables are ready before playback.

### Scope guard

Do not move Product Core ownership, rewrite the preset system, alter Lead/Drum/Sample engines, create a generic modulation graph, add stereo oscillator architecture, or introduce quality-mode scaffolding. Touch shared infrastructure only where the Pad's real parameter/build path requires it.

## 20. Presets

All factory presets must still load and produce finite audio. Exact preservation is not required.

For semantic interpretation of old preset controls:

```text
Pitch = old Octave × 12 + old Detune cents / 100
```

Because old A Detune drove hidden A2 and old B Detune was ignored, exact automatic sonic preservation is impossible. Do not recreate those bugs.

Revoice `Saturated Drift` against captured references for dark/warm movement, register, envelope, and approximate brightness. Rebuild `Buchla Pluck` with:

```text
Osc A: Complex - Triangle or Complex - Sine
Osc B: Sine/Triangle at a useful Pitch relationship
Mod Env or LFO: Osc A Position or PD
Post-filter Fold: only as needed
```

No PM substitute or hidden modulator is permitted.

## 21. Definition of done

- exactly two main oscillators exist and are rendered
- the UI exposes one Pitch and one Linear Hz Offset per oscillator
- legacy Octave/Detune patches convert once to one Pitch without audible morph steps
- A/B Position and A/B PD are independent
- PD works on every wave; Square behaves as band-limited PWM
- shared Drift is controllable, deterministic under fixed seed, and neutral at zero
- Phase Reset Off/On/Random matches the specified behavior
- no phase modulation or Interaction controls remain in the plan or implementation
- Harmonic and both Complex sources use immutable generated tables
- the real folder remains combined and post-filter
- the folder and EQ paths perform no render-time table/coefficient regeneration
- Ladder LP uses independent resonance and single Hardness saturation
- Product Core, standalone worklet if retained, Pad 1/2, presets, and native/WASM agree
- B Hz Offset and main Filter Resonance are available through the existing modulation-destination model
- parameter count is 58 and output trim remains last
- all safety, aliasing, memory, and CPU gates pass
- Saturated Drift retains its approximate identity and Buchla Pluck is rebuilt without PM

When an implementation detail is uncertain, preserve the existing Pad integration and signal flow, choose the smallest measured solution, and do not add a third oscillator or an interaction system.
