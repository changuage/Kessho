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

The legacy TypeScript/Web Audio engine is reference-only. It remains useful for parity probes, migration tests, and comparisons, but it is not the production runtime contract. Production paths must default to `core-product`, and any remaining `web-ts` use must be explicit reference or development tooling.

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

`coreProductEngineHost.ts` is still the orchestration point, but focused modules now own diagnostics and snapshot coordination under `src/audio/product/host/`, with MIDI behavior split into `CoreProductHostMidi.ts` and shared product types under `src/audio/product/`.

Further host work should continue by extracting one behavior-preserving adapter at a time, then adding a gate that prevents the extracted concern from drifting back into the main host.
