# KesshoCore Golden Candidate Profile

Generated: 2026-05-07T17:03:53.491Z

Scope: offline C11 starting profile for the current core WASM preview path. This is not a replacement for browser/macOS/iOS device captures.

Render contract: 48000 Hz, 128-frame blocks, 30 seconds, deterministic empty automation and MIDI event streams.

| Scenario | Candidate | WASM RMS | WASM Peak | Centroid Hz | WASM CPU Avg | Native CPU Avg | Native/WASM RMS / Peak | Dry Null RMS / Peak |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low-cpu-ambient-pad | Ethereal Ambient | 0.50486 | 1.85845 | 329.8 | 1.23% | 0.83% | 4.980e-6 / 3.618e-5 | 0.000 / 0.000 |
| dense-pad-reverb | Dark Textures | 0.43584 | 1.48954 | 421.2 | 1.23% | 0.81% | 2.403e-5 / 1.878e-4 | 0.000 / 0.000 |
| journey-morph | Journey Midpoint: Ethereal Ambient to Dark Textures | 0.49898 | 1.76164 | 374.4 | 1.21% | 0.81% | 7.256e-5 / 4.404e-4 | 0.000 / 0.000 |

## Coverage Notes

- Renders the current web-core preview shape: instance-owned pad source module plus optional dry dynamics-character module.
- Compiles and runs a native C++ fixture for the same pad params and chord schedule, then compares native/WASM residuals.
- Keeps this golden profile to pad-active presets; lead, granular, soundscape, and full-mix route coverage lives in the browser/core acceptance corpus.
- Computes RMS, peak, LUFS-like level, DC offset, spectral-centroid estimate, CPU, render misses, RSS delta, memory, dry-module null residual, and native/WASM residual.
- Missing by design: legacy Web Audio old-path render comparison, live browser AudioWorklet CPU, macOS/iOS device CPU, MIDI jitter, and screen-off battery. Those remain required before C11 can pass.
