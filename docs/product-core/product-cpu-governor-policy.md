# Product-Core CPU Governor Policy

This policy keeps CPU decisions explicit while product-core remains the production runtime.

## Desktop governor

- Ultra quality is allowed when Product Core render telemetry and page CPU reports show clear headroom.
- Full visual telemetry is allowed while foreground page CPU reports stay under budget.
- Heavy granular, reverb, spectral-freeze, delay, dynamics, and Earth scenes must stay represented in `core:product:page-cpu-comparison`.

## Mobile browser governor

- Balanced is the default mobile browser profile.
- Lite under pressure is the downgrade target when render CPU, missed quantums, or browser process CPU rises.
- Shimmer, large reverb, spectral freeze, granular density, and high-rate visual telemetry are the first quality limiters.
- The app may lower visual telemetry rate before muting musical content.
- Browser/mobile background audio is best-effort; hidden, app-switch, and screen-lock behavior must not be presented as guaranteed.

## Native background governor

- Native background render uses a conservative profile until iOS/macOS device evidence proves otherwise.
- Native render callbacks must keep a stable render callback budget.
- Native realtime rendering must avoid realtime allocations, blocking I/O, and UI-thread dependency.

## Evidence

- `npm run core:product:cpu` publishes native C++ CPU and heap evidence.
- `npm run core:product:web-cpu-comparison` publishes comparable Product Core versus Web TS browser-process CPU evidence for the default arrangement.
- `npm run core:product:page-cpu-comparison` publishes page-scoped CPU evidence for source, Earth, granular, reverb, spectral-freeze, dynamics, and routing scenes.
- `npm run test:mobile-web-hotpaths` keeps mobile foreground hot-path regressions visible.
- `npm run core:product:cpu-scenarios` reconciles the latest reports with the production CPU scenario matrix.
