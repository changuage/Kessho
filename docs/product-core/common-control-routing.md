# Common control routing

This inventory records production control paths as of Batch 2. It is a routing map, not a behavior change.

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
| Source level, enabled, mute/solo-style toggles | `useAudioEngineParamSync` -> `productEngine.updateSnapshotPatch('ui-control-change', patch)` -> `WebProductEngine.updateSnapshotPatch` -> host product patch apply path -> dirty-diff events or classified full snapshot fallback | Generated `ProductEvent` param updates or explicit dirty-diff bridge | partial | Batch 3 Group A removed the host `updateParamsWithReason` route from product patches; remaining debt is direct generated-event routing for routine source controls. |
| Source morph, distance, expression, envelope controls | `useAudioEngineParamSync` infers `morph-control-change` for morph/distance/expression keys -> `productEngine.updateSnapshotPatch` -> dirty-diff source param/source override events where bounded | Generated Product param events or explicit dirty-diff bridge | partial | Batch 3 Group C gives source morph/distance/expression patches an explicit product reason; remaining debt is direct generated-event routing from routine source expression controls. |
| FX sends and mix/depth controls | `useAudioEngineParamSync` infers `fx-control-change` for FX/routing keys -> `productEngine.updateSnapshotPatch` -> `WebProductEngine.updateSnapshotPatch` -> host product patch apply path -> generated Product param/routing events or classified full snapshot fallback | Generated Product param events or explicit dirty-diff bridge | partial | Batch 3 Group B gives FX/routing patches an explicit product reason while preserving the dirty-diff adapter path; remaining debt is direct generated-event routing for routine FX controls. |
| Journey enable, morph phase, rate, macro controls | Journey/morph runtime surfaces call `scheduleAudioEngineParamUpdate(..., { reason: 'journey-morph-change' })` or `morph-control-change` -> dirty-diff journey/source events where supported | Generated journey events or explicit journey patch path | partial | `CoreProductRuntimeAdapter` already has journey event helpers; Group C labels the live morph path without changing morph timing or sonic behavior. |
| Transport tempo/meter/swing fields stored in product state | `useAudioEngineParamSync` infers `transport-change` for tempo/clock keys -> `productEngine.updateSnapshotPatch` -> dirty-diff transport param events | Generated transport Product events or explicit transport patch path | partial | Batch 4 labels transport tempo/clock patches before host classification; playback lifecycle start/stop is separate and uses Product runtime lifecycle APIs. |
| Playback start/stop/suspend/resume/output fade | Product runtime playback/lifecycle hooks -> `ProductEnginePort.start/stop/suspend/resume/setOutputGain` | Product runtime lifecycle commands | ok | Not a legacy `updateParams` control path. |
| Preset load | `usePresetEngineSync.syncCoreProductAppliedPreset` -> `scheduleAudioEngineParamUpdate(..., { reason: 'preset-load', forceFullSnapshot: true })` | Full snapshot | allowed | Preset load is an allowed full-snapshot reason. |
| Session restore / initial runtime bootstrap | Product runtime start/preload paths -> initial Product snapshot load | Full snapshot | allowed | Initial load/session restore are allowed full-snapshot reasons. |
| Sequencer clock divisions and swing | `useSelectedAudioEngineSequencerControls` -> `productEngine.enqueueEvents(createCoreProductSequencerClockDivisionEvents/SequencerSwingEvents)` | Generated Product events | ok | Already on event path. |
| Sequencer pitch binding mode | `useSelectedAudioEngineSequencerControls` -> `productEngine.enqueueEvents(createCoreProductSequencerPitchBindingModeEvents)` | Generated Product events | ok | Already on event path. |
| Sequencer reset home and dice/evolve trigger commands | `useSelectedAudioEngineSequencerControls` -> `productEngine.enqueueEvent(createCoreProductSequencerResetHomeEvent/DiceEvent)` | Generated Product events | ok | Already on event path. |
| Sequencer state sliders and lane fields | `useAudioEngineParamSync` infers `sequencer-control-change` for Euclidean/chord progression keys -> `productEngine.updateSnapshotPatch` -> dirty-diff sequencer lane param events where bounded | Generated Product events or explicit product sequencer patch bridge | partial | Batch 4 labels state-driven sequencer patches before host classification; dirty-diff adapter emits generated lane param events for bounded lane changes. |
| Sequencer evolve config edits | `productEngine.applySequencerUiPatch({ kind: 'drum-evolve-configs' / 'synth-evolve-configs' })` -> temporary host sequencer UI patch bridge | Generated Product event batch or explicit product sequencer patch bridge | partial | Explicit product sequencer patch lane, not full snapshot reload; remaining ticket is replacing cache-shaped payloads where Product events can update runtime and host caches atomically. |
| Sequencer sub-lane enabled edits | `productEngine.applySequencerUiPatch({ kind: '*-sub-lane-enabled' })` | Generated Product sub-lane config events or explicit product sequencer patch bridge | partial | Explicit product sequencer patch lane; event builders exist for sub-lane config but host/UI cache reconciliation still uses the temporary patch bridge. |
| Sequencer pitch settings and step overrides | `productEngine.applySequencerUiPatch({ kind: 'synth-pitch-settings' / '*-step-overrides' })` | Generated Product step/value/config events or explicit product patch bridge | partial | Explicit product sequencer patch lane; this remains the largest sequencer compatibility area but no longer depends on full snapshot reloads. |
| Sequencer preset home snapshots and lane home capture | `productEngine.applySequencerUiPatch({ kind: 'preset-home-snapshots' / 'capture-*-lane-home' })` | Explicit product sequencer home/capture event or patch path | partial | Host cache ownership still needs a product-shaped event contract, but the current path is an explicit product patch bridge. |
| Manual synth notes, drum triggers, MIDI | Product runtime surfaces -> `ProductEnginePort.auditionSynthNote`, `triggerDrumVoice`, or `pushMidiMessage` | Product event/command path | ok | Not part of legacy slider snapshot routing. |
| Asset reference changes and soundscape structured changes | Changed-state patch -> dirty-diff where fade/removal can be represented, otherwise classified full snapshot | Product asset registration plus bounded asset/source events where possible | partial | Full snapshot remains allowed for unbounded asset/source structure changes; Batch 3/4 should avoid using this for routine level/mute toggles. |

## Open Tickets

- TODO(product-core-control-routing-slider): replace routine slider/source/journey patch entry with generated Product events where direct event builders exist; the current product patch entry is explicitly dirty-diff based and no longer routes through host `updateParamsWithReason`.
- TODO(product-core-control-routing-fx): replace FX/routing patch inference with direct generated Product event dispatch where UI controls already map cleanly to generated FX/routing params.
- TODO(product-core-control-routing-morph): replace journey and source morph patch inference with direct generated Product event dispatch once the UI surfaces can emit bounded Product events without preset-state reconciliation loss.
- TODO(product-core-control-routing-transport): replace transport patch inference with direct generated Product events where UI controls already map cleanly to generated transport params.
- TODO(product-core-control-routing-sequencer): replace temporary sequencer UI patch bridge payloads with generated Product event batches where Product events can update runtime and host caches atomically.
- TODO(product-core-control-routing-asset): keep full snapshots for asset/source structure only; move routine asset level and source enable/mute changes to dirty-diff/event paths.

## Batch 4 Operation Manifest

| Operation | Expected mode | Current evidence |
|---|---|---|
| playback start/stop/suspend/resume/output fade | lifecycle command | Product runtime lifecycle hooks call `ProductEnginePort.start/stop/suspend/resume/setOutputGain`. |
| transport tempo/clock edit | dirty-diff product patch | `useAudioEngineParamSync` infers `transport-change`; `CoreProductRuntimeAdapter.appendTransportDiffs` emits generated transport param events. |
| sequencer lane state edit | dirty-diff product patch | `useAudioEngineParamSync` infers `sequencer-control-change`; `CoreProductRuntimeAdapter.appendSequencerLaneDiffs` emits generated lane param events for bounded lane changes. |
| sequencer clock division / swing / pitch binding / reset / dice | generated Product event | `useSelectedAudioEngineSequencerControls` uses `enqueueEvent` / `enqueueEvents`. |
| sequencer sub-lane / step override / pitch settings / home capture | explicit product sequencer patch | `useSelectedAudioEngineSequencerControls` uses `applySequencerUiPatch`, ticketed as temporary compatibility. |
| preset load | full snapshot | `usePresetEngineSync` passes `reason: 'preset-load'` and `forceFullSnapshot: true`; this is an allowed snapshot path. |
