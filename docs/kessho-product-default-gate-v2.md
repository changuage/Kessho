# Kessho Product Default Gate v2

Status: BLOCKED

Decision: web-default-deferred

Native decision: native-default-deferred

`core-product` remains a selectable migration runtime. It must not become the web default until every Product Default Gate v2 requirement below is passing, or until a signed-off blocker explicitly defers the affected platform default. The verified web default remains `core-bridge`.

## Enforcement

- `npm run core:product:default-gate-v2` verifies this document, the runtime default, CI coverage, and the known blocker tokens.
- `npm run core:product:workflow` verifies the Product Core GitHub Actions path triggers and required workflow commands.
- `npm run core:product:ci` includes the default-gate guard.
- `.github/workflows/product-core-ci.yml` runs the default-gate guard on Product Core contract, generated binding, host, native bridge, docs, and workflow changes.
- `npm run core:readiness:browser` remains the browser readiness evidence command, not default promotion authority by itself.
- `npm run core:product:native-release-smoke` remains the local native render golden, not native default release approval by itself.

## Gate Matrix

| Requirement | Status | Evidence | Blocker |
| --- | --- | --- | --- |
| Product Core componentization complete | PASS | `core:product:architecture` | - |
| Internal header decomposition complete | PASS | `core:product:architecture`, focused `Product*.h` size caps | - |
| Second-stage mega-file split or size cap | PASS | `core:product:architecture` caps `ProductSources.cpp` and `ProductFx.cpp` | further split is required before either file exceeds its Product Core cap |
| Web adapter split or size cap | BLOCKED | `CoreProductFallbackDiagnostics.ts`, `CoreProductAssetAdapter.ts`, `core:product:web-host` | `coreProductEngineHost.ts` and `coreProductSnapshot.ts` still need further adapter decomposition before default promotion |
| Compatibility import retirement audit | PASS | `core:product:reference-isolation`, `docs/kessho-product-reference-isolation.md` | - |
| Exact patch bridge classification and retirement path exists | PASS | `core:product:patch-bridges`, `docs/kessho-product-patch-bridge-policy.md` | - |
| Snapshot adapter authority audit passes | PASS | `core:product:snapshot-authority` | - |
| Host state reconciliation tests pass | PASS | `core:product:host-reconciliation` | - |
| Dirty-diff/full-snapshot classification and telemetry pass | PASS | `core:product:dirty-diff`, `docs/kessho-product-control-classification.md` | - |
| Runtime fallback classification passes | PASS | `core:product:runtime-fallbacks`, `docs/kessho-product-runtime-fallback-classification.md` | - |
| Required telemetry/getter placeholders are closed or explicitly unsupported | PASS | `core:product:placeholder-getters`, `docs/kessho-product-placeholder-getter-classification.md` | all required placeholder getters are backed by Product Core telemetry/generated state or explicitly unsupported/hidden in `core-product` |
| Generated ABI hygiene gate passes | PASS | `core:product:schema`, `core:product:abi` | - |
| WASM artifact integrity gate passes | PASS | `core:product:wasm` | - |
| Product Core GitHub Actions workflow passes | BLOCKED | `.github/workflows/product-core-ci.yml` | Product Core workflow must complete all required commands on `main`, including browser readiness, before promotion |
| Status/default-gate consistency lint passes | PASS | `core:product:default-gate-v2` | - |
| Gate quality classification exists | BLOCKED | static and behavioral gate scripts are present | every Product Default Gate row still needs explicit static/integration/audio-render/browser/native/production-readiness classification |
| Behavioral cleanup proof gates pass | BLOCKED | `core:product:host-reconciliation`, `core:product:dirty-diff`, `core:product:runtime-fallbacks`, `core:product:placeholder-getters`, `core:product:wasm` | stale WASM/schema mismatch and full-snapshot preservation still need broader runtime/worklet proof beyond static guards |
| Behavioral test quality gates pass | BLOCKED | `core:product:ci`, `core:readiness:browser` | current Product Core workflow/browser readiness evidence is not passing on `main` |
| Pad preset family probes pass | PASS | `core:product:source-parity` | - |
| Broader Lead preset probes pass | BLOCKED | `core:product:source-parity` | broader web-vs-Product Lead preset parity still needs completion before default promotion |
| Drum source probes pass | PASS | `core:product:source-parity` | - |
| Piano and soundscape asset probes pass | PASS | `core:product:asset-manifest`, `core:product:sources`, `core:product:assets` | - |
| Representative scene/full-arrangement probes pass | BLOCKED | `core:readiness:browser`, `docs/reports/kessho-core-parity-readiness-latest.md` | broader web-vs-Product scene/full-arrangement sonic parity still needs final promotion review |
| Sequencer dice/evolve/reset-home state exports to UI | PASS | `core:product:host-reconciliation`, sequencer UI state copy API, telemetry revision | - |
| Deterministic music engine closure passes | BLOCKED | `core:product:determinism`, `docs/kessho-product-deterministic-music-closure.md` | random lead/piano phrase generation and complete journey state graph ownership remain incomplete |
| Journey morph ownership passes | BLOCKED | `core:product:determinism`, generated journey state events | complete journey preset/state graph ownership and broader automation targets remain incomplete |
| FX/dynamics/master depth closure passes | PASS | `core:product:fx-depth`, `docs/kessho-product-fx-master-depth.md` | required dynamics matrix, sidechain, master gain staging, limiter/saturation/loudness telemetry, reset/tail/bypass, and disabled-FX CPU gates are covered |
| Native release proof passes or native default is explicitly deferred with a signed-off blocker | DEFERRED | `core:product:native-release`, `core:product:native-release-smoke`, `docs/kessho-product-native-release-proof.md` | native-default-deferred |
| p95/p99 CPU, underrun, heap, and asset-memory gates pass | PASS | `core:product:cpu` local p95/p99 render-latency and bounded simulated-underrun gate, `core:product:asset-manifest` decoded-byte and web worklet heap gates | - |
| No required unsupported UI/control methods remain | PASS | `core:product:runtime-fallbacks`, Product host method audit, `core-product` range-key UI gating | - |

## Promotion Blockers

- `native-default-deferred`: Local native bridge, smoke, stem timing, and render-thread static proof exist, but live device CPU/battery/thermal, route/session, hardware timing, and release bundle decode proof are not complete.

## Default Rule

The web runtime default must stay `core-bridge` while this document is `BLOCKED` or `web-default-deferred`. `core-product` may be requested explicitly with the runtime query parameter for migration probes.
