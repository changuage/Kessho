# Drum Engine Baseline

Captured before the drum engine/preset expansion work.

- `npm run core:product:ci`: failed at the existing product boundary check: `src/ui/useSelectedAudioEngineTransportDebug.ts: selected transport debug polling must preserve App-era reconciliation behavior`.
- `npm run core:product:cpu`: passed. Disabled FX: 5.8404% avg, 16.32% peak, p95 0.3016 ms, p99 0.3868 ms, missed 0. Active FX: 10.6473% avg, 21.63% peak, p95 0.4438 ms, p99 0.5326 ms, missed 0.
- `npm run core:product:browser-runtime`: passed, report written to `docs/reports/kessho-product-browser-runtime-latest.json`.

Notes:

- Existing CPU test block size: 128 samples.
- Existing CPU test sample rate: 48000 Hz.
- Uploaded runtime-ready drum bank contains 280 entries: 279 factory entries plus one user preset.
