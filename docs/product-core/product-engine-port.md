# ProductEnginePort

`ProductEnginePort` is the production UI engine interface in `src/audio/product/ProductEnginePort.ts`.

## Invariants

- The port is product-oriented, not Web Audio-oriented.
- The port exposes lifecycle, events, snapshot patches, assets, telemetry, sequencer state, diagnostics, and a runtime capability report.
- The port does not expose browser node types such as `AudioNode`, `GainNode`, `AnalyserNode`, `AudioContext`, `AudioWorkletNode`, or `MediaStream`.
- Missing Product Core behavior should be represented as a typed Product ticket, generated event, generated snapshot field, telemetry field, or explicit unsupported crash boundary.

## Production Methods

- `preload`, `start`, `stop`, `suspend`, and `resume` control runtime lifecycle.
- `updateSnapshotPatch`, `enqueueEvent`, and `enqueueEvents` are the production control path.
- Common live sequencer actions with generated ProductEvents, including clock division, swing, pitch binding, pitch settings, evolve config, step override, dice, reset-home, and home capture, must not reappear as one-off ProductEnginePort setters.
- `registerAsset` and `unregisterAsset` represent Product asset ownership without leaking decoded browser audio buffers through the UI boundary; the web adapter forwards both through the Product host/runtime/worklet lifecycle.
- `getProductState`, `getTelemetry`, `getSequencerUiState`, `getDiagnostics`, and `getCapabilityReport` expose Product-level state only.
- `getCapabilityReport` combines generated schema/hash facts, the C++ Product capability contract, host diagnostics, build mode, and the explicit native-bridge deferral state.
- `setStateChangeCallback`, `setTelemetryCallback`, `setPerfMonitorEnabled`, and `setDiagnosticsCallback` wire UI observers to product state.

## Verification

`npm run migration:product-boundary` verifies that Product port files do not expose Web Audio object types and that new production imports do not grow the legacy `AudioEngine` surface.

## Sequencer Generated Event Burn-down

`applySequencerUiPatch` is retired from the ProductEnginePort surface. The current Product Core sequencer bridge status is:

- `product-core-sequencer-evolve-config-events`: drum/synth lane evolve config edits now use generated Product `SetSequencerLane` event batches with a host-only evolve-config marker and `CoreProductSequencerEvolveConfigEventBridge` cache reconciliation.
- `product-core-sequencer-sub-lane-config-events`: sub-lane enabled edits now use ProductControl-committed generated Product events with host enabled-state replay. Host enabled-state and step-value caches are runtime-derived from committed events.
- `product-core-sequencer-step-override-events`: synth and drum step overrides now use generated step event batches with host cache reconciliation. Drum pitch offsets are carried as marked Product events and resolved against Product drum base MIDI before the runtime sync.
- `product-core-sequencer-pitch-settings-events`: complete for synth/drum pitch setting edits; `useSelectedAudioEngineSequencerControls` emits generated Product lane events and `CoreProductSequencerPitchSettingEventBridge` reconciles host adapter pitch state and synth note-range lane params.
- `product-core-sequencer-home-capture-events`: preset-home and lane-home capture now use ProductControl-committed generated Product events with force, pitch settings, and sub-lane state preserved through host cache reconciliation. The home snapshot store is runtime-derived cache captured from committed sequencer state.

CoreProductSequencerUiPatchBridge must stay deleted. Future sequencer work must not reintroduce individual legacy setter methods on `ProductEnginePort`, direct UI writers for host sequencer caches, or force full snapshot reloads for routine sequencer edits.
