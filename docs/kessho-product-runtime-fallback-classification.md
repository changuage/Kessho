# Kessho Product Runtime Fallback Classification

`core-product` runtime fallbacks are temporary diagnostics, not architecture. Unknown update/control methods must not silently disappear. No runtime fallback is classified as safe only because it is visual; unsupported visual/debug getters are retired from the Product Core host and guarded away from `core-product` UI paths.

## forbidden-production-fallback

Missing setters, updates, resets, dice/evolve controls, triggers, MIDI/event pushes, asset registration, startup, audition controls, and legacy `web-ts` helpers are audio-critical. All missing `core-product` proxy methods are `forbidden-production-fallback`: they throw, increment diagnostics, and log once per missing method in production.

All missing `core-product` proxy methods throw.
Diagnostics still increment and production logging remains once per missing method.

Runtime fallback diagnostics exposed through Product Core host telemetry/perf snapshots:

- `unsupportedControlCount`
- `unsupportedGetterCount`
- `lastUnsupportedMethod`
- `lastUnsupportedMethodClass`
- `runtimeFallbackDiagnosticCount`
- `audioCriticalFallbackCount`

## Enforcement

- `RuntimeFallbackClassification` is the closed classification vocabulary.
- `classifyCoreProductRuntimeFallback` owns the classification.
- Getter fallback policy documentation remains closed-list through `CORE_PRODUCT_GETTER_POLICIES`, but every missing getter still classifies as `forbidden-production-fallback`.
- Reference-only fallback classification is not allowed in `core-product`; legacy `web-ts` behavior must live in explicit reference harnesses.
- Retired visual/debug getters remain absent from the Product Core host and guarded away from `core-product` UI paths so they do not increment runtime fallback diagnostics during normal product use.
- The app runtime proxy may return `null` only for the pre-init `getAudioContext` lifecycle probe; limiter and media-stream getters must reach an initialized engine or throw.
- `reportRuntimeFallback` increments diagnostics for every fallback use.
- `reportedRuntimeFallbacks` guarantees production logging is once per missing method.
- The `core-product` proxy throws for every missing method or getter.
- Unmapped modulation range keys are classified as `forbidden-production-fallback`.
- Required App callsites are statically audited against `CoreProductEngineHost` so current UI controls cannot depend on the diagnostic proxy.
- Unsupported native range keys keep the same dual-mode UI state machine in `core-product`; unsupported keys report diagnostics when a runtime range is sent, instead of hiding saved slider mode/range state.
