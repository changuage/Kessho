# Kessho Product Core Migration Status

## Current Architecture State

The repository now has explicit runtime modes:

- `web-ts`: legacy TypeScript/Web Audio reference path.
- `core-bridge`: legacy TypeScript CoreHost plus C++ module bridge.
- `core-product`: new C++ Product Core path.

`core-product` loads a dedicated C++ Product Core API through `public/worklets/kessho-core-product.worklet.js` and renders with `kessho_product_render`.

The web runtime now defaults to the verified `core-bridge`/`core-wasm` path while `core-product` remains selectable for Product Core migration probes. `web-ts` remains selectable for reference/comparison.

## Implemented

- Generated product schema source files under `cpp/KesshoCore/schema`.
- Generated C++/TypeScript/Swift constants, defaults, IDs, and schema hash.
- Generated schema now includes evolution amount/state IDs and defaults across C++, TypeScript, and Swift.
- Generated schema now includes product source preset IDs and preset macro metadata across C++, TypeScript, and Swift.
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
- Product Core-owned sub-lane index mapping for polyrhythmic/reverse/pingpong pitch, ratchet, expression, morph, and distance values.
- Product Core-owned sequencer reset-home and dice-lane events for synth/drum lanes, with deterministic C++ RNG-state consumption and web `core-product` forwarding only control events.
- Product Core RNG seed/state is now exposed through C++/WASM/native telemetry, and web `core-product` snapshot reloads preserve the latest C++ RNG state instead of resetting deterministic dice/evolution state back to a hardcoded seed.
- Product Core source preset IDs are now loaded from snapshots, changed through generated `SetSourcePreset` events, exposed in C++/WASM/native telemetry, mapped from web/native app preset keys into generated Product Core source preset IDs, and resolved through generated C++ preset macro metadata at source trigger time.
- Generated source preset profile metadata is emitted for C++, TypeScript, and Swift; the C++ Product Core uses it through a fixed preset patch contract for Pad and Lead module-level oscillator, filter, envelope, modulation, transient, unison, and FM operator behavior.
- Initial C++ harmony state, scale quantization, deterministic high-tension chord-degree variation, and harmony telemetry.
- Initial C++ Product Core evolution state loading and deterministic sequencer-event evolution for probability, velocity, morph, distance, and expression.
- Journey morph clock phase now participates in generated sequencer-event values instead of being telemetry-only.
- Product Core journey enabled/phase/rate state is now preserved through web and native product snapshots, and C++ accepts generated journey state/phase events so later snapshot reloads do not silently disable the C++ journey clock.
- C++ manual note and drum trigger events.
- C++ Product Core source wrappers for Pad 1, Pad 2, Lead 1, Lead 2, and Drum using the shared C++ modules.
- C++ Product Core applies Pad and Lead source morph/distance/expression macros to shared source modules at bounded trigger time.
- Host-decoded asset registration API with C++-rendered piano/sample playback, Product Core-owned nearest registered piano-sample selection, Product Core-owned sample attack/release envelopes, and Product Core-owned crossfaded looped soundscape playback with deterministic layer start/level/pan/rate randomization plus fixed per-texture soundscape policy.
- Product-owned source send buses for Delay A, Delay B, and reverb.
- Initial C++ Product Core Delay A, Delay B, reverb, granular, spectral freeze, and dynamics/master processing through shared modules.
- Product snapshot schema, web/native snapshot encoders, and generated `SetParam` events now carry Delay A enabled/time/feedback/filter/modulation/ping-pong/duck/width/cross-feed-filter controls, Delay B enabled/activity/repeats/time/tone/vibrato/mode/pattern/warp/spread controls, and Delay A/B granular/reverb routing sends into the C++ Product Core graph.
- Product snapshot schema, web/native snapshot encoders, and generated `SetParam` events now carry the full shared C++ Reverb module parameter set: type, quality, decay, size, damping, diffusion, modulation, predelay, width, shimmer, slow modulation, reverse tail, chorus, modulation character, multiband damping, input tone, shimmer feedback, warp, cross-feed, early reflections, air absorption, saturation mode, transient smoothing, and early-reflection low-pass frequency.
- Product snapshot schema, web/native snapshot encoders, and generated `SetParam` events now carry the shared C++ Granular module controls: enabled/freeze/feedback/buffer/shape/diffusion/timing randomness, chord bias, legacy compatibility controls, and four fixed-capacity granular voice parameter blocks.
- Product snapshot schema, web/native snapshot encoders, and generated `SetParam` events now carry the shared C++ Spectral Freeze module controls: enabled, active freeze state, slushy mode, speed, wet/dry mix, sustain/decay, and phase jitter.
- Product snapshot schema, web/native snapshot encoders, and generated `SetParam` events now carry primary Dynamics Character, Degrade, saturation, and end-compressor controls into C++; C++ maps those controls into the shared Dynamics Character module and owns the Product Core dynamics render gate.
- Product snapshot schema, web/native snapshot encoders, and generated `SetParam` events now carry Dynamics sidechain key/threshold/envelope/target-depth controls into C++; Product Core owns drum-key duck triggering and applies fixed-capacity per-target sidechain gain to source and FX outputs.
- Product Core master limiter ceiling and legacy master saturation mode/drive/tone are now loaded from product snapshots, accepted through generated `SetParam` events, encoded by web/native snapshot writers, and applied inside the C++ master chain.
- Product Core live `SetParam` updates for spectral freeze and primary dynamics controls now reconfigure the shared C++ FX modules and are covered against equivalent snapshot-loaded renders.
- C++ stems for master and source outputs.
- Product capability report.
- Web `core-product` host and worklet.
- Web `core-product` host now applies app state through product snapshot bytes, registers decoded assets with the Product Core runtime, and keeps visual callback registration explicit instead of falling through the unsupported-method proxy.
- Product source-level `SetParam` events for enabled, level, morph, distance, expression, dry gain, FX sends, and granular sends.
- Generated Product Core `SetModulationRange` event for bounded source/drum modulation ranges.
- Fixed-capacity C++ Product Core modulation range state for sample-hold and runtime-walk behavior.
- C++ source/drum modulation resolution for sequencer events, including per-trigger source expression/morph/distance/send values and drum morph/distance/delay-send values.
- Product Core runtime-walk telemetry surfaced through the WASM worklet and web host.
- Web product snapshot adapter maps source enabled/level/morph/distance/send state and first synth/drum Euclid lane clock division/swing into the generated product snapshot format.
- Web product snapshot adapter now derives Product Core BPM, beats-per-bar, and bars-per-phrase from the app transport metrics instead of fixed transport defaults.
- Web product snapshot adapter maps all four app synth Euclid lanes and expands drum Euclid lane target flags into Product Core drum lanes.
- Pointer-based Product Core telemetry copy API for WASM/native consumers.
- Web Product AudioWorklet telemetry request/response path, with host-side perf telemetry forwarding.
- Web `core-product` host now sends drum morph ranges, drum sample-hold ranges, dual ranges, and runtime-walk ranges as generated Product Core events instead of unsupported method calls.
- Web `core-product` host forwards all app synth/drum Euclid clock-division and swing arrays into Product Core snapshot state and has a real Product Core stop path.
- Web `core-product` host forwards synth/drum sub-lane enabled flags into the Product Core sequencer event path by clearing/reposting lane step-value configs when flags change, so disabled pitch/expression/morph/distance sub-lanes stop affecting C++ event generation.
- Web `core-product` host packages incoming MIDI messages as generated Product Core `MidiEvent` messages; C++ Product Core owns the default channel/source routing and note triggering.
- Runtime critical journey clock calls are eagerly loaded instead of being hidden behind the old missing-method no-op fallback list.
- Web `core-product` host now has explicit lifecycle/state/manual-trigger methods for disposal, state reads, stem-node queries, drum prewarm, CoF reset requests, sonic-parity reset requests, seed-lock bookkeeping, direct pad voice triggers, and lead preset bookkeeping instead of relying on the unsupported-method proxy for those app-facing calls.
- Runtime mode switcher for `web-ts`, `core-bridge`, and `core-product`.
- Web runtime now defaults to the verified `core-bridge`/`core-wasm` path; `web-ts` remains selectable for reference, and `core-product` remains selectable for Product Core migration probes.
- Native C/Objective-C++ Product Core bridge with engine lifecycle, snapshot load, event enqueue, render, stem, telemetry, and host-decoded PCM asset registration.
- Swift Product Core wrapper for snapshot bytes, events, manual notes, render buffers, stems, telemetry, decoded `AVAudioPCMBuffer`/`AVAudioFile` asset conversion, and asset registration.
- Initial Swift `AVAudioSourceNode` Product Core host that renders through C++ Product Core using preallocated render buffers.
- Swift Product Core snapshot encoder that packs native `SliderState` into the generated 4492-byte product snapshot schema and exposes `loadSnapshot(state:)` / `start(state:)` bridge helpers.
- Native AppState defaults to the Product Core render path, forwarding state updates and manual melodic notes through `KesshoProductCoreAudioEngine`; the duplicate Swift DSP path is selectable only with `KESSHO_NATIVE_AUDIO_ENGINE=legacy-swift`/`legacy`/`swift`.
- Native Product Core startup asset manifest and preload path for default piano plus water/birds/frogs soundscape assets; assets are resolved from bundled resources, `KESSHO_PRODUCT_ASSET_ROOT`, or the repo `public/samples` tree during development and registered with C++ before the native render node starts.
- Native Product Core recorder wiring now configures the shared `AudioRecorder` with Product Core master/stem nodes; recordable stems are sourced from C++ Product Core stem buffers rather than the legacy Swift DSP graph.
- SwiftPM/Xcode metadata for generated Swift schema files and the native Product Core bridge.
- Web `core-product` host decodes and registers default/on-demand piano PCM assets plus texture-selected soundscape PCM assets with WASM Product Core when those sources are active, and product snapshots reference product asset IDs for C++ rendering.
- Web and native Product Core asset manifests now cover a representative piano preload range plus available water/ocean/birds/birds2/frogs/insects texture files as host-decoded, C++-rendered buffers.
- Product snapshots now populate the existing asset-ref table for active soundscape layers, and C++ Product Core schedules one looping soundscape voice per active registered layer.
- Product schema, sequencer, harmony, source-wrapper, FX routing, graph, asset, native bridge, WASM, web-host, telemetry-copy, and CPU smoke tests.

## Known Incomplete Areas

- Pad/lead/drum product sources now use the shared C++ modules; source preset identity, bounded generated preset macro metadata, and initial Pad/Lead module profile patches are Product Core-owned, while exhaustive one-to-one preset parameter parity still needs deeper generated product state.
- Harmony, scale, evolution, RNG, and journey have an initial C++ implementation with RNG telemetry preservation across web snapshot reloads; full RNG call-order policy, voicing depth, phrase-level mutation writes, complete journey preset/state morph ownership, and broader journey automation targets still need full C++ implementation.
- Delay A/B, reverb, granular, spectral freeze, dynamics, sidechain, and master limiter/saturation have an initial C++ product-owned path; web/native Product snapshots now gate disabled FX from app enable flags and map the primary Delay A/B production controls plus the current shared Reverb, Granular, Spectral Freeze, Dynamics Character/Degrade/saturation/end-compressor, sidechain, and master controls into C++, while dynamics modulation-matrix depth and remaining master-chain polish beyond limiter/saturation still need broader parameter coverage.
- Web UI calls may still produce unsupported `core-product` diagnostics for legacy production controls that do not yet have final product-level event mappings; drum morph/S&H ranges, dual ranges, runtime walk ranges, synth/drum sub-lane enable flags, and sequencer reset/dice controls now have Product Core event paths.
- Sequencer dice currently mutates C++ lane event-generation overrides and restores them through reset-home, but detailed diced override state is not yet surfaced back to the UI as a generated Product Core snapshot/telemetry diff.
- Native Swift duplicate DSP/generative logic remains present as an explicit legacy reference path; it is no longer the default runtime.
- Native Product Core `AVAudioSourceNode` host, decoded-asset registration helpers, startup asset preload hook, and recorder/stem tap wiring exist, but production bundle/download packaging, broader native decode-format coverage, and live-device stem timing verification remain incomplete.
- Web Product Core asset registration covers deterministic default/on-demand piano samples, a representative piano preload range, and all currently available soundscape sample files; Product Core now owns sample attack/release envelopes, soundscape loop crossfades, deterministic layer start/level/pan/rate randomization, and fixed per-texture spread/rate policy, while deeper scene-level nature policy depth is still incomplete.
- Focused Webapp-vs-Product manual pad sonic probes now produce Product Core master output, but still fail sonic parity by level/timbre/correlation. Source preset/envelope/tone parity still needs completion before `core-product` can become the web parity default.
- `core-bridge` is the current verified web parity runtime.
- `web-ts` remains present and must stay available for reference/comparison.

## Capability Report

| Capability | Status |
| --- | --- |
| Full product graph | Partial: source buses plus Delay A/B primary controls/routing, Reverb module controls, granular, spectral freeze, primary dynamics/sidechain controls, master limiter ceiling, and master saturation |
| Web runtime default | `core-bridge`/`core-wasm` is the verified default; `core-product` remains selectable for migration probes |
| Synth sequencer | Implemented initial C++ event path with all four app lanes mapped from web snapshot state |
| Drum sequencer | Implemented initial C++ event path with web drum target flags expanded into Product Core lanes |
| Sequencer trigger/step values | Implemented C++ lane-param, step-toggle, step-value, sub-lane config, reset-home, and dice-lane event paths with thin web forwarding for lane clock/swing, probability, ratchet, trig condition, MIDI pitch, expression, morph, and distance |
| Pad/Lead source macros | Initial C++ Product Core-owned morph/distance/expression macro path plus generated preset profile patches for module-level Pad/Lead behavior |
| Journey morph clock | Initial C++ clock flag/phase/rate path with event-value morphing, generated state events, and web/native snapshot preservation |
| Harmony/evolution core | Initial C++ root/scale/tension path with deterministic event pitches, generated evolution amount/state IDs, snapshot/event-driven event-value evolution, and RNG seed/state telemetry preservation |
| Modulation ranges | Implemented generated event path, fixed-capacity C++ state, source/drum trigger resolution, and runtime-walk telemetry |
| MIDI note input | Initial Product Core `MidiEvent` path implemented for note-on/note-off and CC-to-param event handling |
| Core asset rendering | Implemented host-decoded buffer registration, C++ sample playback, Product Core-owned nearest registered piano-sample selection, representative piano preloads, sample attack/release envelopes, and C++-scheduled crossfaded/randomized looped soundscape layers with per-texture policy for available water/ocean/birds/birds2/frogs/insects assets |
| Native bridge | Initial bridge implemented, Swift snapshot encoding and decoded-asset registration helpers are available, and SwiftPM build passes |
| Native app runtime | Product Core path is default; startup asset preload and recorder hooks added, with legacy Swift selectable only through an explicit environment override |
| Recordable stems | Initial C++ stem API plus native Product Core recorder tap wiring |
| CPU telemetry | Initial C++/WASM telemetry copy path plus CPU smoke test |

## Validation Commands

- `npm run type-check`
- `npm run build`
- `npm run core:build:wasm`
- `npm run core:test`
- `npm run core:product:web-host`
- `npm run core:product:ci`
- `npm run core:product:native`
- `swift build --package-path KesshoNativeSwift`

## Architecture Notes

- `core-product` must continue moving behavior into C++ Product Core instead of adding production musical decisions to TypeScript.
- Unsupported `core-product` UI methods should be converted into product snapshot diffs or product events.
- Missing assets must report telemetry/errors and must not be replaced by host-rendered piano or nature playback in `core-product`.
