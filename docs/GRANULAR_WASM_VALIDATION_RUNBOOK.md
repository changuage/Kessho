# Granular WASM Validation Runbook (Phase 6.3 / 6.4 / 6.5)

## Goal
Provide a repeatable process to validate Granular WASM behavior and CPU improvements across desktop and mobile browsers, including A/B comparison against JS fallback.

## Scope
- Functional parity: JS granular vs WASM granular
- Performance comparison: CPU% overlay during identical scenarios
- Browser matrix: Chrome, Firefox, Safari, Edge
- Mobile matrix: iOS Safari, Android Chrome

## Prerequisites
- App running locally (example: `npm run dev`)
- SIMD-enabled binary present:
  - `wasm/granular-fx/kessho_granular.wasm`
  - `public/worklets/kessho_granular.wasm`
- DevTools console access
- CPU overlay enabled in app

## Quick A/B controls
Use these in DevTools console:

- Current engine:
  - `__engine.getLooperEngineType()`
- Toggle engine:
  - `await __engine.toggleLooperEngine()`
- Verify expected transition:
  - `WASM -> JS` or `JS -> WASM` shown in console log

## Test scenario (use exactly this for all platforms)
1. Start transport and load a preset with 4 active granular voices.
2. Set granular density high enough to represent a stress case (same preset each run).
3. Keep reverb on with normal production level.
4. Let audio run for 20s before reading CPU values.
5. Record average granular CPU% over ~15s in overlay.
6. Run once in foreground tab and once backgrounded for ~30s, then return and record.
7. Repeat in both engines:
   - First pass: `WASM`
   - Second pass: `JS` (toggle)

## Functional parity checks (per platform)
Run these checks in both engine modes and mark pass/fail:

- Granular texture matches character of JS baseline
- Freeze/unfreeze has no click bursts
- Reverse grains audible and stable
- Feedback 0% has no recirculation
- Feedback ~35% recirculates without runaway
- Preset morph updates parameters without pops
- Engine restart still initializes granular correctly

## Measurement table template
Copy this table into your test notes and fill values:

| Platform | Browser | Engine | Foreground CPU% | Background CPU% | Freeze/Reverse/Feedback | Pops/Dropouts | Notes |
|---|---|---|---:|---:|---|---|---|
| Desktop | Chrome | WASM |  |  |  |  |  |
| Desktop | Chrome | JS |  |  |  |  |  |
| Desktop | Firefox | WASM |  |  |  |  |  |
| Desktop | Firefox | JS |  |  |  |  |  |
| Desktop | Safari | WASM |  |  |  |  |  |
| Desktop | Safari | JS |  |  |  |  |  |
| Desktop | Edge | WASM |  |  |  |  |  |
| Desktop | Edge | JS |  |  |  |  |  |
| Mobile | iOS Safari | WASM |  |  |  |  |  |
| Mobile | iOS Safari | JS |  |  |  |  |  |
| Mobile | Android Chrome | WASM |  |  |  |  |  |
| Mobile | Android Chrome | JS |  |  |  |  |  |

## Pass criteria
- Functional parity: all parity checks pass in WASM mode
- Stability: no repeatable pops/dropouts in normal operation
- Performance: WASM CPU% lower than JS CPU% in foreground and background runs

## Phase 6 completion mapping
- 6.3 complete when Chrome + Firefox + Safari desktop checks are filled and pass
- 6.4 complete when iOS Safari + Android Chrome checks are filled and pass
- 6.5 complete when final measured CPU numbers are copied into `WASM_GRANULAR_EXPLORATION.md`

## Reporting format (paste in PR or audit note)
- Environment: OS/device/browser versions
- Scenario preset used
- CPU results summary: WASM vs JS (fg/bg)
- Functional parity summary
- Any regressions and repro steps
