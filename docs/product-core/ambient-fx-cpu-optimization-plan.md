# Ambient FX CPU optimization plan and implementation

Implemented 2026-10-08. See [implementation results](ambient-fx-cpu-optimization-results.md) for measured gains, validation, and limitations. The stage instructions below preserve the design and acceptance criteria used for the changes.

## Objective and order

Reduce CPU while retaining dense ambient washes, the existing grain overlap, and smooth spectral freeze. Implement the following stages sequentially. Validate each stage before starting the next.

| Stage | Change | Expected benefit | Audio requirement |
| --- | --- | --- | --- |
| 0 | Save a matched baseline and establish focused comparisons | Measurement only | Baseline must use the same input, settings and build flags |
| 1 | Table lookup for granular Saw decay curves and Tide sine | Potentially noticeable in dense Saw/Tide clouds | Small, explicitly bounded approximation |
| 2 | Cache unchanged spectral magnitude bookkeeping | Potentially noticeable in Solid and stationary Stretch | Numerically identical output within the same build/toolchain |
| 3 | Hoist Clean scan lookback out of the sample loop | Potentially noticeable with Clean scan + write-follow | Numerically identical output |
| 4 | Skip reads for waiting, silent Bloom ghosts | Minor to moderate in Bloom-heavy clouds | Numerically identical output and state advancement |
| 5 | Rebuild runtime artifacts and run integration checks | Delivery | Correct source and shipped binaries must match |

Do not implement the smaller reverb recommendations in this pass. Reverb density, diffusion, modulation and tails remain as they are.

The earlier measurements compared existing modes, not optimized implementations: dense Triangle/Saw/Tide were approximately 75/97/107 microseconds per 128-frame block on the local WebAssembly runtime. Those numbers identify candidates; they are not speedup promises or mobile-device measurements.

## Scope and non-negotiable constraints

Repository root: `/Users/panguroo/Documents/generativemusic`. Paths below are relative to this root. Function names are the stable navigation anchors; line numbers can move.

- Keep current grain density, maximum grain counts, grain duration, overlap, interpolation-quality selection, anti-alias filtering, per-voice/bus diffusion and stereo behavior.
- Keep spectral FFT size 4096, hop size 1024, windows, overlap-add, phase updates, random diffusion, magnitude attack/release smoothing and ping-pong endpoint blending.
- Keep random-number consumption and order. Do not remove apparently unused random draws as part of this work.
- Keep capture, release, freeze/unfreeze, parameter updates, reset and multiple-instance behavior.
- No allocations, table generation, logging, file operations or locks inside audio rendering. Initialize new tables with the existing initialization-time tables.
- No new dependencies, generic cache/table framework, thread, worker, quality mode, user setting, public parameter or ABI change.
- No resampling, lower engine sample rate, shortened tails, silence thresholds, fewer FFT hops or fewer grains.
- Do not change defaults, presets, UI or audio routing.
- Do not clean up unrelated code. Keep generated timing logs and local audio renders out of source control.
- Within a bounded inspection stage, batch independent tool calls using `Promise.allSettled`. Keep dependent edits, builds and checks sequential. Run CPU benchmarks alone, without other builds or benchmarks competing for CPU.

## Files to work in

Production source:

1. `wasm/granular-fx/kessho_granular.cpp`: stages 1, 3 and 4.
2. `cpp/KesshoCore/src/modules/spectral_freeze/SpectralFreezeEngine.h`: stage 2 private cache fields/signatures and test-only controls.
3. `cpp/KesshoCore/src/modules/spectral_freeze/SpectralFreezeEngine.cpp`: stage 2.

Existing support to reuse:

- `cpp/KesshoCore/tests/kessho_core_smoke.cpp`: existing paired spectral-cache engines and transition assertions.
- `scripts/test-kessho-core.mjs`: compiles the native smoke test with `KESSHO_SPECTRAL_FREEZE_ENABLE_TEST_COUNTERS`; also checks the existing shared WASM.
- `scripts/lib/kesshoWasmRenderMetrics.mjs`: `createKesshoModuleHarness`, input/parameter access and timing.
- `scripts/check-kessho-product-granular-artifacts.mjs`: existing granular rendering and transition gate.
- `scripts/kessho-core-build-manifest.mjs`: authoritative production source/include list.

Use `cpp/KesshoCore/tests/GranularCpuOptimizationTests.cpp` for the focused granular checks and `scripts/benchmark-ambient-fx-cpu.mjs` for the matched comparison if new files are needed. Keep the benchmark limited to two input WASM paths and the scenario matrix below, reusing the existing harness. Do not build a new testing framework. Do not enlarge the existing mobile benchmark: its reconstructed baseline targets older, different optimizations and is not an appropriate baseline for this work.

## Stage 0 — Establish the baseline

1. Record the initial Git status and source revision. Keep unrelated work intact. The baseline is the source present when implementation begins, not an assumed clean `HEAD`.
2. Run `npm run core:build:wasm` before saving the baseline, so the baseline binary represents the starting source. Save that shared WASM and copies of the three production source files above in a task-specific temporary directory. Keep the baseline available until final comparisons pass.
3. Reuse `createKesshoModuleHarness(root, moduleType, { wasmPath })` to run the saved baseline and rebuilt candidate with the same inputs/settings. Module types: granular `4`, spectral freeze `5`.
4. Use deterministic nonzero stereo input. A continuous multitone input is sufficient for the repeatable CPU check; also use an impulse/sparse pluck and a sustained pad-like signal for audio checks. Generate samples outside timed rendering.
5. Fill spectral capture history for at least one second before requesting capture. Set active plus a new capture serial, then verify the state reaches Frozen. A silent or never-captured freeze is not a valid benchmark.
6. Use 48 kHz and 128-frame blocks for the main timing comparison. Use at least 4096 warmup blocks and 4096 measured blocks, five paired trials, alternating baseline/candidate order. Test 44.1 kHz separately for correctness, without repeating the entire timing matrix.
7. Time rendering only. Exclude preparation, input generation, parameter commits, assertions and output analysis from the timed section. Report median trial render time and block p95/p99, with raw trial results retained.
8. Preserve a baseline for each stage as well as the original baseline. A later regression must be attributable to the stage that introduced it.

Use this bounded scenario matrix:

| Scenario | Configuration and purpose |
| --- | --- |
| Dense Triangle | Four granular voices, Balanced, cap 48, density 32/s per voice, 300 ms grains, 20 ms attack, 280 ms decay; unchanged control case |
| Dense Saw Up / Saw Down | Same configuration, changing only shape; exercise both power curves |
| Dense Tide | Same Triangle configuration, Tide style and nonzero stereo spread; exercise sine replacement |
| Held Stretch | Mode Stretch, speed 0, refresh 0, nonzero diffusion, sustain 1; exercise bookkeeping reuse |
| Solid | Captured Solid, nonzero diffusion; exercise normalization-target reuse |
| Moving Stretch / Living Stretch / Slushy | Speed 0.5 for moving modes; refresh 0.5 for live modes; check unaffected work and invalidation |
| Four Clean scans | Clean mode, speed 0, scan rate 1, write-follow 1; compare the lookback hoist; also check write-follow 0 |
| Dense Bloom | Four granular voices, Bloom 0.8, cap 48; include a pitched HQ case so skipped reads are exercised with sinc interpolation |

Parameter indices are defined in `KesshoGranularModule.cpp` and `KesshoSpectralFreezeModule.cpp`. Recheck them rather than guessing. Current granular global shape index is 7; quality/max grains start at 138; extended voice parameters start at 143 with stride 14. Regular voice parameters start at 10 with stride 25. Current freeze mode/capture serial/speed indices are 1/2/3.

## Stage 1 — Granular curve calculations

Location: `GranularState` table fields, initialization-time LUT construction, `grain_decay_curve`, and the Tide branch in `process_granular_voice`.

### 1A. Replace the two Saw decay powers

1. Add a private constant for 1024 table segments. Allocate **1025 entries**, including both endpoints, for each new unit-domain power table.
2. Store two float arrays beside the existing per-instance Hann/pan tables. Initialize entry `i` with the original float math: `powf(i / 1024.0f, 0.65f)` and `powf(i / 1024.0f, 1.4f)`.
3. Use linear interpolation between neighboring entries. Handle `x <= 0` and `x >= 1` explicitly before reading `index + 1`. A small private helper is sufficient.
4. In `grain_decay_curve`, retain the existing `t` clamp and calculate `x = 1.0f - t` in the same way as the original expression.
5. Saw Up: for `x < 4.0f / 1024.0f`, keep the original `powf(x, 0.65f)`. Else use its table. This tiny exact tail region avoids the poor interpolation accuracy of the fractional power near zero.
6. Saw Down: use the 1.4-power table throughout, with the explicit endpoint handling above.
7. Leave Triangle, Square, Hann lookup and all attack formulas unchanged. In particular, do not replace the Saw Down attack's `sqrtf` as part of this work.
8. Keep the existing grain envelope smoother coefficient `0.005f`, timing, attack/decay lengths and gain multiplication order.

Why the exact tail matters: a plain 1024-segment table for the 0.65 power can have approximately 0.00174 maximum absolute error near zero. Keeping the final four segments exact reduces the mathematical interpolation error to approximately 0.000042. Verify actual float results; these preliminary numbers are not acceptance evidence.

### 1B. Replace Tide's repeated sine

1. Add one 1025-entry periodic sine table, initialized beside the two power tables with the same `6.2831853f` constant used by the current Tide expression. Set the wrap endpoint equal to entry zero.
2. Preserve the current clamped grain phase and `grain->tide_phase`. Convert their sum to a unit-cycle lookup position using wrap-to-unit-interval, then interpolate the sine table.
3. Keep the current Tide-depth condition and the exact surrounding amplitude expression. Do not simplify its algebra, change Tide phase initialization, or change random calls.
4. Do not replace spectral phase trigonometry or other oscillators with this table.

Together these three tables add about 12 KiB per granular instance. No process-time allocation is needed.

### Stage 1 checks

- Compare table results to the original float formulas over at least 100,000 values, table boundaries and near-endpoint values. Require maximum absolute error <= `5e-5` for Saw Up, <= `1e-5` for Saw Down, and <= `1e-5` for the Tide sine over its actual phase range.
- Require power endpoints to be exactly 0 and 1, monotonic power curves, finite outputs, and no out-of-bounds lookup at endpoints.
- A focused white-box test can include `../../../wasm/granular-fx/kessho_granular.cpp` from a test file under `cpp/KesshoCore/tests` and use the real helpers. Compile that test as a standalone translation unit; **do not use the Product test runner for it**, because that runner also compiles the implementation and would create duplicate symbols.
- Compare deterministic rendered Saw/Tide output against the saved baseline, initially with feedback disabled to isolate approximation error. For the normalized test input, require relative RMS error <= `1e-3` and maximum absolute sample difference <= `1e-4`. These are engineering regression gates, not a claim of inaudibility.
- Triangle/Classic must retain exact numerical output because it uses neither replacement.
- Then render with the existing feedback/blur/diffusion active and through the unchanged long-tail reverb. Check finite output, stable level, no new clicks and no systematic brightness/decay change. Do not require exact sample identity for approximate curves inside feedback.
- If a curve-error gate fails, inspect endpoint/wrap arithmetic first. Do not loosen the threshold. If necessary, increase only the failing table to 2048 segments and repeat its focused checks.
- Measure Saw and Tide independently. If one replacement has no reproducible benefit, remove that replacement and its unused table while retaining the successful one.

Compile the focused granular test from the repository root with `/usr/bin/clang++ -std=c++17 -O2 -Wall -Wextra -Werror cpp/KesshoCore/tests/GranularCpuOptimizationTests.cpp -o /tmp/ambient-granular-cpu-tests`, then run `/tmp/ambient-granular-cpu-tests`. Its `main` should initialize the real granular instance before reading initialized tables and destroy it afterward. Test actual production helpers against the original formulas; do not duplicate the lookup implementation inside the test.

## Stage 2 — Exact spectral magnitude bookkeeping cache

Locations: `analyzeCaptureFrames`, `blendEndpointMagnitudes`, `renderFrozenHop`, reset/capture/release/invalidation paths in `SpectralFreezeEngine`.

This stage must preserve the original math. It avoids repeating math for unchanged spectra; it does not approximate log/exp or reduce synthesis work.

### 2A. Make reuse conditions explicit

1. Change the private `analyzeCaptureFrames` return type to `bool`: return true only when the existing exact generation/position cache was reused, and false after fresh analysis. Preserve its array copies, cache writes and test counters. `beginCaptureAtHop` may ignore the return value.
2. Change private `blendEndpointMagnitudes` to return `bool`: false on each existing early return, true after the existing blending loop runs. Keep all analysis and interpolation math unchanged.
3. Add a private boolean `held_matches_unblended_capture_`, initially false. It means the held memory still equals the raw, unblended result in the current capture-analysis cache.
4. After the existing analysis, phase update and endpoint-blend calls in `renderFrozenHop`, skip `memory_.capture` only if **all** are true:
   - this hop reused the exact capture-analysis cache;
   - `held_matches_unblended_capture_` was true on entry;
   - this hop performed no endpoint blend;
   - this hop will perform no Living Stretch live-memory update;
   - the new bookkeeping cache is enabled (always true in production; test-only control described below).
5. Otherwise call `memory_.capture` exactly as before and invalidate the normalization-target cache described below.
6. After this branch, set `held_matches_unblended_capture_` true only when there was no endpoint blend and no live-memory update. It is false after any Slushy live update.
7. Keep Living Stretch's `memory_.capture` before `updateFromLive` whenever refresh is positive. Repeating that reset is part of current behavior; do not accumulate refresh across hops differently.
8. Keep Slushy's `updateFromLive` even when refresh is zero. Its current attack/release formulas still update memory at zero refresh.

Do not use `stretch_speed == 0` as the reuse test. Position smoothing can move the scan at zero speed. The actual exact cache hit and the conditions above determine reuse.

### 2B. Cache the normalization target, not the smoothed gain

1. Add a private cached target float, default 1, and a validity boolean, initially false.
2. When invalid, execute the existing source/held energy loop, conversion, threshold, square root and clamp without changing operation order. Store the resulting `target_normalization` and mark it valid.
3. When valid and bookkeeping reuse is enabled, use the stored target.
4. **Always** execute the original `normalization_gain_ += (target - normalization_gain_) * 0.1f` every rendered hop. Skipping this would change transitions.
5. Invalidate the target whenever source or held magnitudes change: new analysis, actual endpoint blending, `memory_.capture`, and every `memory_.updateFromLive`.
6. Clear both reuse flags in `reset`, `invalidateCaptureAnalysisCache`, and on an actual mode change in `setParams`. Existing capture/release paths already call capture-cache invalidation; verify them rather than adding a second lifecycle system.
7. Leave parameter sanitization, capture generations, analysis-cache ownership and all other parameter behavior unchanged. Tone, width and diffusion processing still run as before.

The simplest implementation is a small private helper containing the existing normalization-target calculation, plus the flags above. No spectrum hashing, new arrays, generalized dirty graph or additional spectral cache is needed.

### Stage 2 checks

Extend the existing paired-engine test in `kessho_core_smoke.cpp`. Under the existing `KESSHO_SPECTRAL_FREEZE_ENABLE_TEST_COUNTERS` macro, add a switch that disables **both new bookkeeping skips**, and counters for memory captures and normalization-target recalculations. Keep these controls/counters out of production builds and out of the C/WASM ABI.

- Baseline engine: new bookkeeping cache disabled. Candidate engine: enabled. For this comparison keep the existing forward-analysis cache enabled in both, so the test isolates the new work. Preserve the existing independent forward-analysis-cache test as well.
- Require finite, nonzero output and exact numerical left/right equality for the exact cache stage. If equality fails, fix invalidation; do not replace this with a broad tolerance.
- Once stationary state is settled, require no repeated memory capture in ordinary stationary Stretch and no repeated normalization-target calculation in Solid/stationary Stretch. Synthesis and its smoothing must continue every hop.
- Compare both engines through: position moves at zero speed; speed 0 -> 0.5 -> 0; ordinary Stretch -> Living Stretch with refresh -> ordinary Stretch; refresh 0 -> positive -> 0; Solid/Slushy transitions; release and recapture; reset and refill.
- Exercise PingPong endpoint blending, then stop near an endpoint. Verify blended magnitudes are not incorrectly reused as raw capture magnitudes.
- Check sustain below 1, nonzero diffusion, stereo width/tone changes, and 44.1/48 kHz. Normalization caching must not stop held decay or phase motion.
- For focused iteration, run `KESSHO_SPECTRAL_FREEZE_FOCUSED_ONLY=1 npm run core:test`. Its focused native path returns early after the cache checks; it still runs the script's existing WASM checks against whatever binary is present. Therefore it does **not** prove that new source is already shipped in WASM. Stage 5 addresses that.

Expected scope: Solid and stationary Stretch benefit. Moving Stretch and live-refresh modes should remain essentially unchanged in this exact first pass.

### Explicitly defer the moving-Stretch unity shortcut

Do not replace `target_normalization` with 1 in this pass. Although source and held magnitudes represent the same spectrum in ordinary Stretch, the current log/exp round trip is not bit-identical. That shortcut is a separate approximation, with mode-transition and level consequences to validate. The exact cache above has a much clearer contract for this handoff. Also defer the minor per-band coefficient cleanup and any FFT implementation replacement.

## Stage 3 — Hoist Clean scan lookback

Location: `process_clean_voice`, specifically the `is_lfo_scan` branch and its call to `clean_lookback_samples_for_voice`.

1. Once the block's `write_follow` value is resolved and inside the scan branch, calculate `lookback_samples` once before the sample loop, only when `write_follow > 0.01f`.
2. Inside the existing write-follow branch, use that local value. Keep the rest of target-position math where it is.
3. Do not add a persistent cache or dirty flag. A block-local variable automatically handles lookback edits, sample rate, buffer resizing and reset.
4. Do not change the Clean 40 ms lookback minimum to the granular spawn path's 60 ms minimum. Their present behavior differs intentionally for purposes of this CPU-only change.
5. Leave LFO cadence, target smoothing, both scan heads, crossfade tables and scan advancement unchanged.

Checks: exact numerical output against the stage baseline with write-follow 0 and 1; test low/high lookback, buffer resize, reverse scan and an active LFO. Confirm the lookback helper is called once per eligible voice/block instead of once per sample. Preserve normal Clean mode and Granular mode output exactly. No new public test hook is needed for this local hoist.

## Stage 4 — Skip silent waiting Bloom reads

Locations: `spawn_bloom_ghosts` and the active-grain loop in `process_granular_voice`.

Current behavior: a new ghost has a negative `start_sample`, a zero initial envelope state copied from its newly spawned parent, and continues advancing its read position while waiting. Its interpolated samples are multiplied by zero.

1. Add a narrowly scoped predicate: `grain->is_ghost && grain->start_sample < 0 && grain->env_z1 == 0.0f`.
2. Only for that predicate, skip the stereo buffer reads, envelope/Tide calculation and zero-valued accumulation. Do not use an approximate silence threshold.
3. Keep `active_count++` and all scheduling unchanged. Waiting ghosts must still count toward the same gain compensation and global grain cap.
4. Keep the common state-advancement code after the conditional unchanged: wrap position after adding playback rate, apply playback-rate step, increment `start_sample`, perform lifetime/removal handling and advance the active-list iterator.
5. Do not insert an early `continue` that skips any of that common advancement. Do not postpone spawning or start the ghost from a different position when it becomes audible.
6. Keep waiting-ghost random draws, visual events, anti-alias rate selection and ghost-count limits unchanged.

Checks: compare the full output, including the first audible ghost sample, against the stage baseline. Require exact numerical equality with the same random sequence. Include one and two ghosts per source, negative ages -2/-1/0/1, reverse playback, nonzero glide, all envelope shapes, a full grain pool and freeze/unfreeze. Run this comparison after stage 1 with the same curve tables in both sides, so approximation changes do not contaminate the exact-skip check.

Use a focused white-box check to confirm waiting-ghost ages, positions, playback rates, active counts and removal behavior match an unskipped reference. Do not introduce a public diagnostics API.

## Stage 5 — Build, integrate and report

1. After all accepted source stages, run `npm run core:build:wasm`. This is the shared Product build and regenerates its runtime versions/embedded assets. Building only a standalone effect binary does not update the app's shared Product engine.
2. Run `npm run core:test` against the rebuilt source and shared WASM.
3. Run the focused granular tests added for this work.
4. Run `npm run core:product:granular-artifacts` and `npm run core:product:reverb-tail-quality`.
5. Run `npm run core:product:fx`, `npm run core:product:fx-depth`, `npm run core:product:realtime-safety`, and `npm run core:product:wasm`.
6. Rebuild standalone granular/spectral artifacts if they are part of the currently maintained delivery path, using their existing `build.sh` scripts; keep the source/shared-Product build authoritative. Do not hand-copy mismatched binaries or version strings.
7. Run `git diff --check`, inspect the final diff, and verify no unrelated preset/UI/routing changes or production debug exports were introduced.
8. Run the matched final CPU comparison alone. Once appropriate checks pass, do not repeat broad checks without a new change or unresolved concern.

The existing granular render gate's "Dense grains + transitions" case mixes Clean and Granular voices and uses short transitions. It is useful integration coverage, but it is not a substitute for the dedicated four-Granular-voice Saw/Tide/Bloom benchmarks above. Likewise, the module CPU report's spectral-freeze row is derived from a page scenario and can contain zero/missing telemetry; use the dedicated captured-engine timings.

For sonic review, produce matched baseline/candidate renders for a dense Saw cloud, a Tide cloud, stationary and moving freeze, and Bloom feeding a long reverb wash. Use the same input and gain. Include capture/release and endpoint transitions, and let exposed tails run for at least 30 seconds. If listening is unavailable, deliver the renders and numerical checks and state that listening is unverified; do not claim indistinguishability from finite-output checks alone.

## Acceptance and stop rules

- Evaluate each change separately. Keep only candidates with a repeatable benefit in their intended case, no meaningful regression in control cases, and passing audio/state checks.
- Use these reporting labels for measured **engine render time**: <5% reduction = minor; 5–10% = modest; >=10% = noticeable. These are project reporting conventions, not perceptual thresholds. If trial variation overlaps the difference, report "unresolved/no reliable gain" instead.
- Report absolute microseconds as well as percentages. Do not present an engine-only improvement as the same percentage of app CPU or battery life.
- If an exact-output stage differs, fix it or leave that stage out. Do not compensate with gain changes or weaker assertions.
- If a small candidate fails to improve CPU, remove that candidate and its unused support code. Do not escalate to a SIMD rewrite, different FFT, resampling, fewer grains or new quality settings within this task.
- Treat the approximate curve stage separately from exact bookkeeping/skip stages. Aggregate final differences must not obscure which stage changed the sound numerically.
- Final report: files/stages changed; per-scenario before/after median and p95/p99; measured gain label; exact/approximate audio results; checks run; omitted candidates and the measured reason; native/mobile/listening limitations.

## Completion checklist

- [x] Baseline reflects the starting source, with reproducible nonzero input and captured freeze state.
- [x] Saw tables retain the exact near-zero fractional-power tail.
- [x] Tide retains its original motion, depth formula and random sequence.
- [x] Spectral bookkeeping reuse has explicit invalidation and exact paired-engine coverage.
- [x] Spectral phase, synthesis, magnitude smoothing and normalization smoothing still run every required hop.
- [x] Clean lookback is a block-local hoist, without a new cache system.
- [x] Waiting Bloom ghosts retain all timing, position, glide, count and removal behavior.
- [x] Reverb density, grain overlap and freeze overlap are unchanged.
- [x] Each retained candidate has a measured benefit; no unsupported whole-app percentage is claimed.
- [x] Shared and standalone runtime artifacts are rebuilt; the browser build, focused DSP checks and FX/depth gate pass. Additional targeted checks are listed in the results report.
- [x] Source changes, generated artifacts, measurements and audio-review status are reported clearly.
- [ ] Full core test suite, broad architecture suite, and human listening/mobile CPU review remain unverified.
