# Product-Core Self-Sufficiency Ledger

## Source state

| Item | Status | Evidence |
|---|---|---|
| Git baseline | pass | `git rev-parse --short HEAD` -> `7dc9e6e7` |
| Dirty tree acknowledged | pass | Existing untracked docs and `.agents/` entries were left in place. |
| `src/audio/engine.ts` absent | pass | `git ls-files src/audio/engine.ts src/audio/runtime.ts` produced no tracked files; `test ! -f src/audio/engine.ts` passed. |
| `src/audio/runtime.ts` absent | pass | `git ls-files src/audio/engine.ts src/audio/runtime.ts` produced no tracked files; `test ! -f src/audio/runtime.ts` passed. |
| ProductEngineProxy is production decision point | pass | `src/audio/product/ProductEngineProxy.ts` resolves `web-ts`, `web-audio`, and `core-smoke` requests to `core-product`; unimplemented native/test modes fail closed in dev and resolve to `core-product` in production. |
| ProductEnginePort is product-owned and Web Audio-free | pass | `npm run migration:product-boundary` passed. |
| web-ts is read-only A/B reference | pass | `src/audio/product/ProductAudioRuntimeSelection.ts` exposes only `core-product` in normal product mode and gates `web-ts`/`core-smoke` behind explicit dev/reference contexts. |
| production bundle excludes web-ts | pass | `npm run migration:no-web-ts-bundle` passed; 35 production JS assets scanned. |
| no production import depends on web-ts | pass | `npm run core:product:reference-isolation` and `npm run migration:product-boundary` passed. |
| native bridge scope | deferred | Native reliable background audio remains device-evidence gated; Batch 5 owns final native/background evidence. |

## Batch status

| Batch | Status | Validation | Notes |
|---|---|---|---|
| 1 Source truth and reference quarantine | complete | `npm run type-check`; `npm run migration:product-boundary`; `npm run core:product:reference-isolation`; `npm run build`; `npm run migration:no-web-ts-bundle`; `npm run migration:docs` | No source-code patch required; current product boundary and bundle gates already enforce reference quarantine. |
| 2 Product control routing self-sufficiency | complete | `npm run type-check`; `npm run core:product:patch-bridges`; `npm run core:product:dirty-diff`; `npm run core:product:snapshot-authority`; `npm run core:product:runtime-fallbacks`; `npm run core:product:getter-policies`; `npm run core:product:web-host`; `npm run migration:no-unsupported-product-surface`; `npm run migration:runtime-production-gates`; extra `npm run core:product:harmony`; extra `npm run core:product:sequencer` | Fixed Lead endpoint anchoring, verified control dirty-diff/patch routes, restored Product pad sequencer hold timing policy, and refreshed stale validation harness/gate classification. |
| 3 Sonic stability and parity gates | complete | `npm run type-check`; `npm run core:product:granular-artifacts`; `npm run core:product:sample-hold-parity`; `npm run core:product:reverb-tail-quality`; `npm run core:product:runtime-fallbacks`; `npm run core:product:getter-policies`; `npm run core:product:assets`; `npm run core:product:source-parity`; `npm run core:product:determinism`; `npm run core:product:sequencer`; `npm run core:product:browser-runtime`; `npm run core:product:cpu`; `npm run migration:runtime-production-gates` | Sonic gates now include offline numeric render reports for granular dry-through/dense-grain transitions and reverb impulse-tail/transition/CPU-by-mode metrics. |
| 4 CPU evidence and optimization | complete | `npm run type-check`; `npm run core:product:cpu`; `npm run core:product:web-cpu-comparison`; `npm run core:product:page-cpu-comparison`; `npm run core:product:cpu-scenarios`; `npm run test:mobile-web-hotpaths`; `npm run core:product:browser-runtime` | CPU scenario report now requires granular/reverb render reports and emits module-attribution rows for Earth, granular, reverb, spectral freeze, visual telemetry, UI callbacks, and deferred native render callback evidence. |
| 5 Native/background audio evidence | blocked on physical-device evidence | `npm run type-check`; `npm run core:product:background-audio`; `npm run core:product:background-audio-docs`; `npm run core:product:native-render-path`; `npm run core:product:macos-native-smoke`; `npm run core:product:macos-app-native-smoke`; `npm run core:product:native-background-smoke`; `npm run core:product:background-audio-device-evidence`; `npm run core:product:ios-background-audio-evidence`; `npm run core:product:native-capability-signoff`; `npm run migration:docs` | Local native render/background gates pass and native capability remains disabled; physical iOS/macOS rows remain pending (`allNativeRowsPassed=false`, `ready=false`). |
| 6 Architecture streamlining and code-bloat reduction | complete | `npm run type-check`; `npm run core:product:architecture`; `npm run core:product:native-render-path`; `npm run core:build:wasm`; `npm run core:product:web-host`; `npm run core:product:runtime-fallbacks`; `npm run core:product:getter-policies`; `npm run core:product:patch-bridges`; `npm run core:product:dirty-diff`; `npm run core:product:host-reconciliation`; `npm run migration:product-boundary`; `npm run core:product:schema`; `npm run core:product:param-accounting`; `npm run core:product:source-parity`; `npm run core:product:determinism`; `npm run core:product:sequencer`; `npm run migration:runtime-production-gates`; `npm run core:product:browser-runtime`; `npm run core:product:cpu`; `npm run core:product:cpu-scenarios`; `npm run core:product:granular-artifacts`; `npm run core:product:reverb-tail-quality`; `npm run core:product:sample-hold-parity`; `npm run core:product:background-audio`; `npm run core:product:native-capability-signoff`; `npm run core:product:background-audio-device-evidence`; `npm run core:product:ios-background-audio-evidence`; `npm run core:product:macos-native-smoke`; `npm run core:product:macos-app-native-smoke`; `npm run core:product:native-background-smoke`; `npm run migration:docs`; `npm run build`; `npm run migration:no-web-ts-bundle` | ProductEnginePort now exposes capability sub-surfaces while keeping the combined ProductEnginePort contract stable; older Product Core source splits remain enforced by architecture guards. |
| Final signoff | blocked on physical-device evidence | Local/static/browser/native smoke gates pass through Batch 6; Batch 5 device evidence still reports `allNativeRowsPassed=false`, `releaseReady=false`, `ready=false`. | Final production self-sufficiency signoff must wait for required iOS/macOS physical background-audio rows; native bridge remains disabled. |

## Batch 1 Report

Changed files:

- `docs/product-core/product-core-self-sufficiency-ledger.md`

web-ts touched: no

Behavior changes:

- None. Batch 1 was source truth, reference quarantine, and bundle-evidence verification only.

Validation run:

- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run build`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned
- `npm run migration:docs`: pass

Manual/device tests:

- Not run; Batch 1 is static/source and production-bundle quarantine evidence.

Skipped validation with reason:

- None for Batch 1.

Batch exit status:

- complete

Remaining blockers:

- None for Batch 1.

Parallel coordination notes:

- Agent A / Batch 1 verified source truth and reference quarantine. Product-core source changes are not required before Agent B starts Batch 2.

Next batch:

- Batch 2 Product control routing self-sufficiency.

## Batch 2 Report

Changed files:

- `docs/product-core/product-core-self-sufficiency-ledger.md`
- `scripts/check-kessho-product-snapshot-authority.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `src/audio/CoreProductLeadPatch.ts`
- `src/audio/coreProductSequencerHold.ts`
- `src/ui/usePresetSequencerRestore.ts`

web-ts touched: no

Behavior changes:

- Product Lead preset endpoint IDs now preserve explicit invalid generated endpoints as invalid when no custom Lead preset data is present, avoiding sparse override masking for non-reconstructable Lead endpoints.
- Custom Lead endpoint data still anchors to generated slot defaults so bounded sparse Lead overrides can reconstruct custom patches without exact Lead arrays.
- Product synth/pad sequencer hold timing now uses the web timing policy derived from attack/decay instead of directly extending sequenced pad notes by the pad hold slider.
- Preset sequencer restore keeps shared scale-degree conversion explicit while preserving the existing engine-ready pitch override math.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:no-unsupported-product-surface`: pass
- `npm run migration:runtime-production-gates`: pass
- Extra `npm run core:product:harmony`: pass
- Extra `npm run core:product:sequencer`: pass

Manual/device tests:

- Not run; Batch 2 is product control routing and static/native unit gate evidence, not device-background evidence.

Skipped validation with reason:

- Browser UI/manual A/B interaction tests were not run for Batch 2 because the focused control-routing, harmony, sequencer, and production gates covered the modified paths.

Batch exit status:

- complete

Remaining blockers:

- None for Batch 2.

Parallel coordination notes:

- Agent B / Batch 2 is closed. The Lead endpoint behavior and pad sequencer hold timing changes can affect sonic parity, so Agent C should include the normal sonic parity gates before any further DSP changes.

Next batch:

- Batch 3 Sonic stability and parity gates.

## Batch 3 Report

Changed files:

- `cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp`
- `docs/product-core/product-core-self-sufficiency-ledger.md`
- `public/worklets/kessho_core.wasm`
- `scripts/check-kessho-product-deterministic-music.mjs`

web-ts touched: no

Behavior changes:

- Product Core sequencer evolution now emits deterministic velocity, morph, distance, and expression event values when evolution depth is active, even when optional macro sub-lanes are not configured.
- Inactive base macro sub-lanes still leave source morph/distance/expression ownership unchanged for normal trigger routing, as verified by the Product sequencer gate.
- The deterministic WASM gate now seeds RNG/evolution in the generated snapshot ABI fixture and recomputes expected macro event values from the same hash contract as native Product Core.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:sample-hold-parity`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:assets`: pass
- `npm run core:product:source-parity`: pass
- `npm run core:build:wasm`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:browser-runtime`: pass, report `docs/reports/kessho-product-browser-runtime-latest.json`
- `npm run core:product:cpu`: pass, report `docs/reports/kessho-product-cpu-budget-latest.md`; disabled FX 2.5501% avg / 4.44% peak / p99 0.107 ms / missed 0; active FX 6.1521% avg / 8.3475% peak / p99 0.221 ms / missed 0
- `npm run migration:runtime-production-gates`: pass

Manual/device tests:

- Not run; Batch 3 is automated sonic stability, parity, browser-runtime, and CPU gate evidence.

Skipped validation with reason:

- Manual A/B listening and native/background device tests were not run in Batch 3; Batch 5 owns device/background evidence.

Batch exit status:

- complete

Remaining blockers:

- None for Batch 3.

Parallel coordination notes:

- Agent C / Batch 3 is closed. Deterministic evolution now owns macro event values only when evolution is active or macro sub-lanes are explicitly active; Batch 4 can use the current CPU report as its baseline.

Next batch:

- Batch 4 CPU evidence and optimization.

## Batch 4 Report

Changed files:

- `docs/product-core/product-core-self-sufficiency-ledger.md`
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

web-ts touched: no

Behavior changes:

- None in production runtime code for Batch 4. This batch refreshed CPU evidence and confirmed the existing CPU governor/scenario policy gates.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:cpu`: pass, `docs/reports/kessho-product-cpu-budget-latest.*`; disabled FX 2.5501% avg / 4.44% peak / p99 0.107 ms / missed 0; active FX 6.1521% avg / 8.3475% peak / p99 0.221 ms / missed 0
- `npm run core:product:web-cpu-comparison`: pass, Product 107.027% browser CPU vs Web TS 110.811%, saved 3.41%
- `npm run core:product:page-cpu-comparison`: pass, 9 scenarios; Product CPU saved in every scenario, including granular 12.44%, reverb 12.79%, dynamics 15.02%, routing 8.58%
- `npm run core:product:cpu-scenarios`: pass, 10-row scenario matrix generated with native iOS/macOS render rows deferred
- `npm run test:mobile-web-hotpaths`: pass
- `npm run core:product:browser-runtime`: pass, `docs/reports/kessho-product-browser-runtime-latest.*`

Manual/device tests:

- Not run; Batch 4 uses automated browser/process CPU, mobile hotpath, and runtime probes.

Skipped validation with reason:

- Native iOS/macOS render CPU profiles were not run because native/device render evidence is Batch 5 scope; the CPU scenario report keeps those rows deferred.

Batch exit status:

- complete

Remaining blockers:

- None for Batch 4 automated CPU evidence. Native CPU/device evidence remains assigned to Batch 5.

Parallel coordination notes:

- Agent D / Batch 4 is closed. Fresh CPU evidence is available for Agent E; Product/Web A/B used web-ts only as the read-only reference runtime.

Next batch:

- Batch 5 Native/background audio evidence.

## Batch 5 Report

Changed files:

- `docs/product-core/product-core-self-sufficiency-ledger.md`
- `docs/reports/kessho-ios-background-audio-evidence-latest.json`
- `docs/reports/kessho-product-background-audio-device-evidence-latest.json`
- `docs/reports/kessho-product-native-capability-signoff-latest.json`

web-ts touched: no

Behavior changes:

- None in production runtime code for Batch 5. Native bridge support remains disabled until physical-device evidence passes.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:background-audio`: pass
- `npm run core:product:background-audio-docs`: pass
- `npm run core:product:native-render-path`: pass
- `npm run core:product:macos-native-smoke`: pass
- `npm run core:product:macos-app-native-smoke`: pass, peak 0.009591304697096348 / RMS 0.004648477711293731
- `npm run core:product:native-background-smoke`: pass, peak 0.009591304697096348 / RMS 0.004648477711293731
- `npm run core:product:background-audio-device-evidence`: pass with `allNativeRowsPassed=false`; 0 pass / 7 pending
- `npm run core:product:ios-background-audio-evidence`: pass with `releaseReady=false`
- `npm run core:product:native-capability-signoff`: pass with `ready=false`
- `npm run migration:docs`: pass

Manual/device tests:

- Not run. Required physical-device rows remain pending: `ios-native-foreground`, `ios-native-screen-lock`, `ios-native-app-background`, `ios-native-control-center`, `ios-native-route-change`, `macos-native-hidden`, `macos-native-sleep-wake`.

Skipped validation with reason:

- Physical iOS/macOS device tests were skipped because this environment cannot prove screen lock, app background, route change, interruption, Control Center, sleep/wake, or media-key behavior on the required devices.

Batch exit status:

- blocked on physical-device evidence

Remaining blockers:

- Record the 7 required rows in `docs/product-core/background-audio-device-evidence.md` with concrete pass evidence, tester, and date.
- Keep `supports_native_bridge = 0` and `supportsNativeBridge: false` until every required native row passes.

Parallel coordination notes:

- Agent E / Batch 5 local gates are green. Native/background support is not release-ready; Batch 6 cleanup can proceed only if it does not imply native support or flip native capability.

Next batch:

- Batch 6 Architecture streamlining and code-bloat reduction can proceed for product-core cleanup while Batch 5 waits on physical-device evidence.

## Batch 6 Report

Changed files:

- `cpp/KesshoCore/src/product/ProductState.h`
- `cpp/KesshoCore/src/product/sources/ProductSources.cpp`
- `cpp/KesshoCore/src/product/sources/SourceTargets.cpp`
- `cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp`
- `cpp/KesshoCore/src/product/sources/SourcePresetMorphRuntime.cpp`
- `cpp/KesshoCore/src/product/sources/SourcePresetMorphSelector.cpp`
- `cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp`
- `cpp/KesshoCore/src/product/sources/SourceOverrideRuntimeEvents.cpp`
- `cpp/KesshoCore/src/product/sources/SourceMix.cpp`
- `cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp`
- `cpp/KesshoCore/src/product/sources/SourceVoiceRuntimeRanges.cpp`
- `docs/product-core/product-core-self-sufficiency-ledger.md`
- `public/worklets/kessho_core.wasm`
- `scripts/check-kessho-product-architecture-boundaries.mjs`
- `scripts/check-kessho-product-patch-bridges.mjs`
- `scripts/kessho-core-build-manifest.mjs`

web-ts touched: no

Behavior changes:

- No intentional production behavior changes in Batch 6. Product Core source files were split along existing responsibilities and the shipped WASM was rebuilt from the refactored C++ source.
- Architecture guards now cover the new focused source files instead of allowing the old larger files to reclaim runtime responsibilities.

Validation run:

- `npm run type-check`: pass
- `npm run core:product:architecture`: pass
- `npm run core:product:native-render-path`: pass
- `npm run core:build:wasm`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:schema`: pass, deterministic hash `e91058d7e7f4594063038605c529b3f09810fe8eb01152e8121a74918077356d`
- `npm run core:product:param-accounting`: pass
- `npm run core:product:source-parity`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:sequencer`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run core:product:browser-runtime`: pass, report `docs/reports/kessho-product-browser-runtime-latest.json`
- `npm run core:product:cpu`: pass, disabled FX 2.72605% avg / 3.21% peak / p99 0.085 ms / missed 0; active FX 4.7676% avg / 5.2875% peak / p99 0.1408 ms / missed 0
- `npm run core:product:cpu-scenarios`: pass, report `docs/reports/kessho-product-cpu-scenarios-latest.md`
- `npm run core:product:granular-artifacts`: pass
- `npm run core:product:reverb-tail-quality`: pass
- `npm run core:product:sample-hold-parity`: pass
- `npm run core:product:background-audio`: pass
- `npm run core:product:native-capability-signoff`: pass with `ready=false`
- `npm run core:product:background-audio-device-evidence`: pass with `allNativeRowsPassed=false`
- `npm run core:product:ios-background-audio-evidence`: pass with `releaseReady=false`
- `npm run core:product:macos-native-smoke`: pass
- `npm run core:product:macos-app-native-smoke`: pass, peak 0.009591304697096348 / RMS 0.004648477711293731
- `npm run core:product:native-background-smoke`: pass, peak 0.009591304697096348 / RMS 0.004648477711293731
- `npm run migration:docs`: pass
- `npm run build`: pass
- `npm run migration:no-web-ts-bundle`: pass after build, 35 production JS assets scanned

Manual/device tests:

- Physical iOS/macOS device tests were not run. Local macOS native smoke/background diagnostics passed through automated SwiftPM commands.

Skipped validation with reason:

- Physical iOS/macOS background-audio rows were skipped because this environment cannot prove screen lock, app background, route change, interruption, Control Center, sleep/wake, or media-key behavior on required devices.
- Product/Web TS A/B CPU comparison was not rerun in Batch 6 because Batch 6 made behavior-neutral Product Core source splits and refreshed Product-only CPU/browser/build evidence; Batch 4 remains the latest web-ts A/B reference comparison.

Batch exit status:

- complete

Remaining blockers:

- Final signoff remains blocked on the Batch 5 physical-device evidence rows in `docs/product-core/background-audio-device-evidence.md`.
- Keep `supports_native_bridge = 0` and `supportsNativeBridge: false` until every required native row passes.

Parallel coordination notes:

- Agent F / Batch 6 is closed. The architecture guard now enforces the split source files and the rebuilt WASM compiles/runs against the focused Product Core source layout. No web-ts files were modified.

Next batch:

- Final signoff after physical iOS/macOS native background-audio evidence is recorded and native capability signoff reports `ready=true`.

## Evidence-Quality and CPU Attribution Addendum

Date: 2026-06-05 local time; reports generated 2026-06-04T22:28Z.

Changed files:

- `cpp/KesshoCore/tests/kessho_core_smoke.cpp`
- `scripts/check-kessho-product-granular-artifacts.mjs`
- `scripts/check-kessho-product-reverb-tail-quality.mjs`
- `scripts/check-kessho-product-cpu-scenarios.mjs`
- `scripts/lib/kesshoWasmRenderMetrics.mjs`
- `scripts/test-kessho-core.mjs`
- `src/audio/product/ProductEnginePort.ts`
- `docs/reports/kessho-product-granular-render-metrics-latest.json`
- `docs/reports/kessho-product-granular-render-metrics-latest.md`
- `docs/reports/kessho-product-reverb-render-metrics-latest.json`
- `docs/reports/kessho-product-reverb-render-metrics-latest.md`
- `docs/reports/kessho-product-cpu-scenarios-latest.json`
- `docs/reports/kessho-product-cpu-scenarios-latest.md`

web-ts touched: no

Behavior changes:

- None intended in production runtime behavior.
- Granular/reverb gates now render Product Core WASM offline and fail on non-finite output, denormals, excessive transition edges, silence bursts, stale module parameter counts, and render-block CPU overruns.
- CPU scenario signoff now requires those sonic render reports and writes module-attribution rows for Earth/soundscape, granular, reverb, spectral freeze, visual telemetry, UI subscription/callbacks, and native render callback status.
- `ProductEnginePort` is split into capability type surfaces while preserving the combined `ProductEnginePort` API.
- Reverb module smoke assertions now match the Bloom-enabled 31-float module parameter block; Delay B native smoke assertions now match the current 24-float tape-head-aware parameter block.

Validation run:

- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned
- `npm run migration:docs`: pass
- `npm run core:product:granular-artifacts`: pass, dense-grain render metrics generated
- `npm run core:product:reverb-tail-quality`: pass, impulse-tail/transition/CPU-mode metrics generated
- `npm run core:product:cpu-scenarios`: pass, module attribution generated
- `npm run core:product:wasm`: pass
- `node scripts/test-kessho-core.mjs`: pass, native smoke and WASM render smoke
- `npm run core:product:background-audio`: pass
- `npm run core:product:background-audio-device-evidence`: pass with `allNativeRowsPassed=false`
- `npm run core:product:native-capability-signoff`: pass with `ready=false`
- `test ! -f src/audio/engine.ts`: pass
- `test ! -f src/audio/runtime.ts`: pass

Current numeric evidence:

- Granular dense-grain offline render: pass; p95 block `0.064542 ms`; average estimated CPU `0.918872%`; max sample delta `0.030838`; max transition edge `0.030838`; max silent run `1` frame.
- Reverb offline render: pass; impulse tail peak `0.00109605`; tail estimated CPU `1.389197%`; transition estimated CPU `0.887276%`; max reverb mode estimated CPU `1.309466%`; max transition edge `0.00049469`.
- CPU module attribution: Earth/soundscape, granular, reverb, spectral freeze, visual telemetry, and UI callbacks pass; native render callback remains deferred.

Manual/device tests:

- Not run. Required physical rows remain pending: `ios-native-foreground`, `ios-native-screen-lock`, `ios-native-app-background`, `ios-native-control-center`, `ios-native-route-change`, `macos-native-hidden`, `macos-native-sleep-wake`.

Batch exit status:

- complete for source truth, sonic metric gates, CPU attribution, and type-surface streamlining.
- blocked only on physical-device native/background evidence for final native bridge enablement.
