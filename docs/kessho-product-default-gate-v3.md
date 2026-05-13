# Kessho Product Default Gate v3

Status: BLOCKED

Decision: web-default-deferred

Native decision: native-default-deferred

`core-product` remains a selectable migration runtime. It must not become the web default until Product Default Gate v3 is the last aggregator, every prerequisite report is fresh, every blocking row below is resolved or explicitly mapped, and native release proof is either complete or explicitly deferred with sign-off. The verified web default remains `core-bridge`.

## Enforcement

- `npm run core:product:ci` runs local Product Core CI prerequisites and then runs `npm run core:product:default-gate-v3` as the final command.
- `npm run core:product:ci:prereqs` runs the same prerequisite set for GitHub, writes `docs/reports/kessho-product-ci-latest.json`, and intentionally skips the final gate so the workflow can run `npm run core:product:default-gate-v3` as its final visible step.
- `npm run core:product:default-gate-v3` reads `docs/reports/kessho-product-ci-latest.json`, `docs/reports/kessho-core-parity-readiness-latest.json`, and `docs/reports/kessho-product-cpu-budget-latest.json`.
- `npm run core:product:default-gate-v3` writes `docs/reports/kessho-product-default-gate-v3-latest.json` and `docs/reports/kessho-product-default-gate-v3-latest.md`.
- Missing reports, reports older than the checked scripts/docs, failed prerequisite steps, deferred rows without owner/reason/follow-up/evidence, or browser flakiness debt block the gate.
- `core:product:default-gate-v2` is retained only as a compatibility alias for the v3 guard.

## Gate Matrix

| Requirement | Status | Quality | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| build/typecheck passes | PASS | static, machine-report | `type-check`, `build`, `docs/reports/kessho-product-ci-latest.json` | - |
| WASM build passes | PASS | static, machine-report | `core:build:wasm`, `docs/reports/kessho-product-ci-latest.json` | - |
| Schema/generation/ABI checks pass | PASS | static, machine-report | `core:product:generate`, `core:product:schema`, `core:product:abi`, `docs/reports/kessho-product-ci-latest.json` | - |
| WASM artifact integrity passes | PASS | browser/worklet, machine-report | `core:product:wasm`, `docs/reports/kessho-product-ci-latest.json` | - |
| Architecture boundary checks pass | PASS | static, machine-report | `core:product:architecture`, `docs/reports/kessho-product-ci-latest.json` | - |
| Reference isolation passes | PASS | static, machine-report | `core:product:reference-isolation`, `docs/kessho-product-reference-isolation.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Snapshot authority passes | PASS | static, machine-report | `core:product:snapshot-authority`, `docs/reports/kessho-product-ci-latest.json` | - |
| Patch bridge policy passes | PASS | static, integration, machine-report | `core:product:patch-bridges`, `docs/kessho-product-patch-bridge-policy.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Patch bridge sunset status is accepted temporary debt or blocker | DEFERRED_WITH_SIGNOFF | static, integration | `docs/kessho-product-patch-bridge-policy.md`, `core:product:patch-bridges` | exact Pad/Lead/Drum bridges remain temporary compatibility debt until Product Core reconstructs all shipped preset families from preset IDs plus bounded overrides |
| Host reconciliation behavioral proof passes | PASS | integration, machine-report | `core:product:host-reconciliation`, `docs/reports/kessho-product-ci-latest.json` | - |
| Dirty-diff/full-snapshot behavioral proof passes | PASS | integration, machine-report | `core:product:dirty-diff`, `docs/kessho-product-control-classification.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Runtime fallback behavioral proof passes | PASS | integration, machine-report | `core:product:runtime-fallbacks`, `docs/kessho-product-runtime-fallback-classification.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Placeholder telemetry/getter truthfulness passes | PASS | static, integration, machine-report | `core:product:placeholder-getters`, `docs/kessho-product-placeholder-getter-classification.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Source parity broadening passes | PASS | audio-render, browser/worklet, machine-report | `core:product:source-parity`, `docs/kessho-product-source-parity-broadening.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Scene/full-arrangement parity passes | BLOCKED | audio-render, browser/worklet, production-readiness | `core:readiness:browser`, `docs/reports/kessho-core-parity-readiness-latest.json` | broader scene/full-arrangement promotion review remains incomplete |
| Sequencer state export/UI sync passes | PASS | integration, machine-report | `core:product:host-reconciliation`, sequencer UI state copy API, telemetry revision, `docs/reports/kessho-product-ci-latest.json` | - |
| Deterministic music closure passes | BLOCKED | integration, audio-render, machine-report | `core:product:determinism`, `docs/kessho-product-deterministic-music-closure.md`, `docs/reports/kessho-product-ci-latest.json` | random lead/piano phrase generation and complete journey graph ownership remain incomplete |
| FX/dynamics/master depth passes | PASS | audio-render, machine-report | `core:product:fx-depth`, `docs/kessho-product-fx-master-depth.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Asset manifest/decode matrix passes | PASS | integration, audio-render, machine-report | `core:product:asset-manifest`, `core:product:assets`, `docs/kessho-product-asset-manifest-decode-matrix.md`, `docs/reports/kessho-product-ci-latest.json` | - |
| Browser readiness retry/flakiness report passes | PASS | browser/worklet, production-readiness, machine-report | `core:readiness:browser`, `docs/reports/kessho-core-parity-readiness-latest.json` | first-attempt stability is required for default promotion unless explicitly signed off |
| CPU p95/p99/underrun/heap reports pass | PASS | audio-render, production-readiness, machine-report | `core:product:cpu`, `core:product:asset-manifest`, `docs/reports/kessho-product-cpu-budget-latest.json`, `docs/kessho-product-asset-manifest-decode-matrix.md` | - |
| Native release proof passes or native default is explicitly deferred with sign-off | DEFERRED_WITH_SIGNOFF | native-device, production-readiness, machine-report | `core:product:native`, `core:product:native-release`, `core:product:native-build`, `core:product:native-release-smoke`, `docs/kessho-product-native-release-proof.md` | native-default-deferred |
| Status/default-gate consistency lint passes | PASS | static, machine-report | `core:product:default-gate-v3`, `docs/kessho-product-core-migration-status.md`, this document | - |
| Product Core componentization complete | PASS | static, integration, machine-report | `core:product:architecture`, focused Product Core source/header caps | - |
| Internal header decomposition complete | PASS | static, machine-report | `core:product:architecture`, focused `Product*.h` size caps | - |
| Second-stage mega-file split or size cap | PASS | static, machine-report | `core:product:architecture`, focused source/FX caps | - |
| Web adapter split or size cap | PASS | static, machine-report | `core:product:web-host`, `CoreProductFallbackDiagnostics.ts`, `CoreProductAssetAdapter.ts`, `CoreProductRuntimeAdapter.ts`, `CoreProductLegacyPresetCompat.ts` | - |
| Compatibility import retirement audit passes | PASS | static, machine-report | `core:product:reference-isolation`, `docs/kessho-product-reference-isolation.md` | - |
| Behavioral cleanup proof gates pass | PASS | integration, browser/worklet, machine-report | `core:product:host-reconciliation`, `core:product:dirty-diff`, `core:product:runtime-fallbacks`, `core:product:placeholder-getters`, `core:product:wasm` | - |
| Runtime fallback diagnostics expose required counters | PASS | integration, machine-report | `core:product:runtime-fallbacks`, `unsupportedControlCount`, `unsupportedGetterCount`, `lastUnsupportedMethod`, `lastUnsupportedMethodClass`, `runtimeFallbackDiagnosticCount`, `audioCriticalFallbackCount` | - |
| UI telemetry truthfulness passes | PASS | static, integration, machine-report | `core:product:placeholder-getters`, `docs/kessho-product-placeholder-getter-classification.md` | - |
| Source wrappers and graph checks pass | PASS | integration, audio-render, machine-report | `core:product:sources`, `core:product:graph`, `docs/reports/kessho-product-ci-latest.json` | - |
| Sequencer/harmony tests pass | PASS | integration, machine-report | `core:product:sequencer`, `core:product:harmony`, `docs/reports/kessho-product-ci-latest.json` | - |
| Native bridge checks pass | PASS | integration, native-device, machine-report | `core:product:native`, `docs/reports/kessho-product-ci-latest.json` | - |
| Scene-level nature policy and release asset behavior are mapped | DEFERRED_WITH_SIGNOFF | integration, production-readiness | `docs/kessho-product-asset-manifest-decode-matrix.md`, `core:product:asset-manifest` | live native release-bundle/decode and runtime eviction behavior remain native release blockers |
| Product Default Gate v3 ordering is enforced | PASS | static, production-readiness, machine-report | `scripts/run-kessho-product-ci.mjs`, `.github/workflows/product-core-ci.yml`, `core:product:workflow` | - |

## Blocker Mapping

| Item | Status | Owner | Reason | Target follow-up | Evidence |
| --- | --- | --- | --- | --- | --- |
| native-default-deferred | DEFERRED_WITH_SIGNOFF | Product Core migration owner | Local Swift build/smoke proves bridge wiring, but live iOS/macOS device and release-bundle behavior is not complete. | Add device CPU/battery/thermal, route/session, screen-off/background, hardware timing, stem timing, memory-pressure, Ogg/decode-format, and release-bundle asset evidence. | `docs/kessho-product-native-release-proof.md` |
| broader scene/full-arrangement parity | BLOCKED | Product Core source/parity owner | Browser readiness passes the current corpus, but final default promotion still needs broader scene/full-arrangement parity review. | Expand and sign off scene/full-arrangement corpus before default promotion. | `docs/reports/kessho-core-parity-readiness-latest.json` |
| deterministic music/journey ownership closure | BLOCKED | Product Core deterministic music owner | RNG, evolution, and journey phase contracts are guarded, but random lead/piano phrase generation and complete journey graph ownership remain incomplete. | Move remaining phrase/journey ownership into Product Core and update deterministic reports. | `docs/kessho-product-deterministic-music-closure.md` |
| exact Pad/Lead/Drum patch bridge retirement | DEFERRED_WITH_SIGNOFF | Product Core source owner | Exact patch arrays are temporary compatibility debt, not canonical musical ownership. | Prove each family reconstructable from generated preset IDs plus bounded user overrides, then remove bridge fields. | `docs/kessho-product-patch-bridge-policy.md` |
| native release asset/decode behavior | DEFERRED_WITH_SIGNOFF | Native Product Core owner | Web asset manifest and local native lookup are guarded, but release-bundle Ogg/decode, runtime eviction, and memory-pressure proof require target devices. | Add device/release proof and update native release report. | `docs/kessho-product-asset-manifest-decode-matrix.md`, `docs/kessho-product-native-release-proof.md` |
| web default promotion | BLOCKED | Product Core migration owner | Product Default Gate v3 is a hardening gate; default promotion is intentionally blocked while native and parity blockers remain. | Resolve or sign off every blocker and rerun v3 as the final aggregator. | `src/App.tsx`, this document |

## Default Rule

core-product must remain selectable but not default while this document is `BLOCKED` or `web-default-deferred`. The web runtime default must stay `core-bridge`; `core-product` may be requested explicitly with the runtime query parameter for migration probes.
