# KesshoCore Golden Candidate Profile

Generated: 2026-05-06T11:08:45.306Z

Scope: offline C11 starting profile for the current core WASM preview path. This is not a replacement for browser/macOS/iOS device captures.

Render contract: 48000 Hz, 128-frame blocks, 30 seconds, deterministic empty automation and MIDI event streams.

| Scenario | Candidate | WASM RMS | WASM Peak | Centroid Hz | WASM CPU Avg | Native CPU Avg | Native/WASM RMS / Peak | Dry Null RMS / Peak |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low-cpu-ambient-pad | Ethereal Ambient | 0.06520 | 0.26261 | 270.1 | 1.72% | 1.29% | 7.066e-7 / 3.338e-6 | 0.000 / 0.000 |
| dense-pad-reverb | Dark Textures | 0.05660 | 0.24098 | 267.3 | 1.71% | 1.26% | 2.994e-6 / 1.313e-5 | 0.000 / 0.000 |
| granular-heavy-preview | Wave Out | 0.00889 | 0.03405 | 249.1 | 1.85% | 1.37% | 9.390e-8 / 4.414e-7 | 0.000 / 0.000 |
| journey-morph | Journey Midpoint: Ethereal Ambient to Dark Textures | 0.06600 | 0.28983 | 270.0 | 1.85% | 1.29% | 9.722e-6 / 4.004e-5 | 0.000 / 0.000 |

## Coverage Notes

- Renders the current web-core preview shape: instance-owned pad source module plus optional dry dynamics-character module.
- Compiles and runs a native C++ fixture for the same pad params and chord schedule, then compares native/WASM residuals.
- Computes RMS, peak, LUFS-like level, DC offset, spectral-centroid estimate, CPU, render misses, RSS delta, memory, dry-module null residual, and native/WASM residual.
- Missing by design: legacy Web Audio old-path render comparison, live browser AudioWorklet CPU, macOS/iOS device CPU, MIDI jitter, and screen-off battery. Those remain required before C11 can pass.
