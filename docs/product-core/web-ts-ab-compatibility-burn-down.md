# web-ts / A-B Compatibility Burn-Down

Production Product Core remains the main `core-product` path:

```text
ProductEnginePort
  -> WebProductEngine
  -> coreProductEngineHost
  -> AudioWorklet/WASM Product Core
  -> C ABI
```

Reference paths stay active only for explicit validation work. They are not dead code and they are not production fallbacks.

## Status Convention

Use these labels when touching Product Core runtime boundaries:

- `Status: Production`
- `Status: Reference / A-B / Keep Active`
- `Status: Keep Active — Archive Later`
- `Status: Test Only`
- `Status: Temporary Product Compatibility`

## Active Reference Inventory

| Import or Shim | Used By | Why Needed | Product-Native Replacement | Archive Condition | Status |
|---|---|---|---|---|---|
| `src/audio/reference/webTs/engine.ts` | `web-ts`, parity probes, browser comparison, product-test | Legacy reference runtime for A/B behavior checks | Complete Product Core DSP/control/event coverage | Product Core parity suite no longer requires web-ts comparison | Keep Active — Archive Later |
| `src/audio/coreEngineHost.ts` | `core-smoke`, smoke tests, parity/debug paths | Legacy core-smoke host compatibility | Product Core smoke/product runtime coverage | core-smoke and smoke-test workflows retire or move to Product Core-only checks | Keep Active — Archive Later |
| `src/audio/referenceAudioRuntime.ts` | dev/reference runtime switching, `ReferenceSelectedRuntime` | Central explicit loader for web-ts/core-smoke reference paths | None until reference runtime selection retires | No active A/B, product-test, or parity workflow imports it | Keep Active — Archive Later |
| `src/audio/reference/ReferenceSelectedRuntime.ts` | selected runtime bridge | Keeps reference loading outside Product runtime modules | Product-only selected runtime surface | Reference runtime selection is removed from supported debug workflows | Keep Active — Archive Later |
| `src/audio/reference/ReferenceAudioEngineDebugCompat.ts` | debug and parity inspection | Exposes Web Audio-only reference diagnostics without leaking them through `ProductEnginePort` | Product telemetry/debug events | Product telemetry covers all remaining debug workflows | Keep Active — Archive Later |
| `src/audio/sonicParityHarness.ts` | browser sonic parity, graph capture, route smoke | Shared harness for Product Core and reference runtime comparison | Product-only regression suite after reference retirement | A/B comparison is no longer required for release evidence | Keep Active — Archive Later |

## Staged Cleanup Plan

1. Keep reference and A/B files labeled before deleting anything.
2. Move parity/debug shaping out of `coreProductEngineHost.ts` into named Product host debug helpers.
3. Collapse Product-only no-op host forwarding layers only after boundary checks are updated and `web-ts` explicit selection still passes.
4. Keep `coreEngineHost.ts` boxed; do not production-refactor it except to keep reference workflows stable.
5. Centralize UI/control metadata one family at a time, marking A/B-only controls as archive-later.
6. Table-drive or generate one `KesshoProductEvents.cpp` subsystem at a time after parity evidence exists.

## Rules

- Do not add new production dependencies on `web-ts`.
- Do not delete `web-ts`, `core-smoke`, parity, smoke-test, or product-test paths while workflows depend on them.
- Do not silently fall back from Product Core to a reference runtime.
- Keep production and reference imports visibly separated.
