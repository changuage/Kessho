# ProductEnginePort

`ProductEnginePort` is the production UI engine interface in `src/audio/product/ProductEnginePort.ts`.

## Invariants

- The port is product-oriented, not Web Audio-oriented.
- The port exposes lifecycle, events, snapshot patches, assets, telemetry, sequencer state, and diagnostics.
- The port does not expose browser node types such as `AudioNode`, `GainNode`, `AnalyserNode`, `AudioContext`, `AudioWorkletNode`, or `MediaStream`.
- Missing Product Core behavior should be represented as a typed Product ticket, generated event, generated snapshot field, telemetry field, or explicit unsupported crash boundary.

## Production Methods

- `preload`, `start`, `stop`, `suspend`, and `resume` control runtime lifecycle.
- `updateSnapshotPatch`, `enqueueEvent`, and `enqueueEvents` are the production control path.
- `registerAsset` and `unregisterAsset` represent Product asset ownership without leaking decoded browser audio buffers through the UI boundary.
- `getProductState`, `getTelemetry`, `getSequencerUiState`, and `getDiagnostics` expose Product-level state only.
- `setStateChangeCallback`, `setTelemetryCallback`, `setPerfMonitorEnabled`, and `setDiagnosticsCallback` wire UI observers to product state.

## Verification

`npm run migration:product-boundary` verifies that Product port files do not expose Web Audio object types and that new production imports do not grow the legacy `AudioEngine` surface.
