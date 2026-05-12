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
| Exact patch bridge classification and retirement path exists | PASS | `core:product:patch-bridges`, `docs/kessho-product-patch-bridge-policy.md` | - |
| Snapshot adapter authority audit passes | PASS | `core:product:snapshot-authority` | - |
| Host state reconciliation tests pass | PASS | `core:product:host-reconciliation` | - |
| Dirty-diff/full-snapshot classification and telemetry pass | PASS | `core:product:dirty-diff`, `docs/kessho-product-control-classification.md` | - |
| Runtime fallback classification passes | PASS | `core:product:runtime-fallbacks`, `docs/kessho-product-runtime-fallback-classification.md` | - |
| Required telemetry/getter placeholders are closed or explicitly unsupported | PASS | `core:product:placeholder-getters`, `docs/kessho-product-placeholder-getter-classification.md` | all required placeholder getters are backed by Product Core telemetry/generated state or explicitly unsupported/hidden in `core-product` |
| Generated ABI hygiene gate passes | PASS | `core:product:schema`, `core:product:abi` | - |
| WASM artifact integrity gate passes | PASS | `core:product:wasm` | - |
| Product Core GitHub Actions workflow passes | LOCAL ONLY | `.github/workflows/product-core-ci.yml` | CI result must pass on the branch before promotion |
| Behavioral test quality gates pass | PASS | `core:product:ci`, `core:readiness:browser` | - |
| Pad preset family probes pass | PASS | `core:product:source-parity` | - |
| Broader Lead preset probes pass | PASS | `core:product:source-parity` | - |
| Drum source probes pass | PASS | `core:product:source-parity` | - |
| Piano and soundscape asset probes pass | PASS | `core:product:asset-manifest`, `core:product:sources`, `core:product:assets` | - |
| Representative scene/full-arrangement probes pass | PASS | `core:readiness:browser`, `docs/reports/kessho-core-parity-readiness-latest.md` | broader web-vs-Product scene parity still needs final promotion review |
| Sequencer dice/evolve/reset-home state exports to UI | PASS | `core:product:host-reconciliation`, sequencer UI state copy API, telemetry revision | - |
| Deterministic music engine closure passes | PASS | `core:product:determinism`, `docs/kessho-product-deterministic-music-closure.md` | - |
| FX/dynamics/master depth closure passes | PASS | `core:product:fx-depth`, `docs/kessho-product-fx-master-depth.md` | required dynamics matrix, sidechain, master gain staging, limiter/saturation/loudness telemetry, reset/tail/bypass, and disabled-FX CPU gates are covered |
| Native release proof passes or native default is explicitly deferred with a signed-off blocker | DEFERRED | `core:product:native-release`, `core:product:native-release-smoke`, `docs/kessho-product-native-release-proof.md` | native-default-deferred |
| p95/p99 CPU, underrun, heap, and asset-memory gates pass | PASS | `core:product:cpu` local p95/p99 render-latency and bounded simulated-underrun gate, `core:product:asset-manifest` decoded-byte and web worklet heap gates | - |
| No required unsupported UI/control methods remain | PASS | `core:product:runtime-fallbacks`, Product host method audit, `core-product` range-key UI gating | - |

## Promotion Blockers

- `native-default-deferred`: Local native bridge, smoke, stem timing, and render-thread static proof exist, but live device CPU/battery/thermal, route/session, hardware timing, and release bundle decode proof are not complete.

## Default Rule

The web runtime default must stay `core-bridge` while this document is `BLOCKED` or `web-default-deferred`. `core-product` may be requested explicitly with the runtime query parameter for migration probes.
