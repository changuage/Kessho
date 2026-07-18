# Mobile Web Audio Evidence Capture

This ledger describes how to collect the physical-device evidence required by
phase 0 and phase 9 of the shared CPU/mobile background implementation plan.
Simulator, desktop emulation, and static source checks are not physical-device
evidence.

## Capture workflow

1. Use a release build from a recorded commit on the physical phone.
2. Start the requested preset and output route while the page is visible.
3. Record telemetry counters without retaining decoded channel arrays.
4. Use the compact phase 9 duration for the requested row: 10 or 15 minutes.
5. Record the actual locked and app-switched portions separately. The iPhone 11
   Safari and Chrome rows include both lifecycle transitions in one run.
6. Capture the Product Core sample frame and deterministic trace before hiding
   and after foreground restoration.
7. Save the capture as JSON, validate it with `--dry-run`, then record it:

```bash
npm run core:product:mobile-web-evidence:record -- \
  --input=/absolute/path/to/capture.json \
  --dry-run

npm run core:product:mobile-web-evidence:record -- \
  --input=/absolute/path/to/capture.json
```

The recorder derives a distinct filename from device, browser, scenario, output
route, milestone, and feature bundles. Evidence files are immutable: recording
fails if the destination already exists.

### Runtime collector

Open the release build with `?mobileEvidence=1`, start Product playback, and use
the remote Web Inspector console. Start one base capture while visible:

```js
await window.__kesshoMobileWebEvidence.start({
  device: { model: 'iPhone 11', os: '18.5', browser: 'safari' },
  scenario: {
    kind: 'screen-lock',
    presetId: 'default',
    output: 'speaker',
    durationMinutes: 15,
    lockedMinutes: 10,
    appSwitchedMinutes: 2,
    bundles: ['base-autonomy'],
  },
  initialAudibleGapCount: 0,
});
```

Use one continuous hidden interval. For the combined Safari/Chrome run, switch
away and lock the phone without foregrounding between those actions. After the
final foreground restoration, finish with measurements from the uninterrupted
control recording, route/interruption observation, and device thermal log:

```js
const evidence = await window.__kesshoMobileWebEvidence.finish({
  expectedTraceHash: 'control-endpoint-fingerprint',
  afterAudibleGapCount: 0,
  processTerminated: false,
  warmedHeapFirstCycleBytes: 0,
  warmedHeapSecondCycleBytes: 0,
  assetAllocationFirstCycleBytes: 0,
  assetAllocationSecondCycleBytes: 0,
  thermalState: 'nominal',
  sustainedThermalDropouts: false,
  maxAudibleGapMs: 0,
  repeatedGapPattern: false,
  outputCorrelation: 1,
  loudnessDeltaDb: 0,
  interruptionTested: false,
  interruptionRecoveryPass: false,
  lockScreenControlsPass: true,
});
window.__kesshoMobileWebEvidence.downloadLast();
```

Do not enter placeholder zeros. The runtime collector supplies Product Core
frames, CPU, memory, asset, autonomy, hidden-callback, reconciliation, and
Auto-Stop fields. The finish object deliberately requires measurements that
cannot be proven inside the suspended browser process: audible output, control
correlation, interruption behavior, warmed-cycle comparisons, process survival,
and thermal behavior. The collector buffers no PCM and performs no hidden
polling. It currently emits base-milestone evidence only; advanced capture stays
disabled until 8L is complete.

## Capture schema

```json
{
  "schema": "kessho-mobile-web-audio-evidence-v2",
  "device": {
    "model": "iPhone 11",
    "os": "18.5",
    "browser": "safari"
  },
  "scenario": {
    "kind": "screen-lock",
    "presetId": "default",
    "output": "speaker",
    "durationMinutes": 15,
    "lockedMinutes": 5,
    "appSwitchedMinutes": 2,
    "bundles": ["base-autonomy"]
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
    "milestone": "base",
    "runtimeClassification": "pass",
    "runtime": {
      "sampleRate": 48000,
      "sampleFrameBefore": 1000,
      "sampleFrameAfter": 14401000,
      "autonomyRevisionBefore": 10,
      "autonomyRevisionAfter": 20,
      "expectedHiddenFrames": 14400000,
      "observedHiddenFrames": 14400000,
      "sonicStateAdvanced": true,
      "expectedTraceHash": "uninterrupted-trace-hash",
      "observedTraceHash": "uninterrupted-trace-hash"
    },
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

Allowed bundles are `base-autonomy`, `base-max-cpu`, `advanced-parity`,
`current-smoke`, and `auto-stop`. An Auto-Stop capture also records
`autoStopTargetFrame`, `autoStopObservedFrame`, and
`autoStopFiredWhileHidden` in `acceptance.runtime`. Its target must fall inside
an observed locked interval of at least three minutes.
An `advanced-parity` capture additionally records Journey readiness, prepared
duration, schedule entry count, decoded asset bytes, and executed transition
count. The validator requires at least 7,200 prepared seconds, at most 512
entries, and at most 160 MiB of Journey assets.

`runtimeClassification` is `pass`, `browser-policy-suspension`, or
`engine-failure`. Safari and Chrome may use `browser-policy-suspension` only
when observed hidden render-frame coverage is at most 10% of the expected
frames. A pass requires at least 95% coverage. If render coverage passes but
sonic state or the trace did not advance, the result is an engine failure. Home
Screen runs cannot pass as a browser-policy suspension.

`acceptance.milestone` is `base` or `advanced`. Every capture supplied to a
strict matrix must state the requested milestone. Base acceptance covers
8E-8H and does not claim hidden-host guarantees for routing mute groups,
Auto-Cycle, or Journey. Advanced acceptance adds the `advanced-parity` bundle
and is available only after 8L.

Use `sonicAutonomyRevision` and `sonicAutonomyFingerprint` from the enriched
Product telemetry for the revision and trace fields. The fingerprint hashes
Product Core RNG and completed autonomy state only; it excludes wall time and
phase deadlines. Capture the expected hash from the uninterrupted control run
at the same prepared endpoint. The revision is a host-lifetime observation
counter that advances whenever this fingerprint changes; it is not derived
from native counters that can reset during Auto-Stop or sequencer rejoin.
`observedHiddenFrames` must exactly equal `sampleFrameAfter -
sampleFrameBefore`; this prevents a browser-policy classification from being
entered independently of the Product Core render clock. For ordinary runs,
`expectedHiddenFrames` must agree within five percent with the declared hidden
minutes and recorded sample rate. For Auto-Stop it ends at the configured
two-minute Product Core target while the physical lock interval remains at least
three minutes.

## Gates

Validate any captures currently present:

```bash
npm run core:product:mobile-web-evidence
```

Require the complete phase-0 matrix for an iPhone 11 and one newer iPhone:

```bash
npm run core:product:mobile-web-evidence:strict
```

The strict baseline gate retains the phase-0 baseline matrix. It is separate
from the compact phase-9 acceptance gate.

Require the complete base Phase 9 acceptance matrix and every hard gate:

```bash
npm run core:product:mobile-web-evidence:acceptance:base
```

After 8L is complete, require the advanced matrix with:

```bash
npm run core:product:mobile-web-evidence:acceptance:advanced
```

The compact matrix requires iPhone 11 Safari for 15 minutes, iPhone 11 Chrome
for 10 minutes, iPhone 11 Home Screen for 15 minutes, a 15-minute Bluetooth
repeat of the Home Screen run with interruption recovery, and
10-minute Safari and Home Screen runs on one current iPhone. Bundles may share a
run. The validator enforces the memory ceilings, warmed-cycle stability, hidden
counter behavior, UI suppression, foreground reconciliation, deterministic
trace parity, lock-screen controls, Auto-Stop frame accuracy, and thermal
dropout limits.
