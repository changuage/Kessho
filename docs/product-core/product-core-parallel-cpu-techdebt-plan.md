# Product-Core Parallel CPU and Tech-Debt Optimization Plan

## Purpose

This plan adds CPU and tech-debt optimization work that can run alongside the **Product-Core State Authority and Running Sequencer Correctness** work.

The state-authority work remains the top correctness priority. This document tells coding agents what can safely happen in parallel without destabilizing the core fix.

---

## Top-level goal

Make `product-core` production-self-sufficient and efficient without touching `web-ts`.

The main correctness invariant from the state-authority plan is still the highest priority:

```text
Every trigger must play from one resolved parameter state:
the same state represented by the visible sliders after preset, morph,
endpoint, drum morph, sub-sequencer, and override resolution.
```

This CPU/tech-debt plan must not weaken that invariant.

---

## Hard constraints

```text
1. Do not modify src/audio/reference/webTs/**.
2. Do not use web-ts as a production fallback.
3. web-ts may be read or run only for A/B comparison.
4. Do not change the state-authority commit model from a CPU/refactor batch.
5. Do not change sequencer, trigger, morph, preset, ratchet, or drum-morph semantics from a CPU/refactor batch unless the batch is explicitly part of the state-authority plan.
6. Do not tune DSP by ear in these batches.
7. Do not lower validation standards to make CPU numbers pass.
8. Do not raise line-count caps or weaken gates unless explicitly approved.
```

---

## Questions to answer before or during Batch 0

A coding agent should answer these in the ledger. If the user has not answered, use the default assumption.

| Question | Default assumption |
|---|---|
| Is the current release target web-default only, or native/iOS/macOS too? | Web-default plus native/background evidence preparation. |
| Can CPU reports be committed to the repo? | Yes, under `docs/reports/`, unless too large. |
| Are render-metric audio reports allowed in CI artifacts instead of repo commits? | Yes, if the repo has artifact upload. Otherwise commit compact JSON/MD summaries. |
| Should App.tsx extraction happen before the state-authority gate passes? | No, only non-invasive prep is allowed. |
| Can host line-cap extraction happen in parallel? | Only if it avoids state-authority files or extracts already-stable helpers. |
| Can ProductEnginePort be split now? | No, wait until state-authority API stabilizes. |
| Should native/background work proceed before state-authority is done? | Device evidence prep can proceed; native runtime contract changes should wait. |

---

## Shared ledger

Create or update:

```text
docs/product-core/product-core-parallel-optimization-ledger.md
```

Suggested format:

```md
# Product-Core Parallel Optimization Ledger

## Baseline

| Item | Status | Evidence |
|---|---|---|
| state-authority plan exists | pending | |
| web-ts untouched | pending | |
| CPU reports fresh | pending | |
| per-module CPU telemetry available | pending | |
| sonic render-metric gates available | pending | |
| host web-host gate status | pending | |
| native device evidence status | pending | |

## Batch status

| Batch | Parallel-safe? | Status | Validation | Notes |
|---|---:|---|---|---|
| 0 Baseline and ownership map | yes | pending | | |
| 1 CPU report freshness and publication | yes | pending | | |
| 2 Per-module CPU telemetry scaffolding | yes, with file limits | pending | | |
| 3 Sonic render-metric gate upgrade | yes, test-only first | pending | | |
| 4 Visual/debug telemetry throttling | yes, if UI-only | pending | | |
| 5 Shared gate harness cleanup | yes | pending | | |
| 6 Host line-cap extraction | limited | pending | | |
| 7 App shell non-invasive prep | limited | pending | | |
| 8 ProductEnginePort/WebProductEngine compression | wait | pending | | |
| 9 Final optimization signoff | after dependencies | pending | | |
```

---

# Batch 0 — Baseline and ownership map

## Parallel-safe?

Yes.

## Goal

Map what can be optimized in parallel without interfering with state-authority correctness work.

## Do not edit

```text
src/audio/reference/webTs/**
src/ui/useAudioEngineParamSync.ts
src/ui/useSelectedAudioEngineManualTriggers.ts
src/ui/usePresetEngineSync.ts
src/ui/useMorphSlotLoadRuntimeSurface.ts
src/ui/useMorphPositionRuntimeSurface.ts
src/ui/useSelectedAudioEngineSequencerControls.ts
src/audio/product/ProductEnginePort.ts
src/audio/product/WebProductEngine.ts
src/audio/coreProductEngineHost.ts
cpp/KesshoCore/src/product/sequencer/**
```

Those files are owned by the state-authority agents unless a later batch explicitly allows an edit.

## Work

Run:

```bash
git rev-parse --short HEAD
git status --short

npm run type-check
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run core:product:web-host
npm run core:product:granular-artifacts
npm run core:product:reverb-tail-quality
```

If a command fails, record it. Do not fix all failures in Batch 0.

Map current file sizes:

```bash
wc -l src/App.tsx
wc -l src/audio/coreProductEngineHost.ts
wc -l src/audio/product/ProductEnginePort.ts
wc -l src/audio/product/WebProductEngine.ts
find scripts -maxdepth 1 -name '*.mjs' -print | wc -l
```

Search for obvious optimization targets:

```bash
rg "setInterval|setTimeout|requestAnimationFrame|queueMicrotask|performance.now|telemetry|diagnostics|visual" src/audio src/ui scripts -g '*.{ts,tsx,mjs}'
rg "JSON.stringify|structuredClone|Object.entries|Object.keys|map\\(|filter\\(|reduce\\(" src/audio src/ui -g '*.{ts,tsx}'
rg "TODO\\(product-core|TODO\\(cpu|TODO\\(perf|TODO\\(host|compatibility|adapter" src/audio src/ui scripts docs -g '*.{ts,tsx,mjs,md}'
```

## Output

Add to the ledger:

```text
[ ] commands run
[ ] current failures
[ ] file sizes
[ ] parallel-safe file ownership map
[ ] blocked files owned by state-authority work
```

## Validation

```bash
npm run type-check
```

## Exit criteria

```text
[ ] web-ts untouched.
[ ] ownership map exists.
[ ] agents know which files are blocked by state-authority work.
[ ] baseline CPU/gate status is recorded.
```

---

# Batch 1 — CPU report freshness and publication

## Parallel-safe?

Yes.

## Goal

Make CPU evidence inspectable and fresh without changing product behavior.

## Scope

```text
scripts/check-kessho-product-cpu-budget.mjs
scripts/check-kessho-product-web-cpu-comparison.mjs
scripts/check-kessho-product-page-cpu-comparison.mjs
scripts/check-kessho-product-cpu-scenarios.mjs
docs/reports/**
docs/product-core/cpu-governor-policy.md
docs/product-core/product-core-parallel-optimization-ledger.md
```

## Do not edit

```text
state-authority files
DSP/render behavior
src/audio/reference/webTs/**
```

## Work

Run:

```bash
npm run core:product:cpu
npm run core:product:web-cpu-comparison
npm run core:product:page-cpu-comparison
npm run core:product:cpu-scenarios
```

Ensure these outputs exist or are generated:

```text
docs/reports/kessho-product-cpu-budget-latest.json
docs/reports/kessho-product-cpu-budget-latest.md
docs/reports/kessho-product-web-cpu-comparison-latest.json
docs/reports/kessho-product-page-cpu-comparison-latest.json
docs/reports/kessho-product-cpu-scenarios-latest.json
docs/reports/kessho-product-cpu-scenarios-latest.md
```

If the existing scripts generate reports somewhere else, document the actual path.

## Report requirements

Each CPU report should include:

```text
git commit
date/time
machine/platform
sample rate
block size
duration
scenario name
average CPU
p95 CPU
p99 CPU
max CPU
pass/fail
thresholds
top suspected modules if available
```

## No behavior changes

This batch is report-only unless a script has a path bug.

## Validation

```bash
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run type-check
```

## Exit criteria

```text
[ ] CPU reports are fresh.
[ ] report paths are known.
[ ] CPU scenario output is readable.
[ ] no product runtime behavior changed.
[ ] web-ts untouched except read-only A/B comparison scripts.
```

---

# Batch 2 — Per-module CPU telemetry scaffolding

## Parallel-safe?

Mostly yes, if it avoids state-authority-owned files.

## Goal

Add or prepare per-module CPU attribution so later optimization is targeted.

Do not change audio behavior in this batch. Only add measurement hooks, counters, and report plumbing.

## Scope

Prefer adding focused telemetry modules rather than editing hot state-authority files.

Suggested new files:

```text
src/audio/product/telemetry/ProductModuleCpuTelemetry.ts
src/audio/product/telemetry/ProductCpuTelemetryReporter.ts
src/audio/product/telemetry/ProductCpuTelemetryTypes.ts
scripts/check-kessho-product-module-cpu-report.mjs
docs/reports/kessho-product-module-cpu-latest.json
docs/reports/kessho-product-module-cpu-latest.md
```

If C++ timing is needed, coordinate with the DSP owner and keep it measurement-only.

## Module buckets

Track these buckets:

```text
sources
soundscapes / Earth
sequencer
granular
reverb
spectral freeze
delay
dynamics
visual telemetry
asset decode/register
worklet messaging
UI telemetry publication
native render callback, when available
```

## Implementation pattern

Create a lightweight utility:

```ts
export type ProductCpuModuleName =
  | 'sources'
  | 'soundscapes'
  | 'sequencer'
  | 'granular'
  | 'reverb'
  | 'spectral-freeze'
  | 'delay'
  | 'dynamics'
  | 'visual-telemetry'
  | 'assets'
  | 'worklet-messaging'
  | 'ui-telemetry';

export type ProductCpuModuleSample = {
  readonly module: ProductCpuModuleName;
  readonly averageMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly sampleCount: number;
};
```

If timing inside C++ render code is too risky, start with host/worklet-level attribution and add C++ module timers later.

## Important restrictions

```text
[ ] Do not allocate in the audio render callback.
[ ] Do not log every audio block.
[ ] Do not call performance.now() inside a realtime C++ render loop unless already acceptable in test-only builds.
[ ] Use ring buffers, counters, or aggregated block windows.
[ ] Make telemetry sampling optional and disabled by default for production if needed.
```

## Validation

```bash
npm run type-check
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run core:product:browser-runtime
```

## Exit criteria

```text
[ ] per-module CPU report structure exists.
[ ] at least host/worklet-level module attribution is available.
[ ] no audio behavior changes.
[ ] no realtime allocation/logging introduced.
[ ] web-ts untouched.
```

---

# Batch 3 — Sonic render-metric gate upgrade

## Parallel-safe?

Yes for script/test scaffolding. Product DSP fixes must coordinate with sonic/state owners.

## Goal

Upgrade granular and reverb gates from source-token/smoke checks to measured render-analysis gates.

This can run alongside state-authority if it only adds scripts/tests. Do not change DSP until state-authority behavior is stable, unless fixing a test harness bug.

## Scope

```text
scripts/check-kessho-product-granular-artifacts.mjs
scripts/check-kessho-product-reverb-tail-quality.mjs
scripts/product-core/lib/audioMetrics.mjs
docs/reports/kessho-product-granular-artifacts-latest.json
docs/reports/kessho-product-reverb-tail-quality-latest.json
```

## Add shared audio metrics helper

Create:

```text
scripts/product-core/lib/audioMetrics.mjs
```

Required helpers:

```js
export function maxAbs(samples) {}
export function maxSampleDelta(samples) {}
export function countNonFinite(samples) {}
export function rms(samples) {}
export function windowedRms(samples, windowSize) {}
export function detectImpulseBurst(samples, threshold) {}
export function estimateTailDecayCurve(samples, sampleRate) {}
export function assertBelow(name, value, threshold) {}
```

## Granular render metrics

Add cases:

```text
granular-silence
granular-steady-sine-dense
granular-impulse
granular-freeze-toggle
granular-buffer-resize-active
granular-reseed-active
granular-reverse-wrap
granular-dense-stress
```

For each case, report:

```text
maxAbs
maxSampleDelta
nonFiniteCount
rms
burstCount
cpuMs or renderMs if available
pass/fail
```

## Reverb render metrics

Add cases:

```text
reverb-impulse-long-tail
reverb-mode-transition-active-tail
reverb-quality-transition-active-tail
reverb-freeze-toggle
reverb-shimmer-tail
reverb-reverse-tail
reverb-low-frequency-buildup
reverb-denormal-tail
```

For each case, report:

```text
tailRmsCurve
maxSampleDelta
nonFiniteCount
lowFrequencyEnergyProxy if available
estimatedDecaySmoothness
cpuMs or renderMs if available
pass/fail
```

## Validation

```bash
npm run type-check
npm run core:product:granular-artifacts
npm run core:product:reverb-tail-quality
npm run core:product:cpu-scenarios
```

## Exit criteria

```text
[ ] granular gate produces numeric audio metrics.
[ ] reverb gate produces numeric audio metrics.
[ ] reports include CPU/render time where feasible.
[ ] no DSP behavior changed unless explicitly part of a separate sonic fix batch.
[ ] web-ts untouched except read-only A/B comparison if used.
```

---

# Batch 4 — Visual/debug telemetry throttling and coalescing

## Parallel-safe?

Yes if UI/diagnostics only. Avoid state-authority-owned trigger/control files.

## Goal

Reduce CPU and render churn from diagnostics, visual telemetry, runtime slider indicators, and debug panels.

This is often safe to do while correctness work continues because it should not change audio state.

## Scope

Likely areas:

```text
src/ui/**Diagnostics**
src/ui/**Telemetry**
src/ui/runtimeSliderState.ts
src/ui/earth/components/ActiveEarthMatrix.tsx
src/ui/earth/components/NatureSliceViz.tsx
src/audio/product/host/*Telemetry*
src/audio/product/host/*Diagnostics*
```

Avoid if state-authority agents are editing the same file.

## Work

### 4A — Central telemetry rate limits

Create constants:

```ts
export const PRODUCT_VISUAL_TELEMETRY_HZ = 30;
export const PRODUCT_BACKGROUND_VISUAL_TELEMETRY_HZ = 5;
export const PRODUCT_DEBUG_PANEL_HZ = 10;
export const PRODUCT_RUNTIME_SLIDER_HZ = 30;
```

If hidden/background:

```text
[ ] lower visual telemetry rate
[ ] pause expensive visualizers if not visible
[ ] keep essential diagnostics counters alive
```

### 4B — Coalesce callback publications

If multiple product telemetry callbacks fire per frame:

```text
[ ] batch updates into one animation frame
[ ] avoid setState storms
[ ] avoid publishing unchanged maps
[ ] reuse previous objects when values unchanged
```

### 4C — Avoid unnecessary object churn

Audit hot paths for:

```text
Object.entries(...)
Object.keys(...)
map/filter/reduce in render loops
large spread copies
JSON.stringify for equality checks
structuredClone in hot paths
```

Replace with memoized selectors or typed incremental updates where safe.

### 4D — Debug panels

```text
[ ] render debug panels only when open/visible
[ ] throttle heavy tables
[ ] avoid updating hidden visualizers at full rate
```

## Validation

```bash
npm run type-check
npm run test:mobile-web-hotpaths
npm run core:product:browser-runtime
npm run core:product:cpu-scenarios
```

## Exit criteria

```text
[ ] visual telemetry rate limits exist.
[ ] hidden/background UI lowers visual update rate.
[ ] debug panels do not update at audio/control rates.
[ ] no sound-affecting behavior changed.
[ ] web-ts untouched.
```

---

# Batch 5 — Shared gate/test harness cleanup

## Parallel-safe?

Yes.

## Goal

Reduce duplicated script boilerplate without changing product behavior.

## Scope

```text
scripts/product-core/lib/**
scripts/check-kessho-product-cpu-scenarios.mjs
scripts/check-kessho-product-granular-artifacts.mjs
scripts/check-kessho-product-reverb-tail-quality.mjs
scripts/check-kessho-product-background-audio-support.mjs
scripts/check-kessho-product-native-capability-signoff.mjs
scripts/check-product-docs-freshness.mjs
```

## Create shared helpers

```text
scripts/product-core/lib/reporting.mjs
scripts/product-core/lib/freshness.mjs
scripts/product-core/lib/packageScripts.mjs
scripts/product-core/lib/sourceTokens.mjs
scripts/product-core/lib/audioMetrics.mjs
scripts/product-core/lib/cpuReports.mjs
scripts/product-core/lib/deviceEvidence.mjs
```

## Helper responsibilities

### reporting.mjs

```js
writeJsonReport(path, data)
writeMarkdownReport(path, rows)
printPassFailSummary(rows)
```

### freshness.mjs

```js
readReportTimestamp(report)
assertFresh(report, maxAgeHours)
```

### packageScripts.mjs

```js
readPackageScripts()
assertPackageScript(name, expectedCommandSubstring)
```

### sourceTokens.mjs

```js
readFile(path)
assertToken(file, token)
assertNoToken(file, token)
```

### cpuReports.mjs

```js
readCpuBudgetReport()
readPageCpuComparisonReport()
readWebCpuComparisonReport()
summarizeCpuRows()
```

### deviceEvidence.mjs

```js
readDeviceEvidenceTable()
assertRequiredRowsPass()
```

## Important rule

Do not merge all gates into one giant script.

Keep separate commands:

```text
core:product:cpu-scenarios
core:product:granular-artifacts
core:product:reverb-tail-quality
core:product:background-audio
core:product:native-capability-signoff
migration:docs
```

Only share internal helpers.

## Validation

```bash
npm run type-check
npm run core:product:cpu-scenarios
npm run core:product:granular-artifacts
npm run core:product:reverb-tail-quality
npm run core:product:background-audio
npm run core:product:native-capability-signoff
npm run migration:docs
```

## Exit criteria

```text
[ ] shared helper library exists.
[ ] at least three product-core gate scripts use it.
[ ] gate outputs remain equivalent or stronger.
[ ] no product runtime behavior changed.
[ ] web-ts untouched.
```

---

# Batch 6 — Host line-cap extraction after state-authority stabilizes

## Parallel-safe?

Limited. Do not start broad host extraction until the state-authority API and running-sequencer tests are stable.

## Goal

Make `core:product:web-host` pass without weakening the line-count cap and without touching web-ts.

## Scope

```text
src/audio/coreProductEngineHost.ts
src/audio/product/host/**
scripts/check-kessho-product-web-host.mjs
```

Do not raise the cap unless explicitly approved.

## Work

First identify what grew:

```bash
wc -l src/audio/coreProductEngineHost.ts
git diff --stat
git diff -- src/audio/coreProductEngineHost.ts
```

Extract coherent services:

```text
CoreProductResolvedStateCommitService.ts
CoreProductStateRevisionTracker.ts
CoreProductRuntimeCallbackRegistry.ts
CoreProductSequencerCacheReconciliation.ts
CoreProductDrumMorphStateBridge.ts
CoreProductTriggerOrderingBridge.ts
CoreProductRunningSequencerDiagnostics.ts
CoreProductVisualTelemetryPublisher.ts
CoreProductDiagnosticsPublisher.ts
```

## Extraction rules

```text
[ ] Move code without behavior changes.
[ ] Keep public method names stable.
[ ] Add focused unit tests only if existing behavior is not covered.
[ ] Do not edit web-ts.
[ ] Do not change state-authority semantics.
[ ] Do not delete diagnostics needed by running-sequencer-live-updates.
```

## Validation

```bash
npm run type-check
npm run core:product:web-host
npm run core:product:host-reconciliation
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:running-sequencer-live-updates
```

## Exit criteria

```text
[ ] core:product:web-host passes.
[ ] coreProductEngineHost.ts is under the configured cap.
[ ] extracted modules are focused.
[ ] running-sequencer-live-updates still passes.
[ ] web-ts untouched.
```

---

# Batch 7 — App shell non-invasive prep

## Parallel-safe?

Limited. Safe only if it does not touch state-authority-owned hooks.

## Goal

Prepare for App.tsx reduction without changing sound/control semantics.

## Scope

Avoid these until state-authority gates pass:

```text
useAudioEngineParamSync
useSelectedAudioEngineManualTriggers
usePresetEngineSync
useMorphSlotLoadRuntimeSurface
useMorphPositionRuntimeSurface
useSelectedAudioEngineSequencerControls
```

Safe extraction candidates:

```text
diagnostics panel
static layout sections
background-audio status panel
report/status display
pure visual components
non-sound-affecting UI grouping
```

## Work

Extract pure components only:

```text
AppDiagnosticsPanel
AppBackgroundAudioStatus
AppReportStatusPanel
AppLayoutShell
AppVisualTelemetryPanel
```

No behavior changes.

## Validation

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
npm run core:product:browser-runtime
```

## Exit criteria

```text
[ ] App.tsx is smaller.
[ ] no sound/control hook behavior changed.
[ ] state-authority hooks untouched.
[ ] web-ts untouched.
```

---

# Batch 8 — ProductEnginePort / WebProductEngine compression

## Parallel-safe?

No. Wait until state-authority API is stable.

## Goal

Reduce adapter and callback boilerplate after correctness is proven.

## Do not start until

```text
[ ] core:product:running-sequencer-live-updates passes.
[ ] applySequencerUiPatch cleanup status is known.
[ ] commitResolvedState API is stable or intentionally not used.
```

## Work

Split ProductEnginePort into capability surfaces:

```text
ProductEngineLifecyclePort
ProductEngineCommandPort
ProductEngineControlPort
ProductEngineTelemetryPort
ProductEngineModulationPort
ProductEngineSequencerPort
ProductEngineDiagnosticsPort
ProductEngineAssetPort
```

Replace one-off callbacks with typed subscriptions where feasible:

```ts
productEngine.telemetry.subscribe(topic, callback)
productEngine.modulation.subscribe(topic, callback)
productEngine.diagnostics.subscribe(callback)
productEngine.controls.dispatch(command)
```

Compress WebProductEngine mirror methods:

```text
[ ] delegate by capability
[ ] reduce one-off setter mirroring
[ ] remove obsolete compatibility TODOs
[ ] keep native implementation needs in mind
```

## Validation

```bash
npm run type-check
npm run core:product:architecture
npm run core:product:web-host
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:running-sequencer-live-updates
```

## Exit criteria

```text
[ ] ProductEnginePort is capability-oriented.
[ ] WebProductEngine is thinner.
[ ] native implementation surface is simpler.
[ ] no state-authority regression.
[ ] web-ts untouched.
```

---

# Final combined validation

Run after all safe parallel and blocked cleanup batches that are in scope.

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:reference-isolation
npm run core:product:architecture
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:browser-runtime
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run core:product:granular-artifacts
npm run core:product:reverb-tail-quality
npm run core:product:running-sequencer-live-updates
npm run migration:runtime-production-gates
npm run core:product:web-host
npm run migration:docs
```

If native/background work is in scope:

```bash
npm run core:product:background-audio
npm run core:product:native-render-path
npm run core:product:native-background-smoke
npm run core:product:native-capability-signoff
```

---

# Parallel-agent assignment

## Agent A — State-authority owner

Owns the main state-authority plan.

Do not run optimization edits in these files without Agent A coordination:

```text
useAudioEngineParamSync
useSelectedAudioEngineManualTriggers
usePresetEngineSync
useMorphSlotLoadRuntimeSurface
useMorphPositionRuntimeSurface
useSelectedAudioEngineSequencerControls
ProductEnginePort
WebProductEngine
coreProductEngineHost
Product sequencer C++ files
```

## Agent B — CPU evidence owner

Can start immediately.

Owns:

```text
Batch 1
Batch 2
CPU reports
CPU scenario script
per-module CPU telemetry scaffolding
```

Must not change sound/control behavior.

## Agent C — Sonic gate owner

Can start test scaffolding immediately.

Owns:

```text
Batch 3
granular artifact report metrics
reverb tail report metrics
audioMetrics helper
```

Must coordinate before making DSP changes.

## Agent D — UI telemetry optimization owner

Can start after Batch 0.

Owns:

```text
Batch 4
visual/debug telemetry throttling
debug panel coalescing
hidden/background visual rate reduction
```

Must avoid state-authority hooks.

## Agent E — Script harness owner

Can start immediately.

Owns:

```text
Batch 5
shared script helpers
report/freshness/package/token utilities
```

Must preserve or strengthen gates.

## Agent F — Host/App cleanup owner

Starts later.

Owns:

```text
Batch 6 after state-authority stabilizes
Batch 7 safe App extraction
Batch 8 after state-authority signoff
```

---

# Required report format

Every agent must report in this format:

```text
Batch:
- <batch number and name>

Agent:
- <agent id/name>

Changed files:
- ...

State-authority files touched:
- no
- if yes, list and explain coordination

web-ts touched:
- no
- if yes, stop and explain before continuing

Behavior changes:
- none
- or explicit list

CPU impact:
- none measured
- or report path and summary

Validation run:
- command: pass/fail
- command: pass/fail

Manual/audio/device tests:
- test: pass/fail/not run, reason

Batch exit criteria:
- complete/incomplete
- remaining blockers if incomplete

Parallel coordination notes:
- files/areas other agents should avoid
- dependencies resolved or pending

Next batch:
- ...
```

---

# Recommended immediate order

```text
1. Agent A continues state-authority plan.
2. Agent B starts Batch 1 CPU report freshness.
3. Agent C starts Batch 3 sonic render-metric scaffolding.
4. Agent E starts Batch 5 shared script helpers.
5. Agent D starts Batch 4 only if it avoids state-authority hooks.
6. Agent F waits on broad host/App/port cleanup until state-authority stabilizes.
```

---

# Summary for weaker coding agents

Do this:

```text
- Work only in your assigned batch.
- Do not touch web-ts.
- Do not touch state-authority files unless your batch says so.
- Add reports, metrics, throttles, and helpers first.
- Do not change sound behavior from CPU batches.
- Run the exact validation commands listed.
- If a validation fails, record it before guessing.
```

Do not do this:

```text
- Do not change sequencer logic from a CPU batch.
- Do not change morph/preset logic from a CPU batch.
- Do not edit web-ts.
- Do not remove tests to make gates pass.
- Do not raise line caps.
- Do not combine all scripts into one giant script.
```
