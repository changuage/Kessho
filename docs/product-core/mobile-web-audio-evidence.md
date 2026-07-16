# Mobile Web Audio Evidence Capture

This ledger describes how to collect the physical-device evidence required by
phase 0 and phase 9 of the shared CPU/mobile background implementation plan.
Simulator, desktop emulation, and static source checks are not physical-device
evidence.

## Capture workflow

1. Use a release build from a recorded commit on the physical phone.
2. Start the requested preset and output route while the page is visible.
3. Record telemetry counters without retaining decoded channel arrays.
4. For a visible scenario, run for at least 15 minutes and set
   `lockedMinutes` to `0`.
5. For `screen-lock`, run locked for at least 60 minutes.
6. For `app-switch`, keep the browser/app backgrounded for at least 60 minutes
   and set `appSwitchedMinutes` to `60` or more.
7. Save the capture as JSON, validate it with `--dry-run`, then record it:

```bash
npm run core:product:mobile-web-evidence:record -- \
  --input=/absolute/path/to/capture.json \
  --dry-run

npm run core:product:mobile-web-evidence:record -- \
  --input=/absolute/path/to/capture.json
```

The recorder derives a distinct filename from device, browser, scenario, and
output route, so one scenario cannot silently overwrite another.

## Capture schema

```json
{
  "schema": "kessho-mobile-web-audio-evidence-v1",
  "device": {
    "model": "iPhone 11",
    "os": "18.5",
    "browser": "safari"
  },
  "scenario": {
    "kind": "screen-lock",
    "presetId": "default",
    "output": "speaker",
    "durationMinutes": 60,
    "lockedMinutes": 60,
    "appSwitchedMinutes": 0
  },
  "before": {
    "renderCpuMean": 0,
    "renderCpuPeak": 0,
    "renderP95Ms": 0,
    "renderP99Ms": 0,
    "missedQuantumCount": 0,
    "assetMissingCount": 0,
    "wasmHeapBytes": 0,
    "decodedAssetBytes": 0,
    "assetAllocationBytes": 0,
    "hostDecodedBytes": 0,
    "inFlightDecodedBytes": 0,
    "audibleGapCount": 0
  }
}
```

Phase 9 captures additionally require an `after` metric snapshot and an
`acceptance` object. A locked-run example is:

```json
{
  "after": {
    "renderCpuMean": 0,
    "renderCpuPeak": 0,
    "renderP95Ms": 0,
    "renderP99Ms": 0,
    "missedQuantumCount": 0,
    "assetMissingCount": 0,
    "wasmHeapBytes": 0,
    "decodedAssetBytes": 0,
    "assetAllocationBytes": 0,
    "hostDecodedBytes": 0,
    "inFlightDecodedBytes": 0,
    "audibleGapCount": 0
  },
  "acceptance": {
    "processTerminated": false,
    "maxDecodedAssetBytes": 0,
    "maxHostDecodedBytes": 0,
    "deferredReleaseDecodedAssetBytes": 0,
    "warmedHeapFirstCycleBytes": 0,
    "warmedHeapSecondCycleBytes": 0,
    "assetAllocationFirstCycleBytes": 0,
    "assetAllocationSecondCycleBytes": 0,
    "thermalState": "nominal",
    "sustainedThermalDropouts": false,
    "hidden": {
      "maxAudibleGapMs": 0,
      "repeatedGapPattern": false,
      "hiddenUiCallbackCount": 0,
      "foregroundRefreshCount": 1,
      "staleForegroundEventCount": 0,
      "outputCorrelation": 1,
      "loudnessDeltaDb": 0,
      "interruptionTested": true,
      "interruptionRecoveryPass": true,
      "lockScreenControlsPass": true
    }
  }
}
```

Allowed scenario kinds are `default-visible`, `highest-cpu-visible`,
`highest-memory-visible`, `representative-preset-cycles`, `app-switch`, and
`screen-lock`.
Allowed browser labels are `safari`, `chrome`, and `home-screen`; output labels
are `speaker`, `wired`, and `bluetooth`.

## Gates

Validate any captures currently present:

```bash
npm run core:product:mobile-web-evidence
```

Require the complete phase-0 matrix for an iPhone 11 and one newer iPhone:

```bash
npm run core:product:mobile-web-evidence:strict
```

The strict gate requires four visible scenarios and every browser/output
combination of the 60-minute screen-lock scenario on both phones. It must remain
failing until those physical runs have actually been recorded.

Require the complete Phase 9 acceptance matrix and every hard gate:

```bash
npm run core:product:mobile-web-evidence:acceptance
```

For both iPhone 11 and one current iPhone, Phase 9 requires a 60-minute visible
run and a 60-minute app-switch run in Safari, Chrome, and Home Screen, plus
60-minute screen-lock runs on speaker and Bluetooth for each surface. At least
one successful interruption recovery is required per phone, and iPhone 11 must
include a 60-minute highest-CPU thermal run. The validator also enforces the
memory ceilings, warmed-cycle stability, no hidden counter increases, no gap
over 20 ms, zero hidden UI callbacks, exactly one foreground refresh, no stale
foreground events, correlation at least 0.9999, loudness delta below 0.1 dB,
lock-screen controls, and absence of sustained thermal dropouts.
