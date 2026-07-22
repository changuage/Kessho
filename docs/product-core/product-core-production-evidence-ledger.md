# Product-Core Production Evidence Ledger

## Current Source State

| Item | Status | Evidence |
|---|---|---|
| Git baseline | pass | `git rev-parse --short HEAD` -> `7dc9e6e7` |
| Dirty tree acknowledged | pass | Existing worktree has dirty/untracked files; production-readiness batches only modify related docs, gates, reports, and scoped Product evidence files. |
| `src/audio/engine.ts` absent | pass | `git ls-files src/audio/engine.ts src/audio/runtime.ts` produced no tracked files; `test ! -f src/audio/engine.ts` passed. |
| `src/audio/runtime.ts` absent | pass | `git ls-files src/audio/engine.ts src/audio/runtime.ts` produced no tracked files; `test ! -f src/audio/runtime.ts` passed. |
| `ProductEngineProxy` is production decision point | pass | `src/audio/product/ProductEngineProxy.ts` resolves `web-ts`, `web-audio`, and `core-smoke` production requests to `core-product`; `native-product` and `test-product` are guarded/unimplemented. |
| `web-ts` reference-only | pass | `src/audio/product/ProductAudioRuntimeSelection.ts` exposes only `core-product` in normal product mode; `web-ts` and `core-smoke` require explicit dev/reference contexts. |
| Production bundle excludes `web-ts` | pass | `npm run migration:no-web-ts-bundle` passed; scanned 35 production JS assets with no forbidden web-ts markers. |
| Native bridge scope | pass | Native reliable background audio remains gated by physical-device evidence; `supports_native_bridge` remains `0` and `supportsNativeBridge` remains `false` until BG3 signoff. |

## Batch Status

| Batch | Status | Validation | Notes |
|---|---|---|---|
| 0 Source-of-truth reconciliation | complete | `npm run type-check`: pass; `npm run migration:product-boundary`: pass; `npm run core:product:reference-isolation`: pass; `npm run migration:no-web-ts-bundle`: pass; `npm run migration:docs`: pass | Reconciled stale status docs with the completed web-default migration ledger and current production blocker evidence; updated boundary/reference-isolation gates to match current runtime-aware media-session and Product harmony control ownership. |
| 1 Control-routing cleanup | complete | `npm run type-check`: pass; `npm run core:product:patch-bridges`: pass; `npm run core:product:dirty-diff`: pass; `npm run core:product:snapshot-authority`: pass; `npm run core:product:runtime-fallbacks`: pass; `npm run core:product:getter-policies`: pass; `npm run core:product:web-host`: pass; `npm run migration:runtime-production-gates`: pass; extra `npm run migration:docs`: pass | `common-control-routing.md` no longer has vague `partial` rows. Routine source, morph, FX, journey, transport, and bounded sequencer controls are classified as generated Product event, explicit product patch, or dirty-diff paths; structural snapshots are explicitly limited. Runtime production gate now rejects future vague routing rows. |
| 2 Sonic stability and parity gates | complete | `npm run type-check`: pass; `npm run core:product:granular-artifacts`: pass; `npm run core:product:sample-hold-parity`: pass; `npm run core:product:reverb-tail-quality`: pass; `npm run core:product:browser-runtime`: pass; `npm run core:product:runtime-fallbacks`: pass; `npm run core:product:getter-policies`: pass; `npm run core:product:assets`: pass; `npm run core:product:source-parity`: pass; `npm run core:product:determinism`: pass; `npm run core:product:cpu`: pass; `npm run migration:runtime-production-gates`: pass; extra `npm run migration:docs`: pass | Sonic gates now include offline numeric Product Core WASM render metrics for granular dry-through/dense-grain transitions and reverb impulse-tail/parameter-transition/CPU-mode cases. |
| 3 CPU evidence and optimization | complete | `npm run type-check`: pass; `npm run core:product:cpu`: pass; `npm run core:product:web-cpu-comparison`: pass; `npm run core:product:page-cpu-comparison`: pass; `npm run test:mobile-web-hotpaths`: pass; `npm run core:product:browser-runtime`: pass; `npm run core:product:cpu-scenarios`: pass; `npm run migration:runtime-production-gates`: pass; extra `npm run migration:docs`: pass | CPU scenario signoff now requires fresh sonic render reports and emits module attribution for Earth/soundscape, granular, reverb, spectral freeze, visual telemetry, UI callbacks, and deferred native render callback evidence. |
| 4 Native/background audio evidence | complete | `npm run type-check`: pass; `npm run core:product:background-audio`: pass; `npm run core:product:background-audio-docs`: pass; `npm run core:product:background-audio-device-evidence`: pass; `npm run core:product:native-render-path`: pass; `npm run core:product:macos-native-smoke`: pass; `npm run core:product:macos-app-native-smoke`: pass; `npm run core:product:native-background-smoke`: pass; `npm run core:product:native-capability-signoff`: pass with `ready=false`; `npm run migration:runtime-production-gates`: pass; extra `npm run migration:docs`: pass | Browser/mobile remains best-effort. Native render/local macOS smoke gates pass, device-evidence rows remain pending, and `supports_native_bridge`/`supportsNativeBridge` stay disabled until physical evidence passes. |
| 5 Architecture debt cleanup | complete | `npm run type-check`: pass; `npm run core:product:host-reconciliation`: pass; `npm run core:product:architecture`: pass; `npm run core:product:dirty-diff`: pass; `npm run core:product:runtime-fallbacks`: pass; `npm run core:product:getter-policies`: pass; `npm run core:product:web-host`: pass; `npm run core:product:patch-bridges`: pass; `npm run migration:product-boundary`: pass; `npm run core:product:schema`: pass; `npm run core:product:param-accounting`: pass; `npm run core:product:source-parity`: pass; `npm run migration:runtime-production-gates`: pass; extra `npm run migration:docs`: pass | Behavior-preserving guard/accounting cleanup only. Updated boundary evidence for arp-aware Synth sub-lane routing and explicit Product-harmony parameter accounting for structured harmony controls. |
| 6 Final production signoff | complete for web/default Product Core; native release remains device-gated | `npm run core:product:ci`: pass, 39 passed / 0 failed; `npm run core:product:sequencer-ui`: pass; source signoff probes rerun | Final aggregate gate passes with Product Core as web default and no production `web-ts` fallback. Native reliable background audio remains blocked on physical iOS/macOS evidence; native bridge capability stays disabled. |

## Completion Audit

| Target | Status | Evidence |
|---|---|---|
| Web-default product-core production-ready | complete | Batch 6 final signoff passed: `npm run core:product:ci` reported 39 passed / 0 failed; `npm run migration:no-web-ts-bundle` scanned 35 production JS assets; source signoff confirmed `src/audio/engine.ts` and `src/audio/runtime.ts` are absent; `ProductEngineProxy` remains the production decision point; `web-ts` remains reference/parity-only. |
| Native reliable background audio | deferred / not release-ready | `npm run core:product:native-background-smoke` passed locally with peak `0.007992753759026527` and RMS `0.0038737312674353365`; `npm run core:product:background-audio-device-evidence` passed the ledger verifier with `allNativeRowsPassed=false`; `npm run core:product:native-capability-signoff` passed with `ready=false`; `npm run core:product:background-audio-device-checklist -- --write` generated `docs/reports/kessho-product-background-audio-device-checklist.md` and `--check` passed; all required physical rows remain pending and `supports_native_bridge` / `supportsNativeBridge` remain disabled. |
| Full product-core production-ready including native background audio | incomplete by design until device evidence exists | Required iOS/macOS physical-device rows are still pending: `ios-native-foreground`, `ios-native-screen-lock`, `ios-native-app-background`, `ios-native-control-center`, `ios-native-route-change`, `macos-native-hidden`, `macos-native-sleep-wake`. |

## Batch 0 Report

Changed files:

- `MIGRATION_STATUS.md`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/product-core-production-blocker-plan.md`
- `docs/product-core/product-core-production-evidence-ledger.md`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/check-product-engine-boundary.mjs`

Existing dirty files modified:

- none

Behavior changes:

- none; docs/source-of-truth reconciliation only.

Validation run:

- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `npm run migration:docs`: pass

Manual/device tests:

- not run; Batch 0 is source/docs reconciliation.

Skipped validation with reason:

- none yet

Batch exit status:

- complete

Remaining blockers:

- none for Batch 0.

Next batch:

- Batch 1 Common control routing cleanup.

## Batch 1 Report

Changed files:

- `docs/product-core/common-control-routing.md`
- `scripts/check-product-runtime-production-gates.mjs`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `scripts/check-kessho-product-snapshot-authority.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `src/audio/coreProductSnapshot.ts`
- `src/audio/coreProductSnapshotEncoder.ts`
- `docs/product-core/product-core-production-evidence-ledger.md`

Existing dirty files modified:

- `docs/product-core/product-core-production-evidence-ledger.md`: existing Batch 0 evidence file updated as required after Batch 1.

Behavior changes:

- none; routing classification, gate assertions, test fixture hydration, and formatting-only size-cap cleanup.
- Common live controls remain on Product events, explicit product patches, or dirty-diff paths.
- Full snapshots remain limited to allowed initial/preset/session/deterministic/schema/ABI/structural reasons.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:docs`: pass

Manual/device tests:

- not run; Batch 1 is static/runtime gate routing evidence.

Skipped validation with reason:

- none

Batch exit status:

- complete

Remaining blockers:

- none for Batch 1.

Next batch:

- Batch 2 Sonic stability and parity gates.

## Batch 2 Report

Changed files:

- `docs/product-core/product-debug-telemetry.md`
- `docs/product-core/product-core-production-evidence-ledger.md`
- `package.json`
- `scripts/check-kessho-product-deterministic-music.mjs`
- `scripts/check-kessho-product-granular-artifacts.mjs`
- `scripts/check-kessho-product-reverb-tail-quality.mjs`
- `scripts/check-product-runtime-production-gates.mjs`

Existing dirty files modified:

- `docs/product-core/product-core-production-evidence-ledger.md`: existing Batch 0/1 evidence file updated as required after Batch 2.
- `scripts/check-product-runtime-production-gates.mjs`: existing Batch 1 production gate extended to require the new sonic gates.

Behavior changes:

- none to runtime DSP or UI behavior.
- Added static/offline gates for granular artifact coverage and reverb tail-quality coverage.
- Reconciled the deterministic WASM fixture offsets with the current snapshot ABI after the harmony block moved source snapshots.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:sample-hold-parity`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:browser-runtime`: pass, report `docs/reports/kessho-product-browser-runtime-latest.json`
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:assets`: pass
- `npm run core:product:source-parity`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:cpu`: pass, report `docs/reports/kessho-product-cpu-budget-latest.md`
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:docs`: pass

Manual/device tests:

- not run; Batch 2 was covered by static, native C++, WASM, browser-runtime, and CPU evidence gates.

Skipped validation with reason:

- physical mobile/native background audio tests not run; they belong to Batch 4.

Batch exit status:

- complete

Remaining blockers:

- none for Batch 2.

Next batch:

- Batch 3 CPU evidence and optimization.

## Batch 3 Report

Changed files:

- `docs/product-core/product-cpu-governor-policy.md`
- `docs/product-core/product-core-production-evidence-ledger.md`
- `docs/reports/kessho-product-browser-runtime-latest.json`
- `docs/reports/kessho-product-browser-runtime-latest.md`
- `docs/reports/kessho-product-cpu-budget-latest.json`
- `docs/reports/kessho-product-cpu-budget-latest.md`
- `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `docs/reports/kessho-product-cpu-scenarios-latest.md`
- `docs/reports/kessho-product-page-cpu-comparison-latest.json`
- `docs/reports/kessho-product-page-cpu-comparison-latest.md`
- `docs/reports/kessho-product-web-cpu-comparison-latest.json`
- `docs/reports/kessho-product-web-cpu-comparison-latest.md`
- `package.json`
- `scripts/check-kessho-product-cpu-scenarios.mjs`
- `scripts/check-kessho-product-page-cpu-comparison.mjs`
- `scripts/check-kessho-product-web-cpu-comparison.mjs`
- `scripts/check-product-runtime-production-gates.mjs`

Existing dirty files modified:

- `docs/product-core/product-core-production-evidence-ledger.md`: existing evidence file updated as required after Batch 3.
- `package.json`: already modified in Batch 2; extended with `core:product:cpu-scenarios`.
- `scripts/check-product-runtime-production-gates.mjs`: already modified in Batches 1/2; extended to require CPU scenario and governor policy evidence.

Behavior changes:

- No product DSP, UI, or runtime behavior changes.
- CPU comparison harnesses now use the local dev/reference runtime path when measuring Web TS; production preview/build requests for `web-ts` continue to resolve to Product Core.
- Page CPU navigation is best-effort because audio scenario state is applied through parity capture state patches.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:cpu`: pass, report `docs/reports/kessho-product-cpu-budget-latest.md`
- `npm run core:product:web-cpu-comparison`: pass, Product Core 106.964% vs Web TS 111.725%, 4.26% saved
- `npm run core:product:page-cpu-comparison`: pass, Product Core won 8/9 rows, 7.30% weighted saved
- `npm run test:mobile-web-hotpaths`: pass
- `npm run core:product:browser-runtime`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:docs`: pass

Manual/device tests:

- not run; native iOS/macOS CPU evidence remains Batch 4 physical-device/native-render scope.

Skipped validation with reason:

- Native iOS render CPU and native macOS render CPU skipped because native Product Core render/device evidence is Batch 4 scope.

Batch exit status:

- complete

Remaining blockers:

- Earth page CPU measured 0.86% slower than dev/reference Web TS in the page matrix; record as CPU follow-up, not a Batch 3 blocker because weighted page CPU, heavy granular/reverb/dynamics/routing rows, native C++ CPU, and scenario gates passed.

Next batch:

- Batch 4 Native and background audio evidence.

## Batch 4 Report

Changed files:

- `docs/product-core/product-core-production-evidence-ledger.md`
- `docs/reports/kessho-product-background-audio-device-evidence-latest.json`
- `docs/reports/kessho-product-native-capability-signoff-latest.json`
- `package.json`
- `scripts/check-kessho-product-background-audio-support.mjs`

Existing dirty files modified:

- `docs/product-core/product-core-production-evidence-ledger.md`: existing evidence file updated as required after Batch 4.
- `package.json`: already modified in earlier batches; added `core:product:native-background-smoke` alias matching the Batch 4 plan.
- `scripts/check-kessho-product-background-audio-support.mjs`: existing dirty file from the broader background-audio work; extended to guard the new plan-level native background smoke alias.

Behavior changes:

- No product DSP/UI/runtime behavior changes.
- Added a package-script alias so `core:product:native-background-smoke` runs the existing macOS app background smoke.
- Native bridge capability remains disabled: `supports_native_bridge = 0` and `supportsNativeBridge: false`.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:background-audio`: pass
- `npm run core:product:background-audio-docs`: pass
- `npm run core:product:background-audio-device-evidence`: pass, all native rows still pending
- `npm run core:product:native-render-path`: pass
- `npm run core:product:macos-native-smoke`: pass
- `npm run core:product:macos-app-native-smoke`: pass, peak `0.007992753759026527`, RMS `0.0038737312674353365`
- `npm run core:product:native-background-smoke`: pass, peak `0.007992753759026527`, RMS `0.0038737312674353365`
- `npm run core:product:native-capability-signoff`: pass with `ready=false`
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:docs`: pass

Manual/device tests:

- not run in this local batch. Required physical rows remain pending: `ios-native-foreground`, `ios-native-screen-lock`, `ios-native-app-background`, `ios-native-control-center`, `ios-native-route-change`, `macos-native-hidden`, `macos-native-sleep-wake`.

Skipped validation with reason:

- Physical iOS/macOS device tests skipped because this environment cannot lock a physical iOS device, background an installed app, test Control Center/AirPods route changes, or perform real macOS hide/sleep/wake observation.

Batch exit status:

- complete for local/native-smoke evidence; release capability remains device-gated.

Remaining blockers:

- Native reliable background audio cannot be claimed until every required physical-device row is recorded as `pass` with evidence, tester, and date.
- `supports_native_bridge` must remain `0` and `supportsNativeBridge` must remain `false`.

Next batch:

- Batch 5 Architecture debt cleanup.

## Batch 5 Report

Changed files:

- `docs/product-core/product-core-production-evidence-ledger.md`
- `docs/reports/kessho-product-control-coverage-latest.json`
- `docs/reports/kessho-product-param-accounting-latest.json`
- `scripts/check-kessho-product-param-accounting.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/param-accounting/policies.mjs`

Existing dirty files modified:

- `docs/product-core/product-core-production-evidence-ledger.md`: existing evidence file updated as required after Batch 5.
- `scripts/check-product-engine-boundary.mjs`: already modified in Batch 0; adjusted the guard to accept the current arp-aware Synth sub-lane routing call.

Behavior changes:

- No product DSP, UI, or runtime behavior changes.
- Architecture and accounting gates now explicitly recognize structured harmony controls as Product-harmony-owned evidence and `harmonyGenerationSeed` as UI generation salt rather than a live Product param.
- No `web-ts` production fallback, ProductEngine boundary bypass, or normal-control full snapshot reload was introduced.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:architecture`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:patch-bridges`: pass, report `docs/reports/kessho-product-patch-bridges.json`
- `npm run migration:product-boundary`: pass
- `npm run core:product:schema`: pass, hash `1423af19d03e2f3b11be4500c4185763b1563def71f09124ecf5199cb00a7a61`
- `npm run core:product:param-accounting`: pass, reports `docs/reports/kessho-product-param-accounting-latest.json` and `docs/reports/kessho-product-control-coverage-latest.json`
- `npm run core:product:source-parity`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:docs`: pass

Manual/device tests:

- not run; Batch 5 is behavior-preserving static/architecture/accounting evidence.

Skipped validation with reason:

- Physical iOS/macOS background audio tests skipped because they belong to Batch 4/6 device signoff and remain unavailable in this environment.

Batch exit status:

- complete

Remaining blockers:

- none for Batch 5.
- Overall production release remains blocked on pending native physical-device background audio rows.

Next batch:

- Batch 6 Final production signoff.

## Batch 6 Report

Changed files:

- `docs/product-core/product-core-production-evidence-ledger.md`
- `docs/reports/kessho-product-browser-runtime-latest.json`
- `docs/reports/kessho-product-browser-runtime-latest.md`
- `docs/reports/kessho-product-ci-latest.json`
- `docs/reports/kessho-product-cpu-budget-latest.json`
- `docs/reports/kessho-product-cpu-budget-latest.md`
- `docs/reports/kessho-product-sequencer-ui-parity-latest.json`
- `docs/reports/kessho-product-sequencer-ui-parity-selected-latest.json`
- `public/worklets/kessho_core.wasm`
- `public/worklets/kessho-core.worklet.js`
- `scripts/check-kessho-product-sequencer-ui-parity.mjs`

Existing dirty files modified:

- `docs/product-core/product-core-production-evidence-ledger.md`: existing evidence ledger updated as required after Batch 6.
- `scripts/check-kessho-product-sequencer-ui-parity.mjs`: already modified during Batch 6 for Synth ARP-aware sub-lane parity; fixed the harness to index visible spark strips consistently so hidden DOM strips cannot mask the active Synth expression lane.

Behavior changes:

- No product DSP, UI, runtime, fallback, or native behavior changes.
- Sequencer UI parity coverage now treats Synth ARP as an audited visible sub-lane and uses visible spark-strip indexing for deterministic keyboard/evolve proofs.
- Product Core remains the web default runtime; `web-ts` remains reference-only and was only used as a parity comparator.

Validation run:

- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:architecture`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:browser-runtime`: pass, report `docs/reports/kessho-product-browser-runtime-latest.json`
- `npm run core:product:cpu`: pass, disabled FX `2.7163%` avg / `3.675%` peak / p95 `0.079 ms` / p99 `0.0912 ms`; active FX `5.0733%` avg / `7.11%` peak / p95 `0.1486 ms` / p99 `0.1662 ms`
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:sample-hold-parity`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:docs`: pass
- `npm run core:product:sequencer-ui -- --engine=core-product --tab=synth`: pass after visible-strip harness fix
- `npm run core:product:sequencer-ui -- --engine=core-product --tab=drums`: pass after visible-strip harness fix
- `npm run core:product:sequencer-ui`: pass, 4/4 Product/Web reference parity cases
- `npm run core:product:ci`: pass, 39 passed / 0 failed, report `docs/reports/kessho-product-ci-latest.json`
- `test ! -f src/audio/engine.ts`: pass
- `test ! -f src/audio/runtime.ts`: pass
- `rg "from ['\"].*audio/engine|from ['\"].*audio/runtime|from ['\"].*coreProductEngineHost" src -g '*.{ts,tsx}'`: expected allowed hits only (`engineSharedTypes` false-positive names, sonic parity harness, Product host invoker)
- `rg "legacy-adapter-update|updateParamsWithReason|AudioNode|GainNode|AnalyserNode|MediaStream|EngineState" src/audio/product src/ui src/App.tsx -g '*.{ts,tsx}'`: expected allowed hits only (Product-owned state types, debug/visualizer analysers, best-effort media-session/recording, audition overlay, compatibility policy text)

Manual/device tests:

- not run in this local batch.

Skipped validation with reason:

- Physical iOS/macOS background audio tests skipped because this environment cannot lock a physical iOS device, background an installed app, test Control Center/AirPods route changes, or perform real macOS hide/sleep/wake observation.

Batch exit status:

- complete for web/default Product Core production signoff and local native/browser evidence.
- release/native-background signoff remains device-gated, not production-ready.

Remaining blockers:

- Native reliable background audio cannot be claimed until every required physical-device row is recorded as `pass` with evidence, tester, and date.
- `supports_native_bridge` must remain `0` and `supportsNativeBridge` must remain `false`.

Next batch:

- none in this markdown plan; remaining work is physical native background audio signoff.

## Product Core Tech Debt Cleanup Addendum

Date: 2026-06-01

Source plan: product-core batched implementation plan.

Scope:

- Product Core remains the web production default.
- `web-ts`, `product-test`, A/B testing, smoke, parity, reference runtime validation, `src/audio/coreEngineHost.ts`, and `src/audio/reference/webTs/engine.ts` remain **Keep Active — Archive Later**.
- Cleanup focused on Product Core control-path overhead and duplication; no DSP behavior change is intended.

Evidence:

- `npm run -s core:product:ci:prereqs`: pass, 39 passed / 0 failed, report `docs/reports/kessho-product-ci-latest.json`
- `npm run -s core:product:browser-runtime`: pass, report `docs/reports/kessho-product-browser-runtime-latest.json`
- `npm run -s core:product:sequencer-ui`: pass, 4/4 Product/Web reference parity cases, report `docs/reports/kessho-product-sequencer-ui-parity-latest.json`
- `npm run -s core:product:cpu`: pass, report `docs/reports/kessho-product-cpu-budget-latest.json`
- `npm run -s core:product:default-gate-v3`: pass

CPU evidence:

- Disabled FX: `2.6371%` average, `3.36%` peak, p95 `0.0766 ms`, p99 `0.086 ms`, missed `0`.
- Active FX: `5.17825%` average, `8.5275%` peak, p95 `0.1518 ms`, p99 `0.1992 ms`, missed `0`.

Cleanup notes:

- `WebProductEngine.enqueueEvents()` now coalesces diagnostics publication after batched event posts instead of publishing once per event.
- Product host synth/drum sequencer wrappers now share `SequencerKind`-keyed helpers while preserving public compatibility wrappers.
- Synth/drum step override posting now uses a shared strategy-based implementation.
- Saved preset source classification and bundled preset loading were extracted from `App.tsx`.
- Pad/pad2 state metadata now has a schema-driven proof for filter cutoff range quantization while flat saved preset keys are preserved.
- C++ Product param/event table-driven dispatch remains deferred with a precise TODO in `cpp/KesshoCore/src/product/KesshoProductEvents.cpp`.

Known risks:

- Coalesced Product diagnostics can arrive one microtask later on high-frequency web control paths.
- Sequencer UI evolve reset exact visual equality is intentionally not used as a dice-mutation proof because it is timing-dependent; reset control remains exercised and preset reset restoration remains asserted separately.

## Evidence-Quality, CPU Attribution, and Port Surface Addendum

Date: 2026-06-05 local time; reports generated 2026-06-04T22:28Z.

Scope:

- Reconciled source truth for the current local branch: `src/audio/engine.ts` and `src/audio/runtime.ts` remain absent.
- Upgraded granular and reverb gates from structural token checks to offline numeric Product Core WASM render metrics while retaining the structural guards.
- Added CPU scenario module attribution tied to granular/reverb render reports.
- Split `ProductEnginePort` into capability type surfaces without changing the combined production contract.
- Corrected stale native smoke parameter-count assertions for Bloom-enabled reverb and tape-head-aware Delay B.

Validation:

- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned
- `npm run migration:docs`: pass
- `npm run core:product:granular-artifacts`: pass, report `docs/reports/kessho-product-granular-render-metrics-latest.json`
- `npm run core:product:reverb-tail-quality`: pass, report `docs/reports/kessho-product-reverb-render-metrics-latest.json`
- `npm run core:product:cpu-scenarios`: pass, report `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `npm run core:product:wasm`: pass
- `node scripts/test-kessho-core.mjs`: pass, native smoke and WASM render smoke
- `npm run core:product:background-audio`: pass
- `npm run core:product:background-audio-device-evidence`: pass with `allNativeRowsPassed=false`
- `npm run core:product:native-capability-signoff`: pass with `ready=false`
- `test ! -f src/audio/engine.ts`: pass
- `test ! -f src/audio/runtime.ts`: pass

New evidence:

- Granular dense-grain offline render: p95 block `0.064542 ms`; average estimated CPU `0.918872%`; max sample delta `0.030838`; max transition edge `0.030838`; max silent run `1` frame; non-finite/denormal counts `0`.
- Reverb offline render: impulse tail peak `0.00109605`; tail estimated CPU `1.389197%`; transition estimated CPU `0.887276%`; max reverb mode estimated CPU `1.309466%`; max transition edge `0.00049469`; non-finite/denormal counts `0`.
- CPU module attribution: Earth/soundscape, granular, reverb, spectral freeze, visual telemetry, and UI callbacks pass; native render callback remains deferred.

Remaining blocker:

- Native reliable background audio still requires physical iOS/macOS rows before `supports_native_bridge` or `supportsNativeBridge` may be enabled.

## Tech-debt cleanup implementation-plan closeout evidence

Date: 2026-07-22.

The remaining implementation-plan packages were completed, followed by aggregate validation:

- Package 2: `src/ui/productRuntimeConstruction.ts` is the development selection boundary. Product UI consumers receive selected typed lifecycle, state, telemetry, reference-adapter, and auto-stop facets; capability consumers no longer branch on `productRuntimeMode`.
- Package 4: runtime fallback, getter-policy, live-note-contract, and runtime-selection checks now use executable behavior tests and TypeScript AST dependency/declaration checks. The final-gate runner now records prerequisite `pass` before invoking `core:product:default-gate-v3`.
- Package 5: Product chord playhead state is sourced from Product telemetry, stopped Web TS state refreshes the authoritative harmony projection, and the global synth telemetry subscription is limited to the active Synth surface with unchanged-step React updates suppressed.

Focused evidence:

- `npm run core:product:sequencer-ui`: pass, full 4/4 Product/Web TS parity cases; Product and Web TS synth cases both pass the stopped-playhead/harmony checks.
- `npm run core:product:runtime-fallbacks`: pass; missing Product capabilities throw and record diagnostics.
- `npm run core:product:getter-policies`: pass; Product telemetry getters and AST reference boundary are green.
- `npm run core:product:live-note-contract`: pass; executable live-note lifecycle regression and AST Product boundary are green.
- `npm run core:product:background-audio`: pass; browser session tests and sonic ownership checks are green.
- `npm run core:product:browser-runtime`: pass; default browser runtime remains `core-product`.
- `npm run core:product:page-cpu-before-after`: pass; accepted baseline/current counts `3/3`, paired retry metadata recorded an original invalid baseline `synth` scenario, then a replacement interleaved run set on base port `4306` with three runs per phase and no replacement invalid scenarios. Nine scenarios passed the 3% per-scenario threshold. The `pageCpu=1` route keeps runtime selection available while parking development runtime-comparison instrumentation during the measurement.
- `npm run core:product:ci`: pass, aggregate `70 pass / 0 fail`.
- `core:product:default-gate-v3`: pass; `defaultPromotionReady=true`, web default runtime `core-product`.

Three-run page CPU medians (`browserProcessCpuPercent`, baseline `449fb2bd` versus current worktree):

| Scenario | Baseline median | Current median | Change | Result |
|---|---:|---:|---:|---|
| Global | 52.740 | 49.796 | -5.58% | pass |
| Synth | 53.582 | 51.239 | -4.37% | pass |
| Drums | 31.388 | 29.038 | -7.49% | pass |
| Earth | 37.879 | 36.052 | -4.82% | pass |
| Granular | 55.180 | 55.639 | +0.83% | pass |
| Delay | 59.129 | 58.752 | -0.64% | pass |
| Reverb | 59.789 | 58.993 | -1.33% | pass |
| Texture | 56.098 | 56.226 | +0.23% | pass |
| Routing | 56.328 | 54.850 | -2.62% | pass |

No accepted scenario exceeded the 3% median regression threshold; the report maximum median regression was `+0.8304607776%` and the median scenario regression was `-2.6229816947%`. Aggregate CI and the default promotion gate are now complete for this implementation-plan closeout.
