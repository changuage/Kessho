# Ambient effects CPU optimization results — 2026-10-08

Implemented the bounded granular and spectral changes. Reverb DSP, grain density/caps/overlap, FFT size/hop/overlap, phase motion and all audio smoothing remain unchanged. The largest measured savings are in Saw/Tide clouds, Clean scans with write-follow, and stationary Stretch. Solid is a modest gain; Bloom is minor.

## Changes retained

- Granular: 1024-segment interpolated Saw decay and Tide sine tables, initialized once per instance (12,300 bytes). Saw Up keeps its original power calculation for the steep final four segments. Attack curves and random draws are unchanged.
- Spectral: reuse unchanged held magnitude capture and normalization targets with explicit lifecycle, mode, live-update and endpoint invalidation. Gain and magnitude smoothing continue on every hop. Test controls/counters compile only under the existing test macro; no C/WASM ABI or UI changes.
- Clean: calculate eligible scan lookback once per block.
- Bloom: skip buffer reads and zero accumulation only for waiting ghosts with exactly zero envelope state. Preserve read position, glide, age, active counts and removal.
- Rebuilt the shared Product WASM, runtime cache version, embedded Point Clouds assets and the standalone granular/freeze WASM files.

## Matched render timings

Local Node v24.14.1 WebAssembly on macOS 15.7.4, arm64. Same compiler/build flags and original source baseline; revision before edits: `a9a860c77f89e9e5789abf576a7b6f5d16882f19`. Production WASM uses the existing optimized SIMD build. This is effect-module rendering, **not whole-app CPU, battery, native CPU or mobile performance**.

48 kHz, stereo, 128 frames/block, five paired trials with alternating order; 4096 warmup and 4096 measured blocks per trial (10.92 seconds each). Input preparation, comparisons and parameter changes are outside the timed section. Average is the median trial average; p95/p99 are the medians of each trial's block percentile. Outliers remain in the raw data. Timing ran without other builds or checks in this task.

All time columns below are microseconds/block. Labels: <5% minor, 5–10% modest, ≥10% noticeable. Control-case differences within run variation are not claimed as improvements.

| Scenario | Average before → after | Reduction | p95 before → after | p99 before → after | Assessment |
| --- | ---: | ---: | ---: | ---: | --- |
| triangle | 74.17 → 74.59 | -0.57% | 79.25 → 80.04 | 84.92 → 85.17 | No reliable gain |
| saw-up | 95.75 → 79.51 | +16.96% | 102.46 → 84.17 | 109.83 → 89.83 | Noticeable |
| saw-down | 95.63 → 79.26 | +17.12% | 102.21 → 84.58 | 107.13 → 90.04 | Noticeable |
| tide | 103.41 → 86.61 | +16.25% | 109.79 → 92.08 | 117.00 → 97.87 | Noticeable |
| clean-follow | 23.94 → 20.55 | +14.14% | 25.13 → 21.75 | 29.25 → 25.21 | Noticeable |
| clean-no-follow | 20.69 → 20.97 | -1.36% | 21.54 → 22.21 | 25.96 → 26.25 | No reliable gain |
| bloom | 86.03 → 85.19 | +0.98% | 91.58 → 91.75 | 97.00 → 97.92 | Minor |
| bloom-hq | 122.22 → 117.99 | +3.46% | 130.00 → 127.29 | 136.75 → 133.79 | Minor |
| solid | 19.29 → 18.10 | +6.17% | 149.71 → 140.42 | 155.71 → 146.75 | Modest |
| held-stretch | 20.73 → 18.23 | +12.04% | 161.00 → 141.08 | 167.54 → 148.12 | Noticeable |
| moving-stretch | 58.74 → 59.08 | -0.58% | 464.04 → 467.83 | 480.37 → 483.04 | No reliable gain |
| living-stretch | 68.24 → 67.59 | +0.96% | 540.04 → 535.46 | 557.92 → 549.83 | No reliable gain |
| slushy | 57.40 → 57.58 | -0.31% | 455.50 → 457.21 | 468.17 → 470.92 | No reliable gain |

A longer seven-pair repeat (8192 measured blocks each) checked small gains and controls:

| Scenario | Average before → after, µs | Reduction |
| --- | ---: | ---: |
| triangle | 76.54 → 75.77 | +1.00% |
| clean-no-follow | 21.27 → 21.10 | +0.78% |
| bloom | 86.21 → 85.24 | +1.13% |
| bloom-hq | 123.13 → 117.96 | +4.19% |

Bloom HQ is a repeatable minor gain, approximately 3.5–4.2%. Balanced Bloom is approximately 1%, close to ordinary timing variation; keep expectations small. Triangle and Clean without write-follow changed sign between runs, with no consistent slowdown. Moving Stretch, Living Stretch and Slushy show no reliable benefit, as expected: their changing magnitudes still require the original work.

## Numerical and state checks

- Focused native tests pass with AddressSanitizer and UndefinedBehaviorSanitizer. Curve sweep: 200,001 positions plus knots/adjacent values. Maximum helper errors: Saw Up `4.14047e-5` (limit `5e-5`); Saw Down `7.51951e-6` (limit `1e-5`); Tide `4.76837e-6` (limit `1e-5`). Endpoints and monotonic power decay pass.
- Waiting Bloom tests compare the optimized path with the original unskipped path using identical tables, through all envelope shapes, three quality settings, one/two waiting grains and a full pool, nonzero envelope guard, reverse/glide, onset and removal. Output and the checked evolving grain state are exactly equal.
- Spectral paired native tests at 44.1/48 kHz compare new bookkeeping enabled/disabled with the existing FFT analysis cache enabled in both. Capture/release/recapture/reset, mode and refresh changes, zero-speed position movement, sustain/tone/width/diffusion and ping-pong endpoints are exactly equal. Settled Stretch stops repeating memory capture/normalization; settled Solid stops repeating normalization. Phase/synthesis/smoothing continue.
- Shared WASM: all exact benchmark cases match every measured sample; approximate Saw/Tide cases pass maximum sample error `1e-4` and relative RMS error `1e-3`. The measured no-feedback errors are at most 7.08e-08 absolute, with relative RMS at most 1.33e-06.
- Each captured freeze workload also survives silent input beyond live-input/STFT latency, with finite nonzero held output. This verifies the benchmark is processing a captured freeze.
- Clean transitions in rebuilt baseline/current WASM are exactly equal at 44.1/48 kHz, write-follow 0/1, lookback extremes, buffer resize, reverse scan and active LFO.

## Long ambient wash renders

Six matched 42-second stereo renders: pad plus sparse plucks for 12 seconds, then 30 seconds of exposed reverb tail. Granular uses feedback 0.3, blur 0.45 and bus diffusion 0.5. Reverb uses its unchanged large Hall with decay 0.96, size 4, diffusion 0.9 and modulation. Granular freeze/unfreeze and spectral capture, position/stop, recapture and release are exercised before the tail.

Compare float samples before WAV export. Relative RMS error is error RMS divided by baseline RMS. Level ratio compares total RMS; slope ratio compares RMS sample-to-sample change (a coarse smoothness/brightness check, **not a spectral analysis or listening test**). Tail comparison is the largest relative one-second RMS difference across the final 30 seconds, with a `1e-8` floor. Require finite nonzero unclipped output, relative RMS/max-error limits above, and level/slope/tail differences ≤0.1%.

| Render | Relative RMS error | Max sample difference | Level ratio | Slope ratio | Max tail RMS relative difference |
| --- | ---: | ---: | ---: | ---: | ---: |
| saw-up | 1.19e-06 | 1.19e-09 | 0.999999881 | 0.999999893 | 2.99e-07 |
| saw-down | 6.47e-07 | 6.69e-10 | 1.000000106 | 1.000000100 | 2.39e-07 |
| tide | 7.81e-07 | 7.57e-10 | 0.999999969 | 0.999999952 | 1.02e-07 |
| held-freeze | 0 | 0 | 1.000000000 | 1.000000000 | 0 |
| moving-freeze | 0 | 0 | 1.000000000 | 1.000000000 | 0 |
| bloom | 0 | 0 | 1.000000000 | 1.000000000 | 0 |

All pass. Freeze and Bloom renders are numerically identical. Saw/Tide are bounded approximations; **listening is unverified**, so these checks do not prove perceptual indistinguishability. Files use identical gain and 16-bit PCM export, with no normalization. The WAV renders and raw trial JSON remain local build/report artifacts and are not included in the repository.

## Targeted validation and reproduction

Passed:

- `AMBIENT_CPU_SANITIZE=1 node scripts/test-ambient-fx-cpu.mjs` (only the two focused native tests; also available as `npm run test:ambient-fx-cpu`).
- Matched CPU matrix, small-gain repeat and captured-freeze silent-input checks.
- `node scripts/check-ambient-fx-audio.mjs <baseline.wasm>` (Clean transitions and long wash comparisons).
- Product granular artifact/render check, reverb tail-quality check, realtime-safety scan (275 functions), runtime asset freshness check, and `git diff --check`.
- Shared and standalone WASM builds and runtime/embedded asset generation.
- `npm run build` (Product and pad WASM, runtime asset freshness, TypeScript, and Vite production bundle).
- `npm run core:product:fx-depth` (routing checks and native Product CPU budget scenarios).

The focused DSP tests, production build and FX/depth gate passed. The FX/depth failure reported earlier did not reproduce. The full `core:test` suite, separate top-level FX gate, and architecture suite were not run in this validation pass. Focused paired-engine tests are standalone to keep coverage specific. Human listening and actual iPhone/Chrome performance remain unverified.

For another matched CPU run, use the retained original binary at `build/ambient-fx-cpu-20261008/baseline/kessho_core.wasm`:

```sh
node scripts/benchmark-ambient-fx-cpu.mjs build/ambient-fx-cpu-20261008/baseline/kessho_core.wasm
AMBIENT_CPU_CASE=triangle,clean-no-follow,bloom,bloom-hq AMBIENT_CPU_TRIALS=7 AMBIENT_CPU_BLOCKS=8192 node scripts/benchmark-ambient-fx-cpu.mjs build/ambient-fx-cpu-20261008/baseline/kessho_core.wasm
node scripts/check-ambient-fx-audio.mjs build/ambient-fx-cpu-20261008/baseline/kessho_core.wasm
```

[Raw timing JSON and renders are retained locally under ignored `docs/reports/` and `build/ambient-fx-cpu-20261008/` artifacts.] Baseline SHA-256: `bc6eae9e9c395b80b43a2ff361650ef7edaec0a69e22da5540f9df57a8b16ae8`. Candidate SHA-256: `ff8c24a2351ca511cdf2c8b7335369a8b990996fec732356ca64fca15ed20e3e`. Runtime version: `2ac839aa0b4841ea`.

Deferred as planned: reverb micro-optimizations, moving-Stretch unity normalization approximation, FFT/SIMD rewrites, and reductions in grain overlap or freeze overlap. The production build emitted existing Vite notices about classic script tags and a large application chunk; the build completed successfully.
