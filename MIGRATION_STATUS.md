# Migration Status

The web-ts to product-core migration is operating in fast behavioral port mode. The target is user-visible behavioral parity with the old web-ts app through product-core APIs, not a 1:1 port of web-ts internals.

Current runtime ownership rule:

- Production app code reaches audio through `ProductEnginePort` / `productEngine`.
- `WebProductEngine` is the temporary web adapter for the product runtime.
- `coreProductEngineHost` and `src/audio/product/host/*` own product host internals.
- `web-ts` stays reference/parity only and is not a production runtime.

Current web-default scope:

- `core-product` is the production web runtime direction and `ProductEngineProxy` owns production runtime selection.
- `src/audio/engine.ts` and `src/audio/runtime.ts` must remain absent from the production audio root.
- The legacy TypeScript/Web Audio implementation lives under `src/audio/reference/webTs/engine.ts` for reference and parity only.
- Common live controls should use generated Product events, explicit product patches, or dirty-diff paths. Full snapshots are reserved for initial load, preset load, session restore, deterministic fixtures, schema/ABI validation, and classified structural changes.
- Native Product runtime support is deferred for the web-default release. `native-product` and `test-product` remain guarded placeholders until native render, asset, telemetry, and CI coverage exists.

Completion status:

- Batches 0-11 in `docs/product-core/migration-batch-ledger.md` are closed locally.
- Batch 12 is the current docs/status and stale-doc gate batch.
- Batch 13 must still pass before the web-default migration can be called complete.
- Batch 14 is required only for full native/cross-platform completion.
