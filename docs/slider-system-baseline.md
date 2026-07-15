# Slider-system baseline

Recorded before Phase 1 on 2026-07-14.

- `npm run test:visualizer-frame-scheduler`: pass.
- `npm run type-check`: pass.
- `git diff --check`: pass.
- Slider value callbacks: continuous pointer drags called the application callback once per pointer event.
- Range callbacks: continuous range drags called the application callback once per pointer event, plus a deduplicated pointer-up attempt.
- Product range events: a range-set refresh reposted every active target.
- Runtime-store listener notifications: each store update notified every global subscriber, regardless of key.
- Visualizer root commits: modulation-indicator telemetry used root state and could commit at the 250 ms desktop interval.
- Visualizer indicator-row commits: indicators were rendered by the root; no isolated row counter existed.

Development-only counters are introduced with the slider-system work so these source-derived baseline behaviors can be replaced by measured callback, event, notification, and commit counts without production overhead.

## Pre-existing repository-wide gate fixture failures

- `npm run test:background-runtime-slider-modulation` initially expected a removed `productTelemetryCallback` field even though callback demand is now owned by `CoreProductTelemetryCallbackScheduler`; the static assertion was updated to the current ownership boundary.
- `npm run core:product:sample-hold-parity` initially configured drum voice 0 but triggered MIDI 36, which maps to the kick voice; the fixture now derives its target from the canonical drum map.
