# Common control routing

This inventory records production control paths as of the production-readiness Batch 1 pass. It is a routing map, not a behavior change.

## Snapshot Policy

Allowed full snapshot reasons:

- initial load
- preset load
- session restore
- deterministic fixtures
- schema/ABI validation
- asset or source structure changes that cannot be represented as bounded Product events yet

Common live controls should use Product events, explicit product patches, or dirty-diff paths:

- sliders
- toggles
- sequencer edits
- transport
- journey macro moves
- FX sends
- mute/solo

## Routing Table

| Control | Current path | Target path | Status | Notes |
|---|---|---|---|---|
| Source level, enabled, mute/solo-style toggles | `useAudioEngineParamSync` -> `productEngine.updateSnapshotPatch('ui-control-change', patch)` -> `WebProductEngine.updateSnapshotPatch` -> host product dirty-diff apply path -> generated Product param/source events for bounded source changes | Generated `ProductEvent` param updates or explicit dirty-diff bridge | ok | Batch 3 Group A removed the host `updateParamsWithReason` route from product patches. `core:product:dirty-diff` proves source level updates dirty-diff without a full snapshot; direct generated-event UI dispatch remains tracked by TODO(product-core-control-routing-slider). |
| Source morph, distance, expression, envelope controls | `useAudioEngineParamSync` infers `morph-control-change` for morph/distance/expression keys -> `productEngine.updateSnapshotPatch` -> dirty-diff source param/source override events where bounded | Generated Product param events or explicit dirty-diff bridge | ok | Batch 3 Group C gives source morph/distance/expression patches an explicit product reason. Bounded source hold/envelope and sparse override changes are covered by dirty-diff gates; direct generated-event UI dispatch remains tracked by TODO(product-core-control-routing-morph). |
| FX sends and mix/depth controls | `useAudioEngineParamSync` infers `fx-control-change` for FX/routing keys -> `productEngine.updateSnapshotPatch` -> `WebProductEngine.updateSnapshotPatch` -> host product dirty-diff apply path -> generated Product param/routing events where bounded | Generated Product param events or explicit dirty-diff bridge | ok | Batch 3 Group B gives FX/routing patches an explicit product reason while preserving the dirty-diff adapter path; direct generated-event UI dispatch remains tracked by TODO(product-core-control-routing-fx). |
| Journey enable, morph phase, rate, macro controls | Journey/morph runtime surfaces call `scheduleAudioEngineParamUpdate(..., { reason: 'journey-morph-change' })` or `morph-control-change` -> dirty-diff journey/source events where supported | Generated journey events or explicit journey patch path | ok | `CoreProductRuntimeAdapter` emits journey state events for bounded journey changes. Direct generated journey UI dispatch remains tracked by TODO(product-core-control-routing-morph). |
| Transport tempo/meter/swing fields stored in product state | `useAudioEngineParamSync` infers `transport-change` for tempo/clock keys -> `productEngine.updateSnapshotPatch` -> dirty-diff transport param events | Generated transport Product events or explicit transport patch path | ok | Batch 4 labels transport tempo/clock patches before host classification. Playback lifecycle start/stop is separate and uses Product runtime lifecycle APIs; direct transport event UI dispatch remains tracked by TODO(product-core-control-routing-transport). |
| Playback start/stop/suspend/resume/output fade | Product runtime playback/lifecycle hooks -> `ProductEnginePort.start/stop/suspend/resume/setOutputGain` | Product runtime lifecycle commands | ok | Not a legacy `updateParams` control path. |
| Preset load | `usePresetEngineSync.syncCoreProductAppliedPreset` -> `scheduleAudioEngineParamUpdate(..., { reason: 'preset-load', forceFullSnapshot: true })` | Full snapshot | allowed | Preset load is an allowed full-snapshot reason. |
| Session restore / initial runtime bootstrap | Product runtime start/preload paths -> initial Product snapshot load | Full snapshot | allowed | Initial load/session restore are allowed full-snapshot reasons. |
| Sequencer clock divisions and swing | `useSelectedAudioEngineSequencerControls` -> `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })` with `createCoreProductSequencerClockDivisionEvents/SequencerSwingEvents` | ProductControl action plus generated Product events | ok | Sequencer intent is stored in ProductControl and the generated event batch is attached to the same resolved commit. |
| Sequencer pitch binding mode | `useSelectedAudioEngineSequencerControls` -> `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })` with `createCoreProductSequencerPitchBindingModeEvents` | ProductControl action plus generated Product events | ok | Sequencer intent is stored in ProductControl before host/runtime event reconciliation. |
| Sequencer reset home and dice/evolve trigger commands | `useSelectedAudioEngineSequencerControls` -> `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })` with reset/home/dice/evolve events | ProductControl action plus generated Product events | ok | Triggering commands are ordered behind the resolved ProductControl commit. |
| Sequencer state sliders and lane fields | `useAudioEngineParamSync` infers `sequencer-control-change` for Euclidean/chord progression keys -> `productEngine.updateSnapshotPatch` -> dirty-diff sequencer lane param events where bounded | Generated Product events or explicit product sequencer patch bridge | ok | Batch 4 labels state-driven sequencer patches before host classification; dirty-diff adapter emits generated lane param events for bounded lane changes. |
| Sequencer evolve config edits | `useSelectedAudioEngineSequencerControls` -> `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })` with `createCoreProductSequencerEvolveConfigEvents` -> host evolve-config event bridge | ProductControl action plus generated Product events and host evolve-config cache reconciliation | ok | Drum/synth evolve config edits now use generated Product `SetSequencerLane` event batches with a host-only config marker. The host cache is runtime-derived from ProductControl-committed events and has no direct UI write path. |
| Sequencer sub-lane enabled edits | `useSelectedAudioEngineSequencerControls` -> `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })` with `createCoreProductSequencerSubLaneEnabledEvents` | ProductControl action plus generated Product events and host enabled-state replay | ok | Enabled-state edits now use generated `SetSequencerStep` sub-lane config events with a host reconciliation marker. The host enabled-state cache is derived from committed events. |
| Sequencer pitch settings and step overrides | `useSelectedAudioEngineSequencerControls` -> `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })`; pitch settings use generated `SetSequencerLane` event batches; synth and drum step overrides use generated `SetSequencerStep` event batches | ProductControl action plus generated Product step/value/config events | ok | Pitch settings plus synth/drum step override values/configs now update Product Core through ProductControl-committed generated event batches with host cache reconciliation. Drum pitch offsets are marked in the Product event batch and resolved against Product drum base MIDI before the final runtime sync. |
| Sequencer preset home snapshots and lane home capture | `commitProductControlActionForProduct(..., { type: 'sequencer/edit' }, { productEvents })` with `createCoreProductSequencerPresetHomeCaptureEvents` / `createCoreProductSequencerLaneHomeCaptureEvent` | ProductControl action plus generated Product events and host home-cache capture bridge | ok | Home capture now uses host-consumed Product `SetSequencerStep` markers with force and pitch sub-lane metadata. The home snapshot store is runtime-derived cache captured from the same committed sequencer state. |
| Manual synth notes, drum triggers, MIDI | Product runtime surfaces -> `ProductEnginePort.auditionSynthNote`, `triggerDrumVoice`, or `pushMidiMessage` | Product event/command path | ok | Not part of legacy slider snapshot routing. |
| Asset reference changes and soundscape structured changes | Changed-state patch -> dirty-diff where fade/removal can be represented, otherwise classified full snapshot | Product asset registration plus bounded asset/source events where possible | allowed structural snapshot | Full snapshot remains allowed only for unbounded asset/source topology changes; routine level, enable, mute/solo, and send changes must stay on dirty-diff/event paths. TODO(product-core-control-routing-asset) tracks moving any remaining bounded asset-level edits away from structural snapshots. |

## Open Tickets

- TODO(product-core-control-routing-slider): replace routine slider/source/journey patch entry with generated Product events where direct event builders exist; the current product patch entry is explicitly dirty-diff based and no longer routes through host `updateParamsWithReason`.
- TODO(product-core-control-routing-fx): replace FX/routing patch inference with direct generated Product event dispatch where UI controls already map cleanly to generated FX/routing params.
- TODO(product-core-control-routing-morph): replace journey and source morph patch inference with direct generated Product event dispatch once the UI surfaces can emit bounded Product events without preset-state reconciliation loss.
- TODO(product-core-control-routing-transport): replace transport patch inference with direct generated Product events where UI controls already map cleanly to generated transport params.
- TODO(product-core-control-routing-sequencer): keep host sequencer replay caches derived from ProductControl-committed Product events until native Product telemetry/events can own them directly; do not add direct UI or snapshot patch writers for these caches.
- TODO(product-core-control-routing-asset): keep full snapshots for asset/source structure only; move routine asset level and source enable/mute changes to dirty-diff/event paths.

## Batch 4 Operation Manifest

| Operation | Expected mode | Current evidence |
|---|---|---|
| playback start/stop/suspend/resume/output fade | lifecycle command | Product runtime lifecycle hooks call `ProductEnginePort.start/stop/suspend/resume/setOutputGain`. |
| transport tempo/clock edit | dirty-diff product patch | `useAudioEngineParamSync` infers `transport-change`; `CoreProductRuntimeAdapter.appendTransportDiffs` emits generated transport param events. |
| sequencer lane state edit | dirty-diff product patch | `useAudioEngineParamSync` infers `sequencer-control-change`; `CoreProductRuntimeAdapter.appendSequencerLaneDiffs` emits generated lane param events for bounded lane changes. |
| sequencer clock division / swing / pitch binding / pitch settings / evolve config / sub-lane enabled / reset / dice | ProductControl action plus generated Product event | `useSelectedAudioEngineSequencerControls` uses `commitProductControlActionForProduct` with `sequencer/edit` and generated ProductEvents attached to the same commit. |
| sequencer synth/drum step override | ProductControl action plus generated Product event | `useSelectedAudioEngineSequencerControls` uses `createCoreProductSynthSequencerStepOverrideEvents` / `createCoreProductDrumSequencerStepOverrideEvents` through `commitProductControlActionForProduct`; host cache reconciliation handles generated `SetSequencerStep` events. |
| sequencer evolve config | ProductControl action plus generated Product event | `useSelectedAudioEngineSequencerControls` uses `createCoreProductSequencerEvolveConfigEvents` through `commitProductControlActionForProduct`; host cache reconciliation handles the host-only evolve-config marker. |
| preset load | full snapshot | `usePresetEngineSync` passes `reason: 'preset-load'` and `forceFullSnapshot: true`; this is an allowed snapshot path. |
