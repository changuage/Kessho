# Slider dual-mode and preset re-audit

**Re-audit date:** 2026-07-31  
**Baseline:** `docs/slider-dual-preset-audit.md` (the Luna Max audit)

## Implementation status — complete

The enhancement plan derived from this re-audit was implemented on 2026-07-31. The current architecture now has:

- one lower-level capability registry for `single`, `walk-only`, and `dual`;
- generated coverage for all literal shared sliders and the dynamic Earth, Delay B, Lead ADSR, sample, granular, drum, and Dynamics families;
- a hard rule that every advertised Product `dual` control resolves a live Product range target;
- registry-aware preset metadata canonicalization before content hashing and after hydration;
- visualizer format v2 mode persistence with v1 compatibility;
- content-addressed Scatter/simple-drum configuration persistence without generated phrase history;
- shared/coalesced Delay B tape-head and SeqLane endpoint controls;
- RAF-coalesced Global Morph Position updates with a synchronous release flush.

The remaining single controls are intentional policy, not missing fallback behavior. This includes discrete sample voice counts, granular slice selectors, Per-Engine Tension, transport/sequencer policy fields, and source morph-speed controls that have no valid live Product range ABI. Water and Insects remain `walk-only`; `dual` means single, walk, and sample-and-hold are all available.

### Completed gap matrix

| Re-audit gap | Resolution |
|---|---|
| Visualizer modes not recalled | `vizSliderModes` is sanitized, saved, schema-validated, and restored in visualizer preset format v2. |
| Scatter/simple state not recalled | Canonical `drumScatterState` metadata now saves and restores both views; V2 storage extracts it to a deduplicated `scatterConfig` content node. |
| Delay B tape heads bypass shared renderer | All four Level/Pan pairs use the shared Slider path and are explicitly dual/target-backed. |
| Lead ADSR and hold targets absent | Lead 1/2 ADSR plus Pad 1/2 Hold now resolve Product source-envelope range targets. |
| Implicit eligibility policy | App rendering, runtime mode/range transitions, preset sanitization, and coverage tests use the shared registry. Unknown controls fail closed to single. |
| Paired SeqLane endpoints | Pitch and value ranges use a shared zero-gap range primitive with frame-coalesced updates and release flush. |
| Morph Position event burst | Intermediate positions are limited to one commit per animation frame; duplicate positions are suppressed. |

## Executive result

Before implementation, the Luna Max audit correctly identified four large functional gaps (the statements below describe the pre-fix tree):

1. Visualizer range endpoints persist, but visualizer slider modes do not.
2. Scatter and legacy simple-drum slider state is not preset-persistent.
3. Delay B tape-head level/pan controls bypass the shared dual-slider renderer.
4. Product Core is missing range targets for several shared synth/arrangement controls.

This re-audit found three material additions:

1. **Ten Lead 1/2 ADSR sliders lack Product Core range targets, not only the two Hold sliders counted by the baseline.**
2. **Six Per-Engine Tension sliders bypass `sliderProps` completely.** Their scalar value and tension mode persist, but they have neither dual callbacks nor defined range semantics.
3. **The audit needs a canonical single/dual eligibility policy.** Six discrete shared controls are currently single only because Product target lookup fails, while `SINGLE_ONLY_SLIDER_KEYS` is empty. Preset metadata filtering also does not use a canonical eligibility policy, so stale, legacy, or cross-runtime dual metadata can remain stored for controls the active runtime cannot expose.

The generic preset architecture is otherwise sound. Scoped preset saves retain behavior only for keys owned by the preset data, V2 storage extracts range/mode behavior into scope-owned content-addressed nodes, and load hydration restores those nodes. No additional generic state-preset round-trip defect was found.

## Inventory correction

The baseline's `157`-key figure measured unique literal keys passed directly to `sliderProps(...)`; it did not measure the whole shared slider surface.

- There are still **306** shared `<Slider>` instances in `src/ui`.
- There are **220 unique literal `paramKey` values** on shared Slider/SliderComponent call sites.
- Product Core supports **206 of those 220 literal keys**.
- The same **14 literal keys** remain unsupported.
- Dynamic parameter families must be expanded separately; the re-audit expanded Lead ADSR, sample slots, drum voice schemas, Dynamics schemas, and Granular voice schemas.

Dynamic-family Product range results:

| Dynamic family | Numeric slider keys checked | Product range unsupported | Result |
|---|---:|---:|---|
| Drum voice schema | 118 | 0 | Complete |
| Dynamics control schemas | 59 | 0 | Complete |
| Sample slot numeric controls | 32 | 2 | `sample1MaxVoices`, `sample2MaxVoices` |
| Granular voice numeric controls | 124 | 4 | `granularV1Slice` … `granularV4Slice` |
| Lead 1/2 ADSR | 10 | 10 | All Attack/Decay/Sustain/Hold/Release keys |

The sample voice-count and granular slice controls are discrete configuration values. They should remain single unless the product intentionally defines safe modulation semantics. Their gap is the absence of an explicit policy, not the absence of a useful audio range target.

## New gap 1 — Lead ADSR range support was undercounted

The shared sliders in `src/ui/synth/SynthPage.tsx` build their parameter keys dynamically:

- `lead1Attack`, `lead1Decay`, `lead1Sustain`, `lead1Hold`, `lead1Release`
- `lead2Attack`, `lead2Decay`, `lead2Sustain`, `lead2Hold`, `lead2Release`

Every control receives `sliderProps(...)`, so it is structurally on the shared dual architecture. However, `isCoreProductRangeKeySupported(...)` returns false for all ten keys. `App.sliderProps` therefore removes the range callbacks and renders them single in Product Core.

The scalar envelope values are valid state, are included in the ParamRegistry preset hierarchy, and are consumed by `src/audio/coreEngineHost.ts`. This is a Product range-target/runtime-event gap, not a state or preset-codec gap.

**Correction to the baseline recommendation:** add Product range support for all ten Lead ADSR keys if envelope modulation is intended, not only `lead1Hold` and `lead2Hold`.

## New gap 2 — Per-Engine Tension silently bypasses the shared behavior path

`src/ui/global/GlobalPage.tsx` renders one dynamic shared Slider for each of:

- `padTensionValue`
- `leadTensionValue`
- `synthEuclidTensionValue`
- `granularTensionValue`
- `reverbTensionValue`
- `drumTensionValue`

Unlike the other shared Slider call sites, this call does not spread `sliderProps(valueKey)`. It supplies only mode-dependent `min`, `max`, and `step`, so the component never receives `onCycleMode` or `onDualRangeChange` and always renders single.

All six scalar values and their `follow | locked | bypass` tension modes are registered and save/load at their owning preset levels. The missing dual support is therefore not a persistence failure.

These controls cannot safely be made dual by adding `sliderProps` mechanically:

- `follow` interprets the value as an offset in `-0.5 … 0.5`.
- `locked` interprets the value as an absolute value in `0 … 1`.
- `bypass` hides the numeric control.

A saved endpoint pair would be ambiguous across tension-mode changes. Choose one of these explicit designs:

1. Keep all six single and register them in the canonical single-policy list.
2. Define ranges in normalized tension space and convert them per tension mode.
3. Store range behavior per tension mode, at a higher preset cost and with more migration complexity.

The first option has the lowest technical and CPU risk unless range-modulated tension is a deliberate product feature.

## New gap 3 — Single/dual eligibility is implicit and storage can retain unreachable behavior

At audit time, dual eligibility emerged from several independent checks:

- whether a page remembered to pass `sliderProps`;
- `SINGLE_ONLY_SLIDER_KEYS`, which was empty;
- transport timing policy;
- Product Core target lookup;
- walk-only normalization for Water/Insects;
- feature-specific custom renderer rules.

This creates two problems:

1. A missing Product target and an intentional single control look identical in the UI.
2. Preset save filtering keeps non-single `sliderModes` and matching `dualRanges` for relevant state keys, but it does not validate them against a canonical eligibility policy. Legacy presets, runtime changes, or migrated data can therefore retain behavior that the active runtime cannot expose. In V2 storage this can create valid but unreachable `parameterBehaviorMap` content nodes.

Create one registry that declares, per parameter:

- `dual`, `walk-only`, or `single`;
- supported runtime(s);
- endpoint domain and scale;
- commit/update policy;
- preset behavior owner;
- optional reason for an intentional single policy.

Use that registry in App rendering, Product range-target validation, preset metadata sanitization, migration, tests, and audit generation.

## CPU/event-cadence gap missed by the baseline

The shared slider primitive and custom Routing, Earth, and Journey rails coalesce pointer updates to one callback per animation frame. Several native range controls do not use this path.

The most significant case is **Global Morph Position**:

- its native input calls `handleMorphPositionChange` on every DOM `change` event;
- each call interpolates a full preset state;
- it replaces state and dual metadata;
- it requests an immediate, trigger-critical Product runtime update;
- it resets runtime walk positions for the interpolated modes.

This is a higher CPU-risk hot path than the native delay mini-sliders. It should use an RAF-coalesced UI emitter, with one final flush on release. Product/native scheduling should remain authoritative; the UI should only avoid submitting redundant intermediate positions within a frame.

The Delay B tape-head inputs and paired SeqLane endpoint inputs should be consolidated onto the same coalesced primitive during their dual-slider migrations.

## Preset architecture re-check

### Confirmed correct

- Normal state presets save scalar state plus `dualRanges` and non-single `sliderModes`.
- Scoped `PresetDropdown` saves filter range/mode metadata to keys present in the scoped extracted data.
- Load applies scalar state and then restores dual range/mode metadata.
- Cloud/V2 storage groups parameter behavior by ParamRegistry scope into content-addressed `parameterBehaviorMap` nodes.
- V2 storage strips the inline `dualRanges`/`sliderModes` copy after creating those nodes, avoiding duplicate storage.
- Hydration restores the behavior nodes into normal preset metadata.

### Specialized implementation disposition

- Visualizer presets now persist `vizSliderModes` in format v2 and retain format v1 load compatibility.
- Scatter/simple state now uses one canonical payload and a content-addressed V2 node.
- Dice intensity, Lead4op audition BPM, and Global morph-controller timing remain intentionally session-only controller/UI settings.
- Unsupported, intentional-single, and unknown keys are removed by capability-aware metadata sanitization before hashing and after hydration.

## Historical implementation priority order

1. **P0 — Fix visualizer mode round-trip.**
2. **P0 — Add a generated slider capability/eligibility registry and regression audit.** Fail CI when a shared slider has no classification, when a `dual` key lacks a Product range target, or when a page bypasses required behavior props.
3. **P1 — Persist Scatter/simple state.**
4. **P1 — Move Delay B tape heads to the shared dual/coalesced path.**
5. **P1 — Add Product range targets for all ten Lead ADSR keys and the eight hold/morph-speed arrangement keys, if those ranges are product requirements.**
6. **P1 — Explicitly classify the two sample voice-count, four granular slice, six Per-Engine Tension, transport, harmony, and controller sliders as single unless their semantics are redesigned.**
7. **P1 CPU — RAF-coalesce Global Morph Position and flush on release.**
8. **P2 — Consolidate SeqLane endpoint pairs and sanitize preset behavior metadata through the capability registry before hashing/storage.**

## Recommended regression coverage

Add a generated test that walks the rendered/shared slider inventory and verifies:

- every interactive slider belongs to a named architecture;
- every shared parameter key has an explicit capability classification;
- every `dual` Product key resolves to a Product range target;
- every custom dual architecture has an endpoint and mode codec;
- save → serialize/V2 extract → hydrate → load preserves both endpoints and mode;
- intentional single controls reject or strip dual metadata;
- no slider gesture submits more than one continuous update per animation frame, except controls explicitly classified `continuous`.

This converts the audit from a periodically repeated manual inventory into an enforceable architecture boundary.

## Verification

The following checks pass against the implemented tree:

- `npm run test:slider-system`
- `npm run test:preset-metadata-ownership`
- `npm run test:preset-exact-load`
- `npm run test:preset-current-schema`
- `npm run test:preset-sequencer-components`
- `npm run test:preset-dedup`
- `npm run test:drum-scatter-sequencer`
- visualizer format v1/v2 and Scatter content-node focused regressions
- `npm run test:background-runtime-slider-modulation`
- `npm run core:product:snapshot-regression`
- `npm run core:product:nature-runtime`
- `npm run core:product:cpu`
- `npm run type-check`

The Product CPU budget reports no missed deadlines. The latest measured active-FX scenario is 8.28% average and 11.28% peak, while the source-morph scenario is 5.08% average and 7.42% peak.
