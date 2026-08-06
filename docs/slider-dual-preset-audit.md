# Slider, dual-range, and preset audit

**Audit date:** 2026-07-30  
**Scope:** active, user-interactive slider controls in `src/ui` and `src/app`.

> Implementation follow-up: the gaps in this baseline audit were re-audited and resolved in `docs/slider-dual-preset-reaudit.md`.

## Result at a glance

The shared application slider path is dual-capable and its dual range/mode metadata round-trips through state presets. The UI is not yet uniformly on that path, however. Several native or feature-specific sliders operate correctly as single values, while four families have material gaps:

1. Visualizer dual-range endpoints are saved, but their slider modes are discarded on save/load.
2. Scatter and legacy simple-drum slider state is runtime-only and is not in the preset schema.
3. Delay B tape-head level/pan sliders bypass the shared dual renderer even though Product Core has range targets for them.
4. Eight Product Core synth/arrangement sliders have no range target, so they fall back to single mode in the Product runtime.

The remaining single sliders are mostly intentional scalar controls (transport, harmony, sequencer policy, audition, or preset-authoring values). They operate and are saved where their owning architecture supports persistence. Slider-like vertical-drag numeric controls are included below as a separate architecture because they are user-interactive parameter controls even though they are not native range inputs.

## Method and inventory

- Searched active JSX/TSX for shared `<Slider>`, direct `<SliderPrimitive>`, native `input type="range"`, and feature-specific/custom rails.
- Followed each control's change handler into React/state/runtime updates.
- Traced state, metadata, component-content, journey, visualizer, Lead4op FM, and sequencer preset codecs for save and restore paths.
- Checked Product Core range-target resolution and the shared `Slider` gating logic.
- Ran the existing slider, preset, sequencer, and Product Core regression scripts; all passed.

Static inventory of the shared surface:

- 306 `<Slider>` instances in `src/ui`.
- 84 of those use dynamic parameter keys (so a literal-key count under-reports the runtime surface).
- 194 literal `sliderProps(...)` call sites, representing 157 unique literal keys.
- Product Core exposes range targets for 143 of those 157 literal keys. The reference runtime exposes the shared range path for all of them.

The unused `ParamSlider` helper in `src/ui/earth/components/EarthControls.tsx` has no live call sites and is excluded from the active-control audit.

## Architecture-by-architecture findings

### 1. Shared application `Slider` → `DualSlider`

**Implementation:** `src/app/AppControls.tsx:19-189`, `src/App.tsx:1398-1432`, `src/ui/DualSlider.tsx`, `src/ui/sliderSystem/SliderPrimitive.tsx`.

- The shared wrapper renders `DualSlider` when it receives mode-cycle and dual-range callbacks. `SINGLE_ONLY_SLIDER_KEYS` is currently empty.
- This path covers the regular sliders on Synth, Drum voice/morph, Granular, Reverb, Dynamics, Delay A/granular-delay, and the other pages that inject `Slider` plus `sliderProps`; their page-specific labels/formatters do not change the renderer architecture.
- Water/insect keys are walk-only: a saved `sampleHold` mode is normalized to `walk` for those keys.
- Transport clock keys are deliberately single and commit-on-release (`isTransportClockStateKey`).
- Product Core additionally gates dual mode through `isCoreProductRangeKeySupported`; the reference runtime returns true for the shared range path.
- Mapped controls operate through the Product Core range-event targets and are saved as normal state values plus `dualRanges`/`sliderModes`. Load applies both the state and the dual metadata (`src/ui/useSavedPresetLoadRuntimeSurface.ts:144-165`).

#### The 14 literal shared keys without Product Core range targets

| Group | Keys | Audit result |
|---|---|---|
| Intentional transport/scalar policy | `phraseLength`, `sequencerMasterBPM`, `transportBarsPerPhrase`, `transportBeatsPerBar` | Operate and persist as values; intentionally rendered single/commit-on-release by transport policy. |
| Global controls with no Product range target | `randomWalkSpeed`, `randomness` | Operate and persist as values, but Product Core renders them single because no generic range target exists. |
| Synth/arrangement modulation gaps | `synthHold`, `pad2Hold`, `lead1Hold`, `lead2Hold`, `padMorphSpeed`, `pad2MorphSpeed`, `lead1MorphSpeed`, `lead2MorphSpeed` | Values operate and save/load; Product Core consumes the scalar values, but `RANGE_KEY_TARGETS` has no dual target, so these are single in Product Core. |

This is a Product Core range-target gap, not a missing state codec. The hold values are consumed by the sequencer-hold path and the morph-speed values by source morph automation, but neither family is registered in `src/audio/coreProductEvents.ts:RANGE_KEY_TARGETS`.

### 2. FX Routing Matrix and Active Earth Matrix custom dual rails

**UI:** `src/ui/global/RoutingMatrix.tsx:1003-1258`, `src/ui/earth/components/ActiveEarthMatrix.tsx:1183-1585`, and the Earth card adapter in `src/ui/earth/EarthPage.tsx:714-752`.

- The FX Routing Matrix renders custom cells rather than mounting `DualSlider`, but it consumes `sliderProps`, displays dual min/max edges, supports pointer/keyboard movement, and cycles modes on double-click/long-press. It routes range changes through the same `onDualRangeChange` callback as the shared slider.
- Active Earth Matrix uses the same custom edge/indicator model and quantizes ranges through the Earth parameter schema; Water and Insects cards use a direct `DualSlider` adapter for the same state.
- All of these controls write normal `SliderState` values and the shared `dualRanges`/`sliderModes` metadata. State preset load restores both the scalar state and the range/mode metadata; Product runtime range targets are the same targets used by the shared path.

**Status:** complete custom dual implementations; operate and round-trip. They are architecture-specific renderers, not functional gaps.

### 3. Delay B tape-head native sliders

**Controls:** `delayBTapeHead1Level` … `delayBTapeHead4Level` and `delayBTapeHead1Pan` … `delayBTapeHead4Pan`.  
**UI:** `src/ui/delay/DelayPage.tsx:533-578`.

- These eight native range inputs call `onParamChange` directly and update the engine correctly.
- They are registered state parameters; factory delay presets and normal state presets save/load their scalar values.
- Product Core already has tape-head range targets (`src/audio/coreProductEvents.ts` around the delay target entries), so this is a renderer/metadata integration gap rather than an audio-target gap.
- They do not receive `sliderProps`, do not expose walk/sample-hold mode, and do not write `dualRanges`/`sliderModes`.

**Status:** operating single sliders; values persist; not dual-capable in the current UI architecture.

### 4. Euclidean lane endpoint ranges

**UI:** `src/ui/drums/SeqLane.tsx:406-478`.

- Pitch `noteRange` presents separate `Low` and `High` `SliderPrimitive mode="single"` controls. Synth lanes bind these to `synthEuclid1..4NoteMin/Max`; drum pitch note-range UI is hidden by `DrumPage`.
- Expression, morph, and distance `valueMode="range"` present two native endpoint sliders and clamp the ordering on every change.
- The endpoint values operate in the sequencer runtime and are preserved in state/metadata: pitch min/max are registry state values; sub-lane ranges are carried by `SubLaneState.rangeMin/rangeMax` and step override `expressionRanges`, `morphRanges`, and `distanceRanges`.
- `src/presets/sequencerContent.ts` and `src/ui/usePresetSequencerRestore.ts` serialize and restore those values.

**Status:** true endpoint semantics and full preset round-trip, but implemented as paired controls rather than the shared `DualSlider` primitive. This is a consistency/CPU-work opportunity, not a current functional failure.

### 5. Euclidean swing, evolution, write-offset, and dice controls

**UI:** native controls in `src/ui/drums/DrumPage.tsx` and `src/ui/synth/SynthPage.tsx` around the swing/evolution/write-offset blocks; direct `SliderPrimitive` dice intensity in the same blocks.

- Swing, evolution, and write offset update the active lane configuration and are saved/restored through `drumSwings`/`synthSwings` and `drumEvolveConfigs`/`synthEvolveConfigs` metadata. Product restore is wired through `usePresetSequencerRestore`.
- These are scalar sequencer policy/action controls, not continuous modulation ranges, so single mode is appropriate.
- Dice intensity is local action state (`useState(0.5)`) and is not included in the state preset metadata. It operates for the current session only.

**Status:** operation and persistence are correct for swing/evolution/write offset; dice intensity is an explicit preset-persistence gap if action settings are expected to be recalled.

### 6. Scatter and legacy simple-drum custom rails

**UI:** `src/ui/drums/scatter/ScatterPage.tsx:70-323`, `src/ui/drums/SeqSimple.tsx:240-300`; runtime: `src/app/useDrumScatterRuntimeState.ts:38-145`.

- Trigger and Burst use custom pointer/touch vertical rails. Double-click/long-press toggles a walk-enabled mode and derives `randomWalk` from the two chance values. This is a custom single/walk architecture, not the shared two-handle `DualSlider`.
- The legacy simple view exposes one Rate slider and seven per-voice Density sliders. State is converted to `SeqScatterState` and sent to Product Core scatter events; live operation is correct.
- `SeqScatterState` and the simple-state ref are runtime/UI state, not `SliderState` fields, registry keys, or preset metadata. Loading a normal state preset does not restore them; simple Rate is effectively lost (the conversion default is used) and scatter chance/density/walk settings start from runtime defaults.

**Status:** operating custom slider architecture; no preset save/load. This is the highest functional persistence gap outside the visualizer.

### 7. Diamond Journey custom dual rails

**UI:** `src/ui/DiamondJourneyUI.tsx:2019-2045` and `2439-2465`; codec: `src/presets/journeyPresetCodec.ts:18-43,105-152`.

- Phrase length and morph duration start as single native sliders and switch to `JourneyDualRangeRail` on double-click/long-press.
- Endpoint handlers clamp min/max and keep the single-mode value coherent when dual mode is disabled.
- `phraseLengthMax` and `morphDurationMax` are encoded/decoded by the journey preset codec and consumed by Product background journey compilation via range resolution.

**Status:** complete custom dual implementation; operates and round-trips through journey presets.

### 8. Harmony and chord-content sliders

**Controls:** `tension` and manual selected spread in `src/ui/harmony/HarmonyEnginePanel.tsx`; `cofDriftRate`/`cofDriftRange` in `src/ui/harmony/HarmonyWorkspace.tsx`; chord-draft semantic spread in `src/ui/synth/chord/SeqDraftControls.tsx`.

- These sliders update harmony state or chord-content objects and are scalar semantic controls (tension, drift rate/range, manual voicing spread, chord spread), not modulation endpoint pairs.
- `tension`, `cofDriftRate`, `cofDriftRange`, and `manualHarmonyControl` are registered state/content values and are included in normal preset serialization. Chord draft spread travels with the chord/harmony content object.
- They do not have Product Core generic range targets and are intentionally single in the current architecture.

**Status:** operate and save/load; no dual requirement implied by their semantics.

### 9. Global morph and auto-cycle controls

**UI:** `src/ui/global/GlobalPage.tsx:1192-1271`.

- `Morph Position` operates the A/B state interpolation slider.
- `Play Phrases` and `Morph Phrases` operate the auto-cycle timing.
- These are session/morph-controller settings held in local component state, not normal `SliderState` or preset metadata. They are not restored by a normal preset load.

**Status:** operate; intentionally ephemeral controller state, not preset-persistent.

### 10. Visualizer controls and macros

**UI:** `src/ui/visualizer/VisualizerControlRow.tsx`, `src/ui/visualizer/ReactiveVisualizerPage.tsx:1359-1380`, `src/ui/visualizer/VisualizerMacroPanels.tsx`.

- The 44 numeric visualizer controls are rendered through a dedicated range-aware row. They support `single`, `walk`, and `sampleHold` modes and use `reactiveRanges` for endpoints.
- `reactiveRanges` is saved and restored in `VisualizerPresetData`; the controls themselves therefore operate and their endpoint values round-trip.
- **Bug:** `vizSliderModes` is local state and is omitted from `VisualizerPresetData` and the save object (`src/ui/visualizer/visualizerPresetStore.ts:19-30`, `src/ui/visualizer/ReactiveVisualizerPage.tsx:987-1008`). Load explicitly resets it to `{}` (`ReactiveVisualizerPage.tsx:1010-1027`). A saved walk/sample-hold range therefore reloads with its numeric range but in single mode, so its automation is inactive until the user cycles the mode again.
- Reaction sliders (`Reactivity`, `Afterglow`, `Morph Depth`) and scene/layer macro sliders are single scalar controls and are saved in `reaction`, `performanceMacros`, and `layerMacros`.

**Status:** dual endpoints operate and save; dual mode persistence is broken. This is the clearest preset round-trip defect.

### 11. Anchor Walker and Orbit sequencer-face sliders

**UI:** `src/ui/sequencer/AnchorWalkerSequencerBody.tsx:338-348`, `src/ui/sequencer/OrbitSequencerBody.tsx:174-184,267-290,391-428`.

- Anchor Walker `Spread` and Orbit `Bars`, `Speed Offset`, `Even Offset`, `Free Offset`, `Velocity`, `Prob`, and `Radius` are scalar sequencer-face settings.
- They update the active slot in `synthSequencerFaces`; Product snapshot construction consumes that face state (`src/audio/coreProductSnapshot.ts:544-559`).
- `synthSequencerFaces` is a registered L1 state key (`src/presets/ParamRegistry.ts:901`) and is normalized by the state codec, so these settings save/load with state presets.

**Status:** operate and persist; single mode is appropriate because these are scalar face/config fields, not endpoint ranges.

### 12. Lead4op FM editor sliders

**UI:** `src/ui/synth/Lead4opFMEditorOverlay.tsx:354` (`NumberControl`) and its operator/envelope/filter/tone usages.

- The editor exposes many scalar engine-authoring sliders (envelopes, pitch, gain, tone, LFO, filter, and operator parameters). They use `SliderPrimitive mode="single"` plus numeric entry.
- They are saved/loaded through the custom Lead4op FM preset store (`saveUserLead4opFMPreset` / `loadLead4opFMPreset`) and applied back to the editor draft.
- Sequence audition BPM (`Lead4opFMEditorOverlay.tsx` around line 867) is local audition state and is not saved.

**Status:** authored engine values persist correctly; single mode is intentional. Audition BPM is ephemeral.

### 13. Vertical-drag numeric controls (`DragNumber`)

**Implementation:** `src/ui/drums/DragNumber.tsx:17-109`.

`DragNumber` is a pointer-drag numeric control rather than an `<input type="range">`; it is included because it is an interactive parameter slider in practice. The active groups are:

- Euclidean lane `Steps` and pitch `Root` (`src/ui/drums/SeqLane.tsx:325-375`).
- Sequencer overview/detail `Steps` and `Hits` (`src/ui/drums/SeqOverview.tsx:69-86`, `src/ui/drums/DrumPage.tsx:1912-1934`, `src/ui/synth/SynthPage.tsx:9108-9130,9570-9578`).
- Drum and synth transport `BPM` (`src/ui/drums/DrumPage.tsx:1552-1559`, `src/ui/synth/SynthPage.tsx:8441-8447`).
- Evolution `Every` bars (`src/ui/drums/DrumPage.tsx:1735-1745`, `src/ui/synth/SynthPage.tsx:8913-8923`).
- Routing mute-group phrase endpoints and random defaults/transition (`src/ui/routing/RoutingMuteGroupsPanel.tsx:234-250,282-305`).

The sequencer values operate and round-trip through canonical state, pitch metadata, or `drum/synthEvolveConfigs`. BPM is the intentionally single transport value. Routing mute-group endpoints are a custom paired range (`min`/`max`) with ordering normalization; they operate and round-trip through `routingMuteGroups` metadata and scene storage. None of these scalar controls exposes shared walk/sample-hold mode, and none needs dual modulation semantics as currently designed.

## Preset coverage matrix

| Architecture | Value operates | Endpoint/range state saved | Mode saved | Value/mode restored |
|---|---:|---:|---:|---:|
| Shared App slider, Product-range key | Yes | Yes (`dualRanges`) | Yes (`sliderModes`) | Yes |
| Shared App slider, Product-unsupported key | Yes | Scalar value only | No dual mode in Product | Yes, scalar |
| FX Routing / Active Earth custom dual rails | Yes | Yes (`dualRanges`) | Yes (`sliderModes`) | Yes |
| Delay B tape heads | Yes | No dual metadata | No | Scalar value yes |
| SeqLane pitch/range endpoints | Yes | Yes via state/sub-lane/step metadata | Architecture-native | Yes |
| Euclidean swing/evolve/write offset | Yes | Metadata yes | Single policy | Yes |
| `DragNumber` sequencer/routing controls | Yes | State, sequencer metadata, or `routingMuteGroups` | Single policy | Yes |
| Dice intensity | Yes | No | No | No |
| Scatter/simple | Yes | No | No | No |
| Journey | Yes | Yes (`*Max`) | Encoded by endpoint presence | Yes |
| Harmony/chord | Yes | Content/state value | Scalar | Yes |
| Global morph controller | Yes | No | N/A | No |
| Visualizer numeric controls | Yes | Yes (`reactiveRanges`) | **No — bug** | Range yes, mode no |
| Visualizer reaction/macros | Yes | Scalar fields | Single | Yes |
| Anchor Walker/Orbit | Yes | `synthSequencerFaces` | Single | Yes |
| Lead4op FM authored parameters | Yes | Custom FM preset data | Single | Yes |
| Lead4op audition BPM | Yes | No | N/A | No |

## Prioritized recommendations

1. **P0 — Persist visualizer slider modes.** Add a versioned `sliderModes`/`vizSliderModes` field to `VisualizerPresetData`, include it in `CURRENT_SPECIAL_DATA_KEYS`, write it in `handleSavePreset`, sanitize it on load, and restore it before compiling automations. Keep `reactiveRanges` unchanged for backward compatibility.
2. **P1 — Put Scatter/simple state in the preset model.** Add a portable `SeqScatterState` payload (or canonical state keys) to the state preset metadata, including Rate, per-voice density/chance, walk enable/mode, and active state; restore it before Product scatter events are scheduled.
3. **P1 — Move delay tape-head sliders onto the shared dual path.** Replace the eight native inputs with the shared `Slider`/`sliderProps` architecture, preserving head-specific labels and existing scalar values. Product range targets already exist.
4. **P1 — Add Product Core range targets for the eight hold/morph-speed keys** if these controls are required to be dual in the Product runtime. The state/preset codec is already sufficient; only range-target resolution and the corresponding runtime event handling are missing.
5. **P2 — Consolidate SeqLane endpoint pairs.** Use a shared range primitive/`DualSlider` adapter while preserving lane-specific `SubLaneState` and step-override serialization. This reduces duplicated pointer/ordering logic and keeps range interaction behavior consistent.
6. **P2 — Keep scalar policies explicitly single.** Transport timing, harmony semantics, sequencer action settings, audition controls, and Lead4op authoring values should remain single unless their product semantics are deliberately changed to ranges. If users need them recalled, add persistence separately rather than implicitly treating every scalar as a modulation range.

## Verification

The following existing checks passed during the audit:

- `npm run test:slider-system`
- `npm run test:preset-metadata`
- `npm run test:preset-exact-load`
- `npm run test:preset-current-schema`
- `npm run test:preset-sequencer-components`
- `npm run test:drum-scatter-sequencer`
- `npm run core:product:snapshot-regression`
- `npm run core:product:nature-runtime`
- `npm run type-check`

No application behavior was changed for this audit; this file is the audit deliverable and implementation work is left to the prioritized recommendations above.
