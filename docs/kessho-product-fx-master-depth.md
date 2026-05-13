# Kessho Product FX/dynamics/master depth

This gate keeps the Product Core FX/master path from regressing into host-owned behavior while the broader parity migration continues.

## Covered

- Dynamics modulation matrix: every generated modulation-matrix param ID is mapped to its C++ Product Core matrix cell and committed through the FX subsystem.
- Sidechain: drum-key ducking is exercised directly, including target mapping, immediate gain reduction, and release back to unity.
- Master gain staging: Product Core master gain scales dry output before limiter clamping.
- limiter/saturation/loudness telemetry: C++, WASM, TypeScript, and native bridge telemetry expose master input peak, output peak, output RMS, true peak, true-peak dBTP, integrated LUFS, limiter gain reduction, master saturation drive, and dynamics saturation drive.
- Per-FX reset/tail/bypass tests: Product reset clears Delay/Reverb wet tails, and disabled FX preserve dry signal while keeping the FX stem silent.
- disabled-FX CPU: Product CPU smoke now separately measures a disabled-FX render budget and an active-FX stress budget.

## Residual Notes

- Per-FX reset is covered through Product Core reset; individual effect-only reset events still need generated public event coverage if the UI requires them.
- disabled-FX CPU is a native smoke budget, not a full p95/p99 browser/native device performance matrix.
- Master-chain polish beyond limiter and saturation can continue after Product Default Gate v3, but the required master gain staging, limiter/saturation/loudness telemetry, reset/tail/bypass, and disabled-FX CPU gates are covered here.
