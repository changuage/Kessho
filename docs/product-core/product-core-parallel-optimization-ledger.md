# Product-Core Parallel Optimization Ledger

## Baseline

| Item | Status | Evidence |
|---|---|---|
| state-authority plan exists | pass | `docs/product-core/product-core-state-authority-plan.md` |
| web-ts untouched | pass | Current verification: `git diff --name-only -- src/audio/reference/webTs` returned no output; `migration:no-web-ts-bundle` passed after a fresh production build. |
| CPU reports fresh | pass | `docs/reports/kessho-product-cpu-budget-latest.json`, `docs/reports/kessho-product-web-cpu-comparison-latest.json`, `docs/reports/kessho-product-page-cpu-comparison-latest.json`, `docs/reports/kessho-product-cpu-scenarios-latest.json` |
| per-module CPU telemetry available | pass | `docs/reports/kessho-product-module-cpu-latest.json` has module attribution from existing CPU/page/runtime/render reports; no realtime module timers wired into render callbacks |
| sonic render-metric gates available | pass | `docs/reports/kessho-product-granular-render-metrics-latest.json`, `docs/reports/kessho-product-reverb-render-metrics-latest.json` |
| host web-host gate status | pass | `npm run core:product:web-host` |
| native device evidence status | prep-only | `npm run core:product:native-capability-signoff` passed with `ready=false`; no physical device evidence recorded in this batch |

## Batch Status

| Batch | Parallel-safe? | Status | Validation | Notes |
|---|---:|---|---|---|
| 0 Baseline and ownership map | yes | complete | `type-check`, `core:product:cpu`, `core:product:cpu-scenarios`, `core:product:web-host`, `core:product:granular-artifacts`, `core:product:reverb-tail-quality` passed | Ownership map recorded below |
| 1 CPU report freshness and publication | yes | complete | `core:product:cpu`, `core:product:web-cpu-comparison`, `core:product:page-cpu-comparison`, `core:product:cpu-scenarios`, `type-check` passed | CPU reports now publish commit/platform/sample-rate/block-size/duration metadata |
| 2 Per-module CPU telemetry scaffolding | limited | complete | `core:product:module-cpu`, `type-check` passed | Report-side attribution and optional TS telemetry scaffolding only; no realtime host instrumentation |
| 3 Sonic render-metric gate upgrade | yes, test-only first | complete | `core:product:granular-artifacts`, `core:product:reverb-tail-quality`, `core:product:cpu-scenarios`, `type-check` passed | Added shared audio metric helper and kept DSP unchanged |
| 4 Visual/debug telemetry throttling | yes, if UI-only | complete | `type-check`, `test:mobile-web-hotpaths`, `core:product:browser-runtime`, `core:product:module-cpu`, `core:product:cpu-scenarios`, `core:product:background-audio` passed | UI/debug-only rate limits and CPU summary coalescing added |
| 5 Shared gate harness cleanup | yes | complete | `type-check`, `core:product:cpu-scenarios`, `core:product:granular-artifacts`, `core:product:reverb-tail-quality`, `core:product:background-audio`, `core:product:native-capability-signoff`, `migration:docs` passed | Shared helper library added under `scripts/product-core/lib` |
| 6 Host line-cap extraction | limited | complete | `type-check`, `core:product:web-host`, `core:product:host-reconciliation`, `core:product:runtime-fallbacks`, `core:product:getter-policies`, `core:product:running-sequencer-live-updates` passed | Extracted resolved-state commit diagnostics/receipt bookkeeping; `coreProductEngineHost.ts` reduced to 979 lines under the existing 1000-line cap. |
| 7 App shell non-invasive prep | limited | complete | `type-check`, `migration:product-boundary`, `core:product:architecture`, `core:product:browser-runtime` passed | Static footer extraction only; broader App extraction deferred because App has active state-authority edits |
| 8 ProductEnginePort/WebProductEngine compression | wait | complete | `type-check`, `core:product:architecture`, `core:product:web-host`, `core:product:runtime-fallbacks`, `core:product:getter-policies`, `core:product:running-sequencer-live-updates`, `migration:product-boundary` passed | ProductEnginePort was already capability-oriented; extracted WebProductEngine diagnostics publication into a focused product helper and reduced WebProductEngine to 358 lines. |
| 9 Final optimization signoff | after dependencies | complete | `build`, `type-check`, Product architecture/state-authority gates, CPU/report gates, sonic gates, runtime gates, and no-web-ts production bundle scan passed | Safe batches 0-9 are complete; native physical-device evidence remains prep-only with `ready=false`. |

## Current Verification - 2026-06-05

Changed files:
- `docs/product-core/product-core-parallel-optimization-ledger.md`
- refreshed `docs/reports/kessho-product-*-latest.{json,md}`
- rebuilt `dist/**` production assets
- Source and harness changes from completed batches are recorded in the per-batch sections below; this final verification/signoff pass only refreshed reports, rebuilt assets, and corrected ledger status.

State-authority files touched:
- None in this final verification/signoff pass.

web-ts touched:
- no
- Current guardrail is clean: `git diff --name-only -- src/audio/reference/webTs` returned no output.
- `npm run migration:no-web-ts-bundle` passed after `npm run build`, with 35 production JS assets scanned.

Behavior changes:
- No intended sound/control behavior changes.
- Final signoff only refreshed reports, rebuilt production assets, and recorded completed batch status.

CPU impact/report path:
- `docs/reports/kessho-product-cpu-budget-latest.json`: pass on current HEAD `c091d464`; disabled FX avg `3.4437%`, peak `4.6725%`, p95 `0.1092 ms`, p99 `0.1114 ms`, missed `0`; active FX avg `5.82655%`, peak `8.79%`, p95 `0.1858 ms`, p99 `0.219 ms`, missed `0`.
- `docs/reports/kessho-product-web-cpu-comparison-latest.json`: pass; Product browser CPU `107.933%`, Web TS browser CPU `114.612%`, saved `5.827634761939978%`.
- `docs/reports/kessho-product-page-cpu-comparison-latest.json`: pass; Product wins `9/9`, weighted browser-process CPU saved `9.66532530003657%`, average saved `9.421495217678785%`.
- Page scenario savings: global `14.070401379921158%`, synth `10.701535160249295%`, drums `5.306896483317915%`, earth `1.705729015421969%`, granular `13.634744366064366%`, delay `11.282208477155397%`, reverb `8.079409783578546%`, dynamics `9.698330115813079%`, routing `10.314202177587346%`.
- `docs/reports/kessho-product-module-cpu-latest.json`: pass; top report-side rows are dynamics `27.925532%`, delay `23.93617%`, spectral-freeze `20.744681%`, soundscapes `12.367021%`, sequencer `12.367021%`.
- `docs/reports/kessho-product-granular-render-metrics-latest.json`: pass; dense-grain avg CPU `0.944852%`, p95 block `0.065125 ms`.
- `docs/reports/kessho-product-reverb-render-metrics-latest.json`: pass; impulse tail peak `0.00109605`, tail estimated CPU `1.455432%`, three CPU mode rows.

Validation run:
- `npm run build`: pass
- `npm run type-check`: pass
- `npm run core:product:abi`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:browser-runtime`: pass after rebuilding stale `dist`
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned
- `npm run core:product:schema`: pass
- `npm run core:product:wasm`: pass
- `npm run core:product:cpu`: pass
- `npm run core:product:web-cpu-comparison`: pass
- `npm run core:product:page-cpu-comparison`: pass
- `npm run core:product:module-cpu`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run test:mobile-web-hotpaths`: pass
- `npm run core:product:background-audio`: pass
- `npm run core:product:native-capability-signoff`: pass with `ready=false`
- `npm run migration:docs`: pass
- `npm run core:product:architecture`: pass

Manual/audio/device tests:
- No manual listening tests run.
- No physical iOS/macOS device tests run.
- Native capability remains prep-only with `ready=false`.

Batch exit status:
- Safe CPU/tech-debt batches 0, 1, 2, 3, 4, 5, 6, 7, 8, and 9 validate on current gates.
- Strict clean-tree web-ts signoff is complete for this pass: `src/audio/reference/webTs/**` has no current diff and production bundle isolation passes.
- Native physical-device evidence remains incomplete only for native release readiness; `core:product:native-capability-signoff` passes with `ready=false`.

Parallel coordination notes:
- State-authority API stability gates now pass: resolved state, commit/snapshot authority, live running-sequencer updates, host reconciliation, sequencer, runtime fallbacks, getter policies, browser runtime, ABI, and determinism.
- Batch 6 and Batch 8 were completed only after state-authority API stability was verified.
- No trigger, sequencer, morph, preset, ratchet, drum-morph, or Product commit semantics were changed by the CPU/tech-debt batches.

Next batch:
- No remaining CPU/tech-debt batch in this plan. Native physical-device evidence is the remaining release-readiness follow-up if native/iOS/macOS shipment is in scope.

## Batch 0 - Baseline And Ownership Map

Changed files:
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None in this batch.

web-ts touched:
- no

Behavior changes:
- None.

CPU impact/report path:
- Baseline reports refreshed later in Batch 1.
- Latest CPU budget: `docs/reports/kessho-product-cpu-budget-latest.json`.
- Latest CPU scenarios: `docs/reports/kessho-product-cpu-scenarios-latest.json`.

Validation run:
- `git rev-parse --short HEAD`: `7dc9e6e7`
- `npm run type-check`: pass
- `npm run core:product:cpu`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:reverb-tail-quality`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- Current worktree already contains broad state-authority changes in Product C++ state, sequencer, `src/audio/coreProductEngineHost.ts`, `ProductEnginePort.ts`, `WebProductEngine.ts`, and state-authority UI hooks. This CPU pass treated those files as blocked and did not edit them.
- File sizes: `src/App.tsx` 6350 lines, `src/audio/coreProductEngineHost.ts` 999 lines, `src/audio/product/ProductEnginePort.ts` 141 lines, `src/audio/product/WebProductEngine.ts` 368 lines.
- Root script count: 89 top-level `.mjs` scripts.
- Parallel-safe optimization targets observed: report scripts, render-metric harnesses, shared gate helpers, visual/debug telemetry surfaces, and docs/report publication.

Next batch:
- Batch 1 CPU report freshness and publication.

## Batch 1 - CPU Report Freshness And Publication

Changed files:
- `scripts/check-kessho-product-cpu-budget.mjs`
- `scripts/check-kessho-product-web-cpu-comparison.mjs`
- `scripts/check-kessho-product-page-cpu-comparison.mjs`
- `scripts/check-kessho-product-cpu-scenarios.mjs`
- `scripts/product-core/lib/reporting.mjs`
- `scripts/product-core/lib/freshness.mjs`
- `scripts/product-core/lib/cpuReports.mjs`
- `docs/reports/kessho-product-cpu-budget-latest.json`
- `docs/reports/kessho-product-cpu-budget-latest.md`
- `docs/reports/kessho-product-web-cpu-comparison-latest.json`
- `docs/reports/kessho-product-web-cpu-comparison-latest.md`
- `docs/reports/kessho-product-page-cpu-comparison-latest.json`
- `docs/reports/kessho-product-page-cpu-comparison-latest.md`
- `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `docs/reports/kessho-product-cpu-scenarios-latest.md`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None.

web-ts touched:
- no; Web TS was only measured through the local A/B reference path.

Behavior changes:
- None. Report publication only.

CPU impact/report path:
- `docs/reports/kessho-product-cpu-budget-latest.json`: pass; disabled FX avg 3.43245%, p95 0.1094 ms, p99 0.1126 ms, missed 0; active FX avg 5.67235%, p95 0.167 ms, p99 0.2406 ms, missed 0.
- `docs/reports/kessho-product-web-cpu-comparison-latest.json`: pass; Product browser CPU 107.321%, Web TS browser CPU 111.239%, saved 3.52%.
- `docs/reports/kessho-product-page-cpu-comparison-latest.json`: pass; Product wins 8/9 scenarios, weighted saved 9.35%, average saved 8.97%; `drums` row is a small negative at about -0.27% but gate passes.
- `docs/reports/kessho-product-cpu-scenarios-latest.json`: pass.
- CPU reports now include commit, generated time, command, machine/platform, sample rate, block size, duration, thresholds, and suspected module buckets in `metadata`.

Validation run:
- `npm run core:product:cpu`: pass
- `npm run core:product:web-cpu-comparison`: pass
- `npm run core:product:page-cpu-comparison`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run type-check`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- Kept all changes inside report/test harness scripts and generated report files.
- Did not change trigger, sequencer, morph, preset, ratchet, drum-morph, or Product commit semantics.

Next batch:
- Batch 3 sonic render-metric gate scaffolding.

## Batch 2 - Per-Module CPU Telemetry Scaffolding

Changed files:
- `package.json`
- `scripts/check-kessho-product-module-cpu-report.mjs`
- `scripts/product-core/lib/cpuReports.mjs`
- `src/audio/product/telemetry/ProductCpuTelemetryTypes.ts`
- `src/audio/product/telemetry/ProductModuleCpuTelemetry.ts`
- `src/audio/product/telemetry/ProductCpuTelemetryReporter.ts`
- `docs/reports/kessho-product-module-cpu-latest.json`
- `docs/reports/kessho-product-module-cpu-latest.md`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None.

web-ts touched:
- no

Behavior changes:
- None. Telemetry scaffolding is standalone and not wired into the host, render callback, trigger path, sequencer path, morph path, preset path, ratchet path, drum-morph path, or Product commit path.

CPU impact/report path:
- `docs/reports/kessho-product-module-cpu-latest.json`: pass.
- Top report-side attribution rows: spectral-freeze 21.941489% estimate, dynamics 21.542553%, delay 17.952128%, sequencer 12.367021%, sources 9.973404%.
- The report derives attribution from existing CPU/page/browser-runtime/granular/reverb reports and avoids realtime allocation or logging.

Validation run:
- `npm run core:product:module-cpu`: pass
- `npm run type-check`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- No host or state-authority-owned files were edited.
- Native render callback attribution remains deferred until native/device evidence work can provide real measurements.

Next batch:
- Batch 4 visual/debug telemetry throttling.

## Batch 3 - Sonic Render-Metric Gate Scaffolding

Changed files:
- `scripts/product-core/lib/audioMetrics.mjs`
- `scripts/lib/kesshoWasmRenderMetrics.mjs`
- `scripts/check-kessho-product-granular-artifacts.mjs`
- `scripts/check-kessho-product-reverb-tail-quality.mjs`
- `scripts/product-core/lib/packageScripts.mjs`
- `scripts/product-core/lib/sourceTokens.mjs`
- `docs/reports/kessho-product-granular-render-metrics-latest.json`
- `docs/reports/kessho-product-granular-render-metrics-latest.md`
- `docs/reports/kessho-product-reverb-render-metrics-latest.json`
- `docs/reports/kessho-product-reverb-render-metrics-latest.md`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None.

web-ts touched:
- no

Behavior changes:
- None. DSP/render behavior unchanged; the batch only added/reused test metrics and report metadata.

CPU impact/report path:
- `docs/reports/kessho-product-granular-render-metrics-latest.json`: pass; dense-grain avg CPU 0.830639%, p95 block 0.036125 ms.
- `docs/reports/kessho-product-reverb-render-metrics-latest.json`: pass; impulse tail peak 0.00109605, three CPU mode rows.

Validation run:
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run type-check`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- Product DSP fixes remain deferred/coordination-required. This pass did not edit C++ DSP or render semantics.
- Shared audio metrics now provide `maxAbs`, `maxSampleDelta`, `countNonFinite`, `rms`, `windowedRms`, `detectImpulseBurst`, `estimateTailDecayCurve`, and `assertBelow`, plus the existing harness metrics.

Next batch:
- Batch 5 shared gate/test harness cleanup.

## Batch 4 - Visual/Debug Telemetry Throttling

Changed files:
- `src/ui/productRuntimeTelemetryRateLimits.ts`
- `src/ui/useProductRuntimePerfAdapter.ts`
- `src/ui/CpuOverlay.tsx`
- `src/ui/useProductCoreDebugSummary.ts`
- `scripts/check-kessho-product-cpu-scenarios.mjs`
- `scripts/check-kessho-product-background-audio-support.mjs`
- `docs/reports/kessho-product-browser-runtime-latest.json`
- `docs/reports/kessho-product-module-cpu-latest.json`
- `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None.

web-ts touched:
- no

Behavior changes:
- No sound/control behavior changes. Changes are limited to UI/debug telemetry publication and static gate checks.
- Product runtime CPU summary writes are coalesced behind `PRODUCT_DEBUG_PANEL_INTERVAL_MS` instead of writing React state/session storage for every telemetry callback.
- Debug refresh intervals now use named telemetry-rate constants.

CPU impact/report path:
- `docs/reports/kessho-product-browser-runtime-latest.json`: pass; runtime walk telemetry updates 154, walk store updates 61.
- `docs/reports/kessho-product-module-cpu-latest.json`: pass; top report-side rows remain spectral-freeze, dynamics, and delay.
- `docs/reports/kessho-product-cpu-scenarios-latest.json`: pass; now statically checks telemetry rate-limit constants and coalesced CPU summary publication.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run test:mobile-web-hotpaths`: pass
- `npm run core:product:browser-runtime`: pass
- `npm run core:product:module-cpu`: pass
- `npm run core:product:background-audio`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- Avoided state-authority-owned trigger, sequencer, morph, preset, ratchet, drum-morph, and Product commit files.
- Did not change Product runtime callback registration semantics; only coalesced UI summary publication after telemetry is received.

Next batch:
- Batch 7 App shell non-invasive prep assessment.

## Batch 5 - Shared Gate/Test Harness Cleanup

Changed files:
- `scripts/product-core/lib/reporting.mjs`
- `scripts/product-core/lib/freshness.mjs`
- `scripts/product-core/lib/packageScripts.mjs`
- `scripts/product-core/lib/sourceTokens.mjs`
- `scripts/product-core/lib/audioMetrics.mjs`
- `scripts/product-core/lib/cpuReports.mjs`
- `scripts/product-core/lib/deviceEvidence.mjs`
- `scripts/check-kessho-product-cpu-budget.mjs`
- `scripts/check-kessho-product-cpu-scenarios.mjs`
- `scripts/check-kessho-product-web-cpu-comparison.mjs`
- `scripts/check-kessho-product-page-cpu-comparison.mjs`
- `scripts/check-kessho-product-granular-artifacts.mjs`
- `scripts/check-kessho-product-reverb-tail-quality.mjs`
- `scripts/lib/kesshoWasmRenderMetrics.mjs`
- `docs/reports/**-latest.json`
- `docs/reports/**-latest.md`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None.

web-ts touched:
- no

Behavior changes:
- None. Gate outputs are equivalent or stronger due to added metadata and shared assertions.

CPU impact/report path:
- Same report paths as Batch 1 and Batch 3.
- No direct CPU optimization was applied; this batch reduces test/report boilerplate and makes future CPU evidence easier to audit.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:background-audio`: pass
- `npm run core:product:native-capability-signoff`: pass, `ready=false`
- `npm run migration:docs`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.
- Native/device validation not run; only native capability signoff gate was checked.

Batch exit status:
- complete

Parallel coordination notes:
- Kept separate gate commands; did not merge gates into a single script.
- At least six gates now use shared helper modules: CPU budget, CPU scenarios, web CPU comparison, page CPU comparison, granular artifacts, and reverb tail quality.
- Batch 6 and Batch 8 remained blocked on state-authority stability during this earlier Batch 5 pass.

Next batch:
- Batch 7 App shell non-invasive prep assessment.

## Batch 6 - Host Line-Cap Extraction

Changed files:
- `src/audio/coreProductEngineHost.ts`
- `src/audio/product/host/CoreProductResolvedStateCommitService.ts`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.json`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.md`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- `src/audio/coreProductEngineHost.ts`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- The edit was explicitly Batch 6-owned and limited to moving resolved-state commit diagnostics/receipt bookkeeping into a focused host helper. Public host methods and trigger/commit ordering stayed stable.

web-ts touched:
- no by this batch.
- current worktree guardrail remains not clean because `src/audio/reference/webTs/engine.ts` is dirty outside this batch.

Behavior changes:
- None intended.
- `commitResolvedState`, `getCommittedStateRevision`, `recordSequencerUiPatch`, and sound-trigger revision recording still expose the same host behavior and diagnostics; implementation now delegates to `CoreProductResolvedStateCommitService`.
- No trigger, sequencer, morph, preset, ratchet, drum-morph, or Product commit semantics were changed.

CPU impact/report path:
- No direct CPU/runtime change expected; this is host debt and line-cap headroom.
- `src/audio/coreProductEngineHost.ts`: `999` lines before this batch, `979` lines after.
- New helper `src/audio/product/host/CoreProductResolvedStateCommitService.ts`: `54` lines, capped at `80` by `core:product:web-host`.
- Latest running-sequencer report refreshed at `docs/reports/kessho-product-running-sequencer-live-updates-latest.json`.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:running-sequencer-live-updates`: pass

Manual/audio/device tests:
- No manual listening tests run.
- No physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- State-authority API stability was verified before this extraction.
- The VM behavior harness and running-sequencer gate were updated to check the extracted helper rather than the old inline host token.
- `ProductEnginePort.ts` and `WebProductEngine.ts` remain Batch 8-owned and were not edited in this batch.

Next batch:
- Batch 8 ProductEnginePort/WebProductEngine compression, after confirming the existing port split state and preserving the running-sequencer live-update gate.

## Batch 7 - App Shell Non-Invasive Prep

Changed files:
- `src/App.tsx`
- `src/ui/AppFooterMark.tsx`
- `docs/reports/kessho-product-browser-runtime-latest.json`
- `docs/reports/kessho-product-module-cpu-latest.json`
- `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- None by ownership list. `src/App.tsx` already had active state-authority-related dirty changes from the parallel repair; this batch only replaced a static footer block with `<AppFooterMark />`.

web-ts touched:
- no

Behavior changes:
- None. Static visual markup was moved into a leaf component; no hooks, runtime callbacks, state reconciliation, Product commits, sequencer controls, morph controls, presets, ratchets, drum morphs, or trigger paths were moved.

CPU impact/report path:
- No direct CPU improvement expected.
- `docs/reports/kessho-product-browser-runtime-latest.json`: pass after extraction.
- `docs/reports/kessho-product-module-cpu-latest.json`: pass after browser-runtime refresh.
- `docs/reports/kessho-product-cpu-scenarios-latest.json`: pass after browser-runtime refresh.

Validation run:
- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:architecture`: pass
- `npm run core:product:browser-runtime`: pass
- `npm run core:product:module-cpu`: pass
- `npm run core:product:cpu-scenarios`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- Broader App shell decomposition remains deferred until state-authority API and App-level repair edits stabilize.
- This extraction intentionally avoided `useAudioEngineParamSync`, manual triggers, preset sync, morph slot/position surfaces, and sequencer controls.

Next batch:
- Batch 8 ProductEnginePort/WebProductEngine compression and Batch 9 final optimization signoff.

## Batch 8 - ProductEnginePort/WebProductEngine Compression

Changed files:
- `src/audio/product/WebProductEngine.ts`
- `src/audio/product/ProductDiagnosticsPublisher.ts`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.json`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.md`
- `docs/product-core/product-core-parallel-optimization-ledger.md`

State-authority files touched:
- `src/audio/product/WebProductEngine.ts`
- The edit was explicitly Batch 8-owned and limited to adapter diagnostics publication. `ProductEnginePort.ts` was inspected but not edited because it already exposes capability-oriented surfaces.

web-ts touched:
- no by this batch.
- current worktree guardrail remains not clean because `src/audio/reference/webTs/engine.ts` is dirty outside this batch.

Behavior changes:
- None intended.
- `setDiagnosticsCallback`, scheduled diagnostics publication, and immediate lifecycle diagnostics publication keep the same timing semantics; WebProductEngine now delegates queue/epoch bookkeeping to `ProductDiagnosticsPublisher`.
- No trigger, sequencer, morph, preset, ratchet, drum-morph, or Product commit semantics were changed.

CPU impact/report path:
- No direct CPU/runtime change expected; this is adapter tech-debt cleanup.
- `src/audio/product/WebProductEngine.ts`: `368` lines before this batch, `358` lines after.
- New helper `src/audio/product/ProductDiagnosticsPublisher.ts`: `32` lines.
- Latest running-sequencer report refreshed at `docs/reports/kessho-product-running-sequencer-live-updates-latest.json`.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:architecture`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run migration:product-boundary`: pass

Manual/audio/device tests:
- No manual listening tests run.
- No physical device tests run.

Batch exit status:
- complete

Parallel coordination notes:
- `ProductEnginePort.ts` already contains the capability surface split required by Batch 8: lifecycle, command, control, asset, telemetry, sequencer, modulation, and diagnostics ports.
- WebProductEngine still imports only `CoreProductRuntimeHostPort` from `./host/**`, preserving the runtime host boundary.

Next batch:
- Final combined validation.

## Batch 9 - Final Optimization Signoff

Changed files:
- `docs/product-core/product-core-parallel-optimization-ledger.md`
- `docs/reports/kessho-product-cpu-budget-latest.json`
- `docs/reports/kessho-product-cpu-budget-latest.md`
- `docs/reports/kessho-product-web-cpu-comparison-latest.json`
- `docs/reports/kessho-product-web-cpu-comparison-latest.md`
- `docs/reports/kessho-product-page-cpu-comparison-latest.json`
- `docs/reports/kessho-product-page-cpu-comparison-latest.md`
- `docs/reports/kessho-product-module-cpu-latest.json`
- `docs/reports/kessho-product-module-cpu-latest.md`
- `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `docs/reports/kessho-product-cpu-scenarios-latest.md`
- `docs/reports/kessho-product-granular-render-metrics-latest.json`
- `docs/reports/kessho-product-granular-render-metrics-latest.md`
- `docs/reports/kessho-product-reverb-render-metrics-latest.json`
- `docs/reports/kessho-product-reverb-render-metrics-latest.md`
- `docs/reports/kessho-product-browser-runtime-latest.json`
- `docs/reports/kessho-product-browser-runtime-latest.md`
- `docs/reports/kessho-product-patch-bridges.json`
- `docs/reports/kessho-product-native-capability-signoff-latest.json`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.json`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.md`

State-authority files touched:
- None in this batch.

web-ts touched:
- no

Behavior changes:
- None. Final signoff only refreshed reports, rebuilt production assets, and recorded completed batch status.

CPU impact/report path:
- `docs/reports/kessho-product-cpu-budget-latest.json`: pass on current HEAD `c091d464`; disabled FX avg `3.4437%`, peak `4.6725%`, p95 `0.1092 ms`, p99 `0.1114 ms`, missed `0`; active FX avg `5.82655%`, peak `8.79%`, p95 `0.1858 ms`, p99 `0.219 ms`, missed `0`.
- `docs/reports/kessho-product-web-cpu-comparison-latest.json`: Product browser CPU `107.933%`, Web TS browser CPU `114.612%`, saved `5.827634761939978%`.
- `docs/reports/kessho-product-page-cpu-comparison-latest.json`: Product wins `9/9`; weighted saved `9.66532530003657%`; global `14.070401379921158%`, synth `10.701535160249295%`, drums `5.306896483317915%`, earth `1.705729015421969%`, granular `13.634744366064366%`, delay `11.282208477155397%`, reverb `8.079409783578546%`, dynamics `9.698330115813079%`, routing `10.314202177587346%`.
- `docs/reports/kessho-product-module-cpu-latest.json`: top report-side rows dynamics `27.925532%`, delay `23.93617%`, spectral-freeze `20.744681%`.
- `docs/reports/kessho-product-granular-render-metrics-latest.json`: dense-grain avg CPU `0.944852%`, p95 block `0.065125 ms`.
- `docs/reports/kessho-product-reverb-render-metrics-latest.json`: tail peak `0.00109605`, tail estimated CPU `1.455432%`, three CPU mode rows.

Validation run:
- `npm run build`: pass
- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:architecture`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:abi`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:schema`: pass
- `npm run core:product:wasm`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned
- `npm run test:mobile-web-hotpaths`: pass
- `npm run migration:docs`: pass
- `npm run core:product:cpu`: pass
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:browser-runtime`: pass
- `npm run core:product:web-cpu-comparison`: pass
- `npm run core:product:page-cpu-comparison`: pass
- `npm run core:product:module-cpu`: pass
- `npm run core:product:cpu-scenarios`: pass
- `npm run core:product:background-audio`: pass
- `npm run core:product:native-capability-signoff`: pass, `ready=false`
- `npm run core:product:running-sequencer-live-updates`: pass

Manual/audio/device tests:
- No manual listening or physical device tests run.
- Native/device evidence remains prep-only; `core:product:native-capability-signoff` passed with `ready=false`.

Batch exit status:
- complete

Parallel coordination notes:
- Safe batches 0, 1, 2, 3, 4, 5, 6, 7, 8, and 9 are complete.
- Batch 6 completed after state-authority API stability was verified.
- Batch 8 completed after state-authority API stability was verified.
- No trigger, sequencer, morph, preset, ratchet, drum-morph, or Product commit semantics were changed by the CPU/tech-debt batches.

Next batch:
- No remaining CPU/tech-debt batch in this plan. Native physical-device evidence remains the release-readiness follow-up if native/iOS/macOS shipment is in scope.
