# Kessho Product Default Gate v3

Status: PASS

Decision: web-default-core-product

Native decision: native-default-deferred-web-default-not-blocked

`core-product` is the web default runtime. The old Web-vs-Core parity readiness gate is no longer a Product Core promotion prerequisite because it compared the legacy TypeScript reference engine against the Product Core renderer and did not prove the user-visible default path. Product default promotion is guarded by Product Core C++/WASM/native prerequisites plus a browser-runtime proof that opens the app with no `engine` query and captures audible Product Core output.

## Enforcement

- `npm run build` runs `npm run core:product:wasm` before TypeScript and Vite build output.
- `npm run core:product:ci:prereqs` runs Product Core prerequisites and writes `docs/reports/kessho-product-ci-latest.json`.
- `npm run core:product:browser-runtime` writes `docs/reports/kessho-product-browser-runtime-latest.json` and proves the default browser runtime is `core-product`.
- `npm run core:product:default-gate-v3` is the final local and GitHub gate.

## Gate Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Build/typecheck and Product WASM artifact checks pass | PASS | `build`, `core:build:wasm`, `core:product:wasm`, `docs/reports/kessho-product-ci-latest.json` |
| Browser default runtime is Product Core | PASS | `core:product:browser-runtime`, `docs/reports/kessho-product-browser-runtime-latest.json` |
| Pad synth is audible through default browser runtime | PASS | `default-pad-note` in `docs/reports/kessho-product-browser-runtime-latest.json` |
| Lead synth is audible through default browser runtime | PASS | `default-lead-note` in `docs/reports/kessho-product-browser-runtime-latest.json` |
| Samples and synths coexist through default browser runtime | PASS | `default-sample-and-synth` in `docs/reports/kessho-product-browser-runtime-latest.json` |
| Drum sequencer loops and strict bridge failures are covered | PASS | `core:product:sequencer`, `core:product:wasm`, `core:product:graph` |
| Runtime fallback and bridge strictness reports pass | PASS | `core:product:runtime-fallbacks`, `core:product:web-host`, `core:product:host-reconciliation` |
| CPU/heap budget reports pass | PASS | `core:product:cpu`, `docs/reports/kessho-product-cpu-budget-latest.json` |
| Native bridge/release proof is explicit | PASS | `core:product:native`, `core:product:native-release`; native default remains separately deferred for live-device evidence |

## Default Rule

core-product is the web default. `web-ts` remains an explicit reference/runtime comparison mode, and `core-smoke` remains an explicit dev smoke mode. Neither legacy path may silently replace `core-product` in the product app.
