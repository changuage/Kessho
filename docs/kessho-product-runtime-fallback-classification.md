# Kessho Product Runtime Fallback Classification

`core-product` runtime fallbacks are temporary diagnostics, not architecture. Unknown update/control methods must not silently disappear.

## safe-visual-fallback

Read-only visual getters may return `null` only when the UI can safely hide an optional visual surface without changing audio behavior.

## temporary-missing-product-telemetry

Telemetry/debug getters may return `null` while a tracked Product Core telemetry/debug API is missing. Gate I must either back these with Product telemetry, hide the UI, or keep a tracked blocker.

## reference-only-web-ts-behavior

Legacy behavior that is meaningful only in `web-ts` reference mode may be classified here. It must not become the production `core-product` path.

## forbidden-production-fallback

Missing setters, updates, resets, dice/evolve controls, triggers, MIDI/event pushes, asset registration, startup, and audition controls are audio-critical. In development, these throw. In production, they increment `unsupportedControlCount` and log once.

## Enforcement

- `RuntimeFallbackClassification` is the closed classification vocabulary.
- `classifyCoreProductRuntimeFallback` owns the classification.
- `reportRuntimeFallback` increments diagnostics for every fallback use.
- `reportedRuntimeFallbacks` guarantees production logging is once per missing method.
- The `core-product` proxy throws in development for `forbidden-production-fallback`.
- Unmapped modulation range keys are classified as `forbidden-production-fallback`.
- Required App callsites are statically audited against `CoreProductEngineHost` so current UI controls cannot depend on the diagnostic proxy.
- Unsupported dual-mode slider ranges are hidden in `core-product`; only Product-mapped range keys can enter walk/sample-hold mode for that runtime.
