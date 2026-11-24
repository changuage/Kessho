# Kessho — extending the Harmony redesign to the rest of the instrument

> Proposal, 24 November 2026. No application changes. Subordinate to [Harmony, Random and Brain](../harmony-random-brain-design.md) and [UI integration](../harmony-ui-integration.md); where this document and those specs differ, they govern. [Handoff index](README.md).

The Harmony redesign established an interaction language. This proposal applies it to the other pages, starting where the code already contains two versions of the same idea. It changes how pages are organized and how controls behave. It does not change sound engines, their parameter sets, the set of pages or the visual theme.

## The language to carry over

1. **The engine runs; hands are a temporary layer.** Everything plays on its own. A hands-on change sits on top as a live layer with Return (drop it) and Keep (make it the new baseline, only where writing to a preset is allowed).
2. **One value type per concept, stored where it is used.** Reuse means copying, never referencing.
3. **A resting surface plus drawers.** The few controls people play live at rest. Detail opens in one drawer or panel at a time. No tab modes that hide the live surface.
4. **Part plus Overview.** Part edits one thing in depth. Overview shows everything as macros, and each row shows only what its type uses.
5. **One lane model.** Every lane has length, direction and advance (Hits / Steps). Collapsing never stops a lane; turning it off is explicit.
6. **One control and input system.** The shared slider and Mod A/B for parameters, and one keyboard-scope arbiter with a visible scope label.
7. **Delete what you replace,** in the same change. Keep only preset decoders.

## Proposals, in priority order

### 1. Drums use the same sequencer as Synth

**Today.** Drums run a parallel sequencer UI: `SeqLane`, `SeqOverview`, `SeqSimple`, `SeqMiniOverview`, `SeqSparkline` and `scatter/` under `src/ui/drums` (about 8,400 lines including the page). It has its own Overview / Detail / Scatter switch, plus two custom controls, `MorphSlider` and `DragNumber`, in place of the shared slider. The engine already shares more than the UI does: both families use the same sublane traversal (`subLaneStepForField`) and the same audibility resolver (`resolveSequencerLaneAudibility`).

**Proposal.**

- **Parts:** a drum part is a kit in the same Part / Overview shell as Synth, with the same lane model, variation rail, mute / solo, chain and Print / Record capture. In Steps it shows one row per voice.
- **Scatter is replaced by Groove.** Groove is a generative drum player type beside Steps, Walker and Orbit. It uses weighted groove maps across four roles (Anchor, Backbeat, Pulse, Color), per-role Density that only adds hits, bounded Variation with Memory, and Fill. It never re-pitches drums. It prints either the exact performance or a probability pattern into Steps. Scatter's UI and native runtime are deleted. See the [Groove spec](kessho-groove-generator.md) and [prototype](prototypes/kessho-groove.html).
- **Voice cards:** they become the sound side of the page, as the sound pane is on Synth.
- **Controls:** `MorphSlider` and `DragNumber` are replaced by the shared slider with the right adapter.

**Payoff.** This is the largest deletion in the proposal, and it makes drum and synth sequencing behave the same.

**Prerequisite.** Harmony phases 2–4 build the shared sequencer shell this reuses.

### 2. One transport, timing set per part

**Today.** Global exposes four clock groups: Primary Clock, Harmony / Pad Clock, Synth Euclid Clock and Drum Euclid Clock. Each has a join or apply setting. In state these are one primary transport (`transportPrimaryClock`, `transportBarsPerPhrase`, `transportBeatsPerBar`) plus a clock source and policy for each family:

| Family | Clock source | Policy |
| --- | --- | --- |
| Harmony | `harmonyClockSource` | `harmonySyncPolicy` |
| Random Notes | `leadRandomClockSource` | `leadRandomSyncPolicy` |
| Synth sequencer | `synthEuclidClockSource` | `synthEuclidJoinPolicy` |
| Drum sequencer | `drumEuclidClockSource` | `drumEuclidJoinPolicy` |

The sources are `localPhrase`, `globalPhrase`, `localBeat` and `globalBeat`. The policies are `free`, `nextPhrase` and `restartNow` for phrase clocks, and `grid` and `bar` for sequencers.

**Proposal.** Keep the model, change who owns it.

- **One master transport** on Global: BPM, beats per bar, bars per phrase, and which domain is primary.
- **Timing in each part's header:** each part and Harmony shows a compact `Timing · Master` (or `· Own phrase`, `· Harmony`) control. It holds that part's clock source and join policy, like Random Chords' `Timing · Harmony`.
- **Per slot, not per family:** with six uniform slots, per-family settings become per-slot ones. Random Notes already works this way.
- **Global summary:** Global keeps one clock summary listing only the parts that don't follow the master.

**Preserve.** Phrase clocks in seconds, every join and sync policy, and their behavior when presets load.

### 3. Journey becomes a progression of presets

**Today.** Journey is `DiamondJourneyUI` (about 4,300 lines) inside `JourneyModeView` (about 1,200). Snowflake (`SnowflakeUI`, about 2,300 lines, plus `snowflakeV2`) is a separate performance surface with its own "arm macros" (`computeArmMacros`).

**Proposal.**

- **Same structure as Harmony:** Journey is an ordered list of events with durations, moving along a route. Reuse the progression strip and Arrange drawer: each event is a preset plus its transition length and hold.
- **Engine and live layer:** Journey is the engine of preset motion, and a manual blend is the live layer. This is the availability rule already decided: live at any held blend, writing presets only at endpoints.
- **Macros:** Snowflake's arm macros and Overview's per-part macros become one macro concept. A macro is a named control mapped to a part's or engine group's main parameters through the shared slider. Snowflake then becomes a performance view of those macros, not a second macro system.

**Prerequisite.** Build it alongside the Global Harmony surface (phase 5), which creates the strip and drawer components.

### 4. Sound pages: resting surface plus drawers

This covers Synth sound, Granular, Reverb, Delay, Dynamics and Earth.

- **At rest:** each page shows its 4–8 most-played controls, the same ones its macros expose.
- **Drawers:** engine detail, routing and modulation move into drawers in the existing card grammar. No permanent explanatory panels.
- **Already compliant:** Granular, Reverb and Delay already use the shared slider (61, 34 and 36 uses). Their work is mostly regrouping.
- **Dynamics:** its visualizers (`DynamicsVisualizers.tsx`, about 1,900 lines) follow the CPU rule. They stop drawing while their drawer is closed or the page is hidden, and they redraw from events rather than every frame.
- **Earth:** it already splits engine controls from the scene mixer, so it maps directly onto this layout.

### 5. Input: one keyboard-scope model

The Harmony spec reduces keyboard scopes to `harmony-live` and `chord-entry`. Extend the same rule to drum pads and MIDI learn, and add one scope per surface: a pad scope on Drums and a learn scope while MIDI learn is armed. The existing `useKeyboardScope` arbitrates, and each surface shows one visible scope label. QWERTY and MIDI notes route by the same priority.

### 6. Visualizer: share the interaction language, keep its own model

**Today.** The Transport visualizer has its own assignment system (`transportAssignments.ts`: compile, evaluate and smoothing). It maps audio signals and telemetry onto the visualizer's own controls (`TransportControlKey`), not onto audio parameters, and it uses no shared sliders.

**Proposal.** Because it drives visuals only, it should stay a separate model; making it Mod A/B would mix audio and visual modulation. Do share the surface, though:

- **Controls:** use the shared slider for its controls.
- **Context control:** put assignments behind the same context-control pattern parameters use.
- **Layout:** follow the resting-surface-plus-drawers layout.

**Coordinate first.** This page has uncommitted work in progress (`TransportVisualizerPage.tsx`, `transportRandom.ts`). Land or coordinate with that before restructuring it.

### 7. Routing: make two mute scopes visible, don't merge them

Sequencer mute and solo are per-part flags (for example `synthEuclid1Enabled` and `synthEuclid1Solo`, resolved by `resolveSequencerLaneAudibility`). Routing mute groups (`routingMuteGroups`) act on the audio routing. These are different scopes and should stay separate. Overview should show when a part's destination is muted by a routing group, so a silent part is never a mystery. The Routing page's mute groups can then link back to the parts they affect.

## Sequencing with the Harmony phases

| Harmony phase | Unlocks | Wider work |
| --- | --- | --- |
| 2–4: chord model, per-slot generators, Part / Overview | Shared sequencer shell and lane model | **Drums** (1), then **Input** scopes (5) for pads |
| 3: six uniform slots | Per-slot timing ownership | **Transport** (2) |
| 5: Global Harmony surface | Strip, drawer and Arrange components | **Journey and macros** (3) |
| Any time after the slider inventory | — | **Sound pages** (4), **Visualizer** surface (6), **Routing** indicator (7) |

Each item deletes what it replaces in the same change: the drum sequencer UI and custom controls; the four Global clock cards (replaced by the master transport and a summary); the separate Journey editor and Snowflake's own macro model; and any per-page layout that duplicates the drawer grammar.

## Acceptance

1. **Drums:** drum and synth parts use the same Part / Overview components, lane model and capture path. Groove is selectable as a player type and meets its own acceptance checks. No Scatter code, `MorphSlider` or `DragNumber` remains.
2. **Transport:** every part and Harmony shows its timing relationship in its header. Changing one part's join policy affects only that part. Existing presets load with the same clock sources and policies.
3. **Journey:** a Journey is edited with the same strip and Arrange drawer as the Harmony progression. A manual blend behaves as the live layer and Journey as the engine, under the existing availability rules.
4. **Macros:** one macro concept serves Overview and the Snowflake performance view.
5. **Sound pages:** each shows a resting set of 4–8 controls with drawers for the rest. Collapsed visualizers do no drawing work.
6. **Input:** one visible scope label at a time across Harmony, chord entry, drum pads and MIDI learn.
7. **Visualizer:** it uses the shared slider and context control while keeping its own assignment model.
8. **Routing:** Overview shows when a routing mute group silences a part.

## Open questions

- **Drums Overview density:** do drum parts appear in Synth's Overview, or does Drums keep its own Overview? The same component either way.
- **Drum part count:** how many drum parts should exist under the shared slot model?
- **Snowflake's role:** should it remain its own page once it is a macro performance view, or become a mode of Overview?
- **Default resting controls:** which controls rest on each sound page should be decided with the presets that use them most.
