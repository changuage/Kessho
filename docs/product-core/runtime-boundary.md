# Product Core Runtime Boundary

The production web runtime is `core-product`. Production UI reaches audio through `ProductEnginePort`, `productEngine`, product runtime hooks, and `ProductEngineProxy`.

## Production Path

```text
React UI
  -> ProductEnginePort / productEngine
  -> ProductEngineProxy
  -> WebProductEngine
  -> coreProductEngineHost and product/host modules
  -> AudioWorklet + WASM Product Core
  -> KesshoProductCore C ABI
```

`ProductEngineProxy` is the production runtime decision point. It must keep production requests on `core-product`; `web-ts`, `web-audio`, and `core-smoke` are not production runtimes.

## Reference Path

The legacy TypeScript/Web Audio engine lives at `src/audio/reference/webTs/engine.ts`. It may be used only by explicit dev, reference, parity, or smoke harnesses. Production UI and product runtime modules must not import it directly.

## Forbidden Production Paths

- Do not reintroduce root `src/audio/engine.ts`.
- Do not reintroduce root `src/audio/runtime.ts`.
- Do not import `coreProductEngineHost` from production UI.
- Do not expose `AudioNode`, `GainNode`, `AnalyserNode`, `AudioContext`, `AudioWorkletNode`, `MediaStream`, or other browser audio implementation objects from `ProductEnginePort`.
- Do not select `web-ts`, `web-audio`, `core-smoke`, `native-product`, or `test-product` as a production runtime unless that runtime has an implemented and gated Product Core path.

## Control Routing

Routine sliders, toggles, sequencer edits, transport changes, journey macro moves, FX sends, and mute/solo changes should use generated Product events, explicit product patches, or dirty-diff paths. Full snapshots are allowed for initial load, preset load, session restore, deterministic fixtures, schema/ABI validation, and classified structural changes only.
