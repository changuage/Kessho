# Product Core Architecture

Kessho production audio is owned by C++ Product Core. React and TypeScript own product state, UI interaction, asset decode/registration, browser hosting, and diagnostics plumbing; they must not own production DSP fallback behavior.

## Runtime Boundary

```text
React UI
  -> ProductEnginePort
  -> WebProductEngine
  -> coreProductEngineHost
  -> AudioWorklet + WASM Product Core
  -> KesshoProductCore C ABI
```

`ProductEnginePort` is the app-facing boundary. It exposes product lifecycle, product events, snapshot patches, assets, telemetry, sequencer UI state, and diagnostics. It must not expose `AudioNode`, `GainNode`, `AnalyserNode`, `AudioContext`, `AudioWorkletNode`, `MediaStream`, or other browser audio implementation objects.

## Reference Engine

The legacy TypeScript/Web Audio engine is reference-only and lives under `src/audio/reference/webTs/engine.ts`. It remains useful for parity probes, migration tests, and comparisons, but it is not the production runtime contract. Production paths must default to `core-product`, and any remaining `web-ts` use must be explicit reference or development tooling.

## Host Responsibilities

The web Product Core host is allowed to:

- load and communicate with the Product Core worklet;
- encode generated Product snapshots and Product events;
- decode browser assets and register them with Product Core;
- expose Product telemetry and diagnostics;
- classify unsupported legacy surface as explicit crash boundaries.

The host is not allowed to:

- synthesize fake Product Core values for missing production behavior;
- silently fall back to legacy Web Audio nodes;
- hide unsupported getters behind nullable or no-op return values;
- reload full snapshots for routine controls that have Product events.

## Current Split

`coreProductEngineHost.ts` is still the orchestration point, but focused modules now own asset registration, diagnostics, Product patch reason classification, Lead preset data hydration, modulation range/runtime-walk bridging, adapter modulation/range dispatch bridging, journey morph dispatch bridging, live trigger callback bridging, sequencer callback bridging, evolved override callback bridging, bound runtime host-port dispatch, runtime lifecycle bridging, runtime read bridging, runtime telemetry callback bridging, runtime command dispatch bridging, sequencer UI telemetry reconciliation, generated sequencer event cache reconciliation, generic Product host invocation, telemetry shaping, and snapshot coordination under `src/audio/product/host/`, with MIDI behavior split into `CoreProductHostMidi.ts` and shared product types under `src/audio/product/`. The app-facing compatibility proxy routes the normal `core-product` target through `ProductEnginePort`/`ProductEngineProxy`; reference engines are loaded only through explicit dev/reference query contexts. The Product Core host export is no longer typed as the legacy `AudioEngine` shape, and host, app, and product-facing UI state now use the product-owned `ProductEngineState` contract. Product state/debug contracts, including FX ownership telemetry, are owned in `ProductEngineTypes.ts` rather than imported from `engineSharedTypes`.

The app-root runtime decomposition is incremental: product runtime switch state, switch labels, and cross-runtime CPU summary storage are isolated in `src/ui/productRuntimeUi.ts`, with `src/ui/audioEngineRuntimeUi.ts` retained only as a selected-runtime compatibility shim. Changed-state Product patch construction is isolated in `src/ui/audioEngineStatePatch.ts`, throttled engine parameter sync now lives in `src/ui/useAudioEngineParamSync.ts`, selected engine start/resume/suspend/preload/stop/output-gain routing now lives in `src/ui/useSelectedAudioEngineLifecycle.ts`, selected engine perf monitor/callback routing now lives in `src/ui/useSelectedAudioEnginePerf.ts`, iOS media-session setup/connect/stop ownership now lives in `src/ui/audioEngineMediaSession.ts`, and the legacy WebM/WAV/stem recording controller now lives in `src/ui/useAudioRecording.ts` with the Product Core recording bridge guard kept explicit. Product host diagnostics live in `CoreProductHostDiagnostics.ts` and surface through Product runtime diagnostics rather than raw Web Audio fallbacks.

Product asset ownership now supports both registration and unregistration through the web Product adapter, host registrar, runtime, and worklet message loop. That keeps the public `ProductEnginePort` asset lifecycle from advertising a browser-only buffer path or a throwing placeholder.

Runtime capability reporting is product-owned in `src/audio/product/ProductRuntimeCapabilityReport.ts`. The report combines generated Product schema/version/hash values, the C++ Product ABI/capability contract, host diagnostics, build mode, and the web-default native bridge deferral so release gates cannot imply unsupported native coverage.

The sequencer UI patch lane is retired from `ProductEnginePort`. Evolve config, pitch settings, sub-lane enabled edits, synth/drum step overrides, and home capture now use generated Product event batches with host cache reconciliation. The deleted bridge must not reappear as full snapshot reloads or one ProductEnginePort method per legacy setter.

Further host work should continue by extracting one behavior-preserving adapter at a time, then adding a gate that prevents the extracted concern from drifting back into the main host.
