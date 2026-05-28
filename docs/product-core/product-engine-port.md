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
- Common live sequencer actions that already have generated ProductEvents, including clock division, swing, pitch binding, dice, and reset-home, must not reappear as one-off ProductEnginePort setters.
- Host-owned sequencer UI cache operations that are not generated runtime events yet use `applySequencerUiPatch` as a single explicit product-shaped patch lane instead of many legacy `AudioEngine`-style setters.
- `registerAsset` and `unregisterAsset` represent Product asset ownership without leaking decoded browser audio buffers through the UI boundary; the web adapter forwards both through the Product host/runtime/worklet lifecycle.
- `getProductState`, `getTelemetry`, `getSequencerUiState`, `getDiagnostics`, and `getCapabilityReport` expose Product-level state only.
- `getCapabilityReport` combines generated schema/hash facts, the C++ Product capability contract, host diagnostics, build mode, and the explicit native-bridge deferral state.
- `setStateChangeCallback`, `setTelemetryCallback`, `setPerfMonitorEnabled`, and `setDiagnosticsCallback` wire UI observers to product state.

## Verification

`npm run migration:product-boundary` verifies that Product port files do not expose Web Audio object types and that new production imports do not grow the legacy `AudioEngine` surface.

## Sequencer UI Patch Burn-down

`applySequencerUiPatch` is temporary compatibility, not a permanent product runtime API. The currently blocked Product Core tickets are:

- `product-core-sequencer-evolve-config-events`: generated events or dirty product patches for drum/synth lane evolve configs.
- `product-core-sequencer-sub-lane-config-events`: generated events that atomically carry sub-lane enabled state, step count, direction, value mode, and range fields.
- `product-core-sequencer-step-override-events`: batched generated step events or dirty diffs for trigger toggles, probability, ratchet, trig condition, pitch, expression, morph, distance, slice, reverse, directions, and range-mode payloads.
- `product-core-sequencer-pitch-settings-events`: product-owned synth/drum pitch settings updates that do not depend on web host adapter caches.
- `product-core-sequencer-home-capture-events`: product-owned preset-home and lane-home capture semantics for synth and drum, including pitch settings and sub-lane state.

Until those tickets land, the web adapter may keep the explicit patch lane, but it must not reintroduce individual legacy setter methods on `ProductEnginePort` or force full snapshot reloads for routine sequencer edits.
