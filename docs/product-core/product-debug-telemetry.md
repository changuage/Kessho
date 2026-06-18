# Product-Core Debug Telemetry

Product-core exposes production debug data through `ProductEngineProxy` telemetry. The reference runtime is not required for the Earth/info page, random-walk inspection, or sample-and-hold trigger inspection.

## Earth Texture Slots

Telemetry carries one compact row for each Earth texture slot: `waves`, `birds`, `birds2`, and `frogs`.

Each row includes asset id, filename label, active state, inactive reason, active and playing slice counts, last slice id, last offset, last start time, slice duration, output duration, detune cents, speed multiplier, total playback rate, density, fade time, seed, parity fixture state, texture param availability, texture-slice usage, asset-too-short state, asset duration, and max offset.

Texture params are optional. Missing params are exposed through `textureParamsAvailable = false`, but texture-capable assets still use default texture-slice scheduling unless the parity fixture is enabled.

Inactive reasons are normalized to readable strings:

| Code | Reason |
|---:|---|
| 1 | texture params missing (legacy/raw diagnostic; not a normal inactive reason) |
| 2 | parity fixture enabled |
| 3 | asset not registered |
| 4 | asset not found |
| 5 | asset too short for offset variation |
| 6 | source disabled |
| 7 | slot muted |
| 8 | density zero |
| 9 | voice budget exceeded |

## Modulation Ranges

Telemetry also carries active modulation range rows for random-walk and sample-and-hold controls. The host enriches rows with UI control names and mapped normalized positions when the range bridge knows the control id.

Random-walk rows include control name/id, target id, param id, min, max, current value, normalized position, speed, local/global mode, update counter, and seed.

Sample-and-hold rows include control name/id, target id, param id, min, max, current value, normalized position, trigger bus, trigger counter, last trigger frame, last trigger source, and seed.

The data is copied from product-core telemetry and does not use `web-ts` or a reference runtime fallback.

## Granular And Reverb Stability

Granular runtime inspection is split between product telemetry and offline gates. Telemetry exposes `activeGrains`, `granularWriteHeadPosition`, and per-voice granular positions for UI/debug surfaces. `core:product:granular-artifacts` verifies the production C++ path keeps granular send/return controls smoothed, clamps granular voice attack/release/buffer/density ranges, guards lowpass output against non-finite values, covers freeze/buffer/feedback graph cases, and keeps CPU scenarios for the granular-heavy page path.

Reverb runtime inspection is covered by product graph taps, WASM module probes, and CPU scenario gates. `core:product:reverb-tail-quality` verifies the product reverb path keeps quality/type/decay/size/damping/modulation/shimmer/reverse parameters clamped, runs preconditioner soft limiting, supports spectral-freeze crossfade routing, and keeps page CPU coverage for long-tail reverb scenes.
