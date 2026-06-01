# web-ts Reference Engine

`web-ts` is the legacy TypeScript/Web Audio engine. It remains in the repository as a reference implementation during migration, under `src/audio/reference/webTs/engine.ts` rather than the production audio root.

Status: **Keep Active — Archive Later**. Keep it functional for product-test, A/B comparison, parity/debug workflows, smoke tests, and reference runtime validation. Do not delete, retire, or disable it until Product Core has replacement coverage and the A/B validation path no longer needs the reference runtime.

Allowed uses:

- parity and regression probes;
- browser comparison tools;
- migration harnesses;
- development-only engine switching through explicit reference query contexts.

Disallowed uses:

- production runtime default;
- Product Core fallback for missing behavior;
- production UI contracts that require Web Audio node access;
- silent replacement for Product Core crashes.

The production runtime default is `core-product`. The normal product mode list exposes only `core-product`; remaining `web-ts` access must stay behind explicit reference harnesses or dev query contexts and should not be used to justify keeping unsupported Product Core host methods alive.

The selected runtime compatibility bridge delegates reference loading through `src/audio/reference/ReferenceSelectedRuntime.ts`. Product-side runtime files must not dynamically import `referenceAudioRuntime` or load `web-ts` directly; they may only call the explicit reference bridge after `ProductAudioRuntimeSelection` has selected a dev/reference mode.

`npm run migration:no-web-ts-bundle` scans the production build output for forbidden legacy runtime markers after `npm run build`.

The active compatibility inventory and archive conditions are tracked in `docs/product-core/web-ts-ab-compatibility-burn-down.md`.
