# Product Core Testing And Release Gates

This page records the web-default release gate shape. Run the focused batch gates during migration; run the final web-default suite only for Batch 13 release proof.

The web-default runtime under proof is `core-product`; `web-ts` remains reference-only throughout these gates.

## Batch 12 Docs Gate

```bash
npm run migration:docs
npm run migration:product-boundary
npm run core:product:reference-isolation
```

These commands prove the public docs match the runtime boundary, the Product Engine boundary rejects stale imports and raw Web Audio types, and reference `web-ts` code remains quarantined.

## Batch 13 Web-Default Release Proof

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
npm run core:product:reference-isolation
npm run migration:no-web-ts-bundle
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:dirty-diff
npm run core:product:patch-bridges
npm run core:product:snapshot-authority
npm run core:product:web-host
npm run core:product:browser-runtime
npm run core:product:cpu
npm run migration:docs
npm run core:product:ci
```

If available in the current checkout, also run:

```bash
npm run migration:no-unsupported-product-surface
npm run migration:runtime-production-gates
npm run core:product:generate
node scripts/check-generated-files-clean.mjs
```

## Web-Default Signoff

The web-default migration is complete only when Batch 13 passes and the source signoff proves:

- root `src/audio/engine.ts` and `src/audio/runtime.ts` are absent;
- production UI reaches audio through Product runtime surfaces and `ProductEnginePort`;
- `web-ts` and `core-smoke` are dev/reference/parity-only and absent from production bundles;
- common live controls route through Product events, explicit product patches, or dirty diffs instead of legacy `updateParams` semantics;
- runtime fallback, unsupported getter, and disallowed full-snapshot counters stay at zero in the focused gates;
- native Product runtime is documented as deferred for web default, or native tests pass before native is advertised.

Batch 14 is outside web-default scope and is required only for full native/cross-platform Product Core completion.
