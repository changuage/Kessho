# Pad Synth DSP baseline report

Run timestamp: `2026-08-09T14:31:08Z`

Host: `Darwin 24.6.0`, arm64, Apple M4, 10 cores (`Mac16,12`)

Compiler: Apple clang 17.0.0 (`clang-1700.6.4.2`)

Node: v24.14.1

Native build: `clang++ -std=c++17 -O2 -Wall -Wextra -Werror`

Sample rate: 48,000 Hz

Block size: 128 frames (2.667 ms deadline)

Warmup/measurement: 32 warmup blocks, 256 measured blocks, fixed seed 7777

The temporary baseline fixture compiled the current working-tree Pad source and
the old source/header/common DSP captured with `git show HEAD:...` into an OS
temporary directory. The temporary files were removed after the run. Both
engines rendered the closest reproducible `CLEAN_BASIC` patch at 1, 8, and 16
voices. The old API cannot represent Harmonic/Complex tables, Position, PD,
unified Pitch, shared Drift, or Phase Reset; it retains the old A2/octave/detune
path. Therefore these numbers are a closest old-engine reference, not a sonic
equivalence claim.

| Engine | Voices | Mean ms | p50 ms | p95 ms | p99 ms | Max ms | p99/deadline | Max/deadline | Underruns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current | 1 | 0.00736 | 0.00737 | 0.00746 | 0.00754 | 0.00758 | 0.0028 | 0.0028 | 0 |
| Current | 8 | 0.05043 | 0.05004 | 0.05279 | 0.05704 | 0.05796 | 0.0214 | 0.0217 | 0 |
| Current | 16 | 0.10121 | 0.09963 | 0.10775 | 0.10958 | 0.11300 | 0.0411 | 0.0424 | 0 |
| git HEAD | 1 | 0.01078 | 0.01075 | 0.01087 | 0.01092 | 0.01100 | 0.0041 | 0.0041 | 0 |
| git HEAD | 8 | 0.05338 | 0.05583 | 0.06621 | 0.06642 | 0.06850 | 0.0249 | 0.0257 | 0 |
| git HEAD | 16 | 0.09780 | 0.09658 | 0.10908 | 0.11108 | 0.11125 | 0.0417 | 0.0417 | 0 |

Current CLEAN_BASIC p99 divided by git-HEAD p99 is `0.6905` (1 voice),
`0.8588` (8 voices), and `0.9865` (16 voices). Equivalently, git HEAD divided
by current is `1.4483`, `1.1644`, and `1.0137`.

The fixture is intentionally not retained as a CI benchmark: once git HEAD
contains the new C API, the old source snapshot and fixture contract would no
longer be stable. Re-run by recreating the temporary fixture from the exact
historical commit when a future comparison is needed.
