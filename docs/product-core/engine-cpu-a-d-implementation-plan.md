# Implementation plan: engine CPU fixes A–D

Prepared: 2026-09-13. Repository: `/Users/panguroo/Documents/generativemusic`.

For the complete mobile optimization assignment, start with the [combined mobile CPU plan](mobile-cpu-implementation-plan.md). It puts recording telemetry and UI work before this A–D package, and includes asset admission and a separate browser-compatibility track.

## Assignment

Implement the four fixes below, in this order: **C → D → A → B → integrated verification**. This is an execution specification. Complete each stage and its checks before proceeding. Do not implement the other audit findings.

| Label | Change | Why this order |
| --- | --- | --- |
| C | Reverb updates only changed dependencies and avoids repeated derived-state rebuilds | Narrowest confirmed issue. Establish correct module-level commit behavior before changing shared dispatch. |
| D | Reuse spectral analysis for an unchanged captured window | Independent of C and A, with a precise operation-count oracle. Finish it before shared dispatch changes. |
| A | Give the dedicated master instance a path that omits Drift wet processing | Establish the two dynamics roles before B decides which role needs configuration. |
| B | Configure only affected FX groups within the existing batch | Touches shared control routing and overlaps A's dynamics setup. Comes last so it preserves the preceding engine fixes. |

C and D do not depend on each other, but this plan uses sequential implementation to make failures easy to locate. Do not introduce parallel writers to the shared engine files. Independent read-only inspections can run concurrently; compile/test jobs that share build files must run sequentially. Do not run CPU comparisons concurrently with other expensive jobs.

Source audit: [engine architecture CPU audit](../reports/engine-architecture-cpu-audit-2026-09-13.md).

## Boundaries

- Preserve sound, note timing, automation timing, RNG behavior where observable, routing and lifecycle behavior. No quality, voice-count, grain-count, sample-rate, FFT-size or hop-size changes.
- No UI redesign, new dependency, generalized configuration framework, production profiling subsystem or generic cache framework.
- Leave E–G, scalar-WASM compatibility, mobile recording telemetry, asset loading and the flawed aggregate module report outside this implementation.
- Prefer shared DSP changes that benefit both native and web. Do not fork a second version of the audio algorithm.
- Keep persistent preset/snapshot formats and public Product ABI unchanged unless a demonstrated requirement makes that impossible. Internal linked C functions do not automatically require new public WASM exports.
- Allocate fixed cache storage during construction/preparation. No allocation, lock, logging or expensive instrumentation in production render callbacks.
- Work from the current tree. Existing edits may already implement parts of this plan; inspect before adding duplicate work. Do not restore old files just to match this document.
- Use existing tests/harnesses where they fit. Add a small focused native test only where no existing test can exercise the requirement. Tests must execute behavior; source-text assertions alone are insufficient.
- Preserve existing sonic thresholds. Never loosen them to make an optimization pass.

## Stage 0 — Establish the baseline and test entry points

1. Read repository instructions and the Ponytail skill. Inspect the current changes and record the current revision plus whether the tree is modified.
2. Read the files listed under each stage. Search every caller before changing a setter, factory or configuration function. If files have moved, locate the symbol rather than inventing a replacement.
3. Record a short baseline in `docs/reports/mobile-cpu-implementation-results.md`: revision/tree status, compiler, build flags, sample rate, block size, commands and failures already present.
4. Keep a baseline copy of the **current** relevant source and compiled artifact under the ignored build directory for before/after comparisons. Do not use `git show HEAD` as the sole baseline when relevant files have uncommitted changes. If the binary is stale, build the current source before capturing it.
5. Reuse `scripts/lib/kesshoWasmRenderMetrics.mjs` for isolated module rendering where its exports fit. It accepts a `wasmPath`. Use `scripts/run-kessho-product-cpp-test.mjs` for Product C++ tests. Inspect scripts first: some write shared reports/build outputs.
6. Prepare one focused regression scenario when starting each stage, preferably by extending an existing test. Combine operation counts and audio comparison in that scenario. Do not build all fixtures up front or create a new harness. Use finite, nonzero audio where appropriate.

Known baseline observations to reproduce, not hard-code as universal facts:

- Reverb at its initialized FDN configuration: an identical wrapper commit does no preset rebuild; changing width alone triggered four `updatePreset()` calls.
- Spectral Stretch at zero speed, after recording enough material and freezing: 47 capture analyses in one warmed 48 kHz second, all at the same position. Each analysis includes mid/side forward FFTs. Counts can differ by one with hop alignment.
- Do not derive isolated engine CPU from the old module report's zero or whole-scene entries.

Use 48 kHz / 128 frames for comparable operation counts. Add another sample rate or block size only if the changed calculation depends on it and existing coverage does not exercise that dependency. A desktop/WASM result is not an older-iPhone support claim.

## Stage 1 — C: reverb dependency updates

### Files and reading order

1. `cpp/KesshoCore/src/modules/KesshoReverbModule.cpp`: parameter indices, `commitParams`, prepare/reset and the existing committed-vector cache.
2. `wasm/reverb/kessho_reverb.cpp` and `.h`: `updatePreset`, `updatePredelay`, every setter and instance wrapper.
3. `cpp/KesshoCore/src/product/fx/ProductReverbModuleConfig.cpp` and its callers.
4. `scripts/check-kessho-product-reverb-tail-quality.mjs` and its render harness.

### Required implementation

1. Keep the existing identical-vector early return. Invalid/newly prepared state must still receive a complete initialization.
2. Build an explicit dependency list from what `updatePreset()` and `updatePredelay()` actually read. Do not infer it solely from parameter names: bloom and warp-related values can interact with network configuration.
   - Reviewed `updatePreset()` inputs are preset type, quality, decay, size, diffusion, bloom, warp, sample rate and scale; `updatePredelay()` reads predelay milliseconds and sample rate. Recheck these actual reads before implementing. In particular, the old trailing bloom setter also rebuilds with the warp value set earlier. Removing that call without marking warp dirty leaves stale delay-network state. Include a warp-only regression with an active tail, and preserve Dattorro/type-transition initialization.
3. In the wrapper, call only setter groups whose inputs changed. Reuse the straightforward changed-field approach in `KesshoGranularModule.cpp`; do not add reflection or a registry.
4. Make setter work dependency-aware. For example, a width change passed through the combined setter must update width without rebuilding delay-network values that did not change.
5. Coalesce dependent rebuilds within one wrapper commit. A practical bounded approach is per-instance begin/end parameter-update calls with dirty flags for preset and predelay state. Individual setters outside a batch should retain their previous immediate semantics. Store flags in instance state, never in a process-global cache shared between instances.
6. Finish all required derived updates at the end of the commit, before any audio renders. Do not leave a setter's visible derived state stale until an unrelated future operation.
7. Reset/prepare must invalidate the committed cache and any dirty/batch state correctly. Preserve initialization order and mode-transition side effects.

### Focused check and exit gate

Extend one existing reverb scenario: initialize an active tail, repeat an identical commit, change width, then change warp and a grouped dependency. Assert zero preset rebuilds for identical/width edits and at most one for a dependent commit; compare PCM with the saved baseline. If adding per-instance batch state, include a second instance and reset in this same scenario to catch state leakage. Use test-only counters.

This focused check completes the stage. Run the existing broad reverb-tail check once in final integration; do not recreate its mode/quality matrix.

## Stage 2 — D: unchanged spectral capture analysis

### Files and reading order

- `cpp/KesshoCore/src/modules/spectral_freeze/SpectralFreezeEngine.{h,cpp}`
- `SpectralFreezeCaptureBuffer.{h,cpp}`, `SpectralFreezeScanHead.{h,cpp}` and `SpectralFreezeStft.{h,cpp}` in the same directory
- `cpp/KesshoCore/src/modules/KesshoSpectralFreezeModule.cpp`
- Existing spectral fixture coverage located by searching the tests/scripts for `SpectralFreezeEngine` and `capture_serial`; do not invent a package command.

### Required implementation

1. Trace all calls to `analyzeCaptureFrames`, `analyzeCaptureFramesInto` and `analyzeCaptureMagnitudes`. Limit the cache to analysis of the locked capture. Live analysis must not use this cache.
2. Add one bounded last-result cache. Its validity must include the capture generation and exact analyzed position; reset/reprepare/recapture must invalidate it. Do not use a position epsilon: nearby positions can represent different samples. Key the exact position actually passed to extraction, not a zero-speed UI value: smoothing may still move it. Set cache validity only after successful analysis, and invalidate every mutation/replacement of locked capture data, including failed/restarted capture transitions where old contents become invalid.
3. Cache raw mid/side magnitude and phase. `blendEndpointMagnitudes` can modify `source_magnitude_`; simply returning early from analysis risks reusing blended data and accumulating changes. Restore raw values on a hit before downstream processing.
4. Reuse existing buffers only if you can prove downstream functions do not overwrite the cached values. Otherwise use fixed arrays. Four arrays of 2049 floats cost about 32 KiB; record actual added storage. Do not cache multiple windows or introduce heap allocation per hop.
5. On a miss, run the exact existing extraction/analysis and update the cache. On a hit, skip only extraction/forward analysis and restore the cached raw result.
6. Keep `updatePositionTarget`, phase advancement, source-phase bookkeeping, endpoint blending, memory capture/live refresh, decay, normalization, scan advancement, inverse transforms and overlap-add running as before.
7. Preserve any independent endpoint-analysis work. Do not accidentally share an output buffer or cache entry between the main analysis and endpoint blending.

### Focused check and exit gate

Use one captured, nonzero signal: freeze stationary, move by a tiny position increment, recapture, then reset. Assert repeated stationary hops skip main forward analysis, movement/recapture invalidate it, and synthesis continues. Compare output against baseline, including a Living Stretch refresh segment because it can modify analysis inputs. Record the bounded cache storage.

This scenario completes the stage. Do not add separate fixtures for every scan direction or mode already covered by existing tests.

## Stage 3 — A: dedicated master processing path

### Files and reading order

1. `cpp/KesshoCore/src/product/KesshoProductEngine.cpp`: creation of the two dynamics instances.
2. `cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp`: `configure_module(..., false, true)` versus `(..., true, false)` and every value used by the master path.
3. `ProductDynamicsRender.cpp` and related dynamics/terminal files in that directory.
4. `cpp/KesshoCore/src/modules/KesshoDynamicsDriftModule.cpp` and `KesshoModule.h`.
5. `wasm/dynamics-drift/kessho_dynamics_drift.{h,cpp}`: initialization, smoothing, telemetry and all master-stage helper functions.

### Required implementation

1. Make a dependency checklist for the master functions: which parameter arrays, filters, detector/envelope state, random values, sample clock and telemetry do they read/write? Follow helpers recursively. Do not assume everything above the final wet/dry mix is irrelevant.
2. Mark the Product master instance with a fixed internal role at creation. Keep the generic factory/standalone users defaulting to the existing full processor. A boolean role or similarly small explicit option is sufficient; no class hierarchy or new DSP framework is needed.
3. Route that instance to a master-only processing entry point or a role branch selected once per block. Reuse the existing master saturation, end-chain compressor, two-band clarity and clarity-lift helpers in their original order.
4. Preserve input sanitization, necessary parameter smoothing, output writing, clock progression and meaningful master telemetry. Determine exactly which setup/filter updates those helpers require and retain them.
5. Omit wet delay reads/writes, wet modulation/filter/compression, and unrelated wet diagnostics only where they are outside the proven dependency set.
6. Do not activate this optimization merely because a generic instance's wet mix is currently zero. That instance may later need its existing history. The dedicated Product master role is fixed for the instance lifetime.
7. Preserve the role across reset/reprepare/recreation. Keep the Degrade-send instance on its full path. Do not add the role to persisted presets or snapshot schemas.
8. If splitting common setup is required, extract a small helper used by both paths. Do not copy the whole loop into a second implementation that can drift.

### Focused check and exit gate

Extend one Product integration scenario using actual `ProductDynamicsConfig` settings, including its nonzero defaults. Compare old full-path and new master-path PCM and consumed master telemetry through a representative master-control transition and reset. Include a simultaneous wet instance to prove it remains active and independent. A test-only counter must demonstrate the omitted wet work.

This check completes the stage. Reuse existing Dynamics coverage for modes and quality settings; do not duplicate that matrix. The standalone generic export cannot substitute for testing the Product master role. Run existing Dynamics and FX-depth checks once in final integration.

## Stage 4 — B: targeted FX configuration

### Files and reading order

- `cpp/KesshoCore/src/product/fx/ProductFx.cpp`, `ProductFxModules.cpp`, `ProductReverbModuleConfig.cpp`, `ProductDynamicsConfig.cpp`
- `cpp/KesshoCore/src/product/KesshoProductEvents.cpp`, `KesshoProductRender.cpp`, `ProductState.h` and the existing engine method declarations
- All callers of `configureFxModules`, `configureReverbModule`, `configureSpectralFreezeModule`, `configureDynamicsDriftModule` and the begin/end batch functions
- `cpp/KesshoCore/src/modules/KesshoDelayAModule.cpp`, `KesshoDelayBModule.cpp`

### Required implementation

1. Create a small dependency table in the results document **before changing call sites**. For each event family record the affected configuration groups and why. Use actual reads by the configuration functions.
2. Extend the existing pending-state mechanism with a fixed group mask (or equivalent small flags). Suggested groups: Delay A, Delay B, Reverb, Granular, Freeze, master dynamics, wet dynamics. Retain an explicit all-groups path for initial load/reset/full configuration.
3. Reuse the existing nesting depth. Requests accumulate during a batch; the outermost end flushes requested groups in the established order. Requests outside a batch apply immediately. Clear pending flags safely before the flush so nested requests are not lost.
4. Preserve exact event/sample-offset boundaries. Do not merge changes from different audio offsets or defer audible controls to another block. A full snapshot still initializes every required group once.
5. Split the existing broad configuration body into bounded per-group functions. Preserve formulas and parameter clamping exactly. This is a dispatch refactor, not an opportunity to rewrite mapping behavior.
6. Adapt A's dynamics setup so master-only changes configure only the master instance and wet-only changes configure only the wet instance. Shared controls must mark both when the dependency table shows both read them.
7. Convert scalar event families progressively: delays first, granular next, dynamics next, then routing and remaining broad callers. Keep C's reverb setter guards and D's cache invalidation intact.
8. Routing changes are not automatically single-group changes. Edge enablement feeds delay send flags and activation; granular return/send smoothing and topology dependencies must remain correct. When a dependency is genuinely broad, request all affected groups explicitly.
9. Preserve the already specialized tempo-retiming path. Preserve harmony/scale/seed dependencies of granular configuration and the existing soundscape dirty flush. Do not discard a non-FX side effect because the function name looks unrelated.
10. Add dependency-based guards to Delay A/B setup: mix/send changes must not recompute unchanged filters; Delay B tap-runtime derivation runs only when its inputs change. Stereo filters may share coefficients but must retain separate history. Keep all original transitions and delay-time smoothing.
11. Search the remaining full-configuration callers and classify each as intentional initialization/topology work or a missed conversion. Do not leave a common scalar path broad without recording the reason.

### Focused check and exit gate

Extend one existing configuration scenario with test-only group counters: a single-group edit, two same-boundary edits inside a nested batch, a second sample boundary, and a full reset. Assert only dependent groups update, each boundary retains its timing, and reset configures all groups. Include one routing change identified by the dependency table and master/wet separation. For the changed delay guards, include a mix-only edit and a true coefficient dependency.

This scenario completes the stage. Reuse existing routing/audio coverage at final integration rather than adding a parallel routing matrix. Rerun earlier focused checks only when B touches their dependencies. Preserve behavioral coverage if a legitimate refactor requires updating a source-token guard.

## Stage 5 — Rebuild, integrated checks and results

1. Rebuild after DSP changes before any WASM-based verification. At preparation time, `npm run core:build:wasm` performs generation, compilation and embedded/runtime asset updates. `npm run core:product:wasm` checks the existing artifact; it is **not** the build command. Recheck package scripts if they have changed.
   - The standalone dynamics test is a separate artifact: `scripts/check-dynamics-drift-wasm.mjs` reads `public/worklets/kessho_dynamics_drift.wasm`. After shared Dynamics DSP edits, run `bash wasm/dynamics-drift/build.sh` before `npm run test:dynamics-drift`; the script builds and copies that binary. `core:build:wasm` does **not** refresh it. Preserve the original standalone baseline before rebuilding. Its generic exports do not by themselves prove the new Product master role works.
   - Record the artifact path and successful rebuild command; hashes are optional unless needed to distinguish saved baseline/final binaries. Build shared outputs sequentially. Missing Emscripten blocks verification; a stale binary is not a substitute.
2. Use one execution path for each shared-DSP focused scenario. Add native/web-specific checks only for an actual boundary difference, such as R1's native atomic publisher and worklet decoder. Do not require duplicate native and WASM suites for identical DSP logic.
3. Run one final integration pass. Reuse results already obtained against final code and avoid invoking the same underlying check twice:

   ```text
   npm run core:product:reverb-tail-quality
   npm run test:dynamics-drift
   npm run core:product:fx
   npm run core:product:fx-depth
   npm run core:product:realtime-safety
   npm run build
   git diff --check
   ```

   `npm run build` currently includes `core:product:wasm`, so do not also run that checker separately. Keep any repository-required gates. Add graph, sample-hold, determinism or dirty-diff checks only when changed routing, seed/timing behavior or guard structure specifically warrants them; do not run the whole list by default. If selected scripts overlap, use the narrowest existing entry points that cover the affected behavior. Read scripts before running shared report writers.
4. Measure R1 first, then each fix using the existing harness where practical. Operation counts are sufficient evidence of removed work for C/D/B; do not require a timing study for every stage. Use one representative warmed before/after CPU comparison for the final workload. Repeat only when making a numerical speedup claim or resolving noise; use at least three matched trials for such a claim. No new percentile collector, benchmark framework or mandatory per-stage performance report.
5. Expect identical PCM for redundant-work removals under matched builds. Investigate mismatches and preserve existing justified tolerances. Do not loosen thresholds or turn removed-call counts into a CPU percentage.
6. Review for duplicated DSP, production diagnostics, stale generated assets, accidental ABI/preset changes and unrelated edits. Use one results document, `docs/reports/mobile-cpu-implementation-results.md`, with a small table: stage, status, change/work removed, focused check, measurement or limitation. Put shared environment/build details and final integration results once above/below it. No separate engine ledger is required.

## Failure handling and completion contract

- If a focused assertion fails, stop advancing through the plan, inspect the first divergence and repair the current stage. Preserve completed stages and unrelated current work.
- A stale or incompatible harness is a tooling issue to diagnose, not permission to omit the acceptance criterion. Make the smallest relevant harness adjustment.
- If a proposed skipped calculation supplies audible state, keep that dependency and narrow the optimization. Explain the reduced scope in the results; do not silently change sound.
- If a stage cannot preserve behavior after a concrete investigation, leave its unsafe change unapplied and report the exact blocker. Do not label the overall A–D assignment complete.
- No physical iPhone is assumed available. Complete software work and report device acceptance as unmeasured; do not claim expanded hardware support.

Final delivery must state which of A–D are complete, measured work/cost reductions, audio/test evidence, and remaining limitations, with a link to the results document. The implementer should not stop at another plan.
