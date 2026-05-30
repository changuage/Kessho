# Kessho

Kessho is a deterministic generative music application backed by C++ Product Core. The production web runtime is `core-product`; the legacy TypeScript/Web Audio engine remains reference-only as `web-ts` for parity probes and migration comparison.

React and TypeScript own the product UI, state encoding, browser hosting, asset decode/registration, and diagnostics. Production DSP, sequencing semantics, source rendering, FX routing, and CPU-critical audio behavior belong in Product Core behind `ProductEnginePort`.

## Quick Start

```bash
npm install
npm run dev
npm run build
npm run preview
npm run core:product:ci
```

The app is available at `http://localhost:5173` in development.

## Product Core Architecture

Production audio flows through:

```text
React UI
  -> ProductEnginePort
  -> WebProductEngine
  -> coreProductEngineHost
  -> AudioWorklet + WASM Product Core
  -> KesshoProductCore C ABI
```

The Product boundary must not expose browser Web Audio objects such as `AudioNode`, `GainNode`, `AnalyserNode`, or `MediaStream`. Missing Product Core behavior should be implemented as generated Product events, generated snapshot fields, telemetry, or explicit unsupported crash boundaries. It should not silently fall back to `web-ts`.

Primary verification commands:

```bash
npm run migration:product-boundary
npm run migration:docs
npm run core:product:runtime-fallbacks
npm run core:product:cpu
npm run core:product:browser-runtime
npm run core:product:ci
```

Architecture docs live in `docs/product-core/`.

## Project Structure

```text
src/
  main.tsx
  App.tsx
  ui/
    state.ts
  audio/
    product/
    coreProductEngineHost.ts
    generated/
    reference/webTs/
    rng.ts
    scales.ts
    harmony.ts
cpp/
  KesshoCore/
    schema/
    generated/
    include/KesshoCore/
    src/product/
docs/
  product-core/
```

Production code must not add a root `src/audio/engine.ts` or `src/audio/runtime.ts` path. Reference and parity code should import the legacy implementation from `src/audio/reference/webTs/engine.ts`.
