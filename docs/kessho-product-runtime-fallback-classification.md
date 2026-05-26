# Kessho Product Runtime Fallback Classification

`core-product` runtime fallbacks are temporary diagnostics, not architecture. Unknown update/control methods must not silently disappear. No runtime fallback is classified as safe only because it is visual; explicitly hidden Product Core getters are implemented host methods that throw a hard API-boundary error before fallback diagnostics run.

## temporary-missing-product-telemetry

Telemetry/debug getters may be classified here only through `CORE_PRODUCT_GETTER_POLICIES` while a tracked Product Core telemetry/debug API is missing. Gate I must either back these with Product telemetry, hide the UI, or keep a tracked blocker. The missing `core-product` proxy method still throws.

## reference-only-web-ts-behavior

Legacy behavior that is meaningful only in `web-ts` reference mode may be classified here only through `CORE_PRODUCT_REFERENCE_ONLY_METHODS`. Broad unknown legacy methods are `forbidden-production-fallback` by default.

## forbidden-production-fallback

Missing setters, updates, resets, dice/evolve controls, triggers, MIDI/event pushes, asset registration, startup, and audition controls are audio-critical. All missing `core-product` proxy methods throw. Diagnostics still increment and production logging remains once per missing method.

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
- Getter fallbacks are closed-list through `CORE_PRODUCT_GETTER_POLICIES`; broad `get*`, `*Telemetry`, `*Debug`, and `*Analyser` substring fallback classification is forbidden.
- Reference-only fallbacks are closed-list through `CORE_PRODUCT_REFERENCE_ONLY_METHODS`; broad non-critical legacy fallback classification is forbidden.
- Explicitly hidden getters throw through `explicitlyUnsupportedGetter` and do not increment runtime fallback diagnostics.
- The app runtime proxy may return `null` only for pre-init lifecycle getters (`getAudioContext`, `getLimiterNode`, `getMediaStream`); it must not synthesize telemetry, analyser, debug, stem-node, or preset-preview getter values before the selected engine is loaded.
- `reportRuntimeFallback` increments diagnostics for every fallback use.
- `reportedRuntimeFallbacks` guarantees production logging is once per missing method.
- The `core-product` proxy throws for every missing method or getter.
- Unmapped modulation range keys are classified as `forbidden-production-fallback`.
- Required App callsites are statically audited against `CoreProductEngineHost` so current UI controls cannot depend on the diagnostic proxy.
- Unsupported native range keys keep the same dual-mode UI state machine in `core-product`; unsupported keys report diagnostics when a runtime range is sent, instead of hiding saved slider mode/range state.
