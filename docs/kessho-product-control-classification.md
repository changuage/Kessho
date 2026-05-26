# Kessho Product Core Control Classification

This file classifies the `core-product` host control surface by Product Core update path. Full snapshot reloads are structural fallbacks only; they must run on the host thread, never in the audio render callback.

## Live Product Core Events

- Transport start, stop, resume, and suspend post generated transport events.
- Manual melodic notes, manual drum triggers, and MIDI messages post generated note/MIDI events.
- Journey morph start/stop posts generated journey state events.
- Synth/drum reset-home and dice post generated sequencer control events.
- Synth/drum clock division and swing post generated sequencer lane param events.
- Synth/drum step toggles, step-value overrides, and sub-lane configs post generated sequencer step events.
- Source/drum dual ranges, sample-hold ranges, and runtime-walk ranges post generated modulation range events.
- Runtime Pad, Lead, and Drum `SetParam` events for reconstructable generated sources are normalized inside Product Core into bounded sparse override state and live module patch updates, without promoting those sources to exact compatibility arrays.

## Bounded Dirty Diffs

- Routine `updateParams` and `patchAdapterState` updates create a next generated Product snapshot, compare it to `latestProductSnapshot`, and emit generated param/source-preset/journey/sequencer-lane events when the diff is bounded.
- Source enabled, level, morph, distance, expression, dry gain, FX sends, granular send, diffuse send, post-LPF, stereo width, post-LPF key tracking, source envelope fields, and Lead envelope/algorithm override flags are dirty diff events.
- FX, routing, master, RNG, and evolution scalar changes are dirty diff events.
- Source preset ID changes are dirty diff source-preset events when source identity and asset references are unchanged.
- Structured Pad, Lead, and Drum sparse override changes are dirty diff `SetSourceOverride` slot/commit events when the source remains reconstructable from generated preset IDs and exact compatibility arrays stay empty.

## Structural Full Snapshot Reloads

- Initial runtime start/bootstrap loads a full Product snapshot before live events are posted.
- Asset reference changes use a full Product snapshot after host-side asset decode/registration.
- Harmony chord/voicing mode changes use a full Product snapshot until mode-specific events are final.
- Source structure changes use a full Product snapshot: source count, source ID, or source asset ID.
- Sparse override changes fall back to a full Product snapshot only when the source is not reconstructable through generated endpoint/voice preset state. Exact Pad/Lead/Drum compatibility patch changes still use a full Product snapshot for legacy or non-reconstructable bridge state.
- Partial exact Pad, Lead, and Drum patch counts are invalid state, not structural fallback inputs.
- Unknown generated source preset IDs and Drum voice preset IDs are invalid state; they must be rejected rather than routed to a default preset fallback or sibling morph endpoint.
- Sequencer structural changes use a full Product snapshot: lane count mismatch, manual step masks, morph/distance/expression structural fields, bar reset, or phrase reset.
- Dirty diffs exceeding `MAX_SNAPSHOT_DIFF_EVENTS` use a full Product snapshot with reason `dirty-diff-event-budget`.
- Explicit reset requests may load a full snapshot by request.

## Unsupported

- Unknown future modulation range keys increment `unsupportedControlCount` and log in development, but current `core-product` UI range controls are gated to Product-mapped keys before they reach the host.
- Unknown future app-facing `AudioEngine` methods increment `unsupportedControlCount` and log in development through the `core-product` proxy, but required App callsites are statically audited against `CoreProductEngineHost`.
- Placeholder visual getters are either backed by Product telemetry/generated state or hidden/disabled in `core-product`.

## Parameter Accounting

`core:product:param-accounting` audits every `SliderState` key and directly inventories app-visible UI/preset control references, including generated UI patterns whose `paramKey`/control key is built from a voice, lane, or slot map. A key must be either wired into Product Core through generated snapshots/events, or explicitly classified as deferred, legacy, or UI policy with an owner and reason. It also writes `docs/reports/kessho-product-control-coverage-latest.json`, a per-control matrix that records app visibility, snapshot/full-reload coverage, live range-event coverage, classified live-update path, native Product param handler coverage, behavior evidence by domain and by app-visible domain/live-update-path group, and explicit deferral/legacy waivers.

The accounting gate fails if a live Product range control is not also represented in snapshot/full-reload coverage, if a UI control references a key outside `SliderState`, if an app-visible control is neither Product-wired nor explicitly deferred, if an app-visible Product-wired control lacks a classified live update path or structural/full-snapshot policy, if a TS Product param ID lacks native event-handler coverage, or if an unsupported/deferred bucket that is not marked as partial policy matches a fully wired key. Deferred controls are fail-closed: each currently unwired key must be listed in the explicit waiver inventory for its bucket, so a new missing control cannot pass solely by matching a broad regex pattern. Structural/full-snapshot controls are fail-closed too: each app-visible control routed through a full snapshot or snapshot policy must be listed under its live-update path with an owner and reason, and stale entries fail the gate. Behavior evidence is fail-closed at the app-visible domain/live-update-path level: new groups must name Product Core CI gates and render/state probes, and stale or missing probe tokens fail accounting. Slider keys outside `PARAM_REGISTRY` are likewise explicit omissions with reasons; app-visible preset-owned controls should be in the registry, and factory preset payload keys must be reachable from the declared preset level/scope cascade. The current explicit deferred groups are soundscape layer policy, arrangement/clock policy, runtime-walk global policy, source scheduler UI policy, legacy delay/granular aliases, FX macros, sequencer preset templates, drum-module extras, and the legacy `leadTimbre` alias; Soundscape texture/module controls are Product-wired through dedicated structured snapshot fields rather than exact Pad/Drum patch arrays.

Pad and Lead distance-shaped generated endpoint tonal changes are not deferred: `padDistance`, `pad2Distance`, `lead1Distance`, and `lead2Distance` use source distance for generated endpoint snapshots, so those controls alone do not require exact Pad or Lead arrays. Generated-endpoint custom Pad and Lead controls now use bounded sparse override fields rather than full exact arrays; exact Pad/Lead fallback remains only for non-reconstructable sources. Drum source level and reverb are also not deferred: `drumLevel` and `drumReverbSend` use canonical source fields for generated Drum voice-preset snapshots, and generated-voice custom Drum controls now use bounded sparse override fields. Runtime generated Pad, Lead, and Drum exact-param events update sparse override fields when the source remains reconstructable; exact arrays are compatibility fallback state only. Lead custom ADSR and algorithm mode are structured: `lead1UseCustomAdsr`, `lead2UseCustomAdsr`, matching attack/decay/sustain/release keys, `lead1AlgorithmMode`, and `lead2AlgorithmMode` use source override fields. Generated Pad, Lead, and Drum exact patch keys are counted as Product-wired bridge fields, not as final ownership.

## Telemetry

The web host attaches these diagnostics to Product telemetry/perf snapshots:

- `dirtyDiffCount`
- `fullSnapshotReloadCount`
- `unsupportedControlCount`
- `snapshotReloadCpuMs`
- `lastSnapshotReloadReason`
