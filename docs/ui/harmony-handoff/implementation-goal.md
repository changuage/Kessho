# Goal: ship the Harmony, Brain, Synth and Drums redesign

> Implementation goal, 25 November 2026. It turns the accepted specs into ordered milestones that can each be shipped. The specs govern behaviour and UI; this document governs order, scope per change, and when each milestone counts as done.
>
> Specs: [Harmony, Random and Brain](../harmony-random-brain-design.md) · [UI integration](../harmony-ui-integration.md) · [Groove generator](kessho-groove-generator.md) · [Wider redesign proposal](kessho-wider-redesign-proposal.md) · [Players and printing](kessho-players-and-printing-scope.md) · [Handoff index](README.md)

## Outcome

Kessho ships with:

- **Harmony:** one Harmony pipeline (Engine → Live layer → Parts), with Brain as the single live layer.
- **Chords:** one inline Chord value, with Follow / Fixed.
- **Synth:** six uniform sequencer slots with Part and Overview views and one lane model.
- **Drums:** on the same sequencer shell, with Groove replacing Scatter.
- **Global:** one Harmony surface with drawers.

Everything these replace is deleted in the same change that replaces it.

**Done means all of these hold:**

1. Every acceptance check in the Harmony design (1–21), the Groove spec (1–10) and the UI integration doc passes. Each one has an automated test, or a recorded manual check where automation is impossible (device audio, latency).
2. `npm run core:product:ci` is green on every milestone's PR. So are the native suites each milestone touches, and the web, macOS and iOS smoke gates already in the repo.
3. **Only old-preset decoders remain** of the superseded code. Searches for the following find nothing else:
   - **Harmony and Synth:** the Harmony takeover route, the morph read-only banner, the Synth Simple view, the chord bank, the Play chord sequencer and the uncalled generated recorder.
   - **Drums:** Scatter, `MorphSlider` and `DragNumber`.
4. **No regressions:** CPU and realtime-safety budgets hold (`core:product:cpu`, `core:product:realtime-safety`), and the redesigned pages follow the "Avoid generic UI patterns" rules.

## Ground rules for every milestone

- **One milestone, one PR,** on its own branch from `main`, with a short PR description linking the spec sections it implements.
- **Delete what you replace in the same PR.** No feature flags, parallel paths or temporary compatibility shims; `core:product:no-temporary-runtime-compat` and `core:product:legacy-boundary` must stay green.
- **Engine changes go through the generated bindings.** Change the native interface through `core:product:generate`, and keep `core:product:abi` (`ProductAbiLayoutTests`) and `core:product:schema` green. Bump the preset behaviour version only where the specs say so (per-slot randomness).
- **Sliders:** every new or moved slider uses the shared slider architecture; `test:slider-system` stays green.
- **Visual rules:** UI follows Kessho tokens and the "Avoid generic UI patterns" checklist. Review screenshots at 380px and desktop width for every UI PR.
- **Audio thread:** no allocation, sorting or analysis there. Resolve chords, routes and suggestions on musical events.
- **Specs stay true:** if implementation forces a decision the specs don't cover, update the spec in the same PR.

## Milestones

Order follows the design doc's phases, with the printer repair folded into the chord model (they share the per-step payload). Drums come after the shared shell exists.

### M0 · Land the in-progress host-transport work *(prerequisite)*

Landed on `main` on 25 November 2026 (commits `c8664160`, `c728a463`, `56732f75`). The host-synced transport changes for the Audio Unit were:

- **Engine:** fractional beats per bar and host position, in `ProductTransport`, `KesshoProductEngine`, `KesshoProductApi`, `KesshoProductCore.h` and `JourneyMorphClock`.
- **New targets:** `macos/KesshoAudioUnit/`.
- **Visualizer:** `TransportVisualizerPage` and `transportRandom.ts`.

These files are on the path of M3, M6, M7 and M9.

- [x] Commit or merge that work to `main` (or explicitly shelve it) before M2 starts.
- [x] Merge the docs branch `docs/harmony-redesign-decisions` so specs and code live together.

### M1 · Fixtures and baselines

Capture the "before" picture that later milestones are measured against.

- [x] **Event statistics:** `npm run test:m1-arrangement-statistics`. A TS exporter turns String Waves and three variants (chords only, notes only, beat clock) into engine snapshots. The native `ProductArrangementStatisticsTests` renders eight phrases with no audio and compares events per phrase, onset histogram, velocity, pitch, voices per chord and voice-entry spread against `cpp/KesshoCore/tests/fixtures/arrangement-statistics.json`, with tolerances meant for M3. `KESSHO_M1_RECORD=1` re-records. The test was confirmed to fail on drift.
- [x] **CPU baseline:** [m1-cpu-baseline.md](m1-cpu-baseline.md). Covers native budget scenarios and refreshed browser CPU evidence; `core:product:cpu`, `cpu-scenarios` and `module-cpu` all pass.
- [x] **Screenshot baselines:** [m1-baselines/](m1-baselines/index.md). Global, Synth (Simple, Detail, Overview) and Drums (Overview, Detail, Scatter) at 390 and 1280 px; regenerate with `node scripts/m1/capture-ui-baselines.mjs`.
- [x] **Preset-library audit:** [m1-preset-audit.md](m1-preset-audit.md), via `node scripts/m1/audit-presets.mjs`. Only String Waves uses Random Chords and Notes. No repo preset uses authored chords, active Scatter, Walker or Orbit. Four presets use key drift.

**Done when** the fixtures are committed and a script reports any drift from them.

**Caveats:**

- The cloud and user preset library isn't available offline; audit it before declaring migration parity.
- The baselines were measured on a working tree that included the uncommitted M0 host-transport changes. Re-run `test:m1-arrangement-statistics` and `core:product:cpu` once M0 lands.

### M2 · Chord model and printer repair

*Spec: design doc Chords; Players and printing; acceptance 16–18, 5, 10.*

- [ ] **Chord value:** the `Chord` and `ChordNote` types, one TS encoder and one native decoder and validator. A single native resolver serves live, scheduled and printed chords.
- [ ] **Notes lane:** Chord, Harmony or Rest cells; per-lane Advance (Hits / Steps); lane articulation with per-cell override.
- [ ] **Progression and Palette:** inline progression events (Auto or Chord, 1/2/4/8 bars, 64 events); a copy-only Palette (16).
- [ ] **Printer repair** (the four confirmed findings):
  - Per-note destination and offset survive.
  - Dense attacks fit.
  - Morph and Distance are no longer cleared.
  - Printing writes the chosen variation, not the whole bank.
  - Plus: a fixed-window capture policy, the Random and Chords producer taps, and acknowledged commit with retry and Undo.
- [ ] **Delete:**
  - The chord bank, slot strip, Manage Pool and Make Unique.
  - The Play chord sub-sequencer (`synthPlayConfigs`, `SeqChordChoiceLane`, `SeqChordInteractionBay`, `SeqDraftControls`, `SeqLiveChordControls`).
  - Draft and Capture.
  - The `SharedHarmonyChord` bookkeeping, the Auto playback behaviour and all legacy chord decoders.
  - The uncalled generated recorder.

**Done when** acceptance 5, 10 and 16–18 pass, and `core:product:harmony`, `test:generated-sequencer-capture`, `ProductSequencerTests` and `ProductHarmonyTests` are green.

### M3 · Six uniform slots and per-slot generators

*Spec: design doc Decisions (Slots, Randomness); acceptance 1–4.*

- [ ] **Slots:** six uniform slots in native state, the snapshot and persistence; Random added to the type control.
- [ ] **Generators:** Chords and Notes become per-slot instances with their existing algorithms. Each slot's random stream is seeded from the seed window plus the slot's stable part ID; this is the one preset behaviour-version bump.
- [ ] **Delete:** the singleton arrangement state (`ProductArrangementState` generator fields, shared `rng_state`) and the Synth Simple view.

**Done when** acceptance 1–4 pass against the M1 statistics fixtures, and `core:product:determinism` and `core:product:sequencer-lane-count-guards` are green.

### M4 · Synth Part, Overview and the lane model

*Spec: UI integration "Synth"; design doc Subsequencers; acceptance 11–13, 19, 21.*

- [ ] **Views:** Part and Overview, with `SequencerViewMode` reduced to these two.
- [ ] **Overview:** rows shaped by type (A–D only on Steps; trigger toggles for Steps and step-grid Walker; activity plus a macro for generators); the chain rail; a "+N" count for routed Walker layers.
- [ ] **Lanes:** a uniform lane setting row (length, direction, advance). Probability, Ratchet and trig-condition lanes under "Add or turn on a lane". Collapse is separate from Turn lane off.
- [ ] **Walker:** the trigger-mode setting (gesture hold, step grid, auto clock); the step grid keeps Trigger and Probability visible; per-layer sound routing.
- [ ] **Sliders:** inventory every slider on the redesigned pages (acceptance 11–13).

**Done when** acceptance 11–13, 19 and 21 pass and screenshots at 380px and desktop width pass review. `core:product:sequencer-ui`, `core:product:sequencer-ui-lane-count` and `test:slider-system` must be green.

### M5 · Global Harmony surface

*Spec: UI integration "Global"; acceptance 5–6 (display parts).*

- [ ] **Resting surface:** the circle, progression strip, Key motion (Held / Drift), the Palette row and Brain pads (wired in M6; disabled until then).
- [ ] **Drawers:** Arrange, Voicing (the shared Chord editor from M2) and Generate.
- [ ] **Delete:** the Simple / Detail / Overview workspace tabs; rename "Free walk" to Key drift throughout the UI.

**Done when** the surface fits 380px and desktop width, the drawers edit the M2 progression model, and the M1 screenshot set is updated.

### M6 · Live layer (Brain)

*Spec: design doc One Harmony pipeline, Brain availability; acceptance 6–7, 14–15.*

- [ ] **Native live-layer state:** root offset, destination, latch, and the participating-part mask, all applied once to participating parts.
- [ ] **Availability:** `liveAvailable` and `authoringAvailable` replace `manualControlAvailable` / `morphLocked`.
- [ ] **Suggestions:** one suggestion engine. The pads show its top three and freeze while engaged; All moves shows every in-scale destination with Z–M.
- [ ] **Gestures:** latch by default, Shift or long-press for momentary; Return; Keep (endpoint-only).
- [ ] **Delete:** the Harmony takeover route and the morph read-only banner. Keyboard scopes collapse to `harmony-live` and `chord-entry`.

**Done when** acceptance 6–7 and 14–15 pass, along with `core:product:harmony`, `core:product:live-note-contract` and the live-note latency checks.

### M7 · Journey handoff

*Spec: design doc Movement ownership; acceptance 7–8.*

- [ ] Journey releases the live layer and suspends key drift at the transition boundary. Pause, dwell and stop restore availability with no stale override.
- [ ] Resuming continues from the drifted key, with no stale-key jump, no duplicated drift and no blend reset.

**Done when** acceptance 7–8 pass, along with `ProductJourneyScheduleTests` and `core:product:background-audio`.

### M8 · Drums on the shared shell, with Groove

*Spec: Groove generator; wider proposal §1; Groove acceptance 1–10.*

- [ ] **Kit parts:** drum parts become kits in the shared Part / Overview shell, with one Steps row per voice; the 6 voice-targeting lanes migrate to that model.
- [ ] **Groove engine:** a native generator per drum part (groove maps as data; stateless per-role decisions), with per-role Style and macros and the kit macros.
- [ ] **Loop:** a ring holding the last four bars, Release, and Print loop.
- [ ] **Printing:** Performance, Loop and Pattern prints through the M2 capture and commit path.
- [ ] **UI:** the cleaner layout from the prototype; Kessho tokens; no generic UI patterns.
- [ ] **Delete:** Scatter (`src/ui/drums/scatter/*`, `ProductScatterRuntime.cpp`, `ProductScatterRuntimeState.h`, `ProductScatterTests` → replaced by Groove tests), the separate drum sequencer UI (`SeqLane`, `SeqOverview`, `SeqSimple`, `SeqMiniOverview`, `SeqSparkline`), `MorphSlider` and `DragNumber`.

**Done when** Groove acceptance 1–10 pass and `core:product:sequencer-routing-smoke` (drum cases) is green. `core:product:drum-presets` and `test:drum-sequencer-transport-policy` stay green, and `test:drum-scatter-sequencer` is replaced by the Groove suite.

### M9 · Wider redesign *(after M1–M8; each item its own PR)*

*Spec: wider redesign proposal §2–7.*

- [ ] **Transport:** one master clock, with timing set in each part's header and a Global summary.
- [ ] **Journey and macros:** Journey as a progression of presets; one macro concept shared by Overview and Snowflake.
- [ ] **Sound pages:** a resting surface plus drawers on Synth sound, Granular, Reverb, Delay, Dynamics and Earth.
- [ ] **Input:** one keyboard-scope model (pads and MIDI learn).
- [ ] **Visualizer:** shared controls, keeping its own model.
- [ ] **Routing:** the mute-group indicator.
- [ ] **Perform bar:** note FX and sound FX on the live layer. Discussed but not yet in a spec, so it needs a spec section before it can be built.

## Order and parallel work

```text
M0 ─► M1 ─► M2 ─► M3 ─► M4 ─► M8 ─► M9
              │                 
              └─► M5 ─► M6 ─► M7
```

- **M2 → M3 → M4 run in sequence.** All three rework `SynthPage.tsx` (about 10,800 lines), `state.ts` and the sequencer snapshot; parallel branches would conflict constantly.
- **M5 can run alongside M3–M4.** It lives on the Global page and needs only M2's progression and Chord editor.
- **M6 needs M2 and M5. M7 needs M6. M8 needs the M4 shell.**

## Risks to watch

- **`SynthPage.tsx` size.** Extract Part, Overview and the lane components as M4 lands, so later milestones touch small files.
- **Native interface churn.** M2, M3, M6 and M8 all change the native interface. Regenerate bindings and run `core:product:abi` on every PR, then the macOS and iOS smoke gates before merging.
- **Preset parity.** Authored chords have none in use, so there's no migration. Generators change exact notes once, in M3, so compare by statistics and by ear, not exact events. Measure Scatter's removal against the M1 audit.
- **CPU.** Suggestion ranking, voicing search and Groove decisions run per musical event, not per frame. Re-run `core:product:cpu` and `core:product:page-cpu-before-after` on M4, M6 and M8.
- **Web/native parity.** Every engine change must be exercised on web (wasm), macOS and iOS before its milestone is done.

## Progress

| Milestone | Status | PR |
| --- | --- | --- |
| M0 Host transport landed | Done on `main` | — |
| M1 Fixtures and baselines | Done on `main` | — |
| M2 Chord model and printer | Designed ([m2-chord-model-design.md](m2-chord-model-design.md)); ready to start | — |
| M3 Six slots, per-slot generators | Not started | — |
| M4 Part, Overview, lane model | Not started | — |
| M5 Global Harmony surface | Not started | — |
| M6 Live layer (Brain) | Not started | — |
| M7 Journey handoff | Not started | — |
| M8 Drums and Groove | Not started | — |
| M9 Wider redesign | Not started | — |
