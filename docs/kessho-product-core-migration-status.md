# Kessho Product Core Migration Status

## Current Architecture State

The repository now has explicit runtime modes:

- `web-ts`: legacy TypeScript/Web Audio reference path.
- `core-smoke`: explicit development smoke path for the legacy TypeScript CoreHost plus C++ module bridge.
- `core-product`: new C++ Product Core path.

`core-product` loads a dedicated C++ Product Core API through `public/worklets/kessho-core-product.worklet.js` and renders with `kessho_product_render`.

The web runtime now defaults to `core-product`. `web-ts` remains selectable for reference/comparison, and `core-smoke` remains selectable only as a development smoke path.

## Implemented

- Generated product schema source files under `cpp/KesshoCore/schema`.
- Generated C++/TypeScript constants, defaults, IDs, and schema hash.
- Generated schema now includes evolution amount/state IDs and defaults across C++ and TypeScript.
- Generated schema now includes product source preset IDs and preset macro metadata across C++ and TypeScript.
- Product-level C API headers:
  - `KesshoProductCore.h`
  - `KesshoProductTypes.h`
  - `KesshoProductSnapshot.h`
  - `KesshoProductEvents.h`
  - `KesshoProductTelemetry.h`
  - `KesshoProductAssets.h`
- Fixed-capacity Product Core control event queue.
- Fixed-capacity sequencer event buffer.
- Product snapshot load and schema hash validation.
- C++ transport clock with sample-frame, beat, bar, and phrase telemetry.
- C++ Synth Euclid and Drum Euclid event generation for enabled lanes.
- C++ probability, ratchet, trig-condition, swing, and sample-offset event generation.
- C++ `SetSequencerStep` event path for per-lane trigger toggle, step-value overrides, and sub-lane length/direction metadata, with web `core-product` forwarding raw UI step toggles plus probability, ratchet, trig condition, MIDI pitch, expression, morph, and distance step arrays as Product Core events instead of computing production patterns in TypeScript.
- C++ `SetSequencerLane` and generated lane `SetParam` event paths now update Product Core-owned lane enabled state, target source, step/fill counts, rotation, clock division, swing, probability, ratchets, trig conditions, MIDI note, velocity, hold, and seed without requiring snapshot reloads.
- Web `core-product` forwards live synth/drum sequencer clock-division and swing changes as generated `SetSequencerLane` Product Core events while retaining adapter state for later snapshot reloads.
- Web `core-product` now applies routine product snapshot updates and adapter-state patches through a bounded dirty-diff path that emits generated Product Core param, source-preset, journey, and sequencer-lane events, falling back to full snapshot loads for structural changes such as asset references, source identity, lane counts, manual step masks, and unsupported lane fields.
- Dirty-diff/full-snapshot behavior is classified in `docs/kessho-product-control-classification.md` and enforced by `core:product:dirty-diff`; host telemetry now exposes `dirtyDiffCount`, `fullSnapshotReloadCount`, `unsupportedControlCount`, `snapshotReloadCpuMs`, and `lastSnapshotReloadReason`.
- Product Core-owned sub-lane index mapping for polyrhythmic/reverse/pingpong pitch, ratchet, expression, morph, and distance values.
- Product Core-owned sequencer reset-home and dice-lane events for synth/drum lanes, with deterministic C++ RNG-state consumption and web `core-product` forwarding only control events.
- Product Core-owned dice/reset-home/evolution state now exports through a bounded sequencer UI state copy API plus telemetry revision; the web `core-product` host reconciles changed lanes into its step-override caches and UI evolve callbacks before later snapshot reloads can overwrite Core-owned mutations.
- Product Core RNG seed/state is now exposed through C++/WASM telemetry, and web `core-product` snapshot reloads preserve the latest C++ RNG state instead of resetting deterministic dice/evolution state back to a hardcoded seed.
- Host/Core reconciliation is guarded by `core:product:host-reconciliation`: dice/reset-home calls remain live Product Core events, routine adapter updates must enter the dirty-diff path before any full snapshot reload, source-level UI updates stay diffable, and C++ tests verify unrelated source updates preserve Core-owned dice, reset-home, and evolution state.
- Product Core source preset IDs are now loaded from snapshots, changed through generated `SetSourcePreset` events, exposed in C++/WASM telemetry, mapped from web app preset keys into generated Product Core source preset IDs, and resolved through generated C++ preset macro metadata at source trigger time.
- Generated source preset macro metadata is emitted for C++ and TypeScript; Pad/Lead/Drum module parameter behavior now comes from family-specific Product Core source patch tables instead of profile-derived fallback synthesis in the shared modules.
- Generic generated source preset metadata no longer includes exact Pad/Lead/Drum module arrays in either C++ or TypeScript. Product Core compiles the remaining temporary module-boundary patches from family-specific generated source patch tables plus endpoint, morph, distance, and override state; web endpoint reconstruction derives params from generated preset IDs plus structured preset/spec metadata, generated endpoints plus bounded sparse overrides carry web Pad/Lead edits, and any legacy exact source fields at the web encoder or runtime dirty-diff boundary are rejected instead of being patched forward.
- Generated-endpoint custom Pad controls now serialize as bounded sparse Pad override fields and C++ applies them after endpoint reconstruction; invalid/non-reconstructable Pad endpoint IDs no longer emit full exact Pad arrays, and Pad web cache suppression is bounded to the default cache plus selected generated endpoints instead of scanning every generated Pad preset.
- Generated-endpoint custom Lead preset data now serializes as bounded sparse Lead override fields and C++ applies them after endpoint reconstruction, structured Lead algorithm/envelope fields, and distance shaping; custom Lead preset data is anchored to generated Lead endpoint IDs and invalid/non-reconstructable Lead endpoint IDs no longer emit full exact Lead arrays.
- Generated-voice custom Drum controls now serialize as bounded sparse Drum override fields and C++ compiles them into generated Drum voice-preset patches; invalid Drum voice preset IDs no longer emit exact or sparse Drum patch payloads, and exact Drum snapshot ABI slots are zero-only reserved fields.
- Generated `SetSourceOverride` events now apply bounded sparse Pad, Lead, and Drum overrides live through a slot/commit event path without promoting reconstructable sources back to exact patch arrays.
- Generated Pad, Lead, and Drum runtime `SetParam` events now update bounded sparse override state for reconstructable sources and refresh the live module patches without promoting those sources back to exact patch arrays.
- SourceState exact Pad/Lead/Drum fields are removed. Runtime generated Pad, Lead, and Drum param edits must normalize into bounded sparse override state or fail; they no longer mutate exact fallback arrays.
- Web snapshot byte encoding now rejects legacy exact Pad/Lead/Drum source fields plus invalid sparse override counts, indices, values, and wrong-family sparse payloads instead of clamping or ignoring them; C++ snapshot loading rejects invalid sparse state and any nonempty exact ABI payload.
- C++ snapshot loading now rejects wrong-family exact Pad/Lead/Drum arrays, oversized exact counts, overloaded Soundscape exact arrays, nonzero exact values, and non-finite exact values instead of copying, clamping, clearing, or zero-filling malformed legacy bridge payloads.
- Unknown generated source preset IDs and Drum voice preset IDs are rejected during snapshot load and live `SetSourcePreset` handling instead of falling back to defaults or sibling morph endpoints.
- Exact Pad/Lead/Drum snapshot ABI slots are classified as zero-only reserved fields in `docs/kessho-product-patch-bridge-policy.md`, while module-boundary exact patch structs remain temporary adapter fields. Shared source modules reject missing or non-finite module-boundary params instead of synthesizing profile-derived fallback patches. `core:product:patch-bridges` fails if SourceState exact fields reappear, exact patch count/array fields are unlabeled, generated TypeScript source preset rows regain exact patch tables, or web Product snapshots regain exact patch ownership.
- Web Product snapshot authority is guarded by `core:product:snapshot-authority`, which allowlists snapshot adapter imports, labels temporary patch compatibility sections, blocks runtime/hidden-state APIs, rejects legacy exact source fields in byte encoding, and confines legacy Lead morphing plus Pad/Drum exact comparison tables to their classified sparse-override bridge functions.
- Initial C++ harmony state, scale quantization, deterministic high-tension chord-degree variation, and harmony telemetry.
- Initial C++ Product Core evolution state loading and deterministic sequencer-event evolution for probability, velocity, morph, distance, and expression.
- Journey morph clock phase now participates in generated sequencer-event values instead of being telemetry-only.
- Product Core journey enabled/phase/rate state is now preserved through web product snapshots, and C++ accepts generated journey state/phase events so later snapshot reloads do not silently disable the C++ journey clock.
- C++ manual note and drum trigger events.
- C++ Product Core owns fixed-capacity Pad note-off scheduling for manual/sequenced Pad triggers with no render-time allocation.
- C++ Product Core source wrappers for Pad 1, Pad 2, Lead 1, Lead 2, and Drum using the shared C++ modules.
- C++ Product Core applies Pad and Lead source morph/distance/expression macros to shared source modules at bounded trigger time.
- C++ Product Core owns source post-LPF/stereo-width state from generated product snapshots and generated source `SetParam` events, including Pad post-fader chains, Lead two-stage post chains with source-owned post-LPF key tracking, and host-decoded sample voice post chains for piano/soundscape playback. Manual Lead triggers now use source snapshot hold state instead of host-side duration timing.
- Host-decoded asset registration API with C++-rendered piano/sample playback, Product Core-owned nearest registered piano-sample selection, Product Core-owned sample attack/release envelopes, and Product Core-owned crossfaded looped soundscape playback with deterministic layer start/level/pan/rate randomization plus fixed per-texture soundscape policy.
- Product-owned source send buses for Delay A, Delay B, and reverb.
- Initial C++ Product Core Delay A, Delay B, reverb, granular, spectral freeze, and dynamics/master processing through shared modules.
- Product snapshot schema, web snapshot encoders, and generated `SetParam` events now carry Delay A enabled/time/feedback/filter/modulation/ping-pong/duck/width/cross-feed-filter controls, Delay B enabled/activity/repeats/time/tone/vibrato/mode/pattern/warp/spread controls, and Delay A/B granular/reverb routing sends into the C++ Product Core graph.
- Product snapshot schema, web snapshot encoders, and generated `SetParam` events now carry the full shared C++ Reverb module parameter set: type, quality, decay, size, damping, diffusion, modulation, predelay, width, shimmer, slow modulation, reverse tail, chorus, modulation character, multiband damping, input tone, shimmer feedback, warp, cross-feed, early reflections, air absorption, saturation mode, transient smoothing, early-reflection low-pass frequency, and the Product Core-owned reverb preconditioner.
- Product snapshot schema, web snapshot encoders, and generated `SetParam` events now carry the shared C++ Granular module controls: enabled/freeze/feedback/buffer/shape/diffusion/timing randomness, chord bias, legacy compatibility controls, and four fixed-capacity granular voice parameter blocks.
- Product snapshot schema, web snapshot encoders, and generated `SetParam` events now carry the shared C++ Spectral Freeze module controls: enabled, active freeze state, slushy mode, speed, wet/dry mix, sustain/decay, and phase jitter.
- Product snapshot schema, web snapshot encoders, and generated `SetParam` events now carry primary Dynamics Character, Degrade, Degrade modulation-matrix, saturation, and end-compressor controls into C++; C++ maps those controls into the shared Dynamics Character module and owns the Product Core dynamics render gate.
- Product snapshot schema, web snapshot encoders, and generated `SetParam` events now carry Dynamics sidechain key/threshold/envelope/target-depth controls into C++; Product Core owns drum-key duck triggering and applies fixed-capacity per-target sidechain gain to source and FX outputs.
- Product Core master limiter ceiling and legacy master saturation mode/drive/tone are now loaded from product snapshots, accepted through generated `SetParam` events, encoded by web snapshot writers, and applied inside the C++ master chain.
- Product Core live `SetParam` updates for spectral freeze and primary dynamics controls now reconfigure the shared C++ FX modules and are covered against equivalent snapshot-loaded renders.
- C++ stems for master and source outputs.
- Product capability report.
- Web `core-product` host and worklet.
- Web `core-product` host now applies app state through product snapshot bytes, registers decoded assets with the Product Core runtime, and keeps visual callback registration explicit instead of falling through the unsupported-method proxy.
- Product source-level `SetParam` events for enabled, level, morph, distance, expression, dry gain, FX sends, granular sends, post-LPF, and stereo width.
- Generated Product Core `SetModulationRange` event for bounded source/drum modulation ranges.
- Fixed-capacity C++ Product Core modulation range state for sample-hold and runtime-walk behavior.
- Product Core target-0 sample-hold ranges now apply generated product parameters directly, so global/master/FX dual ranges accepted by `core-product` are not inert.
- Web `core-product` maps granular voice dual/runtime-walk range controls for speed, scan rate, pitch, write-follow, density, grain size, spray, octave probability, envelope, gain, pan, blur, stereo spread, and granular LFO rates/depths to generated Product Core granular voice params.
- Web `core-product` maps generated source Delay A, Delay B, and granular send ranges to Product Core source params, and maps indexed Delay A/B division plus continuous Delay A modulation/cross-feed filter ranges into Product Core schema units before posting modulation events.
- C++ source/drum modulation resolution for sequencer events, including per-trigger source expression/morph/distance/send values and drum morph/distance/delay-send values.
- Product Core runtime-walk telemetry surfaced through the WASM worklet and web host.
- Web product snapshot adapter maps source enabled/level/morph/distance/send state and first synth/drum Euclid lane clock division/swing into the generated product snapshot format.
- Web product snapshot adapter now derives Product Core BPM, beats-per-bar, and bars-per-phrase from the app transport metrics instead of fixed transport defaults.
- Web product snapshot adapter maps all four app synth Euclid lanes and expands drum Euclid lane target flags into Product Core drum lanes.
- Pointer-based Product Core telemetry copy API for WASM consumers.
- Web Product AudioWorklet telemetry request/response path, with host-side perf telemetry forwarding.
- Web `core-product` host now sends drum morph ranges, drum sample-hold ranges, dual ranges, and runtime-walk ranges as generated Product Core events instead of unsupported method calls.
- Web `core-product` host forwards all app synth/drum Euclid clock-division and swing arrays into Product Core snapshot state and has a real Product Core stop path.
- Web `core-product` host forwards synth/drum sub-lane enabled flags into the Product Core sequencer event path by clearing/reposting lane step-value configs when flags change, so disabled pitch/expression/morph/distance sub-lanes stop affecting C++ event generation.
- Web `core-product` host packages incoming MIDI messages as generated Product Core `MidiEvent` messages; C++ Product Core owns the default channel/source routing and note triggering.
- Web `core-product` sonic-parity reset now calls the C++ Product Core reset entry point through the AudioWorklet instead of silently doing nothing.
- Runtime critical journey clock calls are eagerly loaded instead of being hidden behind the old missing-method no-op fallback list.
- Runtime fallbacks are classified in `docs/kessho-product-runtime-fallback-classification.md` and enforced by `core:product:runtime-fallbacks`; missing audio-critical `core-product` setter/update/reset/dice/control methods now throw in development and increment/log diagnostics instead of silently disappearing in production, getter fallbacks are closed-list through `CORE_PRODUCT_GETTER_POLICIES`, reference-only methods are closed-list through `CORE_PRODUCT_REFERENCE_ONLY_METHODS`, unknown telemetry/debug/analyser or legacy helper methods are forbidden instead of silently becoming optional UI paths, and the app runtime proxy no longer synthesizes telemetry/analyser/debug/stem/preset-preview getter values before the selected engine is loaded.
- Product Core getter policies are tracked in `docs/kessho-product-getter-policies.md` and enforced by `core:product:getter-policies`; granular active grain count/head/voice positions, dynamics visual telemetry, and transport debug state are backed by Product Core telemetry/generated state, while Web Audio analyser-node surfaces, stem-node recording, live source filter/LFO polling, Lead morphed-parameter previews, and Earth texture debug polling are explicit unsupported host API boundaries rather than runtime fallback diagnostics.
- Reference isolation is classified in `docs/kessho-product-reference-isolation.md` and enforced by `core:product:reference-isolation`; `core-product` modules may not import old TypeScript musical-brain modules except for explicitly labeled Product Core override bridges such as `CoreProductLeadPatch.ts`, `CoreProductPadPatch.ts`, and `CoreProductDrumPatch.ts`.
- Product parameter accounting is classified in `docs/kessho-product-control-classification.md` and enforced by `core:product:param-accounting`; every `SliderState` key must be wired through generated Product snapshots/events or explicitly classified as deferred, legacy, or UI policy with an owner and reason.
- Web `core-product` host now has explicit lifecycle/state/manual-trigger methods for disposal, state reads, stem-node queries, drum prewarm, CoF reset requests, sonic-parity reset requests, seed-lock bookkeeping, direct pad voice triggers, and lead preset bookkeeping instead of relying on the unsupported-method proxy for those app-facing calls.
- Runtime mode switcher for `core-product`, `web-ts`, and `core-smoke`.
- Web runtime now defaults to `core-product`; `web-ts` remains selectable for reference, and `core-smoke` remains selectable only as a development smoke path.
- Web `core-product` host decodes and registers default/on-demand piano PCM assets plus texture-selected soundscape PCM assets with WASM Product Core when those sources are active, and product snapshots reference product asset IDs for C++ rendering.
- Web Product Core asset manifests now cover a representative piano preload range plus available water/ocean/birds/birds2/frogs/insects texture files as host-decoded, C++-rendered buffers.
- Product snapshots now populate the existing asset-ref table for active soundscape layers, and C++ Product Core schedules one looping soundscape voice per active registered layer.
- Soundscape route, texture, and module params now travel through dedicated Product snapshot fields into Soundscape-owned C++ source state instead of overloading exact Pad/Drum patch arrays.
- Generic generated Drum source preset metadata no longer carries exact patch fields; Drum source/default params now live in family-specific generated source and voice tables. Web-authored snapshots send per-voice Drum preset A/B IDs, morph positions, and bounded sparse Drum overrides for generated-voice custom controls without exposing exact Drum snapshot fields, and C++ compiles the fixed-capacity Drum patch before triggers while preserving per-trigger delay-send modulation.
- Source parity broadening now has a Product Core gate in `docs/kessho-product-source-parity-broadening.md` and `core:product:source-parity`; C++ tests assert full generated Pad/Lead/Drum/Piano/Soundscape preset family classification, representative Pad 1/Pad 2 and Lead 1/Lead 2 generated preset render probes, Drum default render, Piano/Soundscape preset telemetry, and a registered-asset full-arrangement render/stem probe.
- Deterministic music closure now has a Product Core gate in `docs/kessho-product-deterministic-music-closure.md` and `core:product:determinism`; C++ tests lock the RNG call-order contract, explicit event-value seed transaction trace, seven-degree voicing depth, phrase-boundary evolution writes, and Product Core-owned journey phase advancement, while the gate also verifies a fixed C++/WASM sequencer event timeline through `kessho_product_debug_render_events`.
- FX/dynamics/master depth now has a Product Core gate in `docs/kessho-product-fx-master-depth.md` and `core:product:fx-depth`; C++ tests cover full dynamics modulation-matrix mapping, sidechain release, master gain staging, limiter/saturation/loudness telemetry including true-peak dBTP and integrated LUFS, Product reset tail clearing, disabled-FX bypass behavior, and disabled-FX CPU smoke coverage.
- Product FX runtime code is split out of the second-stage `ProductFx.cpp` catch-all into focused Delay, Reverb, Granular, Spectral Freeze, and Dynamics files with per-file Product Core architecture caps.
- Product source runtime code is split out of the second-stage `ProductSources.cpp` catch-all into focused param, preset event, override event, pad, source mix, source modulation, preset bridge, drum, voice allocator, and soundscape files with per-file Product Core architecture caps.
- Asset manifest/decode matrix now has a Product Core gate in `docs/kessho-product-asset-manifest-decode-matrix.md`, `src/audio/coreProductAssetManifest.json`, and `core:product:asset-manifest`; the web asset helper derives piano/soundscape paths from the versioned Product Core asset manifest, the gate checks all committed piano/soundscape sample files, piano preload/on-demand policy, nature scene layer policy, missing-asset telemetry coverage, web/iOS/macOS decode matrix entries, hard decoded-byte accounting, measured WASM heap allocation, and asset memory budgets.
- `core:product:cpu` now measures average/peak render cost, p95/p99 per-block render latency, and bounded simulated missed render quanta for disabled-FX and active-FX Product Core snapshots.
- Product Default Gate v3 now enforces `core-product` as the web default in `docs/kessho-product-default-gate-v3.md`, `core:product:workflow`, and `core:product:default-gate-v3`; the workflow path triggers and required commands are statically enforced, Product host asset fetch/decode/register logic is isolated in `CoreProductAssetAdapter.ts`, dirty-diff/reload classification is isolated in `CoreProductRuntimeAdapter.ts`, source patch override compatibility is split by family in Product Core patch modules, and Product Core CI records prerequisite reports before v3 runs as the final aggregator.
- Product Core behavioral cleanup proof now covers stale WASM/schema mismatch in the Product worklet, and C++ sequencer tests cover full snapshot reload followed by reconciled sequencer UI replay plus preserved RNG/evolution state.
- Product browser-runtime proof now starts a Vite preview server in CI, opens the app without an `engine` query, and captures audible Pad, Lead, and sample+synth Product Core output through the default browser path.
- Product schema, sequencer, harmony, source-wrapper, FX routing, graph, asset, WASM, web-host, telemetry-copy, and CPU smoke tests.

## Known Incomplete Areas

- DEFERRED_WITH_SIGNOFF: Pad/lead/drum product sources now use the shared C++ modules; source preset identity, bounded generated preset macro metadata, sparse generated-endpoint Pad/Lead overrides, sparse generated-voice Drum overrides, custom Lead preset data anchored to generated endpoints plus sparse overrides, live sparse override events, runtime param normalization into sparse overrides for reconstructable sources, strict generated preset ID/key validation, fail-closed sparse override snapshot encoding/loading, zero-only exact ABI snapshot slots, validated source preset patch compilation, explicit default Drum voice preset IDs, fail-closed invalid Pad/Lead endpoint handling without web exact fallback arrays, fail-closed invalid Drum voice-preset handling without web exact or sparse patch payloads, and factory Drum voice preset morph patching are carried through Product Core-owned schema/snapshot/event paths, while user Drum preset persistence, auto-morph clock ownership, and the temporary module adapter `KesshoSourcePresetPatch.exact_*` boundary still need deeper C++ source-policy coverage. Owner: Product Core source owner. Reason: remaining exact patch bridge is now the module adapter boundary, not snapshot or SourceState ownership. Target follow-up: retire module-boundary exact patches after the shared modules accept structured Product Core preset/override inputs.
- BLOCKED: Harmony, scale, evolution, RNG, and journey have C++ implementation and deterministic guardrails for RNG call-order isolation, event-value transaction seeds, seven-degree voicing, phrase-boundary evolution writes, and Product Core-owned journey phase advancement. Random lead/piano phrase generation, complete journey preset/state graph ownership, and broader journey automation targets still need full C++ implementation. Owner: Product Core deterministic music owner. Target follow-up: complete phrase/journey ownership and update `docs/kessho-product-deterministic-music-closure.md`.
- RESOLVED_WITH_REPORT_REFERENCE: Delay A/B, reverb, granular, spectral freeze, dynamics, sidechain, and master limiter/saturation have a guarded C++ product-owned path; web Product snapshots now gate disabled FX from app enable flags and map the primary Delay A/B production controls plus the current shared Reverb, Granular, Spectral Freeze, Dynamics Character/Degrade/modulation-matrix/saturation/end-compressor, sidechain, and master controls into C++, while limiter/saturation/loudness telemetry, true-peak dBTP, integrated LUFS, and disabled-FX CPU are smoke-gated. Evidence: `core:product:fx-depth` and `docs/kessho-product-fx-master-depth.md`.
- RESOLVED_WITH_REPORT_REFERENCE: Web UI calls may still produce unsupported `core-product` diagnostics for legacy production controls that do not yet have final product-level event mappings; source send ranges, drum morph/S&H ranges, generated Delay/Reverb/Spectral Freeze/routing/dynamics/master/granular-voice dual ranges, runtime walk ranges, synth/drum sub-lane enable flags, and sequencer reset/dice controls now have Product Core event paths. Evidence: `core:product:runtime-fallbacks` and `docs/kessho-product-runtime-fallback-classification.md`.
- RESOLVED_WITH_REPORT_REFERENCE: Sequencer dice/reset-home/evolution state now has a Product Core UI export path; deeper UI polish can still improve how non-dice Core sequencer state is visualized. Evidence: `core:product:host-reconciliation`.
- ARCHIVED: The standalone SwiftUI port and its native release proof live under `archive/native-swift` and are not part of active Product Core CI.
- DEFERRED_WITH_SIGNOFF: Web Product Core asset registration covers deterministic default/on-demand piano samples, a representative piano preload range, and all currently available soundscape sample files through the versioned Product Core asset manifest; Product Core now owns sample attack/release envelopes, sample source post-LPF/stereo width, Lead source post-LPF key tracking, soundscape loop crossfades, deterministic layer start/level/pan/rate randomization, fixed per-texture spread/rate policy, explicit ocean/water/birds/birds2/frogs/insects scene policy, combined nature-scene dedupe policy, and minimal/degraded missing-asset behavior. Owner: Product Core asset owner. Reason: release-bundle decode and runtime eviction need platform-device evidence. Target follow-up: finish scene-level nature policies and platform asset release behavior.
- BLOCKED: Focused Webapp-vs-Product manual Pad sonic probes pass within the current RMS/correlation gate for the default Pad path. The focused `lead-manual-dry` probe now also passes after exact Lead patches, Product Core Lead output trim, C++ Lead post-chain ownership, and source-owned manual Lead hold semantics (`0.031199` normalized aligned RMS versus `0.050000` tolerance). The focused `lead-delay-heavy` core-product browser probe now passes after Product Core module-source FX sends were aligned with the web pre-fader send tap and the Delay A default division mapping was corrected (`0.192462` total RMS ratio delta versus `0.450000` tolerance). The focused `lead1-gamelan-dry`, `lead1-soft-rhodes-dry`, `lead2-gamelan-dry`, and `lead2-soft-rhodes-dry` Product Core browser probes now cover both generated Lead endpoint bridges on Lead 1 and Lead 2 without the other lead, delay, or reverb masking. Product Core-owned broad source-family and full-arrangement smoke probes now pass, while broader web-vs-Product Lead preset parity, scene parity, and full-arrangement sonic parity still need completion before `core-product` can become the web parity default. Owner: Product Core parity owner. Target follow-up: expand acceptance corpus and sign off scene/full-arrangement parity.
- RESOLVED_WITH_REPORT_REFERENCE: Product Default Gate v3 now promotes `core-product` as the web default and replaces the legacy Web-vs-Core readiness requirement with a default browser-runtime Product Core proof. Evidence: `core:product:browser-runtime` and `docs/reports/kessho-product-browser-runtime-latest.json`.
- NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON: `core-smoke` is retained only as an explicit development smoke path. Reason: it is not a product runtime and cannot silently replace `core-product`.
- NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON: `web-ts` remains present and must stay available for reference/comparison. Reason: old web engine is retained only for comparison during migration.

## Capability Report

| Capability | Status |
| --- | --- |
| Full product graph | Partial: source buses plus Delay A/B primary controls/routing, Reverb module controls, granular, spectral freeze, primary dynamics/sidechain controls including Degrade modulation-matrix depths, master limiter ceiling, and master saturation |
| Web runtime default | `core-product` |
| Synth sequencer | Implemented initial C++ event path with all four app lanes mapped from web snapshot state |
| Drum sequencer | Implemented initial C++ event path with web drum target flags expanded into Product Core lanes |
| Sequencer trigger/step values | Implemented C++ lane-param, step-toggle, step-value, sub-lane config, reset-home, and dice-lane event paths with thin web forwarding for lane clock/swing, probability, ratchet, trig condition, MIDI pitch, expression, morph, and distance |
| Pad/Lead source macros | Initial C++ Product Core-owned morph/distance/expression macro path plus family-specific temporary module-boundary params for Pad/Lead behavior |
| Journey morph clock | Initial C++ clock flag/phase/rate path with event-value morphing, generated state events, and web snapshot preservation |
| Harmony/evolution core | Initial C++ root/scale/tension path with deterministic event pitches, generated evolution amount/state IDs, snapshot/event-driven event-value evolution, and RNG seed/state telemetry preservation |
| Modulation ranges | Implemented generated event path, fixed-capacity C++ state, source/drum trigger resolution, source Delay A/B/granular sends, target-0 product-param sample-hold application, granular voice dual/runtime-walk param targeting, schema-unit value mapping for indexed Delay A/B division and continuous Delay A ranges, and runtime-walk telemetry |
| MIDI note input | Initial Product Core `MidiEvent` path implemented for note-on/note-off and CC-to-param event handling |
| Core asset rendering | Implemented host-decoded buffer registration, C++ sample playback, Product Core-owned nearest registered piano-sample selection, representative piano preloads, sample attack/release envelopes, sample source post-LPF/stereo width, and C++-scheduled crossfaded/randomized looped soundscape layers with per-texture policy for available water/ocean/birds/birds2/frogs/insects assets |
| CPU telemetry | Initial C++/WASM telemetry copy path plus CPU smoke test |

## Validation Commands

- `npm run type-check`
- `npm run build`
- `npm run core:build:wasm`
- `npm run core:test`
- `npm run core:product:web-host`
- `npm run core:product:ci`
- `npm run core:product:workflow`
- `npm run core:product:source-parity`
- `npm run core:product:determinism`
- `npm run core:product:default-gate-v3`

## Architecture Notes

- `core-product` must continue moving behavior into C++ Product Core instead of adding production musical decisions to TypeScript.
- Unsupported `core-product` UI methods should be converted into product snapshot diffs or product events.
- Missing assets must report telemetry/errors and must not be replaced by host-rendered piano or nature playback in `core-product`.
